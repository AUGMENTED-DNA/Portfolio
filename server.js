const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync, spawn } = require('child_process');
const idx  = require('./indexer');
const { queryOutstanding } = require('./outstanding');
const { withCompletion }   = require('./completion');

const PORT = 4040;
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.md':   'text/markdown',
};

// Orbital project display-name -> repo path. This is the project set the
// work-history page draws from (only those with real session records appear).
const NAME_TO_PATH = {
  'Email Agent':       '/home/dmcneill/Projects/Email_Agent',
  'Todoist Agent':     '/home/dmcneill/Projects/Todoist_Agent',
  'Health':            '/home/dmcneill/Projects/Health',
  'Spinners':          '/home/dmcneill/Projects/Spinners',
  'Aphorism':          '/home/dmcneill/Projects/Aphorism',
  'YT':                '/home/dmcneill/Projects/YT',
  'Handyman':          '/home/dmcneill/Projects/Handyman',
  'Meissler News':     '/home/dmcneill/Projects/Meissler_News',
  'CCBridge':          '/home/dmcneill/Projects/CCBridge',
  'FINANCIAL':         '/home/dmcneill/Projects/FINANCIAL',
  'Hub-Bridge':        '/home/dmcneill/Projects/Hub-Bridge',
  'Utilities':         '/home/dmcneill/Projects/Utilities',
  'Content-Converter': '/home/dmcneill/Projects/Content-Converter',
  'Council':           '/home/dmcneill/Projects/Council',
  'Portfolio':         '/home/dmcneill/Projects/Portfolio',
  'PAI Visual':        '/home/dmcneill/Projects/PAI_Visual',
  'PAI GUI':           '/home/dmcneill/Projects/PAI_GUI',
  'MissionControl':    '/home/dmcneill/Projects/MissionControl',
  'TheVault':          '/home/dmcneill/Projects/TheVault',
  'SessionRelauncher': '/home/dmcneill/Projects/SessionRelauncher',
};

// ─── Session-records work history ──────────────────────────────────────────────
// Claude Code stores one .jsonl transcript per session under
// ~/.claude/projects/<slug>/ . The topic of a session is its auto-generated
// `aiTitle`; we fall back to the final prompt, then the session id.
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const SESSION_CAP  = 60;            // most-recent sessions surfaced per project
const CACHE_MS     = 5 * 60 * 1000; // session parsing is heavier; cache a few minutes
const _cache       = new Map();

function cached(key, fn) {
  const hit = _cache.get(key);
  const now = Date.now();
  if (hit && now - hit.t < CACHE_MS) return hit.data;
  const data = fn();
  _cache.set(key, { t: now, data });
  return data;
}

// The slug is the repo path with separators flattened to '-'. Some encodings
// also flatten '_' and '.', so try both and use whichever directory exists.
function sessionDirFor(repoPath) {
  const candidates = [
    repoPath.replace(/\//g, '-'),
    repoPath.replace(/[/._]/g, '-'),
  ];
  for (const c of candidates) {
    const d = path.join(PROJECTS_DIR, c);
    try { if (fs.statSync(d).isDirectory()) return d; } catch { /* not this one */ }
  }
  return null;
}

function sessionFiles(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names
    .filter((n) => n.endsWith('.jsonl'))
    .map((n) => {
      const f = path.join(dir, n);
      let mtime = 0, size = 0;
      try { const st = fs.statSync(f); mtime = st.mtimeMs; size = st.size; } catch { /* skip */ }
      return { file: f, id: n.replace(/\.jsonl$/, ''), mtime, size };
    })
    .sort((a, b) => b.mtime - a.mtime);   // newest first
}

function fmtDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Pull a human topic from a session file without loading the whole transcript:
// grep -m1 stops at the first matching line, so huge files stay cheap.
function sessionTopic(file, id) {
  const grab = (needle) => {
    try {
      const line = execFileSync('grep', ['-m1', '-h', needle, file],
        { encoding: 'utf8', maxBuffer: 1 << 20 }).trim();
      return line ? JSON.parse(line) : null;
    } catch { return null; }
  };
  const t = grab('"aiTitle"');
  if (t && t.aiTitle) return String(t.aiTitle).trim();
  const p = grab('"lastPrompt"');
  if (p && p.lastPrompt) {
    const s = String(p.lastPrompt).replace(/\s+/g, ' ').trim();
    return s.length > 90 ? s.slice(0, 90) + '…' : s;
  }
  return `(untitled session ${id.slice(0, 8)})`;
}

// ── Transcript extraction (local, no external calls) ──────────────────────────
function grep1(file, pat) {
  try { return execFileSync('grep', ['-m1', '-h', pat, file], { encoding: 'utf8', maxBuffer: 1 << 20 }).trim(); }
  catch { return ''; }
}
function grepAll(file, pat, fixed) {
  try {
    const a = ['-h']; if (fixed) a.push('-F'); a.push(pat, file);
    return execFileSync('grep', a, { encoding: 'utf8', maxBuffer: 4 << 20 }).split('\n').filter(Boolean);
  } catch { return []; }
}
function msgText(line) {
  try {
    const o = JSON.parse(line);
    let c = (o.message && o.message.content) != null ? o.message.content : o.content;
    if (Array.isArray(c)) c = c.map((p) => (p && p.text) ? p.text : '').join(' ');
    return String(c || '').replace(/\s+/g, ' ').trim();
  } catch { return ''; }
}
const clip = (s, n) => { s = (s || '').trim(); return s.length > n ? s.slice(0, n).trimEnd() + '…' : s; };

// Action = the first genuine user request, skipping hook-injected / meta lines.
function sessionAction(file) {
  const SKIP = /Does this user response indicate|^CONTEXT:|system-reminder|PAI ALGORITHM|Banned Phrase|FORK →|local-command|<command-/i;
  const lines = grepAll(file, '"type":"user"', false).slice(0, 12);
  for (const ln of lines) {
    const t = msgText(ln);
    if (t && t.length > 3 && !SKIP.test(t)) return clip(t, 140);
  }
  return clip(msgText(lines[0] || ''), 140);
}

// Status = the session's final 🗣️ SOL outcome line (fallback: last assistant turn).
function sessionStatus(file) {
  const sol = grepAll(file, '🗣️ SOL:', true);
  if (sol.length) {
    const m = msgText(sol[sol.length - 1]).match(/🗣️\s*SOL:\s*(.+)$/);
    if (m) return clip(m[1], 140);
  }
  const a = grepAll(file, '"type":"assistant"', false);
  if (a.length) { const t = msgText(a[a.length - 1]); if (t) return clip(t, 140); }
  return '';
}

// Latest version tag for a project repo (e.g. "v2.8"); '' if untagged/not a repo.
function gitTag(repo) {
  try {
    return execFileSync('git', ['-C', repo, 'describe', '--tags', '--abbrev=0'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}

// ── Date-range filtering ──────────────────────────────────────────────────────
// from/to are 'YYYY-MM-DD' (local time); an absent bound is open-ended. We gate
// on each session file's mtime, which approximates when that work last happened.
function rangeBounds(from, to) {
  const dayMs = 24 * 60 * 60 * 1000;
  const lo = from ? Date.parse(from + 'T00:00:00') : -Infinity;
  const hi = to   ? Date.parse(to   + 'T00:00:00') + dayMs : Infinity;   // inclusive end-day
  return { lo, hi };
}
function filesInRange(files, b) {
  return files.filter((f) => f.mtime >= b.lo && f.mtime < b.hi);
}

// GET /api/work-history[?from=&to=]
//   -> { projects:[{name,version,sessions,lastActive}], appVersion, filtered, from, to }
// With no range, every canonical project is listed (0-session ones included) so the
// nav count matches the display count. With a range, only projects worked in that
// window appear — this drives the left-rail "projects worked yesterday" view.
function projectList(range) {
  const filtered = !!(range.from || range.to);
  const b = rangeBounds(range.from, range.to);
  return cached(`list:${range.from || ''}:${range.to || ''}`, () => {
    const projects = [];
    for (const [name, repo] of Object.entries(NAME_TO_PATH)) {
      const dir   = sessionDirFor(repo);
      let files   = dir ? sessionFiles(dir) : [];
      if (filtered) files = filesInRange(files, b);
      if (filtered && !files.length) continue;          // hide projects idle in this window
      projects.push({
        name,
        version: gitTag(repo),
        sessions: files.length,
        lastActive: files.length ? fmtDate(files[0].mtime) : '',
      });
    }
    projects.sort((a, b2) => (a.lastActive < b2.lastActive ? 1 : -1));   // active first, 0-session last
    return { projects, appVersion: gitTag(NAME_TO_PATH['Portfolio']), filtered, from: range.from || '', to: range.to || '' };
  });
}

// GET /api/work-history?project=NAME
//   -> { name, version, total, shown, sessions:[{date, topic, action, status, id}] }
// Each row is Topic -> Action taken -> Final status. Duplicate session records
// (same minute + same topic, e.g. one prompt spawning several near-empty files)
// are collapsed to the single richest session.
function projectSessions(name, range) {
  const filtered = !!(range.from || range.to);
  const b = rangeBounds(range.from, range.to);
  return cached(`proj:${name}:${range.from || ''}:${range.to || ''}`, () => {
    const repo = NAME_TO_PATH[name];
    const dir  = repo ? sessionDirFor(repo) : null;
    const out  = { name, path: dir, version: repo ? gitTag(repo) : '', total: 0, shown: 0, sessions: [], filtered, from: range.from || '', to: range.to || '' };
    if (!dir) return out;
    let files = sessionFiles(dir);
    if (filtered) files = filesInRange(files, b);
    out.total = files.length;
    const top = files.slice(0, SESSION_CAP).map((f) => ({ ...f, topic: sessionTopic(f.file, f.id) }));

    // Collapse same-minute + same-topic duplicates, keeping the largest file.
    const groups = new Map();
    for (const f of top) {
      const key = fmtDate(f.mtime).slice(0, 16) + '|' + f.topic;   // "YYYY-MM-DD HH:MM|topic"
      const g = groups.get(key);
      if (!g || f.size > g.size) groups.set(key, f);
    }
    const deduped = [...groups.values()].sort((a, b) => b.mtime - a.mtime);
    // Drop pure hook/meta sessions (approval-checks, context-only resumes): if the
    // best Action we can find is still boilerplate, there was no genuine user request.
    const META = /Does this user response indicate|^CONTEXT:|system-reminder|PAI ALGORITHM|Banned Phrase|FORK →|local-command|<command-/i;
    out.sessions = deduped
      .map((f) => ({
        date: fmtDate(f.mtime),
        topic: f.topic,
        action: sessionAction(f.file),
        status: sessionStatus(f.file),
        committed: sessionCommitted(f.file),
        id: f.id,
      }))
      .filter((r) => r.action && r.action.length > 3 && !META.test(r.action));
    out.shown = out.sessions.length;
    return out;
  });
}

// The session's commit line if any ("…Committed … v3.2 …"); '' otherwise.
function sessionCommitted(file) {
  const lines = grepAll(file, 'Committed', false);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = msgText(lines[i]).match(/Committed[^.]*?v\d+\.\d+[^.]*/i);
    if (m) return clip(m[0], 160);
  }
  return '';
}

// GET /api/work-history?scope=all[&from=&to=]  → every project's sessions,
// each row tagged with its project + version, newest first, capped at 300.
function allProjects(range) {
  return cached(`all:${range.from || ''}:${range.to || ''}`, () => {
    const filtered = !!(range.from || range.to);
    const rows = [];
    for (const name of Object.keys(NAME_TO_PATH)) {
      const ps = projectSessions(name, range);
      for (const s of ps.sessions) rows.push({ ...s, project: name, version: ps.version });
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));   // newest first
    const shown = rows.slice(0, 300);
    return { scope: 'all', filtered, from: range.from || '', to: range.to || '',
             total: rows.length, shown: shown.length, sessions: shown };
  });
}

// ── v4.2: response cache for the work-history API ────────────────────────────
// MEASURED: a bare /api/work-history took 11.9s. It is not gitTag (389ms for all
// 29 repos) — it is indexer.js refreshProjects(), which calls ensureIndex(TRUE)
// and so forces a full re-index of every session record on EVERY request,
// deliberately bypassing the _built guard. That file's comment says the walk is
// "cheap once warm"; it is not. Caching here keeps repeat navigation instant
// without editing indexer.js.
const _apiCache = new Map();                 // key → { at, body }
const API_TTL_MS = 60_000;
function cachedJSON(key, produce) {
  const hit = _apiCache.get(key);
  if (hit && Date.now() - hit.at < API_TTL_MS) return hit.body;
  const body = JSON.stringify(produce());
  _apiCache.set(key, { at: Date.now(), body });
  return body;
}

// The live project list — registry + session dirs, via the indexer — with each
// project's completion percentage attached. Deliberately NOT named projectList:
// that name is taken by a legacy orbital-era function above that reads the
// hardcoded NAME_TO_PATH map in this file, and routing here by accident is
// exactly how a "live" list silently goes stale.
function projectListWithCompletion(range) {
  const r = idx.queryProjects(range);
  return { ...r, projects: withCompletion(r.projects) };
}

// ── v4.2: open a project folder in a new Claude Code session ─────────────────
// Launches a NEW Windows Terminal; `claude` is never run inline, because the
// CLAUDECODE env var blocks nested sessions.
// SECURITY: the project name is looked up in the indexer's own NAME_TO_PATH map
// and anything not already in that map is refused — the request never supplies
// a path, so a crafted body cannot make this run somewhere else. The server is
// also bound to 127.0.0.1 (see listen below), so this is unreachable off-box.
// GOTCHA (cost a false success): `wsl.exe -- claude` does NOT work. Launching
// through wsl.exe yields a PATH without ~/.local/bin — even via `bash -lc` —
// so `claude` is not found, the tab dies instantly, and spawn() still reports
// success because it only throws on a synchronous failure. Resolve the binary
// to an absolute path once at startup and hand wsl.exe that.
let _claudeBin = '';
try { _claudeBin = execFileSync('bash', ['-lc', 'command -v claude'], { encoding: 'utf8' }).trim(); }
catch { /* resolved lazily below; reported honestly if still missing */ }

function openInClaude(name) {
  const dir = (idx.NAME_TO_PATH || {})[name];
  if (!dir) return { ok: false, error: 'Unknown project: ' + name };
  if (!fs.existsSync(dir)) return { ok: false, error: 'Folder no longer exists: ' + dir };
  if (!_claudeBin || !fs.existsSync(_claudeBin)) {
    return { ok: false, error: 'Could not find the claude binary on this machine' };
  }
  try {
    const child = spawn('wt.exe',
      ['-w', '0', 'nt', '--title', 'Claude — ' + name, 'wsl.exe', '--cd', dir, '--', _claudeBin],
      { detached: true, stdio: 'ignore' });
    // spawn() reports launch failures asynchronously; without this the button
    // would say "Opened" for a terminal that never appeared.
    child.on('error', (e) => console.error('[open-in-claude] launch failed:', e.message));
    child.unref();
    return { ok: true, project: name, dir };
  } catch (e) {
    return { ok: false, error: 'Could not launch Windows Terminal: ' + e.message };
  }
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  // JSON API: outstanding work items, grouped by project, tagged by owner.
  if (u.pathname === '/api/outstanding') {
    const owner = u.searchParams.get('owner') || 'all';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(queryOutstanding(owner)));
    return;
  }

  // Launch a Claude Code session in a project folder. POST only — this starts a
  // process, so it must not be reachable by a plain link or an <img> tag.
  if (u.pathname === '/api/open-in-claude') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json', 'Allow': 'POST' });
      res.end(JSON.stringify({ ok: false, error: 'POST required' }));
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 2048) req.destroy(); });
    req.on('end', () => {
      let name = '';
      try { name = String(JSON.parse(body || '{}').project || ''); } catch { /* bad JSON → unknown project */ }
      const out = openInClaude(name);
      res.writeHead(out.ok ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
    return;
  }

  // JSON API: hand-entered project ranking (1 = highest). GET returns the saved
  // order; POST replaces it wholesale with an ordered array of project names.
  if (u.pathname === '/api/priorities') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 1e6) { req.destroy(); }        // ranking payloads are tiny
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const order  = Array.isArray(parsed) ? parsed : parsed.order;
          const saved  = idx.setPriorities(order || []);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, priorities: saved }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
        }
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ priorities: idx.getPriorities() }));
    return;
  }

  // JSON API: session-records work history. Early-return before static files.
  //
  // The bare project list is the one response the V1 table also consumes, so
  // it is the single place completion percentages are attached — computing
  // them in two apps is how the two lists drifted apart in the first place.
  if (u.pathname === '/api/work-history') {

    const name   = decodeURIComponent(u.searchParams.get('project') || '');
    const effort = u.searchParams.get('effort') || '';
    // v4.12: `limit` lets the page ask for more than the default cap once it has
    // told you a cap was applied. Clamped inside queryRollup, not here.
    const range  = { from: u.searchParams.get('from') || '', to: u.searchParams.get('to') || '',
                     limit: u.searchParams.get('limit') || '' };
    const scope  = u.searchParams.get('scope') || '';
    const body = cachedJSON(u.pathname + '?' + u.searchParams.toString(), () =>
                    effort          ? idx.queryEffort(effort)            // Phase-2 drill-down
                  : scope === 'all' ? idx.queryRollup(range)             // all projects
                  : name            ? idx.queryProject(name, range)      // one project
                  :                   projectListWithCompletion(range));  // project list
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
    return;
  }

  const reqPath = u.pathname;
  let filePath = path.join(__dirname, 'public', reqPath === '/' ? 'index.html' : reqPath);
  // also serve root-level files (manifest, sw, app.js, etc.)
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, reqPath === '/' ? 'index.html' : reqPath.slice(1));
  }
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
// v4.2 SECURITY: bind loopback only. This previously called .listen(PORT) with
// no host, which binds 0.0.0.0 — every interface on the network. That was
// already too open for a page that exposes your whole session history, and it
// is unacceptable now that /api/open-in-claude can start a process.
}).listen(PORT, '127.0.0.1', () => console.log(`PAI Launcher → http://127.0.0.1:${PORT}`));

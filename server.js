const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

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
  'Email Agent':       '/mnt/c/Users/dmcneill/Projects/Email_Agent',
  'Todoist Agent':     '/mnt/c/Users/dmcneill/Projects/Todoist_Agent',
  'Health':            '/mnt/c/Users/dmcneill/Projects/Health',
  'Spinners':          '/mnt/c/Users/dmcneill/Projects/Spinners',
  'Aphorism':          '/mnt/c/Users/dmcneill/Projects/Aphorism',
  'YT':                '/mnt/c/Users/dmcneill/Projects/YT',
  'Handyman':          '/mnt/c/Users/dmcneill/Projects/Handyman',
  'Meissler News':     '/mnt/c/Users/dmcneill/Projects/Meissler_News',
  'CCBridge':          '/mnt/c/Users/dmcneill/Projects/CCBridge',
  'FINANCIAL':         '/mnt/c/Users/dmcneill/Projects/FINANCIAL',
  'Hub-Bridge':        '/mnt/c/Users/dmcneill/Projects/Hub-Bridge',
  'Utilities':         '/mnt/c/Users/dmcneill/Projects/Utilities',
  'Content-Converter': '/mnt/c/Users/dmcneill/Projects/Content-Converter',
  'Council':           '/mnt/c/Users/dmcneill/Projects/Council',
  'Portfolio':         '/mnt/c/Users/dmcneill/Projects/Portfolio',
  'PAI Visual':        '/mnt/c/Users/dmcneill/Projects/PAI_Visual',
  'PAI GUI':           '/mnt/c/Users/dmcneill/Projects/PAI_GUI',
};

// ─── Session-records work history ──────────────────────────────────────────────
// Claude Code stores one .jsonl transcript per session under
// ~/.claude/projects/<slug>/ . The topic of a session is its auto-generated
// `aiTitle`; we fall back to the final prompt, then the session id.
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const SESSION_CAP  = 60;            // most-recent sessions surfaced per project
const CACHE_MS     = 30 * 1000;     // brief cache so repeated views stay snappy
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
      let mtime = 0;
      try { mtime = fs.statSync(f).mtimeMs; } catch { /* skip */ }
      return { file: f, id: n.replace(/\.jsonl$/, ''), mtime };
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

// Latest version tag for a project repo (e.g. "v2.8"); '' if untagged/not a repo.
function gitTag(repo) {
  try {
    return execFileSync('git', ['-C', repo, 'describe', '--tags', '--abbrev=0'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}

// GET /api/work-history  ->  { projects: [{name, version, sessions, lastActive}], appVersion }
// All canonical projects are listed (0-session ones included) so the nav count
// always matches the display count.
function projectList() {
  return cached('list', () => {
    const projects = [];
    for (const [name, repo] of Object.entries(NAME_TO_PATH)) {
      const dir   = sessionDirFor(repo);
      const files = dir ? sessionFiles(dir) : [];
      projects.push({
        name,
        version: gitTag(repo),
        sessions: files.length,
        lastActive: files.length ? fmtDate(files[0].mtime) : '',
      });
    }
    projects.sort((a, b) => (a.lastActive < b.lastActive ? 1 : -1));   // active first, 0-session last
    return { projects, appVersion: gitTag(NAME_TO_PATH['Portfolio']) };
  });
}

// GET /api/work-history?project=NAME -> { name, total, shown, sessions:[{date,topic,id}] }
function projectSessions(name) {
  return cached(`proj:${name}`, () => {
    const repo = NAME_TO_PATH[name];
    const dir  = repo ? sessionDirFor(repo) : null;
    const out  = { name, path: dir, version: repo ? gitTag(repo) : '', total: 0, shown: 0, sessions: [] };
    if (!dir) return out;
    const files = sessionFiles(dir);
    out.total = files.length;
    const top = files.slice(0, SESSION_CAP);
    out.shown = top.length;
    out.sessions = top.map((f) => ({ date: fmtDate(f.mtime), topic: sessionTopic(f.file, f.id), id: f.id }));
    return out;
  });
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  // JSON API: session-records work history. Early-return before static files.
  if (u.pathname === '/api/work-history') {
    const name = decodeURIComponent(u.searchParams.get('project') || '');
    const payload = name ? projectSessions(name) : projectList();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
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
}).listen(PORT, () => console.log(`PAI Launcher → http://localhost:${PORT}`));

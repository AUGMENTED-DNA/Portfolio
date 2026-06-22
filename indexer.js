// indexer.js — SQLite-backed Work History index.
// Scans Claude Code session transcripts, extracts a structured "work effort"
// per session via zero-token marker parsing (no AI), and stores it in SQLite
// for fast date/project queries. Incremental: a session is re-parsed only when
// its transcript's mtime+size changed, so repeat builds cost almost nothing.

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

// Project display-name -> repo path (same canonical set the launcher uses).
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
  'MissionControl':    '/mnt/c/Users/dmcneill/Projects/MissionControl',
  'TheVault':          '/mnt/c/Users/dmcneill/Projects/TheVault',
};

const PROJECTS_DIR  = path.join(os.homedir(), '.claude', 'projects');
const DB_PATH       = path.join(__dirname, 'work-history.db');
const PER_PROJECT_CAP = 120;   // most-recent sessions indexed per project

// ── DB init ──────────────────────────────────────────────────────────────────
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS work_efforts (
    id TEXT PRIMARY KEY, project TEXT, date TEXT, mtime INTEGER, size INTEGER,
    topic TEXT, version TEXT, requested TEXT, produced TEXT, issues TEXT,
    evaluation TEXT, eval_ok INTEGER, item_count INTEGER
  );
  CREATE TABLE IF NOT EXISTS functional_items (effort_id TEXT, seq INTEGER, kind TEXT, text TEXT);
  CREATE TABLE IF NOT EXISTS exchanges (effort_id TEXT, seq INTEGER, role TEXT, text TEXT);
  CREATE INDEX IF NOT EXISTS idx_eff_date  ON work_efforts(date);
  CREATE INDEX IF NOT EXISTS idx_eff_proj  ON work_efforts(project);
  CREATE INDEX IF NOT EXISTS idx_items_eff ON functional_items(effort_id);
  CREATE INDEX IF NOT EXISTS idx_exch_eff  ON exchanges(effort_id);
`);

// ── file/transcript helpers ──────────────────────────────────────────────────
function sessionDirFor(repoPath) {
  for (const c of [repoPath.replace(/\//g, '-'), repoPath.replace(/[/._]/g, '-')]) {
    const d = path.join(PROJECTS_DIR, c);
    try { if (fs.statSync(d).isDirectory()) return d; } catch { /* next */ }
  }
  return null;
}
function sessionFiles(dir) {
  let names; try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter((n) => n.endsWith('.jsonl')).map((n) => {
    const f = path.join(dir, n); let mtime = 0, size = 0;
    try { const st = fs.statSync(f); mtime = st.mtimeMs; size = st.size; } catch { /* skip */ }
    return { file: f, id: n.replace(/\.jsonl$/, ''), mtime, size };
  }).sort((a, b) => b.mtime - a.mtime);
}
function fmtDate(ms) {
  if (!ms) return '';
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
// grep -a so binary-flagged transcripts still yield their matching lines.
function grepAll(file, pat, fixed) {
  try {
    const a = ['-ah']; if (fixed) a.push('-F'); a.push(pat, file);
    return execFileSync('grep', a, { encoding: 'utf8', maxBuffer: 16 << 20 }).split('\n').filter(Boolean);
  } catch { return []; }
}
function grepRe(file, pat) {
  try { return execFileSync('grep', ['-ahE', pat, file], { encoding: 'utf8', maxBuffer: 16 << 20 }).split('\n').filter(Boolean); }
  catch { return []; }
}
// Whole transcript as one string (for fast in-memory membership tests).
function fileBlob(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
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
function gitTag(repo) {
  if (!repo) return '';
  try { return execFileSync('git', ['-C', repo, 'describe', '--tags', '--abbrev=0'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}
// Recent commit subjects for a repo (memoized — same list for every session in it).
const _subsCache = {};
function gitSubjects(repo) {
  if (!repo) return [];
  if (_subsCache[repo]) return _subsCache[repo];
  try {
    const r = execFileSync('git', ['-C', repo, 'log', '-n', '120', '--pretty=%s', '--no-merges'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').map((s) => s.trim()).filter(Boolean);
    return (_subsCache[repo] = r);
  } catch { return (_subsCache[repo] = []); }
}
function sessionTopic(file, id, requested) {
  const t = grepAll(file, '"aiTitle"', false)[0];
  if (t) { try { const o = JSON.parse(t); if (o.aiTitle) return String(o.aiTitle).trim(); } catch { /* */ } }
  if (requested && requested.length) return clip(requested[0], 70);   // fall back to the real ask
  return `(untitled ${id.slice(0, 8)})`;
}

// ── zero-token extraction (parses PAI's own structured markers) ───────────────
const META    = /Does this user response indicate|^CONTEXT:|system-reminder|PAI ALGORITHM|Banned Phrase|FORK →|local-command|<command-|caveat:|Your questions have been answered|task-notification|tool-use-id|toolu_[A-Za-z0-9]|\[Request interrupted|Background command|output completed Agent|automated background|\/tmp\/claude-/i;
const TRIVIAL = /^(continue|go|yes|no|ok|okay|y|n|retry|continue retry|next|proceed|do it|S\d)\b[.!\s]*$/i;
// App-internal agent/system prompts (e.g. Council's multi-agent role prompts)
// captured as "user" turns — these are not Dane's genuine work requests.
const SYNTHETIC = /^(You are\b|You're (an?|the)\b|Act(ing)? as\b|Respond (only|with)\b|Output only\b|Given the following\b|You will be\b)/i;
// Code-looking text — skip so the indexer never matches its OWN source while
// indexing this very repo's transcripts (the self-pollution bug).
const CODEY = /[`{}]|=>|\);|\$\{|\.\w+\(|===|!==/;

// Requested: genuine user prompts (skip continuations / approval echoes / meta /
// app-internal agent prompts).
function extractRequested(file) {
  const out = [];
  for (const ln of grepAll(file, '"type":"user"', false)) {
    const t = msgText(ln);
    if (!t || t.length < 8 || META.test(t) || TRIVIAL.test(t) || SYNTHETIC.test(t)) continue;
    out.push(clip(t, 220));
    if (out.length >= 6) break;
  }
  return out;
}
// Produced: real git commit subjects made DURING this session. A commit "belongs"
// to this effort only if its subject text appears in this transcript (the commit
// was made in this session, so its subject is here). Authoritative (real commits),
// correctly scoped (per-session), and immune to prose bleed — we only ever
// consider THIS project's real commits, so another project's version can't leak in.
function extractProduced(file, repo) {
  const subs = gitSubjects(repo);
  if (subs.length) {
    const blob = fileBlob(file), out = [], seen = new Set();
    for (const s of subs) {
      const probe = s.slice(0, 32);
      if (probe.length >= 8 && blob.includes(probe)) {
        const c = clip(s, 130);
        if (!seen.has(c)) { seen.add(c); out.push(c); }
      }
      if (out.length >= 10) break;
    }
    if (out.length) return out;
  }
  return producedFallback(file);   // nothing committed yet → what the session built
}
// Fallback: clean conventional-commit subjects the session proposed (work built
// but not necessarily committed). Cut at the first backtick/quote so fenced code
// echoes can't trail in.
function producedFallback(file) {
  const out = [], seen = new Set();
  for (const ln of grepRe(file, '(feat|fix|refactor|chore|docs|perf|style)(\\([^)]*\\))?:')) {
    const m = msgText(ln).match(/\b(feat|fix|refactor|chore|docs|perf|style)(?:\([^)]*\))?:\s+([^`"\n]{4,110})/i);
    if (!m) continue;
    const subj = clip((m[1].toLowerCase() + ': ' + m[2]).replace(/\s+—\s+v\d.*$/, '').trim(), 130);
    if (subj && !seen.has(subj)) { seen.add(subj); out.push(subj); }
    if (out.length >= 6) break;
  }
  return out;
}
// Issues: real ⚠️ shortcomings from the session's FINAL verdict region — last
// clean occurrence first, skipping anything that looks like code.
function extractIssues(file) {
  const out = [], seen = new Set();
  for (const pat of ['Not completed', 'UNTESTED', 'PARTIALLY INSTALLED', 'unable to test', 'could not verify', 'I was unable to']) {
    const lines = grepAll(file, pat, true);
    for (let k = lines.length - 1; k >= 0 && out.length < 4; k--) {   // last (final) first
      const t = msgText(lines[k]), i = t.indexOf(pat);
      if (i < 0) continue;
      const frag = clip(t.slice(i), 160);
      if (CODEY.test(frag) || seen.has(frag)) continue;
      seen.add(frag); out.push(frag);
    }
  }
  return out;
}
// Evaluation: the session's FINAL ✅/⚠️ completion verdict. Scope to the last
// 🗣️ SOL block so mid-session "Not completed" mentions (or the indexer's own
// source while indexing this repo) can't override the real closing verdict.
function extractEvaluation(file) {
  const blob = fileBlob(file);
  const solAt = blob.lastIndexOf('🗣️ SOL');
  const tail = solAt >= 0 ? blob.slice(solAt, solAt + 1400) : '';
  if (tail.includes('all the work was completed')) return { text: 'Complete — delivered acceptably', ok: 1 };
  if (/Not completed/i.test(tail)) {
    const m = tail.match(/Not completed:?\s*([^.`"\\]+)/i);
    const txt = m && m[1].trim() && !CODEY.test(m[1]) ? clip(m[1], 150) : 'see session detail';
    return { text: 'Incomplete — outstanding: ' + txt, ok: 0 };
  }
  return { text: 'No explicit completion verdict recorded', ok: -1 };
}
// Raw exchanges: genuine prompts + SOL replies, in transcript order.
function extractExchanges(file) {
  const out = [];
  for (const ln of grepRe(file, '"type":"user"|🗣️ SOL')) {
    if (ln.includes('SOL')) {
      const m = msgText(ln).match(/🗣️\s*SOL:\s*([^\n]+)/);
      if (m) out.push({ role: 'assistant', text: clip(m[1], 300) });
    } else if (ln.includes('"type":"user"')) {
      const t = msgText(ln);
      if (t && t.length > 6 && !META.test(t) && !TRIVIAL.test(t) && !SYNTHETIC.test(t)) out.push({ role: 'user', text: clip(t, 300) });
    }
    if (out.length >= 50) break;
  }
  return out;
}

// ── indexing ─────────────────────────────────────────────────────────────────
const upsert = db.prepare(`
  INSERT INTO work_efforts (id,project,date,mtime,size,topic,version,requested,produced,issues,evaluation,eval_ok,item_count)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET project=excluded.project, date=excluded.date, mtime=excluded.mtime,
    size=excluded.size, topic=excluded.topic, version=excluded.version, requested=excluded.requested,
    produced=excluded.produced, issues=excluded.issues, evaluation=excluded.evaluation,
    eval_ok=excluded.eval_ok, item_count=excluded.item_count`);
const delItems = db.prepare(`DELETE FROM functional_items WHERE effort_id=?`);
const insItem  = db.prepare(`INSERT INTO functional_items (effort_id,seq,kind,text) VALUES (?,?,?,?)`);
const delExch  = db.prepare(`DELETE FROM exchanges WHERE effort_id=?`);
const insExch  = db.prepare(`INSERT INTO exchanges (effort_id,seq,role,text) VALUES (?,?,?,?)`);
const getMeta  = db.prepare(`SELECT mtime,size FROM work_efforts WHERE id=?`);

function indexSession(name, repo, version, f) {
  const requested = extractRequested(f.file);
  const produced  = extractProduced(f.file, repo);
  const issues    = extractIssues(f.file);
  const evaln     = extractEvaluation(f.file);
  const exchanges = extractExchanges(f.file);
  // Drop pure hook/meta/agent-call sessions with no genuine request and no output.
  if (!requested.length && !produced.length && !exchanges.length) return false;
  const items = [];
  requested.forEach((t) => items.push(['requested', t]));
  produced.forEach((t)  => items.push(['produced', t]));
  issues.forEach((t)    => items.push(['issue', t]));
  upsert.run(f.id, name, fmtDate(f.mtime), Math.round(f.mtime), f.size,
    sessionTopic(f.file, f.id, requested), version, requested.join(' • '), produced.join(' • '),
    issues.join(' • '), evaln.text, evaln.ok, items.length);
  delItems.run(f.id); items.forEach(([k, t], i) => insItem.run(f.id, i, k, t));
  delExch.run(f.id);  exchanges.forEach((e, i) => insExch.run(f.id, i, e.role, e.text));
  return true;
}

let _built = false;
function ensureIndex(force) {
  if (_built && !force) return;
  for (const [name, repo] of Object.entries(NAME_TO_PATH)) {
    const dir = sessionDirFor(repo); if (!dir) continue;
    const version = gitTag(repo);
    for (const f of sessionFiles(dir).slice(0, PER_PROJECT_CAP)) {
      const row = getMeta.get(f.id);
      if (row && Math.round(row.mtime) === Math.round(f.mtime) && row.size === f.size) continue;
      try { indexSession(name, repo, version, f); } catch { /* skip unreadable */ }
    }
  }
  _built = true;
}

// ── queries (shapes kept compatible with the existing UI) ─────────────────────
function dateBounds(range) {
  return { lo: (range.from || '0000-00-00') + ' 00:00', hi: (range.to || '9999-99-99') + ' 99:99' };
}
function queryProjects(range) {
  ensureIndex();
  const b = dateBounds(range), filtered = !!(range.from || range.to);
  const rows = db.prepare(`SELECT project, COUNT(*) n, MAX(date) last, MAX(version) version
    FROM work_efforts WHERE date>=? AND date<=? GROUP BY project ORDER BY last DESC`).all(b.lo, b.hi);
  const projects = rows.map((r) => ({ name: r.project, version: r.version || gitTag(NAME_TO_PATH[r.project]),
    sessions: r.n, lastActive: r.last || '' }));
  return { projects, appVersion: gitTag(NAME_TO_PATH['Portfolio']), filtered, from: range.from || '', to: range.to || '' };
}
function rowToSession(r) {
  return { date: r.date, topic: r.topic, action: r.requested || '—', status: r.evaluation || '—',
    committed: r.produced || '', id: r.id, project: r.project, version: r.version,
    requested: r.requested, produced: r.produced, issues: r.issues, evaluation: r.evaluation, eval_ok: r.eval_ok };
}
function queryProject(name, range) {
  ensureIndex();
  const b = dateBounds(range), filtered = !!(range.from || range.to);
  const rows = db.prepare(`SELECT * FROM work_efforts WHERE project=? AND date>=? AND date<=? ORDER BY date DESC`).all(name, b.lo, b.hi);
  const sessions = rows.map(rowToSession);
  return { name, version: rows[0] ? rows[0].version : gitTag(NAME_TO_PATH[name]), total: rows.length,
    shown: sessions.length, sessions, filtered, from: range.from || '', to: range.to || '' };
}
function queryRollup(range) {
  ensureIndex();
  const b = dateBounds(range), filtered = !!(range.from || range.to);
  const rows = db.prepare(`SELECT * FROM work_efforts WHERE date>=? AND date<=? ORDER BY date DESC LIMIT 400`).all(b.lo, b.hi);
  const sessions = rows.map(rowToSession);
  return { scope: 'all', filtered, from: range.from || '', to: range.to || '', total: rows.length, shown: sessions.length, sessions };
}
function queryEffort(id) {
  ensureIndex();
  const e = db.prepare(`SELECT * FROM work_efforts WHERE id=?`).get(id);
  if (!e) return { error: 'not found', id };
  const items     = db.prepare(`SELECT seq,kind,text FROM functional_items WHERE effort_id=? ORDER BY seq`).all(id);
  const exchanges = db.prepare(`SELECT seq,role,text FROM exchanges WHERE effort_id=? ORDER BY seq`).all(id);
  return { effort: e, items, exchanges };
}
function stats() {
  ensureIndex();
  const n = db.prepare(`SELECT COUNT(*) n FROM work_efforts`).get().n;
  return { efforts: n, dbPath: DB_PATH };
}

module.exports = { ensureIndex, queryProjects, queryProject, queryRollup, queryEffort, stats, NAME_TO_PATH };

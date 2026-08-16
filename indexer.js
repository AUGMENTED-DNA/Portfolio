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

// ── Project discovery ────────────────────────────────────────────────────────
// Until 2026-08-04 this was a hand-typed literal of 20 display-name -> path
// pairs, last touched around 2026-06-29. The page could only ever show a name
// spelled out here, so every project registered afterwards (Voice Cycler,
// Presence Beacon, Vocal Mind Map, Financial Design 2, RemoteJobs, Jarvis-U…)
// was invisible no matter how many sessions it had — two of them had live
// transcript folders on disk and still did not appear.
//
// The set is now derived from two live sources, re-read on every page load:
//   1. PROJECTS.md — the PAI project registry: canonical display name + path.
//   2. ~/.claude/projects/ — session directories, so a project with real
//      transcripts appears even if it was never registered.
// Union of both: neither an unregistered project nor a registered-but-unworked
// one can silently vanish.
const REGISTRY_MD = path.join(os.homedir(), '.claude', 'PAI', 'USER', 'PROJECTS', 'PROJECTS.md');

// Registry rows: | Name | `/abs/path` | vX.Y | description |
// Some rows list several paths (a git copy plus a live copy, a Windows path
// plus its WSL mount); take the first POSIX absolute one — session records are
// keyed on that.
function registryProjects() {
  const out = {};
  let md;
  try { md = fs.readFileSync(REGISTRY_MD, 'utf8'); } catch { return out; }
  const active = md.split(/^##\s+/m).find((s) => /^Active Projects/i.test(s)) || '';
  for (const line of active.split('\n')) {
    if (!line.startsWith('|')) continue;
    const c = line.split('|').map((s) => s.trim());
    if (c.length < 4) continue;
    if (!c[1] || /^-+$/.test(c[1]) || /^Project$/i.test(c[1])) continue;   // divider / header
    const m = c[2].match(/`(\/[^`]+)`/);
    if (m) out[c[1]] = m[1].replace(/\/+$/, '');
  }
  return out;
}

// A session directory is the repo path with '/' (and sometimes '_' and '.')
// flattened to '-'. That is lossy, so instead of inverting it we try candidate
// folder names forward and keep whichever exists.
function resolveSlugDir(d) {
  const roots = [
    ['-home-dmcneill-Projects-',     '/home/dmcneill/Projects/'],
    ['-mnt-c-Users-danem-Projects-', '/mnt/c/Users/danem/Projects/'],
  ];
  for (const [pre, base] of roots) {
    if (!d.startsWith(pre)) continue;
    const tail = d.slice(pre.length);
    if (!tail) return null;
    const name = tail.replace(/-+/g, ' ').trim();
    if (!name) return null;
    for (const cand of [tail, tail.replace(/-/g, '_')]) {   // Vocal-Mind-Map | Vocal_Mind_Map
      try { if (fs.statSync(base + cand).isDirectory()) return { name, repo: base + cand }; } catch { /* next */ }
    }
    return { name, repo: base + tail };   // folder gone; this still slugs back to the same dir
  }
  return null;
}

// 'Jarvis-U' and 'Jarvis U' are the same project — one name comes from the
// registry, the other is derived from a session directory left behind when the
// project moved. Compare on a squashed key so a move does not split a project
// into two rows.
const nameKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Session directories that belong to a project but are not the directory its
// registry path resolves to (typically a previous location). Indexed under the
// project's canonical name so its history stays in one place.
let _extraDirs = {};

let _nameToPath = null;
function projectMap() {
  if (_nameToPath) return _nameToPath;
  const m = { ...registryProjects(), 'Claude + PAI': path.join(os.homedir(), '.claude') };
  const extra = {};
  const claimed = new Set();
  const byKey = new Map();
  for (const [name, p] of Object.entries(m)) {
    claimed.add(p.replace(/\//g, '-'));
    claimed.add(p.replace(/[/._]/g, '-'));
    byKey.set(nameKey(name), name);
  }
  let dirs = [];
  try { dirs = fs.readdirSync(PROJECTS_DIR); } catch { /* no session records yet */ }
  for (const d of dirs) {
    if (claimed.has(d)) continue;
    try { if (!fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory()) continue; } catch { continue; }
    const r = resolveSlugDir(d);
    if (!r) continue;
    const owner = byKey.get(nameKey(r.name));
    if (owner) { (extra[owner] = extra[owner] || []).push(d); continue; }   // same project, moved
    if (!(r.name in m)) { m[r.name] = r.repo; byKey.set(nameKey(r.name), r.name); }
  }
  _extraDirs  = extra;
  _nameToPath = m;
  return m;
}

// Called at the top of queryProjects — i.e. on every page load — so a project
// added to the registry appears on the next refresh with no code change.
function refreshProjects() { _nameToPath = null; return projectMap(); }

// Live view, so the rest of this file and server.js keep reading NAME_TO_PATH
// exactly as before.
const NAME_TO_PATH = new Proxy({}, {
  get:     (_, k) => projectMap()[k],
  has:     (_, k) => k in projectMap(),
  ownKeys: ()     => Reflect.ownKeys(projectMap()),
  getOwnPropertyDescriptor: (_, k) =>
    ({ value: projectMap()[k], enumerable: true, configurable: true }),
});

const PROJECTS_DIR  = path.join(os.homedir(), '.claude', 'projects');
const DB_PATH       = path.join(__dirname, 'work-history.db');
// Was 120, which silently dropped work: 519 session files were touched in the
// three weeks to 2026-08-05 and only 159 were indexed, because 'Claude + PAI'
// alone had 261 and everything past its newest 120 fell off the end. A cap that
// hides the busiest project's history is worse than a slower index.
const PER_PROJECT_CAP = 5000;  // most-recent sessions indexed per project

// ── DB init ──────────────────────────────────────────────────────────────────
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS work_efforts (
    id TEXT PRIMARY KEY, project TEXT, date TEXT, mtime INTEGER, size INTEGER,
    topic TEXT, version TEXT, requested TEXT, produced TEXT, delivered TEXT, issues TEXT,
    evaluation TEXT, eval_ok INTEGER, item_count INTEGER
  );
  CREATE TABLE IF NOT EXISTS functional_items (effort_id TEXT, seq INTEGER, kind TEXT, text TEXT);
  CREATE TABLE IF NOT EXISTS exchanges (effort_id TEXT, seq INTEGER, role TEXT, text TEXT);
  CREATE INDEX IF NOT EXISTS idx_eff_date  ON work_efforts(date);
  CREATE INDEX IF NOT EXISTS idx_eff_proj  ON work_efforts(project);
  CREATE INDEX IF NOT EXISTS idx_items_eff ON functional_items(effort_id);
  CREATE INDEX IF NOT EXISTS idx_exch_eff  ON exchanges(effort_id);
  CREATE TABLE IF NOT EXISTS project_priority (
    project TEXT PRIMARY KEY, rank INTEGER NOT NULL, updated TEXT
  );
  -- v4.7: sessions that carry no request, no output and no exchanges are dropped
  -- as noise (see indexSession). That verdict used to be thrown away, so the
  -- same 468 files were fully re-read on EVERY walk, forever — measured at 4.7s
  -- per walk. Recording the verdict lets the skip-guard treat them like any
  -- other unchanged file. Deliberately NOT a column on work_efforts: a row there
  -- would surface in every query and put 468 empty sessions in the lists.
  CREATE TABLE IF NOT EXISTS empty_sessions (
    id TEXT PRIMARY KEY, mtime INTEGER, size INTEGER
  );
`);

// ── Project priority ─────────────────────────────────────────────────────────
// Hand-entered running order, 1 = highest. Kept in its own table rather than on
// work_efforts so it survives re-indexing and the project rescan, and so a
// project with no sessions can still be ranked. Anything unranked sorts last —
// never first — so a project you have not thought about cannot look urgent.
const UNRANKED = 9999;

function getPriorities() {
  try {
    const rows = db.prepare('SELECT project, rank FROM project_priority ORDER BY rank').all();
    return Object.fromEntries(rows.map((r) => [r.project, r.rank]));
  } catch { return {}; }
}

// Accepts an ordered array of project names (index 0 = rank 1). Written in one
// transaction so a failure part-way cannot leave a half-applied order.
function setPriorities(order) {
  if (!Array.isArray(order)) throw new TypeError('priority order must be an array');
  const names = order.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim());
  const stamp = new Date().toISOString();
  const del = db.prepare('DELETE FROM project_priority');
  const ins = db.prepare('INSERT INTO project_priority (project, rank, updated) VALUES (?,?,?)');
  db.exec('BEGIN');
  try {
    del.run();
    names.forEach((n, i) => ins.run(n, i + 1, stamp));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return getPriorities();
}

const rankOf = (prios, name) => (prios[name] != null ? prios[name] : UNRANKED);

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
// When the work actually happened, read from the transcript's own last event.
// This was fmtDate(f.mtime) — the FILE's modification time — which is bumped by
// anything that touches the file, including a re-index. That is how an entry
// came to be dated "2026-08-05 10:32" while the text inside it was stamped
// July 29. Transcripts are append-ordered, so the last timestamp in the file is
// the session's last activity. Falls back to mtime when none is present.
function sessionDate(file, mtime) {
  const lines = grepAll(file, '"timestamp":"', true);
  for (let k = lines.length - 1; k >= 0; k--) {
    const m = lines[k].match(/"timestamp":"([^"]+)"/);
    if (!m) continue;
    const t = Date.parse(m[1]);
    if (t) return fmtDate(t);
  }
  return fmtDate(mtime);
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
  const titles = grepAll(file, '"aiTitle"', false);
  const t = titles[titles.length - 1];   // LAST aiTitle = the most recent rename (best reflects the session)
  if (t) { try { const o = JSON.parse(t); if (o.aiTitle) return String(o.aiTitle).trim(); } catch { /* */ } }
  if (requested && requested.length) {                  // derive a short title (first clause of the ask)
    const first = requested[0].split(/[.!?\n]/)[0].trim();
    return clip(first || requested[0], 52);
  }
  return `Session ${id.slice(0, 8)}`;
}

// ── zero-token extraction (parses PAI's own structured markers) ───────────────
const META    = /Does this user response indicate|^CONTEXT:|system-reminder|PAI ALGORITHM|Banned Phrase|FORK →|local-command|<command-|caveat:|Your questions have been answered|task-notification|tool-use-id|toolu_[A-Za-z0-9]|\[Request interrupted|Background command|output completed Agent|automated background|\/tmp\/claude-/i;
const TRIVIAL = /^(continue|go|yes|no|ok|okay|y|n|retry|continue retry|next|proceed|do it|S\d)\b[.!\s]*$/i;
// App-internal agent/system prompts (e.g. Council's multi-agent role prompts)
// captured as "user" turns — these are not Dane's genuine work requests.
const SYNTHETIC = /^(You are\b|You're (an?|the)\b|Act(ing)? as\b|Respond (only|with)\b|Output only\b|Given the following\b|You will be\b)/i;
// Code-looking text — skip so the indexer never matches its OWN source while
// indexing this very repo's transcripts (the self-pollution bug).
const CODEY = /[`{}]|\*\*|=>|\);|\$\{|\.\w+\(|===|!==|"\s*flag/;

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
// First substantive assistant response — used as a Delivered summary when the
// session shipped no commit (skips tool/process narration and code-looking text).
function firstResponse(file) {
  for (const ln of grepAll(file, '"type":"assistant"', false)) {
    const t = msgText(ln);
    if (!t || t.length < 20) continue;
    if (!/^["“']?[A-Z]/.test(t)) continue;                          // must read like a sentence
    if (CODEY.test(t.slice(0, 90))) continue;
    if (/^(I'll|Let me|Reading|Checking|Running|Looking|Got it)\b/i.test(t)) continue;
    if (/EXPLAIN:|CURRENT MESSAGE|system-reminder|PAI ALGORITHM|TaskCreate|ISC\/|##\s|🗣️|🤖|▶ PATH/.test(t.slice(0, 130))) continue;
    const first = t.split(/(?<=[.!?])\s/)[0];
    return clip(first || t, 120);
  }
  return '';
}
// Issues: real ⚠️ shortcomings from the session's FINAL verdict region — last
// clean occurrence first, skipping anything that looks like code.
// The original six phrases caught 11 items across the whole history. A 3-week
// audit of the same transcripts using the families below found 165 hits in 56
// sessions across 9 projects — the six-phrase list was missing the two most
// common shapes by far: work blocked on Dane's approval, and work explicitly
// named as not started. Ordered so the matched phrase can be shown as the
// reason; a tag that cannot be explained is a tag that cannot be trusted.
const ISSUE_PATTERNS = [
  // NOT the bare word 'unfinished': it matched 632 of 1257 sessions because it
  // is an adjective, not a status claim — it catches narrative prose ("an
  // unfinished thought", "the unfinished camera feature" describing something
  // already removed) and the classifier hook's own JSON schema text. Every
  // pattern here must be phrase-shaped enough that matching it means the
  // session ASSERTED something was left over.
  'Not completed', 'still incomplete', 'did not finish',
  'blocked by', 'blocked pending', 'is blocked', 'cannot proceed until',
  'needs your', 'awaiting your', 'pending your', 'requires your',
  'waiting on you', 'approval pending', 'needs you to',
  'STILL NEEDED', 'still needed', 'still outstanding', 'still open',
  'still unfixed', 'still pending', 'remains open',
  'NOT STARTED', 'not started', 'NOT DONE',
  'UNTESTED', 'untested', 'PARTIALLY INSTALLED',
  'unable to test', 'could not verify', 'I was unable to',
  'not verified', 'DEFERRED-VERIFY',
  'have not yet', 'not yet built', 'not yet implemented', 'not yet wired',
];
const ISSUE_CAP = 8;                 // was 4 — sessions routinely leave more

// Expand a match to the whole sentence containing it. The old code did
// t.slice(i) — starting the text AT the matched phrase — so an item read
// "needs your approval. 🗣️ PAI: [August 5, 2026..." and you could not tell
// WHAT needed approving, which is the only thing that makes the entry useful.
// Walk back to the previous sentence end and forward to the next one. The
// speaking-head marker is a boundary too: it begins the closing voice line,
// which is always a different thought from the sentence before it.
const SENT_END = /[.!?\n•]|🗣️/;
function sentenceAround(t, i) {
  let s = 0;
  for (let k = i - 1; k >= 0 && i - k < 240; k--) {
    if (SENT_END.test(t[k])) { s = k + 1; break; }
    s = k;
  }
  let e = t.length;
  for (let k = i; k < t.length && k - i < 240; k++) {
    if (SENT_END.test(t[k])) { e = k + 1; break; }
    e = k + 1;
  }
  return clip(t.slice(s, e).replace(/\s+/g, ' ').trim(), 200);
}

// Two different patterns routinely match the SAME sentence — "blocked pending
// your approval" and "pending your approval" both hit one clause — which used
// to emit two near-identical items. Now that every fragment is expanded to its
// sentence, both produce the same text, so dedupe on a normalised form of it
// rather than on the raw fragment.
const dedupeKey = (frag) => frag.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 90);

function extractIssues(file) {
  const out = [], seen = new Set();
  for (const pat of ISSUE_PATTERNS) {
    const lines = grepAll(file, pat, true);
    for (let k = lines.length - 1; k >= 0 && out.length < ISSUE_CAP; k--) {   // last (final) first
      const t = msgText(lines[k]), i = t.indexOf(pat);
      if (i < 0) continue;
      const frag = sentenceAround(t, i);
      if (!frag || frag.length < 12 || CODEY.test(frag)) continue;
      const key = dedupeKey(frag);
      if (seen.has(key)) continue;
      seen.add(key); out.push(frag);
    }
  }
  return out;
}
// Evaluation: the session's FINAL ✅/⚠️ completion verdict. Scope to the last
// closing voice block so mid-session "Not completed" mentions (or the indexer's
// own source while indexing this repo) can't override the real closing verdict.
//
// NAME-AGNOSTIC ON PURPOSE. This used to search the literal '🗣️ SOL'. The
// assistant was renamed to PAI and the search silently stopped matching: 4
// transcripts on disk still contain 'SOL', 599 contain 'PAI'. Nothing failed
// loudly — extractEvaluation just returned "no verdict" forever, and the
// caller below scored that as Complete. Matching the 🗣️ marker itself rather
// than whatever follows it means the next rename cannot reintroduce this.
const VOICE_MARK = '🗣️';
// v4.17: the verdict now comes from the ⏳ INCOMPLETE IN THIS SESSION ledger,
// which CLAUDE.md requires on every response and VoiceFormatGuard.hook.ts blocks
// a response for omitting. A statement written by rule beats one written by
// chance.
//
// MEASURED, which is why this changed: the old test required the literal string
// 'all the work was completed' near the last 🗣️ mark. That phrase appears in 4
// of 1,075 transcripts (0.37%) and produced ZERO Complete verdicts — every
// "Complete" in the database came from the commit-evidence fallback in
// indexSession, meaning completion silently meant "did this session commit
// code". Sampling the 74 substantial sessions showed no phrase worth keying on:
// live 13%, verified/ready 10%, fixed/done/complete 8%, and 35% carry no voice
// line at all. Closing lines are summaries of what happened, not verdicts, so
// no keyword list could work — the fix had to be a marker written on purpose.
const LEDGER_MARK = 'INCOMPLETE IN THIS SESSION';
function extractEvaluation(file) {
  const blob = fileBlob(file);

  // A real ledger BEGINS A LINE. Two weaker anchors were tried and both failed
  // against real transcripts, which is why this one is line-based:
  //   1. lastIndexOf(marker) scored THIS session Complete, because its last
  //      match was the CLAUDE.md rule's own worked example ("…nothing
  //      outstanding — everything asked for…") quoted while writing the rule.
  //   2. Anchoring on the last 🗣️ then scanning forward scored it Unknown,
  //      because the last 🗣️ in the file is a documentation mention, not the
  //      closing line.
  // In this session's transcript the marker appears 101 times; only 25 begin a
  // line, and those 25 are the actual ledgers. Everything else is prose about
  // ledgers, quoted rule text, or — unavoidably — this function's own source.
  // The COLON is load-bearing. Without it this matched its own source code and
  // the test scripts written against it — 39 matches in this session's
  // transcript versus 25 real ledgers, and the newest "match" was a regex
  // literal from a debug script. A real ledger always writes the heading with a
  // colon; a code or prose reference to the heading does not.
  const hits = [...blob.matchAll(/\\n⏳ INCOMPLETE IN THIS SESSION:/g)].map((m) => m.index);
  if (hits.length) {
    const tail = blob.slice(hits[hits.length - 1], hits[hits.length - 1] + 1200);

    // ITEMS DECIDE FIRST. Testing the "nothing outstanding" wording first scored
    // this session Complete while its closing ledger listed three open items —
    // the phrase appeared later in the 1200-char window (in an approval dialog
    // quoting the rule) and won over the ledger's own contents. A ledger that
    // lists work is incomplete no matter what text follows it.
    const items = [...tail.matchAll(/[-•]\s*([^\\\n"]{6,160}?)\s*—\s*waiting on\s+(you|PAI)/gi)]
      .map((m) => m[1].trim() + ' (waiting on ' + m[2] + ')');
    if (items.length) {
      // `src` marks where the verdict came from. indexSession used to sniff the
      // TEXT for the word "ledger" to decide precedence, which silently failed
      // for this branch because its wording never contains that word — so every
      // ledger-derived Incomplete fell through to the old prose heuristic. A
      // flag cannot drift out of step with the wording the way a substring can.
      return { text: 'Incomplete — ' + items.length + ' item' + (items.length === 1 ? '' : 's')
                   + ' left: ' + clip(items.join(' • '), 200), ok: 0, src: 'ledger' };
    }
    // Only with no items does the one-line "nothing outstanding" form apply, and
    // only on the heading's OWN line — not anywhere in the window. Split on the
    // ESCAPED newline: a .jsonl message body holds a newline as the two
    // characters \ and n, so a /^…/ anchor tested against the raw slice never
    // matches and every cleanly-finished session scored Unknown.
    // Find the heading's own line by its CONTENT, not by position: the tail
    // begins AT the escaped newline, so element [0] is the empty string before
    // it and every cleanly-finished session scored Unknown.
    const headLine = tail.split('\\n').find((s) => s.includes('INCOMPLETE IN THIS SESSION')) || '';
    if (/nothing outstanding/i.test(headLine)) {
      return { text: 'Complete — the closing ledger recorded nothing outstanding', ok: 1, src: 'ledger' };
    }
    // Heading present but unreadable — do NOT guess in either direction.
    return { text: 'Unknown — a ledger was written but its items could not be read', ok: -1, src: 'ledger' };
  }

  // Pre-ledger transcripts (1,208 of them) never recorded a verdict at all. The
  // old 'Not completed' wording is still honoured so anything that did record
  // one keeps it; absence stays Unknown rather than being scored either way.
  const solAt = blob.lastIndexOf(VOICE_MARK);
  const tail = solAt >= 0 ? blob.slice(solAt, solAt + 1400) : '';
  if (/Not completed/i.test(tail)) {
    const m = tail.match(/Not completed:?\s*([^.`"\\]+)/i);
    const txt = m && m[1].trim() && !CODEY.test(m[1]) ? clip(m[1], 150) : 'see session detail';
    return { text: 'Incomplete — outstanding: ' + txt, ok: 0 };
  }
  return { text: 'No explicit completion verdict recorded', ok: -1 };
}
// Raw exchanges: genuine prompts + closing voice replies, in transcript order.
// Name-agnostic for the same reason as extractEvaluation above.
function extractExchanges(file) {
  const out = [];
  for (const ln of grepRe(file, '"type":"user"|🗣️')) {
    if (ln.includes(VOICE_MARK)) {
      const m = msgText(ln).match(/🗣️\s*[A-Za-z][A-Za-z0-9 _-]{0,20}:\s*([^\n]+)/);
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
  INSERT INTO work_efforts (id,project,date,mtime,size,topic,version,requested,produced,delivered,issues,evaluation,eval_ok,item_count)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET project=excluded.project, date=excluded.date, mtime=excluded.mtime,
    size=excluded.size, topic=excluded.topic, version=excluded.version, requested=excluded.requested,
    produced=excluded.produced, delivered=excluded.delivered, issues=excluded.issues, evaluation=excluded.evaluation,
    eval_ok=excluded.eval_ok, item_count=excluded.item_count`);
const delItems = db.prepare(`DELETE FROM functional_items WHERE effort_id=?`);
const insItem  = db.prepare(`INSERT INTO functional_items (effort_id,seq,kind,text) VALUES (?,?,?,?)`);
const delExch  = db.prepare(`DELETE FROM exchanges WHERE effort_id=?`);
const insExch  = db.prepare(`INSERT INTO exchanges (effort_id,seq,role,text) VALUES (?,?,?,?)`);
const getMeta  = db.prepare(`SELECT mtime,size FROM work_efforts WHERE id=?`);
// v4.7: the "there is nothing in this file" verdict, so it is computed once
// rather than on every walk. See empty_sessions in the DB init above.
const getEmpty = db.prepare(`SELECT mtime,size FROM empty_sessions WHERE id=?`);
const putEmpty = db.prepare(`INSERT INTO empty_sessions (id,mtime,size) VALUES (?,?,?)
  ON CONFLICT(id) DO UPDATE SET mtime=excluded.mtime, size=excluded.size`);

function indexSession(name, repo, version, f) {
  const requested = extractRequested(f.file);
  const produced  = extractProduced(f.file, repo);
  const issues    = extractIssues(f.file);
  const evaln     = extractEvaluation(f.file);
  const exchanges = extractExchanges(f.file);
  // Drop pure hook/meta/agent-call sessions with no genuine request and no output.
  // Recording the fact is what stops this file being re-read on every future walk.
  if (!requested.length && !produced.length && !exchanges.length) {
    putEmpty.run(f.id, Math.round(f.mtime), f.size);
    return false;
  }
  // Binary completion: Incomplete iff the session recorded explicit outstanding
  // work (a ⚠️ verdict or "Not completed"/UNTESTED markers); otherwise Complete.
  // `outstanding` (the leftover list) is populated only for Incomplete efforts.
  // THREE states, not two. This used to be a binary: anything that was not
  // explicitly Incomplete became Complete — including evaln.ok === -1, which
  // means "I could not find a verdict at all". Because the verdict reader was
  // matching a stale name it returned -1 on ~99% of sessions, so 564 of them
  // were stamped "Complete — no outstanding items" purely because the indexer
  // could not read them. Absence of evidence was being recorded as evidence of
  // completion. Unknown is now its own state and is never claimed as done.
  let evalOk, evalText, outstanding = '';
  // v4.17: the LEDGER OUTRANKS the ⚠️-scraping heuristic. Previously
  // `evaln.ok === 0 || issues.length` ran first, so a session whose closing
  // ledger said "nothing outstanding" was still stamped Incomplete because a ⚠️
  // appeared somewhere in its transcript — and where the ledger DID say
  // incomplete, its item list was discarded in favour of the literal word
  // "Incomplete". MEASURED: after the v4.17 rebuild, 0 of 554 sessions carried a
  // ledger-sourced verdict despite the detector working correctly in isolation.
  // The ledger is written by rule and enforced by a Stop hook; `issues` is
  // inferred from prose. A deliberate statement beats an inference about one.
  const fromLedger = evaln.src === 'ledger';
  if (fromLedger && evaln.ok === 1) {
    evalOk = 1; evalText = evaln.text;
  } else if (fromLedger && evaln.ok === 0) {
    evalOk = 0; evalText = 'Incomplete';
    outstanding = clip(evaln.text.replace(/^Incomplete\s*—\s*/i, ''), 200);
  } else if (evaln.ok === 0 || issues.length) {
    evalOk = 0; evalText = 'Incomplete';
    outstanding = issues.join(' • ') || clip(evaln.text.replace(/^Incomplete[^:]*:?\s*/i, ''), 150);
  } else if (evaln.ok === 1) {
    evalOk = 1; evalText = 'Complete — delivered acceptably';
  } else if (produced.length) {
    // No closing verdict, but the session shipped commits — real evidence of
    // delivery, so Complete is an honest read here.
    evalOk = 1; evalText = 'Complete — shipped ' + produced.length + ' commit' + (produced.length === 1 ? '' : 's');
  } else {
    evalOk = -1; evalText = 'Unknown — no completion verdict found';
  }
  // Delivered (succinct, never empty): commit summary → else closing SOL summary →
  // else first substantive response → else a clean "no commit" label.
  let delivered;
  if (produced.length) {
    delivered = produced.length === 1 ? produced[0] : produced[0] + ' (+' + (produced.length - 1) + ' more)';
  } else {
    const sol = exchanges.filter((e) => e.role === 'assistant').pop();
    const noisy = (x) => !x || /EXPLAIN:|CURRENT MESSAGE|system-reminder|PAI ALGORITHM|TaskCreate|🤖/.test(x) || /^['"`,*\[(]/.test(x.trim()) || CODEY.test(x.slice(0, 90));
    let cand = (sol && !noisy(sol.text)) ? sol.text : firstResponse(f.file);
    delivered = (cand && !noisy(cand)) ? clip(cand, 120) : 'Response / advice provided — no code committed';
  }
  const items = [];
  requested.forEach((t) => items.push(['requested', t]));
  produced.forEach((t)  => items.push(['produced', t]));
  (outstanding ? outstanding.split(' • ') : []).forEach((t) => { if (t) items.push(['outstanding', t]); });
  upsert.run(f.id, name, sessionDate(f.file, f.mtime), Math.round(f.mtime), f.size,
    sessionTopic(f.file, f.id, requested), version, requested.join(' • '), produced.join(' • '),
    delivered, outstanding, evalText, evalOk, items.length);
  delItems.run(f.id); items.forEach(([k, t], i) => insItem.run(f.id, i, k, t));
  delExch.run(f.id);  exchanges.forEach((e, i) => insExch.run(f.id, i, e.role, e.text));
  return true;
}

// Rows indexed under a name that has since been superseded (e.g. 'Jarvis U'
// written before the registry's canonical 'Jarvis-U' was discovered) are moved
// onto the canonical name, so a project that moved does not show up twice.
function mergeAliasRows() {
  const canonical = new Map(Object.keys(projectMap()).map((n) => [nameKey(n), n]));
  let names;
  try { names = db.prepare('SELECT DISTINCT project FROM work_efforts').all().map((r) => r.project); }
  catch { return; }
  const upd = db.prepare('UPDATE work_efforts SET project=? WHERE project=?');
  for (const n of names) {
    const c = canonical.get(nameKey(n));
    if (c && c !== n) upd.run(c, n);
  }
}

let _built = false;
function ensureIndex(force) {
  if (_built && !force) return;
  mergeAliasRows();
  for (const [name, repo] of Object.entries(projectMap())) {
    const version = gitTag(repo);
    // The directory the repo path resolves to, plus any directory left behind
    // by a previous location of the same project.
    const dirs = [sessionDirFor(repo), ...(_extraDirs[name] || []).map((d) => path.join(PROJECTS_DIR, d))]
      .filter(Boolean);
    for (const dir of dirs) {
      for (const f of sessionFiles(dir).slice(0, PER_PROJECT_CAP)) {
        const row = getMeta.get(f.id);
        if (row && Math.round(row.mtime) === Math.round(f.mtime) && row.size === f.size) continue;
        // Known-empty and untouched since we last looked — skip without reading it.
        const mt = getEmpty.get(f.id);
        if (mt && Math.round(mt.mtime) === Math.round(f.mtime) && mt.size === f.size) continue;
        try { indexSession(name, repo, version, f); } catch { /* skip unreadable */ }
      }
    }
  }
  _built = true;
}

// ── queries (shapes kept compatible with the existing UI) ─────────────────────
function dateBounds(range) {
  return { lo: (range.from || '0000-00-00') + ' 00:00', hi: (range.to || '9999-99-99') + ' 99:99' };
}
// This is the page-load entry point (server.js routes a bare /api/work-history
// here). refreshProjects() re-reads the registry so a newly-registered project
// appears without a code change.
//
// The full walk used to run on EVERY request. That was tolerable at
// PER_PROJECT_CAP=120 (~500 files) but the cap is now 5000 (~2000 files), and a
// cold /api/work-history measured 115s — long enough that the V1 table's 4s
// fetch timeout expired and it silently served its stale April data.json
// instead. Correct data that arrives after two minutes is not correct data.
//
// So the walk is now throttled: at most once per REINDEX_MIN_MS, plus an
// immediate walk on the very first call. Newly-finished sessions show up on the
// next request past the interval rather than instantly — the right trade,
// because the alternative is a page that times out into showing the wrong list.
const REINDEX_MIN_MS = 60_000;
let _lastWalk = 0;
function queryProjects(range) {
  refreshProjects();
  const now = Date.now();
  // v4.7: the first build must be synchronous — on a cold server there is no
  // stored data to answer with, so returning early would serve an empty page.
  // Every LATER refresh is deferred until after this response has been sent:
  // the page stops waiting on a scan whose results it was never going to show
  // anyway (they land in the NEXT request). _lastWalk is stamped before the
  // timer fires, not inside it, so a burst of clicks cannot queue several walks.
  if (!_built) { _lastWalk = now; ensureIndex(true); }
  else if (now - _lastWalk > REINDEX_MIN_MS) {
    _lastWalk = now;
    setTimeout(() => { try { ensureIndex(true); } catch { /* next request retries */ } }, 0).unref?.();
  }
  const b = dateBounds(range), filtered = !!(range.from || range.to);
  // `inc` counts sessions that recorded explicit outstanding work. `unk` counts
  // sessions with no readable completion verdict — deliberately NOT folded into
  // `inc`, because "I could not tell" and "it is not finished" are different
  // claims and merging them is how the old binary produced false confidence.
  const rows = db.prepare(`SELECT project, COUNT(*) n, MAX(date) last, MAX(version) version,
      SUM(CASE WHEN eval_ok=0 THEN 1 ELSE 0 END) inc,
      SUM(CASE WHEN eval_ok=-1 THEN 1 ELSE 0 END) unk
    FROM work_efforts WHERE date>=? AND date<=? GROUP BY project`).all(b.lo, b.hi);
  const known  = projectMap();
  const prios  = getPriorities();
  const byName = new Map(rows.map((r) => [r.project, r]));
  // Human-confirmed resolution, the only state a parser cannot fake. `awaiting`
  // is what the assistant claimed done and the human has not closed; it is the
  // number that answers "is this actually finished".
  let fu = { byProject: {}, totals: { awaiting: 0, confirmed: 0 } };
  try { fu = require('./outstanding').followupCounts(known, b); } catch { /* tracker absent */ }
  // Unfiltered: every known project, including 0-session ones — previously the
  // GROUP BY simply omitted those, hiding 9 projects that were in the list.
  // Filtered: only what was actually worked in the window (unchanged).
  // Projects carrying unconfirmed work are included even with no sessions in the
  // window — dropping them would hide the very items this column exists to show
  // (followupCounts is already date-bounded, so an item here was touched in it).
  const names = filtered
    ? [...new Set([...rows.map((r) => r.project), ...Object.keys(fu.byProject)])]
    : [...new Set([...Object.keys(known), ...rows.map((r) => r.project), ...Object.keys(fu.byProject)])];
  const projects = names.map((name) => {
    const r = byName.get(name);
    return {
      name,
      version:    (r && r.version) || gitTag(known[name]) || '',
      sessions:   r ? r.n : 0,
      incomplete: r ? (r.inc || 0) : 0,
      unknown:    r ? (r.unk || 0) : 0,
      awaiting:   (fu.byProject[name] && fu.byProject[name].awaiting)  || 0,
      confirmed:  (fu.byProject[name] && fu.byProject[name].confirmed) || 0,
      priority:   prios[name] != null ? prios[name] : null,   // null = never ranked
      lastActive: (r && r.last) || '',
    };
  });
  projects.sort((a, b2) => (a.lastActive < b2.lastActive ? 1 : -1));   // active first, 0-session last
  return { projects, appVersion: gitTag(known['Portfolio']), filtered, from: range.from || '', to: range.to || '' };
}
// Titles YOU typed with /rename. Written by PAI's SessionTitle.ts and keyed by
// session id. This is a different thing from the transcript's aiTitle, which is
// auto-generated — verified on session 415d1c22, typed "34-PORTFOLIO REBUILD
// LIST" while its aiTitle reads "Sync V1 table with portfolio projects…".
// Re-read on a short TTL: it changes mid-session whenever you rename something.
const TITLES_FILE = path.join(os.homedir(), '.claude', 'PAI', 'MEMORY', 'STATE', 'session-titles.json');
let _titles = null, _titlesAt = 0;
function typedTitles() {
  const now = Date.now();
  if (_titles && now - _titlesAt < 15_000) return _titles;
  try { _titles = JSON.parse(fs.readFileSync(TITLES_FILE, 'utf8')) || {}; }
  catch { _titles = {}; }                    // store absent — no typed titles, not an error
  _titlesAt = now;
  return _titles;
}

function rowToSession(r) {
  // mtime is the session file's last-write time — the only field that says when
  // a session actually STOPPED. `date` is day-granularity, so every session from
  // the same day ties and "newest first" degenerates into insertion order.
  // typedTitle is yours and is blank unless you renamed the session; autoTitle
  // is the machine's, and is what the status bar falls back to when you didn't.
  // Kept as two fields rather than one merged value so the view can show the
  // gap between what you called the work and what it was taken to be.
  // v4.8: `size` is the transcript's byte count and is the only reliable signal
  // separating a real working session from a fragment. MEASURED across 400
  // sessions: the median TITLED session is 1,605 KB, the median untitled one is
  // 11 KB, and 307 of 360 untitled rows are under 20 KB. Sessions over 2 MB are
  // 100% titled. Without this field the list shows a hook firing and a six-hour
  // build as the same kind of thing, which is what made the titles look sparse.
  return { mtime: r.mtime || 0, size: r.size || 0,
    typedTitle: typedTitles()[r.id] || '', autoTitle: r.topic || '',
    date: r.date, topic: r.topic, action: r.requested || '—', status: r.evaluation || '—',
    committed: r.produced || '', id: r.id, project: r.project, version: r.version,
    requested: r.requested, produced: r.produced, delivered: r.delivered, issues: r.issues, evaluation: r.evaluation, eval_ok: r.eval_ok };
}
function queryProject(name, range) {
  ensureIndex();
  const b = dateBounds(range), filtered = !!(range.from || range.to);
  const rows = db.prepare(`SELECT * FROM work_efforts WHERE project=? AND date>=? AND date<=? ORDER BY date DESC`).all(name, b.lo, b.hi);
  const sessions = rows.map(rowToSession);
  return { name, version: rows[0] ? rows[0].version : gitTag(NAME_TO_PATH[name]), total: rows.length,
    shown: sessions.length, sessions, filtered, from: range.from || '', to: range.to || '' };
}
// v4.12: `total` was rows.length — computed AFTER the LIMIT — so the page said
// "400 of 400 work efforts" while 1,046 rows were cut with no indication. A cap
// is defensible; reporting the capped number as the total is not, because it
// turns a truncated list into a list that claims to be whole. The true count is
// now measured separately and `capped` says plainly whether anything was cut.
const ROLLUP_CAP = 400;
function queryRollup(range) {
  ensureIndex();
  const b = dateBounds(range), filtered = !!(range.from || range.to);
  const cap = Math.max(1, Math.min(5000, Number(range.limit) || ROLLUP_CAP));
  const total = db.prepare(`SELECT COUNT(*) n FROM work_efforts WHERE date>=? AND date<=?`).get(b.lo, b.hi).n;
  const rows = db.prepare(`SELECT * FROM work_efforts WHERE date>=? AND date<=? ORDER BY date DESC LIMIT ?`)
                 .all(b.lo, b.hi, cap);
  const sessions = rows.map(rowToSession);
  return { scope: 'all', filtered, from: range.from || '', to: range.to || '',
           total, shown: sessions.length, cap, capped: total > sessions.length, sessions };
}
function queryEffort(id) {
  ensureIndex();
  const e = db.prepare(`SELECT * FROM work_efforts WHERE id=?`).get(id);
  if (!e) return { error: 'not found', id };
  const rawItems  = db.prepare(`SELECT seq,kind,text FROM functional_items WHERE effort_id=? ORDER BY seq`).all(id);
  const exchanges = db.prepare(`SELECT seq,role,text FROM exchanges WHERE effort_id=? ORDER BY seq`).all(id);
  // v4.16: the who-is-blocking-this classifier already ran on the Outstanding
  // page — 441 items split 128 waiting on Dane / 313 on me — but its answer was
  // stranded there and never reached the session view, where the same items are
  // listed with no owner at all. Same function, so the two pages cannot
  // disagree. `owner` is only meaningful for work that is still open, so a
  // produced item is marked done rather than assigned to anybody.
  let classify = () => ({ owner: 'claude', reason: 'classifier unavailable' });
  try { classify = require('./outstanding').classify; } catch { /* tracker absent */ }
  const items = rawItems.map((it) => {
    if (it.kind === 'produced') return { ...it, owner: 'done', reason: 'this session recorded it as delivered' };
    if (it.kind !== 'outstanding') return { ...it, owner: '', reason: '' };
    const c = classify(it.text);
    return { ...it, owner: c.owner, reason: c.reason };
  });
  // The session's own leftover list is a ' • '-joined string on the effort row,
  // rendered by a second code path in the UI. Classified HERE so both lists get
  // their owners from one function — a browser-side copy of the classifier would
  // drift from this one and the two lists would start disagreeing.
  const outstanding = String(e.issues || '').split(' • ').filter(Boolean).map((text) => {
    const c = classify(text);
    return { text, owner: c.owner, reason: c.reason };
  });
  return { effort: e, items, exchanges, outstanding };
}
function stats() {
  ensureIndex();
  const n = db.prepare(`SELECT COUNT(*) n FROM work_efforts`).get().n;
  return { efforts: n, dbPath: DB_PATH };
}

module.exports = { ensureIndex, queryProjects, queryProject, queryRollup, queryEffort, stats,
                   getPriorities, setPriorities, NAME_TO_PATH };

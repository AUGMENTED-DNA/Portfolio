'use strict';
// ─── Outstanding work items ──────────────────────────────────────────────────
// Answers one question: what is still not done, and who has to do it?
//
// Deliberately a separate module from indexer.js — it only READS the index's
// database plus one external JSON file, and keeping it standalone means the
// indexer can be rewritten without touching this and vice versa.
//
// Two sources, because they capture two different failures:
//   1. work-history.db `issues` — work a session itself admitted it did not
//      finish. Populated by indexer.js extractIssues().
//   2. Followup store — work the assistant CLAIMED was done that the human has
//      not confirmed. "Claimed done" is not "done"; only a human closes these.
//
// Ownership is inferred from the item's own text. The split that matters is
// "can this be built" vs "does a human have to act" — a credential, a physical
// action, a decision, or an answer to a question can never be built.

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE       = path.join(__dirname, 'work-history.db');
const FOLLOWUP_FILE = path.join(os.homedir(), 'Projects', 'Todoist_Agent', 'Followup', 'data', 'followup.json');

// Phrases that mean a HUMAN has to act. Ordered most-specific first so the
// matched phrase can be shown to the user as the reason for the classification
// — a tag you cannot explain is a tag you cannot trust.
const HUMAN_SIGNALS = [
  'waiting on you', 'waiting for you', 'needs you to', 'need you to',
  'you to run', 'you need to', 'requires you', 'up to you', 'your call',
  'your clarification', 'your approval', 'your decision', 'your confirmation',
  'confirm or reopen', 'awaiting confirmation', 'pending your',
  'paste the', 'provide the', 'supply the', 'give me the',
  'api key', 'credential', 'password', 'subscription', 'sign in', 'log in',
  'uac', 'admin privileges', 'reboot', 'restart your', 'physically',
  'let me know', 'tell me which', 'which one', 'decide',
];

// Returns { owner: 'human'|'claude', reason: string }.
// Default is 'claude': if nothing says a human is required, the item is work
// that can be built. Biasing the other way would park buildable work forever.
function classify(text) {
  const t = (text || '').toLowerCase();
  for (const sig of HUMAN_SIGNALS) {
    if (t.includes(sig)) return { owner: 'human', reason: 'matched "' + sig + '"' };
  }
  return { owner: 'claude', reason: 'no human-action phrase found — buildable' };
}

// Items a session recorded as not delivered. `issues` is a ' • '-joined list.
function fromWorkHistory() {
  let db;
  try { db = new DatabaseSync(DB_FILE, { readOnly: true }); }
  catch { return []; }                       // no index yet — not an error
  let rows = [];
  try {
    rows = db.prepare(
      "SELECT id, project, date, topic, issues FROM work_efforts " +
      "WHERE issues IS NOT NULL AND issues <> '' ORDER BY mtime DESC"
    ).all();
  } catch { /* schema older than this feature */ }
  try { db.close(); } catch { /* already closed */ }

  const out = [];
  for (const r of rows) {
    for (const raw of String(r.issues).split(' • ')) {
      const text = raw.replace(/^Not completed:\s*/i, '').trim();
      if (!text) continue;
      const { owner, reason } = classify(text);
      out.push({
        source: 'session', sourceLabel: 'Session record',
        project: r.project || '—', text, owner, reason,
        date: r.date || '', effortId: r.id, topic: r.topic || '',
      });
    }
  }
  return out;
}

// Items the assistant claimed complete that the human has not confirmed.
// Only `state === 'open'` counts; dismissed and confirmed are closed.
function fromFollowup() {
  let raw;
  try { raw = fs.readFileSync(FOLLOWUP_FILE, 'utf8'); }
  catch { return []; }                       // tracker absent — degrade, don't fail
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return []; }
  // The store keys `items` by id ({ f1: {...}, f2: {...} }), NOT as an array —
  // an array-only check silently yields zero items and the view looks "clean".
  const list = Array.isArray(parsed) ? parsed
             : Array.isArray(parsed.items) ? parsed.items
             : (parsed.items && typeof parsed.items === 'object') ? Object.values(parsed.items)
             : Object.values(parsed).find(Array.isArray) || [];

  return list.filter((i) => i && i.state === 'open').map((i) => {
    const text = (i.title || i.detail || '').trim();
    // Every claimed_done item is BY DEFINITION waiting on a human to confirm —
    // that is the entire point of the tracker, so it is never auto-classified.
    const owner = i.kind === 'claimed_done' ? 'human' : classify(text).owner;
    const reason = i.kind === 'claimed_done'
      ? 'claimed done — only you can confirm or reopen it'
      : classify(text).reason;
    return {
      source: 'followup', sourceLabel: 'Awaiting your confirmation',
      project: i.project || 'Claude + PAI', text, owner, reason,
      date: i.updatedAt ? new Date(i.updatedAt).toISOString().slice(0, 16).replace('T', ' ') : '',
      effortId: i.sessionId || '', topic: '', followupId: i.id || '',
    };
  });
}

// Full outstanding set, grouped by project and counted by owner.
// owner filter: 'all' | 'human' | 'claude'.
function queryOutstanding(owner) {
  const all = [...fromWorkHistory(), ...fromFollowup()];
  const counts = {
    all: all.length,
    human: all.filter((i) => i.owner === 'human').length,
    claude: all.filter((i) => i.owner === 'claude').length,
  };
  const items = (owner === 'human' || owner === 'claude')
    ? all.filter((i) => i.owner === owner)
    : all;

  const byProject = new Map();
  for (const i of items) {
    if (!byProject.has(i.project)) byProject.set(i.project, []);
    byProject.get(i.project).push(i);
  }
  const projects = [...byProject.entries()]
    .map(([name, list]) => ({
      name, items: list,
      human:  list.filter((x) => x.owner === 'human').length,
      claude: list.filter((x) => x.owner === 'claude').length,
    }))
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));

  return { counts, owner: owner || 'all', total: items.length, projects };
}

// ─── Per-project resolution counts ───────────────────────────────────────────
// The definitive question is not "did a session sound finished" — that is prose,
// and prose cannot be trusted. It is "has the human closed it". Followup already
// records exactly that: a claimed_done item opens when a session exits cleanly
// and ONLY confirm/verify/dismiss closes it.
//
// Followup stores a `cwd`, not a project — which is the honest thing for it to
// store, since it knows nothing about the registry. The mapping therefore lives
// here, where the caller can supply the name→path map it already owns. This is
// why nothing in the Followup project needs changing: every open item already
// resolves to a folder through the store's own `sessions` map.
function nameKey(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

function projectFromCwd(cwd, nameToPath) {
  if (!cwd) return '';
  const map = nameToPath || {};
  // 1. Longest matching registry path wins, so ~/.claude/projects/x resolves to
  //    the specific project rather than to whatever sits above it.
  let best = '', bestLen = -1;
  for (const [name, p] of Object.entries(map)) {
    if (!p) continue;
    const base = p.endsWith('/') ? p.slice(0, -1) : p;
    if ((cwd === base || cwd.startsWith(base + '/')) && base.length > bestLen) { best = name; bestLen = base.length; }
  }
  if (best) return best;
  // 2. No path matched — a project living on a Windows path the registry records
  //    in Windows form will never prefix-match a /mnt/c cwd. Fall back to naming:
  //    walk the folders deepest-first and take the first that names a project.
  const byKey = new Map(Object.keys(map).map((n) => [nameKey(n), n]));
  const segs = cwd.split('/').filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--) {
    const hit = byKey.get(nameKey(segs[i]));
    if (hit) return hit;
  }
  // 3. Unknown folder — report it under its own name rather than silently
  //    bucketing it into a project it does not belong to.
  return segs[segs.length - 1] || '';
}

// { byProject: { name: { awaiting, confirmed } }, totals: { awaiting, confirmed } }
// `bounds` is optional { lo, hi } on YYYY-MM-DD; when given, only items last
// touched inside the window are counted, so these agree with the date filter.
function followupCounts(nameToPath, bounds) {
  const empty = { byProject: {}, totals: { awaiting: 0, confirmed: 0 } };
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(FOLLOWUP_FILE, 'utf8')); }
  catch { return empty; }                    // tracker absent — degrade, don't fail
  const items = parsed && parsed.items ? Object.values(parsed.items) : [];
  const sessions = (parsed && parsed.sessions) || {};
  const out = { byProject: {}, totals: { awaiting: 0, confirmed: 0 } };

  for (const it of items) {
    if (!it) continue;
    const isAwaiting  = it.state === 'open' && it.kind === 'claimed_done';
    const isConfirmed = it.state === 'confirmed' || it.state === 'verified';
    if (!isAwaiting && !isConfirmed) continue;         // dismissed is neither
    if (bounds && (bounds.lo || bounds.hi)) {
      const day = new Date(it.updatedAt || it.createdAt || 0).toISOString().slice(0, 10);
      if (bounds.lo && day < bounds.lo) continue;
      if (bounds.hi && day > bounds.hi) continue;
    }
    const sess = sessions[it.sessionId];
    const name = it.project || projectFromCwd(sess && sess.cwd, nameToPath) || 'Claude + PAI';
    if (!out.byProject[name]) out.byProject[name] = { awaiting: 0, confirmed: 0 };
    if (isAwaiting)  { out.byProject[name].awaiting++;  out.totals.awaiting++; }
    if (isConfirmed) { out.byProject[name].confirmed++; out.totals.confirmed++; }
  }
  return out;
}

module.exports = { queryOutstanding, classify, followupCounts, projectFromCwd };

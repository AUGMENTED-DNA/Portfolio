'use strict';
// ─── Live project list for the V1 table ──────────────────────────────────────
// WHY THIS EXISTS
//
// The V1 table used to render straight out of data.json — a file last written
// by hand on 24 April. The main Portfolio app on :4040 reads the PAI registry
// plus the session directories on every page load. So the two lists answered
// the same question from two different eras: 16 projects here, 29 there, and
// the 27 on the `p` menu matching neither.
//
// A list of "your projects" that quietly omits eleven of them is worse than no
// list, because nothing on screen says it is incomplete. So this module makes
// :4040 the single source of truth for WHICH projects exist, and demotes
// data.json to what it is actually good at: hand-written extras (descriptions,
// objectives, changelog, backlog) that no automated source knows.
//
// Merge rule:
//   • the live list decides membership — nothing there can be missing here
//   • data.json supplies extra fields wherever a name matches
//   • data.json rows with no live match are KEPT and flagged localOnly, so
//     hand-made entries (e.g. Options, which is a sub-app rather than a
//     registered project) do not disappear in the name of tidiness
//   • if :4040 is unreachable, fall back to data.json wholesale and say so via
//     `degraded` — showing a stale list is acceptable, pretending it is live
//     is not

const fs   = require('fs');
const path = require('path');

const DATA_FILE  = path.join(__dirname, 'data.json');
const LIVE_API   = 'http://localhost:4040/api/work-history';
const FETCH_MS   = 4000;

// Squash to a comparison key so punctuation and case cannot split one project
// into two rows ('Jarvis-U' / 'Jarvis U', 'FINANCIAL' / 'Financial').
const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Names that differ by more than punctuation. Left side is the data.json name,
// right side the registry name it refers to.
const ALIASES = {
  aiemailagent: 'emailagent',
};
const key = (s) => { const k = nameKey(s); return ALIASES[k] || k; };

// URL-safe id used by project.html?id=… — reuse data.json's id when the project
// already has one so existing links keep working.
const slugId = (name) => nameKey(name).replace(/^$/, 'project') ||
                         'project';

function readLocal() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).projects || []; }
  catch { return []; }
}

async function fetchLive() {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_MS);
  try {
    const res = await fetch(LIVE_API, { signal: ctl.signal });
    if (!res.ok) return null;
    const j = await res.json();
    return Array.isArray(j.projects) ? j.projects : null;
  } catch { return null; }                    // :4040 down — caller degrades
  finally { clearTimeout(t); }
}

// Returns { projects, degraded, source }.
// Shape per project is data.json's shape, so v1's front-end needs no changes:
// it already reads name, description, port, percentComplete, changelog, backlog.
async function mergedProjects() {
  const local  = readLocal();
  const byKey  = new Map(local.map((p) => [key(p.name), p]));
  const live   = await fetchLive();

  if (!live) {
    return { projects: local.map((p) => ({ ...p, live: false })), degraded: true, source: 'data.json (localhost:4040 unreachable)' };
  }

  const used = new Set();
  const out = live.map((lp) => {
    const k = key(lp.name);
    const lo = byKey.get(k);
    if (lo) used.add(k);
    return {
      // hand-written extras win where they exist; live data fills the rest
      ...(lo || {}),
      id:          (lo && lo.id) || slugId(lp.name),
      // The registry name wins, NOT data.json's. data.json still calls these
      // 'AI Email Agent' and 'Financial'; the menu and the :4040 page call them
      // 'Email Agent' and 'FINANCIAL'. Letting the old name through would put a
      // different label on the same project on two screens — the exact drift
      // this module exists to remove.
      name:        lp.name,
      description: (lo && lo.description) ||
                   `${lp.sessions} recorded session${lp.sessions === 1 ? '' : 's'}` +
                   (lp.lastActive ? `, last active ${lp.lastActive}` : ''),
      version:        lp.version || (lo && lo.version) || '',
      // the completion figure is computed once, on :4040, from the work index —
      // recomputing it here would let the two screens disagree
      percentComplete: lp.percentComplete,
      doneItems:       lp.doneItems,
      openItems:       lp.openItems,
      basis:           lp.basis,
      confidence:      lp.confidence,
      sessions:        lp.sessions,
      liveSessions:    lp.sessions,
      lastActive:      lp.lastActive || '',
      priority:        lp.priority != null ? lp.priority : null,
      changelog:       (lo && lo.changelog) || [],
      backlog:         (lo && lo.backlog)   || [],
      live:            true,
      localOnly:       false,
    };
  });

  // Hand-made rows with no registry counterpart — kept, not culled.
  for (const lo of local) {
    if (used.has(key(lo.name))) continue;
    out.push({ ...lo, live: false, localOnly: true,
               changelog: lo.changelog || [], backlog: lo.backlog || [] });
  }

  return { projects: out, degraded: false, source: 'localhost:4040 (live registry + session records)' };
}

async function findProject(id) {
  const { projects } = await mergedProjects();
  return projects.find((p) => p.id === id) || null;
}

module.exports = { mergedProjects, findProject, nameKey: key };

'use strict';
// ─── Per-project completion percentage ───────────────────────────────────────
// Answers: how far along is each project?
//
// The starting point Dane proposed was "count the incomplete tasks — more
// incomplete means more left to do". That instinct is right but a bare count
// cannot produce a percentage, because a percentage needs a denominator:
//
//   Project A — 3 items open, 5 items ever recorded   →  40% done
//   Project B — 3 items open, 300 items ever recorded →  99% done
//
// Identical counts, opposite realities. So this module pairs the open count
// with the delivered count and reports the ratio:
//
//   percent = done / (done + open)
//
// where
//   done = functional_items rows of kind 'produced' — concrete things a
//          session actually shipped, extracted from the session record.
//   open = the SAME set the Outstanding screen shows, taken from
//          outstanding.js rather than re-derived here. Two modules counting
//          "what's left" independently is exactly the class of drift this
//          whole change exists to remove — if the number on the Outstanding
//          screen and the number behind the percentage can disagree, both
//          become untrustworthy.
//
// `basis` (= done + open) is returned alongside and MATTERS. A project at 100%
// off 4 recorded items is not making the same claim as one at 100% off 84.
// Absence of recorded outstanding work usually means nothing was written down,
// not that nothing is left — so the UI shows basis as a confidence signal and
// this module returns percent = null (not 0, not 100) when basis is 0.

const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { queryOutstanding } = require('./outstanding');

const DB_FILE = path.join(__dirname, 'work-history.db');

// Below this many recorded items, treat the percentage as indicative only.
// Chosen to sit just under the smallest project that has a real work history
// in the current index; it is a display hint, never a filter.
const LOW_CONFIDENCE_BASIS = 10;

// Delivered items per project, keyed by project name.
// functional_items has no project column of its own — it joins through the
// work effort that produced it.
function producedByProject() {
  const out = {};
  let db;
  try { db = new DatabaseSync(DB_FILE, { readOnly: true }); }
  catch { return out; }                      // no index yet — not an error
  try {
    const rows = db.prepare(
      "SELECT w.project AS project, COUNT(*) AS n " +
      "FROM functional_items f JOIN work_efforts w ON w.id = f.effort_id " +
      "WHERE f.kind = 'produced' GROUP BY w.project"
    ).all();
    for (const r of rows) out[r.project] = r.n;
  } catch { /* schema older than functional_items — degrade to zero, not throw */ }
  try { db.close(); } catch { /* already closed */ }
  return out;
}

// Open items per project, borrowed wholesale from the Outstanding screen so
// the two surfaces can never disagree.
function openByProject() {
  const out = {};
  let res;
  try { res = queryOutstanding('all'); } catch { return out; }
  for (const p of (res.projects || [])) out[p.name] = p.items.length;
  return out;
}

// Returns { [projectName]: { done, open, percent, basis, confidence } }.
// percent is null when there is nothing recorded to judge from.
function completionByProject() {
  const done = producedByProject();
  const open = openByProject();
  const names = new Set([...Object.keys(done), ...Object.keys(open)]);
  const out = {};
  for (const name of names) {
    const d = done[name] || 0;
    const o = open[name] || 0;
    const basis = d + o;
    out[name] = {
      done: d,
      open: o,
      basis,
      percent: basis === 0 ? null : Math.round((d / basis) * 100),
      confidence: basis === 0 ? 'none' : (basis < LOW_CONFIDENCE_BASIS ? 'low' : 'ok'),
    };
  }
  return out;
}

// Merge completion onto an existing project list without changing its shape —
// callers keep reading `name`, `sessions`, `incomplete` exactly as before.
function withCompletion(projects) {
  const c = completionByProject();
  return projects.map((p) => {
    const m = c[p.name] || { done: 0, open: 0, basis: 0, percent: null, confidence: 'none' };
    return { ...p, percentComplete: m.percent, doneItems: m.done, openItems: m.open,
             basis: m.basis, confidence: m.confidence };
  });
}

module.exports = { completionByProject, withCompletion, LOW_CONFIDENCE_BASIS };

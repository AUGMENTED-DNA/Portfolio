#!/usr/bin/env node
// precompute.js — build the Work History project list ahead of time (2026-08-31).
//
// WHY: a cold /api/work-history took ~2.2s, of which ~1.95s is ensureIndex()
// re-scanning session transcripts and ~0.17s was the last-active fallback
// re-running git and find across ~30 repos. server.js already had a 60-second
// in-memory cache, but it dies with the process and expires while you read the
// page, so the first load after any restart always paid full price.
//
// This writes the finished payload to disk so the server can answer instantly
// and, crucially, KEEP answering instantly across restarts. Run from cron every
// four hours; the page's Refresh button rebuilds on demand when you want live
// numbers rather than merely recent ones.
//
// Deliberately writes ATOMICALLY (temp file + rename): the server may read this
// file at any moment, and a half-written JSON payload would break the page in a
// way that looks like a data bug rather than a truncated write.

const fs   = require('fs');
const path = require('path');

const CACHE_DIR  = path.join(__dirname, 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'work-history.json');
// A FAILED scheduled run is otherwise invisible: the cache file simply stops
// advancing, which looks identical to a schedule that has not come round yet.
// That is not hypothetical — the first crontab line installed here used
// `PATH=... cd ... && node ...`, where the assignment scopes to `cd` ALONE, so
// node ran without it. Cron fired at 04:00 and 08:00 on 2026-09-01, failed both
// times with "node: not found", and the page showed only a date getting older.
// This marker lets the page say the rebuild is BROKEN rather than merely stale.
const ERROR_FILE = path.join(CACHE_DIR, 'work-history.error.json');

function build() {
  const idx = require('./indexer.js');
  const { withCompletion } = require('./completion.js');
  idx.ensureIndex(true);                       // full re-scan; this is the slow part
  const r = idx.queryProjects({});
  // Completion enrichment is precomputed too. Measured 2026-08-31: reading the
  // cache but re-running withCompletion() still cost ~400ms, because it rescans
  // the produced/open tallies per project. Storing the enriched rows means a
  // cached read is a file read and a JSON parse, nothing more.
  return {
    builtAt:    new Date().toISOString(),
    appVersion: r.appVersion || '',
    projects:   withCompletion(r.projects),
    filtered:   false,
  };
}

function write(payload) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = CACHE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
  fs.renameSync(tmp, CACHE_FILE);              // atomic on the same filesystem
}

function clearError() {
  try { if (fs.existsSync(ERROR_FILE)) fs.unlinkSync(ERROR_FILE); } catch { /* best effort */ }
}

function recordError(err) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(ERROR_FILE, JSON.stringify({
      failedAt: new Date().toISOString(),
      message:  (err && err.message) || String(err),
    }), 'utf8');
  } catch { /* if we cannot even record the failure, the log still has it */ }
}

function run() {
  const t0 = Date.now();
  try {
    const payload = build();
    write(payload);
    clearError();                              // a success retires the warning
    return { ms: Date.now() - t0, n: payload.projects.length, file: CACHE_FILE };
  } catch (e) {
    recordError(e);
    throw e;
  }
}

module.exports = { run, CACHE_FILE, ERROR_FILE };

if (require.main === module) {
  try {
    const r = run();
    console.log(`[precompute] ${r.n} projects in ${r.ms}ms -> ${r.file}`);
  } catch (e) {
    console.error('[precompute] FAILED:', e && e.message);
    process.exit(1);                           // cron surfaces a non-zero exit
  }
}

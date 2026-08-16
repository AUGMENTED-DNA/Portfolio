// Headless audit of the Portfolio Work History page.
// Loads the REAL index.html + app.js + styles.css against the RUNNING server,
// drives every screen and every control, and reports every defect in one pass.
// Written because Dane was acting as the visual QA for changes I could not see.
import { JSDOM, VirtualConsole } from 'jsdom';

const BASE = 'http://127.0.0.1:4040';
const fails = [], warns = [], notes = [];
const fail = (screen, what) => fails.push(`${screen} :: ${what}`);
const warn = (screen, what) => warns.push(`${screen} :: ${what}`);

const vc = new VirtualConsole();
const consoleErrors = [];
vc.on('jsdomError', (e) => consoleErrors.push(e.message));
vc.on('error', (...a) => consoleErrors.push(a.join(' ')));

const html = await (await fetch(BASE + '/')).text();
const dom = new JSDOM(html, {
  url: BASE + '/', runScripts: 'dangerously', resources: 'usable',
  pretendToBeVisual: true, virtualConsole: vc,
  // jsdom ships no matchMedia; theme.js calls it during boot, which aborted the
  // whole script and made every screen look empty. Harness gap, not a page bug —
  // real browsers all provide this.
  beforeParse(w) {
    w.matchMedia = (q) => ({ matches: false, media: q, onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {},
      removeEventListener() {}, dispatchEvent() { return false; } });
    // Same story for canvas: the legacy orbital launcher grabs a 2d context on
    // boot and jsdom has none, which killed the script before the work-history
    // code ran. Stubbed to whatever the drawing calls touch.
    const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop });
    Object.defineProperty(w.HTMLCanvasElement.prototype, 'getContext',
      { value: () => noop, writable: true, configurable: true });
    // jsdom 30 ships no fetch at all, so every screen rendered its error state
    // and the audit was measuring a dead page. Node's fetch, with relative URLs
    // resolved against the server the way a browser would.
    w.fetch = (u, o) => fetch(new URL(u, BASE), o);
  },
});
const { window } = dom;
const doc = window.document;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => doc.querySelector(s);
const $$ = (s) => [...doc.querySelectorAll(s)];
const txt = (el) => (el?.textContent || '').trim();

await sleep(6000);   // let the page boot, fetch and render

// ── 1. page loaded at all ────────────────────────────────────────────────────
if (!$('#wh-filter')) { console.log('FATAL: filter bar never rendered'); process.exit(1); }

// ── 2. every interactive control carries hover text (design standard 13a) ────
const controls = $$('#wh-filter button, .wh-nav-item, .crumb, .wh-frag-toggle, .wh-level-btn');
const noTip = controls.filter((b) => !b.getAttribute('title'));
if (noTip.length) fail('tooltips', `${noTip.length} control(s) with no hover text: `
  + noTip.map((b) => `"${txt(b)}"`).join(', '));
notes.push(`${controls.length} interactive controls checked for hover text`);

// ── 3. no strikethrough anywhere (design standard 13b) ───────────────────────
const css = await (await fetch(BASE + '/styles.css')).text();
if (/text-decoration:\s*[^;]*line-through/.test(css)) fail('styling', 'line-through present in styles.css');

// ── 4. numeric headings align with numeric cells ─────────────────────────────
if (!/th\.num\s*\{[^}]*text-align:\s*right/.test(css)) fail('alignment', 'th.num has no right-align rule');

// ── 5. the View row: labels, and drill buttons gated ─────────────────────────
const lvl = $$('#wh-filter button.wh-f-level');
const labels = lvl.map(txt);
if (labels.length !== 4) fail('View row', `expected 4 buttons, found ${labels.length}`);
if (!labels.includes('Roll-Up')) fail('View row', `"Roll-Up" missing — labels are: ${labels.join(', ')}`);
for (const key of ['functional', 'raw']) {
  const b = lvl.find((x) => x.dataset.level === key);
  if (!b) { fail('View row', `${key} button missing`); continue; }
  if (!b.disabled) fail('View row', `"${txt(b)}" is clickable on a list screen (should be disabled)`);
  if (!b.classList.contains('wh-f-disabled')) fail('View row', `"${txt(b)}" not dimmed on a list screen`);
  if (!/^Select a session/.test(b.getAttribute('title') || ''))
    fail('View row', `"${txt(b)}" tooltip does not lead with the unlocking action`);
}

// ── 6. Status row includes the third state ───────────────────────────────────
const comp = $$('#wh-filter button.wh-f-comp').map(txt);
if (!comp.some((c) => /verdict/i.test(c))) fail('Status row', `no "No verdict" option — has: ${comp.join(', ')}`);

// ── 7. drive each screen and check what renders ──────────────────────────────
const click = async (el, ms = 2500) => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await sleep(ms); };

// landing screen
const head = txt($('#work-content .wh-h'));
if (!head) fail('landing', 'no heading rendered');
notes.push(`landing heading: "${head}"`);

// Sessions view
const sessBtn = lvl.find((b) => b.dataset.level === 'sessions');
await click(sessBtn, 4000);
const sHead = txt($('#work-content .wh-h'));
if (!/session/i.test(sHead)) fail('Sessions', `heading did not change — reads "${sHead}"`);
const note = $('.wh-frag-note');
if (!note) fail('Sessions', 'fragment notice bar missing');
else {
  notes.push(`fragment notice: "${txt(note).slice(0, 110)}"`);
  if (!$('.wh-frag-toggle')) fail('Sessions', 'no toggle to reveal hidden fragments');
}
const sessRows = $$('#work-content table.wh tbody tr').length;
if (!sessRows) fail('Sessions', 'table rendered zero rows');
notes.push(`Sessions rows: ${sessRows}`);
const heads = $$('#work-content table.wh thead th').map(txt);
notes.push(`Sessions columns: ${heads.join(' | ')}`);
if (!heads.some((h) => /session/i.test(h))) fail('Sessions', 'no session-id column');

// drill into a session, then confirm the drill buttons come alive
const firstRow = $('#work-content table.wh tbody tr');
if (firstRow) {
  await click(firstRow, 4000);
  const f = $$('#wh-filter button.wh-f-level').find((x) => x.dataset.level === 'functional');
  if (f && f.disabled) fail('drill-in', 'Functional Items still disabled after opening a session');
  notes.push(`after opening a session, Functional Items enabled: ${f && !f.disabled}`);

  // v4.16: per-item ownership must reach the session view, not just Outstanding.
  if (f && !f.disabled) {
    await click(f, 3500);
    const fis = $$('.wh-fi');
    if (!fis.length) warn('functional items', 'this session recorded no items to check');
    else {
      const owned = $$('.wh-fi-owner');
      notes.push(`functional items: ${fis.length}, of which ${owned.length} carry an owner marker`);
      const kinds = [...new Set($$('.wh-fi-kind').map(txt))];
      notes.push(`item kinds present: ${kinds.join(', ') || '(none)'}`);
      // Every item marked outstanding must say who it is waiting on.
      const outstanding = fis.filter((el) => /outstanding/.test(txt(el.querySelector('.wh-fi-kind'))));
      const unowned = outstanding.filter((el) => !el.querySelector('.wh-fi-owner'));
      if (unowned.length) fail('functional items', `${unowned.length} outstanding item(s) with no owner marker`);
      const noTipOwner = owned.filter((el) => !el.getAttribute('title'));
      if (noTipOwner.length) fail('functional items', `${noTipOwner.length} owner marker(s) with no hover text`);
    }
  }
}

// back to Roll-Up
const rollBtn = $$('#wh-filter button.wh-f-level').find((b) => b.dataset.level === 'rollup');
await click(rollBtn, 4000);
const rHeads = $$('#work-content table.wh thead th').map(txt);
notes.push(`Roll-Up columns: ${rHeads.join(' | ')}`);

// ── 8. console errors ────────────────────────────────────────────────────────
// jsdom cannot rasterise a <canvas>, and the legacy orbital launcher grabs a 2d
// context on boot. That is a limitation of this harness, not a fault on the
// page — filtered by exact message so a genuine runtime error still fails the
// run. A test that always reports one failure teaches you to ignore all of them.
const HARNESS_NOISE = [/HTMLCanvasElement's getContext/, /Not implemented: window\.scrollTo/];
const realErrors = consoleErrors.filter((e) => !HARNESS_NOISE.some((r) => r.test(e)));
if (realErrors.length) fail('runtime', `${realErrors.length} console error(s): ${realErrors[0]}`);
if (consoleErrors.length !== realErrors.length)
  notes.push(`${consoleErrors.length - realErrors.length} jsdom-only error(s) filtered as harness noise`);

// ── report ──────────────────────────────────────────────────────────────────
console.log('\n════ OBSERVED ════');
notes.forEach((n) => console.log('  · ' + n));
console.log('\n════ DEFECTS ════');
if (!fails.length) console.log('  none');
fails.forEach((f) => console.log('  ✗ ' + f));
if (warns.length) { console.log('\n──── warnings ────'); warns.forEach((w) => console.log('  ! ' + w)); }
console.log(`\n${fails.length} defect(s), ${warns.length} warning(s)`);
window.close();
process.exit(fails.length ? 1 : 0);

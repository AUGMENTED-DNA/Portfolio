/* ─── Theme (light / dark) ────────────────────────────────────────────────────
 * Loaded from <head>, before the body exists, so the saved theme is on <html>
 * by the time the first paint happens — otherwise the page flashes dark before
 * snapping to light, which reads as a bug.
 *
 * The whole theme is one attribute: <html data-theme="light">. styles.css keys
 * every colour off that, so nothing else in the app has to know a theme exists.
 * The canvas in app.js is the one exception — a canvas paints pixels, not CSS —
 * so it listens for the themechange event this file dispatches.
 *
 * Printing does NOT go through here: styles.css forces light inside @media print,
 * because paper is white whichever theme is on screen.
 */
(() => {
  const KEY = 'portfolio.theme';
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: light)');

  /** Explicit choice if one was stored, otherwise whatever the OS is set to. */
  function preferred() {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage blocked — session-only */ }
    if (saved === 'light' || saved === 'dark') return saved;
    return media.matches ? 'light' : 'dark';
  }

  function apply(theme, persist) {
    root.setAttribute('data-theme', theme);
    if (persist) {
      try { localStorage.setItem(KEY, theme); } catch { /* storage blocked — session-only */ }
    }
    syncButton(theme);
    syncFrames(theme);
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  /* The button shows the theme you would switch TO, which is the convention
     users read fastest: a sun means "click for light". */
  function syncButton(theme) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const next = theme === 'light' ? 'dark' : 'light';
    const icon = btn.querySelector('.nav-icon');
    const label = btn.querySelector('.nav-label');
    if (icon) icon.textContent = next === 'light' ? '☀' : '☾';
    if (label) label.textContent = next === 'light' ? 'Light mode' : 'Dark mode';
    const title = `Switch to ${next} mode`;
    btn.title = title;
    btn.setAttribute('aria-label', title);
  }

  /* The Circular view is a same-origin iframe with its own stylesheet, so it
     needs to be told. Cross-origin frames (the v1 app on :3000) carry their own
     toggle and are deliberately left alone. */
  function syncFrames(theme) {
    const frame = document.getElementById('v18-frame');
    if (!frame || !frame.contentWindow) return;
    try { frame.contentWindow.postMessage({ type: 'theme', theme }, window.location.origin); } catch { /* frame not ready yet */ }
  }

  // Runs immediately, before first paint. Not persisted: following the OS is
  // not a choice the user made, and storing it would freeze that default.
  apply(preferred(), false);

  document.addEventListener('DOMContentLoaded', () => {
    syncButton(root.getAttribute('data-theme'));
    const btn = document.getElementById('theme-toggle');
    btn?.addEventListener('click', () => {
      apply(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light', true);
    });
    // Frames load lazily, so re-send once they are up.
    document.getElementById('v18-frame')?.addEventListener('load', () => {
      syncFrames(root.getAttribute('data-theme'));
    });
  });

  // Follow the OS only while the user has made no explicit choice of their own.
  media.addEventListener('change', (e) => {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
    if (!saved) apply(e.matches ? 'light' : 'dark', false);
  });

  window.PortfolioTheme = {
    get: () => root.getAttribute('data-theme') || 'dark',
    set: (t) => apply(t === 'light' ? 'light' : 'dark', true),
    toggle: () => apply(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light', true),
  };
})();

# Changelog

## v2.5 — 2026-06-11
- P2 menu entry now launches Windows-side Electron via cmd.exe
  (WSL/WSLg Electron broke transparency and resize) — opens at
  the 900px medium default
- Smooth zoom: +/− tweens the window size in 8 eased steps around
  the window's own center (previously snapped and re-centered on
  screen, causing visible jerking)
- Drag-to-move fixed: replaced nonexistent win.startWindowDrag()
  with cursor-polling drag (start-drag/end-drag IPC)
- New ? About button in top controls — overlay documents what the
  launcher is, what it does, how to use it, and how it works
- Red close X on center hub halved (CENTER_R 0.22 → 0.11 visual,
  0.15 hit zone) with "Close window" hover tooltip
- Help overlay text corrected: S/M/L resize → ? About, +/− zoom

## v2.2 — 2026-06-03
- Added dismissible help overlay shown on first launch
- 5 navigation rows: rotate ring, move window, open project,
  center hub, S/M/L resize and close controls
- Dismissed by click or Escape; remembered via localStorage
  (pai-help-seen key)

## v2.1 — 2026-05-30
- Drag-to-move: dragging the inner void or outer atmosphere
  moves the Electron window
- S/M/L resize buttons (650 / 900 / 1150 px) with re-centering
- Full on-screen controls revealed on hover at top edge

## v2.0 — 2026-05-30
- Close (✕) and minimize (−) controls added to Electron circle
- Controls fade in on hover, positioned at top center edge

## v1.9 — 2026-05-30
- Electron app loads circular v1.8 design (v18.html) directly
- Transparent frameless window with circular boundary
- Click-through enabled for all areas outside the circle

## v1.8 — 2026-05-29
- Three-way toggle: v1 Table / v1.7 Orbital / v1.8 Circular
- Circular design: 14 outer project nodes on rotating ring,
  center hub (PAI / Claude / Hermes), spoke lines, ratchet
  snap physics, Web Audio API click sound on each snap step

## v1.7 — 2026-05-29
- PWA orbital launcher: canvas-based rotating ring of 14 projects
- Ratchet snap physics, hover tooltips, click opens project port
- Service worker + manifest for PWA install support

## v1.6 — 2026-05-29
- Archived prior Node.js portfolio app into `v1/` subfolder
- Root cleared for new primary effort
- Updated CLAUDE.md to reflect archive location

## v1.5 — 2026-05-19
- Added CLAUDE.md context and .env.example

## v1.4 — 2026-04-24
- Table layout, watchdog, project detail pages, OPTIONS routing

## v1.3 — 2026-04-12
- Options Strategy Analyzer

## v1.2 — 2026-04-01
- Initial Node.js portfolio server

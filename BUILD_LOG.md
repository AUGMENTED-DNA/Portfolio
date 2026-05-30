# Portfolio Build Log

Running record of design decisions and build progress.
Format: `## YYYY-MM-DD — [Dane | SOL]`

---

## 2026-05-29 — Dane
- Prior Node.js portfolio app archived to `v1/`
- Vision: PWA orbital launcher replacing the text-based project menu
- Design: circular framework, not rectangular
- Central static circle containing 3 inner sub-circles: PAI, Claude, Hermes
- 14 outer project circles, evenly spaced (~25.7° apart)
- Outer ring ratchets/rotates — clicks/snaps into place at each position
- Spoke lines connecting each outer circle to the center
- Subtle click sound on each ratchet step
- Clicking an outer circle opens that project's PWA in its own window

## 2026-05-29 — SOL
- v1.6 tagged and pushed — root is clean for new build
- DiagnosticCapGuard threshold raised from 5 → 12 (was blocking user-directed reads)
- All 17 active projects confirmed from PROJECTS.md
- Layout decided: 14 outer positions + center hub with 3 static inner circles
- **Open question:** which specific projects/systems map to the 3 center circles
  (PAI, Claude, Hermes)? "Hermes" not currently in PROJECTS.md.
- **Next step:** answer center-circle identity → build starts

## 2026-05-29 — SOL (design finalized)
### Center hub mapping (3 static sub-circles):
- PAI → PAI GUI + PAI Visual (both PAI projects represented as one icon)
- Claude → launch point for Claude Code (not a PROJECTS.md entry)
- Hermes → new project (placeholder until defined)

### Outer ring (14 positions, ~25.7° apart):
1. Email Agent
2. Todoist Agent
3. Health
4. Spinners
5. Aphorism
6. YT
7. Handyman
8. Meissler News
9. CCBridge
10. FINANCIAL
11. Hub-Bridge
12. Utilities
13. Content-Converter
14. Council

### Excluded from outer ring:
- PAI GUI → center hub (PAI)
- PAI Visual → center hub (PAI)
- Portfolio → this app IS the launcher

### Tech stack:
- Pure HTML/CSS/JS — no framework
- PWA manifest + service worker
- Web Audio API for click sound (no audio files needed)
- CSS transforms + requestAnimationFrame for orbital animation
- window.open() for spawning project windows

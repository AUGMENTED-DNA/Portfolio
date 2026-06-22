'use strict';

// ─── Project data ────────────────────────────────────────────────────────────
const OUTER = [
  { name: 'Email Agent',        port: 8082, icon: '✉',  color: '#4285f4' },
  { name: 'Todoist Agent',      port: 5000, icon: '✓',  color: '#db4035' },
  { name: 'Health',             port: 3100, icon: '♥',  color: '#34a853' },
  { name: 'Spinners',           port: 7433, icon: '◎',  color: '#9c27b0' },
  { name: 'Aphorism',           port: 7434, icon: '❝',  color: '#ff9800' },
  { name: 'YT',                 port: 8500, icon: '▶',  color: '#ff0000' },
  { name: 'Handyman',           port: null, icon: '⚒',  color: '#795548' },
  { name: 'Meissler News',      port: 7654, icon: '◈',  color: '#607d8b' },
  { name: 'CCBridge',           port: 8200, icon: '⇄',  color: '#00bcd4' },
  { name: 'FINANCIAL',          port: 3200, icon: '◉',  color: '#4caf50' },
  { name: 'Hub-Bridge',         port: null, icon: '⬡',  color: '#ff5722' },
  { name: 'Utilities',          port: 9000, icon: '⚙',  color: '#9e9e9e' },
  { name: 'Content-Converter',  port: 4000, icon: '⟳',  color: '#673ab7' },
  { name: 'Council',            port: 8765, icon: '⚖',  color: '#e91e63' },
];

const CENTER_ITEMS = [
  { name: 'PAI',    icon: '⬢', color: '#3b5bdb', port: 4200 },
  { name: 'Claude', icon: '◉', color: '#8ab4f8', port: null },
  { name: 'Hermes', icon: '⚡', color: '#ffd700', port: null },
];

// ─── Canvas setup ────────────────────────────────────────────────────────────
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
const tip    = document.getElementById('tooltip');

let W, H, CX, CY, ORBIT_R, NODE_R, CENTER_R, INNER_R, CIRCLE_R;

function resize() {
  const cont = canvas.parentElement;
  W = canvas.width  = (cont && cont.clientWidth)  || window.innerWidth;
  H = canvas.height = (cont && cont.clientHeight) || window.innerHeight;
  CX = W / 2; CY = H / 2;
  const minDim = Math.min(W, H);
  CIRCLE_R = minDim / 2;
  ORBIT_R  = minDim * 0.37;
  NODE_R   = minDim * 0.055;
  CENTER_R = minDim * 0.10;
  INNER_R  = CENTER_R * 0.30;
}
window.addEventListener('resize', resize);
resize();

// ─── Audio (Web Audio API) ───────────────────────────────────────────────────
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new AudioContext();
}
function playClick() {
  if (!audioCtx) return;
  const sr  = audioCtx.sampleRate;
  const buf = audioCtx.createBuffer(1, sr * 0.05, sr);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.007));
  }
  const src  = audioCtx.createBufferSource();
  src.buffer = buf;
  const g    = audioCtx.createGain();
  g.gain.value = 0.15;
  src.connect(g);
  g.connect(audioCtx.destination);
  src.start();
}

// ─── Ratchet state ────────────────────────────────────────────────────────────
const N      = OUTER.length;
const STEP   = (Math.PI * 2) / N;
let angle    = 0;
let velocity = 0;
let lastSnap = 0;
const DAMPING  = 0.91;
const AUTO_VEL = 0.0007;
let autoRotate = true;

let snapProgress = 0;
let snapFrom = 0, snapTo = 0;
const SNAP_FRAMES     = 14;
const SNAP_THRESHOLD  = STEP * 0.45;

function nearestSnap() { return Math.round(angle / STEP) * STEP; }

function tickPhysics() {
  if (snapProgress > 0) {
    snapProgress--;
    const t    = 1 - snapProgress / SNAP_FRAMES;
    const ease = t < 0.5 ? 2*t*t : -1 + (4-2*t)*t;
    angle    = snapFrom + (snapTo - snapFrom) * ease;
    velocity = 0;
    return;
  }
  if (autoRotate) velocity = AUTO_VEL;
  angle    += velocity;
  velocity *= DAMPING;
  const target = nearestSnap();
  const dist   = Math.abs(angle - target);
  if (dist < SNAP_THRESHOLD && Math.abs(angle - lastSnap) > STEP * 0.5) {
    lastSnap     = target;
    snapFrom     = angle;
    snapTo       = target;
    snapProgress = SNAP_FRAMES;
    playClick();
  }
  if (!autoRotate && Math.abs(velocity) < 0.0001) autoRotate = true;
}

// ─── Hit detection ────────────────────────────────────────────────────────────
function nodePos(i) {
  const a = angle + i * STEP - Math.PI / 2;
  return { x: CX + Math.cos(a) * ORBIT_R, y: CY + Math.sin(a) * ORBIT_R };
}
function isInCircle(mx, my) {
  return Math.hypot(mx - CX, my - CY) < CIRCLE_R * 0.97;
}
function hitNode(mx, my) {
  for (let i = 0; i < N; i++) {
    const p = nodePos(i);
    if (Math.hypot(mx - p.x, my - p.y) < NODE_R) return i;
  }
  return null;
}
function hitCenterItem(mx, my) {
  for (let i = 0; i < CENTER_ITEMS.length; i++) {
    const a  = (i / CENTER_ITEMS.length) * Math.PI * 2 - Math.PI / 2;
    const r  = CENTER_R * 0.55;
    const cx = CX + Math.cos(a) * r;
    const cy = CY + Math.sin(a) * r;
    if (Math.hypot(mx - cx, my - cy) < INNER_R * 1.2) return i;
  }
  return null;
}
// Inner void + outer atmosphere = window-drag zones
function isBackgroundZone(mx, my) {
  const d = Math.hypot(mx - CX, my - CY);
  return (d < ORBIT_R - NODE_R - 5 && d > CENTER_R * 1.2) ||
         (d > ORBIT_R + NODE_R + 10 && d < CIRCLE_R * 0.97);
}

// ─── Drag / click-through ────────────────────────────────────────────────────
let dragging = false, prevDragAngle = 0;

function ptrAngle(x, y) { return Math.atan2(y - CY, x - CX); }

// Event coords are viewport-relative; all circle math is canvas-local.
// The canvas sits offset inside the page, so convert before hit-testing.
function localXY(e) {
  const b = canvas.getBoundingClientRect();
  return { x: e.clientX - b.left, y: e.clientY - b.top };
}

canvas.addEventListener('pointerdown', e => {
  ensureAudio();
  const p = localXY(e);
  if (!isInCircle(p.x, p.y)) return;

  // Background zone (inner void, outer atmosphere) -> move the window
  if (window.electron && isBackgroundZone(p.x, p.y)) {
    window.electron.startDrag();
    return;
  }

  dragging      = true;
  autoRotate    = false;
  velocity      = 0;
  prevDragAngle = ptrAngle(p.x, p.y);
  canvas.classList.add('dragging');
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', e => {
  const p = localXY(e);
  const inCircle = isInCircle(p.x, p.y);

  // click-through for transparent areas (Electron only)
  if (window.electron) {
    window.electron.setIgnoreMouse(!inCircle);
  }

  if (!dragging) {
    handleHover(p.x, p.y, e.clientX, e.clientY);
    return;
  }
  const a = ptrAngle(p.x, p.y);
  let delta = a - prevDragAngle;
  if (delta >  Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  velocity      = delta * 0.6;
  angle        += delta;
  prevDragAngle = a;
});

canvas.addEventListener('pointerup', () => {
  dragging = false;
  canvas.classList.remove('dragging');
  if (window.electron) window.electron.endDrag();
});
window.addEventListener('blur', () => {
  if (window.electron) window.electron.endDrag();
});

canvas.addEventListener('click', e => {
  const p  = localXY(e);
  const ni = hitNode(p.x, p.y);
  if (ni !== null) { openProject(OUTER[ni]); return; }

  // Hit-test the red close X at bottom of center hub
  // (visual radius is 0.11; hit zone kept larger so it stays clickable)
  if (isOverCloseX(p.x, p.y)) {
    if (window.electron) window.electron.close();
    return;
  }

  const ci = hitCenterItem(p.x, p.y);
  if (ci !== null) { openCenter(CENTER_ITEMS[ci]); }
});

// ─── Hover tooltip ────────────────────────────────────────────────────────────
let hoveredNode = null;
let hoveredX    = false;
function isOverCloseX(mx, my) {
  return Math.hypot(mx - CX, my - (CY + CENTER_R * 0.78)) < CENTER_R * 0.15;
}
function handleHover(mx, my, vx, vy) {
  // mx/my are canvas-local (hit-testing); vx/vy are viewport (tooltip)
  const h     = hitNode(mx, my);
  const overX = isOverCloseX(mx, my);
  if (h !== hoveredNode || overX !== hoveredX) {
    hoveredNode = h;
    hoveredX    = overX;
    if (h !== null) {
      tip.textContent = OUTER[h].name;
      tip.classList.add('visible');
    } else if (overX) {
      tip.textContent = 'Close window';
      tip.classList.add('visible');
    } else {
      tip.classList.remove('visible');
    }
  }
  if (hoveredNode !== null || hoveredX) {
    tip.style.left = (vx + 16) + 'px';
    tip.style.top  = (vy - 10) + 'px';
  }
  // Show move cursor in window-drag background zones
  if (h !== null || overX) {
    canvas.style.cursor = 'pointer';
  } else if (window.electron && isInCircle(mx, my) && isBackgroundZone(mx, my)) {
    canvas.style.cursor = 'move';
  } else {
    canvas.style.cursor = '';
  }
}

// ─── Project launcher ─────────────────────────────────────────────────────────
function openProject(p) {
  if (!p.port) { console.log(`${p.name} — no port configured`); return; }
  window.open(`http://localhost:${p.port}`, p.name,
    'width=1280,height=820,menubar=no,toolbar=no,location=no');
}
function openCenter(item) {
  if (item.name === 'Claude') {
    alert('Open a WSL terminal and run: claude');
    return;
  }
  if (!item.port) { console.log(`${item.name} — no port configured`); return; }
  window.open(`http://localhost:${item.port}`, item.name,
    'width=1280,height=820,menubar=no,toolbar=no,location=no');
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────
function drawSpoke(px, py) {
  ctx.beginPath();
  ctx.moveTo(CX, CY);
  ctx.lineTo(px, py);
  ctx.strokeStyle = 'rgba(138,180,248,0.10)';
  ctx.lineWidth   = 1;
  ctx.stroke();
}

function drawNode(pos, proj, i) {
  const normAngle = ((angle + i * STEP) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const isTop = Math.abs(normAngle - Math.PI * 1.5) < STEP * 0.6 ||
                Math.abs(normAngle - Math.PI * 1.5 + Math.PI * 2) < STEP * 0.6;
  const alpha = isTop ? 1.0 : 0.6;

  // glow
  const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, NODE_R * 1.5);
  g.addColorStop(0,   proj.color + Math.round(alpha * 60).toString(16).padStart(2,'0'));
  g.addColorStop(1,   'transparent');
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, NODE_R * 1.5, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  // body
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, NODE_R, 0, Math.PI * 2);
  ctx.fillStyle   = 'rgba(10,12,20,0.88)';
  ctx.fill();
  ctx.strokeStyle = proj.color + (isTop ? 'ff' : '88');
  ctx.lineWidth   = isTop ? 2.5 : 1.5;
  ctx.stroke();

  // icon
  ctx.fillStyle    = proj.color;
  ctx.font         = `${NODE_R * 0.72}px system-ui`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(proj.icon, pos.x, pos.y);

  // label
  ctx.fillStyle    = `rgba(200,212,255,${alpha * 0.75})`;
  ctx.font         = `${NODE_R * 0.33}px system-ui`;
  ctx.textBaseline = 'top';
  ctx.fillText(proj.name, pos.x, pos.y + NODE_R + 5);
}

function drawCenter() {
  // outer glow
  const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, CENTER_R * 2);
  g.addColorStop(0,   'rgba(59,91,219,0.22)');
  g.addColorStop(0.6, 'rgba(59,91,219,0.06)');
  g.addColorStop(1,   'transparent');
  ctx.beginPath();
  ctx.arc(CX, CY, CENTER_R * 2, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  // center disk
  ctx.beginPath();
  ctx.arc(CX, CY, CENTER_R, 0, Math.PI * 2);
  ctx.fillStyle   = 'rgba(10,12,20,0.90)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(59,91,219,0.65)';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // 3 sub-circles
  CENTER_ITEMS.forEach((item, i) => {
    const a  = (i / CENTER_ITEMS.length) * Math.PI * 2 - Math.PI / 2;
    const r  = CENTER_R * 0.54;
    const cx = CX + Math.cos(a) * r;
    const cy = CY + Math.sin(a) * r;

    ctx.beginPath();
    ctx.arc(cx, cy, INNER_R, 0, Math.PI * 2);
    ctx.fillStyle   = 'rgba(10,12,20,0.9)';
    ctx.fill();
    ctx.strokeStyle = item.color + '88';
    ctx.lineWidth   = 1.2;
    ctx.stroke();

    ctx.fillStyle    = item.color;
    ctx.font         = `${INNER_R * 0.9}px system-ui`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.icon, cx, cy);

    ctx.fillStyle    = 'rgba(200,212,255,0.65)';
    ctx.font         = `${INNER_R * 0.52}px system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText(item.name, cx, cy + INNER_R + 3);
  });

  // Red close X at bottom of center hub
  const xR = CENTER_R * 0.11;
  const xY = CY + CENTER_R * 0.78;
  ctx.beginPath();
  ctx.arc(CX, xY, xR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10,12,20,0.90)';
  ctx.fill();
  ctx.strokeStyle = '#e53935';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = '#e53935';
  ctx.lineWidth = 2;
  const xOff = xR * 0.45;
  ctx.beginPath();
  ctx.moveTo(CX - xOff, xY - xOff); ctx.lineTo(CX + xOff, xY + xOff);
  ctx.moveTo(CX + xOff, xY - xOff); ctx.lineTo(CX - xOff, xY + xOff);
  ctx.stroke();
}

// ─── Main loop ────────────────────────────────────────────────────────────────
function frame() {
  ctx.clearRect(0, 0, W, H);
  tickPhysics();
  for (let i = 0; i < N; i++) drawSpoke(nodePos(i).x, nodePos(i).y);
  for (let i = 0; i < N; i++) drawNode(nodePos(i), OUTER[i], i);
  drawCenter();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// ─── Left-nav routing ──────────────────────────────────────────────────────────
const VIEWS = ['v17', 'v18', 'v1', 'work'];
const crumbsEl  = document.getElementById('crumbs');
const whNavList = document.getElementById('wh-nav-list');
const whArrow   = document.querySelector('#nav-work .wh-arrow');

function showView(target) {
  document.querySelectorAll('.nav-item').forEach(b =>
    b.classList.toggle('active', b.dataset.target === target));
  VIEWS.forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.classList.toggle('hidden', v !== target);
  });
  if (target === 'v17') resize();   // canvas needs live dimensions when revealed
}
function setWhExpanded(exp) {
  whNavList.classList.toggle('hidden', !exp);
  if (whArrow) whArrow.textContent = exp ? '▾' : '▸';
}
// Plain nav items just switch views. Work History gets a single/double-click
// scope toggle: one click = white folder + by-project overview; two quick
// clicks = green folder + all-projects detail.
const whFolderEl = document.getElementById('wh-folder');
function setFolderScope(scope) {
  whScope = scope;
  if (whFolderEl) { whFolderEl.classList.toggle('all', scope === 'all'); whFolderEl.textContent = scope === 'all' ? '🗁' : '🗀'; }
}
document.querySelectorAll('.nav-item').forEach(btn => {
  if (btn.id === 'nav-work') return;        // handled separately below
  btn.addEventListener('click', () => showView(btn.dataset.target));
});
let _whClickTimer = null;
document.getElementById('nav-work')?.addEventListener('click', () => {
  showView('work'); setWhExpanded(true); workMsg('Loading…');
  if (_whClickTimer) {                       // second click within window → all-projects
    clearTimeout(_whClickTimer); _whClickTimer = null;
    setFolderScope('all'); showAllProjects();
  } else {
    _whClickTimer = setTimeout(() => {       // settled as a single click → by-project
      _whClickTimer = null;
      setFolderScope('project'); showProjects();
    }, 280);
  }
});
whArrow?.addEventListener('click', (e) => {
  e.stopPropagation();
  setWhExpanded(whNavList.classList.contains('hidden'));
});
document.getElementById('brand')?.addEventListener('click', () => showView('v17'));

// Populate the collapsible project list under Work History + set version badges.
async function buildNav() {
  let data;
  try { data = await (await fetch(whApi())).json(); } catch { return; }
  if (data.appVersion) {
    const bt = document.querySelector('#brand .brand-text');
    if (bt) bt.textContent = 'PAI Portfolio ' + data.appVersion;
  }
  whNavList.replaceChildren();
  (data.projects || []).forEach(p => {
    const b = document.createElement('button'); b.className = 'wh-nav-item';
    const nm = document.createElement('span'); nm.textContent = p.name;
    const ct = document.createElement('span'); ct.className = 'wh-nav-count'; ct.textContent = p.sessions;
    b.append(nm, ct);
    b.addEventListener('click', () => { showView('work'); showSessions(p.name); });
    whNavList.appendChild(b);
  });
}
// ─── Date-range filter (top of Work History) ────────────────────────────────────
const whRange = { from: '', to: '', preset: 'all' };
let whCurrent = null;                       // selected project, or null on the overview
let whScope   = 'project';                  // 'project' = white folder · 'all' = green folder
let whEffortId    = null;                   // drilled-into work effort (null = on the roll-up list)
let whEffortLevel = 'functional';           // within an effort: 'functional' (L2) | 'raw' (L1)

const _pad = (n) => String(n).padStart(2, '0');
const _ymd = (d) => `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;
function presetRange(key) {
  const now = new Date();
  const today = _ymd(now);
  const back = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return _ymd(d); };
  switch (key) {
    case 'today':     return { from: today,    to: today };
    case 'yesterday': return { from: back(1),  to: back(1) };
    case '7':         return { from: back(6),  to: today };
    case '30':        return { from: back(29), to: today };
    default:          return { from: '', to: '' };          // all time
  }
}
function whApi(opts) {
  const o = opts || {};
  const p = [];
  if (o.project)              p.push('project=' + encodeURIComponent(o.project));
  else if (o.scope === 'all') p.push('scope=all');
  if (whRange.from)           p.push('from=' + whRange.from);
  if (whRange.to)             p.push('to='   + whRange.to);
  return '/api/work-history' + (p.length ? '?' + p.join('&') : '');
}

const WH_PRESETS = [['all', 'All'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['7', 'Last 7 days'], ['30', 'Last 30 days']];
let whFilterBar = null;
function setActivePreset(key) {
  whFilterBar?.querySelectorAll('button.wh-f-preset[data-preset]').forEach((b) =>
    b.classList.toggle('active', b.dataset.preset === key));
}
function updateFilterUI() {
  const s = document.getElementById('wh-f-summary');
  if (s) s.textContent = (whRange.from || whRange.to)
    ? 'showing ' + (whRange.from || '…') + ' → ' + (whRange.to || '…')
    : 'showing all time';
  const fI = document.getElementById('wh-from'), tI = document.getElementById('wh-to');
  if (fI) fI.value = whRange.from;
  if (tI) tI.value = whRange.to;
}
async function reloadWork() {
  await buildNav();
  if (whCurrent) await showSessions(whCurrent);
  else if (whScope === 'all') await showAllProjects();
  else await showProjects();
}
async function applyPreset(key) {
  const r = presetRange(key);
  whRange.from = r.from; whRange.to = r.to; whRange.preset = key;
  setActivePreset(key); updateFilterUI(); await reloadWork();
}
async function applyCustom() {
  const fI = document.getElementById('wh-from'), tI = document.getElementById('wh-to');
  whRange.from = (fI && fI.value) || ''; whRange.to = (tI && tI.value) || ''; whRange.preset = 'custom';
  setActivePreset(null); updateFilterUI(); await reloadWork();
}
// ─── Level control: Roll-Up (list) ▸ Functional Items ▸ Raw (drill within effort) ─
const WH_LEVELS = [['rollup', 'Roll-Up'], ['functional', 'Functional Items'], ['raw', 'Raw']];
function setActiveLevel(key) {
  whFilterBar?.querySelectorAll('button.wh-f-level[data-level]').forEach((b) =>
    b.classList.toggle('active', b.dataset.level === key));
}
// Most-recent effort in the current list context (for level jumps with no row click).
async function firstEffortId() {
  if (!whCurrent && whScope !== 'all') return null;     // project overview has no single effort list
  try {
    const url = whCurrent ? whApi({ project: whCurrent }) : whApi({ scope: 'all' });
    const d = await (await fetch(url)).json();
    return (d.sessions && d.sessions[0] && d.sessions[0].id) || null;
  } catch { return null; }
}
async function applyLevel(key) {
  if (key === 'rollup') { whEffortId = null; setActiveLevel('rollup'); await reloadWork(); return; }
  const id = whEffortId || await firstEffortId();
  if (!id) { setActiveLevel('rollup'); return; }          // nothing to drill into
  whEffortLevel = key; await showEffort(id, key);
}
function ensureFilterBar() {
  if (whFilterBar) return;
  const bar = document.createElement('div'); bar.id = 'wh-filter';
  const lbl = document.createElement('span'); lbl.className = 'wh-f-label'; lbl.textContent = 'Date:';
  bar.appendChild(lbl);
  WH_PRESETS.forEach(([key, label]) => {
    const b = document.createElement('button'); b.className = 'wh-f-preset'; b.dataset.preset = key; b.textContent = label;
    b.addEventListener('click', () => applyPreset(key));
    bar.appendChild(b);
  });
  const dot = document.createElement('span'); dot.className = 'wh-f-sep'; dot.textContent = '·'; bar.appendChild(dot);
  const fromI = document.createElement('input'); fromI.type = 'date'; fromI.id = 'wh-from'; fromI.title = 'From date';
  const arrow = document.createElement('span'); arrow.className = 'wh-f-sep'; arrow.textContent = '→';
  const toI = document.createElement('input'); toI.type = 'date'; toI.id = 'wh-to'; toI.title = 'To date';
  const go = document.createElement('button'); go.className = 'wh-f-preset'; go.textContent = 'Apply';
  go.addEventListener('click', applyCustom);
  bar.append(fromI, arrow, toI, go);
  const lvlSep = document.createElement('span'); lvlSep.className = 'wh-f-sep'; lvlSep.textContent = '·'; bar.appendChild(lvlSep);
  const lvlLbl = document.createElement('span'); lvlLbl.className = 'wh-f-label'; lvlLbl.textContent = 'View:'; bar.appendChild(lvlLbl);
  WH_LEVELS.forEach(([key, label]) => {
    const b = document.createElement('button'); b.className = 'wh-f-level'; b.dataset.level = key; b.textContent = label;
    b.addEventListener('click', () => applyLevel(key));
    bar.appendChild(b);
  });
  const spacer = document.createElement('span'); spacer.className = 'wh-f-spacer'; bar.appendChild(spacer);
  const summary = document.createElement('span'); summary.className = 'wh-f-summary'; summary.id = 'wh-f-summary';
  bar.appendChild(summary);
  const view = document.getElementById('view-work');
  view.insertBefore(bar, view.firstChild);
  whFilterBar = bar;
  setActivePreset('all'); setActiveLevel('rollup'); updateFilterUI();
}

// Only wire the launcher's nav + Work History when its shell is present.
// v18.html also loads app.js (for the orbital canvas) but has no nav shell.
if (whNavList) { ensureFilterBar(); buildNav(); }

// ─── Work History (session records, tabular) ────────────────────────────────────
const workEl = document.getElementById('work-content');

function setCrumbs(parts) {
  crumbsEl.replaceChildren();
  parts.forEach((p, i) => {
    if (i) {
      const s = document.createElement('span'); s.className = 'sep'; s.textContent = '/';
      crumbsEl.appendChild(s);
    }
    const b = document.createElement('button');
    b.className = 'crumb' + (p.onClick ? '' : ' current');
    b.textContent = p.label;
    if (p.onClick) b.addEventListener('click', p.onClick);
    crumbsEl.appendChild(b);
  });
}
function workMsg(t) {
  const d = document.createElement('div'); d.className = 'wh-empty'; d.textContent = t;
  workEl.replaceChildren(d);
}
function mkCell(text, cls) {
  const td = document.createElement('td'); if (cls) td.className = cls; td.textContent = text; return td;
}

async function showProjects() {
  whCurrent = null;
  setCrumbs([{ label: 'Home', onClick: () => showView('v17') }, { label: 'Work History', onClick: null }]);
  workMsg('Loading projects…');
  let data;
  try { data = await (await fetch(whApi())).json(); }
  catch (e) { workMsg('Could not load work history.'); return; }
  const wrap = document.createElement('div'); wrap.className = 'wh-wrap';
  const h = document.createElement('div'); h.className = 'wh-h'; h.textContent = 'Work History by Project';
  const sub = document.createElement('div'); sub.className = 'wh-sub';
  const n = (data.projects || []).length;
  const rangeNote = data.filtered
    ? ' worked between ' + (data.from || '…') + ' and ' + (data.to || '…')
    : ' with recorded Claude sessions';
  sub.textContent = n + ' project' + (n === 1 ? '' : 's') + rangeNote +
    ' — click one to see its work by topic & session.';
  wrap.append(h, sub);
  if (!n) {
    const e = document.createElement('div'); e.className = 'wh-empty';
    e.textContent = data.filtered ? 'No projects were worked in this date range.' : 'No session records found.';
    wrap.append(e); workEl.replaceChildren(wrap); return;
  }
  const table = document.createElement('table'); table.className = 'wh';
  const thead = document.createElement('thead'); const htr = document.createElement('tr');
  [['Project', ''], ['Version', 'ver'], ['Sessions', 'num'], ['Last Active', '']].forEach(([t, cls]) => {
    const th = document.createElement('th'); th.textContent = t; if (cls === 'num') th.className = 'num'; htr.appendChild(th);
  });
  thead.appendChild(htr); table.appendChild(thead);
  const tb = document.createElement('tbody');
  data.projects.forEach(p => {
    const tr = document.createElement('tr'); tr.className = 'clickable';
    tr.append(mkCell(p.name), mkCell(p.version || '—', 'ver'), mkCell(p.sessions, 'num'), mkCell(p.lastActive || '—', 'date'));
    tr.addEventListener('click', () => showSessions(p.name));
    tb.appendChild(tr);
  });
  table.appendChild(tb); wrap.appendChild(table); workEl.replaceChildren(wrap);
}

async function showSessions(name) {
  whCurrent = name; whEffortId = null; setActiveLevel('rollup');
  setCrumbs([
    { label: 'Home', onClick: () => showView('v17') },
    { label: 'Work History', onClick: showProjects },
    { label: name, onClick: null },
  ]);
  workMsg('Loading ' + name + ' sessions…');
  let data;
  try { data = await (await fetch(whApi({ project: name }))).json(); }
  catch (e) { workMsg('Could not load sessions for ' + name + '.'); return; }
  const wrap = document.createElement('div'); wrap.className = 'wh-wrap';
  const ver = data.version ? ' ' + data.version : '';
  const h = document.createElement('div'); h.className = 'wh-h'; h.textContent = name + ver + ' — Work-Effort Roll-Up';
  const sub = document.createElement('div'); sub.className = 'wh-sub';
  sub.textContent = data.total + ' work effort' + (data.total === 1 ? '' : 's') + ' recorded — showing ' +
    data.shown + ' · click a row to drill into its functional items and raw exchanges.';
  wrap.append(h, sub);
  const sessions = data.sessions || [];
  if (!sessions.length) {
    const e = document.createElement('div'); e.className = 'wh-empty'; e.textContent = 'No work efforts found for this project.';
    wrap.append(e); workEl.replaceChildren(wrap); return;
  }
  wrap.appendChild(renderRollupTable(sessions, false));
  workEl.replaceChildren(wrap);
}

// ─── All-projects roll-up (green folder) ──────────────────────────────────────
async function showAllProjects() {
  whCurrent = null; whEffortId = null; setActiveLevel('rollup'); setFolderScope('all');
  setCrumbs([{ label: 'Home', onClick: () => showView('v17') }, { label: 'Work History — All Projects', onClick: null }]);
  workMsg('Loading all projects…');
  let data;
  try { data = await (await fetch(whApi({ scope: 'all' }))).json(); }
  catch (e) { workMsg('Could not load all-projects work history.'); return; }
  const wrap = document.createElement('div'); wrap.className = 'wh-wrap';
  const h = document.createElement('div'); h.className = 'wh-h'; h.textContent = 'Work History — All Projects';
  const sub = document.createElement('div'); sub.className = 'wh-sub';
  const rangeNote = data.filtered ? (data.from || '…') + ' → ' + (data.to || '…') : 'all time';
  sub.textContent = data.shown + ' of ' + data.total + ' work effort' + (data.total === 1 ? '' : 's') +
    ' across all projects · ' + rangeNote + ' · click a row to drill in.';
  wrap.append(h, sub);
  const sessions = data.sessions || [];
  if (!sessions.length) {
    const e = document.createElement('div'); e.className = 'wh-empty';
    e.textContent = data.filtered ? 'No work recorded in this date range.' : 'No session records found.';
    wrap.append(e); workEl.replaceChildren(wrap); return;
  }
  wrap.appendChild(renderRollupTable(sessions, true));
  workEl.replaceChildren(wrap);
}

// ─── Level 3: roll-up table (one row per work effort) ─────────────────────────
const clipText = (s, n) => { s = (s || '').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
function evalBadge(s) {
  const span = document.createElement('span'); const ok = s.eval_ok;
  span.className = 'wh-eval ' + (ok === 1 ? 'ok' : ok === 0 ? 'bad' : 'none');
  span.textContent = ok === 1 ? '✅ Complete' : ok === 0 ? '⚠️ Incomplete' : '— No verdict';
  span.title = s.evaluation || '';
  return span;
}
// A Session cell: 8-char session id (mono, dim) above the session title.
function mkSessionCell(s) {
  const td = document.createElement('td'); td.className = 'wh-sess';
  const idEl = document.createElement('div'); idEl.className = 'wh-sess-id'; idEl.textContent = (s.id || '').slice(0, 8) || '—';
  const tEl = document.createElement('div'); tEl.className = 'wh-sess-title'; tEl.textContent = s.topic || '(untitled)';
  td.append(idEl, tEl); return td;
}
// Level-3 roll-up: Date · [Project] · Session · Requested · Produced · Evaluation.
function renderRollupTable(sessions, showProject) {
  const cols = [{ key: 'date', label: 'Date', cls: 'date' }];
  if (showProject) cols.push({ key: 'project', label: 'Project', cls: 'wh-proj' });
  cols.push({ key: 'session',   label: 'Session',     cls: 'wh-sess' },
            { key: 'requested', label: 'Requested',   cls: 'wh-req' },
            { key: 'produced',  label: 'Produced',    cls: 'wh-prod' },
            { key: 'eval',      label: 'Evaluation',  cls: '' });
  const table = document.createElement('table'); table.className = 'wh';
  const thead = document.createElement('thead'); const htr = document.createElement('tr');
  cols.forEach(c => { const th = document.createElement('th'); th.textContent = c.label; htr.appendChild(th); });
  thead.appendChild(htr); table.appendChild(thead);
  const tb = document.createElement('tbody');
  sessions.forEach(s => {
    const tr = document.createElement('tr'); tr.className = 'clickable';
    cols.forEach(c => {
      if (c.key === 'session') { tr.appendChild(mkSessionCell(s)); return; }
      if (c.key === 'eval')    { const td = document.createElement('td'); td.appendChild(evalBadge(s)); tr.appendChild(td); return; }
      let v;
      switch (c.key) {
        case 'date':      v = s.date || '—'; break;
        case 'project':   v = s.project || '—'; break;
        case 'requested': v = s.requested || s.action || '—'; break;
        case 'produced':  v = s.produced || s.committed || '—'; break;
        default:          v = '—';
      }
      tr.appendChild(mkCell(v, c.cls));
    });
    tr.addEventListener('click', () => showEffort(s.id, 'functional'));
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  return table;
}

// ─── Levels 2 & 1: drill into one work effort (functional items / raw exchanges) ─
async function showEffort(id, level) {
  whEffortId = id; whEffortLevel = level; setActiveLevel(level);
  workMsg('Loading work effort…');
  let d;
  try { d = await (await fetch('/api/work-history?effort=' + encodeURIComponent(id))).json(); }
  catch (e) { workMsg('Could not load this work effort.'); return; }
  if (!d || d.error || !d.effort) { workMsg('Work effort not found.'); return; }
  const e = d.effort;
  const backToList = whCurrent ? () => showSessions(whCurrent)
                   : whScope === 'all' ? () => showAllProjects()
                   : () => showProjects();
  const crumbs = [{ label: 'Home', onClick: () => showView('v17') }];
  if (whCurrent) {
    crumbs.push({ label: 'Work History', onClick: showProjects });
    crumbs.push({ label: whCurrent, onClick: backToList });
  } else {
    crumbs.push({ label: 'Work History — All Projects', onClick: backToList });
  }
  crumbs.push({ label: clipText(e.topic || e.project, 42), onClick: level === 'raw' ? () => showEffort(id, 'functional') : null });
  if (level === 'raw') crumbs.push({ label: 'Raw', onClick: null });
  setCrumbs(crumbs);

  const wrap = document.createElement('div'); wrap.className = 'wh-wrap';
  const head = document.createElement('div'); head.className = 'wh-effort-head';
  const h = document.createElement('div'); h.className = 'wh-h';
  h.textContent = (e.project || '') + (e.version ? ' ' + e.version : '') + ' — ' + (e.topic || 'Work Effort');
  const jump = document.createElement('div');
  [['functional', 'Functional Items'], ['raw', 'Raw exchanges']].forEach(([k, lbl]) => {
    const b = document.createElement('button'); b.className = 'wh-level-btn' + (level === k ? ' active' : '');
    b.textContent = lbl; b.addEventListener('click', () => showEffort(id, k));
    jump.appendChild(b);
  });
  head.append(h, jump); wrap.appendChild(head);

  const card = document.createElement('div'); card.className = 'wh-rollup-card';
  const addRow = (k, val, cls) => {
    if (!val) return;
    const row = document.createElement('div'); row.className = 'wh-rollup-row';
    const kk = document.createElement('div'); kk.className = 'wh-rollup-k'; kk.textContent = k;
    const vv = document.createElement('div'); vv.className = 'wh-rollup-v' + (cls ? ' ' + cls : ''); vv.textContent = val;
    row.append(kk, vv); card.appendChild(row);
  };
  addRow('Requested', e.requested);
  addRow('Produced', e.produced, 'prod');
  addRow('Issues', e.issues, 'iss');
  const er = document.createElement('div'); er.className = 'wh-rollup-row';
  const ek = document.createElement('div'); ek.className = 'wh-rollup-k'; ek.textContent = 'Evaluation';
  const ev = document.createElement('div'); ev.className = 'wh-rollup-v'; ev.appendChild(evalBadge(e));
  er.append(ek, ev); card.appendChild(er);
  wrap.appendChild(card);

  if (level === 'functional') {
    const items = d.items || [];
    const sh = document.createElement('div'); sh.className = 'wh-section-h'; sh.textContent = 'Functional Items (' + items.length + ')';
    wrap.appendChild(sh);
    if (!items.length) { const m = document.createElement('div'); m.className = 'wh-empty'; m.textContent = 'No functional items recorded.'; wrap.appendChild(m); }
    else {
      const list = document.createElement('div'); list.className = 'wh-items';
      items.forEach(it => {
        const fi = document.createElement('div'); fi.className = 'wh-fi';
        const kd = document.createElement('div'); kd.className = 'wh-fi-kind ' + (it.kind || ''); kd.textContent = it.kind || '';
        const tx = document.createElement('div'); tx.className = 'wh-fi-text'; tx.textContent = it.text || '';
        fi.append(kd, tx); list.appendChild(fi);
      });
      wrap.appendChild(list);
    }
  } else {
    const xs = d.exchanges || [];
    const sh = document.createElement('div'); sh.className = 'wh-section-h'; sh.textContent = 'Raw exchanges (' + xs.length + ') — prompts ↔ responses';
    wrap.appendChild(sh);
    if (!xs.length) { const m = document.createElement('div'); m.className = 'wh-empty'; m.textContent = 'No raw exchanges recorded.'; wrap.appendChild(m); }
    else {
      const list = document.createElement('div'); list.className = 'wh-raw';
      xs.forEach(x => {
        const xc = document.createElement('div'); xc.className = 'wh-xc ' + (x.role || '');
        const rl = document.createElement('div'); rl.className = 'wh-xc-role'; rl.textContent = x.role === 'assistant' ? '🗣️ SOL' : '🧑 You';
        const tx = document.createElement('div'); tx.className = 'wh-xc-text'; tx.textContent = x.text || '';
        xc.append(rl, tx); list.appendChild(xc);
      });
      wrap.appendChild(list);
    }
  }
  workEl.replaceChildren(wrap);
}

// ─── Window controls (Electron only) ─────────────────────────────────────────
(function () {
  const controls = document.getElementById('win-controls');
  if (!window.electron) {
    if (controls) controls.style.display = 'none';
    return;
  }
  document.getElementById('btn-close')   ?.addEventListener('click', () => window.electron.close());
  document.getElementById('btn-minimize')?.addEventListener('click', () => window.electron.minimize());

  let _currentSize = 900;
  const ZOOM_STEP = 50, ZOOM_MIN = 400, ZOOM_MAX = 1400;
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
    _currentSize = Math.min(_currentSize + ZOOM_STEP, ZOOM_MAX);
    window.electron.resize(_currentSize);
  });
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
    _currentSize = Math.max(_currentSize - ZOOM_STEP, ZOOM_MIN);
    window.electron.resize(_currentSize);
  });
}());

// ─── About overlay ────────────────────────────────────────────────────────────
(function () {
  const btn     = document.getElementById('btn-about');
  const overlay = document.getElementById('about-overlay');
  if (!btn || !overlay) return;
  btn.addEventListener('click', () => overlay.classList.remove('hidden'));
  overlay.addEventListener('click', () => overlay.classList.add('hidden'));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') overlay.classList.add('hidden');
  });
}());

// ─── Help overlay ─────────────────────────────────────────────────────────────
(function () {
  const overlay = document.getElementById('help-overlay');
  if (!overlay) return;
  if (localStorage.getItem('pai-help-seen')) {
    overlay.classList.add('hidden');
    return;
  }
  function dismiss() {
    overlay.classList.add('hidden');
    localStorage.setItem('pai-help-seen', '1');
  }
  overlay.addEventListener('click', dismiss);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') dismiss(); });
}());

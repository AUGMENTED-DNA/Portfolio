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

// ─── Design toggle ────────────────────────────────────────────────────────────
const VIEWS = ['v1', 'v17', 'v18'];
document.querySelectorAll('#toggle-bar button').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    document.querySelectorAll('#toggle-bar button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    VIEWS.forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.classList.toggle('hidden', v !== target);
    });
  });
});

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

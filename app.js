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
// v4.15: index.html (the work-history shell) has no #c canvas — only the legacy
// orbital launcher page does. This threw on every single page load, and the
// animation loop below then threw twice more per frame. Nothing visible broke,
// which is exactly why it survived: three permanent errors made the console
// useless as a place to notice a NEW fault. Guarded, not deleted — v18.html
// still opens the launcher and must keep working.
const canvas = document.getElementById('c');
const ctx    = canvas ? canvas.getContext('2d') : null;
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
  ctx.strokeStyle = PAL.spoke;
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
  ctx.fillStyle   = PAL.disk;
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
  ctx.fillStyle    = PAL.label(alpha * 0.75);
  ctx.font         = `${NODE_R * 0.33}px system-ui`;
  ctx.textBaseline = 'top';
  ctx.fillText(proj.name, pos.x, pos.y + NODE_R + 5);
}

function drawCenter() {
  // outer glow
  const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, CENTER_R * 2);
  g.addColorStop(0,   PAL.glowInner);
  g.addColorStop(0.6, PAL.glowOuter);
  g.addColorStop(1,   'transparent');
  ctx.beginPath();
  ctx.arc(CX, CY, CENTER_R * 2, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  // center disk
  ctx.beginPath();
  ctx.arc(CX, CY, CENTER_R, 0, Math.PI * 2);
  ctx.fillStyle   = PAL.diskSolid;
  ctx.fill();
  ctx.strokeStyle = PAL.centerEdge;
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
    ctx.fillStyle   = PAL.diskSolid;
    ctx.fill();
    ctx.strokeStyle = item.color + '88';
    ctx.lineWidth   = 1.2;
    ctx.stroke();

    ctx.fillStyle    = item.color;
    ctx.font         = `${INNER_R * 0.9}px system-ui`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.icon, cx, cy);

    ctx.fillStyle    = PAL.label(0.65);
    ctx.font         = `${INNER_R * 0.52}px system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText(item.name, cx, cy + INNER_R + 3);
  });

  // Red close X at bottom of center hub
  const xR = CENTER_R * 0.11;
  const xY = CY + CENTER_R * 0.78;
  ctx.beginPath();
  ctx.arc(CX, xY, xR, 0, Math.PI * 2);
  ctx.fillStyle = PAL.diskSolid;
  ctx.fill();
  ctx.strokeStyle = PAL.close;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = PAL.close;
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

// Only run the orbital animation where it can actually draw. FINDING (v4.15):
// `PAL` — the colour palette every draw call reads — is referenced ~20 times in
// this file and ASSIGNED NOWHERE in the project. v18.html only mentions it in a
// comment. So drawSpoke() has been throwing on the very first frame of every
// page load for as long as that has been true: the orbital launcher cannot
// paint at all, and never could in this build. Guarding stops the error; it
// does not "disable" a working feature, because there is no working feature to
// disable. Restoring the launcher means defining PAL, which is its own job.
if (canvas && ctx && typeof PAL !== 'undefined') requestAnimationFrame(frame);

// ─── Left-nav routing ──────────────────────────────────────────────────────────
const VIEWS = ['v17', 'v18', 'v1', 'work', 'outstanding', 'priority'];
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
  if (target === 'v1')  loadV1();   // archived v1 app: probe :3000, load or show fallback
  if (target === 'outstanding') loadOutstanding();
  if (target === 'priority')    loadPriorityScreen();
  // The project sub-list belongs to Work History; it must not linger over the
  // other views (it did until v4.2 — it stayed visible under Orbital/Circular/V1).
  if (target !== 'work') setWhExpanded(false);
}

// ─── Prioritise Projects (v4.4) ──────────────────────────────────────────────
// Hand-entered running order, highest first, stored in project_priority.
// Anything never ranked sorts LAST, never first — a project you have not
// thought about must not be able to masquerade as urgent.
let prioRows  = [];        // working copy; nothing is written until Save is pressed
let prioPrios = {};        // last saved name -> rank, used by the sorts below

function prioStatus(msg, isError) {
  const el = document.getElementById('prio-status');
  if (el) { el.textContent = msg || ''; el.classList.toggle('prio-err', !!isError); }
}

// Ranked projects in rank order, then everything unranked by most recent work.
function prioOrder(projects) {
  const ranked   = projects.filter(p => p.priority != null).sort((a, b) => a.priority - b.priority);
  const unranked = projects.filter(p => p.priority == null)
    .sort((a, b) => (a.lastActive < b.lastActive ? 1 : a.lastActive > b.lastActive ? -1 : 0));
  return [...ranked, ...unranked];
}

async function loadPriorityScreen() {
  const host = document.getElementById('prio-content');
  if (!host) return;
  host.replaceChildren(Object.assign(document.createElement('div'),
    { className: 'wh-empty', textContent: 'Loading projects…' }));
  let data;
  try { data = await (await fetch('/api/work-history')).json(); }
  catch {
    host.replaceChildren(Object.assign(document.createElement('div'),
      { className: 'wh-empty', textContent: 'Could not load the project list.' }));
    return;
  }
  prioRows = prioOrder(data.projects || []);
  prioPrios = {}; prioRows.forEach(p => { if (p.priority != null) prioPrios[p.name] = p.priority; });
  renderPriorityTable();
  prioStatus(Object.keys(prioPrios).length
    ? 'Saved order loaded — ' + Object.keys(prioPrios).length + ' projects ranked.'
    : 'No order saved yet. This is your projects by most recent work — drag them into the order you want, then Save.');
}

function movePrio(from, to) {
  if (to < 0 || to >= prioRows.length || from === to) { renderPriorityTable(); return; }
  const [row] = prioRows.splice(from, 1);
  prioRows.splice(to, 0, row);
  renderPriorityTable();
  prioStatus('Unsaved changes — press "Save order" to keep them.', true);
}

function renderPriorityTable() {
  const host = document.getElementById('prio-content');
  if (!host) return;
  const wrap  = document.createElement('div'); wrap.className = 'wh-wrap';
  const table = document.createElement('table'); table.className = 'wh prio-table';
  const thead = document.createElement('thead'); const htr = document.createElement('tr');
  [['#',           'Priority position — 1 is highest. Type a number to send a project straight there.'],
   ['Project',     'Project name as registered in your PAI project registry'],
   ['Sessions',    'Recorded Claude sessions for this project'],
   ['Outstanding', 'Sessions that did not end in a verified complete state'],
   ['Last Active', 'Date and time of the most recent recorded session'],
   ['Move',        'Move this project one position up or down the running order']]
    .forEach(([t, tip]) => {
      const th = document.createElement('th'); th.textContent = t; th.title = tip; htr.appendChild(th);
    });
  thead.appendChild(htr); table.appendChild(thead);
  const tb = document.createElement('tbody');

  prioRows.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.className = 'prio-row'; tr.draggable = true;

    const rankTd = document.createElement('td'); rankTd.className = 'num';
    const box = document.createElement('input');
    box.type = 'number'; box.min = '1'; box.max = String(prioRows.length);
    box.value = String(i + 1); box.className = 'prio-rank';
    box.title = 'Type a position and press Enter to move ' + p.name + ' there';
    box.addEventListener('change', () => {
      const want = parseInt(box.value, 10);
      const to = Math.max(1, Math.min(prioRows.length, Number.isNaN(want) ? i + 1 : want)) - 1;
      movePrio(i, to);
    });
    rankTd.appendChild(box); tr.appendChild(rankTd);

    const nm = document.createElement('td'); nm.textContent = p.name;
    nm.title = 'Drag this row, or use the arrows, to change where ' + p.name + ' sits';
    tr.appendChild(nm);

    const se = document.createElement('td'); se.className = 'num'; se.textContent = p.sessions;
    tr.appendChild(se);

    const oc = document.createElement('td'); oc.className = 'num prio-out';
    const inc = p.incomplete || 0;
    oc.textContent = inc;
    if (inc) oc.classList.add('has-out');
    oc.title = inc + ' session' + (inc === 1 ? '' : 's') + ' with unfinished work in ' + p.name;
    tr.appendChild(oc);

    const la = document.createElement('td'); la.className = 'date'; la.textContent = p.lastActive || '—';
    tr.appendChild(la);

    const mv = document.createElement('td'); mv.className = 'prio-move';
    const up = document.createElement('button'); up.className = 'prio-arrow'; up.textContent = '▲';
    up.title = 'Move ' + p.name + ' up one position'; up.disabled = i === 0;
    up.addEventListener('click', () => movePrio(i, i - 1));
    const dn = document.createElement('button'); dn.className = 'prio-arrow'; dn.textContent = '▼';
    dn.title = 'Move ' + p.name + ' down one position'; dn.disabled = i === prioRows.length - 1;
    dn.addEventListener('click', () => movePrio(i, i + 1));
    mv.append(up, dn); tr.appendChild(mv);

    tr.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(i)); tr.classList.add('dragging');
    });
    tr.addEventListener('dragend',   () => tr.classList.remove('dragging'));
    tr.addEventListener('dragover',  (e) => { e.preventDefault(); tr.classList.add('drop-target'); });
    tr.addEventListener('dragleave', () => tr.classList.remove('drop-target'));
    tr.addEventListener('drop', (e) => {
      e.preventDefault(); tr.classList.remove('drop-target');
      const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!Number.isNaN(from)) movePrio(from, i);
    });
    tb.appendChild(tr);
  });
  table.appendChild(tb); wrap.appendChild(table); host.replaceChildren(wrap);
}

async function savePriorities() {
  try {
    const r = await fetch('/api/priorities', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: prioRows.map(p => p.name) }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'the server rejected the order');
    prioRows.forEach((p, i) => { p.priority = i + 1; });
    prioPrios = j.priorities || {};
    prioStatus('Saved — ' + prioRows.length + ' projects ranked.');
    await buildNav();                    // left list re-sorts into the saved order
  } catch (e) {
    prioStatus('Could not save: ' + ((e && e.message) || e), true);
  }
}

document.getElementById('prio-save')?.addEventListener('click', savePriorities);
document.getElementById('prio-reset')?.addEventListener('click', () => loadPriorityScreen());

// ─── Outstanding work (v4.2) ─────────────────────────────────────────────────
// "What is not done, and who has to do it?" Two sources, two answers:
//   · Session record        — a session admitted it did not finish this
//   · Awaiting confirmation — I claimed it was done; only you can close it
// Owner is inferred from the item's own words, and the matched phrase rides on
// the tag's tooltip: a classification you cannot check is one you cannot trust.
let outOwner = 'all';
const outEl = document.getElementById('out-content');
const outSummaryEl = document.getElementById('out-summary');

function outMsg(t) {
  if (!outEl) return;
  const d = document.createElement('div'); d.className = 'wh-empty'; d.textContent = t;
  outEl.replaceChildren(d);
}

// Fires the launch endpoint and reports the real outcome on the button itself —
// a launcher that silently does nothing is worse than no launcher.
async function openInClaude(project, btn) {
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Opening…';
  try {
    const r = await fetch('/api/open-in-claude', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project }),
    });
    const d = await r.json();
    btn.textContent = d.ok ? '✓ Opened' : '✗ ' + (d.error || 'Failed');
    btn.title = d.ok ? 'Launched Claude Code in ' + d.dir : (d.error || '');
  } catch (e) {
    btn.textContent = '✗ Server unreachable'; btn.title = String(e);
  }
  setTimeout(() => { btn.disabled = false; btn.textContent = original; }, 2600);
}

async function loadOutstanding() {
  if (!outEl) return;
  outMsg('Loading outstanding work…');
  let d;
  try { d = await (await fetch('/api/outstanding?owner=' + encodeURIComponent(outOwner))).json(); }
  catch (e) { outMsg('Could not load outstanding work.'); return; }

  if (outSummaryEl) {
    outSummaryEl.textContent = d.counts.all + ' open · ' + d.counts.human +
      ' yours · ' + d.counts.claude + ' Claude Code';
  }
  const wrap = document.createElement('div'); wrap.className = 'wh-wrap';
  const h = document.createElement('div'); h.className = 'wh-h'; h.textContent = 'Outstanding Work';
  const sub = document.createElement('div'); sub.className = 'wh-sub';
  sub.textContent = d.total + ' open item' + (d.total === 1 ? '' : 's') + ' across ' +
    d.projects.length + ' project' + (d.projects.length === 1 ? '' : 's') +
    ' — "Yours" needs a person; "Claude Code" just needs building.';
  wrap.append(h, sub);

  if (!d.total) {
    const e = document.createElement('div'); e.className = 'wh-empty';
    e.textContent = outOwner === 'all' ? 'Nothing outstanding.'
      : 'Nothing outstanding for ' + (outOwner === 'human' ? 'you' : 'Claude Code') + '.';
    wrap.append(e); outEl.replaceChildren(wrap); return;
  }

  d.projects.forEach((p) => {
    const card = document.createElement('div'); card.className = 'out-card';
    const head = document.createElement('div'); head.className = 'out-head';
    const nm = document.createElement('div'); nm.className = 'out-proj'; nm.textContent = p.name;
    const tally = document.createElement('div'); tally.className = 'out-tally';
    tally.textContent = p.human + ' yours · ' + p.claude + ' Claude Code';
    const btn = document.createElement('button'); btn.className = 'out-open';
    btn.textContent = '▶ Open in Claude Code';
    btn.title = 'Launch a new Claude Code session in this project folder';
    btn.addEventListener('click', () => openInClaude(p.name, btn));
    head.append(nm, tally, btn); card.appendChild(head);

    p.items.forEach((i) => {
      const row = document.createElement('div'); row.className = 'out-item';
      const tag = document.createElement('span');
      tag.className = 'out-tag ' + (i.owner === 'human' ? 'you' : 'cc');
      tag.textContent = i.owner === 'human' ? 'YOURS' : 'CLAUDE CODE';
      tag.title = i.reason;
      const tx = document.createElement('span'); tx.className = 'out-text'; tx.textContent = i.text;
      const src = document.createElement('span'); src.className = 'out-src';
      src.textContent = i.sourceLabel + (i.date ? ' · ' + i.date : '');
      row.append(tag, tx, src); card.appendChild(row);
    });
    wrap.appendChild(card);
  });
  outEl.replaceChildren(wrap);
}

document.querySelectorAll('.out-f').forEach((b) => b.addEventListener('click', () => {
  outOwner = b.dataset.owner;
  document.querySelectorAll('.out-f').forEach((x) => x.classList.toggle('active', x === b));
  loadOutstanding();
}));
// Lazy-load the v1 iframe only when opened; if localhost:3000 is down, show a
// friendly fallback instead of a broken/blank frame.
let _v1Loaded = false;
async function loadV1() {
  const frame = document.getElementById('v1-frame');
  const fb = document.getElementById('v1-fallback');
  if (!frame || _v1Loaded) return;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 2500);
    await fetch('http://localhost:3000/', { mode: 'no-cors', signal: ctrl.signal });
    clearTimeout(t);
    frame.src = 'http://localhost:3000/'; frame.classList.remove('v1-hidden'); if (fb) fb.classList.add('v1-hidden'); _v1Loaded = true;
  } catch {
    frame.classList.add('v1-hidden'); if (fb) fb.classList.remove('v1-hidden');
  }
}
function setWhExpanded(exp) {
  whNavList.classList.toggle('hidden', !exp);
  if (whArrow) whArrow.textContent = exp ? '▾' : '▸';
}

// ─── Left-nav collapse (icon rail) ───────────────────────────────────────────
// The toggle lives in the nav head so it stays clickable in BOTH states — a
// control only visible while expanded would be a one-way door.
const NAV_COLLAPSE_KEY = 'portfolio.navCollapsed';
const appEl = document.getElementById('app');
const navToggle = document.getElementById('nav-toggle');
function setNavCollapsed(collapsed) {
  // v4.15: index.html embeds v18.html in an iframe (index.html:60), and
  // v18.html loads app.js AGAIN — in a document that has no #app element. So
  // appEl was null in that second context and this threw on every load of the
  // main page, from inside the iframe where it was invisible. The work-history
  // code guards on whNavList for exactly this reason; the nav collapse did not.
  if (!appEl) return;
  appEl.classList.toggle('nav-collapsed', collapsed);
  if (navToggle) {
    navToggle.textContent = collapsed ? '»' : '«';
    const label = collapsed ? 'Expand navigation' : 'Collapse navigation';
    navToggle.title = label; navToggle.setAttribute('aria-label', label);
  }
  try { localStorage.setItem(NAV_COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* storage blocked — state stays session-only */ }
}
navToggle?.addEventListener('click', () => setNavCollapsed(!appEl.classList.contains('nav-collapsed')));
(() => { let saved = null; try { saved = localStorage.getItem(NAV_COLLAPSE_KEY); } catch { /* storage blocked */ } setNavCollapsed(saved === '1'); })();
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
  // Headings for the nav list. The right-hand number used to appear with no
  // heading and no rollover, so nothing on screen said what it counted.
  const navHead = document.createElement('div'); navHead.className = 'wh-nav-head';
  const hNm = document.createElement('span'); hNm.textContent = 'Project';
  hNm.title = 'Projects from your PAI registry, plus any project with recorded Claude sessions';
  const hCt = document.createElement('span'); hCt.className = 'wh-nav-count'; hCt.textContent = 'Sessions';
  hCt.title = 'Number of recorded Claude sessions for that project';
  navHead.append(hNm, hCt);
  whNavList.appendChild(navHead);
  // "★ All Projects" — the discoverable entry into the cross-project roll-up.
  const allBtn = document.createElement('button'); allBtn.className = 'wh-nav-item wh-nav-all';
  allBtn.dataset.project = '';                       // '' identifies the all-projects row
  allBtn.title = 'Show work from every project together in one list, instead of one project at a time';
  const allNm = document.createElement('span'); allNm.textContent = '★ All Projects';
  const allCt = document.createElement('span'); allCt.className = 'wh-nav-count';
  const allTotal = (data.projects || []).reduce((s, p) => s + (p.sessions || 0), 0);
  allCt.textContent = allTotal;
  allCt.title  = allTotal + ' recorded sessions across every project';
  allBtn.title = 'Show work from every project together, newest first';
  allBtn.append(allNm, allCt);
  allBtn.addEventListener('click', () => { showView('work'); setFolderScope('all'); showAllProjects(); });
  whNavList.appendChild(allBtn);
  // Left list follows the saved ranking too, so the nav, the project table and
  // the Prioritise screen can never present three different running orders.
  prioPrios = {};
  (data.projects || []).forEach(p => { if (p.priority != null) prioPrios[p.name] = p.priority; });
  prioOrder(data.projects || []).forEach(p => {
    const b = document.createElement('button'); b.className = 'wh-nav-item';
    b.dataset.project = p.name;
    const nm = document.createElement('span'); nm.textContent = p.name;
    const ct = document.createElement('span'); ct.className = 'wh-nav-count'; ct.textContent = p.sessions;
    ct.title = p.sessions + ' recorded Claude session' + (p.sessions === 1 ? '' : 's') + ' for ' + p.name;
    b.title  = 'Open ' + p.name + ' — ' + (p.sessions
      ? 'last active ' + (p.lastActive || 'unknown')
      : 'no sessions recorded yet');
    b.append(nm, ct);
    b.addEventListener('click', () => { showView('work'); setFolderScope('project'); showSessions(p.name); });
    whNavList.appendChild(b);
  });
  // The list is rebuilt on every refresh, which destroys the highlighted button.
  // Re-apply it from current state so a reload does not silently deselect.
  setActiveNavProject(whScope === 'all' ? '' : whCurrent);
}

// Highlight the selected project. `.wh-nav-item.active` has existed in
// styles.css since v4.0, but nothing ever applied the class — so the project
// list was the only button group in the app that never showed its selection,
// even though the filtering behind it was always correct.
function setActiveNavProject(name) {
  whNavList?.querySelectorAll('button.wh-nav-item').forEach((b) =>
    b.classList.toggle('active', (b.dataset.project || '') === (name || '')));
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
    case 'days':      return { from: back(Math.max(1, whDays) - 1), to: today };
    case '30':        return { from: back(29), to: today };
    default:          return { from: '', to: '' };          // all time
  }
}
// How many days "Last N days" covers. Remembered, because a window you have to
// retype every visit is a window you stop using. Inclusive of today, so N=7 is
// today plus the six before it.
const WH_DAYS_KEY = 'portfolio.whDays';
let whDays = 7;
try { whDays = parseInt(localStorage.getItem(WH_DAYS_KEY), 10) || 7; } catch { /* storage blocked */ }
function setWhDays(n) {
  whDays = Math.min(3650, Math.max(1, parseInt(n, 10) || 7));
  try { localStorage.setItem(WH_DAYS_KEY, String(whDays)); } catch { /* storage blocked */ }
  const b = whFilterBar?.querySelector('button.wh-f-preset[data-preset="days"]');
  if (b) b.textContent = 'Last ' + whDays + ' days';
}
// v4.12: null = accept the server's default cap. Raised by the "Load all"
// button, which only appears once the page has TOLD you a cap was applied —
// nothing is ever cut without the count being stated first.
let whLimit = null;
function whApi(opts) {
  const o = opts || {};
  const p = [];
  if (o.project)              p.push('project=' + encodeURIComponent(o.project));
  else if (o.scope === 'all') p.push('scope=all');
  if (whRange.from)           p.push('from=' + whRange.from);
  if (whRange.to)             p.push('to='   + whRange.to);
  if (whLimit)                p.push('limit=' + whLimit);
  return '/api/work-history' + (p.length ? '?' + p.join('&') : '');
}

// v4.14: these four carried no hover text at all — caught by audit.mjs, which
// counts controls as RENDERED rather than as createElement calls in the source.
// An earlier hand audit counted 12 controls and passed; the page renders 52.
const WH_PRESETS = [
  ['all',       'All',          'Every session ever recorded, with no date limit'],
  ['today',     'Today',        'Only sessions with activity since midnight today'],
  ['yesterday', 'Yesterday',    'Only sessions with activity during yesterday'],
  ['days',      'Last N days',  'Click to choose how many days back · click again to re-apply'],
  ['30',        'Last 30 days', 'Only sessions with activity in the last 30 days'],
];
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
  // v4.5: the by-project overview has no sessions of its own to re-column, so
  // the Sessions toggle used to set the mode, light its pill and then redraw
  // the identical project table — the click looked dead from the landing
  // screen, which is the one screen the app opens on. Every project's
  // sessions, newest-closed first, is the honest answer to "show me sessions".
  else if (whListMode === 'sessions') await showOverviewSessions();
  else await showProjects();
}
async function applyPreset(key) {
  const r = presetRange(key);
  whRange.from = r.from; whRange.to = r.to; whRange.preset = key;
  // Asking for "the last N days" is asking what happened recently, so the list
  // opens most-recently-closed first rather than keeping whatever sort was left
  // over from a previous question.
  if (key === 'days' && whSort !== 'newest') { whSort = 'newest'; setActiveSort('newest'); }
  setActivePreset(key); updateFilterUI(); await reloadWork();
}
// Two-stage click, as requested: the first click asks how many days (pre-filled
// with your last answer), a second click while it is already the active filter
// just re-applies it. Asking every single time would make the common case slower
// than the fixed button it replaced.
function hideDaysInput() {
  document.getElementById('wh-days-input')?.classList.add('wh-days-hidden');
}
let _daysCommitting = false;
async function commitDays(input) {
  if (_daysCommitting) return;                 // blur fires again on Enter
  _daysCommitting = true;
  try {
    if (input.classList.contains('wh-days-hidden')) return;
    setWhDays(input.value);
    hideDaysInput();
    await applyPreset('days');
  } finally { _daysCommitting = false; }
}
async function onDaysClick(btn) {
  const input = document.getElementById('wh-days-input');
  if (btn.classList.contains('active')) { await applyPreset('days'); return; }   // already on — just re-apply
  if (!input) { await applyPreset('days'); return; }
  input.value = String(whDays);
  input.classList.remove('wh-days-hidden');
  input.focus(); input.select();
}
async function applyCustom() {
  const fI = document.getElementById('wh-from'), tI = document.getElementById('wh-to');
  whRange.from = (fI && fI.value) || ''; whRange.to = (tI && tI.value) || ''; whRange.preset = 'custom';
  setActivePreset(null); updateFilterUI(); await reloadWork();
}
// ─── Level control: Roll-Up (list) ▸ Functional Items ▸ Raw (drill within effort) ─
// 'sessions' is a sibling of 'rollup', not a drill level: it re-renders the same
// list with a different set of columns rather than descending into one effort.
// Rule 13a: each carries what it DOES, not what it is called. "Functional
// Items" and "Raw" are drill-in levels, not list views — they open the session
// you last looked at, which is unguessable from a four-word label.
const WH_LEVELS = [
  // v4.13: the LABEL stays "Roll-Up" — it is what Dane has been reading for
  // months and he did not ask for it to change. v4.12 renamed it to "Session
  // Summary" as a rider on three unrelated data fixes, which is how a visible
  // change reached his screen unagreed. The tooltip carries the definition, and
  // that alone answers the actual complaint: the word explained nothing.
  ['rollup',     'Roll-Up',
   'One row per session summarising the whole thing: what you asked for, what was delivered, and whether it finished'],
  ['sessions',   'Sessions',
   'One row per session, most recently closed first, with the session ID so you can match a row to a real session'],
  ['functional', 'Functional Items',
   'Open a single session and break it into its individual units of work — each one tagged as requested, produced, or left outstanding'],
  ['raw',        'Raw',
   'Open a single session and show the unprocessed back-and-forth exchanges, with nothing summarised'],
];
function setActiveLevel(key) {
  whFilterBar?.querySelectorAll('button.wh-f-level[data-level]').forEach((b) =>
    b.classList.toggle('active', b.dataset.level === key));
  // Every screen routes through here, so this is the one place the drill-in
  // buttons need to be re-evaluated — list screens dim them, an open session
  // enables them. Defined below; hoisted, so the forward reference is fine.
  setDrillEnabled();
}
// (firstEffortId() lived here until v4.12. It returned the most recently closed
// effort so a drill-level button could jump somewhere without a row click — the
// silent guess removed in v4.9, which filled the screen with one specific
// session while implying you had chosen it. Nothing has called it since, and a
// function whose only purpose was a behaviour we deliberately deleted is a trap
// for whoever finds it next and assumes it is wired to something.)
let whListMode = 'rollup';                  // 'rollup' | 'sessions' — which columns the list shows
async function applyLevel(key) {
  if (key === 'rollup' || key === 'sessions') {
    whListMode = key; whEffortId = null; setActiveLevel(key); await reloadWork(); return;
  }
  // v4.9: this used to fall back to firstEffortId() — the most recently closed
  // session — when nothing was selected. That is a GUESS presented as a result:
  // the screen filled with one specific session's contents without ever saying
  // it had chosen one, so a click that should have been impossible looked like
  // it worked. The buttons are now disabled in that state (see setDrillEnabled),
  // and this is the belt-and-braces guard for anything that reaches here anyway.
  if (!whEffortId) { setActiveLevel(whListMode); return; }
  whEffortLevel = key; await showEffort(whEffortId, key);
}
// Functional Items and Raw describe ONE session, so they are meaningless on a
// list. Dimmed rather than removed: you cannot learn a view exists if it is
// never drawn, and not knowing what Functional Items was for is exactly what
// prompted this. The tooltip carries the reason, per design standard rule 13a.
function setDrillEnabled() {
  const on = !!whEffortId;
  whFilterBar?.querySelectorAll('button.wh-f-level[data-level]').forEach((b) => {
    const drill = b.dataset.level === 'functional' || b.dataset.level === 'raw';
    if (!drill) return;
    b.disabled = !on;
    b.classList.toggle('wh-f-disabled', !on);
    const [, , tip] = WH_LEVELS.find(([k]) => k === b.dataset.level) || [];
    // v4.10: the instruction leads. This previously opened with the feature
    // description and mentioned how to enable the button only at the very end,
    // which is backwards for a control you cannot use yet — the first thing a
    // disabled control owes you is what to do about it, not what it is for.
    b.title = on ? tip
      : 'Select a session to use this feature — click any row in the list below.'
        + '\n\nWhat it shows once a session is open: ' + tip;
  });
}
// ─── Completed filter (All / Complete / Incomplete) ──────────────────────────────
let whCompleted = 'all';
const WH_COMPLETED = [['all', 'All'], ['complete', 'Complete'], ['incomplete', 'Incomplete'],
                      ['unknown', 'No verdict']];
function setActiveCompleted(key) {
  whFilterBar?.querySelectorAll('button.wh-f-comp[data-comp]').forEach((b) =>
    b.classList.toggle('active', b.dataset.comp === key));
}
async function applyCompleted(key) {
  whCompleted = key; setActiveCompleted(key);
  if (whEffortId) return;            // filter only affects the roll-up list
  await reloadWork();
}
// v4.12: 'incomplete' was `eval_ok !== 1`, which swept in every session with no
// readable verdict — 75% of the database — and presented them as unfinished
// work. Unknown is now its own filter position rather than being hidden inside
// Incomplete, so "show me what is not finished" answers that question and not a
// different, much larger one.
function filterByCompleted(sessions) {
  if (whCompleted === 'complete')   return sessions.filter((s) => s.eval_ok === 1);
  if (whCompleted === 'incomplete') return sessions.filter((s) => s.eval_ok === 0);
  if (whCompleted === 'unknown')    return sessions.filter((s) => s.eval_ok !== 0 && s.eval_ok !== 1);
  return sessions;
}

// ─── Sort (Newest / Oldest / Project A-Z) ────────────────────────────────────
// The status buttons above always filtered within the selected project, but
// nothing on screen said so and there was no way to reorder. 'project' groups
// rows by project name in All Projects view, newest-first within each group.
let whSort = 'newest';
const WH_SORTS = [
  ['newest',   'Newest first', 'Most recent session at the top'],
  ['oldest',   'Oldest first', 'Earliest session at the top'],
  ['project',  'Project A-Z',  'Group by project name, newest first within each project'],
  ['priority', 'Priority',     'Highest-priority project first, using the order set on the Prioritise screen'],
];
// Unranked projects get a rank far below any real one so they sort last, never
// first. Ranks come from the last load of the Prioritise screen or a save.
const PRIO_UNRANKED = 9999;
const rankOfProject = (name) => (prioPrios[name] != null ? prioPrios[name] : PRIO_UNRANKED);
function setActiveSort(key) {
  whFilterBar?.querySelectorAll('button.wh-f-sort[data-sort]').forEach((b) =>
    b.classList.toggle('active', b.dataset.sort === key));
}
async function applySort(key) {
  whSort = key; setActiveSort(key);
  if (whEffortId) return;            // sorting only affects the roll-up list
  await reloadWork();
}
function sortSessions(sessions) {
  // mtime is when the session actually stopped; date is day-granularity, so on
  // its own every session from one day ties and the order within that day is
  // whatever the query happened to return. Date remains the tie-break so rows
  // predating the mtime passthrough still order sensibly instead of clumping.
  const byDateDesc = (a, b) => ((b.mtime || 0) - (a.mtime || 0)) ||
    (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const rows = sessions.slice();
  if (whSort === 'oldest')  return rows.sort((a, b) => -byDateDesc(a, b));
  if (whSort === 'project') return rows.sort((a, b) => {
    const pa = (a.project || '').toLowerCase(), pb = (b.project || '').toLowerCase();
    return pa < pb ? -1 : pa > pb ? 1 : byDateDesc(a, b);
  });
  if (whSort === 'priority') return rows.sort((a, b) => {
    const ra = rankOfProject(a.project), rb = rankOfProject(b.project);
    if (ra !== rb) return ra - rb;
    // Same project (or both unranked): fall back to project name, then recency,
    // so the grouping stays stable instead of shuffling between renders.
    const pa = (a.project || '').toLowerCase(), pb = (b.project || '').toLowerCase();
    return pa < pb ? -1 : pa > pb ? 1 : byDateDesc(a, b);
  });
  return rows.sort(byDateDesc);
}

// (A 'Showing: <project>' chip briefly lived in the filter bar and was removed
// at v4.3. The highlighted row in the left nav is the single indicator of what
// is selected; two indicators — one of which only refreshed at startup and so
// could name the wrong project — was worse than one that is always right.)
function ensureFilterBar() {
  if (whFilterBar) return;
  const bar = document.createElement('div'); bar.id = 'wh-filter';
  const lbl = document.createElement('span'); lbl.className = 'wh-f-label'; lbl.textContent = 'Date:';
  bar.appendChild(lbl);
  WH_PRESETS.forEach(([key, label, tip]) => {
    const b = document.createElement('button'); b.className = 'wh-f-preset'; b.dataset.preset = key;
    b.title = tip;
    b.textContent = key === 'days' ? 'Last ' + whDays + ' days' : label;
    if (key === 'days') {
      b.title = 'Click to choose how many days · click again to re-apply';
      b.addEventListener('click', () => onDaysClick(b));
    } else {
      b.addEventListener('click', () => applyPreset(key));
    }
    bar.appendChild(b);
    // The number box lives beside its button and stays hidden until asked for,
    // so the bar looks unchanged until you actually want to change the window.
    if (key === 'days') {
      const n = document.createElement('input');
      n.type = 'number'; n.id = 'wh-days-input'; n.className = 'wh-days-input wh-days-hidden';
      n.min = '1'; n.max = '3650'; n.title = 'How many days back, including today';
      n.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commitDays(n); }
        if (e.key === 'Escape') { e.preventDefault(); hideDaysInput(); }
      });
      n.addEventListener('blur', () => commitDays(n));
      bar.appendChild(n);
    }
  });
  const dot = document.createElement('span'); dot.className = 'wh-f-sep'; dot.textContent = '·'; bar.appendChild(dot);
  const fromI = document.createElement('input'); fromI.type = 'date'; fromI.id = 'wh-from'; fromI.title = 'From date';
  const arrow = document.createElement('span'); arrow.className = 'wh-f-sep'; arrow.textContent = '→';
  const toI = document.createElement('input'); toI.type = 'date'; toI.id = 'wh-to'; toI.title = 'To date';
  const go = document.createElement('button'); go.className = 'wh-f-preset'; go.textContent = 'Apply';
  go.title = 'Filter the list to the from/to dates entered on the left';
  go.addEventListener('click', applyCustom);
  bar.append(fromI, arrow, toI, go);
  const lvlSep = document.createElement('span'); lvlSep.className = 'wh-f-sep'; lvlSep.textContent = '·'; bar.appendChild(lvlSep);
  const lvlLbl = document.createElement('span'); lvlLbl.className = 'wh-f-label'; lvlLbl.textContent = 'View:'; bar.appendChild(lvlLbl);
  WH_LEVELS.forEach(([key, label, tip]) => {
    const b = document.createElement('button'); b.className = 'wh-f-level'; b.dataset.level = key; b.textContent = label;
    b.title = tip;
    b.addEventListener('click', () => applyLevel(key));
    bar.appendChild(b);
  });
  const compSep = document.createElement('span'); compSep.className = 'wh-f-sep'; compSep.textContent = '·'; bar.appendChild(compSep);
  const compLbl = document.createElement('span'); compLbl.className = 'wh-f-label'; compLbl.textContent = 'Status:'; bar.appendChild(compLbl);
  WH_COMPLETED.forEach(([key, label]) => {
    const b = document.createElement('button'); b.className = 'wh-f-comp'; b.dataset.comp = key; b.textContent = label;
    b.title = key === 'all' ? 'Every session, whatever its completion state'
            : key === 'complete' ? 'Only sessions that ended in a verified complete state'
            : key === 'incomplete' ? 'Only sessions that recorded explicit unfinished work — '
                + 'not sessions whose state simply could not be read'
            : 'Only sessions where no completion verdict could be read either way. '
                + 'About three quarters of your history sits here; it does not mean unfinished.';
    b.addEventListener('click', () => applyCompleted(key));
    bar.appendChild(b);
  });
  const sortSep = document.createElement('span'); sortSep.className = 'wh-f-sep'; sortSep.textContent = '·'; bar.appendChild(sortSep);
  const sortLbl = document.createElement('span'); sortLbl.className = 'wh-f-label'; sortLbl.textContent = 'Sort:'; bar.appendChild(sortLbl);
  WH_SORTS.forEach(([key, label, tip]) => {
    const b = document.createElement('button'); b.className = 'wh-f-sort'; b.dataset.sort = key; b.textContent = label;
    b.title = tip;
    b.addEventListener('click', () => applySort(key));
    bar.appendChild(b);
  });
  const spacer = document.createElement('span'); spacer.className = 'wh-f-spacer'; bar.appendChild(spacer);
  const summary = document.createElement('span'); summary.className = 'wh-f-summary'; summary.id = 'wh-f-summary';
  bar.appendChild(summary);
  const view = document.getElementById('view-work');
  view.insertBefore(bar, view.firstChild);
  whFilterBar = bar;
  whListMode = 'rollup';                    // fresh bar = fresh defaults; keep the pill and the mode in step
  setActivePreset('all'); setActiveLevel('rollup'); setActiveCompleted('all');
  setActiveSort('newest'); updateFilterUI();
}

// Only wire the launcher's nav + Work History when its shell is present.
// v18.html also loads app.js (for the orbital canvas) but has no nav shell.
if (whNavList) {
  ensureFilterBar(); buildNav();
  // Default landing (v4.4): the project table, ordered by the priority ranking
  // set on the Prioritise screen. All-time and all-status deliberately — the
  // previous default narrowed to yesterday→today + Complete only, which on a
  // project overview would show session counts covering two days and read as
  // wrong at a glance rather than as filtered.
  // Deferred (setTimeout 0) so it runs AFTER this script finishes initializing the
  // later consts (workEl) — calling it synchronously would hit workEl in its
  // temporal dead zone.
  setTimeout(async () => {
    whRange.from = ''; whRange.to = ''; whRange.preset = 'all';
    whCompleted = 'all';
    setActivePreset('all'); setActiveCompleted('all'); updateFilterUI();
    setFolderScope('project'); setWhExpanded(true); showView('work');
    await showProjects();
  }, 0);
}

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
    // Rule 13a: a breadcrumb is a control, so it says what clicking it does —
    // and the one you are already on says so rather than looking clickable.
    b.title = p.onClick ? 'Go back to ' + p.label : 'You are here: ' + p.label;
    if (p.onClick) b.addEventListener('click', p.onClick);
    crumbsEl.appendChild(b);
  });
}
function workMsg(t) {
  const d = document.createElement('div'); d.className = 'wh-empty'; d.textContent = t;
  workEl.replaceChildren(d);
}

// v4.8: "Could not load sessions." fired identically whether the server was
// stopped, still rebuilding its index after a restart, or returning malformed
// data — three different problems needing three different responses, and it
// named none of them. This tells them apart and says what to do about each.
async function fetchWork(url, what) {
  let res;
  try { res = await fetch(url); }
  catch {
    // fetch() only throws when the connection itself failed, so probe the
    // server directly to separate "not running" from "running but struggling".
    const up = await fetch('/', { method: 'HEAD' }).then(() => true).catch(() => false);
    throw new Error(up
      ? 'The server is running, but the request for ' + what + ' did not complete. '
        + 'It is most likely still rebuilding its index, which takes about 30 seconds '
        + 'after the server restarts. Wait a few seconds and reload the page.'
      : 'The Work History server is not running on port 4040, so there is nothing to '
        + 'load from. Start it with:  node ~/Projects/Portfolio/server.js  — or press '
        + 'AA in the p menu to start all servers — then reload this page.');
  }
  if (!res.ok) {
    throw new Error('The server rejected the request for ' + what + ' with HTTP ' + res.status
      + (res.statusText ? ' ' + res.statusText : '') + '. The connection is fine, so this is a '
      + 'fault inside the server rather than a startup problem — the log is at /tmp/portfolio-server.log.');
  }
  try { return await res.json(); }
  catch {
    throw new Error('The server answered the request for ' + what + ', but the reply was not '
      + 'readable data. This usually means the index was being rewritten mid-request. '
      + 'Reload the page in a few seconds.');
  }
}
function mkCell(text, cls) {
  const td = document.createElement('td'); if (cls) td.className = cls; td.textContent = text; return td;
}

async function showProjects() {
  whCurrent = null;
  // v4.5: the left nav calls this directly, bypassing the View toggle. Resetting
  // the mode here stops the Sessions pill staying lit over a roll-up table.
  whListMode = 'rollup'; setActiveLevel('rollup');
  setCrumbs([{ label: 'Home', onClick: () => showView('v17') }, { label: 'Work History', onClick: null }]);
  workMsg('Loading projects…');
  let data;
  try { data = await fetchWork(whApi(), 'the project list'); }
  catch (e) { workMsg(e.message); return; }
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
  // Three resolution columns, not one. "Outstanding" alone conflated work a
  // session admitted was unfinished with work the assistant silently claimed
  // done, and hid the only state that settles the question: whether YOU closed
  // it. A number the assistant can move is not evidence of resolution.
  [['#',            'num', 'Priority position from the Prioritise screen — 1 is highest, — means unranked'],
   ['Project',      '',    'Project name as registered in your PAI project registry'],
   ['Version',      'ver', 'Latest git tag found in the project repository'],
   ['Sessions',     'num', 'Number of recorded Claude sessions in the selected date range'],
   ['Awaiting You', 'num', 'Claimed done by the assistant, NOT yet confirmed by you — the definitive number, because only you can move it. Close one with: bun followup.ts confirm <id>'],
   ['Open',         'num', 'Sessions that recorded explicit unfinished work of their own'],
   ['Confirmed',    'num', 'You confirmed or verified these as genuinely done'],
   ['Last Active',  '',    'Date and time of the most recent recorded session']].forEach(([t, cls, tip]) => {
    const th = document.createElement('th'); th.textContent = t; th.title = tip;
    if (cls === 'num') th.className = 'num'; htr.appendChild(th);
  });
  thead.appendChild(htr); table.appendChild(thead);
  const tb = document.createElement('tbody');
  // Ranked projects first in rank order, then everything unranked by recency —
  // the same rule the Prioritise screen and the left nav use, so all three agree.
  prioOrder(data.projects).forEach(p => {
    const tr = document.createElement('tr'); tr.className = 'clickable';
    // Amber marks what needs YOUR action, so it belongs on Awaiting You rather
    // than on Open — Open is my backlog, Awaiting You is yours.
    const awaiting = mkCell(p.awaiting || 0, 'num');
    if (p.awaiting) awaiting.classList.add('has-out');
    awaiting.title = (p.awaiting || 0) + ' item' + (p.awaiting === 1 ? '' : 's') +
      ' I claimed done that you have not confirmed';
    const open = mkCell(p.incomplete || 0, 'num');
    open.title = (p.incomplete || 0) + ' session' + (p.incomplete === 1 ? '' : 's') +
      ' that recorded unfinished work' +
      (p.unknown ? ' · ' + p.unknown + ' more had no readable verdict' : '');
    const confirmed = mkCell(p.confirmed || 0, 'num');
    confirmed.title = (p.confirmed || 0) + ' item' + (p.confirmed === 1 ? '' : 's') + ' you closed as done';
    tr.append(mkCell(p.priority != null ? p.priority : '—', 'num'),
              mkCell(p.name), mkCell(p.version || '—', 'ver'),
              mkCell(p.sessions, 'num'), awaiting, open, confirmed,
              mkCell(p.lastActive || '—', 'date'));
    tr.addEventListener('click', () => showSessions(p.name));
    tb.appendChild(tr);
  });
  table.appendChild(tb); wrap.appendChild(table); workEl.replaceChildren(wrap);
}

async function showSessions(name) {
  // Keep whichever list mode is chosen — forcing 'rollup' here silently threw
  // you back to the other set of columns every time you opened a project.
  whCurrent = name; whEffortId = null; setActiveLevel(whListMode); setActiveNavProject(name);
  setCrumbs([
    { label: 'Home', onClick: () => showView('v17') },
    { label: 'Work History', onClick: showProjects },
    { label: name, onClick: null },
  ]);
  workMsg('Loading ' + name + ' sessions…');
  let data;
  try { data = await fetchWork(whApi({ project: name }), name + '’s sessions'); }
  catch (e) { workMsg(e.message); return; }
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
  wrap.appendChild(whListMode === 'sessions' ? renderSessionsTable(sessions, false) : renderRollupTable(sessions, false));
  workEl.replaceChildren(wrap);
}

// ─── All-projects roll-up (green folder) ──────────────────────────────────────
async function showAllProjects() {
  whCurrent = null; whEffortId = null; setActiveLevel(whListMode); setFolderScope('all'); setActiveNavProject('');
  setCrumbs([{ label: 'Home', onClick: () => showView('v17') }, { label: 'Work History — All Projects', onClick: null }]);
  workMsg('Loading all projects…');
  let data;
  try { data = await fetchWork(whApi({ scope: 'all' }), 'the all-projects roll-up'); }
  catch (e) { workMsg(e.message); return; }
  const wrap = document.createElement('div'); wrap.className = 'wh-wrap';
  const h = document.createElement('div'); h.className = 'wh-h'; h.textContent = 'Work History — All Projects';
  const sub = document.createElement('div'); sub.className = 'wh-sub';
  const rangeNote = data.filtered ? (data.from || '…') + ' → ' + (data.to || '…') : 'all time';
  // v4.12: state the TRUE total and whether the list was cut. This read
  // "400 of 400 work efforts" because the server counted its rows AFTER
  // applying its own cap — a truncated list describing itself as whole.
  sub.textContent = data.capped
    ? 'Showing the ' + data.shown + ' most recent of ' + data.total + ' work efforts across all '
      + 'projects · ' + rangeNote + ' · ' + (data.total - data.shown) + ' older ones not loaded.'
    : 'All ' + data.total + ' work effort' + (data.total === 1 ? '' : 's')
      + ' across all projects · ' + rangeNote + ' · click a row to drill in.';
  wrap.append(h, sub);
  if (data.capped) {
    const more = document.createElement('button'); more.className = 'wh-frag-toggle';
    more.textContent = 'Load all ' + data.total;
    more.title = 'Load every work effort in the range, not just the ' + data.shown + ' most recent';
    more.addEventListener('click', async () => { whLimit = data.total; await reloadWork(); });
    sub.appendChild(document.createTextNode(' '));
    sub.appendChild(more);
  }
  const sessions = data.sessions || [];
  if (!sessions.length) {
    const e = document.createElement('div'); e.className = 'wh-empty';
    e.textContent = data.filtered ? 'No work recorded in this date range.' : 'No session records found.';
    wrap.append(e); workEl.replaceChildren(wrap); return;
  }
  wrap.appendChild(whListMode === 'sessions' ? renderSessionsTable(sessions, true) : renderRollupTable(sessions, true));
  workEl.replaceChildren(wrap);
}

// ─── Sessions list reached from the by-project overview (v4.5) ────────────────
// Deliberately does NOT flip the folder scope to 'all' — toggling back to
// Roll-Up must land on the project table you came from, not strand you in the
// all-projects list with a green folder you never asked for.
async function showOverviewSessions() {
  whCurrent = null; whEffortId = null; setActiveLevel('sessions'); setActiveNavProject('');
  setCrumbs([
    { label: 'Home', onClick: () => showView('v17') },
    { label: 'Work History', onClick: async () => {
        whListMode = 'rollup'; setActiveLevel('rollup'); await showProjects(); } },
    { label: 'Sessions', onClick: null },
  ]);
  workMsg('Loading sessions…');
  let data;
  try { data = await fetchWork(whApi({ scope: 'all' }), 'the session list'); }
  catch (e) { workMsg(e.message); return; }
  const wrap = document.createElement('div'); wrap.className = 'wh-wrap';
  const h = document.createElement('div'); h.className = 'wh-h';
  h.textContent = 'Sessions — Most Recently Closed First';
  const sub = document.createElement('div'); sub.className = 'wh-sub';
  const rangeNote = data.filtered ? (data.from || '…') + ' → ' + (data.to || '…') : 'all time';
  const sessions = data.sessions || [];
  sub.textContent = sessions.length + ' session' + (sessions.length === 1 ? '' : 's') +
    ' across all projects · ' + rangeNote +
    ' · one row per session, newest close at the top · click a row to drill in.';
  wrap.append(h, sub);
  if (!sessions.length) {
    const e = document.createElement('div'); e.className = 'wh-empty';
    e.textContent = data.filtered ? 'No sessions closed in this date range.' : 'No session records found.';
    wrap.append(e); workEl.replaceChildren(wrap); return;
  }
  wrap.appendChild(renderSessionsTable(sessions, true));
  workEl.replaceChildren(wrap);
}

// ─── Level 3: roll-up table (one row per work effort) ─────────────────────────
const clipText = (s, n) => { s = (s || '').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
// v4.12: THREE states, not two. This read `ok = eval_ok === 1` and rendered
// everything else as "⚠️ Incomplete" — so the 1,089 sessions (75% of the
// database) where no verdict could be found were reported to you as unfinished
// work. indexer.js deliberately stores Unknown as its own value precisely so
// that "I could not tell" is never presented as a finding; the badge collapsed
// it straight back. Absence of evidence is not evidence of an unfinished job.
function evalBadge(s) {
  const span = document.createElement('span');
  const left = (s.issues || '').split(' • ').filter(Boolean).length;
  if (s.eval_ok === 1) {
    span.className = 'wh-eval ok'; span.textContent = '✅ Complete';
    span.title = s.evaluation || 'This session ended in a verified complete state';
  } else if (s.eval_ok === 0) {
    span.className = 'wh-eval bad';
    span.textContent = '⚠️ Incomplete' + (left ? ' · ' + left + ' left' : '');
    span.title = s.evaluation || 'This session recorded explicit unfinished work';
  } else {
    span.className = 'wh-eval unknown'; span.textContent = '❔ No verdict';
    span.title = 'No completion verdict could be read from this session’s transcript. '
      + 'This does NOT mean the work is unfinished — it means the indexer could not tell '
      + 'either way, which is true of about three quarters of your history.';
  }
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
// Date cell with the project stacked underneath (reclaims the old Project column).
// D/S/T cell — Date / Time / Session# (and Project for all-scope) stacked, so the
// Title column can stand alone. Saves horizontal space.
// v4.2: date / time / session# / project on ONE horizontal line. This cell used
// four stacked <div>s — block boxes, so it stood four text lines tall while every
// other cell in the row was one. The tallest cell sets the row height, so that
// stacking (not font size or padding) is what made rows ~66px.
function mkDateCell(s, showProject) {
  const td = document.createElement('td'); td.className = 'date wh-dst';
  const line = document.createElement('div'); line.className = 'wh-dst-line';
  const dt = (s.date || '—').split(' ');
  const parts = [['wh-dst-d', dt[0] || '—'], ['wh-dst-t', dt[1] || ''], ['wh-dst-s', (s.id || '').slice(0, 8)]];
  if (showProject) parts.push(['wh-dst-p', s.project || '']);
  parts.filter(([, v]) => v).forEach(([cls, v], i) => {
    if (i) { const sep = document.createElement('span'); sep.className = 'wh-dst-sep'; sep.textContent = '·'; line.appendChild(sep); }
    const el = document.createElement('span'); el.className = cls; el.textContent = v; line.appendChild(el);
  });
  td.title = (s.date || '') + (s.project ? ' — ' + s.project : '') + (s.id ? ' — ' + s.id : '');
  td.appendChild(line); return td;
}
const firstSentence = (t) => (t || '').split(/(?<=[.!?])\s/)[0];
// ─── Sessions view ───────────────────────────────────────────────────────────
// Three columns, most recently closed first: what YOU called the session, when
// it actually closed, and the auto-generated title the status bar falls back to
// when you never renamed it. Deliberately separate from the roll-up table, which
// answers a different question and carries columns this one has no use for.
function fmtClosed(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  const h = d.getHours(), ampm = h < 12 ? 'AM' : 'PM', h12 = h % 12 === 0 ? 12 : h % 12;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}  ${h12}:${p(d.getMinutes())} ${ampm}`;
}
// v4.8: a fragment is a session you never worked in — a hook firing, a
// sub-agent call, a window opened and closed. MEASURED over 400 sessions:
// median titled session 1,605 KB, median untitled 11 KB, 307 of 360 untitled
// rows under 20 KB, and every session over 2 MB is titled. Anything you named
// is ALWAYS kept regardless of size — your title is the strongest possible
// signal that a session mattered, and no size rule may override it.
const FRAGMENT_MAX_BYTES = 100 * 1024;
let whShowFragments = false;
const isFragment = (s) => !s.typedTitle && (s.size || 0) < FRAGMENT_MAX_BYTES;

function renderSessionsTable(sessions, showProject) {
  const box = document.createElement('div');
  const all = sessions.slice();
  const real = all.filter((s) => !isFragment(s));
  const hidden = all.length - real.length;
  const rows = whShowFragments ? all : real;

  // The count is stated in BOTH directions whether or not anything is hidden,
  // so a filtered list can never be mistaken for the whole list.
  const note = document.createElement('div'); note.className = 'wh-frag-note';
  const txt = document.createElement('span');
  txt.textContent = whShowFragments
    ? 'Showing all ' + all.length + ' sessions, including ' + hidden
      + ' automated fragments under 100 KB that you never worked in.'
    : 'Showing ' + real.length + ' working session' + (real.length === 1 ? '' : 's')
      + '. ' + hidden + ' automated fragment' + (hidden === 1 ? '' : 's')
      + ' under 100 KB hidden — every session you titled is shown.';
  const tog = document.createElement('button'); tog.className = 'wh-frag-toggle';
  tog.textContent = whShowFragments ? 'Hide fragments' : 'Show all ' + all.length;
  tog.title = whShowFragments
    ? 'Hide the small automated sessions again and show only real working sessions'
    : 'Also show the ' + hidden + ' small automated sessions that are currently hidden';
  tog.addEventListener('click', async () => { whShowFragments = !whShowFragments; await reloadWork(); });
  note.append(txt, tog);
  box.appendChild(note);

  const table = document.createElement('table'); table.className = 'wh wh-compact';
  const thead = document.createElement('thead'); const htr = document.createElement('tr');
  // v4.6: column order mirrors the sort order, so the ordering you see is the
  // ordering the screen claims — closed time first, session id as the tie-break.
  const cols = [['Closed',  '', 'When the session actually last had activity — the primary sort, newest first'],
                ['Session', '', 'First 8 characters of the session ID — hover for the full ID. Breaks ties within the same minute']];
  if (showProject) cols.push(['Project', '', 'Which project the session belongs to']);
  cols.push(['Your Title',       '', 'The name you gave the session with /rename — blank if you never renamed it'],
            ['Status Bar Title', '', 'The auto-generated title your status bar shows when no name of your own is set']);
  cols.forEach(([t, cls, tip]) => {
    const th = document.createElement('th'); th.textContent = t; th.title = tip;
    if (cls === 'num') th.className = 'num'; htr.appendChild(th);
  });
  thead.appendChild(htr); table.appendChild(thead);
  const tb = document.createElement('tbody');
  // Always closed-time first regardless of the Sort buttons — the whole point of
  // this view is recency. Session id breaks ties, so two sessions closing in the
  // same minute hold a fixed order instead of shuffling between loads.
  rows.slice()
    .sort((a, b) => ((b.mtime || 0) - (a.mtime || 0)) ||
                    ((a.id || '') < (b.id || '') ? -1 : (a.id || '') > (b.id || '') ? 1 : 0))
    .forEach((s) => {
      const tr = document.createElement('tr'); tr.className = 'clickable';
      const when = mkCell(fmtClosed(s.mtime), 'date');
      const sid  = mkCell((s.id || '—').slice(0, 8), 'wh-sid');
      sid.title  = s.id || 'No session ID recorded';
      const cells = [when, sid];
      if (showProject) cells.push(mkCell(s.project || '—', 'wh-proj'));
      const mine = mkCell(s.typedTitle || '—', 'topic');
      if (!s.typedTitle) mine.classList.add('wh-untitled');
      mine.title = s.typedTitle || 'You never renamed this session';
      cells.push(mine);
      const auto = mkCell(s.autoTitle || s.topic || '—', 'wh-auto');
      auto.title = s.autoTitle || s.topic || '';
      cells.push(auto);
      tr.append(...cells);
      tr.addEventListener('click', () => showEffort(s.id, 'functional'));
      tb.appendChild(tr);
    });
  table.appendChild(tb);
  box.appendChild(table);
  return box;
}

function renderRollupTable(sessions, showProject) {
  sessions = sortSessions(filterByCompleted(sessions));
  // 'D/S/T' was an abbreviation nothing on the page expanded — and it listed its
  // own values in the wrong order (the cell renders date, time, then id).
  const cols = [{ key: 'date',      label: 'Date / Time / ID', cls: 'date',
                  title: 'Stacked in this cell: the session date, its start time, and the first 8 '
                       + 'characters of the session ID — plus the project name in All Projects view' },
                { key: 'session',   label: 'Title',     cls: 'wh-title',
                  title: 'Session title, auto-generated from the work done' },
                { key: 'requested', label: 'Attempted', cls: 'wh-req',
                  title: 'What you asked for — first sentence of the request' },
                { key: 'delivered', label: 'Delivered', cls: 'wh-prod',
                  title: 'What was actually produced during the session' },
                { key: 'eval',      label: 'Completed', cls: '',
                  title: 'Whether the session ended in a verified complete state' }];
  const table = document.createElement('table'); table.className = 'wh';
  const thead = document.createElement('thead'); const htr = document.createElement('tr');
  cols.forEach(c => { const th = document.createElement('th'); th.textContent = c.label;
    if (c.title) th.title = c.title; htr.appendChild(th); });
  thead.appendChild(htr); table.appendChild(thead);
  const tb = document.createElement('tbody');
  let groupOf = null;
  sessions.forEach(s => {
    // Project A-Z in All Projects view: a divider row starts each project block.
    if ((whSort === 'project' || whSort === 'priority') && showProject && (s.project || '') !== groupOf) {
      groupOf = s.project || '';
      const gtr = document.createElement('tr'); gtr.className = 'wh-group';
      const gtd = document.createElement('td'); gtd.colSpan = cols.length;
      const rk = rankOfProject(groupOf);
      gtd.textContent = (groupOf || '(no project)') +
        (whSort === 'priority' && rk !== PRIO_UNRANKED ? '  ·  priority ' + rk : '');
      gtd.title = 'All sessions below this line belong to ' + (groupOf || 'no project') +
        (whSort === 'priority'
          ? (rk !== PRIO_UNRANKED ? ' — priority ' + rk : ' — not yet ranked, so it sorts last')
          : '');
      gtr.appendChild(gtd); tb.appendChild(gtr);
    }
    const tr = document.createElement('tr'); tr.className = 'clickable';
    cols.forEach(c => {
      if (c.key === 'date')    { tr.appendChild(mkDateCell(s, showProject)); return; }
      if (c.key === 'session') { const td = document.createElement('td'); td.className = 'wh-title'; td.title = s.topic || ''; const tt = document.createElement('div'); tt.className = 'wh-sess-title'; tt.textContent = s.topic || '(untitled)'; td.appendChild(tt); tr.appendChild(td); return; }
      if (c.key === 'eval')    { const td = document.createElement('td'); td.appendChild(evalBadge(s)); tr.appendChild(td); return; }
      // v4.2: cells are now held to a single line with a CSS ellipsis, so the
      // untruncated text moves to the title attribute rather than being lost.
      let v, full;
      switch (c.key) {
        case 'requested': full = (s.requested || s.action || '—'); v = clipText(firstSentence(full), 100); break;
        case 'delivered': full = (s.delivered || s.produced || '—'); v = clipText(full, 100); break;
        default:          full = '—'; v = '—';
      }
      const td = mkCell(v, c.cls); td.title = full; tr.appendChild(td);
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
  try { d = await fetchWork('/api/work-history?effort=' + encodeURIComponent(id), 'this work effort'); }
  catch (e) { workMsg(e.message); return; }
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
  [['functional', 'Functional Items', 'Break this session into its individual units of work — each tagged requested, produced, or outstanding'],
   ['raw',        'Raw exchanges',    'Show this session\'s unprocessed back-and-forth, with nothing summarised']].forEach(([k, lbl, tip]) => {
    const b = document.createElement('button'); b.className = 'wh-level-btn' + (level === k ? ' active' : '');
    b.textContent = lbl; b.title = tip; b.addEventListener('click', () => showEffort(id, k));
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
  addRow('Attempted', e.requested);
  addRow('Delivered', e.produced, 'prod');
  const er = document.createElement('div'); er.className = 'wh-rollup-row';
  const ek = document.createElement('div'); ek.className = 'wh-rollup-k'; ek.textContent = 'Completed';
  const ev = document.createElement('div'); ev.className = 'wh-rollup-v'; ev.appendChild(evalBadge(e));
  er.append(ek, ev); card.appendChild(er);
  wrap.appendChild(card);
  // Not delivered / Outstanding — the leftover items, only when incomplete.
  // Server-classified rows when available; the raw split is the fallback so an
  // un-restarted server renders the list without owners instead of breaking.
  const leftItems = (d.outstanding && d.outstanding.length)
    ? d.outstanding
    : (e.issues || '').split(' • ').filter(Boolean).map((text) => ({ text, owner: '', reason: '' }));
  if (e.eval_ok !== 1 && leftItems.length) {
    const oh = document.createElement('div'); oh.className = 'wh-section-h wh-out-h';
    oh.textContent = 'Not delivered / Outstanding (' + leftItems.length + ')';
    wrap.appendChild(oh);
    const ol = document.createElement('div'); ol.className = 'wh-items';
    // v4.16: this list and the Functional Items list below BOTH render rows
    // labelled "outstanding", from two different sources — this one from the
    // session's issues string, the other from the items table. Wiring owners
    // into only one of them left two visually identical rows where one said who
    // it was waiting on and the other did not. Caught by audit.mjs, not by eye.
    leftItems.forEach(it => {
      const fi = document.createElement('div'); fi.className = 'wh-fi wh-out-fi';
      const kd = document.createElement('div'); kd.className = 'wh-fi-kind issue'; kd.textContent = 'outstanding';
      const tx = document.createElement('div'); tx.className = 'wh-fi-text'; tx.textContent = it.text;
      fi.append(kd, tx);
      if (it.owner) {
        const ow = document.createElement('div'); ow.className = 'wh-fi-owner ' + it.owner;
        ow.textContent = it.owner === 'human' ? '🙋 waiting on you' : '🤖 waiting on Claude';
        ow.title = it.owner === 'human'
          ? 'This needs a decision or an action from you before it can move — ' + it.reason
          : 'Nothing is blocking this on your side — it is buildable work (' + it.reason + ')';
        fi.appendChild(ow);
      }
      ol.appendChild(fi);
    });
    wrap.appendChild(ol);
  }

  if (level === 'functional') {
    const items = d.items || [];
    const sh = document.createElement('div'); sh.className = 'wh-section-h'; sh.textContent = 'Functional Items (' + items.length + ')';
    sh.title = 'Discrete units of work identified in this session';
    wrap.appendChild(sh);
    if (!items.length) { const m = document.createElement('div'); m.className = 'wh-empty'; m.textContent = 'No functional items recorded.'; wrap.appendChild(m); }
    else {
      const list = document.createElement('div'); list.className = 'wh-items';
      // v4.16: each item now carries WHO IT IS WAITING ON, from the same
      // classifier the Outstanding page uses. Only open work gets an owner —
      // labelling a delivered item "waiting on Claude" would be a false claim.
      items.forEach(it => {
        const fi = document.createElement('div'); fi.className = 'wh-fi';
        const kd = document.createElement('div'); kd.className = 'wh-fi-kind ' + (it.kind || ''); kd.textContent = it.kind || '';
        const tx = document.createElement('div'); tx.className = 'wh-fi-text'; tx.textContent = it.text || '';
        fi.append(kd, tx);
        if (it.owner) {
          const ow = document.createElement('div');
          ow.className = 'wh-fi-owner ' + it.owner;
          ow.textContent = it.owner === 'human' ? '🙋 waiting on you'
                         : it.owner === 'done'  ? '✅ delivered'
                         : '🤖 waiting on Claude';
          ow.title = it.owner === 'human'
            ? 'This needs a decision or an action from you before it can move — ' + (it.reason || '')
            : it.owner === 'done' ? 'This session recorded it as delivered'
            : 'Nothing is blocking this on your side — it is buildable work (' + (it.reason || '') + ')';
          fi.appendChild(ow);
        }
        list.appendChild(fi);
      });
      wrap.appendChild(list);
    }
  } else {
    const xs = d.exchanges || [];
    const sh = document.createElement('div'); sh.className = 'wh-section-h'; sh.textContent = 'Raw exchanges (' + xs.length + ') — prompts ↔ responses';
    sh.title = 'The prompts you typed and the replies they got, in order';
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

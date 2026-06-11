const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");

const SIZE = 900; // medium default (zoom range 400–1400)

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const x = Math.round((workAreaSize.width  - SIZE) / 2);
  const y = Math.round((workAreaSize.height - SIZE) / 2);

  const win = new BrowserWindow({
    width: SIZE, height: SIZE, x, y,
    transparent: true, frame: false, resizable: false,
    alwaysOnTop: false, skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile("v18.html");

  // ── Drag-to-move: poll cursor while the renderer holds the void ──
  // BrowserWindow has no startWindowDrag() API; cursor polling is the
  // standard pattern for canvas-driven frameless window drags.
  let dragTimer  = null;
  let dragOffset = null;

  function stopDrag() {
    if (dragTimer) { clearInterval(dragTimer); dragTimer = null; }
    dragOffset = null;
  }

  ipcMain.on("start-drag", () => {
    const pt = screen.getCursorScreenPoint();
    const [wx, wy] = win.getPosition();
    dragOffset = { x: pt.x - wx, y: pt.y - wy };
    if (dragTimer) clearInterval(dragTimer);
    dragTimer = setInterval(() => {
      if (!dragOffset || win.isDestroyed()) { stopDrag(); return; }
      const p = screen.getCursorScreenPoint();
      win.setPosition(p.x - dragOffset.x, p.y - dragOffset.y);
    }, 16);
  });
  ipcMain.on("end-drag", stopDrag);

  // ── Smooth zoom: tween size around the window's own center ──
  // The previous handler snapped instantly and called win.center(),
  // yanking the window back to screen center on every click.
  let resizeTimer = null;

  ipcMain.on("resize-window", (_e, size) => {
    if (resizeTimer) { clearInterval(resizeTimer); resizeTimer = null; }
    const [w] = win.getSize();
    const [wx, wy] = win.getPosition();
    const cx = wx + w / 2, cy = wy + w / 2;
    const startW = w;
    const STEPS = 8, INTERVAL = 15;
    let i = 0;
    win.setResizable(true);
    resizeTimer = setInterval(() => {
      if (win.isDestroyed()) { clearInterval(resizeTimer); return; }
      i++;
      const t = i / STEPS;
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const s = Math.round(startW + (size - startW) * ease);
      win.setBounds({
        x: Math.round(cx - s / 2),
        y: Math.round(cy - s / 2),
        width: s, height: s,
      });
      if (i >= STEPS) {
        clearInterval(resizeTimer); resizeTimer = null;
        win.setResizable(false);
      }
    }, INTERVAL);
  });

  ipcMain.on("set-ignore-mouse", (_e, ignore) => win.setIgnoreMouseEvents(ignore, { forward: true }));
  ipcMain.on("close-window",     () => win.close());
  ipcMain.on("minimize-window",  () => win.minimize());
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

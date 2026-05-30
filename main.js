const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

const SIZE = 900; // square window containing the circle

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const x = Math.round((workAreaSize.width  - SIZE) / 2);
  const y = Math.round((workAreaSize.height - SIZE) / 2);

  const win = new BrowserWindow({
    width:       SIZE,
    height:      SIZE,
    x, y,
    transparent: true,
    frame:       false,
    resizable:   false,
    alwaysOnTop: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('v18.html');

  // Allow dragging the window by clicking inside the circle but outside nodes
  ipcMain.on('start-drag', () => win.webContents.executeJavaScript(''));

  // Click-through for transparent (non-circle) areas
  ipcMain.on('set-ignore-mouse', (_e, ignore) => {
    win.setIgnoreMouseEvents(ignore, { forward: true });
  });

  ipcMain.on('close-window',    () => win.close());
  ipcMain.on('minimize-window', () => win.minimize());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

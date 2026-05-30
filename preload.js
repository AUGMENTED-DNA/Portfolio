const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  close:          ()       => ipcRenderer.send('close-window'),
  minimize:       ()       => ipcRenderer.send('minimize-window'),
});

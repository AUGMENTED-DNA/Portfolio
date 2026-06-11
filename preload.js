const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  setIgnoreMouse: (ignore) => ipcRenderer.send("set-ignore-mouse", ignore),
  startDrag:      ()       => ipcRenderer.send("start-drag"),
  endDrag:        ()       => ipcRenderer.send("end-drag"),
  close:          ()       => ipcRenderer.send("close-window"),
  minimize:       ()       => ipcRenderer.send("minimize-window"),
  resize:         (size)   => ipcRenderer.send("resize-window", size),
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ntkDesktop', {
  isDesktop: true,
  platform: process.platform,
  setTheme: (preference, resolved) => {
    ipcRenderer.send('ntk:set-theme', { preference, resolved });
  },
});

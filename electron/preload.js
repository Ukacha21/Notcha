const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  setIgnore: (v) => ipcRenderer.send('set-ignore', v),
  quit: () => ipcRenderer.send('quit'),
  beep: () => ipcRenderer.send('beep'),
  onToggleHide: (cb) => ipcRenderer.on('toggle-hide', () => cb()),

  // Power actions: 'lock', 'sleep', 'shutdown', 'restart'
  powerAction: (action) => ipcRenderer.send('power-action', action),

  // App Launcher
  launchApp: (target) => ipcRenderer.send('launch-app', target),

  // Volume
  getSystemVolume: () => ipcRenderer.invoke('get-system-volume'),
  setSystemVolume: (vol) => ipcRenderer.send('set-system-volume', vol),

  // Clipboard
  getClipboardHistory: () => ipcRenderer.invoke('get-clipboard-history'),
  copyClipboardText: (text) => ipcRenderer.send('copy-clipboard-text', text),
  deleteClipboardItem: (id) => ipcRenderer.send('delete-clipboard-item', id),
  clearClipboard: () => ipcRenderer.send('clear-clipboard'),
  onClipboardUpdated: (cb) => ipcRenderer.on('clipboard-updated', (_e, list) => cb(list)),
});

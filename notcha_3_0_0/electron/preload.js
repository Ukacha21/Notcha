const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  setIgnore: (v) => ipcRenderer.send('set-ignore', v),
  quit: () => ipcRenderer.send('quit'),
  beep: () => ipcRenderer.send('beep'),
  onToggleHide: (cb) => ipcRenderer.on('toggle-hide', () => cb()),

  // Power actions: 'lock', 'sleep', 'shutdown', 'restart'
  powerAction: (action) => ipcRenderer.send('power-action', action),

  // DND Mode
  toggleDND: () => ipcRenderer.invoke('toggle-dnd'),
  getDND: () => ipcRenderer.invoke('get-dnd'),

  // Media Hub
  getMediaSources: () => ipcRenderer.invoke('get-media-sources'),
  sendMediaAction: (data) => ipcRenderer.send('media-action', data),
  onMediaSourcesUpdated: (cb) => ipcRenderer.on('media-sources-updated', (_e, sources) => cb(sources)),

  // App Launcher
  launchApp: (target) => ipcRenderer.send('launch-app', target),

  // Volume
  getSystemVolume: () => ipcRenderer.invoke('get-system-volume'),
  setSystemVolume: (vol) => ipcRenderer.send('set-system-volume', vol),

  // Audio Output Routing
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  setAudioDevice: (id) => ipcRenderer.invoke('set-audio-device', id),

  // Clipboard
  getClipboardHistory: () => ipcRenderer.invoke('get-clipboard-history'),
  copyClipboardText: (text) => ipcRenderer.send('copy-clipboard-text', text),
  deleteClipboardItem: (id) => ipcRenderer.send('delete-clipboard-item', id),
  clearClipboard: () => ipcRenderer.send('clear-clipboard'),
  onClipboardUpdated: (cb) => ipcRenderer.on('clipboard-updated', (_e, list) => cb(list)),

  // Transfer Server & Mini App
  openMiniTransfer: () => ipcRenderer.send('open-mini-transfer'),
  closeMiniTransfer: () => ipcRenderer.send('close-mini-transfer'),
  dockToNotch: () => ipcRenderer.send('dock-to-notch'),
  onFocusTransferTab: (cb) => ipcRenderer.on('focus-transfer-tab', () => cb()),
  getTransferServerInfo: () => ipcRenderer.invoke('get-transfer-server-info'),
  chooseFilesToShare: () => ipcRenderer.invoke('choose-files-to-share'),
  shareFiles: (paths) => ipcRenderer.invoke('share-files', paths),
  clearSharedFiles: () => ipcRenderer.invoke('clear-shared-files'),
  getTransfersHistory: () => ipcRenderer.invoke('get-transfers-history'),
  clearTransfersHistory: () => ipcRenderer.invoke('clear-transfers-history'),
  openTransfersFolder: () => ipcRenderer.send('open-transfers-folder'),
  showItemInFolder: (path) => ipcRenderer.send('show-item-in-folder', path),
  onTransferReceived: (cb) => ipcRenderer.on('transfer-received', (_e, item) => cb(item)),
  onSharedFilesUpdated: (cb) => ipcRenderer.on('shared-files-updated', (_e, files) => cb(files)),
  onTransfersHistoryUpdated: (cb) => ipcRenderer.on('transfers-history-updated', (_e, history) => cb(history)),
});

const { app, BrowserWindow, ipcMain, screen, globalShortcut, shell, clipboard, dialog, systemPreferences } = require('electron');
const path = require('path');
const { exec, execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const TransferServer = require('./transfer-server');

// Prevent transient errors from displaying modal crash dialogs
process.on('uncaughtException', (err) => {
  console.error('[Notcha] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Notcha] Unhandled Rejection:', reason);
});

// Canvas dimensions: large enough to fit expanded island tabs without clipping.
const W = 640;
const H = 320;
let win;

// In-memory clipboard history
let clipboardHistory = [];
let lastClipText = '';

// DND State
let isDND = false;

function place() {
  if (!win) return;
  const { x, y, width } = screen.getPrimaryDisplay().bounds;
  win.setBounds({ x: Math.round(x + (width - W) / 2), y, width: W, height: H });
}

function createWindow() {
  const opts = {
    width: W,
    height: H,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    enableLargerThanScreen: true,
    show: false,
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
  if (process.platform === 'darwin') opts.type = 'panel';

  win = new BrowserWindow(opts);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });

  win.webContents.on('console-message', (_e, level, message, line) => {
    console.log(`[Renderer] ${message} (line ${line})`);
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  win.once('ready-to-show', () => {
    place();
    win.showInactive();
    if (process.platform === 'darwin') app.dock.hide();
  });
}

// ---------- Transfer Server & Independent Floating Windows ----------
let transferServer = null;
let miniWin = null;
let sendWin = null;
let receiveWin = null;

function broadcastTransferEvent(channel, data) {
  const windows = [win, miniWin, sendWin, receiveWin];
  for (const w of windows) {
    if (w && !w.isDestroyed()) {
      try {
        w.webContents.send(channel, data);
      } catch (_) {}
    }
  }
}

function initTransferServer() {
  transferServer = new TransferServer({
    onTransferReceived: (item) => {
      broadcastTransferEvent('transfer-received', item);
      broadcastTransferEvent('transfers-history-updated', transferServer.history);
    },
    onTransferProgress: (progress) => {
      broadcastTransferEvent('transfer-progress', progress);
    },
    onDevicePaired: (device) => {
      broadcastTransferEvent('device-paired', device);
    },
    onDeviceUnpaired: () => {
      broadcastTransferEvent('device-unpaired');
    },
    onDiscoveredDevicesUpdated: (devices) => {
      broadcastTransferEvent('discovered-devices-updated', devices);
    },
  });
  transferServer.start().catch((err) => {
    console.error('Failed to start transfer server:', err);
  });
}

function createMiniTransferWindow() {
  if (miniWin && !miniWin.isDestroyed()) {
    miniWin.show();
    miniWin.focus();
    return;
  }
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const miniW = 360;
  const miniH = 480;

  miniWin = new BrowserWindow({
    width: miniW,
    height: miniH,
    x: Math.round((width - miniW) / 2),
    y: Math.round((height - miniH) / 2),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    minWidth: 320,
    minHeight: 400,
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: true,
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  miniWin.loadFile(path.join(__dirname, 'mini-transfer.html'));

  miniWin.on('closed', () => {
    miniWin = null;
  });
}

function createSendWindow() {
  if (sendWin && !sendWin.isDestroyed()) {
    sendWin.show();
    sendWin.focus();
    return;
  }
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const swW = 460;
  const swH = 540;

  sendWin = new BrowserWindow({
    width: swW,
    height: swH,
    x: Math.round((width - swW) / 2) - 100,
    y: Math.round((height - swH) / 2) - 40,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    minWidth: 380,
    minHeight: 460,
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: true,
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  sendWin.loadFile(path.join(__dirname, 'send-window.html'));

  sendWin.on('closed', () => {
    sendWin = null;
  });
}

function createReceiveWindow() {
  if (receiveWin && !receiveWin.isDestroyed()) {
    receiveWin.show();
    receiveWin.focus();
    return;
  }
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const rwW = 540;
  const rwH = 580;

  receiveWin = new BrowserWindow({
    width: rwW,
    height: rwH,
    x: Math.round((width - rwW) / 2) + 100,
    y: Math.round((height - rwH) / 2) - 40,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    minWidth: 420,
    minHeight: 480,
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: true,
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  receiveWin.loadFile(path.join(__dirname, 'receive-window.html'));

  receiveWin.on('closed', () => {
    receiveWin = null;
  });
}

// ---------- Dock Icon Hover Window Previews ----------
let dockHelperProcess = null;
let dockPreviewWin = null;
let isMouseOverDockPreview = false;
let dockPreviewHideTimer = null;
let isDockPreviewReady = false;
let pendingDockPreviewData = null;

function requestMacPermissionsOnLaunch() {
  // Do not aggressively interrupt the user or open System Settings on launch.
  // Permissions are checked quietly by background helpers without popup dialogs.
}

function createDockPreviewWindow() {
  if (dockPreviewWin && !dockPreviewWin.isDestroyed()) return;

  dockPreviewWin = new BrowserWindow({
    width: 280,
    height: 280,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'darwin') {
    dockPreviewWin.setAlwaysOnTop(true, 'screen-saver');
    dockPreviewWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  isDockPreviewReady = false;
  dockPreviewWin.webContents.once('did-finish-load', () => {
    isDockPreviewReady = true;
    if (pendingDockPreviewData && dockPreviewWin && !dockPreviewWin.isDestroyed()) {
      dockPreviewWin.webContents.send('dock-preview-data', pendingDockPreviewData);
      pendingDockPreviewData = null;
    }
  });

  dockPreviewWin.loadFile(path.join(__dirname, 'dock-preview.html'));

  dockPreviewWin.on('closed', () => {
    dockPreviewWin = null;
    isDockPreviewReady = false;
    pendingDockPreviewData = null;
  });
}

function showDockPreview(data) {
  try {
    if (!data || !Array.isArray(data.windows) || data.windows.length === 0) return;

    if (!dockPreviewWin || dockPreviewWin.isDestroyed()) {
      createDockPreviewWindow();
    }
    clearTimeout(dockPreviewHideTimer);

    const iconFrame = data.iconFrame || {};
    const fx = Number.isFinite(iconFrame.x) ? iconFrame.x : 0;
    const fy = Number.isFinite(iconFrame.y) ? iconFrame.y : 1000;
    const fw = Number.isFinite(iconFrame.width) ? iconFrame.width : 44;
    const fh = Number.isFinite(iconFrame.height) ? iconFrame.height : 44;

    const cardWidth = 220;
    const cardGap = 10;
    const shellPadding = 28;
    const count = Math.min(4, data.windows.length);
    const previewW = Math.round(count * cardWidth + (count - 1) * cardGap + shellPadding + 36);
    const previewH = 250;

    const display = screen.getDisplayNearestPoint({ x: Math.round(fx), y: Math.round(fy) }) || screen.getPrimaryDisplay();
    const { x: dispX, y: dispY, width: dispW, height: dispH } = display.bounds;

    let posX = Math.round(fx + (fw - previewW) / 2);
    let posY = Math.round(fy - previewH - 4); // Flush 4px gap to eliminate mouse dead zone

    // Multi-orientation Dock support (Bottom, Left, Right)
    if (fx <= dispX + 80) {
      posX = Math.round(fx + fw + 4);
      posY = Math.round(fy + (fh - previewH) / 2);
    } else if (fx + fw >= dispX + dispW - 80) {
      posX = Math.round(fx - previewW - 4);
      posY = Math.round(fy + (fh - previewH) / 2);
    } else {
      if (posY < dispY + 10) {
        posY = Math.round(fy + fh + 4);
      }
    }

    // Safety screen boundary clamping
    posX = Math.max(dispX + 8, Math.min(dispX + dispW - previewW - 8, posX));
    posY = Math.max(dispY + 8, Math.min(dispY + dispH - previewH - 8, posY));

    if (dockPreviewWin && !dockPreviewWin.isDestroyed()) {
      dockPreviewWin.setBounds({ x: posX, y: posY, width: previewW, height: previewH });
      if (isDockPreviewReady) {
        dockPreviewWin.webContents.send('dock-preview-data', data);
      } else {
        pendingDockPreviewData = data;
      }
      dockPreviewWin.showInactive();
    }
  } catch (err) {
    console.warn('showDockPreview error:', err);
  }
}

function hideDockPreview() {
  clearTimeout(dockPreviewHideTimer);
  dockPreviewHideTimer = setTimeout(() => {
    try {
      if (!isMouseOverDockPreview && dockPreviewWin && !dockPreviewWin.isDestroyed()) {
        dockPreviewWin.hide();
      }
    } catch (_) {}
  }, 550); // Generous 550ms grace period so moving cursor to cards never vanishes
}

function startDockHelper() {
  if (process.platform !== 'darwin') return;
  const dockHelperPath = getAssetPath('dock-helper');
  if (!fs.existsSync(dockHelperPath)) return;

  createDockPreviewWindow();

  try {
    dockHelperProcess = spawn(dockHelperPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    dockHelperProcess.on('error', (err) => {
      console.warn('dockHelperProcess error:', err.message);
      dockHelperProcess = null;
    });

    if (dockHelperProcess.stdin) {
      dockHelperProcess.stdin.on('error', (err) => {
        console.warn('dockHelperProcess.stdin error:', err.message);
      });
    }

    let buffer = '';
    dockHelperProcess.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.type === 'hover') {
            showDockPreview(msg);
          } else if (msg.type === 'leave') {
            hideDockPreview();
          }
        } catch (_) {}
      }
    });

    dockHelperProcess.on('exit', () => {
      dockHelperProcess = null;
    });
  } catch (err) {
    console.error('Failed to spawn dock-helper:', err);
  }
}

// ---------- Clipboard Watcher ----------
function startClipboardWatcher() {
  setInterval(() => {
    try {
      const text = clipboard.readText().trim();
      if (text && text !== lastClipText) {
        lastClipText = text;
        const existingIdx = clipboardHistory.findIndex((item) => item.text === text);
        if (existingIdx !== -1) {
          clipboardHistory.splice(existingIdx, 1);
        }
        clipboardHistory.unshift({
          id: Date.now().toString(),
          text,
          time: Date.now(),
        });
        if (clipboardHistory.length > 30) {
          clipboardHistory = clipboardHistory.slice(0, 30);
        }
        if (win && !win.isDestroyed()) {
          win.webContents.send('clipboard-updated', clipboardHistory);
        }
      }
    } catch (_) {}
  }, 750);
}

// ---------- Media Hub & Multi-App Sync ----------
function getAssetPath(file) {
  const normalPath = path.join(__dirname, file);
  const unpackedPath = normalPath.replace('app.asar', 'app.asar.unpacked');
  return fs.existsSync(unpackedPath) ? unpackedPath : normalPath;
}
const mediaHelperPath = getAssetPath('media-helper');
const nowPlayingScriptPath = getAssetPath('nowplaying-query.swift');

let cachedSystemVolume = 50;
if (process.platform === 'darwin') {
  execFile(mediaHelperPath, ['getvolume'], (err, stdout) => {
    if (!err && stdout && stdout.trim()) {
      const v = parseInt(stdout.trim(), 10);
      if (!isNaN(v)) cachedSystemVolume = v;
    }
  });
}

// Run an AppleScript safely via a temp file
function runAppleScript(script) {
  return new Promise((resolve) => {
    const tmpFile = path.join(os.tmpdir(), `notcha_${Date.now()}_${Math.random().toString(36).slice(2)}.applescript`);
    fs.writeFile(tmpFile, script, 'utf8', (writeErr) => {
      if (writeErr) return resolve({ err: writeErr, stdout: '' });
      exec(`osascript "${tmpFile}"`, { timeout: 4000 }, (err, stdout, stderr) => {
        fs.unlink(tmpFile, () => {}); // cleanup
        resolve({ err, stdout: stdout || '', stderr: stderr || '' });
      });
    });
  });
}

function sendSystemMediaAction(action, value) {
  if (process.platform === 'darwin') {
    if (action === 'seek' && typeof value === 'number') {
      execFile(mediaHelperPath, ['media', 'seek', String(Math.round(value))], (err) => {
        if (err) console.error('Seek error:', err);
      });
      return;
    }

    let act = 'playpause';
    if (action === 'next') act = 'next';
    else if (action === 'prev') act = 'prev';
    else if (action === 'play') act = 'play';
    else if (action === 'pause') act = 'pause';

    execFile(mediaHelperPath, ['media', act], (err) => {
      if (err) {
        // Fallback: AppleScript key code (Play/Pause=16, Next=19, Prev=20)
        const kc = act === 'next' ? 19 : act === 'prev' ? 20 : 16;
        const fbScript = `tell application "System Events" to key code ${kc} using {}`;
        runAppleScript(fbScript);
      }
    });
  } else {
    // Windows PowerShell media key simulation
    const vkMap = { playpause: 179, next: 176, prev: 177, play: 179, pause: 179 };
    const vk = vkMap[action] || 179;
    exec(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait([char]${vk})"`);
  }
}

// Queries System-wide Now Playing session via MediaRemote (captures Telegram, YouTube, AIMP, Spotify, etc.)
function queryNowPlaying() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve(null);
    exec(`swift "${nowPlayingScriptPath}"`, { timeout: 1800 }, (err, stdout) => {
      if (err || !stdout || !stdout.trim()) return resolve(null);
      try {
        const data = JSON.parse(stdout.trim());
        if (!data.title || data.title === 'No Media Playing' || data.title === 'Media Player' && !data.isPlaying) {
          return resolve(null);
        }
        if (typeof data.volume === 'number') {
          cachedSystemVolume = data.volume;
        }
        resolve({
          id: 'nowplaying',
          name: data.client || 'Now Playing',
          bundle: data.bundle || '',
          icon: data.icon || 'system',
          state: data.isPlaying ? 'playing' : (data.state || 'paused'),
          title: data.title,
          artist: data.artist || data.client,
          position: Math.round(data.elapsed || 0),
          duration: Math.round(data.duration || 300),
          volume: typeof data.volume === 'number' ? data.volume : cachedSystemVolume,
        });
      } catch (_) {
        resolve(null);
      }
    });
  });
}

// Queries Apple Music
function queryAppleMusic() {
  return new Promise(async (resolve) => {
    if (process.platform !== 'darwin') return resolve(null);
    const script = `if application "Music" is running then
  tell application "Music"
    try
      set pState to player state as string
      try
        set trkName to name of current track
      on error
        set trkName to ""
      end try
      try
        set trkArtist to artist of current track
      on error
        set trkArtist to ""
      end try
      try
        set trkPos to player position
      on error
        set trkPos to 0
      end try
      try
        set trkDur to duration of current track
      on error
        set trkDur to 300
      end try
      try
        set vol to sound volume
      on error
        set vol to 75
      end try
      return "OK|" & pState & "|" & trkName & "|" & trkArtist & "|" & trkPos & "|" & trkDur & "|" & vol
    on error
      return "IDLE|idle|||0|300|75"
    end try
  end tell
else
  return "NOT_RUNNING"
end if`;
    const { err, stdout } = await runAppleScript(script);
    if (err || !stdout || stdout.includes('NOT_RUNNING')) return resolve(null);
    const parts = stdout.trim().split('|');
    const isOk = parts[0] === 'OK';
    const isPlaying = isOk && parts[1] === 'playing';
    resolve({
      id: 'apple-music',
      name: 'Apple Music',
      icon: 'apple',
      state: isPlaying ? 'playing' : (isOk && parts[1] === 'paused' ? 'paused' : 'idle'),
      title: isOk && parts[2] ? parts[2] : 'Music Library',
      artist: isOk && parts[3] ? parts[3] : 'Apple Music',
      position: isOk && parts[4] && parts[4] !== 'missing value' ? (parseFloat(parts[4]) || 0) : 0,
      duration: isOk && parts[5] && parts[5] !== 'missing value' ? (parseFloat(parts[5]) || 300) : 300,
      volume: parseInt(parts[6], 10) || 75,
    });
  });
}

// Queries Spotify
function querySpotify() {
  return new Promise(async (resolve) => {
    if (process.platform !== 'darwin') return resolve(null);
    const script = `if application "Spotify" is running then
  tell application "Spotify"
    try
      set pState to player state as string
      try
        set trkName to name of current track
      on error
        set trkName to ""
      end try
      try
        set trkArtist to artist of current track
      on error
        set trkArtist to ""
      end try
      try
        set trkPos to (player position as integer)
      on error
        set trkPos to 0
      end try
      try
        set trkDur to ((duration of current track) / 1000 as integer)
      on error
        set trkDur to 300
      end try
      try
        set vol to sound volume
      on error
        set vol to 75
      end try
      return "OK|" & pState & "|" & trkName & "|" & trkArtist & "|" & trkPos & "|" & trkDur & "|" & vol
    on error
      return "IDLE|idle|||0|300|75"
    end try
  end tell
else
  return "NOT_RUNNING"
end if`;
    const { err, stdout } = await runAppleScript(script);
    if (err || !stdout || stdout.includes('NOT_RUNNING')) return resolve(null);
    const parts = stdout.trim().split('|');
    const isOk = parts[0] === 'OK';
    resolve({
      id: 'spotify',
      name: 'Spotify',
      icon: 'spotify',
      state: isOk ? (parts[1] === 'playing' ? 'playing' : 'paused') : 'idle',
      title: isOk && parts[2] ? parts[2] : 'Spotify Player',
      artist: isOk && parts[3] ? parts[3] : 'Spotify',
      position: isOk ? (parseFloat(parts[4]) || 0) : 0,
      duration: isOk ? (parseFloat(parts[5]) || 300) : 300,
      volume: parseInt(parts[6], 10) || 75,
    });
  });
}

// Queries VLC Media Player
function queryVLC() {
  return new Promise(async (resolve) => {
    if (process.platform !== 'darwin') return resolve(null);
    const script = `if application "VLC" is running then
  tell application "VLC"
    try
      set isPlay to (playing as string)
      try
        set trkName to name of current item
      on error
        set trkName to ""
      end try
      try
        set trkTime to current time
      on error
        set trkTime to 0
      end try
      try
        set trkDur to duration of current item
      on error
        set trkDur to 0
      end try
      return "OK|" & isPlay & "|" & trkName & "|" & trkTime & "|" & trkDur
    on error
      return "IDLE||||"
    end try
  end tell
else
  return "NOT_RUNNING"
end if`;
    const { err, stdout } = await runAppleScript(script);
    if (err || !stdout || stdout.includes('NOT_RUNNING')) return resolve(null);
    const parts = stdout.trim().split('|');
    const isOk = parts[0] === 'OK';
    const isPlaying = isOk && parts[1] === 'true';
    resolve({
      id: 'vlc',
      name: 'VLC Player',
      icon: 'vlc',
      state: isPlaying ? 'playing' : 'paused',
      title: isOk && parts[2] ? parts[2] : 'VLC Media Player',
      artist: 'Local Media / Video Stream',
      position: isOk ? (parseFloat(parts[3]) || 0) : 0,
      duration: isOk && parseFloat(parts[4]) > 0 ? parseFloat(parts[4]) : 300,
      volume: cachedSystemVolume,
    });
  });
}

// Active Media Detector (only returns the app currently playing sounds or recently paused)
async function getActiveMediaSource() {
  const [nowPlaying, appleMusic, spotify, vlc] = await Promise.all([
    queryNowPlaying(),
    queryAppleMusic(),
    querySpotify(),
    queryVLC(),
  ]);

  // 1. Is there an app actively playing sounds right now?
  if (nowPlaying && nowPlaying.state === 'playing') {
    const lowerClient = (nowPlaying.name || '').toLowerCase();
    const lowerBundle = (nowPlaying.bundle || '').toLowerCase();
    if (nowPlaying.icon === 'apple' || lowerClient.includes('music') || lowerBundle.includes('music')) {
      nowPlaying.id = 'apple-music';
      if (appleMusic) {
        nowPlaying.volume = appleMusic.volume;
        if (appleMusic.position > 0) nowPlaying.position = appleMusic.position;
        if (appleMusic.duration > 0) nowPlaying.duration = appleMusic.duration;
      }
    } else if (nowPlaying.icon === 'spotify' || lowerClient.includes('spotify') || lowerBundle.includes('spotify')) {
      nowPlaying.id = 'spotify';
      if (spotify) {
        nowPlaying.volume = spotify.volume;
        if (spotify.position > 0) nowPlaying.position = spotify.position;
        if (spotify.duration > 0) nowPlaying.duration = spotify.duration;
      }
    } else if (nowPlaying.icon === 'vlc' || lowerClient.includes('vlc') || lowerBundle.includes('vlc')) {
      nowPlaying.id = 'vlc';
      if (vlc && vlc.position > 0) nowPlaying.position = vlc.position;
    }
    return nowPlaying;
  }

  // If nowPlaying didn't report playing, check if Apple Music, Spotify, or VLC is playing
  if (appleMusic && appleMusic.state === 'playing') {
    return appleMusic;
  }
  if (spotify && spotify.state === 'playing') {
    return spotify;
  }
  if (vlc && vlc.state === 'playing') {
    return vlc;
  }

  // 2. Check if an app was playing and is now paused
  if (nowPlaying && nowPlaying.state === 'paused' && nowPlaying.title && nowPlaying.title !== 'Media Player' && nowPlaying.title !== 'No Media Playing') {
    const lowerClient = (nowPlaying.name || '').toLowerCase();
    const lowerBundle = (nowPlaying.bundle || '').toLowerCase();
    if (nowPlaying.icon === 'apple' || lowerClient.includes('music') || lowerBundle.includes('music')) {
      nowPlaying.id = 'apple-music';
      if (appleMusic) {
        nowPlaying.volume = appleMusic.volume;
        if (appleMusic.position > 0) nowPlaying.position = appleMusic.position;
      }
    } else if (nowPlaying.icon === 'spotify' || lowerClient.includes('spotify') || lowerBundle.includes('spotify')) {
      nowPlaying.id = 'spotify';
      if (spotify) {
        nowPlaying.volume = spotify.volume;
        if (spotify.position > 0) nowPlaying.position = spotify.position;
      }
    } else if (nowPlaying.icon === 'vlc' || lowerClient.includes('vlc') || lowerBundle.includes('vlc')) {
      nowPlaying.id = 'vlc';
      if (vlc && vlc.position > 0) nowPlaying.position = vlc.position;
    }
    return nowPlaying;
  }

  if (spotify && spotify.state === 'paused' && spotify.title && spotify.title !== 'Spotify Player') {
    return spotify;
  }

  if (appleMusic && appleMusic.state === 'paused' && appleMusic.title && appleMusic.title !== 'Music Library') {
    return appleMusic;
  }

  if (vlc && vlc.state === 'paused' && vlc.title && vlc.title !== 'VLC Media Player') {
    return vlc;
  }

  // 3. Otherwise, nothing is playing or paused
  return null;
}

// Start Media Poller (every 2.0s)
setInterval(async () => {
  if (win && !win.isDestroyed()) {
    const active = await getActiveMediaSource();
    win.webContents.send('media-sources-updated', active ? [active] : []);
  }
}, 2000);

// ---------- IPC Handlers ----------
ipcMain.on('set-ignore', (_e, ignore) => {
  if (!win || win.isDestroyed()) return;
  if (ignore) win.setIgnoreMouseEvents(true, { forward: true });
  else win.setIgnoreMouseEvents(false);
});

ipcMain.on('quit', () => app.quit());
ipcMain.on('beep', () => shell.beep());

// Power actions
ipcMain.on('power-action', (_e, action) => {
  const isMac = process.platform === 'darwin';
  if (action === 'lock') {
    if (isMac) {
      // 1. Instantly lock workstation via media-helper SACLockScreenImmediate
      execFile(mediaHelperPath, ['lock'], (err, stdout) => {
        if (err || !stdout || !stdout.includes('successfully')) {
          // Fallback: keystroke Cmd+Ctrl+Q
          exec(`osascript -e 'tell application "System Events" to keystroke "q" using {command down, control down}'`, (kErr) => {
            if (kErr) exec('/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend');
          });
        }
      });
    } else {
      exec('rundll32.exe user32.dll,LockWorkStation');
    }
  } else if (action === 'sleep') {
    if (isMac) {
      exec('/usr/bin/pmset sleepnow');
    } else {
      exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
    }
  } else if (action === 'shutdown') {
    if (isMac) {
      exec('osascript -e \'tell app "System Events" to shut down\'');
    } else {
      exec('shutdown /s /t 0');
    }
  } else if (action === 'restart') {
    if (isMac) {
      exec('osascript -e \'tell app "System Events" to restart\'');
    } else {
      exec('shutdown /r /t 0');
    }
  }
});

// System DND Toggle and Query Functions
async function toggleSystemDND() {
  if (process.platform === 'darwin') {
    const script = `tell application "System Events" to tell process "ControlCenter"
  set ccItem to (first menu bar item of menu bar 1 whose description is "Control Center")
  click ccItem
  delay 0.15
  set isNowOn to false
  repeat with el in checkboxes of group 1 of window 1
    if value of attribute "AXIdentifier" of el is "controlcenter-focus-modes" then
      click el
      delay 0.1
      set isNowOn to (value of el is 1)
      exit repeat
    end if
  end repeat
  key code 53
  return isNowOn
end tell`;
    const { err, stdout } = await runAppleScript(script);
    if (!err && stdout) {
      isDND = stdout.trim() === 'true';
      return isDND;
    }
  }
  isDND = !isDND;
  return isDND;
}

async function getSystemDND() {
  if (process.platform === 'darwin') {
    const script = `tell application "System Events" to tell process "ControlCenter"
  set isFocusOn to false
  repeat with i in menu bar items of menu bar 1
    if description of i is "Focus" then
      set isFocusOn to true
      exit repeat
    end if
  end repeat
  return isFocusOn
end tell`;
    const { err, stdout } = await runAppleScript(script);
    if (!err && stdout) {
      isDND = stdout.trim() === 'true';
      return isDND;
    }
  }
  return isDND;
}

ipcMain.handle('toggle-dnd', async () => await toggleSystemDND());
ipcMain.handle('get-dnd', async () => await getSystemDND());

// Media Control Action
ipcMain.on('media-action', (_e, { source, action, value }) => {
  const isMac = process.platform === 'darwin';

  if ((source === 'apple-music' || source === 'music') && isMac) {
    if (action === 'playpause') runAppleScript('tell application "Music" to playpause');
    else if (action === 'play') runAppleScript('tell application "Music" to play');
    else if (action === 'pause') runAppleScript('tell application "Music" to pause');
    else if (action === 'next') runAppleScript('tell application "Music" to next track');
    else if (action === 'prev') runAppleScript('tell application "Music" to previous track');
    else if (action === 'seek' && typeof value === 'number') runAppleScript(`tell application "Music" to set player position to ${Math.round(value)}`);
    else if (action === 'volume' && typeof value === 'number') runAppleScript(`tell application "Music" to set sound volume to ${Math.round(value)}`);
    return;
  }

  if (source === 'spotify' && isMac) {
    if (action === 'playpause') runAppleScript('tell application "Spotify" to playpause');
    else if (action === 'play') runAppleScript('tell application "Spotify" to play');
    else if (action === 'pause') runAppleScript('tell application "Spotify" to pause');
    else if (action === 'next') runAppleScript('tell application "Spotify" to next track');
    else if (action === 'prev') runAppleScript('tell application "Spotify" to previous track');
    else if (action === 'seek' && typeof value === 'number') runAppleScript(`tell application "Spotify" to set player position to ${Math.round(value)}`);
    else if (action === 'volume' && typeof value === 'number') runAppleScript(`tell application "Spotify" to set sound volume to ${Math.round(value)}`);
    return;
  }

  if (source === 'vlc' && isMac) {
    if (action === 'playpause') runAppleScript('tell application "VLC" to play');
    else if (action === 'play') runAppleScript('tell application "VLC" to play');
    else if (action === 'pause') runAppleScript('tell application "VLC" to pause');
    else if (action === 'next') runAppleScript('tell application "VLC" to next');
    else if (action === 'prev') runAppleScript('tell application "VLC" to previous');
    else if (action === 'seek' && typeof value === 'number') runAppleScript(`tell application "VLC" to set current time to ${Math.round(value)}`);
    return;
  }

  // Universal Media Remote & NowPlaying / YouTube / Telegram / System
  if (action === 'playpause' || action === 'play' || action === 'pause' || action === 'next' || action === 'prev' || action === 'seek') {
    sendSystemMediaAction(action, value);
    if (action === 'seek' && typeof value === 'number' && isMac) {
      const sec = Math.round(value);
      runAppleScript(`if application "Music" is running then tell application "Music" to set player position to ${sec}`);
      runAppleScript(`if application "Spotify" is running then tell application "Spotify" to set player position to ${sec}`);
      runAppleScript(`if application "VLC" is running then tell application "VLC" to set current time to ${sec}`);
    }
  } else if (action === 'volume' && typeof value === 'number') {
    const v = Math.max(0, Math.min(100, Math.round(value)));
    cachedSystemVolume = v;
    if (isMac) {
      execFile(mediaHelperPath, ['volume', String(v)], (err) => {
        if (err) runAppleScript(`set volume output volume ${v}`);
      });
    }
  }
});

ipcMain.handle('get-media-sources', async () => {
  const active = await getActiveMediaSource();
  return active ? [active] : [];
});

// App launcher
ipcMain.on('launch-app', (_e, target) => {
  if (!target) return;
  const isMac = process.platform === 'darwin';

  if (target.startsWith('http://') || target.startsWith('https://')) {
    shell.openExternal(target);
    return;
  }

  const map = {
    browser: isMac ? 'open -a "Google Chrome" || open -a "Brave Browser" || open -a Safari' : 'start msedge || start chrome',
    terminal: isMac ? 'open -a Terminal' : 'start wt || start cmd',
    vscode: isMac ? 'open -a "Visual Studio Code" || code .' : 'code . || start code',
    finder: isMac ? 'open ~' : 'explorer',
    music: isMac ? 'open -a Spotify || open -a Music' : 'start spotify: || start mswindowsmusic:',
    calculator: isMac ? 'open -a Calculator' : 'calc',
    notes: isMac ? 'open -a Notes' : 'notepad',
    settings: isMac ? 'open "x-apple.systempreferences:"' : 'start ms-settings:',
  };

  const cmd = map[target] || (isMac ? `open "${target}"` : `start "${target}"`);
  exec(cmd, (err) => {
    if (err) {
      shell.openPath(target);
    }
  });
});

// System volume
ipcMain.handle('get-system-volume', async () => {
  if (process.platform === 'darwin') {
    return new Promise((resolve) => {
      execFile(mediaHelperPath, ['getvolume'], (err, stdout) => {
        if (!err && stdout && stdout.trim()) {
          const v = parseInt(stdout.trim(), 10);
          if (!isNaN(v)) {
            cachedSystemVolume = v;
            return resolve(v);
          }
        }
        resolve(cachedSystemVolume);
      });
    });
  }
  return cachedSystemVolume;
});

ipcMain.on('set-system-volume', (_e, vol) => {
  const v = Math.max(0, Math.min(100, Math.round(vol)));
  cachedSystemVolume = v;
  if (process.platform === 'darwin') {
    execFile(mediaHelperPath, ['volume', String(v)], (err) => {
      if (err) runAppleScript(`set volume output volume ${v}`);
    });
  }
});

// Audio routing devices
ipcMain.handle('get-audio-devices', async () => {
  if (process.platform === 'darwin') {
    return new Promise((resolve) => {
      execFile(mediaHelperPath, ['getaudiodevices'], (err, stdout) => {
        if (!err && stdout && stdout.trim()) {
          try {
            const list = JSON.parse(stdout.trim());
            return resolve(Array.isArray(list) ? list : []);
          } catch (_) {}
        }
        resolve([]);
      });
    });
  }
  return [];
});

ipcMain.handle('set-audio-device', async (_e, deviceId) => {
  if (!deviceId) return false;
  if (process.platform === 'darwin') {
    return new Promise((resolve) => {
      execFile(mediaHelperPath, ['setaudiodevice', String(deviceId)], (err, stdout) => {
        if (!err && stdout && stdout.trim().includes('OK')) {
          return resolve(true);
        }
        resolve(false);
      });
    });
  }
  return false;
});

// ---------- Multi-App Volume Mixer ----------
const appVolumeStore = {
  spotify: 75,
  'apple-music': 75,
  vlc: 80,
  quicktime: 80,
  chrome: 100,
  brave: 100,
  safari: 100,
  arc: 100,
  telegram: 100,
  discord: 100,
};
const appMuteStore = {};

async function queryRunningAudioApps() {
  const isMac = process.platform === 'darwin';
  const apps = [
    {
      id: 'system',
      name: 'Master Output',
      icon: 'speaker',
      volume: cachedSystemVolume,
      isMuted: cachedSystemVolume === 0,
      isMaster: true,
    },
  ];

  if (!isMac) return apps;

  return new Promise((resolve) => {
    const script = `
      set appList to ""
      if application "Spotify" is running then
        tell application "Spotify" to set v to sound volume
        set appList to appList & "spotify:Spotify:" & v & ";"
      end if
      if application "Music" is running then
        tell application "Music" to set v to sound volume
        set appList to appList & "apple-music:Apple Music:" & v & ";"
      end if
      if application "QuickTime Player" is running then
        set appList to appList & "quicktime:QuickTime Player:80;"
      end if
      if application "VLC" is running then
        set appList to appList & "vlc:VLC:80;"
      end if
      if application "Google Chrome" is running then
        set appList to appList & "chrome:Google Chrome:100;"
      end if
      if application "Brave Browser" is running then
        set appList to appList & "brave:Brave Browser:100;"
      end if
      if application "Safari" is running then
        set appList to appList & "safari:Safari:100;"
      end if
      if application "Arc" is running then
        set appList to appList & "arc:Arc:100;"
      end if
      if application "Telegram" is running then
        set appList to appList & "telegram:Telegram:100;"
      end if
      if application "Discord" is running then
        set appList to appList & "discord:Discord:100;"
      end if
      return appList
    `;

    execFile('osascript', ['-e', script], (err, stdout) => {
      if (!err && stdout) {
        const entries = stdout.trim().split(';').filter(Boolean);
        for (const entry of entries) {
          const parts = entry.split(':');
          const id = parts[0];
          const name = parts[1];
          const volStr = parts[2];
          if (id && name) {
            const vol = parseInt(volStr, 10);
            const volume = Number.isFinite(vol) ? vol : (appVolumeStore[id] || 80);
            appVolumeStore[id] = volume;
            apps.push({
              id,
              name,
              icon: id,
              volume: appMuteStore[id] ? 0 : volume,
              savedVolume: volume,
              isMuted: !!appMuteStore[id],
              isMaster: false,
            });
          }
        }
      }

      if (apps.length === 1) {
        ['spotify', 'apple-music'].forEach((id) => {
          const name = id === 'spotify' ? 'Spotify' : 'Apple Music';
          const vol = appVolumeStore[id] || 75;
          apps.push({
            id,
            name,
            icon: id,
            volume: appMuteStore[id] ? 0 : vol,
            savedVolume: vol,
            isMuted: !!appMuteStore[id],
            isMaster: false,
            isInactive: true,
          });
        });
      }

      resolve(apps);
    });
  });
}

ipcMain.handle('get-app-volumes', async () => {
  return await queryRunningAudioApps();
});

ipcMain.on('set-app-volume', (_e, { id, volume }) => {
  const v = Math.max(0, Math.min(100, Math.round(volume)));
  appVolumeStore[id] = v;
  delete appMuteStore[id];

  if (id === 'system') {
    cachedSystemVolume = v;
    if (process.platform === 'darwin') {
      execFile(mediaHelperPath, ['volume', String(v)], (err) => {
        if (err) runAppleScript(`set volume output volume ${v}`);
      });
    }
  } else if (id === 'spotify') {
    runAppleScript(`if application "Spotify" is running then tell application "Spotify" to set sound volume to ${v}`);
  } else if (id === 'apple-music' || id === 'music') {
    runAppleScript(`if application "Music" is running then tell application "Music" to set sound volume to ${v}`);
  } else if (id === 'vlc') {
    runAppleScript(`if application "VLC" is running then tell application "VLC" to set volume to ${Math.round(v * 2.56)}`);
  } else if (id === 'quicktime') {
    runAppleScript(`if application "QuickTime Player" is running then tell application "QuickTime Player" to set audio volume of document 1 to ${v / 100}`);
  }
});

ipcMain.handle('toggle-app-mute', async (_e, id) => {
  if (!id) return false;
  if (id === 'system') {
    if (cachedSystemVolume > 0) {
      appMuteStore['system'] = cachedSystemVolume;
      cachedSystemVolume = 0;
      execFile(mediaHelperPath, ['volume', '0']);
    } else {
      const restore = appMuteStore['system'] || 50;
      delete appMuteStore['system'];
      cachedSystemVolume = restore;
      execFile(mediaHelperPath, ['volume', String(restore)]);
    }
    return cachedSystemVolume === 0;
  }

  if (appMuteStore[id]) {
    const restore = appMuteStore[id];
    delete appMuteStore[id];
    if (id === 'spotify') runAppleScript(`if application "Spotify" is running then tell application "Spotify" to set sound volume to ${restore}`);
    else if (id === 'apple-music') runAppleScript(`if application "Music" is running then tell application "Music" to set sound volume to ${restore}`);
    return false;
  } else {
    appMuteStore[id] = appVolumeStore[id] || 75;
    if (id === 'spotify') runAppleScript(`if application "Spotify" is running then tell application "Spotify" to set sound volume to 0`);
    else if (id === 'apple-music') runAppleScript(`if application "Music" is running then tell application "Music" to set sound volume to 0`);
    return true;
  }
});

// Clipboard
ipcMain.handle('get-clipboard-history', () => clipboardHistory);
ipcMain.on('copy-clipboard-text', (_e, text) => {
  if (text) {
    clipboard.writeText(text);
    lastClipText = text.trim();
  }
});
ipcMain.on('delete-clipboard-item', (_e, id) => {
  clipboardHistory = clipboardHistory.filter((item) => item.id !== id);
  if (win && !win.isDestroyed()) {
    win.webContents.send('clipboard-updated', clipboardHistory);
  }
});
ipcMain.on('clear-clipboard', () => {
  clipboardHistory = [];
  if (win && !win.isDestroyed()) {
    win.webContents.send('clipboard-updated', clipboardHistory);
  }
});

// ---------- Transfer Server & Floating Windows IPC ----------
ipcMain.on('open-send-window', () => {
  createSendWindow();
});

ipcMain.on('close-send-window', () => {
  if (sendWin && !sendWin.isDestroyed()) {
    sendWin.close();
  }
});

ipcMain.on('set-send-window-always-on-top', (_e, flag) => {
  if (sendWin && !sendWin.isDestroyed()) {
    sendWin.setAlwaysOnTop(!!flag);
  }
});

ipcMain.on('open-receive-window', () => {
  createReceiveWindow();
});

ipcMain.on('close-receive-window', () => {
  if (receiveWin && !receiveWin.isDestroyed()) {
    receiveWin.close();
  }
});

ipcMain.on('set-receive-window-always-on-top', (_e, flag) => {
  if (receiveWin && !receiveWin.isDestroyed()) {
    receiveWin.setAlwaysOnTop(!!flag);
  }
});

ipcMain.handle('get-paired-device', () => {
  return transferServer ? transferServer.pairedDevice : null;
});

ipcMain.handle('pair-device', (_e, data) => {
  if (!transferServer || !data) return null;
  return transferServer.pairDevice(data.deviceId, data.name);
});

ipcMain.handle('unpair-device', () => {
  if (transferServer) {
    transferServer.unpairDevice();
  }
  return true;
});

ipcMain.handle('get-discovered-devices', () => {
  return transferServer ? transferServer.getDiscoveredDevices() : [];
});

ipcMain.on('open-mini-transfer', () => {
  createMiniTransferWindow();
});

ipcMain.on('close-mini-transfer', () => {
  if (miniWin && !miniWin.isDestroyed()) {
    miniWin.close();
  }
});

ipcMain.on('dock-to-notch', () => {
  if (miniWin && !miniWin.isDestroyed()) {
    miniWin.close();
  }
  if (win && !win.isDestroyed()) {
    win.showInactive();
    win.webContents.send('focus-transfer-tab');
  }
});

ipcMain.handle('get-transfer-server-info', () => {
  return transferServer ? transferServer.getInfo() : null;
});

ipcMain.handle('choose-files-to-share', async () => {
  if (!transferServer) return [];
  const result = await dialog.showOpenDialog({
    title: 'Select Files to Share via Notcha Drop',
    properties: ['openFile', 'multiSelections'],
  });
  if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
    transferServer.shareFiles(result.filePaths);
    broadcastTransferEvent('shared-files-updated', transferServer.sharedFiles);
    broadcastTransferEvent('transfers-history-updated', transferServer.history);
    return transferServer.sharedFiles;
  }
  return transferServer.sharedFiles;
});

ipcMain.handle('share-files', async (_e, paths) => {
  if (transferServer && Array.isArray(paths)) {
    transferServer.shareFiles(paths);
    broadcastTransferEvent('shared-files-updated', transferServer.sharedFiles);
    broadcastTransferEvent('transfers-history-updated', transferServer.history);
    return transferServer.sharedFiles;
  }
  return [];
});

ipcMain.handle('clear-shared-files', async () => {
  if (transferServer) {
    transferServer.clearSharedFiles();
    broadcastTransferEvent('shared-files-updated', transferServer.sharedFiles);
  }
  return true;
});

ipcMain.handle('get-transfers-history', () => {
  return transferServer ? transferServer.history : [];
});

ipcMain.handle('clear-transfers-history', async () => {
  if (transferServer) {
    transferServer.clearHistory();
    broadcastTransferEvent('transfers-history-updated', transferServer.history);
  }
  return true;
});

ipcMain.on('open-transfers-folder', () => {
  const dir = transferServer ? transferServer.downloadDir : path.join(os.homedir(), 'Downloads', 'Notcha Transfers');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  shell.openPath(dir);
});

ipcMain.on('show-item-in-folder', (_e, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
  } else if (transferServer) {
    shell.openPath(transferServer.downloadDir);
  }
});

// ---------- Dock Preview IPC ----------
ipcMain.on('dock-preview-mouse-enter', () => {
  isMouseOverDockPreview = true;
  clearTimeout(dockPreviewHideTimer);
});

ipcMain.on('dock-preview-mouse-leave', () => {
  isMouseOverDockPreview = false;
  hideDockPreview();
});

ipcMain.on('activate-dock-window', (_e, payload) => {
  try {
    if (dockPreviewWin && !dockPreviewWin.isDestroyed()) {
      dockPreviewWin.hide();
    }
    isMouseOverDockPreview = false;
    if (dockHelperProcess && dockHelperProcess.stdin && dockHelperProcess.stdin.writable && payload) {
      dockHelperProcess.stdin.write(JSON.stringify({
        action: 'raise',
        pid: payload.pid,
        index: payload.index,
        title: payload.title || '',
      }) + '\n');
    }
  } catch (err) {
    console.warn('activate-dock-window error:', err);
  }
});

ipcMain.on('close-dock-window', (_e, payload) => {
  try {
    if (dockHelperProcess && dockHelperProcess.stdin && dockHelperProcess.stdin.writable && payload) {
      dockHelperProcess.stdin.write(JSON.stringify({
        action: 'close',
        pid: payload.pid,
        index: payload.index,
        title: payload.title || '',
      }) + '\n');
    }
  } catch (err) {
    console.warn('close-dock-window error:', err);
  }
});

// ---------- Lifecycle ----------
app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
  createWindow();
  startClipboardWatcher();
  initTransferServer();
  startDockHelper();

  globalShortcut.register('CommandOrControl+Alt+N', () => {
    if (win && !win.isDestroyed()) win.webContents.send('toggle-hide');
  });

  screen.on('display-metrics-changed', () => place());
  screen.on('display-added', () => place());
  screen.on('display-removed', () => place());
});

app.on('will-quit', () => {
  if (transferServer) transferServer.stop();
  if (dockHelperProcess) {
    try {
      dockHelperProcess.stdin.write(JSON.stringify({ action: 'quit' }) + '\n');
      dockHelperProcess.kill();
    } catch (_) {}
  }
  globalShortcut.unregisterAll();
});
app.on('window-all-closed', () => app.quit());

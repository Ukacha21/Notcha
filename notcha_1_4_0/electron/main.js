const { app, BrowserWindow, ipcMain, screen, globalShortcut, shell, clipboard } = require('electron');
const path = require('path');
const { exec, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');

// Canvas dimensions: large enough to fit expanded island tabs without clipping.
const W = 640;
const H = 300;
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
    icon: path.join(__dirname, 'logo2.png'),
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
  win.loadFile(path.join(__dirname, 'index.html'));

  win.once('ready-to-show', () => {
    place();
    win.showInactive();
    if (process.platform === 'darwin') app.dock.hide();
  });
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
          volume: 80,
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
      volume: 80,
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
    if (isMac) runAppleScript(`set volume output volume ${v}`);
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
    const { err, stdout } = await runAppleScript('output volume of (get volume settings)');
    if (err) return 50;
    return parseInt(stdout.trim(), 10) || 50;
  }
  return 50;
});

ipcMain.on('set-system-volume', (_e, vol) => {
  const v = Math.max(0, Math.min(100, Math.round(vol)));
  if (process.platform === 'darwin') {
    runAppleScript(`set volume output volume ${v}`);
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

// ---------- Lifecycle ----------
app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  createWindow();
  startClipboardWatcher();

  globalShortcut.register('CommandOrControl+Alt+N', () => {
    if (win && !win.isDestroyed()) win.webContents.send('toggle-hide');
  });

  screen.on('display-metrics-changed', () => place());
  screen.on('display-added', () => place());
  screen.on('display-removed', () => place());
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());

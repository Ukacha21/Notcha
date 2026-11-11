const { app, BrowserWindow, ipcMain, screen, globalShortcut, shell, clipboard } = require('electron');
const path = require('path');
const { exec } = require('child_process');

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
const mediaHelperPath = path.join(__dirname, 'media-helper');

function sendSystemMediaKey(action) {
  if (process.platform === 'darwin') {
    let act = 'playpause';
    if (action === 'next') act = 'next';
    else if (action === 'prev') act = 'prev';
    exec(`"${mediaHelperPath}" ${act}`, (err) => {
      if (err) {
        // Fallback via AppleScript
        exec(`osascript -e 'tell application "System Events" to key code 16'`);
      }
    });
  } else {
    // Windows PowerShell media key simulation
    const vkMap = { playpause: 179, next: 176, prev: 177 };
    const vk = vkMap[action] || 179;
    exec(`powershell -command "[System.Windows.Forms.SendKeys]::SendWait([char]${vk})"`);
  }
}

// Queries Apple Music
function queryAppleMusic() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve(null);
    const script = `
      if application "Music" is running then
        tell application "Music"
          try
            set pState to player state as string
            set trkName to name of current track
            set trkArtist to artist of current track
            set trkPos to player position
            set trkDur to duration of current track
            set vol to sound volume
            return "OK|" & pState & "|" & trkName & "|" & trkArtist & "|" & trkPos & "|" & trkDur & "|" & vol
          on error
            return "IDLE|" & (player state as string) & "|||||" & sound volume
          end try
        end tell
      else
        return "NOT_RUNNING"
      end if
    `;
    exec(`osascript -e '${script.replace(/\n/g, ' ')}'`, (err, stdout) => {
      if (err || !stdout || stdout.includes('NOT_RUNNING')) return resolve(null);
      const parts = stdout.trim().split('|');
      const isOk = parts[0] === 'OK';
      resolve({
        id: 'apple-music',
        name: 'Apple Music',
        icon: 'apple',
        state: isOk ? (parts[1] === 'playing' ? 'playing' : 'paused') : (parts[1] || 'idle'),
        title: isOk && parts[2] ? parts[2] : 'Music Library',
        artist: isOk && parts[3] ? parts[3] : 'Apple Music',
        position: isOk ? (parseFloat(parts[4]) || 0) : 0,
        duration: isOk ? (parseFloat(parts[5]) || 300) : 300,
        volume: parseInt(parts[6], 10) || 75,
      });
    });
  });
}

// Queries Spotify
function querySpotify() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve(null);
    const script = `
      if application "Spotify" is running then
        tell application "Spotify"
          try
            set pState to player state as string
            set trkName to name of current track
            set trkArtist to artist of current track
            set trkPos to (player position as integer)
            set trkDur to ((duration of current track) / 1000 as integer)
            set vol to sound volume
            return "OK|" & pState & "|" & trkName & "|" & trkArtist & "|" & trkPos & "|" & trkDur & "|" & vol
          on error
            return "IDLE|" & (player state as string) & "|||||" & sound volume
          end try
        end tell
      else
        return "NOT_RUNNING"
      end if
    `;
    exec(`osascript -e '${script.replace(/\n/g, ' ')}'`, (err, stdout) => {
      if (err || !stdout || stdout.includes('NOT_RUNNING')) return resolve(null);
      const parts = stdout.trim().split('|');
      const isOk = parts[0] === 'OK';
      resolve({
        id: 'spotify',
        name: 'Spotify',
        icon: 'spotify',
        state: isOk ? (parts[1] === 'playing' ? 'playing' : 'paused') : (parts[1] || 'idle'),
        title: isOk && parts[2] ? parts[2] : 'Spotify Player',
        artist: isOk && parts[3] ? parts[3] : 'Spotify',
        position: isOk ? (parseFloat(parts[4]) || 0) : 0,
        duration: isOk ? (parseFloat(parts[5]) || 300) : 300,
        volume: parseInt(parts[6], 10) || 75,
      });
    });
  });
}

// Queries VLC Media Player
function queryVLC() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve(null);
    const script = `
      if application "VLC" is running then
        tell application "VLC"
          try
            set isPlay to playing
            set trkName to name of current item
            set trkTime to current time
            set trkDur to duration of current item
            return "OK|" & (isPlay as string) & "|" & trkName & "|" & trkTime & "|" & trkDur
          on error
            return "IDLE||||"
          end try
        end tell
      else
        return "NOT_RUNNING"
      end if
    `;
    exec(`osascript -e '${script.replace(/\n/g, ' ')}'`, (err, stdout) => {
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
        artist: 'Local Media / Stream',
        position: isOk ? (parseFloat(parts[3]) || 0) : 0,
        duration: isOk ? (parseFloat(parts[4]) || 300) : 300,
        volume: 80,
      });
    });
  });
}

// Queries Web Browsers for active YouTube tabs
function queryYouTube() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve(null);
    const script = `
      set foundTitle to ""
      set foundURL to ""
      
      -- Check Brave Browser
      if application "Brave Browser" is running then
        tell application "Brave Browser"
          repeat with w in windows
            repeat with t in tabs of w
              if title of t contains "YouTube" then
                set foundTitle to title of t
                set foundURL to URL of t
                exit repeat
              end if
            end repeat
            if foundTitle is not "" then exit repeat
          end repeat
        end tell
      end if
      
      -- Check Google Chrome if not found
      if foundTitle is "" and application "Google Chrome" is running then
        tell application "Google Chrome"
          repeat with w in windows
            repeat with t in tabs of w
              if title of t contains "YouTube" then
                set foundTitle to title of t
                set foundURL to URL of t
                exit repeat
              end if
            end repeat
            if foundTitle is not "" then exit repeat
          end repeat
        end tell
      end if

      -- Check Safari if not found
      if foundTitle is "" and application "Safari" is running then
        tell application "Safari"
          repeat with w in windows
            repeat with t in tabs of w
              if name of t contains "YouTube" then
                set foundTitle to name of t
                set foundURL to URL of t
                exit repeat
              end if
            end repeat
            if foundTitle is not "" then exit repeat
          end repeat
        end tell
      end if
      
      if foundTitle is not "" then
        return "OK|" & foundTitle & "|" & foundURL
      else
        return "NOT_FOUND"
      end if
    `;
    exec(`osascript -e '${script.replace(/\n/g, ' ')}'`, (err, stdout) => {
      if (err || !stdout || stdout.includes('NOT_FOUND')) return resolve(null);
      const parts = stdout.trim().split('|');
      if (parts[0] === 'OK') {
        let cleanTitle = parts[1].replace(/ - YouTube/i, '').trim();
        // Remove notifications count like (84)
        cleanTitle = cleanTitle.replace(/^\(\d+\)\s*/, '');
        resolve({
          id: 'youtube',
          name: 'YouTube & Web',
          icon: 'youtube',
          state: 'playing',
          title: cleanTitle || 'YouTube Video',
          artist: 'Web Browser Audio',
          position: 0,
          duration: 240,
          volume: 85,
        });
      } else {
        resolve(null);
      }
    });
  });
}

// Queries Telegram Desktop
function queryTelegram() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve(null);
    exec("ps -ax -o comm | grep -i 'Telegram' | grep -v 'grep'", (err, stdout) => {
      if (err || !stdout.trim()) return resolve(null);
      resolve({
        id: 'telegram',
        name: 'Telegram Audio',
        icon: 'telegram',
        state: 'idle',
        title: 'Telegram Messenger',
        artist: 'Voice & Media Playback',
        position: 0,
        duration: 180,
        volume: 80,
      });
    });
  });
}

async function getAllMediaSources() {
  const [appleMusic, spotify, vlc, youtube, telegram] = await Promise.all([
    queryAppleMusic(),
    querySpotify(),
    queryVLC(),
    queryYouTube(),
    queryTelegram(),
  ]);

  const sources = [];
  if (youtube) sources.push(youtube);
  if (appleMusic) sources.push(appleMusic);
  if (spotify) sources.push(spotify);
  if (vlc) sources.push(vlc);
  if (telegram) sources.push(telegram);

  // Always include Universal System Audio and Notcha Lo-Fi Radio
  sources.push({
    id: 'system',
    name: 'Universal Media',
    icon: 'system',
    state: 'idle',
    title: 'System Audio Controller',
    artist: 'All Apps / Media Keys',
    position: 0,
    duration: 300,
    volume: 75,
  });

  sources.push({
    id: 'lofi',
    name: 'Notcha Lo-Fi',
    icon: 'lofi',
    state: 'idle',
    title: 'Lofi Study Beats',
    artist: 'Chillhop / Focus Soundscape',
    position: 0,
    duration: 300,
    volume: 70,
  });

  return sources;
}

// Start Media Poller (every 2.5s)
setInterval(async () => {
  if (win && !win.isDestroyed()) {
    const sources = await getAllMediaSources();
    win.webContents.send('media-sources-updated', sources);
  }
}, 2500);

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
      exec('open -a /System/Library/CoreServices/ScreenSaverEngine.app || pmset displaysleepnow');
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

// DND Toggle
ipcMain.handle('toggle-dnd', async () => {
  isDND = !isDND;
  return isDND;
});

// Media Control Action
ipcMain.on('media-action', (_e, { source, action, value }) => {
  const isMac = process.platform === 'darwin';

  if (source === 'apple-music' && isMac) {
    if (action === 'playpause') exec('osascript -e \'tell application "Music" to playpause\'');
    else if (action === 'next') exec('osascript -e \'tell application "Music" to next track\'');
    else if (action === 'prev') exec('osascript -e \'tell application "Music" to previous track\'');
    else if (action === 'seek' && typeof value === 'number') exec(`osascript -e 'tell application "Music" to set player position to ${Math.round(value)}'`);
    else if (action === 'volume' && typeof value === 'number') exec(`osascript -e 'tell application "Music" to set sound volume to ${Math.round(value)}'`);
    return;
  }

  if (source === 'spotify' && isMac) {
    if (action === 'playpause') exec('osascript -e \'tell application "Spotify" to playpause\'');
    else if (action === 'next') exec('osascript -e \'tell application "Spotify" to next track\'');
    else if (action === 'prev') exec('osascript -e \'tell application "Spotify" to previous track\'');
    else if (action === 'seek' && typeof value === 'number') exec(`osascript -e 'tell application "Spotify" to set player position to ${Math.round(value)}'`);
    else if (action === 'volume' && typeof value === 'number') exec(`osascript -e 'tell application "Spotify" to set sound volume to ${Math.round(value)}'`);
    return;
  }

  if (source === 'vlc' && isMac) {
    if (action === 'playpause') exec('osascript -e \'tell application "VLC" to play\'');
    else if (action === 'next') exec('osascript -e \'tell application "VLC" to next\'');
    else if (action === 'prev') exec('osascript -e \'tell application "VLC" to previous\'');
    else if (action === 'seek' && typeof value === 'number') exec(`osascript -e 'tell application "VLC" to set current time to ${Math.round(value)}'`);
    return;
  }

  // Universal Media Key / YouTube / Telegram
  if (action === 'playpause' || action === 'play' || action === 'pause') {
    sendSystemMediaKey('playpause');
  } else if (action === 'next') {
    sendSystemMediaKey('next');
  } else if (action === 'prev') {
    sendSystemMediaKey('prev');
  } else if (action === 'volume' && typeof value === 'number') {
    const v = Math.max(0, Math.min(100, Math.round(value)));
    if (isMac) exec(`osascript -e 'set volume output volume ${v}'`);
  }
});

ipcMain.handle('get-media-sources', async () => {
  return await getAllMediaSources();
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
  return new Promise((resolve) => {
    if (process.platform === 'darwin') {
      exec("osascript -e 'output volume of (get volume settings)'", (err, stdout) => {
        if (err) resolve(50);
        else resolve(parseInt(stdout.trim(), 10) || 50);
      });
    } else {
      resolve(50);
    }
  });
});

ipcMain.on('set-system-volume', (_e, vol) => {
  const v = Math.max(0, Math.min(100, Math.round(vol)));
  if (process.platform === 'darwin') {
    exec(`osascript -e 'set volume output volume ${v}'`);
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

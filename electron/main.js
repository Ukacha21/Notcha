const { app, BrowserWindow, ipcMain, screen, globalShortcut, shell, clipboard } = require('electron');
const path = require('path');
const { exec } = require('child_process');

// Canvas dimensions: large enough to fit expanded island tabs without clipping.
// The area outside the rendered island is click-through.
const W = 620;
const H = 290;
let win;

// In-memory clipboard history
let clipboardHistory = [];
let lastClipText = '';

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

// App launcher
ipcMain.on('launch-app', (_e, target) => {
  if (!target) return;
  const isMac = process.platform === 'darwin';

  if (target.startsWith('http://') || target.startsWith('https://')) {
    shell.openExternal(target);
    return;
  }

  const map = {
    browser: isMac ? 'open -a "Google Chrome" || open -a Safari' : 'start msedge || start chrome',
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

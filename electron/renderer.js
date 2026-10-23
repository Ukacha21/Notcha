// ==========================================
// Notcha 1.3.1 - Renderer Process
// ==========================================

const $ = (id) => document.getElementById(id);

// DOM Elements
const island = $('island');
const cClock = $('cClock'), cTimer = $('cTimer'), ringBar = $('ringBar'), cTimerWrap = $('cTimerWrap'), cWave = $('cWave');
const eTime = $('eTime'), eSec = $('eSec'), eDate = $('eDate');
const hideBtn = $('hideBtn'), pinBtn = $('pinBtn'), quitBtn = $('quitBtn');

// Focus controls
const timerBtn = $('timerBtn'), timerBtnText = $('timerBtnText'), timerResetBtn = $('timerResetBtn');
const timeDecBtn = $('timeDecBtn'), timeIncBtn = $('timeIncBtn'), focusDurationLabel = $('focusDurationLabel');
const presetChips = document.querySelectorAll('.preset-chip');

// Music controls
const trackSelect = $('trackSelect'), trackTitle = $('trackTitle'), trackGenre = $('trackGenre');
const playPauseBtn = $('playPauseBtn'), prevTrackBtn = $('prevTrackBtn'), nextTrackBtn = $('nextTrackBtn');
const playIcon = $('playIcon'), pauseIcon = $('pauseIcon'), vinylDisc = $('vinylDisc');
const seekSlider = $('seekSlider'), seekFill = $('seekFill'), seekTimeCurrent = $('seekTimeCurrent'), seekTimeTotal = $('seekTimeTotal');
const volSlider = $('volSlider'), volFill = $('volFill'), volPercent = $('volPercent'), muteBtn = $('muteBtn'), volModeBtn = $('volModeBtn');
const volHighIcon = $('volHighIcon'), volMuteIcon = $('volMuteIcon'), playerWave = $('playerWave');

// Power buttons
const powerCards = document.querySelectorAll('.power-card');

// App Launcher
const appItems = document.querySelectorAll('.app-item');
const customAppInput = $('customAppInput'), customAppLaunchBtn = $('customAppLaunchBtn');

// Clipboard
const clipSearchInput = $('clipSearchInput'), clearClipsBtn = $('clearClipsBtn'), clipsList = $('clipsList');

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.panel');

// Constants
const RING_C = 2 * Math.PI * 6;
ringBar.style.strokeDasharray = RING_C;

// Utility functions for storage
function load(k, d) {
  try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; }
}
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

// State variables
let hovering = false;
let pinned = load('pinned', false);
let autohide = load('autohide', false);
let activeTab = load('activeTab', 'focus');
let flash = false;
let leaveT = null;
let ignoring = true;

// Focus Timer State
let focusMinutes = load('focusMinutes', 25);
let timer = null; // { end, total, paused, remaining }

// Power Button Arming state
let armingAction = null;
let armingTimer = null;

// ==========================================
// 1. TABS NAVIGATION
// ==========================================
function switchTab(tabName) {
  activeTab = tabName;
  save('activeTab', tabName);
  island.dataset.tab = tabName;

  tabBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  panels.forEach((p) => {
    p.classList.toggle('active', p.id === `panel${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
  });
}

tabBtns.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    switchTab(btn.dataset.tab);
  });
});
switchTab(activeTab);

// ==========================================
// 2. ISLAND STATE & MOUSE TRACKING
// ==========================================
function stateName() {
  if (hovering || pinned || flash) return 'expanded';
  return autohide ? 'hidden' : 'compact';
}

function render() {
  island.dataset.state = stateName();
  island.classList.toggle('timer', !!timer);
  island.classList.toggle('done', flash);
  pinBtn.classList.toggle('on', pinned);
  hideBtn.classList.toggle('on', autohide);
  tick(true);
}

function setInside(inside) {
  if (inside) {
    clearTimeout(leaveT);
    leaveT = null;
    if (ignoring) { ignoring = false; window.api.setIgnore(false); }
    if (!hovering) { hovering = true; render(); }
  } else {
    if (!ignoring && !pinned) { ignoring = true; window.api.setIgnore(true); }
    if (hovering && !leaveT && !pinned) {
      leaveT = setTimeout(() => { hovering = false; leaveT = null; render(); }, 250);
    }
  }
}

document.addEventListener('mousemove', (e) => {
  const r = island.getBoundingClientRect();
  const pad = island.dataset.state === 'hidden' ? 12 : 6;
  const inside =
    e.clientX >= r.left - pad && e.clientX <= r.right + pad &&
    e.clientY >= 0 && e.clientY <= r.bottom + pad;
  setInside(inside);
});
document.documentElement.addEventListener('mouseleave', () => setInside(false));

// Header Buttons
hideBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  autohide = !autohide;
  save('autohide', autohide);
  render();
});
pinBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  pinned = !pinned;
  save('pinned', pinned);
  if (pinned && ignoring) { ignoring = false; window.api.setIgnore(false); }
  render();
});
quitBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  window.api.quit();
});
window.api.onToggleHide(() => {
  autohide = !autohide;
  save('autohide', autohide);
  render();
});

// ==========================================
// 3. ADJUSTABLE FOCUS TIMER
// ==========================================
function updateFocusDurationDisplay() {
  focusDurationLabel.textContent = `${focusMinutes}m`;
  if (!timer) {
    timerBtnText.textContent = `Start Focus (${focusMinutes}m)`;
    cTimer.textContent = `${String(focusMinutes).padStart(2, '0')}:00`;
  }
  presetChips.forEach((chip) => {
    chip.classList.toggle('active', parseInt(chip.dataset.min, 10) === focusMinutes);
  });
}

timeDecBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (timer) return;
  focusMinutes = Math.max(1, focusMinutes - 5);
  save('focusMinutes', focusMinutes);
  updateFocusDurationDisplay();
});

timeIncBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (timer) return;
  focusMinutes = Math.min(120, focusMinutes + 5);
  save('focusMinutes', focusMinutes);
  updateFocusDurationDisplay();
});

presetChips.forEach((chip) => {
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (timer) return;
    focusMinutes = parseInt(chip.dataset.min, 10);
    save('focusMinutes', focusMinutes);
    updateFocusDurationDisplay();
  });
});

timerBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!timer) {
    // Start fresh timer
    const total = focusMinutes * 60 * 1000;
    timer = { end: Date.now() + total, total, paused: false, remaining: total };
    timerBtnText.textContent = 'Pause';
    timerResetBtn.style.display = 'grid';
  } else if (!timer.paused) {
    // Pause timer
    timer.paused = true;
    timer.remaining = Math.max(0, timer.end - Date.now());
    timerBtnText.textContent = 'Resume';
  } else {
    // Resume timer
    timer.paused = false;
    timer.end = Date.now() + timer.remaining;
    timerBtnText.textContent = 'Pause';
  }
  render();
});

timerResetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  timer = null;
  timerResetBtn.style.display = 'none';
  ringBar.style.strokeDashoffset = 0;
  updateFocusDurationDisplay();
  render();
});

function mmss(ms) {
  const s = Math.ceil(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function playFinishChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0, now + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.12 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 1.25);
    });
  } catch (_) {
    window.api.beep();
  }
}

function finish() {
  timer = null;
  timerResetBtn.style.display = 'none';
  flash = true;
  playFinishChime();
  updateFocusDurationDisplay();
  render();
  setTimeout(() => { flash = false; render(); }, 4500);
}

function tick(force) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (cClock.textContent !== timeStr) cClock.textContent = timeStr;
  if (eTime.textContent !== timeStr) eTime.textContent = timeStr;
  eSec.textContent = String(now.getSeconds()).padStart(2, '0');
  eDate.textContent = flash
    ? '✨ Focus session complete!'
    : now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

  if (timer) {
    if (!timer.paused) {
      const left = Math.max(0, timer.end - Date.now());
      const leftStr = mmss(left);
      cTimer.textContent = leftStr;
      timerBtnText.textContent = `Pause (${leftStr})`;
      ringBar.style.strokeDashoffset = RING_C * (1 - left / timer.total);
      if (left === 0 && !force) finish();
    } else {
      const leftStr = mmss(timer.remaining);
      cTimer.textContent = leftStr;
      timerBtnText.textContent = `Resume (${leftStr})`;
    }
  }
}
setInterval(() => tick(false), 250);
updateFocusDurationDisplay();

// ==========================================
// 4. MUSIC & AMBIENT SOUNDSCAPES PLAYER
// ==========================================
const SOUNDSCAPES = [
  {
    title: 'Lofi Study Beats',
    genre: 'Chillhop / Downtempo',
    url: 'https://ice1.somafm.com/groovesalad-128-mp3',
    isStream: true,
    simDuration: 300,
  },
  {
    title: 'Rainy Cafe & Thunder',
    genre: 'Ambient Nature / Rain',
    type: 'procedural-rain',
    simDuration: 600,
  },
  {
    title: 'Pine Forest & Birds',
    genre: 'Forest Soundscape / Nature',
    url: 'https://ice6.somafm.com/lush-128-mp3',
    isStream: true,
    simDuration: 360,
  },
  {
    title: 'Deep Alpha Waves',
    genre: 'Binaural Focus / Meditation',
    url: 'https://ice2.somafm.com/dronezone-128-mp3',
    isStream: true,
    simDuration: 420,
  },
  {
    title: 'Synthwave Chill Drive',
    genre: 'Retro Wave / Cyber Electro',
    url: 'https://ice4.somafm.com/defcon-128-mp3',
    isStream: true,
    simDuration: 280,
  },
];

let currentTrackIdx = load('musicTrackIdx', 0);
let isPlaying = false;
let currentVolume = load('musicVolume', 70);
let isMuted = false;
let volumeMode = 'app'; // 'app' | 'system'
let audioEl = new Audio();
let webAudioCtx = null;
let noiseNode = null;
let noiseGain = null;
let simProgress = 0;
let progressInterval = null;

audioEl.crossOrigin = 'anonymous';
audioEl.volume = currentVolume / 100;

function formatSecs(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Procedural ambient noise synthesizer for offline nature sounds
function startProceduralRain() {
  stopProceduralNoise();
  try {
    webAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = 2 * webAudioCtx.sampleRate;
    const noiseBuffer = webAudioCtx.createBuffer(1, bufferSize, webAudioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }

    const whiteNoise = webAudioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // Filter for soothing rain texture
    const filter = webAudioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, webAudioCtx.currentTime);

    noiseGain = webAudioCtx.createGain();
    noiseGain.gain.setValueAtTime(isMuted ? 0 : (currentVolume / 100) * 0.6, webAudioCtx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(webAudioCtx.destination);

    whiteNoise.start();
    noiseNode = whiteNoise;
  } catch (_) {}
}

function stopProceduralNoise() {
  if (noiseNode) {
    try { noiseNode.stop(); noiseNode.disconnect(); } catch (_) {}
    noiseNode = null;
  }
  if (webAudioCtx) {
    try { webAudioCtx.close(); } catch (_) {}
    webAudioCtx = null;
  }
}

function loadTrack(idx) {
  currentTrackIdx = (idx + SOUNDSCAPES.length) % SOUNDSCAPES.length;
  save('musicTrackIdx', currentTrackIdx);
  const track = SOUNDSCAPES[currentTrackIdx];

  trackSelect.value = currentTrackIdx;
  trackTitle.textContent = track.title;
  trackGenre.textContent = track.genre;
  seekTimeTotal.textContent = formatSecs(track.simDuration);
  seekSlider.value = 0;
  seekFill.style.width = '0%';
  seekTimeCurrent.textContent = '0:00';
  simProgress = 0;

  if (isPlaying) {
    playTrack();
  }
}

function playTrack() {
  const track = SOUNDSCAPES[currentTrackIdx];
  isPlaying = true;
  playIcon.style.display = 'none';
  pauseIcon.style.display = 'block';
  vinylDisc.classList.add('spinning');
  playerWave.classList.add('playing');
  cWave.classList.add('active');

  if (track.type === 'procedural-rain') {
    audioEl.pause();
    startProceduralRain();
  } else {
    stopProceduralNoise();
    if (audioEl.src !== track.url) {
      audioEl.src = track.url;
    }
    audioEl.play().catch(() => {});
  }

  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (!isPlaying) return;
    simProgress += 1;
    const dur = track.simDuration;
    if (simProgress > dur) simProgress = 0;
    const pct = (simProgress / dur) * 100;
    seekSlider.value = pct;
    seekFill.style.width = `${pct}%`;
    seekTimeCurrent.textContent = formatSecs(simProgress);
  }, 1000);
}

function pauseTrack() {
  isPlaying = false;
  playIcon.style.display = 'block';
  pauseIcon.style.display = 'none';
  vinylDisc.classList.remove('spinning');
  playerWave.classList.remove('playing');
  cWave.classList.remove('active');

  audioEl.pause();
  stopProceduralNoise();
  clearInterval(progressInterval);
}

function togglePlayPause() {
  if (isPlaying) pauseTrack();
  else playTrack();
}

playPauseBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePlayPause(); });
prevTrackBtn.addEventListener('click', (e) => { e.stopPropagation(); loadTrack(currentTrackIdx - 1); });
nextTrackBtn.addEventListener('click', (e) => { e.stopPropagation(); loadTrack(currentTrackIdx + 1); });
trackSelect.addEventListener('change', (e) => { loadTrack(parseInt(e.target.value, 10)); });

// Seek Slider
seekSlider.addEventListener('input', (e) => {
  const pct = parseFloat(e.target.value);
  seekFill.style.width = `${pct}%`;
  const track = SOUNDSCAPES[currentTrackIdx];
  simProgress = (pct / 100) * track.simDuration;
  seekTimeCurrent.textContent = formatSecs(simProgress);
  if (audioEl.duration && !isNaN(audioEl.duration)) {
    try { audioEl.currentTime = (pct / 100) * audioEl.duration; } catch (_) {}
  }
});

// Volume Controls
function applyVolume(vol) {
  currentVolume = Math.max(0, Math.min(100, Math.round(vol)));
  save('musicVolume', currentVolume);
  volSlider.value = currentVolume;
  volFill.style.width = `${currentVolume}%`;
  volPercent.textContent = `${currentVolume}%`;

  if (isMuted) {
    isMuted = false;
    volHighIcon.style.display = 'block';
    volMuteIcon.style.display = 'none';
  }

  audioEl.volume = currentVolume / 100;
  if (noiseGain && webAudioCtx) {
    noiseGain.gain.setValueAtTime((currentVolume / 100) * 0.6, webAudioCtx.currentTime);
  }

  if (volumeMode === 'system') {
    window.api.setSystemVolume(currentVolume);
  }
}

volSlider.addEventListener('input', (e) => {
  applyVolume(e.target.value);
});

muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  isMuted = !isMuted;
  if (isMuted) {
    volHighIcon.style.display = 'none';
    volMuteIcon.style.display = 'block';
    audioEl.volume = 0;
    if (noiseGain && webAudioCtx) noiseGain.gain.setValueAtTime(0, webAudioCtx.currentTime);
  } else {
    volHighIcon.style.display = 'block';
    volMuteIcon.style.display = 'none';
    audioEl.volume = currentVolume / 100;
    if (noiseGain && webAudioCtx) noiseGain.gain.setValueAtTime((currentVolume / 100) * 0.6, webAudioCtx.currentTime);
  }
});

volModeBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (volumeMode === 'app') {
    volumeMode = 'system';
    volModeBtn.textContent = 'System Vol';
    volModeBtn.classList.add('system');
    try {
      const sysVol = await window.api.getSystemVolume();
      applyVolume(sysVol);
    } catch (_) {}
  } else {
    volumeMode = 'app';
    volModeBtn.textContent = 'App Vol';
    volModeBtn.classList.remove('system');
    applyVolume(load('musicVolume', 70));
  }
});

loadTrack(currentTrackIdx);
applyVolume(currentVolume);

// ==========================================
// 5. SYSTEM POWER CONTROLS (WITH SAFETY ARMING)
// ==========================================
powerCards.forEach((card) => {
  card.addEventListener('click', (e) => {
    e.stopPropagation();
    const action = card.dataset.action;

    // Locking is immediate and safe
    if (action === 'lock') {
      window.api.powerAction('lock');
      return;
    }

    // Dangerous actions (sleep, restart, shutdown) have a 3-second arming confirmation
    if (armingAction === action) {
      // Second click confirmed!
      clearTimeout(armingTimer);
      armingAction = null;
      resetPowerCards();
      window.api.powerAction(action);
    } else {
      // First click: arm and start 3-second countdown
      clearTimeout(armingTimer);
      resetPowerCards();
      armingAction = action;
      card.classList.add('armed');
      const originalTitle = card.querySelector('.card-title').textContent;
      card.querySelector('.card-title').textContent = 'Click to Confirm!';
      card.querySelector('.card-sub').textContent = 'Safety 3s countdown';

      armingTimer = setTimeout(() => {
        armingAction = null;
        resetPowerCards();
      }, 3500);
    }
  });
});

function resetPowerCards() {
  powerCards.forEach((c) => {
    c.classList.remove('armed');
    const action = c.dataset.action;
    if (action === 'lock') {
      c.querySelector('.card-title').textContent = 'Lock Screen';
      c.querySelector('.card-sub').textContent = 'Secure workstation';
    } else if (action === 'sleep') {
      c.querySelector('.card-title').textContent = 'Sleep PC';
      c.querySelector('.card-sub').textContent = 'Low-power state';
    } else if (action === 'restart') {
      c.querySelector('.card-title').textContent = 'Restart PC';
      c.querySelector('.card-sub').textContent = 'Reboot computer';
    } else if (action === 'shutdown') {
      c.querySelector('.card-title').textContent = 'Shut Down';
      c.querySelector('.card-sub').textContent = 'Power off safely';
    }
  });
}

// ==========================================
// 6. APP SHORTCUTS LAUNCHER
// ==========================================
appItems.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const appKey = btn.dataset.app;
    window.api.launchApp(appKey);
  });
});

function launchCustomApp() {
  const val = customAppInput.value.trim();
  if (!val) return;
  window.api.launchApp(val);
  customAppInput.value = '';
}

customAppLaunchBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  launchCustomApp();
});
customAppInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.stopPropagation();
    launchCustomApp();
  }
});

// ==========================================
// 7. CLIPBOARD HISTORY
// ==========================================
let clipboardData = [];

function renderClips(filterText = '') {
  const filter = filterText.toLowerCase();
  const items = clipboardData.filter((i) => i.text.toLowerCase().includes(filter));

  if (items.length === 0) {
    clipsList.innerHTML = `<div class="empty-clips">${
      filterText ? 'No matching snippets found' : 'No copied items yet. Copy text anywhere and it appears here!'
    }</div>`;
    return;
  }

  clipsList.innerHTML = items
    .map((item) => {
      const escaped = item.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const ageStr = formatClipAge(item.time);
      return `
      <div class="clip-card" data-id="${item.id}">
        <div class="clip-body">
          <div class="clip-text">${escaped}</div>
          <div class="clip-meta">
            <span>${item.text.length} chars</span>
            <span>•</span>
            <span>${ageStr}</span>
          </div>
        </div>
        <div class="clip-actions">
          <button class="clip-copy-btn" title="Copy to clipboard">
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span class="copy-tag">Copy</span>
          </button>
          <button class="clip-del-btn" title="Remove item">×</button>
        </div>
      </div>`;
    })
    .join('');

  // Attach event handlers
  clipsList.querySelectorAll('.clip-card').forEach((card) => {
    const id = card.dataset.id;
    const item = clipboardData.find((i) => i.id === id);
    if (!item) return;

    card.querySelector('.clip-copy-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      window.api.copyClipboardText(item.text);
      const tag = card.querySelector('.copy-tag');
      tag.textContent = '✓ Copied!';
      tag.classList.add('copied');
      setTimeout(() => {
        tag.textContent = 'Copy';
        tag.classList.remove('copied');
      }, 1500);
    });

    card.querySelector('.clip-del-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      window.api.deleteClipboardItem(id);
    });
  });
}

function formatClipAge(timestamp) {
  const sec = Math.floor((Date.now() - timestamp) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

clipSearchInput.addEventListener('input', (e) => {
  renderClips(e.target.value);
});

clearClipsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  window.api.clearClipboard();
});

// Load initial clipboard
window.api.getClipboardHistory().then((list) => {
  clipboardData = list || [];
  renderClips();
});

window.api.onClipboardUpdated((list) => {
  clipboardData = list || [];
  renderClips(clipSearchInput.value);
});

// Initial render
render();

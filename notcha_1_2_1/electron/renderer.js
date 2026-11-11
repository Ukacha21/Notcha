// ==========================================
// Notcha 1.3.1 - Enhanced Renderer Process
// ==========================================

const $ = (id) => document.getElementById(id);

// DOM Elements - Shell & Island
const island = $('island');
const cClock = $('cClock'), cCompanion = $('cCompanion'), ringBar = $('ringBar'), cTimerWrap = $('cTimerWrap');
const cTimer = $('cTimer'), cWave = $('cWave'), cDndBadge = $('cDndBadge'), cAlarmBadge = $('cAlarmBadge'), cAlarmTime = $('cAlarmTime');
const eTime = $('eTime'), eSec = $('eSec'), eDate = $('eDate');
const hideBtn = $('hideBtn'), pinBtn = $('pinBtn'), quitBtn = $('quitBtn');

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.panel');

// Focus Tab & Subviews
const dndBtn = $('dndBtn'), dndText = $('dndText');
const focusSubtabBtns = document.querySelectorAll('.subtab-btn');
const subviews = document.querySelectorAll('.subview');

// 1. Focus Session Controls
const focusTaskInput = $('focusTaskInput');
const timerBtn = $('timerBtn'), timerBtnText = $('timerBtnText'), timerResetBtn = $('timerResetBtn');
const timeDecBtn = $('timeDecBtn'), timeIncBtn = $('timeIncBtn'), focusDurationLabel = $('focusDurationLabel');
const presetChips = document.querySelectorAll('.preset-chip');

// 2. Quick Timer Controls
const quickTimerLabel = $('quickTimerLabel');
const qtHours = $('qtHours'), qtMins = $('qtMins'), qtSecs = $('qtSecs');
const qtChips = document.querySelectorAll('.qt-chip');
const qtStartBtn = $('qtStartBtn'), qtResetBtn = $('qtResetBtn');

// 3. Alarm Controls
const alarmLabelInput = $('alarmLabelInput'), alarmTimeInput = $('alarmTimeInput');
const alarmToggleBtn = $('alarmToggleBtn'), alarmStatusText = $('alarmStatusText');

// Media Carousel
const carouselPrevBtn = $('carouselPrevBtn'), carouselNextBtn = $('carouselNextBtn');
const mediaSourcePills = $('mediaSourcePills'), mediaCarouselTrack = $('mediaCarouselTrack');

// Power Cards
const powerCards = document.querySelectorAll('.power-card');

// App Launcher
const appItems = document.querySelectorAll('.app-item');
const customAppInput = $('customAppInput'), customAppLaunchBtn = $('customAppLaunchBtn');

// Clipboard
const clipSearchInput = $('clipSearchInput'), clearClipsBtn = $('clearClipsBtn'), clipsList = $('clipsList');

// Constants
const RING_C = 2 * Math.PI * 6;
ringBar.style.strokeDasharray = RING_C;

// Utility functions
function load(k, d) {
  try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; }
}
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

function formatSecs(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// State variables
let hovering = false;
let pinned = load('pinned', false);
let autohide = load('autohide', false);
let activeTab = load('activeTab', 'focus');
let activeFocusSub = load('activeFocusSub', 'session');
let flash = false;
let leaveT = null;
let ignoring = true;
let isDND = false;

// Focus Session State
let focusMinutes = load('focusMinutes', 25);
let timer = null; // { end, total, paused, remaining, task }

// Quick Timer State
let quickTimer = null; // { end, total, paused, remaining, label }

// Alarm State
let alarm = load('alarmSetting', null); // { time: "HH:MM", label: "..." }

// Power Button Arming
let armingAction = null;
let armingTimer = null;

// ==========================================
// 1. TABS & SUB-VIEWS
// ==========================================
function switchTab(tabName) {
  activeTab = tabName;
  save('activeTab', tabName);
  island.dataset.tab = tabName;

  tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
  panels.forEach((p) => p.classList.toggle('active', p.id === `panel${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`));
}

tabBtns.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    switchTab(btn.dataset.tab);
  });
});
switchTab(activeTab);

function switchFocusSub(subName) {
  activeFocusSub = subName;
  save('activeFocusSub', subName);

  focusSubtabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.sub === subName));
  subviews.forEach((v) => v.classList.toggle('active', v.id === `sub${subName.charAt(0).toUpperCase() + subName.slice(1)}`));
}

focusSubtabBtns.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    switchFocusSub(btn.dataset.sub);
  });
});
switchFocusSub(activeFocusSub);

// ==========================================
// 2. DND (DO NOT DISTURB)
// ==========================================
async function toggleDND() {
  isDND = await window.api.toggleDND();
  updateDNDUI();
  updateCompactCompanion();
}

function updateDNDUI() {
  dndBtn.classList.toggle('on', isDND);
  dndText.textContent = isDND ? 'DND: ON' : 'DND: OFF';
  cDndBadge.style.display = isDND ? 'inline-flex' : 'none';
}

dndBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleDND();
});
updateDNDUI();

// ==========================================
// 3. COMPACT PILL & CENTERED CLOCK LOGIC
// ==========================================
function updateCompactCompanion() {
  const hasTimer = !!timer;
  const hasQuickTimer = !!quickTimer;
  const hasAlarm = !!alarm;
  const hasMediaPlaying = isMediaPlayingOverall();

  cTimerWrap.style.display = (hasTimer || hasQuickTimer) ? 'inline-flex' : 'none';
  cWave.classList.toggle('active', hasMediaPlaying && !hasTimer && !hasQuickTimer);
  
  if (hasAlarm && !hasTimer && !hasQuickTimer) {
    cAlarmBadge.style.display = 'inline-flex';
    cAlarmTime.textContent = alarm.time;
  } else {
    cAlarmBadge.style.display = 'none';
  }

  const hasCompanion = hasTimer || hasQuickTimer || hasAlarm || hasMediaPlaying || isDND;
  island.classList.toggle('has-companion', hasCompanion);
  island.classList.toggle('timer', hasTimer || hasQuickTimer);
}

function stateName() {
  if (hovering || pinned || flash) return 'expanded';
  return autohide ? 'hidden' : 'compact';
}

function render() {
  island.dataset.state = stateName();
  island.classList.toggle('done', flash);
  pinBtn.classList.toggle('on', pinned);
  hideBtn.classList.toggle('on', autohide);
  updateCompactCompanion();
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
// 4. SOUND EFFECTS & CHIMES
// ==========================================
function playFinishChime() {
  if (isDND) return; // Respect DND mode
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0, now + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.12 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 1.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 1.35);
    });
  } catch (_) {
    window.api.beep();
  }
}

function playAlarmChime() {
  if (isDND) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [659.25, 783.99, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.18);
      gain.gain.setValueAtTime(0, now + idx * 0.18);
      gain.gain.linearRampToValueAtTime(0.3, now + idx * 0.18 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.18 + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.18);
      osc.stop(now + idx * 0.18 + 0.65);
    });
  } catch (_) {
    window.api.beep();
  }
}

// ==========================================
// 5. FOCUS SESSION LOGIC
// ==========================================
focusTaskInput.value = load('focusTask', '');
focusTaskInput.addEventListener('input', (e) => save('focusTask', e.target.value));

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
  focusMinutes = Math.min(180, focusMinutes + 5);
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
  const task = focusTaskInput.value.trim() || 'Focus Session';
  if (!timer) {
    const total = focusMinutes * 60 * 1000;
    timer = { end: Date.now() + total, total, paused: false, remaining: total, task };
    timerBtnText.textContent = 'Pause';
    timerResetBtn.style.display = 'grid';
  } else if (!timer.paused) {
    timer.paused = true;
    timer.remaining = Math.max(0, timer.end - Date.now());
    timerBtnText.textContent = 'Resume';
  } else {
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

// ==========================================
// 6. QUICK COUNTDOWN TIMER LOGIC
// ==========================================
qtChips.forEach((chip) => {
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (quickTimer) return;
    const addSecs = parseInt(chip.dataset.add, 10);
    let curSecs = (parseInt(qtHours.value, 10) || 0) * 3600 +
                  (parseInt(qtMins.value, 10) || 0) * 60 +
                  (parseInt(qtSecs.value, 10) || 0);
    curSecs += addSecs;
    qtHours.value = Math.floor(curSecs / 3600);
    qtMins.value = Math.floor((curSecs % 3600) / 60);
    qtSecs.value = curSecs % 60;
  });
});

qtStartBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const label = quickTimerLabel.value.trim() || 'Quick Timer';
  if (!quickTimer) {
    const totalSecs = (parseInt(qtHours.value, 10) || 0) * 3600 +
                      (parseInt(qtMins.value, 10) || 0) * 60 +
                      (parseInt(qtSecs.value, 10) || 0);
    if (totalSecs <= 0) return;
    const total = totalSecs * 1000;
    quickTimer = { end: Date.now() + total, total, paused: false, remaining: total, label };
    qtStartBtn.textContent = 'Pause';
    qtResetBtn.style.display = 'grid';
  } else if (!quickTimer.paused) {
    quickTimer.paused = true;
    quickTimer.remaining = Math.max(0, quickTimer.end - Date.now());
    qtStartBtn.textContent = 'Resume';
  } else {
    quickTimer.paused = false;
    quickTimer.end = Date.now() + quickTimer.remaining;
    qtStartBtn.textContent = 'Pause';
  }
  render();
});

qtResetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  quickTimer = null;
  qtStartBtn.textContent = 'Start Timer';
  qtResetBtn.style.display = 'none';
  render();
});

// ==========================================
// 7. ALARM CLOCK LOGIC
// ==========================================
if (alarm) {
  alarmTimeInput.value = alarm.time || '';
  alarmLabelInput.value = alarm.label || '';
  alarmToggleBtn.textContent = 'Cancel Alarm';
  alarmToggleBtn.classList.add('active');
  updateAlarmStatus();
}

function updateAlarmStatus() {
  if (!alarm) {
    alarmStatusText.textContent = 'No alarm set';
    alarmToggleBtn.textContent = 'Set Alarm';
    alarmToggleBtn.classList.remove('active');
    return;
  }
  const now = new Date();
  const [ah, am] = alarm.time.split(':').map(Number);
  const target = new Date();
  target.setHours(ah, am, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);

  const diffMs = target - now;
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  const time12 = target.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  alarmStatusText.textContent = `🔔 Set for ${time12} (${diffHrs > 0 ? `${diffHrs}h ` : ''}${diffMins}m away) — ${alarm.label || 'Alarm'}`;
  alarmToggleBtn.textContent = 'Cancel Alarm';
  alarmToggleBtn.classList.add('active');
}

alarmToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (alarm) {
    alarm = null;
    save('alarmSetting', null);
    updateAlarmStatus();
  } else {
    const timeVal = alarmTimeInput.value;
    if (!timeVal) return;
    alarm = { time: timeVal, label: alarmLabelInput.value.trim() || 'Alarm' };
    save('alarmSetting', alarm);
    updateAlarmStatus();
  }
  render();
});

function checkAlarmTrigger(now) {
  if (!alarm) return;
  const currentHM = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (currentHM === alarm.time && now.getSeconds() < 2) {
    // Trigger Alarm!
    const firedLabel = alarm.label || 'Alarm!';
    alarm = null;
    save('alarmSetting', null);
    updateAlarmStatus();

    flash = true;
    playAlarmChime();
    eDate.textContent = `⏰ ALARM: ${firedLabel}`;
    render();
    setTimeout(() => { flash = false; render(); }, 6000);
  }
}

// ==========================================
// 8. MULTI-APP MEDIA CAROUSEL
// ==========================================
let detectedSources = [];
let activeMediaIdx = 0;
let localLoFiProgress = 0;
let localLoFiInterval = null;
let audioEl = new Audio();
let webAudioCtx = null, noiseNode = null, noiseGain = null;

audioEl.crossOrigin = 'anonymous';

// Soundscapes list for Notcha Lo-Fi Radio
const SOUNDSCAPES = [
  { title: 'Lofi Study Beats', genre: 'Chillhop / Downtempo', url: 'https://ice1.somafm.com/groovesalad-128-mp3', isStream: true, simDuration: 300 },
  { title: 'Rainy Cafe & Thunder', genre: 'Nature Soundscape', type: 'procedural-rain', simDuration: 600 },
  { title: 'Pine Forest & Birds', genre: 'Forest Nature', url: 'https://ice6.somafm.com/lush-128-mp3', isStream: true, simDuration: 360 },
  { title: 'Deep Alpha Waves', genre: 'Binaural Focus', url: 'https://ice2.somafm.com/dronezone-128-mp3', isStream: true, simDuration: 420 },
  { title: 'Synthwave Chill Drive', genre: 'Retro Synth', url: 'https://ice4.somafm.com/defcon-128-mp3', isStream: true, simDuration: 280 },
];
let loFiSoundscapeIdx = 0;
let isLoFiPlaying = false;

function isMediaPlayingOverall() {
  if (isLoFiPlaying) return true;
  return detectedSources.some((s) => s.state === 'playing');
}

// Procedural sound generator
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

    const filter = webAudioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, webAudioCtx.currentTime);

    noiseGain = webAudioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.5, webAudioCtx.currentTime);

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

// Icons mapping for media apps
function getAppIconSvg(iconType) {
  if (iconType === 'youtube') {
    return `<svg viewBox="0 0 24 24"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>`;
  }
  if (iconType === 'apple') {
    return `<svg viewBox="0 0 24 24"><path d="M12 2a4 4 0 0 0-3.8 2.7A4 4 0 0 0 12 6a4 4 0 0 0 3.8-1.3A4 4 0 0 0 12 2z"/><path d="M18.7 19.5c-.8 1.2-1.7 2.5-3 2.5s-1.8-.8-3.2-.8-3.3.8-4.5-.8c-2.4-3.5-2.7-9.5.6-11.4 1.3-.8 2.7-.8 3.8-.3 1.1.5 1.7.8 2.6.8.9 0 1.5-.3 2.6-.8 1.4-.7 3.2-.8 4.4.9-3.2 1.8-2.6 6.3.7 7.9-.7 1.4-1.5 2.7-2.4 3.7z"/></svg>`;
  }
  if (iconType === 'spotify') {
    return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M7 10.5c3.5-1 7.5-.7 10.5 1"/><path d="M8 13.5c2.8-.7 6-.5 8.5.8"/><path d="M9 16.5c2-.5 4.5-.3 6.5.6"/></svg>`;
  }
  if (iconType === 'vlc') {
    return `<svg viewBox="0 0 24 24"><polygon points="12 2 4 20 20 20 12 2"/><line x1="7" y1="13" x2="17" y2="13"/><line x1="8.5" y1="16.5" x2="15.5" y2="16.5"/></svg>`;
  }
  if (iconType === 'telegram') {
    return `<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
  }
  if (iconType === 'lofi') {
    return `<svg viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
}

function renderMediaCarousel() {
  if (detectedSources.length === 0) return;
  activeMediaIdx = Math.max(0, Math.min(detectedSources.length - 1, activeMediaIdx));

  // Render navigation pills
  mediaSourcePills.innerHTML = detectedSources
    .map((s, idx) => {
      const isPlaying = s.state === 'playing';
      const isActive = idx === activeMediaIdx;
      return `
        <button class="source-pill ${isActive ? 'active' : ''} ${isPlaying ? 'playing' : ''}" data-idx="${idx}" title="Switch to ${s.name}">
          ${isPlaying ? '<span class="live-dot"></span>' : ''}
          <span>${s.name}</span>
        </button>
      `;
    })
    .join('');

  mediaSourcePills.querySelectorAll('.source-pill').forEach((pill) => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      activeMediaIdx = parseInt(pill.dataset.idx, 10);
      renderMediaCarousel();
    });
  });

  // Render sliding cards in track
  mediaCarouselTrack.innerHTML = detectedSources
    .map((s, idx) => {
      const isPlaying = s.state === 'playing';
      const isLoFi = s.id === 'lofi';
      const durationSecs = s.duration || 300;
      const positionSecs = s.position || 0;
      const progressPct = durationSecs > 0 ? (positionSecs / durationSecs) * 100 : 0;

      return `
        <div class="media-card-screen" data-id="${s.id}">
          <div class="media-card-header">
            <div class="source-badge">
              <span class="app-icon-circle ${s.icon}">${getAppIconSvg(s.icon)}</span>
              <span class="app-name-label">${s.name}</span>
            </div>
            <div class="status-pill ${isPlaying ? 'playing' : ''}">
              ${isPlaying ? '▶ Active' : '⏸ Idle'}
            </div>
          </div>

          <div class="media-card-center">
            <div class="track-details">
              <div class="now-playing-title">${s.title}</div>
              <div class="now-playing-artist">${s.artist}</div>
            </div>
            <div class="sound-wave ${isPlaying ? 'playing' : ''}">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
          </div>

          <!-- Controls: Prev, Play/Pause, Next -->
          <div class="media-card-controls">
            <button class="ctrl-btn card-prev" data-id="${s.id}" title="Previous">
              <svg viewBox="0 0 24 24"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
            </button>
            <button class="ctrl-btn play-btn card-playpause" data-id="${s.id}" title="Play / Pause">
              ${isPlaying
                ? '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
                : '<svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"/></svg>'
              }
            </button>
            <button class="ctrl-btn card-next" data-id="${s.id}" title="Next">
              <svg viewBox="0 0 24 24"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
            </button>

            ${isLoFi ? `
              <select class="lofi-select" id="lofiSelect" title="Select Lo-Fi Channel">
                ${SOUNDSCAPES.map((sc, i) => `<option value="${i}" ${i === loFiSoundscapeIdx ? 'selected' : ''}>${sc.title}</option>`).join('')}
              </select>
            ` : ''}
          </div>

          <!-- Seek Slider Row -->
          <div class="seek-row">
            <span class="time-stamp time-cur">${formatSecs(positionSecs)}</span>
            <div class="slider-container">
              <input type="range" class="custom-slider card-seek" min="0" max="100" value="${progressPct}" step="0.5" data-id="${s.id}" data-dur="${durationSecs}" />
              <div class="slider-fill" style="width: ${progressPct}%;"></div>
            </div>
            <span class="time-stamp time-tot">${formatSecs(durationSecs)}</span>
          </div>

          <!-- Volume Slider Row -->
          <div class="volume-row">
            <button class="vol-icon-btn card-mute" data-id="${s.id}" title="Mute/Unmute">
              <svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
            </button>
            <div class="slider-container">
              <input type="range" class="custom-slider card-vol" min="0" max="100" value="${s.volume || 75}" data-id="${s.id}" />
              <div class="slider-fill" style="width: ${s.volume || 75}%;"></div>
            </div>
            <span class="vol-num">${s.volume || 75}%</span>
          </div>
        </div>
      `;
    })
    .join('');

  // Slide track smoothly to the active card
  mediaCarouselTrack.style.transform = `translateX(-${activeMediaIdx * 100}%)`;

  // Attach control event listeners on cards
  mediaCarouselTrack.querySelectorAll('.media-card-screen').forEach((card) => {
    const id = card.dataset.id;
    const source = detectedSources.find((s) => s.id === id);

    card.querySelector('.card-playpause').addEventListener('click', (e) => {
      e.stopPropagation();
      handleMediaPlayPause(id);
    });

    card.querySelector('.card-prev').addEventListener('click', (e) => {
      e.stopPropagation();
      handleMediaNav(id, 'prev');
    });

    card.querySelector('.card-next').addEventListener('click', (e) => {
      e.stopPropagation();
      handleMediaNav(id, 'next');
    });

    const seekSliderEl = card.querySelector('.card-seek');
    seekSliderEl.addEventListener('input', (e) => {
      const pct = parseFloat(e.target.value);
      card.querySelector('.seek-row .slider-fill').style.width = `${pct}%`;
      const dur = parseFloat(e.target.dataset.dur) || 300;
      const targetSec = (pct / 100) * dur;
      card.querySelector('.time-cur').textContent = formatSecs(targetSec);
      handleMediaSeek(id, targetSec);
    });

    const volSliderEl = card.querySelector('.card-vol');
    volSliderEl.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      card.querySelector('.volume-row .slider-fill').style.width = `${v}%`;
      card.querySelector('.vol-num').textContent = `${v}%`;
      handleMediaVolume(id, v);
    });

    const lofiSelect = card.querySelector('#lofiSelect');
    if (lofiSelect) {
      lofiSelect.addEventListener('change', (e) => {
        loFiSoundscapeIdx = parseInt(e.target.value, 10);
        changeLoFiTrack(loFiSoundscapeIdx);
      });
    }
  });

  updateCompactCompanion();
}

carouselPrevBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (activeMediaIdx > 0) {
    activeMediaIdx--;
    renderMediaCarousel();
  }
});

carouselNextBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (activeMediaIdx < detectedSources.length - 1) {
    activeMediaIdx++;
    renderMediaCarousel();
  }
});

function handleMediaPlayPause(id) {
  if (id === 'lofi') {
    isLoFiPlaying = !isLoFiPlaying;
    const lofiSource = detectedSources.find((s) => s.id === 'lofi');
    if (lofiSource) lofiSource.state = isLoFiPlaying ? 'playing' : 'paused';

    if (isLoFiPlaying) {
      const sc = SOUNDSCAPES[loFiSoundscapeIdx];
      if (sc.type === 'procedural-rain') startProceduralRain();
      else { stopProceduralNoise(); audioEl.src = sc.url; audioEl.play().catch(() => {}); }
    } else {
      audioEl.pause();
      stopProceduralNoise();
    }
    renderMediaCarousel();
    return;
  }

  // External / System app
  window.api.sendMediaAction({ source: id, action: 'playpause' });
  const s = detectedSources.find((x) => x.id === id);
  if (s) {
    s.state = s.state === 'playing' ? 'paused' : 'playing';
    renderMediaCarousel();
  }
}

function handleMediaNav(id, dir) {
  if (id === 'lofi') {
    loFiSoundscapeIdx = (loFiSoundscapeIdx + (dir === 'next' ? 1 : -1) + SOUNDSCAPES.length) % SOUNDSCAPES.length;
    changeLoFiTrack(loFiSoundscapeIdx);
    return;
  }
  window.api.sendMediaAction({ source: id, action: dir });
}

function handleMediaSeek(id, sec) {
  if (id === 'lofi') {
    if (audioEl.duration && !isNaN(audioEl.duration)) audioEl.currentTime = sec;
    return;
  }
  window.api.sendMediaAction({ source: id, action: 'seek', value: sec });
}

function handleMediaVolume(id, vol) {
  if (id === 'lofi') {
    audioEl.volume = vol / 100;
    if (noiseGain && webAudioCtx) noiseGain.gain.setValueAtTime((vol / 100) * 0.6, webAudioCtx.currentTime);
    return;
  }
  window.api.sendMediaAction({ source: id, action: 'volume', value: vol });
}

function changeLoFiTrack(idx) {
  const sc = SOUNDSCAPES[idx];
  const lofiSource = detectedSources.find((s) => s.id === 'lofi');
  if (lofiSource) {
    lofiSource.title = sc.title;
    lofiSource.artist = sc.genre;
    lofiSource.duration = sc.simDuration;
  }
  if (isLoFiPlaying) {
    if (sc.type === 'procedural-rain') {
      audioEl.pause();
      startProceduralRain();
    } else {
      stopProceduralNoise();
      audioEl.src = sc.url;
      audioEl.play().catch(() => {});
    }
  }
  renderMediaCarousel();
}

// Initial fetch of media sources
window.api.getMediaSources().then((sources) => {
  detectedSources = sources || [];
  // If an active playing app exists, default carousel to it
  const playIdx = detectedSources.findIndex((s) => s.state === 'playing');
  if (playIdx !== -1) activeMediaIdx = playIdx;
  renderMediaCarousel();
});

window.api.onMediaSourcesUpdated((sources) => {
  if (!sources || sources.length === 0) return;
  // Merge status while keeping lo-fi state
  detectedSources = sources.map((ns) => {
    if (ns.id === 'lofi') {
      const sc = SOUNDSCAPES[loFiSoundscapeIdx];
      return { ...ns, title: sc.title, artist: sc.genre, duration: sc.simDuration, state: isLoFiPlaying ? 'playing' : 'paused' };
    }
    return ns;
  });
  renderMediaCarousel();
});

// ==========================================
// 9. POWER ACTIONS (WITH SAFETY ARMING)
// ==========================================
powerCards.forEach((card) => {
  card.addEventListener('click', (e) => {
    e.stopPropagation();
    const action = card.dataset.action;
    if (action === 'lock') {
      window.api.powerAction('lock');
      return;
    }
    if (armingAction === action) {
      clearTimeout(armingTimer);
      armingAction = null;
      resetPowerCards();
      window.api.powerAction(action);
    } else {
      clearTimeout(armingTimer);
      resetPowerCards();
      armingAction = action;
      card.classList.add('armed');
      card.querySelector('.card-title').textContent = 'Confirm? (3s)';
      card.querySelector('.card-sub').textContent = 'Click again to proceed';

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
// 10. APP SHORTCUTS LAUNCHER
// ==========================================
appItems.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.api.launchApp(btn.dataset.app);
  });
});

function launchCustomApp() {
  const val = customAppInput.value.trim();
  if (!val) return;
  window.api.launchApp(val);
  customAppInput.value = '';
}
customAppLaunchBtn.addEventListener('click', (e) => { e.stopPropagation(); launchCustomApp(); });
customAppInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); launchCustomApp(); } });

// ==========================================
// 11. CLIPBOARD HISTORY
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
      const escaped = item.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const ageStr = formatClipAge(item.time);
      return `
      <div class="clip-card" data-id="${item.id}">
        <div class="clip-body">
          <div class="clip-text">${escaped}</div>
          <div class="clip-meta"><span>${item.text.length} chars</span> • <span>${ageStr}</span></div>
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
      setTimeout(() => { tag.textContent = 'Copy'; tag.classList.remove('copied'); }, 1500);
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

clipSearchInput.addEventListener('input', (e) => renderClips(e.target.value));
clearClipsBtn.addEventListener('click', (e) => { e.stopPropagation(); window.api.clearClipboard(); });

window.api.getClipboardHistory().then((list) => { clipboardData = list || []; renderClips(); });
window.api.onClipboardUpdated((list) => { clipboardData = list || []; renderClips(clipSearchInput.value); });

// ==========================================
// 12. MASTER TICK LOOP (CLOCK, TIMERS, ALARM)
// ==========================================
function mmss(ms) {
  const s = Math.ceil(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
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

  // 1. Focus Session Countdown
  if (timer) {
    if (!timer.paused) {
      const left = Math.max(0, timer.end - Date.now());
      const leftStr = mmss(left);
      cTimer.textContent = leftStr;
      timerBtnText.textContent = `Pause (${leftStr})`;
      ringBar.style.strokeDashoffset = RING_C * (1 - left / timer.total);
      if (left === 0 && !force) {
        timer = null;
        timerResetBtn.style.display = 'none';
        flash = true;
        playFinishChime();
        updateFocusDurationDisplay();
        render();
        setTimeout(() => { flash = false; render(); }, 4500);
      }
    } else {
      const leftStr = mmss(timer.remaining);
      cTimer.textContent = leftStr;
      timerBtnText.textContent = `Resume (${leftStr})`;
    }
  }

  // 2. Quick Timer Countdown
  if (quickTimer) {
    if (!quickTimer.paused) {
      const left = Math.max(0, quickTimer.end - Date.now());
      const leftStr = mmss(left);
      if (!timer) cTimer.textContent = leftStr;
      qtStartBtn.textContent = `Pause (${leftStr})`;
      if (left === 0 && !force) {
        quickTimer = null;
        qtStartBtn.textContent = 'Start Timer';
        qtResetBtn.style.display = 'none';
        flash = true;
        playFinishChime();
        render();
        setTimeout(() => { flash = false; render(); }, 4500);
      }
    } else {
      const leftStr = mmss(quickTimer.remaining);
      if (!timer) cTimer.textContent = leftStr;
      qtStartBtn.textContent = `Resume (${leftStr})`;
    }
  }

  // 3. Alarm Trigger Check
  checkAlarmTrigger(now);
}

setInterval(() => tick(false), 250);
updateFocusDurationDisplay();
render();

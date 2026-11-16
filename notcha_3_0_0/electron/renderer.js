// ==========================================
// Notcha 3.0.0 - Enhanced Renderer Process
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

// Media Player
const mediaContainer = $('mediaContainer');

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

// Power Confirmation Elements & State
const powerGrid = $('powerGrid');
const powerConfirmView = $('powerConfirmView');
const confirmCard = $('confirmCard');
const confirmIconSvg = $('confirmIconSvg');
const confirmHeading = $('confirmHeading');
const confirmWarningText = $('confirmWarningText');
const powerConfirmCancelBtn = $('powerConfirmCancelBtn');
const powerConfirmProceedBtn = $('powerConfirmProceedBtn');
const powerProceedIcon = $('powerProceedIcon');
const powerProceedLabel = $('powerProceedLabel');
let pendingPowerAction = null;

function hidePowerConfirmation() {
  pendingPowerAction = null;
  if (!powerConfirmView || !powerGrid) return;
  powerConfirmView.classList.remove('active');
  powerGrid.classList.remove('hidden');
}

// ==========================================
// 1. TABS & SUB-VIEWS
// ==========================================
function switchTab(tabName) {
  activeTab = tabName;
  save('activeTab', tabName);
  island.dataset.tab = tabName;

  tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
  panels.forEach((p) => p.classList.toggle('active', p.id === `panel${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`));
  hidePowerConfirmation();
  if (tabName === 'music') {
    refreshAudioDevices();
  } else {
    closeAudioRouteSheet();
  }
  if (tabName === 'transfer') {
    refreshTransferInfo();
  } else {
    closeTransferQrSheet();
  }
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
if (window.api.getDND) {
  window.api.getDND().then((val) => {
    isDND = !!val;
    updateDNDUI();
    updateCompactCompanion();
  });
}
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
      leaveT = setTimeout(() => { hovering = false; leaveT = null; hidePowerConfirmation(); render(); }, 250);
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
// 8. ACTIVE MEDIA PLAYER (SINGLE DYNAMIC ISLAND CONTROLLER)
// ==========================================
let activeMedia = null;
let isSeeking = false;
let isVoluming = false;
let lastUserPlayPauseTime = 0;
let userToggledState = null;
let lastUserVolumeTime = 0;
let userVolumeLevel = null;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isMediaPlayingOverall() {
  return !!(activeMedia && activeMedia.state === 'playing');
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
  if (iconType === 'aimp') {
    return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
}

// Smooth second-by-second playback advancement for active playing track
setInterval(() => {
  if (activeMedia && activeMedia.state === 'playing') {
    const dur = activeMedia.duration || 300;
    activeMedia.position = Math.min(dur, (activeMedia.position || 0) + 1);

    if (!isSeeking && mediaContainer) {
      const pct = dur > 0 ? (activeMedia.position / dur) * 100 : 0;
      const seekEl = mediaContainer.querySelector('.card-seek');
      const fillEl = mediaContainer.querySelector('.seek-row .slider-fill');
      const timeCur = mediaContainer.querySelector('.time-cur');
      if (seekEl) seekEl.value = pct;
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (timeCur) timeCur.textContent = formatSecs(activeMedia.position);
    }
  }
}, 1000);

// ==========================================
// AUDIO OUTPUT ROUTING
// ==========================================
const audioRouteSheet = $('audioRouteSheet');
const routeSheetCloseBtn = $('routeSheetCloseBtn');
const routeDeviceList = $('routeDeviceList');
let audioDevices = [];
let currentOutputDevice = null;

if (routeSheetCloseBtn) {
  routeSheetCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAudioRouteSheet();
  });
}

function getDeviceIconSvg(transport) {
  if (transport === 'bluetooth') {
    return `<svg viewBox="0 0 24 24"><path d="M7 7l10 10-5 5V2l5 5L7 17"/></svg>`;
  }
  if (transport === 'headphones') {
    return `<svg viewBox="0 0 24 24"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`;
  }
  if (transport === 'display') {
    return `<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
  }
  if (transport === 'usb') {
    return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M8 10l4-4 4 4"/></svg>`;
  }
  if (transport === 'airplay') {
    return `<svg viewBox="0 0 24 24"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1"/><polygon points="12 15 17 21 7 21 12 15"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
}

async function refreshAudioDevices() {
  if (!window.api || !window.api.getAudioDevices) return;
  try {
    const list = await window.api.getAudioDevices();
    if (Array.isArray(list) && list.length > 0) {
      audioDevices = list;
      const def = list.find((d) => d.isDefault) || list[0];
      currentOutputDevice = def;
      updateAudioPillLabels();
      renderAudioRouteList();
    }
  } catch (_) {}
}

function updateAudioPillLabels() {
  if (!currentOutputDevice) return;
  const pills = document.querySelectorAll('.audio-output-pill');
  pills.forEach((pill) => {
    const iconSpan = pill.querySelector('.route-pill-icon');
    const nameSpan = pill.querySelector('.route-pill-name');
    if (iconSpan) iconSpan.innerHTML = getDeviceIconSvg(currentOutputDevice.transport);
    if (nameSpan) {
      nameSpan.textContent = currentOutputDevice.name;
      nameSpan.title = currentOutputDevice.name;
    }
  });
}

function renderAudioRouteList() {
  if (!routeDeviceList) return;
  if (!audioDevices || audioDevices.length === 0) {
    routeDeviceList.innerHTML = `<div style="text-align:center; font-size:11px; color:var(--text-mute); padding:16px;">No audio output devices detected</div>`;
    return;
  }

  routeDeviceList.innerHTML = audioDevices.map((dev) => `
    <button class="route-device-item ${dev.isDefault ? 'active' : ''}" data-id="${dev.id}" type="button">
      <div class="route-device-left">
        ${getDeviceIconSvg(dev.transport)}
        <span class="route-device-name" title="${escapeHtml(dev.name)}">${escapeHtml(dev.name)}</span>
      </div>
      <div class="route-device-right">
        <span class="route-transport-tag">${escapeHtml(dev.transport)}</span>
        <svg class="route-check-icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
    </button>
  `).join('');

  routeDeviceList.querySelectorAll('.route-device-item').forEach((item) => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = item.dataset.id;
      const target = audioDevices.find((d) => String(d.id) === String(id));
      if (!target) return;

      const ok = await window.api.setAudioDevice(target.id);
      if (ok) {
        audioDevices.forEach((d) => { d.isDefault = (String(d.id) === String(target.id)); });
        currentOutputDevice = target;
        updateAudioPillLabels();
        renderAudioRouteList();

        try {
          const newVol = await window.api.getSystemVolume();
          if (typeof newVol === 'number' && activeMedia) {
            activeMedia.volume = newVol;
            const volEl = document.querySelector('.card-vol');
            const volFill = document.querySelector('.volume-row .slider-fill');
            const volNum = document.querySelector('.vol-num');
            if (volEl) volEl.value = newVol;
            if (volFill) volFill.style.width = `${newVol}%`;
            if (volNum) volNum.textContent = `${newVol}%`;
          }
        } catch (_) {}
      }
    });
  });
}

function openAudioRouteSheet() {
  if (!audioRouteSheet) return;
  audioRouteSheet.style.display = 'flex';
  refreshAudioDevices();
}

function closeAudioRouteSheet() {
  if (!audioRouteSheet) return;
  audioRouteSheet.style.display = 'none';
}

function renderActiveMedia() {
  if (!mediaContainer) return;

  if (!activeMedia) {
    mediaContainer.innerHTML = `
      <div class="media-empty-card">
        <div class="empty-icon-wrapper">
          <svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
        <div class="empty-title">No Media Playing</div>
        <div class="empty-subtitle">Play audio in Spotify, Apple Music, YouTube, VLC or your browser to control it here.</div>
        <div class="empty-route-section">
          <span class="empty-route-label">Current Audio Output:</span>
          <button class="audio-output-pill empty-output-pill" id="emptyAudioOutputBtn" title="Switch Audio Output Device" type="button">
            <span class="route-pill-icon">${getDeviceIconSvg(currentOutputDevice ? currentOutputDevice.transport : 'speaker')}</span>
            <span class="route-pill-name">${escapeHtml(currentOutputDevice ? currentOutputDevice.name : 'Audio Output')}</span>
            <svg class="route-pill-arrow" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
      </div>
    `;
    const emptyBtn = mediaContainer.querySelector('#emptyAudioOutputBtn');
    if (emptyBtn) {
      emptyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAudioRouteSheet();
      });
    }
    updateCompactCompanion();
    return;
  }

  const s = activeMedia;
  const isPlaying = s.state === 'playing';
  const durationSecs = s.duration || 300;
  const positionSecs = s.position || 0;
  const progressPct = durationSecs > 0 ? (positionSecs / durationSecs) * 100 : 0;
  const isRecentUserVolume = Date.now() - lastUserVolumeTime < 2500;
  const vol = (isVoluming || isRecentUserVolume) && userVolumeLevel !== null
    ? userVolumeLevel
    : (typeof s.volume === 'number' ? s.volume : 50);

  const existingCard = mediaContainer.querySelector('.active-media-card');
  if (existingCard && existingCard.dataset.id === s.id) {
    // In-place DOM update preserves focus and slider drag
    const titleEl = existingCard.querySelector('.now-playing-title');
    if (titleEl && titleEl.textContent !== s.title) {
      titleEl.textContent = s.title;
      titleEl.title = s.title;
    }

    const artistEl = existingCard.querySelector('.now-playing-artist');
    if (artistEl && artistEl.textContent !== s.artist) {
      artistEl.textContent = s.artist;
      artistEl.title = s.artist;
    }

    const nameEl = existingCard.querySelector('.app-name-label');
    if (nameEl && nameEl.textContent !== s.name) {
      nameEl.textContent = s.name;
    }

    const iconCircle = existingCard.querySelector('.app-icon-circle');
    if (iconCircle && !iconCircle.classList.contains(s.icon)) {
      iconCircle.className = `app-icon-circle ${s.icon}`;
      iconCircle.innerHTML = getAppIconSvg(s.icon);
    }

    const outputPillName = existingCard.querySelector('.audio-output-pill .route-pill-name');
    const outputPillIcon = existingCard.querySelector('.audio-output-pill .route-pill-icon');
    if (outputPillName && currentOutputDevice) {
      outputPillName.textContent = currentOutputDevice.name;
      outputPillName.title = currentOutputDevice.name;
    }
    if (outputPillIcon && currentOutputDevice) {
      outputPillIcon.innerHTML = getDeviceIconSvg(currentOutputDevice.transport);
    }

    const statusPill = existingCard.querySelector('.status-pill');
    if (statusPill) {
      statusPill.className = `status-pill ${isPlaying ? 'playing' : ''}`;
      statusPill.innerHTML = isPlaying ? '<span class="status-pulse-dot"></span> Active' : '⏸ Paused';
    }

    const soundWave = existingCard.querySelector('.sound-wave');
    if (soundWave) soundWave.className = `sound-wave ${isPlaying ? 'playing' : ''}`;

    const playBtn = existingCard.querySelector('.card-playpause');
    if (playBtn) {
      playBtn.title = isPlaying ? 'Pause' : 'Play';
      playBtn.innerHTML = isPlaying
        ? '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
        : '<svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
    }

    if (!isSeeking) {
      const seekEl = existingCard.querySelector('.card-seek');
      const fillEl = existingCard.querySelector('.seek-row .slider-fill');
      const timeCur = existingCard.querySelector('.time-cur');
      const timeTot = existingCard.querySelector('.time-tot');
      if (seekEl) {
        seekEl.value = progressPct;
        seekEl.dataset.dur = durationSecs;
      }
      if (fillEl) fillEl.style.width = `${progressPct}%`;
      if (timeCur) timeCur.textContent = formatSecs(positionSecs);
      if (timeTot) timeTot.textContent = formatSecs(durationSecs);
    }

    if (!isVoluming && !isRecentUserVolume) {
      const volEl = existingCard.querySelector('.card-vol');
      const volFill = existingCard.querySelector('.volume-row .slider-fill');
      const volNum = existingCard.querySelector('.vol-num');
      if (volEl && document.activeElement !== volEl) {
        volEl.value = vol;
      }
      if (volFill) volFill.style.width = `${vol}%`;
      if (volNum) volNum.textContent = `${vol}%`;
    }
  } else {
    // Rebuild full single active media card DOM
    mediaContainer.innerHTML = `
      <div class="active-media-card" data-id="${s.id}">
        <div class="media-card-header">
          <div class="source-badge">
            <span class="app-icon-circle ${s.icon}">${getAppIconSvg(s.icon)}</span>
            <span class="app-name-label">${escapeHtml(s.name)}</span>
          </div>
          <div class="header-right-actions">
            <button class="audio-output-pill" id="audioOutputBtn" title="Switch Audio Output Device" type="button">
              <span class="route-pill-icon">${getDeviceIconSvg(currentOutputDevice ? currentOutputDevice.transport : 'speaker')}</span>
              <span class="route-pill-name">${escapeHtml(currentOutputDevice ? currentOutputDevice.name : 'Audio Output')}</span>
              <svg class="route-pill-arrow" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="status-pill ${isPlaying ? 'playing' : ''}">
              ${isPlaying ? '<span class="status-pulse-dot"></span> Active' : '⏸ Paused'}
            </div>
          </div>
        </div>

        <div class="media-card-center">
          <div class="track-details">
            <div class="now-playing-title" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</div>
            <div class="now-playing-artist" title="${escapeHtml(s.artist)}">${escapeHtml(s.artist)}</div>
          </div>
          <div class="sound-wave ${isPlaying ? 'playing' : ''}">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
        </div>

        <!-- Controls: Prev, Play/Pause, Next -->
        <div class="media-card-controls">
          <button class="ctrl-btn card-prev" title="Previous Track">
            <svg viewBox="0 0 24 24"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
          </button>
          <button class="ctrl-btn play-btn card-playpause" title="${isPlaying ? 'Pause' : 'Play'}">
            ${isPlaying
              ? '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
              : '<svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"/></svg>'
            }
          </button>
          <button class="ctrl-btn card-next" title="Next Track">
            <svg viewBox="0 0 24 24"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
          </button>
        </div>

        <!-- Seek Slider Row -->
        <div class="seek-row">
          <span class="time-stamp time-cur">${formatSecs(positionSecs)}</span>
          <div class="slider-container">
            <input type="range" class="custom-slider card-seek" min="0" max="100" value="${progressPct}" step="0.5" data-dur="${durationSecs}" />
            <div class="slider-fill" style="width: ${progressPct}%;"></div>
          </div>
          <span class="time-stamp time-tot">${formatSecs(durationSecs)}</span>
        </div>

        <!-- Volume Slider Row -->
        <div class="volume-row">
          <button class="vol-icon-btn card-mute" title="Mute/Unmute">
            <svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
          </button>
          <div class="slider-container">
            <input type="range" class="custom-slider card-vol" min="0" max="100" value="${vol}" />
            <div class="slider-fill" style="width: ${vol}%;"></div>
          </div>
          <span class="vol-num">${vol}%</span>
        </div>
      </div>
    `;

    const card = mediaContainer.querySelector('.active-media-card');
    const routeBtn = card.querySelector('#audioOutputBtn');
    if (routeBtn) {
      routeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAudioRouteSheet();
      });
    }

    card.querySelector('.card-playpause').addEventListener('click', (e) => {
      e.stopPropagation();
      handleMediaPlayPause();
    });

    card.querySelector('.card-prev').addEventListener('click', (e) => {
      e.stopPropagation();
      handleMediaNav('prev');
    });

    card.querySelector('.card-next').addEventListener('click', (e) => {
      e.stopPropagation();
      handleMediaNav('next');
    });

    const seekSlider = card.querySelector('.card-seek');
    const startSeek = () => { isSeeking = true; };
    seekSlider.addEventListener('pointerdown', startSeek);
    seekSlider.addEventListener('mousedown', startSeek);
    seekSlider.addEventListener('touchstart', startSeek, { passive: true });

    seekSlider.addEventListener('input', (e) => {
      isSeeking = true;
      const pct = parseFloat(e.target.value);
      card.querySelector('.seek-row .slider-fill').style.width = `${pct}%`;
      const dur = parseFloat(e.target.dataset.dur) || 300;
      const targetSec = (pct / 100) * dur;
      card.querySelector('.time-cur').textContent = formatSecs(targetSec);
      if (activeMedia) activeMedia.position = targetSec;
    });

    seekSlider.addEventListener('change', (e) => {
      const pct = parseFloat(e.target.value);
      const dur = parseFloat(e.target.dataset.dur) || 300;
      const targetSec = (pct / 100) * dur;
      handleMediaSeek(targetSec);
    });

    const volSlider = card.querySelector('.card-vol');
    const startVolumeDrag = () => { isVoluming = true; };
    volSlider.addEventListener('pointerdown', startVolumeDrag);
    volSlider.addEventListener('mousedown', startVolumeDrag);
    volSlider.addEventListener('touchstart', startVolumeDrag, { passive: true });

    volSlider.addEventListener('input', (e) => {
      isVoluming = true;
      const v = parseInt(e.target.value, 10);
      card.querySelector('.volume-row .slider-fill').style.width = `${v}%`;
      card.querySelector('.vol-num').textContent = `${v}%`;
      handleMediaVolume(v);
    });

    const endVolumeDrag = (e) => {
      const v = parseInt(e.target.value, 10);
      handleMediaVolume(v);
      setTimeout(() => { isVoluming = false; }, 1000);
    };

    volSlider.addEventListener('change', endVolumeDrag);
    volSlider.addEventListener('pointerup', endVolumeDrag);
    volSlider.addEventListener('mouseup', endVolumeDrag);
    volSlider.addEventListener('touchend', endVolumeDrag);

    const muteBtn = card.querySelector('.card-mute');
    if (muteBtn) {
      muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const curV = parseInt(volSlider.value, 10);
        const newV = curV > 0 ? 0 : (userVolumeLevel && userVolumeLevel > 0 ? userVolumeLevel : 50);
        volSlider.value = newV;
        card.querySelector('.volume-row .slider-fill').style.width = `${newV}%`;
        card.querySelector('.vol-num').textContent = `${newV}%`;
        handleMediaVolume(newV);
      });
    }
  }

  updateCompactCompanion();
}

function handleMediaPlayPause() {
  if (!activeMedia) return;
  const nextState = activeMedia.state === 'playing' ? 'paused' : 'playing';
  activeMedia.state = nextState;
  userToggledState = nextState;
  lastUserPlayPauseTime = Date.now();
  renderActiveMedia();

  window.api.sendMediaAction({ source: activeMedia.id, action: 'playpause' });
}

function handleMediaNav(dir) {
  if (!activeMedia) return;
  window.api.sendMediaAction({ source: activeMedia.id, action: dir });
}

function handleMediaSeek(sec) {
  if (!activeMedia) return;
  isSeeking = true;
  activeMedia.position = sec;
  window.api.sendMediaAction({ source: activeMedia.id, action: 'seek', value: sec });
  setTimeout(() => { isSeeking = false; }, 2000);
}

function handleMediaVolume(vol) {
  if (!activeMedia) return;
  activeMedia.volume = vol;
  userVolumeLevel = vol;
  lastUserVolumeTime = Date.now();
  window.api.sendMediaAction({ source: activeMedia.id, action: 'volume', value: vol });
}

// Initial fetch of media source
window.api.getMediaSources().then((sources) => {
  activeMedia = (sources && sources.length > 0) ? sources[0] : null;
  renderActiveMedia();
});

// Real-time media source update listener
window.api.onMediaSourcesUpdated((sources) => {
  const isRecentUserToggle = Date.now() - lastUserPlayPauseTime < 1800;
  const isRecentUserVolume = Date.now() - lastUserVolumeTime < 2500;
  const newActive = (sources && sources.length > 0) ? sources[0] : null;

  if (newActive) {
    if (isRecentUserToggle && userToggledState !== null && activeMedia && activeMedia.id === newActive.id) {
      newActive.state = userToggledState;
    }
    if (isSeeking && activeMedia && activeMedia.id === newActive.id) {
      newActive.position = activeMedia.position;
    }
    if ((isVoluming || isRecentUserVolume) && userVolumeLevel !== null && activeMedia && activeMedia.id === newActive.id) {
      newActive.volume = userVolumeLevel;
    }
    activeMedia = newActive;
  } else {
    if (!isRecentUserToggle) {
      activeMedia = null;
    }
  }
  renderActiveMedia();
});

// ==========================================
// 9. POWER ACTIONS (WITH EXPLICIT WARNING & CONFIRMATION)
// ==========================================
const POWER_ICONS = {
  shutdown: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>',
  restart: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  sleep: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
};

function showPowerConfirmation(action) {
  pendingPowerAction = action;
  if (!powerConfirmView || !powerGrid) return;

  confirmCard.className = `confirm-card theme-${action}`;
  confirmIconSvg.innerHTML = POWER_ICONS[action] || '';
  powerProceedIcon.innerHTML = POWER_ICONS[action] || '';

  if (action === 'shutdown') {
    confirmHeading.textContent = 'Shut Down Computer?';
    confirmWarningText.textContent = '⚠️ Warning: All open applications will close and your computer will power off safely.';
    powerProceedLabel.textContent = 'Shut Down';
  } else if (action === 'restart') {
    confirmHeading.textContent = 'Restart Computer?';
    confirmWarningText.textContent = '⚠️ Warning: The computer will restart immediately. Make sure all your work is saved.';
    powerProceedLabel.textContent = 'Restart';
  } else if (action === 'sleep') {
    confirmHeading.textContent = 'Put Computer to Sleep?';
    confirmWarningText.textContent = 'Your current desktop session will be paused in low-power sleep mode.';
    powerProceedLabel.textContent = 'Sleep PC';
  }

  powerGrid.classList.add('hidden');
  powerConfirmView.classList.add('active');
}

powerCards.forEach((card) => {
  card.addEventListener('click', (e) => {
    e.stopPropagation();
    const action = card.dataset.action;
    if (action === 'lock') {
      window.api.powerAction('lock');
      return;
    }
    // For shutdown, restart, and sleep: show warning modal with confirmation button to avoid mistakes
    showPowerConfirmation(action);
  });
});

if (powerConfirmCancelBtn) {
  powerConfirmCancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hidePowerConfirmation();
  });
}

if (powerConfirmProceedBtn) {
  powerConfirmProceedBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const action = pendingPowerAction;
    hidePowerConfirmation();
    if (action) {
      window.api.powerAction(action);
    }
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hidePowerConfirmation();
    closeAudioRouteSheet();
    closeTransferQrSheet();
  }
});

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
refreshAudioDevices();
setInterval(() => {
  if (activeTab === 'music') {
    refreshAudioDevices();
  }
}, 4000);

// ==========================================
// 12. TRANSFER TAB & FLOATING MINI APP
// ==========================================
const transferServerUrl = document.getElementById('transferServerUrl');
const transferQrBtn = document.getElementById('transferQrBtn');
const transferPopoutBtn = document.getElementById('transferPopoutBtn');
const transferFolderBtn = document.getElementById('transferFolderBtn');
const filePickerNotch = document.getElementById('filePickerNotch');
const notchDropzone = document.getElementById('notchDropzone');
const notchSharedBanner = document.getElementById('notchSharedBanner');
const notchSharedText = document.getElementById('notchSharedText');
const notchClearSharedBtn = document.getElementById('notchClearSharedBtn');
const albumBtns = document.querySelectorAll('.album-btn');
const notchClearHistoryBtn = document.getElementById('notchClearHistoryBtn');
const notchGalleryList = document.getElementById('notchGalleryList');
const notchQrSheet = document.getElementById('notchQrSheet');
const notchQrBox = document.getElementById('notchQrBox');
const notchQrUrl = document.getElementById('notchQrUrl');
const closeNotchQrBtn = document.getElementById('closeNotchQrBtn');

let transferInfo = null;
let activeAlbum = 'all';

async function refreshTransferInfo() {
  if (!window.api || !window.api.getTransferServerInfo) return;
  try {
    transferInfo = await window.api.getTransferServerInfo();
    if (!transferInfo) return;

    if (transferServerUrl) {
      transferServerUrl.textContent = transferInfo.url ? transferInfo.url.replace(/^http:\/\//, '') : 'Wi-Fi Drop Active';
    }
    if (notchQrUrl) {
      notchQrUrl.textContent = transferInfo.url || '';
    }
    if (notchQrBox && transferInfo.qrSvg) {
      notchQrBox.innerHTML = transferInfo.qrSvg;
    }

    updateNotchSharedFiles(transferInfo.sharedFiles || []);
    renderTransferGallery();
  } catch (err) {
    console.error('Failed to refresh transfer info:', err);
  }
}

function updateNotchSharedFiles(files) {
  if (!notchSharedBanner || !notchSharedText) return;
  if (!files || files.length === 0) {
    notchSharedBanner.style.display = 'none';
    return;
  }
  notchSharedBanner.style.display = 'flex';
  if (files.length === 1) {
    notchSharedText.textContent = `Sharing "${files[0].name}" (${files[0].formattedSize})`;
  } else {
    notchSharedText.textContent = `Sharing ${files.length} files to paired devices`;
  }
}

function getFileCategoryIcon(type) {
  switch (type) {
    case 'images': return '🖼️';
    case 'videos': return '🎬';
    case 'docs': return '📄';
    case 'archives': return '📦';
    default: return '📁';
  }
}

function formatTransferTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function renderTransferGallery() {
  if (!notchGalleryList) return;
  const list = (transferInfo && transferInfo.history) ? transferInfo.history : [];
  const filtered = activeAlbum === 'all' ? list : list.filter((item) => item.type === activeAlbum);

  if (filtered.length === 0) {
    notchGalleryList.innerHTML = '<div class="empty-gallery">No files in this album yet. Drop files above or connect your phone!</div>';
    return;
  }

  notchGalleryList.innerHTML = '';
  filtered.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'gallery-row';

    const icon = getFileCategoryIcon(item.type);
    const dirText = item.direction === 'received' ? '📥 Recv' : '📤 Sent';
    const device = item.device ? ` • ${item.device}` : '';

    row.innerHTML = `
      <div class="gallery-thumb">${icon}</div>
      <div class="gallery-info">
        <div class="gallery-name" title="${item.name}">${item.name}</div>
        <div class="gallery-meta">${dirText} • ${item.formattedSize || ''} • ${formatTransferTime(item.time)}${device}</div>
      </div>
      <button class="gallery-reveal" title="Show in Finder">
        <svg viewBox="0 0 24 24"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>
      </button>
    `;

    row.addEventListener('click', (e) => {
      if (e.target.closest('.gallery-reveal')) return;
      if (window.api && window.api.showItemInFolder && item.path) {
        window.api.showItemInFolder(item.path);
      }
    });

    const revealBtn = row.querySelector('.gallery-reveal');
    if (revealBtn) {
      revealBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.api && window.api.showItemInFolder && item.path) {
          window.api.showItemInFolder(item.path);
        }
      });
    }

    notchGalleryList.appendChild(row);
  });
}

function openTransferQrSheet() {
  if (notchQrSheet) notchQrSheet.classList.add('active');
}
function closeTransferQrSheet() {
  if (notchQrSheet) notchQrSheet.classList.remove('active');
}

// QR toggle
if (transferQrBtn) {
  transferQrBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (notchQrSheet && notchQrSheet.classList.contains('active')) {
      closeTransferQrSheet();
    } else {
      openTransferQrSheet();
    }
  });
}
if (closeNotchQrBtn) {
  closeNotchQrBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTransferQrSheet();
  });
}

// Popout Mini App button
if (transferPopoutBtn) {
  transferPopoutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.api && window.api.openMiniTransfer) {
      window.api.openMiniTransfer();
    }
  });
}

// Open folder
if (transferFolderBtn) {
  transferFolderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.api && window.api.openTransfersFolder) {
      window.api.openTransfersFolder();
    }
  });
}

// Album buttons
albumBtns.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    activeAlbum = btn.dataset.album || 'all';
    albumBtns.forEach((b) => b.classList.toggle('active', b === btn));
    renderTransferGallery();
  });
});

// Dropzone Drag & Drop
if (notchDropzone) {
  notchDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    notchDropzone.classList.add('dragover');
  });

  notchDropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    notchDropzone.classList.remove('dragover');
  });

  notchDropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    notchDropzone.classList.remove('dragover');

    const files = Array.from(e.dataTransfer.files || []);
    const paths = files.map((f) => f.path).filter(Boolean);
    if (paths.length > 0 && window.api && window.api.shareFiles) {
      await window.api.shareFiles(paths);
      refreshTransferInfo();
    }
  });

  notchDropzone.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (window.api && window.api.chooseFilesToShare) {
      await window.api.chooseFilesToShare();
      refreshTransferInfo();
    } else if (filePickerNotch) {
      filePickerNotch.click();
    }
  });
}

if (filePickerNotch) {
  filePickerNotch.addEventListener('change', async () => {
    const files = Array.from(filePickerNotch.files || []);
    const paths = files.map((f) => f.path).filter(Boolean);
    if (paths.length > 0 && window.api && window.api.shareFiles) {
      await window.api.shareFiles(paths);
      refreshTransferInfo();
    }
    filePickerNotch.value = '';
  });
}

// Clear buttons
if (notchClearSharedBtn) {
  notchClearSharedBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (window.api && window.api.clearSharedFiles) {
      await window.api.clearSharedFiles();
    }
  });
}

if (notchClearHistoryBtn) {
  notchClearHistoryBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (window.api && window.api.clearTransfersHistory) {
      await window.api.clearTransfersHistory();
    }
  });
}

// Wire transfer IPC listeners
if (window.api) {
  if (window.api.onTransferReceived) {
    window.api.onTransferReceived(() => {
      refreshTransferInfo();
    });
  }
  if (window.api.onSharedFilesUpdated) {
    window.api.onSharedFilesUpdated((files) => {
      if (transferInfo) transferInfo.sharedFiles = files;
      updateNotchSharedFiles(files);
    });
  }
  if (window.api.onTransfersHistoryUpdated) {
    window.api.onTransfersHistoryUpdated((hist) => {
      if (transferInfo) transferInfo.history = hist;
      renderTransferGallery();
    });
  }
  if (window.api.onFocusTransferTab) {
    window.api.onFocusTransferTab(() => {
      isExpanded = true;
      switchTab('transfer');
      render();
    });
  }
}

refreshTransferInfo();


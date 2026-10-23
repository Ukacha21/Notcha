# Notcha 1.3.1

> A dynamic-island style desktop notch companion for Windows and macOS with focus timer, media player, app shortcuts, clipboard history, and power controls.

![Notcha](logo2.png)

## What's New in 1.3.1 ("A whole lotta improvements")

- 🎵 **Music & Ambient Soundscapes Player**:
  - Built-in Lo-Fi and ambient focus soundscapes (Lo-Fi Study Beats, Gentle Rain & Thunder, Pine Forest & Birds, Alpha Waves, Synthwave).
  - **Seek Slider**: Interactive scrubbing with live current and total timestamps.
  - **Volume Slider**: Smooth volume adjustment with 1-click mute and toggle between App Volume & System Master Volume.
  - Animated audio visualizer waveform in both expanded island and compact pill.
  - Vinyl record spin animation during playback.

- ⏱ **Adjustable Focus Timer**:
  - Stepper buttons (`-` / `+`) to adjust duration by 5-minute increments (1m to 120m).
  - Quick preset chips (`15m`, `25m` Pomodoro, `45m`, `60m`).
  - Pause, Resume, and Reset capabilities.
  - Pleasant harmonic chime on session complete + island celebration glow.
  - Remembers your preferred focus duration across restarts.

- ⚡ **System Power Controls**:
  - 🔒 **Lock Workstation**: Secure screen immediately.
  - 🌙 **Sleep Mode**: Put system into low-power sleep state.
  - ⚡ **Shut Down**: Safe OS shutdown.
  - 🔄 **Restart**: Reboot system.
  - **Safety Arming**: Critical actions require a second confirmation click within 3 seconds to prevent accidental misclicks.

- 🚀 **Quick App Shortcuts**:
  - Instant launchers for Browser, Terminal, VS Code, Files/Explorer, Music/Spotify, Calculator, Notes, and Settings.
  - Custom launcher bar: Type any website URL (e.g. `github.com`), file path, or application command to open instantly.

- 📋 **Clipboard History**:
  - Background clipboard tracking of copied text snippets.
  - Instant search filter.
  - 1-click copy back to clipboard with visual feedback badge (`✓ Copied!`).
  - Item deletion and "Clear All" history.

- 🏝 **Dynamic Island UX**:
  - **Compact Pill:** Hanging sleekly from the screen top showing the time, animated sound waves when music plays, and ring timer when focus is active.
  - **Auto-Hide:** Collapses into a thin subtle indicator line that reveals on hover.
  - **Global Shortcut:** `Ctrl/Cmd + Alt + N` to toggle auto-hide from anywhere.
  - **Pin Island:** Keeps the island open while multitasking.
  - Transparent click-through canvas outside the visible island.

---

## Getting Started

1. Ensure **Node.js LTS** is installed.
2. Navigate to the `electron` directory:
   ```bash
   cd electron
   npm install
   npm start
   ```

## Building Executables

Build native installers for macOS (`.dmg`, `.zip`) and Windows (`.exe`, `.zip`):
```bash
npm run dist:all
```
Outputs are generated in `electron/dist/`.

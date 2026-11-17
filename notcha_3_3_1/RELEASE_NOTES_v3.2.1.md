# Notcha 3.2.1 Release Notes

> **Version:** 3.2.1  
> **Platforms:** macOS (Apple Silicon `arm64` & Intel `x64`), Windows 10/11 (`x64`)  
> **Repository:** [Ukacha21/Notcha](https://github.com/Ukacha21/Notcha)

---

## 🍎 Apple Silicon (`arm64`) & Universal macOS Support

**Does the macOS released version support Apple Silicon?**
**Yes, 100% natively!**

- **Native `arm64` Architecture**: Notcha 3.2.1 includes a dedicated native Apple Silicon build (`Notcha-3.2.1-arm64.dmg` and `Notcha-3.2.1-arm64-mac.zip`) optimized specifically for Apple's M-series chips (M1, M2, M3, M4 and their Pro/Max/Ultra variants).
- **Universal Helper Binaries**: Both native companion binaries—`media-helper` (MediaRemote and CoreAudio controller) and `dock-helper` (Dock icon tracking and live window preview capture)—have been compiled as **Universal Mach-O binaries** containing both `arm64` and `x86_64` executable slices.
- **Zero Rosetta 2 Overhead**: Runs directly on bare metal without needing Apple's Rosetta 2 translation layer, ensuring maximum battery efficiency, instant startup, and zero CPU emulation overhead.
- **Intel Mac Support**: Intel-based Macs continue to be fully supported via native `x64` binaries (`Notcha-3.2.1.dmg` and `Notcha-3.2.1-mac.zip`).

---

## 🆕 What's New in Version 3.2.1

### 1. 🛠️ Finder & File Explorer Drag-and-Drop Fix (`webUtils.getPathForFile`)
- **Problem Fixed**: Previously, dragging and dropping files from macOS Finder or Windows File Explorer onto the dropzone failed to transfer files (only clicking the "Browse" button delivered files). This was caused by modern Chromium's security sandbox stripping the native `File.path` property on HTML5 drop events.
- **Solution**: Implemented Electron's `webUtils.getPathForFile(file)` API across the preload security bridge. Dragging files directly from Finder or Windows File Explorer now instantly resolves the absolute filesystem paths and dispatches transfers seamlessly across all windows (Send window, Receive window, top notch dropzone, and Mini-Transfer).

### 2. 🏷️ Accurate Device Naming & System Identification
- **Clean Format**: Replaced ambiguous or inaccurate device model guessing with crisp, reliable device tags:
  ```
  ${ip} | [System Logo / Platform]
  ```
  - **Android**: `192.168.1.45 | 🤖 Android`
  - **iPhone / iPad**: `192.168.1.78 |  iOS`
  - **Windows**: `192.168.1.92 | ⊞ Windows`
  - **macOS**: `192.168.1.155 |  macOS`
  - **Linux**: `192.168.1.210 | 🐧 Linux`
- Automatically updates paired device chips, network scan lists, and transfer history. Custom device nicknames set by users are preserved.

### 3. 📊 Real-Time Progress Tracking for Large File Transfers
- Added live chunk-based transfer progress tracking for both **Sending** (PC/Mac to phone) and **Receiving** (phone to PC/Mac).
- High-visibility progress cards show:
  - Real-time animated percentage bar.
  - Formatted byte progress counters (e.g., `45.2 MB / 1.4 GB`).
  - Active status indicators (`Preparing...`, `Sending...`, `Receiving...`, `Done`).
- Progress broadcasts in real-time across the desktop Send window, Receive window, Top Notch island, and the responsive Mobile Web Portal with rapid 1.2s polling.

---

## 🌟 Master Feature Catalog (All Features: Old & New)

### 🏝️ Dynamic Desktop Island (Notch)
- **Top-Center Floating Island**: Compact status pill resting elegantly at the top of your display, mirroring modern mobile dynamic islands.
- **Fluid Spring Animations**: Expands smoothly when clicked or hovered to reveal quick controls, audio visualizers, and notification badges.
- **Interactive Pill Indicators**: Centered clock that smoothly glides to make room for active music waves, focus timer countdowns, and DND status indicators.
- **Always-on-Top & Auto-Hide**: Option to keep the island pinned open while multitasking or let it collapse into a subtle hover bar.
- **Global Hotkey**: Press `Cmd/Ctrl + Alt + N` to toggle island visibility from anywhere.

### 🚀 Independent Floating Windows for File Transfers
- **Dedicated Send Window (`Notcha • Send Files`)**:
  - Movable, resizable dropzone station with an always-on-top pin.
  - Live paired device tray showing reachable phones and computers.
  - Multi-file queue tray with individual file badges and quick removal buttons.
  - 1-click send dispatch with live chunk progress feedback.
- **Dedicated Receive Window (`Notcha • Received Transfers`)**:
  - Independent incoming transfer manager with live incoming transfer alerts.
  - Auto-accept incoming files toggle.
  - Custom download folder picker with persistent settings.
  - Categorized gallery view (**All**, **Images**, **Videos**, **Documents**, **Archives**).
  - Search filter and 1-click "Reveal in Finder / Explorer" shortcuts.
- **Standalone Mini App**: Compact popup transfer utility that can be detached from the top notch and docked back at any time.

### 📱 Local Network Wi-Fi Transfer & QR Pairing
- **High-Speed Zero-Config Wi-Fi Server**: Built-in HTTP and WebSocket transfer engine running on local port `53317`.
- **Instant Mobile Pairing via ISO 18004 QR Code**:
  - 256x256 high-contrast QR code generated strictly adhering to ISO/IEC 18004 specifications with Level M Reed-Solomon Error Correction.
  - Instantly recognized by iPhone Camera, Samsung One UI Camera, Xiaomi HyperOS Camera, and Google Lens.
  - Padded modal view preventing edge clipping against rounded island borders.
- **No Mobile App Required**: Scanning opens a responsive, touch-friendly web portal in Safari or Chrome for immediate two-way file transfers without installing third-party apps.

### 🎚️ Multi-App Volume Mixer & CoreAudio Routing
- **Per-Application Volume Controls**: Independent volume sliders and mute toggles for active media applications (Spotify, Apple Music, Chrome, Brave, Safari, VLC, QuickTime, Telegram, Discord).
- **CoreAudio Output Device Switcher**: Switch master system audio output between AirPods, Bluetooth headphones, built-in MacBook speakers, USB DACs, and HDMI monitors right from the island.
- **Master Volume Synchronization**: Real-time bidirectional synchronization with hardware volume keys and macOS System Settings.
- **Drag Lock Protection**: Interactive dragging lock prevents background polling from overriding active slider adjustments.

### 🎵 Active Media Hub & Now Playing
- **Smart Active Player Detection**: Intelligently identifies whichever application is currently emitting audio.
- **Live Media Controls**: Play, pause, skip forward/backward, and scrub playback via native seek sliders.
- **Rich Track Metadata**: Displays album artwork, song title, and artist name with animated sound-wave visualizers.

### 🖼️ macOS Dock Icon Window Previews
- **Hover Window Previews**: Hovering your cursor over any app icon in the macOS Dock displays live window thumbnails anchored above the Dock.
- **Window Management**: Click any preview thumbnail to bring that window directly to the front, or close it via the preview card close button.
- **Dock Status Badges**: Amber badges indicate minimized windows with restore hints.

### ⏱️ Productivity Focus Timer & Alarms
- **Pomodoro Focus Timer**: Configurable work sessions and rest intervals with progress ring animations.
- **Audio Chimes & Notifications**: Audible chimes and visual island alerts upon session completion.

### 📋 Clipboard History Manager
- **Continuous Clipboard Tracking**: Automatically captures copied text snippets.
- **Instant Search**: Search through previous clips with real-time filtering.
- **1-Click Copy & Paste**: One-click re-copying with visual confirmation feedback.

### ⚡ Quick App Launcher & System Power Controls
- **Favorite App Shortcuts**: Instant launchers for Browser, Terminal, VS Code, Finder/Explorer, Music, Calculator, Notes, and Settings.
- **Custom URL/Command Launcher**: Type any URL (e.g., `github.com`) or file path to launch immediately.
- **System Power Actions**: Fast access to Lock Screen, Sleep, Restart, and Shut Down with safety confirmations.

---

## 🔧 Comprehensive Bug Fixes Log

| Category | Issue Description | Resolution |
| :--- | :--- | :--- |
| **File Transfer** | HTML5 drag-and-drop from Finder failed to provide file paths. | Implemented Electron `webUtils.getPathForFile` across all preload bridges. |
| **File Transfer** | Lack of progress feedback during multi-gigabyte transfers. | Added real-time chunked transfer tracking and live progress meters in all windows. |
| **Device Pairing** | Device model names were inaccurate or showed generic placeholders. | Formatted as `${ip} \| [System Logo]` (`🤖 Android`, ` iOS`, `⊞ Windows`, ` macOS`). |
| **QR Code** | QR code in mobile connect sheet was cut off at the bottom. | Added centered flex containers with 16px bottom padding and responsive SVG scaling. |
| **Dock Previews** | Window preview height clipped the bottom edges of preview cards. | Expanded preview height to 252px and adjusted card aspect ratio constraints. |
| **Permissions** | App froze on startup (`--:--`) waiting for accessibility permissions. | Hoisted all DOM bindings, added safe error fallbacks, and made permissions passive. |
| **Volume Mixer** | Volume slider snapped back to 80% after dragging. | Added debounce lock and interactive dragging mutex during CoreAudio sync polling. |
| **Media Player** | Phantom media tabs appeared for inactive background apps. | Replaced multi-tab carousel with smart single active player detection. |
| **macOS Native** | Helper binaries required Rosetta 2 on Apple Silicon Macs. | Compiled `media-helper` and `dock-helper` as Universal Mach-O binaries (`arm64` + `x86_64`). |
| **Packaging** | ASAR unpacking errors for Swift scripts. | Explicitly declared `asarUnpack` for all native helper binaries in `package.json`. |

---

## 📦 Release Assets & Downloads

### macOS
- **Apple Silicon (M1/M2/M3/M4)**:
  - **Installer:** [`Notcha-3.2.1-arm64.dmg`](https://github.com/Ukacha21/Notcha/releases/download/v3.2.1/Notcha-3.2.1-arm64.dmg)
  - **Portable Archive:** [`Notcha-3.2.1-arm64-mac.zip`](https://github.com/Ukacha21/Notcha/releases/download/v3.2.1/Notcha-3.2.1-arm64-mac.zip)
- **Intel (x64)**:
  - **Installer:** [`Notcha-3.2.1.dmg`](https://github.com/Ukacha21/Notcha/releases/download/v3.2.1/Notcha-3.2.1.dmg)
  - **Portable Archive:** [`Notcha-3.2.1-mac.zip`](https://github.com/Ukacha21/Notcha/releases/download/v3.2.1/Notcha-3.2.1-mac.zip)

### Windows
- **64-bit (x64)**:
  - **Installer:** [`Notcha Setup 3.2.1.exe`](https://github.com/Ukacha21/Notcha/releases/download/v3.2.1/Notcha.Setup.3.2.1.exe)
  - **Portable Archive:** [`Notcha-3.2.1-win.zip`](https://github.com/Ukacha21/Notcha/releases/download/v3.2.1/Notcha-3.2.1-win.zip)

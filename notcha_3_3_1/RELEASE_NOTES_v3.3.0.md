# Notcha 3.3.0 Release Notes

> **Version:** 3.3.0  
> **Platforms:** macOS (Apple Silicon `arm64` & Intel `x64`), Windows 10/11 (`x64`)  
> **Repository:** [Ukacha21/Notcha](https://github.com/Ukacha21/Notcha)

---

## 🍎 Apple Silicon (`arm64`) & Universal macOS Support

**Does the macOS released version support Apple Silicon?**
**Yes, 100% natively!**

- **Native `arm64` Architecture**: Notcha 3.3.0 includes dedicated native Apple Silicon packages (`Notcha-3.3.0-arm64.dmg` and `Notcha-3.3.0-arm64-mac.zip`) specifically compiled for Apple's M-series chips (M1, M2, M3, M4 and their Pro/Max/Ultra variants).
- **Universal Helper Binaries**: Both native helper binaries—`dock-helper` (Dock icon tracking and live window preview capture) and `media-helper` (MediaRemote and CoreAudio controller)—are compiled as **Universal Mach-O binaries** containing both `arm64` and `x86_64` executable slices.
- **Zero Rosetta 2 Overhead**: Runs directly on bare metal without needing Apple's Rosetta 2 translation layer, ensuring maximum battery efficiency, instant startup, and zero CPU emulation overhead.
- **Intel Mac Support**: Intel-based Macs continue to be fully supported via native `x64` packages (`Notcha-3.3.0.dmg` and `Notcha-3.3.0-mac.zip`).

---

## 🆕 What's New in Version 3.3.0

### 1. 🖼️ Dock Window Previews Completely Fixed & Overhauled
- **Live Window Screenshots Restored**:
  - **The Issue**: Previously, all background or partially occluded windows were falsely flagged as "minimized" because macOS sets `kCGWindowIsOnscreen = false` for any window not in the frontmost active plane. This caused `dock-helper` to skip thumbnail capture and show generic placeholders with false "Minimized" badges.
  - **The Fix**: `dock-helper` now directly captures the live window buffer via `CGWindowListCreateImage` using `kCGWindowListOptionIncludingWindow`. If an image buffer exists, the actual live screenshot is rendered across the card; only genuinely minimized windows without render buffers display the minimized badge.
- **100% Complete Preview Visibility & Zero Clipping**:
  - Expanded the preview popup height to **280px** with generous vertical and horizontal breathing room.
  - The frosted title bar (application icon, name, and window count badge) and bottom cards are now 100% visible with zero clipping and full box-shadow glow.
- **Multi-Orientation Dock Support (Bottom, Left, Right)**:
  - Added intelligent dock orientation detection. Regardless of whether your macOS Dock is positioned at the **Bottom**, **Left**, or **Right** of the display, the preview popup dynamically anchors to the inside edge with strict screen boundary clamping.
- **Unicode App Name Sanitization (WhatsApp, Localized Apps)**:
  - Cleaned invisible Unicode directional marks (e.g., `\u{200E}` Left-to-Right mark used by WhatsApp and localized apps) and filtered out background daemons, ensuring that hovering over any Dock icon triggers the preview instantly.
- **Reliable 1-Click Window Focus & Minimized Restore**:
  - Clicking any preview thumbnail activates the application with `options: .activateIgnoringOtherApps`.
  - Minimized windows are programmatically un-minimized via `kAXMinimizedAttribute = false` and raised to the front (`kAXRaiseAction`).
- **No Discarded Windows (Clean Title Fallbacks)**:
  - If a window has no title in CG/AX (such as Chrome tabs, Finder folders, or blank documents), it is assigned a clean fallback title (`[App Name] Window` / `[App Name] (Window N)`) rather than being discarded.

---

## 🌟 Master Feature Catalog (All Features: Old & New)

### 🏝️ Dynamic Desktop Island (Notch)
- **Top-Center Floating Island**: Sleek status pill hanging elegantly at the top of your display, mirroring modern mobile dynamic islands.
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
- **Hover Window Previews**: Hovering your cursor over any app icon in the macOS Dock displays live window thumbnails anchored directly above the Dock.
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

| Version | Category | Issue Description | Resolution |
| :--- | :--- | :--- | :--- |
| **3.3.0** | **Dock Previews** | Background windows were falsely marked minimized with no screenshots. | Captured live image buffers directly with `kCGWindowListOptionIncludingWindow`; verified real images. |
| **3.3.0** | **Dock Previews** | Preview window was clipped vertically, cutting off title bar and icon. | Expanded popup bounds to 280px with centered breathing room and multi-orientation dock positioning. |
| **3.3.0** | **Dock Previews** | Hovering over WhatsApp and localized apps did not trigger previews. | Sanitized Unicode directional marks (`\u{200E}`) and matched against regular activation policies. |
| **3.3.0** | **Dock Previews** | Windows with empty titles were discarded entirely. | Added clean fallback titles (`[App Name] Window`) so all windows are previewed. |
| **3.3.0** | **Dock Previews** | Clicking minimized window thumbnails failed to restore windows. | Programmatically un-minimized via `kAXMinimizedAttribute = false` and activated with `.activateIgnoringOtherApps`. |
| **3.2.1** | **File Transfer** | HTML5 drag-and-drop from Finder failed to provide file paths. | Implemented Electron `webUtils.getPathForFile` across all preload bridges. |
| **3.2.1** | **File Transfer** | Lack of progress feedback during multi-gigabyte transfers. | Added real-time chunked transfer tracking and live progress meters in all windows. |
| **3.2.1** | **Device Pairing** | Device model names were inaccurate or showed generic placeholders. | Formatted as `${ip} \| [System Logo]` (`🤖 Android`, ` iOS`, `⊞ Windows`, ` macOS`). |
| **3.2.1** | **Apple Silicon** | Swift helper binaries were x86_64 only, requiring Rosetta 2. | Recompiled `media-helper` and `dock-helper` as Universal Mach-O binaries (`arm64` + `x86_64`). |
| **3.0.1** | **QR Code** | QR code in mobile connect sheet was cut off at the bottom. | Added centered flex containers with 16px bottom padding and responsive SVG scaling. |
| **3.0.1** | **Permissions** | App froze on startup (`--:--`) waiting for accessibility permissions. | Hoisted all DOM bindings, added safe error fallbacks, and made permissions passive. |
| **1.4.1** | **Volume Mixer** | Volume slider snapped back to 80% after dragging. | Added debounce lock and interactive dragging mutex during CoreAudio sync polling. |
| **1.4.0** | **Media Player** | Phantom media tabs appeared for inactive background apps. | Replaced multi-tab carousel with smart single active player detection. |
| **1.3.2** | **App Packaging** | ASAR unpacking errors for Swift scripts. | Explicitly declared `asarUnpack` for all native helper binaries in `package.json`. |

---

## 📦 Downloads & Installation

### macOS
- **Apple Silicon (M1/M2/M3/M4)**:
  - **Installer:** [`Notcha-3.3.0-arm64.dmg`](https://github.com/Ukacha21/Notcha/releases/download/v3.3.0/Notcha-3.3.0-arm64.dmg)
  - **Portable Archive:** [`Notcha-3.3.0-arm64-mac.zip`](https://github.com/Ukacha21/Notcha/releases/download/v3.3.0/Notcha-3.3.0-arm64-mac.zip)
- **Intel (x64)**:
  - **Installer:** [`Notcha-3.3.0.dmg`](https://github.com/Ukacha21/Notcha/releases/download/v3.3.0/Notcha-3.3.0.dmg)
  - **Portable Archive:** [`Notcha-3.3.0-mac.zip`](https://github.com/Ukacha21/Notcha/releases/download/v3.3.0/Notcha-3.3.0-mac.zip)

### Windows (10 & 11, 64-bit)
- **NSIS Installer:** [`Notcha Setup 3.3.0.exe`](https://github.com/Ukacha21/Notcha/releases/download/v3.3.0/Notcha.Setup.3.3.0.exe)
- **Portable Archive:** [`Notcha-3.3.0-win.zip`](https://github.com/Ukacha21/Notcha/releases/download/v3.3.0/Notcha-3.3.0-win.zip)

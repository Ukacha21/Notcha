# Notcha 3.0.1 Implementation Plan & Progress Tracker

> Feature additions based on the Intel Mac roadmap:
> - 🎚️ **Volume mixer, for different apps**
> - 🎧 **Audio routing**
> - 🖼️ **Hover on dock icons for window previews**
> - 🗂️ **Cross-platform file transfer & past transfers gallery** (Mac, Windows, iOS, Android)
> - 📱 **v3.0.1 QR Code UI & Dock Preview layout fixes**

---

## 1. Volume Mixer (For Different Apps)
- [x] **Media Player software volume controls** (Spotify, Apple Music, VLC, QuickTime via AppleScript & MediaRemote)
- [x] **Native CoreAudio system master volume sync** (instant CoreAudio query and volume adjustment via `media-helper`)
- [x] **Volume drag lock & debounce** (prevents background polling from overriding active slider dragging)
- [x] **Multi-App Volume Mixer UI** inside Notcha island:
  - Accessible via "Mixer" button on active player and empty media states
  - Displays Master System Output volume alongside all active applications (Spotify, Apple Music, VLC, QuickTime, Chrome, Brave, Safari, Arc, Telegram, Discord)
  - Dedicated range sliders with real-time percentage indicators
  - Independent mute/unmute buttons for each application
- [x] **Native AppleScript & CoreAudio dispatch engine**:
  - `get-app-volumes`: dynamically detects running audio-capable apps and queries current levels
  - `set-app-volume`: sets individual application volume levels independently
  - `toggle-app-mute`: toggles individual application mute states

---

## 2. Audio Routing
- [x] **Native CoreAudio output device query** in `media-helper.swift`:
  - List all available output devices (Built-in Speakers, Headphones, AirPods/Bluetooth, External HDMI/DisplayPort, USB DACs)
  - Detect current default output device
- [x] **Native CoreAudio output device switching** (`kAudioHardwarePropertyDefaultOutputDevice`)
- [x] **Audio device polling & tab sync** (automatically refreshes when switching to Media tab and periodic interval)
- [x] **Audio routing selector UI** in the Media tab (clean output device pill in active player header & empty state, plus animated selection sheet with transport icons and active checkmarks)

---

## 3. Cross-Platform File Transfer, Albums Gallery & Mini App (Mac, Windows, iOS, Android)
- [x] **High-Speed HTTP Streaming Engine** (`transfer-server.js`):
  - Local Wi-Fi transfer server on port `53317` with automatic port fallback
  - Streaming file transfers with zero file size limits (`fs.createReadStream` / `fs.createWriteStream`)
  - Auto-created downloads directory at `~/Downloads/Notcha Transfers`
  - History persistence in JSON format with automatic timestamping and file metadata
- [x] **Zero-Install Mobile Web Portal** (iOS Safari & Android Chrome):
  - Pure JavaScript SVG QR code generator (`qr-generator.js`, QR Model 2 Version 4-M with Reed-Solomon ECC, zero external npm dependencies)
  - Mobile web app served directly to connecting phones over Wi-Fi
  - Mobile upload portal with camera/gallery photo picker and chunked binary upload
  - Mobile download portal showing active files shared from Mac
- [x] **Top Notch "Transfer" Tab**:
  - Tab button named **"Transfer"** in Notcha island header
  - Server status indicator with local Wi-Fi IP / URL
  - Drag-and-drop drop zone on the island (also supports clicking to open native macOS file picker)
  - Active shared files notice with "Clear" action
  - 1-click QR pair overlay sheet
  - Direct Finder folder shortcut button
- [x] **Optional Floating Mini App Window** (`mini-transfer.html` & `mini-transfer.js`):
  - Frameless, translucent, draggable floating mini window (360x480)
  - Provides users the choice to either drag files to the top notch OR open the floating mini app
  - Contains drop zone, QR code button, active shared indicator, recent transfers list, and "Dock Notch" return button
- [x] **Past Transfers Gallery with Albums**:
  - Filter by album categories: **All**, **Photos** (images), **Videos**, **Docs**, and **Archives**
  - Displays transfer direction (📥 Received / 📤 Sent), file size, timestamp, and device source
  - 1-click "Show in Finder" action

---

## 4. Hover on Dock Icons for Window Previews
- [x] **Native Swift Dock Tracker** (`dock-helper.swift` -> `dock-helper`):
  - Track global mouse coordinates via `NSEvent.mouseLocation` every 80ms
  - Real-time hit-testing on the macOS Dock process (`com.apple.dock`) via `AXUIElementCopyElementAtPosition`
  - Identify hovered `AXDockItem`, extract application name, and resolve exact screen bounding box `(x, y, w, h)`
  - Match running `NSRunningApplication` and extract high-resolution app icon (base64 PNG)
- [x] **Window Snapshot Capture & Window Management**:
  - Query window IDs, titles, positions, and bounds for the target PID via `CGWindowListCopyWindowInfo` and `kAXWindowsAttribute`
  - High-performance JPEG window snapshot capture downscaled to ~260px wide
  - Window activation / raise handler (`AXUIElementPerformAction` `kAXRaiseAction` + `app.activate()`)
  - Window close handler (`kAXCloseButtonAttribute` + `kAXPressAction`)
- [x] **Floating Preview Window** (`dock-preview.html` & `dock-preview.js`):
  - Non-activating, transparent floating popup anchored directly above the hovered Dock icon
  - Smooth pop-in animation, frosted-glass background (`backdrop-filter: blur(36px)`)
  - Header with app icon, app name, and window count pill badge
  - Side-by-side cards with live window thumbnails, titles, minimized badge, and hover close button
  - Click any card to instantly bring that window to the front
  - Mouse-enter / mouse-leave debounce logic so user can comfortably move mouse into the preview card
- [x] **Permission Prompts on Launch**:
  - Automatic prompt for Accessibility permission if not yet granted
  - Automatic prompt for Screen Recording permission if not yet granted

---

## Implementation Sequence
1. **Milestone 1:** System Audio Routing (Output Device Selector in Media Panel) ✅ *Completed*
2. **Milestone 2:** Cross-Platform File Transfer Hub & QR Mobile Web Portal + Gallery + Floating Mini App ✅ *Completed*
3. **Milestone 3:** Dock Icon Hover Window Previews (Swift Accessibility + Window Snapshots) ✅ *Completed*
4. **Milestone 4:** Multi-App Volume Mixer (Per-App Sliders for Media & Running Apps) ✅ *Completed*
5. **Release v3.0.0:** Build & Release v3.0.0 (macOS & Windows Installers) ✅ *Completed*
6. **Release v3.0.1:** Hotfix QR Code Scaling, Dock Preview Bounds & Startup Stability ✅ *Completed*
   - [x] Fix QR code SVG scaling and container constraints so it is 100% visible inside the Transfer Connect Mobile Device sheet.
   - [x] Adjust Dock preview popup height from 210px to 252px to prevent title bar clipping.
   - [x] Fix CoreGraphics window capture option and add amber "Minimized in Dock" badge for minimized windows.
   - [x] Hoist renderer element declarations and silence intrusive startup accessibility prompts.

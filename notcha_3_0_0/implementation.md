# Notcha 3.0.0 Implementation Plan & Progress Tracker

> Feature additions based on the Intel Mac roadmap:
> - 🎚️ **Volume mixer, for different apps**
> - 🎧 **Audio routing**
> - 🖼️ **Hover on dock icons for window previews**
> - 🗂️ **Cross-platform file transfer & past transfers gallery** (Mac, Windows, iOS, Android)

---

## 1. Volume Mixer (For Different Apps)
- [x] **Media Player software volume controls** (Spotify, Apple Music, VLC via AppleScript & MediaRemote)
- [x] **Native CoreAudio system master volume sync** (instant CoreAudio query and volume adjustment via `media-helper`)
- [x] **Volume drag lock & debounce** (prevents background polling from overriding active slider dragging)
- [ ] **Multi-App Volume Mixer UI** inside Notcha island (collapsible sliders for currently detected audio sessions)
- [ ] **CoreAudio Virtual HAL / Loopback Driver integration** (required on macOS to intercept & scale volume for arbitrary third-party apps like Chrome, Discord, games without individual AppleScript support)
- [ ] **Windows per-process volume control** via `IAudioEndpointVolume` / `ISimpleAudioVolume` (native Windows API support)

---

## 2. Audio Routing
- [x] **Native CoreAudio output device query** in `media-helper.swift`:
  - List all available output devices (Built-in Speakers, Headphones, AirPods/Bluetooth, External HDMI/DisplayPort, USB DACs)
  - Detect current default output device
- [x] **Native CoreAudio output device switching** (`kAudioHardwarePropertyDefaultOutputDevice`)
- [x] **Audio device polling & tab sync** (automatically refreshes when switching to Media tab and periodic interval)
- [x] **Audio routing selector UI** in the Media tab (clean output device pill in active player header & empty state, plus animated selection sheet with transport icons and active checkmarks)
- [ ] **Per-app audio stream routing** (relies on HAL audio driver engine)

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
- [ ] **Native Swift Dock Tracker** (`dock-tracker.swift`):
  - Request & verify macOS **Accessibility** (`AXUIElement`) and **Screen Recording** permissions
  - Track global mouse coordinates when entering the macOS Dock bounds (`com.apple.dock`)
  - Identify hovered Dock icon and resolve target app's PID / bundle identifier
- [ ] **Window Snapshot Capture**:
  - Query window IDs for target PID via `CGWindowListCopyWindowInfo`
  - Capture window thumbnail preview bitmaps (`CGWindowListCreateImage` / `ScreenCaptureKit`)
- [ ] **Floating Preview Window**:
  - Non-activating, transparent preview popup anchored directly above the hovered Dock icon
  - Smooth hover fade-in/fade-out animations
  - Click thumbnail to activate / raise target window

---

## Implementation Sequence
1. **Milestone 1:** System Audio Routing (Output Device Selector in Media Panel) ✅ *Completed*
2. **Milestone 2:** Cross-Platform File Transfer Hub & QR Mobile Web Portal + Gallery + Floating Mini App ✅ *Completed*
3. **Milestone 3:** Dock Icon Hover Window Previews (Swift Accessibility + ScreenCapture) ⬅ *Next*
4. **Milestone 4:** Multi-App Volume Mixer (Media apps first, HAL driver evaluation)

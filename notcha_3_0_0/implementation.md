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
- [ ] **Native CoreAudio output device query** in `media-helper.swift`:
  - List all available output devices (Built-in Speakers, Headphones, AirPods/Bluetooth, External HDMI/DisplayPort, USB DACs)
  - Detect current default output device
- [ ] **Native CoreAudio output device switching** (`kAudioHardwarePropertyDefaultOutputDevice`)
- [ ] **Audio device hotplug listener** (`kAudioHardwarePropertyDevices` listener to auto-update when AirPods connect/disconnect)
- [ ] **Audio routing selector UI** in the Media tab (clean dropdown or pill chips to switch active output device instantly)
- [ ] **Per-app audio stream routing** (relies on HAL audio driver engine)

---

## 3. Hover on Dock Icons for Window Previews
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

## 4. Cross-Platform File Transfer & Gallery (Mac, Windows, iOS, Android)
- [ ] **Local Discovery & Transfer Engine**:
  - Local **mDNS / Bonjour** service (`_notcha-share._tcp`) for zero-config discovery across devices on the same Wi-Fi
  - Local HTTP + WebSocket transfer server on Notcha (secure PIN / paired authorization)
  - Chunked file streaming for high-speed local transfer without file size limits
- [ ] **Zero-Install Mobile Web Portal** (iOS & Android):
  - In-island QR code generator (`http://<mac-ip>:<port>`)
  - Mobile web UI for Safari / Chrome to select photos/files and send directly to Notcha (and download files sent from Mac) without requiring an App Store download
- [ ] **Dynamic Island File Transfer Tab**:
  - Drag-and-drop file drop zone on the island
  - Device pairing list ("This Device", "Discovered Devices")
  - Progress ring / transfer speed indicator
- [ ] **Past Transfers Gallery**:
  - Persistent SQLite / JSON metadata store of transferred files
  - Album categories (Images, Videos, Documents, Archives)
  - Grid preview thumbnails with 1-click reveal in Finder/Explorer

---

## Implementation Sequence
1. **Milestone 1:** System Audio Routing (Output Device Selector in Media Panel) ⬅ *Starting here*
2. **Milestone 2:** Cross-Platform File Transfer Hub & QR Mobile Web Portal + Gallery
3. **Milestone 3:** Dock Icon Hover Window Previews (Swift Accessibility + ScreenCapture)
4. **Milestone 4:** Multi-App Volume Mixer (Media apps first, HAL driver evaluation)

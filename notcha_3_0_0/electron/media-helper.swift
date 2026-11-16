import Foundation
import AppKit
import CoreAudio

// MARK: - Private Framework Typedefs
typealias MRMediaRemoteSendCommandFn = @convention(c) (Int, AnyObject?) -> Bool
typealias MRMediaRemoteSetElapsedTimeFn = @convention(c) (Double) -> Void
typealias MRGetClientFn = @convention(c) (DispatchQueue, @escaping (AnyObject) -> Void) -> Void
typealias MRGetInfoFn = @convention(c) (DispatchQueue, @escaping ([String: Any]) -> Void) -> Void
typealias SACLockScreenImmediateFn = @convention(c) () -> Void

let mrHandle = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_NOW)
let loginHandle = dlopen("/System/Library/PrivateFrameworks/login.framework/Versions/Current/login", RTLD_NOW)

// MARK: - CoreAudio Volume Control
func getSystemOutputVolume() -> Int {
    var defaultOutputDeviceID = AudioDeviceID(0)
    var defaultOutputDeviceIDSize = UInt32(MemoryLayout.size(ofValue: defaultOutputDeviceID))

    var getDefaultOutputDevicePropertyAddress = AudioObjectPropertyAddress(
        mSelector: AudioObjectPropertySelector(kAudioHardwarePropertyDefaultOutputDevice),
        mScope: AudioObjectPropertyScope(kAudioObjectPropertyScopeGlobal),
        mElement: AudioObjectPropertyElement(kAudioObjectPropertyElementMain)
    )

    let status1 = AudioObjectGetPropertyData(
        AudioObjectID(kAudioObjectSystemObject),
        &getDefaultOutputDevicePropertyAddress,
        0,
        nil,
        &defaultOutputDeviceIDSize,
        &defaultOutputDeviceID
    )

    guard status1 == noErr else { return 50 }

    var volume = Float32(0.0)
    var volumeSize = UInt32(MemoryLayout.size(ofValue: volume))
    var volumePropertyAddress = AudioObjectPropertyAddress(
        mSelector: AudioObjectPropertySelector(kAudioDevicePropertyVolumeScalar),
        mScope: AudioObjectPropertyScope(kAudioDevicePropertyScopeOutput),
        mElement: AudioObjectPropertyElement(kAudioObjectPropertyElementMain)
    )

    let status2 = AudioObjectGetPropertyData(
        defaultOutputDeviceID,
        &volumePropertyAddress,
        0,
        nil,
        &volumeSize,
        &volume
    )
    if status2 == noErr {
        return Int(round(volume * 100))
    }
    return 50
}

func setSystemOutputVolume(_ vol: Int) -> Bool {
    var defaultOutputDeviceID = AudioDeviceID(0)
    var defaultOutputDeviceIDSize = UInt32(MemoryLayout.size(ofValue: defaultOutputDeviceID))

    var getDefaultOutputDevicePropertyAddress = AudioObjectPropertyAddress(
        mSelector: AudioObjectPropertySelector(kAudioHardwarePropertyDefaultOutputDevice),
        mScope: AudioObjectPropertyScope(kAudioObjectPropertyScopeGlobal),
        mElement: AudioObjectPropertyElement(kAudioObjectPropertyElementMain)
    )

    let status1 = AudioObjectGetPropertyData(
        AudioObjectID(kAudioObjectSystemObject),
        &getDefaultOutputDevicePropertyAddress,
        0,
        nil,
        &defaultOutputDeviceIDSize,
        &defaultOutputDeviceID
    )

    guard status1 == noErr else { return false }

    var volume = Float32(max(0, min(100, vol))) / 100.0
    let volumeSize = UInt32(MemoryLayout.size(ofValue: volume))
    var volumePropertyAddress = AudioObjectPropertyAddress(
        mSelector: AudioObjectPropertySelector(kAudioDevicePropertyVolumeScalar),
        mScope: AudioObjectPropertyScope(kAudioDevicePropertyScopeOutput),
        mElement: AudioObjectPropertyElement(kAudioObjectPropertyElementMain)
    )

    let status2 = AudioObjectSetPropertyData(
        defaultOutputDeviceID,
        &volumePropertyAddress,
        0,
        nil,
        volumeSize,
        &volume
    )
    return status2 == noErr
}

// MARK: - CoreAudio Output Device Routing
struct AudioOutputDevice: Codable {
    let id: UInt32
    let uid: String
    let name: String
    let transport: String
    let isDefault: Bool
}

func getAudioOutputDevices() -> [AudioOutputDevice] {
    var defaultOutputDeviceID = AudioDeviceID(0)
    var defaultSize = UInt32(MemoryLayout<AudioDeviceID>.size)
    var defaultAddress = AudioObjectPropertyAddress(
        mSelector: AudioObjectPropertySelector(kAudioHardwarePropertyDefaultOutputDevice),
        mScope: AudioObjectPropertyScope(kAudioObjectPropertyScopeGlobal),
        mElement: AudioObjectPropertyElement(kAudioObjectPropertyElementMain)
    )
    _ = AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &defaultAddress, 0, nil, &defaultSize, &defaultOutputDeviceID)

    var propAddress = AudioObjectPropertyAddress(
        mSelector: AudioObjectPropertySelector(kAudioHardwarePropertyDevices),
        mScope: AudioObjectPropertyScope(kAudioObjectPropertyScopeGlobal),
        mElement: AudioObjectPropertyElement(kAudioObjectPropertyElementMain)
    )

    var dataSize: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &propAddress, 0, nil, &dataSize) == noErr, dataSize > 0 else {
        return []
    }

    let deviceCount = Int(dataSize) / MemoryLayout<AudioDeviceID>.size
    var deviceIDs = [AudioDeviceID](repeating: 0, count: deviceCount)
    guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &propAddress, 0, nil, &dataSize, &deviceIDs) == noErr else {
        return []
    }

    var result: [AudioOutputDevice] = []

    for devID in deviceIDs {
        var streamAddress = AudioObjectPropertyAddress(
            mSelector: AudioObjectPropertySelector(kAudioDevicePropertyStreamConfiguration),
            mScope: AudioObjectPropertyScope(kAudioDevicePropertyScopeOutput),
            mElement: AudioObjectPropertyElement(kAudioObjectPropertyElementMain)
        )
        var streamSize: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(devID, &streamAddress, 0, nil, &streamSize) == noErr, streamSize > 0 else { continue }

        let rawBuffer = UnsafeMutableRawPointer.allocate(byteCount: Int(streamSize), alignment: MemoryLayout<AudioBufferList>.alignment)
        let getStreamStatus = AudioObjectGetPropertyData(devID, &streamAddress, 0, nil, &streamSize, rawBuffer)
        if getStreamStatus != noErr {
            rawBuffer.deallocate()
            continue
        }
        let bufferList = rawBuffer.assumingMemoryBound(to: AudioBufferList.self).pointee
        var totalChannels: UInt32 = 0
        withUnsafePointer(to: bufferList.mBuffers) { ptr in
            for i in 0..<Int(bufferList.mNumberBuffers) {
                totalChannels += ptr.advanced(by: i).pointee.mNumberChannels
            }
        }
        rawBuffer.deallocate()
        guard totalChannels > 0 else { continue }

        var unmanagedName: Unmanaged<CFString>? = nil
        var nameSize = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        var nameAddress = AudioObjectPropertyAddress(
            mSelector: AudioObjectPropertySelector(kAudioObjectPropertyName),
            mScope: AudioObjectPropertyScope(kAudioObjectPropertyScopeGlobal),
            mElement: AudioObjectPropertyElement(kAudioObjectPropertyElementMain)
        )
        var deviceName = "Audio Output"
        if AudioObjectGetPropertyData(devID, &nameAddress, 0, nil, &nameSize, &unmanagedName) == noErr,
           let str = unmanagedName?.takeRetainedValue() as String? {
            deviceName = str
        }

        var unmanagedUID: Unmanaged<CFString>? = nil
        var uidSize = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        var uidAddress = AudioObjectPropertyAddress(
            mSelector: AudioObjectPropertySelector(kAudioDevicePropertyDeviceUID),
            mScope: AudioObjectPropertyScope(kAudioObjectPropertyScopeGlobal),
            mElement: AudioObjectPropertyElement(kAudioObjectPropertyElementMain)
        )
        var deviceUID = String(devID)
        if AudioObjectGetPropertyData(devID, &uidAddress, 0, nil, &uidSize, &unmanagedUID) == noErr,
           let str = unmanagedUID?.takeRetainedValue() as String? {
            deviceUID = str
        }

        var transportAddress = AudioObjectPropertyAddress(
            mSelector: AudioObjectPropertySelector(kAudioDevicePropertyTransportType),
            mScope: AudioObjectPropertyScope(kAudioObjectPropertyScopeGlobal),
            mElement: AudioObjectPropertyElement(kAudioObjectPropertyElementMain)
        )
        var transportType: UInt32 = 0
        var transportSize = UInt32(MemoryLayout<UInt32>.size)
        _ = AudioObjectGetPropertyData(devID, &transportAddress, 0, nil, &transportSize, &transportType)

        var kind = "speaker"
        let lowerName = deviceName.lowercased()
        if transportType == kAudioDeviceTransportTypeBluetooth || transportType == kAudioDeviceTransportTypeBluetoothLE || lowerName.contains("airpod") || lowerName.contains("beats") || lowerName.contains("bluetooth") {
            kind = "bluetooth"
        } else if transportType == kAudioDeviceTransportTypeUSB || lowerName.contains("usb") {
            kind = "usb"
        } else if transportType == kAudioDeviceTransportTypeDisplayPort || transportType == kAudioDeviceTransportTypeHDMI || lowerName.contains("display") || lowerName.contains("hdmi") || lowerName.contains("tv") {
            kind = "display"
        } else if transportType == kAudioDeviceTransportTypeAirPlay {
            kind = "airplay"
        } else if lowerName.contains("headphone") || lowerName.contains("earphone") {
            kind = "headphones"
        } else if transportType == kAudioDeviceTransportTypeBuiltIn {
            kind = "builtin"
        }

        let isDefault = (devID == defaultOutputDeviceID)
        result.append(AudioOutputDevice(id: UInt32(devID), uid: deviceUID, name: deviceName, transport: kind, isDefault: isDefault))
    }

    return result
}

func setDefaultAudioOutputDevice(idOrUID: String) -> Bool {
    var targetID: AudioDeviceID? = nil
    if let numeric = UInt32(idOrUID) {
        targetID = numeric
    } else {
        let devices = getAudioOutputDevices()
        if let match = devices.first(where: { $0.uid == idOrUID || $0.name == idOrUID }) {
            targetID = match.id
        }
    }

    guard var devID = targetID else { return false }
    let size = UInt32(MemoryLayout<AudioDeviceID>.size)
    var address = AudioObjectPropertyAddress(
        mSelector: AudioObjectPropertySelector(kAudioHardwarePropertyDefaultOutputDevice),
        mScope: AudioObjectPropertyScope(kAudioObjectPropertyScopeGlobal),
        mElement: AudioObjectPropertyElement(kAudioObjectPropertyElementMain)
    )
    let s1 = AudioObjectSetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, size, &devID)

    var sysAddress = AudioObjectPropertyAddress(
        mSelector: AudioObjectPropertySelector(kAudioHardwarePropertyDefaultSystemOutputDevice),
        mScope: AudioObjectPropertyScope(kAudioObjectPropertyScopeGlobal),
        mElement: AudioObjectPropertyElement(kAudioObjectPropertyElementMain)
    )
    _ = AudioObjectSetPropertyData(AudioObjectID(kAudioObjectSystemObject), &sysAddress, 0, nil, size, &devID)

    return s1 == noErr
}

// MARK: - Lock Screen
func lockScreen() {
    if let login = loginHandle, let sym = dlsym(login, "SACLockScreenImmediate") {
        let lockFn = unsafeBitCast(sym, to: SACLockScreenImmediateFn.self)
        lockFn()
        print("Locked screen successfully")
        fflush(stdout)
    } else {
        let task = Process()
        task.launchPath = "/usr/bin/pmset"
        task.arguments = ["displaysleepnow"]
        task.launch()
        print("Fallback to displaysleepnow")
        fflush(stdout)
    }
}

// MARK: - Media Remote Commands
func sendMediaCommand(_ cmd: String, value: Double? = nil) {
    if cmd == "seek", let sec = value {
        var success = false
        if let mr = mrHandle {
            if let symCmd = dlsym(mr, "MRMediaRemoteSendCommand") {
                let sendCmd = unsafeBitCast(symCmd, to: MRMediaRemoteSendCommandFn.self)
                let options: [String: Any] = [
                    "kMRMediaRemoteOptionPlaybackPosition": sec,
                    "playbackPosition": sec
                ]
                success = sendCmd(24, options as NSDictionary)
            }
            if let symSeek = dlsym(mr, "MRMediaRemoteSetElapsedTime") {
                let setTime = unsafeBitCast(symSeek, to: MRMediaRemoteSetElapsedTimeFn.self)
                setTime(sec)
            }
        }
        print("Seeked to \(sec) (success: \(success))")
        fflush(stdout)
        return
    }

    var cmdId: Int? = nil
    if cmd == "play" { cmdId = 0 }
    else if cmd == "pause" { cmdId = 1 }
    else if cmd == "playpause" { cmdId = 2 }
    else if cmd == "stop" { cmdId = 3 }
    else if cmd == "next" { cmdId = 4 }
    else if cmd == "prev" { cmdId = 5 }

    var mrSucceeded = false
    if let cid = cmdId, let mr = mrHandle, let symCmd = dlsym(mr, "MRMediaRemoteSendCommand") {
        let sendCmd = unsafeBitCast(symCmd, to: MRMediaRemoteSendCommandFn.self)
        mrSucceeded = sendCmd(cid, nil)
    }

    // Secondary fallback: dispatch HID media key event
    var keyCode: Int? = nil
    if cmd == "playpause" { keyCode = 16 }
    else if cmd == "next" { keyCode = 19 }
    else if cmd == "prev" { keyCode = 20 }

    if let kc = keyCode {
        let down = NSEvent.otherEvent(
            with: .systemDefined,
            location: .zero,
            modifierFlags: NSEvent.ModifierFlags(rawValue: 0xa00),
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            subtype: 8,
            data1: (kc << 16) | (0xa << 8),
            data2: -1
        )
        down?.cgEvent?.post(tap: CGEventTapLocation.cghidEventTap)

        let up = NSEvent.otherEvent(
            with: .systemDefined,
            location: .zero,
            modifierFlags: NSEvent.ModifierFlags(rawValue: 0xb00),
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            subtype: 8,
            data1: (kc << 16) | (0xb << 8),
            data2: -1
        )
        up?.cgEvent?.post(tap: CGEventTapLocation.cghidEventTap)
    }

    print("Media command \(cmd) executed (mr: \(mrSucceeded))")
    fflush(stdout)
}

// MARK: - Query Now Playing
func getNowPlaying() {
    guard let mr = mrHandle else {
        print("{}")
        fflush(stdout)
        return
    }

    guard let symClient = dlsym(mr, "MRMediaRemoteGetNowPlayingClient"),
          let symInfo = dlsym(mr, "MRMediaRemoteGetNowPlayingInfo") else {
        print("{}")
        fflush(stdout)
        return
    }

    let getClient = unsafeBitCast(symClient, to: MRGetClientFn.self)
    let getInfo = unsafeBitCast(symInfo, to: MRGetInfoFn.self)

    var clientName = "System Media"
    var clientBundle = ""
    var clientIcon = "system"
    var done = false

    getClient(DispatchQueue.main) { client in
        let desc = String(describing: client)
        if let openParen = desc.firstIndex(of: "("), let closeParen = desc.lastIndex(of: ")") {
            clientName = String(desc[desc.index(after: openParen)..<closeParen])
            clientBundle = String(desc[..<openParen]).trimmingCharacters(in: .whitespaces)
        } else {
            clientName = desc
        }

        let lowerClient = clientName.lowercased()
        let lowerBundle = clientBundle.lowercased()
        if lowerClient.contains("music") || lowerBundle.contains("music") {
            clientIcon = "apple"
        } else if lowerClient.contains("spotify") || lowerBundle.contains("spotify") {
            clientIcon = "spotify"
        } else if lowerClient.contains("vlc") || lowerBundle.contains("vlc") {
            clientIcon = "vlc"
        } else if lowerClient.contains("telegram") || lowerBundle.contains("telegram") {
            clientIcon = "telegram"
        } else if lowerClient.contains("chrome") || lowerClient.contains("brave") || lowerClient.contains("safari") || lowerClient.contains("edge") || lowerClient.contains("firefox") || lowerClient.contains("youtube") {
            clientIcon = "youtube"
        } else if lowerClient.contains("aimp") || lowerBundle.contains("aimp") {
            clientIcon = "aimp"
        }

        getInfo(DispatchQueue.main) { dict in
            let title = dict["kMRMediaRemoteNowPlayingInfoTitle"] as? String ?? ""
            let artist = dict["kMRMediaRemoteNowPlayingInfoArtist"] as? String ?? ""
            let duration = dict["kMRMediaRemoteNowPlayingInfoDuration"] as? Double ?? 0
            let elapsed = dict["kMRMediaRemoteNowPlayingInfoElapsedTime"] as? Double ?? 0
            let rate = dict["kMRMediaRemoteNowPlayingInfoPlaybackRate"] as? Double ?? 0

            let isPlaying = rate > 0
            var cleanTitle = title
            if cleanTitle.isEmpty {
                cleanTitle = isPlaying ? "Active Audio Playback" : "Media Player"
            }
            var cleanArtist = artist
            if cleanArtist.isEmpty {
                cleanArtist = clientName
            }

            let json: [String: Any] = [
                "client": clientName,
                "bundle": clientBundle,
                "icon": clientIcon,
                "title": cleanTitle,
                "artist": cleanArtist,
                "duration": duration > 0 ? duration : 300,
                "elapsed": elapsed >= 0 ? elapsed : 0,
                "isPlaying": isPlaying,
                "state": isPlaying ? "playing" : "paused",
                "volume": getSystemOutputVolume()
            ]

            if let data = try? JSONSerialization.data(withJSONObject: json, options: []),
               let str = String(data: data, encoding: .utf8) {
                print(str)
                fflush(stdout)
            } else {
                print("{}")
                fflush(stdout)
            }
            done = true
        }
    }

    let start = Date()
    while !done && Date().timeIntervalSince(start) < 0.8 {
        RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.03))
    }

    if !done {
        print("{}")
        fflush(stdout)
    }
}

// MARK: - Main Entry Point
let args = CommandLine.arguments
if args.count > 1 {
    let cmd = args[1]
    if cmd == "lock" {
        lockScreen()
    } else if cmd == "getvolume" {
        print(getSystemOutputVolume())
        fflush(stdout)
    } else if cmd == "volume" || cmd == "setvolume" {
        let v = args.count > 2 ? Int(args[2]) ?? 50 : 50
        _ = setSystemOutputVolume(v)
        print("OK")
        fflush(stdout)
    } else if cmd == "getaudiodevices" || cmd == "devices" {
        let devs = getAudioOutputDevices()
        if let data = try? JSONSerialization.data(withJSONObject: devs.map { [
            "id": $0.id,
            "uid": $0.uid,
            "name": $0.name,
            "transport": $0.transport,
            "isDefault": $0.isDefault
        ] }, options: []), let str = String(data: data, encoding: .utf8) {
            print(str)
        } else {
            print("[]")
        }
        fflush(stdout)
    } else if cmd == "setaudiodevice" || cmd == "setdevice" {
        let target = args.count > 2 ? args[2] : ""
        let ok = setDefaultAudioOutputDevice(idOrUID: target)
        print(ok ? "OK" : "ERROR")
        fflush(stdout)
    } else if cmd == "nowplaying" {
        getNowPlaying()
    } else if cmd == "media" {
        let action = args.count > 2 ? args[2] : "playpause"
        let val = args.count > 3 ? Double(args[3]) : nil
        sendMediaCommand(action, value: val)
    } else {
        let val = args.count > 2 ? Double(args[2]) : nil
        sendMediaCommand(cmd, value: val)
    }
} else {
    print("Usage: media-helper [lock|getvolume|volume <0-100>|nowplaying|media <action> [val]]")
    fflush(stdout)
}

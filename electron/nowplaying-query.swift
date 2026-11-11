import Foundation
import CoreAudio

guard let handle = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_NOW) else {
    print("{}")
    exit(0)
}

typealias MRGetClientFn = @convention(c) (DispatchQueue, @escaping (AnyObject) -> Void) -> Void
typealias MRGetInfoFn = @convention(c) (DispatchQueue, @escaping ([String: Any]) -> Void) -> Void
typealias MRIsPlayingFn = @convention(c) (DispatchQueue, @escaping (Bool) -> Void) -> Void

var clientName = "System"
var clientBundle = ""
var clientIcon = "system"

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

// Safety timeout: exit after 900ms so query never hangs
Timer.scheduledTimer(withTimeInterval: 0.9, repeats: false) { _ in
    print("{}")
    CFRunLoopStop(CFRunLoopGetMain())
}

if let symClient = dlsym(handle, "MRMediaRemoteGetNowPlayingClient"),
   let symInfo = dlsym(handle, "MRMediaRemoteGetNowPlayingInfo"),
   let symIsPlaying = dlsym(handle, "MRMediaRemoteGetNowPlayingApplicationIsPlaying") {
    let getClient = unsafeBitCast(symClient, to: MRGetClientFn.self)
    let getInfo = unsafeBitCast(symInfo, to: MRGetInfoFn.self)
    let getIsPlaying = unsafeBitCast(symIsPlaying, to: MRIsPlayingFn.self)

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

        getIsPlaying(DispatchQueue.main) { isPlaying in
            getInfo(DispatchQueue.main) { dict in
                let title = dict["kMRMediaRemoteNowPlayingInfoTitle"] as? String ?? ""
                let artist = dict["kMRMediaRemoteNowPlayingInfoArtist"] as? String ?? ""
                let duration = dict["kMRMediaRemoteNowPlayingInfoDuration"] as? Double ?? 0
                let rawElapsed = dict["kMRMediaRemoteNowPlayingInfoElapsedTime"] as? Double ?? 0
                let timestamp = dict["kMRMediaRemoteNowPlayingInfoTimestamp"] as? Date

                var calculatedElapsed = rawElapsed
                if isPlaying, let ts = timestamp {
                    let delta = Date().timeIntervalSince(ts)
                    if delta > 0 && (duration == 0 || delta < duration) {
                        calculatedElapsed = duration > 0 ? min(duration, rawElapsed + delta) : (rawElapsed + delta)
                    }
                }

                let currentVol = getSystemOutputVolume()

                let json: [String: Any] = [
                    "client": clientName,
                    "bundle": clientBundle,
                    "icon": clientIcon,
                    "title": title.isEmpty ? (isPlaying ? "Audio Playback" : "Media Player") : title,
                    "artist": artist.isEmpty ? clientName : artist,
                    "duration": duration > 0 ? duration : 300,
                    "elapsed": calculatedElapsed >= 0 ? calculatedElapsed : 0,
                    "isPlaying": isPlaying,
                    "state": isPlaying ? "playing" : "paused",
                    "volume": currentVol
                ]

                if let data = try? JSONSerialization.data(withJSONObject: json, options: []),
                   let str = String(data: data, encoding: .utf8) {
                    print(str)
                    fflush(stdout)
                } else {
                    print("{}")
                    fflush(stdout)
                }
                CFRunLoopStop(CFRunLoopGetMain())
            }
        }
    }
    CFRunLoopRun()
} else {
    print("{}")
    exit(0)
}

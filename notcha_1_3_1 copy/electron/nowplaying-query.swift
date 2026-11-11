import Foundation

guard let handle = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_NOW) else {
    print("{}")
    exit(0)
}

typealias MRGetClientFn = @convention(c) (DispatchQueue, @escaping (AnyObject) -> Void) -> Void
typealias MRGetInfoFn = @convention(c) (DispatchQueue, @escaping ([String: Any]) -> Void) -> Void

var clientName = "System"
var clientBundle = ""
var clientIcon = "system"

// Safety timeout: exit after 900ms so query never hangs
Timer.scheduledTimer(withTimeInterval: 0.9, repeats: false) { _ in
    print("{}")
    CFRunLoopStop(CFRunLoopGetMain())
}

if let symClient = dlsym(handle, "MRMediaRemoteGetNowPlayingClient"),
   let symInfo = dlsym(handle, "MRMediaRemoteGetNowPlayingInfo") {
    let getClient = unsafeBitCast(symClient, to: MRGetClientFn.self)
    let getInfo = unsafeBitCast(symInfo, to: MRGetInfoFn.self)

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

            let json: [String: Any] = [
                "client": clientName,
                "bundle": clientBundle,
                "icon": clientIcon,
                "title": title.isEmpty ? "Now Playing" : title,
                "artist": artist.isEmpty ? clientName : artist,
                "duration": duration > 0 ? duration : 300,
                "elapsed": elapsed >= 0 ? elapsed : 0,
                "isPlaying": isPlaying,
                "state": isPlaying ? "playing" : "paused"
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
    CFRunLoopRun()
} else {
    print("{}")
    exit(0)
}

import Cocoa
import ApplicationServices
import CoreGraphics

// ==============================================================================
// Notcha Dock Helper v3.3.0: Tracks macOS Dock Hover & Captures Window Previews
// ==============================================================================

typealias CGWindowListCreateImageFunc = @convention(c) (CGRect, UInt32, CGWindowID, UInt32) -> Unmanaged<CGImage>?

func cleanAppName(_ str: String) -> String {
    return str.unicodeScalars
        .filter { !($0.value >= 0x200B && $0.value <= 0x200F) && !($0.value >= 0x202A && $0.value <= 0x202E) && !CharacterSet.controlCharacters.contains($0) }
        .map { String($0) }
        .joined()
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()
}

class DockHelper {
    var dockAx: AXUIElement?
    var dockPid: pid_t = 0
    var lastHoveredTitle: String? = nil
    var lastHoveredRect: CGRect = .zero
    var cgCreateImageFn: CGWindowListCreateImageFunc?
    var isRunning = true

    static func requestPermissionsOnLaunch(prompt: Bool = false) {
        if prompt {
            let axOptions = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
            let _ = AXIsProcessTrustedWithOptions(axOptions)
            if #available(macOS 10.15, *) {
                if !CGPreflightScreenCaptureAccess() {
                    CGRequestScreenCaptureAccess()
                }
            }
        }
    }

    init() {
        setupDynamicCG()
        setupDock()
    }

    func setupDynamicCG() {
        if let handle = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", RTLD_NOW) {
            if let sym = dlsym(handle, "CGWindowListCreateImage") {
                self.cgCreateImageFn = unsafeBitCast(sym, to: CGWindowListCreateImageFunc.self)
            }
        }
    }

    func setupDock() {
        let dockApps = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.dock")
        if let dock = dockApps.first {
            self.dockPid = dock.processIdentifier
            self.dockAx = AXUIElementCreateApplication(dock.processIdentifier)
        }
    }

    func getAppIconBase64(app: NSRunningApplication, size: CGFloat = 40) -> String? {
        guard let icon = app.icon else { return nil }
        let targetSize = NSSize(width: size, height: size)
        let resized = NSImage(size: targetSize)
        resized.lockFocus()
        icon.draw(in: NSRect(origin: .zero, size: targetSize), from: .zero, operation: .copy, fraction: 1.0)
        resized.unlockFocus()
        guard let tiff = resized.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff),
              let png = rep.representation(using: .png, properties: [:]) else {
            return nil
        }
        return "data:image/png;base64," + png.base64EncodedString()
    }

    func captureThumbnail(windowId: CGWindowID, maxW: CGFloat = 260) -> String? {
        guard let fn = self.cgCreateImageFn else { return nil }
        // 8 = .optionIncludingWindow (kCGWindowListOptionIncludingWindow), 1 = boundsIgnoreFraming
        guard let img = fn(.null, 8, windowId, 1)?.takeRetainedValue() else {
            return nil
        }
        let origW = CGFloat(img.width)
        let origH = CGFloat(img.height)
        guard origW > 10 && origH > 10 else { return nil }

        let scale = min(1.0, maxW / origW)
        let targetW = max(1, Int(origW * scale))
        let targetH = max(1, Int(origH * scale))

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(data: nil,
                                      width: targetW,
                                      height: targetH,
                                      bitsPerComponent: 8,
                                      bytesPerRow: targetW * 4,
                                      space: colorSpace,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            return nil
        }
        context.interpolationQuality = .medium
        context.draw(img, in: CGRect(x: 0, y: 0, width: targetW, height: targetH))

        guard let scaled = context.makeImage() else { return nil }
        let bitmapRep = NSBitmapImageRep(cgImage: scaled)
        guard let jpgData = bitmapRep.representation(using: .jpeg, properties: [.compressionFactor: 0.72]) else {
            return nil
        }
        return "data:image/jpeg;base64," + jpgData.base64EncodedString()
    }

    func checkMouseHover() {
        guard let mainScreen = NSScreen.screens.first else { return }
        let screenH = mainScreen.frame.height

        if dockAx == nil { setupDock() }
        guard let dock = dockAx else { return }

        let loc = NSEvent.mouseLocation
        let axX = Float(loc.x)
        let axY = Float(screenH - loc.y)

        var hit: AXUIElement?
        let err = AXUIElementCopyElementAtPosition(dock, axX, axY, &hit)

        if err == .success, let el = hit {
            var roleRef: CFTypeRef?
            AXUIElementCopyAttributeValue(el, kAXRoleAttribute as CFString, &roleRef)
            let role = (roleRef as? String) ?? ""

            if role == "AXDockItem" {
                var titleRef: CFTypeRef?
                AXUIElementCopyAttributeValue(el, kAXTitleAttribute as CFString, &titleRef)
                let title = (titleRef as? String) ?? ""

                if !title.isEmpty {
                    var posVal: CFTypeRef?
                    var sizeVal: CFTypeRef?
                    AXUIElementCopyAttributeValue(el, kAXPositionAttribute as CFString, &posVal)
                    AXUIElementCopyAttributeValue(el, kAXSizeAttribute as CFString, &sizeVal)

                    var pos = CGPoint.zero
                    if let pv = posVal, CFGetTypeID(pv) == AXValueGetTypeID() {
                        AXValueGetValue(pv as! AXValue, .cgPoint, &pos)
                    }
                    var size = CGSize.zero
                    if let sv = sizeVal, CFGetTypeID(sv) == AXValueGetTypeID() {
                        AXValueGetValue(sv as! AXValue, .cgSize, &size)
                    }

                    if title != lastHoveredTitle {
                        lastHoveredTitle = title
                        lastHoveredRect = CGRect(origin: pos, size: size)
                        emitHoverData(appName: title, rect: lastHoveredRect)
                    }
                    return
                }
            }
        }

        if lastHoveredTitle != nil {
            lastHoveredTitle = nil
            emitLeave()
        }
    }

    func emitHoverData(appName: String, rect: CGRect) {
        let runningApps = NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular }
        let targetClean = cleanAppName(appName)
        let targetNoSpace = targetClean.replacingOccurrences(of: " ", with: "")

        guard let app = runningApps.first(where: {
            let locClean = cleanAppName($0.localizedName ?? "")
            let bid = ($0.bundleIdentifier ?? "").lowercased()
            guard !locClean.isEmpty else { return false }
            return locClean == targetClean ||
                   locClean.contains(targetClean) ||
                   targetClean.contains(locClean) ||
                   (!bid.isEmpty && bid.contains(targetNoSpace))
        }) else {
            return
        }

        let pid = app.processIdentifier
        let isFinder = (app.bundleIdentifier == "com.apple.finder") || (app.localizedName == "Finder")
        let appIconB64 = getAppIconBase64(app: app) ?? ""

        var windowData: [[String: Any]] = []

        if let windowList = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
            let appWindows = windowList.filter {
                ($0[kCGWindowOwnerPID as String] as? pid_t) == pid &&
                ($0[kCGWindowLayer as String] as? Int) == 0
            }

            let appAx = AXUIElementCreateApplication(pid)
            var axWinRef: CFTypeRef?
            AXUIElementCopyAttributeValue(appAx, kAXWindowsAttribute as CFString, &axWinRef)
            let axWindows = (axWinRef as? [AXUIElement]) ?? []

            var axMinMap: [String: Bool] = [:]
            for axW in axWindows {
                var tRef: CFTypeRef?
                var mRef: CFTypeRef?
                AXUIElementCopyAttributeValue(axW, kAXTitleAttribute as CFString, &tRef)
                AXUIElementCopyAttributeValue(axW, kAXMinimizedAttribute as CFString, &mRef)
                if let t = tRef as? String, !t.isEmpty {
                    axMinMap[t] = (mRef as? Bool) ?? false
                }
            }

            for (idx, w) in appWindows.enumerated() {
                let winId = w[kCGWindowNumber as String] as? CGWindowID ?? 0
                let rawTitle = (w[kCGWindowName as String] as? String) ?? ""
                let bounds = (w[kCGWindowBounds as String] as? [String: Any]) ?? [:]
                let width = bounds["Width"] as? CGFloat ?? 0
                let height = bounds["Height"] as? CGFloat ?? 0

                // Filter out tiny or extreme aspect ratio windows (e.g. 1920x24 menu bars, 1920x125 strips)
                guard width >= 120 && height >= 80 else { continue }
                let aspect = max(width, height) / max(1, min(width, height))
                if aspect > 7.0 && rawTitle.isEmpty { continue }

                var title = rawTitle
                var isMin = false

                if isFinder {
                    if title.isEmpty { continue }
                } else {
                    if let m = axMinMap[title] {
                        isMin = m
                    }
                }

                if title.isEmpty && idx < axWindows.count {
                    var tRef: CFTypeRef?
                    AXUIElementCopyAttributeValue(axWindows[idx], kAXTitleAttribute as CFString, &tRef)
                    if let t = tRef as? String, !t.isEmpty {
                        title = t
                    }
                }

                let thumbB64 = captureThumbnail(windowId: winId) ?? ""

                // Discard ghost internal windows with no image, no title, and not minimized
                if thumbB64.isEmpty && !isMin && rawTitle.isEmpty {
                    continue
                }

                if title.isEmpty {
                    title = appWindows.count > 1 ? "\(appName) (Window \(idx + 1))" : "\(appName) Window"
                }

                // If a live image exists, it is definitely not minimized
                if !thumbB64.isEmpty {
                    isMin = false
                }

                windowData.append([
                    "id": Int(winId),
                    "index": idx,
                    "title": title,
                    "thumbnail": thumbB64,
                    "isMinimized": isMin
                ])
            }
        }

        // Fallback to AX windows if CG returned no windows (e.g. all minimized to dock)
        if windowData.isEmpty {
            let appAx = AXUIElementCreateApplication(pid)
            var axWinRef: CFTypeRef?
            AXUIElementCopyAttributeValue(appAx, kAXWindowsAttribute as CFString, &axWinRef)
            if let axWindows = axWinRef as? [AXUIElement], !axWindows.isEmpty {
                for (idx, axW) in axWindows.enumerated() {
                    var axTitleRef: CFTypeRef?
                    AXUIElementCopyAttributeValue(axW, kAXTitleAttribute as CFString, &axTitleRef)
                    let title = (axTitleRef as? String) ?? (axWindows.count > 1 ? "\(appName) (Window \(idx + 1))" : "\(appName) Window")
                    var minRef: CFTypeRef?
                    AXUIElementCopyAttributeValue(axW, kAXMinimizedAttribute as CFString, &minRef)
                    let isMin = (minRef as? Bool) ?? true

                    windowData.append([
                        "id": idx,
                        "index": idx,
                        "title": title,
                        "thumbnail": "",
                        "isMinimized": isMin
                    ])
                }
            }
        }

        guard !windowData.isEmpty else { return }

        let payload: [String: Any] = [
            "type": "hover",
            "appName": appName,
            "pid": Int(pid),
            "appIcon": appIconB64,
            "iconFrame": [
                "x": rect.origin.x,
                "y": rect.origin.y,
                "width": rect.size.width,
                "height": rect.size.height
            ],
            "windows": windowData
        ]

        if let jsonData = try? JSONSerialization.data(withJSONObject: payload, options: []),
           let jsonStr = String(data: jsonData, encoding: .utf8) {
            print(jsonStr)
            fflush(stdout)
        }
    }

    func emitLeave() {
        let payload: [String: Any] = ["type": "leave"]
        if let jsonData = try? JSONSerialization.data(withJSONObject: payload, options: []),
           let jsonStr = String(data: jsonData, encoding: .utf8) {
            print(jsonStr)
            fflush(stdout)
        }
    }

    func raiseWindow(pid: pid_t, windowIndex: Int, windowTitle: String? = nil) {
        guard let app = NSRunningApplication(processIdentifier: pid) else { return }
        let isFinder = (app.bundleIdentifier == "com.apple.finder") || (app.localizedName == "Finder")

        if isFinder, let targetTitle = windowTitle, !targetTitle.isEmpty {
            let escapedTitle = targetTitle.replacingOccurrences(of: "\"", with: "\\\"")
            let scriptSource = """
            tell application "Finder"
                set matchingWins to (every window whose name is "\(escapedTitle)")
                if (count of matchingWins) > 0 then
                    set targetWin to item 1 of matchingWins
                    set collapsed of targetWin to false
                    set index of targetWin to 1
                end if
                activate
            end tell
            """
            if let script = NSAppleScript(source: scriptSource) {
                var err: NSDictionary?
                script.executeAndReturnError(&err)
                return
            }
        }

        app.activate()

        let appAx = AXUIElementCreateApplication(pid)
        var winListRef: CFTypeRef?
        AXUIElementCopyAttributeValue(appAx, kAXWindowsAttribute as CFString, &winListRef)
        guard let list = winListRef as? [AXUIElement], !list.isEmpty else { return }

        // 1. Try matching target window by title
        if let targetTitle = windowTitle, !targetTitle.isEmpty {
            for win in list {
                var tRef: CFTypeRef?
                AXUIElementCopyAttributeValue(win, kAXTitleAttribute as CFString, &tRef)
                if let t = tRef as? String, t == targetTitle {
                    AXUIElementSetAttributeValue(win, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
                    AXUIElementPerformAction(win, kAXRaiseAction as CFString)
                    AXUIElementSetAttributeValue(win, kAXMainAttribute as CFString, kCFBooleanTrue)
                    return
                }
            }
        }

        // 2. Fallback by index
        let targetIdx = windowIndex < list.count ? windowIndex : 0
        let win = list[targetIdx]
        AXUIElementSetAttributeValue(win, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
        AXUIElementPerformAction(win, kAXRaiseAction as CFString)
        AXUIElementSetAttributeValue(win, kAXMainAttribute as CFString, kCFBooleanTrue)
    }

    func closeWindow(pid: pid_t, windowIndex: Int, windowTitle: String? = nil) {
        guard let app = NSRunningApplication(processIdentifier: pid) else { return }
        let isFinder = (app.bundleIdentifier == "com.apple.finder") || (app.localizedName == "Finder")

        if isFinder, let targetTitle = windowTitle, !targetTitle.isEmpty {
            let escapedTitle = targetTitle.replacingOccurrences(of: "\"", with: "\\\"")
            let scriptSource = """
            tell application "Finder"
                close (every window whose name is "\(escapedTitle)")
            end tell
            """
            if let script = NSAppleScript(source: scriptSource) {
                var err: NSDictionary?
                script.executeAndReturnError(&err)
                return
            }
        }

        let appAx = AXUIElementCreateApplication(pid)
        var winListRef: CFTypeRef?
        AXUIElementCopyAttributeValue(appAx, kAXWindowsAttribute as CFString, &winListRef)
        guard let list = winListRef as? [AXUIElement], !list.isEmpty else { return }

        // 1. Try matching target window by title
        if let targetTitle = windowTitle, !targetTitle.isEmpty {
            for win in list {
                var tRef: CFTypeRef?
                AXUIElementCopyAttributeValue(win, kAXTitleAttribute as CFString, &tRef)
                if let t = tRef as? String, t == targetTitle {
                    var closeBtnRef: CFTypeRef?
                    AXUIElementCopyAttributeValue(win, kAXCloseButtonAttribute as CFString, &closeBtnRef)
                    if let closeBtn = closeBtnRef {
                        AXUIElementPerformAction(closeBtn as! AXUIElement, kAXPressAction as CFString)
                    }
                    return
                }
            }
        }

        // 2. Fallback by index
        let targetIdx = windowIndex < list.count ? windowIndex : 0
        let win = list[targetIdx]
        var closeBtnRef: CFTypeRef?
        AXUIElementCopyAttributeValue(win, kAXCloseButtonAttribute as CFString, &closeBtnRef)
        if let closeBtn = closeBtnRef {
            AXUIElementPerformAction(closeBtn as! AXUIElement, kAXPressAction as CFString)
        }
    }

    func start() {
        // Background thread reading commands from stdin
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            while let line = readLine() {
                guard let self = self else { break }
                let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }

                if let data = trimmed.data(using: .utf8),
                   let dict = (try? JSONSerialization.jsonObject(with: data, options: [])) as? [String: Any] {
                    let action = dict["action"] as? String ?? ""
                    let pid = pid_t(dict["pid"] as? Int ?? 0)
                    let idx = dict["index"] as? Int ?? 0
                    let title = dict["title"] as? String

                    if action == "raise" {
                        DispatchQueue.main.async {
                            self.raiseWindow(pid: pid, windowIndex: idx, windowTitle: title)
                        }
                    } else if action == "close" {
                        DispatchQueue.main.async {
                            self.closeWindow(pid: pid, windowIndex: idx, windowTitle: title)
                        }
                    } else if action == "quit" {
                        exit(0)
                    }
                }
            }
        }

        // Run loop timer polling mouse coordinates every 80ms
        let timer = Timer(timeInterval: 0.08, repeats: true) { [weak self] _ in
            self?.checkMouseHover()
        }
        RunLoop.main.add(timer, forMode: .common)
        RunLoop.main.run()
    }
}

if CommandLine.arguments.contains("--prompt-permissions") {
    DockHelper.requestPermissionsOnLaunch(prompt: true)
    exit(0)
}

let helper = DockHelper()
helper.start()

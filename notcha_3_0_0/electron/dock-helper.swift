import Cocoa
import ApplicationServices
import CoreGraphics

// ==============================================================================
// Notcha Dock Helper: Tracks macOS Dock Hover & Captures Window Previews
// ==============================================================================

typealias CGWindowListCreateImageFunc = @convention(c) (CGRect, UInt32, CGWindowID, UInt32) -> Unmanaged<CGImage>?

class DockHelper {
    var dockAx: AXUIElement?
    var dockPid: pid_t = 0
    var lastHoveredTitle: String? = nil
    var lastHoveredRect: CGRect = .zero
    var cgCreateImageFn: CGWindowListCreateImageFunc?
    var isRunning = true

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
        // 1 = .optionIncludingWindow, 1 = .bestResolution
        guard let img = fn(.null, 1, windowId, 1)?.takeRetainedValue() else {
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
        // Find matching running application
        let runningApps = NSWorkspace.shared.runningApplications
        guard let app = runningApps.first(where: {
            $0.localizedName == appName ||
            $0.bundleIdentifier?.lowercased() == appName.lowercased() ||
            ($0.bundleIdentifier?.lowercased().hasSuffix(appName.lowercased().replacingOccurrences(of: " ", with: "")) ?? false)
        }) else {
            return
        }

        let pid = app.processIdentifier
        let appIconB64 = getAppIconBase64(app: app) ?? ""

        // Query open windows via CGWindowListCopyWindowInfo
        var windowData: [[String: Any]] = []
        if let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
            let appWindows = windowList.filter {
                ($0[kCGWindowOwnerPID as String] as? pid_t) == pid &&
                ($0[kCGWindowLayer as String] as? Int) == 0 &&
                (($0[kCGWindowBounds as String] as? [String: Any])?["Width"] as? CGFloat ?? 0) > 80 &&
                (($0[kCGWindowBounds as String] as? [String: Any])?["Height"] as? CGFloat ?? 0) > 80
            }

            // Also check AX windows for titles if CGWindowName is empty
            let appAx = AXUIElementCreateApplication(pid)
            var axWinRef: CFTypeRef?
            AXUIElementCopyAttributeValue(appAx, kAXWindowsAttribute as CFString, &axWinRef)
            let axWindows = (axWinRef as? [AXUIElement]) ?? []

            for (idx, w) in appWindows.enumerated() {
                let winId = w[kCGWindowNumber as String] as? CGWindowID ?? 0
                var title = w[kCGWindowName as String] as? String ?? ""

                var isMin = false
                if idx < axWindows.count {
                    let axW = axWindows[idx]
                    if title.isEmpty {
                        var axTitleRef: CFTypeRef?
                        AXUIElementCopyAttributeValue(axW, kAXTitleAttribute as CFString, &axTitleRef)
                        title = (axTitleRef as? String) ?? ""
                    }
                    var minRef: CFTypeRef?
                    AXUIElementCopyAttributeValue(axW, kAXMinimizedAttribute as CFString, &minRef)
                    isMin = (minRef as? Bool) ?? false
                }

                if title.isEmpty {
                    title = "\(appName) Window"
                }

                let thumbB64 = captureThumbnail(windowId: winId) ?? ""

                windowData.append([
                    "id": Int(winId),
                    "index": idx,
                    "title": title,
                    "thumbnail": thumbB64,
                    "isMinimized": isMin
                ])
            }
        }

        // If no CG windows were found, check if there are AX windows (e.g. minimized)
        if windowData.isEmpty {
            let appAx = AXUIElementCreateApplication(pid)
            var axWinRef: CFTypeRef?
            AXUIElementCopyAttributeValue(appAx, kAXWindowsAttribute as CFString, &axWinRef)
            if let axWindows = axWinRef as? [AXUIElement], !axWindows.isEmpty {
                for (idx, axW) in axWindows.enumerated() {
                    var axTitleRef: CFTypeRef?
                    AXUIElementCopyAttributeValue(axW, kAXTitleAttribute as CFString, &axTitleRef)
                    let title = (axTitleRef as? String) ?? "\(appName) Window"
                    var minRef: CFTypeRef?
                    AXUIElementCopyAttributeValue(axW, kAXMinimizedAttribute as CFString, &minRef)
                    let isMin = (minRef as? Bool) ?? false

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

    func raiseWindow(pid: pid_t, windowIndex: Int) {
        guard let app = NSRunningApplication(processIdentifier: pid) else { return }
        app.activate()

        let appAx = AXUIElementCreateApplication(pid)
        var winListRef: CFTypeRef?
        AXUIElementCopyAttributeValue(appAx, kAXWindowsAttribute as CFString, &winListRef)
        if let list = winListRef as? [AXUIElement], windowIndex < list.count {
            let win = list[windowIndex]
            AXUIElementPerformAction(win, kAXRaiseAction as CFString)
            AXUIElementSetAttributeValue(win, kAXMainAttribute as CFString, kCFBooleanTrue)
        }
    }

    func closeWindow(pid: pid_t, windowIndex: Int) {
        let appAx = AXUIElementCreateApplication(pid)
        var winListRef: CFTypeRef?
        AXUIElementCopyAttributeValue(appAx, kAXWindowsAttribute as CFString, &winListRef)
        if let list = winListRef as? [AXUIElement], windowIndex < list.count {
            let win = list[windowIndex]
            var closeBtnRef: CFTypeRef?
            AXUIElementCopyAttributeValue(win, kAXCloseButtonAttribute as CFString, &closeBtnRef)
            if let closeBtn = closeBtnRef {
                AXUIElementPerformAction(closeBtn as! AXUIElement, kAXPressAction as CFString)
            }
        }
    }

    func start() {
        // Start background thread to read commands from stdin
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

                    if action == "raise" {
                        DispatchQueue.main.async {
                            self.raiseWindow(pid: pid, windowIndex: idx)
                        }
                    } else if action == "close" {
                        DispatchQueue.main.async {
                            self.closeWindow(pid: pid, windowIndex: idx)
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

let helper = DockHelper()
helper.start()

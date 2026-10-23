import AppKit

let args = CommandLine.arguments
if args.count > 1 {
    let cmd = args[1]
    var keyCode = 16 // Play/Pause default
    if cmd == "next" { keyCode = 19 }
    else if cmd == "prev" { keyCode = 20 }
    else if cmd == "playpause" { keyCode = 16 }
    
    let down = NSEvent.otherEvent(
        with: .systemDefined,
        location: .zero,
        modifierFlags: NSEvent.ModifierFlags(rawValue: 0xa00),
        timestamp: 0,
        windowNumber: 0,
        context: nil,
        subtype: 8,
        data1: (keyCode << 16) | (0xa << 8),
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
        data1: (keyCode << 16) | (0xb << 8),
        data2: -1
    )
    up?.cgEvent?.post(tap: CGEventTapLocation.cghidEventTap)
    print("Dispatched \(cmd)")
}

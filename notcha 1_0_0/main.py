import os
import sys
import time
import tkinter as tk

IS_MAC = sys.platform == "darwin"
KEY = "systemTransparent" if IS_MAC else "#050513"
BASE = os.path.dirname(os.path.abspath(__file__))

W, H_SHOWN, H_HIDDEN = 414, 34, 4

root = tk.Tk()
bgcolor = "#121016"
fgcolor = "white"

if IS_MAC:
    root.attributes("-transparent", True)
else:
    root.overrideredirect(1)
    root.attributes("-transparentcolor", KEY)
root.config(bg=KEY)
root.attributes("-topmost", True)

x = 0


def place_bar(h):
    """Position the bar at the top-center of the screen with height h."""
    global x
    if IS_MAC:
        try:
            from AppKit import NSApp, NSColor, NSScreen, NSStatusWindowLevel
            sf = NSScreen.mainScreen().frame()
            for win in NSApp.windows():
                win.setStyleMask_(0)                      # borderless: no title bar
                win.setLevel_(NSStatusWindowLevel + 1)    # above the menu bar
                win.setHasShadow_(False)
                win.setOpaque_(False)
                win.setBackgroundColor_(NSColor.clearColor())

                #round corner implementation
                cv = win.contentView()
                cv.setWantsLayer_(True)
                cv.layer().setCornerRadius_(12)
                cv.layer().setMasksToBounds_(True)
                cv.layer().setMaskedCorners_(3)   # 3 = bottom two corners

                win.setFrame_display_(
                    (
                        (sf.origin.x + (sf.size.width - W) / 2, sf.origin.y + sf.size.height - h),
                        (W, h),
                    ),
                    True,
                )
            return
        except Exception as e:
            print("PyObjC step failed:", repr(e))
    x = root.winfo_screenwidth() // 2 - W // 2
    root.geometry(f"{W}x{h}+{x}+0")


barimg = tk.PhotoImage(file=os.path.join(BASE, "bg7.png"))
topmost_button_image = tk.PhotoImage(file=os.path.join(BASE, "button3.png"))

image_label = tk.Label(root, image=barimg, bg=KEY, borderwidth=0)
image_label.pack()

time_label = tk.Label(root, bg=bgcolor, foreground=fgcolor)

topmost_button = tk.Label(root, image=topmost_button_image, bg="#438499", borderwidth=0)
topmost_button.place(x=5, y=5)

hidden = False


def hide(*args):
    global hidden
    hidden = True
    place_bar(H_HIDDEN)
    root.bind("<Enter>", reveal)


def reveal(*args):
    global hidden
    if hidden:
        hidden = False
        place_bar(H_SHOWN)
        root.unbind("<Enter>")


topmost_button.bind("<Button-1>", hide)


def update(label):
    label.config(text=time.ctime()[:-8], font=("verdana", 13))
    label.place_configure(y=0, x=(W // 2 - label.winfo_reqwidth() // 2))
    root.after(1000, lambda: update(label))


update(time_label)

root.update()                       # make sure the native window exists
place_bar(H_SHOWN)
root.after(200, lambda: place_bar(H_SHOWN))   # re-apply once Tk finishes its own layout

root.mainloop()
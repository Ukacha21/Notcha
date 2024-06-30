import tkinter as tk
import time
from threading import Timer

"""
bg = #438499
bg2 = #004538
button = #438499
"""

root = tk.Tk()
bgcolor = "#121016"#"#004538"
fgcolor = "white"
root['bg'] = "blue" #transparentcolor reference
root.overrideredirect(1)

#root.title("Centered!") 
root.attributes("-topmost", True)
root.attributes("-transparentcolor", "blue")
# root.eval('tk::PlaceWindow . top')
#root.eval('tk::PlaceWindow . top')

state = False


barimg = tk.PhotoImage(file="bg7.png")
topmost_button_image = tk.PhotoImage(file="button3.png")

image_label = tk.Label(root, image = barimg, bg='blue')
image_label.pack()

time_label = tk.Label(root, bg=bgcolor, foreground=fgcolor)
#time_label.pack(pady = 5) #use place

topmost_button = tk.Label(root, image = topmost_button_image, bg = "#438499", borderwidth=0)
topmost_button.place(x = 5, y = 5)

top = True
top_enabled = True

def top_enable_func(*args):
    global top_enabled
    # top_enabled = True if not top_enabled else False

    top_enabled = False
    show_hide()
    
def show_hide(*args):
    global top_enabled
    if top_enabled != True: #hide

        # root.attributes("-topmost", top)
        root.geometry(f"{414}x{5}+{x}+{0}") 
        top_enabled = True
        root.bind("<Enter>", show_hide)
        print("no longer on top")
    else:
            # root.attributes("-topmost", top)
            root.geometry(f"{414}x{34}+{x}+{0}")
            root.bind("<Enter>", None)
            print("on top")

topmost_button.bind("<Button>", top_enable_func)
#root.bind("<Enter>", show_hide)
# image_label.bind("<Enter>", show_hide) 

def update(label):

    label.config(text=f"{time.ctime()}"[:-8], font=("verdana", 13)) #-5 removes the last 5 caracters of this string which are _2024
    label.place_configure(y = 0, x = (root.winfo_reqwidth()//2 - label.winfo_reqwidth()//2))
    # print(label.winfo_reqwidth())
    Timer(1, lambda: update(label)).start()

update(time_label)

def center_window_bottom(win):
    """Positions a Tkinter window at the bottom of the screen."""
    win.update_idletasks()  # Update window geometry information
    screen_width = win.winfo_screenwidth()
    screen_height = win.winfo_screenheight()
    window_height = win.winfo_height()
    window_width = win.winfo_reqwidth()

    global x

    y = screen_height - window_height #places o=to the bottom on y vertical axis
    x = screen_width//2 - window_width//2 #winwow srarts from the exact center, does not exactly place it to the center


    #win.geometry(f"{screen_width//4}x{screen_height//110}+{x}+{0}") # f"{new_width}x{new_height}+{x_pos}+{y_pos}"
    win.geometry(f"{414}x{34}+{x}+{0}") # f"{new_width}x{new_height}+{x_pos}+{y_pos}"

center_window_bottom(root)  # Call the centering function before packing widgets

root.mainloop()


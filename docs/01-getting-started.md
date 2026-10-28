# 1. Getting started

## What you need

- Windows, Linux or macOS, with **Python 3.8 or newer**. The first start installs numpy and Pillow for the editor by itself.
- A web browser (Chrome, Edge, Firefox or Safari). The editor runs in your browser but everything stays on your PC.
- An internet connection the first time the page loads (it fetches the 3D library, three.js, from unpkg.com).
- To use your cockpit in the game: Nuclear Option with the jet's mod or the MiG-29 Pack installed (a version made for the
  cockpit editor).

## Start the editor

1. Start it:
   - **Windows**: double-click **`Cockpit Editor.bat`**.
   - **Linux**: in a terminal in the editor's folder, `./"Cockpit Editor.sh"` (or right-click it in your file manager >
     *Run as a program*).
   - **macOS**: double-click **`Cockpit Editor.command`**. The first time macOS may refuse a file from the internet: right-click
     it > *Open* > *Open*.
2. A terminal window opens. That is the editor's server: leave it open while you work. The very first start takes a minute
   while it installs numpy and Pillow into a `.venv` folder next to it.
3. Your browser opens **http://127.0.0.1:8729** with the cockpit.
4. When you are done, save (Ctrl+S) and close the terminal window.

If the editor is already running, starting it again just opens the page.

## The screen

```
+-------------------------------------------------------------------------------------------+
| COCKPIT EDITOR  [jet]  Undo  Save                 saved | game closed | Build & Install | Log | Help |
+---------------+-----------------------------------------------------------+---------------+
| Layout | Add | My items |  Pilot  Panel  Left console  Right console ...  |  Properties   |
|               |                                                           |               |
| list of       |              the cockpit in 3D                            | settings of   |
| instruments,  |                                                           | what you      |
| or decals and |                                                           | selected      |
| screens       |                                                           |               |
+---------------+-----------------------------------------------------------+---------------+
```

- **Top bar**: pick the jet (MiG-29 or MiG-29SMT), Undo, Save. The pills show whether you have unsaved changes and whether
  the game is running. **Setups** exports your cockpit as a .cpit file and puts it in the game.
- **Left**: three tabs. **Layout** = the cockpit's own instruments. **Add** = new decals and screens. **My items** = what you added.
- **Middle**: the cockpit. The buttons along the top jump to useful views.
- **Right**: the properties of whatever is selected.

## Moving the camera

| Mouse | Does |
|---|---|
| Left-drag | look around |
| Right-drag | slide the view |
| Wheel | zoom in and out |
| View buttons (Pilot, Panel, Left console...) | jump to that view |
| **F** with something selected | look at it |

## Your first change (2 minutes)

1. Pick **MiG-29SMT** at the top left.
2. In the **Layout** tab, click **Standby display**. The camera turns to it and a yellow box marks it.
3. Press the **right arrow** key 10 times: it slides 1 cm to the right.
4. Drag **Size** in the right panel to 130 %.
5. Press **Ctrl+Z** a few times to undo, or **Reset** to put it back.
6. Press **Ctrl+S** to save.

Next: [Rearranging the cockpit](02-rearranging-the-cockpit.md).

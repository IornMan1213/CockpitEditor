# 1. Getting started

## What you need

- Windows, with **Python 3** (numpy and Pillow installed: `pip install numpy pillow`)
- A web browser (Chrome, Edge or Firefox). The editor runs in your browser but everything stays on your PC.
- An internet connection the first time the page loads (it fetches the 3D library, three.js, from unpkg.com).
- For building and installing: Unity 2022.3.62f2 with the Blueprinter project, Blender 5.2 and the game, as set in `jets.json`.

## Start the editor

1. Double-click **`Cockpit Editor.bat`**.
2. A black window opens. That is the editor's server: leave it open while you work.
3. Your browser opens **http://127.0.0.1:8729** with the cockpit.
4. When you are done, save (Ctrl+S) and close the black window.

If the editor is already running, the .bat just opens the page again.

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
  the game is running. **Build & Install** puts your changes into the mod and the game. **Log** shows build messages.
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

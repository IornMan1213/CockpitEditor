# Cockpit Editor

Rearrange and add to the MiG-29 and MiG-29SMT cockpits without Blender.

## Start it

Double-click **`Cockpit Editor.bat`**. A window opens with the editor's server (leave it open while you work) and your
browser opens http://127.0.0.1:8729. Close the window to stop it. It needs Python with numpy and Pillow (already installed).

## What you can do

| Tab | What it is for |
|---|---|
| **Layout** | The cockpit's own instruments, displays, switch panels and knobs. Click one (in the list or in the cockpit), then in the right panel: **Move** (click its new spot), nudge, turn, resize or hide it. **Reset** puts it back. Needles, lights and screens keep working wherever it goes. |
| **Add** | **Decals**: painted markings (STEP HERE, NO STEP, hazard stripes, placards, or your own PNG picture). **Screens**: a display that shows any SMT page (flight, RWR/engines, stores, standby, UFCP) or the tactical display, at any size, with any convex outline. |
| **My items** | The decals and screens you added. |

Mouse: left-drag looks around, right-drag moves the view, the wheel zooms. The buttons over the view jump to the panel,
consoles and so on. Keys with something selected: arrows nudge 1 mm (Shift: 1 cm), Q / E turn, + / - resize, M move,
H hide, Del delete, Ctrl+D duplicate, F look at it, Ctrl+Z undo, Ctrl+S save. Press **Help** in the editor for the rest.

## Where your work goes

Per jet, in that mod's `cockpit\` folder:

- `layout.json`: what you moved, turned, resized or hid
- `custom.json` and `decals\`: your decals and screens
- `build\`: what the mod's build reads (made when you save)

The build applies them (`tools\cockpit_layout.py` for the layout, the Unity builder for decals and screens), so they are in
every build and release from then on.

## For now

The editor works on the `cockpit-editor` branch of both mods (in `worktrees\`) and on its own copy of each cockpit
(`work\`), so the released mods are untouched. **Build & Install is switched off** until that branch is merged into the mods;
your layout is saved and goes into the first build after that. `jets.json` holds the paths and the on/off switch.

When Claude changes a cockpit, press **Log > Reload cockpit from mod** to bring the editor's copy up to date.

## Files

- `server.py`: the local server (saving, decal meshes, screen outlines, refresh, build and install)
- `static\index.html`, `static\app.js`: the editor page (three.js)
- `jets.json`: per jet, where its repo, work copy, Unity project and game folder are
- `tools\add_groups_*.py`: the one-off edits that made each instrument a movable group in the cockpit build scripts

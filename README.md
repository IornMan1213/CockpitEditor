# Cockpit Editor

Rearrange and add to the **MiG-29** and **MiG-29SMT** cockpits (Nuclear Option mods) in your browser, without Blender:

- **Move, turn, resize or hide** any gauge, display, switch panel or knob. Needles, lights and screens keep working.
- **Add custom screens (MFDs)** of any size and any outline (as many corners as you like, dents allowed), showing any SMT display page, a page of your own, or the tactical display.
- **Design your own MFD pages** from widgets (attitude, tapes, readings, RWR, stores, engines...) with a pixel-accurate live preview, and show them on any screen, built-in ones included.
- **Add decals**: STEP HERE, NO STEP, hazard stripes, placards, or your own pictures.
- **Cockpit setups (.cpit)**: export a whole cockpit as one file that players drop in a Cockpits folder and switch between in game (Configuration Manager), no rebuilding. Anything wrong with a file falls back to the default cockpit.
- Works on **Windows, Linux and macOS**; everything stays on your PC.

## Quick start

1. Install **Python 3** (Windows / macOS: [python.org](https://www.python.org/downloads/), on Windows tick *Add python.exe to
   PATH*; Linux: it is usually there already).
2. Download this folder (**Code > Download ZIP** on GitHub) and unzip it anywhere.
3. Start the editor:
   - **Windows**: double-click `Cockpit Editor.bat`
   - **Linux**: run `./"Cockpit Editor.sh"` in a terminal in this folder (or right-click it > *Run as a program*)
   - **macOS**: double-click `Cockpit Editor.command` (the first time: right-click > *Open*)

   The first start installs numpy and Pillow for the editor by itself (a minute). Leave the window it opens running; your
   browser opens the editor.
4. Pick the jet, make your changes, **Ctrl+S** to save, then **Setups > Export .cpit** to put your cockpit in the game.
5. In the game: **F1** (Configuration Manager) > the jet's instruments plugin > **Cockpit layout**, and pick it.

You need the jet's mod installed (a version made for the cockpit editor). The editor finds Steam installs of Nuclear Option on
its own, on any drive; otherwise type the game folder in **Setups > Game folder**.

## Guides

1. [Getting started](docs/01-getting-started.md): starting it, the screen, moving the camera, a first change
2. [Rearranging the cockpit](docs/02-rearranging-the-cockpit.md): moving, turning, resizing and hiding instruments
3. [Decals](docs/03-decals.md): templates, text and colours, your own pictures
4. [Screens](docs/04-screens.md): pages, sizes, outlines, bezels, moving a built-in page to your own screen
5. [Saving and putting it in the game](docs/05-building-and-installing.md): what is saved where, exporting, Build & Install (developers)
6. [Troubleshooting](docs/06-troubleshooting.md)
7. [How it works](docs/07-how-it-works.md): for developers
8. [Page designer](docs/08-page-designer.md): your own MFD pages
9. [Cockpit setups](docs/09-cockpit-setups.md): .cpit files, switching cockpits in game

## Keys (with something selected)

| Key | Does |
|---|---|
| Arrows (Shift) | nudge 1 mm (1 cm) |
| Q / E (Shift) | turn 5° (1°) |
| + / - | bigger / smaller |
| M | move: click its new spot |
| H | hide / show (instruments) |
| Del | delete (your decals and screens) |
| Ctrl+D | duplicate (your decals and screens) |
| F | look at it |
| Ctrl+Z / Ctrl+S | undo / save |
| Esc | cancel / deselect |

## Where things live

| What | Where |
|---|---|
| The editor | this folder: `start.py`, `server.py`, `static/`, `jets.json`, and each jet's cockpit in `jets/<jet>/` |
| Your layout, decals, screens and saved setups | Windows `%APPDATA%\CockpitEditor`, Linux `~/.local/share/CockpitEditor`, macOS `~/Library/Application Support/CockpitEditor` (one folder per jet), so updating the editor never touches them |
| Setups the game uses | the `Cockpits` folder next to the jet's plugin in `BepInEx/plugins` (see [Cockpit setups](docs/09-cockpit-setups.md)) |

The editor only runs on your own PC (127.0.0.1), accepts nothing from other web pages, and never uploads anything. It loads
its 3D library (three.js) from unpkg.com, so the first start needs an internet connection.

**Mod developers:** Build & Install and Reload cockpit from mod build the mod itself from its source. See
[How it works](docs/07-how-it-works.md).

# Cockpit Editor

Rearrange and add to the **MiG-29** and **MiG-29SMT** cockpits (Nuclear Option mods) in your browser, without Blender:

- **Move, turn, resize or hide** any gauge, display, switch panel or knob. Needles, lights and screens keep working.
- **Add custom screens (MFDs)** of any size and any outline (as many corners as you like, dents allowed), showing any SMT display page, a page of your own, or the tactical display.
- **Design your own MFD pages** from widgets (attitude, tapes, readings, RWR, stores, engines...) with a pixel-accurate live preview, and show them on any screen, built-in ones included.
- **Add decals**: STEP HERE, NO STEP, hazard stripes, placards, or your own pictures.
- **Build & Install** the mod with your changes in one click.

## Quick start

1. `pip install numpy pillow` (once).
2. Double-click **`Cockpit Editor.bat`**. Leave the black window open; your browser opens the editor.
3. Pick the jet, make your changes, **Ctrl+S** to save, **Build & Install** to try them in the game.

## Guides

1. [Getting started](docs/01-getting-started.md): starting it, the screen, moving the camera, a first change
2. [Rearranging the cockpit](docs/02-rearranging-the-cockpit.md): moving, turning, resizing and hiding instruments
3. [Decals](docs/03-decals.md): templates, text and colours, your own pictures
4. [Screens](docs/04-screens.md): pages, sizes, outlines, bezels, moving a built-in page to your own screen
5. [Saving, building and installing](docs/05-building-and-installing.md): what is saved where, Build & Install
6. [Troubleshooting](docs/06-troubleshooting.md)
7. [How it works](docs/07-how-it-works.md): for developers
8. [Page designer](docs/08-page-designer.md): your own MFD pages

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
| The editor | this folder: `server.py`, `static/`, `jets.json` |
| Your layout, decals and screens | each mod fork's `cockpit\` folder (`Documents\Forks\<mod>\cockpit`) |
| The mods it builds | `Documents\Forks\MiG29-NuclearOption` and `\MiG29SMT-NuclearOption`, branch `editor` (local forks; the released repos are untouched) |
| The editor's copy of each cockpit | `work\<jet>` (made from the mod with **Log > Reload cockpit from mod**) |
| Test builds | `MiG29-NuclearOption\builds\test-builds` |

Paths are set in `jets.json`. The editor only runs on your own PC (127.0.0.1) and never uploads anything.

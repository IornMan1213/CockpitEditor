# 5. Saving and putting it in the game

## Save

**Ctrl+S** or **Save**. The pill at the top says *saved* or *unsaved changes*. Saving writes, per jet, in your editor data
folder (Windows `%APPDATA%\CockpitEditor\<jet>`, Linux `~/.local/share/CockpitEditor/<jet>`, macOS
`~/Library/Application Support/CockpitEditor/<jet>`; **Setups** shows the exact path):

| File | What it holds |
|---|---|
| `layout.json` | instruments you moved, turned, resized or hid |
| `custom.json` | your decals and screens (as the editor needs them to edit them again) |
| `mfd_pages.json` | your MFD pages (MiG-29SMT) |
| `decals/<id>.png` | each decal's picture |
| `setups/<name>.cpit` | the setups you exported |

Reopening the editor brings everything back. **Undo** (Ctrl+Z) works back through everything since you opened the jet.
Updating or moving the editor folder does not touch these files.

## Put it in the game

**Setups > Export .cpit** with *Also put it in the game's Cockpits folder* ticked, then in the game pick it under
**F1 > the jet's instruments plugin > Cockpit layout**. See [Cockpit setups](09-cockpit-setups.md).

## Build & Install (mod developers)

With a jet's mod source set in `jets.local.json` (see [How it works](07-how-it-works.md)), the top bar also has
**Build & Install** and **Log**. They build the mod itself with your changes, which needs the mod's repo, Unity 2022.3.62f2
with the Blueprinter project, Blender and PowerShell (`pwsh` on Linux and macOS).

1. Close the **Unity Editor** if it is open on the Blueprinter project (only one Unity can use it at a time).
2. Close the **game** if you want the build installed straight away.
3. Press **Build & Install** and confirm.
4. The **Log** opens and shows progress. A quick build takes a few minutes; the first one after the cockpit itself changed
   also runs Blender (10-15 minutes).
5. At the end it copies the mod into the jet's plugin folder in the game.

If the game was running, the log says so and nothing is installed: close the game and press **Log > Install last build**.
`"_build_enabled": false` in `jets.local.json` switches building off (with `"_build_disabled_reason"` shown on the button).

Next: [Troubleshooting](06-troubleshooting.md).

# 5. Saving, building and installing

## Save

**Ctrl+S** or **Save**. The pill at the top says *saved* or *unsaved changes*. Saving writes, in the jet's mod folder
(`jets.json` > `repo`):

| File | What it holds |
|---|---|
| `cockpit\layout.json` | instruments you moved, turned, resized or hid |
| `cockpit\custom.json` | your decals and screens (as the editor needs them to edit them again) |
| `cockpit\decals\<id>.png` | each decal's picture |
| `cockpit\build\` | what the mod's build reads (decal meshes and textures, screen meshes) |

Reopening the editor brings everything back. **Undo** (Ctrl+Z) works back through everything since you opened the jet.

## Build & Install

1. Close the **Unity Editor** if it is open on the Blueprinter project (only one Unity can use it at a time).
2. Close the **game** if you want the build installed straight away.
3. Press **Build & Install** and confirm.
4. The **Log** opens and shows progress. A quick build takes a few minutes; the first one after the cockpit itself changed
   also runs Blender (10–15 minutes).
5. At the end it copies the mod into the game's `BepInEx\plugins\<jet>` folder and keeps a copy in
   `MiG29-NuclearOption\builds\test-builds` (numbered like `MiG-29SMT_0.2.0.3`).

If the game was running, the log says so and nothing is installed: close the game and press **Log > Install last build**.

## Where the builds come from

The editor builds from the mods' **forks** (`Documents\Forks\...`, branch `editor`), not from the released repos, so the
released mods are never touched. When you are happy, the `editor` branch can be merged into the main repos and released.

## Turning building off and on

`jets.json` > `"_build_enabled"`: `true` or `false` (with `"_build_disabled_reason"` shown on the button). Restart the editor
(close the black window, start the .bat again) after editing `jets.json`.

Next: [Troubleshooting](06-troubleshooting.md).

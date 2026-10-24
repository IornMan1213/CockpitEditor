# 9. Cockpit setups (.cpit) – switch cockpits in game

A cockpit setup is a whole cockpit in one file: the instruments you moved, turned, resized or hid, your decals, your screens
and (MiG-29SMT) your MFD pages. Players can collect several and switch between them in the game, no rebuilding.

## Make one

1. Set the cockpit up in the editor as you like it.
2. Press **Setups** at the top, type a **Name**, leave **Also put it in the game's Cockpits folder** ticked, press
   **Export .cpit**.

The file is saved in your editor data folder's `setups` folder (Setups shows the path), and (if ticked) copied into the
game. The tick box is greyed out until the editor knows where the game is: it finds Steam installs by itself, on any drive and
on Linux too (Proton); otherwise type the folder with `NuclearOption.exe` under **Game folder** and press **Set**.

## Use it in the game

Setups live in a **Cockpits** folder next to the jet's plugin:

| Jet | Folder |
|---|---|
| MiG-29SMT (installed by NOMM) | `BepInEx/plugins/com.nikkorap.blueprinter/addons/MiG29SMT/Cockpits` |
| MiG-29 Fulcrum | `BepInEx/plugins/MiG-29_Fulcrum/Cockpits` (or the same `addons/...` path if NOMM installed it) |

The editor uses whichever folder the jet's plugin DLL is in, so a hand install anywhere under `BepInEx/plugins` works too.
To install a .cpit someone sent you without the editor, copy it into that folder.

Then in the game press **F1** (Configuration Manager) > the jet's instruments plugin > **Cockpit** >
**Cockpit layout**, and pick one. It changes straight away, in flight too. **Default** is the cockpit as built.

- **Next cockpit layout key**: set a key there to cycle Default and every setup while flying.
- New files show in the list after the game is restarted.

## If something is wrong

A setup that cannot be used (a broken or half-copied file, one made for the other jet, an instrument this version of the mod
does not have) is never half applied: the cockpit goes back to **Default** and the BepInEx log says why, e.g.

    cockpit setup "My cockpit" not used (made for the MiG-29SMT): default cockpit

Instruments a setup names that the mod does not have are skipped (logged); the rest of the setup is used.

## Open, share, delete

In the **Setups** window:

- **Open** loads a setup back into the editor to change it (it replaces what you have; export first to keep that).
- **To game** copies a saved setup into the game's Cockpits folder.
- The download button saves the .cpit file to share it; **Open a .cpit file…** loads one someone gave you.
- The red cross deletes it (saved or in the game).

## What is in a .cpit

A JSON file: the instruments' new positions (`layout`), the decals and screens as finished meshes with their pictures
(`parts`, `textures`), hidden built-in screens (`hide`), MFD pages (`mfd`), and the editor's own data (`editor`) so it can be
opened and changed again. The game needs a build of the mod made with the cockpit editor (its instruments are separate objects
it can move); with an older build only the decals, screens and pages are used, and a layout falls back to Default.

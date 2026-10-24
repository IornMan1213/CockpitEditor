# 6. Troubleshooting

| Problem | Fix |
|---|---|
| The page says "Could not load … is server.py running?" | Start the editor again (its terminal window must stay open). |
| The page is blank or the cockpit never appears | The 3D library loads from unpkg.com: check your internet connection, then reload (F5). |
| "the editor's copy of the cockpit is missing" | This download of the editor has no cockpit for that jet (`jets/<jet>/`): get the newest editor. |
| Windows: the window closes at once, or "Python was not found" | Install Python 3 from python.org and tick *Add python.exe to PATH*, then start the editor again. |
| Linux: "Could not install numpy and Pillow" | Install them with your package manager (the window shows the command, e.g. `sudo apt install python3-numpy python3-pil`), or `sudo apt install python3-venv` and start again. |
| Linux: double-clicking `Cockpit Editor.sh` opens it as text | Run it from a terminal: `./"Cockpit Editor.sh"`, or right-click > *Run as a program*. If it says permission denied: `chmod +x "Cockpit Editor.sh"`. |
| macOS: "cannot be opened because it is from an unidentified developer" | Right-click `Cockpit Editor.command` > *Open* > *Open* (only the first time). |
| Setups: "Nuclear Option was not found" | Type the game folder (the one with `NuclearOption.exe`) in **Setups > Game folder** and press **Set**. In Steam: right-click the game > *Manage* > *Browse local files* shows it. |
| Setups: "the mod is not installed there" | Install the jet's mod (with NOMM, or by hand into `BepInEx/plugins`), then reopen Setups. |
| The setup is not in the game's list | Restart the game: new files show after a restart. Check the BepInEx log for "cockpit setup … not used". |
| An instrument is gone | It is hidden: find it in the Layout list (greyed out) and press its eye button, or **Reset**. |
| Something is in the wrong place and I can't find it | Select it in the list and press **F** to look at it, or **Reset** it. |
| A decal's thin lines look blocky in the game | Make the lines a little bolder or the decal a little bigger. |
| A screen's shape changed after saving | Screens are kept convex; see the green outline in the outline box. |
| I want to start again | Delete the jet's folder in your editor data folder (shown under **Setups**), or select everything and Reset / Delete, then reload. |

## Port already in use

The editor uses port 8729. If something else uses it, change `PORT` near the top of `server.py` (and in `start.py`).

## Mod developers

| Problem | Fix |
|---|---|
| "Unity is running" when building | Close the Unity Editor (and wait for its background "AssetImportWorker" processes to end). |
| Build log ends with "compile pass failed" | Usually Unity was open. Close it and build again. Otherwise read `MiG29SMTOut_compile.log` in the Blueprinter project. |
| Built, but nothing changed in the game | The game was running: close it and press **Log > Install last build**. Also check you saved before building. |
| The cockpit in the editor is out of date (the mod's cockpit changed) | **Log > Reload cockpit from mod**. It rebuilds the editor's copy in Blender (a minute or two) and reloads. |

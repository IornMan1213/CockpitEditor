# 6. Troubleshooting

| Problem | Fix |
|---|---|
| The page says "Could not load … is server.py running?" | Start `Cockpit Editor.bat` (the black window must stay open). |
| The page is blank or the cockpit never appears | The 3D library loads from unpkg.com: check your internet connection, then reload (F5). |
| The .bat window closes at once | Python is missing or not on PATH. Install Python 3 and tick "Add to PATH", then `pip install numpy pillow`. |
| "Unity is running" when building | Close the Unity Editor (and wait for its background "AssetImportWorker" processes to end). |
| Build log ends with "compile pass failed" | Usually Unity was open. Close it and build again. Otherwise send Claude the log. |
| Built, but nothing changed in the game | The game was running: close it and press **Log > Install last build**. Also check you saved before building. |
| An instrument is gone | It is hidden: find it in the Layout list (greyed out) and press its eye button, or **Reset**. |
| Something is in the wrong place and I can't find it | Select it in the list and press **F** to look at it, or **Reset** it. |
| A decal's thin lines look blocky in the game | Make the lines a little bolder or the decal a little bigger. |
| A screen's shape changed after saving | Screens are kept convex; see the green outline in the outline box. |
| The cockpit in the editor is out of date (Claude changed the cockpit) | **Log > Reload cockpit from mod**. It rebuilds the editor's copy in Blender (a minute or two) and reloads. |
| I want to start again | Delete the jet's `cockpit\` folder in the fork (or select everything and Reset / Delete), then reload. |

## Port already in use

The editor uses port 8729. If something else uses it, change `PORT` near the top of `server.py`.

## Getting help from Claude

Tell Claude what you did and what happened; the build log (Log button) and the files in the fork's `cockpit\` folder show it
exactly what you set up.

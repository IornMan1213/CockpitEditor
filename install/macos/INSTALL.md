# Cockpit Editor 1.0 – macOS

## You need

- **macOS 11 (Big Sur) or newer**, Intel or Apple silicon
- **Python 3.8 or newer**: download it from <https://www.python.org/downloads/> and run the installer. (The `python3` that
  macOS offers to install with the Command Line Tools works too.)
- An internet connection the first time (the editor downloads numpy and Pillow once, and its 3D library when the page loads).

Nuclear Option itself is a Windows game. On a Mac you can design cockpits and export them as **.cpit** files to use on a
PC, or in the game if you run it on your Mac through CrossOver or a similar tool.

## Install

1. Unzip `CockpitEditor-1.0-macos.zip` (double-click it) and move the **CockpitEditor** folder where you like, e.g. your
   Documents folder.
2. The first time only: **right-click** (or Control-click) **`Cockpit Editor.command`** > **Open** > **Open**. macOS asks
   because the file came from the internet. If it still refuses, open *System Settings > Privacy & Security* and press
   **Open Anyway**.
3. A Terminal window opens. The first time it says *installing numpy and Pillow* and takes about a minute.
4. Your browser opens the editor at <http://127.0.0.1:8729>. Leave the Terminal window open while you work; close it (or
   press Ctrl+C in it) to stop the editor.

From then on, double-click **`Cockpit Editor.command`**.

If Terminal says *permission denied*, run this once in Terminal (drag the folder onto the window to type its path):

```sh
cd /path/to/CockpitEditor && chmod +x "Cockpit Editor.command" && xattr -dr com.apple.quarantine .
```

## Export a cockpit

1. Make your changes and press **Cmd+S** or **Ctrl+S**.
2. Press **Setups**, type a name and press **Export .cpit**. The list shows it; the download button saves the file.
3. On the PC with the game, put the .cpit file in the **Cockpits** folder next to the MiG-29SMT plugin
   (`BepInEx/plugins/.../MiG-29SMT/Cockpits`), or the MiG-29 Pack's (`BepInEx/plugins/.../MiG-29_Pack/Cockpits`), then pick
   it in the game: **F1** (Configuration Manager) > the MiG-29SMT instruments plugin (or MiG-29 Pack) > **Cockpit layout**.

If you run the game on this Mac, type its folder (the one with `NuclearOption.exe`) under **Setups > Game folder** and press
**Set**; the editor then puts setups straight into the game.

## Where your work is kept

`~/Library/Application Support/CockpitEditor` (in Finder: *Go > Go to Folder…* and paste it). Updating or deleting the
editor folder does not touch it.

## Update

Replace the editor folder with the new version. Your work stays where it is.

## Uninstall

Delete the editor folder. To remove your saved work too, delete `~/Library/Application Support/CockpitEditor`.

## Problems

| Problem | Fix |
|---|---|
| "cannot be opened because it is from an unidentified developer" | Right-click > **Open** > **Open** (see Install step 2). |
| "Python 3 is missing" | Install Python from python.org, then start the editor again. |
| "Could not install numpy and Pillow" | Check your internet connection and start it again, or run `python3 -m pip install numpy pillow` in Terminal. |
| The page stays blank | The 3D library loads from the internet: check the connection and reload the page. |

More in the [guides](https://github.com/IornMan1213/CockpitEditor/tree/main/docs).

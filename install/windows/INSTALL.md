# Cockpit Editor 1.0 – Windows

## You need

- **Windows 10 or 11**
- **Python 3.8 or newer**: download it from <https://www.python.org/downloads/>. In the installer, tick
  **Add python.exe to PATH** before pressing *Install Now*.
- **Nuclear Option** with the **MiG-29SMT** mod or the **MiG-29 Pack** installed (a version with cockpit setup support), through
  NOMM or by hand.
- An internet connection the first time (the editor downloads numpy and Pillow once, and its 3D library when the page loads).

## Install

1. Unzip `CockpitEditor-1.0-windows.zip` anywhere you like, e.g. `Documents\CockpitEditor`.
   (Unzip it first: running it from inside the zip does not work.)
2. Double-click **`Cockpit Editor.bat`** in that folder.
3. A black window opens. The first time it says *installing numpy and Pillow* and takes about a minute.
4. Your browser opens the editor at <http://127.0.0.1:8729>. Leave the black window open while you work; close it to stop
   the editor.

If Windows shows *Windows protected your PC*, press **More info** > **Run anyway** (the .bat only starts Python).

## Put your cockpit in the game

1. Make your changes and press **Ctrl+S**.
2. Press **Setups**, type a name, keep **Also put it in the game's Cockpits folder** ticked and press **Export .cpit**.
3. In the game press **F1** (Configuration Manager) > the MiG-29SMT instruments plugin > **Cockpit** > **Cockpit layout**
   and pick your setup. New setups appear after restarting the game.

The editor finds Steam installs of the game by itself, on any drive. If it does not, type the game folder (the one with
`NuclearOption.exe`; in Steam: right-click the game > *Manage* > *Browse local files*) under **Setups > Game folder** and
press **Set**.

## Where your work is kept

`%APPDATA%\CockpitEditor` (paste that into the Explorer address bar to open it). Updating or deleting the editor folder
does not touch it.

## Update

Unzip the new version over the old folder, or into a new one. Your work stays where it is.

## Uninstall

Delete the editor folder. To remove your saved work too, delete `%APPDATA%\CockpitEditor`.

## Problems

| Problem | Fix |
|---|---|
| The black window closes at once, or "Python was not found" | Install Python from python.org with **Add python.exe to PATH** ticked, then try again. |
| "Could not install numpy and Pillow" | Check your internet connection and start it again, or open a command prompt and run `py -m pip install numpy pillow`. |
| The page stays blank | The 3D library loads from the internet: check the connection and press F5. |
| "Nuclear Option was not found" in Setups | Type the game folder under **Setups > Game folder** and press **Set**. |

More in the [guides](https://github.com/IornMan1213/CockpitEditor/tree/main/docs).

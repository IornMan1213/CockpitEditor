# Cockpit Editor 1.0 – Linux

## You need

- Any recent desktop Linux (Ubuntu, Mint, Pop!_OS, Debian, Fedora, Arch, SteamOS desktop mode…)
- **Python 3.8 or newer**: almost always installed already (`python3 --version` to check).
- **Nuclear Option** through Steam (Proton) with the **MiG-29SMT** mod installed (a version with cockpit setup support).
- An internet connection the first time (the editor downloads numpy and Pillow once, and its 3D library when the page loads).

## Install

1. Unpack the download where you like, e.g. your home folder:

   ```sh
   tar -xzf CockpitEditor-1.0-linux.tar.gz -C ~
   ```

2. Start it from a terminal:

   ```sh
   cd ~/CockpitEditor && ./"Cockpit Editor.sh"
   ```

   (Or in your file manager: right-click **`Cockpit Editor.sh`** > *Run as a Program*. Some file managers open it as text
   when double-clicked.)

3. The first time it says *installing numpy and Pillow* and takes about a minute.
4. Your browser opens the editor at <http://127.0.0.1:8729>. Leave the terminal open while you work; press Ctrl+C or close
   it to stop the editor.

If the first start says it **could not install numpy and Pillow**, install them from your distribution, then start it
again:

| Distribution | Command |
|---|---|
| Ubuntu, Mint, Pop!_OS, Debian | `sudo apt install python3-numpy python3-pil` |
| Fedora | `sudo dnf install python3-numpy python3-pillow` |
| Arch, Manjaro, EndeavourOS | `sudo pacman -S python-numpy python-pillow` |

## Put your cockpit in the game

1. Make your changes and press **Ctrl+S**.
2. Press **Setups**, type a name, keep **Also put it in the game's Cockpits folder** ticked and press **Export .cpit**.
3. In the game press **F1** (Configuration Manager) > the MiG-29SMT instruments plugin > **Cockpit** > **Cockpit layout**
   and pick your setup. New setups appear after restarting the game.

The editor finds the game in every Steam library by itself, including Flatpak and Snap Steam and extra drives. If it does
not, type the game folder (in Steam: right-click the game > *Manage* > *Browse local files*) under **Setups > Game folder**
and press **Set**.

Mods only load under Proton with this in the game's Steam **Properties > Launch Options**:

```
WINEDLLOVERRIDES="winhttp=n,b" %command%
```

## Where your work is kept

`~/.local/share/CockpitEditor` (or `$XDG_DATA_HOME/CockpitEditor`). Updating or deleting the editor folder does not
touch it.

## Update

Unpack the new version over the old folder. Your work stays where it is.

## Uninstall

`rm -rf ~/CockpitEditor`. To remove your saved work too: `rm -rf ~/.local/share/CockpitEditor`.

## Problems

| Problem | Fix |
|---|---|
| `permission denied` when starting it | `chmod +x "Cockpit Editor.sh"` once, or start it with `sh "Cockpit Editor.sh"`. |
| "Python 3 is missing" | `sudo apt install python3` (or your distribution's package). |
| The page stays blank | The 3D library loads from the internet: check the connection and reload the page. |
| The setup is not in the game's list | Restart the game; check the launch option above. |

More in the [guides](https://github.com/IornMan1213/CockpitEditor/tree/main/docs).

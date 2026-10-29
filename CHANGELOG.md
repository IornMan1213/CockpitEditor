# Changelog

## 1.1

- **Works with the MiG-29 Pack.** The editor found a jet's game plugin only by its own mod's DLL, so with the MiG-29 Pack
  installed it found nothing to put cockpits into. It now looks for the jet's mod, then the pack, and the pack's one
  Cockpits folder lists only the setups for the jet you are editing. Setups says which one the game reads, and warns when
  a mod and the pack are both installed (the game would load the same jet twice).
- `COCKPIT_EDITOR_PORT` runs a second copy of the editor on another port.

Cockpit setups work in the game with the MiG-29SMT mod from 0.2.1 and the MiG-29 Fulcrum mod from 0.9.3, the first releases
with cockpit setup support (https://github.com/IornMan1213/MiG29SMT-NuclearOption/releases,
https://github.com/IornMan1213/MiG29-NuclearOption/releases). Needs Python 3.8 or newer.

## 1.0

First public release. Design your own MiG-29SMT cockpit in your browser and switch to it in the game, no rebuilding.

- **Rearrange the cockpit**: move, turn, resize or hide any gauge, display, switch panel or knob; needles, lights and
  screens keep working.
- **Custom screens (MFDs)** of any size and outline, showing any SMT display page, the tactical display or a page of your own.
- **Page designer**: build MFD pages from widgets (attitude, tapes, readings, RWR, stores, engines…) with a live preview
  that matches the game.
- **Decals**: STEP HERE, NO STEP, hazard stripes, placards, or your own pictures.
- **Cockpit setups (.cpit)**: export a whole cockpit as one file, put it in the game with one click, share it, and switch
  between setups in flight (F1 > Cockpit layout). A broken file falls back to the default cockpit.
- **Windows, macOS and Linux**: one launcher per system; Python's packages install themselves on the first start; finds
  Steam installs of the game on any drive, Proton included.
- Runs only on your PC (127.0.0.1) and never uploads anything; your work is kept outside the editor folder, so updates
  never touch it.

Needs Python 3.8 or newer and the MiG-29SMT mod with cockpit setup support (the release after 0.2.0). The MiG-29 (9.12)
can be edited too; its setups work in the game from the Fulcrum release that adds cockpit setup support.

# Changelog

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

# 4. Screens (custom MFDs)

A screen is a new display in its own bezel. On the **MiG-29SMT** it can show any of the jet's display pages or a page you
designed yourself ([Page designer](08-page-designer.md)); on both jets it can show the game's tactical display (experimental).

| Page | Shows |
|---|---|
| Flight display (PFD) | attitude, pitch ladder, speed / altitude / heading tapes, Mach, g, AoA, V/S |
| RWR / signature / engines | radar warning, your heat and radar signature, RPM, EGT, fuel, systems, cautions |
| Stores (SMS) | weapon stations and rounds, countermeasures, target |
| Standby attitude | small attitude / speed / altitude display |
| UFCP window | clock and selected weapon |
| Custom: *your page* | a page you built in the page designer |
| Tactical display (experimental) | the game's tactical map |

## Add one

1. **Add** tab, under **Screen (MFD)**: choose what it **Shows** and its **Shape**.
2. Press **Place a screen**, then click the spot in the cockpit.

## Size

Type the **Width** and **Height** in centimetres (untick **Keep shape** to change them separately). **Default size for this
page** copies the size of that page's built-in screen. Text comes out the same size as on the built-in screens, so a small
screen shows less room, not smaller text.

## Outline: the outline editor

Click the outline picture (or **Edit outline…**) in the right panel. A big editor opens, measured in millimetres:

| To | Do |
|---|---|
| select a corner | click it (it turns yellow) |
| move it | drag it, or type its **X** / **Y** in mm, or arrow keys: 0.5 mm, Shift 5 mm, Ctrl 0.1 mm |
| add a corner | double-click on an edge where you want it, or **Add corner** / **A** (halfway along the edge after the selected corner) |
| remove a corner | **Delete corner** / **Del** (at least 3 stay) |
| more corners everywhere | **Subdivide edges** (a new corner in the middle of every edge) |
| round a corner | select it, set **Round radius**, press **Round corner** (nothing selected = all corners) |
| keep it symmetric | tick **Mirror left / right**: moving a corner moves its partner on the other side. **Make symmetric** copies the left half onto the right. |
| flip it | **Flip left-right**, **Flip up-down** |
| zoom / pan | mouse wheel / right-drag; **Zoom to fit** |
| snap to a grid | **Grid** 1 / 2 / 5 / 10 mm with **Snap corners to the grid** |
| start from a shape | the preset buttons |
| undo | **Undo** / Ctrl+Z (inside the editor) |

**Done** (or Enter) applies it, **Cancel** (or Esc) throws it away. Dents are fine; an outline that crosses itself turns red
and cannot be used until you move a corner. When you press Done, the screen's box is fitted round the new outline, so the
corners stay exactly where you put them in the cockpit.

## Bezel

- **Bezel**: the frame width round the screen, in mm (it follows the outline, dents included).
- **Stands out**: how far the screen stands proud of the surface, in mm.
- **Bezel colour**: black or dark grey.

## Moving a built-in page to your screen

1. Add a screen showing, say, **RWR / signature / engines** where you want it.
2. In **Layout > Display pages**, untick that page to leave the built-in screen dark, or hide the whole built-in display.

Next: [Building and installing](05-building-and-installing.md).

# 8. Page designer (custom MFD pages, MiG-29SMT)

Build your own display pages from widgets and show them on your own screens or on the built-in ones. The preview draws with
the same pixels, font and colours as the game, with moving sample flight data, so what you see is what you get.

## Make a page

1. Open the **Pages** tab.
2. Pick a starting point: **Blank**, **Flight** (PFD style), **Systems** (engines, fuel, signature) or **Combat** (RWR,
   stores, warnings), and press **New**. The designer opens.
3. Or: select one of your screens and press **Design a page for this screen…** in the right panel.

## The designer

```
+------------------------------------------------------------------------------------------------------+
| Page designer  [name]  Background [ ]  Preview on [Left display (320x698)]  Redraws/s [10]  live data |
+--------------+---------------------------------------------------+-----------------------------------+
| Add a widget |                                                   | Widget properties                 |
|  Attitude    |          the page, exactly as the game            |  position, size, what it shows,   |
|  Speed tape  |          draws it (outside the screen's           |  label, colour, text size, frame  |
|  ...         |          outline is greyed out)                   |  front / back, duplicate, delete  |
+--------------+---------------------------------------------------+-----------------------------------+
```

- **Add a widget**: click one on the left; it appears on the page, selected.
- **Move**: drag it. **Resize**: drag one of the yellow squares. Arrow keys move 1 pixel (Shift 10), Alt+arrows resize.
- **Exact numbers**: Left, Top, Width, Height in % of the screen (the line under them gives the size in pixels).
- **Layers**: widgets added later are drawn on top. **Bring to front** / **Send to back** change that (e.g. put the speed
  and altitude tapes over the attitude display).
- **Duplicate** (Ctrl+D), **Delete** (Del), **Undo** (Ctrl+Z).
- **Preview on**: shows the page at the size it gets on a particular screen (built-in screens, your screens, or a free
  size). Pages are stored in fractions of the screen, so one page fits any screen; check it on each screen you use it on.
  Parts of the page outside a shaped screen's outline are greyed out (the game does not show them).
- **Background**: the page colour. **Redraws / s**: how often the game redraws it (10 is plenty; the flight page uses 20).
- **live data**: untick to freeze the sample data while you line things up.
- **Done** (or Enter / Esc) closes the designer. Save with Ctrl+S as usual.

## Widgets

| Widget | What it draws |
|---|---|
| Attitude | sky and ground, pitch ladder, bank scale and pointer, aircraft symbol |
| Speed tape / Altitude tape | moving tape with the value boxed in the middle |
| Heading tape | compass tape with the heading boxed on top |
| Value | any reading with a label, e.g. Mach, g, AoA, fuel, RPM (choose it in **Shows**); turns red / amber like the built-in pages when it should |
| Bar gauge | any reading as a bar (vertical if the box is taller than wide) |
| Clock | the time |
| Radar warning scope | threats by bearing and type, missiles, lock |
| Stores list | weapon stations and rounds, the selected one highlighted |
| Countermeasures | flares, chaff, ECM |
| Target | target name and range |
| Engines | RPM and EGT for both engines |
| Fuel | fuel in kg, bar, drop tanks |
| Signature | engine heat (IR), radar cross-section, radar on / off |
| Caution list | active warnings (red) and cautions (amber) |
| Warnings | MISSILE (flashing), LOCK, GEAR, A/B |
| Text label | your own text |
| Box | a filled box or an outline |
| Round dial | any reading on a 270 degree dial with a red zone (Options: scale from / to, red from, show the number) |
| Compass rose | turning compass card with N E S W, lubber line and aircraft symbol |
| AoA indexer | slow / on speed / fast symbols (Options: the on-speed AoA range) |
| Vertical tape | any reading as a moving tape (Options: range shown, tick spacing, which side the scale is on) |
| Line | across, up and down or diagonal, any thickness and colour |
| Picture | your own small PNG (logo, symbol), transparent parts stay see-through |

**Options** (right panel, under the widget's settings): every widget can have a **Background** colour and a coloured **Border**. Values: decimals, a unit after the number, label colour. Tapes: the range shown. Attitude: sky and ground colours, ladder every 5 or 10 degrees, bank scale on or off. Stores: rows at most.

Text uses the game's pixel font; **Text size** Auto fits it to the box, or pick 1 (tiny) to 5 (big).

## Show a page

- **On your screen**: select the screen, **Shows** > *Custom: your page*.
- **On a built-in screen**: **Pages** tab > **Built-in screens show** > pick your page for the left display, right display,
  stores, standby or UFCP window (**Standard** puts the original back).

Deleting a page puts the screens that showed it back on a standard page.

## Where it is saved

`cockpit\mfd_pages.json` in the SMT fork. The build puts it next to the instruments plugin (and in the release zip); the
plugin reads it when the jet spawns.

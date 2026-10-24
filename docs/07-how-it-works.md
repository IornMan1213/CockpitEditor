# 7. How it works (for developers)

## Pieces

| Part | File | Job |
|---|---|---|
| Launcher | `start.py` (+ `Cockpit Editor.bat` / `.sh` / `.command`) | Puts numpy and Pillow in `.venv` when Python lacks them, then runs `server.py`; opens the page if the editor already runs. |
| Server | `server.py` | Python stdlib HTTP server on 127.0.0.1:8729: serves the page, the cockpit mesh and atlas; saves; turns decals into meshes and screens into polygons with bezels; exports / installs .cpit files; finds the game; runs Blender refreshes, builds and installs. Refuses requests whose Host or Origin is not the editor's own (other web pages, DNS rebinding). |
| Page | `static/index.html`, `static/app.js` | three.js 0.160 (unpkg import map). Shows the cockpit, the movable groups, decals and screens; all editing. |
| Config | `jets.json`, `jets.local.json` | `jets.json` (shipped): per jet `name`, `instruments_dll` (how the game's plugin folder is found), `pages`, `builtin_screens`. `jets.local.json` (developers, git-ignored; see `jets.local.example.json`) is merged over it per jet: `repo`, `project` (both set = developer mode for that jet), `work`, `real_source`, `build_out`, `plugin_dir`, `test_build`; top level `_build_enabled`, `_build_disabled_reason`, `_blender`, `_test_build_script`. |
| Cockpit data | `jets/<jet>/` | What the editor shows: `cockpit_mesh.json`, `cockpit_atlas.png`, `cockpit_atlas.json` (from the mod's `blender/cockpit_build.py`). Shipped with the editor; only these three files are tracked. |
| Player data | `data_dir()` | Windows `%APPDATA%\CockpitEditor`, Linux `$XDG_DATA_HOME` or `~/.local/share/CockpitEditor`, macOS `~/Library/Application Support/CockpitEditor` (`COCKPIT_EDITOR_DATA` overrides): one folder per jet, and `settings.json` (`game_dir`). In developer mode a jet saves to `<repo>/cockpit` instead. |
| Finding the game | `server.py` `find_game`, `plugin_dir` | `settings.json` `game_dir`, else every Steam library (registry / default Steam folders, `libraryfolders.vdf`, Flatpak and Snap Steam on Linux). The jet's plugin folder is wherever `instruments_dll` sits under `BepInEx/plugins` (NOMM's `com.nikkorap.blueprinter/addons/...` or a hand install). |
| Groups | mod `blender/cockpit_build.py` | `G(id, label, kind, frame)` opens a movable group; while open, every tub face goes into the group's own part and other parts drawn (needles, lamps, screens) are recorded as owned. On export each group is appended to the tub as a vertex / triangle range; `cockpit_mesh.json` gets `"groups"`: id, label, kind, verts, tris, frame (centre, normal toward the pilot, right, up; Unity frame), size, parts. |
| Layout applier | mod `tools/cockpit_layout.py` | Before the Unity build: for each changed group, `x' = pos + s · B1 · B0ᵀ · (x − c0)` on its tub range and owned parts (pivots as points, normals / axis / up as directions); hidden = scale 1e-4. Keeps Blender's output as `cockpit_mesh_base.json`, so it is idempotent (quick builds re-apply from the base). |
| Decals / screens in Unity | mod `unity/MiG29Tools/MiG29Cockpit.cs` `BuildCustom` | Reads `<source>/custom/custom_mesh.json`; decals get a copy of the cockpit material with their texture; `screen` parts use the cockpit material (dark without the plugin), `tac` parts the game's tacScreen material. Hidden built-in pages get a child `off`. |
| Custom screen pages | SMT `unity/MiG29Instruments/Pfd.cs` `ScreenDriver` | Quads named `MiG29_ck_cs_<id>__<page>` are drawn with that page, at the built-in page's pixels per metre; a screen with an `off` child is left dark. |
| Custom MFD pages | SMT `unity/MiG29Instruments/Widgets.cs`, editor `static/mfd.js` | `cockpit/mfd_pages.json` (pages of widgets in fractions of the screen, `assign` onto built-in screens) is shipped next to the plugin DLL; the plugin parses it with its own small JSON reader and draws each widget with the screen canvas. `mfd.js` is a line-for-line port of that canvas, font and the widgets, so the designer preview matches the game. Custom screens show a page as `cs_<id>__c_<pageid>`. |
| Build | mod `tools/build_mig29.ps1` | Copies `<repo>/cockpit/build` to `<source>/custom`, runs Blender (skipped with `-Quick` when the mesh already has groups), applies the layout, then the Unity passes. |

## Developer setup

1. Copy `jets.local.example.json` to `jets.local.json` and fill in the paths for the jets you build (any OS; forward slashes
   are fine on Windows too). Restart the editor.
2. **Build & Install**, **Log** and **Reload cockpit from mod** appear for those jets. Builds run the mod's
   `tools/build_mig29.ps1` with `pwsh` (or Windows PowerShell); Blender is `_blender`, else `blender` on PATH.
3. With `work` set to this folder's `jets/<jet>`, **Reload cockpit from mod** writes the cockpit the editor ships: commit the
   three tracked files there to publish it with the next editor release (the Blender inputs copied next to them are ignored).

## Coordinates

Everything saved is in the Unity MiG frame (x right, y up, z forward; left-handed). The page shows it with z flipped
(`toU` / `fromU` in app.js). A frame's right is always `up × normal`, in either space, so a rotation built from two frames
is the same in both.

## Decal meshes

The game's cockpit shader has no transparency. The server resizes the decal picture's alpha to 192 px on its long side,
covers the opaque pixels with rectangles (runs per row, merged downward), and textures them with the picture (colours bled
into the clear pixels, alpha made opaque because the shader reads alpha as the damage burn mask).

## Screens

Outlines are convex hulls (the plugin lays pages out inside the hull), counter-clockwise in −0.5..0.5 of width and height;
the bezel is the outline offset outward by the bezel width, with a front ring, a backing and sides down into the surface.

## Adding a new movable group

In the mod's `blender/cockpit_build.py`, before the code that builds the thing: `G("id", "Label", "instrument", panel_frame(u, v, 0.0))`
(or no frame to work it out from the faces), and `G(None)` after it. Run **Reload cockpit from mod** in the editor.
`tools/add_groups_*.py` are the one-off scripts that added the current groups.

## Endpoints

`GET /api/jets`, `/api/mesh?jet=`, `/api/atlas?jet=`, `/api/load?jet=`, `/api/decal?jet=&id=`, `/api/status`;
`/api/cpit/list?jet=`, `/api/cpit/download?jet=&where=&name=`;
`POST /api/save?jet=` `{custom, images, layout, mfd}`, `/api/settings` `{game_dir}`, `/api/cpit/export?jet=` `{name, install}`,
`/api/cpit/import?jet=` `{content}` or `{name, where}`, `/api/cpit/install?jet=` `{name}`, `/api/cpit/delete?jet=` `{name, where}`;
developer mode only: `/api/refresh?jet=`, `/api/build?jet=` `{quick, install}`, `/api/install?jet=`.

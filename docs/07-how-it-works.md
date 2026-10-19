# 7. How it works (for developers)

## Pieces

| Part | File | Job |
|---|---|---|
| Server | `server.py` | Python stdlib HTTP server on 127.0.0.1:8729: serves the page, the cockpit mesh and atlas; saves; turns decals into meshes and screens into polygons with bezels; runs Blender refreshes, builds and installs. |
| Page | `static/index.html`, `static/app.js` | three.js 0.160 (unpkg import map). Shows the cockpit, the movable groups, decals and screens; all editing. |
| Config | `jets.json` | per jet: `repo` (the fork), `work` (editor's copy of the cockpit), `real_source` (the mod's source folder on the Unity project drive), `project`, `build_out`, `plugin_dir`, `pages`, `builtin_screens`; `_build_enabled`. |
| Groups | mod `blender/cockpit_build.py` | `G(id, label, kind, frame)` opens a movable group; while open, every tub face goes into the group's own part and other parts drawn (needles, lamps, screens) are recorded as owned. On export each group is appended to the tub as a vertex / triangle range; `cockpit_mesh.json` gets `"groups"`: id, label, kind, verts, tris, frame (centre, normal toward the pilot, right, up; Unity frame), size, parts. |
| Layout applier | mod `tools/cockpit_layout.py` | Before the Unity build: for each changed group, `x' = pos + s · B1 · B0ᵀ · (x − c0)` on its tub range and owned parts (pivots as points, normals / axis / up as directions); hidden = scale 1e-4. Keeps Blender's output as `cockpit_mesh_base.json`, so it is idempotent (quick builds re-apply from the base). |
| Decals / screens in Unity | mod `unity/MiG29Tools/MiG29Cockpit.cs` `BuildCustom` | Reads `<source>/custom/custom_mesh.json`; decals get a copy of the cockpit material with their texture; `screen` parts use the cockpit material (dark without the plugin), `tac` parts the game's tacScreen material. Hidden built-in pages get a child `off`. |
| Custom screen pages | SMT `unity/MiG29Instruments/Pfd.cs` `ScreenDriver` | Quads named `MiG29_ck_cs_<id>__<page>` are drawn with that page, at the built-in page's pixels per metre; a screen with an `off` child is left dark. |
| Build | mod `tools/build_mig29.ps1` | Copies `<repo>/cockpit/build` to `<source>/custom`, runs Blender (skipped with `-Quick` when the mesh already has groups), applies the layout, then the Unity passes. |

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
`POST /api/save?jet=` `{custom, images, layout}`, `/api/refresh?jet=`, `/api/build?jet=` `{quick, install}`, `/api/install?jet=`.

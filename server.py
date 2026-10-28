"""Cockpit Editor: a local web app for placing decals (painted stencils such as STEP HERE) and custom screens in the MiG-29 /
MiG-29SMT cockpits and exporting them as cockpit setups (.cpit) the game switches between.

    python start.py             (or the "Cockpit Editor" launcher for your OS) -> http://127.0.0.1:8729

Config: jets.json (shipped) with jets.local.json (mod developers only, not shipped) merged over it per jet. With a jet's
"repo" and "project" set there, saves go to <repo>/cockpit and Build & Install / Reload cockpit from mod are available;
otherwise saves go to the user's data folder (data_dir()) and the cockpit comes from jets/<jet>/.

What it writes, per jet (<save> is <repo>/cockpit or <data>/<jet>):
    <save>/custom.json                  the elements as placed in the editor (the editor's own save file)
    <save>/decals/<id>.png              each decal's picture as drawn in the editor (kept for re-editing)
    <save>/build/                       what the Unity builder reads (the build script copies it to <source>/custom):
        custom_mesh.json                meshes in the cockpit_mesh.json part format, Unity MiG frame
        <id>.png                        decal textures (colours bled into the clear areas, alpha opaque)
        decal_metallic.png              the cockpit paint's metallic/smoothness, for the decal material

Decals: the game's cockpit shader has no transparency, so a decal is a mesh of just its painted pixels (rectangles merged row
by row from the picture's alpha), textured with the picture. Screens: a quad named cs_<id>__<page> that the SMT instruments
plugin draws that page on (or the game's tactical display for "tac"), with a bezel box round it.
"""
import base64, io, json, os, re, shutil, subprocess, sys, threading, time, traceback
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
VERSION = "1.1"
PORT = int(os.environ.get("COCKPIT_EDITOR_PORT", "8729"))   # another port: run a second copy beside the first
ATLAS_W = 4096
MESH_RES = 192            # decal mesh resolution (pixels along its long side)
BUILD = {"running": False, "log": "", "jet": None, "ok": None}


def load_config():
    cfg = json.load(open(os.path.join(HERE, "jets.json"), encoding="utf8"))
    local = os.path.join(HERE, "jets.local.json")
    if os.path.exists(local):
        for k, v in json.load(open(local, encoding="utf8")).items():
            cfg[k] = {**cfg[k], **v} if isinstance(v, dict) and isinstance(cfg.get(k), dict) else v
    return cfg


CFG = load_config()
JETS = {k: v for k, v in CFG.items() if not k.startswith("_")}


def data_dir():
    """Where a player's own cockpits are kept, outside the editor folder so updating the editor never touches them."""
    if os.environ.get("COCKPIT_EDITOR_DATA"):
        return os.environ["COCKPIT_EDITOR_DATA"]
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
    elif sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    return os.path.join(base, "CockpitEditor")


def is_dev(jet):
    return bool(JETS[jet].get("repo") and JETS[jet].get("project"))


def work_dir(jet):
    return JETS[jet].get("work") or os.path.join(HERE, "jets", jet)


def cockpit_dir(jet):
    return os.path.join(JETS[jet]["repo"], "cockpit") if JETS[jet].get("repo") else os.path.join(data_dir(), jet)


def load_custom(jet):
    p = os.path.join(cockpit_dir(jet), "custom.json")
    if os.path.exists(p):
        return json.load(open(p, encoding="utf8"))
    return {"version": 1, "decals": [], "screens": [], "hide": []}


# ------------------------------------------------------------------------------------------------ geometry
def v3(a):
    return np.array(a, dtype=np.float64)


class Mesh:
    def __init__(self, name, material, texture=None):
        self.name, self.material, self.texture = name, material, texture
        self.v, self.n, self.uv, self.t = [], [], [], []

    def quad(self, pts, uvs, normal):
        """pts bottom-left, top-left, top-right, bottom-right as seen from the front; Unity's front faces wind clockwise, i.e.
        cross(b - a, c - a) along the normal (checked, flipped if not)."""
        a, b, c = (v3(p) for p in pts[:3])
        if np.dot(np.cross(b - a, c - a), normal) < 0:
            pts, uvs = pts[::-1], uvs[::-1]
        i = len(self.v)
        for p, u in zip(pts, uvs):
            self.v.append([float(x) for x in p]); self.n.append([float(x) for x in normal]); self.uv.append([float(x) for x in u])
        self.t += [i, i + 1, i + 2, i, i + 2, i + 3]

    def tri(self, pts, uvs, normal):
        a, b, c = (v3(p) for p in pts)
        if np.dot(np.cross(b - a, c - a), normal) < 0:
            pts, uvs = pts[::-1], uvs[::-1]
        i = len(self.v)
        for p, u in zip(pts, uvs):
            self.v.append([float(x) for x in p]); self.n.append([float(x) for x in normal]); self.uv.append([float(x) for x in u])
        self.t += [i, i + 1, i + 2]

    def part(self):
        d = {"name": self.name, "material": self.material,
             "vertices": [x for p in self.v for x in p], "normals": [x for p in self.n for x in p],
             "uvs": [x for p in self.uv for x in p], "triangles": self.t}
        if self.texture:
            d["texture"] = self.texture
        return d


def basis(e):
    n = v3(e["normal"]); n /= np.linalg.norm(n)
    up = v3(e["up"]); up -= n * np.dot(up, n); up /= np.linalg.norm(up)
    right = v3(e["right"]) if "right" in e else np.cross(n, up)
    right -= n * np.dot(right, n); right /= np.linalg.norm(right)
    return v3(e["pos"]), right, up, n


def convex_ccw(pts):
    """Convex hull, counter-clockwise (the plugin lays its pages out inside the hull, so screens are kept convex)."""
    P = sorted(set((round(float(x), 5), round(float(y), 5)) for x, y in pts))
    if len(P) < 3:
        return [(-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)]

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in P:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 1e-12:
            lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 1e-12:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]


def _segs_cross(p1, p2, p3, p4):
    def o(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    d1, d2, d3, d4 = o(p3, p4, p1), o(p3, p4, p2), o(p1, p2, p3), o(p1, p2, p4)
    return (d1 > 0) != (d2 > 0) and (d3 > 0) != (d4 > 0) and abs(d1) > 1e-12 and abs(d2) > 1e-12


def simple_ccw(pts):
    """The outline as drawn (dents allowed), counter-clockwise; one that crosses itself falls back to its convex hull."""
    P = []
    for x, y in pts:
        q = (round(float(x), 5), round(float(y), 5))
        if not P or q != P[-1]:
            P.append(q)
    if len(P) > 1 and P[0] == P[-1]:
        P.pop()
    if len(P) < 3:
        return convex_ccw(pts)
    area = sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))
    if abs(area) < 1e-9:
        return convex_ccw(pts)
    if area < 0:
        P.reverse()
    m = len(P)
    for i in range(m):
        for j in range(i + 2, m):
            if i == 0 and j == m - 1:
                continue
            if _segs_cross(P[i], P[(i + 1) % m], P[j], P[(j + 1) % m]):
                return convex_ccw(pts)
    return P


def ear_clip(poly):
    """Triangles (index triples) of a simple counter-clockwise polygon."""
    idx = list(range(len(poly)))
    tris = []

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    def inside(p, a, b, c):
        return cross(a, b, p) >= -1e-12 and cross(b, c, p) >= -1e-12 and cross(c, a, p) >= -1e-12

    guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = poly[i0], poly[i1], poly[i2]
            if cross(a, b, c) <= 1e-12:
                continue
            if any(inside(poly[j], a, b, c) for j in idx if j not in (i0, i1, i2)):
                continue
            tris.append((i0, i1, i2)); idx.pop(k); break
        else:
            break
    if len(idx) == 3:
        tris.append(tuple(idx))
    return tris


def offset_poly(poly, d):
    """Counter-clockwise polygon moved out by d on every side (corners where the offset edges meet; a very sharp corner's
    mitre is held to 3 d so it does not spike)."""
    m = len(poly)
    lines = []
    for i in range(m):
        a, b = np.array(poly[i]), np.array(poly[(i + 1) % m])
        e = (b - a) / max(np.linalg.norm(b - a), 1e-12)
        lines.append((a + np.array([e[1], -e[0]]) * d, e))
    out = []
    for i in range(m):
        (p0, e0), (p1, e1) = lines[i - 1], lines[i]
        den = e0[0] * e1[1] - e0[1] * e1[0]
        if abs(den) < 1e-9:
            out.append(tuple(p1)); continue
        t = ((p1[0] - p0[0]) * e1[1] - (p1[1] - p0[1]) * e1[0]) / den
        q = p0 + e0 * t
        v = np.array(poly[i])
        if np.linalg.norm(q - v) > 3 * abs(d):
            q = v + (q - v) / np.linalg.norm(q - v) * 3 * abs(d)
        out.append(tuple(q))
    return out


def greedy_rects(mask):
    """Rectangles (x0, x1, y0, y1), y down, covering the True pixels: runs per row, merged downward while identical."""
    h, w = mask.shape
    rects, active = [], {}
    for y in range(h + 1):
        runs = set()
        if y < h:
            row = mask[y]
            x = 0
            while x < w:
                if row[x]:
                    x0 = x
                    while x < w and row[x]:
                        x += 1
                    runs.add((x0, x))
                else:
                    x += 1
        nxt = {}
        for r in runs:
            nxt[r] = active.get(r, y)
        for r, y0 in active.items():
            if r not in runs:
                rects.append((r[0], r[1], y0, y))
        active = nxt
    return rects


def bleed(img):
    """RGB pushed out into the clear pixels (so the mesh's edge texels never fetch black), alpha made opaque (the cockpit
    shader reads alpha as the damage burn mask)."""
    a = np.asarray(img.convert("RGBA")).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3] > 127
    if not al.any():
        al[:] = True
    filled = al.copy()
    out = rgb.copy()
    for _ in range(24):
        if filled.all():
            break
        acc = np.zeros_like(out); cnt = np.zeros(filled.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            m = np.roll(np.roll(filled, dy, 0), dx, 1)
            acc += np.roll(np.roll(out, dy, 0), dx, 1) * m[..., None]; cnt += m
        new = (~filled) & (cnt > 0)
        out[new] = acc[new] / cnt[new][:, None]
        filled |= new
    out = np.concatenate([out, np.full(out.shape[:2] + (1,), 255, np.float32)], -1)
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), "RGBA")


def atlas_uv(jet, cell):
    at = json.load(open(os.path.join(work_dir(jet), "cockpit_atlas.json"), encoding="utf8"))
    x, y, w, h = at["rects"][cell]
    return ((x + w / 2) / ATLAS_W, 1 - (y + h / 2) / ATLAS_W)


def export(jet):
    """custom.json + decal pictures -> cockpit/build (what the Unity builder reads)."""
    cd = cockpit_dir(jet)
    custom = load_custom(jet)
    out = os.path.join(cd, "build")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out, exist_ok=True)
    parts, stats = [], {"decals": 0, "screens": 0, "tris": 0}
    for d in custom.get("decals", []):
        src = os.path.join(cd, "decals", d["id"] + ".png")
        if not os.path.exists(src):
            continue
        img = Image.open(src).convert("RGBA")
        W, H = img.size
        s = MESH_RES / max(W, H)
        mw, mh = max(2, round(W * s)), max(2, round(H * s))
        mask = np.asarray(img.getchannel("A").resize((mw, mh), Image.BOX)) > 110
        pos, right, up, n = basis(d)
        c = pos + n * float(d.get("offset", 0.0015))
        w, h = float(d["w"]), float(d["h"])
        m = Mesh("decal_" + d["id"], "decal", d["id"] + ".png")

        def P(x, y):
            return c + right * ((x / mw) - 0.5) * w + up * (0.5 - y / mh) * h

        for x0, x1, y0, y1 in greedy_rects(mask):
            m.quad([P(x0, y1), P(x0, y0), P(x1, y0), P(x1, y1)],
                   [(x0 / mw, 1 - y1 / mh), (x0 / mw, 1 - y0 / mh), (x1 / mw, 1 - y0 / mh), (x1 / mw, 1 - y1 / mh)], n)
        if not m.t:
            continue
        bleed(img).save(os.path.join(out, d["id"] + ".png"))
        parts.append(m.part()); stats["decals"] += 1; stats["tris"] += len(m.t) // 3
    black, dgrey = atlas_uv(jet, "paint_black"), atlas_uv(jet, "paint_dgrey")
    for s in custom.get("screens", []):
        pos, right, up, n = basis(s)
        w, h = float(s["w"]), float(s["h"])
        b, dep = float(s.get("bezel", 0.008)), float(s.get("depth", 0.008))
        page = s["page"]
        # the screen's outline in -0.5..0.5 across its width and height, counter-clockwise from the front; any simple polygon
        # (dents allowed), cut into triangles
        shape = simple_ccw(s.get("shape") or [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]])
        inner = [(x * w, y * h) for x, y in shape]
        tris = ear_clip(inner)
        outer = offset_poly(inner, b)

        def P3(p, z):
            return pos + right * p[0] + up * p[1] + n * z

        scr = Mesh(f"cs_{s['id']}__{page}", "tac" if page == "tac" else "screen")
        if page == "tac":   # the tactical display's render texture (main area u 0..0.75, v 0.25..1) across the shape's box
            uv = [(0.75 * (x + 0.5), 0.25 + 0.75 * (y + 0.5)) for x, y in shape]
        else:               # the plugin maps its own texture; dark without it
            uv = [black] * len(shape)
        for a, b_, c in tris:
            scr.tri([P3(inner[a], dep + 0.0006), P3(inner[b_], dep + 0.0006), P3(inner[c], dep + 0.0006)], [uv[a], uv[b_], uv[c]], n)
        parts.append(scr.part())
        bz = Mesh(f"cbz_{s['id']}", "ck")
        col = dgrey if s.get("bezelColor") == "grey" else black
        m = len(inner)
        for i in range(m):                                   # front ring
            j = (i + 1) % m
            bz.quad([P3(outer[i], dep), P3(outer[j], dep), P3(inner[j], dep), P3(inner[i], dep)], [col] * 4, n)
        for a, b_, c in tris:                                # backing under the screen
            bz.tri([P3(inner[a], dep), P3(inner[b_], dep), P3(inner[c], dep)], [col] * 3, n)
        if dep > 0.0005:                                     # sides down into the surface
            for i in range(m):
                j = (i + 1) % m
                ex, ey = outer[j][0] - outer[i][0], outer[j][1] - outer[i][1]
                out_dir = right * ey - up * ex
                bz.quad([P3(outer[i], -0.002), P3(outer[i], dep), P3(outer[j], dep), P3(outer[j], -0.002)], [col] * 4, out_dir / max(np.linalg.norm(out_dir), 1e-9))
        parts.append(bz.part())
        stats["screens"] += 1; stats["tris"] += (len(scr.t) + len(bz.t)) // 3
    hide = [h for h in custom.get("hide", []) if h in JETS[jet]["builtin_screens"]]
    json.dump({"parts": parts, "hide": hide}, open(os.path.join(out, "custom_mesh.json"), "w"))
    Image.new("RGBA", (4, 4), (0, 0, 0, 70)).save(os.path.join(out, "decal_metallic.png"))
    stats["hidden"] = hide
    return stats


# ------------------------------------------------------------------------------------------------ built-in screens
def builtin_screens(jet):
    """Size (m) of each built-in plugin screen, from the cockpit mesh: the editor offers them as default sizes."""
    p = os.path.join(work_dir(jet), "cockpit_mesh.json")
    if not os.path.exists(p) or not JETS[jet]["builtin_screens"]:
        return {}
    parts = {q["name"]: q for q in json.load(open(p, encoding="utf8"))["parts"]}
    res = {}
    for name in JETS[jet]["builtin_screens"]:
        q = parts.get(name)
        if not q:
            continue
        v = np.array(q["vertices"], dtype=np.float64).reshape(-1, 3)
        n = np.array(q["normals"][:3], dtype=np.float64); n /= np.linalg.norm(n)
        best, right = -9, np.array([1.0, 0, 0])
        for i in range(len(v)):
            for j in range(i + 1, len(v)):
                d = v[j] - v[i]
                L = np.linalg.norm(d)
                if L < 1e-6:
                    continue
                d /= L
                hscore = abs(d[0]) - abs(d[1])
                if hscore > best:
                    best, right = hscore, d
        right -= n * np.dot(right, n); right /= np.linalg.norm(right)
        up = np.cross(right, n); up = up if up[1] > 0 else -up
        a, b = v @ right, v @ up
        res[name] = {"w": round(float(a.max() - a.min()), 4), "h": round(float(b.max() - b.min()), 4)}
    return res


# ------------------------------------------------------------------------------------------------ build + install
def running(*names):
    """Whether a process with one of these executable names runs."""
    try:
        if sys.platform == "win32":
            want = {n.lower() for n in names}
            out = subprocess.run(["tasklist", "/FO", "CSV", "/NH"], capture_output=True, text=True,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
            return any(line.split('","')[0].strip('"').lower() in want for line in out.splitlines())
        # executable names (Linux cuts them to 15 characters: the game under Proton is "NuclearOption.e"; macOS gives paths)
        out = subprocess.run(["ps", "-A", "-o", "comm="], capture_output=True, text=True).stdout
        for line in out.splitlines():
            c = os.path.basename(line.strip())
            if c in names or (len(c) == 15 and any(n.startswith(c) for n in names)):
                return True
        return False
    except Exception:
        return False


def game_running():
    return running("NuclearOption.exe", "NuclearOption")


def unity_running():
    return running("Unity.exe", "Unity")


# ------------------------------------------------------------------------------------------------ finding the game
def settings_path():
    return os.path.join(data_dir(), "settings.json")


def load_settings():
    return read_json(settings_path(), {})


def steam_roots():
    roots = []
    if sys.platform == "win32":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam") as k:
                roots.append(winreg.QueryValueEx(k, "SteamPath")[0])
        except OSError:
            pass
        roots += [r"C:\Program Files (x86)\Steam", r"C:\Program Files\Steam"]
    elif sys.platform == "darwin":
        roots.append(os.path.expanduser("~/Library/Application Support/Steam"))
    else:
        roots += [os.path.expanduser(p) for p in ("~/.local/share/Steam", "~/.steam/steam", "~/.steam/root", "~/.steam/debian-installation",
                                                  "~/.var/app/com.valvesoftware.Steam/.local/share/Steam",
                                                  "~/snap/steam/common/.local/share/Steam")]
    out = []
    for r in roots:
        if os.path.isdir(r) and os.path.realpath(r) not in (os.path.realpath(o) for o in out):
            out.append(r)
    return out


def find_game():
    """The Nuclear Option folder: the one set in the editor, else the first one with BepInEx (a PC can have several, e.g. a
    leftover Steam install next to the one Steam runs)."""
    games = find_games()
    return next((g for g in games if os.path.isdir(os.path.join(g, "BepInEx", "plugins"))), games[0] if games else None)


def find_games():
    own = load_settings().get("game_dir")
    if own and os.path.isdir(own):
        return [own]
    found, libs = [], []
    for root in steam_roots():
        libs.append(root)
        vdf = os.path.join(root, "steamapps", "libraryfolders.vdf")
        try:
            libs += [p.replace("\\\\", "\\") for p in re.findall(r'"path"\s+"([^"]+)"', open(vdf, encoding="utf8", errors="replace").read())]
        except OSError:
            pass
    for lib in libs:
        g = os.path.join(lib, "steamapps", "common", "Nuclear Option")
        if os.path.isdir(g) and os.path.realpath(g) not in (os.path.realpath(x) for x in found):
            found.append(g)
    return found


def find_dll(dll):
    """The plugin folder holding this DLL (wherever NOMM or the player put it), or None."""
    dll = dll.lower()
    for game in find_games():
        plugins = os.path.join(game, "BepInEx", "plugins")
        for root, dirs, files in os.walk(plugins):
            if root[len(plugins):].count(os.sep) >= 5:
                dirs[:] = []
            if any(f.lower() == dll for f in files):
                return root
    return None


def plugin_targets(jet):
    """Every installed plugin that flies this jet, as (name, folder): its own mod, then any pack that carries it ("packs" in
    jets.json: the MiG-29 Pack has both jets, one plugin, one Cockpits folder). More than one means a broken install: the game
    would load the same aircraft twice."""
    j = JETS[jet]
    if j.get("plugin_dir"):
        return [(j["name"] + " mod", j["plugin_dir"])]
    found = []
    for name, dll in [(j["name"] + " mod", j["instruments_dll"])] + [(p["name"], p["dll"]) for p in j.get("packs", [])]:
        d = find_dll(dll)
        if d:
            found.append((name, d))
    return found


def plugin_dir(jet):
    """The jet's plugin folder (its mod's, else the pack's), or None."""
    t = plugin_targets(jet)
    return t[0][1] if t else None


def log(msg):
    BUILD["log"] += msg + "\n"


def powershell():
    return shutil.which("pwsh") or shutil.which("powershell") or "powershell"


def blender():
    if CFG.get("_blender"):
        return CFG["_blender"]
    if sys.platform == "win32" and not shutil.which("blender"):
        return r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
    if sys.platform == "darwin" and not shutil.which("blender"):
        return "/Applications/Blender.app/Contents/MacOS/Blender"
    return shutil.which("blender") or "blender"


def run_build(jet, quick, install):
    j = JETS[jet]
    BUILD.update(running=True, log="", jet=jet, ok=None)
    try:
        log(f"== {j['name']}: exporting the cockpit editor elements")
        log(json.dumps(export(jet)))
        script = os.path.join(j["repo"], "tools", "build_mig29.ps1")
        args = [powershell(), "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Project", j["project"]]
        if quick:
            args.append("-Quick")
        log("== building (Unity; " + ("quick, a few minutes" if quick else "full, 10-15 minutes") + ")")
        t0 = time.time()
        p = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf8", errors="replace",
                             cwd=j["repo"], creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        for line in p.stdout:
            log(line.rstrip())
        p.wait()
        log(f"== build finished in {time.time() - t0:.0f} s, exit code {p.returncode}")
        if p.returncode != 0:
            BUILD["ok"] = False
            return
        nobps = sorted((os.path.join(j["build_out"], f) for f in os.listdir(j["build_out"]) if f.endswith(".nobp")), key=os.path.getmtime)
        if not nobps:
            log("!! no .nobp came out"); BUILD["ok"] = False; return
        if install:
            if game_running():
                log("!! Nuclear Option is running: not installed. Close the game and press Install.")
            else:
                install_files(jet, nobps[-1])
        ts = CFG.get("_test_build_script")
        if ts and os.path.exists(ts):
            r = subprocess.run([powershell(), "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ts, j["test_build"], "cockpit editor build"],
                               capture_output=True, text=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            log((r.stdout + r.stderr).strip())
        BUILD["ok"] = True
    except Exception:
        log(traceback.format_exc()); BUILD["ok"] = False
    finally:
        BUILD["running"] = False


# ------------------------------------------------------------------------------------------------ cockpit setups (.cpit)
# A .cpit is one whole cockpit setup that the instruments plugins can switch to in game (Cockpits folder next to the plugin,
# Configuration Manager > Cockpit layout): the instrument groups' poses, the decals and screens as finished meshes with their
# pictures, the hidden built-in screens and the MFD pages. "editor" carries the editor's own data so the setup can be opened
# and changed again (Import).
CPIT_VERSION = 1


def safe_name(name):
    n = re.sub(r"[^A-Za-z0-9 _.()-]", "", (name or "").strip()).strip(" .")
    return n[:60] or "Cockpit"


def setups_dir(jet):
    return os.path.join(cockpit_dir(jet), "setups")


def game_setups_dir(jet):
    p = plugin_dir(jet)
    return p and os.path.join(p, "Cockpits")


def need_game_setups_dir(jet):
    d = game_setups_dir(jet)
    if not d:
        raise ValueError(f"The game's {JETS[jet]['name']} plugin was not found. Install the mod, or set the Nuclear Option "
                         "folder in Setups.")
    return d


def read_json(path, default):
    try:
        return json.load(open(path, encoding="utf8")) if os.path.exists(path) else default
    except Exception:
        return default


def b64file(path):
    return base64.b64encode(open(path, "rb").read()).decode("ascii")


def make_cpit(jet, name):
    cd = cockpit_dir(jet)
    export(jet)
    built = read_json(os.path.join(cd, "build", "custom_mesh.json"), {"parts": [], "hide": []})
    textures = {}
    for p in built.get("parts", []):
        tx = p.get("texture")
        if tx and os.path.exists(os.path.join(cd, "build", tx)):
            textures[tx] = b64file(os.path.join(cd, "build", tx))
    layout = read_json(os.path.join(cd, "layout.json"), {"groups": {}})
    mfd = read_json(os.path.join(cd, "mfd_pages.json"), {"pages": [], "assign": []})
    custom = load_custom(jet)
    pictures = {}
    for d in custom.get("decals", []):
        f = os.path.join(cd, "decals", d["id"] + ".png")
        if os.path.exists(f):
            pictures[d["id"]] = b64file(f)
    return {"format": "cpit", "version": CPIT_VERSION, "jet": jet, "name": name, "created": time.strftime("%Y-%m-%d %H:%M"),
            "layout": layout, "parts": built.get("parts", []), "textures": textures, "hide": built.get("hide", []), "mfd": mfd,
            "editor": {"custom": custom, "pictures": pictures, "layout": layout, "mfd": mfd}}


def import_cpit(jet, data):
    """A .cpit back into the editor (replaces what is there)."""
    if data.get("format") != "cpit":
        raise ValueError("not a cockpit setup")
    if data.get("jet") != jet:
        raise ValueError("this setup is for the " + JETS.get(data.get("jet"), {}).get("name", "other jet"))
    ed = data.get("editor")
    if not ed:
        raise ValueError("this setup has no editor data (it can be used in game but not opened here)")
    cd = cockpit_dir(jet)
    os.makedirs(os.path.join(cd, "decals"), exist_ok=True)
    for f in os.listdir(os.path.join(cd, "decals")):
        os.remove(os.path.join(cd, "decals", f))
    for did, b64 in (ed.get("pictures") or {}).items():
        did = re.sub(r"[^A-Za-z0-9_-]", "", did)
        open(os.path.join(cd, "decals", did + ".png"), "wb").write(base64.b64decode(b64))
    json.dump(ed.get("custom") or {"version": 1, "decals": [], "screens": [], "hide": []}, open(os.path.join(cd, "custom.json"), "w", encoding="utf8"), indent=1)
    json.dump(ed.get("layout") or {"groups": {}}, open(os.path.join(cd, "layout.json"), "w", encoding="utf8"), indent=1)
    mfd = ed.get("mfd") or {}
    mp = os.path.join(cd, "mfd_pages.json")
    if mfd.get("pages"):
        json.dump(mfd, open(mp, "w", encoding="utf8"), indent=1)
    elif os.path.exists(mp):
        os.remove(mp)
    return export(jet)


def cpit_jet(path):
    """The jet a .cpit is for, from the start of the file ("jet" comes third, before the big parts)."""
    try:
        m = re.search(r'"jet"\s*:\s*"([^"]*)"', open(path, encoding="utf8", errors="replace").read(400))
        return m.group(1) if m else None
    except OSError:
        return None


def list_setups(jet):
    out = []
    for where, d in (("editor", setups_dir(jet)), ("game", game_setups_dir(jet))):
        if d and os.path.isdir(d):
            for f in sorted(os.listdir(d)):
                # a pack's one Cockpits folder holds every jet's setups: only this jet's
                if f.lower().endswith(".cpit") and cpit_jet(os.path.join(d, f)) in (None, jet):
                    p = os.path.join(d, f)
                    out.append({"name": f[:-5], "where": where, "size": os.path.getsize(p), "time": time.strftime("%Y-%m-%d %H:%M", time.localtime(os.path.getmtime(p)))})
    return out


def refresh(jet):
    """Re-make the editor's copy of the cockpit (the work dir) with the repo's blender/cockpit_build.py, e.g. after the mod's
    cockpit changed. Only the work dir is written; the mod's own source folder is only read."""
    j = JETS[jet]
    BUILD.update(running=True, log="", jet=jet, ok=None)
    try:
        work = work_dir(jet)
        os.makedirs(work, exist_ok=True)
        for f in ("cockpit_atlas.json", "cockpit_atlas.png", "cockpit_metallic.png", "mig29_basecolor.png", "mig29_mesh.json"):
            src = os.path.join(j["real_source"], f)
            if os.path.exists(src):
                shutil.copy2(src, work)
        log(f"== {j['name']}: rebuilding the editor's cockpit in Blender (a minute or two)")
        p = subprocess.run([blender(), "-b", "--python", os.path.join(j["repo"], "blender", "cockpit_build.py"), "--", work],
                           capture_output=True, text=True, encoding="utf8", errors="replace", cwd=j["repo"],
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        log("\n".join(l for l in p.stdout.splitlines() if "[cockpit]" in l or "Error" in l or "Traceback" in l))
        BUILD["ok"] = p.returncode == 0 and "Traceback" not in p.stdout + p.stderr
        log("== done: reload the page" if BUILD["ok"] else "!! failed\n" + p.stderr[-3000:])
    except Exception:
        log(traceback.format_exc()); BUILD["ok"] = False
    finally:
        BUILD["running"] = False


def install_files(jet, nobp):
    j = JETS[jet]
    dst = plugin_dir(jet)
    if not dst:
        raise ValueError(f"The game's {j['name']} plugin folder was not found: set plugin_dir in jets.local.json")
    os.makedirs(dst, exist_ok=True)
    for f in os.listdir(dst):
        if f.endswith(".nobp"):
            os.remove(os.path.join(dst, f))
    shutil.copy2(nobp, dst)
    dll = os.path.join(j["build_out"], j["instruments_dll"])
    if os.path.exists(dll):
        shutil.copy2(dll, dst)
    pages = os.path.join(j["build_out"], "mfd_pages.json")   # custom MFD pages, read by the plugin from its own folder
    old = os.path.join(dst, "mfd_pages.json")
    if os.path.exists(pages):
        shutil.copy2(pages, dst)
    elif os.path.exists(old):
        os.remove(old)
    log(f"== installed {os.path.basename(nobp)} into {dst}")


# ------------------------------------------------------------------------------------------------ http
class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def file(self, path, ctype):
        if not os.path.exists(path):
            return self.send(404, {"error": "missing " + path})
        self.send(200, open(path, "rb").read(), ctype)

    def jet(self, q):
        j = q.get("jet", [""])[0]
        if j not in JETS:
            raise ValueError("unknown jet " + j)
        return j

    def foreign(self):
        """Requests from other web pages (or DNS rebinding) are refused: only this editor's own page may use the API."""
        ok = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
        if self.headers.get("Host", "") not in ok:
            return True
        origin = self.headers.get("Origin")
        return bool(origin) and origin.split("://", 1)[-1] not in ok

    def cockpit_file(self, jet, name, ctype):
        p = os.path.join(work_dir(jet), name)
        if not os.path.exists(p):
            return self.send(404, {"error": f"{JETS[jet]['name']}: the editor's copy of the cockpit is missing ({p})"})
        self.file(p, ctype)

    def do_GET(self):
        try:
            if self.foreign():
                return self.send(403, {"error": "forbidden"})
            u = urlparse(self.path); q = parse_qs(u.query)
            if u.path in ("/", "/index.html"):
                return self.file(os.path.join(HERE, "static", "index.html"), "text/html; charset=utf-8")
            if u.path.startswith("/static/"):
                f = os.path.normpath(os.path.join(HERE, u.path.lstrip("/")))
                if not f.startswith(os.path.join(HERE, "static")):
                    return self.send(403, {"error": "no"})
                ct = {".js": "text/javascript", ".css": "text/css", ".png": "image/png"}.get(os.path.splitext(f)[1], "application/octet-stream")
                return self.file(f, ct)
            if u.path == "/api/jets":
                return self.send(200, {"jets": {k: {"name": v["name"], "pages": v["pages"], "builtin": v["builtin_screens"], "dev": is_dev(k)}
                                                for k, v in JETS.items()},
                                       "dev": any(is_dev(k) for k in JETS), "version": VERSION,
                                       "build_enabled": CFG.get("_build_enabled", True), "build_disabled_reason": CFG.get("_build_disabled_reason", "")})
            if u.path == "/api/mesh":
                return self.cockpit_file(self.jet(q), "cockpit_mesh.json", "application/json")
            if u.path == "/api/atlas":
                return self.cockpit_file(self.jet(q), "cockpit_atlas.png", "image/png")
            if u.path == "/api/load":
                jet = self.jet(q)
                lp = os.path.join(cockpit_dir(jet), "layout.json")
                layout = json.load(open(lp, encoding="utf8")) if os.path.exists(lp) else {"groups": {}}
                mp = os.path.join(cockpit_dir(jet), "mfd_pages.json")
                mfd = json.load(open(mp, encoding="utf8")) if os.path.exists(mp) else {"pages": [], "assign": []}
                return self.send(200, {"custom": load_custom(jet), "builtin": builtin_screens(jet), "layout": layout, "mfd": mfd})
            if u.path == "/api/decal":
                jet = self.jet(q); did = re.sub(r"[^A-Za-z0-9_-]", "", q.get("id", [""])[0])
                return self.file(os.path.join(cockpit_dir(jet), "decals", did + ".png"), "image/png")
            if u.path == "/api/cpit/list":
                jet = self.jet(q)
                targets = plugin_targets(jet)
                return self.send(200, {"setups": list_setups(jet), "editor_dir": setups_dir(jet), "game_dir": game_setups_dir(jet),
                                       "game_mod": targets[0][0] if targets else None, "game_mods": [t[0] for t in targets],
                                       "packs": [p["name"] for p in JETS[jet].get("packs", [])],
                                       "game": find_game(), "game_set": load_settings().get("game_dir", "")})
            if u.path == "/api/cpit/download":
                jet = self.jet(q)
                where = need_game_setups_dir(jet) if q.get("where", [""])[0] == "game" else setups_dir(jet)
                p = os.path.join(where, safe_name(q.get("name", [""])[0]) + ".cpit")
                if not os.path.exists(p):
                    return self.send(404, {"error": "no such setup"})
                body = open(p, "rb").read()
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Disposition", f'attachment; filename="{os.path.basename(p)}"')
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if u.path == "/api/status":
                return self.send(200, {"running": BUILD["running"], "jet": BUILD["jet"], "ok": BUILD["ok"], "log": BUILD["log"][-20000:],
                                       "game": game_running(), "unity": unity_running()})
            self.send(404, {"error": "not found"})
        except Exception as e:
            self.send(500, {"error": str(e), "trace": traceback.format_exc()})

    def do_POST(self):
        try:
            if self.foreign():
                return self.send(403, {"error": "forbidden"})
            u = urlparse(self.path); q = parse_qs(u.query)
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            if u.path == "/api/settings":
                st = load_settings()
                g = (body.get("game_dir") or "").strip().strip('"')
                if g and not os.path.isdir(os.path.join(g, "BepInEx")):
                    return self.send(400, {"error": f"No BepInEx folder in {g}: pick the Nuclear Option folder (the one with NuclearOption.exe)"})
                st["game_dir"] = g
                os.makedirs(data_dir(), exist_ok=True)
                json.dump(st, open(settings_path(), "w", encoding="utf8"), indent=1)
                return self.send(200, {"ok": True, "game": find_game(), "plugins": {k: plugin_dir(k) for k in JETS}})
            jet = self.jet(q)
            if u.path == "/api/save":
                cd = cockpit_dir(jet)
                os.makedirs(os.path.join(cd, "decals"), exist_ok=True)
                custom = body["custom"]
                keep = set()
                for did, url in body.get("images", {}).items():
                    did = re.sub(r"[^A-Za-z0-9_-]", "", did)
                    data = base64.b64decode(url.split(",", 1)[1])
                    Image.open(io.BytesIO(data)).convert("RGBA").save(os.path.join(cd, "decals", did + ".png"))
                    keep.add(did + ".png")
                for d in custom.get("decals", []):
                    keep.add(d["id"] + ".png")
                for f in os.listdir(os.path.join(cd, "decals")):
                    if f not in keep:
                        os.remove(os.path.join(cd, "decals", f))
                json.dump(custom, open(os.path.join(cd, "custom.json"), "w", encoding="utf8"), indent=1)
                # moved / turned / scaled / hidden instrument groups (tools/cockpit_layout.py applies them before the Unity build)
                json.dump(body.get("layout", {"groups": {}}), open(os.path.join(cd, "layout.json"), "w", encoding="utf8"), indent=1)
                # custom MFD pages (the SMT plugin reads mfd_pages.json from its own folder; the build ships it there)
                mfd = body.get("mfd") or {"pages": [], "assign": []}
                mp = os.path.join(cd, "mfd_pages.json")
                if mfd.get("pages"):
                    json.dump({"pages": mfd["pages"], "assign": mfd.get("assign", [])}, open(mp, "w", encoding="utf8"), indent=1)
                elif os.path.exists(mp):
                    os.remove(mp)
                return self.send(200, {"ok": True, "export": export(jet)})
            if u.path == "/api/cpit/export":
                name = safe_name(body.get("name"))
                data = make_cpit(jet, name)
                os.makedirs(setups_dir(jet), exist_ok=True)
                path = os.path.join(setups_dir(jet), name + ".cpit")
                json.dump(data, open(path, "w", encoding="utf8"))
                res = {"ok": True, "name": name, "path": path, "installed": None}
                if body.get("install"):
                    gd = need_game_setups_dir(jet)
                    os.makedirs(gd, exist_ok=True)
                    shutil.copy2(path, gd)
                    res["installed"] = os.path.join(gd, name + ".cpit")
                return self.send(200, res)
            if u.path == "/api/cpit/import":
                if body.get("content") is not None:
                    data = json.loads(body["content"]) if isinstance(body["content"], str) else body["content"]
                else:
                    where = need_game_setups_dir(jet) if body.get("where") == "game" else setups_dir(jet)
                    data = json.load(open(os.path.join(where, safe_name(body.get("name")) + ".cpit"), encoding="utf8"))
                return self.send(200, {"ok": True, "export": import_cpit(jet, data)})
            if u.path == "/api/cpit/install":
                src = os.path.join(setups_dir(jet), safe_name(body.get("name")) + ".cpit")
                gd = need_game_setups_dir(jet)
                os.makedirs(gd, exist_ok=True)
                shutil.copy2(src, gd)
                return self.send(200, {"ok": True})
            if u.path == "/api/cpit/delete":
                where = need_game_setups_dir(jet) if body.get("where") == "game" else setups_dir(jet)
                p = os.path.join(where, safe_name(body.get("name")) + ".cpit")
                if os.path.exists(p):
                    os.remove(p)
                return self.send(200, {"ok": True})
            if u.path in ("/api/refresh", "/api/build", "/api/install") and not is_dev(jet):
                return self.send(409, {"error": "Building needs the mod's source (jets.local.json): export a cockpit setup instead."})
            if u.path == "/api/refresh":
                if BUILD["running"]:
                    return self.send(409, {"error": "busy: a build or refresh is running"})
                threading.Thread(target=refresh, args=(jet,), daemon=True).start()
                return self.send(200, {"ok": True})
            if u.path == "/api/build":
                if not CFG.get("_build_enabled", True):
                    return self.send(409, {"error": CFG.get("_build_disabled_reason", "Building is switched off.")})
                if BUILD["running"]:
                    return self.send(409, {"error": "a build is already running"})
                if unity_running():
                    return self.send(409, {"error": "Unity is running (another build or the editor). Close it and try again."})
                threading.Thread(target=run_build, args=(jet, bool(body.get("quick", True)), bool(body.get("install", True))), daemon=True).start()
                return self.send(200, {"ok": True})
            if u.path == "/api/install":
                if not CFG.get("_build_enabled", True):
                    return self.send(409, {"error": CFG.get("_build_disabled_reason", "Installing is switched off.")})
                if game_running():
                    return self.send(409, {"error": "Nuclear Option is running. Close it first."})
                j = JETS[jet]
                nobps = sorted((os.path.join(j["build_out"], f) for f in os.listdir(j["build_out"]) if f.endswith(".nobp")), key=os.path.getmtime)
                if not nobps:
                    return self.send(404, {"error": "no build to install"})
                BUILD["log"] = ""
                install_files(jet, nobps[-1])
                return self.send(200, {"ok": True, "log": BUILD["log"]})
            self.send(404, {"error": "not found"})
        except Exception as e:
            self.send(500, {"error": str(e), "trace": traceback.format_exc()})


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    print(f"Cockpit Editor {VERSION} on http://127.0.0.1:{PORT}  (close this window to stop it)")
    if "--no-browser" not in sys.argv:
        import webbrowser
        webbrowser.open(f"http://127.0.0.1:{PORT}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:   # Ctrl+C in the terminal: stop quietly
        print("Cockpit Editor stopped.")

"""Cockpit Editor: a local web app for placing decals (painted stencils such as STEP HERE) and custom screens in the MiG-29 /
MiG-29SMT cockpits, then building and installing the mod.

    python server.py            (or double-click "Cockpit Editor.bat") -> http://127.0.0.1:8729

What it writes, per jet (jets.json says where each repo is):
    <repo>/cockpit/custom.json          the elements as placed in the editor (the editor's own save file)
    <repo>/cockpit/decals/<id>.png      each decal's picture as drawn in the editor (kept for re-editing)
    <repo>/cockpit/build/               what the Unity builder reads (the build script copies it to <source>/custom):
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
PORT = 8729
CFG = json.load(open(os.path.join(HERE, "jets.json"), encoding="utf8"))
JETS = {k: v for k, v in CFG.items() if not k.startswith("_")}
ATLAS_W = 4096
MESH_RES = 192            # decal mesh resolution (pixels along its long side)
BUILD = {"running": False, "log": "", "jet": None, "ok": None}


def cockpit_dir(jet):
    return os.path.join(JETS[jet]["repo"], "cockpit")


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


def offset_poly(poly, d):
    """Convex counter-clockwise polygon moved out by d on every side (corners where the offset edges meet)."""
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
        out.append(tuple(p0 + e0 * t))
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
    at = json.load(open(os.path.join(JETS[jet]["work"], "cockpit_atlas.json"), encoding="utf8"))
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
        # the screen's outline: a convex polygon in -0.5..0.5 across its width and height, counter-clockwise from the front
        shape = convex_ccw(s.get("shape") or [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]])
        inner = [(x * w, y * h) for x, y in shape]
        outer = offset_poly(inner, b)

        def P3(p, z):
            return pos + right * p[0] + up * p[1] + n * z

        scr = Mesh(f"cs_{s['id']}__{page}", "tac" if page == "tac" else "screen")
        if page == "tac":   # the tactical display's render texture (main area u 0..0.75, v 0.25..1) across the shape's box
            uv = [(0.75 * (x + 0.5), 0.25 + 0.75 * (y + 0.5)) for x, y in shape]
        else:               # the plugin maps its own texture; dark without it
            uv = [black] * len(shape)
        for k in range(1, len(inner) - 1):
            scr.tri([P3(inner[0], dep + 0.0006), P3(inner[k], dep + 0.0006), P3(inner[k + 1], dep + 0.0006)], [uv[0], uv[k], uv[k + 1]], n)
        parts.append(scr.part())
        bz = Mesh(f"cbz_{s['id']}", "ck")
        col = dgrey if s.get("bezelColor") == "grey" else black
        m = len(inner)
        for i in range(m):                                   # front ring
            j = (i + 1) % m
            bz.quad([P3(outer[i], dep), P3(outer[j], dep), P3(inner[j], dep), P3(inner[i], dep)], [col] * 4, n)
        for k in range(1, m - 1):                            # backing under the screen
            bz.tri([P3(inner[0], dep), P3(inner[k], dep), P3(inner[k + 1], dep)], [col] * 3, n)
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
    p = os.path.join(JETS[jet]["work"], "cockpit_mesh.json")
    if not os.path.exists(p) or not JETS[jet]["builtin_screens"]:
        return {}
    parts = {q["name"]: q for q in json.load(open(p, encoding="utf8"))["parts"]}
    res = {}
    for name in JETS[jet]["builtin_screens"]:
        q = parts.get(name)
        if not q:
            continue
        v = np.array(q["vertices"]).reshape(-1, 3)
        n = np.array(q["normals"][:3]); n /= np.linalg.norm(n)
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
def game_running():
    out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq NuclearOption.exe", "/NH"], capture_output=True, text=True).stdout
    return "NuclearOption.exe" in out


def unity_running():
    out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq Unity.exe", "/NH"], capture_output=True, text=True).stdout
    return "Unity.exe" in out


def log(msg):
    BUILD["log"] += msg + "\n"


def run_build(jet, quick, install):
    j = JETS[jet]
    BUILD.update(running=True, log="", jet=jet, ok=None)
    try:
        log(f"== {j['name']}: exporting the cockpit editor elements")
        log(json.dumps(export(jet)))
        script = os.path.join(j["repo"], "tools", "build_mig29.ps1")
        args = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Project", j["project"]]
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
            r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ts, j["test_build"], "cockpit editor build"],
                               capture_output=True, text=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            log((r.stdout + r.stderr).strip())
        BUILD["ok"] = True
    except Exception:
        log(traceback.format_exc()); BUILD["ok"] = False
    finally:
        BUILD["running"] = False


def refresh(jet):
    """Re-make the editor's copy of the cockpit (the work dir) with the repo's blender/cockpit_build.py, e.g. after Claude
    changed the cockpit. Only the work dir is written; the mod's own source folder is only read."""
    j = JETS[jet]
    BUILD.update(running=True, log="", jet=jet, ok=None)
    try:
        os.makedirs(j["work"], exist_ok=True)
        for f in ("cockpit_atlas.json", "cockpit_atlas.png", "cockpit_metallic.png", "mig29_basecolor.png", "mig29_mesh.json"):
            src = os.path.join(j["real_source"], f)
            if os.path.exists(src):
                shutil.copy2(src, j["work"])
        log(f"== {j['name']}: rebuilding the editor's cockpit in Blender (a minute or two)")
        p = subprocess.run([CFG.get("_blender", r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"), "-b", "--python",
                            os.path.join(j["repo"], "blender", "cockpit_build.py"), "--", j["work"]],
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
    os.makedirs(j["plugin_dir"], exist_ok=True)
    for f in os.listdir(j["plugin_dir"]):
        if f.endswith(".nobp"):
            os.remove(os.path.join(j["plugin_dir"], f))
    shutil.copy2(nobp, j["plugin_dir"])
    dll = os.path.join(j["build_out"], j["instruments_dll"])
    if os.path.exists(dll):
        shutil.copy2(dll, j["plugin_dir"])
    log(f"== installed {os.path.basename(nobp)} into {j['plugin_dir']}")


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

    def do_GET(self):
        try:
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
                return self.send(200, {"jets": {k: {"name": v["name"], "pages": v["pages"], "builtin": v["builtin_screens"]} for k, v in JETS.items()},
                                       "build_enabled": CFG.get("_build_enabled", True), "build_disabled_reason": CFG.get("_build_disabled_reason", "")})
            if u.path == "/api/mesh":
                return self.file(os.path.join(JETS[self.jet(q)]["work"], "cockpit_mesh.json"), "application/json")
            if u.path == "/api/atlas":
                return self.file(os.path.join(JETS[self.jet(q)]["work"], "cockpit_atlas.png"), "image/png")
            if u.path == "/api/load":
                jet = self.jet(q)
                lp = os.path.join(cockpit_dir(jet), "layout.json")
                layout = json.load(open(lp, encoding="utf8")) if os.path.exists(lp) else {"groups": {}}
                return self.send(200, {"custom": load_custom(jet), "builtin": builtin_screens(jet), "layout": layout})
            if u.path == "/api/decal":
                jet = self.jet(q); did = re.sub(r"[^A-Za-z0-9_-]", "", q.get("id", [""])[0])
                return self.file(os.path.join(cockpit_dir(jet), "decals", did + ".png"), "image/png")
            if u.path == "/api/status":
                return self.send(200, {"running": BUILD["running"], "jet": BUILD["jet"], "ok": BUILD["ok"], "log": BUILD["log"][-20000:],
                                       "game": game_running(), "unity": unity_running()})
            self.send(404, {"error": "not found"})
        except Exception as e:
            self.send(500, {"error": str(e), "trace": traceback.format_exc()})

    def do_POST(self):
        try:
            u = urlparse(self.path); q = parse_qs(u.query)
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
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
                return self.send(200, {"ok": True, "export": export(jet)})
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
    print(f"Cockpit Editor on http://127.0.0.1:{PORT}  (close this window to stop it)")
    if "--no-browser" not in sys.argv:
        import webbrowser
        webbrowser.open(f"http://127.0.0.1:{PORT}")
    srv.serve_forever()

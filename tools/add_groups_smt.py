"""One-off edit: movable instrument groups for the cockpit editor in the SMT's blender/cockpit_build.py."""
import sys

path = sys.argv[1]
t = open(path, encoding='utf8', newline='').read()
nl = '\r\n' if '\r\n' in t else '\n'
t = t.replace('\r\n', '\n')


def rep(o, n, count=1):
    global t
    assert t.count(o) == count, (o[:90], t.count(o))
    t = t.replace(o, n)


# ---- machinery
rep('''class Part:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")

    def face(self, pts, uvs):
        vs = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs)
        for l, uv in zip(f.loops, uvs):
            l[self.uv].uv = uv
        return f
''', '''class Part:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")

    def face(self, pts, uvs):
        # cockpit editor groups: while a group is open (G), the tub's faces go to the group's own part (exported after the tub's,
        # with its vertex range recorded) and any other part touched is noted as the group's
        target = self
        if CUR_GROUP[0]:
            if self.name == "tub":
                target = GROUP_PARTS.setdefault(CUR_GROUP[0], Part("g_" + CUR_GROUP[0]))
            elif not self.name.startswith("g_"):
                GROUP_OWNER.setdefault(self.name, set()).add(CUR_GROUP[0])
        elif not self.name.startswith("g_") and self.name != "tub":
            GROUP_OWNER.setdefault(self.name, set()).add("")
        vs = [target.bm.verts.new(p) for p in pts]
        f = target.bm.faces.new(vs)
        for l, uv in zip(f.loops, uvs):
            l[target.uv].uv = uv
        return f


# Movable groups for the cockpit editor (Documents\\CockpitEditor): each instrument, display, plate or switch panel is opened with
# G(id, label, kind, frame) before it is built and closed by the next G (or G(None)). Its tub faces are exported as a vertex range
# of the tub (cockpit_mesh.json "groups"), so the editor can move, turn, scale or hide it and tools/cockpit_layout.py can apply
# that before the Unity build. frame: (centre, normal toward the pilot, right, up) in the Unity frame, else worked out from the faces.
CUR_GROUP = [None]
GROUP_PARTS = {}          # group id -> Part with its tub faces
GROUP_OWNER = {}          # part name -> set of groups that drew into it ("" = outside any group)
GROUP_META = {}           # group id -> label, kind, frame


def G(gid, label=None, kind="instrument", frame=None):
    CUR_GROUP[0] = gid
    if gid:
        m = GROUP_META.setdefault(gid, {"label": label or gid, "kind": kind, "frame": None})
        if frame is not None:
            c, n, r, u = frame
            m["frame"] = [list(map(float, c)), list(map(float, n)), list(map(float, r)), list(map(float, u))]
''')

# ---- consoles: switch plates, wall boxes, breaker panels
rep('''    for za, zb, nm in segs:
        ya, yb = top_y(za) + 0.003, top_y(zb) + 0.003
''', '''    for za, zb, nm in segs:
        G(f"con_{nm}", f"{'Left' if side < 0 else 'Right'} console panel {nm[3:].upper()}", "switch panel")
        ya, yb = top_y(za) + 0.003, top_y(zb) + 0.003
''')
rep('''    # (the plates' toggles and knobs are 3D: quad_uv -> switches_3d)
''', '''    G(None)
    # (the plates' toggles and knobs are 3D: quad_uv -> switches_3d)
''')
rep('''for side, cell, z0, z1 in ((-1, "sp_lc3", 6.18, 6.40), (1, "sp_aft", 6.20, 6.42), (1, "sp_rc3", 6.46, 6.66)):
    y0, y1 = CON_TOP + 0.02, CON_TOP + 0.095
''', '''for side, cell, z0, z1 in ((-1, "sp_lc3", 6.18, 6.40), (1, "sp_aft", 6.20, 6.42), (1, "sp_rc3", 6.46, 6.66)):
    G(f"box_{'l' if side < 0 else 'r'}_{cell}", f"{'Left' if side < 0 else 'Right'} wall box ({cell[3:].upper()})", "switch panel")
    y0, y1 = CON_TOP + 0.02, CON_TOP + 0.095
''')
rep('''for side in (-1, 1):
    z0, z1, y0, y1 = 6.72, 7.00, CON_TOP + 0.035, CON_TOP + 0.105
''', '''for side in (-1, 1):
    G(f"cb_{'l' if side < 0 else 'r'}", f"{'Left' if side < 0 else 'Right'} circuit breakers", "switch panel")
    z0, z1, y0, y1 = 6.72, 7.00, CON_TOP + 0.035, CON_TOP + 0.105
''')
rep('''# throttle quadrant (left console): slotted cover, gate plate
''', '''G(None)
# throttle quadrant (left console): slotted cover, gate plate
''')

# ---- panel displays and instruments
rep('''corner_display(-1, "pfd")
corner_display(1, "eng")
''', '''G("mfd_left", "Left display (flight)", "display", panel_frame(-0.30, 0.15, 0.0))
corner_display(-1, "pfd")
G("mfd_right", "Right display (RWR, engines)", "display", panel_frame(0.30, 0.15, 0.0))
corner_display(1, "eng")
G("mfd_centre", "Centre display (tactical, stores)", "display", panel_frame(0.0, CTR_V, 0.0))
''')
rep('''# up-front control panel: a keypad either side of its data window (the plugin draws on "ufc")
c, n, right, up = panel_frame(0.0, 0.283, 0.0)
''', '''# up-front control panel: a keypad either side of its data window (the plugin draws on "ufc")
G("ufcp", "Up-front control panel", "display", panel_frame(0.0, 0.283, 0.0))
c, n, right, up = panel_frame(0.0, 0.283, 0.0)
''')
rep('''GEAR_U, GEAR_V, GW, GH = -GAP_U, 0.205, 0.062, 0.031
plate(GEAR_U, GEAR_V, GW, GH, "gear_plate")
''', '''GEAR_U, GEAR_V, GW, GH = -GAP_U, 0.205, 0.062, 0.031
G("gear_lights", "Gear lights", "instrument", panel_frame(GEAR_U, GEAR_V, 0.0))
plate(GEAR_U, GEAR_V, GW, GH, "gear_plate")
''')
rep('''GL_U, GL_V = -GAP_U, 0.105
c, n, right, up = panel_frame(GL_U, GL_V, 0.0)
''', '''GL_U, GL_V = -GAP_U, 0.105
G("gear_lever", "Gear lever", "lever", panel_frame(GL_U, GL_V, 0.0))
c, n, right, up = panel_frame(GL_U, GL_V, 0.0)
''')
rep('''CAU_U, CAU_V = GAP_U, 0.215
c, n, right, up = panel_frame(CAU_U, CAU_V, 0.0)
''', '''CAU_U, CAU_V = GAP_U, 0.215
G("master_caution", "Master caution", "instrument", panel_frame(CAU_U, CAU_V, 0.0))
c, n, right, up = panel_frame(CAU_U, CAU_V, 0.0)
''')
rep('''small_screen("stby", GAP_U, 0.115, 0.060, 0.060)
''', '''G("stby", "Standby display", "display", panel_frame(GAP_U, 0.115, 0.0))
small_screen("stby", GAP_U, 0.115, 0.060, 0.060)
G(None)
''')
rep('''for (u, v) in ((-0.165, 0.283), (0.165, 0.283), (GAP_U, 0.035)):   # setting knobs either side of the control panel, light dimmer
    n = panel_normal(u); c = Vector(pp(u, v, 0.0, 1))
''', '''for k, (u, v) in enumerate(((-0.165, 0.283), (0.165, 0.283), (GAP_U, 0.035))):   # setting knobs either side of the control panel, light dimmer
    G(f"knob_{k + 1}", ("Left setting knob", "Right setting knob", "Light dimmer")[k], "knob", panel_frame(u, v, 0.0))
    n = panel_normal(u); c = Vector(pp(u, v, 0.0, 1))
''')
rep('''# ------------------------------------------------------------------------------------------------ glareshield + HUD
GS_Y = PT + 0.012''', '''G(None)

# ------------------------------------------------------------------------------------------------ glareshield + HUD
GS_Y = PT + 0.012''')

# ---- export: groups after the tub, as vertex ranges
rep('''sign = winding_sign()
parts_out, meshes = [], {}
for name, mat, pivot in''', '''def group_frame(o):
    """Centre (middle of the bounding box), area-weighted normal, right (world x, else z, on its plane) and up of a group's faces."""
    v = [Vector(o["vertices"][i:i + 3]) for i in range(0, len(o["vertices"]), 3)]
    lo = Vector((min(p.x for p in v), min(p.y for p in v), min(p.z for p in v))); hi = Vector((max(p.x for p in v), max(p.y for p in v), max(p.z for p in v)))
    acc = Vector((0, 0, 0)); t = o["triangles"]
    for i in range(0, len(t), 3):
        A, B, C = v[t[i]], v[t[i + 1]], v[t[i + 2]]
        nn = Vector(o["normals"][t[i] * 3:t[i] * 3 + 3])
        cr = (B - A).cross(C - A)
        acc += cr if cr.dot(nn) > 0 else -cr
    n = acc.normalized() if acc.length > 1e-9 else Vector((0, 0, -1))
    r = Vector((1, 0, 0)) - n * n.x
    if r.length < 0.3:
        r = Vector((0, 0, 1)) - n * n.z
    r.normalize(); u = n.cross(r).normalized()
    if u.y < 0 or (abs(u.y) < 1e-3 and u.z > 0):
        u = -u; r = -r
    return [list((lo + hi) / 2), list(n), list(r), list(u)]


def merge_groups(tub_out):
    """Append each group's faces to the tub; record its vertex and triangle ranges, frame, size and the parts it owns."""
    groups = []
    for gid, gp in GROUP_PARTS.items():
        o, _ = export_part(gp, sign, "cockpit", None)
        base = len(tub_out["vertices"]) // 3
        t0 = len(tub_out["triangles"])
        tub_out["vertices"] += o["vertices"]; tub_out["normals"] += o["normals"]; tub_out["uvs"] += o["uvs"]
        tub_out["triangles"] += [i + base for i in o["triangles"]]
        meta = GROUP_META[gid]
        frame = meta["frame"] or group_frame(o)
        c, r, u = Vector(frame[0]), Vector(frame[2]), Vector(frame[3])
        vs = [Vector(o["vertices"][i:i + 3]) for i in range(0, len(o["vertices"]), 3)]
        own = sorted(p for p, gs in GROUP_OWNER.items() if gs == {gid})
        w = max(abs((p - c).dot(r)) for p in vs) * 2 if vs else 0.0
        h = max(abs((p - c).dot(u)) for p in vs) * 2 if vs else 0.0
        groups.append({"id": gid, "label": meta["label"], "kind": meta["kind"], "verts": [base, base + len(o["vertices"]) // 3],
                       "tris": [t0, len(tub_out["triangles"])], "frame": frame, "size": [round(w, 4), round(h, 4)], "parts": own})
    print(f"[cockpit] editor groups: {len(groups)} ({', '.join(g['id'] for g in groups)})")
    shared = sorted(p for p, gs in GROUP_OWNER.items() if len(gs - {''}) and len(gs) > 1)
    if shared:
        print(f"[cockpit] editor groups: parts drawn by more than one group (not movable with them): {shared}")
    return groups


sign = winding_sign()
parts_out, meshes = [], {}
for name, mat, pivot in''')
rep('''    o, me = export_part(PARTS[name], sign, mat, pivot)
    parts_out.append(o); meshes[name] = me
for name in sorted''', '''    o, me = export_part(PARTS[name], sign, mat, pivot)
    if name == "tub":
        GROUPS_OUT = merge_groups(o)
    parts_out.append(o); meshes[name] = me
for name in sorted''')
rep('''json.dump({"parts": parts_out, "eye": list(EYE)}, open(os.path.join(SRC, "cockpit_mesh.json"), "w"))''',
    '''json.dump({"parts": parts_out, "eye": list(EYE), "groups": GROUPS_OUT}, open(os.path.join(SRC, "cockpit_mesh.json"), "w"))''')
open(path, 'w', encoding='utf8', newline='').write(t.replace('\n', nl))
print('ok')

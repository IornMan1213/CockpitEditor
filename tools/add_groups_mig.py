"""One-off edit: movable instrument groups for the cockpit editor in the MiG-29's blender/cockpit_build.py.
The group machinery, console groups and export are the SMT edit's (add_groups_smt.py without its panel section); the panel's
groups are the 9.12's own instruments."""
import os, re, sys

path = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
smt = open(os.path.join(here, "add_groups_smt.py"), encoding="utf8").read()
a, b = smt.index("# ---- panel displays and instruments"), smt.index("# ---- export")
sys.argv = [sys.argv[0], path]
exec(compile(smt[:a] + smt[b:], "add_groups_smt (common)", "exec"), {"__name__": "__main__"})

t = open(path, encoding="utf8", newline="").read()
nl = "\r\n" if "\r\n" in t else "\n"
t = t.replace("\r\n", "\n")


def rep(o, n, count=1):
    global t
    assert t.count(o) == count, (o[:90], t.count(o))
    t = t.replace(o, n)


LABELS = {"g_adi": ("adi", "Attitude indicator (ADI)"), "g_hsi": ("hsi", "HSI (compass)"), "g_asi": ("asi", "Airspeed"),
          "g_alt": ("alt", "Altimeter"), "g_aoa": ("aoa", "AoA and g meter"), "g_vsi": ("vsi", "Vertical speed"),
          "g_radalt": ("radalt", "Radar altimeter"), "g_clock": ("clock", "Clock"), "g_oxy": ("oxy", "Oxygen gauge"),
          "g_cabin": ("cabin", "Cabin pressure gauge"), "g_rpm": ("rpm", "Engine RPM"), "g_egt": ("egt", "Engine EGT"),
          "g_fuel": ("fuel", "Fuel gauge"), "g_hyd": ("hyd", "Hydraulics gauge")}
# every round gauge: its own group, framed at its centre on the panel
lines = t.split("\n")
out = []
for ln in lines:
    m = re.match(r'f = gauge\((-?[\d.]+), (-?[\d.]+), [\d.]+, "(g_\w+)"', ln)
    if m and m.group(3) in LABELS:
        gid, label = LABELS[m.group(3)]
        out.append(f'G("{gid}", "{label}", "instrument", panel_frame({m.group(1)}, {m.group(2)}, 0.0))')
    out.append(ln)
t = "\n".join(out)
n_g = t.count('"instrument", panel_frame(')
assert n_g == len(LABELS), n_g

rep('''plate(0.0, PH - 0.018, 0.16, 0.026, "placard")
GL_U, GL_V = -0.178, 0.040
''', '''G(None)
plate(0.0, PH - 0.018, 0.16, 0.026, "placard")
GL_U, GL_V = -0.178, 0.040
G("gear_lever", "Gear lever", "lever", panel_frame(GL_U, GL_V, 0.0))
''')
rep('''SPO_U, SPO_V, SPO_S = -0.29, 0.255, 0.086
''', '''SPO_U, SPO_V, SPO_S = -0.29, 0.255, 0.086
G("spo15", "SPO-15 radar warning", "instrument", panel_frame(SPO_U, SPO_V, 0.0))
''')
rep('''GEAR_U, GEAR_V, GW, GH = -0.29, 0.163, 0.11, 0.055
''', '''GEAR_U, GEAR_V, GW, GH = -0.29, 0.163, 0.11, 0.055
G("gear_lights", "Gear lights", "instrument", panel_frame(GEAR_U, GEAR_V, 0.0))
''')
rep('''CAU_U, CAU_V, CAU_W, CAU_H = 0.29, 0.034, 0.15, 0.040
''', '''CAU_U, CAU_V, CAU_W, CAU_H = 0.29, 0.034, 0.15, 0.040
G("caution", "Caution panel", "instrument", panel_frame(CAU_U, CAU_V, 0.0))
''')
rep('''# panel trim: black edge strips around the centre section, screws, setting knobs
''', '''G(None)
# panel trim: black edge strips around the centre section, screws, setting knobs
''')
rep('''for (u, v) in ((-0.078, 0.14), (0.078, 0.14), (-0.172, 0.20), (0.172, 0.20), (-0.06, 0.03), (0.06, 0.03)):
    n = panel_normal(u); c = Vector(pp(u, v, 0.0, 1))
''', '''for k, (u, v) in enumerate(((-0.078, 0.14), (0.078, 0.14), (-0.172, 0.20), (0.172, 0.20), (-0.06, 0.03), (0.06, 0.03))):
    G(f"knob_{k + 1}", f"Setting knob {k + 1}", "knob", panel_frame(u, v, 0.0))
    n = panel_normal(u); c = Vector(pp(u, v, 0.0, 1))
''')
rep('''    cylinder("tub", tuple(c + n * 0.019), tuple(n), 0.0055, 0.004, "dgrey", 12)

# tac screen''', '''    cylinder("tub", tuple(c + n * 0.019), tuple(n), 0.0055, 0.004, "dgrey", 12)
G(None)

# tac screen''')
rep('''cu, cvv = 0.292, 0.256
''', '''cu, cvv = 0.292, 0.256
G("radar_screen", "Radar / tactical screen", "display", panel_frame(cu, cvv, 0.0))
''')
rep('''# hood around the screen
c = Vector(pp(cu, cvv, 0)); n = panel_normal(cu)
''', '''# hood around the screen
c = Vector(pp(cu, cvv, 0)); n = panel_normal(cu)
G(None)
''')
open(path, "w", encoding="utf8", newline="").write(t.replace("\n", nl))
print("ok mig panel groups")

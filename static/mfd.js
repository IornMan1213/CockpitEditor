// The SMT instruments plugin's screen canvas, font and custom-page widgets, ported line for line from Pfd.cs / Widgets.cs so
// the page designer's preview is what the game draws. Canvas origin bottom-left, y up (texture rows), like the plugin.
const C = (r, g, b) => [r, g, b, 255];
export const COL = {
  Sky: C(30, 104, 190), Ground: C(122, 82, 44), White: C(235, 235, 235), Yellow: C(250, 215, 40), Green: C(70, 230, 90), Black: C(6, 8, 10),
  Grey: C(70, 74, 80), DimGreen: C(25, 90, 35), Amber: C(255, 160, 30), Red: C(235, 50, 40), Cyan: C(60, 210, 230), DarkCyan: C(10, 60, 70),
  WarnBack: C(80, 12, 10),
};
const { Sky, Ground, White, Yellow, Green, Black, Grey, DimGreen, Amber, Red, Cyan, DarkCyan, WarnBack } = COL;
const R2I = Math.round, clamp01 = (v) => Math.max(0, Math.min(1, v)), DEG = Math.PI / 180;
const rep = (v, l) => v - Math.floor(v / l) * l;
const deltaAngle = (a, b) => { let d = rep(b - a, 360); if (d > 180) d -= 360; return d; };
const pad = (n, k) => String(n).padStart(k, '0');

const FONT = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'], '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'], ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'], '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'], F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'], H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'], J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'], L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'], N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'], R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'], T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'], X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'], Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
};
export const TW = (t, scale) => t.length * 6 * scale - scale;

export class Canvas {
  constructor(w, h) { this.W = w; this.H = h; this.px = new Uint8ClampedArray(w * h * 4); this.L = new Int32Array(h); this.R = new Int32Array(h).fill(w); this.clip(0, 0, w, h); }
  clip(x0, y0, x1, y1) { this.cx0 = Math.max(0, x0); this.cy0 = Math.max(0, y0); this.cx1 = Math.min(this.W, x1); this.cy1 = Math.min(this.H, y1); }
  set(i, c) { this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = 255; }
  fill(x, y, w, h, c) {
    const x0 = Math.max(this.cx0, x), x1 = Math.min(this.cx1, x + w), y0 = Math.max(this.cy0, y), y1 = Math.min(this.cy1, y + h);
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this.set((yy * this.W + xx) * 4, c);
  }
  shade(x, y, w, h, keep) {
    const x0 = Math.max(this.cx0, x), x1 = Math.min(this.cx1, x + w), y0 = Math.max(this.cy0, y), y1 = Math.min(this.cy1, y + h);
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * this.W + xx) * 4; this.px[i] *= keep; this.px[i + 1] *= keep; this.px[i + 2] *= keep; }
  }
  plot(x, y, c) { if (x < this.cx0 || x >= this.cx1 || y < this.cy0 || y >= this.cy1) return; this.set((y * this.W + x) * 4, c); }
  line(a, b, c, thick) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.max(1, Math.ceil(len * 1.5));
    const n = len > 0 ? [-(b[1] - a[1]) / len, (b[0] - a[0]) / len] : [0, 0];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      for (let k = 0; k < thick; k++) { const o = k - (thick - 1) * 0.5; this.plot(R2I(p[0] + n[0] * o), R2I(p[1] + n[1] * o), c); }
    }
  }
  circle(x, y, r, c) { const n = Math.max(16, Math.ceil(r * 6.3)); for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / n; this.plot(R2I(x + Math.cos(a) * r), R2I(y + Math.sin(a) * r), c); } }
  tri(a, b, c, col) {
    const x0 = Math.floor(Math.min(a[0], b[0], c[0])), x1 = Math.ceil(Math.max(a[0], b[0], c[0])), y0 = Math.floor(Math.min(a[1], b[1], c[1])), y1 = Math.ceil(Math.max(a[1], b[1], c[1]));
    const E = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const area = E(a, b, c); if (Math.abs(area) < 1e-3) return;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const p = [x + 0.5, y + 0.5];
      if (E(b, c, p) / area >= 0 && E(c, a, p) / area >= 0 && E(a, b, p) / area >= 0) this.plot(x, y, col);
    }
  }
  text(x, y, t, c, scale) {
    for (const ch of String(t)) {
      const g = FONT[ch.toUpperCase()];
      if (g) for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) if (g[row][col] === '#')
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) this.plot(x + col * scale + sx, y + (6 - row) * scale + sy, c);
      x += 6 * scale;
    }
  }
  // to a 2D canvas (flipped: the plugin's row 0 is the bottom)
  draw(ctx) {
    const img = ctx.createImageData(this.W, this.H);
    for (let y = 0; y < this.H; y++) img.data.set(this.px.subarray((this.H - 1 - y) * this.W * 4, (this.H - y) * this.W * 4), y * this.W * 4);
    ctx.putImageData(img, 0, 0);
  }
}

const rot = (v, r) => [v[0] * Math.cos(r) - v[1] * Math.sin(r), v[0] * Math.sin(r) + v[1] * Math.cos(r)];
function horizon(c, x0, y0, x1, y1, cx, cy, s, ppd) {
  const r = s.rollDeg * DEG, sin = Math.sin(r), cos = Math.cos(r), off = s.pitchDeg * ppd;
  for (let y = Math.max(0, y0); y < Math.min(c.H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(c.W, x1); x++) c.set((y * c.W + x) * 4, -(x - cx) * sin + (y - cy) * cos + off > 0 ? Sky : Ground);
}
function valueBox(c, x, y, w, h, t, col, scale) {
  c.fill(x, y, w, h, Black);
  c.fill(x, y, w, 2, White); c.fill(x, y + h - 2, w, 2, White); c.fill(x, y, 2, h, White); c.fill(x + w - 2, y, 2, h, White);
  c.text(x + R2I((w - TW(t, scale)) / 2 - 0.5), y + R2I((h - 7 * scale) / 2 - 0.5), t, col, scale);
}
function bar(c, x, y, w, h, f, col, mark) {
  c.fill(x, y, w, h, Grey); c.fill(x + 1, y + 1, w - 2, h - 2, Black);
  c.fill(x + 1, y + 1, R2I((w - 2) * clamp01(f)), h - 2, col);
  if (mark >= 0 && mark <= 1) c.fill(x + R2I(w * mark) - 1, y - 2, 2, h + 4, Red);
}
const frame = (c, x0, y0, x1, y1, col, t = 2) => { c.fill(x0, y0, x1 - x0, t, col); c.fill(x0, y1 - t, x1 - x0, t, col); c.fill(x0, y0, t, y1 - y0, col); c.fill(x1 - t, y0, t, y1 - y0, col); };
const num = (v, d) => (v === undefined || v === null || v === '' || isNaN(+v) ? d : +v);
function dial(c, cx, cy, r, v, lo, hi, red) {   // Pages.Dial: 270 degree arc, value filled, red above `red`, white pointer
  const a0 = -135, a1 = 135, f = clamp01((v - lo) / (hi - lo)), fr = clamp01((red - lo) / (hi - lo));
  for (let a = a0; a <= a1; a += 1.5) {
    const t = (a - a0) / (a1 - a0), col = t >= fr ? Red : t <= f ? (v >= red ? Red : Green) : Grey, d = [Math.sin(a * DEG), Math.cos(a * DEG)];
    const k = t <= f ? r - 10 : r - 4;
    c.line([cx + d[0] * k, cy + d[1] * k], [cx + d[0] * r, cy + d[1] * r], col, 2);
  }
  const na = (a0 + f * (a1 - a0)) * DEG;
  c.line([cx, cy], [cx + Math.sin(na) * (r - 3), cy + Math.cos(na) * (r - 3)], White, 3);
}
const imgCache = new Map();   // data URL -> {w, h, px (rows top-down)} once decoded
function image(src) {
  if (!src) return null;
  const hit = imgCache.get(src);
  if (hit !== undefined) return hit;
  imgCache.set(src, null);
  const im = new Image();
  im.onload = () => { const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); g.drawImage(im, 0, 0); imgCache.set(src, { w: im.width, h: im.height, px: g.getImageData(0, 0, im.width, im.height).data }); };
  im.src = src.startsWith('data:') ? src : 'data:image/png;base64,' + src;
  return null;
}
function fieldNum(f, s) {
  switch (f) {
    case 'ias': return s.iasKmh; case 'alt': return s.altM; case 'radalt': return s.radAltM; case 'mach': return s.mach; case 'g': return s.g;
    case 'aoa': return s.aoaDeg; case 'vs': return s.vsMs; case 'heading': return rep(s.headingDeg, 360); case 'pitch': return s.pitchDeg; case 'roll': return s.rollDeg;
    case 'throttle': return s.throttle * 100; case 'rpm_l': return s.rpmL; case 'rpm_r': return s.rpmR; case 'egt_l': return s.egtL; case 'egt_r': return s.egtR;
    case 'fuel': return s.fuelKg; case 'fuel_pct': return s.fuelFrac * 100; case 'ptb': return s.extFuelKg; case 'hyd': return s.hydraulic; case 'oxy': return s.oxygen;
    case 'target_km': return s.target ? s.targetKm : NaN; case 'rcs': return s.rcs; case 'ir': return s.irFrac * 100;
    default: return NaN;
  }
}
export function fieldRange(f) {
  switch (f) {
    case 'ias': return [0, 1600]; case 'alt': return [0, 15000]; case 'radalt': return [0, 1500]; case 'mach': return [0, 2.5]; case 'g': return [-3, 9];
    case 'aoa': return [-5, 30]; case 'vs': return [-100, 100]; case 'heading': return [0, 360]; case 'pitch': return [-90, 90]; case 'roll': return [-180, 180];
    case 'rpm_l': case 'rpm_r': return [0, 110]; case 'egt_l': case 'egt_r': return [0, 1000]; case 'fuel': return [0, 4500]; case 'ptb': return [0, 3000];
    case 'hyd': return [0, 250]; case 'oxy': return [0, 150]; case 'target_km': return [0, 100]; case 'rcs': return [0, 5];
    default: return [0, 100];
  }
}
const fieldSpan = (f) => { const [lo, hi] = fieldRange(f); return Math.max(1, (hi - lo) / 5); };
function fit(t, w, h, max) { for (let sc = Math.max(1, max); sc > 1; sc--) if (TW(t, sc) <= w && 7 * sc <= h) return sc; return 1; }
export function hexCol(hex, fb) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return fb; const v = parseInt(m[1], 16); return [v >> 16, (v >> 8) & 255, v & 255, 255]; }
const THREAT = ['F', 'SL', 'SS', 'U', 'U', 'N'];
const CAUTIONS = [['fire_l', 'FIRE L', 1], ['fire_r', 'FIRE R', 1], ['missile', 'MISSILE', 1], ['lowalt', 'LOW ALT', 1], ['overg', 'OVER G', 1], ['aoa', 'AOA', 1],
  ['fuel_res', 'FUEL RES', 1], ['fuel_low', 'FUEL LOW', 0], ['lock', 'LOCK', 1], ['hyd', 'HYD', 0], ['gen_l', 'GEN L', 0], ['gen_r', 'GEN R', 0], ['pump', 'PUMP', 0],
  ['oil', 'OIL', 0], ['vib', 'VIB', 0], ['canopy', 'CANOPY', 0], ['gear', 'GEAR', 0], ['speed', 'SPEED', 0], ['ptb', 'PTB EMPTY', 0], ['flaps', 'FLAPS', 0],
  ['brake', 'BRAKE', 0], ['fod', 'INTAKE', 0], ['ab', 'AFTERBRN', 0]];

export const FIELDS = {
  ias: ['IAS', 'Airspeed (km/h)'], alt: ['ALT', 'Altitude (m)'], radalt: ['RALT', 'Radar altitude (m)'], mach: ['MACH', 'Mach'], g: ['G', 'g load'],
  aoa: ['AOA', 'Angle of attack'], vs: ['V/S', 'Vertical speed (m/s)'], heading: ['HDG', 'Heading'], pitch: ['PITCH', 'Pitch'], roll: ['ROLL', 'Bank'],
  throttle: ['THR', 'Throttle %'], rpm_l: ['RPM L', 'Left engine RPM %'], rpm_r: ['RPM R', 'Right engine RPM %'], egt_l: ['EGT L', 'Left EGT'], egt_r: ['EGT R', 'Right EGT'],
  fuel: ['FUEL KG', 'Fuel (kg)'], fuel_pct: ['FUEL', 'Fuel %'], ptb: ['PTB', 'Drop tank fuel (kg)'], hyd: ['HYD', 'Hydraulics'], oxy: ['OXY', 'Oxygen'],
  time: ['TIME', 'Clock'], target_km: ['TGT KM', 'Target range (km)'], rcs: ['RCS', 'Radar cross-section'], ir: ['IR', 'Engine heat %'],
};
function fieldText(f, s) {
  switch (f) {
    case 'ias': return String(R2I(s.iasKmh)); case 'alt': return String(R2I(s.altM)); case 'radalt': return String(R2I(s.radAltM));
    case 'mach': return s.mach.toFixed(2); case 'g': return s.g.toFixed(1); case 'aoa': return String(R2I(s.aoaDeg));
    case 'vs': return (s.vsMs >= 0 ? '+' : '') + R2I(s.vsMs); case 'heading': return pad(R2I(rep(s.headingDeg, 360)), 3);
    case 'pitch': return String(R2I(s.pitchDeg)); case 'roll': return String(R2I(s.rollDeg));
    case 'throttle': return R2I(s.throttle * 100) + '%'; case 'rpm_l': return R2I(s.rpmL) + '%'; case 'rpm_r': return R2I(s.rpmR) + '%';
    case 'egt_l': return String(R2I(s.egtL)); case 'egt_r': return String(R2I(s.egtR)); case 'fuel': return String(R2I(s.fuelKg));
    case 'fuel_pct': return R2I(s.fuelFrac * 100) + '%'; case 'ptb': return String(R2I(s.extFuelKg)); case 'hyd': return String(R2I(s.hydraulic));
    case 'oxy': return String(R2I(s.oxygen)); case 'time': return clock(s); case 'target_km': return s.target ? s.targetKm.toFixed(1) : '-';
    case 'rcs': return s.rcs.toFixed(s.rcs < 10 ? 2 : 1); case 'ir': return R2I(s.irFrac * 100) + '%';
    default: return '';
  }
}
function fieldFrac(f, s) {
  switch (f) {
    case 'ias': return s.iasKmh / 1600; case 'alt': return s.altM / 15000; case 'radalt': return s.radAltM / 1500; case 'mach': return s.mach / 2.5;
    case 'g': return (s.g + 3) / 12; case 'aoa': return s.aoaDeg / 30; case 'throttle': return s.throttle; case 'rpm_l': return s.rpmL / 110; case 'rpm_r': return s.rpmR / 110;
    case 'egt_l': return (s.egtL - 200) / 800; case 'egt_r': return (s.egtR - 200) / 800; case 'fuel': case 'fuel_pct': return s.fuelFrac;
    case 'ptb': return s.extFuelKg / 3000; case 'hyd': return s.hydraulic / 250; case 'oxy': return s.oxygen / 150; case 'ir': return s.irFrac;
    default: return 0;
  }
}
function fieldWarn(f, s) {
  switch (f) {
    case 'g': return s.g > 8.5 || s.g < -2.5 ? Red : null; case 'aoa': return s.aoaDeg > 24 && s.airborne ? Red : null; case 'ias': return s.iasKmh > 1450 ? Red : null;
    case 'rpm_l': return s.rpmL >= 104 ? Red : null; case 'rpm_r': return s.rpmR >= 104 ? Red : null; case 'egt_l': return s.egtL >= 950 ? Red : null; case 'egt_r': return s.egtR >= 950 ? Red : null;
    case 'fuel': case 'fuel_pct': return s.fuelFrac < 0.1 ? Red : s.fuelFrac < 0.25 ? Amber : null;
    case 'hyd': return s.hydraulic < 150 ? Amber : null; case 'oxy': return s.oxygen < 30 ? Amber : null;
    case 'ir': return s.irFrac < 0.35 ? Green : s.irFrac < 0.7 ? Amber : Red;
    default: return null;
  }
}
const clock = (s) => pad(s.hours, 2) + ':' + pad(s.minutes, 2) + ':' + pad(Math.floor(s.seconds), 2);

export function drawPage(c, s, p) {
  c.clip(0, 0, c.W, c.H);
  c.fill(0, 0, c.W, c.H, hexCol(p.bg, Black));
  for (const w of p.widgets || []) {
    const x0 = R2I(w.x * c.W), x1 = R2I((w.x + w.w) * c.W), y1 = R2I((1 - w.y) * c.H), y0 = R2I((1 - w.y - w.h) * c.H);
    if (x1 - x0 < 4 || y1 - y0 < 4) continue;
    c.clip(x0, y0, x1, y1);
    if (w.bg) c.fill(x0, y0, x1 - x0, y1 - y0, hexCol(w.bg, Black));
    try { widget(c, s, w, x0, y0, x1, y1); } catch (e) { console.warn(w.type, e); }
    c.clip(x0, y0, x1, y1);
    if (w.border) frame(c, x0, y0, x1, y1, hexCol(w.border, Grey), Math.max(1, Math.trunc(num(w.borderW, 2))));
    c.clip(0, 0, c.W, c.H);
  }
}

function widget(c, s, w, x0, y0, x1, y1) {
  const W = x1 - x0, H = y1 - y0, cx = Math.trunc((x0 + x1) / 2), cy = Math.trunc((y0 + y1) / 2), main = hexCol(w.color, White);
  switch (w.type) {
    case 'attitude': {
      const ppd = H / 45, r = s.rollDeg * DEG;
      { const sky = hexCol(w.sky, Sky), gnd = hexCol(w.ground, Ground), sin = Math.sin(r), cos = Math.cos(r), off = s.pitchDeg * ppd;
        for (let y = Math.max(0, y0); y < Math.min(c.H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(c.W, x1); x++) c.set((y * c.W + x) * 4, -(x - cx) * sin + (y - cy) * cos + off > 0 ? sky : gnd); }
      const dir = [Math.cos(r), Math.sin(r)], nrm = [-Math.sin(r), Math.cos(r)], ts = W >= 200 ? 2 : 1, step = Math.max(5, Math.trunc(num(w.ladderStep, 5)));
      const at = (m, v, k) => [m[0] + v[0] * k, m[1] + v[1] * k];
      for (let pp = -90; pp <= 90; pp += step) {
        const d = (pp - s.pitchDeg) * ppd; if (Math.abs(d) > H * 0.45) continue;
        const m = at([cx, cy], nrm, d);
        if (pp === 0) { c.line(at(m, dir, -W), at(m, dir, W), White, 3); continue; }
        const half = pp % 10 === 0 ? W * 0.18 : W * 0.09, gap = W * 0.06;
        c.line(at(m, dir, -half), at(m, dir, -gap), White, 2); c.line(at(m, dir, gap), at(m, dir, half), White, 2);
        const tip = pp > 0 ? -6 : 6;
        c.line(at(m, dir, -half), at(at(m, dir, -half), nrm, tip), White, 2); c.line(at(m, dir, half), at(at(m, dir, half), nrm, tip), White, 2);
        if (pp % 10 === 0) { const a = at(m, dir, half + 5); c.text(Math.trunc(a[0]), Math.trunc(a[1]) - 3 * ts, String(Math.abs(pp)), White, ts); }
      }
      const br = Math.min(W, H) / 2 - 14;
      if (br > 20 && !w.noBank) {
        for (const k of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) { const a = k * DEG, r1 = Math.abs(k) % 30 === 0 ? br + 12 : br + 7; c.line([cx + Math.sin(a) * br, cy + Math.cos(a) * br], [cx + Math.sin(a) * r1, cy + Math.cos(a) * r1], White, 2); }
        const pa = [cx - Math.sin(r) * (br - 3), cy + Math.cos(r) * (br - 3)], v1 = rot([-7, -12], r), v2 = rot([7, -12], r);
        c.tri(pa, [pa[0] + v1[0], pa[1] + v1[1]], [pa[0] + v2[0], pa[1] + v2[1]], Yellow);
      }
      const wg = W * 0.2, st = Math.trunc(Math.max(3, W * 0.015));
      c.line([cx - wg, cy], [cx - wg * 0.35, cy], Yellow, st); c.line([cx - wg * 0.35, cy], [cx - wg * 0.35, cy - wg * 0.2], Yellow, st);
      c.line([cx + wg * 0.35, cy], [cx + wg, cy], Yellow, st); c.line([cx + wg * 0.35, cy], [cx + wg * 0.35, cy - wg * 0.2], Yellow, st);
      c.fill(cx - 3, cy - 3, 7, 7, Yellow);
      if (w.frame) frame(c, x0, y0, x1, y1, Grey);
      break;
    }
    case 'speed_tape': case 'alt_tape': {
      const spd = w.type === 'speed_tape', v = spd ? s.iasKmh : s.altM, span = Math.max(20, num(w.span, spd ? 300 : 1400)), ppu = H / span;
      let tick = spd ? 10 : 50, lab = spd ? 50 : 200;
      if (spd && span > 800) { tick = 50; lab = 200; } else if (!spd && span > 4000) { tick = 200; lab = 1000; }
      c.fill(x0, y0, W, H, Black);
      const ts = W >= 70 ? 2 : 1;
      for (let u = Math.floor((v - span / 2) / tick) * tick; u <= v + span / 2; u += tick) {
        if (spd && u < 0) continue;
        const y = cy + R2I((u - v) * ppu), big = Math.abs(u % (tick * 5)) < 0.01, len = big ? 12 : 7;
        if (spd) c.fill(x1 - len, y - 1, len, 3, main); else c.fill(x0, y - 1, len, 3, main);
        if (Math.abs(u % lab) < 0.01) { const t = String(R2I(u)); if (spd) c.text(x1 - 15 - TW(t, ts), y - Math.trunc(7 * ts / 2), t, main, ts); else c.text(x0 + 15, y - Math.trunc(7 * ts / 2), t, main, ts); }
      }
      const val = String(R2I(v)), bh = Math.min(36, Math.trunc(H / 4));
      const vcol = spd ? (s.iasKmh > 1450 ? Red : White) : (s.radAltM < 60 && s.airborne && !s.gearDown ? Red : White);
      c.clip(0, 0, c.W, c.H);
      valueBox(c, x0, cy - Math.trunc(bh / 2), W, bh, val, vcol, fit(val, W - 8, bh - 8, 3));
      if (w.frame) frame(c, x0, y0, x1, y1, Grey);
      break;
    }
    case 'heading_tape': {
      const hdg = rep(s.headingDeg, 360), ppd = W / 60, ts = H >= 60 ? 2 : 1;
      c.fill(x0, y0, W, H, Black);
      for (let dd = -32; dd <= 32; dd++) {
        const a = rep(Math.round(hdg) + dd, 360), x = cx + R2I(deltaAngle(hdg, a) * ppd), ai = R2I(a) % 360;
        if (ai % 10 === 0) { c.fill(x - 1, y0 + 2, 3, 12, main); if (ai % 20 === 0 || ppd > 6) { const t = pad(ai / 10, 2); c.text(x - Math.trunc(TW(t, ts) / 2), y0 + 18, t, main, ts); } }
        else if (ai % 5 === 0) c.fill(x, y0 + 2, 2, 7, main);
      }
      const hv = pad(R2I(hdg), 3), bh = Math.min(34, Math.trunc(H / 2)), bw = TW(hv, 3) + 16;
      valueBox(c, cx - Math.trunc(bw / 2), y1 - bh, bw, bh, hv, Green, fit(hv, bw - 8, bh - 8, 3));
      break;
    }
    case 'value': {
      const label = w.label ? w.label.toUpperCase() : (FIELDS[w.field] || [''])[0], col = fieldWarn(w.field, s) || main;
      let val = fieldText(w.field, s); const dec = Math.trunc(num(w.decimals, -1)), n = fieldNum(w.field, s);
      if (dec >= 0 && !isNaN(n)) val = n.toFixed(Math.min(dec, 4));
      val += (w.unit || '').toUpperCase();
      if (w.frame) frame(c, x0, y0, x1, y1, Grey);
      const ls = label.length > 0 ? Math.max(1, Math.min(2, Math.trunc((H - 8) / 22))) : 0;
      if (ls > 0) c.text(x0 + 6, y1 - 6 - 7 * ls, label, hexCol(w.labelColor, Cyan), ls);
      const vh = H - 10 - (ls > 0 ? 7 * ls + 4 : 0), vs = w.size > 0 ? w.size : fit(val, W - 12, vh, 5);
      c.text(x1 - 6 - TW(val, vs), y0 + 5, val, col, vs);
      break;
    }
    case 'bar': {
      const f = fieldFrac(w.field, s), col = fieldWarn(w.field, s) || hexCol(w.color, Green);
      c.fill(x0, y0, W, H, Grey); c.fill(x0 + 1, y0 + 1, W - 2, H - 2, Black);
      if (H > W) c.fill(x0 + 1, y0 + 1, W - 2, R2I((H - 2) * clamp01(f)), col); else c.fill(x0 + 1, y0 + 1, R2I((W - 2) * clamp01(f)), H - 2, col);
      break;
    }
    case 'text': {
      const t = (w.text || '').toUpperCase(), sc = w.size > 0 ? w.size : fit(t, W - 4, H - 4, 3);
      const x = w.align === 'center' ? cx - Math.trunc(TW(t, sc) / 2) : w.align === 'right' ? x1 - 2 - TW(t, sc) : x0 + 2;
      c.text(x, cy - Math.trunc(7 * sc / 2), t, main, sc);
      break;
    }
    case 'box': { const col = hexCol(w.color, Grey); if (w.fill) c.fill(x0, y0, W, H, col); else frame(c, x0, y0, x1, y1, col, Math.max(1, w.thick || 2)); break; }
    case 'clock': { const t = clock(s), sc = w.size > 0 ? w.size : fit(t, W - 4, H - 4, 5); c.text(cx - Math.trunc(TW(t, sc) / 2), cy - Math.trunc(7 * sc / 2), t, hexCol(w.color, Cyan), sc); break; }
    case 'rwr': {
      const R = Math.min(W, H) / 2 - 6;
      c.circle(cx, cy, R, DimGreen); c.circle(cx, cy, R - 1, DimGreen); c.circle(cx, cy, R * 0.5, DimGreen);
      for (let k = 0; k < 12; k++) { const a = k * 30 * DEG; c.line([cx + Math.sin(a) * R * 0.9, cy + Math.cos(a) * R * 0.9], [cx + Math.sin(a) * R, cy + Math.cos(a) * R], Green, 3); }
      c.line([cx, cy - 10], [cx, cy + 12], Green, 3); c.line([cx - 12, cy + 3], [cx + 12, cy + 3], Green, 3);
      const ts = R > 80 ? 3 : 2;
      for (const [bearing, type] of s.rwr) {
        const a = bearing * DEG, rr = type < 0 ? R * 0.42 : R * (0.92 - 0.55 * clamp01(s.rwrPower));
        const x = cx + R2I(Math.sin(a) * rr), y = cy + R2I(Math.cos(a) * rr);
        if (type < 0) { if (s.blink) { c.circle(x, y, 5 * ts, Red); c.text(x - 3 * ts, y - Math.trunc(7 * ts / 2), 'M', Red, ts); } continue; }
        const t = THREAT[type] || 'U';
        c.text(x - Math.trunc(TW(t, ts) / 2), y - Math.trunc(7 * ts / 2), t, s.lockedOn ? Red : Yellow, ts);
        if (s.lockedOn) c.circle(x, y, 6 * ts, Red);
      }
      if (s.lockedOn && s.blink) c.text(x0 + 4, y1 - 18, 'LOCK', Red, 2);
      break;
    }
    case 'stores': {
      const sc = w.size > 0 ? w.size : (H >= 120 && W >= 200 ? 3 : 2), rh = 7 * sc + 9;
      let y = y1 - rh;
      if (w.frame) { c.text(x0 + 4, y1 - 18, 'STORES', Cyan, 2); y = y1 - 20 - rh; }
      if (!s.stations.length) c.text(x0 + 8, y, 'NONE', DimGreen, sc);
      const maxRows = Math.trunc(num(w.rows, 0)); let shown = 0;
      for (const [name, ammo, , selected] of s.stations) {
        if (y < y0 || (maxRows > 0 && shown++ >= maxRows)) break;
        if (selected) { c.fill(x0 + 2, y - 4, W - 4, rh - 2, DarkCyan); c.fill(x0 + 2, y - 4, 4, rh - 2, Cyan); }
        const n = name.slice(0, 8).toUpperCase(), a = String(ammo);
        c.text(x0 + 10, y, n, selected ? Cyan : White, sc);
        c.text(x1 - 6 - TW(a, sc), y, a, ammo === 0 ? Grey : selected ? Cyan : Green, sc);
        y -= rh;
      }
      break;
    }
    case 'cms': {
      let y = y1 - 18; c.text(x0 + 4, y, 'CMS', Cyan, 2); y -= 24;
      for (const [name, ammo] of s.countermeasures) {
        if (y < y0) break;
        let n = (name || '').toUpperCase().replace('RADAR ', '').replace('IR ', ''); if (n.length > 6) n = n.slice(0, 6);
        c.text(x0 + 4, y, n, White, 2); c.text(x1 - 4 - TW(String(ammo), 2), y, String(ammo), ammo === 0 ? Red : Green, 2);
        y -= 22;
      }
      break;
    }
    case 'target': {
      c.text(x0 + 4, y1 - 18, 'TGT', Cyan, 2);
      if (s.target) {
        const t = s.target.toUpperCase().slice(0, 11), km = s.targetKm.toFixed(s.targetKm < 10 ? 1 : 0) + 'KM';
        c.text(x0 + 4, y1 - 42, t, White, 2); c.text(x0 + 4, y0 + 4, km, Yellow, fit(km, W - 8, Math.max(8, H - 50), 3));
      } else c.text(x0 + 4, y1 - 42, 'NONE', DimGreen, 2);
      break;
    }
    case 'engines': {
      if (w.frame) frame(c, x0, y0, x1, y1, Grey);
      const colW = Math.trunc((W - 30) / 2), sc = H >= 100 ? 3 : 2;
      [[0, s.rpmL, s.egtL, 'L'], [1, s.rpmR, s.egtR, 'R']].forEach(([k, rpm, egt, side]) => {
        const xa = x0 + 8 + k * (colW + 14), rv = R2I(rpm) + '%', top = y1 - 8 - 7 * sc;
        c.text(xa, top, side, Cyan, sc); c.text(xa + colW - TW(rv, sc), top, rv, rpm >= 104 ? Red : White, sc);
        bar(c, xa, top - 16, colW, 10, rpm / 110, rpm >= 104 ? Red : Green, 104 / 110);
        const ev = 'EGT ' + R2I(egt);
        if (top - 40 > y0) { c.text(xa + colW - TW(ev, 2), top - 38, ev, egt >= 950 ? Red : White, 2); bar(c, xa, top - 50, colW, 7, (egt - 200) / 800, egt >= 950 ? Red : Amber, 750 / 800); }
      });
      break;
    }
    case 'fuel': {
      if (w.frame) frame(c, x0, y0, x1, y1, Grey);
      const fk = String(R2I(s.fuelKg)), fcol = s.fuelFrac < 0.1 ? Red : s.fuelFrac < 0.25 ? Amber : White, sc = fit(fk + 'KG', W - 16, Math.max(10, H - 34), 3);
      c.text(x0 + 8, y1 - 8 - 7 * sc, fk, fcol, sc); c.text(x0 + 14 + TW(fk, sc), y1 - 8 - 14, 'KG', Green, 2);
      bar(c, x0 + 6, y1 - 24 - 7 * sc, W - 12, 10, s.fuelFrac, fcol === White ? Green : fcol, -1);
      if ((s.extFuelKg > 0.5 || s.ptbEmpty) && y1 - 50 - 7 * sc > y0) c.text(x0 + 8, y1 - 46 - 7 * sc, 'PTB ' + R2I(s.extFuelKg), s.ptbEmpty ? Amber : White, 2);
      break;
    }
    case 'signature': {
      if (w.frame) frame(c, x0, y0, x1, y1, Grey);
      const by = y1 - 24, irTxt = s.irFrac < 0.35 ? 'LOW' : s.irFrac < 0.7 ? 'MED' : 'HIGH', irCol = s.irFrac < 0.35 ? Green : s.irFrac < 0.7 ? Amber : Red;
      c.text(x0 + 6, by, 'IR', White, 2); bar(c, x0 + 34, by - 1, Math.max(10, W - 110), 16, s.irFrac, irCol, -1); c.text(x1 - 6 - TW(irTxt, 2), by, irTxt, irCol, 2);
      const extra = s.rcsClean > 0 ? s.rcs / s.rcsClean - 1 : 0, rv = s.rcs.toFixed(s.rcs < 10 ? 2 : 1);
      c.text(x0 + 6, by - 28, 'RCS', White, 2); c.text(x0 + 50, by - 28, rv, Cyan, 2);
      if (extra > 0.01) c.text(x0 + 58 + TW(rv, 2), by - 28, '+' + R2I(extra * 100) + '%', Amber, 2);
      const rd = s.radarOn ? 'RDR ON' : 'RDR OFF'; c.text(x1 - 6 - TW(rd, 2), by - 28, rd, s.radarOn ? Green : Grey, 2);
      break;
    }
    case 'cautions': {
      const cols = W >= 220 ? 2 : 1, cw = Math.trunc((W - 4 - 4 * cols) / cols); let row = 0;
      for (const [id, text, warn] of CAUTIONS) {
        if (!s.cautions.includes(id)) continue;
        const col = row % cols, line = Math.trunc(row / cols), y = y1 - 22 - line * 23;
        if (y < y0) break;
        if (warn) c.fill(x0 + 2 + col * (cw + 4), y - 3, cw, 20, WarnBack);
        c.text(x0 + 6 + col * (cw + 4), y, text.slice(0, 9), warn ? Red : Amber, 2);
        row++;
      }
      if (!row) c.text(x0 + 6, y1 - 22, 'NO CAUTIONS', DimGreen, 2);
      break;
    }
    case 'dial': {
      let v = fieldNum(w.field, s); if (isNaN(v)) v = 0;
      const [dlo, dhi] = fieldRange(w.field), lo = num(w.min, dlo), hi = num(w.max, dhi), red = num(w.red, hi + 1), R = Math.min(W, H) / 2 - 4;
      if (R < 8) break;
      for (let k = 0; k <= 10; k++) { const a = (-135 + 27 * k) * DEG, d = [Math.sin(a), Math.cos(a)], k0 = R - (k % 5 === 0 ? 9 : 5); c.line([cx + d[0] * k0, cy + d[1] * k0], [cx + d[0] * R, cy + d[1] * R], main, 2); }
      dial(c, cx, cy, R - 12, v, lo, hi, red);
      const lbl = w.label ? w.label.toUpperCase() : (FIELDS[w.field] || [''])[0], ls = R > 50 ? 2 : 1;
      c.text(cx - Math.trunc(TW(lbl, ls) / 2), cy + Math.trunc(R * 0.35), lbl, hexCol(w.labelColor, Cyan), ls);
      if (w.showValue !== false) { const t = fieldText(w.field, s), vs = fit(t, Math.trunc(R * 1.2), Math.trunc(R * 0.4), 3); c.text(cx - Math.trunc(TW(t, vs) / 2), cy - Math.trunc(R * 0.55), t, fieldWarn(w.field, s) || White, vs); }
      break;
    }
    case 'compass': {
      const hdg = rep(s.headingDeg, 360), R = Math.min(W, H) / 2 - 4; if (R < 12) break;
      c.circle(cx, cy, R, Grey);
      const ts = R > 70 ? 2 : 1;
      for (let d = 0; d < 360; d += 5) {
        const a = (d - hdg) * DEG, u = [Math.sin(a), Math.cos(a)], len = d % 30 === 0 ? 10 : d % 10 === 0 ? 6 : 3;
        c.line([cx + u[0] * (R - len), cy + u[1] * (R - len)], [cx + u[0] * R, cy + u[1] * R], main, d % 10 === 0 ? 2 : 1);
        if (d % 30 === 0) {
          const t = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d / 10), k = R - 12 - 5 * ts;
          c.text(Math.trunc(cx + u[0] * k) - Math.trunc(TW(t, ts) / 2), Math.trunc(cy + u[1] * k) - Math.trunc(7 * ts / 2), t, d % 90 === 0 ? Yellow : main, ts);
        }
      }
      c.tri([cx, cy + R + 1], [cx - 6, cy + R - 9], [cx + 6, cy + R - 9], Yellow);
      c.line([cx, cy - 10], [cx, cy + 12], Yellow, 3); c.line([cx - 10, cy + 4], [cx + 10, cy + 4], Yellow, 3); c.line([cx - 5, cy - 9], [cx + 5, cy - 9], Yellow, 2);
      break;
    }
    case 'aoa_index': {
      const lo = num(w.lo, 8), hi = num(w.hi, 14), a = s.aoaDeg, sz = Math.min(W - 4, Math.trunc(H / 3) - 4), hh = Math.trunc(sz / 2);
      if (sz < 6) break;
      const dim = [40, 44, 48, 255], yt = y1 - Math.trunc(H / 6), ym = cy, yb = y0 + Math.trunc(H / 6);
      const top = a > hi ? Red : dim, mid = a >= lo && a <= hi ? Green : dim, bot = a < lo ? Amber : dim, h2 = Math.trunc(hh / 2);
      c.line([cx - hh, yt + h2], [cx, yt - h2], top, 4); c.line([cx, yt - h2], [cx + hh, yt + h2], top, 4);
      c.circle(cx, ym, hh * 0.7, mid); c.circle(cx, ym, hh * 0.7 - 1, mid); c.circle(cx, ym, hh * 0.7 - 2, mid);
      c.line([cx - hh, yb - h2], [cx, yb + h2], bot, 4); c.line([cx, yb + h2], [cx + hh, yb - h2], bot, 4);
      break;
    }
    case 'vtape': {
      let v = fieldNum(w.field, s); if (isNaN(v)) v = 0;
      const span = Math.max(1, num(w.span, fieldSpan(w.field))); let tick = num(w.tick, span / 20); if (tick <= 0) tick = span / 20;
      const ppu = H / span, ts = W >= 70 ? 2 : 1, left = w.align === 'right';
      c.fill(x0, y0, W, H, Black);
      for (let k = Math.floor((v - span / 2) / tick); k * tick <= v + span / 2; k++) {
        const u = k * tick, y = cy + R2I((u - v) * ppu), big = ((k % 5) + 5) % 5 === 0, len = big ? 12 : 7;
        if (left) c.fill(x0, y - 1, len, 3, main); else c.fill(x1 - len, y - 1, len, 3, main);
        if (big) { const t = String(R2I(u)); if (left) c.text(x0 + 15, y - Math.trunc(7 * ts / 2), t, main, ts); else c.text(x1 - 15 - TW(t, ts), y - Math.trunc(7 * ts / 2), t, main, ts); }
      }
      const val = fieldText(w.field, s), bh = Math.min(36, Math.trunc(H / 4));
      c.clip(0, 0, c.W, c.H);
      valueBox(c, x0, cy - Math.trunc(bh / 2), W, bh, val, fieldWarn(w.field, s) || White, fit(val, W - 8, bh - 8, 3));
      break;
    }
    case 'line': {
      const col = hexCol(w.color, Grey), th = Math.max(1, w.thick || 1), d = !w.align || w.align === 'left' ? 'h' : w.align;
      if (d === 'h') c.fill(x0, cy - Math.trunc(th / 2), W, th, col);
      else if (d === 'v') c.fill(cx - Math.trunc(th / 2), y0, th, H, col);
      else if (d === 'd1') c.line([x0, y1 - 1], [x1 - 1, y0], col, th);
      else c.line([x0, y0], [x1 - 1, y1 - 1], col, th);
      break;
    }
    case 'image': {
      const img = image(w.img); if (!img) break;
      for (let yy = 0; yy < H; yy++) {
        const sy = Math.min(img.h - 1, Math.max(0, Math.trunc((yy + 0.5) * img.h / H))), y = y1 - 1 - yy;
        for (let xx = 0; xx < W; xx++) {
          const i = (sy * img.w + Math.min(img.w - 1, Math.max(0, Math.trunc((xx + 0.5) * img.w / W)))) * 4;
          if (img.px[i + 3] > 127) c.plot(x0 + xx, y, [img.px[i], img.px[i + 1], img.px[i + 2], 255]);
        }
      }
      break;
    }
    case 'warnings': {
      let y = y1 - 26; const sc = fit('MISSILE', W - 8, 22, 3);
      if (s.missileIncoming && s.blink) { c.fill(cx - Math.trunc(TW('MISSILE', sc) / 2) - 4, y - 4, TW('MISSILE', sc) + 8, 7 * sc + 8, WarnBack); c.text(cx - Math.trunc(TW('MISSILE', sc) / 2), y, 'MISSILE', Red, sc); y -= 7 * sc + 12; }
      if (s.lockedOn) { c.text(cx - Math.trunc(TW('LOCK', 2) / 2), y, 'LOCK', Red, 2); y -= 22; }
      if (s.gearDown || s.gearMoving) { c.text(cx - Math.trunc(TW('GEAR', 2) / 2), y, 'GEAR', s.gearMoving ? Amber : Green, 2); y -= 22; }
      if (s.throttle > 0.9 && (s.rpmL > 90 || s.rpmR > 90)) c.text(cx - Math.trunc(TW('A/B', 2) / 2), y, 'A/B', Amber, 2);
      break;
    }
  }
}

// flight data for the preview: a gentle manoeuvre that moves every gauge
export function sampleState(t) {
  const sec = 9 * 3600 + 37 * 60 + t;
  return {
    iasKmh: 720 + 180 * Math.sin(t * 0.21), mach: 0.6 + 0.15 * Math.sin(t * 0.21), altM: 3200 + 600 * Math.sin(t * 0.13), vsMs: 40 * Math.cos(t * 0.13),
    aoaDeg: 6 + 4 * Math.sin(t * 0.5), g: 1 + 2.5 * Math.max(0, Math.sin(t * 0.5)), pitchDeg: 8 * Math.sin(t * 0.3), rollDeg: 35 * Math.sin(t * 0.17),
    headingDeg: rep(40 + t * 6, 360), radAltM: 900 + 400 * Math.sin(t * 0.13), rpmL: 86 + 8 * Math.sin(t * 0.4), rpmR: 85 + 8 * Math.sin(t * 0.4 + 0.3),
    egtL: 620 + 90 * Math.sin(t * 0.4), egtR: 610 + 90 * Math.sin(t * 0.4 + 0.3), fuelKg: 3100 - (t % 60) * 3, fuelFrac: 0.68 - (t % 60) * 0.0006,
    ptbEmpty: false, oxygen: 150, hydraulic: 210, throttle: 0.75 + 0.15 * Math.sin(t * 0.4),
    hours: Math.floor(sec / 3600) % 24, minutes: Math.floor(sec / 60) % 60, seconds: sec % 60,
    gearDown: false, gearMoving: false, airborne: true, missileIncoming: Math.floor(t / 6) % 3 === 2, lockedOn: Math.floor(t / 6) % 3 === 2,
    blink: Math.floor(t * 2) % 2 === 0, rwrPower: 0.5, rwr: [[rep(30 + t * 4, 360), 0], [210, 1], [rep(300 - t * 3, 360), 4]].concat(Math.floor(t / 6) % 3 === 2 ? [[60, -1]] : []),
    stations: [['GUN 30MM', 150, 150, false], ['R-77', 4, 4, true], ['R-73', 2, 2, false], ['KH-29L', 0, 2, false]],
    countermeasures: [['IR FLARES', 30], ['ECM', 1], ['RADAR CHAFF', 30]], target: 'PANTSIR S1', targetKm: 12.4 - (t % 30) * 0.2, extFuelKg: 0,
    irFrac: 0.35 + 0.3 * Math.sin(t * 0.4), rcs: 0.18, rcsClean: 0.15, radarOn: true,
    cautions: Math.floor(t / 6) % 3 === 2 ? ['missile', 'lock'] : ['fuel_low'],
  };
}

// the widget palette: type -> name, default box (fractions of the screen) and options
export const WIDGETS = {
  attitude: { name: 'Attitude (horizon, ladder, bank)', box: [0.1, 0.25, 0.8, 0.4], frame: false },
  speed_tape: { name: 'Speed tape', box: [0.02, 0.25, 0.2, 0.4], frame: false },
  alt_tape: { name: 'Altitude tape', box: [0.78, 0.25, 0.2, 0.4], frame: false },
  heading_tape: { name: 'Heading tape', box: [0.1, 0.02, 0.8, 0.12] },
  value: { name: 'Value (any reading)', box: [0.05, 0.7, 0.42, 0.1], frame: true, field: 'mach' },
  bar: { name: 'Bar gauge (any reading)', box: [0.05, 0.85, 0.9, 0.03], field: 'throttle', color: '#46e65a' },
  clock: { name: 'Clock', box: [0.2, 0.9, 0.6, 0.06] },
  rwr: { name: 'Radar warning scope', box: [0.1, 0.05, 0.8, 0.4] },
  stores: { name: 'Stores list', box: [0.03, 0.3, 0.6, 0.4], frame: true },
  cms: { name: 'Countermeasures', box: [0.66, 0.3, 0.32, 0.25] },
  target: { name: 'Target', box: [0.66, 0.56, 0.32, 0.18] },
  engines: { name: 'Engines (RPM, EGT)', box: [0.03, 0.4, 0.94, 0.16], frame: true },
  fuel: { name: 'Fuel', box: [0.03, 0.58, 0.94, 0.1], frame: true },
  signature: { name: 'Signature (IR, RCS, radar)', box: [0.03, 0.28, 0.94, 0.1], frame: true },
  cautions: { name: 'Caution list', box: [0.03, 0.75, 0.94, 0.2] },
  warnings: { name: 'Warnings (missile, lock, gear)', box: [0.25, 0.5, 0.5, 0.12] },
  text: { name: 'Text label', box: [0.05, 0.05, 0.5, 0.05], text: 'LABEL', color: '#3cd2e6' },
  box: { name: 'Box', box: [0.05, 0.5, 0.9, 0.1], fill: false, color: '#464a50' },
  dial: { name: 'Round dial (any reading)', box: [0.25, 0.3, 0.5, 0.25], field: 'rpm_l' },
  compass: { name: 'Compass rose', box: [0.15, 0.3, 0.7, 0.32] },
  aoa_index: { name: 'AoA indexer', box: [0.85, 0.3, 0.12, 0.25] },
  vtape: { name: 'Vertical tape (any reading)', box: [0.05, 0.3, 0.2, 0.4], field: 'fuel' },
  line: { name: 'Line', box: [0.05, 0.5, 0.9, 0.02], color: '#464a50' },
  image: { name: 'Picture', box: [0.3, 0.05, 0.4, 0.15] },
};

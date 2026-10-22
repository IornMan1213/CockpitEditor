// Cockpit Editor front end. The cockpit is shown in three.js space, which is the game's (Unity's) frame with z flipped
// (Unity is left-handed): toU / fromU convert. Everything is kept in three space here and saved in Unity space.
//
// Three kinds of things can be selected:
//   decal   your painted marking (text and/or picture), flat on a surface
//   screen  your display: any page, any size, a convex outline, in a bezel
//   group   one of the cockpit's own instruments / displays / panels (cockpit_mesh.json "groups"), moved by a transform
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Canvas, drawPage, sampleState, WIDGETS, FIELDS, fieldRange } from './mfd.js';

const $ = (id) => document.getElementById(id);
const toU = (v) => [+v.x.toFixed(5), +v.y.toFixed(5), +(-v.z).toFixed(5)];
const fromU = (a) => new THREE.Vector3(a[0], a[1], -a[2]);

const PAGE_NAMES = { pfd: 'Flight display (PFD)', eng: 'RWR / signature / engines', sms: 'Stores (SMS)', stby: 'Standby attitude', ufc: 'UFCP window (clock, weapon)', tac: 'Tactical display (experimental)' };
const KIND_NAMES = { display: 'Displays', instrument: 'Instruments', lever: 'Levers and knobs', knob: 'Levers and knobs', 'switch panel': 'Switch panels' };
const KIND_ORDER = ['Displays', 'Instruments', 'Levers and knobs', 'Switch panels'];
const FONTS = ['Arial Black', 'Impact', 'Stencil', 'Bahnschrift', 'Arial', 'Consolas', 'Segoe UI'];
const TEMPLATES = [
  { name: 'STEP HERE', w: 0.12, h: 0.05, style: { text: 'STEP HERE', font: 'Arial Black', color: '#111111', bgOn: true, bg: '#f2c230', border: true, borderColor: '#111111', stripes: false, radius: 6 } },
  { name: 'NO STEP', w: 0.10, h: 0.035, style: { text: 'NO STEP', font: 'Arial Black', color: '#ffffff', bgOn: true, bg: '#c62828', border: false, borderColor: '#ffffff', stripes: false, radius: 4 } },
  { name: 'Hazard stripes', w: 0.12, h: 0.04, style: { text: 'CAUTION', font: 'Impact', color: '#111111', bgOn: true, bg: '#f2c230', border: false, borderColor: '#111111', stripes: true, radius: 0 } },
  { name: 'EJECTION SEAT', w: 0.11, h: 0.05, style: { text: 'DANGER\nEJECTION SEAT', font: 'Arial Black', color: '#111111', bgOn: true, bg: '#f2c230', border: true, borderColor: '#c62828', stripes: false, radius: 3 } },
  { name: 'Red stencil', w: 0.10, h: 0.03, style: { text: 'PULL TO EJECT', font: 'Stencil', color: '#d32f2f', bgOn: false, bg: '#000000', border: false, borderColor: '#d32f2f', stripes: false, radius: 0 } },
  { name: 'White label', w: 0.08, h: 0.02, style: { text: 'ВКЛ / ON', font: 'Bahnschrift', color: '#f0f0f0', bgOn: false, bg: '#000000', border: false, borderColor: '#ffffff', stripes: false, radius: 0 } },
  { name: 'Placard', w: 0.09, h: 0.03, style: { text: 'MiG-29SMT', font: 'Bahnschrift', color: '#e8e8e8', bgOn: true, bg: '#202326', border: true, borderColor: '#9aa0a6', stripes: false, radius: 3 } },
  { name: 'REMOVE BEFORE FLIGHT', w: 0.14, h: 0.03, style: { text: 'REMOVE BEFORE FLIGHT', font: 'Arial Black', color: '#ffffff', bgOn: true, bg: '#c62828', border: false, borderColor: '#ffffff', stripes: false, radius: 2 } },
];
// screen outlines: convex, counter-clockwise from the front, in -0.5..0.5 of the screen's width and height
function arcCorners(r, segs) {
  const pts = [];
  for (const [cx, cy, a0] of [[0.5 - r, -0.5 + r, -90], [0.5 - r, 0.5 - r, 0], [-0.5 + r, 0.5 - r, 90], [-0.5 + r, -0.5 + r, 180]])
    for (let k = 0; k <= segs; k++) { const a = THREE.MathUtils.degToRad(a0 + 90 * k / segs); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}
const SHAPES = {
  rect: { name: 'Rectangle', pts: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] },
  rounded: { name: 'Rounded', pts: arcCorners(0.12, 4) },
  cut: { name: 'Cut corners', pts: [[-0.38, -0.5], [0.38, -0.5], [0.5, -0.38], [0.5, 0.38], [0.38, 0.5], [-0.38, 0.5], [-0.5, 0.38], [-0.5, -0.38]] },
  trapTop: { name: 'Narrow top', pts: [[-0.5, -0.5], [0.5, -0.5], [0.35, 0.5], [-0.35, 0.5]] },
  trapBottom: { name: 'Narrow bottom', pts: [[-0.35, -0.5], [0.35, -0.5], [0.5, 0.5], [-0.5, 0.5]] },
  wedgeR: { name: 'Corner (right)', pts: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.15], [0.15, 0.5], [-0.5, 0.5]] },
  wedgeL: { name: 'Corner (left)', pts: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.15, 0.5], [-0.5, 0.15]] },
  hex: { name: 'Hexagon', pts: [[-0.25, -0.5], [0.25, -0.5], [0.5, 0], [0.25, 0.5], [-0.25, 0.5], [-0.5, 0]] },
  circle: { name: 'Round', pts: Array.from({ length: 32 }, (_, k) => [0.5 * Math.cos(2 * Math.PI * k / 32), 0.5 * Math.sin(2 * Math.PI * k / 32)]) },
};
const VIEWS = {
  'Pilot': [[0, 0, 0], [0, -0.15, 1]],
  'Panel': [[0, -0.10, 0.22], [0, -0.38, 0.75]],
  'Left console': [[0.06, -0.04, 0.02], [-0.33, -0.45, 0.05]],
  'Right console': [[-0.06, -0.04, 0.02], [0.33, -0.45, 0.05]],
  'Footwell': [[0, -0.18, 0.18], [0, -0.75, 0.62]],
  'Canopy': [[0, -0.05, 0.05], [0, 0.15, 0.6]],
};

// ------------------------------------------------------------------------------------------------ state
let jets = {}, jet = null, buildEnabled = true, buildReason = '', eyeU = [0, 1.1, 6.55], builtinSizes = {};
let elements = [], groups = [], hide = [], selected = null, placing = null, dirty = false;
const undoStack = [];
let surfaceMeshes = [], cockpitGroup = null, builtinScreenMeshes = {};
const previews = new Map();     // element id -> THREE.Object3D

// ------------------------------------------------------------------------------------------------ three setup
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9c3dd);
const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 50);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.15; controls.minDistance = 0.03; controls.maxDistance = 4;
controls.rotateSpeed = 0.6; controls.zoomSpeed = 1.2; controls.panSpeed = 0.8; controls.screenSpacePanning = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x50565e, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(0.6, 3, -1.5); scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0xffd23f, depthTest: false }));
selBox.renderOrder = 10; selBox.visible = false; selBox.matrixAutoUpdate = false; scene.add(selBox);
let ghost = null;   // outline following the mouse while placing

function resize() {
  const r = view.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
(function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();

function setView(name) {
  const [c, t] = VIEWS[name];
  const e = fromU(eyeU);
  camera.position.copy(e.clone().add(fromU(c)));
  controls.target.copy(e.clone().add(fromU(t)));
  controls.update();
}

// ------------------------------------------------------------------------------------------------ helpers
function toast(msg, ms = 2800) {
  const t = $('toast'); t.textContent = msg; t.style.display = 'block';
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.style.display = 'none'), ms);
}
function setDirty(d) { dirty = d; $('dirty').textContent = d ? 'unsaved changes' : 'saved'; $('dirty').className = 'pill' + (d ? ' bad' : ''); }
function uid(p) { let i = 1; while (elements.some((e) => e.id === p + i)) i++; return p + i; }
async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
// basis of a thing in three space: normal, up (base up turned by rot about the normal), right = up x normal
function basisOf(e) {
  const n = e.normal.clone().normalize();
  const up = e.baseUp.clone().projectOnPlane(n).normalize().applyAxisAngle(n, THREE.MathUtils.degToRad(-e.rot || 0));
  const right = new THREE.Vector3().crossVectors(up, n).normalize();
  return { n, up, right };
}
function upFor(normal) {   // "up" on a surface: world up projected on it; on near-level surfaces, toward the nose
  const n = normal.clone().normalize();
  let up = new THREE.Vector3(0, 1, 0).projectOnPlane(n);
  if (up.length() < 0.35) {
    up = new THREE.Vector3(0, 0, -1).projectOnPlane(n);   // three space: forward (toward the nose) is -z
    if (n.y < 0) up.negate();
  }
  return up.normalize();
}
function sizeOf(x) { return x.type === 'group' ? [x.size[0] * x.scale, x.size[1] * x.scale] : [x.w, x.h]; }
function nameOf(x) { return x.type === 'group' ? x.label : x.name; }

// convex hull (counter-clockwise) and the outline moved out by d, as the server does
function hull(pts) {
  const P = [...new Map(pts.map((p) => [p[0].toFixed(5) + ',' + p[1].toFixed(5), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return SHAPES.rect.pts;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-12) lo.pop(); lo.push(p); }
  for (const p of [...P].reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 1e-12) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function isConvex(pts) { return hull(pts).length === new Set(pts.map((p) => p[0].toFixed(5) + ',' + p[1].toFixed(5))).size; }
function segsCross(p1, p2, p3, p4) {
  const o = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0) && Math.abs(d1) > 1e-12 && Math.abs(d2) > 1e-12;
}
function selfCrossing(P) {
  const m = P.length;
  for (let i = 0; i < m; i++) for (let j = i + 2; j < m; j++) { if (i === 0 && j === m - 1) continue; if (segsCross(P[i], P[(i + 1) % m], P[j], P[(j + 1) % m])) return true; }
  return false;
}
function signedArea(P) { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
// the outline as drawn (dents allowed), counter-clockwise; one that crosses itself becomes its hull, as the server does
function simpleCcw(pts) {
  const P = [];
  for (const p of pts) { const q = [+p[0].toFixed(5), +p[1].toFixed(5)]; if (!P.length || q[0] !== P[P.length - 1][0] || q[1] !== P[P.length - 1][1]) P.push(q); }
  if (P.length > 1 && P[0][0] === P[P.length - 1][0] && P[0][1] === P[P.length - 1][1]) P.pop();
  if (P.length < 3 || Math.abs(signedArea(P)) < 1e-9 || selfCrossing(P)) return hull(pts);
  return signedArea(P) < 0 ? P.reverse() : P;
}
function offsetPoly(poly, d) {
  const m = poly.length, lines = [];
  for (let i = 0; i < m; i++) {
    const a = poly[i], b = poly[(i + 1) % m]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-12;
    const e = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; lines.push([[a[0] + e[1] * d, a[1] - e[0] * d], e]);
  }
  return poly.map((_, i) => {
    const [p0, e0] = lines[(i - 1 + m) % m], [p1, e1] = lines[i];
    const den = e0[0] * e1[1] - e0[1] * e1[0];
    if (Math.abs(den) < 1e-9) return p1;
    const t = ((p1[0] - p0[0]) * e1[1] - (p1[1] - p0[1]) * e1[0]) / den;
    let q = [p0[0] + e0[0] * t, p0[1] + e0[1] * t];
    const v = poly[i], L = Math.hypot(q[0] - v[0], q[1] - v[1]);
    if (L > 3 * Math.abs(d)) q = [v[0] + (q[0] - v[0]) / L * 3 * Math.abs(d), v[1] + (q[1] - v[1]) / L * 3 * Math.abs(d)];   // sharp corner: no spike
    return q;
  });
}

// ------------------------------------------------------------------------------------------------ undo
function snapshot() {
  return JSON.stringify({ mfd, elements: elements.map(serialise), hide, groups: groups.map((g) => ({ id: g.id, pos: toU(g.pos), normal: toU(g.normal), baseUp: toU(g.baseUp), rot: g.rot, scale: g.scale, hidden: g.hidden })) });
}
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 100) undoStack.shift(); setDirty(true); }
function undo() {
  if (!undoStack.length) return toast('Nothing to undo');
  const s = JSON.parse(undoStack.pop());
  const selId = selected?.id;
  clearElements(); hide = s.hide; if (s.mfd) mfd = s.mfd;
  s.elements.forEach((e) => addElement(deserialise(e), false));
  for (const gs of s.groups) { const g = groups.find((x) => x.id === gs.id); if (g) { Object.assign(g, { pos: fromU(gs.pos), normal: fromU(gs.normal), baseUp: fromU(gs.baseUp), rot: gs.rot, scale: gs.scale, hidden: gs.hidden }); applyGroup(g); } }
  selected = elements.find((e) => e.id === selId) || groups.find((g) => g.id === selId) || null;
  renderAll(); updateBuiltinTint(); renderPagesTab(); setDirty(true);
}

// ------------------------------------------------------------------------------------------------ drawing decals and screens
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
const imgCache = new Map();
function loadImg(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  imgCache.set(src, p); return p;
}
async function drawDecal(e) {
  const long = 1024, a = e.w / e.h;
  const cv = document.createElement('canvas');
  cv.width = Math.max(8, Math.round(a >= 1 ? long : long * a)); cv.height = Math.max(8, Math.round(a >= 1 ? long / a : long));
  const g = cv.getContext('2d'); const s = e.style; const m = Math.min(cv.width, cv.height);
  const rad = (s.radius || 0) / 100 * m * 2;
  if (s.bgOn) { g.fillStyle = s.bg; roundRect(g, 0, 0, cv.width, cv.height, rad); g.fill(); }
  let inset = 0;
  if (s.stripes) {
    const t = m * 0.16; inset = t;
    g.save(); roundRect(g, 0, 0, cv.width, cv.height, rad); g.clip();
    if (!s.bgOn) { g.fillStyle = '#f2c230'; g.fillRect(0, 0, cv.width, cv.height); }
    g.fillStyle = '#111111'; const step = t * 1.4;
    for (let x = -cv.height; x < cv.width + cv.height; x += step * 2) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + step, 0); g.lineTo(x + step - cv.height, cv.height); g.lineTo(x - cv.height, cv.height); g.closePath(); g.fill();
    }
    g.fillStyle = s.bgOn ? s.bg : '#f2c230'; g.fillRect(t, t, cv.width - 2 * t, cv.height - 2 * t);
    g.restore();
  }
  if (s.border) {
    const bw = m * 0.07; g.lineWidth = bw; g.strokeStyle = s.borderColor;
    roundRect(g, bw / 2 + inset, bw / 2 + inset, cv.width - bw - 2 * inset, cv.height - bw - 2 * inset, Math.max(0, rad - bw / 2)); g.stroke();
    inset += bw;
  }
  const pad = m * 0.08 + inset;
  const bx = pad, by = pad, bw2 = cv.width - 2 * pad, bh = cv.height - 2 * pad;
  if (s.image) {
    const im = await loadImg(s.image);
    if (im) { const k = Math.min(bw2 / im.width, bh / im.height); const iw = im.width * k, ih = im.height * k; g.drawImage(im, bx + (bw2 - iw) / 2, by + (bh - ih) / 2, iw, ih); }
  }
  const lines = (s.text || '').split('\n');
  if (lines.some((l) => l.trim())) {
    const fam = `"${s.font}", Arial, sans-serif`, wt = s.bold === false ? '' : 'bold ';
    g.font = `${wt}100px ${fam}`;
    let size = bh / (lines.length * 1.12);
    for (const l of lines) { const mw = g.measureText(l).width; if (mw > 0) size = Math.min(size, 100 * bw2 / mw); }
    g.font = `${wt}${size}px ${fam}`;
    g.fillStyle = s.color; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lh = size * 1.12, y0 = cv.height / 2 - (lines.length - 1) * lh / 2;
    lines.forEach((l, i) => g.fillText(l, cv.width / 2, y0 + i * lh));
  }
  return cv;
}
function drawScreen(e) {
  if (e.page && e.page.startsWith('c_')) {   // one of your pages: drawn as the game will
    const pg = mfd.pages.find((x) => 'c_' + x.id === e.page);
    if (pg) { const [w, h] = pagePx(null, e); const c = new Canvas(w, h); drawPage(c, sampleState(12), pg); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; c.draw(cv.getContext('2d')); return cv; }
  }
  const long = 512, a = e.w / e.h;
  const cv = document.createElement('canvas');
  cv.width = Math.round(a >= 1 ? long : long * a); cv.height = Math.round(a >= 1 ? long / a : long);
  const g = cv.getContext('2d');
  g.fillStyle = '#050807'; g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = '#1f6a3a'; g.lineWidth = 1;
  for (let x = 0; x < cv.width; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, cv.height); g.stroke(); }
  for (let y = 0; y < cv.height; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(cv.width, y); g.stroke(); }
  g.fillStyle = '#46e65a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const label = e.page.toUpperCase(), fs = Math.min(cv.width / (label.length * 0.75), cv.height / 3);
  g.font = `bold ${fs}px Consolas, monospace`; g.fillText(label, cv.width / 2, cv.height / 2);
  g.font = `${Math.max(12, Math.min(cv.width, cv.height) / 14)}px Segoe UI, sans-serif`; g.fillStyle = '#8fdc9c';
  g.fillText(`${(e.w * 100).toFixed(1)} x ${(e.h * 100).toFixed(1)} cm`, cv.width / 2, cv.height / 2 + fs * 0.75);
  return cv;
}
function disposeObj(o) { o.traverse((x) => { x.geometry?.dispose(); if (x.material) { x.material.map?.dispose(); x.material.dispose(); } }); }

async function buildPreview(e) {
  const old = previews.get(e.id);
  if (old) { scene.remove(old); disposeObj(old); }
  const { n, up, right } = basisOf(e);
  const grp = new THREE.Group();
  grp.matrixAutoUpdate = false;
  if (e.type === 'decal') {
    e.canvas = await drawDecal(e);
    const tex = new THREE.CanvasTexture(e.canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(e.w, e.h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.43, side: THREE.DoubleSide, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
    mesh.position.set(0, 0, e.offset ?? 0.0015);
    grp.add(mesh);
  } else {
    const shape = simpleCcw(e.shape || SHAPES.rect.pts);
    const inner = shape.map(([x, y]) => [x * e.w, y * e.h]);
    const b = e.bezel ?? 0.008, d = Math.max(e.depth ?? 0.008, 0.001);
    const outer = offsetPoly(inner, b);
    const bz = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
    const bez = new THREE.Mesh(new THREE.ExtrudeGeometry(bz, { depth: d + 0.002, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: e.bezelColor === 'grey' ? 0x3b3f45 : 0x0e0f11, roughness: 0.7 }));
    bez.position.z = -0.002;
    const sg = new THREE.ShapeGeometry(new THREE.Shape(inner.map(([x, y]) => new THREE.Vector2(x, y))));
    const pa = sg.attributes.position, uv = new Float32Array(pa.count * 2);
    for (let i = 0; i < pa.count; i++) { uv[i * 2] = pa.getX(i) / e.w + 0.5; uv[i * 2 + 1] = pa.getY(i) / e.h + 0.5; }
    sg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const tex = new THREE.CanvasTexture(drawScreen(e)); tex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: tex }));
    scr.position.z = d + 0.0006;
    grp.add(bez, scr);
  }
  grp.matrix.makeBasis(right, up, n).setPosition(e.pos);
  grp.traverse((o) => (o.userData.id = e.id));
  scene.add(grp); previews.set(e.id, grp);
  if (selected === e) placeSelBox();
}

// ------------------------------------------------------------------------------------------------ cockpit groups
// matrix taking a group from where the build script put it (frame c0, n0, u0) to where it is now: T(pos) B1 S B0^T T(-c0)
function groupMatrix(g) {
  const r0 = new THREE.Vector3().crossVectors(g.u0, g.n0).normalize();
  const B0 = new THREE.Matrix4().makeBasis(r0, g.u0, g.n0);
  const { n, up, right } = basisOf(g);
  const B1 = new THREE.Matrix4().makeBasis(right, up, n);
  return new THREE.Matrix4().makeTranslation(g.pos.x, g.pos.y, g.pos.z)
    .multiply(B1).multiply(new THREE.Matrix4().makeScale(g.scale, g.scale, g.scale))
    .multiply(B0.clone().transpose()).multiply(new THREE.Matrix4().makeTranslation(-g.c0.x, -g.c0.y, -g.c0.z));
}
function applyGroup(g) {
  g.obj.matrix.copy(groupMatrix(g));
  g.obj.matrixWorldNeedsUpdate = true;
  g.obj.visible = !g.hidden;
  if (selected === g) placeSelBox();
}
function groupChanged(g) {
  const { up } = basisOf(g);
  return g.hidden || Math.abs(g.scale - 1) > 1e-4 || g.pos.distanceTo(g.c0) > 1e-5 || g.normal.angleTo(g.n0) > 1e-4 || up.angleTo(g.u0) > 1e-4;
}
function resetGroup(g) {
  pushUndo();
  Object.assign(g, { pos: g.c0.clone(), normal: g.n0.clone(), baseUp: g.u0.clone(), rot: 0, scale: 1, hidden: false });
  applyGroup(g); changed(g, false); renderProps(); renderGroups();
}

function placeSelBox() {
  const x = selected;
  if (!x || (x.type === 'group' && x.hidden)) { selBox.visible = false; return; }
  const { n, up, right } = basisOf(x);
  const [w, h] = sizeOf(x);
  const pad = x.type === 'screen' ? (x.bezel ?? 0.008) + 0.004 : 0.004;
  const lift = x.type === 'screen' ? (x.depth ?? 0.008) + 0.002 : x.type === 'group' ? 0.004 : (x.offset ?? 0.0015) + 0.001;
  selBox.matrix.makeBasis(right.clone().multiplyScalar(w + 2 * pad), up.clone().multiplyScalar(h + 2 * pad), n).setPosition(x.pos.clone().addScaledVector(n, lift));
  selBox.visible = true;
}

// ------------------------------------------------------------------------------------------------ elements
function serialise(e) {
  const { n, up, right } = basisOf(e);
  const base = { id: e.id, name: e.name, pos: toU(e.pos), normal: toU(n), baseUp: toU(e.baseUp), up: toU(up), right: toU(right), rot: e.rot || 0, w: +e.w.toFixed(4), h: +e.h.toFixed(4) };
  if (e.type === 'decal') return { ...base, type: 'decal', offset: e.offset ?? 0.0015, style: e.style };
  return { ...base, type: 'screen', page: e.page, shape: e.shape || SHAPES.rect.pts, bezel: e.bezel ?? 0.008, depth: e.depth ?? 0.008, bezelColor: e.bezelColor || 'black' };
}
function deserialise(s) {
  const e = { ...s, pos: fromU(s.pos), normal: fromU(s.normal), baseUp: fromU(s.baseUp || s.up) };
  delete e.up; delete e.right;
  e.type = s.type || (s.page ? 'screen' : 'decal');
  return e;
}
function addElement(e, undoable = true) {
  if (undoable) pushUndo();
  elements.push(e); buildPreview(e); renderList();
  return e;
}
function clearElements() { for (const e of [...elements]) removePreview(e); elements = []; }
function removePreview(e) { const p = previews.get(e.id); if (p) { scene.remove(p); disposeObj(p); } previews.delete(e.id); }
function deleteSelected() {
  if (!selected) return;
  if (selected.type === 'group') return toggleHide(selected);
  pushUndo(); removePreview(selected); elements = elements.filter((e) => e !== selected); select(null); renderList();
}
function duplicateSelected() {
  if (!selected || selected.type === 'group') return toast(selected ? 'Instruments cannot be copied (the game drives each one): add a screen or decal instead.' : 'Select something first');
  const e = deserialise(JSON.parse(JSON.stringify(serialise(selected))));
  e.id = uid(e.type === 'decal' ? 'd' : 's'); e.name = selected.name + ' copy';
  const { right } = basisOf(selected); e.pos = selected.pos.clone().addScaledVector(right, selected.w + 0.01);
  addElement(e); select(e);
}
function toggleHide(g) { pushUndo(); g.hidden = !g.hidden; applyGroup(g); changed(g, false); renderProps(); renderGroups(); }
function changed(x, rebuild = true) {
  setDirty(true);
  if (x.type === 'group') { applyGroup(x); renderGroupMarks(); }
  else if (rebuild) buildPreview(x); else placeSelBox();
  renderListNames();
}
function select(x) { selected = x; renderAll(); }
function renderAll() { renderList(); renderGroups(); renderProps(); placeSelBox(); }

function renderList() {
  const L = $('list'); L.innerHTML = '';
  $('emptyHint').style.display = elements.length ? 'none' : 'block';
  for (const e of elements) {
    const d = document.createElement('div'); d.className = 'item' + (e === selected ? ' sel' : '');
    d.innerHTML = `<span class="kind ${e.type}">${e.type === 'decal' ? 'DECAL' : 'SCREEN'}</span><span class="nm"></span>`;
    d.querySelector('.nm').textContent = e.name;
    d.onclick = () => { select(e); focusOn(e); };
    L.appendChild(d);
  }
}
function renderListNames() { [...$('list').children].forEach((d, i) => { const e = elements[i]; if (e) d.querySelector('.nm').textContent = e.name; }); }
function renderGroups() {
  const G = $('groups'); G.innerHTML = '';
  if (!groups.length) { G.innerHTML = '<p class="hint">This cockpit has no movable groups yet (press Reload cockpit from mod in the Log once Claude has added them).</p>'; return; }
  for (const kind of KIND_ORDER) {
    const list = groups.filter((g) => (KIND_NAMES[g.kind] || 'Instruments') === kind);
    if (!list.length) continue;
    const h = document.createElement('div'); h.className = 'grouphead'; h.textContent = kind; G.appendChild(h);
    for (const g of list) {
      const d = document.createElement('div'); d.className = 'item' + (g === selected ? ' sel' : '') + (g.hidden ? ' off' : '');
      d.dataset.gid = g.id;
      d.innerHTML = `<span class="nm"></span><span class="tag"></span><button class="eye" title="Hide / show (H)">${g.hidden ? '&#9711;' : '&#9673;'}</button>`;
      d.querySelector('.nm').textContent = g.label;
      d.querySelector('.tag').textContent = groupChanged(g) ? '•' : '';
      d.querySelector('.eye').onclick = (ev) => { ev.stopPropagation(); toggleHide(g); };
      d.onclick = () => { select(g); focusOn(g); };
      G.appendChild(d);
    }
  }
}
function renderGroupMarks() { for (const d of $('groups').querySelectorAll('.item')) { const g = groups.find((x) => x.id === d.dataset.gid); if (g) d.querySelector('.tag').textContent = groupChanged(g) ? '•' : ''; } }
function focusOn(x) {
  const { n } = basisOf(x);
  const [w, h] = sizeOf(x);
  const dist = Math.max(0.25, Math.max(w, h) * 2.2);
  const eye = fromU(eyeU);
  let from = x.pos.clone().addScaledVector(n, dist);
  if (from.distanceTo(eye) > 0.9) from = x.pos.clone().lerp(eye, 0.6);
  camera.position.copy(from); controls.target.copy(x.pos); controls.update();
}

// ------------------------------------------------------------------------------------------------ properties panel
function field(label, html, unit = '') { return `<div class="row"><label>${label}</label>${html}${unit ? `<span class="unit">${unit}</span>` : ''}</div>`; }
const NUDGE = `<div class="hint" style="text-align:center;margin-top:10px">Nudge (Shift = 1 cm)</div><div class="nudge">
    <span></span><button data-n="0,1">&uarr;</button><span></span>
    <button data-n="-1,0">&larr;</button><button data-n="snap" title="Stick back onto the surface behind it">&#9678;</button><button data-n="1,0">&rarr;</button>
    <span></span><button data-n="0,-1">&darr;</button><span></span></div>`;

function renderProps() {
  const P = $('props'); const x = selected;
  if (!x) {
    P.innerHTML = `<h2>Properties</h2><p class="hint">Click something in the cockpit, or pick it in the Layout or My items tab, to edit it.</p>
      <p class="hint">New here? Press <b>Help</b> at the top right.</p>`;
    return;
  }
  if (x.type === 'group') return renderGroupProps(P, x);
  const e = x;
  let h = `<h2>${e.type === 'decal' ? 'Decal' : 'Screen'}</h2>` + field('Name', `<input type="text" id="p_name">`);
  if (e.type === 'decal') {
    const s = e.style;
    h += field('Text', `<textarea id="p_text" placeholder="Enter for a new line"></textarea>`);
    h += field('Font', `<select id="p_font">${FONTS.map((f) => `<option${f === s.font ? ' selected' : ''}>${f}</option>`).join('')}</select>`);
    h += `<div class="row"><label>Text colour</label><input type="color" id="p_color"><label style="width:auto;margin-left:6px"><input type="checkbox" id="p_bold"> bold</label></div>`;
    h += `<div class="row"><label>Background</label><input type="checkbox" id="p_bgOn"><input type="color" id="p_bg"><span class="hint" style="margin:0">off = letters only</span></div>`;
    h += `<div class="row"><label>Border</label><input type="checkbox" id="p_border"><input type="color" id="p_borderColor"></div>`;
    h += `<div class="row"><label>Hazard stripes</label><input type="checkbox" id="p_stripes"></div>`;
    h += field('Corner round', `<input type="range" id="p_radius" min="0" max="25" step="1">`);
    h += `<div class="row"><label>Picture</label><button id="p_img">${s.image ? 'Replace' : 'Add'}&hellip;</button>${s.image ? '<button id="p_imgx" class="danger">Remove</button>' : ''}</div>`;
  } else {
    h += field('Shows', `<select id="p_page">${pageOptions(e.page)}</select>`) + `<div class="row"><button id="p_editPage" style="width:100%">Design a page for this screen&hellip;</button></div>`;
    h += '<h2>Outline</h2>';
    h += `<div class="shapes">${Object.entries(SHAPES).map(([k, v]) => `<button data-shape="${k}" title="${v.name}">${v.name}</button>`).join('')}</div>`;
    h += `<canvas id="shapePreview" class="shapePreview" title="Click to edit the outline"></canvas>
      <div class="row" style="margin-top:6px"><button id="p_outline" class="primary" style="width:100%">Edit outline&hellip;</button></div>
      <p class="hint">A big editor with a grid, snapping, typed-in corner positions, mirror editing and as many corners as you like (dents allowed).</p>`;
    h += field('Bezel', `<input type="number" id="p_bezel" step="1" min="0" max="40">`, 'mm');
    h += field('Stands out', `<input type="number" id="p_depth" step="1" min="0" max="40">`, 'mm');
    h += field('Bezel colour', `<select id="p_bezelColor"><option value="black">Black</option><option value="grey">Dark grey</option></select>`);
  }
  h += '<h2>Size and position</h2>';
  h += field('Width', `<input type="number" id="p_w" step="0.5" min="0.5">`, 'cm') + field('Height', `<input type="number" id="p_h" step="0.5" min="0.5">`, 'cm');
  h += `<div class="row"><label>Keep shape</label><input type="checkbox" id="p_lock"${e.type === 'decal' ? ' checked' : ''}><span class="hint" style="margin:0">width and height change together</span></div>`;
  if (e.type === 'decal') h += `<div class="row"><button id="p_fit" style="width:100%">Fit height to the text</button></div>`;
  else h += `<div class="row"><button id="p_default" style="width:100%">Default size for this page</button></div>`;
  h += field('Rotation', `<input type="number" id="p_rot" step="1">`, '&deg;');
  h += NUDGE;
  h += `<div class="grid3"><button id="p_move" title="Click a new spot (M)">Move</button><button id="p_dup" title="Ctrl+D">Duplicate</button><button id="p_del" class="danger" title="Del">Delete</button></div>`;
  P.innerHTML = h;

  bindCommon(P, e);
  const bind = binder(e);
  bind('p_name', (el) => (el.value = e.name), (el) => (e.name = el.value), false);
  if (e.type === 'decal') {
    const s = e.style;
    bind('p_text', (el) => (el.value = s.text || ''), (el) => (s.text = el.value));
    bind('p_font', (el) => (el.value = s.font), (el) => (s.font = el.value), true, 'change');
    bind('p_color', (el) => (el.value = s.color), (el) => (s.color = el.value));
    bind('p_bold', (el) => (el.checked = s.bold !== false), (el) => (s.bold = el.checked), true, 'change');
    bind('p_bgOn', (el) => (el.checked = !!s.bgOn), (el) => (s.bgOn = el.checked), true, 'change');
    bind('p_bg', (el) => (el.value = s.bg), (el) => (s.bg = el.value));
    bind('p_border', (el) => (el.checked = !!s.border), (el) => (s.border = el.checked), true, 'change');
    bind('p_borderColor', (el) => (el.value = s.borderColor), (el) => (s.borderColor = el.value));
    bind('p_stripes', (el) => (el.checked = !!s.stripes), (el) => (s.stripes = el.checked), true, 'change');
    bind('p_radius', (el) => (el.value = s.radius || 0), (el) => (s.radius = +el.value));
    $('p_img').onclick = () => pickImage((url) => { pushUndo(); s.image = url; changed(e); renderProps(); });
    if ($('p_imgx')) $('p_imgx').onclick = () => { pushUndo(); s.image = null; changed(e); renderProps(); };
    $('p_fit').onclick = () => { pushUndo(); fitHeight(e); changed(e); renderProps(); };
  } else {
    fillPageNames($('p_page'));
    bind('p_page', (el) => (el.value = e.page), (el) => { e.page = el.value; renderPagesTab(); }, true, 'change');
    $('p_editPage').onclick = () => {
      let pg = e.page.startsWith('c_') ? mfd.pages.find((x) => 'c_' + x.id === e.page) : null;
      if (!pg) { pushUndo(); pg = { id: newPageId(), name: e.name + ' page', bg: '#06080a', rate: 10, widgets: PAGE_TEMPLATES.flight() }; mfd.pages.push(pg); e.page = 'c_' + pg.id; renderPagesTab(); }
      designer.open(pg);
    };
    bind('p_bezel', (el) => (el.value = Math.round((e.bezel ?? 0.008) * 1000)), (el) => (e.bezel = Math.max(0, +el.value) / 1000));
    bind('p_depth', (el) => (el.value = Math.round((e.depth ?? 0.008) * 1000)), (el) => (e.depth = Math.max(0, +el.value) / 1000));
    bind('p_bezelColor', (el) => (el.value = e.bezelColor || 'black'), (el) => (e.bezelColor = el.value), true, 'change');
    P.querySelectorAll('[data-shape]').forEach((b) => (b.onclick = () => { pushUndo(); e.shape = SHAPES[b.dataset.shape].pts.map((p) => [...p]); changed(e); shapeEditor(e); }));
    $('p_outline').onclick = () => outlineEditor.open(e);
    $('shapePreview').onclick = () => outlineEditor.open(e);
    $('p_default').onclick = () => {
      const b = builtinSizes[e.page];
      if (!b) return toast(e.page === 'tac' ? 'The tactical display has no built-in size here: set it by hand (it is 2.1 : 1).' : 'No built-in screen for this page on this jet.');
      pushUndo(); e.w = b.w; e.h = b.h; changed(e); renderProps();
    };
    shapeEditor(e);
  }
  const W = $('p_w'), Hh = $('p_h'), lock = $('p_lock');
  W.value = (e.w * 100).toFixed(1); Hh.value = (e.h * 100).toFixed(1);
  let pushedSize = false;
  const size = (which) => {
    if (!pushedSize) { pushUndo(); pushedSize = true; }
    const nw = Math.max(0.005, +W.value / 100), nh = Math.max(0.005, +Hh.value / 100);
    if (lock.checked) { const a = e.w / e.h; if (which === 'w') { e.w = nw; e.h = nw / a; Hh.value = (e.h * 100).toFixed(1); } else { e.h = nh; e.w = nh * a; W.value = (e.w * 100).toFixed(1); } }
    else { e.w = nw; e.h = nh; }
    changed(e); if (e.type === 'screen') shapeEditor(e);
  };
  W.addEventListener('input', () => size('w')); Hh.addEventListener('input', () => size('h'));
  W.addEventListener('focus', () => (pushedSize = false)); Hh.addEventListener('focus', () => (pushedSize = false));
  $('p_dup').onclick = duplicateSelected;
  $('p_del').onclick = deleteSelected;
}
function renderGroupProps(P, g) {
  const parts = g.parts.length ? `<p class="hint">Moves with it: ${g.parts.length} working part${g.parts.length > 1 ? 's' : ''} (needles, lights or screen).</p>` : '';
  P.innerHTML = `<h2>${(KIND_NAMES[g.kind] || 'Instrument').replace(/s$/, '')}</h2>
    <div style="font-size:15px;font-weight:600;margin-bottom:4px"></div>${parts}
    <div class="row"><label>Hidden</label><input type="checkbox" id="g_hidden"><span class="hint" style="margin:0">gone from the cockpit (H)</span></div>
    <h2>Size and position</h2>
    ${field('Size', `<input type="range" id="g_scale_r" min="25" max="250" step="1"><input type="number" id="g_scale" min="10" max="400" step="1" style="width:64px">`, '%')}
    ${field('Rotation', `<input type="number" id="p_rot" step="1">`, '&deg;')}
    ${NUDGE}
    <div class="grid2"><button id="p_move" class="primary" title="Click a new spot (M)">Move</button><button id="g_reset" title="Back where it was built">Reset</button></div>
    <p class="hint" style="margin-top:12px">Move puts it flat on any surface you click (the panel, a console, the side wall). Its needles, lights and screens keep working.</p>`;
  P.querySelector('div[style]').textContent = g.label;
  bindCommon(P, g);
  const hid = $('g_hidden'); hid.checked = g.hidden; hid.onchange = () => toggleHide(g);
  const sr = $('g_scale_r'), sn = $('g_scale');
  sr.value = sn.value = Math.round(g.scale * 100);
  let pushed = false;
  const setScale = (v) => { if (!pushed) { pushUndo(); pushed = true; } g.scale = Math.max(0.1, v / 100); sr.value = sn.value = Math.round(g.scale * 100); changed(g); };
  sr.addEventListener('input', () => setScale(+sr.value)); sn.addEventListener('input', () => setScale(+sn.value));
  sr.addEventListener('pointerdown', () => (pushed = false)); sn.addEventListener('focus', () => (pushed = false));
  $('g_reset').onclick = () => resetGroup(g);
}
function binder(x) {
  return (id, get, set, rebuild = true, ev = 'input') => {
    const el = $(id); if (!el) return;
    get(el);
    let pushed = false;
    el.addEventListener('focus', () => (pushed = false));
    el.addEventListener(ev, () => { if (!pushed) { pushUndo(); pushed = true; } set(el); changed(x, rebuild); });
  };
}
function bindCommon(P, x) {
  binder(x)('p_rot', (el) => (el.value = x.rot || 0), (el) => (x.rot = +el.value));
  P.querySelectorAll('.nudge button').forEach((b) => (b.onclick = (ev) => {
    if (b.dataset.n === 'snap') return snapToSurface(x);
    const [dx, dy] = b.dataset.n.split(',').map(Number); nudge(x, dx, dy, ev.shiftKey ? 0.01 : 0.001);
  }));
  $('p_move').onclick = () => startPlacing({ move: x });
}

// the outline preview in the properties panel (click it to open the outline editor)
function shapeEditor(e) {
  const cv = $('shapePreview'); if (!cv) return;
  const dpr = devicePixelRatio || 1;
  cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
  const g = cv.getContext('2d'), M = 14 * dpr, a = e.w / e.h;
  let bw = cv.width - 2 * M, bh = bw / a;
  if (bh > cv.height - 2 * M) { bh = cv.height - 2 * M; bw = bh * a; }
  const ox = (cv.width - bw) / 2, oy = (cv.height - bh) / 2;
  const P = simpleCcw(e.shape || SHAPES.rect.pts).map(([x, y]) => [ox + (x + 0.5) * bw, oy + (0.5 - y) * bh]);
  g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#123f24'; g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
  g.strokeStyle = '#46e65a'; g.lineWidth = 2 * dpr; g.stroke();
  g.fillStyle = '#9aa3ad'; g.font = `${11 * dpr}px Segoe UI`; g.fillText(`${(e.shape || []).length} corners · ${(e.w * 100).toFixed(1)} × ${(e.h * 100).toFixed(1)} cm · click to edit`, 6 * dpr, cv.height - 6 * dpr);
}

// The outline editor: a big canvas in millimetres with a grid, snapping, typed-in corner positions, mirror editing and any
// number of corners. Works on a copy; Done puts it back on the screen (the screen's box is fitted round the new outline).
const outlineEditor = (() => {
  const cv = $('olCanvas');
  let e = null, pts = [], sel = -1, view = { s: 2, x: 0, y: 0 }, stack = [], drag = null, pan = null;
  const W = () => e.w * 1000, H = () => e.h * 1000;                    // the screen's box in mm
  const toMM = ([x, y]) => [x * W(), y * H()];
  const grid = () => +$('olGrid').value;
  const snap = (v) => ($('olSnap').checked && grid() ? Math.round(v / grid()) * grid() : v);
  const px = ([x, y]) => [cv.width / 2 + (x - view.x) * view.s, cv.height / 2 - (y - view.y) * view.s];
  const mm = (X, Y) => [(X - cv.width / 2) / view.s + view.x, -(Y - cv.height / 2) / view.s + view.y];
  const save = () => { stack.push(JSON.stringify({ pts, sel })); if (stack.length > 200) stack.shift(); };
  function fit() {
    const xs = pts.map((p) => p[0]).concat([-W() / 2, W() / 2]), ys = pts.map((p) => p[1]).concat([-H() / 2, H() / 2]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    view.x = (x0 + x1) / 2; view.y = (y0 + y1) / 2;
    view.s = Math.min(cv.width / ((x1 - x0) * 1.25 || 1), cv.height / ((y1 - y0) * 1.25 || 1));
  }
  function mirrorOf(i) {   // the corner on the other side (x mirrored), if there is one within 1.5 mm
    const [x, y] = pts[i]; if (Math.abs(x) < 0.25) return -1;
    let best = -1, bd = 1.5;
    pts.forEach((p, j) => { if (j !== i) { const d = Math.hypot(p[0] + x, p[1] - y); if (d < bd) { bd = d; best = j; } } });
    return best;
  }
  function moveTo(i, x, y) {
    const m = $('olMirror').checked ? mirrorOf(i) : -1;
    if ($('olMirror').checked && Math.abs(pts[i][0]) < 0.25) x = 0;   // on the centre line it stays there
    pts[i] = [x, y];
    if (m >= 0) pts[m] = [-x, y];
  }
  function draw() {
    if (!e) return;
    const g = cv.getContext('2d'), dpr = devicePixelRatio || 1;
    g.clearRect(0, 0, cv.width, cv.height);
    const gs = grid();
    if (gs) {   // grid: fine lines, every 10th stronger
      const [x0, y1] = mm(0, 0), [x1, y0] = mm(cv.width, cv.height);
      let step = gs; while (step * view.s < 6 * dpr) step *= 2;
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
        const X = px([x, 0])[0]; g.strokeStyle = Math.abs(x % (step * 10)) < 1e-6 ? '#26303a' : '#161c22'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(X, 0); g.lineTo(X, cv.height); g.stroke();
      }
      for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
        const Y = px([0, y])[1]; g.strokeStyle = Math.abs(y % (step * 10)) < 1e-6 ? '#26303a' : '#161c22';
        g.beginPath(); g.moveTo(0, Y); g.lineTo(cv.width, Y); g.stroke();
      }
    }
    g.strokeStyle = '#3a4550'; g.lineWidth = 1;   // centre lines
    let [cx, cy] = px([0, 0]); g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, cv.height); g.moveTo(0, cy); g.lineTo(cv.width, cy); g.stroke();
    // the screen's current box
    const [bx0, by0] = px([-W() / 2, H() / 2]), [bx1, by1] = px([W() / 2, -H() / 2]);
    g.setLineDash([5 * dpr, 5 * dpr]); g.strokeStyle = '#4b5662'; g.strokeRect(bx0, by0, bx1 - bx0, by1 - by0); g.setLineDash([]);
    const bad = pts.length >= 3 && selfCrossing(pts);
    g.fillStyle = bad ? '#5a1a16aa' : '#123f24cc';
    g.beginPath(); pts.forEach((p, i) => { const [X, Y] = px(p); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); g.fill();
    g.strokeStyle = bad ? '#ff6b5b' : '#46e65a'; g.lineWidth = 2 * dpr; g.stroke();
    pts.forEach((p, i) => {
      const [X, Y] = px(p);
      g.fillStyle = i === sel ? '#e8b931' : '#e4e7eb'; g.beginPath(); g.arc(X, Y, (i === sel ? 7 : 5) * dpr, 0, Math.PI * 2); g.fill();
      if (i === sel) { g.strokeStyle = '#111'; g.lineWidth = 2 * dpr; g.stroke(); }
    });
    // size labels
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    g.fillStyle = '#9aa3ad'; g.font = `${12 * dpr}px Segoe UI`;
    g.fillText(`outline ${(Math.max(...xs) - Math.min(...xs)).toFixed(1)} × ${(Math.max(...ys) - Math.min(...ys)).toFixed(1)} mm`, 10 * dpr, cv.height - 10 * dpr);
    $('olInfo').textContent = `${pts.length} corners` + (bad ? ' · the outline crosses itself: move a corner so the edges no longer cross' : '');
    $('olDone').disabled = bad;
    const has = sel >= 0;
    $('olX').disabled = $('olY').disabled = $('olDel').disabled = !has;
    if (has && document.activeElement !== $('olX')) $('olX').value = pts[sel][0].toFixed(1);
    if (has && document.activeElement !== $('olY')) $('olY').value = pts[sel][1].toFixed(1);
    if (!has) { $('olX').value = ''; $('olY').value = ''; }
  }
  function resize() { const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  function nearest(X, Y, rad) { let bi = -1, bd = rad; pts.forEach((p, i) => { const [a, b] = px(p); const d = Math.hypot(a - X, b - Y); if (d < bd) { bd = d; bi = i; } }); return bi; }
  function nearestEdge(X, Y, rad) {
    let bi = -1, bd = rad, at = null;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = px(pts[i]), [x1, y1] = px(pts[(i + 1) % pts.length]);
      const L2 = (x1 - x0) ** 2 + (y1 - y0) ** 2 || 1, t = Math.max(0, Math.min(1, ((X - x0) * (x1 - x0) + (Y - y0) * (y1 - y0)) / L2));
      const d = Math.hypot(X - (x0 + t * (x1 - x0)), Y - (y0 + t * (y1 - y0)));
      if (d < bd) { bd = d; bi = i; at = t; }
    }
    return [bi, at];
  }
  const at = (ev) => { const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1; return [(ev.clientX - r.left) * dpr, (ev.clientY - r.top) * dpr]; };
  cv.addEventListener('pointerdown', (ev) => {
    cv.focus();
    const [X, Y] = at(ev), dpr = devicePixelRatio || 1;
    if (ev.button === 2 || ev.button === 1) { pan = { X, Y, vx: view.x, vy: view.y }; cv.setPointerCapture(ev.pointerId); return; }
    const i = nearest(X, Y, 12 * dpr);
    sel = i;
    if (i >= 0) { save(); drag = { i }; cv.setPointerCapture(ev.pointerId); }
    draw();
  });
  cv.addEventListener('pointermove', (ev) => {
    const [X, Y] = at(ev);
    if (pan) { view.x = pan.vx - (X - pan.X) / view.s; view.y = pan.vy + (Y - pan.Y) / view.s; draw(); return; }
    if (!drag) return;
    const [x, y] = mm(X, Y); moveTo(drag.i, snap(x), snap(y)); draw();
  });
  cv.addEventListener('pointerup', () => { drag = null; pan = null; });
  cv.addEventListener('contextmenu', (ev) => ev.preventDefault());
  cv.addEventListener('dblclick', (ev) => {
    const [X, Y] = at(ev), dpr = devicePixelRatio || 1;
    if (nearest(X, Y, 10 * dpr) >= 0) return;
    const [i] = nearestEdge(X, Y, 16 * dpr); if (i < 0) return;
    save(); const [x, y] = mm(X, Y); pts.splice(i + 1, 0, [snap(x), snap(y)]); sel = i + 1; draw();
  });
  cv.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const [X, Y] = at(ev), before = mm(X, Y);
    view.s = Math.min(200, Math.max(0.3, view.s * (ev.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const after = mm(X, Y); view.x += before[0] - after[0]; view.y += before[1] - after[1]; draw();
  }, { passive: false });
  cv.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey && ev.key.toLowerCase() === 'z') { ev.preventDefault(); undo(); return; }
    if (ev.key === 'Escape') { ev.stopPropagation(); close(false); return; }
    if (ev.key === 'Enter') { ev.stopPropagation(); close(true); return; }
    if ((ev.key === 'a' || ev.key === 'A')) { addAfter(); return; }
    if (sel < 0) return;
    const st = ev.ctrlKey ? 0.1 : ev.shiftKey ? 5 : 0.5;
    const d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] }[ev.key];
    if (d) { ev.preventDefault(); save(); moveTo(sel, pts[sel][0] + d[0], pts[sel][1] + d[1]); draw(); }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); del(); }
  });
  function undo() { if (!stack.length) return; const s = JSON.parse(stack.pop()); pts = s.pts; sel = s.sel; draw(); }
  function addAfter() {
    if (pts.length < 2) return;
    const i = sel >= 0 ? sel : pts.length - 1, j = (i + 1) % pts.length;
    save(); pts.splice(i + 1, 0, [(pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2]); sel = i + 1; draw();
  }
  function del() { if (sel < 0) return; if (pts.length <= 3) return toast('A screen needs at least 3 corners'); save(); pts.splice(sel, 1); sel = Math.min(sel, pts.length - 1); draw(); }
  function setXY() {
    if (sel < 0) return;
    const x = parseFloat($('olX').value), y = parseFloat($('olY').value);
    if (!isFinite(x) || !isFinite(y)) return;
    save(); moveTo(sel, x, y); draw();
  }
  $('olX').addEventListener('change', setXY); $('olY').addEventListener('change', setXY);
  $('olAdd').onclick = addAfter; $('olDel').onclick = del; $('olUndo').onclick = undo;
  $('olGrid').onchange = draw;
  $('olFit').onclick = () => { fit(); draw(); };
  $('olSub').onclick = () => { save(); const n = []; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; n.push(p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]); }); pts = n; sel = -1; draw(); };
  $('olFlipH').onclick = () => { save(); pts = pts.map(([x, y]) => [-x, y]).reverse(); sel = -1; draw(); };
  $('olFlipV').onclick = () => { save(); pts = pts.map(([x, y]) => [x, -y]).reverse(); sel = -1; draw(); };
  $('olSym').onclick = () => {
    // keep the left half (x <= 0, in order round the outline) and mirror it onto the right
    save();
    const P = simpleCcw(pts.map((p) => [p[0], p[1]]));
    const left = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      if (a[0] <= 0) left.push(a);
      if ((a[0] < 0 && b[0] > 0) || (a[0] > 0 && b[0] < 0)) { const t = a[0] / (a[0] - b[0]); left.push([0, a[1] + t * (b[1] - a[1])]); }
    }
    // start the half at its top crossing so it runs top -> down the left side -> bottom crossing
    if (left.length < 2) return;
    let k = left.findIndex((p, i) => Math.abs(p[0]) < 1e-9 && left[(i + 1) % left.length][0] < 0);
    if (k < 0) k = 0;
    const half = left.slice(k).concat(left.slice(0, k));
    const right = half.filter((p) => Math.abs(p[0]) > 1e-9).map(([x, y]) => [-x, y]).reverse();
    pts = half.concat(right); sel = -1; draw();
  };
  $('olRound').onclick = () => {
    const idx = sel >= 0 ? [sel] : pts.map((_, i) => i);
    save();
    const r = Math.max(0.5, +$('olRadius').value || 6), out = [];
    pts.forEach((p, i) => {
      if (!idx.includes(i)) { out.push(p); return; }
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
      const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const rr = Math.min(r, da / 2.2, db / 2.2);
      const A = [p[0] + (a[0] - p[0]) / da * rr, p[1] + (a[1] - p[1]) / da * rr], B = [p[0] + (b[0] - p[0]) / db * rr, p[1] + (b[1] - p[1]) / db * rr];
      for (let k = 0; k <= 4; k++) {   // quadratic curve A -> p -> B
        const t = k / 4, u = 1 - t;
        out.push([u * u * A[0] + 2 * u * t * p[0] + t * t * B[0], u * u * A[1] + 2 * u * t * p[1] + t * t * B[1]]);
      }
    });
    pts = out; sel = -1; draw();
  };
  $('olPresets').innerHTML = Object.entries(SHAPES).map(([k, v]) => `<button data-ol="${k}">${v.name}</button>`).join('');
  $('olPresets').querySelectorAll('[data-ol]').forEach((b) => (b.onclick = () => { save(); pts = SHAPES[b.dataset.ol].pts.map(toMM); sel = -1; fit(); draw(); }));
  function open(el) {
    e = el; pts = (e.shape || SHAPES.rect.pts).map(toMM); sel = -1; stack = [];
    $('outlineModal').style.display = 'flex';
    resize(); fit(); draw(); cv.focus();
  }
  function close(apply) {
    if (apply && e) {
      if (pts.length < 3 || selfCrossing(pts)) return toast('The outline crosses itself: fix it first');
      // fit the screen's box round the outline: centre and size follow, corners stay where they are in the cockpit
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const w = Math.max(x1 - x0, 1), h = Math.max(y1 - y0, 1), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      pushUndo();
      const { up, right } = basisOf(e);
      e.pos = e.pos.clone().addScaledVector(right, cx / 1000).addScaledVector(up, cy / 1000);
      e.w = w / 1000; e.h = h / 1000;
      e.shape = pts.map(([x, y]) => [+((x - cx) / w).toFixed(5), +((y - cy) / h).toFixed(5)]);
      changed(e); renderProps();
    }
    $('outlineModal').style.display = 'none'; e = null;
  }
  $('olDone').onclick = () => close(true); $('olCancel').onclick = () => close(false);
  new ResizeObserver(() => { if (e) { resize(); draw(); } }).observe(cv);
  return { open, isOpen: () => !!e };
})();
function fitHeight(e) {
  // the text block's width : height at 100 px, and the frame drawDecal puts round it (shares of the decal's short side)
  const s = e.style, lines = (s.text || ' ').split('\n');
  const g = document.createElement('canvas').getContext('2d');
  g.font = `${s.bold === false ? '' : 'bold '}100px "${s.font}", Arial`;
  const a = Math.max(...lines.map((l) => g.measureText(l).width), 1) / (lines.length * 112);
  const p = 0.08 + (s.border ? 0.07 : 0) + (s.stripes ? 0.16 : 0);
  // with the height the short side: (w - 2ph) / (h (1 - 2p)) = a
  e.h = Math.max(0.006, Math.min(e.w, e.w / (a * (1 - 2 * p) + 2 * p)));
}
function nudge(x, dx, dy, step) {
  pushUndo();
  const { up, right } = basisOf(x);
  x.pos.addScaledVector(right, dx * step).addScaledVector(up, dy * step);
  changed(x, x.type !== 'group');
}
const raycaster = new THREE.Raycaster();
function snapToSurface(x) {
  const { n } = basisOf(x);
  const ignore = x.type === 'group' ? x.meshes : [];
  raycaster.set(x.pos.clone().addScaledVector(n, 0.05), n.clone().negate());
  const hit = raycaster.intersectObjects(surfaceMeshes.filter((m) => !ignore.includes(m) && m.visible && m.parent?.visible !== false), false)[0];
  if (!hit) return toast('No surface right behind it');
  pushUndo(); x.pos.copy(hit.point); x.normal.copy(hitNormal(hit, n.clone().negate())); changed(x);
}

// ------------------------------------------------------------------------------------------------ placing with the mouse
function startPlacing(p) {
  placing = p; $('placing').style.display = 'block'; renderer.domElement.style.cursor = 'crosshair';
  if (ghost) { scene.remove(ghost); ghost = null; }
}
function stopPlacing() {
  placing = null; $('placing').style.display = 'none'; renderer.domElement.style.cursor = '';
  if (ghost) { scene.remove(ghost); ghost = null; }
}
function hitNormal(hit, rayDir) {
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  if (n.dot(rayDir) > 0) n.negate();   // toward the viewer
  return n.normalize();
}
function pick(ev, objs) {
  const r = renderer.domElement.getBoundingClientRect();
  const p = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(p, camera);
  return raycaster.intersectObjects(objs.filter((o) => o.visible && o.parent?.visible !== false), true)[0];
}
function placeTargets() { const mv = placing?.move; return mv?.type === 'group' ? surfaceMeshes.filter((m) => !mv.meshes.includes(m)) : surfaceMeshes; }
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
renderer.domElement.addEventListener('pointermove', (ev) => {
  if (!placing) return;
  const hit = pick(ev, placeTargets());
  if (!hit) { if (ghost) ghost.visible = false; return; }
  const n = hitNormal(hit, raycaster.ray.direction);
  const [w, h] = sizeOf(placing.move || placing.make);
  const up = upFor(n), right = new THREE.Vector3().crossVectors(up, n);
  if (!ghost) {
    ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0x4fb3ff, depthTest: false }));
    ghost.renderOrder = 11; ghost.matrixAutoUpdate = false; scene.add(ghost);
  }
  ghost.visible = true;
  ghost.matrix.makeBasis(right.multiplyScalar(w), up.multiplyScalar(h), n).setPosition(hit.point.clone().addScaledVector(n, 0.002));
});
renderer.domElement.addEventListener('pointerup', (ev) => {
  if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5 || ev.button !== 0) return;
  if (placing) {
    const hit = pick(ev, placeTargets());
    if (!hit) return toast('Click on a cockpit surface');
    const n = hitNormal(hit, raycaster.ray.direction);
    if (placing.move) {
      pushUndo(); const x = placing.move;
      x.pos.copy(hit.point); x.normal.copy(n); x.baseUp.copy(upFor(n)); x.rot = 0;
      if (x.type === 'group') x.hidden = false;
      changed(x); stopPlacing(); renderProps(); renderGroups(); return;
    }
    const e = placing.make; e.pos = hit.point.clone(); e.normal = n; e.baseUp = upFor(n); e.rot = 0;
    stopPlacing(); addElement(e); select(e); showTab('mine'); return;
  }
  const hitEl = pick(ev, [...previews.values()]);
  const hitCk = pick(ev, surfaceMeshes);
  if (hitEl && (!hitCk || hitEl.distance <= hitCk.distance + 0.002)) return select(elements.find((e) => e.id === hitEl.object.userData.id) || null);
  const gid = hitCk?.object.userData.gid;
  if (gid) { select(groups.find((g) => g.id === gid)); showTab('layout'); }
  else select(null);
});
window.addEventListener('keydown', (ev) => {
  if (outlineEditor.isOpen() || designer.isOpen() || setupsUI.isOpen()) return;   // those windows have their own keys
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (ev.ctrlKey && ev.key.toLowerCase() === 's') { ev.preventDefault(); save(); return; }
  if (typing) return;
  if (ev.ctrlKey && ev.key.toLowerCase() === 'z') { ev.preventDefault(); undo(); return; }
  if (ev.key === 'Escape') { if (placing) stopPlacing(); else select(null); return; }
  if (!selected) return;
  const x = selected, st = ev.shiftKey ? 0.01 : 0.001, k = ev.key;
  if (k === 'ArrowLeft') { ev.preventDefault(); nudge(x, -1, 0, st); }
  else if (k === 'ArrowRight') { ev.preventDefault(); nudge(x, 1, 0, st); }
  else if (k === 'ArrowUp') { ev.preventDefault(); nudge(x, 0, 1, st); }
  else if (k === 'ArrowDown') { ev.preventDefault(); nudge(x, 0, -1, st); }
  else if ('qQeE'.includes(k) && k.length === 1) { pushUndo(); x.rot = (x.rot || 0) + (k.toLowerCase() === 'q' ? -1 : 1) * (ev.shiftKey ? 1 : 5); changed(x); renderProps(); }
  else if ('+=-_'.includes(k) && k.length === 1) {
    pushUndo(); const f = (k === '-' || k === '_') ? 1 / 1.05 : 1.05;
    if (x.type === 'group') x.scale *= f; else { x.w *= f; x.h *= f; }
    changed(x); renderProps();
  }
  else if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); deleteSelected(); }
  else if (ev.ctrlKey && k.toLowerCase() === 'd') { ev.preventDefault(); duplicateSelected(); }
  else if (k === 'm' || k === 'M') startPlacing({ move: x });
  else if ((k === 'h' || k === 'H') && x.type === 'group') toggleHide(x);
  else if (k === 'f' || k === 'F') focusOn(x);
});

// ------------------------------------------------------------------------------------------------ left panel
function showTab(t) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.tab').forEach((d) => d.classList.toggle('on', d.id === 'tab-' + t));
}
document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
async function renderTemplates() {
  const T = $('templates'); T.innerHTML = '';
  for (const t of TEMPLATES) {
    const b = document.createElement('button');
    const cv = await drawDecal({ w: t.w, h: t.h, style: t.style });
    cv.style.width = '100%'; cv.style.height = '34px'; cv.style.objectFit = 'contain';
    b.appendChild(cv); const sp = document.createElement('span'); sp.textContent = t.name; b.appendChild(sp);
    b.onclick = () => startPlacing({ make: { id: uid('d'), type: 'decal', name: t.name, w: t.w, h: t.h, offset: 0.0015, style: JSON.parse(JSON.stringify(t.style)) } });
    T.appendChild(b);
  }
}
function pickImage(cb) {
  const f = $('imgfile'); f.value = '';
  f.onchange = () => {
    const file = f.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      // big pictures are shrunk to 1024 px: the decal texture is no bigger
      const im = new Image(); im.onload = () => {
        const k = Math.min(1, 1024 / Math.max(im.width, im.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        cb(cv.toDataURL('image/png'), im.width / im.height);
      }; im.src = rd.result;
    };
    rd.readAsDataURL(file);
  };
  f.click();
}
$('addImage').onclick = () => pickImage((url, aspect) => {
  const w = 0.08;
  startPlacing({ make: { id: uid('d'), type: 'decal', name: 'Picture', w, h: w / aspect, offset: 0.0015, style: { text: '', font: 'Arial Black', color: '#ffffff', bgOn: false, bg: '#000000', border: false, borderColor: '#ffffff', stripes: false, radius: 0, image: url } } });
});
$('newShape').innerHTML = Object.entries(SHAPES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
$('addScreen').onclick = () => {
  const page = $('newPage').value;
  const b = builtinSizes[page] && ['stby', 'ufc'].includes(page) ? builtinSizes[page] : page === 'tac' ? { w: 0.168, h: 0.08 } : { w: 0.14, h: 0.18 };
  startPlacing({ make: { id: uid('s'), type: 'screen', name: pageLabel(page), page, w: b.w, h: b.h, shape: SHAPES[$('newShape').value].pts.map((p) => [...p]), bezel: 0.008, depth: 0.008, bezelColor: 'black' } });
};
function renderBuiltins() {
  const B = $('builtins'); B.innerHTML = '';
  const list = jets[jet].builtin;
  $('builtinBox').style.display = list.length ? 'block' : 'none';
  for (const s of list) {
    const d = document.createElement('label'); d.className = 'check';
    d.innerHTML = `<input type="checkbox"${hide.includes(s) ? '' : ' checked'}> <span></span>`;
    d.querySelector('span').textContent = PAGE_NAMES[s] || s;
    d.querySelector('input').onchange = (ev) => { pushUndo(); hide = ev.target.checked ? hide.filter((h) => h !== s) : [...hide, s]; updateBuiltinTint(); };
    B.appendChild(d);
  }
}
function updateBuiltinTint() {
  for (const [name, m] of Object.entries(builtinScreenMeshes)) m.material.color.set(hide.includes(name) ? 0x050505 : 0x123f24);
}


// ------------------------------------------------------------------------------------------------ custom MFD pages
// mfd = { pages: [{ id, name, bg, rate, widgets: [...] }], assign: [{ screen, page }] }, saved as cockpit\mfd_pages.json and
// shipped next to the SMT instruments plugin, which draws them (Widgets.cs). The preview here uses the same canvas and font.
let mfd = { pages: [], assign: [] };
let builtinShapes = {};   // built-in screen -> outline in 0..1 (u right, v up), worked out as the plugin does
function screenOutline(p) {
  const v = []; for (let i = 0; i < p.vertices.length; i += 3) v.push([p.vertices[i], p.vertices[i + 1], p.vertices[i + 2]]);
  const n = [p.normals[0], p.normals[1], p.normals[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
  let right = [1, 0, 0], best = -1;
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
    const d = [v[j][0] - v[i][0], v[j][1] - v[i][1], v[j][2] - v[i][2]], L = Math.hypot(...d); if (L < 1e-8) continue;
    const h = Math.abs(d[0] / L) - Math.abs(d[1] / L); if (h > best) { best = h; right = d.map((x) => x / L); }
  }
  if (right[0] < 0) right = right.map((x) => -x);
  const nn = norm(n), rd = dot(right, nn); right = norm(right.map((x, k) => x - nn[k] * rd));
  let up = norm([right[1] * nn[2] - right[2] * nn[1], right[2] * nn[0] - right[0] * nn[2], right[0] * nn[1] - right[1] * nn[0]]);
  if (up[1] < 0) up = up.map((x) => -x);
  const uv = v.map((q) => [dot(q, right), dot(q, up)]);
  const u0 = Math.min(...uv.map((q) => q[0])), u1 = Math.max(...uv.map((q) => q[0])), w0 = Math.min(...uv.map((q) => q[1])), w1 = Math.max(...uv.map((q) => q[1]));
  return hull(uv.map(([a, b]) => [(a - u0) / (u1 - u0 || 1), (b - w0) / (w1 - w0 || 1)]));
}
const BUILTIN_PX = { pfd: 320, eng: 320, sms: 400, stby: 120, ufc: 250 };
function pageLabel(p) {
  if (p && p.startsWith('c_')) { const pg = mfd.pages.find((x) => 'c_' + x.id === p); return 'Custom: ' + (pg ? pg.name : p.slice(2) + ' (missing)'); }
  return PAGE_NAMES[p] || p;
}
function pageOptions(sel) {
  const std = jets[jet].pages.map((p) => `<option value="${p}"${p === sel ? ' selected' : ''}>${PAGE_NAMES[p] || p}</option>`);
  const cus = mfd.pages.map((pg) => `<option value="c_${pg.id}"${'c_' + pg.id === sel ? ' selected' : ''}></option>`);
  return std.join('') + (cus.length ? `<optgroup label="Your pages">${cus.join('')}</optgroup>` : '');
}
function fillPageNames(select) {   // custom page names set as text (they are typed by the user)
  select.querySelectorAll('option[value^="c_"]').forEach((o) => { const pg = mfd.pages.find((x) => 'c_' + x.id === o.value); o.textContent = 'Custom: ' + (pg ? pg.name : o.value); });
}
function pagePx(screenKind, e) {
  // the texture size the plugin gives a page on a screen (see ScreenDriver.Add): built-in widths, custom at the PFD's density
  const b = builtinSizes[screenKind];
  if (b && BUILTIN_PX[screenKind]) { const w = BUILTIN_PX[screenKind]; return [w, Math.max(16, Math.round(w * b.h / b.w))]; }
  const ppm = builtinSizes.pfd ? 320 / builtinSizes.pfd.w : 2000;
  if (e) { const w = Math.max(64, Math.min(768, Math.round(ppm * e.w))); return [w, Math.max(16, Math.round(w * e.h / e.w))]; }
  return [320, 480];
}
function newPageId() { let i = 1; while (mfd.pages.some((p) => p.id === 'p' + i)) i++; return 'p' + i; }
function W_(type, x, y, w, h, extra = {}) { return { type, x, y, w, h, field: '', label: '', text: '', color: '', align: 'left', size: 0, thick: 2, frame: false, fill: false, ...extra }; }
const PAGE_TEMPLATES = {
  blank: () => [],
  flight: () => [W_('heading_tape', 0.04, 0.02, 0.92, 0.11), W_('attitude', 0.04, 0.15, 0.92, 0.45), W_('speed_tape', 0.04, 0.15, 0.2, 0.45), W_('alt_tape', 0.76, 0.15, 0.2, 0.45),
    W_('value', 0.04, 0.63, 0.45, 0.09, { field: 'mach', frame: true }), W_('value', 0.51, 0.63, 0.45, 0.09, { field: 'g', frame: true }),
    W_('value', 0.04, 0.74, 0.45, 0.09, { field: 'aoa', frame: true }), W_('value', 0.51, 0.74, 0.45, 0.09, { field: 'vs', frame: true }),
    W_('clock', 0.04, 0.86, 0.92, 0.08, { color: '#3cd2e6' }), W_('warnings', 0.25, 0.45, 0.5, 0.12)],
  systems: () => [W_('signature', 0.03, 0.03, 0.94, 0.14, { frame: true }), W_('engines', 0.03, 0.2, 0.94, 0.22, { frame: true }), W_('fuel', 0.03, 0.45, 0.94, 0.14, { frame: true }),
    W_('value', 0.03, 0.62, 0.45, 0.09, { field: 'hyd', frame: true }), W_('value', 0.52, 0.62, 0.45, 0.09, { field: 'oxy', frame: true }), W_('cautions', 0.03, 0.74, 0.94, 0.24)],
  combat: () => [W_('rwr', 0.08, 0.02, 0.84, 0.42), W_('warnings', 0.2, 0.44, 0.6, 0.1), W_('stores', 0.03, 0.55, 0.6, 0.42, { frame: true }), W_('cms', 0.66, 0.55, 0.32, 0.25), W_('target', 0.66, 0.8, 0.32, 0.18)],
};
$('newPageBtn').onclick = () => {
  pushUndo();
  const tpl = $('newPageTpl').value, id = newPageId();
  const pg = { id, name: { blank: 'My page', flight: 'My flight page', systems: 'My systems page', combat: 'My combat page' }[tpl] + ' ' + id.slice(1), bg: '#06080a', rate: 10, widgets: PAGE_TEMPLATES[tpl]() };
  mfd.pages.push(pg); renderPagesTab(); designer.open(pg);
};
function renderPagesTab() {
  const box = $('tab-pages'); if (!box) return;
  const smt = jets[jet]?.builtin?.length > 0;
  $('pageList').innerHTML = ''; $('noPages').style.display = mfd.pages.length ? 'none' : 'block';
  $('newPageBtn').disabled = !smt;
  if (!smt) { $('noPages').textContent = 'The MiG-29 (9.12) has no plugin screens: custom pages are for the MiG-29SMT.'; $('assignBox').innerHTML = ''; return; }
  $('noPages').textContent = 'No pages yet: pick a starting point above and press New.';
  for (const pg of mfd.pages) {
    const used = elements.filter((e) => e.type === 'screen' && e.page === 'c_' + pg.id).length + mfd.assign.filter((a) => a.page === pg.id).length;
    const d = document.createElement('div'); d.className = 'item';
    d.innerHTML = `<span class="kind" style="background:#9b7bff">PAGE</span><span class="nm"></span><span class="tag"></span><button class="eye" title="Duplicate">&#10697;</button><button class="eye" title="Delete" style="color:var(--bad)">&#10005;</button>`;
    d.querySelector('.nm').textContent = pg.name; d.querySelector('.tag').textContent = used ? `on ${used}` : '';
    const [dup, del] = d.querySelectorAll('button');
    dup.onclick = (ev) => { ev.stopPropagation(); pushUndo(); const c = JSON.parse(JSON.stringify(pg)); c.id = newPageId(); c.name = pg.name + ' copy'; mfd.pages.push(c); renderPagesTab(); };
    del.onclick = (ev) => {
      ev.stopPropagation();
      if (used && !confirm(`"${pg.name}" is shown on ${used} screen(s). Delete it anyway? Those screens go back to a standard page.`)) return;
      pushUndo(); mfd.pages = mfd.pages.filter((x) => x !== pg); mfd.assign = mfd.assign.filter((a) => a.page !== pg.id);
      for (const e of elements) if (e.type === 'screen' && e.page === 'c_' + pg.id) { e.page = jets[jet].pages[0]; buildPreview(e); }
      renderPagesTab(); renderProps();
    };
    d.onclick = () => designer.open(pg);
    $('pageList').appendChild(d);
  }
  const np = $('newPage'), keep = np.value; np.innerHTML = pageOptions(keep); fillPageNames(np); if (keep) np.value = keep;
  const A = $('assignBox'); A.innerHTML = '';
  for (const s of jets[jet].builtin) {
    const cur = mfd.assign.find((a) => a.screen === s);
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<label></label><select><option value="">Standard</option>${mfd.pages.map((pg) => `<option value="${pg.id}"></option>`).join('')}</select>`;
    row.querySelector('label').textContent = { pfd: 'Left display', eng: 'Right display', sms: 'Stores (centre)', stby: 'Standby', ufc: 'UFCP window' }[s] || s;
    const sel = row.querySelector('select');
    sel.querySelectorAll('option[value]').forEach((o) => { const pg = mfd.pages.find((x) => x.id === o.value); if (pg) o.textContent = pg.name; });
    sel.value = cur ? cur.page : '';
    sel.onchange = () => { pushUndo(); mfd.assign = mfd.assign.filter((a) => a.screen !== s); if (sel.value) mfd.assign.push({ screen: s, page: sel.value }); renderPagesTab(); };
    A.appendChild(row);
  }
}

// the page designer window
const designer = (() => {
  const cv = $('pdCanvas'), ov = $('pdOverlay');
  let pg = null, sel = -1, zoom = 1, pxW = 320, pxH = 480, t0 = performance.now(), anim = 0, drag = null, stack = [];
  const save = () => { stack.push(JSON.stringify({ widgets: pg.widgets, sel })); if (stack.length > 200) stack.shift(); setDirty(true); };
  function sizes() {
    const out = [];
    for (const s of jets[jet].builtin) if (builtinSizes[s]) { const [w, h] = pagePx(s); out.push([`builtin:${s}`, `${{ pfd: 'Left display', eng: 'Right display', sms: 'Stores (centre)', stby: 'Standby', ufc: 'UFCP window' }[s] || s} (${w}×${h})`, w, h]); }
    for (const e of elements.filter((x) => x.type === 'screen')) { const [w, h] = pagePx(null, e); out.push([`screen:${e.id}`, `${e.name} (${w}×${h})`, w, h]); }
    out.push(['free:320x480', 'Tall 320×480', 320, 480], ['free:480x320', 'Wide 480×320', 480, 320], ['free:320x320', 'Square 320×320', 320, 320]);
    return out;
  }
  function fitZoom() {
    const st = $('pdStage').getBoundingClientRect();
    zoom = Math.max(0.5, Math.min((st.width - 40) / pxW, (st.height - 40) / pxH));
    const dpr = devicePixelRatio || 1;
    cv.width = pxW; cv.height = pxH; cv.style.width = pxW * zoom + 'px'; cv.style.height = pxH * zoom + 'px';
    ov.width = Math.round(pxW * zoom * dpr); ov.height = Math.round(pxH * zoom * dpr); ov.style.width = pxW * zoom + 'px'; ov.style.height = pxH * zoom + 'px';
  }
  function render() {
    if (!pg) return;
    const t = $('pdAnim').checked ? (performance.now() - t0) / 1000 : 12;
    const c = new Canvas(pxW, pxH); drawPage(c, sampleState(t), pg); c.draw(cv.getContext('2d'));
    const g = ov.getContext('2d'), k = ov.width / pxW;
    g.clearRect(0, 0, ov.width, ov.height);
    const sh = maskShape();
    if (sh && sh.length >= 3) {   // grey out what lies outside the screen's outline (not shown in the game)
      g.beginPath(); g.rect(0, 0, ov.width, ov.height);
      sh.forEach(([u, v], i) => { const X = u * ov.width, Y = (1 - v) * ov.height; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath();
      g.fillStyle = 'rgba(11,14,17,0.78)'; g.fill('evenodd');
      g.beginPath(); sh.forEach(([u, v], i) => { const X = u * ov.width, Y = (1 - v) * ov.height; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath();
      g.strokeStyle = 'rgba(232,185,49,0.6)'; g.lineWidth = 1.5; g.setLineDash([6, 4]); g.stroke(); g.setLineDash([]);
    }
    pg.widgets.forEach((w, i) => {
      const x = w.x * pxW * k, y = w.y * pxH * k, ww = w.w * pxW * k, hh = w.h * pxH * k;
      g.strokeStyle = i === sel ? '#e8b931' : 'rgba(79,179,255,0.35)'; g.lineWidth = i === sel ? 2 : 1; g.setLineDash(i === sel ? [] : [4, 4]);
      g.strokeRect(x + 0.5, y + 0.5, ww, hh); g.setLineDash([]);
      if (i === sel) { g.fillStyle = '#e8b931'; for (const [hx, hy] of handles(w, k)) g.fillRect(hx - 5, hy - 5, 10, 10); }
    });
  }
  function maskShape() {   // the previewed screen's outline in 0..1 (u right, v up), or null for a plain rectangle
    const key = $('pdSize').value || '';
    if (key.startsWith('builtin:')) return builtinShapes[key.slice(8)] || null;
    if (key.startsWith('screen:')) { const e = elements.find((x) => x.id === key.slice(7)); if (e) return simpleCcw(e.shape || SHAPES.rect.pts).map(([x, y]) => [x + 0.5, y + 0.5]); }
    return null;
  }
  function handles(w, k) {
    const x0 = w.x * pxW * k, y0 = w.y * pxH * k, x1 = (w.x + w.w) * pxW * k, y1 = (w.y + w.h) * pxH * k, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
    return [[x0, y0], [xm, y0], [x1, y0], [x1, ym], [x1, y1], [xm, y1], [x0, y1], [x0, ym]];
  }
  function loop() { if (!pg) return; render(); anim = requestAnimationFrame(loop); }
  const at = (ev) => { const r = ov.getBoundingClientRect(), k = ov.width / r.width; return [(ev.clientX - r.left) * k, (ev.clientY - r.top) * k]; };
  ov.addEventListener('pointerdown', (ev) => {
    ov.focus();
    const [X, Y] = at(ev), k = ov.width / pxW;
    if (sel >= 0) { const hi = handles(pg.widgets[sel], k).findIndex(([hx, hy]) => Math.abs(hx - X) < 8 && Math.abs(hy - Y) < 8); if (hi >= 0) { save(); drag = { mode: hi, X, Y, w0: { ...pg.widgets[sel] } }; ov.setPointerCapture(ev.pointerId); return; } }
    let hit = -1;   // topmost widget under the pointer (drawn last = on top)
    for (let i = pg.widgets.length - 1; i >= 0; i--) { const w = pg.widgets[i]; if (X >= w.x * pxW * k && X <= (w.x + w.w) * pxW * k && Y >= w.y * pxH * k && Y <= (w.y + w.h) * pxH * k) { hit = i; break; } }
    sel = hit; props();
    if (hit >= 0) { save(); drag = { mode: 'move', X, Y, w0: { ...pg.widgets[hit] } }; ov.setPointerCapture(ev.pointerId); }
  });
  ov.addEventListener('pointermove', (ev) => {
    const [X, Y] = at(ev), k = ov.width / pxW;
    if (!drag) {   // cursor hint over handles
      let cur = 'default';
      if (sel >= 0) { const hi = handles(pg.widgets[sel], k).findIndex(([hx, hy]) => Math.abs(hx - X) < 8 && Math.abs(hy - Y) < 8); if (hi >= 0) cur = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'][hi]; }
      ov.style.cursor = cur; return;
    }
    const w = pg.widgets[sel], o = drag.w0, dx = Math.round((X - drag.X) / k) / pxW, dy = Math.round((Y - drag.Y) / k) / pxH;
    const minW = 4 / pxW, minH = 4 / pxH;
    if (drag.mode === 'move') { w.x = o.x + dx; w.y = o.y + dy; }
    else {
      const m = drag.mode, L = [0, 6, 7].includes(m), Rr = [2, 3, 4].includes(m), T = [0, 1, 2].includes(m), B = [4, 5, 6].includes(m);
      if (L) { w.x = Math.min(o.x + dx, o.x + o.w - minW); w.w = o.x + o.w - w.x; }
      if (Rr) w.w = Math.max(minW, o.w + dx);
      if (T) { w.y = Math.min(o.y + dy, o.y + o.h - minH); w.h = o.y + o.h - w.y; }
      if (B) w.h = Math.max(minH, o.h + dy);
    }
    props(true);
  });
  ov.addEventListener('pointerup', () => { drag = null; });
  ov.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' || ev.key === 'Enter') { ev.stopPropagation(); close(); return; }
    if (ev.ctrlKey && ev.key.toLowerCase() === 'z') { ev.preventDefault(); undo(); return; }
    if (sel < 0) return;
    const w = pg.widgets[sel], st = ev.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[ev.key];
    if (d) { ev.preventDefault(); save(); if (ev.altKey) { w.w = Math.max(4 / pxW, w.w + d[0] / pxW); w.h = Math.max(4 / pxH, w.h + d[1] / pxH); } else { w.x += d[0] / pxW; w.y += d[1] / pxH; } props(true); }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); del(); }
    else if (ev.ctrlKey && ev.key.toLowerCase() === 'd') { ev.preventDefault(); dup(); }
  });
  function undo() { if (!stack.length) return; const s = JSON.parse(stack.pop()); pg.widgets = s.widgets; sel = s.sel; props(); }
  function del() { if (sel < 0) return; save(); pg.widgets.splice(sel, 1); sel = -1; props(); }
  function dup() { if (sel < 0) return; save(); const c = { ...pg.widgets[sel], x: pg.widgets[sel].x + 0.03, y: pg.widgets[sel].y + 0.03 }; pg.widgets.push(c); sel = pg.widgets.length - 1; props(); }
  function props(numbersOnly) {
    const P = $('pdProps');
    if (sel < 0 || !pg.widgets[sel]) {
      P.innerHTML = `<h2>Widget</h2><p class="hint">Click a widget on the page to edit it, or add one from the left.</p>
        <h2>Keys</h2><p class="hint">Drag to move, drag the yellow squares to resize. Arrows move 1 px (Shift 10 px), Alt+arrows resize. Del deletes, Ctrl+D duplicates, Ctrl+Z undoes. Widgets drawn later sit on top: use Bring to front / Send to back.</p>`;
      return;
    }
    const w = pg.widgets[sel], meta = WIDGETS[w.type] || { name: w.type };
    const pct = (v) => (v * 100).toFixed(1);
    if (numbersOnly && $('pd_x')) { $('pd_x').value = pct(w.x); $('pd_y').value = pct(w.y); $('pd_w').value = pct(w.w); $('pd_h').value = pct(w.h); $('pd_px').textContent = pxText(w); return; }
    const hasField = ['value', 'bar', 'dial', 'vtape'].includes(w.type);
    let h = `<h2>${meta.name}</h2>
      ${field('Left', `<input type="number" id="pd_x" step="0.5">`, '%')}${field('Top', `<input type="number" id="pd_y" step="0.5">`, '%')}
      ${field('Width', `<input type="number" id="pd_w" step="0.5" min="0.5">`, '%')}${field('Height', `<input type="number" id="pd_h" step="0.5" min="0.5">`, '%')}
      <p class="hint" id="pd_px"></p>`;
    if (hasField) h += field('Shows', `<select id="pd_field">${Object.entries(FIELDS).map(([k, v]) => `<option value="${k}"${k === w.field ? ' selected' : ''}>${v[1]}</option>`).join('')}</select>`);
    if (w.type === 'value' || w.type === 'dial') h += field('Label', `<input type="text" id="pd_label" placeholder="${(FIELDS[w.field] || [''])[0]}">`);
    if (w.type === 'text') h += field('Text', `<input type="text" id="pd_text">`) + field('Align', `<select id="pd_align"><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select>`);
    if (['value', 'text', 'clock', 'stores'].includes(w.type)) h += field('Text size', `<select id="pd_size"><option value="0">Auto (fit)</option><option value="1">1 (tiny)</option><option value="2">2 (labels)</option><option value="3">3 (values)</option><option value="4">4</option><option value="5">5 (big)</option></select>`);
    if (['value', 'text', 'clock', 'bar', 'box', 'speed_tape', 'alt_tape', 'heading_tape', 'dial', 'compass', 'vtape', 'line'].includes(w.type))
      h += `<div class="row"><label>Colour</label><input type="color" id="pd_color"><label style="width:auto"><input type="checkbox" id="pd_colDef"> default</label></div>`;
    if (['attitude', 'speed_tape', 'alt_tape', 'value', 'stores', 'engines', 'fuel', 'signature'].includes(w.type)) h += `<div class="check"><input type="checkbox" id="pd_frame"><label for="pd_frame">Frame round it</label></div>`;
    if (w.type === 'box') h += `<div class="check"><input type="checkbox" id="pd_fill"><label for="pd_fill">Filled (off = outline)</label></div>` + field('Line', `<input type="number" id="pd_thick" min="1" max="10">`, 'px');
    // ---- this widget's own options (stored on it; the plugin reads the same names)
    const O = [];   // [kind, key, label, extra]
    const [rlo, rhi] = fieldRange(w.field);
    if (w.type === 'value') O.push(['num', 'decimals', 'Decimals', { ph: 'auto', min: 0, max: 4, step: 1 }], ['text', 'unit', 'Unit after it', { ph: 'e.g. KM' }], ['col', 'labelColor', 'Label colour']);
    if (w.type === 'dial') O.push(['num', 'min', 'Scale from', { ph: rlo }], ['num', 'max', 'Scale to', { ph: rhi }], ['num', 'red', 'Red from', { ph: 'none' }], ['bool', 'showValue', 'Show the number', { def: true }], ['col', 'labelColor', 'Label colour']);
    if (w.type === 'vtape') O.push(['num', 'span', 'Range shown', { ph: Math.max(1, (rhi - rlo) / 5) }], ['num', 'tick', 'Tick every', { ph: 'auto' }], ['sel', 'align', 'Scale side', { opts: [['left', 'Right edge'], ['right', 'Left edge']] }]);
    if (w.type === 'speed_tape') O.push(['num', 'span', 'Range shown', { ph: 300, unit: 'km/h' }]);
    if (w.type === 'alt_tape') O.push(['num', 'span', 'Range shown', { ph: 1400, unit: 'm' }]);
    if (w.type === 'attitude') O.push(['col', 'sky', 'Sky colour'], ['col', 'ground', 'Ground colour'], ['sel', 'ladderStep', 'Ladder every', { opts: [['5', '5 degrees'], ['10', '10 degrees']] }], ['bool', 'noBank', 'Hide the bank scale']);
    if (w.type === 'stores') O.push(['num', 'rows', 'Rows at most', { ph: 'all', min: 0, step: 1 }]);
    if (w.type === 'aoa_index') O.push(['num', 'lo', 'On speed from', { ph: 8, unit: 'deg' }], ['num', 'hi', 'On speed to', { ph: 14, unit: 'deg' }]);
    if (w.type === 'line') O.push(['sel', 'align', 'Direction', { opts: [['left', 'Across'], ['v', 'Up and down'], ['d1', 'Diagonal /'], ['d2', 'Diagonal \\']] }], ['num', 'thick', 'Thickness', { ph: 2, min: 1, max: 20, step: 1, unit: 'px' }]);
    if (w.type === 'image') O.push(['img', 'img', 'Picture']);
    O.push(['col', 'bg', 'Background'], ['col', 'border', 'Border'], ['num', 'borderW', 'Border width', { ph: 2, min: 1, max: 10, step: 1, unit: 'px' }]);
    h += '<h2>Options</h2>';
    O.forEach(([kind, key, label, x = {}], i) => {
      const id = 'pdo_' + i;
      if (kind === 'num') h += field(label, `<input type="number" id="${id}" placeholder="${x.ph ?? ''}"${x.min !== undefined ? ` min="${x.min}"` : ''}${x.max !== undefined ? ` max="${x.max}"` : ''} step="${x.step ?? 'any'}">`, x.unit || '');
      else if (kind === 'text') h += field(label, `<input type="text" id="${id}" placeholder="${x.ph ?? ''}">`);
      else if (kind === 'col') h += `<div class="row"><label>${label}</label><input type="color" id="${id}"><label style="width:auto"><input type="checkbox" id="${id}_n"> none</label></div>`;
      else if (kind === 'bool') h += `<div class="check"><input type="checkbox" id="${id}"><label for="${id}">${label}</label></div>`;
      else if (kind === 'sel') h += field(label, `<select id="${id}">${x.opts.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>`);
      else if (kind === 'img') h += `<div class="row"><label>${label}</label><button id="${id}">Choose a PNG&hellip;</button>${w.img ? `<button id="${id}_x" class="danger">Remove</button>` : ''}</div><p class="hint">Small pictures work best (it is drawn pixel by pixel; transparent parts stay see-through).</p>`;
    });
    h += `<div class="grid2" style="margin-top:10px"><button id="pd_front">Bring to front</button><button id="pd_back">Send to back</button><button id="pd_dup">Duplicate</button><button id="pd_del" class="danger">Delete</button></div>`;
    P.innerHTML = h;
    const num = (id, get, set) => { const el = $(id); el.value = get(); el.addEventListener('focus', () => save()); el.addEventListener('input', () => { set(+el.value); props(true); }); };
    num('pd_x', () => pct(w.x), (v) => (w.x = v / 100)); num('pd_y', () => pct(w.y), (v) => (w.y = v / 100));
    num('pd_w', () => pct(w.w), (v) => (w.w = Math.max(0.005, v / 100))); num('pd_h', () => pct(w.h), (v) => (w.h = Math.max(0.005, v / 100)));
    $('pd_px').textContent = pxText(w);
    const bindv = (id, get, set, ev = 'input') => { const el = $(id); if (!el) return; get(el); el.addEventListener('focus', () => save()); el.addEventListener(ev, () => { set(el); setDirty(true); }); };
    bindv('pd_field', (el) => (el.value = w.field), (el) => { w.field = el.value; props(); }, 'change');
    bindv('pd_label', (el) => (el.value = w.label || ''), (el) => (w.label = el.value));
    bindv('pd_text', (el) => (el.value = w.text || ''), (el) => (w.text = el.value));
    bindv('pd_align', (el) => (el.value = w.align || 'left'), (el) => (w.align = el.value), 'change');
    bindv('pd_size', (el) => (el.value = String(w.size || 0)), (el) => (w.size = +el.value), 'change');
    bindv('pd_frame', (el) => (el.checked = !!w.frame), (el) => (w.frame = el.checked), 'change');
    bindv('pd_fill', (el) => (el.checked = !!w.fill), (el) => (w.fill = el.checked), 'change');
    bindv('pd_thick', (el) => (el.value = w.thick || 2), (el) => (w.thick = Math.max(1, +el.value)));
    if ($('pd_color')) {
      const c = $('pd_color'), d = $('pd_colDef');
      c.value = w.color || '#ebebeb'; d.checked = !w.color;
      c.addEventListener('focus', () => save()); c.addEventListener('input', () => { w.color = c.value; d.checked = false; setDirty(true); });
      d.addEventListener('change', () => { save(); w.color = d.checked ? '' : c.value; });
    }
    O.forEach(([kind, key, label, x = {}], i) => {
      const id = 'pdo_' + i, el = $(id); if (!el) return;
      if (kind === 'num' || kind === 'text') {
        el.value = w[key] ?? ''; el.addEventListener('focus', () => save());
        el.addEventListener('input', () => { if (el.value === '') delete w[key]; else w[key] = kind === 'num' ? +el.value : el.value; setDirty(true); });
      } else if (kind === 'col') {
        const none = $(id + '_n'); el.value = w[key] || '#000000'; none.checked = !w[key];
        el.addEventListener('focus', () => save()); el.addEventListener('input', () => { w[key] = el.value; none.checked = false; setDirty(true); });
        none.addEventListener('change', () => { save(); if (none.checked) delete w[key]; else w[key] = el.value; });
      } else if (kind === 'bool') {
        el.checked = w[key] === undefined ? !!x.def : !!w[key];
        el.addEventListener('change', () => { save(); w[key] = el.checked; });
      } else if (kind === 'sel') {
        el.value = String(w[key] ?? x.opts[0][0]);
        el.addEventListener('change', () => { save(); w[key] = key === 'ladderStep' ? +el.value : el.value; });
      } else if (kind === 'img') {
        el.onclick = () => pickImage((url) => {
          // shrink to 256 px: the screen draws it pixel by pixel
          const im = new Image(); im.onload = () => {
            const k = Math.min(1, 256 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(im.width * k)); cv.height = Math.max(1, Math.round(im.height * k));
            cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
            save(); w[key] = cv.toDataURL('image/png'); props();
          }; im.src = url;
        });
        if ($(id + '_x')) $(id + '_x').onclick = () => { save(); delete w[key]; props(); };
      }
    });
    $('pd_front').onclick = () => { save(); pg.widgets.push(pg.widgets.splice(sel, 1)[0]); sel = pg.widgets.length - 1; props(); };
    $('pd_back').onclick = () => { save(); pg.widgets.unshift(pg.widgets.splice(sel, 1)[0]); sel = 0; props(); };
    $('pd_dup').onclick = dup; $('pd_del').onclick = del;
  }
  const pxText = (w) => `${Math.round(w.w * pxW)} × ${Math.round(w.h * pxH)} px on this screen, at ${Math.round(w.x * pxW)}, ${Math.round(w.y * pxH)}`;
  $('pdPalette').innerHTML = '';
  for (const [type, m] of Object.entries(WIDGETS)) {
    const b = document.createElement('button'); b.textContent = m.name; b.style.textAlign = 'left';
    b.onclick = () => {
      save();
      const [x, y, w, h] = m.box;
      pg.widgets.push(W_(type, x, y, w, h, { frame: !!m.frame, fill: !!m.fill, field: m.field || '', text: m.text || '', color: m.color || '' }));
      sel = pg.widgets.length - 1; props(); ov.focus();
    };
    $('pdPalette').appendChild(b);
  }
  $('pdName').addEventListener('input', () => { if (pg) { pg.name = $('pdName').value; setDirty(true); } });
  $('pdBg').addEventListener('input', () => { if (pg) { pg.bg = $('pdBg').value; setDirty(true); } });
  $('pdRate').addEventListener('input', () => { if (pg) { pg.rate = Math.max(1, Math.min(30, +$('pdRate').value || 10)); setDirty(true); } });
  $('pdSize').addEventListener('change', () => { const o = sizes().find((s) => s[0] === $('pdSize').value); if (o) { [pxW, pxH] = [o[2], o[3]]; fitZoom(); } });
  $('pdUndo').onclick = undo; $('pdDone').onclick = () => close();
  new ResizeObserver(() => { if (pg) fitZoom(); }).observe($('pdStage'));
  function open(p) {
    pg = p; sel = -1; stack = [];
    const opts = sizes();
    $('pdSize').innerHTML = opts.map((o) => `<option value="${o[0]}"></option>`).join('');
    $('pdSize').querySelectorAll('option').forEach((o, i) => (o.textContent = opts[i][1]));
    // preview on the first screen that shows this page, else the left display
    const showing = elements.find((e) => e.type === 'screen' && e.page === 'c_' + p.id), asg = mfd.assign.find((a) => a.page === p.id);
    const pick = showing ? `screen:${showing.id}` : asg ? `builtin:${asg.screen}` : opts[0][0];
    $('pdSize').value = opts.some((o) => o[0] === pick) ? pick : opts[0][0];
    const o = opts.find((x) => x[0] === $('pdSize').value); [pxW, pxH] = [o[2], o[3]];
    $('pdName').value = p.name; $('pdBg').value = p.bg || '#06080a'; $('pdRate').value = p.rate || 10;
    $('pageModal').style.display = 'flex';
    fitZoom(); props(); ov.focus(); cancelAnimationFrame(anim); loop();
  }
  function close() {
    cancelAnimationFrame(anim);
    $('pageModal').style.display = 'none'; pg = null;
    renderPagesTab(); renderProps();
    for (const e of elements) if (e.type === 'screen' && e.page.startsWith('c_')) buildPreview(e);
  }
  return { open, isOpen: () => !!pg };
})();

// ------------------------------------------------------------------------------------------------ loading / saving
function geom(p, v0, v1, tris) {
  const n = v1 - v0, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const s = (v0 + i) * 3;
    pos[i * 3] = p.vertices[s]; pos[i * 3 + 1] = p.vertices[s + 1]; pos[i * 3 + 2] = -p.vertices[s + 2];
    nor[i * 3] = p.normals[s]; nor[i * 3 + 1] = p.normals[s + 1]; nor[i * 3 + 2] = -p.normals[s + 2];
    uv[i * 2] = p.uvs[(v0 + i) * 2]; uv[i * 2 + 1] = p.uvs[(v0 + i) * 2 + 1];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(v0 ? tris.map((i) => i - v0) : tris);
  return g;
}
async function loadJet(j) {
  if (dirty && !confirm('You have unsaved changes. Switch jet anyway?')) { $('jet').value = jet; return; }
  jet = j; try { localStorage.setItem('ce_jet', j); } catch { }
  stopPlacing(); selected = null; clearElements(); undoStack.length = 0;
  if (cockpitGroup) { scene.remove(cockpitGroup); disposeObj(cockpitGroup); }
  $('loading').style.display = 'flex'; $('loading').textContent = 'Loading cockpit…';
  const [mesh, data] = await Promise.all([api(`/api/mesh?jet=${j}`), api(`/api/load?jet=${j}`)]);
  eyeU = mesh.eye || eyeU; builtinSizes = data.builtin || {};
  const atlas = await new THREE.TextureLoader().loadAsync(`/api/atlas?jet=${j}`);
  atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const matCk = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
  const matGlass = new THREE.MeshStandardMaterial({ color: 0x9fc3c0, transparent: true, opacity: 0.12, depthWrite: false, roughness: 0.1 });
  cockpitGroup = new THREE.Group(); surfaceMeshes = []; builtinScreenMeshes = {};
  // the cockpit's own movable groups
  const owner = {};
  groups = (mesh.groups || []).map((gm) => {
    const [c, n, , u] = gm.frame;
    const g = { type: 'group', id: gm.id, label: gm.label, kind: gm.kind, size: gm.size, parts: gm.parts, verts: gm.verts, tris: gm.tris,
      c0: fromU(c), n0: fromU(n).normalize(), u0: fromU(u).normalize(), rot: 0, scale: 1, hidden: false, meshes: [] };
    Object.assign(g, { pos: g.c0.clone(), normal: g.n0.clone(), baseUp: g.u0.clone() });
    g.obj = new THREE.Group(); g.obj.matrixAutoUpdate = false; cockpitGroup.add(g.obj);
    for (const p of gm.parts) owner[p] = g;
    return g;
  });
  const firstGroupTri = groups.length ? Math.min(...groups.map((g) => g.tris[0])) : Infinity;
  const addMesh = (geo, mat, name, parent, g) => {
    const m = new THREE.Mesh(geo, mat); m.name = name; parent.add(m);
    if (name !== 'glass') surfaceMeshes.push(m);
    if (g) { m.userData.gid = g.id; g.meshes.push(m); }
    return m;
  };
  for (const p of mesh.parts) {
    if (p.name === 'frames') continue;
    const isScreen = jets[j].builtin.includes(p.name);
    const mat = p.name === 'glass' ? matGlass : isScreen ? new THREE.MeshBasicMaterial({ color: 0x123f24, side: THREE.DoubleSide }) : matCk;
    if (p.name === 'tub' && groups.length) {
      addMesh(geom(p, 0, p.vertices.length / 3, p.triangles.slice(0, firstGroupTri)), matCk, 'tub', cockpitGroup, null);
      for (const g of groups) addMesh(geom(p, g.verts[0], g.verts[1], p.triangles.slice(g.tris[0], g.tris[1])), matCk, 'g_' + g.id, g.obj, g);
      continue;
    }
    const g = owner[p.name];
    const m = addMesh(geom(p, 0, p.vertices.length / 3, p.triangles), mat, p.name, g ? g.obj : cockpitGroup, g);
    if (isScreen) { builtinScreenMeshes[p.name] = m; try { builtinShapes[p.name] = screenOutline(p); } catch { } }
  }
  scene.add(cockpitGroup);
  // saved layout and items
  for (const [gid, L] of Object.entries(data.layout?.groups || {})) {
    const g = groups.find((x) => x.id === gid); if (!g) continue;
    if (L.pos) Object.assign(g, { pos: fromU(L.pos), normal: fromU(L.normal), baseUp: fromU(L.baseUp || L.up), rot: L.rot || 0 });
    g.scale = L.scale ?? 1; g.hidden = !!L.hidden;
  }
  groups.forEach(applyGroup);
  hide = [...(data.custom.hide || [])];
  mfd = data.mfd && data.mfd.pages ? data.mfd : { pages: [], assign: [] };
  for (const d of data.custom.decals || []) addElement(deserialise({ ...d, type: 'decal' }), false);
  for (const s of data.custom.screens || []) addElement(deserialise({ ...s, type: 'screen' }), false);
  $('newPage').innerHTML = jets[j].pages.map((p) => `<option value="${p}">${PAGE_NAMES[p] || p}</option>`).join('');  // (refreshed with your pages in renderPagesTab)
  $('screenHint').textContent = j === 'smt' ? 'A new display showing one of the SMT pages: any size, any outline.' : 'The MiG-29 (9.12) has no plugin pages: only the tactical display (experimental).';
  renderBuiltins(); updateBuiltinTint(); renderPagesTab(); renderAll(); setDirty(false);
  $('loading').style.display = 'none';
  setView('Pilot');
}
function layoutOut() {
  const out = {};
  for (const g of groups) {
    if (!groupChanged(g)) continue;
    const { n, up } = basisOf(g);
    out[g.id] = { pos: toU(g.pos), normal: toU(n), up: toU(up), baseUp: toU(g.baseUp), rot: g.rot || 0, scale: +g.scale.toFixed(4), hidden: g.hidden };
  }
  return { groups: out };
}
async function save() {
  const decals = elements.filter((e) => e.type === 'decal'), screens = elements.filter((e) => e.type === 'screen');
  const images = {};
  for (const d of decals) { if (!d.canvas) d.canvas = await drawDecal(d); images[d.id] = d.canvas.toDataURL('image/png'); }
  const custom = { version: 1, decals: decals.map(serialise), screens: screens.map(serialise), hide };
  try {
    const r = await api(`/api/save?jet=${jet}`, { custom, images, layout: layoutOut(), mfd });
    setDirty(false);
    const x = r.export, moved = Object.keys(layoutOut().groups).length;
    toast(`Saved: ${moved} instrument${moved === 1 ? '' : 's'} changed, ${x.decals} decal${x.decals === 1 ? '' : 's'}, ${x.screens} screen${x.screens === 1 ? '' : 's'}`);
    return true;
  } catch (err) { toast('Save failed: ' + err.message, 6000); return false; }
}


// ------------------------------------------------------------------------------------------------ cockpit setups (.cpit)
const setupsUI = (() => {
  const open = async () => { $('setupModal').style.display = 'flex'; if (!$('suName').value) $('suName').value = 'My ' + (jet === 'smt' ? 'SMT' : 'MiG-29') + ' cockpit'; $('suMsg').textContent = ''; await list(); };
  const close = () => { $('setupModal').style.display = 'none'; };
  async function list() {
    let r; try { r = await api(`/api/cpit/list?jet=${jet}`); } catch (err) { $('suList').textContent = err.message; return; }
    const L = $('suList'); L.innerHTML = '';
    if (!r.setups.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'None yet: export one above.'; L.appendChild(p); }
    for (const s of r.setups) {
      const d = document.createElement('div'); d.className = 'item'; d.style.cursor = 'default';
      d.innerHTML = `<span class="kind" style="background:${s.where === 'game' ? '#5fd38a' : '#4fb3ff'}">${s.where === 'game' ? 'IN GAME' : 'SAVED'}</span><span class="nm"></span><span class="tag" style="color:var(--dim)"></span>
        <button data-a="open" title="Open it here (replaces what you have)">Open</button>${s.where === 'editor' ? '<button data-a="install" title="Copy it into the game\'s Cockpits folder">To game</button>' : ''}<button data-a="dl" title="Download the file">&#8681;</button><button data-a="del" class="danger" title="Delete">&#10005;</button>`;
      d.querySelector('.nm').textContent = s.name; d.querySelector('.tag').textContent = s.time;
      d.querySelectorAll('button').forEach((b) => (b.onclick = () => act(b.dataset.a, s)));
      L.appendChild(d);
    }
    $('suDirs').textContent = `Saved in ${r.editor_dir}. The game reads ${r.game_dir}.`;
  }
  async function act(a, s) {
    try {
      if (a === 'open') {
        if (!confirm(`Open "${s.name}"? It replaces the layout, decals, screens and pages you have now (save first if you want to keep them: export them as a setup).`)) return;
        await api(`/api/cpit/import?jet=${jet}`, { name: s.name, where: s.where });
        setDirty(false); close(); await loadJet(jet); toast(`Opened "${s.name}"`);
      } else if (a === 'install') { await api(`/api/cpit/install?jet=${jet}`, { name: s.name }); toast(`"${s.name}" is in the game's Cockpits folder (restart the game to see new files in the list)`, 5000); await list(); }
      else if (a === 'dl') { window.location = `/api/cpit/download?jet=${jet}&where=${s.where}&name=${encodeURIComponent(s.name)}`; }
      else if (a === 'del') { if (!confirm(`Delete "${s.name}" (${s.where === 'game' ? 'from the game' : 'saved'})?`)) return; await api(`/api/cpit/delete?jet=${jet}`, { name: s.name, where: s.where }); await list(); }
    } catch (err) { toast(err.message, 6000); }
  }
  $('setupsBtn').onclick = open; $('suClose').onclick = close;
  $('suExport').onclick = async () => {
    if (!(await save())) return;
    try {
      const r = await api(`/api/cpit/export?jet=${jet}`, { name: $('suName').value, install: $('suInstall').checked });
      $('suMsg').textContent = `Exported "${r.name}.cpit"` + (r.installed ? ' and put it in the game' : '');
      await list();
    } catch (err) { $('suMsg').textContent = 'Export failed: ' + err.message; }
  };
  $('suOpenFile').onclick = () => { $('suFile').value = ''; $('suFile').click(); };
  $('suFile').onchange = () => {
    const file = $('suFile').files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = async () => {
      if (!confirm(`Open "${file.name}"? It replaces what you have now.`)) return;
      try { await api(`/api/cpit/import?jet=${jet}`, { content: rd.result }); setDirty(false); close(); await loadJet(jet); toast(`Opened "${file.name}"`); }
      catch (err) { toast('Could not open it: ' + err.message, 6000); }
    };
    rd.readAsText(file);
  };
  return { isOpen: () => $('setupModal').style.display === 'flex' };
})();

// ------------------------------------------------------------------------------------------------ build / refresh / log
let polling = null;
async function build() {
  if (!buildEnabled) return toast(buildReason, 7000);
  if (!(await save())) return;
  if (!confirm(`Build ${jets[jet].name} with your changes and install it into the game?\n\nIt takes a few minutes. Unity must be closed; the game too if you want it installed straight away.`)) return;
  try { await api(`/api/build?jet=${jet}`, { quick: true, install: true }); }
  catch (err) { return toast(err.message, 6000); }
  showLog(true); poll();
}
async function refresh() {
  if (dirty && !confirm('Reloading the cockpit reloads the page. Save first? (Cancel keeps editing.)')) return;
  if (dirty && !(await save())) return;
  try { await api(`/api/refresh?jet=${jet}`, {}); } catch (err) { return toast(err.message, 6000); }
  showLog(true); refresh.waiting = true; poll();
}
function showLog(on) { $('logbox').style.display = on ? 'flex' : 'none'; }
async function poll() {
  clearTimeout(polling);
  try {
    const s = await api('/api/status');
    $('game').textContent = s.game ? 'game running' : 'game closed'; $('game').className = 'pill' + (s.game ? ' bad' : ' good');
    const L = $('log'); const atEnd = L.scrollTop + L.clientHeight >= L.scrollHeight - 20;
    if (L.textContent !== (s.log || 'Nothing yet.')) { L.textContent = s.log || 'Nothing yet.'; if (atEnd) L.scrollTop = L.scrollHeight; }
    $('buildState').textContent = s.running ? 'working…' : s.ok === true ? 'done' : s.ok === false ? 'failed' : '';
    $('buildState').className = 'pill' + (s.ok === false ? ' bad' : s.ok === true ? ' good' : '');
    $('build').disabled = s.running || !buildEnabled; $('refresh').disabled = s.running;
    if (refresh.waiting && !s.running) { refresh.waiting = false; if (s.ok) { setDirty(false); loadJet(jet); toast('Cockpit reloaded from the mod'); } }
    polling = setTimeout(poll, s.running ? 1500 : 5000);
  } catch { polling = setTimeout(poll, 5000); }
}

// ------------------------------------------------------------------------------------------------ start
$('undo').onclick = undo; $('save').onclick = save; $('build').onclick = build; $('refresh').onclick = refresh;
$('logbtn').onclick = () => showLog($('logbox').style.display !== 'flex'); $('logclose').onclick = () => showLog(false);
$('installOnly').onclick = async () => { try { const r = await api(`/api/install?jet=${jet}`, {}); toast(r.log.trim()); poll(); } catch (err) { toast(err.message, 7000); } };
$('helpbtn').onclick = () => ($('help').style.display = 'flex');
$('helpclose').onclick = () => { $('help').style.display = 'none'; try { localStorage.setItem('ce_help', '1'); } catch { } };
for (const v of Object.keys(VIEWS)) { const b = document.createElement('button'); b.textContent = v; b.onclick = () => setView(v); $('viewbar').appendChild(b); }
window.addEventListener('beforeunload', (ev) => { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } });
(async () => {
  try {
    const info = await api('/api/jets');
    jets = info.jets; buildEnabled = info.build_enabled !== false; buildReason = info.build_disabled_reason || '';
    if (!buildEnabled) { $('build').title = buildReason; $('installOnly').disabled = true; $('installOnly').title = buildReason; }
    $('jet').innerHTML = Object.entries(jets).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
    let want = null; try { want = localStorage.getItem('ce_jet'); } catch { }
    const first = want && jets[want] ? want : Object.keys(jets)[0];
    $('jet').value = first; $('jet').onchange = (ev) => loadJet(ev.target.value);
    await document.fonts.ready;
    renderTemplates();
    await loadJet(first);
    let seen = null; try { seen = localStorage.getItem('ce_help'); } catch { }
    if (!seen) $('help').style.display = 'flex';
    poll();
  } catch (err) {
    $('loading').textContent = 'Could not load: ' + err.message + ' (is server.py running?)';
  }
})();

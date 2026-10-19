// Cockpit Editor front end. The cockpit is shown in three.js space, which is the game's (Unity's) frame with z flipped
// (Unity is left-handed): toU / fromU convert. Everything is kept in three space here and saved in Unity space.
//
// Three kinds of things can be selected:
//   decal   your painted marking (text and/or picture), flat on a surface
//   screen  your display: any page, any size, a convex outline, in a bezel
//   group   one of the cockpit's own instruments / displays / panels (cockpit_mesh.json "groups"), moved by a transform
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
    return [p0[0] + e0[0] * t, p0[1] + e0[1] * t];
  });
}

// ------------------------------------------------------------------------------------------------ undo
function snapshot() {
  return JSON.stringify({ elements: elements.map(serialise), hide, groups: groups.map((g) => ({ id: g.id, pos: toU(g.pos), normal: toU(g.normal), baseUp: toU(g.baseUp), rot: g.rot, scale: g.scale, hidden: g.hidden })) });
}
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 100) undoStack.shift(); setDirty(true); }
function undo() {
  if (!undoStack.length) return toast('Nothing to undo');
  const s = JSON.parse(undoStack.pop());
  const selId = selected?.id;
  clearElements(); hide = s.hide;
  s.elements.forEach((e) => addElement(deserialise(e), false));
  for (const gs of s.groups) { const g = groups.find((x) => x.id === gs.id); if (g) { Object.assign(g, { pos: fromU(gs.pos), normal: fromU(gs.normal), baseUp: fromU(gs.baseUp), rot: gs.rot, scale: gs.scale, hidden: gs.hidden }); applyGroup(g); } }
  selected = elements.find((e) => e.id === selId) || groups.find((g) => g.id === selId) || null;
  renderAll(); updateBuiltinTint(); setDirty(true);
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
    const shape = hull(e.shape || SHAPES.rect.pts);
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
    h += field('Shows', `<select id="p_page">${jets[jet].pages.map((p) => `<option value="${p}"${p === e.page ? ' selected' : ''}>${PAGE_NAMES[p] || p}</option>`).join('')}</select>`);
    h += '<h2>Outline</h2>';
    h += `<div class="shapes">${Object.entries(SHAPES).map(([k, v]) => `<button data-shape="${k}" title="${v.name}">${v.name}</button>`).join('')}</div>`;
    h += `<canvas id="shapeCanvas"></canvas><p class="hint">Drag a dot to move a corner &middot; double-click an edge to add one &middot; right-click a dot to remove it.</p><p class="warn" id="shapeWarn"></p>`;
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
    bind('p_page', (el) => (el.value = e.page), (el) => (e.page = el.value), true, 'change');
    bind('p_bezel', (el) => (el.value = Math.round((e.bezel ?? 0.008) * 1000)), (el) => (e.bezel = Math.max(0, +el.value) / 1000));
    bind('p_depth', (el) => (el.value = Math.round((e.depth ?? 0.008) * 1000)), (el) => (e.depth = Math.max(0, +el.value) / 1000));
    bind('p_bezelColor', (el) => (el.value = e.bezelColor || 'black'), (el) => (e.bezelColor = el.value), true, 'change');
    P.querySelectorAll('[data-shape]').forEach((b) => (b.onclick = () => { pushUndo(); e.shape = SHAPES[b.dataset.shape].pts.map((p) => [...p]); changed(e); shapeEditor(e); }));
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

// screen outline editor: the outline in the screen's own proportions, corners as dots
function shapeEditor(e) {
  const cv = $('shapeCanvas'); if (!cv) return;
  const dpr = devicePixelRatio || 1;
  cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
  const g = cv.getContext('2d');
  const M = 18 * dpr, a = e.w / e.h;
  let bw = cv.width - 2 * M, bh = bw / a;
  if (bh > cv.height - 2 * M) { bh = cv.height - 2 * M; bw = bh * a; }
  const ox = (cv.width - bw) / 2, oy = (cv.height - bh) / 2;
  const toPx = ([x, y]) => [ox + (x + 0.5) * bw, oy + (0.5 - y) * bh];
  const fromPx = (px, py) => [Math.min(0.5, Math.max(-0.5, (px - ox) / bw - 0.5)), Math.min(0.5, Math.max(-0.5, 0.5 - (py - oy) / bh))];
  const pts = e.shape || (e.shape = SHAPES.rect.pts.map((p) => [...p]));
  function draw() {
    g.clearRect(0, 0, cv.width, cv.height);
    g.strokeStyle = '#2a3038'; g.lineWidth = 1; g.setLineDash([4 * dpr, 4 * dpr]); g.strokeRect(ox, oy, bw, bh); g.setLineDash([]);
    const H = hull(pts).map(toPx);
    g.fillStyle = '#123f24'; g.beginPath(); H.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
    g.strokeStyle = '#46e65a'; g.lineWidth = 2 * dpr; g.stroke();
    if (!isConvex(pts)) {
      g.strokeStyle = '#e8b931'; g.setLineDash([3 * dpr, 3 * dpr]); g.beginPath();
      pts.map(toPx).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke(); g.setLineDash([]);
    }
    for (const p of pts) { const [x, y] = toPx(p); g.fillStyle = '#e8b931'; g.beginPath(); g.arc(x, y, 5 * dpr, 0, Math.PI * 2); g.fill(); }
    $('shapeWarn').textContent = isConvex(pts) ? '' : 'The dashed outline has a dent: screens are kept convex, so the green shape is what you will get.';
  }
  const at = (ev) => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) * dpr, (ev.clientY - r.top) * dpr]; };
  const nearest = (px, py) => { let bi = -1, bd = 12 * dpr; pts.forEach((p, i) => { const [x, y] = toPx(p); const d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; bi = i; } }); return bi; };
  let drag = -1;
  cv.onpointerdown = (ev) => {
    if (ev.button !== 0) return;
    const [px, py] = at(ev); drag = nearest(px, py);
    if (drag >= 0) { pushUndo(); cv.setPointerCapture(ev.pointerId); }
  };
  cv.onpointermove = (ev) => { if (drag < 0) return; const [px, py] = at(ev); pts[drag] = fromPx(px, py); draw(); };
  cv.onpointerup = () => { if (drag >= 0) { drag = -1; changed(e); } };
  cv.ondblclick = (ev) => {
    const [px, py] = at(ev); let bi = -1, bd = 14 * dpr;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = toPx(pts[i]), [x1, y1] = toPx(pts[(i + 1) % pts.length]);
      const L2 = (x1 - x0) ** 2 + (y1 - y0) ** 2 || 1; const t = Math.max(0, Math.min(1, ((px - x0) * (x1 - x0) + (py - y0) * (y1 - y0)) / L2));
      const d = Math.hypot(px - (x0 + t * (x1 - x0)), py - (y0 + t * (y1 - y0)));
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi < 0) return;
    pushUndo(); pts.splice(bi + 1, 0, fromPx(px, py)); draw(); changed(e);
  };
  cv.oncontextmenu = (ev) => {
    ev.preventDefault();
    const i = nearest(...at(ev));
    if (i < 0) return;
    if (pts.length <= 3) return toast('A screen needs at least 3 corners');
    pushUndo(); pts.splice(i, 1); draw(); changed(e);
  };
  draw();
}
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
  startPlacing({ make: { id: uid('s'), type: 'screen', name: PAGE_NAMES[page] || page, page, w: b.w, h: b.h, shape: SHAPES[$('newShape').value].pts.map((p) => [...p]), bezel: 0.008, depth: 0.008, bezelColor: 'black' } });
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
    if (isScreen) builtinScreenMeshes[p.name] = m;
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
  for (const d of data.custom.decals || []) addElement(deserialise({ ...d, type: 'decal' }), false);
  for (const s of data.custom.screens || []) addElement(deserialise({ ...s, type: 'screen' }), false);
  $('newPage').innerHTML = jets[j].pages.map((p) => `<option value="${p}">${PAGE_NAMES[p] || p}</option>`).join('');
  $('screenHint').textContent = j === 'smt' ? 'A new display showing one of the SMT pages: any size, any outline.' : 'The MiG-29 (9.12) has no plugin pages: only the tactical display (experimental).';
  renderBuiltins(); updateBuiltinTint(); renderAll(); setDirty(false);
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
    const r = await api(`/api/save?jet=${jet}`, { custom, images, layout: layoutOut() });
    setDirty(false);
    const x = r.export, moved = Object.keys(layoutOut().groups).length;
    toast(`Saved: ${moved} instrument${moved === 1 ? '' : 's'} changed, ${x.decals} decal${x.decals === 1 ? '' : 's'}, ${x.screens} screen${x.screens === 1 ? '' : 's'}`);
    return true;
  } catch (err) { toast('Save failed: ' + err.message, 6000); return false; }
}

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

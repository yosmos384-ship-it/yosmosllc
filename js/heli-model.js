// heli-model.js — V13 HELI: an ORIGINAL light-twin executive helicopter (exterior + VIP interior + glass cockpit).
// Generic modern civil design: smooth lofted fuselage with a wrap-around windshield under a curved roof header, chin
// windows, crew doors, sliding cabin doors with privacy-tinted windows, a lofted engine cowling with twin canted
// exhausts, 5-blade main rotor with aerofoil blades (motion-blur disc at speed), 4-blade tail rotor on the left, swept
// fin, stabiliser with end plates, skid gear. Deep-navy / champagne-gold livery with a fictional "Eakin Air" script
// and a fictional-format registration. No real manufacturer, operator, logo, registration or TV-show design.
//
// Local frame: metres, nose toward −z, +x = right (starboard), y = up, ground (skid bottoms) at y = 0, main-rotor
// mast at z = −0.15. Place with group.rotation.y = −heading (heading 0 = north = −z, clockwise).
//
//   buildHeli(THREE, { quality, envMap, interior: true }) → {
//     group, ext, intr, parts, rotor, tail, M, displays { canvas, texture, mesh, panel },
//     seats { pilot, copilot (seat cushion top centre), passenger, passenger2 (eye points) },
//     setRotor(rpm01, dt), setLights(t, night01), setControls({pitch, roll, col, yaw}),
//     setDetail('full'|'exterior'|'interior'), stats(), state }
//   parts: cyclic[] (pilot first), collective (pilot), collectives[], pedals[] (pilot L, R, copilot L, R), FLOOR, …
// No side effects on import.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
let RB_LOW = false; // low quality: fewer rounding segments on every rounded box
const RBG = (w, h, d, seg = 2, r = 0.1) => new RoundedBoxGeometry(w, h, d, RB_LOW ? Math.min(seg, 1) : seg, r);
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './heli-tex.js';

const TAU = Math.PI * 2;
const spow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ------------------------------------------------------------------------------------------- merge kit */
// Like limo-util's Merger (one merged mesh per material) but keeps / generates per-vertex colours.
export class Kit {
  constructor(THREE) { this.THREE = THREE; this.parts = new Map(); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); }
  // add(key, geo, { pos, rot, scale, matrix, pre: Matrix4 (applied after the local transform), color, keepColor, colorFn(x,y,z)→[r,g,b] })
  add(key, geo, o = {}) {
    const THREE = this.THREE;
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (o.matrix) g.applyMatrix4(o.matrix);
    else {
      this._p.set(...(o.pos || [0, 0, 0])); this._e.set(...(o.rot || [0, 0, 0]), o.order || 'XYZ'); this._q.setFromEuler(this._e);
      const s = o.scale == null ? [1, 1, 1] : typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : o.scale;
      this._s.set(...s); this._m.compose(this._p, this._q, this._s); g.applyMatrix4(this._m);
    }
    if (o.pre) g.applyMatrix4(o.pre);
    const keep = o.keepColor && g.attributes.color;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && !(keep && k === 'color')) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!keep) {
      const c = new THREE.Color(o.color == null ? 0xffffff : o.color), col = new Float32Array(n * 3), p = g.attributes.position;
      for (let i = 0; i < n; i++) {
        if (o.colorFn) { const r = o.colorFn(p.getX(i), p.getY(i), p.getZ(i), i); col[i * 3] = r[0]; col[i * 3 + 1] = r[1]; col[i * 3 + 2] = r[2]; }
        else { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    return this;
  }
  build(mats, parent, opts = {}) {
    const byMat = new Map();
    for (const [key, list] of this.parts) { if (!list.length) continue; const mat = mats[key] || mats.default; if (!mat) continue; if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(...list); }
    const out = [];
    for (const [mat, list] of byMat) {
      let g = null;
      try { g = list.length === 1 ? list[0] : mergeGeometries(list, false); } catch (e) { console.warn('[heli] merge', e); }
      if (!g) continue;
      g.computeBoundingSphere(); g.computeBoundingBox();
      const m = new this.THREE.Mesh(g, mat);
      m.name = 'heli:' + (mat.name || 'part'); m.castShadow = !!opts.castShadow; m.receiveShadow = !!opts.receiveShadow; m.matrixAutoUpdate = !!opts.autoUpdate;
      m.updateMatrix();
      if (parent) parent.add(m);
      out.push(m);
    }
    this.parts.clear();
    return out;
  }
}

/* ------------------------------------------------------------------------------------------- fuselage loft */
// control sections: z, half width, belly y, top y, top exponent, bottom exponent (superellipse)
const SECTIONS = [
  [-4.34, 0.05, 1.07, 1.15, 2.0, 2.0],
  [-4.24, 0.30, 0.90, 1.34, 2.1, 2.2],
  [-4.04, 0.52, 0.76, 1.53, 2.2, 2.4],
  [-3.72, 0.68, 0.66, 1.71, 2.3, 2.6],
  [-3.26, 0.79, 0.60, 1.89, 2.4, 2.9],
  [-2.70, 0.84, 0.58, 2.03, 2.5, 3.1],
  [-2.10, 0.86, 0.57, 2.11, 2.6, 3.2],
  [-1.00, 0.86, 0.57, 2.14, 2.7, 3.3],
  [0.20, 0.85, 0.58, 2.13, 2.7, 3.3],
  [0.80, 0.81, 0.64, 2.09, 2.6, 3.1],
  [1.35, 0.68, 0.80, 2.01, 2.4, 2.8],
  [1.85, 0.48, 1.02, 1.89, 2.2, 2.4],
  [2.30, 0.33, 1.20, 1.79, 2.1, 2.1],
  [2.55, 0.28, 1.26, 1.75, 2.0, 2.0],
];
export const HELI = { zNose: -4.34, zTail: 6.95, mastZ: -0.15, hubY: 2.90, R: 5.15, tailR: 0.92, tailRotor: [-0.2, 2.30, 6.55], length: 11.3, rotorD: 10.3 };
const Z0 = SECTIONS[0][0], Z1 = SECTIONS[SECTIONS.length - 1][0];
const zToU = (z) => (z - Z0) / (Z1 - Z0) * TX.LIVERY.LOFT_U;
function cr(p0, p1, p2, p3, t) { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
function denseSections(step = 0.075, S = SECTIONS) {
  const out = [], n = S.length;
  for (let i = 0; i < n - 1; i++) {
    const P = (k) => S[clamp(k, 0, n - 1)];
    const L = S[i + 1][0] - S[i][0];
    const m = Math.max(1, Math.ceil(L / step));
    for (let s = 0; s < m; s++) {
      const t = s / m, r = [];
      for (let k = 0; k < 6; k++) r.push(cr(P(i - 1)[k], P(i)[k], P(i + 1)[k], P(i + 2)[k], t));
      out.push(r);
    }
  }
  out.push(S[n - 1].slice());
  return out;
}
const FINE = denseSections(0.02);
function secAt(z) {
  if (z <= FINE[0][0]) return FINE[0].slice();
  let i = 0; while (i < FINE.length - 2 && FINE[i + 1][0] < z) i++;
  const a = FINE[i], b = FINE[i + 1], t = clamp((z - a[0]) / ((b[0] - a[0]) || 1), 0, 1);
  return a.map((v, k) => v + (b[k] - v) * t);
}
function secPoint(s, a) { // s = [z, w, yB, yT, nT, nB]; a: angle (0 = right mid, π/2 = top)
  const [, w, yB, yT, nT, nB] = s;
  const c = Math.cos(a), sn = Math.sin(a), n = sn >= 0 ? nT : nB;
  const yc = (yB + yT) / 2, hh = (yT - yB) / 2;
  return [w * spow(c, 2 / n), yc + hh * spow(sn, 2 / n)];
}
// inner half width of the fuselage at (z, y) (inset = lining thickness); 0 outside the section
export function halfWidth(z, y, inset = 0) {
  const s = secAt(z); const w = s[1] - inset, yB = s[2] + inset, yT = s[3] - inset;
  if (w <= 0 || yT <= yB) return 0;
  const yc = (yB + yT) / 2, hh = (yT - yB) / 2, t = (y - yc) / hh;
  if (Math.abs(t) >= 1) return 0;
  const n = t >= 0 ? s[4] : s[5], sa = Math.pow(Math.abs(t), n / 2), ca = Math.sqrt(Math.max(0, 1 - sa * sa));
  return w * Math.pow(ca, 2 / n);
}
// inner roof height at (z, x)
export function roofAt(z, x, inset = 0) {
  const s = secAt(z); const w = s[1] - inset, yB = s[2] + inset, yT = s[3] - inset;
  const yc = (yB + yT) / 2, hh = (yT - yB) / 2, n = s[4];
  const ca = Math.pow(clamp(Math.abs(x) / Math.max(1e-3, w), 0, 1), n / 2), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  return yc + hh * Math.pow(sa, 2 / n);
}
// window map in (z, x, y) — true where the skin is glazing
function rr(z, y, z0, z1, y0, y1, r) { const cz = clamp(z, z0 + r, z1 - r), cy = clamp(y, y0 + r, y1 - r); return Math.hypot(z - cz, y - cy) <= r; }
const headerZ = (x) => -2.80 + 0.6 * x * x; // windshield top edge in plan (curved roof header, above the crew's eyes)
export function glassAt(z, x, y) {
  const ax = Math.abs(x);
  // windshield: wrap-around, slim centre post, curved header (solid roof over the crew from headerZ aft)
  if (z > -4.06 && z < -2.62) {
    const yLow = 1.29 + 0.07 * (z + 4.06) / 1.44;
    if (y > yLow && ax > 0.028 && !(y > 1.86 && z > headerZ(ax))) return true;
  }
  // chin windows
  if (ax > 0.1 && ax < 0.66 && rr(z, y, -3.93, -3.18, 0.72, 1.17, 0.12)) return y < 1.17;
  if (ax > 0.5) {
    if (rr(z, y, -2.42, -1.50, 1.17, 1.95, 0.15)) return true;   // crew door window
    if (rr(z, y, -1.24, -0.42, 1.19, 1.87, 0.14)) return true;   // cabin windows (sliding door)
    if (rr(z, y, -0.30, 0.50, 1.19, 1.87, 0.14)) return true;
  }
  return false;
}
function trimAt(z, x, y) {
  if (glassAt(z, x, y)) return false;
  const d = 0.05;
  for (const [dz, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]]) if (glassAt(z + dz, x, y + dy)) return true;
  if (z > -4.06 && z < -2.55 && Math.abs(x) <= 0.028 && y > 1.30) return true; // centre post
  return false;
}
// window masks in loft UV space: alpha (white = skin, black = glazing) and trim (dark seals around every window)
export function windowMasks(W = 1024, H = 512) {
  if (typeof document === 'undefined') return null;
  const secs = denseSections(0.02), LU = TX.LIVERY.LOFT_U;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; try { c.getContext('2d', { willReadFrequently: true }); } catch (_) {} return c; };
  const ca = mk(), ct = mk();
  const ga = ca.getContext('2d'), gt = ct.getContext('2d');
  const ia = ga.createImageData(W, H), it = gt.createImageData(W, H);
  // 1) glazing per texel; 2) seals = glazing dilated by ~5 cm (separable max in texel space) minus the glazing
  const G = new Uint8Array(W * H), POST = new Uint8Array(W * H);
  for (let px = 0; px < W; px++) {
    const u = (px + 0.5) / W; if (u > LU) continue;
    const z = Z0 + (u / LU) * (Z1 - Z0);
    let si = 0; while (si < secs.length - 2 && secs[si + 1][0] < z) si++;
    const s0 = secs[si], s1 = secs[si + 1], t = clamp((z - s0[0]) / ((s1[0] - s0[0]) || 1), 0, 1);
    const sec = s0.map((v, k) => v + (s1[k] - v) * t);
    for (let py = 0; py < H; py++) {
      const ang = -Math.PI / 2 + (1 - (py + 0.5) / H) * TAU;
      const [x, y] = secPoint(sec, ang);
      if (glassAt(z, x, y)) G[py * W + px] = 1;
      else if (z > -4.06 && z < -2.55 && Math.abs(x) <= 0.028 && y > 1.30) POST[py * W + px] = 1;
    }
  }
  const ru = Math.max(1, Math.round(0.05 / ((Z1 - Z0) / (LU * W)))), rv = Math.max(1, Math.round(H * 0.05 / 4.6));
  const Hd = new Uint8Array(W * H);
  for (let py = 0; py < H; py++) { const row = py * W; for (let px = 0; px < W; px++) { let m = 0; for (let k = Math.max(0, px - ru); k <= Math.min(W - 1, px + ru) && !m; k++) m = G[row + k]; Hd[row + px] = m; } }
  for (let px = 0; px < W; px++) for (let py = 0; py < H; py++) {
    const k = (py * W + px) * 4, gl = G[py * W + px];
    let d = 0; for (let j = -rv; j <= rv && !d; j++) d = Hd[((py + j + H) % H) * W + px];
    const tr = !gl && (d || POST[py * W + px]);
    const A = gl ? 0 : 255;
    ia.data[k] = ia.data[k + 1] = ia.data[k + 2] = A; ia.data[k + 3] = 255;
    it.data[k] = it.data[k + 1] = it.data[k + 2] = 10; it.data[k + 3] = tr ? 255 : 0;
  }
  ga.putImageData(ia, 0, 0); gt.putImageData(it, 0, 0);
  const soft = (src, px) => { const c = mk(), g = c.getContext('2d'); if ('filter' in g) g.filter = `blur(${px}px)`; g.drawImage(src, 0, 0); return c; };
  return { alpha: soft(ca, 1.3), trim: soft(ct, 1.3), reveal: soft(ct, 3) };
}
function buildLoft(THREE, o = {}) {
  const secs = denseSections(o.step || 0.075, o.sections || SECTIONS);
  const nA = o.nA || 64, inset = o.inset || 0, inner = !!o.inner;
  const NS = secs.length, cols = nA + 1;
  const pos = new Float32Array(NS * cols * 3 + 6), uv = new Float32Array(NS * cols * 2 + 4);
  const uOf = o.uOf || zToU;
  for (let i = 0; i < NS; i++) {
    const s = secs[i].slice();
    if (inset) { s[1] = Math.max(0.02, s[1] - inset); s[2] += inset; s[3] -= inset; }
    for (let j = 0; j < cols; j++) {
      const a = -Math.PI / 2 + (j / nA) * TAU;
      const [x, y] = secPoint(s, a);
      const k = i * cols + j;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = s[0];
      uv[k * 2] = uOf(s[0]); uv[k * 2 + 1] = j / nA;
    }
  }
  const idx = [];
  for (let i = 0; i < NS - 1; i++) for (let j = 0; j < nA; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    if (inner) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  // end caps (fans): nose always; tail when o.capEnd
  const tip = NS * cols;
  pos[tip * 3] = 0; pos[tip * 3 + 1] = (secs[0][2] + secs[0][3]) / 2; pos[tip * 3 + 2] = secs[0][0] - (o.noseBulge != null ? o.noseBulge : 0.035);
  uv[tip * 2] = uOf(secs[0][0]); uv[tip * 2 + 1] = 0.5;
  for (let j = 0; j < nA; j++) { if (inner) idx.push(tip, j, j + 1); else idx.push(tip, j + 1, j); }
  const last = secs[NS - 1], tip2 = tip + 1;
  pos[tip2 * 3] = 0; pos[tip2 * 3 + 1] = (last[2] + last[3]) / 2; pos[tip2 * 3 + 2] = last[0] + (o.tailBulge || 0);
  uv[tip2 * 2] = uOf(last[0]); uv[tip2 * 2 + 1] = 0.5;
  if (o.capEnd) { const b0 = (NS - 1) * cols; for (let j = 0; j < nA; j++) { if (inner) idx.push(tip2, b0 + j + 1, b0 + j); else idx.push(tip2, b0 + j, b0 + j + 1); } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// planar fan cap of the inner section at z (bulkhead), facing −z
function sectionCap(THREE, z, inset, nA = 48) {
  const s = secAt(z); s[1] -= inset; s[2] += inset; s[3] -= inset;
  const pts = []; for (let j = 0; j < nA; j++) pts.push(secPoint(s, -Math.PI / 2 + (j / nA) * TAU));
  const pos = [], uv = [], yc = (s[2] + s[3]) / 2;
  for (let j = 0; j < nA; j++) {
    const [x0, y0] = pts[j], [x1, y1] = pts[(j + 1) % nA];
    pos.push(0, yc, z, x1, y1, z, x0, y0, z);
    uv.push(0.5, 0.5, 0.5 + x1 / (2 * s[1]), (y1 - s[2]) / (s[3] - s[2]), 0.5 + x0 / (2 * s[1]), (y0 - s[2]) / (s[3] - s[2]));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------------------------------- helpers */
const V3 = (THREE, a) => new THREE.Vector3(a[0], a[1], a[2]);
function plainUV(g, uvp) { const uv = g.attributes.uv; if (!uv) return g; for (let i = 0; i < uv.count; i++) uv.setXY(i, uvp[0], uvp[1]); return g; }
function tube(THREE, pts, r, seg = 48, rs = 10) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V3(THREE, p))), seg, r, rs, false); }
function extrudeZY(THREE, pts, depth, bevel = 0.02, x = 0) { // shape in (z, y), extruded along x, centred on x
  const sh = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y))); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 12 });
  g.rotateY(-Math.PI / 2); g.translate(depth / 2 + x, 0, 0);
  return g;
}
// matrix placing a +Y-axis primitive (centred) between points a and b
function segM(THREE, a, b) {
  const A = V3(THREE, a), B = V3(THREE, b), d = B.clone().sub(A), L = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.multiplyScalar(1 / (L || 1)));
  return { m: new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), L };
}
function rodBetween(THREE, a, b, r, seg = 8) { const { m, L } = segM(THREE, a, b); const g = new THREE.CylinderGeometry(r, r, L, seg); g.applyMatrix4(m); return g; }
// rectangle plane with UVs mapped to an atlas rect [u0, v0, u1, v1]
function atlasPlane(THREE, w, h, rect) { const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + (rect[2] - rect[0]) * uv.getX(i), rect[1] + (rect[3] - rect[1]) * uv.getY(i)); return g; }
const hex = (c) => { const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255; return [r, g, b].map((v) => Math.pow(v, 2.2)); };
// aerofoil blade (span along +x from r0 to r1, leading edge toward −z), vertex-coloured (graphite, nickel LE strip, gold tip)
function bladeGeo(THREE, r0, r1, chord, thick, segS = 18, segC = 10) {
  const prof = [];
  const yt = (x) => 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  for (let i = segC; i >= 0; i--) { const x = 0.5 - 0.5 * Math.cos(Math.PI * i / segC); prof.push([x, yt(x)]); }
  for (let i = 1; i < segC; i++) { const x = 0.5 - 0.5 * Math.cos(Math.PI * i / segC); prof.push([x, -yt(x)]); }
  const P = prof.length, rings = segS + 1;
  const pos = [], col = [], uv = [], idx = [];
  const cG = hex(0x262a30), cL = hex(0x9097a0), cT = hex(0xd8c690), cW = hex(0xe8e8e2);
  for (let s = 0; s < rings; s++) {
    const t = s / segS, R = r0 + (r1 - r0) * t;
    const tipK = clamp((t - 0.9) / 0.1, 0, 1);
    const c = chord * (1 - 0.38 * tipK * tipK), sweep = 0.10 * chord * tipK * tipK;
    const tw = 0.14 * (1 - t) - 0.02, ct = Math.cos(tw), st = Math.sin(tw);
    const droop = -0.010 * t * t * 4;
    for (let k = 0; k < P; k++) {
      const [px, py] = prof[k];
      let z = (px - 0.25) * c + sweep, y = py * c * (1 - 0.3 * tipK);
      const z2 = z * ct - y * st, y2 = z * st + y * ct;
      pos.push(R, y2 + droop, z2);
      const le = px < 0.07, band = t > 0.93 && t < 0.975, w = t > 0.975;
      const cc = band ? cT : w ? cW : le ? cL : cG;
      col.push(...cc); uv.push(t, k / P);
    }
  }
  for (let s = 0; s < segS; s++) for (let k = 0; k < P; k++) { const a = s * P + k, b = s * P + (k + 1) % P, c = a + P, d = b + P; idx.push(a, c, b, b, c, d); }
  // tip cap
  const base = segS * P; for (let k = 1; k < P - 1; k++) idx.push(base, base + k + 1, base + k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------------------------------- build */
export function buildHeli(THREE, o = {}) {
  const hi = (o.quality || 'high') !== 'low';
  const env = o.envMap || null;
  const group = new THREE.Group(); group.name = 'heli';
  RB_LOW = !hi;
  const ext = new THREE.Group(); ext.name = 'heli:exterior'; group.add(ext);
  const intr = new THREE.Group(); intr.name = 'heli:interior'; group.add(intr);
  const parts = {};
  /* ---------------- materials */
  const masks = windowMasks(hi ? 1024 : 768, hi ? 512 : 384);
  const livery = TX.liveryTexture(THREE, { zToU, w: hi ? 2048 : 1024, h: hi ? 1024 : 512, trim: masks && masks.trim });
  let alphaTex = null;
  if (masks) { alphaTex = new THREE.CanvasTexture(masks.alpha); alphaTex.wrapT = THREE.RepeatWrapping; alphaTex.minFilter = THREE.LinearFilter; alphaTex.generateMipmaps = false; }
  if (livery) { livery.wrapT = THREE.RepeatWrapping; livery.wrapS = THREE.ClampToEdgeWrapping; }
  const tint = TX.glassTintTexture(THREE, { zToU }); if (tint) { tint.wrapT = THREE.RepeatWrapping; }
  const paintP = { map: livery, color: 0xffffff, metalness: 0.45, roughness: 0.26, clearcoat: 1.0, clearcoatRoughness: 0.03, envMap: env, envMapIntensity: 1.7 };
  const M = {
    paint: new THREE.MeshPhysicalMaterial(paintP),
    skin: new THREE.MeshPhysicalMaterial(Object.assign({}, paintP, { alphaMap: alphaTex, alphaTest: 0.5, side: THREE.FrontSide })),
    glass: new THREE.MeshPhysicalMaterial({ map: tint, color: 0xffffff, metalness: 0.0, roughness: 0.03, transparent: true, opacity: 1, envMap: env, envMapIntensity: 1.8, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 1.0, envMap: env, vertexColors: true }),
    dark: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.35, envMap: env, vertexColors: true }),
    blade: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.35, vertexColors: true, transparent: true, opacity: 1, envMap: env }),
    navR: new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2010, emissiveIntensity: 2.5 }),
    navG: new THREE.MeshStandardMaterial({ color: 0x003a10, emissive: 0x20ff60, emissiveIntensity: 2.5 }),
    navW: new THREE.MeshStandardMaterial({ color: 0x404040, emissive: 0xffffff, emissiveIntensity: 2.0 }),
    land: new THREE.MeshPhysicalMaterial({ color: 0xdfe6ee, emissive: 0xfff3dc, emissiveIntensity: 0.0, roughness: 0.05, metalness: 0.2, clearcoat: 1, envMap: env }),
    beacon: new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1a08, emissiveIntensity: 0.2 }),
    strobe: new THREE.MeshStandardMaterial({ color: 0x404040, emissive: 0xffffff, emissiveIntensity: 0.0 }),
  };
  for (const k of Object.keys(M)) M[k].name = k;
  const blurTex = TX.blurDiscTexture(THREE, { blades: 5 });
  const blurM = new THREE.MeshBasicMaterial({ map: blurTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const tblurM = new THREE.MeshBasicMaterial({ map: TX.blurDiscTexture(THREE, { blades: 4, hub: 0.12, tip: 'rgba(240,240,240,0.5)' }), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  M.blur = blurM; M.tblur = tblurM;
  parts.M = M;

  /* ---------------- fuselage skin + glazing */
  const nA = hi ? 96 : 56, step = hi ? 0.05 : 0.09;
  const loft = new THREE.Mesh(buildLoft(THREE, { nA, step }), M.skin);
  loft.name = 'heli:fuselage'; loft.castShadow = true; loft.receiveShadow = true;
  ext.add(loft); parts.fuselage = loft;
  const glass = new THREE.Mesh(buildLoft(THREE, { nA, step, inset: 0.004 }), M.glass);
  glass.name = 'heli:glazing'; glass.renderOrder = 2; glass.castShadow = false; ext.add(glass); parts.glazing = glass;
  parts.alphaTex = alphaTex;

  /* ---------------- painted parts: boom, cowling, fin, stabiliser */
  const PK = new Kit(THREE);
  const PL = TX.LIVERY.PLAIN;
  {
    const L = 4.25, zA = 2.15, yA = 1.50, yB = 1.86;
    const g = new THREE.CylinderGeometry(0.135, 0.31, L, hi ? 40 : 24, 10, true);
    g.rotateX(Math.PI / 2); g.translate(0, 0, zA + L / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i), t = (z - zA) / L, yc = yA + (yB - yA) * t;
      p.setY(i, p.getY(i) + yc);
      let a = Math.atan2(p.getY(i) - yc, p.getX(i)); if (a < -Math.PI / 2 - 1e-6) a += TAU;
      uv.setXY(i, TX.LIVERY.BOOM_U0 + t * (1 - TX.LIVERY.BOOM_U0) * 0.98, (a + Math.PI / 2) / TAU);
    }
    g.computeVertexNormals();
    PK.add('paint', g, { keepColor: false });
    PK.add('dark', new THREE.TorusGeometry(0.31, 0.03, 8, 32), { pos: [0, yA, zA + 0.04], color: 0x14161a });
    PK.add('dark', new THREE.CylinderGeometry(0.14, 0.135, 0.06, 24), { pos: [0, yB - 0.005, zA + L + 0.02], rot: [Math.PI / 2, 0, 0], color: 0x1a1c20 });
  }
  // engine cowling: lofted superellipse (side walls meet the cabin roof; tucked lower half hidden inside)
  {
    const fTop = (z) => secAt(Math.min(z, 2.55))[3];
    const C = [[-1.22, 0.05, 2.11, 2.2, 2.2], [-1.10, 0.26, 2.24, 2.6, 2.4], [-0.92, 0.40, 2.34, 3.0, 2.6], [-0.60, 0.47, 2.42, 3.2, 2.8], [-0.10, 0.50, 2.46, 3.4, 3.0], [0.70, 0.51, 2.47, 3.4, 3.0], [1.30, 0.48, 2.43, 3.2, 2.8], [1.80, 0.40, 2.33, 3.0, 2.6], [2.15, 0.28, 2.18, 2.6, 2.4], [2.42, 0.12, 2.01, 2.2, 2.2], [2.52, 0.03, 1.95, 2, 2]]
      .map(([z, w, yT, nT, nB]) => [z, w, fTop(z) - 0.42, yT, nT, nB]);
    const cg = buildLoft(THREE, { sections: C, nA: hi ? 48 : 28, step: hi ? 0.06 : 0.12, noseBulge: 0.02, capEnd: true, tailBulge: 0.02 });
    PK.add('paint', plainUV(cg, PL));
    // inlet grilles (both sides): dark recessed plates with slats + a polished lip
    for (const s of [-1, 1]) {
      const x = s * (halfWidthCowl(C, -0.48, 2.24) + 0.004);
      PK.add('dark', RBG(0.02, 0.17, 0.50, 2, 0.008), { pos: [x, 2.24, -0.48], color: 0x0a0b0d });
      for (let k = 0; k < 6; k++) PK.add('dark', new THREE.BoxGeometry(0.012, 0.012, 0.46), { pos: [x + s * 0.008, 2.175 + k * 0.026, -0.48], color: 0x2a2d33 });
      // exhaust: canted oval pipe with a darker heat-stained lip
      const base = [s * 0.30, 2.18, 1.84], dir = new THREE.Vector3(s * 0.75, 0.42, 1).normalize();
      const tip = [base[0] + dir.x * 0.24, base[1] + dir.y * 0.24, base[2] + dir.z * 0.24];
      const ex = new THREE.CylinderGeometry(0.125, 0.14, 0.24, 20, 1, true); ex.scale(1, 1, 0.78);
      PK.add('dark', ex, { matrix: segM(THREE, base, tip).m, color: 0x4a423a });
      const lip = new THREE.TorusGeometry(0.122, 0.012, 6, 20); lip.rotateX(Math.PI / 2); lip.scale(1, 1, 0.78);
      PK.add('dark', lip, { matrix: segM(THREE, tip, [tip[0] + dir.x * 0.01, tip[1] + dir.y * 0.01, tip[2] + dir.z * 0.01]).m, color: 0x2a221c });
      const inn = new THREE.CircleGeometry(0.115, 18); inn.rotateX(-Math.PI / 2); inn.scale(1, 1, 0.78);
      PK.add('dark', inn, { matrix: segM(THREE, [tip[0] - dir.x * 0.05, tip[1] - dir.y * 0.05, tip[2] - dir.z * 0.05], tip).m, color: 0x050505 });
      parts['exhaust' + (s < 0 ? 'L' : 'R')] = { tip: new THREE.Vector3(...tip), dir };
    }
    // mast fairing (aerodynamic "doghouse" cap around the mast)
    const mast = new THREE.LatheGeometry([[0.001, 2.40], [0.30, 2.40], [0.29, 2.50], [0.24, 2.62], [0.17, 2.74], [0.12, 2.80], [0.001, 2.80]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
    PK.add('paint', plainUV(mast, PL), { pos: [0, 0, HELI.mastZ] });
  }
  // vertical fin (upper + ventral), stabiliser with end plates, tail skid
  {
    const fin = extrudeZY(THREE, [[5.92, 1.86], [6.52, 1.84], [6.92, 2.98], [6.60, 3.00], [6.14, 2.02]], 0.07, 0.025);
    PK.add('paint', plainUV(fin, PL));
    const ven = extrudeZY(THREE, [[6.18, 1.66], [6.62, 1.66], [6.80, 1.10], [6.58, 1.08]], 0.06, 0.02);
    PK.add('paint', plainUV(ven, PL));
    PK.add('metal', tube(THREE, [[0, 1.12, 6.62], [0, 1.02, 6.70], [0, 0.99, 6.85]], 0.016, 10, 6), { color: 0xb8bcc2 });
    const stab = RBG(2.62, 0.055, 0.44, 2, 0.02); PK.add('paint', plainUV(stab, PL), { pos: [0, 1.76, 5.28] });
    for (const s of [-1, 1]) { const ep = extrudeZY(THREE, [[5.05, 1.56], [5.52, 1.54], [5.62, 2.08], [5.30, 2.10]], 0.04, 0.015, s * 1.33); PK.add('paint', plainUV(ep, PL)); }
    const gb = new THREE.SphereGeometry(0.16, 18, 12); gb.scale(1.1, 0.9, 1.4); PK.add('paint', plainUV(gb, PL), { pos: [-0.04, 2.30, 6.58] });
    // antennas / probes
    for (const s of [-1, 1]) PK.add('metal', new THREE.CylinderGeometry(0.007, 0.012, 0.34, 8), { pos: [s * 0.16, 1.05, -4.30], rot: [Math.PI / 2, 0, 0], color: 0xd0d4da });
    PK.add('dark', new THREE.BoxGeometry(0.018, 0.20, 0.28), { pos: [0, 2.16, 0.98], rot: [-0.32, 0, 0], color: 0x1a1c20 }); // top VHF blade
    PK.add('dark', new THREE.BoxGeometry(0.016, 0.14, 0.20), { pos: [0, 0.54, 0.40], rot: [0.35, 0, 0], color: 0x1a1c20 });  // belly blades
    PK.add('dark', new THREE.BoxGeometry(0.016, 0.12, 0.16), { pos: [0, 0.60, -2.40], rot: [0.35, 0, 0], color: 0x1a1c20 });
    PK.add('dark', new THREE.CylinderGeometry(0.035, 0.05, 0.03, 16), { pos: [0, 0.62, -1.10], color: 0x1a1c20 }); // GPS puck (belly)
  }
  // skids + cross tubes + steps
  {
    for (const s of [-1, 1]) {
      const x = s * 1.08;
      PK.add('metal', tube(THREE, [[x, 0.36, -3.22], [x, 0.17, -3.0], [x, 0.045, -2.68], [x, 0.045, -0.5], [x, 0.045, 1.55], [x, 0.07, 1.85]], 0.048, 44, 14), { color: 0xc8ccd2 });
      PK.add('dark', new THREE.SphereGeometry(0.048, 12, 8), { pos: [x, 0.07, 1.85], color: 0x20232a });
      PK.add('dark', RBG(0.05, 0.02, 1.4, 2, 0.008), { pos: [x, 0.004, -1.0], color: 0x3a3c40 }); // wear shoe
      PK.add('dark', RBG(0.36, 0.03, 0.18, 2, 0.01), { pos: [s * 0.90, 0.38, -1.62], color: 0x24272d });
      PK.add('dark', RBG(0.36, 0.03, 0.18, 2, 0.01), { pos: [s * 0.90, 0.38, 0.78], color: 0x24272d });
      // fairing cuffs where the cross tubes enter the belly
      for (const z of [-1.62, 0.78]) PK.add('paint', plainUV(new THREE.SphereGeometry(0.09, 14, 10), PL), { pos: [s * 0.58, 0.63, z], scale: [1.4, 0.7, 1.2] });
    }
    for (const z of [-1.62, 0.78]) PK.add('metal', tube(THREE, [[-1.08, 0.05, z], [-1.0, 0.36, z], [-0.72, 0.60, z], [0, 0.64, z], [0.72, 0.60, z], [1.0, 0.36, z], [1.08, 0.05, z]], 0.045, 44, 12), { color: 0xc8ccd2 });
  }
  // lights
  const LK = new Kit(THREE);
  {
    const s = new THREE.SphereGeometry(0.045, 12, 8);
    LK.add('navR', s, { pos: [-1.36, 1.80, 5.30] }); LK.add('navG', s, { pos: [1.36, 1.80, 5.30] });
    LK.add('navW', s, { pos: [0, 1.95, 6.96] });
    const bc = new THREE.CylinderGeometry(0.05, 0.06, 0.09, 14);
    LK.add('beacon', bc, { pos: [0, 3.03, 6.76] }); LK.add('beacon', bc, { pos: [0, 0.53, -0.4] });
    LK.add('strobe', s, { pos: [-1.36, 1.86, 5.42], scale: 0.6 }); LK.add('strobe', s, { pos: [1.36, 1.86, 5.42], scale: 0.6 });
    // landing / taxi light: domed lens in a dark bezel under the nose
    const lens = new THREE.SphereGeometry(0.085, 20, 10, 0, TAU, 0, Math.PI / 2); lens.scale(1, 0.35, 1);
    LK.add('land', lens, { pos: [0, 0.665, -3.62], rot: [Math.PI + 0.35, 0, 0] });
    LK.add('land', lens, { pos: [0, 0.60, -3.05], rot: [Math.PI + 0.15, 0, 0], scale: 0.8 });
  }
  for (const m of PK.build({ paint: M.paint, dark: M.dark, metal: M.metal }, ext, { castShadow: true, receiveShadow: true })) m.name = 'heli:' + m.material.name;
  parts.lights = LK.build({ navR: M.navR, navG: M.navG, navW: M.navW, beacon: M.beacon, strobe: M.strobe, land: M.land }, ext);
  // fin decal (fictional "Eakin Air" script) on both sides of the fin
  {
    const dt = TX.finDecal(THREE);
    if (dt) {
      const dm = new THREE.MeshStandardMaterial({ map: dt, transparent: true, metalness: 0.6, roughness: 0.3, envMap: env, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const DK = new Kit(THREE);
      for (const s of [-1, 1]) DK.add('d', new THREE.PlaneGeometry(0.78, 0.39), { pos: [s * 0.068, 2.38, 6.42], rot: [0, s * Math.PI / 2, 0.0] });
      const [m] = DK.build({ d: dm }, ext); if (m) { m.name = 'heli:decal'; m.renderOrder = 2; }
    }
  }

  /* ---------------- main rotor */
  const rotor = new THREE.Group(); rotor.name = 'heli:rotor'; rotor.position.set(0, HELI.hubY, HELI.mastZ); ext.add(rotor);
  {
    const RK = new Kit(THREE);
    const NB = 5;
    RK.add('metal', new THREE.CylinderGeometry(0.075, 0.085, 0.36, 16), { pos: [0, -0.20, 0], color: 0x9aa0a8 });              // mast
    RK.add('metal', new THREE.CylinderGeometry(0.20, 0.21, 0.035, 28), { pos: [0, -0.21, 0], color: 0x8a9098 });              // swashplate lower
    RK.add('metal', new THREE.CylinderGeometry(0.175, 0.19, 0.035, 28), { pos: [0, -0.17, 0], color: 0xb0b5bc });             // swashplate upper
    RK.add('metal', new THREE.CylinderGeometry(0.17, 0.22, 0.10, 5), { pos: [0, 0, 0], rot: [0, Math.PI / 5, 0], color: 0x7f858d }); // hub star
    RK.add('metal', new THREE.SphereGeometry(0.16, 22, 10, 0, TAU, 0, Math.PI / 2), { pos: [0, 0.05, 0], scale: [1, 0.7, 1], color: 0x8d9299 }); // dome
    RK.add('dark', new THREE.CylinderGeometry(0.035, 0.035, 0.06, 12), { pos: [0, 0.14, 0], color: 0x15171a });
    const blades = [];
    for (let b = 0; b < NB; b++) {
      const a = (b / NB) * TAU, mtx = new THREE.Matrix4().makeRotationY(a);
      const cuff = RBG(0.46, 0.075, 0.17, 2, 0.02); cuff.translate(0.43, 0.0, 0); cuff.applyMatrix4(mtx); RK.add('metal', cuff, { color: 0x7c828a });
      const horn = new THREE.BoxGeometry(0.06, 0.025, 0.09); horn.translate(0.30, -0.03, -0.10); horn.applyMatrix4(mtx); RK.add('metal', horn, { color: 0x9aa0a8 });
      const link = rodBetween(THREE, [0.30, -0.04, -0.12], [0.185, -0.155, -0.10], 0.011, 6); link.applyMatrix4(mtx); RK.add('metal', link, { color: 0xc8ccd2 });
      const damper = rodBetween(THREE, [0.14, 0.03, 0.06], [0.42, 0.02, 0.07], 0.022, 10); damper.applyMatrix4(mtx); RK.add('dark', damper, { color: 0x2a2c31 });
      const bg = bladeGeo(THREE, 0.62, HELI.R, 0.30, 0.12, hi ? 22 : 12, hi ? 10 : 6); bg.applyMatrix4(mtx); blades.push(bg);
    }
    for (const bg of blades) RK.add('blade', bg, { keepColor: true });
    const rm = RK.build({ metal: M.metal, dark: M.dark, blade: M.blade }, rotor, { castShadow: true, autoUpdate: false });
    parts.rotorMeshes = rm;
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.32, HELI.R + 0.02, 96, 1), blurM);
    disc.rotation.x = -Math.PI / 2; disc.position.y = -0.005; disc.name = 'heli:blur'; disc.renderOrder = 3;
    rotor.add(disc); parts.blur = disc;
  }
  /* ---------------- tail rotor (left side, axis ±x) */
  const tail = new THREE.Group(); tail.name = 'heli:tailRotor'; tail.position.set(...HELI.tailRotor); ext.add(tail);
  {
    const TK = new Kit(THREE);
    TK.add('metal', new THREE.CylinderGeometry(0.07, 0.07, 0.12, 16), { rot: [0, 0, Math.PI / 2], color: 0x9aa0a8 });
    TK.add('metal', new THREE.SphereGeometry(0.06, 14, 8), { pos: [-0.07, 0, 0], scale: [0.7, 1, 1], color: 0x8d9299 });
    for (let b = 0; b < 4; b++) {
      const a = (b / 4) * TAU;
      const g = bladeGeo(THREE, 0.08, HELI.tailR, 0.13, 0.12, 8, 5); // span along +x → rotate to +y
      g.rotateZ(Math.PI / 2); g.translate(-0.03, 0, 0); g.rotateX(a);
      TK.add('blade', g, { keepColor: true });
    }
    TK.build({ metal: M.metal, blade: M.blade }, tail, { autoUpdate: false });
    const td = new THREE.Mesh(new THREE.RingGeometry(0.08, HELI.tailR, 48, 1), tblurM); td.rotation.y = Math.PI / 2; td.position.x = -0.035; td.renderOrder = 3; tail.add(td); parts.tailBlur = td;
  }
  /* ---------------- exhaust heat haze (animated, faint) */
  const hazeT = TX.hazeTexture(THREE);
  const hazeM = new THREE.MeshBasicMaterial({ map: hazeT, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide });
  {
    const HK = new Kit(THREE);
    for (const s of ['L', 'R']) {
      const e = parts['exhaust' + s]; if (!e) continue;
      const pg = new THREE.PlaneGeometry(0.5, 1.6); pg.translate(0, 0.8, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), e.dir);
      HK.add('h', pg, { matrix: new THREE.Matrix4().compose(e.tip, q, new THREE.Vector3(1, 1, 1)) });
    }
    const [hm] = HK.build({ h: hazeM }, ext); if (hm) { hm.name = 'heli:haze'; hm.renderOrder = 4; parts.haze = hm; }
  }

  /* ---------------- interior */
  const I = o.interior === false ? null : buildInterior(THREE, intr, { hi, env, alphaTex, masks });
  if (I) { Object.assign(parts, I); if (I.lamp) group.add(I.lamp); } // the lamp stays when the cabin is hidden (no light-count change → no shader recompiles)

  group.traverse((x) => { if (x.isMesh) x.userData.heli = true; });

  /* ---------------- animation */
  const st = { rotA: 0, tailA: 0, rpm: 0, t: 0, hazeOff: 0 };
  function setRotor(rpm01, dt) {
    dt = dt || 0;
    st.rpm = clamp(rpm01, 0, 1); st.t += dt;
    // displayed (anti-strobe) rate: the real ~6.5 rev/s aliases at 60 fps → blades show ~1.2 rev/s + blur disc
    const vis = st.rpm < 0.02 ? 0 : 0.22 + 1.0 * st.rpm;
    st.rotA += vis * TAU * dt; st.tailA += (0.4 + 3.6 * st.rpm) * TAU * dt;
    rotor.rotation.y = st.rotA % TAU; tail.rotation.x = -(st.tailA % TAU);
    const blur = clamp((st.rpm - 0.35) / 0.5, 0, 1);
    blurM.opacity = 0.58 * blur; tblurM.opacity = 0.72 * clamp((st.rpm - 0.2) / 0.5, 0, 1);
    M.blade.opacity = 1 - 0.6 * blur; M.blade.depthWrite = blur < 0.3;
    if (parts.rotorMeshes) for (const m of parts.rotorMeshes) if (m.material === M.blade) m.castShadow = blur < 0.6; // a spinning disc casts only a faint shadow
    hazeM.opacity = 0.30 * clamp(st.rpm * 1.4 - 0.2, 0, 1);
    st.hazeOff = (st.hazeOff + dt * 0.9) % 1; if (hazeT) hazeT.offset.y = -st.hazeOff;
  }
  function setLights(t, night = 0) {
    t = t || 0;
    const ph = t % 1.1;
    M.beacon.emissiveIntensity = ph < 0.12 ? 9 : ph < 0.2 ? 1.5 : 0.15;
    const sp = (t + 0.35) % 1.4;
    M.strobe.emissiveIntensity = sp < 0.05 || (sp > 0.12 && sp < 0.16) ? 14 : 0;
    const k = 1.5 + 2.0 * night; M.navR.emissiveIntensity = k; M.navG.emissiveIntensity = k; M.navW.emissiveIntensity = k * 0.8;
    M.land.emissiveIntensity = night > 0.3 ? 4 * night : 0;
  }
  function setControls(inp = {}) {
    if (!I) return;
    const p = clamp(+inp.pitch || 0, -1, 1), r = clamp(+inp.roll || 0, -1, 1), c = clamp(+inp.col || 0, -1, 1), y = clamp(+inp.yaw || 0, -1, 1);
    for (const cy of I.cyclic) { cy.rotation.x = -p * 0.18; cy.rotation.z = -r * 0.18; }
    for (const cl of I.collectives) cl.rotation.x = 0.04 + c * 0.14;
    if (I.pedals) for (let k = 0; k < I.pedals.length; k++) I.pedals[k].rotation.x = (k % 2 ? -1 : 1) * y * 0.22;
  }
  function setDetail(mode) {
    intr.visible = mode !== 'exterior';
  }
  function stats() { let n = 0; group.traverseVisible((x) => { if (x.isMesh && !(x.material && x.material.visible === false)) n += Array.isArray(x.material) ? x.geometry.groups.length : 1; }); return { drawCalls: n }; }
  setRotor(0, 0); setControls({});
  return { group, ext, intr, parts, rotor, tail, M, setRotor, setLights, setControls, setDetail, stats, seats: I ? I.seats : {}, displays: I ? I.displays : {}, state: st };
}
function halfWidthCowl(C, z, y) { // cowling half width at (z, y) from its control sections (linear in z)
  let i = 0; while (i < C.length - 2 && C[i + 1][0] < z) i++;
  const a = C[i], b = C[i + 1], t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1), s = a.map((v, k) => v + (b[k] - v) * t);
  const yc = (s[2] + s[3]) / 2, hh = (s[3] - s[2]) / 2, tt = clamp((y - yc) / hh, -1, 1), n = tt >= 0 ? s[4] : s[5];
  const sa = Math.pow(Math.abs(tt), n / 2); return s[1] * Math.pow(Math.sqrt(Math.max(0, 1 - sa * sa)), 2 / n);
}

/* ------------------------------------------------------------------------------------------- interior */
function buildInterior(THREE, root, o) {
  const { hi, env } = o;
  const FLOOR = 0.68, INS = 0.035;
  const TXo = { zToU };
  const M = {
    lining: new THREE.MeshStandardMaterial({ map: TX.liningTexture(THREE, Object.assign({ trim: o.masks && o.masks.reveal, w: hi ? 1024 : 512, h: hi ? 512 : 256 }, TXo)), color: 0xffffff, roughness: 0.82, metalness: 0, side: THREE.FrontSide, emissive: 0xffffff, emissiveIntensity: 0.10 }),
    floor: new THREE.MeshStandardMaterial({ map: TX.carpetTexture(THREE), color: 0xffffff, roughness: 1, vertexColors: true }),
    leather: new THREE.MeshStandardMaterial({ map: TX.leatherTexture(THREE, '#e6dac6', { insert: 'quilt', quilt: 48, seed: 21 }), color: 0xffffff, roughness: 0.5, metalness: 0, envMap: env, envMapIntensity: 0.45, vertexColors: true }),
    crew: new THREE.MeshStandardMaterial({ map: TX.leatherTexture(THREE, '#2b2d32', { insert: 'perf', seed: 12, stitch: 'rgba(200,170,110,0.55)' }), color: 0xffffff, roughness: 0.48, metalness: 0, envMap: env, envMapIntensity: 0.5, vertexColors: true }),
    wood: new THREE.MeshPhysicalMaterial({ map: TX.woodTexture(THREE), color: 0xffffff, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04, envMap: env }),
    dash: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.1, vertexColors: true, envMap: env, envMapIntensity: 0.4 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 1, vertexColors: true, envMap: env }),
    atlas: new THREE.MeshStandardMaterial({ map: TX.cockpitAtlas(THREE), color: 0xffffff, roughness: 0.6, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.16, envMap: env, envMapIntensity: 0.35 }),
    led: new THREE.MeshStandardMaterial({ color: 0x302010, emissive: 0xffd6a0, emissiveIntensity: 1.8 }),
  };
  for (const k of Object.keys(M)) M[k].name = 'int-' + k;
  if (M.atlas.map) M.atlas.emissiveMap = M.atlas.map;
  if (M.lining.map) { M.lining.map.wrapT = THREE.RepeatWrapping; M.lining.emissiveMap = M.lining.map; }
  M.lining.alphaMap = o.alphaTex || null; M.lining.alphaTest = o.alphaTex ? 0.5 : 0;
  const nA = hi ? 96 : 56, step = hi ? 0.055 : 0.09;
  const lin = new THREE.Mesh(buildLoft(THREE, { nA, step, inset: INS, inner: true }), M.lining);
  lin.name = 'heli:lining'; lin.receiveShadow = true; root.add(lin);
  const K = new Kit(THREE);
  const hw = (z, y, ins = 0.045) => halfWidth(z, y, ins);
  /* ---- floor (follows the hull; dark rubber mats in the cockpit, carpet in the cabin) + aft bulkhead */
  {
    const z0 = -3.66, z1 = 0.70, n = Math.ceil((z1 - z0) / 0.05), pos = [], uv = [], col = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const z = z0 + (z1 - z0) * i / n, w = Math.max(0.05, hw(z, FLOOR + 0.004, INS + 0.004));
      const k = clamp((z + 2.2) / 0.3, 0, 1), c = 0.32 + 0.68 * k;
      for (const x of [-w, w]) { pos.push(x, FLOOR, z); uv.push(x * 1.2, -z * 1.2); col.push(c, c * 0.98, c * 0.96); }
      if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    K.add('floor', g, { keepColor: true });
    // sill trims along the floor edges (brushed metal)
    for (const s of [-1, 1]) K.add('metal', new THREE.BoxGeometry(0.03, 0.02, 2.3), { pos: [s * (hw(-0.4, FLOOR + 0.01, INS) - 0.012), FLOOR + 0.01, -0.45], color: 0xb4b8be });
    K.add('leather', sectionCap(THREE, 0.69, INS, 64), { color: 0xf3ecdf });
  }
  /* ---- glareshield deck + instrument panel + pedestal + console + overhead */
  const GY = 1.42, ZR = -3.24;
  {
    // deck: fills the nose under the windshield at y = GY, from the tip of the nose back to ZR (matte, anti-glare)
    let zF = -4.3; while (zF < ZR && hw(zF, GY) < 0.06) zF += 0.01;
    const n = Math.ceil((ZR - zF) / 0.03), pos = [], idx = [];
    for (let i = 0; i <= n; i++) { const z = zF + (ZR - zF) * i / n, w = Math.max(0.01, hw(z, GY, 0.04)); pos.push(-w, GY, z, w, GY, z); if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    K.add('dash', g, { color: 0x2b2c30 });
    const wR = hw(ZR, GY, 0.04);
    const roll = new THREE.CylinderGeometry(0.028, 0.028, 2 * wR - 0.02, 16); roll.rotateZ(Math.PI / 2); roll.scale(1, 0.8, 1);
    K.add('crew', roll, { pos: [0, GY - 0.012, ZR + 0.01], color: 0xffffff });
    // standby compass on the centre post
    K.add('dash', RBG(0.07, 0.055, 0.06, 2, 0.01), { pos: [0, GY + 0.04, -3.42], color: 0x111214 });
    K.add('metal', new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16), { pos: [0, GY + 0.045, -3.388], rot: [Math.PI / 2, 0, 0], color: 0xd8dde4 });
  }
  // panel (tilted group): dark housing + atlas face + 4 display screens (one canvas, 4 UV cells)
  const PA = -0.30, PH = 0.43;
  const panel = new THREE.Group(); panel.name = 'heli:panel';
  const pcY = GY - 0.03 - (PH / 2) * Math.cos(PA), pcZ = ZR - 0.035 - (PH / 2) * Math.sin(PA);
  panel.position.set(0, pcY, pcZ); panel.rotation.x = PA; root.add(panel);
  const zTop = pcZ + (PH / 2) * Math.sin(PA), yTop = pcY + (PH / 2) * Math.cos(PA), zBot = pcZ - (PH / 2) * Math.sin(PA), yBot = pcY - (PH / 2) * Math.cos(PA);
  const PW = Math.min(1.36, 2 * (Math.min(hw(zTop - 0.05, yTop, 0.04), hw(zBot - 0.05, yBot, 0.04)) - 0.015));
  {
    const PK = new Kit(THREE);
    PK.add('d', RBG(PW, PH, 0.12, 2, 0.02), { pos: [0, 0, -0.06], color: 0x1c1e22 });
    PK.add('a', atlasPlane(THREE, PW - 0.02, PH - 0.02, TX.ATLAS.panel), { pos: [0, 0, 0.0015] });
    PK.build({ d: M.dash, a: M.atlas }, panel);
  }
  const dispCanvas = typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: hi ? 1024 : 768, height: hi ? 256 : 192 }) : null;
  let dispTex = null, dispMesh = null;
  if (dispCanvas) {
    // a dark "off" frame until the avionics draw (dark blue glass)
    const g2 = dispCanvas.getContext('2d'); g2.fillStyle = '#05070a'; g2.fillRect(0, 0, dispCanvas.width, dispCanvas.height);
    dispTex = new THREE.CanvasTexture(dispCanvas); dispTex.colorSpace = THREE.SRGBColorSpace; dispTex.anisotropy = 4;
    const dm = new THREE.MeshBasicMaterial({ map: dispTex, toneMapped: false }); dm.color.setScalar(0.92); dm.name = 'int-displays';
    const DK = new Kit(THREE);
    const sw = TX.PANEL_SCREEN_W * (PW - 0.02), sh = TX.PANEL_SCREEN_H * (PH - 0.02);
    TX.PANEL_SCREENS.forEach(([u, v], k) => {
      const pg = new THREE.PlaneGeometry(sw, sh); const uv = pg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, (k + uv.getX(i)) / 4);
      DK.add('s', pg, { pos: [(u - 0.5) * (PW - 0.02), (0.5 - v) * (PH - 0.02), 0.004] });
    });
    [dispMesh] = DK.build({ s: dm }, panel); if (dispMesh) dispMesh.name = 'heli:displays';
  }
  {
    // pedestal (sloped radio stack from the panel bottom) + console between the seats
    const pA = [0, yBot - 0.01, zBot + 0.01], pB = [0, FLOOR + 0.28, -2.84];
    const L = Math.hypot(pB[1] - pA[1], pB[2] - pA[2]), ang = Math.atan2(pA[1] - pB[1], pB[2] - pA[2]);
    const mid = [0, (pA[1] + pB[1]) / 2, (pA[2] + pB[2]) / 2];
    K.add('dash', new THREE.BoxGeometry(0.25, 0.06, L), { pos: [0, mid[1] - 0.03, mid[2]], rot: [ang, 0, 0], color: 0x1c1e22 });
    K.add('atlas', atlasPlane(THREE, 0.23, L - 0.02, TX.ATLAS.pedestal), { pos: [0, mid[1] + 0.0015, mid[2]], rot: [-Math.PI / 2 + ang, 0, 0] });
    K.add('dash', new THREE.BoxGeometry(0.24, Math.max(0.05, pA[1] - FLOOR - 0.06), 0.16), { pos: [0, (pA[1] + FLOOR) / 2 - 0.04, pA[2] + 0.12], color: 0x1c1e22 });
    K.add('dash', RBG(0.21, pB[1] - FLOOR, 0.70, 2, 0.02), { pos: [0, (pB[1] + FLOOR) / 2, -2.48], color: 0x202227 });
    K.add('atlas', atlasPlane(THREE, 0.19, 0.66, TX.ATLAS.console), { pos: [0, pB[1] + 0.001, -2.48], rot: [-Math.PI / 2, 0, 0] });
    // overhead console under the roof header
    const oz = -2.56, oy = roofAt(oz, 0, INS) - 0.03;
    K.add('dash', RBG(0.36, 0.045, 0.32, 2, 0.015), { pos: [0, oy, oz], rot: [0.06, 0, 0], color: 0x24262b });
    K.add('atlas', atlasPlane(THREE, 0.33, 0.29, TX.ATLAS.overhead), { pos: [0, oy - 0.0235, oz], rot: [Math.PI / 2 + 0.06, 0, Math.PI] });
    // two sun visors folded against the header + a centre rear-view mirror stalk
    for (const s of [-1, 1]) K.add('dash', RBG(0.30, 0.012, 0.15, 2, 0.005), { pos: [s * 0.40, roofAt(-2.62, 0.40, INS) - 0.012, -2.66], rot: [0.0, 0, -s * 0.22], color: 0x2f3136 });
  }
  /* ---- crew seats: energy-absorbing buckets, perforated charcoal leather, side bolsters, headrests */
  const crewSeat = (x, z, harnessOn) => {
    const F = FLOOR;
    K.add('metal', new THREE.BoxGeometry(0.40, 0.04, 0.44), { pos: [x, F + 0.02, z], color: 0x55595f });           // rails
    K.add('dash', RBG(0.42, 0.20, 0.42, 2, 0.03), { pos: [x, F + 0.14, z], color: 0x1d1f23 });       // bucket
    K.add('crew', RBG(0.46, 0.10, 0.48, 3, 0.04), { pos: [x, F + 0.30, z] });                        // cushion
    for (const s of [-1, 1]) K.add('crew', RBG(0.07, 0.07, 0.44, 3, 0.03), { pos: [x + s * 0.21, F + 0.36, z], color: 0xd8d8d8 });
    K.add('crew', RBG(0.46, 0.64, 0.11, 3, 0.045), { pos: [x, F + 0.72, z + 0.27], rot: [0.16, 0, 0] });
    for (const s of [-1, 1]) K.add('crew', RBG(0.08, 0.52, 0.14, 3, 0.035), { pos: [x + s * 0.215, F + 0.70, z + 0.245], rot: [0.16, 0, -s * 0.05], color: 0xd8d8d8 });
    K.add('crew', RBG(0.30, 0.20, 0.10, 3, 0.045), { pos: [x, F + 1.17, z + 0.345], rot: [0.16, 0, 0] });
    K.add('metal', new THREE.CylinderGeometry(0.009, 0.009, 0.08, 8), { pos: [x - 0.08, F + 1.05, z + 0.33], rot: [0.16, 0, 0], color: 0xb8bcc2 });
    K.add('metal', new THREE.CylinderGeometry(0.009, 0.009, 0.08, 8), { pos: [x + 0.08, F + 1.05, z + 0.33], rot: [0.16, 0, 0], color: 0xb8bcc2 });
    if (harnessOn) { // empty seat: 4-point harness lying on the seat, buckle in the lap
      for (const s of [-1, 1]) K.add('dash', new THREE.BoxGeometry(0.045, 0.55, 0.008), { pos: [x + s * 0.09, F + 0.70, z + 0.20], rot: [0.16, 0, s * 0.05], color: 0x111214 });
      for (const s of [-1, 1]) K.add('dash', new THREE.BoxGeometry(0.045, 0.008, 0.22), { pos: [x + s * 0.11, F + 0.358, z - 0.02], rot: [0, s * 0.3, 0], color: 0x111214 });
      K.add('metal', new THREE.CylinderGeometry(0.035, 0.035, 0.012, 18), { pos: [x, F + 0.362, z - 0.10], color: 0xa8adb4 });
    }
  };
  crewSeat(0.42, -2.42, false); crewSeat(-0.42, -2.42, true);
  /* ---- crew door cards (both sides) with armrest + handle */
  for (const s of [-1, 1]) {
    const z = -1.95, y = FLOOR + 0.42, x = s * (hw(z, y, INS) - 0.012);
    K.add('atlas', atlasPlane(THREE, 0.86, 0.46, TX.ATLAS.door), { pos: [x, y, z], rot: [0, -s * Math.PI / 2, 0] });
    K.add('crew', RBG(0.07, 0.06, 0.42, 2, 0.02), { pos: [x - s * 0.04, FLOOR + 0.52, z + 0.08], color: 0xbfbfbf });
    K.add('metal', RBG(0.02, 0.03, 0.12, 2, 0.008), { pos: [x - s * 0.02, FLOOR + 0.70, z - 0.30], color: 0xc9cdd3 });
  }
  /* ---- VIP cabin: club four (front pair rear-facing, rear pair forward-facing), console, table, cappings */
  const club = (cx, cz, face) => { // face: +1 → faces −z (forward), −1 → faces +z (aft)
    const R = new THREE.Matrix4().makeRotationY(face > 0 ? 0 : Math.PI).setPosition(cx, FLOOR, cz);
    const add = (key, g, pos, rot, color) => K.add(key, g, { pos, rot: rot || [0, 0, 0], color: color == null ? 0xffffff : color, pre: R });
    add('dash', RBG(0.42, 0.26, 0.40, 2, 0.03), [0, 0.13, 0.02], null, 0x2a2622);
    add('leather', RBG(0.46, 0.14, 0.50, 3, 0.055), [0, 0.38, -0.01], [-0.04, 0, 0]);
    add('leather', RBG(0.46, 0.62, 0.15, 3, 0.06), [0, 0.80, 0.25], [0.18, 0, 0]);
    add('leather', RBG(0.34, 0.17, 0.11, 3, 0.05), [0, 1.17, 0.30], [0.18, 0, 0], 0xf6efe2);
    for (const s of [-1, 1]) {
      add('leather', RBG(0.07, 0.30, 0.52, 3, 0.03), [s * 0.265, 0.47, 0.02], null, 0xf1e9db);
      add('wood', RBG(0.075, 0.022, 0.46, 2, 0.008), [s * 0.265, 0.625, 0.0]);
    }
  };
  club(0.40, -1.30, -1); club(-0.40, -1.30, -1); club(0.40, 0.30, 1); club(-0.40, 0.30, 1);
  for (const z of [-1.30, 0.30]) { // centre consoles with wood tops + cupholders
    K.add('dash', RBG(0.17, 0.52, 0.46, 2, 0.02), { pos: [0, FLOOR + 0.26, z], color: 0x2a2622 });
    K.add('wood', RBG(0.18, 0.025, 0.47, 2, 0.008), { pos: [0, FLOOR + 0.53, z] });
    for (const dz of [-0.09, 0.09]) K.add('metal', new THREE.CylinderGeometry(0.035, 0.035, 0.012, 18), { pos: [0, FLOOR + 0.538, z + dz], color: 0x9aa0a8 });
  }
  // fold-out table between the club rows (wood, brass edge) on a slim pedestal
  K.add('wood', RBG(0.54, 0.03, 0.38, 3, 0.012), { pos: [0, FLOOR + 0.66, -0.50] });
  K.add('metal', RBG(0.56, 0.012, 0.40, 2, 0.005), { pos: [0, FLOOR + 0.645, -0.50], color: 0xc9a86a });
  K.add('metal', new THREE.CylinderGeometry(0.025, 0.04, 0.64, 14), { pos: [0, FLOOR + 0.32, -0.50], color: 0xc9a86a });
  K.add('metal', new THREE.CylinderGeometry(0.14, 0.16, 0.012, 24), { pos: [0, FLOOR + 0.006, -0.50], color: 0xc9a86a });
  // window-line wood cappings + LED cove strips + reading lights / gaspers above each seat
  for (const s of [-1, 1]) {
    const x = s * (hw(-0.4, 1.15, INS) - 0.03);
    K.add('wood', RBG(0.07, 0.035, 2.0, 2, 0.012), { pos: [x, 1.15, -0.40] });
    const lx = s * 0.52, ly = roofAt(-0.4, 0.52, INS) - 0.012;
    K.add('led', new THREE.BoxGeometry(0.014, 0.008, 2.3), { pos: [lx, ly, -0.40], rot: [0, 0, -s * 0.35] });
    for (const z of [-1.30, 0.30]) {
      const rx = s * 0.36, ry = roofAt(z, 0.36, INS) - 0.006;
      K.add('led', new THREE.CircleGeometry(0.022, 14), { pos: [rx, ry, z], rot: [Math.PI / 2, 0, 0] });
      K.add('metal', new THREE.TorusGeometry(0.03, 0.006, 6, 16), { pos: [rx, ry, z], rot: [Math.PI / 2, 0, 0], color: 0xc9a86a });
      K.add('metal', new THREE.CylinderGeometry(0.02, 0.026, 0.02, 14), { pos: [rx, ry - 0.01, z + 0.09], color: 0xc9cdd3 });
    }
  }
  // cockpit dome lights (red / white) on the header
  for (const s of [-1, 1]) K.add('led', new THREE.CircleGeometry(0.015, 12), { pos: [s * 0.25, roofAt(-2.6, 0.25, INS) - 0.004, -2.6], rot: [Math.PI / 2, 0, 0] });
  // passenger headsets on hooks by the rear seats
  const headset = (x, y, z, ry) => {
    K.add('dash', new THREE.TorusGeometry(0.095, 0.012, 8, 22, Math.PI), { pos: [x, y, z], rot: [0, ry, 0], color: 0x1a1b1f });
    for (const s of [-1, 1]) K.add('dash', new THREE.CylinderGeometry(0.045, 0.045, 0.04, 18), { pos: [x + Math.cos(ry) * s * 0.095, y - 0.01, z - Math.sin(ry) * s * 0.095], rot: [0, ry, Math.PI / 2], color: 0x26282d });
    K.add('metal', new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8), { pos: [x, y + 0.02, z], rot: [0, 0, Math.PI / 2], color: 0xc9a86a });
  };
  for (const s of [-1, 1]) headset(s * (hw(0.62, 1.55, INS) - 0.06), 1.55, 0.62, Math.PI / 2);
  /* ---- controls: cyclic ×2, collective ×2, pedals ×4 (animated groups) */
  const cyclic = [], collectives = [], pedals = [];
  for (const x of [0.42, -0.42]) {
    const cg = new THREE.Group(); cg.name = 'heli:cyclic'; cg.position.set(x, FLOOR + 0.03, -2.74); cg.userData.grip = new THREE.Vector3(0, 0.55, 0.075); root.add(cg);
    const CK = new Kit(THREE);
    CK.add('m', new THREE.CylinderGeometry(0.075, 0.05, 0.10, 16), { pos: [0, 0.04, 0], color: 0x111214 });                  // rubber boot
    CK.add('m', tube(THREE, [[0, 0.06, 0], [0, 0.28, 0.01], [0, 0.44, 0.05], [0, 0.50, 0.07]], 0.013, 14, 8), { color: 0x2a2c30 });
    CK.add('m', RBG(0.045, 0.14, 0.055, 3, 0.018), { pos: [0, 0.56, 0.08], rot: [0.22, 0, 0], color: 0x15161a }); // grip
    CK.add('m', new THREE.SphereGeometry(0.012, 10, 8), { pos: [0, 0.635, 0.065], color: 0x6b7079 });   // trim hat
    CK.add('m', new THREE.BoxGeometry(0.014, 0.016, 0.012), { pos: [0.014, 0.62, 0.05], color: 0xc02020 }); // PTT
    CK.add('m', new THREE.BoxGeometry(0.01, 0.03, 0.012), { pos: [0, 0.54, 0.05], color: 0x3a3c40 });     // trigger
    CK.build({ m: M.metal }, cg, { autoUpdate: false });
    cyclic.push(cg);
  }
  for (const x of [0.15, -0.15]) {
    const cl = new THREE.Group(); cl.name = 'heli:collective'; cl.position.set(x, FLOOR + 0.30, -2.02); root.add(cl);
    const CK = new Kit(THREE);
    CK.add('m', RBG(0.07, 0.07, 0.12, 2, 0.02), { pos: [0, -0.01, 0.02], color: 0x2a2c30 });
    CK.add('m', rodBetween(THREE, [0, 0.0, 0], [0, 0.07, -0.44], 0.016, 10), { color: 0x1c1d21 });
    CK.add('m', new THREE.CylinderGeometry(0.024, 0.024, 0.14, 14), { pos: [0, 0.06, -0.40], rot: [Math.PI / 2 - 0.16, 0, 0], color: 0x0f1012 }); // twist grip
    CK.add('m', RBG(0.065, 0.055, 0.08, 2, 0.015), { pos: [0, 0.085, -0.50], rot: [-0.16, 0, 0], color: 0x2a2c30 });              // switch box
    CK.add('m', new THREE.BoxGeometry(0.012, 0.012, 0.012), { pos: [0.018, 0.115, -0.50], color: 0xd8dde4 });
    CK.add('m', new THREE.BoxGeometry(0.012, 0.012, 0.012), { pos: [-0.012, 0.115, -0.52], color: 0xd89a10 });
    CK.build({ m: M.metal }, cl, { autoUpdate: false });
    cl.userData.grip = new THREE.Vector3(0, 0.06, -0.40);
    collectives.push(cl);
  }
  for (const x of [0.30, 0.54, -0.30, -0.54]) {
    const pg = new THREE.Group(); pg.name = 'heli:pedal'; pg.position.set(x, FLOOR + 0.30, -3.20); root.add(pg);
    const PK = new Kit(THREE);
    PK.add('m', new THREE.BoxGeometry(0.02, 0.20, 0.02), { pos: [0, -0.10, 0], color: 0x2a2c30 });
    PK.add('m', RBG(0.10, 0.15, 0.025, 2, 0.008), { pos: [0, -0.17, 0.02], rot: [-0.55, 0, 0], color: 0x111214 });
    for (let k = 0; k < 4; k++) PK.add('m', new THREE.BoxGeometry(0.09, 0.006, 0.006), { pos: [0, -0.215 + k * 0.032, 0.044 - k * 0.018], rot: [-0.55, 0, 0], color: 0x5a5e66 });
    PK.build({ m: M.metal }, pg, { autoUpdate: false });
    pg.userData.pad = new THREE.Vector3(0, -0.17, 0.035); // ball-of-foot contact point (local)
    pedals.push(pg);
  }
  cyclic[0].userData.pedals = [pedals[0], pedals[1]];
  cyclic[0].userData.collective = collectives[0];
  /* ---- build merged interior meshes */
  const out = K.build({ floor: M.floor, leather: M.leather, crew: M.crew, wood: M.wood, dash: M.dash, metal: M.metal, atlas: M.atlas, led: M.led }, root, { receiveShadow: true });
  for (const m of out) if (m.material === M.leather || m.material === M.crew) m.castShadow = true;
  // a warm cabin light (so the lit cabin reads through the windows at dusk)
  const lamp = new THREE.PointLight(0xffd8a8, 0.9, 4.5, 2); lamp.position.set(0, 1.85, -0.6); root.add(lamp);
  const seats = {
    pilot: new THREE.Vector3(0.42, FLOOR + 0.36, -2.42),
    copilot: new THREE.Vector3(-0.42, FLOOR + 0.36, -2.42),
    passenger: new THREE.Vector3(-0.40, FLOOR + 1.10, 0.36),   // eye point, rear-left club seat facing forward
    passenger2: new THREE.Vector3(0.40, FLOOR + 1.10, 0.36),
  };
  return { cyclic, collective: collectives[0], collectives, pedals, seats, lamp, displays: { canvas: dispCanvas, texture: dispTex, mesh: dispMesh, panel }, interiorMeshes: out, FLOOR, intM: M };
}

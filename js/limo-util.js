// limo-util.js — V10 LIMO: small geometry helpers (merge-by-material, UV-rect boxes, tapered limbs, orient between
// points). No side effects on import.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Collects transformed geometries per key → one merged BufferGeometry per key (static geometry = 1 draw call each).
export class Merger {
  constructor(THREE) { this.THREE = THREE; this.parts = new Map(); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); }
  // add(key, geo, {pos:[x,y,z], rot:[x,y,z], scale:[x,y,z] | number, color: 0xrrggbb, matrix: Matrix4})
  add(key, geo, o = {}) {
    const THREE = this.THREE;
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (o.matrix) g.applyMatrix4(o.matrix);
    else {
      this._p.set(...(o.pos || [0, 0, 0]));
      this._e.set(...(o.rot || [0, 0, 0]));
      this._q.setFromEuler(this._e);
      const s = o.scale == null ? [1, 1, 1] : typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : o.scale;
      this._s.set(...s);
      this._m.compose(this._p, this._q, this._s);
      g.applyMatrix4(this._m);
    }
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new THREE.Color(o.color == null ? 0xffffff : o.color);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    if (geo !== g && o.dispose) geo.dispose();
    return this;
  }
  has(key) { return this.parts.has(key) && this.parts.get(key).length > 0; }
  geometry(key) {
    const list = this.parts.get(key); if (!list || !list.length) return null;
    let g = null;
    try { g = list.length === 1 ? list[0] : mergeGeometries(list, false); } catch (e) { console.warn('[limo] merge', key, e); }
    if (g) { g.computeBoundingSphere(); g.computeBoundingBox(); }
    for (const p of list) if (p !== g) p.dispose();
    this.parts.set(key, []);
    return g;
  }
  // build meshes for all keys with mats[key]; returns array of meshes (adds to parent if given)
  build(mats, parent, opts = {}) {
    // keys that share one material object are merged into one mesh (one draw call per material)
    const byMat = new Map();
    for (const key of [...this.parts.keys()]) {
      if (!this.has(key)) continue;
      const mat = mats[key] || mats.default;
      if (!byMat.has(mat)) byMat.set(mat, []);
      byMat.get(mat).push(key);
    }
    const out = [];
    for (const [mat, keys] of byMat) {
      if (keys.length > 1) { const all = []; for (const k of keys) { all.push(...this.parts.get(k)); this.parts.set(k, []); } this.parts.set(keys[0], all); }
      const g = this.geometry(keys[0]); if (!g) continue;
      const m = new this.THREE.Mesh(g, mat);
      m.name = 'limo:' + keys[0]; m.castShadow = !!opts.castShadow; m.receiveShadow = !!opts.receiveShadow; m.matrixAutoUpdate = !!opts.autoUpdate;
      m.updateMatrix();
      if (parent) parent.add(m);
      out.push(m);
    }
    return out;
  }
}

// box whose every face maps to the atlas rect [u0,v0,u1,v1]
export function boxUV(THREE, w, h, d, rect) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, [u0, v0, u1, v1] = rect;
  const iu = (u1 - u0) * 0.004, iv = (v1 - v0) * 0.004; // inset: no bleeding from neighbour cells
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + iu + (u1 - u0 - 2 * iu) * uv.getX(i), v0 + iv + (v1 - v0 - 2 * iv) * uv.getY(i));
  return g;
}

// tapered limb along +Y from 0 to len, radius r0 at the bottom, r1 at the top, rounded ends
export function taper(THREE, r0, r1, len, seg = 14) {
  const pts = [];
  const n = 5;
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r0, r0 + Math.sin(a) * r0)); }
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r1, len - r1 + Math.sin(a) * r1)); }
  pts[0].x = 0.0001; pts[pts.length - 1].x = 0.0001;
  return new THREE.LatheGeometry(pts, seg);
}

// matrix that maps a +Y segment of length |b-a| (origin at a) onto a→b
export function between(THREE, a, b, out) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const len = d.length() || 1e-4;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return { matrix: (out || new THREE.Matrix4()).compose(A, q, new THREE.Vector3(1, 1, 1)), len };
}

// lathe from [r, y] pairs
export function lathe(THREE, pairs, seg = 24) { return new THREE.LatheGeometry(pairs.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg); }

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

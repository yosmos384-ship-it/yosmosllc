// heli-area.js — V13 HELI: the real-geography city around 3351 Eakin Rd for the helicopter world.
// Data: data/heli-area.json (baked: OSM buildings / roads / water / greens / labels / tour POIs (© OpenStreetMap
// contributors, ODbL), ~57k trees detected from the imagery, USGS 3DEP elevation grid) + data/heli-tiles/ (USGS The
// National Map / USDA NAIP orthoimagery, public domain: z12 … z16 slippy tiles + a 0.6 m NAIP mosaic around the house)
// + optional data/heli-area-houses.json (house footprints traced from the same orthoimagery where OSM has none).
// Frame: metres, x = east, z = south, y = up; y = 0 = the house's ground (elevation grid is relative to it).
//
//   loadArea(url?) → Promise<data>
//   buildArea(THREE, data, { quality, renderer, onProgress(frac, label), base, pad, S }) → Promise<area> {
//     group, ground(x,z), obstacle(x,z), labelY(x,z,r), update(camera), labels, tour, mapCanvas/map, house, pad,
//     loadDetail() → Promise (finer imagery levels, streamed in after the world opens), stream.update(x,z), stats() }
// Look: "3D map" style — orthoimagery draped on the 3DEP terrain (one draw call; z12 static + z14 / z15 / z16
// camera-following clip windows + NAIP, colour-matched, sharpened up close), water with sky reflection and sun
// glints, OSM + traced buildings with procedural facades and imagery-textured roofs, instanced tree canopies with
// distance LOD, aerial-perspective haze that dissolves the world's edge into the horizon.
// Performance (high): terrain 1 draw call, buildings ≤ ~70 chunks (small ones hidden by distance), trees ≤ 36
// instanced chunks (LOD + draw distance), house + pad ≈ 6; ~105 MB of textures (low: ~50 MB). No side effects on import.
import { Merger } from './limo-util.js';
import { helipadTexture } from './heli-tex.js';
import plan from './plan.js';
import { HELI_STRINGS } from './heli-strings.js';
import * as I18N from './i18n.js';
import { loadImg, makeClip, gradeFrom, statMean, waterMask } from './heli-area-imagery.js';
import { buildBuildings } from './heli-area-buildings.js';
import { buildTrees } from './heli-area-trees.js';
import * as SH from './heli-area-shaders.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export async function loadArea(url) {
  const u = url || new URL('../data/heli-area.json', import.meta.url).href;
  const r = await fetch(u);
  if (!r.ok) throw new Error('heli-area.json ' + r.status);
  const data = await r.json();
  // optional: traced house footprints (same encoding as data.buildings.list) — never required
  if (!data.houses) {
    try {
      const h = await fetch(new URL('heli-area-houses.json', new URL(u, typeof location !== 'undefined' ? location.href : import.meta.url)).href);
      if (h.ok) { const j = await h.json(); if (j && Array.isArray(j.list)) data.houses = j; }
    } catch (_) {}
  }
  // optional: the downtown / Short North / Ohio State extension (finer imagery tiles + OSM there) — never required
  if (!data.ext) {
    try {
      const h = await fetch(new URL('heli-area-ext.json', new URL(u, typeof location !== 'undefined' ? location.href : import.meta.url)).href);
      if (h.ok) { const j = await h.json(); if (j && j.v) mergeExt(data, j); }
    } catch (e) { console.warn('[heli-area] ext data', e); }
  }
  return data;
}
// merge data/heli-area-ext.json into the base data (dedupe against what the base already has)
export function mergeExt(data, X) {
  try {
    data.ext = { v: X.v, buildings: 0, roads: 0, water: 0 };
    const T = data.tiles || (data.tiles = { levels: [] });
    T.extra = Object.assign({}, T.extra || {}, (X.tiles && X.tiles.extra) || {});
    for (const lv of (X.tiles && X.tiles.levels) || []) if (!(T.levels || []).some((l) => l.z === lv.z)) T.levels.push(lv);
    const cen = (pts) => { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; };
    const bx = X.box || [-1e9, -1e9, 1e9, 1e9];
    // buildings: skip any whose centroid is within 4 m of a base building's centroid
    const G = new Map(), key = (x, z) => Math.round(x / 8) + ':' + Math.round(z / 8);
    for (const L of [(data.buildings && data.buildings.list) || [], (data.downtown && data.downtown.list) || []]) for (const b of L) {
      const x0 = b[3] / 10, z0 = b[4] / 10; if (x0 < bx[0] - 200 || x0 > bx[2] + 200 || z0 < bx[1] - 200 || z0 > bx[3] + 200) continue;
      const c = cen(unpack(b, 3)); const k = key(c[0], c[1]); if (!G.has(k)) G.set(k, []); G.get(k).push(c);
    }
    const near = (c, d) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const L = G.get((Math.round(c[0] / 8) + i) + ':' + (Math.round(c[1] / 8) + j)); if (L) for (const q of L) if (Math.hypot(q[0] - c[0], q[1] - c[1]) < d) return true; } return false; };
    if (Array.isArray(X.buildings)) {
      const add = X.buildings.filter((b) => !near(cen(unpack(b, 3)), 4));
      if (!data.buildings) data.buildings = { list: [] };
      data.ext.bStart = data.buildings.list.length;
      data.buildings.list = data.buildings.list.concat(add); data.ext.buildings = add.length;
    }
    // roads: only those outside the base roads' box (the base set stops at its bake box)
    if (Array.isArray(X.roads) && data.roads && data.roads.list) {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const r of data.roads.list) for (const [x, z] of unpack(r, 2)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      const add = X.roads.filter((r) => { const c = cen(unpack(r, 2)); return !(c[0] > x0 + 60 && c[0] < x1 - 60 && c[1] > z0 + 60 && c[1] < z1 - 60); });
      data.roads.list = data.roads.list.concat(add); data.ext.roads = add.length;
    }
    // water / rivers / greens: skip near-duplicates of base features
    const dedupe = (base, ext, o, d) => { const C = base.map((p) => cen(unpack(p, o))); return ext.filter((p) => { const c = cen(unpack(p, o)); return !C.some((q) => Math.hypot(q[0] - c[0], q[1] - c[1]) < d); }); };
    if (Array.isArray(X.water)) { const add = dedupe(data.water || [], X.water, 0, 40); data.water = (data.water || []).concat(add); data.ext.water = add.length; }
    if (Array.isArray(X.rivers) && data.rivers) data.rivers.list = (data.rivers.list || []).concat(dedupe(data.rivers.list || [], X.rivers, 1, 40));
    if (Array.isArray(X.greens) && data.greens) data.greens.list = (data.greens.list || []).concat(dedupe(data.greens.list || [], X.greens, 1, 40));
    if (Array.isArray(X.labels)) { const have = new Set((data.labels || []).map((l) => String(l.name).toLowerCase())); data.labels = (data.labels || []).concat(X.labels.filter((l) => l && l.name && !have.has(String(l.name).toLowerCase()))); }
    if (X.attribution && data.attribution) data.attribution.ext = X.attribution;
  } catch (e) { console.warn('[heli-area] merge ext', e); }
  return data;
}
export function unpack(a, o = 0) { // [x0*10, z0*10, dx*10, dz*10, …] → [[x, z], …]
  const out = []; let x = a[o] / 10, z = a[o + 1] / 10; out.push([x, z]);
  for (let i = o + 2; i + 1 < a.length; i += 2) { x += a[i] / 10; z += a[i + 1] / 10; out.push([x, z]); }
  return out;
}
// plan.js frame → true (heli-area) frame: plan draws the street at +z; the real house faces north onto Eakin Rd
export function planToArea(data, px, pz) {
  const h = data.house || { x: 6.6, z: 11.7 };
  const cx = 4.572, cz = 3.6575; // plan house centre
  return [h.x - (px - cx), h.z - (pz - cz)];
}

/* ============================================================================================ elevation */
export function makeGround(data) {
  const E = data.elev;
  if (!E || !E.h) return () => 0;
  const { x0, z0, step, nx, nz, h } = E;
  return (x, z) => {
    const fx = clamp((x - x0) / step, 0, nx - 1.001), fz = clamp((z - z0) / step, 0, nz - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = h[j * nx + i], b = h[j * nx + i + 1], c = h[(j + 1) * nx + i], d = h[(j + 1) * nx + i + 1];
    // smoothstep weights: no visible facets in the 200 m grid
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    return ((a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + d * su) * sv) / 10;
  };
}

/* ============================================================================================ strings */
function areaS(o, key) {
  try { if (typeof o.S === 'function') return o.S(key); } catch (_) {}
  try { const l = typeof I18N.getLang === 'function' ? I18N.getLang() : 'he'; const d = HELI_STRINGS[l] || HELI_STRINGS.he; return d[key] || HELI_STRINGS.he[key] || d.loading || ''; } catch (_) { return ''; }
}

function detailTexture(THREE) {
  const N = 256, d = new Uint8Array(N * N * 4);
  let r = 99; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const grid = (cells) => { const g = []; for (let i = 0; i < cells * cells; i++) g.push(rnd()); return (x, y) => { const fx = x * cells, fy = y * cells, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j; const a = g[(j % cells) * cells + (i % cells)], b = g[(j % cells) * cells + ((i + 1) % cells)], c = g[((j + 1) % cells) * cells + (i % cells)], e = g[((j + 1) % cells) * cells + ((i + 1) % cells)]; const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v); return (a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + e * su) * sv; }; };
  const o1 = grid(64), o2 = grid(16), o3 = grid(4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, k = (y * N + x) * 4;
    const fine = 0.55 * rnd() + 0.45 * o1(u, v);
    d[k] = Math.round(255 * fine); d[k + 1] = Math.round(255 * (0.6 * o2(u, v) + 0.4 * o3(u, v))); d[k + 2] = 128; d[k + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// patch a built-in material with our GLSL (guarded: a failed patch leaves the plain material working)
function patch(mat, key, fn) {
  mat.onBeforeCompile = (sh) => { try { fn(sh); } catch (e) { console.warn('[heli-area] shader patch ' + key, e); } };
  mat.customProgramCacheKey = () => key;
  try { mat.extensions = Object.assign(mat.extensions || {}, { derivatives: true }); } catch (_) {}
}
const rep = (src, a, b) => (src.indexOf(a) >= 0 ? src.replace(a, b) : src);

/* ============================================================================================ house + pad */
function buildHouse(THREE, data, ground, padXZ) {
  const g = new THREE.Group(); g.name = 'heliArea:house';
  const hx = data.house ? data.house.x : 6.6, hz = data.house ? data.house.z : 11.7;
  // Cape Cod in the plan frame (x 0…9.144, z 0…7.315, front +z), then rotated to face north (true)
  const H = new THREE.Group(); g.add(H);
  const MM = new Merger(THREE);
  const W = 9.144, D = 7.315, eave = 3.35, ridge = 7.0;
  MM.add('wall', new THREE.BoxGeometry(W, eave + 0.6, D), { pos: [W / 2, (eave + 0.6) / 2 - 0.6, D / 2], color: 0xcfcac0 });
  // gable ends (east / west)
  const gs = new THREE.Shape(); gs.moveTo(0, 0); gs.lineTo(D, 0); gs.lineTo(D / 2, ridge - eave); gs.closePath();
  const gg = new THREE.ExtrudeGeometry(gs, { depth: W, bevelEnabled: false }); gg.rotateY(Math.PI / 2); // shape x → −z … extrude along +x
  gg.translate(0, eave, D); MM.add('wall', gg, { color: 0xd9d4ca });
  // roof planes
  const rl = Math.hypot(D / 2 + 0.35, ridge - eave + 0.25);
  const ang = Math.atan2(ridge - eave + 0.25, D / 2 + 0.35);
  for (const s of [-1, 1]) {
    const rg = new THREE.BoxGeometry(W + 0.5, 0.12, rl);
    MM.add('roof', rg, { pos: [W / 2, (eave + ridge) / 2 - 0.05, D / 2 + s * (D / 4 + 0.1)], rot: [s * ang, 0, 0], color: 0x3a3b3d });
  }
  // dormer-less Cape: front porch with two white columns + gable, black door, white trim windows
  MM.add('trim', new THREE.BoxGeometry(2.0, 0.45, 1.6), { pos: [6.05, 0.22, D + 0.8], color: 0xbdb8ae });
  MM.add('trim', new THREE.BoxGeometry(5.8, 0.06, 4.6), { pos: [8.5, 0.03, -3.3], color: 0x9a968e }); // back patio
  for (const x of [5.2, 6.9]) MM.add('trim', new THREE.BoxGeometry(0.16, 2.6, 0.16), { pos: [x, 1.75, D + 1.45], color: 0xf4f2ee });
  MM.add('roof', new THREE.BoxGeometry(2.3, 0.14, 1.8), { pos: [6.05, 3.12, D + 0.85], rot: [0.0, 0, 0], color: 0x3a3b3d });
  // windows + exterior doors from plan.js (white trim, dark glass; black front door, glass back door)
  try {
    const FY = { main: plan.mainFloor, upper: plan.upperFloor, basement: plan.basementFloor };
    const put = (wall, along, w, y0, y1, glassC, trimC) => {
      const h = y1 - y0, yc = (y0 + y1) / 2, t = 0.07;
      const [px, pz, sx, sz] = wall === 'ext_S' ? [along, D + 0.02, w, t] : wall === 'ext_N' ? [along, -0.02, w, t] : wall === 'ext_E' ? [W + 0.02, along, t, w] : [-0.02, along, t, w];
      MM.add('trim', new THREE.BoxGeometry(sx + (sx > t ? 0.14 : 0.02), h + 0.14, sz + (sz > t ? 0.14 : 0.02)), { pos: [px, yc, pz], color: trimC });
      MM.add('glass', new THREE.BoxGeometry(sx + (sx > t ? 0 : 0.03), h, sz + (sz > t ? 0 : 0.03)), { pos: [px, yc, pz], color: glassC });
    };
    for (const w of plan.windows || []) { if (!/^ext_/.test(w.wall) || w.type === 'vent') continue; const fy = FY[w.floor] || 0; put(w.wall, w.along, w.w, fy + w.sill, fy + w.head, 0x24303c, 0xf2f0ea); }
    for (const d of plan.doors || []) { if (!d.exterior) continue; const fy = FY[d.floor] || 0.6; put(d.wall, d.along, d.w, fy, fy + d.h, d.id === 'front' ? 0x0d0d0e : 0x2a3540, 0x141414); }
  } catch (e) { console.warn('[heli-area] house openings', e); }
  MM.add('trim', new THREE.BoxGeometry(0.6, 1.2, 0.6), { pos: [7.8, ridge - 0.3, 3.3], color: 0x8a7b6c }); // chimney
  const mats = {
    wall: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.1, metalness: 0.6 }),
  };
  MM.build(mats, H, { castShadow: true, receiveShadow: true });
  H.position.set(-W / 2, 0, -D / 2); // centre the plan box on the group origin
  const wrap = new THREE.Group(); wrap.add(H); g.add(wrap);
  wrap.rotation.y = Math.PI; wrap.position.set(hx, ground(hx, hz), hz);
  // temporary helipad in the back yard (concrete with the H)
  const pad = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 14), [
    new THREE.MeshStandardMaterial({ color: 0x8a8c8c, roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: 0x8a8c8c, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ map: helipadTexture(THREE), roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x8a8c8c }),
    new THREE.MeshStandardMaterial({ color: 0x8a8c8c }), new THREE.MeshStandardMaterial({ color: 0x8a8c8c })]);
  pad.name = 'heliArea:pad'; pad.receiveShadow = true;
  const py = ground(padXZ[0], padXZ[1]);
  pad.position.set(padXZ[0], py + 0.02, padXZ[1]); g.add(pad);
  // windsock on a pole at the pad corner
  const ws = new Merger(THREE);
  ws.add('p', new THREE.CylinderGeometry(0.04, 0.05, 4.2, 10), { pos: [padXZ[0] + 8.5, py + 2.1, padXZ[1] - 7], color: 0xd8d8d8 });
  const sock = new THREE.CylinderGeometry(0.22, 0.09, 1.2, 14, 1, true); sock.rotateZ(Math.PI / 2);
  ws.add('s', sock, { pos: [padXZ[0] + 9.1, py + 4.0, padXZ[1] - 7], color: 0xff7a1a });
  ws.build({ p: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5 }), s: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }) }, g);
  g.traverse((x) => { if (x.isMesh) x.userData.heliHouse = true; });
  return { group: g, pad: { x: padXZ[0], y: py + 0.08, z: padXZ[1] } };
}

/* ============================================================================================ map canvas (MFD / overview) */
function buildMapCanvas(data, S = 1024, R = 6500) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const k = S / (2 * R), X = (x) => (x + R) * k, Z = (z) => (z + R) * k;
  g.fillStyle = '#0d1a24'; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(60,120,70,0.55)';
  for (const p of (data.greens && data.greens.list) || []) { const pts = unpack(p, 1); g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.closePath(); g.fill(); }
  g.fillStyle = 'rgba(60,130,210,0.8)';
  for (const p of data.water || []) { const pts = unpack(p); g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.closePath(); g.fill(); }
  g.strokeStyle = 'rgba(70,140,220,0.9)'; g.lineCap = 'round';
  for (const r of (data.rivers && data.rivers.list) || []) { g.lineWidth = r[0] ? 4 : 1.5; const pts = unpack(r, 1); g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke(); }
  const RC = ['#f2c14e', '#f2d28a', '#e8e0c8', '#d8d2c0', 'rgba(200,200,200,0.55)', '#e8e0c8', 'rgba(160,160,160,0.35)'];
  const RW = [3.2, 2.6, 2.1, 1.7, 0.8, 1.2, 0.5];
  const rl = ((data.roads && data.roads.list) || []).slice().sort((a, b) => (b[0] % 10) - (a[0] % 10));
  for (const r of rl) { const cls = r[0] % 10; g.strokeStyle = RC[cls] || '#888'; g.lineWidth = RW[cls] || 1; const pts = unpack(r, 2); g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke(); }
  return { canvas: c, R, S };
}

// NAIP validity mask: keep the big masked areas (blurred strip) but drop the small speckles (morphological closing
// of the white = valid area, radius 7 px of 256): otherwise the older z16 imagery shows through in dozens of blobs
function closeMask(g) {
  try {
    const N = 256; let R = 7; const id = g.getImageData(0, 0, N, N), d = id.data;
    let a = new Uint8Array(N * N); for (let i = 0; i < N * N; i++) a[i] = d[i * 4];
    const pass = (src, horiz, useMax) => { const out = new Uint8Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let m = useMax ? 0 : 255; for (let k = -R; k <= R; k++) { const xx = horiz ? clamp(x + k, 0, N - 1) : x, yy = horiz ? y : clamp(y + k, 0, N - 1); const v = src[yy * N + xx]; if (useMax ? v > m : v < m) m = v; } out[y * N + x] = m; } return out; };
    a = pass(pass(a, true, true), false, true); a = pass(pass(a, true, false), false, false);
    { const R0 = R; R = 3; a = pass(pass(a, true, false), false, false); R = R0; } // margin around the masked strip (its edges carry a halo)
    for (let i = 0; i < N * N; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = a[i]; d[i * 4 + 3] = 255; }
    g.putImageData(id, 0, 0);
  } catch (_) {}
}

/* ============================================================================================ build */
export async function buildArea(THREE, data, o = {}) {
  const q = o.quality || 'high', hi = q !== 'low';
  const now_ = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const T0 = now_(), timing = {}; const mark = (k) => { timing[k] = Math.round(now_() - T0); };
  const prog = typeof o.onProgress === 'function' ? o.onProgress : () => {};
  const base = o.base || new URL('../data/', import.meta.url).href;
  const ground = makeGround(data);
  const group = new THREE.Group(); group.name = 'heliArea';
  const hasDom = typeof document !== 'undefined';
  const renderer = o.renderer || null;
  const isGL2 = !!(renderer && renderer.capabilities && renderer.capabilities.isWebGL2);
  const yieldF = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));
  const sunDir = (o.sunDir && o.sunDir.isVector3 ? o.sunDir.clone() : new THREE.Vector3(-0.38, 0.62, 0.69)).normalize();
  const padXZ = o.pad || planToArea(data, 4.8, -27.5);
  /* ---------------- imagery: static z12 + clip windows z14 / z15 / z16 + NAIP */
  const levels = (data.tiles && data.tiles.levels) || [];
  const byZ = {}; for (const lv of levels) byZ[lv.z] = lv;
  const REF = [-1200, -1200, 1200, 1200]; // colour statistics are matched over the same ground for every level
  const online = hi && o.stream !== false && data.tiles && data.tiles.online && data.tiles.online.url ? data.tiles.online.url : null;
  const S0 = hasDom && byZ[12] ? makeClip(THREE, byZ[12], { N: hi ? 8 : 6, base, renderer: o.tileCopy === false ? null : renderer, online: null, ref: REF, conc: 6 }) : null;
  // z17 (NAIP ~0.9 m, downtown / Short North / Ohio State only, from data/heli-area-ext.json): high quality only
  const clipZ = [14, 15, 16, 17];
  const extra = (data.tiles && data.tiles.extra) || {};
  const CL = clipZ.map((z) => (hasDom && byZ[z] && (z < 17 || hi) ? makeClip(THREE, byZ[z], { N: hi ? 8 : 6, base, renderer: o.tileCopy === false ? null : renderer, online: z < 17 ? online : null, ref: z < 17 ? REF : null, conc: z >= 16 ? 4 : 3, extra: extra[z] || extra[String(z)] }) : null));
  let naip = null;
  if (hasDom && data.tiles && data.tiles.naip) {
    const N = data.tiles.naip; const b = N.bounds;
    const c = document.createElement('canvas'); c.width = c.height = hi ? 2048 : 1024; const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#6f7a63'; g.fillRect(0, 0, c.width, c.height);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.flipY = false;
    const mc = document.createElement('canvas'); mc.width = mc.height = 256; const mg = mc.getContext('2d', { willReadFrequently: true }); mg.fillStyle = '#fff'; mg.fillRect(0, 0, 256, 256);
    const mtex = new THREE.CanvasTexture(mc); mtex.flipY = false;
    naip = { canvas: c, tex, mask: mtex, bounds: new THREE.Vector4(b[0], b[1], b[2], b[3]), ready: false, stats: null,
      load: async () => {
        const rel = N.path.replace(/^data\//, '');
        const [im, mk] = await Promise.all([loadImg(base + rel), loadImg(base + rel.replace(/\.jpg$/, '-mask.png'))]);
        if (mk) { mg.drawImage(mk, 0, 0, 256, 256); if (mk.close) try { mk.close(); } catch (_) {} closeMask(mg); mtex.needsUpdate = true; }
        if (im) {
          g.drawImage(im, 0, 0, c.width, c.height); if (im.close) try { im.close(); } catch (_) {}
          tex.needsUpdate = true; naip.ready = true;
          try { // stats over the valid (mask) part only: sample a grid of 24² cells, skip masked-out cells
            const ex = await (async () => { const st = [0, 0, 0, 0, 0, 0, 0]; const md = mg.getImageData(0, 0, 256, 256).data; const sub = document.createElement('canvas'); sub.width = sub.height = 64; const sg = sub.getContext('2d', { willReadFrequently: true }); sg.drawImage(c, 0, 0, 64, 64); const d = sg.getImageData(0, 0, 64, 64).data; for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { if (md[((y * 4) * 256 + x * 4) * 4] < 200) continue; const k = (y * 64 + x) * 4; const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; const r = lin(d[k]), gg = lin(d[k + 1]), bb = lin(d[k + 2]); st[0] += r; st[1] += gg; st[2] += bb; st[3] += r * r; st[4] += gg * gg; st[5] += bb * bb; st[6]++; } return st; })();
            if (ex[6] > 50) naip.stats = ex;
          } catch (_) {}
        }
      } };
  }
  mark('levels');
  const water = hasDom ? waterMask(THREE, data, unpack, hi ? 2048 : 1024, isGL2) : null;
  mark('water');
  /* ---------------- terrain mesh: non-uniform grid ±30 km (dense in the middle) */
  const NG = hi ? 220 : 150, A = 7000, Bk = 23000;
  const Sx = (t) => Math.sign(t) * (A * Math.abs(t) + Bk * Math.pow(Math.abs(t), 4));
  const tg = new THREE.PlaneGeometry(2, 2, NG, NG); tg.rotateX(-Math.PI / 2);
  { const p = tg.attributes.position; for (let i = 0; i < p.count; i++) { const x = Sx(p.getX(i)), z = Sx(p.getZ(i)); const r = Math.hypot(x, z); const fall = r > 12000 ? -(r - 12000) * 0.004 : 0; p.setXYZ(i, x, ground(x, z) + fall, z); } tg.computeVertexNormals(); tg.computeBoundingSphere(); tg.computeBoundingBox(); }
  const blank = (() => { const t = new THREE.DataTexture(new Uint8Array([110, 120, 100, 255]), 1, 1); t.needsUpdate = true; return t; })();
  const zero = (() => { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); t.needsUpdate = true; return t; })();
  const V4 = (a, b, c, d) => new THREE.Vector4(a, b, c, d);
  const lin = (hex) => { const c = new THREE.Color(hex); return new THREE.Vector3(c.r, c.g, c.b); };
  const U = {
    tS0: { value: S0 ? S0.tex : blank }, mS0: { value: S0 ? S0.mask : zero }, gS0: { value: S0 ? S0.geo : V4(0, 0, 1, 1) }, wS0: { value: S0 ? S0.win : V4(0, 0, 1, 0) },
    tN: { value: naip ? naip.tex : blank }, tNm: { value: naip ? naip.mask : zero }, bN: { value: naip ? naip.bounds : V4(-1, -1, 1, 1) }, onN: { value: 0 },
    uLook: { value: V4(1.1, 1.05, hi ? 0.55 : 0.3, 1800) },
    uHor: { value: lin(o.horizon != null ? o.horizon : 0xc9d8e6) }, uZen: { value: lin(0x3d6fb8) },
    uHaze: { value: V4(1 / 26000, 0.8, 15000, 27500) }, uSun: { value: sunDir.clone() }, uTime: { value: 0 },
    uEmis: { value: 0.32 }, tDet: { value: detailTexture(THREE) },
    tW: { value: water ? water.tex : zero }, bW: { value: water ? water.bounds : V4(-1, -1, 1, 1) }, onW: { value: water ? 1 : 0 },
  };
  CL.forEach((C, i) => {
    U['tC' + i] = { value: C ? C.tex : blank }; U['mC' + i] = { value: C ? C.mask : zero };
    U['gC' + i] = { value: C ? C.geo : V4(0, 0, 1, 1) }; U['wC' + i] = { value: C ? C.win : V4(0, 0, 1, 0) };
  });
  for (let i = 0; i < 6; i++) { U['aG' + i] = { value: new THREE.Vector3(1, 1, 1) }; U['aO' + i] = { value: new THREE.Vector3(0, 0, 0) }; }
  const IMG_KEYS = Object.keys(U);
  const shareU = (sh, keys) => { for (const k of keys) sh.uniforms[k] = U[k]; };
  const tmat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  patch(tmat, 'heliTerrainV2', (sh) => {
    shareU(sh, IMG_KEYS);
    sh.vertexShader = SH.VS_DECL + rep(sh.vertexShader, '#include <fog_vertex>', '#include <fog_vertex>\n' + SH.VS_WORLD);
    let f = SH.TERRAIN_FS_DECL + sh.fragmentShader;
    f = rep(f, '#include <map_fragment>', SH.TERRAIN_FS_MAP);
    f = rep(f, '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + SH.TERRAIN_FS_EMIS);
    f = rep(f, '#include <fog_fragment>', '#include <fog_fragment>\n' + SH.HAZE_FRAG);
    sh.fragmentShader = f;
  });
  const terrain = new THREE.Mesh(tg, tmat); terrain.name = 'heliArea:terrain'; terrain.receiveShadow = true; terrain.frustumCulled = false; terrain.matrixAutoUpdate = false;
  group.add(terrain);
  mark('terrain');
  prog(0.05, areaS(o, 'prog_terrain'));
  /* ---------------- buildings (OSM + downtown + traced houses) */
  await yieldF();
  const hx = data.house ? data.house.x : 6.6, hz = data.house ? data.house.z : 11.7;
  const keep = (b) => { // traced houses: keep the renovated house and its helipad clear (any corner too close → drop)
    for (const [x, z] of unpack(b, 3)) if (Math.hypot(x - hx, z - hz) < 14 || Math.hypot(x - padXZ[0], z - padXZ[1]) < 13) return false;
    return true;
  };
  // phones: the extension's small houses / sheds (OSU / Short North neighbourhoods) are left to the imagery
  let base_ = (data.buildings && data.buildings.list) || [];
  if (!hi && data.ext && data.ext.bStart != null) base_ = base_.filter((b, i) => i < data.ext.bStart || !((b[2] === 0 || b[2] === 1) && b[0] < 90));
  const blist = base_.concat((data.downtown && data.downtown.list) || [], ((data.houses && data.houses.list) || []).filter(keep));
  const BL = buildBuildings(THREE, blist, ground, { quality: q, origin: padXZ });
  patch(BL.mat, 'heliBldV2', (sh) => {
    shareU(sh, IMG_KEYS);
    sh.vertexShader = SH.BLD_VS_DECL + rep(sh.vertexShader, '#include <fog_vertex>', '#include <fog_vertex>\n' + SH.BLD_VS);
    let f = SH.BLD_FS_DECL + sh.fragmentShader;
    f = rep(f, '#include <color_fragment>', SH.BLD_FS_COLOR);
    f = rep(f, '#include <roughnessmap_fragment>', SH.BLD_FS_ROUGH);
    f = rep(f, '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + SH.BLD_FS_EMIS);
    f = rep(f, '#include <fog_fragment>', '#include <fog_fragment>\n' + SH.HAZE_FRAG);
    sh.fragmentShader = f;
  });
  // nearest buildings now (the tour starts at home), everything else is generated progressively in time slices
  // after the world opens (each finished chunk appears on its own)
  const addBld = (m) => group.add(m);
  await BL.run({ maxDist: hi ? 2600 : 2200, sliceMs: 30, onMesh: addBld, yieldFn: yieldF });
  mark('buildings');
  prog(0.25, areaS(o, 'prog_buildings'));
  await yieldF();
  /* ---------------- trees */
  const TR = buildTrees(THREE, data, ground, { quality: q, obstacle: BL.obstacle });
  if (TR.mat) {
    patch(TR.mat, 'heliTreeV2', (sh) => {
      shareU(sh, ['uHor', 'uHaze', 'tDet']);
      sh.vertexShader = SH.TREE_VS_DECL + rep(sh.vertexShader, '#include <fog_vertex>', '#include <fog_vertex>\n' + SH.TREE_VS);
      let f = SH.TREE_FS_DECL + sh.fragmentShader;
      f = rep(f, '#include <color_fragment>', SH.TREE_FS_COLOR);
      f = rep(f, '#include <fog_fragment>', '#include <fog_fragment>\n' + SH.HAZE_FRAG);
      sh.fragmentShader = f;
    });
  }
  for (const m of TR.meshes) group.add(m);
  mark('trees');
  prog(0.35, areaS(o, 'prog_trees'));
  /* ---------------- house + pad */
  const house = buildHouse(THREE, data, ground, padXZ);
  group.add(house.group);
  group.traverse((x) => { x.userData.floor = 'main'; x.userData.heliArea = true; });
  /* ---------------- MFD / overview map */
  const map = buildMapCanvas(data, hi ? 1536 : 1024, 9500);
  mark('house+map');
  /* ---------------- colour grading of the imagery levels */
  const ALLC = [S0].concat(CL);
  const gradeU = [U.aG0, U.aG1, U.aG2, U.aG3, U.aG4], offU = [U.aO0, U.aO1, U.aO2, U.aO3, U.aO4];
  let gradeDirty = true;
  function regrade() {
    gradeDirty = false;
    const src = [S0 && S0.stats, CL[0] && CL[0].stats, CL[1] && CL[1].stats, CL[2] && CL[2].stats, naip && naip.stats];
    let ref = null; for (let i = 3; i >= 0 && !ref; i--) if (src[i] && src[i][6] >= 24 * 24 * 2) ref = src[i];
    if (!ref) return;
    for (let i = 0; i < 5; i++) {
      const gr = gradeFrom(src[i], ref);
      if (gr) { gradeU[i].value.set(gr[0][0], gr[0][1], gr[0][2]); offU[i].value.set(gr[1][0], gr[1][1], gr[1][2]); }
    }
  }
  /* ---------------- per-frame: imagery streaming, LOD, water time (driven by the terrain's onBeforeRender) */
  const SMALL_FAR = hi ? 3600 : 2400, SMALL_BUDGET = hi ? 420000 : 160000;
  let lastFrame = -1, lastT = 0, lastCx = padXZ[0], lastCz = padXZ[1];
  const camP = new THREE.Vector3();
  function frameUpdate(cx, cy, cz) {
    lastCx = cx; lastCz = cz;
    for (const C of ALLC) if (C && C.enabled) { C.recentre(cx, cz); if (C.flush(hi ? 3 : 2) && C.statsDirty) { C.statsDirty = false; gradeDirty = true; } }
    if (gradeDirty) regrade();
    // small houses / sheds: nearest chunks first under a triangle budget (big buildings always stay)
    {
      const sm = [];
      for (const m of BL.meshes) {
        if (!m.userData.lodSmall) continue;
        const [mx, mz] = m.userData.lodCentre;
        m.userData.d = Math.max(0, Math.hypot(cx - mx, cz - mz, Math.max(0, cy - 300) * 0.5) - m.userData.lodR);
        if (m.userData.tris == null) m.userData.tris = m.geometry.attributes.position.count / 3;
        sm.push(m);
      }
      sm.sort((a, b) => a.userData.d - b.userData.d);
      let budget = SMALL_BUDGET;
      for (const m of sm) {
        const vis = m.userData.d < SMALL_FAR * (m.visible ? 1.05 : 1) && m.userData.tris <= budget;
        if (vis) budget -= m.userData.tris;
        if (m.visible !== vis) m.visible = vis;
      }
    }
    TR.update && TR.update({ x: cx, y: cy, z: cz }, frustumOK ? frustum : null);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    U.uTime.value = (now / 1000) % 3600;
    lastT = now;
  }
  const frustum = THREE.Frustum ? new THREE.Frustum() : null, pv = new THREE.Matrix4(); let frustumOK = false;
  terrain.onBeforeRender = (r, scene, camera) => {
    try {
      const fr = r && r.info && r.info.render ? r.info.render.frame : -2;
      if (fr === lastFrame && fr !== -2) return; lastFrame = fr;
      try { if (frustum) { pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv); frustumOK = true; } } catch (_) { frustumOK = false; }
      camera.getWorldPosition(camP);
      frameUpdate(camP.x, camP.y, camP.z);
    } catch (e) { /* never break the frame */ }
  };
  /* ---------------- coarse imagery now, fine levels after the world opens */
  let tilesDone = 0;
  const N0 = CL[0] ? CL[0].N * CL[0].N : 0;
  const totalCoarse = (S0 ? S0.N * S0.N : 0) + N0 + (naip ? 1 : 0);
  const onTile = () => { tilesDone++; if (tilesDone % 6 === 0) prog(0.35 + 0.6 * Math.min(1, tilesDone / Math.max(1, totalCoarse)), areaS(o, 'prog_imagery')); };
  let areaDisposed = false; // V13: set by dispose() — stops the idle-wait polling loops
  const waitIdle = (C, ms) => new Promise((res) => {
    const t0 = Date.now();
    const tick = () => { if (areaDisposed || !C || C.fetchIdle() || Date.now() - t0 > ms) return res(); setTimeout(tick, 120); };
    tick();
  });
  const coarse = [];
  if (S0) { S0.enabled = true; S0.recentre(padXZ[0], padXZ[1], true); coarse.push(waitIdle(S0, 30000).then(() => { tilesDone += S0.N * S0.N; S0.flush(999); gradeDirty = true; })); }
  if (CL[0]) { CL[0].enabled = true; CL[0].recentre(padXZ[0], padXZ[1], true); coarse.push(waitIdle(CL[0], 30000).then(() => { tilesDone += N0; CL[0].flush(999); gradeDirty = true; })); }
  if (naip) coarse.push(naip.load().then(() => { U.onN.value = naip.ready ? 1 : 0; gradeDirty = true; onTile(); }));
  await Promise.all(coarse);
  regrade();
  mark('imagery');
  const bldDone = BL.run({ sliceMs: 6, onMesh: addBld }).then(() => { mark('buildingsAll'); }).catch((e) => console.warn('[heli-area] buildings', e));
  prog(0.97, areaS(o, 'prog_imagery2'));
  let detailP = null;
  function loadDetail() {
    if (detailP) return detailP;
    detailP = (async () => {
      const fine = [CL[3], CL[2], CL[1]].filter(Boolean);
      for (const C of fine) { C.enabled = true; C.recentre(lastCx, lastCz, true); }
      await Promise.all(fine.map((C) => waitIdle(C, 45000)));
      for (const C of fine) C.flush(999);
      regrade();
      return true;
    })().catch((e) => { console.warn('[heli-area] detail imagery', e); return false; });
    return detailP;
  }
  // heli.js calls stream.update(x, z) every frame with the helicopter position: keeps streaming alive even when the
  // terrain's onBeforeRender did not run (e.g. a frame rendered without the terrain)
  const stream = {
    update(x, z) {
      try {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - lastT > 250) frameUpdate(x, 300, z);
      } catch (_) {}
    },
    stats: () => ({ clips: [S0].concat(CL).filter(Boolean).map((C) => C.stats_()), ext: data.ext || null }),
  };
  function labelY(x, z, r = 60) {
    const g = ground(x, z);
    const t = BL.maxTop ? BL.maxTop(x, z, r) : -Infinity;
    return Math.max(g + 25, isFinite(t) ? t + 18 : -Infinity);
  }
  function texMB() {
    let px = 0;
    for (const C of ALLC) if (C) px += (C.N * 256) ** 2;
    if (naip) px += naip.canvas.width * naip.canvas.height;
    let mb = px * 4 * 1.333 / 1048576;
    if (water) mb += (water.tex.image.width * water.tex.image.height * (water.bytes || 4) * 1.333) / 1048576;
    return Math.round(mb);
  }
  function stats() {
    let meshes = 0, visible = 0, inst = 0;
    group.traverse((x) => { if (x.isMesh) { meshes++; if (x.visible) visible++; } if (x.isInstancedMesh && x.visible) inst += x.count; });
    return {
      meshes, visibleMeshes: visible, buildings: BL.count, buildingChunks: BL.meshes.length, buildingsPending: BL.pending, treeChunks: TR.meshes.length, trees: TR.count || 0, treesVisible: inst, treeTris: TR.triangles || 0,
      imagery: Object.assign({}, Object.fromEntries(ALLC.filter(Boolean).map((C) => [C.z, C.loaded + ' tiles' + (C.enabled ? '' : ' (off)')]))),
      naip: !!(naip && naip.ready), water: !!water, timing, textureMB: texMB(), grade: gradeU.map((g) => g.value.toArray().map((v) => +v.toFixed(2))), means: [S0 && S0.stats, CL[0] && CL[0].stats, CL[1] && CL[1].stats, CL[2] && CL[2].stats, naip && naip.stats].map(statMean), stream: stream.stats(),
    };
  }
  return {
    group, ground, obstacle: BL.obstacle, labelY, buildingsReady: bldDone, terrain, uniforms: U, levels: { 12: S0, 14: CL[0], 15: CL[1], 16: CL[2], 17: CL[3] }, naip, house, pad: house.pad, map, loadDetail, stats,
    labels: data.labels || [], tour: data.tour || [], attribution: data.attribution || {},
    setEmissive(v) { U.uEmis.value = v; },
    regrade() { regrade(); return gradeU.map((g) => g.value.toArray()); },
    // V13 memory: stop the progressive building build (heli.js frees the GPU resources itself)
    dispose() { areaDisposed = true; try { for (const C of ALLC) if (C && C.stop) C.stop(); } catch (_) {} try { BL.abort && BL.abort(); } catch (_) {} try { BL.meshes.length = 0; } catch (_) {} },
    update(camera) { try { if (camera && camera.getWorldPosition) { camera.getWorldPosition(camP); frameUpdate(camP.x, camP.y, camP.z); } } catch (_) {} },
    stream,
  };
}

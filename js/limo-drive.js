// limo-drive.js — V10 LIMO: the cinematic ride. The limousine stays still; a procedurally generated Columbus-like
// environment streams past the windows: suburban streets (Eakin Rd) → arterial (Georgesville Rd-like 4 lanes + turn
// lane, traffic lights, gas station, strip malls, trees) → highway glimpse → casino district at night → the glowing,
// original (fictional) "Eakin Grand Casino" facade. Recycled chunk slots (geometry swapped per template, merged per
// material), instanced traffic, a sky dome from afternoon to night, fog, WebAudio engine + road noise.
// Frame: same as the cabin (limo heading +x, curb side +z, cabin floor y = 0, road surface y = GROUND).
// No side effects on import.
import { Merger, boxUV, smoothstep, lerp, clamp01 } from './limo-util.js';
import { roadTex, grass as grassTex, concrete as concreteTex, buildingAtlas, atlasRect, ATLAS, casinoSign, decoPanel } from './limo-tex.js';
import { rand } from './mats.js';

export const GROUND = -0.36;
const C = 40;              // chunk length (m)
const SLOTS = 8;           // visible chunks: -40 … +280 m (fog ends at 360 m)
const BEHIND = 1;
const RIGHT = 1.85;        // right road edge (limo in the right-most lane, lane centre z = 0)
export const ROADS = { road2: 7.4, road4: 17.5, road6: 22.8 };
const PHASE_ROAD = { sub: 'road2', art: 'road4', hwy: 'road6', cas: 'road4', plaza: 'road4' };

/* ------------------------------------------------------------------------------------ speed profile */
// time (s) → speed (m/s); integrated once into a distance table. ~52 s, ~1.05 km.
export const DRIVE_T = 52;
const KEYS = [[0, 0], [4, 12], [11, 13], [14, 19], [27, 19], [30, 30], [39, 30], [43, 14], [47, 11], [52, 0]];
function speedAt(t) {
  if (t <= 0) return 0; if (t >= DRIVE_T) return 0;
  for (let i = 1; i < KEYS.length; i++) if (t <= KEYS[i][0]) { const [t0, v0] = KEYS[i - 1], [t1, v1] = KEYS[i]; const k = (t - t0) / (t1 - t0); return lerp(v0, v1, k * k * (3 - 2 * k)); }
  return 0;
}
export function makeProfile() {
  const dt = 0.02, T = [], D = [];
  let d = 0;
  for (let t = 0; t <= DRIVE_T + 1e-6; t += dt) { T.push(t); D.push(d); d += speedAt(t) * dt; }
  const total = d;
  const distAt = (t) => { if (t <= 0) return 0; if (t >= DRIVE_T) return total; const i = Math.min(D.length - 2, Math.floor(t / dt)); return lerp(D[i], D[i + 1], (t - T[i]) / dt); };
  const timeAt = (s) => { if (s <= 0) return 0; if (s >= total) return DRIVE_T; let lo = 0, hi = D.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (D[m] < s) lo = m; else hi = m; } return lerp(T[lo], T[hi], (s - D[lo]) / Math.max(1e-6, D[hi] - D[lo])); };
  const phaseAt = (s) => { if (s > total - 68) return 'plaza'; const t = timeAt(s); return t < 12 ? 'sub' : t < 28.5 ? 'art' : t < 41 ? 'hwy' : 'cas'; };
  return { total, distAt, timeAt, phaseAt, speedAt };
}

/* ------------------------------------------------------------------------------------ materials */
function driveMaterials(THREE) {
  const atlas = buildingAtlas(THREE);
  const roads = {};
  for (const k of Object.keys(ROADS)) roads[k] = new THREE.MeshStandardMaterial({ map: roadTex(THREE, k), roughness: 0.92 });
  const g = grassTex(THREE); g.repeat.set(1, 1);
  const c = concreteTex(THREE);
  return {
    roads,
    ground: new THREE.MeshStandardMaterial({ map: g, roughness: 1 }),
    walk: new THREE.MeshStandardMaterial({ map: c, roughness: 0.95 }),
    bld: new THREE.MeshStandardMaterial({ map: atlas.map, emissiveMap: atlas.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 }),
    misc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }),
    foliage: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }),
    lights: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: 0x666666 }),
  };
}

/* ------------------------------------------------------------------------------------ chunk templates */
// world-UV ground planes: u/v in metres / tile
function plane(THREE, x0, x1, z0, z1, y, tile) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
  return g;
}
function roadPlane(THREE, kind) {
  const w = ROADS[kind], z0 = RIGHT - w;
  const g = new THREE.PlaneGeometry(C, w); g.rotateX(-Math.PI / 2); g.translate(C / 2, GROUND + 0.01, z0 + w / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getZ(i) - z0) / w, p.getX(i) / 8);
  return g;
}
const TREE_COLS = [0x3f6a2c, 0x4d7a33, 0x56813a, 0x37602a, 0x6a8a3a];
// faceted crown: flat normals so it keeps the low-poly look inside the shared vertex-colour 'misc' material
const ICO = new Map();
function flatIco(THREE, r) { const k = Math.round(r * 20); if (!ICO.has(k)) { const g = new THREE.IcosahedronGeometry(k / 20, 1); g.deleteAttribute('normal'); g.computeVertexNormals(); ICO.set(k, g); } return ICO.get(k); }
function tree(THREE, M, x, z, r, s = 1) {
  const h = (2.2 + r() * 1.6) * s;
  M.add('misc', new THREE.CylinderGeometry(0.12 * s, 0.2 * s, h, 6), { pos: [x, GROUND + h / 2, z], color: 0x4a3426 });
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const rr = (1.3 + r() * 1.2) * s;
    M.add('misc', flatIco(THREE, rr), { pos: [x + (r() - 0.5) * 2 * s, GROUND + h + rr * 0.6 + (r() - 0.3) * 1.4 * s, z + (r() - 0.5) * 2 * s], color: TREE_COLS[Math.floor(r() * TREE_COLS.length)], scale: [1, 0.85, 1] });
  }
}
function streetLight(THREE, M, x, z, side, warm = true, tall = 8) {
  M.add('misc', new THREE.CylinderGeometry(0.08, 0.12, tall, 8), { pos: [x, GROUND + tall / 2, z], color: 0x4a4d52 });
  M.add('misc', new THREE.BoxGeometry(0.1, 0.1, 2.2), { pos: [x, GROUND + tall - 0.1, z - side * 1.1], color: 0x4a4d52 });
  M.add('misc', new THREE.BoxGeometry(0.5, 0.14, 0.3), { pos: [x, GROUND + tall - 0.2, z - side * 2.1], color: 0x3a3c40 });
  M.add('lights', new THREE.BoxGeometry(0.44, 0.03, 0.26), { pos: [x, GROUND + tall - 0.28, z - side * 2.1], color: warm ? 0xffc27a : 0xe8f0ff });
}
function house(THREE, M, x, z, w, d, r, side) {
  const h = 3 + r() * 0.6, cells = [ATLAS.houseBeige, ATLAS.houseBlue, ATLAS.houseBrick, ATLAS.houseWhite];
  const cell = cells[Math.floor(r() * cells.length)];
  const g = boxUV(THREE, w, h, d, atlasRect(cell));
  M.add('bld', g, { pos: [x, GROUND + h / 2, z], rot: [0, side > 0 ? Math.PI : 0, 0] });
  // gable roof: two slabs + gable triangles (misc)
  const pitch = 0.5, half = d / 2 + 0.4, rise = Math.tan(pitch) * half;
  const slab = Math.hypot(half, rise);
  const rr = atlasRect(ATLAS.roofShingle);
  for (const s of [-1, 1]) M.add('bld', boxUV(THREE, w + 0.6, 0.12, slab, rr), { pos: [x, GROUND + h + rise / 2, z + s * half / 2], rot: [s * pitch, 0, 0] });
  const tri = new THREE.Shape(); tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, rise * (d / 2) / half); tri.lineTo(-d / 2, 0);
  const tg = new THREE.ShapeGeometry(tri);
  for (const s of [-1, 1]) M.add('misc', tg, { pos: [x + s * (w / 2 + 0.01), GROUND + h, z], rot: [0, s * Math.PI / 2, 0], color: 0xe8e2d4 });
  // driveway + walkway
  const dz0 = side > 0 ? RIGHT + 2.9 : 0, dz1 = z - side * d / 2;
  M.add('misc', new THREE.BoxGeometry(3, 0.04, Math.abs(dz1 - (side > 0 ? 4.7 : -4.7 + 0))), { pos: [x + w / 2 - 1.2, GROUND + 0.03, (dz1 + side * 4.7) / 2], color: 0x8f8b83 });
  void dz0;
  // mailbox
  M.add('misc', new THREE.BoxGeometry(0.18, 0.2, 0.45), { pos: [x + w / 2 + 0.5, GROUND + 1.0, side * 5.0], color: 0x2a2c30 });
  M.add('misc', new THREE.CylinderGeometry(0.04, 0.04, 1, 6), { pos: [x + w / 2 + 0.5, GROUND + 0.5, side * 5.0], color: 0x5a4632 });
}
function shopRow(THREE, M, x0, x1, zFront, depth, cells, r, h = 5.5) {
  const n = Math.max(1, Math.round((x1 - x0) / 10)), w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const cell = cells[Math.floor(r() * cells.length)];
    M.add('bld', boxUV(THREE, w, h, depth, atlasRect(cell)), { pos: [x0 + w * (i + 0.5), GROUND + h / 2, zFront + depth / 2], rot: [0, Math.PI, 0] });
  }
  M.add('misc', new THREE.BoxGeometry(x1 - x0 + 0.4, 0.5, depth + 0.4), { pos: [(x0 + x1) / 2, GROUND + h + 0.2, zFront + depth / 2], color: 0x8a8580 }); // parapet
}
function trafficMast(THREE, M, x, zL) {
  M.add('misc', new THREE.CylinderGeometry(0.16, 0.2, 7, 10), { pos: [x, GROUND + 3.5, RIGHT + 1.2], color: 0x8c8f93 });
  const len = RIGHT + 1.2 - zL;
  M.add('misc', new THREE.CylinderGeometry(0.09, 0.12, len, 8), { pos: [x, GROUND + 6.6, RIGHT + 1.2 - len / 2], rot: [Math.PI / 2, 0, 0], color: 0x8c8f93 });
  for (const z of [-1.8, -5.3, -8.8]) {
    M.add('misc', new THREE.BoxGeometry(0.35, 1.05, 0.4), { pos: [x, GROUND + 6.0, z], color: 0x1e2022 });
    M.add('lights', new THREE.CylinderGeometry(0.11, 0.11, 0.04, 12), { pos: [x - 0.2, GROUND + 5.7, z], rot: [0, 0, Math.PI / 2], color: 0x30ff7a });
    M.add('misc', new THREE.CylinderGeometry(0.1, 0.1, 0.03, 12), { pos: [x - 0.2, GROUND + 6.05, z], rot: [0, 0, Math.PI / 2], color: 0x3a1a10 });
    M.add('misc', new THREE.CylinderGeometry(0.1, 0.1, 0.03, 12), { pos: [x - 0.2, GROUND + 6.35, z], rot: [0, 0, Math.PI / 2], color: 0x3a2a10 });
  }
  M.add('misc', new THREE.BoxGeometry(0.06, 0.45, 2.2), { pos: [x, GROUND + 6.95, -12.5], color: 0x1f6b3d }); // street-name sign (green, no text)
}
function gasStation(THREE, M, xc, r) {
  // canopy + pumps + store + pole sign (generic, no brand)
  M.add('misc', new THREE.BoxGeometry(16, 0.9, 11), { pos: [xc, GROUND + 5.2, 13], color: 0xf2f2ee });
  M.add('misc', new THREE.BoxGeometry(16.2, 0.35, 11.2), { pos: [xc, GROUND + 5.55, 13], color: 0xc8302a });
  M.add('lights', new THREE.BoxGeometry(14, 0.04, 9), { pos: [xc, GROUND + 4.73, 13], color: 0xf4f7ff });
  for (const dx of [-5, 5]) for (const dz of [10, 16]) {
    M.add('misc', new THREE.BoxGeometry(0.4, 4.8, 0.4), { pos: [xc + dx, GROUND + 2.4, dz], color: 0xe0e0dc });
    M.add('misc', new THREE.BoxGeometry(0.8, 1.6, 0.5), { pos: [xc + dx, GROUND + 0.8, dz + 1.2], color: 0xdcdcd6 });
    M.add('lights', new THREE.BoxGeometry(0.5, 0.3, 0.02), { pos: [xc + dx, GROUND + 1.25, dz + 0.94], color: 0x7ad0ff });
  }
  M.add('bld', boxUV(THREE, 14, 4.5, 9, atlasRect(ATLAS.gasStore)), { pos: [xc, GROUND + 2.25, 28], rot: [0, Math.PI, 0] });
  M.add('misc', new THREE.CylinderGeometry(0.2, 0.25, 9, 8), { pos: [xc + 9, GROUND + 4.5, 4.6], color: 0x8c8f93 });
  M.add('misc', new THREE.BoxGeometry(0.5, 3.2, 3), { pos: [xc + 9, GROUND + 8.4, 4.6], color: 0x222428 });
  M.add('lights', new THREE.BoxGeometry(0.52, 0.8, 2.6), { pos: [xc + 9, GROUND + 9.3, 4.6], color: 0xffd060 });
  M.add('lights', new THREE.BoxGeometry(0.52, 1.6, 2.6), { pos: [xc + 9, GROUND + 7.9, 4.6], color: 0x56e07a });
  void r;
}
function buildTemplate(THREE, phase, variant) {
  const r = rand(phase.length * 1000 + variant * 77 + 5);
  const M = new Merger(THREE);
  const road = PHASE_ROAD[phase], w = ROADS[road], zL = RIGHT - w;
  const night = phase === 'cas' || phase === 'plaza';
  M.add('road', roadPlane(THREE, road));
  // sidewalks + curbs, ground to the horizon
  const walkW = phase === 'hwy' ? 0 : phase === 'sub' ? 1.5 : 2.6;
  if (walkW) {
    M.add('walk', plane(THREE, 0, C, RIGHT + 1.2, RIGHT + 1.2 + walkW, GROUND + 0.12, 2));
    M.add('walk', plane(THREE, 0, C, zL - 1.2 - walkW, zL - 1.2, GROUND + 0.12, 2));
    for (const z of [RIGHT + 0.1, zL - 0.1]) M.add('misc', new THREE.BoxGeometry(C, 0.14, 0.22), { pos: [C / 2, GROUND + 0.06, z], color: 0xb8b4ac });
  }
  M.add('ground', plane(THREE, 0, C, RIGHT, 140, GROUND + 0.005, 6));
  M.add('ground', plane(THREE, 0, C, -140, zL, GROUND + 0.005, 6));
  if (phase === 'sub') {
    for (let i = 0; i < 2; i++) {
      const x = 10 + i * 20 + (r() - 0.5) * 3;
      house(THREE, M, x, 15 + r() * 4, 9 + r() * 3, 7.5 + r() * 1.5, r, 1);
      house(THREE, M, x + 4, zL - 15 - r() * 4, 9 + r() * 3, 7.5 + r() * 1.5, r, -1);
      tree(THREE, M, x - 6 + r() * 3, 8 + r() * 3, r);
      tree(THREE, M, x + r() * 6, zL - 8 - r() * 3, r);
      if (r() < 0.6) tree(THREE, M, x + 2, 26 + r() * 6, r, 1.3);
      if (r() < 0.6) tree(THREE, M, x - 3, zL - 26 - r() * 6, r, 1.3);
    }
    if (variant !== 1) streetLight(THREE, M, 20, RIGHT + 0.8, 1, true, 7);
    // power poles + wires on the left
    M.add('misc', new THREE.CylinderGeometry(0.13, 0.16, 9, 6), { pos: [5, GROUND + 4.5, zL - 1.4], color: 0x5c4a38 });
    M.add('misc', new THREE.BoxGeometry(0.12, 0.12, 1.8), { pos: [5, GROUND + 8.5, zL - 1.4], color: 0x5c4a38 });
    for (const dz of [-0.8, 0, 0.8]) M.add('misc', new THREE.BoxGeometry(C, 0.02, 0.02), { pos: [C / 2 + 5, GROUND + 8.6 - Math.abs(dz) * 0.1, zL - 1.4 + dz], color: 0x222222 });
  } else if (phase === 'art') {
    M.add('misc', new THREE.BoxGeometry(C, 0.02, 24), { pos: [C / 2, GROUND + 0.02, RIGHT + 6 + 12], color: 0x3c3c3f }); // parking
    for (let x = 2; x < C; x += 2.8) M.add('misc', new THREE.BoxGeometry(0.1, 0.025, 4.6), { pos: [x, GROUND + 0.035, RIGHT + 9], color: 0xd8d8d0 });
    if (variant === 0) gasStation(THREE, M, 18, r);
    else shopRow(THREE, M, 1, C - 1, 31, 14, variant === 1 ? [ATLAS.shopA, ATLAS.shopB] : [ATLAS.shopB, ATLAS.office, ATLAS.shopA], r);
    shopRow(THREE, M, 3, C - 3, zL - 40, 16, [ATLAS.office, ATLAS.shopA, ATLAS.shopB], r, 7 + r() * 5);
    for (let i = 0; i < 3; i++) tree(THREE, M, 5 + i * 14 + r() * 3, RIGHT + 4.6, r, 0.85);
    for (let i = 0; i < 2; i++) tree(THREE, M, 8 + i * 18, zL - 4, r, 0.9);
    streetLight(THREE, M, 6, RIGHT + 1.4, 1, false, 9); streetLight(THREE, M, 26, zL - 1.4, -1, false, 9);
    if (variant === 2) trafficMast(THREE, M, 36, zL);
  } else if (phase === 'hwy') {
    M.add('misc', new THREE.BoxGeometry(C, 0.85, 0.6), { pos: [C / 2, GROUND + 0.42, RIGHT - w / 2], color: 0xb9b5ac }); // median barrier
    M.add('misc', new THREE.BoxGeometry(C, 0.3, 0.08), { pos: [C / 2, GROUND + 0.65, RIGHT + 1.6], color: 0xc4c8cc });  // guardrail
    for (let x = 1; x < C; x += 4) M.add('misc', new THREE.BoxGeometry(0.12, 0.7, 0.12), { pos: [x, GROUND + 0.35, RIGHT + 1.65], color: 0x9a9ea2 });
    M.add('bld', boxUV(THREE, C, 4.5, 0.4, atlasRect(ATLAS.soundWall)), { pos: [C / 2, GROUND + 2.25, RIGHT + 9] });
    for (let i = 0; i < 4; i++) tree(THREE, M, 4 + i * 10 + r() * 4, RIGHT + 13 + r() * 6, r, 1.4);
    for (let i = 0; i < 4; i++) tree(THREE, M, 4 + i * 10 + r() * 4, zL - 8 - r() * 10, r, 1.3);
    // tall twin light poles on the median
    M.add('misc', new THREE.CylinderGeometry(0.12, 0.18, 12, 8), { pos: [20, GROUND + 6, RIGHT - w / 2], color: 0x8c8f93 });
    for (const s of [-1, 1]) { M.add('misc', new THREE.BoxGeometry(0.1, 0.1, 2.4), { pos: [20, GROUND + 11.9, RIGHT - w / 2 + s * 1.2], color: 0x8c8f93 }); M.add('lights', new THREE.BoxGeometry(0.5, 0.05, 0.3), { pos: [20, GROUND + 11.8, RIGHT - w / 2 + s * 2.3], color: 0xffd6a0 }); }
    if (variant === 1) { // overhead sign gantry (green, fictional exit text in the atlas)
      for (const z of [RIGHT + 1.8, zL - 1]) M.add('misc', new THREE.BoxGeometry(0.4, 7.5, 0.4), { pos: [24, GROUND + 3.75, z], color: 0x9a9ea2 });
      M.add('misc', new THREE.BoxGeometry(0.5, 0.5, w + 3), { pos: [24, GROUND + 7.4, RIGHT - w / 2 + 0.4], color: 0x9a9ea2 });
      M.add('bld', boxUV(THREE, 0.2, 3.4, 6.5, atlasRect(ATLAS.signGreen)), { pos: [23.7, GROUND + 5.5, -3], rot: [0, 0, 0] });
      M.add('lights', new THREE.BoxGeometry(0.3, 0.06, 6.4), { pos: [23.4, GROUND + 7.3, -3], color: 0xfff0d0 });
    }
  } else { // cas / plaza — night boulevard
    for (let i = 0; i < 3; i++) { // ornamental lamp posts with globe lights
      const x = 6 + i * 13;
      for (const [z, s] of [[RIGHT + 1.4, 1], [zL - 1.4, -1]]) {
        M.add('misc', new THREE.CylinderGeometry(0.07, 0.11, 4.5, 8), { pos: [x, GROUND + 2.25, z], color: 0x1c1c1e });
        M.add('lights', new THREE.SphereGeometry(0.28, 12, 8), { pos: [x, GROUND + 4.7, z], color: 0xffd28a });
        void s;
      }
    }
    if (phase === 'cas') {
      const cells = variant === 0 ? [ATLAS.neonA, ATLAS.hotel] : variant === 1 ? [ATLAS.hotel, ATLAS.neonB] : [ATLAS.neonB, ATLAS.neonA];
      const hh = 14 + r() * 26;
      M.add('bld', boxUV(THREE, 18, hh, 16, atlasRect(cells[0])), { pos: [12, GROUND + hh / 2, 24], rot: [0, Math.PI, 0] });
      M.add('bld', boxUV(THREE, 14, 9, 12, atlasRect(cells[1])), { pos: [31, GROUND + 4.5, 20], rot: [0, Math.PI, 0] });
      const lh = 20 + r() * 40;
      M.add('bld', boxUV(THREE, 20, lh, 18, atlasRect(ATLAS.hotel)), { pos: [20, GROUND + lh / 2, zL - 30] });
    }
    // string lights in the trees along the boulevard
    for (let i = 0; i < 2; i++) {
      const x = 12 + i * 18; tree(THREE, M, x, RIGHT + 4.2, r, 0.9);
      for (let k = 0; k < 10; k++) M.add('lights', new THREE.SphereGeometry(0.06, 6, 4), { pos: [x + Math.cos(k) * 1.6, GROUND + 3 + (k % 4) * 0.5, RIGHT + 4.2 + Math.sin(k * 1.7) * 1.6], color: 0xfff0c0 });
    }
  }
  const geos = {};
  for (const k of ['road', 'walk', 'ground', 'bld', 'misc', 'lights']) geos[k] = M.geometry(k);
  return { phase, variant, road, geos, night };
}

/* ------------------------------------------------------------------------------------ casino facade */
function buildCasino(THREE) {
  const g = new THREE.Group(); g.name = 'limo:casino';
  const deco = decoPanel(THREE);
  const front = new THREE.MeshStandardMaterial({ map: deco, emissiveMap: deco, emissive: 0xffd9a0, emissiveIntensity: 0.9, roughness: 0.5, metalness: 0.3 });
  deco.repeat.set(8, 2);
  const tower = new THREE.MeshStandardMaterial({ map: deco, emissiveMap: deco, emissive: 0xffe2b0, emissiveIntensity: 0.6, roughness: 0.5 });
  const gold = new THREE.MeshBasicMaterial({ color: 0xffc860, toneMapped: false });
  const signM = new THREE.MeshBasicMaterial({ map: casinoSign(THREE), toneMapped: false });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffe0b0, toneMapped: false });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15121a, roughness: 0.4, metalness: 0.4 });
  const carpetRed = new THREE.MeshStandardMaterial({ color: 0x8a0f1e, roughness: 0.9 });
  const Z = 30; // facade front line (m from the limo lane)
  const M = new Merger(THREE);
  // casino block + hotel tower (one textured draw call), stepped crown + spire (merged into dark / gold)
  M.add('front', new THREE.BoxGeometry(80, 22, 34), { pos: [0, GROUND + 11, Z + 17] });
  M.add('front', new THREE.BoxGeometry(34, 70, 26), { pos: [-6, GROUND + 35, Z + 40] });
  M.add('dark', new THREE.BoxGeometry(24, 8, 18), { pos: [-6, GROUND + 74, Z + 40] });
  M.add('dark', new THREE.BoxGeometry(12, 10, 10), { pos: [-6, GROUND + 83, Z + 40] });
  M.add('gold', new THREE.ConeGeometry(2.2, 14, 8), { pos: [-6, GROUND + 95, Z + 40] });
  // gold edge lines (stepped art-deco crown) + vertical fins
  for (const [w, y, d, z] of [[80.4, 22, 34.4, Z + 17], [34.4, 70, 26.4, Z + 40], [24.4, 78, 18.4, Z + 40], [12.4, 88, 10.4, Z + 40]]) {
    for (const s of [-1, 1]) { M.add('gold', new THREE.BoxGeometry(w, 0.35, 0.35), { pos: [0 + (w > 40 ? 0 : -6), GROUND + y, z + s * d / 2] }); M.add('gold', new THREE.BoxGeometry(0.35, 0.35, d), { pos: [(w > 40 ? 0 : -6) + s * w / 2, GROUND + y, z] }); }
  }
  for (let x = -38; x <= 38; x += 6.33) M.add('gold', new THREE.BoxGeometry(0.4, 18, 0.5), { pos: [x, GROUND + 11, Z - 0.1] });
  // porte-cochère canopy reaching over the drop-off lane (the limo stops under it), light grid underneath, gold columns
  const cz0 = -2.4, cd = Z - cz0;
  M.add('dark', new THREE.BoxGeometry(26, 1.2, cd), { pos: [0, GROUND + 6.6, cz0 + cd / 2] });
  M.add('gold', new THREE.BoxGeometry(26.3, 0.25, 0.25), { pos: [0, GROUND + 6.05, cz0] });
  for (const x of [-13.05, 13.05]) M.add('gold', new THREE.BoxGeometry(0.25, 0.25, cd), { pos: [x, GROUND + 6.05, cz0 + cd / 2] });
  for (let x = -11.5; x <= 11.5; x += 2.3) for (let z = cz0 + 1.2; z <= Z - 1; z += 2.4) M.add('glow', new THREE.SphereGeometry(0.15, 8, 6), { pos: [x, GROUND + 5.95, z] });
  for (const x of [-12, -4, 4, 12]) for (const z of [RIGHT + 1.6, Z - 3]) M.add('gold', new THREE.CylinderGeometry(0.42, 0.5, 6, 16), { pos: [x, GROUND + 3, z] });
  // entrance: glowing glass doors, red carpet, stanchions
  M.add('glow', new THREE.BoxGeometry(14, 4.5, 0.2), { pos: [0, GROUND + 2.25, Z - 0.15] });
  for (let x = -6; x <= 6; x += 2.4) M.add('dark', new THREE.BoxGeometry(0.18, 4.5, 0.3), { pos: [x, GROUND + 2.25, Z - 0.3] });
  M.add('carpet', new THREE.BoxGeometry(3.2, 0.04, Z - 2.6), { pos: [-0.5, GROUND + 0.14, (Z + 2.6) / 2] });
  for (const s of [-1, 1]) for (let z = 5; z < Z - 2; z += 3) M.add('gold', new THREE.CylinderGeometry(0.06, 0.12, 1, 10), { pos: [s * 3, GROUND + 0.5, z] });
  // forecourt paving + drop-off curb
  M.add('dark', new THREE.BoxGeometry(84, 0.1, Z - 2), { pos: [0, GROUND + 0.05, (Z + 2) / 2] });
  // the marquee sign: main facade, the canopy end facing the arriving cars, the tower (one draw call)
  M.add('sign', new THREE.PlaneGeometry(36, 9), { pos: [0, GROUND + 15.5, Z - 0.6], rot: [0, Math.PI, 0] });
  M.add('sign', new THREE.PlaneGeometry(14, 3.5), { pos: [-13.2, GROUND + 6.4, 9], rot: [0, -Math.PI / 2, 0] });
  M.add('sign', new THREE.PlaneGeometry(20, 5), { pos: [-6, GROUND + 64, Z + 26.8], rot: [0, Math.PI, 0] });
  M.build({ gold, glow, dark, carpet: carpetRed, front, sign: signM }, g);
  // marquee bulbs (chasing)
  const bulbs = [], bulbN = 120;
  for (let i = 0; i < bulbN; i++) { const k = i / bulbN; let x, y; if (k < 0.5) { x = -18.5 + k * 2 * 37; y = k < 0.25 ? 20.3 : 20.3; } else { x = -18.5 + (k - 0.5) * 2 * 37; y = 10.7; } bulbs.push(x, GROUND + y, Z - 0.7); }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bulbs, 3));
  bg.setAttribute('aIdx', new THREE.Float32BufferAttribute(Array.from({ length: bulbN }, (_, i) => i), 1));
  const bm = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float aIdx; uniform float uTime; varying float vA; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; float i = aIdx; vA = 0.35 + 0.65*step(0.5, fract(i/4.0 - uTime*1.5)); gl_PointSize = clamp(900.0/ -mv.z, 2.0, 18.0); }',
    fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vec3(1.0,0.86,0.55)*vA*1.6, a*vA); }' });
  const bp = new THREE.Points(bg, bm); bp.frustumCulled = false; g.add(bp);
  // searchlight beams (movie-premiere glamour)
  const beamM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uCol: { value: new THREE.Color(0xbfd8ff) } },
    vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uCol; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(1.0 - abs(dot(vN, vV)), 1.5); float a = (1.0 - vY) * (1.0 - vY) * 0.16 * (0.35 + 0.65 * (1.0 - edge)); gl_FragColor = vec4(uCol * a, a); }' });
  const beams = [];
  for (const [x, z] of [[-30, Z + 10], [-14, Z + 30], [14, Z + 30], [30, Z + 10]]) {
    const piv = new THREE.Group(); piv.position.set(x, GROUND + 22, z);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(4, 0.4, 160, 16, 1, true), beamM); cone.renderOrder = 5; cone.position.y = 80; piv.add(cone);
    g.add(piv); beams.push(piv);
  }
  g.userData = { Z, beams, bulbs: bm, front, tower: front };
  return g;
}

/* ------------------------------------------------------------------------------------ traffic */
function buildTraffic(THREE, n) {
  const M = new Merger(THREE);
  M.add('car', new THREE.BoxGeometry(4.6, 0.62, 1.82), { pos: [0, 0.55, 0], color: 0xffffff });
  M.add('car', new THREE.BoxGeometry(2.5, 0.55, 1.62), { pos: [-0.25, 1.12, 0], color: 0x2a3038 });
  for (const x of [-1.5, 1.45]) for (const z of [-0.8, 0.8]) M.add('car', new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12), { pos: [x, 0.33, z], rot: [Math.PI / 2, 0, 0], color: 0x111111 });
  const carG = M.geometry('car');
  for (const z of [-0.6, 0.6]) { M.add('lit', new THREE.BoxGeometry(0.05, 0.14, 0.32), { pos: [2.31, 0.66, z], color: 0xfff6e0 }); M.add('lit', new THREE.BoxGeometry(0.05, 0.14, 0.32), { pos: [-2.31, 0.7, z], color: 0xff2020 }); }
  const litG = M.geometry('lit');
  const carM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.5 });
  const litM = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const cars = new THREE.InstancedMesh(carG, carM, n), lits = new THREE.InstancedMesh(litG, litM, n);
  cars.frustumCulled = false; lits.frustumCulled = false; cars.name = 'limo:traffic'; lits.name = 'limo:trafficLights';
  const cols = [0xb8bcc2, 0x1d2a44, 0x7a1418, 0xe9e9e6, 0x2b2b2e, 0x3d5a3f, 0x8a8f96, 0x5a2e14];
  const list = [];
  for (let i = 0; i < n; i++) { cars.setColorAt(i, new THREE.Color(cols[i % cols.length])); lits.setColorAt(i, new THREE.Color(1, 1, 1)); list.push({ s: 0, z: -3.5, v: 0, dir: 1, on: false }); }
  return { cars, lits, list };
}
function lanesFor(road) {
  if (road === 'road2') return { same: [], opp: [-3.7] };
  if (road === 'road4') return { same: [-3.5], opp: [-10.5, -14.0] };
  return { same: [-3.6, -7.2], opp: [-13.8, -17.4] };
}

/* ------------------------------------------------------------------------------------ sky */
function buildSky(THREE) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBot: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0.5, 0.3, -0.6).normalize() }, uSunCol: { value: new THREE.Color() }, uNight: { value: 0 }, uGlow: { value: new THREE.Color(0xff9a50) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uTop, uHor, uBot, uSunCol, uSun, uGlow; uniform float uNight; varying vec3 vDir;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      void main(){ vec3 d = normalize(vDir); float y = d.y;
        vec3 c = y > 0.0 ? mix(uHor, uTop, pow(clamp(y,0.0,1.0), 0.55)) : mix(uHor, uBot, clamp(-y*6.0,0.0,1.0));
        float s = max(dot(d, normalize(uSun)), 0.0);
        c += uSunCol * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35);
        c += uGlow * uNight * 0.35 * exp(-max(y,0.0)*7.0);           // city glow at night
        vec3 q = floor(d * 380.0); float st = step(0.9975, h(q)) * smoothstep(0.05, 0.3, y);
        c += vec3(st) * uNight * (0.6 + 0.4*h(q+1.0));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), mat); m.name = 'limo:sky'; m.renderOrder = -10; m.frustumCulled = false;
  return m;
}
// t01 → sky/light keyframes (late afternoon → golden hour → dusk → night)
const SKY = [
  { t: 0.0, top: 0x4f86c6, hor: 0xcfe0ee, bot: 0x6a7a5a, sun: 0xfff1d0, sunY: 0.32, li: 2.4, lc: 0xfff0d8, hemi: 1.1, fog: 0xc8d8e4, night: 0 },
  { t: 0.35, top: 0x4a6fa8, hor: 0xf3c48e, bot: 0x5a5a48, sun: 0xffc27a, sunY: 0.12, li: 1.8, lc: 0xffc890, hemi: 0.85, fog: 0xe0b890, night: 0.1 },
  { t: 0.62, top: 0x2a3466, hor: 0xe07a5a, bot: 0x3a3238, sun: 0xff7a40, sunY: 0.01, li: 0.7, lc: 0xff9a68, hemi: 0.45, fog: 0x8a5a5e, night: 0.55 },
  { t: 0.82, top: 0x0b1028, hor: 0x3a2a48, bot: 0x16131c, sun: 0x803020, sunY: -0.1, li: 0.15, lc: 0x8090c0, hemi: 0.22, fog: 0x2a2234, night: 0.95 },
  { t: 1.0, top: 0x060a1c, hor: 0x2a1f38, bot: 0x0f0d14, sun: 0x000000, sunY: -0.2, li: 0.08, lc: 0x8090c0, hemi: 0.18, fog: 0x1e1828, night: 1 },
];

/* ------------------------------------------------------------------------------------ audio */
export function createEngineAudio(getCtx) {
  let A = null;
  function build() {
    if (A) return A;
    const ac = getCtx(); if (!ac) return null;
    const out = ac.createGain(); out.gain.value = 0; out.connect(ac.destination);
    // road/wind noise (brown-ish)
    const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const ng = ac.createGain(); ng.gain.value = 0.5;
    src.connect(lp).connect(ng).connect(out);
    // engine: two detuned saws through a low-pass
    const o1 = ac.createOscillator(), o2 = ac.createOscillator(); o1.type = 'sawtooth'; o2.type = 'sawtooth';
    o1.frequency.value = 38; o2.frequency.value = 38.6;
    const elp = ac.createBiquadFilter(); elp.type = 'lowpass'; elp.frequency.value = 160; elp.Q.value = 2;
    const eg = ac.createGain(); eg.gain.value = 0.16;
    o1.connect(elp); o2.connect(elp); elp.connect(eg).connect(out);
    src.start(); o1.start(); o2.start();
    A = { ac, out, lp, ng, o1, o2, elp, eg, src };
    return A;
  }
  return {
    set(speed, on) {
      const a = build(); if (!a) return;
      const t = a.ac.currentTime, k = clamp01(speed / 30);
      a.out.gain.setTargetAtTime(on ? 0.05 + 0.13 * k : 0, t, 0.35);
      a.lp.frequency.setTargetAtTime(180 + 900 * k, t, 0.3);
      const f = 34 + 46 * k + (speed > 0 ? 6 : 0);
      a.o1.frequency.setTargetAtTime(f, t, 0.4); a.o2.frequency.setTargetAtTime(f * 1.012, t, 0.4);
      a.elp.frequency.setTargetAtTime(140 + 220 * k, t, 0.4);
    },
    stop() { if (!A) return; try { A.out.gain.setTargetAtTime(0, A.ac.currentTime, 0.2); } catch (_) {} },
    dispose() { if (!A) return; try { A.src.stop(); A.o1.stop(); A.o2.stop(); A.out.disconnect(); } catch (_) {} A = null; },
    get built() { return !!A; },
  };
}

/* ------------------------------------------------------------------------------------ the drive */
export function createDrive(THREE, o = {}) {
  const quality = o.quality || 'high';
  const prof = makeProfile();
  const root = new THREE.Group(); root.name = 'limo:drive';
  const scen = new THREE.Group(); root.add(scen);           // sways slightly while moving
  const mats = driveMaterials(THREE);
  // templates (built once, lazily per phase)
  const TPL = new Map();
  const tpl = (phase, v) => { const k = phase + v; if (!TPL.has(k)) TPL.set(k, buildTemplate(THREE, phase, v)); return TPL.get(k); };
  const EMPTY = new THREE.BufferGeometry();
  // slots
  const keys = ['road', 'walk', 'ground', 'bld', 'misc', 'lights']; // 6 draw calls per chunk at most (frustum-culled)
  const slots = [];
  for (let i = 0; i < SLOTS; i++) {
    const g = new THREE.Group(); g.name = 'limo:chunk' + i; scen.add(g);
    const meshes = {};
    for (const k of keys) { const m = new THREE.Mesh(EMPTY, k === 'road' ? mats.roads.road2 : mats[k]); m.frustumCulled = true; m.matrixAutoUpdate = false; g.add(m); meshes[k] = m; }
    slots.push({ g, meshes, k: -9999 });
  }
  function assign(slot, k) {
    slot.k = k;
    const s = k * C + C / 2;
    const phase = prof.phaseAt(Math.max(0, s));
    const v = ((k * 2654435761) >>> 0) % 3;
    const T = tpl(phase, v);
    for (const key of keys) {
      const m = slot.meshes[key], geo = T.geos[key];
      m.geometry = geo || EMPTY; m.visible = !!geo;
      if (key === 'road') m.material = mats.roads[T.road];
    }
    slot.road = T.road; slot.phase = phase;
  }
  // traffic
  const traffic = buildTraffic(THREE, quality === 'low' ? 8 : 14);
  scen.add(traffic.cars, traffic.lits);
  const dummy = new THREE.Object3D();
  function roadAt(s) { return PHASE_ROAD[prof.phaseAt(Math.max(0, s))]; }
  function spawnCar(c, traveled, ahead = true) {
    const sAt = traveled + (ahead ? 200 + Math.random() * 140 : -60 - Math.random() * 30);
    const lanes = lanesFor(roadAt(sAt));
    const opp = !lanes.same.length || Math.random() < 0.6;
    const list = opp ? lanes.opp : lanes.same;
    c.dir = opp ? -1 : 1; c.z = list[Math.floor(Math.random() * list.length)]; c.s = sAt; c.on = true; c.v = opp ? 11 + Math.random() * 8 : 0;
    c.rel = opp ? 0 : (Math.random() - 0.4) * 5; // same-direction cars drift slowly relative to us
  }
  // casino
  const casino = buildCasino(THREE); scen.add(casino);
  // sky + lights + fog
  const sky = buildSky(THREE); root.add(sky);
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(60, 40, -80); root.add(sun); root.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a4030, 1); root.add(hemi);
  const fog = new THREE.Fog(0xc8d8e4, 70, 360);
  const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
  const st = { t: 0, traveled: 0, speed: 0, running: false, done: false, t01: 0, sway: 0 };
  function applySky(t01) {
    let a = SKY[0], b = SKY[SKY.length - 1];
    for (let i = 1; i < SKY.length; i++) if (t01 <= SKY[i].t) { a = SKY[i - 1]; b = SKY[i]; break; }
    const k = smoothstep(0, 1, (t01 - a.t) / Math.max(1e-4, b.t - a.t));
    const U = sky.material.uniforms;
    U.uTop.value.set(a.top).lerp(tmpC.set(b.top), k);
    U.uHor.value.set(a.hor).lerp(tmpC.set(b.hor), k);
    U.uBot.value.set(a.bot).lerp(tmpC.set(b.bot), k);
    U.uSunCol.value.set(a.sun).lerp(tmpC.set(b.sun), k);
    const sy = lerp(a.sunY, b.sunY, k);
    U.uSun.value.set(0.55, sy, -0.75).normalize();
    const night = lerp(a.night, b.night, k); U.uNight.value = night;
    sun.color.set(a.lc).lerp(tmpC2.set(b.lc), k); sun.intensity = lerp(a.li, b.li, k);
    sun.position.set(U.uSun.value.x * 100, Math.max(5, U.uSun.value.y * 100 + 10), U.uSun.value.z * 100);
    hemi.intensity = lerp(a.hemi, b.hemi, k);
    hemi.color.set(a.top).lerp(tmpC2.set(b.top), k).lerp(tmpC.set(0xffffff), 0.5);
    fog.color.set(a.fog).lerp(tmpC.set(b.fog), k);
    // night lights
    mats.bld.emissiveIntensity = night * 1.1;
    mats.lights.color.setScalar(0.25 + night * 1.6);
    traffic.lits.material.color.setScalar(0.3 + night * 1.5);
    casino.userData.front.emissiveIntensity = 0.15 + night * 0.55;
    casino.userData.tower.emissiveIntensity = 0.12 + night * 0.5;
    st.night = night;
  }
  function layout(dt, time) {
    const tr = st.traveled;
    const first = Math.floor(tr / C) - BEHIND;
    // recycle slots
    const need = new Set(); for (let k = first; k < first + SLOTS; k++) need.add(k);
    const free = slots.filter((s) => !need.has(s.k));
    const have = new Set(slots.map((s) => s.k));
    for (let k = first; k < first + SLOTS; k++) if (!have.has(k)) { const s = free.pop(); if (s) assign(s, k); }
    for (const s of slots) { s.g.position.x = s.k * C - tr; s.g.updateMatrixWorld(true); }
    // casino (stops with its entrance beside the limo)
    casino.position.x = prof.total - tr;
    casino.visible = casino.position.x < 520;
    const bm = casino.userData.beams;
    for (let i = 0; i < bm.length; i++) { bm[i].rotation.z = Math.sin(time * 0.35 + i * 1.7) * 0.45; bm[i].rotation.x = Math.cos(time * 0.27 + i) * 0.3; }
    casino.userData.bulbs.uniforms.uTime.value = time;
    // traffic
    const list = traffic.list;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.on) spawnCar(c, tr, Math.random() < 0.9);
      if (st.running && st.speed > 1) { c.s += (c.dir > 0 ? st.speed + c.rel : -c.v) * dt; }
      else if (c.dir < 0) c.s -= c.v * dt;
      const x = c.s - tr;
      if (x < -110 || x > 380) { spawnCar(c, tr, true); }
      const xx = c.s - tr;
      // hide cars whose lane does not exist on this road type (phase changes)
      const lanes = lanesFor(roadAt(c.s)), ok = (c.dir < 0 ? lanes.opp : lanes.same).includes(c.z) || Math.abs(xx) > 200;
      dummy.position.set(xx, GROUND, c.z); dummy.rotation.set(0, c.dir < 0 ? Math.PI : 0, 0); dummy.scale.setScalar(ok ? 1 : 0.0001); dummy.updateMatrix();
      traffic.cars.setMatrixAt(i, dummy.matrix); traffic.lits.setMatrixAt(i, dummy.matrix);
    }
    traffic.cars.instanceMatrix.needsUpdate = true; traffic.lits.instanceMatrix.needsUpdate = true;
  }
  const api = {
    root, sky, fog, prof, casino, slots, traffic, mats,
    get state() { return st; },
    get total() { return prof.total; },
    phase() { return prof.phaseAt(st.traveled); },
    // build every chunk template up front (call while a loading overlay is shown); yieldFn between templates
    async prebuild(yieldFn) { for (const ph of ['sub', 'art', 'hwy', 'cas', 'plaza']) for (let v = 0; v < 3; v++) { tpl(ph, v); if (yieldFn) await yieldFn(); } },
    templates: () => TPL.size,
    reset() { st.t = 0; st.traveled = 0; st.speed = 0; st.running = false; st.done = false; for (const c of traffic.list) c.on = false; applySky(0); layout(0, 0); },
    start() { st.running = true; st.done = false; },
    stop() { st.running = false; },
    skipTo(t) { st.t = Math.min(DRIVE_T, t); st.traveled = prof.distAt(st.t); st.speed = prof.speedAt(st.t); for (const c of traffic.list) c.on = false; },
    update(dt, time) {
      dt = Math.min(dt, 0.1);
      if (st.running && !st.done) {
        st.t += dt;
        if (st.t >= DRIVE_T) { st.t = DRIVE_T; st.done = true; st.running = false; }
        st.traveled = prof.distAt(st.t); st.speed = prof.speedAt(st.t);
      }
      st.t01 = st.t / DRIVE_T;
      applySky(st.t01);
      layout(dt, time);
      // gentle sway / road texture vibration while moving
      const k = clamp01(st.speed / 25);
      scen.rotation.x = Math.sin(time * 1.3) * 0.004 * k + Math.sin(time * 7.1) * 0.0008 * k;
      scen.position.y = Math.sin(time * 9.3) * 0.004 * k;
      scen.rotation.y = Math.sin(time * 0.45) * 0.006 * k;
    },
  };
  api.reset();
  return api;
}

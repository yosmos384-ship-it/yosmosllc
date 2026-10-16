// casino-venue.js — V10 CASINO: the 3D venue of the fictional "Eakin Grand Casino" (classic-Hollywood art-deco).
// World coordinates (metres, y up, feet on y = 0): building interior x −36…36, z −26…20 (ceiling 6 m), entrance on
// the south facade (z = 20) with three revolving doors, porte-cochère / red carpet / marquee / plaza outside (z 20…36).
// Zones: lobby (marble, z 11.6…20) · slot floor (west: 4 banks × 2 rows × 22 machines + a 10-machine carousel =
// 186 machines, 4 machine types) · table pit (centre: blackjack ×6, American roulette ×3, craps ×2, baccarat ×2) ·
// poker room (north-east, glass walls, 6 hold'em tables) · island bar with bar-top video poker + lounge (north) ·
// stage & lounge with live band (north-west) · cashier cage (east of the lobby) · steakhouse entrance (decor, east
// wall) · restrooms (west) · security domes on the ceiling grid.
// Draw calls are kept low: static geometry is merged per material (batcher), repeated things are InstancedMesh
// (slot cabinets / screens / stools / chairs / tables / chandeliers / bulbs / palms / chip stacks / cameras / crowd).
// Table FX (fx(station, evt, data)): roulette ball, dice and dealt cards animate on the table a game was opened from.
// Pure builder: buildVenue(THREE, {quality, renderer, L}) → {group, colliders, walkable, stations, rooms, nav, …}.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './casino-tex.js';
import { drawAttract } from './casino-symbols.js';
import { CLASSIC_KEY } from './casino-slots.js';
import { buildCrowd } from './casino-npc.js';

export const ROOM_BOXES = {
  entrance: [-34, 20, 34, 36], lobby: [-14, 11.6, 14, 20], floor: [-36, -14, -10, 11.6], floorSW: [-36, 11.6, -14, 20],
  pit: [-10, -12, 22, 11.6], poker: [22, -26, 36, -4], bar: [-10, -26, 22, -12], stage: [-36, -26, -10, -14],
  cage: [14, 11.6, 36, 20], steak: [22, -4, 36, 11.6],
};
const ROOM_LABEL = { entrance: 'room_entrance', lobby: 'room_lobby', floor: 'room_floor', floorSW: 'room_floor', pit: 'room_pit', poker: 'room_poker', bar: 'room_bar', stage: 'room_stage', cage: 'room_cage', steak: 'room_steak' };
// slot banks: z of the bank spine, machine type
const SLOT_BANKS = [{ z: 9, theme: 'hollywood' }, { z: 3, theme: 'gold' }, { z: -3, theme: 'buckeye' }, { z: -9, theme: CLASSIC_KEY }];
const SLOT_X0 = -33.5, SLOT_N = 22, SLOT_W = 0.75, SLOT_X1 = SLOT_X0 + SLOT_N * SLOT_W;
const CAROUSEL = { x: -24, z: 16.8, n: 10, r: 1.25, theme: 'hollywood' };
const THEMES4 = ['hollywood', 'gold', 'buckeye', CLASSIC_KEY];

/* =========================================================================================== geometry helpers */
function norm(THREE, g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
function createBatcher(THREE) {
  const lists = new Map();
  const add = (key, geo, m) => { if (m) geo.applyMatrix4(m); geo = norm(THREE, geo); if (!lists.has(key)) lists.set(key, []); lists.get(key).push(geo); return geo; };
  return {
    add,
    box(key, x0, y0, z0, x1, y1, z1) { const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return add(key, g); },
    boxC(key, cx, cy, cz, w, h, d, ry = 0) { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(cx, cy, cz); return add(key, g); },
    cyl(key, x, y, z, rt, rb, h, seg = 16, open = false) { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); g.translate(x, y, z); return add(key, g); },
    build(mats, parent) {
      const out = {};
      for (const [k, arr] of lists) {
        if (!mats[k]) { console.warn('[casino] no material', k); continue; }
        const g = arr.length === 1 ? arr[0] : mergeGeometries(arr, false);
        if (!g) { console.warn('[casino] merge failed', k); continue; }
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, mats[k]); m.name = 'casino-' + k; m.matrixAutoUpdate = false; m.updateMatrix();
        parent.add(m); out[k] = m;
      }
      lists.clear();
      return out;
    },
  };
}
// planar quads with world-scaled UVs
function quadGeo(THREE, P, uv) {
  const g = new THREE.BufferGeometry();
  const pos = [P[0], P[1], P[2], P[0], P[2], P[3]].flat();
  const u = [uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]].flat();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
  g.computeVertexNormals();
  return g;
}
const floorXZ = (THREE, x0, z0, x1, z1, y, tile, off = [0, 0]) => quadGeo(THREE, [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], [[x0 / tile + off[0], -z1 / tile + off[1]], [x1 / tile + off[0], -z1 / tile + off[1]], [x1 / tile + off[0], -z0 / tile + off[1]], [x0 / tile + off[0], -z0 / tile + off[1]]]);
const ceilXZ = (THREE, x0, z0, x1, z1, y, tile) => quadGeo(THREE, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [[x0 / tile, z0 / tile], [x1 / tile, z0 / tile], [x1 / tile, z1 / tile], [x0 / tile, z1 / tile]]);
// wall facing +z (n = 1) or −z (n = −1) at z, spanning x0…x1, y0…y1
function wallZ(THREE, x0, x1, y0, y1, z, n, tw, th) {
  const a = n > 0 ? [x0, x1] : [x1, x0];
  return quadGeo(THREE, [[a[0], y0, z], [a[1], y0, z], [a[1], y1, z], [a[0], y1, z]], [[a[0] * n / tw, y0 / th], [a[1] * n / tw, y0 / th], [a[1] * n / tw, y1 / th], [a[0] * n / tw, y1 / th]]);
}
// wall facing +x (n = 1) or −x (n = −1) at x, spanning z0…z1
function wallX(THREE, z0, z1, y0, y1, x, n, tw, th) {
  const a = n > 0 ? [z1, z0] : [z0, z1];
  return quadGeo(THREE, [[x, y0, a[0]], [x, y0, a[1]], [x, y1, a[1]], [x, y1, a[0]]], [[-a[0] * n / tw, y0 / th], [-a[1] * n / tw, y0 / th], [-a[1] * n / tw, y1 / th], [-a[0] * n / tw, y1 / th]]);
}
/** extrude a shape (XY) to a horizontal slab: shape y → world z, top face at y = top, thickness downward */
function slab(THREE, shape, top, depth, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 28 });
  g.rotateX(Math.PI / 2); g.translate(0, top, 0);
  return g;
}
function planarUV(g, flipV = true) {
  g.computeBoundingBox(); const b = g.boundingBox; const p = g.attributes.position, uv = g.attributes.uv;
  const w = b.max.x - b.min.x || 1, d = b.max.z - b.min.z || 1;
  for (let i = 0; i < p.count; i++) { const u = (p.getX(i) - b.min.x) / w, v = (p.getZ(i) - b.min.z) / d; uv.setXY(i, u, flipV ? 1 - v : v); }
  uv.needsUpdate = true; return g;
}
function halfEllipse(THREE, rx, rz) { const s = new THREE.Shape(); s.moveTo(-rx, 0); s.lineTo(rx, 0); s.absellipse(0, 0, rx, rz, 0, Math.PI, false); return s; }
function arcBand(THREE, rx, rz, w) {
  const s = new THREE.Shape(); const N = 40;
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI; const x = Math.cos(a) * (rx + w), y = Math.sin(a) * (rz + w); i ? s.lineTo(x, y) : s.moveTo(x, y); }
  for (let i = N; i >= 0; i--) { const a = (i / N) * Math.PI; s.lineTo(Math.cos(a) * rx, Math.sin(a) * rz); }
  s.closePath(); return s;
}
function roundRect(THREE, w, d, r) { const s = new THREE.Shape(); const x = -w / 2, y = -d / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
function ringOf(THREE, w, d, r, t) { const s = roundRect(THREE, w + 2 * t, d + 2 * t, r + t); s.holes.push(roundRect(THREE, w, d, r)); return s; }
function stadium(THREE, len, r) { const s = new THREE.Shape(); s.moveTo(-len / 2, -r); s.lineTo(len / 2, -r); s.absarc(len / 2, 0, r, -Math.PI / 2, Math.PI / 2, false); s.lineTo(-len / 2, r); s.absarc(-len / 2, 0, r, Math.PI / 2, Math.PI * 1.5, false); return s; }
const yawTo = (sx, sz, tx, tz) => Math.atan2(-(tx - sx), -(tz - sz)); // player yaw (look = (−sin, −cos))
const faceYaw = (px, pz, tx, tz) => Math.atan2(tx - px, tz - pz); // NPC yaw (front = +z)


/* =========================================================================================== venue */
export function buildVenue(THREE, { quality = 'high', renderer = null, L = (k) => k } = {}) {
  void renderer;
  const low = quality === 'low';
  const TS = (n) => (low ? Math.max(128, n / 2) : n);
  const group = new THREE.Group(); group.name = 'casino-venue';
  const B = createBatcher(THREE);
  const colliders = [];
  const col = (x0, z0, x1, z1, y0 = 0, y1 = 3) => colliders.push(new THREE.Box3(new THREE.Vector3(Math.min(x0, x1), y0, Math.min(z0, z1)), new THREE.Vector3(Math.max(x0, x1), y1, Math.max(z0, z1))));
  const textures = [];
  const T = (c, o) => { const t = TX.tex(THREE, c, Object.assign({ aniso: low ? 2 : 8 }, o)); textures.push(t); return t; };
  const anim = []; // per-frame updaters (dt, t)
  const stations = [];
  const signs = [];
  const bm = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), cc = new THREE.Color();
  const X0 = -36, X1 = 36, Z0 = -26, Z1 = 20, H = 6;

  /* ------------------------------------------------------------------ materials */
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const tCarpet = T(TX.carpet(TS(1024), 'burgundy'));
  const tPit = T(TX.pitCarpet(TS(512)));
  const tPoker = T(TX.carpet(TS(512), 'emerald'));
  const tMarble = T(TX.marble(TS(512)));
  const tWall = T(TX.wallPanel(TS(512), TS(768)));
  const tFacade = T(TX.facade(TS(512)));
  const cofCan = TX.canvas(128); { const x = cofCan.getContext('2d'); const g = x.createRadialGradient(64, 64, 10, 64, 64, 90); g.addColorStop(0, '#120d10'); g.addColorStop(0.62, '#1d1418'); g.addColorStop(0.9, '#a8763a'); g.addColorStop(1, '#ffd79a'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  const tCoffer = T(cofCan);
  const M = {
    carpet: std({ map: tCarpet, roughness: 0.95 }),
    pit: std({ map: tPit, roughness: 0.95 }),
    pokerCarpet: std({ map: tPoker, roughness: 0.95 }),
    marble: std({ map: tMarble, roughness: 0.18, metalness: 0.0 }),
    wall: std({ map: tWall, roughness: 0.42, metalness: 0.08 }),
    facade: std({ map: tFacade, roughness: 0.85 }),
    coffer: std({ color: 0x241a18, emissive: 0xffffff, emissiveMap: tCoffer, emissiveIntensity: 0.9, roughness: 0.6 }),
    beam: std({ color: 0x1a1210, roughness: 0.4, metalness: 0.2 }),
    gold: std({ color: 0xd9b46a, roughness: 0.28, metalness: 1.0 }),
    brass: std({ color: 0xb8903e, roughness: 0.38, metalness: 1.0 }),
    chrome: std({ color: 0xdedede, roughness: 0.15, metalness: 1.0 }),
    mirror: std({ color: 0xc8c0b0, roughness: 0.04, metalness: 1.0 }),
    lacquer: std({ color: 0x0d0a09, roughness: 0.18, metalness: 0.3 }),
    wood: std({ color: 0x3a1d0e, roughness: 0.38, metalness: 0.05 }),
    leather: std({ color: 0x2a0f0c, roughness: 0.42, metalness: 0.05 }),
    velvet: std({ color: 0x8a0f1e, roughness: 0.85 }),
    redCarpet: std({ color: 0x8e0f1c, roughness: 0.95 }),
    paving: std({ map: T(TX.marble(TS(256), 9), { repeat: [1, 1] }), color: 0x9a9088, roughness: 0.6 }),
    asphalt: std({ color: 0x15161a, roughness: 0.92 }),
    glass: std({ color: 0xbfd8e6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
    warmLight: new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
    led: new THREE.MeshBasicMaterial({ color: 0xffb867 }),
    ledMagenta: new THREE.MeshBasicMaterial({ color: 0xff4fb8 }),
    darkMetal: std({ color: 0x1c1c20, roughness: 0.5, metalness: 0.7 }),
    stone: std({ color: 0xe9e2d4, roughness: 0.3 }),
    plant: std({ color: 0x3f8a3c, emissive: 0x0c2a0e, roughness: 0.7, side: THREE.DoubleSide }),
    trunk: std({ color: 0x5a4430, roughness: 0.9 }),
    curtain: std({ map: T(TX.curtain(TS(512), TS(512))), roughness: 0.9 }),
    stageWood: std({ color: 0x2a140a, roughness: 0.25, metalness: 0.1 }),
    piano: std({ color: 0x050505, roughness: 0.08, metalness: 0.4 }),
    steakGlass: new THREE.MeshBasicMaterial({ map: T(TX.steakGlass(TS(256), TS(512)), { wrap: false }) }),
  };
  M.marble.envMapIntensity = 1.2; M.gold.envMapIntensity = 1.4; M.mirror.envMapIntensity = 1.5; M.piano.envMapIntensity = 1.6;

  /* ------------------------------------------------------------------ floors (+ walkable) */
  const add = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.matrixAutoUpdate = false; m.updateMatrix(); group.add(m); return m; };
  B.add('carpet', floorXZ(THREE, X0, Z0, X1, 11.6, 0, 3));
  B.add('carpet', floorXZ(THREE, X0, 11.6, -14, Z1, 0, 3)); B.add('carpet', floorXZ(THREE, 14, 11.6, X1, Z1, 0, 3));
  B.add('marble', floorXZ(THREE, -14, 11.6, 14, Z1, 0, 2.4));
  B.add('pit', floorXZ(THREE, -9.6, -11.6, 21.6, 10.8, 0.006, 2.5));
  B.add('pokerCarpet', floorXZ(THREE, 22, Z0, X1, -4, 0.006, 3));
  const inlay = add(new THREE.CircleGeometry(2.4, 48).rotateX(-Math.PI / 2).translate(0, 0.008, 15.6), std({ map: T(TX.inlay(TS(512)), { wrap: false }), transparent: true, roughness: 0.2, metalness: 0.2 }), 'casino-inlay');
  void inlay;
  // plaza / road
  B.add('paving', floorXZ(THREE, -34, 20.3, 34, 36, 0, 1.2));
  B.add('redCarpet', floorXZ(THREE, -1.4, 20.35, 1.4, 33.5, 0.012, 2));
  B.add('asphalt', floorXZ(THREE, -70, 36, 70, 48, -0.12, 4));
  B.box('stone', -70, -0.12, 35.8, 70, 0.04, 36.2); // curb
  const walk = new THREE.Mesh(new THREE.BoxGeometry(80, 0.2, 64), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  walk.position.set(0, -0.1, 5); walk.visible = false; walk.name = 'casino-walkable'; group.add(walk); walk.updateMatrixWorld(true);

  /* ------------------------------------------------------------------ shell: walls, facade, ceiling */
  B.add('wall', wallZ(THREE, X0, X1, 0, H, Z0, 1, 4, H));
  B.add('wall', wallX(THREE, Z0, Z1, 0, H, X0, 1, 4, H));
  B.add('wall', wallX(THREE, Z0, Z1, 0, H, X1, -1, 4, H));
  B.add('wall', wallZ(THREE, X0, -4.8, 0, H, Z1, -1, 4, H)); B.add('wall', wallZ(THREE, 4.8, X1, 0, H, Z1, -1, 4, H));
  B.add('wall', wallZ(THREE, -4.8, 4.8, 3.4, H, Z1, -1, 4, H));
  for (const [x0, z0, x1, z1] of [[X0, Z0 + 0.02, X1, Z0 + 0.1], [X0, Z1 - 0.1, X1, Z1 - 0.02], [X0 + 0.02, Z0, X0 + 0.1, Z1], [X1 - 0.1, Z0, X1 - 0.02, Z1]]) B.box('led', x0, H - 0.18, z0, x1, H - 0.12, z1);
  col(X0 - 0.5, Z0 - 0.3, X1 + 0.5, Z0); col(X0 - 0.3, Z0, X0, Z1 + 0.3); col(X1, Z0, X1 + 0.3, Z1 + 0.3);
  const FZ = 20.3;
  B.add('facade', wallZ(THREE, X0 - 0.3, -4.8, 0, 12, FZ, 1, 6, 6)); B.add('facade', wallZ(THREE, 4.8, X1 + 0.3, 0, 12, FZ, 1, 6, 6));
  B.add('facade', wallZ(THREE, -4.8, 4.8, 3.4, 12, FZ, 1, 6, 6));
  B.add('facade', wallX(THREE, Z0 - 0.3, FZ, 0, 12, X1 + 0.3, 1, 6, 6)); B.add('facade', wallX(THREE, Z0 - 0.3, FZ, 0, 12, X0 - 0.3, -1, 6, 6));
  B.box('facade', -4.8, 3.4, Z1, 4.8, 3.42, FZ);
  B.box('gold', X0 - 0.4, 11.7, FZ - 0.02, X1 + 0.4, 12.1, FZ + 0.3);
  for (let x = -33; x <= 33; x += 6) if (Math.abs(x) > 10) B.box('gold', x - 0.18, 0, FZ, x + 0.18, 11.7, FZ + 0.15);
  // deco wing fins on the facade (vertical neon-gold strips) for the night silhouette
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) B.box('led', sx * (12.2 + k * 0.7) - 0.05, 0.4, FZ + 0.16, sx * (12.2 + k * 0.7) + 0.05, 11.2 - k * 1.2, FZ + 0.2);
  col(X0 - 0.3, Z1, -4.6, FZ, 0, 4); col(4.6, Z1, X1 + 0.3, FZ, 0, 4);
  // ceiling coffers (glowing rims) + beam grid (beams on multiples of 4 so the coffers line up)
  B.add('coffer', ceilXZ(THREE, X0, Z0, X1, Z1, H, 4));
  for (let x = -32; x <= 32; x += 4) B.box('beam', x - 0.22, H - 0.42, Z0, x + 0.22, H, Z1);
  for (let z = -24; z <= 16; z += 4) B.box('beam', X0, H - 0.42, z - 0.22, X1, H, z + 0.22);
  for (let x = -32; x <= 32; x += 4) B.box('gold', x - 0.23, H - 0.44, Z0, x + 0.23, H - 0.42, Z1);
  // columns (mirror shaft, gold capital / base)
  for (const [cx, cz] of [[-10.6, -12.8], [-8, 16.6], [8, 16.6]]) {
    B.boxC('mirror', cx, H / 2, cz, 0.8, H, 0.8); B.boxC('gold', cx, H - 0.45, cz, 1.0, 0.25, 1.0); B.boxC('gold', cx, 0.12, cz, 0.98, 0.24, 0.98);
    B.boxC('gold', cx, 1.2, cz, 0.84, 0.06, 0.84); col(cx - 0.5, cz - 0.5, cx + 0.5, cz + 0.5);
  }

  /* ------------------------------------------------------------------ entrance: revolving doors, marquee, porte-cochère */
  const DOOR_X = [-3.2, 0, 3.2], DR = 1.35, DH = 2.6, DZ = 20.15;
  const wingGeo = (() => { const parts = []; for (let k = 0; k < 4; k++) { const g = new THREE.BoxGeometry(DR - 0.08, DH - 0.12, 0.03); g.translate((DR - 0.08) / 2 + 0.05, DH / 2, 0); g.rotateY(k * Math.PI / 2); parts.push(norm(THREE, g)); } return mergeGeometries(parts, false); })();
  const wings = new THREE.InstancedMesh(wingGeo, M.glass, DOOR_X.length); wings.name = 'casino-door-wings'; wings.frustumCulled = false; group.add(wings);
  for (const dx of DOOR_X) {
    for (const s of [1, -1]) {
      const g = new THREE.CylinderGeometry(DR, DR, DH, 24, 1, true, s > 0 ? Math.PI / 4 : Math.PI * 1.25, Math.PI / 2); g.translate(dx, DH / 2, DZ); B.add('glass', g);
      col(dx + s * DR * 0.72, DZ - DR * 0.72, dx + s * (DR + 0.05), DZ + DR * 0.72);
    }
    B.cyl('gold', dx, DH + 0.06, DZ, DR + 0.08, DR + 0.08, 0.12, 32); B.cyl('gold', dx, 0.015, DZ, DR, DR, 0.03, 32);
    B.cyl('chrome', dx, DH / 2, DZ, 0.05, 0.05, DH, 10);
  }
  for (const mx of [-1.6, 1.6, -4.7, 4.7]) { B.box('gold', mx - 0.2, 0, 19.95, mx + 0.2, 3.4, 20.35); col(mx - 0.2, 19.95, mx + 0.2, 20.35); }
  B.add('glass', wallZ(THREE, -4.8, 4.8, DH + 0.12, 3.4, 20.2, 1, 1, 1));
  let wingA = 0;
  anim.push((dt) => { wingA += dt * 0.35; DOOR_X.forEach((dx, i) => { bm.compose(v.set(dx, 0, DZ), q.setFromEuler(new THREE.Euler(0, wingA + i * 0.4, 0)), s1); wings.setMatrixAt(i, bm); }); wings.instanceMatrix.needsUpdate = true; });
  // porte-cochère: deep lacquer canopy on 4 gold columns, recessed lights, gold fascia with chasing bulbs
  B.box('lacquer', -10.5, 4.45, FZ, 10.5, 4.95, 28.6); B.box('gold', -10.6, 4.38, 28.5, 10.6, 5.02, 28.7);
  B.box('gold', -10.6, 4.38, FZ, -10.4, 5.02, 28.7); B.box('gold', 10.4, 4.38, FZ, 10.6, 5.02, 28.7);
  for (const [cx, cz] of [[-9.8, 28.0], [9.8, 28.0], [-9.8, 23.4], [9.8, 23.4]]) { B.cyl('gold', cx, 2.2, cz, 0.2, 0.26, 4.4, 20); B.cyl('lacquer', cx, 0.3, cz, 0.36, 0.4, 0.6, 20); col(cx - 0.42, cz - 0.42, cx + 0.42, cz + 0.42); }
  for (let x = -9; x <= 9; x += 1.5) for (let z = 21.4; z <= 27.8; z += 1.6) B.cyl('warmLight', x, 4.44, z, 0.11, 0.11, 0.02, 14);
  // marquee sign on the facade + chasing bulbs
  const MQ = { x0: -8.5, x1: 8.5, y0: 5.6, y1: 9.8, z: FZ + 0.08 };
  const tMarquee = T(TX.marqueeSign(TS(1024), TS(256)), { wrap: false });
  add(new THREE.PlaneGeometry(MQ.x1 - MQ.x0, MQ.y1 - MQ.y0).translate(0, (MQ.y0 + MQ.y1) / 2, MQ.z + 0.02), new THREE.MeshBasicMaterial({ map: tMarquee, toneMapped: false }), 'casino-marquee');
  B.box('gold', MQ.x0 - 0.35, MQ.y0 - 0.35, FZ, MQ.x1 + 0.35, MQ.y0 - 0.05, FZ + 0.25); B.box('gold', MQ.x0 - 0.35, MQ.y1 + 0.05, FZ, MQ.x1 + 0.35, MQ.y1 + 0.35, FZ + 0.25);
  B.box('gold', MQ.x0 - 0.35, MQ.y0 - 0.35, FZ, MQ.x0 - 0.05, MQ.y1 + 0.35, FZ + 0.25); B.box('gold', MQ.x1 + 0.05, MQ.y0 - 0.35, FZ, MQ.x1 + 0.35, MQ.y1 + 0.35, FZ + 0.25);
  for (let k = 0; k < 4; k++) B.box('gold', -2.4 + k * 0.6, MQ.y1 + 0.35, FZ, 2.4 - k * 0.6, MQ.y1 + 0.75 + k * 0.45, FZ + 0.2);
  // theatre marquee on the porte-cochère front (the sign you see from the plaza / the limo): lit panel + gold frame
  const CM = { x0: -5.4, x1: 5.4, y0: 5.08, y1: 7.78, z: 28.62 };
  add(new THREE.PlaneGeometry(CM.x1 - CM.x0, CM.y1 - CM.y0).translate(0, (CM.y0 + CM.y1) / 2, CM.z + 0.13), new THREE.MeshBasicMaterial({ map: tMarquee, toneMapped: false }), 'casino-marquee-front');
  B.box('lacquer', CM.x0 - 0.1, CM.y0 - 0.06, CM.z - 0.25, CM.x1 + 0.1, CM.y1 + 0.1, CM.z + 0.1);
  B.box('gold', CM.x0 - 0.4, CM.y0 - 0.06, CM.z + 0.08, CM.x0 - 0.1, CM.y1 + 0.4, CM.z + 0.2); B.box('gold', CM.x1 + 0.1, CM.y0 - 0.06, CM.z + 0.08, CM.x1 + 0.4, CM.y1 + 0.4, CM.z + 0.2);
  B.box('gold', CM.x0 - 0.4, CM.y1 + 0.1, CM.z + 0.08, CM.x1 + 0.4, CM.y1 + 0.4, CM.z + 0.2);
  for (let k = 0; k < 3; k++) B.box('gold', -1.6 + k * 0.5, CM.y1 + 0.4, CM.z + 0.02, 1.6 - k * 0.5, CM.y1 + 0.7 + k * 0.32, CM.z + 0.18);
  // film-reel rosettes either side of the marquee (Hollywood motif)
  for (const sx of [-1, 1]) {
    const cx = sx * 10.6, cy = 7.7, z = FZ + 0.12;
    const ring = new THREE.TorusGeometry(1.25, 0.09, 8, 48); ring.translate(cx, cy, z); B.add('gold', ring);
    const hub = new THREE.CylinderGeometry(0.22, 0.22, 0.12, 20); hub.rotateX(Math.PI / 2); hub.translate(cx, cy, z); B.add('gold', hub);
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const sp = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 18); sp.rotateX(Math.PI / 2); sp.translate(cx + Math.cos(a) * 0.72, cy + Math.sin(a) * 0.72, z); B.add('lacquer', sp); }
    for (let k = 0; k < 3; k++) B.add('gold', new THREE.BoxGeometry(0.08, 2.4, 0.06).rotateZ(k * Math.PI / 3 + Math.PI / 6).translate(cx, cy, z + 0.02));
  }
  const bulbPos = [];
  const per = (x0, y0, x1, y1, n, z) => { for (let i = 0; i < n; i++) bulbPos.push([x0 + (x1 - x0) * (i + 0.5) / n, y0 + (y1 - y0) * (i + 0.5) / n, z]); };
  per(MQ.x0 - 0.2, MQ.y0 - 0.2, MQ.x1 + 0.2, MQ.y0 - 0.2, 48, FZ + 0.3); per(MQ.x1 + 0.2, MQ.y0 - 0.2, MQ.x1 + 0.2, MQ.y1 + 0.2, 13, FZ + 0.3);
  per(MQ.x1 + 0.2, MQ.y1 + 0.2, MQ.x0 - 0.2, MQ.y1 + 0.2, 48, FZ + 0.3); per(MQ.x0 - 0.2, MQ.y1 + 0.2, MQ.x0 - 0.2, MQ.y0 - 0.2, 13, FZ + 0.3);
  per(-10.5, 4.7, 10.5, 4.7, 56, 28.75);
  per(CM.x0 - 0.25, CM.y1 + 0.25, CM.x1 + 0.25, CM.y1 + 0.25, 30, CM.z + 0.26); per(CM.x0 - 0.25, CM.y0 + 0.1, CM.x0 - 0.25, CM.y1 + 0.1, 8, CM.z + 0.26); per(CM.x1 + 0.25, CM.y0 + 0.1, CM.x1 + 0.25, CM.y1 + 0.1, 8, CM.z + 0.26);
  for (let i = 0; i < 20; i++) { bulbPos.push([-10.75, 4.7, FZ + 0.4 + i * 0.42]); bulbPos.push([10.75, 4.7, FZ + 0.4 + i * 0.42]); }
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 10, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), bulbPos.length + 64);
  bulbs.name = 'casino-bulbs'; bulbs.frustumCulled = false;
  // + bulbs around the stage proscenium (indices bulbPos.length …) filled in by the stage block
  bulbPos.forEach((p, i) => { bm.makeTranslation(p[0], p[1], p[2]); bulbs.setMatrixAt(i, bm); bulbs.setColorAt(i, cc.set(0xffe6a8)); });
  group.add(bulbs);
  let bulbT = 0;
  anim.push((dt, t) => {
    bulbT += dt; if (bulbT < 0.09) return; bulbT = 0;
    const step = Math.floor(t * 9);
    for (let i = 0; i < bulbs.count; i++) { const on = (i + step) % 4 !== 0; bulbs.setColorAt(i, cc.setRGB(on ? 1.0 : 0.25, on ? 0.86 : 0.18, on ? 0.55 : 0.1)); }
    bulbs.instanceColor.needsUpdate = true;
  });
  // red carpet stanchions + velvet ropes
  for (const sx of [-1.65, 1.65]) {
    const pts = [];
    for (let z = 21.2; z <= 29.3; z += 1.35) { B.cyl('brass', sx, 0.5, z, 0.035, 0.035, 1.0, 10); B.cyl('brass', sx, 0.02, z, 0.16, 0.18, 0.04, 16); B.add('brass', new THREE.SphereGeometry(0.06, 10, 8).translate(sx, 1.02, z)); pts.push(z); col(sx - 0.15, z - 0.15, sx + 0.15, z + 0.15, 0, 1.1); }
    for (let i = 0; i < pts.length - 1; i++) { const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(sx, 0.95, pts[i]), new THREE.Vector3(sx, 0.7, (pts[i] + pts[i + 1]) / 2), new THREE.Vector3(sx, 0.95, pts[i + 1])); B.add('velvet', new THREE.TubeGeometry(c, 10, 0.025, 6, false)); }
  }
  // 21+ easel sign at the head of the red carpet (both faces) + host podium
  signs.push(makeSign(() => '21+', { W: 1024, H: 160, color: '#ffe9a8', bg: '#1a0306', subFn: () => L('entrance21') }, [3.6, 1.55, 29.0], 0, [2.6, 0.41]));
  signs.push(makeSign(() => '21+', { W: 1024, H: 160, color: '#ffe9a8', bg: '#1a0306', subFn: () => L('entrance21') }, [3.6, 1.55, 28.98], Math.PI, [2.6, 0.41]));
  B.box('gold', 2.25, 1.3, 28.95, 4.95, 1.34, 29.03); B.box('gold', 2.25, 1.76, 28.95, 4.95, 1.8, 29.03);
  for (const ex of [2.4, 4.8]) B.box('brass', ex - 0.02, 0, 28.97, ex + 0.02, 1.8, 29.01);
  col(2.2, 28.85, 5.0, 29.1, 0, 1.9);
  // searchlights (Hollywood premiere): housings + sweeping additive beams
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.075, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beams = [];
  for (const [sx, ph] of [[-16, 0], [16, 2.1]]) {
    B.cyl('darkMetal', sx, 0.45, 34.4, 0.55, 0.65, 0.9, 20); B.cyl('chrome', sx, 1.05, 34.4, 0.42, 0.42, 0.35, 20); col(sx - 0.7, 33.7, sx + 0.7, 35.1, 0, 1.3);
    const piv = new THREE.Group(); piv.position.set(sx, 1.2, 34.4); group.add(piv);
    const g = new THREE.CylinderGeometry(3.2, 0.32, 80, 24, 1, true); g.translate(0, 40, 0);
    const m = new THREE.Mesh(g, beamMat); m.name = 'casino-searchlight'; m.frustumCulled = false; piv.add(m); beams.push({ piv, ph });
  }
  anim.push((dt, t) => { for (const b of beams) { b.piv.rotation.z = Math.sin(t * 0.21 + b.ph) * 0.45; b.piv.rotation.x = -0.25 + Math.sin(t * 0.17 + b.ph * 1.7) * 0.15; } });
  // palms (instanced trunks + frond crowns): plaza, lobby, steakhouse, restrooms
  const palms = [[-13, 23.5], [13, 23.5], [-19, 30], [19, 30], [-26, 24], [26, 24], [-31, 31], [31, 31], [-11.5, 18.6], [11.5, 18.6], [33.6, 9.6], [33.6, -3.2], [-34.4, 18.4]];
  const trunkG = new THREE.CylinderGeometry(0.12, 0.22, 1, 10); trunkG.translate(0, 0.5, 0);
  const frondParts = []; for (let k = 0; k < 9; k++) { const f = new THREE.PlaneGeometry(0.5, 2.6, 1, 4); const p = f.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 1.3; p.setZ(i, -Math.pow(y / 2.6, 2) * 1.1); p.setY(i, y); p.setX(i, p.getX(i) * (1 - Math.abs(y / 2.6 - 0.45))); } f.computeVertexNormals(); f.rotateX(-0.9); f.rotateY(k * Math.PI * 2 / 9); frondParts.push(norm(THREE, f)); }
  const frondG = mergeGeometries(frondParts, false);
  const trunks = new THREE.InstancedMesh(trunkG, M.trunk, palms.length), crowns = new THREE.InstancedMesh(frondG, M.plant, palms.length);
  palms.forEach(([x, z], i) => {
    const inside = z < 20; const h = inside ? 2.6 : 6.5 + (i % 3) * 0.8; const s = inside ? 0.6 : 1;
    bm.compose(new THREE.Vector3(x, inside ? 0.5 : 0, z), new THREE.Quaternion(), new THREE.Vector3(s, h, s)); trunks.setMatrixAt(i, bm);
    bm.compose(new THREE.Vector3(x, (inside ? 0.5 : 0) + h, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i * 0.7, 0)), new THREE.Vector3(s * 1.1, s, s * 1.1)); crowns.setMatrixAt(i, bm);
    if (inside) { B.cyl('gold', x, 0.28, z, 0.42, 0.32, 0.56, 20); col(x - 0.45, z - 0.45, x + 0.45, z + 0.45); } else col(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0, 3);
  });
  trunks.name = 'casino-palm-trunks'; crowns.name = 'casino-palm-crowns'; group.add(trunks, crowns);
  col(-34, 35.8, 34, 36.3, 0, 3); col(-34.3, FZ, -34, 36.3, 0, 3); col(34, FZ, 34.3, 36.3, 0, 3);

  /* ------------------------------------------------------------------ sky dome, stars, skyline */
  const sky = add(new THREE.SphereGeometry(170, 24, 16), new THREE.MeshBasicMaterial({ map: T(TX.skyGrad(256), { wrap: false }), side: THREE.BackSide, fog: false, depthWrite: false }), 'casino-sky');
  sky.renderOrder = -10;
  { const n = low ? 350 : 700, p = new Float32Array(n * 3); let a = 99; const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    for (let i = 0; i < n; i++) { const th = r() * Math.PI * 2, ph = Math.acos(1 - r() * 0.9); p[i * 3] = Math.sin(ph) * Math.cos(th) * 160; p[i * 3 + 1] = Math.cos(ph) * 160; p[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 160; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const st = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })); st.name = 'casino-stars'; group.add(st); }
  { const tSky = T(TX.skylineWindows(TS(512))); const parts = []; let a = 5; const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    for (let i = 0; i < 46; i++) { const ang = (i / 46) * Math.PI * 2 + r() * 0.05; const R = 110 + r() * 30; const w = 8 + r() * 14, h = 14 + r() * 50, d = 8 + r() * 10; const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / 16, uv.getY(k) * h / 24); g.translate(0, h / 2 - 1, 0); g.rotateY(-ang); g.translate(Math.cos(ang) * R, 0, Math.sin(ang) * R); parts.push(norm(THREE, g)); }
    add(mergeGeometries(parts, false), new THREE.MeshBasicMaterial({ map: tSky, fog: false }), 'casino-skyline'); }

  /* ------------------------------------------------------------------ chandeliers + security domes (instanced) */
  const chandG = (() => {
    const P = [];
    const ring = (r, y, n, s) => { for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; const g = new THREE.OctahedronGeometry(s, 0); g.scale(0.6, 1.6, 0.6); g.translate(Math.cos(a) * r, y, Math.sin(a) * r); P.push(norm(THREE, g)); } };
    ring(0.9, -1.0, 18, 0.07); ring(0.65, -0.75, 14, 0.065); ring(0.42, -0.5, 10, 0.06); ring(0.22, -0.28, 6, 0.055);
    const core = new THREE.SphereGeometry(0.25, 12, 8); core.scale(1, 1.4, 1); core.translate(0, -0.8, 0); P.push(norm(THREE, core));
    return mergeGeometries(P, false);
  })();
  const frameG = (() => { const P = []; const st = new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6); st.translate(0, -0.5, 0); P.push(norm(THREE, st)); for (const [r, y] of [[0.95, -1.0], [0.7, -0.75], [0.46, -0.5]]) { const t = new THREE.TorusGeometry(r, 0.022, 6, 32); t.rotateX(Math.PI / 2); t.translate(0, y, 0); P.push(norm(THREE, t)); } return mergeGeometries(P, false); })();
  const chandSpots = [[0, 15.6, 1.7], [-9.5, 14.4, 0.8], [9.5, 14.4, 0.8], [CAROUSEL.x, CAROUSEL.z, 1.0], [-25, 6, 1], [-25, 0, 1], [-25, -6, 1], [-25, 12.4, 0.9],
    [1.5, 4.3, 1.1], [13.5, 4.3, 1.1], [-1, -1.8, 1.1], [14, -1.8, 1.1], [6, -9.6, 1.0], [6, -19.6, 1.3], [29.6, -9.2, 1], [29.6, -15.6, 1], [29.6, -22.2, 1],
    [-23, -17.4, 1.1], [-14, -17.4, 0.8], [24.2, 15.8, 0.9], [28, 7.6, 0.9], [18, -19.6, 0.8]];
  const crystalMat = std({ color: 0xfff4dc, emissive: 0xffd9a0, emissiveIntensity: 1.6, roughness: 0.08, metalness: 0.3 });
  const chand = new THREE.InstancedMesh(chandG, crystalMat, chandSpots.length), chandF = new THREE.InstancedMesh(frameG, M.gold, chandSpots.length);
  chandSpots.forEach(([x, z, s], i) => { bm.compose(new THREE.Vector3(x, H - 0.05, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); chand.setMatrixAt(i, bm); chandF.setMatrixAt(i, bm); });
  chand.name = 'casino-chandeliers'; chandF.name = 'casino-chandelier-frames'; chand.frustumCulled = chandF.frustumCulled = false; group.add(chand, chandF);
  // security: smoked-glass domes under the beam crossings (every 8 m)
  const domeG = (() => { const d = new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); d.translate(0, 0, 0); const r = new THREE.CylinderGeometry(0.21, 0.21, 0.05, 18); r.translate(0, 0.02, 0); return mergeGeometries([norm(THREE, d), norm(THREE, r)], false); })();
  const domeSpots = []; for (let x = -32; x <= 32; x += 8) for (let z = -24; z <= 16; z += 8) domeSpots.push([x, z]);
  const domes = new THREE.InstancedMesh(domeG, std({ color: 0x0b0b0e, roughness: 0.06, metalness: 0.6 }), domeSpots.length);
  domeSpots.forEach(([x, z], i) => { bm.makeTranslation(x, H - 0.47, z); domes.setMatrixAt(i, bm); });
  domes.name = 'casino-security-domes'; domes.frustumCulled = false; group.add(domes);

  /* ------------------------------------------------------------------ slot machines: 4 banks + carousel */
  const themeCol = { hollywood: new THREE.Color(0xffc861), gold: new THREE.Color(0xf2a33a), buckeye: new THREE.Color(0x7fe36a), [CLASSIC_KEY]: new THREE.Color(0xff3a4a) };
  const cabG = (() => { const P = []; const b = (w, h, d, x, y, z, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); P.push(norm(THREE, g)); };
    b(0.7, 0.62, 0.56, 0, 0.31, 0); b(0.7, 1.05, 0.42, 0, 1.12, -0.07); b(0.7, 0.12, 0.3, 0, 0.7, 0.16, -0.25); b(0.66, 0.34, 0.36, 0, 1.82, -0.06); b(0.72, 0.04, 0.58, 0, 0.64, 0);
    return mergeGeometries(P, false); })();
  const trimG = (() => { const P = []; for (const sx of [-0.355, 0.355]) { const g = new THREE.BoxGeometry(0.018, 1.6, 0.03); g.translate(sx, 1.0, 0.15); P.push(norm(THREE, g)); } const t = new THREE.BoxGeometry(0.7, 0.03, 0.03); t.translate(0, 1.66, 0.15); P.push(norm(THREE, t)); const btn = new THREE.BoxGeometry(0.5, 0.03, 0.06); btn.rotateX(-0.25); btn.translate(0, 0.77, 0.24); P.push(norm(THREE, btn)); return mergeGeometries(P, false); })();
  // screen (v 0…0.76) + topper (v 0.78…1) in one geometry → one canvas per machine type
  const scrG = (() => { const s = new THREE.PlaneGeometry(0.58, 0.46); s.rotateX(-0.18); s.translate(0, 1.13, 0.146); const uv = s.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.76); const tp = new THREE.PlaneGeometry(0.6, 0.26); tp.translate(0, 1.84, 0.125); const u2 = tp.attributes.uv; for (let i = 0; i < u2.count; i++) u2.setY(i, 0.78 + u2.getY(i) * 0.22); return mergeGeometries([norm(THREE, s), norm(THREE, tp)], false); })();
  const machines = []; // {x, z, yaw, theme, stand, stool:[x,z], seated}
  SLOT_BANKS.forEach((bank, bi) => {
    for (const face of [1, -1]) {
      for (let i = 0; i < SLOT_N; i++) {
        const x = SLOT_X0 + SLOT_W / 2 + i * SLOT_W, z = bank.z + face * 0.32;
        machines.push({ x, z, yaw: face > 0 ? 0 : Math.PI, theme: bank.theme, bank: bi, stool: [x, z + face * 0.62], stand: { x, z: bank.z + face * 1.7, yaw: face > 0 ? 0 : Math.PI },
          seated: (i * 13 + bi * 5 + (face > 0 ? 0 : 3)) % (low ? 7 : 4) === 0, box: [x - SLOT_W / 2 + 0.02, Math.min(z, z + face * 0.3), x + SLOT_W / 2 - 0.02, Math.max(z, z + face * 0.3)] });
      }
    }
    col(SLOT_X0 - 0.05, bank.z - 0.62, SLOT_X1 + 0.05, bank.z + 0.62, 0, 2.2);
    for (const ex of [SLOT_X0 - 0.25, SLOT_X1 + 0.25]) {
      B.box('lacquer', ex - 0.2, 0, bank.z - 0.6, ex + 0.2, 2.3, bank.z + 0.6); B.box('gold', ex - 0.22, 2.3, bank.z - 0.62, ex + 0.22, 2.36, bank.z + 0.62);
      col(ex - 0.22, bank.z - 0.62, ex + 0.22, bank.z + 0.62);
    }
    for (const face of [1, -1]) signs.push(makeSign(() => L('slot_' + bank.theme).toUpperCase(), { W: 512, H: 96, color: '#' + themeCol[bank.theme].getHexString() }, [(SLOT_X0 + SLOT_X1) / 2, 2.75, bank.z + face * 0.07], face > 0 ? 0 : Math.PI, [6, 1.1]));
    B.box('lacquer', SLOT_X0 + 2, 2.15, bank.z - 0.06, SLOT_X1 - 2, 3.35, bank.z + 0.06);
  });
  // carousel: machines facing outward around a round gold-domed drum
  for (let i = 0; i < CAROUSEL.n; i++) {
    const a = i / CAROUSEL.n * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    const x = CAROUSEL.x + dx * CAROUSEL.r, z = CAROUSEL.z + dz * CAROUSEL.r, yaw = Math.atan2(dx, dz);
    const sx = CAROUSEL.x + dx * (CAROUSEL.r + 0.62), sz = CAROUSEL.z + dz * (CAROUSEL.r + 0.62);
    const px = CAROUSEL.x + dx * (CAROUSEL.r + 1.45), pz = CAROUSEL.z + dz * (CAROUSEL.r + 1.45);
    machines.push({ x, z, yaw, theme: CAROUSEL.theme, bank: 9, stool: [sx, sz], stand: { x: px, z: pz, yaw: yawTo(px, pz, x, z) }, seated: i % 3 === 1, box: [x - 0.32, z - 0.32, x + 0.32, z + 0.32], carousel: true });
  }
  B.cyl('lacquer', CAROUSEL.x, 1.1, CAROUSEL.z, CAROUSEL.r - 0.2, CAROUSEL.r - 0.2, 2.2, 28); B.cyl('gold', CAROUSEL.x, 2.3, CAROUSEL.z, CAROUSEL.r + 0.42, CAROUSEL.r + 0.42, 0.1, 40);
  B.add('gold', new THREE.SphereGeometry(CAROUSEL.r * 0.75, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(CAROUSEL.x, 2.35, CAROUSEL.z));
  B.add('ledMagenta', new THREE.TorusGeometry(CAROUSEL.r + 0.44, 0.03, 6, 48).rotateX(Math.PI / 2).translate(CAROUSEL.x, 2.26, CAROUSEL.z));
  col(CAROUSEL.x - CAROUSEL.r - 0.36, CAROUSEL.z - CAROUSEL.r - 0.36, CAROUSEL.x + CAROUSEL.r + 0.36, CAROUSEL.z + CAROUSEL.r + 0.36, 0, 2.3);
  const nSlots = machines.length;
  const cabMat = std({ color: 0xffffff, roughness: 0.22, metalness: 0.55 });
  const cabs = new THREE.InstancedMesh(cabG, cabMat, nSlots), trims = new THREE.InstancedMesh(trimG, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), nSlots);
  cabs.name = 'casino-slot-cabinets'; trims.name = 'casino-slot-trims'; cabs.frustumCulled = trims.frustumCulled = false;
  const screens = {};
  for (const th of THEMES4) {
    const n = machines.filter((m) => m.theme === th).length; if (!n) continue;
    const c = TX.canvas(low ? 128 : 256, low ? 160 : 320);
    const t = T(c, { wrap: false }); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    const im = new THREE.InstancedMesh(scrG, new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), n); im.name = 'casino-slot-screens-' + th; im.frustumCulled = false;
    screens[th] = { im, tex: t, c, ctx: c.getContext('2d'), n: 0 };
  }
  const stoolSpots = [];
  const crowdSpecs = [];
  machines.forEach((m, si) => {
    bm.compose(v.set(m.x, 0, m.z), q.setFromEuler(new THREE.Euler(0, m.yaw, 0)), s1);
    cabs.setMatrixAt(si, bm); trims.setMatrixAt(si, bm);
    cabs.setColorAt(si, cc.setHSL(0.07, 0.25, 0.05 + ((si * 7 + m.bank) % 5) * 0.012));
    trims.setColorAt(si, cc.copy(themeCol[m.theme]).multiplyScalar(0.9 + ((si + m.bank) % 3) * 0.1));
    const S = screens[m.theme]; S.im.setMatrixAt(S.n++, bm);
    stoolSpots.push([m.stool[0], m.stool[1]]);
    if (m.seated) crowdSpecs.push({ x: m.stool[0], z: m.stool[1], yaw: m.yaw + Math.PI, pose: 'seat', seatY: 0.78, role: 'patron' });
    stations.push({ kind: 'slot', game: 'slots', params: { theme: m.theme }, theme: m.theme, bank: m.bank, id: (m.carousel ? 'car' : 'slot') + si,
      box: new THREE.Box3(new THREE.Vector3(m.box[0], 0.6, m.box[1]), new THREE.Vector3(m.box[2], 1.95, m.box[3])), stand: m.stand });
  });
  cabs.instanceColor.needsUpdate = true; trims.instanceColor.needsUpdate = true;
  group.add(cabs, trims); for (const th in screens) group.add(screens[th].im);
  anim.push(((acc) => (dt, t) => {
    acc += dt; if (acc < (low ? 0.22 : 0.12)) return; acc = 0;
    let k = 0; for (const th in screens) { const S = screens[th]; drawAttract(S.ctx, th, S.c.width, S.c.height, t * 0.9, k++); S.tex.needsUpdate = true; }
  })(1));

  /* ------------------------------------------------------------------ pit: tables, chairs, dealers, table FX anchors */
  const chairG = (() => { const seat = new THREE.BoxGeometry(0.46, 0.1, 0.44); seat.translate(0, 0.62, 0); const back = new THREE.BoxGeometry(0.46, 0.5, 0.08); back.rotateX(-0.12); back.translate(0, 0.92, -0.22); return { fab: mergeGeometries([norm(THREE, seat), norm(THREE, back)], false), base: mergeGeometries([norm(THREE, new THREE.CylinderGeometry(0.035, 0.035, 0.58, 8).translate(0, 0.29, 0)), norm(THREE, new THREE.CylinderGeometry(0.24, 0.26, 0.03, 16).translate(0, 0.015, 0))], false) }; })();
  const stoolG = (() => { const s = new THREE.CylinderGeometry(0.21, 0.19, 0.09, 16); s.translate(0, 0.74, 0); const r = new THREE.TorusGeometry(0.17, 0.012, 6, 20); r.rotateX(Math.PI / 2); r.translate(0, 0.32, 0); return { seat: s, base: mergeGeometries([norm(THREE, new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8).translate(0, 0.35, 0)), norm(THREE, new THREE.CylinderGeometry(0.22, 0.24, 0.03, 16).translate(0, 0.015, 0)), norm(THREE, r)], false) }; })();
  const chairSpots = []; // [x, z, yaw]
  const chipSpots = []; // decorative chip stacks [x, y, z, colorIdx]
  const pendants = []; // [x, z, w, d]
  // blackjack ×6 — half-moon, dealer edge north at z0, players south
  const BJ_Z = 6.2, BJX = [-6, -1, 4, 9, 14, 19];
  const bjFeltG = planarUV(slab(THREE, halfEllipse(THREE, 1.2, 1.15), 0.8, 0.05), true);
  const bjRailG = slab(THREE, arcBand(THREE, 1.2, 1.15, 0.14), 0.86, 0.05, 0.025);
  const bjBaseG = (() => { const a = new THREE.BoxGeometry(1.6, 0.76, 0.7); a.translate(0, 0.42, 0.45); const e = new THREE.BoxGeometry(2.5, 0.08, 0.2); e.translate(0, 0.76, -0.08); const tr = new THREE.BoxGeometry(0.9, 0.05, 0.16); tr.translate(0, 0.83, 0.12); const sh = new THREE.BoxGeometry(0.22, 0.18, 0.32); sh.translate(0.85, 0.9, 0.25); return mergeGeometries([norm(THREE, a), norm(THREE, e), norm(THREE, tr), norm(THREE, sh)], false); })();
  const bjFelt = new THREE.InstancedMesh(bjFeltG, std({ map: T(TX.felt('bj', TS(512), TS(256)), { wrap: false }), roughness: 0.95 }), BJX.length), bjRail = new THREE.InstancedMesh(bjRailG, M.leather, BJX.length), bjBase = new THREE.InstancedMesh(bjBaseG, M.wood, BJX.length);
  BJX.forEach((x, i) => {
    const z0 = BJ_Z; bm.makeTranslation(x, 0, z0); bjFelt.setMatrixAt(i, bm); bjRail.setMatrixAt(i, bm); bjBase.setMatrixAt(i, bm);
    for (let k = 0; k < 6; k++) chipSpots.push([x - 0.38 + k * 0.15, 0.86, z0 + 0.12, k]);
    for (let k = 0; k < 6; k++) { const a = Math.PI * (0.16 + k * 0.136); const px = x + Math.cos(a) * 1.72, pz = z0 + Math.sin(a) * 1.6; chairSpots.push([px, pz, faceYaw(px, pz, x, z0 + 0.3)]); if ((k + i) % 2 === 0) crowdSpecs.push({ x: px, z: pz, yaw: faceYaw(px, pz, x, z0 + 0.3), pose: 'seat', seatY: 0.66, role: 'patron' }); }
    crowdSpecs.push({ x, z: z0 - 0.5, yaw: 0, pose: 'stand', role: 'dealer' });
    col(x - 1.36, z0 - 0.2, x + 1.36, z0 + 1.3, 0, 0.95);
    pendants.push([x, z0 + 0.5, 1.6, 0.6]);
    stations.push({ kind: 'table', game: 'blackjack', id: 'bj' + (i + 1), label: 'g_blackjack', fx: { type: 'cards', shoe: [x + 0.85, 0.99, z0 + 0.25], spots: [[x - 0.12, z0 + 0.82], [x + 0.12, z0 + 0.82], [x - 0.08, z0 + 0.3], [x + 0.14, z0 + 0.3]] },
      box: new THREE.Box3(new THREE.Vector3(x - 1.3, 0.5, z0), new THREE.Vector3(x + 1.3, 1.0, z0 + 1.3)), stand: { x, z: 8.9, yaw: 0 } });
  });
  bjFelt.name = 'casino-bj-felt'; bjRail.name = 'casino-bj-rail'; bjBase.name = 'casino-bj-base'; group.add(bjFelt, bjRail, bjBase);
  // roulette ×3 — 3.0 × 1.4, wheel at the west end (instanced felts, rails, bowls; one rotor each)
  const RT_Z = 1.2, RTX = [-4, 7, 18];
  const rFeltG = planarUV(slab(THREE, roundRect(THREE, 3.0, 1.4, 0.3), 0.8, 0.05), true);
  const rRailG = slab(THREE, ringOf(THREE, 3.0, 1.4, 0.3, 0.12), 0.86, 0.05, 0.025);
  const rBaseG = (() => { const a = new THREE.BoxGeometry(2.2, 0.76, 1.0); a.translate(0.3, 0.42, 0); const bowl = new THREE.LatheGeometry([new THREE.Vector2(0.0, 0.84), new THREE.Vector2(0.5, 0.84), new THREE.Vector2(0.52, 0.9), new THREE.Vector2(0.46, 0.93), new THREE.Vector2(0.4, 0.88)], 40); bowl.translate(-1.05, 0, 0); return mergeGeometries([norm(THREE, a), norm(THREE, bowl)], false); })();
  const rFelt = new THREE.InstancedMesh(rFeltG, std({ map: T(TX.felt('roulette', TS(1024), TS(512)), { wrap: false }), roughness: 0.95 }), RTX.length), rRail = new THREE.InstancedMesh(rRailG, M.leather, RTX.length), rBase = new THREE.InstancedMesh(rBaseG, M.wood, RTX.length);
  const rotC = TX.canvas(256); { const x = rotC.getContext('2d'); const W = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2]; const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    x.translate(128, 128); for (let i = 0; i < 38; i++) { const n = W[i]; const a0 = i * Math.PI * 2 / 38, a1 = a0 + Math.PI * 2 / 38; x.beginPath(); x.arc(0, 0, 126, a0, a1); x.arc(0, 0, 84, a1, a0, true); x.closePath(); x.fillStyle = n === 0 || n === 37 ? '#0c7a43' : REDS.has(n) ? '#b3121f' : '#111'; x.fill(); x.strokeStyle = '#d9b46a'; x.stroke(); }
    const g = x.createRadialGradient(0, 0, 10, 0, 0, 84); g.addColorStop(0, '#e8c27a'); g.addColorStop(0.3, '#7a4a20'); g.addColorStop(1, '#3a200c'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 84, 0, Math.PI * 2); x.fill(); }
  const rotorMat = [M.gold, std({ map: T(rotC, { wrap: false }), roughness: 0.35, metalness: 0.2 }), M.gold];
  const rotorG = new THREE.CylinderGeometry(0.4, 0.4, 0.03, 38);
  const rotors = [];
  RTX.forEach((x, i) => {
    const z = RT_Z; bm.makeTranslation(x, 0, z); rFelt.setMatrixAt(i, bm); rRail.setMatrixAt(i, bm); rBase.setMatrixAt(i, bm);
    const wx = x - 1.05;
    const rot = new THREE.Mesh(rotorG, rotorMat); rot.position.set(wx, 0.885, z); rot.name = 'casino-roulette-rotor'; group.add(rot); rotors.push(rot);
    B.cyl('gold', wx, 0.95, z, 0.03, 0.05, 0.12, 12);
    for (let k = 0; k < 5; k++) chipSpots.push([x + 1.1, 0.86, z - 0.45 + k * 0.1, k + 1]);
    for (let k = 0; k < 5; k++) { const px = x - 0.4 + k * 0.5, pz = z + 1.25; chairSpots.push([px, pz, Math.PI]); if ((k + i) % 2 === 1) crowdSpecs.push({ x: px, z: pz, yaw: Math.PI, pose: 'seat', seatY: 0.66, role: 'patron' }); }
    crowdSpecs.push({ x: wx + 0.2, z: z - 1.0, yaw: 0, pose: 'stand', role: 'dealer' });
    col(x - 1.62, z - 0.82, x + 1.62, z + 0.82, 0, 1.0);
    pendants.push([x, z, 2.2, 0.6]);
    stations.push({ kind: 'table', game: 'roulette', id: 'roulette' + (i + 1), label: 'g_roulette', fx: { type: 'roulette', rotor: i },
      box: new THREE.Box3(new THREE.Vector3(x - 1.6, 0.5, z - 0.8), new THREE.Vector3(x + 1.6, 1.0, z + 0.8)), stand: { x, z: z + 2.45, yaw: 0 } });
  });
  rFelt.name = 'casino-roulette-felt'; rRail.name = 'casino-roulette-rail'; rBase.name = 'casino-roulette-base'; group.add(rFelt, rRail, rBase);
  // craps ×2 — 4.4 × 2.0 tubs with high walls
  const CR_Z = -5.4, CRX = [-4.5, 3.5];
  const crFeltG = planarUV(slab(THREE, roundRect(THREE, 4.2, 1.8, 0.5), 0.78, 0.05), true);
  const crTubG = (() => { const w = slab(THREE, ringOf(THREE, 4.2, 1.8, 0.5, 0.14), 1.0, 0.24); const base = new THREE.BoxGeometry(3.0, 0.76, 1.2); base.translate(0, 0.4, 0); return mergeGeometries([norm(THREE, w), norm(THREE, base)], false); })();
  const crRailG = slab(THREE, ringOf(THREE, 4.48, 2.08, 0.62, 0.12), 1.04, 0.05, 0.025);
  const crFelt = new THREE.InstancedMesh(crFeltG, std({ map: T(TX.felt('craps', TS(1024), TS(512)), { wrap: false }), roughness: 0.95 }), CRX.length), crTub = new THREE.InstancedMesh(crTubG, M.wood, CRX.length), crRail = new THREE.InstancedMesh(crRailG, M.leather, CRX.length);
  CRX.forEach((cx, i) => {
    const cz = CR_Z; bm.makeTranslation(cx, 0, cz); crFelt.setMatrixAt(i, bm); crTub.setMatrixAt(i, bm); crRail.setMatrixAt(i, bm);
    for (let k = 0; k < 8; k++) chipSpots.push([cx - 0.5 + k * 0.14, 0.84, cz - 0.7, k]);
    crowdSpecs.push({ x: cx - 0.9, z: cz - 1.45, yaw: 0, pose: 'stand', role: 'dealer' }, { x: cx + 0.9, z: cz - 1.45, yaw: 0, pose: 'stand', role: 'dealer' });
    for (const [px, pz] of [[cx - 1.6, cz + 1.45], [cx - 0.5, cz + 1.5], [cx + 1.3, cz + 1.45], [cx + 2.75, cz + 0.2], [cx - 2.75, cz - 0.2]]) crowdSpecs.push({ x: px, z: pz, yaw: faceYaw(px, pz, cx, cz), pose: 'stand', role: 'patron' });
    col(cx - 2.4, cz - 1.15, cx + 2.4, cz + 1.15, 0, 1.1);
    pendants.push([cx, cz, 3.0, 0.8]);
    stations.push({ kind: 'table', game: 'craps', id: 'craps' + (i + 1), label: 'g_craps', fx: { type: 'dice', from: [cx + 0.4, cz + 0.65], to: [cx - 1.5, cz - 0.35] },
      box: new THREE.Box3(new THREE.Vector3(cx - 2.3, 0.6, cz - 1.1), new THREE.Vector3(cx + 2.3, 1.1, cz + 1.1)), stand: { x: cx + 0.3, z: cz + 2.35, yaw: 0 } });
  });
  crFelt.name = 'casino-craps-felt'; crTub.name = 'casino-craps-tub'; crRail.name = 'casino-craps-rail'; group.add(crFelt, crTub, crRail);
  // baccarat ×2 — 3.0 × 1.6 blue felt
  const BAX = [11, 17.5];
  const baFeltG = planarUV(slab(THREE, roundRect(THREE, 3.0, 1.6, 0.6), 0.8, 0.05), true);
  const baRailG = (() => { const r = slab(THREE, ringOf(THREE, 3.0, 1.6, 0.6, 0.12), 0.86, 0.05, 0.025); return r; })();
  const baBaseG = new THREE.BoxGeometry(2.2, 0.76, 1.0).translate(0, 0.42, 0);
  const baFelt = new THREE.InstancedMesh(baFeltG, std({ map: T(TX.felt('baccarat', TS(512), TS(256)), { wrap: false }), roughness: 0.95 }), BAX.length), baRail = new THREE.InstancedMesh(baRailG, M.leather, BAX.length), baBase = new THREE.InstancedMesh(baBaseG, M.wood, BAX.length);
  BAX.forEach((cx, i) => {
    const cz = CR_Z; bm.makeTranslation(cx, 0, cz); baFelt.setMatrixAt(i, bm); baRail.setMatrixAt(i, bm); baBase.setMatrixAt(i, bm);
    for (let k = 0; k < 6; k++) chipSpots.push([cx - 0.4 + k * 0.16, 0.86, cz - 0.55, k + 2]);
    crowdSpecs.push({ x: cx, z: cz - 1.15, yaw: 0, pose: 'stand', role: 'dealer' });
    for (let k = 0; k < 7; k++) { const a = Math.PI * (0.12 + k * 0.127); const px = cx + Math.cos(a) * 1.95, pz = cz + Math.sin(a) * 1.2; chairSpots.push([px, pz, faceYaw(px, pz, cx, cz)]); if ((k + i) % 3 === 1) crowdSpecs.push({ x: px, z: pz, yaw: faceYaw(px, pz, cx, cz), pose: 'seat', seatY: 0.66, role: 'patron' }); }
    col(cx - 1.62, cz - 0.92, cx + 1.62, cz + 0.92, 0, 1.0);
    pendants.push([cx, cz, 2.2, 0.6]);
    stations.push({ kind: 'table', game: 'baccarat', id: 'baccarat' + (i + 1), label: 'g_baccarat', fx: { type: 'cards', shoe: [cx, 0.99, cz - 0.55], spots: [[cx - 0.55, cz + 0.05], [cx - 0.35, cz + 0.05], [cx + 0.35, cz + 0.05], [cx + 0.55, cz + 0.05], [cx - 0.45, cz + 0.32], [cx + 0.45, cz + 0.32]] },
      box: new THREE.Box3(new THREE.Vector3(cx - 1.6, 0.5, cz - 0.9), new THREE.Vector3(cx + 1.6, 1.0, cz + 0.9)), stand: { x: cx, z: cz + 2.35, yaw: 0 } });
  });
  baFelt.name = 'casino-baccarat-felt'; baRail.name = 'casino-baccarat-rail'; baBase.name = 'casino-baccarat-base'; group.add(baFelt, baRail, baBase);
  // pit table-limit signs (small lit placards on the dealer side)
  signs.push(makeSign(() => L('g_blackjack') + ' · 10 – 1,000', { W: 512, H: 80 }, [6.5, 3.4, 5.6], Math.PI, [3.2, 0.5]));
  signs.push(makeSign(() => L('g_roulette') + ' · 0 · 00', { W: 512, H: 80 }, [7, 3.4, 0.2], 0, [3.2, 0.5]));
  signs.push(makeSign(() => L('g_craps') + ' · ' + L('g_baccarat'), { W: 512, H: 80 }, [7, 3.4, -4.3], 0, [3.6, 0.56]));

  /* ------------------------------------------------------------------ poker room: 6 hold'em tables behind glass */
  const tFeltP = T(TX.felt('poker', TS(512), TS(256)), { wrap: false });
  const pFeltG = planarUV(slab(THREE, roundRect(THREE, 3.0, 1.5, 0.75), 0.78, 0.05), true);
  const pRailG = slab(THREE, ringOf(THREE, 3.0, 1.5, 0.75, 0.16), 0.84, 0.05, 0.03);
  const pBaseG = new THREE.BoxGeometry(2.0, 0.76, 0.8).translate(0, 0.4, 0);
  const PT = []; for (const z of [-22.2, -15.6, -9.0]) for (const x of [26.6, 32.6]) PT.push({ x, z });
  const pFelt = new THREE.InstancedMesh(pFeltG, std({ map: tFeltP, roughness: 0.95 }), PT.length), pRail = new THREE.InstancedMesh(pRailG, M.leather, PT.length), pBase = new THREE.InstancedMesh(pBaseG, M.wood, PT.length);
  PT.forEach((t, i) => {
    bm.makeTranslation(t.x, 0, t.z); pFelt.setMatrixAt(i, bm); pRail.setMatrixAt(i, bm); pBase.setMatrixAt(i, bm);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; const px = t.x + Math.cos(a) * 2.1, pz = t.z + Math.sin(a) * 1.35; chairSpots.push([px, pz, faceYaw(px, pz, t.x, t.z)]); if (k !== 2 && (k + i) % 3 !== 0) crowdSpecs.push({ x: px, z: pz, yaw: faceYaw(px, pz, t.x, t.z), pose: 'seat', seatY: 0.66, role: 'patron' }); }
    crowdSpecs.push({ x: t.x, z: t.z - 1.12, yaw: 0, pose: 'stand', role: 'dealer' });
    for (let k = 0; k < 4; k++) chipSpots.push([t.x - 0.25 + k * 0.17, 0.84, t.z, k + 3]);
    col(t.x - 1.7, t.z - 0.95, t.x + 1.7, t.z + 0.95, 0, 1.0);
    pendants.push([t.x, t.z, 2.3, 0.9]);
    stations.push({ kind: 'table', game: 'holdem', id: 'holdem' + (i + 1), label: 'g_holdem', fx: { type: 'cards', shoe: [t.x, 0.95, t.z - 0.55], spots: [[t.x - 0.5, t.z], [t.x - 0.25, t.z], [t.x, t.z], [t.x + 0.25, t.z], [t.x + 0.5, t.z]] },
      box: new THREE.Box3(new THREE.Vector3(t.x - 1.7, 0.5, t.z - 0.9), new THREE.Vector3(t.x + 1.7, 1.0, t.z + 0.9)), stand: { x: t.x - 0.4, z: t.z + 2.55, yaw: 0 } });
  });
  pFelt.name = 'casino-poker-felt'; pRail.name = 'casino-poker-rail'; pBase.name = 'casino-poker-base'; group.add(pFelt, pRail, pBase);
  // glass partition: x = 22 (z −26…−4, door at z −13.3…−11.3) and z = −4 (x 22…36)
  const glassWall = (x0, z0, x1, z1) => { const g = new THREE.BoxGeometry(Math.max(0.03, Math.abs(x1 - x0)), 2.8, Math.max(0.03, Math.abs(z1 - z0))); g.translate((x0 + x1) / 2, 1.4, (z0 + z1) / 2); B.add('glass', g); B.boxC('gold', (x0 + x1) / 2, 2.82, (z0 + z1) / 2, Math.max(0.08, Math.abs(x1 - x0)), 0.06, Math.max(0.08, Math.abs(z1 - z0))); B.boxC('gold', (x0 + x1) / 2, 0.04, (z0 + z1) / 2, Math.max(0.08, Math.abs(x1 - x0)), 0.08, Math.max(0.08, Math.abs(z1 - z0))); col(Math.min(x0, x1) - 0.05, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, Math.max(z0, z1) + 0.05, 0, 2.8); };
  glassWall(22, Z0, 22, -13.3); glassWall(22, -11.3, 22, -4); glassWall(22, -4, X1, -4);
  for (const z of [-13.3, -11.3]) B.boxC('gold', 22, 1.45, z, 0.14, 2.9, 0.14);
  signs.push(makeSign(() => L('room_poker'), { W: 512, H: 112 }, [22.06, 3.25, -12.3], Math.PI / 2, [2.6, 0.57]));
  signs.push(makeSign(() => L('room_poker'), { W: 512, H: 112 }, [21.94, 3.25, -12.3], -Math.PI / 2, [2.6, 0.57]));
  signs.push(makeSign(() => L('room_poker') + ' · ' + L('g_holdem'), { W: 1024, H: 112 }, [29, 3.4, -4.06], Math.PI, [5.4, 0.6]));

  // pendant lights over every table (gold frames, warm diffusers) — merged
  for (const [x, z, w, d] of pendants) {
    B.boxC('gold', x, 3.05, z, w + 0.08, 0.16, d + 0.08); B.boxC('warmLight', x, 2.965, z, w, 0.01, d);
    for (const sx of [-w / 2 + 0.1, w / 2 - 0.1]) B.cyl('gold', x + sx, 4.5, z, 0.008, 0.008, 2.9, 4);
  }

  /* ------------------------------------------------------------------ island bar + bar-top video poker + lounge */
  const BAR = { cx: 6, cz: -19.6, len: 7, R: 2.4, w: 0.62 };
  { const { cx, cz, len, R, w } = BAR;
    const outer = stadium(THREE, len, R), inner = stadium(THREE, len, R - w); outer.holes.push(inner);
    const body = slab(THREE, outer, 1.06, 1.06); body.translate(cx, 0, cz); B.add('lacquer', body);
    const ring2 = stadium(THREE, len, R + 0.05); ring2.holes.push(stadium(THREE, len, R - w - 0.05));
    const top = slab(THREE, ring2, 1.12, 0.06); top.translate(cx, 0, cz); B.add('stone', top);
    const band = stadium(THREE, len, R + 0.012); band.holes.push(stadium(THREE, len, R - 0.02)); const bg = slab(THREE, band, 0.92, 0.05); bg.translate(cx, 0, cz); B.add('gold', bg);
    const foot = stadium(THREE, len, R + 0.15); foot.holes.push(stadium(THREE, len, R + 0.1)); const fg = slab(THREE, foot, 0.24, 0.04); fg.translate(cx, 0, cz); B.add('brass', fg);
    const bbC = TX.canvas(TS(512), TS(256)); { const x = bbC.getContext('2d'); const W = bbC.width, Hh = bbC.height; const g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, '#3a1a08'); g.addColorStop(1, '#120804'); x.fillStyle = g; x.fillRect(0, 0, W, Hh);
      for (let r = 0; r < 3; r++) { const y0 = Hh * (0.08 + r * 0.31); const gl = x.createLinearGradient(0, y0, 0, y0 + Hh * 0.27); gl.addColorStop(0, '#ffcf7a'); gl.addColorStop(1, '#a8601c'); x.fillStyle = gl; x.fillRect(0, y0, W, Hh * 0.27);
        for (let k = 0; k < 14; k++) { const bx = W * (0.03 + k * 0.07), bw = W * 0.035, bh = Hh * (0.15 + ((k * 7 + r) % 5) * 0.02); x.fillStyle = ['rgba(40,15,5,.85)', 'rgba(20,40,20,.8)', 'rgba(60,20,10,.85)', 'rgba(15,15,30,.8)'][(k + r) % 4]; x.fillRect(bx, y0 + Hh * 0.27 - bh, bw, bh); x.fillRect(bx + bw * 0.35, y0 + Hh * 0.27 - bh - Hh * 0.05, bw * 0.3, Hh * 0.05); }
        x.fillStyle = '#d9b46a'; x.fillRect(0, y0 + Hh * 0.27, W, Hh * 0.015); } }
    const bbMat = new THREE.MeshBasicMaterial({ map: T(bbC, { wrap: false }) });
    const bb = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.4, 1.0), [bbMat, bbMat, M.lacquer, M.lacquer, bbMat, bbMat]); bb.position.set(cx, 1.2, cz); bb.name = 'casino-backbar'; group.add(bb);
    B.boxC('gold', cx, 2.44, cz, 5.5, 0.08, 1.1);
    const can = stadium(THREE, len, R + 0.2); can.holes.push(stadium(THREE, len, R - w - 0.2)); const cg = slab(THREE, can, 3.4, 0.25); cg.translate(cx, 0, cz); B.add('lacquer', cg);
    const led = stadium(THREE, len, R + 0.22); led.holes.push(stadium(THREE, len, R + 0.17)); const lg = slab(THREE, led, 3.3, 0.08); lg.translate(cx, 0, cz); B.add('ledMagenta', lg);
    for (const [x, z] of [[cx - len / 2 - 1.3, cz], [cx + len / 2 + 1.3, cz], [cx, cz - 1.5], [cx, cz + 1.5]]) B.cyl('gold', x, 4.7, z, 0.06, 0.06, 2.6, 8);
    col(cx - len / 2, cz - R - 0.05, cx + len / 2, cz + R + 0.05, 0, 1.2);
    col(cx - len / 2 - R - 0.05, cz - R * 0.72, cx - len / 2, cz + R * 0.72, 0, 1.2); col(cx + len / 2, cz - R * 0.72, cx + len / 2 + R + 0.05, cz + R * 0.72, 0, 1.2);
    const nRun = 9;
    for (let k = 0; k < nRun; k++) { const x = cx - len / 2 + 0.39 + k * 0.775; stoolSpots.push([x, cz + R + 0.45, 1.05]); stoolSpots.push([x, cz - R - 0.45, 1.05]); }
    for (const sgn of [-1, 1]) for (let k = -2; k <= 2; k++) { const a = k * 0.5; stoolSpots.push([cx + sgn * (len / 2 + Math.cos(a) * (R + 0.45)), cz + Math.sin(a) * (R + 0.45), 1.05]); }
    for (const k of [1, 4, 7]) crowdSpecs.push({ x: cx - len / 2 + 0.39 + k * 0.775, z: cz + R + 0.45, yaw: Math.PI, pose: 'seat', seatY: 0.8, role: 'patron' });
    for (const k of [2, 5, 6]) crowdSpecs.push({ x: cx - len / 2 + 0.39 + k * 0.775, z: cz - R - 0.45, yaw: 0, pose: 'seat', seatY: 0.8, role: 'patron' });
    crowdSpecs.push({ x: cx - 1.9, z: cz + 1.25, yaw: Math.PI, pose: 'stand', role: 'bartender' }, { x: cx + 2.2, z: cz - 1.25, yaw: 0, pose: 'stand', role: 'bartender' });
    // bar-top video poker screens (south run), one shared animated canvas
    const vpC = TX.canvas(TS(256), TS(192)); const vpT = T(vpC, { wrap: false });
    const drawVP = (t) => { const x = vpC.getContext('2d'), W = vpC.width, Hh = vpC.height; const g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, '#0b1a4a'); g.addColorStop(1, '#071033'); x.fillStyle = g; x.fillRect(0, 0, W, Hh); x.fillStyle = '#ffe680'; x.font = `800 ${Math.round(Hh * 0.075)}px system-ui`; x.textAlign = 'left'; ['ROYAL FLUSH 250', 'STRAIGHT FLUSH 50', '4 OF A KIND 25', 'FULL HOUSE 9', 'FLUSH 6', 'STRAIGHT 4'].forEach((s, i) => x.fillText(s, W * 0.06, Hh * (0.1 + i * 0.085)));
      for (let k = 0; k < 5; k++) { const cx2 = W * (0.06 + k * 0.18), cy = Hh * 0.62; x.fillStyle = '#fffdf7'; x.fillRect(cx2, cy, W * 0.16, Hh * 0.3); x.fillStyle = (k + Math.floor(t)) % 2 ? '#b3141f' : '#111'; x.font = `700 ${Math.round(Hh * 0.13)}px Georgia`; x.fillText(['A', 'K', 'Q', 'J', '10'][k], cx2 + W * 0.02, cy + Hh * 0.15); } x.fillStyle = '#ffe680'; x.font = `800 ${Math.round(Hh * 0.08)}px system-ui`; x.fillText('JACKS OR BETTER 9/6', W * 0.06, Hh * 0.97); vpT.needsUpdate = true; };
    drawVP(0);
    const vpParts = []; for (let k = 0; k < nRun; k++) { const x = cx - len / 2 + 0.39 + k * 0.775; const g = new THREE.PlaneGeometry(0.42, 0.3); g.rotateX(-Math.PI / 2 + 0.35); g.translate(x, 1.19, cz + R - 0.3); vpParts.push(norm(THREE, g)); B.boxC('lacquer', x, 1.16, cz + R - 0.31, 0.46, 0.08, 0.34);
      stations.push({ kind: 'vp', game: 'videopoker', id: 'vp' + (k + 1), label: 'g_videopoker', box: new THREE.Box3(new THREE.Vector3(x - 0.3, 1.0, cz + R - 0.6), new THREE.Vector3(x + 0.3, 1.35, cz + R + 0.05)), stand: { x, z: cz + R + 1.3, yaw: 0 } }); }
    add(mergeGeometries(vpParts, false), new THREE.MeshBasicMaterial({ map: vpT, toneMapped: false }), 'casino-vp-screens');
    anim.push(((acc) => (dt, t) => { acc += dt; if (acc < 0.6) return; acc = 0; drawVP(t * 1.6); })(0));
    stations.push({ kind: 'bar', game: 'bar', id: 'bar', label: 'g_bar', box: new THREE.Box3(new THREE.Vector3(cx - len / 2 - R, 0.9, cz - R), new THREE.Vector3(cx + len / 2 + R, 1.25, cz - R + 0.6)), stand: { x: cx, z: cz - R - 1.4, yaw: Math.PI } });
    stations.push({ kind: 'bar', game: 'bar', id: 'bar2', label: 'g_bar', box: new THREE.Box3(new THREE.Vector3(cx + len / 2, 0.9, cz - 1.2), new THREE.Vector3(cx + len / 2 + R + 0.1, 1.25, cz + 1.2)), stand: { x: cx + len / 2 + R + 1.35, z: cz, yaw: Math.PI / 2 } });
    signs.push(makeSign(() => L('room_bar'), { W: 512, H: 112, color: '#ff8fd0' }, [cx, 3.8, cz + R + 0.21], 0, [2.6, 0.57]));
  }
  // lounge seating: club chairs (instanced) + cocktail tables — bar lounge (east) and stage lounge (west)
  const clubG = (() => { const P = []; const b = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); P.push(norm(THREE, g)); }; b(0.8, 0.42, 0.78, 0, 0.21, 0); b(0.8, 0.5, 0.18, 0, 0.62, -0.32); b(0.16, 0.26, 0.7, 0.36, 0.52, 0); b(0.16, 0.26, 0.7, -0.36, 0.52, 0); return mergeGeometries(P, false); })();
  const clubSpots = [];
  const cocktail = (x, z) => { B.cyl('gold', x, 0.25, z, 0.04, 0.04, 0.5, 8); B.cyl('stone', x, 0.52, z, 0.32, 0.32, 0.04, 20); B.cyl('gold', x, 0.01, z, 0.22, 0.24, 0.02, 16); };
  for (const z of [-24.2, -21.6, -17.6, -15.0]) for (const x of [16.8, 20.2]) { clubSpots.push([x, z, z < -19.6 ? 0 : Math.PI]); col(x - 0.42, z - 0.42, x + 0.42, z + 0.42, 0, 0.9); }
  for (const z of [-22.9, -16.3]) for (const x of [16.8, 20.2]) cocktail(x, z);
  /* ------------------------------------------------------------------ stage & lounge (north-west): live band */
  const ST = { x0: -31, x1: -15, z0: Z0, z1: -21.6, h: 0.75 };
  { const { x0, x1, z0, z1, h } = ST, cx = (x0 + x1) / 2;
    B.box('stageWood', x0, 0, z0, x1, h, z1); B.box('gold', x0 - 0.02, h - 0.04, z1, x1 + 0.02, h, z1 + 0.04); B.box('led', x0, 0.05, z1 + 0.01, x1, 0.09, z1 + 0.05);
    for (let k = 0; k < 3; k++) B.box('stageWood', cx - 1.5, 0, z1 + k * 0.3, cx + 1.5, h - (k + 1) * h / 4, z1 + (k + 1) * 0.3); // steps
    col(x0, z0, x1, z1, 0, 2.5);
    // velvet curtains (back + swags) and gold proscenium arch with marquee bulbs
    B.add('curtain', wallZ(THREE, x0, x1, h, H - 0.45, z0 + 0.05, 1, 4, H - 0.45 - h));
    for (const sx of [x0 + 1.0, x1 - 1.0]) { const g = new THREE.CylinderGeometry(0.55, 1.0, H - 0.5 - h, 16, 1, true, 0, Math.PI); g.rotateY(Math.PI); g.translate(sx, h + (H - 0.5 - h) / 2, z1 - 0.6); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.6); B.add('curtain', g); }
    B.box('gold', x0 - 0.5, 0, z1 - 0.3, x0, H - 0.4, z1 + 0.1); B.box('gold', x1, 0, z1 - 0.3, x1 + 0.5, H - 0.4, z1 + 0.1); B.box('gold', x0 - 0.5, H - 0.9, z1 - 0.3, x1 + 0.5, H - 0.42, z1 + 0.1);
    col(x0 - 0.5, z1 - 0.3, x0, z1 + 0.1, 0, 3); col(x1, z1 - 0.3, x1 + 0.5, z1 + 0.1, 0, 3);
    let bi = bulbPos.length; const sbul = []; for (let i = 0; i < 30; i++) sbul.push([x0 - 0.25 + (x1 - x0 + 0.5) * (i + 0.5) / 30, H - 0.95, z1 + 0.14]); for (let i = 0; i < 16; i++) { const y = 0.4 + (H - 1.5) * i / 15; sbul.push([x0 - 0.25, y, z1 + 0.14]); sbul.push([x1 + 0.25, y, z1 + 0.14]); }
    for (const p of sbul.slice(0, 64)) { bm.makeTranslation(p[0], p[1], p[2]); bulbs.setMatrixAt(bi, bm); bulbs.setColorAt(bi, cc.set(0xffe6a8)); bi++; }
    bulbs.count = bi;
    // band: grand piano, double bass, drum kit, microphone; musicians + singer (tasteful evening wear)
    const px = cx + 3.6, pz = z0 + 2.4;
    B.box('piano', px - 0.75, h + 0.62, pz - 0.7, px + 0.75, h + 0.95, pz + 0.75); B.box('piano', px - 0.75, h + 0.95, pz - 0.7, px - 0.7, h + 1.6, pz + 0.75);
    B.box('stone', px - 0.72, h + 0.84, pz + 0.75, px + 0.72, h + 0.9, pz + 0.95);
    for (const [lx, lz] of [[px - 0.6, pz - 0.55], [px + 0.6, pz - 0.55], [px, pz + 0.6]]) B.cyl('piano', lx, h + 0.31, lz, 0.05, 0.04, 0.62, 8);
    const dx = cx - 3.4, dz = z0 + 1.7;
    B.cyl('velvet', dx, h + 0.3, dz, 0.28, 0.28, 0.3, 20); for (const [ox, oz, r] of [[-0.45, 0.25, 0.17], [0.45, 0.25, 0.17], [-0.2, -0.3, 0.2]]) B.cyl('velvet', dx + ox, h + 0.55, dz + oz, r, r, 0.14, 16);
    for (const [ox, oz] of [[-0.6, -0.1], [0.65, -0.15]]) { B.cyl('chrome', dx + ox, h + 0.5, dz + oz, 0.012, 0.012, 1.0, 6); B.cyl('brass', dx + ox, h + 1.0, dz + oz, 0.2, 0.2, 0.01, 18); }
    const bx = cx - 1.2, bz = z0 + 1.9; B.add('wood', new THREE.CylinderGeometry(0.22, 0.32, 1.0, 12).scale(1, 1, 0.45).translate(bx, h + 0.75, bz)); B.box('lacquer', bx - 0.02, h + 1.2, bz - 0.02, bx + 0.02, h + 1.95, bz + 0.02);
    const mx = cx + 0.4, mz = z1 - 1.0; B.cyl('chrome', mx, h + 0.75, mz, 0.012, 0.012, 1.5, 6); B.cyl('chrome', mx, h + 0.01, mz, 0.16, 0.16, 0.02, 16); B.add('chrome', new THREE.SphereGeometry(0.04, 10, 8).translate(mx, h + 1.52, mz + 0.03));
    crowdSpecs.push({ x: mx, z: mz - 0.35, yaw: 0, pose: 'stand', role: 'patron', dress: true, stageY: h });
    crowdSpecs.push({ x: px - 0.2, z: pz - 1.05, yaw: Math.PI * 0.08, pose: 'seat', seatY: 0.48 + h, role: 'patron', dress: false });
    crowdSpecs.push({ x: dx, z: dz - 0.75, yaw: 0, pose: 'seat', seatY: 0.5 + h, role: 'patron', dress: false });
    crowdSpecs.push({ x: bx + 0.25, z: bz + 0.4, yaw: -0.3, pose: 'stand', role: 'patron', dress: false, stageY: h });
    // stage spotlights (additive cones from the ceiling)
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const cones = []; for (const [tx, tz] of [[mx, mz - 0.3], [px, pz], [dx, dz]]) { const g = new THREE.CylinderGeometry(0.06, 0.9, H - h - 0.5, 20, 1, true); g.translate(0, -(H - h - 0.5) / 2, 0); g.rotateX(-0.12); g.translate(tx, H - 0.45, tz + 0.6); cones.push(norm(THREE, g)); }
    add(mergeGeometries(cones, false), coneMat, 'casino-stage-cones');
    signs.push(makeSign(() => L('stageName'), { W: 1024, H: 112, color: '#ffe9a8', bg: '#14050a' }, [cx, H - 0.66, z1 + 0.13], 0, [7.2, 0.5]));
    stations.push({ kind: 'stage', game: 'stage', id: 'stage', label: 'g_stage', box: new THREE.Box3(new THREE.Vector3(x0, 0.2, z1 - 1.5), new THREE.Vector3(x1, 2.8, z1)), stand: { x: cx, z: -20.3, yaw: 0 } });
  }
  for (const z of [-18.6, -16.2]) for (let x = -30; x <= -15; x += 2.5) { clubSpots.push([x, z, Math.PI]); col(x - 0.42, z - 0.42, x + 0.42, z + 0.42, 0, 0.9); }
  clubSpots.forEach(([x, z, y], k) => { if (k % 3 === 1) crowdSpecs.push({ x, z: z + (y ? 0.05 : -0.05), yaw: y, pose: 'seat', seatY: 0.45, role: 'patron' }); });
  for (let x = -28.75; x <= -16; x += 5) for (const z of [-18.6, -16.2]) cocktail(x, z);
  const clubs = new THREE.InstancedMesh(clubG, M.leather, clubSpots.length); clubSpots.forEach(([x, z, y], i) => { bm.compose(v.set(x, 0, z), q.setFromEuler(new THREE.Euler(0, y, 0)), s1); clubs.setMatrixAt(i, bm); }); clubs.name = 'casino-club-chairs'; group.add(clubs);

  /* ------------------------------------------------------------------ screen wall (west wall, above the slot floor) */
  const swC = TX.canvas(TS(1024), TS(256)); const swT = T(swC, { wrap: false }); swT.generateMipmaps = false; swT.minFilter = THREE.LinearFilter;
  const swCtx = swC.getContext('2d'); TX.drawScreenWall(swCtx, swC.width, swC.height, 0);
  add(new THREE.PlaneGeometry(14, 3.5).rotateY(Math.PI / 2).translate(X0 + 0.14, 4.0, -1.5), new THREE.MeshBasicMaterial({ map: swT, toneMapped: false }), 'casino-screen-wall');
  B.box('lacquer', X0 + 0.02, 2.1, -8.8, X0 + 0.12, 5.9, 5.8);
  anim.push(((acc) => (dt, t) => { acc += dt; if (acc < (low ? 0.25 : 0.12)) return; acc = 0; TX.drawScreenWall(swCtx, swC.width, swC.height, t); swT.needsUpdate = true; })(0));

  /* ------------------------------------------------------------------ cashier cage (east of the lobby) */
  { const x0 = 27, z0 = 12.2, z1 = 19.2;
    B.box('wood', x0, 0, z0, x0 + 0.6, 1.1, z1); B.box('stone', x0 - 0.05, 1.1, z0, x0 + 0.65, 1.16, z1); B.box('gold', x0 - 0.01, 0.92, z0, x0 + 0.02, 0.98, z1);
    for (let z = z0 + 0.15; z < z1; z += 0.12) B.cyl('brass', x0 + 0.3, 1.75, z, 0.008, 0.008, 1.2, 4);
    for (let k = 0; k <= 4; k++) { const z = z0 + (z1 - z0) * k / 4; B.box('gold', x0 + 0.2, 1.16, z - 0.06, x0 + 0.4, 2.45, z + 0.06); }
    B.box('gold', x0 + 0.15, 2.35, z0, x0 + 0.45, 2.5, z1); B.box('lacquer', x0, 2.5, z0, x0 + 0.6, H, z1);
    B.box('wood', x0 + 0.6, 0, z0 - 0.15, X1, H, z0); B.box('wood', x0, 0, z1, x0 + 0.6, H, Z1);
    col(x0 - 0.05, z0 - 0.15, X1, z0, 0, 3); col(x0 - 0.05, z0, x0 + 0.65, z1, 0, 2.5); col(x0 - 0.05, z1, x0 + 0.65, Z1, 0, 3);
    for (const z of [13.6, 15.7, 17.8]) crowdSpecs.push({ x: x0 + 1.1, z, yaw: -Math.PI / 2, pose: 'stand', role: 'cashier' });
    signs.push(makeSign(() => L('cageTitle') + ' · ' + L('playMoney'), { W: 1024, H: 128 }, [x0 - 0.02, 3.1, (z0 + z1) / 2], -Math.PI / 2, [5.6, 0.7]));
    // queue posts
    for (const z of [13.0, 18.4]) { B.cyl('brass', 24.6, 0.5, z, 0.035, 0.035, 1.0, 10); B.cyl('brass', 24.6, 0.02, z, 0.16, 0.18, 0.04, 16); }
    stations.push({ kind: 'cage', game: 'cage', id: 'cage', label: 'g_cage', box: new THREE.Box3(new THREE.Vector3(x0 - 0.06, 0.6, z0), new THREE.Vector3(x0 + 0.6, 2.4, z1)), stand: { x: 25.6, z: 15.7, yaw: -Math.PI / 2 } });
  }
  /* ------------------------------------------------------------------ steakhouse entrance (decor, east wall) */
  { const wx = X1 - 0.02, z0 = -1.6, z1 = 7.6, cz = (z0 + z1) / 2;
    B.box('wood', wx - 0.25, 0, z0 - 0.4, wx, 4.6, z0); B.box('wood', wx - 0.25, 0, z1, wx, 4.6, z1 + 0.4); B.box('wood', wx - 0.25, 3.6, z0, wx, 4.6, z1);
    B.box('gold', wx - 0.3, 3.55, z0 - 0.45, wx, 3.62, z1 + 0.45); B.box('gold', wx - 0.3, 4.6, z0 - 0.45, wx, 4.68, z1 + 0.45);
    const glassG = new THREE.PlaneGeometry(z1 - z0, 3.6); glassG.rotateY(-Math.PI / 2); glassG.translate(wx - 0.05, 1.8, cz); add(glassG, M.steakGlass, 'casino-steak-glass');
    for (let k = 1; k < 4; k++) B.box('gold', wx - 0.12, 0, z0 + (z1 - z0) * k / 4 - 0.04, wx - 0.04, 3.6, z0 + (z1 - z0) * k / 4 + 0.04);
    for (const z of [cz - 0.35, cz + 0.35]) B.cyl('gold', wx - 0.2, 1.1, z, 0.02, 0.02, 0.9, 8);
    signs.push(makeSign(() => L('steakName'), { W: 1024, H: 160, color: '#f1d58f', bg: '#0d0805', subFn: () => L('steakSub') }, [wx - 0.32, 4.12, cz], -Math.PI / 2, [7.2, 1.0]));
    // host podium + velvet ropes
    B.box('wood', 33.4, 0, 2.6, 34.0, 1.15, 3.4); B.box('gold', 33.35, 1.15, 2.55, 34.05, 1.2, 3.45); col(33.3, 2.5, 34.1, 3.5, 0, 1.3);
    crowdSpecs.push({ x: 34.4, z: 3.0, yaw: -Math.PI / 2, pose: 'stand', role: 'cashier' });
    for (const z of [z0 + 0.3, z1 - 0.3]) { B.cyl('brass', 34.6, 0.5, z, 0.035, 0.035, 1.0, 10); B.cyl('brass', 34.6, 0.02, z, 0.16, 0.18, 0.04, 16); col(34.45, z - 0.15, 34.75, z + 0.15, 0, 1.1); }
    col(wx - 0.3, z0 - 0.4, X1, z1 + 0.4, 0, 3);
    stations.push({ kind: 'steak', game: 'steak', id: 'steak', label: 'g_steak', box: new THREE.Box3(new THREE.Vector3(wx - 1.4, 0.3, z0 + 0.6), new THREE.Vector3(wx, 3.4, z1 - 0.6)), stand: { x: 32.2, z: cz, yaw: -Math.PI / 2 } });
  }
  /* ------------------------------------------------------------------ restrooms (west wall, south-west corner) */
  for (const [z0, z1] of [[13.2, 14.6], [16.2, 17.6]]) { B.box('lacquer', X0 + 0.01, 0, z0, X0 + 0.1, 2.6, z1); B.box('gold', X0 + 0.02, 2.6, z0 - 0.08, X0 + 0.14, 2.7, z1 + 0.08); B.box('gold', X0 + 0.1, 1.0, z0 + 0.15, X0 + 0.14, 1.3, z0 + 0.19); }
  signs.push(makeSign(() => L('restrooms'), { W: 512, H: 128, icon: 'restroom' }, [X0 + 0.15, 3.1, 15.4], Math.PI / 2, [2.4, 0.6]));
  signs.push(makeSign(() => L('welcome'), { W: 1024, H: 96 }, [0, 4.2, Z1 - 0.05], Math.PI, [7.5, 0.7]));
  /* ------------------------------------------------------------------ showpiece (east floor): gold star + film reel */
  { const cx = 28, cz = 7.6;
    B.cyl('stone', cx, 0.45, cz, 1.1, 1.25, 0.9, 40); B.cyl('gold', cx, 0.92, cz, 1.12, 1.12, 0.05, 40);
    const st = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.42 : 1.0, a = -Math.PI / 2 + i * Math.PI / 5; i ? st.lineTo(Math.cos(a) * r, Math.sin(a) * r) : st.moveTo(Math.cos(a) * r, Math.sin(a) * r); } st.closePath();
    const sg = new THREE.ExtrudeGeometry(st, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 }); sg.translate(0, 0, -0.09); sg.translate(cx, 2.35, cz); B.add('gold', sg);
    const reel = new THREE.TorusGeometry(0.8, 0.06, 8, 40); reel.translate(cx, 2.35, cz); B.add('gold', reel);
    for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; B.boxC('gold', cx + Math.cos(a) * 0.95, 2.35 + Math.sin(a) * 0.95, cz, 0.12, 0.08, 0.03); }
    B.cyl('gold', cx, 1.3, cz, 0.06, 0.08, 0.8, 12);
    col(cx - 1.3, cz - 1.3, cx + 1.3, cz + 1.3, 0, 2);
    const N = 10; for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2; const px = cx + Math.cos(a) * 2.0, pz = cz + Math.sin(a) * 2.0; B.cyl('brass', px, 0.5, pz, 0.035, 0.035, 1.0, 8); B.cyl('brass', px, 0.02, pz, 0.15, 0.17, 0.04, 14);
      const b2 = (k + 1) / N * Math.PI * 2; const c2 = new THREE.QuadraticBezierCurve3(new THREE.Vector3(px, 0.95, pz), new THREE.Vector3(cx + Math.cos((a + b2) / 2) * 1.95, 0.72, cz + Math.sin((a + b2) / 2) * 1.95), new THREE.Vector3(cx + Math.cos(b2) * 2.0, 0.95, cz + Math.sin(b2) * 2.0)); B.add('velvet', new THREE.TubeGeometry(c2, 8, 0.025, 6, false)); }
  }

  /* ------------------------------------------------------------------ instanced chairs / stools / chip stacks */
  const chFab = new THREE.InstancedMesh(chairG.fab, std({ color: 0x6a1022, roughness: 0.7 }), chairSpots.length), chBase = new THREE.InstancedMesh(chairG.base, M.gold, chairSpots.length);
  chairSpots.forEach(([x, z, y], i) => { bm.compose(v.set(x, 0, z), q.setFromEuler(new THREE.Euler(0, y, 0)), s1); chFab.setMatrixAt(i, bm); chBase.setMatrixAt(i, bm); colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.24, 0, z - 0.24), new THREE.Vector3(x + 0.24, 0.9, z + 0.24))); });
  chFab.name = 'casino-chairs'; chBase.name = 'casino-chair-bases'; group.add(chFab, chBase);
  const stSeat = new THREE.InstancedMesh(stoolG.seat, std({ color: 0x6a1022, roughness: 0.7 }), stoolSpots.length), stBase = new THREE.InstancedMesh(stoolG.base, M.chrome, stoolSpots.length);
  stoolSpots.forEach(([x, z, sy = 1], i) => { bm.compose(v.set(x, 0, z), q.identity(), new THREE.Vector3(1, sy, 1)); stSeat.setMatrixAt(i, bm); stBase.setMatrixAt(i, bm); colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.2, 0, z - 0.2), new THREE.Vector3(x + 0.2, 0.8, z + 0.2))); });
  stSeat.name = 'casino-stool-seats'; stBase.name = 'casino-stool-bases'; group.add(stSeat, stBase);
  const CHIPC = ['#c8202c', '#1f5fbf', '#178a4c', '#1b1b1f', '#6c2bb3', '#d8a21c', '#e9e4d8'];
  const chips = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 14), std({ color: 0xffffff, roughness: 0.4 }), chipSpots.length);
  chipSpots.forEach(([x, y, z, k], i) => { const hh = 0.03 + ((k * 7) % 5) * 0.012; bm.compose(v.set(x, y + hh / 2, z), q.identity(), new THREE.Vector3(1, hh, 1)); chips.setMatrixAt(i, bm); chips.setColorAt(i, cc.set(CHIPC[k % CHIPC.length])); });
  chips.instanceColor.needsUpdate = true; chips.name = 'casino-chip-stacks'; group.add(chips);

  /* ------------------------------------------------------------------ table FX: roulette balls, dice, dealt cards */
  const fxBalls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 12, 8), std({ color: 0xffffff, roughness: 0.15, metalness: 0.1 }), RTX.length);
  fxBalls.name = 'casino-fx-balls'; fxBalls.frustumCulled = false; group.add(fxBalls);
  const balls = rotors.map((r, i) => ({ i, mode: 'rest', ang: i * 1.7, rad: 0.3, t: 0, T: 1, a0: 0, a1: 0, pocket: i * 5 }));
  const DIE = 0.055;
  const diceG = (() => { const g = new THREE.BoxGeometry(DIE, DIE, DIE); const uv = g.attributes.uv; const faceVal = [3, 4, 1, 6, 2, 5]; // +x −x +y −y +z −z
    for (let f = 0; f < 6; f++) { const vv = faceVal[f] - 1; const ox = (vv % 3) / 3, oy = 1 - (Math.floor(vv / 3) + 1) / 2; for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, ox + uv.getX(i) / 3, oy + uv.getY(i) / 2); } }
    return g; })();
  const fxDice = new THREE.InstancedMesh(diceG, std({ map: T(TX.diceAtlas(TS(384)), { wrap: false }), roughness: 0.25 }), 2);
  fxDice.name = 'casino-fx-dice'; fxDice.frustumCulled = false; group.add(fxDice);
  const DICE_UP = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0] };
  const dice = { st: null, t: 0, T: 1.25, vals: [6, 1], from: [CRX[0] - 1.5, CR_Z - 0.35], to: [CRX[0] - 1.5, CR_Z - 0.35], spin: [[0, 0, 0], [0, 0, 0]], yaw: [0.3, 1.2] };
  const setDie = (k, x, y, z, e) => { bm.compose(v.set(x, y, z), q.setFromEuler(new THREE.Euler(e[0], e[1], e[2], 'YXZ')), s1); fxDice.setMatrixAt(k, bm); };
  const restDice = () => { for (let k = 0; k < 2; k++) { const u = DICE_UP[dice.vals[k]]; setDie(k, dice.to[0] + k * 0.09, 0.8 + DIE / 2, dice.to[1] + k * 0.03, [u[0], dice.yaw[k], u[2]]); } fxDice.instanceMatrix.needsUpdate = true; };
  restDice();
  const CARD_N = 16;
  const cardG = (() => { const g = new THREE.PlaneGeometry(0.064, 0.09); g.rotateX(-Math.PI / 2); return g; })();
  const cardUV = (k) => ({ ox: (k % 4) / 4, oy: 1 - (Math.floor(k / 4) + 1) / 2 });
  const tCards = T(TX.cardAtlas(TS(512)), { wrap: false });
  const cardMat = new THREE.MeshStandardMaterial({ map: tCards, roughness: 0.6, side: THREE.DoubleSide });
  // per-instance atlas cell via an instanced attribute → patched shader (one draw call for every dealt card)
  const cellAttr = new THREE.InstancedBufferAttribute(new Float32Array(CARD_N * 2), 2); cardG.setAttribute('cell', cellAttr);
  cardMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 cell;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vec2(cell.x + uv.x * 0.25, cell.y + uv.y * 0.5);\n#endif');
  };
  const fxCards = new THREE.InstancedMesh(cardG, cardMat, CARD_N); fxCards.name = 'casino-fx-cards'; fxCards.frustumCulled = false; fxCards.count = 0; group.add(fxCards);
  const cards = []; // {from, to, t, delay, cell}
  function fxRoulette(i, data) {
    const b = balls[i]; if (!b) return;
    b.mode = 'spin'; b.t = 0; b.T = 4.6; b.a0 = b.ang; b.pocket = data.wheelIndex != null ? data.wheelIndex : Math.floor(Math.random() * 38);
  }
  function fxDiceRoll(st, data) {
    const f = st.fx; dice.from = f.from; dice.to = [f.to[0] + (Math.random() - 0.5) * 0.4, f.to[1] + (Math.random() - 0.5) * 0.3]; dice.vals = data.dice || [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    dice.t = 0; dice.st = st; dice.yaw = [Math.random() * 6, Math.random() * 6]; dice.spin = [[8 + Math.random() * 6, 5, 7 + Math.random() * 5], [7, 6 + Math.random() * 4, 9]];
  }
  function fxDeal(st, data) {
    const f = st.fx; cards.length = 0; const n = Math.min(CARD_N, Math.max(2, data.n || f.spots.length));
    for (let k = 0; k < n; k++) { const sp = f.spots[k % f.spots.length]; const stack = Math.floor(k / f.spots.length); cards.push({ from: f.shoe, to: [sp[0] + stack * 0.05, 0.831 + k * 0.0005, sp[1] + stack * 0.03], t: 0, delay: k * 0.28, cell: k % 7, rot: (Math.random() - 0.5) * 0.2 }); }
    fxCards.count = cards.length; for (let k = 0; k < cards.length; k++) { bm.makeTranslation(0, -5, 0); fxCards.setMatrixAt(k, bm); } fxCards.instanceMatrix.needsUpdate = true;
  }
  /** play a table effect for the station a game was opened from */
  function fx(st, evt, data = {}) {
    if (!st || !st.fx) return false;
    if (evt === 'roulette:spin' && st.fx.type === 'roulette') { fxRoulette(st.fx.rotor, data); return true; }
    if (evt === 'craps:roll' && st.fx.type === 'dice') { fxDiceRoll(st, data); return true; }
    if (evt === 'cards:deal' && st.fx.type === 'cards') { fxDeal(st, data); return true; }
    return false;
  }
  const POCKET = Math.PI * 2 / 38;
  anim.push((dt) => {
    // roulette balls: orbit the rim against the rotor, spiral in and drop into the drawn pocket, then ride with the rotor
    rotors.forEach((r, i) => {
      r.rotation.y += dt * (balls[i].mode === 'spin' ? 1.2 : 0.6);
      const b = balls[i]; let y = 0.915;
      if (b.mode === 'spin') {
        b.t += dt; const k = Math.min(1, b.t / b.T);
        const target = r.rotation.y - (b.pocket + 0.5) * POCKET; // pocket angle on the rotor (world, follows the rotor)
        const free = b.a0 - 9.5 * (k - 0.5 * k * k) * 2 * Math.PI / 2.2; // decelerating counter-orbit
        const blend = k < 0.78 ? 0 : (k - 0.78) / 0.22;
        b.ang = free * (1 - blend * blend) + (target + Math.round((free - target) / (Math.PI * 2)) * Math.PI * 2) * blend * blend;
        b.rad = 0.37 - 0.08 * Math.max(0, (k - 0.6) / 0.4); y = 0.93 - 0.015 * blend + (k > 0.7 && k < 0.95 ? Math.abs(Math.sin(b.t * 18)) * 0.012 : 0);
        if (k >= 1) { b.mode = 'rest'; b.off = b.ang - r.rotation.y; }
      } else { b.ang = r.rotation.y + (b.off != null ? b.off : -(b.pocket + 0.5) * POCKET); b.rad = 0.29; }
      bm.makeTranslation(r.position.x + Math.cos(b.ang) * b.rad, y, r.position.z - Math.sin(b.ang) * b.rad); fxBalls.setMatrixAt(i, bm);
    });
    fxBalls.instanceMatrix.needsUpdate = true;
    // dice: ballistic hop from the shooter to the far wall, two bounces, settle on the drawn faces
    if (dice.st) {
      dice.t += dt; const k = Math.min(1, dice.t / dice.T);
      for (let d = 0; d < 2; d++) {
        const x = dice.from[0] + (dice.to[0] + d * 0.09 - dice.from[0]) * k, z = dice.from[1] + (dice.to[1] + d * 0.03 - dice.from[1]) * k;
        const hop = k < 0.55 ? Math.sin(k / 0.55 * Math.PI) * 0.35 : k < 0.8 ? Math.sin((k - 0.55) / 0.25 * Math.PI) * 0.07 : k < 0.92 ? Math.sin((k - 0.8) / 0.12 * Math.PI) * 0.02 : 0;
        const u = DICE_UP[dice.vals[d]], rem = 1 - k;
        setDie(d, x, 0.8 + DIE / 2 + hop, z, [u[0] + dice.spin[d][0] * rem * rem, dice.yaw[d] + dice.spin[d][1] * rem, u[2] + dice.spin[d][2] * rem * rem]);
      }
      fxDice.instanceMatrix.needsUpdate = true;
      if (k >= 1) dice.st = null;
    }
    // dealt cards: slide from the shoe with a little arc
    if (cards.length) {
      fxCards.count = cards.length;
      cards.forEach((c, i) => {
        c.t += dt; const k = Math.max(0, Math.min(1, (c.t - c.delay) / 0.38)); const e = 1 - (1 - k) * (1 - k);
        const x = c.from[0] + (c.to[0] - c.from[0]) * e, z = c.from[2] + (c.to[2] - c.from[2]) * e, y = c.from[1] + (c.to[1] - c.from[1]) * e + Math.sin(k * Math.PI) * 0.06;
        bm.compose(v.set(x, k > 0 ? y : -5, z), q.setFromEuler(new THREE.Euler(0, c.rot * e, 0)), s1); fxCards.setMatrixAt(i, bm);
        const cell = cardUV(k < 0.6 ? 7 : c.cell); cellAttr.setXY(i, cell.ox, cell.oy);
      });
      fxCards.instanceMatrix.needsUpdate = true; cellAttr.needsUpdate = true;
    }
  });
  const clearFx = () => { cards.length = 0; fxCards.count = 0; };

  /* ------------------------------------------------------------------ exit points */
  signs.push(makeSign(() => L('lbl_exit'), { W: 1024, H: 112 }, [-4.6, 2.35, 33.2], 0, [3.2, 0.36]));
  B.cyl('brass', -4.6, 1.1, 33.12, 0.05, 0.05, 2.2, 10); B.box('lacquer', -6.25, 2.13, 33.1, -2.95, 2.57, 33.14); col(-4.8, 32.9, -4.4, 33.3, 0, 2.5);
  stations.push({ kind: 'exit', game: 'exit', id: 'exit-plaza', label: 'lbl_exit', box: new THREE.Box3(new THREE.Vector3(-6.25, 0.3, 32.9), new THREE.Vector3(-2.95, 2.6, 33.3)), stand: { x: -4.6, z: 31.2, yaw: Math.PI } });
  stations.push({ kind: 'exit', game: 'exit', id: 'exit-doors', label: 'lbl_exit', box: new THREE.Box3(new THREE.Vector3(-4.8, 0.3, 19.3), new THREE.Vector3(4.8, 2.6, 19.6)), stand: { x: 0, z: 17.6, yaw: Math.PI } });

  /* ------------------------------------------------------------------ crowd */
  crowdSpecs.push({ x: -2, z: 26, yaw: 0, pose: 'stand', role: 'patron', walk: [[-2.5, 31], [-2.5, 22], [-7, 21.8], [-9, 26.5], [-6, 31]] });
  crowdSpecs.push({ x: 5, z: 14, yaw: 0, pose: 'stand', role: 'patron', walk: [[-10, 13.4], [10, 13.4], [10, 18.0], [-10, 18.0]] });
  crowdSpecs.push({ x: -20, z: 6, yaw: 0, pose: 'stand', role: 'patron', walk: [[-34.8, 6], [-13.6, 6], [-13.6, 0], [-34.8, 0]] });
  crowdSpecs.push({ x: -20, z: -6, yaw: 0, pose: 'stand', role: 'patron', walk: [[-13.6, -6], [-34.8, -6], [-34.8, -12.2], [-13.6, -12.2]] });
  crowdSpecs.push({ x: 8, z: 4.3, yaw: 0, pose: 'stand', role: 'patron', walk: [[-8.4, 4.3], [21.2, 4.3], [21.2, -1.8], [-8.4, -1.8]] });
  crowdSpecs.push({ x: 0, z: 9.4, yaw: 0, pose: 'stand', role: 'patron', walk: [[21.2, 9.4], [-8.4, 9.4]] });
  if (!low) {
    crowdSpecs.push({ x: 6, z: -9.5, yaw: 0, pose: 'stand', role: 'patron', walk: [[-8.4, -9.5], [21.2, -9.5], [21.2, -1.8], [12.5, -1.8], [7.5, -9.5]] });
    crowdSpecs.push({ x: -3.5, z: -14.2, yaw: 0, pose: 'stand', role: 'patron', walk: [[-3.5, -14.2], [15.2, -14.2], [14.6, -23.6], [-3.5, -23.6]] });
    crowdSpecs.push({ x: 23.1, z: -18, yaw: 0, pose: 'stand', role: 'patron', walk: [[23.1, -6.45], [23.1, -24.6], [29.6, -24.6], [29.6, -19.65], [23.1, -19.65]] });
    crowdSpecs.push({ x: -23, z: -20.3, yaw: 0, pose: 'stand', role: 'patron', walk: [[-33.5, -20.3], [-12.6, -20.3]] });
  }
  for (const [x, z, y] of [[-4, 14.5, 0.4], [-3.4, 15.3, 2.6], [4.2, 14.6, -1.2], [24.5, 5.4, 3.0], [26.2, 5.0, 3.6], [-16, 15.2, 1.4], [-15.4, 15.9, -2.2], [-2.5, 10.4, 0.6], [18.6, 10.6, -1.6],
    [-6.6, 1.0, 1.0], [-28.4, 11.7, 0.5], [9.2, -12.4, 2.8], [10, -12.0, -0.6], [-21, -14.4, 2.8], [-20.4, -14.9, -0.4], [31, 0.4, -1.2], [16.6, 15.6, 1.8]]) crowdSpecs.push({ x, z, yaw: y, pose: 'stand', role: 'patron' });
  const crowdList = low ? crowdSpecs.filter((s, i) => s.role !== 'patron' || s.walk || s.stageY != null || i % 3 !== 2) : crowdSpecs;
  const crowd = buildCrowd(THREE, crowdList, { seed: 11 });
  group.add(crowd.group);
  for (const p of crowd.people) if (!p.walk && p.pose === 'stand' && p.stageY == null) colliders.push(new THREE.Box3(new THREE.Vector3(p.x - 0.22, 0, p.z - 0.22), new THREE.Vector3(p.x + 0.22, 1.8, p.z + 0.22)));
  anim.push(((acc) => (dt, t) => { acc += dt; if (low && acc < 1 / 30) return; crowd.update(t, acc); acc = 0; })(0));

  /* ------------------------------------------------------------------ merge static batches */
  const merged = B.build(M, group);
  for (const k of ['coffer', 'beam']) if (merged[k]) merged[k].userData.ceiling = true;

  /* ------------------------------------------------------------------ signs helper (hoisted) */
  function signOpts(o) { return o.subFn ? Object.assign({}, o, { sub: o.subFn() }) : o; }
  function makeSign(textFn, o, pos, ry, size) {
    const c = TX.signCanvas(textFn(), signOpts(o)); const t = T(c, { wrap: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    m.position.set(pos[0], pos[1], pos[2]); m.rotation.y = ry; m.name = 'casino-sign'; group.add(m);
    return { mesh: m, tex: t, canvas: c, textFn, o };
  }
  function relabel() {
    for (const s of signs) { try { const c2 = TX.signCanvas(s.textFn(), signOpts(s.o)); const x = s.canvas.getContext('2d'); x.clearRect(0, 0, s.canvas.width, s.canvas.height); x.drawImage(c2, 0, 0); s.tex.needsUpdate = true; } catch (_) {} }
  }

  /* ------------------------------------------------------------------ lights */
  const lights = [];
  const hemi = new THREE.HemisphereLight(0xffe2bd, 0x3a1c10, 1.25); hemi.position.set(0, 10, 0); group.add(hemi); lights.push(hemi);
  const key = new THREE.DirectionalLight(0xffe6c8, 0.9); key.position.set(12, 30, 18); key.target.position.set(0, 0, 0); group.add(key, key.target); lights.push(key);
  const fill = new THREE.DirectionalLight(0xb8c8ff, 0.25); fill.position.set(-20, 12, -25); group.add(fill); lights.push(fill);
  const pts = low ? [[6, 3.6, 2, 0xffd6a0, 46], [0, 4.5, 15.5, 0xffe2b8, 40]]
    : [[0, 4.6, 15.6, 0xffe2b8, 50], [3, 3.6, 4.3, 0xffd6a0, 34], [15, 3.6, -1.8, 0xffd6a0, 34], [-25, 4, 0, 0xffc8a0, 36], [6, 3.2, -19.6, 0xff9ad8, 28], [29.6, 3.4, -15.6, 0xffd6a0, 32], [-23, 4.6, -22.6, 0xffd8a8, 40], [0, 4.0, 25, 0xffe2b8, 40]];
  for (const [x, y, z, c, i] of pts) { const p = new THREE.PointLight(c, i, 17, 2); p.position.set(x, y, z); group.add(p); lights.push(p); }

  /* ------------------------------------------------------------------ rooms, minimap, nav */
  const rooms = Object.entries(ROOM_BOXES).map(([k, r]) => ({ key: 'casino-' + k, labelKey: ROOM_LABEL[k], r, pick: k !== 'floorSW' }));
  const N = []; const node = (id, x, z, room, o = {}) => { N.push(Object.assign({ id, x, y: 0, z, room: 'casino-' + room }, o)); };
  node('plaza', 0, 30.8, 'entrance', { hub: true, label: 'room_entrance' }); node('plazaW', -4.6, 31.2, 'entrance'); node('carpetMid', 0, 25.5, 'entrance');
  node('doorOut', 0, 21.9, 'entrance'); node('doorIn', 0, 18.4, 'lobby');
  node('lobby', 0, 13.4, 'lobby', { hub: true, label: 'room_lobby' }); node('lobbyW', -12, 13.4, 'lobby'); node('lobbyE', 12, 13.4, 'lobby');
  node('restrooms', -34.4, 14.6, 'floorSW'); node('sw', -24, 12.8, 'floorSW');
  const AISLES = [12.8, 6, 0, -6, -12.2];
  AISLES.forEach((z, ai) => { node('sW' + ai, -35, z, ai === 0 ? 'floorSW' : 'floor'); if (ai) node('sM' + ai, -25, z, 'floor', ai === 2 ? { hub: true, label: 'room_floor' } : {}); node('sE' + ai, -13.5, z, ai === 0 ? 'floorSW' : 'floor'); });
  node('stageW', -33.5, -20.3, 'stage'); node('stage', -23, -20.3, 'stage', { hub: true, label: 'room_stage' }); node('stageE', -12.5, -20.3, 'stage');
  const PS = [-8.5, -3.5, 1.5, 6.5, 11.5, 16.5, 21.3];
  PS.forEach((x, i) => node('pS' + i, x, 9.4, 'pit'));
  node('pM0', -8.5, 4.3, 'pit'); node('pM1', 1.5, 4.3, 'pit'); node('pit', 6.5, 4.3, 'pit', { hub: true, label: 'room_pit' }); node('pM2', 11.5, 4.3, 'pit'); node('pM3', 12.5, 4.3, 'pit'); node('pM4', 21.3, 4.3, 'pit');
  const PC = [-8.5, 1.5, 7.5, 12.5, 21.3];
  PC.forEach((x, i) => node('pC' + i, x, -1.8, 'pit'));
  node('pN0', -8.5, -9.5, 'pit'); node('pN1', 6, -9.5, 'pit'); node('pN2', 7.5, -9.5, 'pit'); node('pN3', 21.3, -9.5, 'pit');
  node('barS', 6, -14.2, 'bar', { hub: true, label: 'room_bar' }); node('barSW', -3.5, -14.2, 'bar'); node('barSE', 15.2, -14.2, 'bar');
  node('barW', -3.5, -19.6, 'bar'); node('barE', 14.6, -19.6, 'bar'); node('barNW', -3.5, -23.6, 'bar'); node('barN', 6, -23.6, 'bar'); node('barNE', 14.6, -23.6, 'bar');
  node('pokerDoorOut', 20.6, -12.3, 'pit'); node('pokerDoorIn', 23.2, -12.3, 'poker');
  for (const [i, z] of [[0, -24.6], [1, -19.65], [2, -13.05], [3, -6.45]]) { node('pkW' + i, 23.1, z, 'poker'); node('pkC' + i, 29.6, z, 'poker', i === 2 ? { hub: true, label: 'room_poker' } : {}); }
  node('east', 25, 2.5, 'steak', { hub: true, label: 'room_steak' }); node('steak', 32.2, 3.0, 'steak');
  node('cage', 25.6, 15.7, 'cage', { hub: true, label: 'room_cage' });
  const E = [['plaza', 'plazaW'], ['plaza', 'carpetMid'], ['carpetMid', 'doorOut'], ['doorOut', 'doorIn'], ['doorIn', 'lobby'], ['lobby', 'lobbyW'], ['lobby', 'lobbyE'],
    ['lobbyW', 'sE0'], ['sE0', 'sw'], ['sw', 'sW0'], ['sW0', 'restrooms'], ['lobby', 'pS2'], ['lobby', 'pS3'], ['lobbyE', 'pS5'], ['lobbyE', 'cage'], ['pS6', 'cage'], ['pS6', 'pM4'],
    ['pM4', 'east'], ['pC4', 'east'], ['east', 'steak'], ['pS0', 'sE1'], ['pM0', 'sE1'], ['pM0', 'sE2'], ['pC0', 'sE2'], ['pC0', 'sE3'], ['pN0', 'sE3'], ['pN0', 'sE4'], ['sE4', 'stageE'],
    ['stageE', 'stage'], ['stage', 'stageW'], ['stageW', 'sW4'], ['stageE', 'barW'], ['pN0', 'barSW'], ['pN1', 'barS'], ['pN3', 'barSE'], ['pN3', 'pokerDoorOut'], ['pokerDoorOut', 'pokerDoorIn'], ['pokerDoorIn', 'pkW2'],
    ['barSW', 'barS'], ['barS', 'barSE'], ['barSW', 'barW'], ['barW', 'barNW'], ['barNW', 'barN'], ['barN', 'barNE'], ['barNE', 'barE'], ['barE', 'barSE'],
    ['pS2', 'pM1'], ['pS4', 'pM2'], ['pM1', 'pC1'], ['pM3', 'pC3'], ['pC2', 'pN2'], ['pN1', 'pN2'],
  ];
  for (let i = 0; i < PS.length - 1; i++) E.push(['pS' + i, 'pS' + (i + 1)]);
  E.push(['pS0', 'pM0'], ['pS6', 'pM4'], ['pM0', 'pM1'], ['pM1', 'pit'], ['pit', 'pM2'], ['pM2', 'pM3'], ['pM3', 'pM4'], ['pM0', 'pC0'], ['pM4', 'pC4']);
  for (let i = 0; i < PC.length - 1; i++) E.push(['pC' + i, 'pC' + (i + 1)]);
  E.push(['pC0', 'pN0'], ['pC4', 'pN3'], ['pN0', 'pN1'], ['pN2', 'pN3']);
  AISLES.forEach((z, ai) => { if (ai) { E.push(['sW' + ai, 'sM' + ai], ['sM' + ai, 'sE' + ai]); } else E.push(['sW0', 'sE0']); if (ai < AISLES.length - 1) E.push(['sW' + ai, 'sW' + (ai + 1)], ['sE' + ai, 'sE' + (ai + 1)]); });
  for (let i = 0; i < 4; i++) { E.push(['pkW' + i, 'pkC' + i]); if (i < 3) E.push(['pkW' + i, 'pkW' + (i + 1)], ['pkC' + i, 'pkC' + (i + 1)]); }
  const nav = { nodes: N, edges: E };
  const minimap = { rooms: rooms.map((r) => ({ key: r.key, labelKey: r.labelKey, r: r.r })), bounds: [X0 - 1, Z0 - 1, X1 + 1, 36] };

  stations.forEach((s, i) => { s.index = i; if (!s.id) s.id = s.kind + i; });

  let time = 0;
  return {
    group, colliders, walkable: walk, stations, rooms, nav, minimap, lights, textures, signs, crowd,
    drawCallsEstimate: group.children.length,
    spawn: { x: 0, y: 0, z: 31.0, yaw: 0 },
    relabel, fx, clearFx,
    counts: { slots: machines.length, blackjack: BJX.length, roulette: RTX.length, craps: CRX.length, baccarat: BAX.length, poker: PT.length, videopoker: stations.filter((s) => s.kind === 'vp').length, cameras: domeSpots.length, people: crowd.people.length },
    update(dt) { time += dt; for (const f of anim) { try { f(dt, time); } catch (e) { /* keep going */ } } },
    yawTo,
  };
}
export { yawTo, faceYaw };

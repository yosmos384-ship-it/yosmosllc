// heli.js — V13 HELI: the helicopter.
//  • buildParked(ctx): an original light-twin executive helicopter idling on a temporary helipad in the back yard of
//    the house (home world), pilot in the right seat, rotors turning slowly; tap → "🚁 טיסה במסוק" → enters 'heli'.
//  • default buildWorld(wctx): the 'heli' world — the real city around 3351 Eakin Rd (USGS/NAIP aerial imagery on
//    USGS 3DEP terrain, OSM buildings, trees detected from the imagery), a city tour on autopilot that takes off from
//    the yard, orbits ~16 real places with labels + captions and lands back home; manual flight (arcade-realistic
//    model, touch sticks / keyboard), autopilot resume / fly home; camera "🎥 inside" (front seat / cabin, look
//    around) or "🚁 helicopter" (chase, orbitable) with a "🗺 top-down" map view; procedural rotor + turbine audio.
//  • V13.1 "🎰 to the casino": from the rail (parked, on the tour or in manual flight) the autopilot flies straight to the
//    casino, makes a proper approach over the open lawn north-east of its main entrance (approach gate → final → hover
//    → touch-down), spools the rotor down, slides the cabin door open and fades into the 'casino' world at its entrance
//    (worlds.enter('casino', { spawn: 'entrance', from: 'heli' })). From the casino the visitor can fly back: the heli
//    world is rebuilt with the helicopter parked at the casino LZ (onEnter({ from: 'casino' })) and flies home.
//  • register(worlds), HELI_STRINGS / I18N.
// Content rules: original design (no TV-show helicopter look, no real logos / operators), the pilot is a
// professional adult in a flight suit (no suggestive styling). No side effects on import.
import { buildHeli, HELI, halfWidth } from './heli-model.js';
import { buildPilot } from './heli-pilot.js';
import { createFlight, buildTour, orderPois, headingOf, MAX_SPEED, telemetry } from './heli-flight.js';
import { HELI_STRINGS, KIND_ICON, poiName } from './heli-strings.js';
import { drawAvionics, resetAvionicsMap } from './heli-avionics.js';
import { createHeliAudio, heliRadio } from './heli-audio.js';
import { createHeliUI } from './heli-ui.js';
import { helipadTexture, LIVERY } from './heli-tex.js';
import * as I18N from './i18n.js';
import { getRadio } from './radio-engine.js';

export { HELI_STRINGS };
export const I18N_TABLE = HELI_STRINGS;
export { HELI_STRINGS as I18N };
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// V13: on a phone the helicopter + city always build at 'low' (textures ≤ 1024 px, 1024 shadow map, fewer tiles / trees),
// even if the visitor picked high quality for the house
function isPhone() { try { return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820; } catch (_) { return false; } }
function heliQuality(q) { return isPhone() ? 'low' : (q || 'high'); }
let roomRegistered = false;
/* ------------------------------------------------------------------------------------------- i18n */
let registered = false;
function ensureStrings() {
  if (registered) return; registered = true;
  try { if (typeof I18N.registerTable === 'function') I18N.registerTable(HELI_STRINGS.he, HELI_STRINGS.en, HELI_STRINGS.es); } catch (_) {}
}
function curLang() { try { const l = typeof I18N.getLang === 'function' ? I18N.getLang() : 'he'; return HELI_STRINGS[l] ? l : 'he'; } catch (_) { return 'he'; } }
export function S(key, ...args) {
  const d = HELI_STRINGS[curLang()] || HELI_STRINGS.he;
  const s = d[key] != null ? d[key] : HELI_STRINGS.he[key] != null ? HELI_STRINGS.he[key] : key;
  return String(s).replace(/\{(\d)\}/g, (_, i) => (args[+i] != null ? String(args[+i]) : ''));
}

/* ------------------------------------------------------------------------------------------- casino landing zone */
// V13.1 — true frame of data/heli-area.json (x east, z south). The casino (tour POI 'casino', OSM footprint centred near
// (−1745, −1160), 85 dm high) has its main entrance on the north facade, where the drop-off drive meets the building at
// ≈ (−1752, −1272). The LZ is the open lawn north-east of that entrance: no building within 45 m, the nearest tree
// (16 m) 25 m to the west, clear of the curved footpath; the nose points at the entrance (heading ≈ 224°). The final
// approach comes from the north-east along that heading (gate 750 m out) over the lawn / car park, never across the roof.
export const CASINO_LZ = { x: -1703, z: -1322, entrance: { x: -1752, z: -1272 }, gate: { dist: 750, r: 220 } };
CASINO_LZ.h = headingOf(CASINO_LZ.entrance.x - CASINO_LZ.x, CASINO_LZ.entrance.z - CASINO_LZ.z);

/* ------------------------------------------------------------------------------------------- parked (home world) */
// plan.js frame: back yard pad centre (clear of the big tree's crown and the two back-corner trees), nose toward
// the house (+z). The heli world uses the same spot (planToArea) so the tour starts where the visitor boarded.
export const PARK = { x: 4.8, z: -27.5, yaw: Math.PI, pad: 13 };
export async function buildParked(ctx) {
  const THREE = ctx.THREE;
  ensureStrings();
  const q = heliQuality(ctx.quality);
  const root = new THREE.Group(); root.name = 'heli:parked'; root.userData.floor = 'outside'; root.userData.room = 'exterior';
  const model = buildHeli(THREE, { quality: q, envMap: null });
  let pilot = null;
  try { pilot = buildPilot(THREE, { quality: q, seat: model.seats.pilot, cyclic: model.parts.cyclic[0], collective: model.parts.collective, floor: model.parts.FLOOR }); model.intr.add(pilot.group); } catch (e) { console.warn('[heli] pilot', e); }
  model.group.position.set(PARK.x, 0.03, PARK.z); model.group.rotation.y = PARK.yaw;
  root.add(model.group);
  // temporary helipad (concrete square with the H; thin so the walker steps on it)
  const padM = new THREE.MeshStandardMaterial({ map: helipadTexture(THREE), roughness: 0.92 });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(PARK.pad, PARK.pad), padM); pad.rotation.x = -Math.PI / 2; pad.position.set(PARK.x, 0.025, PARK.z - 0.3); pad.receiveShadow = true; pad.name = 'heli:pad';
  root.add(pad);
  root.traverse((o) => { o.userData.floor = 'outside'; o.userData.room = 'exterior'; o.userData.heliParked = true; });
  model.setRotor(0.32, 0.016); model.setLights(0);
  try { const dsp = model.displays; if (dsp && dsp.canvas) { drawAvionics(dsp.canvas, { tilt: 0, roll: 0, h: Math.PI, speed: 0, alt: 230, agl: 0, vs: 0, rpm: 0.32, power: 0.25, x: 0, z: 0, pois: [] }, null); dsp.texture.needsUpdate = true; } } catch (_) {}
  if (ctx.scene) ctx.scene.add(root);
  const board = () => { try { const W = ctx.worlds; if (W && (W.enterWorld || W.enter)) return (W.enterWorld || W.enter).call(W, 'heli'); } catch (e) { console.warn('[heli] board', e); } };
  const handles = [];
  // a raycast-only proxy around the fuselage (bigger tap target; never drawn)
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 7.2), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.position.set(0, 1.25, -0.9); proxy.name = 'heli:boardProxy'; model.group.add(proxy); proxy.userData.floor = 'outside'; proxy.userData.room = 'exterior';
  try { if (typeof ctx.addInteractive === 'function') { handles.push(ctx.addInteractive(proxy, { label: () => S('board'), onUse: board, travel: 'heli' })); handles.push(ctx.addInteractive(model.group, { label: () => S('board'), onUse: board, travel: 'heli' })); } } catch (_) {}
  // colliders (fuselage + boom) once placed
  try {
    if (typeof ctx.addCollider === 'function') {
      root.updateMatrixWorld(true);
      const box = (x0, y0, z0, x1, y1, z1) => { const b = new THREE.Box3(); for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) b.expandByPoint(model.group.localToWorld(new THREE.Vector3(x, y, z))); return b; };
      ctx.addCollider(box(-1.15, 0, -4.45, 1.15, 2.6, 2.4));
      ctx.addCollider(box(-0.4, 1.0, 2.4, 0.4, 2.2, 7.0));
    }
  } catch (_) {}
  // idle: rotors, lights, pilot; interior hidden when far (draw calls); a soft idle sound nearby
  const audio = createHeliAudio(() => ctx.audio && ctx.audio.ctx);
  let t = 0, audT = 0;
  const cp = new THREE.Vector3(), hp = new THREE.Vector3();
  const tick = (dt) => {
    dt = Math.min(0.1, dt || 0.016); t += dt;
    let vis = true; for (let o = root; o; o = o.parent) if (!o.visible) { vis = false; break; }
    if (!vis) { if (audio.started) audio.set({ rpm: 0, mute: true }); return; }
    model.setRotor(0.32, dt); model.setLights(t);
    if (pilot) pilot.update(dt, {});
    if (ctx.camera) { ctx.camera.getWorldPosition(cp); model.group.getWorldPosition(hp); const d = cp.distanceTo(hp); model.setDetail(d < 24 ? 'full' : 'exterior');
      audT += dt; if (audT > 0.2) { audT = 0; try { if (d < 70) audio.set({ rpm: 0.32, power: 0.2, inside: false, dist: d }); else if (audio.started) audio.set({ rpm: 0, mute: true }); } catch (_) {} } }
  };
  let unsub = null;
  try { if (typeof ctx.onUpdate === 'function') unsub = ctx.onUpdate(tick); } catch (_) {}
  root.userData.boardLabel = () => S('board');
  return {
    object: root, group: root, model, pilot, pad, update: tick, handles, board,
    dispose() { try { unsub && unsub(); audio.stop(); for (const h of handles) h && h.remove && h.remove(); root.parent && root.parent.remove(root); } catch (_) {} },
  };
}

/* ------------------------------------------------------------------------------------------- cabin door (V13.1) */
// The hull draws the right-hand sliding cabin door closed. When it opens, a panel shaped to the hull (halfWidth) covers
// the door, pops out a few cm and slides aft on its rail; a dark opening is revealed behind it. set(v), v = 0 … 1.
function buildDoor(THREE, model) {
  const g = new THREE.Group(); g.name = 'heli:door'; g.visible = false;
  const hw = (z, y) => { let v = 0; try { v = halfWidth(z, y); } catch (_) {} return isFinite(v) && v > 0.3 ? v : 0.3; };
  const Z0 = -1.32, Z1 = -0.34, Y0 = 0.80, Y1 = 1.96, SLIDE = 0.98;
  const sheet = (z0, z1, y0, y1, off, nz = 8, ny = 8) => {
    const pos = [], idx = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nz; i++) { const z = z0 + (z1 - z0) * i / nz, y = y0 + (y1 - y0) * j / ny; pos.push(hw(z, y) + off, y, z); }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nz; i++) { const a = j * (nz + 1) + i, b = a + 1, c = a + nz + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    // the livery's plain navy point (same as the fin / cowling), so the panel matches the hull paint
    const P = (LIVERY && LIVERY.PLAIN) || [0.85, 0.62], uv = new Float32Array((pos.length / 3) * 2); for (let k = 0; k < uv.length; k += 2) { uv[k] = P[0]; uv[k + 1] = P[1]; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  };
  // pop-out so the panel clears the hull wherever it slides (the cabin widens a little aft)
  let pop = 0.04;
  for (let z = Z0; z <= Z1 + 1e-6; z += 0.1) for (let y = Y0; y <= Y1 + 1e-6; y += 0.2) pop = Math.max(pop, hw(z + SLIDE, y) - hw(z, y) + 0.03);
  const paint = (model.M && model.M.paint) || new THREE.MeshStandardMaterial({ color: 0x1d2a44, roughness: 0.35, metalness: 0.4 });
  const glassM = new THREE.MeshStandardMaterial({ color: 0x0d1218, roughness: 0.08, metalness: 0.7, name: 'heli:doorGlass' });
  const holeM = new THREE.MeshBasicMaterial({ color: 0x07080b, name: 'heli:doorHole' });
  const panel = new THREE.Group(); panel.name = 'heli:doorPanel';
  const leaf = new THREE.Mesh(sheet(Z0, Z1, Y0, Y1, 0.014), paint); leaf.castShadow = true;
  const win = new THREE.Mesh(sheet(-1.20, -0.46, 1.22, 1.84, 0.019, 4, 3), glassM);
  panel.add(leaf, win);
  const hole = new THREE.Mesh(sheet(Z0 + 0.02, Z1 - 0.02, Y0 + 0.02, Y1 - 0.02, 0.006, 6, 6), holeM); hole.name = 'heli:doorHole';
  g.add(hole, panel);
  model.group.add(g);
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  return {
    group: g,
    set(v) { v = clamp(+v || 0, 0, 1); g.visible = v > 0.001; panel.position.x = pop * sm(0, 0.22, v); panel.position.z = SLIDE * sm(0.18, 1, v); },
  };
}

/* ------------------------------------------------------------------------------------------- sky */
const SKY_HOR = 0xc9d8e6; // horizon colour (the area's distance haze is tone-mapped to it)
function buildSky(THREE, sunDir) {
  const g = new THREE.SphereGeometry(1, 48, 24);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const zen = new THREE.Color(0x3d6fb8), hor = new THREE.Color(SKY_HOR), gnd = new THREE.Color(0x9aa69a), c = new THREE.Color(), sun = new THREE.Color(0xfff2d6);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    if (v.y >= 0) c.copy(hor).lerp(zen, Math.pow(v.y, 0.5)); else c.copy(hor).lerp(gnd, Math.min(1, -v.y * 6));
    const sd = Math.max(0, v.dot(sunDir)); c.lerp(sun, Math.pow(sd, 40) * 0.8 + Math.pow(sd, 6) * 0.15);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(g, m); mesh.scale.setScalar(50000); mesh.frustumCulled = false; mesh.renderOrder = -10; mesh.name = 'heli:sky';
  return mesh;
}

/* ------------------------------------------------------------------------------------------- world */
export default async function buildWorld(wctx) {
  const THREE = wctx.THREE;
  ensureStrings();
  const quality = heliQuality(wctx.quality), hi = quality !== 'low';
  const prog = (f, l) => { try { wctx.progress && wctx.progress(f, l); } catch (_) {} };
  const yieldF = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));
  const group = new THREE.Group(); group.name = 'world:heli'; group.userData.world = 'heli'; group.userData.floor = 'main';
  prog(0.02, S('loading'));
  /* ---------------- area (lazy JSON + imagery) */
  const AM = await import('./heli-area.js');
  let data = null;
  try { data = wctx.heliAreaData || await AM.loadArea(wctx.heliAreaUrl); } catch (e) { console.warn('[heli] area data', e); data = { tour: [], labels: [], tiles: { levels: [] } }; }
  const padXZ = AM.planToArea(data, PARK.x, PARK.z);
  const sunDir = new THREE.Vector3(-0.38, 0.62, 0.69).normalize(); // afternoon sun from the south-south-west
  const area = await AM.buildArea(THREE, data, { quality, renderer: wctx.renderer, pad: padXZ, sunDir, horizon: SKY_HOR, S, onProgress: (f, l) => prog(0.05 + f * 0.75, l) });
  group.add(area.group);
  const ground = area.ground, obstacle = area.obstacle;
  const PAD = { x: area.pad.x, y: area.pad.y, z: area.pad.z, h: wrapPi(-PARK.yaw + Math.PI) }; // nose toward the house = true north + 180°? see below
  // the parked heading in the true frame: plan nose +z (toward the house) → true −z (north) → heading 0
  PAD.h = 0;
  // V14: Google Photorealistic 3D Tiles (js/heli-google3d.js) — the real city as in Google Earth; the classic USGS / OSM
  // city above stays as the fallback (no key / 403 / quota / offline) and as the "🗺 classic" mode of the rail toggle.
  // In Google mode the helicopter parks on Eakin Rd in front of the house (the real back yard is under a tree canopy).
  let g3d = null; const PAD0 = { x: PAD.x, y: PAD.y, z: PAD.z, h: PAD.h };
  const syncPad = () => { const g = g3d && g3d.homePad ? g3d.homePad() : null; Object.assign(PAD, g || PAD0); };
  try {
    const G3 = await import('./heli-google3d.js');
    g3d = G3.attachGoogle3D(THREE, { area, data, group, renderer: wctx.renderer, camera: wctx.camera, quality, S,
      message: (t, ms) => { try { ui && ui.message(t, ms); } catch (_) {} },
      spots: [{ x: 0, z: -10.5, pts: [[-60, 0], [-40, 0], [-20, 0], [0, 0], [20, 0], [40, 0], [60, 0]] }, { x: CASINO_LZ.x, z: CASINO_LZ.z, r: 10 }],
      homePad: { x: PAD.x, z: -10.5, h: Math.PI / 2 },
      onMode: () => { try { syncPad(); if (st.active && (st.mode === 'parked' || st.mode === 'landed') && st.at === 'home' && !st.arrive) { placeOnPad(); newTour(); } } catch (_) {} } });
  } catch (e) { console.warn('[heli] google 3d', e); g3d = null; }
  await yieldF();
  /* ---------------- helicopter + pilot */
  let envTex = null, envRT = null;
  try {
    const pm = new THREE.PMREMGenerator(wctx.renderer); const sc = new THREE.Scene(); sc.add(buildSky(THREE, sunDir));
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(40000, 16), new THREE.MeshBasicMaterial({ color: 0x6f7462 })); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -200; sc.add(gnd);
    envRT = pm.fromScene(sc, 0.03); envTex = envRT.texture; pm.dispose();
    sc.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  } catch (e) { envTex = null; envRT = null; }
  const model = buildHeli(THREE, { quality, envMap: envTex });
  const pilot = buildPilot(THREE, { quality, seat: model.seats.pilot, cyclic: model.parts.cyclic[0], collective: model.parts.collective, floor: model.parts.FLOOR });
  model.intr.add(pilot.group);
  const heli = model.group; group.add(heli);
  // V13.1 the right-hand sliding cabin door (the hull paints it closed; this panel covers it and slides aft to open)
  const door = buildDoor(THREE, model);
  model.group.traverse((o) => { o.userData.floor = 'main'; });
  prog(0.88, S('loading'));
  /* ---------------- sky, lights, fog */
  const sky = buildSky(THREE, sunDir); group.add(sky);
  const sun = new THREE.DirectionalLight(0xfff0da, hi ? 2.6 : 2.4);
  sun.castShadow = true; sun.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 200 }); sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  group.add(sun); group.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xd3e3ff, 0x7c7563, 0.85); group.add(hemi);
  const fog = new THREE.FogExp2(0xc4d1dc, hi ? 0.000022 : 0.00003);
  /* ---------------- player booth (the walker stays here; the camera is driven by this world) */
  const BOOTH = new THREE.Vector3(0, -900, 0);
  {
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ visible: false })); fl.rotation.x = -Math.PI / 2; fl.position.copy(BOOTH); fl.name = 'heli:booth'; group.add(fl);
    fl.updateMatrixWorld(true);
    try { wctx.addWalkable && wctx.addWalkable(fl); } catch (_) {}
    const B = (x0, z0, x1, z1) => new THREE.Box3(new THREE.Vector3(BOOTH.x + x0, BOOTH.y - 1, BOOTH.z + z0), new THREE.Vector3(BOOTH.x + x1, BOOTH.y + 4, BOOTH.z + z1));
    try { for (const b of [B(-3, -3, 3, -2.5), B(-3, 2.5, 3, 3), B(-3, -3, -2.5, 3), B(2.5, -3, 3, 3)]) wctx.addCollider && wctx.addCollider(b); } catch (_) {}
    try { if (!roomRegistered) { roomRegistered = true; wctx.registerRoom && wctx.registerRoom('heli', { floor: 'main', he: HELI_STRINGS.he.world, box: new THREE.Box3(new THREE.Vector3(BOOTH.x - 3, BOOTH.y - 2, BOOTH.z - 3), new THREE.Vector3(BOOTH.x + 3, BOOTH.y + 4, BOOTH.z + 3)), pick: false }); } } catch (_) {}
  }

  /* ---------------- state */
  // V13.1 low passes: every place is circled low (≈ 45 m AGL; downtown / tall roofs: ≥ 30 m above the roofs beside the
  // track — heli-flight.js buildTour), climbing back to cruise between places
  const tourPois = (data.tour || []).map((p) => Object.assign({}, p, { agl: p.kind === 'downtown' ? 60 : p.kind === 'river' ? 50 : 45 }));
  const st = {
    active: false, mode: 'parked', // parked | tour | manual | home | landed
    view: 'in', seat: 'front', t: 0, time: 0, speedMul: 2, paused: false, rpm: 0.32, rpmTarget: 0.32,
    pending: 0, path: null, pathKind: 'tour', legBase: 0, visited: -1, order: [], lastDrag: -10, yaw0: 0, pitch0: 0, lastBump: 0, lastEdge: 0,
    pose: { x: PAD.x, y: PAD.y, z: PAD.z, h: PAD.h, tilt: 0, roll: 0, speed: 0, vy: 0, agl: 0, phase: 'parked', leg: -1 },
    cardMode: 'cur', inp: { col: 0, pitch: 0, roll: 0, yaw: 0 }, greeted: false, msgFor: '',
    ptrT: -10, ptrDown: false, chase: { yaw: 0, pitch: 0.24, dist: 24, side: 0.55 }, top: { h: 900 }, blend: null, landedAt: 0, touch: false,
    // V13.1 casino: where the helicopter stands when parked, the direct-flight trip, the arrival sequence, the door
    at: 'home', trip: null, arrive: null, door: 0, doorTarget: 0, tripSaid: '',
  };
  const LZ = { x: CASINO_LZ.x, z: CASINO_LZ.z, h: CASINO_LZ.h, y: ground(CASINO_LZ.x, CASINO_LZ.z) };
  const casinoPoi = tourPois.find((p) => p.id === 'casino' || p.kind === 'casino') || null;
  const spot = () => (st.at === 'casino' ? LZ : PAD); // where the helicopter is parked
  const flight = createFlight({ ground, obstacle, radius: 8800 });
  function poseToHeli() {
    const P = st.pose;
    heli.position.set(P.x, P.y, P.z);
    heli.rotation.set(-P.tilt, -P.h, -P.roll, 'YXZ');
    heli.updateMatrixWorld(true);
  }
  function placeOnPad() {
    const B = spot();
    st.pose = { x: B.x, y: B.y, z: B.z, h: B.h, tilt: 0, roll: 0, speed: 0, vy: 0, agl: 0, phase: 'parked', leg: -1 };
    poseToHeli();
  }
  placeOnPad();
  function newTour(from) {
    st.order = orderPois(tourPois, { x: PAD.x, z: PAD.z });
    st.path = buildTour(st.order, { ground, obstacle, home: { x: PAD.x, z: PAD.z, h: PAD.h }, start: from || null });
    st.pathKind = 'tour'; st.legBase = 0; st.t = 0; st.visited = -1;
  }
  newTour();
  /* ---------------- audio, radio */
  const audio = createHeliAudio(() => { try { return wctx.audio && wctx.audio.ctx; } catch (_) { return null; } });
  const radio = () => { try { return wctx.radio || (typeof window !== 'undefined' && window.__tour && window.__tour.radio) || getRadio(); } catch (_) { return null; } };
  /* ---------------- UI */
  const uiActions = {
    in: () => setView(st.view === 'in' ? 'in' : 'in', true), out: () => setView('out'), top: () => setView(st.view === 'top' ? 'out' : 'top'),
    // ⟵ exit (top band): the core's "back home" button when it exists (it also resumes audio), else the worlds API
    exit: () => { try { const hb = typeof document !== 'undefined' && document.getElementById('btnHome'); if (hb) hb.click(); else if (typeof wctx.goHome === 'function') wctx.goHome(); else if (typeof wctx.enterWorld === 'function') wctx.enterWorld('home'); } catch (e) { console.warn('[heli] exit', e); } },
    go: () => takeOff(), casino: () => flyCasino(), prev: () => skip(-1), next: () => skip(1), pause: () => { st.paused = !st.paused; refreshUI(); },
    speed: () => { st.speedMul = st.speedMul >= 4 ? 1 : st.speedMul * 2; refreshUI(); },
    manual: () => (st.mode === 'manual' ? autopilot() : manual()), flyhome: () => flyHome(),
    radio: () => { try { if (heliRadio && heliRadio.toggle) heliRadio.toggle(); else { const r = radio(); r && r.toggle && r.toggle(); } } catch (_) {} setTimeout(refreshUI, 60); },
  };
  const ui = createHeliUI({ S, ICON: KIND_ICON, lang: curLang, actions: uiActions });
  function setView(v, toggleSeat) {
    const prevV = st.view;
    if (v === 'in' && prevV === 'in' && toggleSeat) st.seat = st.seat === 'front' ? 'cabin' : 'front';
    if (v !== prevV || toggleSeat) startBlend();
    st.view = v;
    if (v === 'top' && !st.top.user) st.top.h = (typeof innerWidth !== 'undefined' && innerHeight > innerWidth) ? 1000 : 900;
    // the look-around baselines restart from the walker's current yaw / pitch
    const P = wctx.player && wctx.player.state; if (P) { st.yaw0 = P.yaw; st.pitch0 = P.pitch || 0; }
    st.chase.yaw = 0; st.chase.pitch = 0.24; st.chase.w = null; st._lastDY = null; st._lastDP = null;
    model.setDetail(v === 'top' ? 'exterior' : 'full');
    refreshUI();
  }
  /* ---------------- flight control */
  function takeOff() {
    if (st.mode !== 'parked' && st.mode !== 'landed') return;
    if (st.arrive) return;
    if (st.at === 'casino') { // parked at the casino → straight home
      st.path = buildTour([], { ground, obstacle, home: { x: PAD.x, z: PAD.z, h: PAD.h }, origin: { x: LZ.x, z: LZ.z, h: LZ.h } });
      st.pathKind = 'home'; st.legBase = st.order.length; st.t = 0; st.visited = st.order.length - 1; st.trip = null;
      st.mode = 'tour'; st.paused = false; st.pending = 0; st.rpmTarget = 1; st.doorTarget = 0;
      ui.message(S('casinoBack'), 1800); refreshUI();
      return;
    }
    newTour(); st.mode = 'tour'; st.paused = false; st.pending = 0; st.rpmTarget = 1; st.trip = null;
    ui.message(S('takingOff'), 1600); refreshUI();
  }
  /* ---------------- V13.1 direct flight to the casino + landing at its entrance */
  function flyCasino(resume) {
    if (st.arrive) return;                                   // already landing / door opening
    if ((st.mode === 'parked' || st.mode === 'landed') && st.at === 'casino') { arriveCasino(true); return; }
    if (st.trip === 'casino' && st.mode === 'tour' && !resume) { ui.message(S('casinoGo'), 1400); return; }
    const parked = st.mode === 'parked' || st.mode === 'landed';
    const B = spot();
    st.path = buildTour([], parked
      ? { ground, obstacle, home: { x: LZ.x, z: LZ.z, h: LZ.h }, origin: { x: B.x, z: B.z, h: B.h }, gate: { dir: LZ.h, dist: CASINO_LZ.gate.dist, r: CASINO_LZ.gate.r } }
      : { ground, obstacle, home: { x: LZ.x, z: LZ.z, h: LZ.h }, start: stateNow(), gate: { dir: LZ.h, dist: CASINO_LZ.gate.dist, r: CASINO_LZ.gate.r } });
    st.pathKind = 'casino'; st.trip = 'casino'; st.legBase = 0; st.t = 0; st.tripSaid = '';
    st.mode = 'tour'; st.paused = false; st.pending = 0; st.rpmTarget = 1; st.doorTarget = 0;
    ui.message(S('casinoGo'), 1800);
    if (!resume) { sayPilot(S('casinoPilot'), 3); try { audio.sayKey && audio.sayKey('say_casino'); } catch (_) {} }
    refreshUI();
  }
  // touch-down at the casino (or the visitor taps 🎰 while parked there): spool down, door, fade into the casino
  function arriveCasino(quick) {
    st.mode = 'landed'; st.at = 'casino'; st.trip = null; st.landedAt = st.time; st.pending = 0;
    const P = st.pose; P.phase = 'landed'; P.leg = -1; P.speed = 0; P.vy = 0;
    st.arrive = { t0: st.time - (quick ? 1.4 : 0), door: false, go: false };
    st.rpmTarget = 0;
    if (!quick) { ui.message(S('casinoLanded'), 2200); sayPilot(S('casinoWelcome'), 4.6); try { audio.sayKey && audio.sayKey('say_casinoLanded'); } catch (_) {} }
    if (st.view === 'in') setView('out'); // the door and the entrance are seen from outside
    refreshUI();
  }
  async function enterCasino() {
    if (!st.arrive || st.arrive.go) return;
    st.arrive.go = true;
    let ok = false;
    try {
      const W = wctx.worlds;
      const fn = typeof wctx.enterWorld === 'function' ? (id, o) => wctx.enterWorld(id, o) : W && (W.enterWorld || W.enter) ? (id, o) => (W.enterWorld || W.enter).call(W, id, o) : null;
      if (fn) ok = (await fn('casino', { spawn: 'entrance', from: 'heli' })) !== false;
    } catch (e) { console.warn('[heli] casino', e); ok = false; }
    if (!ok && !disposed && st.active) { st.arrive = null; st.doorTarget = 0; ui.message(S('casinoFail'), 2600); refreshUI(); }
  }
  function curLegIndex() {
    // the next POI not yet orbited (in st.order)
    return clamp(st.visited + 1, 0, st.order.length);
  }
  function skip(dir) {
    if (st.mode !== 'tour' || !st.path || !st.path.legs.length) return;
    const legs = st.path.legs;
    let k = -1; for (let i = 0; i < legs.length; i++) if (st.t >= legs[i].tApproach - 0.01) k = i;
    let nk = dir > 0 ? k + 1 : (st.t - (legs[Math.max(0, k)].t0 || 0) > 4 ? k : k - 1);
    if (dir > 0 && nk >= legs.length) { st.t = Math.max(st.t, legs[legs.length - 1].t1); return; }
    nk = clamp(nk, 0, legs.length - 1);
    st.t = Math.max(0, legs[nk].t0 - 6); startBlend(0.5);
  }
  function stateNow() { const P = st.pose; return { x: P.x, y: P.y, z: P.z, h: P.h, speed: P.speed }; }
  function manual() {
    if (st.arrive) return;
    if (st.mode === 'parked' || st.mode === 'landed') { const B = spot(); flight.place(B.x, B.y, B.z, B.h, { landed: true }); st.rpmTarget = 1; st.doorTarget = 0; }
    else { const P = st.pose; flight.place(P.x, P.y, P.z, P.h, { speed: P.speed, vy: P.vy || 0, tilt: P.tilt, roll: P.roll, landed: false }); }
    st.mode = 'manual'; st.paused = false; st.rpmTarget = 1;
    ui.message(S('manualOn'), 1800); refreshUI();
  }
  function autopilot() {
    if (st.trip === 'casino') { flyCasino(true); return; }
    const rest = st.order.slice(curLegIndex());
    st.path = buildTour(rest, { ground, obstacle, home: { x: PAD.x, z: PAD.z, h: PAD.h }, start: stateNow() });
    st.pathKind = rest.length ? 'resume' : 'home'; st.legBase = st.order.length - rest.length; st.t = 0;
    st.mode = 'tour'; st.paused = false;
    ui.message(rest.length ? S('autoOn') : S('autoHome'), 1800); refreshUI();
  }
  function flyHome() {
    if (st.arrive) return;
    if (st.mode === 'parked' || st.mode === 'landed') { if (st.at === 'casino') takeOff(); return; }
    st.trip = null;
    st.path = buildTour([], { ground, obstacle, home: { x: PAD.x, z: PAD.z, h: PAD.h }, start: stateNow() });
    st.pathKind = 'home'; st.legBase = st.order.length; st.t = 0; st.visited = st.order.length - 1;
    st.mode = 'tour'; st.paused = false;
    ui.message(S('autoHome'), 1800); refreshUI();
  }
  /* ---------------- keyboard (manual flight) */
  const keys = new Set();
  const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyF']);
  const onKey = (e) => {
    if (!st.active) return;
    if (e.target && /input|textarea|select/i.test(e.target.tagName || '')) return;
    if (!KEYS.has(e.code)) return;
    e.stopImmediatePropagation();
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.type === 'keydown') { keys.add(e.code); if (st.mode !== 'manual' && /Key[WASDQE]|Space|Shift|Arrow/.test(e.code) && e.code !== 'KeyF' && st.mode !== 'parked') manual(); }
    else keys.delete(e.code);
  };
  const canvasEl = wctx.renderer && wctx.renderer.domElement;
  const onPtr = (e) => {
    if (!st.active) return;
    if (e.type === 'pointerdown') { st.ptrDown = !!(canvasEl && e.target === canvasEl); return; }
    if (e.type === 'pointerup' || e.type === 'pointercancel') { st.ptrDown = false; return; }
    if (st.ptrDown) { st.ptrT = st.time; st.lastDrag = st.time; }
  };
  const onWheel = (e) => { if (!st.active) return; if (e.target && e.target.closest && e.target.closest('.heli-ui')) return; if (st.view === 'top') { st.top.user = true; st.top.h = clamp(st.top.h * (e.deltaY > 0 ? 1.15 : 0.87), 150, 5000); } else if (st.view === 'out') { st.chase.dist = clamp(st.chase.dist * (e.deltaY > 0 ? 1.12 : 0.9), 12, 220); } };
  function readInput() {
    const k = (c) => (keys.has(c) ? 1 : 0);
    const L = ui.stick.l, R = ui.stick.r;
    st.inp.col = clamp(k('Space') - k('ShiftLeft') - k('ShiftRight') - L.y, -1, 1);
    st.inp.yaw = clamp(k('KeyE') - k('KeyQ') + k('ArrowRight') - k('ArrowLeft') + L.x, -1, 1);
    st.inp.pitch = clamp(k('KeyW') - k('KeyS') + k('ArrowUp') - k('ArrowDown') - R.y, -1, 1);
    st.inp.roll = clamp(k('KeyD') - k('KeyA') + R.x, -1, 1);
    return st.inp;
  }
  /* ---------------- camera */
  const cam = wctx.camera;
  const saved = { near: cam.near, far: cam.far, fov: cam.fov, up: cam.up.clone() };
  const hq = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), e3 = new THREE.Euler(), vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), m4 = new THREE.Matrix4();
  const goal = { p: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 70, near: 0.05 };
  const chaseOff = new THREE.Vector3(0, 7, 22), chaseLook = new THREE.Vector3();
  function startBlend(dur = 0.9) { st.blend = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov, t: 0, dur, last: performance.now() }; }
  function eyeLocal() { return st.seat === 'cabin' ? new THREE.Vector3(model.seats.passenger.x, model.seats.passenger.y + 0.02, model.seats.passenger.z + 0.02) : new THREE.Vector3(-0.42, 1.80, -2.34); }
  function computeGoal(dt) {
    const P = st.pose;
    const portrait = typeof innerWidth !== 'undefined' && innerHeight > innerWidth;
    const pl = wctx.player && wctx.player.state;
    // look-around from the walker's drag (yaw / pitch deltas since the view started). Only a real pointer drag on the
    // canvas counts: any other change of the walker's yaw / pitch (core's nav settle after the spawn teleport, damping)
    // is absorbed into the baseline so it cannot turn the camera or cancel the auto framing.
    if (pl && st.time - st.ptrT > 0.3 && st._lastDY != null) { st.yaw0 = wrapPi(pl.yaw - st._lastDY); st.pitch0 = (pl.pitch || 0) - st._lastDP; }
    const dYaw = pl ? wrapPi(pl.yaw - st.yaw0) : 0, dPitch = pl ? (pl.pitch || 0) - st.pitch0 : 0;
    if (st.view === 'in') {
      // heli attitude with the roll damped a little (comfort), eye at the seat
      e3.set(-P.tilt * 0.85, -P.h, -P.roll * 0.6, 'YXZ'); hq.setFromEuler(e3);
      const eye = eyeLocal();
      goal.p.copy(eye).applyQuaternion(qa.setFromEuler(e3.set(-P.tilt, -P.h, -P.roll, 'YXZ'))).add(heli.position);
      // auto-look toward the place on an orbit (unless the visitor looked around in the last 4 s)
      let ly = dYaw, lp = dPitch;
      const poi = currentPoi();
      if (poi && st.pose.phase === 'orbit' && st.time - st.lastDrag > 4 && pl) {
        vA.set(poi.x, ground(poi.x, poi.z) + 10, poi.z).sub(goal.p).applyQuaternion(qb.copy(hq).invert());
        const want = clamp(Math.atan2(-vA.x, -vA.z), -0.85, 0.85), wantP = clamp(Math.atan2(vA.y, Math.hypot(vA.x, vA.z)), -0.9, 0.15);
        const k = 1 - Math.exp(-dt * 0.9);
        pl.yaw = st.yaw0 + wrapPi(dYaw + wrapPi(want - dYaw) * k); pl.pitch = st.pitch0 + (dPitch + (wantP - dPitch) * k);
        ly = wrapPi(pl.yaw - st.yaw0); lp = pl.pitch - st.pitch0;
      }
      lp = clamp(lp, -1.2, 1.0);
      if (pl) { pl.pitch = st.pitch0 + lp; }
      qa.setFromEuler(e3.set(lp + (portrait && st.seat === 'front' ? -0.12 : 0), ly, 0, 'YXZ'));
      goal.q.copy(hq).multiply(qa);
      goal.fov = portrait ? 80 : 72; goal.near = 0.04;
    } else if (st.view === 'out') {
      // chase: behind / above the helicopter, orbit with drag, smoothed in the helicopter's frame
      // default: three-quarter behind; on an orbit (no recent drag) swing outside the circle so the place is framed
      // beyond the helicopter
      const defYaw = -P.h + st.chase.side;
      const cpoi = currentPoi();
      const orb = !!(cpoi && P.phase === 'orbit' && st.time - st.lastDrag > 4);
      const orbYaw = cpoi ? Math.atan2(P.x - cpoi.x, P.z - cpoi.z) + (portrait ? 0.04 : 0.2) : defYaw;
      if (st.chase.w == null || st.blend) st.chase.w = orb ? 1 : 0;
      else st.chase.w += ((orb ? 1 : 0) - st.chase.w) * (1 - Math.exp(-dt * 0.8));
      st.chase.cur = wrapPi(defYaw + wrapPi(orbYaw - defYaw) * st.chase.w);
      st.chase.el = 0.24 + 0.06 * st.chase.w;
      const yaw = st.chase.cur + dYaw, el = clamp(st.chase.el + dPitch * -0.8, 0.02, 1.35);
      const d = st.chase.dist * (portrait ? 1.15 : 1);
      vA.set(Math.sin(yaw) * Math.cos(el) * d * 1, Math.sin(el) * d + 2.5, Math.cos(yaw) * Math.cos(el) * d);
      const k = 1 - Math.exp(-dt * 3.5);
      chaseOff.lerp(vA, st.blend ? 1 : k);
      goal.p.copy(heli.position).add(chaseOff);
      const gy = ground(goal.p.x, goal.p.z) + 2.5; if (goal.p.y < gy) goal.p.y = gy;
      chaseLook.set(heli.position.x, heli.position.y + 1.6, heli.position.z);
      m4.lookAt(goal.p, chaseLook, vB.set(0, 1, 0)); goal.q.setFromRotationMatrix(m4);
      goal.fov = portrait ? 64 : 55; goal.near = 0.3;
    } else {
      // top-down map view, north up
      goal.p.set(heli.position.x, heli.position.y + st.top.h, heli.position.z + 0.001);
      m4.lookAt(goal.p, heli.position, vB.set(0, 0, -1)); goal.q.setFromRotationMatrix(m4);
      goal.fov = portrait ? 66 : 48; goal.near = 1.0;
    }
    st._lastDY = pl ? wrapPi(pl.yaw - st.yaw0) : 0; st._lastDP = pl ? (pl.pitch || 0) - st.pitch0 : 0;
  }
  function applyCamera(dt) {
    computeGoal(dt);
    let p = goal.p, q = goal.q, fov = goal.fov;
    if (st.blend) {
      { const now = performance.now(); st.blend.t += Math.max(dt, Math.min(0.25, (now - st.blend.last) / 1000)); st.blend.last = now; } const k = ease(clamp(st.blend.t / st.blend.dur, 0, 1));
      p = vC.copy(st.blend.p).lerp(goal.p, k); q = qb.copy(st.blend.q).slerp(goal.q, k); fov = st.blend.fov + (goal.fov - st.blend.fov) * k;
      if (k >= 1) st.blend = null;
    }
    cam.position.copy(p); cam.quaternion.copy(q);
    cam.up.set(0, 1, 0);
    let dirty = false;
    if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; dirty = true; }
    const near = st.blend ? Math.min(goal.near, 0.05) : goal.near;
    if (cam.near !== near) { cam.near = near; dirty = true; }
    if (cam.far !== 60000) { cam.far = 60000; dirty = true; }
    if (dirty) cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  }
  /* ---------------- tour helpers */
  function currentPoi() {
    const P = st.pose; if (st.mode !== 'tour' || P.leg < 0) return null;
    const legs = st.path && st.path.legs; if (!legs || !legs[P.leg]) return null;
    return legs[P.leg].poi;
  }
  function nearestPoi() { // for manual flight: the closest tour place within 900 m
    let best = null, bd = 900; for (const p of tourPois) { const d = Math.hypot(p.x - st.pose.x, p.z - st.pose.z); if (d < bd) { bd = d; best = p; } } return best;
  }
  /* ---------------- labels */
  const labelPool = [];
  const allLabels = (data.labels || []).map((l) => ({ ...l, key: 'l:' + l.name }));
  const tourSet = new Set(tourPois.map((p) => p.name.toLowerCase()));
  const vP = new THREE.Vector3();
  // label anchor heights: above the highest roof nearby (downtown towers), cached per label (static data)
  const labH = new Map();
  function labelH(key, x, z, lift) {
    const k = key.replace(/:on$/, ''); let y = labH.get(k);
    if (y == null) { y = ground(x, z) + lift; try { if (typeof area.labelY === 'function') { const v = area.labelY(x, z, lift > 20 ? 80 : 40); if (isFinite(v)) y = v; } } catch (_) {} labH.set(k, y); }
    return y;
  }
  function projectLabels() {
    const W = (wctx.renderer && wctx.renderer.domElement && wctx.renderer.domElement.clientWidth) || innerWidth;
    const H = (wctx.renderer && wctx.renderer.domElement && wctx.renderer.domElement.clientHeight) || innerHeight;
    const out = []; const he = curLang() === 'he';
    const cur = currentPoi() || (st.trip === 'casino' || st.arrive ? casinoPoi : null) || (st.mode === 'manual' ? nearestPoi() : null);
    const camP = cam.position;
    const consider = (x, z, lift, L, prio) => {
      vP.set(x, (lift === 0 ? ground(x, z) : labelH(L.key, x, z, lift)), z); const dist = vP.distanceTo(camP);
      vP.project(cam); if (vP.z > 1 || vP.x < -1.05 || vP.x > 1.05 || vP.y < -1.05 || vP.y > 1.1) return;
      out.push(Object.assign(L, { x: (vP.x * 0.5 + 0.5) * W, y: (-vP.y * 0.5 + 0.5) * H, prio: prio - dist * 0.0004 }));
    };
    for (const p of tourPois) {
      const on = cur && cur.id === p.id;
      if (st.view === 'in' && !on && Math.hypot(p.x - st.pose.x, p.z - st.pose.z) > 3500) continue;
      consider(p.x, p.z, st.view === 'top' ? 0 : 25, { key: 't:' + p.id + (on ? ':on' : ''), text: poiName(p, curLang()) || (he ? p.he || p.name : p.name), sub: S('kind_' + p.kind), icon: KIND_ICON[p.kind] || '📍', cls: on ? 'cur' : 'tour' }, on ? 10 : 5);
    }
    if (st.view !== 'in') {
      const maxD = st.view === 'top' ? st.top.h * 2.2 : 2600;
      for (const l of allLabels) {
        if (tourSet.has(l.name.toLowerCase())) continue;
        if (Math.hypot(l.x - st.pose.x, l.z - st.pose.z) > maxD) continue;
        consider(l.x, l.z, st.view === 'top' ? 0 : 12, { key: l.key, text: l.name, sub: '', icon: KIND_ICON[l.kind] || '📍', cls: '' }, 1 + Math.min(1, (l.r || 0) / 400));
      }
      // home
      consider(PAD.x, PAD.z - 30, st.view === 'top' ? 0 : 14, { key: 'home', text: '3351 Eakin Rd', sub: S('kind_home'), icon: '🏠', cls: 'tour' }, 6);
    }
    // top-down: mark the helicopter itself (a few pixels at map height)
    if (st.view === 'top') { vP.set(st.pose.x, st.pose.y, st.pose.z).project(cam); if (vP.z < 1) out.push({ key: 'me', text: S('world'), sub: '', icon: '🚁', cls: 'cur', x: (vP.x * 0.5 + 0.5) * W, y: (-vP.y * 0.5 + 0.5) * H, prio: 100 }); }
    out.sort((a, b) => b.prio - a.prio);
    // greedy declutter
    const kept = []; const narrow = W < 520;
    for (const L of out) { if (kept.length >= (st.view === 'top' ? 45 : 22)) break; L.w = Math.min(narrow ? 170 : 240, 34 + 6.6 * String(L.text || '').length); if (kept.some((k) => Math.abs(k.x - L.x) < (k.w + L.w) / 2 + 4 && Math.abs(k.y - L.y) < (narrow ? 21 : 24))) continue; kept.push(L); }
    ui.labels(kept);
  }
  /* ---------------- UI refresh */
  function refreshUI() {
    const P = st.pose;
    const poi = currentPoi() || (st.mode === 'manual' ? nearestPoi() : null);
    const legs = (st.path && st.path.legs) || [];
    const totalStops = st.order.length;
    const stopIdx = P.leg >= 0 ? st.legBase + P.leg + 1 : Math.max(0, st.visited + 1);
    const tourT = (st.pathKind === 'tour' || st.pathKind === 'casino') && st.path ? st.t / st.path.duration : null;
    // V13.1 casino trip card: "flying to the casino…" + distance · ETA (wall-clock, the ×speed applies above 60 m)
    let trip = null, tripInfo = '';
    if ((st.trip === 'casino' && st.mode === 'tour') || st.arrive) {
      const d = Math.hypot(LZ.x - P.x, LZ.z - P.z);
      const rem = st.path && st.mode === 'tour' ? Math.max(0, st.path.duration - st.t) : 0;
      const low = st.path ? Math.min(rem, (st.path.times ? st.path.times.turn1 + st.path.times.down : 10) + 35) : 0;
      const eta = Math.round(st.paused ? rem : low + (rem - low) / Math.max(1, st.speedMul));
      const dist = d < 950 ? Math.round(d / 10) * 10 + ' ' + S('m') : (d / 1000).toFixed(1) + ' ' + S('km');
      tripInfo = st.arrive ? '' : S('casinoInfo', dist, Math.floor(eta / 60) + ':' + String(eta % 60).padStart(2, '0'));
      trip = { icon: '🎰', name: st.arrive ? S('casinoLanded') : P.phase === 'landing' ? S('casinoLanding') : S('casinoFlying'), kind: S('casinoName') + ' · ' + S('casinoSub'), cap: st.arrive && st.arrive.door ? S('casinoDoor') : S('casinoCap') };
    }
    const parkedAtCasino = (st.mode === 'parked' || st.mode === 'landed') && st.at === 'casino' && !st.arrive;
    ui.update({
      view: st.view, seat: st.seat, manual: st.mode === 'manual', parked: st.mode === 'parked' || st.mode === 'landed', paused: st.paused, speedMul: st.speedMul,
      radioOn: (() => { try { if (heliRadio) return !!heliRadio.on; } catch (_) {} const r = radio(); return !!(r && r.on); })(), touch: st.touch,
      poi, phase: P.phase, cardMode: P.phase === 'approach' ? 'next' : 'cur',
      trip, casinoOn: st.trip === 'casino' && st.mode === 'tour', casinoDim: !!st.arrive, atCasino: st.at === 'casino',
      next: trip && !st.arrive ? { x: LZ.x, z: LZ.z, name: S('casinoName'), label: S('nextPoi'), id: casinoPoi ? casinoPoi.id : 'casino' } : null,
      statusText: trip ? trip.cap : parkedAtCasino ? S('casinoParked') : st.mode === 'parked' ? S('welcome') : st.mode === 'landed' ? S('tourDone') : st.mode === 'manual' ? S('manualOn') : P.phase === 'takeoff' ? S('takingOff') : P.phase === 'landing' || P.phase === 'return' ? S('landing') : '',
      stopText: trip ? tripInfo : totalStops && st.mode !== 'parked' && st.mode !== 'landed' && st.pathKind !== 'home' ? S('stop', Math.min(totalStops, stopIdx), totalStops) : '',
      progress: st.arrive ? 1 : tourT != null ? tourT : st.mode === 'landed' ? 1 : (st.visited + 1) / Math.max(1, totalStops),
      ticks: st.pathKind === 'tour' && st.path ? legs.map((l) => l.t0 / st.path.duration) : [],
      x: P.x, z: P.z, h: P.h, agl: P.agl, pois: st.order, route: st.path && st.path.points, home: { x: PAD.x, z: PAD.z, h: PAD.h }, map: area.map,
      kmh: P.speed * 3.6, altFt: (P.y + (data.elev ? data.elev.base : 252.6)) * 3.2808, hdg: ((P.h * 180 / Math.PI) + 360) % 360,
    });
  }
  /* ---------------- per frame */
  let dispT = 0, uiT = 0, labT = 0, audT = 0, bubT = 0;
  const camP = new THREE.Vector3(), lastHeli = new THREE.Vector3(), bubV = new THREE.Vector3();
  let bubble = null;
  function sayPilot(text, sec = 3.2) { bubble = { text, until: st.time + sec }; }
  function tick(dt) {
    dt = Math.min(0.1, Math.max(0, dt || 0)); st.time += dt;
    // keep this world's environment (the house's time-of-day cycle must not repaint the fog / env here)
    const sc = wctx.scene;
    if (sc) { if (sc.fog !== fog) sc.fog = fog; if (envTex && sc.environment !== envTex) sc.environment = envTex; }
    // pending auto take-off after the welcome
    if (st.mode === 'parked' && st.pending > 0) { st.pending -= dt; st.rpmTarget = 1; if (st.pending <= 0) takeOff(); }
    // advance the flight
    lastHeli.copy(heli.position);
    const P = st.pose;
    if (st.mode === 'tour' && st.path) {
      const mul = st.pose.agl < 60 || st.pose.phase === 'takeoff' || st.pose.phase === 'landing' ? 1 : st.speedMul;
      if (!st.paused) st.t = Math.min(st.path.duration, st.t + dt * mul);
      const s = st.path.sample(st.t, {});
      Object.assign(P, { x: s.x, y: s.y, z: s.z, h: s.h, tilt: s.tilt, roll: s.roll, speed: st.paused ? 0 : s.speed, vy: s.vy, agl: s.agl, phase: s.phase, leg: s.leg });
      if (s.phase === 'orbit' && s.leg >= 0) st.visited = Math.max(st.visited, st.legBase + s.leg);
      if (st.paused) { P.tilt *= 0.5; P.roll *= 0.5; }
      if (st.pathKind === 'casino' && P.phase === 'landing' && st.tripSaid !== 'landing') { st.tripSaid = 'landing'; ui.message(S('casinoLanding'), 1800); try { audio.sayKey && audio.sayKey('say_casinoLanding'); } catch (_) {} }
      if (st.t >= st.path.duration - 1e-3 && st.pathKind === 'casino') arriveCasino(false);
      else if (st.t >= st.path.duration - 1e-3) { st.mode = 'landed'; st.at = 'home'; st.landedAt = st.time; P.phase = 'landed'; P.leg = -1; P.speed = 0; ui.message(st.pathKind === 'tour' ? S('tourDone') : S('landed'), 3200); sayPilot(S('landed')); refreshUI(); }
      if (st.mode === 'tour') st.rpmTarget = 1;
    } else if (st.mode === 'manual') {
      const f = flight.step(dt, readInput(), { autoHover: true });
      Object.assign(P, { x: f.x, y: f.y, z: f.z, h: f.h, tilt: f.tilt, roll: f.roll, speed: f.speed, vy: f.vy, agl: f.agl, phase: f.landed ? 'landed' : 'manual', leg: -1 });
      if (f.bumps > (st._bumps || 0)) { st._bumps = f.bumps; if (st.time - st.lastBump > 3) { st.lastBump = st.time; ui.message(S('bump'), 1400); } }
      if (f.edge && st.time - st.lastEdge > 5) { st.lastEdge = st.time; ui.message(S('edge'), 1600); }
      st.rpmTarget = 1;
    } else if (st.mode === 'landed') {
      st.rpmTarget = st.arrive ? 0 : st.time - st.landedAt > 4 ? 0.45 : 1;
    }
    // V13.1 casino arrival: rotor spool-down → cabin door slides open → fade into the casino at its entrance
    if (st.arrive) {
      const e = st.time - st.arrive.t0;
      if (e > 1.6 && !st.arrive.door) { st.arrive.door = true; st.doorTarget = 1; try { audio.door && audio.door(true); } catch (_) {} ui.message(S('casinoDoor'), 2400); refreshUI(); }
      if (e > 4.4 && !st.arrive.go) enterCasino();
    }
    // the door (≈ 1.4 s to slide fully open / closed)
    if (st.door !== st.doorTarget) { const k = dt / 1.4; st.door = st.doorTarget > st.door ? Math.min(st.doorTarget, st.door + k) : Math.max(st.doorTarget, st.door - k); door.set(st.door); }
    poseToHeli();
    try { area.stream && area.stream.update(P.x, P.z); } catch (_) {}
    // rotor / lights / controls / pilot
    st.rpm += (st.rpmTarget - st.rpm) * (1 - Math.exp(-dt * (st.rpmTarget > st.rpm ? 0.45 : st.arrive ? 0.7 : 0.3)));
    model.setRotor(st.rpm, dt); model.setLights(st.time);
    const ci = st.mode === 'manual' ? st.inp : { pitch: clamp(P.tilt / 0.35, -1, 1) * 0.8, roll: clamp(P.roll / 0.45, -1, 1) * 0.8, col: clamp((P.vy || 0) / 8, -1, 1), yaw: 0 };
    model.setControls(ci);
    const poi = currentPoi();
    let lookYaw;
    if (poi && P.phase === 'orbit') { vA.set(poi.x - P.x, 0, poi.z - P.z); const rel = wrapPi(headingOf(vA.x, vA.z) - P.h); lookYaw = rel; }
    pilot.update(dt, { lookYaw, talk: bubble && st.time < bubble.until });
    // camera
    applyCamera(dt);
    // shadow map follows the helicopter every frame (only the helicopter / house cast)
    sun.position.set(heli.position.x + sunDir.x * 90, heli.position.y + sunDir.y * 90, heli.position.z + sunDir.z * 90); sun.target.position.copy(heli.position); sun.target.updateMatrixWorld();
    if (wctx.renderer && wctx.renderer.shadowMap) wctx.renderer.shadowMap.needsUpdate = true;
    sky.position.copy(cam.position);
    try { area.update && area.update(cam); } catch (_) {}
    try { g3d && g3d.update(cam, dt); } catch (_) {}
    // displays (10 Hz, only when they can be seen)
    dispT += dt;
    if (dispT > 0.1 && model.displays && model.displays.canvas && st.view === 'in') {
      dispT = 0;
      try { drawAvionics(model.displays.canvas, { tilt: P.tilt, roll: P.roll, h: P.h, speed: P.speed, alt: P.y + (data.elev ? data.elev.base : 252.6), agl: P.agl, vs: P.vy || 0, rpm: st.rpm, power: st.mode === 'manual' ? flight.state.power : 0.35 + 0.4 * Math.min(1, P.speed / 60) + 0.2 * Math.max(0, (P.vy || 0) / 8), x: P.x, z: P.z, poi, pois: tourPois, t: st.time }, area.map); model.displays.texture.needsUpdate = true; } catch (_) {}
    }
    // audio (10 Hz)
    audT += dt;
    if (audT > 0.1) {
      cam.getWorldPosition(camP);
      const dist = camP.distanceTo(heli.position);
      const vel = vA.subVectors(heli.position, lastHeli).multiplyScalar(1 / Math.max(1e-3, dt));
      const toCam = vB.subVectors(camP, heli.position).normalize();
      try { audio.set({ rpm: st.rpm, power: st.mode === 'manual' ? flight.state.power : 0.5, inside: st.view === 'in', closing: st.view === 'in' ? 0 : vel.dot(toCam), dist: st.view === 'in' ? 2 : dist,
        speed: P.speed, vy: P.vy || 0, yaw: st.mode === 'manual' ? st.inp.yaw : 0, phase: (st.trip === 'casino' || st.arrive) && P.phase !== 'takeoff' ? 'casino' : P.phase, poi: currentPoi(), lang: curLang() }); } catch (_) {}
      audT = 0;
    }
    // labels (20 Hz), UI (5 Hz), pilot bubble
    labT += dt; if (labT > 0.05) { labT = 0; try { projectLabels(); } catch (e) { if (!st._labErr) { st._labErr = 1; console.warn('[heli] labels', e); } } }
    uiT += dt; if (uiT > 0.2) { uiT = 0; refreshUI(); }
    bubT += dt;
    if (bubT > 0.05) {
      bubT = 0;
      if (bubble && st.time < bubble.until && st.view !== 'top') {
        pilot.bubbleAnchor(bubV); bubV.project(cam);
        const W = (wctx.renderer && wctx.renderer.domElement && wctx.renderer.domElement.clientWidth) || innerWidth, H = (wctx.renderer && wctx.renderer.domElement && wctx.renderer.domElement.clientHeight) || innerHeight;
        const vis = bubV.z < 1 && Math.abs(bubV.x) < 1 && Math.abs(bubV.y) < 1;
        ui.bubble(bubble.text, (bubV.x * 0.5 + 0.5) * W, (-bubV.y * 0.5 + 0.5) * H, vis);
      } else ui.bubble('', 0, 0, false);
    }
    // a word from the pilot when a new place comes up
    if (poi && P.phase === 'orbit' && st.msgFor !== poi.id) { st.msgFor = poi.id; sayPilot(poiName(poi, curLang()) + ' — ' + S('cap_' + poi.id), 4.5); }
  }
  /* ---------------- world object */
  let fallbackUnsub = null, lastTick = 0, unLang = null, missedUpdates = 0, disposed = false;
  const world = {
    id: 'heli', group,
    // V13 memory: the city (imagery, buildings, trees, terrain) is ~250 MB GPU + ~250 MB JS — free it all when the
    // visitor goes home (worlds.js unloadWorld → dispose()); the next visit rebuilds it (≈ 15–50 s on a phone)
    unloadOnExit: true,
    dispose() {
      if (st.active) { try { world.onExit(); } catch (_) {} }
      disposed = true;
      try { audio.stop({ now: true }); } catch (_) {}
      try { audio.dispose && audio.dispose(); } catch (_) {}
      try { const R = typeof window !== 'undefined' && window.__heliAudio; if (Array.isArray(R)) { const i = R.indexOf(audio); if (i >= 0) R.splice(i, 1); } } catch (_) {}
      try { ui.unmount(); } catch (_) {}
      // detached UI nodes can outlive the unmount (a running CSS transition keeps them): cut their path to this world
      for (const k of Object.keys(uiActions)) delete uiActions[k];
      try { for (const k of ['l', 'r']) if (ui.stick && ui.stick[k]) { ui.stick[k].x = 0; ui.stick[k].y = 0; } } catch (_) {}
      try { g3d && g3d.dispose(); } catch (_) {} g3d = null;
      try { area.dispose && area.dispose(); } catch (_) {}
      // GPU: everything under the world group + the area's shader uniforms / imagery levels + env + shadow map
      const texs = new Set(), mats = new Set(), geos = new Set();
      const addT = (v) => { if (!v) return; if (v.isTexture) texs.add(v); else if (Array.isArray(v)) v.forEach(addT); };
      const addU = (U) => { if (U) for (const k in U) { const u = U[k]; if (u && typeof u === 'object' && 'value' in u) addT(u.value); } };
      try {
        group.traverse((o) => {
          if (o.geometry) geos.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) mats.add(m);
          if (o.isInstancedMesh && typeof o.dispose === 'function') { try { o.dispose(); } catch (_) {} }
          if (o.isLight && o.shadow && o.shadow.map) { try { o.shadow.dispose(); } catch (_) {} }
        });
        for (const m of mats) { for (const k in m) { const v = m[k]; if (v && v.isTexture) texs.add(v); } addU(m.uniforms); }
        addU(area.uniforms);
        try { for (const k in (area.levels || {})) { const L = area.levels[k]; if (L) { addT(L.tex); addT(L.mask); } } } catch (_) {}
        try { if (area.naip) { addT(area.naip.tex); addT(area.naip.mask); } } catch (_) {}
        try { if (model.displays) addT(model.displays.texture); } catch (_) {}
        geos.forEach((g) => { try { g.dispose(); } catch (_) {} });
        mats.forEach((m) => { try { m.dispose(); } catch (_) {} });
        texs.forEach((t) => { try { t.dispose(); } catch (_) {} });
        if (envRT) envRT.dispose(); else if (envTex) envTex.dispose();
      } catch (e) { console.warn('[heli] dispose', e); }
      if (wctx.scene && wctx.scene.environment === envTex) wctx.scene.environment = null;
      try { group.parent && group.parent.remove(group); group.clear(); } catch (_) {}
      // JS heap: module-level references that would keep the area data / closures alive
      try { for (const k of ['pose', 'path', 'pois', 'ground', 'obstacle']) telemetry[k] = null; } catch (_) {}
      try { resetAvionicsMap(); } catch (_) {}
      labH.clear(); keys.clear(); labelPool.length = 0; data = null; envTex = null; envRT = null; bubble = null; st.path = null; st.order = [];
    },
    env: { sky: false, sun: false, hemi: false, stars: false, fog, background: new THREE.Color(0xc4d1dc), environment: envTex, exposure: 1.0 },
    spawn: { pos: BOOTH.clone(), yaw: 0 },
    onEnter(opts = {}) {
      if (disposed) return;
      st.active = true; group.visible = true;
      st.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
      // V13.1: back from the casino → parked at the casino LZ (door open, closes), then the autopilot flies home
      const fromCasino = !!(opts && opts.from === 'casino');
      st.at = fromCasino ? 'casino' : 'home'; st.trip = null; st.arrive = null; st.tripSaid = '';
      st.door = fromCasino ? 1 : 0; st.doorTarget = st.door; door.set(st.door);
      placeOnPad(); st.mode = 'parked'; st.paused = false; st.speedMul = 2; st.rpm = 0.32; st.rpmTarget = 0.6; st.pending = 6.5; st.visited = -1; st.msgFor = '';
      newTour();
      if (fromCasino) setTimeout(() => { if (st.active && st.mode === 'parked' && st.at === 'casino' && st.doorTarget === 1) { st.doorTarget = 0; try { audio.door && audio.door(false); } catch (_) {} } }, 1500);
      const P = wctx.player && wctx.player.state; if (P) { P.yaw = 0; P.pitch = 0; }
      st.view = 'in'; st.seat = 'front'; st.blend = null; st.yaw0 = 0; st.pitch0 = 0;
      model.setDetail('full');
      ui.mount(); refreshUI();
      window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKey, true);
      window.addEventListener('wheel', onWheel, { passive: true });
      for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) window.addEventListener(t, onPtr, true);
      st._lastDY = null; st._lastDP = null; st.ptrDown = false;
      try { if (typeof I18N.onLangChange === 'function') unLang = I18N.onLangChange(() => refreshUI()); } catch (_) {}
      setTimeout(() => { if (st.active && st.mode === 'parked') sayPilot(st.at === 'casino' ? S('casinoBack') : S('pilotHi'), 3.6); }, 700);
      setTimeout(() => { if (st.active && st.mode === 'parked') ui.message(st.at === 'casino' ? S('casinoParked') : S('welcome'), 2600); }, 400);
      applyCamera(0.016);
      // finer imagery streams in now (after the world opened)
      (g3d ? g3d.enter() : area.loadDetail()).then(() => { try { wctx.renderer && wctx.renderer.shadowMap && (wctx.renderer.shadowMap.needsUpdate = true); } catch (_) {} });
      if (!fallbackUnsub && typeof wctx.onUpdate === 'function') fallbackUnsub = wctx.onUpdate((dt) => { if (st.active && ++missedUpdates > 2) tick(dt); });
    },
    onExit() {
      st.active = false; keys.clear();
      try { g3d && g3d.exit(); } catch (_) {}
      try { audio.stop(); } catch (_) {}
      ui.unmount();
      window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true); window.removeEventListener('wheel', onWheel); for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) window.removeEventListener(t, onPtr, true);
      try { unLang && unLang(); } catch (_) {} unLang = null;
      cam.near = saved.near; cam.far = saved.far; cam.fov = saved.fov; cam.up.copy(saved.up); cam.updateProjectionMatrix();
      if (fallbackUnsub) { try { fallbackUnsub(); } catch (_) {} fallbackUnsub = null; }
    },
    update(dt) { missedUpdates = 0; lastTick = performance.now(); if (st.active) tick(dt); },
    api: {
      get state() { return st; }, get g3d() { return g3d; }, model, pilot, area, flight, ui, audio, S, takeOff, manual, autopilot, flyHome, skip, setView, tick, flyCasino, enterCasino, door, LZ, PAD,
      setTime(t) { if (st.path) { st.t = clamp(t, 0, st.path.duration); } },
      stats() { let calls = 0, tris = 0; group.traverseVisible((o) => { if ((o.isMesh || o.isPoints) && !(o.material && o.material.visible === false)) { calls++; const g = o.geometry; if (g) tris += (g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0) / 3 * (o.isInstancedMesh ? o.count : 1); } }); return { meshes: calls, tris: Math.round(tris) }; },
    },
  };
  prog(1, '');
  return world;
}
export { buildWorld };

export function register(worlds) {
  if (!worlds || typeof worlds.register !== 'function') return false;
  worlds.register('heli', { he: HELI_STRINGS.he.world, build: buildWorld });
  return true;
}

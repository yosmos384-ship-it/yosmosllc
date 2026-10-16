// sow-build.js — V11 "📋 שיפוץ לפי האקסל": the SOW-ONLY objects (built lazily on the first switch to the mode, so the
// normal tour never pays for them). Everything here reuses materials that already exist (house / interior / exterior),
// so no new shader programs are compiled for them:
//   · builder flush-mount LED ceiling lights (lens = the room's downlight fixture material → follows the light switch)
//   · hugger ceiling fans with a light kit in the living room and the 4 bedrooms (tap = fan on / off)
//   · smoke detectors on the ceilings (bedrooms, hall, landing, basement)
//   · white subway backsplash in the kitchen (the house bath-wall tile material, retextured by the 'sow' style)
//   · gravel driveway + chain-link fence pieces (the real lot, as in the walkthrough video)
// Every top-level object gets userData.sowOnly = true (js/sow.js toggles visibility) + userData.floor / room tags.
// No side effects at import.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, tagVariant } from './interior-lib.js';

const PI = Math.PI;

function grp(parent, name, floor, room) {
  const g = new THREE.Group(); g.name = 'sow:' + name; g.userData.floor = floor; if (room) g.userData.room = room;
  tagVariant(g, 'sow'); parent.add(g); return g;
}
// world-metre UVs on a vertical quad: axis 'x' → plane facing +z at z = c (x a0..a1), 'z' → facing +x at x = c
function wallQuad(axis, c, a0, a1, y0, y1) {
  const g = new THREE.PlaneGeometry(a1 - a0, y1 - y0);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, a0 + (p.getX(i) + (a1 - a0) / 2), y0 + (p.getY(i) + (y1 - y0) / 2));
  if (axis === 'x') g.translate((a0 + a1) / 2, (y0 + y1) / 2, c);
  else { g.rotateY(PI / 2); g.translate(c, (y0 + y1) / 2, (a0 + a1) / 2); } // +x facing: local x → -z ... flip below
  if (axis === 'z') { // after rotateY(+90°) local +x points to -z; mirror the UV u so it runs with world z
    for (let i = 0; i < uv.count; i++) uv.setX(i, p.getZ(i));
  }
  return g;
}

export function buildSow(ctx) {
  const plan = ctx.plan, scene = ctx.scene, M = ctx.interiorMaterials || {};
  const out = { groups: [], fans: [], targets: {} };
  const root = new THREE.Group(); root.name = 'sow-only'; root.userData.sowOnly = true; root.visible = true; scene.add(root);
  // root stays visible; its children carry the sowOnly flag (sow.js flips them)
  const yM = plan.mainFloor, yMC = plan.mainCeil, yU = plan.upperFloor, yBC = plan.basementCeil, yB = plan.basementFloor;
  const ceilAt = (fl, z) => (fl === 'main' ? yMC : fl === 'upper' ? yU + plan.upperCeilAt(z) : yBC);

  // ---------------------------------------------------------------- house downlight data (positions + fixture material)
  const house = scene.children.find((c) => c.name === 'house');
  const dl = {};
  if (house) house.traverse((o) => { if (o.isMesh && /^house:downlights:/.test(o.name || '')) dl[o.userData.room] = o; });

  // ---------------------------------------------------------------- flush mounts + fans
  const FAN_ROOMS = { living: 0.66, bed1: 0.62, bed2: 0.6, bed3: 0.55, bed4: 0.55 };
  const pickFix = (k) => {
    const d = dl[k]; if (!d || !d.userData.fixtures) return [];
    const fx = d.userData.fixtures;
    if (FAN_ROOMS[k]) { // one fan at the centroid of the flat-ceiling fixtures
      const flat = fx.filter((f) => !f[3]); const L = flat.length ? flat : fx;
      const x = L.reduce((a, f) => a + f[0], 0) / L.length, z = L.reduce((a, f) => a + f[2], 0) / L.length;
      return [[x, L[0][1], z, 0, 'fan']];
    }
    if (k === 'kitchen') return [[7.35, fx[0][1], 1.1, 0], [7.35, fx[0][1], 2.3, 0]];
    if (k === 'hall') return [fx[0], fx[fx.length - 1]];
    return [fx[0]];
  };
  for (const k of Object.keys(dl)) {
    const d = dl[k], fl = d.userData.floor || 'main', lens = d.material;
    const g = grp(root, 'lights-' + k, fl, k); g.userData.ceiling = true; out.groups.push(g);
    for (const f of pickFix(k)) {
      const [x, cy, z, tilt, kind] = f;
      const s = new THREE.Group(); s.position.set(x, cy, z); if (tilt) s.rotation.x = tilt; g.add(s);
      const b = new Batch(), r = b.root;
      if (kind === 'fan') {
        const R = FAN_ROOMS[k];
        // hugger fan: canopy, motor housing, 5 blades (grey-oak), frosted bowl light kit
        r.cyl('paint', 0.075, 0.075, 0.03, [0, -0.015, 0], 0xe8e8e5, { seg: 28 });
        r.cyl('steel', 0.11, 0.12, 0.11, [0, -0.085, 0], 0xb9b9b5, { seg: 32 });
        r.cyl('steel', 0.125, 0.11, 0.035, [0, -0.155, 0], 0xb9b9b5, { seg: 32 });
        b.build(s, M, { shadow: false, name: 'sow-fan-' + k });
        const rot = new THREE.Group(); rot.position.y = -0.15; s.add(rot);
        const bb = new Batch(), br = bb.root;
        for (let i = 0; i < 5; i++) {
          const a = i * 2 * PI / 5;
          br.box('steel', [0.13, 0.012, 0.03], [Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15], 0xb9b9b5, { ry: -a, r: 0.004 });
          br.box('wood', [R - 0.16, 0.009, 0.135], [Math.cos(a) * (0.17 + (R - 0.16) / 2), -0.006, Math.sin(a) * (0.17 + (R - 0.16) / 2)], 0x8f877c, { ry: -a, rx: 0.12, r: 0.004 }); // oak-look blades (builder hugger fan)
        }
        bb.build(rot, M, { shadow: false, name: 'sow-fanblades-' + k });
        const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 28, 10, 0, 2 * PI, PI / 2, PI / 2), lens);
        bowl.scale.set(1, 0.55, 1); bowl.position.y = -0.17; s.add(bowl);
        const fan = { rot, on: false, speed: 0, room: k, obj: s };
        out.fans.push(fan);
        try {
          const hit = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.2, 16), new THREE.MeshBasicMaterial({ visible: false }));
          hit.position.y = -0.12; s.add(hit);
          const h = ctx.addInteractive && ctx.addInteractive(hit, { label: () => (fan.on ? 'כבה מאוורר תקרה' : 'הפעל מאוורר תקרה'), onUse: () => { fan.on = !fan.on; } });
          if (h) { h.enabled = false; (ctx.variantInteractives = ctx.variantInteractives || []).push({ h, obj: hit, mode: 'sow' }); }
        } catch (_) { }
      } else {
        // 13" builder flush mount: brushed-nickel rim + frosted dome
        r.cyl('steel', 0.17, 0.165, 0.022, [0, -0.011, 0], 0xb9b9b5, { seg: 40 });
        b.build(s, M, { shadow: false, name: 'sow-flush-' + k });
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.155, 32, 8, 0, 2 * PI, PI / 2, PI / 2), lens);
        dome.scale.set(1, 0.36, 1); dome.position.y = -0.02; s.add(dome);
      }
    }
  }

  // ---------------------------------------------------------------- smoke detectors
  {
    const spots = [
      ['bed1', 'main', 1.85, 4.55], ['bed2', 'main', 1.85, 2.6], ['hall', 'main', 4.12, 3.85],
      ['bed3', 'upper', 1.95, plan.ridgeZ], ['bed4', 'upper', 6.35, plan.ridgeZ], ['landing', 'upper', 4.75, 2.95],
      ['basement', 'basement', 4.6, 3.6],
    ];
    const g = grp(root, 'smoke', 'main', null); g.userData.ceiling = true; out.groups.push(g);
    const b = new Batch(), r = b.root;
    out.targets.smoke = [];
    for (const [room, fl, x, z] of spots) {
      const y = fl === 'basement' ? yBC - 0.01 : ceilAt(fl, z);
      r.cyl('plastic', 0.068, 0.072, 0.034, [x, y - 0.017, z], 0xf0efeb, { seg: 32 });
      r.cyl('plastic', 0.045, 0.045, 0.004, [x, y - 0.035, z], 0xe2e1dc, { seg: 24 });
      r.cyl('plastic', 0.005, 0.005, 0.004, [x + 0.03, y - 0.036, z], 0xc0302a, { seg: 8 });
      out.targets.smoke.push({ room, floor: fl, p: [x, y - 0.03, z] });
    }
    b.build(g, M, { shadow: false, name: 'sow-smoke' });
  }

  // ---------------------------------------------------------------- kitchen: white subway backsplash
  {
    let tileMat = null;
    scene.traverse((o) => { if (!tileMat && o.isMesh && o.material && !Array.isArray(o.material) && o.material.userData && o.material.userData.styleKey === 'wallBath') tileMat = o.material; });
    if (tileMat) {
      const F0 = yM, CT = F0 + 0.914, WN = 0.125, WW = 5.546, WE = 9.019, UY = F0 + 1.372, HOOD = F0 + 1.65, zN = WN + 0.006, xW = WW + 0.006;
      const geos = [
        wallQuad('x', zN, WW + 0.006, 6.58, CT, UY), wallQuad('x', zN, 6.58, 8.02, CT, F0 + 1.03), wallQuad('x', zN, 8.02, WE, CT, UY),
        wallQuad('z', xW, WN + 0.006, 0.8, CT, UY), wallQuad('z', xW, 0.8, 1.562, CT, HOOD), wallQuad('z', xW, 1.562, 2.075, CT, UY),
      ];
      const g = grp(root, 'backsplash', 'main', 'kitchen'); out.groups.push(g);
      for (const geo of geos) { const m = new THREE.Mesh(geo, tileMat); m.receiveShadow = true; m.userData.room = 'kitchen'; g.add(m); }
    }
  }

  // ---------------------------------------------------------------- exterior: gravel driveway + chain-link pieces
  try {
    const X = ctx.exteriorMaterials || {};
    const dw = plan.driveway, lot = plan.lot;
    const g = grp(root, 'exterior', 'outside', 'exterior'); out.groups.push(g);
    if (X.gravel && dw) {
      const zEnd = plan.street ? plan.street.zCenter - plan.street.width / 2 : 18.4;
      const geo = new THREE.PlaneGeometry(dw.x1 - dw.x0 + 0.3, Math.max(1, zEnd - dw.z0)); geo.rotateX(-PI / 2);
      const uv = geo.attributes.uv, p = geo.attributes.position;
      geo.translate((dw.x0 + dw.x1) / 2, 0.018, (dw.z0 + zEnd) / 2);
      for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
      // the exterior gravel material is vertex-coloured: dusty light-grey gravel / dirt as in the video
      const gc = new THREE.Color(0xb8ae9f), ca = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { const k = 0.92 + 0.08 * Math.sin(p.getX(i) * 3.1 + p.getZ(i) * 0.7); ca[i * 3] = gc.r * k; ca[i * 3 + 1] = gc.g * k; ca[i * 3 + 2] = gc.b * k; }
      geo.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      const m = new THREE.Mesh(geo, X.gravel); m.receiveShadow = true; m.name = 'sow-gravel-drive'; g.add(m);
    }
    if (X.chain && lot) {
      const lines = [[lot.x0 + 0.4, lot.z0 + 0.3, lot.x0 + 7.9, lot.z0 + 0.3], [lot.x1 - 6.5, lot.z0 + 0.3, lot.x1 - 0.4, lot.z0 + 0.3], [lot.x1 - 0.4, lot.z0 + 0.3, lot.x1 - 0.4, lot.z0 + 6.5]];
      const pg = [], cg = [];
      for (const [ax, az, bx, bz] of lines) {
        const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 2.5));
        const q = new THREE.PlaneGeometry(L, 1.2); q.translate(0, 0.62, 0);
        const uv = q.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L, uv.getY(i) * 1.2);
        q.rotateY(-Math.atan2(bz - az, bx - ax)); q.translate((ax + bx) / 2, 0, (az + bz) / 2); cg.push(q);
        for (let i = 0; i <= n; i++) { const c = new THREE.CylinderGeometry(0.03, 0.03, 1.3, 8); c.translate(ax + (bx - ax) * i / n, 0.6, az + (bz - az) * i / n); pg.push(c); }
        try {
          const r = ctx.addCollider(new THREE.Box3(new THREE.Vector3(Math.min(ax, bx) - 0.06, 0, Math.min(az, bz) - 0.06), new THREE.Vector3(Math.max(ax, bx) + 0.06, 1.3, Math.max(az, bz) + 0.06)));
          if (r && r.isBox3) { (ctx.variantColliders = ctx.variantColliders || []).push({ box: r, orig: r.clone(), mode: 'sow' }); r.makeEmpty(); }
        } catch (_) { }
      }
      const merged = (list) => { try { return mergeGeometries(list.map((q) => (q.index ? q.toNonIndexed() : q)), false); } catch (_) { return null; } };
      const cgm = merged(cg), pgm = merged(pg);
      if (cgm) { const m = new THREE.Mesh(cgm, X.chain); m.name = 'sow-chainlink'; g.add(m); }
      if (pgm) { const m = new THREE.Mesh(pgm, X.galvPlain || X.galv || X.chain); m.castShadow = true; m.name = 'sow-fence-posts'; g.add(m); }
    }
  } catch (e) { console.warn('[sow] exterior', e); }

  // ---------------------------------------------------------------- highlight targets (SOW panel → "show me")
  const B0 = yB;
  Object.assign(out.targets, {
    panel: { room: 'basement', floor: 'basement', p: [8.6, B0 + 1.48, 0.25], look: [8.6, B0 + 1.4, 1.8] },
    furnace: { room: 'basement', floor: 'basement', p: [2.5, B0 + 0.8, 0.6], look: [2.6, B0 + 1.3, 2.4] },
    waterHeater: { room: 'basement', floor: 'basement', p: [1.45, B0 + 0.9, 0.5], look: [1.8, B0 + 1.3, 2.2] },
    ac: { room: 'outside', floor: 'outside', p: [(plan.W || 9.144) + 0.62 + 0.1, 0.5, 2.85], look: [(plan.W || 9.144) + 2.6, 1.6, 4.4] },
  });
  out.root = root;
  return out;
}

export default buildSow;

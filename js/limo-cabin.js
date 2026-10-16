// limo-cabin.js — V10 LIMO: the limousine INTERIOR (highest quality the phone budget allows).
// Cabin frame (world group local): floor y = 0, ceiling y = 1.42, length along x: rear wall x = -3.3 … partition
// x = 2.0 (driver compartment + hood beyond), side walls z = ±0.95. Visitor sits at seated eye height (1.1 m).
// Long quilted ivory-leather side bench on the left (z < 0), rear bench, bar cabinet on the right (z > 0), burl wood
// + piano black + chrome trim, LED starlight ceiling (twinkling), colour-changing cove / floor strips, sunroof,
// partition window, TV with the route map, mirrors, side + rear windows. Static parts are merged per material.
// No side effects on import.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Merger, lathe } from './limo-util.js';
import { leather, burlWood, carpet, suede } from './limo-tex.js';
import { makeGlass } from './limo-people.js';

export const CAB = { x0: -3.3, x1: 2.0, zw: 0.95, h: 1.42, sill: 0.92, winTop: 1.31, eye: 1.1,
  sun: { x0: -1.25, x1: 0.15, z: 0.45 }, part: { z0: -0.55, z1: 0.25, y0: 0.6, y1: 1.24 } };

function uvScale(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return geo; }
const rbox = (THREE, w, h, d, r = 0.035, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);

export function cabinMaterials(THREE, quality = 'high', envMap = null) {
  const hi = quality !== 'low';
  const Phys = hi ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const lq = leather(THREE, { color: 0xeadcc2, quilt: true, cells: 6, size: hi ? 512 : 256 });
  const lp = leather(THREE, { color: 0xe4d4b8, quilt: false, size: 256 });
  for (const t of [lq.map, lq.normalMap, lq.roughnessMap]) t && t.repeat.set(1, 1);
  const env = envMap ? { envMap } : {};
  const leatherQ = new Phys({ map: lq.map, normalMap: lq.normalMap, roughnessMap: lq.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(1, 1), ...env, envMapIntensity: 0.5, ...(hi ? { sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xfff0dc), clearcoat: 0.12, clearcoatRoughness: 0.5 } : {}) });
  const leatherP = new Phys({ map: lp.map, normalMap: lp.normalMap, roughnessMap: lp.roughnessMap, roughness: 1, ...env, envMapIntensity: 0.5, ...(hi ? { clearcoat: 0.1, clearcoatRoughness: 0.5 } : {}) });

  const wood = new Phys({ map: burlWood(THREE, { size: hi ? 512 : 256 }), roughness: 0.3, metalness: 0, ...env, envMapIntensity: 1.0, ...(hi ? { clearcoat: 1, clearcoatRoughness: 0.12 } : {}) });
  const piano = new Phys({ color: 0x050506, roughness: 0.18, metalness: 0.1, ...env, envMapIntensity: 1.3, ...(hi ? { clearcoat: 1, clearcoatRoughness: 0.12 } : {}) });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xf4f5f7, metalness: 1, roughness: 0.17, ...env, envMapIntensity: 1.6 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe8c27a, metalness: 1, roughness: 0.2, ...env, envMapIntensity: 1.4 });
  const carpetM = new THREE.MeshStandardMaterial({ map: carpet(THREE), roughness: 0.96, color: 0xffffff });
  carpetM.map.repeat.set(6, 2);
  const suedeM = new THREE.MeshStandardMaterial({ map: suede(THREE), roughness: 0.92, color: 0xffffff });
  suedeM.map.repeat.set(5, 2);
  const glassTint = new THREE.MeshPhysicalMaterial({ color: 0x9fb0c0, metalness: 0, roughness: 0.14, transparent: true, opacity: 0.16, ...env, envMapIntensity: 1.2, depthWrite: false, side: THREE.DoubleSide });
  const mirror = new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 1, roughness: 0.13, ...env, envMapIntensity: 1.8 });
  const led = new THREE.MeshBasicMaterial({ color: 0x9a5cff, toneMapped: false });
  const ledFloor = new THREE.MeshBasicMaterial({ color: 0x9a5cff, toneMapped: false, transparent: true, opacity: 0.9 });
  const warm = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false }); // warm downlights + dash gauges (vertex colours)
  const crystal = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.14, transparent: true, opacity: 0.32, ...env, envMapIntensity: 2.4, depthWrite: false, side: THREE.DoubleSide, flatShading: true, ...(hi ? { clearcoat: 1, clearcoatRoughness: 0.12 } : {}) });
  const whisky = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.16, transparent: true, opacity: 0.85, emissive: 0x2a0e03 }); // whisky + cognac (vertex colours)
  const cognac = whisky;
  const bottle = new THREE.MeshPhysicalMaterial({ color: 0x0c2a18, roughness: 0.16, metalness: 0.1, ...env, envMapIntensity: 1.6, ...(hi ? { clearcoat: 1, clearcoatRoughness: 0.12 } : {}) });
  const foil = new THREE.MeshStandardMaterial({ color: 0xd9b25a, metalness: 1, roughness: 0.3, ...env });
  const ice = new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: 0.15, transparent: true, opacity: 0.55, ...env, depthWrite: false });
  const black = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.6 });
  const dash = warm;
  const piping = black;
  return { leatherQ, leatherP, piping, wood, piano, chrome, gold, carpet: carpetM, suede: suedeM, glassTint, mirror, led, ledFloor, warm, crystal, whisky, cognac, bottle, foil, ice, black, dash };
}

/* --------------------------------------------------------------------------------------- starlight ceiling */
function starfield(THREE, count, hole) {
  const pos = [], ph = [], sz = [];
  let n = 0, guard = 0;
  while (n < count && guard++ < count * 10) {
    const x = CAB.x0 + 0.1 + Math.random() * (CAB.x1 - CAB.x0 - 0.2), z = (Math.random() * 2 - 1) * (CAB.zw - 0.12);
    if (x > hole.x0 - 0.04 && x < hole.x1 + 0.04 && Math.abs(z) < hole.z + 0.04) continue;
    pos.push(x, CAB.h - 0.004, z); ph.push(Math.random() * 6.283); sz.push(0.6 + Math.random() * Math.random() * 2.2); n++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 1));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uTint: { value: new THREE.Color(0xfff6e8) } },
    vertexShader: `attribute float aPhase; attribute float aSize; uniform float uTime; uniform float uPx; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
        float tw = 0.55 + 0.45 * sin(uTime * (0.8 + fract(aPhase*3.1)*2.2) + aPhase);
        vA = tw; gl_PointSize = clamp(aSize * uPx * (2.2 / max(0.3, -mv.z)), 1.0, 9.0); }`,
    fragmentShader: `uniform vec3 uTint; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
        float a = smoothstep(0.5, 0.0, d); a = a*a; gl_FragColor = vec4(uTint * (1.4 * vA), a * vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat); pts.name = 'limo:stars'; pts.frustumCulled = false;
  return pts;
}

export function buildCabin(THREE, o = {}) {
  const quality = o.quality || 'high', hi = quality !== 'low';
  const mats = cabinMaterials(THREE, quality, o.envMap || null);
  const group = new THREE.Group(); group.name = 'limo:cabin';
  const M = new Merger(THREE);
  const { x0, x1, zw, h, sill, winTop } = CAB;
  const L = x1 - x0;
  /* ---------------- floor, walls, ceiling */
  M.add('carpet', uvScale(new THREE.PlaneGeometry(L, zw * 2), 1, 1), { pos: [(x0 + x1) / 2, 0, 0], rot: [-Math.PI / 2, 0, 0] });
  // side walls: lower panels, window band pillars, upper strip
  const pillars = [-2.85, -1.55, -0.2, 1.05, 1.92];
  for (const s of [-1, 1]) {
    const z = s * zw;
    M.add('leatherP', uvScale(new THREE.BoxGeometry(L, sill, 0.04), 6, 1), { pos: [(x0 + x1) / 2, sill / 2, z + s * 0.02] });
    M.add('wood', new THREE.BoxGeometry(L, 0.06, 0.1), { pos: [(x0 + x1) / 2, sill - 0.02, z - s * 0.03] });     // sill
    M.add('chrome', new THREE.BoxGeometry(L, 0.008, 0.012), { pos: [(x0 + x1) / 2, sill + 0.012, z - s * 0.081] });
    M.add('suede', new THREE.BoxGeometry(L, h - winTop, 0.05), { pos: [(x0 + x1) / 2, (h + winTop) / 2, z + s * 0.02] });
    M.add('piano', new THREE.BoxGeometry(L, 0.03, 0.04), { pos: [(x0 + x1) / 2, winTop, z - s * 0.01] });
    for (const px of pillars) M.add('suede', new THREE.BoxGeometry(px > 1.9 ? 0.16 : 0.12, winTop - sill, 0.07), { pos: [px, (sill + winTop) / 2, z + s * 0.005] });
    // window glass (one pane between each pillar pair) — light tint so the city is visible
    for (let i = 0; i < pillars.length - 1; i++) {
      const a = pillars[i] + 0.06, b = pillars[i + 1] - 0.06;
      M.add('glassTint', new THREE.PlaneGeometry(b - a, winTop - sill), { pos: [(a + b) / 2, (sill + winTop) / 2, z + s * 0.03], rot: [0, s > 0 ? Math.PI : 0, 0] });
    }
    M.add('suede', new THREE.BoxGeometry(x0 + 0.04 - pillars[0] < 0 ? pillars[0] - x0 + 0.06 : 0.1, winTop - sill, 0.07), { pos: [(x0 + pillars[0]) / 2, (sill + winTop) / 2, z + s * 0.005] });
    // cove LED strip under the upper strip (colour-changing)
    M.add('led', new THREE.BoxGeometry(L - 0.1, 0.012, 0.012), { pos: [(x0 + x1) / 2, winTop + 0.03, z - s * 0.04] });
  }
  // rear wall with rear window
  {
    const rx = x0;
    M.add('leatherP', new THREE.BoxGeometry(0.04, 0.98, zw * 2), { pos: [rx - 0.02, 0.49, 0] });
    M.add('suede', new THREE.BoxGeometry(0.05, h - 1.3, zw * 2), { pos: [rx - 0.02, (h + 1.3) / 2, 0] });
    for (const s of [-1, 1]) M.add('suede', new THREE.BoxGeometry(0.06, 0.32, zw - 0.7), { pos: [rx - 0.02, 1.14, s * (0.7 + (zw - 0.7) / 2)] });
    M.add('glassTint', new THREE.PlaneGeometry(1.4, 0.32), { pos: [rx - 0.01, 1.14, 0], rot: [0, Math.PI / 2, 0] });
    M.add('wood', new THREE.BoxGeometry(0.1, 0.05, zw * 2 - 0.1), { pos: [rx + 0.04, 0.97, 0] });
  }
  // ceiling with the sunroof opening (headliner) + mirrored centre panels + chrome frame
  {
    const sh = new THREE.Shape();
    sh.moveTo(x0, -zw); sh.lineTo(x1, -zw); sh.lineTo(x1, zw); sh.lineTo(x0, zw); sh.lineTo(x0, -zw);
    const hole = new THREE.Path(); const S = CAB.sun;
    hole.moveTo(S.x0, -S.z); hole.lineTo(S.x0, S.z); hole.lineTo(S.x1, S.z); hole.lineTo(S.x1, -S.z); hole.lineTo(S.x0, -S.z);
    sh.holes.push(hole);
    const cg = new THREE.ShapeGeometry(sh);
    const uv = cg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.2, uv.getY(i) / 1.2);
    M.add('suede', cg, { pos: [0, h, 0], rot: [Math.PI / 2, 0, 0] });
    // sunroof well + chrome frame
    for (const s of [-1, 1]) {
      M.add('chrome', new THREE.BoxGeometry(S.x1 - S.x0 + 0.06, 0.02, 0.03), { pos: [(S.x0 + S.x1) / 2, h - 0.01, s * (S.z + 0.015)] });
      M.add('suede', new THREE.BoxGeometry(S.x1 - S.x0, 0.1, 0.02), { pos: [(S.x0 + S.x1) / 2, h + 0.05, s * S.z] });
    }
    for (const x of [S.x0, S.x1]) {
      M.add('chrome', new THREE.BoxGeometry(0.03, 0.02, S.z * 2 + 0.06), { pos: [x + (x === S.x0 ? -0.015 : 0.015), h - 0.01, 0] });
      M.add('suede', new THREE.BoxGeometry(0.02, 0.1, S.z * 2), { pos: [x, h + 0.05, 0] });
    }
    // mirrored ceiling panels front + rear of the sunroof (classic limo), with a warm LED surround
    for (const [a, b] of [[x0 + 0.5, S.x0 - 0.25], [S.x1 + 0.25, x1 - 0.35]]) {
      M.add('mirror', new THREE.BoxGeometry(b - a, 0.012, 0.5), { pos: [(a + b) / 2, h - 0.012, 0] });
      M.add('piano', new THREE.BoxGeometry(b - a + 0.08, 0.01, 0.58), { pos: [(a + b) / 2, h - 0.006, 0] });
      for (const s of [-1, 1]) M.add('led', new THREE.BoxGeometry(b - a, 0.008, 0.01), { pos: [(a + b) / 2, h - 0.016, s * 0.28] });
      // reading spots
      for (const x of [a + 0.15, b - 0.15]) for (const s of [-1, 1]) {
        M.add('chrome', new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16), { pos: [x, h - 0.012, s * 0.42] });
        M.add('warm', new THREE.CylinderGeometry(0.018, 0.018, 0.013, 12), { pos: [x, h - 0.013, s * 0.42], color: 0xffd9a0 });
      }
    }
  }
  /* ---------------- rear bench */
  const SEAT = 0.44;
  {
    const cx = x0 + 0.34;
    for (const [zc, w] of [[-0.62, 0.6], [0, 0.6], [0.62, 0.6]]) {
      M.add('leatherQ', uvScale(rbox(THREE, 0.6, 0.15, w - 0.015, 0.05), 2, 2), { pos: [cx + 0.02, SEAT - 0.075, zc] });
      M.add('leatherQ', uvScale(rbox(THREE, 0.14, 0.55, w - 0.015, 0.05), 2, 2), { pos: [x0 + 0.1, SEAT + 0.3, zc], rot: [0, 0, -0.2] });
    }
    M.add('piping', new THREE.BoxGeometry(0.6, 0.012, 1.86), { pos: [cx + 0.02, SEAT - 0.155, 0] });
    M.add('wood', new THREE.BoxGeometry(0.62, SEAT - 0.16, 1.88), { pos: [cx + 0.02, (SEAT - 0.16) / 2, 0] });
    M.add('ledFloor', new THREE.BoxGeometry(0.01, 0.01, 1.8), { pos: [cx + 0.335, 0.03, 0] });
    M.add('chrome', new THREE.BoxGeometry(0.012, 0.01, 1.86), { pos: [cx + 0.335, SEAT - 0.17, 0] });
  }
  /* ---------------- long side bench (left, z < 0) */
  {
    const bx0 = x0 + 0.66, bx1 = 0.95, z = -zw + 0.3;
    const n = 4, segL = (bx1 - bx0) / n;
    for (let i = 0; i < n; i++) {
      const cx = bx0 + segL * (i + 0.5);
      M.add('leatherQ', uvScale(rbox(THREE, segL - 0.012, 0.15, 0.52, 0.05), 2, 2), { pos: [cx, SEAT - 0.075, z + 0.02] });
      M.add('leatherQ', uvScale(rbox(THREE, segL - 0.012, 0.52, 0.13, 0.05), 2, 2), { pos: [cx, SEAT + 0.29, -zw + 0.09], rot: [-0.14, 0, 0] });
    }
    M.add('wood', new THREE.BoxGeometry(bx1 - bx0 + 0.02, SEAT - 0.16, 0.54), { pos: [(bx0 + bx1) / 2, (SEAT - 0.16) / 2, z + 0.02] });
    M.add('chrome', new THREE.BoxGeometry(bx1 - bx0, 0.01, 0.012), { pos: [(bx0 + bx1) / 2, SEAT - 0.17, z + 0.29] });
    M.add('ledFloor', new THREE.BoxGeometry(bx1 - bx0, 0.01, 0.01), { pos: [(bx0 + bx1) / 2, 0.03, z + 0.29] });
    // corner table at the junction with the rear bench + end console at the front
    M.add('piano', rbox(THREE, 0.3, 0.6, 0.3, 0.03), { pos: [x0 + 0.5, 0.3, -zw + 0.18] });
    M.add('wood', new THREE.BoxGeometry(0.32, 0.02, 0.32), { pos: [x0 + 0.5, 0.61, -zw + 0.18] });
    M.add('piano', rbox(THREE, 0.9, 0.62, 0.42, 0.03), { pos: [1.5, 0.31, -zw + 0.23] });
    M.add('wood', new THREE.BoxGeometry(0.88, 0.02, 0.4), { pos: [1.5, 0.625, -zw + 0.23] });
    M.add('chrome', new THREE.BoxGeometry(0.9, 0.012, 0.012), { pos: [1.5, 0.62, -zw + 0.44] });
    M.add('ledFloor', new THREE.BoxGeometry(0.88, 0.01, 0.01), { pos: [1.5, 0.03, -zw + 0.445] });
  }
  /* ---------------- bar (right, z > 0) */
  const BAR = { x0: -1.6, x1: 1.45, z0: 0.5, top: 0.72 };
  {
    const bw = BAR.x1 - BAR.x0, cz = (BAR.z0 + zw) / 2, d = zw - BAR.z0;
    M.add('wood', uvScale(new THREE.BoxGeometry(bw, BAR.top - 0.08, d), 3, 1), { pos: [(BAR.x0 + BAR.x1) / 2, (BAR.top - 0.08) / 2 + 0.06, cz] });
    M.add('piano', new THREE.BoxGeometry(bw, 0.06, d), { pos: [(BAR.x0 + BAR.x1) / 2, 0.03, cz + 0.01] }); // toe kick
    M.add('ledFloor', new THREE.BoxGeometry(bw, 0.01, 0.01), { pos: [(BAR.x0 + BAR.x1) / 2, 0.04, BAR.z0 + 0.005] });
    M.add('piano', rbox(THREE, bw + 0.04, 0.04, d + 0.04, 0.012), { pos: [(BAR.x0 + BAR.x1) / 2, BAR.top - 0.02, cz - 0.01] }); // counter
    M.add('chrome', new THREE.CylinderGeometry(0.008, 0.008, bw, 10), { pos: [(BAR.x0 + BAR.x1) / 2, BAR.top + 0.03, BAR.z0 - 0.0], rot: [0, 0, Math.PI / 2] }); // gallery rail
    for (let x = BAR.x0 + 0.05; x <= BAR.x1 - 0.04; x += 0.5) M.add('chrome', new THREE.CylinderGeometry(0.006, 0.006, 0.03, 8), { pos: [x, BAR.top + 0.015, BAR.z0] });
    // door panels: piano-black frames + chrome pulls
    for (let i = 0; i < 4; i++) {
      const px = BAR.x0 + bw * (i + 0.5) / 4;
      M.add('piano', new THREE.BoxGeometry(bw / 4 - 0.03, 0.012, 0.012), { pos: [px, 0.62, BAR.z0 - 0.002] });
      M.add('piano', new THREE.BoxGeometry(bw / 4 - 0.03, 0.012, 0.012), { pos: [px, 0.13, BAR.z0 - 0.002] });
      M.add('chrome', new THREE.BoxGeometry(0.12, 0.012, 0.02), { pos: [px, 0.56, BAR.z0 - 0.01] });
      M.add('piano', new THREE.BoxGeometry(0.008, 0.5, 0.012), { pos: [BAR.x0 + bw * i / 4 + 0.004, 0.375, BAR.z0 - 0.002] });
    }
    // back mirror between counter and sill (+ LED behind the glasses)
    M.add('mirror', new THREE.BoxGeometry(bw, sill - BAR.top - 0.02, 0.01), { pos: [(BAR.x0 + BAR.x1) / 2, (sill + BAR.top) / 2, zw - 0.075] });
    M.add('led', new THREE.BoxGeometry(bw, 0.01, 0.01), { pos: [(BAR.x0 + BAR.x1) / 2, BAR.top + 0.005, zw - 0.09] });
    // glass rack: 8 flutes + 4 tumblers (static, merged per material)
    const flute = lathe(THREE, [[0.032, 0], [0.032, 0.004], [0.004, 0.008], [0.0035, 0.1], [0.012, 0.108], [0.024, 0.13], [0.027, 0.17], [0.025, 0.215], [0.0245, 0.22]], 14);
    for (let i = 0; i < 8; i++) M.add('crystal', flute, { pos: [0.55 + (i % 4) * 0.075, BAR.top, zw - 0.15 - Math.floor(i / 4) * 0.075] });
    const tumbler = lathe(THREE, [[0.036, 0], [0.038, 0.012], [0.04, 0.09], [0.0405, 0.095]], 8);
    for (let i = 0; i < 4; i++) M.add('crystal', tumbler, { pos: [-1.38 + i * 0.09, BAR.top, zw - 0.14] });
    // decanters (faceted crystal) with whisky / cognac
    const dec = lathe(THREE, [[0.06, 0], [0.075, 0.03], [0.078, 0.13], [0.06, 0.17], [0.022, 0.2], [0.02, 0.24], [0.026, 0.245]], 8);
    const decLiq = lathe(THREE, [[0.001, 0.008], [0.068, 0.012], [0.071, 0.12], [0.001, 0.12]], 8);
    const stopper = lathe(THREE, [[0.012, 0], [0.03, 0.03], [0.026, 0.06], [0.001, 0.075]], 8);
    for (const [x, liq] of [[-0.95, 'whisky'], [-0.7, 'cognac']]) {
      M.add('crystal', dec, { pos: [x, BAR.top, zw - 0.2] });
      M.add(liq, decLiq, { pos: [x, BAR.top, zw - 0.2], color: liq === 'whisky' ? 0xb0621a : 0x8a3a12 });
      M.add('crystal', stopper, { pos: [x, BAR.top + 0.245, zw - 0.2] });
    }
    // champagne bucket (chrome) with ice + bottle (foil top, no label / no brand)
    const bx = 1.18, bz = zw - 0.2;
    M.add('chrome', lathe(THREE, [[0.07, 0], [0.085, 0.01], [0.1, 0.2], [0.107, 0.215], [0.1, 0.215], [0.093, 0.2], [0.075, 0.015]], 28), { pos: [bx, BAR.top, bz] });
    for (const s of [-1, 1]) M.add('chrome', new THREE.TorusGeometry(0.025, 0.005, 6, 14, Math.PI), { pos: [bx, BAR.top + 0.17, bz + s * 0.105], rot: [0, 0, 0] });
    for (let i = 0; i < 9; i++) M.add('ice', new THREE.BoxGeometry(0.035, 0.03, 0.035), { pos: [bx + Math.cos(i * 2.4) * 0.06, BAR.top + 0.19 + (i % 3) * 0.008, bz + Math.sin(i * 2.4) * 0.06], rot: [i, i * 0.7, 0] });
    M.add('bottle', lathe(THREE, [[0.001, 0], [0.038, 0.002], [0.04, 0.2], [0.03, 0.25], [0.015, 0.29], [0.014, 0.33], [0.016, 0.335]], 20), { pos: [bx, BAR.top + 0.03, bz], rot: [0, 0, -0.18] });
    M.add('foil', lathe(THREE, [[0.031, 0.245], [0.016, 0.29], [0.015, 0.336], [0.001, 0.338]], 16), { pos: [bx, BAR.top + 0.03, bz], rot: [0, 0, -0.18] });
    // napkin + tray under the serving glass
    M.add('chrome', new THREE.CylinderGeometry(0.11, 0.11, 0.008, 32), { pos: [0.1, BAR.top + 0.004, BAR.z0 + 0.14] });
  }
  /* ---------------- partition (x = 2.0) with the sliding window + TV */
  const P = CAB.part;
  {
    const px = x1;
    // panels around the window opening
    M.add('wood', new THREE.BoxGeometry(0.06, P.y0, zw * 2), { pos: [px, P.y0 / 2, 0] });
    M.add('suede', new THREE.BoxGeometry(0.06, h - P.y1, zw * 2), { pos: [px, (h + P.y1) / 2, 0] });
    M.add('wood', new THREE.BoxGeometry(0.06, P.y1 - P.y0, zw + P.z0), { pos: [px, (P.y0 + P.y1) / 2, (-zw + P.z0) / 2] });
    M.add('piano', new THREE.BoxGeometry(0.06, P.y1 - P.y0, zw - P.z1), { pos: [px, (P.y0 + P.y1) / 2, (zw + P.z1) / 2] });
    // chrome window frame
    for (const y of [P.y0, P.y1]) M.add('chrome', new THREE.BoxGeometry(0.07, 0.014, P.z1 - P.z0 + 0.03), { pos: [px - 0.005, y, (P.z0 + P.z1) / 2] });
    for (const z of [P.z0, P.z1]) M.add('chrome', new THREE.BoxGeometry(0.07, P.y1 - P.y0, 0.014), { pos: [px - 0.005, (P.y0 + P.y1) / 2, z] });
    M.add('chrome', new THREE.BoxGeometry(0.02, 0.012, zw * 2), { pos: [px - 0.035, P.y0 - 0.06, 0] });
    M.add('led', new THREE.BoxGeometry(0.01, 0.01, zw * 2 - 0.1), { pos: [px - 0.04, h - 0.03, 0] });
    // TV bezel (screen = separate mesh, dynamic canvas)
    M.add('piano', rbox(THREE, 0.03, 0.36, 0.6, 0.01), { pos: [px - 0.045, 0.95, 0.6] });
    // driver compartment: seat backs, headrests, dashboard, steering wheel, glowing gauges
    for (const z of [-0.45, 0.45]) {
      M.add('black', rbox(THREE, 0.16, 0.62, 0.52, 0.05), { pos: [px + 0.3, 0.72, z], rot: [0, 0, -0.18] });
      M.add('black', rbox(THREE, 0.12, 0.2, 0.28, 0.04), { pos: [px + 0.24, 1.15, z], rot: [0, 0, -0.18] });
    }
    M.add('black', rbox(THREE, 0.4, 0.22, zw * 2 - 0.04, 0.05), { pos: [px + 1.15, 0.78, 0] });
    M.add('wood', new THREE.BoxGeometry(0.02, 0.05, zw * 2 - 0.2), { pos: [px + 0.95, 0.82, 0] });
    M.add('dash', new THREE.BoxGeometry(0.01, 0.07, 0.3), { pos: [px + 0.955, 0.88, -0.45], color: 0x66d9ff });
    M.add('black', new THREE.TorusGeometry(0.17, 0.016, 8, 32), { pos: [px + 0.82, 0.92, -0.45], rot: [0, Math.PI / 2, 0.35] });
    M.add('black', new THREE.BoxGeometry(0.6, 0.05, zw * 2), { pos: [px + 0.65, 1.47, 0] });   // roof above the driver
    // chauffeur (back of head, cap, shoulders) — seated left, eyes on the road
    M.add('black', rbox(THREE, 0.22, 0.2, 0.46, 0.08), { pos: [px + 0.44, 1.02, -0.45] });
    M.add('chauffSkin', new THREE.SphereGeometry(0.095, 18, 12), { pos: [px + 0.46, 1.27, -0.45], scale: [1, 1.12, 0.9] });
    M.add('black', new THREE.CylinderGeometry(0.1, 0.1, 0.07, 20), { pos: [px + 0.46, 1.36, -0.45] });
    M.add('black', new THREE.CylinderGeometry(0.11, 0.11, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), { pos: [px + 0.5, 1.33, -0.45] });
    M.add('chrome', new THREE.BoxGeometry(0.004, 0.012, 0.2), { pos: [px + 0.36, 1.33, -0.45] });
  }
  const chauffSkin = new THREE.MeshStandardMaterial({ color: 0x8a5a40, roughness: 0.6 });
  const meshes = M.build({ ...mats, chauffSkin }, group);
  for (const m of meshes) { if (/glassTint|crystal|ice/.test(m.name)) m.renderOrder = 4; }

  /* ---------------- dynamic parts */
  // partition glass (slides down into the panel)
  const pGlass = new THREE.Mesh(new THREE.BoxGeometry(0.012, P.y1 - P.y0, P.z1 - P.z0), new THREE.MeshPhysicalMaterial({ color: 0x1a2028, roughness: 0.14, transparent: true, opacity: 0.55, envMap: o.envMap || null, envMapIntensity: 1.5, depthWrite: false }));
  pGlass.position.set(x1 - 0.01, (P.y0 + P.y1) / 2, (P.z0 + P.z1) / 2); pGlass.renderOrder = 4; pGlass.name = 'limo:partition';
  // clip the lowered glass inside the panel: scale y down instead of moving through the wood
  pGlass.userData.y0 = pGlass.position.y; group.add(pGlass);
  // sunroof glass panel (slides back over the headliner)
  const S = CAB.sun;
  const sun = new THREE.Mesh(new THREE.BoxGeometry(S.x1 - S.x0, 0.01, S.z * 2), new THREE.MeshPhysicalMaterial({ color: 0x0c1218, roughness: 0.14, transparent: true, opacity: 0.6, envMap: o.envMap || null, depthWrite: false }));
  sun.position.set((S.x0 + S.x1) / 2, h + 0.09, 0); sun.userData.x0 = sun.position.x; sun.name = 'limo:sunroof'; sun.renderOrder = 4; group.add(sun);
  // TV screen (canvas route map; limo.js draws into it)
  const tvCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let tvTex = null;
  if (tvCanvas) { tvCanvas.width = 512; tvCanvas.height = 288; tvTex = new THREE.CanvasTexture(tvCanvas); tvTex.colorSpace = THREE.SRGBColorSpace; }
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.315), new THREE.MeshBasicMaterial({ map: tvTex, color: tvTex ? 0xffffff : 0x111a22, toneMapped: false }));
  tv.position.set(x1 - 0.062, 0.95, 0.6); tv.rotation.y = -Math.PI / 2; tv.name = 'limo:tv'; group.add(tv);
  // starlight ceiling
  const stars = starfield(THREE, hi ? 700 : 380, CAB.sun);
  group.add(stars);
  // serving glass on the bar (pour target) + the bottles used for pouring
  const serve = makeGlass(THREE, 'flute', { glassMat: mats.crystal.clone() });
  serve.glassMat.flatShading = false; serve.glassMat.opacity = 0.3;
  serve.group.position.set(0.1, BAR.top + 0.008, BAR.z0 + 0.14); serve.liquid.scale.y = 0.0001; serve.liquid.visible = false;
  group.add(serve.group);
  const tumblerServe = makeGlass(THREE, 'tumbler', { glassMat: serve.glassMat });
  tumblerServe.group.position.copy(serve.group.position); tumblerServe.group.visible = false; tumblerServe.liquid.visible = false; group.add(tumblerServe.group);
  // ice cubes for the whisky tumbler
  const iceG = new THREE.Group(); for (let i = 0; i < 2; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.028, 0.03), mats.ice); c.position.set(i ? 0.012 : -0.01, 0.045 + i * 0.012, i ? -0.006 : 0.008); c.rotation.set(i * 0.6, i, 0.3); iceG.add(c); }
  iceG.visible = false; tumblerServe.group.add(iceG);
  // pouring bottle (shown only while pouring; parked next to the glass afterwards)
  const pourBottle = new THREE.Group(); pourBottle.name = 'limo:pourBottle';
  const pbBody = new THREE.Mesh(lathe(THREE, [[0.001, 0], [0.036, 0.002], [0.037, 0.19], [0.028, 0.24], [0.014, 0.28], [0.013, 0.31], [0.015, 0.315]], 18), mats.bottle);
  pbBody.position.y = -0.03; pourBottle.add(pbBody);
  pourBottle.position.set(0.32, BAR.top, BAR.z0 + 0.16); group.add(pourBottle);
  // pour stream + bubbles
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.004, 1, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2d27a, transparent: true, opacity: 0.8, roughness: 0.16 }));
  stream.visible = false; group.add(stream);
  const bubN = 40, bubG = new THREE.BufferGeometry(), bubP = new Float32Array(bubN * 3), bubS = new Float32Array(bubN);
  for (let i = 0; i < bubN; i++) { bubS[i] = Math.random(); }
  bubG.setAttribute('position', new THREE.BufferAttribute(bubP, 3));
  const bubbles = new THREE.Points(bubG, new THREE.PointsMaterial({ color: 0xffffff, size: 0.004, transparent: true, opacity: 0.85, depthWrite: false }));
  bubbles.frustumCulled = false; bubbles.visible = false; group.add(bubbles);

  /* ---------------- colliders (cabin local) + walkable aisle (invisible, 0.5 m below the floor → seated eye height) */
  const B = (a, b) => new THREE.Box3(new THREE.Vector3(...a), new THREE.Vector3(...b));
  const colliders = [
    B([x0 - 0.5, -1, -2], [x0 + 0.66, 2, 2]),            // rear bench + rear wall
    B([x0, -1, -2], [1.95, 2, -0.3]),                    // side bench + passengers
    B([BAR.x0 - 0.02, -1, BAR.z0 - 0.02], [2.5, 2, 2]),  // bar + right wall
    B([1.05, -1, -2], [2.5, 2, -0.5]),                   // front-left console
    B([x1 - 0.12, -1, -2], [x1 + 2, 2, 2]),              // partition
    B([x0 - 1, -1, zw - 0.02], [x1 + 1, 2, zw + 1]),     // right wall (rear part)
    B([x0 - 1, -1, -zw - 1], [x1 + 1, 2, -zw + 0.02]),   // left wall
  ];
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, zw * 2), new THREE.MeshBasicMaterial({ visible: false }));
  walk.rotation.x = -Math.PI / 2; walk.position.set((x0 + x1) / 2, -(1.6 - CAB.eye), 0); walk.name = 'limo:walkable'; group.add(walk);

  return {
    group, mats, colliders, walkable: walk, stars, tv, tvCanvas, tvTex, partition: pGlass, sunroof: sun, BAR,
    serve, tumblerServe, ice: iceG, pourBottle, stream, bubbles, ledMats: [mats.led, mats.ledFloor],
  };
}

// small dark env scene → PMREM (reflections that look like a dark cabin with glowing strips, not a sunny sky)
export function cabinEnv(THREE, renderer) {
  try {
    const sc = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 2.2), new THREE.MeshBasicMaterial({ color: 0x1a1512, side: THREE.BackSide }));
    sc.add(room);
    const add = (w, h, d, x, y, z, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y, z); sc.add(m); };
    for (const s of [-1, 1]) add(4.8, 0.35, 0.02, 0, 0.25, s * 1.08, 0x8ea2bb);   // windows (sky)
    for (const s of [-1, 1]) add(5.6, 0.03, 0.03, 0, 0.75, s * 1.05, 0xb48cff);   // cove LEDs
    add(1.4, 0.02, 0.9, 0, 0.99, 0, 0xc8d6e8);                                     // sunroof
    add(0.02, 0.6, 1.6, -2.98, 0.3, 0, 0x6f7f95);                                  // rear window
    add(0.4, 0.02, 0.2, 1, 0.98, 0.5, 0xffd2a0); add(0.4, 0.02, 0.2, -1, 0.98, -0.5, 0xffd2a0);
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(sc, 0.02);
    pm.dispose();
    sc.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    return rt.texture;
  } catch (e) { console.warn('[limo] env', e); return null; }
}

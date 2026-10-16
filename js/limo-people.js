// limo-people.js — V10 LIMO: the two adult passengers (stylised, realistic adult proportions ≈ 1.68 m, 7.5 heads).
// Tasteful outfits only: A = knee-length emerald cocktail dress; B = one-piece swimsuit fully under a long printed
// kimono cover-up + a sarong to mid-calf + sun hat. Seated, relaxed upright poses. Idle animation: breathing, a glance
// now and then, an occasional sip (drinks are optional virtual props). No suggestive poses or motions.
// Local frame: the passenger faces +z, seat surface y = 0.44, hips at x = 0, z = 0. ~15 draw calls each.
// No side effects on import.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Merger, taper, between, lathe } from './limo-util.js';
import { face as faceTex, printFabric } from './limo-tex.js';

export const LOOKS = {
  A: { skin: '#d6a084', skinHex: 0xd6a084, eye: '#4a2e1c', lip: '#b23f55', brow: '#2c1a12', hair: 0x2a1a12, hairStyle: 'long',
    outfit: 'dress', dress: 0x0e5a46, sheen: 0x6fe0b8, shoe: 0x0b0b0c, drink: 'champagne' },
  B: { skin: '#a8745a', skinHex: 0xa8745a, eye: '#2e1a0e', lip: '#9a3a3e', brow: '#1e120c', hair: 0x6b3b1e, hairStyle: 'bun',
    outfit: 'resort', suit: 0x1b2c4a, kimono: '#f3ece0', kimonoInk: '#c98a6a', sarong: '#e8826a', shoe: 0xb98a5e, drink: 'rose' },
};

function mats(THREE, L, quality) {
  const hi = quality !== 'low';
  const Phys = hi ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const skinP = { color: L.skinHex, roughness: 0.52, metalness: 0 };
  if (hi) Object.assign(skinP, { sheen: 0.18, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xff8a6a), clearcoat: 0.08, clearcoatRoughness: 0.6 });
  const skin = new Phys(skinP);
  const faceM = new Phys({ ...skinP, color: 0xffffff, map: faceTex(THREE, { skin: L.skin, eye: L.eye, lip: L.lip, brow: L.brow }) });
  const hairP = { color: L.hair, roughness: 0.42, metalness: 0.05, side: THREE.DoubleSide };
  if (hi) Object.assign(hairP, { sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(0xc89060) });
  const hair = new Phys(hairP);
  const gold = new THREE.MeshStandardMaterial({ color: 0xf0c56a, metalness: 1, roughness: 0.22 });
  const shoe = new THREE.MeshStandardMaterial({ color: L.shoe, roughness: 0.3, metalness: 0.1 });
  const out = { skin, face: faceM, hair, gold, shoe };
  if (L.outfit === 'dress') {
    const dP = { color: L.dress, roughness: 0.32, metalness: 0.05, side: THREE.DoubleSide };
    if (hi) Object.assign(dP, { sheen: 1, sheenRoughness: 0.28, sheenColor: new THREE.Color(L.sheen) });
    out.dress = new Phys(dP); out.skirt = out.dress;
  } else {
    out.dress = new THREE.MeshStandardMaterial({ color: L.suit, roughness: 0.45 });
    const kP = { color: 0xffffff, map: printFabric(THREE, { base: L.kimono, ink: L.kimonoInk, ink2: '#8db39d', kind: 'leaf' }), roughness: 0.7, side: THREE.DoubleSide };
    kP.roughness = 0.9; kP.envMapIntensity = 0.3; kP.color = 0xd9cdb8;
    out.kimono = new Phys(kP);
    out.skirt = new THREE.MeshStandardMaterial({ color: 0xffffff, map: printFabric(THREE, { base: L.sarong, ink: '#f6d2a2', ink2: '#b4483c', kind: 'flower', seed: 33 }), roughness: 0.75, side: THREE.DoubleSide });
    out.hat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85 }); // straw + black band (vertex colours)
    out.band = out.hat;
  }
  return out;
}

// stemware: 'flute' | 'tumbler' | 'coupe'; returns {group, liquid (mesh, scale.y = level), glassMat}
export function makeGlass(THREE, kind = 'flute', o = {}) {
  const g = new THREE.Group(); g.name = 'limo:glass:' + kind;
  const glassMat = o.glassMat || new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.14, transparent: true, opacity: 0.28, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide });
  let prof, liq, top;
  if (kind === 'flute') {
    prof = [[0.032, 0], [0.032, 0.004], [0.004, 0.008], [0.0035, 0.1], [0.012, 0.108], [0.024, 0.13], [0.027, 0.17], [0.025, 0.215], [0.0245, 0.22]];
    liq = [[0.001, 0.112], [0.012, 0.114], [0.021, 0.13], [0.0235, 0.165], [0.0225, 0.205], [0.001, 0.205]]; top = 0.112;
  } else if (kind === 'coupe') {
    prof = [[0.035, 0], [0.004, 0.01], [0.004, 0.09], [0.03, 0.105], [0.048, 0.125], [0.05, 0.13]];
    liq = [[0.001, 0.096], [0.026, 0.104], [0.044, 0.12], [0.001, 0.12]]; top = 0.096;
  } else {
    prof = [[0.036, 0], [0.038, 0.012], [0.04, 0.09], [0.0405, 0.095]];
    liq = [[0.001, 0.012], [0.036, 0.012], [0.037, 0.085], [0.001, 0.085]]; top = 0.012;
  }
  const gm = new THREE.Mesh(lathe(THREE, prof, 24), glassMat); gm.renderOrder = 3; g.add(gm);
  const lm = new THREE.Mesh(lathe(THREE, liq.map(([r, y]) => [r, y - top]), 20), o.liquidMat || new THREE.MeshStandardMaterial({ color: 0xf2d27a, roughness: 0.16, transparent: true, opacity: 0.82, emissive: 0x3a2a08 }));
  lm.position.y = top; lm.renderOrder = 2; g.add(lm);
  g.userData.liquid = lm; g.userData.top = top;
  return { group: g, liquid: lm, glassMat };
}

export function buildPassenger(THREE, id = 'A', quality = 'high') {
  const L = LOOKS[id] || LOOKS.A;
  const M = mats(THREE, L, quality);
  const root = new THREE.Group(); root.name = 'limo:passenger:' + id;
  root.userData.limoPassenger = id;
  const add = (o) => { root.add(o); return o; };
  /* ---------------- lower body (static, merged) */
  const S = new Merger(THREE);
  const seg = (key, a, b, r0, r1) => { const { matrix, len } = between(THREE, a, b); S.add(key, taper(THREE, r0, r1, len), { matrix }); };
  const kx = 0.062, slant = 0.075;
  for (const s of [-1, 1]) {
    const hip = [s * 0.088, 0.53, 0.0], knee = [s * kx, 0.535, 0.43], ankle = [s * 0.05 + slant, 0.1, 0.5];
    seg('skin', knee, hip, 0.055, 0.088);
    seg('skin', ankle, knee, 0.034, 0.055);
    S.add('skin', new THREE.SphereGeometry(0.05, 12, 8), { pos: knee });
    // calf bulge
    S.add('skin', new THREE.SphereGeometry(0.045, 12, 8), { pos: [knee[0] * 0.6 + ankle[0] * 0.4, 0.37, 0.455], scale: [0.95, 1.9, 1.0] });
    // shoe (pointed toe, heel)
    const fx = ankle[0], fz = ankle[2];
    if (L.outfit === 'dress') {
      S.add('shoe', new THREE.SphereGeometry(0.04, 14, 8), { pos: [fx, 0.05, fz + 0.06], scale: [0.9, 0.6, 2.4], rot: [0.32, 0, 0] });
      S.add('shoe', new THREE.CylinderGeometry(0.007, 0.012, 0.08, 8), { pos: [fx, 0.04, fz - 0.035] });
      S.add('skin', new THREE.SphereGeometry(0.033, 10, 8), { pos: [fx, 0.085, fz + 0.03], scale: [0.85, 0.75, 1.9], rot: [0.5, 0, 0] });
    } else {
      S.add('skin', new THREE.SphereGeometry(0.036, 12, 8), { pos: [fx, 0.045, fz + 0.07], scale: [0.9, 0.55, 2.6], rot: [0.12, 0, 0] });
      S.add('shoe', new THREE.BoxGeometry(0.08, 0.018, 0.22), { pos: [fx, 0.01, fz + 0.06] });
      S.add('shoe', new THREE.TorusGeometry(0.036, 0.006, 6, 16, Math.PI), { pos: [fx, 0.03, fz + 0.1], rot: [0, Math.PI / 2, 0], scale: [1, 0.8, 1] });
      S.add('shoe', new THREE.TorusGeometry(0.034, 0.006, 6, 16, Math.PI), { pos: [fx, 0.08, fz], rot: [0, Math.PI / 2, 0] });
    }
  }
  // pelvis / seat contact
  S.add(L.outfit === 'dress' ? 'dress' : 'skirt', new THREE.SphereGeometry(0.18, 20, 12), { pos: [0, 0.52, -0.03], scale: [1.0, 0.55, 0.85] });
  // skirt over the thighs: a closed, flattened tapered sack from the hips to just past the knees + a hem drape
  {
    // tailored: narrow at the knee, thick enough vertically that thighs / knees never poke through
    const { matrix, len } = between(THREE, [slant * 0.25, 0.545, 0.55], [0, 0.54, -0.05]);
    matrix.multiply(new THREE.Matrix4().makeScale(1.14, 1, 0.64));
    S.add('skirt', taper(THREE, 0.112, 0.172, len, 28), { matrix });
    // hem: a slightly flared open band just past the knees
    const hm = between(THREE, [slant * 0.25, 0.545, 0.47], [slant * 0.25, 0.545, 0.565]);
    hm.matrix.multiply(new THREE.Matrix4().makeScale(1.14, 1, 0.64)).multiply(new THREE.Matrix4().makeTranslation(0, hm.len / 2, 0));
    S.add('skirt', new THREE.CylinderGeometry(0.114, 0.111, hm.len, 28, 1, true), { matrix: hm.matrix });
    if (L.outfit !== 'dress') { // the sarong falls past the knees to mid-calf
      S.add('skirt', new RoundedBoxGeometry(0.27, 0.32, 0.05, 2, 0.02), { pos: [slant * 0.4, 0.4, 0.49], rot: [0.12, 0, 0] });
    }
  }
  S.build({ skin: M.skin, shoe: M.shoe, dress: M.dress, skirt: M.skirt }, root, { castShadow: false });

  /* ---------------- upper body (leans back slightly, breathes) */
  const upper = add(new THREE.Group()); upper.position.set(0, 0.5, -0.03); upper.rotation.x = -0.1;
  const torsoProf = [[0.001, -0.04], [0.15, -0.02], [0.172, 0.06], [0.165, 0.13], [0.132, 0.24], [0.135, 0.3], [0.152, 0.38], [0.152, 0.44], [0.148, 0.48]];
  const torso = new THREE.Mesh(lathe(THREE, torsoProf, 28), M.dress); torso.scale.set(1, 1, 0.66); torso.rotation.y = Math.PI; torso.name = 'torso'; upper.add(torso);
  const U = new Merger(THREE);
  const shL = [0.178, 0.5, -0.005], elL = [0.2, 0.25, 0.05], wrL = [0.09, 0.12, 0.27];
  // upper chest + shoulders: boat neckline (dress / one-piece), only the neck is bare
  U.add('dress', lathe(THREE, [[0.15, 0.47], [0.162, 0.5], [0.17, 0.53], [0.145, 0.555], [0.09, 0.578], [0.06, 0.585]], 28), { scale: [1.12, 1, 0.62], rot: [0, Math.PI, 0] });
  U.add('skin', taper(THREE, 0.045, 0.043, 0.13), { pos: [0, 0.56, 0.0] }); // neck
  if (L.outfit === 'dress') {
    U.add('dress', new THREE.CylinderGeometry(0.056, 0.062, 0.09, 18, 1, true), { matrix: between(THREE, shL, elL).matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.035, 0)) });
    U.add('gold', new THREE.TorusGeometry(0.06, 0.0035, 6, 32), { pos: [0, 0.585, 0.012], rot: [Math.PI / 2 - 0.35, 0, 0], scale: [1, 1.15, 1] });
  } else {
    // kimono shell, open at the front, to mid-thigh
    const pts = [[0.185, -0.02], [0.178, 0.13], [0.158, 0.25], [0.166, 0.38], [0.174, 0.47], [0.18, 0.53], [0.125, 0.578]].map(([r, y]) => new THREE.Vector2(r, y));
    const part = new THREE.LatheGeometry(pts, 24, 0.55, Math.PI * 2 - 1.1);
    U.add('kimono', part, { scale: [1.04, 1, 0.7] });
    // lapels
    for (const s of [-1, 1]) U.add('kimono', new THREE.BoxGeometry(0.05, 0.5, 0.012), { pos: [s * 0.075, 0.3, 0.113], rot: [-0.04, 0, s * 0.12] });
    U.add('gold', new THREE.TorusGeometry(0.058, 0.003, 6, 32), { pos: [0, 0.585, 0.012], rot: [Math.PI / 2 - 0.35, 0, 0], scale: [1, 1.15, 1] });
  }
  // left arm (static, merged): shoulder → elbow → wrist resting on the lap
  U.add('skin', taper(THREE, 0.034, 0.045, 0.27), between(THREE, elL, shL));
  U.add('skin', taper(THREE, 0.025, 0.035, 0.25), between(THREE, wrL, elL));
  U.add('skin', new THREE.SphereGeometry(0.036, 10, 8), { pos: elL });
  U.add(L.outfit === 'dress' ? 'dress' : 'skin', new THREE.SphereGeometry(0.046, 12, 10), { pos: shL, scale: [1.15, 1.0, 1.05] });
  U.add('skin', new THREE.SphereGeometry(0.03, 10, 8), { pos: [wrL[0] - 0.02, wrL[1] - 0.012, wrL[2] + 0.06], scale: [1.25, 0.5, 1.9], rot: [0, -0.5, 0] });
  U.add('gold', new THREE.TorusGeometry(0.03, 0.004, 6, 20), { pos: [wrL[0] + 0.008, wrL[1] + 0.006, wrL[2] - 0.012], rot: [1.2, 0.5, 0] });
  if (L.outfit !== 'dress') { // kimono sleeve (wide, to the elbow… three-quarter)
    const sb = between(THREE, shL, [0.205, 0.2, 0.08]);
    U.add('kimono', new THREE.CylinderGeometry(0.085, 0.06, 0.3, 18, 1, true), { matrix: sb.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.15, 0)) });
  }
  U.build({ skin: M.skin, dress: M.dress, gold: M.gold, kimono: M.kimono }, upper);

  /* ---------------- right arm (animated: rest on lap holding a glass ↔ sip) */
  const shoulder = new THREE.Group(); shoulder.position.set(-0.178, 0.5, -0.005); upper.add(shoulder);
  const SA = new Merger(THREE); // upper arm + shoulder cap / sleeve (merged: 2 draw calls)
  SA.add('skin', taper(THREE, 0.045, 0.034, 0.27), { rot: [Math.PI, 0, 0] });
  SA.add(L.outfit === 'dress' ? 'dress' : 'skin', new THREE.SphereGeometry(0.046, 12, 10), { scale: [1.15, 1.0, 1.05] });
  if (L.outfit === 'dress') SA.add('dress', new THREE.CylinderGeometry(0.056, 0.062, 0.09, 18, 1, true), { pos: [0, -0.035, 0] });
  else SA.add('kimono', new THREE.CylinderGeometry(0.085, 0.06, 0.3, 18, 1, true), { pos: [0, -0.15, 0] });
  SA.build({ skin: M.skin, dress: M.dress, kimono: M.kimono }, shoulder);
  const elbow = new THREE.Group(); elbow.position.y = -0.27; shoulder.add(elbow);
  const EA = new Merger(THREE); // forearm + elbow + hand (one draw call)
  EA.add('skin', taper(THREE, 0.035, 0.025, 0.25), { rot: [Math.PI, 0, 0] });
  EA.add('skin', new THREE.SphereGeometry(0.036, 10, 8));
  EA.add('skin', new THREE.SphereGeometry(0.03, 10, 8), { pos: [0, -0.29, 0], scale: [0.55, 1.7, 1.15] });
  EA.add('skin', new THREE.SphereGeometry(0.012, 8, 6), { pos: [0, -0.28, 0.028], rot: [0.5, 0, 0], scale: [1, 2.4, 1] });
  EA.build({ skin: M.skin }, elbow);
  const hand = new THREE.Group(); hand.position.y = -0.25; elbow.add(hand);
  const glass = makeGlass(THREE, L.drink === 'rose' ? 'coupe' : 'flute', {
    liquidMat: new THREE.MeshStandardMaterial({ color: L.drink === 'rose' ? 0xf4a3a8 : 0xf2d27a, roughness: 0.16, transparent: true, opacity: 0.82, emissive: L.drink === 'rose' ? 0x40141a : 0x3a2a08 }),
  });
  const gAnchor = new THREE.Group(); gAnchor.position.set(0, -0.06, 0.018); hand.add(gAnchor);
  glass.group.position.y = -0.1; gAnchor.add(glass.group);
  glass.liquid.scale.y = 0.7;

  /* ---------------- head */
  const head = new THREE.Group(); head.position.set(0, 0.69, 0.012); upper.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 36, 24), M.face); skull.scale.set(0.84, 1.1, 0.95); head.add(skull);
  const H = new Merger(THREE);
  // jaw / chin softening + ears + nose bridge
  H.add('skin', new THREE.SphereGeometry(0.055, 16, 10), { pos: [0, -0.05, 0.02], scale: [1.05, 0.95, 0.95] });
  for (const s of [-1, 1]) H.add('skin', new THREE.SphereGeometry(0.018, 8, 6), { pos: [s * 0.083, 0.0, -0.005], scale: [0.5, 1.2, 0.9] });
  H.add('skin', new THREE.SphereGeometry(0.012, 10, 8), { pos: [0, -0.012, 0.09], scale: [0.9, 1.9, 1.0], rot: [-0.3, 0, 0] });
  for (const s of [-1, 1]) H.add('gold', new THREE.SphereGeometry(0.008, 8, 6), { pos: [s * 0.085, -0.03, 0.0] });
  // hair
  const phiFace = Math.PI / 2; // +z
  H.add('hair', new THREE.SphereGeometry(0.106, 32, 16, phiFace + 0.8, Math.PI * 2 - 1.6, 0, Math.PI * 0.7), { scale: [0.86, 1.12, 0.98] });
  H.add('hair', new THREE.SphereGeometry(0.107, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.27), { scale: [0.86, 1.12, 0.98], pos: [0, 0.004, -0.004] });
  if (L.hairStyle === 'long') {
    // long hair: a shell from the crown down past the shoulders, open at the face; side-swept fringe
    const prof = [[0.02, 0.13], [0.07, 0.12], [0.1, 0.085], [0.108, 0.03], [0.104, -0.03], [0.1, -0.09], [0.106, -0.16], [0.12, -0.23], [0.128, -0.29], [0.12, -0.3]];
    H.add('hair', new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28, 0.72, Math.PI * 2 - 1.44), { scale: [0.92, 1.03, 0.98], pos: [0, 0, -0.008] });
  } else {
    H.add('hair', new THREE.SphereGeometry(0.05, 16, 12), { pos: [0, -0.04, -0.105], scale: [1.1, 0.9, 0.9] }); // low bun
    const prof = [[0.02, 0.13], [0.07, 0.12], [0.1, 0.085], [0.108, 0.03], [0.104, -0.02], [0.098, -0.05], [0.09, -0.06]];
    H.add('hair', new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28, 0.8, Math.PI * 2 - 1.6), { scale: [0.92, 1.03, 0.98], pos: [0, 0, -0.008] });
  }
  if (M.hat) {
    H.add('hat', new THREE.CylinderGeometry(0.235, 0.24, 0.008, 40), { pos: [0, 0.098, -0.01], rot: [-0.1, 0, 0.06], color: 0xe0c99a });
    H.add('hat', new THREE.CylinderGeometry(0.09, 0.1, 0.095, 28), { pos: [0, 0.14, -0.012], rot: [-0.1, 0, 0.06], color: 0xe0c99a });
    H.add('band', new THREE.CylinderGeometry(0.101, 0.103, 0.022, 28, 1, true), { pos: [0, 0.112, -0.012], rot: [-0.1, 0, 0.06], color: 0x1a1a1a });
  }
  H.build({ skin: M.skin, hair: M.hair, gold: M.gold, hat: M.hat, band: M.band }, head);

  /* ---------------- animation */
  const P = {
    rest: { sx: -0.32, sz: 0.42, sy: 0.15, ex: -1.4 },
    sip: { sx: -0.95, sz: 0.48, sy: -0.25, ex: -2.35 },
    cheers: { sx: -1.25, sz: 0.12, sy: 0.0, ex: -0.85 },
  };
  const st = { t: Math.random() * 10, pose: 'rest', k: 0, target: P.rest, from: { ...P.rest }, cur: { ...P.rest }, blend: 1, nextSip: 6 + Math.random() * 8, nextGlance: 2 + Math.random() * 3,
    glance: 0, glanceTarget: 0, lookAt: null, hold: 0, nod: 0 };
  const phase = id === 'A' ? 0 : 1.7;
  function setPose(name, hold = 0) { st.from = { ...st.cur }; st.target = P[name]; st.pose = name; st.blend = 0; st.hold = hold; }
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  function update(dt, camPos) {
    st.t += dt;
    // breathing (slow, subtle)
    const br = Math.sin(st.t * 1.45 + phase);
    torso.scale.set(1 + br * 0.008, 1 + br * 0.004, 0.66 * (1 + br * 0.014));
    upper.position.y = 0.5 + br * 0.0015;
    // pose blend
    if (st.blend < 1) {
      st.blend = Math.min(1, st.blend + dt / 0.9);
      const e = st.blend * st.blend * (3 - 2 * st.blend);
      for (const k of ['sx', 'sz', 'sy', 'ex']) st.cur[k] = st.from[k] + (st.target[k] - st.from[k]) * e;
    } else if (st.pose !== 'rest') {
      st.hold -= dt;
      if (st.hold <= 0) setPose('rest');
    } else {
      st.nextSip -= dt;
      if (st.nextSip <= 0) { setPose('sip', 1.4); st.nextSip = 10 + Math.random() * 10; }
    }
    shoulder.rotation.set(st.cur.sx, st.cur.sy, st.cur.sz);
    elbow.rotation.x = st.cur.ex;
    // keep the glass upright (tilted toward the lips while sipping)
    const sipK = st.pose === 'sip' ? Math.min(1, st.blend) : 0;
    gAnchor.rotation.set(-(st.cur.sx + st.cur.ex) - upper.rotation.x - sipK * 0.55, 0, -st.cur.sz * 0.9);
    // glances: toward the visitor now and then (or while greeting), else a soft look around
    st.nextGlance -= dt;
    if (st.nextGlance <= 0) { st.nextGlance = 3 + Math.random() * 5; st.glanceTarget = Math.random() < 0.55 ? 'cam' : (Math.random() - 0.5) * 0.7; }
    let yaw = typeof st.glanceTarget === 'number' ? st.glanceTarget : 0, pitch = 0;
    if ((st.glanceTarget === 'cam' || st.lookAt) && camPos) {
      head.getWorldPosition(tmp); tmp2.copy(camPos).sub(tmp);
      // into root space
      const inv = root.matrixWorld.clone().invert(); const local = tmp2.clone().transformDirection(inv);
      yaw = Math.max(-0.85, Math.min(0.85, Math.atan2(local.x, local.z)));
      pitch = Math.max(-0.3, Math.min(0.3, -Math.atan2(local.y, Math.hypot(local.x, local.z))));
    }
    if (st.lookAt) st.lookAt = Math.max(0, st.lookAt - dt);
    head.rotation.y += (yaw - head.rotation.y) * Math.min(1, dt * 2.2);
    head.rotation.x += (pitch + Math.sin(st.t * 0.7 + phase) * 0.02 + (st.nod > 0 ? Math.sin(st.nod * 9) * 0.07 : 0) - head.rotation.x) * Math.min(1, dt * 3);
    if (st.nod > 0) st.nod = Math.max(0, st.nod - dt);
  }
  return {
    id, group: root, head, glass, look: L,
    update,
    greet(dur = 4) { st.lookAt = dur; st.nod = 0.7; },
    cheers(dur = 1.8) { setPose('cheers', dur); st.lookAt = dur + 1; st.nod = 0.5; },
    sip() { setPose('sip', 1.4); },
    get pose() { return st.pose; },
    bubbleAnchor(out) { head.getWorldPosition(out); out.y += 0.24; return out; },
  };
}

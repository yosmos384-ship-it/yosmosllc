// heli-pilot.js — V13 HELI: the professional pilot in the right-hand seat. Adult woman, natural proportions, a loose
// one-piece navy flight suit (collar, zip, sleeve / thigh pockets, generic wings badge — no real insignia), flight
// gloves, boots, 4-point harness, aviator sunglasses, a headset with boom mic, hair in a low bun. Seated with a calm,
// natural posture: right hand on the cyclic, left hand on the collective, feet on the pedals — all four limbs are one
// CPU-skinned mesh (two-bone IK per limb) so elbows / knees bend smoothly as the controls move. Subtle idle motion:
// breathing, head scanning, glances at the panel, looking toward the sight on orbits. Strictly non-sexualised.
//
//   buildPilot(THREE, { quality, seat: Vector3 (cushion-top centre, heli local), cyclic: Group, collective: Group,
//                       pedals?: [Group, Group], floor })
//     → { group, head, update(dt, { lookYaw?, talk? }), bubbleAnchor(v), M }
// Coordinates: heli local frame (nose −z, +x right, y up). No side effects on import.
import { Kit } from './heli-model.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
let RB_LOW = false; // low quality: fewer rounding segments on every rounded box
const RBG = (w, h, d, seg = 2, r = 0.1) => new RoundedBoxGeometry(w, h, d, RB_LOW ? Math.min(seg, 1) : seg, r);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const spow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
const lin = (c) => { const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255; return [r, g, b].map((v) => Math.pow(v, 2.2)); };
const C = { suit: lin(0x283246), suitD: lin(0x1d2536), seam: lin(0x161d2c), glove: lin(0x2a221d), boot: lin(0x141414), web: lin(0x111214), buckle: lin(0xa8adb4), gold: lin(0xc8a45c), patch: lin(0x3a4a6a), zip: lin(0x6a6e75), skin: lin(0xc89a7c), lip: lin(0xa86a62), brow: lin(0x3b2618), hair: lin(0x22150d), hairHi: lin(0x3e2716), dark: lin(0x1b1c20), cup: lin(0x23252a), cush: lin(0x0e0e10), frame: lin(0xb8a070), board: lin(0x2e3136), paper: lin(0xb9b6ad) };

export function buildPilot(THREE, o = {}) {
  const hi = (o.quality || 'high') !== 'low';
  const seg = hi ? 16 : 10;
  RB_LOW = !hi;
  const g = new THREE.Group(); g.name = 'heli:pilot';
  const seat = o.seat || new THREE.Vector3(0.42, 1.04, -2.42);
  const SX = seat.x, SY = seat.y, SZ = seat.z;
  const cyc = o.cyclic || null;
  const col = o.collective || (cyc && cyc.userData.collective) || null;
  const pedals = o.pedals || (cyc && cyc.userData.pedals) || null;
  const M = {
    suit: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0, vertexColors: true }),
    skin: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, vertexColors: true }),
    dark: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.15, vertexColors: true }),
    lens: new THREE.MeshStandardMaterial({ color: 0x2a3a3a, roughness: 0.05, metalness: 0.9 }),
    hair: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, vertexColors: true }),
  };
  for (const k of Object.keys(M)) M[k].name = 'pilot-' + k;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  /* ---------------- torso frame: pelvis P, spine up U (leaning back 10°), right X, back B */
  const lean = 0.17;
  const U = V(0, Math.cos(lean), Math.sin(lean)), X = V(1, 0, 0), B = V(0, -Math.sin(lean), Math.cos(lean));
  const P = V(SX, SY + 0.105, SZ + 0.075);
  const at = (t, x, b) => P.clone().addScaledVector(U, t).addScaledVector(X, x).addScaledVector(B, b);
  const BK = new Kit(THREE);
  {
    // lofted torso: [t, half width, front depth, back depth, exponent]
    const S = [[-0.085, 0.13, 0.08, 0.09, 2.2], [-0.05, 0.172, 0.115, 0.115, 2.5], [0.02, 0.182, 0.12, 0.118, 2.6], [0.10, 0.178, 0.112, 0.108, 2.5], [0.19, 0.163, 0.104, 0.10, 2.4],
      [0.28, 0.166, 0.108, 0.10, 2.4], [0.36, 0.172, 0.116, 0.10, 2.4], [0.43, 0.178, 0.112, 0.10, 2.5], [0.49, 0.188, 0.095, 0.096, 2.9], [0.535, 0.172, 0.078, 0.084, 2.7], [0.57, 0.12, 0.058, 0.064, 2.3], [0.595, 0.062, 0.048, 0.05, 2.0]];
    const nA = hi ? 36 : 22, rings = [], pos = [], idx = [], colA = [];
    const dense = [];
    for (let i = 0; i < S.length - 1; i++) { const a = S[i], b = S[i + 1]; const m = 3; for (let k = 0; k < m; k++) { const t = k / m, e = t * t * (3 - 2 * t); dense.push(a.map((v, j) => v + (b[j] - v) * (j === 0 ? t : e))); } }
    dense.push(S[S.length - 1]);
    for (const [t, w, df, db, n] of dense) {
      const r = [];
      for (let j = 0; j <= nA; j++) {
        const a = (j / nA) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const x = w * spow(c, 2 / n), b = (s >= 0 ? db : df) * spow(s, 2 / n);
        const p = at(t, x, b); r.push(pos.length / 3); pos.push(p.x, p.y, p.z);
        // a subtle centre seam / zip down the front (s ≈ −1), darker side seams
        const front = s < -0.985 && t > 0.02 && t < 0.58, side = Math.abs(c) > 0.995;
        colA.push(...(front ? C.zip : side ? C.seam : C.suit));
      }
      rings.push(r);
    }
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < nA; j++) { const a = rings[i][j], b2 = rings[i][j + 1], c2 = rings[i + 1][j], d = rings[i + 1][j + 1]; idx.push(a, c2, b2, b2, c2, d); }
    const bot = at(S[0][0] - 0.01, 0, 0); const bi = pos.length / 3; pos.push(bot.x, bot.y, bot.z); colA.push(...C.suit);
    for (let j = 0; j < nA; j++) idx.push(bi, rings[0][j], rings[0][j + 1]);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3)); tg.setIndex(idx); tg.computeVertexNormals();
    BK.add('s', tg, { keepColor: true });
    // frame matrix helper: place a primitive in the torso frame at (t, x, b) with an extra local rotation
    const fm = (t, x, b, rx = 0, ry = 0, rz = 0) => { const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, U, B)); q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz))); return new THREE.Matrix4().compose(at(t, x, b), q, V(1, 1, 1)); };
    // collar (flight-suit stand-up collar, slightly open)
    const collar = new THREE.TorusGeometry(0.062, 0.016, 8, 24, Math.PI * 1.7); collar.rotateX(Math.PI / 2); collar.rotateY(Math.PI / 2 + Math.PI * 0.15); collar.scale(1, 1.4, 0.95);
    BK.add('s', collar, { matrix: fm(0.585, 0, 0.005), color: 0x232c3e });
    // chest pockets (zipped, angled) + generic gold wings badge + blank name tape; sleeve pen pocket lives on the arm
    for (const s of [-1, 1]) BK.add('s', RBG(0.085, 0.10, 0.012, 2, 0.004), { matrix: fm(0.39, s * 0.085, -0.112, -0.12, s * 0.28, 0), color: 0x232c3e });
    for (const s of [-1, 1]) BK.add('s', new THREE.BoxGeometry(0.07, 0.004, 0.004), { matrix: fm(0.432, s * 0.085, -0.121, -0.12, s * 0.28, 0), color: 0x6a6e75 });
    BK.add('s', new THREE.BoxGeometry(0.08, 0.022, 0.004), { matrix: fm(0.47, -0.075, -0.104, -0.3, -0.25, 0), color: 0x1a1b1e });
    BK.add('s', new THREE.BoxGeometry(0.055, 0.008, 0.003), { matrix: fm(0.471, -0.075, -0.107, -0.3, -0.25, 0), color: 0xc8a45c });
    // 4-point harness: shoulder straps over the shoulders down to the buckle, lap belt, buckle
    for (const s of [-1, 1]) {
      BK.add('s', new THREE.BoxGeometry(0.042, 0.42, 0.006), { matrix: fm(0.31, s * 0.072, -0.113, -0.08, 0, s * 0.09), color: 0x232427 });
      BK.add('s', new THREE.BoxGeometry(0.15, 0.042, 0.006), { matrix: fm(0.045, s * 0.10, -0.121, 0, s * 0.35, 0), color: 0x232427 });
    }
    BK.add('s', new THREE.CylinderGeometry(0.036, 0.036, 0.016, 20), { matrix: fm(0.06, 0, -0.128, Math.PI / 2, 0, 0), color: 0xa8adb4 });
    // shoulder epaulettes (suit detail)
    for (const s of [-1, 1]) BK.add('s', new THREE.BoxGeometry(0.03, 0.006, 0.11), { matrix: fm(0.505, s * 0.13, 0.0, 0, 0, s * -0.35), color: 0x232c3e });
  }
  const body = new THREE.Group(); body.name = 'heli:pilotBody'; g.add(body);
  for (const m of BK.build({ s: M.suit }, body, { castShadow: true, receiveShadow: true })) m.name = 'heli:pilotTorso';
  /* ---------------- limbs: one CPU-skinned mesh (2 arms, 2 legs; 3 bones each) */
  const limbs = [];
  const LP = [], LN = [], LC = [], LB0 = [], LB1 = [], LW = [], LI = [];
  function addLimb(spec) {
    const base = LP.length / 3, limb = { spec, bones: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()], n: null, start: base };
    const { L1, L2, radii, segs = seg, color } = spec, Ls = L1 + L2;
    const rOf = (y) => { for (let i = 0; i < radii.length - 1; i++) if (y <= radii[i + 1][0]) { const [y0, r0] = radii[i], [y1, r1] = radii[i + 1]; return r0 + (r1 - r0) * clamp((y - y0) / (y1 - y0), 0, 1); } return radii[radii.length - 1][1]; };
    const y0 = radii[0][0], y1 = radii[radii.length - 1][0];
    const ys = []; for (let y = y0; y < y1; y += 0.02) ys.push(y); ys.push(y1);
    const ring0 = LP.length / 3;
    for (const y of ys) {
      const r = rOf(y);
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r * (spec.flat || 1);
        LP.push(x, y, z); LN.push(Math.cos(a), 0, Math.sin(a));
        LC.push(...(color ? color(y, a) : C.suit));
        const w = sstep(L1 - 0.05, L1 + 0.05, y);
        LB0.push(0); LB1.push(1); LW.push(w);
      }
    }
    const R = segs + 1;
    for (let i = 0; i < ys.length - 1; i++) for (let j = 0; j < segs; j++) { const a = ring0 + i * R + j, b = a + 1, c = a + R, d = c + 1; LI.push(a, c, b, b, c, d); }
    // root cap (inside the torso / hip; a simple fan)
    const ci = LP.length / 3; LP.push(0, y0 - 0.01, 0); LN.push(0, -1, 0); LC.push(...C.suit); LB0.push(0); LB1.push(0); LW.push(0);
    for (let j = 0; j < segs; j++) LI.push(ci, ring0 + j + 1, ring0 + j);
    // extras (hand / boot / pockets) with a fixed bone, from ordinary geometries in bind space
    for (const e of spec.extras || []) {
      const eg = e.geo.index ? e.geo : e.geo; if (!eg.attributes.normal) eg.computeVertexNormals();
      const p = eg.attributes.position, nn = eg.attributes.normal, off = LP.length / 3;
      for (let i = 0; i < p.count; i++) { LP.push(p.getX(i), p.getY(i), p.getZ(i)); LN.push(nn.getX(i), nn.getY(i), nn.getZ(i)); LC.push(...e.color); LB0.push(e.bone); LB1.push(e.bone); LW.push(0); }
      if (eg.index) for (let i = 0; i < eg.index.count; i++) LI.push(off + eg.index.getX(i)); else for (let i = 0; i < p.count; i++) LI.push(off + i);
    }
    limb.end = LP.length / 3; limbs.push(limb);
    return limb;
  }
  // arm bind: shoulder at y=0, elbow y=L1, wrist y=L1+L2; fist beyond (palm toward −x for the right hand)
  const fist = (s) => {
    const parts = [];
    const pal = RBG(0.05, 0.085, 0.082, 3, 0.022); pal.translate(0, 0.30 + 0.27 + 0.045, -0.005); parts.push(pal);
    const fing = RBG(0.046, 0.075, 0.03, 3, 0.013); fing.rotateX(0.0); fing.translate(-s * 0.026, 0.30 + 0.27 + 0.05, -0.012); parts.push(fing);
    const th = new THREE.CapsuleGeometry(0.012, 0.035, 4, 8); th.rotateZ(s * 0.6); th.translate(s * 0.01, 0.30 + 0.27 + 0.03, -0.045); parts.push(th);
    const cuff = new THREE.CylinderGeometry(0.037, 0.034, 0.03, 14); cuff.translate(0, 0.30 + 0.27 - 0.005, 0); parts.push(cuff);
    return parts.map((geo) => ({ geo, bone: 2, color: C.glove }));
  };
  const armSpec = (s) => ({ L1: 0.30, L2: 0.27, radii: [[-0.02, 0.05], [0.03, 0.058], [0.15, 0.052], [0.29, 0.045], [0.33, 0.044], [0.45, 0.042], [0.55, 0.038], [0.565, 0.036]],
    color: (y) => (y > 0.53 ? C.suitD : C.suit),
    extras: [...fist(s), { geo: (() => { const pk = RBG(0.012, 0.10, 0.05, 2, 0.004); pk.translate(s * 0.053, 0.13, -0.01); return pk; })(), bone: 0, color: C.suitD }] });
  const legSpec = (s) => ({ L1: 0.44, L2: 0.42, radii: [[-0.03, 0.07], [0.02, 0.088], [0.2, 0.08], [0.42, 0.064], [0.47, 0.062], [0.6, 0.058], [0.75, 0.050], [0.80, 0.056], [0.86, 0.054]],
    color: (y) => (y > 0.76 ? C.boot : C.suit),
    extras: [
      { geo: (() => { const b = RBG(0.10, 0.11, 0.27, 3, 0.04); b.translate(0, 0.86 - 0.03, -0.075); return b; })(), bone: 2, color: C.boot },
      { geo: (() => { const b = RBG(0.105, 0.02, 0.27, 2, 0.008); b.translate(0, 0.86 - 0.085, -0.075); return b; })(), bone: 2, color: lin(0x2a2a2a) },
      { geo: (() => { const pk = RBG(0.016, 0.13, 0.15, 2, 0.006); pk.translate(-s * 0.082, 0.22, 0.0); return pk; })(), bone: 0, color: C.suitD },
      ...(s > 0 ? [{ geo: (() => { const kb = RBG(0.15, 0.22, 0.012, 2, 0.004); kb.translate(0, 0.27, -0.088); return kb; })(), bone: 0, color: C.board },
        { geo: (() => { const pp = new THREE.PlaneGeometry(0.13, 0.19); pp.rotateY(Math.PI); pp.translate(0, 0.27, -0.0955); return pp; })(), bone: 0, color: C.paper }] : []),
    ] });
  const arms = [addLimb(armSpec(1)), addLimb(armSpec(-1))];           // [0] right → cyclic, [1] left → collective
  const legs = [addLimb(legSpec(-1)), addLimb(legSpec(1))];           // [0] left foot, [1] right foot
  arms.forEach((a, i) => { a.root = at(0.475, (i === 0 ? 1 : -1) * 0.168, 0.0); a.side = i === 0 ? 1 : -1; });
  legs.forEach((l, i) => { l.root = at(0.0, (i === 0 ? -1 : 1) * 0.092, -0.025); l.side = i === 0 ? -1 : 1; });
  const lg = new THREE.BufferGeometry();
  const posA = new THREE.Float32BufferAttribute(new Float32Array(LP.length), 3), nrmA = new THREE.Float32BufferAttribute(new Float32Array(LN.length), 3);
  posA.setUsage(THREE.DynamicDrawUsage); nrmA.setUsage(THREE.DynamicDrawUsage);
  lg.setAttribute('position', posA); lg.setAttribute('normal', nrmA); lg.setAttribute('color', new THREE.Float32BufferAttribute(LC, 3)); lg.setIndex(LI);
  const BP = new Float32Array(LP), BN = new Float32Array(LN), B0 = new Uint8Array(LB0), B1 = new Uint8Array(LB1), W = new Float32Array(LW);
  const limbMesh = new THREE.Mesh(lg, M.suit); limbMesh.name = 'heli:pilotLimbs'; limbMesh.castShadow = true; limbMesh.receiveShadow = true;
  lg.boundingSphere = new THREE.Sphere(P.clone().add(V(0, 0.2, -0.4)), 1.3); limbMesh.frustumCulled = true;
  g.add(limbMesh);
  // bone frames: y = segment direction, x = bend axis (shared across the joint → no candy-wrapper twist)
  const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3(), tD = new THREE.Vector3(), mR = new THREE.Matrix4(), mT = new THREE.Matrix4();
  function boneM(out, joint, xAxis, yAxis, bindY) {
    tC.crossVectors(xAxis, yAxis).normalize();
    mR.makeBasis(xAxis, yAxis, tC); mR.setPosition(joint);
    mT.makeTranslation(0, -bindY, 0);
    return out.multiplyMatrices(mR, mT);
  }
  function solve(limb, target, pole, endFrame) {
    const { L1, L2 } = limb.spec, S0 = limb.root;
    const d = tA.subVectors(target, S0); let D = d.length();
    const Lt = L1 + L2; if (D > Lt * 0.998) { d.multiplyScalar(Lt * 0.998 / D); D = Lt * 0.998; } if (D < Math.abs(L1 - L2) + 0.02) { d.multiplyScalar((Math.abs(L1 - L2) + 0.02) / D); D = Math.abs(L1 - L2) + 0.02; }
    const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const dir = d.clone().normalize();
    const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const mid = S0.clone().addScaledVector(dir, a).addScaledVector(perp, h);
    const end = S0.clone().add(d);
    const y0 = tB.subVectors(mid, S0).normalize().clone(), y1 = tB.subVectors(end, mid).normalize().clone();
    let n = tD.crossVectors(y0, y1); if (n.lengthSq() < 1e-6) n.copy(limb.n || X); n.normalize(); if (limb.side < 0 && limb.spec.L1 < 0.4) {} // same convention both sides
    limb.n = n.clone();
    const x0 = n.clone(), x1 = n.clone();
    // keep the bend axis pointing to the limb's own +x convention (avoid flipping when the pole flips)
    boneM(limb.bones[0], S0, x0, y0, 0);
    boneM(limb.bones[1], mid, x1, y1, L1);
    if (endFrame) { boneM(limb.bones[2], end, endFrame.x, endFrame.y, L1 + L2); }
    else boneM(limb.bones[2], end, x1, y1, L1 + L2);
    limb.mid = mid; limb.endP = end;
  }
  function skin() {
    const p = posA.array, nn = nrmA.array;
    for (const L of limbs) {
      const E = L.bones.map((m) => m.elements);
      for (let i = L.start; i < L.end; i++) {
        const k = i * 3, x = BP[k], y = BP[k + 1], z = BP[k + 2], nx = BN[k], ny = BN[k + 1], nz = BN[k + 2];
        const w = W[i], a = E[B0[i]], b = E[B1[i]], w0 = 1 - w;
        p[k] = w0 * (a[0] * x + a[4] * y + a[8] * z + a[12]) + w * (b[0] * x + b[4] * y + b[8] * z + b[12]);
        p[k + 1] = w0 * (a[1] * x + a[5] * y + a[9] * z + a[13]) + w * (b[1] * x + b[5] * y + b[9] * z + b[13]);
        p[k + 2] = w0 * (a[2] * x + a[6] * y + a[10] * z + a[14]) + w * (b[2] * x + b[6] * y + b[10] * z + b[14]);
        let ox = w0 * (a[0] * nx + a[4] * ny + a[8] * nz) + w * (b[0] * nx + b[4] * ny + b[8] * nz);
        let oy = w0 * (a[1] * nx + a[5] * ny + a[9] * nz) + w * (b[1] * nx + b[5] * ny + b[9] * nz);
        let oz = w0 * (a[2] * nx + a[6] * ny + a[10] * nz) + w * (b[2] * nx + b[6] * ny + b[10] * nz);
        const l = Math.hypot(ox, oy, oz) || 1; nn[k] = ox / l; nn[k + 1] = oy / l; nn[k + 2] = oz / l;
      }
    }
    posA.needsUpdate = true; nrmA.needsUpdate = true;
  }
  /* ---------------- head (animated group): skin, hair, headset, sunglasses */
  const neckBase = at(0.57, 0, 0.0);
  const head = new THREE.Group(); head.name = 'heli:pilotHead'; head.position.copy(neckBase); g.add(head);
  {
    const HK = new Kit(THREE);
    const HC = V(0, 0.128, -0.04); // head centre relative to the neck pivot (head carried slightly forward)
    // neck
    const neck = new THREE.CylinderGeometry(0.043, 0.05, 0.12, seg); HK.add('k', neck, { pos: [0, 0.035, -0.018], rot: [-0.25, 0, 0], colorFn: () => C.skin });
    // face: a deformed sphere (jaw, cheekbones, brow, nose, lips, chin) + vertex colours (lips, brows)
    const hs = new THREE.SphereGeometry(1, hi ? 40 : 24, hi ? 30 : 18);
    const hp = hs.attributes.position;
    const gs = (x, y, sx, sy) => Math.exp(-(x * x) / (sx * sx) - (y * y) / (sy * sy));
    for (let i = 0; i < hp.count; i++) {
      const dx = hp.getX(i), dy = hp.getY(i), dz = hp.getZ(i);
      let x = dx * 0.075, y = dy * 0.102, z = dz * 0.093;
      if (dz > 0) z *= 1.07;                                  // fuller back of the skull
      const jaw = sstep(-0.2, -0.95, dy); x *= 1 - 0.24 * jaw; // tapering jaw
      if (dy > 0.3) x *= 1 - 0.06 * (dy - 0.3);                 // slightly narrower crown
      const fr = sstep(-0.15, -0.75, dz);                        // front-facing weight
      if (fr > 0) {
        z *= 1 - 0.10 * fr * (1 - jaw * 0.5);                    // flatter face plane
        z *= 1 + 0.13 * fr * sstep(0.05, 0.7, dy);              // fuller, more upright forehead
        z *= 1 - 0.16 * fr * sstep(-0.3, -0.95, dy);            // lower face sits back (no muzzle)
        let dzf = 0;
        const ys = (y + 0.045) / 0.06;                           // 0 at the nose tip, 1 at the bridge
        if (ys > -0.25 && ys < 1.1) dzf -= (0.003 + 0.012 * clamp(1 - ys, 0, 1)) * Math.exp(-(x * x) / Math.pow(0.013 + 0.007 * clamp(1 - ys, 0, 1), 2)) * sstep(-0.25, 0.05, ys);
        dzf -= 0.006 * gs(x, y - 0.034, 0.05, 0.010);            // brow ridge
        for (const s of [-1, 1]) { dzf += 0.007 * gs(x - s * 0.029, y - 0.012, 0.016, 0.012); dzf -= 0.005 * gs(x - s * 0.047, y + 0.014, 0.018, 0.016); }
        dzf -= 0.0045 * gs(x, y + 0.064, 0.021, 0.007);          // upper lip
        dzf -= 0.0035 * gs(x, y + 0.074, 0.018, 0.006);          // lower lip
        dzf -= 0.008 * gs(x, y + 0.095, 0.022, 0.013);           // chin
        z += dzf * fr;
      }
      hp.setXYZ(i, x, y, z);
    }
    hs.computeVertexNormals();
    HK.add('k', hs, { pos: [HC.x, HC.y, HC.z], colorFn: (x, y, z) => {
      const lx = x - HC.x, ly = y - HC.y, lz = z - HC.z;
      if (lz < -0.06 && Math.abs(lx) < 0.022 && ly < -0.058 && ly > -0.08) return C.lip;
      if (lz < -0.07 && Math.abs(Math.abs(lx) - 0.03) < 0.018 && ly > 0.03 && ly < 0.042) return C.brow;
      if (lz < -0.05 && Math.abs(Math.abs(lx) - 0.045) < 0.02 && ly > -0.03 && ly < 0.0) return C.skin.map((v, k) => v * (k === 0 ? 1.04 : 0.97));
      return C.skin;
    } });
    // ears (mostly under the cups)
    for (const s of [-1, 1]) { const e = new THREE.SphereGeometry(0.022, 10, 8); e.scale(0.4, 1.2, 0.8); HK.add('k', e, { pos: [HC.x + s * 0.074, HC.y - 0.005, HC.z + 0.008], colorFn: () => C.skin }); }
    // hair: shell over the skull above a hairline (forehead → temples → nape), fine strands via colour, low bun
    const hh = new THREE.SphereGeometry(1, hi ? 36 : 22, hi ? 26 : 16);
    const hpp = hh.attributes.position, keep = [];
    for (let i = 0; i < hpp.count; i++) {
      const dx = hpp.getX(i), dy = hpp.getY(i), dz = hpp.getZ(i);
      let x = dx * 0.078, y = dy * 0.108 + 0.004, z = dz * 0.099;
      if (dz > 0) z *= 1.07; if (dy > 0.3) x *= 1 - 0.05 * (dy - 0.3);
      hpp.setXYZ(i, x, y, z);
      const hl = -0.60 + 1.22 * sstep(-0.3, 0.95, -dz) + 0.08 * dx; // hairline height (unit-sphere y): forehead → temples → nape
      if (dy < hl) { const k = clamp((hl - dy) / 0.12, 0, 1); hpp.setXYZ(i, x * (1 - 0.14 * k), y * (1 - 0.14 * k) - 0.004 * k, z * (1 - 0.14 * k)); } // tuck under the skin → smooth hairline
      keep.push(true);
    }
    const hidx = hh.index, kept = [];
    for (let i = 0; i < hidx.count; i += 3) { const a = hidx.getX(i), b = hidx.getX(i + 1), c2 = hidx.getX(i + 2); if (keep[a] && keep[b] && keep[c2]) kept.push(a, b, c2); }
    hh.setIndex(kept); hh.computeVertexNormals();
    HK.add('h', hh, { pos: [HC.x, HC.y, HC.z], colorFn: (x, y, z) => { const a = Math.atan2(x - HC.x, z - HC.z); const k = 0.5 + 0.5 * Math.sin(a * 46 + Math.sin(a * 7) * 2); return C.hair.map((v, j) => v + (C.hairHi[j] - v) * k * 0.45); } });
    const bun = new THREE.SphereGeometry(0.036, 16, 12); bun.scale(1.2, 0.95, 0.9);
    HK.add('h', bun, { pos: [HC.x, HC.y - 0.052, HC.z + 0.108], colorFn: (x, y) => C.hair.map((v, j) => v + (C.hairHi[j] - v) * (0.5 + 0.5 * Math.sin(y * 300)) * 0.4) });
    HK.add('d', new THREE.TorusGeometry(0.022, 0.005, 6, 16), { pos: [HC.x, HC.y - 0.045, HC.z + 0.085], rot: [0.5, 0, 0], colorFn: () => C.dark });
    // headset: padded band over the head, ear cups with cushions, boom mic to the left of the mouth, cord
    const band = new THREE.TorusGeometry(0.114, 0.012, 8, 28, Math.PI); band.scale(0.84, 1, 1.6);
    HK.add('d', band, { pos: [HC.x, HC.y - 0.004, HC.z + 0.004], colorFn: () => C.dark });
    const pad = new THREE.TorusGeometry(0.113, 0.016, 6, 20, Math.PI * 0.5); pad.scale(0.84, 1, 1.3);
    HK.add('d', pad, { pos: [HC.x, HC.y - 0.004, HC.z + 0.004], rot: [0, 0, Math.PI * 0.25], colorFn: () => C.cush });
    for (const s of [-1, 1]) {
      const cup = new THREE.CylinderGeometry(0.046, 0.05, 0.036, 22); cup.rotateZ(Math.PI / 2);
      HK.add('d', cup, { pos: [HC.x + s * 0.098, HC.y - 0.012, HC.z + 0.006], scale: [1, 1.12, 1], colorFn: () => C.cup });
      const cu = new THREE.TorusGeometry(0.04, 0.012, 8, 20); cu.rotateY(Math.PI / 2);
      HK.add('d', cu, { pos: [HC.x + s * 0.08, HC.y - 0.012, HC.z + 0.006], scale: [1, 1.12, 1], colorFn: () => C.cush });
      HK.add('d', new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), { pos: [HC.x + s * 0.104, HC.y + 0.04, HC.z + 0.006], colorFn: () => C.zip });
    }
    const boom = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.118, -0.03, 0.0), V(-0.11, -0.065, -0.05), V(-0.07, -0.078, -0.09), V(-0.028, -0.072, -0.102)]), 14, 0.0045, 6, false);
    HK.add('d', boom, { pos: [HC.x, HC.y, HC.z], colorFn: () => C.dark });
    const mic = new THREE.SphereGeometry(0.013, 10, 8); mic.scale(1.3, 1, 1);
    HK.add('d', mic, { pos: [HC.x - 0.024, HC.y - 0.072, HC.z - 0.104], colorFn: () => C.cush });
    HK.add('d', new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.10, -0.04, 0.02), V(0.10, -0.12, 0.05), V(0.12, -0.24, 0.06), V(0.17, -0.40, 0.03)]), 12, 0.004, 5, false), { pos: [HC.x, HC.y, HC.z], colorFn: () => C.dark });
    // aviator sunglasses: gold wire frame (double bridge), temples to the ears
    const lensY = 0.008, lensZ = -0.096;
    const LK = new Kit(THREE);
    for (const s of [-1, 1]) {
      const l = new THREE.SphereGeometry(1, 18, 12); l.scale(0.027, 0.023, 0.007);
      const lp = l.attributes.position; for (let i = 0; i < lp.count; i++) { const xx = lp.getX(i), yy = lp.getY(i); const k = yy < 0 ? -yy / 0.023 : 0; lp.setX(i, xx * (1 - 0.18 * k) + s * 0.006 * k); lp.setY(i, yy * (yy < 0 ? 1.12 : 0.82) - (s * xx > 0 ? 0 : 0.003 * k)); } l.computeVertexNormals();
      LK.add('l', l, { pos: [HC.x + s * 0.031, HC.y + lensY, HC.z + lensZ + 0.002], rot: [0.05, s * 0.18, 0] });
      const rim = new THREE.TorusGeometry(1, 0.06, 5, 26); rim.scale(0.027, 0.021, 0.025); { const rp = rim.attributes.position; for (let i = 0; i < rp.count; i++) { const xx = rp.getX(i), yy = rp.getY(i); const k = yy < 0 ? -yy / 0.021 : 0; rp.setX(i, xx * (1 - 0.18 * k) + s * 0.006 * k); rp.setY(i, yy * (yy < 0 ? 1.23 : 0.9)); } rim.computeVertexNormals(); }
      HK.add('d', rim, { pos: [HC.x + s * 0.031, HC.y + lensY, HC.z + lensZ + 0.001], rot: [0.05, s * 0.18, 0], colorFn: () => C.frame });
      HK.add('d', new THREE.CylinderGeometry(0.0018, 0.0018, 0.095, 5), { pos: [HC.x + s * 0.066, HC.y + lensY + 0.012, HC.z - 0.045], rot: [Math.PI / 2, 0, 0], colorFn: () => C.frame });
    }
    HK.add('d', new THREE.CylinderGeometry(0.0016, 0.0016, 0.022, 5), { pos: [HC.x, HC.y + lensY + 0.016, HC.z + lensZ - 0.001], rot: [0, 0, Math.PI / 2], colorFn: () => C.frame });
    HK.add('d', new THREE.CylinderGeometry(0.0016, 0.0016, 0.016, 5), { pos: [HC.x, HC.y + lensY + 0.004, HC.z + lensZ - 0.002], rot: [0, 0, Math.PI / 2], colorFn: () => C.frame });
    HK.build({ k: M.skin, d: M.dark, h: M.hair }, head, { castShadow: true, autoUpdate: false });
    LK.build({ l: M.lens }, head, { autoUpdate: false });
    head.userData.center = HC;
  }
  /* ---------------- pose + animation */
  const wp = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const armPole = [V(0.75, -1, 0.45).normalize(), V(-0.75, -1, 0.45).normalize()];
  const legPole = [V(-0.12, 1, -0.25).normalize(), V(0.12, 1, -0.25).normalize()];
  const footFrame = { x: new THREE.Vector3(), y: new THREE.Vector3() };
  const restTargets = { r: at(0.08, 0.06, -0.30), l: at(0.06, -0.20, -0.25), fl: V(SX - 0.12, (o.floor || 0.68) + 0.10, SZ - 0.62), fr: V(SX + 0.12, (o.floor || 0.68) + 0.10, SZ - 0.62) };
  const st = { t: Math.random() * 10, look: 0, lookT: 2, glance: 0, glanceT: 6, br: 0 };
  function grip(obj, local) { obj.updateMatrix(); return wp.copy(local).applyMatrix4(obj.matrix); }
  let lastKey = '';
  function pose() {
    // skip the IK + skinning when no control moved (parked / steady flight)
    const key = [cyc, col, ...(pedals || [])].map((c) => (c ? c.rotation.x.toFixed(4) + c.rotation.z.toFixed(4) : '')).join('|');
    if (key === lastKey) return; lastKey = key;
    // right hand → cyclic grip, left hand → collective grip (wrist a fist-length short of the grip point)
    for (let i = 0; i < 2; i++) {
      const A = arms[i], ctl = i === 0 ? cyc : col;
      let tgt;
      if (ctl && ctl.userData.grip) tgt = grip(ctl, ctl.userData.grip).clone(); else tgt = (i === 0 ? restTargets.r : restTargets.l).clone();
      const back = tgt.clone().sub(A.root).normalize();
      tgt.addScaledVector(back, -0.045);
      if (i === 1) tgt.y += 0.012;
      solve(A, tgt, armPole[i]);
    }
    // feet → pedal pads (ankle above / behind the ball of the foot), foot pointing at the pad
    for (let i = 0; i < 2; i++) {
      const Lg = legs[i], ped = pedals && pedals[i];
      let pad;
      if (ped && ped.userData.pad) pad = grip(ped, ped.userData.pad).clone(); else pad = (i === 0 ? restTargets.fl : restTargets.fr).clone();
      const ank = pad.clone().add(V(0, 0.085, 0.11));
      const f = pad.clone().sub(ank).normalize();
      footFrame.y.set(0, 1, 0).addScaledVector(f, -f.y).normalize();     // up, orthogonal to the foot direction
      footFrame.y.addScaledVector(f, 0).normalize();
      // bind: boot extends toward −z, ankle up = +y → world: −z → f, +y → up
      const zW = f.clone().negate(); footFrame.x.crossVectors(footFrame.y, zW).normalize();
      footFrame.y.crossVectors(zW, footFrame.x).normalize();
      solve(Lg, ank, legPole[i], footFrame);
    }
    skin();
  }
  function update(dt, opt = {}) {
    dt = Math.min(0.1, dt || 0); st.t += dt;
    pose();
    // breathing: a slow, very small chest rise
    const br = Math.sin(st.t * 1.6) * 0.5 + 0.5;
    body.scale.set(1, 1 + br * 0.004, 1 + br * 0.008); body.position.set(0, -P.y * br * 0.004, -P.z * br * 0.008);
    // head: scan every few seconds, glance down at the panel now and then, look toward the sight (lookYaw, + = right)
    st.lookT -= dt; st.glanceT -= dt;
    if (st.lookT <= 0) { st.lookT = 2.5 + Math.random() * 4; st.look = (Math.random() - 0.5) * 1.0; }
    if (st.glanceT <= 0) { st.glanceT = 7 + Math.random() * 6; st.glance = 1.6; }
    st.glance = Math.max(0, st.glance - dt);
    const want = isFinite(opt.lookYaw) ? clamp(opt.lookYaw, -1.1, 1.1) : st.look * (st.glance > 0 ? 0.2 : 1);
    head.rotation.order = 'YXZ';
    head.rotation.y += (-want - head.rotation.y) * (1 - Math.exp(-dt * 2.4));
    const pitchWant = (st.glance > 0 ? -0.34 : -0.08) + Math.sin(st.t * 0.7) * 0.02 + (opt.talk ? Math.sin(st.t * 7.5) * 0.015 : 0);
    head.rotation.x += (pitchWant - head.rotation.x) * (1 - Math.exp(-dt * 3));
    head.rotation.z = Math.sin(st.t * 0.43) * 0.02 - head.rotation.y * 0.06;
  }
  update(0.016);
  g.traverse((x) => { x.userData.heliPilot = true; });
  return {
    group: g, head, update, M, limbs: limbMesh,
    bubbleAnchor: (v) => { head.updateWorldMatrix(true, false); return v.set(0, 0.36, 0).applyMatrix4(head.matrixWorld); },
  };
}

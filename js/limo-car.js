// limo-car.js — V10 LIMO: the exterior stretch limousine (parked at the curb in the 'home' world) + the hood seen
// through the windshield in the 'limo' world. Local frame: length along x (front = +x), y up, curb side = +z,
// ground at y = 0, centre of the car at x = 0, z = 0. 8.8 m × 2.0 m × 1.5 m, two axles, 6 doors (3 per side).
// ~11 draw calls. No side effects on import.
import { Merger } from './limo-util.js';
import { plate as plateTex, grille as grilleTex, cabinDoorway, cabinGlow } from './limo-tex.js';

export const CAR = { L: 8.8, W: 2.0, H: 1.5, wheelR: 0.36, axleF: 3.05, axleR: -3.0, belt: 0.95,
  door: { hinge: -0.65, len: 1.35, open: 1.1 } }; // rear passenger door: front edge (hinge) x, length, open angle (rad)

export function carMaterials(THREE, quality = 'high') {
  const hi = quality !== 'low';
  const paint = hi
    ? new THREE.MeshPhysicalMaterial({ color: 0x15171c, metalness: 0.75, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.7 })
    : new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.8, roughness: 0.2, envMapIntensity: 1.7 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, metalness: 1, roughness: 0.15, envMapIntensity: 1.6 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a0e13, metalness: 0.1, roughness: 0.12, transparent: true, opacity: 0.88, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.8, side: THREE.DoubleSide });
  // the lit cabin glows faintly through the tint (LED line, stars, seat backs): side-glass UVs are metres (ShapeGeometry)
  const glow = cabinGlow(THREE);
  if (glow && glow.isTexture) {
    glow.repeat.set(1 / 5.38, 1 / 0.41); glow.offset.set(3.3 / 5.38, -0.98 / 0.41);
    glass.emissiveMap = glow; glass.emissive = new THREE.Color(0xffffff); glass.emissiveIntensity = 0.55;
  }
  const doorway = new THREE.MeshStandardMaterial({ map: cabinDoorway(THREE), roughness: 0.7, emissive: 0xffffff, emissiveIntensity: 0.22 });
  doorway.emissiveMap = doorway.map;
  const tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.88, metalness: 0 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.55, metalness: 0.2 });
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e2, emissiveIntensity: 1.4, roughness: 0.3 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x400606, emissive: 0xff1622, emissiveIntensity: 1.6, roughness: 0.2 });
  const amber = new THREE.MeshStandardMaterial({ color: 0x402a06, emissive: 0xff9a1a, emissiveIntensity: 0.9, roughness: 0.2 });
  const plate = new THREE.MeshStandardMaterial({ map: plateTex(THREE), roughness: 0.45, metalness: 0.1 });
  const grille = new THREE.MeshStandardMaterial({ map: grilleTex(THREE), metalness: 0.9, roughness: 0.22 });
  return { paint, chrome, glass, tire, trim, head, tail, amber, plate, grille, doorway };
}

function bodyShape(THREE) {
  const s = new THREE.Shape();
  const { axleF, axleR } = CAR, ar = 0.45, ay = 0.36, by = 0.26;
  s.moveTo(-4.3, by);
  s.lineTo(axleR - ar, by);
  s.absarc(axleR, ay, ar, Math.PI + 0.27, -0.27, true);
  s.lineTo(axleF - ar, by);
  s.absarc(axleF, ay, ar, Math.PI + 0.27, -0.27, true);
  s.lineTo(4.22, by);
  s.quadraticCurveTo(4.38, by + 0.02, 4.4, 0.42);
  s.lineTo(4.4, 0.66);
  s.quadraticCurveTo(4.38, 0.8, 4.2, 0.84);
  s.lineTo(2.3, 0.93);                    // hood
  s.lineTo(-3.62, 0.93);                  // beltline / deck
  s.quadraticCurveTo(-4.2, 0.92, -4.34, 0.84); // trunk
  s.quadraticCurveTo(-4.42, 0.7, -4.4, 0.5);
  s.quadraticCurveTo(-4.4, 0.3, -4.3, by);
  return s;
}
function cabinShape(THREE) {
  const s = new THREE.Shape();
  s.moveTo(-3.6, 0.9);
  s.quadraticCurveTo(-3.3, 1.3, -2.95, 1.44);
  s.lineTo(1.3, 1.47);
  s.quadraticCurveTo(1.55, 1.46, 1.7, 1.38);
  s.lineTo(2.32, 0.9);
  s.lineTo(-3.6, 0.9);
  return s;
}

// wheel (tyre + rim with spokes) geometry pieces added to the merger at position p (z sign = side)
function addWheel(THREE, M, x, z) {
  const R = CAR.wheelR, side = Math.sign(z);
  const tire = new THREE.TorusGeometry(R - 0.09, 0.1, 10, 28);
  M.add('tire', tire, { pos: [x, R, z], rot: [0, 0, 0], scale: [1, 1, 2.2 / 2] });
  const wall = new THREE.CylinderGeometry(R - 0.03, R - 0.03, 0.2, 28, 1, true);
  M.add('tire', wall, { pos: [x, R, z], rot: [Math.PI / 2, 0, 0] });
  const zf = z + side * 0.095; // rim face
  M.add('chrome', new THREE.CylinderGeometry(R - 0.12, R - 0.12, 0.03, 28), { pos: [x, R, zf - side * 0.02], rot: [Math.PI / 2, 0, 0] });
  M.add('trim', new THREE.CylinderGeometry(R - 0.14, R - 0.14, 0.02, 28), { pos: [x, R, zf - side * 0.0], rot: [Math.PI / 2, 0, 0] });
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const len = R - 0.17;
    const g = new THREE.BoxGeometry(0.028, len, 0.024);
    M.add('chrome', g, { pos: [x + Math.cos(a) * len * 0.5, R + Math.sin(a) * len * 0.5, zf + side * 0.006], rot: [0, 0, a - Math.PI / 2] });
  }
  M.add('chrome', new THREE.CylinderGeometry(0.06, 0.07, 0.04, 16), { pos: [x, R, zf + side * 0.012], rot: [Math.PI / 2, 0, 0] });
  M.add('chrome', new THREE.TorusGeometry(R - 0.125, 0.012, 6, 32), { pos: [x, R, zf + side * 0.008] });
}

// plane with its UVs squeezed into [u0,u1]×[v0,v1] of an atlas
function atlasPlane(THREE, w, h, u0, u1, v0, v1) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i));
  return g;
}

// opts.openDoor: the curb-side (−z) rear passenger door stands open (lit cabin visible through the opening)
export function buildParkedCar(THREE, quality = 'high', opts = {}) {
  const mats = carMaterials(THREE, quality);
  const group = new THREE.Group(); group.name = 'limo:parked';
  const M = new Merger(THREE);
  const { W } = CAR;
  // lower body
  const bevel = 0.07;
  const body = new THREE.ExtrudeGeometry(bodyShape(THREE), { depth: W - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: 0.05, bevelSegments: 4, curveSegments: 18 });
  M.add('paint', body, { pos: [0, 0, -(W - 2 * bevel) / 2] });
  const cw = 1.78;
  const cab = new THREE.ExtrudeGeometry(cabinShape(THREE), { depth: cw - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 4, curveSegments: 14 });
  M.add('paint', cab, { pos: [0, 0, -(cw - 0.12) / 2] });
  // side glass (one strip per side) + pillars over it + chrome surround
  const zs = cw / 2 + 0.005;
  const win = new THREE.Shape();
  win.moveTo(-3.3, 0.98); win.lineTo(2.08, 0.98); win.lineTo(1.6, 1.36); win.lineTo(-2.92, 1.39); win.quadraticCurveTo(-3.2, 1.3, -3.3, 0.98);
  const winG = new THREE.ShapeGeometry(win, 12);
  for (const s of [1, -1]) {
    M.add('glass', winG, { pos: [0, 0, s * zs] });
    for (const px of [-2.05, -0.65, 0.75, 1.55]) M.add('paint', new THREE.BoxGeometry(0.11, 0.42, 0.012), { pos: [px, 1.18, s * (zs + 0.004)] });
    M.add('chrome', new THREE.BoxGeometry(5.4, 0.022, 0.02), { pos: [-0.62, 0.975, s * (zs + 0.008)] });
    M.add('chrome', new THREE.BoxGeometry(4.45, 0.018, 0.016), { pos: [-0.65, 1.395, s * (zs + 0.004)] });
    // door gaps (6 doors) + handles
    const zb = s * (W / 2 + 0.002);
    for (const gx of [2.15, 1.0, 0.75, -0.6, -0.65, -2.0, -2.05, -3.1]) M.add('trim', new THREE.BoxGeometry(0.008, 0.66, 0.012), { pos: [gx, 0.62, zb] });
    for (const hx of [1.12, -0.5, -1.95]) M.add('chrome', new THREE.BoxGeometry(0.2, 0.035, 0.03), { pos: [hx, 0.83, zb + s * 0.01] });
    // rocker chrome + body side moulding
    M.add('chrome', new THREE.BoxGeometry(6.1, 0.05, 0.03), { pos: [0.02, 0.31, s * (W / 2 + 0.01)] });
    M.add('chrome', new THREE.BoxGeometry(7.6, 0.014, 0.012), { pos: [0, 0.62, s * (W / 2 + 0.012)] });
    // side mirrors
    M.add('paint', new THREE.BoxGeometry(0.2, 0.13, 0.16), { pos: [1.95, 1.04, s * (cw / 2 + 0.16)] });
    M.add('chrome', new THREE.BoxGeometry(0.2, 0.02, 0.17), { pos: [1.95, 0.97, s * (cw / 2 + 0.16)] });
    // wheels
    addWheel(THREE, M, CAR.axleF, s * (W / 2 - 0.13));
    addWheel(THREE, M, CAR.axleR, s * (W / 2 - 0.13));
    // wheel-arch liners
    for (const ax of [CAR.axleF, CAR.axleR]) M.add('trim', new THREE.CylinderGeometry(0.44, 0.44, 0.3, 24, 1, true, Math.PI * 0.5 - 1.3, 2.6), { pos: [ax, 0.36, s * (W / 2 - 0.2)], rot: [Math.PI / 2, 0, 0] });
  }
  // windshield + rear window
  const ws = new THREE.PlaneGeometry(1.66, 0.76), rw = new THREE.PlaneGeometry(1.6, 0.8);
  // windshield leans back ~52°, rear window ~47°
  { const m = new THREE.Matrix4().makeRotationY(Math.PI / 2); const t = new THREE.Matrix4().makeRotationX(-0.9); const p = new THREE.Matrix4().makeTranslation(2.01, 1.17, 0); M.add('glass', ws, { matrix: p.multiply(m).multiply(t) }); }
  { const m = new THREE.Matrix4().makeRotationY(-Math.PI / 2); const t = new THREE.Matrix4().makeRotationX(-0.82); const p = new THREE.Matrix4().makeTranslation(-3.27, 1.17, 0); M.add('glass', rw, { matrix: p.multiply(m).multiply(t) }); }
  // front: grille, headlights, bumper, fog lamps, turn signals
  M.add('grille', new THREE.BoxGeometry(0.03, 0.26, 0.92), { pos: [4.41, 0.57, 0] });
  M.add('chrome', new THREE.BoxGeometry(0.05, 0.3, 0.035), { pos: [4.415, 0.57, 0.475] });
  M.add('chrome', new THREE.BoxGeometry(0.05, 0.3, 0.035), { pos: [4.415, 0.57, -0.475] });
  M.add('chrome', new THREE.BoxGeometry(0.05, 0.035, 0.98), { pos: [4.415, 0.715, 0] });
  M.add('chrome', new THREE.BoxGeometry(0.06, 0.06, 1.9), { pos: [4.42, 0.36, 0] });
  M.add('chrome', new THREE.BoxGeometry(0.06, 0.06, 1.9), { pos: [-4.4, 0.4, 0] });
  for (const s of [1, -1]) {
    M.add('head', new THREE.BoxGeometry(0.04, 0.11, 0.3), { pos: [4.39, 0.66, s * 0.72] });
    M.add('chrome', new THREE.BoxGeometry(0.035, 0.14, 0.34), { pos: [4.375, 0.66, s * 0.72] });
    M.add('head', new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), { pos: [4.41, 0.43, s * 0.7], rot: [0, 0, Math.PI / 2] });
    M.add('amber', new THREE.BoxGeometry(0.03, 0.04, 0.22), { pos: [4.395, 0.53, s * 0.75] });
    M.add('tail', new THREE.BoxGeometry(0.04, 0.2, 0.3), { pos: [-4.4, 0.66, s * 0.74] });
    M.add('tail', new THREE.BoxGeometry(0.03, 0.03, 0.5), { pos: [-4.39, 0.79, s * 0.5] });
    M.add('chrome', new THREE.CylinderGeometry(0.035, 0.035, 0.1, 12), { pos: [-4.42, 0.3, s * 0.55], rot: [0, 0, Math.PI / 2] }); // exhaust tips
  }
  M.add('chrome', new THREE.BoxGeometry(0.03, 0.03, 0.9), { pos: [-4.4, 0.79, 0] });
  M.add('plate', new THREE.BoxGeometry(0.012, 0.15, 0.3), { pos: [4.43, 0.42, 0] });
  M.add('plate', new THREE.BoxGeometry(0.012, 0.15, 0.3), { pos: [-4.43, 0.56, 0] });
  // plate UVs: the BoxGeometry face toward ±x shows the full texture (fine); roof antenna + chrome roof drip trim
  M.add('trim', new THREE.CylinderGeometry(0.004, 0.006, 0.2, 6), { pos: [-2.6, 1.53, 0], rot: [0, 0, 0.35] }); // short roof antenna (car ≤ 1.6 m tall)
  if (opts.openDoor) {
    const D = CAR.door, zb = -(W / 2);
    // the opening (lower part flush with the body side, upper part flush with the side glass): lit interior picture
    const yS = 0.34, yB = 0.95, yT = 1.37, vB = (yB - yS) / (yT - yS);
    const xc = D.hinge - D.len / 2, dw = D.len - 0.03;
    M.add('doorway', atlasPlane(THREE, dw, yB - yS, 0, 0.5, 0, vB), { pos: [xc, (yS + yB) / 2, zb - 0.022], rot: [0, Math.PI, 0] });
    M.add('doorway', atlasPlane(THREE, dw - 0.06, yT - yB, 0.02, 0.48, vB, 1), { pos: [xc, (yB + yT) / 2, -(cw / 2) - 0.012], rot: [0, Math.PI, 0] });
    // the open door panel, hinged at its front edge, swung out toward the curb
    const hinge = new THREE.Matrix4().makeTranslation(D.hinge, 0, zb).multiply(new THREE.Matrix4().makeRotationY(-D.open));
    const dA = (key, geo, p, rot) => { const m = hinge.clone().multiply(new THREE.Matrix4().makeTranslation(...p)); if (rot) m.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot))); M.add(key, geo, { matrix: m }); };
    const L = D.len;
    dA('paint', new THREE.BoxGeometry(L - 0.02, 0.62, 0.075), [-L / 2, 0.63, 0.04]);              // door skin
    dA('doorway', atlasPlane(THREE, L - 0.06, 0.6, 0.5, 1, 0.02, 0.62), [-L / 2, 0.63, 0.081]); // inner face (cream leather), facing into the car
    dA('chrome', new THREE.BoxGeometry(L - 0.04, 0.022, 0.02), [-L / 2, 0.955, -0.002]);             // belt chrome
    dA('chrome', new THREE.BoxGeometry(L - 0.04, 0.014, 0.012), [-L / 2, 0.62, -0.006]);            // side moulding
    dA('chrome', new THREE.BoxGeometry(0.2, 0.035, 0.03), [-L + 0.15, 0.83, -0.012]);               // handle
    dA('paint', new THREE.BoxGeometry(L - 0.04, 0.035, 0.05), [-L / 2, 1.385, 0.1]);                // window frame top
    dA('paint', new THREE.BoxGeometry(0.04, 0.43, 0.05), [-L + 0.04, 1.17, 0.1]);                   // rear post
    dA('trim', new THREE.BoxGeometry(L - 0.08, 0.02, 0.06), [-L / 2, 0.965, 0.09]);                 // window seal
    dA('glass', new THREE.BoxGeometry(L - 0.1, 0.4, 0.008), [-L / 2 - 0.02, 1.17, 0.1]);            // window (tinted)
  }
  const meshes = M.build(mats, group);
  for (const m of meshes) { m.castShadow = quality !== 'low'; m.receiveShadow = false; }
  // under-car contact shadow
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 2.3), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.012; sh.renderOrder = -1; sh.name = 'limo:contact';
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (c) {
    c.width = 128; c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 32, 4, 64, 32, 64); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.setTransform(1, 0, 0, 0.5, 0, 16); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    sh.material.alphaMap = new THREE.CanvasTexture(c); sh.material.color.set(0x000000);
  }
  group.add(sh);
  group.userData.mats = mats;
  return group;
}

// the hood + front fenders + wipers seen through the windshield from inside (limo world). Same frame as the
// parked car; caller offsets it vertically (cabin floor = car y 0.33).
export function buildHood(THREE, quality = 'high') {
  const mats = carMaterials(THREE, quality);
  const g = new THREE.Group(); g.name = 'limo:hood';
  const M = new Merger(THREE);
  const s = new THREE.Shape();
  s.moveTo(2.2, 0.5); s.lineTo(4.4, 0.5); s.lineTo(4.4, 0.66); s.quadraticCurveTo(4.38, 0.8, 4.2, 0.84); s.lineTo(2.2, 0.94); s.lineTo(2.2, 0.5);
  M.add('paint', new THREE.ExtrudeGeometry(s, { depth: CAR.W - 0.14, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelSegments: 4, curveSegments: 10 }), { pos: [0, 0, -(CAR.W - 0.14) / 2] });
  for (const z of [-0.35, 0.35]) M.add('trim', new THREE.BoxGeometry(0.02, 0.015, 0.6), { pos: [2.4, 0.965, z], rot: [0, 0.15, 0] });
  M.add('chrome', new THREE.BoxGeometry(0.05, 0.02, 0.02), { pos: [4.2, 0.86, 0] });
  M.build(mats, g);
  return g;
}

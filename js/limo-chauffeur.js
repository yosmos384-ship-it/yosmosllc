// limo-chauffeur.js — V10 LIMO: the chauffeur standing by the open rear door of the parked limousine (home world).
// Stylised, tasteful low-poly adult man (~1.82 m): black suit, white shirt + black tie, white gloves, peaked
// chauffeur cap with a gold band. Idle: breathing, a slow glance toward the visitor, a small welcoming nod.
// Local frame: feet on y = 0 at x = z = 0, facing +z. 3 draw calls (body · head skin · head cloth).
// No side effects on import.
import { Merger, taper, between, lathe } from './limo-util.js';

function faceTexture(THREE) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const skin = '#c99476';
  g.fillStyle = skin; g.fillRect(0, 0, 256, 128);
  // sphere UV: u = 0.25 faces +z (front) → the face is drawn around canvas x = 64
  const cx = 64, ey = 60;
  const sh = g.createRadialGradient(cx, 70, 6, cx, 70, 60); sh.addColorStop(0, 'rgba(255,225,205,0.16)'); sh.addColorStop(1, 'rgba(80,40,25,0.16)');
  g.fillStyle = sh; g.fillRect(0, 0, 128, 128);
  for (const s of [-1, 1]) {
    const ex = cx + s * 12;
    g.fillStyle = '#f2ece6'; g.beginPath(); g.ellipse(ex, ey, 5.2, 2.6, 0, 0, 7); g.fill();
    g.fillStyle = '#3b2617'; g.beginPath(); g.arc(ex + s * 0.3, ey + 0.2, 2.2, 0, 7); g.fill();
    g.fillStyle = '#0d0806'; g.beginPath(); g.arc(ex + s * 0.3, ey + 0.2, 1, 0, 7); g.fill();
    g.strokeStyle = '#2a1a10'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(ex - 5.5, ey - 0.5); g.quadraticCurveTo(ex, ey - 4, ex + 5.5, ey - 0.5); g.stroke();
    g.strokeStyle = '#3a2618'; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(ex - s * 6, ey - 7); g.lineTo(ex + s * 6, ey - 8.5); g.stroke();
  }
  // nose shadow, mouth (calm, friendly), short beard shadow along the jaw
  g.strokeStyle = 'rgba(120,70,50,0.45)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx + 2, ey + 4); g.quadraticCurveTo(cx + 4, ey + 13, cx, ey + 15); g.stroke();
  g.strokeStyle = '#8a4a3e'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 7, ey + 23); g.quadraticCurveTo(cx, ey + 26, cx + 7, ey + 23); g.stroke();
  const jaw = g.createRadialGradient(cx, ey + 30, 4, cx, ey + 30, 28); jaw.addColorStop(0, 'rgba(60,40,30,0.18)'); jaw.addColorStop(1, 'rgba(60,40,30,0)');
  g.fillStyle = jaw; g.fillRect(cx - 30, ey + 10, 60, 40);
  // short dark hair at the back / sides (under the cap)
  g.fillStyle = '#1e1510'; g.fillRect(128, 0, 128, 70); g.fillRect(0, 0, 256, 34);
  for (const x of [20, 108]) { g.fillRect(x - 6, 30, 12, 26); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildChauffeur(THREE, quality = 'high') {
  const root = new THREE.Group(); root.name = 'limo:chauffeur';
  const body = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.62, metalness: 0.04 });
  const SUIT = 0x16171b, SUIT2 = 0x0d0e11, SHIRT = 0xf4f2ee, TIE = 0x0a0a0c, GLOVE = 0xf6f4f0, SHOE = 0x070708, SKIN = 0xc99476, GOLD = 0xd8b060;
  const B = new Merger(THREE);
  const seg = (a, b, r0, r1, col, n = 12) => { const { matrix, len } = between(THREE, a, b); B.add('b', taper(THREE, r0, r1, len, n), { matrix, color: col }); };
  // legs (trousers with a slight crease taper) + shoes
  for (const s of [-1, 1]) {
    const hip = [s * 0.1, 0.95, 0], ankle = [s * 0.11, 0.07, 0.01];
    seg(ankle, hip, 0.06, 0.088, SUIT, 14);                                  // straight trouser leg (one piece)
    B.add('b', new THREE.CylinderGeometry(0.064, 0.066, 0.05, 14, 1, true), { pos: [s * 0.11, 0.1, 0.012], color: SUIT2 }); // hem
    B.add('b', new THREE.SphereGeometry(0.06, 12, 8), { pos: [s * 0.11, 0.05, 0.06], scale: [0.85, 0.6, 2.0], color: SHOE });
    B.add('b', new THREE.BoxGeometry(0.11, 0.025, 0.28), { pos: [s * 0.11, 0.0125, 0.05], color: SHOE });
  }
  B.add('b', new THREE.SphereGeometry(0.17, 16, 10), { pos: [0, 0.9, 0], scale: [1.15, 0.6, 0.72], color: SUIT }); // hips
  // jacket: torso shell (lathe, flattened front-to-back) with a flared hem, shoulders, lapels, shirt + tie
  const prof = [[0.001, 0.82], [0.2, 0.83], [0.205, 0.95], [0.19, 1.1], [0.2, 1.25], [0.215, 1.38], [0.2, 1.44], [0.12, 1.5], [0.06, 1.52]];
  B.add('b', lathe(THREE, prof, 24), { scale: [1, 1, 0.62], color: SUIT });
  for (const s of [-1, 1]) B.add('b', new THREE.SphereGeometry(0.062, 12, 8), { pos: [s * 0.19, 1.425, 0], scale: [1.0, 0.62, 0.9], color: SUIT }); // soft shoulder line
  // shirt V + tie + lapels (front, z ≈ 0.125)
  {
    const v = new THREE.Shape(); v.moveTo(-0.07, 1.5); v.lineTo(0.07, 1.5); v.lineTo(0, 1.22); v.lineTo(-0.07, 1.5);
    B.add('b', new THREE.ShapeGeometry(v), { pos: [0, 0, 0.128], color: SHIRT });
    B.add('b', new THREE.BoxGeometry(0.032, 0.24, 0.012), { pos: [0, 1.36, 0.132], color: TIE });
    B.add('b', new THREE.BoxGeometry(0.05, 0.03, 0.016), { pos: [0, 1.485, 0.13], color: TIE });
    for (const s of [-1, 1]) B.add('b', new THREE.BoxGeometry(0.045, 0.3, 0.012), { pos: [s * 0.055, 1.34, 0.13], rot: [0, 0, s * 0.32], color: SUIT2 });
    for (const y of [1.08, 1.16]) B.add('b', new THREE.SphereGeometry(0.009, 8, 6), { pos: [0, y, 0.128], color: SUIT2 });
    B.add('b', new THREE.BoxGeometry(0.07, 0.012, 0.01), { pos: [-0.12, 1.37, 0.124], rot: [0, 0.2, 0], color: SHIRT }); // pocket square
  }
  B.add('b', taper(THREE, 0.052, 0.05, 0.1, 12), { pos: [0, 1.48, 0], color: SKIN }); // neck
  B.add('b', new THREE.CylinderGeometry(0.056, 0.058, 0.035, 14, 1, true), { pos: [0, 1.51, 0], color: SHIRT }); // collar
  // left arm: relaxed at the side; right arm: bent, gloved hand forward-up (welcoming gesture toward the door)
  const shL = [0.215, 1.42, 0], elL = [0.25, 1.13, -0.02], wrL = [0.25, 0.86, 0.03];
  seg(elL, shL, 0.046, 0.058, SUIT); seg(wrL, elL, 0.04, 0.047, SUIT);
  B.add('b', new THREE.SphereGeometry(0.047, 10, 8), { pos: elL, color: SUIT });
  B.add('b', new THREE.SphereGeometry(0.042, 10, 8), { pos: [wrL[0], wrL[1] - 0.06, wrL[2]], scale: [0.8, 1.35, 1.0], color: GLOVE });
  const shR = [-0.215, 1.42, 0], elR = [-0.27, 1.15, 0.08], wrR = [-0.25, 1.06, 0.34];
  seg(elR, shR, 0.046, 0.058, SUIT); seg(wrR, elR, 0.04, 0.047, SUIT);
  B.add('b', new THREE.SphereGeometry(0.042, 10, 8), { pos: [wrR[0], wrR[1], wrR[2] + 0.05], scale: [0.85, 0.75, 1.5], color: GLOVE });
  B.add('b', new THREE.SphereGeometry(0.047, 10, 8), { pos: elR, color: SUIT });
  // cuff lines
  for (const w of [wrL, wrR]) B.add('b', new THREE.TorusGeometry(0.041, 0.006, 6, 16), { pos: w, rot: [Math.PI / 2, 0, 0], color: SHIRT });
  const torsoMeshes = B.build({ b: body }, root, { castShadow: quality !== 'low' });
  torsoMeshes.forEach((m) => { m.name = 'limo:chauffeur:body'; });

  // head (turns): skin with a painted face + cap / ears (vertex colours)
  const head = new THREE.Group(); head.position.set(0, 1.62, 0.005); root.add(head);
  const faceMap = faceTexture(THREE);
  const skinM = new THREE.MeshStandardMaterial({ color: faceMap ? 0xffffff : SKIN, map: faceMap, roughness: 0.6 });
  const sk = new THREE.SphereGeometry(0.1, 28, 18); // u = 0.25 faces +z: the painted face sits there
  const skull = new THREE.Mesh(sk, skinM); skull.scale.set(0.82, 1.08, 0.92); skull.castShadow = quality !== 'low'; skull.name = 'limo:chauffeur:face'; head.add(skull);
  const Hc = new Merger(THREE);
  Hc.add('c', new THREE.SphereGeometry(0.06, 14, 10), { pos: [0, -0.05, 0.018], scale: [1.05, 0.9, 0.92], color: SKIN }); // jaw
  Hc.add('c', new THREE.SphereGeometry(0.014, 8, 6), { pos: [0, -0.008, 0.09], scale: [0.9, 1.8, 1.1], color: SKIN }); // nose
  for (const s of [-1, 1]) Hc.add('c', new THREE.SphereGeometry(0.02, 8, 6), { pos: [s * 0.083, -0.005, -0.004], scale: [0.45, 1.15, 0.85], color: SKIN }); // ears
  // chauffeur cap: crown, band, visor, badge
  Hc.add('c', new THREE.CylinderGeometry(0.112, 0.094, 0.06, 28), { pos: [0, 0.088, -0.008], rot: [-0.08, 0, 0], color: SUIT2 });
  Hc.add('c', new THREE.CylinderGeometry(0.095, 0.095, 0.03, 28), { pos: [0, 0.052, -0.004], rot: [-0.08, 0, 0], color: SUIT });
  Hc.add('c', new THREE.CylinderGeometry(0.0962, 0.0962, 0.008, 28, 1, true), { pos: [0, 0.043, -0.003], rot: [-0.08, 0, 0], color: GOLD });
  Hc.add('c', new THREE.CylinderGeometry(0.075, 0.075, 0.006, 20, 1, false, -Math.PI / 2, Math.PI), { pos: [0, 0.038, 0.07], rot: [0.28, Math.PI, 0], scale: [1.05, 1, 0.7], color: 0x050506 });
  Hc.add('c', new THREE.SphereGeometry(0.012, 8, 6), { pos: [0, 0.07, 0.106], scale: [1, 1, 0.4], color: GOLD });
  const capM = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, metalness: 0.08 });
  Hc.build({ c: capM }, head, { castShadow: quality !== 'low' }).forEach((m) => { m.name = 'limo:chauffeur:cap'; });

  root.traverse((o) => { o.userData.floor = 'outside'; o.userData.room = 'exterior'; o.userData.limoChauffeur = true; });
  const st = { t: Math.random() * 6, nod: 0, look: 0 };
  const tmp = new THREE.Vector3(), inv = new THREE.Matrix4();
  return {
    group: root, head,
    nod(d = 0.9) { st.nod = d; },
    // idle: breathing, glance toward the visitor when close (≤ 9 m), a nod when they come within 3 m
    update(dt, camPos) {
      st.t += dt;
      const br = Math.sin(st.t * 1.3);
      for (const m of torsoMeshes) m.scale.set(1 + br * 0.004, 1, 1 + br * 0.008), m.updateMatrix();
      let yaw = Math.sin(st.t * 0.31) * 0.25, pitch = 0;
      if (camPos) {
        head.getWorldPosition(tmp); const d = tmp.distanceTo(camPos);
        if (d < 9) {
          inv.copy(root.matrixWorld).invert();
          const l = camPos.clone().applyMatrix4(inv).sub(head.position);
          yaw = Math.max(-1.0, Math.min(1.0, Math.atan2(l.x, l.z)));
          pitch = Math.max(-0.25, Math.min(0.25, -Math.atan2(l.y, Math.hypot(l.x, l.z))));
          if (d < 3 && !st.greeted) { st.greeted = true; st.nod = 0.9; }
          if (d > 6) st.greeted = false;
        }
      }
      head.rotation.y += (yaw - head.rotation.y) * Math.min(1, dt * 2);
      head.rotation.x += (pitch + (st.nod > 0 ? Math.sin(st.nod * 7) * 0.12 : 0) - head.rotation.x) * Math.min(1, dt * 4);
      if (st.nod > 0) st.nod = Math.max(0, st.nod - dt);
    },
  };
}

// casino-npc.js — V10 CASINO: stylized instanced crowd (patrons, dealers, bartenders, cashiers).
// 8 InstancedMeshes in total, whatever the head count: top (torso + sleeves), head, short hair, long hair, trousers
// (standing), dress (standing), seated legs, shoes. Tasteful evening wear (suits, cocktail / evening dresses with
// sleeves, uniforms). Idle animation by per-instance matrices: breathing, weight shift, head turns; a few walkers loop
// the lobby / aisles. People are adults in formal wear; no suggestive poses or animations.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SKIN = ['#f1c7a5', '#e0ac80', '#c68642', '#8d5524', '#5c3a21', '#ffdbb4', '#d9a27a'];
const HAIR = ['#141110', '#2b1a10', '#4a2c18', '#8a6a3a', '#c9a26a', '#7a3a1e', '#8c8c8c', '#d8d0c0'];
const SUIT = ['#1b2440', '#26272d', '#111114', '#3a3f4a', '#2a1f1a', '#1d3330'];
const DRESS = ['#6a1022', '#0f5a43', '#b8913a', '#22409a', '#4a1a5a', '#111114', '#8a2a3a', '#d9cdb4', '#2f5f8a'];
const SHIRT = ['#e8e2d6', '#c9d3e0', '#e9dccb'];

function geoms(THREE) {
  const parts = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }), false);
  const T = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz))); return g; };
  const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s, 1);
  const sph = (r, w = 12, hh = 8, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) => new THREE.SphereGeometry(r, w, hh, ps, pl, ts, tl);
  // torso: tapered, slightly flattened; shoulders; sleeves
  const top = parts([
    T(cyl(0.165, 0.135, 0.56, 12), 0, 1.22, 0, 0, 0, 0, 1, 1, 0.66),
    T(sph(0.17, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.47, 0, 0, 0, 0, 1.05, 0.45, 0.68),
    T(cyl(0.05, 0.042, 0.56, 8), 0.205, 1.2, 0, 0, 0, 0.09),
    T(cyl(0.05, 0.042, 0.56, 8), -0.205, 1.2, 0, 0, 0, -0.09),
    T(cyl(0.06, 0.05, 0.08, 10), 0, 1.535, 0), // collar
  ]);
  const head = parts([T(sph(0.105, 14, 10), 0, 1.66, 0.01, 0, 0, 0, 0.92, 1.08, 1), T(cyl(0.045, 0.05, 0.1, 8), 0, 1.565, 0)]);
  const hairS = parts([T(sph(0.112, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 1.675, -0.005, -0.25, 0, 0, 0.96, 1.05, 1.04)]);
  const hairL = parts([T(sph(0.115, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), 0, 1.675, -0.01, -0.2, 0, 0, 0.98, 1.06, 1.06), T(cyl(0.11, 0.13, 0.32, 12), 0, 1.5, -0.06, 0.12, 0, 0, 1, 1, 0.55)]);
  const pants = parts([T(cyl(0.075, 0.06, 0.86, 8), 0.085, 0.5, 0), T(cyl(0.075, 0.06, 0.86, 8), -0.085, 0.5, 0), T(cyl(0.15, 0.15, 0.12, 12), 0, 0.93, 0, 0, 0, 0, 1, 1, 0.66)]);
  const dress = parts([T(cyl(0.14, 0.29, 0.9, 16), 0, 0.53, 0, 0, 0, 0, 1, 1, 0.8), T(cyl(0.04, 0.035, 0.1, 6), 0.07, 0.05, 0), T(cyl(0.04, 0.035, 0.1, 6), -0.07, 0.05, 0)]);
  const seat = parts([
    T(cyl(0.15, 0.15, 0.14, 12), 0, 0.92, 0.02, 0, 0, 0, 1, 1, 0.7),
    T(cyl(0.075, 0.07, 0.44, 8), 0.09, 0.9, 0.22, Math.PI / 2, 0, 0), T(cyl(0.075, 0.07, 0.44, 8), -0.09, 0.9, 0.22, Math.PI / 2, 0, 0),
    T(cyl(0.06, 0.055, 0.5, 8), 0.09, 0.66, 0.42), T(cyl(0.06, 0.055, 0.5, 8), -0.09, 0.66, 0.42),
  ]);
  const shoes = parts([T(new THREE.BoxGeometry(0.09, 0.06, 0.22), 0.085, 0.03, 0.04), T(new THREE.BoxGeometry(0.09, 0.06, 0.22), -0.085, 0.03, 0.04)]);
  const shoesSeat = parts([T(new THREE.BoxGeometry(0.09, 0.06, 0.22), 0.09, 0.42, 0.48), T(new THREE.BoxGeometry(0.09, 0.06, 0.22), -0.09, 0.42, 0.48)]);
  return { top, head, hairS, hairL, pants, dress, seat, shoes, shoesSeat };
}

/**
 * spec list: {x, z, yaw, pose:'stand'|'seat', seatY (seat height, for 'seat'), stageY (floor height for standing), role:'patron'|'dealer'|'bartender'|'cashier',
 *             dress?:bool, walk?: [[x,z],…] (loop path for walkers)}
 */
export function buildCrowd(THREE, specs, { seed = 7 } = {}) {
  let a = seed >>> 0; const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const G = geoms(THREE);
  const mat = (rough = 0.75, sheen = 0) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rough, metalness: sheen });
  const n = specs.length;
  const counts = { top: n, head: n, hairS: 0, hairL: 0, pants: 0, dress: 0, seat: 0, shoes: 0, shoesSeat: 0 };
  const people = specs.map((s) => {
    const dress = s.dress != null ? s.dress : (s.role === 'patron' && rnd() < 0.45);
    const longHair = dress ? rnd() < 0.8 : rnd() < 0.1;
    const p = Object.assign({}, s, { dress, longHair, phase: rnd() * 100, h: 0.94 + rnd() * 0.12 });
    if (s.pose === 'seat') counts.seat++, counts.shoesSeat++;
    else { if (dress) counts.dress++; else counts.pants++; counts.shoes++; }
    if (longHair) counts.hairL++; else counts.hairS++;
    // colours
    const role = s.role || 'patron';
    p.cTop = role === 'dealer' ? '#5a0f1a' : role === 'bartender' ? '#efe9de' : role === 'cashier' ? '#1b2440' : dress ? pick(DRESS) : (rnd() < 0.2 ? pick(SHIRT) : pick(SUIT));
    p.cBottom = dress && s.pose !== 'seat' ? p.cTop : role === 'patron' ? (dress ? p.cTop : pick(SUIT.slice(0, 4))) : '#141416';
    p.cSkin = pick(SKIN); p.cHair = s.role === 'dealer' || s.role === 'cashier' ? pick(HAIR.slice(0, 5)) : pick(HAIR);
    return p;
  });
  const meshes = {};
  const mk = (key, geo, m, count) => { if (!count) return null; const im = new THREE.InstancedMesh(geo, m, count); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.name = 'npc-' + key; im.castShadow = false; im.receiveShadow = false; meshes[key] = im; return im; };
  mk('top', G.top, mat(0.7), counts.top); mk('head', G.head, mat(0.55), counts.head);
  mk('hairS', G.hairS, mat(0.6), counts.hairS); mk('hairL', G.hairL, mat(0.6), counts.hairL);
  mk('pants', G.pants, mat(0.75), counts.pants); mk('dress', G.dress, mat(0.45, 0.15), counts.dress);
  mk('seat', G.seat, mat(0.7), counts.seat); mk('shoes', G.shoes, mat(0.35, 0.2), counts.shoes); mk('shoesSeat', G.shoesSeat, mat(0.35, 0.2), counts.shoesSeat);
  const idx = { hairS: 0, hairL: 0, pants: 0, dress: 0, seat: 0, shoes: 0, shoesSeat: 0 };
  const col = new THREE.Color();
  people.forEach((p, i) => {
    p.iTop = i; p.iHead = i;
    p.hairKey = p.longHair ? 'hairL' : 'hairS'; p.iHair = idx[p.hairKey]++;
    if (p.pose === 'seat') { p.botKey = 'seat'; p.shoeKey = 'shoesSeat'; } else { p.botKey = p.dress ? 'dress' : 'pants'; p.shoeKey = 'shoes'; }
    p.iBot = idx[p.botKey]++; p.iShoe = idx[p.shoeKey]++;
    meshes.top.setColorAt(i, col.set(p.cTop)); meshes.head.setColorAt(i, col.set(p.cSkin));
    meshes[p.hairKey].setColorAt(p.iHair, col.set(p.cHair)); meshes[p.botKey].setColorAt(p.iBot, col.set(p.cBottom));
    meshes[p.shoeKey].setColorAt(p.iShoe, col.set(rnd() < 0.5 ? '#0b0b0c' : '#3a2416'));
    if (p.walk) { p.seg = 0; p.u = rnd(); p.speed = 0.75 + rnd() * 0.35; }
  });
  for (const k in meshes) if (meshes[k].instanceColor) meshes[k].instanceColor.needsUpdate = true;
  const group = new THREE.Group(); group.name = 'casino-crowd';
  for (const k in meshes) group.add(meshes[k]);
  // per-frame pose
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), pos = new THREE.Vector3(), sc = new THREE.Vector3(), mh = new THREE.Matrix4();
  const headPivot = new THREE.Vector3(0, 1.56, 0);
  const tA = new THREE.Matrix4().makeTranslation(0, -1.56, 0), tB = new THREE.Matrix4().makeTranslation(0, 1.56, 0), rM = new THREE.Matrix4(), hm = new THREE.Matrix4();
  function pose(t, dt = 0) {
    for (const p of people) {
      let x = p.x, z = p.z, yaw = p.yaw || 0, bob = 0;
      if (p.walk && p.walk.length > 1) {
        const A = p.walk[p.seg], B = p.walk[(p.seg + 1) % p.walk.length];
        const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
        p.u += (p.speed * dt) / L; if (p.u >= 1) { p.u = 0; p.seg = (p.seg + 1) % p.walk.length; }
        const A2 = p.walk[p.seg], B2 = p.walk[(p.seg + 1) % p.walk.length];
        x = A2[0] + (B2[0] - A2[0]) * p.u; z = A2[1] + (B2[1] - A2[1]) * p.u;
        const want = Math.atan2(B2[0] - A2[0], B2[1] - A2[1]);
        p.cy = p.cy == null ? want : p.cy + Math.atan2(Math.sin(want - p.cy), Math.cos(want - p.cy)) * Math.min(1, dt * 4);
        yaw = p.cy; bob = Math.abs(Math.sin(t * 5.2 * p.speed + p.phase)) * 0.025;
      }
      const ph = p.phase, seated = p.pose === 'seat';
      const yOff = seated ? (p.seatY || 0.62) - 0.92 : (p.stageY || 0); // stageY: performers standing on the stage
      const breathe = 1 + Math.sin(t * 1.6 + ph) * 0.006;
      const sway = p.walk ? Math.sin(t * 2.6 * p.speed + ph) * 0.03 : (seated ? Math.sin(t * 0.5 + ph) * 0.02 : Math.sin(t * 0.45 + ph) * 0.018);
      const lean = seated ? 0.06 + Math.sin(t * 0.3 + ph) * 0.03 : 0;
      // body
      e.set(lean, yaw, sway); q.setFromEuler(e); pos.set(x, yOff + bob, z); sc.set(p.h, p.h * breathe, p.h);
      m4.compose(pos, q, sc);
      meshes.top.setMatrixAt(p.iTop, m4);
      // head: turn + nod around the neck pivot (in body space)
      const look = Math.sin(t * 0.23 + ph) * 0.45 + Math.sin(t * 0.61 + ph * 2) * 0.15;
      const nod = Math.sin(t * 0.37 + ph) * 0.06 + (seated ? 0.12 : 0);
      e.set(nod, look, 0); q.setFromEuler(e);
      rM.makeRotationFromQuaternion(q); mh.copy(tB).multiply(rM).multiply(tA);
      hm.copy(m4).multiply(mh);
      meshes.head.setMatrixAt(p.iHead, hm); meshes[p.hairKey].setMatrixAt(p.iHair, hm);
      // legs (no sway on the hips for the seated)
      e.set(0, yaw, seated ? 0 : sway * 0.4); q.setFromEuler(e); pos.set(x, yOff + bob, z); sc.set(p.h, p.h, p.h);
      m4.compose(pos, q, sc);
      meshes[p.botKey].setMatrixAt(p.iBot, m4); meshes[p.shoeKey].setMatrixAt(p.iShoe, m4);
    }
    for (const k in meshes) meshes[k].instanceMatrix.needsUpdate = true;
  }
  pose(0, 0);
  return { group, meshes, people, update: pose, drawCalls: Object.keys(meshes).length };
}

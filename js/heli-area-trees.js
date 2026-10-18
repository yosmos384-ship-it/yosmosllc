// heli-area-trees.js — V13 HELI: the ~57k trees detected from the imagery, as instanced canopies.
// Chunks of 800 m; per-chunk LOD by camera distance (two-lobe canopy + trunk near, a 20-triangle blob further out,
// hidden beyond the draw distance where the orthophoto's own trees take over). Colours come from the crown pixels
// of the imagery, pulled into a natural green range. No side effects on import.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function hash3(x, y, z) { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); }
function canopyGeo(THREE, detail, lobes, trunk) {
  const parts = [];
  const add = (g, ox, oy, oz, s) => {
    const p = g.attributes.position; const n = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.16 * (hash3(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50)) - 0.5) * 2;
      x *= k; z *= k; y *= k;
      if (y < -0.55) y = -0.55 + (y + 0.55) * 0.3; // flatter underside
      const l = Math.hypot(x, y * 1.4, z) || 1;
      n[i * 3] = x / l; n[i * 3 + 1] = y * 1.4 / l; n[i * 3 + 2] = z / l;
      p.setXYZ(i, ox + x * s, oy + y * s, oz + z * s);
    }
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    parts.push(g);
  };
  const ico = () => { const g = new THREE.IcosahedronGeometry(1, detail); return g.index ? g.toNonIndexed() : g; };
  add(ico(), 0, 0, 0, 1);
  if (lobes > 1) add(ico(), 0.38, 0.22, -0.25, 0.68);
  if (lobes > 2) add(ico(), -0.34, 0.12, 0.3, 0.6);
  if (trunk) {
    let c = new THREE.CylinderGeometry(0.06, 0.09, 1.6, 5, 1, true); c.translate(0, -1.45, 0); if (c.index) c = c.toNonIndexed();
    parts.push(c);
  }
  // concatenate (position + normal)
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3); let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose && g.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.computeBoundingSphere();
  return out;
}

export function buildTrees(THREE, data, ground, o = {}) {
  const T = data.trees; if (!T || !T.list) return { meshes: [], update() {}, count: 0 };
  const hi = o.quality !== 'low';
  const L = T.list, n = Math.floor(L.length / 4);
  const want = hi ? 24000 : 9000;
  const step = Math.max(1, n / want);
  const geoNear = canopyGeo(THREE, 1, hi ? 2 : 1, true);
  const geoMid = canopyGeo(THREE, 0, 1, false);
  const geoFar = (() => { let g = new THREE.OctahedronGeometry(1, 0); if (g.index) g = g.toNonIndexed(); const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) * 0.5); g.computeVertexNormals(); g.computeBoundingSphere(); return g; })();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const CH = 600; const buckets = new Map();
  const obstacle = o.obstacle || (() => -Infinity);
  for (let f = 0; f < n; f += step) {
    const i = Math.floor(f);
    const x = L[i * 4], z = L[i * 4 + 1];
    if (obstacle(x, z) > ground(x, z) + 1.5) continue; // not on a roof
    const k = Math.floor(x / CH) + ':' + Math.floor(z / CH);
    if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(i);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
  const hsl = { h: 0, s: 0, l: 0 };
  const meshes = []; let count = 0;
  for (const [k, idx] of buckets) {
    const im = new THREE.InstancedMesh(geoNear, mat, idx.length); im.name = 'heliArea:trees:' + k;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    idx.forEach((i, j) => {
      const x = L[i * 4], z = L[i * 4 + 1], h = clamp(L[i * 4 + 2], 4, 30), colv = L[i * 4 + 3];
      const r = h * (0.34 + ((i * 7919) % 100) / 640);
      p.set(x, ground(x, z) + h * 0.6, z); s.set(r, h * 0.4, r * (0.88 + ((i * 31) % 25) / 100)); e.set(0, (i % 628) / 100, 0); q.setFromEuler(e);
      m4.compose(p, q, s); im.setMatrixAt(j, m4);
      c.setHex(colv); c.getHSL(hsl);
      const hh = hsl.s < 0.08 ? 0.24 : clamp(hsl.h, 0.15, 0.34);
      c.setHSL(hh + (((i * 13) % 17) - 8) / 600, clamp(hsl.s * 1.05, 0.18, 0.42), clamp(hsl.l * 1.1 + 0.02, 0.1, 0.25));
      im.setColorAt(j, c);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    try { im.computeBoundingSphere && im.computeBoundingSphere(); } catch (_) {}
    im.castShadow = false; im.receiveShadow = false; im.matrixAutoUpdate = false;
    im.userData.lodCentre = [(x0 + x1) / 2, (z0 + z1) / 2]; im.userData.lodR = Math.hypot(x1 - x0, z1 - z0) / 2;
    meshes.push(im); count += idx.length;
  }
  // LOD by distance under a triangle budget: nearest visible chunks get the full canopy, then the 20-triangle blob,
  // then an 8-triangle octahedron; beyond FAR (or when the budget is spent) the orthophoto's own trees take over.
  // Distance bands have hysteresis and the assignment is re-evaluated at most every 250 ms (no flicker).
  const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  const TN = triCount(geoNear), TM = triCount(geoMid), TF = triCount(geoFar);
  const NEAR = hi ? 520 : 360, MID = hi ? 1500 : 1000, FAR = hi ? 2600 : 1800, BUDGET = hi ? 380000 : 130000;
  const LODS = [geoNear, geoMid, geoFar], COST = [TN, TM, TF];
  for (const m of meshes) m.userData.lod = 1;
  let lastT = -1e9, lastX = 1e9, lastY = 1e9, lastZ = 1e9, used = 0;
  const sph = new THREE.Sphere();
  function update(cam, frustum) {
    const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const moved = Math.hypot(cam.x - lastX, cam.y - lastY, cam.z - lastZ);
    if (t - lastT < 250 && moved < 40) return;
    lastT = t; lastX = cam.x; lastY = cam.y; lastZ = cam.z;
    const L2 = [];
    for (const m of meshes) {
      const [cx, cz] = m.userData.lodCentre;
      const gy = ground(cx, cz);
      const d = Math.max(0, Math.hypot(cam.x - cx, cam.z - cz, cam.y - gy) - m.userData.lodR);
      let inView = true;
      if (frustum && m.boundingSphere) { sph.copy(m.boundingSphere); inView = frustum.intersectsSphere(sph); }
      m.userData.d = d;
      if (d >= FAR * (m.visible ? 1.05 : 1)) { if (m.visible) m.visible = false; continue; }
      if (!inView) { if (!m.visible) m.visible = true; continue; } // three culls it anyway; keep its LOD
      L2.push(m);
    }
    L2.sort((a, b) => a.userData.d - b.userData.d);
    let budget = BUDGET; used = 0;
    for (const m of L2) {
      const d = m.userData.d, cur = m.userData.lod;
      // wanted band, with 10 % hysteresis around the band edges
      let want = d < NEAR * (cur === 0 ? 1.1 : 1) ? 0 : d < MID * (cur <= 1 ? 1.1 : 1) ? 1 : 2;
      while (want < 3 && m.count * COST[want] > budget) want++;
      if (want >= 3) { if (m.visible) m.visible = false; continue; }
      budget -= m.count * COST[want]; used += m.count * COST[want];
      if (!m.visible) m.visible = true;
      if (cur !== want || m.geometry !== LODS[want]) { m.userData.lod = want; m.geometry = LODS[want]; }
    }
  }
  return { meshes, mat, update, count, geoNear, geoMid, geoFar, get triangles() { return used; } };
}

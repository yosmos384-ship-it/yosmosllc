// heli-area-buildings.js — V13 HELI: OSM building extrusions for the heli world.
// Footprints from data/heli-area.json (buildings + downtown), merged into spatial chunks split by size class
// (small houses / sheds are hidden by distance, big ones stay), one shared facade shader (heli-area-shaders.js):
// procedural windows per building type, roofs textured from the aerial imagery itself (same textures as the terrain,
// no extra memory), gable / hip roofs on houses, parapets + rooftop plant on flat roofs, setback crowns, penthouses
// and masts on the downtown towers. Also the soft-collision obstacle grid. No side effects on import.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const WALL = {
  0: [0xe9e4d8, 0xdcd6c9, 0xcfc8b9, 0xf2eee6, 0xc3cad0, 0xd9ccb4, 0xbdb5a7, 0xe6dfcf, 0xa9b4b9, 0xc7b9a3], // siding / paint
  1: [0xb9b4aa, 0xa9a49a, 0xc4beb2],
  2: [0xa86f55, 0x9a654f, 0xb88466, 0x8f5d4a, 0xc9b9a0, 0xb3a58f],   // brick / stucco
  3: [0xd0cbc1, 0xc2bcb0, 0xd9d2c3, 0xb8b2a6, 0xcfc2ad],
  4: [0xb3b7ba, 0xc2c5c7, 0xa2a8ad, 0xc9c4b8],
  5: [0x6f8796, 0x7d929c, 0x5f7684, 0x8a9aa0, 0x6d7f7a, 0x8c8f93],   // curtain-wall glass tints
  6: [0xc9c5bd, 0xb7b2a9, 0xd6d0c4, 0xa9a59e],
  7: [0xcdbfa6, 0xbfae92, 0xd8cdb8, 0xb4a48a],
};
// footprint helpers
function area2(pts) { let a = 0; for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function pip(pts, x, z) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, zi] = pts[i], [xj, zj] = pts[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }

export function buildBuildings(THREE, list, ground, o = {}) {
  const hi = o.quality !== 'low';
  const CH = 2500, chunks = new Map();
  const grid = new Map(); const GC = 60;
  const col = new THREE.Color(), rc = new THREE.Color();
  let rs = 1234567; const rand = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  // the tallest towers get masts
  const tallest = list.map((b) => b[0]).sort((a, b) => b - a);
  const mastH = tallest.length > 2 ? tallest[2] : Infinity;
  let C = null;
  const P = (x, y, z, nx, ny, nz, u, v, info, c) => {
    C.pos.push(x, y, z); C.nrm.push(nx, ny, nz); C.uv.push(u, v); C.info.push(info[0], info[1], info[2], info[3]); C.col.push(c.r, c.g, c.b);
  };
  const tri = (a, b, c, n, info, cc) => { P(a[0], a[1], a[2], n[0], n[1], n[2], a[3] || 0, a[4] || 0, info, cc); P(b[0], b[1], b[2], n[0], n[1], n[2], b[3] || 0, b[4] || 0, info, cc); P(c[0], c[1], c[2], n[0], n[1], n[2], c[3] || 0, c[4] || 0, info, cc); };
  // vertical wall ring (CCW footprint in x/z with z south → outward normal = (dz, -dx)); u = metres along, v = metres above grade
  function walls(pts, yb, yt, gy, info, cc, inward = false) {
    let peri = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
      const L = Math.hypot(bx - ax, bz - az); if (L < 0.05) continue;
      let nx = (bz - az) / L, nz = -(bx - ax) / L;
      const u0 = peri, u1 = peri + L; peri += L;
      const v0 = yb - gy, v1 = yt - gy;
      if (!inward) {
        P(ax, yb, az, nx, 0, nz, u0, v0, info, cc); P(bx, yt, bz, nx, 0, nz, u1, v1, info, cc); P(bx, yb, bz, nx, 0, nz, u1, v0, info, cc);
        P(ax, yb, az, nx, 0, nz, u0, v0, info, cc); P(ax, yt, az, nx, 0, nz, u0, v1, info, cc); P(bx, yt, bz, nx, 0, nz, u1, v1, info, cc);
      } else {
        nx = -nx; nz = -nz;
        P(ax, yb, az, nx, 0, nz, u0, v0, info, cc); P(bx, yb, bz, nx, 0, nz, u1, v0, info, cc); P(bx, yt, bz, nx, 0, nz, u1, v1, info, cc);
        P(ax, yb, az, nx, 0, nz, u0, v0, info, cc); P(bx, yt, bz, nx, 0, nz, u1, v1, info, cc); P(ax, yt, az, nx, 0, nz, u0, v1, info, cc);
      }
    }
  }
  function flat(pts, y, info, cc) {
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []); } catch (_) { tris = []; }
    for (const t of tris) {
      const p0 = pts[t[0]], p1 = pts[t[1]], p2 = pts[t[2]];
      if (!p0 || !p1 || !p2) continue;
      const cr = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
      const order = cr < 0 ? [p0, p1, p2] : [p0, p2, p1];
      for (const p of order) P(p[0], y, p[1], 0, 1, 0, 0, 0, info, cc);
    }
  }
  function box(cx, cz, sx, sz, ang, y0, y1, gy, info, cc) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const pts = [[-sx, -sz], [sx, -sz], [sx, sz], [-sx, sz]].map(([a, b]) => [cx + a * ca - b * sa, cz + a * sa + b * ca]);
    if (area2(pts) < 0) pts.reverse();
    walls(pts, y0, y1, gy, info, cc); flat(pts, y1, info, cc);
  }
  const scaled = (pts, cx, cz, k) => pts.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]);
  let nb = 0;
  let BK = '0:0';
  function addOne(b) {
    const h = b[0] / 10, roof = b[1], kind = b[2];
    let pts = [];
    { let x = b[3] / 10, z = b[4] / 10; pts.push([x, z]); for (let i = 5; i + 1 < b.length; i += 2) { x += b[i] / 10; z += b[i + 1] / 10; pts.push([x, z]); } }
    if (pts.length > 3) { const f = pts[0], l = pts[pts.length - 1]; if (Math.abs(f[0] - l[0]) < 0.05 && Math.abs(f[1] - l[1]) < 0.05) pts.pop(); }
    if (pts.length < 3) return;
    const A = area2(pts); if (Math.abs(A) < 4) return;
    if (A < 0) pts.reverse(); // CCW in (x, z) for outward normals
    const fa = Math.abs(A);
    let cx = 0, cz = 0; for (const [x, z] of pts) { cx += x; cz += z; } cx /= pts.length; cz /= pts.length;
    const small = h <= 11 && fa < 900 && kind !== 5;
    const k = BK + (small ? ':s' : ':b');
    C = chunks.get(k);
    if (!C) { C = { pos: [], nrm: [], uv: [], info: [], col: [], small, cx: 0, cz: 0, n: 0, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }; chunks.set(k, C); }
    C.n++; C.x0 = Math.min(C.x0, cx); C.x1 = Math.max(C.x1, cx); C.z0 = Math.min(C.z0, cz); C.z1 = Math.max(C.z1, cz);
    let gy = Infinity, gmax = -Infinity; for (const [x, z] of pts) { const g = ground(x, z); gy = Math.min(gy, g); gmax = Math.max(gmax, g); }
    const top = gmax + h;
    const yb = gy - 1.0;
    const seed = rand();
    // facade type
    let ft;
    if (h > 30) ft = rand() < 0.45 ? 5 : rand() < 0.6 ? 6 : 7;
    else if (kind === 0) ft = 0;
    else if (kind === 1) ft = 1;
    else if (kind === 2 || kind === 5) ft = 2;
    else if (kind === 3) ft = h >= 14 ? (rand() < 0.5 ? 6 : 2) : 3;
    else if (kind === 4) ft = 4;
    else ft = h < 4.5 ? 1 : h < 9 ? 3 : 2;
    const pal = WALL[ft] || WALL[3];
    col.setHex(pal[Math.floor(rand() * pal.length)]);
    if (ft === 5 && roof) { rc.setHex(roof); col.lerp(rc, 0.25); }
    rc.setHex(roof || 0x777777);
    rc.r = Math.min(1, rc.r * 1.15 + 0.02); rc.g = Math.min(1, rc.g * 1.15 + 0.02); rc.b = Math.min(1, rc.b * 1.15 + 0.02);
    // roofs of low buildings are textured with the imagery; tall towers lean in the orthophoto → their own colour
    const roofImg = h < 24 ? 1 : h < 45 ? 2 : 0;
    const gable = (kind === 0 || (kind === 6 && h < 8) || kind === 1 && fa > 30) && pts.length >= 4 && pts.length <= 8 && h < 10 && fa < 450;
    const flatTop = gable ? gmax + Math.max(2.4, h * 0.58) : top;
    const wallH = flatTop - gy;
    const info = [ft, seed, 0, wallH];
    const rinfo = [ft, seed, roofImg, wallH];
    // walls
    walls(pts, yb, flatTop, gy, info, col);
    if (gable) {
      // oriented box from the longest edge → gable (or hip) roof along the long axis
      let bi = 0, bl = 0; const n = pts.length;
      for (let i = 0; i < n; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n]; const L = Math.hypot(bx - ax, bz - az); if (L > bl) { bl = L; bi = i; } }
      const [ax, az] = pts[bi], [bx, bz] = pts[(bi + 1) % n];
      const ux = (bx - ax) / bl, uz = (bz - az) / bl, vx = -uz, vz = ux;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [x, z] of pts) { const a = (x - cx) * ux + (z - cz) * uz, bb = (x - cx) * vx + (z - cz) * vz; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, bb); b1 = Math.max(b1, bb); }
      const ov = 0.4; a0 -= ov; a1 += ov; b0 -= ov; b1 += ov;
      const Pt = (a, bb, y) => [cx + ux * a + vx * bb, y, cz + uz * a + vz * bb];
      const bm = (b0 + b1) / 2, half = (b1 - b0) / 2;
      const yE = flatTop - 0.12, yR = Math.min(top, flatTop + Math.max(1.6, half * 0.75));
      const hip = seed < 0.38 || (a1 - a0) < (b1 - b0) * 1.15;
      const inset = hip ? Math.min(half * 0.9, (a1 - a0) * 0.45) : 0;
      const quads = [
        [Pt(a0, b0, yE), Pt(a1, b0, yE), Pt(a1 - inset, bm, yR), Pt(a0 + inset, bm, yR)],
        [Pt(a1, b1, yE), Pt(a0, b1, yE), Pt(a0 + inset, bm, yR), Pt(a1 - inset, bm, yR)],
      ];
      const addFace = (vs, cc, inf) => {
        const e1 = [vs[1][0] - vs[0][0], vs[1][1] - vs[0][1], vs[1][2] - vs[0][2]], e2 = [vs[2][0] - vs[0][0], vs[2][1] - vs[0][1], vs[2][2] - vs[0][2]];
        let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; vs = vs.slice().reverse(); }
        const idx = vs.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
        for (const i of idx) { const p = vs[i]; P(p[0], p[1], p[2], nx, ny, nz, 0, 0, inf, cc); }
      };
      for (const q of quads) addFace(q, rc, rinfo);
      if (hip) {
        addFace([Pt(a0, b1, yE), Pt(a0, b0, yE), Pt(a0 + inset, bm, yR)], rc, rinfo);
        addFace([Pt(a1, b0, yE), Pt(a1, b1, yE), Pt(a1 - inset, bm, yR)], rc, rinfo);
      } else {
        // gable end triangles (wall material, outward)
        for (const [aa, sgn] of [[a0, -1], [a1, 1]]) {
          const t = [Pt(aa, b0, yE), Pt(aa, b1, yE), Pt(aa, bm, yR)];
          const nx = ux * sgn, nz = uz * sgn;
          const e2 = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
          const crs = (t[1][1] - t[0][1]) * e2[2] - (t[1][2] - t[0][2]) * e2[1], crz = (t[1][0] - t[0][0]) * e2[1] - (t[1][1] - t[0][1]) * e2[0];
          const ord = crs * nx + crz * nz >= 0 ? [0, 1, 2] : [0, 2, 1];
          for (const i of ord) { const p = t[i]; P(p[0], p[1], p[2], nx, 0, nz, (i === 1 ? half * 2 : i === 2 ? half : 0), p[1] - gy, info, col); }
        }
      }
    } else {
      // flat roof; big ones get a parapet (inner face) + rooftop plant
      const parapet = fa > 250 && h > 6;
      const roofY = parapet ? flatTop - 0.7 : flatTop;
      if (parapet) walls(pts, roofY, flatTop, gy, info, col.clone().multiplyScalar(0.82), true);
      flat(pts, roofY, rinfo, rc);
      if (parapet && hi && fa > 500 && h < 40) {
        const nbx = 1 + Math.floor(rand() * Math.min(4, fa / 700));
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        const plant = new THREE.Color(0xc9cbcc);
        for (let i = 0; i < nbx; i++) {
          for (let tries = 0; tries < 6; tries++) {
            const px = x0 + (x1 - x0) * (0.2 + 0.6 * rand()), pz = z0 + (z1 - z0) * (0.2 + 0.6 * rand());
            if (!pip(pts, px, pz)) continue;
            const s = 1.2 + rand() * 2.6;
            box(px, pz, s, s * (0.6 + rand() * 0.8), 0, roofY, roofY + 1.2 + rand() * 1.8, gy, [1, rand(), 0, 3], plant);
            break;
          }
        }
      }
      if (h >= 30) {
        // towers: setback crown + mechanical penthouse (+ a mast on the tallest)
        let crownTop = flatTop;
        if (h >= 55 && pts.length <= 24) {
          const k2 = 0.78, cpts = scaled(pts, cx, cz, k2), cy0 = flatTop, cy1 = flatTop + Math.min(16, h * 0.08);
          walls(cpts, cy0, cy1, gy, [ft, seed, 0, cy1 - gy], col);
          flat(cpts, cy1, [ft, seed, 0, cy1 - gy], rc);
          crownTop = cy1;
        }
        const pk = 0.32, ppts = scaled(pts, cx, cz, pk), py1 = crownTop + 3.5 + rand() * 3;
        if (pts.length <= 24) { walls(ppts, crownTop, py1, gy, [1, seed, 0, py1 - gy], col.clone().multiplyScalar(0.85)); flat(ppts, py1, [1, seed, 0, py1 - gy], rc.clone().multiplyScalar(0.9)); }
        if (b[0] >= mastH) {
          const mc = new THREE.Color(0xd8d8d8);
          box(cx, cz, 0.6, 0.6, 0.3, py1, py1 + Math.min(40, h * 0.18), gy, [1, 0, 0, 3], mc);
        }
      }
    }
    nb++;
    // obstacle grid (roof height for soft collisions)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const rec = { pts, top, x0, x1, z0, z1 };
    for (let gx = Math.floor(x0 / GC); gx <= Math.floor(x1 / GC); gx++) for (let gz = Math.floor(z0 / GC); gz <= Math.floor(z1 / GC); gz++) { const kk = gx + ':' + gz; if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(rec); }
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.0, envMapIntensity: 0.6 });
  const meshes = [];
  // progressive generation: buildings are bucketed by spatial chunk (first vertex), buckets run nearest-first from
  // `origin`; each finished bucket becomes up to two meshes (small / big) handed to onMesh. run() time-slices.
  const buckets = new Map();
  for (const b of list) { const k = Math.floor(b[3] / 10 / CH) + ':' + Math.floor(b[4] / 10 / CH); let L = buckets.get(k); if (!L) buckets.set(k, (L = [])); L.push(b); }
  const org = o.origin || [0, 0];
  const queue = [...buckets.keys()].map((k) => { const [gx, gz] = k.split(':').map(Number); return { k, d: Math.max(0, Math.hypot((gx + 0.5) * CH - org[0], (gz + 0.5) * CH - org[1]) - CH * 0.71) }; }).sort((a, b) => a.d - b.d);
  let qi = 0, bi = 0, aborted = false; // V13: abort() stops a running progressive build (world unloaded)
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  async function run(opt = {}) {
    const maxD = opt.maxDist != null ? opt.maxDist : Infinity, slice = opt.sliceMs || 12;
    let t0 = now();
    while (!aborted && qi < queue.length && queue[qi].d <= maxD) {
      const q = queue[qi], L = buckets.get(q.k);
      BK = q.k;
      while (bi < L.length) {
        if (aborted) return false;
        addOne(L[bi++]);
        if ((bi & 31) === 0 && now() - t0 > slice) { await (opt.yieldFn ? opt.yieldFn() : new Promise((r) => setTimeout(r, 0))); t0 = now(); }
      }
      for (const sfx of [':s', ':b']) { const key = q.k + sfx; const Ck = chunks.get(key); if (Ck) { const m = finalize(key, Ck); chunks.delete(key); if (m) { meshes.push(m); opt.onMesh && opt.onMesh(m); } } }
      buckets.delete(q.k); qi++; bi = 0;
    }
    return qi >= queue.length;
  }
  function finalize(k, Ck) {
    if (!Ck.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(Ck.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(Ck.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(Ck.uv, 2));
    g.setAttribute('bInfo', new THREE.Float32BufferAttribute(Ck.info, 4));
    g.setAttribute('bCol', new THREE.Float32BufferAttribute(Ck.col, 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, mat); m.name = 'heliArea:bld:' + k; m.receiveShadow = false; m.castShadow = false; m.matrixAutoUpdate = false;
    m.userData.lodSmall = Ck.small;
    m.userData.lodCentre = [(Ck.x0 + Ck.x1) / 2, (Ck.z0 + Ck.z1) / 2];
    m.userData.lodR = Math.hypot(Ck.x1 - Ck.x0, Ck.z1 - Ck.z0) / 2;
    m.userData.floor = 'main'; m.userData.heliArea = true;
    return m;
  }
  function obstacle(x, z) {
    const L = grid.get(Math.floor(x / GC) + ':' + Math.floor(z / GC)); if (!L) return -Infinity;
    let top = -Infinity;
    for (const r of L) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && r.top > top && pip(r.pts, x, z)) top = r.top;
    return top;
  }
  // highest roof within r of (x, z) — for label anchors
  function maxTop(x, z, r) {
    let top = -Infinity;
    for (let gx = Math.floor((x - r) / GC); gx <= Math.floor((x + r) / GC); gx++) for (let gz = Math.floor((z - r) / GC); gz <= Math.floor((z + r) / GC); gz++) {
      const L = grid.get(gx + ':' + gz); if (!L) continue;
      for (const q of L) if (q.top > top && q.x1 > x - r && q.x0 < x + r && q.z1 > z - r && q.z0 < z + r) top = q.top;
    }
    return top;
  }
  return { meshes, mat, obstacle, maxTop, run, abort() { aborted = true; }, get count() { return nb; }, get pending() { return queue.length - qi; } };
}

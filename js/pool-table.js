// pool-table.js — V12 POOL: the basement 8-ft table built from the physics geometry (js/pool-physics.js makeTable), so
// what you see is what the balls hit: K-66 style cushions cut to the real jaw angles (corner 142°, side 103.5°), slate
// bed with pocket holes, walnut rails with pocket cut-outs, leather pocket rims + liners, 18 mother-of-pearl diamonds,
// head / foot spots; ball textures (canvas, numbered, stripes) and the 3D cue stick.
import { THREE, PI, Batch } from './interior-lib.js';
import { BALL_R } from './pool-physics.js';

const R = BALL_R;
export const BALL_COLS = [0xffffff, 0xf2c40f, 0x1f4fbf, 0xd0201b, 0x4b2a8a, 0xf07a10, 0x137a3a, 0x7a1a1a, 0x111111];
export const BALL_CSS = (n) => '#' + new THREE.Color(BALL_COLS[n >= 9 ? n - 8 : n]).getHexString();

/** equirectangular ball texture: cue ball with red dots, solids, stripes (white caps), number discs on both sides */
export function ballTexture(n, size = 512) {
  const W = size, H = size / 2;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const IVORY = '#f6f2e6';
  const stripe = n >= 9, col = n ? BALL_CSS(n) : IVORY;
  g.fillStyle = stripe || n === 0 ? IVORY : col; g.fillRect(0, 0, W, H);
  if (stripe) { g.fillStyle = col; g.fillRect(0, H * 0.27, W, H * 0.46); }
  // subtle lacquer variation
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,0.06)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.08)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  if (n > 0) {
    for (const u of [0.25, 0.75]) {
      const cx = u * W, cy = H / 2, r = H * 0.155;
      g.fillStyle = IVORY; g.beginPath(); g.ellipse(cx, cy, r, r, 0, 0, PI * 2); g.fill();
      g.fillStyle = '#141414'; g.font = `bold ${Math.round(r * (n >= 10 ? 1.15 : 1.35))}px Arial, Helvetica, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(n), cx, cy + r * 0.06);
      if (n === 6 || n === 9) { g.fillRect(cx - r * 0.32, cy + r * 0.62, r * 0.64, r * 0.08); } // underline 6 / 9
    }
  } else {
    g.fillStyle = '#c62828';
    for (const [u, v] of [[0.25, 0.5], [0.75, 0.5], [0.5, 0.15], [0, 0.85]]) { g.beginPath(); g.arc(u * W, v * H, H * 0.028, 0, PI * 2); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function ballMaterial(n, quality) {
  return new THREE.MeshPhysicalMaterial({ map: ballTexture(n, quality === 'low' ? 256 : 512), roughness: 0.07, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.04, name: 'pool-ball-' + n });
}

/** star-shaped polygon around the table centre: the rectangle (hx, hy) with pocket circles cut out (mode 'cut', the
 *  slate bed) or added (mode 'union', the hole in the rail top). Engine coords (x, y). */
function starPoly(hx, hy, circles, mode, n = 1080) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * PI * 2, c = Math.cos(th), s = Math.sin(th);
    let r = Math.min(Math.abs(c) > 1e-9 ? hx / Math.abs(c) : 1e9, Math.abs(s) > 1e-9 ? hy / Math.abs(s) : 1e9);
    const r0 = r;
    for (const k of circles) {
      const b = c * k.x + s * k.y, q = k.x * k.x + k.y * k.y - k.r * k.r, disc = b * b - q;
      if (disc <= 0) continue;
      const t1 = b - Math.sqrt(disc), t2 = b + Math.sqrt(disc);
      if (t1 > r0 || t2 < 0) continue;
      if (mode === 'cut') r = Math.min(r, Math.max(0, t1)); else r = Math.max(r, t2);
    }
    pts.push([r * c, r * s]);
  }
  return pts;
}

/** builds the play surface into frame F (local origin = table centre on the floor, felt top at y = top).
 *  Returns {feltTop, railTop, outer: [hx, hy]}. Engine (x, y) → frame (x, −y). */
export function buildTableTop(F, T, o) {
  const top = o.top, FELT = o.felt, WOOD = o.wood, cw = o.cushionW || 0.05, railW = o.railW || 0.11;
  const hw = T.W / 2, hl = T.L / 2, nose = top + 0.037, railTop = top + 0.045;
  const toF = (pts) => pts.map(([x, y]) => [x, -y]);
  // slate bed (felt) with pocket holes
  const holes = T.pockets.map((k) => ({ x: k.x, y: k.y, r: k.r + 0.003 }));
  F.slab('felt', toF(starPoly(hw + cw + 0.005, hl + cw + 0.005, holes, 'cut')), [], top, 0.03, FELT, { curve: 4 });
  // cushions: one piece per rail section between pockets, nose line + jaw faces + back line
  const jawFrom = (x, y) => T.segs.find((s) => s.kind === 'jaw' && Math.abs(s.ax - x) < 1e-9 && Math.abs(s.ay - y) < 1e-9);
  for (const s of T.segs) {
    if (s.kind !== 'rail') continue;
    // inward normal of this rail and the back line
    const cx = (s.ax + s.bx) / 2, cy = (s.ay + s.by) / 2;
    let nx = -s.uy, ny = s.ux; if (nx * cx + ny * cy < 0) { nx = -nx; ny = -ny; } // outward
    const ends = [];
    for (const [px, py] of [[s.ax, s.ay], [s.bx, s.by]]) {
      const j = jawFrom(px, py);
      let ex = j.bx, ey = j.by;
      const dOut = (ex - px) * nx + (ey - py) * ny; // depth of the jaw end behind the nose
      if (dOut > cw) { const k = cw / dOut; ex = px + (j.bx - px) * k; ey = py + (j.by - py) * k; }
      const d2 = (ex - px) * nx + (ey - py) * ny;
      ends.push({ p: [px, py], e: [ex, ey], b: [ex + nx * (cw - d2), ey + ny * (cw - d2)] });
    }
    const poly = [ends[0].p, ends[1].p, ends[1].e, ends[1].b, ends[0].b, ends[0].e];
    F.slab('felt', toF(poly), [], nose, nose - top - 0.001, FELT, { curve: 2 });
    // rubber nose strip highlight: a thin rounded edge along the nose
  }
  // rails (wood) with pocket cut-outs
  const OX = hw + cw + railW, OY = hl + cw + railW;
  const rimC = T.pockets.map((k) => ({ x: k.x, y: k.y, r: k.r + 0.012 }));
  const hole = starPoly(hw + cw, hl + cw, rimC, 'union');
  const outer = [[-OX, -OY], [OX, -OY], [OX, OY], [-OX, OY]];
  F.slab('woodGloss', toF(outer), [toF(hole)], railTop, 0.05, WOOD, { curve: 4 });
  // pocket liners (black cups under the holes, seen from inside → double-sided) + leather rims on the rail top
  const LINER = o.linerMat || (buildTableTop.liner = buildTableTop.liner || new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, name: 'pool-pocket-liner' }));
  for (const k of T.pockets) {
    F.lathe(LINER, [[0, -0.13], [k.r * 0.8, -0.12], [k.r + 0.006, -0.05], [k.r + 0.013, 0]], [k.x, top + 0.001, -k.y], 0x101010, { seg: 24 });
    const out = Math.atan2(-k.dy, k.dx); // outward direction in the frame's (x, z)
    const arc = PI * 1.25;
    const g = new THREE.TorusGeometry(k.r + 0.014, 0.0065, 6, 28, arc);
    g.rotateX(PI / 2); g.rotateY(arc / 2 - out);
    F.add('rubber', g, [k.x, railTop + 0.002, -k.y], 0x161210, { sy: 0.45 });
  }
  // diamonds (mother of pearl inlays): 3 per half long rail, 3 per end rail
  const dy = T.L / 8, mid = cw + railW / 2;
  for (const sx of [-1, 1]) for (const k of [-3, -2, -1, 1, 2, 3]) F.sph('gloss', 0.0075, [sx * (hw + mid), railTop + 0.0004, -k * dy], 0xf3efe2, { sy: 0.25, ws: 12, hs: 6 });
  for (const sy of [-1, 1]) for (const k of [-1, 0, 1]) F.sph('gloss', 0.0075, [k * T.W / 4, railTop + 0.0004, -sy * (hl + mid)], 0xf3efe2, { sy: 0.25, ws: 12, hs: 6 });
  // head + foot spots
  for (const y of [T.headY, T.footY]) F.cyl('gloss', 0.0055, 0.0055, 0.0006, [0, top + 0.0003, -y], 0xf4f1e8, { seg: 14 });
  return { feltTop: top, railTop, outer: [OX, OY], cushionTop: nose };
}

/** the cue stick (local +z = toward the butt, tip at the origin) */
export function buildCueStick(E) {
  const g = new THREE.Group();
  const b = new Batch(), L = 1.47, f = b.root;
  f.cyl('woodGloss', 0.0062, 0.0068, 0.012, [0, 0, 0.006 + 0.012], 0xf3efe2, { rx: PI / 2, seg: 14 }); // ferrule
  f.cyl('plastic', 0.0062, 0.0062, 0.011, [0, 0, 0.0055], 0x2a62c9, { rx: PI / 2, seg: 14 }); // blue-chalked tip
  f.cyl('woodGloss', 0.0068, 0.0118, 0.82, [0, 0, 0.024 + 0.41], 0xe2c28d, { rx: PI / 2, seg: 16 }); // maple shaft
  f.cyl('brass', 0.0121, 0.0121, 0.012, [0, 0, 0.85], 0xc9a25a, { rx: PI / 2, seg: 16 }); // joint
  f.cyl('woodGloss', 0.0122, 0.0148, 0.56, [0, 0, 0.856 + 0.28], 0x2a140b, { rx: PI / 2, seg: 16 }); // ebony butt
  f.cyl('rubber', 0.0146, 0.0146, 0.2, [0, 0, 1.16], 0x151515, { rx: PI / 2, seg: 16 }); // wrap
  f.cyl('rubber', 0.015, 0.0145, 0.02, [0, 0, L - 0.01], 0x111111, { rx: PI / 2, seg: 16 }); // bumper
  for (let i = 0; i < 4; i++) f.box('gloss', [0.004, 0.0015, 0.07], [Math.cos(i * PI / 2) * 0.0127, Math.sin(i * PI / 2) * 0.0127, 0.93], 0xf3efe2, { r: 0, rz: i * PI / 2 }); // inlays
  b.build(g, E.M, { shadow: true, name: 'pool-cue' });
  return g;
}

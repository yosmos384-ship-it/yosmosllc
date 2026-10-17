// pool-physics.js — V12 POOL: deterministic billiards physics (no THREE, runs in node for the unit tests and the AI).
// Table frame: x across the table (−W/2 … W/2), y along it (−L/2 head … +L/2 foot), z up. Units: m, s, rad.
// Model: sliding ↔ rolling cloth friction with full 3D spin (top / back / side), vertical-spin decay, ball–ball
// collisions with restitution + friction (cut-induced / spin-induced throw), cushions with speed-dependent restitution
// and side-spin friction, pocket jaws (angled faces + rounded points), drop circles. Fixed timestep; inside each step
// every collision is found by exact time of impact (linear motion over the step), so nothing tunnels at any speed.
export const BALL_R = 0.028575; // 57.15 mm ball (2 ¼")
export const GRAV = 9.81;
export const PHYS = {
  h: 1 / 480,        // fixed step (s)
  muS: 0.2,          // sliding friction ball–cloth
  muR: 0.011,        // rolling resistance
  muSp: 0.044,       // spinning (vertical axis) friction
  eBall: 0.95,       // ball–ball restitution
  muBall: 0.06,      // ball–ball friction (throw)
  eCush: 0.76,       // cushion restitution at ~1 m/s (falls slowly with speed, 0.68 … 0.82)
  muCush: 0.2,       // cushion friction (side spin "running" english)
  cushSpinKeep: 0.25, // fraction of the horizontal (roll) spin kept through a cushion impact (the nose sits above the centre)
  squirt: 0.022,     // cue-ball deflection (rad) at full side english
  vMax: 9.0,         // break-strength cue-ball speed (m/s)
};
const R = BALL_R, I_M = 0.4 * R * R; // moment of inertia per unit mass

/* -------------------------------------------------------------------------------------------- table geometry */
// 8-ft table: play field 2.235 × 1.118 m (88" × 44"), corner mouth 4.6" (117 mm) between the points, jaws at 142°,
// side mouth 5.3" (134 mm), jaws at 103.5°.
export function makeTable(o = {}) {
  const W = o.W || 1.118, L = o.L || 2.235;
  const cm = o.cornerMouth || 0.117, sm = o.sideMouth || 0.134, jl = o.jawLen || 0.055;
  const a = cm / Math.SQRT2, hw = W / 2, hl = L / 2;
  const segs = [], points = [], pockets = [];
  const seg = (ax, ay, bx, by, kind, pocket) => { const ex = bx - ax, ey = by - ay, len = Math.hypot(ex, ey); segs.push({ ax, ay, bx, by, ux: ex / len, uy: ey / len, len, kind, pocket }); };
  const jawC = 38 * Math.PI / 180, jawS = 76.5 * Math.PI / 180;
  const jaw = (px, py, rdx, rdy, odx, ody, ang, pk) => {
    const dx = Math.cos(ang) * rdx + Math.sin(ang) * odx, dy = Math.cos(ang) * rdy + Math.sin(ang) * ody;
    seg(px, py, px + dx * jl, py + dy * jl, 'jaw', pk); points.push({ x: px, y: py, pocket: pk });
  };
  // pockets: 0 head-left, 1 head-right, 2 side-left, 3 side-right, 4 foot-left, 5 foot-right
  const cornerList = [[-1, -1, 0], [1, -1, 1], [-1, 1, 4], [1, 1, 5]];
  for (const [sx, sy, id] of cornerList) {
    const Ax = hw * sx, Ay = (hl - a) * sy, Bx = (hw - a) * sx, By = hl * sy;
    const mx = (Ax + Bx) / 2, my = (Ay + By) / 2, dx = sx / Math.SQRT2, dy = sy / Math.SQRT2;
    const rp = 0.062, s = rp + 0.016;
    pockets.push({ id, kind: 'corner', x: mx + dx * s, y: my + dy * s, r: rp, mx, my, dx, dy, aimX: mx + dx * 0.012, aimY: my + dy * 0.012, half: cm / 2,
      pts: [[Ax, Ay], [Bx, By]] });
    jaw(Ax, Ay, 0, sy, sx, 0, jawC, id);
    jaw(Bx, By, sx, 0, 0, sy, jawC, id);
  }
  for (const [sx, id] of [[-1, 2], [1, 3]]) {
    const rp = 0.056, s = rp + 0.012;
    pockets.push({ id, kind: 'side', x: hw * sx + sx * s, y: 0, r: rp, mx: hw * sx, my: 0, dx: sx, dy: 0, aimX: hw * sx + sx * 0.01, aimY: 0, half: sm / 2,
      pts: [[hw * sx, -sm / 2], [hw * sx, sm / 2]] });
    jaw(hw * sx, sm / 2, 0, -1, sx, 0, jawS, id);
    jaw(hw * sx, -sm / 2, 0, 1, sx, 0, jawS, id);
  }
  pockets.sort((p, q) => p.id - q.id);
  // rail noses
  for (const sx of [-1, 1]) {
    seg(hw * sx, -hl + a, hw * sx, -sm / 2, 'rail'); seg(hw * sx, sm / 2, hw * sx, hl - a, 'rail');
  }
  for (const sy of [-1, 1]) seg(-hw + a, hl * sy, hw - a, hl * sy, 'rail');
  return { W, L, R, segs, points, pockets, headY: -L / 4, footY: L / 4, headSpot: [0, -L / 4], footSpot: [0, L / 4] };
}

/* -------------------------------------------------------------------------------------------- simulation */
export function createSim(table, o = {}) {
  const T = table || makeTable();
  const P = { ...PHYS, ...(o.phys || {}) };
  const sim = {
    T, P, t: 0, h: o.h || P.h, balls: [], events: [], logEvents: o.events !== false,
    addBall(id, x, y) { const b = { id, x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true, pocket: -1, mv: false }; sim.balls.push(b); return b; },
    ball(id) { for (const b of sim.balls) if (b.id === id) return b; return null; },
    place(id, x, y) { const b = sim.ball(id); if (!b) return null; b.x = x; b.y = y; b.vx = b.vy = b.wx = b.wy = b.wz = 0; b.on = true; b.pocket = -1; b.mv = false; return b; },
    remove(id) { const b = sim.ball(id); if (b) { b.on = false; b.mv = false; b.vx = b.vy = b.wx = b.wy = b.wz = 0; } },
    /** strike ball `id` with the cue: aim angle (rad, 0 = +x), cue-ball speed (m/s), tip offset sx (side, −1…1 = left…right),
     *  sy (vertical, −1 draw … +1 follow); |offset| ≤ 1 ↔ half a ball radius from the centre. Returns the launch angle. */
    strike(id, ang, speed, sx = 0, sy = 0) {
      const b = sim.ball(id); if (!b || !b.on) return ang;
      const r = Math.hypot(sx, sy); if (r > 1) { sx /= r; sy /= r; }
      const a = ang - P.squirt * sx; // squirt: the cue ball leaves slightly away from the side of the tip
      const dx = Math.cos(a), dy = Math.sin(a);
      b.vx = dx * speed; b.vy = dy * speed;
      const k = 2.5 * speed / R;
      b.wz = k * sx * 0.5;
      b.wx = -dy * k * sy * 0.5; b.wy = dx * k * sy * 0.5;
      b.mv = true;
      if (sim.logEvents) sim.events.push({ t: sim.t, type: 'cue', a: id, v: speed });
      return a;
    },
    moving() { for (const b of sim.balls) if (b.on && b.mv) return true; return false; },
    energy() { let e = 0; for (const b of sim.balls) if (b.on) e += 0.5 * (b.vx * b.vx + b.vy * b.vy) + 0.5 * I_M * (b.wx * b.wx + b.wy * b.wy + b.wz * b.wz); return e; },
    step, run(maxT = 40) { const t0 = sim.t; while (sim.moving() && sim.t - t0 < maxT) step(); return sim.t - t0; },
    clone(o2 = {}) {
      const s = createSim(T, { phys: P, h: o2.h || sim.h, events: o2.events !== false });
      for (const b of sim.balls) s.balls.push({ ...b });
      s.t = sim.t; return s;
    },
    state() { return sim.balls.map((b) => ({ ...b })); },
    minGap() { let m = Infinity; const bs = sim.balls; for (let i = 0; i < bs.length; i++) if (bs[i].on) for (let j = i + 1; j < bs.length; j++) if (bs[j].on) m = Math.min(m, Math.hypot(bs[i].x - bs[j].x, bs[i].y - bs[j].y) - 2 * R); return m; },
  };

  const isMv = (b) => b.vx !== 0 || b.vy !== 0;
  function segToi(b, s, tmax) {
    const px = b.x - s.ax, py = b.y - s.ay, nx = -s.uy, ny = s.ux;
    let s0 = px * nx + py * ny;
    const vn0 = b.vx * nx + b.vy * ny;
    const side = s0 > 1e-12 ? 1 : s0 < -1e-12 ? -1 : (vn0 > 0 ? -1 : 1);
    const dist = s0 * side, vn = vn0 * side;
    if (vn >= -1e-12) return null;
    let t = dist <= R ? 0 : (dist - R) / -vn;
    if (t > tmax) return null;
    const qx = px + b.vx * t, qy = py + b.vy * t, pr = qx * s.ux + qy * s.uy;
    if (pr < 0 || pr > s.len) return null;
    if (dist < R - 0.004) return null; // deep inside (behind the face): leave it to the points / ignore
    return { t, nx: nx * side, ny: ny * side };
  }
  function ptToi(b, px, py, tmax) {
    const dx = b.x - px, dy = b.y - py;
    const bq = 2 * (dx * b.vx + dy * b.vy); if (bq >= 0) return null;
    const a = b.vx * b.vx + b.vy * b.vy, c = dx * dx + dy * dy - R * R;
    let t;
    if (c <= 0) t = 0;
    else { const disc = bq * bq - 4 * a * c; if (disc < 0) return null; t = (-bq - Math.sqrt(disc)) / (2 * a); }
    if (t > tmax) return null;
    return { t };
  }
  function ballToi(p, q, tmax) {
    const dx = q.x - p.x, dy = q.y - p.y, wx = q.vx - p.vx, wy = q.vy - p.vy;
    const bq = 2 * (dx * wx + dy * wy); if (bq >= 0) return null;
    const a = wx * wx + wy * wy; if (a < 1e-18) return null;
    const c = dx * dx + dy * dy - 4 * R * R;
    let t;
    if (c <= 0) t = 0;
    else { const disc = bq * bq - 4 * a * c; if (disc < 0) return null; t = (-bq - Math.sqrt(disc)) / (2 * a); }
    return t > tmax ? null : t;
  }
  function cushion(b, nx, ny, seg) {
    const vn = b.vx * nx + b.vy * ny; if (vn >= 0) return;
    const sp = -vn, e = Math.max(0.68, Math.min(0.82, P.eCush + 0.04 - 0.035 * sp));
    const jn = (1 + e) * sp;
    const tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty;
    const ut = vt - R * b.wz;
    let jt = -ut / 3.5; const lim = P.muCush * jn; if (jt > lim) jt = lim; else if (jt < -lim) jt = -lim;
    b.vx += jn * nx + jt * tx; b.vy += jn * ny + jt * ty;
    b.wz -= 2.5 * jt / R;
    b.wx *= P.cushSpinKeep; b.wy *= P.cushSpinKeep;
    b.mv = true;
    if (sim.logEvents) sim.events.push({ t: sim.t, type: 'cush', a: b.id, v: sp, kind: seg ? seg.kind : 'point' });
  }
  // a ball driven into several balls it is frozen to (the rack, clusters): solve all of those contacts at once —
  // plastic compression by projected Gauss–Seidel (order-independent, the simultaneous solution) followed by Poisson
  // restitution e·P per contact. Pairwise sequential impulses instead send a whole break down one line of balls.
  // Only contacts that are closing are included, so the impact front still travels row by row through the rack.
  const FROZEN = 0.0003;
  function cluster(p, q) {
    const C = [{ a: p, b: q }];
    for (const a of [p, q]) for (const b of sim.balls) {
      if (!b.on || b === p || b === q) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= 2 * R + FROZEN) continue;
      if ((a.vx - b.vx) * dx + (a.vy - b.vy) * dy > 0) C.push({ a, b });
    }
    if (C.length < 2) return false;
    const grp = new Set(); for (const c of C) { grp.add(c.a); grp.add(c.b); const dx = c.b.x - c.a.x, dy = c.b.y - c.a.y, d = Math.hypot(dx, dy); c.nx = dx / d; c.ny = dy / d; c.P = 0; }
    const G = [...grp], keep = G.map((b) => [b.vx, b.vy]);
    let e0 = 0; for (const b of G) e0 += b.vx * b.vx + b.vy * b.vy;
    for (let it = 0; it < 80; it++) {
      let mx = 0;
      for (const c of C) {
        const vr = (c.a.vx - c.b.vx) * c.nx + (c.a.vy - c.b.vy) * c.ny;
        const nP = Math.max(0, c.P + vr / 2), d = nP - c.P; if (!d) continue;
        c.P = nP; mx = Math.max(mx, Math.abs(d));
        c.a.vx -= d * c.nx; c.a.vy -= d * c.ny; c.b.vx += d * c.nx; c.b.vy += d * c.ny;
      }
      if (mx < 1e-10) break;
    }
    for (const c of C) if (c.P > 0) { const d = P.eBall * c.P; c.a.vx -= d * c.nx; c.a.vy -= d * c.ny; c.b.vx += d * c.nx; c.b.vy += d * c.ny; }
    let e1 = 0; for (const b of G) e1 += b.vx * b.vx + b.vy * b.vy;
    if (e1 > e0) { // Poisson restitution must never create energy
      const k = Math.sqrt(e0 / e1) * 0.999; G.forEach((b, i) => { b.vx = keep[i][0] + (b.vx - keep[i][0]) * k; b.vy = keep[i][1] + (b.vy - keep[i][1]) * k; });
    }
    for (const b of G) b.mv = true;
    if (sim.logEvents) for (const c of C) if (c.P > 0) sim.events.push({ t: sim.t, type: 'ball', a: c.a.id, b: c.b.id, v: c.P * 2 });
    return true;
  }
  function collide(p, q) {
    if (cluster(p, q)) return;
    let nx = q.x - p.x, ny = q.y - p.y; const d = Math.hypot(nx, ny) || 1e-9; nx /= d; ny /= d;
    const vr = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny; if (vr <= 0) return;
    const jn = (1 + P.eBall) / 2 * vr;
    const tx = -ny, ty = nx;
    const ut = (p.vx - q.vx) * tx + (p.vy - q.vy) * ty + R * (p.wz + q.wz);
    let jt = -ut / 7; const lim = P.muBall * jn; if (jt > lim) jt = lim; else if (jt < -lim) jt = -lim;
    p.vx += -jn * nx + jt * tx; p.vy += -jn * ny + jt * ty;
    q.vx += jn * nx - jt * tx; q.vy += jn * ny - jt * ty;
    p.wz += 2.5 * jt / R; q.wz += 2.5 * jt / R;
    p.mv = q.mv = true;
    if (sim.logEvents) sim.events.push({ t: sim.t, type: 'ball', a: p.id, b: q.id, v: vr });
  }
  function checkPocket(b) {
    for (const k of T.pockets) {
      const dx = b.x - k.x, dy = b.y - k.y;
      if (dx * dx + dy * dy < k.r * k.r) return drop(b, k);
    }
    if (Math.abs(b.x) > T.W / 2 + 0.075 || Math.abs(b.y) > T.L / 2 + 0.075) { // safety: never lose a ball off the slate
      let best = T.pockets[0], bd = Infinity;
      for (const k of T.pockets) { const d = Math.hypot(b.x - k.x, b.y - k.y); if (d < bd) { bd = d; best = k; } }
      drop(b, best);
    }
  }
  function drop(b, k) {
    b.on = false; b.mv = false; b.pocket = k.id;
    if (sim.logEvents) sim.events.push({ t: sim.t, type: 'pocket', a: b.id, p: k.id, v: Math.hypot(b.vx, b.vy), x: b.x, y: b.y });
    b.dropVx = b.vx; b.dropVy = b.vy;
    b.vx = b.vy = b.wx = b.wy = b.wz = 0;
  }
  function friction(b, h) {
    const g = GRAV;
    const ux = b.vx - R * b.wy, uy = b.vy + R * b.wx, u = Math.hypot(ux, uy);
    if (u > 1e-5) {
      const du = 3.5 * P.muS * g * h;
      let ts = h;
      if (u <= du) ts = u / (3.5 * P.muS * g);
      const ex = ux / u, ey = uy / u, dv = P.muS * g * ts;
      b.vx -= dv * ex; b.vy -= dv * ey;
      b.wx -= 2.5 * dv * ey / R; b.wy += 2.5 * dv * ex / R;
      if (u <= du) { b.wx = -b.vy / R; b.wy = b.vx / R; } // now rolling
    } else {
      const sp = Math.hypot(b.vx, b.vy), dec = P.muR * g * h;
      if (sp <= dec) { b.vx = b.vy = 0; b.wx = b.wy = 0; }
      else { const k = (sp - dec) / sp; b.vx *= k; b.vy *= k; b.wx = -b.vy / R; b.wy = b.vx / R; }
    }
    if (b.wz !== 0) { const dw = 2.5 * P.muSp * g * h / R; b.wz = Math.abs(b.wz) <= dw ? 0 : b.wz - Math.sign(b.wz) * dw; }
    const still = b.vx === 0 && b.vy === 0 && Math.abs(b.wx) < 1e-6 && Math.abs(b.wy) < 1e-6;
    if (still) { b.wx = b.wy = 0; b.mv = false; if (Math.abs(b.wz) < 1e-3) b.wz = 0; }
    else if (Math.hypot(b.vx, b.vy) < 1e-3 && Math.hypot(b.wx, b.wy) * R < 1e-3) { b.vx = b.vy = b.wx = b.wy = 0; b.mv = false; }
  }
  function step() {
    const bs = sim.balls, n = bs.length;
    let rem = sim.h, guard = 0;
    while (rem > 1e-12 && guard++ < 600) {
      let tmin = rem, kind = 0, A = null, B = null, S = null, nx = 0, ny = 0;
      for (let i = 0; i < n; i++) {
        const b = bs[i]; if (!b.on) continue;
        const mi = isMv(b);
        if (mi) {
          for (const s of T.segs) { const r = segToi(b, s, tmin); if (r && r.t < tmin) { tmin = r.t; kind = 1; A = b; S = s; nx = r.nx; ny = r.ny; } else if (r && r.t === 0 && kind === 0) { tmin = 0; kind = 1; A = b; S = s; nx = r.nx; ny = r.ny; } }
          for (const p of T.points) { const r = ptToi(b, p.x, p.y, tmin); if (r && (r.t < tmin || (r.t === 0 && kind === 0))) { tmin = r.t; kind = 2; A = b; S = null; const qx = b.x + b.vx * r.t - p.x, qy = b.y + b.vy * r.t - p.y, d = Math.hypot(qx, qy) || 1; nx = qx / d; ny = qy / d; } }
        }
        for (let j = i + 1; j < n; j++) {
          const q = bs[j]; if (!q.on) continue;
          if (!mi && !isMv(q)) continue;
          const t = ballToi(b, q, tmin); if (t !== null && (t < tmin || (t === 0 && kind === 0))) { tmin = t; kind = 3; A = b; B = q; }
        }
      }
      if (tmin > 0) for (const b of bs) if (b.on && (b.vx !== 0 || b.vy !== 0)) { b.x += b.vx * tmin; b.y += b.vy * tmin; }
      rem -= tmin; sim.t += tmin;
      if (kind === 1 || kind === 2) cushion(A, nx, ny, S);
      else if (kind === 3) collide(A, B);
      for (const b of bs) if (b.on && b.mv) checkPocket(b);
      if (!kind) break;
    }
    if (rem > 0) sim.t += rem;
    for (const b of bs) if (b.on && b.mv) friction(b, sim.h);
    for (const b of bs) if (b.on && !b.mv && (b.vx || b.vy || b.wx || b.wy)) b.mv = true;
  }
  return sim;
}

/* -------------------------------------------------------------------------------------------- racks */
export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// 8-ball: apex on the foot spot, 8 in the centre of the third row, one solid + one stripe in the back corners (WPA)
const RACK8 = [[1], [9, 2], [10, 8, 3], [11, 4, 12, 5], [6, 13, 7, 14, 15]];
// 9-ball: diamond, 1 on the foot spot, 9 in the middle
const RACK9 = [[1], [2, 3], [4, 9, 5], [6, 7], [8]];
export function rackPositions(table, game = '8', seed = 1) {
  const rnd = mulberry(seed), gap = 0.00012, d = 2 * R + gap, out = [];
  const rows = game === '9' ? RACK9 : RACK8;
  const [fx, fy] = table.footSpot;
  // 8-ball: randomise the other balls a little (the rack layout differs every frame) but keep WPA placement
  let order = rows.map((r) => r.slice());
  if (game !== '9') {
    const rest = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    // back corners: one solid one stripe
    const solid = rest.find((n) => n < 8), stripe = rest.find((n) => n > 8);
    const others = rest.filter((n) => n !== solid && n !== stripe);
    let k = 0;
    order = RACK8.map((row, ri) => row.map((n, ci) => {
      if (ri === 0) return 1;
      if (ri === 2 && ci === 1) return 8;
      if (ri === 4 && ci === 0) return rnd() < 0.5 ? solid : stripe;
      if (ri === 4 && ci === 4) return null;
      return others[k++];
    }));
    order[4][4] = order[4][0] === solid ? stripe : solid;
  }
  const widths = game === '9' ? [1, 2, 3, 2, 1] : [1, 2, 3, 4, 5];
  order.forEach((row, ri) => {
    const wn = widths[ri];
    row.forEach((n, ci) => {
      const x = fx + (ci - (wn - 1) / 2) * d + (rnd() - 0.5) * 0.00008;
      const y = fy + ri * d * Math.sqrt(3) / 2 + (rnd() - 0.5) * 0.00008;
      out.push({ id: n, x, y });
    });
  });
  return out;
}

/** aim preview: sweep a ball of radius R from (x, y) along the unit direction (dx, dy) and return the first thing it
 *  touches: {d, type: 'ball' | 'cush' | 'none', id, x, y (centre at contact), nx, ny (contact normal, pointing at the
 *  moving ball)}. Same geometry as the simulation (cushion noses, jaw faces, jaw points). */
export function castBall(T, balls, x, y, dx, dy, skip = 0, maxD = 4) {
  let best = { d: maxD, type: 'none', id: -1, nx: 0, ny: 0 };
  const ray = (cx, cy, rad) => { // ray vs circle (centre, radius) → distance or -1
    const fx = x - cx, fy = y - cy, b = fx * dx + fy * dy, c = fx * fx + fy * fy - rad * rad;
    if (c < 0) return b < 0 ? 0 : -1;
    const disc = b * b - c; if (disc < 0) return -1;
    const t = -b - Math.sqrt(disc); return t >= 0 ? t : -1;
  };
  for (const b of balls) {
    if (!b.on || b.id === skip) continue;
    const t = ray(b.x, b.y, 2 * R); if (t >= 0 && t < best.d) best = { d: t, type: 'ball', id: b.id };
  }
  for (const s of T.segs) {
    const nx = -s.uy, ny = s.ux, s0 = (x - s.ax) * nx + (y - s.ay) * ny, side = s0 >= 0 ? 1 : -1;
    const vn = (dx * nx + dy * ny) * side; if (vn >= 0) continue;
    const t = (s0 * side - R) / -vn; if (t < 0 || t >= best.d) continue;
    const pr = (x + dx * t - s.ax) * s.ux + (y + dy * t - s.ay) * s.uy; if (pr < 0 || pr > s.len) continue;
    best = { d: t, type: 'cush', id: -1, nx: nx * side, ny: ny * side };
  }
  for (const p of T.points) {
    const t = ray(p.x, p.y, R); if (t >= 0 && t < best.d) { const qx = x + dx * t - p.x, qy = y + dy * t - p.y, l = Math.hypot(qx, qy) || 1; best = { d: t, type: 'cush', id: -1, nx: qx / l, ny: qy / l }; }
  }
  best.x = x + dx * best.d; best.y = y + dy * best.d;
  if (best.type === 'ball') { const o = balls.find((b) => b.id === best.id); const l = Math.hypot(best.x - o.x, best.y - o.y) || 1; best.nx = (best.x - o.x) / l; best.ny = (best.y - o.y) / l; }
  return best;
}

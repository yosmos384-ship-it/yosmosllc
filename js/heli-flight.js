// heli-flight.js — V13 HELI: the helicopter's flight model (manual flight) and the city-tour autopilot path.
// Pure math, no THREE, no DOM, no side effects on import (unit-tested in node: tests/v13-heli.test.mjs).
//
// World frame (same as data/heli-area.json): metres, x = east, z = south, y = up (absolute, terrain included).
// Heading h (rad): 0 = north (−z), π/2 = east (+x), clockwise positive (compass). forward = (sin h, −cos h).
//
//   createFlight({ ground(x,z) → y, obstacle(x,z) → roof y | −Infinity, radius, ceiling, minClear }) → model
//     model.state  { x, y, z, vx, vy, vz, h, tilt (nose-down +), roll (right +), yawRate, landed, agl, rpm, power, bumps, edge, speed, floorAgl }
//     model.step(dt, { col, pitch, roll, yaw }, { autoHover })   col/pitch/roll/yaw ∈ [−1, 1]
//     model.place(x, y, z, h, { landed, speed, vy, tilt, roll })
//   buildTour(pois, { home, start, ground, obstacle?, cruise, cruiseAgl, orbitSpeed, sweep, land }) → path
//     path.sample(t) → { x, y, z, h, tilt, roll, speed, vy, agl, leg, phase, t }   path.duration   path.legs[{ poi, index, t0, t1, tApproach }]
//     path.points { X, Y, Z, V, T, S } (dense route, T absolute)   path.length   path.maxSpeed   path.n
//   orderPois(pois, home) → pois in a short loop (nearest neighbour + 2-opt)
//   telemetry: the latest pose written by path.sample / model.step (+ the last tour path and POI list) — read by the
//     on-screen avionics (heli-ui.js) so they work with the existing heli.js calls; heli.js may also pass these
//     explicitly to ui.update().
//
// Autopilot route (V13.1): exact geometry instead of a spline through loose control points —
//   take-off: vertical lift to a 5 m hover, pedal turn in the hover toward the first leg, then an accelerating climb-out;
//   each place: a circular orbit (radius from the place's size, ≥ ~170° sweep, slow 26 m/s) joined to the next one by
//     the common tangent line (Dubins-style; the turn direction of every orbit is chosen by a small DP for the
//     shortest total route), so the heading is continuous and the bank only changes where a turn starts / ends;
//   landing: a straight final approach on a ~6° glide, decelerating to an 8 m hover over the pad, a pedal turn to the
//     parked heading (nose to the house), and a slow vertical touch-down;
//   altitude: AGL targets smoothed along the route, kept ≥ 60 m above terrain and ≥ 30 m above roofs (obstacles),
//     vertical speed limited (+7 / −5 m/s); attitude (tilt from acceleration + drag, bank from the turn) smoothed in time.

export const G = 9.81;
export const MAX_SPEED = 250 / 3.6;          // 69.4 m/s (≈ 250 km/h, light-twin VNE class)
export const KMH = 3.6;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const mod = (a, m) => ((a % m) + m) % m;
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
export const headingOf = (dx, dz) => Math.atan2(dx, -dz);

/* ================================================================================== telemetry (avionics bus) */
export const telemetry = { pose: null, src: '', at: 0, path: null, pois: null, ground: null, obstacle: null };
function tele(src, s) {
  const p = telemetry.pose || (telemetry.pose = {});
  p.x = s.x; p.y = s.y; p.z = s.z; p.h = s.h; p.speed = s.speed || 0; p.agl = s.agl || 0; p.vy = s.vy || 0; p.phase = s.phase || ''; p.leg = s.leg != null ? s.leg : -1;
  telemetry.src = src; telemetry.at = now();
}

/* ================================================================================== manual flight model */
// Arcade-realistic: the cyclic sets a target disc tilt (attitude lag ≈ 0.25 s), thrust ≈ weight so the horizontal
// acceleration is g·tan(tilt) minus quadratic + linear drag (VNE ≈ 250 km/h at full forward cyclic); the collective
// commands a climb rate (+10 / −8 m/s) with ground effect cushioning the last few metres; pedals command a yaw rate,
// and at speed a bank turns the helicopter (coordinated turn, side-slip damped). No input + autoHover → the cyclic
// levels and brakes the helicopter to a hover and the collective holds altitude. Digital (keyboard) inputs are slewed
// (~0.2 s) so key presses don't jerk the attitude. Terrain / roofs: a 0–3 s look-ahead raises the climb rate to keep a
// speed-dependent clearance (12 m + 0.4 s × speed, ≈ 40 m at cruise) — low and slow you can still land anywhere;
// touching a roof is a soft bump (pushed up, speed halved).
export function createFlight(o = {}) {
  const ground = typeof o.ground === 'function' ? o.ground : () => 0;
  const obstacle = typeof o.obstacle === 'function' ? o.obstacle : () => -Infinity;
  telemetry.ground = ground; telemetry.obstacle = typeof o.obstacle === 'function' ? o.obstacle : null;
  const RADIUS0 = o.radius || 6000;
  let RADIUS = RADIUS0;                         // grows to include a place() outside it (no teleport to the edge)
  const CEIL = o.ceiling || 900;               // m above ground (soft)
  const MINC = o.minClear != null ? o.minClear : 12;
  const MAXT = 0.40, MAXR = 0.50;              // full cyclic: 23° nose-down, 29° bank
  const KQ = 0.00068, KL = 0.012;              // longitudinal drag → ~69 m/s at MAXT
  const KQR = 0.004, KLR = 0.08;               // side drag (fuselage broadside)
  const st = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, h: 0, tilt: 0, roll: 0, yawRate: 0, landed: true, agl: 0, rpm: 0.65, power: 0.3, bumps: 0, edge: false, speed: 0, floorAgl: 0, guard: false };
  const ci = { col: 0, pitch: 0, roll: 0, yaw: 0 };   // slewed controls
  function place(x, y, z, h, p = {}) {
    st.x = x; st.z = z; st.h = h || 0;
    const g = ground(x, z);
    st.y = isFinite(y) ? Math.max(y, g) : g;
    const sp = p.speed || 0;
    st.vx = Math.sin(st.h) * sp; st.vz = -Math.cos(st.h) * sp; st.vy = p.vy || 0;
    st.tilt = p.tilt || 0; st.roll = p.roll || 0; st.yawRate = 0;
    st.landed = p.landed != null ? !!p.landed : st.y - g < 0.05;
    st.agl = st.y - g; st.speed = sp;
    RADIUS = Math.max(RADIUS0, Math.hypot(x, z) + 150);
    ci.col = ci.pitch = ci.roll = ci.yaw = 0;
  }
  function floorAt(x, z) { const g = ground(x, z), ob = obstacle(x, z); return ob > g ? ob : g; }
  function slew(dt, inp) {
    const k = 1 - Math.exp(-dt / 0.16);
    for (const key of ['col', 'pitch', 'roll', 'yaw']) {
      const v = clamp(+inp[key] || 0, -1, 1);
      // releasing a control recentres a little faster than applying it
      const kk = Math.abs(v) < Math.abs(ci[key]) ? 1 - Math.exp(-dt / 0.11) : k;
      ci[key] += (v - ci[key]) * kk;
      if (Math.abs(ci[key]) < 1e-4 && v === 0) ci[key] = 0;
    }
    return ci;
  }
  function sub(dt, inp, auto) {
    const c = slew(dt, inp);
    const col = c.col, cp = c.pitch, cr = c.roll, cy = c.yaw;
    const g0 = ground(st.x, st.z);
    if (st.landed) {
      st.vx = st.vz = 0; st.vy = 0; st.tilt *= 0.9; st.roll *= 0.9; st.yawRate = 0;
      st.y = Math.max(st.y, g0); st.agl = st.y - g0; st.speed = 0;
      st.rpm += (0.92 - st.rpm) * (1 - Math.exp(-dt * 0.8));
      st.power = 0.25 + 0.3 * Math.max(0, col);
      if ((+inp.col || 0) > 0.12 && col > 0.1) { st.landed = false; st.vy = 0.5; }
      return;
    }
    const fx = Math.sin(st.h), fz = -Math.cos(st.h), rx = Math.cos(st.h), rz = Math.sin(st.h);
    let vf = st.vx * fx + st.vz * fz, vr = st.vx * rx + st.vz * rz;
    const sp = Math.hypot(vf, vr);
    // ---- attitude (cyclic)
    const tT = Math.abs(cp) > 0.04 || !auto ? cp * MAXT : clamp(-vf * 0.032, -0.3, 0.3);
    const tR = Math.abs(cr) > 0.04 || !auto ? cr * MAXR : clamp(-vr * 0.05, -0.3, 0.3);
    const ka = 1 - Math.exp(-dt * 4.2);
    st.tilt += (tT - st.tilt) * ka; st.roll += (tR - st.roll) * ka;
    // ---- horizontal dynamics in the body frame
    const s = smooth(12, 32, Math.abs(vf));                  // 0 hover … 1 forward flight
    const af = G * Math.tan(st.tilt) - (KQ * vf * Math.abs(vf) + KL * vf);
    const ar = G * Math.tan(st.roll) * (1 - 0.85 * s) - (KQR * vr * Math.abs(vr) + KLR * vr) - vr * 0.6 * s; // at speed: bank → turn, slip damped
    vf += af * dt; vr += ar * dt;
    // ---- yaw: pedals (weaker at speed) + coordinated turn from the bank
    const turn = s * G * Math.tan(st.roll) / Math.max(18, Math.abs(vf)) * Math.sign(vf || 1);
    const tY = cy * 1.15 * (1 - 0.55 * s) + turn;
    st.yawRate += (tY - st.yawRate) * (1 - Math.exp(-dt * 3.0));
    st.h = wrapPi(st.h + st.yawRate * dt);
    // velocity stays with the airframe in a coordinated turn (rotate the body components with the heading)
    const nfx = Math.sin(st.h), nfz = -Math.cos(st.h), nrx = Math.cos(st.h), nrz = Math.sin(st.h);
    st.vx = vf * nfx + vr * nrx; st.vz = vf * nfz + vr * nrz;
    // ---- vertical (collective = climb-rate command)
    st.agl = st.y - g0;
    let tV = Math.abs(col) < 0.04 && auto ? (st.agl < 1.0 ? -0.3 : 0) : col > 0 ? col * 10 : col * 8;
    if (tV < 0 && st.agl < 14) tV *= Math.max(0.08, Math.pow(st.agl / 14, 1.25)); // ground effect cushion
    if (st.agl > CEIL - 60) tV = Math.min(tV, (CEIL - st.agl) * 0.12);  // soft ceiling
    // terrain-safe minimum height at speed: look ahead 0 … 3 s along the velocity
    const hs = Math.hypot(st.vx, st.vz);
    st.guard = false;
    if (hs > 6) {
      let fa = -Infinity;
      for (const k of [0, 0.6, 1.2, 2.0, 3.0]) fa = Math.max(fa, floorAt(st.x + st.vx * k, st.z + st.vz * k));
      const clear = (MINC + 0.4 * hs) * smooth(6, 16, hs);
      const need = fa + clear - st.y;
      if (need > 0) { tV = Math.max(tV, Math.min(12, need * 0.9)); st.guard = true; }
    }
    st.vy += (tV - st.vy) * (1 - Math.exp(-dt * (st.agl < 14 && tV > st.vy ? 4.0 : st.guard ? 3.0 : 1.9)));
    st.x += st.vx * dt; st.y += st.vy * dt; st.z += st.vz * dt;
    // ---- area edge: soft push back inside
    const r = Math.hypot(st.x, st.z);
    st.edge = r > RADIUS;
    if (RADIUS > RADIUS0 && r < RADIUS - 150) RADIUS = Math.max(RADIUS0, r + 150); // shrink back once inside
    if (r > RADIUS) {
      const nx = st.x / r, nz = st.z / r, out = st.vx * nx + st.vz * nz;
      if (out > 0) { st.vx -= nx * out * 1.2; st.vz -= nz * out * 1.2; }
      st.x = nx * RADIUS; st.z = nz * RADIUS;
    }
    // ---- touch-down / soft collision
    const g1 = ground(st.x, st.z), ob = obstacle(st.x, st.z);
    if (ob > g1 + 0.5 && st.y < ob) { st.y = ob + 0.05; st.vy = Math.max(1.5, st.vy); st.vx *= 0.5; st.vz *= 0.5; st.bumps++; }
    if (st.y <= g1) {
      st.y = g1;
      const hsp = Math.hypot(st.vx, st.vz);
      if (st.vy <= 0.2 && hsp < 4 && col <= 0.12) { st.landed = true; st.vx = st.vz = st.vy = 0; st.yawRate = 0; }
      else { st.vy = Math.max(0, st.vy); st.vx *= 0.8; st.vz *= 0.8; if (hsp > 6) st.bumps++; }
    }
    st.agl = st.y - g1;
    st.floorAgl = st.y - Math.max(g1, ob);
    st.rpm += (1 - st.rpm) * (1 - Math.exp(-dt * 1.2));
    st.power = clamp(0.45 + 0.35 * Math.max(0, st.vy / 10) + 0.25 * Math.abs(st.tilt) / MAXT + 0.1 * sp / MAX_SPEED, 0.2, 1);
    st.speed = Math.hypot(st.vx, st.vz);
  }
  function step(dt, inp = {}, opts = {}) {
    dt = Math.min(0.1, Math.max(0, +dt || 0));
    const auto = opts.autoHover !== false;
    const n = Math.max(1, Math.ceil(dt / (1 / 60)));
    for (let i = 0; i < n; i++) sub(dt / n, inp || {}, auto);
    tele('manual', { x: st.x, y: st.y, z: st.z, h: st.h, speed: st.speed, agl: st.agl, vy: st.vy, phase: st.landed ? 'landed' : 'manual', leg: -1 });
    return st;
  }
  return { state: st, step, place, MAXT, MAXR, controls: ci };
}

/* ================================================================================== tour order */
// Order POIs into a short loop starting / ending at home (nearest neighbour + 2-opt).
export function orderPois(pois, home = { x: 0, z: 0 }) {
  const P = (pois || []).slice();
  if (P.length < 3) { telemetry.pois = P; return P; }
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const out = []; let cur = home; const left = P.slice();
  while (left.length) { let bi = 0, bd = Infinity; left.forEach((p, i) => { const q = d(cur, p); if (q < bd) { bd = q; bi = i; } }); cur = left.splice(bi, 1)[0]; out.push(cur); }
  const tour = [home, ...out, home];
  let better = true, guard = 0;
  while (better && guard++ < 60) {
    better = false;
    for (let i = 1; i < tour.length - 2; i++) for (let k = i + 1; k < tour.length - 1; k++) {
      const a = tour[i - 1], b = tour[i], c = tour[k], e = tour[k + 1];
      if (d(a, c) + d(b, e) < d(a, b) + d(c, e) - 0.5) { const seg = tour.slice(i, k + 1).reverse(); tour.splice(i, k - i + 1, ...seg); better = true; }
    }
  }
  const res = tour.slice(1, -1);
  telemetry.pois = res;
  return res;
}

/* ================================================================================== route geometry */
// A "circle" { x, z, r, d } is traversed clockwise (d = +1, turning right, centre on the right) or counter-clockwise
// (d = −1). r = 0 is a point. Common tangent from c1 to c2 (leaving c1 / arriving at c2 in their senses):
// Δ = L·u + k·right(u) with k = d2·r2 − d1·r1 → L = √(|Δ|² − k²), u = rot(Δ̂, −atan2(k, L)).
function tangent(c1, c2) {
  const dx = c2.x - c1.x, dz = c2.z - c1.z, D2 = dx * dx + dz * dz;
  const k = c2.d * c2.r - c1.d * c1.r;
  if (D2 <= k * k + 1) return null;
  const L = Math.sqrt(D2 - k * k);
  const a = Math.atan2(dz, dx) - Math.atan2(k, L);
  const ux = Math.cos(a), uz = Math.sin(a), rx = -uz, rz = ux;
  return { ax: c1.x - c1.d * c1.r * rx, az: c1.z - c1.d * c1.r * rz, bx: c2.x - c2.d * c2.r * rx, bz: c2.z - c2.d * c2.r * rz, ux, uz, L };
}
const angOn = (c, x, z) => Math.atan2(z - c.z, x - c.x);
function sweepOf(c, th0, th1, minSweep) {
  let sw = mod((th1 - th0) * c.d, TAU);
  if (sw > TAU - 1e-4 && minSweep <= 0) sw = 0;
  if (sw < minSweep - 1e-6) sw += TAU * Math.ceil((minSweep - sw) / TAU - 1e-9);
  return sw;
}

// nodes: [{ x, z, ds: [signed radii: +r clockwise, −r counter-clockwise, 0 = point], minSweep, th0? (fixed entry
// angle for the start circle) }]; returns the chosen signed radius per node (DP over (previous, current) choice; cost =
// line length + 2.2 × arc length, i.e. ≈ flight time, since the orbits are flown ~2.3× slower than the legs) or null.
const circ = (n, sr) => ({ x: n.x, z: n.z, r: Math.abs(sr), d: sr < 0 ? -1 : 1 });
const ARC_W = 2.2;
function chooseSenses(nodes) {
  const n = nodes.length;
  // state: index into nodes[i].ds; dp[i][a][b] = best cost arriving at node i with sense a for i−1 and b for i
  let dp = new Map(); // key 'a|b' → { cost, path: [..senses], entry }
  const c0 = nodes[0];
  for (const d0 of c0.ds) dp.set('x|' + d0, { cost: 0, senses: [d0], entry: c0.th0 != null ? c0.th0 : null });
  for (let i = 0; i < n - 1; i++) {
    const cur = nodes[i], nxt = nodes[i + 1];
    const nd = new Map();
    for (const [, s] of dp) {
      const di = s.senses[i];
      const C1 = circ(cur, di);
      for (const dj of nxt.ds) {
        const C2 = circ(nxt, dj);
        const tg = tangent(C1, C2); if (!tg) continue;
        let arc = 0;
        if (C1.r > 0) {
          const thOut = angOn(C1, tg.ax, tg.az);
          const thIn = s.entry != null ? s.entry : thOut;
          arc = sweepOf(C1, thIn, thOut, i === 0 ? 0 : cur.minSweep) * C1.r;
          if (i === 0 && s.entry == null) arc = 0;
        }
        const cost = s.cost + arc * ARC_W + tg.L;
        const key = di + '|' + dj;
        const entry = C2.r > 0 ? angOn(C2, tg.bx, tg.bz) : null;
        const prev = nd.get(key);
        if (!prev || cost < prev.cost) nd.set(key, { cost, senses: s.senses.concat([dj]), entry });
      }
    }
    if (!nd.size) return null;
    dp = nd;
  }
  let best = null; for (const [, s] of dp) if (!best || s.cost < best.cost) best = s;
  return best ? best.senses : null;
}

// box-filter helpers over index windows given by a position array (distance or time)
function boxBy(vals, pos, half, passes = 2) {
  const N = vals.length; let a = Float64Array.from(vals);
  for (let p = 0; p < passes; p++) {
    const out = new Float64Array(N); let j0 = 0, j1 = 0, sum = 0;
    for (let i = 0; i < N; i++) {
      while (j1 < N && pos[j1] <= pos[i] + half) { sum += a[j1]; j1++; }
      while (pos[j0] < pos[i] - half) { sum -= a[j0]; j0++; }
      out[i] = sum / Math.max(1, j1 - j0);
    }
    a = out;
  }
  return a;
}
function maxBy(vals, pos, half) {
  const N = vals.length, out = new Float64Array(N); let j0 = 0;
  for (let i = 0; i < N; i++) {
    while (pos[i] - pos[j0] > half) j0++;
    let m = -Infinity; for (let j = j0; j < N && pos[j] - pos[i] <= half; j++) if (vals[j] > m) m = vals[j];
    out[i] = m;
  }
  return out;
}

/* ================================================================================== tour route */
//   pois: [{ x, z, r?, agl?, id, … }]  (orbited in the given order)
//   o.home {x, z, h}: the pad (take-off unless o.start; landing at the end unless o.land === false); h = parked heading
//   o.start {x, y, z, h, speed}: start from the helicopter's current state (resume after manual flight)
//   o.obstacle(x, z): roof heights (defaults to the one given to createFlight() with the same ground function)
export function buildTour(pois = [], o = {}) {
  const ground = typeof o.ground === 'function' ? o.ground : () => 0;
  const obstacle = typeof o.obstacle === 'function' ? o.obstacle : (telemetry.obstacle && telemetry.ground === o.ground ? telemetry.obstacle : null);
  const home = o.home || { x: 0, z: 0, h: 0 };
  const homeH = isFinite(home.h) ? home.h : 0;
  const LAND = o.land !== false, TAKEOFF = !o.start;
  const CRUISE = Math.min(MAX_SPEED * 0.95, o.cruise || 66), CRUISE_AGL = o.cruiseAgl || 200, ORBIT_V = o.orbitSpeed || 28;
  const SWEEP = o.sweep != null ? o.sweep : Math.PI * 0.8;
  const FINAL_V = 30, ACC = 1.9, DEC = 1.5, LATG = G * Math.tan(0.44);
  const HOVER0 = 5, HOVER1 = 8;                         // take-off hover / landing hover heights (m AGL)
  const VS_UP = 7, VS_DN = 5;                           // vertical speed limits on the route (m/s)
  const gHome = ground(home.x, home.z);

  /* ---- nodes: start (point or turning circle), the orbits, home */
  const nodes = [];
  let startY = gHome + HOVER0, startV = 0;
  if (TAKEOFF) nodes.push({ x: home.x, z: home.z, r: 0, ds: [0], minSweep: 0, role: 'start' });
  else {
    const s = o.start; startV = Math.max(0, s.speed || 0);
    startY = isFinite(s.y) ? s.y : ground(s.x, s.z) + 60;
    if (startV < 8) nodes.push({ x: s.x, z: s.z, r: 0, ds: [0], minSweep: 0, role: 'start', hoverStart: true });
    else {
      // turning circle through the start position, tangent to the current heading (either side)
      const rs = clamp(startV * startV / (G * Math.tan(0.42)), 120, 420);
      const rx = Math.cos(s.h), rz = Math.sin(s.h);
      nodes.push({ x: s.x, z: s.z, r: rs, ds: [rs, -rs], minSweep: 0, role: 'start', sx: s.x, sz: s.z, rx, rz, sh: s.h });
    }
  }
  for (let i = 0; i < pois.length; i++) {
    const P = pois[i];
    const R = clamp((P.r || 250) * (o.orbitK || 0.6) + (o.orbitR0 || 120), 200, 520);
    nodes.push({ x: P.x, z: P.z, r: R, ds: [R, -R, Math.max(180, R * 0.72), -Math.max(180, R * 0.72)], minSweep: SWEEP, role: 'orbit', leg: i, agl: P.agl || 150, poi: P });
  }
  if (LAND) nodes.push({ x: home.x, z: home.z, r: 0, ds: [0], minSweep: 0, role: 'home' });
  else if (nodes.length === 1) nodes.push({ x: home.x, z: home.z, r: 0, ds: [0], minSweep: 0, role: 'home' });
  // the start circle: centre depends on the chosen sense → expand into two candidate nodes handled by trying both
  let senses = null, startNode = nodes[0];
  const tryStart = (d) => {
    if (startNode.r <= 0) return chooseSenses(nodes);
    const c = { ...startNode, x: startNode.sx + d * startNode.r * startNode.rx, z: startNode.sz + d * startNode.r * startNode.rz, ds: [d * startNode.r] };
    c.th0 = Math.atan2(startNode.sz - c.z, startNode.sx - c.x);
    const ns = nodes.slice(); ns[0] = c;
    const sn = chooseSenses(ns);
    return sn ? { sn, ns } : null;
  };
  let nodesUsed = nodes;
  if (startNode.r > 0) {
    let best = null;
    for (const d of [1, -1]) {
      const r = tryStart(d); if (!r) continue;
      const len = routeLength(r.ns, r.sn);
      if (!best || len < best.len) best = { ...r, len };
    }
    if (best) { senses = best.sn; nodesUsed = best.ns; }
    else { nodesUsed = nodes.slice(); nodesUsed[0] = { x: startNode.sx, z: startNode.sz, r: 0, ds: [0], minSweep: 0, role: 'start' }; senses = chooseSenses(nodesUsed); }
  } else senses = chooseSenses(nodesUsed);
  if (!senses) {
    // degenerate (concentric places …): drop the orbits' radii to points
    nodesUsed = nodesUsed.map((n) => ({ ...n, r: 0, ds: [0], th0: null }));
    senses = chooseSenses(nodesUsed) || nodesUsed.map(() => 0);
  }

  /* ---- primitives: arc on node i, then the tangent line to node i+1 */
  const prims = [];
  let entry = nodesUsed[0].th0 != null ? nodesUsed[0].th0 : null;
  for (let i = 0; i < nodesUsed.length - 1; i++) {
    const A = { ...nodesUsed[i], ...circ(nodesUsed[i], senses[i]) }, B = { ...nodesUsed[i + 1], ...circ(nodesUsed[i + 1], senses[i + 1]) };
    const tg = tangent(A, B) || { ax: A.x, az: A.z, bx: B.x, bz: B.z, ux: (B.x - A.x) / (Math.hypot(B.x - A.x, B.z - A.z) || 1), uz: (B.z - A.z) / (Math.hypot(B.x - A.x, B.z - A.z) || 1), L: Math.hypot(B.x - A.x, B.z - A.z) };
    if (A.r > 0) {
      const thOut = angOn(A, tg.ax, tg.az), thIn = entry != null ? entry : thOut;
      const sw = sweepOf(A, thIn, thOut, i === 0 ? 0 : A.minSweep);
      if (sw * A.r > 0.5) prims.push({ type: 'arc', cx: A.x, cz: A.z, r: A.r, d: A.d, th0: thIn, sw, len: sw * A.r, role: A.role, leg: A.leg != null ? A.leg : -1, agl: A.agl });
    }
    const roleL = B.role === 'orbit' ? 'approach' : 'return';
    if (tg.L > 0.5) prims.push({ type: 'line', ax: tg.ax, az: tg.az, ux: tg.ux, uz: tg.uz, len: tg.L, role: roleL, leg: B.role === 'orbit' ? B.leg : -1 });
    entry = B.r > 0 ? angOn(B, tg.bx, tg.bz) : null;
  }
  if (!prims.length) prims.push({ type: 'line', ax: nodesUsed[0].x, az: nodesUsed[0].z, ux: Math.sin(homeH), uz: -Math.cos(homeH), len: 1, role: 'return', leg: -1 });

  /* ---- densify (≈ 5 m) */
  const X = [], Z = [], H = [], K = [], ROLE = [], LEG = [], PI = [];
  const pushPt = (x, z, h, k, role, leg, pi) => { X.push(x); Z.push(z); H.push(h); K.push(k); ROLE.push(role); LEG.push(leg); PI.push(pi); };
  prims.forEach((p, pi) => {
    const m = Math.max(1, Math.ceil(p.len / 5));
    for (let k = 0; k < m; k++) {
      const u = k / m, s = p.len * u;
      if (p.type === 'line') pushPt(p.ax + p.ux * s, p.az + p.uz * s, headingOf(p.ux, p.uz), 0, p.role, p.leg, pi);
      else { const th = p.th0 + p.d * p.sw * u; pushPt(p.cx + Math.cos(th) * p.r, p.cz + Math.sin(th) * p.r, headingOf(-Math.sin(th) * p.d, Math.cos(th) * p.d), p.d / p.r, p.role, p.leg, pi); }
    }
  });
  { const p = prims[prims.length - 1];
    if (p.type === 'line') pushPt(p.ax + p.ux * p.len, p.az + p.uz * p.len, headingOf(p.ux, p.uz), 0, p.role, p.leg, prims.length - 1);
    else { const th = p.th0 + p.d * p.sw; pushPt(p.cx + Math.cos(th) * p.r, p.cz + Math.sin(th) * p.r, headingOf(-Math.sin(th) * p.d, Math.cos(th) * p.d), p.d / p.r, p.role, p.leg, prims.length - 1); } }
  const N = X.length;
  const S = new Float64Array(N);
  for (let i = 1; i < N; i++) S[i] = S[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]);
  const LEN = S[N - 1];
  const SE = (i) => LEN - S[i];
  // the final approach = the last ~900 m of the route home
  for (let i = 0; i < N; i++) if (LAND && ROLE[i] === 'return' && SE(i) < 900) ROLE[i] = 'final';

  /* ---- speed profile */
  const Ks = boxBy(K, S, 20, 1);
  const V = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const r = ROLE[i];
    let vt = r === 'orbit' ? ORBIT_V : r === 'final' ? FINAL_V : CRUISE;
    if (r === 'start') vt = Math.max(CRUISE * 0.7, startV);
    const kl = Math.abs(Ks[i]) > 1e-6 ? Math.sqrt(LATG / Math.abs(Ks[i])) : 1e9;
    V[i] = Math.min(vt, kl, MAX_SPEED);
  }
  V[0] = TAKEOFF || startV < 8 ? 0 : Math.min(V[0], startV);
  if (LAND) V[N - 1] = 0;
  for (let i = 1; i < N; i++) { const ds = S[i] - S[i - 1]; V[i] = Math.min(V[i], Math.sqrt(V[i - 1] * V[i - 1] + 2 * ACC * ds)); }
  for (let i = N - 2; i >= 0; i--) { const ds = S[i + 1] - S[i]; V[i] = Math.min(V[i], Math.sqrt(V[i + 1] * V[i + 1] + 2 * DEC * ds)); }

  /* ---- altitude profile */
  const GR = new Float64Array(N), OB = new Float64Array(N);
  for (let i = 0; i < N; i++) { GR[i] = ground(X[i], Z[i]); OB[i] = obstacle ? obstacle(X[i], Z[i]) : -Infinity; if (!isFinite(OB[i])) OB[i] = -1e9; }
  const startAgl = startY - ground(X[0], Z[0]);
  const AT = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const r = ROLE[i], p = prims[PI[i]];
    if (r === 'orbit') AT[i] = p.agl || 150;
    else if (r === 'approach') {
      const nextA = (pois[p.leg] && pois[p.leg].agl) || 150;
      const prevP = PI[i] > 0 ? prims.slice(0, PI[i]).reverse().find((q) => q.role === 'orbit') : null;
      const prevA = prevP ? prevP.agl || 150 : 140;
      AT[i] = p.len > 1400 ? CRUISE_AGL : (prevA + nextA) / 2;
    } else if (r === 'start') AT[i] = Math.max(startAgl, 120);
    else AT[i] = CRUISE_AGL * 0.85;
  }
  let ATs = boxBy(AT, S, 300, 2);
  // take-off climb ramp until the first orbit, landing glide ceiling after the last one (the orbits keep their height)
  let iFirstOrbit = N, iLastOrbit = -1;
  for (let i = 0; i < N; i++) if (ROLE[i] === 'orbit') { if (iFirstOrbit === N) iFirstOrbit = i; iLastOrbit = i; }
  for (let i = 0; i < N; i++) {
    let a = ATs[i];
    if (i < iFirstOrbit) a = TAKEOFF ? Math.min(a, HOVER0 + S[i] * 0.2) : lerp(startAgl, a, smooth(0, 600, S[i]));
    // (a short way home: the last orbit already sinks toward the 6° glide, but never below 75 m on the orbit)
    if (LAND) a = Math.min(a, i > iLastOrbit ? HOVER1 + SE(i) * 0.105 : Math.max(75, HOVER1 + SE(i) * 0.105));
    ATs[i] = a;
  }
  const GM = maxBy(GR, S, 200), OBM = maxBy(OB, S, 35);
  const Y = new Float64Array(N), FL = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const ref = lerp(GR[i], Math.max(GR[i], GM[i]), smooth(10, 50, ATs[i]));
    const sFrom = S[i], sTo = SE(i);
    let minAgl = 70, clr = 30;
    if (TAKEOFF) { minAgl = Math.min(minAgl, HOVER0 + sFrom * 0.15); clr = Math.min(clr, 6 + sFrom * 0.1); }
    else { minAgl = Math.min(minAgl, startAgl + sFrom * 0.15); clr = Math.min(clr, Math.max(0, startY - Math.max(GR[0], OB[0]) - 2) + sFrom * 0.1); }
    if (LAND) { minAgl = Math.min(minAgl, HOVER1 + sTo * 0.08); clr = Math.min(clr, 6 + sTo * 0.1); }
    FL[i] = Math.max(GR[i] + minAgl, OBM[i] + clr);
    Y[i] = Math.max(ref + ATs[i], FL[i]);
  }
  // pins (start altitude, landing hover)
  Y[0] = TAKEOFF ? gHome + HOVER0 : startY;
  if (LAND) Y[N - 1] = GR[N - 1] + HOVER1;
  // vertical speed limits (raise only → never below the safety floor)
  const dtAt = (i, j) => (S[j] - S[i]) / Math.max(1.5, (V[i] + V[j]) / 2);
  for (let i = 1; i < N; i++) Y[i] = Math.max(Y[i], Y[i - 1] - VS_DN * dtAt(i - 1, i));
  for (let i = N - 2; i >= 0; i--) Y[i] = Math.max(Y[i], Y[i + 1] - VS_UP * dtAt(i, i + 1));
  { const Ys = boxBy(Y, S, 45, 2); for (let i = 1; i < N - 1; i++) Y[i] = Math.max(Ys[i], FL[i] - 4); }
  // the ends again (smoothing may have moved them by centimetres)
  Y[0] = TAKEOFF ? gHome + HOVER0 : startY;
  if (LAND) Y[N - 1] = GR[N - 1] + HOVER1;

  /* ---- time table (route only) */
  const TR = new Float64Array(N);
  for (let i = 1; i < N; i++) { const ds = Math.hypot(S[i] - S[i - 1], Y[i] - Y[i - 1]); TR[i] = TR[i - 1] + ds / Math.max(0.35, (V[i] + V[i - 1]) / 2); }
  const ROUTE_T = TR[N - 1];
  // attitude: longitudinal acceleration (dV/dt) + cruise drag → tilt; centripetal → bank; vertical speed; all smoothed in time
  const ACCv = new Float64Array(N), BANK = new Float64Array(N), VY = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 2), b = Math.min(N - 1, i + 2);
    ACCv[i] = TR[b] > TR[a] ? (V[b] - V[a]) / (TR[b] - TR[a]) : 0;
    VY[i] = TR[b] > TR[a] ? (Y[b] - Y[a]) / (TR[b] - TR[a]) : 0;
    BANK[i] = Math.atan(V[i] * V[i] * K[i] / G);
  }
  const ACCs = boxBy(ACCv, TR, 1.4, 2), BANKs = boxBy(BANK, TR, 1.6, 2), VYs = boxBy(VY, TR, 1.2, 2);
  const TILT = new Float64Array(N), ROLL = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    // ease the attitude in / out of the hovers at both ends of the route
    const e0 = TAKEOFF || startV < 8 ? smooth(0, 3.5, TR[i]) : 1, e1 = LAND ? smooth(0, 3.5, ROUTE_T - TR[i]) : 1;
    TILT[i] = Math.atan((ACCs[i] * e0 * e1 + 0.00045 * V[i] * V[i]) / G);
    ROLL[i] = BANKs[i] * e0 * e1;
    VYs[i] *= Math.min(e0, e1) < 1 ? smooth(0, 1, Math.min(TR[i], ROUTE_T - TR[i])) : 1;
  }

  /* ---- hover segments: take-off lift + pedal turn, landing pedal turn + touch-down */
  const h0 = H[0], hEnd = H[N - 1];
  const turnT = (dh) => Math.max(2.5, Math.abs(dh) / 0.24);
  const LIFT_T = TAKEOFF ? 5.0 : 0, TURN0_T = TAKEOFF || startV < 8 ? turnT(wrapPi(h0 - (TAKEOFF ? homeH : o.start.h || 0))) : 0;
  const TURN1_T = LAND ? turnT(wrapPi(homeH - hEnd)) : 0, DOWN_T = LAND ? 7.5 : 0;
  const h00 = TAKEOFF ? homeH : o.start ? o.start.h || 0 : h0;
  const T0 = LIFT_T + TURN0_T, T1 = T0 + ROUTE_T, T2 = T1 + TURN1_T, duration = T2 + DOWN_T;
  const T = new Float64Array(N); for (let i = 0; i < N; i++) T[i] = TR[i] + T0;

  /* ---- legs (orbit start / end on the absolute clock) */
  const legs = pois.map((poi, i) => ({ poi, index: i, t0: 0, t1: 0, tApproach: 0 }));
  for (let i = 0; i < N; i++) {
    if (ROLE[i] !== 'orbit') continue;
    const L = legs[LEG[i]]; if (!L) continue;
    if (!L._s) { L._s = true; L.t0 = T[i]; }
    L.t1 = T[Math.min(N - 1, i + 1)];
  }
  for (const L of legs) { if (!L._s) { // degenerate orbit (point): a 10 s moment around the closest route point
      let bi = 0, bd = Infinity; for (let i = 0; i < N; i++) { const d = Math.hypot(X[i] - L.poi.x, Z[i] - L.poi.z); if (d < bd) { bd = d; bi = i; } }
      L.t0 = Math.max(0, T[bi] - 5); L.t1 = Math.min(duration, T[bi] + 5);
    } delete L._s; }
  for (let k = 0; k < legs.length; k++) legs[k].tApproach = k === 0 ? 0 : legs[k - 1].t1;

  /* ---- sampling */
  let cache = 1;
  function idxAt(t) {
    if (t <= T[0]) return 0; if (t >= T[N - 1]) return Math.max(0, N - 2);
    let i = clamp(cache, 0, N - 2);
    if (T[i] > t) { while (i > 0 && T[i] > t) i--; } else { while (i < N - 2 && T[i + 1] < t) i++; }
    cache = i; return i;
  }
  const gEnd = GR[N - 1];
  function sample(t, out = {}) {
    t = clamp(+t || 0, 0, duration);
    out.t = t;
    if (t < T0) {
      // take-off (or slow resume): lift to the hover, then pedal-turn toward the first leg
      const x0 = X[0], z0 = Z[0];
      out.x = x0; out.z = z0; out.speed = 0; out.tilt = 0; out.roll = 0;
      if (TAKEOFF && t < LIFT_T) {
        const u = t / LIFT_T, e = smoother(u);
        out.y = gHome + HOVER0 * e; out.vy = HOVER0 * 30 * u * u * (1 - u) * (1 - u) / LIFT_T; out.h = homeH;
        out.tilt = -0.025 * Math.sin(Math.PI * u); out.roll = 0.012 * Math.sin(TAU * u);
      } else {
        const u = TURN0_T > 0 ? (t - LIFT_T) / TURN0_T : 1;
        out.y = Y[0]; out.vy = 0; out.h = wrapPi(h00 + wrapPi(h0 - h00) * smoother(u));
        out.roll = 0.03 * Math.sin(Math.PI * u) * Math.sign(wrapPi(h0 - h00));
      }
    } else if (t <= T1 || !LAND) {
      const i = idxAt(t), j = Math.min(N - 1, i + 1);
      const u = T[j] > T[i] ? (t - T[i]) / (T[j] - T[i]) : 0;
      out.x = lerp(X[i], X[j], u); out.y = lerp(Y[i], Y[j], u); out.z = lerp(Z[i], Z[j], u);
      out.h = wrapPi(H[i] + wrapPi(H[j] - H[i]) * u);
      out.speed = lerp(V[i], V[j], u); out.vy = lerp(VYs[i], VYs[j], u);
      out.tilt = lerp(TILT[i], TILT[j], u); out.roll = lerp(ROLL[i], ROLL[j], u);
    } else if (t < T2) {
      const u = TURN1_T > 0 ? (t - T1) / TURN1_T : 1;
      out.x = X[N - 1]; out.z = Z[N - 1]; out.y = Y[N - 1]; out.vy = 0; out.speed = 0; out.tilt = 0;
      out.h = wrapPi(hEnd + wrapPi(homeH - hEnd) * smoother(u));
      out.roll = 0.03 * Math.sin(Math.PI * u) * Math.sign(wrapPi(homeH - hEnd));
    } else {
      // slow vertical touch-down (fast at first, cushioned by ground effect at the end)
      const u = clamp((t - T2) / DOWN_T, 0, 1), e = 1 - Math.pow(1 - u, 2.2) * (1 + 2.2 * u) ;
      const ee = clamp(e, 0, 1);
      out.x = X[N - 1]; out.z = Z[N - 1]; out.y = gEnd + HOVER1 * (1 - ee); out.speed = 0; out.h = homeH;
      out.vy = u >= 1 ? 0 : -HOVER1 * 2.2 * 3.2 * u * Math.pow(1 - u, 1.2) / DOWN_T;
      out.tilt = 0.01 * Math.sin(Math.PI * u); out.roll = 0;
      if (u >= 1) out.y = gEnd;
    }
    out.agl = out.y - ground(out.x, out.z);
    if (t >= duration - 1e-6 && LAND) { out.y = gEnd; out.agl = 0; out.vy = 0; }
    let leg = -1, phase = 'transit';
    for (let k = 0; k < legs.length; k++) { if (t >= legs[k].tApproach - 1e-6 && t < legs[k].t1) { leg = k; phase = t >= legs[k].t0 ? 'orbit' : 'approach'; break; } }
    if (leg < 0) phase = legs.length && t >= legs[legs.length - 1].t1 ? 'return' : TAKEOFF ? 'takeoff' : 'transit';
    if (TAKEOFF && (t < T0 || (out.agl < 45 && (!legs.length || t < legs[0].t0) && t < T0 + 60))) phase = 'takeoff';
    if (LAND && (t >= T1 || (phase === 'return' && out.agl < 60 && t > T1 - 90))) phase = 'landing';
    out.leg = leg; out.phase = phase;
    tele('tour', out);
    return out;
  }
  let vmax = 0; for (let i = 0; i < N; i++) if (V[i] > vmax) vmax = V[i];
  const path = { duration, legs, sample, n: N, points: { X, Y, Z, V, T, S, ROLE }, length: LEN, maxSpeed: vmax, home, takeoff: TAKEOFF, land: LAND,
    times: { lift: LIFT_T, turn0: TURN0_T, route: ROUTE_T, turn1: TURN1_T, down: DOWN_T } };
  telemetry.path = path;
  return path;
}

function routeLength(nodes, senses) {
  let L = 0, entry = nodes[0].th0 != null ? nodes[0].th0 : null;
  for (let i = 0; i < nodes.length - 1; i++) {
    const A = circ(nodes[i], senses[i]), B = circ(nodes[i + 1], senses[i + 1]);
    const tg = tangent(A, B); if (!tg) return Infinity;
    if (A.r > 0) { const thOut = angOn(A, tg.ax, tg.az); L += sweepOf(A, entry != null ? entry : thOut, thOut, i === 0 ? 0 : nodes[i].minSweep) * A.r * ARC_W; }
    L += tg.L; entry = B.r > 0 ? angOn(B, tg.bx, tg.bz) : null;
  }
  return L;
}

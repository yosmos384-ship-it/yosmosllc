// pool-ai.js — V12 POOL: computer opponent. Generates candidate shots (object ball × pocket through the ghost-ball
// point, several speeds / spins, plus safeties and kicks), simulates each one with the real physics + rules engine,
// scores the outcome (pot / foul / loss + cue-ball position for the next shot) and then plays the chosen shot with a
// level-dependent execution error. Pure logic (no THREE / DOM); works in node.
import { BALL_R as R, mulberry } from './pool-physics.js';
import { summarizeShot } from './pool-rules.js';

export const LEVELS = {
  easy:   { aim: 0.0175, speed: 0.12, cands: 4,  speeds: [1.25],             spins: [0],         position: false, safety: false, think: 0.6 },
  medium: { aim: 0.0055, speed: 0.06, cands: 8,  speeds: [1.1, 1.6],         spins: [0, 0.6],    position: true,  safety: true,  think: 0.9 },
  hard:   { aim: 0.0012, speed: 0.025, cands: 12, speeds: [1.0, 1.35, 1.9],  spins: [0, 0.6, -0.6], position: true, safety: true, think: 1.1 },
};
const ROLL = 0.11; // ≈ μr·g: rolling deceleration (m/s²)

function clearPath(balls, ax, ay, bx, by, skip, rad = 2 * R) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
  for (const b of balls) {
    if (!b.on || skip.includes(b.id)) continue;
    let t = ((b.x - ax) * dx + (b.y - ay) * dy) / L2; if (t < 0) t = 0; else if (t > 1) t = 1;
    const px = ax + dx * t - b.x, py = ay + dy * t - b.y;
    if (px * px + py * py < rad * rad * 0.98) return false;
  }
  return true;
}
/** geometric pot candidates for the cue at (cx, cy) on the legal balls (no simulation) */
export function potCandidates(T, balls, cx, cy, legal) {
  const out = [];
  for (const id of legal) {
    const t = balls.find((b) => b.id === id && b.on); if (!t) continue;
    for (const k of T.pockets) {
      // aim point: a little inside the mouth; on the side pockets the ball must come in fairly square
      const ax = k.aimX, ay = k.aimY;
      let ux = ax - t.x, uy = ay - t.y; const d2 = Math.hypot(ux, uy); ux /= d2; uy /= d2;
      const into = ux * k.dx + uy * k.dy; // cos of the approach to the pocket axis
      if (into < (k.kind === 'side' ? 0.5 : 0.35)) continue;
      const gx = t.x - 2 * R * ux, gy = t.y - 2 * R * uy;
      if (Math.abs(gx) > T.W / 2 - R * 0.9 || Math.abs(gy) > T.L / 2 - R * 0.9) continue;
      let vx = gx - cx, vy = gy - cy; const d1 = Math.hypot(vx, vy); if (d1 < 1e-4) continue; vx /= d1; vy /= d1;
      const cosc = vx * ux + vy * uy; if (cosc < 0.2) continue; // cut over ~78°
      if (!clearPath(balls, cx, cy, gx, gy, [0, id])) continue;
      if (!clearPath(balls, t.x, t.y, ax, ay, [0, id], 2 * R * 0.98)) continue;
      const ease = cosc * cosc * into / ((0.35 + d1) * (0.35 + d2));
      out.push({ id, pocket: k.id, ang: Math.atan2(vy, vx), d1, d2, cosc, ease, gx, gy });
    }
  }
  out.sort((a, b) => b.ease - a.ease);
  return out;
}
function speedFor(c, mult) {
  const vObj = Math.sqrt(2 * ROLL * (c.d2 + 0.25)) * 1.25 + 0.15;
  const v = vObj / Math.max(0.25, c.cosc * 0.975) * 1.0 + Math.sqrt(2 * ROLL * c.d1) * 0.9;
  return Math.max(0.5, Math.min(7.5, v * mult));
}
function legalPlacement(T, balls, x, y, kitchen) {
  if (Math.abs(x) > T.W / 2 - R || Math.abs(y) > T.L / 2 - R) return false;
  if (kitchen && y > T.headY) return false;
  for (const b of balls) if (b.on && b.id !== 0 && Math.hypot(b.x - x, b.y - y) < 2 * R + 0.002) return false;
  return true;
}
/** where to put the cue ball with ball in hand ('anywhere' | 'kitchen') */
export function placeCueBall(T, balls, legal, mode) {
  const kitchen = mode === 'kitchen';
  let best = null;
  const trial = (x, y) => {
    if (!legalPlacement(T, balls, x, y, kitchen)) return;
    const cs = potCandidates(T, balls, x, y, legal);
    const s = cs.length ? cs[0].ease : -1;
    if (!best || s > best.s) best = { x, y, s };
  };
  if (!kitchen) {
    for (const id of legal) {
      const t = balls.find((b) => b.id === id && b.on); if (!t) continue;
      for (const k of T.pockets) {
        let ux = k.aimX - t.x, uy = k.aimY - t.y; const d = Math.hypot(ux, uy); ux /= d; uy /= d;
        for (const back of [0.22, 0.32, 0.45]) for (const off of [0, 0.15, -0.15]) {
          const c = Math.cos(off), s = Math.sin(off), bx = ux * c - uy * s, by = ux * s + uy * c;
          trial(t.x - bx * (2 * R + back), t.y - by * (2 * R + back));
        }
      }
    }
  }
  if (!best || best.s < 0) for (let i = 0; i <= 8; i++) for (let j = 0; j <= 5; j++) {
    const x = -T.W / 2 + R + (T.W - 2 * R) * i / 8;
    const y = kitchen ? -T.L / 2 + R + (T.headY - (-T.L / 2 + R)) * j / 5 : -T.L / 2 + R + (T.L - 2 * R) * j / 5;
    trial(x, y);
  }
  return best || { x: 0, y: T.headY - 0.05, s: -1 };
}

function evaluate(sim, rules, shot, level, simH) {
  const s = sim.clone({ h: simH }); s.events.length = 0;
  s.strike(0, shot.ang, shot.speed, shot.sx || 0, shot.sy || 0);
  s.run(30);
  const r = rules.clone();
  const S = summarizeShot(s.events, { called: shot.called });
  const res = r.shot(S);
  let score;
  if (res.frameOver) score = res.winner === rules.turn ? 1000 : -1000;
  else if (res.rerack) score = -5;
  else if (res.foul) score = -60;
  else if (res.continueTurn) score = 100;
  else score = 0;
  if (!res.frameOver && !res.foul) {
    const cue = s.ball(0);
    if (res.continueTurn && LEVELS[level].position && cue && cue.on) {
      const nx = potCandidates(s.T, s.balls, cue.x, cue.y, r.legalFirst(rules.turn));
      score += Math.min(40, (nx.length ? 20 + nx[0].ease * 60 : 0) + Math.min(nx.length, 6) * 1.5);
    }
    if (!res.continueTurn && cue && cue.on) { // safety value: what the opponent is left with
      const opp = potCandidates(s.T, s.balls, cue.x, cue.y, r.legalFirst(r.turn));
      score -= opp.length ? 10 + opp[0].ease * 40 : 0;
    }
  }
  return { score, res, sim: s };
}

/** pick a shot. opts: {rng, yieldFn (async, called between simulations), break: bool}. Returns
 *  {ang, speed, sx, sy, called, place: {x,y}|null, plan} — `ang`/`speed` already include the execution error. */
export async function chooseShot(sim, rules, level = 'medium', opts = {}) {
  const L = LEVELS[level] || LEVELS.medium;
  const rnd = opts.rng || mulberry(opts.seed || 12345);
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const T = sim.T, legal = rules.legalFirst();
  const Y = opts.yieldFn || (async () => {});
  let place = null;
  const work = sim.clone({ events: false });
  if (rules.ballInHand) {
    place = rules.isBreak ? { x: (rnd() - 0.5) * 0.3, y: T.headY - 0.02 } : placeCueBall(T, work.balls, legal, rules.ballInHand);
    work.place(0, place.x, place.y);
  }
  const cue = work.ball(0);
  const finish = (sh) => {
    const ang = sh.ang + gauss() * L.aim * (sh.speed > 5 ? 1.3 : 1);
    const speed = Math.max(0.3, sh.speed * (1 + gauss() * L.speed));
    return { ang, speed, sx: sh.sx || 0, sy: sh.sy || 0, called: sh.called == null ? null : sh.called, place, plan: sh };
  };
  if (rules.isBreak) {
    const apex = work.balls.filter((b) => b.on && b.id !== 0).sort((a, b) => a.y - b.y)[0];
    const ang = Math.atan2(apex.y - cue.y, apex.x - cue.x);
    return finish({ ang, speed: 8.6, sx: 0, sy: -0.15, kind: 'break', id: apex.id });
  }
  const simH = level === 'easy' ? 1 / 300 : sim.h; // hard / medium: the game's own step → the evaluation is exact (before the error)
  const cands = potCandidates(T, work.balls, cue.x, cue.y, legal).slice(0, L.cands);
  const tries = [];
  for (const c of cands) for (const m of L.speeds) for (const sp of L.spins) tries.push({ ang: c.ang, speed: speedFor(c, m), sx: 0, sy: sp, called: rules.needsCall() ? c.pocket : null, kind: 'pot', id: c.id, pocket: c.pocket, ease: c.ease });
  let best = null, n = 0;
  const consider = async (sh) => {
    const ev = evaluate(work, rules, sh, level, simH);
    // a robust shot: the same shot with a typical error must still work (hard / medium only)
    let sc = ev.score;
    if (level !== 'easy' && sc >= 100) {
      const e2 = evaluate(work, rules, { ...sh, ang: sh.ang + L.aim * 1.5 + 0.0015 }, level, simH);
      sc = sc * 0.6 + Math.min(sc, e2.score) * 0.4;
    }
    if (level === 'easy') sc += (sh.ease || 0) * 50;
    if (sh.kind === 'pot') sc -= sh.speed * 3; // prefer controlled speed (fast balls rattle in the jaws)
    if (!best || sc > best.sc) best = { sh, sc };
    if (++n % 2 === 0) await Y();
  };
  for (const sh of tries) await consider(sh);
  if ((!best || best.sc < 100) && L.safety || !best) {
    // safeties / kicks: aim at the edges and centre of every legal ball, gentle to medium speeds, then a ring of angles
    const alt = [];
    for (const id of legal) {
      const t = work.ball(id); if (!t || !t.on) continue;
      const base = Math.atan2(t.y - cue.y, t.x - cue.x), d = Math.hypot(t.y - cue.y, t.x - cue.x);
      for (const off of [0, 0.6, -0.6, 0.9, -0.9]) {
        const a = base + Math.asin(Math.max(-1, Math.min(1, off * 2 * R / Math.max(d, 2 * R))));
        if (!clearPath(work.balls, cue.x, cue.y, t.x - Math.cos(a) * 2 * R, t.y - Math.sin(a) * 2 * R, [0, id])) continue;
        for (const v of [1.2, 2.0, 3.2]) alt.push({ ang: a, speed: v, sx: 0, sy: 0, called: null, kind: 'safety', id });
      }
    }
    if (alt.length < 6) for (let i = 0; i < 24; i++) for (const v of [2.2, 3.6]) alt.push({ ang: i * Math.PI / 12 + 0.07, speed: v, sx: 0, sy: 0, called: null, kind: 'kick' });
    const lim = level === 'hard' ? 40 : level === 'medium' ? 24 : 10;
    for (const sh of alt.slice(0, lim)) await consider(sh);
  }
  if (!best) { const t = work.balls.find((b) => b.on && legal.includes(b.id)); best = { sh: { ang: t ? Math.atan2(t.y - cue.y, t.x - cue.x) : Math.PI / 2, speed: 2.5, kind: 'blind' }, sc: -100 }; }
  return finish(best.sh);
}

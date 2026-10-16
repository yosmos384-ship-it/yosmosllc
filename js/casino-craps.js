// casino-craps.js — V10 CASINO: craps rules engine (play chips only).
// Bets: pass / don't pass (bar 12), come / don't come, odds behind every line / come bet (max 3-4-5×; true odds
// 2:1 on 4/10, 3:2 on 5/9, 6:5 on 6/8; lay odds 1:2, 2:3, 5:6), place 4 5 6 8 9 10 (9:5, 7:5, 7:6), field
// (2 pays 2:1, 12 pays 3:1, 3 4 9 10 11 even money), hardways (hard 4/10 7:1, hard 6/8 9:1), any seven 4:1,
// any craps 7:1, yo (eleven) 15:1. Standard working rules: place bets, hardways and come-bet odds are OFF on the come-out roll
// (come odds are returned if the come bet is decided on a come-out roll). Pass line can't be taken down once a
// point is set. Payouts are rounded down to the cent.
import { cryptoRng, money } from './casino-rng.js';

export const POINTS = [4, 5, 6, 8, 9, 10];
export const PLACE_PAY = { 4: [9, 5], 5: [7, 5], 6: [7, 6], 8: [7, 6], 9: [7, 5], 10: [9, 5] };
export const ODDS_PAY = { 4: [2, 1], 5: [3, 2], 6: [6, 5], 8: [6, 5], 9: [3, 2], 10: [2, 1] };
export const LAY_PAY = { 4: [1, 2], 5: [2, 3], 6: [5, 6], 8: [5, 6], 9: [2, 3], 10: [1, 2] };
export const HARD_PAY = { 4: 7, 6: 9, 8: 9, 10: 7 };
export const MAX_ODDS = { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 };
export const LIMITS = { min: 5, max: 1000 };
const floorC = (x) => Math.floor(x * 100 + 1e-7) / 100;
const win = (amt, [a, b]) => floorC(amt * a / b);

export function createCraps({ wallet, rng = cryptoRng } = {}) {
  const g = {
    point: null, // null = come-out roll
    line: { pass: 0, dontpass: 0, passOdds: 0, dpOdds: 0 },
    come: 0, dontcome: 0, // pending (not yet travelled)
    comes: [], // {kind:'come'|'dontcome', point, amt, odds}
    place: { 4: 0, 5: 0, 6: 0, 8: 0, 9: 0, 10: 0 },
    hard: { 4: 0, 6: 0, 8: 0, 10: 0 },
    field: 0, any7: 0, anycraps: 0, yo: 0,
    history: [], lastRoll: null,
  };
  const comeOut = () => g.point == null;
  /** total chips on the layout */
  g.onTable = () => {
    let t = g.line.pass + g.line.dontpass + g.line.passOdds + g.line.dpOdds + g.come + g.dontcome + g.field + g.any7 + g.anycraps + g.yo;
    for (const c of g.comes) t += c.amt + c.odds;
    for (const k of POINTS) t += g.place[k]; for (const k in g.hard) t += g.hard[k];
    return money(t);
  };
  /** can this bet be placed now? → '' or an error key */
  g.canBet = (kind, n) => {
    switch (kind) {
      case 'pass': case 'dontpass': return comeOut() ? '' : 'pointOn';
      case 'come': case 'dontcome': return comeOut() ? 'pointOff' : '';
      case 'passOdds': return !comeOut() && g.line.pass ? '' : 'noLine';
      case 'dpOdds': return !comeOut() && g.line.dontpass ? '' : 'noLine';
      case 'comeOdds': return g.comes.some((c) => c.kind === 'come' && c.point === n) ? '' : 'noLine';
      case 'dcOdds': return g.comes.some((c) => c.kind === 'dontcome' && c.point === n) ? '' : 'noLine';
      case 'place': return POINTS.includes(n) ? '' : 'illegal';
      case 'hard': return n in HARD_PAY ? '' : 'illegal';
      case 'field': case 'any7': case 'anycraps': case 'yo': return '';
      default: return 'illegal';
    }
  };
  function maxOddsFor(kind, n) {
    if (kind === 'passOdds') return g.line.pass * MAX_ODDS[g.point];
    if (kind === 'dpOdds') return floorC(g.line.dontpass * MAX_ODDS[g.point] * LAY_PAY[g.point][1] / LAY_PAY[g.point][0]);
    const c = g.comes.find((x) => x.kind === (kind === 'comeOdds' ? 'come' : 'dontcome') && x.point === n);
    if (!c) return 0;
    return kind === 'comeOdds' ? c.amt * MAX_ODDS[n] : floorC(c.amt * MAX_ODDS[n] * LAY_PAY[n][1] / LAY_PAY[n][0]);
  }
  const getAmt = (kind, n) => {
    if (kind in g.line) return g.line[kind];
    if (kind === 'come' || kind === 'dontcome' || kind === 'field' || kind === 'any7' || kind === 'anycraps' || kind === 'yo') return g[kind];
    if (kind === 'place') return g.place[n]; if (kind === 'hard') return g.hard[n];
    const c = g.comes.find((x) => x.kind === (kind === 'comeOdds' ? 'come' : 'dontcome') && x.point === n); return c ? c.odds : 0;
  };
  const setAmt = (kind, n, v) => {
    if (kind in g.line) g.line[kind] = v;
    else if (kind === 'come' || kind === 'dontcome' || kind === 'field' || kind === 'any7' || kind === 'anycraps' || kind === 'yo') g[kind] = v;
    else if (kind === 'place') g.place[n] = v; else if (kind === 'hard') g.hard[n] = v;
    else { const c = g.comes.find((x) => x.kind === (kind === 'comeOdds' ? 'come' : 'dontcome') && x.point === n); if (c) c.odds = v; }
  };
  g.amount = getAmt;
  g.bet = (kind, n, amount) => {
    amount = money(amount);
    const e = g.canBet(kind, n); if (e) return { ok: false, err: e };
    if (!(amount > 0)) return { ok: false, err: 'illegal' };
    const now = money(getAmt(kind, n) + amount);
    const odds = /Odds$/.test(kind);
    if (odds) { if (now > maxOddsFor(kind, n) + 1e-9) return { ok: false, err: 'maxOdds' }; }
    else if (now < LIMITS.min || now > LIMITS.max) return { ok: false, err: 'limits' };
    if (!wallet.debit(amount, 'craps')) return { ok: false, err: 'funds' };
    setAmt(kind, n, now);
    return { ok: true, amount: now };
  };
  /** take a bet down (not allowed for contract bets: pass / come once travelled) */
  g.takeDown = (kind, n) => {
    if (kind === 'pass' && !comeOut()) return { ok: false, err: 'contract' };
    if (kind === 'dontpass' && !comeOut()) { /* don't bets may be removed (player's loss) */ }
    const a = getAmt(kind, n); if (!a) return { ok: false, err: 'none' };
    setAmt(kind, n, 0); wallet.credit(a, 'craps-down');
    return { ok: true, amount: a };
  };

  /** roll the dice (d1, d2 forced for tests); returns {dice, sum, events:[{bet, n, result:'win'|'lose'|'push'|'return'|'move'|'point', paid}]} */
  g.roll = (d1, d2) => {
    if (!(g.onTable() > 0)) return { ok: false, err: 'nobets' };
    d1 = d1 || rng.int(6) + 1; d2 = d2 || rng.int(6) + 1;
    const s = d1 + d2, hard = d1 === d2, co = comeOut();
    const evs = [];
    const pay = (bet, n, stake, winAmt, result = 'win') => { const p = money(stake + winAmt); wallet.credit(p, 'craps'); evs.push({ bet, n, result, paid: p, won: winAmt }); };
    const lose = (bet, n, stake) => { if (stake) evs.push({ bet, n, result: 'lose', lost: stake }); };
    // ---- one-roll bets
    if (g.field) { const f = g.field; g.field = 0; if ([2, 3, 4, 9, 10, 11, 12].includes(s)) pay('field', null, f, s === 2 ? f * 2 : s === 12 ? f * 3 : f); else lose('field', null, f); }
    if (g.any7) { const a = g.any7; g.any7 = 0; if (s === 7) pay('any7', null, a, a * 4); else lose('any7', null, a); }
    if (g.anycraps) { const a = g.anycraps; g.anycraps = 0; if (s === 2 || s === 3 || s === 12) pay('anycraps', null, a, a * 7); else lose('anycraps', null, a); }
    if (g.yo) { const a = g.yo; g.yo = 0; if (s === 11) pay('yo', null, a, a * 15); else lose('yo', null, a); }
    // ---- hardways (off on the come-out)
    if (!co) for (const k of [4, 6, 8, 10]) {
      const a = g.hard[k]; if (!a) continue;
      if (s === k && hard) pay('hard', k, 0, a * HARD_PAY[k]); // stays up; only the win is paid
      else if (s === 7 || s === k) { g.hard[k] = 0; lose('hard', k, a); }
    }
    // ---- place bets (off on the come-out)
    if (!co) for (const k of POINTS) {
      const a = g.place[k]; if (!a) continue;
      if (s === k) pay('place', k, 0, win(a, PLACE_PAY[k]));
      else if (s === 7) { g.place[k] = 0; lose('place', k, a); }
    }
    // ---- established come / don't come bets
    for (const c of g.comes.slice()) {
      const rm = () => g.comes.splice(g.comes.indexOf(c), 1);
      if (c.kind === 'come') {
        if (s === c.point) { pay('come', c.point, c.amt, c.amt); if (c.odds) { if (co) pay('comeOdds', c.point, c.odds, 0, 'return'); else pay('comeOdds', c.point, c.odds, win(c.odds, ODDS_PAY[c.point])); } rm(); }
        else if (s === 7) { lose('come', c.point, c.amt); if (c.odds) { if (co) pay('comeOdds', c.point, c.odds, 0, 'return'); else lose('comeOdds', c.point, c.odds); } rm(); }
      } else {
        if (s === 7) { pay('dontcome', c.point, c.amt, c.amt); if (c.odds) pay('dcOdds', c.point, c.odds, win(c.odds, LAY_PAY[c.point])); rm(); }
        else if (s === c.point) { lose('dontcome', c.point, c.amt); lose('dcOdds', c.point, c.odds); rm(); }
      }
    }
    // ---- pending come / don't come (only possible while a point is on)
    if (g.come) {
      const a = g.come; g.come = 0;
      if (s === 7 || s === 11) pay('come', null, a, a); else if (s === 2 || s === 3 || s === 12) lose('come', null, a);
      else { g.comes.push({ kind: 'come', point: s, amt: a, odds: 0 }); evs.push({ bet: 'come', n: s, result: 'move' }); }
    }
    if (g.dontcome) {
      const a = g.dontcome; g.dontcome = 0;
      if (s === 2 || s === 3) pay('dontcome', null, a, a); else if (s === 12) pay('dontcome', null, a, 0, 'push');
      else if (s === 7 || s === 11) lose('dontcome', null, a);
      else { g.comes.push({ kind: 'dontcome', point: s, amt: a, odds: 0 }); evs.push({ bet: 'dontcome', n: s, result: 'move' }); }
    }
    // ---- line bets
    const L = g.line;
    if (co) {
      if (s === 7 || s === 11) { if (L.pass) pay('pass', null, L.pass, L.pass); lose('dontpass', null, L.dontpass); L.pass = 0; L.dontpass = 0; }
      else if (s === 2 || s === 3 || s === 12) {
        lose('pass', null, L.pass); L.pass = 0;
        if (L.dontpass) { if (s === 12) pay('dontpass', null, L.dontpass, 0, 'push'); else pay('dontpass', null, L.dontpass, L.dontpass); }
        L.dontpass = 0;
      } else { g.point = s; evs.push({ bet: 'point', n: s, result: 'point' }); }
    } else {
      if (s === g.point) {
        if (L.pass) pay('pass', null, L.pass, L.pass); if (L.passOdds) pay('passOdds', g.point, L.passOdds, win(L.passOdds, ODDS_PAY[g.point]));
        lose('dontpass', null, L.dontpass); lose('dpOdds', g.point, L.dpOdds);
        L.pass = L.passOdds = L.dontpass = L.dpOdds = 0; evs.push({ bet: 'point', n: g.point, result: 'off' }); g.point = null;
      } else if (s === 7) {
        lose('pass', null, L.pass); lose('passOdds', g.point, L.passOdds);
        if (L.dontpass) pay('dontpass', null, L.dontpass, L.dontpass); if (L.dpOdds) pay('dpOdds', g.point, L.dpOdds, win(L.dpOdds, LAY_PAY[g.point]));
        L.pass = L.passOdds = L.dontpass = L.dpOdds = 0; evs.push({ bet: 'point', n: g.point, result: 'off' }); g.point = null;
      }
    }
    const r = { ok: true, dice: [d1, d2], sum: s, hard, comeOut: co, point: g.point, events: evs, paid: money(evs.reduce((t, e) => t + (e.paid || 0), 0)) };
    g.lastRoll = r; g.history.unshift(s); if (g.history.length > 20) g.history.length = 20;
    return r;
  };
  return g;
}

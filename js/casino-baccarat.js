// casino-baccarat.js — V10 CASINO: punto banco (play chips only).
// 8-deck shoe with a cut card. Card points: A = 1, 2–9 face value, 10 / J / Q / K = 0; hand = sum mod 10.
// Naturals (8 / 9 on the first two cards of either hand) end the coup. Player draws on 0–5, stands on 6–7.
// If the player stood, the banker draws on 0–5. If the player drew a third card (p3), the banker:
//   0–2 draws · 3 draws unless p3 = 8 · 4 draws on p3 2–7 · 5 draws on p3 4–7 · 6 draws on p3 6–7 · 7 stands.
// Payouts: player 1:1, banker 1:1 minus 5 % commission (0.95:1), tie 8:1 (player / banker bets push on a tie),
// player pair / banker pair side bets 11:1 (first two cards of that hand of equal rank).
// Limits 10–2,000 per bet.
import { createShoe } from './casino-cards.js';
import { cryptoRng, money } from './casino-rng.js';

export const BAC_LIMITS = { min: 10, max: 2000 };
export const PAIR_PAYS = 11; // player pair / banker pair 11:1
export const isPair = (cs) => cs.length >= 2 && (cs[0] % 13) === (cs[1] % 13);
export const point = (c) => { const r = c % 13; return r === 12 ? 1 : r >= 8 ? 0 : r + 2; };
export const score = (cs) => cs.reduce((t, c) => t + point(c), 0) % 10;
/** banker drawing rule — b = banker total of the first two cards, p3 = player's third card POINT (null = player stood) */
export function bankerDraws(b, p3) {
  if (p3 == null) return b <= 5;
  if (b <= 2) return true;
  if (b === 3) return p3 !== 8;
  if (b === 4) return p3 >= 2 && p3 <= 7;
  if (b === 5) return p3 >= 4 && p3 <= 7;
  if (b === 6) return p3 === 6 || p3 === 7;
  return false;
}
/** play one coup from a draw() function → {player:[cards], banker:[cards], ps, bs, winner} */
export function playCoup(draw) {
  const P = [draw()], B = [draw()]; P.push(draw()); B.push(draw());
  let ps = score(P), bs = score(B);
  if (ps < 8 && bs < 8) {
    let p3 = null;
    if (ps <= 5) { const c = draw(); P.push(c); p3 = point(c); }
    if (bankerDraws(bs, p3)) B.push(draw());
    ps = score(P); bs = score(B);
  }
  return { player: P, banker: B, ps, bs, natural: score(P.slice(0, 2)) >= 8 || score(B.slice(0, 2)) >= 8, winner: ps > bs ? 'player' : bs > ps ? 'banker' : 'tie' };
}

export function createBaccarat({ wallet, rng = cryptoRng } = {}) {
  const shoe = createShoe(8, { rng, pen: [0.85, 0.9] });
  const g = { shoe, bets: { player: 0, banker: 0, tie: 0, ppair: 0, bpair: 0 }, last: null, history: [], lastBets: null };
  g.total = () => money(g.bets.player + g.bets.banker + g.bets.tie + g.bets.ppair + g.bets.bpair);
  g.place = (side, amount) => {
    amount = money(amount);
    if (!(side in g.bets) || !(amount > 0)) return { ok: false, err: 'illegal' };
    const now = money(g.bets[side] + amount);
    if (now < BAC_LIMITS.min || now > BAC_LIMITS.max) return { ok: false, err: 'limits' };
    if (!wallet.debit(amount, 'baccarat')) return { ok: false, err: 'funds' };
    g.bets[side] = now; return { ok: true, amount: now };
  };
  g.clear = () => { const t = g.total(); if (t) wallet.credit(t, 'baccarat-clear'); g.bets = { player: 0, banker: 0, tie: 0, ppair: 0, bpair: 0 }; return t; };
  g.deal = () => {
    if (!(g.total() > 0)) return { ok: false, err: 'nobets' };
    let reshuffled = false;
    if (shoe.needsShuffle) { shoe.shuffle(); reshuffled = true; }
    const c = playCoup(() => shoe.draw());
    const b = g.bets; let paid = 0;
    const res = { player: 0, banker: 0, tie: 0, ppair: 0, bpair: 0 };
    if (c.winner === 'tie') { res.tie = b.tie * 9; res.player = b.player; res.banker = b.banker; }
    else if (c.winner === 'player') res.player = b.player * 2;
    else res.banker = money(b.banker + b.banker * 0.95);
    // pair side bets: the first two cards of that hand are the same rank → 11:1 (independent of the coup result)
    c.ppair = isPair(c.player); c.bpair = isPair(c.banker);
    if (c.ppair) res.ppair = b.ppair * (PAIR_PAYS + 1);
    if (c.bpair) res.bpair = b.bpair * (PAIR_PAYS + 1);
    for (const k in res) paid += res[k];
    paid = money(paid);
    if (paid) wallet.credit(paid, 'baccarat');
    g.lastBets = Object.assign({}, b);
    const staked = g.total();
    g.bets = { player: 0, banker: 0, tie: 0, ppair: 0, bpair: 0 };
    g.last = Object.assign(c, { paid, staked, net: money(paid - staked), reshuffled, payouts: res });
    g.history.unshift(c.winner[0].toUpperCase()); if (g.history.length > 60) g.history.length = 60;
    return Object.assign({ ok: true }, g.last);
  };
  g.rebet = () => { if (!g.lastBets) return false; let ok = true; for (const k in g.lastBets) if (g.lastBets[k]) ok = g.place(k, g.lastBets[k]).ok && ok; return ok; };
  return g;
}

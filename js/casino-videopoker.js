// casino-videopoker.js — V10 CASINO: Jacks or Better video poker, 9/6 "full pay" table (play chips only).
// One 52-card deck shuffled with crypto RNG for every hand; deal 5, hold any, draw replacements from the rest.
// Pays per coin bet (1–5 coins): royal flush 250 (4,000 for 5 coins = 800/coin), straight flush 50, four of a kind 25,
// full house 9, flush 6, straight 4, three of a kind 3, two pair 2, jacks or better 1. Theoretical return with
// optimal play: 99.54 %. simpleHold() = a standard published simple strategy (≈ 99.4 %), used by the Monte-Carlo
// test and by the optional "hint" button.
import { newDeck, evaluate, category, HAND, rankOf, suitOf, straightTop } from './casino-cards.js';
import { cryptoRng, shuffle, money } from './casino-rng.js';

export const VP_PAY = { royal: 250, straightflush: 50, quads: 25, fullhouse: 9, flush: 6, straight: 4, trips: 3, twopair: 2, jacks: 1, none: 0 };
export const VP_ORDER = ['royal', 'straightflush', 'quads', 'fullhouse', 'flush', 'straight', 'trips', 'twopair', 'jacks'];
export const ROYAL_5COIN = 4000;
export const COIN_VALUES = [1, 5, 25, 100];

/** classify a 5-card hand for the JoB paytable */
export function vpRank(cs) {
  const s = evaluate(cs), c = category(s);
  if (c === HAND.STRAIGHT_FLUSH) return ((s >> 16) & 15) === 12 ? 'royal' : 'straightflush';
  if (c === HAND.QUADS) return 'quads';
  if (c === HAND.FULL_HOUSE) return 'fullhouse';
  if (c === HAND.FLUSH) return 'flush';
  if (c === HAND.STRAIGHT) return 'straight';
  if (c === HAND.TRIPS) return 'trips';
  if (c === HAND.TWO_PAIR) return 'twopair';
  if (c === HAND.PAIR && ((s >> 16) & 15) >= 9) return 'jacks';
  return 'none';
}
export function vpPayout(rank, coins) { if (rank === 'royal' && coins === 5) return ROYAL_5COIN; return (VP_PAY[rank] || 0) * coins; }

/* ------------------------------------------------------------------ simple strategy (hold mask from 5 cards) */
const HIGH = (r) => r >= 9; // J Q K A
function idxWhere(cs, f) { const o = []; cs.forEach((c, i) => { if (f(c, i)) o.push(i); }); return o; }
function toMask(ix) { let m = 0; for (const i of ix) m |= 1 << i; return m; }
function bestSubsetForFlushDraw(cs, need, test) { // `need` cards of one suit satisfying test(cardsIdx)
  for (let s = 0; s < 4; s++) { const ix = idxWhere(cs, (c) => suitOf(c) === s); if (ix.length >= need) { const r = test(ix); if (r) return r; } }
  return null;
}
function combos(arr, k) { const out = []; const rec = (st, pick) => { if (pick.length === k) { out.push(pick.slice()); return; } for (let i = st; i < arr.length; i++) { pick.push(arr[i]); rec(i + 1, pick); pick.pop(); } }; rec(0, []); return out; }
const royalRanks = (r) => r >= 8; // 10 J Q K A
function nToRoyal(cs, n) { return bestSubsetForFlushDraw(cs, n, (ix) => { const rr = ix.filter((i) => royalRanks(rankOf(cs[i]))); return rr.length >= n ? rr.slice(0, n) : null; }); }
function nToStraightFlush(cs, n, maxGaps) { // n suited cards within a 5-rank window
  for (let s = 0; s < 4; s++) {
    const ix = idxWhere(cs, (c) => suitOf(c) === s); if (ix.length < n) continue;
    for (const cmb of combos(ix, n)) {
      const rs = cmb.map((i) => rankOf(cs[i]));
      const alt = rs.map((r) => (r === 12 ? -1 : r));
      for (const set of [rs, alt]) { const mn = Math.min(...set), mx = Math.max(...set); if (mx - mn <= 4 && new Set(set).size === n) { const gaps = (mx - mn + 1) - n; if (gaps <= maxGaps) return cmb; } }
    }
  }
  return null;
}
function fourToOutside(cs) { // 4 consecutive distinct ranks, not A-low / A-high ends (open-ended)
  const byR = new Map(); cs.forEach((c, i) => { if (!byR.has(rankOf(c))) byR.set(rankOf(c), i); });
  for (let lo = 0; lo <= 8; lo++) { const want = [lo, lo + 1, lo + 2, lo + 3]; if (want.every((r) => byR.has(r)) && lo + 3 < 12) return want.map((r) => byR.get(r)); }
  return null;
}
function fourToInside(cs) { // any 4 distinct ranks within a 5-window (incl. wheel)
  const byR = new Map(); cs.forEach((c, i) => { if (!byR.has(rankOf(c))) byR.set(rankOf(c), i); });
  const rs = [...byR.keys()];
  for (const cmb of combos(rs, 4)) {
    for (const set of [cmb, cmb.map((r) => (r === 12 ? -1 : r))]) { const mn = Math.min(...set), mx = Math.max(...set); if (mx - mn <= 4) return cmb.map((r) => byR.get(r)); }
  }
  return null;
}
/** returns a 5-bit hold mask */
export function simpleHold(cs) {
  const rk = vpRank(cs);
  const all = 31;
  if (['royal', 'straightflush', 'quads', 'fullhouse', 'flush', 'straight'].includes(rk)) {
    // 4 to a royal beats a made flush/straight (not SF/quads/FH)
    if ((rk === 'flush' || rk === 'straight')) { const r4 = nToRoyal(cs, 4); if (r4) return toMask(r4); }
    return all;
  }
  const cnt = new Map(); cs.forEach((c) => cnt.set(rankOf(c), (cnt.get(rankOf(c)) || 0) + 1));
  if (rk === 'trips') return toMask(idxWhere(cs, (c) => cnt.get(rankOf(c)) === 3));
  const r4 = nToRoyal(cs, 4); if (r4) return toMask(r4);
  const sf4 = nToStraightFlush(cs, 4, 1); if (sf4) return toMask(sf4);
  if (rk === 'twopair' || rk === 'jacks') return toMask(idxWhere(cs, (c) => cnt.get(rankOf(c)) === 2));
  const r3 = nToRoyal(cs, 3); if (r3) return toMask(r3);
  const fl4 = bestSubsetForFlushDraw(cs, 4, (ix) => ix.slice(0, 4)); if (fl4) return toMask(fl4);
  const lowPair = idxWhere(cs, (c) => cnt.get(rankOf(c)) === 2); if (lowPair.length) return toMask(lowPair);
  const os = fourToOutside(cs); if (os) return toMask(os);
  const hi = idxWhere(cs, (c) => HIGH(rankOf(c)));
  for (const cmb of combos(hi, 2)) if (suitOf(cs[cmb[0]]) === suitOf(cs[cmb[1]])) return toMask(cmb); // 2 suited high cards
  const sf3 = nToStraightFlush(cs, 3, 2); if (sf3) return toMask(sf3);
  if (hi.length >= 2) return toMask(hi.slice().sort((a, b) => rankOf(cs[a]) - rankOf(cs[b])).slice(0, 2)); // lowest 2 high cards
  for (const i of idxWhere(cs, (c) => rankOf(c) === 8)) for (const j of hi) if (suitOf(cs[i]) === suitOf(cs[j]) && rankOf(cs[j]) !== 12) return toMask([i, j]); // suited 10 + J/Q/K
  if (hi.length === 1) return toMask(hi);
  return 0;
}

export function createVideoPoker({ wallet, rng = cryptoRng } = {}) {
  const g = { phase: 'bet', coins: 5, coin: 5, hand: [], held: [false, false, false, false, false], deck: [], pos: 0, result: null, last: null };
  g.bet = () => money(g.coins * g.coin);
  g.setCoins = (n) => { if (g.phase === 'draw') return false; g.coins = Math.max(1, Math.min(5, n | 0)); return true; };
  g.setCoin = (v) => { if (g.phase === 'draw' || !COIN_VALUES.includes(v)) return false; g.coin = v; return true; };
  g.deal = () => {
    if (g.phase === 'draw') return { ok: false, err: 'phase' };
    if (!wallet.debit(g.bet(), 'vp')) return { ok: false, err: 'funds' };
    g.deck = shuffle(newDeck(), rng); g.pos = 5;
    g.hand = g.deck.slice(0, 5); g.held = [false, false, false, false, false]; g.result = null;
    g.phase = 'draw';
    g.preview = vpRank(g.hand);
    return { ok: true, hand: g.hand.slice() };
  };
  g.toggle = (i) => { if (g.phase === 'draw' && i >= 0 && i < 5) g.held[i] = !g.held[i]; return g.held[i]; };
  g.hint = () => { const m = simpleHold(g.hand); return [0, 1, 2, 3, 4].map((i) => !!(m & (1 << i))); };
  g.draw = () => {
    if (g.phase !== 'draw') return { ok: false, err: 'phase' };
    const replaced = [];
    for (let i = 0; i < 5; i++) if (!g.held[i]) { g.hand[i] = g.deck[g.pos++]; replaced.push(i); }
    const rank = vpRank(g.hand); const coinsWon = vpPayout(rank, g.coins); const paid = money(coinsWon * g.coin);
    if (paid) wallet.credit(paid, 'vp');
    g.phase = 'done'; g.result = { rank, paid, coinsWon, replaced, net: money(paid - g.bet()) };
    return Object.assign({ ok: true, hand: g.hand.slice() }, g.result);
  };
  return g;
}
// exported for tests
export { straightTop };

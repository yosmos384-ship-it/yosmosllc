// casino-cards.js — V10 CASINO: cards, multi-deck shoe with cut card, poker hand evaluator (5–7 cards).
// Card = integer 0..51: rank = c % 13 (0 = '2' … 8 = '10', 9 = J, 10 = Q, 11 = K, 12 = A), suit = floor(c / 13)
// (0 ♠, 1 ♥, 2 ♦, 3 ♣). Pure logic, no DOM / three — imported by the unit tests in node.
import { cryptoRng, shuffle } from './casino-rng.js';

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const SUITS = ['♠', '♥', '♦', '♣'];
export const rankOf = (c) => c % 13;
export const suitOf = (c) => (c / 13) | 0;
export const isRed = (c) => suitOf(c) === 1 || suitOf(c) === 2;
export const cardStr = (c) => RANKS[rankOf(c)] + SUITS[suitOf(c)];
/** parse "As", "Td", "10h", "2c" → card (tests) */
export function card(s) {
  const m = /^(10|[2-9TJQKA])([shdc♠♥♦♣])$/i.exec(String(s).trim());
  if (!m) throw new Error('bad card ' + s);
  const r = { T: 8, J: 9, Q: 10, K: 11, A: 12 }[m[1].toUpperCase()] ?? (m[1] === '10' ? 8 : +m[1] - 2);
  const su = { s: 0, h: 1, d: 2, c: 3, '♠': 0, '♥': 1, '♦': 2, '♣': 3 }[m[2].toLowerCase()];
  return su * 13 + r;
}
export const cards = (str) => str.trim().split(/\s+/).filter(Boolean).map(card);
export function newDeck() { const d = new Array(52); for (let i = 0; i < 52; i++) d[i] = i; return d; }

/**
 * Shoe of n decks with a cut card. The cut card is placed at a random penetration between pen[0] and pen[1] of the
 * shoe; when the round STARTS past it, the shoe is reshuffled (needsShuffle). draw() never runs dry (reshuffles a
 * fresh shoe if a round ever consumed all cards — impossible with 6 decks, guarded anyway).
 */
export function createShoe(decks = 6, { rng = cryptoRng, pen = [0.72, 0.8] } = {}) {
  const s = { decks, cards: [], pos: 0, cut: 0, shuffles: 0, rng };
  s.shuffle = () => {
    s.cards = [];
    for (let d = 0; d < decks; d++) for (let i = 0; i < 52; i++) s.cards.push(i);
    shuffle(s.cards, rng);
    s.pos = 0;
    s.cut = Math.floor(s.cards.length * (pen[0] + (pen[1] - pen[0]) * rng.float()));
    s.shuffles++;
  };
  s.draw = () => { if (s.pos >= s.cards.length) s.shuffle(); return s.cards[s.pos++]; };
  Object.defineProperty(s, 'needsShuffle', { get: () => s.pos >= s.cut });
  Object.defineProperty(s, 'remaining', { get: () => s.cards.length - s.pos });
  /** test hook: force the next cards (stacked shoe) */
  s.stack = (list) => { s.cards.splice(s.pos, 0, ...list); s.cut = Math.max(s.cut, s.pos + list.length + 1); };
  s.shuffle();
  return s;
}

/* ============================================================================================ poker evaluator */
// score = category << 20 | k1 << 16 | k2 << 12 | k3 << 8 | k4 << 4 | k5   (higher = better, ranks 0..12)
export const HAND = { HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8 };
export const HAND_KEYS = ['high', 'pair', 'twopair', 'trips', 'straight', 'flush', 'fullhouse', 'quads', 'straightflush'];
export const category = (score) => score >>> 20;

/** highest straight top rank in a 13-bit rank mask (A-2-3-4-5 counts, top = 3 i.e. '5'), or -1 */
export function straightTop(mask) {
  const m = (mask << 1) | ((mask >> 12) & 1); // bit 0 = ace-low
  for (let top = 13; top >= 4; top--) { const run = 0x1f << (top - 4); if ((m & run) === run) return top - 1; }
  return -1;
}
const pack = (cat, ks) => { let s = cat << 20; for (let i = 0; i < 5; i++) s |= ((ks[i] ?? 0) & 15) << (16 - 4 * i); return s; };
function topBits(mask, n, skipMask = 0) { const out = []; for (let r = 12; r >= 0 && out.length < n; r--) if ((mask >> r) & 1 && !((skipMask >> r) & 1)) out.push(r); return out; }

/** evaluate 5, 6 or 7 cards → score (best 5-card hand) */
export function evaluate(cs) {
  const cnt = new Uint8Array(13), sm = [0, 0, 0, 0], sc = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cs) { const r = c % 13, s = (c / 13) | 0; cnt[r]++; sm[s] |= 1 << r; sc[s]++; mask |= 1 << r; }
  let fs = -1; for (let s = 0; s < 4; s++) if (sc[s] >= 5) fs = s;
  if (fs >= 0) { const t = straightTop(sm[fs]); if (t >= 0) return pack(HAND.STRAIGHT_FLUSH, [t]); }
  let quad = -1, trips = [], pairs = [];
  for (let r = 12; r >= 0; r--) { if (cnt[r] === 4) { if (quad < 0) quad = r; } else if (cnt[r] === 3) trips.push(r); else if (cnt[r] === 2) pairs.push(r); }
  if (quad >= 0) return pack(HAND.QUADS, [quad, topBits(mask, 1, 1 << quad)[0]]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const t = trips[0]; const p = Math.max(trips.length > 1 ? trips[1] : -1, pairs.length ? pairs[0] : -1);
    return pack(HAND.FULL_HOUSE, [t, p]);
  }
  if (fs >= 0) return pack(HAND.FLUSH, topBits(sm[fs], 5));
  const st = straightTop(mask);
  if (st >= 0) return pack(HAND.STRAIGHT, [st]);
  if (trips.length) return pack(HAND.TRIPS, [trips[0], ...topBits(mask, 2, 1 << trips[0])]);
  if (pairs.length >= 2) return pack(HAND.TWO_PAIR, [pairs[0], pairs[1], topBits(mask, 1, (1 << pairs[0]) | (1 << pairs[1]))[0]]);
  if (pairs.length === 1) return pack(HAND.PAIR, [pairs[0], ...topBits(mask, 3, 1 << pairs[0])]);
  return pack(HAND.HIGH, topBits(mask, 5));
}
/** the 5 cards that make the best hand (for highlighting) */
export function bestFive(cs) {
  if (cs.length <= 5) return cs.slice();
  let best = -1, out = null;
  const n = cs.length, idx = [0, 1, 2, 3, 4];
  const rec = (start, k, pick) => {
    if (k === 5) { const h = pick.map((i) => cs[i]); const s = evaluate(h); if (s > best) { best = s; out = h; } return; }
    for (let i = start; i <= n - (5 - k); i++) { pick.push(i); rec(i + 1, k + 1, pick); pick.pop(); }
  };
  rec(0, 0, []); void idx;
  return out;
}

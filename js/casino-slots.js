// casino-slots.js — V10 CASINO: slot machines (play chips only). ORIGINAL themes, no real game / brand names.
//  · 3 video slots, 5 reels × 3 rows, 20 fixed paylines: "Silver Screen Nights", "Ohio Gold Rush", "Buckeye Jackpot".
//  · 1 classic 3-reel, 1 payline, 1–3 coins: "Marquee 7s" (wild ×2 multiplier, any-bar, cherries).
// Video-slot math model (documented, reproducible):
//  - Each reel has a fixed strip built deterministically from per-reel symbol COUNTS (buildStrip spreads every
//    symbol evenly around the strip; scatters never sit within 2 stops of each other, so a window shows ≤ 1 per reel).
//  - A spin picks one stop per reel uniformly with crypto RNG; the window is rows stop-1, stop, stop+1 (wrapping).
//  - Line wins pay left-to-right from reel 1, 3–5 in a row, WILD substitutes for every symbol except SCATTER; a line
//    pays the better of (wild-only run) and (symbol run incl. wilds); line pays × line bet.
//  - SCATTER pays anywhere: 3 / 4 / 5 on screen × TOTAL bet, and awards FREE SPINS (FREE_SPINS[3|4|5]) played at the
//    same bet with every win × FS_MULT; free spins can retrigger.
//  - exactRtp(theme) computes the return EXACTLY: E = base-game EV per spin (enumeration — reels are independent and
//    every window row has the strip's symbol distribution), N = expected free spins awarded per spin,
//    V = value of one free spin = FS_MULT·E / (1 − N) (geometric retriggers) → RTP = E + N·V.
//    tests/casino-rtp.mjs re-checks it by Monte-Carlo (1e6+ spins, production crypto RNG, free spins played out).
// Classic: three strips with blanks; classicPay() evaluates the single centre line; RTP by exact enumeration.
import { cryptoRng, money } from './casino-rng.js';

export const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0], [2, 2, 1, 2, 2], [1, 2, 2, 2, 1], [1, 0, 0, 0, 1], [1, 0, 1, 0, 1],
  [1, 2, 1, 2, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [1, 1, 0, 1, 1], [1, 1, 2, 1, 1],
  [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 2, 0, 2, 0], [2, 0, 2, 0, 2], [0, 2, 2, 2, 0],
];
export const LINE_BETS = [1, 2, 5, 10, 25, 50];
export const FREE_SPINS = { 3: 8, 4: 12, 5: 20 };
export const FS_MULT = 2;

// symbol: [key, pays for 3/4/5 of a kind (× line bet)], first = WILD, second = SCATTER (pays × total bet)
// counts: per reel, same order as symbols (2 scatters on the middle reels of the first two themes / reel 3 of Buckeye)
export const THEMES = {
  // "Silver Screen Nights" — premiere night on the boulevard: gold star (wild), film reel (scatter), clapperboard …
  hollywood: {
    key: 'hollywood', name: 'HOLLYWOOD NIGHTS', palette: ['#14090a', '#e8c06a', '#a3162a'],
    symbols: [
      ['wild_star', [75, 350, 1500]], ['scatter_reel', [2, 10, 50]],
      ['clapper', [60, 220, 880]], ['camera', [45, 150, 600]], ['chair', [35, 120, 450]], ['popcorn', [30, 90, 300]], ['ticket', [20, 75, 220]],
      ['A', [15, 45, 175]], ['K', [12, 35, 150]], ['Q', [10, 30, 120]], ['J', [8, 20, 90]], ['T', [6, 18, 75]],
    ],
    counts: [
      [2, 1, 2, 2, 3, 3, 3, 5, 5, 6, 6, 7],
      [3, 2, 2, 2, 3, 3, 3, 5, 5, 6, 6, 7],
      [3, 2, 2, 2, 3, 3, 3, 5, 5, 6, 6, 7],
      [3, 2, 2, 2, 3, 3, 3, 5, 5, 6, 6, 7],
      [2, 1, 2, 2, 3, 3, 3, 5, 5, 6, 6, 7],
    ]
  },
  // "Ohio Gold Rush" — 1850s prospectors: gold nugget (wild), gold pan (scatter), mine cart, lantern, pickaxe …
  gold: {
    key: 'gold', name: 'OHIO GOLD RUSH', palette: ['#1a0f05', '#f2c14e', '#6b3a12'],
    symbols: [
      ['wild_nugget', [75, 350, 1500]], ['scatter_pan', [2, 10, 50]],
      ['cart', [50, 180, 600]], ['lantern', [35, 120, 480]], ['pickaxe', [30, 100, 360]], ['horseshoe', [25, 75, 250]],
      ['A', [12, 35, 150]], ['K', [10, 30, 120]], ['Q', [8, 25, 100]], ['J', [6, 18, 75]], ['T', [5, 15, 60]],
    ],
    counts: [
      [2, 1, 2, 3, 3, 3, 5, 5, 6, 6, 7],
      [3, 2, 2, 3, 3, 3, 5, 5, 6, 6, 7],
      [3, 2, 2, 3, 3, 3, 5, 5, 6, 6, 7],
      [3, 2, 2, 3, 3, 3, 5, 5, 6, 6, 7],
      [2, 1, 2, 3, 3, 3, 5, 5, 6, 6, 7],
    ]
  },
  // "Buckeye Jackpot" — Ohio countryside fair: buckeye nut (wild), jackpot bell (scatter), 7s, bars, cardinal, leaf …
  buckeye: {
    key: 'buckeye', name: 'BUCKEYE JACKPOT', palette: ['#0c1a0e', '#e9b949', '#8a4a1c'],
    symbols: [
      ['wild_buckeye', [50, 250, 1000]], ['scatter_bell', [2, 10, 50]],
      ['seven', [25, 100, 400]], ['bar3', [15, 60, 200]], ['bar2', [12, 40, 150]], ['bar1', [10, 30, 100]],
      ['cardinal', [6, 20, 80]], ['leaf', [5, 15, 50]], ['cherry', [3, 10, 40]],
    ],
    counts: [
      [2, 1, 2, 3, 3, 4, 6, 7, 9],
      [3, 1, 2, 3, 3, 4, 6, 7, 9],
      [3, 2, 2, 3, 3, 4, 6, 7, 9],
      [3, 1, 2, 3, 3, 4, 6, 7, 9],
      [2, 1, 2, 3, 3, 4, 6, 7, 9],
    ]
  },
};
export const THEME_KEYS = Object.keys(THEMES);
export const CLASSIC_KEY = 'classic';
/** every machine type on the floor (venue banks + menu) */
export const ALL_SLOT_KEYS = [...THEME_KEYS, CLASSIC_KEY];
export const WILD = 0, SCATTER = 1;

/** deterministic even spread of symbol counts around a strip (largest-remainder / Bresenham); scatters ≥ 3 apart */
export function buildStrip(counts, special = SCATTER) {
  const n = counts.reduce((a, b) => a + b, 0);
  const slots = new Array(n).fill(-1);
  const order = counts.map((c, i) => [c, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); // place rare symbols first
  for (const [c, sym] of order) {
    if (!c) continue;
    const step = n / c;
    for (let k = 0; k < c; k++) {
      let p = Math.floor((k + 0.5) * step + sym * 0.37) % n;
      let tries = 0;
      while (tries < n) {
        const free = slots[p] === -1;
        const okSc = sym !== special || [-2, -1, 1, 2].every((d) => slots[(p + d + n) % n] !== special);
        if (free && okSc) break;
        p = (p + 1) % n; tries++;
      }
      slots[p] = sym;
    }
  }
  return slots;
}
const stripCache = new Map();
export function stripsOf(theme) {
  const T = typeof theme === 'string' ? THEMES[theme] : theme;
  const k = T.key + ':' + JSON.stringify(T.counts);
  if (!stripCache.has(k)) stripCache.set(k, T.counts.map((c) => buildStrip(c)));
  return stripCache.get(k);
}

/** pay of one line (5 symbol ids) in line-bet units → {pay, sym, count} */
export function linePay(T, s) {
  const pays = T.symbols.map((x) => x[1]);
  let w = 0; while (w < 5 && s[w] === WILD) w++;
  const wildPay = w >= 3 ? pays[WILD][w - 3] : 0;
  let best = { pay: wildPay, sym: WILD, count: w };
  if (w < 5 && s[w] !== SCATTER) {
    const X = s[w]; let c = w; while (c < 5 && (s[c] === X || s[c] === WILD)) c++;
    if (c >= 3) { const p = pays[X][c - 3]; if (p > best.pay) best = { pay: p, sym: X, count: c }; }
  }
  return best.pay > 0 ? best : { pay: 0, sym: -1, count: 0 };
}
/** window [reel][row] for stop positions */
export function windowOf(strips, stops) { return strips.map((st, r) => [-1, 0, 1].map((d) => st[(stops[r] + d + st.length) % st.length])); }
/** evaluate a window → {lineWins:[{line, sym, count, pay}], scatter:{count, pay(× total), free}, totalUnits (line-bet units)} */
export function evaluateWindow(T, win) {
  const lineWins = []; let units = 0;
  LINES.forEach((L, li) => {
    const s = L.map((row, reel) => win[reel][row]);
    const r = linePay(T, s);
    if (r.pay) { lineWins.push({ line: li, sym: r.sym, count: r.count, pay: r.pay }); units += r.pay; }
  });
  let sc = 0; for (const reel of win) for (const x of reel) if (x === SCATTER) sc++;
  const k = Math.min(sc, 5);
  const scPay = sc >= 3 ? T.symbols[SCATTER][1][k - 3] : 0;
  return { lineWins, scatter: { count: sc, pay: scPay, free: sc >= 3 ? FREE_SPINS[k] : 0 }, totalUnits: units + scPay * LINES.length };
}

/** exact return-to-player (fraction) of a video-slot theme, including free spins (see header) */
export function exactRtp(theme) {
  const T = typeof theme === 'string' ? THEMES[theme] : theme;
  const strips = stripsOf(T);
  const nS = T.symbols.length;
  const P = strips.map((st) => { const p = new Float64Array(nS); for (const x of st) p[x] += 1 / st.length; return p; });
  let lineEV = 0, lineHit = 0; const s = [0, 0, 0, 0, 0];
  const rec = (r, pr) => {
    if (pr === 0) return;
    if (r === 5) { const p = linePay(T, s).pay; lineEV += pr * p; if (p) lineHit += pr; return; }
    for (let k = 0; k < nS; k++) { if (!P[r][k]) continue; s[r] = k; rec(r + 1, pr * P[r][k]); }
  };
  rec(0, 1);
  lineEV /= 1; // per line, in line-bet units == per spin in total-bet units (20 lines × line bet = total bet)
  // scatter: per reel probability that the 3-row window shows a scatter (≤ 1 per window by construction)
  const q = strips.map((st) => { let c = 0; for (let i = 0; i < st.length; i++) if ([-1, 0, 1].some((d) => st[(i + d + st.length) % st.length] === SCATTER)) c++; return c / st.length; });
  const dist = [1, 0, 0, 0, 0, 0];
  for (const qi of q) { for (let k = 5; k >= 0; k--) dist[k] = dist[k] * (1 - qi) + (k ? dist[k - 1] * qi : 0); }
  const sp = T.symbols[SCATTER][1];
  const scatterEV = dist[3] * sp[0] + dist[4] * sp[1] + dist[5] * sp[2]; // × total bet
  const E = lineEV + scatterEV;
  const N = dist[3] * FREE_SPINS[3] + dist[4] * FREE_SPINS[4] + dist[5] * FREE_SPINS[5];
  const V = FS_MULT * E / (1 - N);
  const freeEV = N * V;
  return { rtp: E + freeEV, baseRtp: E, lineRtp: lineEV, scatterRtp: scatterEV, freeRtp: freeEV, freeSpinsPerSpin: N,
    triggerChance: dist[3] + dist[4] + dist[5], scatterDist: dist, stripLengths: strips.map((x) => x.length), lineHit };
}

export function createSlot({ wallet, theme = 'hollywood', rng = cryptoRng } = {}) {
  const T = THEMES[theme] || THEMES.hollywood;
  const strips = stripsOf(T);
  const g = { theme: T.key, T, strips, lineBet: 1, stops: [0, 0, 0, 0, 0].map((_, r) => (r * 7) % strips[r].length), last: null, spins: 0,
    freeLeft: 0, freeBet: 0, freeWon: 0, freeTotal: 0 };
  g.totalBet = () => money(g.lineBet * LINES.length);
  g.setLineBet = (v) => { if (g.freeLeft) return g.lineBet; if (LINE_BETS.includes(v)) g.lineBet = v; return g.lineBet; };
  g.window = () => windowOf(strips, g.stops);
  /** one spin: a paid spin, or the next free spin while freeLeft > 0 (no debit, wins × FS_MULT, same line bet) */
  g.spin = (forcedStops) => {
    const free = g.freeLeft > 0;
    const bet = g.totalBet();
    if (!free && !wallet.debit(bet, 'slot')) return { ok: false, err: 'funds' };
    if (free) g.freeLeft--;
    g.stops = forcedStops ? forcedStops.slice() : strips.map((st) => rng.int(st.length));
    const win = g.window();
    const ev = evaluateWindow(T, win);
    const mult = free ? FS_MULT : 1;
    const paid = money(ev.totalUnits * g.lineBet * mult);
    if (paid) wallet.credit(paid, 'slot');
    const awarded = ev.scatter.free;
    if (awarded) { if (!free && !g.freeLeft) { g.freeWon = 0; g.freeTotal = 0; } g.freeLeft += awarded; g.freeTotal += awarded; }
    if (free) g.freeWon = money(g.freeWon + paid);
    g.spins++;
    g.last = { stops: g.stops.slice(), window: win, lineWins: ev.lineWins, scatter: ev.scatter, paid, bet: free ? 0 : bet, net: money(paid - (free ? 0 : bet)),
      free, mult, awarded, freeLeft: g.freeLeft, freeWon: g.freeWon, featureOver: free && g.freeLeft === 0 };
    return Object.assign({ ok: true }, g.last);
  };
  return g;
}

/* ============================================================================================ classic 3-reel */
// "Marquee 7s": one centre payline, 1–3 coins. Wild (gold star "2×") substitutes for any symbol and DOUBLES the win
// for each wild used (×2, ×4); three wilds pay the top award. Pays per coin:
//   3 wilds 800 · 3 sevens 100 · 3 triple bars 40 · 3 double bars 25 · 3 single bars 10 · any 3 bars 5 ·
//   3 cherries 10 · any 2 cherries 5 · any 1 cherry 2.
export const CLASSIC = {
  key: CLASSIC_KEY, name: 'MARQUEE 7s', palette: ['#12060a', '#ffd76a', '#d0172f'],
  symbols: ['wild2x', 'seven', 'bar3', 'bar2', 'bar1', 'cherry', 'blank'],
  pays: { wild: 800, seven: 100, bar3: 40, bar2: 25, bar1: 10, anybar: 5, cherry3: 10, cherry2: 5, cherry1: 2 },
  // counts per reel in symbol order (blank last)
  counts: [
    [1, 2, 3, 4, 5, 3, 22],
    [1, 2, 3, 4, 5, 3, 22],
    [1, 2, 3, 4, 5, 2, 24],
  ],
  coins: [1, 2, 3], coinValues: [1, 5, 25, 100],
};
const CW = 0, C7 = 1, CB3 = 2, CB2 = 3, CB1 = 4, CCH = 5, CBL = 6;
const isBar = (x) => x === CB3 || x === CB2 || x === CB1;
/** pay (per coin) of a centre line [a, b, c] → {pay, kind, wilds} */
export function classicPay(line) {
  const P = CLASSIC.pays;
  const nw = line.filter((x) => x === CW).length;
  if (nw === 3) return { pay: P.wild, kind: 'wild', wilds: 3 };
  const others = line.filter((x) => x !== CW);
  const mult = 2 ** nw; // every wild in a winning line doubles it
  let best = { pay: 0, kind: '', wilds: 0 };
  const consider = (pay, kind) => { if (pay > best.pay) best = { pay, kind, wilds: nw }; };
  // three of a kind (wilds fill in)
  if (others.every((x) => x === others[0])) {
    const X = others[0];
    const k = { [C7]: 'seven', [CB3]: 'bar3', [CB2]: 'bar2', [CB1]: 'bar1', [CCH]: 'cherry3' }[X];
    if (k) consider(P[k] * mult, k);
  }
  if (others.every(isBar)) consider(P.anybar * mult, 'anybar');
  const ch = others.filter((x) => x === CCH).length;
  if (ch >= 1) {
    // cherries pay anywhere on the line; wilds count as cherries only alongside a real cherry
    const m = ch + nw; // 1 … 3 cherry-capable symbols on the line
    consider([0, P.cherry1, P.cherry2, P.cherry3][m] * mult, ['', 'cherry1', 'cherry2', 'cherry3'][m]);
  }
  return best;
}
const classicStripCache = { k: '', s: null };
export function classicStrips() {
  const k = JSON.stringify(CLASSIC.counts);
  if (classicStripCache.k !== k) { classicStripCache.k = k; classicStripCache.s = CLASSIC.counts.map((c) => buildStrip(c, CW)); }
  return classicStripCache.s;
}
/** exact RTP of the classic by enumerating every stop combination */
export function classicExactRtp() {
  const S = classicStrips(); let ev = 0, hit = 0, n = 0; const kinds = {};
  for (const a of S[0]) for (const b of S[1]) for (const c of S[2]) {
    const r = classicPay([a, b, c]); n++; ev += r.pay; if (r.pay) { hit++; kinds[r.kind] = (kinds[r.kind] || 0) + 1; }
  }
  return { rtp: ev / n, hitFreq: hit / n, combos: n, kinds, stripLengths: S.map((s) => s.length) };
}
export function createClassic({ wallet, rng = cryptoRng } = {}) {
  const S = classicStrips();
  const g = { theme: CLASSIC_KEY, coins: 3, coin: 5, stops: [0, 3, 6], last: null, spins: 0 };
  g.bet = () => money(g.coins * g.coin);
  g.setCoins = (n) => { if (CLASSIC.coins.includes(n)) g.coins = n; return g.coins; };
  g.setCoin = (v) => { if (CLASSIC.coinValues.includes(v)) g.coin = v; return g.coin; };
  g.window = () => S.map((st, r) => [-1, 0, 1].map((d) => st[(g.stops[r] + d + st.length) % st.length]));
  g.spin = (forced) => {
    const bet = g.bet();
    if (!wallet.debit(bet, 'slot')) return { ok: false, err: 'funds' };
    g.stops = forced ? forced.slice() : S.map((st) => rng.int(st.length));
    const line = S.map((st, r) => st[g.stops[r]]);
    const r = classicPay(line);
    const paid = money(r.pay * g.coins * g.coin);
    if (paid) wallet.credit(paid, 'slot');
    g.spins++;
    g.last = { stops: g.stops.slice(), line, window: g.window(), kind: r.kind, wilds: r.wilds, payPerCoin: r.pay, paid, bet, net: money(paid - bet) };
    return Object.assign({ ok: true }, g.last);
  };
  return g;
}
export const CLASSIC_SYM = { WILD: CW, SEVEN: C7, BAR3: CB3, BAR2: CB2, BAR1: CB1, CHERRY: CCH, BLANK: CBL };

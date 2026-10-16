// casino-rng.js — V10 CASINO: fair randomness + the shared PLAY-CHIP bankroll.
//  - Every random draw of every game comes from crypto.getRandomValues (Web Crypto, also global in node ≥ 19).
//    Integers are drawn with rejection sampling (no modulo bias). Math.random is only a last-resort fallback
//    for very old engines and is reported in rngInfo.source.
//  - makeSeeded(seed) = deterministic mulberry32 stream used ONLY by unit tests / simulations.
//  - The bankroll is PLAY MONEY ONLY ("כסף משחק בלבד · Play money only"): it lives in memory for this page session —
//    nothing is stored, a refresh resets it to 10,000 (site rule: refresh = full reset). No deposits, no payments.
// No side effects on import.

const BUF = 256;
let buf = null, bi = BUF;
const hasCrypto = () => typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function';
export const rngInfo = { source: hasCrypto() ? 'crypto.getRandomValues' : 'Math.random (fallback)', draws: 0 };

function u32() {
  rngInfo.draws++;
  if (hasCrypto()) {
    if (!buf) buf = new Uint32Array(BUF);
    if (bi >= BUF) { globalThis.crypto.getRandomValues(buf); bi = 0; }
    return buf[bi++];
  }
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

/** unbiased integer in [0, n) */
export function randInt(n) {
  n = Math.floor(n);
  if (!(n > 0)) return 0;
  if (n === 1) return 0;
  const lim = 4294967296 - (4294967296 % n); // largest multiple of n ≤ 2^32
  let x;
  do { x = u32(); } while (x >= lim);
  return x % n;
}
/** float in [0, 1) with 53 bits */
export function randFloat() { return ((u32() >>> 5) * 67108864 + (u32() >>> 6)) / 9007199254740992; }

/** the production RNG (crypto) — every engine takes an `rng` with this shape */
export const cryptoRng = { int: randInt, float: randFloat, kind: 'crypto' };

/** deterministic RNG for tests / Monte-Carlo (mulberry32) */
export function makeSeeded(seed = 1) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0); };
  return {
    kind: 'seeded',
    int(n) { n = Math.floor(n); if (!(n > 1)) return 0; const lim = 4294967296 - (4294967296 % n); let x; do { x = next(); } while (x >= lim); return x % n; },
    float() { return next() / 4294967296; },
  };
}

/** Fisher–Yates in place */
export function shuffle(arr, rng = cryptoRng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = rng.int(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}

/* ============================================================================================ play-chip bankroll */
export const START_CHIPS = 10000;
export const TOPUP_CHIPS = 10000;
export const MAX_CHIPS = 10000000;
/** money helper: play chips are kept to 2 decimals (blackjack 3:2 and craps place bets can make halves / cents) */
export const money = (x) => Math.round((+x || 0) * 100) / 100;

export function createWallet(start = START_CHIPS) {
  const st = { chips: money(start), subs: new Set(), won: 0, wagered: 0 };
  const emit = (why) => { for (const f of st.subs) { try { f(st.chips, why); } catch (_) {} } };
  const w = {
    get balance() { return st.chips; },
    get chips() { return st.chips; },
    get stats() { return { wagered: st.wagered, won: st.won }; },
    can(n) { n = money(n); return n > 0 && n <= st.chips + 1e-9; },
    /** take a wager; false (and nothing changes) if the play-chip balance is too low */
    debit(n, why = 'bet') { n = money(n); if (!(n > 0)) return n === 0; if (n > st.chips + 1e-9) return false; st.chips = money(st.chips - n); st.wagered = money(st.wagered + n); emit(why); return true; },
    /** return stake / pay a win */
    credit(n, why = 'win') { n = money(n); if (!(n > 0)) return; st.chips = money(Math.min(MAX_CHIPS, st.chips + n)); st.won = money(st.won + n); emit(why); },
    /** free top-up at the cashier (play money) */
    topUp(n = TOPUP_CHIPS) { st.chips = money(Math.min(MAX_CHIPS, st.chips + n)); emit('topup'); return st.chips; },
    reset() { st.chips = money(start); st.won = 0; st.wagered = 0; emit('reset'); },
    onChange(fn) { if (typeof fn === 'function') st.subs.add(fn); return () => st.subs.delete(fn); },
  };
  return w;
}
/** the one shared bankroll of the page session (module memory only — a refresh resets it) */
let shared = null;
export function bank() { if (!shared) shared = createWallet(START_CHIPS); return shared; }

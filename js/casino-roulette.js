// casino-roulette.js — V10 CASINO: American roulette (0 and 00) rules engine (play chips only).
// Pockets: 0..36 and 00 (stored as 37). Wheel order is the standard American sequence. Bets and payouts:
//   straight 35:1 · split 17:1 · street (incl. 0-1-2 / 0-00-2 / 00-2-3 trios) 11:1 · corner 8:1 · five-number
//   (0-00-1-2-3) 6:1 · six-line 5:1 · column 2:1 · dozen 2:1 · red / black / odd / even / 1–18 / 19–36 1:1.
// Every bet is validated against the real table geometry (numbers must be adjacent on the layout).
// Limits: 1–500 per inside bet, 5–1,000 per outside bet, 10,000 per spin.
import { cryptoRng, money } from './casino-rng.js';

export const DZ = 37; // "00"
export const WHEEL = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, DZ, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const pocketName = (n) => (n === DZ ? '00' : String(n));
export const colorOf = (n) => (n === 0 || n === DZ ? 'green' : REDS.has(n) ? 'red' : 'black');
export const PAYOUT = { straight: 35, split: 17, street: 11, corner: 8, five: 6, sixline: 5, column: 2, dozen: 2, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1 };
export const LIMITS = { insideMin: 1, insideMax: 500, outsideMin: 5, outsideMax: 1000, spinMax: 10000 };
const INSIDE = new Set(['straight', 'split', 'street', 'corner', 'five', 'sixline']);

const key = (a) => a.slice().sort((x, y) => x - y).join('-');
const col = (n) => (n - 1) % 3; // 0,1,2 (left→right on the layout = 1,2,3)
const row = (n) => Math.floor((n - 1) / 3);
function legalSets() {
  const s = { split: new Set(), street: new Set(), corner: new Set(), sixline: new Set() };
  for (let n = 1; n <= 36; n++) {
    if (col(n) < 2) s.split.add(key([n, n + 1]));
    if (n + 3 <= 36) s.split.add(key([n, n + 3]));
    if (col(n) < 2 && n + 4 <= 36) s.corner.add(key([n, n + 1, n + 3, n + 4]));
    if (col(n) === 0) { s.street.add(key([n, n + 1, n + 2])); if (n + 5 <= 36) s.sixline.add(key([n, n + 1, n + 2, n + 3, n + 4, n + 5])); }
  }
  for (const p of [[0, DZ], [0, 1], [0, 2], [DZ, 2], [DZ, 3]]) s.split.add(key(p));
  for (const t of [[0, 1, 2], [0, DZ, 2], [DZ, 2, 3]]) s.street.add(key(t));
  return s;
}
const LEGAL = legalSets();

/** numbers covered by an outside bet */
export function outsideNumbers(type, arg) {
  const out = [];
  for (let n = 1; n <= 36; n++) {
    const ok = type === 'red' ? REDS.has(n) : type === 'black' ? !REDS.has(n) : type === 'odd' ? n % 2 === 1 : type === 'even' ? n % 2 === 0
      : type === 'low' ? n <= 18 : type === 'high' ? n >= 19 : type === 'dozen' ? Math.floor((n - 1) / 12) === arg : type === 'column' ? col(n) === arg : false;
    if (ok) out.push(n);
  }
  return out;
}
/** normalise + validate a bet → {type, nums, id} or null */
export function makeBet(type, nums) {
  if (!(type in PAYOUT)) return null;
  if (type === 'dozen' || type === 'column') { const a = Array.isArray(nums) ? nums[0] : nums; if (!(a >= 0 && a <= 2)) return null; return { type, arg: a, nums: outsideNumbers(type, a), id: type + ':' + a }; }
  if (!INSIDE.has(type)) return { type, nums: outsideNumbers(type), id: type };
  if (!Array.isArray(nums)) nums = [nums];
  nums = nums.map((x) => (x === '00' ? DZ : +x));
  if (nums.some((x) => !(x >= 0 && x <= 37) || !Number.isInteger(x)) || new Set(nums).size !== nums.length) return null;
  const k = key(nums);
  const ok = type === 'straight' ? nums.length === 1
    : type === 'five' ? k === key([0, DZ, 1, 2, 3])
      : LEGAL[type] ? LEGAL[type].has(k) : false;
  return ok ? { type, nums: nums.slice().sort((a, b) => a - b), id: type + ':' + k } : null;
}

export function createRoulette({ wallet, rng = cryptoRng } = {}) {
  const g = { bets: new Map(), history: [], last: null, lastBets: [], spinning: false, lastResult: null };
  g.total = () => { let t = 0; for (const b of g.bets.values()) t += b.amount; return money(t); };
  /** add `amount` to a bet spot (debits immediately; false if illegal / over the limits / no funds) */
  g.place = (type, nums, amount) => {
    amount = money(amount);
    const b = makeBet(type, nums); if (!b || !(amount > 0)) return { ok: false, err: 'illegal' };
    const inside = INSIDE.has(type);
    const prev = g.bets.get(b.id); const now = money((prev ? prev.amount : 0) + amount);
    const mn = inside ? LIMITS.insideMin : LIMITS.outsideMin, mx = inside ? LIMITS.insideMax : LIMITS.outsideMax;
    if (now < mn || now > mx) return { ok: false, err: 'limits' };
    if (g.total() + amount > LIMITS.spinMax) return { ok: false, err: 'limits' };
    if (!wallet.debit(amount, 'roulette')) return { ok: false, err: 'funds' };
    if (prev) prev.amount = now; else g.bets.set(b.id, Object.assign(b, { amount }));
    return { ok: true, bet: g.bets.get(b.id) };
  };
  g.remove = (id) => { const b = g.bets.get(id); if (!b) return 0; g.bets.delete(id); wallet.credit(b.amount, 'roulette-clear'); return b.amount; };
  g.clear = () => { let t = 0; for (const id of [...g.bets.keys()]) t += g.remove(id); return money(t); };
  g.rebet = () => { let ok = true; for (const b of g.lastBets) { const r = g.place(b.type, b.type === 'dozen' || b.type === 'column' ? [b.arg] : b.nums, b.amount); if (!r.ok) ok = false; } return ok; };
  /** spin: picks a pocket uniformly (1 of 38) unless `forced` (tests); settles every bet */
  g.spin = (forced) => {
    if (!g.bets.size) return { ok: false, err: 'nobets' };
    const idx = forced != null ? WHEEL.indexOf(forced === '00' ? DZ : forced) : rng.int(38);
    const n = WHEEL[idx];
    const wins = []; let paid = 0, staked = 0;
    for (const b of g.bets.values()) {
      staked += b.amount;
      if (b.nums.includes(n)) { const p = money(b.amount * (PAYOUT[b.type] + 1)); paid += p; wins.push({ id: b.id, type: b.type, amount: b.amount, paid: p }); }
    }
    paid = money(paid);
    if (paid) wallet.credit(paid, 'roulette');
    g.lastBets = [...g.bets.values()].map((b) => ({ type: b.type, nums: b.nums, arg: b.arg, amount: b.amount }));
    g.bets.clear();
    g.history.unshift(n); if (g.history.length > 24) g.history.length = 24;
    g.last = n;
    g.lastResult = { n, wheelIndex: idx, wins, paid, staked: money(staked), net: money(paid - staked) };
    return Object.assign({ ok: true }, g.lastResult);
  };
  return g;
}

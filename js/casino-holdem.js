// casino-holdem.js — V10 CASINO: No-Limit Texas Hold'em, the visitor vs 3–5 bot players (play chips only).
// Rules: blinds 25 / 50, button rotates, heads-up rule not needed (≥ 4 seats), no-limit betting with the full
// minimum-raise rule (a raise must be at least the previous bet / raise increment; a SHORT all-in does not reopen the
// betting for players who already acted), uncalled bets are returned, side pots are built from the all-in levels,
// split pots share equally with odd chips going to the first winner left of the button, the board is run out when
// betting is over. Hand ranking = casino-cards.evaluate (best 5 of 7).
// Bots: Monte-Carlo equity vs the remaining opponents (crypto RNG), pot odds, position-free personalities
// (tight / loose, passive / aggressive, small bluff rate) and sensible bet sizing.
import { newDeck, evaluate, category, HAND_KEYS } from './casino-cards.js';
import { cryptoRng, shuffle } from './casino-rng.js';

export const HOLDEM = { sb: 25, bb: 50, minBuy: 1000, maxBuy: 10000, defBuy: 5000, botStack: 5000 };
const BOT_NAMES = ['Ava', 'Leo', 'Mila', 'Noah', 'Iris', 'Hugo', 'Nina', 'Theo', 'Lola', 'Max', 'Rosa', 'Eli'];
const PERS = [
  { key: 'rock', tight: 0.08, aggr: 0.35, bluff: 0.02 },
  { key: 'tag', tight: 0.04, aggr: 0.65, bluff: 0.06 },
  { key: 'lag', tight: -0.04, aggr: 0.8, bluff: 0.12 },
  { key: 'station', tight: -0.06, aggr: 0.25, bluff: 0.03 },
  { key: 'solid', tight: 0.02, aggr: 0.5, bluff: 0.05 },
];

/** side pots from contributions. seats: [{total, folded}] → [{amount, eligible:[idx]}] */
export function buildPots(seats) {
  const levels = [...new Set(seats.filter((s) => !s.folded && s.total > 0).map((s) => s.total))].sort((a, b) => a - b);
  const pots = []; let prev = 0, taken = 0;
  for (const L of levels) {
    let amt = 0;
    for (const s of seats) amt += Math.max(0, Math.min(s.total, L) - Math.min(s.total, prev));
    const eligible = seats.map((s, i) => (!s.folded && s.total >= L ? i : -1)).filter((i) => i >= 0);
    if (amt > 0) pots.push({ amount: amt, eligible });
    taken += amt; prev = L;
  }
  const all = seats.reduce((t, s) => t + s.total, 0);
  if (pots.length && all > taken) pots[pots.length - 1].amount += all - taken; // folded chips above the top level
  return pots;
}
/** award pots: scores[i] (higher better), order = seat indices starting left of the button → {won[i]} */
export function awardPots(pots, scores, order) {
  const won = {};
  for (const p of pots) {
    let best = -1; for (const i of p.eligible) best = Math.max(best, scores[i]);
    const winners = order.filter((i) => p.eligible.includes(i) && scores[i] === best);
    const share = Math.floor(p.amount / winners.length); let odd = p.amount - share * winners.length;
    for (const i of winners) { won[i] = (won[i] || 0) + share + (odd > 0 ? 1 : 0); if (odd > 0) odd--; }
  }
  return won;
}

/** Monte-Carlo equity of `hole` vs `nOpp` random hands given `board` (0..5 cards) */
export function equity(hole, board, nOpp, iters = 200, rng = cryptoRng) {
  const used = new Set([...hole, ...board]);
  const rest = []; for (let c = 0; c < 52; c++) if (!used.has(c)) rest.push(c);
  let win = 0;
  const need = 5 - board.length;
  for (let it = 0; it < iters; it++) {
    // partial Fisher–Yates for the cards we need
    const k = need + nOpp * 2;
    for (let i = 0; i < k; i++) { const j = i + rng.int(rest.length - i); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
    const b = board.concat(rest.slice(0, need));
    const me = evaluate(hole.concat(b));
    let best = 0, ties = 0, lost = false;
    for (let o = 0; o < nOpp; o++) {
      const s = evaluate([rest[need + o * 2], rest[need + o * 2 + 1]].concat(b));
      if (s > me) { lost = true; break; } if (s === me) ties++;
      best = Math.max(best, s);
    }
    if (!lost) win += 1 / (ties + 1);
  }
  return win / iters;
}

export function createHoldem({ wallet, rng = cryptoRng, bots = 5, equityIters = 220 } = {}) {
  const g = {
    seats: [], button: 0, board: [], deck: [], dpos: 0, street: 'idle', toAct: -1, currentBet: 0, minRaise: HOLDEM.bb,
    handNo: 0, log: [], result: null, nameIdx: 0, lastAggressor: -1,
  };
  const ev = (type, d = {}) => { g.log.push(Object.assign({ type, street: g.street }, d)); };
  const newBot = () => {
    const name = BOT_NAMES[g.nameIdx++ % BOT_NAMES.length];
    return { name, human: false, stack: HOLDEM.botStack, hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, out: false,
      pers: PERS[(g.nameIdx * 3) % PERS.length], last: '' };
  };
  g.sit = (buyIn = HOLDEM.defBuy, nBots = bots) => {
    buyIn = Math.round(buyIn);
    if (buyIn < HOLDEM.minBuy || buyIn > HOLDEM.maxBuy) return { ok: false, err: 'limits' };
    if (!wallet.debit(buyIn, 'holdem')) return { ok: false, err: 'funds' };
    nBots = Math.max(3, Math.min(5, nBots | 0));
    g.seats = [{ name: 'you', human: true, stack: buyIn, hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, out: false, last: '' }];
    for (let i = 0; i < nBots; i++) g.seats.push(newBot());
    g.button = rng.int(g.seats.length); g.street = 'idle';
    return { ok: true };
  };
  g.rebuy = (amt = HOLDEM.defBuy) => {
    if (g.street !== 'idle' && g.street !== 'done') return { ok: false, err: 'phase' };
    const me = g.seats[0]; amt = Math.round(amt);
    if (me.stack + amt > HOLDEM.maxBuy) amt = HOLDEM.maxBuy - me.stack;
    if (amt <= 0) return { ok: false, err: 'limits' };
    if (!wallet.debit(amt, 'holdem')) return { ok: false, err: 'funds' };
    me.stack += amt; return { ok: true };
  };
  /** cash out the visitor's stack to the bankroll (folds a live hand first) */
  g.leave = () => {
    const me = g.seats[0]; if (!me) return 0;
    if (g.street !== 'idle' && g.street !== 'done' && !me.folded) { me.folded = true; ev('fold', { seat: 0 }); }
    const v = me.stack; me.stack = 0; if (v) wallet.credit(v, 'holdem-cashout');
    g.seats = []; g.street = 'idle';
    return v;
  };
  const N = () => g.seats.length;
  const nextIdx = (i) => (i + 1) % N();
  const live = () => g.seats.filter((s) => !s.folded && !s.out);
  const canMove = (s) => !s.folded && !s.allIn && !s.out;
  const pot = () => g.seats.reduce((t, s) => t + s.total, 0);
  g.pot = pot;
  const draw = () => g.deck[g.dpos++];

  function post(i, amt) { const s = g.seats[i]; const a = Math.min(amt, s.stack); s.stack -= a; s.bet += a; s.total += a; if (!s.stack) s.allIn = true; return a; }

  g.startHand = () => {
    if (!g.seats.length) return { ok: false, err: 'nosit' };
    // replace busted bots, sit the visitor out if broke
    for (let i = 1; i < N(); i++) if (g.seats[i].stack < HOLDEM.bb) { g.seats[i] = newBot(); ev('newbot', { seat: i }); }
    const me = g.seats[0];
    if (me.stack < HOLDEM.bb) return { ok: false, err: 'rebuy' };
    g.handNo++; g.log = []; g.result = null; g.board = [];
    g.deck = shuffle(newDeck(), rng); g.dpos = 0;
    for (const s of g.seats) Object.assign(s, { hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, out: false, last: '' });
    g.button = nextIdx(g.button);
    const sb = nextIdx(g.button), bb = nextIdx(sb);
    g.sbSeat = sb; g.bbSeat = bb;
    g.street = 'preflop';
    post(sb, HOLDEM.sb); g.seats[sb].last = 'sb';
    post(bb, HOLDEM.bb); g.seats[bb].last = 'bb';
    ev('blinds', { sb, bb });
    for (let r = 0; r < 2; r++) for (let k = 1; k <= N(); k++) { const i = (g.button + k) % N(); g.seats[i].hole.push(draw()); }
    g.currentBet = HOLDEM.bb; g.minRaise = HOLDEM.bb; g.lastAggressor = bb;
    g.toAct = firstToAct(nextIdx(bb));
    ev('deal');
    if (g.toAct < 0) finishRound();
    return { ok: true };
  };
  function firstToAct(from) {
    for (let k = 0; k < N(); k++) { const i = (from + k) % N(); const s = g.seats[i]; if (canMove(s) && (!s.acted || s.bet < g.currentBet)) return i; }
    return -1;
  }
  /** legal options for seat i */
  g.legal = (i = g.toAct) => {
    const s = g.seats[i]; if (!s || i !== g.toAct) return null;
    const toCall = Math.max(0, g.currentBet - s.bet);
    const o = { fold: toCall > 0, check: toCall === 0, call: toCall > 0 ? Math.min(toCall, s.stack) : 0, raise: null, toCall, allIn: s.bet + s.stack };
    const canRaise = s.stack > toCall && (!s.acted || g.reopen.has(i));
    if (canRaise) {
      const minTo = g.currentBet === 0 ? HOLDEM.bb : g.currentBet + g.minRaise;
      const maxTo = s.bet + s.stack;
      o.raise = { min: Math.min(minTo, maxTo), max: maxTo };
    }
    return o;
  };
  g.reopen = new Set();
  /** act: {type:'fold'|'check'|'call'|'raise', to} (raise.to = total bet this street; ≥ max = all-in) */
  g.act = (i, a) => {
    const L = g.legal(i); if (!L) return { ok: false, err: 'turn' };
    const s = g.seats[i];
    if (a.type === 'fold') { if (!L.fold) a = { type: 'check' }; else { s.folded = true; s.last = 'fold'; ev('fold', { seat: i }); } }
    if (a.type === 'check') { if (!L.check) return { ok: false, err: 'illegal' }; s.last = 'check'; ev('check', { seat: i }); }
    else if (a.type === 'call') { if (!L.call) return { ok: false, err: 'illegal' }; post(i, L.call); s.last = s.allIn ? 'allin' : 'call'; ev('call', { seat: i, amt: L.call }); }
    else if (a.type === 'raise') {
      if (!L.raise) { // can't raise → treat as call / check
        return L.call ? g.act(i, { type: 'call' }) : g.act(i, { type: 'check' });
      }
      const opening = g.currentBet === 0;
      let to = Math.round(a.to || 0);
      to = Math.max(L.raise.min, Math.min(L.raise.max, to));
      const inc = to - g.currentBet;
      post(i, to - s.bet);
      if (inc >= g.minRaise || g.currentBet === 0) { // full raise (or opening bet) → reopens the action
        g.minRaise = Math.max(inc, HOLDEM.bb); g.reopen = new Set(g.seats.map((_, k) => k).filter((k) => k !== i));
        for (const o of g.seats) if (o !== s) o.acted = false;
      }
      g.currentBet = Math.max(g.currentBet, s.bet);
      g.lastAggressor = i;
      s.last = s.allIn ? 'allin' : opening ? 'bet' : 'raise';
      ev('raise', { seat: i, to: s.bet, allIn: s.allIn });
    }
    s.acted = true; g.reopen.delete(i);
    if (live().length === 1) { finishHand(); return { ok: true }; }
    g.toAct = firstToAct(nextIdx(i));
    if (g.toAct < 0) finishRound();
    return { ok: true };
  };
  function returnUncalled() {
    const bets = g.seats.map((s) => s.bet);
    const max = Math.max(...bets); const who = bets.indexOf(max);
    const second = Math.max(0, ...bets.filter((_, k) => k !== who));
    if (max > second) { const s = g.seats[who]; const back = max - second; s.bet -= back; s.total -= back; s.stack += back; if (s.stack > 0) s.allIn = false; ev('uncalled', { seat: who, amt: back }); }
  }
  function finishRound() {
    returnUncalled();
    if (live().length === 1) { finishHand(); return; }
    const movers = live().filter((s) => !s.allIn);
    const runout = movers.length <= 1;
    for (const s of g.seats) { s.bet = 0; s.acted = false; }
    g.currentBet = 0; g.minRaise = HOLDEM.bb; g.reopen = new Set();
    const next = { preflop: 'flop', flop: 'turn', turn: 'river', river: 'showdown' }[g.street];
    if (next === 'showdown') { g.street = 'showdown'; finishHand(); return; }
    g.street = next;
    if (next === 'flop') { g.dpos++; g.board.push(draw(), draw(), draw()); } else { g.dpos++; g.board.push(draw()); }
    ev('board', { board: g.board.slice() });
    if (runout) { g.toAct = -1; finishRound(); return; }
    g.toAct = firstToAct(nextIdx(g.button));
    if (g.toAct < 0) finishRound();
  }
  function finishHand() {
    const L = live();
    const order = []; for (let k = 1; k <= N(); k++) order.push((g.button + k) % N());
    let won, scores = {}, showdown = false;
    if (L.length === 1) {
      returnUncalled();
      const w = g.seats.indexOf(L[0]); won = { [w]: pot() };
    } else {
      showdown = true;
      while (g.board.length < 5) { g.dpos++; g.board.push(draw()); }
      g.seats.forEach((s, i) => { scores[i] = s.folded ? -1 : evaluate(s.hole.concat(g.board)); });
      won = awardPots(buildPots(g.seats), scores, order);
    }
    for (const k in won) g.seats[k].stack += won[k];
    g.result = { won, showdown, scores, hands: Object.fromEntries(Object.entries(scores).filter(([, v]) => v >= 0).map(([k, v]) => [k, HAND_KEYS[category(v)]])), pot: pot() };
    g.street = 'done'; g.toAct = -1;
    ev('result', g.result);
  }

  /* ------------------------------------------------------------------ bots */
  g.botDecision = (i) => {
    const s = g.seats[i]; const L = g.legal(i); if (!L) return null;
    const P = s.pers || PERS[0];
    const opp = live().length - 1;
    const e = equity(s.hole, g.board, Math.max(1, opp), equityIters, rng);
    const potNow = pot();
    const potOdds = L.toCall > 0 ? L.toCall / (potNow + L.toCall) : 0;
    const r = rng.float();
    // "fair share" equity for this many opponents, personality adjusts the bar
    const fair = 1 / (opp + 1);
    const strong = fair + 0.28 + P.tight, good = fair + 0.1 + P.tight;
    const sizeTo = (frac) => { const b = Math.max(L.raise ? L.raise.min : 0, Math.round((s.bet + L.toCall + frac * (potNow + L.toCall)) / 25) * 25); return L.raise ? Math.min(b, L.raise.max) : 0; };
    if (L.check) {
      if (L.raise && (e > strong && r < 0.55 + P.aggr * 0.4)) return { type: 'raise', to: sizeTo(0.55 + rng.float() * 0.45) };
      if (L.raise && (e > good && r < P.aggr * 0.6)) return { type: 'raise', to: sizeTo(0.4 + rng.float() * 0.3) };
      if (L.raise && r < P.bluff) return { type: 'raise', to: sizeTo(0.5) };
      return { type: 'check' };
    }
    // facing a bet
    if (e > strong + 0.12 && L.raise && r < 0.35 + P.aggr * 0.5) return { type: 'raise', to: e > 0.85 && r < 0.3 ? L.raise.max : sizeTo(0.8 + rng.float() * 0.6) };
    if (e > potOdds + 0.04 - P.tight * 0.5 || (e > good && L.toCall <= HOLDEM.bb * 2)) return { type: 'call' };
    if (L.raise && r < P.bluff * 0.5 && g.street !== 'river') return { type: 'raise', to: sizeTo(0.9) };
    if (L.toCall <= HOLDEM.bb / 2 && e > fair * 0.8) return { type: 'call' }; // cheap completion
    return { type: 'fold' };
  };
  /** perform the next bot action if a bot is to act → {seat, action} | null */
  g.stepBot = () => {
    if (g.toAct < 0 || g.street === 'done' || g.street === 'idle') return null;
    const i = g.toAct; const s = g.seats[i]; if (s.human) return null;
    const a = g.botDecision(i) || { type: 'check' };
    const r = g.act(i, a);
    if (!r.ok) g.act(i, g.legal(i) && g.legal(i).check ? { type: 'check' } : { type: 'fold' });
    return { seat: i, action: a.type, last: s.last, to: s.bet };
  };
  g.humanTurn = () => g.toAct === 0 && g.street !== 'done';
  g.chipsInPlay = () => g.seats.reduce((t, s) => t + s.stack + (g.street === 'done' || g.street === 'idle' ? 0 : s.total), 0);
  return g;
}

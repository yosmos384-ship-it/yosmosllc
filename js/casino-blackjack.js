// casino-blackjack.js — V10 CASINO: blackjack rules engine (play chips only).
// Rules (shown at the table): 6-deck shoe with a cut card (72–80 % penetration), dealer STANDS on soft 17 (S17),
// dealer peeks for blackjack with an Ace or a ten-value up card, blackjack pays 3:2, insurance (Ace up) pays 2:1,
// late surrender (after the peek, first two cards, not after a split) returns half, double on any first two cards
// including after a split (DAS), split up to 3 times (4 hands), split aces get one card each and cannot be re-split,
// 21 after a split is not a blackjack. Table limits 10–1,000 per hand.
// Pure logic: the engine takes a wallet {debit(n) → bool, credit(n)} and an rng; the UI animates the event log.
import { createShoe } from './casino-cards.js';
import { cryptoRng, money } from './casino-rng.js';

export const BJ_RULES = { decks: 6, min: 10, max: 1000, s17: true, bjPays: 1.5, maxSplits: 3, das: true, surrender: 'late', insurance: true, resplitAces: false };
/** blackjack value of a card: 2..10 face value, J/Q/K = 10, A = 11 (soft) */
export const cardValue = (c) => { const r = c % 13; return r === 12 ? 11 : r >= 8 ? 10 : r + 2; };
export function handValue(cs) {
  let t = 0, aces = 0;
  for (const c of cs) { const v = cardValue(c); t += v; if (v === 11) aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { total: t, soft: aces > 0 && t <= 21 };
}
export const isBlackjack = (cs) => cs.length === 2 && handValue(cs).total === 21;

/** dealer rule: S17 → hit below 17, stand on all 17 (incl. soft 17) */
export function dealerShouldHit(cs, s17 = true) { const v = handValue(cs); return v.total < 17 || (!s17 && v.total === 17 && v.soft); }

export function createBlackjack({ wallet, rng = cryptoRng, rules = {} } = {}) {
  const R = Object.assign({}, BJ_RULES, rules);
  const shoe = createShoe(R.decks, { rng });
  const g = {
    rules: R, shoe,
    phase: 'bet', // bet → insurance → player → done   (dealer play happens inside, events record it)
    hands: [], active: 0, dealer: [], holeHidden: true,
    insurance: 0, insuranceResult: null, log: [], lastBet: R.min, round: 0, reshuffled: false,
  };
  const ev = (type, data = {}) => { g.log.push(Object.assign({ type }, data)); };
  const draw = () => shoe.draw();
  const cur = () => g.hands[g.active];

  g.deal = (bet) => {
    bet = money(bet);
    if (g.phase !== 'bet' && g.phase !== 'done') return { ok: false, err: 'phase' };
    if (!(bet >= R.min && bet <= R.max)) return { ok: false, err: 'limits' };
    if (!wallet.debit(bet, 'bj')) return { ok: false, err: 'funds' };
    g.log = []; g.round++; g.lastBet = bet; g.insurance = 0; g.insuranceResult = null;
    g.reshuffled = false;
    if (shoe.needsShuffle) { shoe.shuffle(); g.reshuffled = true; ev('shuffle'); }
    g.hands = [{ cards: [], bet, doubled: false, done: false, splitFrom: false, splitAces: false, surrendered: false, result: null, payout: 0 }];
    g.active = 0; g.dealer = []; g.holeHidden = true;
    const h = g.hands[0];
    h.cards.push(draw()); ev('card', { to: 'p', hand: 0, card: h.cards[0] });
    g.dealer.push(draw()); ev('card', { to: 'd', card: g.dealer[0] });
    h.cards.push(draw()); ev('card', { to: 'p', hand: 0, card: h.cards[1] });
    g.dealer.push(draw()); ev('card', { to: 'd', hole: true });
    const up = g.dealer[0] % 13;
    if (up === 12 && R.insurance) { g.phase = 'insurance'; ev('insurance?'); return { ok: true }; }
    afterPeekStage();
    return { ok: true };
  };

  /** take (true) or decline insurance; costs half the bet, pays 2:1 when the dealer has blackjack */
  g.insure = (take) => {
    if (g.phase !== 'insurance') return { ok: false, err: 'phase' };
    if (take) {
      const amt = money(g.hands[0].bet / 2);
      if (wallet.debit(amt, 'bj-ins')) g.insurance = amt; else return { ok: false, err: 'funds' };
    }
    afterPeekStage();
    return { ok: true };
  };

  function afterPeekStage() {
    const up = g.dealer[0] % 13;
    const peek = up === 12 || up >= 8; // ace or ten-value up card
    const dealerBJ = isBlackjack(g.dealer);
    const h = g.hands[0];
    if (peek) ev('peek', { bj: dealerBJ });
    if (peek && dealerBJ) {
      g.holeHidden = false; ev('reveal', { card: g.dealer[1] });
      if (g.insurance) { wallet.credit(g.insurance * 3, 'bj-ins'); g.insuranceResult = 'win'; }
      if (isBlackjack(h.cards)) { h.result = 'push'; h.payout = h.bet; wallet.credit(h.bet, 'bj'); }
      else { h.result = 'lose'; h.payout = 0; }
      h.done = true; g.phase = 'done'; ev('settle'); return;
    }
    if (g.insurance) g.insuranceResult = 'lose';
    if (isBlackjack(h.cards)) {
      g.holeHidden = false; ev('reveal', { card: g.dealer[1] });
      h.result = 'blackjack'; h.payout = money(h.bet * (1 + R.bjPays)); wallet.credit(h.payout, 'bj');
      h.done = true; g.phase = 'done'; ev('settle'); return;
    }
    g.phase = 'player';
    autoAdvance();
  }

  g.splitsUsed = () => g.hands.length - 1;
  /** legal actions for the active hand */
  g.actions = () => {
    if (g.phase === 'insurance') return ['insurance', 'noinsurance'];
    if (g.phase !== 'player') return [];
    const h = cur(); if (!h || h.done) return [];
    const out = ['hit', 'stand'];
    const two = h.cards.length === 2;
    if (two && (!h.splitFrom || R.das) && wallet.can(h.bet)) out.push('double');
    if (two && cardValue(h.cards[0]) === cardValue(h.cards[1]) && g.splitsUsed() < R.maxSplits && wallet.can(h.bet)
      && !(h.splitAces && !R.resplitAces)) out.push('split');
    if (two && g.hands.length === 1 && R.surrender === 'late') out.push('surrender');
    return out;
  };
  const can = (a) => g.actions().includes(a);

  g.hit = () => {
    if (!can('hit')) return { ok: false, err: 'illegal' };
    const h = cur(); h.cards.push(draw()); ev('card', { to: 'p', hand: g.active, card: h.cards[h.cards.length - 1] });
    const v = handValue(h.cards).total;
    if (v > 21) { h.done = true; h.result = 'bust'; ev('bust', { hand: g.active }); }
    else if (v === 21) h.done = true;
    autoAdvance(); return { ok: true };
  };
  g.stand = () => { if (!can('stand')) return { ok: false, err: 'illegal' }; cur().done = true; autoAdvance(); return { ok: true }; };
  g.double = () => {
    if (!can('double')) return { ok: false, err: 'illegal' };
    const h = cur(); if (!wallet.debit(h.bet, 'bj')) return { ok: false, err: 'funds' };
    h.bet = money(h.bet * 2); h.doubled = true;
    h.cards.push(draw()); ev('card', { to: 'p', hand: g.active, card: h.cards[2], double: true });
    if (handValue(h.cards).total > 21) { h.result = 'bust'; ev('bust', { hand: g.active }); }
    h.done = true; autoAdvance(); return { ok: true };
  };
  g.split = () => {
    if (!can('split')) return { ok: false, err: 'illegal' };
    const h = cur(); if (!wallet.debit(h.bet, 'bj')) return { ok: false, err: 'funds' };
    const aces = h.cards[0] % 13 === 12;
    const nh = { cards: [h.cards.pop()], bet: h.bet, doubled: false, done: false, splitFrom: true, splitAces: aces, surrendered: false, result: null, payout: 0 };
    h.splitFrom = true; h.splitAces = aces;
    g.hands.splice(g.active + 1, 0, nh);
    ev('split', { hand: g.active });
    h.cards.push(draw()); ev('card', { to: 'p', hand: g.active, card: h.cards[1] });
    if (aces) { // split aces: one card each, both hands are finished
      nh.cards.push(draw()); ev('card', { to: 'p', hand: g.active + 1, card: nh.cards[1] });
      h.done = true; nh.done = true;
    } else if (handValue(h.cards).total === 21) h.done = true;
    // (a non-ace split hand receives its second card when it becomes the active hand — like at a real table)
    autoAdvance(); return { ok: true };
  };
  g.surrender = () => {
    if (!can('surrender')) return { ok: false, err: 'illegal' };
    const h = cur(); h.surrendered = true; h.done = true; h.result = 'surrender'; h.payout = money(h.bet / 2);
    wallet.credit(h.payout, 'bj'); ev('surrender');
    autoAdvance(); return { ok: true };
  };
  g.act = (a) => ({ hit: g.hit, stand: g.stand, double: g.double, split: g.split, surrender: g.surrender,
    insurance: () => g.insure(true), noinsurance: () => g.insure(false) }[a] || (() => ({ ok: false, err: 'unknown' })))();

  function autoAdvance() {
    while (g.active < g.hands.length && g.hands[g.active].done) {
      g.active++;
      if (g.active < g.hands.length) {
        const h = g.hands[g.active];
        ev('next', { hand: g.active });
        if (h.cards.length === 1) { h.cards.push(draw()); ev('card', { to: 'p', hand: g.active, card: h.cards[1] }); }
        if (handValue(h.cards).total === 21) h.done = true;
      }
    }
    if (g.active >= g.hands.length) dealerPlay();
  }

  function dealerPlay() {
    g.phase = 'dealer';
    g.holeHidden = false; ev('reveal', { card: g.dealer[1] });
    const live = g.hands.some((h) => !h.surrendered && h.result !== 'bust');
    if (live) {
      while (dealerShouldHit(g.dealer, R.s17)) { g.dealer.push(draw()); ev('card', { to: 'd', card: g.dealer[g.dealer.length - 1] }); }
    }
    const dv = handValue(g.dealer).total;
    for (const h of g.hands) {
      if (h.surrendered || h.result === 'bust') { if (h.result === 'bust') h.payout = 0; continue; }
      const pv = handValue(h.cards).total;
      if (dv > 21 || pv > dv) { h.result = 'win'; h.payout = money(h.bet * 2); }
      else if (pv === dv) { h.result = 'push'; h.payout = h.bet; }
      else { h.result = 'lose'; h.payout = 0; }
      if (h.payout) wallet.credit(h.payout, 'bj');
    }
    g.phase = 'done'; ev('settle', { dealer: dv });
  }

  /** net result of the round for the player (payouts − all wagers) */
  g.net = () => {
    let wag = g.insurance, back = g.insuranceResult === 'win' ? g.insurance * 3 : 0;
    for (const h of g.hands) { wag += h.bet; back += h.payout; }
    return money(back - wag);
  };
  return g;
}

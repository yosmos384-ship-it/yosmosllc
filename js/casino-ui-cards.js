// casino-ui-cards.js — V10 CASINO: overlay UIs for the card games: blackjack, baccarat, video poker.
// Each mount(body, api) builds its DOM inside the overlay body and returns {destroy, relabel, auto}. auto() plays one
// round by clicking the real buttons (used by the Playwright test). Strings: api.L (casino-i18n.js).
import { createBlackjack, handValue, BJ_RULES } from './casino-blackjack.js';
import { createBaccarat, score as bacScore, BAC_LIMITS } from './casino-baccarat.js';
import { createVideoPoker, VP_ORDER, VP_PAY, ROYAL_5COIN, COIN_VALUES, vpRank } from './casino-videopoker.js';
import { cardEl, chipEl, chipPicker, btn, h, arcText, sleep } from './casino-ui.js';

const waitFor = async (f, ms = 20000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await sleep(60); } return true; };
let uid = 0;

/* ================================================================================================ BLACKJACK */
export function mountBlackjack(body, api) {
  const { L, fmt, wallet } = api;
  const g = createBlackjack({ wallet });
  let pending = 0, busy = false, logIdx = 0, alive = true;
  const view = { dealer: [], hands: [[]] };
  const id = 'bjarc' + (++uid);
  const wrap = h('div');
  const felt = h('div', 'cz-felt');
  const dLbl = h('div', 'cz-lbl'), dCards = h('div', 'cz-cards'), dVal = h('div', 'cz-row');
  const arcBox = h('div');
  const handsBox = h('div', 'cz-row'); handsBox.style.alignItems = 'flex-start'; handsBox.style.gap = '14px'; handsBox.style.minHeight = '150px';
  const msg = h('div', 'cz-msg');
  felt.append(dLbl, dCards, dVal, arcBox, handsBox, msg);
  const ctr = h('div'); const rules = h('p', 'cz-note');
  wrap.append(felt, ctr, rules); body.appendChild(wrap);
  const picker = chipPicker([10, 25, 100, 500, 1000], 25);

  const vText = (cs) => { const v = handValue(cs); return v.soft && v.total < 21 && cs.length ? `${v.total - 10}/${v.total}` : String(v.total); };
  function renderTable(anim = false) {
    dLbl.textContent = L('dealer');
    dCards.innerHTML = '';
    view.dealer.forEach((d, i) => { const e = cardEl(d.c, { hidden: d.hidden }); if (!anim || !d.fresh) e.style.animation = 'none'; if (d.flip) { e.classList.add('flip'); d.flip = false; } d.fresh = false; dCards.appendChild(e); void i; });
    const shown = view.dealer.filter((d) => !d.hidden).map((d) => d.c);
    dVal.innerHTML = shown.length ? `<span class="cz-val">${vText(shown)}</span>` : '';
    handsBox.innerHTML = '';
    const hands = view.hands.length ? view.hands : [[]];
    hands.forEach((cs, i) => {
      const H = g.hands[i];
      const col = h('div'); col.style.textAlign = 'center';
      const active = g.phase === 'player' && g.active === i && hands.length > 1;
      const cc = h('div', 'cz-cards'); cs.forEach((c) => { const e = cardEl(c.c); if (!c.fresh) e.style.animation = 'none'; c.fresh = false; if (H && H.doubled && c === cs[2]) e.style.transform = 'rotate(90deg) translateX(-10px)'; cc.appendChild(e); });
      if (active) cc.style.filter = 'drop-shadow(0 0 10px rgba(255,214,120,.9))';
      col.appendChild(cc);
      if (cs.length) col.appendChild(h('div', '', `<span class="cz-val">${vText(cs.map((x) => x.c))}</span>`));
      const bet = H && g.phase !== 'bet' ? H.bet : pending;
      const st = h('div', 'cz-stake');
      if (bet) { st.appendChild(chipEl(Math.min(1000, bet), { sm: true, st: true })); st.appendChild(h('span', '', fmt(bet))); }
      else if (g.phase === 'bet' || g.phase === 'done') st.appendChild(h('span', 'cz-lbl', L('tapChipToBet')));
      if (H && H.result && g.phase === 'done') st.appendChild(h('span', 'cz-val', L('r_' + H.result)));
      col.appendChild(st);
      if (i === 0 && (g.phase === 'bet' || g.phase === 'done')) { col.style.cursor = 'pointer'; col.dataset.act = 'spot'; col.addEventListener('click', () => addChip()); }
      handsBox.appendChild(col);
    });
  }
  function addChip() {
    if (busy || !(g.phase === 'bet' || g.phase === 'done')) return;
    const v = picker.value; if (pending + v > BJ_RULES.max) { api.err('limits'); return; }
    if (pending + v > wallet.balance) { api.err('funds'); return; }
    if (g.phase === 'done' && view.hands.some((x) => x.length)) { view.dealer = []; view.hands = [[]]; msg.textContent = ''; msg.className = 'cz-msg'; }
    pending += v; api.sfx('chip'); renderTable(); renderCtr();
  }
  function renderCtr() {
    ctr.innerHTML = '';
    const ph = g.phase;
    if (busy) { ctr.appendChild(h('div', 'cz-row', `<span class="cz-lbl">…</span>`)); return; }
    if (ph === 'bet' || ph === 'done') {
      ctr.appendChild(picker.el);
      const r = h('div', 'cz-row');
      const bAdd = btn(L('addChip'), 'alt', 'add'); bAdd.addEventListener('click', addChip);
      const bClr = btn(L('clear'), 'alt', 'clear'); bClr.disabled = !pending; bClr.addEventListener('click', () => { pending = 0; renderTable(); renderCtr(); });
      const bRe = btn(L('rebet') + ' ' + fmt(g.lastBet), 'alt', 'rebet'); bRe.addEventListener('click', () => { pending = Math.min(g.lastBet, BJ_RULES.max); renderTable(); renderCtr(); });
      const bDeal = btn(L('deal'), 'big', 'deal'); bDeal.disabled = pending < BJ_RULES.min; bDeal.addEventListener('click', deal);
      r.append(bAdd, bClr, bRe, bDeal); ctr.appendChild(r);
    } else if (ph === 'insurance') {
      const r = h('div', 'cz-row'); ctr.appendChild(h('div', 'cz-msg', L('insuranceQ', fmt(g.hands[0].bet / 2))));
      const b1 = btn(L('insurance'), '', 'insurance'), b2 = btn(L('noInsurance'), 'alt', 'noinsurance');
      b1.addEventListener('click', () => act('insurance')); b2.addEventListener('click', () => act('noinsurance'));
      r.append(b1, b2); ctr.appendChild(r);
    } else if (ph === 'player') {
      const A = g.actions(); const r = h('div', 'cz-row');
      for (const a of ['hit', 'stand', 'double', 'split', 'surrender']) {
        const b = btn(L('a_' + a), a === 'hit' || a === 'stand' ? 'big' : 'alt', a); b.disabled = !A.includes(a);
        b.addEventListener('click', () => act(a)); r.appendChild(b);
      }
      ctr.appendChild(r);
    }
  }
  function rulesText() { rules.textContent = L('bjRules'); arcBox.innerHTML = ''; arcBox.appendChild(arcText(L('bjArc'), id)); }
  async function playLog() {
    busy = true; renderCtr();
    while (logIdx < g.log.length && alive) {
      const e = g.log[logIdx++];
      if (e.type === 'shuffle') { api.toast(L('shuffling')); api.sfx('shuffle'); await sleep(700); }
      else if (e.type === 'card') {
        if (e.to === 'd') view.dealer.push(e.hole ? { c: null, hidden: true, fresh: true } : { c: e.card, fresh: true });
        else { while (view.hands.length <= e.hand) view.hands.push([]); view.hands[e.hand].push({ c: e.card, fresh: true }); }
        api.sfx('card'); renderTable(true); await sleep(340);
      } else if (e.type === 'split') { const moved = view.hands[e.hand].pop(); view.hands.splice(e.hand + 1, 0, [moved]); api.sfx('chip'); renderTable(); await sleep(250); }
      else if (e.type === 'reveal') { const d = view.dealer[1]; if (d) { d.c = e.card; d.hidden = false; d.flip = true; } api.sfx('card'); renderTable(); await sleep(420); }
      else if (e.type === 'peek') { if (!e.bj) { msg.textContent = L('noDealerBJ'); await sleep(500); msg.textContent = ''; } }
      else if (e.type === 'bust') { api.sfx('lose'); await sleep(200); }
      else if (e.type === 'settle') { renderTable(); }
    }
    busy = false;
    if (g.phase === 'done') finish();
    renderTable(); renderCtr();
  }
  function finish() {
    const net = g.net();
    msg.className = 'cz-msg ' + (net > 0 ? 'win' : net < 0 ? 'lose' : 'push');
    const bj = g.hands.some((x) => x.result === 'blackjack');
    msg.textContent = net > 0 ? L('youWin', fmt(net)) : net < 0 ? L('youLose', fmt(-net)) : L('push');
    if (net > 0) { api.banner(bj ? L('blackjack') : L('win'), '+' + fmt(net)); api.sfx('win'); } else if (net < 0) api.sfx('lose');
    pending = 0;
  }
  function deal() {
    if (busy) return;
    const r = g.deal(pending);
    if (!r.ok) { api.err(r.err); return; }
    view.dealer = []; view.hands = [[]]; logIdx = 0; msg.textContent = ''; msg.className = 'cz-msg';
    try { api.fx && api.fx('cards:deal', { n: 4, game: 'blackjack', bet: pending }); } catch (_) {}
    api.sfx('chip'); playLog();
  }
  function act(a) { if (busy) return; const r = g.act(a); if (!r.ok) { api.err(r.err); return; } playLog(); }
  rulesText(); renderTable(); renderCtr();
  return {
    g,
    destroy() { alive = false; },
    relabel() { rulesText(); renderTable(); renderCtr(); },
    async auto() {
      const q = (s) => body.querySelector(`[data-act="${s}"]`);
      if (!pending) { picker.set(100); q('add').click(); }
      q('deal').click();
      await waitFor(() => !busy);
      let guard = 0;
      while (g.phase !== 'done' && guard++ < 20) {
        await waitFor(() => !busy);
        if (g.phase === 'insurance') q('noinsurance').click();
        else if (g.phase === 'player') { const t = handValue(g.hands[g.active].cards).total; (t < 12 ? q('hit') : q('stand')).click(); }
        await sleep(80); await waitFor(() => !busy);
      }
      await waitFor(() => !busy);
      return { phase: g.phase, results: g.hands.map((x) => x.result), dealer: handValue(g.dealer).total, net: g.net() };
    },
  };
}

/* ================================================================================================ BACCARAT */
export function mountBaccarat(body, api) {
  const { L, fmt, wallet } = api;
  const g = createBaccarat({ wallet });
  let busy = false, alive = true;
  const wrap = h('div'); body.appendChild(wrap);
  const felt = h('div', 'cz-felt blue');
  const table = h('div', 'cz-row'); table.style.alignItems = 'flex-start'; table.style.gap = '18px';
  const pBox = h('div'), bBox = h('div'); pBox.style.textAlign = bBox.style.textAlign = 'center'; pBox.style.minWidth = bBox.style.minWidth = '140px';
  table.append(pBox, bBox);
  const msg = h('div', 'cz-msg');
  const spots = h('div'); spots.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px';
  const pairs = h('div'); pairs.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px';
  felt.append(table, msg, pairs, spots);
  const road = h('div'); road.style.cssText = 'display:grid;grid-auto-flow:column;grid-template-rows:repeat(6,16px);grid-auto-columns:16px;gap:3px;overflow-x:auto;padding:8px;border-radius:10px;background:#f7f1e3;margin:8px 4px;direction:ltr;min-height:120px';
  const ctr = h('div'); const note = h('p', 'cz-note');
  wrap.append(felt, ctr, h('div', 'cz-lbl', ''), road, note);
  const picker = chipPicker([10, 25, 100, 500, 1000], 25);
  let shownP = [], shownB = [];
  const SIDES = [['player', '#3d7be0'], ['tie', '#2e9e5b'], ['banker', '#d43c4c']];
  function renderHands() {
    for (const [box, cs, side] of [[pBox, shownP, 'player'], [bBox, shownB, 'banker']]) {
      box.innerHTML = `<div class="cz-lbl">${L('bac_' + side)}</div>`;
      const cc = h('div', 'cz-cards loose'); cs.forEach((c, i) => { const e = cardEl(c.c); if (!c.fresh) e.style.animation = 'none'; c.fresh = false; if (i === 2) { e.style.transform = 'rotate(90deg)'; e.style.margin = '0 12px'; } cc.appendChild(e); });
      box.appendChild(cc);
      if (cs.length) box.appendChild(h('div', '', `<span class="cz-val">${bacScore(cs.map((x) => x.c))}</span>`));
    }
  }
  function renderSpots() {
    spots.innerHTML = ''; pairs.innerHTML = '';
    for (const [k, col] of SIDES.concat([['ppair', '#3d7be0'], ['bpair', '#d43c4c']])) {
      const s = h('button'); s.dataset.act = 'spot-' + k;
      const side = k === 'ppair' || k === 'bpair';
      s.style.cssText = `min-height:${side ? 52 : 86}px;border-radius:${side ? 999 : 14}px;border:2px solid ${col};background:rgba(0,0,0,.25);color:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font:700 14px system-ui`;
      s.innerHTML = `<span style="letter-spacing:.12em">${L('bac_' + k)}</span><span style="font-size:11px;opacity:.8">${L('bacPay_' + k)}</span>`;
      if (g.bets[k]) { const st = h('div', 'cz-stake'); st.appendChild(chipEl(Math.min(1000, g.bets[k]), { sm: true, st: true })); st.appendChild(h('span', '', fmt(g.bets[k]))); s.appendChild(st); }
      s.addEventListener('click', () => { if (busy) return; const r = g.place(k, picker.value); if (!r.ok) api.err(r.err); else { api.sfx('chip'); if (shownP.length) { shownP = []; shownB = []; renderHands(); msg.textContent = ''; } } renderSpots(); renderCtr(); });
      (side ? pairs : spots).appendChild(s);
    }
  }
  function renderRoad() {
    road.innerHTML = '';
    const hist = g.history.slice().reverse();
    for (const x of hist) { const d = h('div'); const c = x === 'P' ? '#2f6fd6' : x === 'B' ? '#d33447' : '#22994f'; d.style.cssText = `width:16px;height:16px;border-radius:50%;background:${c};color:#fff;font:700 9px/16px system-ui;text-align:center`; d.textContent = L('bead_' + x); road.appendChild(d); }
  }
  function renderCtr() {
    ctr.innerHTML = ''; if (busy) return;
    ctr.appendChild(picker.el);
    const r = h('div', 'cz-row');
    const bC = btn(L('clear'), 'alt', 'clear'); bC.disabled = !g.total(); bC.addEventListener('click', () => { g.clear(); renderSpots(); renderCtr(); });
    const bR = btn(L('rebet'), 'alt', 'rebet'); bR.disabled = !g.lastBets || !!g.total(); bR.addEventListener('click', () => { if (!g.rebet()) api.err('funds'); renderSpots(); renderCtr(); });
    const bD = btn(L('deal'), 'big', 'deal'); bD.disabled = !g.total(); bD.addEventListener('click', deal);
    r.append(bC, bR, bD); ctr.appendChild(r);
  }
  async function deal() {
    if (busy) return; const r = g.deal(); if (!r.ok) { api.err(r.err); return; }
    busy = true; renderCtr(); shownP = []; shownB = []; msg.textContent = ''; msg.className = 'cz-msg';
    try { api.fx && api.fx('cards:deal', { n: r.player.length + r.banker.length, game: 'baccarat' }); } catch (_) {}
    if (r.reshuffled) { api.toast(L('shuffling')); await sleep(600); }
    const order = [['p', 0], ['b', 0], ['p', 1], ['b', 1], ['p', 2], ['b', 2]];
    for (const [s, i] of order) {
      const src = s === 'p' ? r.player : r.banker; if (i >= src.length) continue;
      if (!alive) return;
      (s === 'p' ? shownP : shownB).push({ c: src[i], fresh: true }); api.sfx('card'); renderHands();
      await sleep(i === 2 ? 700 : 420);
    }
    const win = r.winner;
    msg.className = 'cz-msg ' + (r.net > 0 ? 'win' : r.net < 0 ? 'lose' : 'push');
    msg.textContent = L('bacWins_' + win, r.ps, r.bs) + (r.ppair ? ' · ' + L('bac_ppair') : '') + (r.bpair ? ' · ' + L('bac_bpair') : '') + ' · ' + (r.net > 0 ? L('youWin', fmt(r.net)) : r.net < 0 ? L('youLose', fmt(-r.net)) : L('push'));
    if (r.net > 0) { api.banner(L('bacWins_' + win, r.ps, r.bs), '+' + fmt(r.net)); api.sfx('win'); }
    busy = false; renderRoad(); renderSpots(); renderCtr();
  }
  const relabel = () => { note.textContent = L('bacRules'); renderHands(); renderSpots(); renderRoad(); renderCtr(); };
  relabel();
  return {
    g, destroy() { alive = false; }, relabel,
    async auto() { picker.set(100); body.querySelector('[data-act="spot-banker"]').click(); body.querySelector('[data-act="deal"]').click(); await sleep(100); await waitFor(() => !busy); return { winner: g.last && g.last.winner, ps: g.last.ps, bs: g.last.bs, net: g.last.net }; },
  };
}

/* ================================================================================================ VIDEO POKER */
export function mountVideoPoker(body, api) {
  const { L, fmt, wallet } = api;
  const g = createVideoPoker({ wallet });
  g.setCoin(5);
  let busy = false, alive = true, lastRank = null;
  const wrap = h('div'); body.appendChild(wrap);
  const screen = h('div'); screen.style.cssText = 'margin:6px 2px;padding:10px;border-radius:16px;background:linear-gradient(180deg,#0b1a4a,#071033);box-shadow:inset 0 0 0 2px #2c4aa8,0 0 0 4px #0a0a0a,0 0 0 6px #d9b46a,0 14px 30px rgba(0,0,0,.5)';
  const pay = h('table'); pay.style.cssText = 'width:100%;border-collapse:collapse;font:700 12px/1.25 system-ui;color:#ffe680;direction:ltr;font-variant-numeric:tabular-nums';
  const cardsBox = h('div', 'cz-cards loose'); cardsBox.style.margin = '12px 0 4px'; cardsBox.style.minHeight = '120px';
  const msg = h('div', 'cz-msg');
  screen.append(pay, cardsBox, msg);
  const ctr = h('div'); const note = h('p', 'cz-note');
  wrap.append(screen, ctr, note);
  function renderPay() {
    pay.innerHTML = '';
    for (const k of VP_ORDER) {
      const tr = h('tr'); if (lastRank === k && g.phase === 'done') tr.style.cssText = 'background:#ffe680;color:#071033';
      tr.appendChild(h('td', '', L('vp_' + k))).style.cssText = 'text-align:start;padding:2px 6px;color:inherit;' + (lastRank === k && g.phase === 'done' ? '' : 'color:#ffe680');
      for (let c = 1; c <= 5; c++) { const td = h('td', '', String(k === 'royal' && c === 5 ? ROYAL_5COIN : VP_PAY[k] * c)); td.style.cssText = 'text-align:end;padding:2px 6px;' + (c === g.coins ? 'background:rgba(214,40,40,.55);color:#fff' : ''); tr.appendChild(td); }
      pay.appendChild(tr);
    }
  }
  function renderCards() {
    cardsBox.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const col = h('div'); col.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;margin:0 2px'; col.dataset.act = 'card' + i;
      const c = g.hand.length ? cardEl(g.hand[i]) : cardEl(null, { hidden: true });
      c.style.width = '60px'; c.style.height = '86px'; c.style.margin = '0'; if (!fresh.has(i)) c.style.animation = 'none';
      if (g.phase === 'done' && lastWin && winCards.has(i)) c.classList.add('hl');
      col.appendChild(c);
      const held = h('div', '', g.held[i] && g.phase === 'draw' ? L('held') : '&nbsp;'); held.style.cssText = 'font:800 12px system-ui;letter-spacing:.12em;color:#ffe680;min-height:16px';
      col.appendChild(held);
      col.addEventListener('click', () => { if (g.phase !== 'draw' || busy) return; g.toggle(i); api.sfx('tick'); fresh.clear(); renderCards(); });
      cardsBox.appendChild(col);
    }
    fresh.clear();
  }
  const fresh = new Set(); let lastWin = 0; let winCards = new Set();
  function renderCtr() {
    ctr.innerHTML = '';
    const r0 = h('div', 'cz-row');
    r0.appendChild(h('span', 'cz-lbl', L('coinValue')));
    for (const v of COIN_VALUES) { const c = chipEl(v, { sel: g.coin === v }); c.addEventListener('click', () => { if (g.setCoin(v)) { api.sfx('chip'); renderCtr(); } }); r0.appendChild(c); }
    ctr.appendChild(r0);
    ctr.appendChild(h('div', 'cz-stake', `${L('bet')}: ${g.coins} × ${fmt(g.coin)} = ${fmt(g.bet())}`));
    const r = h('div', 'cz-row');
    const b1 = btn(L('betOne'), 'alt', 'betone'); b1.disabled = g.phase === 'draw' || busy; b1.addEventListener('click', () => { g.setCoins(g.coins % 5 + 1); api.sfx('chip'); renderPay(); renderCtr(); });
    const b5 = btn(L('betMax'), 'alt', 'betmax'); b5.disabled = g.phase === 'draw' || busy; b5.addEventListener('click', () => { g.setCoins(5); renderPay(); deal(); });
    const hint = btn(L('hint'), 'alt', 'hint'); hint.disabled = g.phase !== 'draw' || busy; hint.addEventListener('click', () => { const m = g.hint(); m.forEach((x, i) => { g.held[i] = x; }); renderCards(); });
    const bd = btn(g.phase === 'draw' ? L('draw') : L('deal'), 'big', 'deal'); bd.disabled = busy; bd.addEventListener('click', () => (g.phase === 'draw' ? draw() : deal()));
    r.append(b1, b5, hint, bd); ctr.appendChild(r);
  }
  async function deal() {
    if (busy) return; const r = g.deal(); if (!r.ok) { api.err(r.err); return; }
    busy = true; lastRank = null; lastWin = 0; msg.textContent = ''; msg.className = 'cz-msg'; renderPay(); renderCtr();
    g.hand = r.hand; const saved = g.hand.slice();
    for (let i = 0; i < 5; i++) { g.hand = saved.slice(0, i + 1).concat(new Array(4 - i).fill(null)); fresh.clear(); fresh.add(i); renderCardsPartial(i); api.sfx('card'); await sleep(140); if (!alive) return; }
    g.hand = saved;
    const pre = vpRank(g.hand); if (pre !== 'none') msg.textContent = L('vp_' + pre);
    busy = false; renderCards(); renderCtr();
  }
  function renderCardsPartial(n) { cardsBox.innerHTML = ''; for (let i = 0; i < 5; i++) { const c = i <= n ? cardEl(g.hand[i]) : cardEl(null, { hidden: true }); c.style.width = '60px'; c.style.height = '86px'; c.style.margin = '0 2px'; if (i !== n) c.style.animation = 'none'; const col = h('div'); col.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;margin:0 2px'; col.append(c, h('div', '', '&nbsp;')); cardsBox.appendChild(col); } }
  async function draw() {
    if (busy) return; busy = true; const before = g.hand.slice(); const r = g.draw(); if (!r.ok) { busy = false; api.err(r.err); return; }
    const cur = before.slice();
    for (const i of r.replaced) { cur[i] = r.hand[i]; g.hand = cur.slice(); fresh.clear(); fresh.add(i); renderCards(); api.sfx('card'); await sleep(150); if (!alive) return; }
    g.hand = r.hand; lastRank = r.rank; lastWin = r.paid;
    winCards = new Set(r.rank !== 'none' ? [0, 1, 2, 3, 4] : []);
    msg.className = 'cz-msg ' + (r.paid ? 'win' : 'lose');
    msg.textContent = r.paid ? `${L('vp_' + r.rank)} · ${L('youWin', fmt(r.paid))}` : L('vpNoWin');
    if (r.paid) { api.sfx('win'); if (r.paid >= g.bet() * 5) api.banner(L('vp_' + r.rank), '+' + fmt(r.paid)); }
    busy = false; renderPay(); renderCards(); renderCtr();
  }
  const relabel = () => { note.textContent = L('vpRules'); renderPay(); renderCards(); renderCtr(); };
  relabel();
  return {
    g, destroy() { alive = false; }, relabel,
    async auto() { body.querySelector('[data-act="deal"]').click(); await sleep(50); await waitFor(() => !busy); body.querySelector('[data-act="hint"]').click(); await sleep(50); body.querySelector('[data-act="deal"]').click(); await sleep(50); await waitFor(() => !busy); return { rank: g.result && g.result.rank, paid: g.result && g.result.paid }; },
  };
}
export { BAC_LIMITS };

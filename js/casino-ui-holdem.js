// casino-ui-holdem.js — V10 CASINO: Texas Hold'em overlay (the visitor + 3–5 bot players around an oval table).
// Sit down with a play-chip buy-in (1,000–10,000, from the bankroll), choose 3–5 opponents; "Leave table" cashes the
// stack back to the bankroll. Bots act one at a time with a short pause; showdown reveals hands and highlights the
// winning five cards.
import { createHoldem, HOLDEM } from './casino-holdem.js';
import { bestFive, evaluate, HAND_KEYS, category } from './casino-cards.js';
import { cardEl, chipEl, btn, h, sleep } from './casino-ui.js';

const waitFor = async (f, ms = 60000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await sleep(80); } return true; };
const AV = ['#b0413e', '#3e6db0', '#3e9b6d', '#8a5cc2', '#c28a2e', '#2e9fb0'];

export function mountHoldem(body, api) {
  const { L, fmt, wallet } = api;
  let g = null, alive = true, running = false, buyIn = 5000, nBots = 5, raiseTo = 0, autoNext = 0;
  const wrap = h('div'); body.appendChild(wrap);

  function sitScreen() {
    wrap.innerHTML = '';
    const s = h('div', 'cz-sheet');
    s.innerHTML = `<h3>${L('g_holdem')}</h3><p>${L('heSit')}</p>`;
    const f = h('div', 'cz-felt'); f.style.textAlign = 'center';
    f.appendChild(h('div', 'cz-lbl', L('buyIn')));
    const r1 = h('div', 'cz-row');
    for (const v of [1000, 2500, 5000, 10000]) { const b = btn(fmt(v), v === buyIn ? '' : 'alt', 'buy' + v); b.addEventListener('click', () => { buyIn = v; sitScreen(); }); r1.appendChild(b); }
    f.appendChild(r1);
    f.appendChild(h('div', 'cz-lbl', L('opponents'))).style.marginTop = '12px';
    const r2 = h('div', 'cz-row');
    for (const v of [3, 4, 5]) { const b = btn(String(v), v === nBots ? '' : 'alt', 'opp' + v); b.addEventListener('click', () => { nBots = v; sitScreen(); }); r2.appendChild(b); }
    f.appendChild(r2);
    s.appendChild(f);
    const r3 = h('div', 'cz-row'); const go = btn(L('sitDown'), 'big', 'sit'); go.addEventListener('click', sit); r3.appendChild(go); s.appendChild(r3);
    s.appendChild(h('p', 'cz-note', L('heRules')));
    wrap.appendChild(s);
  }
  function sit() {
    g = createHoldem({ wallet });
    const r = g.sit(buyIn, nBots); if (!r.ok) { api.err(r.err); g = null; return; }
    api.sfx('chip'); buildTable(); nextHand();
  }
  let tableEl, seatEls = [], boardEl, potEl, ctr, msg, btnD;
  function buildTable() {
    wrap.innerHTML = '';
    tableEl = h('div'); tableEl.style.cssText = 'position:relative;height:min(470px,62vh);min-height:400px;margin:30px 2px 4px;direction:ltr';
    const oval = h('div'); oval.style.cssText = 'position:absolute;left:7%;right:7%;top:9%;bottom:12%;border-radius:50%/42%;background:radial-gradient(110% 80% at 50% 35%,#1b7a5c,#0f5a43 55%,#083526);box-shadow:inset 0 0 0 3px rgba(0,0,0,.3),inset 0 0 50px rgba(0,0,0,.5),0 0 0 9px #3b2412,0 0 0 11px #d9b46a,0 18px 36px rgba(0,0,0,.55)';
    tableEl.appendChild(oval);
    const center = h('div'); center.style.cssText = 'position:absolute;left:50%;top:47%;transform:translate(-50%,-50%);text-align:center;width:80%';
    potEl = h('div', 'cz-val'); potEl.style.marginBottom = '6px';
    boardEl = h('div', 'cz-cards loose'); boardEl.style.minHeight = '62px';
    center.append(potEl, boardEl); tableEl.appendChild(center);
    btnD = h('div'); btnD.style.cssText = 'position:absolute;width:24px;height:24px;border-radius:50%;background:#fff;color:#111;font:800 12px/24px system-ui;text-align:center;box-shadow:0 2px 4px rgba(0,0,0,.5);transition:all .4s';
    btnD.textContent = 'D'; tableEl.appendChild(btnD);
    seatEls = g.seats.map((s, i) => {
      const e = h('div'); e.style.cssText = 'position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px;width:96px;text-align:center;transition:filter .3s';
      tableEl.appendChild(e); return e;
    });
    msg = h('div', 'cz-msg'); ctr = h('div');
    wrap.append(tableEl, msg, ctr);
  }
  function seatPos(i, n) {
    // visitor at the bottom centre, the others clockwise around the ellipse
    const a = Math.PI / 2 + (i / n) * Math.PI * 2;
    return { x: 50 + Math.cos(a) * 42, y: 50 + Math.sin(a) * 42 };
  }
  function render() {
    if (!g || !tableEl) return;
    const n = g.seats.length;
    if (seatEls.length !== n) buildTable();
    clearBets();
    potEl.textContent = `${L('pot')}: ${fmt(g.street === 'done' ? (g.result ? g.result.pot : 0) : g.pot())}`;
    // board
    const win5 = new Set();
    let winners = [];
    if (g.street === 'done' && g.result) { winners = Object.keys(g.result.won).map(Number); if (g.result.showdown) for (const w of winners) for (const c of bestFive(g.seats[w].hole.concat(g.board))) win5.add(c); }
    boardEl.innerHTML = '';
    for (let k = 0; k < 5; k++) { const c = g.board[k]; const e = c == null ? h('div') : cardEl(c, { cls: win5.size ? (win5.has(c) ? 'hl' : 'dim') : '' }); e.style.width = '44px'; e.style.height = '62px'; e.style.margin = '0 2px'; if (c == null) { e.style.cssText += ';border-radius:6px;border:1px dashed rgba(255,255,255,.25)'; } else if (shownBoard > k) e.style.animation = 'none'; boardEl.appendChild(e); }
    shownBoard = g.board.length;
    g.seats.forEach((s, i) => {
      const e = seatEls[i]; const p = seatPos(i, n); e.style.left = p.x + '%'; e.style.top = p.y + '%';
      const turn = g.toAct === i && g.street !== 'done';
      const reveal = s.human || (g.street === 'done' && g.result && g.result.showdown && !s.folded);
      e.innerHTML = '';
      const cards = h('div', 'cz-cards'); cards.style.minHeight = '0';
      for (const c of s.hole) { const ce = cardEl(c, { hidden: !reveal, cls: win5.size && reveal ? (win5.has(c) ? 'hl' : 'dim') : '' }); ce.style.width = s.human ? '46px' : '34px'; ce.style.height = s.human ? '66px' : '48px'; ce.style.margin = s.human ? '0 1px' : '0 -6px'; ce.style.animation = 'none'; if (s.folded) ce.style.opacity = '.25'; cards.appendChild(ce); }
      const av = h('div'); av.style.cssText = `width:${s.human ? 0 : 40}px;height:${s.human ? 0 : 40}px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3,transparent 60%),${AV[i % AV.length]};border:2px solid ${turn ? '#ffe08a' : 'rgba(255,255,255,.5)'};color:#fff;font:800 17px/36px system-ui;${turn ? 'box-shadow:0 0 16px #ffd166' : ''};${s.human ? 'display:none' : ''}`;
      av.textContent = s.human ? '' : s.name[0];
      const tag = h('div'); tag.style.cssText = `padding:3px 8px;border-radius:9px;background:rgba(0,0,0,.72);border:1px solid ${turn ? '#ffe08a' : 'rgba(217,180,106,.45)'};font:700 11px/1.25 system-ui;white-space:nowrap;color:#f4ead6;font-variant-numeric:tabular-nums`;
      tag.innerHTML = `${s.human ? L('you') : s.name}<br><span style="color:#ffe08a">${fmt(s.stack)}</span>`;
      const act = h('div'); act.style.cssText = 'min-height:16px;font:800 10px/16px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#ffe08a';
      if (g.street === 'done' && g.result && winners.includes(i)) act.textContent = `+${fmt(g.result.won[i])}${g.result.hands[i] ? ' · ' + L('hand_' + g.result.hands[i]) : ''}`;
      else if (s.last) act.textContent = L('act_' + s.last);
      if (s.human) { e.append(cards, tag, act); } else { e.append(av, cards, tag, act); }
      e.style.filter = s.folded ? 'grayscale(.8) brightness(.7)' : 'none';
      // bet chips toward the centre
      if (s.bet > 0 && g.street !== 'done') { const b = h('div'); b.style.cssText = 'position:absolute;display:flex;align-items:center;gap:3px;font:700 11px system-ui;color:#fff;text-shadow:0 1px 2px #000'; const q = { x: p.x + (50 - p.x) * 0.42, y: p.y + (50 - p.y) * 0.42 }; b.style.left = q.x + '%'; b.style.top = q.y + '%'; b.style.transform = 'translate(-50%,-50%)'; b.appendChild(chipEl(Math.min(1000, s.bet), { sm: true, st: true })); b.appendChild(h('span', '', fmt(s.bet))); b.className = 'he-bet'; tableEl.appendChild(b); }
    });
    // dealer button
    const bp = seatPos(g.button, n); const q = { x: bp.x + (50 - bp.x) * 0.25 + 6, y: bp.y + (50 - bp.y) * 0.25 }; btnD.style.left = `calc(${q.x}% - 12px)`; btnD.style.top = `calc(${q.y}% - 12px)`;
    renderCtr();
  }
  let shownBoard = 0;
  function clearBets() { tableEl && tableEl.querySelectorAll('.he-bet').forEach((b) => b.remove()); }
  function renderCtr() {
    if (!ctr) return; ctr.innerHTML = '';
    if (g.street === 'done' || g.street === 'idle') {
      const r = h('div', 'cz-row');
      const nx = btn(L('nextHand'), 'big', 'next'); nx.addEventListener('click', () => nextHand());
      const rb = btn(L('rebuy'), 'alt', 'rebuy'); rb.disabled = g.seats[0].stack + 1000 > HOLDEM.maxBuy; rb.addEventListener('click', () => { const r = g.rebuy(Math.min(HOLDEM.defBuy, HOLDEM.maxBuy - g.seats[0].stack)); if (!r.ok) api.err(r.err); else api.sfx('chip'); render(); });
      const lv = btn(L('leaveTable'), 'alt', 'leave'); lv.addEventListener('click', leave);
      r.append(nx, rb, lv); ctr.appendChild(r); return;
    }
    if (!g.humanTurn()) { ctr.appendChild(h('div', 'cz-lbl', L('waiting'))); const r = h('div', 'cz-row'); const lv = btn(L('leaveTable'), 'alt', 'leave'); lv.addEventListener('click', leave); r.appendChild(lv); ctr.appendChild(r); return; }
    const Lg = g.legal(0);
    const r = h('div', 'cz-row');
    const bf = btn(L('fold'), 'red', 'fold'); bf.disabled = !Lg.fold; bf.addEventListener('click', () => human({ type: 'fold' }));
    const bc = Lg.check ? btn(L('check'), 'big', 'check') : btn(L('call') + ' ' + fmt(Lg.call), 'big', 'call');
    bc.addEventListener('click', () => human(Lg.check ? { type: 'check' } : { type: 'call' }));
    r.append(bf, bc); ctr.appendChild(r);
    if (Lg.raise) {
      if (!(raiseTo >= Lg.raise.min && raiseTo <= Lg.raise.max)) raiseTo = Lg.raise.min;
      const rr = h('div', 'cz-row'); rr.style.marginTop = '8px';
      const pot = g.pot();
      for (const [k, v] of [['min', Lg.raise.min], ['halfPot', Math.round((g.currentBet + (pot + Lg.toCall) / 2) / 25) * 25], ['potBet', Math.round((g.currentBet + pot + Lg.toCall) / 25) * 25], ['allIn', Lg.raise.max]]) {
        const b = btn(L(k), 'alt', 'r-' + k); b.style.minHeight = '38px'; b.style.fontSize = '13px'; b.addEventListener('click', () => { raiseTo = Math.max(Lg.raise.min, Math.min(Lg.raise.max, v)); renderCtr(); }); rr.appendChild(b);
      }
      ctr.appendChild(rr);
      const sl = h('div', 'cz-row'); sl.style.marginTop = '6px';
      const inp = document.createElement('input'); inp.type = 'range'; inp.min = Lg.raise.min; inp.max = Lg.raise.max; inp.step = 25; inp.value = raiseTo; inp.style.cssText = 'flex:1 1 160px;accent-color:#d9b46a;height:34px';
      const br = btn((g.currentBet ? L('raiseTo') : L('betAmt')) + ' ' + fmt(raiseTo), '', 'raise');
      inp.addEventListener('input', () => { raiseTo = +inp.value; if (raiseTo > Lg.raise.max - 25) raiseTo = Lg.raise.max; br.textContent = (g.currentBet ? L('raiseTo') : L('betAmt')) + ' ' + fmt(raiseTo); });
      br.addEventListener('click', () => human({ type: 'raise', to: raiseTo }));
      sl.append(inp, br); ctr.appendChild(sl);
    }
  }
  function human(a) { if (!g.humanTurn() || running) return; const r = g.act(0, a); if (!r.ok) { api.err(r.err); return; } api.sfx(a.type === 'fold' ? 'tick' : 'chip'); raiseTo = 0; loop(); }
  async function loop() {
    if (running) return; running = true;
    let lastStreet = g.street, lastBoard = g.board.length;
    clearBets(); render();
    while (alive && g && g.street !== 'done' && !g.humanTurn()) {
      await sleep(650); if (!alive || !g) return;
      const st = g.stepBot(); if (!st) break;
      api.sfx(st.last === 'fold' || st.last === 'check' ? 'tick' : 'chip');
      if (g.board.length !== lastBoard) { await sleep(250); api.sfx('card'); lastBoard = g.board.length; }
      if (g.street !== lastStreet) lastStreet = g.street;
      clearBets(); render();
    }
    running = false;
    if (g && g.street === 'done') showResult();
    clearBets(); render();
  }
  function showResult() {
    const R = g.result; if (!R) return;
    const myWin = R.won[0] || 0;
    const winners = Object.keys(R.won).map(Number);
    const names = winners.map((i) => (i === 0 ? L('you') : g.seats[i].name)).join(', ');
    const hk = R.showdown && winners.length ? L('hand_' + R.hands[winners[0]]) : '';
    msg.className = 'cz-msg ' + (myWin ? 'win' : 'push');
    msg.textContent = myWin ? L('heYouWin', fmt(myWin)) + (hk ? ' · ' + hk : '') : L('heWins', names) + (hk ? ' · ' + hk : '');
    if (myWin) { api.sfx('win'); api.banner(L('win'), '+' + fmt(myWin) + (hk ? ' · ' + hk : '')); }
  }
  function nextHand() {
    if (!g || running) return;
    msg.textContent = ''; msg.className = 'cz-msg';
    const r = g.startHand();
    if (!r.ok) { if (r.err === 'rebuy') api.toast(L('heBroke')); else api.err(r.err); render(); return; }
    shownBoard = 0; api.sfx('shuffle'); render(); loop();
  }
  function leave() { if (!g) return; const v = g.leave(); api.toast(L('cashedOut', fmt(v))); api.sfx('chip'); g = null; tableEl = null; sitScreen(); }
  sitScreen();
  return {
    get g() { return g; },
    destroy() { alive = false; clearTimeout(autoNext); if (g) { const v = g.leave(); if (v) api.toast(L('cashedOut', fmt(v))); } g = null; },
    relabel() { if (g && tableEl) render(); else sitScreen(); },
    async auto() {
      if (!g) { body.querySelector('[data-act="opp5"]').click(); body.querySelector('[data-act="sit"]').click(); }
      let guard = 0;
      while (g && g.street !== 'done' && guard++ < 60) {
        await waitFor(() => !g || g.street === 'done' || (g.humanTurn() && !running), 60000);
        if (!g || g.street === 'done') break;
        const q = (s) => body.querySelector(`[data-act="${s}"]`);
        (q('check') || q('call')).click();
        await sleep(120);
      }
      await waitFor(() => !running, 60000);
      return g ? { street: g.street, board: g.board.length, won: g.result && g.result.won, hands: g.result && g.result.hands } : null;
    },
  };
}
export { evaluate, HAND_KEYS, category };

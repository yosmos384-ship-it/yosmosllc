// casino-ui-slots.js — V10 CASINO: slot overlay. Video slots (5 reels × 3 rows, 20 lines, 3 original themes, free
// spins ×2 with retriggers) and the classic 3-reel "Marquee 7s" (1 line, 1–3 coins, wild ×2).
// The reels scroll the REAL reel strips of casino-slots.js and stop on the stops chosen by the engine (crypto RNG),
// one reel after the other with a small bounce; then every winning line is drawn and cycled; scatter wins glow.
import { createSlot, THEMES, ALL_SLOT_KEYS, CLASSIC_KEY, CLASSIC, LINES, LINE_BETS, FREE_SPINS, FS_MULT, exactRtp, createClassic, classicExactRtp, classicStrips } from './casino-slots.js';
import { symbolCanvas, THEME_NAME_EN } from './casino-symbols.js';
import { btn, h, sleep } from './casino-ui.js';

const waitFor = async (f, ms = 20000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await sleep(60); } return true; };
const LINE_COL = ['#ffd84d', '#ff5a5a', '#5ad1ff', '#7dff6a', '#ff7af2', '#ffa64d', '#b18cff', '#4dffd2', '#ff4d8b', '#d6ff4d', '#4d8bff', '#ffcf9e', '#9effe9', '#ff9ee0', '#c4ff9e', '#9eb9ff', '#ffe29e', '#e29eff', '#9effa8', '#ff9e9e'];

export function mountSlots(body, api) {
  const { L, fmt, wallet } = api;
  let theme = ALL_SLOT_KEYS.includes(api.params && api.params.theme) ? api.params.theme : 'hollywood';
  if (theme === CLASSIC_KEY) return mountClassic(body, api);
  let g = createSlot({ wallet, theme });
  let busy = false, alive = true, auto = 0, showPay = false;
  const wrap = h('div'); body.appendChild(wrap);
  const tabs = h('div', 'cz-tabs');
  const cab = h('div'); cab.style.cssText = 'margin:4px 2px;padding:10px;border-radius:18px;background:linear-gradient(180deg,#2a1a0c,#0d0906);box-shadow:0 0 0 2px #d9b46a,0 14px 30px rgba(0,0,0,.6)';
  const marquee = h('div'); marquee.style.cssText = 'position:relative;margin:0 0 8px;padding:10px 8px;border-radius:12px;text-align:center;font:900 22px/1.1 Didot,"Bodoni 72",Georgia,serif;letter-spacing:.1em;overflow:hidden';
  const W = Math.max(280, Math.min(460, (body.clientWidth || 360) - 44));
  const cell = Math.floor(W / 5), CW = cell * 5, CH = cell * 3;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const cv = document.createElement('canvas'); cv.width = CW * dpr; cv.height = CH * dpr; cv.style.cssText = `display:block;margin:0 auto;width:${CW}px;height:${CH}px;border-radius:8px;box-shadow:inset 0 0 0 2px rgba(0,0,0,.6)`;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const winBar = h('div'); winBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;padding:6px 10px;border-radius:10px;background:#000;border:1px solid rgba(217,180,106,.5);font:700 14px system-ui;font-variant-numeric:tabular-nums';
  const lineInfo = h('div'); lineInfo.style.cssText = 'min-height:20px;text-align:center;font:700 13px system-ui;color:#ffe08a;margin-top:6px';
  cab.append(marquee, cv, winBar, lineInfo);
  const ctr = h('div'); const payEl = h('div'); const note = h('p', 'cz-note');
  wrap.append(tabs, cab, ctr, payEl, note);
  // reel positions (in symbols, top visible row index)
  const pos = [0, 1, 2, 3, 4].map((r) => (g.stops[r] - 1 + g.strips[r].length) % g.strips[r].length);
  let wins = null, winIdx = 0, winT = 0, raf = 0, stopped = [true, true, true, true, true], bounce = [0, 0, 0, 0, 0];
  function drawReels(now) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CW, CH);
    for (let r = 0; r < 5; r++) {
      const st = g.strips[r], n = st.length; const p = ((pos[r] % n) + n) % n; const base = Math.floor(p), frac = p - base;
      ctx.save(); ctx.beginPath(); ctx.rect(r * cell, 0, cell, CH); ctx.clip();
      const moving = !stopped[r];
      for (let k = -1; k <= 3; k++) {
        const idx = st[(base + k + n) % n]; const y = (k - frac) * cell + bounce[r];
        const img = symbolCanvas(theme, idx, 128, true);
        if (moving) { ctx.globalAlpha = 0.55; ctx.drawImage(img, r * cell + 2, y - cell * 0.18, cell - 4, cell - 4); ctx.globalAlpha = 0.6; ctx.drawImage(img, r * cell + 2, y + cell * 0.18, cell - 4, cell - 4); ctx.globalAlpha = 1; }
        else ctx.drawImage(img, r * cell + 2, y + 2, cell - 4, cell - 4);
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(r * cell + cell - 1, 0, 2, CH);
    }
    // glass shading
    const gl = ctx.createLinearGradient(0, 0, 0, CH); gl.addColorStop(0, 'rgba(0,0,0,.45)'); gl.addColorStop(0.18, 'rgba(0,0,0,0)'); gl.addColorStop(0.82, 'rgba(0,0,0,0)'); gl.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, CW, CH);
    if (wins && wins.length && stopped.every(Boolean)) {
      const w = wins[winIdx % wins.length];
      if (w.line != null) {
        const Lp = LINES[w.line]; const col = LINE_COL[w.line];
        ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.lineJoin = 'round';
        ctx.beginPath(); Lp.forEach((row, r) => { const x = r * cell + cell / 2, y = row * cell + cell / 2; r ? ctx.lineTo(x, y) : ctx.moveTo(x - cell / 2, y); }); ctx.lineTo(CW, Lp[4] * cell + cell / 2); ctx.stroke(); ctx.shadowBlur = 0;
        for (let r = 0; r < w.count; r++) { const pulse = 0.6 + 0.4 * Math.sin(now / 120); ctx.strokeStyle = col; ctx.globalAlpha = pulse; ctx.lineWidth = 3; ctx.strokeRect(r * cell + 3, Lp[r] * cell + 3, cell - 6, cell - 6); ctx.globalAlpha = 1; }
      } else {
        const win = g.window(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; for (let r = 0; r < 5; r++) for (let row = 0; row < 3; row++) if (win[r][row] === 1) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now / 100); ctx.strokeRect(r * cell + 3, row * cell + 3, cell - 6, cell - 6); ctx.globalAlpha = 1; }
      }
    }
  }
  let anim = null;
  function frame(now) {
    if (!alive) return;
    if (anim) {
      const t = (now - anim.t0) / 1000;
      for (let r = 0; r < 5; r++) {
        if (stopped[r]) continue;
        const a = anim.reels[r];
        if (t >= a.T) { pos[r] = a.target; stopped[r] = true; bounce[r] = cell * 0.12; api.sfx('reelStop', r); continue; }
        // velocity: ramp up (0–10 %), cruise, linear slow-down (70–100 %) → distance normalised to 1
        const k = t / a.T;
        const d = k < 0.1 ? 0.5 * k * k / 0.1 : k < 0.7 ? 0.05 + (k - 0.1) : 0.65 + (k - 0.7) - (k - 0.7) * (k - 0.7) / 0.6;
        pos[r] = a.start - a.D * (d / 0.8);
      }
      for (let r = 0; r < 5; r++) if (bounce[r]) { bounce[r] *= 0.82; if (bounce[r] < 0.5) bounce[r] = 0; }
      if (stopped.every(Boolean) && !bounce.some((b) => b > 0)) { const cb = anim.done; anim = null; cb(); }
    }
    if (wins && wins.length > 1 && now - winT > 1300) { winIdx++; winT = now; showLineInfo(); }
    drawReels(now);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  function spinAnim(stops) {
    return new Promise((res) => {
      const reels = stops.map((s, r) => {
        const n = g.strips[r].length; const target = (s - 1 + n) % n; const start = pos[r];
        const cur = ((start % n) + n) % n; const D = ((cur - target + n) % n) + n * (3 + r);
        return { start, target: start - D, D, T: 1.15 + r * 0.32 };
      });
      for (let r = 0; r < 5; r++) stopped[r] = false;
      anim = { t0: performance.now(), reels, done: () => { for (let r = 0; r < 5; r++) { const n = g.strips[r].length; pos[r] = ((reels[r].target % n) + n) % n; } res(); } };
    });
  }
  function themeTabs() {
    tabs.innerHTML = '';
    slotTabs(tabs, api, theme, () => busy || g.freeLeft > 0);
  }
  function styleTheme() {
    const T = THEMES[theme];
    marquee.style.background = `linear-gradient(180deg,${T.palette[0]},#000)`; marquee.style.color = T.palette[1];
    marquee.style.boxShadow = `inset 0 0 0 2px ${T.palette[1]}, 0 0 18px ${T.palette[1]}66`;
    marquee.style.textShadow = `0 0 12px ${T.palette[1]}, 0 2px 0 #000`;
    marquee.innerHTML = `<div style="position:absolute;inset:3px;border-radius:10px;background:radial-gradient(circle,#fff6 0 1.6px,transparent 2.4px) 0 0/12px 12px;opacity:.55;animation:czBulb 1s steps(2) infinite"></div><span style="position:relative">${L('slot_' + theme)}</span>`;
    if (!document.getElementById('czBulbKf')) { const s = document.createElement('style'); s.id = 'czBulbKf'; s.textContent = '@keyframes czBulb{50%{background-position:6px 0}}'; document.head.appendChild(s); }
  }
  let lineBet = 1, lastWin = 0;
  function renderWinBar() {
    const fs = g.freeLeft > 0 || (g.last && g.last.free);
    winBar.innerHTML = `<span>${L('bet')}: <b style="color:#ffe08a">${fmt(g.totalBet())}</b></span><span>${fs ? `<b style="color:#ff9ee0">${L('freeLeft', g.freeLeft, FS_MULT)}</b>` : L('lines20')}</span><span>${L('win')}: <b style="color:#7dff6a">${fmt(lastWin)}</b></span>`;
    cab.style.boxShadow = fs ? '0 0 0 2px #ff9ee0,0 0 28px rgba(255,120,220,.6),0 14px 30px rgba(0,0,0,.6)' : '0 0 0 2px #d9b46a,0 14px 30px rgba(0,0,0,.6)';
  }
  function showLineInfo() {
    if (!wins || !wins.length) { lineInfo.textContent = ''; return; }
    const w = wins[winIdx % wins.length];
    lineInfo.textContent = w.line != null ? L('lineWin', w.line + 1, w.count, L('sym_' + THEMES[theme].symbols[w.sym][0]), fmt(w.pay * g.lineBet)) : L('scatterWin', w.count, fmt(w.pay * g.totalBet()));
  }
  function renderCtr() {
    ctr.innerHTML = '';
    const r = h('div', 'cz-row');
    const lockBet = busy || g.freeLeft > 0;
    const minus = btn('−', 'alt', 'lb-'); minus.disabled = lockBet || lineBet === LINE_BETS[0]; minus.addEventListener('click', () => { lineBet = LINE_BETS[Math.max(0, LINE_BETS.indexOf(lineBet) - 1)]; g.setLineBet(lineBet); api.sfx('tick'); renderCtr(); renderWinBar(); });
    const lb = h('div', 'cz-val', `${L('lineBet')} ${fmt(lineBet)}`);
    const plus = btn('+', 'alt', 'lb+'); plus.disabled = lockBet || lineBet === LINE_BETS[LINE_BETS.length - 1]; plus.addEventListener('click', () => { lineBet = LINE_BETS[Math.min(LINE_BETS.length - 1, LINE_BETS.indexOf(lineBet) + 1)]; g.setLineBet(lineBet); api.sfx('tick'); renderCtr(); renderWinBar(); });
    r.append(minus, lb, plus); ctr.appendChild(r);
    const r2 = h('div', 'cz-row'); r2.style.marginTop = '8px';
    const pay = btn(L('paytable'), 'alt', 'paytable'); pay.addEventListener('click', () => { showPay = !showPay; renderPay(); });
    const au = btn(auto ? L('stopAuto', auto) : L('auto10'), 'alt', 'auto'); au.addEventListener('click', () => { if (auto) auto = 0; else { auto = 10; if (!busy) spin(); } renderCtr(); });
    const sp = btn(g.freeLeft > 0 ? L('freeSpin', g.freeLeft) : L('spin'), 'big', 'spin'); sp.disabled = busy; sp.style.minWidth = '120px'; sp.addEventListener('click', () => spin());
    r2.append(pay, au, sp); ctr.appendChild(r2);
  }
  function renderPay() {
    payEl.innerHTML = ''; if (!showPay) return;
    const T = THEMES[theme]; const box = h('div', 'cz-felt'); box.style.cssText += ';display:grid;grid-template-columns:repeat(2,1fr);gap:6px;padding:10px';
    T.symbols.forEach(([k, p], i) => {
      const row = h('div'); row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px;border-radius:8px;background:rgba(0,0,0,.35)';
      const c = symbolCanvas(theme, i, 128, true); const im = document.createElement('canvas'); im.width = im.height = 44; im.getContext('2d').drawImage(c, 0, 0, 44, 44); im.style.cssText = 'width:44px;height:44px;border-radius:6px;flex:0 0 auto';
      row.appendChild(im);
      row.appendChild(h('div', '', `<div style="font:700 11px system-ui;color:#ffe08a">${L('sym_' + k)}${i === 0 ? ' · ' + L('wildNote') : i === 1 ? ' · ' + L('scatterNote') : ''}</div><div style="font:700 12px system-ui;direction:ltr">5× ${p[2]} · 4× ${p[1]} · 3× ${p[0]}</div>`));
      box.appendChild(row);
    });
    payEl.appendChild(box);
    const e = exactRtp(theme);
    payEl.appendChild(h('p', 'cz-note', L('freeRule', FREE_SPINS[3], FREE_SPINS[4], FREE_SPINS[5], FS_MULT)));
    payEl.appendChild(h('p', 'cz-note', L('slotMath', (e.rtp * 100).toFixed(2))));
  }
  async function spin() {
    if (busy) return;
    const r = g.spin(); if (!r.ok) { api.err(r.err); auto = 0; renderCtr(); return; }
    busy = true; wins = null; lineInfo.textContent = ''; lastWin = 0; renderWinBar(); renderCtr(); api.sfx('reelStart');
    await spinAnim(r.stops); if (!alive) return;
    wins = r.lineWins.map((w) => Object.assign({}, w)); if (r.scatter.pay) wins.push({ line: null, count: r.scatter.count, pay: r.scatter.pay });
    winIdx = 0; winT = performance.now(); lastWin = r.paid; showLineInfo(); renderWinBar();
    const ref = g.totalBet();
    if (r.paid > 0) { api.sfx(r.paid >= ref * 10 ? 'bigwin' : 'win'); if (r.paid >= ref * 5 && !r.awarded) api.banner(r.paid >= ref * 20 ? L('bigWin') : L('win'), '+' + fmt(r.paid)); }
    if (r.awarded) { api.sfx('bigwin'); api.banner(L('freeSpinsWon', r.awarded), L('freeMult', FS_MULT), 2200); await sleep(1600); }
    if (r.featureOver) { api.banner(L('featureWin'), '+' + fmt(r.freeWon), 2200); await sleep(1200); }
    busy = false;
    renderWinBar();
    if (g.freeLeft > 0) { renderCtr(); await sleep(r.paid ? 1100 : 450); if (alive) spin(); return; }
    if (auto > 0) { auto--; renderCtr(); if (auto > 0) { await sleep(r.paid ? 1400 : 500); if (alive && auto > 0) spin(); } } else renderCtr();
  }
  const relabel = () => { note.textContent = L('slotRules'); themeTabs(); styleTheme(); renderWinBar(); showLineInfo(); renderCtr(); renderPay(); };
  relabel();
  return {
    get g() { return g; }, destroy() { alive = false; auto = 0; cancelAnimationFrame(raf); }, relabel,
    async auto() { body.querySelector('[data-act="spin"]').click(); await sleep(100); await waitFor(() => !busy && !g.freeLeft, 90000); return { theme, stops: g.last && g.last.stops, paid: g.last && g.last.paid, lines: g.last && g.last.lineWins.length }; },
  };
}

/** machine tabs (all four machine types); switching re-opens the overlay with the other machine */
function slotTabs(tabs, api, theme, locked) {
  tabs.innerHTML = '';
  for (const k of ALL_SLOT_KEYS) {
    const t = h('button', 'cz-tab' + (k === theme ? ' on' : '')); t.textContent = api.L('slot_' + k); t.dataset.act = 'theme-' + k;
    t.addEventListener('click', () => { if (locked() || k === theme) return; api.sfx('tick'); api.open('slots', { theme: k }); });
    tabs.appendChild(t);
  }
}

/* ============================================================================ classic 3-reel "Marquee 7s" */
function mountClassic(body, api) {
  const { L, fmt, wallet } = api;
  const g = createClassic({ wallet });
  let busy = false, alive = true, lastWin = 0, auto = 0;
  const wrap = h('div'); body.appendChild(wrap);
  const tabs = h('div', 'cz-tabs');
  const cab = h('div'); cab.style.cssText = 'margin:4px 2px;padding:12px;border-radius:22px;background:linear-gradient(180deg,#5a0c18,#22040a);box-shadow:0 0 0 3px #ffd76a,0 0 30px rgba(255,80,90,.35),0 14px 30px rgba(0,0,0,.6)';
  const marquee = h('div'); marquee.style.cssText = 'position:relative;margin:0 0 10px;padding:12px 8px;border-radius:14px;text-align:center;font:900 26px/1.1 Didot,"Bodoni 72",Georgia,serif;letter-spacing:.12em;color:#ffd76a;background:linear-gradient(180deg,#12060a,#000);box-shadow:inset 0 0 0 2px #ffd76a;text-shadow:0 0 14px #ff3a4a,0 2px 0 #000;overflow:hidden';
  const W = Math.max(260, Math.min(380, (body.clientWidth || 340) - 60));
  const cell = Math.floor(W / 3), CW = cell * 3, CH = Math.round(cell * 1.9);
  const dpr = Math.min(2, devicePixelRatio || 1);
  const cv = document.createElement('canvas'); cv.width = CW * dpr; cv.height = CH * dpr; cv.style.cssText = `display:block;margin:0 auto;width:${CW}px;height:${CH}px;border-radius:10px;box-shadow:inset 0 0 0 3px rgba(0,0,0,.6)`;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const winBar = h('div'); winBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;padding:6px 10px;border-radius:10px;background:#000;border:1px solid rgba(255,215,106,.6);font:700 14px system-ui;font-variant-numeric:tabular-nums';
  const info = h('div'); info.style.cssText = 'min-height:20px;text-align:center;font:700 13px system-ui;color:#ffe08a;margin-top:6px';
  cab.append(marquee, cv, winBar, info);
  const ctr = h('div'); const payEl = h('div'); const note = h('p', 'cz-note');
  wrap.append(tabs, cab, ctr, payEl, note);
  const reel = classicStrips(); // the engine's real strips
  const pos = [0, 1, 2].map((r) => g.stops[r] - 0.5);
  const stopped = [true, true, true], bounce = [0, 0, 0]; let anim = null, raf = 0, flash = 0;
  function draw(now) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, CW, CH);
    for (let r = 0; r < 3; r++) {
      const st = reel[r], n = st.length; const p = ((pos[r] % n) + n) % n; const base = Math.floor(p), frac = p - base;
      ctx.save(); ctx.beginPath(); ctx.rect(r * cell, 0, cell, CH); ctx.clip();
      for (let k = -1; k <= 2; k++) {
        const idx = st[(base + k + n) % n]; const y = (k - frac) * cell + CH / 2 - cell + bounce[r];
        const img = symbolCanvas(CLASSIC_KEY, idx, 128, true);
        if (!stopped[r]) { ctx.globalAlpha = 0.5; ctx.drawImage(img, r * cell + 4, y - cell * 0.2, cell - 8, cell - 8); ctx.drawImage(img, r * cell + 4, y + cell * 0.2, cell - 8, cell - 8); ctx.globalAlpha = 1; }
        else ctx.drawImage(img, r * cell + 4, y + 4, cell - 8, cell - 8);
      }
      ctx.restore(); ctx.fillStyle = 'rgba(60,0,10,.5)'; ctx.fillRect(r * cell + cell - 1, 0, 2, CH);
    }
    const gl = ctx.createLinearGradient(0, 0, 0, CH); gl.addColorStop(0, 'rgba(40,0,8,.7)'); gl.addColorStop(0.28, 'rgba(0,0,0,0)'); gl.addColorStop(0.72, 'rgba(0,0,0,0)'); gl.addColorStop(1, 'rgba(40,0,8,.7)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, CW, CH);
    const on = flash > now; ctx.strokeStyle = on && Math.sin(now / 90) > 0 ? '#ffd76a' : '#d0172f'; ctx.lineWidth = on ? 5 : 3;
    ctx.beginPath(); ctx.moveTo(0, CH / 2); ctx.lineTo(CW, CH / 2); ctx.stroke();
  }
  function frame(now) {
    if (!alive) return;
    if (anim) {
      const t = (now - anim.t0) / 1000;
      for (let r = 0; r < 3; r++) {
        if (stopped[r]) continue; const a = anim.reels[r];
        if (t >= a.T) { pos[r] = a.target; stopped[r] = true; bounce[r] = cell * 0.1; api.sfx('reelStop', r); continue; }
        const k = t / a.T; const d = k < 0.1 ? 0.5 * k * k / 0.1 : k < 0.7 ? 0.05 + (k - 0.1) : 0.65 + (k - 0.7) - (k - 0.7) * (k - 0.7) / 0.6;
        pos[r] = a.start - a.D * (d / 0.8);
      }
      for (let r = 0; r < 3; r++) if (bounce[r]) { bounce[r] *= 0.8; if (bounce[r] < 0.5) bounce[r] = 0; }
      if (stopped.every(Boolean) && !bounce.some((b) => b > 0)) { const cb = anim.done; anim = null; cb(); }
    }
    draw(now); raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  const spinAnim = (stops) => new Promise((res) => {
    const reels = stops.map((s2, r) => { const n = reel[r].length; const target = s2 - 0.5; const start = pos[r]; const cur = ((start % n) + n) % n; const D = ((cur - target + n) % n) + n * (2 + r); return { start, target: start - D, D, T: 1.0 + r * 0.38 }; });
    for (let r = 0; r < 3; r++) stopped[r] = false;
    anim = { t0: performance.now(), reels, done: () => { for (let r = 0; r < 3; r++) { const n = reel[r].length; pos[r] = ((reels[r].target % n) + n) % n; } res(); } };
  });
  function renderBar() { winBar.innerHTML = `<span>${L('bet')}: <b style="color:#ffe08a">${fmt(g.bet())}</b></span><span>${L('classicLine')}</span><span>${L('win')}: <b style="color:#7dff6a">${fmt(lastWin)}</b></span>`; }
  function renderCtr() {
    ctr.innerHTML = '';
    const r1 = h('div', 'cz-row');
    for (const v of CLASSIC.coinValues) { const b = btn(fmt(v), v === g.coin ? '' : 'alt', 'coin-' + v); b.disabled = busy; b.addEventListener('click', () => { g.setCoin(v); api.sfx('tick'); renderCtr(); renderBar(); }); r1.appendChild(b); }
    const r2 = h('div', 'cz-row'); r2.style.marginTop = '8px';
    const bo = btn(L('betOne', g.coins), 'alt', 'betone'); bo.disabled = busy; bo.addEventListener('click', () => { g.setCoins(g.coins % 3 + 1); api.sfx('chip'); renderCtr(); renderBar(); });
    const pay = btn(L('paytable'), 'alt', 'paytable'); pay.addEventListener('click', () => { payEl.dataset.on = payEl.dataset.on ? '' : '1'; renderPay(); });
    const au = btn(auto ? L('stopAuto', auto) : L('auto10'), 'alt', 'auto'); au.addEventListener('click', () => { if (auto) auto = 0; else { auto = 10; if (!busy) spin(); } renderCtr(); });
    const sp = btn(L('spin'), 'big', 'spin'); sp.disabled = busy; sp.addEventListener('click', () => spin());
    r2.append(bo, pay, au, sp); ctr.append(r1, r2);
  }
  function renderPay() {
    payEl.innerHTML = ''; if (!payEl.dataset.on) return;
    const P = CLASSIC.pays; const rows = [['wild', 'cl_wild'], ['seven', 'cl_seven'], ['bar3', 'cl_bar3'], ['bar2', 'cl_bar2'], ['bar1', 'cl_bar1'], ['anybar', 'cl_anybar'], ['cherry3', 'cl_cherry3'], ['cherry2', 'cl_cherry2'], ['cherry1', 'cl_cherry1']];
    const box = h('div', 'cz-felt red'); box.style.cssText += ';padding:10px';
    box.innerHTML = rows.map(([k, lk]) => `<div style="display:flex;justify-content:space-between;padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.12);font-weight:700"><span>${L(lk)}</span><span style="direction:ltr;color:#ffe08a">${[1, 2, 3].map((c) => fmt(P[k] * c)).join(' / ')}</span></div>`).join('');
    payEl.appendChild(box);
    payEl.appendChild(h('p', 'cz-note', L('classicWildRule')));
    payEl.appendChild(h('p', 'cz-note', L('slotMath', (classicExactRtp().rtp * 100).toFixed(2))));
  }
  async function spin() {
    if (busy) return;
    const r = g.spin(); if (!r.ok) { api.err(r.err); auto = 0; renderCtr(); return; }
    busy = true; lastWin = 0; info.textContent = ''; renderBar(); renderCtr(); api.sfx('reelStart');
    await spinAnim(r.stops); if (!alive) return;
    lastWin = r.paid; renderBar();
    if (r.paid > 0) { flash = performance.now() + 2200; info.textContent = L('cl_' + r.kind) + (r.wilds && r.kind !== 'wild' ? ' · ×' + 2 ** r.wilds : '') + ' → ' + fmt(r.paid); api.sfx(r.paid >= r.bet * 10 ? 'bigwin' : 'win'); if (r.paid >= r.bet * 10) api.banner(r.kind === 'wild' ? L('jackpot') : L('bigWin'), '+' + fmt(r.paid)); }
    busy = false;
    if (auto > 0) { auto--; renderCtr(); if (auto > 0) { await sleep(r.paid ? 1300 : 450); if (alive && auto > 0) spin(); } } else renderCtr();
  }
  const relabel = () => { slotTabs(tabs, api, CLASSIC_KEY, () => busy); marquee.innerHTML = `<div style="position:absolute;inset:3px;border-radius:12px;background:radial-gradient(circle,#fff8 0 1.8px,transparent 2.6px) 0 0/14px 14px;opacity:.6;animation:czBulb 1s steps(2) infinite"></div><span style="position:relative">${L('slot_classic')}</span>`; note.textContent = L('classicRules'); renderBar(); renderCtr(); renderPay(); };
  if (!document.getElementById('czBulbKf')) { const s2 = document.createElement('style'); s2.id = 'czBulbKf'; s2.textContent = '@keyframes czBulb{50%{background-position:6px 0}}'; document.head.appendChild(s2); }
  relabel();
  return {
    get g() { return g; }, destroy() { alive = false; auto = 0; cancelAnimationFrame(raf); }, relabel,
    async auto() { body.querySelector('[data-act="spin"]').click(); await sleep(100); await waitFor(() => !busy, 20000); return { theme: CLASSIC_KEY, stops: g.last && g.last.stops, paid: g.last && g.last.paid, kind: g.last && g.last.kind }; },
  };
}
export { THEME_NAME_EN };

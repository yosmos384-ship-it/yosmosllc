// casino-ui-table.js — V10 CASINO: roulette (American) and craps overlays.
// Roulette: canvas wheel (38 pockets, real American order) with a ball that orbits, drops over the deflectors and
// settles into the winning pocket; full betting layout with real edge / corner hotspots (straight, split, street /
// trio, corner, five-number, six-line, column, dozen, even-money), undo / clear / rebet, history board.
// Craps: dice tray with a physics-ish throw (bounce off the back wall, tumble, friction), point puck, number boxes
// (place / come points / odds), come & don't come, field, hardways, any seven / any craps, pass & don't pass + odds.
import { createRoulette, WHEEL, DZ, colorOf, pocketName, PAYOUT } from './casino-roulette.js';
import { createCraps, POINTS, MAX_ODDS } from './casino-craps.js';
import { chipEl, chipPicker, btn, h, sleep } from './casino-ui.js';

const waitFor = async (f, ms = 30000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await sleep(60); } return true; };
const RED = '#b3121f', BLK = '#121212', GRN = '#0c7a43';
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/* ------------------------------------------------------------------ wheel renderer */
function makeWheel(size) {
  const dpr = Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);
  const cv = document.createElement('canvas'); cv.width = cv.height = Math.round(size * dpr); cv.style.width = cv.style.height = size + 'px';
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const R = size / 2, step = (Math.PI * 2) / 38;
  // static rotor (pockets + numbers + cone) drawn once
  const rot = document.createElement('canvas'); rot.width = rot.height = Math.round(size * dpr); const rc = rot.getContext('2d'); rc.scale(dpr, dpr); rc.translate(R, R);
  const r1 = R * 0.80, r2 = R * 0.63, r3 = R * 0.52;
  for (let i = 0; i < 38; i++) {
    const n = WHEEL[i], a0 = i * step - step / 2 - Math.PI / 2, a1 = a0 + step;
    rc.beginPath(); rc.arc(0, 0, r1, a0, a1); rc.arc(0, 0, r3, a1, a0, true); rc.closePath();
    rc.fillStyle = colorOf(n) === 'red' ? RED : colorOf(n) === 'black' ? BLK : GRN; rc.fill();
    rc.strokeStyle = '#d9b46a'; rc.lineWidth = 1; rc.stroke();
    rc.save(); rc.rotate(i * step); rc.fillStyle = '#fff'; rc.font = `700 ${Math.round(R * 0.085)}px Georgia,serif`; rc.textAlign = 'center'; rc.textBaseline = 'middle';
    rc.fillText(pocketName(n), 0, -(r1 + r2) / 2 - R * 0.01); rc.restore();
  }
  // pocket separators ring
  rc.beginPath(); rc.arc(0, 0, r2, 0, Math.PI * 2); rc.strokeStyle = '#e8cd8a'; rc.lineWidth = 2; rc.stroke();
  // wooden cone + brass turret
  let gr = rc.createRadialGradient(-R * 0.1, -R * 0.15, R * 0.05, 0, 0, r3);
  gr.addColorStop(0, '#8a5a2b'); gr.addColorStop(0.7, '#5a3416'); gr.addColorStop(1, '#3a200c');
  rc.beginPath(); rc.arc(0, 0, r3, 0, Math.PI * 2); rc.fillStyle = gr; rc.fill();
  for (let k = 0; k < 4; k++) { rc.save(); rc.rotate(k * Math.PI / 2); rc.fillStyle = '#e2c27a'; rc.fillRect(-R * 0.02, -r3 * 0.95, R * 0.04, r3 * 0.95); rc.beginPath(); rc.arc(0, -r3 * 0.92, R * 0.035, 0, Math.PI * 2); rc.fill(); rc.restore(); }
  gr = rc.createRadialGradient(-R * 0.04, -R * 0.05, 1, 0, 0, R * 0.12); gr.addColorStop(0, '#fff6d6'); gr.addColorStop(1, '#a8822f');
  rc.beginPath(); rc.arc(0, 0, R * 0.11, 0, Math.PI * 2); rc.fillStyle = gr; rc.fill();
  const st = { wheel: 0, ball: -Math.PI / 2, ballR: R * 0.9, spin: null, idle: 0.25, raf: 0, alive: true, landed: null };
  function draw() {
    ctx.clearRect(0, 0, size, size);
    // bowl (stator)
    let g2 = ctx.createRadialGradient(R, R, R * 0.6, R, R, R);
    g2.addColorStop(0, '#2b1709'); g2.addColorStop(0.85, '#6b4220'); g2.addColorStop(0.93, '#d9b46a'); g2.addColorStop(1, '#3b2412');
    ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.fillStyle = g2; ctx.fill();
    ctx.beginPath(); ctx.arc(R, R, R * 0.86, 0, Math.PI * 2); ctx.fillStyle = '#1a0e06'; ctx.fill();
    // deflectors
    ctx.fillStyle = '#d9b46a';
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; ctx.save(); ctx.translate(R + Math.cos(a) * R * 0.84, R + Math.sin(a) * R * 0.84); ctx.rotate(a); ctx.fillRect(-2, -5, 4, 10); ctx.restore(); }
    ctx.save(); ctx.translate(R, R); ctx.rotate(st.wheel); ctx.drawImage(rot, -R, -R, size, size); ctx.restore();
    // ball
    const bx = R + Math.cos(st.ball) * st.ballR, by = R + Math.sin(st.ball) * st.ballR;
    const bg = ctx.createRadialGradient(bx - 2, by - 2, 0.5, bx, by, R * 0.04); bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#b9b9b9');
    ctx.beginPath(); ctx.arc(bx, by, R * 0.034, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill();
    ctx.beginPath(); ctx.arc(R, R, R * 0.995, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2; ctx.stroke();
  }
  let last = performance.now();
  function frame(now) {
    if (!st.alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (st.spin) {
      const s = st.spin; s.t += dt; const k = Math.min(1, s.t / s.T), e = easeOut(k);
      st.wheel = s.w0 + s.W * e;
      const relEnd = 0; const rel = s.R0 * (1 - Math.pow(1 - k, 2.2)) + relEnd;
      const target = st.wheel + s.idx * step - Math.PI / 2;
      let off = s.R0 - rel; // remaining relative angle (→ 0)
      if (k > 0.62 && k < 0.86) off += Math.sin(k * 90) * 0.12 * (0.86 - k) * 4; // deflector chatter
      st.ball = target + off;
      const drop = Math.min(1, Math.max(0, (k - 0.6) / 0.22));
      st.ballR = R * (0.9 - (0.9 - 0.715) * easeOut(drop)) + (drop > 0 && drop < 1 ? Math.abs(Math.sin(drop * 14)) * R * 0.03 * (1 - drop) : 0);
      if (k >= 1) { st.spin = null; st.landed = s.idx; const cb = s.done; s.done = null; cb && cb(); }
    } else {
      st.wheel += st.idle * dt;
      if (st.landed != null) st.ball = st.wheel + st.landed * step - Math.PI / 2;
    }
    draw();
    st.raf = requestAnimationFrame(frame);
  }
  st.raf = requestAnimationFrame(frame);
  return {
    el: cv,
    spinTo(idx, T = 5.2) { return new Promise((res) => { st.landed = null; st.spin = { t: 0, T, w0: st.wheel, W: 2 * Math.PI * (1.6 + Math.random() * 0.3), idx, R0: 2 * Math.PI * (5 + Math.random()), done: res }; }); },
    destroy() { st.alive = false; cancelAnimationFrame(st.raf); },
  };
}

/* ================================================================================================ ROULETTE */
export function mountRoulette(body, api) {
  const { L, fmt, wallet } = api;
  const g = createRoulette({ wallet });
  let busy = false, alive = true, undo = [], win = null;
  const wrap = h('div'); wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;justify-content:center;align-items:flex-start'; body.appendChild(wrap);
  const left = h('div'); left.style.cssText = 'flex:0 1 320px;display:flex;flex-direction:column;align-items:center;gap:6px';
  const size = Math.min(300, Math.max(220, Math.min(window.innerWidth - 60, 300)));
  const wheel = makeWheel(size);
  const wheelBox = h('div'); wheelBox.style.cssText = 'padding:8px;border-radius:50%;background:radial-gradient(circle,#2a1a0c,#0d0906 70%);box-shadow:0 0 0 2px #d9b46a,0 18px 40px rgba(0,0,0,.6)';
  wheelBox.appendChild(wheel.el);
  const hist = h('div'); hist.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;justify-content:center;direction:ltr;min-height:30px;max-width:320px';
  const msg = h('div', 'cz-msg');
  left.append(wheelBox, msg, h('div', 'cz-lbl', ''), hist);
  const right = h('div'); right.style.cssText = 'flex:1 1 330px;max-width:470px';
  const board = h('div'); board.style.cssText = 'position:relative;direction:ltr;margin:6px auto;touch-action:manipulation';
  const ctr = h('div'); const note = h('p', 'cz-note');
  right.append(board, ctr, note);
  wrap.append(left, right);
  const picker = chipPicker([5, 10, 25, 100, 500], 10);
  const anchors = new Map(); // bet id → {x,y}
  let Wd = 340;
  const cellNum = new Map();
  function layout() {
    Wd = Math.max(290, Math.min(460, (right.clientWidth || body.clientWidth || 360) - 4));
    const oc = Math.round(Wd * 0.13), dz = Math.round(Wd * 0.12), gut = 16, cw = (Wd - oc - dz - gut) / 3, zh = 46, rh = 33, ch = 38;
    const x0 = oc + dz, H = zh + 12 * rh + ch;
    board.style.width = Wd + 'px'; board.style.height = H + 'px'; board.innerHTML = ''; anchors.clear(); cellNum.clear();
    const felt = h('div'); felt.style.cssText = `position:absolute;inset:-6px;border-radius:12px;background:radial-gradient(120% 90% at 50% 30%,#1b7a5c,#0f5a43 55%,#093a2b);box-shadow:0 0 0 4px #3b2412,0 0 0 6px #d9b46a,0 14px 26px rgba(0,0,0,.5)`;
    board.appendChild(felt);
    const cell = (x, y, w, hh, html, bg, id, onTap) => {
      const c = h('div'); c.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${hh}px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.75);color:#fff;font:700 14px Georgia,serif;background:${bg || 'transparent'};cursor:pointer;box-sizing:border-box;text-align:center;line-height:1.05`;
      c.innerHTML = html; if (id) c.dataset.act = id; if (onTap) c.addEventListener('click', onTap); board.appendChild(c); return c;
    };
    const tap = (type, nums) => () => place(type, nums);
    // zero row
    const z0 = cell(x0, 0, cw * 1.5, zh, '0', GRN, 'n0', tap('straight', [0])); z0.style.borderRadius = '30px 0 0 0'; anchors.set('straight:0', { x: x0 + cw * 0.75, y: zh / 2 }); cellNum.set(0, z0);
    const z00 = cell(x0 + cw * 1.5, 0, cw * 1.5, zh, '00', GRN, 'n00', tap('straight', [DZ])); z00.style.borderRadius = '0 30px 0 0'; anchors.set('straight:37', { x: x0 + cw * 2.25, y: zh / 2 }); cellNum.set(DZ, z00);
    for (let n = 1; n <= 36; n++) {
      const r = Math.floor((n - 1) / 3), c = (n - 1) % 3;
      const x = x0 + c * cw, y = zh + r * rh;
      const e = cell(x, y, cw, rh, `<span style="display:inline-block;min-width:26px;padding:2px 3px;border-radius:50%;background:${colorOf(n) === 'red' ? RED : BLK}">${n}</span>`, '', 'n' + n, tap('straight', [n]));
      cellNum.set(n, e); anchors.set('straight:' + n, { x: x + cw / 2, y: y + rh / 2 });
    }
    // column bets
    for (let c = 0; c < 3; c++) { cell(x0 + c * cw, zh + 12 * rh, cw, ch, '2:1', '', 'col' + c, tap('column', [c])); anchors.set('column:' + c, { x: x0 + c * cw + cw / 2, y: zh + 12 * rh + ch / 2 }); }
    // dozens (vertical)
    for (let d = 0; d < 3; d++) { const e = cell(oc, zh + d * 4 * rh, dz, 4 * rh, `<span style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:13px">${L('dozen' + d)}</span>`, '', 'dz' + d, tap('dozen', [d])); void e; anchors.set('dozen:' + d, { x: oc + dz / 2, y: zh + d * 4 * rh + 2 * rh }); }
    // even money
    const EM = [['low', '1–18'], ['even', L('even')], ['red', `<span style="display:inline-block;width:22px;height:22px;background:${RED};transform:rotate(45deg)"></span>`], ['black', `<span style="display:inline-block;width:22px;height:22px;background:${BLK};transform:rotate(45deg);border:1px solid #fff"></span>`], ['odd', L('odd')], ['high', '19–36']];
    EM.forEach(([t, lab], k) => { cell(0, zh + k * 2 * rh, oc, 2 * rh, `<span style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:12px">${lab}</span>`, '', 'em-' + t, tap(t, null)); anchors.set(t, { x: oc / 2, y: zh + k * 2 * rh + rh }); });
    // inside-edge hotspots
    const spot = (cx, cy, w, hh, type, nums, idk) => {
      const s = h('div'); s.style.cssText = `position:absolute;left:${cx - w / 2}px;top:${cy - hh / 2}px;width:${w}px;height:${hh}px;cursor:pointer;z-index:2;border-radius:6px`;
      s.dataset.act = idk; s.addEventListener('click', (e) => { e.stopPropagation(); place(type, nums); });
      s.addEventListener('pointerenter', () => { s.style.background = 'rgba(255,224,138,.35)'; }); s.addEventListener('pointerleave', () => { s.style.background = ''; });
      board.appendChild(s);
      const b = makeKey(type, nums); if (b) anchors.set(b, { x: cx, y: cy });
    };
    for (let n = 1; n <= 36; n++) {
      const r = Math.floor((n - 1) / 3), c = (n - 1) % 3, x = x0 + c * cw, y = zh + r * rh;
      if (c < 2) spot(x + cw, y + rh / 2, 16, rh - 12, 'split', [n, n + 1], `sp${n}-${n + 1}`);
      if (r < 11) spot(x + cw / 2, y + rh, cw - 22, 14, 'split', [n, n + 3], `sp${n}-${n + 3}`);
      if (c < 2 && r < 11) spot(x + cw, y + rh, 18, 18, 'corner', [n, n + 1, n + 3, n + 4], `co${n}`);
      if (c === 0) { spot(x0 + 3 * cw + gut / 2, y + rh / 2, gut, rh - 10, 'street', [n, n + 1, n + 2], `st${n}`); if (r < 11) spot(x0 + 3 * cw + gut / 2, y + rh, gut, 16, 'sixline', [n, n + 1, n + 2, n + 3, n + 4, n + 5], `sl${n}`); }
    }
    spot(x0 + cw * 1.5, zh / 2, 16, zh - 16, 'split', [0, DZ], 'sp0-00');
    spot(x0 + cw / 2, zh, cw - 22, 14, 'split', [0, 1], 'sp0-1');
    spot(x0 + cw * 2.5, zh, cw - 22, 14, 'split', [DZ, 3], 'sp00-3');
    spot(x0 + cw * 1.25, zh, cw * 0.4, 14, 'split', [0, 2], 'sp0-2');
    spot(x0 + cw * 1.75, zh, cw * 0.4, 14, 'split', [DZ, 2], 'sp00-2');
    spot(x0 + cw, zh, 16, 16, 'street', [0, 1, 2], 'tr0-1-2');
    spot(x0 + cw * 2, zh, 16, 16, 'street', [DZ, 2, 3], 'tr00-2-3');
    spot(x0 + cw * 1.5, zh + 1, 14, 14, 'street', [0, DZ, 2], 'tr0-00-2');
    spot(x0, zh, 18, 18, 'five', [0, DZ, 1, 2, 3], 'five');
    drawChips();
  }
  const keyOf = (nums) => nums.slice().sort((a, b) => a - b).join('-');
  function makeKey(type, nums) { if (type === 'dozen' || type === 'column') return type + ':' + nums[0]; if (!nums) return type; return type + ':' + keyOf(nums); }
  function drawChips() {
    board.querySelectorAll('.rl-chip').forEach((e) => e.remove());
    for (const b of g.bets.values()) {
      const a = anchors.get(b.id) || anchors.get(b.type); if (!a) continue;
      const c = chipEl(Math.min(1000, b.amount), { sm: true, st: true }); c.classList.add('rl-chip');
      c.style.position = 'absolute'; c.style.left = (a.x - 14) + 'px'; c.style.top = (a.y - 14) + 'px'; c.style.zIndex = 3; c.querySelector('span').textContent = b.amount >= 1000 ? (b.amount / 1000) + 'K' : b.amount;
      board.appendChild(c);
    }
    if (win != null) { for (const [n, e] of cellNum) e.style.boxShadow = n === win ? 'inset 0 0 0 3px #ffe08a, 0 0 18px #ffd166' : ''; }
  }
  function place(type, nums) {
    if (busy) return;
    if (win != null) { win = null; for (const e of cellNum.values()) e.style.boxShadow = ''; }
    const v = picker.value; const r = g.place(type, nums, v);
    if (!r.ok) { api.err(r.err); return; }
    undo.push({ id: r.bet.id, type, nums, v }); api.sfx('chip'); drawChips(); renderCtr();
  }
  function renderHist() { hist.innerHTML = ''; for (const n of g.history.slice(0, 14)) { const d = h('div'); const c = colorOf(n); d.style.cssText = `min-width:26px;height:26px;padding:0 4px;border-radius:13px;background:${c === 'red' ? RED : c === 'black' ? BLK : GRN};color:#fff;font:700 12px/26px Georgia,serif;text-align:center;border:1px solid rgba(255,255,255,.4)`; d.textContent = pocketName(n); hist.appendChild(d); } }
  function renderCtr() {
    ctr.innerHTML = ''; ctr.appendChild(picker.el);
    const r = h('div', 'cz-row');
    const bu = btn(L('undo'), 'alt', 'undo'); bu.disabled = busy || !undo.length; bu.addEventListener('click', () => {
      const u = undo.pop(); if (!u) return; const b = g.bets.get(u.id); if (!b) return renderCtr(); const left = b.amount - u.v; g.remove(u.id); if (left > 0) g.place(u.type, u.type === 'dozen' || u.type === 'column' ? [b.arg] : b.nums, left); drawChips(); renderCtr(); });
    const bc = btn(L('clear'), 'alt', 'clear'); bc.disabled = busy || !g.bets.size; bc.addEventListener('click', () => { g.clear(); undo = []; drawChips(); renderCtr(); });
    const br = btn(L('rebet'), 'alt', 'rebet'); br.disabled = busy || !g.lastBets.length || g.bets.size > 0; br.addEventListener('click', () => { if (!g.rebet()) api.err('funds'); drawChips(); renderCtr(); });
    const bs = btn(L('spin'), 'big', 'spin'); bs.disabled = busy || !g.bets.size; bs.addEventListener('click', spin);
    r.append(bu, bc, br, bs); ctr.appendChild(r);
    ctr.appendChild(h('div', 'cz-stake', `${L('totalBet')}: ${fmt(g.total())}`));
  }
  async function spin() {
    if (busy) return; const r = g.spin(); if (!r.ok) { api.err(r.err); return; }
    busy = true; undo = []; msg.textContent = L('noMoreBets'); msg.className = 'cz-msg'; renderCtr(); api.sfx('spin');
    const restore = [...(g.lastBets || [])];
    try { api.fx && api.fx('roulette:spin', { n: r.n, wheelIndex: r.wheelIndex }); } catch (_) {}
    await wheel.spinTo(r.wheelIndex); if (!alive) return;
    win = r.n; api.sfx('ball');
    msg.className = 'cz-msg ' + (r.net > 0 ? 'win' : r.paid ? 'push' : 'lose');
    msg.textContent = `${pocketName(r.n)} ${L('c_' + colorOf(r.n))} · ` + (r.paid ? L('youWin', fmt(r.paid)) : L('youLose', fmt(r.staked)));
    if (r.net > 0) { api.banner(pocketName(r.n), '+' + fmt(r.paid)); api.sfx('win'); }
    void restore;
    busy = false; renderHist(); drawChips(); renderCtr();
  }
  const relabel = () => { note.textContent = L('rlRules'); layout(); renderHist(); renderCtr(); };
  relabel();
  const onRs = () => layout(); window.addEventListener('resize', onRs);
  requestAnimationFrame(() => { if (alive) layout(); });
  return {
    g, destroy() { alive = false; wheel.destroy(); window.removeEventListener('resize', onRs); }, relabel,
    async auto() {
      const q = (s) => body.querySelector(`[data-act="${s}"]`);
      picker.set(10); q('n17').click(); q('sp17-20').click(); q('co16').click(); q('st13').click(); q('em-red').click(); q('dz1').click(); q('col2').click(); q('five').click(); q('sl1').click(); q('tr0-1-2').click();
      const nb = g.bets.size; q('spin').click(); await sleep(100); await waitFor(() => !busy, 60000);
      return { bets: nb, n: g.last, result: g.lastResult && { paid: g.lastResult.paid, staked: g.lastResult.staked, wins: g.lastResult.wins.map((w) => w.type) } };
    },
  };
}

/* ================================================================================================ CRAPS */
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
function makeTray(w, hgt) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const cv = document.createElement('canvas'); cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.width = w + 'px'; cv.style.height = hgt + 'px'; cv.style.borderRadius = '14px'; cv.style.display = 'block';
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const S = Math.min(44, hgt * 0.32);
  const dice = [{ x: w * 0.4, y: hgt * 0.55, a: 0.2, f: 5, z: 0 }, { x: w * 0.58, y: hgt * 0.5, a: -0.4, f: 2, z: 0 }];
  let anim = null, raf = 0, alive = true;
  function bg() {
    const g = ctx.createLinearGradient(0, 0, 0, hgt); g.addColorStop(0, '#0c4a37'); g.addColorStop(1, '#0f5a43'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, hgt);
    // back wall with rubber diamonds (left)
    ctx.fillStyle = '#2a1508'; ctx.fillRect(0, 0, 14, hgt);
    ctx.fillStyle = '#5b3517'; for (let y = 4; y < hgt; y += 12) { ctx.beginPath(); ctx.moveTo(7, y); ctx.lineTo(13, y + 6); ctx.lineTo(7, y + 12); ctx.lineTo(1, y + 6); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = '#d9b46a'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, w - 3, hgt - 3);
    ctx.fillStyle = 'rgba(255,236,190,.18)'; ctx.font = '700 22px Didot,Georgia,serif'; ctx.textAlign = 'center'; ctx.fillText('EAKIN GRAND', w / 2 + 6, hgt / 2 + 8);
  }
  function die(d) {
    const s = S * (1 + d.z * 0.012);
    ctx.save(); ctx.translate(d.x, d.y - d.z * 0.6);
    // shadow
    ctx.save(); ctx.translate(d.z * 0.5, d.z * 0.9 + 4); ctx.rotate(d.a); ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(-s / 2, -s / 2, s, s, s * 0.18); ctx.fill(); ctx.restore();
    ctx.rotate(d.a);
    const g = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2); g.addColorStop(0, '#ff3b4c'); g.addColorStop(1, '#a30f1d');
    ctx.fillStyle = g; rr(-s / 2, -s / 2, s, s, s * 0.18); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff';
    for (const [px, py] of PIPS[d.f]) { ctx.beginPath(); ctx.arc(px * s * 0.26, py * s * 0.26, s * 0.085, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function rr(x, y, ww, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + ww, y, x + ww, y + hh, r); ctx.arcTo(x + ww, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + ww, y, r); ctx.closePath(); }
  function draw() { bg(); for (const d of dice) die(d); }
  let last = performance.now();
  function frame(now) {
    if (!alive) return;
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (anim) {
      anim.t += dt; let moving = false;
      for (const d of dice) {
        d.vz -= 900 * dt; d.z += d.vz * dt; if (d.z < 0) { d.z = 0; d.vz = -d.vz * 0.45; if (Math.abs(d.vz) < 40) d.vz = 0; d.vx *= 0.8; d.vy *= 0.8; d.va *= 0.7; if (d.vz) d.f = 1 + ((Math.random() * 6) | 0); }
        d.x += d.vx * dt; d.y += d.vy * dt; d.a += d.va * dt;
        const m = S * 0.6;
        if (d.x < 14 + m) { d.x = 14 + m; d.vx = Math.abs(d.vx) * 0.6; d.va += 6; d.f = 1 + ((Math.random() * 6) | 0); }
        if (d.x > w - m) { d.x = w - m; d.vx = -Math.abs(d.vx) * 0.5; }
        if (d.y < m) { d.y = m; d.vy = Math.abs(d.vy) * 0.6; } if (d.y > hgt - m) { d.y = hgt - m; d.vy = -Math.abs(d.vy) * 0.6; }
        const fr = d.z > 0 ? 0.995 : 0.94; d.vx *= fr; d.vy *= fr; d.va *= d.z > 0 ? 0.99 : 0.9;
        if (Math.hypot(d.vx, d.vy) > 25 || d.z > 0) moving = true;
        if (d.z > 0 && Math.random() < 0.25) d.f = 1 + ((Math.random() * 6) | 0);
      }
      // keep the dice apart
      const [a, b] = dice; const dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy) || 1;
      if (dd < S * 1.1) { const p = (S * 1.1 - dd) / 2; a.x -= dx / dd * p; a.y -= dy / dd * p; b.x += dx / dd * p; b.y += dy / dd * p; }
      if (!moving || anim.t > 2.4) { dice[0].f = anim.r[0]; dice[1].f = anim.r[1]; const cb = anim.done; anim = null; cb(); }
    }
    draw(); raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return {
    el: cv,
    throwTo(r) { return new Promise((res) => { for (const [i, d] of dice.entries()) { d.x = w - 30; d.y = hgt * (0.3 + 0.4 * i); d.z = 30 + i * 8; d.vz = 260; d.vx = -(w * 1.5 + Math.random() * w * 0.5); d.vy = (Math.random() - 0.5) * 160; d.va = 14 * (Math.random() < 0.5 ? -1 : 1); } anim = { t: 0, r, done: res }; }); },
    destroy() { alive = false; cancelAnimationFrame(raf); },
  };
}

export function mountCraps(body, api) {
  const { L, fmt, wallet } = api;
  const g = createCraps({ wallet });
  let busy = false, alive = true, oddsMode = false;
  const wrap = h('div'); wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;justify-content:center;align-items:flex-start'; body.appendChild(wrap);
  const left = h('div'); left.style.cssText = 'flex:1 1 320px;max-width:470px';
  const right = h('div'); right.style.cssText = 'flex:1 1 320px;max-width:470px';
  const tw = Math.max(280, Math.min(460, (body.clientWidth || 360) - 24));
  const tray = makeTray(Math.min(tw, 460), 150);
  const status = h('div', 'cz-row'); status.style.margin = '6px 0';
  const msg = h('div', 'cz-msg');
  const hist = h('div'); hist.style.cssText = 'display:flex;gap:4px;justify-content:center;flex-wrap:wrap;direction:ltr;min-height:24px';
  left.append(tray.el, status, msg, hist);
  const layoutEl = h('div', 'cz-felt'); layoutEl.style.padding = '8px'; layoutEl.style.direction = 'ltr';
  const ctr = h('div'); const note = h('p', 'cz-note');
  right.append(layoutEl, ctr, note);
  wrap.append(left, right);
  const picker = chipPicker([5, 10, 25, 100, 500], 10);
  const zone = (label, sub, kind, n, opts = {}) => {
    const z = h('button'); z.dataset.act = kind + (n != null ? n : '');
    z.style.cssText = `position:relative;min-height:${opts.h || 48}px;border-radius:10px;border:1.5px solid rgba(255,255,255,.8);background:${opts.bg || 'rgba(0,0,0,.12)'};color:#fff;cursor:pointer;padding:4px;font:700 ${opts.fs || 14}px/1.1 system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;${opts.css || ''}`;
    z.innerHTML = `<span>${label}</span>${sub ? `<span style="font-size:10px;font-weight:600;opacity:.85">${sub}</span>` : ''}`;
    const amt = g.amount(kind, n);
    if (amt) { const st = h('div', 'cz-stake'); st.style.margin = '0'; st.appendChild(chipEl(Math.min(1000, amt), { sm: true, st: true })); st.appendChild(h('span', '', fmt(amt))); z.appendChild(st); }
    z.addEventListener('click', () => bet(kind, n));
    return z;
  };
  function bet(kind, n) {
    if (busy) return;
    if (oddsMode && kind === 'place') { const c = g.comes.find((x) => x.point === n); if (c) kind = c.kind === 'come' ? 'comeOdds' : 'dcOdds'; }
    const r = g.bet(kind, n, picker.value);
    if (!r.ok) { api.err(r.err); return; }
    api.sfx('chip'); render();
  }
  function render() {
    layoutEl.innerHTML = '';
    const grid = (cols, gap = 6) => { const d = h('div'); d.style.cssText = `display:grid;grid-template-columns:${cols};gap:${gap}px;margin-bottom:6px`; return d; };
    // number boxes
    const nb = grid('repeat(6,1fr)', 4);
    for (const p of POINTS) {
      const z = zone(p === 6 ? L('six') : p === 9 ? L('nine') : String(p), L('placePays_' + p), 'place', p, { h: 78, fs: 18 });
      if (g.point === p) { const puck = h('div'); puck.style.cssText = 'position:absolute;top:-8px;right:-6px;width:28px;height:28px;border-radius:50%;background:#fff;color:#111;font:800 9px/28px system-ui;box-shadow:0 2px 6px rgba(0,0,0,.6)'; puck.textContent = 'ON'; z.appendChild(puck); }
      for (const c of g.comes.filter((x) => x.point === p)) { const t = h('div'); t.style.cssText = `font:800 10px system-ui;padding:1px 4px;border-radius:6px;background:${c.kind === 'come' ? '#ffe08a' : '#222'};color:${c.kind === 'come' ? '#222' : '#fff'}`; t.textContent = (c.kind === 'come' ? 'C ' : 'DC ') + fmt(c.amt) + (c.odds ? ' +' + fmt(c.odds) : ''); z.appendChild(t); }
      nb.appendChild(z);
    }
    layoutEl.appendChild(nb);
    const r1 = grid('1fr 3fr');
    r1.append(zone(L('dontCome'), L('bar12'), 'dontcome', null, { bg: 'rgba(0,0,0,.25)' }), zone(L('come'), '', 'come', null, { fs: 20, css: 'letter-spacing:.2em' }));
    layoutEl.appendChild(r1);
    layoutEl.appendChild(zone(L('field'), L('fieldSub'), 'field', null, { css: 'width:100%;margin-bottom:6px', bg: 'rgba(0,0,0,.18)' }));
    const props = grid('repeat(3,1fr)', 4);
    for (const k of [4, 6, 8, 10]) props.appendChild(zone(L('hard', k), k === 4 || k === 10 ? '7:1' : '9:1', 'hard', k, { bg: 'rgba(120,10,20,.35)', fs: 13 }));
    props.appendChild(zone(L('any7'), '4:1', 'any7', null, { bg: 'rgba(120,10,20,.35)', fs: 13 }));
    props.appendChild(zone(L('anyCraps'), '7:1', 'anycraps', null, { bg: 'rgba(120,10,20,.35)', fs: 13 }));
    layoutEl.appendChild(props);
    layoutEl.appendChild(zone(L('yo'), '15:1', 'yo', null, { bg: 'rgba(120,10,20,.35)', fs: 13, h: 40, css: 'width:100%;margin-bottom:6px' }));
    const r2 = grid('1fr 1fr');
    r2.append(zone(L('dontPass'), L('bar12'), 'dontpass', null, { bg: 'rgba(0,0,0,.25)' }), zone(L('dpOdds'), L('layOdds'), 'dpOdds', null, { bg: 'rgba(0,0,0,.25)', fs: 12 }));
    layoutEl.appendChild(r2);
    const r3 = grid('3fr 1fr');
    r3.append(zone(L('passLine'), '', 'pass', null, { fs: 20, css: 'letter-spacing:.18em', h: 56 }), zone(L('passOdds'), L('trueOdds'), 'passOdds', null, { fs: 12, h: 56 }));
    layoutEl.appendChild(r3);
    status.innerHTML = `<span class="cz-val">${g.point ? L('pointIs', g.point) : L('comeOut')}</span><span class="cz-val">${L('onTable')}: ${fmt(g.onTable())}</span>`;
    hist.innerHTML = ''; for (const s of g.history.slice(0, 16)) { const d = h('div'); d.style.cssText = `min-width:24px;height:24px;border-radius:6px;background:${s === 7 ? '#b3121f' : '#1b1b1f'};color:#fff;font:700 12px/24px system-ui;text-align:center;border:1px solid rgba(255,255,255,.35)`; d.textContent = s; hist.appendChild(d); }
    renderCtr();
  }
  function renderCtr() {
    ctr.innerHTML = ''; ctr.appendChild(picker.el);
    const r = h('div', 'cz-row');
    const bo = btn(L('comeOddsMode') + (oddsMode ? ' ✓' : ''), oddsMode ? '' : 'alt', 'oddsmode'); bo.disabled = !g.comes.length; bo.addEventListener('click', () => { oddsMode = !oddsMode; renderCtr(); });
    const bc = btn(L('takeDown'), 'alt', 'clear'); bc.disabled = busy; bc.addEventListener('click', () => {
      let t = 0; for (const k of ['field', 'any7', 'anycraps', 'yo', 'come', 'dontcome']) if (g.amount(k)) t += g.takeDown(k).amount || 0;
      for (const p of POINTS) if (g.place[p]) t += g.takeDown('place', p).amount || 0; for (const k of [4, 6, 8, 10]) if (g.hard[k]) t += g.takeDown('hard', k).amount || 0;
      if (g.point == null) { if (g.line.pass) t += g.takeDown('pass').amount || 0; if (g.line.dontpass) t += g.takeDown('dontpass').amount || 0; }
      if (t) api.toast(L('returned', fmt(t))); render(); });
    const bR = btn(L('roll'), 'big', 'roll'); bR.disabled = busy || !(g.onTable() > 0); bR.addEventListener('click', roll);
    r.append(bo, bc, bR); ctr.appendChild(r);
  }
  async function roll() {
    if (busy) return; const r = g.roll(); if (!r.ok) { api.err(r.err); return; }
    busy = true; renderCtr(); api.sfx('dice');
    try { api.fx && api.fx('craps:roll', { dice: r.dice }); } catch (_) {}
    await tray.throwTo(r.dice); if (!alive) return;
    api.sfx('diceStop');
    const won = r.events.filter((e) => e.won > 0 || e.result === 'win').reduce((t, e) => t + (e.won || 0), 0);
    const lost = r.events.filter((e) => e.result === 'lose').reduce((t, e) => t + (e.lost || 0), 0);
    const call = r.sum === 7 && !r.comeOut ? L('sevenOut') : r.events.some((e) => e.result === 'point') ? L('pointSet', r.sum) : r.events.some((e) => e.bet === 'point' && e.result === 'off') ? L('pointMade', r.sum) : (r.hard && [4, 6, 8, 10].includes(r.sum) ? L('hardWay', r.sum) : String(r.sum));
    msg.className = 'cz-msg ' + (won > lost ? 'win' : lost > won ? 'lose' : 'push');
    msg.textContent = `${r.dice[0]} + ${r.dice[1]} = ${r.sum} · ${call}` + (won ? ' · ' + L('youWin', fmt(won)) : '') + (lost ? ' · ' + L('lost', fmt(lost)) : '');
    if (won > 0) { api.sfx('win'); if (won >= 50) api.banner(String(r.sum), '+' + fmt(won)); }
    oddsMode = oddsMode && g.comes.length > 0;
    busy = false; render();
  }
  const relabel = () => { note.textContent = L('crRules'); render(); };
  relabel();
  return {
    g, destroy() { alive = false; tray.destroy(); }, relabel,
    async auto() {
      const q = (s) => body.querySelector(`[data-act="${s}"]`);
      picker.set(10); q('pass').click(); q('field').click(); q('anycraps').click();
      const rolls = [];
      for (let i = 0; i < 3; i++) { if (!(g.onTable() > 0)) q('pass').click(); q('roll').click(); await sleep(80); await waitFor(() => !busy, 30000); rolls.push(g.lastRoll.sum); if (g.point && !g.place[g.point === 6 ? 8 : 6]) { q('place' + (g.point === 6 ? 8 : 6)).click(); q('passOdds').click(); } }
      return { rolls, point: g.point, onTable: g.onTable() };
    },
  };
}
export { PAYOUT, MAX_ODDS };

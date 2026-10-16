// core-ui.js — minimap renderer + DOM UI helpers: zoom (pinch / wheel FOV), arrow D-pad, radio chip + panel, style
// picker, collapsible phone tools, iOS / audio-unlock guards. Owner: CORE (UI). No side effects on import.

import { tr } from './i18n.js'; // V7: canvas text (minimap room names) is translated at draw time

export const FLOOR_HE = { upper: 'קומה עליונה', main: 'קומת כניסה', basement: 'מרתף', outside: 'חוץ', roof: 'גג' };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const now = () => performance.now();

/* ============================================================================================ minimap */
// The card is half its V2 size (desktop 100×80, phone 66×52 CSS px). Compact drawing: only the current room is
// labelled. Tap / click the card to expand it to the old size for a few seconds.
export function createMinimap(canvas, plan) {
  const g = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, last = null, bigT = 0;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    W = Math.max(40, Math.round(r.width)); H = Math.max(32, Math.round(r.height));
    canvas.width = W * dpr; canvas.height = H * dpr;
  }
  resize();
  const card = canvas.closest ? canvas.closest('#mapCard') : null;
  function setBig(on) {
    if (!card) return;
    card.classList.toggle('big', !!on);
    resize(); if (last) draw(last);
    clearTimeout(bigT);
    if (on) bigT = setTimeout(() => setBig(false), 6000);
  }
  if (card) {
    card.setAttribute('role', 'button'); card.setAttribute('title', 'הקש להגדלת המפה');
    card.addEventListener('click', (e) => { e.stopPropagation(); setBig(!card.classList.contains('big')); });
  }
  const ROOM_FILL = { main: 'rgba(120,200,255,0.10)', upper: 'rgba(170,150,255,0.12)', basement: 'rgba(200,190,170,0.10)' };

  // V10 worlds: a world may bring its own simple map {rooms:[{he, r:[x0,z0,x1,z1]}], bounds?:[x0,z0,x1,z1]}
  let worldSpec = null;
  function drawWorld(args) {
    const { x, z, yaw, roomName } = args, sp = worldSpec, rooms = Array.isArray(sp.rooms) ? sp.rooms.filter((r) => r && r.r) : [];
    const compact = W < 120, pad = compact ? 5 : 8;
    let b = Array.isArray(sp.bounds) ? sp.bounds : null;
    if (!b) { b = [Infinity, Infinity, -Infinity, -Infinity]; for (const r of rooms) { b[0] = Math.min(b[0], r.r[0]); b[1] = Math.min(b[1], r.r[1]); b[2] = Math.max(b[2], r.r[2]); b[3] = Math.max(b[3], r.r[3]); } }
    if (!isFinite(b[0])) b = [x - 5, z - 5, x + 5, z + 5];
    const bw = Math.max(0.5, b[2] - b[0]), bd = Math.max(0.5, b[3] - b[1]);
    const s = Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bd), cx = (b[0] + b[2]) / 2, cz = (b[1] + b[3]) / 2;
    const X = (wx) => (wx - cx) * s + W / 2, Y = (wz) => (wz - cz) * s + H / 2;
    g.lineWidth = 1;
    for (const r of rooms) {
      const [x0, z0, x1, z1] = r.r, cur = r.he === roomName;
      g.fillStyle = cur ? 'rgba(80,230,255,0.30)' : 'rgba(255,214,140,0.12)';
      g.strokeStyle = cur ? 'rgba(120,240,255,0.95)' : 'rgba(255,255,255,0.5)';
      g.fillRect(X(x0), Y(z0), (x1 - x0) * s, (z1 - z0) * s);
      g.strokeRect(X(x0) + 0.5, Y(z0) + 0.5, (x1 - x0) * s - 1, (z1 - z0) * s - 1);
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = compact ? 7.5 : 9;
    g.font = `600 ${fs}px system-ui, -apple-system, "Segoe UI", Arial, sans-serif`;
    for (const r of rooms) {
      const cur = r.he === roomName; if (compact && !cur) continue;
      const w = (r.r[2] - r.r[0]) * s, txt = tr(r.he || ''); if (!txt || g.measureText(txt).width > w + 8) continue;
      g.fillStyle = '#fff'; g.fillText(txt, X((r.r[0] + r.r[2]) / 2), Y((r.r[1] + r.r[3]) / 2));
    }
    const px = X(x), pz = Y(z), ang = Math.atan2(-Math.cos(yaw), -Math.sin(yaw)), R = compact ? Math.min(20, W * 0.3) : 34;
    const grd = g.createRadialGradient(px, pz, 2, px, pz, R); grd.addColorStop(0, 'rgba(80,230,255,0.6)'); grd.addColorStop(1, 'rgba(80,230,255,0)');
    g.fillStyle = grd; g.beginPath(); g.moveTo(px, pz); g.arc(px, pz, R, ang - 0.55, ang + 0.55); g.closePath(); g.fill();
    g.fillStyle = '#4fe6ff'; g.strokeStyle = '#fff'; g.lineWidth = compact ? 1.5 : 2;
    g.beginPath(); g.arc(clamp(px, 4, W - 4), clamp(pz, 4, H - 4), compact ? 3.2 : 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  function setWorld(spec) { worldSpec = spec && Array.isArray(spec.rooms) ? spec : null; if (last) draw(last); }
  function draw(args) {
    last = args;
    const { x, z, yaw, floor, roomName } = args;
    if (!W) resize();
    if (worldSpec) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); drawWorld(args); return; }
    const compact = W < 120;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const inside = floor !== 'outside';
    const pad = compact ? 5 : 8;
    let cx, cz, s;
    if (inside) { cx = plan.W / 2; cz = plan.D / 2; s = Math.min((W - 2 * pad) / plan.W, (H - 2 * pad) / plan.D); }
    else { cx = x; cz = z; s = compact ? 2.4 : 4.2; }
    const X = (wx) => (wx - cx) * s + W / 2, Y = (wz) => (wz - cz) * s + H / 2;

    if (!inside) {
      const L = plan.lot, st = plan.street, dw = plan.driveway;
      if (L) { g.fillStyle = 'rgba(90,150,90,0.18)'; g.fillRect(X(L.x0), Y(L.z0), (L.x1 - L.x0) * s, (L.z1 - L.z0) * s); }
      if (st) { g.fillStyle = 'rgba(160,160,170,0.30)'; g.fillRect(0, Y(st.zCenter - st.width / 2), W, st.width * s); }
      if (dw) { g.fillStyle = 'rgba(190,170,140,0.28)'; g.fillRect(X(dw.x0), Y(dw.z0), (dw.x1 - dw.x0) * s, (dw.z1 - dw.z0) * s); }
      if (plan.porch) { const p = plan.porch; g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(X(p.x0), Y(p.z0), (p.x1 - p.x0) * s, (p.z1 - p.z0) * s); }
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = compact ? 1 : 1.5;
      g.fillRect(X(0), Y(0), plan.W * s, plan.D * s); g.strokeRect(X(0), Y(0), plan.W * s, plan.D * s);
      if (plan.bigTree) { g.fillStyle = 'rgba(80,160,80,0.45)'; g.beginPath(); g.arc(X(plan.bigTree.x), Y(plan.bigTree.z), 5 * s * 0.6, 0, Math.PI * 2); g.fill(); }
    } else {
      const rooms = (plan.rooms && plan.rooms[floor]) || {};
      g.lineWidth = 1;
      const list = Object.entries(rooms).sort((a, b) => (b[1].r[2] - b[1].r[0]) * (b[1].r[3] - b[1].r[1]) - (a[1].r[2] - a[1].r[0]) * (a[1].r[3] - a[1].r[1]));
      for (const [, rm] of list) {
        const [x0, z0, x1, z1] = rm.r;
        const cur = rm.he === roomName;
        g.fillStyle = cur ? 'rgba(80,230,255,0.30)' : (ROOM_FILL[floor] || 'rgba(255,255,255,0.08)');
        g.strokeStyle = cur ? 'rgba(120,240,255,0.95)' : 'rgba(255,255,255,0.5)';
        g.fillRect(X(x0), Y(z0), (x1 - x0) * s, (z1 - z0) * s);
        g.strokeRect(X(x0) + 0.5, Y(z0) + 0.5, (x1 - x0) * s - 1, (z1 - z0) * s - 1);
      }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const fs = compact ? 7.5 : Math.max(8, Math.min(11, s * 0.55));
      g.font = `600 ${fs}px system-ui, -apple-system, "Segoe UI", Arial, sans-serif`;
      for (const [, rm] of list) {
        const [x0, z0, x1, z1] = rm.r;
        const w = (x1 - x0) * s;
        const cur = rm.he === roomName;
        if (compact && !cur) continue; // phone / small card: only the current room is labelled
        if (w < (compact ? 14 : 22)) continue;
        let txt = tr(rm.he);
        if (compact && g.measureText(txt).width > w + 8) continue;
        g.fillStyle = cur ? '#ffffff' : 'rgba(255,255,255,0.9)';
        g.fillText(txt, X((x0 + x1) / 2), Y((z0 + z1) / 2) + (compact ? fs : 0));
      }
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = compact ? 1.4 : 2;
      g.strokeRect(X(0), Y(0), plan.W * s, plan.D * s);
      const S = plan.stairs && plan.stairs.up;
      if (S) {
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
        const zA = Math.min(S.zBottom, S.zTop), zB = Math.max(S.zBottom, S.zTop), n = compact ? 5 : 10;
        for (let i = 0; i <= n; i++) { const zz = zA + ((zB - zA) * i) / n; g.beginPath(); g.moveTo(X(S.x0), Y(zz)); g.lineTo(X(S.x1), Y(zz)); g.stroke(); }
      }
    }
    // player + view cone
    const px = X(x), pz = Y(z);
    const ang = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
    const R = compact ? Math.min(20, W * 0.3) : 34;
    const grd = g.createRadialGradient(px, pz, 2, px, pz, R);
    grd.addColorStop(0, 'rgba(80,230,255,0.6)'); grd.addColorStop(1, 'rgba(80,230,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(px, pz); g.arc(px, pz, R, ang - 0.55, ang + 0.55); g.closePath(); g.fill();
    g.fillStyle = '#4fe6ff'; g.strokeStyle = '#fff'; g.lineWidth = compact ? 1.5 : 2;
    g.beginPath(); g.arc(clamp(px, 4, W - 4), clamp(pz, 4, H - 4), compact ? 3.2 : 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = `600 ${compact ? 7 : 9}px system-ui, Arial`; g.textAlign = 'center';
    g.fillText(compact ? '↑' : 'N ↑', W - (compact ? 6 : 14), compact ? 7 : 10);
  }
  return { draw, resize, setBig, setWorld, get world() { return worldSpec; }, get big() { return !!(card && card.classList.contains('big')); }, get size() { return { w: W, h: H }; } };
}

export function toastFn(el) {
  let t = 0;
  return (msg, ms = 2600) => {
    if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(t); t = setTimeout(() => el.classList.remove('show'), ms);
  };
}

/* ============================================================================================ FOV */
// Wider default vertical FOV on phones in portrait so more of the room is on screen; landscape phone 65; desktop 70.
export function defaultFov(isTouch) {
  const w = window.innerWidth || 1280, h = window.innerHeight || 800;
  if (h > w * 1.05) return isTouch ? 82 : 76;
  if (isTouch && Math.min(w, h) < 620) return 65;
  return 70;
}
// Walk-mode zoom: two-finger pinch on touch, wheel / trackpad pinch (ctrl+wheel) on desktop. Smooth FOV 35–95.
// (360 mode keeps its own pinch / wheel handling in core-pano.js with the same range.)
export function createZoom({ canvas, camera, getMode, isTouch, isBusy }) {
  const MIN = 35, MAX = 95;
  const pts = new Map();
  let pinch0 = 0, fov0 = 70, lastPinchT = -1e9, pinched = false;
  const st = { target: defaultFov(isTouch), user: false };
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || getMode() !== 'walk') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { pinch0 = Math.max(1, dist()); fov0 = st.target; pinched = true; lastPinchT = now(); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size >= 2 && pinch0 > 0) { st.target = clamp(fov0 * (pinch0 / Math.max(1, dist())), MIN, MAX); st.user = true; lastPinchT = now(); }
  });
  const up = (e) => {
    if (!pts.delete(e.pointerId)) return;
    if (pts.size < 2) pinch0 = 0;
    if (pts.size === 0) setTimeout(() => { if (!pts.size) pinched = false; }, 0);
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  return {
    MIN, MAX,
    get pinching() { return pts.size >= 2 && pinch0 > 0; },
    // true while / right after a pinch: the fingers lifting must not count as taps (interaction / double-tap walk)
    blockClick() { return pinched || now() - lastPinchT < 350; },
    onWheel(e) {
      if (e.cancelable) e.preventDefault();
      const k = e.ctrlKey ? 0.01 : 0.0012; // ctrl+wheel = trackpad pinch (small deltas)
      st.target = clamp(st.target * Math.exp(clamp(e.deltaY, -120, 120) * k), MIN, MAX); st.user = true;
    },
    reset() { st.target = defaultFov(isTouch); st.user = false; return st.target; },
    get target() { return st.target; }, set target(v) { st.target = clamp(+v || 70, MIN, MAX); st.user = true; },
    get defaultFov() { return defaultFov(isTouch); },
    onResize() { if (!st.user) st.target = defaultFov(isTouch); },
    update(dt) {
      if (getMode() !== 'walk' || (isBusy && isBusy())) return;
      const f = camera.fov + (st.target - camera.fov) * (1 - Math.exp(-12 * dt));
      if (Math.abs(f - camera.fov) > 1e-3) { camera.fov = Math.abs(st.target - f) < 0.01 ? st.target : f; camera.updateProjectionMatrix(); }
    },
  };
}

/* ============================================================================================ arrow D-pad */
// ▲ forward, ▼ back, ◀ ▶ turn. Press-and-hold = continuous with acceleration (forward turns into a run after ~2 s);
// a quick tap = one short step (▲▼, via onStep) or a ~24° turn (◀▶).
export function createDpad(el, opts = {}) {
  if (!el) return null;
  const held = {};
  const st = { impulse: 0 };
  const TAP = 0.22;
  for (const b of el.querySelectorAll('[data-d]')) {
    const d = b.dataset.d;
    const down = (e) => {
      e.preventDefault(); e.stopPropagation();
      try { b.setPointerCapture(e.pointerId); } catch (_) {}
      held[d] = now(); b.classList.add('on');
      if (opts.onPress) try { opts.onPress(d); } catch (_) {}
    };
    const release = (e) => {
      if (held[d] == null) return;
      const dur = (now() - held[d]) / 1000; delete held[d]; b.classList.remove('on');
      if (e && e.type === 'pointercancel') return;
      if (dur < TAP) {
        if (d === 'f' || d === 'b') { if (opts.onStep) try { opts.onStep(d === 'f' ? 1 : -1); } catch (_) {} }
        else st.impulse += (d === 'l' ? 1 : -1) * 0.3; // V7: ~17° per tap (was 24°)
      }
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('click', (e) => e.preventDefault());
  }
  const hold = (d) => (held[d] != null ? (now() - held[d]) / 1000 : -1);
  return {
    el,
    get active() { return Object.keys(held).length > 0 || Math.abs(st.impulse) > 1e-3; },
    // → {forward (-1..1), turn (radians this frame, + = left), run}
    read(dt) {
      let forward = 0, turn = 0, run = false;
      const hf = hold('f'), hb = hold('b'), hl = hold('l'), hr = hold('r');
      if (hf >= TAP) { forward += Math.min(1, 0.45 + (hf - TAP) * 0.5); run = hf > 3.2; } // V7: gentler acceleration, run after ~3 s
      if (hb >= TAP) forward -= Math.min(0.8, 0.4 + (hb - TAP) * 0.6);
      const rate = (h) => (h >= TAP ? Math.min(1.3, 0.5 + (h - TAP) * 0.9) : 0); // V7: gentler turning (was 0.8→2.2 rad/s)
      turn = (rate(hl) - rate(hr)) * dt;
      if (Math.abs(st.impulse) > 1e-4) { const s = Math.sign(st.impulse) * Math.min(Math.abs(st.impulse), dt * 2.2); turn += s; st.impulse -= s; }
      return { forward, turn, run };
    },
    release() { for (const k of Object.keys(held)) delete held[k]; st.impulse = 0; for (const b of el.querySelectorAll('.on')) b.classList.remove('on'); },
    // tests
    press(d) { held[d] = now(); }, lift(d) { delete held[d]; },
  };
}

/* ============================================================================================ popover panels */
const openPanels = new Set();
function closeOnOutside(e) {
  for (const p of [...openPanels]) {
    if (p.el.contains(e.target) || (p.trigger && p.trigger.contains(e.target))) continue;
    hidePanel(p);
  }
}
function showPanel(p) {
  p.el.classList.add('show'); p.el.setAttribute('aria-hidden', 'false');
  if (p.trigger) p.trigger.setAttribute('aria-expanded', 'true');
  openPanels.add(p);
  if (openPanels.size === 1) { document.addEventListener('pointerdown', closeOnOutside, true); }
}
function hidePanel(p) {
  p.el.classList.remove('show'); p.el.setAttribute('aria-hidden', 'true');
  if (p.trigger) p.trigger.setAttribute('aria-expanded', 'false');
  openPanels.delete(p);
  if (!openPanels.size) document.removeEventListener('pointerdown', closeOnOutside, true);
}
function makePanel(el, trigger) {
  const p = { el, trigger };
  el.setAttribute('aria-hidden', 'true');
  return {
    get open() { return el.classList.contains('show'); },
    show() { showPanel(p); }, hide() { hidePanel(p); },
    toggle() { if (el.classList.contains('show')) hidePanel(p); else showPanel(p); },
  };
}
export function closePanels() { for (const p of [...openPanels]) hidePanel(p); }

/* ============================================================================================ radio chip + panel */
// V7: HITS radio (V5-style multi-station engine, Top-40 / CHR only). Chip "📻 WNCI 97.9 · להיטים · ● LIVE". Panel
// (sticky header with ✕): now playing, ⏮ ⏯ ⏭ 🎲 + volume, "השידור לא זמין כרגע" + "נסו שוב" when every station failed,
// and the HITS list (WNCI first) — each row is ONE tap = play here (spinner while connecting; failures toast + auto-skip
// in the engine; tapping the playing row stops it). CSP-blocked page (claude.ai artifact): the list is greyed with
// "השידור החי עובד באתר yosmosllc.com" and the synth plays as "רדיו גיבוי".
export function createRadioUI({ radio, chip, panel, toast }) {
  if (!radio || !chip || !panel) return null;
  chip.innerHTML = '<span class="rc-ico" aria-hidden="true">📻</span><span class="rc-eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="rc-txt"><b></b><small></small></span>';
  chip.setAttribute('aria-haspopup', 'dialog');
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NOTE = 'השידור החי עובד באתר yosmosllc.com', BACKUP = 'רדיו גיבוי', UNAV = 'השידור לא זמין כרגע', HITS = 'להיטים';
  const fq = (s) => (s && isFinite(s.fr) && s.fr ? (s.band === 'AM' ? Math.round(s.fr) + ' AM' : (+s.fr).toFixed(1)) : '');
  const label = (s) => (s ? (s.call ? s.call + ' ' + fq(s) : s.name) : '');
  panel.innerHTML = `
    <div class="sh-head"><b>📻 רדיו להיטים <span class="sh-dim">Top 40 · USA</span></b><button class="sh-x" data-act="close" aria-label="סגור">×</button></div>
    <div class="sh-body">
      <div class="rp-now"><div class="rp-name"></div><div class="rp-sub"></div></div>
      <div class="rp-ctrl" dir="ltr">
        <button data-act="prev" aria-label="התחנה הקודמת" title="התחנה הקודמת">⏮</button>
        <button data-act="toggle" class="rp-play" aria-label="הפעלה / עצירה"></button>
        <button data-act="next" aria-label="התחנה הבאה" title="התחנה הבאה">⏭</button>
        <button data-act="random" aria-label="תחנה אקראית" title="תחנה אקראית">🎲</button>
        <label class="rp-vol" title="עוצמה"><span aria-hidden="true">🔉</span><input type="range" min="0" max="100" step="1" aria-label="עוצמת הרדיו"></label>
      </div>
      <div class="rp-err" role="status"><span>${UNAV}</span><button data-act="retry" class="rp-retry">↻ נסו שוב</button></div>
      <section class="rp-sec" id="rpLive"><div class="rp-h">📡 תחנות להיטים — שידור חי <span class="rp-how"></span></div>
        <div class="rp-note"></div>
        <div class="rp-lvlist" role="listbox" aria-label="תחנות להיטים"></div>
        <div class="rp-foot"></div></section>
    </div>`;
  const lvlist = panel.querySelector('.rp-lvlist'), note = panel.querySelector('.rp-note'), err = panel.querySelector('.rp-err');
  let builtFor = '';
  function buildList(L) {
    const blocked = L.avail === 'no';
    const rows = (L.list && L.list.length) ? L.list : (radio.hits || []);
    const sig = (blocked ? 'B' : 'Y') + '|' + rows.map((s) => s.key).join(',');
    if (sig === builtFor) return;
    builtFor = sig;
    lvlist.innerHTML = rows.map((s, i) => `<div class="rp-row" data-row="${esc(s.key)}"><button class="rp-lvb" role="option" data-key="${esc(s.key)}"${blocked ? ' disabled aria-disabled="true"' : ''}>`
      + `<span class="rp-f">${esc(fq(s))}</span><span class="rp-t"><b><bdi dir="ltr">${esc(s.call || '')}</bdi>${s.call ? ' · ' : ''}<bdi dir="ltr">${esc(s.name)}</bdi></b>`
      + `<small><bdi dir="ltr">${esc(s.city || '')}</bdi> · ${esc(s.he || HITS)}${i === 0 ? ' · <span class="rp-best">ברירת מחדל</span>' : ''}</small></span><span class="rp-lvs" aria-hidden="true">▶</span></button></div>`).join('');
    panel.classList.toggle('rp-blocked', blocked);
    panel.querySelector('.rp-how').textContent = blocked ? '' : '(הקשה = ניגון כאן)';
    note.textContent = blocked ? NOTE : '';
    note.style.display = blocked ? '' : 'none';
    panel.querySelector('.rp-foot').textContent = blocked
      ? 'כאן אין גישה לשידור חי, לכן מתנגן ' + BACKUP + '.'
      : 'הרדיו מתחיל ב-WNCI 97.9 בהקשה הראשונה באתר · תחנה שלא עונה — מדלגים אוטומטית לתחנת הלהיטים הבאה · 🔊 בסרגל הכלים משתיק הכול.';
  }
  const P = makePanel(panel, chip);
  const vol = panel.querySelector('input[type=range]');
  function render(s) {
    s = s || radio.state;
    const L = s.live || radio.live || { avail: 'no', on: false, status: 'idle', list: [] };
    buildList(L);
    const S = L.on ? L.station : null, conn = L.on && (L.status === 'connecting' || L.status === 'error'), backup = !!s.synthOn;
    const unav = !L.on && L.status === 'unavailable' && !backup, syn = s.station || {};
    chip.classList.toggle('on', !!s.on);
    chip.classList.toggle('live', !!L.on);
    chip.classList.toggle('backup', backup);
    chip.classList.toggle('unav', unav);
    chip.classList.toggle('tuning', !!(s.on && (s.tuning || conn)));
    let b, sm, name, sub;
    if (L.on) {
      b = S ? label(S) + ' · ' + HITS : HITS;
      sm = conn ? 'מתחבר…' : '● LIVE';
      name = S ? '📡 ' + label(S) + ' · ' + S.name : '📡 ' + HITS;
      sub = conn ? 'מתחבר לשידור…' : 'שידור חי · ' + (S ? S.city + ' · ' + HITS : '');
    } else if (backup) {
      b = BACKUP; sm = s.tuning ? 'מכוון…' : syn.he || ''; name = '📻 ' + BACKUP + ' · ' + (syn.he || ''); sub = NOTE;
    } else if (unav) {
      b = 'WNCI 97.9 · ' + HITS; sm = UNAV; name = '📡 ' + HITS; sub = 'אף תחנת להיטים לא ענתה כרגע';
    } else {
      b = 'WNCI 97.9 · ' + HITS; sm = 'כבוי'; name = 'הרדיו כבוי'; sub = L.avail === 'no' ? NOTE : 'בחרו תחנה או לחצו ▶';
    }
    chip.querySelector('b').textContent = b;
    chip.querySelector('small').textContent = sm;
    chip.setAttribute('aria-label', '📻 ' + b + ' · ' + sm);
    panel.querySelector('.rp-name').textContent = name;
    panel.querySelector('.rp-sub').textContent = sub;
    const pb = panel.querySelector('.rp-play'); pb.textContent = s.on ? '⏹' : '▶'; pb.classList.toggle('on', !!s.on);
    err.style.display = unav ? '' : 'none';
    for (const row of lvlist.children) {
      const k = row.dataset.row, me = L.on && L.key === k, btn = row.querySelector('.rp-lvb');
      btn.classList.toggle('on', me && L.status === 'playing'); btn.classList.toggle('busy', me && (L.status === 'connecting' || L.status === 'error'));
      btn.setAttribute('aria-selected', me ? 'true' : 'false');
      const ic = btn.querySelector('.rp-lvs'); ic.textContent = me ? (L.status === 'playing' ? '■' : '') : '▶';
    }
    if (document.activeElement !== vol) vol.value = String(Math.round(s.vol * 100));
  }
  chip.addEventListener('click', (e) => { e.stopPropagation(); render(); P.toggle(); });
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    e.stopPropagation();
    const act = b.dataset.act;
    if (act === 'close') P.hide();
    else if (act === 'prev') radio.prev();
    else if (act === 'next') radio.next();
    else if (act === 'random') radio.random();
    else if (act === 'toggle') radio.toggle();
    else if (act === 'retry') radio.retry();
    else if (b.dataset.key != null) {
      const L = radio.live, k = b.dataset.key;
      if (L.on && L.key === k && L.status === 'playing') radio.stop(); else radio.playStation(k);
    }
  });
  vol.addEventListener('input', () => radio.setVolume(+vol.value / 100));
  // open requests (3D radio dial window) → show the panel at the list
  const openAt = () => {
    render(); P.show();
    const el = panel.querySelector('#rpLive');
    requestAnimationFrame(() => { try { el && el.scrollIntoView({ block: 'nearest' }); } catch (_) {} });
  };
  if (radio.onPanelRequest) radio.onPanelRequest(openAt);
  if (radio.onNotice) radio.onNotice((msg) => toast && toast(msg, 3400));
  let lastKey = '';
  radio.onChange((s) => {
    render(s);
    const L = s.live || {};
    const key = L.on && L.status === 'playing' && L.station ? 'L' + L.key : (s.synthOn && s.cur >= 0 ? 'B' : '');
    if (key && key !== lastKey && !P.open && toast) {
      if (key[0] === 'L') toast('📻 ' + label(L.station) + ' · ' + HITS + ' — שידור חי', 2800);
      else toast('📻 ' + BACKUP + ' — ' + NOTE, 3400);
    }
    lastKey = key;
  });
  render();
  return { panel: P, render, openAt, reset() { builtFor = ''; render(); } };
}

/* ============================================================================================ style picker */
// STYLE bot exposes window.__tour.styles = {list(), set(id), current (getter or fn)}; the button stays hidden until it exists.
export function createStyleUI({ btn, panel, toast, getStyles }) {
  if (!btn || !panel) return null;
  let api = null, tries = 0, iv = 0;
  const safe = (fn) => { try { return fn(); } catch (_) { return null; } };
  function find() {
    const s = safe(getStyles);
    return s && typeof s.list === 'function' && typeof s.set === 'function' ? s : null;
  }
  function check() {
    api = find();
    document.body.classList.toggle('has-styles', !!api);
    if (api && iv) { clearInterval(iv); iv = 0; }
    return api;
  }
  const fields = (s, i) => {
    if (typeof s === 'string') return { id: s, name: s, blurb: '' };
    const id = s.id != null ? s.id : (s.key != null ? s.key : i);
    return { id, name: s.he || s.name || s.label || s.title || String(id), blurb: s.blurb || s.heBlurb || s.desc || s.description || s.sub || '', sw: Array.isArray(s.swatch) ? s.swatch : (Array.isArray(s.colors) ? s.colors : null) };
  };
  panel.innerHTML = '<div class="sh-head"><b>🎨 סגנון השיפוץ</b><button class="sh-x" data-act="close" aria-label="סגור">×</button></div><div class="sh-body"><div class="sp-list" role="listbox" aria-label="סגנונות"></div></div>';
  const list = panel.querySelector('.sp-list');
  const P = makePanel(panel, btn);
  function render() {
    if (!check()) return;
    const items = (safe(() => api.list()) || []).map(fields);
    let cur = safe(() => (typeof api.current === 'function' ? api.current() : api.current)); // getter or function
    if (cur && typeof cur === 'object') cur = cur.id;
    list.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.className = 'sp-it' + (String(it.id) === String(cur) ? ' on' : ''); b.dataset.id = String(it.id); b.setAttribute('role', 'option');
      b.innerHTML = '<span class="sp-sw"></span><span class="sp-t"><b></b><small></small></span>';
      b.querySelector('b').textContent = it.name; b.querySelector('small').textContent = it.blurb;
      const sw = b.querySelector('.sp-sw');
      if (it.sw && it.sw.length) for (const c of it.sw.slice(0, 4)) { const i = document.createElement('i'); i.style.background = String(c); sw.appendChild(i); } else sw.remove();
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (b.classList.contains('busy')) return;
        b.classList.add('busy');
        let r; try { r = api.set(it.id); } catch (err) { r = Promise.reject(err); }
        Promise.resolve(r).then(() => { toast && toast('🎨 סגנון: ' + it.name, 2400); }, (err) => { console.warn('[styles] set', err); toast && toast('החלפת הסגנון נכשלה'); })
          .finally(() => { b.classList.remove('busy'); render(); });
      });
      list.appendChild(b);
    }
  }
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (!check()) return; render(); P.toggle(); });
  panel.addEventListener('click', (e) => { const b = e.target.closest('[data-act="close"]'); if (b) { e.stopPropagation(); P.hide(); } });
  check();
  if (!api) iv = setInterval(() => { if (check() || ++tries > 60) { clearInterval(iv); iv = 0; } }, 1000);
  return { check, render, panel: P, get available() { return !!api; } };
}

/* ============================================================================================ phone layout */
// Tools column → one "⋯" button on phones; 360 actions → behind a "⋯" button in the 360 panel on phones.
export function setupCompactUI({ tools, btnMore, btnPanoMore }) {
  const body = document.body;
  if (btnMore) btnMore.addEventListener('click', (e) => { e.stopPropagation(); body.classList.toggle('tools-open'); btnMore.setAttribute('aria-expanded', body.classList.contains('tools-open') ? 'true' : 'false'); });
  if (btnPanoMore) btnPanoMore.addEventListener('click', (e) => { e.stopPropagation(); body.classList.toggle('pano-more'); btnPanoMore.classList.toggle('on', body.classList.contains('pano-more')); });
  document.addEventListener('pointerdown', (e) => {
    if (body.classList.contains('tools-open') && tools && !tools.contains(e.target) && !(e.target.closest && e.target.closest('.sheet'))) body.classList.remove('tools-open');
  }, true);
  // a tool picked from the expanded phone column closes it (day/night segment and toggles stay usable)
  if (tools) tools.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b === btnMore) return;
    if (b.id === 'btnStyle') return;
    if (window.matchMedia && matchMedia('(max-width: 900px)').matches) setTimeout(() => body.classList.remove('tools-open'), 260);
  });
  setupDialogs();
  // V7 RENDERS: "🖼 הדמיות" pre-rendered 360 gallery (buttons in the 360 bar, the tools column and the loader card)
  import('./gallery.js').then((m) => m.installGallery()).then(() => import('./sow-ui.js')).then((m) => m.installSowUI()) // V11: "📋 שיפוץ לפי האקסל" pill / panel / before-after
    .catch((e) => console.warn('[gallery / sow] not available', e));
}

/* ============================================================================================ V6: dialogs */
// Help ("איך מסיירים בבית"): the header (title + ✕) stays fixed while the body scrolls inside the panel; it closes on ✕,
// a tap outside the panel (the dimmed backdrop) or Escape. Escape also closes the radio / style sheets, the phone tools
// column and the 360 "⋯" actions. (core.js still toggles #help from the ? button and ✕.)
export function setupDialogs() {
  if (setupDialogs.done || typeof document === 'undefined') return; setupDialogs.done = true;
  const body = document.body, help = document.getElementById('help');
  const closeHelp = () => { if (help) help.classList.remove('show'); };
  if (help) {
    help.addEventListener('click', (e) => { if (e.target === help) { e.stopPropagation(); closeHelp(); } });
    const x = document.getElementById('helpClose'), sc = help.querySelector('.ph-body');
    let was = help.classList.contains('show');
    new MutationObserver(() => {
      const on = help.classList.contains('show'); if (on === was) return; was = on;
      if (on) { if (sc) sc.scrollTop = 0; try { x && x.focus({ preventScroll: true }); } catch (_) {} }
      else if (document.activeElement && help.contains(document.activeElement)) { try { document.activeElement.blur(); } catch (_) {} }
    }).observe(help, { attributes: true, attributeFilter: ['class'] });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeHelp(); closePanels();
    body.classList.remove('tools-open', 'pano-more');
    const m = document.getElementById('btnMore'); if (m) m.setAttribute('aria-expanded', 'false');
    const pm = document.getElementById('btnPanoMore'); if (pm) pm.classList.remove('on');
  }, true);
}

/* ============================================================================================ guards */
// iOS Safari: block pinch page-zoom (gesture* events), ctrl+wheel page zoom on desktop, and unlock WebAudio on the first
// real gesture (pointerdown / touchend / click / keydown; a 1-sample silent buffer is played inside the gesture).
export function installGuards({ audio, onFirstGesture }) {
  const pd = (e) => { if (e.cancelable) e.preventDefault(); };
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, pd, { passive: false });
  window.addEventListener('wheel', (e) => { if (e.ctrlKey && e.cancelable) e.preventDefault(); }, { passive: false });
  let fired = false, done = false;
  const EVS = ['pointerdown', 'touchend', 'mousedown', 'click', 'keydown'];
  const unlock = (e) => {
    if (done) return;
    if (e.type === 'keydown' && (e.repeat || e.key === 'Escape')) return;
    try { audio.resume(); } catch (_) {}
    let c = null; try { c = audio.muted ? null : audio.ctx; } catch (_) { c = null; }
    if (c) { try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (_) {} }
    if (!fired) { fired = true; try { onFirstGesture && onFirstGesture(e); } catch (err) { console.warn('[ui] first gesture', err); } }
    if (c && c.state === 'running') { done = true; for (const ev of EVS) window.removeEventListener(ev, unlock, true); }
  };
  for (const ev of EVS) window.addEventListener(ev, unlock, true);
  return { get unlocked() { return done; }, get gestured() { return fired; } };
}

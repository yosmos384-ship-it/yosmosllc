// interior-tv.js — V7 living-room TV: wall TV + a black remote on the coffee table + a channel panel with free,
// official American live YouTube channels. Desktop: the live YouTube embed is an absolutely positioned <iframe>
// projected onto the TV screen rectangle every frame (4 projected corners → CSS matrix3d homography); it is hidden
// when the TV is off-screen, behind a wall (throttled raycast camera → screen centre), on another floor / outside,
// or in dollhouse / plan / photoreal views (the stream keeps playing, quieter, like a real TV in another room).
// Phones (coarse pointer): the player is docked as an interactive panel (iOS needs a tap on the player for sound).
// Tapping the remote or the TV opens the channel panel (power, CH ▲▼, VOL −/+, mute, channel list).
// Without a DOM (node tests) the TV keeps a pure state machine and the old in-house slideshow.
// NOTE: only official free live channels are listed. Copyrighted shows (e.g. Seinfeld) have no legal free stream and
// are deliberately not embedded or imitated.
import { THREE, PI, Batch } from './interior-lib.js';
import { getRadio } from './radio-engine.js';
import { tr, getLang } from './i18n.js'; // V7: canvas text in the current language

const BRASS = 0xc9a356;

// Channel IDs verified 2026-10-15 (youtube.com/channel/<ID> → og:title / canonical). Live streams are the channels'
// own 24/7 or scheduled streams; when a channel is not live right now YouTube shows its "offline" card.
export const TV_CHANNELS = [
  { id: 'house', name: '3351 Eakin TV', he: 'ערוץ הבית · מצגת השיפוץ', local: true },
  { id: 'abc', name: 'ABC News Live', he: 'חדשות ABC', yt: 'UCBi2mrWuNuyYy4gbM6fU18Q' },
  { id: 'nbc', name: 'NBC News NOW', he: 'חדשות NBC', yt: 'UCeY0bbntWzzVIaj2z3QigXg' },
  { id: 'cbs', name: 'CBS News 24/7', he: 'חדשות CBS', yt: 'UC8p1vwvWtl6T73JiExfWs1g' },
  { id: 'livenow', name: 'LiveNOW from FOX', he: 'שידורים חיים', yt: 'UCJg9wBPyKMNA5sRDnvzmkdg' },
  { id: 'scripps', name: 'Scripps News', he: 'חדשות ארה״ב', yt: 'UCTln5ss6h6L_xNfMeujfPbg' },
  { id: 'newsnation', name: 'NewsNation', he: 'חדשות ארה״ב', yt: 'UCCjG8NtOig0USdrT5D1FpxQ' },
  { id: 'bloomberg', name: 'Bloomberg Television', he: 'כלכלה ושווקים', yt: 'UCIALMKvObZNtJ6AmdCLP7Lg' },
  { id: 'foxweather', name: 'FOX Weather', he: 'מזג אוויר', yt: 'UC1FbPiXx59_ltnFVx7IxWow' },
  { id: 'nasa', name: 'NASA', he: 'חלל · NASA Live', yt: 'UCLA_DiR1FfKNvjuUpBHmylQ' },
  { id: 'wsyx', name: 'ABC 6 WSYX Columbus', he: 'חדשות קולומבוס (בזמן מהדורות)', yt: 'UC6HHWRGuLD11spg9DxKAZlQ' },
];
export const embedUrl = (ch, o = {}) => 'https://www.youtube.com/embed/live_stream?channel=' + ch.yt +
  '&autoplay=1&mute=' + (o.mute ? 1 : 0) + '&playsinline=1&enablejsapi=1&rel=0&modestbranding=1' +
  (o.origin ? '&origin=' + encodeURIComponent(o.origin) : '');
export const watchUrl = (ch) => 'https://www.youtube.com/channel/' + ch.yt + '/live';

// ------------------------------------------------------------------ homography: (0,0)(W,0)(W,H)(0,H) → p0..p3 (CSS px)
export function quadMatrix3d(W, H, p) {
  const [x0, y0] = p[0], [x1, y1] = p[1], [x2, y2] = p[2], [x3, y3] = p[3];
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const area = (x0 * y1 - x1 * y0) + (x1 * y2 - x2 * y1) + (x2 * y3 - x3 * y2) + (x3 * y0 - x0 * y3);
  if (!(Math.abs(area) > 1)) return null; // degenerate / collapsed quad (< 1 px²)
  let a, b, c, d, e, f, g, h;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { a = x1 - x0; b = x2 - x1; c = x0; d = y1 - y0; e = y2 - y1; f = y0; g = 0; h = 0; }
  else {
    const det = dx1 * dy2 - dx2 * dy1; if (Math.abs(det) < 1e-12) return null;
    g = (dx3 * dy2 - dx2 * dy3) / det; h = (dx1 * dy3 - dx3 * dy1) / det;
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0; d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0;
  }
  a /= W; d /= W; g /= W; b /= H; e /= H; h /= H;
  const m = [a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, 1];
  if (!m.every(isFinite)) return null;
  return 'matrix3d(' + m.map((v) => +v.toFixed(8)).join(',') + ')';
}

// ------------------------------------------------------------------ screen canvas (slideshow + channel cards)
function screenCanvas() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 288;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const slides = [
    { t: '3351 Eakin Rd — אחרי שיפוץ', s: 'Columbus, Ohio 43204', c: ['#1f3a5f', '#3b6e8f'] },
    { t: '4 חדרי שינה · 2 חדרי רחצה', s: 'Cape Cod 1956 — שיפוץ יוקרה מלא', c: ['#34483c', '#7b8f6a'] },
    { t: 'מטבח ירוק עמוק ושיש קלקטה', s: 'פליז מוברש · מקרר משולב · כיריים מקצועיות', c: ['#283a30', '#a08a5a'] },
    { t: 'מרתף בילוי', s: 'ביליארד · בר · כביסה', c: ['#4a3324', '#a45a3c'] },
  ];
  let last = '';
  const slide = (time) => {
    const g = c.getContext('2d'), i = Math.floor(time / 6) % slides.length, sl = slides[i];
    const grd = g.createLinearGradient(0, 0, 512, 288); grd.addColorStop(0, sl.c[0]); grd.addColorStop(1, sl.c[1]);
    g.fillStyle = grd; g.fillRect(0, 0, 512, 288);
    g.globalAlpha = 0.12; g.fillStyle = '#ffffff';
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc((k * 130 + time * 12) % 600 - 40, 60 + k * 45, 30 + k * 8, 0, PI * 2); g.fill(); }
    g.globalAlpha = 1;
    g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.beginPath(); g.moveTo(256 - 38, 92); g.lineTo(256, 58); g.lineTo(256 + 38, 92); g.stroke();
    g.strokeRect(256 - 28, 92, 56, 40); g.fillStyle = '#ffffff'; g.fillRect(250, 112, 12, 20);
    g.direction = getLang() === 'he' ? 'rtl' : 'ltr'; g.textAlign = 'center'; g.fillStyle = '#ffffff';
    g.font = 'bold 30px "Segoe UI", Arial, sans-serif'; g.fillText(tr(sl.t), 256, 180, 490);
    g.font = '19px "Segoe UI", Arial, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(tr(sl.s), 256, 212, 490);
    const d = new Date(); const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0'), ss = String(d.getSeconds()).padStart(2, '0');
    g.direction = 'ltr'; g.textAlign = 'left'; g.font = 'bold 18px monospace'; g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillText(`${hh}:${mm}:${ss}`, 16, 30);
    g.textAlign = 'right'; g.font = '14px sans-serif'; g.fillText('CH 0 · LIVE TOUR', 496, 30);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(16, 262, 480, 4); g.fillStyle = '#ffffff'; g.fillRect(16, 262, 480 * ((time % 6) / 6), 4);
    for (let k = 0; k < slides.length; k++) { g.beginPath(); g.arc(256 - 30 + k * 20, 245, 4, 0, PI * 2); g.fillStyle = k === i ? '#fff' : 'rgba(255,255,255,0.4)'; g.fill(); }
  };
  // logo-free text card for a live channel (shown while loading / when the player is docked or not visible)
  const card = (idx, ch, status, time) => {
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 512, 288); grd.addColorStop(0, '#0d1420'); grd.addColorStop(1, '#1d2a3c');
    g.fillStyle = grd; g.fillRect(0, 0, 512, 288);
    g.fillStyle = 'rgba(255,255,255,0.06)'; for (let y = 0; y < 288; y += 4) g.fillRect(0, y, 512, 1);
    g.direction = 'ltr'; g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = 'bold 20px monospace'; g.fillText('CH ' + idx, 20, 36);
    g.fillStyle = '#d7263d'; g.fillRect(430, 18, 62, 26); g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.fillText('LIVE', 461, 37);
    g.fillStyle = '#ffffff'; g.font = 'bold 36px "Segoe UI", Arial, sans-serif'; g.fillText(ch.name, 256, 140, 480);
    g.direction = getLang() === 'he' ? 'rtl' : 'ltr'; g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = '20px "Segoe UI", Arial, sans-serif'; g.fillText(tr(ch.he), 256, 176, 480);
    g.fillStyle = 'rgba(160,220,255,0.9)'; g.font = '17px "Segoe UI", Arial, sans-serif'; g.fillText(tr(status), 256, 226, 480);
    const n = Math.floor(time * 3) % 4; g.direction = 'ltr'; g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillText('•'.repeat(n + 1), 256, 256);
  };
  const draw = (o) => {
    const key = getLang() + (o.local ? 'S' + Math.floor(o.time) : 'C' + o.idx + o.status + (Math.floor(o.time * 3) % 4));
    if (key === last) return false; last = key;
    try { if (o.local) slide(o.time); else card(o.idx, o.ch, o.status, o.time); } catch (e) { return false; }
    return true;
  };
  return { tex, draw };
}

// ------------------------------------------------------------------ DOM: styles + panel + projected player
const CSS = `
.tv3d-layer{position:fixed;inset:0;pointer-events:none;z-index:4;overflow:hidden}
.tv3d-box{position:absolute;left:0;top:0;width:640px;height:368px;transform-origin:0 0;background:#000;visibility:hidden;will-change:transform;backface-visibility:hidden}
.tv3d-box iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;pointer-events:none}
.tv3d-card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:linear-gradient(135deg,#0d1420,#1d2a3c);color:#fff;font:600 30px/1.2 system-ui,-apple-system,"Segoe UI",Arial,sans-serif;text-align:center;transition:opacity .6s ease;pointer-events:none}
.tv3d-card small{font-size:19px;font-weight:500;opacity:.8}
.tv3d-card .ch{position:absolute;top:16px;left:20px;font:700 20px monospace;opacity:.75}
.tv3d-card .live{position:absolute;top:14px;right:18px;background:#d7263d;border-radius:4px;padding:3px 10px;font-size:16px}
.tv3d-card.gone{opacity:0}
.tv3d-box.dock{position:fixed;left:50%;top:auto;bottom:calc(84px + env(safe-area-inset-bottom,0px));width:min(92vw,560px);height:auto;aspect-ratio:16/9;transform:translateX(-50%)!important;visibility:visible;pointer-events:auto;z-index:31;border-radius:12px;overflow:visible;box-shadow:0 14px 40px rgba(0,0,0,.55)}
.tv3d-box.dock iframe{pointer-events:auto;border-radius:12px}
.tv3d-box.dock .tv3d-card{border-radius:12px}
.tv3d-undock{display:none}
.tv3d-box.dock .tv3d-undock{display:flex;position:absolute;top:-38px;left:0;gap:6px}
.tv3d-undock button{background:rgba(12,16,24,.86);border:1px solid rgba(255,255,255,.22);color:#eef3f8;border-radius:9px;padding:6px 11px;font:600 13px system-ui,sans-serif;cursor:pointer}
#tvPanel{left:calc(16px + env(safe-area-inset-left,0px));bottom:calc(84px + env(safe-area-inset-bottom,0px));width:min(310px,calc(100vw - 32px));max-height:min(70vh,560px);display:none;flex-direction:column;padding:10px;gap:8px;z-index:30;direction:rtl}
#tvPanel.open{display:flex}
#tvPanel .tvp-head{display:flex;align-items:center;gap:8px}
#tvPanel .tvp-head b{font-size:14.5px}
#tvPanel .tvp-now{flex:1;font-size:12px;color:var(--muted,#aab);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#tvPanel .tvp-x{width:30px;height:30px;border-radius:9px;background:rgba(255,255,255,.08);font-size:15px}
#tvPanel .tvp-remote{direction:ltr;display:grid;grid-template-columns:repeat(6,1fr);gap:5px;padding:7px;border-radius:12px;background:linear-gradient(180deg,#17181b,#0c0d0f);border:1px solid rgba(255,255,255,.08)}
#tvPanel .tvp-remote button{height:38px;border-radius:10px;background:#26282d;color:#e8ecf2;font-size:14px;font-weight:700;box-shadow:inset 0 -2px 0 rgba(0,0,0,.45)}
#tvPanel .tvp-remote button:active{transform:translateY(1px)}
#tvPanel .tvp-remote .pw{background:#a3222a;color:#fff}
#tvPanel .tvp-remote .pw.on{background:#2e7d4f}
#tvPanel .tvp-list{overflow-y:auto;display:flex;flex-direction:column;gap:4px;min-height:80px}
#tvPanel .tvp-list button{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:10px;text-align:right;background:rgba(255,255,255,.04)}
#tvPanel .tvp-list button.on{background:rgba(67,224,255,.18);box-shadow:inset 0 0 0 1px rgba(67,224,255,.55)}
#tvPanel .tvp-list .n{font:700 12px monospace;opacity:.7;width:24px;text-align:center;direction:ltr}
#tvPanel .tvp-list .t{display:flex;flex-direction:column;min-width:0}
#tvPanel .tvp-list .t b{font-size:13px;direction:ltr;text-align:right}
#tvPanel .tvp-list .t span{font-size:11.5px;color:var(--muted,#aab)}
#tvPanel .tvp-foot{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11.5px;color:var(--muted,#aab)}
#tvPanel .tvp-foot button,#tvPanel .tvp-foot a{padding:6px 9px;border-radius:9px;background:rgba(255,255,255,.08);color:var(--text,#eef);font-size:12px;text-decoration:none}
#tvPanel .tvp-note{flex-basis:100%;line-height:1.35}
`;

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }

// ------------------------------------------------------------------ TV (wall-mounted, frame: wall face, facing +z)
export function buildTV(E, G, f) {
  const ctx = E.ctx || {};
  const W = 1.12, Hh = 0.65;
  f.box('matte', [W, Hh, 0.026], [0, 1.25, 0.045], 0x101112, { r: 0.004 });
  f.box('brass', [W, 0.006, 0.02], [0, 1.25 - Hh / 2 - 0.003, 0.05], BRASS, { r: 0.002 });
  f.box('matte', [0.3, 0.3, 0.03], [0, 1.25, 0.015], 0x222222, { r: 0.004 });
  // tiny standby LED under the bezel (red = standby, white = on)
  const ledM = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }); ledM.name = 'tv-led'; ledM.userData.styleKey = 'static:tvLed';
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.003, 0.002), ledM); f.place(led, [0.48, 1.25 - Hh / 2 + 0.006, 0.0585]); G.add(led);
  const { tex, draw } = screenCanvas();
  const onM = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }); onM.name = 'tv-on'; onM.userData.styleKey = 'static:tvScreen';
  const SW = W - 0.016, SH = Hh - 0.016;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), E.M.screenOff);
  screen.name = 'tv-screen';
  f.place(screen, [0, 1.25, 0.0585]); G.add(screen);

  const hasDOM = typeof document !== 'undefined' && !!document.body && typeof document.body.appendChild === 'function' && typeof window !== 'undefined';
  const coarse = (() => { try { return !!(ctx.isTouch || (window.matchMedia && matchMedia('(pointer: coarse)').matches)); } catch (_) { return false; } })();
  const st = { on: false, idx: 1, t: 0, vol: 70, muted: false, panel: false, dock: coarse, loaded: false, loadT: 0, ducked: false,
    visible: false, reason: 'off', transform: '', occluded: false, occT: 0, volSent: -1, volT: 0, att: 1 };
  const ch = () => TV_CHANNELS[st.idx];
  const live = () => st.on && !!ch().yt;
  let dom = null;

  // ---- radio ducking (V7: the shared radio engine's real duck(on); the user's radio volume is never touched)
  const duck = (on) => {
    on = !!on; if (on === st.ducked) return; st.ducked = on;
    try { const R = getRadio() || (typeof window !== 'undefined' && window.__tour && window.__tour.radio) || null; if (R && typeof R.duck === 'function') R.duck(on); } catch (_) { }
  };
  if (hasDOM) { try { window.addEventListener('pagehide', () => duck(false)); } catch (_) { } }

  const post = (func, args) => {
    try { const w = dom && dom.ifr && dom.ifr.contentWindow; if (w) w.postMessage(JSON.stringify({ event: 'command', func, args: args || [] }), '*'); } catch (_) { }
  };
  const pushVolume = (force) => {
    if (!dom || !dom.ifr) return;
    const v = st.muted ? 0 : Math.round(st.vol * st.att);
    if (!force && v === st.volSent) return;
    st.volSent = v;
    if (st.muted) post('mute'); else { post('unMute'); post('setVolume', [v]); }
  };

  // ---- DOM (lazy)
  function ensureDom() {
    if (!hasDOM) return null;
    if (dom) return dom;
    try {
      if (!document.getElementById('tv3dStyle')) { const s = el('style'); s.id = 'tv3dStyle'; s.textContent = CSS; document.head.appendChild(s); }
      const layer = el('div', 'tv3d-layer'); layer.id = 'tv3dLayer';
      const box = el('div', 'tv3d-box'); layer.appendChild(box);
      const card = el('div', 'tv3d-card'); box.appendChild(card);
      const und = el('div', 'tv3d-undock');
      const bTv = el('button', '', 'הצג על הטלוויזיה'); bTv.type = 'button';
      const bCl = el('button', '', 'כבה ✕'); bCl.type = 'button';
      und.append(bTv, bCl); box.appendChild(und);
      bTv.addEventListener('click', () => api.dock(false));
      bCl.addEventListener('click', () => api.power(false));
      if (coarse) und.removeChild(bTv); // phones: docked player only
      const stage = document.getElementById('stage');
      (stage && stage.parentNode ? stage.parentNode : document.body).insertBefore(layer, stage ? stage.nextSibling : null);
      // panel
      const p = el('div', 'glass ui'); p.id = 'tvPanel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'שלט טלוויזיה');
      p.innerHTML = '<div class="tvp-head"><b>📺 טלוויזיה</b><span class="tvp-now"></span><button type="button" class="tvp-x" aria-label="סגור">✕</button></div>' +
        '<div class="tvp-remote">' +
        '<button type="button" class="pw" data-k="pw" aria-label="הפעלה / כיבוי">⏻</button>' +
        '<button type="button" data-k="chd" aria-label="ערוץ קודם">CH▼</button><button type="button" data-k="chu" aria-label="ערוץ הבא">CH▲</button>' +
        '<button type="button" data-k="vd" aria-label="הנמך">−</button><button type="button" data-k="vu" aria-label="הגבר">+</button>' +
        '<button type="button" data-k="mu" aria-label="השתק">🔇</button></div>' +
        '<div class="tvp-list"></div>' +
        '<div class="tvp-foot"><button type="button" data-k="dock"></button><a target="_blank" rel="noopener" class="yt">YouTube ↗</a>' +
        '<span class="tvp-note">שידורים חיים רשמיים וחינמיים מ-YouTube. אם ערוץ לא משדר כרגע — נסו ערוץ אחר.</span></div>';
      document.body.appendChild(p);
      const list = p.querySelector('.tvp-list');
      TV_CHANNELS.forEach((c, i) => {
        const b = el('button', '', `<span class="n">${i}</span><span class="t"><b></b><span></span></span>`); b.type = 'button';
        b.querySelector('b').textContent = c.name; b.querySelector('.t span').textContent = c.he;
        b.dataset.i = String(i);
        b.addEventListener('click', () => api.set(i));
        list.appendChild(b);
      });
      p.querySelector('.tvp-x').addEventListener('click', () => api.closePanel());
      p.addEventListener('click', (ev) => {
        const k = ev.target && ev.target.closest && ev.target.closest('[data-k]'); if (!k) return;
        ({ pw: () => api.power(), chu: () => api.next(), chd: () => api.prev(), vu: () => api.volUp(), vd: () => api.volDown(), mu: () => api.mute(), dock: () => api.dock(!st.dock) })[k.dataset.k]?.();
      });
      // keep key presses inside the panel from driving the walk controls
      p.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') api.closePanel(); ev.stopPropagation(); });
      window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && st.panel) api.closePanel(); });
      dom = { layer, box, card, panel: p, list, ifr: null };
    } catch (e) { console.warn('[interior] tv dom', e); dom = null; }
    return dom;
  }

  function setCard(text, sub) {
    if (!dom) return;
    const c = ch();
    dom.card.innerHTML = `<span class="ch">CH ${st.idx}</span><span class="live">LIVE</span><div></div><small></small>`;
    dom.card.querySelector('div').textContent = c.name;
    dom.card.querySelector('small').textContent = sub || text || '';
    dom.card.classList.remove('gone');
  }
  function killPlayer() {
    if (!dom || !dom.ifr) return;
    try { dom.ifr.src = 'about:blank'; } catch (_) { }
    try { dom.ifr.remove(); } catch (_) { }
    dom.ifr = null; st.loaded = false; st.volSent = -1;
  }
  function loadPlayer() {
    if (!ensureDom()) return;
    killPlayer();
    const c = ch();
    setCard(c.name, 'טוען שידור חי… · ' + c.he);
    const f2 = document.createElement('iframe');
    f2.title = c.name + ' — YouTube live';
    f2.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f2.referrerPolicy = 'strict-origin-when-cross-origin';
    let origin = ''; try { origin = location.origin && location.origin.startsWith('http') ? location.origin : ''; } catch (_) { }
    f2.src = embedUrl(c, { mute: false, origin });
    f2.addEventListener('load', () => {
      st.loaded = true; st.loadT = 0;
      setTimeout(() => { if (dom && dom.ifr === f2) { dom.card.classList.add('gone'); pushVolume(true); post('playVideo'); } }, 1200);
      setTimeout(() => { if (dom && dom.ifr === f2) pushVolume(true); }, 3000);
    });
    dom.box.insertBefore(f2, dom.card);
    dom.ifr = f2;
  }
  function applyScreen() {
    screen.material = st.on ? onM : E.M.screenOff;
    ledM.color.setHex(st.on ? 0xf4f4f4 : 0xff2a2a);
    if (st.on) { draw(drawArgs()); tex.needsUpdate = true; }
  }
  const drawArgs = () => {
    const c = ch();
    let status = 'טוען שידור חי…';
    if (!hasDOM) status = 'שידור חי זמין באתר';
    else if (st.loaded) status = st.dock ? 'מנגן בנגן שעל המסך' : (st.visible ? 'משודר' : 'משודר · ' + c.he);
    return { local: !!c.local, idx: st.idx, ch: c, status, time: st.t };
  };
  function syncPanel() {
    if (!dom) return;
    const p = dom.panel, c = ch();
    p.querySelector('.tvp-now').textContent = st.on ? `CH ${st.idx} · ${c.name}` : 'כבויה';
    const pw = p.querySelector('.pw'); pw.classList.toggle('on', st.on);
    p.querySelector('[data-k="mu"]').textContent = st.muted ? '🔈' : '🔇';
    for (const b of dom.list.children) b.classList.toggle('on', st.on && +b.dataset.i === st.idx);
    const d = p.querySelector('[data-k="dock"]');
    d.textContent = st.dock ? 'הצג על הטלוויזיה' : 'נגן גדול ▶';
    d.style.display = (!c.yt || coarse) ? 'none' : '';
    const yt = p.querySelector('.yt');
    if (c.yt) { yt.href = watchUrl(c); yt.style.display = ''; } else yt.style.display = 'none';
  }
  function refresh() {
    applyScreen();
    if (live()) {
      if (!dom || !dom.ifr || dom.ifr.dataset.ch !== ch().id) { loadPlayer(); if (dom && dom.ifr) dom.ifr.dataset.ch = ch().id; }
      if (dom) dom.box.classList.toggle('dock', st.dock);
    } else { killPlayer(); if (dom) { dom.box.classList.remove('dock'); dom.box.style.visibility = 'hidden'; } st.visible = false; }
    duck(live());
    syncPanel();
  }

  const api = {
    channels: TV_CHANNELS,
    get on() { return st.on; }, get idx() { return st.idx; }, get channel() { return ch(); }, get volume() { return st.vol; }, get muted() { return st.muted; },
    get panelOpen() { return st.panel; }, get docked() { return st.dock; }, get hasDOM() { return hasDOM; },
    get view() { return { visible: st.visible, reason: st.reason, transform: st.transform, docked: st.dock, loaded: st.loaded, src: dom && dom.ifr ? dom.ifr.src : '', att: st.att, volSent: st.volSent }; },
    power(on) {
      const next = on === undefined ? !st.on : !!on;
      if (next === st.on) return api;
      st.on = next; st.t = 0; E.snd.click(screen, 0.6);
      if (st.on) { E.snd.tone(screen, { freq: 15600, dur: 0.4, vol: 0.01 }); E.snd.tone(screen, { freq: 523, dur: 0.25, vol: 0.06, delay: 0.1 }); E.snd.tone(screen, { freq: 784, dur: 0.35, vol: 0.06, delay: 0.3 }); }
      refresh(); return api;
    },
    set(i) {
      const n = TV_CHANNELS.length; i = ((Math.round(+i) || 0) % n + n) % n;
      const changed = i !== st.idx; st.idx = i; st.t = 0;
      if (!st.on) { api.power(true); return api; }
      if (changed) { E.snd.click(screen, 0.35); refresh(); }
      return api;
    },
    next() { return api.set(st.idx + 1); },
    prev() { return api.set(st.idx - 1); },
    volUp() { st.vol = Math.min(100, st.vol + 10); st.muted = false; pushVolume(true); syncPanel(); return api; },
    volDown() { st.vol = Math.max(0, st.vol - 10); pushVolume(true); syncPanel(); return api; },
    mute(v) { st.muted = v === undefined ? !st.muted : !!v; pushVolume(true); syncPanel(); return api; },
    dock(v) { st.dock = coarse ? true : !!v; if (dom) dom.box.classList.toggle('dock', st.dock && live()); syncPanel(); return api; },
    openPanel() { if (!ensureDom()) return false; st.panel = true; dom.panel.classList.add('open'); syncPanel(); return true; },
    closePanel() { st.panel = false; if (dom) dom.panel.classList.remove('open'); return api; },
    /** remote / TV tap: open the channel panel (turning the TV on if needed); headless: toggle power */
    tap() {
      if (!hasDOM) { api.power(); return api; }
      if (!st.on) api.power(true);
      if (st.panel) api.closePanel(); else api.openPanel();
      return api;
    },
    screen,
  };
  try { ctx.tv = api; } catch (_) { }
  try { if (typeof window !== 'undefined') { window.__tourTV = api; if (window.__tour) window.__tour.tv = api; } } catch (_) { }

  E.interact(screen, () => (st.on ? 'ערוצי טלוויזיה · ' + ch().name : 'הדלק טלוויזיה · ערוצים'), () => api.tap());

  // ---- per frame: screen canvas + projected player
  const corners = [new THREE.Vector3(-SW / 2, SH / 2, 0), new THREE.Vector3(SW / 2, SH / 2, 0), new THREE.Vector3(SW / 2, -SH / 2, 0), new THREE.Vector3(-SW / 2, -SH / 2, 0)];
  const tmp = new THREE.Vector3(), cen = new THREE.Vector3(), nrm = new THREE.Vector3(), camP = new THREE.Vector3(), occP = new THREE.Vector3(1e9, 0, 0);
  let ray = null, occTargets = null;
  const P = E.plan, F0 = P.mainFloor;
  const hide = (reason) => { st.reason = reason; if (st.visible && dom) dom.box.style.visibility = 'hidden'; st.visible = false; };
  const visChain = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
  const occluded = () => {
    try {
      if (!ray) ray = new THREE.Raycaster();
      if (!occTargets) occTargets = (E.ctx.scene || E.top).children.filter((c) => c.name === 'house' || /^interior-/.test(c.name || ''));
      const d = cen.distanceTo(camP); if (d < 0.2) return false;
      ray.set(camP, tmp.copy(cen).sub(camP).normalize()); ray.near = 0.05; ray.far = d - 0.12;
      const hits = ray.intersectObjects(occTargets, true);
      for (const h of hits) {
        const o = h.object, m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (o === screen || !m || m.visible === false || !visChain(o)) continue;
        if (m.transparent && ((m.opacity !== undefined && m.opacity < 0.6) || m.transmission > 0)) continue;
        if (m.transmission > 0.2) continue;
        return true;
      }
    } catch (_) { }
    return false;
  };
  E.anim.tick((dt) => {
    if (!st.on) return;
    st.t += dt;
    if (draw(drawArgs())) tex.needsUpdate = true;
    if (!dom || !dom.ifr) return;
    const cam = E.ctx.camera; if (!cam) return;
    cam.getWorldPosition(camP);
    // volume follows where the viewer is (TV in the living room keeps playing when you walk away)
    let mode = ''; try { mode = E.ctx.mode || ''; } catch (_) { }
    const inHouse = camP.x > 0 && camP.x < P.W && camP.z > 0 && camP.z < P.D;
    const mainFl = camP.y > F0 - 0.2 && camP.y < P.mainCeil + 0.1;
    const inLiving = inHouse && mainFl && camP.x > 5.43 && camP.z > 3.0;
    st.att = mode === 'dollhouse' || mode === 'plan' ? 0.3 : inLiving ? 1 : inHouse && mainFl ? 0.5 : 0.18;
    st.volT += dt; if (st.volT > 0.4) { st.volT = 0; pushVolume(false); }
    if (st.dock) { st.reason = 'docked'; st.visible = false; return; }
    if (mode !== 'walk' && mode !== 'pano') return hide('mode');
    let photo = false; try { photo = !!(window.__tour && window.__tour.pathtraceActive); } catch (_) { }
    if (photo) return hide('photoreal');
    if (!inHouse || !mainFl) return hide('room');
    screen.updateWorldMatrix(true, false);
    cen.set(0, 0, 0).applyMatrix4(screen.matrixWorld);
    nrm.set(0, 0, 1).transformDirection(screen.matrixWorld);
    if (tmp.copy(camP).sub(cen).dot(nrm) <= 0.02) return hide('behind');
    cam.updateMatrixWorld(); // matrixWorldInverse is refreshed by the renderer; recompute here for this frame
    const inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const canvas = E.ctx.renderer && E.ctx.renderer.domElement;
    const rect = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const pts = [];
    let onScreen = false;
    for (const c of corners) {
      tmp.copy(c).applyMatrix4(screen.matrixWorld).applyMatrix4(inv);
      if (tmp.z > -Math.max(0.05, cam.near || 0.05)) return hide('offscreen');
      tmp.applyMatrix4(cam.projectionMatrix);
      if (Math.abs(tmp.x) < 1 && Math.abs(tmp.y) < 1) onScreen = true;
      pts.push([rect.left + (tmp.x + 1) / 2 * rect.width, rect.top + (1 - tmp.y) / 2 * rect.height]);
    }
    // entirely outside the viewport (cheap AABB test) → hide
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    if (!onScreen && (Math.max(...xs) < rect.left || Math.min(...xs) > rect.left + rect.width || Math.max(...ys) < rect.top || Math.min(...ys) > rect.top + rect.height)) return hide('offscreen');
    st.occT -= dt;
    if (st.occT <= 0 || camP.distanceToSquared(occP) > 0.0625) { st.occT = 0.2; occP.copy(camP); st.occluded = occluded(); } // 5 Hz, or at once after a jump (teleport / glide)
    if (st.occluded) return hide('occluded');
    const m = quadMatrix3d(640, 368, pts);
    if (!m) return hide('degenerate');
    if (m !== st.transform) { st.transform = m; dom.box.style.transform = m; }
    if (!st.visible) { dom.box.style.visibility = 'visible'; st.visible = true; }
    st.reason = 'projected';
  });
  return api;
}

// ------------------------------------------------------------------ remote control (frame: centre on the table top, long axis = local x)
export function buildRemote(E, G, F, tv) {
  const b = new Batch(), f = F.withBatch(b);
  const L = 0.19, Wd = 0.048, Hb = 0.017;
  f.box('matte', [L, Hb, Wd], [0, Hb / 2 + 0.0005, 0], 0x0f1012, { r: 0.008, seg: 3 });
  f.box('gloss', [L - 0.022, 0.0012, Wd - 0.01], [0, Hb + 0.0006, 0], 0x17181b, { r: 0.0005 });
  f.box('gloss', [0.006, 0.006, Wd - 0.02], [-L / 2 + 0.002, Hb * 0.55, 0], 0x2a0606, { r: 0.002 }); // IR window
  const top = Hb + 0.0012;
  const btn = (x, z, r, c, h = 0.0028) => f.cyl('plastic', r, r * 1.08, h, [x, top + h / 2, z], c, { seg: 14 });
  btn(-0.074, 0.013, 0.0058, 0xc0262b);                 // power
  btn(-0.074, -0.012, 0.0036, 0x3a3c40);               // input
  // d-pad ring + OK
  f.torus('plastic', 0.0125, 0.0035, [-0.036, top + 0.0018, 0], 0x2b2d31, { rx: PI / 2, ts: 28, rs: 6 });
  btn(-0.036, 0, 0.0062, 0x8e9196, 0.003);
  // number pad 3 × 4
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) btn(0.0 + r * 0.0125, -0.013 + c * 0.013, 0.0037, 0x3d3f44, 0.0024);
  // volume / channel rockers + coloured keys
  f.box('plastic', [0.03, 0.004, 0.009], [0.068, top + 0.002, 0.013], 0x2b2d31, { r: 0.002 });
  f.box('plastic', [0.03, 0.004, 0.009], [0.068, top + 0.002, -0.013], 0x2b2d31, { r: 0.002 });
  [0xc0262b, 0x2f9e44, 0xe8c547, 0x2f6fd8].forEach((c, i) => f.box('plastic', [0.006, 0.0018, 0.007], [0.088, top + 0.0009, -0.0165 + i * 0.011], c, { r: 0.001 }));
  b.build(G, E.M, { name: 'tv-remote' });
  const hit = new THREE.Mesh(new THREE.BoxGeometry(L + 0.06, 0.06, Wd + 0.06), new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'tv-remote-hit';
  F.place(hit, [0, 0.03, 0]); G.add(hit);
  E.interact(hit, () => (tv && tv.on ? 'שלט טלוויזיה · ' + tv.channel.name : 'שלט טלוויזיה · ערוצים חיים'), () => { E.snd.click(hit, 0.4); if (tv) tv.tap(); });
  return hit;
}

// interior-tv.js — living-room TV: wall TV + a black remote on the coffee table + free, official American live
// YouTube channels.
// V12: on ALL devices (phones included) the live YouTube embed is an absolutely positioned <iframe> projected onto
// the TV screen rectangle every frame (4 projected corners → CSS matrix3d homography); it is hidden when the TV is
// off-screen, behind a wall (throttled raycast camera → screen centre), on another floor / outside, or in dollhouse /
// plan / photoreal views (the stream keeps playing, quieter, like a real TV in another room).
// Tapping the TV or the remote turns the TV on with the last channel straight on the 3D screen and shows a COMPACT
// remote bar at the bottom (⏻, CH▼/CH▲, −/🔇/+, "☰ רשימה" → small channel sheet); from far away the camera walks
// smoothly to a sofa-side viewing spot (cancel by moving / looking). Autoplay-gated browsers (iOS, Safari, phones)
// start muted (mute=1&playsinline=1&autoplay=1) with a "🔊 הקש לשמע" chip over the TV that unmutes via the
// YouTube iframe API (postMessage unMute / setVolume).
// Without a DOM (node tests) the TV keeps a pure state machine and the old in-house slideshow.
// NOTE: only official free live channels are listed. Copyrighted shows (e.g. Seinfeld) have no legal free stream and
// are deliberately not embedded or imitated.
import { THREE, PI, Batch } from './interior-lib.js';
import { getRadio } from './radio-engine.js';
import { tr, getLang, extend } from './i18n.js'; // V7: canvas text in the current language

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

// ------------------------------------------------------------------ V12 strings (merged into i18n via extend(); no i18n.js edit)
export const TV_STRINGS = {
  he: { list: 'רשימה', listTitle: 'רשימת ערוצים', sound: '🔊 הקש לשמע', soundAria: 'הקש לשמע', tapVideo: 'הקישו על המסך לשמע ▶',
    closeRemote: 'סגור שלט', closeList: 'סגור רשימה', unmuteAria: 'בטל השתקה', toSofa: 'עובר לספה מול הטלוויזיה · הזיזו כדי לבטל',
    aimOn: 'ערוצי טלוויזיה · {0}', aimOff: 'הדלק טלוויזיה · ערוצים', remoteOn: 'שלט טלוויזיה · {0}', remoteOff: 'שלט טלוויזיה · ערוצים חיים' },
  en: { list: 'List', listTitle: 'Channel list', sound: '🔊 Tap for sound', soundAria: 'Tap for sound', tapVideo: 'Tap the screen for sound ▶',
    closeRemote: 'Close remote', closeList: 'Close list', unmuteAria: 'Unmute', toSofa: 'Moving to the sofa facing the TV · move to cancel',
    aimOn: 'TV channels · {0}', aimOff: 'Turn on TV · channels', remoteOn: 'TV remote · {0}', remoteOff: 'TV remote · live channels' },
  es: { list: 'Lista', listTitle: 'Lista de canales', sound: '🔊 Toca para sonido', soundAria: 'Toca para sonido', tapVideo: 'Toca la pantalla para el sonido ▶',
    closeRemote: 'Cerrar control', closeList: 'Cerrar lista', unmuteAria: 'Activar sonido', toSofa: 'Yendo al sofá frente a la TV · muévete para cancelar',
    aimOn: 'Canales de TV · {0}', aimOff: 'Encender TV · canales', remoteOn: 'Control de la TV · {0}', remoteOff: 'Control de la TV · canales en vivo' },
};
try { extend(TV_STRINGS); } catch (_) { }
const S = TV_STRINGS.he;
// a TV string in the current language (TV_STRINGS key, {0} = a channel name)
const TS = (k, a) => { const L = getLang(); const T = TV_STRINGS[L] || TV_STRINGS.he; return String(T[k] != null ? T[k] : TV_STRINGS.he[k]).replace('{0}', a != null ? a : ''); };

// ------------------------------------------------------------------ DOM: styles + compact remote bar + projected player
// V12: the live channel is projected onto the 3D TV on ALL devices (phones included); the channel UI is a compact
// remote bar docked at the bottom (above the D-pad / room picker), the list is a small sheet above the bar.
const CSS = `
.tv3d-layer{position:fixed;inset:0;pointer-events:none;z-index:4;overflow:hidden}
.tv3d-box{position:absolute;left:0;top:0;width:640px;height:368px;transform-origin:0 0;background:#000;visibility:hidden;will-change:transform;backface-visibility:hidden}
.tv3d-box iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;pointer-events:none}
.tv3d-box.touchable iframe{pointer-events:auto}
.tv3d-card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:linear-gradient(135deg,#0d1420,#1d2a3c);color:#fff;font:600 30px/1.2 system-ui,-apple-system,"Segoe UI",Arial,sans-serif;text-align:center;transition:opacity .6s ease;pointer-events:none}
.tv3d-card small{font-size:19px;font-weight:500;opacity:.8}
.tv3d-card .ch{position:absolute;top:16px;left:20px;font:700 20px monospace;opacity:.75}
.tv3d-card .live{position:absolute;top:14px;right:18px;background:#d7263d;border-radius:4px;padding:3px 10px;font-size:16px}
.tv3d-card.gone{opacity:0}
.tv3d-box.dock{position:fixed;left:50%;top:auto;bottom:var(--tvdock-b,calc(84px + env(safe-area-inset-bottom,0px)));width:min(92vw,560px);height:auto;aspect-ratio:16/9;transform:translateX(-50%)!important;visibility:visible;pointer-events:auto;z-index:31;border-radius:12px;overflow:visible;box-shadow:0 14px 40px rgba(0,0,0,.55)}
.tv3d-box.dock iframe{pointer-events:auto;border-radius:12px}
.tv3d-box.dock .tv3d-card{border-radius:12px}
.tv3d-undock{display:none}
.tv3d-box.dock .tv3d-undock{display:flex;position:absolute;top:-38px;left:0;gap:6px}
.tv3d-undock button{background:rgba(12,16,24,.86);border:1px solid rgba(255,255,255,.22);color:#eef3f8;border-radius:9px;padding:6px 11px;font:600 13px system-ui,sans-serif;cursor:pointer}
.tv3d-sound{position:absolute;left:0;top:0;transform:translate(-50%,-100%);display:none;pointer-events:auto;white-space:nowrap;padding:7px 13px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(10,14,22,.82);color:#fff;font:700 13.5px system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.45);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.tv3d-sound.show{display:block}
.tv3d-sound.pulse{animation:tvpulse 1.6s ease-in-out infinite}
@keyframes tvpulse{50%{box-shadow:0 0 0 6px rgba(67,224,255,.25),0 6px 18px rgba(0,0,0,.45)}}
#tvPanel{left:0;right:0;margin-inline:auto;bottom:var(--tvbar-b,calc(16px + env(safe-area-inset-bottom,0px)));width:min(470px,calc(100vw - 32px));display:none;flex-direction:column;gap:6px;z-index:30;direction:rtl;pointer-events:none}
#tvPanel.open{display:flex}
#tvPanel>*{pointer-events:auto}
#tvPanel .tvp-bar{direction:ltr;display:flex;align-items:center;gap:4px;padding:5px;border-radius:16px;background:linear-gradient(180deg,rgba(23,24,27,.92),rgba(12,13,15,.92));border:1px solid rgba(255,255,255,.1)}
#tvPanel .tvp-bar button{flex:0 0 auto;min-width:34px;height:36px;padding:0 6px;border-radius:10px;background:#26282d;color:#e8ecf2;font-size:13.5px;font-weight:700;box-shadow:inset 0 -2px 0 rgba(0,0,0,.45);touch-action:manipulation}
#tvPanel .tvp-bar button:active{transform:translateY(1px)}
#tvPanel .tvp-bar .pw{background:#a3222a;color:#fff}
#tvPanel .tvp-bar .pw.on{background:#2e7d4f}
#tvPanel .tvp-bar .mu.need{background:#1f6f8b;color:#fff}
#tvPanel .tvp-bar .ls{direction:rtl;padding:0 9px}
#tvPanel .tvp-bar .ls.on{background:rgba(67,224,255,.28)}
#tvPanel .tvp-now{flex:1 1 auto;min-width:0;font-size:11.5px;color:#cfd6df;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
#tvPanel .tvp-x{min-width:30px!important;background:rgba(255,255,255,.08)!important}
@media (max-width:420px){#tvPanel .tvp-now{display:none}#tvPanel .tvp-bar{justify-content:space-between;gap:3px;padding:4px}#tvPanel .tvp-bar button{min-width:30px;padding:0 4px;font-size:12.5px}#tvPanel .tvp-bar .ls{padding:0 6px}#tvPanel .tvp-x{min-width:26px!important}}
/* the centre aim label (TV_STRINGS.aimOn / aimOff, "TV channels · …") would sit on the playing picture: hidden while the TV is watched */
body.tv-aim #hoverLabel{display:none!important}
#tvPanel .tvp-sheet{display:none;flex-direction:column;gap:6px;padding:8px;max-height:min(36vh,290px);border-radius:16px}
#tvPanel.list .tvp-sheet{display:flex}
#tvPanel .tvp-head{display:flex;align-items:center;gap:8px}
#tvPanel .tvp-head b{flex:1;font-size:14px}
#tvPanel .tvp-lx{width:30px;height:30px;border-radius:9px;background:rgba(255,255,255,.08);font-size:14px}
#tvPanel .tvp-list{overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:4px;min-height:60px}
#tvPanel .tvp-list button{display:flex;align-items:center;gap:9px;padding:6px 9px;border-radius:10px;text-align:right;background:rgba(255,255,255,.04)}
#tvPanel .tvp-list button.on{background:rgba(67,224,255,.18);box-shadow:inset 0 0 0 1px rgba(67,224,255,.55)}
#tvPanel .tvp-list .n{font:700 12px monospace;opacity:.7;width:24px;text-align:center;direction:ltr}
#tvPanel .tvp-list .t{display:flex;flex-direction:column;min-width:0}
#tvPanel .tvp-list .t b{font-size:13px;direction:ltr;text-align:right}
#tvPanel .tvp-list .t span{font-size:11.5px;color:var(--muted,#aab)}
#tvPanel .tvp-foot{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11px;color:var(--muted,#aab)}
#tvPanel .tvp-foot button,#tvPanel .tvp-foot a{padding:5px 9px;border-radius:9px;background:rgba(255,255,255,.08);color:var(--text,#eef);font-size:12px;text-decoration:none}
#tvPanel .tvp-note{flex-basis:100%;line-height:1.35}
`;

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
// bottom-docked controls the bar must sit above (phones: D-pad, "פעולה", room picker; desktop: room picker / chips)
const BOTTOM_UI = '#dpad,#btnAct,#roomPicker,#floorChips,#panoUI';

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
  // V12: browsers that only autoplay a cross-origin YouTube embed MUTED (iOS / iPadOS, Safari, phones): start muted
  // and show "🔊 הקש לשמע"; desktop Chrome / Edge / Firefox start with sound (the tap's user activation is enough).
  const soundGate = (() => {
    if (!hasDOM) return false;
    try {
      const ua = navigator.userAgent || '';
      const ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      const safari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|Android/.test(ua);
      return coarse || ios || safari;
    } catch (_) { return coarse; }
  })();
  const st = { on: false, idx: 1, t: 0, vol: 70, muted: false, panel: false, list: false, dock: false, loaded: false, loadT: 0, ducked: false,
    visible: false, reason: 'off', transform: '', occluded: false, occT: 0, volSent: -1, volT: 0, att: 1,
    autoMuted: false, unlocked: false, needTap: false, yt: null, chk: 0, barT: 0, barB: -1, touchable: false, chipKey: '', framing: false, lastFrame: null };
  const ch = () => TV_CHANNELS[st.idx];
  const live = () => st.on && !!ch().yt;
  let dom = null;

  // ---- radio ducking (V7: the shared radio engine's real duck(on); the user's radio volume is never touched)
  const duck = (on) => {
    on = !!on; if (on === st.ducked) return; st.ducked = on;
    try { const R = getRadio() || (typeof window !== 'undefined' && window.__tour && window.__tour.radio) || null; if (R && typeof R.duck === 'function') R.duck(on); } catch (_) { }
  };
  if (hasDOM) { try { window.addEventListener('pagehide', () => duck(false)); } catch (_) { } }

  const postRaw = (obj) => { try { const w = dom && dom.ifr && dom.ifr.contentWindow; if (w) w.postMessage(JSON.stringify(obj), '*'); } catch (_) { } };
  const post = (func, args) => postRaw({ event: 'command', func, args: args || [] });
  const pushVolume = (force) => {
    if (!dom || !dom.ifr) return;
    const silent = st.muted || st.autoMuted;
    const v = silent ? 0 : Math.round(st.vol * st.att);
    if (!force && v === st.volSent) return;
    st.volSent = v;
    if (silent) post('mute'); else { post('unMute'); post('setVolume', [v]); }
  };
  // YouTube iframe API events (onReady / infoDelivery {muted, volume, playerState}) after the 'listening' handshake
  if (hasDOM) {
    try {
      window.addEventListener('message', (ev) => {
        if (!dom || !dom.ifr || ev.source !== dom.ifr.contentWindow) return;
        if (ev.origin && !/youtube(-nocookie)?\.com$/.test(String(ev.origin).replace(/:\d+$/, ''))) return;
        let d = ev.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { return; } }
        if (!d || typeof d !== 'object') return;
        if (d.info && typeof d.info === 'object') st.yt = Object.assign(st.yt || {}, d.info);
        else if (d.event === 'onReady') st.yt = st.yt || {};
      });
    } catch (_) { }
  }

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
      // "🔊 הקש לשמע" chip, drawn over the TV (screen space, not warped, so it stays readable at any distance)
      const chip = el('button', 'tv3d-sound'); chip.type = 'button'; chip.id = 'tvSound'; chip.textContent = S.sound; chip.dataset.src = S.sound; chip.setAttribute('aria-label', S.soundAria);
      chip.addEventListener('click', (ev) => { ev.stopPropagation(); api.unmute(); });
      for (const t of ['pointerdown', 'touchstart', 'mousedown']) chip.addEventListener(t, (ev) => ev.stopPropagation(), { passive: true });
      layer.appendChild(chip);
      const stage = document.getElementById('stage');
      (stage && stage.parentNode ? stage.parentNode : document.body).insertBefore(layer, stage ? stage.nextSibling : null);
      // compact remote bar (+ the channel list as a small sheet above it)
      const p = el('div', 'ui'); p.id = 'tvPanel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'שלט טלוויזיה');
      p.innerHTML = '<div class="tvp-sheet glass"><div class="tvp-head"><b>📺 רשימת ערוצים</b><button type="button" class="tvp-lx" aria-label="סגור רשימה">✕</button></div>' +
        '<div class="tvp-list"></div>' +
        '<div class="tvp-foot"><button type="button" data-k="dock"></button><a target="_blank" rel="noopener" class="yt">YouTube ↗</a>' +
        '<span class="tvp-note">שידורים חיים רשמיים וחינמיים מ-YouTube. אם ערוץ לא משדר כרגע — נסו ערוץ אחר.</span></div></div>' +
        '<div class="tvp-bar tvp-remote">' +
        '<button type="button" class="pw" data-k="pw" aria-label="הפעלה / כיבוי">⏻</button>' +
        '<button type="button" data-k="chd" aria-label="ערוץ קודם">CH▼</button>' +
        '<span class="tvp-now"></span>' +
        '<button type="button" data-k="chu" aria-label="ערוץ הבא">CH▲</button>' +
        '<button type="button" data-k="vd" aria-label="הנמך">−</button>' +
        '<button type="button" class="mu" data-k="mu" aria-label="השתק">🔇</button>' +
        '<button type="button" data-k="vu" aria-label="הגבר">+</button>' +
        '<button type="button" class="ls" data-k="ls" aria-label="רשימת ערוצים">☰ רשימה</button>' +
        '<button type="button" class="tvp-x" aria-label="סגור שלט">✕</button></div>';
      document.body.appendChild(p);
      const list = p.querySelector('.tvp-list');
      TV_CHANNELS.forEach((c, i) => {
        const b = el('button', '', `<span class="n">${i}</span><span class="t"><b></b><span></span></span>`); b.type = 'button';
        b.querySelector('b').textContent = c.name; b.querySelector('.t span').textContent = c.he;
        b.dataset.i = String(i);
        b.addEventListener('click', () => { api.set(i); api.closeList(); });
        list.appendChild(b);
      });
      p.querySelector('.tvp-x').addEventListener('click', () => api.closePanel());
      p.querySelector('.tvp-lx').addEventListener('click', () => api.closeList());
      p.addEventListener('click', (ev) => {
        const k = ev.target && ev.target.closest && ev.target.closest('[data-k]'); if (!k) return;
        ({ pw: () => api.power(), chu: () => api.next(), chd: () => api.prev(), vu: () => api.volUp(), vd: () => api.volDown(), mu: () => api.mute(), ls: () => api.toggleList(), dock: () => api.dock(!st.dock) })[k.dataset.k]?.();
      });
      // keep key presses / touches inside the remote from driving the walk / look controls
      p.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { if (st.list) api.closeList(); else api.closePanel(); } ev.stopPropagation(); });
      window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && st.panel) { if (st.list) api.closeList(); else api.closePanel(); } });
      window.addEventListener('resize', () => { st.barB = -1; placeBar(true); });
      dom = { layer, box, card, panel: p, list, chip, ifr: null };
    } catch (e) { console.warn('[interior] tv dom', e); dom = null; }
    return dom;
  }

  // the bar sits just above whatever bottom-docked controls are visible (D-pad, "פעולה", room picker …)
  function placeBar(force) {
    if (!dom || !st.panel) return;
    let lift = 0;
    try {
      const H = innerHeight;
      for (const e of document.querySelectorAll(BOTTOM_UI)) {
        const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.top < H * 0.5 || r.top > H) continue;
        lift = Math.max(lift, H - r.top);
      }
    } catch (_) { }
    const b = Math.round(lift > 0 ? lift + 8 : 16);
    if (!force && b === st.barB) return;
    st.barB = b;
    const v = b + 'px';
    dom.panel.style.setProperty('--tvbar-b', lift > 0 ? v : 'calc(16px + env(safe-area-inset-bottom,0px))');
    // a docked player (optional "נגן גדול") goes above the bar
    try { const h = dom.panel.getBoundingClientRect().height || 46; dom.box.style.setProperty('--tvdock-b', (b + h + 10) + 'px'); } catch (_) { }
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
    clearTimeout(st.chk);
    if (!dom || !dom.ifr) return;
    try { dom.ifr.src = 'about:blank'; } catch (_) { }
    try { dom.ifr.remove(); } catch (_) { }
    dom.ifr = null; st.loaded = false; st.volSent = -1; st.yt = null;
  }
  function loadPlayer(o = {}) {
    if (!ensureDom()) return;
    killPlayer();
    const c = ch();
    setCard(c.name, 'טוען שידור חי… · ' + c.he);
    // V12: on autoplay-gated browsers every (re)load starts muted so the stream autoplays on the TV; after the first
    // "הקש לשמע" tap we try to keep sound (unMute after load; if the player refuses, it goes back to muted + chip)
    st.autoMuted = soundGate && !o.sound;
    st.needTap = false;
    const f2 = document.createElement('iframe');
    f2.title = c.name + ' — YouTube live';
    f2.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f2.setAttribute('playsinline', '');
    f2.referrerPolicy = 'strict-origin-when-cross-origin';
    let origin = ''; try { origin = location.origin && location.origin.startsWith('http') ? location.origin : ''; } catch (_) { }
    f2.src = embedUrl(c, { mute: st.autoMuted, origin });
    f2.dataset.ch = c.id;
    f2.addEventListener('load', () => {
      st.loaded = true; st.loadT = 0;
      if (!dom || dom.ifr !== f2) return;
      postRaw({ event: 'listening', id: 'tv3d', channel: 'widget' });
      setTimeout(() => {
        if (!dom || dom.ifr !== f2) return;
        dom.card.classList.add('gone'); postRaw({ event: 'listening', id: 'tv3d', channel: 'widget' });
        pushVolume(true); post('playVideo');
        if (st.autoMuted && st.unlocked) tryUnmute(f2, false); // sound was unlocked on an earlier channel
      }, 1200);
      setTimeout(() => { if (dom && dom.ifr === f2) pushVolume(true); }, 3000);
      syncAll();
    });
    dom.box.insertBefore(f2, dom.card);
    dom.ifr = f2;
  }
  // ask the player for sound; 1.6 s later check what it reports. iOS may refuse (stays muted or pauses) → back to
  // muted autoplay + the chip asks for a tap on the video itself (the iframe is touchable then). If the player never
  // answers (API blocked), reload the channel with mute=0 inside the user's tap.
  function tryUnmute(f2, fromTap) {
    st.autoMuted = false; st.muted = false; st.needTap = false;
    pushVolume(true); post('playVideo');
    clearTimeout(st.chk);
    st.chk = setTimeout(() => {
      if (!dom || dom.ifr !== f2 || !st.on) return;
      const y = st.yt;
      if (!y) { if (fromTap) { loadPlayer({ sound: true }); syncAll(); } return; }
      const refused = y.muted === true || (y.playerState !== undefined && y.playerState !== 1 && y.playerState !== 3 && y.playerState !== -1);
      if (refused) { st.autoMuted = true; pushVolume(true); post('playVideo'); st.needTap = !!fromTap; }
      syncAll();
    }, 1600);
    syncAll();
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
    p.classList.toggle('open', st.panel);
    p.classList.toggle('list', st.panel && st.list);
    p.querySelector('.tvp-now').textContent = st.on ? `CH ${st.idx} · ${c.name}` : 'כבויה';
    const pw = p.querySelector('.pw'); pw.classList.toggle('on', st.on);
    const mu = p.querySelector('[data-k="mu"]');
    const need = live() && st.autoMuted;
    mu.textContent = need ? '🔊' : (st.muted ? '🔈' : '🔇');
    mu.classList.toggle('need', need);
    mu.setAttribute('aria-label', need ? 'בטל השתקה' : 'השתק');
    p.querySelector('.ls').classList.toggle('on', st.list);
    for (const b of dom.list.children) b.classList.toggle('on', st.on && +b.dataset.i === st.idx);
    const d = p.querySelector('[data-k="dock"]');
    d.textContent = st.dock ? 'הצג על הטלוויזיה' : 'נגן גדול ▶';
    d.style.display = !c.yt ? 'none' : '';
    const yt = p.querySelector('.yt');
    if (c.yt) { yt.href = watchUrl(c); yt.style.display = ''; } else yt.style.display = 'none';
  }
  function syncChip() {
    if (!dom) return;
    const show = live() && (st.autoMuted || st.needTap) && (st.visible || st.dock);
    const text = st.needTap ? S.tapVideo : S.sound;
    if (dom.chip.dataset.src !== text) { dom.chip.textContent = text; dom.chip.dataset.src = text; }
    dom.chip.classList.toggle('show', show);
    dom.chip.classList.toggle('pulse', show && !st.needTap);
    // the projected iframe takes touches (YouTube's own controls) only while the remote is open or a tap on the video is
    // needed; otherwise touches fall through to the 3D view (look-drag / walk / tap the TV)
    const touch = live() && !st.dock && (st.needTap || (st.panel && !st.list));
    if (touch !== st.touchable) { st.touchable = touch; dom.box.classList.toggle('touchable', touch); }
  }
  function syncAll() { syncPanel(); syncChip(); }
  function refresh() {
    applyScreen();
    if (live()) {
      if (!dom || !dom.ifr || dom.ifr.dataset.ch !== ch().id) loadPlayer();
      if (dom) dom.box.classList.toggle('dock', st.dock);
    } else { killPlayer(); if (dom) { dom.box.classList.remove('dock'); dom.box.style.visibility = 'hidden'; } st.visible = false; st.autoMuted = false; st.needTap = false; }
    duck(live());
    syncAll();
  }

  // ---- V12: "good view" test + optional smooth walk to the sofa-side viewing spot (cancellable: any move / look)
  const nav = () => { try { return (typeof window !== 'undefined' && window.__tour && window.__tour.nav) || ctx.nav || null; } catch (_) { return null; } };
  function viewSpot() {
    screen.updateWorldMatrix(true, false);
    const c = new THREE.Vector3().applyMatrix4(screen.matrixWorld);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(screen.matrixWorld);
    const r = new THREE.Vector3(1, 0, 0).transformDirection(screen.matrixWorld);
    // 2.2 m out from the screen, 0.8 m to the side away from the coffee table / lounge chair (the smaller-z side)
    const a = c.clone().addScaledVector(n, 2.2).addScaledVector(r, 0.8), b = c.clone().addScaledVector(n, 2.2).addScaledVector(r, -0.8);
    const s = a.z < b.z ? a : b;
    return { x: s.x, y: E.plan.mainFloor, z: s.z, yaw: Math.atan2(-(c.x - s.x), -(c.z - s.z)) };
  }
  function goodView() {
    const cam = E.ctx.camera; if (!cam) return true;
    let mode = ''; try { mode = E.ctx.mode || ''; } catch (_) { }
    if (mode !== 'walk') return true; // only walk mode moves the camera
    cam.getWorldPosition(camP); cam.updateMatrixWorld();
    const inHouse = camP.x > 0 && camP.x < P.W && camP.z > 0 && camP.z < P.D;
    const mainFl = camP.y > F0 - 0.2 && camP.y < P.mainCeil + 0.1;
    if (!inHouse || !mainFl) return true; // other floors / outside: no automatic walk
    screen.updateWorldMatrix(true, false);
    cen.set(0, 0, 0).applyMatrix4(screen.matrixWorld);
    nrm.set(0, 0, 1).transformDirection(screen.matrixWorld);
    const d = camP.distanceTo(cen);
    if (d > 4.6 || tmp.copy(camP).sub(cen).dot(nrm) < 0.4) return false;
    tmp.copy(cen).applyMatrix4(cam.matrixWorldInverse.copy(cam.matrixWorld).invert());
    if (tmp.z > -0.1) return false;
    tmp.applyMatrix4(cam.projectionMatrix);
    if (Math.abs(tmp.x) > 0.75 || Math.abs(tmp.y) > 0.75) return false;
    return !occluded();
  }
  function frameTV() {
    const N = nav(); if (!N || typeof N.walkTo !== 'function') return false;
    let good = true; try { good = goodView(); } catch (_) { }
    if (good) return false;
    const s = viewSpot(); st.lastFrame = s;
    let okk = false;
    try { okk = !!N.walkTo({ x: s.x, y: s.y, z: s.z }, { key: 'tv', label: 'טלוויזיה', arriveYaw: s.yaw, onEnd: () => { st.framing = false; } }); } catch (_) { okk = false; }
    st.framing = okk;
    if (okk) { try { E.ctx.toast && E.ctx.toast(tr(S.toSofa), 2600); } catch (_) { } }
    return okk;
  }
  const stopFraming = () => { try { const N = nav(); if (st.framing && N && N.glideKey === 'tv') N.stopGlide(); } catch (_) { } st.framing = false; };

  const api = {
    channels: TV_CHANNELS,
    get on() { return st.on; }, get idx() { return st.idx; }, get channel() { return ch(); }, get volume() { return st.vol; }, get muted() { return st.muted; },
    get panelOpen() { return st.panel; }, get listOpen() { return st.list; }, get docked() { return st.dock; }, get hasDOM() { return hasDOM; },
    get autoMuted() { return st.autoMuted; }, get soundGate() { return soundGate; }, get framing() { return st.framing; }, get lastFrame() { return st.lastFrame; },
    get view() { return { visible: st.visible, reason: st.reason, transform: st.transform, docked: st.dock, loaded: st.loaded, src: dom && dom.ifr ? dom.ifr.src : '', att: st.att, volSent: st.volSent, autoMuted: st.autoMuted, needTap: st.needTap, touchable: st.touchable, yt: st.yt }; },
    power(on) {
      const next = on === undefined ? !st.on : !!on;
      if (next === st.on) return api;
      st.on = next; st.t = 0; E.snd.click(screen, 0.6);
      if (st.on) { E.snd.tone(screen, { freq: 15600, dur: 0.4, vol: 0.01 }); E.snd.tone(screen, { freq: 523, dur: 0.25, vol: 0.06, delay: 0.1 }); E.snd.tone(screen, { freq: 784, dur: 0.35, vol: 0.06, delay: 0.3 }); }
      else { stopFraming(); st.list = false; }
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
    volUp() { st.vol = Math.min(100, st.vol + 10); st.muted = false; if (st.autoMuted && live()) return api.unmute(); pushVolume(true); syncAll(); return api; },
    volDown() { st.vol = Math.max(0, st.vol - 10); pushVolume(true); syncAll(); return api; },
    mute(v) {
      if (st.autoMuted && live() && v !== true) return api.unmute(); // the mute key doubles as "הקש לשמע"
      st.muted = v === undefined ? !st.muted : !!v; pushVolume(true); syncAll(); return api;
    },
    /** V12: "🔊 הקש לשמע" — the user's tap: unMute + setVolume via the YouTube iframe API (postMessage) */
    unmute() { st.unlocked = true; if (dom && dom.ifr && live()) tryUnmute(dom.ifr, true); else { st.autoMuted = false; st.muted = false; syncAll(); } return api; },
    dock(v) { st.dock = !!v; if (dom) dom.box.classList.toggle('dock', st.dock && live()); placeBar(true); syncAll(); return api; },
    openPanel() { if (!ensureDom()) return false; st.panel = true; syncAll(); placeBar(true); return true; },
    closePanel() { st.panel = false; st.list = false; if (dom) syncAll(); return api; },
    openList() { if (!api.openPanel()) return false; st.list = true; syncAll(); try { const b = dom.list.querySelector('button.on'); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' }); } catch (_) { } return true; },
    closeList() { st.list = false; if (dom) syncAll(); return api; },
    toggleList() { return st.list ? api.closeList() : api.openList(); },
    /** walk to the sofa-side viewing spot when the TV is not in a good view (no-op otherwise / without nav) */
    frame() { return frameTV(); },
    /** remote / TV tap: TV on with the last channel straight on the 3D screen + the compact remote bar
     *  (tap again = hide the bar, the TV keeps playing); headless: toggle power */
    tap() {
      if (!hasDOM) { api.power(); return api; }
      if (!st.on) { api.power(true); api.openPanel(); frameTV(); return api; }
      if (st.panel) api.closePanel(); else { api.openPanel(); if (!st.visible && !st.dock) frameTV(); }
      return api;
    },
    screen,
  };
  try { ctx.tv = api; } catch (_) { }
  try { if (typeof window !== 'undefined') { window.__tourTV = api; if (window.__tour) window.__tour.tv = api; } } catch (_) { }

  E.interact(screen, () => (st.on ? TS('aimOn', ch().name) : TS('aimOff')), () => api.tap());

  // ---- per frame: screen canvas + projected player
  const corners = [new THREE.Vector3(-SW / 2, SH / 2, 0), new THREE.Vector3(SW / 2, SH / 2, 0), new THREE.Vector3(SW / 2, -SH / 2, 0), new THREE.Vector3(-SW / 2, -SH / 2, 0)];
  const tmp = new THREE.Vector3(), cen = new THREE.Vector3(), nrm = new THREE.Vector3(), camP = new THREE.Vector3(), occP = new THREE.Vector3(1e9, 0, 0);
  let ray = null, occTargets = null;
  const P = E.plan, F0 = P.mainFloor;
  let aimOn = false;
  const aim = (v) => { if (v === aimOn || !hasDOM) return; aimOn = v; try { document.body.classList.toggle('tv-aim', v); } catch (_) { } };
  const hide = (reason) => { st.reason = reason; if (st.visible && dom) dom.box.style.visibility = 'hidden'; st.visible = false; aim(false); syncChip(); };
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
    if (!st.on) { aim(false); return; }
    st.t += dt;
    if (draw(drawArgs())) tex.needsUpdate = true;
    if (st.panel) { st.barT -= dt; if (st.barT <= 0) { st.barT = 0.5; placeBar(false); } }
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
    if (st.dock) { st.reason = 'docked'; st.visible = false; aim(false); syncChip(); positionChip(null); return; }
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
    if (!st.visible) { dom.box.style.visibility = 'visible'; st.visible = true; syncChip(); }
    st.reason = 'projected';
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    aim(coarse && live() && Math.min(...xs) < cx && Math.max(...xs) > cx && Math.min(...ys) < cy && Math.max(...ys) > cy);
    positionChip(pts);
  });
  // chip: bottom-centre of the projected screen (screen space)
  function positionChip(pts) {
    if (!dom || !dom.chip.classList.contains('show')) return;
    let x, y;
    if (pts) {
      x = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
      const top = Math.min(pts[0][1], pts[1][1]), bot = Math.max(pts[2][1], pts[3][1]);
      y = bot - Math.max(8, (bot - top) * 0.1);
      x = Math.max(80, Math.min(innerWidth - 80, x)); y = Math.max(50, Math.min(innerHeight - 10, y));
    } else {
      try { const r = dom.box.getBoundingClientRect(); x = r.left + r.width / 2; y = r.bottom - 12; } catch (_) { return; }
    }
    const k = Math.round(x) + ',' + Math.round(y);
    if (k !== st.chipKey) { st.chipKey = k; dom.chip.style.left = Math.round(x) + 'px'; dom.chip.style.top = Math.round(y) + 'px'; }
  }
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
  E.interact(hit, () => (tv && tv.on ? TS('remoteOn', tv.channel.name) : TS('remoteOff')), () => { E.snd.click(hit, 0.4); if (tv) tv.tap(); });
  return hit;
}

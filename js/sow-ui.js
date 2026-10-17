// sow-ui.js — V11 UI for "📋 שיפוץ לפי האקסל" (js/sow.js does the 3D work):
//  · a segment "📋 אקסל" in the V12 quick-button row under the mode bar (#quickFab, after 🎨 — gallery.js places the
//    row clear of every other control). Tap = SOW mode on / off. While on, it is green with a
//    small ✓ (the "מצב: שיפוץ לפי האקסל · $59,000" info is in its title / aria-label and the panel header) and a
//    second segment "🧾 פירוט" opens the panel.
//  · the panel (#sowPanel): every budgeted line item with its USD amount, the $59,000 total and the "not in scope
//    (stays as-is)" list; tapping a line walks to the room (room picker walk) and highlights its object. Sticky ✕.
//  · before / after (#sowBA): the real walkthrough-video frame of the room (renders/before/<room>.jpg) vs the SOW render
//    of the same room (renders/sow/<room>.jpg, re-projected to the same portrait framing), drag slider + toggle.
//    Opened from the panel, from a room-picker chip long-press (SOW mode) and from the renders viewer (SOW style).
// All user-visible strings are Hebrew here and translated by i18n.js (DICT). No side effects at import.
const BA_ROOMS = ['living', 'kitchen', 'bath1', 'bed1', 'bed3', 'bath2', 'street'];
const ROOM_HE = { living: 'סלון', kitchen: 'מטבח', bath1: 'חדר רחצה 1', bed1: 'חדר שינה 1', bed3: 'חדר שינה 3', bath2: 'חדר רחצה 2', street: 'חזית ורחוב' };
// picker key → before / after room (rooms without a video frame map to the nearest one)
const BA_MAP = { living: 'living', kitchen: 'kitchen', bath1: 'bath1', bed1: 'bed1', bed2: 'bed1', hall: 'living', bed3: 'bed3', bed4: 'bed3', landing: 'bed3', bath2: 'bath2', street: 'street', frontyard: 'street', backyard: 'street', basement: 'living', limo: 'street' };
// how the SOW panorama is framed to match the video frame (radians relative to the panorama centre = the 360 node's
// framed direction; vertical field of view in degrees). Tuned against renders/before/*.jpg.
export const BA_VIEW = {
  living: { yaw: 0.05, pitch: -0.1, vfov: 108 }, kitchen: { yaw: -0.39, pitch: -0.12, vfov: 100 }, bath1: { yaw: 0.5, pitch: -0.2, vfov: 105 },
  bed1: { yaw: -0.346, pitch: 0.1, vfov: 105 }, bed3: { yaw: 0, pitch: -0.05, vfov: 105 }, bath2: { yaw: -0.5, pitch: -0.12, vfov: 108 }, street: { yaw: 0.25, pitch: -0.05, vfov: 70 },
};
const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');

const CSS = `
#quickFab>#btnSowFab{color:#fff6e3}
body.sow-on #quickFab>#btnSowFab{background:linear-gradient(180deg,#7cf3c8,#3fcf9e);color:#05261b;border-color:rgba(255,255,255,.45);box-shadow:0 3px 12px rgba(63,207,158,.35)}
body.sow-on #quickFab>#btnSowFab .qf-chk{display:inline}
body.sow-on #quickFab>#btnStyleFab{display:none}
body.sow-busy #quickFab>#btnSowFab{opacity:.7;cursor:progress}
#quickFab>#btnSowPanel{display:none;color:#bff8e4}
body.sow-on #quickFab>#btnSowPanel{display:flex}
#sowPanel{position:fixed;inset:0;z-index:58;display:none;align-items:flex-end;justify-content:center;background:rgba(4,8,14,.45)}
#sowPanel.show{display:flex}
#sowPanel .sp-card{position:relative;width:min(560px,100vw);max-height:min(86vh,860px);overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:#0f1520;color:#eef3f8;border-radius:18px 18px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.5);padding:0 0 calc(14px + env(safe-area-inset-bottom,0px))}
@media (min-width:901px){#sowPanel{align-items:center}#sowPanel .sp-card{border-radius:18px}}
#sowPanel .sp-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:14px 16px 10px;background:#0f1520;border-bottom:1px solid rgba(255,255,255,.08)}
#sowPanel .sp-head .sp-tt{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
#sowPanel .sp-head b{font-size:17px}
#sowPanel .sp-head .sp-mode{font-size:12.5px;font-weight:700;color:#7cf3c8}
#sowPanel .sp-x{flex:0 0 auto;width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font-size:20px;cursor:pointer}
#sowPanel .sp-sub{padding:8px 16px 4px;font-size:13px;color:#b9c6d4;line-height:1.4}
#sowPanel .sp-list{list-style:none;margin:0;padding:4px 10px}
#sowPanel .sp-item{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:8px 10px;margin:3px 0;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:inherit;font:inherit;font-size:14px;text-align:start;cursor:pointer}
#sowPanel .sp-item:hover{background:rgba(67,224,255,.1)}
#sowPanel .sp-item .nm{flex:1;line-height:1.3}
#sowPanel .sp-item .am{font-weight:800;color:#ffd58a;font-variant-numeric:tabular-nums;direction:ltr}
#sowPanel .sp-item .go{opacity:.6;font-size:13px}
#sowPanel .sp-total{display:flex;justify-content:space-between;margin:8px 16px 4px;padding:10px 12px;border-radius:12px;background:rgba(124,243,200,.12);border:1px solid rgba(124,243,200,.45);font-weight:800;font-size:15px}
#sowPanel .sp-total .am{direction:ltr;color:#7cf3c8}
#sowPanel h4{margin:14px 16px 6px;font-size:14px;color:#ffd58a}
#sowPanel .sp-out{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px}
#sowPanel .sp-out span{padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);font-size:12.5px}
#sowPanel .sp-ba{display:block;margin:14px 16px 0;width:calc(100% - 32px);min-height:46px;border-radius:12px;border:1px solid rgba(255,214,140,.7);background:rgba(255,214,140,.14);color:#ffe2ad;font:700 14px/1.2 inherit;font-family:inherit;cursor:pointer}
#sowBA{position:fixed;inset:0;z-index:61;display:none;flex-direction:column;background:#06090e;color:#eef3f8}
#sowBA.show{display:flex}
#sowBA .ba-top{position:relative;flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top,0px)) 70px 8px 14px;min-height:50px}
body.ltr #sowBA .ba-top{padding:calc(10px + env(safe-area-inset-top,0px)) 70px 8px 14px}
#sowBA .ba-top b{font-size:16px}
#sowBA .ba-x{position:fixed;top:calc(8px + env(safe-area-inset-top,0px));right:calc(10px + env(safe-area-inset-right,0px));z-index:3;width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(20,26,36,.9);color:#fff;font-size:20px;cursor:pointer}
#sowBA .ba-stage{position:relative;flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;padding:4px 10px}
#sowBA .ba-frame{position:relative;height:100%;max-width:100%;aspect-ratio:9/16;border-radius:14px;overflow:hidden;background:#111;touch-action:none;user-select:none;-webkit-user-select:none;cursor:ew-resize}
#sowBA .ba-frame canvas,#sowBA .ba-frame img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
#sowBA .ba-before{clip-path:inset(0 calc(100% - var(--ba,50%)) 0 0)}
#sowBA .ba-line{position:absolute;top:0;bottom:0;left:var(--ba,50%);width:3px;margin-left:-1.5px;background:#fff;box-shadow:0 0 8px rgba(0,0,0,.6);pointer-events:none}
#sowBA .ba-knob{position:absolute;top:50%;left:var(--ba,50%);width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:#fff;color:#111;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 14px rgba(0,0,0,.5);pointer-events:none}
#sowBA .ba-lab{position:absolute;top:10px;padding:4px 9px;border-radius:8px;background:rgba(0,0,0,.6);font-size:12.5px;font-weight:700;pointer-events:none}
#sowBA .ba-lab.l{left:10px}#sowBA .ba-lab.r{right:10px;background:rgba(63,207,158,.85);color:#05261b}
#sowBA .ba-msg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:10px 14px;border-radius:10px;background:rgba(0,0,0,.65);font-size:13px;display:none;text-align:center;max-width:80%}
#sowBA .ba-msg.on{display:block}
#sowBA .ba-bot{flex:0 0 auto;display:flex;flex-direction:column;gap:8px;padding:8px 10px calc(10px + env(safe-area-inset-bottom,0px))}
#sowBA .ba-rooms{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
#sowBA .ba-chip{min-height:38px;padding:4px 11px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:inherit;font:600 12.5px/1.2 inherit;font-family:inherit;cursor:pointer}
#sowBA .ba-chip.on{background:rgba(67,224,255,.2);border-color:rgba(67,224,255,.8)}
#sowBA .ba-tg{align-self:center;min-height:44px;padding:0 18px;border-radius:999px;border:0;background:linear-gradient(180deg,#ffe4ad,#efb45a);color:#2a1a04;font:800 14px/1 inherit;font-family:inherit;cursor:pointer}
`;

export function installSowUI() {
  if (typeof document === 'undefined') return null;
  if (window.__sowUI) return window.__sowUI;
  const tour = () => window.__tour || null;
  const sow = () => { const t = tour(); return t && t.sow ? t.sow : null; };
  const st = document.createElement('style'); st.id = 'sow-css'; st.textContent = CSS; document.head.appendChild(st);

  /* ---------------- pill + badge (inside #quickFab) */
  let pill = null, pPanel = null;
  function mountPill() {
    const box = document.getElementById('quickFab'); if (!box || document.getElementById('btnSowFab')) return !!box;
    pill = document.createElement('button'); pill.id = 'btnSowFab'; pill.type = 'button'; pill.setAttribute('aria-pressed', 'false');
    // V12: a compact segment 📋 + "אקסל"; SOW on = green + a small ✓, the "$59,000" mode info lives in its title /
    // aria-label and in the panel header (no wide badge any more)
    pill.innerHTML = '<span class="qf-ico" aria-hidden="true">📋</span><span class="qf-lbl"></span><span class="qf-chk" aria-hidden="true">✓</span>';
    pill.querySelector('.qf-lbl').textContent = 'אקסל';
    pPanel = document.createElement('button'); pPanel.id = 'btnSowPanel'; pPanel.type = 'button'; pPanel.setAttribute('aria-haspopup', 'dialog');
    pPanel.innerHTML = '<span class="qf-ico" aria-hidden="true">🧾</span><span class="qf-lbl"></span>';
    pPanel.querySelector('.qf-lbl').textContent = 'פירוט';
    pPanel.title = 'פירוט השיפוץ'; pPanel.setAttribute('aria-label', 'פירוט השיפוץ');
    labelPill(false);
    box.appendChild(pill); box.appendChild(pPanel); // V12 row order (reading direction): 🎨 סגנון · 📋 אקסל · 🧾 פירוט
    pill.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    pPanel.addEventListener('click', (e) => { e.stopPropagation(); openPanel(); });
    return true;
  }
  function labelPill(on) {
    if (!pill) return;
    const t = on ? 'מצב: שיפוץ לפי האקסל · ' + fmt(59000) + ' · הקישו ליציאה' : 'שיפוץ לפי תקציב המלווה (Scope of Work): הבית האמיתי + רק מה שבתקציב';
    pill.title = t; pill.setAttribute('aria-label', on ? t : 'שיפוץ לפי האקסל');
  }
  if (!mountPill()) { const iv = setInterval(() => { if (mountPill()) clearInterval(iv); }, 300); }
  async function toggle() {
    const S = sow(); if (!S) return;
    if (S.busy) return;
    const t = tour();
    if (!(t && t.styles && t.styles.ready)) { t && t.toast && t.toast('הסיור עדיין נטען — אפשר להפעיל אחרי הטעינה', 2400); return; }
    const was = S.on;
    try { if (t.toast) t.toast(was ? 'יוצאים ממצב שיפוץ לפי האקסל…' : 'עוברים לשיפוץ לפי האקסל…', 1400); } catch (_) { }
    await S.toggle();
    sync();
    try { if (t.toast) t.toast(S.on ? 'מצב: שיפוץ לפי האקסל · ' + fmt(S.total) + ' — הבית האמיתי + רק מה שבתקציב' : 'חזרה לעיצוב היוקרתי', 2600); } catch (_) { }
  }
  function sync() {
    const S = sow(), on = !!(S && S.on);
    document.body.classList.toggle('sow-on', on);
    if (pill) { pill.setAttribute('aria-pressed', on ? 'true' : 'false'); labelPill(on); }
    try { const t = tour(); t && t.styleUI && t.styleUI.render && t.styleUI.render(); } catch (_) { }
  }
  const hook = setInterval(() => { const S = sow(); if (S && S.onChange) { clearInterval(hook); S.onChange(() => { sync(); if (!S.on) closePanel(); }); } }, 400);

  /* ---------------- panel */
  let panel = null;
  function buildPanel() {
    if (panel) return panel;
    const S = sow();
    panel = document.createElement('div'); panel.id = 'sowPanel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    panel.innerHTML = '<div class="sp-card"><div class="sp-head"><span class="sp-tt"><b></b><small class="sp-mode"></small></span><button class="sp-x" type="button">✕</button></div><div class="sp-sub"></div><ul class="sp-list"></ul><div class="sp-total"><span class="t"></span><span class="am"></span></div><h4></h4><div class="sp-out"></div><button class="sp-ba" type="button"></button></div>';
    document.body.appendChild(panel);
    panel.querySelector('.sp-head b').textContent = '📋 פירוט השיפוץ';
    panel.querySelector('.sp-head .sp-mode').textContent = 'מצב: שיפוץ לפי האקסל · ' + fmt(S ? S.total : 59000);
    const x = panel.querySelector('.sp-x'); x.setAttribute('aria-label', 'סגור'); x.title = 'סגור';
    panel.querySelector('.sp-sub').textContent = 'תקציב השיפוץ של המלווה (Scope of Work). הקישו על שורה כדי ללכת לחדר ולראות את הפריט.';
    const ul = panel.querySelector('.sp-list');
    for (const it of (S ? S.budget : [])) {
      const li = document.createElement('li');
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sp-item'; b.dataset.id = it.id;
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = it.he;
      const am = document.createElement('span'); am.className = 'am'; am.textContent = fmt(it.amount);
      const go = document.createElement('span'); go.className = 'go'; go.setAttribute('aria-hidden', 'true'); go.textContent = it.hl ? '🔍' : '🚶';
      b.append(nm, am, go); li.appendChild(b); ul.appendChild(li);
      b.addEventListener('click', (e) => { e.stopPropagation(); closePanel(); const t = tour(); try { t && t.toast && t.toast('הולכים אל: ' + it.he, 1800); } catch (_) { } sow() && sow().goItem(it.id); });
    }
    panel.querySelector('.sp-total .t').textContent = 'סה״כ';
    panel.querySelector('.sp-total .am').textContent = fmt(S ? S.total : 59000);
    panel.querySelector('h4').textContent = 'לא בתקציב (נשאר כמו שהוא):';
    const out = panel.querySelector('.sp-out');
    for (const w of (S ? S.notInScope : [])) { const sp = document.createElement('span'); sp.textContent = w; out.appendChild(sp); }
    const ba = panel.querySelector('.sp-ba'); ba.textContent = '⇆ לפני / אחרי';
    ba.addEventListener('click', (e) => { e.stopPropagation(); closePanel(); openBA(hereBA()); });
    x.addEventListener('click', (e) => { e.stopPropagation(); closePanel(); });
    panel.addEventListener('click', (e) => { if (e.target === panel) closePanel(); });
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'touchstart', 'touchmove']) panel.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    return panel;
  }
  function openPanel() { buildPanel(); panel.classList.add('show'); document.body.classList.add('sow-panel-open'); try { tour().dpad.release(); } catch (_) { } }
  function closePanel() { if (panel) panel.classList.remove('show'); document.body.classList.remove('sow-panel-open'); }
  function hereBA() { try { const i = tour().roomInfo(); return BA_MAP[i.key] || (i.floor === 'outside' ? 'street' : 'living'); } catch (_) { return 'living'; } }

  /* ---------------- before / after */
  let ba = null; const baSt = { room: null, pos: 50, seq: 0, cache: new Map(), stats: { opens: 0, rendered: 0 } };
  function buildBA() {
    if (ba) return ba;
    ba = document.createElement('div'); ba.id = 'sowBA'; ba.setAttribute('role', 'dialog'); ba.setAttribute('aria-modal', 'true');
    ba.innerHTML = '<div class="ba-top"><b></b></div><button class="ba-x" type="button">✕</button><div class="ba-stage"><div class="ba-frame"><canvas class="ba-after"></canvas><img class="ba-before" alt=""><div class="ba-line"></div><div class="ba-knob">⇆</div><span class="ba-lab l"></span><span class="ba-lab r"></span><div class="ba-msg"></div></div></div><div class="ba-bot"><div class="ba-rooms"></div><button class="ba-tg" type="button"></button></div>';
    document.body.appendChild(ba);
    const x = ba.querySelector('.ba-x'); x.setAttribute('aria-label', 'סגור'); x.title = 'סגור';
    ba.querySelector('.ba-lab.l').textContent = 'לפני · היום (מהסרטון)';
    ba.querySelector('.ba-lab.r').textContent = 'אחרי · לפי האקסל';
    ba.querySelector('.ba-before').alt = 'לפני';
    const tg = ba.querySelector('.ba-tg'); tg.textContent = 'לפני / אחרי';
    tg.addEventListener('click', (e) => { e.stopPropagation(); setPos(baSt.pos > 50 ? 0 : 100); });
    x.addEventListener('click', (e) => { e.stopPropagation(); closeBA(); });
    const rooms = ba.querySelector('.ba-rooms');
    for (const r of BA_ROOMS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ba-chip'; b.dataset.room = r; b.textContent = ROOM_HE[r];
      b.addEventListener('click', (e) => { e.stopPropagation(); showRoom(r); }); rooms.appendChild(b);
    }
    const fr = ba.querySelector('.ba-frame');
    let drag = false;
    const at = (e) => { const r = fr.getBoundingClientRect(); setPos(((e.clientX - r.left) / Math.max(1, r.width)) * 100); };
    fr.addEventListener('pointerdown', (e) => { e.stopPropagation(); drag = true; try { fr.setPointerCapture(e.pointerId); } catch (_) { } at(e); });
    fr.addEventListener('pointermove', (e) => { e.stopPropagation(); if (drag) at(e); });
    for (const ev of ['pointerup', 'pointercancel']) fr.addEventListener(ev, (e) => { e.stopPropagation(); drag = false; });
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'touchstart', 'touchmove']) ba.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    window.addEventListener('keydown', (e) => {
      if (!ba.classList.contains('show')) return;
      if (e.key === 'Escape') { e.stopPropagation(); closeBA(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.stopPropagation(); setPos(baSt.pos + (e.key === 'ArrowLeft' ? -10 : 10)); }
    }, true);
    window.addEventListener('resize', () => { if (ba.classList.contains('show') && baSt.room) drawAfter(baSt.room); });
    return ba;
  }
  function setPos(p) { baSt.pos = Math.max(0, Math.min(100, p)); if (ba) ba.querySelector('.ba-frame').style.setProperty('--ba', baSt.pos.toFixed(1) + '%'); }
  function msg(t) { const m = ba.querySelector('.ba-msg'); m.textContent = t || ''; m.classList.toggle('on', !!t); }
  function loadImg(src) {
    if (baSt.cache.has(src)) return baSt.cache.get(src);
    const p = new Promise((res, rej) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => rej(new Error('load ' + src)); im.src = src; });
    baSt.cache.set(src, p); p.catch(() => baSt.cache.delete(src));
    return p;
  }
  // equirect (image centre = the node's framed direction; lon → +x to the right) → rectilinear portrait canvas
  let srcPix = null;
  function reproject(img, cv, v) {
    const W = cv.width, H = cv.height;
    if (!srcPix || srcPix.img !== img) {
      const sw = Math.min(img.naturalWidth, 4096), sh = Math.round(sw / 2);
      const c = document.createElement('canvas'); c.width = sw; c.height = sh;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, sw, sh);
      srcPix = { img, w: sw, h: sh, d: g.getImageData(0, 0, sw, sh).data };
    }
    const S = srcPix, out = cv.getContext('2d'), od = out.createImageData(W, H), D = od.data;
    const ty = Math.tan((v.vfov * Math.PI / 180) / 2), tx = ty * W / H;
    const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
    for (let j = 0; j < H; j++) {
      const b = (1 - 2 * (j + 0.5) / H) * ty;
      for (let i = 0; i < W; i++) {
        const a = (2 * (i + 0.5) / W - 1) * tx;
        // camera space: right +x, up +y, forward -z; pitch about x, then yaw about y
        let x = a, y = b, z = -1;
        const y1 = y * cp - z * sp, z1 = y * sp + z * cp; y = y1; z = z1;
        const x2 = x * cy - z * sy, z2 = x * sy + z * cy; x = x2; z = z2;
        const n = Math.hypot(x, y, z);
        const lon = Math.atan2(x, -z), lat = Math.asin(y / n);
        let u = (lon / (2 * Math.PI) + 0.5) * S.w, w = (0.5 - lat / Math.PI) * S.h;
        let iu = Math.floor(u), iw = Math.floor(w); const fu = u - iu, fw = w - iw;
        iu = ((iu % S.w) + S.w) % S.w; const iu1 = (iu + 1) % S.w; iw = Math.max(0, Math.min(S.h - 2, iw));
        const o0 = (iw * S.w + iu) * 4, o1 = (iw * S.w + iu1) * 4, o2 = ((iw + 1) * S.w + iu) * 4, o3 = ((iw + 1) * S.w + iu1) * 4, o = (j * W + i) * 4;
        for (let k = 0; k < 3; k++) D[o + k] = (S.d[o0 + k] * (1 - fu) + S.d[o1 + k] * fu) * (1 - fw) + (S.d[o2 + k] * (1 - fu) + S.d[o3 + k] * fu) * fw;
        D[o + 3] = 255;
      }
    }
    out.putImageData(od, 0, 0);
  }
  async function drawAfter(room) {
    const seq = ++baSt.seq, cv = ba.querySelector('.ba-after');
    const fr = ba.querySelector('.ba-frame').getBoundingClientRect();
    const scale = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(180, Math.min(720, Math.round(fr.width * scale))); cv.height = Math.round(cv.width * 16 / 9);
    msg('טוען הדמיה…');
    let src = null;
    try {
      const m = window.__gallery && window.__gallery.manifest ? window.__gallery.manifest : (window.__gallery && await window.__gallery.loadManifest());
      const it = m && m.items && m.items['sow/' + room]; if (it) src = it.full;
    } catch (_) { src = null; }
    if (!src) src = 'renders/sow/' + room + '.jpg';
    try {
      const img = await loadImg(src);
      if (seq !== baSt.seq) return;
      reproject(img, cv, BA_VIEW[room] || { yaw: 0, pitch: 0, vfov: 90 });
      baSt.stats.rendered++; msg('');
    } catch (e) { if (seq === baSt.seq) { msg('ההדמיה של שיפוץ לפי האקסל לחדר הזה עדיין בהכנה'); const g = cv.getContext('2d'); g.fillStyle = '#1a2230'; g.fillRect(0, 0, cv.width, cv.height); } }
  }
  function showRoom(room) {
    if (!BA_ROOMS.includes(room)) room = 'living';
    baSt.room = room;
    ba.querySelector('.ba-top b').textContent = 'לפני / אחרי · ' + ROOM_HE[room];
    for (const b of ba.querySelectorAll('.ba-chip')) b.classList.toggle('on', b.dataset.room === room);
    const im = ba.querySelector('.ba-before'); im.src = 'renders/before/' + room + '.jpg';
    setPos(50);
    requestAnimationFrame(() => drawAfter(room));
  }
  function openBA(room) {
    buildBA(); baSt.stats.opens++;
    try { const t = tour(); t && t.dpad && t.dpad.release && t.dpad.release(); } catch (_) { }
    ba.classList.add('show'); document.body.classList.add('gallery-open', 'sow-ba-open');
    showRoom(BA_MAP[room] || room || hereBA());
  }
  function closeBA() { if (!ba) return; ba.classList.remove('show'); document.body.classList.remove('gallery-open', 'sow-ba-open'); baSt.seq++; }

  // room-picker long-press (SOW mode) → before / after of that room
  window.addEventListener('picker:longpress', (e) => { const S = sow(); if (!S || !S.on) return; const k = e.detail && e.detail.key; const r = BA_MAP[k]; if (!r) return; e.preventDefault(); openBA(r); });

  const api = {
    toggle, sync, openPanel, closePanel, openBA, closeBA, showRoom, setPos,
    hasBefore: (room) => BA_ROOMS.includes(room),
    get pill() { return pill; }, get panelEl() { return panel; }, get baEl() { return ba; }, get ba() { return { room: baSt.room, pos: baSt.pos, open: !!(ba && ba.classList.contains('show')), stats: baSt.stats }; },
    ROOMS: BA_ROOMS, VIEW: BA_VIEW,
  };
  window.__sowUI = api;
  return api;
}

export default installSowUI;

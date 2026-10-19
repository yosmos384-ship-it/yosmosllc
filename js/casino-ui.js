// casino-ui.js — V10 CASINO: the 2D game overlay shell (phone-portrait first, RTL / LTR, he / en / es).
// One fixed overlay (#casinoUI, z 25, data-i18n-skip — strings come from casino-i18n.js in the current language and
// are re-rendered on language change). Header: game title, play-chip bankroll pill, close. Ribbon: "כסף משחק בלבד ·
// Play money only · 21+". Body: one game module at a time (casino-ui-*.js → mount(body, api) → {destroy, relabel,
// auto}). Also the cashier cage (free top-up), the bar (virtual props, 21+), the exit sheet and the games menu.
// No side effects on import; the DOM is created on first open.
import { L, onLang, fmt } from './casino-i18n.js';

export const CHIP_VALUES = [5, 10, 25, 100, 500, 1000];
const CHIP_COL = { 1: '#e9e4d8', 5: '#c8202c', 10: '#1f5fbf', 25: '#178a4c', 100: '#1b1b1f', 500: '#6c2bb3', 1000: '#d8a21c', 5000: '#c25b12' };
export const chipColor = (v) => { let c = CHIP_COL[1]; for (const k of Object.keys(CHIP_COL).map(Number).sort((a, b) => a - b)) if (v >= k) c = CHIP_COL[k]; return c; };

const CSS = `
#casinoUI{position:fixed;inset:0;z-index:25;display:none;align-items:stretch;justify-content:center;background:radial-gradient(120% 90% at 50% 0%,rgba(40,22,10,.82),rgba(4,3,2,.92));
  font:15px/1.35 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#f4ead6;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
#casinoUI.on{display:flex;animation:czIn .28s ease}
@keyframes czIn{from{opacity:0}to{opacity:1}}
#casinoUI *{box-sizing:border-box}
.cz-panel{position:relative;display:flex;flex-direction:column;width:100%;max-width:560px;height:100%;background:linear-gradient(180deg,#17100a 0%,#0d0906 100%);
  box-shadow:0 0 0 1px rgba(217,180,106,.35),0 30px 80px rgba(0,0,0,.6);overflow:hidden}
#casinoUI.wide .cz-panel{max-width:1000px}
@media (min-width:700px){.cz-panel{height:calc(100% - 32px);margin:16px 0;border-radius:18px}}
.cz-head{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:calc(8px + env(safe-area-inset-top,0px)) 10px 8px;
  background:linear-gradient(180deg,#24170b,#150d07);border-bottom:1px solid rgba(217,180,106,.35)}
.cz-title{flex:1 1 auto;min-width:0;font:700 19px/1.1 Didot,'Bodoni 72','Bodoni MT','Playfair Display',Georgia,serif;letter-spacing:.06em;text-transform:uppercase;
  background:linear-gradient(180deg,#fff3c9,#d9b46a 55%,#9c7330);-webkit-background-clip:text;background-clip:text;color:transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cz-bank{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:5px 10px 5px 6px;border-radius:999px;background:rgba(0,0,0,.45);border:1px solid rgba(217,180,106,.5);font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.cz-bank i{display:inline-block;width:18px;height:18px;border-radius:50%;background:radial-gradient(circle,#d8a21c 0 45%,#fff 46% 52%,#d8a21c 53%);box-shadow:0 0 0 1px rgba(0,0,0,.4)}
.cz-bank.pulse{animation:czPulse .5s ease}
@keyframes czPulse{50%{transform:scale(1.12);box-shadow:0 0 18px rgba(255,214,120,.8)}}
.cz-x{flex:0 0 auto;width:44px;height:44px;border-radius:50%;border:1px solid rgba(217,180,106,.45);background:rgba(255,255,255,.06);color:#f4ead6;font-size:20px;line-height:1;cursor:pointer}
.cz-ribbon{flex:0 0 auto;display:flex;justify-content:center;gap:10px;flex-wrap:wrap;padding:4px 10px;font-size:12px;font-weight:600;letter-spacing:.02em;color:#1d1206;
  background:linear-gradient(90deg,#9c7330,#f1d58f 30%,#fff1c4 50%,#f1d58f 70%,#9c7330)}
.cz-ribbon b{padding:0 6px;border-radius:6px;background:#1d1206;color:#f1d58f}
.cz-body{position:relative;flex:1 1 auto;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding:10px 10px calc(14px + env(safe-area-inset-bottom,0px))}
.cz-msg{min-height:26px;margin:6px 0;text-align:center;font-weight:700;font-size:16px;letter-spacing:.01em}
.cz-msg.win{color:#ffe08a;text-shadow:0 0 14px rgba(255,200,80,.7)} .cz-msg.lose{color:#e9a9a2} .cz-msg.push{color:#cfd8e3}
.cz-row{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap}
.cz-btn{min-height:46px;min-width:46px;padding:0 16px;border-radius:12px;border:0;cursor:pointer;font:700 15px/1 system-ui,sans-serif;letter-spacing:.02em;color:#1d1206;
  background:linear-gradient(180deg,#fff0bf,#e2bd6c 45%,#b98a3a);box-shadow:0 2px 0 #6e4f1d,0 6px 14px rgba(0,0,0,.45);transition:transform .08s,filter .15s}
.cz-btn:active{transform:translateY(2px);box-shadow:0 0 0 #6e4f1d,0 3px 8px rgba(0,0,0,.45)}
.cz-btn.alt{color:#f4ead6;background:linear-gradient(180deg,#3a2a1a,#22170d);box-shadow:0 0 0 1px rgba(217,180,106,.45),0 6px 14px rgba(0,0,0,.4)}
.cz-btn.red{color:#fff;background:linear-gradient(180deg,#d4485a,#8f1726);box-shadow:0 2px 0 #4e0a13,0 6px 14px rgba(0,0,0,.45)}
.cz-btn.big{min-height:54px;font-size:17px;padding:0 26px}
.cz-btn[disabled]{filter:grayscale(.85) brightness(.6);cursor:default;pointer-events:none}
.cz-chips{display:flex;gap:6px;justify-content:center;flex-wrap:nowrap;padding:6px 0}
.cz-chip{--c:#c8202c;position:relative;flex:0 0 auto;width:46px;height:46px;border-radius:50%;border:0;padding:0;cursor:pointer;color:#fff;font:800 12px/46px system-ui,sans-serif;text-align:center;
  background:radial-gradient(circle,var(--c) 0 50%,rgba(255,255,255,.92) 51% 54%,var(--c) 55% 100%);box-shadow:0 3px 0 rgba(0,0,0,.45),0 6px 12px rgba(0,0,0,.35);transition:transform .12s}
.cz-chip::before{content:'';position:absolute;inset:0;border-radius:50%;background:repeating-conic-gradient(rgba(255,255,255,.95) 0 11deg,transparent 11deg 45deg);
  -webkit-mask:radial-gradient(circle,transparent 0 70%,#000 71% 100%);mask:radial-gradient(circle,transparent 0 70%,#000 71% 100%)}
.cz-chip span{position:relative;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.cz-chip.sel{transform:translateY(-6px) scale(1.06);box-shadow:0 0 0 2px #ffe08a,0 0 16px rgba(255,214,120,.8),0 8px 14px rgba(0,0,0,.4)}
.cz-chip.sm{width:28px;height:28px;font-size:9px;line-height:28px;box-shadow:0 2px 0 rgba(0,0,0,.5)}
.cz-chip.st{pointer-events:none}
.cz-felt{position:relative;border-radius:22px;padding:12px 10px;background:radial-gradient(120% 90% at 50% 20%,#1b7a5c 0%,#0f5a43 45%,#093a2b 100%);
  box-shadow:inset 0 0 0 3px rgba(0,0,0,.25),inset 0 0 60px rgba(0,0,0,.45),0 0 0 6px #3b2412,0 0 0 8px #d9b46a,0 14px 30px rgba(0,0,0,.5);margin:10px 4px}
.cz-felt.blue{background:radial-gradient(120% 90% at 50% 20%,#1d4f8a 0%,#123766 50%,#0a2243 100%)}
.cz-felt.red{background:radial-gradient(120% 90% at 50% 20%,#8a1d2c 0%,#64121f 50%,#3d0912 100%)}
.cz-arc{display:block;width:100%;height:58px;margin:-4px 0 -6px;overflow:visible}
.cz-arc text{fill:rgba(255,236,190,.85);font:700 11px system-ui,sans-serif;letter-spacing:.12em}
.cz-cards{display:flex;justify-content:center;min-height:86px;padding:4px 0}
.cz-card{position:relative;flex:0 0 auto;width:58px;height:82px;margin:0 -10px;border-radius:7px;background:linear-gradient(160deg,#fffdf7,#f1eadb);color:#15110c;
  box-shadow:0 1px 0 rgba(0,0,0,.15),0 4px 10px rgba(0,0,0,.45);font-family:Georgia,'Times New Roman',serif;direction:ltr;animation:czDeal .32s cubic-bezier(.2,.8,.3,1) both}
.cz-cards.loose .cz-card{margin:0 3px}
.cz-card.red{color:#b3141f}
.cz-card .r{position:absolute;left:5px;top:3px;font-weight:700;font-size:17px;line-height:1;text-align:center}
.cz-card .r small{display:block;font-size:13px}
.cz-card .s{position:absolute;left:0;right:0;top:50%;transform:translateY(-42%);text-align:center;font-size:32px;line-height:1}
.cz-card .rb{position:absolute;right:5px;bottom:3px;transform:rotate(180deg);font-weight:700;font-size:17px;line-height:1;text-align:center}
.cz-card .rb small{display:block;font-size:13px}
.cz-card.back{background:repeating-linear-gradient(45deg,#7a1222 0 6px,#5c0d19 6px 12px);box-shadow:inset 0 0 0 3px #fff,inset 0 0 0 5px #d9b46a,0 4px 10px rgba(0,0,0,.45)}
.cz-card.back::after{content:'';position:absolute;inset:12px 9px;border:1.5px solid rgba(241,213,143,.85);border-radius:4px;background:radial-gradient(circle,rgba(241,213,143,.6) 0 18%,transparent 19%)}
.cz-card.flip{animation:czFlip .35s ease both}
.cz-card.hl{box-shadow:0 0 0 2px #ffe08a,0 0 18px rgba(255,214,120,.85),0 4px 10px rgba(0,0,0,.45)}
.cz-card.dim{filter:brightness(.55)}
@keyframes czDeal{from{opacity:0;transform:translate(40px,-60px) rotate(-14deg) scale(.8)}to{opacity:1;transform:none}}
@keyframes czFlip{0%{transform:rotateY(90deg)}100%{transform:rotateY(0)}}
.cz-val{display:inline-block;min-width:34px;padding:2px 8px;border-radius:10px;background:rgba(0,0,0,.55);border:1px solid rgba(217,180,106,.5);font-weight:800;text-align:center;font-variant-numeric:tabular-nums}
.cz-lbl{font:700 11px/1 system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,236,190,.75);text-align:center;margin:2px 0 4px}
.cz-stake{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:4px;font-weight:700;font-variant-numeric:tabular-nums}
.cz-sheet h3{margin:6px 0 10px;font:700 20px/1.2 Didot,'Bodoni 72',Georgia,serif;letter-spacing:.05em;color:#f1d58f;text-align:center}
.cz-sheet p{margin:8px 0;color:#e9dcc2;text-align:center}
.cz-note{font-size:12px;color:rgba(244,234,214,.7);text-align:center;margin:10px 0 0}
.cz-list{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cz-list .cz-btn{width:100%;min-height:58px;font-size:14px;line-height:1.2;white-space:normal}
.cz-banner{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%) scale(.6);padding:14px 26px;border-radius:16px;pointer-events:none;opacity:0;z-index:5;text-align:center;
  font:800 26px/1.15 Didot,'Bodoni 72',Georgia,serif;letter-spacing:.04em;color:#1d1206;background:linear-gradient(180deg,#fff3c9,#e2bd6c 50%,#b98a3a);box-shadow:0 0 0 2px #fff7dc,0 0 40px rgba(255,200,90,.8);transition:all .35s cubic-bezier(.2,1.4,.4,1)}
.cz-banner.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
.cz-banner small{display:block;font:700 15px system-ui,sans-serif;margin-top:4px}
.cz-tabs{display:flex;gap:6px;justify-content:center;margin:2px 0 6px}
.cz-tab{min-height:38px;padding:0 12px;border-radius:999px;border:1px solid rgba(217,180,106,.5);background:rgba(0,0,0,.35);color:#f4ead6;font-weight:700;font-size:13px;cursor:pointer}
.cz-tab.on{background:linear-gradient(180deg,#fff0bf,#d9b46a);color:#1d1206}
.cz-toast{position:absolute;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);padding:9px 14px;border-radius:12px;background:rgba(0,0,0,.85);border:1px solid rgba(217,180,106,.6);font-weight:600;font-size:14px;opacity:0;transition:opacity .25s;pointer-events:none;z-index:6;max-width:90%;text-align:center}
.cz-toast.on{opacity:1}
#casinoHUD{position:fixed;z-index:12;top:calc(env(safe-area-inset-top,0px) + 62px);left:50%;transform:translateX(-50%);display:none;gap:6px;align-items:center;
  font:700 13px/1 system-ui,sans-serif;color:#f4ead6;-webkit-user-select:none;user-select:none}
#casinoHUD.on{display:flex}
#casinoHUD .hb{display:flex;align-items:center;gap:6px;min-height:40px;padding:0 12px;border-radius:999px;background:rgba(18,11,5,.78);border:1px solid rgba(217,180,106,.55);color:#f4ead6;font:700 13px system-ui,sans-serif;cursor:pointer;white-space:nowrap;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
#casinoHUD .hb i{display:inline-block;width:16px;height:16px;border-radius:50%;background:radial-gradient(circle,#d8a21c 0 45%,#fff 46% 52%,#d8a21c 53%)}
#casinoHUD .pm{font-size:10px;font-weight:700;color:#1d1206;background:#f1d58f;border-radius:6px;padding:2px 5px}
`;

/** a playing-card element */
export function cardEl(c, { hidden = false, cls = '' } = {}) {
  const d = document.createElement('div');
  if (hidden || c == null) { d.className = 'cz-card back ' + cls; return d; }
  const r = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'][c % 13], s = ['♠', '♥', '♦', '♣'][(c / 13) | 0];
  d.className = 'cz-card ' + (((c / 13) | 0) === 1 || ((c / 13) | 0) === 2 ? 'red ' : '') + cls;
  d.innerHTML = `<div class="r">${r}<small>${s}</small></div><div class="s">${s}</div><div class="rb">${r}<small>${s}</small></div>`;
  return d;
}
export function chipEl(v, { sm = false, sel = false, st = false } = {}) {
  const b = document.createElement(st ? 'div' : 'button');
  b.className = 'cz-chip' + (sm ? ' sm' : '') + (sel ? ' sel' : '') + (st ? ' st' : '');
  b.style.setProperty('--c', chipColor(v));
  b.innerHTML = `<span>${v >= 1000 ? (v / 1000) + 'K' : v}</span>`;
  b.dataset.v = v;
  return b;
}
/** chip denomination picker → {el, get value(), set(v)} */
export function chipPicker(values = CHIP_VALUES, def = 25, onPick) {
  const el = document.createElement('div'); el.className = 'cz-chips';
  let v = values.includes(def) ? def : values[0];
  const draw = () => { el.innerHTML = ''; for (const x of values) { const c = chipEl(x, { sel: x === v }); c.setAttribute('aria-label', String(x)); c.addEventListener('click', () => { v = x; draw(); onPick && onPick(x); }); el.appendChild(c); } };
  draw();
  return { el, get value() { return v; }, set(x) { v = x; draw(); } };
}
export function btn(label, cls = '', act = '') { const b = document.createElement('button'); b.className = 'cz-btn ' + cls; b.textContent = label; if (act) b.dataset.act = act; return b; }
export function h(tag, cls = '', html = '') { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
/** curved felt text (SVG textPath) */
export function arcText(text, id) {
  const s = h('div'); s.innerHTML = `<svg class="cz-arc" viewBox="0 0 400 58" preserveAspectRatio="xMidYMid meet"><defs><path id="${id}" d="M20,8 Q200,72 380,8"/></defs>
    <text text-anchor="middle"><textPath href="#${id}" startOffset="50%">${text}</textPath></text></svg>`;
  return s.firstChild;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * createCasinoUI({wallet, sfx, games, onOpen, onClose, actions}) — games = {id: mount}
 * actions = {exitTo(id), goTo(stationId)} used by the exit sheet and the games menu.
 */
export function createCasinoUI({ wallet, sfx = {}, games = {}, onOpen, onClose, actions = {}, fx = null } = {}) {
  let lastLang = '';
  let root = null, bodyEl, titleEl, bankEl, toastEl, bannerEl, cur = null, curId = null, offLang = null, hud = null, hudBank = null;
  const S = (n, ...a) => { try { sfx[n] && sfx[n](...a); } catch (_) {} };
  function ensure() {
    if (root) return;
    if (!document.getElementById('casinoUICss')) { const st = document.createElement('style'); st.id = 'casinoUICss'; st.textContent = CSS; document.head.appendChild(st); }
    root = h('div'); root.id = 'casinoUI'; root.setAttribute('data-i18n-skip', ''); root.setAttribute('role', 'dialog');
    root.innerHTML = `<div class="cz-panel"><div class="cz-head"><div class="cz-title"></div><div class="cz-bank"><i></i><span></span></div><button class="cz-x" aria-label="close">✕</button></div>
      <div class="cz-ribbon"></div><div class="cz-body"></div><div class="cz-banner"></div><div class="cz-toast"></div></div>`;
    document.body.appendChild(root);
    bodyEl = root.querySelector('.cz-body'); titleEl = root.querySelector('.cz-title'); bankEl = root.querySelector('.cz-bank');
    toastEl = root.querySelector('.cz-toast'); bannerEl = root.querySelector('.cz-banner');
    root.querySelector('.cz-x').addEventListener('click', () => api.close());
    root.addEventListener('click', (e) => { if (e.target === root) api.close(); });
    // keep the tour's keyboard / wheel controls out of the overlay
    for (const t of ['keydown', 'keyup', 'wheel', 'pointerdown', 'touchstart', 'mousedown', 'dblclick']) root.addEventListener(t, (e) => { if (t === 'keydown' && e.key === 'Escape') api.close(); e.stopPropagation(); }, { passive: true });
    wallet.onChange((v, why) => { setBank(); if (why === 'topup' || why === 'win' || /^(bj|slot|vp|roulette|craps|baccarat|holdem-cashout)$/.test(why)) { bankEl.classList.remove('pulse'); void bankEl.offsetWidth; if (why !== 'bet') bankEl.classList.add('pulse'); } });
    offLang = onLang(() => relabel());
    relabel();
  }
  function setBank() { const s = fmt(wallet.balance); if (bankEl) bankEl.querySelector('span').textContent = s; if (hudBank) hudBank.textContent = s; }
  function relabel() {
    if (!root) return;
    root.dir = L('dir'); root.lang = L('lang');
    if (root.lang !== lastLang) { lastLang = root.lang; toastEl.textContent = ''; toastEl.classList.remove('on'); bannerEl.textContent = ''; bannerEl.classList.remove('on'); }
    root.querySelector('.cz-ribbon').innerHTML = `<span>${L('playMoney')} — ${L('noRealMoney')}</span><b>21+</b>`;
    root.querySelector('.cz-x').setAttribute('aria-label', L('close'));
    titleEl.textContent = curId ? L('g_' + curId) : '';
    setBank();
    if (cur && cur.relabel) { try { cur.relabel(); } catch (e) { console.warn('[casino] relabel', e); } }
    relabelHud();
  }
  let toastT = 0;
  const api = {
    wallet, L, fmt, sfx: S,
    /** 3D table effects for the station the game was opened from (roulette ball, dice, cards) */
    fx(evt, data) { try { fx && fx(curId, evt, data || {}); } catch (_) {} },
    get isOpen() { return !!(root && root.classList.contains('on')); },
    get current() { return curId; },
    get game() { return cur; },
    get root() { return root; },
    toast(msg, ms = 1800) { ensure(); toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), ms); },
    banner(main, sub = '', ms = 1500) {
      ensure(); bannerEl.innerHTML = main + (sub ? `<small>${sub}</small>` : ''); bannerEl.classList.add('on');
      clearTimeout(bannerEl._t); bannerEl._t = setTimeout(() => bannerEl.classList.remove('on'), ms);
    },
    err(code) { api.toast(L('err_' + code) || L('err_illegal')); S('deny'); },
    open(id, params = {}) {
      ensure();
      if (cur) api.unmount();
      const mount = games[id] || builtins[id];
      if (!mount) { console.warn('[casino] no game', id); return null; }
      curId = id; root.classList.toggle('wide', !!params.wide || id === 'roulette' || id === 'craps');
      bodyEl.innerHTML = ''; bodyEl.scrollTop = 0;
      try { cur = mount(bodyEl, Object.assign({}, api, { params })) || {}; } catch (e) { console.error('[casino] mount', id, e); cur = {}; }
      root.classList.add('on');
      titleEl.textContent = L('g_' + id);
      setBank(); S('open');
      try { onOpen && onOpen(id); } catch (_) {}
      hud && hud.classList.remove('on');
      return cur;
    },
    unmount() { if (cur && cur.destroy) { try { cur.destroy(); } catch (_) {} } cur = null; curId = null; if (bodyEl) bodyEl.innerHTML = ''; },
    close() {
      if (!root || !root.classList.contains('on')) return;
      const id = curId; api.unmount(); root.classList.remove('on'); S('close');
      try { onClose && onClose(id); } catch (_) {}
      if (hud && hudShown) hud.classList.add('on');
    },
    /* -------- HUD (in the casino world, outside the overlay) */
    showHud(on) { hudShown = !!on; ensureHud(); hud.classList.toggle('on', !!on && !api.isOpen); setBank(); },
    /** V13.1: how the visitor arrived ('heli' | 'limo' | null) — the exit sheet offers the matching ride back */
    setArrival(a) { arrival = a === 'heli' ? 'heli' : a || null; relabelHud(); },
    get arrival() { return arrival; },
    relabel,
    dispose() { try { offLang && offLang(); } catch (_) {} root && root.remove(); hud && hud.remove(); root = null; hud = null; },
  };
  let hudShown = false, arrival = null;
  function ensureHud() {
    if (hud) return;
    ensure();
    hud = h('div'); hud.id = 'casinoHUD'; hud.setAttribute('data-i18n-skip', '');
    hud.innerHTML = `<button class="hb" data-h="bank"><i></i><span class="hbv"></span><span class="pm"></span></button><button class="hb" data-h="games"></button><button class="hb" data-h="exit"></button>`;
    document.body.appendChild(hud);
    hudBank = hud.querySelector('.hbv');
    hud.querySelector('[data-h="bank"]').addEventListener('click', () => api.open('cage'));
    hud.querySelector('[data-h="games"]').addEventListener('click', () => api.open('menu'));
    hud.querySelector('[data-h="exit"]').addEventListener('click', () => api.open('exit'));
    for (const t of ['pointerdown', 'touchstart', 'mousedown', 'dblclick']) hud.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
    relabelHud();
  }
  function relabelHud() {
    if (!hud) return;
    hud.dir = L('dir');
    hud.querySelector('.pm').textContent = L('playShort');
    hud.querySelector('[data-h="games"]').textContent = L('hudGames');
    hud.querySelector('[data-h="exit"]').textContent = L(arrival === 'heli' ? 'hudExitHeli' : 'hudExit');
    hud.querySelector('[data-h="bank"]').setAttribute('aria-label', L('g_cage'));
  }

  /* ---------------------------------------------------------------- built-in sheets */
  const builtins = {
    cage(body, a) {
      const w = h('div', 'cz-sheet');
      const draw = () => {
        w.innerHTML = `<h3>${L('cageTitle')}</h3><div class="cz-felt" style="text-align:center"><div class="cz-lbl">${L('balance')}</div>
          <div style="font:800 34px/1.2 Didot,Georgia,serif;color:#ffe9a8;font-variant-numeric:tabular-nums">${fmt(wallet.balance)}</div><div class="cz-lbl" style="margin-top:6px">${L('playMoney')}</div></div>
          <p>${L('cageText')}</p>`;
        const r = h('div', 'cz-row'); const b = btn(L('topUp'), 'big', 'topup');
        b.addEventListener('click', () => { wallet.topUp(); S('win'); a.toast(L('toppedUp')); draw(); });
        r.appendChild(b); w.appendChild(r);
        w.appendChild(h('p', 'cz-note', L('cageNote')));
      };
      draw(); body.appendChild(w);
      return { relabel: draw, auto: async () => { w.querySelector('[data-act="topup"]').click(); return { balance: wallet.balance }; } };
    },
    bar(body, a) {
      const w = h('div', 'cz-sheet');
      const items = ['mocktail', 'espresso', 'cocktail', 'champagne'];
      const draw = () => {
        w.innerHTML = `<h3>${L('barTitle')}</h3><p>${L('barText')}</p>`;
        const g = h('div', 'cz-list');
        for (const k of items) { const b = btn(L('drink_' + k) + (k === 'cocktail' || k === 'champagne' ? ' · 21+' : ''), 'alt', k); b.addEventListener('click', () => { S('clink'); a.toast(L('served', L('drink_' + k))); try { actions.drink && actions.drink(k); } catch (_) {} }); g.appendChild(b); }
        w.appendChild(g); w.appendChild(h('p', 'cz-note', L('barNote')));
      };
      draw(); body.appendChild(w); return { relabel: draw };
    },
    exit(body, a) {
      const w = h('div', 'cz-sheet');
      const draw = () => {
        const byHeli = arrival === 'heli';
        w.innerHTML = `<h3>${L('exitTitle')}</h3><p>${L(byHeli ? 'exitTextHeli' : 'exitText')}</p>`;
        const r = h('div', 'cz-row');
        const ride = byHeli ? 'heli' : 'limo';
        const b1 = btn(L(byHeli ? 'toHeli' : 'toLimo'), 'big', ride), b2 = btn(L('toHome'), 'big alt', 'home');
        b1.addEventListener('click', () => { a.close(); actions.exitTo && actions.exitTo(ride); });
        b2.addEventListener('click', () => { a.close(); actions.exitTo && actions.exitTo('home'); });
        r.append(b1, b2); w.appendChild(r);
        w.appendChild(h('p', 'cz-note', L('exitNote')));
      };
      draw(); body.appendChild(w); return { relabel: draw };
    },
    stage(body) {
      const w = h('div', 'cz-sheet');
      const draw = () => { w.innerHTML = `<h3>${L('stageTitle')}</h3><p>${L('stageText')}</p><p class="cz-note">${L('rgNote')}</p>`; };
      draw(); body.appendChild(w); return { relabel: draw };
    },
    steak(body) {
      const w = h('div', 'cz-sheet');
      const draw = () => { w.innerHTML = `<h3>${L('steakTitle')}</h3><p>${L('steakText')}</p>`; };
      draw(); body.appendChild(w); return { relabel: draw };
    },
    menu(body, a) {
      const w = h('div', 'cz-sheet');
      const list = actions.stations ? actions.stations() : [];
      const draw = () => {
        w.innerHTML = `<h3>${L('menuTitle')}</h3><p>${L('menuText')}</p>`;
        const g = h('div', 'cz-list');
        for (const s of list) {
          const b = btn(L(s.label), 'alt', s.id);
          b.addEventListener('click', () => { a.close(); actions.goTo ? actions.goTo(s.id) : a.open(s.game, s.params); });
          g.appendChild(b);
        }
        w.appendChild(g);
        w.appendChild(h('p', 'cz-note', L('rgNote')));
      };
      draw(); body.appendChild(w); return { relabel: draw };
    },
  };
  return api;
}

// core-picker.js — V10 room picker: a horizontally scrollable chip bar at the bottom of the walk (and 360) screen.
// Rooms are grouped by floor with a small floor label; the room you are in is highlighted, the room you are walking
// to pulses. Owner: CORE/NAV. No side effects on import (core calls createRoomPicker()).
//
// Placement (phone): the empty strip at the bottom between the D-pad and the "פעולה" button, above the safe area. The
// bar is laid out by JS against whatever occupies the bottom band (each D-pad button, the action button, the info
// line, the renders button, the version tag …) and takes the widest free gap; on a narrow phone the action button is
// lifted a little (body.picker-lift) so the bar gets the whole strip right of the D-pad's ▼. Desktop: bottom centre,
// between the info line and the renders button. In 360 it sits just above the 360 bar.

const BAND_IDS = ['btnAct', 'info', 'quickFab', 'ver-tag', 'floorChips', 'measureBar'];
const LIFT_PX = 36; // how much body.picker-lift raises #btnAct (index.html CSS)

export function createRoomPicker(env) {
  const el = env.el;
  if (!el || typeof document === 'undefined') return null;
  const body = document.body;
  el.innerHTML = '<div class="pk-scroll" role="listbox"></div>';
  const sc = el.querySelector('.pk-scroll');
  let sig = '', curKey = null, goKey = null, lastCur = null, shown = false;
  const chips = new Map();

  function render() {
    const groups = (env.getGroups && env.getGroups()) || [];
    const s = groups.map((g) => g.label + ':' + g.items.map((i) => i.key + '=' + i.he).join(',')).join('|');
    if (s === sig) return;
    sig = s; chips.clear(); sc.innerHTML = '';
    for (const g of groups) {
      if (!g.items.length) continue;
      const grp = document.createElement('div'); grp.className = 'pk-grp'; grp.dataset.floor = g.floor || '';
      if (g.label) { const l = document.createElement('span'); l.className = 'pk-fl'; l.textContent = g.label; grp.appendChild(l); }
      for (const it of g.items) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'pk-chip' + (it.cls ? ' ' + it.cls : ''); b.dataset.key = it.key; b.setAttribute('role', 'option');
        b.textContent = it.he; b.dataset.he = it.he;
        if (it.title) b.title = it.title;
        b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); try { env.onPick && env.onPick(it.key, it); } catch (err) { console.warn('[picker]', err); } sync(); });
        b.addEventListener('pointerdown', (e) => e.stopPropagation());
        grp.appendChild(b); chips.set(it.key, b);
      }
      sc.appendChild(grp);
    }
    lastCur = null; sync(); layout();
  }
  function sync() {
    curKey = env.currentKey ? env.currentKey() : null;
    goKey = env.goingKey ? env.goingKey() : null;
    for (const [k, b] of chips) {
      const on = k === curKey, go = k === goKey;
      b.classList.toggle('on', on && !go); b.classList.toggle('go', go);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      if (env.labelOf) { const l = env.labelOf(k); if (l && b.dataset.he !== l) { b.dataset.he = l; b.textContent = l; } }
    }
    const focus = goKey || curKey;
    if (focus !== lastCur) {
      lastCur = focus;
      const b = chips.get(focus);
      if (b && shown) { try { b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (_) {} }
    }
  }

  /* ---------------- visibility + layout */
  const vis = (e) => { if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? r : null; };
  function wanted() {
    const m = env.getMode ? env.getMode() : '';
    if (m !== 'walk' && m !== 'pano') return false;
    const C = body.classList;
    if (C.contains('loading') || C.contains('gallery-open') || C.contains('tools-open') || C.contains('measuring') || C.contains('pt-running') || C.contains('pt-viewing') || C.contains('world-busy')) return false;
    const intro = document.getElementById('intro'); if (intro && intro.classList.contains('show')) return false;
    const help = document.getElementById('help'); if (help && help.classList.contains('show')) return false;
    if (!chips.size) return false;
    return true;
  }
  function hide() { el.classList.remove('show'); body.classList.remove('picker-on', 'picker-lift'); shown = false; }
  function layout() {
    if (!wanted()) { hide(); return; }
    const vw = window.innerWidth, vh = window.innerHeight, mode = env.getMode();
    el.classList.add('show'); shown = true; body.classList.add('picker-on');
    // band: bottom gutter (walk) or just above the 360 bar
    el.style.left = '16px'; el.style.right = 'auto'; el.style.width = 'auto';
    const pu = mode === 'pano' ? vis(document.getElementById('panoUI')) : null;
    el.style.bottom = pu ? Math.round(vh - pu.top + 8) + 'px' : '';
    const band = el.getBoundingClientRect();
    const t0 = band.top - 2, b0 = band.bottom + 2;
    const lifted = body.classList.contains('picker-lift');
    const obs = [];
    const add = (r, id) => { if (r && r.bottom > t0 && r.top < b0) obs.push({ l: r.left, r: r.right, id }); };
    const dp = document.getElementById('dpad');
    if (vis(dp)) for (const b of dp.querySelectorAll('button')) add(vis(b), 'dpad');
    for (const id of BAND_IDS) {
      let r = vis(document.getElementById(id));
      if (r && id === 'btnAct' && lifted) r = { left: r.left, right: r.right, top: r.top + LIFT_PX, bottom: r.bottom + LIFT_PX }; // where it sits un-lifted
      add(r, id);
    }
    const L0 = 16, R0 = vw - 16;
    const gaps = (list) => {
      const xs = list.slice().sort((a, b) => a.l - b.l); const out = []; let x = L0;
      for (const o of xs) { if (o.l - 8 > x) out.push([x, o.l - 8]); x = Math.max(x, o.r + 8); }
      if (R0 > x) out.push([x, R0]);
      return out.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
    };
    let g = gaps(obs)[0] || [L0, L0];
    let lift = false;
    if (g[1] - g[0] < 220 && mode === 'walk' && obs.some((o) => o.id === 'btnAct')) {
      const g2 = gaps(obs.filter((o) => o.id !== 'btnAct'))[0];
      if (g2 && g2[1] - g2[0] > g[1] - g[0] + 40) { g = g2; lift = true; }
    }
    if (lift !== lifted) body.classList.toggle('picker-lift', lift);
    const avail = g[1] - g[0];
    if (avail < 110) { hide(); return; }
    const content = sc.scrollWidth + 10;
    const w = Math.max(110, Math.min(avail, content, 780));
    el.style.width = Math.round(w) + 'px';
    el.style.left = Math.round(g[0] + (avail - w) / 2) + 'px';
  }

  let t = 0;
  function update(dt) {
    t += dt || 0.016;
    if (t < 0.25) return;
    t = 0;
    render(); sync(); layout();
  }
  window.addEventListener('resize', () => { try { layout(); } catch (_) {} });
  return {
    el, render, sync, layout, update,
    refresh() { sig = ''; render(); },
    get shown() { return shown; },
    get keys() { return [...chips.keys()]; },
    chip(k) { return chips.get(k) || null; },
  };
}

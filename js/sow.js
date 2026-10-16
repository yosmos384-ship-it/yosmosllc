// sow.js — V11 "📋 שיפוץ לפי האקסל" (scope-of-work mode). The owner's lender budget ($59,000) applied to the REAL house:
// the 'sow' style (js/styles.js) + a visibility swap: meshes tagged userData.luxOnly (luxury-only pieces: crown / panel
// moulding, cove LEDs, recessed cans, pendants, the olive tree, the open walnut shelves, marble backsplash, the paver /
// bluestone / cedar / boxwood / hydrangea landscaping, path + string lights …) are hidden, meshes tagged
// userData.sowOnly (js/sow-build.js: flush mounts, ceiling fans, smoke detectors, subway backsplash, gravel driveway,
// chain-link pieces) are shown. Colliders and interactives of both groups follow (ctx.variantColliders /
// ctx.variantInteractives). Turning the mode off restores the exact previous state (style, visibility, colliders,
// interactives). Everything else (walk, picker, 360, dollhouse, plan, radio, TV, limo / casino) keeps working.
// API: createSow(ctx) → window.__tour.sow = { on, busy, enable(), disable(), toggle(), budget, notInScope, total,
//   goItem(id), highlight(targetId), clearHighlight(), stats(), onChange(fn) }. No side effects at import.
import * as THREE from 'three';

// The lender's Scope of Work (rehab budget). he / en / es names; `go` = room key to walk to; `hl` = object to highlight.
export const SOW_BUDGET = [
  { id: 'demo', amount: 3500, he: 'הריסה ופינוי פסולת (פירוק פנים)', go: 'living' },
  { id: 'appliances', amount: 2700, he: 'מכשירי מטבח חדשים: מדיח, תנור, קולט, מקרר', go: 'kitchen' },
  { id: 'cabinets', amount: 6000, he: 'ארונות מטבח: מטבח חדש + משטח + חיפוי', go: 'kitchen' },
  { id: 'baths', amount: 11500, he: 'שיפוץ מלא של 2 חדרי רחצה כולל אריחים', go: 'bath1', also: 'bath2' },
  { id: 'flooring', amount: 5500, he: 'ריצוף LVP חדש בכל הבית', go: 'living' },
  { id: 'doors', amount: 4000, he: 'דלתות פנים ומשקופים', go: 'hall' },
  { id: 'paint', amount: 6000, he: 'צביעת פנים מלאה: קירות ותקרות', go: 'bed1' },
  { id: 'waterHeater', amount: 1000, he: 'דוד מים חמים', go: 'basement', hl: 'waterHeater' },
  { id: 'ac', amount: 3500, he: 'מיזוג אוויר (מעבה חיצוני)', go: 'backyard', hl: 'ac' },
  { id: 'furnace', amount: 6000, he: 'תנור חימום (פורנס)', go: 'basement', hl: 'furnace' },
  { id: 'fixtures', amount: 750, he: 'גופי תאורה ומאווררי תקרה חדשים', go: 'living', hl: 'fan' },
  { id: 'panel', amount: 3000, he: 'לוח חשמל חדש', go: 'basement', hl: 'panel' },
  { id: 'receptacles', amount: 750, he: 'שקעים ומתגים חדשים', go: 'kitchen' },
  { id: 'drywall', amount: 3800, he: 'תיקוני גבס לפי הצורך', go: 'bed3' },
  { id: 'other', amount: 1000, he: 'גלאי עשן וניקיון אחרי השיפוץ', go: 'hall', hl: 'smoke' },
];
export const SOW_TOTAL = 59000;
export const SOW_NOT_IN_SCOPE = ['גג', 'מרזבים', 'סופיט', 'חיפוי / טיח חוץ', 'צבע חוץ', 'דלתות חוץ', 'חלונות', 'שביל החניה', 'גדרות', 'גינון', 'מרפסת כניסה', 'גימור המרתף', 'בידוד'];

export function createSow(ctx) {
  const state = { on: false, busy: false, built: null, prevStyle: null, switching: false, hl: null, hlT: 0 };
  const listeners = new Set();
  const T = () => (typeof window !== 'undefined' && window.__tour) || null;
  const emit = () => { for (const f of listeners) { try { f(state.on); } catch (_) { } } };

  function variantObjects() {
    const lux = [], sow = [];
    for (const top of ctx.scene.children) {
      if (!top || (top.userData && top.userData.__core)) continue;
      top.traverse((o) => { if (o.userData) { if (o.userData.luxOnly) lux.push(o); else if (o.userData.sowOnly && o !== (state.built && state.built.root)) sow.push(o); } });
    }
    return { lux, sow };
  }
  async function ensureBuilt() {
    if (state.built) return state.built;
    const m = await import('./sow-build.js');
    state.built = m.buildSow(ctx);
    // fans spin while the mode is on and they are switched on
    try {
      ctx.onUpdate && ctx.onUpdate((dt) => {
        if (state.built && state.on) for (const f of state.built.fans) { f.speed += ((f.on ? 9 : 0) - f.speed) * Math.min(1, (dt || 0.016) * 1.2); if (f.speed > 0.01) f.rot.rotation.y += f.speed * (dt || 0.016); }
        if (state.hl) { state.hlT += dt || 0.016; const k = 1 + 0.12 * Math.sin(state.hlT * 5); state.hl.scale.setScalar(k); if (state.hlT > 14) clearHighlight(); }
      });
    } catch (_) { }
    return state.built;
  }
  function applyVisibility(on) {
    const { lux, sow } = variantObjects();
    for (const o of lux) {
      if (on) { if (o.userData.__sowPrevVis === undefined) o.userData.__sowPrevVis = o.visible; o.visible = false; }
      else if (o.userData.__sowPrevVis !== undefined) { o.visible = o.userData.__sowPrevVis; delete o.userData.__sowPrevVis; }
    }
    for (const o of sow) o.visible = !!on;
    for (const c of ctx.variantColliders || []) {
      const want = c.mode === 'lux' ? !on : on;
      if (want) c.box.copy(c.orig); else c.box.makeEmpty();
    }
    for (const it of ctx.variantInteractives || []) {
      try {
        if (it.mode === 'lux') { if (on) { it.prev = it.h.enabled; it.h.enabled = false; } else if (it.prev !== undefined) { it.h.enabled = it.prev; it.prev = undefined; } }
        else it.h.enabled = !!on;
      } catch (_) { }
    }
    try { ctx.renderer.shadowMap.needsUpdate = true; } catch (_) { }
    return { lux: lux.length, sow: sow.length };
  }
  async function enable() {
    if (state.on || state.busy) return state.on;
    const t = T(); const styles = ctx.styles || (t && t.styles);
    state.busy = true; document.body && document.body.classList.add('sow-busy');
    try {
      await ensureBuilt();
      state.prevStyle = styles ? styles.current : null;
      state.switching = true;
      applyVisibility(true);
      state.on = true;
      if (styles) await styles.set('sow');
      state.switching = false;
      document.body && document.body.classList.add('sow-on');
      try { t && t.render && t.render.requestProbes && t.render.requestProbes(200); } catch (_) { }
      emit();
    } catch (e) { console.warn('[sow] enable', e); state.switching = false; }
    finally { state.busy = false; document.body && document.body.classList.remove('sow-busy'); }
    return state.on;
  }
  async function disable(o = {}) {
    if (!state.on || state.busy) return state.on;
    const t = T(); const styles = ctx.styles || (t && t.styles);
    state.busy = true;
    try {
      clearHighlight();
      if (state.built) for (const f of state.built.fans) { f.on = false; f.speed = 0; }
      applyVisibility(false);
      state.on = false;
      document.body && document.body.classList.remove('sow-on');
      state.switching = true;
      if (styles && !o.keepStyle) await styles.set(state.prevStyle || 'modern');
      state.switching = false;
      emit();
    } catch (e) { console.warn('[sow] disable', e); state.switching = false; }
    finally { state.busy = false; }
    return state.on;
  }
  // picking another renovation style (🎨 picker / renders "apply") while in the SOW mode leaves the mode
  try {
    const styles = ctx.styles;
    styles && styles.onChange && styles.onChange((id) => { if (state.on && !state.switching && id !== 'sow') disable({ keepStyle: true }); });
  } catch (_) { }

  /* ---------------- highlight markers (SOW panel → "show me the panel / furnace / AC …") */
  let markerMat = null;
  function clearHighlight() { if (state.hl) { state.hl.parent && state.hl.parent.remove(state.hl); state.hl = null; } }
  function targetPos(id) {
    const b = state.built; if (!b) return null;
    if (id === 'ac') { let p = null; ctx.scene.traverse((o) => { if (!p && o.name === 'ext-ac-unit') { p = new THREE.Vector3(); o.getWorldPosition(p); p.y += 0.25; } }); if (p) return { p, floor: 'outside' }; }
    if (id === 'fan') { const f = b.fans.find((x) => x.room === 'living') || b.fans[0]; if (f) { const p = new THREE.Vector3(); f.obj.getWorldPosition(p); p.y -= 0.18; return { p, floor: 'main' }; } }
    if (id === 'smoke') { const s = (b.targets.smoke || []).find((x) => x.room === 'hall') || (b.targets.smoke || [])[0]; if (s) return { p: new THREE.Vector3(...s.p), floor: s.floor }; }
    const t = b.targets[id]; if (t && t.p) return { p: new THREE.Vector3(...t.p), floor: t.floor };
    return null;
  }
  function highlight(id) {
    clearHighlight();
    const tp = targetPos(id); if (!tp) return false;
    if (!markerMat) markerMat = new THREE.MeshBasicMaterial({ color: 0x43e0ff, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false });
    const g = new THREE.Group(); g.name = 'sow-highlight'; g.userData.floor = tp.floor; g.userData.__core = true; g.renderOrder = 999;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 8, 48), markerMat); ring.rotation.x = Math.PI / 2; g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 8, 48), markerMat); g.add(ring2);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 16), markerMat); arrow.rotation.x = Math.PI; arrow.position.y = 0.72; g.add(arrow);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 8), markerMat); stem.position.y = 1.0; g.add(stem);
    for (const m of g.children) m.renderOrder = 999;
    g.position.copy(tp.p);
    ctx.scene.add(g); state.hl = g; state.hlT = 0;
    return true;
  }
  // panel item → walk to its room (room picker walk) and highlight its object
  async function goItem(id) {
    const it = SOW_BUDGET.find((x) => x.id === id); const t = T(); if (!it || !t) return false;
    if (!state.on) await enable();
    let ok = false;
    try {
      if (t.mode !== 'walk' && t.mode !== 'pano') await t.setMode('walk', { force: true });
      ok = !!(t.pickRoom && t.pickRoom(it.go));
      if (!ok && t.mode === 'walk' && t.nav && t.nav.glideKey !== it.go) ok = !!t.pickRoom(it.go); // re-tap guard
    } catch (e) { console.warn('[sow] goItem', e); }
    if (it.hl) highlight(it.hl);
    return ok || !!it.hl;
  }
  function stats() {
    const { lux, sow } = variantObjects();
    return { on: state.on, busy: state.busy, built: !!state.built, lux: lux.length, sow: sow.length, luxVisible: lux.filter((o) => o.visible).length, sowVisible: sow.filter((o) => o.visible).length,
      colliders: (ctx.variantColliders || []).length, interactives: (ctx.variantInteractives || []).length, fans: state.built ? state.built.fans.length : 0, prevStyle: state.prevStyle, highlight: state.hl ? state.hl.position.toArray() : null };
  }
  const api = {
    get on() { return state.on; }, get busy() { return state.busy; }, get built() { return state.built; },
    enable, disable, toggle: () => (state.on ? disable() : enable()),
    budget: SOW_BUDGET, notInScope: SOW_NOT_IN_SCOPE, total: SOW_TOTAL,
    goItem, highlight, clearHighlight, targetPos, stats,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return api;
}

export default createSow;

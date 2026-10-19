// core-heliwalk.js — V13.1 "🚁 סיור במסוק" (helicopter tour button). Owner: CORE/NAV.
// A small pill in the bottom band of the walk screen (phone: in the empty space between the arrow pad and "פעולה",
// just above the room bar; desktop: above the room bar, centred on it). Pressing it:
//   1. if the visitor is not already standing outside the FRONT of the house → fade + teleport to the front walk
//      (looking at the house),
//   2. a natural walk along the house nav graph (core-nav startGlide, ~1 m/s, the heading looks ahead along the path):
//      front → driveway (west side) → back of the driveway → the door of the parked helicopter in the back yard,
//   3. the visitor turns to the cabin door, the door swings open (an overlay hinged panel cut from the fuselage skin:
//      heli.js / heli-model.js are untouched) and the visitor boards → worlds.enter('heli') — exactly what tapping
//      the parked helicopter does. The heli world opens in the cockpit view and its autopilot city tour takes off by
//      itself (heli.js onEnter: st.pending 6.5 s → takeOff()).
// Any arrow-pad press / movement key / another walk (double-tap, room bar) cancels; pressing the pill again cancels.
// If the walk is blocked on the way (not cancelled by the visitor) it fades to the door and boards anyway.
// No side effects on import (core calls createHeliWalk()).

const EYE = 1.6;
const DOOR = { z0: -1.36, z1: -0.32, y0: 0.70, y1: 1.96, open: 1.2 }; // cabin door region in the heli model frame (sliding-door window at z −1.24…−0.42)
const STAND = 2.35; // metres out from the fuselage centre line where the visitor stops in front of the door

export function createHeliWalk(env) {
  const { THREE, plan, player } = env;
  const btn = env.btn;
  const body = typeof document !== 'undefined' ? document.body : null;
  const tr = (s) => { try { return env.tr ? env.tr(s) : s; } catch (_) { return s; } };
  const toast = (m, ms) => { try { env.toast && env.toast(m, ms); } catch (_) {} };
  const nav = () => env.nav && env.nav();
  const worlds = () => env.worlds && env.worlds();
  let state = 'idle'; // idle | prep | walking | boarding
  let retries = 0, token = 0, userT = -1e9, door = null, lastPhase = '', lastRoute = null, blockedAt = null;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = []; // phases (tests)
  const phase = (p) => { lastPhase = p; log.push(p); if (log.length > 40) log.shift(); };

  /* ---------------- geometry helpers */
  function parked() { try { const p = env.getParked && env.getParked(); return p && p.model && p.model.group ? p : null; } catch (_) { return null; } }
  function toWorld(P, x, y, z) { P.model.group.updateMatrixWorld(true); return P.model.group.localToWorld(new THREE.Vector3(x, y, z)); }
  function node(id) { try { const g = nav() && nav().homeGraph; const n = g && g.node(id); return n ? { x: n.x, y: n.y, z: n.z } : null; } catch (_) { return null; } }
  function frontStart() { return node('out:walk_s') || node('out:frontwalk') || { x: plan.W / 2, y: 0, z: plan.D + 6 }; }
  // the side of the helicopter that faces the driveway (west) → +1 / −1 in the model frame
  function doorSide(P) {
    const ref = node('out:drive_back') || { x: -3, y: 0, z: -4 };
    const a = toWorld(P, STAND, 0, (DOOR.z0 + DOOR.z1) / 2), b = toWorld(P, -STAND, 0, (DOOR.z0 + DOOR.z1) / 2);
    return Math.hypot(a.x - ref.x, a.z - ref.z) <= Math.hypot(b.x - ref.x, b.z - ref.z) ? 1 : -1;
  }
  function standPoint(P, s) {
    const zm = (DOOR.z0 + DOOR.z1) / 2;
    const p = toWorld(P, s * STAND, 0, zm + 0.15), d = toWorld(P, s * 0.9, 1.2, zm);
    let feet = 0;
    try { const n = nav(); if (n && n.groundY) feet = n.groundY(p.x, p.z, 0); } catch (_) {}
    return { x: p.x, y: feet, z: p.z, yaw: Math.atan2(-(d.x - p.x), -(d.z - p.z)) };
  }
  function inFront() {
    const s = player.state, f = frontStart();
    return s.feet < 0.35 && s.z > plan.D + 0.6 && s.z < f.z + 5 && s.x > -8 && s.x < plan.W + 8;
  }

  /* ---------------- door overlay (hinged panel cut from the fuselage skin + a dark opening behind it) */
  function buildDoor(P, s) {
    if (door && door.side === s && door.P === P) return door;
    disposeDoor();
    const model = P.model, fus = model.parts && model.parts.fuselage, M = model.parts && model.parts.M;
    if (!fus || !M || !M.skin) return null;
    model.group.updateMatrixWorld(true);
    const NZ = 12, NY = 12;
    const rc = new THREE.Raycaster();
    const inv = new THREE.Matrix4().copy(model.group.matrixWorld).invert();
    const pts = [], uvs = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NZ; i++) {
      const z = DOOR.z0 + (DOOR.z1 - DOOR.z0) * (i / NZ), y = DOOR.y0 + (DOOR.y1 - DOOR.y0) * (j / NY);
      const o = toWorld(P, s * 3, y, z), t = toWorld(P, 0, y, z);
      rc.set(o, t.sub(o).normalize()); rc.far = 3.2;
      const h = rc.intersectObject(fus, false)[0];
      if (!h || !h.uv) return null;
      const lp = h.point.clone().applyMatrix4(inv);
      pts.push(lp); uvs.push(h.uv.x, h.uv.y);
    }
    const mk = (out) => {
      const pos = new Float32Array(pts.length * 3);
      pts.forEach((p, k) => { pos[k * 3] = p.x + s * out; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z; });
      const idx = [];
      for (let j = 0; j < NY; j++) for (let i = 0; i < NZ; i++) {
        const a = j * (NZ + 1) + i, b = a + 1, c = a + NZ + 1, d = c + 1;
        if (s > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    };
    // hinge: the front edge at mid height
    const hi = Math.round(NY / 2) * (NZ + 1), hinge = pts[hi].clone(); hinge.x += s * 0.012;
    const leafG = mk(0.012); leafG.translate(-hinge.x, 0, -hinge.z);
    const leafM = M.skin.clone(); leafM.side = THREE.DoubleSide; leafM.name = 'heliwalk:door';
    const leaf = new THREE.Mesh(leafG, leafM); leaf.name = 'heliwalk:doorLeaf'; leaf.castShadow = true;
    const pivot = new THREE.Group(); pivot.name = 'heliwalk:doorPivot'; pivot.position.set(hinge.x, 0, hinge.z); pivot.add(leaf);
    const holeM = new THREE.MeshStandardMaterial({ color: 0x0d1117, roughness: 0.92, metalness: 0.0 }); holeM.name = 'heliwalk:opening';
    const hole = new THREE.Mesh(mk(0.005), holeM); hole.name = 'heliwalk:doorOpening';
    const grp = new THREE.Group(); grp.name = 'heliwalk:door'; grp.add(hole, pivot); grp.visible = false;
    grp.traverse((o) => { o.userData.floor = 'outside'; o.userData.room = 'exterior'; o.userData.heliParked = true; });
    model.group.add(grp);
    door = { P, side: s, grp, pivot, leaf, hole, angle: 0, anim: null };
    return door;
  }
  function setDoor(a) { if (!door) return; door.angle = a; door.pivot.rotation.y = door.side * a; door.grp.visible = a > 0.001; }
  function openDoor(ms = 950) {
    if (!door) return Promise.resolve();
    const d = door, a0 = d.angle, t0 = now();
    try { const A = env.audio; A && A.noise && A.noise(0.16, { type: 'pink', filter: 'bandpass', freq: 1400, gain: 0.05 }); A && A.tone && A.tone(240, 0.08, { type: 'square', gain: 0.02 }); } catch (_) {}
    return new Promise((res) => {
      const step = () => {
        if (door !== d) return res();
        const k = Math.min(1, (now() - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        setDoor(a0 + (DOOR.open - a0) * e);
        if (k < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
      setTimeout(res, ms + 600); // a background tab never stalls boarding
    });
  }
  function closeDoor() { if (door) setDoor(0); }
  function disposeDoor() {
    if (!door) return;
    try { door.grp.parent && door.grp.parent.remove(door.grp); door.leaf.geometry.dispose(); door.leaf.material.dispose(); door.hole.geometry.dispose(); door.hole.material.dispose(); } catch (_) {}
    door = null;
  }

  /* ---------------- the walk */
  const seg = (a, b) => {
    let r = null;
    try { r = nav().planRoute(a, b); } catch (_) { r = null; }
    return r && r.length >= 2 ? r : [{ x: a.x, y: a.y, z: a.z, door: null }, { x: b.x, y: b.y, z: b.z, door: null }];
  };
  function route(from, via, to) {
    const out = [];
    let a = from;
    for (const b of [...via, to]) {
      if (Math.hypot(b.x - a.x, b.z - a.z) < 0.6) continue;
      const r = seg(a, b);
      for (let k = out.length ? 1 : 0; k < r.length; k++) out.push({ x: r[k].x, y: r[k].y, z: r[k].z, door: r[k].door || null });
      a = b;
    }
    if (!out.length) out.push({ x: from.x, y: from.y, z: from.z, door: null });
    if (out.length < 2) out.push({ x: to.x, y: to.y, z: to.z, door: null });
    return out;
  }
  function viaPoints(from, stand) {
    // around the west side (driveway) when the door faces west, else the east side
    const west = stand.x < plan.W / 2;
    const ids = west ? ['out:drive_front', 'out:drive_back'] : ['out:eastside', 'out:back_ne'];
    const pts = ids.map(node).filter(Boolean);
    // skip waypoints already behind us (the visitor may start beside the house, or re-plan half-way): the walk goes
    // north (−z), so a waypoint is ahead when it is north of us — or, while still in front of the house and not yet
    // on that side strip, the side's front waypoint. (V13.1 fix: was `ahead || dist > 2.5`, which sent a re-plan from
    // the back of the driveway all the way back to its front.)
    const inFrontArea = from.z > plan.D;
    return pts.filter((p) => p.z < from.z - 0.5 || (inFrontArea && p.z > plan.D && Math.abs(p.x - from.x) > 2.5));
  }
  function setOn(on) { if (btn) { btn.classList.toggle('on', !!on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); } }
  function finish(msg) {
    state = 'idle'; token++; setOn(false);
    if (msg) toast(msg, 1800);
  }
  function cancel(msg = 'ההליכה בוטלה') {
    if (state === 'idle' || state === 'boarding') return false;
    const n = nav();
    phase('cancel');
    finish(null);
    try { if (n && n.glideKey === '__heli') n.stopGlide(); } catch (_) {}
    if (msg) toast(msg, 1600);
    return true;
  }
  // core calls this on any arrow-pad press / movement key
  function userInput() { userT = now(); if (state === 'prep' || state === 'walking') cancel(); }

  async function start() {
    if (state !== 'idle') { cancel(); return false; }
    const W = worlds(), n = nav();
    if (!W || W.busy || !env.atHome() || env.getMode() !== 'walk' || !n || !n.homeGraph) return false;
    const P = parked();
    if (!P) { toast('המסוק עוד מתכונן — נסו שוב בעוד רגע', 2200); return false; }
    try { env.audio && env.audio.resume && env.audio.resume(); } catch (_) {}
    const my = ++token; state = 'prep'; setOn(true); phase('start');
    const alive = () => token === my && state !== 'idle';
    const s = doorSide(P);
    try { buildDoor(P, s); } catch (e) { console.warn('[heliwalk] door', e); door = null; }
    closeDoor();
    const stand = standPoint(P, s);
    // 1. to the front of the house
    if (!inFront()) {
      phase('teleport-front');
      const f = frontStart();
      try { n.stopGlide(); } catch (_) {}
      await env.fade(1, 450);
      if (!alive()) { await env.fade(0, 250); return false; }
      player.teleport([f.x, f.y + EYE, f.z], 0); player.state.pitch = -0.04; player.apply && player.apply();
      await wait(120);
      await env.fade(0, 450);
      if (!alive()) return false;
      toast('🚁 יוצאים לסיור במסוק — הולכים מסביב לבית', 2200);
      await wait(900);
      if (!alive()) return false;
    } else toast('🚁 יוצאים לסיור במסוק — הולכים מסביב לבית', 2200);
    if (env.getMode() !== 'walk' || !env.atHome()) { finish(null); return false; }
    // 2. natural walk around the house to the helicopter door
    state = 'walking'; retries = 0;
    if (!walkLeg(my, stand)) return onWalkEnd(my, false, stand, null, true);
    if (env.showHint) try { env.showHint('הולכים אל המסוק · נגיעה בחצים עוצרת', 3600); } catch (_) {}
    return true;
  }
  // one glide from where the visitor stands now (the remaining waypoints) to the door
  function walkLeg(my, stand) {
    const n = nav(), s0 = player.state, from = { x: s0.x, y: s0.feet, z: s0.z };
    const r = route(from, viaPoints(from, stand), stand);
    phase('walk'); lastRoute = r;
    return n.startGlide(r, {
      key: '__heli', label: '🚁 סיור במסוק', level: true, arriveYaw: stand.yaw,
      onEnd: (arrived, g) => { const why = g && g.why; setTimeout(() => onWalkEnd(my, arrived, stand, why), 0); },
    });
  }
  async function onWalkEnd(my, arrived, stand, why, failed) {
    if (token !== my || state !== 'walking') return;
    const n = nav();
    if (!arrived) {
      const user = why === 'input' || why === 'mode' || now() - userT < 1500 || (n && n.gliding) || env.getMode() !== 'walk' || !env.atHome();
      if (user && !failed) { phase('cancel'); finish('ההליכה בוטלה'); return; }
      // stopped on the way without the visitor's doing (stuck on an obstacle, glide time limit …): re-plan from here
      // twice, then fade to the door
      if (!failed && retries < 2) { retries++; phase('replan:' + (why || '?')); if (walkLeg(my, stand)) return; }
      phase('blocked→teleport:' + (why || '?')); blockedAt = { x: +player.state.x.toFixed(2), z: +player.state.z.toFixed(2) };
      await env.fade(1, 400);
      if (token !== my) { await env.fade(0, 250); return; }
      player.teleport([stand.x, stand.y + EYE, stand.z], stand.yaw); player.apply && player.apply();
      await wait(100); await env.fade(0, 400);
      if (token !== my) return;
    }
    await board(my, stand);
  }
  async function board(my, stand) {
    state = 'boarding'; phase('arrived');
    // turn to the door
    const t0 = now();
    while (now() - t0 < 1400) {
      if (token !== my) return;
      const d = Math.atan2(Math.sin(stand.yaw - player.state.yaw), Math.cos(stand.yaw - player.state.yaw));
      if (Math.abs(d) < 0.06) break;
      await wait(60);
    }
    if (token !== my) return;
    phase('door');
    toast('🚁 עולים למסוק', 1600);
    await openDoor();
    await wait(250);
    if (token !== my) return;
    phase('enter');
    const W = worlds();
    let okE = false;
    try {
      const P = parked();
      okE = !!(await (P && typeof P.board === 'function' ? P.board() : W.enterWorld('heli')));
    } catch (e) { console.warn('[heliwalk] board', e); okE = false; }
    if (token !== my) return;
    phase(okE ? 'in-heli' : 'enter-failed');
    if (!okE) closeDoor();
    finish(null);
  }

  /* ---------------- button + layout */
  const vis = (e) => { if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? r : null; };
  function wanted() {
    if (!body || !btn) return false;
    if (!parked() || env.getMode() !== 'walk' || !env.atHome()) return false;
    const C = body.classList;
    for (const c of ['loading', 'gallery-open', 'tools-open', 'measuring', 'pt-running', 'pt-viewing', 'world-busy', 'world-away', 'sow-on']) if (C.contains(c)) return false;
    const intro = document.getElementById('intro'); if (intro && intro.classList.contains('show')) return false;
    const help = document.getElementById('help'); if (help && help.classList.contains('show')) return false;
    return true;
  }
  function layout() {
    if (!btn) return;
    const show = wanted() || state !== 'idle' && state !== 'boarding' && env.atHome();
    btn.classList.toggle('show', !!show);
    if (!show) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const b = btn.getBoundingClientRect(), bw = b.width || 120, bh = b.height || 30;
    const pk = vis(document.getElementById('roomPicker'));
    const act = vis(document.getElementById('btnAct'));
    const dp = document.getElementById('dpad');
    let dpR = null; if (vis(dp)) for (const e of dp.querySelectorAll('button')) { const r = vis(e); if (r && (!dpR || r.right > dpR.right)) dpR = r; }
    const gutB = 16;
    let bottom = pk ? vh - pk.top + 8 : gutB + 48 + 8; // no bar (yet): keep its place, so the pill does not jump when it appears
    let cx;
    if (dpR && act) cx = (dpR.right + act.left) / 2; // phone: centred in the gap between ▶ and "פעולה"
    else if (pk) cx = (pk.left + pk.right) / 2; // desktop: centred over the room bar
    else cx = vw / 2;
    let left = Math.round(Math.max(8, Math.min(vw - bw - 8, cx - bw / 2)));
    // never on top of the arrow pad or the action button
    const box = () => ({ l: left, r: left + bw, t: vh - bottom - bh, b: vh - bottom });
    const hit = (r) => { const q = box(); return r && q.l < r.right + 4 && q.r > r.left - 4 && q.t < r.bottom + 4 && q.b > r.top - 4; };
    const obs = [act]; if (vis(dp)) for (const e of dp.querySelectorAll('button')) obs.push(vis(e));
    for (let k = 0; k < 8 && obs.some(hit); k++) {
      const o = obs.find(hit); if (!o) break;
      bottom = Math.max(bottom, vh - o.top + 6);
    }
    btn.style.left = left + 'px'; btn.style.right = 'auto';
    btn.style.bottom = Math.round(bottom) + 'px';
  }
  let acc = 0;
  function update(dt) {
    acc += dt || 0.016;
    if (acc < 0.2) return;
    acc = 0;
    try { layout(); } catch (_) {}
  }
  if (btn) {
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); start(); });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => { try { layout(); } catch (_) {} });
    window.addEventListener('keydown', (e) => {
      if (state !== 'prep' && state !== 'walking') return;
      if (e.target && /input|textarea|select/i.test(e.target.tagName || '')) return;
      if (/^(KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Escape)$/.test(e.code)) userInput();
    }, true);
  }
  function onWorld(id) {
    if (id === 'home') { closeDoor(); if (state === 'boarding') finish(null); }
    else if (state === 'prep' || state === 'walking') finish(null);
    try { layout(); } catch (_) {}
  }
  return {
    start, cancel, userInput, update, layout, onWorld,
    get state() { return state; }, get phase() { return lastPhase; }, get log() { return log.slice(); },
    get door() { return door; }, get route() { return lastRoute; }, get blockedAt() { return blockedAt; }, standPoint: () => { const P = parked(); return P ? standPoint(P, doorSide(P)) : null; },
    dispose() { disposeDoor(); },
  };
}

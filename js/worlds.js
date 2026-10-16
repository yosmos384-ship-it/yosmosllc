// worlds.js — V10 "worlds": the house ('home') + independent worlds (limo, casino, …) the visitor can travel to.
// Owner: CORE/NAV. No side effects on import (core calls createWorlds()).
//
// A world = its own THREE.Group + colliders / walkables / interactives / lights / rooms / nav graph / spawn point.
// Only one world is active: the others are hidden (group.visible = false) and their per-frame hooks are paused.
//
//   ctx.worlds.register(id, { he: 'שם', build: async (wctx) => result })
//   ctx.worlds.register(id, { load: () => import('./limo.js').then((m) => m.buildWorld) })   // load → fn OR module
//        (a module is searched for buildWorld | build | default; its I18N export is merged into i18n)
//   ctx.worlds.registerModule(id, './limo.js', { he: 'לימוזינה' })              // lazy dynamic import; missing file → toast "בקרוב"
//   ctx.worlds.enter(id, { spawn: { pos: Vector3 | [x, y, z] (FEET point), yaw } }) → Promise<boolean>   (= enterWorld)
//   ctx.worlds.goHome(opts)  ·  ctx.worlds.current() → 'home' | id  (also .id getter)  ·  ctx.worlds.onChange(fn(id, prevId))
//
// build(wctx) is called once, the first time the world is entered (loading overlay over a black fade). It returns
//   { group?, spawn: { pos: Vector3 (feet), yaw }, onEnter?(info), onExit?(), update?(dt, t),
//     minimap?: { rooms: [{ he, r: [x0, z0, x1, z1] }], bounds?: [x0, z0, x1, z1] },
//     nav?: { nodes: [{ id, x, y (feet), z, room?, he?, hub? }], edges?: [[idA, idB], …] },
//     env?: { sky?: bool, sun?: bool, hemi?: bool, stars?: bool, fog?: THREE.Fog | null, background?: Color | Texture | null,
//             environment?: Texture | null, exposure?: number } }
// wctx = ctx (prototype) + scoped methods — see makeWctx() below and CHANGELOG-integration.md "V10 CORE".

export const HOME = 'home';

export function createWorlds(env) {
  const { THREE, scene } = env;
  const worlds = new Map();
  const subs = new Set();
  let cur = HOME, busy = false;
  let homeSaved = null;      // { eye:[x,y,z], yaw } where the visitor left the house
  let homeHidden = null;     // Map(Object3D → visible) while away
  let envSaved = null;       // scene / light state while a world with env overrides is active
  const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
  const t = (s, ...a) => { try { return env.i18n && env.i18n.t ? env.i18n.t(s, ...a) : s; } catch (_) { return s; } };

  worlds.set(HOME, { id: HOME, he: 'הביתה', built: true, home: true, def: {}, res: {}, group: null, coll: env.homeColl, graph: null, rooms: [] });

  /* ------------------------------------------------------------------ registry */
  function register(id, def = {}) {
    id = String(id);
    if (!id || id === HOME) return null;
    const W = { id, he: def.he || id, icon: def.icon || '', def, built: false, building: null, res: null, group: null, coll: null, graph: null, rooms: [], wctx: null, error: null };
    worlds.set(id, W);
    return W;
  }
  // dynamic import, guarded: a module that does not exist yet → the world says "בקרוב" (coming soon)
  function registerModule(id, file, o = {}) {
    return register(id, Object.assign({}, o, { load: () => import(file) }));
  }

  /* ------------------------------------------------------------------ wctx (scoped ctx for a world's build) */
  function makeWctx(W) {
    const coll = W.coll;
    const wctx = Object.create(env.ctx);
    Object.assign(wctx, {
      worldId: W.id,
      group: W.group,
      addCollider: (b) => coll.addBox(b),
      addColliderFromObject: (o) => coll.addFromObject(o),
      addDynamicCollider: (o) => coll.addDynamic(o),
      addWalkable: (m) => coll.addWalkable(m),
      addInteractive: (obj, o = {}) => env.addInteractive(obj, Object.assign({}, o, { world: W.id })),
      onUpdate: (fn) => env.onUpdate(fn, W.id),
      registerRoom: (name, o = {}) => {
        if (!name || !o.box || !o.box.isBox3) return;
        W.rooms.push({ key: String(name), he: o.he || String(name), box: o.box.clone(), pick: o.pick !== false, floorY: isFinite(o.floorY) ? o.floorY : o.box.min.y });
        env.registerRoom(name, Object.assign({}, o, { world: W.id, floor: o.floor || 'main' }));
      },
      addLamp: (light, o = {}) => env.addLamp(light, Object.assign({ floor: 'main', raw: true }, o, { world: W.id })),
      lampsInRoom: (room) => env.lampsInRoom(room, W.id),
      addPano: () => null, // 360 tour nodes exist only in the house
      enterWorld: (id, o) => enterWorld(id, o),
      goHome: (o) => enterWorld(HOME, o),
      worlds: api,
      i18n: env.i18n,
      t: env.i18n && env.i18n.t, tr: env.i18n && env.i18n.tr,
      radio: env.radio || null,
      openRadio: () => { try { env.openRadio && env.openRadio(); } catch (_) {} },
      player: env.player,
      collision: coll,
      buildNavGraph: (spec) => env.buildGraph(Object.assign({ world: coll }, spec || {})),
      // loading overlay progress while build() runs: frac 0…1 (→ "NN%"), optional label (Hebrew, translated by i18n)
      progress: (frac, label) => setProgress(frac, label),
    });
    return wctx;
  }

  /* ------------------------------------------------------------------ lazy build */
  const TIMEOUT = 90000;
  function missing(msg) { const e = new Error(msg || 'missing'); e.code = 'missing'; return e; }
  async function build(W) {
    if (W.built) return W;
    if (W.building) return W.building;
    W.building = (async () => {
      W.coll = env.createCollision();
      const group = new THREE.Group();
      group.name = 'world:' + W.id; group.userData.__world = W.id; group.userData.floor = 'main'; group.visible = false;
      scene.add(group);
      W.group = group;
      const wctx = (W.wctx = makeWctx(W));
      let fn = W.def.build;
      if (!fn && W.def.load) {
        let mod;
        try { mod = await W.def.load(); } catch (e) { throw missing(String((e && e.message) || e)); }
        if (!mod) throw missing('empty module');
        if (typeof mod === 'function') fn = mod;
        else {
          if (mod.I18N) { try { env.i18n && env.i18n.extend && env.i18n.extend(mod.I18N); } catch (_) {} }
          fn = mod.buildWorld || mod.build || (mod.default && (mod.default.buildWorld || mod.default.build)) || (typeof mod.default === 'function' ? mod.default : null);
          W.module = mod;
        }
        if (!fn) throw missing('no build(wctx) export');
      }
      if (!fn) throw missing('no build');
      let to;
      const res = await Promise.race([
        Promise.resolve().then(() => fn(wctx)),
        new Promise((_, rej) => { to = setTimeout(() => rej(new Error('timeout')), TIMEOUT); }),
      ]).finally(() => clearTimeout(to));
      W.res = res || {};
      if (W.res.group && W.res.group !== group && !W.res.group.parent) group.add(W.res.group);
      group.traverse((o) => { if (o.userData && o.userData.floor === undefined) o.userData.floor = 'main'; });
      group.updateMatrixWorld(true);
      try { W.coll.refreshWalkables(); W.coll.updateDynamic(); } catch (_) {}
      // nav graph: the world's own nodes, or its rooms' centres + the spawn point, linked by line of sight
      try {
        const nv = W.res.nav || {};
        const nodes = (nv.nodes || []).slice();
        const sp = spawnOf(W);
        if (!nodes.length && sp) nodes.push({ id: 'spawn', x: sp.x, y: sp.y, z: sp.z, hub: false });
        const rooms = W.rooms.map((r) => ({ key: r.key, he: r.he, r: [r.box.min.x, r.box.min.z, r.box.max.x, r.box.max.z], y0: r.box.min.y, y1: r.box.max.y, floorY: r.floorY }));
        W.graph = env.buildGraph({ world: W.coll, nodes, edges: nv.edges, rooms, maxD: nv.maxD });
      } catch (e) { W.graph = null; console.warn('[worlds] graph', W.id, e); }
      W.built = true;
      return W;
    })();
    try { return await W.building; } catch (e) {
      W.building = null; W.error = e;
      try { if (W.group) { scene.remove(W.group); } } catch (_) {}
      W.group = null; W.coll = null; W.rooms = [];
      throw e;
    }
  }
  function spawnOf(W) {
    const s = W.res && W.res.spawn; if (!s) return null;
    const p = s.pos || s.position || s;
    const v = Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p;
    if (!v || !isFinite(v.x) || !isFinite(v.z)) return null;
    return { x: v.x, y: isFinite(v.y) ? v.y : 0, z: v.z, yaw: isFinite(s.yaw) ? s.yaw : 0 };
  }

  /* ------------------------------------------------------------------ home hide / show */
  function hideHome() {
    if (homeHidden) return;
    homeHidden = new Map();
    for (const o of scene.children) {
      if (!o || (o.userData && (o.userData.__core || o.userData.__world))) continue;
      homeHidden.set(o, o.visible); o.visible = false;
    }
  }
  function showHome() {
    if (!homeHidden) return;
    for (const [o, v] of homeHidden) o.visible = v;
    homeHidden = null;
  }

  /* ------------------------------------------------------------------ per-world environment */
  function applyEnv(W) {
    const e = (W.res && W.res.env) || null;
    const R = env.refs || {};
    if (!e) return;
    envSaved = {
      fog: scene.fog, bg: scene.background, envTex: scene.environment,
      sky: R.sky ? R.sky.visible : null, sun: R.sun ? R.sun.visible : null, hemi: R.hemi ? R.hemi.visible : null, stars: R.stars ? R.stars.visible : null,
    };
    if ('fog' in e) scene.fog = e.fog || null;
    if ('background' in e) scene.background = e.background || null;
    if ('environment' in e) scene.environment = e.environment || null;
    if (e.sky === false && R.sky) R.sky.visible = false;
    if (e.sun === false && R.sun) R.sun.visible = false;
    if (e.hemi === false && R.hemi) R.hemi.visible = false;
    if (e.stars === false && R.stars) R.stars.visible = false;
  }
  function restoreEnv() {
    if (!envSaved) return;
    const R = env.refs || {}, s = envSaved; envSaved = null;
    scene.fog = s.fog; scene.background = s.bg; scene.environment = s.envTex;
    if (R.sky && s.sky != null) R.sky.visible = s.sky;
    if (R.sun && s.sun != null) R.sun.visible = s.sun;
    if (R.hemi && s.hemi != null) R.hemi.visible = s.hemi;
    if (R.stars && s.stars != null) R.stars.visible = s.stars;
  }

  /* ------------------------------------------------------------------ loading overlay */
  function showLoading(name) {
    const el = $('worldLoad'); if (!el) return;
    const tx = el.querySelector('.wl-txt'); if (tx) tx.textContent = name ? t('טוען {0}…', t(name)) : t('טוען עולם…');
    setProgress(0);
    el.classList.add('show');
  }
  function hideLoading() { const el = $('worldLoad'); if (el) el.classList.remove('show'); setProgress(null); }
  function setProgress(frac, label) {
    const el = $('worldLoad'); if (!el) return;
    const pc = el.querySelector('.wl-pct'), sub = el.querySelector('.wl-sub');
    if (pc) pc.textContent = isFinite(frac) && frac !== null ? Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%' : '';
    if (sub) sub.textContent = label ? t(String(label)) : '';
  }

  /* ------------------------------------------------------------------ transition */
  async function enterWorld(id, o = {}) {
    id = String(id || HOME);
    const W = worlds.get(id);
    if (!W) { env.toast && env.toast('🚧 בקרוב', 2200); return false; }
    if (busy) return false;
    if (id === cur && !o.force) return false;
    busy = true;
    const body = typeof document !== 'undefined' ? document.body : null;
    body && body.classList.add('world-busy');
    const ms = isFinite(o.fade) ? o.fade : 600;
    try {
      try { env.beforeTravel && env.beforeTravel(); } catch (_) {}
      await env.fade(1, ms);
      if (!W.built) {
        showLoading(W.he);
        try { await build(W); } catch (e) {
          hideLoading();
          console.warn('[worlds] build failed', id, e);
          await env.fade(0, 360);
          env.toast && env.toast(e && e.code === 'missing' ? '🚧 בקרוב' : 'הטעינה נכשלה — חוזרים', 2600);
          if (!(e && e.code === 'missing')) env.reportError && env.reportError('עולם: ' + W.he, e);
          return false;
        }
        hideLoading();
      }
      const prevId = cur, P = worlds.get(prevId);
      // ---- leave
      try { P.res && P.res.onExit && P.res.onExit({ to: id }); } catch (e) { console.warn('[worlds] onExit', e); }
      if (prevId === HOME) {
        try { const s = env.player.state; homeSaved = { eye: [s.x, s.feet + 1.6, s.z], yaw: s.yaw }; } catch (_) { homeSaved = null; }
        hideHome();
        try { env.homeAway && env.homeAway(true, W); } catch (_) {}
      } else {
        if (P.group) P.group.visible = false;
        restoreEnv();
      }
      // ---- activate
      cur = id;
      if (id === HOME) {
        showHome();
        try { env.homeAway && env.homeAway(false, W); } catch (_) {}
        env.collision.use(env.homeColl);
        env.setGraph(null);
      } else {
        W.group.visible = true;
        applyEnv(W);
        env.collision.use(W.coll);
        env.setGraph(W.graph);
        try { env.render && env.render.setAway(true, { exposure: W.res.env && W.res.env.exposure }); } catch (_) {}
      }
      // ---- spawn (feet point → eye)
      let eye, yaw;
      const sp = o.spawn ? spawnFrom(o.spawn) : null;
      if (sp) { eye = [sp.x, sp.y + 1.6, sp.z]; yaw = sp.yaw; }
      else if (id === HOME && homeSaved) { eye = homeSaved.eye; yaw = homeSaved.yaw; if (env.homeReturnYaw) { const y2 = env.homeReturnYaw(eye); if (isFinite(y2)) yaw = y2; } }
      else if (id === HOME) { eye = env.homeStart.p; yaw = env.homeStart.yaw; }
      else { const s = spawnOf(W) || { x: 0, y: 0, z: 0, yaw: 0 }; eye = [s.x, s.y + 1.6, s.z]; yaw = s.yaw; }
      try { env.onWorld && env.onWorld(id, prevId, W); } catch (e) { console.warn('[worlds] onWorld', e); }
      await env.placePlayer(eye, yaw);
      try { W.res && W.res.onEnter && W.res.onEnter({ from: prevId }); } catch (e) { console.warn('[worlds] onEnter', e); }
      for (const f of subs) { try { f(id, prevId); } catch (_) {} }
      await env.nextFrame(); await env.nextFrame();
      await env.fade(0, ms);
      return true;
    } catch (e) {
      console.error('[worlds] enterWorld', e);
      try { await env.fade(0, 300); } catch (_) {}
      return false;
    } finally {
      busy = false;
      body && body.classList.remove('world-busy');
      hideLoading();
    }
  }
  function spawnFrom(s) {
    const p = s.pos || s.position || s;
    const v = Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p;
    if (!v || !isFinite(v.x) || !isFinite(v.z)) return null;
    return { x: v.x, y: isFinite(v.y) ? v.y : 0, z: v.z, yaw: isFinite(s.yaw) ? s.yaw : 0 };
  }

  /* ------------------------------------------------------------------ per frame */
  function update(dt, time) {
    if (cur === HOME) return;
    const W = worlds.get(cur);
    if (W && W.res && typeof W.res.update === 'function') { try { W.res.update(dt, time); } catch (e) { if (!W.updErr) { W.updErr = true; console.warn('[worlds] update', cur, e); } } }
  }

  const api = {
    HOME, register, registerModule, enterWorld, enter: enterWorld, goHome: (o) => enterWorld(HOME, o), update, build: (id) => { const W = worlds.get(id); return W ? build(W) : Promise.reject(new Error('unknown world')); },
    current() { return cur; }, get id() { return cur; }, get isHome() { return cur === HOME; }, get busy() { return busy; },
    get active() { return worlds.get(cur); },
    get(id) { return worlds.get(id) || null; },
    list() { return [...worlds.values()].map((W) => ({ id: W.id, he: W.he, built: !!W.built, active: W.id === cur })); },
    rooms(id) { const W = worlds.get(id || cur); return W ? W.rooms.slice() : []; },
    onChange(fn) { if (typeof fn === 'function') subs.add(fn); return () => subs.delete(fn); },
    get homeSaved() { return homeSaved; },
  };
  return api;
}

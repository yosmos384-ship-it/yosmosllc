// casino.js — V10 CASINO world: "Eakin Grand Casino" (fictional; classic-Hollywood art-deco glamour).
// PLAY CHIPS ONLY — no real money, no deposits / payments / links. 21+ note everywhere. No real trademarks.
// Loaded lazily by js/worlds.js (registerModule('casino', './casino.js')) the first time the visitor enters:
//   build(wctx) → { group, spawn:{pos (feet), yaw}, onEnter, onExit, update, minimap, nav, env }
// Every game is opened by walking to its table / machine and tapping it (core interactives, ≤ 2.6 m) or from the
// "משחקים" (Games) menu in the casino HUD, which walks you to the table along the nav graph and opens it.
// Games (real rules engines, crypto RNG, one shared play-chip bankroll in memory — refresh resets it to 10,000):
//   blackjack ×6 · American roulette ×3 · craps ×2 · baccarat ×2 · poker room with 6 Texas Hold'em tables (vs 5 bots) ·
//   186 slot machines (video slots "Silver Screen Nights" / "Ohio Gold Rush" / "Buckeye Jackpot" + classic 3-reel
//   "Marquee 7s") · video poker (bar top, Jacks or Better 9/6) · cashier (free refill) · bar · stage · steakhouse (decor).
// The table a game was opened from animates in 3D (roulette ball, dice, dealt cards) via ui.fx → venue.fx.
// No side effects on import.
import { createCasinoUI } from './casino-ui.js';
import { mountBlackjack, mountBaccarat, mountVideoPoker } from './casino-ui-cards.js';
import { mountRoulette, mountCraps } from './casino-ui-table.js';
import { mountSlots } from './casino-ui-slots.js';
import { mountHoldem } from './casino-ui-holdem.js';
import { createCasinoAudio } from './casino-audio.js';
import { bank, rngInfo } from './casino-rng.js';
import { ALL_SLOT_KEYS } from './casino-slots.js';
import { L, onLang, CASINO_STRINGS, registerCasinoStrings } from './casino-i18n.js';

/** worlds.js merges this into the tour's dictionary (he → en / es) */
export const I18N = CASINO_STRINGS;
export const GAMES = { blackjack: mountBlackjack, roulette: mountRoulette, craps: mountCraps, baccarat: mountBaccarat, slots: mountSlots, videopoker: mountVideoPoker, holdem: mountHoldem };
const MENU = [
  ['bj3', 'm_blackjack'], ['roulette2', 'm_roulette'], ['craps1', 'm_craps'], ['baccarat1', 'm_baccarat'], ['holdem5', 'm_holdem'], ['vp5', 'm_videopoker'],
  ['slot-hollywood', 'm_slots_hollywood'], ['slot-gold', 'm_slots_gold'], ['slot-buckeye', 'm_slots_buckeye'], ['slot-classic', 'm_slots_classic'],
  ['cage', 'm_cage'], ['bar', 'm_bar'], ['stage', 'm_stage'],
];

export async function build(wctx) {
  const THREE = wctx.THREE;
  const quality = wctx.quality === 'low' ? 'low' : 'high';
  try { registerCasinoStrings(); } catch (_) {}
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const { buildVenue } = await import('./casino-venue.js'); // (three addons only here → casino.js imports cleanly in node)
  const venue = buildVenue(THREE, { quality, renderer: wctx.renderer, L });
  const group = wctx.group || new THREE.Group();
  group.add(venue.group);
  group.updateMatrixWorld(true);
  const he = CASINO_STRINGS.he;

  // ---- collision, walkable, rooms
  for (const b of venue.colliders) { try { wctx.addCollider(b); } catch (_) {} }
  try { wctx.addWalkable(venue.walkable); } catch (_) {}
  for (const r of venue.rooms) {
    try { wctx.registerRoom(r.key, { he: he[r.labelKey], label: r.labelKey, floor: 'main', box: new THREE.Box3(new THREE.Vector3(r.r[0], -0.5, r.r[1]), new THREE.Vector3(r.r[2], 6, r.r[3])), pick: r.pick !== false }); } catch (_) {}
  }

  // ---- audio + UI
  const audio = createCasinoAudio(wctx.audio || null);
  const wallet = bank();
  let active = false, curStation = null;
  const ui = createCasinoUI({
    wallet, sfx: audio.sfx, games: GAMES,
    onOpen: () => { audio.duck(true); },
    onClose: () => { audio.duck(false); curStation = null; },
    fx: (game, evt, data) => { try { venue.fx(curStation, evt, data); } catch (_) {} },
    actions: {
      exitTo: (id) => exitTo(id),
      goTo: (sid) => goTo(sid),
      stations: () => MENU.map(([id, label]) => ({ id, label })),
    },
  });

  // ---- stations → invisible interactive proxies
  const proxyMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, visible: false });
  const byId = new Map();
  const labelOf = (s) => {
    if (s.kind === 'slot') return L('lbl_slot', L('slot_' + s.theme));
    if (s.kind === 'cage') return L('lbl_cage');
    if (s.kind === 'bar') return L('lbl_bar');
    if (s.kind === 'exit') return L('lbl_exit');
    if (s.kind === 'stage') return L('lbl_stage');
    if (s.kind === 'steak') return L('lbl_steak');
    if (s.game === 'holdem') return L('lbl_table', L('g_holdem')) + ' · ' + L('pokerTable', s.id.replace('holdem', ''));
    return L('lbl_table', L(s.label));
  };
  for (const s of venue.stations) {
    const sz = new THREE.Vector3(), c = new THREE.Vector3(); s.box.getSize(sz); s.box.getCenter(c);
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, sz.x), Math.max(0.05, sz.y), Math.max(0.05, sz.z)), proxyMat);
    m.position.copy(c); m.visible = false; m.name = 'casino-station-' + s.id; m.userData.station = s;
    group.add(m); m.updateMatrixWorld(true);
    s.proxy = m;
    try { s.handle = wctx.addInteractive(m, { label: () => labelOf(s), hint: L('g_' + s.game), onUse: () => openStation(s) }); } catch (_) {}
    byId.set(s.id, s);
  }
  // menu aliases: first machine of each slot bank
  for (const th of ALL_SLOT_KEYS) { const s = venue.stations.find((x) => x.kind === 'slot' && x.theme === th && x.stand.yaw === 0 && !String(x.id).startsWith('car')); if (s) byId.set('slot-' + th, s); }

  function openStation(s) {
    if (!s) return null;
    if (s.game === 'exit') return ui.open('exit');
    try { venue.clearFx(); } catch (_) {}
    curStation = s;
    const r = ui.open(s.game, s.params || {});
    curStation = s; // (ui.open closes the previous game first, which clears it)
    return r;
  }
  function goTo(sid) {
    const s = byId.get(sid); if (!s) return false;
    const to = { x: s.stand.x, y: 0, z: s.stand.z };
    const nav = (typeof window !== 'undefined' && window.__tour && window.__tour.nav) || null;
    let ok = false;
    try { if (nav && nav.walkTo) ok = nav.walkTo(to, { key: 'casino-' + sid, label: labelOf(s), arriveYaw: s.stand.yaw, onArrive: () => setTimeout(() => openStation(s), 250) }); } catch (_) { ok = false; }
    if (!ok) { // fallback: short fade-free hop
      try { if (wctx.player) { wctx.player.teleport([to.x, 1.6, to.z], s.stand.yaw); wctx.player.apply && wctx.player.apply(); } } catch (_) {}
      setTimeout(() => openStation(s), 120);
    }
    return true;
  }
  async function exitTo(id) {
    let ok = false;
    try { if (id === 'limo' && typeof wctx.enterWorld === 'function') ok = await wctx.enterWorld('limo', { from: 'casino' }); } catch (_) { ok = false; }
    if (!ok) { try { if (typeof wctx.goHome === 'function') ok = await wctx.goHome(); else if (typeof wctx.enterWorld === 'function') ok = await wctx.enterWorld('home'); } catch (_) {} }
    return ok;
  }

  // ---- reflections: a small PMREM of a warm "casino room" (coves, chandeliers, a little neon)
  let envTex = null;
  try {
    if (wctx.renderer) {
      const es = new THREE.Scene();
      es.add(new THREE.Mesh(new THREE.BoxGeometry(72, 8, 46), new THREE.MeshBasicMaterial({ color: 0x1c100a, side: THREE.BackSide })));
      const glow = (c, k, x, y, z, w, h, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) })); m.position.set(x, y, z); es.add(m); };
      for (let x = -24; x <= 24; x += 8) for (let z = -14; z <= 14; z += 8) glow(0xffc890, 2.4, x, 3.9, z, 3.2, 0.1, 3.2);
      glow(0xffe2b0, 6, 0, 3.0, 0, 1.6, 1.2, 1.6); glow(0xff4fb8, 2.5, -20, 1.5, -19.5, 10, 2, 0.2); glow(0x2fd3c4, 2.0, 20, 1.5, 19.5, 10, 2, 0.2);
      glow(0x5a1020, 1.0, 0, -3.9, 0, 50, 0.1, 30);
      const pm = new THREE.PMREMGenerator(wctx.renderer);
      envTex = pm.fromScene(es, 0.035).texture; pm.dispose();
      es.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
  } catch (e) { console.warn('[casino] env', e); envTex = null; }

  // ---- language → signs + overlay
  const offLang = onLang(() => { try { venue.relabel(); } catch (_) {} try { ui.relabel(); } catch (_) {} });

  const stats = { counts: venue.counts, buildMs: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0), stations: venue.stations.length, colliders: venue.colliders.length, rng: rngInfo.source, quality };
  const api = { ui, venue, stations: venue.stations, byId, openStation, goTo, exitTo, wallet, audio, stats, L, get active() { return active; } };
  try { window.__casino = api; } catch (_) {}

  return {
    group,
    spawn: { pos: new THREE.Vector3(venue.spawn.x, 0, venue.spawn.z), yaw: venue.spawn.yaw },
    minimap: { rooms: venue.minimap.rooms.map((r) => ({ he: he[r.labelKey], r: r.r })), bounds: venue.minimap.bounds },
    nav: { nodes: venue.nav.nodes.map((n) => Object.assign({}, n, n.label ? { he: he[n.label] } : {})), edges: venue.nav.edges },
    env: { sky: false, sun: false, hemi: false, stars: false, fog: new THREE.Fog(0x0b0706, 45, 230), background: new THREE.Color(0x04050b), environment: envTex, exposure: 1.0 },
    onEnter() { active = true; ui.showHud(true); try { audio.startAmbience(); } catch (_) {} },
    onExit() { active = false; try { ui.close(); } catch (_) {} ui.showHud(false); try { audio.stopAmbience(); } catch (_) {} },
    update(dt) { venue.update(Math.min(0.1, dt || 0)); },
    dispose() { try { offLang(); } catch (_) {} ui.dispose(); },
    api,
  };
}
export default build;
/** optional manual registration (core uses registerModule('casino', './casino.js')) */
export function register(worlds) { return worlds && worlds.register ? worlds.register('casino', { he: 'קזינו', build }) : null; }

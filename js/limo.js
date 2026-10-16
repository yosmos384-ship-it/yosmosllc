// limo.js — V10 LIMO: the parked stretch limousine at the curb + the 'limo' world (interior, passengers, bar, lights,
// sunroof, partition, radio, the cinematic drive to the fictional "Eakin Grand Casino").
//
// Exports
//   buildParked(ctx)          → {object, door:{x,y,z}, group, doorAnchor, chauffeur, update(dt)} — the parked car with the
//                               curb-side rear door open + the chauffeur (local frame: nose +x, curb side −z, ground y = 0;
//                               core's exterior-limo.js places it at LIMO_SPOT and calls upgrade(result))
//   default buildWorld(wctx)  → {group, spawn:{pos (EYE position, world), yaw, eye, feet}, onEnter(opts), onExit(), update(dt)}
//   register(worlds)          → worlds.register('limo', {build: buildWorld})
//   LIMO_STRINGS              → {he, en, es} dictionary (also registered with i18n.registerTable at build time)
//
// Content rules (SPEC V10): adult passengers, tasteful outfits, no suggestive poses; drinks are optional virtual
// props with a "21+ · משקאות וירטואליים" note; no real brands / logos (the casino and the plate are fictional).
// Performance: lazy (built on first entry), ≤ 120 draw calls in the cabin during the drive (measured ~70–110 with
// frustum culling), ≤ 25 for the parked car + chauffeur, textures ≤ 1024.
// No side effects on import.
import { buildParkedCar, buildHood, CAR } from './limo-car.js';
import { buildCabin, cabinEnv, CAB } from './limo-cabin.js';
import { buildPassenger } from './limo-people.js';
import { createDrive, createEngineAudio, DRIVE_T, GROUND } from './limo-drive.js';
import { LIMO_STRINGS } from './limo-strings.js';
import * as I18N from './i18n.js';
import { getRadio } from './radio-engine.js';
import { Merger } from './limo-util.js';
import { buildChauffeur } from './limo-chauffeur.js';

export { LIMO_STRINGS };
export const LIMO_ORIGIN = [0, 0, -3000]; // the limo world sits far from the house (home is hidden while inside)

/* ------------------------------------------------------------------------------------------- i18n */
let registered = false;
function ensureStrings() {
  if (registered) return; registered = true;
  try { if (typeof I18N.registerTable === 'function') I18N.registerTable(LIMO_STRINGS.he, LIMO_STRINGS.en, LIMO_STRINGS.es); } catch (_) {}
}
function curLang() { try { const l = typeof I18N.getLang === 'function' ? I18N.getLang() : 'he'; return LIMO_STRINGS[l] ? l : 'he'; } catch (_) { return 'he'; } }
export function S(key, ...args) {
  const d = LIMO_STRINGS[curLang()] || LIMO_STRINGS.he;
  const s = d[key] != null ? d[key] : (LIMO_STRINGS.he[key] != null ? LIMO_STRINGS.he[key] : key);
  return s.replace(/\{(\d)\}/g, (_, i) => (args[+i] != null ? String(args[+i]) : ''));
}

/* ------------------------------------------------------------------------------------------- parked car */
// Returns { object, door } for core's exterior-limo.js upgrade() (local frame: origin on the ground at the car centre,
// nose +x, curb side −z) plus { group, doorAnchor, chauffeur, size } for tests / other callers.
export function buildParked(ctx) {
  const THREE = ctx.THREE;
  ensureStrings();
  const q = ctx.quality || 'high';
  const group = new THREE.Group(); group.name = 'limo:parkedRoot';
  let car;
  try { car = buildParkedCar(THREE, q, { openDoor: true }); } catch (e) { console.warn('[limo] parked', e); car = new THREE.Group(); }
  group.add(car);
  // the chauffeur waits just past the open door's free edge, facing the front walk / the visitor
  let chauffeur = null;
  try {
    chauffeur = buildChauffeur(THREE, q);
    chauffeur.group.position.set(-1.0, 0, -2.62); chauffeur.group.rotation.y = -2.45;
    group.add(chauffeur.group);
  } catch (e) { console.warn('[limo] chauffeur', e); }
  group.traverse((o) => { o.userData.floor = 'outside'; o.userData.room = 'exterior'; o.userData.limo = true; });
  const D = CAR.door;
  const door = { x: D.hinge - D.len / 2, y: 0.9, z: -CAR.W / 2 };                 // centre of the open doorway (local)
  const doorAnchor = new THREE.Vector3(D.hinge - D.len - 0.6, 0, -CAR.W / 2 - 0.8); // where a visitor stands to board
  group.userData.doorAnchor = doorAnchor.clone();
  group.userData.boardLabel = () => S('board');
  // tap the car / the open door / the chauffeur → board ("עלייה ללימוזינה 🚘")
  const board = () => { try { const W = ctx.worlds; if (W && (W.enterWorld || W.enter)) return (W.enterWorld || W.enter).call(W, 'limo'); } catch (e) { console.warn('[limo] board', e); } };
  const handles = [];
  try {
    if (typeof ctx.addInteractive === 'function') {
      handles.push(ctx.addInteractive(car, { label: () => S('board'), onUse: board, travel: 'limo' }));
      if (chauffeur) handles.push(ctx.addInteractive(chauffeur.group, { label: () => S('board'), onUse: board, travel: 'limo' }));
    }
  } catch (_) {}
  // idle chauffeur + small colliders for the open door and the chauffeur (core already blocks the car footprint);
  // added on the first frame after core has placed the model at the curb
  let collided = false;
  const camP = new THREE.Vector3();
  const tickParked = (dt) => {
    if (!group.parent) return;
    if (!collided && typeof ctx.addCollider === 'function') {
      collided = true;
      group.updateMatrixWorld(true);
      const boxW = (x0, z0, x1, z1, y1) => { const b = new THREE.Box3(); for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [0, y1]) b.expandByPoint(group.localToWorld(new THREE.Vector3(x, y, z))); return b; };
      try { ctx.addCollider(boxW(D.hinge - Math.cos(D.open) * D.len - 0.05, -CAR.W / 2 - Math.sin(D.open) * D.len - 0.05, D.hinge + 0.03, -CAR.W / 2, 1.4)); } catch (_) {}
      if (chauffeur) try { ctx.addCollider(boxW(-1.25, -2.87, -0.75, -2.37, 1.85)); } catch (_) {}
    }
    if (chauffeur && group.visible) {
      let vis = true; for (let o = group; o; o = o.parent) if (!o.visible) { vis = false; break; }
      if (vis) { if (ctx.camera) ctx.camera.getWorldPosition(camP); chauffeur.update(Math.min(0.1, dt || 0.016), ctx.camera ? camP : null); }
    }
  };
  let unsub = null;
  try { if (typeof ctx.onUpdate === 'function') unsub = ctx.onUpdate(tickParked); } catch (_) {}
  return {
    object: group, door, group, doorAnchor, chauffeur, handles, update: tickParked,
    dispose() { try { unsub && unsub(); for (const h of handles) h && h.remove && h.remove(); } catch (_) {} },
    parts: car.userData && car.userData.mats, size: { L: CAR.L, W: CAR.W, H: CAR.H },
  };
}

/* ------------------------------------------------------------------------------------------- sounds */
function sfx(getCtx) {
  const ac = () => { try { return getCtx(); } catch (_) { return null; } };
  return {
    clink() {
      const a = ac(); if (!a) return;
      const t = a.currentTime, out = a.createGain(); out.gain.value = 0.22; out.connect(a.destination);
      for (const [f, d, g] of [[2630, 1.4, 0.5], [3970, 1.0, 0.35], [5210, 0.7, 0.25], [6890, 0.45, 0.15], [2655, 1.3, 0.4]]) {
        for (const dt of [0, 0.045]) {
          const o = a.createOscillator(), e = a.createGain(); o.type = 'sine'; o.frequency.value = f * (dt ? 1.013 : 1);
          e.gain.setValueAtTime(0, t + dt); e.gain.linearRampToValueAtTime(g, t + dt + 0.003); e.gain.exponentialRampToValueAtTime(0.0001, t + dt + d);
          o.connect(e).connect(out); o.start(t + dt); o.stop(t + dt + d + 0.05);
        }
      }
    },
    pour(dur = 2) {
      const a = ac(); if (!a) return;
      const t = a.currentTime, len = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / a.sampleRate * 2 * Math.PI * (7 + Math.random() * 0.5)));
      const s = a.createBufferSource(); s.buffer = b;
      const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(1700, t + dur); bp.Q.value = 1.4;
      const g = a.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.15); g.gain.setValueAtTime(0.12, t + dur - 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
      s.connect(bp).connect(g).connect(a.destination); s.start(t); s.stop(t + dur + 0.05);
    },
    whoosh() {
      const a = ac(); if (!a) return;
      const t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(660, t + 0.25);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.4);
    },
  };
}

/* ------------------------------------------------------------------------------------------- DOM UI */
const CSS = `
.limo-ui{position:fixed;z-index:13;font-family:system-ui,-apple-system,"Segoe UI","Noto Sans Hebrew",Arial,sans-serif;color:#f6efe2;-webkit-user-select:none;user-select:none}
.limo-ui button{font:inherit;color:inherit;cursor:pointer;border:0;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
#limoTop{top:calc(16px + 52px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;justify-content:center;max-width:calc(100vw - 32px);flex-wrap:wrap}
#limoTop .lt-drive{min-height:46px;padding:0 20px;border-radius:999px;font-weight:800;font-size:15px;color:#2a1a00;background:linear-gradient(180deg,#ffe3a0,#e5b04f 55%,#b9822a);box-shadow:0 8px 24px rgba(229,176,79,.35),inset 0 1px 0 rgba(255,255,255,.6)}
#limoTop .lt-home{min-height:40px;padding:0 14px;border-radius:999px;font-size:13px;background:rgba(14,12,18,.72);border:1px solid rgba(232,194,122,.35);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
#limoTop .lt-prog{display:none;min-width:220px;max-width:min(360px,calc(100vw - 32px));padding:8px 12px;border-radius:14px;background:rgba(14,12,18,.74);border:1px solid rgba(232,194,122,.35);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
#limoTop .lt-prog b{display:block;font-size:13px;color:#ffd98a}
#limoTop .lt-prog small{display:flex;justify-content:space-between;gap:10px;font-size:11px;opacity:.85;margin-top:2px}
#limoTop .lt-bar{height:4px;border-radius:4px;background:rgba(255,255,255,.14);margin-top:6px;overflow:hidden}
#limoTop .lt-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ffe3a0,#e5b04f)}
#limoTop .lt-skip{display:none;min-height:40px;padding:0 14px;border-radius:999px;font-weight:700;font-size:13px;background:rgba(14,12,18,.72);border:1px solid rgba(255,255,255,.25)}
#limoTop.driving .lt-drive{display:none}
#limoTop .lt-exit{display:none}
#limoTop.arrived .lt-drive{display:none}
#limoTop.arrived .lt-exit{display:block}
#limoTop .lt-exit{min-height:48px;padding:0 22px;border-radius:999px;font-weight:800;font-size:16px;color:#2a1a00;background:linear-gradient(180deg,#ffe3a0,#e5b04f 55%,#b9822a);box-shadow:0 8px 28px rgba(229,176,79,.5),inset 0 1px 0 rgba(255,255,255,.6);animation:limoPulse 1.6s ease-in-out infinite}
@keyframes limoPulse{50%{box-shadow:0 8px 34px rgba(255,217,138,.85),inset 0 1px 0 rgba(255,255,255,.6)}}
#limoMsg small{display:block;font-size:13px;font-weight:500;color:#f6efe2;opacity:.9;margin-top:4px}
#limoTop.driving .lt-prog,#limoTop.driving .lt-skip{display:block}
#limoRail{right:calc(10px + env(safe-area-inset-right,0px));top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:6px;align-items:center}
#limoRail .lr-b{width:52px;min-height:50px;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;background:rgba(14,12,18,.66);border:1px solid rgba(232,194,122,.28);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);padding:3px 2px}
#limoRail .lr-b span{font-size:19px;line-height:1}
#limoRail .lr-b small{font-size:9px;line-height:1.1;opacity:.85;max-width:50px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#limoRail .lr-b.on{background:rgba(229,176,79,.32);border-color:rgba(255,217,138,.75)}
#limoRail .lr-note{font-size:9.5px;line-height:1.15;text-align:center;max-width:58px;padding:4px 4px;border-radius:8px;background:rgba(14,12,18,.6);color:#ffd98a}
#limoDrinks{display:none;right:calc(70px + env(safe-area-inset-right,0px));top:50%;transform:translateY(-50%);flex-direction:column;gap:6px;padding:8px;border-radius:14px;background:rgba(14,12,18,.8);border:1px solid rgba(232,194,122,.35);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
#limoDrinks.show{display:flex}
#limoDrinks button{min-height:44px;padding:0 14px;border-radius:10px;background:rgba(255,255,255,.07);font-size:14px;text-align:start;white-space:nowrap}
#limoDrinks small{font-size:10px;color:#ffd98a;text-align:center}
#limoBubble{left:0;top:0;display:none;max-width:220px;padding:8px 12px;border-radius:16px;background:rgba(255,250,240,.96);color:#2a1f14;font-size:14px;font-weight:600;box-shadow:0 8px 22px rgba(0,0,0,.35);pointer-events:none;transform:translate(-50%,-100%);text-align:center}
#limoBubble:after{content:"";position:absolute;left:50%;bottom:-7px;margin-left:-7px;border:7px solid transparent;border-bottom:0;border-top-color:rgba(255,250,240,.96)}
#limoMsg{left:50%;top:38%;transform:translate(-50%,-50%);display:none;padding:14px 20px;border-radius:16px;background:rgba(10,8,14,.78);border:1px solid rgba(232,194,122,.5);font-size:17px;font-weight:700;color:#ffe3a0;text-align:center;max-width:calc(100vw - 48px);pointer-events:none;box-shadow:0 10px 40px rgba(0,0,0,.45)}
#limoMsg.show{display:block;animation:limoIn .35s ease-out}
@keyframes limoIn{from{opacity:0;transform:translate(-50%,-44%)}to{opacity:1;transform:translate(-50%,-50%)}}
@media (max-height:520px){#limoRail{gap:4px}#limoRail .lr-b{width:46px;min-height:44px}#limoRail .lr-b small{display:none}#limoTop{top:calc(10px + 44px + env(safe-area-inset-top,0px))}}
`;
function el(tag, attrs = {}, html = '') { const e = document.createElement(tag); for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]); if (html) e.innerHTML = html; return e; }
function stop(e) { e.stopPropagation(); }

/* ------------------------------------------------------------------------------------------- the world */
export default async function buildWorld(wctx) {
  const THREE = wctx.THREE;
  ensureStrings();
  const quality = wctx.quality || 'high';
  const hi = quality !== 'low';
  const yieldFrame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));
  const group = new THREE.Group(); group.name = 'world:limo';
  group.position.set(...LIMO_ORIGIN);
  group.userData.floor = 'main'; group.userData.world = 'limo';
  const env = cabinEnv(THREE, wctx.renderer);
  const cabin = buildCabin(THREE, { quality, envMap: env });
  group.add(cabin.group);
  await yieldFrame();
  // hood + windshield + A-pillars seen through the partition
  const hood = buildHood(THREE, quality); hood.position.set(1.05, GROUND - 0.02, 0); group.add(hood);
  {
    const wsM = new THREE.MeshPhysicalMaterial({ color: 0xa8b8c8, roughness: 0.14, transparent: true, opacity: 0.12, depthWrite: false, envMap: env });
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.75), wsM); ws.position.set(3.55, 1.18, 0); ws.rotation.set(0, -Math.PI / 2, 0); ws.rotateX(0.9); group.add(ws);
    const pm = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.5 });
    const PM = new Merger(THREE); // both A-pillars: one draw call
    for (const s of [-1, 1]) PM.add('p', new THREE.BoxGeometry(0.08, 0.8, 0.08), { pos: [3.5, 1.2, s * 0.94], rot: [0, 0, 0.85] });
    PM.build({ p: pm }, group);
  }
  // passengers on the long side bench (left), facing the bar
  const people = [buildPassenger(THREE, 'A', quality), buildPassenger(THREE, 'B', quality)];
  people[0].group.position.set(-0.95, 0, -0.66);
  people[1].group.position.set(0.52, 0, -0.66);
  people[1].group.rotation.y = -0.12; people[0].group.rotation.y = 0.1;
  for (const p of people) group.add(p.group);
  await yieldFrame();
  // drive scenery (templates prebuilt here, while the loading overlay is up, so the ride never hitches)
  const drive = createDrive(THREE, { quality });
  group.add(drive.root);
  if (typeof drive.prebuild === 'function') await drive.prebuild(yieldFrame);
  // interior lights (mood colour + warm bar / reading light + soft fill)
  // lights hang in the middle of the aisle, ≥ 0.4 m from every surface (no hot spots / HDR overflow on the headliner)
  const mood1 = new THREE.PointLight(0x9a5cff, 1.5, 4.5, 2); mood1.position.set(-2.0, 0.98, 0.05);
  const mood2 = new THREE.PointLight(0x9a5cff, 1.3, 4.5, 2); mood2.position.set(0.7, 0.98, 0.0);
  const warm = new THREE.PointLight(0xffd2a0, 1.1, 3.5, 2); warm.position.set(-0.4, 1.02, 0.12);
  const fill = new THREE.AmbientLight(0xfff0e0, 0.18);
  group.add(mood1, mood2, warm, fill);

  // colliders / walkable / rooms (world space)
  group.updateMatrixWorld(true);
  const toWorldBox = (b) => b.clone().applyMatrix4(group.matrixWorld);
  for (const b of cabin.colliders) { try { wctx.addCollider && wctx.addCollider(toWorldBox(b)); } catch (_) {} }
  try { wctx.addWalkable && wctx.addWalkable(cabin.walkable); } catch (_) {}
  try { wctx.registerRoom && wctx.registerRoom('limo', { floor: 'main', he: LIMO_STRINGS.he.world, box: toWorldBox(new THREE.Box3(new THREE.Vector3(CAB.x0, -1, -CAB.zw), new THREE.Vector3(CAB.x1, CAB.h, CAB.zw))) }); } catch (_) {}

  /* ---------------- state + audio */
  const getAC = () => { try { return wctx.audio && wctx.audio.ctx; } catch (_) { return null; } };
  const snd = sfx(getAC);
  const engine = createEngineAudio(getAC);
  const radio = () => { try { return wctx.radio || (typeof window !== 'undefined' && window.__tour && window.__tour.radio) || getRadio(); } catch (_) { return null; } };
  const MOODS = [['violet', 0x9a5cff], ['blue', 0x3d7bff], ['amber', 0xffa040], ['rose', 0xff4f9a], ['teal', 0x2fe0c8], ['auto', null]];
  const st = {
    active: false, time: 0, mood: 0, sunroof: false, partition: false, driving: false, arrived: false, arriving: false,
    pour: null, glass: null, bubble: null, msg: null, greeted: false, lastTick: 0, tvAcc: 0, poured: 0, cheers: 0,
  };
  const tw = []; // simple tweens {obj, prop, from, to, t, dur, done}
  function tween(obj, prop, to, dur = 0.6) {
    return new Promise((res) => { for (let i = tw.length - 1; i >= 0; i--) if (tw[i].obj === obj && tw[i].prop === prop) tw.splice(i, 1); tw.push({ obj, prop, from: obj[prop], to, t: 0, dur, res }); });
  }
  function tickTweens(dt) {
    for (let i = tw.length - 1; i >= 0; i--) {
      const w = tw[i]; w.t += dt; const k = Math.min(1, w.t / w.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      w.obj[w.prop] = w.from + (w.to - w.from) * e;
      if (k >= 1) { tw.splice(i, 1); w.res(); }
    }
  }
  function setMood(i) {
    st.mood = (i + MOODS.length) % MOODS.length;
    const c = MOODS[st.mood][1];
    if (c != null) { for (const m of cabin.ledMats) m.color.set(c); mood1.color.set(c); mood2.color.set(c); }
    ui.update();
  }

  /* ---------------- interactions */
  const DRINKS = {
    champagne: { glass: 'flute', liquid: 0xf2d27a, emis: 0x3a2a08, bubbles: true, bottle: 0x0c2a18, opacity: 0.8 },
    whiskey: { glass: 'tumbler', liquid: 0xb0621a, emis: 0x3a1604, bubbles: false, bottle: 0x5a3010, opacity: 0.88, ice: true },
    soft: { glass: 'tumbler', liquid: 0xff8a1a, emis: 0x4a1a00, bubbles: true, bottle: 0x9ad0b0, opacity: 0.8, ice: true },
  };
  async function pour(kind = 'champagne') {
    if (st.pour) return;
    const D = DRINKS[kind] || DRINKS.champagne;
    st.pour = kind; ui.showDrinks(false);
    if (!st.noted21) { st.noted21 = true; message(S('first21'), 3200); }
    const flute = cabin.serve, tumb = cabin.tumblerServe;
    const g = D.glass === 'flute' ? flute : tumb;
    flute.group.visible = D.glass === 'flute'; tumb.group.visible = D.glass !== 'flute';
    cabin.ice.visible = !!D.ice;
    for (const x of [flute, tumb]) { x.liquid.visible = false; x.liquid.scale.y = 0.0001; }
    const lm = g.liquid.material; lm.color.set(D.liquid); lm.emissive && lm.emissive.set(D.emis); lm.opacity = D.opacity;
    cabin.stream.material.color.set(D.liquid);
    const bot = cabin.pourBottle; bot.children[0].material = bot.children[0].material.clone(); bot.children[0].material.color.set(D.bottle);
    if (kind !== 'champagne') { bot.children[0].material.transparent = true; bot.children[0].material.opacity = kind === 'soft' ? 0.6 : 0.85; }
    const B = cabin.BAR, gp = g.group.position;
    const rest = { x: gp.x + 0.22, y: B.top, z: gp.z + 0.02 };
    bot.position.set(rest.x, rest.y, rest.z); bot.rotation.set(0, 0, 0); bot.visible = true;
    // lift + tilt over the glass
    await Promise.all([tween(bot.position, 'y', B.top + 0.24, 0.55), tween(bot.position, 'x', gp.x + 0.2, 0.55), tween(bot.rotation, 'z', 1.95, 0.6)]);
    g.liquid.visible = true; cabin.stream.visible = true; snd.pour(1.8);
    const topY = g.group.position.y + g.liquid.position.y;
    st.streamTop = () => { const m = new THREE.Vector3(0, 0.3, 0).applyEuler(bot.rotation).add(bot.position); return m; };
    st.streamBottom = topY;
    cabin.bubbles.visible = !!D.bubbles; st.bubbleGlass = g;
    await tween(g.liquid.scale, 'y', D.glass === 'flute' ? 0.92 : 0.6, 1.8);
    cabin.stream.visible = false;
    await Promise.all([tween(bot.rotation, 'z', 0, 0.5), tween(bot.position, 'y', B.top, 0.55), tween(bot.position, 'x', rest.x, 0.5)]);
    st.pour = null; st.glass = kind; st.poured++;
    message(S('poured', S(kind)), 1600);
  }
  async function cheers() {
    st.cheers++;
    for (const p of people) p.cheers(1.9);
    const g = st.glass ? (DRINKS[st.glass].glass === 'flute' ? cabin.serve : cabin.tumblerServe) : null;
    if (g) { tween(g.group.position, 'y', cabin.BAR.top + 0.1, 0.45).then(() => tween(g.group.position, 'y', cabin.BAR.top + 0.008, 0.6)); }
    bubble(people[0], S('cheersBubble'), 2600);
    setTimeout(() => snd.clink(), 650);
  }
  function toggleSunroof() {
    st.sunroof = !st.sunroof; snd.whoosh();
    tween(cabin.sunroof.position, 'x', cabin.sunroof.userData.x0 - (st.sunroof ? 1.45 : 0), 1.4);
    ui.update();
  }
  function togglePartition() {
    st.partition = !st.partition; snd.whoosh();
    const P = CAB.part;
    tween(cabin.partition.position, 'y', cabin.partition.userData.y0 - (st.partition ? (P.y1 - P.y0) + 0.02 : 0), 1.2);
    ui.update();
  }
  function radioToggle() { const r = radio(); if (!r) return; try { r.toggle(); } catch (_) {} setTimeout(() => ui.update(), 50); }
  function radioNext() { const r = radio(); if (!r) return; try { r.next(); } catch (_) {} setTimeout(() => ui.update(), 50); }
  function startDrive() {
    if (st.driving || st.arriving) return;
    st.driving = true; st.arrived = false; st.pending = 0;
    drive.reset(); drive.start();
    ui.update();
    bubble(people[1], S('letsGo'), 2400);
  }
  function skipDrive() { if (!st.driving) return; drive.skipTo(DRIVE_T - 2.2); }
  // the car pulls up under the porte-cochère: "הגענו לקזינו" + a "צא מהלימוזינה" button (the visitor decides)
  function arrive() {
    if (st.arrived && !st.driving) return;
    st.driving = false; st.arrived = true; st.pending = 0;
    ui.update();
    message(S('arrived'), 3200, S('arrivedSub'));
    bubble(people[0], S('cheersBubble'), 2200);
  }
  async function exitToCasino() {
    if (st.arriving) return; st.arriving = true;
    let ok = true;
    try {
      const W = wctx.worlds;
      const has = W ? (typeof W.has === 'function' ? W.has('casino') : typeof W.get === 'function' ? !!W.get('casino') : typeof W.list === 'function' ? W.list().map((x) => (x && x.id) || x).includes('casino') : true) : true;
      if (!has || typeof wctx.enterWorld !== 'function') ok = false;
      else { const r = await wctx.enterWorld('casino', { from: 'limo' }); if (r === false) ok = false; }
    } catch (e) { console.warn('[limo] casino', e); ok = false; }
    if (!ok) message(S('building'), 2400);
    st.arriving = false;
  }
  // a cosmetic sip from the visitor's glass (no effects of any kind)
  async function sip() {
    if (st.pour || st.sipping) return;
    if (!st.glass) return pour('champagne');
    const g = DRINKS[st.glass].glass === 'flute' ? cabin.serve : cabin.tumblerServe;
    st.sipping = true; st.sips = (st.sips || 0) + 1;
    const y0 = cabin.BAR.top + 0.008;
    await Promise.all([tween(g.group.position, 'y', y0 + 0.16, 0.5), tween(g.group.rotation, 'z', 0.5, 0.5)]);
    await tween(g.liquid.scale, 'y', Math.max(0.12, g.liquid.scale.y - 0.18), 0.7);
    await Promise.all([tween(g.group.position, 'y', y0, 0.5), tween(g.group.rotation, 'z', 0, 0.5)]);
    st.sipping = false;
    message(S('sipped'), 1300);
  }
  // back home: the ride back is skipped — the visitor stands at the curb next to the parked limo (worlds.js restores
  // the spot where they boarded and faces them toward the house)
  function goHome() { st.driving = false; st.pending = 0; drive.stop(); try { if (typeof wctx.enterWorld === 'function') wctx.enterWorld('home', { from: 'limo' }); } catch (_) {} }

  /* ---------------- 3D interactives */
  const inter = [];
  const addI = (obj, label, onUse) => { try { if (wctx.addInteractive) inter.push(wctx.addInteractive(obj, { label, onUse })); } catch (_) {} obj.userData.limoUse = onUse; obj.userData.limoLabel = label; };
  for (const p of people) addI(p.group, () => S('tapCheers'), () => cheers());
  const proxyM = new THREE.MeshBasicMaterial({ visible: false }); // raycast-only tap targets: never drawn (no draw call)
  const barProxy = new THREE.Mesh(new THREE.BoxGeometry(cabin.BAR.x1 - cabin.BAR.x0, 0.35, 0.45), proxyM);
  barProxy.position.set((cabin.BAR.x0 + cabin.BAR.x1) / 2, cabin.BAR.top + 0.17, (cabin.BAR.z0 + CAB.zw) / 2); barProxy.name = 'limo:barProxy'; cabin.group.add(barProxy);
  addI(barProxy, () => S('pour') + ' · ' + S('champagne'), () => pour('champagne'));
  addI(cabin.partition, () => (st.partition ? S('partitionUp') : S('partitionDown')), () => togglePartition());
  const sunProxy = new THREE.Mesh(new THREE.BoxGeometry(CAB.sun.x1 - CAB.sun.x0, 0.05, CAB.sun.z * 2), proxyM);
  sunProxy.position.set((CAB.sun.x0 + CAB.sun.x1) / 2, CAB.h - 0.02, 0); cabin.group.add(sunProxy);
  addI(sunProxy, () => (st.sunroof ? S('sunroofClose') : S('sunroofOpen')), () => toggleSunroof());
  addI(cabin.tv, () => S('tv'), () => message(S('route'), 2200));
  addI(cabin.stars, () => S('mood'), () => setMood(st.mood + 1));

  /* ---------------- TV route map */
  function drawTV() {
    const c = cabin.tvCanvas; if (!c) return;
    const g = c.getContext('2d'), w = c.width, h = c.height;
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0d1626'); gr.addColorStop(1, '#070b14'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,150,190,0.16)'; g.lineWidth = 1;
    for (let x = 10; x < w; x += 26) { g.beginPath(); g.moveTo(x, 40); g.lineTo(x + 8, h); g.stroke(); }
    for (let y = 46; y < h; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y - 6); g.stroke(); }
    // river
    g.strokeStyle = 'rgba(70,130,200,0.45)'; g.lineWidth = 7; g.beginPath(); g.moveTo(330, 40); g.bezierCurveTo(300, 120, 380, 180, 350, h); g.stroke();
    // route: Eakin Rd → Georgesville Rd → highway → casino
    const pts = [[48, 220], [120, 214], [150, 170], [168, 120], [230, 96], [330, 92], [420, 120], [458, 150]];
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 9; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    g.strokeStyle = '#e5b04f'; g.lineWidth = 4.5; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    // progress dot
    const prog = drive.total ? drive.state.traveled / drive.total : 0;
    let segs = [], tot = 0; for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); tot += l; }
    let d = prog * tot, px = pts[0][0], py = pts[0][1];
    for (let i = 0; i < segs.length; i++) { if (d <= segs[i]) { const k = d / segs[i]; px = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k; py = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k; break; } d -= segs[i]; px = pts[i + 1][0]; py = pts[i + 1][1]; }
    const pulse = 8 + Math.sin(st.time * 5) * 2;
    const rg = g.createRadialGradient(px, py, 0, px, py, pulse * 2); rg.addColorStop(0, 'rgba(255,230,160,0.9)'); rg.addColorStop(1, 'rgba(255,230,160,0)'); g.fillStyle = rg; g.beginPath(); g.arc(px, py, pulse * 2, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(px, py, 5, 0, 7); g.fill();
    // pins + labels (Latin text only on the canvas; the street names are real public roads, the casino is fictional)
    g.font = 'bold 13px Arial, sans-serif'; g.fillStyle = '#cfe0ff'; g.textAlign = 'left'; g.fillText('3351 Eakin Rd', 20, 246);
    g.fillStyle = '#9fb3d0'; g.font = '11px Arial, sans-serif'; g.fillText('Georgesville Rd', 172, 150); g.fillText('I-70', 262, 84);
    g.fillStyle = '#ffd98a'; g.font = 'bold 13px Arial, sans-serif'; g.textAlign = 'right'; g.fillText('Eakin Grand Casino', w - 14, 176);
    g.fillStyle = '#e5b04f'; g.beginPath(); g.arc(458, 150, 6, 0, 7); g.fill(); g.fillStyle = '#7fd0ff'; g.beginPath(); g.arc(48, 220, 6, 0, 7); g.fill();
    // header
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, w, 34);
    g.fillStyle = '#ffd98a'; g.font = 'bold 15px Arial, sans-serif'; g.textAlign = 'left'; g.fillText('ROUTE · EAKIN GRAND', 12, 22);
    const eta = Math.max(0, Math.round(DRIVE_T - drive.state.t));
    g.textAlign = 'right'; g.fillStyle = '#ffffff'; g.fillText((st.driving ? eta + ' s' : st.arrived ? '✓' : Math.round(DRIVE_T) + ' s') + '  ·  ' + (drive.total / 1000).toFixed(1) + ' km', w - 12, 22);
    cabin.tvTex && (cabin.tvTex.needsUpdate = true);
  }

  /* ---------------- DOM: rail, top bar, bubble, message */
  const ui = (() => {
    const hasDom = typeof document !== 'undefined' && document.body;
    let top, rail, drinks, bub, msg, mounted = false, unLang = null, unRadio = null;
    function mount() {
      if (!hasDom || mounted) return; mounted = true;
      if (!document.getElementById('limo-css')) { const s = el('style', { id: 'limo-css' }); s.textContent = CSS; document.head.appendChild(s); }
      top = el('div', { id: 'limoTop', class: 'limo-ui' });
      top.innerHTML = '<button class="lt-drive" data-a="drive"></button><button class="lt-exit" data-a="exit"></button><button class="lt-home" data-a="home"></button>'
        + '<div class="lt-prog"><b class="lt-leg"></b><div class="lt-bar"><i></i></div><small><span class="lt-on"></span><span class="lt-eta"></span></small></div><button class="lt-skip" data-a="skip"></button>';
      rail = el('div', { id: 'limoRail', class: 'limo-ui' });
      const B = (a, ico) => `<button class="lr-b" data-a="${a}"><span>${ico}</span><small></small></button>`;
      rail.innerHTML = B('pour', '🍾') + B('sip', '🍸') + B('cheers', '🥂') + B('mood', '💡') + B('sunroof', '🌤') + B('partition', '🪟') + B('radio', '📻') + B('next', '⏭') + '<div class="lr-note"></div>';
      drinks = el('div', { id: 'limoDrinks', class: 'limo-ui' });
      drinks.innerHTML = '<button data-a="d:champagne">🥂 <span></span></button><button data-a="d:whiskey">🥃 <span></span></button><button data-a="d:soft">🥤 <span></span></button><small></small>';
      bub = el('div', { id: 'limoBubble', class: 'limo-ui' });
      msg = el('div', { id: 'limoMsg', class: 'limo-ui' });
      for (const n of [top, rail, drinks, bub, msg]) document.body.appendChild(n);
      for (const n of [top, rail, drinks]) {
        n.addEventListener('pointerdown', stop); n.addEventListener('mousedown', stop); n.addEventListener('touchstart', stop, { passive: true }); n.addEventListener('dblclick', stop);
        n.addEventListener('click', (e) => {
          e.stopPropagation();
          const b = e.target.closest('[data-a]'); if (!b) return;
          const a = b.getAttribute('data-a');
          if (a === 'drive') startDrive(); else if (a === 'home') goHome(); else if (a === 'skip') skipDrive(); else if (a === 'exit') exitToCasino(); else if (a === 'sip') sip();
          else if (a === 'pour') showDrinks(!drinks.classList.contains('show'));
          else if (a.startsWith('d:')) pour(a.slice(2));
          else if (a === 'cheers') cheers(); else if (a === 'mood') { setMood(st.mood + 1); message(S('moodName', S(MOODS[st.mood][0])), 1200); }
          else if (a === 'sunroof') toggleSunroof(); else if (a === 'partition') togglePartition();
          else if (a === 'radio') radioToggle(); else if (a === 'next') radioNext();
        });
      }
      try { if (typeof I18N.onLangChange === 'function') unLang = I18N.onLangChange(() => { update(); drawTV(); }); } catch (_) {}
      try { const r = radio(); if (r && r.onChange) unRadio = r.onChange(() => update()); } catch (_) {}
      update();
    }
    function unmount() {
      if (!mounted) return; mounted = false;
      for (const n of [top, rail, drinks, bub, msg]) n && n.remove();
      try { unLang && unLang(); unRadio && unRadio(); } catch (_) {}
      unLang = unRadio = null;
    }
    function setLabel(a, txt, on) { if (!rail) return; const b = rail.querySelector(`[data-a="${a}"]`); if (!b) return; b.querySelector('small').textContent = txt; b.setAttribute('aria-label', txt); b.title = txt; b.classList.toggle('on', !!on); }
    function update() {
      if (!mounted) return;
      top.querySelector('.lt-drive').textContent = S('drive');
      top.querySelector('.lt-home').textContent = S('home');
      top.querySelector('.lt-skip').textContent = S('skip');
      top.querySelector('.lt-exit').textContent = S('exitLimo');
      top.classList.toggle('driving', st.driving);
      top.classList.toggle('arrived', st.arrived && !st.driving);
      const r = radio(); const on = !!(r && r.on);
      setLabel('pour', S('pour')); setLabel('sip', S('sip')); setLabel('cheers', S('cheers')); setLabel('mood', S(MOODS[st.mood][0]), true);
      setLabel('sunroof', st.sunroof ? S('sunroofClose') : S('sunroofOpen'), st.sunroof);
      setLabel('partition', st.partition ? S('partitionUp') : S('partitionDown'), st.partition);
      setLabel('radio', on ? S('radioStop') : S('radioPlay'), on); setLabel('next', S('radioNext'));
      rail.querySelector('.lr-note').textContent = S('note21');
      const ds = drinks.querySelectorAll('button span'); ds[0].textContent = S('champagne'); ds[1].textContent = S('whiskey'); ds[2].textContent = S('soft');
      drinks.querySelector('small').textContent = S('note21');
    }
    function showDrinks(v) { if (drinks) drinks.classList.toggle('show', !!v); }
    function progress() {
      if (!mounted || !st.driving) return;
      const ph = drive.phase(), leg = { sub: 'leg1', art: 'leg2', hwy: 'leg3', cas: 'leg4', plaza: 'leg4' }[ph] || 'leg1';
      top.querySelector('.lt-leg').textContent = S(leg);
      top.querySelector('.lt-on').textContent = S('onTheWay');
      top.querySelector('.lt-eta').textContent = S('eta', Math.max(0, Math.ceil(DRIVE_T - drive.state.t)));
      top.querySelector('.lt-bar i').style.width = (100 * drive.state.t / DRIVE_T).toFixed(1) + '%';
    }
    return { mount, unmount, update, showDrinks, progress, get bub() { return bub; }, get msg() { return msg; }, get mounted() { return mounted; } };
  })();
  function bubble(p, text, ms = 3000) {
    st.bubble = { p, until: st.time + ms / 1000 };
    if (ui.bub) { ui.bub.textContent = text; ui.bub.style.display = 'block'; }
    p.greet(ms / 1000);
  }
  let msgT = 0;
  function message(text, ms = 2000, sub = '') {
    st.lastMsg = text;
    const m = ui.msg; if (!m) return;
    m.textContent = text;
    if (sub) { const sm = document.createElement('small'); sm.textContent = sub; m.appendChild(sm); }
    m.classList.remove('show'); void m.offsetWidth; m.classList.add('show');
    clearTimeout(msgT); msgT = setTimeout(() => m.classList.remove('show'), ms);
  }
  const vA = new THREE.Vector3();
  function placeBubble() {
    const b = ui.bub; if (!b) return;
    if (!st.bubble || st.time > st.bubble.until) { if (b.style.display !== 'none') b.style.display = 'none'; st.bubble = null; return; }
    const cam = wctx.camera; st.bubble.p.bubbleAnchor(vA);
    vA.project(cam);
    if (vA.z > 1 || Math.abs(vA.x) > 1.1 || Math.abs(vA.y) > 1.1) { b.style.opacity = '0'; return; }
    const W = (wctx.renderer && wctx.renderer.domElement && wctx.renderer.domElement.clientWidth) || innerWidth;
    const H = (wctx.renderer && wctx.renderer.domElement && wctx.renderer.domElement.clientHeight) || innerHeight;
    b.style.opacity = '1';
    b.style.left = Math.round((vA.x * 0.5 + 0.5) * W) + 'px'; b.style.top = Math.round((-vA.y * 0.5 + 0.5) * H) + 'px';
  }

  /* ---------------- per-frame */
  const camPos = new THREE.Vector3();
  const bubPos = cabin.bubbles.geometry.attributes.position;
  const bubSeeds = Array.from({ length: bubPos.count }, () => [Math.random(), Math.random(), Math.random()]);
  const savedScene = { fog: null };
  function tick(dt) {
    dt = Math.min(0.1, Math.max(0, dt || 0));
    st.time += dt;
    tickTweens(dt);
    wctx.camera && wctx.camera.getWorldPosition(camPos);
    for (const p of people) p.update(dt, camPos);
    cabin.stars.material.uniforms.uTime.value = st.time;
    if (MOODS[st.mood][1] == null) { // auto: slow hue cycle
      const c = new THREE.Color().setHSL((st.time * 0.04) % 1, 0.85, 0.6);
      for (const m of cabin.ledMats) m.color.copy(c); mood1.color.copy(c); mood2.color.copy(c);
    }
    // pour stream + bubbles
    if (cabin.stream.visible && st.streamTop) {
      const a = st.streamTop(), by = st.streamBottom + (st.bubbleGlass ? st.bubbleGlass.liquid.scale.y * 0.09 : 0);
      const gp = (st.bubbleGlass || cabin.serve).group.position;
      const len = Math.max(0.02, a.y - by);
      cabin.stream.position.set((a.x + gp.x) / 2, (a.y + by) / 2, gp.z); cabin.stream.scale.set(1, len, 1);
      cabin.stream.rotation.z = Math.atan2(a.x - gp.x, len) * -1;
    }
    if (cabin.bubbles.visible && st.bubbleGlass) {
      const g = st.bubbleGlass, base = g.group.position, lv = g.liquid.scale.y;
      const isFlute = g === cabin.serve, y0 = base.y + (isFlute ? 0.115 : 0.015), h = (isFlute ? 0.09 : 0.07) * lv, r = isFlute ? 0.016 : 0.028;
      for (let i = 0; i < bubPos.count; i++) {
        const s = bubSeeds[i]; const k = (s[0] + st.time * (0.25 + s[1] * 0.4)) % 1;
        bubPos.setXYZ(i, base.x + Math.cos(s[2] * 6.28) * r * s[1], y0 + k * h, base.z + Math.sin(s[2] * 6.28) * r * s[1]);
      }
      bubPos.needsUpdate = true;
    }
    // drive
    drive.update(dt, st.time);
    if (st.pending > 0 && !st.driving) { st.pending -= dt; if (st.pending <= 0) startDrive(); }
    if (st.driving && drive.state.done) arrive();
    engine.set(drive.state.speed, st.active && (st.driving || drive.state.speed > 0.1));
    ui.progress();
    st.tvAcc += dt; if (st.tvAcc > 0.2) { st.tvAcc = 0; drawTV(); }
    placeBubble();
  }
  let fallbackUnsub = null;
  const world = {
    id: 'limo', group,
    // worlds.js per-world environment: the drive brings its own sky dome, sun, hemisphere light and fog
    env: { sky: false, sun: false, hemi: false, stars: false, fog: drive.fog },
    spawn: (() => {
      const eye = new THREE.Vector3(CAB.x0 + 1.0, CAB.eye, 0.12).applyMatrix4(group.matrixWorld);
      const feet = eye.clone(); feet.y -= 1.6;
      return { pos: feet.clone(), eye, feet, yaw: -1.25, pitch: -0.08 }; // worlds.js: pos = FEET (eye = feet + 1.6)
    })(),
    onEnter(opts = {}) {
      st.active = true;
      if (!group.parent && wctx.scene) wctx.scene.add(group);
      group.visible = true;
      if (wctx.scene && wctx.scene.fog !== drive.fog) { savedScene.fog = wctx.scene.fog; savedScene.set = true; wctx.scene.fog = drive.fog; }
      st.driving = false; st.arriving = false; st.pending = 0;
      drive.reset();
      if (opts.from === 'casino') {
        // back from the casino: the limo still waits under the porte-cochère
        drive.skipTo(DRIVE_T); drive.state.done = true; drive.update(0, st.time);
        st.arrived = true;
      } else {
        // boarding at the curb on Eakin Rd: the ride starts by itself after a short welcome (⏩ skip at any time)
        st.arrived = false;
        st.pending = 3.2;
        setTimeout(() => { if (st.active && st.pending > 0) message(S('starting'), 1500); }, 1200);
      }
      ui.mount(); ui.update(); drawTV();
      if (!st.greeted || opts.greet !== false) setTimeout(() => { if (st.active) bubble(people[0], opts.from === 'casino' ? S('cheersBubble') : S('welcome'), 3000); }, 700);
      st.greeted = true;
      // fallback ticker if the core does not call update() (contract says it does)
      if (!fallbackUnsub && typeof wctx.onUpdate === 'function') {
        fallbackUnsub = wctx.onUpdate((dt) => { if (st.active && performance.now() - st.lastTick > 80) { tick(dt); } });
      }
    },
    onExit() {
      st.active = false; st.driving = false;
      drive.stop(); engine.stop();
      st.pending = 0;
      if (wctx.scene && savedScene.set && wctx.scene.fog === drive.fog) { wctx.scene.fog = savedScene.fog; savedScene.set = false; }
      ui.unmount();
      if (fallbackUnsub) { try { fallbackUnsub(); } catch (_) {} fallbackUnsub = null; }
    },
    update(dt) { st.lastTick = performance.now(); if (st.active) tick(dt); },
    // test / integration helpers
    api: {
      pour, sip, exitToCasino, arrive, cheers, toggleSunroof, togglePartition, setMood, startDrive, skipDrive, radioToggle, radioNext, goHome,
      get state() { return st; }, drive, cabin, people, ui, S,
      stats() { let calls = 0, tris = 0; group.traverseVisible((o) => { if ((o.isMesh || o.isPoints || o.isInstancedMesh) && !(o.material && o.material.visible === false)) { calls++; const g = o.geometry; if (g) tris += (g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0)) / 3 * (o.isInstancedMesh ? o.count : 1); } }); return { meshes: calls, tris: Math.round(tris) }; },
    },
  };
  return world;
}
export { buildWorld };

export function register(worlds) {
  if (!worlds || typeof worlds.register !== 'function') return false;
  worlds.register('limo', { build: buildWorld });
  return true;
}

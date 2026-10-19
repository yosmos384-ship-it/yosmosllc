// heli-google3d.js — V14: Google Photorealistic 3D Tiles (Map Tiles API) as the city of the helicopter world.
// The real Columbus, Ohio streamed live from Google (the same 3D mesh as Google Earth), rendered with the vendored
// NASA-AMMOS 3DTilesRendererJS 0.3.46 (vendor/3d-tiles-renderer, MIT) on three r160.
//
//   attachGoogle3D(THREE, o) → ctl  (no network until ctl.enter())
//     o = { area, data, group, renderer, camera, quality, S(key), message(text, ms), spots: [{ x, z, r | pts }],
//           homePad: { x, z, h } (Google-mode parking spot at home), onMode(ctl) (Google ↔ classic switched) }
//     ctl.enter() → Promise   world entered: Google mode (default) starts streaming; classic mode = area.loadDetail()
//     ctl.update(camera, dt)  every frame after the camera is placed (heli.js tick)
//     ctl.exit()              world left (overlay + rail button removed, streaming paused)
//     ctl.dispose()           frees every tile, the DRACO workers and the DOM (heli.js dispose, V13 memory rule)
//     ctl.mode / ctl.active / ctl.status / ctl.reason / ctl.setMode('google' | 'classic') / ctl.groundAt(x, z) / ctl.stats()
//     ctl.homePad() → { x, y, z, h } in Google mode, else null
//
// Frame: the heli world is local Web-Mercator metres scaled by cos(lat0) around the 3351 Eakin Rd address point
// (data/heli-area.json frame: x = east, z = south, y = up, y 0 = the house's ground = data.elev.base m NAVD88).
// The tiles are ECEF; they are re-oriented to the local East-Up-South frame AT THE CAMERA (re-anchored every 150 m of
// camera travel) and scaled by the Mercator scale there, so around the camera the Google city coincides exactly with
// the heli world's coordinates (places, labels, routes, the pad, the casino LZ), including Earth curvature.
// Heights: WGS84 ellipsoid height = NAVD88 + GEOID18 (−33.60 m at the house, NOAA NGS); a small vertical lock
// (raycasts on clear ground at the pad and the casino LZ) removes the remaining offset.
//
// Map Tiles API policies (developers.google.com/maps/documentation/tile/policies, read 2026-10-18), implemented here:
//  • the Google Maps logo (official asset, outlined variant on the busy map, 16 px high, clear space) + the data
//    attributions of the tiles in view, aggregated, sorted by occurrence, on one line (tap = "Data sources" panel);
//  • the hybrid scene is labelled: city = Google Maps, the helicopter / house tour / place labels are ours (place
//    names: © OpenStreetMap contributors, credited separately from Google's attribution);
//  • tiles are streamed live; nothing is pre-fetched, stored or cached by us (the browser's HTTP cache follows the
//    API's Cache-Control headers); the root tileset session is renewed by the auth plugin;
//  • no other imagery / map data is mixed into the Google city: while Google mode is on, the USGS/NAIP ground, OSM
//    buildings, trees, water, our simplified house and our back-yard helipad are hidden (the helicopter and the
//    place labels stay; the helicopter parks on Eakin Rd in front of the house — the real back yard is under trees).
// Fallback: no key / 403 / quota / offline → the classic USGS + OSM city with a short note. No side effects on import.
import { GOOGLE_MAPS_API_KEY, GOOGLE_3D_ENABLED } from './maps-config.js';

const LS_KEY = 'eakin_heli_g3d';
const GEOID_N = -33.6;          // GEOID18 at the house (NOAA NGS API): ellipsoid height = NAVD88 + N
const ROOT_HOST = 'tile.googleapis.com';
const START_TIMEOUT = 22000;    // no tile at all after this → classic
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lsGet = () => { try { return localStorage.getItem(LS_KEY); } catch (_) { return null; } };
const lsSet = (v) => { try { localStorage.setItem(LS_KEY, v); } catch (_) {} };
function isPhone() { try { return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820; } catch (_) { return false; } }

export function googleConfigured() { return !!(GOOGLE_3D_ENABLED && GOOGLE_MAPS_API_KEY); }

/* ------------------------------------------------------------------------------------------- geo helpers */
// heli frame (x east, z south, metres) ↔ geodetic, exactly as data/heli-area.json was baked (Web Mercator × cos lat0)
export function makeFrame(frame) {
  const D = Math.PI / 180;
  const R = (frame && frame.R) || 6378137, lat0 = ((frame && frame.lat0) || 39.938578) * D, lon0 = ((frame && frame.lon0) || -83.087247) * D;
  const cos0 = (frame && frame.cos0) || Math.cos(lat0), k = R * cos0;
  const psi0 = Math.log(Math.tan(Math.PI / 4 + lat0 / 2));
  const a = 6378137, e2 = 0.00669437999014;
  return {
    R, lat0, lon0, cos0,
    toGeo(x, z) { const lon = lon0 + x / k; const psi = psi0 - z / k; const lat = 2 * Math.atan(Math.exp(psi)) - Math.PI / 2; return { lat, lon }; },
    fromGeo(lat, lon) { return { x: (lon - lon0) * k, z: -(Math.log(Math.tan(Math.PI / 4 + lat / 2)) - psi0) * k }; },
    // d(heli x)/d(east metres), d(heli z)/d(south metres) at latitude lat (Mercator scale vs the WGS84 radii)
    scaleAt(lat) { const s = Math.sin(lat), w = 1 - e2 * s * s, N = a / Math.sqrt(w), M = a * (1 - e2) / (w * Math.sqrt(w)), c = Math.cos(lat); return { sx: k / (N * c), sz: k / (M * c) }; },
  };
}

/* ------------------------------------------------------------------------------------------- overlay (logo + attributions + toggle) */
const CSS = `
#heliG3d{position:fixed;z-index:14;right:calc(8px + env(safe-area-inset-right,0px));bottom:calc(6px + env(safe-area-inset-bottom,0px));max-width:min(76vw,560px);display:flex;flex-direction:column;align-items:flex-end;gap:3px;pointer-events:none;direction:ltr;font-family:Roboto,Arial,system-ui,sans-serif}
#heliG3d .g3-row{display:flex;align-items:flex-end;gap:10px;pointer-events:auto;cursor:pointer;padding:10px 10px 5px 10px;max-width:100%}
#heliG3d .g3-logo{height:16px;width:auto;flex:0 0 auto;display:block}
#heliG3d .g3-data{font-size:10.5px;line-height:13px;color:#fff;text-shadow:0 0 2px #000,0 1px 2px #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
#heliG3d .g3-own{font-size:9.5px;line-height:12px;color:rgba(255,255,255,.88);text-shadow:0 0 2px #000,0 1px 2px #000;padding:0 6px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
#heliG3d .g3-pop{display:none;pointer-events:auto;max-width:min(86vw,420px);margin-bottom:4px;padding:10px 12px;border-radius:10px;background:rgba(12,18,30,.92);color:#eef3f8;font-size:12px;line-height:1.45;box-shadow:0 6px 20px rgba(0,0,0,.4)}
#heliG3d .g3-pop b{display:block;font-size:12.5px;margin-bottom:3px}
#heliG3d .g3-pop p{margin:0 0 6px}
#heliG3d.open .g3-pop{display:block}
#heliG3dNote{position:fixed;z-index:14;left:50%;bottom:calc(30px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);padding:5px 12px;border-radius:999px;background:rgba(12,18,30,.78);color:#fff;font-size:11.5px;font-weight:600;white-space:nowrap;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis;pointer-events:none;opacity:0;transition:opacity .4s;font-family:var(--font,system-ui,sans-serif)}
#heliG3dNote.show{opacity:1}
body.heli-g3d #heliAttr{display:none!important}
#heliG3dBtn.busy .i{animation:g3spin 1.2s linear infinite}
@keyframes g3spin{to{transform:rotate(360deg)}}
`;

/* ------------------------------------------------------------------------------------------- controller */
export function attachGoogle3D(THREE, o = {}) {
  const area = o.area, data = o.data || {};
  const S = typeof o.S === 'function' ? o.S : (k) => k;
  const say = (t, ms) => { try { o.message && o.message(t, ms); } catch (_) {} };
  const phone = o.quality === 'low' || isPhone();
  const F = makeFrame(data.frame);
  const BASE = data.elev && isFinite(data.elev.base) ? data.elev.base : 252.62;
  const H0 = BASE + GEOID_N; // ellipsoid height of heli y = 0
  const ground = (area && area.ground) || (() => 0);
  const spots = (o.spots || []).filter((s) => s && isFinite(s.x) && isFinite(s.z));
  const hasDom = typeof document !== 'undefined';

  const holder = new THREE.Group(); holder.name = 'heliG3d'; holder.userData.floor = 'main'; holder.matrixAutoUpdate = false;
  if (o.group) o.group.add(holder);

  const saved = lsGet();
  const ctl = {
    mode: googleConfigured() && saved !== 'classic' ? 'google' : 'classic', // what the visitor wants
    active: false,      // Google tiles are on screen (classic hidden)
    status: googleConfigured() ? 'idle' : 'off', // idle | loading | ok | failed | off
    reason: '', entered: false, disposed: false,
  };
  let lib = null, libP = null, tiles = null, auth = null, draco = null, t0 = 0, models = 0, lastOk = 0, failedSeen = 0;
  let anchor = null, dy = 0, dyTarget = null, lockT = 0, attrT = 0, resT = 0, btnT = 0, attrText = '', firstTile = false;
  const camP = new THREE.Vector3(), v3 = new THREE.Vector3(), m4 = new THREE.Matrix4(), RY = new THREE.Matrix4().makeRotationY(Math.PI), size = new THREE.Vector2();
  const ray = new THREE.Raycaster(); ray.firstHitOnly = true;

  /* ---- classic city visibility (materials, so the area's own LOD code cannot re-show anything). Everything of the
     classic area goes, including our back-yard helipad: in the real back yard it stands under a ~14 m tree canopy, so in
     Google mode the helicopter parks on Eakin Rd in front of the house instead (o.homePad, see ctl.homePad) */
  const hidden = new Map(); // material → previous visible
  let areaN = -1;
  function classicMats() {
    const out = new Set(); if (!area || !area.group) return out;
    area.group.traverse((x) => { if (x.isMesh) for (const m of Array.isArray(x.material) ? x.material : [x.material]) if (m) out.add(m); });
    return out;
  }
  function hideClassic(hide) {
    if (hide) { for (const m of classicMats()) { if (!hidden.has(m)) hidden.set(m, m.visible); m.visible = false; } areaN = area && area.group ? area.group.children.length : -1; }
    else { for (const [m, v] of hidden) m.visible = v; hidden.clear(); areaN = -1; }
  }
  // the area keeps streaming its imagery from heli.js's area.update / stream.update: pause it while Google is shown
  const origUpdate = area && area.update, origStream = area && area.stream && area.stream.update;
  if (area) {
    area.update = function (cam) { if (!ctl.active && origUpdate) return origUpdate.call(area, cam); };
    if (area.stream) area.stream.update = function (x, z) { if (!ctl.active && origStream) return origStream.call(area.stream, x, z); };
  }
  let detailP = null;
  const loadDetail = () => { if (!detailP && area && area.loadDetail) detailP = area.loadDetail(); return detailP || Promise.resolve(false); };

  /* ---- DOM: logo + attributions (bottom right), hybrid-scene line, data-sources panel, note pill, rail toggle */
  let box = null, dataEl = null, popEl = null, noteEl = null, noteT = 0, btn = null;
  const logoUrl = (dark) => new URL('../vendor/google-maps-attribution/GoogleMaps_Logo_With' + (dark ? 'Dark' : 'Light') + 'Outline.svg', import.meta.url).href;
  function mountDom() {
    if (!hasDom || box) return;
    if (!document.getElementById('heli-g3d-css')) { const s = document.createElement('style'); s.id = 'heli-g3d-css'; s.textContent = CSS; document.head.appendChild(s); }
    box = document.createElement('div'); box.id = 'heliG3d'; box.className = 'heli-ui-g3d';
    box.innerHTML = '<div class="g3-pop" role="dialog"></div><div class="g3-row" role="button" tabindex="0"><img class="g3-logo" alt="Google Maps"><span class="g3-data"></span></div><div class="g3-own"></div>';
    const img = box.querySelector('.g3-logo'); img.src = logoUrl(false); img.setAttribute('aria-label', 'Google Maps');
    dataEl = box.querySelector('.g3-data'); popEl = box.querySelector('.g3-pop');
    const row = box.querySelector('.g3-row');
    const stop = (e) => e.stopPropagation();
    for (const ev of ['pointerdown', 'mousedown', 'dblclick', 'touchstart']) box.addEventListener(ev, stop, ev === 'touchstart' ? { passive: true } : undefined);
    row.addEventListener('click', (e) => { e.stopPropagation(); box.classList.toggle('open'); fillPop(); });
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); } });
    popEl.addEventListener('click', (e) => { e.stopPropagation(); box.classList.remove('open'); });
    noteEl = document.createElement('div'); noteEl.id = 'heliG3dNote';
    document.body.appendChild(box); document.body.appendChild(noteEl);
    box.style.display = ctl.active ? '' : 'none';
    box.querySelector('.g3-own').textContent = S('g3dOwn');
  }
  function unmountDom() {
    try { box && box.remove(); noteEl && noteEl.remove(); btn && btn.remove(); } catch (_) {}
    box = dataEl = popEl = noteEl = null; btn = null; clearTimeout(noteT);
    try { document.body.classList.remove('heli-g3d'); } catch (_) {}
  }
  function fillPop() {
    if (!popEl) return;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    popEl.innerHTML = '<b>' + esc(S('g3dData')) + '</b><p>' + esc(attrText || 'Google') + '</p><p>' + esc(S('g3dHybrid')) + '</p><p>' + esc(S('g3dLabels')) + '</p>';
  }
  function note(text, ms = 4200) { if (!noteEl) return; noteEl.textContent = text; noteEl.classList.add('show'); clearTimeout(noteT); noteT = setTimeout(() => noteEl && noteEl.classList.remove('show'), ms); }
  const googleOn = () => ctl.mode === 'google' && ctl.active;
  function ensureButton() {
    if (!hasDom || !googleConfigured()) return;
    if (!btn) {
      btn = document.createElement('button'); btn.id = 'heliG3dBtn'; btn.type = 'button';
      btn.innerHTML = '<span class="i"></span><span class="t"></span>';
      for (const ev of ['pointerdown', 'mousedown', 'dblclick']) btn.addEventListener(ev, (e) => e.stopPropagation());
      // Google shown (or loading) → classic; classic (chosen, or after a failure) → try Google again
      btn.addEventListener('click', (e) => { e.stopPropagation(); ctl.setMode(googleOn() ? 'classic' : 'google'); });
    }
    if (!btn.isConnected) { const rail = document.getElementById('heliRail'); if (!rail) return; const before = rail.querySelector('.hr-radio'); rail.insertBefore(btn, before || null); }
    const g = googleOn();
    const i = btn.querySelector('.i'), t = btn.querySelector('.t');
    const ic = g ? '🌍' : '🗺', tx = g ? S('g3dS') : S('g3dClassicS');
    if (i.textContent !== ic) i.textContent = ic; if (t.textContent !== tx) t.textContent = tx;
    btn.title = S('aG3d'); btn.setAttribute('aria-label', S('aG3d')); btn.setAttribute('aria-pressed', g ? 'true' : 'false');
    btn.classList.toggle('on', g); btn.classList.toggle('busy', g && ctl.status === 'loading');
  }

  /* ---- the 3D tiles renderer */
  function loadLib() {
    if (libP) return libP;
    libP = Promise.all([
      import('3d-tiles-renderer/src/three/TilesRenderer.js'),
      import('3d-tiles-renderer/src/plugins/three/GoogleCloudAuthPlugin.js'),
      import('3d-tiles-renderer/src/plugins/three/fade/TilesFadePlugin.js'),
      import('3d-tiles-renderer/src/plugins/three/GLTFExtensionsPlugin.js'),
      import('3d-tiles-renderer/src/plugins/three/UnloadTilesPlugin.js'),
      import('3d-tiles-renderer/src/three/math/GeoConstants.js'),
      import('3d-tiles-renderer/src/three/math/Ellipsoid.js'),
      import('3d-tiles-renderer/src/base/constants.js'),
      import('three/examples/jsm/loaders/DRACOLoader.js'),
    ]).then(([TR, GA, FD, GE, UL, GC, EL, CN, DR]) => (lib = { TilesRenderer: TR.TilesRenderer, GoogleCloudAuthPlugin: GA.GoogleCloudAuthPlugin, TilesFadePlugin: FD.TilesFadePlugin, GLTFExtensionsPlugin: GE.GLTFExtensionsPlugin, UnloadTilesPlugin: UL.UnloadTilesPlugin, E: GC.WGS84_ELLIPSOID, OBJECT_FRAME: EL.OBJECT_FRAME, FAILED: CN.FAILED, DRACOLoader: DR.DRACOLoader }));
    return libP;
  }
  // reads the Google error text of a failed response (403 "API not enabled" / referer / quota) without the key
  function noteError(res) {
    try {
      const st = res.status;
      res.clone().text().then((t) => {
        let msg = ''; try { const j = JSON.parse(t); msg = (j.error && (j.error.message || j.error.status)) || ''; } catch (_) { msg = String(t || '').slice(0, 200); }
        ctl.reason = (st + ' ' + msg).replace(/key=[^&\s]+/g, 'key=…').trim();
        console.warn('[heli-g3d] Google Map Tiles API answered ' + ctl.reason);
      }).catch(() => { ctl.reason = String(st); });
    } catch (_) {}
  }
  function startTiles() {
    if (tiles || ctl.disposed) return;
    const L = lib;
    tiles = new L.TilesRenderer();
    auth = new L.GoogleCloudAuthPlugin({ apiToken: GOOGLE_MAPS_API_KEY, autoRefreshToken: true });
    tiles.registerPlugin(auth);
    // watcher (runs first): delegates to the auth plugin, records Google's error answers for the fallback / report
    tiles.registerPlugin({
      name: 'HELI_G3D_WATCH', priority: -2,
      fetchData(uri, opts) {
        const p = auth.fetchData(uri, opts);
        return p.then((res) => {
          if (res && !res.ok && String(uri).indexOf(ROOT_HOST) >= 0 && res.status !== 404) { failedSeen++; noteError(res); }
          else if (res && res.ok) lastOk = performance.now();
          return res;
        }, (e) => { failedSeen++; if (!ctl.reason) ctl.reason = 'network: ' + (e && e.message ? e.message : e); throw e; });
      },
    });
    try {
      draco = new L.DRACOLoader(); draco.setDecoderPath(new URL('../vendor/three/examples/jsm/libs/draco/gltf/', import.meta.url).href);
      draco.setWorkerLimit(phone ? 2 : 4);
      tiles.registerPlugin(new L.GLTFExtensionsPlugin({ dracoLoader: draco, rtc: true, metadata: false }));
    } catch (e) { console.warn('[heli-g3d] draco', e); }
    tiles.registerPlugin(new L.TilesFadePlugin({ fadeDuration: phone ? 200 : 300, maximumFadeOutTiles: phone ? 20 : 50 }));
    if (phone) { try { tiles.registerPlugin(new L.UnloadTilesPlugin()); } catch (_) {} }
    // detail / memory (after the auth plugin's recommended settings): phones get coarser tiles and a small cache
    tiles.errorTarget = phone ? 36 : 18;
    tiles.downloadQueue.maxJobs = phone ? 12 : 24;
    tiles.parseQueue.maxJobs = phone ? 3 : 8;
    const C = tiles.lruCache, MB = 1024 * 1024;
    if (phone) { C.minSize = 450; C.maxSize = 800; C.minBytesSize = 110 * MB; C.maxBytesSize = 170 * MB; }
    else { C.minSize = 3000; C.maxSize = 5000; C.minBytesSize = 320 * MB; C.maxBytesSize = 460 * MB; }
    tiles.addEventListener('load-model', (e) => {
      models++; lastOk = performance.now();
      try {
        e.scene.traverse((x) => {
          x.userData.floor = 'main'; x.userData.heliG3d = true;
          if (x.isMesh) { x.castShadow = false; x.receiveShadow = false; for (const m of Array.isArray(x.material) ? x.material : [x.material]) if (m) { m.toneMapped = false; m.fog = true; } }
        });
      } catch (_) {}
      if (!firstTile) { firstTile = true; onFirstTile(); }
    });
    holder.add(tiles.group);
    tiles.setCamera(o.camera);
    resT = 0; anchor = null; t0 = performance.now(); models = 0; failedSeen = 0; firstTile = false;
    ctl.status = 'loading'; ctl.reason = '';
  }
  function stopTiles() {
    if (!tiles) return;
    try { holder.remove(tiles.group); } catch (_) {}
    try { tiles.dispose(); } catch (e) { console.warn('[heli-g3d] dispose', e); }
    // anything the renderer still had in its group (fading tiles)
    try { tiles.group.traverse((x) => { if (x.geometry) x.geometry.dispose(); const ms = Array.isArray(x.material) ? x.material : x.material ? [x.material] : []; for (const m of ms) { for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose(); } }); } catch (_) {}
    try { draco && draco.dispose(); } catch (_) {}
    tiles = null; auth = null; draco = null; attrText = '';
  }
  function onFirstTile() {
    ctl.status = 'ok';
    if (ctl.mode === 'google') { say(S('g3dOnMsg'), 2200); note(S('g3dHybrid'), 5200); }
  }
  function fail(why) {
    if (ctl.status === 'failed') return;
    ctl.status = 'failed'; if (why && !ctl.reason) ctl.reason = why;
    console.warn('[heli-g3d] Google 3D unavailable → classic city (' + (ctl.reason || why || '?') + ')');
    stopTiles();
    showClassic();
    say(S('g3dFail'), 3200); note(S('g3dFail'), 5000);
  }
  const modeChanged = () => { try { o.onMode && o.onMode(ctl); } catch (e) { console.warn('[heli-g3d] onMode', e); } };
  function showGoogle() { ctl.active = true; hideClassic(true); holder.visible = true; if (box) box.style.display = ''; try { document.body.classList.add('heli-g3d'); } catch (_) {} modeChanged(); }
  function showClassic() { ctl.active = false; hideClassic(false); holder.visible = false; if (box) { box.style.display = 'none'; box.classList.remove('open'); } try { document.body.classList.remove('heli-g3d'); } catch (_) {} loadDetail(); modeChanged(); }

  async function startGoogle() {
    try { await loadLib(); } catch (e) { console.warn('[heli-g3d] library', e); fail('library: ' + (e && e.message ? e.message : e)); return; }
    if (ctl.disposed || !ctl.entered || ctl.mode !== 'google') return;
    startTiles();
  }

  /* ---- placement: East-Up-South frame at the camera + Mercator scale there; vertical lock */
  function reanchor(cx, cz) {
    const L = lib; if (!L || !tiles) return;
    const g = F.toGeo(cx, cz);
    L.E.getRotationMatrixFromAzElRoll(g.lat, g.lon, 0, 0, 0, m4, L.OBJECT_FRAME); // x west, y up, z north
    L.E.getCartographicToPosition(g.lat, g.lon, H0, v3);
    m4.setPosition(v3).invert().premultiply(RY);                                       // → x east, y up, z south
    m4.decompose(tiles.group.position, tiles.group.quaternion, tiles.group.scale);
    tiles.group.updateMatrix();
    // one uniform scale (the renderer's screen-space error wants a uniform group scale): the mean of the east / south
    // Mercator scales at the camera (they differ by 0.4 %, i.e. ≤ 0.4 m at 200 m from the camera)
    const s = F.scaleAt(g.lat), k = (s.sx + s.sz) / 2;
    anchor = { x: cx, z: cz, sx: k, sz: k };
    applyHolder();
  }
  function applyHolder() {
    if (!anchor) return;
    holder.matrix.makeScale(anchor.sx, 1, anchor.sz).setPosition(anchor.x, dy, anchor.z);
    holder.updateMatrixWorld(true);
  }
  function hitY(x, z) {
    ray.set(v3.set(x, 800, z), new THREE.Vector3(0, -1, 0)); ray.far = 2000;
    const hits = []; try { ray.intersectObject(tiles.group, true, hits); } catch (_) { return null; }
    return hits.length ? hits[0].point.y : null;
  }
  function lockGround(cx, cz) {
    // the nearest reference spot within 700 m (open ground: a street, a lawn): the low quartile of (Google surface − our
    // ground) over its sample points → vertical offset (the low quartile skips cars, trees and roofs over some points)
    let best = null, bd = 700; for (const s of spots) { const d = Math.hypot(s.x - cx, s.z - cz); if (d < bd) { bd = d; best = s; } }
    if (!best || !tiles) return;
    const r = best.r || 6, pts = best.pts || [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]], diff = [];
    for (const [ox, oz] of pts) { const x = best.x + ox, z = best.z + oz; const y = hitY(x, z); if (y != null) diff.push(y - dy - ground(x, z)); }
    if (diff.length < Math.max(3, Math.ceil(pts.length * 0.5))) return;
    diff.sort((a, b) => a - b); const lo = diff[Math.floor((diff.length - 1) * 0.25)];
    if (Math.abs(lo) > 25) return; // tiles still coarse: ignore
    dyTarget = clamp(-lo, -25, 25);
  }
  // where the helicopter parks at home in Google mode (null = the classic back-yard pad)
  ctl.homePad = () => {
    const P = o.homePad; if (!P || ctl.mode !== 'google' || ctl.status === 'failed' || !googleConfigured()) return null;
    return { x: P.x, y: ground(P.x, P.z) + (P.y0 != null ? P.y0 : 0.05), z: P.z, h: P.h || 0 };
  };
  ctl.groundAt = (x, z) => (tiles && ctl.active ? hitY(x, z) : null);

  /* ---- per frame */
  ctl.update = (camera, dt = 0.016) => {
    if (ctl.disposed || !ctl.entered) return;
    const now = performance.now();
    btnT += dt; if (btnT > 0.5) { btnT = 0; ensureButton(); if (ctl.active && area && area.group && area.group.children.length !== areaN) hideClassic(true); }
    if (!tiles || !camera) return;
    camera.getWorldPosition(camP);
    if (!anchor || Math.hypot(camP.x - anchor.x, camP.z - anchor.z) > 150) reanchor(camP.x, camP.z);
    if (dyTarget != null && Math.abs(dyTarget - dy) > 0.02) { dy += (dyTarget - dy) * Math.min(1, dt * 1.5); if (Math.abs(dyTarget - dy) < 0.02) dy = dyTarget; applyHolder(); }
    resT -= dt;
    if (resT <= 0 && o.renderer) {
      resT = 1;
      o.renderer.getSize(size); const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, phone ? 1.5 : 2);
      tiles.setResolution(camera, Math.max(1, Math.round(size.x * dpr)), Math.max(1, Math.round(size.y * dpr)));
    }
    try { tiles.update(); } catch (e) { if (!ctl._uErr) { ctl._uErr = 1; console.warn('[heli-g3d] update', e); } }
    // failure detection
    if (ctl.status === 'loading') {
      if (tiles.rootLoadingState === lib.FAILED) fail('root tileset');
      else if (now - t0 > START_TIMEOUT && models === 0) fail(ctl.reason || 'timeout');
      else if (failedSeen >= 6 && models === 0) fail(ctl.reason || 'tiles failed');
    } else if (ctl.status === 'ok' && failedSeen >= 24 && now - lastOk > 30000) fail(ctl.reason || 'tiles failed');
    lockT -= dt; if (lockT <= 0 && models > 0) { lockT = 0.7; lockGround(camP.x, camP.z); }
    attrT -= dt;
    if (attrT <= 0) {
      attrT = 1;
      let s = '';
      try { const A = tiles.getAttributions ? tiles.getAttributions() : []; for (const a of A) if (a && a.type === 'string' && a.value) s = a.value; } catch (_) {}
      if (!s && auth && auth._attributionsManager) { try { s = auth._attributionsManager.toString(); } catch (_) {} }
      if (s !== attrText) { attrText = s; if (dataEl) dataEl.textContent = s || 'Google'; if (box && box.classList.contains('open')) fillPop(); }
    }
  };

  /* ---- world enter / exit, mode switch */
  ctl.enter = () => {
    if (ctl.disposed) return Promise.resolve(false);
    ctl.entered = true;
    mountDom(); ensureButton();
    if (ctl.mode === 'google' && googleConfigured() && ctl.status !== 'failed') {
      showGoogle(); startGoogle();
      if (box) box.style.display = '';
      return Promise.resolve(true);
    }
    showClassic();
    return loadDetail();
  };
  ctl.exit = () => {
    ctl.entered = false;
    unmountDom();
  };
  ctl.setMode = (m) => {
    if (m !== 'google' && m !== 'classic') return;
    ctl.mode = m; lsSet(m);
    if (!ctl.entered) return;
    if (m === 'google') {
      if (!googleConfigured()) return;
      if (ctl.status === 'failed') { ctl.status = 'idle'; ctl.reason = ''; }
      showGoogle(); say(S('g3dLoading'), 1800); startGoogle();
    } else {
      stopTiles(); if (ctl.status !== 'off') ctl.status = 'idle'; showClassic(); say(S('g3dOffMsg'), 2200);
    }
    ensureButton();
  };
  ctl.dispose = () => {
    if (ctl.disposed) return; ctl.disposed = true; ctl.entered = false;
    stopTiles(); hideClassic(false); unmountDom();
    try { holder.parent && holder.parent.remove(holder); } catch (_) {}
    if (area) { try { if (origUpdate) area.update = origUpdate; if (area.stream && origStream) area.stream.update = origStream; } catch (_) {} }
    lib = null; libP = null;
  };
  ctl.stats = () => {
    const out = { mode: ctl.mode, active: ctl.active, status: ctl.status, reason: ctl.reason, models, dy: +dy.toFixed(2), anchor: anchor ? { x: Math.round(anchor.x), z: Math.round(anchor.z), sx: +anchor.sx.toFixed(5), sz: +anchor.sz.toFixed(5) } : null, attributions: attrText };
    if (tiles) { out.tiles = Object.assign({}, tiles.stats); out.cacheMB = Math.round((tiles.lruCache.cachedBytes || 0) / 1048576); out.visible = tiles.visibleTiles ? tiles.visibleTiles.size : null; out.errorTarget = tiles.errorTarget; }
    return out;
  };
  Object.defineProperty(ctl, 'tiles', { get: () => tiles });
  ctl.holder = holder; ctl.frame = F;
  return ctl;
}
export default attachGoogle3D;

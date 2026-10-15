// tex-cache.js — V6 PERF: procedural-texture cache + progressive generation (owner: PERF bot).
// No side effects on import. Everything degrades to a plain pass-through (gen(fullSize)) when it is not initialised,
// when there is no DOM / IndexedDB / createImageBitmap (node tests), or when anything throws.
//
//   await initTexCache(quality)       core.js, before the modules build: opens IndexedDB 'eakin-texcache' and decodes every
//                                     stored texture of this VERSION + quality into ImageBitmaps (off the main thread).
//   cached(key, size, gen, opts)      generators: gen(sz) → Texture | canvas | { part: Texture | canvas | null }.
//                                     • cache hit  → the same shape, rebuilt from the stored pixels (no generation)
//                                     • miss       → first visit: gen(size/4) now (≈16× cheaper) and gen(size) later in idle
//                                                    time ("progressive"), then the full-size pixels are stored.
//   startTexUpgrades(scene)           core.js, after the first interactive frame: runs the queued full-size generations
//                                     in small idle slices, swaps every texture that shows a low-res canvas over to the
//                                     full-size one, and writes new entries to IndexedDB (lossy WebP/JPEG for opaque
//                                     maps, PNG when the canvas has alpha).
//   texCacheStats                     counters (hits, misses, ms) — also on window.__tour.texCache.
//
// Bump VERSION whenever any generator's output changes (old entries are deleted in the background).
import * as THREE from 'three';

export const VERSION = 'v6.1';
const DB_NAME = 'eakin-texcache', STORE = 'tex';
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const hasDOM = () => typeof document !== 'undefined' && !!document.createElement;

const S = {
  ready: false, quality: 'high', prefix: '', db: null,
  mem: new Map(),      // key → { meta, bitmaps } decoded from IndexedDB (consumed on first use)
  made: new Map(),     // key → { meta, canvases } built this session (hit or generated) — duplicate requests reuse them
  saveQ: [],           // keys whose full-size canvases still have to be written
  upQ: [],             // progressive jobs { key, size, gen, shape, low: {part: canvas} }
  upRunning: false, scene: null, progressive: true,
};
export const texCacheStats = { enabled: false, entries: 0, loadMs: 0, hits: 0, misses: 0, progressive: 0, genMs: 0, hitMs: 0, upgraded: 0, upgradeMs: 0, saved: 0, saveFail: 0, pendingUpgrades: 0, error: null };

/* ------------------------------------------------------------------ IndexedDB plumbing (every call guarded) */
function openDB() {
  return new Promise((res, rej) => {
    let r;
    try { r = indexedDB.open(DB_NAME, 1); } catch (e) { rej(e); return; }
    r.onupgradeneeded = () => { try { r.result.createObjectStore(STORE); } catch (_) {} };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('indexedDB open failed'));
    r.onblocked = () => rej(new Error('indexedDB blocked'));
  });
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
function withTimeout(p, ms, what) {
  let to; return Promise.race([p, new Promise((_, rej) => { to = setTimeout(() => rej(new Error(what + ' timeout ' + ms + 'ms')), ms); })]).finally(() => clearTimeout(to));
}

/** Open the cache and decode this version's entries. Never throws; resolves within `timeout` ms. */
export async function initTexCache(quality = 'high', opts = {}) {
  const t0 = now();
  S.quality = quality; S.prefix = `${VERSION}|${quality}|`;
  S.progressive = opts.progressive !== false;
  if (!hasDOM()) return texCacheStats;
  S.ready = true; // progressive generation works even without IndexedDB
  texCacheStats.enabled = true;
  if (typeof indexedDB === 'undefined' || typeof createImageBitmap !== 'function' || typeof Blob === 'undefined') { texCacheStats.error = 'no indexedDB/createImageBitmap'; return texCacheStats; }
  try {
    await withTimeout((async () => {
      S.db = await openDB();
      const tx = S.db.transaction(STORE, 'readonly'), st = tx.objectStore(STORE);
      const range = IDBKeyRange.bound(S.prefix, S.prefix + '￿');
      const [keys, vals] = await Promise.all([reqP(st.getAllKeys(range)), reqP(st.getAll(range))]);
      await Promise.all(vals.map(async (v, i) => {
        try {
          if (!v || !v.meta || !v.blobs) return;
          const bitmaps = {};
          for (const [p, b] of Object.entries(v.blobs)) bitmaps[p] = b ? await createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }) : null;
          S.mem.set(String(keys[i]).slice(S.prefix.length), { meta: v.meta, bitmaps });
        } catch (e) { /* one bad entry: regenerate it */ }
      }));
    })(), opts.timeout || 5000, 'texcache load');
  } catch (e) { texCacheStats.error = String((e && e.message) || e); console.warn('[texcache] disabled for this visit:', texCacheStats.error); S.mem.clear(); }
  texCacheStats.entries = S.mem.size;
  texCacheStats.loadMs = Math.round(now() - t0);
  return texCacheStats;
}

/* ------------------------------------------------------------------ shapes */
const isCanvas = (c) => !!c && ((typeof HTMLCanvasElement !== 'undefined' && c instanceof HTMLCanvasElement) || (typeof OffscreenCanvas !== 'undefined' && c instanceof OffscreenCanvas));
function partsOf(res) {
  if (!res) return null;
  if (res.isTexture) return isCanvas(res.image) ? { shape: 'tex', parts: { _: res } } : null;
  if (isCanvas(res)) return { shape: 'canvas', parts: { _: res } };
  if (typeof res !== 'object' || Array.isArray(res)) return null;
  const parts = {};
  for (const [k, v] of Object.entries(res)) {
    if (v == null) { parts[k] = null; continue; }
    if (v.isTexture && isCanvas(v.image)) parts[k] = v;
    else if (isCanvas(v)) parts[k] = v;
    else return null; // anything else → not cacheable
  }
  return { shape: 'obj', parts };
}
const canvasOfPart = (v) => (v && v.isTexture ? v.image : v);
function texMeta(t) {
  return {
    tex: true, repeat: [t.repeat.x, t.repeat.y], offset: [t.offset.x, t.offset.y], wrapS: t.wrapS, wrapT: t.wrapT,
    magFilter: t.magFilter, minFilter: t.minFilter, anisotropy: t.anisotropy, colorSpace: t.colorSpace,
    generateMipmaps: t.generateMipmaps, flipY: t.flipY, name: t.name || '',
  };
}
function metaOf(pp) {
  const m = { shape: pp.shape, parts: {} };
  for (const [k, v] of Object.entries(pp.parts)) m.parts[k] = v == null ? null : v.isTexture ? texMeta(v) : { tex: false };
  return m;
}
function texFrom(canvas, pm) {
  const t = new THREE.CanvasTexture(canvas);
  t.repeat.set(pm.repeat[0], pm.repeat[1]); t.offset.set(pm.offset[0], pm.offset[1]);
  t.wrapS = pm.wrapS; t.wrapT = pm.wrapT; t.magFilter = pm.magFilter; t.minFilter = pm.minFilter;
  t.anisotropy = pm.anisotropy; t.colorSpace = pm.colorSpace; t.generateMipmaps = pm.generateMipmaps; t.flipY = pm.flipY;
  if (pm.name) t.name = pm.name;
  t.needsUpdate = true;
  return t;
}
function rebuild(meta, canvases, texs) {
  const out = {};
  for (const [k, pm] of Object.entries(meta.parts)) {
    out[k] = pm == null || !canvases[k] ? null : pm.tex ? texFrom(canvases[k], pm) : canvases[k];
    if (texs && out[k] && out[k].isTexture) texs.push(out[k]);
  }
  return meta.shape === 'obj' ? out : out._;
}
function canvasFromBitmap(bm) {
  const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
  const g = c.getContext('2d', { willReadFrequently: true }); // CPU-backed: style averages / Sobel passes read it back
  g.drawImage(bm, 0, 0);
  try { bm.close && bm.close(); } catch (_) {}
  return c;
}

/**
 * cached(key, size, gen, {progressive, minSize}) — see header. `size` is the full size passed to gen; gen must accept any
 * size (it is called with a smaller one on a progressive first visit). progressive:false = cache only.
 */
export function cached(key, size, gen, opts = {}) {
  if (!S.ready) return gen(size);
  const full = S.quality + '|' + key;
  try {
    // session duplicate
    const dup = S.made.get(full);
    if (dup) return rebuild(dup.meta, dup.canvases, dup.texs);
    // stored
    const hit = S.mem.get(key);
    if (hit) {
      const t0 = now();
      S.mem.delete(key);
      const canvases = {};
      for (const [k, bm] of Object.entries(hit.bitmaps)) canvases[k] = bm ? canvasFromBitmap(bm) : null;
      const e = { meta: hit.meta, canvases, texs: [] };
      S.made.set(full, e);
      texCacheStats.hits++; texCacheStats.hitMs += now() - t0;
      return rebuild(hit.meta, canvases, e.texs);
    }
  } catch (e) { console.warn('[texcache] hit failed, regenerating', key, e); }
  // miss
  const prog = S.progressive && opts.progressive !== false && size >= (opts.minSize || 256);
  const sz = prog ? Math.max(64, Math.round(size / (size >= 512 ? 4 : 2))) : size;
  const t0 = now();
  const res = gen(sz);
  texCacheStats.genMs += now() - t0; texCacheStats.misses++;
  const pp = partsOf(res);
  if (!pp) return res; // not cacheable (e.g. DataTexture fallback) → plain result
  const meta = metaOf(pp), canvases = {}, texs = [];
  for (const [k, v] of Object.entries(pp.parts)) { canvases[k] = canvasOfPart(v); if (v && v.isTexture) texs.push(v); }
  S.made.set(full, { meta, canvases, texs });
  if (prog) { S.upQ.push({ key, full, size, gen, low: Object.assign({}, canvases) }); texCacheStats.progressive++; texCacheStats.pendingUpgrades = S.upQ.length; }
  else S.saveQ.push(key);
  // generated after the background loop finished (lazy materials, style switch) → kick it again
  if (S.scene && !S.upRunning) setTimeout(() => { if (!S.upRunning) startTexUpgrades(); }, 1500);
  return res;
}

/** current canvas of a cached entry part ('_' for single results) — full size once its progressive upgrade ran */
export function cachedCanvas(key, part = '_') {
  const e = S.made.get(S.quality + '|' + key);
  return (e && e.canvases[part]) || null;
}

/* ------------------------------------------------------------------ progressive upgrade + persistence */
function texturesByCanvas(scene) {
  const map = new Map();
  const add = (t) => { if (!t || !t.isTexture) return; const im = t.image; if (!im) return; let a = map.get(im); if (!a) map.set(im, (a = new Set())); a.add(t); };
  const scanMat = (m) => { if (!m) return; for (const k in m) { const v = m[k]; if (v && v.isTexture) add(v); } if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) add(u.value); };
  const seen = new Set();
  const visit = (o) => {
    for (const m of [].concat(o.material || [], o.customDepthMaterial || [], o.customDistanceMaterial || [])) if (m && !seen.has(m)) { seen.add(m); scanMat(m); }
  };
  try { scene && scene.traverse(visit); } catch (_) {}
  return map;
}
const idle = (ms) => new Promise((r) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => r(), { timeout: ms + 400 });
  else setTimeout(r, ms);
});

async function upgradeOne(job, byCanvas) {
  const t0 = now();
  const res = job.gen(job.size);
  const pp = partsOf(res);
  if (!pp) return;
  const entry = S.made.get(job.full);
  for (const [k, v] of Object.entries(pp.parts)) {
    const lowC = job.low[k], hiC = canvasOfPart(v);
    if (!lowC || !hiC) continue;
    const src = new THREE.Texture(hiC).source; // one shared Source per full-size canvas (r160: new Source → new GL texture)
    const ts = new Set(byCanvas.get(lowC) || []);
    if (entry) for (const t of entry.texs) if (t.image === lowC) ts.add(t);
    for (const t of ts) { t.source = src; t.needsUpdate = true; }
    if (entry) entry.canvases[k] = hiC;
  }
  texCacheStats.upgraded++; texCacheStats.upgradeMs += now() - t0;
  S.saveQ.push(job.key);
}
async function encode(c) {
  if (typeof c.toBlob !== 'function') return null;
  let alpha = false;
  try {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 255) { alpha = true; break; }
  } catch (_) { alpha = true; }
  const type = alpha ? 'image/png' : encode.webp ? 'image/webp' : 'image/jpeg';
  const b = await new Promise((r) => { try { c.toBlob(r, type, 0.92); } catch (_) { r(null); } });
  return b;
}
encode.webp = (() => { try { if (!hasDOM()) return false; const c = document.createElement('canvas'); c.width = c.height = 2; return c.toDataURL('image/webp').startsWith('data:image/webp'); } catch (_) { return false; } })();

async function saveOne(key) {
  if (!S.db) return;
  const e = S.made.get(S.quality + '|' + key);
  if (!e) return;
  const blobs = {};
  for (const [k, c] of Object.entries(e.canvases)) blobs[k] = c ? await encode(c) : null;
  if (Object.entries(e.canvases).some(([k, c]) => c && !blobs[k])) return;
  await new Promise((res) => {
    try {
      const tx = S.db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ meta: e.meta, blobs, t: Date.now() }, S.prefix + key);
      tx.oncomplete = () => { texCacheStats.saved++; res(); };
      tx.onerror = tx.onabort = () => { texCacheStats.saveFail++; res(); };
    } catch (_) { texCacheStats.saveFail++; res(); }
  });
}
async function purgeOld() {
  if (!S.db) return;
  try {
    const tx = S.db.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE);
    const keys = await reqP(st.getAllKeys());
    for (const k of keys) if (!String(k).startsWith(VERSION + '|')) st.delete(k);
  } catch (_) {}
}

/**
 * startTexUpgrades(scene, {delay, gap, onProgress}) — run queued full-size generations + saves in idle slices.
 * Safe to call more than once (later calls pick up newly queued work, e.g. style textures).
 */
export function startTexUpgrades(scene, opts = {}) {
  if (!S.ready) return Promise.resolve(texCacheStats);
  if (scene) S.scene = scene;
  if (S.upRunning) return S.upRunning;
  const gap = opts.gap != null ? opts.gap : 40;
  S.upRunning = (async () => {
    await new Promise((r) => setTimeout(r, opts.delay != null ? opts.delay : 0));
    let byCanvas = null;
    while (S.upQ.length || S.saveQ.length) {
      await idle(gap);
      if (typeof document !== 'undefined' && document.hidden) { await new Promise((r) => setTimeout(r, 500)); continue; }
      try {
        if (S.upQ.length) {
          if (!byCanvas) byCanvas = texturesByCanvas(S.scene);
          const job = S.upQ.shift();
          texCacheStats.pendingUpgrades = S.upQ.length;
          // textures created after the index was built (lazy materials) are found by a fresh scan once in a while
          if (!byCanvas.has(job.low[Object.keys(job.low)[0]])) byCanvas = texturesByCanvas(S.scene);
          await upgradeOne(job, byCanvas);
          opts.onProgress && opts.onProgress(texCacheStats);
        } else {
          await saveOne(S.saveQ.shift());
        }
      } catch (e) { console.warn('[texcache] background step failed', e); }
    }
    purgeOld();
    S.upRunning = null;
    return texCacheStats;
  })();
  return S.upRunning;
}

/** for tests / diagnostics: wipe the persistent cache */
export async function clearTexCache() {
  try { const db = S.db || (await openDB()); const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); await new Promise((r) => { tx.oncomplete = tx.onerror = r; }); } catch (_) {}
}

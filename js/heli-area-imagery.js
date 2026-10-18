// heli-area-imagery.js — V13 HELI: aerial imagery for the heli world, streamed by distance.
//  • four "clip" levels (z12, z14, z15, z16): a window of N × N tiles at native resolution that follows the camera.
//    Tiles live in a toroidal texture (tile X → slot X mod N), so recentring only uploads the tiles that came into
//    view (texSubImage2D via renderer.copyTextureToTexture, one 256² upload per tile); a tiny N × N mask texture says
//    which slots hold the right tile, so a missing tile falls back softly to the coarser level underneath.
//    Tiles come from data/heli-tiles/{z}/{x}_{y}.jpg; outside the baked squares (and only when online) from the
//    USGS tile service (public domain, CORS *).
//  • per-level colour grading: mean / std matching (linear light) of every level against the finest one over the
//    same ground, so the levels (different years / sensors) blend without visible seams.
//  • water mask (lakes + river polygons, rasterised once) for the water shading in the terrain shader.
// No side effects on import. Every public function is guarded and never throws.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function loadImg(url) {
  if (typeof fetch === 'function' && typeof createImageBitmap === 'function') {
    return fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status)))).then((b) => createImageBitmap(b)).catch(() => null);
  }
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
}
const closeImg = (im) => { if (im && im.close) try { im.close(); } catch (_) {} };

/* sRGB 8-bit → linear LUT (stats are matched in linear light, like the shader blends) */
const LIN = (() => { const t = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); } return t; })();
let statCanvas = null;
function imgStats(src, sx, sy, sw, sh) {
  // → [mean r, g, b, mean² r, g, b, n] of a 24 × 24 downsample (linear light), or null
  try {
    if (typeof document === 'undefined') return null;
    if (!statCanvas) { statCanvas = document.createElement('canvas'); statCanvas.width = statCanvas.height = 24; }
    const g = statCanvas.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, 24, 24);
    if (sw != null) g.drawImage(src, sx, sy, sw, sh, 0, 0, 24, 24); else g.drawImage(src, 0, 0, 24, 24);
    const d = g.getImageData(0, 0, 24, 24).data;
    const s = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      const r = LIN[d[i]], gg = LIN[d[i + 1]], b = LIN[d[i + 2]];
      s[0] += r; s[1] += gg; s[2] += b; s[3] += r * r; s[4] += gg * gg; s[5] += b * b; s[6]++;
    }
    return s;
  } catch (_) { return null; }
}

/* ============================================================================================ clip level */
// lv = { z, X0, X1, Y0, Y1, bounds } (baked tiles), N = window size in tiles
export function makeClip(THREE, lv, o) {
  const N = o.N || 8, PX = 256, base = o.base, renderer = o.renderer || null;
  const nx = lv.X1 - lv.X0 + 1, ny = lv.Y1 - lv.Y0 + 1, b = lv.bounds;
  const tw = (b[2] - b[0]) / nx, th = (b[3] - b[1]) / ny;
  const hasDom = typeof document !== 'undefined';
  const canCopy = !!(renderer && typeof renderer.copyTextureToTexture === 'function' && typeof renderer.initTexture === 'function');
  // GPU path: an empty (zeroed) RGBA texture, filled tile by tile with texSubImage2D — no big canvas at all.
  // Fallback: a canvas the tiles are drawn into (re-uploaded, throttled).
  let c = null, tex;
  if (canCopy) {
    let px = new Uint8Array(N * PX * N * PX * 4);
    tex = new THREE.DataTexture(px, N * PX, N * PX);
    tex.userData.free = () => { px = null; tex.image.data = null; };
  } else {
    c = hasDom ? document.createElement('canvas') : null;
    if (c) { c.width = c.height = N * PX; const g = c.getContext('2d'); g.fillStyle = '#6f7a63'; g.fillRect(0, 0, c.width, c.height); }
    tex = new THREE.CanvasTexture(c);
  }
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.flipY = false; tex.unpackAlignment = 4;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  const maskData = new Uint8Array(N * N * 4);
  const mask = new THREE.DataTexture(maskData, N, N);
  mask.wrapS = mask.wrapT = THREE.RepeatWrapping; mask.magFilter = THREE.LinearFilter; mask.minFilter = THREE.LinearFilter; mask.generateMipmaps = false; mask.flipY = false; mask.needsUpdate = true;
  const geo = new THREE.Vector4(b[0], b[1], tw, th);       // tile coords (relative to X0 / Y0) = (xz - geo.xy) / geo.zw
  const win = new THREE.Vector4(-1000, -1000, N, 0);        // window start (relative tiles), N, on
  const slot = new Array(N * N).fill(null);                 // tile key held by each slot
  const want = new Array(N * N).fill(null);                 // tile key the window wants in each slot
  const missing = new Set();                                // tiles that 404'd / failed (never retried)
  const online = o.online || null;
  const C = {
    z: lv.z, lv, N, tex, mask, geo, win, enabled: false, loaded: 0, uploads: 0, fails: 0, onlineFails: 0, busy: 0, stats: null, statKeys: new Set(),
    useCopy: canCopy, primed: false,
    dirtyMask: false, dirtyCanvas: false, lastCanvas: 0, ref: o.ref || null, onChange: o.onChange || null,
  };
  const acc = [0, 0, 0, 0, 0, 0, 0];
  const mod = (a) => ((a % N) + N) % N;
  // baked tiles: the level's rectangle (unless it lists its tiles) + any extra tiles baked later (data/heli-area-ext.json)
  const listed = Array.isArray(lv.list) ? new Set(lv.list.map((t) => t[0] + ':' + t[1])) : null;
  const extra = Array.isArray(o.extra) && o.extra.length ? new Set(o.extra.map((t) => t[0] + ':' + t[1])) : null;
  const inBaked = (X, Y) => (listed ? listed.has(X + ':' + Y) : X >= lv.X0 && X <= lv.X1 && Y >= lv.Y0 && Y <= lv.Y1) || (extra ? extra.has(X + ':' + Y) : false);
  const urlOf = (X, Y) => {
    if (inBaked(X, Y)) return `${base}heli-tiles/${lv.z}/${X}_${Y}.jpg`;
    if (online && C.onlineFails < 10 && !(typeof navigator !== 'undefined' && navigator.onLine === false)) return online.replace('{z}', lv.z).replace('{x}', X).replace('{y}', Y);
    return null;
  };
  // relative tile coords of a point
  C.tileOf = (x, z) => [(x - b[0]) / tw, (z - b[1]) / th];
  C.boundsOfWindow = () => [b[0] + win.x * tw, b[1] + win.y * th, b[0] + (win.x + N) * tw, b[1] + (win.y + N) * th];
  function prime() {
    if (C.primed) return;
    C.primed = true;
    if (C.useCopy) {
      try { renderer.initTexture(tex); if (tex.userData.free) tex.userData.free(); } catch (e) { C.useCopy = false; }
    }
  }
  const tmpTex = new THREE.Texture(); tmpTex.flipY = false; tmpTex.generateMipmaps = false;
  const pos2 = new THREE.Vector2();
  let pendingMip = 0;
  function put(im, sx, sy, last) {
    if (C.useCopy) {
      try {
        tmpTex.image = im;
        pos2.set(sx * PX, sy * PX);
        tex.generateMipmaps = !!last; // one mip rebuild per batch
        // three r160 copyTextureToTexture binds the destination on unit 0 but skips gl.activeTexture when its state
        // cache already has that texture on unit 0 (e.g. the terrain sampler) — then texSubImage2D hits whatever unit
        // is active. Make unit 0 the active one first.
        try { const gl = renderer.getContext(); if (renderer.state && renderer.state.activeTexture) renderer.state.activeTexture(gl.TEXTURE0); } catch (_) {}
        renderer.copyTextureToTexture(pos2, tmpTex, tex);
        tex.generateMipmaps = true;
        if (typeof window !== 'undefined' && window.__heliTileDebug) { const e = renderer.getContext().getError(); if (e) console.warn('[heli-area] tile upload GL error', e, 'z' + lv.z, sx, sy, im && im.width, im && im.height); }
        C.uploads++;
        return;
      } catch (e) { C.useCopy = false; console.warn('[heli-area] tile upload failed', e); return; }
    }
    if (c) {
      try { c.getContext('2d').drawImage(im, sx * PX, sy * PX, PX, PX); } catch (_) {}
      C.dirtyCanvas = true;
    }
  }
  // queue: completed images waiting to be uploaded (uploads happen in flush(), i.e. inside the render loop)
  const ready = [];
  function request(X, Y, key, s) {
    const u = urlOf(X, Y);
    if (!u) { missing.add(key); return; }
    C.busy++;
    loadImg(u).then((im) => {
      C.busy--;
      if (!im) { if (!inBaked(X, Y)) C.onlineFails++; missing.add(key); C.fails++; return; }
      if (want[s] !== key) { closeImg(im); return; }
      // colour statistics (reference box only)
      if (C.ref && !C.statKeys.has(key)) {
        // the part of the tile inside the reference box (whole tile for small tiles, a crop for big z12 ones)
        const x0 = b[0] + (X - lv.X0) * tw, z0 = b[1] + (Y - lv.Y0) * th;
        const ix0 = Math.max(x0, C.ref[0]), ix1 = Math.min(x0 + tw, C.ref[2]), iz0 = Math.max(z0, C.ref[1]), iz1 = Math.min(z0 + th, C.ref[3]);
        const frac = Math.max(0, ix1 - ix0) * Math.max(0, iz1 - iz0) / (tw * th);
        if (frac > 0.3 || (frac > 0 && tw > (C.ref[2] - C.ref[0]))) {
          C.statKeys.add(key);
          const st = frac > 0.95 ? imgStats(im) : imgStats(im, (ix0 - x0) / tw * PX, (iz0 - z0) / th * PX, (ix1 - ix0) / tw * PX, (iz1 - iz0) / th * PX);
          if (st) { for (let i = 0; i < 7; i++) acc[i] += st[i]; C.stats = acc.slice(); C.statsDirty = true; }
        }
      }
      ready.push({ im, key, s });
      pump();
    }, () => { C.busy--; });
  }
  let queue = [];
  function pump() {
    while (C.busy < (o.conc || 4) && queue.length) {
      const j = queue.shift();
      if (want[j.s] !== j.key || slot[j.s] === j.key) continue;
      request(j.X, j.Y, j.key, j.s);
    }
  }
  C.recentre = (x, z, force) => {
    const [tx, ty] = C.tileOf(x, z);
    const cxw = win.x + N / 2, cyw = win.y + N / 2;
    if (!force && Math.abs(tx - cxw) <= 1.1 && Math.abs(ty - cyw) <= 1.1) return false;
    const wx = Math.round(tx - N / 2), wy = Math.round(ty - N / 2);
    if (!force && wx === win.x && wy === win.y) return false;
    win.x = wx; win.y = wy; win.w = 1;
    queue = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const X = wx + i + lv.X0, Y = wy + j + lv.Y0, s = mod(X - lv.X0) + mod(Y - lv.Y0) * N, key = X + ':' + Y;
      want[s] = key;
      if (slot[s] !== key) {
        if (slot[s] !== null || maskData[s * 4] !== 0) { maskData[s * 4] = 0; maskData[s * 4 + 1] = 0; maskData[s * 4 + 2] = 0; maskData[s * 4 + 3] = 255; C.dirtyMask = true; }
        slot[s] = null;
        if (!missing.has(key)) queue.push({ X, Y, key, s, d: Math.hypot(wx + i + 0.5 - tx, wy + j + 0.5 - ty) });
      }
    }
    queue.sort((a, q) => a.d - q.d);
    pump();
    return true;
  };
  // called once per frame from the render loop (terrain.onBeforeRender): uploads at most `budget` tiles
  C.flush = (budget = 4) => {
    if (!C.enabled) return 0;
    prime();
    let n = 0;
    while (ready.length && n < budget) {
      const r = ready.shift();
      if (want[r.s] !== r.key) { closeImg(r.im); continue; }
      const sx = r.s % N, sy = Math.floor(r.s / N);
      n++;
      put(r.im, sx, sy, n >= budget || !ready.length);
      closeImg(r.im);
      slot[r.s] = r.key; C.loaded++;
      maskData[r.s * 4] = 255; maskData[r.s * 4 + 1] = 255; maskData[r.s * 4 + 2] = 255; maskData[r.s * 4 + 3] = 255; C.dirtyMask = true;
    }
    if (C.dirtyCanvas) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - C.lastCanvas > 400 || (!ready.length && C.busy === 0)) { tex.needsUpdate = true; C.dirtyCanvas = false; C.lastCanvas = now; }
    }
    if (C.dirtyMask) { mask.needsUpdate = true; C.dirtyMask = false; }
    if (n && C.onChange) C.onChange(C);
    return n;
  };
  C.pending = () => ready.length + C.busy + queue.length;
  C.idle = () => C.pending() === 0;
  C.fetchIdle = () => C.busy === 0 && queue.length === 0;
  C.stop = () => { queue = []; ready.length = 0; C.enabled = false; }; // V13: world unloaded — no more fetches / uploads
  C.stats_ = () => ({ z: lv.z, N, win: [win.x, win.y], loaded: C.loaded, uploads: C.uploads, busy: C.busy, queued: queue.length, ready: ready.length, fails: C.fails, copy: C.useCopy });
  return C;
}

/* ============================================================================================ grading */
// stats → [gain rgb, offset rgb] mapping src onto ref. Mean matching only (a per-channel white balance / exposure
// gain): the levels are sampled at different scales, so their spreads are not comparable, their means are.
export function gradeFrom(src, ref) {
  if (!src || !ref || src[6] < 50 || ref[6] < 50) return null;
  const g = [], off = [];
  const ms = [0, 1, 2].map((i) => src[i] / src[6]), mr = [0, 1, 2].map((i) => ref[i] / ref[6]);
  // overall exposure + per-channel balance, each clamped (never a wild re-colouring)
  const ls = ms[0] * 0.2126 + ms[1] * 0.7152 + ms[2] * 0.0722, lr = mr[0] * 0.2126 + mr[1] * 0.7152 + mr[2] * 0.0722;
  const ex = clamp(lr / Math.max(1e-4, ls), 0.7, 1.45);
  for (let i = 0; i < 3; i++) { const bal = clamp((mr[i] / Math.max(1e-4, lr)) / Math.max(1e-4, ms[i] / Math.max(1e-4, ls)), 0.85, 1.18); g.push(ex * bal); off.push(0); }
  return [g, off];
}
export function statMean(st) { return st && st[6] ? [0, 1, 2].map((i) => +(st[i] / st[6]).toFixed(4)) : null; }

/* ============================================================================================ water mask */
export function waterMask(THREE, data, unpack, size, red) {
  try {
    if (typeof document === 'undefined') return null;
    const polys = (data.water || []).map((p) => unpack(p)).filter((p) => p.length >= 3);
    const rivers = ((data.rivers && data.rivers.list) || []).filter((r) => r[0]).map((r) => unpack(r, 1));
    if (!polys.length && !rivers.length) return null;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const P of polys.concat(rivers)) for (const [x, z] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    // keep the mask square-ish and inside a sane box around the tour
    x0 = Math.max(x0 - 50, -12000); z0 = Math.max(z0 - 50, -12000); x1 = Math.min(x1 + 50, 12000); z1 = Math.min(z1 + 50, 12000);
    if (!(x1 > x0 && z1 > z0)) return null;
    const S = size || 2048;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true });
    const kx = S / (x1 - x0), kz = S / (z1 - z0);
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineJoin = 'round'; g.lineCap = 'round';
    for (const P of polys) { g.beginPath(); P.forEach(([x, z], i) => (i ? g.lineTo((x - x0) * kx, (z - z0) * kz) : g.moveTo((x - x0) * kx, (z - z0) * kz))); g.closePath(); g.fill(); }
    g.lineWidth = Math.max(1.5, 22 * kx);
    for (const P of rivers) { g.beginPath(); P.forEach(([x, z], i) => (i ? g.lineTo((x - x0) * kx, (z - z0) * kz) : g.moveTo((x - x0) * kx, (z - z0) * kz))); g.stroke(); }
    const d = g.getImageData(0, 0, S, S).data;
    c.width = c.height = 1;
    let t, bytes;
    if (red && THREE.RedFormat != null) { // WebGL2: one byte per texel
      const out = new Uint8Array(S * S); for (let i = 0; i < S * S; i++) out[i] = d[i * 4];
      t = new THREE.DataTexture(out, S, S, THREE.RedFormat); bytes = 1;
    } else {
      const S2 = Math.min(S, 1024), k = S / S2, out = new Uint8Array(S2 * S2 * 4);
      for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) { const v = d[((y * k) * S + x * k) * 4], i = (y * S2 + x) * 4; out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = 255; }
      t = new THREE.DataTexture(out, S2, S2); bytes = 4;
    }
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.flipY = false; t.needsUpdate = true;
    return { tex: t, bytes, bounds: new THREE.Vector4(x0, z0, x1, z1) };
  } catch (e) { console.warn('[heli-area] water mask', e); return null; }
}

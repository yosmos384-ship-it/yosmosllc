// limo-tex.js — V10 LIMO: procedural textures for the limousine (quilted leather, burl wood, carpet, suede, plate),
// the passengers (faces, prints) and the drive scenery (road, ground, building atlas, casino sign).
// All textures ≤ 1024 px (most 256–512). No side effects on import; every function takes THREE.
import { rand, noiseField, canvasTexture, textureFromPixels, makeNormalFromHeight } from './mats.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hex = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const CACHE = new Map();
const memo = (key, fn) => { if (!CACHE.has(key)) CACHE.set(key, fn()); return CACHE.get(key); };
export function clearLimoTexCache() { CACHE.clear(); }

/* ------------------------------------------------------------------------------------------- leather */
// quilted (diamond) leather with stitched seams, or plain grained leather. → {map, normalMap, roughnessMap}
export function leather(THREE, { color = 0xe9dcc4, quilt = true, cells = 6, seed = 7, size = 512, stitch = 0xf6efe0 } = {}) {
  return memo(`leather:${color}:${quilt}:${cells}:${size}`, () => {
    const w = size, h = size, n = w * h, rnd = rand(seed);
    const grain = noiseField(w, h, rnd, 4, 48);
    const mott = noiseField(w, h, rnd, 3, 4);
    const hgt = new Float32Array(n), col = new Uint8ClampedArray(n * 4), rgh = new Uint8ClampedArray(n * 4);
    const [cr, cg, cb] = hex(color), [sr, sg, sb] = hex(stitch);
    const cell = w / cells;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let puff = 1, seam = 0, st = 0;
      if (quilt) {
        // diamond grid = two diagonal line families
        const u = (x + y) / cell, v = (x - y + h) / cell;
        const du = Math.abs(u - Math.round(u)), dv = Math.abs(v - Math.round(v));
        const d = Math.min(du, dv) * cell * 0.7071; // px to the nearest seam
        puff = Math.pow(smooth(0, cell * 0.36, d), 0.55);
        seam = 1 - smooth(0, 2.2, d);
        // two stitch rows 4 px each side of the seam, dashed
        const along = (du < dv ? (x - y) : (x + y)) * 0.7071;
        const dash = (along % 7 + 7) % 7 < 4.2 ? 1 : 0;
        st = dash * Math.max(1 - Math.abs(d - 4.2) / 1.1, 0);
      }
      const g = grain[i] * 0.12 + mott[i] * 0.05;
      hgt[i] = (quilt ? puff * 0.85 : 0.5) + g - st * 0.06;
      const shade = (quilt ? 0.72 + 0.28 * puff - seam * 0.3 : 0.94) * (0.93 + mott[i] * 0.1 + grain[i] * 0.06);
      let r = cr * shade, gg = cg * shade, b = cb * shade;
      if (st > 0.2) { const k = Math.min(1, st * 1.2); r = r * (1 - k) + sr * k; gg = gg * (1 - k) + sg * k; b = b * (1 - k) + sb * k; }
      col[i * 4] = r; col[i * 4 + 1] = gg; col[i * 4 + 2] = b; col[i * 4 + 3] = 255;
      const ro = 255 * (0.42 + grain[i] * 0.18 + seam * 0.2);
      rgh[i * 4] = rgh[i * 4 + 1] = rgh[i * 4 + 2] = ro; rgh[i * 4 + 3] = 255;
    }
    return {
      map: textureFromPixels(THREE, col, w, h, { srgb: true }),
      normalMap: makeNormalFromHeight(THREE, { data: hgt, width: w, height: h }, { strength: quilt ? 9 : 3 }),
      roughnessMap: textureFromPixels(THREE, rgh, w, h, { srgb: false }),
    };
  });
}

/* ------------------------------------------------------------------------------------------- burl wood */
export function burlWood(THREE, { size = 512, seed = 11 } = {}) {
  return memo('burl:' + size, () => {
    const w = size, h = size, n = w * h, rnd = rand(seed);
    const a = noiseField(w, h, rnd, 5, 5), b = noiseField(w, h, rnd, 4, 9), c = noiseField(w, h, rnd, 3, 22);
    const col = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const t = a[i] * 6 + b[i] * 3;
      const ring = 0.5 + 0.5 * Math.sin(t * 6.2832 * 1.6);
      const knot = Math.pow(c[i], 6) * 2.2;
      const k = 0.55 + ring * 0.35 - knot * 0.5 + b[i] * 0.15;
      col[i * 4] = 112 * k + 18; col[i * 4 + 1] = 58 * k + 10; col[i * 4 + 2] = 30 * k + 6; col[i * 4 + 3] = 255;
    }
    return textureFromPixels(THREE, col, w, h, { srgb: true });
  });
}

/* ------------------------------------------------------------------------------------------- noise surfaces */
function noiseTex(THREE, key, { size = 256, color, amp = 0.2, base = 32, seed = 3, repeat = 1 }) {
  return memo(key, () => {
    const w = size, h = size, n = w * h, rnd = rand(seed);
    const f = noiseField(w, h, rnd, 4, base), g = noiseField(w, h, rnd, 2, 4);
    const [r0, g0, b0] = hex(color), col = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const k = 1 - amp / 2 + f[i] * amp + (g[i] - 0.5) * amp * 0.5;
      col[i * 4] = r0 * k; col[i * 4 + 1] = g0 * k; col[i * 4 + 2] = b0 * k; col[i * 4 + 3] = 255;
    }
    return textureFromPixels(THREE, col, w, h, { srgb: true, repeat: [repeat, repeat] });
  });
}
export const carpet = (THREE) => noiseTex(THREE, 'carpet', { color: 0x1c1712, amp: 0.45, base: 96, seed: 5 });
export const suede = (THREE) => noiseTex(THREE, 'suede', { color: 0x15141a, amp: 0.25, base: 40, seed: 9 });
export const grass = (THREE) => noiseTex(THREE, 'grass', { color: 0x4f6b32, amp: 0.5, base: 48, seed: 13 });
export const concrete = (THREE) => noiseTex(THREE, 'concrete', { color: 0xa9a59c, amp: 0.22, base: 40, seed: 17 });

/* ------------------------------------------------------------------------------------------- licence plate */
export function plate(THREE, text = 'GRAND·1') {
  return memo('plate:' + text, () => canvasTexture(THREE, 256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f7f4ea'); gr.addColorStop(1, '#dcd6c4');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1d2a44'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#7a1424'; g.font = 'bold 18px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('EAKIN GRAND', w / 2, 30);
    g.fillStyle = '#18233a'; g.font = 'bold 54px Arial, sans-serif'; g.fillText(text, w / 2, 92);
    g.font = '13px Arial, sans-serif'; g.fillStyle = '#425070'; g.fillText('LIVERY · FICTIONAL', w / 2, 114);
  }, { wrap: false, anisotropy: 4 }));
}

/* ------------------------------------------------------------------------------------------- grille */
export function grille(THREE) {
  return memo('grille', () => canvasTexture(THREE, 256, 128, (g, w, h) => {
    g.fillStyle = '#0a0a0c'; g.fillRect(0, 0, w, h);
    for (let x = 6; x < w; x += 14) {
      const gr = g.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0, '#5d6066'); gr.addColorStop(0.5, '#f4f6f8'); gr.addColorStop(1, '#6a6d73');
      g.fillStyle = gr; g.fillRect(x, 4, 8, h - 8);
    }
    g.fillStyle = '#c9ccd2'; g.fillRect(0, 0, w, 5); g.fillRect(0, h - 5, w, 5);
  }, { wrap: false }));
}

/* ------------------------------------------------------------------------------------------- faces */
// face painted around u = 0.25 of a SphereGeometry (front = +z). opts: skin, eye, lip, brow
export function face(THREE, o = {}) {
  const key = 'face:' + JSON.stringify(o);
  return memo(key, () => canvasTexture(THREE, 512, 256, (g, w, h) => {
    const skin = o.skin || '#d9a98a';
    g.fillStyle = skin; g.fillRect(0, 0, w, h);
    const cx = w * 0.25, ey = h * 0.47, sx = w / 512; // 1 canvas px ≈ 0.6 mm on a 21 cm head circumference
    // soft cheek / jaw shading
    const sh = g.createRadialGradient(cx, h * 0.55, 10, cx, h * 0.55, 110 * sx);
    sh.addColorStop(0, 'rgba(255,220,200,0.18)'); sh.addColorStop(1, 'rgba(90,40,30,0.12)');
    g.fillStyle = sh; g.fillRect(cx - 130, 0, 260, h);
    // blush
    for (const s of [-1, 1]) {
      const bl = g.createRadialGradient(cx + s * 34, h * 0.585, 2, cx + s * 34, h * 0.585, 20);
      bl.addColorStop(0, o.blush || 'rgba(220,110,110,0.28)'); bl.addColorStop(1, 'rgba(220,110,110,0)');
      g.fillStyle = bl; g.beginPath(); g.arc(cx + s * 34, h * 0.585, 20, 0, 7); g.fill();
    }
    // features drawn ×1.4 wide / ×1.2 tall around the eye line (readable at seated distance)
    g.save(); g.translate(cx, ey); g.scale(1.4, 1.2); g.translate(-cx, -ey);
    // eyes
    for (const s of [-1, 1]) {
      const ex = cx + s * 21;
      g.save(); g.translate(ex, ey);
      // eye shadow
      const es = g.createRadialGradient(0, -3, 1, 0, -3, 16);
      es.addColorStop(0, o.shadow || 'rgba(120,80,90,0.35)'); es.addColorStop(1, 'rgba(120,80,90,0)');
      g.fillStyle = es; g.beginPath(); g.ellipse(0, -4, 16, 9, 0, 0, 7); g.fill();
      // white
      g.fillStyle = '#f4efea'; g.beginPath(); g.ellipse(0, 0, 10.5, 4.6, 0, 0, 7); g.fill();
      // iris + pupil + highlight
      g.fillStyle = o.eye || '#5a3a22'; g.beginPath(); g.arc(s * 0.6, 0.2, 4.3, 0, 7); g.fill();
      g.fillStyle = '#120a06'; g.beginPath(); g.arc(s * 0.6, 0.2, 2, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(s * 0.6 + 1.4, -1.2, 1.1, 0, 7); g.fill();
      // upper lash line (winged outward)
      g.strokeStyle = '#1b1210'; g.lineWidth = 2.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-s * 11, 0.5); g.quadraticCurveTo(0, -7.2, s * 12, -1.5); g.lineTo(s * 14.5, -3.5); g.stroke();
      g.lineWidth = 0.8; g.strokeStyle = 'rgba(60,30,25,0.6)'; g.beginPath(); g.moveTo(-s * 9, 2.4); g.quadraticCurveTo(0, 5.6, s * 10, 2.2); g.stroke();
      // brow
      g.strokeStyle = o.brow || '#3a2418'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(-s * 10, -11); g.quadraticCurveTo(s * 2, -16.5, s * 14, -12); g.stroke();
      g.restore();
    }
    // nose (shading only)
    g.strokeStyle = 'rgba(120,70,55,0.35)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(cx - 3, ey + 4); g.quadraticCurveTo(cx - 6, ey + 22, cx - 5, ey + 27); g.stroke();
    g.fillStyle = 'rgba(110,60,50,0.35)';
    g.beginPath(); g.ellipse(cx - 4, ey + 29, 2.4, 1.3, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(cx + 4, ey + 29, 2.4, 1.3, 0, 0, 7); g.fill();
    // lips
    const ly = ey + 43;
    g.fillStyle = o.lip || '#b4475a';
    g.beginPath(); g.moveTo(cx - 13, ly); g.quadraticCurveTo(cx - 6, ly - 6, cx, ly - 3); g.quadraticCurveTo(cx + 6, ly - 6, cx + 13, ly);
    g.quadraticCurveTo(cx, ly + 1.5, cx - 13, ly); g.fill();
    g.beginPath(); g.moveTo(cx - 12, ly + 0.5); g.quadraticCurveTo(cx, ly + 10, cx + 12, ly + 0.5); g.quadraticCurveTo(cx, ly + 2.5, cx - 12, ly + 0.5); g.fill();
    g.strokeStyle = 'rgba(70,20,30,0.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - 12, ly + 0.5); g.quadraticCurveTo(cx, ly + 2.4, cx + 12, ly + 0.5); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(cx + 1, ly + 4.5, 4, 1.2, 0, 0, 7); g.fill();
    g.restore();
  }, { wrap: false, anisotropy: 4 }));
}

/* ------------------------------------------------------------------------------------------- fabric prints */
export function printFabric(THREE, { base = '#f3ece0', ink = '#c98a6a', ink2 = '#7aa58e', seed = 21, kind = 'leaf' } = {}) {
  return memo(`print:${base}:${ink}:${kind}`, () => canvasTexture(THREE, 256, 256, (g, w, h) => {
    const r = rand(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const x = r() * w, y = r() * h, s = 6 + r() * 14, a = r() * 6.28;
      g.save(); g.translate(x, y); g.rotate(a); g.globalAlpha = 0.75;
      g.fillStyle = r() < 0.5 ? ink : ink2;
      if (kind === 'leaf') { g.beginPath(); g.ellipse(0, 0, s, s * 0.38, 0, 0, 7); g.fill(); g.strokeStyle = base; g.lineWidth = 1; g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.stroke(); }
      else { for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(Math.cos(k * 1.2566) * s * 0.45, Math.sin(k * 1.2566) * s * 0.45, s * 0.36, s * 0.2, k * 1.2566, 0, 7); g.fill(); } }
      g.restore();
      // tile wrap copies
      for (const [dx, dy] of [[w, 0], [-w, 0], [0, h], [0, -h]]) if ((x + dx >= -20 && x + dx <= w + 20) && (y + dy >= -20 && y + dy <= h + 20)) {
        g.save(); g.translate(x + dx, y + dy); g.rotate(a); g.globalAlpha = 0.75; g.fillStyle = ink; g.beginPath(); g.ellipse(0, 0, s, s * 0.38, 0, 0, 7); g.fill(); g.restore();
      }
    }
    g.globalAlpha = 1;
  }, { repeat: [3, 3], anisotropy: 4 }));
}

/* ------------------------------------------------------------------------------------------- roads */
// texture across the road width (u: left → right edge), v along 8 m. lanes = list of {type, at} in fractions.
export function roadTex(THREE, kind) {
  return memo('road:' + kind, () => {
    const W = 256, H = 256, rnd = rand(kind.length * 31 + 7);
    const f = noiseField(W, H, rnd, 4, 32), f2 = noiseField(W, H, rnd, 2, 6);
    const tex = canvasTexture(THREE, W, H, (g) => {
      const img = g.createImageData(W, H);
      for (let i = 0; i < W * H; i++) {
        const k = 0.78 + f[i] * 0.3 + (f2[i] - 0.5) * 0.12, base = kind === 'road6' ? 72 : 60;
        img.data[i * 4] = base * k; img.data[i * 4 + 1] = base * k; img.data[i * 4 + 2] = (base + 4) * k; img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const line = (u, col, dash, wpx = 3) => {
        g.fillStyle = col;
        if (!dash) g.fillRect(u * W - wpx / 2, 0, wpx, H);
        else for (let y = 0; y < H; y += 128) g.fillRect(u * W - wpx / 2, y, wpx, 48);
      };
      const W1 = 'rgba(236,236,228,0.9)', Y1 = 'rgba(232,186,60,0.95)';
      if (kind === 'road2') { line(0.03, W1, false); line(0.97, W1, false); line(0.493, Y1, false, 2); line(0.507, Y1, false, 2); }
      else if (kind === 'road4') { // 2 + turn lane + 2 (17.5 m): edges, dashed lane lines, yellow turn lane edges
        line(0.02, W1, false); line(0.98, W1, false); line(0.2, W1, true); line(0.8, W1, true);
        line(0.4, Y1, false, 2); line(0.415, Y1, true, 2); line(0.6, Y1, false, 2); line(0.585, Y1, true, 2);
      } else if (kind === 'road6') { // 3 + 3 lanes, median barrier sits on top
        line(0.02, W1, false); line(0.98, W1, false); line(0.17, W1, true); line(0.33, W1, true); line(0.67, W1, true); line(0.83, W1, true);
        line(0.47, Y1, false, 3); line(0.53, Y1, false, 3);
      }
    }, { repeat: [1, 1], anisotropy: 8 });
    return tex;
  });
}

/* ------------------------------------------------------------------------------------------- building atlas */
// 4×4 cells of 256 px in a 1024² atlas + matching emissive atlas (lit windows / signs at night)
export const ATLAS = {
  houseBeige: 0, houseBlue: 1, houseBrick: 2, houseWhite: 3,
  shopA: 4, shopB: 5, gasStore: 6, office: 7,
  roofShingle: 8, roofFlat: 9, neonA: 10, hotel: 11,
  wallConcrete: 12, soundWall: 13, signGreen: 14, neonB: 15,
};
export function atlasRect(id) { const c = id % 4, r = Math.floor(id / 4); return [c / 4, 1 - (r + 1) / 4, (c + 1) / 4, 1 - r / 4]; } // u0,v0,u1,v1
export function buildingAtlas(THREE) {
  return memo('atlas', () => {
    const S = 256;
    const drawCell = (g, id, emis) => {
      const c = id % 4, r = Math.floor(id / 4), x0 = c * S, y0 = r * S;
      g.save(); g.translate(x0, y0); g.beginPath(); g.rect(0, 0, S, S); g.clip();
      const rr = rand(id * 97 + 3);
      const win = (x, y, w, h, litP = 0.6, warm = true) => {
        if (emis) { g.fillStyle = rr() < litP ? (warm ? '#ffcf8a' : '#cfe6ff') : '#000'; g.fillRect(x + 2, y + 2, w - 4, h - 4); return; }
        g.fillStyle = '#f4f2ee'; g.fillRect(x, y, w, h);
        const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#2c3a48'); gr.addColorStop(1, '#10161e');
        g.fillStyle = gr; g.fillRect(x + 2, y + 2, w - 4, h - 4);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 2, y + 2, (w - 4) * 0.4, h - 4);
      };
      const siding = (col, line) => { g.fillStyle = col; g.fillRect(0, 0, S, S); g.strokeStyle = line; g.lineWidth = 1; for (let y = 0; y < S; y += 8) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(S, y + 0.5); g.stroke(); } };
      if (emis) { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); }
      switch (id) {
        case 0: case 1: case 3: {
          if (!emis) siding(id === 0 ? '#d8c9a8' : id === 1 ? '#8fa2b4' : '#ece9e1', 'rgba(0,0,0,0.12)');
          win(28, 92, 50, 70, 0.7); win(178, 92, 50, 70, 0.7);
          if (!emis) { g.fillStyle = id === 1 ? '#f1efe9' : '#4b2f22'; g.fillRect(108, 108, 40, 148); g.fillStyle = '#c8a24a'; g.fillRect(140, 180, 4, 4); }
          else { g.fillStyle = '#ffd9a0'; g.fillRect(122, 96, 12, 10); }
          break;
        }
        case 2: {
          if (!emis) {
            g.fillStyle = '#8c4a36'; g.fillRect(0, 0, S, S);
            for (let y = 0; y < S; y += 10) for (let x = (y / 10) % 2 ? -12 : 0; x < S; x += 24) { g.fillStyle = `rgb(${120 + rr() * 40},${60 + rr() * 22},${44 + rr() * 16})`; g.fillRect(x + 1, y + 1, 22, 8); }
          }
          win(30, 90, 56, 74, 0.6); win(170, 90, 56, 74, 0.6);
          break;
        }
        case 4: case 5: case 6: {
          const names = { 4: ['DONUTS', 'PHARMACY'], 5: ['PIZZA', 'LAUNDRY'], 6: ['MARKET', '24 H'] }[id];
          if (!emis) { g.fillStyle = id === 6 ? '#e3ded2' : '#cdbf9e'; g.fillRect(0, 0, S, S); g.fillStyle = id === 5 ? '#2e5a7a' : '#7a2e2e'; g.fillRect(0, 40, S, 44); }
          g.font = 'bold 26px Arial, sans-serif'; g.textAlign = 'center'; g.fillStyle = emis ? (id === 5 ? '#7fd0ff' : '#ff9a7a') : '#fff4dc';
          g.fillText(names[0], 64, 72); g.fillText(names[1], 192, 72);
          for (let k = 0; k < 2; k++) {
            const x = k * 128 + 10;
            if (emis) { g.fillStyle = '#ffe2b0'; g.fillRect(x + 4, 110, 104, 120); }
            else {
              const gr = g.createLinearGradient(0, 106, 0, 236); gr.addColorStop(0, '#41505c'); gr.addColorStop(1, '#1a2026');
              g.fillStyle = gr; g.fillRect(x, 106, 108, 130); g.fillStyle = '#9aa3aa'; g.fillRect(x + 52, 106, 4, 130); g.fillRect(x, 102, 108, 4);
            }
          }
          break;
        }
        case 7: case 11: {
          if (!emis) { g.fillStyle = id === 7 ? '#9aa6b0' : '#c7b89a'; g.fillRect(0, 0, S, S); }
          for (let y = 8; y < S; y += 32) for (let x = 8; x < S; x += 32) win(x, y, 24, 22, id === 11 ? 0.55 : 0.4, id === 11);
          break;
        }
        case 8: { if (!emis) { g.fillStyle = '#3b3633'; g.fillRect(0, 0, S, S); for (let y = 0; y < S; y += 12) for (let x = (y / 12) % 2 ? -10 : 0; x < S; x += 20) { g.fillStyle = `rgb(${50 + rr() * 22},${46 + rr() * 18},${44 + rr() * 16})`; g.fillRect(x, y, 19, 11); } } break; }
        case 9: case 12: { if (!emis) { g.fillStyle = id === 9 ? '#6d6e70' : '#b8b4aa'; g.fillRect(0, 0, S, S); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${rr() * 0.08})`; g.fillRect(rr() * S, rr() * S, 3, 3); } } break; }
        case 13: { if (!emis) { g.fillStyle = '#a7a196'; g.fillRect(0, 0, S, S); g.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < S; x += 32) g.fillRect(x, 0, 3, S); for (let y = 0; y < S; y += 64) g.fillRect(0, y, S, 2); } break; }
        case 14: {
          if (!emis) { g.fillStyle = '#1f6b3d'; g.fillRect(0, 0, S, S); g.strokeStyle = '#f2f2f2'; g.lineWidth = 5; g.strokeRect(8, 8, S - 16, S - 16); }
          g.fillStyle = emis ? '#4a5a4e' : '#ffffff'; g.textAlign = 'center';
          g.font = 'bold 30px Arial, sans-serif'; g.fillText('Casino District', S / 2, 96); g.font = 'bold 26px Arial, sans-serif'; g.fillText('Georgesville Rd', S / 2, 140);
          g.font = 'bold 40px Arial, sans-serif'; g.fillText('EXIT 7  ↗', S / 2, 200);
          break;
        }
        case 10: case 15: {
          if (!emis) { g.fillStyle = '#1b1a24'; g.fillRect(0, 0, S, S); }
          const cols = id === 10 ? ['#ff3d8b', '#ffd34a', '#3de7ff'] : ['#a34dff', '#ffb347', '#4dffb8'];
          for (let k = 0; k < 3; k++) { g.fillStyle = emis ? cols[k] : '#333'; g.fillRect(20 + k * 80, 20, 56, 8); g.fillRect(20 + k * 80, 228, 56, 8); }
          g.font = 'bold 34px Arial, sans-serif'; g.textAlign = 'center'; g.fillStyle = emis ? cols[1] : '#555';
          g.fillText(id === 10 ? 'STEAKHOUSE' : 'LOUNGE', S / 2, 90);
          for (let y = 120; y < 220; y += 30) for (let x = 14; x < S; x += 40) win(x, y, 30, 22, 0.75, true);
          break;
        }
        default: break;
      }
      g.restore();
    };
    const map = canvasTexture(THREE, 1024, 1024, (g) => { for (let i = 0; i < 16; i++) drawCell(g, i, false); }, { wrap: false, anisotropy: 4 });
    const emissiveMap = canvasTexture(THREE, 1024, 1024, (g) => { for (let i = 0; i < 16; i++) drawCell(g, i, true); }, { wrap: false, anisotropy: 4 });
    return { map, emissiveMap };
  });
}

/* ------------------------------------------------------------------------------------------- casino sign */
export function casinoSign(THREE) {
  return memo('casinoSign', () => canvasTexture(THREE, 1024, 256, (g, w, h) => {
    g.fillStyle = '#07060a'; g.fillRect(0, 0, w, h);
    // marquee bulbs
    for (let x = 14; x < w; x += 22) for (const y of [12, h - 12]) { const r = g.createRadialGradient(x, y, 0, x, y, 7); r.addColorStop(0, '#fff8e0'); r.addColorStop(1, 'rgba(255,200,90,0)'); g.fillStyle = r; g.fillRect(x - 8, y - 8, 16, 16); }
    // art-deco fans
    g.strokeStyle = '#d9a94a'; g.lineWidth = 3;
    for (const cx of [90, w - 90]) for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(cx, h - 40); g.lineTo(cx + Math.cos(Math.PI + k * Math.PI / 6) * 60, h - 40 + Math.sin(Math.PI + k * Math.PI / 6) * 60); g.stroke(); }
    g.textAlign = 'center';
    g.shadowColor = '#ffcf6a'; g.shadowBlur = 22;
    const gr = g.createLinearGradient(0, 40, 0, 170); gr.addColorStop(0, '#fff3c4'); gr.addColorStop(0.5, '#ffc95a'); gr.addColorStop(1, '#c98a1e');
    g.fillStyle = gr; g.font = 'bold 112px Georgia, "Times New Roman", serif'; g.fillText('EAKIN GRAND', w / 2, 150);
    g.shadowColor = '#ff4a7a'; g.shadowBlur = 16; g.fillStyle = '#ffd8e4'; g.font = 'bold 50px Georgia, serif'; g.fillText('★  C A S I N O  ★', w / 2, 222);
    g.shadowBlur = 0;
  }, { wrap: false, anisotropy: 8 }));
}

/* ------------------------------------------------------------------------------------------- casino facade fins */
export function decoPanel(THREE) {
  return memo('deco', () => canvasTexture(THREE, 256, 512, (g, w, h) => {
    g.fillStyle = '#16131c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9963c'; g.lineWidth = 4;
    for (let x = 16; x < w; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 40; y < h; y += 96) { g.beginPath(); g.moveTo(0, y); g.lineTo(w / 2, y - 30); g.lineTo(w, y); g.stroke(); }
    for (let y = 70; y < h; y += 96) for (let x = 40; x < w; x += 48) { g.fillStyle = (x + y) % 3 ? '#e8b878' : '#5a4630'; g.fillRect(x - 7, y, 14, 24); }
  }, { wrap: true, anisotropy: 4 }));
}

/* ------------------------------------------------------------------------------------------- parked car: the lit cabin */
// 512×256: left half = the open rear doorway (the far bench in cream quilted leather, LED strips, starry headliner,
// carpet, chrome sill), right half = the inside face of the open door (cream leather, chrome strip, violet LED).
export function cabinDoorway(THREE) {
  return memo('cabinDoorway', () => canvasTexture(THREE, 512, 256, (g, w, h) => {
    const H = h, L = 256;
    // ---- doorway (u 0 … 0.5): v 0 = sill (y 0.34 m), v 1 = roof edge (y 1.37 m)
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0b0910'); bg.addColorStop(0.45, '#1c1420'); bg.addColorStop(1, '#120c10');
    g.fillStyle = bg; g.fillRect(0, 0, L, H);
    const r = rand(77);
    for (let i = 0; i < 60; i++) { const a = 0.4 + r() * 0.6; g.fillStyle = `rgba(255,246,226,${a})`; g.fillRect(r() * L, 4 + r() * 40, 1.5, 1.5); } // fibre-optic stars
    const led = (y, a) => { const gr = g.createLinearGradient(0, y - 8, 0, y + 8); gr.addColorStop(0, 'rgba(154,92,255,0)'); gr.addColorStop(0.5, `rgba(186,130,255,${a})`); gr.addColorStop(1, 'rgba(154,92,255,0)'); g.fillStyle = gr; g.fillRect(0, y - 8, L, 16); g.fillStyle = 'rgba(235,215,255,0.95)'; g.fillRect(0, y - 1, L, 2); };
    led(52, 0.9);
    // far bench back + seat (cream quilted), piping
    const seatTop = 92, seatY = 168, seatB = 196;
    const lg = g.createLinearGradient(0, seatTop, 0, seatY); lg.addColorStop(0, '#d9c9ad'); lg.addColorStop(1, '#a8957a');
    g.fillStyle = lg; g.fillRect(0, seatTop, L, seatY - seatTop);
    g.strokeStyle = 'rgba(90,70,50,0.45)'; g.lineWidth = 1;
    for (let x = -80; x < L + 80; x += 22) { g.beginPath(); g.moveTo(x, seatTop); g.lineTo(x + (seatY - seatTop), seatY); g.stroke(); g.beginPath(); g.moveTo(x + (seatY - seatTop), seatTop); g.lineTo(x, seatY); g.stroke(); }
    const sg = g.createLinearGradient(0, seatY, 0, seatB); sg.addColorStop(0, '#efe3cc'); sg.addColorStop(1, '#9c8a70');
    g.fillStyle = sg; g.fillRect(0, seatY, L, seatB - seatY);
    g.fillStyle = '#2a1f18'; g.fillRect(0, seatY - 2, L, 3); g.fillRect(0, seatB, L, 3);
    // a lit bar glass + bottle silhouette at the far end, warm downlight pools
    for (const x of [60, 190]) { const p = g.createRadialGradient(x, seatTop - 6, 2, x, seatTop + 20, 60); p.addColorStop(0, 'rgba(255,214,160,0.45)'); p.addColorStop(1, 'rgba(255,214,160,0)'); g.fillStyle = p; g.fillRect(x - 70, seatTop - 30, 140, 110); }
    // carpet + floor LED
    g.fillStyle = '#1a1416'; g.fillRect(0, seatB + 3, L, H - seatB - 3);
    led(seatB + 14, 0.55);
    // chrome sill + black rubber seal around the opening
    const ch = g.createLinearGradient(0, H - 14, 0, H); ch.addColorStop(0, '#f4f5f7'); ch.addColorStop(0.5, '#8a8d92'); ch.addColorStop(1, '#e8eaee');
    g.fillStyle = ch; g.fillRect(0, H - 12, L, 12);
    g.fillStyle = '#050506'; g.fillRect(0, 0, L, 5); g.fillRect(0, 0, 5, H); g.fillRect(L - 5, 0, 5, H);
    // ---- inner door face (u 0.5 … 1): v 0 = bottom of the door, v 1 = top of the window frame
    const x0 = L;
    g.fillStyle = '#0d0d0f'; g.fillRect(x0, 0, L, H);
    const dg = g.createLinearGradient(0, 96, 0, 236); dg.addColorStop(0, '#e8dcc4'); dg.addColorStop(1, '#b9a68a');
    g.fillStyle = dg; g.fillRect(x0 + 6, 104, L - 12, 128);
    g.strokeStyle = 'rgba(90,70,50,0.35)';
    for (let x = x0 - 120; x < x0 + L; x += 24) { g.beginPath(); g.moveTo(x, 104); g.lineTo(x + 128, 232); g.stroke(); g.beginPath(); g.moveTo(x + 128, 104); g.lineTo(x, 232); g.stroke(); }
    g.fillStyle = '#d7d9dd'; g.fillRect(x0 + 6, 96, L - 12, 6);          // chrome strip
    g.fillStyle = 'rgba(200,160,255,0.95)'; g.fillRect(x0 + 6, 236, L - 12, 3); // LED courtesy line
    g.fillStyle = '#1b1414'; g.fillRect(x0 + 6, 20, L - 12, 70);          // window frame inner (black leather)
    g.fillStyle = '#c9a25a'; g.fillRect(x0 + L * 0.62, 150, 46, 8);        // gold pull handle
  }, { wrap: false, anisotropy: 4 }));
}
// 512×64 emissive strip seen through the tinted side glass of the parked car: violet LED line, starry headliner,
// cream seat-back tops, a warm downlight or two. v 0 = window sill (0.98 m), v 1 = window top (1.39 m).
export function cabinGlow(THREE) {
  return memo('cabinGlow', () => canvasTexture(THREE, 512, 64, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const r = rand(91);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,240,220,${0.3 + r() * 0.5})`; g.fillRect(r() * w, 2 + r() * 14, 1, 1); }
    const gr = g.createLinearGradient(0, 14, 0, 26); gr.addColorStop(0, 'rgba(140,80,255,0)'); gr.addColorStop(0.5, 'rgba(150,90,255,0.9)'); gr.addColorStop(1, 'rgba(140,80,255,0)');
    g.fillStyle = gr; g.fillRect(0, 14, w, 12);
    for (const x of [90, 250, 410]) { const p = g.createRadialGradient(x, 26, 1, x, 40, 40); p.addColorStop(0, 'rgba(255,205,150,0.5)'); p.addColorStop(1, 'rgba(255,205,150,0)'); g.fillStyle = p; g.fillRect(x - 50, 20, 100, 44); }
    const sg = g.createLinearGradient(0, 44, 0, h); sg.addColorStop(0, 'rgba(120,104,84,0.55)'); sg.addColorStop(1, 'rgba(60,50,40,0.3)');
    g.fillStyle = sg; for (let x = 0; x < w; x += 64) { g.beginPath(); g.ellipse(x + 32, h, 30, 18, 0, Math.PI, 0); g.fill(); }
  }, { wrap: false, anisotropy: 4 }));
}

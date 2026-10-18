// heli-tex.js — V13 HELI: procedural canvas textures for the helicopter (livery, cabin lining, leather, carpet, wood,
// cockpit panel atlas, rotor blur discs, glass tint, exhaust haze, helipad). All original artwork: the livery is a
// deep-navy / champagne-gold executive scheme with a fictional "Eakin Air" tail script and a fictional-format
// registration ("EKN-3351") — no real operator, manufacturer, registration or TV-show design.
// No side effects on import; every function returns a THREE.CanvasTexture (sRGB unless data) or null without a DOM.

const TAU = Math.PI * 2;
function cv(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; try { c.getContext('2d', { willReadFrequently: true }); } catch (_) {} return c; } // CPU-backed: fast pixel loops
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function tex(THREE, c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = o.aniso || 4;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
  t.needsUpdate = true;
  return t;
}
function noise(g, W, H, amp, seed, chroma = [1, 1, 1]) {
  const r = rng(seed), id = g.getImageData(0, 0, W, H), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amp; d[i] += n * chroma[0]; d[i + 1] += n * chroma[1]; d[i + 2] += n * chroma[2]; }
  g.putImageData(id, 0, 0);
}
function rrect(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }

/* ---------------------------------------------------------------------------- livery (fuselage loft UV space) */
// Loft UV: u = 0 … LOFT_U along the fuselage (nose → boom joint), v = VA(angle) (seam on the belly). The boom uses
// u ∈ [BOOM_U0, 1] with the same angle convention; fin / stabiliser / cowling sample the plain navy point PLAIN.
export const LIVERY = { LOFT_U: 0.84, BOOM_U0: 0.86, PLAIN: [0.85, 0.62] };
// angle (rad; 0 = right side mid, π/2 = top, π = left, −π/2 = belly = texture seam) → v
export const VA = (a) => (a + Math.PI / 2) / TAU;
export const NAVY = '#15295a', GOLD = '#dcb466', GOLD_HI = '#f8e4a8', PEARL = '#e9e6de';
export const REG = 'EKN-3351'; // fictional-format registration (no national prefix)
// stripe centre angle (rad, right side) at loft position u01 ∈ [0, 1] (nose → tail): rises gently toward the tail
export const stripeAngle = (u01) => -0.30 + 0.34 * Math.pow(u01, 1.3);

export function liveryTexture(THREE, o = {}) {
  const W = o.w || 1024, H = o.h || 512;
  const c = cv(W, H); if (!c) return null;
  const g = c.getContext('2d');
  // base: metallic navy (lighter than before so it reads from the air) with a brighter crown; blue-biased flake
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#122452'); gr.addColorStop(0.25, '#182d64'); gr.addColorStop(0.5, '#132655'); gr.addColorStop(0.75, '#182d64'); gr.addColorStop(1, '#122452');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  noise(g, W, H, 10, 1351, [1, 1, 1.35]);
  const X = (u) => u * W, Y = (v) => (1 - (((v % 1) + 1) % 1)) * H; // v → canvas y (flipY)
  const LU = LIVERY.LOFT_U;
  const zU = o.zToU || ((z) => (z + 4.3) / 6.7 * LU);
  // two-tone: pearl-white lower fuselage + lower tail boom under the gold stripe (belly seam = canvas top / bottom rows)
  {
    const pg = g.createLinearGradient(0, 0, 0, H); pg.addColorStop(0, '#d9d6cf'); pg.addColorStop(0.18, PEARL); pg.addColorStop(0.82, PEARL); pg.addColorStop(1, '#d9d6cf');
    g.fillStyle = pg;
    const col = (x0, x1, aEdge) => { const yR = Y(VA(aEdge)), yL = Y(VA(Math.PI - aEdge)); g.fillRect(x0, yR, x1 - x0, H - yR); g.fillRect(x0, 0, x1 - x0, yL); };
    for (let px = 0; px < W; px += 2) {
      const u = (px + 1) / W;
      if (u <= LU) col(px, px + 2, stripeAngle(u / LU) - 0.03);
      else if (u >= LIVERY.BOOM_U0) col(px, px + 2, -0.04);
    }
    noise(g, W, H, 4, 77);
  }
  // gold side stripes (both sides) along the loft + the boom
  function stripe(u0, u1, angOf, width, color, mirror) {
    g.fillStyle = color;
    const n = 160;
    g.beginPath();
    for (let k = 0; k <= n; k++) { const u = u0 + (u1 - u0) * k / n; let a = angOf(u) + width / 2; if (mirror) a = Math.PI - a; const y = Y(VA(a)); k ? g.lineTo(X(u), y) : g.moveTo(X(u), y); }
    for (let k = n; k >= 0; k--) { const u = u0 + (u1 - u0) * k / n; let a = angOf(u) - width / 2; if (mirror) a = Math.PI - a; g.lineTo(X(u), Y(VA(a))); }
    g.closePath(); g.fill();
  }
  for (const m of [false, true]) {
    stripe(0.04, LU, (u) => stripeAngle(u / LU), 0.075, GOLD, m);
    stripe(0.10, LU, (u) => stripeAngle(u / LU) + 0.075, 0.016, GOLD_HI, m);
    stripe(0.18, LU, (u) => stripeAngle(u / LU) - 0.068, 0.010, GOLD, m);
    stripe(LIVERY.BOOM_U0, 1.0, () => 0.0, 0.10, GOLD, m);
    stripe(LIVERY.BOOM_U0, 1.0, () => 0.09, 0.022, GOLD_HI, m);
  }
  // window seals (black rubber trim around each glazed area) from heli-model's mask
  if (o.trim) { g.imageSmoothingEnabled = true; g.drawImage(o.trim, 0, 0, W, H); }
  // panel lines (door outlines, access panels) — in (z, angle) space
  const rect = (z0, z1, a0, a1, rr = 6, lw = 1.6) => {
    for (const mm of [false, true]) {
      const A0 = mm ? Math.PI - a1 : a0, A1 = mm ? Math.PI - a0 : a1;
      const x0 = X(zU(z0)), x1 = X(zU(z1)), y0 = Y(VA(A1)), y1 = Y(VA(A0));
      g.lineWidth = lw; g.strokeStyle = 'rgba(0,0,0,0.6)'; rrect(g, x0, y0, x1 - x0, y1 - y0, rr); g.stroke();
      g.save(); g.strokeStyle = 'rgba(170,200,255,0.12)'; g.translate(0, 1.5); rrect(g, x0, y0, x1 - x0, y1 - y0, rr); g.stroke(); g.restore();
    }
  };
  rect(-2.50, -1.38, -0.62, 1.05, 10);   // crew doors
  rect(-1.33, 0.55, -0.66, 1.02, 10);    // cabin sliding doors
  rect(0.70, 1.55, -0.30, 0.55, 4);      // baggage door (aft fuselage)
  rect(-4.05, -3.55, -1.15, -0.85, 4);   // nose avionics hatch
  rect(-3.0, -2.6, -1.55, -1.25, 3);     // ground power hatch
  rect(-0.95, -0.15, 1.30, 1.50, 3, 1.2);  // roof fairing access
  rect(1.75, 2.35, -1.0, -0.6, 3, 1.2);    // aft avionics bay
  // vertical seam lines at the frames
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.4;
  for (const z of [-2.55, 0.62, 1.7]) { g.beginPath(); g.moveTo(X(zU(z)), 0); g.lineTo(X(zU(z)), H); g.stroke(); }
  // rivet rows along frames (very fine)
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (const z of [-2.55, 0.62, 1.7]) for (let y = 4; y < H; y += 9) g.fillRect(X(zU(z)) + 3, y, 1.2, 1.2);
  // sliding-door rails (dark slots above / below the cabin windows, running aft over the baggage bay)
  for (const mm of [false, true]) for (const a of [1.10, -0.70]) {
    const A = mm ? Math.PI - a : a;
    g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(X(zU(-0.6)), Y(VA(A)) - 2, X(zU(1.62)) - X(zU(-0.6)), 4);
    g.fillStyle = 'rgba(170,190,230,0.22)'; g.fillRect(X(zU(-0.6)), Y(VA(A)) + 2, X(zU(1.62)) - X(zU(-0.6)), 1);
  }
  // door handles: flush chrome paddles with a dark recess
  for (const [z, a] of [[-1.62, 0.20], [0.30, 0.18], [1.40, 0.05]]) for (const mm of [false, true]) {
    const A = mm ? Math.PI - a : a, x = X(zU(z)), y = Y(VA(A));
    g.fillStyle = 'rgba(0,0,0,0.8)'; rrect(g, x - 9, y - 4, 18, 8, 3); g.fill();
    g.fillStyle = 'rgba(225,230,240,0.95)'; rrect(g, x - 7, y - 2, 14, 4, 2); g.fill();
  }
  // "NO STEP" / "DANGER ROTOR" style placards are omitted (illegible at this scale); fictional registration both sides
  drawReg(g, W, H, X, Y, zU, LU);
  return tex(THREE, c, { aniso: 8 });
}
// registration along the lower aft fuselage (z ≈ 0.72 … 2.15, angle ≈ −0.55): mirrored on the right side so it reads
// tail → nose (viewer's left → right), flipped vertically on the left side (angle runs downward there)
function drawReg(g, W, H, X, Y, zU) {
  const z0 = 0.66, z1 = 1.62, aC = -0.42, aH = 0.24; // angular height of the letters
  const xa = X(zU(z0)), xb = X(zU(z1)), wpx = xb - xa;
  for (const left of [false, true]) {
    const A = left ? Math.PI - aC : aC, yc = Y(VA(A));
    const hpx = Math.abs(Y(VA(aC + aH / 2)) - Y(VA(aC - aH / 2)));
    g.save(); g.translate((xa + xb) / 2, yc);
    g.scale(left ? 1 : -1, left ? -1 : 1);
    g.font = `700 ${Math.round(hpx)}px Arial, Helvetica, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = g.measureText(REG).width || 1;
    g.scale(Math.min(1.2, wpx / tw), 1);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(REG, 1.5, 1.5);
    g.fillStyle = '#e9dcb8'; g.fillText(REG, 0, 0);
    g.restore();
  }
}

// small "Eakin Air" decal for the fin (transparent background)
export function finDecal(THREE) {
  const c = cv(512, 256); if (!c) return null;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 256);
  g.fillStyle = GOLD; g.font = 'italic 700 64px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('Eakin Air', 256, 104);
  g.fillStyle = GOLD_HI; g.fillRect(96, 150, 320, 5);
  g.font = '600 30px Arial, sans-serif'; g.fillStyle = '#d9c9a0'; g.fillText('EXECUTIVE  ·  COLUMBUS', 256, 190);
  return tex(THREE, c);
}

/* ---------------------------------------------------------------------------- cabin lining (loft UV space) */
// o.region(z) → 'cockpit' | 'cabin'; o.zToU; o.trim (window-reveal mask canvas from heli-model)
export function liningTexture(THREE, o = {}) {
  const W = o.w || 1024, H = o.h || 512;
  const c = cv(W, H); if (!c) return null;
  const g = c.getContext('2d');
  const LU = LIVERY.LOFT_U, zU = o.zToU || ((z) => (z + 4.3) / 6.7 * LU);
  const X = (u) => u * W, Y = (v) => (1 - (((v % 1) + 1) % 1)) * H;
  // cabin: warm cream leather-look panels; cockpit (forward of the frame at z = −2.55): soft anthracite
  g.fillStyle = '#e6dccb'; g.fillRect(0, 0, W, H);
  const xc = X(zU(-2.58));
  const cg = g.createLinearGradient(xc - 14, 0, xc + 6, 0); cg.addColorStop(0, '#2c2e33'); cg.addColorStop(1, '#2c2e33');
  g.fillStyle = '#2c2e33'; g.fillRect(0, 0, xc, H);
  // headliner band (top) slightly lighter in the cabin; dado (lower side wall) a touch darker
  for (const m of [false, true]) {
    const band = (a0, a1, col) => { const A0 = m ? Math.PI - a1 : a0, A1 = m ? Math.PI - a0 : a1; g.fillStyle = col; g.fillRect(xc, Y(VA(A1)), W - xc, Y(VA(A0)) - Y(VA(A1))); };
    band(1.12, 1.5708, 'rgba(255,252,246,0.35)');
    band(-0.95, -0.25, 'rgba(120,96,70,0.13)');
  }
  noise(g, W, H, 7, 77);
  // panel seams (cabin): door outlines + horizontal joints, soft
  g.strokeStyle = 'rgba(70,56,40,0.35)'; g.lineWidth = 1.3;
  for (const m of [false, true]) {
    const line = (z0, z1, a) => { const A = m ? Math.PI - a : a; g.beginPath(); g.moveTo(X(zU(z0)), Y(VA(A))); g.lineTo(X(zU(z1)), Y(VA(A))); g.stroke(); };
    line(-2.55, 0.66, 1.12); line(-2.55, 0.66, -0.25);
    for (const z of [-1.33, 0.55, -2.5]) { const x = X(zU(z)); const A0 = m ? Math.PI - 1.05 : -0.62, A1 = m ? Math.PI + 0.62 : 1.05; g.beginPath(); g.moveTo(x, Y(VA(A0))); g.lineTo(x, Y(VA(A1))); g.stroke(); }
  }
  // window reveals (darker soft ring) from the trim mask
  if (o.trim) { // soft reveal: tint the blurred seal mask warm-grey (not black) so the window returns read as shaded leather
    const t = cv(W, H), tg = t.getContext('2d'); tg.drawImage(o.trim, 0, 0, W, H); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = '#8a7c6a'; tg.fillRect(0, 0, W, H);
    g.save(); g.globalAlpha = 0.55; g.drawImage(t, 0, 0); g.restore();
  }
  // a fine stitched seam along the cabin window line (both sides)
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.setLineDash([3, 3]); g.lineWidth = 1;
  for (const m of [false, true]) { const A = m ? Math.PI - 1.08 : 1.08; g.beginPath(); g.moveTo(xc, Y(VA(A))); g.lineTo(X(zU(0.66)), Y(VA(A))); g.stroke(); }
  g.setLineDash([]);
  return tex(THREE, c, { aniso: 4 });
}

/* ---------------------------------------------------------------------------- glass tint (loft UV space, RGBA) */
// windshield: clear with a graded sun band at the top; cabin windows: darker privacy tint
export function glassTintTexture(THREE, o = {}) {
  const W = 256, H = 128, c = cv(W, H); if (!c) return null;
  const g = c.getContext('2d');
  const LU = LIVERY.LOFT_U, zU = o.zToU || ((z) => (z + 4.3) / 6.7 * LU);
  const X = (u) => u * W;
  g.fillStyle = 'rgba(70,96,112,0.30)'; g.fillRect(0, 0, W, H);
  // top band of the canopy (angles near π/2 → v ≈ 0.5 → canvas middle): sun strip gradient
  const sg = g.createLinearGradient(0, H * 0.32, 0, H * 0.68);
  sg.addColorStop(0, 'rgba(60,80,100,0)'); sg.addColorStop(0.3, 'rgba(40,62,84,0.42)'); sg.addColorStop(0.5, 'rgba(34,54,76,0.55)'); sg.addColorStop(0.7, 'rgba(40,62,84,0.42)'); sg.addColorStop(1, 'rgba(60,80,100,0)');
  g.fillStyle = sg; g.fillRect(0, 0, X(zU(-2.6)), H);
  // cabin windows (aft of the crew doors): privacy tint
  g.clearRect(X(zU(-1.36)), 0, W, H);
  g.fillStyle = 'rgba(22,28,36,0.62)'; g.fillRect(X(zU(-1.36)), 0, W, H);
  return tex(THREE, c, { aniso: 2 });
}

/* ---------------------------------------------------------------------------- interior */
// leather for seats (RoundedBox faces map 0..1): o.insert = 'quilt' | 'perf' | false — a stitched centre insert
export function leatherTexture(THREE, base = '#e4d8c4', o = {}) {
  const S = 512, c = cv(S, S); if (!c) return null;
  const g = c.getContext('2d'), r = rng(o.seed || 77);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  // grain: blotchy low-frequency + fine noise
  for (let i = 0; i < 900; i++) { const x = r() * S, y = r() * S, rad = 4 + r() * 16; g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.015 + r() * 0.025})`; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); }
  noise(g, S, S, 12, (o.seed || 77) + 1);
  const mode = o.insert !== undefined ? o.insert : (o.quilt === false ? false : 'quilt');
  const dark = o.dark != null ? o.dark : 0.2;
  if (mode) {
    const m = S * 0.16, iw = S - 2 * m;
    // insert panel slightly darker / lighter, piping seam
    g.fillStyle = mode === 'perf' ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.06)'; g.fillRect(m, m, iw, iw);
    if (mode === 'quilt') {
      const q = o.quilt || 64;
      g.save(); g.beginPath(); g.rect(m, m, iw, iw); g.clip();
      g.strokeStyle = `rgba(0,0,0,${dark})`; g.lineWidth = 3;
      for (let k = -S; k < 2 * S; k += q) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke(); g.beginPath(); g.moveTo(k, S); g.lineTo(k + S, 0); g.stroke(); }
      g.strokeStyle = 'rgba(255,255,255,0.20)'; g.lineWidth = 1; g.setLineDash([4, 4]);
      for (let k = -S; k < 2 * S; k += q) { g.beginPath(); g.moveTo(k + 3, 0); g.lineTo(k + S + 3, S); g.stroke(); g.beginPath(); g.moveTo(k + 3, S); g.lineTo(k + S + 3, 0); g.stroke(); }
      g.setLineDash([]); g.restore();
    } else if (mode === 'perf') {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      for (let y = m + 6; y < m + iw; y += 9) for (let x = m + 6 + ((y / 9) % 2) * 4.5; x < m + iw; x += 9) { g.beginPath(); g.arc(x, y, 1.4, 0, TAU); g.fill(); }
      // horizontal flutes
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = m + iw / 5; y < m + iw; y += iw / 5) g.fillRect(m, y - 2, iw, 4);
    }
    // seams + contrast stitching
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 3; g.strokeRect(m, m, iw, iw);
    g.strokeStyle = o.stitch || 'rgba(255,255,255,0.35)'; g.lineWidth = 1.2; g.setLineDash([5, 4]);
    g.strokeRect(m - 6, m - 6, iw + 12, iw + 12); g.strokeRect(m + 6, m + 6, iw - 12, iw - 12);
    g.setLineDash([]);
  }
  return tex(THREE, c, { repeat: o.repeat || [1, 1] });
}
export function carpetTexture(THREE) {
  const S = 256, c = cv(S, S); if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = '#5a5248'; g.fillRect(0, 0, S, S);
  noise(g, S, S, 40, 9);
  // fine loop-pile rows
  g.fillStyle = 'rgba(0,0,0,0.10)'; for (let y = 0; y < S; y += 4) g.fillRect(0, y, S, 1);
  return tex(THREE, c, { repeat: [4, 4] });
}
export function woodTexture(THREE) {
  const W = 512, H = 256, c = cv(W, H); if (!c) return null;
  const g = c.getContext('2d'), r = rng(31);
  g.fillStyle = '#5a3018'; g.fillRect(0, 0, W, H);
  // figured walnut: wavy bands + flame
  for (let y = 0; y < H; y++) {
    const k = Math.sin(y * 0.16 + Math.sin(y * 0.031) * 5) * 0.5 + 0.5;
    g.fillStyle = `rgba(${130 + k * 60},${72 + k * 34},${34 + k * 16},0.55)`;
    g.fillRect(0, y, W, 1);
  }
  for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(30,14,6,${0.12 + r() * 0.22})`; g.lineWidth = 0.8 + r() * 2.2; const y = r() * H; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin(x * 0.018 + i) * 5 + Math.sin(x * 0.07 + i * 3) * 1.5); g.stroke(); }
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(255,220,170,${0.03 + r() * 0.04})`; g.fillRect(r() * W, 0, 4 + r() * 20, H); }
  return tex(THREE, c, { repeat: [1, 1] });
}
export function headlinerTexture(THREE) {
  const S = 256, c = cv(S, S); if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = '#d9d3c8'; g.fillRect(0, 0, S, S);
  noise(g, S, S, 9, 5);
  return tex(THREE, c, { repeat: [6, 3] });
}
// overhead switch panel / circuit-breaker panel (generic labels)
export function switchPanelTexture(THREE) {
  const W = 512, H = 256, c = cv(W, H); if (!c) return null;
  drawSwitchPanel(c.getContext('2d'), 0, 0, W, H, ['BAT', 'GEN 1', 'GEN 2', 'FUEL P', 'AVION', 'NAV', 'STROBE', 'POS', 'LDG LT', 'PITOT', 'DEFOG', 'CABIN']);
  return tex(THREE, c);
}
function drawSwitchPanel(g, x0, y0, W, H, labels) {
  g.save(); g.translate(x0, y0);
  g.fillStyle = '#25282e'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#3c4048'; g.lineWidth = 2; g.strokeRect(3, 3, W - 6, H - 6);
  const n = labels.length, cols = Math.ceil(n / 2), cw = W / cols;
  g.font = `${Math.max(9, Math.round(H * 0.05))}px Arial, sans-serif`; g.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    const x = cw * (i % cols) + cw / 2, y = H * (0.3 + 0.45 * Math.floor(i / cols));
    g.fillStyle = '#121418'; rrect(g, x - cw * 0.18, y - H * 0.11, cw * 0.36, H * 0.22, 4); g.fill();
    g.fillStyle = '#d0d4dc'; rrect(g, x - cw * 0.07, y - (i % 3 ? H * 0.09 : H * 0.01), cw * 0.14, H * 0.09, 2); g.fill();
    g.fillStyle = '#e6eaf0'; g.fillText(labels[i], x, y + H * 0.19);
    g.fillStyle = i % 4 ? '#3ad16b' : '#ffb000'; g.beginPath(); g.arc(x + cw * 0.26, y - H * 0.1, Math.max(2, H * 0.012), 0, TAU); g.fill();
  }
  g.restore();
}

/* ---------------------------------------------------------------------------- cockpit atlas */
// One 1024² canvas → instrument-panel face, pedestal (radios / autopilot), console top, overhead panel, door card.
// Rects (u0, v0, u1, v1 in UV space, v up) exported for the model. Generic avionics look, no maker styling.
export const ATLAS = {
  panel: [0, 1 - 340 / 1024, 1, 1],
  pedestal: [0, 1 - 1000 / 1024, 300 / 1024, 1 - 350 / 1024],
  console: [310 / 1024, 1 - 1000 / 1024, 610 / 1024, 1 - 350 / 1024],
  overhead: [620 / 1024, 1 - 680 / 1024, 1, 1 - 350 / 1024],
  door: [620 / 1024, 1 - 1000 / 1024, 1, 1 - 690 / 1024],
};
// panel geometry (fractions of the panel face width / height) for the 4 display openings; heli-model uses the same
export const PANEL_SCREENS = [[0.155, 0.47], [0.375, 0.47], [0.625, 0.47], [0.845, 0.47]]; // centres (u, v from top)
export const PANEL_SCREEN_W = 0.205, PANEL_SCREEN_H = 0.53; // fractions of the face
export function cockpitAtlas(THREE) {
  const S = 1024, c = cv(S, S); if (!c) return null;
  const g = c.getContext('2d'), r = rng(808);
  g.fillStyle = '#1f2125'; g.fillRect(0, 0, S, S);
  /* -- instrument panel face (0,0)-(1024,340) */
  {
    const W = 1024, H = 340;
    const pg = g.createLinearGradient(0, 0, 0, H); pg.addColorStop(0, '#2a2d32'); pg.addColorStop(1, '#1d1f23');
    g.fillStyle = pg; g.fillRect(0, 0, W, H);
    g.font = '600 13px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [u, v] of PANEL_SCREENS) {
      const cx = u * W, cy = v * H, w = PANEL_SCREEN_W * W, h = PANEL_SCREEN_H * H;
      // bezel with soft keys
      g.fillStyle = '#0d0e10'; rrect(g, cx - w / 2 - 22, cy - h / 2 - 16, w + 44, h + 40, 10); g.fill();
      g.strokeStyle = '#3a3e45'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#000'; g.fillRect(cx - w / 2, cy - h / 2, w, h);
      for (let k = 0; k < 5; k++) { // left / right soft keys
        for (const s of [-1, 1]) { const x = cx + s * (w / 2 + 11), y = cy - h / 2 + 14 + k * (h - 28) / 4; g.fillStyle = '#2e3238'; rrect(g, x - 7, y - 9, 14, 18, 3); g.fill(); g.fillStyle = '#9aa2ad'; g.fillRect(x - 3, y - 1, 6, 2); }
      }
      for (let k = 0; k < 6; k++) { const x = cx - w / 2 + 12 + k * (w - 24) / 5, y = cy + h / 2 + 12; g.fillStyle = '#2e3238'; rrect(g, x - 10, y - 6, 20, 12, 3); g.fill(); }
      // two knobs under each bezel
      for (const s of [-1, 1]) { const x = cx + s * w * 0.36, y = cy + h / 2 + 34; const kg = g.createRadialGradient(x - 3, y - 3, 1, x, y, 12); kg.addColorStop(0, '#8d939c'); kg.addColorStop(1, '#1b1d21'); g.fillStyle = kg; g.beginPath(); g.arc(x, y, 11, 0, TAU); g.fill(); }
    }
    // centre: annunciator strip + standby attitude indicator
    const cx = W / 2;
    const ann = [['MASTER WARN', '#c82020'], ['MASTER CAUT', '#d89a10'], ['ROTOR', '#2a2a2a'], ['FIRE 1', '#2a2a2a'], ['FIRE 2', '#2a2a2a']];
    g.font = '700 9px Arial, sans-serif';
    ann.forEach(([t, col], i) => { const x = cx - 42 + (i % 2) * 84 - (i > 1 ? 0 : 0), y = 26 + Math.floor(i / 2) * 20; if (i > 3) return; g.fillStyle = col; rrect(g, x - 38, y - 8, 76, 16, 3); g.fill(); g.fillStyle = col === '#2a2a2a' ? '#777' : '#fff'; g.fillText(t, x, y); });
    {
      const y = 175, R = 44;
      g.fillStyle = '#0a0a0a'; g.beginPath(); g.arc(cx, y, R + 8, 0, TAU); g.fill();
      g.save(); g.beginPath(); g.arc(cx, y, R, 0, TAU); g.clip();
      g.fillStyle = '#3b7fd0'; g.fillRect(cx - R, y - R, 2 * R, R); g.fillStyle = '#7a4f24'; g.fillRect(cx - R, y, 2 * R, R);
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - R, y); g.lineTo(cx + R, y); g.stroke();
      g.lineWidth = 1; for (const d of [-14, -7, 7, 14]) { g.beginPath(); g.moveTo(cx - 10, y + d); g.lineTo(cx + 10, y + d); g.stroke(); }
      g.restore();
      g.strokeStyle = '#ffcc00'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 24, y); g.lineTo(cx - 8, y); g.moveTo(cx + 8, y); g.lineTo(cx + 24, y); g.stroke();
      g.fillStyle = '#ddd'; g.font = '600 10px Arial'; g.fillText('STBY', cx, y + R + 20);
    }
    // small labelled push buttons under the standby (generic)
    g.font = '700 9px Arial, sans-serif';
    ['HDG', 'ALT', 'NAV', 'VS', 'IAS', 'AP'].forEach((t, i) => { const x = cx - 75 + (i % 3) * 75, y = 268 + Math.floor(i / 3) * 30; g.fillStyle = '#121316'; rrect(g, x - 26, y - 11, 52, 22, 4); g.fill(); g.fillStyle = '#e8ecf2'; g.fillText(t, x, y); g.fillStyle = i === 5 ? '#3ad16b' : '#555'; g.fillRect(x - 10, y - 9, 20, 2); });
    // screws + panel edges
    g.fillStyle = '#6b7079'; for (const [x, y] of [[10, 10], [W - 10, 10], [10, H - 10], [W - 10, H - 10], [W / 2, 10], [W / 2, H - 10]]) { g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill(); }
    noise(g, W, H, 4, 3);
  }
  /* -- pedestal: audio panel, NAV/COM radio, transponder, autopilot controller */
  {
    const x0 = 0, y0 = 350, W = 300, H = 650;
    g.fillStyle = '#1b1d21'; g.fillRect(x0, y0, W, H);
    const unit = (y, h, fn) => { g.fillStyle = '#26292e'; rrect(g, x0 + 10, y0 + y, W - 20, h, 6); g.fill(); g.strokeStyle = '#3d4249'; g.lineWidth = 2; g.stroke(); fn(x0 + 10, y0 + y, W - 20, h); };
    g.textAlign = 'center'; g.textBaseline = 'middle';
    unit(10, 120, (x, y, w, h) => { // audio panel: rows of buttons + volume knobs
      g.font = '700 11px Arial';
      ['COM1', 'COM2', 'NAV1', 'NAV2', 'ICS', 'PA', 'MKR', 'ADF'].forEach((t, i) => { const bx = x + 34 + (i % 4) * ((w - 50) / 3.2), by = y + 30 + Math.floor(i / 4) * 40; g.fillStyle = '#121316'; rrect(g, bx - 26, by - 13, 52, 26, 4); g.fill(); g.fillStyle = i < 2 ? '#64e08a' : '#d6dbe2'; g.fillText(t, bx, by); });
      for (let k = 0; k < 4; k++) { const bx = x + 34 + k * ((w - 50) / 3.2), by = y + 103; g.fillStyle = '#5d636c'; g.beginPath(); g.arc(bx, by, 8, 0, TAU); g.fill(); }
    });
    unit(140, 150, (x, y, w, h) => { // NAV / COM radio
      g.fillStyle = '#05140a'; g.fillRect(x + 12, y + 16, w - 24, 56);
      g.font = '700 22px "Courier New", monospace'; g.fillStyle = '#58f08a'; g.fillText('121.900', x + w * 0.3, y + 34); g.fillText('118.725', x + w * 0.72, y + 34);
      g.font = '700 16px "Courier New", monospace'; g.fillStyle = '#7ad0ff'; g.fillText('113.40', x + w * 0.3, y + 58); g.fillText('110.90', x + w * 0.72, y + 58);
      for (const s of [0.18, 0.82]) { const kx = x + w * s, ky = y + 112; const kg = g.createRadialGradient(kx - 4, ky - 4, 2, kx, ky, 22); kg.addColorStop(0, '#9ba1aa'); kg.addColorStop(1, '#1b1d21'); g.fillStyle = kg; g.beginPath(); g.arc(kx, ky, 20, 0, TAU); g.fill(); g.fillStyle = '#2a2d32'; g.beginPath(); g.arc(kx, ky, 11, 0, TAU); g.fill(); }
      g.font = '700 11px Arial'; ['⇄', 'MENU', 'ENT'].forEach((t, i) => { const bx = x + w * (0.4 + i * 0.1), by = y + 112; g.fillStyle = '#121316'; rrect(g, bx - 13, by - 10, 26, 20, 3); g.fill(); g.fillStyle = '#d6dbe2'; g.fillText(t, bx, by); });
    });
    unit(300, 110, (x, y, w, h) => { // transponder
      g.fillStyle = '#05140a'; g.fillRect(x + 12, y + 14, w * 0.5, 36);
      g.font = '700 22px "Courier New", monospace'; g.fillStyle = '#58f08a'; g.fillText('1200', x + 12 + w * 0.25, y + 33);
      g.font = '700 11px Arial'; g.fillStyle = '#d6dbe2'; g.fillText('ALT', x + w * 0.78, y + 22); g.fillText('XPDR', x + w * 0.78, y + 42);
      for (let k = 0; k < 8; k++) { const bx = x + 22 + k * ((w - 40) / 7), by = y + 80; g.fillStyle = '#121316'; rrect(g, bx - 11, by - 11, 22, 22, 3); g.fill(); g.fillStyle = '#d6dbe2'; g.fillText(String(k), bx, by); }
    });
    unit(420, 220, (x, y, w, h) => { // autopilot / flight director controller + map knobs
      g.font = '700 12px Arial';
      ['AP', 'FD', 'HDG', 'NAV', 'APR', 'ALT', 'VS', 'IAS', 'BC', 'ALTA', 'CRS', 'SBY'].forEach((t, i) => { const bx = x + 38 + (i % 4) * ((w - 60) / 3.15), by = y + 34 + Math.floor(i / 4) * 48; g.fillStyle = '#121316'; rrect(g, bx - 28, by - 15, 56, 30, 4); g.fill(); g.fillStyle = '#e6eaf0'; g.fillText(t, bx, by + 3); g.fillStyle = i < 2 ? '#3ad16b' : '#3a3d42'; g.fillRect(bx - 12, by - 12, 24, 3); });
      for (let k = 0; k < 3; k++) { const kx = x + 50 + k * (w - 100) / 2, ky = y + 182; const kg = g.createRadialGradient(kx - 4, ky - 4, 2, kx, ky, 20); kg.addColorStop(0, '#9ba1aa'); kg.addColorStop(1, '#1b1d21'); g.fillStyle = kg; g.beginPath(); g.arc(kx, ky, 18, 0, TAU); g.fill(); }
    });
  }
  /* -- console top (between the seats): engine switches, rotor brake, trim, cabin controls */
  {
    const x0 = 310, y0 = 350, W = 300, H = 650;
    g.fillStyle = '#1b1d21'; g.fillRect(x0, y0, W, H);
    drawSwitchPanel(g, x0 + 10, y0 + 10, W - 20, 200, ['ENG 1', 'ENG 2', 'FADEC', 'XFEED', 'HYD 1', 'HYD 2', 'BOOST', 'GOV']);
    g.fillStyle = '#26292e'; rrect(g, x0 + 10, y0 + 220, W - 20, 200, 6); g.fill();
    // two guarded engine-mode levers (painted) + red rotor brake handle
    for (const s of [0.3, 0.55]) { g.fillStyle = '#0f1013'; g.fillRect(x0 + W * s - 6, y0 + 240, 12, 160); g.fillStyle = '#d7dbe2'; rrect(g, x0 + W * s - 16, y0 + 300, 32, 22, 4); g.fill(); }
    g.fillStyle = '#0f1013'; g.fillRect(x0 + W * 0.8 - 6, y0 + 240, 12, 160); g.fillStyle = '#c42222'; rrect(g, x0 + W * 0.8 - 16, y0 + 250, 32, 26, 5); g.fill();
    g.font = '700 11px Arial'; g.fillStyle = '#e6eaf0'; g.textAlign = 'center';
    g.fillText('ENG 1', x0 + W * 0.3, y0 + 412); g.fillText('ENG 2', x0 + W * 0.55, y0 + 412); g.fillText('R BRK', x0 + W * 0.8, y0 + 412);
    // cabin / climate controls
    g.fillStyle = '#26292e'; rrect(g, x0 + 10, y0 + 430, W - 20, 210, 6); g.fill();
    g.fillStyle = '#05140a'; g.fillRect(x0 + 30, y0 + 450, W - 60, 40); g.font = '700 18px "Courier New", monospace'; g.fillStyle = '#58f08a'; g.fillText('CABIN 21°C', x0 + W / 2, y0 + 472);
    for (let k = 0; k < 3; k++) { const kx = x0 + 60 + k * (W - 120) / 2, ky = y0 + 545; const kg = g.createRadialGradient(kx - 4, ky - 4, 2, kx, ky, 24); kg.addColorStop(0, '#a0a6af'); kg.addColorStop(1, '#1b1d21'); g.fillStyle = kg; g.beginPath(); g.arc(kx, ky, 22, 0, TAU); g.fill(); }
    g.font = '700 10px Arial'; g.fillStyle = '#cfd4da'; ['FAN', 'TEMP', 'DEFOG'].forEach((t, k) => g.fillText(t, x0 + 60 + k * (W - 120) / 2, y0 + 590));
  }
  /* -- overhead panel */
  drawSwitchPanel(g, 620, 350, 404, 160, ['BAT', 'GEN 1', 'GEN 2', 'AVION', 'NAV', 'STROBE', 'POS', 'LDG LT', 'PITOT', 'WIPER']);
  {
    const x0 = 620, y0 = 515, W = 404, H = 165; g.fillStyle = '#25282e'; g.fillRect(x0, y0, W, H);
    // circuit-breaker field
    for (let row = 0; row < 5; row++) for (let k = 0; k < 14; k++) { const x = x0 + 18 + k * 27, y = y0 + 20 + row * 30; g.fillStyle = '#0c0d0f'; g.beginPath(); g.arc(x, y, 8, 0, TAU); g.fill(); g.fillStyle = r() < 0.08 ? '#ffffff' : '#c7ccd3'; g.beginPath(); g.arc(x, y, 4.5, 0, TAU); g.fill(); }
  }
  /* -- door card (leather-look with an armrest pocket) */
  {
    const x0 = 620, y0 = 690, W = 404, H = 310;
    g.fillStyle = '#34363b'; g.fillRect(x0, y0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.25)'; rrect(g, x0 + 20, y0 + 30, W - 40, 150, 14); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.setLineDash([5, 4]); g.lineWidth = 1.3; rrect(g, x0 + 26, y0 + 36, W - 52, 138, 12); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#1b1c20'; rrect(g, x0 + 40, y0 + 205, W - 80, 70, 8); g.fill();
  }
  noise(g, S, S, 3, 11);
  return tex(THREE, c, { aniso: 8 });
}

/* ---------------------------------------------------------------------------- rotor blur (radial) */
export function blurDiscTexture(THREE, o = {}) {
  const S = 512, c = cv(S, S); if (!c) return null;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  const R = S / 2;
  const r0 = o.hub || 0.07;
  const rg = g.createRadialGradient(R, R, 0, R, R, R);
  rg.addColorStop(0, 'rgba(30,32,36,0)'); rg.addColorStop(r0, 'rgba(30,32,36,0)');
  rg.addColorStop(r0 + 0.02, 'rgba(34,36,42,0.50)'); rg.addColorStop(0.35, 'rgba(38,40,46,0.40)'); rg.addColorStop(0.7, 'rgba(42,44,50,0.30)');
  rg.addColorStop(0.92, 'rgba(46,48,54,0.24)'); rg.addColorStop(0.94, o.tip || 'rgba(215,205,175,0.26)'); rg.addColorStop(0.975, o.tip || 'rgba(215,205,175,0.22)'); rg.addColorStop(0.99, 'rgba(46,48,54,0.12)'); rg.addColorStop(1, 'rgba(40,40,40,0)');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  // motion streaks: many faint concentric rings (gives the disc a spun-metal shimmer) + blade ghosts with trailing fade
  const r = rng(17);
  for (let i = 0; i < 70; i++) { const rr = R * (r0 + 0.03 + r() * (0.95 - r0)); g.strokeStyle = `rgba(${r() < 0.5 ? '10,12,16' : '200,205,215'},${0.03 + r() * 0.05})`; g.lineWidth = 0.6 + r() * 1.4; g.beginPath(); g.arc(R, R, rr, 0, TAU); g.stroke(); }
  const n = o.blades || 5;
  for (let b = 0; b < n; b++) {
    const a0 = (b / n) * TAU;
    for (let k = 0; k < 10; k++) { // a darker leading ghost fading over ~25° behind it
      g.save(); g.translate(R, R); g.rotate(a0 - k * 0.045);
      g.fillStyle = `rgba(16,18,22,${0.16 * (1 - k / 10)})`; g.fillRect(R * r0, -5, R * (0.98 - r0), 10);
      g.restore();
    }
  }
  return tex(THREE, c);
}
/* ---------------------------------------------------------------------------- exhaust heat haze */
export function hazeTexture(THREE) {
  const W = 128, H = 256, c = cv(W, H); if (!c) return null;
  const g = c.getContext('2d'), r = rng(3);
  g.clearRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const x = W / 2 + (r() - 0.5) * W * 0.7 * (0.3 + r()), y = r() * H, s = 6 + r() * 18;
    const rg = g.createRadialGradient(x, y, 0, x, y, s);
    rg.addColorStop(0, `rgba(200,200,205,${0.05 + r() * 0.06})`); rg.addColorStop(1, 'rgba(200,200,205,0)');
    g.fillStyle = rg; g.fillRect(x - s, y - s, 2 * s, 2 * s);
  }
  const t = tex(THREE, c); t.wrapT = THREE.RepeatWrapping;
  return t;
}
// soft round glow sprite (landing / nav light halos)
export function glowTexture(THREE) {
  const S = 128, c = cv(S, S); if (!c) return null;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.15, 'rgba(255,255,255,0.6)'); rg.addColorStop(0.45, 'rgba(255,255,255,0.12)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  return tex(THREE, c);
}
// helipad: concrete pad with the H in a circle (temporary landing pad in the yard)
export function helipadTexture(THREE) {
  const S = 1024, c = cv(S, S); if (!c) return null;
  const g = c.getContext('2d'), r = rng(42);
  g.fillStyle = '#7d7f80'; g.fillRect(0, 0, S, S);
  noise(g, S, S, 22, 42);
  g.strokeStyle = 'rgba(40,40,40,0.5)'; g.lineWidth = 3;
  for (let k = 256; k < S; k += 256) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, S); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(S, k); g.stroke(); }
  g.strokeStyle = '#f2f2ee'; g.lineWidth = 18; g.strokeRect(30, 30, S - 60, S - 60);
  g.strokeStyle = '#f4f4f0'; g.lineWidth = 34; g.beginPath(); g.arc(S / 2, S / 2, S * 0.36, 0, TAU); g.stroke();
  g.fillStyle = '#f4f4f0';
  const h = S * 0.36, w = S * 0.24, bar = S * 0.06;
  g.fillRect(S / 2 - w / 2, S / 2 - h / 2, bar, h); g.fillRect(S / 2 + w / 2 - bar, S / 2 - h / 2, bar, h); g.fillRect(S / 2 - w / 2, S / 2 - bar / 2, w, bar);
  g.fillStyle = 'rgba(30,30,30,0.12)'; for (let i = 0; i < 30; i++) g.fillRect(S * 0.3 + r() * S * 0.4, S * 0.25 + r() * S * 0.5, 30 + r() * 80, 3 + r() * 5);
  return tex(THREE, c, { aniso: 8 });
}

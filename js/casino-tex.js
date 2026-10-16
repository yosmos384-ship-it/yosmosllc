// casino-tex.js — V10 CASINO: procedural canvas textures for the 3D venue (no image files). Every generator takes a
// size (≤ 1024, phones get half) and returns a canvas; tex() wraps it as an sRGB CanvasTexture.
// Look: classic-Hollywood art-deco — burgundy / midnight carpets with gold medallions, lacquered walnut panels with
// gold sunbursts, Calacatta-style marble, printed felts, a bulb-lit marquee for the fictional "Eakin Grand Casino".
const TAU = Math.PI * 2;
const SERIF = "Didot,'Bodoni 72','Bodoni MT',Georgia,'Times New Roman',serif";
export function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function tex(THREE, c, { repeat = null, srgb = true, aniso = 4, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}
function fiber(ctx, w, h, amt, seed = 1) {
  const r = rng(seed); const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
}
const gold = (ctx, y0, y1) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#fff1c4'); g.addColorStop(0.45, '#d9b46a'); g.addColorStop(1, '#8a6224'); return g; };

/** main floor carpet: burgundy with gold medallions, teal diamonds, fine dots (tiles seamlessly) */
export function carpet(S = 1024, palette = 'burgundy') {
  const c = canvas(S), x = c.getContext('2d');
  const P = palette === 'midnight'
    ? { bg: '#0d1530', a: '#c9a24a', b: '#7a1830', c2: '#1f6f78', dot: '#e7cf8a' }
    : palette === 'emerald' ? { bg: '#0b2a22', a: '#c9a24a', b: '#5a1424', c2: '#123f5a', dot: '#d9c07a' }
      : { bg: '#3d0c16', a: '#d2ab55', b: '#123f48', c2: '#4a1a5a', dot: '#e9cf86' };
  x.fillStyle = P.bg; x.fillRect(0, 0, S, S);
  const n = 4, cell = S / n;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const cx = i * cell, cy = j * cell;
    // medallion
    x.save(); x.translate(cx, cy);
    x.strokeStyle = P.a; x.lineWidth = S * 0.006;
    for (const r of [0.36, 0.3]) { x.beginPath(); x.arc(0, 0, cell * r, 0, TAU); x.stroke(); }
    x.fillStyle = P.b; x.beginPath(); x.arc(0, 0, cell * 0.27, 0, TAU); x.fill();
    x.fillStyle = P.a;
    for (let k = 0; k < 16; k++) { x.save(); x.rotate(k * TAU / 16); x.beginPath(); x.moveTo(0, -cell * 0.08); x.lineTo(cell * 0.025, -cell * 0.25); x.lineTo(-cell * 0.025, -cell * 0.25); x.closePath(); x.fill(); x.restore(); }
    x.beginPath(); x.arc(0, 0, cell * 0.07, 0, TAU); x.fill();
    x.fillStyle = P.bg; x.beginPath(); x.arc(0, 0, cell * 0.035, 0, TAU); x.fill();
    x.restore();
    // diamond between medallions
    x.save(); x.translate(cx + cell / 2, cy + cell / 2); x.rotate(Math.PI / 4);
    x.fillStyle = P.c2; x.fillRect(-cell * 0.13, -cell * 0.13, cell * 0.26, cell * 0.26);
    x.strokeStyle = P.a; x.lineWidth = S * 0.004; x.strokeRect(-cell * 0.13, -cell * 0.13, cell * 0.26, cell * 0.26);
    x.strokeRect(-cell * 0.07, -cell * 0.07, cell * 0.14, cell * 0.14);
    x.restore();
    // connecting arcs (fans)
    x.strokeStyle = P.a; x.lineWidth = S * 0.003;
    for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(cx + cell / 2, cy, cell * (0.12 + k * 0.035), 0, Math.PI); x.stroke(); }
  }
  x.fillStyle = P.dot; const r = rng(7);
  for (let i = 0; i < S * 1.2; i++) { x.globalAlpha = 0.35; x.fillRect(r() * S, r() * S, S * 0.0025, S * 0.0025); }
  x.globalAlpha = 1;
  fiber(x, S, S, 26, 3);
  return c;
}
/** table-pit carpet: midnight blue + gold chevrons / stars */
export function pitCarpet(S = 512) {
  const c = canvas(S), x = c.getContext('2d');
  x.fillStyle = '#0c1430'; x.fillRect(0, 0, S, S);
  const n = 4, cell = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const cx = i * cell + cell / 2, cy = j * cell + cell / 2;
    x.strokeStyle = '#c9a24a'; x.lineWidth = S * 0.006;
    for (let k = 0; k < 3; k++) { const s = cell * (0.18 + k * 0.1); x.beginPath(); x.moveTo(cx - s, cy); x.lineTo(cx, cy - s); x.lineTo(cx + s, cy); x.lineTo(cx, cy + s); x.closePath(); x.stroke(); }
    x.fillStyle = '#7a1830'; x.beginPath(); x.arc(cx, cy, cell * 0.08, 0, TAU); x.fill();
    x.fillStyle = '#e7cf8a'; for (let k = 0; k < 8; k++) { const a = k * TAU / 8; x.beginPath(); x.arc(i * cell + Math.cos(a) * cell * 0.06, j * cell + Math.sin(a) * cell * 0.06, S * 0.004, 0, TAU); x.fill(); }
  }
  fiber(x, S, S, 22, 5);
  return c;
}
/** Calacatta-style marble (lobby) */
export function marble(S = 512, seed = 3) {
  const c = canvas(S), x = c.getContext('2d'); const r = rng(seed);
  x.fillStyle = '#efe9df'; x.fillRect(0, 0, S, S);
  for (let v = 0; v < 9; v++) {
    let px = r() * S, py = -20, a = r() * 0.6 + 0.6; const w0 = 0.6 + r() * 2.2;
    x.strokeStyle = r() < 0.3 ? 'rgba(170,140,90,.55)' : 'rgba(120,120,128,.5)';
    x.lineWidth = w0; x.beginPath(); x.moveTo(px, py);
    while (py < S + 20) { a += (r() - 0.5) * 0.5; px += Math.cos(a) * 8; py += Math.abs(Math.sin(a)) * 8 + 2; x.lineTo(((px % S) + S) % S === px ? px : px, py); }
    x.stroke();
  }
  // tile joints (60 cm tiles → 4 per canvas)
  x.strokeStyle = 'rgba(80,70,60,.35)'; x.lineWidth = 2;
  for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(k * S / 4, 0); x.lineTo(k * S / 4, S); x.stroke(); x.beginPath(); x.moveTo(0, k * S / 4); x.lineTo(S, k * S / 4); x.stroke(); }
  fiber(x, S, S, 8, 9);
  return c;
}
/** lobby floor inlay: gold / black art-deco compass star */
export function inlay(S = 512) {
  const c = canvas(S), x = c.getContext('2d'); const R = S / 2;
  x.clearRect(0, 0, S, S); x.translate(R, R);
  x.fillStyle = '#121014'; x.beginPath(); x.arc(0, 0, R * 0.98, 0, TAU); x.fill();
  x.strokeStyle = '#d9b46a'; x.lineWidth = S * 0.012; for (const r of [0.96, 0.86]) { x.beginPath(); x.arc(0, 0, R * r, 0, TAU); x.stroke(); }
  for (let k = 0; k < 32; k++) { x.save(); x.rotate(k * TAU / 32); x.fillStyle = k % 2 ? '#7a1830' : '#e9d9b0'; x.beginPath(); x.moveTo(0, 0); x.lineTo(R * 0.06, -R * 0.84); x.lineTo(-R * 0.06, -R * 0.84); x.closePath(); x.fill(); x.restore(); }
  for (let k = 0; k < 8; k++) { x.save(); x.rotate(k * TAU / 8); const g = x.createLinearGradient(0, 0, 0, -R * 0.8); g.addColorStop(0, '#fff1c4'); g.addColorStop(1, '#a87a2c'); x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.lineTo(R * 0.12, -R * 0.2); x.lineTo(0, -R * 0.82); x.lineTo(-R * 0.12, -R * 0.2); x.closePath(); x.fill(); x.restore(); }
  x.fillStyle = '#121014'; x.beginPath(); x.arc(0, 0, R * 0.16, 0, TAU); x.fill(); x.strokeStyle = '#d9b46a'; x.stroke();
  x.fillStyle = '#d9b46a'; x.font = `700 ${Math.round(S * 0.07)}px ${SERIF}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('EG', 0, 2);
  return c;
}
/** wall panelling: lacquered walnut panels, gold fluting + sunburst crown (one 4 m bay × 6 m) */
export function wallPanel(W = 512, H = 768) {
  const c = canvas(W, H), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#2a140a'); g.addColorStop(0.5, '#3d1f0f'); g.addColorStop(1, '#2a140a');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const r = rng(11);
  for (let i = 0; i < 260; i++) { x.strokeStyle = `rgba(${90 + r() * 40},${45 + r() * 20},${20},${0.08 + r() * 0.08})`; x.lineWidth = 1 + r() * 2; x.beginPath(); const yy = r() * H; x.moveTo(0, yy); x.bezierCurveTo(W * 0.3, yy + (r() - 0.5) * 30, W * 0.7, yy + (r() - 0.5) * 30, W, yy + (r() - 0.5) * 20); x.stroke(); }
  // panel frames
  x.strokeStyle = '#c9a24a'; x.lineWidth = W * 0.012;
  x.strokeRect(W * 0.08, H * 0.22, W * 0.84, H * 0.62);
  x.lineWidth = W * 0.005; x.strokeRect(W * 0.11, H * 0.24, W * 0.78, H * 0.58);
  // fluted pilasters at the edges
  x.fillStyle = gold(x, 0, H); x.fillRect(0, 0, W * 0.035, H); x.fillRect(W - W * 0.035, 0, W * 0.035, H);
  // sunburst crown
  x.save(); x.translate(W / 2, H * 0.2); x.fillStyle = gold(x, -H * 0.18, 0);
  for (let k = 0; k <= 12; k++) { const a = Math.PI + k * Math.PI / 12; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a - 0.05) * W * 0.36, Math.sin(a - 0.05) * H * 0.17); x.lineTo(Math.cos(a + 0.05) * W * 0.36, Math.sin(a + 0.05) * H * 0.17); x.closePath(); x.globalAlpha = k % 2 ? 0.55 : 0.95; x.fill(); }
  x.globalAlpha = 1; x.beginPath(); x.arc(0, 0, W * 0.06, Math.PI, TAU); x.fill(); x.restore();
  // dado rail + skirting
  x.fillStyle = gold(x, H * 0.86, H * 0.88); x.fillRect(0, H * 0.86, W, H * 0.015);
  x.fillStyle = '#140a05'; x.fillRect(0, H * 0.93, W, H * 0.07);
  return c;
}
/** facade cladding: cream limestone with art-deco vertical fins */
export function facade(W = 512, H = 512) {
  const c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#d8cdb8'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(90,80,60,.35)'; x.lineWidth = 2;
  for (let k = 0; k <= 8; k++) { x.beginPath(); x.moveTo(0, k * H / 8); x.lineTo(W, k * H / 8); x.stroke(); }
  for (let k = 0; k <= 4; k++) { for (let j = 0; j < 8; j++) { const o = j % 2 ? W / 8 : 0; x.beginPath(); x.moveTo(k * W / 4 + o, j * H / 8); x.lineTo(k * W / 4 + o, (j + 1) * H / 8); x.stroke(); } }
  fiber(x, W, H, 16, 21);
  return c;
}
/** felt with printed layout. kind: 'bj' | 'roulette' | 'craps' | 'baccarat' | 'poker' */
export function felt(kind, W = 512, H = 256) {
  const c = canvas(W, H), x = c.getContext('2d');
  const base = kind === 'baccarat' ? ['#1d4f8a', '#0e2f58'] : kind === 'poker' ? ['#7a1830', '#4a0c1c'] : ['#1b7a5c', '#0c4a37'];
  const g = x.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H / 2, W * 0.6); g.addColorStop(0, base[0]); g.addColorStop(1, base[1]); x.fillStyle = g; x.fillRect(0, 0, W, H);
  fiber(x, W, H, 14, 31);
  const ink = 'rgba(255,240,200,.85)';
  x.strokeStyle = ink; x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (kind === 'bj') {
    // half-moon: the straight edge is at the top (dealer side) of the canvas
    x.lineWidth = 3; x.beginPath(); x.arc(W / 2, -H * 0.55, H * 1.25, 0.45, Math.PI - 0.45); x.stroke();
    x.font = `700 ${Math.round(H * 0.075)}px ${SERIF}`; x.fillText('BLACKJACK PAYS 3 TO 2', W / 2, H * 0.36);
    x.font = `600 ${Math.round(H * 0.05)}px system-ui,sans-serif`; x.fillText('DEALER MUST STAND ON ALL 17s · INSURANCE PAYS 2 TO 1', W / 2, H * 0.47);
    for (let i = 0; i < 5; i++) { const a = Math.PI * (0.25 + i * 0.125); const px = W / 2 + Math.cos(a) * H * 0.95, py = -H * 0.25 + Math.sin(a) * H * 1.05; x.lineWidth = 2.5; x.beginPath(); x.arc(px, py, H * 0.07, 0, TAU); x.stroke(); }
  } else if (kind === 'roulette') {
    // layout: 0/00 + 12×3 grid + outside, horizontal
    // the wheel sits on the left ~35 % of the table → the layout is drawn on the right
    const x0 = W * 0.42, y0 = H * 0.1, cw = (W * 0.52) / 12, ch = (H * 0.5) / 3;
    x.lineWidth = 2;
    x.strokeRect(x0 - cw, y0, cw, ch * 1.5); x.strokeRect(x0 - cw, y0 + ch * 1.5, cw, ch * 1.5);
    x.font = `700 ${Math.round(ch * 0.5)}px ${SERIF}`; x.fillText('0', x0 - cw / 2, y0 + ch * 0.75); x.fillText('00', x0 - cw / 2, y0 + ch * 2.25);
    const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    for (let n = 1; n <= 36; n++) { const col = Math.floor((n - 1) / 3), row = 2 - ((n - 1) % 3); const px = x0 + col * cw, py = y0 + row * ch; x.fillStyle = REDS.has(n) ? '#a3121e' : '#111'; x.fillRect(px + 2, py + 2, cw - 4, ch - 4); x.strokeStyle = ink; x.strokeRect(px, py, cw, ch); x.fillStyle = '#fff'; x.font = `700 ${Math.round(ch * 0.42)}px ${SERIF}`; x.fillText(String(n), px + cw / 2, py + ch / 2); }
    x.fillStyle = ink;
    for (let d = 0; d < 3; d++) { x.strokeRect(x0 + d * 4 * cw, y0 + 3 * ch, 4 * cw, ch * 0.7); x.font = `600 ${Math.round(ch * 0.32)}px system-ui`; x.fillText(['1st 12', '2nd 12', '3rd 12'][d], x0 + d * 4 * cw + 2 * cw, y0 + 3.35 * ch); }
    const em = ['1–18', 'EVEN', '◆', '◆', 'ODD', '19–36'];
    for (let k = 0; k < 6; k++) { x.strokeRect(x0 + k * 2 * cw, y0 + 3.7 * ch, 2 * cw, ch * 0.7); x.fillStyle = k === 2 ? '#a3121e' : k === 3 ? '#111' : ink; x.font = `600 ${Math.round(ch * (k === 2 || k === 3 ? 0.55 : 0.32))}px system-ui`; x.fillText(em[k], x0 + k * 2 * cw + cw, y0 + 4.05 * ch); x.fillStyle = ink; }
    for (let r = 0; r < 3; r++) { x.strokeRect(x0 + 12 * cw, y0 + r * ch, cw * 0.9, ch); x.font = `600 ${Math.round(ch * 0.3)}px system-ui`; x.fillText('2:1', x0 + 12.45 * cw, y0 + r * ch + ch / 2); }
  } else if (kind === 'craps') {
    x.lineWidth = 3; x.font = `700 ${Math.round(H * 0.07)}px ${SERIF}`;
    const half = (mx) => {
      x.save(); x.translate(mx, 0); x.scale(mx < W / 2 ? 1 : -1, 1);
      x.strokeRect(W * 0.03, H * 0.08, W * 0.4, H * 0.84);
      x.beginPath(); x.moveTo(W * 0.03, H * 0.8); x.lineTo(W * 0.43, H * 0.8); x.stroke();
      x.beginPath(); x.moveTo(W * 0.1, H * 0.08); x.lineTo(W * 0.1, H * 0.8); x.stroke();
      for (let k = 0; k < 6; k++) { x.strokeRect(W * 0.12 + k * W * 0.05, H * 0.1, W * 0.05, H * 0.16); }
      x.restore();
    };
    half(0); half(W);
    for (const [txt, yy] of [['PASS LINE', 0.86], ['FIELD', 0.55], ['COME', 0.36], ["DON'T PASS BAR", 0.73]]) { x.fillText(txt, W * 0.25, H * yy); x.fillText(txt, W * 0.75, H * yy); }
    x.font = `700 ${Math.round(H * 0.045)}px system-ui`;
    for (let k = 0; k < 6; k++) { const t = ['4', '5', 'SIX', '8', 'NINE', '10'][k]; x.fillText(t, W * 0.145 + k * W * 0.05, H * 0.18); x.fillText(t, W - (W * 0.145 + k * W * 0.05), H * 0.18); }
    x.fillStyle = 'rgba(160,20,30,.6)'; x.fillRect(W * 0.44, H * 0.2, W * 0.12, H * 0.6); x.fillStyle = ink; x.strokeRect(W * 0.44, H * 0.2, W * 0.12, H * 0.6);
    x.font = `700 ${Math.round(H * 0.035)}px system-ui`; ['SEVEN 4:1', 'HARD 6  9:1', 'HARD 10  7:1', 'HARD 8  9:1', 'HARD 4  7:1', 'ANY CRAPS 7:1'].forEach((t, i) => x.fillText(t, W / 2, H * (0.25 + i * 0.1)));
  } else if (kind === 'baccarat') {
    x.lineWidth = 3;
    for (let k = 0; k < 7; k++) { const a = Math.PI * (0.15 + k * 0.7 / 6); const px = W / 2 + Math.cos(a) * W * 0.4, py = H * 0.05 + Math.sin(a) * H * 0.7; x.strokeRect(px - 18, py - 12, 36, 24); }
    x.font = `700 ${Math.round(H * 0.07)}px ${SERIF}`;
    x.fillText('BANKER', W / 2, H * 0.48); x.fillText('PLAYER', W / 2, H * 0.66);
    x.font = `600 ${Math.round(H * 0.05)}px system-ui`; x.fillText('TIE PAYS 8 TO 1', W / 2, H * 0.32);
    x.beginPath(); x.arc(W / 2, -H * 0.2, H * 0.62, 0.3, Math.PI - 0.3); x.stroke(); x.beginPath(); x.arc(W / 2, -H * 0.2, H * 0.8, 0.3, Math.PI - 0.3); x.stroke();
  } else if (kind === 'poker') {
    x.lineWidth = 3; x.beginPath(); x.ellipse(W / 2, H / 2, W * 0.36, H * 0.32, 0, 0, TAU); x.stroke();
    x.font = `700 ${Math.round(H * 0.1)}px ${SERIF}`; x.fillText('EAKIN GRAND', W / 2, H * 0.45);
    x.font = `600 ${Math.round(H * 0.055)}px system-ui`; x.fillText("TEXAS HOLD'EM · POKER ROOM", W / 2, H * 0.58);
  }
  return c;
}
/** marquee: "EAKIN GRAND / CASINO" with neon outline on a black sunburst */
export function marqueeSign(W = 1024, H = 256) {
  const c = canvas(W, H), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#120a05'); g.addColorStop(1, '#050302'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.save(); x.translate(W / 2, H * 1.15); for (let k = 0; k < 36; k++) { x.rotate(TAU / 72); x.fillStyle = k % 2 ? 'rgba(217,180,106,.10)' : 'rgba(217,180,106,.03)'; x.beginPath(); x.moveTo(0, 0); x.lineTo(-W * 0.04, -W); x.lineTo(W * 0.04, -W); x.closePath(); x.fill(); } x.restore();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `900 ${Math.round(H * 0.42)}px ${SERIF}`;
  x.shadowColor = '#ff3355'; x.shadowBlur = H * 0.08; x.lineWidth = H * 0.025; x.strokeStyle = '#ff5c74'; x.strokeText('EAKIN GRAND', W / 2, H * 0.4);
  x.shadowBlur = 0; x.fillStyle = gold(x, H * 0.2, H * 0.6); x.fillText('EAKIN GRAND', W / 2, H * 0.4);
  x.font = `700 ${Math.round(H * 0.2)}px ${SERIF}`; x.fillStyle = '#fff3d6'; x.shadowColor = '#ffd27a'; x.shadowBlur = H * 0.06;
  x.fillText('C  A  S  I  N  O', W / 2, H * 0.78); x.shadowBlur = 0;
  x.strokeStyle = '#d9b46a'; x.lineWidth = 4; x.strokeRect(6, 6, W - 12, H - 12);
  return c;
}
/** one sign (text in the current language + optional pictogram) → canvas */
export function signCanvas(text, { W = 512, H = 128, icon = '', sub = '', color = '#f1d58f', bg = '#0d0805' } = {}) {
  const c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#d9b46a'; x.lineWidth = 4; x.strokeRect(5, 5, W - 10, H - 10); x.lineWidth = 1.5; x.strokeRect(12, 12, W - 24, H - 24);
  let tx = W / 2;
  if (icon === 'restroom') { // generic pictograms
    x.fillStyle = color; const ix = H * 0.55;
    for (const [ox, skirt] of [[ix * 0.6, false], [ix * 1.45, true]]) { x.beginPath(); x.arc(ox, H * 0.3, H * 0.08, 0, TAU); x.fill(); if (skirt) { x.beginPath(); x.moveTo(ox, H * 0.4); x.lineTo(ox + H * 0.13, H * 0.68); x.lineTo(ox - H * 0.13, H * 0.68); x.closePath(); x.fill(); x.fillRect(ox - H * 0.06, H * 0.68, H * 0.035, H * 0.14); x.fillRect(ox + H * 0.025, H * 0.68, H * 0.035, H * 0.14); } else { x.fillRect(ox - H * 0.08, H * 0.4, H * 0.16, H * 0.25); x.fillRect(ox - H * 0.07, H * 0.65, H * 0.055, H * 0.17); x.fillRect(ox + H * 0.015, H * 0.65, H * 0.055, H * 0.17); } }
    x.fillRect(ix * 1.02, H * 0.22, 3, H * 0.6);
    tx = W / 2 + H * 0.5;
  }
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color;
  const fs = Math.round(H * (sub ? 0.36 : 0.42)); x.font = `700 ${fs}px ${SERIF}`;
  let s = String(text); while (x.measureText(s).width > W - (icon ? H * 1.6 : 50) && s.length > 3) s = s.slice(0, -1);
  x.shadowColor = color; x.shadowBlur = 10; x.fillText(s, tx, H * (sub ? 0.42 : 0.52)); x.shadowBlur = 0;
  if (sub) { x.font = `600 ${Math.round(H * 0.17)}px system-ui,sans-serif`; x.fillStyle = 'rgba(255,240,210,.85)'; x.fillText(sub, tx, H * 0.76); }
  return c;
}
/** night sky gradient (equirect-ish, used on a dome) */
export function skyGrad(S = 256) {
  const c = canvas(8, S), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#02030a'); g.addColorStop(0.42, '#0a1030'); g.addColorStop(0.5, '#3a2440'); g.addColorStop(0.53, '#1a0f14'); g.addColorStop(1, '#050304');
  x.fillStyle = g; x.fillRect(0, 0, 8, S); return c;
}
/** city skyline windows for the distant buildings */
export function skylineWindows(S = 512) {
  const c = canvas(S), x = c.getContext('2d'); const r = rng(77);
  x.fillStyle = '#07080d'; x.fillRect(0, 0, S, S);
  const cw = S / 32, ch = S / 48;
  for (let i = 0; i < 32; i++) for (let j = 0; j < 48; j++) { const p = r(); if (p < 0.38) { x.fillStyle = p < 0.08 ? '#ffd9a0' : p < 0.2 ? '#f6c46e' : '#b8c8ff'; x.globalAlpha = 0.35 + r() * 0.6; x.fillRect(i * cw + cw * 0.25, j * ch + ch * 0.25, cw * 0.5, ch * 0.5); } }
  x.globalAlpha = 1; return c;
}
/** sports wall: 6 generic animated "screens" (no real teams / logos): racing dots, scoreboards, tickers, charts */
export function drawScreenWall(x, W, H, t) {
  x.fillStyle = '#04060c'; x.fillRect(0, 0, W, H);
  const cols = 3, rows = 2, cw = W / cols, ch = H / rows;
  const teams = [['RED', 'BLUE'], ['GOLD', 'SILVER'], ['NORTH', 'SOUTH'], ['STARS', 'COMETS']];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const k = j * cols + i, x0 = i * cw + 4, y0 = j * ch + 4, w = cw - 8, h = ch - 8;
    x.save(); x.beginPath(); x.rect(x0, y0, w, h); x.clip();
    const bg = x.createLinearGradient(0, y0, 0, y0 + h); bg.addColorStop(0, ['#0b2a4a', '#123d1f', '#3a0d1c', '#1d1440', '#0b3a3a', '#2a2a0b'][k]); bg.addColorStop(1, '#020308'); x.fillStyle = bg; x.fillRect(x0, y0, w, h);
    x.fillStyle = '#fff'; x.textAlign = 'left'; x.textBaseline = 'top'; x.font = `700 ${Math.round(h * 0.09)}px system-ui,sans-serif`;
    if (k === 0 || k === 3) { // horse-race style track with dots
      x.fillText(k === 0 ? 'RACE 4 · DEMO' : 'RACE 7 · DEMO', x0 + 8, y0 + 6);
      for (let l = 0; l < 6; l++) { const yy = y0 + h * 0.25 + l * h * 0.12; x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(x0 + 8, yy + h * 0.05, w - 16, 2); const p = ((t * (0.06 + ((l * 37 + k * 11) % 10) * 0.004) + l * 0.13) % 1); x.fillStyle = ['#ff4d4d', '#4dc3ff', '#ffe14d', '#7dff6a', '#ff7af2', '#ffffff'][l]; x.beginPath(); x.arc(x0 + 12 + p * (w - 24), yy + h * 0.05, h * 0.035, 0, TAU); x.fill(); }
    } else if (k === 1 || k === 4) { // scoreboard
      const tm = teams[(k + Math.floor(t / 20)) % teams.length]; const s1 = Math.floor(t / 7 + k) % 5, s2 = Math.floor(t / 11 + k * 2) % 4;
      x.fillText('LIVE · DEMO FEED', x0 + 8, y0 + 6);
      x.textAlign = 'center'; x.font = `800 ${Math.round(h * 0.16)}px system-ui`; x.fillText(`${tm[0]}  ${s1} – ${s2}  ${tm[1]}`, x0 + w / 2, y0 + h * 0.36);
      x.font = `600 ${Math.round(h * 0.08)}px system-ui`; x.fillStyle = '#ffd84d'; x.fillText(`${String(Math.floor(t / 2) % 90).padStart(2, '0')}:${String(Math.floor(t * 30) % 60).padStart(2, '0')}`, x0 + w / 2, y0 + h * 0.62);
    } else if (k === 2) { // bar chart
      x.fillText('STATS', x0 + 8, y0 + 6);
      for (let b = 0; b < 8; b++) { const v = 0.3 + 0.6 * Math.abs(Math.sin(t * 0.4 + b)); x.fillStyle = b % 2 ? '#4dc3ff' : '#ffd84d'; x.fillRect(x0 + 14 + b * (w - 28) / 8, y0 + h - 12 - v * h * 0.65, (w - 28) / 8 - 6, v * h * 0.65); }
    } else { // ticker + generic ball graphic
      x.fillText('HIGHLIGHTS', x0 + 8, y0 + 6);
      const bx = x0 + w / 2 + Math.sin(t * 1.3) * w * 0.3, by = y0 + h * 0.5 + Math.abs(Math.sin(t * 2.6)) * -h * 0.25 + h * 0.1;
      x.fillStyle = '#ff8a1f'; x.beginPath(); x.arc(bx, by, h * 0.09, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,255,255,.15)'; x.fillRect(x0, y0 + h * 0.72, w, 2);
    }
    x.restore();
    x.strokeStyle = '#222'; x.lineWidth = 6; x.strokeRect(i * cw + 1, j * ch + 1, cw - 2, ch - 2);
  }
  // bottom ticker
  x.fillStyle = 'rgba(0,0,0,.75)'; x.fillRect(0, H - H * 0.07, W, H * 0.07);
  x.fillStyle = '#ffd84d'; x.font = `700 ${Math.round(H * 0.045)}px system-ui`; x.textAlign = 'left'; x.textBaseline = 'middle';
  const msg = 'EAKIN GRAND · ENTERTAINMENT ONLY · PLAY MONEY · 21+ · DEMO GRAPHICS · '; const tw = x.measureText(msg).width; const off = (t * 60) % tw;
  for (let k = -1; k < W / tw + 1; k++) x.fillText(msg, k * tw - off, H - H * 0.035);
}

/* ---------------------------------------------------------------- V10 rev 2: stage, steakhouse, dice, cards */
/** red velvet stage curtain (vertical folds + gold fringe) */
export function curtain(W = 512, H = 512) {
  const c = canvas(W, H), x = c.getContext('2d');
  for (let i = 0; i < W; i++) { const f = 0.5 + 0.5 * Math.sin(i / W * TAU * 9) * 0.8 + 0.2 * Math.sin(i / W * TAU * 23); const l = Math.round(28 + f * 70); x.fillStyle = `rgb(${l + 60},${Math.round(l * 0.12)},${Math.round(l * 0.2)})`; x.fillRect(i, 0, 1, H); }
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(0.2, 'rgba(0,0,0,0)'); g.addColorStop(0.85, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = gold(x, H * 0.94, H); x.fillRect(0, H * 0.95, W, H * 0.05);
  for (let i = 0; i < W; i += 6) { x.fillStyle = '#c9a24a'; x.fillRect(i, H * 0.95, 3, H * 0.05); }
  fiber(x, W, H, 10, 5);
  return c;
}
/** dice atlas: 3 × 2 cells with faces 1…6 (ivory, red pips) */
export function diceAtlas(S = 384) {
  const c = canvas(S, S * 2 / 3), x = c.getContext('2d'); const cs = S / 3;
  const P = { 1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]], 4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]], 5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]], 6: [[0.27, 0.23], [0.73, 0.23], [0.27, 0.5], [0.73, 0.5], [0.27, 0.77], [0.73, 0.77]] };
  for (let v = 1; v <= 6; v++) {
    const ox = ((v - 1) % 3) * cs, oy = Math.floor((v - 1) / 3) * cs;
    const g = x.createRadialGradient(ox + cs / 2, oy + cs / 2, cs * 0.1, ox + cs / 2, oy + cs / 2, cs * 0.75); g.addColorStop(0, '#d6203a'); g.addColorStop(1, '#8a0c1c');
    x.fillStyle = g; x.fillRect(ox, oy, cs, cs);
    for (const [px, py] of P[v]) { x.beginPath(); x.arc(ox + px * cs, oy + py * cs, cs * 0.085, 0, TAU); x.fillStyle = '#fbf6ea'; x.fill(); }
  }
  return c;
}
/** playing-card atlas for the 3D tables: 4 × 2 cells — 7 face cards + 1 back */
export function cardAtlas(W = 512) {
  const H = W, c = canvas(W, H), x = c.getContext('2d'); const cw = W / 4, ch = H / 2;
  const faces = [['A', '♠', '#111'], ['K', '♥', '#b3141f'], ['7', '♣', '#111'], ['10', '♦', '#b3141f'], ['Q', '♠', '#111'], ['9', '♥', '#b3141f'], ['J', '♦', '#b3141f']];
  faces.forEach(([r, s, col], i) => {
    const ox = (i % 4) * cw, oy = Math.floor(i / 4) * ch;
    x.fillStyle = '#fdfaf2'; x.fillRect(ox + 2, oy + 2, cw - 4, ch - 4);
    x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 ${Math.round(cw * 0.26)}px Georgia,serif`; x.fillText(r, ox + cw * 0.22, oy + ch * 0.13);
    x.font = `${Math.round(cw * 0.22)}px Georgia,serif`; x.fillText(s, ox + cw * 0.22, oy + ch * 0.27);
    x.font = `${Math.round(cw * 0.55)}px Georgia,serif`; x.fillText(s, ox + cw / 2, oy + ch * 0.58);
  });
  const ox = 3 * cw, oy = ch; x.fillStyle = '#7a1222'; x.fillRect(ox + 2, oy + 2, cw - 4, ch - 4);
  x.strokeStyle = '#f1d58f'; x.lineWidth = 3; x.strokeRect(ox + 10, oy + 10, cw - 20, ch - 20);
  for (let k = 0; k < 14; k++) { x.strokeStyle = 'rgba(241,213,143,.35)'; x.beginPath(); x.moveTo(ox + 10, oy + 10 + k * ch / 14); x.lineTo(ox + cw - 10, oy + 10 + (k + 3) * ch / 14); x.stroke(); }
  return c;
}
/** steakhouse frosted-glass door panel with warm interior glow */
export function steakGlass(W = 256, H = 512) {
  const c = canvas(W, H), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#5a3418'); g.addColorStop(0.5, '#c8833a'); g.addColorStop(1, '#3a1c0a'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.globalAlpha = 0.5; for (let i = 0; i < 6; i++) { x.fillStyle = '#ffe2a8'; x.beginPath(); x.ellipse(W * (0.2 + (i % 3) * 0.3), H * (0.25 + Math.floor(i / 3) * 0.3), W * 0.08, H * 0.03, 0, 0, TAU); x.fill(); } x.globalAlpha = 1;
  x.strokeStyle = '#d9b46a'; x.lineWidth = 6; x.strokeRect(8, 8, W - 16, H - 16);
  for (let k = 1; k < 4; k++) { x.lineWidth = 3; x.beginPath(); x.moveTo(W / 2, H * 0.1); x.lineTo(W * k / 4, H * 0.9); x.stroke(); }
  return c;
}

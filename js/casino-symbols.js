// casino-symbols.js — V10 CASINO: original vector slot symbols (canvas 2D, no images / fonts / emoji), used by the
// slot overlay and the animated screens of the 3D slot cabinets. Themes: hollywood ("Silver Screen Nights" film set),
// gold ("Ohio Gold Rush" prospectors), buckeye ("Buckeye Jackpot" Ohio fair), classic ("Marquee 7s" 3-reel).
import { THEMES, CLASSIC, CLASSIC_KEY } from './casino-slots.js';

const TAU = Math.PI * 2;
const SERIF = "Didot,'Bodoni 72','Bodoni MT',Georgia,'Times New Roman',serif";
function grad(ctx, x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
function rgrad(ctx, x, y, r0, r1, stops) { const g = ctx.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
const GOLD = [[0, '#fff6cf'], [0.35, '#f1cf72'], [0.7, '#c18f2c'], [1, '#7a5214']];
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function star(ctx, cx, cy, n, r1, r2, rot = -Math.PI / 2) { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = rot + i * Math.PI / n; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.closePath(); }
function ribbon(ctx, s, text, fill = '#8a1c1c', ink = '#fff3c9') {
  const w = s * 0.78, h = s * 0.17, x = (s - w) / 2, y = s * 0.78;
  ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(x - s * 0.05, y); ctx.lineTo(x + w + s * 0.05, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w + s * 0.05, y + h); ctx.lineTo(x - s * 0.05, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#f1cf72'; ctx.lineWidth = s * 0.012; ctx.stroke();
  ctx.fillStyle = ink; ctx.font = `800 ${Math.round(s * 0.11)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, s / 2, y + h / 2 + s * 0.005);
}
function glow(ctx, color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
function noGlow(ctx) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }

function letter(ctx, s, ch, th) {
  const pal = { hollywood: [['#fff7d6', '#e7c06a', '#9a6a1e'], '#2a1405'], gold: [['#fffbe6', '#f2c14e', '#8a5a12'], '#2a1704'], screen: [['#fff7d6', '#e7c06a', '#9a6a1e'], '#2a1405'], ocean: [['#e6fffb', '#5fe0d0', '#167c80'], '#062a33'], neon: [['#fff', '#ff7ac6', '#a3126b'], '#1a0626'] }[th] || [['#fff', '#ccc', '#888'], '#000'];
  const t = ch === 'T' ? '10' : ch;
  ctx.font = `900 ${Math.round(s * (t === '10' ? 0.56 : 0.66))}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = s * 0.07; ctx.strokeStyle = pal[1]; ctx.strokeText(t, s / 2, s * 0.53);
  ctx.fillStyle = grad(ctx, 0, s * 0.2, 0, s * 0.85, [[0, pal[0][0]], [0.5, pal[0][1]], [1, pal[0][2]]]);
  glow(ctx, 'rgba(0,0,0,.4)', s * 0.04); ctx.fillText(t, s / 2, s * 0.53); noGlow(ctx);
  ctx.lineWidth = s * 0.012; ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.strokeText(t, s / 2, s * 0.53);
}

const P = {
  wild_star(ctx, s) {
    glow(ctx, 'rgba(255,210,90,.9)', s * 0.12);
    star(ctx, s / 2, s * 0.44, 5, s * 0.38, s * 0.16); ctx.fillStyle = grad(ctx, s * 0.2, s * 0.1, s * 0.8, s * 0.8, GOLD); ctx.fill(); noGlow(ctx);
    ctx.lineWidth = s * 0.02; ctx.strokeStyle = '#6b4510'; ctx.stroke();
    star(ctx, s / 2, s * 0.44, 5, s * 0.22, s * 0.09); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
    ribbon(ctx, s, 'WILD');
  },
  scatter_reel(ctx, s) {
    const cx = s / 2, cy = s * 0.43, R = s * 0.33;
    ctx.fillStyle = '#2a2a2e'; ctx.fillRect(cx, cy + R * 0.55, s * 0.42, s * 0.12);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = '#e8e8e8'; ctx.fillRect(cx + s * 0.05 + i * s * 0.075, cy + R * 0.57, s * 0.035, s * 0.03); ctx.fillRect(cx + s * 0.05 + i * s * 0.075, cy + R * 0.57 + s * 0.075, s * 0.035, s * 0.03); }
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fillStyle = rgrad(ctx, cx - R * 0.3, cy - R * 0.3, R * 0.1, R * 1.1, [[0, '#ffffff'], [0.5, '#b9bec7'], [1, '#5b616b']]); ctx.fill();
    ctx.lineWidth = s * 0.02; ctx.strokeStyle = '#3a3f47'; ctx.stroke();
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.58, cy + Math.sin(a) * R * 0.58, R * 0.2, 0, TAU); ctx.fillStyle = '#1b1d22'; ctx.fill(); }
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.14, 0, TAU); ctx.fillStyle = '#d9b46a'; ctx.fill();
    ribbon(ctx, s, 'SCATTER', '#1d3f7a');
  },
  clapper(ctx, s) {
    const x = s * 0.18, y = s * 0.38, w = s * 0.64, h = s * 0.44;
    ctx.fillStyle = '#18181b'; rr(ctx, x, y, w, h, s * 0.03); ctx.fill(); ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = s * 0.012; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = s * 0.01; for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + s * 0.03, y + i * h / 3); ctx.lineTo(x + w - s * 0.03, y + i * h / 3); ctx.stroke(); }
    ctx.fillStyle = '#e7c06a'; ctx.font = `800 ${Math.round(s * 0.08)}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TAKE 1', s / 2, y + h * 0.18);
    ctx.save(); ctx.translate(x, y - s * 0.02); ctx.rotate(-0.32);
    ctx.fillStyle = '#18181b'; ctx.fillRect(0, -s * 0.11, w, s * 0.11);
    ctx.fillStyle = '#f2f2f2'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(i * w / 6 + s * 0.02, -s * 0.11); ctx.lineTo(i * w / 6 + s * 0.07, -s * 0.11); ctx.lineTo(i * w / 6 + s * 0.04, 0); ctx.lineTo(i * w / 6 - s * 0.01, 0); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = '#18181b'; ctx.fillRect(x, y - s * 0.09, w, s * 0.08);
    ctx.fillStyle = '#f2f2f2'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x + i * w / 6 + s * 0.02, y - s * 0.09); ctx.lineTo(x + i * w / 6 + s * 0.07, y - s * 0.09); ctx.lineTo(x + i * w / 6 + s * 0.04, y - s * 0.01); ctx.lineTo(x + i * w / 6 - s * 0.01, y - s * 0.01); ctx.closePath(); ctx.fill(); }
  },
  camera(ctx, s) {
    const body = grad(ctx, 0, s * 0.4, 0, s * 0.8, [[0, '#4a4a52'], [1, '#141418']]);
    for (const [cx, r] of [[s * 0.33, s * 0.15], [s * 0.6, s * 0.13]]) { ctx.beginPath(); ctx.arc(cx, s * 0.3, r, 0, TAU); ctx.fillStyle = '#26262c'; ctx.fill(); ctx.lineWidth = s * 0.015; ctx.strokeStyle = '#c9a24a'; ctx.stroke(); for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.4; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.55, s * 0.3 + Math.sin(a) * r * 0.55, r * 0.18, 0, TAU); ctx.fillStyle = '#0b0b0d'; ctx.fill(); } }
    rr(ctx, s * 0.16, s * 0.45, s * 0.5, s * 0.3, s * 0.04); ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = s * 0.012; ctx.stroke();
    ctx.fillStyle = grad(ctx, 0, s * 0.5, 0, s * 0.7, [[0, '#6a6a72'], [1, '#202024']]); ctx.beginPath(); ctx.moveTo(s * 0.66, s * 0.52); ctx.lineTo(s * 0.86, s * 0.47); ctx.lineTo(s * 0.86, s * 0.73); ctx.lineTo(s * 0.66, s * 0.68); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.86, s * 0.6, s * 0.04, s * 0.13, 0, 0, TAU); ctx.fillStyle = rgrad(ctx, s * 0.86, s * 0.57, 1, s * 0.13, [[0, '#9fd3ff'], [0.4, '#2a5d8a'], [1, '#0a1620']]); ctx.fill();
    ctx.fillStyle = '#26262c'; ctx.fillRect(s * 0.33, s * 0.75, s * 0.06, s * 0.1); ctx.fillRect(s * 0.25, s * 0.84, s * 0.22, s * 0.03);
  },
  chair(ctx, s) {
    ctx.strokeStyle = '#7a4a1c'; ctx.lineWidth = s * 0.045; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s * 0.25, s * 0.86); ctx.lineTo(s * 0.72, s * 0.56); ctx.moveTo(s * 0.75, s * 0.86); ctx.lineTo(s * 0.28, s * 0.56); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.27, s * 0.56); ctx.lineTo(s * 0.27, s * 0.14); ctx.moveTo(s * 0.73, s * 0.56); ctx.lineTo(s * 0.73, s * 0.14); ctx.stroke();
    ctx.fillStyle = grad(ctx, 0, s * 0.16, 0, s * 0.38, [[0, '#c3262f'], [1, '#7c0f17']]); rr(ctx, s * 0.24, s * 0.16, s * 0.52, s * 0.2, s * 0.02); ctx.fill();
    ctx.fillStyle = '#f1cf72'; ctx.font = `800 ${Math.round(s * 0.085)}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('DIRECTOR', s / 2, s * 0.265);
    ctx.fillStyle = grad(ctx, 0, s * 0.5, 0, s * 0.6, [[0, '#c3262f'], [1, '#7c0f17']]); ctx.fillRect(s * 0.24, s * 0.5, s * 0.52, s * 0.08);
    ctx.lineWidth = s * 0.03; ctx.beginPath(); ctx.moveTo(s * 0.2, s * 0.46); ctx.lineTo(s * 0.8, s * 0.46); ctx.stroke();
  },
  popcorn(ctx, s) {
    const top = s * 0.42, bot = s * 0.88;
    for (let i = 0; i < 16; i++) { const a = i * 1.7, x = s * 0.5 + Math.cos(a) * s * (0.08 + (i % 4) * 0.05), y = top - s * 0.02 - Math.abs(Math.sin(a * 1.3)) * s * 0.16; ctx.beginPath(); ctx.arc(x, y, s * (0.06 + (i % 3) * 0.012), 0, TAU); ctx.fillStyle = i % 5 === 0 ? '#ffe28a' : '#fff8e6'; ctx.fill(); ctx.strokeStyle = 'rgba(180,140,60,.5)'; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.save(); ctx.beginPath(); ctx.moveTo(s * 0.26, top); ctx.lineTo(s * 0.74, top); ctx.lineTo(s * 0.66, bot); ctx.lineTo(s * 0.34, bot); ctx.closePath(); ctx.clip();
    for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#d0202c'; ctx.beginPath(); ctx.moveTo(s * (0.26 + i * 0.07), top); ctx.lineTo(s * (0.33 + i * 0.07), top); ctx.lineTo(s * (0.39 + i * 0.045), bot); ctx.lineTo(s * (0.34 + i * 0.045), bot); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = '#7a1018'; ctx.lineWidth = s * 0.015; ctx.beginPath(); ctx.moveTo(s * 0.26, top); ctx.lineTo(s * 0.74, top); ctx.lineTo(s * 0.66, bot); ctx.lineTo(s * 0.34, bot); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = '#f1cf72'; ctx.fillRect(s * 0.27, top, s * 0.46, s * 0.05);
  },
  ticket(ctx, s) {
    ctx.save(); ctx.translate(s / 2, s / 2); ctx.rotate(-0.18);
    const w = s * 0.74, h = s * 0.42, n = s * 0.07;
    ctx.beginPath(); ctx.moveTo(-w / 2 + n, -h / 2); ctx.lineTo(w / 2 - n, -h / 2); ctx.arc(w / 2, -h / 2, n, Math.PI, Math.PI / 2, true); ctx.lineTo(w / 2, h / 2 - n); ctx.arc(w / 2, h / 2, n, -Math.PI / 2, Math.PI, true); ctx.lineTo(-w / 2 + n, h / 2); ctx.arc(-w / 2, h / 2, n, 0, -Math.PI / 2, true); ctx.lineTo(-w / 2, -h / 2 + n); ctx.arc(-w / 2, -h / 2, n, Math.PI / 2, 0, true); ctx.closePath();
    ctx.fillStyle = grad(ctx, -w / 2, -h / 2, w / 2, h / 2, GOLD); ctx.fill(); ctx.strokeStyle = '#7a5214'; ctx.lineWidth = s * 0.012; ctx.stroke();
    ctx.setLineDash([s * 0.02, s * 0.015]); ctx.beginPath(); ctx.moveTo(w * 0.22, -h / 2 + 4); ctx.lineTo(w * 0.22, h / 2 - 4); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#5a1010'; ctx.font = `800 ${Math.round(s * 0.085)}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ADMIT', -w * 0.12, -h * 0.13); ctx.fillText('ONE', -w * 0.12, h * 0.15);
    star(ctx, w * 0.36, 0, 5, s * 0.06, s * 0.025); ctx.fill();
    ctx.restore();
  },
  wild_diamond(ctx, s) {
    const cx = s / 2, top = s * 0.18, mid = s * 0.36, bot = s * 0.74, w = s * 0.36;
    glow(ctx, 'rgba(80,230,255,.95)', s * 0.14);
    ctx.beginPath(); ctx.moveTo(cx - w * 0.55, top); ctx.lineTo(cx + w * 0.55, top); ctx.lineTo(cx + w, mid); ctx.lineTo(cx, bot); ctx.lineTo(cx - w, mid); ctx.closePath();
    ctx.fillStyle = grad(ctx, cx - w, top, cx + w, bot, [[0, '#e9feff'], [0.45, '#55dfff'], [1, '#0a6f9a']]); ctx.fill(); noGlow(ctx);
    ctx.strokeStyle = '#eaffff'; ctx.lineWidth = s * 0.012; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - w, mid); ctx.lineTo(cx + w, mid); ctx.moveTo(cx - w * 0.55, top); ctx.lineTo(cx - w * 0.25, mid); ctx.lineTo(cx, bot); ctx.lineTo(cx + w * 0.25, mid); ctx.lineTo(cx + w * 0.55, top); ctx.moveTo(cx - w * 0.25, mid); ctx.lineTo(cx, top); ctx.lineTo(cx + w * 0.25, mid); ctx.stroke();
    ribbon(ctx, s, 'WILD', '#8a1060');
  },
  scatter_bell(ctx, s) {
    const cx = s / 2;
    glow(ctx, 'rgba(255,200,60,.8)', s * 0.1);
    ctx.beginPath(); ctx.moveTo(cx, s * 0.12); ctx.bezierCurveTo(cx + s * 0.2, s * 0.12, cx + s * 0.2, s * 0.35, cx + s * 0.24, s * 0.55); ctx.quadraticCurveTo(cx + s * 0.3, s * 0.66, cx + s * 0.34, s * 0.68); ctx.lineTo(cx - s * 0.34, s * 0.68); ctx.quadraticCurveTo(cx - s * 0.3, s * 0.66, cx - s * 0.24, s * 0.55); ctx.bezierCurveTo(cx - s * 0.2, s * 0.35, cx - s * 0.2, s * 0.12, cx, s * 0.12); ctx.closePath();
    ctx.fillStyle = grad(ctx, cx - s * 0.3, 0, cx + s * 0.3, 0, [[0, '#8a5a12'], [0.35, '#ffe9a0'], [0.6, '#e4b042'], [1, '#7a4a0a']]); ctx.fill(); noGlow(ctx);
    ctx.beginPath(); ctx.arc(cx, s * 0.7, s * 0.06, 0, TAU); ctx.fillStyle = '#b07a1c'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, s * 0.11, s * 0.035, 0, TAU); ctx.fill();
    ribbon(ctx, s, 'SCATTER', '#1d3f7a');
  },
  seven(ctx, s) {
    ctx.font = `900 ${Math.round(s * 0.8)}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    glow(ctx, 'rgba(255,40,80,.9)', s * 0.12);
    ctx.lineWidth = s * 0.08; ctx.strokeStyle = '#ffd66b'; ctx.strokeText('7', s / 2, s * 0.53);
    ctx.fillStyle = grad(ctx, 0, s * 0.15, 0, s * 0.9, [[0, '#ff7a85'], [0.5, '#e01026'], [1, '#7a0010']]); ctx.fillText('7', s / 2, s * 0.53); noGlow(ctx);
    ctx.lineWidth = s * 0.015; ctx.strokeStyle = '#fff1c4'; ctx.strokeText('7', s / 2, s * 0.53);
  },
  bar3(ctx, s) { bars(ctx, s, 3); }, bar2(ctx, s) { bars(ctx, s, 2); }, bar1(ctx, s) { bars(ctx, s, 1); },
  melon(ctx, s) {
    ctx.save(); ctx.translate(s / 2, s * 0.36);
    ctx.beginPath(); ctx.arc(0, 0, s * 0.38, 0.05, Math.PI - 0.05); ctx.closePath(); ctx.fillStyle = '#1f8f3a'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, s * 0.33, 0.05, Math.PI - 0.05); ctx.closePath(); ctx.fillStyle = '#f2f7d0'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0.05, Math.PI - 0.05); ctx.closePath(); ctx.fillStyle = rgrad(ctx, 0, 0, 2, s * 0.3, [[0, '#ff5a6e'], [1, '#d0182f']]); ctx.fill();
    ctx.fillStyle = '#1a1a1a'; for (let i = 0; i < 7; i++) { const a = 0.35 + i * 0.35; ctx.beginPath(); ctx.ellipse(Math.cos(a) * s * 0.18, Math.sin(a) * s * 0.18, s * 0.018, s * 0.03, a, 0, TAU); ctx.fill(); }
    ctx.restore();
  },
  grapes(ctx, s) {
    const pts = [[0.38, 0.38], [0.5, 0.36], [0.62, 0.38], [0.44, 0.5], [0.56, 0.5], [0.38, 0.62], [0.5, 0.63], [0.62, 0.62], [0.44, 0.74], [0.56, 0.74], [0.5, 0.85]];
    ctx.fillStyle = '#2f9a3a'; ctx.beginPath(); ctx.ellipse(s * 0.62, s * 0.22, s * 0.14, s * 0.07, -0.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#6b4a1c'; ctx.lineWidth = s * 0.025; ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.3); ctx.lineTo(s * 0.52, s * 0.14); ctx.stroke();
    for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(s * x, s * y, s * 0.075, 0, TAU); ctx.fillStyle = rgrad(ctx, s * x - s * 0.025, s * y - s * 0.025, 1, s * 0.08, [[0, '#d8a5ff'], [0.5, '#7b2dbf'], [1, '#3d0a6b']]); ctx.fill(); }
  },
  plum(ctx, s) {
    ctx.fillStyle = '#2f9a3a'; ctx.beginPath(); ctx.ellipse(s * 0.6, s * 0.2, s * 0.13, s * 0.06, -0.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s / 2, s * 0.55, s * 0.3, s * 0.32, 0, 0, TAU); ctx.fillStyle = rgrad(ctx, s * 0.4, s * 0.45, 2, s * 0.36, [[0, '#e49bff'], [0.45, '#8a2fb0'], [1, '#3a0753']]); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = s * 0.015; ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.26); ctx.quadraticCurveTo(s * 0.44, s * 0.55, s * 0.5, s * 0.86); ctx.stroke();
  },
  lemon(ctx, s) {
    ctx.save(); ctx.translate(s / 2, s / 2); ctx.rotate(-0.3);
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.33, s * 0.24, 0, 0, TAU); ctx.fillStyle = rgrad(ctx, -s * 0.1, -s * 0.08, 2, s * 0.36, [[0, '#fffbd0'], [0.5, '#ffe14a'], [1, '#c79a00']]); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.34, 0, s * 0.05, s * 0.035, 0, 0, TAU); ctx.ellipse(-s * 0.34, 0, s * 0.05, s * 0.035, 0, 0, TAU); ctx.fillStyle = '#e8c21a'; ctx.fill();
    ctx.restore();
  },
  cherry(ctx, s) {
    ctx.strokeStyle = '#3f7a22'; ctx.lineWidth = s * 0.03; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s * 0.34, s * 0.62); ctx.quadraticCurveTo(s * 0.42, s * 0.3, s * 0.6, s * 0.16); ctx.moveTo(s * 0.66, s * 0.6); ctx.quadraticCurveTo(s * 0.62, s * 0.34, s * 0.6, s * 0.16); ctx.stroke();
    ctx.fillStyle = '#2f9a3a'; ctx.beginPath(); ctx.ellipse(s * 0.7, s * 0.16, s * 0.12, s * 0.05, 0.3, 0, TAU); ctx.fill();
    for (const x of [0.33, 0.66]) { ctx.beginPath(); ctx.arc(s * x, s * 0.68, s * 0.16, 0, TAU); ctx.fillStyle = rgrad(ctx, s * x - s * 0.05, s * 0.62, 1, s * 0.17, [[0, '#ff8a95'], [0.5, '#d4101f'], [1, '#6a0008']]); ctx.fill(); }
  },
  wild_chest(ctx, s) {
    glow(ctx, 'rgba(255,210,90,.9)', s * 0.1);
    ctx.fillStyle = grad(ctx, 0, s * 0.42, 0, s * 0.78, [[0, '#8a5022'], [1, '#4a2509']]); ctx.fillRect(s * 0.16, s * 0.42, s * 0.68, s * 0.34); noGlow(ctx);
    ctx.beginPath(); ctx.moveTo(s * 0.16, s * 0.42); ctx.quadraticCurveTo(s * 0.5, s * 0.1, s * 0.84, s * 0.42); ctx.closePath(); ctx.fillStyle = grad(ctx, 0, s * 0.2, 0, s * 0.42, [[0, '#a8662c'], [1, '#5a2e0c']]); ctx.fill();
    // coins spilling
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(s * (0.28 + i * 0.075), s * (0.42 - (i % 2) * 0.03), s * 0.05, s * 0.025, 0, 0, TAU); ctx.fillStyle = grad(ctx, 0, s * 0.38, 0, s * 0.45, GOLD); ctx.fill(); }
    ctx.fillStyle = grad(ctx, 0, 0, s, 0, GOLD);
    for (const x of [0.22, 0.47, 0.72]) ctx.fillRect(s * x, s * 0.42, s * 0.06, s * 0.34);
    ctx.fillRect(s * 0.16, s * 0.4, s * 0.68, s * 0.04);
    rr(ctx, s * 0.44, s * 0.5, s * 0.12, s * 0.12, s * 0.02); ctx.fill(); ctx.fillStyle = '#2a1405'; ctx.fillRect(s * 0.49, s * 0.54, s * 0.02, s * 0.05);
    ribbon(ctx, s, 'WILD', '#0e5a63');
  },
  scatter_pearl(ctx, s) {
    ctx.save(); ctx.translate(s / 2, s * 0.56);
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-s * 0.32, 0); ctx.quadraticCurveTo(0, sgn * s * 0.38, s * 0.32, 0); ctx.closePath(); ctx.fillStyle = grad(ctx, 0, -s * 0.3, 0, s * 0.3, [[0, '#ffd9e6'], [0.5, '#f29ab8'], [1, '#b5537a']]); ctx.fill(); ctx.strokeStyle = '#7a2a4a'; ctx.lineWidth = s * 0.01; ctx.stroke(); }
    ctx.restore();
    glow(ctx, 'rgba(255,255,255,.95)', s * 0.12);
    ctx.beginPath(); ctx.arc(s / 2, s * 0.5, s * 0.13, 0, TAU); ctx.fillStyle = rgrad(ctx, s * 0.46, s * 0.46, 1, s * 0.14, [[0, '#ffffff'], [0.6, '#e8eef7'], [1, '#a9b6c9']]); ctx.fill(); noGlow(ctx);
    ribbon(ctx, s, 'SCATTER', '#1d3f7a');
  },
  anchor(ctx, s) {
    ctx.strokeStyle = grad(ctx, 0, 0, s, s, GOLD); ctx.lineWidth = s * 0.065; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(s / 2, s * 0.2, s * 0.07, 0, TAU); ctx.moveTo(s / 2, s * 0.27); ctx.lineTo(s / 2, s * 0.82); ctx.moveTo(s * 0.32, s * 0.38); ctx.lineTo(s * 0.68, s * 0.38);
    ctx.moveTo(s * 0.2, s * 0.6); ctx.quadraticCurveTo(s * 0.26, s * 0.84, s / 2, s * 0.84); ctx.quadraticCurveTo(s * 0.74, s * 0.84, s * 0.8, s * 0.6); ctx.stroke();
    ctx.fillStyle = '#f1cf72'; for (const x of [0.2, 0.8]) { ctx.beginPath(); ctx.moveTo(s * x - s * 0.06, s * 0.62); ctx.lineTo(s * x, s * 0.5); ctx.lineTo(s * x + s * 0.06, s * 0.62); ctx.closePath(); ctx.fill(); }
  },
  wheel(ctx, s) {
    const cx = s / 2, cy = s / 2;
    ctx.strokeStyle = '#7a4a1c'; ctx.lineWidth = s * 0.045; ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * s * 0.08, cy + Math.sin(a) * s * 0.08); ctx.lineTo(cx + Math.cos(a) * s * 0.42, cy + Math.sin(a) * s * 0.42); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.28, 0, TAU); ctx.lineWidth = s * 0.06; ctx.strokeStyle = '#9a5f26'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.1, 0, TAU); ctx.fillStyle = grad(ctx, 0, cy - 10, 0, cy + 10, GOLD); ctx.fill();
  },
  shell(ctx, s) {
    ctx.save(); ctx.translate(s / 2, s * 0.8);
    ctx.beginPath(); ctx.moveTo(0, 0); for (let i = 0; i <= 8; i++) { const a = Math.PI + i * Math.PI / 8; ctx.quadraticCurveTo(Math.cos(a - Math.PI / 16) * s * 0.48, Math.sin(a - Math.PI / 16) * s * 0.52 - s * 0.05, Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.46 - s * 0.05); }
    ctx.closePath(); ctx.fillStyle = grad(ctx, 0, -s * 0.5, 0, 0, [[0, '#ffe9d2'], [0.6, '#f4b07a'], [1, '#c8662c']]); ctx.fill();
    ctx.strokeStyle = 'rgba(140,60,20,.6)'; ctx.lineWidth = s * 0.012; for (let i = 0; i <= 8; i++) { const a = Math.PI + i * Math.PI / 8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.46 - s * 0.05); ctx.stroke(); }
    ctx.fillStyle = '#e09a5c'; ctx.fillRect(-s * 0.08, -s * 0.02, s * 0.16, s * 0.06);
    ctx.restore();
  },
  starfish(ctx, s) {
    star(ctx, s / 2, s * 0.53, 5, s * 0.4, s * 0.17); ctx.fillStyle = rgrad(ctx, s / 2, s / 2, 2, s * 0.4, [[0, '#ffd2a0'], [0.5, '#ff8a3a'], [1, '#c4400a']]); ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineWidth = s * 0.02; ctx.strokeStyle = '#8a2a00'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,210,.8)'; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(s / 2 + Math.cos(a) * s * 0.09 * k, s * 0.53 + Math.sin(a) * s * 0.09 * k, s * 0.018, 0, TAU); ctx.fill(); } }
  },
  fish(ctx, s) {
    ctx.save(); ctx.translate(s / 2, s / 2);
    ctx.beginPath(); ctx.moveTo(s * 0.22, 0); ctx.lineTo(s * 0.42, -s * 0.18); ctx.lineTo(s * 0.42, s * 0.18); ctx.closePath(); ctx.fillStyle = '#ff9a1f'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(-s * 0.04, 0, s * 0.3, s * 0.2, 0, 0, TAU); ctx.fillStyle = grad(ctx, 0, -s * 0.2, 0, s * 0.2, [[0, '#ffd27a'], [0.5, '#ff8a1a'], [1, '#c24a00']]); ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = '#fff'; for (const x of [-0.14, 0.06]) ctx.fillRect(s * x, -s * 0.22, s * 0.06, s * 0.44); ctx.restore();
    ctx.beginPath(); ctx.arc(-s * 0.2, -s * 0.05, s * 0.04, 0, TAU); ctx.fillStyle = '#111'; ctx.fill();
    ctx.restore();
  },
};
/* ---------------------------------------------------------------- Ohio Gold Rush / Buckeye Jackpot / Marquee 7s */
function nugget(ctx, cx, cy, r, seed = 1) {
  ctx.beginPath(); const n = 11; for (let i = 0; i <= n; i++) { const a = i / n * TAU, k = 0.78 + 0.22 * Math.abs(Math.sin(i * 2.3 + seed)); const x = cx + Math.cos(a) * r * k * 1.15, y = cy + Math.sin(a) * r * k * 0.85; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath();
}
Object.assign(P, {
  wild_nugget(ctx, s) {
    glow(ctx, 'rgba(255,205,70,.95)', s * 0.13);
    nugget(ctx, s / 2, s * 0.43, s * 0.3, 0.4); ctx.fillStyle = rgrad(ctx, s * 0.4, s * 0.33, s * 0.02, s * 0.36, [[0, '#fff8d0'], [0.35, '#f6cf55'], [0.75, '#c08a1e'], [1, '#6b4208']]); ctx.fill(); noGlow(ctx);
    ctx.lineWidth = s * 0.015; ctx.strokeStyle = '#5a3606'; ctx.stroke();
    for (const [x, y, r] of [[0.4, 0.36, 0.05], [0.58, 0.47, 0.04], [0.47, 0.52, 0.03], [0.62, 0.34, 0.025]]) { ctx.beginPath(); ctx.arc(s * x, s * y, s * r, 0, TAU); ctx.fillStyle = 'rgba(255,255,240,.55)'; ctx.fill(); }
    ribbon(ctx, s, 'WILD', '#6b3a12');
  },
  scatter_pan(ctx, s) {
    const cx = s / 2, cy = s * 0.44;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.25);
    ctx.fillStyle = '#4a3a2a'; ctx.fillRect(s * 0.28, -s * 0.04, s * 0.2, s * 0.08);
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.33, s * 0.24, 0, 0, TAU); ctx.fillStyle = grad(ctx, -s * 0.3, -s * 0.2, s * 0.3, s * 0.2, [[0, '#9aa0a8'], [0.5, '#5b616b'], [1, '#2a2e34']]); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.25, s * 0.17, 0, 0, TAU); ctx.fillStyle = grad(ctx, 0, -s * 0.17, 0, s * 0.17, [[0, '#3c6f86'], [1, '#1c3a4a']]); ctx.fill();
    for (let i = 0; i < 7; i++) { nugget(ctx, Math.cos(i * 2.1) * s * 0.12, Math.sin(i * 1.7) * s * 0.07, s * (0.03 + (i % 3) * 0.008), i); ctx.fillStyle = i % 2 ? '#ffd76a' : '#f2b632'; ctx.fill(); }
    ctx.restore();
    ribbon(ctx, s, 'SCATTER', '#1d3f7a');
  },
  cart(ctx, s) {
    for (let i = 0; i < 6; i++) { nugget(ctx, s * (0.32 + i * 0.075), s * (0.36 - (i % 2) * 0.04), s * 0.07, i); ctx.fillStyle = grad(ctx, 0, s * 0.25, 0, s * 0.45, [[0, '#fff2b0'], [1, '#c48a1a']]); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(s * 0.16, s * 0.38); ctx.lineTo(s * 0.84, s * 0.38); ctx.lineTo(s * 0.76, s * 0.7); ctx.lineTo(s * 0.24, s * 0.7); ctx.closePath();
    ctx.fillStyle = grad(ctx, 0, s * 0.38, 0, s * 0.7, [[0, '#8a5a2a'], [1, '#4a2a10']]); ctx.fill(); ctx.lineWidth = s * 0.02; ctx.strokeStyle = '#2a1606'; ctx.stroke();
    ctx.strokeStyle = '#a8a8b0'; ctx.lineWidth = s * 0.025; for (const y of [0.46, 0.62]) { ctx.beginPath(); ctx.moveTo(s * (0.18 + (y - 0.38) * 0.25), s * y); ctx.lineTo(s * (0.82 - (y - 0.38) * 0.25), s * y); ctx.stroke(); }
    for (const x of [0.33, 0.67]) { ctx.beginPath(); ctx.arc(s * x, s * 0.76, s * 0.075, 0, TAU); ctx.fillStyle = '#2a2a30'; ctx.fill(); ctx.lineWidth = s * 0.02; ctx.strokeStyle = '#c9a24a'; ctx.stroke(); }
    ctx.fillStyle = '#5a4a3a'; ctx.fillRect(s * 0.08, s * 0.84, s * 0.84, s * 0.03);
  },
  lantern(ctx, s) {
    const cx = s / 2;
    ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = s * 0.025; ctx.beginPath(); ctx.arc(cx, s * 0.2, s * 0.1, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#3a3a42'; rr(ctx, cx - s * 0.16, s * 0.2, s * 0.32, s * 0.08, s * 0.02); ctx.fill();
    glow(ctx, 'rgba(255,190,60,1)', s * 0.18);
    ctx.beginPath(); ctx.moveTo(cx - s * 0.14, s * 0.28); ctx.lineTo(cx + s * 0.14, s * 0.28); ctx.lineTo(cx + s * 0.17, s * 0.68); ctx.lineTo(cx - s * 0.17, s * 0.68); ctx.closePath();
    ctx.fillStyle = rgrad(ctx, cx, s * 0.5, s * 0.02, s * 0.22, [[0, '#fffbe0'], [0.4, '#ffcf55'], [1, '#c26a10']]); ctx.fill(); noGlow(ctx);
    ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = s * 0.02; ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx, s * 0.28); ctx.lineTo(cx, s * 0.68); ctx.stroke();
    ctx.fillStyle = '#3a3a42'; rr(ctx, cx - s * 0.2, s * 0.68, s * 0.4, s * 0.1, s * 0.02); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, s * 0.5, s * 0.03, s * 0.06, 0, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
  },
  pickaxe(ctx, s) {
    ctx.save(); ctx.translate(s / 2, s / 2); ctx.rotate(0.6);
    ctx.fillStyle = grad(ctx, -s * 0.03, 0, s * 0.03, 0, [[0, '#a0662a'], [0.5, '#d89a52'], [1, '#6a3a10']]); rr(ctx, -s * 0.035, -s * 0.24, s * 0.07, s * 0.62, s * 0.03); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.38, -s * 0.12); ctx.quadraticCurveTo(0, -s * 0.36, s * 0.38, -s * 0.12); ctx.quadraticCurveTo(0, -s * 0.26, -s * 0.38, -s * 0.12); ctx.closePath();
    ctx.fillStyle = grad(ctx, 0, -s * 0.3, 0, -s * 0.12, [[0, '#f2f4f8'], [1, '#6a707a']]); ctx.fill(); ctx.lineWidth = s * 0.012; ctx.strokeStyle = '#30343a'; ctx.stroke();
    ctx.fillStyle = '#4a4e56'; ctx.fillRect(-s * 0.06, -s * 0.28, s * 0.12, s * 0.1);
    ctx.restore();
  },
  horseshoe(ctx, s) {
    const cx = s / 2, cy = s * 0.46;
    glow(ctx, 'rgba(255,215,120,.7)', s * 0.08);
    ctx.lineWidth = s * 0.13; ctx.lineCap = 'butt'; ctx.strokeStyle = grad(ctx, cx - s * 0.3, 0, cx + s * 0.3, 0, [[0, '#7a5214'], [0.4, '#fff0b0'], [0.7, '#e2b042'], [1, '#7a5214']]);
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.24, Math.PI * 0.9, Math.PI * 2.1, true); ctx.stroke(); noGlow(ctx);
    ctx.fillStyle = '#5a3a08'; for (let i = 0; i < 6; i++) { const a = Math.PI * (0.95 - i * 0.18) - Math.PI; ctx.beginPath(); ctx.arc(cx + Math.cos(-a) * s * 0.24, cy - Math.sin(-a) * s * 0.24, s * 0.018, 0, TAU); ctx.fill(); }
  },
  wild_buckeye(ctx, s) {
    const cx = s / 2, cy = s * 0.43, r = s * 0.3;
    glow(ctx, 'rgba(255,190,90,.85)', s * 0.12);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fillStyle = rgrad(ctx, cx - r * 0.35, cy - r * 0.4, r * 0.05, r * 1.1, [[0, '#d98a4a'], [0.35, '#8a3f14'], [0.8, '#4a1a06'], [1, '#2a0e02']]); ctx.fill(); noGlow(ctx);
    ctx.beginPath(); ctx.ellipse(cx + r * 0.05, cy + r * 0.32, r * 0.55, r * 0.42, 0.15, 0, TAU); ctx.fillStyle = rgrad(ctx, cx, cy + r * 0.3, 1, r * 0.6, [[0, '#f2dcae'], [1, '#b8915a']]); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx - r * 0.35, cy - r * 0.45, r * 0.22, r * 0.1, -0.6, 0, TAU); ctx.fillStyle = 'rgba(255,240,220,.6)'; ctx.fill();
    ribbon(ctx, s, 'WILD', '#2a5a1a');
  },
  cardinal(ctx, s) {
    ctx.save(); ctx.translate(s / 2, s / 2);
    ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-s * 0.36, s * 0.22, s * 0.72, s * 0.04);
    ctx.beginPath(); ctx.moveTo(-s * 0.05, s * 0.05); ctx.lineTo(-s * 0.38, s * 0.24); ctx.lineTo(-s * 0.3, s * 0.08); ctx.closePath(); ctx.fillStyle = '#9a0f1a'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, s * 0.04, s * 0.2, s * 0.16, -0.3, 0, TAU); ctx.fillStyle = grad(ctx, 0, -s * 0.12, 0, s * 0.2, [[0, '#ff4a4a'], [1, '#a0101c']]); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.12, -s * 0.13, s * 0.12, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s * 0.06, -s * 0.22); ctx.lineTo(s * 0.02, -s * 0.38); ctx.lineTo(s * 0.16, -s * 0.24); ctx.closePath(); ctx.fillStyle = '#d0202c'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(s * 0.2, -s * 0.16); ctx.lineTo(s * 0.32, -s * 0.1); ctx.lineTo(s * 0.2, -s * 0.06); ctx.closePath(); ctx.fillStyle = '#ff9a1f'; ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.18, -s * 0.11, s * 0.06, 0, TAU); ctx.fillStyle = '#1a0a0a'; ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.15, -s * 0.15, s * 0.018, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(-s * 0.04, s * 0.05, s * 0.12, s * 0.07, -0.5, 0, TAU); ctx.fillStyle = '#8a0c16'; ctx.fill();
    ctx.restore();
  },
  leaf(ctx, s) {
    ctx.save(); ctx.translate(s / 2, s * 0.62);
    ctx.strokeStyle = '#4a3a1a'; ctx.lineWidth = s * 0.025; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, s * 0.24); ctx.stroke();
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.55; const L = s * (i === 2 ? 0.42 : i % 4 === 0 ? 0.3 : 0.37);
      ctx.save(); ctx.rotate(a + Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.09, -L * 0.5, 0, -L); ctx.quadraticCurveTo(-s * 0.09, -L * 0.5, 0, 0);
      ctx.fillStyle = grad(ctx, 0, 0, 0, -L, [[0, '#2f6a1e'], [1, '#7fcf4a']]); ctx.fill(); ctx.strokeStyle = 'rgba(20,50,10,.8)'; ctx.lineWidth = s * 0.008; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -L * 0.92); ctx.stroke(); ctx.restore(); }
    ctx.restore();
  },
  wild2x(ctx, s) {
    glow(ctx, 'rgba(255,215,100,.95)', s * 0.14);
    star(ctx, s / 2, s * 0.47, 5, s * 0.4, s * 0.17); ctx.fillStyle = grad(ctx, s * 0.2, s * 0.1, s * 0.8, s * 0.8, GOLD); ctx.fill(); noGlow(ctx);
    ctx.lineWidth = s * 0.02; ctx.strokeStyle = '#6b4510'; ctx.stroke();
    ctx.font = `900 ${Math.round(s * 0.26)}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#a3162a'; ctx.fillText('2×', s / 2, s * 0.5);
  },
  blank() {},
});

function bars(ctx, s, n) {
  const h = s * 0.18, gap = s * 0.04, total = n * h + (n - 1) * gap; let y = s / 2 - total / 2;
  for (let i = 0; i < n; i++) {
    rr(ctx, s * 0.14, y, s * 0.72, h, h * 0.35); ctx.fillStyle = grad(ctx, 0, y, 0, y + h, [[0, '#3a3a40'], [1, '#0e0e12']]); ctx.fill();
    ctx.lineWidth = s * 0.015; ctx.strokeStyle = '#36e3ff'; glow(ctx, 'rgba(54,227,255,.9)', s * 0.05); ctx.stroke(); noGlow(ctx);
    ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(h * 0.78)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('BAR', s / 2, y + h / 2 + 1);
    y += h + gap;
  }
}
const BG = {
  hollywood: (ctx, s, special) => { ctx.fillStyle = special ? rgrad(ctx, s / 2, s / 2, 2, s * 0.7, [[0, '#6a1a22'], [1, '#1a060a']]) : grad(ctx, 0, 0, 0, s, [[0, '#2a0f14'], [1, '#100406']]); ctx.fillRect(0, 0, s, s); },
  gold: (ctx, s, special) => { ctx.fillStyle = special ? rgrad(ctx, s / 2, s / 2, 2, s * 0.7, [[0, '#6a4a12'], [1, '#1c1004']]) : grad(ctx, 0, 0, 0, s, [[0, '#2e1d0c'], [1, '#140b04']]); ctx.fillRect(0, 0, s, s); },
  buckeye: (ctx, s, special) => { ctx.fillStyle = special ? rgrad(ctx, s / 2, s / 2, 2, s * 0.7, [[0, '#2f5a1e'], [1, '#0a1a08']]) : grad(ctx, 0, 0, 0, s, [[0, '#13301a'], [1, '#06140a']]); ctx.fillRect(0, 0, s, s); },
  classic: (ctx, s, special) => { ctx.fillStyle = special ? rgrad(ctx, s / 2, s / 2, 2, s * 0.7, [[0, '#ffffff'], [1, '#e8dcc0']]) : grad(ctx, 0, 0, 0, s, [[0, '#fffdf6'], [1, '#e9e0cc']]); ctx.fillRect(0, 0, s, s); },
  screen: (ctx, s, special) => { ctx.fillStyle = special ? rgrad(ctx, s / 2, s / 2, 2, s * 0.7, [[0, '#5a3a12'], [1, '#1a0f06']]) : grad(ctx, 0, 0, 0, s, [[0, '#2a1b0e'], [1, '#120a04']]); ctx.fillRect(0, 0, s, s); },
  neon: (ctx, s, special) => { ctx.fillStyle = special ? rgrad(ctx, s / 2, s / 2, 2, s * 0.7, [[0, '#4a0f5a'], [1, '#12041f']]) : grad(ctx, 0, 0, 0, s, [[0, '#170834'], [1, '#08021a']]); ctx.fillRect(0, 0, s, s); },
  ocean: (ctx, s, special) => { ctx.fillStyle = special ? rgrad(ctx, s / 2, s / 2, 2, s * 0.7, [[0, '#0e5a6a'], [1, '#03202e']]) : grad(ctx, 0, 0, 0, s, [[0, '#06384a'], [1, '#021722']]); ctx.fillRect(0, 0, s, s); },
};
/** symbol key of index idx in theme th (video themes: [key, pays]; classic: key) */
export const symKey = (th, idx) => (th === CLASSIC_KEY ? CLASSIC.symbols[idx] : THEMES[th].symbols[idx][0]);
export const symCount = (th) => (th === CLASSIC_KEY ? CLASSIC.symbols.length : THEMES[th].symbols.length);
export const themeOf = (th) => (th === CLASSIC_KEY ? CLASSIC : THEMES[th]);
/** paint symbol `idx` of theme `th` into ctx at (0,0,size) — optional background */
export function paintSymbol(ctx, th, idx, s, { bg = true } = {}) {
  const key = symKey(th, idx);
  ctx.save();
  if (bg) (BG[th] || BG.hollywood)(ctx, s, th === CLASSIC_KEY ? idx === 0 : idx <= 1);
  if (P[key]) P[key](ctx, s); else letter(ctx, s, key, th);
  ctx.restore();
}
const cache = new Map();
/** cached canvas of one symbol */
export function symbolCanvas(th, idx, s = 128, bg = true) {
  const k = th + idx + ':' + s + bg;
  if (cache.has(k)) return cache.get(k);
  const c = document.createElement('canvas'); c.width = c.height = s; paintSymbol(c.getContext('2d'), th, idx, s, { bg }); cache.set(k, c); return c;
}
export const THEME_NAME_EN = { hollywood: 'HOLLYWOOD NIGHTS', gold: 'OHIO GOLD RUSH', buckeye: 'BUCKEYE JACKPOT', classic: 'MARQUEE 7s' };
/** attract-mode screen for the 3D cabinets: a 3×3 symbol grid scrolling under the theme title */
export function drawAttract(ctx, th, w, h, t, seed = 0) {
  const T = themeOf(th); const n = symCount(th); const cls = th === CLASSIC_KEY;
  (BG[th] || BG.hollywood)(ctx, Math.max(w, h), false);
  const cols = cls ? 3 : 3, cell = w / cols, top = h * 0.24;
  for (let r = 0; r < cols; r++) {
    const off = ((t * (0.6 + r * 0.25) + seed * 0.37) % 1) * cell;
    for (let k = -1; k < 3; k++) {
      let idx = Math.abs((Math.floor(t * (0.6 + r * 0.25) + seed) * 7 + (k + 9) * 5 + r * 3) % n);
      if (cls && idx === n - 1) idx = 1; // no blanks in attract mode
      ctx.drawImage(symbolCanvas(th, idx, 128, true), r * cell + 2, top + k * cell + off, cell - 4, cell - 4);
    }
  }
  if (cls) { ctx.fillStyle = 'rgba(208,23,47,.85)'; ctx.fillRect(0, top + 1.5 * cell - 2, w, 4); }
  ctx.fillStyle = T.palette[0]; ctx.fillRect(0, 0, w, top);
  ctx.fillStyle = grad(ctx, 0, 0, 0, top, [[0, '#fff3c9'], [1, T.palette[1]]]); ctx.font = `900 ${Math.round(top * (THEME_NAME_EN[th].length > 14 ? 0.34 : 0.42))}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(THEME_NAME_EN[th], w / 2, top * 0.55);
  ctx.fillStyle = T.palette[0]; ctx.fillRect(0, top + 3 * cell, w, h);
  ctx.strokeStyle = T.palette[1]; ctx.lineWidth = 4; ctx.strokeRect(2, 2, w - 4, h - 4);
}

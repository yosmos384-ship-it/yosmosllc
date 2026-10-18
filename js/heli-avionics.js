// heli-avionics.js — V13 HELI: the glass-cockpit displays (one canvas, 4 cells: PFD · engine · moving map · NAV),
// drawn ~10×/s from the flight state. Generic avionics look (no manufacturer styling or logos). No side effects.
//
//   drawAvionics(canvas, s, map)   s = { tilt, roll, h, speed, alt, agl, vs, rpm, power, x, z, poi, pois[], t }
//                                   map = { canvas, R, S } (heli-area buildMapCanvas) or null
//   getAvionicsMap() → the last map given to drawAvionics (the on-screen HUD mini map in heli-ui.js reuses it)
//   navInfo(s) → { target, dist, brg, rel } — next place (s.poi, else the nearest of s.pois) seen from (s.x, s.z, s.h)
const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
import { heliRadio } from './heli-audio.js';
let lastMap = null;
export function getAvionicsMap() { return lastMap; }
export function resetAvionicsMap() { lastMap = null; } // V13: the heli world was unloaded
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export function navInfo(s) {
  if (!s || !isFinite(s.x) || !isFinite(s.z)) return null;
  let tg = s.poi || null;
  if (!tg) { let bd = Infinity; for (const p of s.pois || []) { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < bd) { bd = d; tg = p; } } }
  if (!tg) return null;
  const dx = tg.x - s.x, dz = tg.z - s.z, dist = Math.hypot(dx, dz);
  const brg = Math.atan2(dx, -dz);
  return { target: tg, dist, brg, rel: wrapPi(brg - (s.h || 0)) };
}
function nav(g, W, H, s) {
  g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#8fd'; g.font = 'bold 11px Arial'; g.textAlign = 'center'; g.fillText('NAV · NEXT', W / 2, 16);
  const n = navInfo(s);
  const cx = W / 2, cy = H * 0.5, R = Math.min(W, H) * 0.3;
  // compass rose, heading up
  g.save(); g.translate(cx, cy); g.rotate(-(s.h || 0));
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
  g.fillStyle = '#ddd'; g.font = 'bold 10px Arial'; g.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 30) { const a = d / DEG; const x = Math.sin(a), y = -Math.cos(a); g.beginPath(); g.moveTo(x * R, y * R); g.lineTo(x * (R - (d % 90 ? 4 : 8)), y * (R - (d % 90 ? 4 : 8))); g.stroke(); if (!(d % 90)) g.fillText({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d], x * (R - 16), y * (R - 16)); }
  if (n) { // bearing needle to the next place
    const x = Math.sin(n.brg), y = -Math.cos(n.brg);
    g.strokeStyle = '#ff3df0'; g.lineWidth = 3; g.beginPath(); g.moveTo(-x * (R - 6), -y * (R - 6)); g.lineTo(x * (R - 6), y * (R - 6)); g.stroke();
    g.fillStyle = '#ff3df0'; g.beginPath(); g.moveTo(x * (R + 2), y * (R + 2)); g.lineTo(x * (R - 12) - y * 6, y * (R - 12) + x * 6); g.lineTo(x * (R - 12) + y * 6, y * (R - 12) - x * 6); g.closePath(); g.fill();
  }
  g.restore();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx - 5, cy + 6); g.lineTo(cx + 5, cy + 6); g.closePath(); g.fill();
  g.textBaseline = 'alphabetic'; g.textAlign = 'center';
  if (n) {
    g.fillStyle = '#ff9ff6'; g.font = 'bold 11px Arial'; g.fillText(String(n.target.name || n.target.id || '').toUpperCase().slice(0, 24), cx, H * 0.86);
    g.fillStyle = '#fff'; g.font = 'bold 13px Arial';
    const nm = n.dist / 1852;
    g.fillText((n.dist < 1000 ? Math.round(n.dist) + ' M' : (n.dist / 1000).toFixed(1) + ' KM') + '  ·  ' + nm.toFixed(1) + ' NM', cx, H * 0.95);
    const ete = (s.speed || 0) > 3 ? n.dist / s.speed : null;
    g.font = '9px Arial'; g.fillStyle = '#9ab'; g.textAlign = 'left'; g.fillText('BRG ' + String(Math.round(((n.brg * DEG) % 360 + 360) % 360)).padStart(3, '0') + '°', 6, 30);
    g.textAlign = 'right'; g.fillText(ete != null ? 'ETE ' + Math.floor(ete / 60) + ':' + String(Math.round(ete % 60)).padStart(2, '0') : 'ETE --:--', W - 6, 30);
  }
  g.font = '9px Arial'; g.fillStyle = '#9ab'; g.textAlign = 'left'; g.fillText('GS ' + Math.round((s.speed || 0) * 1.9438) + ' KT', 6, H * 0.76);
  g.textAlign = 'right'; g.fillText('AGL ' + Math.round((s.agl || 0) * 3.2808) + ' FT', W - 6, H * 0.76);
}
function pfd(g, W, H, s) {
  g.save();
  g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.46, R = W * 0.36;
  // attitude
  g.save(); g.beginPath(); g.rect(W * 0.16, H * 0.08, W * 0.68, H * 0.74); g.clip();
  g.translate(cx, cy); g.rotate(-(s.roll || 0));
  const pp = (s.tilt || 0) * DEG * (H / 60); // 1° ≈ H/60 px, nose-down tilt → horizon moves up
  g.fillStyle = '#2f73c9'; g.fillRect(-W, -H * 2 - pp, W * 2, H * 2);
  g.fillStyle = '#7a4f22'; g.fillRect(-W, -pp, W * 2, H * 2);
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(-W, -pp); g.lineTo(W, -pp); g.stroke();
  g.lineWidth = 1.2; g.font = '9px Arial'; g.fillStyle = '#fff'; g.textAlign = 'center';
  for (let d = -20; d <= 20; d += 5) { if (!d) continue; const y = -pp - d * (H / 60); const w = d % 10 ? 10 : 20; g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); g.stroke(); if (!(d % 10)) { g.fillText(String(Math.abs(d)), -w - 10, y + 3); g.fillText(String(Math.abs(d)), w + 10, y + 3); } }
  g.restore();
  // aircraft symbol + bank scale
  g.strokeStyle = '#ffd400'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 34, cy); g.lineTo(cx - 12, cy); g.lineTo(cx - 6, cy + 6); g.moveTo(cx + 34, cy); g.lineTo(cx + 12, cy); g.lineTo(cx + 6, cy + 6); g.stroke();
  g.fillStyle = '#ffd400'; g.fillRect(cx - 2, cy - 2, 4, 4);
  g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, R * 0.92, Math.PI * 1.17, Math.PI * 1.83); g.stroke();
  for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) { const r = (a - 90) / DEG; const l = a % 30 ? 5 : 9; g.beginPath(); g.moveTo(cx + Math.cos(r) * R * 0.92, cy + Math.sin(r) * R * 0.92); g.lineTo(cx + Math.cos(r) * (R * 0.92 - l), cy + Math.sin(r) * (R * 0.92 - l)); g.stroke(); }
  { const r = -Math.PI / 2 - (s.roll || 0); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx + Math.cos(r) * (R * 0.92 - 4), cy + Math.sin(r) * (R * 0.92 - 4)); g.lineTo(cx + Math.cos(r + 0.06) * (R * 0.92 - 14), cy + Math.sin(r + 0.06) * (R * 0.92 - 14)); g.lineTo(cx + Math.cos(r - 0.06) * (R * 0.92 - 14), cy + Math.sin(r - 0.06) * (R * 0.92 - 14)); g.fill(); }
  // tapes: airspeed (kt) left, altitude (ft) right
  const kt = (s.speed || 0) * 1.9438, ft = (s.alt || 0) * 3.2808;
  const tape = (x, w, val, step, fmt, unit) => {
    g.fillStyle = 'rgba(20,24,30,0.85)'; g.fillRect(x, H * 0.08, w, H * 0.74);
    g.save(); g.beginPath(); g.rect(x, H * 0.08, w, H * 0.74); g.clip();
    g.strokeStyle = '#ddd'; g.fillStyle = '#ddd'; g.font = '10px Arial'; g.textAlign = 'center'; g.lineWidth = 1;
    const pxPer = H * 0.74 / (step * 6);
    const base = Math.floor(val / step) * step;
    for (let k = -4; k <= 4; k++) { const v = base + k * step; const y = cy - (v - val) * pxPer; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 5, y); g.stroke(); if (v >= 0) g.fillText(fmt(v), x + w / 2 + 2, y + 3); }
    g.restore();
    g.fillStyle = '#000'; g.fillRect(x - 2, cy - 10, w + 4, 20); g.strokeStyle = '#fff'; g.strokeRect(x - 2, cy - 10, w + 4, 20);
    g.fillStyle = '#fff'; g.font = 'bold 13px Arial'; g.textAlign = 'center'; g.fillText(fmt(Math.round(val)), x + w / 2, cy + 5);
    g.font = '9px Arial'; g.fillStyle = '#8fd'; g.fillText(unit, x + w / 2, H * 0.06);
  };
  tape(4, W * 0.15, kt, 10, (v) => String(Math.round(v)), 'KT');
  tape(W * 0.84 - 2, W * 0.16, ft, 100, (v) => String(Math.round(v)), 'FT');
  // VSI
  const vs = (s.vs || 0) * 196.85; g.fillStyle = '#8fd'; g.font = '9px Arial'; g.textAlign = 'right'; g.fillText((vs >= 0 ? '+' : '') + Math.round(vs / 10) * 10 + ' FPM', W - 4, H * 0.86);
  // heading strip
  const hd = ((s.h || 0) * DEG + 360) % 360;
  g.fillStyle = '#0b0f15'; g.fillRect(0, H * 0.84, W, H * 0.16);
  g.save(); g.beginPath(); g.rect(0, H * 0.84, W, H * 0.16); g.clip();
  g.strokeStyle = '#ddd'; g.fillStyle = '#ddd'; g.font = '10px Arial'; g.textAlign = 'center';
  for (let d = Math.floor(hd / 10) * 10 - 40; d <= hd + 40; d += 10) { const x = cx + (d - hd) * 3; g.beginPath(); g.moveTo(x, H * 0.84); g.lineTo(x, H * 0.84 + (d % 30 ? 4 : 8)); g.stroke(); if (!(d % 30)) { const v = ((d % 360) + 360) % 360; g.fillText({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[v] || String(v / 10), x, H * 0.84 + 19); } }
  g.restore();
  g.fillStyle = '#ffd400'; g.beginPath(); g.moveTo(cx, H * 0.84 + 1); g.lineTo(cx - 5, H * 0.84 - 6); g.lineTo(cx + 5, H * 0.84 - 6); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 11px Arial'; g.fillText(String(Math.round(hd)).padStart(3, '0') + '°', cx, H * 0.995);
  g.restore();
}
function engine(g, W, H, s) {
  g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#8fd'; g.font = 'bold 11px Arial'; g.textAlign = 'center'; g.fillText('ENGINE · ROTOR', W / 2, 16);
  const gauge = (cx, cy, r, val, lbl, txt, red) => {
    g.lineWidth = 7; g.strokeStyle = '#1d2a22'; g.beginPath(); g.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
    g.strokeStyle = '#2bd46a'; g.beginPath(); g.arc(cx, cy, r, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * Math.min(1, val))); g.stroke();
    g.strokeStyle = '#d33'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r, Math.PI * (0.75 + 1.5 * red), Math.PI * 2.25); g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 13px Arial'; g.fillText(txt, cx, cy + 5); g.font = '9px Arial'; g.fillStyle = '#9ab'; g.fillText(lbl, cx, cy + r + 12);
  };
  const rpm = s.rpm || 0, pw = s.power || 0;
  gauge(W * 0.28, H * 0.32, W * 0.15, rpm, 'NR %', Math.round(rpm * 100) + '', 0.98);
  gauge(W * 0.72, H * 0.32, W * 0.15, pw, 'TQ %', Math.round(pw * 100) + '', 0.92);
  gauge(W * 0.28, H * 0.66, W * 0.11, rpm * 0.7 + pw * 0.25, 'TOT 1', Math.round(400 + 380 * (rpm * 0.7 + pw * 0.25)) + '°', 0.93);
  gauge(W * 0.72, H * 0.66, W * 0.11, rpm * 0.7 + pw * 0.24, 'TOT 2', Math.round(400 + 378 * (rpm * 0.7 + pw * 0.24)) + '°', 0.93);
  g.fillStyle = '#9ab'; g.font = '9px Arial'; g.fillText('FUEL ' + Math.round(560 - (s.t || 0) * 0.08) + ' KG', W / 2, H * 0.97);
  // COM radio line (the house radio in the headset)
  let rc = null; try { rc = heliRadio.current('en'); } catch (_) {}
  const on = rc && rc.on;
  g.fillStyle = 'rgba(20,40,30,0.9)'; g.fillRect(W * 0.08, H * 0.855, W * 0.84, 14);
  g.font = 'bold 10px Arial'; g.textAlign = 'left'; g.fillStyle = '#8fd'; g.fillText('COM', W * 0.1, H * 0.855 + 10.5);
  g.textAlign = 'right'; g.fillStyle = on ? (rc.status === 'connecting' ? '#ffd400' : '#2bd46a') : '#667';
  g.fillText(on ? (rc.label || 'RADIO') + (rc.status === 'connecting' ? ' …' : '') : 'OFF', W * 0.9, H * 0.855 + 10.5);
  g.textAlign = 'center';
}
function moving(g, W, H, s, map) {
  g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.62;
  const range = 2500; // m from the aircraft to the top of the ring
  if (map && map.canvas) {
    const k = map.S / (2 * map.R); // map px per m
    const sc = (H * 0.55) / range / k; // canvas px per map px
    g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip();
    g.translate(cx, cy); g.rotate(-(s.h || 0)); g.scale(sc, sc);
    g.drawImage(map.canvas, -((s.x || 0) + map.R) * k, -((s.z || 0) + map.R) * k);
    g.restore();
  }
  // range ring + POIs
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, H * 0.55, 0, TAU); g.stroke();
  g.beginPath(); g.arc(cx, cy, H * 0.275, 0, TAU); g.stroke();
  const pxm = (H * 0.55) / range;
  const ch = Math.cos(-(s.h || 0)), sh = Math.sin(-(s.h || 0));
  for (const p of s.pois || []) {
    const dx = p.x - (s.x || 0), dz = p.z - (s.z || 0);
    const rx = dx * ch - dz * sh, rz = dx * sh + dz * ch;
    const x = cx + rx * pxm, y = cy + rz * pxm;
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
    const on = s.poi && p.id === s.poi.id;
    g.fillStyle = on ? '#ff3df0' : '#5cf'; g.beginPath(); g.arc(x, y, on ? 5 : 3.5, 0, TAU); g.fill();
  }
  // aircraft
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx, cy - 9); g.lineTo(cx - 6, cy + 7); g.lineTo(cx, cy + 4); g.lineTo(cx + 6, cy + 7); g.closePath(); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, W, 18);
  g.fillStyle = '#8fd'; g.font = 'bold 10px Arial'; g.textAlign = 'left'; g.fillText('MAP · 2.5 KM', 6, 13);
  if (s.poi) { g.textAlign = 'right'; g.fillStyle = '#ff9ff6'; const n = navInfo(s); g.fillText((s.poi.name || '').toUpperCase().slice(0, 16) + (n ? ' ' + (n.dist / 1000).toFixed(1) + 'KM' : ''), W - 6, 13); }
}
export function drawAvionics(canvas, s, map) {
  if (map && map.canvas) lastMap = map;
  if (!canvas) return;
  s = s || {};
  const g = canvas.getContext('2d'); if (!g) return; const W = canvas.width / 4, H = canvas.height;
  const cells = [(c) => pfd(c, W, H, s), (c) => engine(c, W, H, s), (c) => moving(c, W, H, s, map), (c) => nav(c, W, H, s)];
  for (let k = 0; k < 4; k++) { g.save(); g.translate(k * W, 0); g.beginPath(); g.rect(0, 0, W, H); g.clip(); cells[k](g); g.restore(); }
}

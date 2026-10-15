// radio-engine.js — V7: HITS radio inside the tour. Default = WNCI 97.9 FM Columbus, Ohio (always first, autostarts on
// the first gesture); then other US Top-40 / CHR ("להיטים") stations only: Ohio (Cincinnati, Cleveland, Toledo) and
// the big-market hit stations. Every built-in station carries a VERIFIED https stream (checked 2026-10-15 via the
// iHeart station API + an audio/aac probe), so the radio works even when radio-browser.info is down; at runtime the
// list is refreshed from radio-browser (mirrors de1 → nl1 → at1 → all, 4 s each; 24 h localStorage cache) and any
// extra Columbus-area Top-40 station found there is inserted right after WNCI.
// Playback = ONE <audio> element (no crossOrigin, preload none). A station that fails, rejects or stalls for 7 s →
// toast + auto-skip to the next HITS station (V5 behaviour); when every station failed → "השידור לא זמין כרגע" + retry.
// The procedural WebAudio radio (synthesized programmes) is kept ONLY for a network blocked by CSP (the claude.ai
// artifact), labelled "רדיו גיבוי". duck(on) lowers the radio while the living-room TV plays (no stored volume change).
// Singleton: createRadio(audio) once (idempotent), getRadio() anywhere. No imports, no side effects on import.

export const FMIN = 540, FMAX = 1600; // dial units (AM kHz scale; FM is mapped onto the same needle travel)
// synthesized backup programmes (never listed in the UI; CSP-blocked page only)
export const STATIONS = [
  { id: 'swing', f: 640, call: 'BKUP', he: 'סווינג ג׳אז', sub: 'ביג-בנד, ויברפון וקונטרבס' },
  { id: 'doowop', f: 820, call: 'BKUP', he: 'דו-וופ ורוקנרול', sub: 'הרמוניות, פסנתר וסקסופון' },
  { id: 'country', f: 1010, call: 'BKUP', he: 'קאנטרי ובלוגראס', sub: 'בנג׳ו, כינור ובס בום-צ׳יק' },
  { id: 'blues', f: 1180, call: 'BKUP', he: 'בלוז', sub: 'שאפל איטי, 12 תיבות, אורגן וגיטרה' },
  { id: 'strings', f: 1370, call: 'BKUP', he: 'קלאסי ולאונג׳', sub: 'מיתרים, צ׳לו ונבל' },
  { id: 'scanner', f: 1560, call: 'BKUP', he: 'קשר (מדומה)', sub: 'קשר מדומה, בלי מילים' },
];
const MUSIC = [0, 1, 2, 3, 4]; // backup never plays the synthesized scanner
export const BACKUP_HE = 'רדיו גיבוי';
export const LIVE_NOTE = 'השידור החי עובד באתר yosmosllc.com';
export const UNAVAIL_HE = 'השידור לא זמין כרגע';
export const STATION_DOWN_HE = 'התחנה לא זמינה כרגע';
export const HITS_HE = 'להיטים';

// ---- the HITS stations (order = play order; WNCI is always first). url = verified https stream (2026-10-15).
const IH = (zc) => 'https://stream.revma.ihrhls.com/zc' + zc;
const S = (key, fr, name, city, zc, area, extra) => Object.assign({ key, call: key, band: 'FM', fr, name, city, he: HITS_HE, zc, area, url: IH(zc), builtin: true }, extra || {});
export const HITS = [
  S('WNCI', 97.9, '97.9 WNCI', 'Columbus, OH', 1753, 'columbus', { brand: /\b97[.,]?9\s*wnci\b/i }),
  S('WKFS', 107.1, 'Kiss 107.1', 'Cincinnati, OH', 1705, 'ohio'),
  S('WAKS', 96.5, '96.5 Kiss FM', 'Cleveland, OH', 1729, 'ohio'),
  S('WVKS', 92.5, '92.5 Kiss FM', 'Toledo, OH', 1861, 'ohio'),
  S('WHTZ', 100.3, 'Z100', 'New York, NY', 1469, 'us'),
  S('KIIS', 102.7, '102.7 KIIS FM', 'Los Angeles, CA', 185, 'us'),
  S('WKSC', 103.5, '103.5 Kiss FM', 'Chicago, IL', 849, 'us'),
  S('WIHT', 99.5, 'Hot 99.5', 'Washington, DC', 2509, 'us'),
  S('WXKS', 107.9, 'Kiss 108', 'Boston, MA', 1097, 'us'),
  S('WIOQ', 102.1, 'Q102', 'Philadelphia, PA', 1997, 'us'),
  S('WWPW', 105.3, 'Power 105.3', 'Atlanta, GA', 3209, 'us'),
  S('WZFT', 104.3, 'Z104.3', 'Baltimore, MD', 1077, 'us'),
  S('KHTS', 93.3, 'Channel 93.3', 'San Diego, CA', 241, 'us'),
];
export const WNCI = HITS[0];
export const COLUMBUS = HITS; // (V5/V6 name kept: the 3D dial marks)
export const WNCI_KNOWN = [WNCI.url];
export const RB_MIRRORS = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info', 'https://all.api.radio-browser.info'];
// two lookups per mirror (in parallel): WNCI by name (it carries no tags there) + every US "top 40" station
export const RB_QUERY = '/json/stations/search?name=WNCI&state=Ohio&countrycode=US&hidebroken=true&order=clickcount&reverse=true&limit=50';
export const RB_QUERY_HITS = '/json/stations/search?tag=top%2040&countrycode=US&hidebroken=true&order=clickcount&reverse=true&limit=500';
const CACHE_KEY = 'rbHits7', CACHE_MS = 24 * 3600e3, RB_TIMEOUT = 4000, PLAY_TIMEOUT = 7000, STALL_MS = 7000, DUCK_K = 0.35;

// dial position 0..1 (FM 88–108 and AM 540–1600 share the needle travel) → engine dial units (FMIN..FMAX)
export function dialPos(s) {
  if (!s || !isFinite(s.fr)) return 0.5;
  const p = s.band === 'AM' ? (s.fr - 540) / (1600 - 540) : (s.fr - 88) / (108 - 88);
  return p < 0 ? 0 : p > 1 ? 1 : p;
}
export const dialUnits = (s) => FMIN + dialPos(s) * (FMAX - FMIN);
export const freqText = (s) => (s && isFinite(s.fr) ? (s.band === 'AM' ? String(Math.round(s.fr)) + ' AM' : s.fr.toFixed(1)) : '');
export const stationLabel = (s) => (s ? (s.call ? s.call + ' ' + freqText(s) : s.name) : '');

// ---- pure list builder (exported for tests): radio-browser JSON (any number of result arrays) → HITS station list
const CALL_RE = /\b([WK][A-Z]{2,3})(?:-(?:FM|AM|LP|HD\d?))?\b/g;
function callsOf(x) {
  const out = new Set();
  for (const m of String(x.name || '').toUpperCase().matchAll(CALL_RE)) out.add(m[1]);
  try { for (const p of new URL(x.homepage || '').hostname.toUpperCase().split('.')) if (/^[WK][A-Z]{2,3}$/.test(p)) out.add(p); } catch (_) { /* no homepage */ }
  return out;
}
const zcOf = (u) => { const m = /ihrhls\.com\/zc(\d+)(?:[/?]|$)/i.exec(u || ''); return m ? +m[1] : 0; };
// iHeart serves the same stream over https: upgrade http://…ihrhls.com/… so it also plays on the https site
const httpsUp = (u) => (/^http:\/\/[^/]*ihrhls\.com\//i.test(u) ? 'https://' + u.slice(7) : u);
const isHitsTag = (t) => /\btop ?40\b|\bchr\b|\bhits?\b|contemporary hit|hit music|\bpop\b/i.test(t) && !/classic|oldies|\b(60|70|80|90)s\b|country|christian|gospel|talk|news|sports|rock|jazz|hip.?hop|urban|latin|regional|mexican/i.test(t);
export function pickHits(lists, opts = {}) {
  const https = !!opts.https;
  const arr = [];
  for (const l of Array.isArray(lists) && Array.isArray(lists[0]) ? lists : [lists]) if (Array.isArray(l)) arr.push(...l);
  const out = HITS.map((h) => ({ h, cand: new Map() }));
  const byCall = new Map(HITS.map((h, i) => [h.call, i])), byZc = new Map(HITS.map((h, i) => [h.zc, i]));
  const extras = new Map();
  for (const x of arr) {
    if (!x || typeof x !== 'object' || String(x.countrycode || 'US').toUpperCase() !== 'US') continue;
    const name = String(x.name || ''), tags = String(x.tags || '');
    if (/scanner|police|sheriff|fire\s*(dept|department|dispatch)/i.test(name + ' ' + tags)) continue;
    let url = httpsUp(String(x.url_resolved || x.url || '').trim());
    if (!/^https?:\/\//i.test(url) || (https && !/^https:/i.test(url))) continue; // mixed content is blocked on https
    const c = { url, https: /^https:/i.test(url), br: +x.bitrate || 0, pop: (+x.clickcount || 0) + (+x.votes || 0) };
    const calls = callsOf(x);
    let idx = byZc.has(zcOf(url)) ? byZc.get(zcOf(url)) : -1;
    if (idx < 0) for (const k of calls) if (byCall.has(k)) { idx = byCall.get(k); break; }
    if (idx < 0 && WNCI.brand.test(name)) idx = 0;
    if (idx >= 0) {
      if (idx === 0 && !/\bohio\b|^\s*oh\s*$/i.test(x.state || '') && zcOf(url) !== WNCI.zc) continue; // WNCI = Columbus only
      const o = out[idx].cand.get(url); if (!o || c.pop > o.pop) out[idx].cand.set(url, c);
      continue;
    }
    // extra Columbus-area hits station (not in the built-in list)
    const hay = (name + ' ' + tags + ' ' + (x.homepage || '')).toLowerCase();
    if (!/\bohio\b|^\s*oh\s*$/i.test(x.state || '') || !/columbus/.test(hay) || !isHitsTag(tags + ' ' + name)) continue;
    const call = [...calls][0] || name.replace(/[^a-z0-9]/gi, '').slice(0, 10).toUpperCase();
    if (!call || byCall.has(call)) continue;
    const fm = /\b(8[89]|9\d|10[0-7])[.,](\d)\b/.exec(name);
    const e = extras.get(call) || { key: call, call: /^[WK][A-Z]{2,3}$/.test(call) ? call : '', band: 'FM', fr: fm ? +(fm[1] + '.' + fm[2]) : NaN, name: name.slice(0, 40), city: 'Columbus, OH', he: HITS_HE, area: 'columbus', cand: new Map() };
    const o = e.cand.get(url); if (!o || c.pop > o.pop) e.cand.set(url, c);
    extras.set(call, e);
  }
  const urlsOf = (cand, base) => {
    const list = [...cand.values()].sort((a, b) => (b.https - a.https) || (b.pop - a.pop) || (b.br - a.br)).map((c) => c.url);
    if (base && !list.includes(base)) list.push(base); // the verified built-in stream is always a fallback
    return list.slice(0, 4);
  };
  const strip = (h) => { const { brand, url, cand, ...rest } = h; return rest; }; // eslint-disable-line no-unused-vars
  const res = out.map(({ h, cand }) => Object.assign(strip(h), { urls: urlsOf(cand, https && !/^https:/.test(h.url) ? '' : h.url) })).filter((s) => s.urls.length);
  const ex = [...extras.values()].map((e) => Object.assign(strip(e), { urls: urlsOf(e.cand, '') })).filter((s) => s.urls.length);
  return res.length ? [res[0], ...ex, ...res.slice(1)] : ex;
}
export const builtinList = () => pickHits([], { https: true });
const isClaudeHost = () => { try { return /(^|\.)claude\.ai$|(^|\.)claudeusercontent\.com$|(^|\.)claude\.site$/i.test(globalThis.location.hostname || ''); } catch (_) { return false; } };

const BASE = 0.3, NEAR = 0.8, LOOK = 0.45, TUNE_W = 18;
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function lsGet(k) { try { return globalThis.localStorage ? globalThis.localStorage.getItem('eakin_' + k) : null; } catch (_) { return null; } }
function lsSet(k, v) { try { if (globalThis.localStorage) globalThis.localStorage.setItem('eakin_' + k, v); } catch (_) { /* private mode */ } }
const perfNow = () => ((globalThis.performance && globalThis.performance.now) ? globalThis.performance.now() : Date.now()) / 1000;

let SINGLETON = null;
export function getRadio() { return SINGLETON; }

export function createRadio(audio, opts = {}) {
  if (SINGLETON) { if (audio && !SINGLETON._audio) SINGLETON._audio = audio; return SINGLETON; }
  const st = { on: false, idx: 0, f: dialUnits(WNCI), vol: 0.7, duckK: 1, cur: -1, tune: null, autoDone: false, notes: 0, events: 0, hidden: false, base: 0, near: 0 };
  const A = { ac: null, out: null, base: null, near: null, pan: null, bus: null, stat: null, statSrc: null, sg: [], kits: [], clocks: [], S: [], noise: null, iv: null };
  const subs = new Set(), panelSubs = new Set();
  let srcFn = null, lisFn = null;
  const emit = () => { for (const f of subs) { try { f(api.state); } catch (_) { /* listener */ } } };

  /* ------------------------------------------------------------------ graph (built once, reused) */
  function getAC() { try { const a = api._audio; return a ? a.ctx : null; } catch (_) { return null; } }
  function build() {
    if (A.out) return A.ac;
    const ac = getAC(); if (!ac) return null;
    try {
      A.ac = ac;
      let dest = null; try { dest = api._audio && api._audio.master; } catch (_) { dest = null; }
      A.out = ac.createGain(); A.out.gain.value = 0.0001; A.out.connect(dest || ac.destination);
      A.base = ac.createGain(); A.base.gain.value = 0.0001; A.base.connect(A.out);
      A.near = ac.createGain(); A.near.gain.value = 0.0001;
      if (typeof ac.createStereoPanner === 'function') { A.pan = ac.createStereoPanner(); A.near.connect(A.pan); A.pan.connect(A.out); } else A.near.connect(A.out);
      const post = ac.createGain(); post.gain.value = 1; post.connect(A.base); post.connect(A.near);
      const ws = ac.createWaveShaper(); const n = 1024, cv = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; cv[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
      ws.curve = cv; ws.connect(post);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 0.9; lp.connect(ws);
      const pk = ac.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1200; pk.gain.value = 4; pk.Q.value = 0.8; pk.connect(lp);
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220; hp.connect(pk);
      A.bus = ac.createGain(); A.bus.gain.value = 1; A.bus.connect(hp);
      // noise buffer (shared by static, drums, squelch)
      const sr = ac.sampleRate || 44100, len = Math.floor(sr * 2);
      A.noise = ac.createBuffer(1, len, sr); const d = A.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      A.stat = ac.createGain(); A.stat.gain.value = 0.0001; A.stat.connect(hp);
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.45; bp.connect(A.stat);
      A.statSrc = ac.createBufferSource(); A.statSrc.buffer = A.noise; A.statSrc.loop = true; A.statSrc.connect(bp); A.statSrc.start();
      A.sg = STATIONS.map(() => { const g = ac.createGain(); g.gain.value = 0; g.connect(A.bus); return g; });
      A.kits = STATIONS.map(() => null);
      A.clocks = STATIONS.map(() => ({ t: 0, beat: 0 }));
      A.S = STATIONS.map(() => ({ next: 0 }));
      return ac;
    } catch (e) { try { console.warn('[radio] audio graph', e); } catch (_) {} A.out = null; return null; }
  }
  // per-station kit: destination + cached filters keyed by type/freq/q (reused by every note of that station)
  function kit(i) {
    if (A.kits[i]) return A.kits[i];
    const ac = A.ac, d = A.sg[i], cache = new Map();
    const K = {
      d, ac,
      filt(type, freq, q = 0.7) {
        const k = type + '|' + Math.round(freq) + '|' + q;
        let f = cache.get(k);
        if (!f) { f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; f.connect(d); cache.set(k, f); }
        return f;
      },
    };
    A.kits[i] = K;
    return K;
  }

  /* ------------------------------------------------------------------ synth helpers */
  function note(K, t, freq, dur, type, vol, att = 0.008, rel = 0.08, lpF = 0, bend = 0) {
    const ac = K.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.linearRampToValueAtTime(freq * bend, t + Math.min(0.16, dur * 0.4));
    att = Math.min(att, dur * 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.setValueAtTime(vol, t + Math.max(att, dur - rel)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(lpF ? K.filt('lowpass', lpF, 0.7) : K.d);
    o.start(t); o.stop(t + dur + 0.05); st.notes++;
  }
  function pluck(K, t, freq, dur, type, vol, lpF = 0) {
    const ac = K.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(lpF ? K.filt('lowpass', lpF, 0.7) : K.d);
    o.start(t); o.stop(t + dur + 0.05); st.notes++;
  }
  function hit(K, t, dur, type, freq, q, vol, cut) {
    const ac = K.ac, s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = A.noise;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004);
    if (cut) { g.gain.setValueAtTime(vol, t + dur - 0.01); g.gain.linearRampToValueAtTime(0.0001, t + dur); } // abrupt (squelch)
    else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(g); g.connect(K.filt(type, freq, q));
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  function kick(K, t, vol) {
    const ac = K.ac, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(K.d); o.start(t); o.stop(t + 0.2); st.notes++;
  }

  /* ------------------------------------------------------------------ programmes (called once per beat) */
  // 1. swing in F, 140 bpm: walking bass, comping on 2 & 4, brushes + ride, vibes melody in swung 8ths
  const SW = { spb: 60 / 140, bars: [[[53, 57, 60, 62]], [[50, 54, 57, 60]], [[55, 58, 62, 65]], [[48, 52, 55, 58]], [[57, 60, 64, 67], [50, 54, 57, 60]], [[55, 58, 62, 65], [48, 52, 55, 58]], [[53, 57, 60, 62]], [[48, 52, 55, 58]]], mel: [65, 67, 69, 72, 74, 77, 79, 81] };
  function swing(K, t, beat) {
    const spb = SW.spb, bar = Math.floor(beat / 4) % 8, bi = beat % 4, ch = SW.bars[bar], chord = ch.length > 1 && bi >= 2 ? ch[1] : ch[0];
    const nextBar = SW.bars[(bar + 1) % 8][0];
    const bassN = bi === 0 ? chord[0] - 12 : bi === 1 ? chord[1] - 12 : bi === 2 ? chord[2] - 12 : nextBar[0] - 12 + (beat % 8 < 4 ? 1 : -1);
    note(K, t, mf(bassN), spb * 0.9, 'triangle', 0.32, 0.01, 0.1);
    note(K, t, mf(bassN + 12), spb * 0.5, 'sine', 0.06, 0.01, 0.05);
    if (bi === 1 || bi === 3) for (const n of chord.slice(1)) note(K, t, mf(n + 12), spb * 0.35, 'triangle', 0.045, 0.006, 0.06, 2500);
    hit(K, t, spb * 0.8, 'bandpass', 3200, 0.6, bi % 2 ? 0.09 : 0.05);
    hit(K, t, 0.18, 'highpass', 7500, 0.5, 0.05);
    if (bi % 2) hit(K, t + spb * 2 / 3, 0.12, 'highpass', 7500, 0.5, 0.035);
    const r = rng(bar * 31 + bi * 7 + 3);
    for (const sub of [0, 2 / 3]) {
      if (r() < 0.35) continue;
      const m = SW.mel[Math.floor(r() * SW.mel.length)];
      pluck(K, t + sub * spb, mf(m), 0.7, 'sine', 0.11); pluck(K, t + sub * spb, mf(m + 12), 0.25, 'sine', 0.025);
    }
  }
  // 2. doo-wop / 50s rock'n'roll ballad, 72 bpm 12/8: I-vi-IV-V, piano triplets, "ooh" pad, backbeat, sax answer
  const DW = { spb: 60 / 72, bars: [[48, 52, 55, 60], [45, 48, 52, 57], [41, 45, 48, 53], [43, 47, 50, 55]], mel: [[76, 72], [76, 72], [77, 72], [74, 71]], sax: [[67, 69, 72, 69], [64, 67, 69, 67], [65, 69, 72, 74], [67, 71, 74, 71]] };
  function doowop(K, t, beat) {
    const spb = DW.spb, bar = Math.floor(beat / 4) % 4, bi = beat % 4, ch = DW.bars[bar], sec = Math.floor(beat / 32) % 2;
    for (let k = 0; k < 3; k++) pluck(K, t + k * spb / 3, mf(ch[(k + bi) % 4] + 12), 0.5, 'triangle', 0.07);
    if (bi === 0 || bi === 2) note(K, t, mf(ch[bi === 0 ? 0 : 2] - 12), spb * 1.6, 'triangle', 0.3, 0.01, 0.2);
    if (bi === 0) for (const n of ch) note(K, t, mf(n + 12), spb * 4, 'sawtooth', 0.018, 0.35, 0.5, 900);
    if (bi === 1 || bi === 3) hit(K, t, 0.22, 'bandpass', 1800, 0.8, 0.12);
    hit(K, t, 0.08, 'highpass', 8000, 0.5, 0.025);
    if (sec === 0) {
      if (bi === 0 || bi === 2) { const m = DW.mel[bar][bi === 0 ? 0 : 1]; note(K, t, mf(m), spb * 1.9, 'sine', 0.12, 0.05, 0.3); note(K, t, mf(m) * 1.005, spb * 1.9, 'sine', 0.05, 0.08, 0.3); }
    } else {
      // tenor sax answer (sawtooth through a warm lowpass, a little scoop up into each note)
      const m = DW.sax[bar][bi];
      note(K, t + spb / 3, mf(m - 12) * 0.97, spb * 0.62, 'sawtooth', 0.06, 0.03, 0.12, 1300, 1 / 0.97);
    }
  }
  // 3. country / bluegrass, 116 bpm: boom-chick bass, banjo forward rolls in 16ths, fiddle, train-beat brushes
  const CO = { spb: 60 / 116, prog: ['G', 'G', 'C', 'G', 'G', 'D', 'D', 'G'], ch: { G: [43, [55, 59, 62]], C: [48, [55, 60, 64]], D: [50, [57, 62, 66]] }, roll: [2, 1, 0, 2, 1, 0, 2, 0] };
  function country(K, t, beat) {
    const spb = CO.spb, bar = Math.floor(beat / 4) % 8, bi = beat % 4, [root, tri] = CO.ch[CO.prog[bar]];
    if (bi === 0 || bi === 2) note(K, t, mf(bi === 0 ? root : root - 5), spb * 0.6, 'triangle', 0.3, 0.005, 0.1);
    if (bi % 2) for (const n of tri) note(K, t, mf(n), spb * 0.2, 'square', 0.022, 0.003, 0.05, 1800);
    for (let k = 0; k < 4; k++) {
      const n = tri[CO.roll[(bi * 4 + k) % 8]] + 12, tt = t + (k * spb) / 4;
      pluck(K, tt, mf(n), 0.22, 'square', 0.028, 3200); pluck(K, tt, mf(n), 0.16, 'triangle', 0.03);
    }
    if (bi === 0 || bi === 2) {
      const r = rng(bar * 13 + bi + 5), m = tri[Math.floor(r() * 3)] + 12 + (r() < 0.3 ? 2 : 0);
      note(K, t, mf(m), spb * 1.9, 'sawtooth', 0.032, 0.06, 0.25, 2300, r() < 0.4 ? 1.02 : 0);
      note(K, t, mf(m) * 1.004, spb * 1.9, 'sawtooth', 0.02, 0.09, 0.25, 2300);
    }
    hit(K, t, 0.1, 'bandpass', 3000, 0.6, bi % 2 ? 0.06 : 0.035);
    hit(K, t + spb / 2, 0.08, 'bandpass', 3000, 0.6, 0.025);
  }
  // 4. slow blues shuffle in A, 76 bpm: 12 bars, boogie bass, organ pad, kick/snare, guitar licks with bends
  const BL = { spb: 60 / 76, prog: [0, 5, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7], walk: [0, 7, 9, 10], pent: [57, 60, 62, 64, 67, 69, 72] };
  function blues(K, t, beat) {
    const spb = BL.spb, bar = Math.floor(beat / 4) % 12, bi = beat % 4, r0 = 45 + BL.prog[bar];
    const off = BL.walk[bi];
    note(K, t, mf(r0 + off), spb * 0.6, 'triangle', 0.26, 0.006, 0.1);
    note(K, t + spb * 2 / 3, mf(r0 + off), spb * 0.3, 'triangle', 0.15, 0.006, 0.06);
    if (bi === 0) for (const iv of [12, 16, 19, 22]) { note(K, t, mf(r0 + iv), spb * 4, 'sine', 0.03, 0.15, 0.4); note(K, t, mf(r0 + iv + 12), spb * 4, 'triangle', 0.008, 0.2, 0.4, 1500); }
    if (bi === 0 || bi === 2) kick(K, t, 0.3);
    if (bi === 1 || bi === 3) hit(K, t, 0.2, 'bandpass', 1800, 0.7, 0.12);
    hit(K, t, 0.07, 'highpass', 7800, 0.5, 0.035); hit(K, t + spb * 2 / 3, 0.06, 'highpass', 7800, 0.5, 0.025);
    if (bar % 4 === 0 && bi >= 1) {
      const r = rng(bar * 17 + bi * 3 + 11);
      for (const sub of [0, 2 / 3]) {
        if (r() < 0.25) continue;
        const m = BL.pent[Math.floor(r() * BL.pent.length)];
        note(K, t + sub * spb, mf(m), spb * 0.55, 'sawtooth', 0.05, 0.005, 0.15, 2000, r() < 0.35 ? Math.pow(2, 2 / 12) : 0);
      }
    }
  }
  // 5. classical / lounge strings, 66 bpm: string pad (detuned saws), cello, harp arpeggios, violin line
  const STR = { spb: 60 / 66, ch: [[48, [60, 64, 67, 71]], [45, [57, 60, 64, 67]], [50, [60, 62, 65, 69]], [43, [59, 62, 65, 67]], [41, [57, 60, 64, 65]], [40, [59, 62, 64, 67]], [50, [60, 62, 65, 69]], [43, [59, 62, 65, 67]]] };
  function strings(K, t, beat) {
    const spb = STR.spb, bar = Math.floor(beat / 4) % 8, bi = beat % 4, [root, tones] = STR.ch[bar];
    if (bi === 0) {
      for (const n of tones) { note(K, t, mf(n), spb * 4.3, 'sawtooth', 0.014, 0.7, 0.9, 1500); note(K, t, mf(n) * 1.0035, spb * 4.3, 'sawtooth', 0.01, 0.8, 0.9, 1500); }
      note(K, t, mf(root), spb * 4.2, 'sawtooth', 0.045, 0.4, 0.8, 700);
    }
    for (let k = 0; k < 2; k++) pluck(K, t + (k * spb) / 2, mf(tones[(bi * 2 + k) % 4] + 12), 1.2, 'sine', 0.055);
    if (bi === 0 || bi === 2) {
      const r = rng(bar * 7 + bi + 19), m = tones[Math.floor(r() * 4)] + 12;
      note(K, t, mf(m), spb * 1.95, 'sawtooth', 0.026, 0.28, 0.4, 2600); note(K, t, mf(m) * 0.997, spb * 1.95, 'sawtooth', 0.018, 0.32, 0.4, 2600);
    }
  }
  // 6. American police scanner: key-up clicks, garbled formant "voices" (no words), squelch tails, dispatch alert
  //    tones, static bursts and quiet gaps. Event-driven on a 0.25 s tick.
  const VOW = [[730, 1090, 2440], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [300, 870, 2240], [660, 1720, 2410]];
  function vox(K) {
    if (K.vox) return K.vox;
    const ac = K.ac, mix = ac.createGain(); mix.gain.value = 1;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2700;
    mix.connect(hp); hp.connect(lp); lp.connect(K.d);
    const inp = ac.createGain(); inp.gain.value = 1;
    const F = [1, 0.55, 0.28].map((lvl, i) => {
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = VOW[0][i]; f.Q.value = 7 + i * 2;
      const g = ac.createGain(); g.gain.value = lvl * 2.2; inp.connect(f); f.connect(g); g.connect(mix); return f;
    });
    K.vox = { inp, F, lp };
    return K.vox;
  }
  function transmission(K, t, dur, voice) {
    const ac = K.ac, V = vox(K), r = Math.random;
    hit(K, t, 0.03, 'highpass', 2500, 0.7, 0.1); // key-up click
    hit(K, t, dur, 'bandpass', 1800, 0.5, 0.018); // carrier hiss under the voice
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(voice.f0, t);
    g.gain.setValueAtTime(0.0001, t);
    o.connect(g); g.connect(V.inp);
    let tt = t + 0.08; const end = t + dur;
    while (tt < end - 0.06) {
      const syl = 0.07 + r() * 0.13, v = VOW[Math.floor(r() * VOW.length)], amp = 0.16 * (0.55 + 0.45 * r());
      for (let i = 0; i < 3; i++) V.F[i].frequency.setValueAtTime(v[i] * voice.fs * (0.94 + r() * 0.12), tt);
      o.frequency.setValueAtTime(voice.f0 * (0.9 + r() * 0.28), tt);
      o.frequency.linearRampToValueAtTime(voice.f0 * (0.82 + r() * 0.22), tt + syl);
      g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(amp, tt + 0.018);
      g.gain.setValueAtTime(amp * 0.8, tt + syl * 0.7); g.gain.linearRampToValueAtTime(0.0001, tt + syl);
      if (r() < 0.45) hit(K, Math.max(t, tt - 0.012), 0.035, 'highpass', 3200, 0.6, 0.045); // consonant
      tt += syl + (r() < 0.2 ? 0.12 + r() * 0.16 : 0.02 + r() * 0.05);
    }
    o.start(t); o.stop(end + 0.1); st.notes++;
    hit(K, end, 0.13 + r() * 0.08, 'bandpass', 2100, 0.35, 0.15, true); // squelch tail ("kssht", abrupt cut)
  }
  function alertTone(K, t) {
    const kind = Math.floor(Math.random() * 3);
    if (kind === 0) { for (let i = 0; i < 6; i++) note(K, t + i * 0.2, i % 2 ? 960 : 853, 0.19, 'sine', 0.07, 0.005, 0.01); return 1.25; } // hi-lo
    if (kind === 1) { for (let i = 0; i < 3; i++) note(K, t + i * 0.22, 1050, 0.13, 'square', 0.03, 0.003, 0.02, 2400); return 0.75; } // three beeps
    note(K, t, 1000, 0.95, 'sine', 0.06, 0.01, 0.05); return 1.0; // long attention tone
  }
  function scanner(K, t, beat, S) {
    if (beat < S.next) return;
    const spb = 0.25, r = Math.random, x = r();
    const dispatcher = { f0: 195 + r() * 30, fs: 1.15 }, officer = { f0: 105 + r() * 30, fs: 1.0 };
    let span;
    if (x < 0.14) { // static burst / crackle
      const d = 0.3 + r() * 0.6;
      for (let k = 0; k < 4; k++) hit(K, t + k * d / 4, d / 4 + 0.03, 'bandpass', 1300 + r() * 1400, 0.5, 0.05 + r() * 0.08);
      span = d + 0.6 + r() * 1.6;
    } else if (x < 0.3) { // dispatch alert + dispatcher
      const a = alertTone(K, t), d = 1.6 + r() * 2.2;
      transmission(K, t + a + 0.25, d, dispatcher);
      span = a + 0.25 + d + 0.5 + r() * 2.0;
    } else {
      const d = 1.1 + r() * 2.6, who = r() < 0.45 ? dispatcher : officer;
      transmission(K, t, d, who);
      span = d + (r() < 0.35 ? 0.35 + r() * 0.4 : 0.9 + r() * 2.8); // sometimes an immediate reply
    }
    st.events++;
    S.next = beat + Math.max(1, Math.ceil(span / spb));
  }
  const PROG = [swing, doowop, country, blues, strings, scanner];
  const SPB = [SW.spb, DW.spb, CO.spb, BL.spb, STR.spb, 0.25];

  /* ------------------------------------------------------------------ pump: dial tween, mix, scheduling */
  function clockNow() {
    const ac = A.ac;
    if (ac && (ac.state === undefined || ac.state === 'running')) return ['a', ac.currentTime];
    return ['p', perfNow()];
  }
  function stepTune() {
    const T = st.tune; if (!T) return;
    const [dom, v] = clockNow();
    if (T.dom !== dom) { T.dom = dom; T.last = v; }
    T.k = Math.min(1, T.k + Math.max(0, v - T.last) / T.dur); T.last = v;
    const k = T.k, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    st.f = T.a + (T.b - T.a) * e;
    if (k >= 1) { st.f = T.b; st.tune = null; emit(); }
  }
  const tuned = (f) => STATIONS.map((s) => clamp(1 - Math.abs(f - s.f) / TUNE_W, 0, 1));
  function pump() {
    stepTune();
    if (L.on) applyLiveVol();
    if (!st.on && !A.out) return;
    const ac = A.out ? A.ac : build();
    if (!ac || !A.out) return;
    const now = ac.currentTime;
    const tu = tuned(st.f);
    let best = -1, bv = 0.02;
    for (let i = 0; i < tu.length; i++) if (tu[i] > bv) { bv = tu[i]; best = i; }
    const total = Math.max(...tu);
    try {
      A.stat.gain.setTargetAtTime(st.on ? 0.02 + (1 - total) * 0.42 : 0.0001, now, 0.04);
      for (let i = 0; i < A.sg.length; i++) A.sg[i].gain.setTargetAtTime(st.on ? Math.pow(tu[i], 1.5) * 0.9 : 0, now, 0.05);
    } catch (_) { /* param */ }
    if (!st.on) best = -1;
    if (best !== st.cur) {
      st.cur = best;
      if (best >= 0) { A.clocks[best].t = now + 0.06; A.clocks[best].beat = 0; A.S[best].next = 0; }
      emit();
    }
    if (best >= 0) {
      const ck = A.clocks[best], K = kit(best);
      if (ck.t < now) ck.t = now + 0.02;
      let guard = 0;
      while (ck.t < now + LOOK && guard++ < 16) {
        try { PROG[best](K, ck.t, ck.beat, A.S[best]); } catch (e) { if (!pump._warned) { pump._warned = true; try { console.warn('[radio] programme', e); } catch (_) {} } }
        ck.t += SPB[best]; ck.beat++;
      }
    }
    // mix: comfortable background level everywhere + louder, panned mix near the 3D radio
    let att = 0, pan = 0;
    try {
      const s = srcFn && srcFn(), l = lisFn && lisFn();
      if (s && l) {
        const dx = s.x - l.x, dy = (s.y || 0) - (l.y || 0), dz = s.z - l.z, d = Math.hypot(dx, dy, dz);
        att = 1 / (1 + (d * d) / (2.4 * 2.4));
        if (d > 0.05 && isFinite(l.yaw)) { const rx = Math.cos(l.yaw), rz = -Math.sin(l.yaw); pan = clamp((dx * rx + dz * rz) / Math.max(0.3, Math.hypot(dx, dz)), -1, 1) * 0.75; }
      }
    } catch (_) { att = 0; }
    const v = st.on ? st.vol * st.duckK : 0;
    st.base = v * BASE; st.near = v * NEAR * att;
    try {
      A.base.gain.setTargetAtTime(Math.max(0.0001, st.base), now, 0.12);
      A.near.gain.setTargetAtTime(Math.max(0.0001, st.near), now, 0.12);
      if (A.pan) A.pan.pan.setTargetAtTime(pan, now, 0.1);
      A.out.gain.setTargetAtTime(st.on && !st.hidden ? 1 : 0.0001, now, st.on ? 0.25 : 0.06); // tube warm-up on power-on
    } catch (_) { /* param */ }
  }
  function startTimer() {
    if (A.iv || typeof setInterval !== 'function') return;
    A.iv = setInterval(pump, 100);
    if (A.iv && typeof A.iv.unref === 'function') A.iv.unref();
  }
  function stopTimer() { if (A.iv) { clearInterval(A.iv); A.iv = null; } }
  try {
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => { st.hidden = !!document.hidden; pump(); });
    }
  } catch (_) { /* no DOM (tests) */ }


  /* ------------------------------------------------------------------ V7 HITS live streams (<audio>) */
  // avail: 'yes' (live streams usable: the built-in list is known from the start) | 'no' (CSP-blocked → backup synth)
  // status: 'idle' | 'connecting' | 'playing' | 'error' (skipping to the next station) | 'unavailable' (every station failed)
  const L = { avail: 'yes', loaded: false, list: builtinList(), on: false, key: null, status: 'idle', el: null, token: 0, unlocked: false, failedRun: new Set(), loadP: null, source: 'builtin', csp: false, gestureBlocked: false, lastCT: -1, lastProg: 0, wd: 0, skips: 0 };
  const noticeSubs = new Set();
  const notice = (msg, kind) => { for (const f of noticeSubs) { try { f(msg, kind || 'info'); } catch (_) {} } };
  const canLive = () => typeof fetch === 'function' && typeof Audio === 'function' && typeof document !== 'undefined' && typeof document.addEventListener === 'function';
  const pageHttps = () => { try { return globalThis.location && globalThis.location.protocol === 'https:'; } catch (_) { return false; } };
  const byKey = (k) => L.list.find((s) => s.key === k) || null;
  const firstKey = () => (L.list[0] ? L.list[0].key : null);
  if (!canLive()) { L.avail = 'no'; L.list = []; }
  // CSP (claude.ai artifact): a blocked connect-src / media-src request fires securitypolicyviolation
  try {
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('securitypolicyviolation', (e) => {
      const d = String(e.effectiveDirective || e.violatedDirective || '');
      if (/connect-src|media-src|default-src/.test(d) && !/^(data|blob):/.test(String(e.blockedURI || ''))) L.csp = true;
    });
  } catch (_) { /* no DOM */ }
  const blockedNow = () => L.csp || isClaudeHost();
  const tick = (ms) => new Promise((r) => setTimeout(r, ms));

  // 0.1 s silent WAV, played synchronously inside the first gesture so iOS lets this element play later (async)
  function silentWav() {
    const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer), w = (o, t) => { for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) b[44 + i] = 128;
    let bin = ''; for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }
  // a playing station broke (error / ended / 7 s without progress) → toast + skip to the next HITS station
  function broke(why) {
    if (!L.on || L.status !== 'playing') return;
    L.status = 'error'; L.failedRun.add(L.key); stopEl(); emit();
    const tok = L.token;
    setTimeout(() => { if (L.on && L.status === 'error' && tok === L.token) skip(why || 'drop'); }, 300);
  }
  function liveEl() {
    if (L.el || !canLive()) return L.el;
    const el = new Audio(); // crossOrigin deliberately NOT set (no CORS needed; the element is not routed into WebAudio)
    el.preload = 'none';
    try { el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', ''); } catch (_) {}
    el.addEventListener('error', () => broke('error')); el.addEventListener('ended', () => broke('ended'));
    L.el = el;
    return el;
  }
  // stall watchdog: while "playing", the stream must advance; 7 s without progress = unavailable → next station
  function watchdog() {
    if (L.wd || typeof setInterval !== 'function') return;
    L.wd = setInterval(() => {
      if (!L.on || L.status !== 'playing' || !L.el) { L.lastCT = -1; return; }
      const t = Date.now(); let ct = -1; try { ct = +L.el.currentTime || 0; } catch (_) { ct = -1; }
      if (L.lastCT < 0 || ct > L.lastCT + 0.01 || (L.el.paused && !L.on)) { L.lastCT = ct; L.lastProg = t; return; }
      if (t - L.lastProg > STALL_MS) { L.lastCT = -1; broke('stall'); }
    }, 1000);
    if (L.wd && typeof L.wd.unref === 'function') L.wd.unref();
  }
  function unlockLive() {
    if (L.unlocked || L.avail === 'no') return;
    const el = liveEl(); if (!el) return;
    L.unlocked = true;
    try { el.src = silentWav(); const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
  }
  function stopEl() {
    const el = L.el; if (!el) return;
    try { el.pause(); el.removeAttribute('src'); el.load(); } catch (_) {}
  }
  const withTimeout = (ms) => { const c = typeof AbortController !== 'undefined' ? new AbortController() : null; const t = setTimeout(() => c && c.abort(), ms); return { signal: c ? c.signal : undefined, done: () => clearTimeout(t) }; };
  async function getJSON(url, ms) {
    const T = withTimeout(ms);
    try { const r = await fetch(url, { signal: T.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { T.done(); }
  }
  // 24 h cache of the resolved list (a network cache, not a user choice: refresh still starts from WNCI)
  function readCache(maxAge) {
    try { const c = JSON.parse(lsGet(CACHE_KEY) || 'null'); if (c && Array.isArray(c.list) && c.list.length && Date.now() - c.t < maxAge && c.https === pageHttps() && c.list[0].key === WNCI.key) return c.list; } catch (_) {}
    return null;
  }
  // station list: built-in (instant) → localStorage (24 h) / radio-browser mirrors (4 s each) → stale cache (30 days)
  function load() {
    if (L.loadP) return L.loadP;
    if (!canLive()) { L.avail = 'no'; L.loaded = true; emit(); return (L.loadP = Promise.resolve(false)); }
    L.loadP = (async () => {
      let list = readCache(CACHE_MS); if (list) L.source = 'cache';
      if (!list) {
        for (const m of RB_MIRRORS) {
          if (L.csp) break;
          try {
            const [a, b] = await Promise.all([getJSON(m + RB_QUERY, RB_TIMEOUT), getJSON(m + RB_QUERY_HITS, RB_TIMEOUT)]);
            list = pickHits([a, b], { https: pageHttps() }); L.source = m; break;
          } catch (_) { list = null; }
        }
        if (list && list.length) lsSet(CACHE_KEY, JSON.stringify({ t: Date.now(), https: pageHttps(), list }));
        if (!list) { const stale = readCache(30 * CACHE_MS); if (stale) { list = stale; L.source = 'stale-cache'; } }
      }
      if (!list || !list.length) { await tick(40); if (blockedNow()) { L.loaded = true; L.avail = 'no'; emit(); return false; } list = builtinList(); L.source = 'builtin'; }
      L.loaded = true; L.list = list; L.avail = 'yes';
      emit();
      return true;
    })();
    return L.loadP;
  }
  // one URL: resolves true when it plays, false on error / reject / time budget
  function attempt(url, tok, ms) {
    return new Promise((res) => {
      const el = liveEl(); if (!el || tok !== L.token || ms <= 0) return res(false);
      let done = false, to = 0;
      const fin = (ok) => { if (done) return; done = true; clearTimeout(to); el.removeEventListener('playing', onP); el.removeEventListener('error', onE); res(ok && tok === L.token); };
      const onP = () => { if (el.src === url || el.currentSrc === url) fin(true); };
      const onE = () => fin(false);
      el.addEventListener('playing', onP); el.addEventListener('error', onE);
      to = setTimeout(() => fin(false), ms);
      try {
        el.src = url; applyLiveVol();
        const p = el.play();
        if (p && p.then) p.then(() => { if (el.src === url) fin(true); }, (e) => { if (e && e.name === 'NotAllowedError') L.gestureBlocked = true; fin(false); });
      } catch (_) { fin(false); }
    });
  }
  function toBackup() {
    L.token++; L.on = false; L.status = 'idle'; L.avail = 'no'; stopEl();
    notice(BACKUP_HE + ' · ' + LIVE_NOTE, 'info');
    backupPlay();
  }
  // play HITS station `key` (7 s budget across its URLs). o.skip = part of an auto-skip chain
  async function playStation(key, o = {}) {
    if (L.avail === 'no') { if (!st.on) backupPlay(); return false; }
    unlockLive(); // synchronous, inside the gesture when called from one
    const Sx = byKey(key) || byKey(firstKey());
    if (!Sx) return false;
    if (!o.skip) { L.failedRun.clear(); L.skips = 0; }
    const tok = ++L.token;
    if (st.on) { st.on = false; pump(); }
    L.on = true; L.key = Sx.key; L.status = 'connecting';
    sweep(dialUnits(Sx)); startTimer(); watchdog(); emit();
    const end = Date.now() + PLAY_TIMEOUT; L.gestureBlocked = false;
    let ok = false;
    for (const u of Sx.urls) { if (tok !== L.token) return false; if (await attempt(u, tok, end - Date.now())) { ok = true; break; } }
    if (tok !== L.token) return false; // superseded by another pick / stop
    if (ok) { L.status = 'playing'; L.failedRun.clear(); L.lastCT = -1; L.lastProg = Date.now(); emit(); return true; }
    if (L.gestureBlocked) { // autoplay refused (no usable gesture yet, e.g. iOS): not the station's fault — wait for a tap
      L.gestureBlocked = false; L.unlocked = false; L.on = false; L.status = 'idle'; L.failedRun.clear(); stopEl(); emit();
      notice('הקישו על 📻 או על תחנה כדי להפעיל את הרדיו', 'info'); return false;
    }
    await tick(40);
    if (tok !== L.token) return false;
    if (L.csp) { toBackup(); return false; } // media-src blocked by CSP
    L.failedRun.add(Sx.key); stopEl(); L.status = 'error'; emit();
    skip('fail');
    return false;
  }
  // auto-skip to the next HITS station (list order) that has not failed in this chain; all failed → unavailable
  function skip(why) {
    const n = L.list.length;
    if (!n || L.list.every((s) => L.failedRun.has(s.key))) {
      L.failedRun.clear(); L.token++; L.on = false; L.status = 'unavailable'; stopEl(); emit();
      notice(UNAVAIL_HE, 'error'); return;
    }
    let i = L.list.findIndex((s) => s.key === L.key);
    for (let k = 0; k < n; k++) { i = (i + 1) % n; if (!L.failedRun.has(L.list[i].key)) break; }
    const from = byKey(L.key), to = L.list[i];
    L.skips++;
    notice(STATION_DOWN_HE + (from ? ' (' + stationLabel(from) + ')' : '') + ' — ' + 'עוברים ל-' + stationLabel(to), 'error');
    playStation(to.key, { skip: true, why });
  }
  function stopLive(quiet) {
    if (!L.on && L.status === 'idle') return;
    L.token++; L.on = false; L.status = 'idle'; stopEl(); if (!quiet) emit();
  }
  function applyLiveVol() {
    const el = L.el; if (!el) return;
    let att = 0;
    try { const s = srcFn && srcFn(), l = lisFn && lisFn(); if (s && l) { const d = Math.hypot(s.x - l.x, (s.y || 0) - (l.y || 0), s.z - l.z); att = 1 / (1 + (d * d) / (2.4 * 2.4)); } } catch (_) { att = 0; }
    try { el.volume = clamp(st.vol * st.duckK * (0.6 + 0.4 * att), 0, 1); } catch (_) { /* iOS: read-only */ }
    let muted = false; try { muted = !!(api._audio && api._audio.muted); } catch (_) {}
    if (el.muted !== muted) el.muted = muted; // core mute (🔊 button) silences the stream too
  }
  // needle-only sweep (no synth audio)
  function sweep(b, from) { const [dom, v] = clockNow(); const a = from != null ? clamp(from, FMIN, FMAX) : st.f; st.tune = Math.abs(b - a) < 0.5 ? null : { a, b, k: 0, dur: clamp(Math.abs(b - a) / 650, 0.45, 1.3), dom, last: v }; st.f = st.tune ? a : b; }
  const liveIdx = () => L.list.findIndex((s) => s.key === L.key);
  const step = (d) => { const n = L.list.length; if (!n) return null; let i = liveIdx(); if (i < 0) i = d > 0 ? -1 : 0; return L.list[(((i + d) % n) + n) % n].key; };

  /* ------------------------------------------------------------------ synth backup (CSP-blocked page only) */
  function tune(idx, o = {}) {
    idx = ((Math.round(idx) % STATIONS.length) + STATIONS.length) % STATIONS.length;
    st.idx = idx;
    const b = STATIONS[idx].f, a = o.from != null ? clamp(o.from, FMIN, FMAX) : st.f;
    if (o.instant || Math.abs(b - a) < 0.5) { st.tune = null; st.f = b; }
    else { const [dom, v] = clockNow(); st.tune = { a, b, k: 0, dur: clamp(Math.abs(b - a) / 650, 0.45, 1.3), dom, last: v }; st.f = a; }
    if (!st.on) { st.on = true; startTimer(); }
    pump(); emit();
    return api;
  }
  function backupPlay(idx) {
    stopLive(true);
    if (idx == null) idx = MUSIC[Math.floor(Math.random() * MUSIC.length)];
    const b = STATIONS[idx].f, from = clamp(b + (Math.random() < 0.5 ? -1 : 1) * (45 + Math.random() * 50), FMIN, FMAX);
    return tune(idx, { from });
  }
  const backupStep = (d) => { const k = MUSIC.indexOf(st.idx); return MUSIC[(((k < 0 ? 0 : k) + d) % MUSIC.length + MUSIC.length) % MUSIC.length]; };

  /* ------------------------------------------------------------------ public API */
  const isBackup = () => L.avail === 'no';
  const liveView = () => {
    const Sx = byKey(L.key);
    return { avail: L.avail, loaded: L.loaded, on: L.on, key: L.key, status: L.status, station: Sx, list: L.list.slice(), best: firstKey(), source: L.source, csp: L.csp, skips: L.skips,
      urls: Sx ? Sx.urls.slice() : [], src: L.el ? L.el.src : '', muted: L.el ? !!L.el.muted : null, volume: L.el ? L.el.volume : null };
  };
  const api = {
    _audio: audio || null,
    stations: STATIONS, // synthesized backup programmes; not listed in the UI
    hits: HITS, columbus: COLUMBUS, station: WNCI,
    get state() {
      return { on: st.on || L.on, synthOn: st.on, backup: isBackup(), idx: st.idx, f: st.f, vol: st.vol, ducked: st.duckK < 1, cur: st.cur, tuning: !!st.tune, station: STATIONS[st.idx],
        playing: (st.on && st.cur >= 0) || (L.on && L.status === 'playing'), liveStation: byKey(L.key), live: liveView() };
    },
    get on() { return st.on || L.on; }, get idx() { return st.idx; }, get f() { return st.f; }, get cur() { return st.cur; },
    get volume() { return st.vol; }, get effectiveVolume() { return st.vol * st.duckK; }, get ducked() { return st.duckK < 1; },
    get tuning() { return !!st.tune; }, get autoDone() { return st.autoDone; }, get backup() { return isBackup(); },
    get live() { return liveView(); },
    get liveStations() { return L.list; },
    probe: load, load,
    playStation(key) { playStation(key); return api; },
    play(key) {
      if (isBackup()) { if (!st.on) backupPlay(st.idx >= 0 && MUSIC.includes(st.idx) ? st.idx : undefined); return api; }
      playStation(key || L.key || firstKey()); return api;
    },
    stop() { const was = st.on || L.on || L.status !== 'idle'; st.on = false; stopLive(true); L.status = 'idle'; pump(); stopTimer(); if (was) emit(); return api; },
    toggle() { return (st.on || L.on) ? api.stop() : api.play(); },
    next() { if (isBackup()) return backupPlay(backupStep(st.on ? 1 : 0)); playStation(L.key ? step(1) : firstKey()); return api; },
    prev() { if (isBackup()) return backupPlay(backupStep(-1)); playStation(step(-1)); return api; },
    random() {
      if (isBackup()) return backupPlay(MUSIC.filter((i) => i !== st.idx)[Math.floor(Math.random() * (MUSIC.length - 1))]);
      const pool = L.list.filter((s) => s.key !== L.key);
      if (pool.length) playStation(pool[Math.floor(Math.random() * pool.length)].key);
      return api;
    },
    playRandom() { return api.random(); },
    // "נסו שוב" button: a fresh chain from WNCI 97.9 (the first station)
    retry() { if (isBackup()) return api.play(); playStation(firstKey()); return api; },
    // 3D tuning knob: off → play; on → next HITS station
    retune() { if (!api.on) return api.play(); return api.next(); },
    tune(i, o) { stopLive(true); return tune(i, o); }, // synth programme (backup / tests)
    onNotice(fn) { if (typeof fn === 'function') noticeSubs.add(fn); return () => noticeSubs.delete(fn); },
    nowName() {
      if (st.on) { const s = STATIONS[st.cur >= 0 ? st.cur : st.idx]; return s ? BACKUP_HE + ' · ' + s.he : BACKUP_HE; }
      const Sx = byKey(L.key) || WNCI;
      return stationLabel(Sx) + ' · ' + HITS_HE;
    },
    liveDial(key) { return dialUnits(byKey(key) || WNCI); },
    // volume is per visit (a refresh starts at the default; nothing is stored)
    setVolume(v) { st.vol = clamp(+v || 0, 0, 1); applyLiveVol(); pump(); emit(); return api; },
    // V7: lower the radio while the TV plays a live channel (does not touch the user's volume)
    duck(on) { const k = on ? DUCK_K : 1; if (k === st.duckK) return api; st.duckK = k; applyLiveVol(); pump(); emit(); return api; },
    // called once on the first user gesture (browsers block audio before one): always WNCI 97.9 first
    autostart() {
      if (st.autoDone) return false; st.autoDone = true;
      if (isBackup()) { backupPlay(); return true; }
      if (!L.loadP) load();
      playStation(WNCI.key);
      return true;
    },
    onChange(fn) { if (typeof fn === 'function') { subs.add(fn); try { fn(api.state); } catch (_) {} } return () => subs.delete(fn); },
    // ask the UI to open the radio panel (e.g. from the 3D radio)
    openPanel(section) { for (const f of panelSubs) { try { f(section || 'live'); } catch (_) {} } return panelSubs.size > 0; },
    onPanelRequest(fn) { if (typeof fn === 'function') panelSubs.add(fn); return () => panelSubs.delete(fn); },
    setSource(fn) { srcFn = typeof fn === 'function' ? fn : null; },
    setListener(fn) { lisFn = typeof fn === 'function' ? fn : null; },
    pump,
    debug() { return { ctx: A.ac ? (A.ac.state || 'fake') : 'none', built: !!A.out, notes: st.notes, events: st.events, cur: st.cur, f: +st.f.toFixed(1), on: st.on, base: +st.base.toFixed(3), near: +st.near.toFixed(3), timer: !!A.iv, avail: L.avail, live: L.status, duck: st.duckK }; },
  };
  SINGLETON = api;
  if (opts.autoTimer) startTimer();
  return api;
}

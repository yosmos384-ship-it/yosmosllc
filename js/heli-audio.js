// heli-audio.js — V13 HELI: procedural helicopter sound (WebAudio only, no samples) + the pilot's voice.
//   • main rotor: a phase-locked "blade pulse" oscillator at the blade-passage rate (5 blades × 6.5 rev/s × rpm) whose
//     harmonic content (low-pass) and the band-passed noise "slap" it gates open with rotor load (power / collective,
//     speed, descent = blade-vortex interaction); a low thump; the whole rotor follows the rotor rpm.
//   • tail rotor buzz (4 blades × 5.2 × main rev rate) that gets louder with yaw input / power.
//   • twin-turbine whine (two slightly detuned engines → slow beating) + intake hiss + combustion roar; the engine
//     speed N1 spools up / down with real lag (startup ≈ 9 s, spool-down ≈ 4 s on stop()).
//   • wind noise rising with airspeed; "headset-muffled" inside the cabin (low-pass, rotor thump forward, whine
//     faint), open + air-absorbed + doppler-shifted outside (pitch follows the closing speed toward the camera).
//   • engine-start sequence (door shut → belt click → starter whine → igniter ticks → light-off → spool-up) the first
//     time the cabin view is heard (or set({ startup: true })); doors: door(open).
//   • pilot radio: mic-key click + squelch + a two-tone cabin chime, then a short spoken guide line per tour place via
//     speechSynthesis in the active language (he-IL / en-US / es-MX; Hebrew is only spoken by a Hebrew voice — never
//     read out by an English voice). Optional: voice on / off (setVoice) — remembered for this page session only.
//   • the house radio in the cabin: the SAME radio-engine (hits stations, WNCI 97.9 first, auto-skip, same current
//     station) keeps playing in the helicopter, mixed under the rotor / turbines: headset level in the cockpit view,
//     low ("heard through the fuselage") in the outside / top-down views, briefly lowered while the pilot speaks; the
//     pilot switches it on ~6 s into the engine start unless the visitor turned it off in the helicopter. On stop()
//     the visitor's volume is restored and the station KEEPS playing in the house. The live stream is an <audio>
//     element without CORS (radio-engine.js), so it cannot be filtered by WebAudio — "muffled" = level only.
//   • heliRadio (export): { toggle, play, stop, next, prev, current(lang), label(lang), onChange(fn), on } for the
//     cockpit radio button / station display (heli-ui.js, heli-avionics.js).
// Autoplay rules: nothing is created before a user gesture (core's audio.ctx is null until then; we also check
// navigator.userActivation) — the first set() after the gesture builds the graph.
//
//   createHeliAudio(getCtx, opts?) → {
//     set({ rpm 0..1, power 0..1, inside, closing m/s, dist m, mute,
//           speed m/s?, vy m/s?, yaw −1..1?, poi?, phase?, lang?, startup?, radio? }),
//     stop({ quick }?), door(open), chime(), say(text, { lang }?), sayKey(key, ...args), announce(poi),
//     setVoice(on), setMuted(on), voice, muted, started, speaking, debug()
//   }
// No side effects on import.
import { HELI_STRINGS, SPEECH_LANG, poiName, poiGuideLine, heliText } from './heli-strings.js';
import * as I18N from './i18n.js';
import { getRadio } from './radio-engine.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const BLADES = 5, REV = 6.5, TAIL_BLADES = 4, TAIL_RATIO = 5.2;
// page-session preferences shared by every helicopter sound instance (parked + world); not stored (the language is
// the only UI choice that survives a refresh)
const PREF = { voice: true, muted: false, radioAuto: true };
const NOISE = new WeakMap(); // AudioContext → { pink, white }
const SHUT = new Set();        // every instance's "stop talking now" (heliVoice.set(false) silences them all)
const VOICE_SUBS = new Set();  // heliVoice.onChange listeners
function setVoicePref(on) {
  on = !!on; const changed = on !== PREF.voice; PREF.voice = on;
  if (!on) for (const f of SHUT) { try { f(); } catch (_) {} }
  if (changed) for (const f of VOICE_SUBS) { try { f(on); } catch (_) {} }
  return on;
}
// does the browser have a speech voice for UI language L? (Hebrew needs a real Hebrew voice; en / es fall back to the
// browser default voice while the list is still loading)
function voiceFor(L) {
  try {
    if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return false;
    const list = window.speechSynthesis.getVoices() || [];
    const two = (SPEECH_LANG[L] || 'he-IL').slice(0, 2);
    if (list.some((v) => { const l = String(v.lang || '').toLowerCase(); return l.startsWith(two) || (two === 'he' && l.startsWith('iw')); })) return true;
    return L !== 'he' && !list.length;
  } catch (_) { return false; }
}

function findRadio(r) {
  try { return r || (typeof window !== 'undefined' && window.__tour && window.__tour.radio) || getRadio() || null; } catch (_) { return null; }
}
function gestured() {
  try { const u = typeof navigator !== 'undefined' && navigator.userActivation; if (u && u.hasBeenActive === false) return false; } catch (_) {}
  return true;
}
function curLang(o) {
  const l = (o && o.lang) || (() => { try { return typeof I18N.getLang === 'function' ? I18N.getLang() : 'he'; } catch (_) { return 'he'; } })();
  return HELI_STRINGS[l] ? l : 'he';
}
function noiseBuffers(A) {
  let n = NOISE.get(A); if (n) return n;
  const len = Math.floor(A.sampleRate * 3);
  const pink = A.createBuffer(1, len, A.sampleRate), white = A.createBuffer(1, len, A.sampleRate);
  const p = pink.getChannelData(0), w = white.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const x = Math.random() * 2 - 1; w[i] = x * 0.7;
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.12; b6 = x * 0.115926;
  }
  // seamless loop: cross-fade the last 50 ms into the start
  const xf = Math.floor(A.sampleRate * 0.05);
  for (const d of [p, w]) for (let i = 0; i < xf; i++) { const k = i / xf; d[len - xf + i] = d[len - xf + i] * (1 - k) + d[i] * k; }
  n = { pink, white }; NOISE.set(A, n); return n;
}

export function createHeliAudio(getCtx, opts = {}) {
  let A = null, N = null;
  const eng = { n1: 0, rot: 0, lastT: 0, startAt: -1, startDur: 9, starting: false, didStartup: false, doorOpen: false, wasLanded: false, phase: '', poiId: '', speed: 0, inside: false, flying: false };
  const mix = { r: null, v0: null, last: -1, autoAt: 0 }; // the radio this cabin took over (volume restored on stop)
  let speech = { on: false, utter: null, until: 0 };
  let lastSet = {};
  const timers = new Set();
  const later = (ms, f) => { const id = setTimeout(() => { timers.delete(id); try { f(); } catch (_) {} }, ms); timers.add(id); return id; };

  /* ---------------------------------------------------------------- graph */
  function ctx() {
    if (A) return A;
    if (!gestured()) return null;
    try { A = getCtx(); } catch (_) { A = null; }
    if (A && typeof A.createGain !== 'function') A = null;
    return A;
  }
  function start() {
    if (N) return true;
    if (!ctx()) return false;
    try {
      if (A.state === 'suspended' && A.resume) A.resume().catch(() => {});
      const t = A.currentTime;
      const g = (v = 0) => { const n = A.createGain(); n.gain.value = v; return n; };
      const f = (type, freq, Q = 0.7) => { const n = A.createBiquadFilter(); n.type = type; n.frequency.value = freq; n.Q.value = Q; return n; };
      const NB = noiseBuffers(A);
      // output chain: lowBus → muffle LP → body (low shelf) ┐
      //               hiBus  → hiLP ────────────────────────┼→ master → comp → destination
      //               fxBus (chimes / doors / starter) ─────┘
      const comp = A.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.25;
      const master = g(0); master.connect(comp).connect(A.destination);
      const lowBus = g(1), muffle = f('lowpass', 9000, 0.6), body = A.createBiquadFilter(); body.type = 'lowshelf'; body.frequency.value = 140; body.gain.value = 0;
      lowBus.connect(muffle).connect(body).connect(master);
      const hiBus = g(1), hiLP = f('lowpass', 12000, 0.5); hiBus.connect(hiLP).connect(master);
      const fxBus = g(0.9); fxBus.connect(master);
      // noise sources (two decorrelated loops)
      const nA = A.createBufferSource(); nA.buffer = NB.pink; nA.loop = true;
      const nB = A.createBufferSource(); nB.buffer = NB.pink; nB.loop = true; nB.playbackRate.value = 0.93;
      const nW = A.createBufferSource(); nW.buffer = NB.white; nW.loop = true;
      // --- main rotor: blade pulse (rich harmonics, cos phase → a sharp "whop" per blade)
      const H = 28, re = new Float32Array(H + 1), im = new Float32Array(H + 1);
      for (let n = 1; n <= H; n++) re[n] = Math.pow(n, -0.55) * Math.exp(-n / 11);
      const pulseWave = A.createPeriodicWave(re, im);
      const rotP = A.createOscillator(); rotP.setPeriodicWave(pulseWave); rotP.frequency.value = 0;
      const rotLP = f('lowpass', 300, 0.9), rotG = g(0);
      rotP.connect(rotLP).connect(rotG).connect(lowBus);
      // blade slap: band-passed noise gated by the same pulse (rectified + sharpened)
      const shaper = A.createWaveShaper(); { const n = 512, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.pow(Math.max(0, x), 2.2); } shaper.curve = c; }
      const modDepth = g(0), slapVCA = g(0), slapBP = f('bandpass', 700, 1.1), slapG = g(1);
      rotP.connect(shaper).connect(modDepth).connect(slapVCA.gain);
      nA.connect(slapBP).connect(slapVCA).connect(slapG).connect(lowBus);
      // low thump (the fundamental, felt in the seat)
      const thO = A.createOscillator(); thO.type = 'sine'; thO.frequency.value = 0; const thG = g(0); thO.connect(thG).connect(lowBus);
      // --- tail rotor: buzz + gated noise
      const tlO = A.createOscillator(); tlO.type = 'sawtooth'; tlO.frequency.value = 0;
      const tlBP = f('bandpass', 260, 1.6), tlG = g(0); tlO.connect(tlBP).connect(tlG).connect(hiBus);
      const tlShaper = A.createWaveShaper(); tlShaper.curve = shaper.curve;
      const tlDepth = g(0), tlVCA = g(0), tlNBP = f('bandpass', 1600, 1.4);
      tlO.connect(tlShaper).connect(tlDepth).connect(tlVCA.gain); nW.connect(tlNBP).connect(tlVCA).connect(hiBus);
      // --- twin turbines: compressor whine + gearbox whine, engine 2 detuned (beating)
      const whine = [], wG = g(0), whBP = f('highpass', 700, 0.5);
      for (const det of [1, 1.0068]) {
        const a = A.createOscillator(); a.type = 'sine'; const b = A.createOscillator(); b.type = 'triangle'; const c = A.createOscillator(); c.type = 'sine';
        const ga = g(0.55), gb = g(0.25), gc = g(0.3);
        a.connect(ga).connect(wG); b.connect(gb).connect(wG); c.connect(gc).connect(wG);
        whine.push({ a, b, c, det });
      }
      wG.connect(whBP).connect(hiBus);
      // intake hiss, combustion roar, wind
      const hsHP = f('highpass', 3800, 0.6), hsG = g(0); nW.connect(hsHP).connect(hsG).connect(hiBus);
      const roLP = f('lowpass', 500, 0.7), roG = g(0); nB.connect(roLP).connect(roG).connect(lowBus);
      const wiBP = f('bandpass', 380, 0.55), wiG = g(0); nB.connect(wiBP).connect(wiG).connect(lowBus);
      const wiHi = f('bandpass', 2400, 2.5), wiHG = g(0); nW.connect(wiHi).connect(wiHG).connect(hiBus); // seal whistle (door open: loud)
      for (const o of [nA, nB, nW, rotP, thO, tlO]) o.start(t);
      for (const w of whine) { w.a.start(t); w.b.start(t); w.c.start(t); }
      N = { master, comp, lowBus, muffle, body, hiBus, hiLP, fxBus, nA, nB, nW, rotP, rotLP, rotG, modDepth, slapBP, slapG, thO, thG, tlO, tlBP, tlG, tlDepth, whine, wG, hsG, roLP, roG, wiBP, wiG, wiHi, wiHG };
      eng.lastT = t;
    } catch (e) { console.warn('[heli-audio]', e); N = null; }
    return !!N;
  }

  /* ---------------------------------------------------------------- one-shots (fx bus) */
  function burst(at, dur, o = {}) { // filtered noise burst with an attack / exp decay envelope
    if (!N) return;
    try {
      const s = A.createBufferSource(); s.buffer = noiseBuffers(A)[o.white ? 'white' : 'pink'];
      const fl = A.createBiquadFilter(); fl.type = o.type || 'bandpass'; fl.frequency.setValueAtTime(o.f0 || 1000, at); if (o.f1) fl.frequency.exponentialRampToValueAtTime(o.f1, at + dur); fl.Q.value = o.q || 1;
      const e = A.createGain(); e.gain.setValueAtTime(0.0001, at); e.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain || 0.3), at + (o.att || 0.004)); e.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      s.connect(fl).connect(e).connect(o.dest || N.fxBus);
      s.start(at, Math.random() * 2); s.stop(at + dur + 0.05);
    } catch (_) {}
  }
  function tone(at, freq, dur, o = {}) {
    if (!N) return;
    try {
      const os = A.createOscillator(); os.type = o.type || 'sine'; os.frequency.setValueAtTime(freq, at); if (o.f1) os.frequency.exponentialRampToValueAtTime(o.f1, at + dur);
      const e = A.createGain(); e.gain.setValueAtTime(0.0001, at); e.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain || 0.2), at + (o.att || 0.01)); e.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      os.connect(e).connect(o.dest || N.fxBus); os.start(at); os.stop(at + dur + 0.05);
    } catch (_) {}
  }
  function door(open, o = {}) {
    if (!N && !start()) return false;
    const t = A.currentTime + (o.delay || 0), k = o.gain || 1;
    if (open) {
      burst(t, 0.07, { type: 'highpass', f0: 2200, gain: 0.35 * k, white: true }); // latch
      tone(t + 0.01, 95, 0.12, { gain: 0.22 * k });
      burst(t + 0.06, 0.55, { type: 'bandpass', f0: 500, f1: 1500, q: 0.8, gain: 0.07 * k, att: 0.12 }); // seal / air
    } else {
      burst(t, 0.28, { type: 'bandpass', f0: 1400, f1: 400, q: 0.7, gain: 0.08 * k, att: 0.08 }); // swing
      tone(t + 0.26, 70, 0.22, { gain: 0.45 * k }); burst(t + 0.26, 0.16, { type: 'lowpass', f0: 600, gain: 0.5 * k }); // thunk
      burst(t + 0.3, 0.05, { type: 'highpass', f0: 2600, gain: 0.25 * k, white: true }); // latch
    }
    eng.doorOpen = !!open;
    return true;
  }
  function chime(o = {}) {
    if (!N && !start()) return false;
    const t = A.currentTime + (o.delay || 0);
    // radio: mic key click + short squelch, then the cabin two-tone chime
    burst(t, 0.035, { type: 'highpass', f0: 1800, gain: 0.25, white: true });
    burst(t + 0.02, 0.22, { type: 'bandpass', f0: 2300, q: 1.6, gain: 0.06, white: true, att: 0.01 });
    tone(t + 0.22, 1175, 0.55, { gain: 0.13 }); tone(t + 0.22, 2350, 0.3, { gain: 0.02 });
    tone(t + 0.58, 880, 0.8, { gain: 0.12 }); tone(t + 0.58, 1760, 0.4, { gain: 0.018 });
    return true;
  }
  function squelchTail() { if (N) { const t = A.currentTime; burst(t, 0.18, { type: 'bandpass', f0: 2600, q: 1.3, gain: 0.07, white: true, att: 0.005 }); burst(t + 0.16, 0.03, { type: 'highpass', f0: 1800, gain: 0.18, white: true }); } }
  function startupSequence() {
    if (!N) return;
    eng.didStartup = true; eng.starting = true; eng.startAt = A.currentTime; eng.n1 = 0; eng.rot = Math.min(eng.rot, 0.05);
    const t = A.currentTime;
    door(false, { gain: 0.9 });
    burst(t + 0.75, 0.04, { type: 'highpass', f0: 3000, gain: 0.2, white: true }); burst(t + 0.8, 0.05, { type: 'highpass', f0: 2400, gain: 0.25, white: true }); // seat-belt click
    try { // starter motor whine 1.2 s → 6 s
      const so = A.createOscillator(); so.type = 'sawtooth'; so.frequency.setValueAtTime(90, t + 1.2); so.frequency.exponentialRampToValueAtTime(520, t + 4.2); so.frequency.exponentialRampToValueAtTime(760, t + 6.2);
      const sbp = A.createBiquadFilter(); sbp.type = 'bandpass'; sbp.frequency.setValueAtTime(400, t + 1.2); sbp.frequency.linearRampToValueAtTime(1500, t + 6); sbp.Q.value = 1.2;
      const sg = A.createGain(); sg.gain.setValueAtTime(0.0001, t + 1.2); sg.gain.exponentialRampToValueAtTime(0.09, t + 1.8); sg.gain.setValueAtTime(0.09, t + 5.4); sg.gain.exponentialRampToValueAtTime(0.0001, t + 6.6);
      so.connect(sbp).connect(sg).connect(N.hiBus); so.start(t + 1.2); so.stop(t + 6.8);
    } catch (_) {}
    for (let i = 0; i < 12; i++) burst(t + 2.2 + i * 0.13 + Math.random() * 0.02, 0.025, { type: 'highpass', f0: 3200, gain: 0.12, white: true }); // igniter ticks
    burst(t + 3.4, 1.8, { type: 'lowpass', f0: 180, f1: 1400, q: 0.8, gain: 0.32, att: 0.25 }); // light-off whoomp
    later(1400, () => { if (eng.inside) sayKey('say_start'); });
  }

  /* ---------------------------------------------------------------- continuous parameters */
  function set(o = {}) {
    lastSet = o;
    if (!N && !start()) return;
    const t = A.currentTime;
    const dt = clamp(t - eng.lastT, 0, 0.5); eng.lastT = t;
    const rpmIn = clamp(o.rpm || 0, 0, 1.2), pw = clamp(o.power != null ? o.power : 0.4, 0, 1);
    const inside = !!o.inside; eng.inside = inside;
    if ((inside || o.startup) && !eng.didStartup && rpmIn > 0.1 && !o.mute) startupSequence();
    // ---- engine state: N1 lags its target (spool), the rotor follows the engine
    let n1T = rpmIn > 0.05 ? 0.58 + 0.3 * clamp(rpmIn, 0, 1) + 0.12 * pw : 0;
    let rotCap = 1;
    if (eng.starting) {
      const s = t - eng.startAt;
      const startN1 = s < 1.2 ? 0 : s < 3.4 ? 0.22 * (s - 1.2) / 2.2 : s < eng.startDur ? 0.22 + (0.62 - 0.22) * (s - 3.4) / (eng.startDur - 3.4) : 1;
      n1T = Math.min(n1T, startN1); rotCap = clamp((s - 2.6) / (eng.startDur + 3 - 2.6), 0, 1);
      if (s > eng.startDur + 3) eng.starting = false;
    }
    const kN = 1 - Math.exp(-dt * (n1T > eng.n1 ? 0.9 : 0.5));
    eng.n1 += (n1T - eng.n1) * (eng.starting ? 1 : kN);
    const rotT = Math.min(rpmIn, rotCap);
    eng.rot += (rotT - eng.rot) * (1 - Math.exp(-dt * (eng.starting ? 4 : 2.2)));
    const rot = eng.rot, n1 = eng.n1;
    // ---- kinematics (optional inputs)
    const speed = o.speed != null ? Math.max(0, o.speed) : eng.speed * 0.98 + (rot > 0.8 ? pw * 30 : 0) * 0.02; eng.speed = speed;
    const vy = o.vy || 0, yaw = Math.abs(o.yaw || 0);
    const dop = inside ? 1 : clamp(1 + (o.closing || 0) / 343, 0.82, 1.22);
    const dist = inside ? 2 : Math.max(4, o.dist || 6);
    const mute = !!o.mute || PREF.muted;
    // ---- main rotor
    const bpf = BLADES * REV * rot * dop;
    const load = clamp(0.3 + 0.55 * pw + 0.5 * clamp(-vy / 5, 0, 1) + 0.45 * clamp((speed - 35) / 35, 0, 1), 0, 1.4); // collective, BVI descent, advancing-tip slap
    const k = 0.12;
    N.rotP.frequency.setTargetAtTime(Math.max(0.01, bpf), t, k);
    N.thO.frequency.setTargetAtTime(Math.max(0.01, bpf), t, k);
    N.rotLP.frequency.setTargetAtTime(160 + 900 * load * rot + (inside ? 0 : 400), t, k);
    N.rotG.gain.setTargetAtTime(0.42 * rot * (0.55 + 0.45 * load), t, k);
    N.modDepth.gain.setTargetAtTime(0.9 * rot * load, t, k);
    N.slapBP.frequency.setTargetAtTime((520 + 520 * load) * dop, t, k);
    N.slapG.gain.setTargetAtTime(inside ? 0.55 : 1.0, t, k);
    N.thG.gain.setTargetAtTime(rot * (inside ? 0.38 : 0.18), t, k);
    // ---- tail rotor
    const tf = TAIL_BLADES * REV * TAIL_RATIO * rot * dop;
    N.tlO.frequency.setTargetAtTime(Math.max(0.01, tf), t, k);
    N.tlBP.frequency.setTargetAtTime(Math.max(60, tf * 2), t, k);
    const tload = clamp(0.35 + 0.5 * pw + 0.7 * yaw, 0, 1.4);
    N.tlG.gain.setTargetAtTime(0.05 * rot * tload * (inside ? 0.35 : 1), t, k);
    N.tlDepth.gain.setTargetAtTime(0.25 * rot * tload * (inside ? 0.3 : 1), t, k);
    // ---- turbines
    for (const w of N.whine) {
      const fc = (2400 + 3800 * n1) * w.det * dop;
      w.a.frequency.setTargetAtTime(fc, t, 0.2); w.b.frequency.setTargetAtTime(fc * 0.5 + 37 * w.det, t, 0.2); w.c.frequency.setTargetAtTime((900 + 900 * n1) * w.det * dop, t, 0.2);
    }
    N.wG.gain.setTargetAtTime(clamp(n1, 0, 1) * (0.022 + 0.012 * pw) * (inside ? 0.35 : 1), t, 0.2);
    N.hsG.gain.setTargetAtTime(n1 * 0.05 * (inside ? 0.2 : 1), t, 0.2);
    N.roLP.frequency.setTargetAtTime(380 + 700 * pw * n1, t, 0.2);
    N.roG.gain.setTargetAtTime(n1 * (0.06 + 0.12 * pw) * (inside ? 0.9 : 1), t, 0.2);
    // ---- wind (airspeed²), door-open rush
    const wv = clamp(speed / 70, 0, 1.3);
    N.wiBP.frequency.setTargetAtTime(260 + 900 * wv, t, 0.3);
    N.wiG.gain.setTargetAtTime((inside ? 0.12 : 0.22) * wv * wv + (eng.doorOpen && rot > 0.5 ? 0.15 : 0), t, 0.3);
    N.wiHG.gain.setTargetAtTime(inside ? (eng.doorOpen ? 0.05 : 0.008) * wv : 0.004 * wv, t, 0.3);
    // ---- cabin muffling vs. open air (air absorption with distance)
    const airLP = clamp(16000 / (1 + dist / 140), 900, 16000);
    N.muffle.frequency.setTargetAtTime(inside ? (eng.doorOpen ? 3000 : 820) : airLP, t, 0.15);
    N.body.gain.setTargetAtTime(inside ? 5 : 0, t, 0.15);
    N.hiLP.frequency.setTargetAtTime(inside ? (eng.doorOpen ? 9000 : 6500) : clamp(airLP * 0.8, 700, 12000), t, 0.15);
    // ---- level: distance law outside (with a floor so the top-down view is not silent), intercom duck while talking
    const att = inside ? 0.36 : clamp(16 / dist, 0.05, 1);
    const live = Math.max(rot, n1 * 0.6, eng.starting ? 0.35 : 0);
    const talk = speech.on ? 0.68 : 1;
    N.master.gain.setTargetAtTime(mute ? 0 : 0.7 * att * talk * clamp(live * 1.8, 0, 1), t, mute ? 0.08 : 0.25);
    // ---- the house radio in the cabin (world instance only: the one that ran the engine start)
    eng.flying = rot > 0.5 && !o.mute;
    radioMix(o, inside, dist);
    // ---- pilot voice cues (only when the caller passes them)
    const ph = o.phase || '';
    if (inside || o.voice) {
      if (o.poi && ph === 'orbit' && o.poi.id !== eng.poiId) { eng.poiId = o.poi.id; announce(o.poi, { lang: o.lang }); }
      if (ph !== eng.phase) {
        if (ph === 'takeoff' && eng.phase) sayKey('say_takeoff');
        else if (ph === 'return') sayKey('say_home');
        else if (ph === 'landing') sayKey('say_landing');
        else if (ph === 'landed' && eng.phase && eng.phase !== 'parked' && eng.phase !== 'manual') sayKey('say_landed');
      }
    }
    eng.phase = ph;
  }
  function radioMix(o, inside, dist) {
    if (!eng.didStartup) return;
    const r = findRadio(o.radio); if (!r || typeof r.setVolume !== 'function') return;
    try {
      if (!mix.r) { mix.r = r; mix.v0 = clamp(+r.volume || 0.7, 0, 1); mix.last = -1; mix.autoAt = A.currentTime + 6.2; }
      if (mix.autoAt && A.currentTime >= mix.autoAt) { mix.autoAt = 0; if (PREF.radioAuto && !r.on) r.play(); }
      let k = inside ? 0.85 : clamp(9 / Math.max(1, dist), 0.14, 0.38);
      if (speech.on) k *= 0.3; // the pilot's voice on the intercom
      const v = +(mix.v0 * k).toFixed(3);
      if (Math.abs(v - mix.last) > 0.008) { mix.last = v; r.setVolume(v); }
    } catch (_) {}
  }
  function releaseRadio() { try { if (mix.r && mix.v0 != null) mix.r.setVolume(mix.v0); } catch (_) {} mix.r = null; mix.v0 = null; mix.last = -1; mix.autoAt = 0; }

  /* ---------------------------------------------------------------- pilot voice */
  let voices = [];
  const loadVoices = () => { try { voices = window.speechSynthesis.getVoices() || []; } catch (_) { voices = []; } };
  let voicesHooked = false;
  function synth() {
    try {
      if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return null;
      if (!voicesHooked) { voicesHooked = true; loadVoices(); try { window.speechSynthesis.addEventListener('voiceschanged', loadVoices); } catch (_) {} }
      return window.speechSynthesis;
    } catch (_) { return null; }
  }
  function pickVoice(L) {
    const want = SPEECH_LANG[L] || 'he-IL', two = want.slice(0, 2);
    const ok = (v) => { const l = String(v.lang || '').toLowerCase().replace('_', '-'); return l.startsWith(two) || (two === 'he' && l.startsWith('iw')); };
    const list = voices.filter(ok);
    if (!list.length) return null;
    const exact = list.filter((v) => String(v.lang).toLowerCase().replace('_', '-') === want.toLowerCase());
    const pool = exact.length ? exact : list;
    return pool.find((v) => /female|zira|samantha|sabina|paulina|carmit|google/i.test(v.name)) || pool.find((v) => v.localService) || pool[0];
  }
  function say(text, o = {}) {
    if (!text || !PREF.voice || PREF.muted) return false;
    const S = synth(); if (!S) return false;
    if (!gestured()) return false;
    const L = curLang(o);
    loadVoices(); // the list can change (voiceschanged) — re-read it, it is cheap
    const v = pickVoice(L);
    // Hebrew only with a Hebrew voice (an English voice would spell it out); en / es: the browser's default voice for
    // the language is fine when the list has not loaded yet
    if (!v && (L === 'he' || voices.length)) return false;
    try {
      S.cancel();
      const u = new window.SpeechSynthesisUtterance(String(text));
      u.lang = SPEECH_LANG[L] || 'he-IL'; if (v) u.voice = v;
      u.rate = L === 'he' ? 1.0 : 1.03; u.pitch = 1.04; u.volume = 1;
      const done = () => { if (speech.utter !== u) return; speech.on = false; speech.utter = null; squelchTail(); if (lastSet) try { set(lastSet); } catch (_) {} };
      u.onend = done; u.onerror = done;
      speech.utter = u; speech.on = true;
      if (N && !PREF.muted) chime();
      later(N ? 1100 : 0, () => { if (speech.utter === u) { try { S.speak(u); } catch (_) { done(); } } });
      later(15000, () => { if (speech.utter === u) done(); }); // safety: never stay "talking"
      return true;
    } catch (_) { speech.on = false; return false; }
  }
  function sayKey(key, ...args) { const L = curLang(); return say(heliText(L, key, ...args), { lang: L }); }
  function announce(poi, o = {}) { if (!poi) return false; const L = curLang(o); return say(poiGuideLine(poi, L), { lang: L }); }
  function shutUp() { try { const S = synth(); if (S && speech.utter) S.cancel(); } catch (_) {} speech.on = false; speech.utter = null; }

  /* ---------------------------------------------------------------- stop (spool-down) */
  function stop(o = {}) {
    for (const id of timers) clearTimeout(id); timers.clear();
    shutUp(); releaseRadio();
    if (!N) return;
    const n = N; N = null;
    try {
      const t = A.currentTime, quick = !!o.quick;
      const tail = quick ? 0.25 : 3.2;
      if (!quick && eng.inside && eng.phase === 'landed') { const tmp = n; N = tmp; door(true, { gain: 0.8 }); N = null; }
      // spool-down: turbine pitch and rotor rate glide down while the level fades
      for (const w of n.whine) for (const os of [w.a, w.b, w.c]) { try { os.frequency.cancelScheduledValues(t); os.frequency.setTargetAtTime(os.frequency.value * 0.35, t, tail * 0.45); } catch (_) {} }
      for (const os of [n.rotP, n.thO, n.tlO]) { try { os.frequency.cancelScheduledValues(t); os.frequency.setTargetAtTime(Math.max(0.01, os.frequency.value * 0.4), t, tail * 0.5); } catch (_) {} }
      n.master.gain.cancelScheduledValues(t); n.master.gain.setTargetAtTime(0, t, tail * 0.3);
      setTimeout(() => {
        try { for (const os of [n.nA, n.nB, n.nW, n.rotP, n.thO, n.tlO]) os.stop(); for (const w of n.whine) { w.a.stop(); w.b.stop(); w.c.stop(); } } catch (_) {}
        try { n.master.disconnect(); n.comp.disconnect(); } catch (_) {}
      }, tail * 1000 + 600);
    } catch (_) {}
    eng.n1 = 0; eng.rot = 0; eng.starting = false; eng.didStartup = false; eng.phase = ''; eng.poiId = ''; eng.doorOpen = false; eng.speed = 0;
  }

  const api = {
    set, stop, door, chime, say, sayKey, announce,
    setVoice(on) { return setVoicePref(on); },
    setMuted(on) { PREF.muted = !!on; if (PREF.muted) shutUp(); if (N) try { set(lastSet); } catch (_) {} return PREF.muted; },
    get voice() { return PREF.voice; }, set voice(v) { this.setVoice(v); },
    get muted() { return PREF.muted; }, set muted(v) { this.setMuted(v); },
    get started() { return !!N; }, get speaking() { return speech.on; },
    get voiceAvailable() { const S = synth(); if (!S) return false; return !!pickVoice(curLang()) || (curLang() !== 'he' && !voices.length); },
    get output() { return N ? N.master : null; },
    debug() { return { started: !!N, ctx: A ? A.state : 'none', n1: +eng.n1.toFixed(3), rot: +eng.rot.toFixed(3), starting: eng.starting, didStartup: eng.didStartup, radioMix: mix.r ? { v0: mix.v0, vol: mix.last } : null, speaking: speech.on, phase: eng.phase, poi: eng.poiId, voice: PREF.voice, muted: PREF.muted, doorOpen: eng.doorOpen, gain: N ? +N.master.gain.value.toFixed(4) : 0, last: { rpm: lastSet.rpm, power: lastSet.power, inside: lastSet.inside, dist: lastSet.dist, mute: lastSet.mute } }; },
    // name helper for callers (same as heli-strings.poiName)
    poiName: (poi, L) => poiName(poi, L || curLang()),
    // V13 memory: release this instance (the heli world was unloaded) — drop it from the module-level lists
    dispose() { try { stop(); } catch (_) {} SHUT.delete(shutUp); try { if (voicesHooked) { voicesHooked = false; window.speechSynthesis.removeEventListener('voiceschanged', loadVoices); } } catch (_) {} try { const R = typeof window !== 'undefined' && window.__heliAudio; if (Array.isArray(R)) { const i = R.indexOf(api); if (i >= 0) R.splice(i, 1); } } catch (_) {} },
  };
  // QA hook: every live instance (tests read debug() / drive set()); a plain list, nothing runs from it
  SHUT.add(shutUp);
  try { if (typeof window !== 'undefined') { const R = window.__heliAudio || (window.__heliAudio = []); R.push(api); if (R.length > 8) R.shift(); } } catch (_) {}
  return api;
}

/* ------------------------------------------------------------------------------------------- cockpit radio API */
// heliRadio — the house radio (radio-engine.js singleton) as seen from the helicopter: the station display and the
// radio button of the cockpit use this. All calls are safe before the radio exists (they return null / no-op).
//   heliRadio.toggle() / play() / stop() / next() / prev()
//   heliRadio.current(lang?) → { key, call, freq, name, city, label, text, sub, status, on, playing, backup } | null
//   heliRadio.label(lang?)   → one-line display text, e.g. "📻 WNCI 97.9 · להיטים" / "📻 מתחבר… WNCI 97.9" / "📻 הרדיו כבוי"
//   heliRadio.onChange(fn)   → unsubscribe; fn(current) on every station / state change (also once right away)
export const heliRadio = {
  get radio() { return findRadio(); },
  get on() { const r = findRadio(); return !!(r && r.on); },
  play() { const r = findRadio(); if (!r) return false; PREF.radioAuto = true; try { r.play(); } catch (_) { return false; } return true; },
  stop() { const r = findRadio(); if (!r) return false; PREF.radioAuto = false; try { r.stop(); } catch (_) { return false; } return true; },
  toggle() { return this.on ? (this.stop(), false) : this.play(); },
  next() { const r = findRadio(); if (!r) return false; PREF.radioAuto = true; try { r.next(); } catch (_) { return false; } return true; },
  prev() { const r = findRadio(); if (!r) return false; PREF.radioAuto = true; try { r.prev(); } catch (_) { return false; } return true; },
  current(lang) {
    const r = findRadio(); if (!r) return null;
    const L = curLang({ lang });
    try {
      const S = r.state || {}, live = S.live || {};
      const tr = (x) => { try { return typeof I18N.tr === 'function' ? I18N.tr(x, L) : x; } catch (_) { return x; } };
      if (S.backup || S.synthOn) {
        const st = S.station || {};
        return { key: st.id || 'backup', call: 'BKUP', freq: '', name: tr(st.he || ''), city: '', label: heliText(L, 'radioBackup'), text: '📻 ' + heliText(L, 'radioBackup') + (st.he ? ' · ' + tr(st.he) : ''), sub: tr(st.he || ''), status: S.on ? 'playing' : 'idle', on: !!S.on, playing: !!S.playing, backup: true };
      }
      const st = live.station || r.station || {};
      const freq = isFinite(st.fr) ? (st.band === 'AM' ? String(Math.round(st.fr)) : Number(st.fr).toFixed(1)) : '';
      const label = (st.call || st.name || '') + (freq ? ' ' + freq : '');
      const status = live.status || (S.on ? 'playing' : 'idle');
      const on = !!S.on;
      const sub = heliText(L, 'radioHits') + (st.city ? ' · ' + st.city : '');
      let text;
      if (!on) text = '📻 ' + (status === 'unavailable' ? heliText(L, 'radioUnavail') : heliText(L, 'radioOff'));
      else if (status === 'connecting') text = '📻 ' + heliText(L, 'radioConnecting') + ' ' + label;
      else text = '📻 ' + label + ' · ' + heliText(L, 'radioHits');
      return { key: st.key || '', call: st.call || '', freq, name: st.name || '', city: st.city || '', label, text, sub, status, on, playing: !!S.playing, backup: false };
    } catch (_) { return null; }
  },
  label(lang) { const c = this.current(lang); return c ? c.text : '📻 ' + heliText(curLang({ lang }), 'radioOff'); },
  onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    let un = null, iv = null, dead = false;
    const hook = () => { const r = findRadio(); if (!r || typeof r.onChange !== 'function') return false; un = r.onChange(() => { if (!dead) { try { fn(heliRadio.current()); } catch (_) {} } }); return true; };
    if (!hook()) { try { fn(null); } catch (_) {} iv = setInterval(() => { if (hook()) { clearInterval(iv); iv = null; } }, 500); }
    let unLang = null; try { if (typeof I18N.onLangChange === 'function') unLang = I18N.onLangChange(() => { try { fn(heliRadio.current()); } catch (_) {} }); } catch (_) {}
    return () => { dead = true; if (iv) clearInterval(iv); try { un && un(); } catch (_) {} try { unLang && unLang(); } catch (_) {} };
  },
};

/* ------------------------------------------------------------------------------------------- pilot voice toggle API */
// heliVoice — the pilot voice-guide preference shared by every helicopter sound instance (page session only).
//   heliVoice.on · heliVoice.set(on) (false also stops a line already playing) · heliVoice.toggle() → new state
//   heliVoice.available (the browser has a voice for the current language) · heliVoice.onChange(fn) → unsubscribe
export const heliVoice = {
  get on() { return PREF.voice; },
  set(on) { return setVoicePref(on); },
  toggle() { return setVoicePref(!PREF.voice); },
  get available() { return voiceFor(curLang()); },
  availableFor(lang) { return voiceFor(curLang({ lang })); },
  onChange(fn) { if (typeof fn !== 'function') return () => {}; VOICE_SUBS.add(fn); return () => VOICE_SUBS.delete(fn); },
};

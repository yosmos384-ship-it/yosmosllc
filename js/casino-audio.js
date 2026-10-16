// casino-audio.js — V10 CASINO: WebAudio-only sounds (no files): game effects + casino ambience
// (crowd murmur = filtered noise with slow swells, distant slot chimes in a pentatonic scale, chip clatter, and a very
// soft generative lounge-jazz bed from the stage band).
// Uses the tour's audio helpers when given (ctx getter that resumes after a gesture, master gain that follows mute);
// otherwise creates its own context lazily. Everything is try/catch — sound never breaks the casino.

export function createCasinoAudio(helpers = null) {
  let own = null;
  const ctxOf = () => {
    try { if (helpers) return helpers.ctx; } catch (_) {}
    try { if (!own) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) own = new AC(); } if (own && own.state === 'suspended') own.resume().catch(() => {}); } catch (_) {}
    return own;
  };
  const muted = () => { try { return !!(helpers && helpers.muted); } catch (_) { return false; } };
  let bus = null, busCtx = null;
  function out() {
    const c = ctxOf(); if (!c) return null;
    if (!bus || busCtx !== c) {
      bus = c.createGain(); bus.gain.value = 0.9; busCtx = c;
      let dest = null; try { dest = helpers && helpers.master; } catch (_) {}
      bus.connect(dest || c.destination);
    }
    return bus;
  }
  const nb = {};
  function noiseBuf(c) { if (nb.w && nb.c === c) return nb.w; const len = c.sampleRate * 1.5; const b = c.createBuffer(1, len, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; nb.w = b; nb.c = c; return b; }
  function burst(dur, { type = 'bandpass', freq = 3000, q = 1, gain = 0.2, delay = 0, rate = 1 } = {}) {
    const c = ctxOf(), o = out(); if (!c || !o || muted()) return;
    try {
      const t = c.currentTime + delay; const s = c.createBufferSource(); s.buffer = noiseBuf(c); s.playbackRate.value = rate;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.006, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      s.connect(f); f.connect(g); g.connect(o); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    } catch (_) {}
  }
  function tone(freq, dur, { type = 'sine', gain = 0.15, delay = 0, slide = 0, attack = 0.005 } = {}) {
    const c = ctxOf(), o = out(); if (!c || !o || muted()) return;
    try {
      const t = c.currentTime + delay; const osc = c.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      osc.connect(g); g.connect(o); osc.start(t); osc.stop(t + dur + 0.05);
    } catch (_) {}
  }
  const bell = (f, d = 0, g = 0.09) => { tone(f, 0.9, { type: 'triangle', gain: g, delay: d }); tone(f * 2.01, 0.5, { type: 'sine', gain: g * 0.35, delay: d }); };
  const sfx = {
    chip() { burst(0.035, { freq: 3800, q: 3, gain: 0.22 }); burst(0.03, { freq: 2600, q: 4, gain: 0.16, delay: 0.045 }); },
    card() { burst(0.09, { type: 'highpass', freq: 2500, q: 0.5, gain: 0.14 }); },
    shuffle() { for (let i = 0; i < 14; i++) burst(0.025, { type: 'highpass', freq: 3000, gain: 0.08, delay: i * 0.035 }); },
    tick() { burst(0.02, { freq: 2200, q: 6, gain: 0.12 }); },
    deny() { tone(180, 0.18, { type: 'square', gain: 0.05 }); },
    open() { bell(880, 0, 0.05); bell(1318.5, 0.07, 0.04); },
    close() { bell(1318.5, 0, 0.035); bell(880, 0.07, 0.03); },
    win() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, i * 0.09, 0.08)); },
    bigwin() { for (let k = 0; k < 3; k++) [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => bell(f, k * 0.5 + i * 0.07, 0.07)); for (let i = 0; i < 12; i++) tone(2000 + Math.random() * 3000, 0.15, { gain: 0.03, delay: Math.random() * 1.4 }); },
    lose() { tone(330, 0.25, { type: 'sine', gain: 0.05 }); tone(247, 0.35, { type: 'sine', gain: 0.05, delay: 0.12 }); },
    spin() { for (let i = 0; i < 46; i++) { const k = i / 46; burst(0.02, { freq: 1800 + 600 * (1 - k), q: 5, gain: 0.05 + 0.04 * (1 - k), delay: 4.6 * (1 - Math.sqrt(1 - k)) }); } burst(4.6, { type: 'lowpass', freq: 700, gain: 0.05 }); },
    ball() { for (let i = 0; i < 5; i++) burst(0.03, { freq: 2600, q: 5, gain: 0.12 / (i + 1), delay: i * 0.09 * (1 + i * 0.3) }); },
    dice() { for (let i = 0; i < 9; i++) burst(0.03, { freq: 1500 + Math.random() * 1500, q: 3, gain: 0.14, delay: i * 0.05 + Math.random() * 0.03 }); },
    diceStop() { burst(0.04, { freq: 1200, q: 2, gain: 0.18 }); burst(0.04, { freq: 1400, q: 2, gain: 0.15, delay: 0.07 }); },
    reelStart() { tone(90, 0.4, { type: 'sawtooth', gain: 0.03, slide: 2 }); },
    reelStop(r = 0) { tone(140 - r * 8, 0.12, { type: 'sine', gain: 0.18 }); burst(0.03, { freq: 1500, q: 2, gain: 0.12 }); },
    clink() { tone(2637, 0.6, { gain: 0.06 }); tone(3729, 0.5, { gain: 0.04, delay: 0.01 }); },
    whoosh() { burst(0.5, { type: 'bandpass', freq: 600, q: 0.7, gain: 0.1 }); },
  };
  /* ------------------------------------------------------------------ ambience */
  let amb = null;
  function startAmbience() {
    const c = ctxOf(), o = out(); if (!c || !o || amb) return !!amb;
    try {
      const g = c.createGain(); g.gain.value = 0; g.connect(o);
      g.gain.linearRampToValueAtTime(1, c.currentTime + 2);
      // crowd murmur: two band-passed noise layers with slow swells
      const layers = [];
      for (const [f, q, gain, lfo] of [[420, 0.8, 0.05, 0.11], [900, 1.2, 0.03, 0.17], [220, 0.6, 0.04, 0.07]]) {
        const s = c.createBufferSource(); s.buffer = noiseBuf(c); s.loop = true; s.playbackRate.value = 0.9;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
        const lg = c.createGain(); lg.gain.value = gain;
        const l = c.createOscillator(); l.frequency.value = lfo; const la = c.createGain(); la.gain.value = gain * 0.45; l.connect(la); la.connect(lg.gain);
        s.connect(bp); bp.connect(lg); lg.connect(g); s.start(); l.start(); layers.push(s, l);
      }
      amb = { g, layers, timer: 0 };
      const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
      const chime = () => {
        if (!amb) return;
        if (!muted()) {
          const r = Math.random();
          const save = bus; // route quiet "distant" chimes through the ambience gain
          bus = amb.g;
          if (r < 0.55) { const n = 2 + ((Math.random() * 4) | 0); const base = (Math.random() * 3) | 0; for (let i = 0; i < n; i++) tone(scale[(base + i * 2) % scale.length], 0.5, { type: 'triangle', gain: 0.012 + Math.random() * 0.01, delay: i * 0.08 }); }
          else if (r < 0.8) { for (let i = 0; i < 6; i++) burst(0.03, { freq: 3000 + Math.random() * 1500, q: 3, gain: 0.02, delay: i * 0.04 + Math.random() * 0.02 }); }
          else { for (let i = 0; i < 3; i++) tone(scale[(Math.random() * scale.length) | 0] * 0.5, 1.2, { type: 'sine', gain: 0.01, delay: i * 0.25 }); }
          bus = save;
        }
        amb.timer = setTimeout(chime, 400 + Math.random() * 2200);
      };
      chime();
      // soft lounge music from the stage band: jazz ii–V–I–VI voicings (pads) + walking bass, ~80 bpm, very quiet
      const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const PROG = [[50, [53, 57, 60, 64]], [55, [53, 59, 64, 65]], [48, [52, 55, 59, 62]], [57, [55, 61, 64, 70]]]; // Dm9 G13 Cmaj9 A7b9
      let bar = 0; const beat = 60 / 80;
      const music = () => {
        if (!amb) return;
        if (!muted()) {
          const save = bus; bus = amb.g;
          const [root, chord] = PROG[bar % PROG.length];
          chord.forEach((m, i) => tone(hz(m), beat * 3.6, { type: 'sine', gain: 0.007, delay: i * 0.03, attack: 0.35 }));
          const walk = [root, root + 4, root + 7, root + (bar % 2 ? 6 : 9)];
          walk.forEach((m, i) => tone(hz(m - 12), beat * 0.9, { type: 'triangle', gain: 0.012, delay: i * beat }));
          if (bar % 2 === 0) for (let i = 0; i < 3; i++) tone(hz(chord[(i * 2 + bar) % 4] + 12), beat * 0.5, { type: 'sine', gain: 0.005, delay: beat * (1.5 + i * 0.66) });
          bus = save;
        }
        bar++; amb.mtimer = setTimeout(music, beat * 4 * 1000);
      };
      music();
      return true;
    } catch (e) { amb = null; return false; }
  }
  function stopAmbience() {
    if (!amb) return; const a = amb; amb = null; clearTimeout(a.timer); clearTimeout(a.mtimer);
    try { const c = ctxOf(); a.g.gain.cancelScheduledValues(c.currentTime); a.g.gain.setValueAtTime(a.g.gain.value, c.currentTime); a.g.gain.linearRampToValueAtTime(0, c.currentTime + 0.6); setTimeout(() => { for (const s of a.layers) { try { s.stop(); } catch (_) {} } try { a.g.disconnect(); } catch (_) {} }, 800); } catch (_) {}
  }
  /** duck the ambience while a game overlay is open */
  function duck(on) { try { const c = ctxOf(); if (amb && c) amb.g.gain.setTargetAtTime(on ? 0.35 : 1, c.currentTime, 0.3); } catch (_) {} }
  return { sfx, startAmbience, stopAmbience, duck, get ambienceOn() { return !!amb; } };
}

// interior-radio.js — 1950s American tabletop radio (3D model + interactions). V6: a remote for the shared one-station
// radio in radio-engine.js (WNCI 97.9 FM Columbus, also driven by the UI chip / panel): the dial is printed with an FM and
// an AM scale and one red mark at 97.9; the needle + dial / grille glow follow the engine; tapping the set = play / stop
// (power knob = play / stop, tuning knob = tune in to 97.9, dial window = radio panel). Backup synth (CSP) shows here too.
import { THREE, PI, V3, Batch } from './interior-lib.js';
import { WNCI, FMIN, FMAX, dialUnits, getRadio, createRadio } from './radio-engine.js';


function dialTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 192); grd.addColorStop(0, '#f6e7c4'); grd.addColorStop(1, '#e9cf98');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 192);
  const X = (f) => 30 + (f - FMIN) / (FMAX - FMIN) * 452; // dial units → px (FM and AM share the needle travel)
  const fmX = (m) => X(dialUnits({ band: 'FM', fr: m })), amX = (k) => X(dialUnits({ band: 'AM', fr: k }));
  g.strokeStyle = '#5b3a1a'; g.fillStyle = '#5b3a1a'; g.lineWidth = 2;
  // FM scale (top)
  g.beginPath(); g.moveTo(24, 52); g.lineTo(488, 52); g.stroke();
  for (let m = 88; m <= 108; m += 1) { const x = fmX(m), big = m % 4 === 0; g.lineWidth = big ? 2 : 1; g.beginPath(); g.moveTo(x, 52); g.lineTo(x, big ? 40 : 46); g.stroke(); }
  g.font = 'bold 22px Georgia, serif'; g.textAlign = 'center';
  [88, 92, 96, 100, 104, 108].forEach((m) => g.fillText(String(m), fmX(m), 32));
  // AM scale (bottom)
  g.lineWidth = 2; g.beginPath(); g.moveTo(24, 118); g.lineTo(488, 118); g.stroke();
  for (let f = 550; f <= 1600; f += 10) { const x = amX(f), big = f % 100 === 0; g.lineWidth = big ? 2 : 1; g.beginPath(); g.moveTo(x, 118); g.lineTo(x, big ? 130 : 124); g.stroke(); }
  g.font = 'bold 20px Georgia, serif';
  [550, 700, 900, 1100, 1300, 1600].forEach((f) => g.fillText(String(f / 10), amX(f), 150));
  g.font = 'italic bold 14px Georgia, serif'; g.textAlign = 'left'; g.fillText('FM', 4, 58); g.fillText('AM', 4, 124);
  // one red mark: WNCI 97.9 (under the FM scale)
  const wx = X(dialUnits(WNCI));
  g.fillStyle = '#b5321f'; g.beginPath(); g.arc(wx, 64, 6, 0, PI * 2); g.fill();
  g.font = 'bold 13px Georgia, serif'; g.textAlign = 'center'; g.fillText('WNCI', wx, 84);
  g.font = '15px Georgia, serif'; g.fillStyle = '#5b3a1a'; g.fillText('WNCI 97.9  ·  COLUMBUS, OHIO', 256, 180);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { t, X };
}

export function buildRadio(E, G, F) {
  // F: frame at table top, radio back-centre, facing +z
  const W = 0.42, H = 0.25, D = 0.2;
  const b = new Batch(), f = F.withBatch(b);
  f.box('woodGloss', [W, H, D], [0, H / 2 + 0.012, D / 2], 0x6b3f22, { r: 0.035, seg: 3 });
  f.box('woodGloss', [W - 0.03, H - 0.03, 0.01], [0, H / 2 + 0.012, D + 0.001], 0x4a2a16, { r: 0.004 });
  for (const sx of [-1, 1]) for (const sz of [0, 1]) f.cyl('plastic', 0.012, 0.014, 0.012, [sx * (W / 2 - 0.04), 0.006, 0.03 + sz * (D - 0.06)], 0x2a1a10, { seg: 10 });
  // brass trims
  f.box('metal', [0.19, 0.004, 0.006], [-0.1, 0.225, D + 0.008], 0xc9a356, { r: 0 });
  f.box('metal', [0.19, 0.004, 0.006], [-0.1, 0.04, D + 0.008], 0xc9a356, { r: 0 });
  for (let i = 0; i < 4; i++) f.cyl('metal', 0.003, 0.003, 0.18, [-0.1, 0.07 + i * 0.045, D + 0.012], 0xc9a356, { rz: PI / 2, seg: 6 });
  f.box('metal', [0.185, 0.095, 0.006], [0.1, 0.165, D + 0.006], 0xc9a356, { r: 0.004 });
  f.box('plastic', [0.15, 0.04, 0.008], [0.1, 0.065, D + 0.006], 0x2a1a10, { r: 0.004 });
  b.build(G, E.M);
  // grille cloth (backlit when on)
  const grilleM = E.M.grille.clone(); grilleM.emissive = new THREE.Color(0xff8a3c); grilleM.emissiveIntensity = 0; grilleM.emissiveMap = grilleM.map;
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), grilleM);
  F.place(grille, [-0.1, 0.132, D + 0.0065]); G.add(grille);
  // dial
  const { t: dialTex, X } = dialTexture();
  const dialM = new THREE.MeshStandardMaterial({ map: dialTex, emissiveMap: dialTex, emissive: 0xffb050, emissiveIntensity: 0, roughness: 0.6 });
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.0637), dialM);
  F.place(dial, [0.1, 0.165, D + 0.0095]); G.add(dial);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.064), E.M.glass);
  F.place(glass, [0.1, 0.165, D + 0.0125]); G.add(glass);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.05, 0.001), new THREE.MeshStandardMaterial({ color: 0xb01e10, emissive: 0x801000, emissiveIntensity: 0.2 }));
  const needleG = new THREE.Group(); F.place(needleG, [0.1, 0.165, D + 0.0108]); G.add(needleG); needleG.add(needle);
  const needleX = (fr) => -0.085 + X(fr) / 512 * 0.17;
  // knobs
  const mkKnob = (x) => {
    const m = new THREE.Group(); F.place(m, [x, 0.065, D + 0.01]); G.add(m);
    const k = new THREE.Group(); m.add(k);
    const kb = new Batch();
    kb.root.cyl('plastic', 0.022, 0.024, 0.022, [0, 0, 0.011], 0x3a2212, { rx: PI / 2, seg: 24 });
    kb.root.cyl('metal', 0.016, 0.016, 0.004, [0, 0, 0.0235], 0xc9a356, { rx: PI / 2, seg: 20 });
    kb.root.box('plastic', [0.004, 0.016, 0.004], [0, 0.009, 0.026], 0xe8d8b0, { r: 0 });
    kb.build(k, E.M);
    return k;
  };
  const kPower = mkKnob(0.045), kTune = mkKnob(0.155);
  const hitBody = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), new THREE.MeshBasicMaterial({ visible: false }));
  F.place(hitBody, [0, H / 2 + 0.012, D / 2]); G.add(hitBody);

  // ---------------------------------------------------------------- state: the shared radio engine (radio-engine.js)
  // The 3D radio is a remote for the same engine the UI radio chip / panel drives. The live stream is one <audio>
  // element (louder near this set); the backup synth plays at a background level and louder / panned near it.
  const snd = E.snd;
  const R = getRadio() || createRadio(E.snd.A);
  const st = { warm: 0, knob: 0 };
  const tmp = V3();
  R.setSource(() => { hitBody.getWorldPosition(tmp); return tmp; });
  const stationName = () => (R.nowName ? R.nowName() : '');
  const setNeedle = () => { needleG.position.x = 0; needle.position.x = needleX(R.f); kTune.rotation.z = -(R.f - FMIN) / (FMAX - FMIN) * PI * 1.6; };
  setNeedle();
  const power = (o) => { snd.click(o || kPower, 0.9); R.toggle(); };
  const label = () => (R.on ? 'עצור רדיו · ' + stationName() : 'הפעל רדיו · WNCI 97.9');
  // tap on the set = play / stop WNCI 97.9
  E.interact(hitBody, label, () => power(hitBody));
  E.interact(kPower.parent, () => (R.on ? 'כבה רדיו' : 'הדלק רדיו'), () => power(kPower));
  // the dial window opens the UI radio panel
  const hitDial = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.075, 0.012), new THREE.MeshBasicMaterial({ visible: false }));
  F.place(hitDial, [0.1, 0.165, D + 0.016]); G.add(hitDial);
  E.interact(hitDial, () => 'רדיו WNCI 97.9', () => { snd.click(hitDial, 0.5); if (R.openPanel) R.openPanel('radio'); });
  E.interact(kTune.parent, () => (R.tuning ? 'מכוון…' : 'כוון ל-WNCI 97.9'), () => { if (!R.tuning) { snd.click(kTune, 0.5); R.retune(); } });
  // ---- per-frame: follow the engine (UI panel changes show up here too)
  E.anim.tick((dt) => {
    setNeedle();
    const on = R.on ? 1 : 0;
    st.warm += (on - st.warm) * Math.min(1, dt * (on ? 1.2 : 3));
    st.knob += ((on ? -1.2 : 0) - st.knob) * Math.min(1, dt * 10);
    kPower.rotation.z = st.knob;
    dialM.emissiveIntensity = st.warm * 1.3; grilleM.emissiveIntensity = st.warm * 0.12;
    if (R.on) R.pump();
  });
  // test / debug view of the 3D set (needle position on the dial, glow level, hover label)
  R.view3d = { get needleX() { return needle.position.x; }, expectX: (f) => needleX(f), get warm() { return st.warm; }, label, tap: () => power(hitBody) };
  F.solid(E, [W, H, D], [0, H / 2, D / 2]);
}

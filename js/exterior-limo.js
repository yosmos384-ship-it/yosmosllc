// exterior-limo.js — V10: the limousine parking spot on Eakin Rd in front of the house (home world) + its boarding
// trigger. Owner: CORE/NAV (only the spot + trigger; the limo model and the limo world belong to the LIMO bot).
//
// The car parks at the north curb (house side), nose east, along the street. The LIMO bot's module may export
// buildParked(ctx) → Object3D (local frame: origin on the ground at the car centre, nose toward +X, curb / door side
// toward −Z, y up; footprint ≤ LIMO_SPOT.length × width, height ≤ 1.6 m) or { object | group, door: {x, y, z} (local) }.
// Until that exists (or if it fails) a simple stretch-limo placeholder is drawn. A big "🚘 עלה ללימוזינה" sign floats
// over the curb-side rear door; tapping the car, the door or the sign → ctx.worlds.enterWorld('limo').
// No side effects on import.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { tr, onLangChange } from './i18n.js';

// world placement: street band is z 18.4 … 25.6 (plan.street zCenter 22, width 7.2); curb face at z 18.55
export const LIMO_SPOT = {
  x: 9.3, z: 19.85, yaw: 0,              // centre on the asphalt, nose toward +x (east)
  length: 8.8, width: 2.0, height: 1.55,
  door: { x: -2.0, y: 0.9, z: -1.0 },   // curb-side rear passenger door (local)
  curb: { x: 7.3, z: 18.05 },            // where the visitor stands to board (nav node 'out:limo', on the lawn edge)
  boardYaw: Math.PI,                     // camera yaw at the curb spot: looking +z, at the door
  label: '🚘 עלה ללימוזינה',
};
export function limoDoorWorld(spot = LIMO_SPOT) {
  const c = Math.cos(spot.yaw), s = Math.sin(spot.yaw);
  return { x: spot.x + spot.door.x * c + spot.door.z * s, y: spot.door.y, z: spot.z - spot.door.x * s + spot.door.z * c };
}
export function limoFootprint(spot = LIMO_SPOT, pad = 0.08) {
  const hl = spot.length / 2 + pad, hw = spot.width / 2 + pad;
  const c = Math.abs(Math.cos(spot.yaw)), s = Math.abs(Math.sin(spot.yaw));
  const ex = hl * c + hw * s, ez = hl * s + hw * c;
  return new THREE.Box3(new THREE.Vector3(spot.x - ex, 0, spot.z - ez), new THREE.Vector3(spot.x + ex, spot.height, spot.z + ez));
}

function signTexture(text) {
  const c = document.createElement('canvas'); c.width = 768; c.height = 176;
  const g = c.getContext('2d');
  const draw = (txt) => {
    g.clearRect(0, 0, c.width, c.height);
    const r = 70, x = 8, y = 8, w = c.width - 16, h = c.height - 16;
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(20,16,10,0.92)'); gr.addColorStop(1, 'rgba(6,6,8,0.92)');
    g.fillStyle = gr; g.fill();
    g.lineWidth = 7; g.strokeStyle = '#f2c66d'; g.stroke();
    g.fillStyle = '#ffe6a8'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 78; g.font = `800 ${fs}px system-ui, -apple-system, "Segoe UI", "Noto Sans Hebrew", Arial, sans-serif`;
    while (g.measureText(txt).width > w - 60 && fs > 30) { fs -= 4; g.font = `800 ${fs}px system-ui, -apple-system, "Segoe UI", "Noto Sans Hebrew", Arial, sans-serif`; }
    g.fillText(txt, c.width / 2, c.height / 2 + 4);
  };
  draw(text);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, redraw(t) { draw(t); tex.needsUpdate = true; } };
}

function placeholderLimo() {
  const g = new THREE.Group(); g.name = 'limo-placeholder';
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x0b0c0f, metalness: 0.55, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0d1218, metalness: 0.2, roughness: 0.05, envMapIntensity: 1.4 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.12 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.85 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff6e2, emissive: 0xfff1d0, emissiveIntensity: 0.6, roughness: 0.2 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x5a0606, emissive: 0x8a0a0a, emissiveIntensity: 0.4, roughness: 0.3 });
  const L = LIMO_SPOT.length, Wd = LIMO_SPOT.width;
  const m = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  m(new RoundedBoxGeometry(L, 0.62, Wd, 3, 0.14), paint, 0, 0.64, 0);                    // lower body
  m(new RoundedBoxGeometry(L * 0.74, 0.5, Wd * 0.9, 2, 0.12), glass, -0.35, 1.17, 0);   // glasshouse (tinted)
  m(new RoundedBoxGeometry(L * 0.72, 0.07, Wd * 0.86, 2, 0.03), paint, -0.35, 1.44, 0); // roof skin
  m(new RoundedBoxGeometry(1.25, 0.18, Wd * 0.96, 2, 0.08), paint, L / 2 - 0.7, 0.98, 0); // hood
  for (const s of [1, -1]) {
    m(new THREE.BoxGeometry(L * 0.96, 0.035, 0.012), chrome, 0, 0.86, s * (Wd / 2 + 0.004)); // belt-line chrome
    m(new THREE.BoxGeometry(0.06, 0.48, 0.012), paint, -0.35 - L * 0.37 + 0.03, 1.17, s * (Wd * 0.45 + 0.004)); // pillars
    for (const px of [-1.35, 0.6]) m(new THREE.BoxGeometry(0.07, 0.48, 0.012), paint, px, 1.17, s * (Wd * 0.45 + 0.004));
  }
  m(new THREE.BoxGeometry(0.18, 0.025, 0.04), chrome, LIMO_SPOT.door.x + 0.32, 0.95, -(Wd / 2 + 0.02)); // door handle
  for (const s of [1, -1]) { m(new THREE.BoxGeometry(0.05, 0.12, 0.38), lamp, L / 2 + 0.005, 0.8, s * 0.62); m(new THREE.BoxGeometry(0.05, 0.12, 0.34), tail, -L / 2 - 0.005, 0.82, s * 0.64); }
  m(new THREE.BoxGeometry(0.05, 0.2, 0.82), chrome, L / 2 + 0.01, 0.72, 0); // grille
  for (const [wx, wz] of [[L / 2 - 1.2, 1], [L / 2 - 1.2, -1], [-L / 2 + 1.25, 1], [-L / 2 + 1.25, -1]]) {
    const w = m(new THREE.CylinderGeometry(0.37, 0.37, 0.26, 24), tire, wx, 0.37, wz * (Wd / 2 - 0.12)); w.rotation.x = Math.PI / 2;
    const h = m(new THREE.CylinderGeometry(0.22, 0.22, 0.27, 18), chrome, wx, 0.37, wz * (Wd / 2 - 0.12)); h.rotation.x = Math.PI / 2;
  }
  return g;
}

// called from exterior.js build(): returns a handle { group, upgrade(parked), door, spot }
export function buildLimoSpot(ctx, W) {
  const spot = LIMO_SPOT;
  const root = new THREE.Group(); root.name = 'limo-spot'; root.userData.floor = 'outside';
  root.position.set(spot.x, 0, spot.z); root.rotation.y = spot.yaw;
  const car = placeholderLimo(); root.add(car);
  // red carpet from the front-walk edge to the door
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.5), new THREE.MeshStandardMaterial({ color: 0x7a0d14, roughness: 0.92 }));
  carpet.rotation.x = -Math.PI / 2; carpet.position.set(spot.door.x + 0.2, 0.04, -spot.width / 2 - 0.85); carpet.receiveShadow = true; carpet.name = 'limo-carpet';
  root.add(carpet);
  // big floating sign over the door (billboard toward the camera, translated text)
  const S = signTexture(tr(spot.label));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.44), new THREE.MeshBasicMaterial({ map: S.tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  sign.position.set(spot.door.x + 0.2, 2.15, -spot.width / 2 + 0.1); sign.renderOrder = 930; sign.name = 'limo-sign'; sign.castShadow = false;
  root.add(sign);
  root.traverse((o) => { o.userData.floor = 'outside'; o.userData.noPathtrace = true; for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) if (m && !m.userData.styleKey) m.userData.styleKey = 'static:limo'; }); // not restyled by styles.js
  (W && W.root ? W.root : ctx.scene).add(root);
  root.updateMatrixWorld(true);
  try { onLangChange(() => S.redraw(tr(spot.label))); } catch (_) {}
  // collider (fixed footprint, so the house nav graph routes around the car)
  const box = limoFootprint(spot);
  if (W && W.colliders) W.colliders.push(box); else if (ctx.addCollider) ctx.addCollider(box);
  const board = () => {
    const ws = ctx.worlds;
    if (!ws || !ws.enterWorld) { ctx.toast && ctx.toast('🚧 בקרוב'); return; }
    return ws.enterWorld('limo');
  };
  let carHandle = null;
  const opts = { label: spot.label, hint: '', onUse: board, travel: 'limo' }; // travel: tests skip it when they press every interactive
  try { carHandle = ctx.addInteractive && ctx.addInteractive(car, opts); ctx.addInteractive && ctx.addInteractive(sign, opts); } catch (_) {}
  // billboard + gentle bob of the sign
  let t = 0; const _cp = new THREE.Vector3(), _sp = new THREE.Vector3();
  if (ctx.onUpdate) ctx.onUpdate((dt) => {
    t += dt || 0.016;
    if (!root.visible) return;
    const cam = ctx.camera; if (!cam) return;
    cam.getWorldPosition(_cp); sign.getWorldPosition(_sp);
    if (_cp.distanceTo(_sp) > 60) return;
    sign.rotation.y = Math.atan2(_cp.x - _sp.x, _cp.z - _sp.z) - spot.yaw;
    sign.position.y = 2.15 + Math.sin(t * 1.8) * 0.04;
  });
  const handle = {
    group: root, spot, door: limoDoorWorld(spot), sign, car, parked: null,
    // swap the placeholder for the LIMO bot's parked model
    upgrade(res) {
      try {
        const obj = res && res.isObject3D ? res : res && res.object && res.object.isObject3D ? res.object : res && res.group && res.group.isObject3D ? res.group : null;
        if (!obj) return false;
        if (res.door && isFinite(res.door.x)) { sign.position.x = res.door.x; carpet.position.x = res.door.x; }
        obj.traverse((o) => { if (o.userData) { if (o.userData.floor === undefined) o.userData.floor = 'outside'; } });
        root.add(obj); car.visible = false;
        if (carHandle && carHandle.remove) carHandle.remove();
        const lbl = obj.userData && typeof obj.userData.boardLabel === 'function' ? obj.userData.boardLabel : null; // LIMO bot's own (translated) label
        carHandle = ctx.addInteractive ? ctx.addInteractive(obj, lbl ? Object.assign({}, opts, { label: lbl }) : opts) : null;
        handle.parked = obj;
        root.updateMatrixWorld(true);
        return true;
      } catch (e) { console.warn('[limo] parked model', e); car.visible = true; return false; }
    },
  };
  return handle;
}

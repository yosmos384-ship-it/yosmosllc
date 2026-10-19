// heli-ui.js — V13 HELI: DOM overlay for the helicopter world.
//   • camera bar: three equal buttons — 🎥 inside (cockpit, drag to look; tap again = front seat ⇄ cabin),
//     🚁 outside (chase, drag to orbit, wheel = distance), 🗺 map (top-down, north up, wheel = height) — styled like the
//     core top bar (#topbar .mode), with a short "how to look around" hint after each switch;
//   • avionics HUD (top-left, where the house minimap normally sits): speed · altitude (+ height above ground) ·
//     heading, a north-up moving mini map (aerial map, route, places, home, helicopter), and the next place with its
//     distance and a relative-bearing arrow;
//   • tour card (place name + type + caption, progress with stop ticks, ⏮ ⏸ ⏭ ×speed, take-off);
//   • rail: manual ⇄ autopilot, fly home & land, 🎰 fly to the casino (V13.1), radio; manual-flight touch sticks + key hint;
//     update({ casinoOn, casinoDim, atCasino, trip: { icon, name, kind, cap } }) drives the casino button / trip card;
//   • pilot bubble, messages, place labels, attribution.
// createHeliUI({ S, ICON, lang, actions }) → { mount, unmount, update(state), labels(list), bubble, message, stick, mounted, root }
//   update(state) also accepts optional { x, z, h, agl, pois, route, home, next } — when heli.js does not pass them the HUD
//   reads the pose / route / places from heli-flight.js `telemetry` and the map canvas from heli-avionics.js.
// RTL: the overlay follows the current language (dir=rtl for Hebrew); numbers stay LTR (<bdi>).
// No side effects on import.
import { telemetry } from './heli-flight.js';
import { getAvionicsMap } from './heli-avionics.js';
import { heliRadio } from './heli-audio.js';
import * as HA from './heli-audio.js';

const CSS = `
.heli-ui{position:fixed;z-index:13;font-family:var(--font,system-ui,-apple-system,"Segoe UI","Noto Sans Hebrew",Arial,sans-serif);color:var(--text,#eef3f8);-webkit-user-select:none;user-select:none}
.heli-ui button{font:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.heli-ui button:focus-visible{outline:2px solid var(--accent,#43e0ff);outline-offset:2px}
.heli-glass{background:var(--glass,rgba(16,22,32,.62));backdrop-filter:var(--blur,saturate(150%) blur(16px));-webkit-backdrop-filter:var(--blur,saturate(150%) blur(16px));border:1px solid var(--line,rgba(255,255,255,.12));box-shadow:var(--shadow,0 10px 30px rgba(0,0,0,.35))}
/* ---- camera bar (same look as #topbar .mode) */
#heliViews{top:calc(16px + 54px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);display:flex;gap:3px;padding:4px;border-radius:13px;direction:inherit}
#heliViews .hv{display:flex;align-items:center;gap:6px;min-height:34px;padding:0 12px;border-radius:9px;font-size:13px;font-weight:600;color:var(--muted,#a9b4c2);white-space:nowrap;transition:background .2s,color .2s,box-shadow .2s}
#heliViews .hv .i{font-size:15px;line-height:1}
#heliViews .hv:hover{background:rgba(255,255,255,.07);color:var(--text,#eef3f8)}
#heliViews .hv.on{background:linear-gradient(180deg,rgba(67,224,255,.95),rgba(42,190,230,.95));color:var(--accent-ink,#04212a);box-shadow:0 4px 16px rgba(67,224,255,.35)}
#heliViews .hv small{font-size:10px;font-weight:700;opacity:.75}
#heliViewHint{top:calc(16px + 54px + 48px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:600;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .35s;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis}
#heliViewHint.show{opacity:.95}
/* ---- avionics HUD */
#heliHud{top:calc(16px + 48px + env(safe-area-inset-top,0px));left:calc(16px + env(safe-area-inset-left,0px));width:212px;padding:7px;border-radius:14px;pointer-events:none}
#heliHud .hx-row{display:flex;gap:4px;direction:ltr}
#heliHud .hx-c{flex:1;min-width:0;padding:3px 5px 4px;border-radius:8px;background:rgba(0,0,0,.28);text-align:center;line-height:1.1}
#heliHud .hx-c b{display:block;font:700 16px/1.15 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap}
#heliHud .hx-c span{display:block;font-size:9.5px;font-weight:600;color:var(--muted,#a9b4c2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#heliHud .hx-c em{font-style:normal;font-size:9.5px;color:#7cf3c8;font-weight:700}
#heliHud .hx-agl{display:flex;justify-content:space-between;gap:6px;margin-top:4px;padding:2px 6px;border-radius:7px;background:rgba(0,0,0,.22);font-size:10px;font-weight:600;color:var(--muted,#a9b4c2);white-space:nowrap;overflow:hidden}
#heliHud .hx-agl b{color:#7cf3c8;font:700 11px ui-monospace,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
#heliHud canvas{display:block;width:100%;height:142px;margin-top:5px;border-radius:9px;background:#0d1a24}
#heliHud .hx-next{display:flex;align-items:center;gap:6px;margin-top:5px;padding:4px 6px;border-radius:8px;background:rgba(0,0,0,.28);min-height:34px}
#heliHud .hx-next .ar{flex:0 0 22px;height:22px;border-radius:50%;background:rgba(67,224,255,.16);color:#43e0ff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;line-height:1}
#heliHud .hx-next .tx{flex:1;min-width:0;line-height:1.15}
#heliHud .hx-next .lb{display:block;font-size:9.5px;font-weight:700;color:var(--muted,#a9b4c2)}
#heliHud .hx-next .nm{display:block;font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#heliHud .hx-next .ds{flex:0 0 auto;font:700 12.5px ui-monospace,Menlo,Consolas,monospace;color:#ffe7ad;font-variant-numeric:tabular-nums}
#heliHud .hx-next.none{display:none}
/* ---- tour card */
#heliCard{left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(540px,calc(100vw - 32px));padding:9px 12px 8px;border-radius:16px}
#heliCard .hc-top{display:flex;align-items:center;gap:10px}
#heliCard .hc-ico{font-size:22px;line-height:1;flex:0 0 36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:rgba(67,224,255,.12)}
#heliCard .hc-tx{flex:1;min-width:0}
#heliCard .hc-name{font-size:15.5px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#heliCard .hc-kind{font-size:11.5px;color:var(--muted,#a9b4c2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#heliCard .hc-cap{font-size:12.5px;line-height:1.35;margin-top:5px;opacity:.95;min-height:17px}
#heliCard .hc-bar{position:relative;height:4px;border-radius:4px;background:rgba(255,255,255,.14);margin-top:7px;direction:ltr}
#heliCard .hc-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:linear-gradient(90deg,#43e0ff,#7cf3c8)}
#heliCard .hc-bar b{position:absolute;top:-2px;width:8px;height:8px;margin-left:-4px;border-radius:50%;background:#26324a;border:1px solid rgba(255,255,255,.55)}
#heliCard .hc-bar b.done{background:#43e0ff;border-color:#bff6ff}
#heliCard .hc-ctl{display:flex;align-items:center;gap:5px;margin-top:7px;justify-content:center;direction:ltr}
#heliCard .hc-ctl button{min-width:40px;min-height:34px;padding:0 8px;border-radius:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.08);font-size:14px;font-weight:700}
#heliCard .hc-ctl button:hover{background:rgba(255,255,255,.13)}
#heliCard .hc-ctl .hc-go{padding:0 18px;font-weight:800;color:var(--accent-ink,#04212a);background:linear-gradient(180deg,rgba(67,224,255,.95),rgba(42,190,230,.95));border-color:transparent;box-shadow:0 4px 16px rgba(67,224,255,.3)}
#heliCard .hc-stop{font-size:11px;color:var(--muted,#a9b4c2);white-space:nowrap;font-variant-numeric:tabular-nums}
#heliCard.manual .hc-ctl .hc-tour{display:none}
#heliAttr{margin-top:5px;font-size:8.5px;opacity:.5;line-height:1.25;text-align:center}
/* ---- rail */
#heliRail{right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:5px;padding:4px;border-radius:13px}
#heliRail button{display:flex;align-items:center;gap:7px;min-height:36px;padding:0 11px;border-radius:9px;font-size:12.5px;font-weight:600;color:var(--text,#eef3f8);white-space:nowrap;text-align:start;transition:background .2s}
#heliRail button:hover{background:rgba(255,255,255,.08)}
#heliRail button .i{font-size:15px;line-height:1;width:18px;text-align:center}
#heliRail button.on{background:rgba(67,224,255,.2);box-shadow:0 0 0 1px rgba(67,224,255,.7) inset;color:#dffbff}
#heliRail button.dim{opacity:.45}
/* V13.1 🎰 fly to the casino: a quiet gold accent so it reads as a destination, not a flight control */
#heliRail [data-a=casino]{color:#ffe7ad}
#heliRail [data-a=casino]:hover{background:rgba(255,206,110,.12)}
#heliRail [data-a=casino].on{background:linear-gradient(180deg,rgba(255,214,120,.30),rgba(214,160,60,.24));box-shadow:0 0 0 1px rgba(255,214,130,.75) inset;color:#fff4d8}
#heliCard.trip .hc-ico{background:rgba(255,206,110,.16)}
#heliCard.trip .hc-bar i{background:linear-gradient(90deg,#ffd27a,#ffefc2)}
#heliCard.trip .hc-stop{color:#ffe7ad;font-weight:700}
#heliRail .hr-radio{display:flex;flex-direction:column;gap:2px;padding-top:3px;border-top:1px solid rgba(255,255,255,.08)}
#heliRail [data-a=radio] .t{display:flex;flex-direction:column;line-height:1.1;min-width:0}
#heliRail [data-a=radio] .t b{font-weight:700;font-size:12px;max-width:118px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;unicode-bidi:isolate}
#heliRail [data-a=radio] .t small{font-size:9.5px;font-weight:600;color:var(--muted,#a9b4c2);max-width:118px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#heliRail [data-a=radio].on .t small{color:#7cf3c8}
#heliRail .hr-rc{display:flex;gap:3px;direction:ltr}
#heliRail .hr-rc button{flex:1;justify-content:center;min-height:30px;padding:0 6px;font-size:12px;gap:0}
#heliRail .hr-rc.off{display:none}
#heliRail [data-a=radio] .eq{display:none;gap:2px;align-items:flex-end;height:11px;margin-inline-start:2px}
#heliRail [data-a=radio].on.playing .eq{display:inline-flex}
#heliRail [data-a=radio] .eq i{display:block;width:2px;height:4px;background:#7cf3c8;border-radius:1px;animation:heliEq .9s ease-in-out infinite}
#heliRail [data-a=radio] .eq i:nth-child(2){animation-delay:.2s}#heliRail [data-a=radio] .eq i:nth-child(3){animation-delay:.45s}
@keyframes heliEq{50%{height:11px}}
/* ---- messages / bubble / labels */
#heliMsg{left:50%;top:30%;transform:translate(-50%,-50%);display:none;padding:10px 16px;border-radius:14px;font-size:15px;font-weight:700;color:#fff;text-align:center;max-width:calc(100vw - 48px);pointer-events:none}
#heliMsg.show{display:block;animation:heliIn .35s ease-out}
@keyframes heliIn{from{opacity:0;transform:translate(-50%,-40%)}to{opacity:1;transform:translate(-50%,-50%)}}
#heliBubble{left:0;top:0;display:none;max-width:230px;padding:7px 11px;border-radius:14px;background:rgba(255,250,240,.96);color:#1e2433;font-size:12.5px;font-weight:600;box-shadow:0 8px 22px rgba(0,0,0,.35);pointer-events:none;transform:translate(-50%,-100%);text-align:center}
#heliLabels{left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:12;overflow:hidden}
#heliLabels .hl{position:absolute;left:0;top:0;transform:translate(-50%,-100%);display:flex;align-items:center;gap:4px;padding:2px 7px 2px 4px;border-radius:999px;background:rgba(10,14,24,.62);border:1px solid rgba(255,255,255,.22);font-size:11.5px;font-weight:700;white-space:nowrap;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.8);will-change:transform}
#heliLabels .hl i{font-style:normal;font-size:13px}
#heliLabels .hl small{font-weight:500;opacity:.8;font-size:10px}
#heliLabels .hl.tour{background:rgba(8,26,34,.74);border-color:rgba(67,224,255,.6);color:#dffbff;font-size:12.5px}
#heliLabels .hl.cur{background:linear-gradient(180deg,rgba(67,224,255,.97),rgba(42,190,230,.97));color:#04212a;text-shadow:none;font-size:13.5px;box-shadow:0 4px 16px rgba(0,0,0,.4);border-color:#bff6ff}
#heliLabels .hl:after{content:"";position:absolute;left:50%;bottom:-7px;width:2px;height:7px;margin-left:-1px;background:rgba(255,255,255,.7)}
/* ---- manual flight: sticks (touch) / key hint */
.heli-stick{position:fixed;z-index:13;bottom:calc(178px + env(safe-area-inset-bottom,0px));width:124px;height:124px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.07),rgba(10,16,30,.5));border:1px solid rgba(67,224,255,.45);touch-action:none;display:none}
.heli-stick.l{left:calc(16px + env(safe-area-inset-left,0px))}.heli-stick.r{right:calc(16px + env(safe-area-inset-right,0px))}
.heli-stick i{position:absolute;left:50%;top:50%;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#bff6ff,#2abee6);box-shadow:0 4px 14px rgba(0,0,0,.45);pointer-events:none}
.heli-stick b{position:absolute;font-size:10px;font-weight:700;color:rgba(255,255,255,.75);text-shadow:0 1px 2px #000;pointer-events:none;line-height:1}
.heli-stick b.t{top:6px;left:0;right:0;text-align:center}.heli-stick b.d{bottom:6px;left:0;right:0;text-align:center}.heli-stick b.lf{left:7px;top:50%;margin-top:-5px}.heli-stick b.rt{right:7px;top:50%;margin-top:-5px}
.heli-stick span{position:absolute;left:-10px;right:-10px;bottom:-17px;text-align:center;font-size:10px;font-weight:600;opacity:.9;text-shadow:0 1px 2px #000;color:#fff;white-space:nowrap}
body.heli-manual.heli-touch .heli-stick{display:block}
#heliHint{left:50%;bottom:calc(16px + 150px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);padding:5px 12px;border-radius:999px;font-size:11.5px;font-weight:600;display:none;text-align:center;max-width:calc(100vw - 32px);pointer-events:none}
body.heli-manual #heliHint{display:block}
body.heli-manual.heli-touch #heliHint{display:none}
/* the core walk UI is not used in this world */
body.world-is-heli #dpad,body.world-is-heli #btnAct,body.world-is-heli #crosshair,body.world-is-heli #roomPicker,body.world-is-heli #hoverLabel,body.world-is-heli #info,body.world-is-heli #mapCard,body.world-is-heli #roomHud{display:none!important}
/* ---- phone / narrow (core switches its top bar to full width under 900 px) */
@media (max-width:900px){
  #heliViews{top:calc(16px + 58px + 52px + env(safe-area-inset-top,0px))}
  #heliViewHint{top:calc(16px + 58px + 52px + 48px + 214px + env(safe-area-inset-top,0px));white-space:normal;text-align:center;width:max-content;max-width:min(300px,calc(100vw - 48px));border-radius:12px;line-height:1.3}
  #heliViews .hv{min-height:34px;padding:0 10px;font-size:12.5px;gap:5px}
  #heliHud{top:calc(16px + 58px + 52px + 48px + env(safe-area-inset-top,0px));width:150px;padding:5px;border-radius:12px}
  #heliHud .hx-c{padding:2px 3px 3px}
  #heliHud .hx-c b{font-size:13px}
  #heliHud .hx-c span,#heliHud .hx-c em{font-size:8.5px}
  #heliHud canvas{height:96px;margin-top:4px}
  #heliHud .hx-agl{font-size:8.5px;padding:2px 4px;margin-top:3px}#heliHud .hx-agl b{font-size:9.5px}
  #heliHud .hx-next{margin-top:4px;padding:3px 5px;gap:5px;min-height:30px}
  #heliHud .hx-next .ar{flex-basis:18px;height:18px;font-size:11px}
  #heliHud .hx-next .nm{font-size:11px}
  #heliHud .hx-next .lb{font-size:8.5px}
  #heliHud .hx-next .ds{font-size:11px}
  #heliRail{top:calc(16px + 58px + 52px + 48px + env(safe-area-inset-top,0px));bottom:auto;padding:3px;gap:3px}
  #heliRail button{min-height:36px;padding:0 9px;font-size:11.5px;gap:5px}
  body.tools-open #heliRail{visibility:hidden}
  #heliCard{padding:7px 10px 6px;border-radius:14px}
  #heliCard .hc-ico{flex-basis:32px;height:32px;font-size:19px}
  #heliCard .hc-name{font-size:14px}
  #heliCard .hc-cap{font-size:11.5px;margin-top:4px}
  #heliCard .hc-ctl button{min-width:44px;min-height:36px}
  .heli-stick{width:112px;height:112px;bottom:calc(16px + 168px + env(safe-area-inset-bottom,0px))}
  .heli-stick i{width:46px;height:46px;margin:-23px 0 0 -23px}
}
@media (max-width:900px){#heliRail [data-a=radio] .t b,#heliRail [data-a=radio] .t small{max-width:86px}#heliRail [data-a=radio] .t b{font-size:11px}#heliRail .hr-rc button{min-height:32px}}
@media (max-width:380px){#heliViews .hv{padding:0 8px;font-size:12px}#heliRail button .t{display:none}#heliRail [data-a=radio] .t{display:flex}#heliRail button{padding:0 8px}}
/* ---- short landscape screens */
@media (max-height:560px){
  #heliViews{top:calc(8px + 50px + env(safe-area-inset-top,0px))}
  #heliViewHint{display:none}
  #heliHud{top:calc(8px + 50px + env(safe-area-inset-top,0px));width:148px}
  #heliHud canvas{height:72px}
  #heliRail{top:calc(8px + 50px + env(safe-area-inset-top,0px));bottom:auto}
  #heliCard .hc-cap,#heliAttr{display:none}
  .heli-stick{bottom:calc(16px + 92px + env(safe-area-inset-bottom,0px));width:100px;height:100px}
  #heliHint{bottom:calc(16px + 92px + env(safe-area-inset-bottom,0px))}
}

/* ---- V13.2 collapsible HUD / card, compact phone layout */
#heliHud{pointer-events:auto;cursor:pointer}
#heliHud .hx-tg,#heliCard .hc-tg{font-size:9px;line-height:1;color:var(--muted,#a9b4c2);text-align:center;opacity:.8}
#heliHud .hx-tg{margin-top:3px}
#heliHud.mini{padding:4px}
#heliHud.mini .hx-agl,#heliHud.mini canvas,#heliHud.mini .hx-next{display:none!important}
#heliHud.mini .hx-tg{margin-top:1px}
#heliCard .hc-top{cursor:pointer}
#heliCard .hc-tg{flex:0 0 auto;font-size:10px}
#heliCard.mini{padding:6px 9px 6px}
#heliCard.mini .hc-kind,#heliCard.mini .hc-cap,#heliCard.mini .hc-bar{display:none}
#heliCard.mini .hc-ico{flex-basis:26px;height:26px;font-size:16px;border-radius:8px}
#heliCard.mini .hc-name{font-size:13.5px}
#heliCard.mini .hc-ctl{margin-top:5px}
#heliCard.mini .hc-ctl button{min-height:32px}
#heliCard.mini #heliAttr{margin-top:3px;font-size:7.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:ltr}
#heliRail [data-a=radio] .fq{display:none}
body.heli-compact #heliHud{width:auto;min-width:0}
body.heli-compact #heliHud .hx-c{min-width:44px}
body.heli-compact #heliHud:not(.mini){width:150px}
body.heli-compact #heliRail{padding:3px;gap:2px;border-radius:12px}
body.heli-compact #heliRail button{width:42px;min-height:40px;padding:0;justify-content:center;gap:0;flex-direction:column}
body.heli-compact #heliRail button .t{display:none!important}
body.heli-compact #heliRail button .i{width:auto;font-size:17px}
body.heli-compact #heliRail .hr-radio{padding-top:2px;gap:2px}
body.heli-compact #heliRail [data-a=radio] .fq{display:block;font:700 8.5px/1 ui-monospace,Menlo,monospace;color:#7cf3c8;margin-top:2px;direction:ltr}
body.heli-compact #heliRail [data-a=radio] .eq{display:none!important}
body.heli-compact #heliRail .hr-rc{flex-direction:column}
body.heli-compact #heliRail .hr-rc button{min-height:34px}
body.heli-compact #heliViews .hv{min-height:32px}
/* ==== V13.1 TOP BAND: every heli control lives in one slim band at the top (safe-area aware); the landscape stays
   clear — the lower half only ever shows the manual-flight sticks. Row 1: ⟵ exit · camera · rail (🕹 🏠 🎰 🗣 📻);
   row 2: the tour / trip strip (icon, place, n/16, ⏮ ⏸ ⏭ ×2 or ▶, thin progress) + one tiny credits line; the place
   caption fades in under the band for a few seconds. */
body.world-is-heli #topbar{display:none!important}
#heliTop{top:calc(6px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:stretch;gap:3px;padding:4px 5px 3px;border-radius:15px;width:max-content;max-width:calc(100vw - 12px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px));box-sizing:border-box}
#heliTop .ht-row{display:flex;align-items:center;justify-content:center;gap:5px;min-width:0}
#heliTop .ht-sep{flex:0 0 1px;align-self:stretch;margin:5px 1px;background:rgba(255,255,255,.14)}
#heliTop #heliViews,#heliTop #heliRail,#heliTop #heliCard{position:relative;top:auto;left:auto;right:auto;bottom:auto;transform:none;background:none;border:0;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;padding:0;border-radius:0;width:auto;visibility:visible}
#heliTop #heliViews{gap:2px}
#heliTop #heliViews .hv{min-height:36px;padding:0 9px;border-radius:9px;font-size:12.5px}
#heliTop #heliRail{flex-direction:row;align-items:center;gap:2px}
#heliTop #heliRail button{min-height:36px;padding:0 8px;border-radius:9px;font-size:12px;gap:5px}
#heliTop #heliRail .hr-radio{flex-direction:row;align-items:center;gap:2px;padding:0;border:0}
#heliTop #heliRail [data-a=radio] .t small{display:none}
#heliTop #heliRail .hr-rc{flex-direction:row;gap:2px}
#heliTop #heliRail .hr-rc button{min-height:36px;min-width:30px;padding:0 6px;flex:0 0 auto}
#heliTop #heliRail .hr-rc.off{display:none}
#heliExit{display:flex;align-items:center;gap:5px;min-height:36px;padding:0 10px;border-radius:9px;font-size:12.5px;font-weight:700;color:#04261b;background:linear-gradient(180deg,rgba(124,243,200,.92),rgba(70,200,160,.92));white-space:nowrap}
#heliExit .i{font-size:14px;line-height:1}
/* strip (the old bottom card) */
#heliTop #heliCard{display:flex;flex-wrap:wrap;align-items:center;gap:2px 6px;min-width:0;max-width:100%}
#heliTop #heliCard .hc-top{flex:1 1 120px;min-width:0;gap:7px;order:0}
#heliTop #heliCard .hc-ctl{order:1}#heliTop #heliCard .hc-bar{order:2}#heliTop #heliAttr{order:3}
#heliTop #heliCard .hc-ico{flex:0 0 26px;height:26px;font-size:15px;border-radius:8px}
#heliTop #heliCard .hc-kind,#heliTop #heliCard .hc-tg{display:none}
#heliTop #heliCard .hc-name{font-size:13px}
#heliTop #heliCard .hc-stop{font-size:10.5px}
#heliTop #heliCard .hc-ctl{margin:0;gap:3px;flex:0 0 auto}
#heliTop #heliCard .hc-ctl button{min-width:32px;min-height:28px;padding:0 6px;border-radius:8px;font-size:12.5px}
#heliTop #heliCard .hc-ctl .hc-go{padding:0 14px}
#heliTop #heliCard .hc-bar{flex:0 0 100%;height:3px;margin:1px 0 0}
#heliTop #heliCard .hc-bar b{top:-1.5px;width:6px;height:6px;margin-left:-3px}
#heliTop #heliAttr{flex:0 0 100%;margin:0;font-size:7.5px;opacity:.45;line-height:1.2;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:ltr}
#heliTop #heliCard .hc-cap{position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);width:min(520px,calc(100vw - 24px));margin:0;padding:6px 12px;border-radius:12px;background:rgba(10,14,24,.55);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-size:12.5px;line-height:1.35;text-align:center;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.6);opacity:0;pointer-events:none;transition:opacity .6s;min-height:0;box-sizing:border-box}
#heliTop #heliCard .hc-cap:empty{display:none}
#heliTop #heliCard .hc-cap.show{opacity:1}
#heliTop #heliCard.mini .hc-bar,#heliTop #heliCard.mini .hc-cap{display:block}
#heliTop #heliCard.mini .hc-cap:empty{display:none}
/* below the band */
#heliHud{top:calc(var(--heli-top-h,96px) + 12px + env(safe-area-inset-top,0px))!important}
#heliViewHint{top:calc(var(--heli-top-h,96px) + 12px + env(safe-area-inset-top,0px))!important}
#heliHint{top:calc(var(--heli-top-h,96px) + 12px + env(safe-area-inset-top,0px));bottom:auto!important}
body.heli-capshow #heliViewHint{opacity:0}
#heliMsg{top:calc(var(--heli-top-h,96px) + 120px)}
/* phones / narrow: icon-only row, the caption beside the (mini) HUD */
body.heli-compact #heliTop #heliViews .hv .t,body.heli-compact #heliTop #heliRail button .t,body.heli-compact #heliExit .t{display:none!important}
body.heli-compact #heliTop #heliViews .hv,body.heli-compact #heliTop #heliRail button,body.heli-compact #heliExit{width:32px;min-width:32px;min-height:36px;padding:0;justify-content:center;gap:0;flex-direction:row}
body.heli-compact #heliTop #heliRail [data-a=radio] .fq{display:none!important}
body.heli-compact #heliTop #heliRail [data-a=radioPrev]{display:none}
body.heli-compact #heliTop #heliRail .hr-rc button{width:30px;min-width:30px}
body.heli-compact #heliTop .ht-row{gap:3px}
body.heli-compact #heliTop #heliCard .hc-cap{left:auto;right:0;transform:none;width:calc(100vw - 186px);font-size:11.5px;padding:5px 9px}
body.heli-compact #heliHud{left:calc(8px + env(safe-area-inset-left,0px))}
@media (max-width:360px){body.heli-compact #heliTop #heliViews .hv,body.heli-compact #heliTop #heliRail button,body.heli-compact #heliExit{width:29px;min-width:29px}}
`;

// strings this module needs that heli-strings.js may not have yet (used only when S(key) returns the key itself)
const FALLBACK = {
  he: { exitS: 'יציאה', viewInS: 'בפנים', viewOutS: 'בחוץ', viewTopS: 'מפה', dragLook: 'גררו כדי להסתכל סביב · הקישו שוב למושב אחר', dragOrbit: 'גררו כדי להקיף את המסוק · גלגלת למרחק', topHint: 'מבט מלמעלה, צפון למעלה · גלגלת לגובה',
    spd: 'מהירות', altS: 'גובה', aglS: 'מעל הקרקע', hdgS: 'כיוון', nextPoi: 'היעד הבא', nowPoi: 'מקיפים עכשיו', nearPoi: 'המקום הקרוב', homeDest: 'הבית — 3351 Eakin Rd', km: 'ק״מ',
    manualS: 'ידני', autoS: 'אוטומטי', flyHomeS: 'הביתה', radioS: 'רדיו', stickL: 'גובה · סיבוב', stickR: 'כיוון טיסה', up: 'עלייה', down: 'ירידה', fwd: 'קדימה', back: 'אחורה', camBar: 'מצלמה', mps: 'מ׳/ש', hudMore: 'הקישו להרחבה', hudLess: 'הקישו לצמצום', cardMore: 'הקישו לפרטי המקום', voice: '🗣 קול הטייסת', voiceOn: 'קול הטייסת פועל', voiceOff: 'קול הטייסת כבוי', noVoice: 'אין בדפדפן קול דיבור בשפה הזו — מוצגות כתוביות בלבד', radioTitle: 'רדיו המסוק', radioOff: 'הרדיו כבוי', radioConnecting: 'מתחבר…', radioHits: 'להיטים', radioUnavail: 'השידור לא זמין כרגע', radioBackup: 'רדיו גיבוי', radioOnMsg: '📻 הרדיו מתנגן באוזניות', radioOffMsg: '📻 הרדיו כובה', aRadio: 'הפעלה / כיבוי רדיו', aRadioPrev: 'התחנה הקודמת', aRadioNext: 'התחנה הבאה', aPrev: 'היעד הקודם', aNext: 'היעד הבא', aPause: 'השהיית הסיור', aPlay: 'המשך הסיור', aSpeed: 'מהירות הסיור' },
  en: { exitS: 'Exit', viewInS: 'Inside', viewOutS: 'Outside', viewTopS: 'Map', dragLook: 'Drag to look around · tap again to switch seat', dragOrbit: 'Drag to orbit the helicopter · wheel for distance', topHint: 'Top-down, north up · wheel for height',
    spd: 'Speed', altS: 'Altitude', aglS: 'above ground', hdgS: 'Heading', nextPoi: 'Next stop', nowPoi: 'Circling now', nearPoi: 'Nearest place', homeDest: 'Home — 3351 Eakin Rd', km: 'km',
    manualS: 'Manual', autoS: 'Autopilot', flyHomeS: 'Home', radioS: 'Radio', stickL: 'Height · yaw', stickR: 'Direction', up: 'Up', down: 'Down', fwd: 'Fwd', back: 'Back', camBar: 'Camera', mps: 'm/s', hudMore: 'Tap to expand', hudLess: 'Tap to collapse', cardMore: 'Tap for place details', voice: '🗣 Pilot voice', voiceOn: 'Pilot voice on', voiceOff: 'Pilot voice off', noVoice: 'Your browser has no speech voice for this language — captions only', radioTitle: 'Helicopter radio', radioOff: 'Radio off', radioConnecting: 'Connecting…', radioHits: 'Hits', radioUnavail: 'Stream unavailable right now', radioBackup: 'Backup radio', radioOnMsg: '📻 Radio playing in your headset', radioOffMsg: '📻 Radio off', aRadio: 'Radio on / off', aRadioPrev: 'Previous station', aRadioNext: 'Next station', aPrev: 'Previous stop', aNext: 'Next stop', aPause: 'Pause the tour', aPlay: 'Resume the tour', aSpeed: 'Tour speed' },
  es: { exitS: 'Salir', viewInS: 'Dentro', viewOutS: 'Fuera', viewTopS: 'Mapa', dragLook: 'Arrastre para mirar alrededor · toque otra vez para cambiar de asiento', dragOrbit: 'Arrastre para girar alrededor del helicóptero · rueda para la distancia', topHint: 'Vista cenital, norte arriba · rueda para la altura',
    spd: 'Velocidad', altS: 'Altitud', aglS: 'sobre el suelo', hdgS: 'Rumbo', nextPoi: 'Próxima parada', nowPoi: 'Rodeando ahora', nearPoi: 'Lugar más cercano', homeDest: 'Casa — 3351 Eakin Rd', km: 'km',
    manualS: 'Manual', autoS: 'Piloto auto', flyHomeS: 'A casa', radioS: 'Radio', stickL: 'Altura · giro', stickR: 'Dirección', up: 'Subir', down: 'Bajar', fwd: 'Avance', back: 'Atrás', camBar: 'Cámara', mps: 'm/s', hudMore: 'Toque para ampliar', hudLess: 'Toque para reducir', cardMore: 'Toque para ver el lugar', voice: '🗣 Voz de la piloto', voiceOn: 'Voz de la piloto activada', voiceOff: 'Voz de la piloto desactivada', noVoice: 'Su navegador no tiene voz para este idioma — solo subtítulos', radioTitle: 'Radio del helicóptero', radioOff: 'Radio apagada', radioConnecting: 'Conectando…', radioHits: 'Éxitos', radioUnavail: 'La transmisión no está disponible ahora', radioBackup: 'Radio de respaldo', radioOnMsg: '📻 La radio suena en sus audífonos', radioOffMsg: '📻 Radio apagada', aRadio: 'Encender / apagar la radio', aRadioPrev: 'Estación anterior', aRadioNext: 'Siguiente estación', aPrev: 'Parada anterior', aNext: 'Siguiente parada', aPause: 'Pausar el recorrido', aPlay: 'Reanudar el recorrido', aSpeed: 'Velocidad del recorrido' },
};
export const HELI_UI_STRINGS = FALLBACK;

function el(tag, attrs = {}, html = '') { const e = document.createElement(tag); for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]); if (html) e.innerHTML = html; return e; }
const stop = (e) => e.stopPropagation();
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function createHeliUI(o = {}) {
  const S0 = typeof o.S === 'function' ? o.S : (k) => k;
  const ICON = o.ICON || o.KIND_ICON || {};
  const act = o.actions || {};
  const lang = () => { try { const l = o.lang ? o.lang() : 'he'; return FALLBACK[l] ? l : 'he'; } catch (_) { return 'he'; } };
  const T = (key, ...args) => {
    let v = S0(key, ...args);
    if (v == null || v === key) { const d = FALLBACK[lang()] || FALLBACK.he; v = d[key] != null ? d[key] : FALLBACK.he[key] != null ? FALLBACK.he[key] : key; v = String(v).replace(/\{(\d)\}/g, (_, i) => (args[+i] != null ? String(args[+i]) : '')); }
    return v;
  };
  const hasDom = typeof document !== 'undefined' && !!document.body;
  let mounted = false, views, vhint, card, rail, hud, msg, bub, attr, labelsEl, hint, sL, sR, mapCv, raf = 0, top = null, exitB = null, capT = 0, lastCap = '', topH = 0;
  const stick = { l: { x: 0, y: 0, id: null }, r: { x: 0, y: 0, id: null } };
  const pool = [];
  const nodes = () => [labelsEl, top, vhint, hud, msg, bub, hint, sL, sR];
  let last = {}; // last update() state
  function mount() {
    if (!hasDom || mounted) return; mounted = true;
    if (!document.getElementById('heli-css')) { const s = el('style', { id: 'heli-css' }); s.textContent = CSS; document.head.appendChild(s); }
    else document.getElementById('heli-css').textContent = CSS;
    views = el('div', { id: 'heliViews', class: 'heli-ui heli-glass', role: 'group' },
      '<button class="hv" data-a="in"><span class="i">🎥</span><span class="t"></span></button><button class="hv" data-a="out"><span class="i">🚁</span><span class="t"></span></button><button class="hv" data-a="top"><span class="i">🗺</span><span class="t"></span></button>');
    vhint = el('div', { id: 'heliViewHint', class: 'heli-ui heli-glass' });
    card = el('div', { id: 'heliCard', class: 'heli-ui heli-glass' }, '<div class="hc-top" data-a="cardToggle" role="button" tabindex="0"><div class="hc-ico"></div><div class="hc-tx"><div class="hc-name"></div><div class="hc-kind"></div></div><div class="hc-stop"></div><div class="hc-tg" aria-hidden="true"></div></div><div class="hc-cap" data-a="cardToggle"></div><div class="hc-bar"><i></i></div>'
      + '<div class="hc-ctl"><button class="hc-tour" data-a="prev"></button><button class="hc-tour" data-a="pause"></button><button class="hc-go" data-a="go"></button><button class="hc-tour" data-a="next"></button><button class="hc-tour" data-a="speed"></button></div>');
    rail = el('div', { id: 'heliRail', class: 'heli-ui heli-glass' },
      '<button data-a="manual"><span class="i">🕹</span><span class="t"></span></button><button data-a="flyhome"><span class="i">🏠</span><span class="t"></span></button><button data-a="casino"><span class="i">🎰</span><span class="t"></span></button><button data-a="voice" style="display:none"><span class="i">🗣</span><span class="t"></span></button>'
      + '<div class="hr-radio"><button data-a="radio"><span class="i">📻</span><span class="t"><b></b><small></small></span><span class="fq"></span><span class="eq"><i></i><i></i><i></i></span></button>'
      + '<div class="hr-rc"><button data-a="radioPrev">⏮</button><button data-a="radioNext">⏭</button></div></div>');
    hud = el('div', { id: 'heliHud', class: 'heli-ui heli-glass', 'aria-live': 'off', 'data-a': 'hudToggle', role: 'button', tabindex: '0' },
      '<div class="hx-row"><div class="hx-c" data-k="spd"><b>0</b><span></span></div><div class="hx-c" data-k="alt"><b>0</b><span></span></div><div class="hx-c" data-k="hdg"><b>000°</b><span></span></div></div>'
      + '<div class="hx-agl"><span class="a"></span><span class="v"></span></div>'
      + '<canvas width="212" height="142"></canvas>'
      + '<div class="hx-next none"><div class="ar">↑</div><div class="tx"><span class="lb"></span><span class="nm"></span></div><div class="ds"></div></div><div class="hx-tg" aria-hidden="true"></div>');
    mapCv = hud.querySelector('canvas');
    msg = el('div', { id: 'heliMsg', class: 'heli-ui heli-glass' });
    bub = el('div', { id: 'heliBubble', class: 'heli-ui' });
    attr = el('div', { id: 'heliAttr' });
    hint = el('div', { id: 'heliHint', class: 'heli-ui heli-glass' });
    labelsEl = el('div', { id: 'heliLabels', class: 'heli-ui' });
    const stickHtml = '<b class="t"></b><b class="d"></b><b class="lf">⟲</b><b class="rt">⟳</b><i></i><span></span>';
    sL = el('div', { class: 'heli-stick l heli-ui' }, stickHtml); sR = el('div', { class: 'heli-stick r heli-ui' }, stickHtml.replace('⟲', '◀').replace('⟳', '▶'));
    card.appendChild(attr);
    // V13.1 top band: ⟵ exit · camera · rail on one row, the tour strip under it
    top = el('div', { id: 'heliTop', class: 'heli-ui heli-glass', role: 'toolbar' });
    exitB = el('button', { id: 'heliExit', 'data-a': 'exit' }, '<span class="i">⟵</span><span class="t"></span>');
    const rowA = el('div', { class: 'ht-row' });
    rowA.append(exitB, el('i', { class: 'ht-sep' }), views, el('i', { class: 'ht-sep' }), rail);
    top.append(rowA, card);
    for (const n of nodes()) document.body.appendChild(n);
    for (const n of [top, hud]) {
      for (const ev of ['pointerdown', 'mousedown', 'dblclick', 'wheel']) n.addEventListener(ev, stop, ev === 'wheel' ? { passive: true } : undefined);
      n.addEventListener('touchstart', stop, { passive: true });
      n.addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('[data-a]'); if (!b) return; const a = b.getAttribute('data-a');
        try { if (LOCAL[a]) LOCAL[a](); else if (RADIO[a]) RADIO[a](); else if (act[a]) act[a](); else if (a === 'exit') { const hb = document.getElementById('btnHome'); if (hb) hb.click(); } } catch (err) { console.warn('[heli-ui]', a, err); } });
    }
    for (const n of [hud, card.querySelector('.hc-top')]) n.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); n.click(); } });
    applyCompact(true);
    try { if (typeof matchMedia === 'function') { mq = matchMedia(COMPACT_MQ); mqFn = () => applyCompact(true); mq.addEventListener ? mq.addEventListener('change', mqFn) : mq.addListener(mqFn); } } catch (_) {}
    try { const V = HA.heliVoice; if (V && typeof V.onChange === 'function') unVoice = V.onChange(() => voiceUI()); } catch (_) { unVoice = null; }
    bindStick(sL, stick.l); bindStick(sR, stick.r);
    try { unRadio = heliRadio.onChange(() => radioUI()); } catch (_) { unRadio = null; }
    lastView = null; lastSig = ''; p0sig = null;
    const loop = () => { if (!mounted) return; raf = requestAnimationFrame(loop); const t = performance.now(); if (t - hudT > 80) { hudT = t; measureTop(); try { drawHud(); } catch (e) { if (!hudErr) { hudErr = true; console.warn('[heli-ui] hud', e); } } } };
    measureTop();
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop);
  }
  let hudT = 0, hudErr = false, unRadio = null, radioSig = '', unVoice = null, mq = null, mqFn = null;
  /* ---- compact layout (portrait phones / short screens): HUD = one strip, card = one line + controls; tap to expand */
  const COMPACT_MQ = '(max-width: 600px), (max-height: 560px)';
  const ui = { compact: false, hudOpen: true, cardOpen: true, userHud: null, userCard: null };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
  // the band's height → --heli-top-h (the HUD, hints and messages sit just below it)
  function measureTop() { if (!top) return; const h = Math.round(top.getBoundingClientRect().height); if (h && h !== topH) { topH = h; document.body.style.setProperty('--heli-top-h', h + 'px'); } }
  // the place / trip description fades in under the band for a few seconds when it changes (tap the strip to see it again)
  function showCap(ms = 6500) {
    if (!mounted || !card) return; const c = card.querySelector('.hc-cap'); if (!c || !c.textContent) return;
    c.classList.add('show'); document.body.classList.add('heli-capshow'); clearTimeout(capT);
    capT = setTimeout(() => { c.classList.remove('show'); document.body.classList.remove('heli-capshow'); }, ms);
  }
  function applyCompact(reset) {
    if (!mounted) return;
    let c = false; try { c = typeof matchMedia === 'function' && matchMedia(COMPACT_MQ).matches; } catch (_) {}
    ui.compact = c;
    if (reset) {
      const h = lsGet('heli.hud.' + (c ? 'c' : 'd')), k = lsGet('heli.card.' + (c ? 'c' : 'd'));
      ui.hudOpen = h != null ? h === '1' : !c; ui.cardOpen = k != null ? k === '1' : !c;
    }
    document.body.classList.toggle('heli-compact', c);
    hud.classList.toggle('mini', !ui.hudOpen); card.classList.remove('mini');
    hud.setAttribute('aria-expanded', ui.hudOpen ? 'true' : 'false'); card.querySelector('.hc-top').setAttribute('aria-expanded', ui.cardOpen ? 'true' : 'false');
    setText(hud.querySelector('.hx-tg'), ui.hudOpen ? '▴' : '▾'); setText(card.querySelector('.hc-tg'), ui.cardOpen ? '▾' : '▴');
    hud.title = ui.hudOpen ? T('hudLess') : T('hudMore'); card.querySelector('.hc-top').title = ui.cardOpen ? T('hudLess') : T('cardMore');
    setText(attr, ui.cardOpen ? T('attr') : '© OpenStreetMap contributors · USGS · USDA NAIP');
  }
  const LOCAL = {
    hudToggle: () => { ui.hudOpen = !ui.hudOpen; lsSet('heli.hud.' + (ui.compact ? 'c' : 'd'), ui.hudOpen ? '1' : '0'); applyCompact(false); drawHud(); },
    cardToggle: () => showCap(5000),
    voice: () => {
      const V = HA.heliVoice; if (!V) return;
      const on = typeof V.toggle === 'function' ? V.toggle() : V.set(!V.on);
      const isOn = typeof on === 'boolean' ? on : !!V.on;
      voiceUI(); message(isOn && !V.available ? T('noVoice') : isOn ? T('voiceOn') : T('voiceOff'), isOn && !V.available ? 3200 : 1600);
    },
  };
  function voiceUI() {
    if (!mounted || !rail) return;
    const V = HA.heliVoice, b = rail.querySelector('[data-a=voice]');
    if (!V) { if (b.style.display !== 'none') b.style.display = 'none'; return; }
    b.style.display = '';
    const on = !!V.on;
    setText(b.querySelector('.i'), on ? '🗣' : '🔇');
    setText(b.querySelector('.t'), String(T('voice')).replace(/^\S+\s/, ''));
    b.classList.toggle('on', on); b.classList.toggle('dim', !V.available);
    const lbl = T('voice') + ' — ' + (on ? T('voiceOn') : T('voiceOff'));
    b.title = lbl; b.setAttribute('aria-label', lbl); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  // the house radio in the helicopter (heli-audio.js heliRadio: same engine / station as the house, hits only)
  const RADIO = {
    radio: () => { const on = heliRadio.toggle(); radioUI(); message(on ? T('radioOnMsg') : T('radioOffMsg'), 1600); },
    radioPrev: () => { heliRadio.prev(); radioUI(); },
    radioNext: () => { heliRadio.next(); radioUI(); },
  };
  function radioUI() {
    if (!mounted || !rail) return;
    let c = null; try { c = heliRadio.current(lang()); } catch (_) {}
    const on = c ? !!c.on : !!(last && last.radioOn);
    const label = c && c.label ? c.label : T('radioTitle');
    const sub = !c ? T('radioOff') : !on ? (c.status === 'unavailable' ? T('radioUnavail') : T('radioOff')) : c.status === 'connecting' ? T('radioConnecting') : c.backup ? T('radioBackup') : c.sub || T('radioHits');
    const sig = [on, label, sub, c && c.playing, lang()].join('|');
    if (sig === radioSig) return; radioSig = sig;
    const b = rail.querySelector('[data-a=radio]');
    setText(b.querySelector('.t b'), on || (c && c.label) ? label : T('radioS'));
    setText(b.querySelector('.t small'), sub);
    setText(b.querySelector('.fq'), on && c ? (c.freq || c.call || '') : '');
    b.classList.toggle('on', on); b.classList.toggle('playing', !!(c && c.playing && c.status !== 'connecting'));
    b.title = (c && c.text) || T('radioTitle'); b.setAttribute('aria-label', T('aRadio')); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const rc = rail.querySelector('.hr-rc'); rc.classList.toggle('off', !on);
    const bp = rc.querySelector('[data-a=radioPrev]'), bn = rc.querySelector('[data-a=radioNext]');
    bp.title = T('aRadioPrev'); bp.setAttribute('aria-label', T('aRadioPrev')); bn.title = T('aRadioNext'); bn.setAttribute('aria-label', T('aRadioNext'));
  }
  function bindStick(node, s) {
    const knob = node.querySelector('i');
    const setK = () => { const R = node.getBoundingClientRect().width / 2 || 60; knob.style.transform = `translate(${(s.x * R * 0.6).toFixed(1)}px, ${(s.y * R * 0.6).toFixed(1)}px)`; };
    const at = (e) => { const r = node.getBoundingClientRect(); const R = r.width / 2; let x = (e.clientX - r.left - R) / (R * 0.72), y = (e.clientY - r.top - R) / (R * 0.72); const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } s.x = x; s.y = y; setK(); };
    node.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); s.id = e.pointerId; try { node.setPointerCapture(e.pointerId); } catch (_) {} at(e); });
    node.addEventListener('pointermove', (e) => { if (s.id !== e.pointerId) return; e.stopPropagation(); e.preventDefault(); at(e); });
    const end = (e) => { if (s.id !== e.pointerId) return; s.id = null; s.x = 0; s.y = 0; setK(); };
    node.addEventListener('pointerup', end); node.addEventListener('pointercancel', end); node.addEventListener('lostpointercapture', end);
    for (const ev of ['mousedown', 'dblclick', 'click']) node.addEventListener(ev, stop);
    node.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
    node.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  function unmount() {
    if (!mounted) return; mounted = false;
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf); raf = 0;
    try { unRadio && unRadio(); } catch (_) {} unRadio = null; radioSig = '';
    try { unVoice && unVoice(); } catch (_) {} unVoice = null;
    try { if (mq && mqFn) { mq.removeEventListener ? mq.removeEventListener('change', mqFn) : mq.removeListener(mqFn); } } catch (_) {} mq = mqFn = null;
    document.body.classList.remove('heli-compact', 'heli-capshow'); clearTimeout(capT); lastCap = ''; topH = 0;
    try { document.body.style.removeProperty('--heli-top-h'); } catch (_) {}
    for (const n of nodes()) n && n.remove();
    pool.length = 0;
    stick.l.x = stick.l.y = stick.r.x = stick.r.y = 0; stick.l.id = stick.r.id = null;
    document.body.classList.remove('heli-manual', 'heli-touch');
  }
  let lastSig = '', p0sig = null, lastView = null, vhT = 0, lastLang = '';
  const setText = (node, txt) => { if (node && node.textContent !== txt) node.textContent = txt; };
  function update(st = {}) {
    if (!mounted) return;
    last = st;
    const L = lang(), rtl = L === 'he';
    if (L !== lastLang) { lastLang = L; for (const n of [top, views, vhint, card, rail, hud, msg, hint, sL, sR]) n.setAttribute('dir', rtl ? 'rtl' : 'ltr'); lastSig = ''; }
    // camera bar
    const bIn = views.querySelector('[data-a=in]'), bOut = views.querySelector('[data-a=out]'), bTop = views.querySelector('[data-a=top]');
    setText(bIn.querySelector('.t'), T('viewInS')); setText(bOut.querySelector('.t'), T('viewOutS')); setText(bTop.querySelector('.t'), T('viewTopS'));
    bIn.title = T('viewIn') + ' — ' + (st.seat === 'cabin' ? T('seatCabin') : T('seatFront')); bOut.title = T('viewOut'); bTop.title = T('viewTop');
    views.setAttribute('aria-label', T('camBar'));
    bIn.classList.toggle('on', st.view === 'in'); bOut.classList.toggle('on', st.view === 'out'); bTop.classList.toggle('on', st.view === 'top');
    for (const b of [bIn, bOut, bTop]) b.setAttribute('aria-pressed', b.classList.contains('on') ? 'true' : 'false');
    const seatTag = st.view === 'in' && st.seat === 'cabin' ? ' · ' + T('seatCabin') : '';
    if (st.view !== lastView || seatTag !== (update._seat || '')) {
      if (lastView !== null) { setText(vhint, (st.view === 'in' ? T('dragLook') : st.view === 'out' ? T('dragOrbit') : T('topHint')) + seatTag); vhint.classList.add('show'); clearTimeout(vhT); vhT = setTimeout(() => vhint && vhint.classList.remove('show'), 3600); }
      lastView = st.view; update._seat = seatTag;
    }
    // rail
    const bm = rail.querySelector('[data-a=manual]');
    setText(bm.querySelector('.i'), st.manual ? '🛬' : '🕹'); setText(bm.querySelector('.t'), st.manual ? T('autoS') : T('manualS'));
    bm.title = st.manual ? T('auto') : T('manual'); bm.classList.toggle('on', !!st.manual);
    const bh = rail.querySelector('[data-a=flyhome]'); setText(bh.querySelector('.t'), T('flyHomeS')); bh.title = T('flyHome'); bh.classList.toggle('dim', !!st.parked && !st.atCasino);
    // V13.1 🎰 direct flight to the casino (on = flying there, dim = the landing / door sequence is running)
    const bc = rail.querySelector('[data-a=casino]'); setText(bc.querySelector('.t'), T('casinoS'));
    if (bc.title !== T('aCasino')) { bc.title = T('aCasino'); bc.setAttribute('aria-label', T('casinoBtn')); }
    bc.classList.toggle('on', !!st.casinoOn); bc.classList.toggle('dim', !!st.casinoDim); bc.setAttribute('aria-pressed', st.casinoOn ? 'true' : 'false');
    radioUI(); voiceUI();
    // card
    card.classList.toggle('manual', !!st.manual);
    const go = card.querySelector('.hc-go');
    setText(go, st.parked ? T('takeoff') : '');
    go.style.display = st.parked && !st.casinoDim ? '' : 'none';
    setText(card.querySelector('[data-a=prev]'), T('prev')); setText(card.querySelector('[data-a=next]'), T('next'));
    setText(card.querySelector('[data-a=pause]'), st.paused ? T('play') : T('pause'));
    setText(card.querySelector('[data-a=speed]'), T('speed', st.speedMul || 1));
    for (const b of card.querySelectorAll('.hc-tour')) { const a = b.getAttribute('data-a'); b.style.display = st.parked || st.manual || st.casinoDim || (st.trip && (a === 'prev' || a === 'next')) ? 'none' : ''; }
    for (const [a, k] of [['prev', 'aPrev'], ['next', 'aNext'], ['pause', st.paused ? 'aPlay' : 'aPause'], ['speed', 'aSpeed']]) { const b = card.querySelector('[data-a=' + a + ']'); const v = T(k); if (b.getAttribute('aria-label') !== v) { b.setAttribute('aria-label', v); b.title = v; } }
    setText(attr, ui.cardOpen ? T('attr') : '© OpenStreetMap contributors · USGS · USDA NAIP');
    if (L !== update._lastL) { update._lastL = L; applyCompact(false); }
    if (!p0sig || p0sig !== st.statusText) { p0sig = st.statusText; if (!st.poi) setText(card.querySelector('.hc-cap'), st.statusText || ''); }
    setText(hint, st.touch ? T('hintTouch') : T('hintKeys'));
    sL.querySelector('span').textContent = T('stickL'); sR.querySelector('span').textContent = T('stickR');
    sL.querySelector('.t').textContent = T('up'); sL.querySelector('.d').textContent = T('down');
    sR.querySelector('.t').textContent = T('fwd'); sR.querySelector('.d').textContent = T('back');
    document.body.classList.toggle('heli-manual', !!st.manual);
    document.body.classList.toggle('heli-touch', !!st.touch);
    const p = st.poi;
    const tr = st.trip || null;
    card.classList.toggle('trip', !!tr);
    const sig = (p ? p.id : '-') + '|' + st.phase + '|' + L + '|' + st.cardMode + '|' + (tr ? tr.name + tr.kind : '');
    if (tr) { lastSig = sig; setText(card.querySelector('.hc-ico'), tr.icon || '🎰'); setText(card.querySelector('.hc-name'), tr.name || ''); setText(card.querySelector('.hc-kind'), tr.kind || ''); setText(card.querySelector('.hc-cap'), tr.cap || ''); }
    else if (sig !== lastSig) {
      lastSig = sig;
      const name = p ? (L === 'he' ? p.he || p.name : p.name) : T('tour');
      setText(card.querySelector('.hc-ico'), p ? ICON[p.kind] || '📍' : '🚁');
      setText(card.querySelector('.hc-name'), st.cardMode === 'next' && p ? T('nextStop', name) : name);
      setText(card.querySelector('.hc-kind'), p ? T('kind_' + p.kind) + (L === 'he' && p.he ? ' · ' + p.name : '') : '');
      setText(card.querySelector('.hc-cap'), p ? T('cap_' + p.id) : st.statusText || '');
    }
    setText(card.querySelector('.hc-stop'), st.stopText || '');
    const bar = card.querySelector('.hc-bar');
    bar.querySelector('i').style.width = (100 * clamp(st.progress || 0, 0, 1)).toFixed(1) + '%';
    const ticks = st.ticks || [];
    let bs = bar.querySelectorAll('b');
    if (bs.length !== ticks.length) { for (const b of bs) b.remove(); for (let i = 0; i < ticks.length; i++) bar.appendChild(el('b')); bs = bar.querySelectorAll('b'); }
    ticks.forEach((t, i) => { bs[i].style.left = (100 * t).toFixed(2) + '%'; bs[i].classList.toggle('done', (st.progress || 0) >= t); });
    // exit (⟵ back home) + the fading caption
    setText(exitB.querySelector('.t'), T('exitS')); if (exitB.title !== T('home')) { exitB.title = T('home'); exitB.setAttribute('aria-label', T('home')); }
    { const c = card.querySelector('.hc-cap').textContent; if (c !== lastCap) { lastCap = c; if (c) showCap(); } }
    drawHud();
  }

  /* ---------------------------------------------------------------- avionics HUD + mini map */
  const hs = { range: 1800, x: null, z: null, h: 0 };
  function pose() {
    const s = last || {};
    const tp = telemetry.pose;
    const path = telemetry.path;
    let x, z, h, agl, speed;
    if (isFinite(s.x) && isFinite(s.z)) { x = s.x; z = s.z; h = isFinite(s.h) ? s.h : (s.hdg || 0) * Math.PI / 180; agl = s.agl; speed = (s.kmh || 0) / 3.6; }
    else if (s.parked && path && path.home && !(tp && telemetry.src === 'manual' && s.manual)) { const H0 = path.home; x = H0.x; z = H0.z; h = isFinite(H0.h) ? H0.h : 0; agl = 0; speed = 0;
      if (tp && Math.hypot(tp.x - H0.x, tp.z - H0.z) < 30) { x = tp.x; z = tp.z; } }
    else if (tp) { x = tp.x; z = tp.z; h = tp.h; agl = tp.agl; speed = tp.speed; }
    else return null;
    if (isFinite(s.hdg)) h = s.hdg * Math.PI / 180;
    const vy = s.parked ? 0 : tp && isFinite(tp.vy) ? tp.vy : 0;
    return { x, z, h, agl: isFinite(s.agl) ? s.agl : agl, speed, vy };
  }
  function nextTarget(P) {
    const s = last || {};
    const L = lang();
    const nm = (p) => (L === 'he' ? p.he || p.name : p.name);
    if (s.next && isFinite(s.next.x)) return { x: s.next.x, z: s.next.z, name: s.next.name || '', label: s.next.label || T('nextPoi'), id: s.next.id };
    const path = telemetry.path;
    const pois = s.pois || telemetry.pois || [];
    if (s.manual) {
      let best = null, bd = Infinity;
      for (const p of pois) { const d = Math.hypot(p.x - P.x, p.z - P.z); if (d < bd) { bd = d; best = p; } }
      return best ? { x: best.x, z: best.z, name: nm(best), label: T('nearPoi'), id: best.id } : null;
    }
    if (s.poi) return { x: s.poi.x, z: s.poi.z, name: nm(s.poi), label: s.phase === 'orbit' ? T('nowPoi') : T('nextPoi'), id: s.poi.id };
    if (s.parked && path && path.legs && path.legs.length && !((s.progress || 0) > 0.999)) { const p = path.legs[0].poi; return { x: p.x, z: p.z, name: nm(p), label: T('nextPoi'), id: p.id }; }
    if (path && path.home && !s.parked) return { x: path.home.x, z: path.home.z, name: T('homeDest'), label: T('nextPoi'), id: 'home', home: true };
    return null;
  }
  const fmtDist = (d) => (d < 950 ? Math.round(d / 10) * 10 + ' ' + T('m') : (d / 1000).toFixed(d < 9950 ? 1 : 0) + ' ' + T('km'));
  function drawHud() {
    if (!mounted || !hud) return;
    const s = last || {};
    const P = pose();
    // readouts
    const cS = hud.querySelector('[data-k=spd]'), cA = hud.querySelector('[data-k=alt]'), cH = hud.querySelector('[data-k=hdg]');
    const kmh = isFinite(s.kmh) ? s.kmh : P ? P.speed * 3.6 : 0;
    setText(cS.querySelector('b'), String(Math.round(kmh))); setText(cS.querySelector('span'), T('kmh'));
    const ft = isFinite(s.altFt) ? s.altFt : 0;
    setText(cA.querySelector('b'), String(Math.round(ft / 10) * 10));
    const agl = P && isFinite(P.agl) ? Math.max(0, P.agl) : null;
    const altSpan = cA.querySelector('span');
    setText(altSpan, T('altS') + ' ft'); altSpan.title = T('altS');
    const rowA = hud.querySelector('.hx-agl .a'), rowV = hud.querySelector('.hx-agl .v');
    rowA.innerHTML = agl != null ? '<b>' + Math.round(agl) + '</b> ' + T('m') + ' ' + T('aglS') : '';
    const vy = P && isFinite(P.vy) ? P.vy : 0;
    rowV.innerHTML = '<b dir="ltr">' + (Math.abs(vy) < 0.3 ? '±0' : (vy > 0 ? '↑' : '↓') + Math.abs(vy).toFixed(1)) + '</b> ' + (T('mps') === 'mps' ? 'm/s' : T('mps'));
    const hd = isFinite(s.hdg) ? s.hdg : P ? ((P.h * 180 / Math.PI) % 360 + 360) % 360 : 0;
    setText(cH.querySelector('b'), String(Math.round(hd) % 360).padStart(3, '0') + '°'); setText(cH.querySelector('span'), T('hdgS') + ' ' + CARD[Math.round(hd / 45) % 8]);
    // next place
    const nx = hud.querySelector('.hx-next');
    const tg = P ? nextTarget(P) : null;
    if (tg) {
      nx.classList.remove('none');
      const d = Math.hypot(tg.x - P.x, tg.z - P.z);
      setText(nx.querySelector('.lb'), tg.label); setText(nx.querySelector('.nm'), tg.name);
      setText(nx.querySelector('.ds'), d < 60 ? '•' : fmtDist(d));
      const brg = Math.atan2(tg.x - P.x, -(tg.z - P.z));
      const rel = s.view === 'top' ? brg : wrapPi(brg - P.h);
      nx.querySelector('.ar').style.transform = `rotate(${(rel * 180 / Math.PI).toFixed(0)}deg)`;
    } else nx.classList.add('none');
    drawMap(P, tg);
  }
  function drawMap(P, tg) {
    const cv = mapCv; if (!cv) return;
    const r = cv.getBoundingClientRect(); const W = Math.max(40, Math.round(r.width)), H = Math.max(30, Math.round(r.height));
    const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'); if (!g) return;
    try { g.direction = 'ltr'; } catch (_) {}
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0d1a24'; g.fillRect(0, 0, W, H);
    if (!P) return;
    // range: show the next target when it is within ~5 km, smoothed
    const dT = tg ? Math.hypot(tg.x - P.x, tg.z - P.z) : 1500;
    const want = clamp(dT * 1.25, 900, 5200);
    hs.range += (want - hs.range) * 0.12;
    const R = hs.range;                 // metres from the centre to the shorter edge
    const k = Math.min(W, H) / 2 / R;   // px per metre
    const cx = W / 2, cy = H / 2;
    const X = (x) => cx + (x - P.x) * k, Y = (z) => cy + (z - P.z) * k;
    const map = (last && last.map) || getAvionicsMap();
    if (map && map.canvas) {
      const mk = map.S / (2 * map.R); // map px per metre
      try { g.save(); g.globalAlpha = 0.95; g.translate(cx, cy); g.scale(k / mk, k / mk); g.drawImage(map.canvas, -(P.x + map.R) * mk, -(P.z + map.R) * mk); g.restore(); } catch (_) {}
    } else {
      g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
      const step = R > 2500 ? 1000 : 500;
      for (let gx = Math.ceil((P.x - R * 2) / step) * step; gx < P.x + R * 2; gx += step) { g.beginPath(); g.moveTo(X(gx), 0); g.lineTo(X(gx), H); g.stroke(); }
      for (let gz = Math.ceil((P.z - R * 2) / step) * step; gz < P.z + R * 2; gz += step) { g.beginPath(); g.moveTo(0, Y(gz)); g.lineTo(W, Y(gz)); g.stroke(); }
    }
    // route
    const s = last || {};
    const path = telemetry.path;
    const pts = s.route || (path && path.points);
    if (pts && pts.X && pts.X.length > 1 && !s.manual) {
      const n = pts.X.length, stepI = Math.max(1, Math.floor(n / 900));
      g.strokeStyle = 'rgba(124,243,200,0.85)'; g.lineWidth = 1.6; g.setLineDash([]);
      g.beginPath(); let started = false;
      for (let i = 0; i < n; i += stepI) { const x = X(pts.X[i]), y = Y(pts.Z[i]); if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); }
      g.lineTo(X(pts.X[n - 1]), Y(pts.Z[n - 1])); g.stroke();
    }
    // places
    const pois = s.pois || telemetry.pois || [];
    for (const p of pois) {
      const x = X(p.x), y = Y(p.z); if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
      const on = tg && tg.id === p.id;
      g.beginPath(); g.arc(x, y, on ? 4.6 : 3, 0, TAU);
      g.fillStyle = on ? '#43e0ff' : '#f3dc9f'; g.fill();
      g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.stroke();
      if (on) { g.beginPath(); g.arc(x, y, 8, 0, TAU); g.strokeStyle = 'rgba(67,224,255,0.8)'; g.lineWidth = 1.5; g.stroke(); }
    }
    // home
    const hm = (s.home) || (path && path.home);
    if (hm) {
      const x = X(hm.x), y = Y(hm.z);
      const ex = clamp(x, 7, W - 7), ey = clamp(y, 7, H - 7);
      g.fillStyle = '#7cf3c8'; g.strokeStyle = '#04212a'; g.lineWidth = 1;
      g.beginPath(); g.arc(ex, ey, 6, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#04212a'; g.font = '700 8px system-ui,Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', ex, ey + 0.5);
    }
    // off-map target arrow on the edge
    if (tg) {
      const x = X(tg.x), y = Y(tg.z);
      if (x < 4 || x > W - 4 || y < 4 || y > H - 4) {
        const a = Math.atan2(y - cy, x - cx); const ex = clamp(cx + Math.cos(a) * W, 8, W - 8), ey = clamp(cy + Math.sin(a) * H, 8, H - 8);
        g.save(); g.translate(ex, ey); g.rotate(a); g.fillStyle = '#43e0ff'; g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -4.5); g.lineTo(-4, 4.5); g.closePath(); g.fill(); g.restore();
      }
    }
    // helicopter (heading arrow)
    g.save(); g.translate(cx, cy); g.rotate(P.h);
    g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, -8); g.lineTo(5.5, 6); g.lineTo(0, 3.2); g.lineTo(-5.5, 6); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // north + scale
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(3, 3, 14, 14);
    g.fillStyle = '#fff'; g.font = '700 9px system-ui,Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', 10, 10.5);
    const nice = [200, 500, 1000, 2000, 5000].find((m) => m * k > W * 0.22) || 5000;
    const bx0 = 6, bx1 = 6 + nice * k, by = H - 6;
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(bx0 - 3, by - 14, bx1 - bx0 + 6, 17);
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(bx0, by - 3); g.lineTo(bx0, by); g.lineTo(bx1, by); g.lineTo(bx1, by - 3); g.stroke();
    g.font = '600 8.5px system-ui,Arial'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillStyle = '#fff';
    g.fillText(nice >= 1000 ? nice / 1000 + ' km' : nice + ' m', bx0 + 2, by - 3);
  }

  let msgT = 0;
  function message(text, ms = 2200) { if (!mounted) return; msg.textContent = text; msg.classList.remove('show'); void msg.offsetWidth; msg.classList.add('show'); clearTimeout(msgT); msgT = setTimeout(() => msg && msg.classList.remove('show'), ms); }
  function bubble(text, x, y, show) { if (!mounted) return; if (!show) { if (bub.style.display !== 'none') bub.style.display = 'none'; return; } setText(bub, text); bub.style.display = 'block'; bub.style.left = Math.round(x) + 'px'; bub.style.top = Math.round(y) + 'px'; }
  // labels: [{ key, text, sub, icon, cls, x, y }] in screen px (already projected)
  function labels(list) {
    if (!mounted) return;
    list = list || [];
    while (pool.length < list.length) { const d = el('div', { class: 'hl' }, '<i></i><span></span><small></small>'); labelsEl.appendChild(d); pool.push({ d, key: null }); }
    for (let i = 0; i < pool.length; i++) {
      const P = pool[i], L = list[i];
      if (!L) { if (P.d.style.display !== 'none') P.d.style.display = 'none'; continue; }
      const lk = L.key + '|' + L.text + '|' + (L.sub || '');
      if (P.key !== lk) { P.key = lk; P.d.querySelector('i').textContent = L.icon || '📍'; P.d.querySelector('span').textContent = L.text; P.d.querySelector('small').textContent = L.sub || ''; }
      const cls = 'hl' + (L.cls ? ' ' + L.cls : ''); if (P.d.className !== cls) P.d.className = cls;
      P.d.style.display = '';
      P.d.style.transform = `translate(${Math.round(L.x)}px, ${Math.round(L.y)}px) translate(-50%, -100%)`;
    }
  }
  return { mount, unmount, update, message, bubble, labels, stick, T, get mounted() { return mounted; }, get root() { return card; }, get hud() { return hud; } };
}

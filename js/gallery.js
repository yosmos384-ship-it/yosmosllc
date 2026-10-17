// gallery.js — V7 "הדמיות מוכנות": a lightweight viewer for the PRE-RENDERED 360° panoramas in renders/
// (6 renovation styles × key rooms, equirectangular JPEG 4096×2048 + 1024×512 preview, manifest renders/index.json).
// Needs no three.js and no 3D scene: raw WebGL (one full-screen triangle, the equirect is sampled per pixel, so there is
// no sphere seam), with a flat <img> fallback when WebGL is missing. It can be opened while the tour is still loading.
//   - choose a style (chips with colour swatches) and a room; the _sm preview shows first, then the full image
//   - drag / swipe to look (inertia), pinch / wheel to zoom; ✕ is fixed in the corner (safe-area aware); Esc closes
//   - "החל סגנון זה בסיור" calls window.__tour.styles.set(id) (only when the tour has loaded)
// Owner: STYLES & RENDERS bot (V7). Every user-visible string is in GALLERY_STRINGS (for the i18n bot).
// No side effects on import: installGallery() injects the CSS, the overlay and the buttons (called from core-ui.js).

export const GALLERY_STRINGS = {
  he: {
    btn: 'הדמיות', btnTitle: 'הדמיות 360° מוכנות של כל סגנונות השיפוץ', loaderBtn: 'בינתיים: צפו בהדמיות המוכנות',
    title: 'הדמיות מוכנות', subtitle: 'סגנונות שיפוץ · 360°', close: 'סגור', style: 'סגנון', room: 'חדר',
    hint: 'גררו כדי להסתכל · צביטה או גלגלת לזום', loading: 'טוען הדמיה…', loadingHd: 'טוען איכות מלאה…',
    apply: '✓ החל סגנון זה בסיור', applying: 'מחיל…', applied: 'הסגנון הוחל בסיור ✓', applyWait: 'הסיור עדיין נטען — אפשר להחיל אחרי הטעינה', applyFail: 'החלת הסגנון נכשלה',
    current: 'הסגנון הנוכחי בסיור', missing: 'אין עדיין הדמיה לחדר הזה בסגנון הזה', error: 'טעינת ההדמיה נכשלה — בדקו חיבור ונסו שוב', none: 'ההדמיות עדיין לא זמינות',
    noWebgl: 'תצוגה שטוחה (הדפדפן אינו תומך ב-WebGL) — גללו הצידה', resetView: 'איפוס מבט',
    // V9: floating buttons in the tour + viewer navigation
    fabTitle: 'הדמיות 360° של כל סגנון שיפוץ — נפתח בחדר שבו אתם נמצאים', styleFab: 'סגנון', styleFabTitle: 'החלפת סגנון השיפוץ בסיור',
    tip: 'ראו הדמיות של כל סגנון שיפוץ', currentBtn: '✓ זה הסגנון הנוכחי בסיור', prevRoom: 'החדר הקודם', nextRoom: 'החדר הבא',
    swipe: 'החליקו מהר הצידה לחדר אחר',
    roomTip: 'יש הדמיות לחדר הזה · 🖼', nearNote: 'אין הדמיה לחדר הזה — מוצג החדר הקרוב',
    ba: '⇆ לפני / אחרי', baTitle: 'השוואה: הבית היום (מהסרטון) מול השיפוץ לפי האקסל', // V11
    rooms: { street: 'חזית ורחוב', frontyard: 'חצר קדמית', living: 'סלון', kitchen: 'מטבח', bath1: 'חדר רחצה 1', bed1: 'חדר שינה 1', bed2: 'חדר שינה 2', bed3: 'חדר שינה 3', bed4: 'חדר שינה 4', bath2: 'חדר רחצה 2', hall: 'מסדרון', landing: 'מבואה', basement: 'מרתף', backyard: 'חצר אחורית', porch: 'מרפסת כניסה' },
  },
  en: {
    btn: 'Renders', btnTitle: 'Ready-made 360° renders of every renovation style', loaderBtn: 'Meanwhile: view the ready-made renders',
    title: 'Ready-made renders', subtitle: 'Renovation styles · 360°', close: 'Close', style: 'Style', room: 'Room',
    hint: 'Drag to look around · pinch or scroll to zoom', loading: 'Loading render…', loadingHd: 'Loading full quality…',
    apply: '✓ Apply this style in the tour', applying: 'Applying…', applied: 'Style applied in the tour ✓', applyWait: 'The tour is still loading — you can apply it afterwards', applyFail: 'Could not apply the style',
    current: 'Current tour style', missing: 'No render of this room in this style yet', error: 'The render failed to load — check the connection and retry', none: 'Renders are not available yet',
    noWebgl: 'Flat view (no WebGL in this browser) — scroll sideways', resetView: 'Reset view',
    fabTitle: 'Ready-made 360° renders of every renovation style — opens in the room you are in', styleFab: 'Style', styleFabTitle: 'Change the renovation style in the tour',
    tip: 'See renders of every renovation style', currentBtn: '✓ This is the current tour style', prevRoom: 'Previous room', nextRoom: 'Next room',
    swipe: 'Swipe fast sideways for another room',
    roomTip: 'This room has renders · 🖼', nearNote: 'No render of this room — showing the nearest one',
    ba: '⇆ Before / after', baTitle: 'Compare: the house today (from the video) vs the scope-of-work rehab',
    rooms: { street: 'Front & street', frontyard: 'Front yard', living: 'Living room', kitchen: 'Kitchen', bath1: 'Bathroom 1', bed1: 'Bedroom 1', bed2: 'Bedroom 2', bed3: 'Bedroom 3', bed4: 'Bedroom 4', bath2: 'Bathroom 2', hall: 'Hall', landing: 'Landing', basement: 'Basement', backyard: 'Back yard', porch: 'Porch' },
  },
  es: {
    btn: 'Renders', btnTitle: 'Renders 360° listos de todos los estilos de reforma', loaderBtn: 'Mientras tanto: ver los renders listos',
    title: 'Renders listos', subtitle: 'Estilos de reforma · 360°', close: 'Cerrar', style: 'Estilo', room: 'Estancia',
    hint: 'Arrastra para mirar · pellizca o usa la rueda para el zoom', loading: 'Cargando render…', loadingHd: 'Cargando calidad completa…',
    apply: '✓ Aplicar este estilo en el recorrido', applying: 'Aplicando…', applied: 'Estilo aplicado en el recorrido ✓', applyWait: 'El recorrido aún se está cargando — podrás aplicarlo después', applyFail: 'No se pudo aplicar el estilo',
    current: 'Estilo actual del recorrido', missing: 'Aún no hay render de esta estancia en este estilo', error: 'No se pudo cargar el render — revisa la conexión', none: 'Los renders aún no están disponibles',
    noWebgl: 'Vista plana (este navegador no tiene WebGL) — desplázate de lado', resetView: 'Restablecer vista',
    fabTitle: 'Renders 360° listos de todos los estilos de reforma — se abre en la estancia donde estás', styleFab: 'Estilo', styleFabTitle: 'Cambiar el estilo de reforma en el recorrido',
    tip: 'Mira los renders de cada estilo de reforma', currentBtn: '✓ Es el estilo actual del recorrido', prevRoom: 'Estancia anterior', nextRoom: 'Estancia siguiente',
    swipe: 'Desliza rápido de lado para otra estancia',
    roomTip: 'Hay renders de esta estancia · 🖼', nearNote: 'No hay render de esta estancia — se muestra la más cercana',
    ba: '⇆ Antes / después', baTitle: 'Comparar: la casa hoy (del video) frente a la remodelación según presupuesto',
    rooms: { street: 'Fachada y calle', frontyard: 'Jardín delantero', living: 'Salón', kitchen: 'Cocina', bath1: 'Baño 1', bed1: 'Dormitorio 1', bed2: 'Dormitorio 2', bed3: 'Dormitorio 3', bed4: 'Dormitorio 4', bath2: 'Baño 2', hall: 'Pasillo', landing: 'Rellano', basement: 'Sótano', backyard: 'Jardín trasero', porch: 'Porche' },
  },
};

const MANIFEST = 'renders/index.json';
const FOV_MIN = 30, FOV_MAX = 110, PITCH_DEF = -0.1;
// vertical FOV: wider on portrait phones so the room, not just a slice of it, fills the screen
const fovDef = () => { try { return (window.innerWidth || 1) < (window.innerHeight || 1) ? 96 : 78; } catch (_) { return 80; } };
let FOV_DEF = 80;
const LS_STYLE = 'eakin_style';
const lang = () => { try { const l = (document.documentElement.lang || 'he').slice(0, 2).toLowerCase(); return GALLERY_STRINGS[l] ? l : 'he'; } catch (_) { return 'he'; } };
const T = () => GALLERY_STRINGS[lang()];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const tour = () => (typeof window !== 'undefined' && window.__tour) || null;

/* ============================================================================================ CSS */
const CSS = `
#gallery{position:fixed;inset:0;z-index:60;display:none;background:#05070b;color:var(--text,#eef3f8);font-family:var(--font,system-ui,sans-serif);touch-action:none;-webkit-user-select:none;user-select:none}
#gallery.show{display:block}
#gallery canvas.gv-cv{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none}
#gallery canvas.gv-cv:active{cursor:grabbing}
#gallery .gv-flat{position:absolute;inset:0;overflow-x:auto;overflow-y:hidden;display:none;touch-action:pan-x}
#gallery .gv-flat img{height:100%;width:auto;max-width:none;display:block}
#gallery.flat .gv-flat{display:block}#gallery.flat canvas.gv-cv{display:none}
#gallery .gv-top{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top,0px)) calc(12px + env(safe-area-inset-right,0px)) 10px calc(12px + env(safe-area-inset-left,0px));background:linear-gradient(180deg,rgba(5,7,11,.78),rgba(5,7,11,0));pointer-events:none}
#gallery .gv-top .gv-t{pointer-events:none;min-width:0;flex:1}
#gallery .gv-top b{display:block;font-size:16px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#gallery .gv-top small{display:block;font-size:12px;color:var(--muted,rgba(225,235,245,.7));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#gallery .gv-x{position:fixed;z-index:3;top:calc(8px + env(safe-area-inset-top,0px));inset-inline-end:calc(8px + env(safe-area-inset-right,0px));width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(12,16,24,.82);color:#fff;font-size:24px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;box-shadow:0 6px 18px rgba(0,0,0,.4)}
#gallery .gv-x:hover{background:rgba(40,52,70,.92)}
#gallery .gv-top .gv-sp{width:50px;flex:0 0 auto}
#gallery .gv-bot{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:8px;padding:10px calc(10px + env(safe-area-inset-right,0px)) calc(10px + env(safe-area-inset-bottom,0px)) calc(10px + env(safe-area-inset-left,0px));background:linear-gradient(0deg,rgba(5,7,11,.86) 55%,rgba(5,7,11,0))}
#gallery .gv-row{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;touch-action:pan-x;padding:2px}
#gallery .gv-row::-webkit-scrollbar{display:none}
#gallery .gv-chip{flex:0 0 auto;display:flex;align-items:center;gap:7px;min-height:40px;padding:6px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(20,26,36,.78);color:inherit;font:600 13px/1.2 inherit;font-family:inherit;cursor:pointer;white-space:nowrap}
#gallery .gv-chip:hover{background:rgba(40,52,70,.85)}
#gallery .gv-chip.on{border-color:var(--accent,#43e0ff);background:rgba(67,224,255,.18);box-shadow:0 0 0 1px rgba(67,224,255,.35) inset}
#gallery .gv-chip:disabled{opacity:.38;cursor:default}
#gallery .gv-sw{display:flex;border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,.25);flex:0 0 auto}
#gallery .gv-sw i{display:block;width:8px;height:20px}
#gallery .gv-meta{display:flex;align-items:center;gap:8px;min-height:24px;font-size:12.5px;color:var(--muted,rgba(225,235,245,.75))}
#gallery .gv-meta .gv-desc{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#gallery .gv-apply{flex:0 0 auto;min-height:36px;padding:6px 12px;border-radius:10px;border:0;background:linear-gradient(180deg,rgba(67,224,255,.9),rgba(30,170,210,.9));color:var(--accent-ink,#04212a);font:700 12.5px/1.2 inherit;font-family:inherit;cursor:pointer}
#gallery .gv-apply:disabled{opacity:.5;cursor:default}
#gallery .gv-ba{flex:0 0 auto;min-height:36px;padding:6px 12px;border-radius:10px;border:1px solid rgba(255,214,140,.7);background:rgba(255,214,140,.14);color:#ffe2ad;font:700 12.5px/1.2 inherit;font-family:inherit;cursor:pointer;margin-inline-end:8px}
#gallery .gv-msg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:10px 16px;border-radius:12px;background:rgba(12,16,24,.82);border:1px solid rgba(255,255,255,.14);font-size:13.5px;font-weight:600;display:none;pointer-events:none;text-align:center;max-width:calc(100vw - 40px)}
#gallery .gv-msg.on{display:block}
#gallery .gv-prog{position:absolute;top:0;left:0;height:3px;width:0;background:var(--accent,#43e0ff);box-shadow:0 0 8px rgba(67,224,255,.7);transition:width .25s ease, opacity .4s ease;z-index:2}
#gallery .gv-toast{position:absolute;left:50%;bottom:calc(150px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);padding:9px 14px;border-radius:12px;background:rgba(12,16,24,.9);border:1px solid rgba(67,224,255,.4);font-size:13px;font-weight:600;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap}
#gallery .gv-toast.on{opacity:1}
#gallery .gv-hint{font-size:11.5px;color:rgba(225,235,245,.55)}
@media (max-width:600px){#gallery .gv-meta .gv-desc{display:none}#gallery .gv-meta{justify-content:space-between}#gallery .gv-chip{min-height:38px;padding:5px 10px;font-size:12.5px}}
#btnGalleryRow{display:none;flex:0 0 auto;min-height:44px;padding:0 10px;border-radius:10px;background:rgba(255,255,255,.08);font-size:13px;font-weight:700;white-space:nowrap}
@media (max-width:900px){#btnGalleryRow{display:block}}
#loader .gv-loadbtn{display:block;width:100%;margin-top:14px;min-height:44px;border-radius:12px;border:1px solid rgba(67,224,255,.45);background:rgba(67,224,255,.12);color:var(--text,#eef3f8);font:700 14px/1.2 inherit;font-family:inherit;cursor:pointer}
#loader .gv-loadbtn:hover{background:rgba(67,224,255,.22)}
/* V9: viewer — room arrows, toast under the title (the chip panel is taller on phones), wrapped chips on portrait phones */
#gallery .gv-nav{position:absolute;z-index:2;top:42%;width:46px;height:46px;margin-top:-23px;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(12,16,24,.62);color:#fff;font:700 26px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35)}
#gallery .gv-nav:hover{background:rgba(40,52,70,.9)}
#gallery .gv-prev{inset-inline-start:calc(8px + env(safe-area-inset-left,0px))}
#gallery .gv-next{inset-inline-end:calc(8px + env(safe-area-inset-right,0px))}
#gallery .gv-toast{bottom:auto;top:calc(66px + env(safe-area-inset-top,0px));white-space:normal;text-align:center;max-width:calc(100vw - 32px)}
#gallery .gv-apply.is-cur{background:rgba(124,243,200,.16);color:var(--accent-2,#7cf3c8);border:1px solid rgba(124,243,200,.5);opacity:1}
#gallery .gv-pos{font-variant-numeric:tabular-nums;opacity:.8}
@media (max-width:600px){
  #gallery .gv-bot{gap:6px;padding-top:14px}
  #gallery .gv-row{flex-wrap:wrap;justify-content:center;overflow:visible;touch-action:manipulation;gap:5px}
  #gallery .gv-chip{min-height:36px;padding:4px 9px;font-size:12px;gap:5px;border-radius:10px}
  #gallery .gv-sw i{width:5px;height:16px}
  #gallery .gv-meta .gv-hint{display:none}
  #gallery .gv-apply{flex:1;min-height:44px;font-size:14px}
  #gallery .gv-ba{min-height:44px;font-size:14px}
}
@media (max-height:520px){#gallery .gv-meta .gv-hint,#gallery .gv-meta .gv-desc{display:none}#gallery .gv-bot{gap:5px;padding-top:6px}#gallery .gv-chip{min-height:34px;padding:3px 9px}#gallery .gv-nav{top:36%}}
/* V12: the quick buttons ("🎨 סגנון", "📋 אקסל", "🧾 פירוט" in SOW mode) are ONE compact glass row centred right under
   the top mode bar (between the minimap and "⋯"); placed by JS clear of the minimap, radio chip, "⋯" and the tools
   column. Each segment is 34 px tall with a ≥ 44 px hit area (::before). The 🖼 renders button is gone (owner: "no need
   for it") — the gallery stays in the ⋯ tools menu and in the SOW panel's before / after. */
#quickFab{position:fixed;z-index:13;left:50%;top:calc(76px + env(safe-area-inset-top,0px));display:flex;flex-direction:row;align-items:center;gap:2px;padding:3px;border-radius:999px;background:rgba(12,16,24,.74);border:1px solid rgba(255,255,255,.13);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:0 6px 18px rgba(0,0,0,.28);transition:opacity .25s ease}
#quickFab.qf-off{opacity:0;visibility:hidden;pointer-events:none}
#quickFab>button{position:relative;flex:0 0 auto;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:5px;height:34px;min-height:0;padding:0 12px;margin:0;border-radius:999px;border:1px solid transparent;background:transparent;color:#eef3f8;font:700 12.5px/1 inherit;font-family:inherit;white-space:nowrap;touch-action:manipulation;cursor:pointer;transition:background .15s,border-color .15s}
#quickFab>button::before{content:"";position:absolute;left:-1px;right:-1px;top:-6px;bottom:-6px}
#quickFab>button:hover{background:rgba(255,255,255,.08)}
#quickFab>button .qf-ico{font-size:15px;line-height:1}
#quickFab>button .qf-lbl{max-width:84px;overflow:hidden;text-overflow:ellipsis;letter-spacing:.1px}
#quickFab>button .qf-chk{display:none;font-size:12px;font-weight:900}
#quickFab.qf-compact>button{padding:0 10px}
#quickFab.qf-compact>button .qf-lbl{display:none}
#btnStyleFab{color:#ffe2ad!important}
#btnStyleFab .qf-ico{filter:saturate(1.1)}
body:not(.has-styles) #btnStyleFab{display:none!important}
/* toasts drop below the row while it is shown */
body.qf-on #toast{top:calc(var(--qf-bot,104px) + 8px)}
`;

/* ============================================================================================ WebGL viewer */
const VS1 = 'attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}';
const FS_BODY = `
  vec3 d=normalize(vec3(v.x*uTan.x,v.y*uTan.y,-1.));
  float cp=cos(uPitch),sp=sin(uPitch);d=vec3(d.x,cp*d.y-sp*d.z,sp*d.y+cp*d.z);
  float cy=cos(uYaw),sy=sin(uYaw);d=vec3(cy*d.x+sy*d.z,d.y,-sy*d.x+cy*d.z);
  float lon=atan(d.x,-d.z),lat=asin(clamp(d.y,-1.,1.));
  vec2 uv=vec2(lon*0.15915494+0.5,0.5-lat*0.31830989);`;
const FS2 = `#version 300 es
precision highp float;uniform sampler2D t;uniform vec2 uTan;uniform float uYaw,uPitch,uLod;in vec2 v;out vec4 o;
void main(){${FS_BODY}o=vec4(textureLod(t,uv,uLod).rgb,1.);}`;
const VS2 = '#version 300 es\nin vec2 p;out vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}';
const FS1L = `#extension GL_EXT_shader_texture_lod : enable
precision highp float;uniform sampler2D t;uniform vec2 uTan;uniform float uYaw,uPitch,uLod;varying vec2 v;
void main(){${FS_BODY}gl_FragColor=vec4(texture2DLodEXT(t,uv,uLod).rgb,1.);}`;
const FS1 = `precision highp float;uniform sampler2D t;uniform vec2 uTan;uniform float uYaw,uPitch,uLod;varying vec2 v;
void main(){${FS_BODY}gl_FragColor=vec4(texture2D(t,uv).rgb,1.);}`;

function createViewer(canvas) {
  let gl = null, ver = 0, lodOK = false;
  try { gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'default', preserveDrawingBuffer: false }); if (gl) ver = 2; } catch (_) { gl = null; }
  if (!gl) { try { gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false }) || canvas.getContext('experimental-webgl'); if (gl) ver = 1; } catch (_) { gl = null; } }
  if (!gl) return null;
  let vs = VS1, fs = FS1;
  if (ver === 2) { vs = VS2; fs = FS2; lodOK = true; } else if (gl.getExtension('EXT_shader_texture_lod')) { fs = FS1L; lodOK = true; }
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('gallery shader: ' + gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  try { gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog); } catch (e) { console.warn('[gallery]', e); return null; }
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('[gallery] link', gl.getProgramInfoLog(prog)); return null; }
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = { tan: gl.getUniformLocation(prog, 'uTan'), yaw: gl.getUniformLocation(prog, 'uYaw'), pitch: gl.getUniformLocation(prog, 'uPitch'), lod: gl.getUniformLocation(prog, 'uLod'), t: gl.getUniformLocation(prog, 't') };
  gl.uniform1i(U.t, 0);
  const maxT = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
  let tex = null, texW = 0, lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; }, false);
  function setImage(img) {
    if (lost) return false;
    let src = img, w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (w > maxT) { // downscale for old GPUs (max texture < 4096)
      const c = document.createElement('canvas'); c.width = maxT; c.height = Math.round(h * maxT / w);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); src = c; w = c.width; h = c.height;
    }
    const pot = (w & (w - 1)) === 0 && (h & (h - 1)) === 0;
    const t2 = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t2);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    const mip = lodOK && (pot || ver === 2);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, pot || ver === 2 ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (tex) gl.deleteTexture(tex);
    tex = t2; texW = w; texMip = mip;
    return true;
  }
  let texMip = false;
  function draw(yaw, pitch, fov) {
    if (lost || !tex) return;
    const W = canvas.width, H = canvas.height;
    gl.viewport(0, 0, W, H);
    const ty = Math.tan((fov * Math.PI) / 360), tx = ty * (W / Math.max(1, H));
    gl.uniform2f(U.tan, tx, ty); gl.uniform1f(U.yaw, yaw); gl.uniform1f(U.pitch, pitch);
    // one LOD for the whole frame (texels per screen pixel at the centre) → no mip seam at the ±180° wrap
    const ratio = (texW * 2 * ty) / (2 * Math.PI * Math.max(1, H));
    gl.uniform1f(U.lod, texMip ? Math.max(0, Math.log2(Math.max(1e-3, ratio)) - 0.25) : 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function dispose() { try { if (tex) gl.deleteTexture(tex); tex = null; } catch (_) {} }
  return { setImage, draw, dispose, get ready() { return !!tex; }, get lost() { return lost; }, ver, maxT };
}

/* ============================================================================================ gallery */
let G = null; // singleton

export function installGallery(opts = {}) {
  if (G || typeof document === 'undefined') return G;
  // V7: the gallery always builds its UI from the Hebrew strings; i18n.js (DOM translator) shows them in the current
  // language and follows a language switch while the gallery is open (en / es come from this table)
  const S = GALLERY_STRINGS.he;
  try { const I = window.__i18n; if (I && I.registerTable) I.registerTable(GALLERY_STRINGS.he, GALLERY_STRINGS.en, GALLERY_STRINGS.es); } catch (_) { /* no i18n */ }
  if (!document.getElementById('galleryCss')) { const st = document.createElement('style'); st.id = 'galleryCss'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div');
  root.id = 'gallery'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', S.title);
  root.innerHTML = `
    <canvas class="gv-cv" aria-label="360°"></canvas>
    <div class="gv-flat"><img alt=""></div>
    <div class="gv-prog"></div>
    <div class="gv-top"><div class="gv-t"><b></b><small></small></div><span class="gv-sp"></span></div>
    <button class="gv-x" type="button"></button>
    <button class="gv-nav gv-prev" type="button"></button>
    <button class="gv-nav gv-next" type="button"></button>
    <div class="gv-msg" role="status" aria-live="polite"></div>
    <div class="gv-toast" role="status" aria-live="polite"></div>
    <div class="gv-bot">
      <div class="gv-row gv-styles" role="listbox"></div>
      <div class="gv-row gv-rooms" role="listbox"></div>
      <div class="gv-meta"><span class="gv-desc"></span><span class="gv-hint"></span><button class="gv-ba" type="button"></button><button class="gv-apply" type="button"></button></div>
    </div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const cv = $('.gv-cv'), flat = $('.gv-flat'), flatImg = flat.querySelector('img'), msg = $('.gv-msg'), prog = $('.gv-prog'), toastEl = $('.gv-toast');
  const stylesRow = $('.gv-styles'), roomsRow = $('.gv-rooms'), applyBtn = $('.gv-apply'), xBtn = $('.gv-x'), prevBtn = $('.gv-prev'), nextBtn = $('.gv-next');
  prevBtn.setAttribute('aria-label', S.prevRoom); prevBtn.title = S.prevRoom; nextBtn.setAttribute('aria-label', S.nextRoom); nextBtn.title = S.nextRoom;
  xBtn.textContent = '✕'; xBtn.setAttribute('aria-label', S.close); xBtn.title = S.close;
  stylesRow.setAttribute('aria-label', S.style); roomsRow.setAttribute('aria-label', S.room);
  { const h = $('.gv-hint'), a = document.createElement('span'), b = document.createElement('span'); a.textContent = S.hint; b.textContent = S.swipe; h.append(a, ' · ', b); } // separate nodes: each one translates
  applyBtn.textContent = S.apply;
  // V11: "⇆ לפני / אחרי" (only on the scope-of-work style): the video frame of the room vs the SOW render (js/sow-ui.js)
  const baBtn = $('.gv-ba'); baBtn.textContent = S.ba; baBtn.title = S.baTitle;
  baBtn.addEventListener('click', (e) => { e.stopPropagation(); const room = st.room; close(); try { window.__sowUI && window.__sowUI.openBA(room); } catch (err) { console.warn('[gallery] before/after', err); } });

  const st = { open: false, manifest: null, mPromise: null, style: null, room: null, yaw: 0, pitch: 0, fov: FOV_DEF, fovT: FOV_DEF, vyaw: 0, vpitch: 0, drag: false, dirty: true, raf: 0, seq: 0, loaded: '', quality: '', viewer: null, triedGL: false, lastT: 0, errors: 0 };
  const stats = { opens: 0, loads: 0, smMs: 0, fullMs: 0, lastUrl: '', errors: 0 };

  /* ---------- manifest */
  function loadManifest() {
    if (st.manifest) return Promise.resolve(st.manifest);
    if (st.mPromise) return st.mPromise;
    st.mPromise = fetch(opts.manifest || MANIFEST, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((m) => { st.manifest = m; return m; })
      .catch((e) => { st.mPromise = null; throw e; });
    return st.mPromise;
  }
  const item = (s, r) => st.manifest && st.manifest.items && st.manifest.items[s + '/' + r];
  const nameOf = (o) => (o && (o[lang()] || o.he || o.en || o.id)) || '';
  const roomList = (style) => ((st.manifest && st.manifest.rooms) || []).map((r) => r.id).filter((id) => item(style, id));
  let applyBusy = false;
  // V9: previous / next room of the current style (arrows, fast sideways swipe), wraps around
  function stepRoom(d) {
    const rl = roomList(st.style); if (rl.length < 2) return;
    const i = rl.indexOf(st.room);
    select(st.style, rl[((i < 0 ? 0 : i) + d + rl.length) % rl.length]);
  }
  const roomName = (id) => S.rooms[id] || (st.manifest && (st.manifest.rooms || []).find((r) => r.id === id) || {})[lang()] || id;

  /* ---------- UI */
  function setMsg(t) { msg.textContent = t || ''; msg.classList.toggle('on', !!t); }
  let toastT = 0;
  function toast(t) { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 2600); }
  function setProg(p) { prog.style.width = (p * 100).toFixed(0) + '%'; prog.style.opacity = p >= 1 || p <= 0 ? '0' : '1'; }
  function curTourStyle() { const t = tour(); try { if (t && t.styles) return t.styles.current; } catch (_) {} return null; } // V7: nothing restored from storage
  function renderChips() {
    const m = st.manifest; if (!m) return;
    stylesRow.innerHTML = ''; roomsRow.innerHTML = '';
    const tourCur = curTourStyle();
    for (const s of m.styles || []) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'gv-chip' + (s.id === st.style ? ' on' : ''); b.dataset.style = s.id; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', s.id === st.style ? 'true' : 'false');
      const sw = document.createElement('span'); sw.className = 'gv-sw';
      for (const c of (s.swatch || []).slice(0, 4)) { const i = document.createElement('i'); i.style.background = String(c); sw.appendChild(i); }
      const t = document.createElement('span'); t.textContent = nameOf(s) + (s.id === tourCur ? ' •' : '');
      if (s.id === tourCur) b.title = S.current;
      b.append(sw, t);
      b.addEventListener('click', (e) => { e.stopPropagation(); select(s.id, st.room); });
      stylesRow.appendChild(b);
    }
    for (const r of m.rooms || []) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'gv-chip' + (r.id === st.room ? ' on' : ''); b.dataset.room = r.id; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', r.id === st.room ? 'true' : 'false');
      b.textContent = roomName(r.id);
      b.disabled = !item(st.style, r.id);
      b.addEventListener('click', (e) => { e.stopPropagation(); select(st.style, r.id); });
      roomsRow.appendChild(b);
    }
    const sd = (m.styles || []).find((x) => x.id === st.style);
    $('.gv-top b').textContent = S.title + (sd ? ' · ' + nameOf(sd) : '');
    $('.gv-top small').textContent = (st.room ? roomName(st.room) + ' · ' : '') + S.subtitle;
    const rl = roomList(st.style), ri = rl.indexOf(st.room);
    const rtl = (document.documentElement.dir || 'rtl') === 'rtl';
    prevBtn.textContent = rtl ? '›' : '‹'; nextBtn.textContent = rtl ? '‹' : '›';
    prevBtn.style.display = nextBtn.style.display = rl.length > 1 ? '' : 'none';
    root.dataset.pos = ri >= 0 ? (ri + 1) + '/' + rl.length : '';
    $('.gv-desc').textContent = sd ? (sd['desc_' + lang()] || sd.desc || '') : '';
    const t = tour(), ready = !!(t && t.styles && t.styles.ready);
    const isCur = ready && st.style === tourCur;
    applyBtn.disabled = !ready || isCur || applyBusy;
    applyBtn.classList.toggle('is-cur', isCur);
    if (!applyBusy) applyBtn.textContent = isCur ? S.currentBtn : S.apply;
    applyBtn.title = ready ? '' : S.applyWait;
    baBtn.style.display = st.style === 'sow' && window.__sowUI && window.__sowUI.hasBefore(st.room) ? '' : 'none';
    for (const el of [stylesRow.querySelector('.on'), roomsRow.querySelector('.on')]) if (el && el.scrollIntoView) try { el.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (_) {}
  }

  try { window.addEventListener('tour:lang', () => { try { renderChips(); } catch (_) { /* not open yet */ } }); } catch (_) { /* no DOM */ }

  /* ---------- images */
  function loadImg(url) {
    return new Promise((res, rej) => {
      const im = new Image(); im.decoding = 'async';
      im.onload = () => { (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(im)); };
      im.onerror = () => rej(new Error('image ' + url));
      im.src = url;
    });
  }
  function ensureViewer() {
    if (!st.triedGL) { st.triedGL = true; try { st.viewer = createViewer(cv); } catch (e) { console.warn('[gallery] webgl', e); st.viewer = null; } }
    root.classList.toggle('flat', !st.viewer);
    return st.viewer;
  }
  function show(im, q) {
    const v = ensureViewer();
    if (v && !v.lost) { if (v.setImage(im)) { st.quality = q; st.dirty = true; return; } }
    root.classList.add('flat'); flatImg.src = im.src; st.quality = q;
    if (!st.flatNoted) { st.flatNoted = true; toast(S.noWebgl); }
  }
  async function select(style, room) {
    const m = st.manifest; if (!m) return;
    if (!item(style, room)) { // keep the room if this style has it, else the first room it has
      const r2 = (m.rooms || []).map((r) => r.id).find((id) => item(style, id));
      if (!r2) { setMsg(S.missing); return; }
      room = r2;
    }
    const changedRoom = room !== st.room;
    st.style = style; st.room = room;
    renderChips();
    const it = item(style, room), seq = ++st.seq, key = style + '/' + room;
    if (st.loaded === key && st.quality === 'full') { setMsg(''); setProg(0); return; }
    if (changedRoom) { FOV_DEF = fovDef(); st.yaw = 0; st.pitch = PITCH_DEF; st.vyaw = st.vpitch = 0; st.fovT = st.fov = FOV_DEF; }
    setMsg(S.loading); setProg(0.15);
    const t0 = performance.now();
    try {
      if (it.sm) { const sm = await loadImg(it.sm); if (seq !== st.seq) return; show(sm, 'sm'); st.loaded = key; stats.smMs = Math.round(performance.now() - t0); setMsg(''); setProg(0.45); }
      const t1 = performance.now();
      if (it.full) {
        if (it.sm) toast(S.loadingHd);
        const full = await loadImg(it.full); if (seq !== st.seq) return;
        show(full, 'full'); st.loaded = key; stats.fullMs = Math.round(performance.now() - t1);
      }
      stats.loads++; stats.lastUrl = it.full || it.sm; setMsg(''); setProg(1);
      toastEl.classList.remove('on');
    } catch (e) {
      if (seq !== st.seq) return;
      stats.errors++; console.warn('[gallery]', e); setProg(0);
      if (st.quality && st.loaded === key) toast(S.error); else setMsg(S.error);
    }
  }

  /* ---------- look controls */
  const ptrs = new Map(); let pinch0 = 0, pinchF = FOV_DEF, lastMove = 0;
  let swipe = null; // V9: a fast one-finger sideways flick (touch / pen) = next / previous room; slow drags still look
  function onDown(e) {
    if (!st.open) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    swipe = ptrs.size === 1 && e.pointerType !== 'mouse' ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), yaw: st.yaw, pitch: st.pitch } : null;
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); pinchF = st.fovT; }
    st.drag = true; st.vyaw = st.vpitch = 0;
  }
  function onMove(e) {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) st.fovT = clamp(pinchF * (pinch0 / Math.max(1, d)), FOV_MIN, FOV_MAX);
      st.dirty = true; return;
    }
    const k = ((st.fov * Math.PI) / 180) / Math.max(1, cv.clientHeight);
    st.yaw += dx * k; st.pitch = clamp(st.pitch + dy * k, -1.45, 1.45);
    const now = performance.now(), dt = Math.max(1, now - (lastMove || now - 16)) / 1000; lastMove = now;
    st.vyaw = st.vyaw * 0.5 + ((dx * k) / dt) * 0.5; st.vpitch = st.vpitch * 0.5 + ((dy * k) / dt) * 0.5;
    st.dirty = true;
  }
  function onUp(e) {
    const sw = swipe && swipe.id === e.pointerId ? swipe : null; if (sw) swipe = null;
    if (sw && e.type === 'pointerup' && ptrs.size === 1) {
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y, dt = performance.now() - sw.t, W = cv.clientWidth || window.innerWidth || 1;
      stats.lastFlick = { dx: Math.round(dx), dy: Math.round(dy), dt: Math.round(dt) };
      if (dt < 320 && Math.abs(dx) >= Math.max(80, W * 0.22) && Math.abs(dy) < Math.abs(dx) * 0.6) {
        ptrs.delete(e.pointerId); st.drag = false;
        st.yaw = sw.yaw; st.pitch = sw.pitch; st.vyaw = st.vpitch = 0; st.dirty = true; // undo the look rotation of the flick
        const rtl = (document.documentElement.dir || 'rtl') === 'rtl';
        stepRoom((rtl ? dx > 0 : dx < 0) ? 1 : -1); stats.swipes = (stats.swipes || 0) + 1;
        return;
      }
    }
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch0 = 0;
    if (!ptrs.size) { st.drag = false; if (performance.now() - lastMove > 90) st.vyaw = st.vpitch = 0; }
  }
  function onWheel(e) {
    if (!st.open) return; e.preventDefault();
    st.fovT = clamp(st.fovT * Math.exp(clamp(e.deltaY, -120, 120) * (e.ctrlKey ? 0.01 : 0.0012)), FOV_MIN, FOV_MAX); st.dirty = true;
  }
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp); cv.addEventListener('lostpointercapture', onUp);
  cv.addEventListener('wheel', onWheel, { passive: false });
  cv.addEventListener('dblclick', () => { FOV_DEF = fovDef(); st.fovT = st.fovT > FOV_DEF - 5 ? 50 : FOV_DEF; st.dirty = true; });
  root.addEventListener('pointerdown', (e) => e.stopPropagation()); // the tour underneath must not react
  root.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  root.addEventListener('keydown', (e) => e.stopPropagation());

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; st.dirty = true; }
  }
  function loop(t) {
    if (!st.open) { st.raf = 0; return; }
    st.raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0, (t - (st.lastT || t)) / 1000)); st.lastT = t;
    resize();
    if (!st.drag && (Math.abs(st.vyaw) > 1e-4 || Math.abs(st.vpitch) > 1e-4)) {
      st.yaw += st.vyaw * dt; st.pitch = clamp(st.pitch + st.vpitch * dt, -1.45, 1.45);
      const d = Math.exp(-4.5 * dt); st.vyaw *= d; st.vpitch *= d; st.dirty = true;
    }
    if (Math.abs(st.fovT - st.fov) > 0.01) { st.fov += (st.fovT - st.fov) * (1 - Math.exp(-12 * dt)); st.dirty = true; } else st.fov = st.fovT;
    if (st.dirty && st.viewer) { st.dirty = false; st.viewer.draw(st.yaw, st.pitch, st.fov); }
  }

  /* ---------- open / close */
  // V9: the room the visitor is in now → the rendered room to open (walk: the room under the player; 360: the node):
  // same room → its render; bed2 → bed1, bed4 → bed3 (same kind of room); outside → street; otherwise the nearest
  // rendered 360 node on the same floor (hall → bath1 / living, landing → bed3 / bath2); basement / unknown → living.
  // Dollhouse / plan have no "current room": the room last viewed in this session, else living.
  const ANALOG = { bed2: 'bed1', bed4: 'bed3', frontyard: 'street', porch: 'street', backyard: 'street' };
  function hereRoom(style) {
    const t = tour(), has = (id) => !!(id && item(style, id));
    let info = null; try { info = t && t.roomInfo ? t.roomInfo() : null; } catch (_) { info = null; }
    if (!info || (info.mode !== 'walk' && info.mode !== 'pano')) return null;
    if (has(info.key)) return info.key;
    if (has(ANALOG[info.key])) return ANALOG[info.key];
    if (info.floor === 'outside') return has('street') ? 'street' : (has('living') ? 'living' : null);
    let best = null, bd = Infinity;
    for (const n of (t.panoNodes || [])) {
      if (!n || !n.p || n.floor !== info.floor || !has(n.id)) continue;
      const d = Math.hypot(n.p.x - info.x, n.p.z - info.z); if (d < bd) { bd = d; best = n.id; }
    }
    return best || (has('living') ? 'living' : null);
  }
  let saved = null; // V9: what the tour was doing when the viewer opened (tests compare it after closing)
  async function open(o = {}) {
    stats.opens++;
    const t0 = tour();
    try { saved = t0 && t0.mode ? { mode: t0.mode, x: t0.player && t0.player.state.x, z: t0.player && t0.player.state.z, yaw: t0.player && t0.player.state.yaw, node: t0.pano && t0.pano.node && t0.pano.node.id, pyaw: t0.pano && t0.pano.yaw } : null; } catch (_) { saved = null; }
    try { if (t0 && t0.dpad && t0.dpad.release) t0.dpad.release(); } catch (_) {} // a held arrow must not keep walking underneath
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (_) {}
    st.open = true; root.classList.add('show'); document.body.classList.add('gallery-open');
    try { xBtn.focus({ preventScroll: true }); } catch (_) {}
    if (!st.raf) { st.lastT = 0; st.raf = requestAnimationFrame(loop); }
    setMsg(S.loading);
    let m;
    try { m = await loadManifest(); } catch (e) { console.warn('[gallery] manifest', e); setMsg(S.none); return api; }
    if (!st.open) return api;
    setMsg('');
    // V9: the style applied in the tour first (then the last one browsed), the room the visitor is in
    const want = o.style || curTourStyle() || st.style || (m.styles && m.styles[0] && m.styles[0].id);
    const style = (m.styles || []).some((s) => s.id === want) ? want : (m.styles[0] && m.styles[0].id);
    const here = o.room ? null : hereRoom(style);
    let room = o.room || here || st.room;
    if (!room) room = m.defaultRoom || 'living';
    st.openedAt = room;
    // V9: the visitor's room has no render of its own → the nearest one is shown, with a one-line note
    let near = false;
    if (here) { try { const inf = tour().roomInfo(); near = inf.key !== here && !(inf.floor === 'outside' && here === 'street'); } catch (_) { near = false; } }
    st.openedNear = near;
    await select(style, room);
    if (near && st.open) toast(S.nearNote);
    return api;
  }
  function close() {
    if (!st.open) return;
    st.open = false; root.classList.remove('show'); document.body.classList.remove('gallery-open');
    if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0;
    ptrs.clear(); st.drag = false; swipe = null;
    try { if (root.contains(document.activeElement)) document.activeElement.blur(); } catch (_) {}
  }
  xBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
  prevBtn.addEventListener('click', (e) => { e.stopPropagation(); stepRoom(-1); });
  nextBtn.addEventListener('click', (e) => { e.stopPropagation(); stepRoom(1); });
  window.addEventListener('keydown', (e) => {
    if (!st.open) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.stopPropagation(); const rtl = (document.documentElement.dir || 'rtl') === 'rtl'; stepRoom((e.key === 'ArrowLeft') === rtl ? 1 : -1); }
  }, true);
  // V9: "✓ החל סגנון זה בסיור" → the style is applied to the live tour and the viewer closes: the tour is exactly where
  // it was (mode, position, heading — it was only paused underneath)
  applyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = tour(); if (!t || !t.styles || !t.styles.ready) { toast(S.applyWait); return; }
    if (applyBusy) return;
    const id = st.style, sd = st.manifest && (st.manifest.styles || []).find((x) => x.id === id);
    applyBusy = true; applyBtn.disabled = true; applyBtn.textContent = S.applying;
    Promise.resolve().then(() => (id === 'sow' && t.sow ? t.sow.enable() : t.styles.set(id))).then(() => { // V11: the SOW style = the whole SOW mode
      applyBusy = false; stats.applied = (stats.applied || 0) + 1;
      close();
      try { t.styleUI && t.styleUI.render && t.styleUI.render(); } catch (_) {}
      try { if (t.toast) t.toast(S.applied + (sd ? ' · ' + (sd.he || nameOf(sd)) : ''), 2600); } catch (_) {}
    }, (err) => { applyBusy = false; console.warn('[gallery] apply', err); toast(S.applyFail); })
      .finally(() => { applyBusy = false; applyBtn.textContent = S.apply; renderChips(); });
  });

  /* ---------- entry buttons */
  const mk = (id, cls, html, title) => { const b = document.createElement('button'); b.id = id; b.type = 'button'; b.className = cls; b.innerHTML = html; b.title = title; b.setAttribute('aria-haspopup', 'dialog'); b.addEventListener('click', (e) => { e.stopPropagation(); open(); }); return b; };
  // V12: the gallery has ONE entry in the tour UI — the ⋯ tools menu (phones) / tools column (desktop) — plus the SOW
  // panel's before / after and the API (window.__gallery.open). The 360-bar, loader-card and floating 🖼 buttons are gone.
  const tools = document.getElementById('toolsInner');
  if (tools && !document.getElementById('btnGalleryTools')) {
    const b = mk('btnGalleryTools', 'tbtn glass', '<span class="ico">🖼</span><span class="lbl"></span>', S.btnTitle);
    b.querySelector('.lbl').textContent = S.btn;
    const after = document.getElementById('btnStyle');
    if (after && after.parentNode === tools) tools.insertBefore(b, after.nextSibling); else tools.appendChild(b);
  }
  /* ---------- V12: the quick-button row under the mode bar: "🎨 סגנון" (+ sow-ui.js adds "🧾 פירוט" / "📋 אקסל") */
  function installFab() {
    if (document.getElementById('quickFab')) return null;
    const box = document.createElement('div'); box.id = 'quickFab'; box.className = 'qf-off'; box.setAttribute('role', 'toolbar');
    box.innerHTML = '<button id="btnStyleFab" type="button" aria-haspopup="dialog"><span class="qf-ico" aria-hidden="true">🎨</span><span class="qf-lbl"></span></button>';
    document.body.appendChild(box);
    const bS = box.querySelector('#btnStyleFab');
    bS.querySelector('.qf-lbl').textContent = S.styleFab; bS.title = S.styleFabTitle;
    const fs = { layout: '' };
    // 🎨 → the style picker sheet (the V3 panel). Its outside-tap handler closes it on pointerdown, so remember whether it
    // was open before that (window capture runs first) to make the button a toggle.
    let wasOpen = false;
    window.addEventListener('pointerdown', (e) => { if (e.target instanceof Node && bS.contains(e.target)) { try { const u = tour() && tour().styleUI; wasOpen = !!(u && u.panel && u.panel.open); } catch (_) { wasOpen = false; } } }, true);
    bS.addEventListener('click', (e) => {
      e.stopPropagation();
      const u = tour() && tour().styleUI; if (!u || !u.check || !u.check()) return;
      if (wasOpen) { u.panel.hide(); wasOpen = false; return; }
      u.render(); u.panel.show();
    });
    // placement: centred under the top mode bar, inside the free gap between the left-side obstacles (minimap, radio
    // chip) and the right-side ones ("⋯", tools column); labels drop to icons only if the gap is too narrow, and as a
    // last resort the row moves down below the obstacles
    const LEFT_RIGHT = ['mapCard', 'radioChip', 'btnMore', 'tools', 'btnHome'];
    const shown = (el) => { if (!el) return null; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return null; const r = el.getBoundingClientRect(); return r.width && r.height ? r : null; };
    const MODES = ['walk', 'pano', 'dollhouse', 'plan'];
    function tourMode() { const t = tour(); try { return t ? t.mode : ''; } catch (_) { return ''; } }
    function place() {
      const body = document.body, intro = document.getElementById('intro');
      const m = tourMode();
      const hide = !MODES.includes(m) && !body.classList.contains('mode-transition') || body.classList.contains('loading') || body.classList.contains('tools-open')
        || body.classList.contains('gallery-open') || (intro && intro.classList.contains('show'));
      if (hide) { box.classList.add('qf-off'); body.classList.remove('qf-on'); fs.layout = 'off'; return; }
      const vw = window.innerWidth;
      const tb = shown(document.getElementById('topbar'));
      let top = tb ? tb.bottom + 8 : 16;
      box.classList.remove('qf-off');
      for (let pass = 0; pass < 4; pass++) {
        for (const compact of [false, true]) {
          box.classList.toggle('qf-compact', compact);
          box.style.top = Math.round(top) + 'px';
          const w = box.getBoundingClientRect().width, h = box.getBoundingClientRect().height;
          let L = 8, R = vw - 8, below = top;
          for (const id of LEFT_RIGHT) {
            const r = shown(document.getElementById(id)); if (!r) continue;
            if (r.bottom <= top - 7 || r.top >= top + h + 7) continue; // hit area reaches 6 px above / below
            below = Math.max(below, r.bottom + 8);
            if (r.left + r.width / 2 < vw / 2) L = Math.max(L, r.right + 8); else R = Math.min(R, r.left - 8);
          }
          if (R - L >= w) {
            const x = Math.max(L, Math.min(R - w, vw / 2 - w / 2));
            box.style.left = Math.round(x) + 'px';
            body.classList.add('qf-on'); body.style.setProperty('--qf-bot', Math.round(top + h) + 'px');
            fs.layout = 'top' + (compact ? '-compact' : '') + ' y' + Math.round(top) + (pass ? ' (moved down)' : '');
            return;
          }
          if (compact) top = below;
        }
      }
      box.classList.add('qf-off'); body.classList.remove('qf-on'); fs.layout = 'off(no room)';
    }
    let raf = 0; const sched = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; try { place(); } catch (e) { console.warn('[gallery] fab', e); } }); };
    window.addEventListener('resize', sched); window.addEventListener('orientationchange', sched);
    try {
      new MutationObserver(sched).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      const it = document.getElementById('intro'); if (it) new MutationObserver(sched).observe(it, { attributes: true, attributeFilter: ['class'] });
      if (window.ResizeObserver) { const ro = new ResizeObserver(sched); for (const id of LEFT_RIGHT.concat(['topbar', 'quickFab'])) { const e = id === 'quickFab' ? box : document.getElementById(id); if (e) ro.observe(e); } }
    } catch (_) {}
    setInterval(sched, 1000); // cheap safety net (mode getters, late-built panels, language changes)
    sched();
    const noop = () => false;
    return { place, stopTip: noop, showTip: noop, roomTip: noop, get layout() { return fs.layout; }, get tipShown() { return 0; }, get roomTips() { return 0; }, get lastRoomTip() { return ''; }, get seenRooms() { return []; }, el: box };
  }
  const fab = installFab();
  // warm the manifest in idle time so the first open is instant
  try { (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => loadManifest().catch(() => {})); } catch (_) {}

  const api = {
    open, close, select: (s, r) => select(s || st.style, r || st.room), loadManifest,
    get isOpen() { return st.open; }, get style() { return st.style; }, get room() { return st.room; }, get quality() { return st.quality; },
    get manifest() { return st.manifest; }, get webgl() { return st.viewer ? st.viewer.ver : 0; }, stats,
    get view() { return { yaw: st.yaw, pitch: st.pitch, fov: st.fov }; },
    setView(yaw, pitch, fov) { if (isFinite(yaw)) st.yaw = yaw; if (isFinite(pitch)) st.pitch = clamp(pitch, -1.45, 1.45); if (isFinite(fov)) st.fov = st.fovT = clamp(fov, FOV_MIN, FOV_MAX); st.dirty = true; },
    root, STRINGS: GALLERY_STRINGS,
    get openedAt() { return st.openedAt; }, get openedNear() { return !!st.openedNear; }, get saved() { return saved; }, hereRoom: (s) => hereRoom(s || curTourStyle() || st.style), stepRoom, fab,
  };
  G = api;
  try { window.__gallery = api; } catch (_) {}
  return api;
}

export function openGallery(o) { return (G || installGallery()).open(o); }
export function closeGallery() { if (G) G.close(); }
export default installGallery;

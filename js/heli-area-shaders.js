// heli-area-shaders.js — V13 HELI: GLSL for the heli world (terrain imagery blend + water, building facades with
// imagery roofs, tree canopies, aerial-perspective haze). Patched into three r160 built-in materials through
// onBeforeCompile, so lights / fog / tone mapping / shadows keep working. Plain strings, no side effects on import.

// ------------------------------------------------------------------------------------------------ shared
// world position of the vertex (instancing aware) → vHW
export const VS_DECL = 'varying vec3 vHW;\n';
export const VS_WORLD = `
  vec4 hWP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    hWP = instanceMatrix * hWP;
  #endif
  vHW = (modelMatrix * hWP).xyz;
`;

// imagery: static z12 + three clip levels (toroidal windows) + NAIP; per-level grade (gain / offset, linear light)
export const IMAGERY_DECL = `
varying vec3 vHW;
uniform sampler2D tS0; uniform sampler2D mS0; uniform vec4 gS0; uniform vec4 wS0;
uniform sampler2D tC0; uniform sampler2D mC0; uniform vec4 gC0; uniform vec4 wC0;
uniform sampler2D tC1; uniform sampler2D mC1; uniform vec4 gC1; uniform vec4 wC1;
uniform sampler2D tC2; uniform sampler2D mC2; uniform vec4 gC2; uniform vec4 wC2;
uniform sampler2D tC3; uniform sampler2D mC3; uniform vec4 gC3; uniform vec4 wC3;
uniform sampler2D tN; uniform sampler2D tNm; uniform vec4 bN; uniform float onN;
uniform vec3 aG0; uniform vec3 aO0; uniform vec3 aG1; uniform vec3 aO1; uniform vec3 aG2; uniform vec3 aO2;
uniform vec3 aG3; uniform vec3 aO3; uniform vec3 aG4; uniform vec3 aO4; uniform vec3 aG5; uniform vec3 aO5;
uniform vec4 uLook; // x saturation, y contrast, z sharpen amount, w sharpen distance
uniform vec3 uHor; uniform vec3 uZen; uniform vec4 uHaze; uniform vec3 uSun; uniform float uTime;
vec2 hUV(vec4 b, vec2 xz) { return vec2((xz.x - b.x) / (b.z - b.x), (xz.y - b.y) / (b.w - b.y)); }
float hEdge(vec2 uv, float e) { vec2 m = min(uv, 1.0 - uv); return smoothstep(0.0, e, min(m.x, m.y)); }
vec4 hClip(sampler2D t, sampler2D m, vec4 G, vec4 W, vec2 xz, float sharp) {
  vec2 tc = (xz - G.xy) / G.zw;
  vec2 uv = tc / W.z;
  vec2 e = min(tc - W.xy, W.xy + W.z - tc);
  float w = smoothstep(0.2, 0.7, min(e.x, e.y)) * W.w;
  float mk = smoothstep(0.55, 0.97, texture2D(m, uv).r);
  vec3 c = texture2D(t, uv).rgb;
  vec3 bl = texture2D(t, uv, 1.6).rgb;
  c = max(c + (c - bl) * sharp, vec3(0.0));
  return vec4(c, w * mk);
}
vec3 hImagery(vec2 xz, float dist) {
  vec3 c = vec3(0.16, 0.19, 0.13);
  vec4 s0 = hClip(tS0, mS0, gS0, wS0, xz, 0.0); c = mix(c, s0.rgb * aG0 + aO0, s0.a);
  float sh = uLook.z * (1.0 - smoothstep(uLook.w * 0.35, uLook.w, dist));
  vec4 s = hClip(tC0, mC0, gC0, wC0, xz, sh * 0.5); c = mix(c, s.rgb * aG1 + aO1, s.a);
  s = hClip(tC1, mC1, gC1, wC1, xz, sh * 0.6); c = mix(c, s.rgb * aG2 + aO2, s.a);
  s = hClip(tC2, mC2, gC2, wC2, xz, sh); c = mix(c, s.rgb * aG3 + aO3, s.a);
  s = hClip(tC3, mC3, gC3, wC3, xz, sh * 0.6); c = mix(c, s.rgb * aG5 + aO5, s.a);
  vec2 un = hUV(bN, xz);
  vec3 nc = texture2D(tN, un).rgb; vec3 nb = texture2D(tN, un, 1.6).rgb; nc = max(nc + (nc - nb) * sh * 0.7, vec3(0.0));
  float nm = smoothstep(0.45, 0.95, texture2D(tNm, un).r);
  c = mix(c, nc * aG4 + aO4, hEdge(un, 0.05) * onN * nm);
  // "map look": a touch more saturation / contrast than the raw orthophotos
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uLook.x);
  c = max((c - 0.12) * uLook.y + 0.12, vec3(0.0));
  return c;
}
vec3 hSky(vec3 R) {
  return R.y >= 0.0 ? mix(uHor, uZen, sqrt(R.y)) : mix(uHor * 0.7, vec3(0.07, 0.08, 0.075), min(1.0, -R.y * 2.2));
}
`;

// aerial perspective: distance haze toward the sky's horizon colour (tone mapped like the sky), fully opaque at the
// world's edge so the terrain border melts into the horizon. Appended after <fog_fragment>.
export const HAZE_DECL = `
vec3 hHazeOut() {
  vec3 hz = uHor;
  #if defined( TONE_MAPPING )
    hz = toneMapping(hz);
  #endif
  return linearToOutputTexel(vec4(hz, 1.0)).rgb;
}
`;
export const HAZE_FRAG = `
  {
    float hd = distance(cameraPosition, vHW);
    float hr = length(vHW.xz - cameraPosition.xz);
    float hk = (1.0 - exp(-hd * uHaze.x)) * uHaze.y;
    // thinner haze looking down from altitude, thicker near the ground plane
    hk *= mix(1.0, 0.7, clamp((cameraPosition.y - vHW.y) / max(hd, 1.0) * 2.0, 0.0, 1.0));
    hk = max(hk, smoothstep(uHaze.z, uHaze.w, hr));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, hHazeOut(), clamp(hk, 0.0, 1.0));
  }
`;

// ------------------------------------------------------------------------------------------------ terrain
export const TERRAIN_FS_DECL = IMAGERY_DECL + HAZE_DECL + `
uniform float uEmis; uniform sampler2D tDet; uniform sampler2D tW; uniform vec4 bW; uniform float onW;
float hWater = 0.0; vec3 hWaterN = vec3(0.0, 1.0, 0.0);
`;
export const TERRAIN_FS_MAP = `
  float hd = distance(cameraPosition, vHW);
  vec3 hc = hImagery(vHW.xz, hd);
  // close-range ground grain (grass / gravel feel) so low flight and the yard don't look like a smeared photo
  float hk = 1.0 - smoothstep(30.0, 420.0, hd);
  float d1 = texture2D(tDet, vHW.xz / 5.0).r, d2 = texture2D(tDet, vHW.xz / 41.0).g;
  hc *= 1.0 + ((d1 * 0.65 + d2 * 0.35) - 0.5) * 0.5 * hk;
  // water (lakes / the Scioto): darker, with sky reflection + sun glints added as emission below
  vec2 uw = hUV(bW, vHW.xz);
  hWater = onW * smoothstep(0.35, 0.8, texture2D(tW, uw).r) * hEdge(uw, 0.003);
  if (hWater > 0.0) {
    float r1 = texture2D(tDet, vHW.xz / 23.0 + vec2(uTime * 0.011, uTime * 0.007)).g;
    float r2 = texture2D(tDet, vHW.xz / 9.0 - vec2(uTime * 0.017, -uTime * 0.012)).r;
    hWaterN = normalize(vec3((r1 - 0.5) * 0.22 + (r2 - 0.5) * 0.12, 1.0, (r2 - 0.5) * 0.22 - (r1 - 0.5) * 0.1));
    hc = mix(hc, hc * 0.45 + vec3(0.012, 0.022, 0.026), hWater * 0.85);
  }
  diffuseColor.rgb *= hc;
`;
export const TERRAIN_FS_EMIS = `
  totalEmissiveRadiance += diffuseColor.rgb * uEmis;
  if (hWater > 0.0) {
    vec3 V = normalize(cameraPosition - vHW);
    vec3 R = reflect(-V, hWaterN);
    float fr = 0.02 + 0.98 * pow(1.0 - max(dot(hWaterN, V), 0.0), 5.0);
    float gl = pow(max(dot(R, uSun), 0.0), 220.0) * 6.0;
    totalEmissiveRadiance += hWater * (hSky(R) * (0.12 + 0.7 * fr) + vec3(1.0, 0.95, 0.85) * gl);
  }
`;

// ------------------------------------------------------------------------------------------------ buildings
export const BLD_VS_DECL = `
varying vec3 vHW; varying vec3 vWN; varying vec2 vFU; varying vec4 vBI; varying vec3 vBC;
attribute vec4 bInfo; attribute vec3 bCol;
`;
export const BLD_VS = `
  vec4 hWP = vec4(transformed, 1.0);
  vHW = (modelMatrix * hWP).xyz;
  vWN = normalize(mat3(modelMatrix) * objectNormal);
  vFU = uv; vBI = bInfo; vBC = bCol;
`;
export const BLD_FS_DECL = IMAGERY_DECL + HAZE_DECL + `
varying vec3 vWN; varying vec2 vFU; varying vec4 vBI; varying vec3 vBC;
uniform sampler2D tDet;
float bWin = 0.0; vec3 bRefl = vec3(0.0);
float bH21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
// anti-aliased box in cell space: lo / hi corners, w = filter width
float bBox(vec2 f, vec2 lo, vec2 hi, vec2 w) {
  vec2 a = smoothstep(lo - w, lo + w, f) * (1.0 - smoothstep(hi - w, hi + w, f));
  return a.x * a.y;
}
`;
// facade types: 0 house (siding), 1 garage / shed, 2 brick (apartments / civic), 3 low commercial (storefronts),
// 4 industrial (metal ribs, clerestory), 5 glass curtain wall, 6 office ribbon windows, 7 stone tower (piers)
export const BLD_FS_COLOR = `
  vec3 bc = vBC;
  float roof = step(0.55, vWN.y);
  float hd = distance(cameraPosition, vHW);
  if (roof > 0.5) {
    vec3 rc = bc;
    if (vBI.z > 0.5) {
      vec3 img = hImagery(vHW.xz, hd);
      rc = mix(bc, img * 1.12 + 0.01, vBI.z > 1.5 ? 0.55 : 0.85);
    }
    float g1 = texture2D(tDet, vHW.xz / 3.0).r, g2 = texture2D(tDet, vHW.xz / 17.0).g;
    rc *= 0.9 + 0.2 * (g1 * 0.5 + g2 * 0.5) * (1.0 - smoothstep(200.0, 1200.0, hd));
    diffuseColor.rgb = rc;
  } else {
    float t = floor(vBI.x + 0.5);
    float seed = floor(vBI.y * 997.0 + 0.5) / 997.0; // quantised: interpolation noise must not reach the hashes
    float wallH = vBI.w;
    float u = vFU.x, v = vFU.y;
    vec2 bay = vec2(3.4, 2.9); vec2 lo = vec2(0.3, 0.3); vec2 hi = vec2(0.7, 0.8); float gl = 1.0;
    if (t == 1.0) { gl = 0.0; }
    else if (t == 2.0) { bay = vec2(3.1 + seed * 0.8, 3.0); lo = vec2(0.26, 0.27); hi = vec2(0.74, 0.79); }
    else if (t == 3.0) { bay = vec2(4.5, 3.6); lo = vec2(0.3, 0.35); hi = vec2(0.7, 0.72); }
    else if (t == 4.0) { bay = vec2(6.0, 5.0); lo = vec2(0.1, 0.62); hi = vec2(0.9, 0.82); gl = 0.6; }
    else if (t == 5.0) { bay = vec2(1.55, 3.8); lo = vec2(0.035, 0.2); hi = vec2(0.965, 0.985); }
    else if (t == 6.0) { bay = vec2(1.6, 3.8); lo = vec2(0.03, 0.36); hi = vec2(0.97, 0.9); }
    else if (t == 7.0) { bay = vec2(2.3, 3.6); lo = vec2(0.3, 0.24); hi = vec2(0.7, 0.82); }
    vec2 c = vec2(u / bay.x, v / bay.y);
    vec2 id = floor(c), f = fract(c);
    vec2 fw = max(fwidth(c), vec2(1e-4));
    vec2 w = fw * 0.75;
    float win = bBox(f, lo, hi, w) * gl;
    float above = step(0.0, v) * (1.0 - step(wallH - 0.6, v)); // no windows below grade / in the cornice
    // storefronts: wide glazing on the ground floor of commercial blocks
    if (t == 3.0 && id.y < 0.5) win = bBox(f, vec2(0.05, 0.1), vec2(0.95, 0.8), w);
    // houses: one or two storeys, skip some bays (doors / blank walls)
    if (t == 0.0) win *= step(0.28, bH21(id + seed * 17.0)) * (1.0 - step(2.0, id.y));
    // industrial: clerestory band only under the eaves
    if (t == 4.0) win *= step(wallH - 2.6, v) * step(v, wallH - 0.9) + step(v, 3.6) * step(0.8, bH21(id + seed)) * bBox(f, vec2(0.2, 0.05), vec2(0.8, 0.7), w);
    win *= above;
    // fade the pattern to its average far away (no shimmering)
    float far = smoothstep(0.3, 0.75, max(fw.x, fw.y));
    float cov = (hi.x - lo.x) * (hi.y - lo.y) * gl * (t == 0.0 ? 0.5 : t == 4.0 ? 0.15 : 1.0);
    win = mix(win, cov * above, far);
    // wall surface detail
    vec3 wc = bc;
    if (t == 0.0) wc *= 1.0 - 0.07 * smoothstep(0.75, 0.95, fract(v / 0.22)) * (1.0 - far);              // lap siding
    if (t == 2.0) wc *= 0.93 + 0.12 * bH21(floor(vec2(u / 0.22, v / 0.075)) + seed) * (1.0 - far);        // brick
    if (t == 4.0) wc *= 1.0 - 0.1 * smoothstep(0.6, 0.9, fract(u / 0.6)) * (1.0 - far);                 // ribs
    if (t == 5.0) wc = mix(wc * 0.55, wc, step(0.2, f.y));                                                // spandrels
    if (t == 7.0) wc *= 1.0 + 0.08 * (1.0 - smoothstep(0.08, 0.14, abs(f.x - 0.5) - 0.36)) * (1.0 - far); // piers
    // base: soot / contact darkening; top: lighter cornice line
    wc *= 0.68 + 0.32 * smoothstep(-0.5, 3.0, v);
    if (wallH > 30.0) wc *= 0.86 + 0.24 * smoothstep(0.0, wallH, v); // towers: sky-lit crowns, darker street canyons
    wc *= 1.0 + 0.1 * smoothstep(wallH - 0.7, wallH - 0.2, v) * step(v, wallH);
    // glass: dark, per-window variation (blinds / lit rooms), curtain wall tinted by the building colour
    float r = bH21(id * 1.7 + seed * 31.0);
    vec3 glass = mix(vec3(0.03, 0.04, 0.05), vec3(0.16, 0.15, 0.13), step(0.78, r) * 0.7 + r * 0.15);
    if (t == 5.0) glass = bc * 0.32 + vec3(0.01, 0.015, 0.02);
    // white trim around house / brick windows
    if (t == 0.0 || t == 2.0 || t == 7.0) {
      float fr2 = bBox(f, lo - vec2(0.05, 0.06), hi + vec2(0.05, 0.05), w) * above * (1.0 - far) * gl;
      if (t == 0.0) fr2 *= step(0.28, bH21(id + seed * 17.0)) * (1.0 - step(2.0, id.y));
      wc = mix(wc, vec3(0.86, 0.85, 0.82), clamp(fr2 - win, 0.0, 1.0) * (t == 7.0 ? 0.4 : 0.85));
    }
    diffuseColor.rgb = mix(wc, glass, win);
    bWin = win;
    vec3 V = normalize(cameraPosition - vHW);
    vec3 R = reflect(-V, normalize(vWN));
    float fr = 0.04 + 0.96 * pow(1.0 - max(dot(normalize(vWN), V), 0.0), 5.0);
    bRefl = win * hSky(R) * (t >= 5.0 ? 0.32 + 0.6 * fr : 0.12 + 0.5 * fr);
    // tall glass: more sky in the upper floors, a little per-panel variation (no two panes reflect alike)
    if (t >= 5.0) bRefl *= (0.75 + 0.6 * smoothstep(0.0, wallH, v)) * (0.85 + 0.3 * bH21(id.yx + seed));
  }
`;
export const BLD_FS_ROUGH = `
  float roughnessFactor = mix(roughness, 0.18, bWin);
`;
export const BLD_FS_EMIS = `
  totalEmissiveRadiance += bRefl;
`;

// ------------------------------------------------------------------------------------------------ trees
export const TREE_VS_DECL = 'varying vec3 vHW; varying vec3 vTL;\n';
export const TREE_VS = VS_WORLD + '  vTL = position;\n';
export const TREE_FS_DECL = `
varying vec3 vHW; varying vec3 vTL;
uniform vec3 uHor; uniform vec4 uHaze; uniform sampler2D tDet;
` + HAZE_DECL;
export const TREE_FS_COLOR = `
  #include <color_fragment>
  {
    // leaf clumps: two octaves of the detail texture on the world position; darker toward the crown's underside
    float n = texture2D(tDet, vHW.xz / 2.3 + vHW.y / 3.1).r * 0.6 + texture2D(tDet, vHW.zx / 6.0 - vHW.y / 5.0).g * 0.4;
    float hd = distance(cameraPosition, vHW);
    float near = 1.0 - smoothstep(250.0, 1500.0, hd);
    diffuseColor.rgb *= mix(1.0, 0.62 + 0.75 * n, near);
    diffuseColor.rgb *= mix(0.55, 1.08, smoothstep(-0.7, 0.8, vTL.y));
    if (vTL.y < -0.92) diffuseColor.rgb = vec3(0.09, 0.07, 0.05); // trunk
  }
`;

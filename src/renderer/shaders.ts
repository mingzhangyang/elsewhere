export const SKY_VERTEX = `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Share this solar-altitude transfer function across the sky, ground, clouds and Moon.
// An above-horizon Sun must still produce a predominantly daylight sky. Degrees are
// kept here for a small CPU reference used by regression tests; GLSL accepts radians.
const SKY_DAY_START_DEG = -18;
const SKY_DAY_END_DEG = 2;
export function skyDaylightFactor(sunAltitudeDegrees: number): number {
  const t = Math.max(
    0,
    Math.min(1, (sunAltitudeDegrees - SKY_DAY_START_DEG) / (SKY_DAY_END_DEG - SKY_DAY_START_DEG)),
  );
  return t * t * (3 - 2 * t);
}
const DAYLIGHT_GLSL = `
  float daylightFactor(float sunAltitude) {
    return smoothstep(${((SKY_DAY_START_DEG * Math.PI) / 180).toFixed(8)}, ${((SKY_DAY_END_DEG * Math.PI) / 180).toFixed(8)}, sunAltitude);
  }
`;
// Keep the daytime sky blue across a wide range of elevations. These are display-space
// colours, like the rest of this custom shader (no automatic Three.js tone-mapping chunk).
const DAY_SKY_HORIZON = [0.5, 0.72, 0.96] as const;
const DAY_SKY_ZENITH = [0.2, 0.36, 0.71] as const;
const shaderColor = (values: readonly number[]) =>
  `vec3(${values.map((value) => value.toFixed(2)).join(', ')})`;
export function daylightSkyColor(elevationDegrees: number): [number, number, number] {
  const elevation = Math.sin((Math.max(0, Math.min(90, elevationDegrees)) * Math.PI) / 180);
  const t = Math.pow(elevation, 0.6);
  return [
    DAY_SKY_HORIZON[0] + (DAY_SKY_ZENITH[0] - DAY_SKY_HORIZON[0]) * t,
    DAY_SKY_HORIZON[1] + (DAY_SKY_ZENITH[1] - DAY_SKY_HORIZON[1]) * t,
    DAY_SKY_HORIZON[2] + (DAY_SKY_ZENITH[2] - DAY_SKY_HORIZON[2]) * t,
  ];
}

// At wide angles a lunar disc occupies only a few pixels. High-contrast terrain
// then looks like a jagged grey rock; progressively restore it on close inspection.
const MOON_ALBEDO_MID = 0.27;
const MOON_NIGHT_BASE = 0.77;
const MOON_DAY_BASE = 0.93;
const MOON_ZOOM_DAY_BASE = 0.82;
const MOON_SMALL_CONTRAST = 0.08;
const MOON_ZOOM_CONTRAST = 0.62;
const MOON_HIGHLIGHT_SHOULDER = 0.12;
export function moonScreenDiameterPx(distanceKm: number, heightPx: number, verticalFov: number): number {
  return (1737.4 * heightPx) / (distanceKm * Math.tan((verticalFov * Math.PI) / 360));
}
export function moonTextureDetail(diameterPx: number): number {
  const t = Math.max(0, Math.min(1, (diameterPx - 24) / 72));
  return t * t * (3 - 2 * t);
}
export function moonLitReflectance(linearLuminance: number, daylight: number, detail = 1): number {
  const luminance = Math.max(0, Math.min(1, linearLuminance));
  const day = Math.max(0, Math.min(1, daylight));
  const texture = Math.max(0, Math.min(1, detail));
  const dayBase = MOON_DAY_BASE + (MOON_ZOOM_DAY_BASE - MOON_DAY_BASE) * texture;
  const base = MOON_NIGHT_BASE + (dayBase - MOON_NIGHT_BASE) * day;
  const contrast = MOON_SMALL_CONTRAST + (MOON_ZOOM_CONTRAST - MOON_SMALL_CONTRAST) * texture;
  const linear = Math.max(0.6, base + (luminance - MOON_ALBEDO_MID) * contrast);
  // Zoomed highlights roll off gradually instead of saturating to pure white.
  const shoulder = Math.max(0.001, MOON_HIGHLIGHT_SHOULDER * texture);
  const knee = 1 - shoulder;
  return linear <= knee ? linear : 1 - shoulder * Math.exp(-(linear - knee) / shoulder);
}
const MOON_REFLECTANCE_GLSL = `
  float moonLitReflectance(float luminance, float daylight, float detail) {
    float dayBase = mix(${MOON_DAY_BASE.toFixed(2)}, ${MOON_ZOOM_DAY_BASE.toFixed(2)}, clamp(detail, 0.0, 1.0));
    float base = mix(${MOON_NIGHT_BASE.toFixed(2)}, dayBase, clamp(daylight, 0.0, 1.0));
    float contrast = mix(${MOON_SMALL_CONTRAST.toFixed(2)}, ${MOON_ZOOM_CONTRAST.toFixed(2)}, clamp(detail, 0.0, 1.0));
    float linear = max(0.60, base + (clamp(luminance, 0.0, 1.0) - ${MOON_ALBEDO_MID.toFixed(2)}) * contrast);
    float shoulder = max(0.001, ${MOON_HIGHLIGHT_SHOULDER.toFixed(2)} * clamp(detail, 0.0, 1.0));
    float knee = 1.0 - shoulder;
    return linear <= knee ? linear : 1.0 - shoulder * exp(-(linear - knee) / shoulder);
  }
`;
// The sky and lunar foreground use exactly the same display-space atmospheric radiance.
// The unlit Moon blocks distant light, not the atmosphere between the observer and Moon.
const ATMOSPHERE = `
  uniform float uSunAltitude, uHaze;
  uniform vec3 uSunDirection;
  ${DAYLIGHT_GLSL}
  vec3 atmosphere(vec3 d) {
    float elevation = max(d.y, 0.0);
    float horizon = pow(1.0 - elevation, 4.5);
    float skyHeight = pow(elevation, 0.60);
    float day = daylightFactor(uSunAltitude);
    vec3 night = mix(vec3(0.020, 0.043, 0.092), vec3(0.006, 0.013, 0.035), pow(elevation, 0.52));
    // A low Sun still lights the whole sky. Keep the horizon pale and the zenith neutral blue.
    vec3 daylight = mix(${shaderColor(DAY_SKY_HORIZON)}, ${shaderColor(DAY_SKY_ZENITH)}, skyHeight);
    // Forward scattering makes the low sky paler near the Sun, without greying the whole dome.
    float sunAngle = max(dot(d, normalize(uSunDirection)), 0.0);
    daylight = mix(daylight, vec3(0.73, 0.82, 0.93), horizon * pow(sunAngle, 5.0) * 0.22);
    vec3 color = mix(night, daylight, day);
    float twilight = smoothstep(-0.30, -0.12, uSunAltitude) * (1.0 - smoothstep(0.04, 0.18, uSunAltitude));
    vec3 duskBlue = mix(vec3(0.28, 0.26, 0.37), vec3(0.08, 0.12, 0.23), skyHeight);
    color = mix(color, duskBlue, (1.0 - day) * twilight * 0.32);
    // Sunset warmth is confined to low elevations and sightlines towards the Sun.
    float towardSun = dot(d, normalize(uSunDirection));
    float sunward = smoothstep(-0.25, 0.96, towardSun);
    float warmBand = horizon * sunward * twilight;
    color = mix(color, vec3(0.94, 0.65, 0.48), warmBand * (0.46 + 0.20 * (1.0 - day)));
    float solarGlow = pow(max(towardSun, 0.0), 14.0);
    color += vec3(0.18, 0.12, 0.075) * solarGlow * (0.10 + day * 0.09 + twilight * 0.35);
    // Haze is strongest at the horizon and is cool/bright by day, not brown-grey.
    return mix(color, mix(vec3(0.15, 0.19, 0.24), vec3(0.74, 0.82, 0.90), day), clamp(uHaze, 0.0, 1.0) * horizon * 0.35);
  }
`;

export const SKY_FRAGMENT = `
  precision highp float;
  varying vec3 vDirection;
  ${ATMOSPHERE}
  void main() { gl_FragColor = vec4(atmosphere(normalize(vDirection)),1.0); }
`;

export const MOON_VERTEX = `
  varying vec3 vNormalWorld, vDirection;
  varying vec2 vMapUv;
  void main() {
    vMapUv = uv;
    vNormalWorld = normalize(mat3(modelMatrix)*normal);
    vec4 world = modelMatrix*vec4(position,1.0);
    vDirection = normalize(world.xyz);
    gl_Position = projectionMatrix*viewMatrix*world;
  }
`;
export const MOON_FRAGMENT = `
  precision highp float;
  uniform sampler2D uMap;
  uniform vec3 uMoonSunDirection;
  uniform float uMoonDetail;
  varying vec3 vNormalWorld, vDirection;
  varying vec2 vMapUv;
  ${ATMOSPHERE}
  ${MOON_REFLECTANCE_GLSL}
  void main() {
    vec3 d = normalize(vDirection);
    float incidence = dot(normalize(vNormalWorld), normalize(uMoonSunDirection));
    // Resolve the terminator smoothly on a small, physically sized lunar disc.
    float sunlit = smoothstep(-0.015, 0.065, incidence);
    // The texture is already decoded from sRGB by the GPU; do not gamma-decode it twice.
    vec3 lunarAlbedo = texture2D(uMap, vMapUv).rgb;
    float luminance = dot(lunarAlbedo, vec3(0.2126, 0.7152, 0.0722));
    float reflectance = moonLitReflectance(luminance, daylightFactor(uSunAltitude), uMoonDetail);
    float relief = 0.80 + 0.20 * pow(max(incidence, 0.0), 0.45);
    vec3 litSurface = vec3(0.96, 0.97, 0.99) * reflectance * mix(1.0, relief, uMoonDetail);
    float transmission = exp(-(0.055 + uHaze * 0.24) / max(0.12, d.y));
    vec3 sky = atmosphere(d);
    vec3 foreground = sky * (1.0 - transmission);
    // In daylight the shadowed hemisphere blends into the sky; at night it occludes stars.
    vec3 shadow = mix(foreground + lunarAlbedo * 0.025 * transmission, sky, smoothstep(-0.16, -0.025, uSunAltitude));
    // Preserve lunar phase, size, and surface relief while giving the lit crescent contrast.
    gl_FragColor = vec4(mix(shadow, foreground + litSurface * transmission, sunlit), 1.0);
  }
`;

export const GROUND_FRAGMENT = `
  precision highp float;
  varying vec3 vDirection;
  ${ATMOSPHERE}
  void main() {
    vec3 d = normalize(vDirection);
    float day = daylightFactor(uSunAltitude);
    vec3 surface = mix(vec3(0.009,0.016,0.024),vec3(0.12,0.17,0.18),day);
    vec3 distanceHaze = atmosphere(normalize(vec3(d.x,0.015,d.z)))*mix(0.24,0.58,day);
    gl_FragColor = vec4(mix(distanceHaze,surface,smoothstep(0.0,0.32,-d.y)),1.0);
  }
`;

// A curved cloud deck gives distant clouds perspective compression toward the horizon.
// One foreground pass attenuates the sky, bodies, stars, and labels together.
// Lighting is a cheap 2D approximation of a cloud seen from below: optical depth along
// the view darkens thick cores to a blue-grey base, a short march toward the Sun lights
// the sunward lobes, thin edges glow when backlit, and distance fades into the horizon sky.
export const CLOUD_FRAGMENT = `
  precision highp float;
  varying vec3 vDirection;
  uniform float uCloud,uWindSpeed,uWindDirection,uTime;
  ${ATMOSPHERE}
  // Arithmetic hash: sin-based hashes lose precision on mobile GPUs and show as blocks.
  float hash(vec2 p) {
    vec3 p3=fract(vec3(p.xyx)*0.1031);
    p3+=dot(p3,p3.yzx+33.33);
    return fract((p3.x+p3.y)*p3.z);
  }
  float noise(vec2 p) {
    vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
  }
  const mat2 OCTAVE=mat2(1.6,1.2,-1.2,1.6);
  // Fine octaves fade to their mean with distance so the compressed horizon does not alias into
  // streaks; the two finest are only added overhead, where the deck is near and edges are large.
  float fbm(vec2 p, float detail, float near) {
    float value=0.0,amp=0.5,total=0.0;
    for(int i=0;i<7;i++){
      float weight=i<2?1.0:(i<5?detail:near);
      value+=amp*mix(0.5,noise(p),weight); total+=amp;
      // A rough gain keeps fine octaves strong enough to give cloud margins a lumpy, crisp edge.
      p=OCTAVE*p+vec2(3.1,1.7); amp*=0.56;
    }
    return value/total;
  }
  float shape(vec2 p) {
    float value=0.0,amp=0.5;
    for(int i=0;i<3;i++){value+=amp*noise(p);p=OCTAVE*p+vec2(3.1,1.7);amp*=0.5;}
    return value/0.875;
  }
  void main() {
    vec3 d=normalize(vDirection);
    if(d.y<0.0)discard;
    float angle=(uWindDirection+180.0)*0.0174532925;
    vec2 drift=vec2(sin(angle),-cos(angle))*uWindSpeed*0.0008*uTime;
    // Intersect a curved deck. Clamping a flat plane's denominator creates vertical horizon streaks.
    float distance=-64.0*d.y+sqrt(4096.0*d.y*d.y+38.49);
    vec2 p=d.xz*distance*3.7-drift;
    float detail=1.0-smoothstep(2.2,6.0,distance);
    // Domain warping turns noise blobs into rounded, heaped lobes.
    vec2 q=p+(vec2(noise(p*0.45+vec2(1.7,9.2)),noise(p*0.45+vec2(8.3,2.8)))-0.5)*0.75;
    float near=1.0-smoothstep(0.4,2.0,distance);
    float n=fbm(q,detail,near);
    float coverage=clamp(uCloud,0.0,1.0);
    // Fitted to this noise so the mean cloud opacity tracks the reported cover (15% looks like 15%).
    float threshold=0.7145+coverage*(-0.9431+coverage*(1.3002-coverage*0.8979));
    // Thickness above the threshold: thin margins stay translucent, cores turn opaque quickly.
    float thickness=max(n-threshold,0.0)/max(1.0-threshold,0.1);
    float density=1.0-exp(-thickness*12.0);
    float overcast=smoothstep(0.85,1.0,coverage);
    float alpha=mix(density,1.0,overcast)*smoothstep(0.0,0.12,coverage);
    alpha*=smoothstep(0.0,0.025,d.y);

    vec3 sunDir=normalize(uSunDirection);
    float day=daylightFactor(uSunAltitude);
    // Sunlight reddens through a long, low path; overhead it is close to white.
    vec3 sunColor=mix(vec3(1.0,0.74,0.56),vec3(1.0,0.97,0.92),smoothstep(0.0,0.15,uSunAltitude));
    // Short march toward the Sun across the deck: lobes facing it are lit, the far side is shaded.
    vec2 sunStep=normalize(sunDir.xz+vec2(1e-4))*0.16*(1.0-0.7*clamp(sunDir.y,0.0,1.0));
    float shadowDepth=max(shape(q+sunStep)-threshold,0.0)+0.6*max(shape(q+2.0*sunStep)-threshold,0.0);
    float depth=thickness*1.6+shadowDepth*2.2/max(1.0-threshold,0.1);
    float direct=exp(-depth*0.85);
    // Shaded bases take the blue of the sky above; lit faces take the colour of the Sun.
    vec3 skyLight=atmosphere(vec3(0.0,1.0,0.0));
    vec3 base=mix(vec3(0.62,0.66,0.72),skyLight*0.55+vec3(0.40),0.5);
    vec3 daytime=mix(base,sunColor*0.98,direct);
    // An overcast deck is lit diffusely from above: a soft grey with gentle, darker undulations
    // and a brighter patch where the Sun shines through, not the high contrast of separate clouds.
    vec3 deck=mix(vec3(0.60,0.64,0.70),vec3(0.48,0.54,0.61),smoothstep(0.25,0.75,n));
    daytime=mix(daytime,deck,overcast);
    // Thin backlit margins glow (forward scattering) when the view is near the Sun.
    float towardSun=max(dot(d,sunDir),0.0);
    float forward=pow(towardSun,6.0)*0.55+pow(towardSun,40.0)*0.9;
    daytime+=sunColor*forward*mix(1.0-density*0.85,0.3,overcast)*smoothstep(-0.05,0.05,uSunAltitude);
    daytime=min(daytime,vec3(1.0));
    // Aerial perspective: distant clouds lose contrast into the horizon sky.
    float aerial=smoothstep(1.0,6.2,distance)*0.55+clamp(uHaze,0.0,1.0)*0.25*smoothstep(0.5,6.2,distance);
    daytime=mix(daytime,atmosphere(d),clamp(aerial,0.0,0.75));
    float dusk=smoothstep(-0.30,-0.12,uSunAltitude)*(1.0-smoothstep(0.04,0.18,uSunAltitude));
    float sunward=smoothstep(-0.25,0.96,dot(d,sunDir));
    vec3 color=mix(vec3(0.020,0.029,0.046)*(0.8+n*0.3),daytime,day);
    color=mix(color,vec3(0.86,0.55,0.46)*(0.55+0.45*direct),dusk*sunward*0.36);
    gl_FragColor=vec4(color,alpha);
  }
`;

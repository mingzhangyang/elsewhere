export const SKY_VERTEX = `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The sky and lunar foreground use exactly the same display-space atmospheric radiance.
// The unlit Moon blocks distant light, not the atmosphere between the observer and Moon.
const ATMOSPHERE = `
  uniform float uSunAltitude, uHaze;
  uniform vec3 uSunDirection;
  vec3 atmosphere(vec3 d) {
    float elevation = max(d.y, 0.0);
    float horizon = pow(1.0 - elevation, 4.8);
    float day = smoothstep(-0.055, 0.13, uSunAltitude);
    float twilight = smoothstep(-0.31, -0.10, uSunAltitude) * (1.0 - smoothstep(-0.045, 0.08, uSunAltitude));
    vec3 night = mix(vec3(0.020,0.043,0.092),vec3(0.006,0.013,0.035),pow(elevation,0.52));
    vec3 daylight = mix(vec3(0.46,0.66,0.79),vec3(0.045,0.29,0.62),pow(elevation,0.42));
    vec3 color = mix(night,daylight,day);
    vec3 dusk = mix(vec3(0.74,0.28,0.12),vec3(0.13,0.12,0.23),pow(elevation,0.62));
    color = mix(color,dusk,twilight*(0.42+horizon*0.52));
    float solarGlow = pow(max(dot(d,normalize(uSunDirection)),0.0),11.0);
    float broadGlow = pow(max(dot(d,normalize(uSunDirection)),0.0),2.1);
    color += vec3(1.0,0.47,0.19)*solarGlow*(0.16+twilight*0.55);
    color += vec3(0.28,0.22,0.20)*broadGlow*day*0.05;
    return mix(color,mix(vec3(0.15,0.19,0.24),vec3(0.78,0.72,0.64),day),clamp(uHaze,0.0,1.0)*horizon*0.60);
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
  varying vec3 vNormalWorld, vDirection;
  varying vec2 vMapUv;
  ${ATMOSPHERE}
  void main() {
    vec3 d = normalize(vDirection);
    float illumination = max(dot(normalize(vNormalWorld),normalize(uMoonSunDirection)),0.0);
    float transmission = exp(-(0.055+uHaze*0.24)/max(0.12,d.y));
    vec3 albedo = pow(texture2D(uMap,vMapUv).rgb,vec3(1.0/2.2));
    vec3 reflected = albedo*(0.012+0.82*pow(illumination,0.65))*transmission;
    gl_FragColor = vec4(atmosphere(d)+reflected,1.0);
  }
`;

export const GROUND_FRAGMENT = `
  precision highp float;
  varying vec3 vDirection;
  ${ATMOSPHERE}
  void main() {
    vec3 d = normalize(vDirection);
    float day = smoothstep(-0.15,0.12,uSunAltitude);
    vec3 surface = mix(vec3(0.009,0.016,0.024),vec3(0.12,0.17,0.18),day);
    vec3 distanceHaze = atmosphere(normalize(vec3(d.x,0.015,d.z)))*mix(0.24,0.58,day);
    gl_FragColor = vec4(mix(distanceHaze,surface,smoothstep(0.0,0.32,-d.y)),1.0);
  }
`;

// A curved cloud deck gives distant clouds perspective compression toward the horizon.
// One foreground pass attenuates the sky, bodies, stars, and labels together.
export const CLOUD_FRAGMENT = `
  precision highp float;
  varying vec3 vDirection;
  uniform float uSunAltitude,uCloud,uWindSpeed,uWindDirection,uTime;
  uniform vec3 uSunDirection;
  float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
  float noise(vec2 p) {
    vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
  }
  float fbm(vec2 p) {
    float value=0.0,amp=0.55;
    for(int i=0;i<5;i++){value+=amp*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p; amp*=0.49;}
    return value;
  }
  void main() {
    vec3 d=normalize(vDirection);
    if(d.y<0.0)discard;
    float angle=(uWindDirection+180.0)*0.0174532925;
    vec2 drift=vec2(sin(angle),-cos(angle))*uWindSpeed*0.0008*uTime;
    // Intersect a curved deck. Clamping a flat plane's denominator creates vertical horizon streaks.
    float distance=-64.0*d.y+sqrt(4096.0*d.y*d.y+38.49);
    vec2 p=d.xz*distance*4.1-drift;
    float n=fbm(p);
    float coverage=clamp(uCloud,0.0,1.0);
    float density=smoothstep(0.69-coverage*0.48,0.79-coverage*0.48,n);
    float alpha=mix(density,1.0,smoothstep(0.85,1.0,coverage))*smoothstep(0.0,0.12,coverage);
    alpha*=smoothstep(0.0,0.025,d.y);
    float day=smoothstep(-0.055,0.13,uSunAltitude);
    float edge=clamp((n-fbm(p+uSunDirection.xz*0.14))*0.5,-0.04,0.04);
    vec3 daytime=mix(vec3(0.88,0.91,0.94),vec3(0.64,0.71,0.79),density*0.7)-edge;
    daytime=mix(daytime,vec3(0.44,0.51,0.60)*(0.86+n*0.25),smoothstep(0.75,1.0,coverage));
    float dusk=smoothstep(-0.3,-0.08,uSunAltitude)*(1.0-smoothstep(-0.04,0.1,uSunAltitude));
    vec3 color=mix(vec3(0.020,0.029,0.046)*(0.8+n*0.3),daytime,day);
    color=mix(color,vec3(0.63,0.40,0.30),dusk*0.55);
    gl_FragColor=vec4(color,alpha);
  }
`;

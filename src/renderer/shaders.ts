export const SKY_VERTEX = `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const SKY_FRAGMENT = `
  precision highp float;
  varying vec3 vDirection;
  uniform float uSunAltitude;
  uniform vec3 uSunDirection;
  uniform float uCloud;
  uniform float uHaze;
  uniform float uWindSpeed;
  uniform float uWindDirection;
  uniform float uTime;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }
  float fbm(vec3 p) {
    float value = 0.0;
    float amp = 0.56;
    for (int i = 0; i < 4; i++) {
      value += amp * noise3(p);
      p *= 2.03;
      amp *= 0.49;
    }
    return value;
  }
  void main() {
    vec3 d = normalize(vDirection);
    float elevation = max(d.y, 0.0);
    float horizon = pow(1.0 - elevation, 4.8);
    float day = smoothstep(-0.055, 0.13, uSunAltitude);
    float twilight = smoothstep(-0.31, -0.10, uSunAltitude) * (1.0 - smoothstep(-0.045, 0.08, uSunAltitude));

    vec3 nightZenith = vec3(0.006, 0.013, 0.035);
    vec3 nightHorizon = vec3(0.020, 0.043, 0.092);
    vec3 dayZenith = vec3(0.045, 0.29, 0.62);
    vec3 dayHorizon = vec3(0.46, 0.66, 0.79);
    vec3 nightSky = mix(nightHorizon, nightZenith, pow(elevation, 0.52));
    vec3 daySky = mix(dayHorizon, dayZenith, pow(elevation, 0.42));
    vec3 color = mix(nightSky, daySky, day);
    vec3 warmHorizon = vec3(0.74, 0.28, 0.12);
    vec3 warmZenith = vec3(0.13, 0.12, 0.23);
    vec3 dusk = mix(warmHorizon, warmZenith, pow(elevation, 0.62));
    color = mix(color, dusk, twilight * (0.42 + horizon * 0.52));

    float solarGlow = pow(max(dot(d, normalize(uSunDirection)), 0.0), 11.0);
    float broadGlow = pow(max(dot(d, normalize(uSunDirection)), 0.0), 2.1);
    color += vec3(1.0, 0.47, 0.19) * solarGlow * (0.16 + twilight * 0.55);
    color += vec3(0.28, 0.22, 0.20) * broadGlow * day * 0.05;

    // Meteorological wind direction points FROM; clouds drift in the opposite direction.
    float angle = (uWindDirection + 180.0) * 0.0174532925;
    vec3 drift = vec3(sin(angle), 0.12, -cos(angle)) * (uWindSpeed * 0.0025) * uTime;
    vec3 cloudCoord = d * vec3(7.5, 4.6, 7.5) + drift;
    float cloudNoise = fbm(cloudCoord);
    float coverage = clamp(uCloud, 0.0, 1.0);
    float clouds = smoothstep(0.58 - coverage * 0.36, 0.88, cloudNoise) * coverage;
    float cloudAlpha = clamp(clouds * 1.10, 0.0, 0.86);
    vec3 cloudDay = vec3(0.72, 0.77, 0.79);
    vec3 cloudNight = vec3(0.045, 0.065, 0.105);
    vec3 cloudColor = mix(cloudNight, cloudDay, day);
    cloudColor = mix(cloudColor, vec3(0.61, 0.34, 0.28), twilight * 0.58);
    color = mix(color, cloudColor, cloudAlpha);

    float haze = clamp(uHaze, 0.0, 1.0) * horizon;
    color = mix(color, mix(vec3(0.15,0.19,0.24), vec3(0.78,0.72,0.64), day), haze * 0.60);
    gl_FragColor = vec4(color, 1.0);
  }
`;


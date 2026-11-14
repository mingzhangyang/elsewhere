import * as THREE from 'three';
import { STAR_MODEL } from '../domain/starVisibility';

const glsl = (value: number) => (Number.isInteger(value) ? value.toFixed(1) : String(value));

/**
 * Stars are drawn as one rigid sphere: the position attribute holds equator-of-date directions and
 * the object's matrix turns them into the sky, so a new instant costs one matrix, not a pass over the
 * catalog. Refraction and the visibility model depend on altitude, so they run per vertex here,
 * built from the same constants as the CPU reference in lib/starVisibility.ts.
 */
export const STAR_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aMagnitude;
attribute float aIntensity;
uniform float uPixelRatio;
uniform float uLimit;
uniform float uDistance;
varying vec3 vColor;
varying float vAlpha;
const float DEG = 0.017453292519943295;

// Astronomy Engine's 'normal' refraction (Saemundsson), in degrees.
float refraction(float altitude) {
  float hd = max(altitude, -1.0);
  float r = (1.02 / tan((hd + 10.3 / (hd + 5.11)) * DEG)) / 60.0;
  if (altitude < -1.0) r *= (altitude + 90.0) / 89.0;
  return r;
}

void main() {
  vec3 direction = normalize((modelMatrix * vec4(position, 1.0)).xyz);
  float geometric = asin(clamp(direction.y, -1.0, 1.0)) / DEG;
  float altitude = min(90.0, geometric + refraction(geometric));
  vec2 ground = direction.xz;
  float spread = length(ground);
  if (spread > 1e-6) ground /= spread;
  float c = cos(altitude * DEG);
  vec3 apparent = vec3(ground.x * c, sin(altitude * DEG), ground.y * c);
  gl_Position = projectionMatrix * viewMatrix * vec4(apparent * uDistance, 1.0);
  gl_PointSize = aSize * uPixelRatio;
  vColor = color;
  float sinAltitude = sin(altitude * DEG);
  float magnitude = aMagnitude + ${glsl(STAR_MODEL.extinction)} / max(${glsl(STAR_MODEL.minSinAltitude)}, sinAltitude)
    - ${glsl(STAR_MODEL.extinction)};
  float visible = altitude > 0.0
    ? 1.0 - smoothstep(uLimit + ${glsl(STAR_MODEL.fadeStart)}, uLimit + ${glsl(STAR_MODEL.fadeEnd)}, magnitude)
    : 0.0;
  vAlpha = visible * aIntensity;
}
`;

export const STAR_FRAGMENT = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  float r = length(p);
  if (r > 0.5) discard;
  float alpha = (1.0 - smoothstep(0.12, 0.5, r)) * uOpacity * vAlpha;
  gl_FragColor = vec4(vColor, alpha);
}
`;

export function createStarMaterial(distance: number, pixelRatio: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 1 },
      uPixelRatio: { value: pixelRatio },
      uLimit: { value: 6 },
      uDistance: { value: distance },
    },
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });
}

/** Writes a row-major 3×3 rotation into a 4×4 object matrix. */
export function setRotationMatrix(target: THREE.Matrix4, m: readonly number[]): THREE.Matrix4 {
  // prettier-ignore
  return target.set(
    m[0], m[1], m[2], 0,
    m[3], m[4], m[5], 0,
    m[6], m[7], m[8], 0,
    0, 0, 0, 1,
  );
}

/**
 * Between simulation ticks during playback, the sky keeps turning about the celestial pole at the
 * playback rate, so fast playback is smooth instead of stepping every tick. `seconds` is simulated
 * time since the last tick.
 */
export function diurnalTurn(
  rotation: readonly number[],
  seconds: number,
  target = new THREE.Quaternion(),
): THREE.Quaternion {
  // The pole is the image of the equatorial z axis: the rotation's third column.
  const pole = new THREE.Vector3(rotation[2], rotation[5], rotation[8]).normalize();
  return target.setFromAxisAngle(pole, -SIDEREAL_RATE_RAD * seconds);
}

/** Earth's rotation relative to the stars, in radians per second. */
export const SIDEREAL_RATE_RAD = (2 * Math.PI) / 86_164.0905;

import * as THREE from 'three';
import { EQUATORIAL_TO_GALACTIC } from '../domain/galactic';

/**
 * The Milky Way as a procedural glow on a sphere that turns with the stars. The sphere holds
 * equator-of-date directions, like the star field, and shares its object matrix; the fragment
 * shader turns each direction into galactic longitude and latitude and paints an illustrative
 * band from them: brightest and widest toward the center in Sagittarius, faint toward the
 * anticenter, with the bulge, star clouds and the dark Great Rift from Cygnus to Ophiuchus. No
 * image is used. The shape is an impression of the band, not a survey map.
 */

const m = EQUATORIAL_TO_GALACTIC;
// GLSL matrices are column-major: mat3(column0, column1, column2).
const GALACTIC = `mat3(${[m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]].join(', ')})`;

/** Display brightness at the center of the band, before visibility; the night sky is about 0.01. */
export const MILKY_WAY_PEAK = 0.12;

export const MILKY_WAY_VERTEX = /* glsl */ `
varying vec3 vLocal;
varying vec3 vWorld;
void main() {
  vLocal = position;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

export const MILKY_WAY_FRAGMENT = /* glsl */ `
precision highp float;
uniform float uIntensity;
uniform float uOctaves;
varying vec3 vLocal;
varying vec3 vWorld;
const float DEG = 0.017453292519943295;
const mat3 GALACTIC = ${GALACTIC};

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float sum = 0.0, amplitude = 0.5, norm = 0.0;
  for (int i = 0; i < 5; i++) {
    if (float(i) >= uOctaves) break;
    sum += amplitude * noise(p);
    norm += amplitude;
    p = p * 2.03 + vec3(1.7, 9.2, 4.1);
    amplitude *= 0.5;
  }
  return sum / norm;
}
float bell(float x, float width) { return exp(-(x * x) / (width * width)); }

void main() {
  vec3 g = GALACTIC * normalize(vLocal);
  float b = asin(clamp(g.z, -1.0, 1.0)) / DEG;
  if (abs(b) > 42.0) discard;
  float l = atan(g.y, g.x) / DEG;
  float al = abs(l);

  // Brightness along the plane: the inner Galaxy, with Cygnus and Carina as secondary peaks.
  float along = 0.3 + 0.7 * bell(al, 60.0) + 0.4 * bell(l - 75.0, 25.0) + 0.3 * bell(l + 75.0, 25.0);
  float width = 7.0 + 7.0 * bell(al, 45.0);
  float band = bell(b, width);
  float bulge = bell(l, 13.0) * bell(b + 2.0, 9.0);

  // Star clouds and dust: one coarse and one fine layer of noise in galactic coordinates.
  float clouds = fbm(g * 7.0);
  float fine = fbm(g * 22.0 + 3.1);
  float light = band * along * (0.5 + 1.1 * clouds * clouds) + bulge * 0.85 * (0.6 + 0.6 * clouds);

  // The Great Rift: a dark lane just north of the plane from Cygnus (l ≈ 80°) to Ophiuchus (l ≈ 0°).
  float rift = (smoothstep(-18.0, -2.0, l) - smoothstep(75.0, 92.0, l))
    * bell(b - 2.0 - 2.0 * sin(l * DEG * 4.0), 2.0 + 2.5 * fine);
  float dust = clamp(rift * 0.8 + (fine - 0.45) * 0.9 * band, 0.0, 0.85);
  light *= 1.0 - dust;

  // Fades into the thicker air toward the horizon.
  float altitude = normalize(vWorld).y;
  float air = smoothstep(-0.02, 0.22, altitude);
  vec3 tint = mix(vec3(0.72, 0.80, 1.0), vec3(1.0, 0.88, 0.72), bell(al, 40.0));
  gl_FragColor = vec4(tint * light * air * uIntensity * ${MILKY_WAY_PEAK}, 1.0);
}
`;

export function createMilkyWay(radius: number) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uIntensity: { value: 0 }, uOctaves: { value: 5 } },
    vertexShader: MILKY_WAY_VERTEX,
    fragmentShader: MILKY_WAY_FRAGMENT,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), material);
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  return { mesh, material };
}

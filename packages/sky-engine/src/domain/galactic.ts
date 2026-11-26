/**
 * Rotation from J2000 equatorial unit vectors (x: equinox, z: celestial pole) to galactic ones
 * (x: galactic center, z: north galactic pole), row-major. Hipparcos values (ESA 1997, vol. 1, §1.5.3).
 * The procedural Milky Way evaluates directions in J2000; its sphere's object transform
 * precesses those directions to the star catalog's equator of date before placing them in the sky.
 */
// prettier-ignore
export const EQUATORIAL_TO_GALACTIC = [
  -0.0548755604, -0.8734370902, -0.4838350155,
  0.4941094279, -0.44482963, 0.7469822445,
  -0.867666149, -0.1980763734, 0.4559837762,
] as const;

const DEG = 180 / Math.PI;

/** Galactic longitude (0–360°, 0 toward the center in Sagittarius) and latitude (±90°). */
export function galacticFromEquatorial(raDeg: number, decDeg: number): { l: number; b: number } {
  const ra = raDeg / DEG,
    dec = decDeg / DEG;
  const e = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const m = EQUATORIAL_TO_GALACTIC;
  const x = m[0] * e[0] + m[1] * e[1] + m[2] * e[2];
  const y = m[3] * e[0] + m[4] * e[1] + m[5] * e[2];
  const z = m[6] * e[0] + m[7] * e[1] + m[8] * e[2];
  return { l: (Math.atan2(y, x) * DEG + 360) % 360, b: Math.asin(Math.max(-1, Math.min(1, z))) * DEG };
}

export type SkyDirection = [number, number, number];

/** Invert the WebGL sphere transform: scene -> equator of date -> J2000 -> Galactic. */
export function createSceneToGalactic(field: { rotation: readonly number[]; precession: readonly number[] }) {
  const { rotation, precession } = field;
  const m = EQUATORIAL_TO_GALACTIC;
  // Each of the two rotations is orthogonal. Compose M * P^T * R^T once per image.
  const row = (i: number, j: number) =>
    m[i] * precession[j] + m[i + 1] * precession[j + 1] + m[i + 2] * precession[j + 2];
  const eq = Array.from({ length: 9 }, (_, i) => row(Math.floor(i / 3) * 3, (i % 3) * 3));
  const t = Array.from({ length: 9 }, (_, i) => {
    const a = Math.floor(i / 3) * 3;
    const b = (i % 3) * 3;
    return eq[a] * rotation[b] + eq[a + 1] * rotation[b + 1] + eq[a + 2] * rotation[b + 2];
  });
  return ([x, y, z]: SkyDirection): SkyDirection => [
    t[0] * x + t[1] * y + t[2] * z,
    t[3] * x + t[4] * y + t[5] * z,
    t[6] * x + t[7] * y + t[8] * z,
  ];
}

/** The same large-scale Galaxy in the shader and the painting; noise and pigment are independent. */
export const MILKY_WAY_SHAPE = Object.freeze({
  base: 0.3,
  inner: 0.7,
  innerWidth: 60,
  cygnus: 0.4,
  carina: 0.3,
  secondaryLongitude: 75,
  secondaryWidth: 25,
  bandWidth: 7,
  innerBandWidth: 7,
  widthFalloff: 45,
  bulgeWidth: 13,
  bulgeLatitude: -2,
  bulgeHeight: 9,
  bulgeStrength: 0.85,
  latitudeCutoff: 42,
  airStart: -0.02,
  airEnd: 0.22,
} as const);

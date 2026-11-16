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

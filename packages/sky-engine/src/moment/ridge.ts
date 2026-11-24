// Kept apart from createSkyRenderer.ts (and free of three.js) so the sky-moment images can draw the
// same ridge without loading the renderer.

/** Distance of the illustrative ridge from the viewer, in scene units. */
export const RIDGE_RADIUS = 1435;

/** Height of the ridge's top edge, in scene units, at `azimuth` radians (clockwise from north). */
export function ridgeHeight(azimuth: number): number {
  const wave = Math.sin(azimuth * 5.0) * 10 + Math.sin(azimuth * 11.0) * 4 + Math.cos(azimuth * 17.0) * 2;
  return Math.max(4, Math.min(38, wave + 18));
}

/** Altitude of the ridge's top edge, in degrees, at `azimuth` degrees. At most about 1.5°. */
export function ridgeAltitude(azimuth: number): number {
  return (Math.atan2(ridgeHeight((azimuth * Math.PI) / 180), RIDGE_RADIUS) * 180) / Math.PI;
}

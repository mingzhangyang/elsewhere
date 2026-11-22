/** A point in the unit sky-chart disc: origin at zenith, x right, y down. */
export interface SkyChartPoint {
  readonly x: number;
  readonly y: number;
}

const RADIANS_PER_DEGREE = Math.PI / 180;

/**
 * Azimuthal equidistant projection of the above-horizon celestial hemisphere.
 *
 * @param altitude Apparent (standard-refracted) center altitude in degrees, [-90, 90].
 * @param azimuth Degrees clockwise from north; any finite angle is accepted and wraps at 360.
 * @returns Normalized unit-disc coordinates (zenith 0,0; north up; east left), or null for
 *   a center below the mathematical horizon (altitude < 0). The horizon itself is included.
 * @throws RangeError for non-finite inputs or altitude outside the physical [-90, 90] range.
 *
 * Pure geometry only: no daylight, weather, object-visible flag, observer, camera, or canvas.
 */
export function projectSkyChart(altitude: number, azimuth: number): SkyChartPoint | null {
  if (!Number.isFinite(altitude) || altitude < -90 || altitude > 90) {
    throw new RangeError('Apparent altitude must be finite and between -90 and 90 degrees.');
  }
  if (!Number.isFinite(azimuth)) {
    throw new RangeError('Azimuth must be a finite number of degrees.');
  }
  if (altitude < 0) return null;
  if (altitude === 90) return { x: 0, y: 0 };

  const radius = (90 - altitude) / 90;
  const angle = (azimuth % 360) * RADIANS_PER_DEGREE;
  return { x: -radius * Math.sin(angle), y: -radius * Math.cos(angle) };
}

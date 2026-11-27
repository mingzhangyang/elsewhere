import * as Astronomy from 'astronomy-engine';
import type { Planet, PlanetId } from '../types';

const AU_KM = 149_597_870.7;
const DEG = Math.PI / 180;

/** The naked-eye planets, innermost first. Radii are equatorial (IAU 2015, as JPL Horizons uses). */
export const PLANETS: readonly { id: PlanetId; name: string; body: Astronomy.Body; radiusKm: number }[] = [
  { id: 'mercury', name: 'Mercury', body: Astronomy.Body.Mercury, radiusKm: 2440.53 },
  { id: 'venus', name: 'Venus', body: Astronomy.Body.Venus, radiusKm: 6051.8 },
  { id: 'mars', name: 'Mars', body: Astronomy.Body.Mars, radiusKm: 3396.19 },
  { id: 'jupiter', name: 'Jupiter', body: Astronomy.Body.Jupiter, radiusKm: 71492 },
  { id: 'saturn', name: 'Saturn', body: Astronomy.Body.Saturn, radiusKm: 60268 },
];
export const PLANET_IDS = PLANETS.map((planet) => planet.id);

/**
 * Apparent bright-limb direction of a body lit by the Sun, in degrees clockwise from the top of the
 * view (toward the zenith): the same construction the Moon's phase icon uses.
 */
export function brightLimbAngle(
  sun: { altitude: number; azimuth: number },
  body: { altitude: number; azimuth: number },
): number {
  const sa = sun.altitude * DEG,
    ba = body.altitude * DEG,
    az = (sun.azimuth - body.azimuth) * DEG;
  const right = Math.cos(sa) * Math.sin(az);
  const up = Math.sin(sa) * Math.cos(ba) - Math.cos(sa) * Math.sin(ba) * Math.cos(az);
  return Math.atan2(right, up) / DEG;
}

/**
 * Topocentric apparent positions of the five naked-eye planets. Altitude is refracted like the Sun,
 * Moon and stars; `geometricAltitude` is airless. Magnitude, phase and elongation are geocentric,
 * which differs from the observer's view by far less than they are displayed.
 */
export function calculatePlanets(
  observer: Astronomy.Observer,
  date: Date,
  sun: { altitude: number; azimuth: number },
): Planet[] {
  return PLANETS.map(({ id, name, body, radiusKm }) => {
    const equator = Astronomy.Equator(body, date, observer, true, true);
    const apparent = Astronomy.Horizon(date, observer, equator.ra, equator.dec, 'normal');
    const geometric = Astronomy.Horizon(date, observer, equator.ra, equator.dec);
    const illumination = Astronomy.Illumination(body, date);
    const elongation = Astronomy.Elongation(body, date);
    // Astronomy Engine applies aberration as a shift of the position vector, which also changes its
    // length by up to about 1e-4. Range is taken from the light-time position alone, as Horizons does.
    const distanceKm = Astronomy.Equator(body, date, observer, true, false).dist * AU_KM;
    return {
      id,
      name,
      altitude: apparent.altitude,
      geometricAltitude: geometric.altitude,
      azimuth: apparent.azimuth,
      // Rise and set refer to the planet's center on the refracted horizon.
      visible: apparent.altitude > 0,
      magnitude: illumination.mag,
      illumination: illumination.phase_fraction,
      phaseAngle: illumination.phase_angle,
      distanceKm,
      radiusKm,
      elongation: elongation.elongation,
      apparition: elongation.visibility === 'evening' ? 'evening' : 'morning',
      brightLimbAngle: brightLimbAngle(sun, apparent),
    };
  });
}

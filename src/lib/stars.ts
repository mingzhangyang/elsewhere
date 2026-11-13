import type { Star } from '../types';

// A curated bright-star subset. Coordinates are J2000 equatorial coordinates;
// magnitudes are visual magnitudes. The rendering uses this real-coordinate
// subset rather than placing stars by hand on the screen.
export interface CatalogStar {
  id: string;
  name: string;
  ra: number; // sidereal hours
  dec: number; // degrees
  magnitude: number;
}

export const STAR_CATALOG: CatalogStar[] = [
  { id: 'polaris', name: 'Polaris', ra: 2.5303, dec: 89.2641, magnitude: 1.98 },
  { id: 'sirius', name: 'Sirius', ra: 6.7525, dec: -16.7161, magnitude: -1.46 },
  { id: 'canopus', name: 'Canopus', ra: 6.3992, dec: -52.6957, magnitude: -0.74 },
  { id: 'arcturus', name: 'Arcturus', ra: 14.2610, dec: 19.1825, magnitude: -0.05 },
  { id: 'vega', name: 'Vega', ra: 18.6156, dec: 38.7837, magnitude: 0.03 },
  { id: 'capella', name: 'Capella', ra: 5.2782, dec: 45.9980, magnitude: 0.08 },
  { id: 'rigel', name: 'Rigel', ra: 5.2423, dec: -8.2016, magnitude: 0.13 },
  { id: 'procyon', name: 'Procyon', ra: 7.6550, dec: 5.2250, magnitude: 0.34 },
  { id: 'betelgeuse', name: 'Betelgeuse', ra: 5.9195, dec: 7.4071, magnitude: 0.42 },
  { id: 'achernar', name: 'Achernar', ra: 1.6286, dec: -57.2368, magnitude: 0.46 },
  { id: 'hadar', name: 'Hadar', ra: 14.0637, dec: -60.3730, magnitude: 0.61 },
  { id: 'altair', name: 'Altair', ra: 19.8464, dec: 8.8683, magnitude: 0.77 },
  { id: 'acrux', name: 'Acrux', ra: 12.4433, dec: -63.0991, magnitude: 0.76 },
  { id: 'aldebaran', name: 'Aldebaran', ra: 4.5987, dec: 16.5093, magnitude: 0.85 },
  { id: 'antares', name: 'Antares', ra: 16.4901, dec: -26.4320, magnitude: 0.96 },
  { id: 'spica', name: 'Spica', ra: 13.4199, dec: -11.1614, magnitude: 0.98 },
  { id: 'pollux', name: 'Pollux', ra: 7.7553, dec: 28.0262, magnitude: 1.14 },
  { id: 'fomalhaut', name: 'Fomalhaut', ra: 22.9608, dec: -29.6222, magnitude: 1.16 },
  { id: 'deneb', name: 'Deneb', ra: 20.6905, dec: 45.2803, magnitude: 1.25 },
  { id: 'mimosa', name: 'Mimosa', ra: 12.7953, dec: -59.6888, magnitude: 1.25 },
  { id: 'regulus', name: 'Regulus', ra: 10.1395, dec: 11.9672, magnitude: 1.35 },
  { id: 'adhara', name: 'Adhara', ra: 6.9771, dec: -28.9721, magnitude: 1.50 },
  { id: 'castor', name: 'Castor', ra: 7.5767, dec: 31.8883, magnitude: 1.58 },
  { id: 'shaula', name: 'Shaula', ra: 17.5601, dec: -37.1038, magnitude: 1.62 },
  { id: 'gacrux', name: 'Gacrux', ra: 12.5194, dec: -57.1132, magnitude: 1.63 },
  { id: 'bellatrix', name: 'Bellatrix', ra: 5.4189, dec: 6.3497, magnitude: 1.64 },
  { id: 'elnath', name: 'Elnath', ra: 5.4382, dec: 28.6075, magnitude: 1.65 },
  { id: 'alnilam', name: 'Alnilam', ra: 5.6036, dec: -1.2019, magnitude: 1.69 },
  { id: 'dubhe', name: 'Dubhe', ra: 11.0621, dec: 61.7508, magnitude: 1.79 },
  { id: 'alnitak', name: 'Alnitak', ra: 5.6793, dec: -1.9426, magnitude: 1.74 },
  { id: 'alioth', name: 'Alioth', ra: 12.9005, dec: 55.9598, magnitude: 1.77 },
  { id: 'alkaid', name: 'Alkaid', ra: 13.7923, dec: 49.3133, magnitude: 1.86 },
  { id: 'merak', name: 'Merak', ra: 11.0307, dec: 56.3824, magnitude: 2.37 },
  { id: 'mizar', name: 'Mizar', ra: 13.3987, dec: 54.9254, magnitude: 2.23 },
  { id: 'phecda', name: 'Phecda', ra: 11.8972, dec: 53.6948, magnitude: 2.44 },
  { id: 'megrez', name: 'Megrez', ra: 12.2570, dec: 57.0326, magnitude: 3.31 },
  { id: 'mintaka', name: 'Mintaka', ra: 5.5334, dec: -0.2991, magnitude: 2.23 },
];

export const CONSTELLATIONS = [
  { name: 'Ursa Major', lines: [['dubhe', 'merak'], ['merak', 'phecda'], ['phecda', 'megrez'], ['megrez', 'alioth'], ['alioth', 'mizar'], ['mizar', 'alkaid'], ['dubhe', 'megrez']] },
  { name: 'Orion', lines: [['betelgeuse', 'bellatrix'], ['bellatrix', 'mintaka'], ['mintaka', 'alnilam'], ['alnilam', 'alnitak'], ['alnitak', 'betelgeuse'], ['rigel', 'mintaka']] },
  { name: 'Crux', lines: [['acrux', 'gacrux'], ['mimosa', 'acrux'], ['gacrux', 'mimosa']] },
  { name: 'Cygnus', lines: [['deneb', 'vega'], ['deneb', 'altair']] },
  { name: 'Gemini', lines: [['castor', 'pollux']] },
];

export function horizontalFromEquatorial(
  raHours: number,
  decDegrees: number,
  latitude: number,
  longitude: number,
  greenwichSiderealHours: number,
): { altitude: number; azimuth: number } {
  const rad = Math.PI / 180;
  const phi = latitude * rad;
  const dec = decDegrees * rad;
  const localSiderealDegrees = ((greenwichSiderealHours * 15 + longitude) % 360 + 360) % 360;
  let hourAngle = (localSiderealDegrees - raHours * 15) % 360;
  if (hourAngle > 180) hourAngle -= 360;
  if (hourAngle < -180) hourAngle += 360;
  const h = hourAngle * rad;
  const sinAltitude = Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(phi) * Math.cos(h);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAltitude))) / rad;
  const azimuth = (Math.atan2(
    -Math.cos(dec) * Math.sin(h),
    Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.cos(h) * Math.sin(phi),
  ) / rad + 360) % 360;
  return { altitude, azimuth };
}

function precessJ2000(raHours: number, decDegrees: number, date: Date): { raHours: number; decDegrees: number } {
  const julianDay = date.getTime() / 86_400_000 + 2_440_587.5;
  const t = (julianDay - 2_451_545.0) / 36_525;
  const arcsecToRad = Math.PI / (180 * 3600);
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) * arcsecToRad;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) * arcsecToRad;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) * arcsecToRad;
  const ra = raHours * 15 * Math.PI / 180;
  const dec = decDegrees * Math.PI / 180;
  const a = Math.cos(dec) * Math.sin(ra + zeta);
  const b = Math.cos(theta) * Math.cos(dec) * Math.cos(ra + zeta) - Math.sin(theta) * Math.sin(dec);
  const c = Math.sin(theta) * Math.cos(dec) * Math.cos(ra + zeta) + Math.cos(theta) * Math.sin(dec);
  const nextRa = (Math.atan2(a, b) + z + Math.PI * 2) % (Math.PI * 2);
  const nextDec = Math.asin(Math.max(-1, Math.min(1, c)));
  return { raHours: nextRa * 12 / Math.PI, decDegrees: nextDec * 180 / Math.PI };
}

export function calculateStarPositions(
  latitude: number,
  longitude: number,
  date: Date,
  greenwichSiderealHours: number,
): Star[] {
  return STAR_CATALOG.map((star) => {
    const apparentEquator = precessJ2000(star.ra, star.dec, date);
    return {
      id: star.id,
      name: star.name,
      magnitude: star.magnitude,
      ra: star.ra,
      dec: star.dec,
      ...horizontalFromEquatorial(apparentEquator.raHours, apparentEquator.decDegrees, latitude, longitude, greenwichSiderealHours),
    };
  });
}

import * as Astronomy from 'astronomy-engine';
import type { LocationInfo, SkyState } from '../types';
import { getZonedParts, zonedDateTimeToUtc } from './time';
import { calculateStarPositions } from './stars';

const AU_KM = 149_597_870.7;

function astroDate(value: { date: Date } | null): Date | null {
  return value?.date instanceof Date ? value.date : null;
}

function safeRiseSet(
  body: Astronomy.Body,
  observer: Astronomy.Observer,
  direction: number,
  start: Date,
): Date | null {
  try {
    return astroDate(Astronomy.SearchRiseSet(body, observer, direction, start, 1, 0));
  } catch {
    return null;
  }
}

function getPhaseName(angle: number, waxing: boolean): string {
  const a = ((angle % 360) + 360) % 360;
  if (a < 18 || a >= 342) return 'New Moon';
  if (a < 72) return 'Waxing Crescent';
  if (a < 108) return 'First Quarter';
  if (a < 162) return 'Waxing Gibbous';
  if (a < 198) return 'Full Moon';
  if (a < 252) return 'Waning Gibbous';
  if (a < 288) return 'Last Quarter';
  return 'Waning Crescent';
}

export function calculateSky(location: LocationInfo, date: Date): SkyState {
  const observer = new Astronomy.Observer(location.latitude, location.longitude, location.elevation || 0);
  const sunEq = Astronomy.Equator(Astronomy.Body.Sun, date, observer, true, true);
  const moonEq = Astronomy.Equator(Astronomy.Body.Moon, date, observer, true, true);
  const sunHor = Astronomy.Horizon(date, observer, sunEq.ra, sunEq.dec, 'normal');
  const moonHor = Astronomy.Horizon(date, observer, moonEq.ra, moonEq.dec, 'normal');
  const phaseAngle = Astronomy.MoonPhase(date);
  const illumination = Astronomy.Illumination(Astronomy.Body.Moon, date);
  const moonVector = Astronomy.GeoVector(Astronomy.Body.Moon, date, true);
  const distanceKm = Math.hypot(moonVector.x, moonVector.y, moonVector.z) * AU_KM;
  const local = getZonedParts(date, location.timezone);
  const midnight = zonedDateTimeToUtc(local.year, local.month, local.day, 0, 0, location.timezone);
  const sunrise = safeRiseSet(Astronomy.Body.Sun, observer, +1, midnight);
  const sunset = safeRiseSet(Astronomy.Body.Sun, observer, -1, midnight);
  const moonrise = safeRiseSet(Astronomy.Body.Moon, observer, +1, midnight);
  const moonset = safeRiseSet(Astronomy.Body.Moon, observer, -1, midnight);
  let solarNoon: Date | null = null;
  try {
    solarNoon = astroDate(Astronomy.SearchHourAngle(Astronomy.Body.Sun, observer, 0, midnight, +1).time);
  } catch {
    solarNoon = null;
  }

  let daylightHours: number | null = null;
  if (sunrise && sunset && sunset > sunrise) {
    daylightHours = (sunset.getTime() - sunrise.getTime()) / 3_600_000;
  } else if (!sunrise && !sunset) {
    try {
      const noonEq = Astronomy.Equator(Astronomy.Body.Sun, solarNoon ?? date, observer, true, true);
      const noonHor = Astronomy.Horizon(solarNoon ?? date, observer, noonEq.ra, noonEq.dec, 'normal');
      daylightHours = noonHor.altitude > 0 ? 24 : 0;
    } catch {
      daylightHours = null;
    }
  }

  const waxing = phaseAngle < 180;
  return {
    sun: { altitude: sunHor.altitude, azimuth: sunHor.azimuth, visible: sunHor.altitude > 0 },
    moon: {
      altitude: moonHor.altitude,
      azimuth: moonHor.azimuth,
      visible: moonHor.altitude > 0,
      phaseAngle,
      illumination: illumination.phase_fraction,
      phaseName: getPhaseName(phaseAngle, waxing),
      distanceKm,
      waxing,
    },
    stars: calculateStarPositions(location.latitude, location.longitude, date, Astronomy.SiderealTime(date)),
    events: { sunrise, sunset, solarNoon, moonrise, moonset, daylightHours },
    sunAltitude: sunHor.altitude,
  };
}

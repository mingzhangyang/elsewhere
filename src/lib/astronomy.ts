import { validateObserver } from '../domain/observer';
import * as Astronomy from 'astronomy-engine';
import type { LocationInfo, SkyEvents, SkyState } from '../types';
import { localDayBounds, validateInstant } from './time';
import { calculateStarPositions } from './stars';

const AU_KM = 149_597_870.7;
const DEG = Math.PI / 180;

export function getPhaseName(angle: number): string {
  const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  return names[Math.round((((angle % 360) + 360) % 360) / 45) % 8];
}

/** Every event is constrained to [local midnight, next local midnight). */
export function calculateDailyEvents(location: LocationInfo, date: Date): SkyEvents {
  validateObserver(location);
  validateInstant(date);
  const observer = new Astronomy.Observer(location.latitude, location.longitude, location.elevation);
  const { start, end } = localDayBounds(date, location.timezone);
  const search = (body: Astronomy.Body, direction: number): Date[] => {
    const events: Date[] = [];
    let cursor = start;
    while (cursor < end) {
      const event = Astronomy.SearchRiseSet(body, observer, direction, cursor, (end.getTime() - cursor.getTime()) / 86400000, 0)?.date;
      if (!event || event >= end) break;
      events.push(event);
      cursor = new Date(event.getTime() + 1000);
    }
    return events;
  };
  const rises = search(Astronomy.Body.Sun, 1);
  const sets = search(Astronomy.Body.Sun, -1);
  const edges = [...rises.map((time) => ({ time, rising: true })), ...sets.map((time) => ({ time, rising: false }))]
    .sort((a, b) => a.time.getTime() - b.time.getTime());
  const eq = Astronomy.Equator(Astronomy.Body.Sun, start, observer, true, true);
  const initiallyDay = edges.length ? !edges[0].rising
    : Astronomy.Horizon(start, observer, eq.ra, eq.dec, 'normal').altitude > -0.2666;
  let lit = initiallyDay;
  let last = start.getTime();
  let daylight = 0;
  for (const edge of edges) {
    if (lit) daylight += edge.time.getTime() - last;
    last = edge.time.getTime();
    lit = edge.rising;
  }
  if (lit) daylight += end.getTime() - last;
  const noon = Astronomy.SearchHourAngle(Astronomy.Body.Sun, observer, 0, start, 1).time.date;
  const twilight = (direction: number) => {
    const found = Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, direction, start, (end.getTime() - start.getTime()) / 86400000, -6)?.date;
    return found && found < end ? found : null;
  };
  return {
    sunrise: rises[0] ?? null, sunset: sets[0] ?? null,
    moonrise: search(Astronomy.Body.Moon, 1)[0] ?? null, moonset: search(Astronomy.Body.Moon, -1)[0] ?? null,
    solarNoon: noon < end ? noon : null, daylightHours: daylight / 3600000,
    daylightStatus: !edges.length ? (initiallyDay ? 'polar-day' : 'polar-night') : rises.length && sets.length ? 'normal' : 'partial',
    twilightDawn: twilight(1), twilightDusk: twilight(-1),
  };
}

export function calculateSky(location: LocationInfo, date: Date, events = calculateDailyEvents(location, date)): SkyState {
  validateObserver(location);
  validateInstant(date);
  const observer = new Astronomy.Observer(location.latitude, location.longitude, location.elevation);
  const sunEq = Astronomy.Equator(Astronomy.Body.Sun, date, observer, true, true);
  const moonEq = Astronomy.Equator(Astronomy.Body.Moon, date, observer, true, true);
  const sun = Astronomy.Horizon(date, observer, sunEq.ra, sunEq.dec, 'normal');
  const moon = Astronomy.Horizon(date, observer, moonEq.ra, moonEq.dec, 'normal');
  const phaseAngle = Astronomy.MoonPhase(date);
  const illumination = Astronomy.Illumination(Astronomy.Body.Moon, date);
  const sa = sun.altitude * DEG, ma = moon.altitude * DEG, az = (sun.azimuth - moon.azimuth) * DEG;
  const lightRight = Math.cos(sa) * Math.sin(az);
  const lightUp = Math.sin(sa) * Math.cos(ma) - Math.cos(sa) * Math.sin(ma) * Math.cos(az);
  return {
    sun: { altitude: sun.altitude, azimuth: sun.azimuth, visible: sun.altitude > -0.2666, distanceKm: sunEq.dist * AU_KM },
    moon: {
      altitude: moon.altitude, azimuth: moon.azimuth, visible: moon.altitude > -0.26,
      phaseAngle, illumination: illumination.phase_fraction, phaseName: getPhaseName(phaseAngle),
      distanceKm: moonEq.dist * AU_KM, waxing: phaseAngle < 180,
      brightLimbAngle: Math.atan2(lightRight, lightUp) / DEG,
    },
    stars: calculateStarPositions(location.latitude, location.longitude, date, Astronomy.SiderealTime(date)),
    events, sunAltitude: sun.altitude,
  };
}

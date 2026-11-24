import type { StarField } from './domain/stars';
export interface LocationInfo {
  id: string;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  source?: 'device';
}

export interface HorizontalPosition {
  altitude: number;
  azimuth: number;
}

export interface CelestialBody extends HorizontalPosition {
  visible: boolean;
  geometricAltitude: number;
}

export interface Star extends HorizontalPosition {
  id: string;
  name: string;
  magnitude: number;
  colorIndex?: number | null;
  ra: number;
  dec: number;
}

export type PlanetId = 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn';
/** Bodies with rise and set times: the Sun, the Moon and the planets. */
export type BodyId = 'sun' | 'moon' | PlanetId;

export interface Planet extends CelestialBody {
  id: PlanetId;
  name: string;
  /** Apparent visual magnitude (smaller is brighter). */
  magnitude: number;
  /** Illuminated fraction of the disc, 0–1. */
  illumination: number;
  /** Sun–planet–Earth angle, in degrees. */
  phaseAngle: number;
  /** Apparent distance from the observer. */
  distanceKm: number;
  /** Equatorial radius, for apparent size. */
  radiusKm: number;
  /** Angular distance from the Sun, in degrees. */
  elongation: number;
  /** East of the Sun (evening sky) or west of it (morning sky). */
  apparition: 'morning' | 'evening';
  /** Bright-limb direction, degrees clockwise from the top of the view. */
  brightLimbAngle: number;
}

export type MoonPhaseKey =
  | 'new'
  | 'waxing-crescent'
  | 'first-quarter'
  | 'waxing-gibbous'
  | 'full'
  | 'waning-gibbous'
  | 'last-quarter'
  | 'waning-crescent';

export interface RiseSet {
  rise: Date | null;
  set: Date | null;
}

export interface SkyEvents {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date | null;
  moonrise: Date | null;
  moonset: Date | null;
  daylightHours: number | null;
  daylightStatus: 'normal' | 'polar-day' | 'polar-night' | 'partial';
  twilightDawn: Date | null;
  twilightDusk: Date | null;
  /** First rise and set of each planet within the local civil day. */
  planets: Record<PlanetId, RiseSet>;
}

export interface SkyState {
  sun: CelestialBody & { distanceKm: number };
  moon: CelestialBody & {
    phaseAngle: number;
    illumination: number;
    /** Phase as a stable key; the interface names it in the active language. */
    phase: MoonPhaseKey;
    distanceKm: number;
    waxing: boolean;
    brightLimbAngle: number;
    north: [number, number, number];
    prime: [number, number, number];
  };
  /** Mercury, Venus, Mars, Jupiter and Saturn, innermost first. */
  planets: Planet[];
  stars: Star[];
  /** The rigid star sphere the renderer draws; `stars` are its positions in horizontal coordinates. */
  starField: StarField;
  events: SkyEvents;
  sunAltitude: number;
}

export interface WeatherValues {
  cloudCover: number;
  cloudLow: number;
  cloudMid: number;
  cloudHigh: number;
  visibilityKm: number;
  visibilityAvailable: boolean;
  haze: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  /** Average precipitation rate in mm/h over the source sample interval. */
  precipitation: number;
  temperature: number;
  pressure: number;
  weatherCode: number;
}

export type WeatherSource = 'current' | 'forecast' | 'recent' | 'historical';

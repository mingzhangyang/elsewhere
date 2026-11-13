export interface LocationInfo {
  id: string;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
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
}

export interface SkyState {
  sun: CelestialBody & { distanceKm: number };
  moon: CelestialBody & {
    phaseAngle: number;
    illumination: number;
    phaseName: string;
    distanceKm: number;
    waxing: boolean;
    brightLimbAngle: number;
    north: [number, number, number];
    prime: [number, number, number];
  };
  stars: Star[];
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
  precipitation: number;
  temperature: number;
  pressure: number;
  weatherCode: number;
}

export type WeatherMeasurements = {
  [K in Exclude<keyof WeatherValues, 'visibilityAvailable'>]: number | null;
};
export interface WeatherPoint {
  time: number;
  values: WeatherMeasurements;
}
export type WeatherSource = 'current' | 'forecast' | 'recent' | 'historical';
export type WeatherResult = {
  key: string;
  fetchedAt: number;
  cacheState?: 'cached' | 'stale';
  notice?: string;
} & (
  | {
      status: 'ready';
      source: Exclude<WeatherSource, 'current'>;
      start: number;
      end: number;
      hourly: WeatherPoint[];
      current?: WeatherPoint;
    }
  | { status: 'unavailable' | 'error'; message: string }
);

export interface WeatherSelection {
  status: 'loading' | 'ready' | 'partial' | 'unavailable' | 'error';
  values: WeatherMeasurements | null;
  source?: WeatherSource;
  sampledAt?: number;
  fetchedAt?: number;
  message?: string;
  cacheState?: 'cached' | 'stale';
}

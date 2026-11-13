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
}

export interface Star extends HorizontalPosition {
  id: string;
  name: string;
  magnitude: number;
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
}

export interface SkyState {
  sun: CelestialBody;
  moon: CelestialBody & {
    phaseAngle: number;
    illumination: number;
    phaseName: string;
    distanceKm: number;
    waxing: boolean;
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

export interface WeatherPoint {
  time: number; // Unix epoch milliseconds, independent of daylight-saving transitions
  values: WeatherValues;
}

export interface WeatherResult {
  available: boolean;
  source: 'current' | 'forecast' | 'historical' | 'unavailable';
  values: WeatherValues;
  hourly?: WeatherPoint[];
  message?: string;
}

import type { LocationInfo, WeatherValues } from '../types';
import { validateObserver } from '../domain/observer';
import { validateInstant } from './time';
import { defaultWeatherValues } from './weather';

export interface LayerSettings {
  stars: boolean;
  lines: boolean;
  labels: boolean;
}
export interface CameraView {
  heading: number;
  altitude: number;
  fov: number;
}
export interface Preferences {
  version: 1;
  layers: LayerSettings;
  saved: LocationInfo[];
  recent: LocationInfo[];
  hintDismissed: boolean;
  reducedMotion: boolean;
  quality: 'auto' | 'low' | 'high';
  horizon: 'flat' | 'ridge';
  skyBrightness: 'dark' | 'suburban' | 'city';
}
export interface Exploration {
  version: 1;
  location: LocationInfo;
  instant: string;
  camera: CameraView;
  layers: LayerSettings;
  custom: WeatherValues | null;
  clearSky?: boolean;
}
const KEY = 'elsewhere.preferences.v1';
const defaults = (): Preferences => ({
  version: 1,
  layers: { stars: true, lines: false, labels: true },
  saved: [],
  recent: [],
  hintDismissed: false,
  reducedMotion: false,
  quality: 'auto',
  horizon: 'ridge',
  skyBrightness: 'dark',
});
function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function locationValue(value: unknown): LocationInfo {
  if (
    !isObject(value) ||
    !['id', 'name', 'country', 'timezone'].every((key) => typeof value[key] === 'string') ||
    String(value.name).length > 160
  )
    throw new Error('Invalid saved place');
  const candidate = value as unknown as LocationInfo;
  validateObserver(candidate);
  return {
    id: candidate.id,
    name: candidate.name,
    country: candidate.country,
    timezone: candidate.timezone,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    elevation: candidate.elevation,
  };
}
function layerValue(value: unknown): LayerSettings {
  if (!isObject(value) || !['stars', 'lines', 'labels'].every((key) => typeof value[key] === 'boolean'))
    throw new Error('Invalid layers');
  return { stars: Boolean(value.stars), lines: Boolean(value.lines), labels: Boolean(value.labels) };
}
export function loadPreferences(): { value: Preferences; notice: string } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { value: defaults(), notice: '' };
    const data: unknown = JSON.parse(raw);
    if (!isObject(data) || data.version !== 1 || !Array.isArray(data.saved) || !Array.isArray(data.recent))
      throw new Error('Invalid preferences');
    return {
      value: {
        version: 1,
        layers: layerValue(data.layers),
        saved: data.saved.slice(0, 30).map(locationValue),
        recent: data.recent.slice(0, 6).map(locationValue),
        hintDismissed: data.hintDismissed === true,
        reducedMotion: data.reducedMotion === true,
        horizon: data.horizon === 'flat' ? 'flat' : 'ridge',
        skyBrightness:
          data.skyBrightness === 'city' || data.skyBrightness === 'suburban' ? data.skyBrightness : 'dark',
        quality: data.quality === 'low' || data.quality === 'high' ? data.quality : 'auto',
      },
      notice: '',
    };
  } catch {
    return { value: defaults(), notice: 'Saved settings could not be read. Default settings are active.' };
  }
}
export function savePreferences(value: Preferences): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function parseExploration(hash: string): { value: Exploration | null; notice: string } {
  if (!hash.startsWith('#sky=')) return { value: null, notice: '' };
  try {
    if (hash.length > 6000) throw new Error('Oversized link');
    const data: unknown = JSON.parse(decodeURIComponent(hash.slice(5)));
    if (!isObject(data) || data.version !== 1 || typeof data.instant !== 'string' || !isObject(data.camera))
      throw new Error('Invalid link');
    validateInstant(new Date(data.instant));
    const camera = data.camera as unknown as CameraView;
    if (
      ![camera.heading, camera.altitude, camera.fov].every(Number.isFinite) ||
      Math.abs(camera.altitude) > 90 ||
      camera.fov < 20 ||
      camera.fov > 92 ||
      camera.heading < 0 ||
      camera.heading >= 360
    )
      throw new Error('Invalid camera');
    let custom: WeatherValues | null = null;
    if (data.custom !== null) {
      if (!isObject(data.custom)) throw new Error('Invalid weather');
      const limits: Record<Exclude<keyof WeatherValues, 'visibilityAvailable'>, [number, number]> = {
        cloudCover: [0, 100],
        cloudLow: [0, 100],
        cloudMid: [0, 100],
        cloudHigh: [0, 100],
        visibilityKm: [0, 200],
        haze: [0, 100],
        humidity: [0, 100],
        windSpeed: [0, 500],
        windDirection: [0, 360],
        precipitation: [0, 500],
        temperature: [-100, 100],
        pressure: [100, 1200],
        weatherCode: [0, 99],
      };
      custom = defaultWeatherValues();
      for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
        const v = data.custom[key];
        const [min, max] = limits[key];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
          throw new Error('Invalid weather field');
        custom[key] = v;
      }
      custom.visibilityAvailable = true;
    }
    if (data.clearSky !== undefined && typeof data.clearSky !== 'boolean')
      throw new Error('Invalid preview mode');
    return {
      value: {
        version: 1,
        location: locationValue(data.location),
        instant: data.instant,
        camera: { ...camera },
        layers: layerValue(data.layers),
        custom,
        ...(data.clearSky === undefined ? {} : { clearSky: data.clearSky }),
      },
      notice: '',
    };
  } catch {
    return { value: null, notice: 'This sky link is invalid or unsupported. A fresh exploration is open.' };
  }
}
export function explorationUrl(exploration: Exploration): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = `sky=${encodeURIComponent(JSON.stringify(exploration))}`;
  return url.toString();
}

import type { AppNotice, LocationInfo, WeatherValues } from '../types';
import { isLanguageSetting, type LanguageSetting } from '../i18n/locale';
import type { SkyBrightness } from '../domain/starVisibility';
import { validateObserver } from '../domain/observer';
import { validateInstant } from '../domain/time';
import { defaultWeatherValues } from '../domain/weather';
import { isDeviceLocation, normalizeLocation } from './locations';

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
/** Vertical field of view limits, in degrees. The narrow end frames the Sun or Moon in detail. */
export const MIN_FOV = 2;
export const MAX_FOV = 92;
export const DEFAULT_FOV = 66;
/** One zoom-in step (button or key) narrows the view by this factor. */
export const ZOOM_STEP = 0.8;
export interface Preferences {
  version: 1;
  layers: LayerSettings;
  saved: LocationInfo[];
  recent: LocationInfo[];
  hintDismissed: boolean;
  reducedMotion: boolean;
  quality: 'auto' | 'low' | 'high';
  horizon: 'flat' | 'ridge';
  skyBrightness: SkyBrightness;
  moonDisplayAid: boolean;
  /**
   * Interface language: 'auto' follows the browser. Added within version 1: preferences saved
   * before it existed have no value and read as 'auto'.
   */
  language: LanguageSetting;
}
export interface Exploration {
  version: 1;
  location: LocationInfo;
  instant: string;
  camera: CameraView;
  layers: LayerSettings;
  custom: WeatherValues | null;
  clearSky?: boolean;
  /**
   * The object centered with its summary card (the Sun, the Moon, a planet or a catalog star id).
   * Optional, so older links stay valid and older app versions ignore it.
   */
  focus?: string;
  /**
   * What the link is about (ROADMAP phase 3 prototype): an object id as in `focus`, or a line
   * pattern as `pattern:<id>`. A link with a subject opens with the camera turning to it. Optional
   * and still version 1: older links have none, and older app versions ignore it and open on the
   * camera view, which already faces the subject. Whether it stays in this form is an open decision
   * for phase 4 (see ROADMAP.md).
   */
  subject?: string;
}
/** Object ids: 'sun', 'moon', planet names and HYG ids such as 'hyg-32263'. */
const OBJECT_ID = /^[a-z0-9-]{1,40}$/;
const SUBJECT = /^(pattern:)?[a-z0-9-]{1,40}$/;
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
  moonDisplayAid: true,
  language: 'auto',
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
  return normalizeLocation({
    id: candidate.id,
    name: candidate.name,
    country: candidate.country,
    timezone: candidate.timezone,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    elevation: candidate.elevation,
    ...(candidate.source === 'device' ? { source: 'device' as const } : {}),
  });
}
function layerValue(value: unknown): LayerSettings {
  if (!isObject(value) || !['stars', 'lines', 'labels'].every((key) => typeof value[key] === 'boolean'))
    throw new Error('Invalid layers');
  return { stars: Boolean(value.stars), lines: Boolean(value.lines), labels: Boolean(value.labels) };
}
export function loadPreferences(): { value: Preferences; notice: AppNotice } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { value: defaults(), notice: null };
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
        moonDisplayAid: data.moonDisplayAid !== false,
        language: isLanguageSetting(data.language) ? data.language : 'auto',
      },
      notice: null,
    };
  } catch {
    return { value: defaults(), notice: { code: 'preferences-unreadable' } };
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
/**
 * Shared links carry no language: whoever opens one reads it in their own. A language field from
 * anywhere else is ignored, like any unknown field.
 */
export function parseExploration(hash: string): { value: Exploration | null; notice: AppNotice } {
  if (!hash.startsWith('#sky=')) return { value: null, notice: null };
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
      camera.fov < MIN_FOV ||
      camera.fov > MAX_FOV ||
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
    if (data.focus !== undefined && (typeof data.focus !== 'string' || !OBJECT_ID.test(data.focus)))
      throw new Error('Invalid focus');
    if (data.subject !== undefined && (typeof data.subject !== 'string' || !SUBJECT.test(data.subject)))
      throw new Error('Invalid subject');
    return {
      value: {
        version: 1,
        location: locationValue(data.location),
        instant: data.instant,
        camera: { ...camera },
        layers: layerValue(data.layers),
        custom,
        ...(data.clearSky === undefined ? {} : { clearSky: data.clearSky }),
        ...(data.focus === undefined ? {} : { focus: data.focus }),
        ...(data.subject === undefined ? {} : { subject: data.subject }),
      },
      notice: null,
    };
  } catch {
    return { value: null, notice: { code: 'invalid-link' } };
  }
}
/**
 * Device coordinates rounded to city level (0.1°, about 11 km) for sharing, unless the person chooses
 * to share them exactly (ROADMAP principle 4). Other places are named places and are kept as they are.
 */
export function cityLevel(location: LocationInfo): LocationInfo {
  if (!isDeviceLocation(location)) return location;
  const round = (value: number) => Math.round(value * 10) / 10;
  return normalizeLocation({
    ...location,
    latitude: round(location.latitude),
    longitude: round(location.longitude),
    elevation: Math.round(location.elevation),
  });
}
export function explorationUrl(exploration: Exploration): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = `sky=${encodeURIComponent(JSON.stringify(exploration))}`;
  return url.toString();
}

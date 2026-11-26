import type { CameraView, LayerSettings } from './contracts';
import type { WeatherValues } from './types';
import { defaultWeatherValues } from './domain/weather';
import { invalidInput } from './errors';

export function validateView(view: CameraView): void {
  if (
    ![view.heading, view.altitude, view.fov].every(Number.isFinite) ||
    view.heading < 0 ||
    view.heading >= 360 ||
    Math.abs(view.altitude) > 90 ||
    view.fov < 2 ||
    view.fov > 92
  ) {
    throw invalidInput('Invalid camera view.');
  }
}

export function validateAspect(aspect: number): void {
  if (!Number.isFinite(aspect) || aspect < 0.1 || aspect > 10) {
    throw invalidInput('Aspect must be between 0.1 and 10.');
  }
}

export function mergeLayers(base: LayerSettings, overrides?: Partial<LayerSettings>): LayerSettings {
  const layers = { ...base, ...overrides };
  if (![layers.stars, layers.lines, layers.labels].every((value) => typeof value === 'boolean')) {
    throw invalidInput('Invalid sky layer setting.');
  }
  return layers;
}

export function validateWeather(weather: WeatherValues): void {
  const defaults = defaultWeatherValues();
  for (const key of Object.keys(defaults) as (keyof WeatherValues)[]) {
    const value = weather[key];
    if (typeof defaults[key] === 'boolean' ? typeof value !== 'boolean' : !Number.isFinite(value)) {
      throw invalidInput('Invalid weather field: ' + key);
    }
  }
  for (const value of [
    weather.cloudCover,
    weather.cloudLow,
    weather.cloudMid,
    weather.cloudHigh,
    weather.haze,
    weather.humidity,
  ]) {
    if (value < 0 || value > 100) throw invalidInput('Weather percentages must be between 0 and 100.');
  }
  if (weather.visibilityKm < 0 || weather.windSpeed < 0 || weather.precipitation < 0) {
    throw invalidInput('Invalid negative weather value.');
  }
}

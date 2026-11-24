import type { WeatherValues } from '../types';

export const defaultWeatherValues = (): WeatherValues => ({
  cloudCover: 0,
  cloudLow: 0,
  cloudMid: 0,
  cloudHigh: 0,
  visibilityKm: 30,
  visibilityAvailable: false,
  haze: 0,
  humidity: 50,
  windSpeed: 0,
  windDirection: 0,
  precipitation: 0,
  temperature: 15,
  pressure: 1013,
  weatherCode: 0,
});

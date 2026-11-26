import type { LocationInfo } from '../types';
import { invalidInput, SkyEngineError } from '../errors';

export function validateObserver(location: LocationInfo): void {
  if (
    !Number.isFinite(location.latitude) ||
    Math.abs(location.latitude) > 90 ||
    !Number.isFinite(location.longitude) ||
    Math.abs(location.longitude) > 180 ||
    !Number.isFinite(location.elevation) ||
    location.elevation < -500 ||
    location.elevation > 10000
  ) {
    throw invalidInput('Choose valid coordinates and an elevation between −500 and 10,000 meters.');
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: location.timezone }).format();
  } catch (error) {
    // The runtime's RangeError for an unknown time zone, reported with its own message.
    const message = error instanceof Error ? error.message : 'Unknown time zone.';
    throw new SkyEngineError('INVALID_INPUT', message, { cause: error });
  }
}

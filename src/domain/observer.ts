import type { LocationInfo } from '../types';

export function validateObserver(location: LocationInfo): void {
  if (!Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90
    || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180
    || !Number.isFinite(location.elevation) || location.elevation < -500 || location.elevation > 10000) {
    throw new RangeError('Choose valid coordinates and an elevation between −500 and 10,000 meters.');
  }
  new Intl.DateTimeFormat('en', { timeZone: location.timezone }).format();
}

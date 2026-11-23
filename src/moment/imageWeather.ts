import type { MomentSnapshot } from '../lib/moment';
import { presentedWeather } from '../lib/explorationState';

/**
 * Image-only sky. The original moment, real live weather, and shared exploration stay untouched.
 * Import this with the lazily loaded MomentImage, not the explorer startup code.
 */
export function momentImageSnapshot(snapshot: MomentSnapshot, clearSky: boolean): MomentSnapshot {
  if (!clearSky) return snapshot;
  return {
    ...snapshot,
    weather: presentedWeather(snapshot.weather, true),
    provenance: { kind: 'clear' },
  };
}

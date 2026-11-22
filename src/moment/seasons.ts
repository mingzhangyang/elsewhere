import { getZonedParts } from '../domain/time';
import type { MomentSnapshot } from '../lib/moment';

export type LandscapeSeason = 'spring' | 'summer' | 'autumn' | 'winter';

export function landscapeSeason({
  instant,
  location,
}: Pick<MomentSnapshot, 'instant' | 'location'>): LandscapeSeason {
  // The tropical illustration stays green through the year. Snow and leaf fall are temperate cues.
  if (Math.abs(location.latitude) <= 23.44) return 'summer';
  const { month } = getZonedParts(instant, location.timezone);
  const offset = location.latitude < 0 ? 6 : 0;
  return (['winter', 'spring', 'summer', 'autumn'] as const)[Math.floor(((month + offset) % 12) / 3)];
}

export const seasonalColours = {
  spring: { turf: '#9fad71', leaf: '#c3d982', shallow: '#83c8b7', sea: '#377d79', sand: '#e2cda2' },
  summer: { turf: '#6d914e', leaf: '#b5cf65', shallow: '#4fc4b5', sea: '#145c85', sand: '#f0d2a1' },
  autumn: { turf: '#ae854c', leaf: '#d5793b', shallow: '#8ea89c', sea: '#406e70', sand: '#dbb98b' },
  winter: { turf: '#b8c4bc', leaf: '#a6a19a', shallow: '#9cbac0', sea: '#5a6d81', sand: '#c1b5a3' },
};

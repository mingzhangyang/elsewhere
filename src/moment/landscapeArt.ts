import type { LandscapeSeason } from './seasons';

const assets = import.meta.glob<string>('../assets/{waterfront,valley,coast}/*.webp', {
  eager: true,
  import: 'default',
});

// The shared moment already carries the Sun's local horizon coordinates.
// In twilight an eastern Sun is rising and a western Sun is setting.
export function landscapeLight(altitude: number, azimuth: number) {
  if (altitude >= 6) return 'day';
  if (altitude < -6) return 'night';
  return azimuth < 180 ? 'dawn' : 'dusk';
}

export async function loadLandscapeArt(
  scene: 'city' | 'mountains' | 'sea',
  season: LandscapeSeason,
  altitude: number,
  azimuth: number,
) {
  const image = new Image();
  const folder = { city: 'waterfront', mountains: 'valley', sea: 'coast' }[scene];
  const light = landscapeLight(altitude, azimuth);
  image.src = assets[`../assets/${folder}/${season}-${light}.webp`];
  await image.decode();
  return image;
}

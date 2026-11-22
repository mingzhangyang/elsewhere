import dawn from '../assets/waterfront/dawn.webp';
import day from '../assets/waterfront/day.webp';
import dusk from '../assets/waterfront/dusk.webp';
import night from '../assets/waterfront/night.webp';

import alpineDawn from '../assets/valley/dawn.webp';
import alpineDay from '../assets/valley/day.webp';
import alpineDusk from '../assets/valley/dusk.webp';
import alpineNight from '../assets/valley/night.webp';

const scenes = {
  city: { dawn, day, dusk, night },
  mountains: { dawn: alpineDawn, day: alpineDay, dusk: alpineDusk, night: alpineNight },
};

// The shared moment already carries the Sun's local horizon coordinates.
// In twilight an eastern Sun is rising and a western Sun is setting.
export function landscapeLight(altitude: number, azimuth: number) {
  if (altitude >= 6) return 'day';
  if (altitude < -6) return 'night';
  return azimuth < 180 ? 'dawn' : 'dusk';
}

export async function loadLandscapeArt(scene: keyof typeof scenes, altitude: number, azimuth: number) {
  const image = new Image();
  image.src = scenes[scene][landscapeLight(altitude, azimuth)];
  await image.decode();
  return image;
}

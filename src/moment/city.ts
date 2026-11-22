import dawn from '../assets/waterfront/dawn.webp';
import day from '../assets/waterfront/day.webp';
import dusk from '../assets/waterfront/dusk.webp';
import night from '../assets/waterfront/night.webp';

// The shared moment already carries the Sun's local horizon coordinates.
// In twilight an eastern Sun is rising and a western Sun is setting.
export function cityLight(altitude: number, azimuth: number) {
  if (altitude >= 6) return 'day';
  if (altitude < -6) return 'night';
  return azimuth < 180 ? 'dawn' : 'dusk';
}

export async function loadCityImage(altitude: number, azimuth: number) {
  const image = new Image();
  image.src = { dawn, day, dusk, night }[cityLight(altitude, azimuth)];
  await image.decode();
  return image;
}

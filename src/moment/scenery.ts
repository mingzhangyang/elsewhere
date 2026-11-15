import { ridgeAltitude } from '../renderer/ridge';

/**
 * Horizon variants for the sky-moment test (ROADMAP phase 3): the renderer's ridge against three
 * of the illustrative silhouettes planned for phase 5. Each is a top edge, in degrees of altitude
 * by azimuth, kept under 2° so it never hides an object the app reports as visible.
 */
export type HorizonVariant = 'ridge' | 'mountains' | 'sea' | 'city';
export const HORIZON_VARIANTS: HorizonVariant[] = ['ridge', 'mountains', 'sea', 'city'];

/** Deterministic noise in [0, 1) from an integer. */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Top edge of the silhouette, in degrees of altitude, at `azimuth` degrees. */
export function horizonAltitude(variant: HorizonVariant, azimuth: number): number {
  const a = ((azimuth % 360) + 360) % 360;
  switch (variant) {
    case 'ridge':
      return ridgeAltitude(a);
    case 'mountains': {
      // Overlapping triangular peaks of seeded heights, one every 9°, under 1.9°.
      let top = 0.15;
      for (let k = -1; k <= 1; k++) {
        const i = Math.floor(a / 9) + k;
        const centre = i * 9 + 4.5 + (hash(i) - 0.5) * 4;
        const height = 0.5 + hash(i + 1000) * 1.4;
        const width = 6 + hash(i + 2000) * 6;
        top = Math.max(top, height * (1 - Math.abs(a - centre) / width));
      }
      return Math.min(1.9, top);
    }
    case 'sea':
      return 0;
    case 'city': {
      // Blocks 1.5° wide; most are low, some are towers. Gaps toward open country.
      const i = Math.floor(a / 1.5);
      const r = hash(i);
      if (hash(Math.floor(a / 40) + 500) < 0.25) return 0.1;
      return r > 0.85 ? 1.2 + hash(i + 7) * 0.7 : 0.25 + r * 0.6;
    }
  }
}

/** Azimuth step for drawing a variant's edge: fine enough for the city's square corners. */
export const HORIZON_STEP: Record<HorizonVariant, number> = { ridge: 1, mountains: 0.5, sea: 5, city: 0.25 };

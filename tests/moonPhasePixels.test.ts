import * as Astronomy from 'astronomy-engine';
import { describe, expect, it } from 'vitest';
import type { MomentSnapshot } from '../packages/sky-engine/src/contracts';
import { calculateSky } from '../src/domain/astronomy';
import { moonPortraitPixels } from '../packages/sky-engine/src/moment/moonPhase';
import { referenceMoonPixels, type ReferenceTexture } from './fixtures/moonPhaseReference';

// The optimised lunar renderer (lookup tables, hoisted row and column terms, whole-pixel writes)
// must match the frozen 0.3.0 pixel loop: every RGB channel within 1, alpha identical.
const location = {
  id: 'test',
  latitude: 39.14,
  longitude: -77.2,
  elevation: 0,
  timezone: 'America/New_York',
  name: 'Test',
  country: 'US',
};

function phaseScene(longitude: number, offsetDays = 0): Pick<MomentSnapshot, 'sky'> {
  const found = Astronomy.SearchMoonPhase(longitude, new Date('2026-01-01T00:00:00Z'), 40);
  if (!found) throw new Error('No lunar phase found.');
  return { sky: calculateSky(location, new Date(found.date.getTime() + offsetDays * 86400000)) };
}

// A worst case for the interpolation: independent random bytes in every texel and channel.
function noiseTexture(width: number, height: number): ReferenceTexture {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 20260101;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    data[i] = (i & 3) === 3 ? 255 : seed >> 23;
  }
  return { width, height, data };
}

const phases = {
  crescent: phaseScene(0, 1.5),
  'first quarter': phaseScene(90),
  full: phaseScene(180),
  'last quarter': phaseScene(270),
  'waning crescent': phaseScene(0, -2),
};
const texture = noiseTexture(2048, 1024);
const orientations = ['observer', 'north-up'] as const;
const backgrounds = ['transparent', 'dark', 'light'] as const;

function compare(
  size: number,
  scene: Pick<MomentSnapshot, 'sky'>,
  options: Parameters<typeof moonPortraitPixels>[3],
) {
  const expected = referenceMoonPixels(size, size, scene, options, texture);
  const actual = moonPortraitPixels(size, size, scene, options, texture);
  expect(actual.length).toBe(expected.length);
  let rgb = 0;
  let alpha = 0;
  for (let i = 0; i < expected.length; i++) {
    const difference = Math.abs(actual[i] - expected[i]);
    if ((i & 3) === 3) alpha = Math.max(alpha, difference);
    else rgb = Math.max(rgb, difference);
  }
  return { rgb, alpha };
}

describe('optimised Moon portrait pixels', () => {
  it('covers distinct phases', () => {
    const illumination = Object.values(phases).map((scene) => scene.sky.moon.illumination);
    expect(Math.min(...illumination)).toBeLessThan(0.15);
    expect(Math.max(...illumination)).toBeGreaterThan(0.99);
  });

  for (const [phase, scene] of Object.entries(phases)) {
    it(`matches the reference at 512 px: ${phase}`, () => {
      for (const orientation of orientations) {
        for (const background of backgrounds) {
          for (const earthshine of [false, true]) {
            const label = `${orientation} ${background} earthshine=${earthshine}`;
            const result = compare(512, scene, { orientation, background, earthshine });
            expect(result.alpha, label).toBe(0);
            expect(result.rgb, label).toBeLessThanOrEqual(1);
          }
        }
      }
    });

    it(`matches the reference at 2048 px: ${phase}`, { timeout: 60000 }, () => {
      let b = Object.keys(phases).indexOf(phase);
      for (const orientation of orientations) {
        for (const earthshine of [false, true]) {
          // Each phase still meets every background at this size, without the full product.
          const background = backgrounds[b++ % backgrounds.length];
          const label = `${orientation} ${background} earthshine=${earthshine}`;
          const result = compare(2048, scene, { orientation, background, earthshine });
          expect(result.alpha, label).toBe(0);
          expect(result.rgb, label).toBeLessThanOrEqual(1);
        }
      }
    });
  }

  it('also matches for a canvas that is not square and a small texture', () => {
    const small = noiseTexture(64, 32);
    for (const [width, height] of [
      [301, 517],
      [640, 360],
    ]) {
      for (const background of backgrounds) {
        const options = { orientation: 'observer', background, earthshine: true } as const;
        const expected = referenceMoonPixels(width, height, phases.crescent, options, small);
        const actual = moonPortraitPixels(width, height, phases.crescent, options, small);
        for (let i = 0; i < expected.length; i++) {
          const limit = (i & 3) === 3 ? 0 : 1;
          if (Math.abs(actual[i] - expected[i]) > limit) {
            throw new Error(`${width}x${height} ${background}: byte ${i} ${actual[i]} != ${expected[i]}`);
          }
        }
      }
    }
  });
});

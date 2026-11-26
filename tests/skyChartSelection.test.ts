import { describe, expect, it } from 'vitest';
import { INVALID_INPUT } from './skyEngineErrorMatchers';
import {
  DEFAULT_SKY_CHART_LIMITING_MAGNITUDE,
  SKY_CHART_MAGNITUDE_RANGE,
  SkyChartCatalogNotReadyError,
  selectSkyChartObjects,
  type SkyChartCandidates,
} from '../src/domain/skyChartSelection';
import { projectSkyChart } from '../src/domain/skyChartProjection';
import { limitingMagnitude, starVisibilityFactors, twilightVisibility } from '../src/domain/starVisibility';
import type { SkyState } from '../src/types';

const star = (id: string, altitude = 30, magnitude = 5, azimuth = 90) => ({
  id,
  name: id,
  altitude,
  azimuth,
  magnitude,
  colorIndex: 0.5,
});

const candidates = (overrides: Partial<SkyChartCandidates> = {}): SkyChartCandidates => ({
  sun: { altitude: -30, azimuth: 0 },
  moon: { altitude: -20, azimuth: 180 },
  planets: [],
  stars: [],
  starCatalogReady: true,
  ...overrides,
});

const ids = (input: SkyChartCandidates, limitingMagnitude?: number) =>
  selectSkyChartObjects(
    input,
    limitingMagnitude === undefined ? undefined : { limitingMagnitude },
  ).objects.map((object) => object.id);

const untrusted = (value: unknown) => value as SkyChartCandidates;

describe('SM2-B independent sky chart object selection', () => {
  it('includes the apparent-center horizon, just-above-horizon centers and zenith', () => {
    const input = candidates({
      sun: { altitude: 0, azimuth: 0 },
      moon: { altitude: Number.MIN_VALUE, azimuth: 90 },
      planets: [{ id: 'mars', altitude: 90, azimuth: 180 }],
      stars: [star('horizon', 0, 6)],
    });
    expect(ids(input)).toEqual(['sun', 'moon', 'mars', 'horizon']);
  });

  it('excludes centers just below 0 degrees for all four object kinds', () => {
    const input = candidates({
      sun: { altitude: -Number.MIN_VALUE, azimuth: 0 },
      moon: { altitude: -0.000001, azimuth: 0 },
      planets: [{ id: 'venus', altitude: -0.001, azimuth: 0 }],
      stars: [star('below', -0.000001), star('above', 0.000001)],
    });
    expect(ids(input)).toEqual(['above']);
  });

  it('uses an inclusive default magnitude of 6.0 only for stars', () => {
    const input = candidates({
      stars: [star('equals', 45, 6), star('fainter', 45, 6.000001)],
    });
    expect(DEFAULT_SKY_CHART_LIMITING_MAGNITUDE).toBe(6);
    expect(selectSkyChartObjects(input).limitingMagnitude).toBe(6);
    expect(ids(input)).toEqual(['equals']);
  });

  it('applies custom limits, inclusive of both documented legal endpoints', () => {
    const input = candidates({
      stars: [star('bright', 45, -5), star('medium', 45, 6), star('faint', 45, 20)],
    });
    expect(SKY_CHART_MAGNITUDE_RANGE).toEqual({ min: -5, max: 20 });
    expect(ids(input, -5)).toEqual(['bright']);
    expect(ids(input, 5)).toEqual(['bright']);
    expect(ids(input, 6)).toEqual(['bright', 'medium']);
    expect(ids(input, 20)).toEqual(['bright', 'faint', 'medium']);
  });

  it('rejects invalid custom limits, including explicit null rather than defaulting', () => {
    for (const limitingMagnitude of [-5.0001, 20.0001, NaN, Infinity, -Infinity, null, '6']) {
      expect(() => selectSkyChartObjects(candidates(), { limitingMagnitude } as never)).toThrow(
        INVALID_INPUT,
      );
    }
    expect(() => selectSkyChartObjects(candidates(), null as never)).toThrow(INVALID_INPUT);
  });

  it('never applies a stellar magnitude cutoff to Sun, Moon, or the five planets', () => {
    const input = candidates({
      sun: { altitude: 3, azimuth: 30 },
      moon: { altitude: 4, azimuth: 50 },
      planets: [
        { id: 'saturn', altitude: 7, azimuth: 70 },
        { id: 'jupiter', altitude: 6, azimuth: 60 },
        { id: 'mars', altitude: 5, azimuth: 50 },
        { id: 'venus', altitude: 4, azimuth: 40 },
        { id: 'mercury', altitude: 3, azimuth: 30 },
      ],
      stars: [star('faint', 4, 12)],
    });
    expect(ids(input, -5)).toEqual(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn']);
  });

  it('ignores visible flags and geometric altitudes even at a solar/lunar limb crossing', () => {
    const sun = { altitude: -0.1, azimuth: 10, visible: true, geometricAltitude: 1 };
    const moon = { altitude: 0, azimuth: 20, visible: false, geometricAltitude: -0.6 };
    const venus = {
      id: 'venus' as const,
      altitude: 0,
      azimuth: 30,
      visible: false,
      geometricAltitude: -1,
    };
    expect(ids(candidates({ sun, moon, planets: [venus] }))).toEqual(['moon', 'venus']);
  });

  it('includes a daytime star while the real explorer visibility model hides it', () => {
    const input = candidates({
      sun: { altitude: 50, azimuth: 20 },
      stars: [star('daytime', 45, 5.8)],
    });
    expect(ids(input)).toEqual(['sun', 'daytime']);
    expect(twilightVisibility(50)).toBe(0);
    expect(
      starVisibilityFactors(
        { altitude: 45, magnitude: 5.8 },
        { sunAltitude: 50, moon: { altitude: -20, illumination: 0 } as SkyState['moon'] },
        { visibilityKm: 60, haze: 0 },
        'dark',
      ).combined,
    ).toBe(0);
  });

  it('includes stars in full moonlight and city light pollution unlike the explorer', () => {
    const input = candidates({
      moon: { altitude: 80, azimuth: 30 },
      stars: [star('urban', 45, 5.5)],
    });
    expect(ids(input)).toEqual(['moon', 'urban']);
    expect(limitingMagnitude('city', { altitude: 80, illumination: 1 })).toBeLessThan(5.5);
    expect(
      starVisibilityFactors(
        { altitude: 45, magnitude: 5.5 },
        { sunAltitude: -30, moon: { altitude: 80, illumination: 1 } as SkyState['moon'] },
        { visibilityKm: 60, haze: 0 },
        'city',
      ).combined,
    ).toBe(0);
  });

  it('ignores unrelated weather, daylight, moonlight and light-pollution input context', () => {
    const input = candidates({ stars: [star('weatherproof', 20, 5.95)] });
    const baseline = selectSkyChartObjects(input);
    for (const environment of [
      { weather: 'clear', skyBrightness: 'dark', moonAltitude: -50, sunAltitude: -25 },
      { weather: 'rain', skyBrightness: 'city', moonAltitude: 80, sunAltitude: 35 },
      { weather: 'cloudy', skyBrightness: 'suburban', moonAltitude: 60, sunAltitude: 0 },
    ]) {
      expect(selectSkyChartObjects({ ...input, ...environment })).toEqual(baseline);
    }
  });

  it('rejects missing or damaged object collections and readiness flags', () => {
    for (const value of [
      null,
      {},
      { ...candidates(), sun: null },
      { ...candidates(), moon: undefined },
      { ...candidates(), planets: undefined },
      { ...candidates(), stars: null },
      { ...candidates(), starCatalogReady: undefined },
      { ...candidates(), starCatalogReady: 'ready' },
    ]) {
      expect(() => selectSkyChartObjects(untrusted(value))).toThrow();
    }
  });

  it('distinguishes an unready catalog from ready-but-empty matches', () => {
    expect(() => selectSkyChartObjects(candidates({ starCatalogReady: false }))).toThrow(
      SkyChartCatalogNotReadyError,
    );
    expect(selectSkyChartObjects(candidates()).objects).toEqual([]);
    expect(ids(candidates({ stars: [star('below', -10)] }))).toEqual([]);
  });

  it('rejects non-finite or physically impossible apparent altitudes for every kind', () => {
    for (const altitude of [-90.00001, 90.00001, NaN, Infinity, -Infinity]) {
      expect(() => selectSkyChartObjects(candidates({ sun: { altitude, azimuth: 0 } }))).toThrow(
        INVALID_INPUT,
      );
      expect(() => selectSkyChartObjects(candidates({ moon: { altitude, azimuth: 0 } }))).toThrow(
        INVALID_INPUT,
      );
      expect(() =>
        selectSkyChartObjects(candidates({ planets: [{ id: 'mars', altitude, azimuth: 0 }] })),
      ).toThrow(INVALID_INPUT);
      expect(() => selectSkyChartObjects(candidates({ stars: [star('bad', altitude)] }))).toThrow(
        INVALID_INPUT,
      );
    }
  });

  it('rejects non-finite azimuth even when a center is already below the horizon', () => {
    for (const azimuth of [NaN, Infinity, -Infinity]) {
      expect(() => selectSkyChartObjects(candidates({ sun: { altitude: -5, azimuth } }))).toThrow(
        INVALID_INPUT,
      );
      expect(() => selectSkyChartObjects(candidates({ moon: { altitude: 90, azimuth } }))).toThrow(
        INVALID_INPUT,
      );
      expect(() =>
        selectSkyChartObjects(candidates({ planets: [{ id: 'mars', altitude: -4, azimuth }] })),
      ).toThrow(INVALID_INPUT);
      expect(() => selectSkyChartObjects(candidates({ stars: [star('bad', -5, 50, azimuth)] }))).toThrow(
        INVALID_INPUT,
      );
    }
  });

  it('rejects non-finite/non-numeric stellar magnitudes and corrupted colors before filtering', () => {
    for (const magnitude of [NaN, Infinity, -Infinity, null, '5']) {
      expect(() =>
        selectSkyChartObjects(candidates({ stars: [{ ...star('bad', -1), magnitude }] as never })),
      ).toThrow(INVALID_INPUT);
    }
    for (const colorIndex of [NaN, Infinity, 'red']) {
      expect(() =>
        selectSkyChartObjects(candidates({ stars: [{ ...star('bad', -1), colorIndex }] as never })),
      ).toThrow(INVALID_INPUT);
    }
    expect(() =>
      selectSkyChartObjects(candidates({ stars: [{ ...star('bad'), name: null }] as never })),
    ).toThrow(INVALID_INPUT);
    expect(
      selectSkyChartObjects(candidates({ stars: [{ ...star('okay'), colorIndex: null }] })).objects,
    ).toHaveLength(1);
  });

  it('rejects unknown planets, missing star IDs and duplicates even when below horizon', () => {
    expect(() =>
      selectSkyChartObjects(candidates({ planets: [{ id: 'pluto', altitude: 40, azimuth: 0 }] as never })),
    ).toThrow(INVALID_INPUT);
    expect(() => selectSkyChartObjects(candidates({ stars: [star('')] }))).toThrow(INVALID_INPUT);
    expect(() => selectSkyChartObjects(candidates({ stars: [star('sun')] }))).toThrow(INVALID_INPUT);
    expect(() =>
      selectSkyChartObjects(
        candidates({
          planets: [
            { id: 'mars', altitude: -20, azimuth: 0 },
            { id: 'mars', altitude: 50, azimuth: 30 },
          ],
        }),
      ),
    ).toThrow(INVALID_INPUT);
    expect(() =>
      selectSkyChartObjects(candidates({ stars: [star('duplicate', -1), star('duplicate', 50)] })),
    ).toThrow(INVALID_INPUT);
  });

  it('does not modify frozen candidate arrays or leak source references to results', () => {
    const input = candidates({
      sun: Object.freeze({ altitude: 12, azimuth: 370 }),
      moon: Object.freeze({ altitude: -20, azimuth: 0 }),
      planets: Object.freeze([Object.freeze({ id: 'mars', altitude: 20, azimuth: -90 })]),
      stars: Object.freeze([Object.freeze(star('a', 35, 6, 410))]),
    });
    Object.freeze(input);
    const selected = selectSkyChartObjects(input).objects;
    expect(selected.map((object) => [object.id, object.altitude, object.azimuth])).toEqual([
      ['sun', 12, 370],
      ['mars', 20, -90],
      ['a', 35, 410],
    ]);
    expect(selected[0]).not.toBe(input.sun);
    expect(selected[1]).not.toBe(input.planets[0]);
    expect(selected[2]).not.toBe(input.stars[0]);
  });

  it('produces the same exact ID order under candidate permutations and repeated calls', () => {
    const input = candidates({
      planets: [
        { id: 'saturn', altitude: 10, azimuth: 20 },
        { id: 'venus', altitude: 10, azimuth: 20 },
        { id: 'mercury', altitude: 10, azimuth: 20 },
      ],
      stars: [star('zeta'), star('hyg-2'), star('alpha')],
    });
    const result = selectSkyChartObjects(input);
    expect(result.objects.map((object) => object.id)).toEqual([
      'mercury',
      'venus',
      'saturn',
      'alpha',
      'hyg-2',
      'zeta',
    ]);
    expect(selectSkyChartObjects(input)).toEqual(result);
    expect(
      selectSkyChartObjects({
        ...input,
        stars: [...input.stars].reverse(),
        planets: [...input.planets].reverse(),
      }),
    ).toEqual(result);
  });

  it('uses the same local rules in northern and southern observer hemispheres', () => {
    for (const hemisphere of ['New York north', 'Sydney south']) {
      const input = candidates({
        stars: [star(hemisphere, 45, 5, 90), star('hidden', -1, 5, 270)],
      });
      expect(ids(input)).toEqual([hemisphere]);
      const object = selectSkyChartObjects(input).objects[0];
      expect(projectSkyChart(object.altitude, object.azimuth)).toMatchObject({ x: -0.5 });
    }
  });

  it('feeds every selected object to SM2-A with finite coordinates in the unit disc', () => {
    const input = candidates({
      sun: { altitude: 0, azimuth: 0 },
      moon: { altitude: 90, azimuth: 123 },
      planets: [
        { id: 'mars', altitude: 15, azimuth: -90 },
        { id: 'venus', altitude: 5, azimuth: 360 },
      ],
      stars: [star('horizon', 0, 6, 90), star('zenith', 90, -1, 270)],
    });
    for (const object of selectSkyChartObjects(input).objects) {
      const point = projectSkyChart(object.altitude, object.azimuth);
      expect(point).not.toBeNull();
      expect(Number.isFinite(point!.x)).toBe(true);
      expect(Number.isFinite(point!.y)).toBe(true);
      expect(Math.hypot(point!.x, point!.y)).toBeLessThanOrEqual(1 + 1e-14);
    }
  });
});

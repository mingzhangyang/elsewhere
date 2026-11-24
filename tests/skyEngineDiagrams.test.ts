import { expect, it } from 'vitest';
import {
  buildSkyChartSnapshot,
  createSkyScene,
  projectSkyChart,
  renderMinimalSkyMap,
  renderSkyChart,
} from '../packages/sky-engine/src';
import { framePattern } from '../packages/sky-engine/src/moment/framing';

const input = {
  latitude: 40.7128,
  longitude: -74.006,
  timezone: 'America/New_York',
  locationName: 'New York',
  country: 'US',
  instant: new Date('2026-03-20T17:00:00Z'),
};

it('builds a daylight chart with only real above-horizon objects independent of weather', async () => {
  const scene = await createSkyScene(input);
  const chart = buildSkyChartSnapshot(
    { time: { kind: 'utc', utc: scene.instant.toISOString() }, location: scene.location },
    scene.sky,
  );
  expect(scene.sky.sunAltitude).toBeGreaterThan(0);
  expect(chart.objects.some((object) => object.kind === 'sun')).toBe(true);
  const stars = new Map(scene.sky.stars.map((star) => [star.id, star]));
  for (const object of chart.objects) {
    expect(object.altitude).toBeGreaterThanOrEqual(0);
    expect({ x: object.x, y: object.y }).toEqual(projectSkyChart(object.altitude, object.azimuth));
    if (object.kind === 'star') {
      expect(stars.get(object.id)?.altitude).toBe(object.altitude);
      expect(stars.get(object.id)?.magnitude).toBe(object.magnitude);
    }
  }
  expect(chart.objects.filter((object) => object.kind === 'star').length).toBeGreaterThan(100);
});

it('frames above-horizon pattern positions in daylight without changing the illustration policy', async () => {
  const scene = await createSkyScene(input);
  const stars = scene.sky.stars.filter((star) => star.altitude > 20);
  const first = stars[0];
  const second = stars.find(
    (star) =>
      star.id !== first.id &&
      Math.abs(star.altitude - first.altitude) < 10 &&
      Math.abs(((star.azimuth - first.azimuth + 540) % 360) - 180) < 10,
  );
  expect(second).toBeDefined();
  const lines = [[first.id, second!.id]];
  expect(framePattern(scene, lines, 0.75)).toBe(scene);
  const diagram = framePattern(scene, lines, 0.75, true);
  expect(diagram.aspect).toBe(0.75);
  expect(diagram.sky).toBe(scene.sky);
  expect(diagram).not.toBe(scene);
});

it('rejects invalid chart options before acquiring or clearing a canvas', async () => {
  const scene = await createSkyScene(input);
  const canvas = {
    width: 800,
    height: 800,
    getContext: () => {
      throw new Error('Canvas must not be touched');
    },
  } as unknown as HTMLCanvasElement;
  expect(() => renderSkyChart(canvas, scene, { limitingMagnitude: NaN })).toThrow(/magnitude/i);
  expect(() => renderMinimalSkyMap(canvas, scene, { composition: { pattern: 'missing' } })).toThrow(
    /Unknown illustration pattern/,
  );
  expect(() => renderMinimalSkyMap(canvas, scene, { patterns: [{ id: '', lines: [] }] })).toThrow(
    /Invalid illustration pattern/,
  );
});

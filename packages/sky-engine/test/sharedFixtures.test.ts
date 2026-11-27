import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import * as sdk from '../src';
import fixtures from '../fixtures/sky-engine-fixtures.json';
import { verifySkyEngineFixtures } from '../fixtures/verify.mjs';

// The shared regression fixtures (milestone M5) hold for the package source. The same check runs
// against the installed archive in sdk:build, and in other consumers against their pinned release.
const rows = async () => sdk.decodeStarColumns(JSON.parse(await readFile('src/data/stars.json', 'utf8')));

it('the package source reproduces the shared astronomy and Moon pixel fixtures', async () => {
  const result = await verifySkyEngineFixtures(sdk, fixtures as never, { catalogRows: await rows() });
  expect(result.failures).toEqual([]);
  expect(result.checked).toBe(fixtures.astronomy.length + fixtures.moon.length);
  expect(fixtures.astronomy.length).toBeGreaterThanOrEqual(16);
  // Polar day and night are among the cases.
  const status = fixtures.astronomy.map((entry) => entry.expected.events.daylightStatus);
  expect(status).toEqual(expect.arrayContaining(['polar-day', 'polar-night', 'normal']));
});

it('reports a changed result instead of passing vacuously', async () => {
  const altered = structuredClone(fixtures);
  altered.astronomy[0].expected.sun.azimuth += 0.001;
  altered.astronomy[1].expected.events.sunrise = '2000-01-01T00:00:00.000Z';
  altered.astronomy[2].expected.moon.phase = 'full';
  const rgba = Uint8Array.from(atob(altered.moon[0].rgba), (c) => c.charCodeAt(0));
  rgba[rgba.length / 2 + 1] ^= 0x10;
  altered.moon[0].rgba = btoa(String.fromCharCode(...rgba));
  const { failures } = await verifySkyEngineFixtures(sdk, altered as never, { catalogRows: await rows() });
  expect(failures).toHaveLength(4);
  expect(failures.join('\n')).toMatch(/sun\.azimuth/);
  expect(failures.join('\n')).toMatch(/events\.sunrise/);
  expect(failures.join('\n')).toMatch(/moon\.phase/);
  expect(failures.join('\n')).toMatch(/moon\/crescent: pixels differ/);
});

it('does not touch the default catalog of the module it checks', async () => {
  const before = sdk.getStarCatalog();
  await verifySkyEngineFixtures(sdk, fixtures as never, { catalogRows: await rows() });
  expect(sdk.getStarCatalog()).toBe(before);
});

it('fails out-of-range and non-finite values, including wrapped azimuths', async () => {
  const decoded = await rows();
  for (const azimuth of [370.1, 730, -0.5, Infinity, NaN]) {
    // The first case's Sun azimuth is replaced; everything else is the real engine output.
    let first = true;
    const broken = {
      ...sdk,
      createSkyScene: async (options: Parameters<typeof sdk.createSkyScene>[0]) => {
        const scene = await sdk.createSkyScene(options);
        if (!first) return scene;
        first = false;
        return { ...scene, sky: { ...scene.sky, sun: { ...scene.sky.sun, azimuth } } };
      },
    };
    const { failures } = await verifySkyEngineFixtures(broken, fixtures as never, { catalogRows: decoded });
    expect(failures, String(azimuth)).toHaveLength(1);
    expect(failures[0]).toMatch(/^[^:]+\.sun\.azimuth: /);
  }
});

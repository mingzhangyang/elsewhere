// Shared Sky Engine regression fixtures: reference astronomy results and lunar portrait pixels,
// checked through the public API only. Elsewhere runs this against the package source and the
// installed archive; another consumer (now-and-more) runs it against the release it installs:
//
//   import * as sdk from '@orangely/sky-engine';
//   import fixtures from '@orangely/sky-engine/fixtures.json' with { type: 'json' };
//   import { verifySkyEngineFixtures } from '@orangely/sky-engine/fixtures/verify.mjs';
//   const rows = sdk.decodeStarColumns(starsJson);
//   const { failures } = await verifySkyEngineFixtures(sdk, fixtures, { catalogRows: rows });
//   assert.deepEqual(failures, []);
//
// The reference values are regenerated deliberately with `npm run sdk:fixtures` (source repository).
// Plain JavaScript without imports, so it runs in Node or a browser test as it is.

/** Bright stars reported in every astronomy case, by catalog name. */
export const FIXTURE_STAR_NAMES = [
  'Sirius',
  'Canopus',
  'Arcturus',
  'Vega',
  'Capella',
  'Rigel',
  'Betelgeuse',
  'Polaris',
];

const iso = (date) => (date instanceof Date ? date.toISOString() : null);

/** The compared astronomy of one scene, as plain JSON-safe data. */
export function describeAstronomy(scene, starIds) {
  const { sun, moon, planets, stars, events } = scene.sky;
  const byId = new Map(stars.map((star) => [star.id, star]));
  return {
    sun: {
      altitude: sun.altitude,
      geometricAltitude: sun.geometricAltitude,
      azimuth: sun.azimuth,
      distanceKm: sun.distanceKm,
    },
    moon: {
      altitude: moon.altitude,
      geometricAltitude: moon.geometricAltitude,
      azimuth: moon.azimuth,
      distanceKm: moon.distanceKm,
      illumination: moon.illumination,
      phaseAngle: moon.phaseAngle,
      phase: moon.phase,
      brightLimbAngle: moon.brightLimbAngle,
    },
    planets: planets.map((planet) => ({
      id: planet.id,
      altitude: planet.altitude,
      azimuth: planet.azimuth,
      magnitude: planet.magnitude,
      illumination: planet.illumination,
    })),
    stars: starIds.map((id) => {
      const star = byId.get(id);
      return { id, altitude: star?.altitude ?? null, azimuth: star?.azimuth ?? null };
    }),
    events: {
      sunrise: iso(events.sunrise),
      sunset: iso(events.sunset),
      solarNoon: iso(events.solarNoon),
      moonrise: iso(events.moonrise),
      moonset: iso(events.moonset),
      twilightDawn: iso(events.twilightDawn),
      twilightDusk: iso(events.twilightDusk),
      daylightHours: events.daylightHours,
      daylightStatus: events.daylightStatus,
      planets: Object.fromEntries(
        Object.entries(events.planets).map(([id, riseSet]) => [
          id,
          { rise: iso(riseSet.rise), set: iso(riseSet.set) },
        ]),
      ),
    },
  };
}

/** The deterministic 2:1 noise texture the Moon pixel fixtures use (no image decoding involved). */
export function fixtureMoonTexture(width = 64, height = 32, seed = 20261127) {
  const data = new Uint8ClampedArray(width * height * 4);
  let state = seed;
  for (let i = 0; i < data.length; i++) {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff;
    data[i] = (i & 3) === 3 ? 255 : state >> 23;
  }
  return { width, height, data };
}

/** Render a lunar portrait through the public API into a minimal in-memory canvas; RGBA bytes. */
export async function renderFixtureMoon(sdk, scene, options, size) {
  let stored = null;
  const context = {
    createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (image) => {
      stored = image.data;
    },
  };
  const canvas = { width: size, height: size, getContext: () => context };
  await sdk.renderMoonPhase(canvas, scene, { ...options, texture: fixtureMoonTexture() });
  if (!stored) throw new Error('The Moon portrait wrote no pixels.');
  return stored;
}

const toBase64 = (bytes) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
export const encodePixels = toBase64;

function compare(path, actual, expected, tolerance, failures) {
  if (typeof expected === 'number' && typeof actual === 'number') {
    let difference = Math.abs(actual - expected);
    if (/azimuth$/i.test(path)) difference = Math.min(difference, 360 - difference);
    const limit = /distanceKm$/.test(path) ? tolerance.relative * Math.abs(expected) : tolerance.absolute;
    if (!(difference <= limit)) failures.push(`${path}: ${actual} differs from ${expected} by ${difference}`);
  } else if (
    typeof expected === 'string' &&
    /^\d{4}-\d\d-\d\dT/.test(expected) &&
    typeof actual === 'string'
  ) {
    const difference = Math.abs(Date.parse(actual) - Date.parse(expected));
    if (!(difference <= tolerance.eventMs)) failures.push(`${path}: ${actual} differs from ${expected}`);
  } else if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      failures.push(`${path}: expected ${expected.length} entries`);
      return;
    }
    expected.forEach((value, index) =>
      compare(`${path}[${index}]`, actual[index], value, tolerance, failures),
    );
  } else if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') {
      failures.push(`${path}: missing`);
      return;
    }
    for (const key of Object.keys(expected))
      compare(`${path}.${key}`, actual[key], expected[key], tolerance, failures);
  } else if (actual !== expected) {
    failures.push(`${path}: ${JSON.stringify(actual)} is not ${JSON.stringify(expected)}`);
  }
}

/**
 * Check `sdk` (the package namespace, either build) against the fixtures. Supply the decoded star
 * catalog rows; an instanced catalog is used, so the module's default catalog is not touched.
 * Resolves with the failures (empty when everything matches) and how many values were checked.
 */
export async function verifySkyEngineFixtures(sdk, fixtures, { catalogRows }) {
  if (fixtures?.formatVersion !== 1) throw new Error('Unsupported Sky Engine fixture format.');
  const catalog = sdk.createStarCatalog(catalogRows);
  const failures = [];
  let checked = 0;
  const scenes = new Map();
  for (const entry of fixtures.astronomy) {
    const scene = await sdk.createSkyScene({ ...entry.observer, instant: new Date(entry.instant), catalog });
    scenes.set(entry.name, scene);
    compare(
      entry.name,
      describeAstronomy(scene, entry.starIds),
      entry.expected,
      fixtures.tolerance,
      failures,
    );
    checked++;
  }
  for (const entry of fixtures.moon) {
    const scene = scenes.get(entry.scene);
    if (!scene) {
      failures.push(`${entry.name}: unknown scene ${entry.scene}`);
      continue;
    }
    const actual = await renderFixtureMoon(sdk, scene, entry.options, entry.size);
    const expected = fromBase64(entry.rgba);
    let rgb = 0;
    let alpha = 0;
    if (actual.length !== expected.length)
      failures.push(`${entry.name}: ${actual.length} bytes, expected ${expected.length}`);
    else {
      for (let i = 0; i < expected.length; i++) {
        const difference = Math.abs(actual[i] - expected[i]);
        if ((i & 3) === 3) alpha = Math.max(alpha, difference);
        else rgb = Math.max(rgb, difference);
      }
      if (rgb > fixtures.tolerance.moonRgb || alpha > fixtures.tolerance.moonAlpha) {
        failures.push(`${entry.name}: pixels differ (RGB ${rgb}, alpha ${alpha})`);
      }
    }
    checked++;
  }
  return { checked, failures };
}

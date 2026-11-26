// Records Chromium rendering timings of the built Sky Engine module. Results are informational
// only; nothing here is a CI threshold. Run `npm run sdk:build` first, then `npm run sdk:bench`.
//
// Environment:
//   SKY_ENGINE_BENCH_CHROMIUM  Chromium executable to launch (default: Playwright's own browser)
//   SKY_ENGINE_BENCH_RUNS      Timed runs per case after one warm-up run (default 5)
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = join(root, 'dist-sdk/release');
const runs = Number(process.env.SKY_ENGINE_BENCH_RUNS ?? 5);
if (!Number.isInteger(runs) || runs < 1 || runs > 100)
  throw new Error('SKY_ENGINE_BENCH_RUNS must be 1-100.');

const types = {
  'sky-engine.mjs': 'text/javascript',
  'stars.json': 'application/json',
  'moon-lroc.jpg': 'image/jpeg',
};
const assets = {};
for (const name of Object.keys(types)) {
  try {
    assets[name] = await readFile(join(release, name));
  } catch {
    throw new Error(`Missing dist-sdk/release/${name}. Run npm run sdk:build before npm run sdk:bench.`);
  }
}
const manifest = JSON.parse(await readFile(join(release, 'manifest.json'), 'utf8'));

const origin = 'https://sky-engine-bench.invalid';
const browser = await chromium.launch({ executablePath: process.env.SKY_ENGINE_BENCH_CHROMIUM || undefined });
try {
  const page = await browser.newPage();
  await page.route(origin + '/**', (route) => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (name === '') {
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' });
    }
    if (!assets[name]) return route.fulfill({ status: 404, body: 'Not found' });
    return route.fulfill({ contentType: types[name], body: assets[name] });
  });
  await page.goto(origin + '/');
  const results = await page.evaluate(async (runs) => {
    const sdk = await import('/sky-engine.mjs');
    const scene = await sdk.createSkyScene({
      latitude: 39.14,
      longitude: -77.2,
      timezone: 'America/New_York',
      instant: new Date('2026-11-26T03:00:00Z'),
      weather: 'clear',
      loadCatalog: async (signal) => {
        const response = await fetch('/stars.json', { signal });
        if (!response.ok) throw new Error('Star catalog unavailable');
        return sdk.decodeStarColumns(await response.json());
      },
    });
    sdk.installMoonTexture(await sdk.loadMoonTexture('/moon-lroc.jpg'));
    const canvas = (width, height) => Object.assign(document.createElement('canvas'), { width, height });
    async function time(render) {
      await render();
      const samples = [];
      for (let i = 0; i < runs; i += 1) {
        const start = performance.now();
        await render();
        samples.push(Math.round((performance.now() - start) * 10) / 10);
      }
      const sorted = [...samples].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      return {
        medianMs: Math.round(median * 10) / 10,
        minMs: sorted[0],
        maxMs: sorted.at(-1),
        samplesMs: samples,
      };
    }
    const out = {};
    for (const size of [1024, 2048, 4096]) {
      const target = canvas(size, size);
      out[`renderMoonPhase ${size}x${size}`] = await time(() =>
        sdk.renderMoonPhase(target, scene, { orientation: 'observer', background: 'transparent' }),
      );
    }
    const illustration = canvas(1200, 1000);
    out['renderIllustration 1200x1000'] = await time(() =>
      sdk.renderIllustration(illustration, scene, {
        composition: 'auto',
        landscape: 'ridge',
        milkyWay: true,
        paintFinish: true,
      }),
    );
    const chart = canvas(1000, 1000);
    out['renderSkyChart 1000x1000'] = await time(() =>
      sdk.renderSkyChart(chart, scene, { theme: 'midnight' }),
    );
    return { userAgent: navigator.userAgent, results: out };
  }, runs);
  const report = {
    package: manifest.name,
    version: manifest.version,
    sourceCommit: manifest.sourceCommit,
    bundleBytes: manifest.bundle.rawBytes,
    browser: browser.version(),
    userAgent: results.userAgent,
    scene: {
      latitude: 39.14,
      longitude: -77.2,
      timezone: 'America/New_York',
      instant: '2026-11-26T03:00:00Z',
      weather: 'clear',
    },
    runsPerCase: runs,
    warmupRunsPerCase: 1,
    results: results.results,
  };
  const json = JSON.stringify(report, null, 2) + '\n';
  await writeFile(join(root, 'dist-sdk/bench.json'), json);
  process.stdout.write(json);
} finally {
  await browser.close();
}

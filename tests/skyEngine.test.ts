import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { expect, it } from 'vitest';
import * as engine from '../packages/sky-engine/src';
import { calculateSky } from '../src/domain/astronomy';
import { defaultWeatherValues } from '../src/domain/weather';
import { CONSTELLATIONS, loadStarCatalog, STAR_CATALOG } from '../src/domain/stars';
import { frameMoment } from '../src/moment/framing';
import { drawIllustration } from '../src/moment/illustration';
import { createProjection } from '../src/moment/projection';
import { projectSkyChart } from '../src/domain/skyChartProjection';
import { selectSkyChartObjects } from '../src/domain/skyChartSelection';
import { buildSkyChartSnapshot } from '../src/domain/skyChartSnapshot';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

it('keeps the shared engine independent of Elsewhere, React, Three and network clients', () => {
  const root = resolve('packages/sky-engine/src');
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, 'utf8');
    for (const [, spec] of source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
      if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec);
        expect(relative(root, target).startsWith('..'), file).toBe(false);
        expect(existsSync(target + '.ts'), file + ': ' + spec).toBe(true);
      } else {
        expect(['astronomy-engine', '@js-temporal/polyfill'], file).toContain(spec);
      }
    }
  }
});

it('uses exactly the same implementations and live catalog through legacy and engine entries', () => {
  expect(engine.calculateSky).toBe(calculateSky);
  expect(engine.defaultWeatherValues).toBe(defaultWeatherValues);
  expect(engine.createProjection).toBe(createProjection);
  expect(engine.projectSkyChart).toBe(projectSkyChart);
  expect(engine.selectSkyChartObjects).toBe(selectSkyChartObjects);
  expect(engine.buildSkyChartSnapshot).toBe(buildSkyChartSnapshot);
  expect(engine.drawIllustration).toBe(drawIllustration);
  expect(engine.frameMoment).toBe(frameMoment);
  expect(engine.loadStarCatalog).toBe(loadStarCatalog);
  expect(engine.STAR_CATALOG).toBe(STAR_CATALOG);
  expect(engine.CONSTELLATIONS).toBe(CONSTELLATIONS);
  expect(engine.STAR_CATALOG.length).toBeGreaterThan(0);
});

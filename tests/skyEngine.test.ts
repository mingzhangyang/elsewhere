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
  expect(engine.advanced.calculateSky).toBe(calculateSky);
  expect(engine.defaultWeatherValues).toBe(defaultWeatherValues);
  expect(engine.advanced.createProjection).toBe(createProjection);
  expect(engine.advanced.projectSkyChart).toBe(projectSkyChart);
  expect(engine.advanced.selectSkyChartObjects).toBe(selectSkyChartObjects);
  expect(engine.buildSkyChartSnapshot).toBe(buildSkyChartSnapshot);
  expect(engine.advanced.drawIllustration).toBe(drawIllustration);
  expect(engine.advanced.frameMoment).toBe(frameMoment);
  expect(engine.loadStarCatalog).toBe(loadStarCatalog);
  expect(engine.getStarCatalog()).toBe(STAR_CATALOG);
  expect(engine.getPatterns()).toBe(CONSTELLATIONS);
  expect(engine.getStarCatalog().length).toBeGreaterThan(0);
});

it('no longer exposes the mutable catalog bindings or moved functions at the package root', () => {
  const root = engine as unknown as Record<string, unknown>;
  for (const name of [
    'STAR_CATALOG',
    'CONSTELLATIONS',
    'calculateSky',
    'createProjection',
    'ensureTemporal',
  ]) {
    expect(root[name], name).toBeUndefined();
  }
});

it('returns the frozen installed catalog and patterns without copying them per call', () => {
  const catalog = engine.getStarCatalog();
  const patterns = engine.getPatterns();
  expect(engine.getStarCatalog()).toBe(catalog);
  expect(engine.getPatterns()).toBe(patterns);
  expect(Object.isFrozen(catalog)).toBe(true);
  expect(catalog.every((star) => Object.isFrozen(star))).toBe(true);
  expect(Object.isFrozen(patterns)).toBe(true);
  for (const pattern of patterns) {
    expect(Object.isFrozen(pattern)).toBe(true);
    expect(Object.isFrozen(pattern.lines)).toBe(true);
    expect(pattern.lines.every((pair) => Object.isFrozen(pair))).toBe(true);
  }
  expect(() => ((catalog[0] as { name: string }).name = 'Changed')).toThrow(TypeError);
  expect(() => (catalog as unknown[]).push({})).toThrow(TypeError);
  expect(catalog[0].name).not.toBe('Changed');
});

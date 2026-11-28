import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  advanced,
  createSkyScene,
  decodeStarColumns,
  prepareIllustrationScene,
  renderIllustration,
  type CatalogRow,
  type MomentSnapshot,
  type SkySceneOptions,
} from '../src';

const { createCoverProjection, createProjection, createSkyRay, drawIllustration } = advanced;
import { loadResource } from '../src/resources';
import { calculateSky } from '../src/domain/astronomy';
import { NEW_YORK } from './fixtures/locations';

const options: SkySceneOptions = {
  latitude: NEW_YORK.latitude,
  longitude: NEW_YORK.longitude,
  elevation: NEW_YORK.elevation,
  timezone: NEW_YORK.timezone,
  instant: new Date('2026-03-20T17:00:00Z'),
  weather: 'clear',
  view: { heading: 0, altitude: 20, fov: 66 },
  aspect: 0.6,
};

describe('shared scene creation', () => {
  it('matches the app calculation and preserves explicit weather provenance', async () => {
    const loader = vi.fn(async () => []);
    const scene = await createSkyScene({ ...options, loadCatalog: loader });
    const reference = calculateSky(NEW_YORK, options.instant);
    expect(loader).not.toHaveBeenCalled(); // setupRuntime already installed the shared catalog
    expect(scene.sky.sun).toEqual(reference.sun);
    expect(scene.sky.moon).toEqual(reference.moon);
    expect(scene.sky.planets).toEqual(reference.planets);
    expect(scene.sky.stars).toEqual(reference.stars);
    expect(scene.sky.starField.rotation).toEqual(reference.starField.rotation);
    expect(scene.provenance).toEqual({ kind: 'clear' });
    expect(scene.weather.visibilityKm).toBe(60);
    expect(scene.layers.labels).toBe(false);
    expect(scene.instant).not.toBe(options.instant);
    expect(scene.view).not.toBe(options.view);
    const assumed = await createSkyScene({ ...options, weather: undefined });
    expect(assumed.provenance.kind).toBe('none');
  });

  it('rejects invalid coordinates, civil time, date, camera and weather', async () => {
    await expect(createSkyScene({ ...options, latitude: 91 })).rejects.toThrow();
    await expect(createSkyScene({ ...options, timezone: '' })).rejects.toThrow(/time zone/);
    await expect(createSkyScene({ ...options, instant: new Date(NaN) })).rejects.toThrow();
    await expect(createSkyScene({ ...options, view: { heading: 0, altitude: 0, fov: 0 } })).rejects.toThrow(
      /camera/,
    );
    const scene = await createSkyScene(options);
    await expect(
      createSkyScene({ ...options, weather: { ...scene.weather, cloudCover: NaN } }),
    ).rejects.toThrow(/weather/);
  });
});

describe('output geometry and composition', () => {
  it.each([
    [0.45, 1200, 1500],
    [2.4, 500, 1000],
    [1, 1200, 800],
  ])('keeps forward projection and Galactic sky rays inverse at aspect %s', (aspect, width, height) => {
    const view = { heading: 359, altitude: 35, fov: 66 };
    const { toCanvas } = createCoverProjection(view, aspect, width, height);
    const rayAt = createSkyRay(view, aspect, width, height);
    for (const [alt, az] of [
      [35, 359],
      [45, 8],
      [22, 345],
    ]) {
      const point = toCanvas(alt, az);
      expect(point.front).toBe(true);
      const a = (alt * Math.PI) / 180;
      const z = (az * Math.PI) / 180;
      const expected = [Math.cos(a) * Math.sin(z), Math.sin(a), -Math.cos(a) * Math.cos(z)];
      const ray = rayAt(point.x, point.y);
      ray.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 12));
    }
  });

  it('uses output aspect for auto while preserving the source current view', async () => {
    const scene = await createSkyScene(options);
    const current = prepareIllustrationScene(scene, 1000, 500, { composition: 'current' });
    expect(current.view).toEqual(scene.view);
    expect(current.aspect).toBe(scene.aspect);
    const auto = prepareIllustrationScene(scene, 1000, 500);
    expect(auto.aspect).toBe(2);
    expect(scene.view.heading).toBe(0);
    expect(scene.aspect).toBe(0.6);
    expect(auto.sky).toBe(scene.sky);
    const narrow = prepareIllustrationScene(scene, 100, 1000);
    expect(narrow.aspect).toBeCloseTo(0.1);
    const sun = createProjection(narrow.view, narrow.aspect)(narrow.sky.sun.altitude, narrow.sky.sun.azimuth);
    expect(sun.front).toBe(true);
    expect(Math.abs(sun.x)).toBeLessThanOrEqual(0.88);
    expect(Math.abs(sun.y)).toBeLessThanOrEqual(0.88);
  });

  it('frames a custom pattern across north using existing stars and handles missing members', async () => {
    const original = await createSkyScene(options);
    const scene: MomentSnapshot = {
      ...original,
      sky: {
        ...original.sky,
        sunAltitude: -25,
        stars: [
          { ...original.sky.stars[0], id: 'a', altitude: 45, azimuth: 359 },
          { ...original.sky.stars[1], id: 'b', altitude: 47, azimuth: 8 },
        ],
      },
    };
    const prepared = prepareIllustrationScene(scene, 600, 1000, {
      composition: { pattern: 'signature' },
      patterns: [
        {
          id: 'signature',
          lines: [
            ['a', 'b'],
            ['b', 'missing'],
          ],
        },
      ],
      layers: { lines: true },
    });
    expect(prepared.aspect).toBe(0.6);
    expect(prepared.layers.lines).toBe(true);
    expect(scene.layers.lines).toBe(false);
    const project = createProjection(prepared.view, prepared.aspect);
    for (const star of scene.sky.stars) {
      const point = project(star.altitude, star.azimuth);
      expect(point.front).toBe(true);
      expect(Math.abs(point.x)).toBeLessThan(0.9);
      expect(Math.abs(point.y)).toBeLessThan(0.9);
    }
    const fallback = prepareIllustrationScene(scene, 600, 1000, {
      composition: { pattern: 'signature' },
      patterns: [{ id: 'signature', lines: [['a', 'missing']] }],
    });
    expect(fallback.view).toEqual(scene.view);
    expect(() => prepareIllustrationScene(scene, 600, 1000, { composition: { pattern: 'unknown' } })).toThrow(
      /Unknown/,
    );
    expect(() => prepareIllustrationScene(scene, 10000, 600)).toThrow(/dimensions/);
  });
});

describe('bounded resource loading', () => {
  it('rejects on timeout and aborts the injected loader', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const pending = loadResource(
        (provided) => {
          signal = provided;
          return new Promise<never>(() => {});
        },
        20,
        'Test asset',
      );
      const rejected = expect(pending).rejects.toThrow(/timed out/);
      await vi.advanceTimersByTimeAsync(20);
      await rejected;
      expect(signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects missing art and a cancelled load without resetting the canvas', async () => {
    const scene = await createSkyScene(options);
    const canvas = { width: 800, height: 600, getContext: () => ({}) } as unknown as HTMLCanvasElement;
    await expect(renderIllustration(canvas, scene, { landscape: 'city' })).rejects.toThrow(/artwork/);
    const controller = new AbortController();
    let provided: AbortSignal | undefined;
    const pending = renderIllustration(canvas, scene, {
      landscape: 'mountains',
      signal: controller.signal,
      loadLandscape: (_request, signal) => {
        provided = signal;
        return new Promise<never>(() => {});
      },
    });
    const rejected = expect(pending).rejects.toThrow(/cancelled/);
    await Promise.resolve();
    controller.abort();
    await rejected;
    expect(provided?.aborted).toBe(true);
    expect(canvas.width).toBe(800);
  });
});

const catalogRows = async () =>
  decodeStarColumns(JSON.parse(await readFile('src/data/stars.json', 'utf8'))) as CatalogRow[];

describe('fresh catalog installation', () => {
  it('joins an in-flight installation and does not require a second loader', async () => {
    vi.resetModules();
    const { createSkyScene: create } = await import('../src/scene');
    const rows = await catalogRows();
    let release: (value: CatalogRow[]) => void = () => {};
    const gate = new Promise<CatalogRow[]>((resolve) => {
      release = resolve;
    });
    const loader = vi.fn((_signal: AbortSignal) => gate);
    const first = create({ ...options, loadCatalog: loader });
    const second = create(options);
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(1);
    release(rows);
    const [a, b] = await Promise.all([first, second]);
    expect(a.sky.stars.length).toBeGreaterThan(1000);
    expect(b.sky.stars).toEqual(a.sky.stars);
  });

  it('rejects a corrupt decoded catalog, then accepts a valid retry', async () => {
    vi.resetModules();
    const { createSkyScene: create } = await import('../src/scene');
    const rows = await catalogRows();
    const [id, name, , ...rest] = rows[0];
    const corrupt = rows.map((row, index) =>
      index === 0 ? [id, name, 'nope', ...rest] : row,
    ) as CatalogRow[];
    const duplicate = rows.map((row, index) =>
      index === 1 ? [rows[0][0], ...row.slice(1)] : row,
    ) as CatalogRow[];
    await expect(create({ ...options, loadCatalog: async () => corrupt })).rejects.toThrow(/right ascension/);
    await expect(create({ ...options, loadCatalog: async () => duplicate })).rejects.toThrow(/Duplicate/);
    const scene = await create({ ...options, loadCatalog: async () => rows });
    expect(scene.sky.stars.length).toBeGreaterThan(1000);
  });

  it('bounds a joined host installation without cancelling it or calling a second loader', async () => {
    vi.resetModules();
    const stars = await import('../src/domain/stars');
    const { createSkyScene: create } = await import('../src/scene');
    const rows = await catalogRows();
    vi.useFakeTimers();
    try {
      let release: (value: CatalogRow[]) => void = () => {};
      const host = stars.loadStarCatalog(
        () =>
          new Promise<CatalogRow[]>((resolve) => {
            release = resolve;
          }),
      );
      const loader = vi.fn(async () => rows);
      const scene = create({ ...options, loadCatalog: loader });
      const rejected = expect(scene).rejects.toThrow(/timed out/);
      await vi.advanceTimersByTimeAsync(15000);
      await rejected;
      expect(loader).not.toHaveBeenCalled();
      expect(stars.starCatalogLoaded()).toBe(false);
      let hostSettled = false;
      void host.then(() => {
        hostSettled = true;
      });
      await Promise.resolve();
      expect(hostSettled).toBe(false);
      release(rows);
      await host;
      expect(stars.starCatalogLoaded()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('custom pattern labels', () => {
  it('anchors a partial pattern on a drawn edge and ignores a back-facing member', async () => {
    const original = await createSkyScene(options);
    const scene: MomentSnapshot = {
      ...original,
      view: { heading: 180, altitude: 30, fov: 66 },
      aspect: 1,
      layers: { stars: false, lines: true, labels: true },
      sky: {
        ...original.sky,
        sunAltitude: -25,
        sun: { ...original.sky.sun, altitude: -25, visible: false },
        moon: { ...original.sky.moon, altitude: -30, visible: false },
        planets: [],
        stars: [
          { ...original.sky.stars[0], id: 'a', name: 'A', altitude: 42, azimuth: 180, magnitude: 0.2 },
          { ...original.sky.stars[1], id: 'b', name: 'B', altitude: 30, azimuth: 190, magnitude: 0.4 },
          { ...original.sky.stars[2], id: 'c', name: 'C', altitude: -5, azimuth: 0, magnitude: 0.1 },
        ],
      },
    };
    const texts: { text: string; x: number }[] = [];
    const ctx = new Proxy(
      {},
      {
        get(_target, key) {
          if (key === 'fillText') return (text: string, x: number) => texts.push({ text, x });
          if (key === 'measureText') return () => ({ width: 40 });
          if (key === 'createLinearGradient' || key === 'createRadialGradient')
            return () => ({ addColorStop() {} });
          if (key === 'canvas') return { width: 400, height: 400 };
          return () => {};
        },
        set: () => true,
      },
    ) as CanvasRenderingContext2D;
    const { toCanvas } = createCoverProjection(scene.view, scene.aspect, 400, 400);
    drawIllustration(
      ctx,
      400,
      400,
      scene,
      toCanvas,
      'ridge',
      { object: (object) => object.name, pattern: (id) => id },
      'sans-serif',
      null,
      {
        patterns: [
          {
            id: 'hook',
            label: 'Hook',
            lines: [
              ['a', 'b'],
              ['b', 'c'],
            ],
          },
        ],
        milkyWay: false,
      },
    );
    const label = texts.find((entry) => entry.text === 'Hook');
    const anchor = toCanvas(30, 190);
    expect(label).toBeTruthy();
    expect(Math.abs(label!.x - anchor.x)).toBeLessThan(1);
    expect(Math.abs(label!.x - 200)).toBeGreaterThan(20);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  awaitStarCatalog,
  buildSkyChartSnapshot,
  createSkyScene,
  loadMoonTexture,
  paintIllustrationPanel,
  renderIllustration,
  renderMinimalSkyMap,
  renderMoonPhase,
  renderSkyChart,
  SkyEngineError,
  validateObserver,
  type MomentSnapshot,
  type SkySceneOptions,
} from '../packages/sky-engine/src';
import { NEW_YORK } from './fixtures/locations';
import { INVALID_INPUT, skyEngineError } from './skyEngineErrorMatchers';

const options: SkySceneOptions = {
  latitude: NEW_YORK.latitude,
  longitude: NEW_YORK.longitude,
  elevation: NEW_YORK.elevation,
  timezone: NEW_YORK.timezone,
  instant: new Date('2026-03-20T17:00:00Z'),
  weather: 'clear',
};

/** A canvas whose 2D context is never expected to be reached, or is unavailable (null). */
const canvas = (getContext: () => unknown = () => ({})) =>
  ({ width: 400, height: 400, getContext }) as unknown as HTMLCanvasElement;
const untouched = () =>
  canvas(() => {
    throw new Error('Canvas must not be touched');
  });
const moonTexture = { width: 4, height: 2, data: new Uint8ClampedArray(32) } as unknown as ImageData;
const scene = (): Promise<MomentSnapshot> => createSkyScene(options);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SkyEngineError', () => {
  it('is an Error with a read-only code, an optional cause and a name derived from the code', () => {
    const cause = new Error('root');
    const error = new SkyEngineError('ASSET_FAILED', 'Failed.', { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SkyEngineError);
    expect(error.code).toBe('ASSET_FAILED');
    expect(error.name).toBe('SkyEngineError');
    expect(error.message).toBe('Failed.');
    expect(error.cause).toBe(cause);
    expect(new SkyEngineError('INVALID_INPUT', 'Bad.').cause).toBeUndefined();
    // Cancellation keeps the conventional AbortError name.
    const abort = new SkyEngineError('CANCELLED', 'Stopped.');
    expect(abort.name).toBe('AbortError');
    expect(abort).toBeInstanceOf(SkyEngineError);
  });
});

describe('INVALID_INPUT', () => {
  it('reports invalid observers, options and resource timeouts', async () => {
    expect(() => validateObserver({ ...NEW_YORK, latitude: 91 })).toThrow(INVALID_INPUT);
    const zone = (() => {
      try {
        validateObserver({ ...NEW_YORK, timezone: 'Mars/Olympus_Mons' });
      } catch (error) {
        return error;
      }
    })();
    expect(zone).toMatchObject({ name: 'SkyEngineError', code: 'INVALID_INPUT' });
    expect((zone as Error).cause).toBeInstanceOf(RangeError);
    await expect(createSkyScene({ ...options, timezone: '' })).rejects.toThrow(INVALID_INPUT);
    // Resource timeouts are validated even when no loader runs (the catalog is already installed).
    await expect(createSkyScene({ ...options, assetTimeoutMs: 0 })).rejects.toThrow(INVALID_INPUT);
    const moment = await scene();
    await expect(renderIllustration(untouched(), moment, { assetTimeoutMs: 30001 })).rejects.toThrow(
      INVALID_INPUT,
    );
    await expect(
      renderMoonPhase(untouched(), moment, { texture: moonTexture, assetTimeoutMs: NaN }),
    ).rejects.toThrow(INVALID_INPUT);
    expect(() =>
      paintIllustrationPanel(untouched() as never, 400, 400, moment, { landscape: 'lake' as never }),
    ).toThrow(INVALID_INPUT);
    expect(() => renderSkyChart(untouched(), moment, { theme: 'neon' as never })).toThrow(INVALID_INPUT);
  });

  it('uses one message for a malformed composition in both perspective renderers', async () => {
    const moment = await scene();
    const composition = { pattern: 1 } as never;
    expect(() => renderMinimalSkyMap(untouched(), moment, { composition })).toThrow(
      'Invalid illustration composition.',
    );
    await expect(renderIllustration(untouched(), moment, { composition })).rejects.toThrow(
      'Invalid illustration composition.',
    );
  });
});

describe('TIMEOUT', () => {
  it('rejects a host loader that does not settle within assetTimeoutMs', async () => {
    const moment = await scene();
    vi.useFakeTimers();
    const pending = renderIllustration(canvas(), moment, {
      landscape: 'city',
      assetTimeoutMs: 20,
      loadLandscape: () => new Promise<never>(() => {}),
    });
    const rejected = expect(pending).rejects.toThrow(skyEngineError('TIMEOUT'));
    await vi.advanceTimersByTimeAsync(20);
    await rejected;
    await expect(pending).rejects.toThrow('Landscape art timed out.');
  });

  it('rejects a waiter on another caller’s catalog installation', async () => {
    vi.resetModules();
    const stars = await import('../packages/sky-engine/src/domain/stars');
    void stars.loadStarCatalog(() => new Promise(() => {}));
    vi.useFakeTimers();
    const rejected = expect(stars.awaitStarCatalog(50)).rejects.toThrow(skyEngineError('TIMEOUT'));
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
  });
});

describe('CANCELLED', () => {
  it('rejects with an AbortError-named SkyEngineError', async () => {
    const aborted = AbortSignal.abort();
    await expect(createSkyScene({ ...options, signal: aborted })).rejects.toThrow(
      skyEngineError('CANCELLED'),
    );
    const moment = await scene();
    await expect(renderIllustration(untouched(), moment, { signal: aborted })).rejects.toThrow(
      skyEngineError('CANCELLED'),
    );
    await expect(
      renderMoonPhase(untouched(), moment, { texture: moonTexture, signal: aborted }),
    ).rejects.toThrow(skyEngineError('CANCELLED'));
    await expect(loadMoonTexture('/moon.jpg', aborted)).rejects.toThrow(skyEngineError('CANCELLED'));
    const error = await renderIllustration(untouched(), moment, { signal: aborted }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SkyEngineError);
    expect((error as Error).name).toBe('AbortError');
  });

  it('cancels a host loader in flight', async () => {
    const moment = await scene();
    const controller = new AbortController();
    let provided: AbortSignal | undefined;
    const pending = renderIllustration(canvas(), moment, {
      landscape: 'mountains',
      signal: controller.signal,
      loadLandscape: (_request, signal) => {
        provided = signal;
        return new Promise<never>(() => {});
      },
    });
    const rejected = expect(pending).rejects.toThrow(skyEngineError('CANCELLED'));
    await Promise.resolve();
    controller.abort();
    await rejected;
    expect(provided?.aborted).toBe(true);
  });
});

describe('MISSING_ASSET', () => {
  it('reports missing landscape art, Moon texture and star catalog', async () => {
    const moment = await scene();
    await expect(renderIllustration(canvas(), moment, { landscape: 'city' })).rejects.toThrow(
      skyEngineError('MISSING_ASSET'),
    );
    expect(() =>
      buildSkyChartSnapshot(
        { time: { kind: 'utc', utc: moment.instant.toISOString() }, location: { ...NEW_YORK } },
        moment.sky,
        [],
      ),
    ).toThrow(skyEngineError('MISSING_ASSET'));

    vi.resetModules();
    const fresh = await import('../packages/sky-engine/src');
    await expect(fresh.renderMoonPhase(untouched(), moment)).rejects.toThrow(skyEngineError('MISSING_ASSET'));
    await expect(fresh.createSkyScene(options)).rejects.toThrow(skyEngineError('MISSING_ASSET'));
    await expect(fresh.awaitStarCatalog()).rejects.toThrow(skyEngineError('MISSING_ASSET'));
    expect(fresh.getStarCatalog()).toEqual([]);
  });

  it('resolves awaitStarCatalog once the shared catalog is installed', async () => {
    await expect(awaitStarCatalog()).resolves.toBeUndefined();
  });
});

describe('ASSET_FAILED', () => {
  it('wraps a failing host loader and keeps its error as cause', async () => {
    const moment = await scene();
    const failure = new Error('404 landscape');
    const error = await renderIllustration(canvas(), moment, {
      landscape: 'city',
      loadLandscape: async () => {
        throw failure;
      },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SkyEngineError);
    expect(error).toMatchObject({ code: 'ASSET_FAILED', message: '404 landscape', cause: failure });
  });

  it('wraps catalog loader failures, still throwing synchronously for a synchronous throw', async () => {
    vi.resetModules();
    const fresh = await import('../packages/sky-engine/src');
    const offline = new Error('offline');
    await expect(fresh.loadStarCatalog(() => Promise.reject(offline))).rejects.toThrow(
      expect.objectContaining({ code: 'ASSET_FAILED', message: 'offline', cause: offline }),
    );
    const broken = new TypeError('loader exploded');
    let thrown: unknown;
    try {
      // Not awaited: the throw must happen during the call itself.
      void fresh.loadStarCatalog(() => {
        throw broken;
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(fresh.SkyEngineError);
    expect(thrown).toMatchObject({ code: 'ASSET_FAILED', message: 'loader exploded', cause: broken });
    expect(fresh.starCatalogLoaded()).toBe(false);
    expect(fresh.advanced.starCatalogInstallation()).toBeNull();
  });

  it('reports a failed Moon texture download', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404 }));
    await expect(loadMoonTexture('/moon.jpg')).rejects.toThrow(
      expect.objectContaining({ code: 'ASSET_FAILED', message: 'Moon texture unavailable: 404' }),
    );
    const network = new TypeError('Failed to fetch');
    vi.stubGlobal('fetch', async () => {
      throw network;
    });
    await expect(loadMoonTexture('/moon.jpg')).rejects.toThrow(
      expect.objectContaining({ code: 'ASSET_FAILED', cause: network }),
    );
  });
});

describe('UNSUPPORTED', () => {
  it('reports a missing Canvas 2D context', async () => {
    const moment = await scene();
    const none = () => canvas(() => null);
    expect(() => renderSkyChart(none(), moment)).toThrow(skyEngineError('UNSUPPORTED'));
    expect(() => renderMinimalSkyMap(none(), moment)).toThrow(skyEngineError('UNSUPPORTED'));
    await expect(renderIllustration(none(), moment)).rejects.toThrow(skyEngineError('UNSUPPORTED'));
    await expect(renderMoonPhase(none(), moment, { texture: moonTexture })).rejects.toThrow(
      skyEngineError('UNSUPPORTED'),
    );
  });
});

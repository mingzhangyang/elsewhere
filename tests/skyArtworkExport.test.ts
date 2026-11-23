import { describe, expect, it, vi } from 'vitest';
import type { SkyChartSnapshot } from '../src/domain/skyChartSnapshot';
import type { MemorialTime } from '../src/lib/memorialTime';
import { createSkyArtwork, type SkyArtwork } from '../src/lib/skyArtwork';
import {
  SKY_CHART_PNG_SIZES,
  SkyArtworkExportError,
  createSkyArtworkExportCoordinator,
  createSkyArtworkFile,
  exportSkyChartPng,
  releaseSkyArtworkExport,
  type SkyArtworkCanvas,
  type SkyArtworkExportOptions,
} from '../src/lib/skyArtworkExport';
import {
  downloadSkyArtwork,
  shareSkyArtwork,
  skyArtworkShareCapability,
} from '../src/lib/skyArtworkDelivery';

const event: MemorialTime = {
  state: 'resolved',
  kind: 'reference',
  localDate: '2026-06-21',
  reference: { localTime: '21:15', source: 'user' },
  utc: '2026-06-22T01:15:00.000Z',
  offset: '-04:00',
  disambiguation: null,
  location: {
    id: 'fictional',
    name: 'Test City',
    country: 'United States',
    latitude: 40.71,
    longitude: -74.01,
    elevation: 10,
    timezone: 'America/New_York',
  },
};

const snapshot: SkyChartSnapshot = {
  formatVersion: 1,
  utc: event.utc,
  time: {
    kind: 'reference',
    referenceSource: 'user',
    offset: event.offset,
    disambiguation: null,
  },
  location: { ...event.location },
  options: { limitingMagnitude: 6 },
  provenance: {
    catalog: 'HYG v4.1 derivative',
    catalogStarCount: 5070,
    calculation: 'calculateSky / astronomy-engine',
    refraction: 'normal',
    projection: 'azimuthal-equidistant',
    selection: 'SM2-B',
    catalogHash: null,
  },
  objects: [
    { kind: 'sun', id: 'sun', altitude: 45, azimuth: 0, x: 0, y: -0.5, distanceKm: 150000000 },
    {
      kind: 'moon',
      id: 'moon',
      altitude: 0,
      azimuth: 90,
      x: -1,
      y: 0,
      phase: 'first-quarter',
      phaseAngle: 90,
      illumination: 0.5,
      waxing: true,
      distanceKm: 380000,
    },
    {
      kind: 'star',
      id: 'hyg-1',
      name: '',
      altitude: 45,
      azimuth: 270,
      x: 0.5,
      y: 0,
      magnitude: 1.1,
      colorIndex: 0.2,
    },
  ],
};

function artwork(theme: 'midnight' | 'paper' = 'midnight', locale: 'en' | 'zh-Hans' = 'en'): SkyArtwork {
  return createSkyArtwork({
    event,
    snapshot,
    theme,
    locale,
    title: locale === 'en' ? 'Our imaginary evening' : '想象中的美好夜晚',
    phrase: locale === 'en' ? 'A fictional keepsake ✨' : '虚构纪念 ✨',
  });
}

const fonts = Object.freeze({ status: 'ready' as const, family: 'system-ui' as const });
const fallback = Object.freeze({ status: 'fallback' as const, family: 'sans-serif' as const });

/** Small structural PNG fixture. A real PNG is decoded by the browser tests. */
function png(width: number, height: number, type = 'image/png'): Blob {
  const bytes = new Uint8Array(65);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  bytes.set([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130], 53);
  return new Blob([bytes], { type });
}

function fixtureCanvas(
  config: {
    readonly encode?: (callback: BlobCallback, canvas: SkyArtworkCanvas) => void;
    readonly noContext?: boolean;
    readonly badPixels?: boolean;
  } = {},
) {
  const canvases: SkyArtworkCanvas[] = [];
  const painted: string[][] = [];
  const createCanvas = (): SkyArtworkCanvas => {
    const fills: string[] = [];
    const canvas: SkyArtworkCanvas = {
      width: 0,
      height: 0,
      getContext: (_kind) => (config.noContext ? null : ctx),
      toBlob(callback) {
        if (config.encode) return config.encode(callback, canvas);
        callback(png(canvas.width, canvas.height));
      },
    };
    const state: Record<string, unknown> = {
      canvas,
      font: '',
      fillStyle: '',
      strokeStyle: '',
      textAlign: 'center',
      textBaseline: 'middle',
      globalAlpha: 1,
      lineWidth: 1,
    };
    const ctx = new Proxy(state, {
      get(target, property) {
        if (property in target) return target[String(property)];
        if (property === 'measureText') {
          return (text: string) => {
            const size = Number(/\d+(?=px)/u.exec(String(state.font))?.[0] ?? 16);
            return { width: [...text].length * size * 0.55 };
          };
        }
        if (property === 'getImageData') {
          return (x: number) => ({
            data: new Uint8ClampedArray(config.badPixels ? [0, 0, 0, 0] : [x ? 38 : 20, 25, 45, 255]),
          });
        }
        if (property === 'createLinearGradient' || property === 'createRadialGradient') {
          return () => ({ addColorStop: () => undefined });
        }
        if (property === 'fillText') {
          return (text: string) => {
            fills.push(text);
          };
        }
        return () => undefined;
      },
      set(target, property, value) {
        target[String(property)] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    canvases.push(canvas);
    painted.push(fills);
    return canvas;
  };
  return { canvases, painted, createCanvas };
}

function options(model = artwork(), createCanvas = fixtureCanvas().createCanvas): SkyArtworkExportOptions {
  return { artwork: model, createCanvas, prepareFonts: async () => fonts };
}

async function expectCode(task: Promise<unknown>, code: SkyArtworkExportError['code']) {
  await expect(task).rejects.toMatchObject({ name: 'SkyArtworkExportError', code });
}

describe('SM3-B vector PNG encoding and layout', () => {
  it('exports standard 1200 x 1500 MIME PNG with an owned File and explicit request ID', async () => {
    const mock = fixtureCanvas();
    const output = await exportSkyChartPng({
      ...options(artwork(), mock.createCanvas),
      requestId: 'revision-7',
    });
    expect(SKY_CHART_PNG_SIZES).toEqual([
      { width: 1200, height: 1500 },
      { width: 960, height: 1200 },
    ]);
    expect([output.width, output.height, output.blob.type, output.filename, output.requestId]).toEqual([
      1200,
      1500,
      'image/png',
      'elsewhere-sky-2026-06-21.png',
      'revision-7',
    ]);
    expect(output.blob.size).toBeGreaterThan(0);
    expect(createSkyArtworkFile(output).name).toBe(output.filename);
    expect(mock.canvases[0].width).toBe(0);
    expect(mock.canvases[0].height).toBe(0);
    releaseSkyArtworkExport(output);
    expect(output.released).toBe(true);
    expect(() => output.blob).toThrow();
  });

  it.each(['midnight', 'paper'] as const)(
    'draws the existing %s theme and all scientific credits',
    async (theme) => {
      const mock = fixtureCanvas();
      const art = artwork(theme);
      const before = JSON.stringify(art);
      const output = await exportSkyChartPng(options(art, mock.createCanvas));
      const strings = mock.painted[0].join(' ');
      expect(strings).toContain('Astronomy Engine');
      expect(strings).toContain('CC BY-SA 4.0');
      expect(strings).toContain('Reference time');
      expect(strings).toContain('Daytime diagram');
      expect(strings).toContain('Our imaginary evening');
      expect(strings).toContain('A fictional keepsake');
      expect(JSON.stringify(art)).toBe(before);
      output.release();
    },
  );

  it('preserves Chinese serif title, phrase, reference time, UTC offset and credits', async () => {
    const mock = fixtureCanvas();
    const output = await exportSkyChartPng(options(artwork('paper', 'zh-Hans'), mock.createCanvas));
    const strings = mock.painted[0].join(' ');
    for (const term of ['想象中的美好夜晚', '虚构纪念', '21:15', '−04:00', '参考时刻', 'CC BY-SA 4.0']) {
      expect(strings).toContain(term);
    }
    output.release();
  });

  it('never substitutes UTC date, current clock or default 22:00 for local saved reference time', async () => {
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Current time consulted.');
    });
    try {
      const output = await exportSkyChartPng(options());
      expect(output.filename).toBe('elsewhere-sky-2026-06-21.png');
      output.release();
      expect(clock).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });

  it('uses identical layout centers in both themes and no new astronomy calculations', async () => {
    const midnight = fixtureCanvas();
    const paper = fixtureCanvas();
    await exportSkyChartPng(options(artwork('midnight'), midnight.createCanvas));
    await exportSkyChartPng(options(artwork('paper'), paper.createCanvas));
    expect(midnight.painted[0]).toEqual(paper.painted[0]);
    expect(snapshot.objects.map(({ x, y }) => [x, y])).toEqual([
      [0, -0.5],
      [-1, 0],
      [0.5, 0],
    ]);
  });

  it('keeps combining characters and emoji intact in literal fillText', async () => {
    const mock = fixtureCanvas();
    const art = createSkyArtwork({
      event,
      snapshot,
      locale: 'en',
      theme: 'midnight',
      title: 'Cafe\u0301 ☁️',
      phrase: 'Together 👩‍🚀 🌙',
    });
    await exportSkyChartPng(options(art, mock.createCanvas));
    expect(mock.painted[0].join(' ')).toContain('Café');
    expect(mock.painted[0].join(' ')).toContain('👩‍🚀');
  });

  it('rejects unreadable text before encoding, rather than downscaling or clipping', async () => {
    const mock = fixtureCanvas();
    const bad = { ...artwork(), location: 'W'.repeat(180) };
    await expectCode(exportSkyChartPng(options(bad, mock.createCanvas)), 'layout-failed');
    expect(mock.canvases).toHaveLength(1);
    expect(mock.canvases[0].width).toBe(0);
  });

  it('rejects contradictory source snapshot and does not allocate a canvas', async () => {
    const mock = fixtureCanvas();
    const bad = { ...artwork(), snapshot: { ...snapshot, utc: '2026-06-21T01:15:00.000Z' } };
    await expectCode(exportSkyChartPng(options(bad, mock.createCanvas)), 'invalid-artwork');
    expect(mock.canvases).toHaveLength(0);
  });

  it('uses a new fallback layout after font preparation fails', async () => {
    const mock = fixtureCanvas();
    const output = await exportSkyChartPng({
      ...options(artwork(), mock.createCanvas),
      prepareFonts: async () => {
        throw new Error('Font unavailable.');
      },
    });
    expect(output.width).toBe(1200);
    output.release();
    const fallbackOutput = await exportSkyChartPng({
      ...options(artwork(), mock.createCanvas),
      prepareFonts: async () => fallback,
    });
    fallbackOutput.release();
  });

  it('handles toBlob(null), then makes exactly one lower-res vector pass', async () => {
    const mock = fixtureCanvas({
      encode: (callback, canvas) => callback(canvas.width === 1200 ? null : png(960, 1200)),
    });
    const output = await exportSkyChartPng(options(artwork(), mock.createCanvas));
    expect([output.width, output.height]).toEqual([960, 1200]);
    expect(mock.canvases).toHaveLength(2);
    expect(mock.canvases.map((canvas) => [canvas.width, canvas.height])).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(mock.painted[0]).toEqual(mock.painted[1]);
    output.release();
  });

  it('catches thrown encoding errors, clears both backing stores, and terminates after two tries', async () => {
    const mock = fixtureCanvas({
      encode: () => {
        throw new Error('encode failed');
      },
    });
    await expectCode(exportSkyChartPng(options(artwork(), mock.createCanvas)), 'png-encoding-failed');
    expect(mock.canvases).toHaveLength(2);
    expect(mock.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });

  it('rejects wrong MIME, empty, incorrect dimensions and corrupted PNG signature', async () => {
    for (const bad of [
      new Blob(),
      png(1200, 1500, 'image/jpeg'),
      png(960, 1200),
      new Blob([new Uint8Array(65)], { type: 'image/png' }),
    ]) {
      const mock = fixtureCanvas({ encode: (callback) => callback(bad) });
      await expectCode(exportSkyChartPng(options(artwork(), mock.createCanvas)), 'png-encoding-failed');
    }
  });

  it('reports exhausted allocation and context errors without leaks', async () => {
    const noContext = fixtureCanvas({ noContext: true });
    await expectCode(exportSkyChartPng(options(artwork(), noContext.createCanvas)), 'canvas-unavailable');
    expect(noContext.canvases).toHaveLength(2);
    const allocation = () => {
      throw new Error('out of memory');
    };
    await expectCode(exportSkyChartPng(options(artwork(), allocation)), 'canvas-unavailable');
  });

  it('detects a clear or flat missing background before encoding', async () => {
    const mock = fixtureCanvas({ badPixels: true });
    await expectCode(exportSkyChartPng(options(artwork(), mock.createCanvas)), 'png-encoding-failed');
    expect(mock.canvases).toHaveLength(1);
  });
});

describe('SM3-B ownership, concurrency, download and share adapters', () => {
  it('leases and revokes Object URLs exactly once on release, including repeat calls', async () => {
    const result = await exportSkyChartPng(options());
    const createObjectURL = vi.fn(() => 'blob:fictional');
    const revokeObjectURL = vi.fn();
    const urls = { createObjectURL, revokeObjectURL };
    const a = result.objectUrl(urls);
    const b = result.objectUrl(urls);
    expect(a.url).toBe('blob:fictional');
    a.release();
    a.release();
    result.release();
    b.release();
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(() => result.objectUrl(urls)).toThrow();
  });

  it('discards an old native toBlob completion when newer artwork wins', async () => {
    let finish: BlobCallback | undefined;
    const slow = fixtureCanvas({
      encode: (callback) => {
        finish = callback;
      },
    });
    const coordinator = createSkyArtworkExportCoordinator();
    const a = coordinator.export(artwork(), {
      createCanvas: slow.createCanvas,
      prepareFonts: async () => fonts,
    });
    // Allow the first request to enter the fake native encoder.
    await Promise.resolve();
    await Promise.resolve();
    const newer = await coordinator.export(artwork('paper'), {
      createCanvas: fixtureCanvas().createCanvas,
      prepareFonts: async () => fonts,
    });
    finish?.(png(1200, 1500));
    await expectCode(a, 'aborted');
    expect(newer.requestId).toBeGreaterThan(0);
    coordinator.dispose();
    expect(newer.released).toBe(true);
  });

  it('honors AbortSignal even when the underlying encoder does not cancel', async () => {
    let finish: BlobCallback | undefined;
    const mock = fixtureCanvas({
      encode: (callback) => {
        finish = callback;
      },
    });
    const controller = new AbortController();
    const pending = exportSkyChartPng({
      ...options(artwork(), mock.createCanvas),
      signal: controller.signal,
    });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    finish?.(png(1200, 1500));
    await expectCode(pending, 'aborted');
    expect(mock.canvases[0].width).toBe(0);
  });

  it('downloads via an ephemeral anchor and holds the lease until handoff release', async () => {
    const output = await exportSkyChartPng(options());
    const revoked = vi.fn();
    const clicked = vi.fn();
    const anchor = { href: '', download: '', rel: '', click: clicked, remove: vi.fn() };
    const deferred: (() => void)[] = [];
    const result = downloadSkyArtwork(output, {
      createAnchor: () => anchor as unknown as HTMLAnchorElement,
      append: vi.fn(),
      urls: { createObjectURL: () => 'blob:test', revokeObjectURL: revoked },
      deferRelease: (release) => {
        deferred.push(release);
      },
    });
    expect(result.status).toBe('download-requested');
    expect(anchor.download).toBe('elsewhere-sky-2026-06-21.png');
    expect(clicked).toHaveBeenCalledOnce();
    expect(revoked).not.toHaveBeenCalled();
    output.release();
    expect(revoked).not.toHaveBeenCalled();
    deferred[0]();
    result.release();
    expect(revoked).toHaveBeenCalledOnce();
    output.release();
  });

  it('falls back to opening the image when download attr is absent', async () => {
    const output = await exportSkyChartPng(options());
    const opened = vi.fn(() => true);
    const result = downloadSkyArtwork(output, {
      createAnchor: () => ({ remove: () => undefined }) as HTMLAnchorElement,
      openImage: opened,
      urls: { createObjectURL: () => 'blob:example', revokeObjectURL: vi.fn() },
      deferRelease: (release) => release(),
    });
    expect(result.status).toBe('open-requested');
    expect(opened).toHaveBeenCalledWith('blob:example');
    output.release();
  });

  // prettier-ignore
  it('requests a noopener image tab without using a window.open handle or revoking early', async () => {
    const output = await exportSkyChartPng(options());
    const revoked = vi.fn();
    const clicked = vi.fn();
    const appended = vi.fn();
    const anchor = { href: '', target: '', rel: '', click: clicked, remove: vi.fn() };
    const deferred: Array<() => void> = [];
    const result = downloadSkyArtwork(output, {
      createAnchor: () => anchor as unknown as HTMLAnchorElement,
      append: appended,
      urls: { createObjectURL: () => 'blob:manual-save', revokeObjectURL: revoked },
      deferRelease: (release) => {
        deferred.push(release);
      },
    });
    expect(result.status).toBe('open-requested');
    expect(anchor.href).toBe('blob:manual-save');
    expect(anchor.target).toBe('_blank');
    expect(anchor.rel).toBe('noopener');
    expect(appended).toHaveBeenCalledWith(anchor);
    expect(clicked).toHaveBeenCalledOnce();
    expect(revoked).not.toHaveBeenCalled();
    output.release();
    expect(revoked).not.toHaveBeenCalled();
    deferred[0]();
    result.release();
    expect(revoked).toHaveBeenCalledOnce();
  });

  // prettier-ignore
  it('revokes the fallback URL if opening the image throws', async () => {
    const output = await exportSkyChartPng(options());
    const revoked = vi.fn();
    const anchor = {
      href: '',
      target: '',
      rel: '',
      remove: vi.fn(),
      click: () => {
        throw new Error('Navigation failed');
      },
    };
    expect(() =>
      downloadSkyArtwork(output, {
        createAnchor: () => anchor as unknown as HTMLAnchorElement,
        append: vi.fn(),
        urls: { createObjectURL: () => 'blob:blocked-popup', revokeObjectURL: revoked },
      }),
    ).toThrow(SkyArtworkExportError);
    expect(revoked).toHaveBeenCalledOnce();
    output.release();
  });

  it('does not report a blocked download as a saved file', async () => {
    const output = await exportSkyChartPng(options());
    const revoke = vi.fn();
    const anchor = {
      href: '',
      download: '',
      rel: '',
      remove: vi.fn(),
      click: () => {
        throw new Error('blocked');
      },
    };
    expect(() =>
      downloadSkyArtwork(output, {
        createAnchor: () => anchor as unknown as HTMLAnchorElement,
        append: vi.fn(),
        urls: { createObjectURL: () => 'blob:blocked', revokeObjectURL: revoke },
      }),
    ).toThrow(SkyArtworkExportError);
    expect(revoke).toHaveBeenCalledOnce();
    output.release();
  });

  it('distinguishes file share, text-only share and missing Web Share', async () => {
    const output = await exportSkyChartPng(options());
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn(() => true);
    expect(skyArtworkShareCapability(output, { share, canShare })).toBe('files');
    expect(await shareSkyArtwork(output, { share, canShare })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [output.file] });
    expect(skyArtworkShareCapability(output, { share, canShare: () => false })).toBe('text-only');
    expect(skyArtworkShareCapability(output, { share })).toBe('text-only');
    expect(skyArtworkShareCapability(output, {})).toBe('unavailable');
    expect(() => shareSkyArtwork(output, { share })).toThrow();
    output.release();
  });

  it('does not report native share cancellation as success or a program failure', async () => {
    const output = await exportSkyChartPng(options());
    const port = {
      canShare: () => true,
      share: () => Promise.reject(new DOMException('cancel', 'AbortError')),
    };
    expect(await shareSkyArtwork(output, port)).toBe('cancelled');
    await expectCode(
      shareSkyArtwork(output, {
        canShare: () => true,
        share: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
      }),
      'share-rejected',
    );
    output.release();
  });

  it('does not expose share or download after output release', async () => {
    const output = await exportSkyChartPng(options());
    output.release();
    expect(() => output.file).toThrow();
    expect(() =>
      skyArtworkShareCapability(output, { canShare: () => true, share: async () => undefined }),
    ).toThrow();
  });
});

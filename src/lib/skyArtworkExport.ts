import { assertDrawableSkyChartSnapshot, type SkyArtwork } from './skyArtwork';
import {
  SKY_CHART_ARTWORK_SIZE,
  SkyChartLayoutError,
  canvasSkyChartTextMetrics,
  drawSkyChartArtwork,
  layoutSkyChartArtwork,
  prepareSkyChartFonts,
  type SkyChartFonts,
} from '../moment/skyChart';

/** SM3-B lives behind an on-demand import; no DOM, clock or resources at module evaluation. */
export type SkyArtworkExportErrorCode =
  | 'invalid-artwork'
  | 'resources-unavailable'
  | 'layout-failed'
  | 'canvas-unavailable'
  | 'png-encoding-failed'
  | 'aborted'
  | 'file-unsupported'
  | 'download-unavailable'
  | 'download-failed'
  | 'share-unavailable'
  | 'share-rejected';

export class SkyArtworkExportError extends Error {
  constructor(
    public readonly code: SkyArtworkExportErrorCode,
    message: string,
    public readonly retryable = false,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'SkyArtworkExportError';
  }
}

export interface SkyArtworkCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): CanvasRenderingContext2D | null;
  toBlob(callback: BlobCallback, type?: string): void;
}

export interface SkyArtworkExportOptions {
  readonly artwork: SkyArtwork;
  readonly signal?: AbortSignal;
  /** Caller-owned artwork revision; the coordinator supplies a monotonic request ID. */
  readonly requestId?: string | number;
  readonly createCanvas?: () => SkyArtworkCanvas;
  readonly prepareFonts?: () => Promise<SkyChartFonts>;
  /** For deterministic unit tests or alternative native Canvas encoders. */
  readonly encodePng?: (canvas: SkyArtworkCanvas) => Promise<Blob>;
}

export const SKY_CHART_PNG_SIZES = Object.freeze([
  Object.freeze({ width: SKY_CHART_ARTWORK_SIZE.width, height: SKY_CHART_ARTWORK_SIZE.height }),
  Object.freeze({ width: 960, height: 1200 }),
] as const);
export const SKY_CHART_PNG_MAX_EDGE = 1500;
export const SKY_CHART_PNG_MAX_PIXELS = 1800000;

function aborted(): SkyArtworkExportError {
  return new SkyArtworkExportError('aborted', 'Sky chart export is no longer current.');
}

function ensureCurrent(signal?: AbortSignal): void {
  if (signal?.aborted) throw aborted();
}

/** Stop accepting results immediately even if Canvas toBlob cannot be interrupted. */
function awaitActive<T>(task: Promise<T>, signal?: AbortSignal): Promise<T> {
  ensureCurrent(signal);
  if (!signal) return task;
  return new Promise<T>((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener('abort', cancel);
      reject(aborted());
    };
    signal.addEventListener('abort', cancel, { once: true });
    task.then(
      (value) => {
        signal.removeEventListener('abort', cancel);
        if (signal.aborted) reject(aborted());
        else resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', cancel);
        reject(signal.aborted ? aborted() : error);
      },
    );
  });
}

function assertArtwork(artwork: SkyArtwork): string {
  try {
    if (!artwork || artwork.formatVersion !== 1 || !artwork.civilTime) {
      throw new TypeError('A validated SM3-A artwork is required.');
    }
    assertDrawableSkyChartSnapshot(artwork.snapshot);
    const time = artwork.civilTime;
    if (
      !/^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$/.test(time.localDate) ||
      time.utc !== artwork.snapshot.utc ||
      time.kind !== artwork.snapshot.time.kind ||
      time.offset !== artwork.snapshot.time.offset ||
      (time.kind === 'reference' && time.referenceSource !== artwork.snapshot.time.referenceSource)
    ) {
      throw new RangeError('The saved event and snapshot are inconsistent.');
    }
    return 'elsewhere-sky-' + time.localDate + '.png';
  } catch (error) {
    throw new SkyArtworkExportError('invalid-artwork', 'Invalid or incomplete sky chart artwork.', false, error);
  }
}

function defaultCanvas(): SkyArtworkCanvas {
  if (typeof document === 'undefined') {
    throw new SkyArtworkExportError('canvas-unavailable', 'A document Canvas is not available.');
  }
  return document.createElement('canvas');
}

function browserEncode(canvas: SkyArtworkCanvas): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new SkyArtworkExportError('png-encoding-failed', 'Canvas returned no PNG.', true)),
        'image/png',
      );
    } catch (error) {
      reject(new SkyArtworkExportError('png-encoding-failed', 'Canvas PNG encoding threw.', true, error));
    }
  });
}

function bigEndian(bytes: Uint8Array, start: number): number {
  return (
    bytes[start] * 0x1000000 +
    bytes[start + 1] * 0x10000 +
    bytes[start + 2] * 0x100 +
    bytes[start + 3]
  );
}

/** Inspect PNG signature, IHDR, dimensions and the final IEND, not merely Blob.type. */
async function assertEncodedPng(blob: Blob, width: number, height: number): Promise<void> {
  if (!(blob instanceof Blob) || blob.type !== 'image/png' || blob.size < 57) {
    throw new SkyArtworkExportError('png-encoding-failed', 'Encoder returned an empty or non-PNG Blob.');
  }
  const header = new Uint8Array(await blob.slice(0, 33).arrayBuffer());
  const end = new Uint8Array(await blob.slice(-12).arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    !signature.every((byte, index) => header[index] === byte) ||
    bigEndian(header, 8) !== 13 ||
    String.fromCharCode(...header.slice(12, 16)) !== 'IHDR' ||
    bigEndian(header, 16) !== width ||
    bigEndian(header, 20) !== height ||
    ![1, 2, 4, 8, 16].includes(header[24]) ||
    ![0, 2, 3, 4, 6].includes(header[25]) ||
    header[26] !== 0 ||
    header[27] !== 0 ||
    (header[28] !== 0 && header[28] !== 1) ||
    bigEndian(end, 0) !== 0 ||
    String.fromCharCode(...end.slice(4, 8)) !== 'IEND' ||
    ![174, 66, 96, 130].every((byte, index) => end[index + 8] === byte)
  ) {
    throw new SkyArtworkExportError(
      'png-encoding-failed',
      'Encoded PNG has an invalid header, dimensions, or ending.',
    );
  }
}

/** Catch cleared/transparent/flat Canvas output without constructing a second preview bitmap. */
function assertPaintedCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  try {
    const samples = [
      [0, 0],
      [Math.floor(width / 2), Math.floor(height / 2)],
      [width - 1, height - 1],
    ];
    let first = '';
    let varied = false;
    for (const [x, y] of samples) {
      const rgba = ctx.getImageData(x, y, 1, 1).data;
      if (rgba.length < 4 || rgba[3] !== 255) {
        throw new Error('Transparent or missing artwork background.');
      }
      const rgb = [rgba[0], rgba[1], rgba[2]].join(',');
      if (first && first !== rgb) varied = true;
      first ||= rgb;
    }
    if (!varied) throw new Error('Artwork appears to be a single blank color.');
  } catch (error) {
    throw new SkyArtworkExportError('png-encoding-failed', 'Canvas artwork pixels are incomplete.', false, error);
  }
}

export interface SkyArtworkUrlLease {
  readonly url: string;
  release(): void;
}

export interface SkyArtworkUrlPort {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

/**
 * A result owns its Blob, optional File and preview URL leases. After release,
 * accessors reject and every outstanding preview lease is invalidated.
 * A browser-initiated download owns a separate, time-delayed URL (delivery module).
 */
export class SkyArtworkPng {
  private payload: Blob | null;
  private cachedFile: File | null = null;
  private readonly urlReleases = new Set<() => void>();

  constructor(
    blob: Blob,
    public readonly filename: string,
    public readonly width: number,
    public readonly height: number,
    public readonly requestId: string | number,
    public readonly artworkVersion: 1 = 1,
  ) {
    this.payload = blob;
  }

  get released(): boolean {
    return this.payload === null;
  }

  get blob(): Blob {
    if (!this.payload) throw aborted();
    return this.payload;
  }

  get file(): File {
    if (!this.payload) throw aborted();
    if (!this.cachedFile) {
      if (typeof File === 'undefined') {
        throw new SkyArtworkExportError('file-unsupported', 'This browser cannot construct image Files.');
      }
      try {
        this.cachedFile = new File([this.payload], this.filename, { type: 'image/png' });
      } catch (error) {
        throw new SkyArtworkExportError('file-unsupported', 'Cannot construct an image File.', false, error);
      }
    }
    return this.cachedFile;
  }

  objectUrl(port?: SkyArtworkUrlPort): SkyArtworkUrlLease {
    const adapter = port ?? (typeof URL === 'undefined' ? undefined : URL);
    if (!adapter || typeof adapter.createObjectURL !== 'function') {
      throw new SkyArtworkExportError('resources-unavailable', 'Blob URLs are unavailable.');
    }
    const url = adapter.createObjectURL(this.blob);
    let active = true;
    const release = () => {
      if (!active) return;
      active = false;
      this.urlReleases.delete(release);
      adapter.revokeObjectURL(url);
    };
    this.urlReleases.add(release);
    return { url, release };
  }

  release(): void {
    for (const release of [...this.urlReleases]) release();
    this.payload = null;
    this.cachedFile = null;
  }
}

export function createSkyArtworkFile(output: SkyArtworkPng): File {
  return output.file;
}

export function releaseSkyArtworkExport(output: SkyArtworkPng): void {
  output.release();
}

/** Only allocation/encoding capacity failures are eligible for one smaller vector repaint. */
async function attempt(
  artwork: SkyArtwork,
  size: (typeof SKY_CHART_PNG_SIZES)[number],
  fonts: SkyChartFonts,
  options: SkyArtworkExportOptions,
): Promise<Blob> {
  const { width, height } = size;
  if (
    width > SKY_CHART_PNG_MAX_EDGE ||
    height > SKY_CHART_PNG_MAX_EDGE ||
    width * height > SKY_CHART_PNG_MAX_PIXELS
  ) {
    throw new SkyArtworkExportError('resources-unavailable', 'Canvas dimensions exceed the export budget.');
  }
  let canvas: SkyArtworkCanvas | null = null;
  try {
    ensureCurrent(options.signal);
    try {
      canvas = (options.createCanvas ?? defaultCanvas)();
      canvas.width = width;
      canvas.height = height;
      if (canvas.width !== width || canvas.height !== height) throw new Error('Canvas allocation truncated.');
    } catch (error) {
      throw new SkyArtworkExportError('canvas-unavailable', 'Cannot allocate sky chart Canvas.', true, error);
    }
    let ctx: CanvasRenderingContext2D | null;
    try {
      ctx = canvas.getContext('2d');
    } catch (error) {
      throw new SkyArtworkExportError('canvas-unavailable', 'Cannot create Canvas 2D context.', true, error);
    }
    if (!ctx) {
      throw new SkyArtworkExportError('canvas-unavailable', 'Canvas 2D context is unavailable.', true);
    }
    try {
      const layout = layoutSkyChartArtwork(artwork, canvasSkyChartTextMetrics(ctx), fonts);
      drawSkyChartArtwork(ctx, layout, fonts);
    } catch (error) {
      if (error instanceof SkyChartLayoutError) {
        throw new SkyArtworkExportError('layout-failed', error.message, false, error);
      }
      throw new SkyArtworkExportError('layout-failed', 'Sky chart vector drawing failed.', false, error);
    }
    assertPaintedCanvas(ctx, width, height);
    ensureCurrent(options.signal);
    let blob: Blob;
    try {
      blob = await awaitActive((options.encodePng ?? browserEncode)(canvas), options.signal);
    } catch (error) {
      if (error instanceof SkyArtworkExportError) throw error;
      throw new SkyArtworkExportError('png-encoding-failed', 'Canvas PNG encoding failed.', true, error);
    }
    ensureCurrent(options.signal);
    await awaitActive(assertEncodedPng(blob, width, height), options.signal);
    ensureCurrent(options.signal);
    return blob;
  } finally {
    // Setting Canvas size to zero drops the backing store on success, failure and abort.
    if (canvas) {
      try {
        canvas.width = 0;
        canvas.height = 0;
      } catch {
        // The document and result own no Canvas after this stack unwinds.
      }
    }
  }
}

/**
 * One ready SM3-A artwork -> one validated PNG, with exactly one bounded fallback.
 * The artwork's local civil date is used verbatim; no DST, celestial or clock recalculation.
 */
export async function exportSkyChartPng(options: SkyArtworkExportOptions): Promise<SkyArtworkPng> {
  ensureCurrent(options.signal);
  const filename = assertArtwork(options.artwork);
  let fonts: SkyChartFonts;
  try {
    fonts = await awaitActive((options.prepareFonts ?? prepareSkyChartFonts)(), options.signal);
  } catch (error) {
    if (options.signal?.aborted) throw aborted();
    // An explicit fallback requires a brand-new layout measured in the fallback fonts.
    fonts = Object.freeze({ status: 'fallback', family: 'sans-serif' });
    void error;
  }
  ensureCurrent(options.signal);
  for (const [index, size] of SKY_CHART_PNG_SIZES.entries()) {
    try {
      const blob = await attempt(options.artwork, size, fonts, options);
      ensureCurrent(options.signal);
      return new SkyArtworkPng(blob, filename, size.width, size.height, options.requestId ?? 0);
    } catch (error) {
      if (options.signal?.aborted) throw aborted();
      if (
        index === 0 &&
        error instanceof SkyArtworkExportError &&
        error.retryable &&
        (error.code === 'canvas-unavailable' || error.code === 'png-encoding-failed')
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new SkyArtworkExportError('resources-unavailable', 'Neither PNG output size was supported.');
}

export interface SkyArtworkExportCoordinator {
  export(artwork: SkyArtwork, options?: Omit<SkyArtworkExportOptions, 'artwork' | 'signal' | 'requestId'>): Promise<SkyArtworkPng>;
  cancel(): void;
  dispose(): void;
}

/**
 * Each new request invalidates the previous one. Native toBlob may still run,
 * but stale completions cannot publish a File or object URL.
 */
export function createSkyArtworkExportCoordinator(): SkyArtworkExportCoordinator {
  let revision = 0;
  let active: AbortController | null = null;
  let current: SkyArtworkPng | null = null;
  const cancel = () => {
    revision++;
    active?.abort();
    active = null;
    current?.release();
    current = null;
  };
  return {
    async export(artwork, options = {}) {
      cancel();
      const id = revision;
      const controller = new AbortController();
      active = controller;
      try {
        const output = await exportSkyChartPng({
          ...options,
          artwork,
          signal: controller.signal,
          requestId: id,
        });
        if (id !== revision || controller.signal.aborted) {
          output.release();
          throw aborted();
        }
        current = output;
        return output;
      } finally {
        if (active === controller) active = null;
      }
    },
    cancel,
    dispose: cancel,
  };
}

import { canvasUnavailable } from '../errors';

/** A canvas Sky Engine renders into: a DOM canvas, or an OffscreenCanvas (for example in a Worker). */
export type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;
/** The 2D context of a {@link RenderCanvas}. */
export type RenderContext2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** Decoded artwork: an `<img>` element, or an ImageBitmap (the only choice inside a Worker). */
export type RenderImage = HTMLImageElement | ImageBitmap;

/** The 2D context of either kind of canvas (one call site for the two DOM overload sets). */
export function context2d(
  canvas: RenderCanvas,
  settings?: CanvasRenderingContext2DSettings,
): RenderContext2D | null {
  return (canvas as OffscreenCanvas).getContext('2d', settings);
}

/**
 * A private working canvas. Wherever a document exists it is a document canvas, so main-thread
 * output stays exactly as before and browser differences in OffscreenCanvas (Safari, for example,
 * has no `ctx.filter` there) cannot matter; only without a document, as in a Worker, is it an
 * OffscreenCanvas. Null when neither exists.
 */
export function createScratchCanvas(width: number, height: number): RenderCanvas | null {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  return null;
}

/** A working canvas and its 2D context, or SkyEngineError UNSUPPORTED. */
export function requireScratchContext(
  width: number,
  height: number,
  settings?: CanvasRenderingContext2DSettings,
): RenderContext2D {
  const canvas = createScratchCanvas(width, height);
  const ctx = canvas && context2d(canvas, settings);
  if (!ctx) throw canvasUnavailable();
  return ctx;
}

/** Intrinsic size of decoded artwork: natural size for an `<img>`, pixel size for an ImageBitmap. */
export function imageSize(image: RenderImage): { width: number; height: number } {
  return 'naturalWidth' in image
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : { width: image.width, height: image.height };
}

/** Whether artwork is decoded and drawable: a complete `<img>`, or an open ImageBitmap. */
export function isDecodedImage(image: RenderImage | null | undefined): image is RenderImage {
  if (!image || typeof image !== 'object') return false;
  if ('naturalWidth' in image && !image.complete) return false;
  const { width, height } = imageSize(image);
  return width > 0 && height > 0;
}

import { validateAspect } from '../validation';
import { canvasUnavailable, invalidInput } from '../errors';
import { context2d, type RenderCanvas, type RenderContext2D } from './scratchCanvas';

export function requireImageSize(canvas: RenderCanvas, minimum = 1): { width: number; height: number } {
  const { width, height } = canvas;
  if (![width, height].every((n) => Number.isInteger(n) && n >= minimum && n <= 4096)) {
    throw invalidInput('Invalid image canvas dimensions.');
  }
  validateAspect(width / height);
  return { width, height };
}

/** The caller's 2D context, or SkyEngineError UNSUPPORTED. */
export function requireContext(canvas: RenderCanvas): RenderContext2D {
  const ctx = context2d(canvas);
  if (!ctx) throw canvasUnavailable();
  return ctx;
}

/** Reset the caller's Canvas 2D state only after input validation. */
export function resetImageCanvas(canvas: RenderCanvas): RenderContext2D {
  const ctx = requireContext(canvas);
  // Setting the width, even to the current value, clears the bitmap and the 2D state (for an
  // OffscreenCanvas as for a DOM canvas).
  const { width } = canvas;
  canvas.width = width;
  return ctx;
}

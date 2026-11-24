import { validateAspect } from '../validation';

export function requireImageSize(canvas: HTMLCanvasElement, minimum = 1): { width: number; height: number } {
  const { width, height } = canvas;
  if (![width, height].every((n) => Number.isInteger(n) && n >= minimum && n <= 4096)) {
    throw new RangeError('Invalid image canvas dimensions.');
  }
  validateAspect(width / height);
  return { width, height };
}

/** Reset the caller's Canvas 2D state only after input validation. */
export function resetImageCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  // Setting the width, even to the current value, clears the bitmap and the 2D state.
  const { width } = canvas;
  canvas.width = width;
  return ctx;
}

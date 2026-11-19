import type { Locator, Page } from '@playwright/test';

/** Relative luminance (WCAG) of an sRGB pixel, 0–1. */
export function luminance(r: number, g: number, b: number): number {
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export interface Pixels {
  width: number;
  height: number;
  /** Luminance at CSS pixel (x, y) of the captured element. */
  at(x: number, y: number): number;
  all(): number[];
}

/** Capture an element at 1 CSS px per pixel and decode it in the page (no PNG dependency). */
export async function capture(page: Page, element: Locator): Promise<Pixels> {
  const png = await element.screenshot({ animations: 'disabled', scale: 'css' });
  const { width, height, data } = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return { width: canvas.width, height: canvas.height, data: Array.from(pixels) };
  }, png.toString('base64'));
  const lum = new Float64Array(width * height);
  for (let i = 0; i < lum.length; i++) lum[i] = luminance(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  return {
    width,
    height,
    at: (x, y) =>
      lum[
        Math.min(height - 1, Math.max(0, Math.round(y))) * width +
          Math.min(width - 1, Math.max(0, Math.round(x)))
      ],
    all: () => Array.from(lum),
  };
}

export function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
}

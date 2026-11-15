// Kept apart from resources.ts so the interface can wait for the font without loading three.js.

/**
 * Sky label font: Arial for Latin text as before, then Chinese system fonts, so a Chinese label
 * never falls back to a Japanese or missing glyph form.
 */
export const LABEL_FONT =
  '500 32px Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", sans-serif';

/**
 * Resolves once the label font can draw `sample` (or after `timeout` ms). Labels are drawn into
 * canvas textures once, so drawing before a font is ready would bake a fallback face into them.
 * System fonts resolve at once; a web font or a lazily loaded system CJK face may take a moment.
 */
export function labelFontReady(sample: string, timeout = 3000): Promise<void> {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fonts?.load) return Promise.resolve();
  return Promise.race([
    fonts.load(LABEL_FONT, sample).then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => setTimeout(resolve, timeout)),
  ]);
}

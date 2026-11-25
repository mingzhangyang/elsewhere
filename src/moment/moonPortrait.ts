import moonUrl from '../assets/moon-lroc.jpg';
import {
  installMoonTexture,
  loadMoonTexture,
  renderMoonPhase,
  type MoonPhaseOptions,
} from '../../packages/sky-engine/src/moment/moonPhase';
import type { MomentSnapshot } from '../lib/moment';

export type MoonPortraitSettings = Required<
  Pick<MoonPhaseOptions, 'orientation' | 'background' | 'earthshine'>
>;
export const DEFAULT_MOON_SETTINGS: MoonPortraitSettings = {
  orientation: 'observer',
  background: 'transparent',
  earthshine: true,
};

let texture: Promise<void> | undefined;

/** One in-flight decode for the thumbnail and all exports. A failed request can be retried. */
function prepareTexture(): Promise<void> {
  if (!texture) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    texture = loadMoonTexture(moonUrl, controller.signal)
      .then(installMoonTexture)
      .catch((error: unknown) => {
        texture = undefined;
        throw error;
      })
      .finally(() => clearTimeout(timeout));
  }
  return texture;
}

/** Render into a private canvas: a superseded request never touches the currently visible bitmap. */
export async function drawMoonPortrait(
  snapshot: MomentSnapshot,
  size: number,
  settings: MoonPortraitSettings = DEFAULT_MOON_SETTINGS,
  signal?: AbortSignal,
): Promise<HTMLCanvasElement> {
  await prepareTexture();
  // Large images are an explicit export action. Let the busy UI paint before the CPU work.
  if (size >= 1024) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (signal?.aborted) throw new Error('Moon portrait cancelled.');
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  await renderMoonPhase(canvas, snapshot, { style: 'realistic', ...settings, signal });
  return canvas;
}

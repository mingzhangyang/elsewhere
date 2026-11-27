import type { MomentSnapshot } from '../contracts';
import { drawIllustration, type IllustrationDetails, type IllustrationText } from './illustration';
import { paintFinish } from './paintFinish';
import { createCoverProjection } from './projection';
import { invalidInput } from '../errors';
import { requireStarCatalog } from '../domain/stars';
import { HORIZON_VARIANTS, type HorizonVariant } from './scenery';
import type { RenderContext2D, RenderImage } from './scratchCanvas';

export interface IllustrationPanelOptions extends IllustrationDetails {
  landscape?: HorizonVariant;
  landscapeArt?: RenderImage | null;
  text?: IllustrationText;
  font?: string;
  paintFinish?: boolean;
}

const defaultText: IllustrationText = { object: (object) => object.name, pattern: (id) => id };

/** Paint the top-left sky panel of an existing canvas, without owning its size or text layout. */
export function paintIllustrationPanel(
  ctx: RenderContext2D,
  width: number,
  height: number,
  snapshot: MomentSnapshot,
  options: IllustrationPanelOptions = {},
): void {
  const landscape = options.landscape ?? 'ridge';
  // The same check as renderIllustration, before anything is drawn.
  if (!HORIZON_VARIANTS.includes(landscape)) throw invalidInput('Invalid landscape.');
  if (options.catalog !== undefined) requireStarCatalog(options.catalog);
  const { toCanvas } = createCoverProjection(snapshot.view, snapshot.aspect, width, height);
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    drawIllustration(
      ctx,
      width,
      height,
      snapshot,
      toCanvas,
      landscape,
      options.text ?? defaultText,
      options.font ?? 'system-ui, sans-serif',
      options.landscapeArt,
      options,
    );
    if (options.paintFinish !== false) {
      paintFinish(ctx, 0, 0, width, height, Math.round(snapshot.instant.getTime() / 3600000));
    }
  } finally {
    ctx.restore();
  }
}

import type { MomentSnapshot } from '../contracts';
import { drawIllustration, type IllustrationDetails, type IllustrationText } from './illustration';
import { paintFinish } from './paintFinish';
import { createCoverProjection } from './projection';
import type { HorizonVariant } from './scenery';

export interface IllustrationPanelOptions extends IllustrationDetails {
  landscape?: HorizonVariant;
  landscapeArt?: HTMLImageElement | null;
  text?: IllustrationText;
  font?: string;
  paintFinish?: boolean;
}

const defaultText: IllustrationText = { object: (object) => object.name, pattern: (id) => id };

/** Paint the top-left sky panel of an existing canvas, without owning its size or text layout. */
export function paintIllustrationPanel(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: MomentSnapshot,
  options: IllustrationPanelOptions = {},
): void {
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
      options.landscape ?? 'ridge',
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

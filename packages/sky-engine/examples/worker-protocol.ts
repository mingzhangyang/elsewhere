// Messages between the page (worker-main.ts) and the Worker (worker-render.ts). Plain data only.
import type { SkySceneOptions } from '@orangely/sky-engine';

export type RenderKind = 'illustration' | 'chart' | 'map' | 'moon';

/** Messages from the page. */
export type WorkerRequest =
  | {
      type: 'init';
      canvas: OffscreenCanvas;
      catalogUrl: string;
      moonTextureUrl?: string;
      /** A web font for illustration labels, e.g. { family: 'Caveat', url: '/fonts/caveat.woff2' }. */
      font?: { family: string; url: string };
    }
  | {
      type: 'render';
      id: number;
      kind: RenderKind;
      observer: Pick<SkySceneOptions, 'latitude' | 'longitude' | 'timezone' | 'elevation'> & {
        instant: string;
      };
      width: number;
      height: number;
    };

/** Replies to the page. */
export type WorkerReply =
  | { type: 'ready' }
  | { type: 'rendered'; id: number; ms: number }
  | { type: 'failed'; id?: number; code: string; message: string };

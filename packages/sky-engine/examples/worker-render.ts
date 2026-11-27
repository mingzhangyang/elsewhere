// Sky Engine in a dedicated module Worker: the page hands over its canvas with
// transferControlToOffscreen() (see worker-main.ts), and every render runs here, off the main
// thread. Sky Engine itself contains no Worker; this file is the host's own code.
//
// Build it as a module Worker with your bundler, for example
//   new Worker(new URL('./worker-render.ts', import.meta.url), { type: 'module' })
// The star catalog, the Moon texture and any web font are fetched from URLs the page supplies.
import {
  createSkyScene,
  decodeStarColumns,
  installMoonTexture,
  loadMoonTexture,
  renderIllustration,
  renderMinimalSkyMap,
  renderMoonPhase,
  renderSkyChart,
  SkyEngineError,
  type MomentSnapshot,
  type SkySceneOptions,
} from '@orangely/sky-engine';

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
      kind: 'illustration' | 'chart' | 'map' | 'moon';
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

// The example is type-checked with the DOM library, where `self` is a Window. In a Worker it is
// the DedicatedWorkerGlobalScope; only these members are used.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerReply): void;
  fonts?: FontFaceSet;
};

let canvas: OffscreenCanvas | undefined;
let catalogUrl = '';
let labelFont: string | undefined;

async function init(request: Extract<WorkerRequest, { type: 'init' }>): Promise<void> {
  canvas = request.canvas;
  catalogUrl = request.catalogUrl;
  // A Worker has no <img>: loadMoonTexture() fetches and decodes with createImageBitmap, and the
  // decoded texture lives in this Worker's copy of Sky Engine (the page's copy is separate).
  if (request.moonTextureUrl) installMoonTexture(await loadMoonTexture(request.moonTextureUrl));
  // Text in a Worker can use only fonts the Worker itself knows: system fonts, or web fonts added
  // to self.fonts. A FontFace loaded by the page (document.fonts) is not visible here.
  if (request.font && scope.fonts) {
    const face = new FontFace(request.font.family, `url(${request.font.url})`);
    scope.fonts.add(face);
    await face.load();
    labelFont = `"${request.font.family}", system-ui, sans-serif`;
  }
}

async function render(request: Extract<WorkerRequest, { type: 'render' }>): Promise<number> {
  if (!canvas) throw new Error('Send init first.');
  // Resizing the OffscreenCanvas also resizes the page's placeholder canvas bitmap.
  canvas.width = request.width;
  canvas.height = request.height;
  const scene: MomentSnapshot = await createSkyScene({
    ...request.observer,
    instant: new Date(request.observer.instant),
    aspect: request.width / request.height,
    weather: 'clear',
    // Called once: later scenes reuse the installed catalog.
    loadCatalog: async (signal) => {
      const response = await fetch(catalogUrl, { signal });
      if (!response.ok) throw new Error('Star catalog unavailable: ' + response.status);
      return decodeStarColumns(await response.json());
    },
  });
  const start = performance.now();
  switch (request.kind) {
    case 'illustration':
      await renderIllustration(canvas, scene, {
        composition: 'auto',
        layers: { labels: true },
        font: labelFont,
        // City and mountain artwork would come from loadLandscape, decoded with createImageBitmap.
        landscape: 'ridge',
      });
      break;
    case 'chart':
      renderSkyChart(canvas, scene, { theme: 'midnight' });
      break;
    case 'map':
      renderMinimalSkyMap(canvas, scene, { layers: { lines: true } });
      break;
    case 'moon':
      await renderMoonPhase(canvas, scene, { background: 'dark', earthshine: true });
      break;
  }
  return performance.now() - start;
}

scope.onmessage = async (event) => {
  const request = event.data;
  try {
    if (request.type === 'init') {
      await init(request);
      scope.postMessage({ type: 'ready' });
    } else {
      scope.postMessage({ type: 'rendered', id: request.id, ms: await render(request) });
    }
  } catch (error) {
    scope.postMessage({
      type: 'failed',
      id: request.type === 'render' ? request.id : undefined,
      code: error instanceof SkyEngineError ? error.code : 'HOST',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

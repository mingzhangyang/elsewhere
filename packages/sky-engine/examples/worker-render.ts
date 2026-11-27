// Sky Engine in a dedicated module Worker: the page hands over its canvas with
// transferControlToOffscreen() (see worker-main.ts), and every render runs here, off the main
// thread. Sky Engine itself contains no Worker; this file is the host's own code.
//
// Build it as a module Worker with your bundler, for example
//   new Worker(new URL('./worker-render.ts', import.meta.url), { type: 'module' })
// It type-checks without the DOM library (lib ["ES2022", "WebWorker", "WebWorker.Iterable"]). The
// star catalog, the Moon texture and any web font are fetched from URLs the page supplies.
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
} from '@orangely/sky-engine';
import type { WorkerReply, WorkerRequest } from './worker-protocol.js';

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
  // to self.fonts. A FontFace loaded by the page (document.fonts) is not visible here. Some
  // browsers have no self.fonts in a Worker; labels then use the next font in the list.
  const fonts = (self as { fonts?: FontFaceSet }).fonts;
  if (request.font && fonts) {
    const face = new FontFace(request.font.family, `url(${request.font.url})`);
    fonts.add(face);
    await face.load();
    labelFont = `"${request.font.family}", system-ui, sans-serif`;
  }
}

async function render(request: Extract<WorkerRequest, { type: 'render' }>): Promise<number> {
  if (!canvas) throw new Error('Send init first.');
  const target = canvas;
  // Resizing the OffscreenCanvas also resizes the page's placeholder canvas bitmap.
  target.width = request.width;
  target.height = request.height;
  const scene = await createSkyScene({
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
      await renderIllustration(target, scene, {
        composition: 'auto',
        layers: { labels: true },
        font: labelFont,
        // City and mountain artwork would come from loadLandscape, decoded with createImageBitmap.
        landscape: 'ridge',
      });
      break;
    case 'chart':
      renderSkyChart(target, scene, { theme: 'midnight' });
      break;
    case 'map':
      renderMinimalSkyMap(target, scene, { layers: { lines: true } });
      break;
    case 'moon':
      await renderMoonPhase(target, scene, { background: 'dark', earthshine: true });
      break;
  }
  return performance.now() - start;
}

async function handle(request: WorkerRequest): Promise<WorkerReply> {
  try {
    if (request.type === 'init') {
      await init(request);
      return { type: 'ready' };
    }
    return { type: 'rendered', id: request.id, ms: await render(request) };
  } catch (error) {
    return {
      type: 'failed',
      id: request.type === 'render' ? request.id : undefined,
      code: error instanceof SkyEngineError ? error.code : 'HOST',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

// One shared canvas: each request (resize, scene, render) runs to completion before the next one
// starts, so a request waiting for the catalog never sees another request's canvas size.
let queue: Promise<void> = Promise.resolve();
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  queue = queue.then(async () => self.postMessage(await handle(event.data)));
};

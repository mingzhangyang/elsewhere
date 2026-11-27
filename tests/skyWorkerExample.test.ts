import { afterEach, expect, it, vi } from 'vitest';
import type { WorkerReply, WorkerRequest } from '../packages/sky-engine/examples/worker-protocol';

// The Worker example (packages/sky-engine/examples) with the engine mocked: requests are
// serialized on the shared canvas, and the page side settles every request when the Worker fails.
const engine = vi.hoisted(() => ({
  scene: vi.fn(),
  sizes: [] as [string, number, number][],
}));
vi.mock('@orangely/sky-engine', () => {
  class SkyEngineError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  const record = (kind: string) => (canvas: OffscreenCanvas) => {
    engine.sizes.push([kind, canvas.width, canvas.height]);
  };
  return {
    SkyEngineError,
    createSkyScene: engine.scene,
    decodeStarColumns: vi.fn(),
    installMoonTexture: vi.fn(),
    loadMoonTexture: vi.fn(),
    renderIllustration: vi.fn(async (canvas: OffscreenCanvas) => record('illustration')(canvas)),
    renderSkyChart: vi.fn(record('chart')),
    renderMinimalSkyMap: vi.fn(record('map')),
    renderMoonPhase: vi.fn(async (canvas: OffscreenCanvas) => record('moon')(canvas)),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  engine.scene.mockReset();
  engine.sizes.length = 0;
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function startWorkerScript() {
  const replies: WorkerReply[] = [];
  const scope: {
    onmessage: ((event: { data: WorkerRequest }) => void) | null;
    postMessage(reply: WorkerReply): void;
  } = { onmessage: null, postMessage: (reply) => replies.push(reply) };
  vi.stubGlobal('self', scope);
  await import('../packages/sky-engine/examples/worker-render');
  const send = (data: WorkerRequest) => scope.onmessage!({ data });
  return { replies, send };
}

const observer = { latitude: 0, longitude: 0, timezone: 'UTC', instant: '2026-01-01T00:00:00Z' };

it('runs each request to completion before the next one resizes the shared canvas', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // The first scene waits, as for the initial catalog download; later ones are immediate.
  engine.scene.mockImplementationOnce(async () => {
    await gate;
    return {};
  });
  engine.scene.mockResolvedValue({});
  const { replies, send } = await startWorkerScript();
  const canvas = { width: 0, height: 0 } as OffscreenCanvas;
  send({ type: 'init', canvas, catalogUrl: '/stars.json' });
  send({ type: 'render', id: 1, kind: 'chart', observer, width: 640, height: 480 });
  send({ type: 'render', id: 2, kind: 'map', observer, width: 900, height: 600 });
  await settle();
  // Request 2 has not touched the canvas while request 1 waits for its scene.
  expect([canvas.width, canvas.height]).toEqual([640, 480]);
  expect(engine.sizes).toEqual([]);
  release();
  await settle();
  expect(engine.sizes).toEqual([
    ['chart', 640, 480],
    ['map', 900, 600],
  ]);
  expect(replies.map((reply) => [reply.type, 'id' in reply ? reply.id : undefined])).toEqual([
    ['ready', undefined],
    ['rendered', 1],
    ['rendered', 2],
  ]);
});

it('reports a failed render with its id and carries on with the next request', async () => {
  const { SkyEngineError } = await import('@orangely/sky-engine');
  engine.scene.mockRejectedValueOnce(new SkyEngineError('TIMEOUT', 'Star catalog timed out.'));
  engine.scene.mockResolvedValue({});
  const { replies, send } = await startWorkerScript();
  send({ type: 'init', canvas: { width: 0, height: 0 } as OffscreenCanvas, catalogUrl: '/stars.json' });
  send({ type: 'render', id: 1, kind: 'moon', observer, width: 512, height: 512 });
  send({ type: 'render', id: 2, kind: 'moon', observer, width: 256, height: 256 });
  await settle();
  expect(replies[1]).toEqual({ type: 'failed', id: 1, code: 'TIMEOUT', message: 'Star catalog timed out.' });
  expect(replies[2]).toMatchObject({ type: 'rendered', id: 2 });
  expect(engine.sizes).toEqual([['moon', 256, 256]]);
});

class FakeWorker {
  static last: FakeWorker;
  onmessage: ((event: { data: WorkerReply }) => void) | null = null;
  onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  posted: WorkerRequest[] = [];
  terminated = false;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(message: WorkerRequest) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: WorkerReply) {
    this.onmessage!({ data });
  }
}

async function startPage() {
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('devicePixelRatio', 1);
  const { startSkyWorker } = await import('../packages/sky-engine/examples/worker-main');
  const target = {
    transferControlToOffscreen: () => ({}),
    getBoundingClientRect: () => ({ width: 300, height: 200 }),
  } as unknown as HTMLCanvasElement;
  return { sky: startSkyWorker(target), worker: FakeWorker.last };
}

it('resolves renders and rejects a render the Worker reports as failed', async () => {
  const { sky, worker } = await startPage();
  worker.reply({ type: 'ready' });
  const first = sky.render('chart');
  await settle();
  expect(worker.posted[1]).toMatchObject({ type: 'render', id: 0, kind: 'chart', width: 300, height: 200 });
  worker.reply({ type: 'rendered', id: 0, ms: 12 });
  await expect(first).resolves.toBe(12);
  const second = sky.render('moon');
  await settle();
  worker.reply({ type: 'failed', id: 1, code: 'MISSING_ASSET', message: 'No texture.' });
  await expect(second).rejects.toThrow('MISSING_ASSET: No texture.');
});

it('rejects initialization, pending and later renders when the Worker cannot start', async () => {
  const { sky, worker } = await startPage();
  const waiting = sky.render('illustration');
  const preventDefault = vi.fn();
  worker.onerror!({ message: '', preventDefault });
  await expect(waiting).rejects.toThrow('Sky Worker failed: it could not start');
  await expect(sky.render('chart')).rejects.toThrow('could not start');
  expect(preventDefault).toHaveBeenCalled();
  expect(worker.terminated).toBe(true);
});

it('rejects an in-flight render when the Worker fails after initialization', async () => {
  const { sky, worker } = await startPage();
  worker.reply({ type: 'ready' });
  const inFlight = sky.render('moon');
  await settle();
  worker.onmessageerror!();
  await expect(inFlight).rejects.toThrow('could not be read');
  await expect(sky.render('moon')).rejects.toThrow('could not be read');
});

it('rejects everything after a failed initialization reply or dispose()', async () => {
  const failed = await startPage();
  failed.worker.reply({ type: 'failed', code: 'ASSET_FAILED', message: 'Moon texture unavailable: 404' });
  await expect(failed.sky.render('moon')).rejects.toThrow('ASSET_FAILED: Moon texture unavailable: 404');
  vi.resetModules();
  const disposed = await startPage();
  disposed.worker.reply({ type: 'ready' });
  const pending = disposed.sky.render('map');
  await settle();
  disposed.sky.dispose();
  await expect(pending).rejects.toThrow('Sky Worker disposed.');
  expect(disposed.worker.terminated).toBe(true);
});

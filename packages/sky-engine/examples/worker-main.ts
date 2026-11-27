// The page side of worker-render.ts: hand a visible canvas to the Worker, then request renders.
// The page never imports Sky Engine here, so there is exactly one copy, in the Worker.
import type { RenderKind, WorkerReply, WorkerRequest } from './worker-protocol.js';

export interface SkyWorker {
  /** Render into the handed-over canvas; resolves with the render time in milliseconds. */
  render(kind: RenderKind): Promise<number>;
  /** Stop the Worker; pending and later renders reject. */
  dispose(): void;
}

export function startSkyWorker(target: HTMLCanvasElement): SkyWorker {
  const worker = new Worker(new URL('./worker-render.ts', import.meta.url), { type: 'module' });
  // After this call the page cannot draw into `target` any more; the Worker owns its pixels.
  const canvas = target.transferControlToOffscreen();
  const pending = new Map<number, { resolve(ms: number): void; reject(error: Error): void }>();
  let failure: Error | undefined;
  let settleReady: { resolve(): void; reject(error: Error): void } | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    settleReady = { resolve, reject };
  });
  // Nothing may be waiting yet; a rejection is still seen by every later render().
  ready.catch(() => {});
  // A terminal failure: initialization, every pending render and every later render reject.
  const fail = (error: Error) => {
    if (failure) return;
    failure = error;
    settleReady?.reject(error);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    worker.terminate();
  };
  // A module that fails to load or throws outside the message handler reports `error`, not a
  // `failed` reply.
  worker.onerror = (event) => {
    event.preventDefault();
    fail(new Error('Sky Worker failed: ' + (event.message || 'it could not start')));
  };
  worker.onmessageerror = () => fail(new Error('Sky Worker sent a message that could not be read.'));
  worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
    if (data.type === 'ready') return settleReady?.resolve();
    if (data.type === 'failed' && data.id === undefined) {
      return fail(new Error(data.code + ': ' + data.message)); // initialization failed
    }
    const request = pending.get(data.id!);
    pending.delete(data.id!);
    if (data.type === 'rendered') request?.resolve(data.ms);
    else request?.reject(new Error(data.code + ': ' + data.message));
  };
  const send = (message: WorkerRequest, transfer: Transferable[] = []) =>
    worker.postMessage(message, transfer);
  send(
    {
      type: 'init',
      canvas,
      catalogUrl: '/sky-engine/stars.json',
      moonTextureUrl: '/sky-engine/moon-lroc.jpg',
      font: { family: 'Caveat', url: '/fonts/caveat.woff2' },
    },
    [canvas],
  );
  let next = 0;
  return {
    async render(kind) {
      if (failure) throw failure;
      await ready;
      if (failure) throw failure;
      const id = next++;
      const { width, height } = target.getBoundingClientRect();
      const scale = Math.min(2, devicePixelRatio);
      return new Promise<number>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        send({
          type: 'render',
          id,
          kind,
          observer: {
            latitude: 40.7128,
            longitude: -74.006,
            timezone: 'America/New_York',
            instant: new Date().toISOString(),
          },
          width: Math.max(160, Math.min(4096, Math.round(width * scale))),
          height: Math.max(160, Math.min(4096, Math.round(height * scale))),
        });
      });
    },
    dispose() {
      fail(new Error('Sky Worker disposed.'));
    },
  };
}

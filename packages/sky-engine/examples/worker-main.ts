// The page side of worker-render.ts: hand a visible canvas to the Worker, then request renders.
// The page never imports Sky Engine here, so there is exactly one copy, in the Worker.
import type { WorkerReply, WorkerRequest } from './worker-render.js';

export function startSkyWorker(target: HTMLCanvasElement): {
  render(kind: Extract<WorkerRequest, { type: 'render' }>['kind']): Promise<number>;
} {
  const worker = new Worker(new URL('./worker-render.ts', import.meta.url), { type: 'module' });
  // After this call the page cannot draw into `target` any more; the Worker owns its pixels.
  const canvas = target.transferControlToOffscreen();
  const send = (message: WorkerRequest, transfer: Transferable[] = []) =>
    worker.postMessage(message, transfer);
  const pending = new Map<number, { resolve(ms: number): void; reject(error: Error): void }>();
  const ready = new Promise<void>((resolve, reject) => {
    worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      if (data.type === 'ready') return resolve();
      const failure = data.type === 'failed' ? new Error(data.code + ': ' + data.message) : undefined;
      if (data.id === undefined) return reject(failure); // init failed
      const request = pending.get(data.id);
      pending.delete(data.id);
      if (data.type === 'rendered') request?.resolve(data.ms);
      else request?.reject(failure!);
    };
  });
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
      await ready;
      const id = next++;
      const { width, height } = target.getBoundingClientRect();
      const scale = Math.min(2, devicePixelRatio);
      return new Promise((resolve, reject) => {
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
  };
}

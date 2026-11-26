import { cancelled, invalidInput, SkyEngineError } from './errors';

/** Reject a resource timeout outside 1–30000 ms, whether or not a loader ends up being called. */
export function validateTimeout(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
    throw invalidInput('Resource timeout must be between 1 and 30000 ms.');
  }
  return timeoutMs;
}

/** A host loader's failure as ASSET_FAILED, keeping its message and the original error as `cause`. */
export function assetFailed(name: string, error: unknown): SkyEngineError {
  if (error instanceof SkyEngineError) return error;
  const message = error instanceof Error && error.message ? error.message : name + ' failed to load.';
  return new SkyEngineError('ASSET_FAILED', message, { cause: error });
}

/** Bound the wait for an injected loader. Cancellation is cooperative for the host's own I/O. */
export async function loadResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  name: string,
  signal?: AbortSignal,
): Promise<T> {
  validateTimeout(timeoutMs);
  if (signal?.aborted) throw cancelled(name + ' cancelled.');
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const interrupted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      'abort',
      () =>
        reject(
          timedOut ? new SkyEngineError('TIMEOUT', name + ' timed out.') : cancelled(name + ' cancelled.'),
        ),
      { once: true },
    );
  });
  try {
    const pending = Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) throw cancelled(name + ' cancelled.');
        return load(controller.signal);
      })
      .catch((error: unknown) => {
        throw assetFailed(name, error);
      });
    return await Promise.race([pending, interrupted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/** Bound the wait for an injected loader. Cancellation is cooperative for the host's own I/O. */
export async function loadResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  name: string,
  signal?: AbortSignal,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
    throw new RangeError('Resource timeout must be between 1 and 30000 ms.');
  }
  if (signal?.aborted) throw new Error(name + ' cancelled.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  const interrupted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error(name + ' cancelled or timed out.')), {
      once: true,
    });
  });
  try {
    const pending = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new Error(name + ' cancelled.');
      return load(controller.signal);
    });
    return await Promise.race([pending, interrupted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

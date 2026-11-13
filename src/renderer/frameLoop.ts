export interface FrameDriver {
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
}

/** Coalesces changes and renders static scenes only when invalidated. */
export function createFrameLoop(
  draw: (time: number, delta: number, continuous: boolean) => void,
  driver: FrameDriver = {
    request: (callback) => window.requestAnimationFrame(callback),
    cancel: (id) => window.cancelAnimationFrame(id),
  },
) {
  let pending = 0,
    last = 0,
    animated = false,
    suspended = false,
    disposed = false;
  const schedule = () => {
    if (!pending && !suspended && !disposed) pending = driver.request(tick);
  };
  const tick: FrameRequestCallback = (time) => {
    pending = 0;
    if (disposed || suspended) return;
    const continuous = animated && last > 0;
    draw(time, continuous ? Math.min(0.08, (time - last) / 1000) : 0, continuous);
    last = time;
    if (animated) schedule();
  };
  return {
    invalidate: schedule,
    setAnimated(value: boolean) {
      if (value !== animated) {
        animated = value;
        last = 0;
      }
      schedule();
    },
    setSuspended(value: boolean) {
      suspended = value;
      last = 0;
      if (value && pending) {
        driver.cancel(pending);
        pending = 0;
      }
      if (!value) schedule();
    },
    dispose() {
      disposed = true;
      if (pending) driver.cancel(pending);
      pending = 0;
    },
  };
}

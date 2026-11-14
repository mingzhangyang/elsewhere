export interface FrameDriver {
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
}

/** Display refreshes rarely land exactly on a capped interval; this keeps 30 fps from slipping to 20. */
const PACING_TOLERANCE_MS = 2;

/**
 * Coalesces changes and renders static scenes only when invalidated. An animated scene may be capped
 * to a frame rate; invalidated frames (interaction, new data) are still drawn on the next refresh.
 *
 * `draw` receives the animation time step, and whether the frame was paced by the display at full
 * rate, so frame-time measurements ignore capped and on-demand frames.
 */
export function createFrameLoop(
  draw: (time: number, delta: number, continuous: boolean) => void,
  driver: FrameDriver = {
    request: (callback) => window.requestAnimationFrame(callback),
    cancel: (id) => window.cancelAnimationFrame(id),
  },
) {
  let pending = 0,
    last = 0,
    interval = 0,
    animated = false,
    dirty = false,
    suspended = false,
    disposed = false;
  const schedule = () => {
    if (!pending && !suspended && !disposed) pending = driver.request(tick);
  };
  const tick: FrameRequestCallback = (time) => {
    pending = 0;
    if (disposed || suspended) return;
    if (animated && !dirty && last > 0 && time - last < interval - PACING_TOLERANCE_MS) {
      schedule();
      return;
    }
    const stepped = animated && last > 0;
    dirty = false;
    draw(time, stepped ? Math.min(0.08, (time - last) / 1000) : 0, stepped && interval === 0);
    last = time;
    if (animated) schedule();
  };
  return {
    invalidate() {
      dirty = true;
      schedule();
    },
    /** `maxFps` caps an animated scene; omit it to draw on every display refresh. */
    setAnimated(value: boolean, maxFps?: number) {
      const nextInterval = value && maxFps ? 1000 / maxFps : 0;
      if (value !== animated || nextInterval !== interval) {
        animated = value;
        interval = nextInterval;
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

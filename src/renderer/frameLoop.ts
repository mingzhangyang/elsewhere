export interface FrameDriver {
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
}

/** Absorbs timestamp jitter so a refresh landing a hair before its deadline still draws. */
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
    // When the next capped frame is due. It advances by whole intervals rather than restarting from
    // each draw, so refresh rates that don't divide the cap (75, 100 Hz) keep its average rate.
    due = 0,
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
    const onCadence = last === 0 || time >= due - PACING_TOLERANCE_MS;
    if (animated && interval && !dirty && !onCadence) {
      schedule();
      return;
    }
    const stepped = animated && last > 0;
    const requested = dirty;
    dirty = false;
    draw(time, stepped ? Math.min(0.08, (time - last) / 1000) : 0, stepped && interval === 0);
    if (interval) {
      // An off-cadence frame drawn for interaction already advanced the animation, and a late frame
      // (slow draw, resumed tab) should not trigger a catch-up burst: both restart the cadence here.
      if (last === 0 || (requested && !onCadence) || time - due >= interval) due = time;
      due += interval;
    }
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

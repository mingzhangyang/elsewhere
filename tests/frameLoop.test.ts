import { describe, expect, it } from 'vitest';
import { createFrameLoop } from '../src/renderer/frameLoop';
import { CLOUD_DRIFT_FPS, weatherMotion } from '../src/renderer/weatherMotion';

/** A display that refreshes at `hz`; `run` advances it and returns the draws made. */
function display(hz: number) {
  let callback: FrameRequestCallback | undefined;
  let now = 0;
  const driver = {
    request: (fn: FrameRequestCallback) => {
      callback = fn;
      return 1;
    },
    cancel: () => (callback = undefined),
  };
  const draws: { time: number; delta: number; continuous: boolean }[] = [];
  const loop = createFrameLoop((time, delta, continuous) => draws.push({ time, delta, continuous }), driver);
  const refresh = () => {
    now += 1000 / hz;
    const fn = callback;
    callback = undefined;
    fn?.(now);
  };
  const run = (ms: number) => {
    const end = now + ms;
    while (now + 1000 / hz <= end + 1e-6) refresh();
  };
  /** A long frame: the display delivers nothing for `ms`. */
  const stall = (ms: number) => (now += ms);
  return { loop, draws, run, refresh, stall };
}

describe('weather motion', () => {
  const calm = { cloudCover: 60, windSpeed: 12, precipitation: 0 };
  it('drifts only clouds dense and windy enough to see move', () => {
    expect(weatherMotion(calm, false)).toBe('drift');
    expect(weatherMotion({ ...calm, windSpeed: 2 }, false)).toBe('none');
    expect(weatherMotion({ ...calm, cloudCover: 4 }, false)).toBe('none');
  });
  it('keeps falling particles at full rate and honours reduced motion', () => {
    expect(weatherMotion({ ...calm, precipitation: 1.2 }, false)).toBe('precipitation');
    expect(weatherMotion({ ...calm, cloudCover: 0, windSpeed: 0, precipitation: 1.2 }, false)).toBe(
      'precipitation',
    );
    expect(weatherMotion({ ...calm, precipitation: 1.2 }, true)).toBe('none');
  });
});

describe('frame pacing', () => {
  it.each([60, 75, 100, 120, 144])('caps cloud drift to %i Hz displays at about 30 fps', (hz) => {
    const { loop, draws, run } = display(hz);
    loop.setAnimated(true, CLOUD_DRIFT_FPS);
    run(2000);
    expect(draws.length / 2).toBeGreaterThanOrEqual(CLOUD_DRIFT_FPS - 1);
    expect(draws.length / 2).toBeLessThanOrEqual(CLOUD_DRIFT_FPS + 1);
    // Animation time still advances in step with the clock, and capped frames are not measured.
    const animated = draws.reduce((sum, draw) => sum + draw.delta, 0);
    expect(animated).toBeCloseTo((draws.at(-1)!.time - draws[0]!.time) / 1000, 5);
    expect(draws.every((draw) => !draw.continuous)).toBe(true);
  });

  it('draws precipitation on every refresh and measures those frames', () => {
    const { loop, draws, run } = display(60);
    loop.setAnimated(true);
    run(1000);
    expect(draws).toHaveLength(60);
    expect(draws.slice(1).every((draw) => draw.continuous)).toBe(true);
  });

  it('draws interaction on the next refresh even between capped frames', () => {
    const { loop, draws, refresh } = display(60);
    loop.setAnimated(true, CLOUD_DRIFT_FPS);
    refresh();
    refresh();
    refresh();
    const drawn = draws.length;
    loop.invalidate();
    refresh();
    expect(draws.length).toBe(drawn + 1);
    refresh();
    expect(draws.length).toBe(drawn + 1);
  });

  it('resumes the cap after a stalled frame instead of drawing a catch-up burst', () => {
    const { loop, draws, run, stall } = display(60);
    loop.setAnimated(true, CLOUD_DRIFT_FPS);
    run(500);
    stall(400);
    const before = draws.length;
    run(1000);
    const after = draws.slice(before);
    expect(after.length).toBeGreaterThanOrEqual(CLOUD_DRIFT_FPS - 1);
    expect(after.length).toBeLessThanOrEqual(CLOUD_DRIFT_FPS + 1);
    for (let i = 1; i < after.length; i++)
      expect(after[i]!.time - after[i - 1]!.time).toBeGreaterThan(1000 / CLOUD_DRIFT_FPS - 2);
  });

  it('stops requesting frames when the weather turns still', () => {
    const { loop, draws, run } = display(60);
    loop.setAnimated(true, CLOUD_DRIFT_FPS);
    run(500);
    loop.setAnimated(false);
    run(20);
    const settled = draws.length;
    run(1000);
    expect(draws.length).toBe(settled);
  });
});

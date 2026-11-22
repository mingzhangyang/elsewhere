import { describe, expect, it, vi } from 'vitest';
import { calculateSky } from '../src/domain/astronomy';
import { paintLandscape, type LandScene } from '../src/moment/landscape';
import { paletteFor } from '../src/moment/paint';
import { NEW_YORK } from './fixtures/locations';

const art = { naturalWidth: 1080, naturalHeight: 536 } as HTMLImageElement;
const sky = calculateSky(NEW_YORK, new Date('2026-06-15T16:00:00Z'));
type Draw = [CanvasImageSource, ...number[]];

function draw(overrides: Partial<LandScene> = {}) {
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn<(...args: Draw) => void>(),
  };
  paintLandscape({
    ctx: ctx as unknown as CanvasRenderingContext2D,
    width: 1200,
    height: 1500,
    unit: 1,
    horizonY: 750,
    palette: paletteFor(sky.sunAltitude, 0),
    toCanvas: () => ({ x: 600, y: 750, front: true }),
    view: { heading: 0, altitude: 0, fov: 66 },
    sky,
    day: 1,
    night: 0,
    season: 'summer',
    seed: 1,
    lightX: 0,
    lightStrength: 1,
    halfWidth: 33,
    horizon: 'mountains',
    landscapeArt: art,
    ...overrides,
  });
  return ctx;
}

describe('valley foreground coverage', () => {
  it.each([
    ['low portrait', 1500, 750],
    ['wide postcard', 800, 400],
    ['shallow ground strip', 1500, 1460],
  ])('backs the foreground gap without filling the skyline in a %s', (_name, height, horizonY) => {
    const ctx = draw({ height, horizonY });
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    const [backing, artwork] = ctx.drawImage.mock.calls;
    // The original artwork remains the final layer, so opaque textures are never overwritten.
    expect(backing).toHaveLength(9);
    expect(artwork).toHaveLength(5);
    expect(backing[0]).toBe(artwork[0]);
    expect(artwork[0]).toBe(art);
    const [, sx, sy, sw, sh, bx, by, bw, bh] = backing;
    const [, x, y, w, h] = artwork;
    const projectX = (sourceX: number) => x + (sourceX / art.naturalWidth) * w;
    const projectY = (sourceY: number) => y + (sourceY / art.naturalHeight) * h;

    // Decoded valley assets have a foreground notch at x790–887/y508–535, including
    // partially transparent boundary pixels. The sampling band must precede that notch.
    expect(sy).toBeGreaterThanOrEqual(400);
    expect(sy + sh).toBeLessThanOrEqual(508);
    expect(sh).toBeGreaterThan(0);
    expect(sx).toBeLessThanOrEqual(790);
    expect(sx + sw).toBeGreaterThanOrEqual(888);
    expect(bx).toBeLessThanOrEqual(projectX(790));
    expect(bx + bw).toBeGreaterThanOrEqual(projectX(888));
    expect(by).toBeLessThanOrEqual(projectY(508));
    expect(by + bh).toBeCloseTo(y + h);
    // All intended skyline transparency is above source row 400; it must retain the sky.
    expect(by).toBeGreaterThan(projectY(400));
    expect(y + h).toBeGreaterThan(height);
    expect(ctx.clip).toHaveBeenCalledOnce();
    expect(ctx.clip.mock.invocationCallOrder[0]).toBeLessThan(ctx.drawImage.mock.invocationCallOrder[0]);
    const [, clipY, , clipHeight] = ctx.rect.mock.calls[0];
    expect(clipY).toBeGreaterThan(horizonY);
    expect(clipY + clipHeight).toBeGreaterThanOrEqual(height);
    expect(ctx.restore).toHaveBeenCalledOnce();
  });

  it('leaves city artwork as a single unmodified draw', () => {
    const ctx = draw({ horizon: 'city' });
    expect(ctx.drawImage).toHaveBeenCalledOnce();
    expect(ctx.drawImage.mock.calls[0]).toHaveLength(5);
    expect(ctx.drawImage.mock.calls[0][0]).toBe(art);
  });

  it('does not draw backing when artwork is unavailable', () => {
    const ctx = draw({ landscapeArt: null });
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalledOnce();
  });

  it('does not draw artwork or backing when the ground is outside the image', () => {
    for (const horizonY of [1500, 1600]) {
      const ctx = draw({ horizonY });
      expect(ctx.drawImage).not.toHaveBeenCalled();
      expect(ctx.clip).not.toHaveBeenCalled();
    }
  });
});

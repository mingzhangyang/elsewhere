import { describe, expect, it } from 'vitest';
import { seededRandom } from '../src/lib/random';
import { altocumulus, cirrus, cloudSheet, cumulus, overcastDeckOpacity, stratus } from '../src/moment/clouds';
import { cloudFieldLuminance, createCloudField, sampleCloudField } from '../src/moment/cloudField';
import { paletteFor } from '../src/moment/paint';
import type { CloudLight } from '../src/moment/clouds';

const light: CloudLight = {
  x: 0.36,
  y: -0.93,
  backlit: 0.28,
  under: 0.2,
  underColour: [250, 180, 125],
};

function recordingCanvas() {
  const operations: string[] = [];
  let depth = 0;
  const handler: ProxyHandler<object> = {
    get: (_target, name) => {
      if (name === 'createLinearGradient' || name === 'createRadialGradient') {
        return () => {
          operations.push(String(name));
          return {
            addColorStop: (at: number, color: string) => operations.push('stop:' + at + ':' + color),
          };
        };
      }
      if (name === 'save') {
        return () => {
          depth++;
          operations.push('save');
        };
      }
      if (name === 'restore') {
        return () => {
          depth--;
          operations.push('restore');
        };
      }
      return (...args: unknown[]) => {
        const parts = args.map((value) => (typeof value === 'number' ? value.toFixed(3) : String(value)));
        operations.push(String(name) + ':' + parts.join(','));
      };
    },
    set: (_target, name, value) => {
      operations.push(String(name) + '=' + String(value));
      return true;
    },
  };
  const canvas = new Proxy({}, handler) as CanvasRenderingContext2D;
  return { canvas, operations, stackDepth: () => depth };
}

const palette = paletteFor(-5, 0.9);

describe('illustrated postcard watercolor cloud treatment', () => {
  it('uses deterministic feathered pigment rather than a sharp summit silhouette', () => {
    const first = createCloudField(seededRandom(2026), 2);
    const second = createCloudField(seededRandom(2026), 2);
    const alternate = createCloudField(seededRandom(163), 2);
    expect(first).toEqual(second);
    expect(first).not.toEqual(alternate);
    expect(first.masses.length).toBeGreaterThanOrEqual(9);
    expect(sampleCloudField(first, 0, -0.65)).toBeGreaterThan(0.55);
    expect(sampleCloudField(first, -2.33, -1.9)).toBeLessThan(0.01);
    expect(sampleCloudField(first, 2.33, 0.64)).toBeLessThan(0.01);
    const samples = Array.from({ length: 30 }, (_, i) => sampleCloudField(first, -2.1 + i * 0.14, -0.8));
    expect(new Set(samples.map((a) => a.toFixed(3))).size).toBeGreaterThan(15);
    expect(samples.every((alpha) => Number.isFinite(alpha) && alpha >= 0 && alpha <= 1)).toBe(true);
  });

  it('keeps the recording-context fallback soft and the Canvas stack balanced', () => {
    const run = () => {
      const record = recordingCanvas();
      cumulus(record.canvas, 480, 320, 105, palette, light, seededRandom(2026), 2);
      return record;
    };
    const first = run();
    const second = run();
    expect(first.operations).toEqual(second.operations);
    expect(first.stackDepth()).toBe(0);
    expect(first.operations.filter((op) => op === 'createRadialGradient').length).toBeGreaterThan(8);
    expect(first.operations.filter((op) => op.startsWith('quadraticCurveTo:'))).toHaveLength(0);
    expect(first.operations.some((op) => op.includes('rgba('))).toBe(true);
  });

  it('uses translucent, nonparallel veils rather than a row of shaded spheres', () => {
    const record = recordingCanvas();
    const random = seededRandom(86);
    stratus(record.canvas, 600, 430, 450, palette, light, random, 0.8);
    altocumulus(record.canvas, 600, 240, 34, palette, light, random);
    expect(record.stackDepth()).toBe(0);
    expect(record.operations.filter((x) => x.startsWith('quadraticCurveTo:')).length).toBeGreaterThan(20);
    expect(record.operations.filter((x) => x.startsWith('ellipse:'))).toHaveLength(0);
    expect(record.operations.some((x) => x.includes('rgba('))).toBe(true);
  });

  it('uses sparse cirrus and a bounded number of overcast veils', () => {
    const record = recordingCanvas();
    const random = seededRandom(163);
    cirrus(record.canvas, 550, 165, 390, palette, light, random);
    const fills = () =>
      record.operations.filter((x) => x.startsWith('fill:') || x.startsWith('fillRect:')).length;
    const beforeSheet = fills();
    cloudSheet(record.canvas, 1200, 0, 780, palette, light, random, 1);
    const afterSheet = fills();
    expect(record.stackDepth()).toBe(0);
    expect(afterSheet - beforeSheet).toBe(4); // one continuous deck + three translucent veils
  });

  it('adds a continuous overcast deck only for dense reported cover', () => {
    expect(overcastDeckOpacity(0)).toBe(0);
    expect(overcastDeckOpacity(0.6)).toBe(0);
    expect(overcastDeckOpacity(0.86)).toBeGreaterThan(0.1);
    expect(overcastDeckOpacity(0.86)).toBeLessThan(0.9);
    expect(overcastDeckOpacity(1)).toBeGreaterThan(0.9);
    expect(overcastDeckOpacity(1)).toBeLessThan(1);
  });

  it('shades the crown and underside using the vertical component of light', () => {
    const above = { ...light, x: 0, y: -1, backlit: 0 };
    const below = { ...light, x: 0, y: 1, backlit: 0 };
    const upperFromAbove = cloudFieldLuminance(0, -0.8, 0.6, 0, 0, 0.35, above);
    const upperFromBelow = cloudFieldLuminance(0, -0.8, 0.6, 0, 0, 0.35, below);
    const lowerFromAbove = cloudFieldLuminance(0, 0.3, 0.6, 0, 0, -0.35, above);
    const lowerFromBelow = cloudFieldLuminance(0, 0.3, 0.6, 0, 0, -0.35, below);
    expect(upperFromAbove).toBeGreaterThan(upperFromBelow);
    expect(lowerFromBelow).toBeGreaterThan(lowerFromAbove);
    expect(upperFromAbove).not.toBe(upperFromBelow);
  });

  it('does not paint an overcast veil when weather is clear', () => {
    const record = recordingCanvas();
    cloudSheet(record.canvas, 1200, 0, 800, palette, light, seededRandom(1), 0);
    expect(record.operations).toEqual([]);
  });
});

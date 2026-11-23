import { describe, expect, it } from 'vitest';
import { seededRandom } from '../src/lib/random';
import { altocumulus, cirrus, cloudSheet, cumulus, stratus } from '../src/moment/clouds';
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
  const canvas = new Proxy({}, {
    get: (_target, name) => {
      if (name === 'createLinearGradient' || name === 'createRadialGradient')
        return () => {
          operations.push(String(name));
          return { addColorStop: (at: number, color: string) => operations.push('stop:' + at + ':' + color) };
        };
      if (name === 'save')
        return () => { depth++; operations.push('save'); };
      if (name === 'restore')
        return () => { depth--; operations.push('restore'); };
      return (...args: unknown[]) => {
        operations.push(String(name) + ':' + args.map((a) => typeof a === 'number' ? a.toFixed(3) : String(a)).join(','));
      };
    },
    set: (_target, name, value) => {
      operations.push(String(name) + '=' + String(value));
      return true;
    },
  }) as CanvasRenderingContext2D;
  return { canvas, operations, stackDepth: () => depth };
}

const palette = paletteFor(-5, 0.9);

describe('illustrated postcard watercolor cloud treatment', () => {
  it('joins each cumulus bank into a smooth outline without layered ellipse volumes', () => {
    const run = () => {
      const record = recordingCanvas();
      cumulus(record.canvas, 480, 320, 105, palette, light, seededRandom(2026), 2);
      return record;
    };
    const first = run();
    const second = run();
    expect(first.operations).toEqual(second.operations);
    expect(first.stackDepth()).toBe(0);
    expect(first.operations.filter((x) => x.startsWith('quadraticCurveTo:')).length).toBeGreaterThan(20);
    expect(first.operations.filter((x) => x.startsWith('ellipse:'))).toHaveLength(0);
    expect(first.operations.some((x) => x.startsWith('createLinearGradient'))).toBe(true);
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
    const beforeSheet = record.operations.filter((x) => x.startsWith('fill:')).length;
    cloudSheet(record.canvas, 1200, 0, 780, palette, light, random, 1);
    const afterSheet = record.operations.filter((x) => x.startsWith('fill:')).length;
    expect(record.stackDepth()).toBe(0);
    expect(afterSheet - beforeSheet).toBeLessThanOrEqual(12);
    expect(afterSheet - beforeSheet).toBeGreaterThan(0);
  });

  it('does not paint an overcast veil when weather is clear', () => {
    const record = recordingCanvas();
    cloudSheet(record.canvas, 1200, 0, 800, palette, light, seededRandom(1), 0);
    expect(record.operations).toEqual([]);
  });
});

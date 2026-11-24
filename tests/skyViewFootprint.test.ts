import { describe, expect, it } from 'vitest';
import { projectSkyChart } from '../src/domain/skyChartProjection';
import {
  pickSkyChartDirection,
  projectViewFootprint,
  unprojectSkyChart,
} from '../src/domain/skyViewFootprint';

describe('sky view footprint', () => {
  it('round-trips the cardinal directions and zenith', () => {
    for (const azimuth of [0, 90, 180, 270, 359.9]) {
      const point = projectSkyChart(35, azimuth)!;
      const inverse = unprojectSkyChart(point)!;
      expect(inverse.altitude).toBeCloseTo(35);
      expect(inverse.azimuth).toBeCloseTo(azimuth);
    }
    expect(unprojectSkyChart({ x: 0, y: 0 })).toEqual({ altitude: 90, azimuth: 0 });
    expect(unprojectSkyChart({ x: 1.01, y: 0 })).toBeNull();
  });

  it('navigates cardinal label hit areas without changing the disc or unrelated margins', () => {
    expect(pickSkyChartDirection({ x: 0, y: -1.1 })).toEqual({ altitude: 0, azimuth: 0 });
    expect(pickSkyChartDirection({ x: -1.1, y: 0 })).toEqual({ altitude: 0, azimuth: 90 });
    expect(pickSkyChartDirection({ x: 0, y: 1.1 })).toEqual({ altitude: 0, azimuth: 180 });
    expect(pickSkyChartDirection({ x: 1.1, y: 0 })).toEqual({ altitude: 0, azimuth: 270 });
    expect(pickSkyChartDirection({ x: -1.12, y: 0.08 })).toEqual({ altitude: 0, azimuth: 90 });
    const inside = { x: 0.98, y: 0 };
    expect(pickSkyChartDirection(inside)).toEqual(unprojectSkyChart(inside));
    expect(pickSkyChartDirection({ x: 0.8, y: 0.8 })).toBeNull();
    expect(pickSkyChartDirection({ x: 1.4, y: 0 })).toBeNull();
    expect(pickSkyChartDirection({ x: NaN, y: 0 })).toBeNull();
  });

  it('has the expected horizon intersections and arc for a north-facing square viewport', () => {
    const points = projectViewFootprint({ heading: 0, altitude: 0, fov: 90 }, 1);
    const horizon = points.filter((point) => Math.abs(Math.hypot(point.x, point.y) - 1) < 1e-8);
    expect(horizon.length).toBeGreaterThan(10);
    expect(Math.min(...horizon.map((point) => point.x))).toBeCloseTo(-Math.SQRT1_2);
    expect(Math.max(...horizon.map((point) => point.x))).toBeCloseTo(Math.SQRT1_2);
    expect(horizon.every((point) => point.y < 0)).toBe(true);
  });

  it('projects wider viewports and zoom changes without a seam at north', () => {
    const view = { heading: 0, altitude: 45, fov: 40 };
    const width = (aspect: number, fov = view.fov) =>
      Math.max(...projectViewFootprint({ ...view, fov }, aspect).map((point) => point.x));
    expect(width(2)).toBeGreaterThan(width(0.5));
    expect(width(1, 2)).toBeLessThan(width(1, 40));
    const a = projectViewFootprint(view, 1);
    const b = projectViewFootprint({ ...view, heading: 360 }, 1);
    expect(a).toHaveLength(b.length);
    a.forEach((point, i) => {
      expect(point.x).toBeCloseTo(b[i].x);
      expect(point.y).toBeCloseTo(b[i].y);
    });
  });

  it('clips at the horizon even with a below-horizon center and omits fully hidden sky', () => {
    expect(projectViewFootprint({ heading: 180, altitude: -90, fov: 92 }, 3)).toEqual([]);
    expect(projectViewFootprint({ heading: 0, altitude: -33, fov: 66 }, 1)).toEqual([]);
    const partial = projectViewFootprint({ heading: 90, altitude: -15, fov: 66 }, 2);
    expect(partial.length).toBeGreaterThan(3);
    expect(partial.some((point) => Math.abs(Math.hypot(point.x, point.y) - 1) < 1e-8)).toBe(true);
    expect(partial.every((point) => Math.hypot(point.x, point.y) <= 1 + 1e-10)).toBe(true);
  });

  it('surrounds the zenith and stays finite at extreme FOV and aspect ratios', () => {
    for (const aspect of [0.25, 1, 4]) {
      for (const fov of [2, 66, 92]) {
        const points = projectViewFootprint({ heading: 315, altitude: 90, fov }, aspect);
        expect(points.length).toBeGreaterThanOrEqual(4);
        expect(points.every((point) => Math.hypot(point.x, point.y) <= 1 + 1e-10)).toBe(true);
        expect(Math.min(...points.map((point) => point.x))).toBeLessThan(0);
        expect(Math.max(...points.map((point) => point.x))).toBeGreaterThan(0);
      }
    }
    expect(projectViewFootprint({ heading: 0, altitude: 0, fov: 66 }, 0)).toEqual([]);
  });
});

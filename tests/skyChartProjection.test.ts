import { describe, expect, it } from 'vitest';
import { projectSkyChart, type SkyChartPoint } from '../src/domain/skyChartProjection';

// Independent synthetic analytic anchors, not values computed by a production helper.
// 10 decimal places allow substantially less than 1e-10 absolute coordinate error.
function expectPoint(actual: SkyChartPoint | null, x: number, y: number) {
  expect(actual).not.toBeNull();
  expect(actual!.x).toBeCloseTo(x, 10);
  expect(actual!.y).toBeCloseTo(y, 10);
}

describe('azimuthal equidistant sky chart (north up, east left)', () => {
  it('S01: maps the zenith to the origin at every azimuth', () => {
    for (const azimuth of [-720, 0, 37, 90, 180, 270, 360, 9999]) {
      expect(projectSkyChart(90, azimuth)).toEqual({ x: 0, y: 0 });
    }
  });

  it('S02: places the four horizon compass points at independent cardinal anchors', () => {
    for (const [azimuth, x, y] of [
      [0, 0, -1], // north, top
      [90, -1, 0], // east, left (not map convention)
      [180, 0, 1], // south, bottom
      [270, 1, 0], // west, right
    ]) {
      expectPoint(projectSkyChart(0, azimuth), x, y);
    }
  });

  it('keeps all four intercardinal quadrants in the correct orientation', () => {
    const diagonal = Math.SQRT1_2;
    for (const [azimuth, x, y] of [
      [45, -diagonal, -diagonal], // NE, upper left
      [135, -diagonal, diagonal], // SE, lower left
      [225, diagonal, diagonal], // SW, lower right
      [315, diagonal, -diagonal], // NW, upper right
    ]) {
      expectPoint(projectSkyChart(0, azimuth), x, y);
    }
  });

  it('has linear radial scale at known intermediate altitudes', () => {
    for (const [altitude, northY] of [
      [30, -2 / 3],
      [45, -0.5],
      [60, -1 / 3],
    ]) {
      expectPoint(projectSkyChart(altitude, 0), 0, northY);
    }
    expectPoint(projectSkyChart(45, 90), -0.5, 0);
    expectPoint(projectSkyChart(30, 45), -Math.SQRT2 / 3, -Math.SQRT2 / 3);
  });

  it('includes exactly the mathematical horizon and stays in the closed unit disc', () => {
    for (let azimuth = 0; azimuth <= 360; azimuth += 7.5) {
      const point = projectSkyChart(0, azimuth)!;
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(1, 12);
    }
    for (const altitude of [0, 0.0000001, 15, 30, 45, 60, 89.999999, 90]) {
      const point = projectSkyChart(altitude, 123)!;
      expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(1 + 1e-14);
    }
  });

  it('never places below-horizon centers in the circle, even infinitesimally below', () => {
    for (const altitude of [-90, -45, -0.000000000001, -Number.MIN_VALUE]) {
      expect(projectSkyChart(altitude, 45)).toBeNull();
    }
    expectPoint(projectSkyChart(0, 45), -Math.SQRT1_2, -Math.SQRT1_2);
  });

  it('wraps azimuths at 360 degrees, including negative and multiple turns', () => {
    for (const azimuth of [0, 13, 45, 90, 180, 270, 359.75]) {
      const reference = projectSkyChart(38, azimuth)!;
      for (const turns of [-1080, -360, 360, 720]) {
        expectPoint(projectSkyChart(38, azimuth + turns), reference.x, reference.y);
      }
    }
    expectPoint(projectSkyChart(0, 360), 0, -1);
  });

  it('remains finite and converges smoothly near the zenith', () => {
    const high = projectSkyChart(89.999999, 135)!;
    const higher = projectSkyChart(89.9999999999, 135)!;
    for (const point of [high, higher]) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
    expect(Math.hypot(high.x, high.y)).toBeLessThan(2e-8);
    expect(Math.hypot(higher.x, higher.y)).toBeLessThan(Math.hypot(high.x, high.y));
    expectPoint(projectSkyChart(90, 135), 0, 0);
  });

  it('rejects invalid apparent altitudes and non-finite azimuths instead of clamping', () => {
    for (const altitude of [-90.0001, 90.0001, NaN, Infinity, -Infinity]) {
      expect(() => projectSkyChart(altitude, 0)).toThrow(RangeError);
    }
    for (const azimuth of [NaN, Infinity, -Infinity]) {
      expect(() => projectSkyChart(45, azimuth)).toThrow(RangeError);
      expect(() => projectSkyChart(90, azimuth)).toThrow(RangeError);
      expect(() => projectSkyChart(-1, azimuth)).toThrow(RangeError);
    }
  });

  it('is monotone with zenith distance, not camera, canvas, device or time settings', () => {
    const radii = [90, 75, 60, 45, 30, 15, 0].map((altitude) => {
      const point = projectSkyChart(altitude, 243)!;
      return Math.hypot(point.x, point.y);
    });
    expect(radii[0]).toBe(0);
    expect(radii[radii.length - 1]).toBeCloseTo(1, 12);
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeGreaterThan(radii[i - 1]);
  });

  it('uses the same local compass axes in both observer hemispheres', () => {
    // Latitude is deliberately absent from the projection API: these represent observations
    // already expressed in local apparent altitude and azimuth at two different sites.
    const observations = [
      { hemisphere: 'north', altitude: 45, azimuth: 90 },
      { hemisphere: 'south', altitude: 45, azimuth: 90 },
    ];
    for (const observation of observations) {
      expectPoint(projectSkyChart(observation.altitude, observation.azimuth), -0.5, 0);
    }
  });
});

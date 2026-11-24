import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createSceneToGalactic, type SkyDirection } from '../src/domain/galactic';
import { calculateStarField } from '../src/domain/stars';
import { createSkyRay } from '../src/moment/projection';

const RAD = Math.PI / 180;

describe('the inverse Galactic rotation', () => {
  const references = [
    { ra: 266.405, dec: -28.936, axis: 0, sign: 1 },
    { ra: 86.405, dec: 28.936, axis: 0, sign: -1 },
    { ra: 192.85948, dec: 27.12825, axis: 2, sign: 1 },
    { ra: 12.85948, dec: -27.12825, axis: 2, sign: -1 },
  ];
  for (const [latitude, longitude, instant] of [
    [0, 0, '2026-06-15T00:00:00Z'],
    [-33, 151, '2046-12-02T06:00:00Z'],
    [64, -21, '1980-09-18T15:30:00Z'],
  ] as const) {
    it(`registers independent EQJ directions at ${latitude}, ${longitude}, ${instant}`, () => {
      const date = new Date(instant);
      const observer = new Astronomy.Observer(latitude, longitude, 0);
      const rotation = Astronomy.Rotation_EQJ_HOR(date, observer);
      const field = calculateStarField(latitude, longitude, date, Astronomy.SiderealTime(date));
      const galactic = createSceneToGalactic(field);
      const scene = (ra: number, dec: number): SkyDirection => {
        const d = dec * RAD;
        const a = ra * RAD;
        const eq = new Astronomy.Vector(
          Math.cos(d) * Math.cos(a),
          Math.cos(d) * Math.sin(a),
          Math.sin(d),
          Astronomy.MakeTime(date),
        );
        const horizontal = Astronomy.RotateVector(rotation, eq);
        return [-horizontal.y, horizontal.z, -horizontal.x];
      };
      for (const { ra, dec, axis, sign } of references) {
        const g = galactic(scene(ra, dec));
        expect(g[axis] * sign).toBeGreaterThan(0.9999);
        expect(Math.hypot(...g)).toBeCloseTo(1, 8);
      }
      // Deneb's Galactic latitude is approximately +2 degrees, not near either Galactic pole.
      const deneb = galactic(scene(310.35798, 45.28034));
      expect(Math.asin(deneb[2]) / RAD).toBeCloseTo(2, 0);
    });
  }
});

describe('inverse postcard perspective', () => {
  for (const [heading, altitude, fov, aspect, width, height] of [
    [359.8, 7, 92, 2.4, 1200, 800],
    [0.2, 86, 66, 0.55, 1200, 1500],
    [180, 89.9, 12, 1, 1200, 1200],
    [218, -3, 70, 1.5, 1200, 800],
  ]) {
    it(`matches a three.js camera at ${heading}°, ${altitude}°, aspect ${aspect}`, () => {
      const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 5000);
      camera.rotation.set(altitude * RAD, -heading * RAD, 0, 'YXZ');
      camera.updateMatrixWorld();
      const rayAt = createSkyRay({ heading, altitude, fov }, aspect, width, height);
      const coverHeight = Math.max(width / aspect, height);
      for (const x of [0, width / 2, width]) {
        for (const y of [0, height / 2, height]) {
          const ndcX = (2 * x - width) / (coverHeight * aspect);
          const ndcY = (height - 2 * y) / coverHeight;
          const expected = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera).normalize();
          const actual = new THREE.Vector3(...rayAt(x, y));
          expect(actual.distanceTo(expected)).toBeLessThan(1e-8);
        }
      }
    });
  }

  it('separates rays above and below the geometric horizon', () => {
    const rayAt = createSkyRay({ heading: 359.9, altitude: 0, fov: 92 }, 1.5, 1200, 800);
    for (const x of [0, 600, 1200]) {
      expect(rayAt(x, 399)[1]).toBeGreaterThan(0);
      expect(rayAt(x, 400)[1]).toBe(0);
      expect(rayAt(x, 401)[1]).toBeLessThan(0);
    }
  });
});

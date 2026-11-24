import { expect, test } from '@playwright/test';
import * as Astronomy from 'astronomy-engine';
import type { LocationInfo } from '../../src/types';

type Vector = [number, number, number];
type Pixel = { x: number; y: number };

const RAD = Math.PI / 180;
const WIDTH = 600;
const HEIGHT = 400;
const FOV = 66;
const location: LocationInfo = {
  id: 'galactic-reference',
  name: 'Equatorial reference observer',
  country: 'Test fixture',
  latitude: 0,
  longitude: 0,
  elevation: 0,
  timezone: 'UTC',
};

function equatorial(ra: number, dec: number): Vector {
  return [
    Math.cos(dec * RAD) * Math.cos(ra * RAD),
    Math.cos(dec * RAD) * Math.sin(ra * RAD),
    Math.sin(dec * RAD),
  ];
}

function dot(a: Vector, b: Vector) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Independent IAU J2000 reference directions, in degrees. Do not import the
// application's galactic matrix, precession, star positions or camera projection.
const center = equatorial(266.405, -28.936);
const northPole = equatorial(192.85948, 27.12825);
const deneb = equatorial(310.35798, 45.28034);
const anticenter: Vector = [-center[0], -center[1], -center[2]];

function atLatitude(direction: Vector, latitude: number): Vector {
  const alongPole = dot(direction, northPole);
  const plane: Vector = [
    direction[0] - alongPole * northPole[0],
    direction[1] - alongPole * northPole[1],
    direction[2] - alongPole * northPole[2],
  ];
  const length = Math.hypot(...plane);
  const c = Math.cos(latitude * RAD) / length;
  const s = Math.sin(latitude * RAD);
  return [
    plane[0] * c + northPole[0] * s,
    plane[1] * c + northPole[1] * s,
    plane[2] * c + northPole[2] * s,
  ];
}

// Astronomy Engine's independent EQJ -> horizontal rotation includes precession
// and nutation. Its horizontal axes are north, west, up. The simulator uses its
// own catalog precession and scene matrix, so this is not a self-fulfilling oracle.
function reference(direction: Vector, instant: Date): Vector {
  const observer = new Astronomy.Observer(location.latitude, location.longitude, location.elevation);
  const vector = new Astronomy.Vector(...direction, Astronomy.MakeTime(instant));
  const h = Astronomy.RotateVector(Astronomy.Rotation_EQJ_HOR(instant, observer), vector);
  return [h.x, h.y, h.z];
}

function field(direction: Vector, instant: Date) {
  const forward = reference(direction, instant);
  const altitude = Math.asin(forward[2]);
  const azimuth = Math.atan2(-forward[1], forward[0]);
  const right: Vector = [Math.sin(azimuth), -Math.cos(azimuth), 0];
  const up: Vector = [
    -Math.sin(altitude) * Math.cos(azimuth),
    Math.sin(altitude) * Math.sin(azimuth),
    Math.cos(altitude),
  ];
  const scale = Math.tan((FOV * RAD) / 2);
  const project = (target: Vector): Pixel => {
    const ray = reference(target, instant);
    const depth = dot(ray, forward);
    expect(depth).toBeGreaterThan(0);
    // Keep the probes well above the horizon and away from the postcard compass.
    expect(ray[2]).toBeGreaterThan(Math.sin(12 * RAD));
    return {
      x: 0.5 + dot(ray, right) / (2 * depth * scale * (WIDTH / HEIGHT)),
      y: 0.5 - dot(ray, up) / (2 * depth * scale),
    };
  };
  return {
    view: { heading: (azimuth / RAD + 360) % 360, altitude: altitude / RAD, fov: FOV },
    points: {
      plane: project(direction),
      north: project(atLatitude(direction, 25)),
      south: project(atLatitude(direction, -25)),
    },
  };
}

test('Milky Way and postcard pixels follow independent sky coordinates', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Dedicated Chromium astronomical pixel qualification');
  test.setTimeout(120000);
  await page.goto('/credits.html');
  const fixtures = [
    { name: 'center', direction: center, date: '2026-06-15T00:00:00Z' },
    { name: 'deneb', direction: deneb, date: '2026-08-12T00:00:00Z' },
    { name: 'anticenter', direction: anticenter, date: '2026-12-09T00:00:00Z' },
  ] as const;
  const results = [];
  for (const fixture of fixtures) {
    const { view, points } = field(fixture.direction, new Date(fixture.date));
    const result = await page.evaluate(
      async ({ location, date, view, points, width, height }) => {
        // Use the actual production renderer, real star catalog, capture path and
        // postcard compositor inside the browser, not an emulated fragment shader.
        const { loadStars } = await import('../../src/services/starCatalog.ts');
        const { calculateSky } = await import('../../src/domain/astronomy.ts');
        const { defaultWeatherValues } = await import('../../src/domain/weather.ts');
        const { createSkyRenderer } = await import('../../src/renderer/createSkyRenderer.ts');
        const { drawPostcard, skyHeight } = await import('../../src/moment/postcard.ts');
        const { loadLanguage } = await import('../../src/i18n/index.ts');
        await loadStars();
        const i18n = await loadLanguage('en');
        const instant = new Date(date);
        const sky = calculateSky(location, instant);
        const weather = defaultWeatherValues();
        const host = document.createElement('div');
        host.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px`;
        document.body.append(host);
        const renderer = createSkyRenderer(
          host,
          {
            sky,
            weather,
            initialView: view,
            showStars: true,
            showConstellations: false,
            showLabels: false,
            reducedMotion: true,
            quality: 'high',
            skyBrightness: 'dark',
            horizon: 'ridge',
            labels: {
              canvas: 'Astronomical reference field',
              star: (star) => star.name,
              planet: (id) => id,
              pattern: (id) => id,
              target: (object) => object.name,
            },
          },
          {},
        );

        try {
          const aspect = width / height;
          const exportHeight = skyHeight(aspect);
          const draw = async (stars: boolean) => {
            renderer.update(sky, weather, { stars, constellations: false, labels: false });
            // Capture through the same clear-sky override used by the real keepsake.
            const capture = renderer.capture({ ridge: true, weather });
            const card = drawPostcard({
              snapshot: {
                sky,
                weather,
                view,
                aspect,
                layers: { stars, lines: false, labels: false },
                location,
                instant,
                skyBrightness: 'dark',
                provenance: { kind: 'clear' },
              },
              style: 'realistic',
              horizon: 'ridge',
              capture,
              i18n,
              site: 'example.test',
            });
            const png = card.toDataURL('image/png');
            const image = new Image();
            image.src = png;
            await image.decode();
            const decoded = document.createElement('canvas');
            decoded.width = image.naturalWidth;
            decoded.height = image.naturalHeight;
            decoded.getContext('2d')!.drawImage(image, 0, 0);
            return { frame: capture.image, card: decoded, png };
          };

          const on = await draw(true);
          const off = await draw(false);
          // Subtract the same view with stars/galaxy disabled, then take a median
          // over a circular patch. Individual stars cannot masquerade as diffuse glow.
          const measure = (enabled: HTMLCanvasElement, disabled: HTMLCanvasElement, skyH: number) => {
            const w = enabled.width;
            const a = enabled.getContext('2d')!.getImageData(0, 0, w, skyH).data;
            const b = disabled.getContext('2d')!.getImageData(0, 0, w, skyH).data;
            const patch = (point: Pixel, fraction: number) => {
              const cx = Math.round(point.x * w);
              const cy = Math.round(point.y * skyH);
              const radius = Math.max(2, Math.round(fraction * skyH));
              const values: number[] = [];
              for (let y = cy - radius; y <= cy + radius; y++) {
                for (let x = cx - radius; x <= cx + radius; x++) {
                  if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
                  if (x < 0 || x >= w || y < 0 || y >= skyH) throw new Error('Probe outside sky');
                  const i = (y * w + x) * 4;
                  values.push((a[i] + a[i + 1] + a[i + 2] - b[i] - b[i + 1] - b[i + 2]) / 3);
                }
              }
              values.sort((a, b) => a - b);
              return { median: values[Math.floor(values.length / 2)], peak: values[values.length - 1] };
            };
            return {
              plane: patch(points.plane, 0.025).median,
              north: patch(points.north, 0.025).median,
              south: patch(points.south, 0.025).median,
              starPeak: patch(points.plane, 0.0125).peak,
            };
          };
          return {
            frame: measure(on.frame, off.frame, on.frame.height),
            card: measure(on.card, off.card, exportHeight),
            sunAltitude: sky.sunAltitude,
            moonAltitude: sky.moon.altitude,
            denebLoaded: sky.stars.some((star) => star.name.toLowerCase() === 'deneb'),
            framePng: on.frame.toDataURL('image/png'),
            cardPng: on.png,
          };
        } finally {
          renderer.dispose();
          host.remove();
        }
      },
      { location, date: fixture.date, view, points, width: WIDTH, height: HEIGHT },
    );

    const { framePng, cardPng, ...metrics } = result;
    await info.attach(fixture.name + '-sky.png', {
      body: Buffer.from(framePng.split(',')[1], 'base64'),
      contentType: 'image/png',
    });
    await info.attach(fixture.name + '-realistic-postcard.png', {
      body: Buffer.from(cardPng.split(',')[1], 'base64'),
      contentType: 'image/png',
    });
    await info.attach(fixture.name + '-pixel-metrics.json', {
      body: JSON.stringify({ view, points, ...metrics }, null, 2),
      contentType: 'application/json',
    });
    expect(result.sunAltitude, fixture.name).toBeLessThan(-18);
    expect(result.moonAltitude, fixture.name).toBeLessThan(0);
    expect(result.denebLoaded).toBe(true);
    results.push(metrics);
  }

  for (const surface of ['frame', 'card'] as const) {
    const [core, cygnus, outer] = results.map((result) => result[surface]);
    for (const { plane, north, south } of [core, cygnus, outer]) {
      expect(plane, surface + ': diffuse light is concentrated near the expected plane').toBeGreaterThan(
        Math.max(north, south) + 1.5,
      );
    }
    expect(core.plane, surface + ': inner Galaxy is brighter than the anticenter').toBeGreaterThan(
      outer.plane * 1.5,
    );
    expect(cygnus.starPeak, surface + ': actual Deneb point lies in the reference field').toBeGreaterThan(
      cygnus.plane + 18,
    );
  }
  // The postcard must preserve the registered glow, not rotate, mirror or move it.
  for (const { frame, card } of results) {
    for (const point of ['plane', 'north', 'south'] as const) {
      expect(Math.abs(frame[point] - card[point])).toBeLessThan(3);
    }
  }
});

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
const namedStars = [
  { name: 'Deneb', direction: deneb },
  { name: 'Vega', direction: equatorial(279.234735, 38.783689) },
  { name: 'Altair', direction: equatorial(297.6958, 8.8683) },
];

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
  return [plane[0] * c + northPole[0] * s, plane[1] * c + northPole[1] * s, plane[2] * c + northPole[2] * s];
}

// Astronomy Engine's independent EQJ -> horizontal rotation includes precession
// and nutation. Its horizontal axes are north, west, up. The simulator uses its
// own catalog precession and scene matrix, so this is not a self-fulfilling oracle.
function reference(direction: Vector, instant: Date, place: LocationInfo): Vector {
  const observer = new Astronomy.Observer(place.latitude, place.longitude, place.elevation);
  const vector = new Astronomy.Vector(...direction, Astronomy.MakeTime(instant));
  const h = Astronomy.RotateVector(Astronomy.Rotation_EQJ_HOR(instant, observer), vector);
  return [h.x, h.y, h.z];
}

// Construct a Galactic longitude from independent reference directions, not the shader matrix.
function galacticPlane(longitude: number): Vector {
  const x = atLatitude(center, 0);
  const y: Vector = [
    northPole[1] * x[2] - northPole[2] * x[1],
    northPole[2] * x[0] - northPole[0] * x[2],
    northPole[0] * x[1] - northPole[1] * x[0],
  ];
  const c = Math.cos(longitude * RAD);
  const s = Math.sin(longitude * RAD) / Math.hypot(...y);
  return [c * x[0] + s * y[0], c * x[1] + s * y[1], c * x[2] + s * y[2]];
}

function field(direction: Vector, instant: Date, cygnus: boolean, place: LocationInfo = location) {
  // The Cygnus camera deliberately does not point at any of the named stars.
  const aim = cygnus ? equatorial(300, 35) : direction;
  const forward = reference(aim, instant, place);
  const altitude = Math.asin(forward[2]);
  const azimuth = Math.atan2(-forward[1], forward[0]);
  // Increasing azimuth is eastward; in north/west/up coordinates its tangent
  // is (-sin azimuth, -cos azimuth, 0), perpendicular to the optical axis.
  const right: Vector = [-Math.sin(azimuth), -Math.cos(azimuth), 0];
  expect(Math.abs(dot(forward, right))).toBeLessThan(1e-10);
  const up: Vector = [
    -Math.sin(altitude) * Math.cos(azimuth),
    Math.sin(altitude) * Math.sin(azimuth),
    Math.cos(altitude),
  ];
  const scale = Math.tan((FOV * RAD) / 2);
  const project = (target: Vector): Pixel => {
    const ray = reference(target, instant, place);
    const depth = dot(ray, forward);
    expect(depth).toBeGreaterThan(0);
    // Keep the probes well above the horizon and away from the postcard compass.
    expect(ray[2]).toBeGreaterThan(Math.sin(12 * RAD));
    const point = {
      x: 0.5 + dot(ray, right) / (2 * depth * scale * (WIDTH / HEIGHT)),
      y: 0.5 - dot(ray, up) / (2 * depth * scale),
    };
    for (const coordinate of [point.x, point.y]) {
      expect(coordinate).toBeGreaterThan(0.04);
      expect(coordinate).toBeLessThan(0.96);
    }
    return point;
  };
  expect(project(aim).x).toBeCloseTo(0.5, 9);
  expect(project(aim).y).toBeCloseTo(0.5, 9);
  const band = (name: string, target: Vector, latitude: number) => ({
    name,
    plane: project(atLatitude(target, 0)),
    north: project(atLatitude(target, latitude)),
    south: project(atLatitude(target, -latitude)),
  });
  const bands = [band('primary', direction, 25)];
  if (cygnus) {
    bands.push(band('longitude 65', galacticPlane(65), 16));
    bands.push(band('longitude 90', galacticPlane(90), 16));
  }
  const stars = cygnus ? namedStars.map(({ name, direction }) => ({ name, point: project(direction) })) : [];
  if (cygnus) {
    for (const point of [...bands.map(({ plane }) => plane), ...stars.map(({ point }) => point)]) {
      expect(Math.hypot(point.x - 0.5, point.y - 0.5)).toBeGreaterThan(0.05);
    }
  }
  return {
    view: { heading: (azimuth / RAD + 360) % 360, altitude: altitude / RAD, fov: FOV },
    points: { bands, stars },
  };
}

interface Registration {
  bands: { name: string; plane: number; north: number; south: number }[];
  stars: { name: string; contrast: number; offset: number }[];
}

// Use exactly the same acceptance criteria for the real pixels and the negative
// controls. Offsets are fractions of the sky height (0.008 = 3.2 CSS pixels).
function registrationFailures(surface: Registration): string[] {
  const failures: string[] = [];
  for (const { name, plane, north, south } of surface.bands) {
    if (!(plane > Math.max(north, south) + 1.5)) failures.push('band ' + name);
  }
  for (const { name, contrast, offset } of surface.stars) {
    if (!(contrast > 18 && offset < 0.008)) failures.push('star ' + name);
  }
  return failures;
}

interface Fixture {
  name: string;
  direction: Vector;
  date: string;
  cygnus?: boolean;
  raOffset?: boolean;
  southern?: boolean;
}

test('Milky Way and postcard pixels follow independent sky coordinates', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Dedicated Chromium astronomical pixel qualification');
  test.setTimeout(180000);
  await page.goto('/credits.html');
  const fixtures: Fixture[] = [
    { name: 'center', direction: center, date: '2026-06-15T00:00:00Z' },
    { name: 'deneb', direction: deneb, date: '2026-08-12T00:00:00Z', cygnus: true },
    { name: 'anticenter', direction: anticenter, date: '2026-12-09T00:00:00Z' },
    { name: 'southern', direction: center, date: '2026-06-15T00:00:00Z', southern: true },
    { name: 'ra-offset', direction: center, date: '2026-06-15T00:00:00Z', raOffset: true },
  ];
  const results = [];
  let injections = 0;
  let artInjections = 0;
  for (const fixture of fixtures) {
    if (fixture.raOffset) {
      // On a fresh document, mutate only the real Milky Way shader: rotating its
      // equatorial x/y components by 180 degrees changes RA but not declination.
      // The star catalog and independent reference coordinates remain untouched.
      await page.route('**/src/renderer/milkyWay.ts*', async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        const original = 'GALACTIC * normalize(vLocal)';
        if (source.split(original).length !== 2) {
          await route.fulfill({ response });
          return;
        }
        injections++;
        const body = source.replace(original, 'GALACTIC * normalize(vec3(-vLocal.x, -vLocal.y, vLocal.z))');
        await route.fulfill({ response, body });
      });
      // Independently introduce the same RA bug into the Canvas transform, leaving the
      // matrix consumed by the shader and the reference directions untouched.
      await page.route('**/src/domain/galactic.ts*', async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        const pattern = /(const \{ rotation, precession \} = field;\s*)const m = EQUATORIAL_TO_GALACTIC;/;
        if (!pattern.test(source)) {
          await route.fulfill({ response });
          return;
        }
        artInjections++;
        const body = source.replace(
          pattern,
          '$1const m = EQUATORIAL_TO_GALACTIC.map((v, i) => (i % 3 === 2 ? v : -v));',
        );
        await route.fulfill({ response, body });
      });
      await page.goto('/credits.html');
    }
    const place = fixture.southern ? { ...location, latitude: -30 } : location;
    const { view, points } = field(fixture.direction, new Date(fixture.date), !!fixture.cygnus, place);
    const result = await page.evaluate(
      async ({ location, date, view, points, width, height, checkWeather }) => {
        // Use the actual production renderer, real star catalog, capture path and
        // postcard compositor inside the browser, not an emulated fragment shader.
        const { loadStars } = await import('../../src/services/starCatalog.ts');
        const { calculateSky } = await import('../../src/domain/astronomy.ts');
        const { defaultWeatherValues } = await import('../../src/domain/weather.ts');
        const { createSkyRenderer } = await import('../../src/renderer/createSkyRenderer.ts');
        const { drawPostcard, skyHeight } = await import('../../src/moment/postcard.ts');
        const { loadLanguage } = await import('../../src/i18n/index.ts');
        const { momentImageSnapshot } = await import('../../src/moment/imageWeather.ts');
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

          // Isolate only the Galaxy: both postcards have the same sky, weather, background,
          // paper grain, and no individual stars. The real catalog is used in a third image.
          const base = {
            sky,
            weather,
            view,
            aspect,
            layers: { stars: true, lines: false, labels: false },
            location,
            instant,
            skyBrightness: 'dark' as const,
            provenance: { kind: 'clear' as const },
          };
          const drawArt = async (snapshot: import('../../src/lib/moment').MomentSnapshot) => {
            const start = performance.now();
            const card = drawPostcard({
              snapshot,
              style: 'illustrated',
              horizon: 'ridge',
              capture: null,
              i18n,
              site: 'example.test',
            });
            const drawMs = performance.now() - start;
            const png = card.toDataURL('image/png');
            const image = new Image();
            image.src = png;
            await image.decode();
            const decoded = document.createElement('canvas');
            decoded.width = image.naturalWidth;
            decoded.height = image.naturalHeight;
            decoded.getContext('2d')!.drawImage(image, 0, 0);
            return { card: decoded, png, drawMs };
          };
          const diffuse = { ...base, sky: { ...sky, stars: [] } };
          const artOn = await drawArt(diffuse);
          const artOff = await drawArt({ ...diffuse, layers: { ...base.layers, stars: false } });
          const artFull = await drawArt(base);
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
              let peak = -Infinity;
              let distance = Infinity;
              for (let y = cy - radius; y <= cy + radius; y++) {
                for (let x = cx - radius; x <= cx + radius; x++) {
                  if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
                  if (x < 0 || x >= w || y < 0 || y >= skyH) throw new Error('Probe outside sky');
                  const i = (y * w + x) * 4;
                  const value = (a[i] + a[i + 1] + a[i + 2] - b[i] - b[i + 1] - b[i + 2]) / 3;
                  values.push(value);
                  const offset = Math.hypot(x + 0.5 - point.x * w, y + 0.5 - point.y * skyH);
                  if (value > peak || (value === peak && offset < distance)) {
                    peak = value;
                    distance = offset;
                  }
                }
              }
              values.sort((a, b) => a - b);
              return { median: values[Math.floor(values.length / 2)], peak, offset: distance / skyH };
            };
            return {
              bands: points.bands.map(({ name, plane, north, south }) => ({
                name,
                plane: patch(plane, 0.025).median,
                north: patch(north, 0.025).median,
                south: patch(south, 0.025).median,
              })),
              stars: points.stars.map(({ name, point }) => {
                const { peak, median, offset } = patch(point, 0.02);
                return { name, contrast: peak - median, offset };
              }),
            };
          };

          // Transform only the decoded sky rectangle, leaving the card's text
          // panel out of the measurement. Transform both on/off images alike.
          const transform = (source: HTMLCanvasElement, flipY: boolean) => {
            const canvas = document.createElement('canvas');
            canvas.width = source.width;
            canvas.height = exportHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.translate(canvas.width, flipY ? exportHeight : 0);
            ctx.scale(-1, flipY ? -1 : 1);
            ctx.drawImage(source, 0, 0, source.width, exportHeight, 0, 0, canvas.width, exportHeight);
            return canvas;
          };
          const transformed = points.stars.length
            ? [false, true].map((flipY) => ({
                name: flipY ? '180-degree roll' : 'horizontal mirror',
                pixels: measure(transform(on.card, flipY), transform(off.card, flipY), exportHeight),
              }))
            : [];
          const illustrated = {
            bands: measure(artOn.card, artOff.card, exportHeight).bands,
            stars: measure(artFull.card, artOn.card, exportHeight).stars,
          };
          const artTransformed = points.stars.length
            ? [false, true].map((flipY) => ({
                name: flipY ? '180-degree roll' : 'horizontal mirror',
                pixels: measure(transform(artFull.card, flipY), transform(artOn.card, flipY), exportHeight),
              }))
            : [];
          const conditions = [];
          if (checkWeather) {
            // Visual pairs use the actual renderer, with the same snapshot as the painted card.
            const realistic = (snapshot: import('../../src/lib/moment').MomentSnapshot) => {
              renderer.settings({
                reducedMotion: true,
                quality: 'high',
                horizon: 'ridge',
                skyBrightness: snapshot.skyBrightness,
              });
              renderer.update(snapshot.sky, snapshot.weather, {
                stars: snapshot.layers.stars,
                constellations: false,
                labels: false,
              });
              const capture = renderer.capture({ ridge: true, weather: snapshot.weather });
              return drawPostcard({
                snapshot,
                style: 'realistic',
                horizon: 'ridge',
                capture,
                i18n,
                site: 'example.test',
              }).toDataURL('image/png');
            };
            // Synthetic photometric controls isolate attenuation at the same sky coordinates.
            const fixtures = [
              {
                name: 'daylight',
                snapshot: {
                  ...diffuse,
                  sky: {
                    ...diffuse.sky,
                    sunAltitude: 20,
                    sun: { ...sky.sun, altitude: 20, geometricAltitude: 20, visible: true },
                  },
                },
              },
              { name: 'twilight', snapshot: { ...diffuse, sky: { ...diffuse.sky, sunAltitude: -10 } } },
              {
                name: 'moonlight',
                snapshot: {
                  ...diffuse,
                  sky: {
                    ...diffuse.sky,
                    moon: { ...sky.moon, altitude: 85, geometricAltitude: 85, illumination: 1, visible: true },
                  },
                },
              },
              { name: 'city', snapshot: { ...diffuse, skyBrightness: 'city' as const } },
              {
                name: 'partial',
                snapshot: {
                  ...diffuse,
                  weather: { ...weather, cloudCover: 55, cloudLow: 55, cloudMid: 25 },
                },
              },
              {
                name: 'overcast',
                snapshot: {
                  ...diffuse,
                  weather: { ...weather, cloudCover: 100, cloudLow: 100, cloudMid: 100, cloudHigh: 100 },
                },
              },
            ];
            for (const { name, snapshot } of fixtures) {
              const enabled = await drawArt(snapshot);
              const disabled = await drawArt({ ...snapshot, layers: { ...snapshot.layers, stars: false } });
              const pixels = measure(enabled.card, disabled.card, exportHeight);
              const fullSnapshot = { ...snapshot, sky: { ...snapshot.sky, stars: sky.stars } };
              const full = await drawArt(fullSnapshot);
              conditions.push({ name, pixels, png: full.png, realisticPng: realistic(fullSnapshot) });
            }
            const overcast = fixtures[fixtures.length - 1].snapshot;
            const clear = momentImageSnapshot(overcast, true);
            const restored = await drawArt({
              ...diffuse,
              weather: clear.weather,
            });
            conditions.push({
              name: 'clear-override',
              pixels: measure(restored.card, artOff.card, exportHeight),
              png: restored.png,
              realisticPng: realistic({ ...base, weather: clear.weather }),
            });
            // Exercise actual cover crops in both renderers with the full catalog.
            for (const [name, w, h] of [
              ['portrait', 330, 600],
              ['wide', 960, 400],
            ] as const) {
              host.style.width = w + 'px';
              host.style.height = h + 'px';
              // Wait for ResizeObserver to update the WebGL camera aspect.
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
              );
              const snapshot = { ...base, aspect: w / h };
              const image = await drawArt(snapshot);
              conditions.push({ name, pixels: null, png: image.png, realisticPng: realistic(snapshot) });
            }
          }
          return {
            frame: measure(on.frame, off.frame, on.frame.height),
            card: measure(on.card, off.card, exportHeight),
            transformed,
            illustrated,
            artTransformed,
            artDrawMs: { isolated: artOn.drawMs, withoutGalaxy: artOff.drawMs, full: artFull.drawMs },
            artPng: artFull.png,
            artWithoutStarsPng: artOn.png,
            conditions,
            sunAltitude: sky.sunAltitude,
            moonAltitude: sky.moon.altitude,
            namedStarsLoaded: points.stars.every(({ name }) =>
              sky.stars.some((star) => star.name.toLowerCase() === name.toLowerCase()),
            ),
            framePng: on.frame.toDataURL('image/png'),
            cardPng: on.png,
          };
        } finally {
          renderer.dispose();
          host.remove();
        }
      },
      {
        location: place,
        date: fixture.date,
        view,
        points,
        width: WIDTH,
        height: HEIGHT,
        checkWeather: fixture.name === 'center',
      },
    );

    const { framePng, cardPng, artPng, artWithoutStarsPng, conditions, ...metrics } = result;
    await info.attach(fixture.name + '-illustrated-postcard.png', {
      body: Buffer.from(artPng.split(',')[1], 'base64'),
      contentType: 'image/png',
    });
    await info.attach(fixture.name + '-isolated-illustrated-postcard.png', {
      body: Buffer.from(artWithoutStarsPng.split(',')[1], 'base64'),
      contentType: 'image/png',
    });
    for (const { name, png, realisticPng } of conditions) {
      await info.attach(name + '-illustrated-postcard.png', {
        body: Buffer.from(png.split(',')[1], 'base64'),
        contentType: 'image/png',
      });
      await info.attach(name + '-realistic-postcard.png', {
        body: Buffer.from(realisticPng.split(',')[1], 'base64'),
        contentType: 'image/png',
      });
    }
    await info.attach(fixture.name + '-sky.png', {
      body: Buffer.from(framePng.split(',')[1], 'base64'),
      contentType: 'image/png',
    });
    await info.attach(fixture.name + '-realistic-postcard.png', {
      body: Buffer.from(cardPng.split(',')[1], 'base64'),
      contentType: 'image/png',
    });
    await info.attach(fixture.name + '-pixel-metrics.json', {
      body: JSON.stringify(
        { view, points, ...metrics, conditions: conditions.map(({ name, pixels }) => ({ name, pixels })) },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    expect(result.sunAltitude, fixture.name).toBeLessThan(-18);
    expect(result.moonAltitude, fixture.name).toBeLessThan(0);
    expect(result.namedStarsLoaded).toBe(true);

    if (fixture.raOffset) {
      expect(injections, 'real shader mutation installed').toBe(1);
      expect(artInjections, 'Canvas RA mutation installed').toBe(1);
      expect(registrationFailures({ ...metrics.illustrated, stars: [] })).toContain('band primary');
      for (const surface of ['frame', 'card'] as const) {
        expect(registrationFailures(metrics[surface]), surface + ': reject the RA offset').toContain(
          'band primary',
        );
      }
      continue;
    }

    for (const surface of ['frame', 'card'] as const) {
      expect(registrationFailures(metrics[surface]), fixture.name + ': ' + surface).toEqual([]);
    }
    expect(
      registrationFailures({ ...metrics.illustrated, stars: [] }),
      fixture.name + ': illustrated diffuse pixels',
    ).toEqual([]);
    if (fixture.cygnus) {
      for (const { contrast, offset, name } of metrics.illustrated.stars) {
        expect(contrast, name + ': illustrated star contrast').toBeGreaterThan(8);
        expect(offset, name + ': illustrated star position').toBeLessThan(0.025);
      }
      for (const { name, pixels } of metrics.artTransformed) {
        expect(
          pixels.stars.some(({ contrast, offset }) => contrast <= 8 || offset >= 0.025),
          name + ': reject illustrated orientation',
        ).toBe(true);
      }
      expect(metrics.transformed).toHaveLength(2);
      for (const { name, pixels } of metrics.transformed) {
        const failures = registrationFailures(pixels);
        expect(
          failures.some((failure) => failure.startsWith('star ')),
          name + ': reject orientation',
        ).toBe(true);
      }
    }
    if (fixture.name === 'center') {
      const plane = (name: string) =>
        conditions.find((condition) => condition.name === name)!.pixels!.bands[0].plane;
      for (const name of ['daylight', 'city', 'overcast']) expect(plane(name), name).toBe(0);
      for (const name of ['moonlight', 'twilight']) {
        expect(plane(name), name).toBeLessThan(metrics.illustrated.bands[0].plane);
      }
      expect(plane('clear-override')).toBeGreaterThan(1.5);
    }
    results.push(metrics);
  }

  for (const surface of ['frame', 'card', 'illustrated'] as const) {
    const [core, , outer] = results.map((result) => result[surface].bands[0].plane);
    expect(core, surface + ': inner Galaxy is brighter than the anticenter').toBeGreaterThan(outer * 1.5);
  }
  // The card must preserve the diffuse glow at every registered probe.
  for (const { frame, card } of results) {
    for (const [i, band] of frame.bands.entries()) {
      for (const point of ['plane', 'north', 'south'] as const) {
        expect(Math.abs(band[point] - card.bands[i][point])).toBeLessThan(3);
      }
    }
  }
});

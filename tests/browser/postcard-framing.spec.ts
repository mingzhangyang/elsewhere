import { expect, test, type Page } from '@playwright/test';
import * as Astronomy from 'astronomy-engine';
import type { CameraView } from '../../src/lib/persistence';

test('smart keepsakes reframe both image styles without moving the live sky or shared link', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.goto('/?scenario=day');
  const share = page.getByRole('button', { name: 'Share this sky', exact: true });
  await expect(page.getByRole('img', { name: /^Sky view\./ })).toBeVisible();
  await share.click();
  const dialog = page.getByRole('dialog', { name: 'Share this sky' });
  const link = dialog.getByRole('textbox', { name: 'Sky link' });
  const original = await link.inputValue();
  const smart = dialog.getByRole('button', { name: 'Smart framing' });
  const current = dialog.getByRole('button', { name: 'Current view' });
  const image = dialog.getByRole('img', { name: /Keepsake image of the sky over/ });
  await expect(smart).toHaveAttribute('aria-pressed', 'true');
  await expect(image).toBeVisible({ timeout: 30000 });
  for (const style of ['Realistic', 'Illustrated']) {
    await dialog.getByRole('button', { name: style, exact: true }).click();
    await smart.click();
    await expect(image).toBeVisible({ timeout: 30000 });
    const smartSrc = await image.getAttribute('src');
    if (info.project.name === 'chromium' || info.project.name === 'mobile-chromium') {
      await info.attach(style + '-smart-' + info.project.name + '.png', {
        body: await image.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      });
    }
    await current.click();
    await expect(image).toBeVisible({ timeout: 30000 });
    await expect(image).not.toHaveAttribute('src', smartSrc!);
    expect(await link.inputValue()).toBe(original);
    if (info.project.name === 'chromium' || info.project.name === 'mobile-chromium') {
      await info.attach(style + '-current-' + info.project.name + '.png', {
        body: await image.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      });
    }
  }
  await dialog.getByRole('button', { name: 'Close sharing' }).click();
  await share.click();
  await expect(link).toHaveValue(original);
});

type Point = { x: number; y: number };
const RAD = Math.PI / 180;

// Independent horizontal-coordinate projection: no imports of frameMoment or createProjection.
// The cover crop is applied in pixel space, not by assuming the live and postcard aspect agree.
function projected(
  body: { altitude: number; azimuth: number },
  view: CameraView,
  aspect: number,
  width: number,
  height: number,
): Point {
  const a = body.altitude * RAD;
  const p = view.altitude * RAD;
  const d = (body.azimuth - view.heading) * RAD;
  const depth = Math.sin(a) * Math.sin(p) + Math.cos(a) * Math.cos(p) * Math.cos(d);
  expect(depth).toBeGreaterThan(0);
  const right = Math.cos(a) * Math.sin(d);
  const up = Math.sin(a) * Math.cos(p) - Math.cos(a) * Math.sin(p) * Math.cos(d);
  const coverHeight = Math.max(height, width / aspect);
  const scale = coverHeight / (2 * Math.tan((view.fov * RAD) / 2));
  return { x: 0.5 + (right * scale) / (depth * width), y: 0.5 - (up * scale) / (depth * height) };
}

function postcardPoint(body: { altitude: number; azimuth: number }, view: CameraView, aspect: number) {
  return projected(body, view, aspect, 1200, Math.round(Math.min(1500, Math.max(800, 1200 / aspect))));
}

// Decode the actual exported PNG (or a screenshot of the visible WebGL canvas). Measure the
// bright core within a small projected neighborhood against a much wider local sky annulus.
// Probing the other mode's expected position is a negative control for an unchanged camera.
async function coreContrast(page: Page, src: string, points: Point[], skyHeight?: number) {
  return page.evaluate(
    async ({ src, points, skyHeight }) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = skyHeight ?? image.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const at = (x: number, y: number) => {
        const i = (Math.round(y) * canvas.width + Math.round(x)) * 4;
        return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      };
      return points.map(({ x, y }) => {
        const cx = x * canvas.width;
        const cy = y * canvas.height;
        const radius = Math.max(3, Math.round(canvas.height * 0.009));
        const core: number[] = [];
        for (let dy = -radius; dy <= radius; dy++)
          for (let dx = -radius; dx <= radius; dx++)
            if (Math.hypot(dx, dy) <= radius) core.push(at(cx + dx, cy + dy));
        core.sort((a, b) => b - a);
        const peak = core.slice(0, 5).reduce((sum, value) => sum + value, 0) / 5;
        const ring: number[] = [];
        for (let angle = 0; angle < 32; angle++) {
          const a = (angle * Math.PI) / 16;
          for (const distance of [0.055, 0.075]) {
            const r = distance * canvas.height;
            ring.push(at(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
          }
        }
        return peak - ring.reduce((sum, value) => sum + value, 0) / ring.length;
      });
    },
    { src, points, skyHeight },
  );
}

for (const fixture of [
  { name: 'day', body: Astronomy.Body.Sun, instant: '2026-11-12T17:00:00Z' },
  { name: 'moon', body: Astronomy.Body.Moon, instant: '2026-11-24T02:00:00Z' },
]) {
  test(`${fixture.name}: postcard and restored sky pixels follow the projection`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'Dedicated Chromium astronomical pixel qualification');
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const location = {
      id: 'new-york',
      name: 'New York',
      country: 'United States',
      latitude: 40.7128,
      longitude: -74.006,
      elevation: 10,
      timezone: 'America/New_York',
    };
    const date = new Date(fixture.instant);
    const observer = new Astronomy.Observer(location.latitude, location.longitude, location.elevation);
    const equator = Astronomy.Equator(fixture.body, date, observer, true, true);
    const body = Astronomy.Horizon(date, observer, equator.ra, equator.dec, 'normal');
    expect(body.altitude).toBeGreaterThan(15);
    // Deliberately use a different heading, pitch and FOV from smart framing, without a focused subject.
    const currentView = { heading: (body.azimuth + 24) % 360, altitude: body.altitude + 6, fov: 50 };
    const smartView = {
      heading: (body.azimuth + 352) % 360,
      altitude: Math.max(19, Math.min(90, body.altitude - 66 * 0.18)),
      fov: 66,
    };
    const hash = encodeURIComponent(
      JSON.stringify({
        version: 1,
        location,
        instant: date.toISOString(),
        camera: currentView,
        layers: { stars: false, lines: false, labels: false },
        custom: null,
        clearSky: true,
      }),
    );
    await page.goto(`/?scenario=${fixture.name}#sky=${hash}`);
    const sky = page.getByRole('img', { name: /^Sky view\./ });
    await expect(sky).toBeVisible();
    const host = await page.locator('.sky-scene').evaluate((element) => ({
      width: element.clientWidth,
      height: element.clientHeight,
    }));
    const aspect = host.width / host.height;
    const smartAspect = Math.min(1.5, Math.max(0.8, aspect));
    const currentPoint = postcardPoint(body, currentView, aspect);
    const smartPoint = postcardPoint(body, smartView, smartAspect);
    expect(Math.hypot(currentPoint.x - smartPoint.x, currentPoint.y - smartPoint.y)).toBeGreaterThan(0.15);
    const livePoints = [
      projected(body, currentView, aspect, host.width, host.height),
      projected(body, smartView, aspect, host.width, host.height),
    ];
    for (const point of [currentPoint, smartPoint, ...livePoints]) {
      expect(point.x).toBeGreaterThan(0.12);
      expect(point.x).toBeLessThan(0.88);
      expect(point.y).toBeGreaterThan(0.12);
      expect(point.y).toBeLessThan(0.88);
    }
    const dimensions = () => sky.evaluate((element: HTMLCanvasElement) => [element.width, element.height]);
    const verifyLive = async (label: string) => {
      // Read the actual displayed canvas, not a second renderer.capture() which could hide a restoration bug.
      const overlay = await page.addStyleTag({
        content:
          '.sky-target, [data-occludes-sky], .scene-hint, .stage-vignette { visibility: hidden !important; }',
      });
      try {
        await expect
          .poll(
            async () => {
              const png = await sky.screenshot({ animations: 'disabled', scale: 'css' });
              const [here, there] = await coreContrast(
                page,
                'data:image/png;base64,' + png.toString('base64'),
                livePoints,
              );
              return Math.min(here, here - there);
            },
            { message: label, timeout: 20000 },
          )
          .toBeGreaterThan(12);
        await info.attach(label + '.png', {
          body: await sky.screenshot({ animations: 'disabled' }),
          contentType: 'image/png',
        });
      } finally {
        await overlay.evaluate((node) => {
          node.parentNode?.removeChild(node);
        });
      }
    };
    await verifyLive('live-before');
    const originalDimensions = await dimensions();
    const share = page.getByRole('button', { name: 'Share this sky', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Share this sky' });
    const link = dialog.getByRole('textbox', { name: 'Sky link' });
    const image = dialog.getByRole('img', { name: /Keepsake image of the sky over/ });
    const smart = dialog.getByRole('button', { name: 'Smart framing' });
    const current = dialog.getByRole('button', { name: 'Current view' });
    const checkCard = async (mode: 'smart' | 'current', style: string) => {
      await (mode === 'smart' ? smart : current).click();
      await expect(image).toBeVisible({ timeout: 30000 });
      const src = (await image.getAttribute('src'))!;
      const cardAspect = mode === 'smart' ? smartAspect : aspect;
      const height = Math.round(Math.min(1500, Math.max(800, 1200 / cardAspect)));
      const points = mode === 'smart' ? [smartPoint, currentPoint] : [currentPoint, smartPoint];
      const [here, there] = await coreContrast(page, src, points, height);
      expect(here, `${style} ${mode} celestial core`).toBeGreaterThan(12);
      expect(here - there, `${style} ${mode} wrong-position control`).toBeGreaterThan(12);
      await info.attach(`${style}-${mode}.png`, {
        body: await image.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      });
    };

    await share.click();
    const original = await link.inputValue();
    await checkCard('smart', 'Realistic');
    // Close directly after the smart WebGL capture; a subsequent current-view capture must not
    // be allowed to accidentally fix a leaked camera before this assertion.
    await dialog.getByRole('button', { name: 'Close sharing' }).click();
    await verifyLive('live-after-smart-capture');
    expect(await dimensions()).toEqual(originalDimensions);

    await share.click();
    await expect(link).toHaveValue(original);
    await checkCard('current', 'Realistic');
    await dialog.getByRole('button', { name: 'Illustrated', exact: true }).click();
    await checkCard('smart', 'Illustrated');
    await checkCard('current', 'Illustrated');
    await expect(link).toHaveValue(original);
  });
}

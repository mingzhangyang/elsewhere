import { expect, test } from '@playwright/test';
import { capture, quantile } from './pixels';

// Rendered-pixel checks for appearance regressions that source-level shader tests cannot see.

test('a crescent Moon at civil dusk has no dark hole where its unlit side is', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?scenario=dusk');
  await page.getByRole('button', { name: 'Find the Moon' }).click();
  await page.getByRole('button', { name: 'Center in view' }).click();
  const ring = page.locator('.sky-target');
  // Framed at a narrow field, the disc is large enough to sample well inside it.
  await expect.poll(async () => (await ring.boundingBox())?.width ?? 0).toBeGreaterThan(120);
  // Let the centering animation settle: the ring stops changing size and place.
  let previous = '';
  await expect
    .poll(async () => {
      const box = await ring.boundingBox();
      const now = box ? [box.x, box.y, box.width].map(Math.round).join(',') : '';
      const settled = now !== '' && now === previous;
      previous = now;
      return settled;
    })
    .toBe(true);
  const box = (await ring.boundingBox())!;
  const canvas = page.getByRole('img', { name: /^Sky view\./ });
  const view = (await canvas.boundingBox())!;
  // Measure the sky alone: hide the ring, labels and interface laid over the canvas.
  await page.addStyleTag({
    content:
      '.sky-target, [data-occludes-sky], .scene-hint, .stage-vignette { visibility: hidden !important; }',
  });
  await page.waitForTimeout(150);
  const pixels = await capture(page, canvas);
  const cx = box.x + box.width / 2 - view.x;
  const cy = box.y + box.height / 2 - view.y;
  const ringRadius = box.width / 2;
  const disc = ringRadius - 8; // MARKER_GAP_PX: the ring sits just outside the lunar limb.

  const inner: number[] = [];
  const sky: number[] = [];
  const whole: number[] = [];
  for (let a = 0; a < 360; a += 5) {
    const ux = Math.cos((a * Math.PI) / 180);
    const uy = Math.sin((a * Math.PI) / 180);
    for (const f of [0.15, 0.3, 0.45, 0.6, 0.7])
      inner.push(pixels.at(cx + ux * disc * f, cy + uy * disc * f));
    for (const f of [0.8, 0.9, 0.96]) whole.push(pixels.at(cx + ux * disc * f, cy + uy * disc * f));
    for (const d of [8, 18, 30]) sky.push(pixels.at(cx + ux * (ringRadius + d), cy + uy * (ringRadius + d)));
  }
  const unlit = quantile(inner, 0.5);
  const around = quantile(sky, 0.5);
  // The sunlit crescent is there and brighter than the sky...
  expect(Math.max(...whole, ...inner)).toBeGreaterThan(around * 1.3);
  // ...but the unlit side is not darker than the twilight sky in front of it (it was about 0.4×).
  expect(unlit).toBeGreaterThan(around * 0.9);
});

// White is the worst case for light text: a sunlit cloud directly behind the title.
for (const { label, width, height, lines } of [
  {
    label: 'desktop',
    width: 1280,
    height: 800,
    lines: ['.sky-context .eyebrow', '.sky-context h1', '.context-place'],
  },
  { label: 'phone', width: 390, height: 844, lines: ['.sky-context .eyebrow'] },
]) {
  test(`sky title text stays legible over a white cloud on ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?scenario=day');
    await expect(page.locator('.sky-context')).toBeVisible();
    await page.addStyleTag({
      content:
        '.sky-scene, .stage-vignette { visibility: hidden !important; } .stage { background: #fff !important; }',
    });
    for (const selector of lines) {
      const line = page.locator(selector);
      await expect(line).toBeVisible();
      const values = (await capture(page, line)).all();
      // Light glyphs need a dark edge around them to separate them from the white behind. A soft
      // shadow alone measured about 1.2; the outlined text about 3.1–3.4 (left room for engines).
      const edge = quantile(values, 0.03);
      const background = quantile(values, 0.97);
      expect((background + 0.05) / (edge + 0.05), selector).toBeGreaterThan(2.5);
    }
  });
}

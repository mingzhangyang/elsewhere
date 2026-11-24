import { expect, test, type Page } from '@playwright/test';

type Rect = { x: number; y: number; width: number; height: number };

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function rect(page: Page, selector: string): Promise<Rect> {
  const box = await page.locator(selector).boundingBox();
  expect(box, `Missing visible bounds for ${selector}`).not.toBeNull();
  return box!;
}

test('mobile sky chrome stays separate and view tools expand in place', async ({ page }) => {
  for (const { width, height } of [
    { width: 390, height: 844 },
    { width: 320, height: 640 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/?scenario=day');
    const context = await rect(page, '.sky-context');
    const compass = await rect(page, '.sky-compass');
    const view = await rect(page, '.view-controls');
    const explore = await rect(page, '.explore-toolbar');
    expect(overlaps(context, compass)).toBe(false);
    expect(overlaps(context, view)).toBe(false);
    expect(overlaps(view, explore)).toBe(false);

    for (const selector of ['.source-pill', '.sky-create-link']) {
      const target = await rect(page, selector);
      expect(target.x + target.width).toBeLessThanOrEqual(width - 8);
    }

    const toggle = page.locator('.view-tools-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.view-tools-actions')).toBeHidden();
    const before = await toggle.boundingBox();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.view-tools-actions')).toBeVisible();
    const expanded = await rect(page, '.view-tools-actions');
    expect(expanded.x).toBeGreaterThanOrEqual(8);
    expect(expanded.x + expanded.width).toBeLessThanOrEqual(width - 8);
    expect(overlaps(context, expanded)).toBe(false);
    const after = await toggle.boundingBox();
    expect(after!.x).toBeCloseTo(before!.x, 0);
    expect(after!.y).toBeCloseTo(before!.y, 0);
    await page.locator('.view-tools-actions .icon-button').first().click();
    await toggle.click();
    await expect(page.locator('.view-tools-actions')).toBeHidden();
  }
});

test('immersive view keeps a direct one-tap exit on phones', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?scenario=day');
  const eye = page.locator('.view-controls > .icon-button:last-child');
  await eye.click();
  await expect(eye).toHaveAttribute('aria-pressed', 'true');
  await expect(eye).toBeVisible();
  await expect(page.locator('.view-tools-toggle')).toBeHidden();
  await eye.click();
  await expect(eye).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.explore-toolbar')).toBeVisible();
});

test('desktop continues showing zoom and reset without an extra tap', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?scenario=day');
  await expect(page.locator('.view-tools-toggle')).toBeHidden();
  await expect(page.locator('.view-tools-actions')).toBeVisible();
  await expect(page.locator('.view-tools-actions .icon-button')).toHaveCount(3);
});

test('clear-sky restore stays clickable with the tools expanded', async ({ page }) => {
  for (const { width, height } of [
    { width: 390, height: 844 },
    { width: 320, height: 640 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/?scenario=day');
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await page.getByRole('button', { name: 'Clear-sky preview', exact: true }).click();
    await page.getByRole('button', { name: 'Close inspector' }).click();
    const restore = page.getByRole('button', { name: 'Restore weather atmosphere', exact: true });
    await expect(restore).toBeVisible();

    const toggle = page.locator('.view-tools-toggle');
    const before = await rect(page, '.view-tools-toggle');
    await toggle.click();
    await expect(page.locator('.view-tools-actions')).toBeVisible();
    const expanded = await rect(page, '.view-tools-actions');
    expect(overlaps(expanded, await rect(page, '.sky-context'))).toBe(false);
    expect(overlaps(expanded, await rect(page, '.explore-toolbar'))).toBe(false);
    expect(overlaps(await rect(page, '.view-controls'), await rect(page, '.sky-context'))).toBe(false);
    const after = await rect(page, '.view-tools-toggle');
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
    // A real click also checks that no higher stacking layer intercepts Restore.
    await restore.click();
    await expect(restore).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
});

test('the night renderer reads the popover bounds when expanded and collapsed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?scenario=night');
  await expect(page.getByRole('img', { name: /^Sky view\./ })).toBeVisible();
  const actions = page.locator('.view-tools-actions');
  await expect(actions).toBeHidden();
  await expect(page.locator('.view-tools-actions[data-occludes-sky]')).toHaveCount(1);

  // Observe the renderer's existing geometry read, not a screenshot of canvas glyphs.
  // No Playwright bounds queries on this element after instrumentation.
  await actions.evaluate((element) => {
    const el = element as HTMLElement;
    const measure = el.getBoundingClientRect.bind(el);
    el.getBoundingClientRect = () => {
      const box = measure();
      el.dataset.occlusionSize = box.width && box.height ? 'visible' : 'hidden';
      return box;
    };
  });
  const toggle = page.locator('.view-tools-toggle');
  await toggle.click();
  await expect(actions).toHaveAttribute('data-occlusion-size', 'visible');
  await toggle.click();
  await expect(actions).toHaveAttribute('data-occlusion-size', 'hidden');
});

test.describe('Chinese compass', () => {
  test.use({ locale: 'zh-CN' });

  test('a diagonal heading fits on one line above the degrees on a narrow phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const shared = {
      version: 1,
      location: {
        id: 'new-york',
        name: 'New York',
        country: 'United States',
        latitude: 40.7128,
        longitude: -74.006,
        elevation: 10,
        timezone: 'America/New_York',
      },
      instant: '2026-01-10T05:00:00.000Z',
      camera: { heading: 315, altitude: 40, fov: 50 },
      layers: { stars: true, lines: false, labels: true },
      custom: null,
    };
    await page.goto('/#sky=' + encodeURIComponent(JSON.stringify(shared)));
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
    const compass = page.locator('.sky-compass');
    await expect(compass.locator('strong')).toHaveText('西北');
    await expect(compass.locator('span')).toHaveText('315°');
    const geometry = await compass.evaluate((el) => {
      const direction = el.querySelector('strong')!;
      const degrees = el.querySelector('span')!.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(direction);
      const text = range.getBoundingClientRect();
      const bounds = el.getBoundingClientRect();
      return {
        lines: range.getClientRects().length,
        inside: text.left >= bounds.left && text.right <= bounds.right,
        separated: text.bottom <= degrees.top,
      };
    });
    expect(geometry).toEqual({ lines: 1, inside: true, separated: true });
  });
});

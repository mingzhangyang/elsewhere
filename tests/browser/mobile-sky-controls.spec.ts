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

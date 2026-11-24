import { expect, test } from '@playwright/test';

test('the all-sky map follows perspective zoom, resize and navigation', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?scenario=night');
  const map = page.getByRole('button', { name: /^All-sky map/ });
  const footprint = page.locator('.sky-minimap-footprint');
  await expect(map).toBeVisible();
  await expect(footprint).toBeVisible();
  const initial = await footprint.getAttribute('d');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(footprint).not.toHaveAttribute('d', initial!);
  const zoomed = await footprint.getAttribute('d');
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(footprint).not.toHaveAttribute('d', zoomed!);
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width * 0.25, y: box.height * 0.5 } });
  await expect(page.locator('.sky-compass strong')).toHaveText('E');
  await expect(page.locator('.sky-compass span')).toHaveText('90°');
  await map.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.sky-minimap-altitude')).toHaveText('Alt 90°');
  await info.attach('desktop-minimap.png', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Hide controls' }).click();
  await expect(map).toHaveCount(0);
  await page.getByRole('button', { name: 'Show controls' }).click();
  await expect(map).toBeVisible();
});

test('the phone map fits the existing compass slot and hides behind inspectors', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/?scenario=night');
  const map = page.getByRole('button', { name: /^All-sky map/ });
  await expect(page.locator('.sky-minimap-footprint')).toBeVisible();
  const box = (await map.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await info.attach('mobile-minimap.png', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await expect(map).toHaveCount(0);
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await expect(map).toBeVisible();
});

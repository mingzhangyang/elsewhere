import { expect, test } from '@playwright/test';

test('desktop hints stay in bounds without shifting controls', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chromium', 'Desktop pointer only');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?scenario=day');
  const tooltip = page.locator('.desktop-tooltip');
  const zoom = page.getByRole('button', { name: 'Zoom in', exact: true });
  const before = await zoom.boundingBox();
  await zoom.hover();
  await expect(tooltip).toHaveText('Zoom in');
  await expect(tooltip).toBeVisible();
  expect(await zoom.boundingBox()).toEqual(before);
  const box = (await tooltip.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1280);
  expect(box.y + box.height).toBeLessThanOrEqual(800);

  await tooltip.hover();
  await page.waitForTimeout(250);
  await expect(tooltip).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);
  await zoom.hover();
  await expect(tooltip).toHaveText('Zoom in');
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);

  const share = page.getByRole('button', { name: 'Share this sky', exact: true });
  await share.hover();
  await expect(tooltip).toHaveText('Share this sky');
  const shareBox = (await tooltip.boundingBox())!;
  expect(shareBox.x + shareBox.width).toBeLessThanOrEqual(1280);
  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);

  const eye = page.getByRole('button', { name: 'Hide controls', exact: true });
  await eye.hover();
  await expect(tooltip).toHaveText('Hide controls');
  await eye.click();
  await expect(tooltip).toHaveCount(0);
  const restore = page.getByRole('button', { name: 'Show controls', exact: true });
  await expect(restore).toBeVisible();
  await page.mouse.move(0, 0);
  await restore.hover();
  await expect(tooltip).toHaveText('Show controls');
  await restore.click();
});

test('keyboard focus and native dialogs have accessible control hints', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chromium', 'Desktop pointer only');
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto('/?scenario=day');
  const tooltip = page.locator('.desktop-tooltip');
  const zoom = page.getByRole('button', { name: 'Zoom in', exact: true });
  await page.keyboard.press('Tab');
  await zoom.focus();
  await expect(tooltip).toHaveText('Zoom in');
  await expect(zoom).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await expect(zoom).toBeFocused();

  await page.getByRole('button', { name: 'Change date and time', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a moment' });
  const previous = dialog.getByRole('button', { name: 'Previous day' });
  await previous.hover();
  await expect(dialog.locator('.desktop-tooltip')).toHaveText('Previous day');
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await expect(dialog).toBeHidden();
});

test('hover and keyboard focus retain independent hint ownership', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chromium', 'Desktop pointer only');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?scenario=day');
  const tooltip = page.locator('.desktop-tooltip');
  const zoom = page.getByRole('button', { name: 'Zoom in', exact: true });
  const zoomOut = page.getByRole('button', { name: 'Zoom out', exact: true });

  await page.keyboard.press('Tab');
  await zoom.focus();
  await expect(tooltip).toHaveText('Zoom in');
  await zoom.hover();
  await page.mouse.move(0, 0);
  // Outlast the pointer-departure grace period while keyboard focus remains.
  await page.waitForTimeout(250);
  await expect(tooltip).toHaveText('Zoom in');
  await expect(zoom).toBeFocused();

  await zoom.hover();
  await page.keyboard.press('Tab');
  await zoomOut.focus();
  await expect(zoomOut).toBeFocused();
  // A different keyboard focus must not steal the active hover hint.
  await page.waitForTimeout(400);
  await expect(tooltip).toHaveText('Zoom in');
  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveText('Zoom out');
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await page.waitForTimeout(400);
  await expect(tooltip).toHaveCount(0);
});

for (const key of ['Enter', 'Space']) {
  test(`keyboard ${key} dismisses the hint without canceling the click`, async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-chromium', 'Desktop pointer only');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?scenario=day');
    const tooltip = page.locator('.desktop-tooltip');
    const zoom = page.getByRole('button', { name: 'Zoom in', exact: true });
    await zoom.evaluate((button) => {
      button.addEventListener(
        'click',
        (event) => {
          if (!event.defaultPrevented) button.dataset.keyboardActivated = 'true';
        },
        { once: true },
      );
    });
    await page.keyboard.press('Tab');
    await zoom.focus();
    await expect(tooltip).toHaveText('Zoom in');
    await page.keyboard.press(key);
    await expect(zoom).toHaveAttribute('data-keyboard-activated', 'true');
    await expect(zoom).toBeFocused();
    await expect(tooltip).toHaveCount(0);
    await page.waitForTimeout(400);
    await expect(tooltip).toHaveCount(0);
  });
}

test.describe('Chinese tooltip labels', () => {
  test.use({ locale: 'zh-CN' });
  test('reuse translated control labels and toolbar descriptions', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-chromium', 'Desktop pointer only');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?scenario=day');
    const tooltip = page.locator('.desktop-tooltip');
    await page.getByRole('button', { name: '放大', exact: true }).hover();
    await expect(tooltip).toHaveText('放大');
    await page.getByRole('button', { name: '天气', exact: true }).hover();
    await expect(tooltip).toHaveText('查看或自定义天气');
  });
});

test('touch taps do not show desktop hints', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-chromium', 'Real touch emulation only');
  await page.goto('/?scenario=day');
  await expect.poll(() => page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  await page.locator('.view-tools-toggle').tap();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).tap();
  // A negative assertion must outlast the hover delay.
  await page.waitForTimeout(500);
  await expect(page.locator('.desktop-tooltip')).toHaveCount(0);
});

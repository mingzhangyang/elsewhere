import { expect, test } from '@playwright/test';

test('keyboard location selection preserves the instant and returns focus', async ({ page }) => {
  await page.goto('/?scenario=night');
  await page.getByRole('button', { name: /Change location/ }).click();
  const search = page.getByRole('combobox', { name: 'Search for a location' });
  await search.press('ArrowUp');
  await search.press('Enter');
  await expect(page.getByRole('heading', { name: 'McMurdo Station', exact: true })).toBeVisible();
  await expect(page.getByLabel('LOCAL TIME', { exact: true })).toHaveValue('17:00');
  await expect(page.getByRole('button', { name: /Change location/ })).toBeFocused();
});
test('DST fold choice and returning to real time are explicit', async ({ page }) => {
  await page.goto('/?scenario=night');
  await page.getByLabel('DATE', { exact: true }).fill('2026-11-01');
  await page.getByLabel('LOCAL TIME', { exact: true }).fill('01:30');
  await expect(page.getByRole('alert')).toContainText('occurs twice');
  await page.getByRole('button', { name: /UTC-05:00/ }).click();
  await expect(page.getByRole('slider', { name: 'Time of day' })).toHaveAttribute(
    'aria-valuetext',
    '01:30 UTC-05:00',
  );
  await page.getByRole('button', { name: 'Now', exact: true }).click();
  await expect(page.getByText(/Following real time/)).toBeVisible();
});
test('unavailable source weather stays distinct from custom conditions', async ({ page }) => {
  await page.goto('/?scenario=unavailable');
  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  await expect(page.getByText(/unavailable-weather scenario/)).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Cloud cover' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Custom simulation', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Cloud cover' })).toBeVisible();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await expect(page.getByRole('button', { name: 'Custom simulation' })).toBeVisible();
});
test('small screens keep the inspector and time controls reachable', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/?scenario=night');
  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  for (const locator of [
    page.getByRole('button', { name: 'Close inspector' }),
    page.getByRole('button', { name: 'Now', exact: true }),
    page.getByRole('slider', { name: 'Time of day' }),
  ]) {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(
      box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 321 && box.y + box.height <= 569,
    ).toBeTruthy();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await info.attach('narrow-layout', { body: await page.screenshot(), contentType: 'image/png' });
});

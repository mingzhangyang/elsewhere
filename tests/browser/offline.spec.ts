import { expect, test } from '@playwright/test';

test('an installed production shell can reopen and explore offline', async ({ page, context }) => {
  await page.route('https://**', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'New York', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'New York', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Change location/ }).click();
  await page.getByRole('option', { name: /Sydney/ }).click();
  await expect(page.getByRole('heading', { name: 'Sydney', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sky summary' })).toContainText('Sun altitude');
});

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
  await expect(page.getByRole('img', { name: /^Sky view\./ })).toBeVisible();
  await page.getByRole('button', { name: /Change location/ }).click();
  await page.getByRole('option', { name: /Sydney/ }).click();
  await expect(page.getByRole('heading', { name: 'Sydney', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sky summary' })).toContainText('Sun altitude');
  await page.getByRole('button', { name: 'Share this sky', exact: true }).click();
  const sharedUrl = await page.getByRole('textbox', { name: 'Sky link' }).inputValue();
  await page.close();

  // A fresh document cannot rely on the original tab's loaded modules or renderer.
  const reopened = await context.newPage();
  const errors: string[] = [];
  reopened.on('pageerror', (error) => errors.push(error.message));
  await reopened.goto(sharedUrl);
  await expect(reopened.getByRole('heading', { name: 'Sydney', exact: true })).toBeVisible();
  await expect(reopened.getByRole('img', { name: /^Sky view\./ })).toBeVisible();
  await expect(reopened.getByRole('region', { name: 'Sky summary' })).toContainText('Sun altitude');
  await expect(reopened.getByRole('button', { name: 'Change date and time' })).toContainText('Paused');
  await expect(reopened.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

import { expect, test } from '@playwright/test';

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

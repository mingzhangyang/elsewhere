import { expect, test, type Locator } from '@playwright/test';

async function decoded(image: Locator) {
  return image.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(element, 0, 0, 32, 32);
    const pixels = ctx.getImageData(0, 0, 32, 32).data;
    return {
      width: element.naturalWidth,
      height: element.naturalHeight,
      alpha: pixels[3],
      colors: new Set(pixels.filter((_, index) => index % 4 === 0)).size,
    };
  });
}

test('Moon inspector opens a real portrait and exports all three PNG sizes', async ({ page }, info) => {
  test.skip(
    !['chromium', 'mobile-chromium'].includes(info.project.name),
    'Desktop and mobile Chromium evidence',
  );
  test.setTimeout(120000);
  await page.goto('/?scenario=moon');
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an object' }).fill('Moon');
  await page.getByRole('group', { name: 'Celestial objects' }).getByRole('button', { name: /Moon/ }).click();
  const shortcut = page.getByRole('button', { name: 'Open high-resolution Moon image' });
  await expect(shortcut.locator('canvas')).toBeVisible();
  await info.attach('moon-inspector.png', { body: await shortcut.screenshot(), contentType: 'image/png' });
  if (info.project.name === 'mobile-chromium') await shortcut.tap();
  else await shortcut.click();
  const dialog = page.getByRole('dialog', { name: 'Share this sky' });
  const image = dialog.getByRole('img', { name: /^Realistic Moon/ });
  await expect(image).toBeVisible({ timeout: 30000 });
  expect(await decoded(image)).toMatchObject({ width: 512, height: 512, alpha: 0 });
  const initial = await image.getAttribute('src');
  const orientation = dialog.getByLabel('Moon orientation');
  await orientation.focus();
  await expect(orientation).toBeFocused();
  await orientation.press('ArrowDown');
  await expect(orientation).toHaveValue('north-up');
  await dialog.getByLabel('Background').selectOption('light');
  await dialog.getByLabel('Earthshine').uncheck();
  await expect(image).toBeVisible();
  await expect(image).not.toHaveAttribute('src', initial!);
  expect(await decoded(image)).toMatchObject({ alpha: 255 });
  await dialog.getByLabel('Background').selectOption('transparent');
  for (const size of [1024, 2048, 4096]) {
    await dialog.getByLabel('PNG resolution').selectOption(String(size));
    await dialog.getByRole('button', { name: 'Prepare PNG' }).click();
    const save = dialog.getByRole('link', { name: 'Save image' });
    await expect(save).toBeVisible({ timeout: 30000 });
    await expect(save).toHaveAttribute('download', new RegExp('-' + size + '\\.png$'));
    expect(await decoded(image)).toMatchObject({ width: size, height: size, alpha: 0 });
  }
  await info.attach('moon-portrait.png', { body: await image.screenshot(), contentType: 'image/png' });
  for (const name of ['All-sky chart', 'Minimal sky map']) {
    await dialog.getByRole('button', { name, exact: true }).click();
    const chart = dialog.getByRole('img', { name: new RegExp('^' + name) });
    await expect(chart).toBeVisible();
    expect((await decoded(chart)).colors).toBeGreaterThan(5);
    await info.attach(name + '.png', { body: await chart.screenshot(), contentType: 'image/png' });
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(shortcut).toBeFocused();
});

test('an early share can retry both diagrams with the catalog restored', async ({ page }) => {
  let restored = false;
  await page.route(/\/stars(-[\w-]+)?\.json$/, (route) => (restored ? route.continue() : route.abort()));
  await page.goto('/?scenario=moon');
  await page.getByRole('button', { name: 'Share this sky', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Share this sky' });
  await dialog.getByRole('button', { name: 'All-sky chart', exact: true }).click();
  const retry = dialog.getByRole('button', { name: 'Retry image' });
  await expect(retry).toBeVisible();
  restored = true;
  await retry.click();
  await expect(dialog.getByRole('img', { name: /^All-sky chart/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Minimal sky map', exact: true }).click();
  await expect(dialog.getByRole('img', { name: /^Minimal sky map/ })).toBeVisible();
});

test('a failed Moon texture keeps the SVG inspector fallback', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Texture failure evidence');
  await page.route('**/moon-lroc.jpg', (route) => route.abort());
  await page.goto('/?scenario=moon');
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an object' }).fill('Moon');
  await page.getByRole('group', { name: 'Celestial objects' }).getByRole('button', { name: /Moon/ }).click();
  const shortcut = page.getByRole('button', { name: 'Open high-resolution Moon image' });
  await expect(shortcut.locator('svg')).toBeVisible();
  await shortcut.click();
  await expect(page.getByRole('button', { name: 'Retry image' })).toBeVisible();
});

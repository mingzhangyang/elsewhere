import { expect, test, type Locator } from '@playwright/test';

async function decoded(image: Locator) {
  return image.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(element, 0, 0, 256, 256);
    const pixels = ctx.getImageData(0, 0, 256, 256).data;
    const footerPaper = Array.from(pixels.slice((255 * 256 + 2) * 4, (255 * 256 + 3) * 4));
    // Sample inside the portrait, above the highest possible paper footer.
    const lunarTones = new Set<number>();
    for (let y = 48; y < 128; y++) {
      for (let x = 96; x < 160; x++) {
        const i = (y * 256 + x) * 4;
        if (pixels[i + 3] === 255) lunarTones.add(pixels[i]);
      }
    }
    let footerInk = 0;
    for (let i = 205 * 256 * 4; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 255 && pixels[i] < 150 && pixels[i + 1] < 150 && pixels[i + 2] < 150) footerInk++;
    }
    return {
      width: element.naturalWidth,
      height: element.naturalHeight,
      alpha: pixels[3],
      lunarTones: lunarTones.size,
      footerPaper,
      footerInk,
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
  const preview = await decoded(image);
  expect(preview).toMatchObject({ width: 512, height: 512, alpha: 0, footerPaper: [246, 241, 231, 255] });
  expect(preview.lunarTones).toBeGreaterThan(8);
  expect(preview.footerInk).toBeGreaterThan(30);
  const initial = await image.getAttribute('src');
  const orientation = dialog.getByLabel('Moon orientation');
  await orientation.focus();
  await expect(orientation).toBeFocused();
  await orientation.press('ArrowDown');
  await expect(orientation).toHaveValue('north-up');
  await dialog.getByLabel('Moon background').selectOption('light');
  await dialog.getByLabel('Earthshine').uncheck();
  await expect(image).toBeVisible();
  await expect(image).not.toHaveAttribute('src', initial!);
  const light = await decoded(image);
  expect(light.alpha).toBe(255);
  expect(light.lunarTones).toBeGreaterThan(8);
  await dialog.getByLabel('Moon background').selectOption('transparent');
  for (const size of [1024, 2048, 4096]) {
    await dialog.getByLabel('PNG resolution').selectOption(String(size));
    await dialog.getByRole('button', { name: 'Prepare PNG' }).click();
    const save = dialog.getByRole('link', { name: 'Save image' });
    await expect(save).toBeVisible({ timeout: 30000 });
    await expect(save).toHaveAttribute('download', new RegExp('-' + size + '\\.png$'));
    await expect(save).toHaveAttribute('href', (await image.getAttribute('src'))!);
    const card = await decoded(image);
    expect(card).toMatchObject({ width: size, height: size, alpha: 0, footerPaper: [246, 241, 231, 255] });
    expect(card.lunarTones).toBeGreaterThan(8);
    expect(card.footerInk).toBeGreaterThan(30);
  }
  await info.attach('moon-portrait.png', { body: await image.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(shortcut).toBeFocused();
});

for (const { locale, shareName, styleName, styles, moonAlt, closeName } of [
  {
    locale: 'en-US',
    shareName: 'Share this sky',
    styleName: 'Style',
    styles: ['Realistic', 'Illustrated', 'Moon'],
    moonAlt: /^Realistic Moon/,
    closeName: 'Close sharing',
  },
  {
    locale: 'zh-CN',
    shareName: '分享这片天空',
    styleName: '风格',
    styles: ['写实', '插画', '月相'],
    moonAlt: /^高清真实月相/,
    closeName: '关闭分享',
  },
]) {
  test.describe(`share image styles in ${locale}`, () => {
    test.use({ locale });

    test('offers three styles in one row and renders a localized Moon card', async ({ page }, info) => {
      test.setTimeout(60000);
      await page.goto('/?scenario=moon');
      await page.getByRole('button', { name: shareName, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: shareName });
      const choices = dialog.getByRole('group', { name: styleName, exact: true }).getByRole('button');
      await expect(choices).toHaveText(styles);
      await expect(choices.first()).toHaveAttribute('aria-pressed', 'true');
      const tops = await choices.evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().top));
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1);
      await choices.last().click();
      const image = dialog.getByRole('img', { name: moonAlt });
      await expect(image).toBeVisible({ timeout: 30000 });
      const card = await decoded(image);
      expect(card.footerPaper).toEqual([246, 241, 231, 255]);
      expect(card.lunarTones).toBeGreaterThan(8);
      expect(card.footerInk).toBeGreaterThan(30);
      await info.attach('moon-card-' + locale + '.png', {
        body: await image.screenshot(),
        contentType: 'image/png',
      });
      await dialog.getByRole('button', { name: closeName }).click();
      await expect(dialog).toBeHidden();

      if (locale === 'en-US') {
        await page.getByRole('link', { name: 'Make my sky' }).click();
        await expect(page).toHaveURL(/#create$/);
        await expect(page.getByRole('heading', { name: 'The sky remembers' })).toBeVisible();
      }
    });
  });
}

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

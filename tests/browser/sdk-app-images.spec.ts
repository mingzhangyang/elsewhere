import { expect, test, type Locator } from '@playwright/test';

async function decoded(image: Locator) {
  return image.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    const canvas = document.createElement('canvas');
    const width = 256;
    const height = 320;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(element, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const pixelAt = (x: number, y: number) =>
      Array.from(pixels.slice((y * width + x) * 4, (y * width + x + 1) * 4));
    const footerPaper = pixelAt(2, height - 1);
    const background = pixelAt(0, 0);
    // The left edge of the lunar panel is all background. Its first colour
    // change marks the paper boundary, even if downsampling blends one row.
    let footerStart = 0;
    while (footerStart < height && pixelAt(2, footerStart).every((value, i) => value === background[i])) {
      footerStart++;
    }
    const center = Math.floor(footerStart / 2);
    const lunarTones = new Set<number>();
    for (let y = center - 24; y < center + 24; y++) {
      for (let x = 96; x < 160; x++) {
        const i = (y * width + x) * 4;
        if (pixels[i + 3] === 255) lunarTones.add(pixels[i]);
      }
    }
    let footerInk = 0;
    for (let i = (footerStart + 1) * width * 4; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 255 && pixels[i] < 150 && pixels[i + 1] < 150 && pixels[i + 2] < 150) footerInk++;
    }
    let moonTop = 0;
    while (moonTop < footerStart && pixelAt(128, moonTop)[3] === 0) moonTop++;
    let moonBottom = footerStart - 1;
    while (moonBottom >= 0 && pixelAt(128, moonBottom)[3] === 0) moonBottom--;
    return {
      moonTopGap: moonTop,
      moonBottomGap: footerStart - 1 - moonBottom,
      moonSpan: moonBottom - moonTop + 1,
      background,
      skyBottom: pixelAt(128, Math.max(0, footerStart - 2)),
      width: element.naturalWidth,
      height: element.naturalHeight,
      alpha: pixels[3],
      lunarTones: lunarTones.size,
      footerPaper,
      footerInk,
    };
  });
}

function expectMoonMargins(card: Awaited<ReturnType<typeof decoded>>) {
  // At a 256px-wide preview require meaningful, balanced vertical clearance.
  expect(card.moonTopGap).toBeGreaterThanOrEqual(12);
  expect(card.moonBottomGap).toBeGreaterThanOrEqual(12);
  expect(Math.abs(card.moonTopGap - card.moonBottomGap)).toBeLessThanOrEqual(2);
  expect(card.moonSpan).toBeGreaterThan(100);
}

async function expectPortraitPreview(image: Locator) {
  const slot = image.locator('..');
  await expect
    .poll(async () => {
      const box = await slot.boundingBox();
      return box ? Math.abs(box.width - box.height * 0.8) : Infinity;
    })
    .toBeLessThan(2);
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
  expect(preview).toMatchObject({ width: 410, height: 512, alpha: 0, footerPaper: [246, 241, 231, 255] });
  expect(preview.lunarTones).toBeGreaterThan(8);
  expect(preview.footerInk).toBeGreaterThan(30);
  expectMoonMargins(preview);
  await expectPortraitPreview(image);
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
  expect(light.background).toEqual([245, 244, 240, 255]);
  expect(light.skyBottom).toEqual(light.background);
  const lightSrc = await image.getAttribute('src');
  await dialog.getByLabel('Moon background').selectOption('dark');
  await expect(image).not.toHaveAttribute('src', lightSrc!);
  const dark = await decoded(image);
  expect(dark.background).toEqual([12, 15, 22, 255]);
  expect(dark.skyBottom).toEqual(dark.background);
  await dialog.getByLabel('Moon background').selectOption('transparent');
  for (const [width, size] of [
    [819, 1024],
    [1638, 2048],
    [3277, 4096],
  ]) {
    await dialog.getByLabel('PNG resolution').selectOption(String(size));
    await expect(dialog.getByLabel('PNG resolution').locator('option:checked')).toHaveText(
      `${width} × ${size}`,
    );
    await dialog.getByRole('button', { name: 'Prepare PNG' }).click();
    const save = dialog.getByRole('link', { name: 'Save image' });
    await expect(save).toBeVisible({ timeout: 30000 });
    await expect(save).toHaveAttribute('download', new RegExp('-' + size + '\\.png$'));
    await expect(save).toHaveAttribute('href', (await image.getAttribute('src'))!);
    const card = await decoded(image);
    expect(card).toMatchObject({ width, height: size, alpha: 0, footerPaper: [246, 241, 231, 255] });
    expect(card.lunarTones).toBeGreaterThan(8);
    expect(card.footerInk).toBeGreaterThan(30);
    expectMoonMargins(card);
    await expectPortraitPreview(image);
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
      const tops = [];
      for (const button of await choices.all()) {
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        tops.push(box!.y);
      }
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1);
      await expect(dialog.locator('.moment-preview-slot')).toHaveCSS('aspect-ratio', '4 / 5');
      await choices.last().click();
      const image = dialog.getByRole('img', { name: moonAlt });
      await expect(image).toBeVisible({ timeout: 30000 });
      const card = await decoded(image);
      expect(card.footerPaper).toEqual([246, 241, 231, 255]);
      expect(card.lunarTones).toBeGreaterThan(8);
      expect(card.footerInk).toBeGreaterThan(30);
      expectMoonMargins(card);
      await expectPortraitPreview(image);
      await info.attach('moon-card-' + locale + '.png', {
        body: await image.screenshot(),
        contentType: 'image/png',
      });
      await choices.first().click();
      await expect(dialog.locator('.moment-preview-slot')).toHaveCSS('aspect-ratio', '4 / 5');
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

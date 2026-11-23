import { expect, test } from '@playwright/test';

/**
 * Real browser, real canvas and WebGL screenshot with fictional weather.
 * The full overcast sky is intentionally unsuitable for an attractive postcard.
 * The saved image gets a clear-only override; the explorer stays overcast.
 */
test('postcard defaults to clear weather in both styles without changing the explorer', async ({ page }, info) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    const labels: string[] = [];
    Object.defineProperty(window, '__postcardClearLabels', { value: labels });
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (
      this: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
      maxWidth?: number,
    ) {
      if (text.includes('Clear Sky')) labels.push(text);
      if (maxWidth === undefined) return original.call(this, text, x, y);
      return original.call(this, text, x, y, maxWidth);
    };
  });
  await page.goto('/?scenario=overcast');
  const source = page.locator('.source-pill');
  await expect(source).toBeVisible();
  const originalSource = await source.innerText();
  await page.getByRole('button', { name: 'Share this sky' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share this sky' });
  const originalLink = await dialog.getByRole('textbox', { name: 'Sky link' }).inputValue();
  await dialog.getByRole('button', { name: 'Make an image' }).click();
  const option = dialog.getByRole('checkbox', { name: /Clear Sky for image/ });
  await expect(option).toBeChecked();
  const image = dialog.getByRole('img', { name: /Keepsake image of the sky over/ });
  await expect(image).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => page.evaluate(() =>
    (window as unknown as { __postcardClearLabels: string[] }).__postcardClearLabels.length,
  )).toBeGreaterThan(0);
  const signature = async () => image.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 80;
    const context = canvas.getContext('2d')!;
    context.drawImage(element, 0, 0, element.naturalWidth, 650, 0, 0, 80, 80);
    const data = context.getImageData(0, 0, 80, 80).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
    return { sum, src: element.src };
  });
  const clear = await signature();
  await info.attach('postcard-clear-realistic-' + info.project.name + '.png', {
    body: await image.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });

  await option.uncheck();
  await expect.poll(async () => (await image.getAttribute('src'))).not.toBe(clear.src);
  const clouds = await signature();
  expect(clouds.sum).not.toBe(clear.sum);
  await info.attach('postcard-original-overcast-' + info.project.name + '.png', {
    body: await image.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await option.check();
  await dialog.getByRole('button', { name: 'Illustrated' }).click();
  await expect(image).toBeVisible();
  await expect(option).toBeChecked();
  await info.attach('postcard-clear-illustrated-' + info.project.name + '.png', {
    body: await image.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  expect(await source.innerText()).toBe(originalSource);
  expect(await dialog.getByRole('textbox', { name: 'Sky link' }).inputValue()).toBe(originalLink);
  await dialog.getByRole('button', { name: 'Close sharing' }).click();
  await expect(source).toBeVisible();
  expect(await source.innerText()).toBe(originalSource);
});


/**
 * Real, non-mocked watercolor postcard evidence with clear mode deliberately disabled.
 * Weather is synthetic and fictional; test images are not claims about historical weather.
 */
test('cloudy illustration stays a layered painting across overcast, wind, rain and sunset', async ({ page }, info) => {
  test.setTimeout(120000);
  for (const scenario of ['windy', 'overcast', 'sunset', 'rain']) {
    await page.goto('/?scenario=' + scenario);
    await page.getByRole('button', { name: 'Share this sky', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Share this sky' });
    await dialog.getByRole('button', { name: 'Make an image' }).click();
    const clearSky = dialog.getByRole('checkbox', { name: /Clear Sky for image/ });
    await expect(clearSky).toBeChecked();
    await clearSky.uncheck();
    await dialog.getByRole('button', { name: 'Illustrated', exact: true }).click();
    const image = dialog.getByRole('img', { name: /Keepsake image of the sky over/ });
    await expect(image).toBeVisible({ timeout: 30000 });
    const bitmap = await image.evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 80;
      const context = canvas.getContext('2d')!;
      context.drawImage(element, 0, 0, element.naturalWidth, 600, 0, 0, 120, 80);
      const pixels = context.getImageData(0, 0, 120, 80).data;
      const shades = new Set<string>();
      for (let i = 0; i < pixels.length; i += 4) {
        shades.add([pixels[i] >> 4, pixels[i + 1] >> 4, pixels[i + 2] >> 4].join(','));
      }
      return { width: element.naturalWidth, shades: shades.size };
    });
    expect(bitmap.width).toBe(1200);
    expect(bitmap.shades).toBeGreaterThan(18);
    if (info.project.name === 'chromium' || info.project.name === 'mobile-chromium') {
      await info.attach('watercolor-clouds-' + scenario + '-' + info.project.name + '.png', {
        body: await image.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      });
    }
    await dialog.getByRole('button', { name: 'Close sharing' }).click();
  }
});

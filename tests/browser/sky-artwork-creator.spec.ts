import { expect, test } from '@playwright/test';

/** SM3-C uses imaginary event details; presets provide coordinates, not a real person's history. */
async function selectCity(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: 'Choose a city' }).click();
  await page.getByRole('option', { name: new RegExp(name) }).click();
}

test('direct #create keeps explorer, weather, HYG and WebGL off the critical path', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const monitor = { webgl: 0, weather: 0 };
    Object.defineProperty(window, '__creatorMonitor', { value: monitor });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args) {
      if (args[0] === 'webgl' || args[0] === 'webgl2' || args[0] === 'experimental-webgl') {
        monitor.webgl += 1;
      }
      return Reflect.apply(original, this, args);
    } as typeof original;
    const originalFetch = window.fetch;
    window.fetch = function (this: Window, ...args) {
      if (String(args[0]).includes('open-meteo.com')) monitor.weather += 1;
      return Reflect.apply(originalFetch, this, args);
    } as typeof originalFetch;
  });
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  await page.goto('/#create');
  await expect(page.getByRole('heading', { name: 'The sky remembers' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create my star map' })).toBeEnabled();
  await page.waitForTimeout(400);
  const evidence = await page.evaluate(() => {
    const monitor = (window as unknown as { __creatorMonitor: { webgl: number; weather: number } })
      .__creatorMonitor;
    return {
      ...monitor,
      canvas: document.querySelectorAll('canvas').length,
      scene: document.querySelectorAll('.stage canvas, .app-shell').length,
      resources: performance.getEntriesByType('resource').map((resource) => resource.name),
    };
  });
  expect(evidence.webgl).toBe(0);
  expect(evidence.weather).toBe(0);
  expect(evidence.scene).toBe(0);
  // The dormant 2D preview canvas is intentional; it must not create a WebGL context.
  expect(evidence.canvas).toBe(1);
  expect(
    [...urls, ...evidence.resources].filter((url) => /open-meteo|three-|stars-[\w-]+\.json/.test(url)),
  ).toEqual([]);
  if (testInfo.project.name === 'chromium' || testInfo.project.name === 'mobile-chromium') {
    await testInfo.attach('sm3-c-form-' + testInfo.project.name + '.png', {
      body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
      contentType: 'image/png',
    });
  }
});

test('real HYG artwork, typography, PNG, same instant explorer and draft return', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await page.goto('/#create');
  await selectCity(page, 'New York');
  await page.getByLabel('Gregorian date').fill('2026-06-21');
  await page.getByLabel(/^Local time at the event/).fill('21:15');
  await page.getByRole('button', { name: 'Create my star map' }).click();
  await expect(page.getByText('Your image is ready to save, share or explore.')).toBeVisible({
    timeout: 45000,
  });
  const canvas = page.getByTestId('sky-chart-preview');
  await expect(canvas).toBeVisible();
  expect(
    await canvas.evaluate((element) => {
      const bitmap = element as HTMLCanvasElement;
      return [bitmap.width, bitmap.height, bitmap.getContext('2d')?.getImageData(600, 498, 1, 1).data[3]];
    }),
  ).toEqual([1200, 1500, 255]);
  await page.getByLabel(/^Title/).fill('A fictional Sunday ✨');
  await page.getByLabel(/^A note to remember/).fill('The stars remember a little imaginary miracle.');
  await expect(page.getByText('Your image is ready to save, share or explore.')).toBeVisible({
    timeout: 45000,
  });
  await testInfo.attach('sm3-c-midnight-English-' + testInfo.project.name + '.png', {
    body: await canvas.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await page.getByRole('radio', { name: /Rose paper/ }).check();
  await expect(page.getByText('Your image is ready to save, share or explore.')).toBeVisible({
    timeout: 45000,
  });
  await testInfo.attach('sm3-c-paper-English-' + testInfo.project.name + '.png', {
    body: await canvas.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  // The download adapter is triggered by a real click; mobile browsers may open a new image tab.
  await page.getByRole('button', { name: 'Save PNG' }).click();
  await expect(page.getByText(/PNG download requested|PNG was opened for saving/)).toBeVisible();
  await testInfo.attach('sm3-c-png-action-' + testInfo.project.name + '.png', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Explore this sky' }).click();
  await expect(page.getByRole('button', { name: 'Back to my star map' })).toBeVisible({
    timeout: 45000,
  });
  await testInfo.attach('sm3-c-explore-' + testInfo.project.name + '.png', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Back to my star map' }).click();
  await expect(page.getByLabel('Gregorian date')).toHaveValue('2026-06-21');
  await expect(page.getByLabel(/^Local time at the event/)).toHaveValue('21:15');
  await expect(page.getByRole('button', { name: 'Change location, New York' })).toBeVisible();
  await expect(page.getByLabel(/^Title/)).toHaveValue('A fictional Sunday ✨');
  await expect(page.getByLabel(/^A note to remember/)).toHaveValue(
    'The stars remember a little imaginary miracle.',
  );
  await expect(page.getByRole('radio', { name: /Rose paper/ })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Save PNG' })).toBeDisabled();
  await testInfo.attach('sm3-c-return-draft-' + testInfo.project.name + '.png', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
});

test('Chinese reference time and DST error retain their scientific meanings', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.goto('/#create');
  await page.getByRole('button', { name: 'Switch to Simplified Chinese' }).click();
  await expect(page.getByRole('heading', { name: '星光记得这一刻' })).toBeVisible();
  await page
    .getByRole('button', { name: '选择城市' })
    .first()
    .click()
    .catch(async () => {
      await page
        .getByRole('button', { name: /Choose a city|选择地点|选择城市/ })
        .first()
        .click();
    });
  await page.getByRole('option', { name: /New York|纽约/ }).click();
  await page.getByLabel('公历日期').fill('2026-06-21');
  await page.getByRole('radio', { name: '不知道具体时间' }).check();
  await expect(page.getByLabel(/^参考当地时间/)).toHaveValue('22:00');
  await page.getByLabel(/^参考当地时间/).fill('21:15');
  await page.getByLabel(/^标题/).fill('虚构的纪念夜晚 🌙');
  await page.getByLabel(/^纪念短句/).fill('愿这片星光，记得一个想象中的故事。');
  await page.getByRole('radio', { name: /玫瑰浅纸/ }).check();
  await page.getByRole('button', { name: '生成我的星图' }).click();
  await expect(page.getByText('星图已就绪，可保存、分享或进入互动天空。')).toBeVisible({
    timeout: 45000,
  });
  await expect(page.getByText(/参考时刻仅用于计算/)).toBeVisible();
  await testInfo.attach('sm3-c-paper-Chinese-' + testInfo.project.name + '.png', {
    body: await page.getByTestId('sky-chart-preview').screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await page.getByLabel('公历日期').fill('2026-03-08');
  await page.getByRole('radio', { name: '知道具体时间' }).check();
  await page.getByLabel(/^事件发生地的当地时间/).fill('02:30');
  await page.getByRole('button', { name: '生成我的星图' }).click();
  await expect(page.getByRole('alert')).toContainText('这个时间不存在');
  await expect(page.getByRole('button', { name: '保存 PNG' })).toBeDisabled();
  await testInfo.attach('sm3-c-error-' + testInfo.project.name + '.png', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
});

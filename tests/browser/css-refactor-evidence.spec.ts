import { execFileSync } from 'node:child_process';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Compare the same DOM and renderer state with the old global stylesheet, not two unrelated sky frames.
const baselineRef = process.env.CSS_BASELINE_REF;
const original = baselineRef
  ? execFileSync('git', ['show', baselineRef + ':src/styles.css'], { encoding: 'utf8' })
  : '';
const baseline = original.includes('@import') ? '' : original;
const entry = 'style[data-vite-dev-id$="/src/styles.css"]';

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const properties = [
      'display',
      'visibility',
      'position',
      'z-index',
      'overflow-x',
      'overflow-y',
      'pointer-events',
      'opacity',
      'color',
      'background-color',
      'background-image',
      'font-size',
      'font-weight',
      'line-height',
      'border-radius',
      'border-top',
      'border-right',
      'border-bottom',
      'border-left',
      'padding',
      'margin',
      'box-shadow',
      'text-shadow',
      'backdrop-filter',
      'grid-template-columns',
      'grid-template-rows',
      'flex-direction',
      'gap',
      'transform',
      'text-align',
    ];
    return Array.from(document.querySelectorAll('#root *'))
      .filter((element) => !element.closest('canvas, svg, .sky-target, .moment-preview-orbit'))
      .map((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: element.getAttribute('class'),
          box: [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 10) / 10),
          styles: properties.map((property) => style.getPropertyValue(property)),
        };
      });
  });
}

async function compare(page: Page, info: TestInfo, state: string) {
  const sheet = page.locator(entry);
  await expect(sheet).toHaveCount(1);
  const current = await sheet.textContent();
  expect(current).toBeTruthy();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await sheet.evaluate((element, css) => {
    element.textContent = css;
  }, baseline);
  try {
    const before = await snapshot(page);
    await info.attach(state + '-before.png', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
    await sheet.evaluate((element, css) => {
      element.textContent = css;
    }, current);
    const after = await snapshot(page);
    await info.attach(state + '-after.png', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
    expect(after, state + ' computed styles and geometry').toEqual(before);
  } finally {
    await sheet.evaluate((element, css) => {
      element.textContent = css;
    }, current);
  }
}

for (const { width, height, scenario, locale, state } of [
  { width: 320, height: 640, scenario: 'day', locale: 'en-US', state: 'time' },
  { width: 390, height: 844, scenario: 'night60', locale: 'en-US', state: 'tools' },
  { width: 430, height: 932, scenario: 'dusk', locale: 'zh-CN', state: 'location' },
  { width: 844, height: 390, scenario: 'day', locale: 'en-US', state: 'weather' },
  { width: 768, height: 1024, scenario: 'night', locale: 'en-US', state: 'layers' },
  { width: 1280, height: 800, scenario: 'night60', locale: 'en-US', state: 'share' },
  { width: 1920, height: 1080, scenario: 'dusk', locale: 'en-US', state: 'creator' },
]) {
  test.describe(`${width}x${height}`, () => {
    test.use({ viewport: { width, height }, locale, hasTouch: width <= 1000, reducedMotion: 'reduce' });

    test('CSS migration before/after evidence', async ({ page }, info) => {
      test.skip(info.project.name !== 'chromium' || !baseline, 'Requires Chromium and baseline CSS');
      test.setTimeout(90000);
      await page.goto('/?scenario=' + scenario);
      await expect(page.locator('.sky-scene canvas')).toBeVisible();
      const weatherSource = locale === 'zh-CN' ? '天气预报' : 'Forecast';
      await expect(page.locator('.source-pill')).toHaveText(weatherSource, { timeout: 15000 });
      await compare(page, info, 'sky');

      if (state === 'time') {
        await page.locator('.time-readout').click();
        await expect(page.locator('.time-editor')).toBeVisible();
      } else if (state === 'tools') {
        await page.locator('.view-tools-toggle').click();
        await expect(page.locator('.view-tools-actions')).toBeVisible();
      } else if (state === 'location') {
        await page.locator('.location-trigger').click();
        await expect(page.locator('.place-dialog')).toBeVisible();
      } else if (state === 'weather' || state === 'layers') {
        await page
          .locator('.explore-toolbar button')
          .nth(state === 'weather' ? 1 : 2)
          .click();
        await expect(page.locator('.inspector')).toBeVisible();
      } else if (state === 'share') {
        await page.locator('.header-actions button').click();
        await expect(page.locator('.share-dialog .moment-preview')).toBeVisible({ timeout: 45000 });
      } else if (state === 'creator') {
        await page.goto('/#create');
        await expect(page.locator('.creator-shell')).toBeVisible();
      }
      await compare(page, info, state);
    });
  });
}

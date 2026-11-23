import { expect, test, type Page } from '@playwright/test';

// Real WebGL fixtures fix the observation time, New York, weather and wind.
// A dev scenario sets initialTime, so #sky share-link camera overrides are ignored.
const skyUrl = (scenario: string) => `/?scenario=${scenario}`;

// A real Objects-panel action, not an ignored URL hash, places Vega in the phone view.
async function centerVega(page: Page) {
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an object' }).fill('Vega');
  const list = page.getByRole('group', { name: 'Celestial objects' });
  await expect(list).toContainText('Vega');
  await list.getByRole('button', { name: /Vega/ }).click();
  await page.getByRole('button', { name: 'Center in view' }).click();
  const sky = page.getByRole('img', { name: /^Sky view\./ });
  const marker = page.locator('.sky-target');
  await expect(marker).toBeVisible();
  await expect
    .poll(async () => {
      const [view, target] = await Promise.all([sky.boundingBox(), marker.boundingBox()]);
      if (!view || !target) return Number.POSITIVE_INFINITY;
      return Math.max(
        Math.abs(target.x + target.width / 2 - (view.x + view.width / 2)),
        Math.abs(target.y + target.height / 2 - (view.y + view.height / 2)),
      );
    })
    .toBeLessThan(4);
  // The camera remains centered after the marker/card are dismissed. This leaves
  // only the actual WebGL name texture to affect the comparison region.
  await page.getByRole('button', { name: 'Clear object selection' }).click();
  await expect(marker).toBeHidden();
}

// Crop to the centered star's name, rather than unrelated UI or cloud pixels.
async function centeredLabelRegion(page: Page) {
  const view = await page.getByRole('img', { name: /^Sky view\./ }).boundingBox();
  if (!view) throw new Error('Sky canvas is unavailable');
  const x = view.x + view.width / 2;
  const y = view.y + view.height / 2;
  return page.screenshot({
    clip: { x: Math.round(x - 110), y: Math.round(y - 80), width: 220, height: 150 },
    animations: 'disabled',
  });
}

async function disableObjectLabels(page: Page) {
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const toggle = page.getByRole('button', { name: 'Object labels', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

for (const { name, scenario, width, height } of [
  { name: 'clear-desktop', scenario: 'night', width: 1280, height: 800 },
  { name: 'cloud30-desktop', scenario: 'night30', width: 1280, height: 800 },
  { name: 'cloud60-desktop', scenario: 'night60', width: 1280, height: 800 },
  { name: 'cloud85-desktop', scenario: 'night85', width: 1280, height: 800 },
  { name: 'cloud100-desktop', scenario: 'overcast', width: 1280, height: 800 },
  { name: 'dusk-desktop', scenario: 'dusk', width: 1280, height: 800 },
  { name: 'day-desktop', scenario: 'day', width: 1280, height: 800 },
  { name: 'cloud60-phone', scenario: 'night60', width: 390, height: 844 },
]) {
  test(`real WebGL cloud-label evidence: ${name}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'One fixed browser makes image pairs comparable');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height });
    await page.goto(skyUrl(scenario));
    const sky = page.getByRole('img', { name: /^Sky view\./ });
    await expect(sky).toBeVisible();
    expect(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'))).toBe(true);
    if (name === 'cloud60-phone') {
      await centerVega(page);
    } else {
      // The catalog and fonts must be ready before photographing the sky.
      await page.getByRole('button', { name: 'Objects', exact: true }).click();
      await page.getByRole('searchbox', { name: 'Find an object' }).fill('Vega');
      await expect(page.getByRole('group', { name: 'Celestial objects' })).toContainText('Vega');
      await page.getByRole('button', { name: 'Close inspector' }).click();
    }
    await sky.screenshot({
      path: `test-results/cloud-label-visuals/post-${name}.png`,
      animations: 'disabled',
    });
    if (name === 'cloud60-phone') {
      const labelsOn = await centeredLabelRegion(page);
      await disableObjectLabels(page);
      expect(
        labelsOn.equals(await centeredLabelRegion(page)),
        'Vega must contribute label pixels in the actual portrait WebGL view',
      ).toBe(false);
    }
  });
}

for (const { scenario, expectedLabelPixels } of [
  { scenario: 'night85', expectedLabelPixels: true },
  { scenario: 'overcast', expectedLabelPixels: false },
]) {
  test(`real renderer label policy at ${scenario} cover`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Requires real Chromium WebGL');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(skyUrl(scenario));
    await centerVega(page);
    const labelsOn = await centeredLabelRegion(page);
    await disableObjectLabels(page);
    const labelsOff = await centeredLabelRegion(page);
    // This samples the production createSkyRenderer.update() path, unlike a duplicated
    // condition in a unit-test helper. 85% must draw names; 100% must suppress them.
    expect(
      labelsOn.equals(labelsOff),
      `${scenario} should ${expectedLabelPixels ? 'show' : 'suppress'} name pixels`,
    ).toBe(!expectedLabelPixels);
  });
}

test.describe('Chinese cloud-label evidence', () => {
  test.use({ locale: 'zh-CN' });

  test('Chinese celestial names stay readable with partial clouds', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'One fixed browser makes image pairs comparable');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(skyUrl('night60'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
    const sky = page.getByRole('img', { name: /^天空视图。/ });
    await expect(sky).toBeVisible();
    await page.getByRole('button', { name: '天体', exact: true }).click();
    await page.getByRole('searchbox', { name: '查找天体' }).fill('织女');
    await expect(page.getByRole('group', { name: '天体列表' })).toContainText('织女星');
    await page.getByRole('button', { name: '关闭面板' }).click();
    await sky.screenshot({
      path: 'test-results/cloud-label-visuals/post-cloud60-chinese.png',
      animations: 'disabled',
    });
  });
});

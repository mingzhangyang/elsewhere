import { expect, test } from '@playwright/test';

// These are real WebGL screenshots. The scenario fixes NYC, UTC, weather and wind;
// reduced motion freezes the cloud shader's uTime at zero on every visit.
const NEW_YORK = {
  id: 'new-york',
  name: 'New York',
  country: 'United States',
  latitude: 40.7128,
  longitude: -74.006,
  elevation: 10,
  timezone: 'America/New_York',
};
const skyUrl = (scenario: string, instant = '2026-11-13T04:00:00.000Z') =>
  '/?scenario=' +
  scenario +
  '#sky=' +
  encodeURIComponent(
    JSON.stringify({
      version: 1,
      location: NEW_YORK,
      instant,
      camera: { heading: 100, altitude: 40, fov: 66 },
      layers: { stars: true, lines: true, labels: true },
      custom: null,
    }),
  );

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
    const instant =
      scenario === 'dusk'
        ? '2026-11-12T22:08:00.000Z'
        : scenario === 'day'
          ? '2026-11-12T17:00:00.000Z'
          : undefined;
    await page.goto(skyUrl(scenario, instant));
    const sky = page.getByRole('img', { name: /^Sky view\./ });
    await expect(sky).toBeVisible();
    expect(
      await page.evaluate(() => !!document.createElement('canvas').getContext('webgl')),
    ).toBe(true);
    // Verify the star catalog and names are ready before capturing the canvas.
    await page.getByRole('button', { name: 'Objects', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Find an object' }).fill('Vega');
    await expect(page.getByRole('group', { name: 'Celestial objects' })).toContainText('Vega');
    await page.getByRole('button', { name: 'Close inspector' }).click();
    await sky.screenshot({
      path: `test-results/cloud-label-visuals/post-${name}.png`,
      animations: 'disabled',
    });
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

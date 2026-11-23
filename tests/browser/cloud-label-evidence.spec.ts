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
const skyUrl = (scenario: string) =>
  '/?scenario=' +
  scenario +
  '#sky=' +
  encodeURIComponent(
    JSON.stringify({
      version: 1,
      location: NEW_YORK,
      instant: '2026-11-13T04:00:00.000Z',
      camera: { heading: 100, altitude: 40, fov: 66 },
      layers: { stars: true, lines: true, labels: true },
      custom: null,
    }),
  );

for (const { name, scenario, width, height } of [
  { name: 'cloud60-desktop', scenario: 'night60', width: 1280, height: 800 },
  { name: 'cloud85-desktop', scenario: 'night85', width: 1280, height: 800 },
  { name: 'cloud60-phone', scenario: 'night60', width: 390, height: 844 },
]) {
  test(`real WebGL cloud-label evidence: ${name}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'One fixed browser makes image pairs comparable');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height });
    await page.goto(skyUrl(scenario));
    const sky = page.getByRole('img', { name: /^Sky view\./ });
    await expect(sky).toBeVisible();
    // Verify the star catalog and names are ready before capturing the canvas.
    await page.getByRole('button', { name: 'Objects', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Find an object' }).fill('Vega');
    await expect(page.getByRole('group', { name: 'Celestial objects' })).toContainText('Vega');
    await page.getByRole('button', { name: 'Close inspector' }).click();
    await sky.screenshot({
      path: `test-results/cloud-label-visuals/pre-${name}.png`,
      animations: 'disabled',
    });
  });
}

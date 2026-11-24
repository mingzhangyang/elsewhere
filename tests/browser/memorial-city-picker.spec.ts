import { expect, test } from '@playwright/test';

test('memorial city prompt remains visible across the mobile breakpoint', async ({ page }) => {
  // SM1-B is not routed yet. Exercise the real styles with the two LocationPicker render states.
  await page.setContent(`
    <!doctype html>
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body>
        <section class="memorial-time-form">
          <div class="memorial-city">
            <button class="location-trigger" aria-label="Choose a city">
              <svg width="18" height="18" aria-hidden="true"></svg>
              <span class="location-change">Choose a city</span>
              <svg width="16" height="16" aria-hidden="true"></svg>
            </button>
            <button class="location-trigger" aria-label="Change location, New York">
              <svg width="18" height="18" aria-hidden="true"></svg>
              <span class="location-current">
                <strong>New York</strong>
                <small>United States</small>
              </span>
              <span class="location-change">Change place</span>
              <svg width="16" height="16" aria-hidden="true"></svg>
            </button>
          </div>
        </section>
      </body>
    </html>
  `);
  // Resolve the global entry's imports through Vite before injecting CSS into the isolated document.
  const response = await page.request.get('/src/styles.css?direct');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('text/css');
  const css = await response.text();
  expect(css).not.toMatch(/^\s*@import\b/m);
  await page.addStyleTag({ content: css });
  await page.addStyleTag({ path: 'src/components/memorialTimeForm.css' });

  const empty = page.getByRole('button', { name: 'Choose a city' });
  const selected = page.getByRole('button', { name: 'Change location, New York' });
  for (const width of [320, 390, 680, 681]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(empty.locator('.location-change')).toBeVisible();
    await expect(empty.locator('.location-change')).toBeInViewport();
    await expect(selected.locator('.location-current strong')).toBeVisible();
    if (width <= 680) {
      await expect(selected.locator('.location-change')).toBeHidden();
    } else {
      await expect(selected.locator('.location-change')).toBeVisible();
    }
  }
});

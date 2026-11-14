import { expect, test } from '@playwright/test';

// Canvas-dependent cases below fail confusingly without WebGL; this names the cause directly.
test('the 3D sky starts', async ({ page }) => {
  await page.goto('/?scenario=night');
  // Report the browser's own WebGL failure reason (e.g. missing GL drivers) rather than only a missing canvas.
  const webgl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    let reason = '';
    canvas.addEventListener(
      'webglcontextcreationerror',
      (event) => (reason = (event as WebGLContextEvent).statusMessage),
    );
    return canvas.getContext('webgl2') || canvas.getContext('webgl') ? 'available' : reason || 'unavailable';
  });
  expect(webgl, 'WebGL context').toBe('available');
  await expect(page.getByRole('img', { name: /^Sky view\./ })).toBeVisible();
  await expect(page.getByText('The 3D sky could not start', { exact: false })).toHaveCount(0);
});

test('clicking centered Mizar selects Mizar instead of Alcor', async ({ page }) => {
  await page.goto('/?scenario=night');
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an object' }).fill('Mizar');
  await page.getByRole('group', { name: 'Celestial objects' }).getByRole('button', { name: /Mizar/ }).click();
  await page.getByRole('button', { name: 'Center in view' }).click();
  const canvas = page.getByRole('img', { name: /^Sky view\./ });
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('heading', { name: 'Mizar', exact: true })).toBeVisible();
});

test('keyboard location selection preserves the instant and returns focus', async ({ page }) => {
  await page.goto('/?scenario=night');
  await page.getByRole('button', { name: /Change location/ }).click();
  const search = page.getByRole('combobox', { name: 'Search for a location' });
  await search.press('ArrowUp');
  await search.press('Enter');
  await expect(page.getByRole('heading', { name: 'McMurdo Station', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Change location/ })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Change date and time' })).toContainText('17:00');
});
test('DST fold choice and returning to real time are explicit', async ({ page }) => {
  await page.goto('/?scenario=night');
  await page.getByRole('button', { name: 'Change date and time' }).click();
  await page.getByLabel('Date', { exact: true }).fill('2026-11-01');
  await page.getByLabel('Local time', { exact: true }).fill('01:30');
  await expect(page.getByRole('alert').filter({ hasText: 'occurs twice' })).toBeVisible();
  await page.getByRole('button', { name: /UTC-05:00/ }).click();
  await expect(page.getByRole('slider', { name: 'Time of day' })).toHaveAttribute(
    'aria-valuetext',
    '01:30 UTC-05:00',
  );
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Now', exact: true }).click();
  await expect(page.getByText(/Following real time/)).toBeVisible();
});
test('unavailable source weather stays distinct from custom conditions', async ({ page }) => {
  await page.goto('/?scenario=unavailable');
  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  await expect(page.getByText(/unavailable-weather scenario/)).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Cloud cover' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Custom simulation', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Cloud cover' })).toBeVisible();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await expect(page.getByRole('button', { name: 'Custom simulation' })).toBeVisible();
});
test('small screens keep the inspector and time controls reachable', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/?scenario=night');
  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  for (const locator of [
    page.getByRole('button', { name: 'Close inspector' }),
    page.getByRole('button', { name: 'Now', exact: true }),
    page.getByRole('slider', { name: 'Time of day' }),
  ]) {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(
      box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 321 && box.y + box.height <= 569,
    ).toBeTruthy();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await info.attach('narrow-layout', { body: await page.screenshot(), contentType: 'image/png' });
});

test('object discovery finds the Moon below the horizon and jumps to its next rise', async ({ page }) => {
  await page.goto('/?scenario=night');
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an object' }).fill('Moon');
  await page.getByRole('group', { name: 'Celestial objects' }).getByRole('button', { name: /Moon/ }).click();
  await expect(page.getByText('Below the horizon', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Jump to next rise' }).click();
  await expect(page.getByRole('region', { name: 'Selected object' })).toContainText('Moon');
  await expect(page.locator('.sky-target')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Objects', exact: true })).toBeFocused();
});

test('finding the Moon ends on the Moon itself, circled rather than covered', async ({ page }) => {
  await page.goto('/?scenario=moon');
  await page.getByRole('button', { name: 'Find the Moon' }).click();
  await page.getByRole('button', { name: 'Center in view' }).click();
  await expect(page.getByRole('region', { name: 'Selected object' })).toContainText('Moon');
  const ring = page.locator('.sky-target');
  const width = async () => (await ring.boundingBox())?.width ?? 0;
  // Framed, the disc is about a quarter of the view tall and the ring circles it.
  await expect.poll(width).toBeGreaterThan(100);
  // Zoomed back out, the Moon is small again and the ring returns to its marker size.
  for (let step = 0; step < 12; step++) await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(width).toBeLessThan(40);
});

test('pausing between playback ticks leaves the sky at the displayed instant', async ({ page }) => {
  await page.goto('/?scenario=night');
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an object' }).fill('Vega');
  await page.getByRole('group', { name: 'Celestial objects' }).getByRole('button', { name: /Vega/ }).click();
  await page.getByRole('button', { name: 'Center in view' }).click();
  // At a 2° field, the up to 0.5° the sky turns between 600× ticks is a quarter of the view.
  for (let step = 0; step < 15; step++) await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('combobox', { name: 'Playback speed' }).selectOption('600');
  const canvas = page.getByRole('img', { name: /^Sky view\./ });
  const ring = page.locator('.sky-target');
  for (const wait of [530, 610, 690]) {
    await page.getByRole('button', { name: 'Play time' }).click();
    await page.waitForTimeout(wait);
    await page.getByRole('button', { name: 'Pause time' }).click();
    // Recentering uses the displayed instant; the drawn sky must agree with it.
    await page.getByRole('button', { name: 'Recenter' }).click();
    await page.waitForTimeout(100);
    const view = (await canvas.boundingBox())!;
    const marker = (await ring.boundingBox())!;
    expect(Math.abs(marker.x + marker.width / 2 - (view.x + view.width / 2))).toBeLessThan(3);
    expect(Math.abs(marker.y + marker.height / 2 - (view.y + view.height / 2))).toBeLessThan(3);
  }
});

test('clear-sky preview preserves custom clouds and keeps selection feedback', async ({ page }) => {
  await page.goto('/?scenario=day');
  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  await page.getByRole('button', { name: 'Custom simulation', exact: true }).click();
  await page.getByRole('slider', { name: 'Cloud cover', exact: true }).press('End');
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Find the Moon' }).click();
  await page.getByRole('button', { name: 'Center in view' }).click();
  const summary = page.getByRole('region', { name: 'Selected object' });
  await expect(summary).toContainText('100% cloud cover');
  await expect(page.locator('.sky-target')).toBeVisible();
  await page.getByRole('button', { name: 'Preview a clear sky' }).click();
  await expect(summary).toContainText('A pale daytime Moon');
  await page.getByRole('button', { name: 'Restore atmosphere', exact: true }).click();
  await expect(summary).toContainText('100% cloud cover');
  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Cloud cover', exact: true })).toHaveValue('100');
});

test.describe('phones', () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox does not emulate mobile viewports');

  test('panels open as a lower sheet that leaves the sky visible', async ({ page }) => {
    await page.goto('/?scenario=unavailable');
    await page.getByRole('button', { name: 'Weather', exact: true }).click();
    await page.getByRole('button', { name: 'Custom simulation', exact: true }).click();
    // Sliders scroll inside the sheet; once reached, the sky above must still be in view.
    const slider = page.getByRole('slider', { name: 'Cloud cover' });
    await slider.scrollIntoViewIfNeeded();
    await expect(slider).toBeInViewport();
    const stage = (await page.getByRole('main', { name: 'Sky exploration' }).boundingBox())!;
    const sheet = (await page.getByRole('region', { name: 'weather inspector' }).boundingBox())!;
    expect(sheet.y - stage.y).toBeGreaterThanOrEqual(stage.height * 0.3);
    await expect(page.locator('.sky-context')).toBeHidden();
  });

  test('form fields are large enough that iOS does not zoom on focus', async ({ page }) => {
    await page.goto('/?scenario=night');
    await page.getByRole('button', { name: 'Change date and time' }).click();
    const sizes = await page
      .locator('input:not([type=range]):not([type=checkbox]), select, textarea')
      .evaluateAll((fields) => fields.map((field) => parseFloat(getComputedStyle(field).fontSize)));
    expect(sizes.length).toBeGreaterThan(2);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
    await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content', /viewport-fit=cover/);
  });

  test('closing a panel returns focus to the source pill hidden while it was open', async ({ page }) => {
    await page.goto('/?scenario=unavailable');
    const pill = page.locator('.source-pill');
    for (const close of ['Escape', 'Close inspector']) {
      await pill.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('region', { name: 'weather inspector' })).toBeVisible();
      await expect(pill).toBeHidden();
      if (close === 'Escape') await page.keyboard.press('Escape');
      else await page.getByRole('button', { name: close }).click();
      await expect(pill).toBeFocused();
    }
  });

  // `sky` is the minimum sky left beside (landscape) or above (portrait) the sheet; 0 where the stage is
  // too short and the sheet takes it over. 320×380 stands in for a keyboard-resized layout viewport.
  for (const { width, height, sky } of [
    { width: 667, height: 375, sky: 100 },
    { width: 320, height: 568, sky: 100 },
    { width: 320, height: 430, sky: 0 },
    { width: 320, height: 380, sky: 0 },
  ]) {
    test(`panels stay usable at ${width}×${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/?scenario=unavailable');
      await page.getByRole('button', { name: 'Weather', exact: true }).click();
      await page.getByRole('button', { name: 'Custom simulation', exact: true }).click();
      const sheet = (await page.getByRole('region', { name: 'weather inspector' }).boundingBox())!;
      expect(sheet.height).toBeGreaterThanOrEqual(170);
      await expect(page.getByRole('button', { name: 'Close inspector' })).toBeInViewport();
      const slider = page.getByRole('slider', { name: 'Cloud cover' });
      await slider.scrollIntoViewIfNeeded();
      await expect(slider).toBeInViewport();
      const stage = (await page.getByRole('main', { name: 'Sky exploration' }).boundingBox())!;
      expect(sheet.y + sheet.height).toBeLessThanOrEqual(stage.y + stage.height);
      const skyVisible = width > height ? sheet.x - stage.x : sheet.y - stage.y;
      expect(skyVisible).toBeGreaterThanOrEqual(sky);
    });
  }
});

test.describe('safe areas', () => {
  test.use({ hasTouch: true, isMobile: true });
  test.skip(({ browserName }) => browserName !== 'chromium', 'Safe-area emulation uses Chromium DevTools');

  const layout = async (
    page: import('@playwright/test').Page,
    viewport: { width: number; height: number },
    insets: { top: number; bottom: number; left: number; right: number },
  ) => {
    await page.setViewportSize(viewport);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
    await page.goto('/?scenario=night');
    // The app renders after its modules load; measuring straight after navigation can find no shell.
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('.bottom-dock')).toBeVisible();
    return page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const footerText = [...document.querySelectorAll('.bottom-bar > *')]
        .map((node) => node.getBoundingClientRect())
        .filter((r) => r.height > 0);
      return {
        topbar: rect('.topbar'),
        dock: rect('.bottom-dock'),
        dockPadding: parseFloat(getComputedStyle(document.querySelector('.bottom-dock')!).paddingBottom),
        footerText,
      };
    });
  };

  test('portrait home-indicator inset sits below the footer text, not inside the dock', async ({ page }) => {
    const { dock, dockPadding, footerText } = await layout(
      page,
      { width: 390, height: 664 },
      { top: 47, bottom: 34, left: 0, right: 0 },
    );
    expect(footerText.length).toBeGreaterThan(0);
    for (const text of footerText) {
      expect(text.top).toBeGreaterThanOrEqual(dock.bottom);
      expect(text.bottom).toBeLessThanOrEqual(664 - 34);
    }
    expect(dockPadding).toBeLessThan(34);
  });

  test('landscape keeps content out of the notch and pads the dock for the indicator', async ({ page }) => {
    const { topbar, dock, dockPadding } = await layout(
      page,
      { width: 667, height: 375 },
      { top: 0, bottom: 21, left: 47, right: 47 },
    );
    for (const box of [topbar, dock]) {
      expect(box.left).toBeGreaterThanOrEqual(47);
      expect(box.right).toBeLessThanOrEqual(667 - 47);
    }
    expect(dockPadding).toBeGreaterThanOrEqual(21);
  });
});

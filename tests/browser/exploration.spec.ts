import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

const axeScript = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
// The star catalog data request: /src/data/stars.json in development, a hashed assets/stars-*.json
// in production. No query string: in development `stars.json?url` is a module the app itself needs.
const CATALOG = /\/stars(-[\w-]+)?\.json$/;

// The mobile dock reveals zoom/reset on demand; desktop keeps them directly available.
async function setViewTools(page: Page, open: boolean) {
  const name = open ? 'Show view tools' : 'Hide view tools';
  const toggle = page.getByRole('button', { name, exact: true });
  if (await toggle.isVisible()) await toggle.click();
}

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

test.describe('portrait Moon touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('a finger tap near the small wide-view Moon selects the Moon', async ({ page }) => {
    await page.goto('/?scenario=moon');
    await page.getByRole('button', { name: 'Find the Moon' }).click();
    await page.getByRole('button', { name: 'Center in view' }).click();
    // Zoom back out to the smallest lunar disc while preserving its centered direction.
    await setViewTools(page, true);
    for (let step = 0; step < 20; step++) await page.getByRole('button', { name: 'Zoom out' }).click();
    await setViewTools(page, false);
    const ring = page.locator('.sky-target');
    await expect(ring).toBeVisible();
    const box = (await ring.boundingBox())!;
    // Twelve pixels right of the Moon center is outside its ~4px visible radius.
    await page.touchscreen.tap(box.x + box.width / 2 + 12, box.y + box.height / 2);
    const inspector = page.getByRole('region', { name: 'objects inspector' });
    await expect(inspector.getByRole('heading', { name: 'Moon', exact: true })).toBeVisible();
  });
});

// "What is that bright point?": tapping it names the planet, for an evening Venus and a midnight Jupiter.
for (const { scenario, planet } of [
  { scenario: 'venus', planet: 'Venus' },
  { scenario: 'jupiter', planet: 'Jupiter' },
]) {
  test(`tapping the bright point of ${planet} names it`, async ({ page }) => {
    await page.goto(`/?scenario=${scenario}`);
    await page.getByRole('button', { name: 'Objects', exact: true }).click();
    // Above the horizon, planets are listed right after the Sun and Moon, before any star.
    const list = page.getByRole('group', { name: 'Celestial objects' });
    await expect(
      list
        .getByRole('button')
        .filter({ hasNotText: /^(Sun|Moon)/ })
        .first(),
    ).toContainText(planet);
    await list.getByRole('button', { name: new RegExp(planet) }).click();
    await expect(page.getByText('Above the horizon', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Center in view' }).click();
    const canvas = page.getByRole('img', { name: /^Sky view\./ });
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByRole('heading', { name: planet, exact: true })).toBeVisible();
    await expect(page.getByText('Planet', { exact: true })).toBeVisible();
  });
}

test('a shared link opens centered on the planet it was focused on', async ({ page, browser }) => {
  await page.goto('/?scenario=jupiter');
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an object' }).fill('Jupiter');
  await page
    .getByRole('group', { name: 'Celestial objects' })
    .getByRole('button', { name: /Jupiter/ })
    .click();
  await page.getByRole('button', { name: 'Center in view' }).click();
  await page.getByRole('button', { name: 'Share this sky', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Share this sky' })).toContainText('centered on Jupiter');
  const link = await page.getByRole('textbox', { name: 'Sky link' }).inputValue();
  const reopened = await browser.newPage();
  await reopened.goto(link);
  await expect(reopened.getByRole('region', { name: 'Selected object' })).toContainText('Jupiter');
  await expect(reopened.locator('.sky-target')).toBeVisible();
  await reopened.close();
});

// Phase 3 prototype: a link with a subject opens turned away from it and turns to it.
const jupiterMoment = (subject?: string) =>
  '/#sky=' +
  encodeURIComponent(
    JSON.stringify({
      version: 1,
      location: {
        id: 'new-york',
        name: 'New York',
        country: 'United States',
        latitude: 40.7128,
        longitude: -74.006,
        elevation: 10,
        timezone: 'America/New_York',
      },
      instant: '2026-01-10T05:00:00.000Z',
      camera: { heading: 180, altitude: 40, fov: 50 },
      layers: { stars: true, lines: false, labels: true },
      custom: null,
      ...(subject ? { focus: subject, subject } : {}),
    }),
  );
const compass = (page: import('@playwright/test').Page) => page.getByRole('img', { name: /^Facing / });

test('a link with a subject turns to it on opening', async ({ page }) => {
  await page.goto(jupiterMoment('jupiter'));
  await expect(page.getByRole('img', { name: /^Sky view\./ })).toBeVisible();
  // It starts 70° to the left (heading 110°) and ends facing the link's view.
  await expect(compass(page)).not.toHaveAccessibleName(/180 degrees/);
  await expect(compass(page)).toHaveAccessibleName(/Facing S, 180 degrees/, { timeout: 8000 });
  await expect(page.getByRole('region', { name: 'Selected object' })).toContainText('Jupiter');
});

test('a visitor key press stops the shared-link turn at the current heading', async ({ page }) => {
  await page.goto(jupiterMoment('jupiter'));
  const sky = page.getByRole('img', { name: /^Sky view\./ });
  await expect(sky).toBeVisible();
  const beforeKey = await compass(page).getAttribute('aria-label');
  await sky.press('ArrowLeft');
  await expect(compass(page)).not.toHaveAttribute('aria-label', beforeKey!);
  const afterKey = await compass(page).getAttribute('aria-label');
  await page.waitForTimeout(3500);
  await expect(compass(page)).toHaveAttribute('aria-label', afterKey!);
});

test('zooming stops the shared-link turn without altering its heading', async ({ page }) => {
  await page.goto(jupiterMoment('jupiter'));
  await expect(page.getByRole('img', { name: /^Sky view\./ })).toBeVisible();
  await setViewTools(page, true);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await setViewTools(page, false);
  // Zoom changes field of view, not heading. The arrival may already be complete on a slow
  // runner, in which case 180° is correct; only a later automatic turn would be wrong.
  const afterZoom = await compass(page).getAttribute('aria-label');
  expect(afterZoom).toMatch(/^Facing /);
  await page.waitForTimeout(3500);
  await expect(compass(page)).toHaveAttribute('aria-label', afterZoom!);
});

test('older shared links without a subject open at their saved heading', async ({ page }) => {
  await page.goto(jupiterMoment());
  await expect(page.getByRole('img', { name: /^Sky view\./ })).toBeVisible();
  await expect(compass(page)).toHaveAccessibleName(/Facing S, 180 degrees/);
});

test('with reduced motion, a link with a subject opens on it without turning', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(jupiterMoment('jupiter'));
  await expect(page.getByRole('img', { name: /^Sky view\./ })).toBeVisible();
  await expect(compass(page)).toHaveAccessibleName(/Facing S, 180 degrees/);
});

test('the share dialog uses two desktop columns and stacks them on mobile', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?scenario=jupiter');
  await page.getByRole('button', { name: 'Share this sky', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Share this sky' });
  const linkPanel = dialog.locator('.share-link-panel');
  const imagePanel = dialog.locator('.share-image-panel');
  await expect(linkPanel.getByRole('textbox', { name: 'Sky link' })).toBeVisible();
  await expect(imagePanel.locator('.moment-preview-slot')).toBeVisible();
  await expect(linkPanel.locator('.moment-options')).toBeVisible();
  await expect(linkPanel.getByRole('checkbox', { name: /Clear Sky for image/ })).toBeChecked();
  await expect(imagePanel.locator('.moment-options')).toHaveCount(0);
  await expect(imagePanel.getByRole('img', { name: /Keepsake image of the sky/ })).toBeVisible();

  const desktopLeft = await linkPanel.boundingBox();
  const desktopRight = await imagePanel.boundingBox();
  expect(desktopLeft).not.toBeNull();
  expect(desktopRight).not.toBeNull();
  expect(desktopRight!.x).toBeGreaterThanOrEqual(desktopLeft!.x + desktopLeft!.width - 2);
  expect(desktopRight!.width).toBeGreaterThan(desktopLeft!.width);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLeft = await linkPanel.boundingBox();
  const mobileRight = await imagePanel.boundingBox();
  expect(mobileLeft).not.toBeNull();
  expect(mobileRight).not.toBeNull();
  expect(mobileLeft!.y).toBeGreaterThanOrEqual(mobileRight!.y + mobileRight!.height - 2);
  expect(mobileRight!.x).toBeCloseTo(mobileLeft!.x, 0);

  // Short mobile viewports scroll inside the dialog, using the slim dark-sky scrollbar.
  await page.setViewportSize({ width: 390, height: 480 });
  // Headless Firefox may compute 'none' for platform-hidden overlay scrollbars even though
  // the authored dialog rule specifies 'thin'. Scrollability is checked in every engine below.
  await expect(dialog).toHaveCSS('scrollbar-width', browserName === 'firefox' ? /^(thin|none)$/ : 'thin');
  expect(await dialog.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await dialog.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await dialog.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test('mobile redraw keeps image choices and scroll position stable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Hold PNG completion briefly so the intermediate state is observable in every browser.
  await page.addInitScript(() => {
    const encode = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      return encode.call(this, (blob) => window.setTimeout(() => callback(blob), 450), type, quality);
    };
  });
  await page.goto('/?scenario=jupiter');
  await page.getByRole('button', { name: 'Share this sky', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Share this sky' });
  const slot = dialog.locator('.moment-preview-slot');
  await expect(slot).toBeVisible();
  await expect(slot.locator('.moment-preview-orbit')).toBeVisible();
  const options = dialog.locator('.moment-options');
  const image = dialog.getByRole('img', { name: 'Keepsake image of the sky over New York' });
  const preview = slot.locator('.moment-preview');
  await expect(image).toBeVisible();
  await options.scrollIntoViewIfNeeded();
  const initial = await options.boundingBox();
  const slotBox = await slot.boundingBox();
  const scroll = await dialog.evaluate((el) => el.scrollTop);
  expect(initial).not.toBeNull();
  expect(slotBox).not.toBeNull();

  for (const label of ['Illustrated', 'Sea']) {
    const previous = await preview.getAttribute('src');
    await dialog.getByRole('button', { name: label, exact: true }).click();
    await expect(slot).toHaveAttribute('aria-busy', 'true');
    expect((await options.boundingBox())!.y).toBeCloseTo(initial!.y, 0);
    expect((await slot.boundingBox())!.height).toBeCloseTo(slotBox!.height, 0);
    expect(await dialog.evaluate((el) => el.scrollTop)).toBeCloseTo(scroll, 0);
    // The stale preview is still drawn but intentionally hidden from assistive technology.
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.getAttribute('src')).not.toBe(previous);
    await expect(slot).toHaveAttribute('aria-busy', 'false');
    await expect(image).toBeVisible();
    expect((await options.boundingBox())!.y).toBeCloseTo(initial!.y, 0);
    expect((await slot.boundingBox())!.height).toBeCloseTo(slotBox!.height, 0);
    expect(await dialog.evaluate((el) => el.scrollTop)).toBeCloseTo(scroll, 0);
  }
});

test('the share dialog draws a keepsake image in each style and horizon', async ({ page }) => {
  await page.goto('/?scenario=jupiter');
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page
    .getByRole('group', { name: 'Celestial objects' })
    .getByRole('button', { name: /Jupiter/ })
    .click();
  await page.getByRole('button', { name: 'Center in view' }).click();
  await page.getByRole('button', { name: 'Share this sky', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Share this sky' });
  await expect(dialog).toContainText('When opened, the view turns to Jupiter.');
  const link = await dialog.getByRole('textbox', { name: 'Sky link' }).inputValue();
  expect(link).toContain('#sky=2.');
  const tuple = JSON.parse(
    Buffer.from(new URL(link).hash.slice('#sky=2.'.length), 'base64url').toString('utf8'),
  ) as unknown[];
  expect(tuple[8]).toBe('jupiter');
  const image = dialog.getByRole('img', { name: 'Keepsake image of the sky over New York' });
  /** The image's size and the share of its sky area that is not plain black. */
  const inspect = () =>
    image.evaluate(async (img: HTMLImageElement) => {
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, 600).data;
      let lit = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 60) lit++;
      return {
        width: img.naturalWidth,
        height: img.naturalHeight,
        lit: lit / (data.length / 4),
        src: img.src,
      };
    });
  await expect(image).toBeVisible();
  const realistic = await inspect();
  expect(realistic.width).toBe(1200);
  expect(realistic.lit).toBeGreaterThan(0.001); // stars and labels, captured from the renderer
  await dialog.getByRole('button', { name: 'Illustrated', exact: true }).click();
  await expect.poll(async () => (await inspect()).src).not.toBe(realistic.src);
  const illustrated = await inspect();
  expect(illustrated.lit).toBeGreaterThan(0.5); // a painted sky
  let previous = illustrated.src;
  for (const horizon of ['Mountains', 'Sea', 'City']) {
    await dialog.getByRole('button', { name: horizon, exact: true }).click();
    await expect.poll(async () => (await inspect()).src).not.toBe(previous);
    previous = (await inspect()).src;
  }
  await expect(dialog.getByRole('link', { name: 'Save image' })).toHaveAttribute(
    'download',
    'elsewhere-sky-2026-01-10.png',
  );
});

const NEW_YORK = {
  id: 'new-york',
  name: 'New York',
  country: 'United States',
  latitude: 40.7128,
  longitude: -74.006,
  elevation: 10,
  timezone: 'America/New_York',
};
/** A shared-link URL for New York at `instant`, centered on `focus` once Recenter is pressed. */
const skyLink = (instant: string, focus: string, fov: number) =>
  '/#sky=' +
  encodeURIComponent(
    JSON.stringify({
      version: 1,
      location: NEW_YORK,
      instant,
      camera: { heading: 180, altitude: 60, fov },
      layers: { stars: true, lines: false, labels: false },
      custom: null,
      clearSky: true,
      focus,
    }),
  );

// On January 19, 2026, Jupiter passes 0.46° from Wasat (δ Geminorum, magnitude 3.5). The view is
// zoomed so the two are about 10 px apart, inside each other's 20 px tap radius.
test('a star beside a planet stays selectable: the nearer point wins the tap', async ({ page }) => {
  await page.goto('/?scenario=night');
  const canvas = page.getByRole('img', { name: /^Sky view\./ });
  const height = (await canvas.boundingBox())!.height;
  // At the center of a perspective view, 1° spans (height / 2) / tan(fov / 2) · π / 180 pixels.
  const fov = (2 * Math.atan(((height / 2) * 0.46 * (Math.PI / 180)) / 10) * 180) / Math.PI;
  for (const [focus, name] of [
    ['hyg-35453', 'Wasat'],
    ['jupiter', 'Jupiter'],
  ]) {
    // A link differing only after '#' would not reload the app.
    await page.goto('about:blank');
    await page.goto(skyLink('2026-01-19T04:00:00.000Z', focus, fov));
    const card = page.getByRole('region', { name: 'Selected object' });
    await expect(card).toContainText(name);
    // The card can show before the 3D sky has loaded; recenter only once it has.
    await expect(canvas).toBeVisible();
    await card.getByRole('button', { name: 'Recenter' }).click();
    await expect(page.locator('.sky-target')).toBeVisible();
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
});

test('a link shared after panning away does not claim the planet is centered', async ({ page, browser }) => {
  await page.goto('/?scenario=jupiter');
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an object' }).fill('Jupiter');
  await page
    .getByRole('group', { name: 'Celestial objects' })
    .getByRole('button', { name: /Jupiter/ })
    .click();
  await page.getByRole('button', { name: 'Center in view' }).click();
  const canvas = page.getByRole('img', { name: /^Sky view\./ });
  await canvas.focus();
  for (let step = 0; step < 4; step++) await page.keyboard.press('Shift+ArrowLeft');
  await page.getByRole('button', { name: 'Share this sky', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Share this sky' });
  await expect(dialog).toContainText('camera view, layers');
  await expect(dialog).not.toContainText('centered on');
  const link = await page.getByRole('textbox', { name: 'Sky link' }).inputValue();
  expect(link).toContain('#sky=2.');
  const reopened = await browser.newPage();
  await reopened.goto(link);
  await expect(reopened.getByRole('img', { name: /^Sky view\./ })).toBeVisible();
  await expect(reopened.getByRole('region', { name: 'Selected object' })).toHaveCount(0);
  await reopened.close();
});

test('the first screen does not wait for the star catalog', async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(CATALOG, async (route) => {
    await held;
    await route.continue();
  });
  // Firefox and WebKit hold the load event for in-flight dynamic imports, so wait only for the
  // document; the point is that the app is usable while the catalog request is still pending.
  await page.goto('/?scenario=night', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('img', { name: /^Sky view\./ })).toBeVisible();
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await expect(page.getByText('Stars are still loading…')).toBeVisible();
  release();
  await expect(page.getByText('Stars are still loading…')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Find an object' }).fill('Vega');
  await expect(page.getByRole('group', { name: 'Celestial objects' })).toContainText('Vega');
});

test('a failed star catalog download can be retried once the connection returns', async ({ page }) => {
  let offline = true;
  await page.route(CATALOG, (route) => (offline ? route.abort('internetdisconnected') : route.continue()));
  await page.goto('/?scenario=night', { waitUntil: 'domcontentloaded' });
  const notice = page.getByRole('status').filter({ hasText: 'The star catalog could not load' });
  await expect(notice).toBeVisible();
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  offline = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('searchbox', { name: 'Find an object' }).fill('Vega');
  await expect(page.getByRole('group', { name: 'Celestial objects' })).toContainText('Vega');
  // The failure notice is withdrawn once the stars are in.
  await expect(notice).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Close inspector' }).click();
  for (const locator of [
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
  await setViewTools(page, true);
  for (let step = 0; step < 12; step++) await page.getByRole('button', { name: 'Zoom out' }).click();
  await setViewTools(page, false);
  await expect.poll(width).toBeLessThan(40);
});

test('pausing between playback ticks leaves the sky at the displayed instant', async ({ page }) => {
  await page.goto('/?scenario=night');
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find an object' }).fill('Capella');
  await page
    .getByRole('group', { name: 'Celestial objects' })
    .getByRole('button', { name: /Capella/ })
    .click();
  // Capella remains above New York's horizon throughout the accelerated playback.
  await page.getByRole('button', { name: 'Center in view' }).click();
  // At a 2° field, the up to 0.5° the sky turns between 600× ticks is a quarter of the view.
  await setViewTools(page, true);
  for (let step = 0; step < 15; step++) await page.getByRole('button', { name: 'Zoom in' }).click();
  await setViewTools(page, false);
  await page.getByRole('combobox', { name: 'Playback speed' }).selectOption('600');
  const canvas = page.getByRole('img', { name: /^Sky view\./ });
  const ring = page.locator('.sky-target');
  for (const wait of [530, 610, 690]) {
    await page.getByRole('button', { name: 'Play time' }).click();
    await page.waitForTimeout(wait);
    await page.getByRole('button', { name: 'Pause time' }).click();
    // Recentering uses the displayed instant; the drawn sky must agree with it.
    await page.getByRole('button', { name: 'Recenter' }).click();
    // The marker can be temporarily hidden between renderer and playback updates. Wait for the
    // settled view rather than dereferencing a null bounding box during the next animation frame.
    await expect(ring).toBeVisible();
    await expect
      .poll(async () => {
        const [view, marker] = await Promise.all([canvas.boundingBox(), ring.boundingBox()]);
        if (!view || !marker) return Number.POSITIVE_INFINITY;
        return Math.max(
          Math.abs(marker.x + marker.width / 2 - (view.x + view.width / 2)),
          Math.abs(marker.y + marker.height / 2 - (view.y + view.height / 2)),
        );
      })
      .toBeLessThan(3);
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

  // The drawer stays at the viewport bottom in both orientations.
  // 320×380 stands in for a keyboard-resized layout viewport.
  for (const { width, height, sky } of [
    { width: 667, height: 375, sky: 50 },
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
      expect(sheet.y + sheet.height).toBeCloseTo(height, 0);
      expect(sheet.x).toBe(0);
      expect(sheet.width).toBe(width);
      const skyVisible = sheet.y - stage.y;
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

// axe measures text on solid backgrounds; text over the live sky (gradients) it reports as needing
// review, which docs/VALIDATION.md covers with a worst-case pixel measurement.
for (const scenario of ['night', 'day'])
  test(`no colour-contrast violations over the ${scenario} sky`, async ({ page }) => {
    await page.goto(`/?scenario=${scenario}`);
    await expect(page.getByRole('img', { name: /^Sky view\./ })).toBeVisible();
    await page.addScriptTag({ path: axeScript });
    const violations = await page.evaluate(async () => {
      const axe = (
        window as unknown as {
          axe: {
            run: (c: Document, o: object) => Promise<{ violations: { nodes: { target: string[] }[] }[] }>;
          };
        }
      ).axe;
      const result = await axe.run(document, { runOnly: ['color-contrast'] });
      return result.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')));
    });
    expect(violations).toEqual([]);
  });

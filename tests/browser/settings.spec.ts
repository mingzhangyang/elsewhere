import { expect, test } from '@playwright/test';

test('the wide-view Moon size aid is named, reversible and saved on a portrait phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?scenario=moon');
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const toggle = page.getByRole('button', { name: 'Enlarge Moon in wide views' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#moon-display-aid-note')).toContainText('physical screen size');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enlarge Moon in wide views' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: 'Enlarge Moon in wide views' }).click();
  await expect(page.getByRole('button', { name: 'Enlarge Moon in wide views' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

for (const width of [320, 390, 1280]) {
  test(`settings selectors have separate rows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?scenario=night');
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    const panel = page.getByRole('region', { name: 'settings inspector' });
    const rows = panel.locator('.quality-setting');
    await expect(rows).toHaveCount(4);
    const boxes = await rows.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        const select = element.querySelector('select')!.getBoundingClientRect();
        return {
          top: box.top,
          bottom: box.bottom,
          left: box.left,
          right: box.right,
          selectLeft: select.left,
          selectRight: select.right,
        };
      }),
    );
    for (let i = 0; i < boxes.length; i++) {
      expect(boxes[i].selectLeft).toBeGreaterThanOrEqual(boxes[i].left);
      expect(boxes[i].selectRight).toBeLessThanOrEqual(boxes[i].right);
      if (i) expect(boxes[i].top).toBeGreaterThan(boxes[i - 1].bottom);
    }
  });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 667, height: 375 },
]) {
  test(`mobile menus are bottom drawers at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?scenario=night');
    for (const [name, region] of [
      ['Objects', 'objects inspector'],
      ['Weather', 'weather inspector'],
      ['Layers', 'settings inspector'],
    ]) {
      const trigger = page.getByRole('button', { name, exact: true });
      await trigger.click();
      const drawer = page.getByRole('region', { name: region });
      await expect(drawer).toBeVisible();
      await expect
        .poll(async () => {
          const box = (await drawer.boundingBox())!;
          return Math.round(box.y + box.height);
        })
        .toBe(viewport.height);
      const box = (await drawer.boundingBox())!;
      expect(box.x).toBe(0);
      expect(box.width).toBe(viewport.width);
      expect(box.y).toBeGreaterThan(56);
      await expect(page.getByRole('button', { name: 'Close inspector' })).toBeInViewport();
      if (name === 'Layers') {
        const language = drawer.getByRole('combobox', { name: 'Interface language' });
        await language.scrollIntoViewIfNeeded();
        await expect(language).toBeInViewport();
        await expect(page.getByRole('button', { name: 'Close inspector' })).toBeInViewport();
      }
      await page.getByRole('button', { name: 'Close inspector' }).click();
      await expect(drawer).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  });
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
]) {
  for (const name of ['Layers', 'Weather']) {
    test(`drawer contains keyboard focus and blocks covered controls: ${name} ${viewport.width}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/?scenario=night');
      const trigger = page.getByRole('button', { name, exact: true });
      await trigger.click();
      const drawer = page.locator('.inspector');
      const close = page.getByRole('button', { name: 'Close inspector' });
      const stops = drawer.locator(
        'button:enabled, a[href], input:enabled, select:enabled, textarea:enabled',
      );
      const last = stops.last();
      await close.focus();
      await page.keyboard.press('Shift+Tab');
      await expect(last).toBeFocused();
      await expect(last).toBeInViewport();
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await expect(close).toBeInViewport();
      await close.click({ trial: true });
      // Go through every stop; focused controls must be onscreen and win pointer hit testing.
      for (let i = 0; i < (await stops.count()); i++) {
        await page.keyboard.press('Tab');
        await expect
          .poll(() =>
            page.evaluate(() => {
              const active = document.activeElement as HTMLElement;
              const box = active.getBoundingClientRect();
              const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
              return !!active.closest('.inspector') && (hit === active || active.contains(hit));
            }),
          )
          .toBe(true);
      }
      const now = page.locator('.bottom-dock button').filter({ hasText: /^Now$/ });
      const slider = page.locator('.bottom-dock input[type="range"]');
      for (const covered of [now, slider]) {
        expect(await covered.evaluate((element) => !!element.closest('[inert]'))).toBe(true);
        await covered.evaluate((element) => (element as HTMLElement).focus());
        await expect(covered).not.toBeFocused();
        const box = (await covered.boundingBox())!;
        expect(
          await covered.evaluate(
            (element, point) => {
              const hit = document.elementFromPoint(point.x, point.y);
              return hit === element || element.contains(hit);
            },
            { x: box.x + box.width / 2, y: box.y + box.height / 2 },
          ),
        ).toBe(false);
      }
      await close.focus();
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await now.click({ trial: true });
      await slider.click({ trial: true });
      expect(await page.locator('[inert]').count()).toBe(0);
    });
  }
}

test('resizing an open drawer restores desktop background interaction', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?scenario=night');
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await expect(page.locator('.bottom-dock')).toHaveAttribute('inert', '');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.bottom-dock')).not.toHaveAttribute('inert');
  await page.getByRole('button', { name: 'Now', exact: true }).click({ trial: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.bottom-dock')).toHaveAttribute('inert', '');
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await expect(page.locator('[inert]')).toHaveCount(0);
});

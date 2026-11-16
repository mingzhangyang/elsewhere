import { expect, test } from '@playwright/test';

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

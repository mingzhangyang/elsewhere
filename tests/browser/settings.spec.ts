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

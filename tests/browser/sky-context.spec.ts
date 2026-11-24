import { expect, test } from '@playwright/test';

// Text has its own subtle shadow and the weather control has a contained dark surface.
// The title region must not paint a large dark gradient over the daylight sky.
for (const { label, width, height } of [
  { label: 'desktop', width: 1280, height: 800 },
  { label: 'phone', width: 390, height: 844 },
]) {
  test(`sky context has no oversized dark halo on ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?scenario=day');
    const context = page.locator('.sky-context');
    await expect(context).toBeVisible();
    const pill = context.locator('.source-pill');
    await expect(pill).toBeVisible();

    const appearance = await context.evaluate((element) => {
      const selector = matchMedia('(max-width: 680px)').matches ? '.context-actions' : '.source-pill';
      return {
        halo: getComputedStyle(element, '::before').backgroundImage,
        textShadow: getComputedStyle(element).textShadow,
        actionBackground: getComputedStyle(element.querySelector(selector)!).backgroundColor,
      };
    });
    expect(appearance.halo).toBe('none');
    expect(appearance.textShadow).not.toBe('none');
    expect(appearance.actionBackground).not.toBe('rgba(0, 0, 0, 0)');

    await pill.click();
    await expect(page.getByRole('region', { name: 'weather inspector' })).toBeVisible();
  });
}

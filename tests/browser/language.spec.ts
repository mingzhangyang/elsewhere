import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { interfaceText, latinWords } from '../fixtures/latin';

/**
 * Language is a test dimension of its own, added deliberately rather than by running every case
 * twice (ROADMAP principle 6). The rest of the suite stays in English. Here, in Chinese: a scan for
 * leftover English through the primary flows at desktop size and 390 × 844, with screenshots; the
 * contrast and axe checks over a night and a day sky; and switching language, which must also
 * redraw the sky's label textures and leave shared links language-free. These run on each desktop
 * browser; the mobile project skips them because the phone size is covered here.
 */
const axeScript = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const SKY = /^天空视图。/;

const leftoverEnglish = async (page: Page) =>
  (await page.locator('body').evaluate(interfaceText)).flatMap((text) => latinWords(text));

async function runAxe(page: Page, options: object) {
  await page.addScriptTag({ path: axeScript });
  return page.evaluate(async (options) => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            c: Document,
            o: object,
          ) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }>;
        };
      }
    ).axe;
    const result = await axe.run(document, options);
    return result.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
  }, options);
}

test.describe('in Chinese', () => {
  test.use({ locale: 'zh-CN' });

  for (const { name, viewport } of [
    { name: 'desktop', viewport: { width: 1280, height: 800 } },
    { name: 'phone', viewport: { width: 390, height: 844 } },
  ])
    test(`no English remains in the primary flows (${name})`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      const steps: string[] = [];
      const check = async (step: string) => {
        steps.push(step);
        expect(await leftoverEnglish(page), step).toEqual([]);
        await info.attach(`${name}-${steps.length}-${step}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      };
      await page.goto('/?scenario=night');
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
      await expect(page.getByRole('img', { name: SKY })).toBeVisible();
      await check('sky');
      await page.getByRole('button', { name: '天体', exact: true }).click();
      await check('objects');
      const list = page.getByRole('group', { name: '天体列表' });
      await list.getByRole('button', { name: /土星/ }).click();
      await page.getByText('关于此天体与坐标').click();
      await check('planet');
      await page.getByRole('button', { name: '全部天体' }).click();
      await page.getByRole('searchbox', { name: '查找天体' }).fill('织女');
      await list.getByRole('button', { name: /织女星/ }).click();
      await page.getByRole('button', { name: '在视图中居中' }).click();
      await expect(page.getByRole('region', { name: '已选天体' })).toContainText('织女星');
      await check('focused-star');
      await page.getByRole('button', { name: '天气', exact: true }).click();
      await page.getByRole('button', { name: '自定义模拟', exact: true }).click();
      await check('weather');
      await page.getByRole('button', { name: '图层', exact: true }).click();
      await check('settings');
      await page.getByRole('button', { name: '关闭面板' }).click();
      await page.getByRole('button', { name: '更改日期和时间' }).click();
      await check('time');
      await page.getByRole('button', { name: '关闭时间编辑器' }).click();
      await page.getByRole('button', { name: /更改地点/ }).click();
      await check('places');
      await page.getByRole('button', { name: '关闭地点选择' }).click();
      await page.getByRole('button', { name: '分享这片天空', exact: true }).click();
      await check('share');
    });

  for (const scenario of ['night', 'day'])
    test(`no colour-contrast violations over the ${scenario} sky`, async ({ page }) => {
      await page.goto(`/?scenario=${scenario}`);
      await expect(page.getByRole('img', { name: SKY })).toBeVisible();
      expect(await runAxe(page, { runOnly: ['color-contrast'] })).toEqual([]);
    });
});

// The full WCAG A/AA rule set in each language, with the Objects panel open over the sky.
for (const { locale, sky, objects } of [
  { locale: 'en-US', sky: /^Sky view\./, objects: 'Objects' },
  { locale: 'zh-CN', sky: SKY, objects: '天体' },
])
  test.describe(`axe in ${locale}`, () => {
    test.use({ locale });
    test('no WCAG A or AA violations', async ({ page }) => {
      await page.goto('/?scenario=night');
      await expect(page.getByRole('img', { name: sky })).toBeVisible();
      await page.getByRole('button', { name: objects, exact: true }).click();
      expect(await runAxe(page, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).toEqual([]);
    });
  });

test('switching to Chinese redraws the sky and is remembered; shared links carry no language', async ({
  page,
  browser,
}) => {
  await page.goto('/?scenario=jupiter');
  await expect(page.getByRole('img', { name: /^Sky view\./ })).toBeVisible();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('combobox', { name: 'Interface language' }).selectOption('zh-Hans');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  // The canvas's name comes from the renderer, which redraws its label textures with it.
  await expect(page.getByRole('img', { name: SKY })).toBeVisible();
  await page.getByRole('button', { name: '天体', exact: true }).click();
  await page.getByRole('group', { name: '天体列表' }).getByRole('button', { name: /木星/ }).click();
  await page.getByRole('button', { name: '在视图中居中' }).click();
  await expect(page.locator('.sky-target')).toContainText('木星 · 位置');
  await page.getByRole('button', { name: '分享这片天空', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '分享这片天空' })).toContainText('以木星为中心的视角');
  const link = await page.getByRole('textbox', { name: '星空链接' }).inputValue();
  expect(decodeURIComponent(link)).not.toMatch(/language|zh/);
  await page.reload();
  await expect(page.getByRole('img', { name: SKY })).toBeVisible();

  // The recipient reads the link in their own language.
  const context = await browser.newContext({ locale: 'en-US' });
  const reopened = await context.newPage();
  await reopened.goto(link);
  await expect(reopened.locator('html')).toHaveAttribute('lang', 'en');
  await expect(reopened.getByRole('region', { name: 'Selected object' })).toContainText('Jupiter');
  await context.close();
});

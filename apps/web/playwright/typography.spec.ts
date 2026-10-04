import { expect, test, type Page } from '@playwright/test';
import { buildCard, buildStarterOptions } from '../tests/fixtures/cards';

async function installTypographyFixture(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let json: object = { requestId: 'typography-fixture' };
    if (pathname.endsWith('/auth/me')) {
      json = {
        ...json,
        id: '00000000-0000-4000-8000-000000000980',
        connectionStrategy: 'auth0',
        lifecycleStatus: 'active',
        playerName: 'typography-player',
        playerNameSetupRequired: false,
        role: 'player',
      };
    } else if (pathname.endsWith('/cards/collection')) {
      json = { ...json, cards: [buildCard(1)] };
    } else if (pathname.endsWith('/cards/starter-options')) {
      json = { ...json, options: buildStarterOptions() };
    } else if (pathname.endsWith('/events')) {
      json = { ...json, events: [] };
    } else if (pathname.endsWith('/developer/keys')) {
      json = { ...json, activeKeyLimit: 3, keys: [] };
    } else {
      await route.fulfill({ status: 404 });
      return;
    }
    await route.fulfill({ json });
  });
}

async function chooseAccountSetting(page: Page, label: string, option: string) {
  await page.getByRole('button', { name: new RegExp(label) }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function fontsReady(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

async function platformFonts(page: Page, selector: string) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector,
  });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  await cdp.detach();
  return fonts.filter((font) => font.glyphCount > 0);
}

test('loads the Source faces and applies reading and plain-font roles inside portals', async ({
  page,
}) => {
  await installTypographyFixture(page);
  await page.goto('/collection');
  await page
    .getByRole('button', { name: /View Campus Guardian 1 details/ })
    .click();
  const title = page.locator('.trade-card-detail__header h2');
  await expect(title).toHaveText('Campus Guardian 1');
  await fontsReady(page);
  expect(await platformFonts(page, '.trade-card-detail__header h2')).toEqual([
    expect.objectContaining({
      familyName: expect.stringMatching(/^Source Serif 4(?: Variable)?$/),
      isCustomFont: true,
    }),
  ]);
  expect(await platformFonts(page, '.trade-card-detail__stats dd')).toEqual([
    expect.objectContaining({
      familyName: expect.stringMatching(
        /^(?:Source Sans 3(?: Variable)?|SourceSans3VF)$/,
      ),
      isCustomFont: true,
    }),
  ]);
  const defaultLeading = await page
    .locator('.trade-card-detail__summary > p')
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).lineHeight));
  await page.keyboard.press('Escape');
  await page.goto('/account');
  await chooseAccountSetting(page, 'Font', 'Plain sans-serif');
  await chooseAccountSetting(page, 'Reading layout', 'Comfortable');
  await page.goto('/collection');
  await page
    .getByRole('button', { name: /View Campus Guardian 1 details/ })
    .click();
  await fontsReady(page);
  expect(await platformFonts(page, '.trade-card-detail__header h2')).toEqual([
    expect.objectContaining({
      familyName: expect.stringMatching(
        /^(?:Source Sans 3(?: Variable)?|SourceSans3VF)$/,
      ),
      isCustomFont: true,
    }),
  ]);
  await expect(page.locator('#root .trade-card-detail')).toHaveCount(0);
  const comfortableLeading = await page
    .locator('.trade-card-detail__summary > p')
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).lineHeight));
  expect(comfortableLeading).toBeGreaterThan(defaultLeading);
});

test('enlarges navigation text and reflows card inspection without clipping copy', async ({
  page,
}) => {
  await installTypographyFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/account');
  const sizes: number[] = [];
  for (const scale of ['100', '125', '150']) {
    await chooseAccountSetting(page, 'Interface size', `${scale}%`);
    sizes.push(
      await page
        .locator('.primary-navigation--mobile .primary-navigation__label')
        .first()
        .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    );
  }
  expect(sizes).toEqual([12, 15, 18]);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/collection');
    await page
      .getByRole('button', { name: /View Campus Guardian 1 details/ })
      .click();
    await page
      .locator('.trade-card-detail')
      .evaluate((element) =>
        Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        ),
      );
    const body = page.locator('.trade-card-detail__body');
    const dimensions = await body.evaluate((el) => ({
      client: el.clientWidth,
      scroll: el.scrollWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    if (width <= 390) {
      const artwork = await page
        .locator('.trade-card-detail__artwork')
        .boundingBox();
      const summary = await page
        .locator('.trade-card-detail__summary')
        .boundingBox();
      expect(summary!.y).toBeGreaterThanOrEqual(artwork!.y + artwork!.height);
    }
    await page.locator('.trade-card-detail__rules').scrollIntoViewIfNeeded();
    await expect(page.locator('.trade-card-detail__rules')).toBeInViewport();
    await expect(
      page.getByRole('button', { name: 'Close Campus Guardian 1 details' }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`${width}-150-card-inspection.png`),
    });
    await page.keyboard.press('Escape');
  }
});

test('notification typography follows the global size and reading preferences', async ({
  page,
}) => {
  await installTypographyFixture(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/account');
  await chooseAccountSetting(page, 'Interface size', '150%');
  await chooseAccountSetting(page, 'Reading layout', 'Comfortable');
  await page.evaluate(async () => {
    const moduleUrl = '/src/components/AppToaster.tsx';
    const { confirmAction } = await import(/* @vite-ignore */ moduleUrl);
    confirmAction('Typography confirmation with enough text to wrap.');
  });
  const title = page.locator('.app-toast [data-title]');
  await expect(title).toHaveText(
    'Typography confirmation with enough text to wrap.',
  );
  await expect(title).toHaveCSS('font-size', '21px');
  await expect(title).toHaveCSS('line-height', '31.5px');
  await fontsReady(page);
  expect(await platformFonts(page, '.app-toast [data-title]')).toEqual([
    expect.objectContaining({
      familyName: expect.stringMatching(
        /^(?:Source Sans 3(?: Variable)?|SourceSans3VF)$/,
      ),
      isCustomFont: true,
    }),
  ]);
  const dimensions = await title.evaluate((el) => ({
    client: el.clientWidth,
    scroll: el.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  await expect(
    page.getByRole('button', { name: 'Dismiss confirmation' }),
  ).toBeInViewport({ ratio: 1 });
});

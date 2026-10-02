import { selectOption } from './select-option';
import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
  type CDPSession,
} from '@playwright/test';

import {
  buildCard,
  buildStarterOptions,
  buildUuid,
} from '../tests/fixtures/cards';
import { expectSquareArtwork } from './card-artwork-assertions';

const API_BASE_URL = 'http://127.0.0.1:3999/api/v1';

test('groups, filters, and reveals card details across collection layouts', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  const runtimeErrors: string[] = [];
  let collectionState: 'cards' | 'empty' | 'error' = 'cards';
  let releaseCollection: (() => void) | undefined;
  let collectionDelay: Promise<void> | undefined;
  // Use an existing raster asset as a layout fixture, not production card art.
  const cards = buildLargeCollection().map((card, index) => ({
    ...card,
    imageUrl:
      index === 0 || index === 2
        ? '/src/assets/home/great-hall-hero.png'
        : card.imageUrl,
  }));

  page.on('console', (message) => {
    // The fixture explicitly returns 404 for cards without an evolution.
    const expectedUnavailable =
      message.text().includes('404') &&
      message.location().url.includes('/cards/evolutions/');
    if (message.type() === 'error' && !expectedUnavailable) {
      consoleErrors.push(
        `${message.text()} @ ${message.location().url || 'unknown source'}`,
      );
    }
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await page.route(`${API_BASE_URL}/auth/me`, (route) =>
    json(route, {
      connectionStrategy: 'auth0',
      id: buildUuid(980),
      lifecycleStatus: 'active',
      playerName: 'collection_browser_player',
      playerNameSetupRequired: false,
      requestId: 'collection-browser-player',
      role: 'player',
    }),
  );
  await page.route(`${API_BASE_URL}/events`, (route) =>
    json(route, { events: [], requestId: 'collection-browser-events' }),
  );
  await page.route(`${API_BASE_URL}/cards/collection`, async (route) => {
    await collectionDelay;
    if (collectionState === 'error') {
      return json(route, { invalid: true });
    }
    return json(route, {
      cards: collectionState === 'cards' ? cards : [],
      requestId: 'collection-browser-cards',
    });
  });
  await page.route(`${API_BASE_URL}/cards/starter-options`, (route) =>
    json(route, {
      options: buildStarterOptions(),
      requestId: 'collection-browser-starters',
    }),
  );
  await page.route(`${API_BASE_URL}/cards/evolutions/*/preview`, (route) =>
    json(
      route,
      {
        code: 'EVOLUTION_NOT_AVAILABLE',
        detail: 'The selected card does not have an available evolution.',
        requestId: 'collection-browser-evolution-unavailable',
        status: 404,
        title: 'Evolution unavailable',
        type: 'about:blank',
      },
      404,
    ),
  );

  await page.setViewportSize({ height: 844, width: 320 });
  await page.goto('/collection');
  await expect(
    page.getByRole('heading', { name: 'Your cards', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Trades', exact: true }),
  ).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('collection-narrow-mobile.png'),
  });
  await page.setViewportSize({ height: 844, width: 390 });

  const gallery = page.getByRole('list', { name: 'Owned card designs' });
  await expect(gallery.locator(':scope > li')).toHaveCount(24);
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Trades', exact: true }),
  ).toBeInViewport();
  await expect(page.getByText('27 copies · 24 designs')).toBeVisible();
  await expect(page.getByText('×4')).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Campus Guardian 2 artwork unavailable' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(await columnsOnFirstRow(gallery)).toBe(2);
  await expect(page.getByLabel('Category', { exact: true })).toBeHidden();
  await expectSquareArtwork(gallery);
  const artworkImage = gallery.locator('img').first();
  await expect(artworkImage).toHaveCSS('object-fit', 'contain');
  await expect
    .poll(() =>
      artworkImage.evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: testInfo.outputPath('square-artwork-mobile.png'),
    fullPage: true,
  });

  const duplicateTrigger = page.getByRole('button', {
    name: 'View Campus Guardian 1 details, 4 owned copies',
  });
  await duplicateTrigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', {
    name: 'Campus Guardian 1',
  });
  await expect(dialog).toBeVisible();
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  await expectSquareArtwork(dialog);
  await page.screenshot({
    path: testInfo.outputPath('square-artwork-detail.png'),
  });
  await expect(
    dialog.getByRole('button', {
      name: 'Close Campus Guardian 1 details',
    }),
  ).toBeFocused();
  await expect(dialog).toHaveAttribute('data-rarity', 'rare');
  await expect(dialog.getByText('Copy history')).toHaveCount(0);
  await expect(
    dialog.getByRole('button', {
      name: 'Close Campus Guardian 1 details',
    }),
  ).toBeVisible();
  await dialog.getByText('Knowledge Surge').scrollIntoViewIfNeeded();
  await expect(dialog.locator('.trade-card-detail__body')).toHaveCSS(
    'overflow-y',
    'auto',
  );
  await page.screenshot({ path: testInfo.outputPath('moves-mobile.png') });
  const mobilePanel = await dialog.boundingBox();
  expect(mobilePanel).not.toBeNull();
  expect(Math.round(mobilePanel!.y + mobilePanel!.height)).toBe(844);

  const body = dialog.locator('.trade-card-detail__body');
  await expect(body).toHaveCSS('scrollbar-width', 'none');
  const handle = dialog.getByRole('button', { name: 'Close card sheet' });
  await handle.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(duplicateTrigger).toBeFocused();
  await duplicateTrigger.click();
  await handle.click();
  await expect(dialog).toBeHidden();
  await duplicateTrigger.click();

  // Trusted touch events exercise native scrolling and the sheet handoff.
  await page.setViewportSize({ height: 700, width: 390 });
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  const openPanel = (await dialog.boundingBox())!;
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await body.evaluate((element) => {
    element.scrollTop = 0;
  });
  const bodyBox = (await body.boundingBox())!;
  await swipe(touch, 320, bodyBox.y + 160, bodyBox.y + 30);
  await expect
    .poll(() => body.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect((await dialog.boundingBox())!.height).toBe(openPanel.height);
  await swipe(touch, 320, bodyBox.y + 30, bodyBox.y + 70);
  expect((await dialog.boundingBox())!.height).toBe(openPanel.height);

  await body.evaluate((element) => {
    element.scrollTop = 0;
  });
  // A short pull returns fully open, with no intermediate resting position.
  await swipe(touch, 320, bodyBox.y + 40, bodyBox.y + 120, 65);
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  await expect(dialog).toBeVisible();
  expect((await dialog.boundingBox())!.y).toBe(openPanel.y);
  expect((await dialog.boundingBox())!.height).toBe(openPanel.height);
  await expect(dialog).not.toHaveAttribute('data-card-snap', 'medium');
  await swipe(touch, 320, bodyBox.y + 40, bodyBox.y + 240, 65);
  await expect(dialog).toBeHidden();
  await expect(duplicateTrigger).toBeFocused();
  await duplicateTrigger.click();
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  const handleBox = (await handle.boundingBox())!;
  await swipe(touch, 195, handleBox.y + 20, handleBox.y + 450);
  await expect(dialog).toBeHidden();
  await expect(duplicateTrigger).toBeFocused();
  await touch.detach();

  await page.setViewportSize({ height: 844, width: 390 });
  await duplicateTrigger.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(duplicateTrigger).toBeFocused();

  await page.getByRole('searchbox', { name: 'Search' }).fill('Exceptionally');
  await expect(gallery.locator(':scope > li')).toHaveCount(1);
  await expect(
    gallery.getByText('The Exceptionally Long-Named Guardian of Senate House'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Filters & sort' }).click();
  await page.screenshot({ path: testInfo.outputPath('filters-mobile.png') });
  await selectOption(page.getByLabel('Category', { exact: true }), 'power');
  await expect(gallery.locator(':scope > li')).toHaveCount(8);
  await selectOption(page.getByLabel('Rarity', { exact: true }), 'epic');
  await page.getByRole('button', { name: 'Filters & sort · Active' }).click();
  await expect(page.getByLabel('Rarity', { exact: true })).toBeHidden();
  await expect(page.getByText(/Power cards · Epic/u)).toBeVisible();
  await page
    .getByRole('searchbox', { name: 'Search' })
    .fill('no such guardian');
  await expect(
    page.getByRole('heading', { name: 'No cards match these filters' }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('no-results-mobile.png') });
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();

  await page.setViewportSize({ height: 1024, width: 768 });
  await expectNoHorizontalOverflow(page);
  expect(await columnsOnFirstRow(gallery)).toBeGreaterThanOrEqual(4);
  await expectSquareArtwork(gallery);
  await duplicateTrigger.click();
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  const tabletPanel = await dialog.boundingBox();
  expect(tabletPanel).not.toBeNull();
  expect(tabletPanel!.width).toBeGreaterThan(700);
  expect(Math.abs(tabletPanel!.x + tabletPanel!.width / 2 - 384)).toBeLessThan(
    2,
  );
  await dialog
    .getByRole('button', { name: 'Close Campus Guardian 1 details' })
    .click();

  await page.setViewportSize({ height: 900, width: 1440 });
  await expectNoHorizontalOverflow(page);
  expect(await columnsOnFirstRow(gallery)).toBeGreaterThanOrEqual(5);
  await expectSquareArtwork(gallery);
  await duplicateTrigger.click();
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  await expect(dialog).toHaveAttribute('data-rarity', 'rare');
  const desktopPanel = await dialog.boundingBox();
  expect(desktopPanel).not.toBeNull();
  expect(desktopPanel!.width).toBeGreaterThanOrEqual(700);
  expect(
    Math.abs(desktopPanel!.x + desktopPanel!.width / 2 - 720),
  ).toBeLessThan(2);
  await page.screenshot({
    path: testInfo.outputPath('card-details-desktop.png'),
  });
  await dialog
    .getByRole('button', { name: 'Close Campus Guardian 1 details' })
    .click();
  const firstCard = gallery.getByRole('button').first();
  await firstCard.hover({ position: { x: 24, y: 24 } });
  await expect(firstCard).toHaveAttribute('data-hovered', '');
  await expect
    .poll(() =>
      firstCard.evaluate((element) =>
        Number.parseFloat(
          element.style.getPropertyValue('--card-scale') || '1',
        ),
      ),
    )
    .toBeGreaterThan(1.01);
  await page.screenshot({
    path: testInfo.outputPath('square-artwork-desktop-hover.png'),
    fullPage: true,
  });
  await page.mouse.move(0, 0);
  await expect(firstCard).not.toHaveAttribute('data-hovered', '');
  await selectOption(page.getByLabel('Sort', { exact: true }), 'rarity');
  await expect(gallery.locator('.card-thumbnail__title').first()).toHaveText(
    /Campus Guardian/u,
  );

  collectionDelay = new Promise<void>((resolve) => {
    releaseCollection = resolve;
  });
  await page.setViewportSize({ height: 844, width: 390 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Loading your cards' }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('loading-mobile.png') });
  collectionState = 'error';
  releaseCollection?.();
  collectionDelay = undefined;
  await expect(
    page.getByRole('heading', { name: 'Your cards could not load' }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('error-mobile.png') });

  collectionState = 'empty';
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Choose your starter affinity' }),
  ).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(3);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('empty-mobile.png'),
    fullPage: true,
  });

  expect(consoleErrors).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

function buildLargeCollection() {
  const cards = Array.from({ length: 24 }, (_, index) => {
    const number = index + 1;
    const card = buildCard(number, {
      hp: 80 + number,
      name:
        number === 5
          ? 'The Exceptionally Long-Named Guardian of Senate House'
          : `Campus Guardian ${number}`,
      power: 10 + number,
      rarity: ['common', 'rare', 'epic', 'legendary'][number % 4],
    });
    if (number === 1) {
      const move = card.moves[0]!;
      card.moves = [
        move,
        { ...move, id: buildUuid(993), name: 'Quick Read', powerCost: 0 },
        { ...move, id: buildUuid(994), name: 'Flash Feint', powerCost: 2 },
      ];
    }
    return number % 3 === 0
      ? {
          ...card,
          category: 'power',
          effects: [],
          hp: null,
          moves: [],
          power: null,
        }
      : card;
  });
  const first = cards[0]!;

  cards.push(
    { ...first, ownedCardId: buildUuid(990), acquisitionKind: 'event_reward' },
    { ...first, ownedCardId: buildUuid(991), acquisitionKind: 'event_reward' },
    { ...first, ownedCardId: buildUuid(992), acquisitionKind: 'event_reward' },
  );
  return cards;
}

async function columnsOnFirstRow(gallery: Locator) {
  const tops = await gallery
    .locator(':scope > li')
    .evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().top)),
    );
  return tops.filter((top) => top === tops[0]).length;
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function json(route: Route, body: object, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

async function swipe(
  session: CDPSession,
  x: number,
  fromY: number,
  toY: number,
  stepDelay = 25,
) {
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: fromY }],
  });
  for (let step = 1; step <= 8; step++) {
    await new Promise((resolve) => setTimeout(resolve, stepDelay));
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: fromY + ((toY - fromY) * step) / 8 }],
    });
  }
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

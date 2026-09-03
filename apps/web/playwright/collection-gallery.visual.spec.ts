import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from '@playwright/test';

import {
  buildCard,
  buildStarterOptions,
  buildUuid,
} from '../tests/fixtures/cards';

const API_BASE_URL = 'http://127.0.0.1:3999/api/v1';

test('groups, filters, and reveals card details across collection layouts', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const runtimeErrors: string[] = [];
  let collectionState: 'cards' | 'empty' | 'error' = 'cards';
  const cards = buildLargeCollection();

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
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
  await page.route(`${API_BASE_URL}/cards/collection`, (route) => {
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

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/collection');

  const gallery = page.getByRole('list', { name: 'Owned card designs' });
  await expect(gallery.locator(':scope > li')).toHaveCount(24);
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
  await expect(
    page.getByText('27 owned copies across 24 designs'),
  ).toBeVisible();
  await expect(page.getByText('×4')).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Campus Guardian 2 artwork unavailable' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(await columnsOnFirstRow(gallery)).toBe(3);

  const duplicateTrigger = page.getByRole('button', {
    name: 'View Campus Guardian 1 details, 4 owned copies',
  });
  await duplicateTrigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', {
    name: 'Campus Guardian 1 card details',
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('list', { name: /owned copies/u }).locator('li'),
  ).toHaveCount(4);
  await expect(
    dialog.getByRole('button', { name: 'Close card details' }),
  ).toBeFocused();
  const mobilePanel = await dialog.boundingBox();
  expect(mobilePanel).not.toBeNull();
  expect(Math.round(mobilePanel!.y + mobilePanel!.height)).toBe(844);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(duplicateTrigger).toBeFocused();

  await page.getByRole('searchbox', { name: 'Search' }).fill('Exceptionally');
  await expect(gallery.locator(':scope > li')).toHaveCount(1);
  await expect(
    gallery.getByText('The Exceptionally Long-Named Guardian of Senate House'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.getByRole('combobox', { name: 'Category' }).selectOption('power');
  await expect(gallery.locator(':scope > li')).toHaveCount(8);
  await page.getByRole('button', { name: 'Clear' }).click();

  await page.setViewportSize({ height: 1024, width: 768 });
  await expectNoHorizontalOverflow(page);
  expect(await columnsOnFirstRow(gallery)).toBeGreaterThanOrEqual(4);
  await duplicateTrigger.click();
  const tabletPanel = await dialog.boundingBox();
  expect(tabletPanel).not.toBeNull();
  expect(tabletPanel!.width).toBeLessThan(500);
  expect(tabletPanel!.x).toBeGreaterThan(200);
  await dialog.getByRole('button', { name: 'Close card details' }).click();

  await page.setViewportSize({ height: 800, width: 1280 });
  await expectNoHorizontalOverflow(page);
  expect(await columnsOnFirstRow(gallery)).toBeGreaterThanOrEqual(6);
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('rarity');
  await expect(gallery.locator('.card-thumbnail__title').first()).toHaveText(
    /Campus Guardian/u,
  );

  collectionState = 'error';
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Your cards could not load' }),
  ).toBeVisible();

  collectionState = 'empty';
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Choose your starter affinity' }),
  ).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(3);
  await expectNoHorizontalOverflow(page);

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

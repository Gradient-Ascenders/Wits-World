import { expect, test, type Page, type Route } from '@playwright/test';

import type { SavedDeck } from '../src/api/decks';
import { buildStarterCards, buildUuid } from '../tests/fixtures/cards';
import { activeMatch } from '../tests/fixtures/matches';

const API_BASE_URL = 'http://127.0.0.1:3999/api/v1';
const PLAYER = {
  id: buildUuid(980),
  lifecycleStatus: 'active',
  playerName: 'deck_browser_player',
  playerNameSetupRequired: false,
  requestId: 'deck-browser-player',
  role: 'player',
};

test('keeps multiple deck summaries compact and reveals one detail surface', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const runtimeErrors: string[] = [];
  const collection = buildStarterCards('wit');
  let decks = [
    buildDeck('Campus Five', 'wit', false, 900),
    buildDeck(
      'The Exceptionally Long-Named Senate House Strategy Deck',
      'spark',
      true,
      901,
    ),
    buildDeck('Great Hall Guard', 'grit', false, 902),
  ];

  monitorBrowser(page, consoleErrors, runtimeErrors);
  await page.route(`${API_BASE_URL}/auth/me`, (route) => json(route, PLAYER));
  await page.route(`${API_BASE_URL}/cards/collection`, (route) =>
    json(route, { cards: collection, requestId: 'deck-browser-cards' }),
  );
  await page.route(`${API_BASE_URL}/decks`, (route) =>
    json(route, { decks, requestId: 'deck-browser-decks' }),
  );
  await page.route(`${API_BASE_URL}/decks/**`, async (route) => {
    const request = route.request();
    const deckId = new URL(request.url()).pathname.split('/').at(-2);

    if (request.method() === 'PUT' && request.url().endsWith('/selection')) {
      decks = decks.map((deck) => ({
        ...deck,
        isSelected: deck.deckId === deckId,
      }));
      await json(route, {
        ...decks.find((deck) => deck.deckId === deckId)!,
        requestId: 'deck-browser-selection',
      });
      return;
    }

    if (request.method() === 'DELETE') {
      const deletedDeckId = new URL(request.url()).pathname.split('/').at(-1);
      decks = decks.filter((deck) => deck.deckId !== deletedDeckId);
      await route.fulfill({ body: '', status: 204 });
      return;
    }

    await route.fallback();
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/decks');
  const savedDecks = page.getByRole('list', { name: 'Saved decks' });
  const selectedDetail = page.getByRole('article');

  await expect(savedDecks.locator(':scope > li')).toHaveCount(3);
  await expect(selectedDetail).toHaveAccessibleName(
    'The Exceptionally Long-Named Senate House Strategy Deck',
  );
  await expect(
    page.getByRole('button', { name: 'Edit or rename' }),
  ).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(1);
  await expect(page.locator('.deck-rules')).not.toHaveAttribute('open');
  await expectNoHorizontalOverflow(page);

  for (const viewport of [
    { height: 1024, width: 768 },
    { height: 800, width: 1280 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    await expect(savedDecks.locator(':scope > li')).toHaveCount(3);
    await expect(selectedDetail).toBeVisible();
  }

  const desktopListBox = await savedDecks.boundingBox();
  const desktopDetailBox = await selectedDetail.boundingBox();
  expect(desktopListBox).not.toBeNull();
  expect(desktopDetailBox).not.toBeNull();
  expect(desktopDetailBox!.x).toBeGreaterThan(desktopListBox!.x);
  expect(Math.abs(desktopDetailBox!.y - desktopListBox!.y)).toBeLessThan(80);

  await page.setViewportSize({ height: 844, width: 390 });
  const campusSummary = page.getByRole('button', {
    name: 'View details for Campus Five',
  });
  await campusSummary.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Campus Five' }),
  ).toBeFocused();
  await expect(page.getByRole('button', { name: 'Make active' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start CPU match' }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Make active' }).click();
  await expect(
    page.getByText('Campus Five is now your active deck.'),
  ).toBeVisible();
  await expect(page.getByText('Selected for matches')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start CPU match' }),
  ).toBeVisible();

  await page
    .getByRole('button', { name: 'View details for Great Hall Guard' })
    .click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('button', { name: 'Delete deck' })).toBeFocused();
  await page.getByRole('button', { name: 'Delete deck' }).click();
  await expect(savedDecks.locator(':scope > li')).toHaveCount(2);

  await page
    .getByRole('button', {
      name: 'View details for Campus Five, active deck',
    })
    .click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete deck' }).click();
  await expect(savedDecks.locator(':scope > li')).toHaveCount(1);
  await expect(page.getByText('1 saved deck')).toBeVisible();
  await expect(page.getByText('No active deck')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make active' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  expect(consoleErrors).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('recovers the authoritative active match instead of creating another', async ({
  page,
}) => {
  const deck = buildDeck('Active Campus Five', 'wit', true, 910);
  const match = activeMatch();
  let createRequests = 0;

  await page.route(`${API_BASE_URL}/auth/me`, (route) => json(route, PLAYER));
  await page.route(`${API_BASE_URL}/cards/collection`, (route) =>
    json(route, {
      cards: buildStarterCards('wit'),
      requestId: 'deck-match-cards',
    }),
  );
  await page.route(`${API_BASE_URL}/decks`, (route) =>
    json(route, { decks: [deck], requestId: 'deck-match-decks' }),
  );
  await page.route(`${API_BASE_URL}/matches/cpu`, async (route) => {
    if (route.request().method() === 'POST') createRequests += 1;
    await json(route, { ...match, requestId: 'deck-active-match' });
  });
  await page.route(`${API_BASE_URL}/matches/${match.matchId}`, (route) =>
    json(route, { ...match, requestId: 'deck-match-state' }),
  );

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/decks');
  await page.getByRole('button', { name: 'Start CPU match' }).click();

  await expect(page).toHaveURL(`/matches/${match.matchId}`);
  expect(createRequests).toBe(0);
});

function buildDeck(
  name: string,
  affinity: 'grit' | 'spark' | 'wit',
  isSelected: boolean,
  id: number,
): SavedDeck {
  const cards = buildStarterCards(affinity);

  return {
    cards: cards.map((card, index) => ({
      affinity,
      cardDefinitionId: card.cardDefinitionId,
      category: index < 3 ? 'creature' : 'power',
      name: card.name,
      ownedCardId: card.ownedCardId,
      position: index + 1,
      rarity: 'common',
    })),
    createdAt: '2026-08-16T08:00:00.000Z',
    deckId: buildUuid(id),
    isSelected,
    name,
    totalPoints: 5,
    updatedAt: '2026-08-16T08:00:00.000Z',
  };
}

function monitorBrowser(
  page: Page,
  consoleErrors: string[],
  runtimeErrors: string[],
) {
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
}

async function expectNoHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
}

async function json(route: Route, body: object, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

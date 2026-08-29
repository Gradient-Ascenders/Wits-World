import { expect, test, type Page, type Route } from '@playwright/test';

import type { OwnedCard } from '../src/api/cards';
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

test('keeps exact-copy deck editing dense and reachable across viewports', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const runtimeErrors: string[] = [];
  const starterCards = buildStarterCards('wit') as OwnedCard[];
  const longName = 'The Exceptionally Long-Named Senate House Archive Guardian';
  const firstCard = { ...starterCards[0]!, name: longName };
  const duplicate = {
    ...firstCard,
    acquiredAt: '2026-08-17T08:00:00.000Z',
    ownedCardId: buildUuid(989),
  };
  const collection = [firstCard, duplicate, ...starterCards.slice(1)];
  const validSelection = [
    firstCard.ownedCardId,
    duplicate.ownedCardId,
    starterCards[1]!.ownedCardId,
    starterCards[3]!.ownedCardId,
    starterCards[4]!.ownedCardId,
  ];
  let savedDeck: SavedDeck | null = null;
  let submittedOwnedCardIds: string[] = [];

  monitorBrowser(page, consoleErrors, runtimeErrors);
  await page.route(`${API_BASE_URL}/auth/me`, (route) => json(route, PLAYER));
  await page.route(`${API_BASE_URL}/cards/collection`, (route) =>
    json(route, { cards: collection, requestId: 'deck-editor-cards' }),
  );
  await page.route(`${API_BASE_URL}/decks`, async (route) => {
    const request = route.request();

    if (request.method() === 'GET') {
      await json(route, {
        decks: savedDeck ? [savedDeck] : [],
        requestId: 'deck-editor-decks',
      });
      return;
    }

    if (request.method() === 'POST') {
      const body = request.postDataJSON() as {
        name: string;
        ownedCardIds: string[];
      };
      submittedOwnedCardIds = body.ownedCardIds;
      savedDeck = buildDeckFromSelection(
        body.name,
        body.ownedCardIds,
        collection,
      );
      await json(route, { ...savedDeck, requestId: 'deck-editor-create' }, 201);
      return;
    }

    await route.fallback();
  });
  await page.route(`${API_BASE_URL}/decks/**`, async (route) => {
    const request = route.request();

    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as {
        name: string;
        ownedCardIds: string[];
      };
      submittedOwnedCardIds = body.ownedCardIds;
      savedDeck = buildDeckFromSelection(
        body.name,
        body.ownedCardIds,
        collection,
      );
      await json(route, { ...savedDeck, requestId: 'deck-editor-update' });
      return;
    }

    await route.fallback();
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/decks');
  await page.getByRole('button', { name: 'Create a deck' }).click();

  const picker = page.getByRole('list', {
    name: 'Owned cards available for this deck',
  });
  await expect(picker.locator(':scope > li')).toHaveCount(5);
  await expectNoHorizontalOverflow(page);
  await expect(
    page.getByRole('button', { exact: true, name: 'Create saved deck' }),
  ).toBeDisabled();

  const duplicateCard = page.getByRole('article', { name: longName });
  await expect(
    duplicateCard.getByRole('img', {
      name: `${longName} artwork unavailable`,
    }),
  ).toBeVisible();
  await expect(duplicateCard.getByText(firstCard.description!)).toHaveCount(0);
  const addDuplicate = page.getByRole('button', {
    name: `Add a copy of ${longName}`,
  });
  await addDuplicate.click();
  await addDuplicate.click();
  await expect(duplicateCard.getByText('Owned 2 · Selected 2')).toBeVisible();
  await expect(duplicateCard.getByText('All copies selected')).toHaveCount(0);
  const quantityBadge = duplicateCard.locator('.card-thumbnail__duplicate');
  await expect(quantityBadge).toHaveText('×2');
  expect(
    await quantityBadge.evaluate((badge) => {
      const styles = getComputedStyle(badge);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
      };
    }),
  ).toEqual({
    backgroundColor: 'rgb(212, 175, 55)',
    color: 'rgb(8, 20, 38)',
  });
  await expect(addDuplicate).toBeDisabled();
  await duplicateCard
    .getByRole('button', { name: `Remove a copy of ${longName}` })
    .click();
  await expect(duplicateCard.getByText('Owned 2 · Selected 1')).toBeVisible();
  await addDuplicate.click();

  for (const card of [starterCards[1]!, starterCards[3]!, starterCards[4]!]) {
    await page
      .getByRole('button', { name: `Add a copy of ${card.name}` })
      .click();
  }
  await page
    .getByRole('textbox', { name: 'Deck name' })
    .fill('Campus Compact Five');
  await expect(page.getByText('Ready to submit')).toBeVisible();
  await expect(
    page.getByText(new RegExp(`^${validSelection.length} / \\d+ selected$`)),
  ).toBeVisible();

  const mobileSave = page.getByRole('button', {
    name: 'Create saved deck from current draft',
  });
  await picker.locator(':scope > li').last().scrollIntoViewIfNeeded();
  await expect(mobileSave).toBeInViewport();
  await mobileSave.click();
  await expect(
    page.getByRole('heading', { name: 'Campus Compact Five' }),
  ).toBeVisible();
  expect(submittedOwnedCardIds).toEqual(validSelection);

  await page.setViewportSize({ height: 1024, width: 768 });
  await page.getByRole('button', { name: 'Edit or rename' }).click();
  await expect(
    page.getByText(new RegExp(`^${validSelection.length} / \\d+ selected$`)),
  ).toBeVisible();
  await page
    .getByRole('button', { name: `Remove a copy of ${longName}` })
    .click();
  await expect(
    page.getByText(
      new RegExp(`^${validSelection.length - 1} / \\d+ selected$`),
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { exact: true, name: 'Save deck changes' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: `Add a copy of ${longName}` }).click();
  await page
    .getByRole('textbox', { name: 'Deck name' })
    .fill('The Exceptionally Long-Named Compact Campus Deck');
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ height: 800, width: 1280 });
  const draftBox = await page.locator('.deck-editor__draft').boundingBox();
  const pickerBox = await page.locator('.card-picker').boundingBox();
  expect(draftBox).not.toBeNull();
  expect(pickerBox).not.toBeNull();
  expect(pickerBox!.x).toBeGreaterThan(draftBox!.x);
  const selectedListMetrics = await page
    .locator('.draft-cards ol')
    .evaluate((list) => ({
      clientHeight: list.clientHeight,
      overflowY: getComputedStyle(list).overflowY,
      scrollHeight: list.scrollHeight,
    }));
  expect(selectedListMetrics.overflowY).toBe('visible');
  expect(selectedListMetrics.scrollHeight).toBeLessThanOrEqual(
    selectedListMetrics.clientHeight,
  );
  await expect(
    page.getByRole('button', { exact: true, name: 'Save deck changes' }),
  ).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  await page
    .getByRole('button', { exact: true, name: 'Save deck changes' })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'The Exceptionally Long-Named Compact Campus Deck',
    }),
  ).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(runtimeErrors).toEqual([]);
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

function buildDeckFromSelection(
  name: string,
  ownedCardIds: string[],
  collection: OwnedCard[],
): SavedDeck {
  return {
    cards: ownedCardIds.map((ownedCardId, index) => {
      const card = collection.find(
        (candidate) => candidate.ownedCardId === ownedCardId,
      )!;

      return {
        affinity: card.affinity,
        cardDefinitionId: card.cardDefinitionId,
        category: card.category,
        name: card.name,
        ownedCardId,
        position: index + 1,
        rarity: card.rarity,
      };
    }),
    createdAt: '2026-08-16T08:00:00.000Z',
    deckId: buildUuid(988),
    isSelected: false,
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

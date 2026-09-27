import { expect, test, type Page, type Route } from '@playwright/test';

import type { OwnedCard } from '../src/api/cards';
import type { SavedDeck } from '../src/api/decks';
import { buildStarterCards, buildUuid } from '../tests/fixtures/cards';
import { activeMatch } from '../tests/fixtures/matches';
import { expectSquareArtwork } from './card-artwork-assertions';

const API_BASE_URL = 'http://127.0.0.1:3999/api/v1';
const PLAYER = {
  connectionStrategy: 'auth0',
  id: buildUuid(980),
  lifecycleStatus: 'active',
  playerName: 'deck_browser_player',
  playerNameSetupRequired: false,
  requestId: 'deck-browser-player',
  role: 'player',
};

test.beforeEach(async ({ page }) => {
  await page.route(`${API_BASE_URL}/events`, (route) =>
    json(route, { events: [], requestId: 'deck-browser-events' }),
  );
});

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
  const savedDecks = page.locator('.saved-deck-list');
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
    { height: 900, width: 1440 },
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
  await page.getByLabel('Viewing deck').selectOption(buildUuid(900));
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

  await page.getByLabel('Viewing deck').selectOption(buildUuid(902));
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('button', { name: 'Delete deck' })).toBeFocused();
  await page.getByRole('button', { name: 'Delete deck' }).click();
  await expect(savedDecks.locator(':scope > li')).toHaveCount(2);

  await page.getByLabel('Viewing deck').selectOption(buildUuid(900));
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete deck' }).click();
  await expect(savedDecks.locator(':scope > li')).toHaveCount(1);
  await expect(page.locator('.deck-master__summary')).toContainText(
    '1 saved deck',
  );
  await expect(page.locator('.deck-master__summary')).toContainText(
    'No active deck',
  );
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
  await page
    .getByRole('textbox', { name: 'Deck name' })
    .fill('Campus Compact Five');
  await page
    .getByRole('group', { name: 'Editor view' })
    .getByRole('button', { name: 'Add cards' })
    .click();

  const picker = page.getByRole('list', {
    name: 'Owned cards available for this deck',
  });
  await expect(picker.locator(':scope > li')).toHaveCount(5);
  await expectSquareArtwork(picker);
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
  const quantityBadge = duplicateCard.locator('.card-frame__quantity');
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
    backgroundColor: 'rgb(8, 16, 29)',
    color: 'rgb(247, 243, 231)',
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
  await expect(page.locator('.deck-save-summary')).toContainText(
    'Ready to save',
  );
  await picker.locator(':scope > li').last().scrollIntoViewIfNeeded();
  const mobileSave = page.getByRole('button', {
    name: /^(Save|Create saved deck)$/,
  });
  await expect(mobileSave).toBeInViewport();
  await mobileSave.click();
  await expect(
    page.getByRole('heading', { name: 'Campus Compact Five' }),
  ).toBeVisible();
  expect(submittedOwnedCardIds).toEqual(validSelection);

  await page.setViewportSize({ height: 1024, width: 768 });
  await page.getByRole('button', { name: 'Edit or rename' }).click();
  await page
    .getByRole('group', { name: 'Editor view' })
    .getByRole('button', { name: 'Add cards' })
    .click();
  await expect(page.locator('.deck-save-summary')).toBeVisible();
  await page
    .getByRole('button', { name: `Remove a copy of ${longName}` })
    .click();
  await expect(page.locator('.deck-save-summary')).toContainText(
    `${validSelection.length - 1} / 5 cards`,
  );
  await expect(
    page.getByRole('button', { name: /^(Save|Save deck changes)$/ }),
  ).toBeDisabled();
  await page.getByRole('button', { name: `Add a copy of ${longName}` }).click();
  await page.getByRole('button', { name: /Your deck \(/ }).click();
  await page
    .getByRole('textbox', { name: 'Deck name' })
    .fill('The Exceptionally Long-Named Compact Campus Deck');
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ height: 900, width: 1440 });
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
  const desktopSaveBox = await page
    .locator('.deck-editor__actions')
    .boundingBox();
  const cardListBox = await picker.boundingBox();
  expect(desktopSaveBox!.y).toBeGreaterThanOrEqual(
    cardListBox!.y + cardListBox!.height,
  );
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

test('keeps a filtered mobile draft through saving and a recoverable failure', async ({
  page,
}) => {
  const cards = buildStarterCards('wit') as OwnedCard[];
  let saveAttempt = 0;
  let finishSave: (() => void) | undefined;
  await page.route(`${API_BASE_URL}/auth/me`, (route) => json(route, PLAYER));
  await page.route(`${API_BASE_URL}/cards/collection`, (route) =>
    json(route, { cards, requestId: 'fixture' }),
  );
  await page.route(`${API_BASE_URL}/decks`, async (route) => {
    if (route.request().method() === 'GET') {
      await json(route, { decks: [], requestId: 'fixture' });
      return;
    }
    saveAttempt += 1;
    if (saveAttempt === 1) {
      await new Promise<void>((resolve) => {
        finishSave = resolve;
      });
      await json(
        route,
        {
          code: 'INTERNAL_ERROR',
          detail: 'Try again.',
          requestId: 'fixture',
          status: 503,
          title: 'Unavailable',
          type: 'about:blank',
        },
        503,
      );
      return;
    }
    const body = route.request().postDataJSON() as {
      name: string;
      ownedCardIds: string[];
    };
    await json(
      route,
      {
        ...buildDeckFromSelection(body.name, body.ownedCardIds, cards),
        requestId: 'fixture',
      },
      201,
    );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/decks');
  await expect(page.getByText('No saved decks yet')).toBeVisible();
  await page.getByRole('button', { name: 'Create a deck' }).click();
  await expect(
    page.getByText('Incomplete deck', { exact: true }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Deck name' }).fill('Retry Five');
  await page
    .getByRole('group', { name: 'Editor view' })
    .getByRole('button', { name: 'Add cards' })
    .click();
  await page.getByRole('searchbox', { name: 'Search cards' }).fill('No match');
  await expect(
    page.getByRole('heading', { name: 'No matching cards' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  for (const card of cards)
    await page
      .getByRole('button', { name: `Add a copy of ${card.name}` })
      .click();
  await expect(page.locator('.deck-save-summary')).toContainText(
    'Ready to save',
  );
  await page
    .getByRole('button', { name: /^(Save|Create saved deck)$/ })
    .click();
  await expect(
    page.getByRole('button', { name: 'Saving with the server…' }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeDisabled();
  finishSave!();
  await expect(page.getByRole('alert')).toContainText('Deck change not saved.');
  await expect(page.locator('.deck-save-summary')).toContainText(
    'Unsaved changes',
  );
  await page
    .getByRole('button', { name: 'Create saved deck', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Retry Five' })).toBeVisible();
  const confirmation = page.locator('[data-sonner-toast]');
  await expect(confirmation).toHaveCount(1);
  await expect(confirmation).toContainText('Retry Five was created.');
  expect(saveAttempt).toBe(2);
  await expectNoHorizontalOverflow(page);
});

test('minimises the mobile save bar deliberately and preserves keyboard access', async ({
  page,
}) => {
  const cards = buildStarterCards('wit');
  const deck = buildDeck('Campus Five', 'wit', false, 900);
  await page.route(`${API_BASE_URL}/auth/me`, (route) => json(route, PLAYER));
  await page.route(`${API_BASE_URL}/cards/collection`, (route) =>
    json(route, { cards, requestId: 'fixture' }),
  );
  await page.route(`${API_BASE_URL}/decks`, (route) =>
    json(route, { decks: [deck], requestId: 'fixture' }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/decks');
  await page.getByRole('button', { name: 'Edit or rename' }).click();
  await page
    .getByRole('group', { name: 'Editor view' })
    .getByRole('button', { name: 'Add cards' })
    .click();
  const bar = page.locator('.deck-editor__actions');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(bar).toHaveAttribute('data-collapsed', 'false');
  const expandedHeight = (await bar.boundingBox())!.height;
  await page.mouse.move(190, 400);
  await page.mouse.wheel(0, 420);
  await expect(bar).toHaveAttribute('data-collapsed', 'true');
  await expect
    .poll(async () => (await bar.boundingBox())!.height)
    .toBeLessThan(expandedHeight * 0.7);
  const save = page.getByRole('button', { name: 'Save', exact: true });
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // Wait for the collapse transition and allow subpixel layout rounding.
  await expect
    .poll(async () => {
      const bounds = (await bar.boundingBox())!;
      return Math.abs(bounds.y + bounds.height - 772);
    })
    .toBeLessThanOrEqual(1);
  // Pausing and small opposite movements must not expand the bar.
  await page.waitForTimeout(250);
  await page.mouse.wheel(0, -4);
  await page.waitForTimeout(250);
  await expect(bar).toHaveAttribute('data-collapsed', 'true');
  await page.mouse.wheel(0, -80);
  await expect(bar).toHaveAttribute('data-collapsed', 'false');
  await page.mouse.wheel(0, 140);
  await expect(bar).toHaveAttribute('data-collapsed', 'true');
  const details = page.getByRole('button', { name: 'Expand deck save panel' });
  await details.click();
  await expect(bar).toHaveAttribute('data-collapsed', 'false');
  await page.mouse.move(190, 400);
  await page.mouse.wheel(0, 80);
  await expect(bar).toHaveAttribute('data-collapsed', 'true');
  await details.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Save deck changes', exact: true }),
  ).toBeFocused();
  await page.mouse.wheel(0, 100);
  await expect(bar).toHaveAttribute('data-collapsed', 'false');
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.mouse.wheel(0, 100);
  await expect(bar).toHaveAttribute('data-collapsed', 'true');
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect(bar).toHaveAttribute('data-collapsed', 'true');
  await page.mouse.wheel(0, -4);
  await page.waitForTimeout(250);
  await expect(bar).toHaveAttribute('data-collapsed', 'true');
  await page.mouse.wheel(0, -80);
  await expect(bar).toHaveAttribute('data-collapsed', 'false');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(bar).toHaveAttribute('data-collapsed', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page
      .locator('.deck-save-full')
      .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration)),
  ).toBeLessThanOrEqual(0.001);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.mouse.wheel(0, 400);
  await expect(bar).toHaveAttribute('data-collapsed', 'false');
  await expect(
    page.getByRole('button', { name: 'Save deck changes', exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
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

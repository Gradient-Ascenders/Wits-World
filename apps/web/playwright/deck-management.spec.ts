import { expect, test, type Page, type Route } from '@playwright/test';
import path from 'node:path';

const screenshotsDirectory = path.resolve(
  process.cwd(),
  '../../.pr-screenshots/issue-73',
);

const cards = [1, 2, 3, 4, 5].map((index) => ({
  acquiredAt: '2026-08-16T08:00:00.000Z',
  acquisitionKind: 'starter',
  affinity: 'wit',
  cardDefinitionId: uuid(100 + index),
  category: index <= 3 ? 'creature' : 'power',
  description: 'A card from the authenticated browser verification collection.',
  effects:
    index <= 3
      ? []
      : [
          {
            effectType: 'heal',
            effectValue: 10,
            id: uuid(500 + index),
            modifierDurationTurns: null,
            modifierOperation: null,
            modifierStat: null,
            position: 1,
          },
        ],
  hp: index <= 3 ? 90 + index : null,
  imageUrl: null,
  isActive: true,
  moves:
    index <= 3
      ? [
          {
            effectType: 'damage',
            effectValue: 20,
            id: uuid(300 + index),
            modifierDurationTurns: null,
            modifierOperation: null,
            modifierStat: null,
            moveType: 'wit',
            name: 'Knowledge Surge',
            position: 1,
            powerCost: 3,
          },
        ]
      : [],
  name: index <= 3 ? `Campus Guardian ${index}` : `Archive Power ${index - 3}`,
  ownedCardId: uuid(200 + index),
  power: index <= 3 ? 12 : null,
  rarity: 'common',
}));

test('completes the saved-deck journey and records responsive evidence', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const failedRequests: FailedRequest[] = [];
  let savedDeck: ReturnType<typeof buildDeck> | null = null;

  monitorBrowser(page, consoleErrors, failedRequests);

  await page.route('**/api/v1/cards/collection', async (route) => {
    await json(route, { cards, requestId: 'browser-collection' });
  });
  await page.route('**/api/v1/decks/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname.endsWith('/selection') && request.method() === 'PUT') {
      savedDeck = { ...savedDeck!, isSelected: true };
      await json(route, { ...savedDeck, requestId: 'browser-select' });
      return;
    }

    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as {
        name: string;
        ownedCardIds: string[];
      };
      savedDeck = buildDeck(
        body.name,
        body.ownedCardIds,
        savedDeck?.isSelected,
      );
      await json(route, { ...savedDeck, requestId: 'browser-update' });
      return;
    }

    if (request.method() === 'DELETE') {
      savedDeck = null;
      await route.fulfill({ body: '', status: 204 });
      return;
    }

    await route.fallback();
  });
  await page.route('**/api/v1/decks', async (route) => {
    const request = route.request();

    if (request.method() === 'GET') {
      await json(route, {
        decks: savedDeck ? [savedDeck] : [],
        requestId: 'browser-decks',
      });
      return;
    }

    if (request.method() === 'POST') {
      const body = request.postDataJSON() as {
        name: string;
        ownedCardIds: string[];
      };
      savedDeck = buildDeck(body.name, body.ownedCardIds);
      await json(route, { ...savedDeck, requestId: 'browser-create' }, 201);
      return;
    }

    await route.fallback();
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/decks');
  await expect(
    page.getByRole('heading', { name: 'Build your match deck' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No saved decks yet' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Create a deck' }).click();
  await expect(
    page.getByRole('heading', { name: 'Build a deck' }),
  ).toBeFocused();
  await page.getByRole('textbox', { name: 'Deck name' }).fill('Campus Five');

  for (const card of cards) {
    await page
      .getByRole('button', { name: `Add a copy of ${card.name}` })
      .click();
  }

  await expect(page.getByText('Ready to submit')).toBeVisible();
  await expect(page.getByText('5 / 10')).toBeVisible();
  await page.locator('.decks-page').screenshot({
    path: path.join(screenshotsDirectory, '390-editor-ready.png'),
    style: '.skip-link, .primary-navigation { display: none !important; }',
  });
  await page.getByRole('button', { name: 'Create saved deck' }).click();
  await expect(
    page.getByRole('heading', { name: 'Campus Five' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Edit or rename' }).click();
  await page.getByRole('textbox', { name: 'Deck name' }).fill('Library Lineup');
  await page.getByRole('button', { name: 'Save deck changes' }).click();
  await expect(
    page.getByRole('heading', { name: 'Library Lineup' }),
  ).toBeVisible();

  const makeActive = page.getByRole('button', { name: 'Make active' });
  await makeActive.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Selected for matches')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Library Lineup is active' }),
  ).toBeFocused();

  for (const viewport of [
    { height: 800, label: '360', width: 360 },
    { height: 844, label: '390', width: 390 },
    { height: 1024, label: 'tablet-768', width: 768 },
    { height: 800, label: 'desktop-1280', width: 1280 },
  ]) {
    await page.setViewportSize({
      height: viewport.height,
      width: viewport.width,
    });
    await expectNoHorizontalOverflow(page);
    await page.locator('.decks-page').screenshot({
      path: path.join(
        screenshotsDirectory,
        `${viewport.label}-active-deck.png`,
      ),
      style: '.skip-link, .primary-navigation { display: none !important; }',
    });
  }

  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(
    page.getByRole('group', { name: 'Delete Library Lineup' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep deck' }).click();
  await expect(
    page.getByRole('heading', { exact: true, name: 'Library Lineup' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete deck' }).click();
  await expect(
    page.getByRole('heading', { name: 'No saved decks yet' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Choose an active deck' }),
  ).toBeVisible();

  expect(consoleErrors).toEqual([]);
  // Chromium reports an intercepted empty 204 as ERR_ABORTED even though the
  // fetch resolves and the delete flow completes. Keep this exact so any other
  // failed request still fails the browser check.
  expect(failedRequests).toEqual([
    {
      method: 'DELETE',
      path: `/api/v1/decks/${uuid(900)}`,
      reason: 'net::ERR_ABORTED',
    },
  ]);
});

test('recovers from API and stale-deck errors in the browser', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const failedRequests: FailedRequest[] = [];
  let deckLoads = 0;
  const deck = buildDeck(
    'Stale Campus Five',
    cards.map((card) => card.ownedCardId),
  );

  monitorBrowser(page, consoleErrors, failedRequests);
  await page.route('**/api/v1/cards/collection', async (route) => {
    await json(route, { cards, requestId: 'browser-collection' });
  });
  await page.route('**/api/v1/decks/**/selection', async (route) => {
    await json(
      route,
      problem('DECK_NOT_FOUND', 404, 'The requested saved deck was not found.'),
      404,
    );
  });
  await page.route('**/api/v1/decks', async (route) => {
    deckLoads += 1;

    if (deckLoads === 1) {
      await json(route, problem('SERVICE_UNAVAILABLE', 503, 'Try again.'), 503);
      return;
    }

    await json(route, {
      decks: deckLoads === 2 ? [deck] : [],
      requestId: 'browser-decks',
    });
  });

  await page.goto('/decks');
  await expect(
    page.getByRole('heading', { name: 'Your saved decks could not load' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Try loading again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Stale Campus Five' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Make active' }).click();
  await expect(
    page.getByText(/changed or was deleted elsewhere/i),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No saved decks yet' }),
  ).toBeVisible();

  expect(consoleErrors).toEqual([
    'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
    'Failed to load resource: the server responded with a status of 404 (Not Found)',
  ]);
  expect(failedRequests).toEqual([]);
});

function buildDeck(name: string, ownedCardIds: string[], isSelected = false) {
  return {
    cards: ownedCardIds.map((ownedCardId, index) => {
      const card = cards.find((item) => item.ownedCardId === ownedCardId)!;
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
    deckId: uuid(900),
    isSelected,
    name,
    totalPoints: 5,
    updatedAt: '2026-08-16T08:00:00.000Z',
  };
}

function monitorBrowser(
  page: Page,
  consoleErrors: string[],
  failedRequests: FailedRequest[],
) {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('requestfailed', (request) => {
    failedRequests.push({
      method: request.method(),
      path: new URL(request.url()).pathname,
      reason: request.failure()?.errorText ?? 'unknown',
    });
  });
}

interface FailedRequest {
  method: string;
  path: string;
  reason: string;
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

function problem(code: string, status: number, detail: string) {
  return {
    code,
    detail,
    requestId: 'browser-error',
    status,
    title: 'Deck request failed',
    type: 'about:blank',
  };
}

function uuid(value: number) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

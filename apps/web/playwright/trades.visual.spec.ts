import { expect, test, type Page, type Route } from '@playwright/test';

import { buildUuid } from '../tests/fixtures/cards';

const API_BASE_URL = 'http://127.0.0.1:3999/api/v1';
const TRADE_ID = buildUuid(1);
const DEFINITION_ID = buildUuid(10);
const OWNED_CARD_ID = buildUuid(20);

test('trading journey is focused, responsive, and server-owned', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  const runtimeErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await page.route(`${API_BASE_URL}/**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/auth/me')) {
      return json(route, {
        connectionStrategy: 'auth0',
        id: buildUuid(980),
        lifecycleStatus: 'active',
        playerName: 'collection_browser_player',
        playerNameSetupRequired: false,
        requestId: 'fixture-player',
        role: 'player',
      });
    }
    if (pathname.endsWith('/cards/trading-catalogue')) {
      return json(route, {
        definitions: [definition()],
        requestId: 'fixture-catalogue',
      });
    }
    if (pathname.endsWith('/trades/selection-preview')) {
      const body = request.postDataJSON() as {
        offeredOwnedCardIds: string[];
        requestedDefinitions: { cardDefinitionId: string; quantity: number }[];
      };
      return json(route, preview(body));
    }
    if (pathname.endsWith(`/trades/${TRADE_ID}`)) {
      return json(route, { requestId: 'fixture-detail', trade: tradeView() });
    }
    if (pathname.endsWith('/trades') && request.method() === 'GET') {
      return json(route, {
        hasMore: false,
        items: [
          {
            counterpartyPlayerName: 'other_player',
            createdAt: '2026-09-26T08:00:00.000Z',
            direction: 'received',
            expiresAt: '2026-09-27T08:00:00.000Z',
            status: 'open',
            terminalAt: null,
            tradeId: TRADE_ID,
            version: 3,
          },
          {
            counterpartyPlayerName: 'campus_collector',
            createdAt: '2026-09-24T08:00:00.000Z',
            direction: 'sent',
            expiresAt: '2026-09-25T08:00:00.000Z',
            status: 'completed',
            terminalAt: '2026-09-24T09:30:00.000Z',
            tradeId: buildUuid(2),
            version: 2,
          },
        ],
        page: 1,
        pageSize: 20,
        requestId: 'fixture-list',
      });
    }
    if (pathname.endsWith('/trades') && request.method() === 'POST') {
      return json(
        route,
        { requestId: 'fixture-create', trade: tradeView() },
        201,
      );
    }
    throw new Error(`Unexpected request: ${request.method()} ${pathname}`);
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/collection/trades');
  await expect(
    page.getByRole('heading', { name: 'Card trades' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Incoming' })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('trade-inbox-mobile.png'),
  });

  await page.getByRole('link', { name: 'Start a trade' }).click();
  await page.getByRole('textbox', { name: 'Player Name' }).fill('other_player');
  await page.getByRole('button', { name: 'Choose your cards' }).click();
  const copy = page.getByRole('button', { name: /Courier Ibis/ });
  await expect(copy).toBeVisible();
  await expect(copy).toHaveAttribute('aria-pressed', 'false');
  await expectNoHorizontalOverflow(page);
  await copy.click();
  await expect(copy).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('trade-copy-picker-mobile.png'),
  });

  await page.getByRole('button', { name: 'Choose requested cards' }).click();
  const increment = page.getByRole('button', {
    name: 'Request one more Courier Ibis',
  });
  const incrementBox = await increment.boundingBox();
  expect(incrementBox).not.toBeNull();
  expect(incrementBox!.width).toBeGreaterThanOrEqual(44);
  expect(incrementBox!.height).toBeGreaterThanOrEqual(44);
  await increment.click();
  await page.getByRole('button', { name: 'Review offer' }).click();
  await expect(page.getByText('Server preview ready')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You give' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'You request' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('trade-review-mobile.png'),
  });

  await page.setViewportSize({ height: 960, width: 1440 });
  await page.goto(`/collection/trades/${TRADE_ID}`);
  await expect(
    page.getByRole('heading', { name: 'Trade with other_player' }),
  ).toBeVisible();
  await expect(page.getByLabel('Trade version 3')).toBeVisible();
  await expect(
    page.getByText('Review the rarity-point difference'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Verify and accept' }),
  ).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('trade-detail-desktop.png'),
  });

  expect(runtimeErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

function definition() {
  return {
    affinity: 'wit',
    cardDefinitionId: DEFINITION_ID,
    category: 'creature',
    imageAlt: 'A courier ibis carrying a sealed offer.',
    imageUrl: '/src/assets/home/great-hall-hero.png',
    name: 'Courier Ibis',
    rarity: 'rare',
  };
}

function offeredCopy() {
  return { ...definition(), ownedCardId: OWNED_CARD_ID };
}

function party(accepted: boolean) {
  return {
    accepted,
    imbalanceAcknowledged: false,
    offeredCopies: [offeredCopy()],
    rarityPoints: accepted ? 2 : 4,
    requestedDefinitions: [{ ...definition(), quantity: 1 }],
  };
}

function tradeView() {
  return {
    complete: true,
    counterparty: party(true),
    counterpartyPlayerName: 'other_player',
    createdAt: '2026-09-26T08:00:00.000Z',
    expiresAt: '2026-09-27T08:00:00.000Z',
    imbalanceWarningRequired: true,
    role: 'recipient',
    self: party(false),
    settlement: null,
    status: 'open',
    terminalAt: null,
    tradeId: TRADE_ID,
    version: 3,
  };
}

function preview(input: {
  offeredOwnedCardIds: string[];
  requestedDefinitions: { cardDefinitionId: string; quantity: number }[];
}) {
  const offered = input.offeredOwnedCardIds.length > 0;
  const requested = input.requestedDefinitions.length > 0;
  return {
    imbalanceWarningRequired: false,
    issues: [
      ...(offered ? [] : ['offer_required']),
      ...(requested ? [] : ['request_required']),
    ],
    limits: {
      maximumCopiesPerSide: 5,
      minimumCreatureCopies: 3,
      minimumPowerCopies: 2,
    },
    offeredRarityPoints: offered ? 2 : 0,
    ownedCopies: [
      {
        ...offeredCopy(),
        availability: offered ? 'selected_here' : 'available',
      },
    ],
    requestedDefinitions: requested ? [{ ...definition(), quantity: 1 }] : [],
    requestedRarityPoints: requested ? 2 : 0,
    requestId: 'fixture-preview',
    valid: offered && requested,
  };
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

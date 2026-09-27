import { expect, test, type Page, type Route } from '@playwright/test';

import { buildUuid } from '../tests/fixtures/cards';

const API_BASE_URL = 'http://127.0.0.1:3999/api/v1';
const TRADE_ID = buildUuid(1);
const CARD_FIXTURES = [
  {
    affinity: 'wit',
    category: 'creature',
    name: 'Courier Ibis',
    rarity: 'rare',
  },
  {
    affinity: 'grit',
    category: 'power',
    name: 'Fate Reversal',
    rarity: 'legendary',
  },
  {
    affinity: 'wit',
    category: 'creature',
    name: 'Arcalyron',
    rarity: 'legendary',
  },
  {
    affinity: 'spark',
    category: 'creature',
    name: 'Arcalyx',
    rarity: 'rare',
  },
  {
    affinity: 'spirit',
    category: 'creature',
    name: 'Axiomar',
    rarity: 'rare',
  },
] as const;

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
        playerName: 'kevin-tester9',
        playerNameSetupRequired: false,
        requestId: 'fixture-player',
        role: 'player',
      });
    }
    if (pathname.endsWith('/events')) {
      return json(route, { events: [], requestId: 'fixture-events' });
    }
    if (pathname.endsWith('/cards/trading-catalogue')) {
      return json(route, {
        definitions: CARD_FIXTURES.map((_, index) =>
          catalogueDefinition(index),
        ),
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
  await clearFocus(page);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('trade-inbox-mobile.png'),
  });

  await page.getByRole('link', { name: 'Start a trade' }).click();
  await expect(
    page.getByRole('heading', { name: 'Who do you want to trade with?' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('trade-recipient-mobile.png'),
  });
  await page.getByRole('textbox', { name: 'Player Name' }).fill('other_player');
  await page.getByRole('button', { name: 'Build trade' }).click();
  await expect(
    page.getByRole('heading', { name: 'Build your offer' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Rarity points are server-calculated guidance, not card prices.',
    ),
  ).toHaveCount(0);
  await expect(page.getByText('Resolve these before publishing:')).toHaveCount(
    0,
  );
  const collection = page.getByRole('list', {
    name: 'Card types in your collection',
  });
  await expect(collection.getByRole('listitem')).toHaveCount(1);
  await expect(collection).toContainText('10 owned · 10 tradable');
  const mobileDetailsTrigger = collection.getByRole('button', {
    name: 'View Courier Ibis details',
  });
  await mobileDetailsTrigger.click();
  const mobileCardDetails = page.getByRole('dialog', { name: 'Courier Ibis' });
  await expect(mobileCardDetails).toHaveAttribute('data-rarity', 'rare');
  await expect(mobileCardDetails).toContainText('Rare Creature · Wit affinity');
  await expect(mobileCardDetails).toContainText('Campus Charge');
  const mobileDetailsBox = await mobileCardDetails.boundingBox();
  expect(mobileDetailsBox).not.toBeNull();
  expect(mobileDetailsBox!.height).toBeGreaterThanOrEqual(520);
  await expect
    .poll(async () => (await mobileCardDetails.boundingBox())?.y ?? Infinity)
    .toBeLessThanOrEqual(324);
  await expect(mobileCardDetails.locator('.trade-card-detail__body')).toHaveCSS(
    'overflow-y',
    'auto',
  );
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('trade-card-details-mobile.png'),
  });
  await mobileCardDetails
    .getByRole('button', { name: 'Close Courier Ibis details' })
    .click();
  await expect(mobileDetailsTrigger).toBeFocused();
  const addCopy = collection.getByRole('button', {
    name: 'Offer one more Courier Ibis',
  });
  await expect(addCopy).toBeVisible();
  await expectNoHorizontalOverflow(page);
  for (let index = 0; index < 5; index += 1) await addCopy.click();
  await expect(collection).toContainText('5 selected');
  await clearFocus(page);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('trade-copy-picker-mobile.png'),
  });

  await page.getByRole('button', { name: /Active cards/ }).click();
  const increment = page.getByRole('button', {
    name: 'Request one more Courier Ibis',
  });
  const incrementBox = await increment.boundingBox();
  expect(incrementBox).not.toBeNull();
  expect(incrementBox!.width).toBeGreaterThanOrEqual(44);
  expect(incrementBox!.height).toBeGreaterThanOrEqual(44);
  for (const fixture of CARD_FIXTURES) {
    await page
      .getByRole('button', { name: `Request one more ${fixture.name}` })
      .click();
  }
  await expect(page.getByText('Ready')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You give' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'You receive' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await clearFocus(page);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('trade-builder-mobile.png'),
  });

  await page.setViewportSize({ height: 960, width: 1440 });
  await expect(
    page.getByRole('heading', { name: 'kevin-tester9' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'other_player' }),
  ).toBeVisible();
  const receiveLaneBox = await page
    .locator('.trade-builder-lane--receive')
    .boundingBox();
  const exchangeMarkBox = await page
    .locator('.trade-builder__exchange-mark')
    .boundingBox();
  const giveLaneBox = await page
    .locator('.trade-builder-lane--give')
    .boundingBox();
  expect(receiveLaneBox).not.toBeNull();
  expect(exchangeMarkBox).not.toBeNull();
  expect(giveLaneBox).not.toBeNull();
  expect(exchangeMarkBox!.y).toBeGreaterThanOrEqual(
    receiveLaneBox!.y + receiveLaneBox!.height,
  );
  expect(exchangeMarkBox!.y + exchangeMarkBox!.height).toBeLessThanOrEqual(
    giveLaneBox!.y,
  );
  const desktopCardFrame = page
    .locator(
      '.trade-builder__catalogue-panel--self .trade-card-thumbnail .card-frame',
    )
    .first();
  await expect(desktopCardFrame.locator('.card-frame__rail')).toBeVisible();
  const desktopCardBox = await desktopCardFrame.boundingBox();
  expect(desktopCardBox).not.toBeNull();
  expect(desktopCardBox!.width).toBeGreaterThanOrEqual(110);
  const desktopCardTilt = desktopCardFrame.locator('..');
  await desktopCardTilt.hover({ position: { x: 88, y: 36 } });
  await expect(desktopCardTilt).toHaveAttribute('data-hovered', '');
  await expect
    .poll(() =>
      desktopCardTilt.evaluate(
        (element) => getComputedStyle(element).transform,
      ),
    )
    .not.toBe('none');
  const arcalyronArtwork = page
    .getByRole('list', { name: 'Active card definitions you can request' })
    .getByRole('listitem')
    .filter({ hasText: 'Arcalyron' })
    .locator('.collectible-card__artwork img');
  await expect(arcalyronArtwork).toHaveCSS('object-fit', 'contain');
  const legendaryDetailsTrigger = page
    .getByRole('list', { name: 'Active card definitions you can request' })
    .getByRole('button', { name: 'View Arcalyron details' });
  await legendaryDetailsTrigger.click();
  const legendaryDetails = page.getByRole('dialog', { name: 'Arcalyron' });
  await expect(legendaryDetails).toHaveAttribute('data-rarity', 'legendary');
  await expect(legendaryDetails).toHaveCSS(
    'border-top-color',
    'rgb(237, 198, 100)',
  );
  await page.screenshot({
    path: testInfo.outputPath('trade-card-details-legendary-desktop.png'),
  });
  await legendaryDetails
    .getByRole('button', { name: 'Close Arcalyron details' })
    .click();
  await expect(legendaryDetailsTrigger).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await clearFocus(page);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('trade-builder-desktop.png'),
  });
  await page.mouse.move(0, 0);
  await expect(desktopCardTilt).not.toHaveAttribute('data-hovered', '');

  await expect(page.locator('.trade-builder-selection-strip')).toHaveCount(2);
  await expect(
    page.locator('.trade-builder-selection-strip .trade-card-thumbnail'),
  ).toHaveCount(6);
  const receiptFrames = page.locator(
    '.trade-builder-selection-strip .trade-card-thumbnail--full .card-frame',
  );
  await expect(receiptFrames.locator('.card-frame__rail')).toHaveCount(6);
  await expect(
    receiptFrames.first().locator('.card-frame__rail'),
  ).toBeVisible();
  const denseReceiptCardBox = await receiptFrames.first().boundingBox();
  expect(denseReceiptCardBox).not.toBeNull();
  expect(denseReceiptCardBox!.width).toBeGreaterThanOrEqual(86);
  const groupedReceiptCardBox = await page
    .locator(
      '.trade-builder-lane--give .trade-card-thumbnail--full .card-frame',
    )
    .boundingBox();
  expect(groupedReceiptCardBox).not.toBeNull();
  expect(groupedReceiptCardBox!.width).toBeGreaterThanOrEqual(110);
  await expect(
    page.getByRole('button', { name: 'Show card details' }),
  ).toHaveCount(0);
  const selfPanelBox = await page
    .locator('.trade-builder__catalogue-panel--self')
    .boundingBox();
  const centerPanelBox = await page
    .locator('.trade-builder__table')
    .boundingBox();
  const recipientPanelBox = await page
    .locator('.trade-builder__catalogue-panel--recipient')
    .boundingBox();
  expect(selfPanelBox).not.toBeNull();
  expect(centerPanelBox).not.toBeNull();
  expect(recipientPanelBox).not.toBeNull();
  expect(
    Math.abs(selfPanelBox!.height - centerPanelBox!.height),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(recipientPanelBox!.height - centerPanelBox!.height),
  ).toBeLessThanOrEqual(1);
  const tradePanel = page.locator('.trade-builder__table');
  await expect(tradePanel).toHaveCSS('overflow-y', 'auto');
  await expect(tradePanel).toHaveCSS('scrollbar-gutter', 'stable');
  expect(
    await tradePanel.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  const recipientScroll = page.locator(
    '.trade-builder__catalogue-panel--recipient .trade-builder__catalogue-scroll',
  );
  expect(
    await recipientScroll.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await expectNoHorizontalOverflow(page);
  await clearFocus(page);

  await page.getByRole('button', { name: 'Review offer' }).click();
  const confirmation = page.getByRole('dialog', {
    name: 'Send this trade offer?',
  });
  await expect(confirmation).toContainText(
    'Send 5 cards to other_player and request 5 cards?',
  );
  await confirmation.getByRole('button', { name: 'Keep reviewing' }).click();

  await page.getByRole('link', { name: 'Back to trades' }).click();
  const discardConfirmation = page.getByRole('dialog', {
    name: 'Discard unsaved changes?',
  });
  await expect(discardConfirmation).toBeVisible();
  await expect(page.locator('.author-dialog-backdrop')).toHaveCSS(
    'position',
    'fixed',
  );
  const discardBox = await discardConfirmation.boundingBox();
  expect(discardBox).not.toBeNull();
  expect(
    Math.abs(discardBox!.x + discardBox!.width / 2 - 1440 / 2),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(discardBox!.y + discardBox!.height / 2 - 960 / 2),
  ).toBeLessThanOrEqual(2);
  await page.screenshot({
    path: testInfo.outputPath('trade-discard-confirmation-desktop.png'),
  });
  await discardConfirmation
    .getByRole('button', { name: 'Keep editing' })
    .click();

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
  await clearFocus(page);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('trade-detail-desktop.png'),
  });

  expect(runtimeErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

function definition(index = 0) {
  const fixture = CARD_FIXTURES[index];
  if (!fixture) throw new Error(`Unknown card fixture index: ${index}`);
  return {
    affinity: fixture.affinity,
    cardDefinitionId: buildUuid(10 + index),
    category: fixture.category,
    imageAlt: `${fixture.name} card artwork.`,
    imageUrl:
      fixture.name === 'Arcalyron'
        ? '/cards/arcalyron.webp'
        : '/src/assets/home/great-hall-hero.png',
    name: fixture.name,
    rarity: fixture.rarity,
  };
}

function catalogueDefinition(index = 0) {
  const card = definition(index);
  const creature = card.category === 'creature';
  return {
    ...card,
    description: creature
      ? 'A campus legend ready to enter the battle.'
      : 'Turn the course of a close battle.',
    effects: creature
      ? []
      : [
          {
            effectType: 'buff',
            effectValue: 20,
            id: buildUuid(200 + index),
            modifierDurationTurns: 2,
            modifierOperation: 'add',
            modifierStat: 'power',
            position: 1,
            rulesText: 'Restore 20 Power for two turns.',
          },
        ],
    hp: creature ? 100 + index * 10 : null,
    isActive: true,
    moves: creature
      ? [
          {
            effectType: 'damage',
            effectValue: 25 + index,
            id: buildUuid(100 + index),
            modifierDurationTurns: null,
            modifierOperation: null,
            modifierStat: null,
            moveType: card.affinity,
            name: 'Campus Charge',
            position: 1,
            powerCost: 2,
            rulesText: `Deal ${25 + index} base damage.`,
          },
        ]
      : [],
    power: creature ? 10 + index : null,
  };
}

function offeredCopy(index = 0) {
  return { ...definition(), ownedCardId: buildUuid(20 + index) };
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
    offeredRarityPoints: input.offeredOwnedCardIds.length * 2,
    ownedCopies: Array.from({ length: 10 }, (_, index) => {
      const copy = offeredCopy(index);
      return {
        ...copy,
        availability: input.offeredOwnedCardIds.includes(copy.ownedCardId)
          ? 'selected_here'
          : 'available',
      };
    }),
    requestedDefinitions: input.requestedDefinitions.map((request) => ({
      ...definition(
        CARD_FIXTURES.findIndex(
          (_, index) => buildUuid(10 + index) === request.cardDefinitionId,
        ),
      ),
      quantity: request.quantity,
    })),
    requestedRarityPoints: input.requestedDefinitions.reduce(
      (total, request) => total + request.quantity * 2,
      0,
    ),
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

async function clearFocus(page: Page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
}

async function json(route: Route, body: object, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

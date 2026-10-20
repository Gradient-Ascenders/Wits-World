import { captureScreenshot } from './visual-capture';
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
  let inboxState: 'populated' | 'empty' | 'paged' | 'error' = 'populated';
  let catalogueArtwork: 'ready' | 'missing' | 'empty' = 'ready';
  let currentTrade = tradeView();
  const revisions: Array<{
    expectedVersion: number;
    offeredOwnedCardIds: string[];
    requestedDefinitions: { cardDefinitionId: string; quantity: number }[];
    submissionId: string;
  }> = [];
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
        definitions:
          catalogueArtwork === 'empty'
            ? []
            : CARD_FIXTURES.map((_, index) => ({
                ...catalogueDefinition(index),
                ...(catalogueArtwork === 'missing' ? { imageUrl: null } : {}),
              })),
        requestId: 'fixture-catalogue',
      });
    }
    if (pathname.endsWith('/trades/recipient')) {
      const name = new URL(request.url()).searchParams.get('playerName');
      return name === 'other_player'
        ? json(route, { playerName: name, requestId: 'fixture-recipient' })
        : json(route, { code: 'TRADE_PLAYER_UNAVAILABLE' }, 404);
    }
    if (pathname.endsWith('/trades/selection-preview')) {
      const body = request.postDataJSON() as {
        offeredOwnedCardIds: string[];
        requestedDefinitions: { cardDefinitionId: string; quantity: number }[];
      };
      return json(route, preview(body));
    }
    if (pathname.endsWith(`/trades/${TRADE_ID}`)) {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON() as (typeof revisions)[number];
        revisions.push(body);
        currentTrade = {
          ...currentTrade,
          version: currentTrade.version + 1,
          complete: false,
          self: {
            ...currentTrade.self,
            accepted: false,
            imbalanceAcknowledged: false,
            offeredCopies: body.offeredOwnedCardIds.map((ownedCardId) => ({
              ...definition(),
              ownedCardId,
            })),
            requestedDefinitions: body.requestedDefinitions.map(
              (requested) => ({
                ...definition(),
                quantity: requested.quantity,
              }),
            ),
            rarityPoints: body.offeredOwnedCardIds.length * 2,
          },
          counterparty: {
            ...currentTrade.counterparty,
            accepted: false,
            imbalanceAcknowledged: false,
          },
        };
      }
      return json(route, { requestId: 'fixture-detail', trade: currentTrade });
    }
    if (pathname.endsWith('/trades') && request.method() === 'GET') {
      if (inboxState === 'error') {
        return json(route, { code: 'UNAVAILABLE' }, 503);
      }
      const query = new URL(request.url()).searchParams;
      const pageNumber = Number(query.get('page') ?? 1);
      const onlyOpen = query.get('status') === 'open';
      if (inboxState === 'empty' || inboxState === 'paged') {
        return json(route, {
          hasMore: inboxState === 'paged' && !onlyOpen && pageNumber === 1,
          items:
            inboxState === 'paged' && pageNumber === 2
              ? [
                  {
                    counterpartyPlayerName: 'older_collector',
                    createdAt: '2026-09-24T08:00:00.000Z',
                    direction: 'sent',
                    expiresAt: '2026-09-25T08:00:00.000Z',
                    status: 'cancelled',
                    terminalAt: '2026-09-24T09:30:00.000Z',
                    tradeId: buildUuid(4),
                    version: 1,
                  },
                ]
              : [],
          page: pageNumber,
          pageSize: 50,
          requestId: 'fixture-list',
        });
      }
      return json(route, {
        hasMore: false,
        items: [
          {
            counterpartyPlayerName: 'other_player',
            createdAt: '2026-09-26T08:00:00.000Z',
            direction: 'received',
            expiresAt: new Date(Date.now() + 6 * 3_600_000).toISOString(),
            status: 'open',
            terminalAt: null,
            tradeId: TRADE_ID,
            version: 3,
          },
          {
            counterpartyPlayerName:
              'a_campus_collector_with_a_long_player_name',
            createdAt: '2026-09-26T08:00:00.000Z',
            direction: 'sent',
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            status: 'open',
            terminalAt: null,
            tradeId: buildUuid(3),
            version: 1,
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
  await captureScreenshot(test.info(), page, {
    fullPage: true,
    path: testInfo.outputPath('trade-inbox-mobile.png'),
  });

  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ height: 960, width });
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole('link', { name: 'Start a trade' })).toHaveCount(
      1,
    );
    await captureScreenshot(test.info(), page, {
      fullPage: true,
      path: testInfo.outputPath(`trade-inbox-${width}.png`),
    });
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(
      page.getByRole('list', { name: 'Trade history' }),
    ).toContainText('Completed');
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(test.info(), page, {
      fullPage: true,
      path: testInfo.outputPath(`trade-history-${width}.png`),
    });
    await page.getByRole('button', { name: 'Open', exact: true }).click();
  }

  await page.setViewportSize({ height: 844, width: 390 });
  inboxState = 'empty';
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'No open trades' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start a trade' })).toHaveCount(
    1,
  );
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No trade history yet' }),
  ).toBeVisible();
  await captureScreenshot(test.info(), page, {
    fullPage: true,
    path: testInfo.outputPath('trade-history-empty.png'),
  });

  inboxState = 'paged';
  await page.reload();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No closed trades on this page' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Trade history' })).toContainText(
    'older_collector',
  );
  await expect(page.getByRole('list', { name: 'Trade history' })).toContainText(
    'Cancelled',
  );
  await expect(
    page.getByRole('button', { name: 'Load more', exact: true }),
  ).toHaveCount(0);

  inboxState = 'error';
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Couldn’t load trades' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await captureScreenshot(test.info(), page, {
    fullPage: true,
    path: testInfo.outputPath('trade-inbox-error.png'),
  });
  inboxState = 'populated';
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Incoming' })).toBeVisible();
  // The two mocked 503 responses above are expected recovery coverage.
  expect(consoleErrors.filter((message) => !message.includes('503'))).toEqual(
    [],
  );
  consoleErrors.length = 0;

  await page.getByRole('link', { name: 'Start a trade' }).click();
  await expect(
    page.getByRole('heading', { name: 'Start a trade' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await captureScreenshot(test.info(), page, {
    fullPage: true,
    path: testInfo.outputPath('trade-recipient-mobile.png'),
  });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ height: 844, width });
    await expectNoHorizontalOverflow(page);
    const buttonBox = await page
      .getByRole('button', { name: 'Choose cards' })
      .boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.y + buttonBox!.height).toBeLessThan(844 - 72);
    await expect(page.locator('.trade-entry-card')).toHaveCount(2);
    await expect(
      page.locator('.trade-recipient-entry__artwork button'),
    ).toHaveCount(0);
    await captureScreenshot(test.info(), page, {
      fullPage: true,
      path: testInfo.outputPath(`trade-entry-${width}.png`),
    });
  }

  const entranceCard = page.locator('.trade-entry-card__surface').first();
  await entranceCard.hover();
  await expect(entranceCard).toHaveAttribute('data-hovered', '');
  await page.mouse.move(0, 0);
  await expect(entranceCard).not.toHaveAttribute('data-hovered');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await entranceCard.hover();
  await expect(entranceCard).not.toHaveAttribute('data-hovered');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.mouse.move(0, 0);

  await page.setViewportSize({ height: 844, width: 390 });
  for (const artwork of ['missing', 'empty'] as const) {
    catalogueArtwork = artwork;
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Start a trade' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    if (artwork === 'missing') {
      await expect(
        page.locator(
          '.trade-recipient-entry__artwork .collectible-card__artwork-fallback',
        ),
      ).toHaveCount(2);
    } else {
      await expect(page.locator('.trade-entry-card')).toHaveCount(0);
    }
    await captureScreenshot(test.info(), page, {
      fullPage: true,
      path: testInfo.outputPath(`trade-entry-${artwork}.png`),
    });
  }
  catalogueArtwork = 'ready';
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Start a trade' }),
  ).toBeVisible();
  const recipientInput = page.getByRole('textbox', { name: 'Player Name' });
  await recipientInput.fill('fdfds');
  await recipientInput.press('Enter');
  await expect(page.getByRole('alert')).toContainText(
    'That player is unavailable.',
  );
  await expect(
    page.getByRole('heading', { name: 'Start a trade' }),
  ).toBeVisible();
  await expect(recipientInput).toHaveAttribute('aria-invalid', 'true');
  await captureScreenshot(test.info(), page, {
    fullPage: true,
    path: testInfo.outputPath('trade-recipient-unavailable.png'),
  });
  expect(consoleErrors.filter((message) => !message.includes('404'))).toEqual(
    [],
  );
  consoleErrors.length = 0;
  await recipientInput.fill('other_player');
  await page.getByRole('textbox', { name: 'Player Name' }).press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Trade with other_player' }),
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
  await expect(collection).toContainText('10 available');
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
  await captureScreenshot(test.info(), page, {
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
  await expect(collection.locator('output')).toHaveText('5');
  await clearFocus(page);
  await captureScreenshot(test.info(), page, {
    fullPage: true,
    path: testInfo.outputPath('trade-copy-picker-mobile.png'),
  });

  await page.getByRole('button', { name: 'You request', exact: true }).click();
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
    page.getByRole('heading', { name: 'You request' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await clearFocus(page);
  await captureScreenshot(test.info(), page, {
    fullPage: true,
    path: testInfo.outputPath('trade-builder-mobile.png'),
  });

  await page.setViewportSize({ height: 960, width: 1440 });
  await expect(
    page.getByRole('heading', { name: 'Your collection' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Card catalogue' }),
  ).toBeVisible();
  const giveLaneBox = await page
    .locator('.trade-builder-lane--give')
    .boundingBox();
  const requestLaneBox = await page
    .locator('.trade-builder-lane--receive')
    .boundingBox();
  expect(giveLaneBox).not.toBeNull();
  expect(requestLaneBox).not.toBeNull();
  expect(requestLaneBox!.y).toBeGreaterThanOrEqual(
    giveLaneBox!.y + giveLaneBox!.height,
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
  await captureScreenshot(test.info(), page, {
    path: testInfo.outputPath('trade-card-details-legendary-desktop.png'),
  });
  await legendaryDetails
    .getByRole('button', { name: 'Close Arcalyron details' })
    .click();
  await expect(legendaryDetailsTrigger).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await clearFocus(page);
  await captureScreenshot(test.info(), page, {
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

  for (const width of [320, 390, 490, 768, 1120, 1440]) {
    const height = width === 490 ? 994 : width < 1120 ? 844 : 960;
    await page.setViewportSize({ height, width });
    await expectNoHorizontalOverflow(page);
    if (width < 1120) {
      const tray = page.locator('.trade-builder__center');
      const trayBox = await tray.boundingBox();
      expect(trayBox).not.toBeNull();
      expect(trayBox!.y + trayBox!.height).toBeLessThanOrEqual(height - 72);
      expect(trayBox!.height).toBeLessThanOrEqual(height * 0.36);
      const giveHeading = tray.getByRole('heading', {
        name: 'You give',
        exact: true,
      });
      const requestHeading = tray.getByRole('heading', {
        name: 'You request',
        exact: true,
      });
      await expect(giveHeading).toBeInViewport();
      await expect(requestHeading).toBeInViewport();
      const giveBox = await giveHeading.boundingBox();
      const requestBox = await requestHeading.boundingBox();
      expect(Math.abs(giveBox!.y - requestBox!.y)).toBeLessThanOrEqual(2);
      for (const strip of await tray
        .locator('.trade-builder-selection-strip')
        .all()) {
        const thumbnails = await strip.locator('.trade-card-thumbnail').all();
        for (const thumbnail of thumbnails) {
          // Every selection stays readable; dense lanes scroll rather than shrink.
          await thumbnail.scrollIntoViewIfNeeded();
          await expect(thumbnail).toBeInViewport();
          const cardBox = await thumbnail.boundingBox();
          expect(cardBox!.width).toBeGreaterThanOrEqual(94);
          const artBox = await thumbnail
            .locator('.card-frame__window')
            .boundingBox();
          expect(artBox!.width).toBeGreaterThanOrEqual(78);
          expect(artBox!.height).toBeGreaterThanOrEqual(78);
          await expect(thumbnail.locator('.card-frame__rail')).toBeVisible();
        }
        await expect(
          strip.locator('.trade-builder-selection-strip__name').first(),
        ).toBeVisible();
        await strip.evaluate((el) => {
          el.scrollLeft = 0;
        });
      }
      const requestedStrip = tray.getByRole('list', {
        name: 'You request selected cards',
      });
      const scrollable = await requestedStrip.evaluate(
        (el) => el.scrollWidth > el.clientWidth,
      );
      if (width <= 490) expect(scrollable).toBe(true);
      // A selected card at the end of a dense lane remains inspectable.
      const lastCard = requestedStrip.getByRole('button', {
        name: 'View Axiomar details',
      });
      await lastCard.click();
      const selectedDetails = page.getByRole('dialog', { name: 'Axiomar' });
      await expect(selectedDetails).toBeVisible();
      await selectedDetails
        .getByRole('button', { name: 'Close Axiomar details' })
        .click();
      await expect(lastCard).toBeFocused();
      await requestedStrip.evaluate((el) => {
        el.scrollLeft = 0;
      });
      await expect(
        tray.getByRole('button', { name: 'Review offer' }),
      ).toBeInViewport();
    }
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await clearFocus(page);
    await captureScreenshot(test.info(), page, {
      fullPage: true,
      path: testInfo.outputPath(`trade-new-${width}.png`),
    });
  }

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
  await captureScreenshot(test.info(), page, {
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
  await expect(page.getByText('Rarity warning')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Accept', exact: true }),
  ).toBeEnabled();
  await expectNoHorizontalOverflow(page);
  await clearFocus(page);
  await captureScreenshot(test.info(), page, {
    fullPage: true,
    path: testInfo.outputPath('trade-detail-desktop.png'),
  });

  const detailCard = page
    .locator('.trade-side')
    .first()
    .getByRole('button', { name: 'View Courier Ibis details' })
    .first();
  const detailBox = await detailCard.boundingBox();
  expect(detailBox!.width).toBeGreaterThanOrEqual(140);
  await detailCard.hover();
  await expect(detailCard).toHaveAttribute('data-hovered', '');
  await detailCard.click();
  const detailDialog = page.getByRole('dialog', { name: 'Courier Ibis' });
  await expect(detailDialog.getByText('Campus Charge')).toBeVisible();
  await detailDialog
    .getByRole('button', { name: 'Close Courier Ibis details' })
    .click();
  await expect(detailCard).toBeFocused();
  const backLink = page.getByRole('link', { name: 'All trades' });
  expect(
    await backLink.evaluate((el) => getComputedStyle(el).textDecorationLine),
  ).toBe('none');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await expectNoHorizontalOverflow(page);
    // Visit the GPU-backed card layers before a full-document capture.
    for (const card of await page
      .locator('.trade-detail-page .trade-card-thumbnail')
      .all()) {
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeInViewport();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    }
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await clearFocus(page);
    await captureScreenshot(test.info(), page, {
      fullPage: true,
      path: testInfo.outputPath(`trade-detail-${width}.png`),
    });
  }

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('link', { name: 'Counter' }).click();
  await expect(page).toHaveURL(`/collection/trades/${TRADE_ID}/edit`);
  await expect(page.getByText('Editing version 3')).toBeVisible();
  await expect(page.locator('.trade-builder')).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Trade setup progress' }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change player' })).toHaveCount(
    0,
  );
  const editingCollection = page.getByRole('list', {
    name: 'Card types in your collection',
  });
  await expect(editingCollection.locator('output')).toHaveText('1');
  await expect(
    page.getByRole('heading', { name: 'You request', exact: true }),
  ).toBeVisible();
  await editingCollection
    .getByRole('button', { name: 'Offer one more Courier Ibis' })
    .click();
  await expect(page.getByRole('button', { name: 'Counter' })).toBeEnabled();
  for (const width of [320, 390, 490, 768, 1440]) {
    await page.setViewportSize({
      width,
      height: width === 490 ? 994 : width < 1120 ? 844 : 960,
    });
    await expectNoHorizontalOverflow(page);
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await clearFocus(page);
    await captureScreenshot(test.info(), page, {
      fullPage: true,
      path: testInfo.outputPath(`trade-edit-${width}.png`),
    });
  }
  await page.getByRole('button', { name: 'Counter' }).click();
  const revisionDialog = page.getByRole('dialog', {
    name: 'Send this counter offer?',
  });
  await expect(revisionDialog).toContainText(
    'Confirming sends version 4 for them to accept.',
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await expect(
      revisionDialog.getByRole('button', { name: 'Send counter' }),
    ).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(test.info(), page, {
      path: testInfo.outputPath(`trade-revision-${width}.png`),
    });
  }
  await revisionDialog.getByRole('button', { name: 'Keep reviewing' }).click();
  await expect(page.getByRole('button', { name: 'Counter' })).toBeFocused();
  expect(revisions).toHaveLength(0);
  await page.getByRole('button', { name: 'Counter' }).click();
  await page
    .getByRole('dialog', { name: 'Send this counter offer?' })
    .getByRole('button', { name: 'Send counter' })
    .click();
  await expect(page).toHaveURL(`/collection/trades/${TRADE_ID}`);
  await expect(page.getByLabel('Trade version 4')).toBeVisible();
  expect(revisions).toEqual([
    {
      confirmOffer: true,
      expectedVersion: 3,
      offeredOwnedCardIds: [buildUuid(20), buildUuid(21)],
      requestedDefinitions: [{ cardDefinitionId: buildUuid(10), quantity: 1 }],
      submissionId: expect.any(String),
    },
  ]);

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

test('rarity warning belongs to review and waits for current availability', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  let releasePreview: (() => void) | undefined;
  let holdCompletePreview = true;
  await page.route(`${API_BASE_URL}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/auth/me'))
      return json(route, {
        connectionStrategy: 'auth0',
        id: buildUuid(980),
        lifecycleStatus: 'active',
        playerName: 'kevin-tester9',
        playerNameSetupRequired: false,
        requestId: 'fixture-player',
        role: 'player',
      });
    if (pathname.endsWith('/events'))
      return json(route, { events: [], requestId: 'fixture-events' });
    if (pathname.endsWith('/cards/trading-catalogue'))
      return json(route, {
        definitions: CARD_FIXTURES.map((_, index) =>
          catalogueDefinition(index),
        ),
        requestId: 'catalogue',
      });
    if (pathname.endsWith('/trades/recipient'))
      return json(route, {
        playerName: 'other_player',
        requestId: 'recipient',
      });
    if (pathname.endsWith('/trades/selection-preview')) {
      const body = route.request().postDataJSON() as Parameters<
        typeof preview
      >[0];
      const result = preview(body);
      if (result.valid && holdCompletePreview)
        await new Promise<void>((resolve) => {
          releasePreview = resolve;
        });
      return json(route, {
        ...result,
        imbalanceWarningRequired: result.valid,
        requestedRarityPoints: body.requestedDefinitions.length * 5,
      });
    }
    throw new Error(`Unexpected request: ${pathname}`);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/collection/trades/new');
  await page.getByRole('textbox', { name: 'Player Name' }).fill('other_player');
  await page.getByRole('button', { name: 'Choose cards' }).click();
  await page
    .getByRole('button', { name: 'Offer one more Courier Ibis' })
    .click();
  await page.getByRole('button', { name: 'You request', exact: true }).click();
  await page
    .getByRole('button', { name: 'Request one more Arcalyron' })
    .click();
  const review = page.getByRole('button', { name: 'Review offer' });
  await expect(review).toBeDisabled();
  await expect(page.locator('.trade-builder__check')).toContainText(
    'Checking trade availability',
  );
  await expect.poll(() => Boolean(releasePreview)).toBe(true);
  holdCompletePreview = false;
  releasePreview!();
  await expect(review).toBeEnabled();
  const warning = page.locator('#trade-rarity-warning');
  await expect(
    page.locator('.trade-builder__table .trade-preview-warning'),
  ).toHaveCount(0);
  await expect(page.locator('.trade-builder__review-bar')).toContainText(
    'Rarity imbalance.',
  );
  await expect(review).toHaveAccessibleDescription(
    'Rarity imbalance. Both players must acknowledge this before accepting.',
  );
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await review.scrollIntoViewIfNeeded();
    await expect(warning).toBeInViewport();
    await expect(review).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    const warningBox = await warning.boundingBox();
    const reviewBox = await review.boundingBox();
    expect(warningBox!.y + warningBox!.height).toBeLessThanOrEqual(
      reviewBox!.y,
    );
    await captureScreenshot(testInfo, page, {
      fullPage: true,
      path: testInfo.outputPath(`trade-review-${width}.png`),
    });
  }
  await review.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('dialog', { name: 'Send this trade offer?' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('accept and counter use one confirmation and prefill the incoming proposal', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const empty = {
    accepted: false,
    imbalanceAcknowledged: false,
    offeredCopies: [],
    requestedDefinitions: [],
    rarityPoints: 0,
  };
  let current = {
    ...tradeView(),
    role: 'recipient',
    complete: false,
    self: empty,
    counterparty: { ...tradeView().counterparty, accepted: true },
  };
  const accepts: object[] = [];
  const counters: object[] = [];
  await page.route(`${API_BASE_URL}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return json(route, {
        connectionStrategy: 'auth0',
        id: buildUuid(980),
        lifecycleStatus: 'active',
        playerName: 'kevin-tester9',
        playerNameSetupRequired: false,
        requestId: 'player',
        role: 'player',
      });
    if (path.endsWith('/cards/trading-catalogue'))
      return json(route, {
        definitions: CARD_FIXTURES.map((_, index) =>
          catalogueDefinition(index),
        ),
        requestId: 'catalogue',
      });
    if (path.endsWith('/cards/collection'))
      return json(route, { cards: [], requestId: 'collection' });
    if (path.endsWith('/events'))
      return json(route, { events: [], requestId: 'events' });
    if (path.endsWith('/trades/selection-preview'))
      return json(route, preview(request.postDataJSON()));
    if (path.endsWith(`/trades/${TRADE_ID}/accept`)) {
      accepts.push(request.postDataJSON());
      return json(route, {
        requestId: 'accepted',
        trade: {
          ...current,
          status: 'completed',
          complete: true,
          terminalAt: new Date().toISOString(),
          self: { ...tradeView().self, accepted: true },
          settlement: { completedAt: new Date().toISOString() },
        },
      });
    }
    if (path.endsWith(`/trades/${TRADE_ID}`)) {
      if (request.method() === 'PUT') {
        counters.push(request.postDataJSON());
        current = {
          ...current,
          version: current.version + 1,
          self: { ...empty, accepted: true },
          counterparty: { ...current.counterparty, accepted: false },
        };
      }
      return json(route, { trade: current, requestId: 'detail' });
    }
    throw new Error(`Unexpected request: ${path}`);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/collection/trades/${TRADE_ID}`);
  const accept = page.getByRole('button', { name: 'Accept', exact: true });
  await expect(accept).toBeEnabled();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('.trade-comparison .trade-side')).toHaveCount(2);
    await expect(
      page.getByRole('heading', { name: 'You give', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'other_player gives', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.trade-request-grid')).toHaveCount(0);
    await clearFocus(page);
    await captureScreenshot(testInfo, page, {
      fullPage: true,
      path: testInfo.outputPath(`trade-two-sides-${width}.png`),
    });
    await accept.click();
    const dialog = page.getByRole('dialog', { name: 'Accept this offer?' });
    await expect(dialog).toContainText(
      'Your cards will be exchanged immediately.',
    );
    await expect(
      dialog.getByRole('button', { name: 'Accept', exact: true }),
    ).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(testInfo, page, {
      path: testInfo.outputPath(`trade-accept-confirm-${width}.png`),
    });
    await page.keyboard.press('Escape');
    await expect(accept).toBeFocused();
  }
  expect(accepts).toEqual([]);
  await page.getByRole('link', { name: 'Counter', exact: true }).click();
  const counter = page.getByRole('button', { name: 'Counter', exact: true });
  await expect(counter).toBeEnabled();
  await expect(
    page.locator('.trade-builder-selection-strip .trade-card-thumbnail--full'),
  ).toHaveCount(2);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await counter.scrollIntoViewIfNeeded();
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(testInfo, page, {
      fullPage: true,
      path: testInfo.outputPath(`trade-counter-prefilled-${width}.png`),
    });
    await counter.click();
    const dialog = page.getByRole('dialog', {
      name: 'Send this counter offer?',
    });
    await expect(dialog).toContainText(
      'Confirming sends version 4 for them to accept.',
    );
    await expect(
      dialog.getByRole('button', { name: 'Send counter' }),
    ).toBeInViewport();
    await captureScreenshot(testInfo, page, {
      path: testInfo.outputPath(`trade-counter-confirm-${width}.png`),
    });
    await page.keyboard.press('Escape');
  }
  await counter.click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Send counter' })
    .click();
  await expect(page).toHaveURL(`/collection/trades/${TRADE_ID}`);
  expect(counters).toEqual([
    {
      confirmOffer: true,
      expectedVersion: 3,
      offeredOwnedCardIds: [buildUuid(20)],
      requestedDefinitions: [{ cardDefinitionId: buildUuid(10), quantity: 1 }],
      submissionId: expect.any(String),
    },
  ]);
  // Restore an incoming proposal to exercise the independent accept journey.
  current = {
    ...current,
    self: empty,
    counterparty: { ...current.counterparty, accepted: true },
  };
  await page.reload();
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Accept', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Trade completed' }),
  ).toBeVisible();
  expect(accepts).toEqual([
    {
      confirmOffer: true,
      expectedVersion: 4,
      submissionId: expect.any(String),
    },
  ]);
  expect(errors).toEqual([]);
});

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

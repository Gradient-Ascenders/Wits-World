import { captureScreenshot } from './visual-capture';
import { expect, test, type Page, type Route } from '@playwright/test';

import {
  LIVE_MATCH_ID,
  LIVE_SERVER_TIME,
  participantProjection,
  queueState,
  rankedProfile,
  rankedSettlement,
  rankedSeason,
  rankedStandings,
  spectatorProjection,
  territoryZones,
} from '../tests/fixtures/live';
import { buildSavedDeck } from '../tests/fixtures/decks';
import { buildStarterCards } from '../tests/fixtures/cards';
import { buildCreature } from '../tests/fixtures/matches';
import artworkManifest from '../../../artwork/cards/manifest.json' with { type: 'json' };

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(LIVE_SERVER_TIME));
  const artwork = [
    'quillip',
    'ciphra',
    'axiomar',
    'field-kit',
    'grand-strategy',
  ];
  await page.route('**/api/v1/cards/collection**', (route) =>
    json(route, {
      cards: buildStarterCards().map((card, index) => ({
        ...card,
        imageUrl: `/cards/${artwork[index]}.webp`,
      })),
      requestId: 'live-deck-cards',
    }),
  );
});

for (const failure of ['http', 'offline'] as const) {
  test(`keeps the lobby usable after a scoped card ${failure} failure and retries the same deck`, async ({
    page,
  }) => {
    const deck = buildSavedDeck({ isSelected: true });
    await routeReadyLobby(page, [deck]);
    let unavailable = true;
    const scopes: string[] = [];
    await page.route('**/api/v1/cards/collection**', async (route) => {
      scopes.push(
        new URL(route.request().url()).searchParams.get('deckId') ?? '',
      );
      if (unavailable && failure === 'offline') {
        await route.abort('internetdisconnected');
        return;
      }
      await json(
        route,
        unavailable
          ? {
              code: 'UNAVAILABLE',
              status: 503,
              title: 'Unavailable',
              detail: 'Fixture failure',
              type: 'about:blank',
              requestId: 'cards-failed',
            }
          : { cards: buildStarterCards(), requestId: 'cards-retried' },
        unavailable ? 503 : 200,
      );
    });
    await page.goto('/matches/live');
    await expect(
      page.getByRole('button', { name: 'Find battle', exact: true }),
    ).toBeEnabled();
    await expect(page.getByText('Card details couldn’t load.')).toBeVisible();
    unavailable = false;
    await page
      .locator('.live-lobby__card-recovery')
      .getByRole('button', { name: 'Retry' })
      .click();
    const card = page.getByRole('button', {
      name: 'View Campus Guardian 1 details, card 1',
    });
    await expect(card).toBeVisible();
    expect(scopes).toEqual([deck.deckId, deck.deckId]);
    await card.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(card).toBeFocused();
  });
}

test('does not read card details without a selected deck', async ({ page }) => {
  await routeReadyLobby(page, [buildSavedDeck({ isSelected: false })]);
  let cardReads = 0;
  await page.route('**/api/v1/cards/collection**', async (route) => {
    cardReads++;
    await json(route, { cards: [], requestId: 'unexpected-read' });
  });
  await page.goto('/matches/live');
  await expect(
    page.getByRole('heading', { name: 'No deck selected' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Select deck', exact: true }),
  ).toHaveAttribute('href', '/collection/decks');
  expect(cardReads).toBe(0);
});

test('re-reads the changed selected deck on repeat entry at mobile and desktop widths', async ({
  page,
}) => {
  let deck = buildSavedDeck({ isSelected: true });
  await routeReadyLobby(page, []);
  await page.route('**/api/v1/decks', (route) =>
    json(route, { decks: [deck], requestId: 'fresh-deck' }),
  );
  const scopes: string[] = [];
  await page.route('**/api/v1/cards/collection**', (route) => {
    scopes.push(
      new URL(route.request().url()).searchParams.get('deckId') ?? '',
    );
    return json(route, {
      cards: buildStarterCards(),
      requestId: 'fresh-cards',
    });
  });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/matches/live');
    await expect(
      page.locator('.live-deck-fan .card-thumbnail__button'),
    ).toHaveCount(5);
    expect(scopes.at(-1)).toBe(deck.deckId);
    await expectNoHorizontalOverflow(page);
    await page.goto('/not-a-route');
    deck = {
      ...deck,
      deckId: '00000000-0000-4000-8000-000000000901',
      name: 'Changed deck',
    };
  }
  expect(scopes).toHaveLength(2);
});

test('loads deck artwork before delayed details on entry and reload', async ({
  page,
}, testInfo) => {
  const artwork = artworkManifest.cards.slice(0, 5);
  const cards = buildStarterCards().map((card, index) => ({
    ...card,
    cardDefinitionId: artwork[index]!.id,
    name: artwork[index]!.name,
    imageUrl: artwork[index]!.optimized,
    imageAlt: artwork[index]!.alt,
  }));
  const deck = buildSavedDeck({ isSelected: true });
  deck.cards = deck.cards.map((card, index) => ({
    ...card,
    cardDefinitionId: cards[index]!.cardDefinitionId,
    name: cards[index]!.name,
  }));
  await routeCurrentPlayer(page);
  await page.route('**/api/v1/decks', (route) =>
    json(route, { decks: [deck], requestId: 'artwork-deck' }),
  );
  await page.route('**/api/v1/ranked/queue', (route) =>
    json(route, queueState()),
  );
  await page.route('**/api/v1/ranked/seasons/current', (route) =>
    json(route, { season: rankedSeason() }),
  );
  await page.route('**/api/v1/ranked/me', (route) =>
    json(route, rankedProfile()),
  );
  await page.route('**/api/v1/ranked/standings**', (route) =>
    json(route, rankedStandings()),
  );
  await page.route('**/api/v1/territory/zones', (route) =>
    json(route, { zones: territoryZones() }),
  );

  let releaseDetails!: () => void;
  let detailsGate: Promise<void>;
  let collectionRequests = 0;
  await page.route('**/api/v1/cards/collection**', async (route) => {
    expect(new URL(route.request().url()).searchParams.get('deckId')).toBe(
      deck.deckId,
    );
    collectionRequests++;
    await detailsGate;
    await json(route, { cards, requestId: 'delayed-details' });
  });
  const timings: object[] = [];
  for (const width of [390, 825, 1440]) {
    await page.setViewportSize({ width, height: width === 825 ? 1905 : 900 });
    for (const reload of [false, true]) {
      detailsGate = new Promise<void>((resolve) => {
        releaseDetails = resolve;
      });
      const started = Date.now();
      try {
        if (reload) await page.reload();
        else await page.goto('/matches/live');
        const images = page.locator('.live-deck-fan__card img');
        await expect(images).toHaveCount(5);
        await images.evaluateAll(async (elements) => {
          await Promise.all(
            elements.map((element) => (element as HTMLImageElement).decode()),
          );
        });
        expect(collectionRequests).toBeGreaterThan(0);
        await expect(
          page.locator('.live-deck-fan .card-thumbnail__button'),
        ).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: 'Find battle' }),
        ).toBeEnabled();
        await expectNoHorizontalOverflow(page);
        const sources = await images.evaluateAll((elements) =>
          elements.map((element) => (element as HTMLImageElement).currentSrc),
        );
        expect(
          sources.every((source) => /-(192|384)\.webp$/.test(source)),
        ).toBe(true);
        timings.push({
          width,
          reload,
          artworkReadyMs: Date.now() - started,
          sources,
        });
        if (!reload && width !== 825) {
          await captureScreenshot(test.info(), page, {
            animations: 'disabled',
            fullPage: true,
            path: testInfo.outputPath(`deck-artwork-pending-${width}.png`),
          });
        }
      } finally {
        releaseDetails();
      }
      await expect(
        page.locator('.live-deck-fan .card-thumbnail__button'),
      ).toHaveCount(5);
      await expect(page.locator('.live-deck-fan__card img')).toHaveCount(5);
    }
  }
  await testInfo.attach('artwork-load-timings', {
    body: JSON.stringify(timings, null, 2),
    contentType: 'application/json',
  });
});

test('renders authoritative participant and private spectator views responsively', async ({
  page,
}, testInfo) => {
  const participant = participantProjection();
  participant.self.creatures[0]!.name = 'Quillip';
  participant.self.creatures[0]!.rarity = 'rare';
  participant.opponent.activeCreature.name = 'Ciphra';
  const spectator = spectatorProjection({ currentActor: 'playerTwo' });
  spectator.playerOne.activeCreature = buildCreature(1, { name: 'Quillip' });
  spectator.playerTwo.activeCreature = buildCreature(2, { name: 'Ciphra' });
  participant.opponent.playerName = 'campus_champion_2026';
  let role: 'participant' | 'spectator' = 'participant';
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await installRealtimeFixture(page, participant, spectator);
  await routeCurrentPlayer(page);
  await page.route('**/api/v1/matches/live/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/connection-tickets')) {
      const requested = request.postDataJSON() as { role: string };
      expect(requested.role).toBe(role);
      await json(
        route,
        {
          expiresAt: '2026-09-25T12:01:00.000Z',
          protocolVersion: 1,
          requestId: 'live-browser-ticket',
          role,
          ticket: `${role}-ticket-value-with-enough-random-characters`,
          webSocketUrl: 'wss://live-browser.invalid/api/v1/realtime/live',
        },
        201,
      );
      return;
    }
    await json(route, {
      ...(role === 'participant' ? participant : spectator),
      requestId: 'live-browser-projection',
      serverTime: LIVE_SERVER_TIME,
    });
  });

  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto(`/matches/live/${LIVE_MATCH_ID}`);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Your turn', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Knowledge Strike 1/i }),
  ).toBeEnabled();
  await expect(page.locator('.battle-stage')).toHaveClass(
    /battle-stage--player/,
  );
  await expect(
    page.getByRole('heading', { name: 'Activity', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Copy private link' }),
  ).toBeVisible();
  const images = page.locator('.battle-arena .battle-creature-artwork img');
  await expect(images).toHaveCount(2);
  await images.evaluateAll(async (elements) => {
    await Promise.all(
      elements.map((element) => (element as HTMLImageElement).decode()),
    );
  });
  await expect(page.locator('.combatant--player .card-frame')).toHaveClass(
    /card-frame--rare/,
  );
  await expect(page.locator('.battle-resolution')).toBeVisible();
  for (const creature of ['Quillip', 'Ciphra']) {
    const picture = page
      .getByRole('button', { name: `View ${creature} details` })
      .first();
    await picture.click();
    await expect(page.getByRole('dialog', { name: creature })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picture).toBeFocused();
  }
  await expectNoHorizontalOverflow(page);
  await captureScreenshot(test.info(), page, {
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('live-participant-1440.png'),
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(`/matches/live/${LIVE_MATCH_ID}`);
  await expect(page.locator('.battle-stage__turn')).toBeVisible();
  const actionPanel = page.locator('.battle-actions');
  const firstAction = page.getByRole('button', {
    name: /Knowledge Strike 1/i,
  });
  await expect(firstAction).toBeVisible();
  const firstActionBox = await firstAction.boundingBox();
  const stageBox = await page.locator('.battle-stage').boundingBox();
  const actionPanelBox = await actionPanel.boundingBox();
  expect(firstActionBox).not.toBeNull();
  expect(stageBox).not.toBeNull();
  expect(actionPanelBox).not.toBeNull();
  expect(stageBox!.y + stageBox!.height).toBeLessThanOrEqual(actionPanelBox!.y);
  await expect(page.locator('.primary-navigation--mobile')).toBeHidden();

  await page.evaluate(() => window.scrollTo(0, 560));
  const stickyGeometry = await page.evaluate(() => {
    const status = document.querySelector('.battle-status-dock');
    const actions = document.querySelector('.battle-actions');
    if (!(status instanceof HTMLElement) || !(actions instanceof HTMLElement))
      return null;
    const actionsBox = actions.getBoundingClientRect();
    return {
      actionPosition: getComputedStyle(actions).position,
      actionsBottom: actionsBox.bottom,
      stageTop:
        document.querySelector('.battle-stage')?.getBoundingClientRect().top ??
        Number.POSITIVE_INFINITY,
      statusPosition: getComputedStyle(status).position,
    };
  });
  expect(stickyGeometry).not.toBeNull();
  expect(stickyGeometry!.statusPosition).toBe('sticky');
  expect(stickyGeometry!.actionPosition).toBe('relative');
  expect(stickyGeometry!.actionsBottom).toBeGreaterThan(
    stickyGeometry!.stageTop,
  );

  const forfeit = page.getByRole('button', { name: 'Forfeit battle' });
  await forfeit.click();
  const dialog = page.getByRole('alertdialog', {
    name: 'Forfeit this battle?',
  });
  await expect(dialog).toBeVisible();
  const dialogGeometry = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const actions = document.querySelector('.battle-actions');
    return {
      bottom: box.bottom,
      dialogZ: Number.parseInt(
        getComputedStyle(element.parentElement ?? element).zIndex || '0',
        10,
      ),
      left: box.left,
      right: box.right,
      top: box.top,
      trayZ:
        actions instanceof HTMLElement
          ? Number.parseInt(getComputedStyle(actions).zIndex || '0', 10)
          : 0,
    };
  });
  expect(dialogGeometry.left).toBeGreaterThanOrEqual(0);
  expect(dialogGeometry.top).toBeGreaterThanOrEqual(0);
  expect(dialogGeometry.right).toBeLessThanOrEqual(390);
  expect(dialogGeometry.bottom).toBeLessThanOrEqual(844);
  expect(dialogGeometry.dialogZ).toBeGreaterThan(dialogGeometry.trayZ);
  await dialog.getByRole('button', { name: 'Keep playing' }).click();
  await expect(forfeit).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 0));
  await captureScreenshot(test.info(), page, {
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('live-participant-390.png'),
  });

  // A 720 CSS-pixel viewport is the reflow equivalent of a 1440px window at
  // 200% browser zoom.
  await page.setViewportSize({ height: 900, width: 720 });
  await page.goto(`/matches/live/${LIVE_MATCH_ID}`);
  await expect(firstAction).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await captureScreenshot(test.info(), page, {
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('live-participant-200-percent-reflow.png'),
  });

  role = 'spectator';
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(`/matches/live/${LIVE_MATCH_ID}`);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Watching — read only', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Watching live — read only' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Knowledge Strike/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Forfeit battle' }),
  ).toHaveCount(0);
  await expect(page.locator('.battle-stage')).toHaveClass(/battle-stage--cpu/);
  await expect(page.getByText('Live presence')).toBeVisible();
  await expect(
    page.getByText(/private snapshot|activeCreatureId/i),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await captureScreenshot(test.info(), page, {
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('live-spectator-390.png'),
  });
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus-visible')).toHaveCount(1);

  expect(runtimeErrors).toEqual([]);
});

test('shows opening and replacement cards and enables server-approved selections', async ({
  page,
}, testInfo) => {
  const base = participantProjection();
  const creatures = [
    buildCreature(1, { name: 'Quillip', rarity: 'rare' }),
    buildCreature(3, { name: 'Ciphra' }),
    buildCreature(4, { name: 'Axiomar', rarity: 'legendary' }),
  ];
  let match = participantProjection();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await routeCurrentPlayer(page);
  await page.route('**/api/v1/matches/live/**', async (route) => {
    if (
      new URL(route.request().url()).pathname.endsWith('/connection-tickets')
    ) {
      return json(
        route,
        {
          expiresAt: '2026-09-25T12:01:00.000Z',
          protocolVersion: 1,
          role: 'participant',
          ticket: 'participant-ticket-value-with-enough-random-characters',
          webSocketUrl: 'wss://live-browser.invalid/api/v1/realtime/live',
          requestId: 'selection-ticket',
        },
        201,
      );
    }
    return json(route, {
      ...match,
      requestId: 'selection-projection',
      serverTime: LIVE_SERVER_TIME,
    });
  });
  for (const phase of ['initial_selection', 'replacement'] as const) {
    match = participantProjection({
      phase,
      currentActor: phase === 'initial_selection' ? null : 'self',
      self: { ...base.self, creatures, activeCreatureId: null },
      opponent: {
        ...base.opponent,
        activeCreature:
          phase === 'initial_selection'
            ? null
            : buildCreature(2, { name: 'Ciphra' }),
      },
      history: [],
      lastAction: null,
      legalActions: creatures.map((creature) => ({
        type:
          phase === 'initial_selection'
            ? 'select_initial_creature'
            : 'select_replacement',
        creatureId: creature.id,
      })),
    });
    for (const width of [390, 1280]) {
      await installRealtimeFixture(page, match, spectatorProjection());
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/matches/live/${LIVE_MATCH_ID}`);
      await expect(page.getByText('Connected', { exact: true })).toBeVisible();
      const choices = page.getByRole('list', { name: 'Your Creature choices' });
      await expect(choices.locator('img')).toHaveCount(3);
      await choices.locator('img').evaluateAll(async (elements) => {
        await Promise.all(
          elements.map((element) => (element as HTMLImageElement).decode()),
        );
      });
      const clippedRarity = await choices
        .locator('.card-frame__rarity')
        .evaluateAll((elements) =>
          elements
            .filter((element) => element.scrollWidth > element.clientWidth)
            .map((element) => ({
              label: element.textContent,
              width: element.clientWidth,
              contentWidth: element.scrollWidth,
            })),
        );
      expect(clippedRarity).toEqual([]);
      const choice = choices.getByRole('button').first();
      await expect(choice).toBeEnabled();
      await expectNoHorizontalOverflow(page);
      await captureScreenshot(testInfo, page, {
        animations: 'disabled',
        fullPage: true,
        path: testInfo.outputPath(`live-${phase}-${width}.png`),
      });
      await choice.click();
      await expect(choice).toBeDisabled();
      await expect(
        page.getByText('Submitting action', { exact: true }),
      ).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
});

test('aligns live connection recovery actions on mobile and desktop', async ({
  page,
}, testInfo) => {
  await page.clock.install();
  await routeCurrentPlayer(page);
  let reads = 0;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/v1/matches/live/**', async (route) => {
    reads++;
    await route.abort('internetdisconnected');
  });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/matches/live/${LIVE_MATCH_ID}`);
    await expect(
      page.getByRole('heading', { name: 'Connecting…' }),
    ).toBeVisible();
    await page.clock.fastForward(8_100);
    const actions = page.locator('.page-loading-state .state-message__actions');
    await expect(actions).toHaveCount(1);
    await expect(actions.locator('.button')).toHaveCount(3);
    await expect(
      actions.getByRole('link', { name: 'Return to Live Ranked' }),
    ).toHaveAttribute('href', '/matches/live');
    const boxes = await actions.locator('.button').evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    if (width === 390) {
      expect(
        Math.max(...boxes.map((box) => box.x)) -
          Math.min(...boxes.map((box) => box.x)),
      ).toBeLessThan(1);
      expect(
        Math.max(...boxes.map((box) => box.width)) -
          Math.min(...boxes.map((box) => box.width)),
      ).toBeLessThan(1);
      expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height);
    } else {
      expect(
        Math.max(...boxes.map((box) => box.y)) -
          Math.min(...boxes.map((box) => box.y)),
      ).toBeLessThan(1);
    }
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(testInfo, page, {
      animations: 'disabled',
      fullPage: true,
      path: testInfo.outputPath(`live-connecting-${width}.png`),
    });
    const retry = actions.getByRole('button', { name: 'Try again' });
    await retry.focus();
    await expect(retry).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      actions.getByRole('link', { name: 'Return to Live Ranked' }),
    ).toBeFocused();
    const before = reads;
    await retry.click();
    await expect.poll(() => reads).toBeGreaterThan(before);
  }
  expect(errors).toEqual([]);
});

test('returns to the live lobby from a completed report and the battle hub', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await routeReadyLobby(page, [buildSavedDeck({ isSelected: true })]);
  await page.route('**/api/v1/matches/live/**', (route) =>
    json(route, {
      ...participantProjection({
        status: 'completed',
        phase: 'completed',
        currentActor: null,
        turnDeadline: null,
        legalActions: [],
        outcome: 'win',
        completionReason: 'abandonment_forfeit',
        completedAt: LIVE_SERVER_TIME,
      }),
      requestId: 'completed-navigation',
      serverTime: LIVE_SERVER_TIME,
    }),
  );
  await page.route('**/api/v1/ranked/matches/*/settlement', (route) =>
    json(route, rankedSettlement()),
  );
  await page.route('**/api/v1/matches/cpu/entry**', (route) =>
    json(route, {
      activeMatch: null,
      selectedDeck: null,
      requestId: 'navigation-entry',
    }),
  );
  await page.route('**/api/v1/matches/history**', (route) =>
    json(route, { matches: [], requestId: 'navigation-history' }),
  );

  await page.goto(`/matches/live/${LIVE_MATCH_ID}`);
  await page.getByRole('link', { name: 'Back to Live Ranked' }).click();
  await expect(page).toHaveURL('/matches/live');
  await expect(page.getByRole('button', { name: 'Find battle' })).toBeEnabled();

  await page.goto('/matches');
  await page.getByRole('link', { name: 'Play or watch live' }).click();
  await expect(page).toHaveURL('/matches/live');
  await expect(page.getByRole('button', { name: 'Find battle' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('presents compact completed live reports with rating recovery', async ({
  page,
}, testInfo) => {
  const base = participantProjection();
  base.self.creatures[0]!.name = 'Quillip';
  base.self.creatures[0]!.rarity = 'rare';
  base.opponent.activeCreature.name = 'Ciphra';
  const completed = participantProjection({
    ...base,
    status: 'completed',
    phase: 'completed',
    currentActor: null,
    turnDeadline: null,
    legalActions: [],
    outcome: 'win',
    completionReason: 'abandonment_forfeit',
    completedAt: LIVE_SERVER_TIME,
    consecutiveTimeouts: { self: 2, opponent: 3 },
    history: [
      ...base.history,
      { type: 'abandonment_forfeit', loser: 'playerTwo', winner: 'playerOne' },
    ],
  });
  let match: Record<string, unknown> = completed;
  let settlement = rankedSettlement({
    ratingBefore: 1000,
    ratingAfter: 1020,
    appliedDelta: 20,
    territory: null,
  });
  let ratingUnavailable = false;
  let ratingReads = 0;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await routeCurrentPlayer(page);
  await page.route('**/api/v1/matches/live/**', (route) =>
    json(route, {
      ...match,
      requestId: 'completed-report',
      serverTime: LIVE_SERVER_TIME,
    }),
  );
  await page.route('**/api/v1/ranked/matches/*/settlement', (route) => {
    ratingReads++;
    return json(
      route,
      ratingUnavailable
        ? { code: 'UNAVAILABLE', title: 'Unavailable', status: 503 }
        : settlement,
      ratingUnavailable ? 503 : 200,
    );
  });
  for (const outcome of ['win', 'loss'] as const) {
    match = {
      ...completed,
      outcome,
      completionReason:
        outcome === 'win' ? 'abandonment_forfeit' : 'voluntary_resignation',
      history: [
        ...base.history,
        outcome === 'win'
          ? {
              type: 'abandonment_forfeit',
              loser: 'playerTwo',
              winner: 'playerOne',
            }
          : {
              type: 'voluntary_resignation',
              loser: 'playerOne',
              winner: 'playerTwo',
            },
      ],
    };
    settlement = rankedSettlement({
      outcome,
      ratingBefore: 1000,
      ratingAfter: outcome === 'win' ? 1020 : 980,
      appliedDelta: outcome === 'win' ? 20 : -20,
      territory: null,
    });
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/matches/live/${LIVE_MATCH_ID}`);
      await expect(
        page.getByRole('heading', {
          name: outcome === 'win' ? 'Victory' : 'Defeat',
          exact: true,
        }),
      ).toBeFocused();
      const rating = page.getByRole('region', { name: 'Season rating' });
      await expect(rating).toContainText(outcome === 'win' ? '+20' : '-20');
      await expect(
        page.getByRole('link', { name: 'Back to Live Ranked' }),
      ).toBeInViewport();
      await expect(
        page.locator(
          '.battle-status-dock, .live-timeout-summary, .battle-header',
        ),
      ).toHaveCount(0);
      await expect(page.getByText('No territory was contested.')).toHaveCount(
        0,
      );
      const images = page.locator('.battle-report__portrait img');
      await expect(images).toHaveCount(2);
      await images.evaluateAll(async (elements) => {
        await Promise.all(
          elements.map((element) => (element as HTMLImageElement).decode()),
        );
      });
      const history = page.locator('.battle-report__disclosure');
      await expect(history).not.toHaveAttribute('open', '');
      await expectNoHorizontalOverflow(page);
      await captureScreenshot(testInfo, page, {
        fullPage: true,
        animations: 'disabled',
        path: testInfo.outputPath(`live-result-${outcome}-${width}.png`),
      });
      await history.locator('summary').focus();
      await page.keyboard.press('Enter');
      await expect(history).toHaveAttribute('open', '');
      await expect(history).toContainText(
        outcome === 'win'
          ? 'lost after three consecutive missed decisions'
          : 'You forfeited the battle.',
      );
      const picture = page.getByRole('button', {
        name: 'View Quillip details',
      });
      await picture.click();
      await expect(page.getByRole('dialog', { name: 'Quillip' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(picture).toBeFocused();
    }
  }
  match = completed;
  await page.setViewportSize({ width: 390, height: 900 });
  settlement = rankedSettlement({
    status: 'pending',
    ratingBefore: null,
    ratingAfter: null,
    appliedDelta: null,
    settledAt: null,
    territory: null,
  });
  await page.goto(`/matches/live/${LIVE_MATCH_ID}`);
  await expect(
    page.getByText('Rating pending.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.live-result-rating')).toHaveCount(0);
  await captureScreenshot(testInfo, page, {
    fullPage: true,
    path: testInfo.outputPath('live-result-pending-390.png'),
  });
  ratingUnavailable = true;
  await page.reload();
  const retry = page.getByRole('button', { name: 'Retry rating' });
  await expect(retry).toBeVisible();
  await captureScreenshot(testInfo, page, {
    fullPage: true,
    path: testInfo.outputPath('live-result-rating-error-390.png'),
  });
  settlement = rankedSettlement();
  ratingUnavailable = false;
  await retry.click();
  await expect(page.getByText('+30 influence.', { exact: true })).toBeVisible();
  const readsBeforeSpectator = ratingReads;
  match = spectatorProjection({
    status: 'completed',
    phase: 'completed',
    currentActor: null,
    turnDeadline: null,
    winner: 'playerTwo',
    completedAt: LIVE_SERVER_TIME,
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Battle complete', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Season rating' }),
  ).toHaveCount(0);
  expect(ratingReads).toBe(readsBeforeSpectator);
  await expectNoHorizontalOverflow(page);
  await captureScreenshot(testInfo, page, {
    fullPage: true,
    path: testInfo.outputPath('live-result-spectator-390.png'),
  });
  expect(errors).toEqual([]);
});

test('explains unavailable ranked entry at mobile and desktop widths', async ({
  page,
}, testInfo) => {
  const selectedDeck = buildSavedDeck({
    isSelected: true,
    name: 'Braamfontein Set',
  });
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await routeCurrentPlayer(page);
  await page.route('**/api/v1/decks', (route) =>
    json(route, {
      decks: [selectedDeck],
      requestId: 'live-browser-decks',
    }),
  );
  await page.route('**/api/v1/ranked/queue', (route) =>
    json(route, queueState({ seasonId: null })),
  );
  await page.route('**/api/v1/ranked/seasons/current', (route) =>
    json(route, { season: null }),
  );
  await page.route('**/api/v1/ranked/me', (route) =>
    json(
      route,
      rankedProfile({
        season: null,
        rating: null,
        wins: 0,
        losses: 0,
        settledMatchCount: 0,
        placementMatchesRemaining: 5,
        provisional: true,
      }),
    ),
  );
  await page.route('**/api/v1/ranked/standings**', (route) =>
    json(
      route,
      {
        code: 'RANKED_SEASON_UNAVAILABLE',
        detail: 'No ranked season is active.',
      },
      409,
    ),
  );
  await page.route('**/api/v1/territory/zones', (route) =>
    json(route, { zones: [] }),
  );

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ height: width === 825 ? 1905 : 900, width });
    await page.goto('/matches/live');
    await expect(
      page.getByText('No active season. Check back later.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Find battle' })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('heading', { name: 'Ranked season' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Refresh season' }),
    ).toBeEnabled();
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(test.info(), page, {
      animations: 'disabled',
      fullPage: true,
      path: testInfo.outputPath(`live-lobby-unavailable-${width}.png`),
    });
    await page.getByRole('tab', { name: 'Standings' }).click();
    await expect(page.getByText('Standings return next season')).toBeVisible();
    await page.getByRole('tab', { name: 'Watch' }).click();
    const mobileNavigation = page.locator('.primary-navigation--mobile');
    if (width < 1200) {
      await expect(mobileNavigation).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const navigationBox = await mobileNavigation.boundingBox();
      const finalActionBox = await page
        .getByRole('button', { name: 'Watch', exact: true })
        .boundingBox();
      expect(navigationBox).not.toBeNull();
      expect(finalActionBox).not.toBeNull();
      expect(finalActionBox!.y + finalActionBox!.height).toBeLessThanOrEqual(
        navigationBox!.y,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
    } else {
      await expect(mobileNavigation).toBeHidden();
    }
    await expectNoHorizontalOverflow(page);
  }

  expect(runtimeErrors).toEqual([]);
});

test('presents the active season, personal record, standings, and territory option responsively', async ({
  page,
}, testInfo) => {
  const selectedDeck = buildSavedDeck({
    isSelected: true,
    name: 'Braamfontein Set',
  });
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        clearWatch: () => undefined,
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: {
              accuracy: 18,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              latitude: -26.1919,
              longitude: 28.0301,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: Date.now(),
            toJSON: () => ({}),
          }),
        watchPosition: () => 1,
      },
    });
  });

  await routeCurrentPlayer(page);
  await page.route('**/api/v1/decks', (route) =>
    json(route, { decks: [selectedDeck], requestId: 'live-browser-decks' }),
  );
  await page.route('**/api/v1/ranked/queue', (route) =>
    json(route, queueState()),
  );
  await page.route('**/api/v1/ranked/seasons/current', (route) =>
    json(route, { season: rankedSeason() }),
  );
  await page.route('**/api/v1/ranked/me', (route) =>
    json(route, rankedProfile()),
  );
  await page.route('**/api/v1/ranked/standings**', (route) =>
    json(route, rankedStandings()),
  );
  await page.route('**/api/v1/territory/zones', (route) =>
    json(route, { zones: territoryZones() }),
  );

  for (const width of [1440, 768, 390, 825]) {
    await page.setViewportSize({ height: width === 825 ? 1905 : 900, width });
    await page.goto('/matches/live');
    await expect(page.getByRole('tab')).toHaveCount(3);
    for (const tab of await page.getByRole('tab').all()) {
      await expect(tab.locator('svg')).toBeVisible();
    }
    await expect(
      page.getByRole('heading', { name: 'Braamfontein Test Season' }),
    ).toBeVisible();
    await expect(page.locator('.ranked-season-strip__rating')).toContainText(
      /1\s248/,
    );
    await expect(
      page.getByRole('heading', { name: 'Season standings' }),
    ).toHaveCount(0);
    await expect(page.getByText('7 wins · 3 losses')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Change deck' }),
    ).toHaveAttribute('href', '/collection/decks');
    await expect(page.locator('.live-deck-fan__card')).toHaveCount(
      selectedDeck.cards.length,
    );
    const card = page.getByRole('button', {
      name: `View ${selectedDeck.cards[2]!.name} details, card 3`,
    });
    await expect(card).toBeVisible();
    if (width === 1440) {
      await card.hover();
      await expect(card).toHaveAttribute('data-hovered', '');
      await expect
        .poll(() =>
          card.evaluate((element) =>
            Number.parseFloat(
              getComputedStyle(element).getPropertyValue('--card-scale'),
            ),
          ),
        )
        .toBeGreaterThan(1.02);
      const firstCard = page.getByRole('button', {
        name: `View ${selectedDeck.cards[0]!.name} details, card 1`,
      });
      await firstCard.hover();
      await expect(firstCard).toHaveAttribute('data-hovered', '');
      await expect(card.locator('..')).toHaveCSS('z-index', '3');
      await expect(firstCard.locator('..')).toHaveCSS('z-index', '10');
      const cards = page.locator('.live-deck-fan .card-thumbnail__button');
      const centers = await cards.evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height / 2,
          };
        }),
      );
      for (const index of [1, 2, 3, 4, 3, 2, 1, 0, 2]) {
        await page.mouse.move(centers[index]!.x, centers[index]!.y, {
          steps: 2,
        });
      }
      await expect(card).toHaveAttribute('data-hovered', '');
      await expect(card.locator('..')).toHaveCSS('z-index', '10');
      const motion = await card.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          x: Number.parseFloat(style.getPropertyValue('--card-tilt-x')),
          y: Number.parseFloat(style.getPropertyValue('--card-tilt-y')),
          scale: Number.parseFloat(style.getPropertyValue('--card-scale')),
        };
      });
      expect(Math.abs(motion.x)).toBeLessThanOrEqual(10.01);
      expect(Math.abs(motion.y)).toBeLessThanOrEqual(12.01);
      expect(motion.scale).toBeLessThanOrEqual(1.056);
      await captureScreenshot(test.info(), page, {
        path: testInfo.outputPath('live-lobby-fast-hover.png'),
      });
      // Record the entire return to rest: outgoing cards must not linger in
      // raised layers and reshuffle the fan when their animation completes.
      await page.mouse.move(0, 0);
      const settling = await cards.evaluateAll(async (elements) => {
        const frames: {
          layers: string[];
          promotions: string[];
          moving: boolean;
        }[] = [];
        const start = performance.now();
        do {
          frames.push({
            layers: elements.map(
              (element) => getComputedStyle(element.parentElement!).zIndex,
            ),
            promotions: elements.map(
              (element) => getComputedStyle(element).willChange,
            ),
            moving: elements.some((element) =>
              element.hasAttribute('data-tilting'),
            ),
          });
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
        } while (performance.now() - start < 650);
        return frames;
      });
      expect(settling.some((frame) => frame.moving)).toBe(true);
      expect(settling.at(-1)!.moving).toBe(false);
      for (const frame of settling) {
        expect(frame.layers).toEqual(['1', '2', '3', '2', '1']);
        expect(frame.promotions).toEqual(Array(5).fill('auto'));
      }
    }
    await card.click();
    await expect(
      page.getByRole('dialog', { name: selectedDeck.cards[2]!.name }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Moves' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(card).toBeFocused();
    await page.getByRole('tab', { name: 'Play' }).focus();
    await page.mouse.move(0, 0);
    await expect
      .poll(() =>
        page
          .locator('.live-deck-fan__card img')
          .evaluateAll((cards) =>
            cards.every(
              (card) =>
                card instanceof HTMLImageElement &&
                card.complete &&
                card.naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    await page.evaluate(() => document.fonts.ready);
    if (width === 825) {
      await captureScreenshot(test.info(), page, {
        animations: 'disabled',
        fullPage: true,
        path: testInfo.outputPath('live-lobby-hero-825.png'),
      });
    }
    const rankedAction = page.getByRole('button', {
      name: 'Find battle',
    });
    await expect(rankedAction).toBeInViewport();
    const actionBox = await rankedAction.boundingBox();
    const navBox = await page
      .locator('.primary-navigation--mobile')
      .boundingBox();
    expect(actionBox).not.toBeNull();
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(
      navBox?.y ?? 900,
    );
    const territoryContest = page.getByRole('checkbox', {
      name: /contest territory/i,
    });
    await expect(territoryContest).not.toBeChecked();
    await territoryContest.click();
    await expect(territoryContest).toBeChecked();
    await expect(
      page.getByText(/uses your location when you search/i),
    ).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Territory' })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: 'Find territory battle' }).click();
    await expect(page.getByText('Contesting Library Lawns')).toBeVisible();
    const rankedRules = page.locator('.live-ranked-rules summary');
    await rankedRules.click();
    await expect(
      page.getByText(/forfeit or miss three turns in a row/i),
    ).toBeVisible();
    await rankedRules.click();
    if (width === 390) {
      const findBattleBox = await page
        .getByRole('button', { name: 'Find territory battle' })
        .boundingBox();
      const mobileNavigationBox = await page
        .locator('.primary-navigation--mobile')
        .boundingBox();
      expect(findBattleBox).not.toBeNull();
      expect(mobileNavigationBox).not.toBeNull();
      expect(findBattleBox!.y + findBattleBox!.height).toBeLessThanOrEqual(
        mobileNavigationBox!.y,
      );
    }
    if (width < 1200) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const rulesBox = await rankedRules.boundingBox();
      const navigationBox = await page
        .locator('.primary-navigation--mobile')
        .boundingBox();
      expect(rulesBox).not.toBeNull();
      expect(navigationBox).not.toBeNull();
      expect(rulesBox!.y + rulesBox!.height).toBeLessThanOrEqual(
        navigationBox!.y,
      );
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(test.info(), page, {
      animations: 'disabled',
      fullPage: true,
      path: testInfo.outputPath(`live-lobby-active-${width}.png`),
    });
    await page.getByRole('tab', { name: 'Standings' }).click();
    await expect(
      page.getByRole('heading', { name: 'Season standings' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\?tab=standings$/u);
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(test.info(), page, {
      animations: 'disabled',
      fullPage: true,
      path: testInfo.outputPath(`live-lobby-standings-${width}.png`),
    });
    await page.getByRole('tab', { name: 'Watch' }).click();
    await expect(
      page.getByRole('textbox', { name: 'Private battle link or ID' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(test.info(), page, {
      animations: 'disabled',
      fullPage: true,
      path: testInfo.outputPath(`live-lobby-watch-${width}.png`),
    });
  }

  expect(runtimeErrors).toEqual([]);
});

test('keeps matchmaking controls visible when changing lobby views', async ({
  page,
}, testInfo) => {
  let status: 'searching' | 'proposed' = 'searching';
  await routeCurrentPlayer(page);
  await page.route('**/api/v1/decks', (route) =>
    json(route, {
      decks: [buildSavedDeck({ isSelected: true })],
      requestId: 'live-browser-decks',
    }),
  );
  await page.route('**/api/v1/ranked/seasons/current', (route) =>
    json(route, { season: rankedSeason() }),
  );
  await page.route('**/api/v1/ranked/me', (route) =>
    json(route, rankedProfile()),
  );
  await page.route('**/api/v1/ranked/standings**', (route) =>
    json(route, rankedStandings()),
  );
  await page.route('**/api/v1/territory/zones', (route) =>
    json(route, { zones: territoryZones() }),
  );
  await page.route('**/api/v1/ranked/queue', (route) =>
    json(
      route,
      queueState(
        status === 'searching'
          ? {
              status,
              queueEntryId: '71000000-0000-4000-8000-000000000001',
              joinedAt: LIVE_SERVER_TIME,
              leaseExpiresAt: '2026-09-25T12:00:30.000Z',
              searchRange: 100,
            }
          : {
              status,
              proposalId: '71000000-0000-4000-8000-000000000002',
              acceptanceDeadline: '2026-09-25T12:00:20.000Z',
            },
      ),
    ),
  );
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const nextStatus of ['searching', 'proposed'] as const) {
      status = nextStatus;
      await page.goto('/matches/live');
      const heading = page.getByRole('heading', {
        name: status === 'searching' ? 'Finding opponent…' : 'Opponent found',
      });
      await expect(heading).toBeVisible();
      if (status === 'proposed') await expect(heading).toBeFocused();
      await page
        .locator('.live-deck-fan__card img')
        .evaluateAll(async (images) => {
          await Promise.all(
            images.map((image) => (image as HTMLImageElement).decode()),
          );
        });
      for (const card of await page.locator('.live-deck-fan__card').all()) {
        const cardBox = await card.boundingBox();
        expect(cardBox).not.toBeNull();
        expect(cardBox!.height).toBeGreaterThan(cardBox!.width);
      }

      await captureScreenshot(test.info(), page, {
        animations: 'disabled',
        fullPage: true,
        path: testInfo.outputPath(`live-lobby-${status}-${width}.png`),
      });
      await page.getByRole('tab', { name: 'Watch' }).click();
      await expect(heading).toBeVisible();
      const action = page.getByRole('button', {
        name: status === 'searching' ? 'Cancel search' : 'Accept',
      });
      await expect(action).toBeEnabled();
      await expect(action).toBeInViewport();
      const actionBox = await action.boundingBox();
      const navBox = await page
        .locator('.primary-navigation--mobile')
        .boundingBox();
      expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(
        navBox?.y ?? 900,
      );
      await expectNoHorizontalOverflow(page);
      await captureScreenshot(test.info(), page, {
        animations: 'disabled',
        fullPage: true,
        path: testInfo.outputPath(`live-lobby-${status}-watch-${width}.png`),
      });
    }
  }
});

async function installRealtimeFixture(
  page: Page,
  participant: Record<string, unknown>,
  spectator: Record<string, unknown>,
) {
  await page.addInitScript(
    ({ participantMatch, serverTime, spectatorMatch }) => {
      class FixtureWebSocket {
        static readonly CONNECTING = 0;
        static readonly OPEN = 1;
        static readonly CLOSING = 2;
        static readonly CLOSED = 3;

        readonly url: string;
        readyState = FixtureWebSocket.OPEN;
        onclose: ((event: CloseEvent) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;

        constructor(url: string) {
          this.url = url;
          const match = url.includes('spectator-ticket')
            ? spectatorMatch
            : participantMatch;
          window.setTimeout(() => {
            this.onmessage?.(
              new MessageEvent('message', {
                data: JSON.stringify({
                  connectionId: '62000000-0000-4000-8000-000000000001',
                  match,
                  protocolVersion: 1,
                  role: match.role,
                  serverTime,
                  type: 'connection.ready',
                  version: match.version,
                }),
              }),
            );
          }, 50);
        }

        close() {
          this.readyState = FixtureWebSocket.CLOSED;
        }

        send() {}
      }

      Object.defineProperty(window, 'WebSocket', {
        configurable: true,
        value: FixtureWebSocket,
      });
    },
    {
      participantMatch: participant,
      serverTime: LIVE_SERVER_TIME,
      spectatorMatch: spectator,
    },
  );
}

async function routeCurrentPlayer(page: Page) {
  await page.route('**/api/v1/auth/me', (route) =>
    json(route, {
      connectionStrategy: 'auth0',
      id: '00000000-0000-4000-8000-000000009001',
      lifecycleStatus: 'active',
      playerName: 'live_reader',
      playerNameSetupRequired: false,
      requestId: 'live-browser-player',
      role: 'player',
    }),
  );
}

async function routeReadyLobby(
  page: Page,
  decks: ReturnType<typeof buildSavedDeck>[],
) {
  await routeCurrentPlayer(page);
  await page.route('**/api/v1/decks', (route) =>
    json(route, { decks, requestId: 'lobby-decks' }),
  );
  await page.route('**/api/v1/ranked/queue', (route) =>
    json(route, queueState()),
  );
  await page.route('**/api/v1/ranked/seasons/current', (route) =>
    json(route, { season: rankedSeason() }),
  );
  await page.route('**/api/v1/ranked/me', (route) =>
    json(route, rankedProfile()),
  );
  await page.route('**/api/v1/ranked/standings**', (route) =>
    json(route, rankedStandings()),
  );
  await page.route('**/api/v1/territory/zones', (route) =>
    json(route, { zones: territoryZones() }),
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function json(route: Route, body: object, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

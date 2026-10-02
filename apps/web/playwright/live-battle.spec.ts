import { expect, test, type Page, type Route } from '@playwright/test';

import {
  LIVE_MATCH_ID,
  LIVE_SERVER_TIME,
  participantProjection,
  queueState,
  rankedProfile,
  rankedSeason,
  rankedStandings,
  spectatorProjection,
  territoryZones,
} from '../tests/fixtures/live';
import { buildSavedDeck } from '../tests/fixtures/decks';
import { buildStarterCards } from '../tests/fixtures/cards';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(LIVE_SERVER_TIME));
  const artwork = [
    'quillip',
    'ciphra',
    'axiomar',
    'field-kit',
    'grand-strategy',
  ];
  await page.route('**/api/v1/cards/collection', (route) =>
    json(route, {
      cards: buildStarterCards().map((card, index) => ({
        ...card,
        imageUrl: `/cards/${artwork[index]}.webp`,
      })),
      requestId: 'live-deck-cards',
    }),
  );
});

test('renders authoritative participant and private spectator views responsively', async ({
  page,
}, testInfo) => {
  const participant = participantProjection();
  const spectator = spectatorProjection({ currentActor: 'playerTwo' });
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
    page.getByRole('heading', { name: 'Battle activity' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Copy private link' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('live-participant-1440.png'),
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(`/matches/live/${LIVE_MATCH_ID}`);
  await expect(
    page.getByRole('heading', { name: /Live against campus_champion_2026/ }),
  ).toBeVisible();
  const actionPanel = page.locator('.battle-actions');
  const firstAction = page.getByRole('button', {
    name: /Knowledge Strike 1/i,
  });
  await expect(firstAction).toBeInViewport();
  const firstActionBox = await firstAction.boundingBox();
  const stageBox = await page.locator('.battle-stage').boundingBox();
  const actionPanelBox = await actionPanel.boundingBox();
  expect(firstActionBox).not.toBeNull();
  expect(stageBox).not.toBeNull();
  expect(actionPanelBox).not.toBeNull();
  expect(firstActionBox!.y + firstActionBox!.height).toBeLessThanOrEqual(844);
  expect(actionPanelBox!.y).toBeLessThan(stageBox!.y);
  expect(actionPanelBox!.y + actionPanelBox!.height).toBeLessThanOrEqual(
    stageBox!.y,
  );
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
  expect(stickyGeometry!.actionsBottom).toBeLessThanOrEqual(
    stickyGeometry!.stageTop,
  );

  const resignCard = page.locator('.pvp-resign-card');
  await resignCard.locator('summary').click();
  await resignCard.getByRole('button', { name: 'Forfeit battle' }).click();
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
  await expect(
    resignCard.getByRole('button', { name: 'Forfeit battle' }),
  ).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('live-participant-390.png'),
  });

  // A 720 CSS-pixel viewport is the reflow equivalent of a 1440px window at
  // 200% browser zoom.
  await page.setViewportSize({ height: 900, width: 720 });
  await page.goto(`/matches/live/${LIVE_MATCH_ID}`);
  await expect(firstAction).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
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
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('live-spectator-390.png'),
  });
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus-visible')).toHaveCount(1);

  expect(runtimeErrors).toEqual([]);
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
      page.getByText('No active season. Ranked play returns next season.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Find ranked battle' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Ranked season' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Check season again' }),
    ).toBeEnabled();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      animations: 'disabled',
      fullPage: true,
      path: testInfo.outputPath(`live-lobby-unavailable-${width}.png`),
    });
    await page.getByRole('tab', { name: 'Standings' }).click();
    await expect(
      page.getByText('Standings open with the next season'),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'Watch' }).click();
    const mobileNavigation = page.locator('.primary-navigation--mobile');
    if (width < 1200) {
      await expect(mobileNavigation).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const navigationBox = await mobileNavigation.boundingBox();
      const finalActionBox = await page
        .getByRole('button', { name: 'Watch match' })
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
      await page.screenshot({
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
      await page.screenshot({
        animations: 'disabled',
        fullPage: true,
        path: testInfo.outputPath('live-lobby-hero-825.png'),
      });
    }
    const rankedAction = page.getByRole('button', {
      name: 'Find ranked battle',
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
      name: /contest my current territory/i,
    });
    await expect(territoryContest).not.toBeChecked();
    await territoryContest.click();
    await expect(territoryContest).toBeChecked();
    await expect(
      page.getByText(/your location finds your territory on the map/i),
    ).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Territory' })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: 'Find territory battle' }).click();
    await expect(page.getByText('Contesting Library Lawns')).toBeVisible();
    const rankedRules = page.locator('.live-ranked-rules summary');
    await rankedRules.click();
    await expect(
      page.getByText(/forfeiting or missing three turns in a row/i),
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
    await page.screenshot({
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
    await page.screenshot({
      animations: 'disabled',
      fullPage: true,
      path: testInfo.outputPath(`live-lobby-standings-${width}.png`),
    });
    await page.getByRole('tab', { name: 'Watch' }).click();
    await expect(
      page.getByRole('heading', { name: 'Watch a private match' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
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
        name:
          status === 'searching'
            ? 'Searching for an opponent'
            : 'Opponent found',
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

      await page.screenshot({
        animations: 'disabled',
        fullPage: true,
        path: testInfo.outputPath(`live-lobby-${status}-${width}.png`),
      });
      await page.getByRole('tab', { name: 'Watch' }).click();
      await expect(heading).toBeVisible();
      const action = page.getByRole('button', {
        name: status === 'searching' ? 'Leave search' : 'Accept match',
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
      await page.screenshot({
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

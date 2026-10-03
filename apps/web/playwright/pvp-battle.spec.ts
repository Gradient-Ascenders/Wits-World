import { expect, test, type Page, type Route } from '@playwright/test';
import path from 'node:path';

import { buildSavedDeck } from '../tests/fixtures/decks';
import {
  activePvpSummary,
  pvpHistorySummary,
  pvpInvitation,
  pvpMatch,
} from '../tests/fixtures/pvp';
import { uuid } from '../tests/fixtures/matches';

const screenshotsDirectory = path.resolve(
  process.cwd(),
  '../../.pr-screenshots/issue-228',
);

test.beforeEach(async ({ page }) => {
  // Keep the authoritative fixture deadline in the future without pausing UI timers.
  await page.clock.setFixedTime(new Date('2026-09-05T09:00:00.000Z'));
});

test('centres Player Battles in the shared page loading layout', async ({
  page,
}) => {
  let releaseLoad!: () => void;
  const loadGate = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });

  await routeCurrentPlayer(page);
  await page.route('**/api/v1/decks', async (route) => {
    await loadGate;
    await json(route, { decks: [], requestId: 'pvp-loading-decks' });
  });
  await page.route(/\/api\/v1\/matches\/pvp(?:\/|\?|$)/, async (route) => {
    await loadGate;
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/invitations')) {
      await json(route, {
        invitations: [],
        nextCursor: null,
        requestId: 'pvp-loading-invitations',
      });
      return;
    }
    await json(route, {
      matches: [],
      nextCursor: null,
      requestId: 'pvp-loading-matches',
    });
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/matches/pvp');
  await expect(
    page.getByRole('heading', { name: 'Loading Player Battles' }),
  ).toBeVisible();
  await expect(page.locator('.page-loading-state')).toContainText(
    'Checking battles and challenges…',
  );
  await expect(
    page.getByRole('navigation', { name: 'Player battle sections' }),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expectPageLoaderCentred(page);

  await page.setViewportSize({ height: 1024, width: 768 });
  await expectNoHorizontalOverflow(page);
  await expectPageLoaderCentred(page);

  await page.setViewportSize({ height: 800, width: 1440 });
  await expectNoHorizontalOverflow(page);
  await expectPageLoaderCentred(page);

  releaseLoad();
  await expect(
    page.getByRole('button', { name: 'Close challenge' }),
  ).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
    await expect(page.getByLabel('Player name')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: path.join(screenshotsDirectory, `${width}-pvp-empty-full.png`),
    });
  }
});

async function expectPageLoaderCentred(page: Page) {
  const centres = await page
    .locator('#main-content')
    .evaluate((main, loaderSelector) => {
      const loader = main.querySelector(loaderSelector);
      if (!(loader instanceof HTMLElement)) return null;
      const mainBox = main.getBoundingClientRect();
      const loaderBox = loader.getBoundingClientRect();
      const style = getComputedStyle(main);
      const contentTop = mainBox.top + Number.parseFloat(style.paddingTop);
      const contentBottom =
        mainBox.bottom - Number.parseFloat(style.paddingBottom);
      return {
        horizontalDelta:
          loaderBox.left +
          loaderBox.width / 2 -
          (mainBox.left + mainBox.width / 2),
        verticalDelta:
          loaderBox.top +
          loaderBox.height / 2 -
          (contentTop + contentBottom) / 2,
      };
    }, '.page-loading-state');

  expect(centres).not.toBeNull();
  expect(Math.abs(centres!.horizontalDelta)).toBeLessThan(2);
  expect(Math.abs(centres!.verticalDelta)).toBeLessThan(2);
}

test('renders the tabbed player battle lobby and authoritative battle', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  let actionRequests = 0;
  let cancellationRequests = 0;
  let forfeitRequests = 0;
  const deck = buildSavedDeck({ isSelected: true });
  const invitation = pvpInvitation();
  let sentInvitation = pvpInvitation({
    direction: 'outgoing',
    invitationId: uuid(2102),
  });
  const match = pvpMatch();
  let currentMatch = match;

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) =>
    failedRequests.push(`${request.method()} ${request.url()}`),
  );

  await routeCurrentPlayer(page);
  await page.route('**/api/v1/events', (route) =>
    json(route, { events: [], requestId: 'pvp-browser-events' }),
  );
  await page.route('**/api/v1/decks', (route) =>
    json(route, { decks: [deck], requestId: 'pvp-browser-decks' }),
  );
  await page.route(/\/api\/v1\/matches\/pvp(?:\/|\?|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname.endsWith('/matches/pvp/players')) {
      await json(route, {
        playerName: url.searchParams.get('playerName'),
        requestId: 'pvp-browser-player-search',
      });
      return;
    }
    if (pathname.endsWith('/matches/pvp/invitations')) {
      await json(route, {
        invitations:
          url.searchParams.get('direction') === 'incoming'
            ? [invitation]
            : [sentInvitation],
        nextCursor: null,
        requestId: 'pvp-browser-invitations',
      });
      return;
    }
    if (
      pathname.endsWith(
        `/matches/pvp/invitations/${sentInvitation.invitationId}/cancel`,
      )
    ) {
      cancellationRequests += 1;
      expect(request.headers().accept).toContain(
        'application/vnd.wits-world.pvp.v5+json',
      );
      expect(request.postDataJSON()).toEqual({
        expectedVersion: 0,
        submissionId: expect.any(String),
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      sentInvitation = pvpInvitation({
        canCancel: false,
        direction: 'outgoing',
        invitationId: sentInvitation.invitationId,
        respondedAt: '2026-09-05T08:20:00.000Z',
        status: 'cancelled',
        version: 1,
      });
      await json(route, {
        invitation: sentInvitation,
        requestId: 'pvp-browser-cancellation',
      });
      return;
    }
    if (pathname.endsWith(`/matches/pvp/${match.matchId}/actions`)) {
      actionRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
      const result = {
        action: currentMatch.legalActions[0]!,
        defeatedCreatureId: null,
        effects: [
          {
            amount: 12,
            damageMultiplier: 1,
            effectId: uuid(2190),
            effectType: 'damage' as const,
            modifier: null,
            targetCreatureId: currentMatch.state.opponent.activeCreature!.id,
            targetSide: 'opponent' as const,
          },
        ],
        side: 'self' as const,
        turnEnded: true,
        winner: null,
      };
      currentMatch = {
        ...currentMatch,
        currentActor: 'opponent',
        history: [
          ...currentMatch.history,
          {
            createdAt: '2026-09-05T08:35:00.000Z',
            result,
            sequence: 4,
            turnNumber: currentMatch.state.turnNumber,
          },
        ],
        lastAction: result,
        legalActions: [],
        state: {
          ...currentMatch.state,
          opponent: {
            ...currentMatch.state.opponent,
            activeCreature: {
              ...currentMatch.state.opponent.activeCreature!,
              currentHp:
                currentMatch.state.opponent.activeCreature!.currentHp - 12,
            },
          },
        },
        updatedAt: '2026-09-05T08:35:00.000Z',
        version: 4,
      };
      await json(route, {
        ...currentMatch,
        requestId: 'pvp-browser-action',
      });
      return;
    }
    if (pathname.endsWith(`/matches/pvp/${match.matchId}/resign`)) {
      forfeitRequests += 1;
      expect(request.headers().accept).toContain(
        'application/vnd.wits-world.pvp.v5+json',
      );
      expect(request.headers()['x-wits-pvp-contract-version']).toBeUndefined();
      expect(request.postDataJSON()).toEqual({
        expectedVersion: 4,
        submissionId: expect.any(String),
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      currentMatch = {
        ...currentMatch,
        canResign: false,
        completedAt: '2026-09-05T08:40:00.000Z',
        completionReason: 'voluntary_resignation',
        currentActor: null,
        legalActions: [],
        outcome: 'loss',
        state: {
          ...currentMatch.state,
          phase: 'completed',
        },
        status: 'completed',
        turnDeadline: null,
        updatedAt: '2026-09-05T08:40:00.000Z',
        version: 5,
      };
      await json(route, {
        ...currentMatch,
        requestId: 'pvp-browser-forfeit',
      });
      return;
    }
    if (pathname.endsWith(`/matches/pvp/${match.matchId}`)) {
      await json(route, {
        ...currentMatch,
        requestId: 'pvp-browser-match',
      });
      return;
    }
    if (pathname.endsWith('/matches/pvp/history')) {
      await json(route, {
        matches: [pvpHistorySummary()],
        nextCursor: null,
        requestId: 'pvp-browser-history',
      });
      return;
    }
    if (pathname.endsWith('/matches/pvp')) {
      await json(route, {
        matches: [activePvpSummary(match)],
        nextCursor: null,
        requestId: 'pvp-browser-active',
      });
      return;
    }
    await route.abort('failed');
  });

  for (const viewport of [
    { height: 844, label: '390', width: 390 },
    { height: 1024, label: '768', width: 768 },
    { height: 800, label: '1440', width: 1440 },
  ]) {
    const previousCancellationRequests = cancellationRequests;
    sentInvitation = pvpInvitation({
      direction: 'outgoing',
      invitationId: uuid(2102),
    });
    await page.setViewportSize(viewport);
    await page.goto('/matches/pvp');
    await expect(
      page.getByRole('heading', { name: 'Player Battles', exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('list', { name: 'Active player battles' })
        .getByText('wits_wanderer'),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Back to Battles' }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Active 1' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      page.getByRole('heading', { name: 'Active Player Battles' }),
    ).toBeVisible();
    for (const tab of await page.getByRole('tab').all()) {
      await expect(tab.locator('svg')).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
    await page.locator('.pvp-hub').screenshot({
      path: path.join(screenshotsDirectory, `${viewport.label}-pvp-hub.png`),
      style: '.skip-link, .primary-navigation { display: none !important; }',
    });
    await page.screenshot({
      fullPage: true,
      path: path.join(
        screenshotsDirectory,
        `${viewport.label}-pvp-active-full.png`,
      ),
    });

    await page.getByRole('tab', { name: 'Invitations 1' }).click();
    await page.screenshot({
      fullPage: true,
      path: path.join(
        screenshotsDirectory,
        `${viewport.label}-pvp-invitations-full.png`,
      ),
    });
    await page
      .getByRole('button', { name: 'Cancel challenge to wits_wanderer' })
      .click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    if (viewport.label === '390') {
      await page.screenshot({
        path: path.join(screenshotsDirectory, '390-cancel-confirmation.png'),
        style: '.skip-link, .primary-navigation { display: none !important; }',
      });
    }
    await page.getByRole('button', { name: 'Confirm cancellation' }).dblclick();
    await expect(page.getByText('You cancelled this challenge.')).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Cancel challenge to wits_wanderer',
      }),
    ).toHaveCount(0);
    expect(cancellationRequests).toBe(previousCancellationRequests + 1);
    await expectNoHorizontalOverflow(page);
    if (viewport.label === '390') {
      await page.locator('.pvp-hub').screenshot({
        path: path.join(screenshotsDirectory, '390-cancelled-invitation.png'),
        style: '.skip-link, .primary-navigation { display: none !important; }',
      });
    }

    if (viewport.label !== '768') {
      await page.getByRole('button', { name: 'Challenge a player' }).click();
      await expect(
        page.getByRole('heading', { name: 'New challenge' }),
      ).toBeVisible();
      await expect(
        page.getByText(/Account details stay private/i),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.getByLabel('Player name').fill('wits_wanderer');
      await page.getByRole('button', { name: 'Find player' }).click();
      await page.getByLabel('Deck').selectOption(deck.deckId);
      await page.getByLabel(new RegExp(deck.cards[0]!.name)).check();
      await expect(
        page.getByRole('button', { name: 'Send challenge' }),
      ).toBeEnabled();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        fullPage: true,
        path: path.join(
          screenshotsDirectory,
          `${viewport.label}-pvp-challenge-full.png`,
        ),
      });
      await page.locator('.pvp-hub').screenshot({
        path: path.join(
          screenshotsDirectory,
          `${viewport.label}-pvp-challenge.png`,
        ),
        style: '.skip-link, .primary-navigation { display: none !important; }',
      });
      await page.getByRole('button', { name: 'Close challenge' }).click();
    }

    await page.getByRole('tab', { name: 'History 1' }).click();
    await expect(
      page.getByRole('heading', { name: 'Recent player battles' }),
    ).toBeVisible();
    await expect(page.getByText('Won', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const history = page.getByRole('list', {
      name: 'Completed player battles',
    });
    await expect(history.getByText('Won', { exact: true })).toBeVisible();
    await expect(
      history.getByRole('link', { name: 'View battle' }),
    ).toHaveAttribute('href', `/matches/pvp/${pvpHistorySummary().matchId}`);
    await expect(
      history.getByRole('link', { name: 'View battle' }),
    ).toHaveAccessibleDescription(
      new RegExp(pvpHistorySummary().opponent.playerName),
    );
    await page.locator('.pvp-hub').screenshot({
      path: path.join(
        screenshotsDirectory,
        `${viewport.label}-pvp-history.png`,
      ),
      style: '.skip-link, .primary-navigation { display: none !important; }',
    });

    await page.getByRole('tab', { name: 'Active 1' }).click();
    await expect(
      page.getByRole('heading', { name: 'Active Player Battles' }),
    ).toBeVisible();
    await expect(page.getByText('Your turn').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    if (viewport.label === '390') {
      await page.locator('.pvp-hub').screenshot({
        path: path.join(screenshotsDirectory, '390-pvp-active.png'),
        style: '.skip-link, .primary-navigation { display: none !important; }',
      });
    }
  }

  await page.setViewportSize({ height: 844, width: 390 });
  await page.getByRole('link', { name: 'Take your turn' }).click();
  await expect(page).toHaveURL(`/matches/pvp/${match.matchId}`);
  await expect(page.getByRole('heading', { name: 'Your turn' })).toBeVisible();
  const move = page.getByRole('button', { name: /Knowledge Strike 1/ });
  await move.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(move).toBeFocused();
  expect(
    await move.evaluate((element) => element.matches(':focus-visible')),
  ).toBe(true);
  await page.getByRole('tab', { name: /^Power/ }).click();
  await expect(
    page.getByRole('button', { name: /Campus Renewal 1/ }),
  ).toBeEnabled();
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    fullPage: true,
    path: path.join(screenshotsDirectory, '390-pvp-own-turn.png'),
    style: '.skip-link, .primary-navigation { display: none !important; }',
  });

  await page.getByRole('tab', { name: /^Moves/ }).click();
  await move.dblclick();
  await expect(
    page
      .getByRole('region', { name: 'Latest battle resolution' })
      .getByText('You used Knowledge Strike 1.'),
  ).toBeVisible();
  await expect(move).toBeDisabled();
  await page.screenshot({
    fullPage: true,
    path: path.join(screenshotsDirectory, '390-pvp-resolution.png'),
    style: '.skip-link, .primary-navigation { display: none !important; }',
  });
  await expect(
    page.getByRole('heading', { name: 'Opponent’s turn' }),
  ).toBeFocused({ timeout: 10_000 });
  expect(actionRequests).toBe(1);

  await page.setViewportSize({ height: 800, width: 1440 });
  await expectNoHorizontalOverflow(page);
  await page.locator('.battle-page').screenshot({
    path: path.join(screenshotsDirectory, '1440-pvp-opponent-turn.png'),
    style: '.skip-link, .primary-navigation { display: none !important; }',
  });

  const forfeit = page.getByRole('button', { name: 'Forfeit battle' });
  await forfeit.click();
  const dialog = page.getByRole('alertdialog', {
    name: 'Forfeit this battle?',
  });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Keep playing' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(forfeit).toBeFocused();

  await forfeit.click();
  await page.screenshot({
    path: path.join(screenshotsDirectory, '1440-forfeit-confirmation.png'),
    style: '.skip-link, .primary-navigation { display: none !important; }',
  });
  await page.getByRole('button', { name: 'Confirm forfeit' }).click();
  await expect(
    page.getByRole('button', { name: 'Forfeiting…' }),
  ).toBeDisabled();
  await expect(
    page.getByRole('heading', { name: 'Battle complete' }),
  ).toBeFocused();
  await expect(
    page.getByText('You forfeited this battle.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Forfeit battle' }),
  ).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('voluntary_resignation');
  await page.locator('.battle-page').screenshot({
    path: path.join(screenshotsDirectory, '1440-own-forfeit-result.png'),
    style: '.skip-link, .primary-navigation { display: none !important; }',
  });
  expect(forfeitRequests).toBe(1);

  expect(consoleErrors.filter((message) => !message.includes('404'))).toEqual(
    [],
  );
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('keeps bench, forced replacement and results readable across battle layouts', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await routeCurrentPlayer(page);
  const futureDeadline = '2026-09-06T08:00:00.000Z';
  let current = pvpMatch({
    turnDeadline: futureDeadline,
  });
  let submissions = 0;
  await page.route('**/api/v1/matches/pvp/**', async (route) => {
    if (route.request().method() === 'POST') {
      submissions += 1;
      const body = route.request().postDataJSON();
      expect(body.action).toEqual(current.legalActions[0]);
      const next = pvpMatch({
        turnDeadline: futureDeadline,
        version: 4,
      });
      next.state.self.activeCreatureId = current.state.self.creatures[1]!.id;
      current = next;
    }
    await json(route, { ...current, requestId: 'battle-layout' });
  });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
    current = pvpMatch({
      turnDeadline: futureDeadline,
    });
    current.state.self.creatures[1]!.rarity = 'rare';
    await page.goto(`/matches/pvp/${current.matchId}`);
    await expect(
      page.getByRole('heading', { name: 'Your turn', exact: true }),
    ).toBeVisible();
    const bench = page.locator('.battle-bench');
    await bench.locator('summary').click();
    await expect(bench.getByRole('listitem')).toHaveCount(2);
    await expect(bench).toContainText('HP 100 / 100');
    const detailsButtons = bench.getByRole('button', {
      name: /^View .* details$/,
    });
    await expect(detailsButtons).toHaveCount(2);
    const submissionsBeforeInspection = submissions;
    await detailsButtons.first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/battle-creature-dialog--rare/);
    await expect(dialog).toContainText('Rare Creature · Wit affinity');
    if (width === 1440) {
      await page.screenshot({
        path: path.join(screenshotsDirectory, '1440-rare-creature-details.png'),
      });
    }
    await page.getByRole('button', { name: 'Close Creature details' }).click();
    expect(submissions).toBe(submissionsBeforeInspection);
    await expectNoHorizontalOverflow(page);
    await page.locator('.battle-page').screenshot({
      path: path.join(screenshotsDirectory, `${width}-bench.png`),
    });
    await bench.locator('summary').click();

    current.state.phase = 'replacement';
    current.state.self.creatures[0]!.currentHp = 0;
    current.state.self.creatures[0]!.defeated = true;
    current.legalActions = [
      {
        type: 'select_replacement',
        creatureId: current.state.self.creatures[1]!.id,
      },
    ];
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Replacement required', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(
      page.locator(
        '.creature-choice-control:enabled:not([aria-disabled="true"])',
      ),
    ).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
    await page.locator('.battle-page').screenshot({
      path: path.join(screenshotsDirectory, `${width}-pvp-replacement.png`),
    });
    await page
      .locator('.creature-choice-control:enabled:not([aria-disabled="true"])')
      .focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Your turn', exact: true }),
    ).toBeFocused();

    for (const outcome of ['win', 'loss'] as const) {
      current = pvpMatch({ status: 'completed', outcome });
      await page.reload();
      await expect(page.locator('.completed-match')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Forfeit battle' }),
      ).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      await page.locator('.battle-page').screenshot({
        path: path.join(screenshotsDirectory, `${width}-pvp-${outcome}.png`),
      });
    }
  }
  expect(submissions).toBe(3);
  expect(errors).toEqual([]);
});

async function routeCurrentPlayer(page: Page) {
  await page.route('**/api/v1/auth/me', (route) =>
    json(route, {
      connectionStrategy: 'auth0',
      id: '00000000-0000-4000-8000-000000009001',
      lifecycleStatus: 'active',
      playerName: 'battle_reader',
      playerNameSetupRequired: false,
      requestId: 'pvp-browser-player',
      role: 'player',
    }),
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

async function json(route: Route, body: object, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

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
  '../../.pr-screenshots/issue-181',
);

test('keeps the Player Battles loading shell compact', async ({ page }) => {
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
    page.getByRole('heading', { name: 'Player Battles' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Loading player battles…');
  await expect(
    page.getByRole('navigation', { name: 'Player battle sections' }),
  ).toContainText('InvitationsActiveHistory');
  await expect(page.getByText(/PvP hub|Loading your PvP/i)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ height: 800, width: 1280 });
  await expectNoHorizontalOverflow(page);
  const loadingBox = await page.locator('.pvp-loading').boundingBox();
  expect(loadingBox).not.toBeNull();
  expect(loadingBox!.height).toBeLessThan(160);

  releaseLoad();
  await expect(
    page.getByRole('button', { name: 'Challenge a player' }),
  ).toBeVisible();
});

test('renders the tabbed player battle lobby and authoritative battle', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  let actionRequests = 0;
  let cancellationRequests = 0;
  let resignationRequests = 0;
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
        'application/vnd.wits-world.pvp.v3+json',
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
      currentMatch = {
        ...currentMatch,
        currentActor: 'opponent',
        legalActions: [],
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
      resignationRequests += 1;
      expect(request.headers().accept).toContain(
        'application/vnd.wits-world.pvp.v2+json',
      );
      expect(request.headers()['x-wits-pvp-contract-version']).toBeUndefined();
      expect(request.postDataJSON()).toEqual({
        expectedVersion: 4,
        submissionId: expect.any(String),
      });
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
        requestId: 'pvp-browser-resignation',
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
    { height: 800, label: '1280', width: 1280 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/matches/pvp');
    await expect(
      page.getByRole('heading', { name: 'Player Battles' }),
    ).toBeVisible();
    await expect(page.getByText('wits_wanderer').first()).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Back to Battles' }),
    ).toBeVisible();
    await expect(
      page.getByRole('tab', { name: 'Invitations 1' }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('heading', { name: 'Your matches' }),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page.locator('.pvp-hub').screenshot({
      path: path.join(screenshotsDirectory, `${viewport.label}-pvp-hub.png`),
      style: '.skip-link, .primary-navigation { display: none !important; }',
    });

    if (viewport.label === '390') {
      await page
        .getByRole('button', { name: 'Cancel challenge to wits_wanderer' })
        .dblclick();
      await expect(
        page.getByText('You cancelled this invitation.'),
      ).toBeVisible();
      await expect(
        page.getByRole('button', {
          name: 'Cancel challenge to wits_wanderer',
        }),
      ).toHaveCount(0);
      expect(cancellationRequests).toBe(1);
      await expectNoHorizontalOverflow(page);

      await page.getByRole('button', { name: 'Challenge a player' }).click();
      await expect(
        page.getByRole('heading', { name: 'Challenge a player' }),
      ).toBeVisible();
      await expect(
        page.getByText(
          /account details, location, decks, and activity stay private/i,
        ),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.locator('.pvp-hub').screenshot({
        path: path.join(screenshotsDirectory, '390-pvp-challenge.png'),
        style: '.skip-link, .primary-navigation { display: none !important; }',
      });
      await page.getByRole('button', { name: 'Close challenge' }).click();
    }

    await page.getByRole('tab', { name: 'History 1' }).click();
    await expect(
      page.getByRole('heading', { name: 'Recent player battles' }),
    ).toBeVisible();
    await expect(page.getByText('Won')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    if (viewport.label === '1280') {
      await page.locator('.pvp-hub').screenshot({
        path: path.join(screenshotsDirectory, '1280-pvp-history.png'),
        style: '.skip-link, .primary-navigation { display: none !important; }',
      });
    }

    await page.getByRole('tab', { name: 'Active 1' }).click();
    await expect(
      page.getByRole('heading', { name: 'Your matches' }),
    ).toBeVisible();
    await expect(page.getByText('Your turn')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    if (viewport.label === '390') {
      await page.locator('.pvp-hub').screenshot({
        path: path.join(screenshotsDirectory, '390-pvp-active.png'),
        style: '.skip-link, .primary-navigation { display: none !important; }',
      });
    }
  }

  await page.setViewportSize({ height: 844, width: 390 });
  await page.getByRole('link', { name: 'Continue' }).click();
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
  await page.locator('.battle-page').screenshot({
    path: path.join(screenshotsDirectory, '390-pvp-own-turn.png'),
    style: '.skip-link, .primary-navigation { display: none !important; }',
  });

  await page.getByRole('tab', { name: /^Moves/ }).click();
  await move.dblclick();
  await expect(
    page.getByRole('heading', { name: 'Opponent’s turn' }),
  ).toBeFocused();
  expect(actionRequests).toBe(1);

  await page.setViewportSize({ height: 800, width: 1280 });
  await expectNoHorizontalOverflow(page);
  await page.locator('.battle-page').screenshot({
    path: path.join(screenshotsDirectory, '1280-pvp-opponent-turn.png'),
    style: '.skip-link, .primary-navigation { display: none !important; }',
  });

  const resign = page.getByRole('button', { name: 'Resign match' });
  await resign.click();
  const dialog = page.getByRole('alertdialog', { name: 'Resign this match?' });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Keep playing' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(resign).toBeFocused();

  await resign.click();
  await page.getByRole('button', { name: 'Resign and lose' }).click();
  await expect(
    page.getByRole('heading', { name: 'Battle complete' }),
  ).toBeFocused();
  await expect(page.getByText('You resigned the match.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resign match' })).toHaveCount(
    0,
  );
  expect(resignationRequests).toBe(1);

  expect(consoleErrors.filter((message) => !message.includes('404'))).toEqual(
    [],
  );
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
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

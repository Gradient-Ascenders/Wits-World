import { expect, test, type Page, type Route } from '@playwright/test';

import {
  LIVE_MATCH_ID,
  LIVE_SERVER_TIME,
  participantProjection,
  queueState,
  spectatorProjection,
} from '../tests/fixtures/live';
import { buildSavedDeck } from '../tests/fixtures/decks';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(LIVE_SERVER_TIME));
});

test('renders authoritative participant and private spectator views responsively', async ({
  page,
}, testInfo) => {
  const participant = participantProjection();
  const spectator = spectatorProjection();
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
    page.getByText('YOUR TURN', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Knowledge Strike 1/i }),
  ).toBeEnabled();
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

  role = 'spectator';
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(`/matches/live/${LIVE_MATCH_ID}`);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(
    page.getByText('WATCHING — READ ONLY', { exact: true }).first(),
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
  await expect(page.getByText('Live presence')).toBeVisible();
  await expect(
    page.getByText(/private snapshot|activeCreatureId/i),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus-visible')).toHaveCount(1);
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('live-spectator-390.png'),
  });

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

  for (const width of [390, 1440]) {
    await page.setViewportSize({ height: 900, width });
    await page.goto('/matches/live');
    await expect(
      page.getByText(
        'No ranked season is active. Live matchmaking will open after an operator starts one.',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Find live match' }),
    ).toBeDisabled();
    await expect(page.getByText('No active season')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Check season again' }),
    ).toBeEnabled();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      animations: 'disabled',
      fullPage: true,
      path: testInfo.outputPath(`live-lobby-unavailable-${width}.png`),
    });
  }

  expect(runtimeErrors).toEqual([]);
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

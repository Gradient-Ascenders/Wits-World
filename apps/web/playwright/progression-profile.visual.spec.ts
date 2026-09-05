import { expect, test, type Page, type Route } from '@playwright/test';

import {
  buildProgressionProfile,
  buildStandingEntry,
} from '../tests/fixtures/progression';

const API_BASE_URL = 'http://127.0.0.1:3999/api/v1';
const PLAYER_NAME = 'the-exceptionally-long-senate-house-campus-explorer-name';

test('renders and operates the progression route across mobile and desktop', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const runtimeErrors: string[] = [];
  const currentPlayer = buildStandingEntry({
    currentStreak: 3,
    isCurrentPlayer: true,
    longestStreak: 7,
    playerName: PLAYER_NAME,
    points: 1240,
    rank: 21,
  });

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await page.route(`${API_BASE_URL}/auth/me`, (route) =>
    json(route, {
      connectionStrategy: 'auth0',
      id: '17300000-0000-4000-8000-000000000001',
      lifecycleStatus: 'active',
      playerName: PLAYER_NAME,
      playerNameSetupRequired: false,
      requestId: 'progression-browser-player',
      role: 'player',
    }),
  );
  await page.route(`${API_BASE_URL}/progression/me`, (route) =>
    json(route, {
      ...buildProgressionProfile({ playerName: PLAYER_NAME }),
      requestId: 'progression-browser-profile',
    }),
  );
  await page.route(`${API_BASE_URL}/progression/standings?*`, (route) => {
    const query = new URL(route.request().url()).searchParams;
    const pageNumber = Number(query.get('page'));
    const period = query.get('period');

    if (period === 'monthly') {
      return json(route, {
        currentPlayer: { ...currentPlayer, points: 40, rank: 5 },
        entries: [
          buildStandingEntry({
            playerName: 'monthly-leader',
            points: 80,
            rank: 1,
          }),
          { ...currentPlayer, points: 40, rank: 5 },
        ],
        month: query.get('month'),
        pagination: {
          page: 1,
          pageSize: 20,
          totalPages: 1,
          totalPlayers: 5,
        },
        period: 'monthly',
        requestId: 'progression-browser-monthly',
      });
    }

    return json(route, {
      currentPlayer,
      entries:
        pageNumber === 2
          ? [currentPlayer]
          : [
              buildStandingEntry({
                playerName:
                  'another-exceptionally-long-player-name-for-wrapping',
                points: 1900,
                rank: 1,
              }),
              buildStandingEntry({
                playerName: null,
                points: 900,
                rank: 7,
              }),
            ],
      month: null,
      pagination: {
        page: pageNumber,
        pageSize: 20,
        totalPages: 2,
        totalPlayers: 21,
      },
      period: 'all_time',
      requestId: `progression-browser-page-${pageNumber}`,
    });
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/profile');

  await expect(page.getByRole('heading', { name: PLAYER_NAME })).toBeVisible();
  await expect(page.getByText('Your Wits Quest progression')).toBeVisible();
  await expect(page.getByText('Deleted player')).toBeVisible();
  await expect(page.getByLabel('Your standing')).toContainText('#21');
  await expect(
    page.getByRole('complementary', { name: 'Your standing' }),
  ).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Player standings' }).getByText('You'),
  ).toHaveCount(0);
  await expect(page.locator('.standings-section__heading')).toContainText(
    'You are #21',
  );
  await expect(
    page.getByLabel('Your standing').getByText('You', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('progressbar', { name: '3 of 5' })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    fullPage: true,
    path: '/tmp/issue-173-profile-mobile.png',
  });

  const next = page.getByRole('button', { name: 'Next' });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Campus standings' }),
  ).toBeFocused();
  await expect(page.locator('.standing--current-player')).toHaveAttribute(
    'aria-current',
    'true',
  );

  const monthly = page.getByRole('button', { name: 'This month' });
  await monthly.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Campus standings' }),
  ).toBeFocused();
  await expect(monthly).toHaveAttribute('aria-pressed', 'true');

  await page.setViewportSize({ height: 800, width: 1280 });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Campus standings' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(
    page.locator('.primary-navigation').getByRole('link', { name: 'Profile' }),
  ).toHaveCount(0);
  const accountTrigger = page.getByRole('button', {
    name: `${PLAYER_NAME}, account menu`,
  });
  await expect(accountTrigger).toHaveAttribute('aria-current', 'page');
  await accountTrigger.click();
  await expect(
    page.getByRole('link', {
      name: 'Player profile, Progress and achievements',
    }),
  ).toHaveAttribute('aria-current', 'page');
  await page.screenshot({
    fullPage: true,
    path: '/tmp/issue-173-profile-desktop.png',
  });

  expect(consoleErrors).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

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

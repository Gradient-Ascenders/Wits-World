import { expect, test, type Page } from '@playwright/test';

const apiBaseUrl = 'http://127.0.0.1:3001/api/v1';
const playerId = '6fe7dc26-cdea-4275-a2df-861724137cbc';

test('renders and restores the authoritative player name without exposing email', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const runtimeErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await mockCurrentPlayer(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  await expect(page).toHaveTitle('Wits World');
  await expect(page.getByText('Signed in as sprint1-player')).toBeVisible();
  await expect(page.getByText(/player@example\.test/i)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: /player name/i })).toHaveCount(
    0,
  );

  await page.reload();
  await expect(page.getByText('Signed in as sprint1-player')).toBeVisible();

  await page.setViewportSize({ width: 768, height: 844 });
  const tabletHeader = await page.locator('.site-header__inner').boundingBox();
  expect(tabletHeader?.height).toBeLessThanOrEqual(80);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Signed in as sprint1-player')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByText(/player@example\.test/i)).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/player@example\.test/i)).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('onboards a Google player once and resumes the protected route', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const runtimeErrors: string[] = [];
  let playerName: string | null = null;

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await page.route(`${apiBaseUrl}/auth/me`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      status: 200,
      body: JSON.stringify({
        connectionStrategy: 'google-oauth2',
        id: playerId,
        lifecycleStatus: 'active',
        playerName,
        playerNameSetupRequired: playerName === null,
        requestId: 'google-player-name-playwright',
        role: 'player',
      }),
    });
  });
  await page.route(`${apiBaseUrl}/auth/me/player-name`, async (route) => {
    const body = route.request().postDataJSON() as { playerName: string };
    playerName = body.playerName;
    await route.fulfill({
      contentType: 'application/json',
      status: 200,
      body: JSON.stringify({
        connectionStrategy: 'google-oauth2',
        id: playerId,
        lifecycleStatus: 'active',
        playerName,
        playerNameSetupRequired: false,
        requestId: 'google-player-name-saved',
        role: 'player',
      }),
    });
  });
  await page.route(`${apiBaseUrl}/events`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      status: 200,
      body: JSON.stringify({ events: [], requestId: 'events-after-setup' }),
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/explore');
  await expect(
    page.getByRole('heading', { name: 'Choose your Player Name' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Explore the campus map' }),
  ).toHaveCount(0);
  await expect(page.getByText(/player@example\.test/i)).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Choose your Player Name' }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('textbox', { name: 'Player Name' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });

  await page
    .getByRole('textbox', { name: 'Player Name' })
    .fill('google_player');
  await page.getByRole('button', { name: 'Enter Wits World' }).click();
  await expect(
    page.getByRole('heading', { name: 'Explore the campus map' }),
  ).toBeVisible();
  await expect(page.getByText('Signed in as google_player')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Signed in as google_player')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Explore the campus map' }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Signed in as google_player')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByText(/player@example\.test/i)).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

async function mockCurrentPlayer(page: Page) {
  await page.route(`${apiBaseUrl}/auth/me`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      status: 200,
      body: JSON.stringify({
        connectionStrategy: 'auth0',
        id: playerId,
        lifecycleStatus: 'active',
        playerName: 'sprint1-player',
        playerNameSetupRequired: false,
        requestId: 'account-player-name-playwright',
        role: 'player',
      }),
    });
  });
}

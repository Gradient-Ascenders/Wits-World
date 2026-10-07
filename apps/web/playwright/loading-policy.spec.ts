import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { buildStarterCards } from '../tests/fixtures/cards';
import { buildSavedDeck } from '../tests/fixtures/decks';

const playerId = '00000000-0000-4000-8000-000000000001';

async function fixture(page: Page, role = 'player', pendingIdentity = false) {
  const control = { pendingCards: true, pendingEvents: true };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) {
      if (pendingIdentity) return;
      return route.fulfill({
        json: {
          connectionStrategy: 'auth0',
          id: playerId,
          lifecycleStatus: 'active',
          playerName: 'loading_player',
          playerNameSetupRequired: false,
          requestId: 'loading-fixture',
          role,
        },
      });
    }
    if (path.endsWith('/cards/collection')) {
      if (control.pendingCards) return;
      return route.fulfill({
        json: { cards: buildStarterCards(), requestId: 'loading-fixture' },
      });
    }
    if (path.endsWith('/author/events') && control.pendingEvents) return;
    return route.fulfill({
      status: 503,
      json: { code: 'UNAVAILABLE', requestId: 'loading-fixture' },
    });
  });
  return control;
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`pending first read retains navigation and recovery at ${viewport.width}px`, async ({
    page,
  }, info) => {
    await fixture(page);
    await page.setViewportSize(viewport);
    await page.clock.install();
    await page.goto('/collection');
    await expect(
      page.getByRole('heading', { name: 'Loading your cards' }),
    ).toBeVisible();
    await page.clock.fastForward(8_100);
    const home = page.getByRole('link', { name: 'Return home', exact: true });
    await expect(home).toBeVisible();
    await expect(page.locator('.startup-screen')).toHaveCount(0);
    await expect(
      page.getByText('Loading Wits World', { exact: true }),
    ).toHaveCount(0);
    await capture(page, info, `slow-collection-${viewport.width}`);
    await home.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('heading', { name: 'Wits World', exact: true }),
    ).toBeVisible();
  });
}

for (const width of [390, 1440]) {
  test(`stalled CPU preparation keeps battle modes usable at ${width}px`, async ({
    page,
  }, info) => {
    await fixture(page);
    let holdCpu = true;
    await page.route('**/api/v1/matches/cpu/entry', (route) => {
      if (holdCpu) return;
      return route.fulfill({
        status: 404,
        json: { code: 'CPU_MATCH_NOT_FOUND', requestId: 'loading-fixture' },
      });
    });
    await page.route('**/api/v1/decks', (route) =>
      route.fulfill({
        json: {
          decks: [buildSavedDeck({ isSelected: true })],
          requestId: 'loading-fixture',
        },
      }),
    );
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install();
    await page.goto('/matches');
    const live = page.getByRole('link', { name: 'Play or watch live' });
    await expect(live).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Open player battles' }),
    ).toBeVisible();
    await expect(page.locator('.page-loading-state')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Start CPU battle' }),
    ).toHaveCount(0);
    await page.clock.fastForward(8_100);
    await capture(page, info, `matches-slow-${width}`);
    await live.focus();
    await page.clock.fastForward(12_000);
    await expect(
      page.getByRole('heading', { name: 'CPU battle could not be prepared' }),
    ).toBeVisible();
    await expect(live).toBeFocused();
    await capture(page, info, `matches-timeout-${width}`);
    holdCpu = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Start CPU battle' }),
    ).toBeEnabled();
    await expect(live).toBeVisible();
  });
}

test('stalled callback exposes escape then bounded identity failure', async ({
  page,
}, info) => {
  await fixture(page, 'player', true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  await page.goto('/collection?code=fixture&state=fixture');
  await expect(page.locator('.startup-screen')).toBeVisible();
  await page.clock.fastForward(8_100);
  await expect(
    page
      .locator('.startup-screen')
      .getByRole('link', { name: 'Open saved events' }),
  ).toBeVisible();
  await capture(page, info, 'callback-slow-mobile');
  await page.clock.fastForward(12_000);
  await expect(page.locator('.startup-screen')).toHaveCount(0);
  await expect(
    page.getByRole('heading', {
      name: 'Your player session could not be restored',
    }),
  ).toBeVisible();
  await capture(page, info, 'identity-timeout-mobile');
});

test('author region supports slow recovery and zoom without taking over the sidebar', async ({
  page,
}, info) => {
  await fixture(page, 'author');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.install();
  await page.goto('/author/events');
  await expect(
    page.getByText('Loading authored events…', { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(8_100);
  await expect(
    page.getByRole('link', { name: 'Return home', exact: true }),
  ).toBeVisible();
  await capture(page, info, 'author-slow-desktop');
  // Layout viewport equivalent to desktop at 200% browser zoom.
  // Actual browser zoom and assistive speech need manual verification.
  await page.setViewportSize({ width: 720, height: 500 });
  const home = page.getByRole('link', { name: 'Return home', exact: true });
  await home.scrollIntoViewIfNeeded();
  await home.click({ trial: true });
  await capture(page, info, 'author-slow-zoom');
});

test('a failed app entry preserves native document recovery on mobile', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/main.tsx*', (route) => route.abort());
  await page.goto('/collection');
  await expect(page.locator('#app-boot')).toHaveAttribute(
    'data-state',
    'error',
  );
  await expect(page.getByRole('status')).toHaveText(
    'Wits World could not be opened.',
  );
  await expect(
    page.getByRole('link', { name: 'Reload this page' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open saved events' }),
  ).toHaveAttribute('href', '/offline');
  await capture(page, info, 'document-module-failure-mobile');
});

test('static recovery appears even when the bootstrap script fails', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/src/bootstrap.ts*', (route) => route.abort());
  await page.goto('/collection');
  await expect(page.getByRole('status')).toHaveText('Opening Wits World…');
  const home = page.getByRole('link', { name: 'Return home', exact: true });
  // CSS owns this deadline independently of application JavaScript.
  await expect(home).toBeVisible({ timeout: 12_000 });
  await home.focus();
  await expect(home).toBeFocused();
  await capture(page, info, 'document-bootstrap-failure-mobile');
});

test('a failed destination module keeps the shell and offers recovery', async ({
  page,
}, info) => {
  await fixture(page);
  await page.route('**/src/pages/MatchEntryPage.tsx*', (route) =>
    route.abort(),
  );
  await page.goto('/matches');
  await expect(
    page.getByRole('heading', { name: 'This page could not be opened' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Return home', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('banner')).toBeVisible();
  await capture(page, info, 'module-failure');
});

test('fast identity and content skip the generic takeover and respect reduced motion', async ({
  page,
}) => {
  const control = await fixture(page);
  control.pendingCards = false;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/collection');
  await expect(
    page.getByRole('heading', { name: 'Your cards', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Loading Wits World', { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.startup-screen')).toHaveCount(0);
  await expect(page.locator('.state-loading')).toHaveCount(0);
});

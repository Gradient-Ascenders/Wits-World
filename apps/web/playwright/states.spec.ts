import { buildSavedDeck } from '../tests/fixtures/decks';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { buildStarterCards } from '../tests/fixtures/cards';

const matchId = '00000000-0000-4000-8000-000000000001';

async function fixture(page: Page, role = 'player') {
  const control = { fail: true, delay: 0 };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) {
      return route.fulfill({
        json: {
          connectionStrategy: 'auth0',
          id: matchId,
          lifecycleStatus: 'active',
          playerName: 'state_player',
          playerNameSetupRequired: false,
          requestId: 'state-fixture',
          role,
        },
      });
    }
    if (control.delay)
      await new Promise((resolve) => setTimeout(resolve, control.delay));
    if (control.fail)
      return route.fulfill({
        status: 503,
        json: {
          code: 'UNAVAILABLE',
          detail: 'SQL private diagnostic must not reach players',
          requestId: 'state-fixture',
        },
      });
    let body: object = { requestId: 'state-fixture' };
    if (path.endsWith('/cards/collection'))
      body = { ...body, cards: buildStarterCards() };
    else if (path.endsWith('/decks')) body = { ...body, decks: [] };
    else if (path.endsWith('/events')) body = { ...body, events: [] };
    await route.fulfill({ json: body });
  });
  return control;
}

async function capture(page: Page, info: TestInfo, name: string) {
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

for (const width of [390, 768, 1440]) {
  test(`loading, local failures and recovery at ${width}px`, async ({
    page,
  }, info) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    const control = await fixture(page);
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      '/collection',
      '/decks',
      '/matches',
      `/matches/${matchId}`,
      `/matches/pvp/${matchId}`,
      '/profile',
    ]) {
      control.delay = 500;
      await page.goto(route);
      await expect(page.locator('.state-skeleton').first()).toBeVisible();
      await capture(page, info, `${route.replaceAll('/', '-')}-loading`);
      await expect(page.getByRole('alert').first()).toBeVisible();
      await expect(
        page.getByText('SQL private diagnostic must not reach players'),
      ).toHaveCount(0);
      await capture(page, info, `${route.replaceAll('/', '-')}-error`);
    }
    control.fail = false;
    control.delay = 0;
    await page.goto('/decks');
    await expect(
      page.getByRole('heading', { name: 'No saved decks yet' }),
    ).toBeVisible();
    await capture(page, info, 'empty-decks');
    await page.goto('/collection');
    await page.getByRole('searchbox').fill('no matching card');
    await expect(
      page.getByRole('heading', { name: 'No cards match these filters' }),
    ).toBeVisible();
    await capture(page, info, 'collection-no-results');
    await page.goto('/author/events');
    await expect(
      page.getByRole('heading', { name: 'Author permission is required' }),
    ).toBeVisible();
    await capture(page, info, 'author-permission');
    expect(runtimeErrors).toEqual([]);
  });
}

test('event retry, map failure and permission preserve list discovery', async ({
  page,
}, info) => {
  const control = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explore?map-failure');
  await expect(page.getByText('The map could not load.')).toBeVisible();
  const events = page.getByRole('button', { name: /^Events —/ });
  if (await events.isVisible()) await events.click();
  await expect(
    page.getByText('Events are unavailable right now.'),
  ).toBeVisible();
  await capture(page, info, 'map-and-events-error');
  control.fail = false;
  control.delay = 800;
  await page.getByRole('button', { name: 'Try loading events again' }).click();
  await expect(page.getByText('Loading published events…')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Try loading events again' }),
  ).toHaveCount(0);
  await expect(
    page.getByText('No published events are available.'),
  ).toBeVisible();
  await capture(page, info, 'events-recovered-empty');
});

test('author service details stay private and disabled creation has visible guidance', async ({
  page,
}, info) => {
  await fixture(page, 'author');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/author/events');
  await expect(page.getByText('Events are unavailable.')).toBeVisible();
  await expect(
    page.getByText('SQL private diagnostic must not reach players'),
  ).toHaveCount(0);
  await expect(
    page.getByText('Load the event catalogue before creating an event.'),
  ).toBeVisible();
  await capture(page, info, 'author-error');
});

test('routine deck confirmations stay singular, dismissible and above mobile navigation', async ({
  page,
}, info) => {
  const control = await fixture(page);
  control.fail = false;
  const deck = buildSavedDeck();
  await page.route('**/api/v1/decks', (route) =>
    route.fulfill({ json: { decks: [deck], requestId: 'state-decks' } }),
  );
  await page.route('**/api/v1/decks/*/selection', (route) =>
    route.fulfill({
      json: { ...deck, isSelected: true, requestId: 'state-save' },
    }),
  );
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/decks');
    await page
      .getByRole('button', { name: 'Make active', exact: true })
      .click();
    const toast = page.locator('[data-sonner-toast]');
    await expect(toast).toHaveCount(1);
    await expect(toast).toContainText('Campus Five is now your active deck.');
    await expect(page.locator('.deck-notice')).toHaveCount(0);
    const dismiss = page.getByRole('button', { name: 'Dismiss confirmation' });
    const target = await dismiss.boundingBox();
    expect(target?.width).toBeGreaterThanOrEqual(44);
    expect(target?.height).toBeGreaterThanOrEqual(44);
    if (width < 1024) {
      await expect
        .poll(async () => {
          const notification = await toast.boundingBox();
          const navigation = await page
            .locator('.primary-navigation--mobile')
            .boundingBox();
          return notification!.y + notification!.height <= navigation!.y;
        })
        .toBe(true);
    }
    await capture(page, info, `toast-${width}`);
    await dismiss.focus();
    await page.keyboard.press('Enter');
    await expect(toast).toHaveCount(0);
  }
});

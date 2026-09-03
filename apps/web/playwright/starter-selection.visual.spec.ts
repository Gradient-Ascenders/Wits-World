import { expect, test, type Page, type Route } from '@playwright/test';

import {
  buildStarterCards,
  buildStarterOptions,
  buildUuid,
} from '../tests/fixtures/cards';

const API_BASE_URL = 'http://127.0.0.1:3999/api/v1';

test('renders and confirms the server starter flow at mobile and desktop widths', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const runtimeErrors: string[] = [];
  let submittedAffinity: unknown;

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await page.route(`${API_BASE_URL}/auth/me`, (route) =>
    json(route, {
      connectionStrategy: 'auth0',
      id: buildUuid(900),
      lifecycleStatus: 'active',
      playerName: 'starter_browser_player',
      playerNameSetupRequired: false,
      requestId: 'starter-browser-player',
      role: 'player',
    }),
  );
  await page.route(`${API_BASE_URL}/cards/collection`, (route) =>
    json(route, { cards: [], requestId: 'starter-browser-collection' }),
  );
  await page.route(`${API_BASE_URL}/cards/starter-options`, (route) =>
    json(route, {
      options: buildStarterOptions(),
      requestId: 'starter-browser-options',
    }),
  );
  await page.route(`${API_BASE_URL}/cards/starter`, async (route) => {
    submittedAffinity = route.request().postDataJSON();
    await json(
      route,
      {
        affinity: 'wit',
        cards: buildStarterCards('wit'),
        grantedAt: '2026-08-28T08:00:00.000Z',
        requestId: 'starter-browser-grant',
        starterGrantId: buildUuid(901),
      },
      201,
    );
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/collection');

  await expect(
    page.getByRole('heading', { name: 'Choose your starter affinity' }),
  ).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(3);
  await expect(
    page.getByRole('heading', { name: 'Your collection is empty' }),
  ).toHaveCount(0);
  await expect(page.locator('details[open]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  const spark = page.getByRole('radio', { name: /Spark/u });
  await spark.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: /Grit/u })).toBeChecked();
  await page.keyboard.press('ArrowLeft');
  await expect(spark).toBeChecked();

  const sparkOption = page.locator('.starter-option').filter({
    has: spark,
  });
  await sparkOption.getByText('View exact package').click();
  await expect(sparkOption.getByText('spark Creature 1')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ height: 800, width: 1280 });
  await expectNoHorizontalOverflow(page);
  const optionTops = await page
    .locator('.starter-option')
    .evaluateAll((options) =>
      options.map((option) => Math.round(option.getBoundingClientRect().top)),
    );
  expect(new Set(optionTops).size).toBe(1);

  await page.getByRole('radio', { name: /Wit/u }).check();
  await page.getByRole('button', { name: 'Review Wit choice' }).click();
  await expect(
    page.getByRole('heading', { name: 'Confirm Wit — Flexibility' }),
  ).toBeFocused();
  expect(submittedAffinity).toBeUndefined();

  await page.getByRole('button', { name: 'Confirm Wit starter' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your Wit starter set' }),
  ).toBeFocused();
  expect(submittedAffinity).toEqual({ affinity: 'wit' });
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

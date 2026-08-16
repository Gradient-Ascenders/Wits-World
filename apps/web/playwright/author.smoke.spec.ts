import { expect, test } from '@playwright/test';

const apiBaseUrl = 'http://localhost:3000/api/v1';

test('the real ordinary Player is refused before any author content request', async ({
  page,
}) => {
  const authorRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(`${apiBaseUrl}/author/`)) {
      authorRequests.push(request.url());
    }
  });

  await page.goto('/author');

  const heading = page.getByRole('heading', {
    name: 'Author permission is required',
  });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.getByRole('link', { name: 'Author' })).toHaveCount(0);
  expect(authorRequests).toEqual([]);
});

test('the author form remains keyboard-usable without map interaction at responsive widths', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.route(`${apiBaseUrl}/auth/me`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        id: '90000000-0000-4000-8000-000000000001',
        lifecycleStatus: 'active',
        requestId: 'playwright-author-role',
        role: 'author',
      },
    });
  });
  await page.route(`${apiBaseUrl}/author/cards`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { cards: [], requestId: 'playwright-cards' },
    });
  });
  await page.route(`${apiBaseUrl}/author/events`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { events: [], requestId: 'playwright-events' },
    });
  });

  await page.goto('/author');
  await expect(
    page.getByRole('heading', { name: 'Author console' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create event' }).click();

  const title = page.getByLabel('Event title');
  await expect(title).toBeVisible();
  await title.focus();
  await page.keyboard.type('Keyboard-authored event');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Description (optional)')).toBeFocused();

  await page.getByLabel('Starts at').fill('2026-09-01T08:00');
  await page.getByRole('button', { name: 'Create draft event' }).click();
  await expect(page.getByText('Enter a valid end time.')).toBeVisible();

  const startsAtBox = await page.getByLabel('Starts at').boundingBox();
  const endsAtBox = await page.getByLabel('Ends at').boundingBox();
  expect(startsAtBox).not.toBeNull();
  expect(endsAtBox).not.toBeNull();
  expect(startsAtBox!.y).toBeCloseTo(endsAtBox!.y, 0);

  for (const viewport of [
    { height: 800, width: 360 },
    { height: 844, width: 390 },
    { height: 1024, width: 768 },
    { height: 800, width: 1280 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expect(title).toBeVisible();
    await expect(page.getByLabel('Latitude')).toBeVisible();
    await expect(page.getByLabel('Longitude')).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`author-${viewport.width}.png`),
    });
  }

  expect(consoleErrors).toEqual([]);
});

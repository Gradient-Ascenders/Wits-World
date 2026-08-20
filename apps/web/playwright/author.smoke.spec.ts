import { expect, test, type BrowserContext } from '@playwright/test';

const apiBaseUrl = 'http://localhost:3000/api/v1';
const playerBindingKey = 'wits-world.authenticated-player-id';
const uuidPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

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
  context,
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  const playerId = await readBoundPlayerId(context);
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.route(`${apiBaseUrl}/auth/me`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        id: playerId,
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

async function readBoundPlayerId(context: BrowserContext): Promise<string> {
  const storageState = await context.storageState();
  const playerId = storageState.origins
    .find(({ origin }) => origin === 'http://localhost:5173')
    ?.localStorage.find(({ name }) => name === playerBindingKey)?.value;

  if (!playerId || !uuidPattern.test(playerId)) {
    throw new Error('The authenticated local player binding was unavailable.');
  }

  return playerId;
}

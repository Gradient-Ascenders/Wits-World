import { expect, test } from '@playwright/test';

const apiBaseUrl = 'http://localhost:3000/api/v1';
const retirementEventId = '10000000-0000-4000-8000-000000000001';
const retirementChallengeId = '20000000-0000-4000-8000-000000000001';

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

test('an Author retires the event before its challenge and sees both states persist', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  let event = retirementEvent('published');
  let challenge = retirementChallenge('published');

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
      json: { events: [event], requestId: 'playwright-events' },
    });
  });
  await page.route(
    `${apiBaseUrl}/author/events/${retirementEventId}/retire`,
    async (route) => {
      event = retirementEvent('retired');
      await route.fulfill({
        contentType: 'application/json',
        json: { event, requestId: 'playwright-event-retire' },
      });
    },
  );
  await page.route(
    `${apiBaseUrl}/author/events/${retirementEventId}/challenges`,
    async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: { challenges: [challenge], requestId: 'playwright-challenges' },
      });
    },
  );
  await page.route(
    `${apiBaseUrl}/author/challenges/${retirementChallengeId}/questions`,
    async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: { questions: [], requestId: 'playwright-questions' },
      });
    },
  );
  await page.route(
    `${apiBaseUrl}/author/challenges/${retirementChallengeId}/retire`,
    async (route) => {
      challenge = retirementChallenge('retired');
      await route.fulfill({
        contentType: 'application/json',
        json: { challenge, requestId: 'playwright-challenge-retire' },
      });
    },
  );

  await page.goto('/author');
  const retireChallenge = page.getByRole('button', {
    name: 'Retire challenge',
  });
  await expect(retireChallenge).toBeDisabled();
  await expect(retireChallenge).toHaveAccessibleDescription(
    'Retire the event before retiring its published challenge.',
  );

  await page.getByRole('button', { name: 'Retire event' }).click();
  await page
    .getByRole('alert')
    .getByRole('button', { name: 'Confirm retirement' })
    .click();
  await expect(page.getByText('Event retired.')).toBeFocused();
  await expect(retireChallenge).toBeEnabled();

  await retireChallenge.click();
  await page
    .getByRole('alert')
    .getByRole('button', { name: 'Confirm retirement' })
    .click();
  await expect(page.getByText('Challenge retired.')).toBeFocused();

  for (const viewport of [
    { height: 844, width: 390 },
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
  }

  await page.reload();
  await expect(
    page.getByRole('option', { name: 'Challenge 1 — retired' }),
  ).toBeAttached();
  await expect(
    page.getByRole('button', { name: 'Retire challenge' }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retire event' })).toHaveCount(
    0,
  );
  expect(consoleErrors).toEqual([]);
});

function retirementEvent(status: 'published' | 'retired') {
  const retired = status === 'retired';
  return {
    authoringStatus: status,
    createdAt: '2026-08-16T08:00:00.000Z',
    description: 'East Campus history.',
    endsAt: '2026-09-01T12:00:00.000Z',
    eventId: retirementEventId,
    isPublished: !retired,
    latitude: -26.19205,
    longitude: 28.03038,
    radiusMetres: 75,
    retiredAt: retired ? '2026-08-20T10:00:00.000Z' : null,
    startsAt: '2026-09-01T08:00:00.000Z',
    title: 'Great Hall history',
    updatedAt: '2026-08-20T10:00:00.000Z',
  };
}

function retirementChallenge(status: 'published' | 'retired') {
  return {
    challengeId: retirementChallengeId,
    createdAt: '2026-08-16T08:00:00.000Z',
    eventId: retirementEventId,
    format: 'multiple_choice',
    status,
    updatedAt: '2026-08-20T10:00:00.000Z',
  };
}

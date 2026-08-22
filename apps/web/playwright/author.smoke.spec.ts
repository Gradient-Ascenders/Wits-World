import { expect, test, type BrowserContext } from '@playwright/test';

const apiBaseUrl = 'http://localhost:3000/api/v1';
const playerBindingKey = 'wits-world.authenticated-player-id';
const uuidPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
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
        playerName: 'test-player',
        playerNameSetupRequired: false,
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

test('card name conflicts preserve the Author draft and allow a unique retry', async ({
  context,
  page,
}) => {
  const consoleErrors: string[] = [];
  const runtimeErrors: string[] = [];
  const playerId = await readBoundPlayerId(context);
  let cards = [browserAuthorCard('Edge', 'published')];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.setViewportSize({ height: 844, width: 390 });

  await page.route(`${apiBaseUrl}/auth/me`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        id: playerId,
        playerName: 'test-player',
        playerNameSetupRequired: false,
        lifecycleStatus: 'active',
        requestId: 'playwright-card-name-author',
        role: 'author',
      },
    });
  });
  await page.route(`${apiBaseUrl}/author/events`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { events: [], requestId: 'playwright-card-name-events' },
    });
  });
  await page.route(`${apiBaseUrl}/author/cards`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        json: { cards, requestId: 'playwright-card-name-list' },
      });
      return;
    }

    const body = route.request().postDataJSON() as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name : '';

    if (name.trim().toLowerCase() === 'edge') {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          code: 'CARD_NAME_CONFLICT',
          detail: 'Another card definition already uses that name.',
          requestId: 'playwright-card-name-conflict',
          status: 409,
          title: 'Card name already in use',
          type: 'https://wits.world/problems/card_name_conflict',
        },
        status: 409,
      });
      return;
    }

    const moves = Array.isArray(body.moves) ? body.moves : [];
    const firstMove = isRecord(moves[0]) ? moves[0] : {};
    const created = browserAuthorCard(name, 'draft', {
      description:
        typeof body.description === 'string' ? body.description : null,
      imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : null,
      moveName:
        typeof firstMove.name === 'string' ? firstMove.name : 'Careful Step',
    });
    cards = [created, ...cards];
    await route.fulfill({
      contentType: 'application/json',
      json: { card: created, requestId: 'playwright-card-name-created' },
      status: 201,
    });
  });

  await page.goto('/author');
  await expect(
    page.getByRole('heading', { name: 'Author console' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Card catalogue' }).click();

  const name = page.getByLabel('Card name');
  const description = page.getByLabel('Display description (optional)');
  const artwork = page.getByLabel('Artwork URL (optional)');
  const moveName = page.getByLabel('Move name');

  await name.fill('Edge');
  await description.fill('This draft must survive both conflicts.');
  await artwork.fill('https://example.test/cards/unique-edge.png');
  await moveName.fill('Careful Step');
  await page.getByRole('button', { name: 'Create draft card' }).click();

  await expect(
    page.getByText('This card name is already in use.'),
  ).toBeVisible();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(description).toHaveValue(
    'This draft must survive both conflicts.',
  );
  await expect(artwork).toHaveValue(
    'https://example.test/cards/unique-edge.png',
  );
  await expect(moveName).toHaveValue('Careful Step');

  await name.fill('edge');
  await expect(page.getByText('This card name is already in use.')).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Create draft card' }).click();
  await expect(
    page.getByText('This card name is already in use.'),
  ).toBeVisible();
  await expect(name).toBeFocused();
  await expect(description).toHaveValue(
    'This draft must survive both conflicts.',
  );
  await expect(moveName).toHaveValue('Careful Step');

  await name.fill('Unique Edge Successor');
  await page.getByRole('button', { name: 'Create draft card' }).click();
  await expect(page.getByText('Draft card created.')).toBeFocused();

  await page.reload();
  await page.getByRole('button', { name: 'Card catalogue' }).click();
  await page.getByRole('button', { name: /Unique Edge Successor/ }).click();
  await expect(page.getByLabel('Card name')).toHaveValue(
    'Unique Edge Successor',
  );
  await expect(page.getByLabel('Display description (optional)')).toHaveValue(
    'This draft must survive both conflicts.',
  );
  await expect(page.getByLabel('Move name')).toHaveValue('Careful Step');
  expect(runtimeErrors).toEqual([]);
  expect(consoleErrors).toHaveLength(2);
  expect(
    consoleErrors.every((message) =>
      message.includes('server responded with a status of 409'),
    ),
  ).toBe(true);
});

test('an Author retires the event before its challenge and sees both states persist', async ({
  context,
  page,
}) => {
  const consoleErrors: string[] = [];
  const playerId = await readBoundPlayerId(context);
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  let event = retirementEvent('published');
  let challenge = retirementChallenge('published');

  await page.route(`${apiBaseUrl}/auth/me`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        id: playerId,
        playerName: 'test-player',
        playerNameSetupRequired: false,
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

function browserAuthorCard(
  name: string,
  status: 'draft' | 'published',
  overrides: {
    description?: string | null;
    imageUrl?: string | null;
    moveName?: string;
  } = {},
) {
  return {
    affinity: 'wit',
    authoringStatus: status,
    category: 'creature',
    createdAt: '2026-08-21T10:00:00.000Z',
    description: overrides.description ?? 'Browser card fixture.',
    effects: [],
    hp: 1,
    id:
      status === 'published'
        ? 'a8400000-0000-4000-8000-000000000001'
        : 'a8400000-0000-4000-8000-000000000002',
    imageUrl: overrides.imageUrl ?? null,
    isActive: status === 'published',
    moves: [
      {
        effectType: 'damage',
        effectValue: null,
        id:
          status === 'published'
            ? 'a8500000-0000-4000-8000-000000000001'
            : 'a8500000-0000-4000-8000-000000000002',
        modifierDurationTurns: null,
        modifierOperation: null,
        modifierStat: null,
        moveType: 'basic',
        name: overrides.moveName ?? 'Careful Step',
        position: 1,
        powerCost: 0,
      },
    ],
    name,
    power: 0,
    rarity: 'common',
    updatedAt: '2026-08-21T10:00:00.000Z',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

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

import { expect, test, type Page } from '@playwright/test';

const EVENT_TITLE = 'Sprint 1 Demo - Wits Great Hall';
const EVENT_ID = '00000000-0000-4000-8000-000000000018';
const API_BASE_URL = 'http://127.0.0.1:3002/api/v1';
const ACCESS_TOKEN = 'wits-world-sprint1-e2e-obvious-local-test-token';

const correctAnswers: Record<string, string> = {
  'On which Wits campus is the Great Hall located?': 'East Campus',
  'What does the name Wits stand for?': 'University of the Witwatersrand',
  'Which Wits building is used for major ceremonies and graduations?':
    'The Great Hall',
  'Which library is located on Wits East Campus?': 'Wartenweiler Library',
  'Which city is home to the University of the Witwatersrand?': 'Johannesburg',
};

test('completes the canonical 21-step Basic journey against the real API and test database', async ({
  context,
  page,
}) => {
  const forbiddenRequests = monitorForbiddenProviders(page);
  const consoleErrors: string[] = [];
  const expectedRecoveryMisses: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (
      response.status() === 404 &&
      response.request().method() === 'GET' &&
      response.url() === `${API_BASE_URL}/matches/cpu`
    ) {
      expectedRecoveryMisses.push(response.url());
    }
  });

  await context.grantPermissions(['geolocation'], {
    origin: 'http://127.0.0.1:5175',
  });
  await context.setGeolocation({ latitude: -26.19205, longitude: 28.03038 });
  await page.clock.setFixedTime(new Date('2026-08-18T10:00:00.000Z'));
  await page.setViewportSize({ height: 844, width: 390 });

  let completedAttempt: CompletedAttempt | undefined;
  let starterCards: OwnedCard[] = [];
  let matchId = '';

  await test.step('01 resolve the authenticated local player and Author role', async () => {
    const authResponse = page.waitForResponse(`${API_BASE_URL}/auth/me`);
    await page.goto('/explore');
    const response = await authResponse;
    expect(response.status()).toBe(200);
    expect((await response.json()) as { role?: string }).toMatchObject({
      role: 'author',
    });
    await expect(
      page.getByRole('heading', { name: 'Explore the campus map' }),
    ).toBeAttached();
  });

  await test.step('02 discover the known published demo event from the real database', async () => {
    await page.getByRole('button', { name: /^Events/u }).click();
    await expect(page.getByText(EVENT_TITLE)).toBeVisible();
  });

  await test.step('03 retain map-independent text discovery on mobile', async () => {
    await expect(
      page.getByRole('listitem').filter({ hasText: EVENT_TITLE }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(
      page.locator('[data-map-provider^="deterministic-"]'),
    ).toBeVisible();
  });

  await test.step('04 obtain server-authoritative time and location eligibility', async () => {
    const event = page.getByRole('listitem').filter({ hasText: EVENT_TITLE });
    const response = page.waitForResponse(
      `${API_BASE_URL}/events/${EVENT_ID}/eligibility`,
    );
    await event.getByRole('button', { name: /View on map/u }).click();
    expect((await response).status()).toBe(200);
    await expect(page.getByText('In range')).toBeVisible();
  });

  await test.step('05 start a persisted challenge after a fresh server check', async () => {
    const response = page.waitForResponse(
      `${API_BASE_URL}/events/${EVENT_ID}/challenge-attempts`,
    );
    await page
      .getByRole('button', { name: `Start challenge for ${EVENT_TITLE}` })
      .click();
    expect((await response).status()).toBe(201);
    await expect(page).toHaveURL(/\/challenge-attempts\/[0-9a-f-]+$/u);
  });

  await test.step('06 withhold answers, score, and rewards while the attempt is active', async () => {
    await expect(page.getByText('Choose one answer')).toBeVisible();
    await expect(page.getByText('Correct answer')).toHaveCount(0);
    await expect(page.getByText('Your rewards are recorded')).toHaveCount(0);
  });

  await test.step('07 submit five intended choices through the Web UI', async () => {
    for (let answered = 0; answered < 5; answered += 1) {
      const prompt = await page.locator('.challenge-question h2').innerText();
      const answer = correctAnswers[prompt];
      expect(answer, `known accepted answer for ${prompt}`).toBeTruthy();
      await page.getByRole('radio', { name: answer }).check();

      const answerResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes('/challenge-attempts/') &&
          response.url().endsWith('/answers'),
      );
      await page.getByRole('button', { name: 'Submit answer' }).click();
      const response = await answerResponse;
      expect(response.status()).toBe(200);

      const body = (await response.json()) as
        InProgressAttempt | CompletedAttempt;
      if (body.status === 'completed') completedAttempt = body;
    }
  });

  await test.step('08 accept only the server-marked completed score', async () => {
    expect(completedAttempt).toMatchObject({
      status: 'completed',
      scoreCorrect: 5,
    });
    await expect(page.getByText('5 out of 5 correct')).toBeVisible();
  });

  await test.step('09 display the persisted completed-answer review', async () => {
    await expect(
      page.getByRole('heading', { name: 'Review your answers' }),
    ).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Answer review' }).getByRole('listitem'),
    ).toHaveCount(5);
  });

  await test.step('10 prove the event reward is one-time and idempotent', async () => {
    expect(completedAttempt?.reward.cards.length).toBeGreaterThan(0);
    const repeated = await browserApi<CompletedAttempt>(
      page,
      `/events/${EVENT_ID}/challenge-attempts`,
      'POST',
      {
        accuracyMetres: 10,
        acquiredAt: '2026-08-18T10:00:00.000Z',
        latitude: -26.19205,
        longitude: 28.03038,
      },
    );
    expect(repeated.status).toBe('completed');
    expect(repeated.reward.cards).toEqual(completedAttempt?.reward.cards);
  });

  await test.step('11 load the reward from the owned collection', async () => {
    const response = page.waitForResponse(`${API_BASE_URL}/cards/collection`);
    await page.goto('/collection');
    const cards = ((await (await response).json()) as { cards: OwnedCard[] })
      .cards;
    expect(cards.some((card) => card.acquisitionKind === 'event_reward')).toBe(
      true,
    );
  });

  await test.step('12 claim the one-time five-card starter state', async () => {
    const response = page.waitForResponse(`${API_BASE_URL}/cards/starter`);
    await page.getByRole('button', { name: 'Choose this affinity' }).click();
    const payload = (await (await response).json()) as { cards: OwnedCard[] };
    starterCards = payload.cards;
    expect(starterCards).toHaveLength(5);
    expect(
      starterCards.filter((card) => card.category === 'creature'),
    ).toHaveLength(3);
    expect(
      starterCards.filter((card) => card.category === 'power'),
    ).toHaveLength(2);
  });

  await test.step('13 create an ordered legal five-card saved deck', async () => {
    await page.goto('/decks');
    await page.getByRole('button', { name: 'Create a deck' }).click();
    await page
      .getByRole('textbox', { name: 'Deck name' })
      .fill('Basic E2E Five');
    for (const card of starterCards) {
      await page
        .getByRole('button', { name: `Add a copy of ${card.name}` })
        .click();
    }
    await expect(page.getByText('Ready to submit')).toBeVisible();
  });

  await test.step('14 persist only the server-validated owned deck copies', async () => {
    const response = page.waitForResponse(`${API_BASE_URL}/decks`);
    await page.getByRole('button', { name: 'Create saved deck' }).click();
    expect((await response).status()).toBe(201);
    await expect(
      page.getByRole('heading', { name: 'Basic E2E Five' }),
    ).toBeVisible();
  });

  await test.step('15 select the saved deck as the active deck', async () => {
    const response = page.waitForResponse(
      /\/api\/v1\/decks\/[0-9a-f-]+\/selection$/u,
    );
    await page.getByRole('button', { name: 'Make active' }).click();
    expect((await response).status()).toBe(200);
    await expect(page.getByText('Selected for matches')).toBeVisible();
  });

  await test.step('16 create a server-authoritative CPU battle snapshot', async () => {
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' &&
        candidate.url() === `${API_BASE_URL}/matches/cpu`,
    );
    await page.getByRole('button', { name: 'Start CPU match' }).click();
    const match = (await (await response).json()) as { matchId: string };
    matchId = match.matchId;
    await expect(page).toHaveURL(new RegExp(`/matches/${matchId}$`, 'u'));
  });

  await test.step('17 submit only server-provided legal battle intents', async () => {
    let completed = false;
    for (
      let actionCount = 0;
      actionCount < 120 && !completed;
      actionCount += 1
    ) {
      const action = page
        .locator('.battle-actions button:not([disabled])')
        .first();
      await expect(action).toBeVisible();
      const responsePromise = page.waitForResponse(
        `${API_BASE_URL}/matches/${matchId}/actions`,
      );
      await action.click();
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { status: string };
      completed = body.status === 'completed';
    }
    expect(completed).toBe(true);
  });

  await test.step('18 reload the persisted completed match result', async () => {
    await expect(
      page.getByRole('heading', { name: /match saved/u }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: /match saved/u }),
    ).toBeVisible();
  });

  await test.step('19 load the completed match from private history', async () => {
    await page.goto('/matches/history');
    await expect(
      page.getByRole('heading', { name: 'Completed CPU matches' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'View saved match' }),
    ).toBeVisible();
  });

  await test.step('20 create and publish playable content through protected author APIs', async () => {
    await page.goto('/author');
    await expect(
      page.getByRole('heading', { name: 'Author console' }),
    ).toBeVisible();
    const title = `Basic E2E Release Fixture ${process.env.BASIC_E2E_RUN_ID}`;
    const created = await browserApi<{ event: { eventId: string } }>(
      page,
      '/author/events',
      'POST',
      {
        title,
        description: 'Disposable integrated release-validation content.',
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
        startsAt: '2026-08-01T00:00:00.000Z',
        endsAt: '2026-08-26T00:00:00.000Z',
      },
    );
    const eventId = created.event.eventId;
    const challenge = await browserApi<{ challenge: { challengeId: string } }>(
      page,
      `/author/events/${eventId}/challenges`,
      'POST',
      {},
    );

    for (let index = 1; index <= 5; index += 1) {
      const question = await browserApi<{ question: { questionId: string } }>(
        page,
        `/author/challenges/${challenge.challenge.challengeId}/questions`,
        'POST',
        {
          prompt: `Basic E2E author question ${index}?`,
          difficulty: 1,
          explanation: 'Disposable test explanation.',
          choices: ['One', 'Two', 'Three', 'Four'],
          acceptedChoicePosition: 1,
        },
      );
      await browserApi(
        page,
        `/author/questions/${question.question.questionId}/publish`,
        'POST',
        {},
      );
    }

    await browserApi(
      page,
      `/author/challenges/${challenge.challenge.challengeId}/publish`,
      'POST',
      {},
    );
    await browserApi(page, `/author/events/${eventId}/publish`, 'POST', {});
    await page.reload();
    await expect(
      page.getByRole('button', { name: new RegExp(title, 'u') }),
    ).toBeVisible();
  });

  await test.step('21 retain responsive, keyboard, error, and provider boundaries', async () => {
    for (const viewport of [
      { height: 1024, width: 768 },
      { height: 800, width: 1280 },
    ]) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
    }
    const cardsTab = page.getByRole('button', {
      exact: true,
      name: 'Card catalogue',
    });
    await cardsTab.focus();
    await page.keyboard.press('Enter');
    await expect(cardsTab).toHaveAttribute('aria-current', 'page');
    expect(forbiddenRequests).toEqual([]);
    expect(expectedRecoveryMisses).toHaveLength(1);
    expect(
      consoleErrors.filter(
        (message) =>
          message !==
          'Failed to load resource: the server responded with a status of 404 (Not Found)',
      ),
    ).toEqual([]);
  });
});

interface OwnedCard {
  acquisitionKind: 'event_reward' | 'starter';
  category: 'creature' | 'power';
  name: string;
}

interface CompletedAttempt {
  status: 'completed';
  scoreCorrect: number;
  reward: { cards: Array<{ ownedCardId: string }> };
}

interface InProgressAttempt {
  status: 'in_progress';
}

async function browserApi<T = unknown>(
  page: Page,
  path: string,
  method: 'GET' | 'POST' | 'PUT',
  body?: object,
): Promise<T> {
  const result = await page.evaluate(
    async ({ body, method, path, token }) => {
      const response = await fetch(path, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        method,
      });
      const payload = (await response.json()) as unknown;
      return { payload, status: response.status };
    },
    { body, method, path: `${API_BASE_URL}${path}`, token: ACCESS_TOKEN },
  );

  expect(result.status, JSON.stringify(result.payload)).toBeGreaterThanOrEqual(
    200,
  );
  expect(result.status, JSON.stringify(result.payload)).toBeLessThan(300);
  return result.payload as T;
}

function monitorForbiddenProviders(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.hostname === 'api.mapbox.com' ||
      url.hostname.endsWith('.mapbox.com') ||
      url.hostname.endsWith('.auth0.com')
    ) {
      requests.push(`${request.method()} ${url.hostname}${url.pathname}`);
    }
  });
  return requests;
}

async function expectNoHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
}

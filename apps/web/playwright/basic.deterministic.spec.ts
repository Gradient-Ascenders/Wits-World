import { expect, test, type Page, type Route } from '@playwright/test';

import { buildStarterCards, buildUuid } from '../tests/fixtures/cards';

const EVENT_TITLE = 'Sprint 1 Demo - Wits Great Hall';
const EVENT_ID = '00000000-0000-4000-8000-000000000018';
const API_BASE_URL = 'http://127.0.0.1:3002/api/v1';
const ACCESS_TOKEN = 'wits-world-sprint1-e2e-obvious-local-test-token';
const EXPLORE_EVENTS = [
  {
    availability: 'active',
    description: 'Explore the Great Hall and its role in campus life.',
    endsAt: '2026-09-30T18:00:00.000+02:00',
    eventId: buildUuid(961),
    latitude: -26.19205,
    longitude: 28.03038,
    radiusMetres: 75,
    startsAt: '2026-08-01T08:00:00.000+02:00',
    title: 'Great Hall Quest',
  },
  {
    availability: 'upcoming',
    description: 'Discover the Wartenweiler Library collections.',
    endsAt: '2026-10-20T17:00:00.000+02:00',
    eventId: buildUuid(962),
    latitude: -26.1914,
    longitude: 28.0311,
    radiusMetres: 60,
    startsAt: '2026-10-01T08:00:00.000+02:00',
    title: 'Wartenweiler Library Quest',
  },
  {
    availability: 'ended',
    description: 'A completed campus science discovery event.',
    endsAt: '2026-07-31T17:00:00.000+02:00',
    eventId: buildUuid(963),
    latitude: -26.1908,
    longitude: 28.0297,
    radiusMetres: 50,
    startsAt: '2026-07-01T08:00:00.000+02:00',
    title: 'Science Stadium Trail',
  },
] as const;

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
    await expect(page.getByRole('radio')).toHaveCount(3);
    await page.getByRole('button', { name: 'Review Spark choice' }).click();
    const response = page.waitForResponse(`${API_BASE_URL}/cards/starter`);
    await page.getByRole('button', { name: 'Confirm Spark starter' }).click();
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

test('keeps the authenticated shared application shell responsive and accessible', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname.endsWith('/auth/me')) {
      await json(route, {
        id: buildUuid(950),
        lifecycleStatus: 'active',
        playerName: 'shell_browser_player',
        playerNameSetupRequired: false,
        requestId: 'shell-browser-player',
        role: 'author',
      });
      return;
    }
    if (pathname.endsWith('/events')) {
      await json(route, { events: [], requestId: 'shell-browser-events' });
      return;
    }
    if (pathname.endsWith('/cards/collection')) {
      await json(route, {
        cards: buildStarterCards('wit'),
        requestId: 'shell-browser-collection',
      });
      return;
    }
    if (pathname.endsWith('/decks')) {
      await json(route, { decks: [], requestId: 'shell-browser-decks' });
      return;
    }
    if (pathname.endsWith('/matches/history')) {
      await json(route, { matches: [], requestId: 'shell-browser-history' });
      return;
    }
    if (pathname.endsWith('/matches/cpu')) {
      await json(
        route,
        {
          code: 'CPU_MATCH_NOT_FOUND',
          detail: 'No active CPU match was found.',
          requestId: 'shell-browser-no-match',
          status: 404,
          title: 'CPU match not found',
          type: 'about:blank',
        },
        404,
      );
      return;
    }

    await json(
      route,
      {
        code: 'NOT_FOUND',
        detail: 'The deterministic shell route was not found.',
        requestId: 'shell-browser-not-found',
        status: 404,
        title: 'Not found',
        type: 'about:blank',
      },
      404,
    );
  });

  const routes = [
    { activeLabel: 'Explore', path: '/explore' },
    { activeLabel: 'Collection', path: '/collection' },
    { activeLabel: 'Decks', path: '/decks' },
    { activeLabel: 'Battles', path: '/matches' },
    { activeLabel: 'Battles', path: '/matches/history' },
  ];

  for (const viewport of [
    { height: 844, width: 390 },
    { height: 1024, width: 768 },
    { height: 800, width: 1280 },
  ]) {
    await page.setViewportSize(viewport);

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const visibleNavigation = page.locator('.primary-navigation:visible');
      await expect(visibleNavigation).toHaveCount(1);
      await expect(
        visibleNavigation.getByRole('link', { name: route.activeLabel }),
      ).toHaveAttribute('aria-current', 'page');
      await expect(
        visibleNavigation.locator('.primary-navigation__icon'),
      ).toHaveCount(5);
    }

    await page.goto('/explore');
    await expect(
      page.getByRole('heading', { name: 'Explore the campus map' }),
    ).toBeAttached();

    const layout = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>('.site-header');
      const main = document.querySelector<HTMLElement>('.main-content');
      const mobileNavigation = document.querySelector<HTMLElement>(
        '.primary-navigation--mobile',
      );
      const desktopNavigation = document.querySelector<HTMLElement>(
        '.primary-navigation--desktop',
      );
      const brand = document.querySelector<HTMLElement>('.product-name');
      const account = document.querySelector<HTMLElement>('.account-control');
      if (
        !header ||
        !main ||
        !mobileNavigation ||
        !desktopNavigation ||
        !brand ||
        !account
      ) {
        throw new Error('Expected the authenticated application shell.');
      }

      const headerBox = header.getBoundingClientRect();
      const mainBox = main.getBoundingClientRect();
      const mobileBox = mobileNavigation.getBoundingClientRect();
      const desktopBox = desktopNavigation.getBoundingClientRect();
      const brandBox = brand.getBoundingClientRect();
      const accountBox = account.getBoundingClientRect();

      return {
        accountRight: accountBox.right,
        brandLeft: brandBox.left,
        desktopDisplay: getComputedStyle(desktopNavigation).display,
        desktopMiddle: desktopBox.left + desktopBox.width / 2,
        headerHeight: headerBox.height,
        mainBottom: mainBox.bottom,
        mainTop: mainBox.top,
        mobileBottom: mobileBox.bottom,
        mobileDisplay: getComputedStyle(mobileNavigation).display,
        mobilePosition: getComputedStyle(mobileNavigation).position,
      };
    });

    expect(layout.brandLeft).toBeLessThanOrEqual(24);
    expect(layout.accountRight).toBeGreaterThanOrEqual(viewport.width - 24);
    expect(layout.mainTop).toBeCloseTo(layout.headerHeight, 0);
    expect(layout.mainBottom).toBeCloseTo(viewport.height, 0);

    if (viewport.width < 1200) {
      expect(layout.headerHeight).toBeLessThanOrEqual(70);
      expect(layout.desktopDisplay).toBe('none');
      expect(layout.mobileDisplay).not.toBe('none');
      expect(layout.mobilePosition).toBe('fixed');
      expect(layout.mobileBottom).toBeCloseTo(viewport.height, 0);

      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('link', { name: 'Skip to main content' }),
      ).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('link', { name: 'Wits World home' }),
      ).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Account' })).toBeFocused();
      const focusOutline = await page
        .getByRole('button', { name: 'Account' })
        .evaluate((element) => ({
          style: getComputedStyle(element).outlineStyle,
          width: getComputedStyle(element).outlineWidth,
        }));
      expect(focusOutline.style).toBe('solid');
      expect(Number.parseFloat(focusOutline.width)).toBeGreaterThan(0);
    } else {
      expect(layout.headerHeight).toBeLessThanOrEqual(82);
      expect(layout.desktopDisplay).not.toBe('none');
      expect(layout.mobileDisplay).toBe('none');
      expect(layout.desktopMiddle).toBeCloseTo(viewport.width / 2, 0);
    }

    const accountTrigger = page.getByRole('button', { name: 'Account' });
    await accountTrigger.click();
    await expect(accountTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByLabel('Account options')).toContainText(
      'Signed in as',
    );
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(accountTrigger).toHaveAttribute('aria-expanded', 'false');
    await expect(accountTrigger).toBeFocused();
  }

  expect(
    consoleErrors.filter(
      (message) =>
        message !==
        'Failed to load resource: the server responded with a status of 404 (Not Found)',
    ),
  ).toEqual([]);
});

test('focuses and filters Explore events without breaking map following', async ({
  context,
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await mockExploreApi(page);
  await context.grantPermissions(['geolocation'], {
    origin: 'http://127.0.0.1:5178',
  });
  await context.setGeolocation({ latitude: -26.1922, longitude: 28.0301 });

  for (const viewport of [
    { height: 844, width: 390 },
    { height: 800, width: 1280 },
  ]) {
    await test.step(`${viewport.width}px event focus and controls`, async () => {
      await page.setViewportSize(viewport);
      await page.goto('/explore');
      const map = page.locator('[data-map-provider^="deterministic-"]');
      await expect(map).toBeVisible();
      await expect(map).toHaveAttribute('data-map-following', 'true');
      await expect(page.getByText('Wits Quest · Explore')).toHaveCount(0);

      await page.getByRole('button', { name: /^Events/u }).click();
      await expect(
        page.getByRole('searchbox', { name: 'Search campus events' }),
      ).toBeVisible();
      await expect(
        page.getByRole('combobox', { name: 'Filter events by status' }),
      ).toBeVisible();
      await expect(page.locator('.event-list__items > li')).toHaveCount(3);

      const greatHallAction = page
        .locator('.event-list__items > li')
        .filter({ hasText: EXPLORE_EVENTS[0].title })
        .getByRole('button', { name: /View on map/u });
      await greatHallAction.focus();
      await page.keyboard.press('Enter');

      await expect(map).toHaveAttribute(
        'data-map-focused-event',
        EXPLORE_EVENTS[0].eventId,
      );
      await expect(map).toHaveAttribute(
        'data-map-camera-center',
        `${EXPLORE_EVENTS[0].longitude},${EXPLORE_EVENTS[0].latitude}`,
      );
      await expect(map).toHaveAttribute('data-map-camera-zoom', '17');
      await expect(map).toHaveAttribute('data-map-following', 'false');
      await expect(
        page.locator(`[data-event-marker-id="${EXPLORE_EVENTS[0].eventId}"]`),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(
        page.locator('[data-deterministic-event-radius]'),
      ).toBeVisible();
      await expect(
        page.locator('.event-marker[aria-pressed="true"] .event-marker__label'),
      ).toHaveText(EXPLORE_EVENTS[0].title);

      const locationRailOffset = await page
        .locator('.location-control-wrap')
        .evaluate((element) => {
          return window.innerWidth - element.getBoundingClientRect().right;
        });
      expect(locationRailOffset).toBeLessThanOrEqual(
        viewport.width >= 1024 ? 17 : 9,
      );

      const recenter = page.getByRole('button', {
        name: 'Recenter on reported location',
      });
      await recenter.click();
      await expect(map).toHaveAttribute('data-map-following', 'true');
      await map.dispatchEvent('pointerdown');
      await expect(map).toHaveAttribute('data-map-following', 'false');

      await page
        .getByRole('button', {
          name: new RegExp(`Select ${EXPLORE_EVENTS[1].title}`, 'u'),
        })
        .click();
      await expect(map).toHaveAttribute(
        'data-map-focused-event',
        EXPLORE_EVENTS[1].eventId,
      );
      await expect(
        page.getByRole('heading', { name: EXPLORE_EVENTS[1].title }),
      ).toBeVisible();

      await page.getByRole('button', { name: 'All events' }).click();
      const search = page.getByRole('searchbox', {
        name: 'Search campus events',
      });
      await search.fill('Great Hall');
      await expect(search).toBeFocused();
      await expect(page.locator('.event-list__items > li')).toHaveCount(1);
      await expect(
        page.locator('[data-deterministic-markers] .event-marker'),
      ).toHaveCount(1);
      await expect(
        page.locator('[data-deterministic-event-radius]'),
      ).toBeHidden();
      await expect(
        page.locator('.event-marker[aria-pressed="true"]'),
      ).toHaveCount(0);

      await search.focus();
      const searchOutline = await search.evaluate((element) => ({
        style: getComputedStyle(element).outlineStyle,
        width: Number.parseFloat(getComputedStyle(element).outlineWidth),
      }));
      expect(searchOutline.style).toBe('solid');
      expect(searchOutline.width).toBeGreaterThan(0);
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('combobox', { name: 'Filter events by status' }),
      ).toBeFocused();

      await page
        .getByRole('combobox', { name: 'Filter events by status' })
        .selectOption('ended');
      await expect(
        page.getByText('No events match these filters.'),
      ).toBeVisible();
      await expect(
        page.locator('[data-deterministic-markers] .event-marker'),
      ).toHaveCount(0);
      await page.getByRole('button', { name: 'Clear filters' }).click();
      await expect(page.locator('.event-list__items > li')).toHaveCount(3);

      await expectNoHorizontalOverflow(page);
      const layout = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('.event-panel');
        const location = document.querySelector<HTMLElement>(
          '.location-control-wrap',
        );
        const controls = document.querySelector<HTMLElement>(
          '.mapboxgl-ctrl-top-right',
        );
        if (!panel || !location || !controls) {
          throw new Error('Expected Explore controls.');
        }
        const overlaps = (first: DOMRect, second: DOMRect) =>
          first.left < second.right &&
          first.right > second.left &&
          first.top < second.bottom &&
          first.bottom > second.top;
        return {
          documentScrolls:
            document.documentElement.scrollHeight > window.innerHeight,
          locationOverlapsControls: overlaps(
            location.getBoundingClientRect(),
            controls.getBoundingClientRect(),
          ),
          locationOverlapsPanel: overlaps(
            location.getBoundingClientRect(),
            panel.getBoundingClientRect(),
          ),
        };
      });
      expect(layout).toEqual({
        documentScrolls: false,
        locationOverlapsControls: false,
        locationOverlapsPanel: false,
      });
    });
  }

  expect(consoleErrors).toEqual([]);
});

test('retains denied-location and failed-map event discovery', async ({
  page,
}) => {
  await mockExploreApi(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: async () => ({ state: 'denied' }),
      },
    });
  });
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/explore?map-failure=1');

  await expect(
    page.getByRole('button', { name: 'Location access disabled' }),
  ).toBeDisabled();
  await expect(page.getByText('The map could not load.')).toBeVisible();
  await page.getByRole('button', { name: /^Events/u }).click();
  await expect(
    page.getByText(EXPLORE_EVENTS[0].title, { exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
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

async function json(route: Route, body: object, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

async function mockExploreApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/auth/me')) {
      await json(route, {
        id: buildUuid(960),
        lifecycleStatus: 'active',
        playerName: 'explore_browser_player',
        playerNameSetupRequired: false,
        requestId: 'explore-browser-player',
        role: 'player',
      });
      return;
    }
    if (pathname.endsWith('/events')) {
      await json(route, {
        events: EXPLORE_EVENTS,
        requestId: 'explore-browser-events',
      });
      return;
    }
    if (pathname.endsWith('/eligibility')) {
      const eventId = pathname.split('/').at(-2) ?? '';
      await json(route, {
        eventId,
        reachable: eventId === EXPLORE_EVENTS[0].eventId,
        requestId: 'explore-browser-eligibility',
        status:
          eventId === EXPLORE_EVENTS[0].eventId ? 'reachable' : 'unreachable',
      });
      return;
    }
    await json(
      route,
      {
        code: 'NOT_FOUND',
        detail: 'The deterministic Explore route was not found.',
        requestId: 'explore-browser-not-found',
        status: 404,
        title: 'Not found',
        type: 'about:blank',
      },
      404,
    );
  });
}

/// <reference types="node" />

import { expect, test, type Page, type Route } from '@playwright/test';

import type { CpuMatch } from '../src/api/matches';
import { buildStarterCards, buildUuid } from '../tests/fixtures/cards';

const EVENT_TITLE = 'Sprint 1 Demo - Wits Great Hall';
const EVENT_ID = '00000000-0000-4000-8000-000000000018';
const API_BASE_URL = 'http://127.0.0.1:3002/api/v1';
const WEB_ORIGIN = 'http://127.0.0.1:5175';
const ACCESS_TOKEN = 'wits-world-sprint1-e2e-obvious-local-test-token';
const REVIEWER_ACCESS_TOKEN =
  'wits-world-basic-e2e-reviewer-obvious-local-test-token';
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

const EXPLORE_SHEET_EVENTS = [
  ...EXPLORE_EVENTS,
  {
    ...EXPLORE_EVENTS[0],
    eventId: buildUuid(964),
    latitude: -26.1927,
    longitude: 28.0296,
    title:
      'Origins Centre Heritage Trail with an intentionally long event name',
  },
  {
    ...EXPLORE_EVENTS[1],
    eventId: buildUuid(965),
    latitude: -26.1909,
    longitude: 28.032,
    title: 'Wits Art Museum Discovery',
  },
  {
    ...EXPLORE_EVENTS[0],
    eventId: buildUuid(966),
    latitude: -26.1931,
    longitude: 28.0316,
    title: 'Braamfontein Campus Architecture Walk',
  },
  {
    ...EXPLORE_EVENTS[2],
    eventId: buildUuid(967),
    latitude: -26.1899,
    longitude: 28.0308,
    title: 'Science Stadium Archive Route',
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
  test.setTimeout(480_000);
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
    origin: WEB_ORIGIN,
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
    await expect(
      page.getByRole('listitem').filter({ hasText: EVENT_TITLE }),
    ).toBeVisible();
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
    const score = page.locator('.challenge-result__score');
    await expect(score.getByText('5', { exact: true })).toBeVisible();
    await expect(
      score.getByText('out of 5 correct', { exact: true }),
    ).toBeVisible();
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
    await page.goto('/collection');
    await expect(
      page.getByRole('heading', { name: 'Your cards', exact: true }),
    ).toBeVisible();
    const { cards } = await browserApi<{ cards: OwnedCard[] }>(
      page,
      '/cards/collection',
      'GET',
    );
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
    await page
      .getByRole('group', { name: 'Editor view' })
      .getByRole('button', { name: 'Add cards', exact: true })
      .click();
    for (const card of starterCards) {
      await page
        .getByRole('button', { name: `Add a copy of ${card.name}` })
        .click();
    }
    await page
      .getByRole('group', { name: 'Editor view' })
      .getByRole('button', { name: /^Your deck \(5\/5\)$/u })
      .click();
    await expect(page.getByText('Complete lineup')).toBeVisible();
  });

  await test.step('14 persist only the server-validated owned deck copies', async () => {
    const response = page.waitForResponse(`${API_BASE_URL}/decks`);
    await page
      .getByRole('button', { name: 'Create deck', exact: true })
      .click();
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
    await expect(
      page.locator('.saved-deck-detail').getByText('Active', { exact: true }),
    ).toBeVisible();
  });

  await test.step('16 create a server-authoritative CPU battle snapshot', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
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
    const action = page
      .locator('.battle-action-content button:not([disabled]):visible')
      .last();
    await expect(action).toBeVisible();
    const responsePromise = page.waitForResponse(
      `${API_BASE_URL}/matches/${matchId}/actions`,
    );
    await action.click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    let current = (await response.json()) as CpuMatch;

    for (let actionCount = 1; actionCount < 120; actionCount += 1) {
      if (current.status === 'completed') break;
      const legalAction = current.state.legalActions.at(-1);
      if (!legalAction) {
        throw new Error('The active CPU match returned no legal action.');
      }
      current = await browserApi<CpuMatch>(
        page,
        `/matches/${matchId}/actions`,
        'POST',
        {
          action: legalAction,
          expectedVersion: current.version,
          submissionId: crypto.randomUUID(),
        },
      );
    }
    expect(current.status).toBe('completed');
    await page.reload();
  });

  await test.step('18 reload the persisted completed match result', async () => {
    const completedMatchHeading = page.getByRole('heading', {
      name: /^CPU battle (victory|complete)$/u,
    });
    await expect(completedMatchHeading).toBeVisible();
    await page.reload();
    await expect(completedMatchHeading).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  await test.step('19 load the completed match from private history', async () => {
    await page.goto('/matches/history');
    await expect(
      page.getByRole('heading', { name: 'Battle history' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'View battle' }),
    ).toHaveAttribute('href', `/matches/${matchId}`);
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
        automaticPlacement: false,
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
        `/author/questions/${question.question.questionId}/submit`,
        'POST',
        { expectedVersion: 0 },
      );
      await browserApi(
        page,
        `/author/questions/${question.question.questionId}/approve`,
        'POST',
        { expectedVersion: 1 },
        REVIEWER_ACCESS_TOKEN,
      );
      await browserApi(
        page,
        `/author/questions/${question.question.questionId}/publish`,
        'POST',
        { expectedVersion: 2 },
        REVIEWER_ACCESS_TOKEN,
      );
    }

    await browserApi(
      page,
      `/author/challenges/${challenge.challenge.challengeId}/submit`,
      'POST',
      { expectedVersion: 0 },
    );
    await browserApi(
      page,
      `/author/challenges/${challenge.challenge.challengeId}/approve`,
      'POST',
      { expectedVersion: 1 },
      REVIEWER_ACCESS_TOKEN,
    );
    await browserApi(
      page,
      `/author/challenges/${challenge.challenge.challengeId}/publish`,
      'POST',
      { expectedVersion: 2 },
      REVIEWER_ACCESS_TOKEN,
    );
    await browserApi(page, `/author/events/${eventId}/submit`, 'POST', {
      expectedVersion: 0,
    });
    await browserApi(
      page,
      `/author/events/${eventId}/approve`,
      'POST',
      { expectedVersion: 1 },
      REVIEWER_ACCESS_TOKEN,
    );
    await browserApi(
      page,
      `/author/events/${eventId}/publish`,
      'POST',
      { expectedVersion: 2 },
      REVIEWER_ACCESS_TOKEN,
    );
    await page.reload();
    await expect(
      page.getByRole('link', { name: new RegExp(title, 'u') }),
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
    const cardsTab = page.getByRole('link', {
      exact: true,
      name: 'Cards',
    });
    await cardsTab.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/author\/cards$/u);
    await expect(
      page.getByRole('heading', { name: 'Card catalogue' }),
    ).toBeVisible();
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
        connectionStrategy: 'auth0',
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
    if (pathname.endsWith('/matches/pvp/history')) {
      await json(route, {
        matches: [],
        nextCursor: null,
        requestId: 'shell-browser-pvp-history',
      });
      return;
    }
    if (pathname.endsWith('/matches/pvp')) {
      await json(route, {
        matches: [],
        nextCursor: null,
        requestId: 'shell-browser-active-pvp',
      });
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
    { activeLabel: 'Collection', path: '/collection/decks' },
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
      await expect(
        page.getByRole('button', { name: /account menu$/u }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const visibleNavigation = page.locator('.primary-navigation:visible');
      await expect(visibleNavigation).toHaveCount(1);
      await expect(
        visibleNavigation.getByRole('link', { name: route.activeLabel }),
      ).toHaveAttribute('aria-current', 'page');
      await expect(visibleNavigation.getByRole('link')).toHaveCount(5);
      for (const label of [
        'Explore',
        'Collection',
        'Battles',
        'Leaderboard',
        'Author',
      ]) {
        await expect(
          visibleNavigation.getByRole('link', { name: label }),
        ).toBeVisible();
      }
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
    expect(layout.mainTop).toBeCloseTo(
      viewport.width < 768 ? 0 : layout.headerHeight,
      0,
    );
    expect(layout.mainBottom).toBeCloseTo(viewport.height, 0);

    if (viewport.width < 768) {
      await expect(
        page.getByRole('button', { name: 'Hide header for more map space' }),
      ).toHaveAttribute('aria-expanded', 'true');
    } else {
      await expect(
        page.getByRole('button', { name: 'Hide header for more map space' }),
      ).toBeHidden();
    }

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
      await expect(
        page.getByRole('button', { name: /account menu$/u }),
      ).toBeFocused();
      const focusOutline = await page
        .getByRole('button', { name: /account menu$/u })
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

    const accountTrigger = page.getByRole('button', {
      name: /account menu$/u,
    });
    await accountTrigger.click();
    await expect(accountTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Signed in as')).toBeVisible();
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
    origin: WEB_ORIGIN,
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
        .getByRole('button', { name: 'Collapse event details' })
        .click();
      if (viewport.width < 1024) {
        await expect(
          page.getByRole('complementary', { name: 'Campus discovery' }),
        ).toHaveAttribute('data-sheet-view', 'list');
        await page.getByRole('button', { name: 'Collapse events' }).click();
      }
      await expect(
        page.getByRole('complementary', { name: 'Campus discovery' }),
      ).toHaveAttribute('data-sheet-view', 'peek');

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
      const clearFilters = page.getByRole('button', { name: 'Clear filters' });
      await clearFilters.focus();
      await page.keyboard.press('Enter');
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

test('supports draggable mobile Explore sheet discovery and detail states', async ({
  context,
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await mockExploreApi(page, EXPLORE_SHEET_EVENTS);
  await context.grantPermissions(['geolocation'], {
    origin: WEB_ORIGIN,
  });
  await context.setGeolocation({ latitude: -26.1922, longitude: 28.0301 });
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/explore');

  const map = page.locator('[data-map-provider^="deterministic-"]');
  const sheet = page.getByRole('complementary', { name: 'Campus discovery' });
  await expect(map).toHaveAttribute('data-map-following', 'true');
  await expect(sheet).toHaveAttribute('data-sheet-snap', 'peek');
  await expect(sheet).toHaveAttribute('data-sheet-view', 'peek');
  await expect(page.getByRole('button', { name: /^Events/u })).toContainText(
    '7 campus events',
  );

  const snapPoints = await sheet.evaluate((element) => ({
    expanded: (element as HTMLElement).offsetHeight,
    medium: Math.round((element as HTMLElement).offsetHeight * 0.52),
    peek: 76,
  }));
  await dragExploreSheet(page, -(snapPoints.medium - snapPoints.peek + 4), {
    delayMs: 110,
    steps: 8,
  });
  await expect(sheet).toHaveAttribute('data-sheet-snap', 'medium');
  await expect(sheet).toHaveAttribute('data-sheet-view', 'list');
  await expect(map).toHaveAttribute('data-map-following', 'true');

  const eventScroll = page.locator('.event-panel__scroll');
  const scrollMetrics = await eventScroll.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(
    scrollMetrics.clientHeight,
  );
  await eventScroll.hover();
  await page.mouse.wheel(0, 600);
  await expect
    .poll(() => eventScroll.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Expand event sheet fully' }).click();
  await expect(sheet).toHaveAttribute('data-sheet-snap', 'expanded');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('.exploration-view');
        const panel = document.querySelector<HTMLElement>('.event-panel');
        const navigation = document.querySelector<HTMLElement>(
          '.primary-navigation--mobile',
        );
        if (!root || !panel || !navigation) {
          return Number.POSITIVE_INFINITY;
        }
        const visibleHeight = Number.parseFloat(
          getComputedStyle(root).getPropertyValue('--event-panel-height'),
        );
        return Math.abs(
          panel.getBoundingClientRect().top +
            visibleHeight -
            navigation.getBoundingClientRect().top,
        );
      }),
    )
    .toBeLessThanOrEqual(1);
  const expandedLayout = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.exploration-view');
    const panel = document.querySelector<HTMLElement>('.event-panel');
    const location = document.querySelector<HTMLElement>(
      '.location-control-wrap',
    );
    const controls = document.querySelector<HTMLElement>(
      '.mapboxgl-ctrl-top-right',
    );
    const attribution = document.querySelector<HTMLElement>(
      '.mapboxgl-ctrl-bottom-right',
    );
    const navigation = document.querySelector<HTMLElement>(
      '.primary-navigation--mobile',
    );
    if (
      !root ||
      !panel ||
      !location ||
      !controls ||
      !attribution ||
      !navigation
    ) {
      throw new Error('Expected the mobile Explore layout.');
    }
    const overlaps = (first: DOMRect, second: DOMRect) =>
      first.left < second.right &&
      first.right > second.left &&
      first.top < second.bottom &&
      first.bottom > second.top;
    const visibleHeight = Number.parseFloat(
      getComputedStyle(root).getPropertyValue('--event-panel-height'),
    );
    return {
      attributionOverlapsLocation: overlaps(
        attribution.getBoundingClientRect(),
        location.getBoundingClientRect(),
      ),
      attributionOpacity: Number.parseFloat(
        getComputedStyle(attribution).opacity,
      ),
      controlsOverlapLocation: overlaps(
        controls.getBoundingClientRect(),
        location.getBoundingClientRect(),
      ),
      controlsDisplay: getComputedStyle(controls).display,
      controlsOpacity: Number.parseFloat(getComputedStyle(controls).opacity),
      controlsPointerEvents: getComputedStyle(controls).pointerEvents,
      locationClearsSheet:
        location.getBoundingClientRect().bottom <=
        panel.getBoundingClientRect().top - 8,
      locationOpacity: Number.parseFloat(getComputedStyle(location).opacity),
      locationRight: Math.round(
        window.innerWidth - location.getBoundingClientRect().right,
      ),
      navigationClearance: Math.abs(
        panel.getBoundingClientRect().top +
          visibleHeight -
          navigation.getBoundingClientRect().top,
      ),
    };
  });
  expect(expandedLayout.attributionOverlapsLocation).toBe(false);
  expect(expandedLayout.attributionOpacity).toBe(1);
  expect(expandedLayout.controlsOverlapLocation).toBe(false);
  expect(expandedLayout.controlsDisplay).toBe('none');
  expect(expandedLayout.controlsOpacity).toBe(0);
  expect(expandedLayout.controlsPointerEvents).toBe('none');
  expect(expandedLayout.locationClearsSheet).toBe(true);
  expect(expandedLayout.locationOpacity).toBe(1);
  expect(expandedLayout.locationRight).toBe(8);
  expect(expandedLayout.navigationClearance).toBeLessThanOrEqual(1);

  await page
    .getByRole('button', { name: 'Following reported location' })
    .focus();
  await expect
    .poll(() =>
      page
        .locator('.location-control-wrap')
        .evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).opacity),
        ),
    )
    .toBe(1);
  await expect
    .poll(() =>
      page
        .locator('.mapboxgl-ctrl-top-right')
        .evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).opacity),
        ),
    )
    .toBe(0);

  await dragExploreSheet(page, snapPoints.expanded - snapPoints.medium + 4, {
    delayMs: 110,
    steps: 8,
  });
  await expect(sheet).toHaveAttribute('data-sheet-snap', 'medium');
  await expect
    .poll(() =>
      page
        .locator('.location-control-wrap')
        .evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).opacity),
        ),
    )
    .toBe(1);
  await dragExploreSheet(page, snapPoints.medium - snapPoints.peek + 4, {
    delayMs: 110,
    steps: 8,
  });
  await expect(sheet).toHaveAttribute('data-sheet-snap', 'peek');
  await expect(sheet).toHaveAttribute('data-sheet-snap', 'peek');

  await page.getByRole('button', { name: /^Events/u }).click();
  await eventScroll.evaluate((element) => element.scrollTo({ top: 0 }));
  await expect
    .poll(() => eventScroll.evaluate((element) => element.scrollTop))
    .toBe(0);
  const greatHallAction = page
    .locator('.event-list__items > li')
    .filter({ hasText: EXPLORE_EVENTS[0].title })
    .getByRole('button', { name: /View on map/u });
  await greatHallAction.focus();
  await page.keyboard.press('Enter');
  await expect(sheet).toHaveAttribute('data-sheet-view', 'selected');
  await expect(sheet).toHaveAttribute('data-sheet-snap', 'medium');
  await expect(map).toHaveAttribute(
    'data-map-focused-event',
    EXPLORE_EVENTS[0].eventId,
  );
  await expect(map).toHaveAttribute('data-map-following', 'false');

  const selectedSnapDistance = snapPoints.expanded - snapPoints.medium + 4;
  await dragExploreSheet(page, -selectedSnapDistance, {
    delayMs: 110,
    steps: 8,
  });
  await expect(sheet).toHaveAttribute('data-sheet-snap', 'expanded');
  await dragExploreSheet(page, selectedSnapDistance, {
    delayMs: 110,
    steps: 8,
  });
  await expect(sheet).toHaveAttribute('data-sheet-snap', 'medium');

  await page.getByRole('button', { name: 'Collapse event details' }).click();
  await page.getByRole('button', { name: 'Collapse events' }).click();
  await expect(sheet).toHaveAttribute('data-sheet-snap', 'peek');
  await expect(page.getByRole('button', { name: /^Events/u })).toContainText(
    EXPLORE_EVENTS[0].title,
  );

  await page
    .getByRole('button', {
      name: new RegExp(`Select ${EXPLORE_EVENTS[1].title}`, 'u'),
    })
    .click();
  await expect(
    page.getByRole('heading', { name: EXPLORE_EVENTS[1].title }),
  ).toBeVisible();
  await expect(map).toHaveAttribute(
    'data-map-focused-event',
    EXPLORE_EVENTS[1].eventId,
  );

  await page.getByRole('button', { name: 'All events' }).click();
  await expect(
    page.locator('.event-summary__action').filter({ hasText: 'Selected' }),
  ).toBeFocused();
  const search = page.getByRole('searchbox', {
    name: 'Search campus events',
  });
  await search.fill('Great Hall');
  await expect(search).toBeFocused();
  await expect(sheet).toHaveAttribute('data-sheet-view', 'list');
  await expect(page.locator('.event-marker[aria-pressed="true"]')).toHaveCount(
    0,
  );

  await page
    .getByRole('button', { name: 'Recenter on reported location' })
    .click();
  await expect(map).toHaveAttribute('data-map-following', 'true');
  await map.dispatchEvent('pointerdown');
  await expect(map).toHaveAttribute('data-map-following', 'false');

  await page.getByRole('link', { name: 'Collection' }).click();
  await expect(page).toHaveURL(/\/collection$/u);
  await expectNoHorizontalOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test('keeps the Explore sheet responsive and preserves the desktop sidebar', async ({
  context,
  page,
}) => {
  await mockExploreApi(page, EXPLORE_SHEET_EVENTS);
  await context.grantPermissions(['geolocation'], {
    origin: WEB_ORIGIN,
  });
  await context.setGeolocation({ latitude: -26.1922, longitude: 28.0301 });

  for (const viewport of [
    { height: 932, width: 430 },
    { height: 1024, width: 768 },
    { height: 667, width: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/explore');
    const sheet = page.getByRole('complementary', { name: 'Campus discovery' });
    await page.getByRole('button', { name: /^Events/u }).click();
    await expect(sheet).toHaveAttribute('data-sheet-snap', 'expanded');
    await expect(page.locator('.event-panel__scroll')).toBeVisible();
    await expect(page.locator('.primary-navigation--mobile')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight > window.innerHeight,
      ),
    ).toBe(false);

    if (viewport.width === 430) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(
        Number.parseFloat(
          await sheet.evaluate(
            (element) => getComputedStyle(element).transitionDuration,
          ),
        ),
      ).toBeLessThanOrEqual(0.001);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
  }

  await page.setViewportSize({ height: 800, width: 1280 });
  await page.goto('/explore');
  const desktopSheet = page.getByRole('complementary', {
    name: 'Campus discovery',
  });
  await expect(
    page.getByRole('button', { name: 'Expand event sheet' }),
  ).toBeHidden();
  await expect(
    desktopSheet.getByRole('heading', { name: 'Campus events' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Events/u }).click();
  const desktopLayout = await desktopSheet.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const exploration = element.parentElement?.getBoundingClientRect();
    const map =
      element.parentElement?.querySelector<HTMLElement>('.campus-map');
    if (!exploration || !map) throw new Error('Expected the Explore surface.');
    return {
      left: box.left,
      mapClearsSidebar: map.getBoundingClientRect().left >= box.right,
      top: box.top - exploration.top,
      transform: getComputedStyle(element).transform,
      width: box.width,
    };
  });
  expect(desktopLayout.left).toBe(0);
  expect(desktopLayout.mapClearsSidebar).toBe(true);
  expect(desktopLayout.top).toBe(0);
  expect(desktopLayout.transform).toBe('none');
  expect(desktopLayout.width).toBe(384);
  await expect(page.locator('.primary-navigation--mobile')).toBeHidden();
  await expectNoHorizontalOverflow(page);
});

test('keeps no-event discovery usable when location and map are unavailable', async ({
  page,
}) => {
  await mockExploreApi(page, []);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: async () => ({ state: 'denied' }) },
    });
  });
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/explore?map-failure');
  await expect(page.getByText('The map could not load.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Location access disabled' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: /^Events/u }).click();
  await expect(page.getByText('No events available.')).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Campus discovery' }),
  ).toHaveAttribute('data-sheet-snap', 'expanded');
  await expectNoHorizontalOverflow(page);
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
  token = ACCESS_TOKEN,
): Promise<T> {
  const result = await page.evaluate(
    async ({ body, method, path, token }) => {
      const response = await fetch(path, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(path.includes('/challenge-attempts')
            ? { 'X-Wits-Challenge-Contract-Version': '2' }
            : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        method,
      });
      const payload = (await response.json()) as unknown;
      return { payload, status: response.status };
    },
    { body, method, path: `${API_BASE_URL}${path}`, token },
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

async function dragExploreSheet(
  page: Page,
  movementY: number,
  options: { delayMs?: number; steps?: number } = {},
) {
  const handle = page.getByRole('button', {
    name: /event sheet|Lower event sheet/u,
  });
  const box = await handle.boundingBox();
  if (box === null) {
    throw new Error('Expected the Explore sheet handle to be visible.');
  }

  const steps = options.steps ?? 8;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const pointerTarget = await handle.evaluate(
    (element, point) => {
      const target = document.elementFromPoint(point.x, point.y);
      return {
        exploration: element
          .closest('.exploration-view')
          ?.getBoundingClientRect()
          .toJSON(),
        handle: element.getBoundingClientRect().toJSON(),
        matches: target === element || element.contains(target),
        target:
          target instanceof HTMLElement
            ? `${target.tagName}.${target.className}`
            : 'unknown',
      };
    },
    { x: startX, y: startY },
  );
  expect(pointerTarget.matches, JSON.stringify(pointerTarget)).toBe(true);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await expect(page.locator('.exploration-view')).toHaveAttribute(
    'data-sheet-dragging',
    'true',
  );
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(startX, startY + (movementY * step) / steps);
    if (options.delayMs) {
      await page.waitForTimeout(options.delayMs);
    }
  }
  await page.mouse.up();
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

async function mockExploreApi(
  page: Page,
  events: readonly object[] = EXPLORE_EVENTS,
) {
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/auth/me')) {
      await json(route, {
        connectionStrategy: 'auth0',
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
        events,
        requestId: 'explore-browser-events',
      });
      return;
    }
    if (pathname.endsWith('/offline-challenge-packs')) {
      await json(route, { packs: [] });
      return;
    }
    if (pathname.endsWith('/cards/collection')) {
      await json(route, {
        cards: buildStarterCards('wit'),
        requestId: 'explore-browser-collection',
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

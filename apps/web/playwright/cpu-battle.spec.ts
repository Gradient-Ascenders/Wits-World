import { expect, test, type Page, type Route } from '@playwright/test';
import path from 'node:path';

import { buildStarterCards } from '../tests/fixtures/cards';
import { buildSavedDeck } from '../tests/fixtures/decks';
import {
  actionResult,
  activeMatch,
  buildMatch,
  completedMatch,
  historyItem,
  MATCH_ID,
} from '../tests/fixtures/matches';
import type { CpuMatch } from '../src/api/matches';

const screenshotsDirectory = path.resolve(
  process.cwd(),
  '../../.pr-screenshots/issue-76',
);

test('completes a mocked authoritative CPU match through the production UI', async ({
  baseURL,
  browser,
  context,
}) => {
  const selectedDeck = buildSavedDeck({
    isSelected: true,
    name: 'Campus Five',
  });
  const cards = buildStarterCards('wit');
  const initial = buildMatch();
  const opening = activeMatch(1);
  const afterPower = activeMatch(2);
  const defeatedCreature = afterPower.state.player.creatures[0]!;
  const replacementCreature = afterPower.state.player.creatures[1]!;

  afterPower.state.player.powerCards[0]!.available = false;
  afterPower.state.player.usedPowerCardIds = [
    afterPower.state.player.powerCards[0]!.id,
  ];
  afterPower.state.legalActions = [
    { moveId: defeatedCreature.moves[0]!.id, type: 'use_move' },
  ];
  afterPower.lastAction = actionResult({
    powerCardId: afterPower.state.player.powerCards[0]!.id,
    type: 'use_power_card',
  });

  const replacement = buildMatch({
    lastAction: actionResult(
      {
        moveId: afterPower.state.cpu.activeCreature!.moves[0]!.id,
        type: 'use_move',
      },
      { defeatedCreatureId: defeatedCreature.id, side: 'cpu' },
    ),
    state: {
      ...afterPower.state,
      legalActions: [
        { creatureId: replacementCreature.id, type: 'select_replacement' },
      ],
      phase: 'replacement',
      player: {
        ...afterPower.state.player,
        activeCreatureId: null,
        creatures: [
          { ...defeatedCreature, currentHp: 0, defeated: true },
          replacementCreature,
          afterPower.state.player.creatures[2]!,
        ],
      },
      replacementSide: 'player',
      turnNumber: 3,
    },
    version: 3,
  });
  const continued = activeMatch(4);
  continued.state.player.activeCreatureId = replacementCreature.id;
  continued.state.player.creatures = replacement.state.player.creatures;
  continued.state.player.powerCards = afterPower.state.player.powerCards;
  continued.state.player.usedPowerCardIds =
    afterPower.state.player.usedPowerCardIds;
  continued.state.legalActions = [
    { moveId: replacementCreature.moves[0]!.id, type: 'use_move' },
  ];
  continued.lastAction = actionResult({
    creatureId: replacementCreature.id,
    type: 'select_replacement',
  });
  const reconciled = {
    ...continued,
    state: { ...continued.state, turnNumber: 4 },
    version: 5,
  } satisfies CpuMatch;
  const completed = completedMatch(6);

  const touchContext = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    hasTouch: true,
    isMobile: true,
    storageState: await context.storageState(),
    viewport: { height: 844, width: 390 },
  });

  try {
    const page = await touchContext.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const submittedBodies: unknown[] = [];
    let current: CpuMatch = initial;
    let actionNumber = 0;

    monitorBrowser(page, consoleErrors, pageErrors, failedRequests);
    await page.route('**/api/v1/cards/collection', (route) =>
      json(route, { cards, requestId: 'cpu-browser-cards' }),
    );
    await page.route('**/api/v1/decks', (route) =>
      json(route, { decks: [selectedDeck], requestId: 'cpu-browser-decks' }),
    );
    await page.route('**/api/v1/matches/**', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;

      if (pathname.endsWith('/matches/cpu')) {
        if (request.method() === 'GET') {
          await json(route, problem('CPU_MATCH_NOT_FOUND', 404), 404);
          return;
        }

        current = initial;
        await json(route, response(current), 201);
        return;
      }

      if (pathname.endsWith('/matches/history')) {
        await json(route, {
          matches: [historyItem(completed)],
          requestId: 'cpu-browser-history',
        });
        return;
      }

      if (pathname.endsWith('/actions')) {
        submittedBodies.push(request.postDataJSON());
        actionNumber += 1;

        if (actionNumber === 1) current = opening;
        if (actionNumber === 2) current = afterPower;
        if (actionNumber === 3) current = replacement;
        if (actionNumber === 4) current = continued;
        if (actionNumber === 5) {
          current = reconciled;
          await json(route, problem('CPU_MATCH_STALE_ACTION', 409), 409);
          return;
        }
        if (actionNumber === 6) current = completed;

        await json(route, response(current));
        return;
      }

      await json(route, response(current));
    });

    await page.goto('/decks');
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(
      0,
    );
    await expect(
      page.getByRole('heading', { name: 'Campus Five is active' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Start CPU match' }).tap();
    await expect(page).toHaveURL(`/matches/${MATCH_ID}`);

    const openingChoice = page.getByRole('button', {
      name: /Choose Creature\s*Wit Creature 1/,
    });
    await expect(openingChoice).toBeVisible();
    await openingChoice.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Your turn' }),
    ).toBeFocused();

    for (const viewport of [
      { height: 800, label: '360', width: 360 },
      { height: 844, label: '390', width: 390 },
      { height: 1024, label: 'tablet-768', width: 768 },
      { height: 800, label: 'desktop-1280', width: 1280 },
    ]) {
      await page.setViewportSize({
        height: viewport.height,
        width: viewport.width,
      });
      await expectNoHorizontalOverflow(page);
      await page.locator('.battle-page').screenshot({
        path: path.join(
          screenshotsDirectory,
          `${viewport.label}-active-battle.png`,
        ),
        style: '.skip-link, .primary-navigation { display: none !important; }',
      });
    }

    await page.setViewportSize({ height: 844, width: 390 });
    await page.getByRole('button', { name: 'Use Power card 1' }).tap();
    await expect(
      page.getByRole('heading', { name: 'Player used a Power card' }),
    ).toBeVisible();

    const normalMove = page.getByRole('button', {
      name: 'Use Knowledge Strike 1',
    });
    await normalMove.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Replacement required' }),
    ).toBeFocused();
    await expectNoHorizontalOverflow(page);
    await page.locator('.battle-page').screenshot({
      path: path.join(screenshotsDirectory, '390-replacement.png'),
      style: '.skip-link, .primary-navigation { display: none !important; }',
    });

    const replacementControl = page.getByRole('button', {
      name: /Use as replacement\s*Wit Creature 2/,
    });
    await replacementControl.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Your turn' }),
    ).toBeFocused();

    await page.getByRole('button', { name: 'Use Knowledge Strike 2' }).tap();
    await expect(
      page.getByText(/Authoritative match state restored/),
    ).toBeAttached();
    await page.getByRole('button', { name: 'Use Knowledge Strike 2' }).tap();
    await expect(
      page.getByRole('heading', { name: 'Victory — match saved' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole('link', { name: 'Open saved match history' }).tap();
    await expect(
      page.getByRole('heading', { name: 'Completed CPU matches' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'View saved match' }).tap();
    await expect(
      page.getByRole('heading', { name: 'Victory — match saved' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Victory — match saved' }),
    ).toBeVisible();

    expect(submittedBodies).toHaveLength(6);
    expect(submittedBodies).toEqual(
      submittedBodies.map((body, index) =>
        expect.objectContaining({ expectedVersion: index < 5 ? index : 5 }),
      ),
    );
    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(
      consoleErrors.filter(
        (message) => !message.includes('404') && !message.includes('409'),
      ),
    ).toEqual([]);
  } finally {
    await touchContext.close();
  }
});

test('resumes the owned active CPU match before presenting deck creation', async ({
  page,
}) => {
  const active = activeMatch(3);
  let activeLookups = 0;

  await page.route('**/api/v1/matches/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/matches/cpu')) activeLookups += 1;
    await json(route, response(active));
  });

  await page.goto('/matches');
  await expect(page).toHaveURL(`/matches/${MATCH_ID}`);
  await expect(page.getByRole('heading', { name: 'Your turn' })).toBeVisible();
  expect(activeLookups).toBe(1);
});

function response(match: CpuMatch) {
  return { ...match, requestId: `cpu-browser-match-${match.version}` };
}

function problem(code: string, status: number) {
  return {
    code,
    detail: 'Safe deterministic browser-test problem.',
    requestId: `cpu-browser-${code}`,
    status,
    title: 'Match request failed',
    type: 'about:blank',
  };
}

function monitorBrowser(
  page: Page,
  consoleErrors: string[],
  pageErrors: string[],
  failedRequests: string[],
) {
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push(
      `${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText ?? 'unknown'}`,
    );
  });
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

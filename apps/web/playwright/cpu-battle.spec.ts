import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from '@playwright/test';
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
  uuid,
} from '../tests/fixtures/matches';
import {
  activePvpSummary,
  pvpHistorySummary,
  pvpMatch,
} from '../tests/fixtures/pvp';
import type { CpuMatch } from '../src/api/matches';

const screenshotsDirectory = path.resolve(
  process.cwd(),
  '../../.pr-screenshots/issue-76',
);
const CURRENT_PLAYER_ID = '00000000-0000-4000-8000-000000009001';

test('shows rarity frames and confirms an authoritative CPU forfeit', async ({
  page,
}) => {
  await routeCurrentPlayer(page);
  const active = activeMatch(4);
  active.state.player.creatures[0]!.rarity = 'epic';
  active.state.cpu.activeCreature!.rarity = 'legendary';
  const forfeited = completedMatch(5);
  forfeited.winner = 'cpu';
  let submittedBody: unknown;
  await page.route('**/api/v1/matches/**', async (route) => {
    if (route.request().url().endsWith('/forfeit')) {
      submittedBody = route.request().postDataJSON();
      await json(route, response(forfeited));
      return;
    }
    await json(route, response(active));
  });

  await page.goto(`/matches/${MATCH_ID}`);
  await expect(
    page.locator('.combatant--player .card-frame--epic'),
  ).toBeVisible();
  await expect(
    page.locator('.combatant--cpu .card-frame--legendary'),
  ).toBeVisible();

  const forfeit = page.getByRole('button', { name: 'Forfeit match' });
  await forfeit.click();
  const dialog = page.getByRole('alertdialog', {
    name: 'Forfeit this battle?',
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep playing' }).click();
  await expect(forfeit).toBeFocused();
  await forfeit.click();
  await dialog.getByRole('button', { name: 'Confirm forfeit' }).click();

  await expect(
    page.getByRole('heading', { name: 'CPU victory — match saved' }),
  ).toBeVisible();
  expect(submittedBody).toEqual({ expectedVersion: 4 });
});

test('animates each server-confirmed action and damage beat on its target', async ({
  page,
}) => {
  await routeCurrentPlayer(page);
  const active = activeMatch(4);
  const resolved = activeMatch(5);
  resolved.battleLog = [
    {
      events: [
        {
          id: '5:0',
          kind: 'action',
          message: "Player's Wit Creature used Knowledge Strike 1.",
          sequence: 5,
          side: 'player',
        },
        {
          id: '5:1',
          kind: 'effect',
          message: "CPU's Grit Creature took 12 damage.",
          sequence: 5,
          side: 'cpu',
        },
      ],
      id: 'turn-1',
      label: 'Turn 1',
      turnNumber: 1,
    },
  ];
  await page.route('**/api/v1/matches/**', async (route) => {
    await json(
      route,
      response(route.request().method() === 'POST' ? resolved : active),
    );
  });

  await page.goto(`/matches/${MATCH_ID}`);
  await page.getByRole('button', { name: /Knowledge Strike 1/ }).click();
  await expect(page.locator('.combatant--player')).toHaveAttribute(
    'data-feedback',
    'action',
  );
  await expect(
    page.locator('.combatant--player .combatant__feedback'),
  ).toHaveText('Your move');
  await expect(page.locator('.combatant--cpu')).toHaveAttribute(
    'data-feedback',
    'damage',
  );
  await expect(page.locator('.combatant--cpu .combatant__feedback')).toHaveText(
    '−12 HP',
  );
});

test('hands mobile Creature sheet gestures between scrolling and dragging', async ({
  page,
}) => {
  await routeCurrentPlayer(page);
  const match = activeMatch(1);
  const creature = match.state.player.creatures[0]!;
  creature.name = 'Quillip';
  const move = creature.moves[0]!;
  creature.moves = Array.from({ length: 12 }, (_, i) => ({
    ...move,
    id: uuid(800 + i),
  }));
  await page.route('**/api/v1/matches/**', (route) =>
    json(route, response(match)),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/matches/${MATCH_ID}`);
  const trigger = page.getByRole('button', {
    name: 'View Quillip details',
    exact: true,
  });
  await trigger.click();
  const sheet = page.getByRole('dialog', { name: 'Quillip', exact: true });
  const settle = async () => {
    await sheet.evaluate(async (node) => {
      await Promise.all(node.getAnimations().map((a) => a.finished));
    });
  };
  await settle();
  expect((await sheet.boundingBox())!.height).toBeCloseTo(844 * 0.85, 0);
  const cdp = await page.context().newCDPSession(page);
  const drag = async (
    x: number,
    y: number,
    distance: number,
    steps = 12,
    pause = 20,
  ) => {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + (distance * i) / steps }],
      });
      if (pause) await page.waitForTimeout(pause);
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  };
  const header = sheet.locator('header');
  let headerBox = (await header.boundingBox())!;
  await drag(160, headerBox.y + 25, -90);
  await settle();
  expect((await sheet.boundingBox())!.height).toBeCloseTo(844 * 0.98, 0);
  headerBox = (await header.boundingBox())!;
  await drag(160, headerBox.y + 25, 25);
  await settle();
  await expect(sheet).toBeVisible();
  const body = sheet.locator('.battle-creature-dialog__body');
  await drag(190, 620, -180);
  expect(await body.evaluate((node) => node.scrollTop)).toBeGreaterThan(100);
  await body.evaluate((node) => {
    node.scrollTop = 400;
  });
  await drag(190, 380, 80);
  await expect(sheet).toBeVisible();
  expect(await body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  // One continuous pull first consumes scroll, then moves the sheet.
  await body.evaluate((node) => {
    node.scrollTop = 45;
  });
  await drag(190, 350, 130);
  await settle();
  await expect(sheet).toBeVisible();
  expect(await body.evaluate((node) => node.scrollTop)).toBe(0);
  expect((await sheet.boundingBox())!.height).toBeCloseTo(844 * 0.85, 0);
  await page.screenshot({
    path: path.join(screenshotsDirectory, '390-gesture-sheet.png'),
  });
  headerBox = (await header.boundingBox())!;
  await drag(160, headerBox.y + 25, 310);
  await expect(sheet).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await settle();
  headerBox = (await header.boundingBox())!;
  await drag(160, headerBox.y + 25, 120, 3, 0);
  await expect(sheet).not.toBeVisible();
  await trigger.click();
  await settle();
  await page.mouse.click(15, 20);
  await expect(sheet).not.toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await trigger.click();
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate((node) => node.getAnimations().length)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(sheet).not.toBeVisible();
});

test('opens Creature details from active and bench pictures', async ({
  page,
}) => {
  await routeCurrentPlayer(page);
  const match = activeMatch(1);
  match.state.player.creatures[0]!.currentHp = 15;
  match.state.player.creatures[0]!.remainingPower = 0;
  match.state.player.creatures.forEach((creature, index) => {
    creature.name = ['Quillip', 'Ciphra', 'Prismole'][index]!;
  });
  await page.route('**/api/v1/matches/**', (route) =>
    json(route, response(match)),
  );
  await page.goto(`/matches/${MATCH_ID}`);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const picture = page.getByRole('button', {
      name: 'View Quillip details',
      exact: true,
    });
    await picture.click();
    const dialog = page.getByRole('dialog', { name: 'Quillip', exact: true });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.locator('.battle-creature-dialog__stats dd'),
    ).toHaveText(['100', '10']);
    await dialog.evaluate(async (node) => {
      await Promise.all(
        node.getAnimations().map((animation) => animation.finished),
      );
    });
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    if (width === 390) expect(box!.y + box!.height).toBeCloseTo(900, 0);
    else expect(box!.y + box!.height / 2).toBeCloseTo(450, 0);
    await expect(
      dialog.getByRole('heading', { name: 'Moves', exact: true }),
    ).toBeVisible();
    await dialog.screenshot({
      path: path.join(screenshotsDirectory, `${width}-creature-details.png`),
    });
    if (width === 390) {
      await page.setViewportSize({ width, height: 260 });
      const header = dialog.locator('header');
      const before = await header.boundingBox();
      const body = dialog.locator('.battle-creature-dialog__body');
      await body.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      expect(await body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      expect(await header.boundingBox()).toEqual(before);
      await expect(
        dialog.getByRole('button', { name: 'Close Creature details' }),
      ).toBeInViewport();
      await page.setViewportSize({ width, height: 900 });
    }
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(picture).toBeFocused();
    await page.locator('.battle-bench').evaluate((node) => {
      (node as HTMLDetailsElement).open = true;
    });
    await page
      .getByRole('button', { name: 'View Ciphra details', exact: true })
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Ciphra', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Close Creature details', exact: true })
      .click();
    await expectNoHorizontalOverflow(page);
  }
});

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
  const openingPlayer = opening.state.player.creatures[0]!;
  openingPlayer.name = 'Campus Scholar';
  openingPlayer.activeModifiers = [
    {
      operation: 'multiply',
      percentage: 10,
      remainingTurns: 2,
      stat: 'damage_multiplier',
    },
    {
      operation: 'multiply',
      percentage: 10,
      remainingTurns: null,
      stat: 'damage_multiplier',
    },
  ];
  openingPlayer.moves = [
    {
      effects: [
        {
          damageMultiplier: null,
          effectType: 'damage',
          effectValue: 7,
          modifier: null,
        },
      ],
      id: openingPlayer.moves[0]!.id,
      moveType: 'basic',
      name: 'Measured Strike',
      powerCost: 0,
    },
    {
      effects: [
        {
          damageMultiplier: 0.85,
          effectType: 'debuff',
          effectValue: 15,
          modifier: {
            durationTurns: 3,
            operation: 'multiply',
            stat: 'damage_multiplier',
          },
        },
      ],
      id: '00000000-0000-4000-8000-000000001299',
      moveType: 'grit',
      name: 'Brace',
      powerCost: 11,
    },
    {
      effects: [
        {
          damageMultiplier: null,
          effectType: 'damage',
          effectValue: 9,
          modifier: null,
        },
      ],
      id: '00000000-0000-4000-8000-000000001298',
      moveType: 'spirit',
      name: 'Hidden Angle',
      powerCost: 2,
    },
    {
      effects: [
        {
          damageMultiplier: null,
          effectType: 'damage',
          effectValue: 8,
          modifier: null,
        },
      ],
      id: '00000000-0000-4000-8000-000000001297',
      moveType: 'grit',
      name: 'Stone Rhythm',
      powerCost: 1,
    },
  ];
  opening.state.cpu.activeCreature!.name = 'Braam Sentinel';
  opening.state.cpu.activeCreature!.activeModifiers = [
    {
      operation: 'multiply',
      percentage: -100,
      remainingTurns: 2,
      stat: 'damage_multiplier',
    },
  ];
  opening.state.player.powerCards[0] = {
    affinity: 'wit',
    available: true,
    effects: [
      {
        damageMultiplier: null,
        effectType: 'damage',
        effectValue: 8,
        modifier: null,
      },
      {
        damageMultiplier: null,
        effectType: 'buff',
        effectValue: 3,
        modifier: {
          durationTurns: null,
          operation: 'add',
          stat: 'power',
        },
      },
    ],
    id: opening.state.player.powerCards[0]!.id,
    name: 'Tactical Surge',
  };
  opening.state.legalActions = [
    { moveId: openingPlayer.moves[0]!.id, type: 'use_move' },
    { moveId: openingPlayer.moves[2]!.id, type: 'use_move' },
    { moveId: openingPlayer.moves[3]!.id, type: 'use_move' },
    {
      powerCardId: opening.state.player.powerCards[0]!.id,
      type: 'use_power_card',
    },
  ];
  opening.battleLog = [
    {
      events: [
        {
          id: '1:0',
          kind: 'action',
          message: 'Player selected Campus Scholar.',
          sequence: 1,
          side: 'player',
        },
        {
          id: '2:0',
          kind: 'action',
          message: 'CPU revealed Braam Sentinel.',
          sequence: 2,
          side: 'cpu',
        },
        {
          id: '2:1',
          kind: 'turn',
          message: 'Turn 1 began. Player has the first action.',
          sequence: 2,
          side: 'player',
        },
      ],
      id: 'opening',
      label: 'Opening',
      turnNumber: 0,
    },
  ];
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
  afterPower.battleLog = [
    ...structuredClone(opening.battleLog),
    {
      events: [
        {
          id: '3:0',
          kind: 'action',
          message: 'Player used Tactical Surge.',
          sequence: 3,
          side: 'player',
        },
        {
          id: '3:1',
          kind: 'effect',
          message: "CPU's Braam Sentinel took 8 damage.",
          sequence: 3,
          side: 'cpu',
        },
        {
          id: '3:2',
          kind: 'effect',
          message: "Player's Campus Scholar restored 3 Power.",
          sequence: 3,
          side: 'player',
        },
        {
          id: '3:3',
          kind: 'turn',
          message: 'Turn 1 ended. CPU is next.',
          sequence: 3,
          side: 'cpu',
        },
      ],
      id: 'turn-1',
      label: 'Turn 1',
      turnNumber: 1,
    },
  ];

  const replacement = buildMatch({
    battleLog: [
      ...structuredClone(afterPower.battleLog),
      {
        events: [
          {
            id: '4:0',
            kind: 'action',
            message: "Player's Campus Scholar used Measured Strike.",
            sequence: 4,
            side: 'player',
          },
          {
            id: '5:0',
            kind: 'action',
            message: "CPU's Braam Sentinel used Quiet Counter.",
            sequence: 5,
            side: 'cpu',
          },
          {
            id: '5:1',
            kind: 'defeat',
            message: "Player's Campus Scholar was defeated.",
            sequence: 5,
            side: 'player',
          },
          {
            id: '5:2',
            kind: 'turn',
            message: 'Turn 2 ended. Player must choose a replacement.',
            sequence: 5,
            side: 'player',
          },
        ],
        id: 'turn-2',
        label: 'Turn 2',
        turnNumber: 2,
      },
    ],
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
  continued.battleLog = [
    ...structuredClone(replacement.battleLog),
    {
      events: [
        {
          id: '6:0',
          kind: 'action',
          message: 'Player sent out Wit Creature 2 as a replacement.',
          sequence: 6,
          side: 'player',
        },
      ],
      id: 'turn-3',
      label: 'Turn 3',
      turnNumber: 3,
    },
  ];
  const reconciled = {
    ...continued,
    state: { ...continued.state, turnNumber: 4 },
    version: 5,
  } satisfies CpuMatch;
  const completed = completedMatch(6);
  completed.battleLog = [
    ...structuredClone(continued.battleLog),
    {
      events: [
        {
          id: '7:0',
          kind: 'action',
          message: "Player's Wit Creature 2 used Knowledge Strike 2.",
          sequence: 7,
          side: 'player',
        },
        {
          id: '7:1',
          kind: 'defeat',
          message: "CPU's Braam Sentinel was defeated.",
          sequence: 7,
          side: 'cpu',
        },
        {
          id: '7:2',
          kind: 'result',
          message: 'Player won the match.',
          sequence: 7,
          side: 'player',
        },
      ],
      id: 'turn-4',
      label: 'Turn 4',
      turnNumber: 4,
    },
  ];

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
    await routeCurrentPlayer(page);
    await page.route('**/api/v1/cards/collection', (route) =>
      json(route, { cards, requestId: 'cpu-browser-cards' }),
    );
    await page.route('**/api/v1/decks', (route) =>
      json(route, { decks: [selectedDeck], requestId: 'cpu-browser-decks' }),
    );
    await page.route('**/api/v1/matches/**', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;

      if (pathname.endsWith('/matches/pvp/history')) {
        await json(route, {
          matches: [],
          nextCursor: null,
          requestId: 'cpu-browser-pvp-history',
        });
        return;
      }

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
    await expect(page.locator('.site-footer')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { exact: true, name: 'Campus Five' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Start CPU match' }).tap();
    await expect(page).toHaveURL(`/matches/${MATCH_ID}`);
    await expect(
      page.getByRole('heading', { name: 'Choose your opening Creature' }),
    ).toBeVisible();
    await expect(page.locator('.battle-turn-indicator')).toHaveText(
      'YOUR TURN',
    );

    for (const viewport of [
      { columns: 1, height: 844, label: '390', width: 390 },
      { columns: 2, height: 1024, label: 'tablet-768', width: 768 },
      { columns: 3, height: 800, label: 'desktop-1440', width: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
      await expectCreatureChoiceColumns(page, viewport.columns);
      if (viewport.width >= 1024) {
        await expectBattleStageFirstDesktopLayout(page);
      }
      if (viewport.width < 1200) {
        await expect(page.locator('.site-header')).toBeHidden();
      } else {
        await expect(page.locator('.site-header')).toBeVisible();
      }
      await page.locator('.battle-page').screenshot({
        path: path.join(
          screenshotsDirectory,
          `${viewport.label}-opening-selection.png`,
        ),
        style: '.skip-link, .primary-navigation { display: none !important; }',
      });
    }

    await page.setViewportSize({ height: 844, width: 390 });
    await expectPrimaryActionWithinViewport(page);
    await expectActionContentFits(page);

    const openingChoice = page.getByRole('button', {
      name: /Choose Creature\s*Wit Creature 1/,
    });
    await expect(openingChoice).toBeVisible();
    await openingChoice.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Your turn' }),
    ).toBeFocused();
    await expectPrimaryActionWithinViewport(page);
    const battleLogSummary = page.locator('.battle-log > summary');
    await expect(battleLogSummary).toContainText('CPU revealed Braam Sentinel');
    await battleLogSummary.tap();
    const completeLog = page.getByRole('log', {
      name: 'Complete authoritative battle log',
    });
    await expect(completeLog).toBeVisible();
    await expect(completeLog).toContainText('You selected Campus Scholar.');
    await expect(completeLog).toContainText(
      'Turn 1 began. Player has the first action.',
    );
    await battleLogSummary.tap();
    await expect(completeLog).toBeHidden();

    const zeroCostMove = page.getByRole('button', {
      name: /Measured Strike.*Basic.*7 base damage.*0 Power/i,
    });
    await expect(zeroCostMove).toBeEnabled();
    await expect(
      page.getByRole('button', {
        name: /Brace.*Opponent damage −15%.*3 turns.*11 Power/i,
      }),
    ).toBeDisabled();
    await page.getByRole('tab', { name: /^Power/ }).click();
    await expect(
      page.getByRole('button', {
        name: /Tactical Surge.*8 base damage.*Restore 3 Power.*One use/i,
      }),
    ).toBeEnabled();
    await expect(page.getByText('Damage +10% · 2 turns')).toBeVisible();
    await expect(page.getByText('Damage +10% · Rest of battle')).toBeVisible();
    await expect(page.getByText('Damage −100% · 2 turns')).toBeVisible();
    await expectActionContentFits(page);
    for (const viewport of [
      { height: 844, label: '390', width: 390 },
      { height: 1024, label: 'tablet-768', width: 768 },
      { height: 800, label: 'desktop-1440', width: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
      await expectControlsContainTheirContent(page);
      if (viewport.width >= 1024) {
        await expectBattleStageFirstDesktopLayout(page);
      }
      await page.locator('.battle-page').screenshot({
        path: path.join(
          screenshotsDirectory,
          `${viewport.label}-power-actions.png`,
        ),
        style: '.skip-link, .primary-navigation { display: none !important; }',
      });
    }
    await page.setViewportSize({ height: 844, width: 390 });

    const powerTab = page.getByRole('tab', { name: /^Power/ });
    await powerTab.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: /^Moves/ })).toBeFocused();
    await expect(page.getByRole('tab', { name: /^Moves/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: /^Power/ })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /^Moves/ })).toBeFocused();
    await expectActionContentFits(page);
    const moveBoxes = await page
      .locator('.battle-action-control:visible')
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().x),
      );
    expect(new Set(moveBoxes).size).toBe(1);
    await zeroCostMove.focus();
    await expect(zeroCostMove).toBeFocused();
    expect(
      await zeroCostMove.evaluate(
        (element) => getComputedStyle(element).outlineStyle,
      ),
    ).not.toBe('none');

    for (const viewport of [
      { height: 844, label: '390', width: 390 },
      { height: 1024, label: 'tablet-768', width: 768 },
      { height: 800, label: 'desktop-1440', width: 1440 },
    ]) {
      await page.setViewportSize({
        height: viewport.height,
        width: viewport.width,
      });
      await expectNoHorizontalOverflow(page);
      await expectControlsContainTheirContent(page);
      if (viewport.width >= 1024) {
        await expectBattleStageFirstDesktopLayout(page);
      }
      if (viewport.width < 1200) {
        await expect(page.locator('.site-header')).toBeHidden();
      } else {
        await expect(page.locator('.site-header')).toBeVisible();
      }
      await page.locator('.battle-page').screenshot({
        path: path.join(
          screenshotsDirectory,
          `${viewport.label}-active-battle.png`,
        ),
        style: '.skip-link, .primary-navigation { display: none !important; }',
      });
    }

    await page.setViewportSize({ height: 844, width: 390 });
    await page.getByRole('tab', { name: /^Power/ }).tap();
    await page.getByRole('button', { name: /Tactical Surge/ }).tap();
    await expect(page.locator('.battle-log > summary')).toContainText(
      'You used Tactical Surge',
    );

    await page.getByRole('tab', { name: /^Moves/ }).tap();
    const normalMove = page.getByRole('button', {
      name: /Knowledge Strike 1/,
    });
    await normalMove.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Replacement required' }),
    ).toBeFocused();
    await expect(page.locator('.battle-turn-indicator')).toHaveText(
      'YOUR TURN',
    );
    await expectNoHorizontalOverflow(page);
    await expectPrimaryActionWithinViewport(page);
    await expectActionContentFits(page);
    await expectVerticallySeparated(
      page.locator('.battle-actions'),
      page.locator('.battle-side-rail'),
    );
    for (const viewport of [
      { columns: 1, height: 844, label: '390', width: 390 },
      { columns: 2, height: 1024, label: 'tablet-768', width: 768 },
      { columns: 3, height: 800, label: 'desktop-1440', width: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
      await expectControlsContainTheirContent(page);
      await expectCreatureChoiceColumns(page, viewport.columns);
      if (viewport.width >= 1024) {
        await expectBattleStageFirstDesktopLayout(page);
      }
      await page.locator('.battle-page').screenshot({
        path: path.join(
          screenshotsDirectory,
          `${viewport.label}-replacement.png`,
        ),
        style: '.skip-link, .primary-navigation { display: none !important; }',
      });
    }
    await page.setViewportSize({ height: 844, width: 390 });

    const replacementControl = page.getByRole('button', {
      name: /Use as replacement\s*Wit Creature 2/,
    });
    await replacementControl.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Your turn' }),
    ).toBeFocused();

    await page.getByRole('button', { name: /Knowledge Strike 2/ }).tap();
    await expect(
      page.getByText(/Authoritative match state restored/),
    ).toBeAttached();
    await page.getByRole('button', { name: /Knowledge Strike 2/ }).tap();
    await expect(
      page.getByRole('heading', { name: 'Victory — match saved' }),
    ).toBeVisible();
    for (const viewport of [
      { height: 844, label: '390', width: 390 },
      { height: 1024, label: 'tablet-768', width: 768 },
      { height: 800, label: 'desktop-1440', width: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
      if (viewport.width >= 1024) {
        await expectCompletedSideRailLayout(page);
      }
      await page.locator('.battle-page').screenshot({
        path: path.join(
          screenshotsDirectory,
          `${viewport.label}-completed-battle.png`,
        ),
        style: '.skip-link, .primary-navigation { display: none !important; }',
      });
    }
    await page.setViewportSize({ height: 844, width: 390 });

    const completedLogSummary = page.locator('.battle-log > summary');
    await expect(completedLogSummary).toContainText(
      'Your Wit Creature 2 used Knowledge Strike 2',
    );
    await completedLogSummary.tap();
    const completedLog = page.getByRole('log', {
      name: 'Complete authoritative battle log',
    });
    await expect(completedLog).toContainText('You won the battle.');
    await expect
      .poll(() =>
        completedLog.evaluate(
          (element) => element.clientHeight / window.innerHeight,
        ),
      )
      .toBeLessThanOrEqual(0.5);
    await page.locator('.battle-page').screenshot({
      path: path.join(screenshotsDirectory, '390-battle-log.png'),
      style: '.skip-link, .primary-navigation { display: none !important; }',
    });
    expect(
      await completedLog.evaluate(
        (element) =>
          Math.abs(
            element.scrollHeight - element.clientHeight - element.scrollTop,
          ) <= 2,
      ),
    ).toBe(true);
    await completedLogSummary.tap();

    await page.getByRole('link', { name: 'Match history' }).tap();
    await expect(
      page.getByRole('heading', { name: 'Battle history' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'View saved match' }).tap();
    await expect(
      page.getByRole('heading', { name: 'Victory — match saved' }),
    ).toBeVisible();
    await page.locator('.battle-log > summary').tap();
    await expect(
      page.getByRole('log', { name: 'Complete authoritative battle log' }),
    ).toContainText('You selected Campus Scholar.');
    await expect(
      page.getByRole('log', { name: 'Complete authoritative battle log' }),
    ).toContainText('You won the battle.');
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Victory — match saved' }),
    ).toBeVisible();
    await page.locator('.battle-log > summary').tap();
    await expect(
      page.getByRole('log', { name: 'Complete authoritative battle log' }),
    ).toContainText('You selected Campus Scholar.');
    await expect(
      page.getByRole('log', { name: 'Complete authoritative battle log' }),
    ).toContainText('You won the battle.');

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

test('offers the owned active CPU match for explicit resume', async ({
  page,
}) => {
  const active = activeMatch(3);
  let activeLookups = 0;

  await routeCurrentPlayer(page);
  await page.route('**/api/v1/matches/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/matches/pvp/history')) {
      await json(route, {
        matches: [],
        nextCursor: null,
        requestId: 'cpu-browser-active-pvp-history',
      });
      return;
    }
    if (pathname.endsWith('/matches/pvp')) {
      await json(route, {
        matches: [],
        nextCursor: null,
        requestId: 'cpu-browser-active-pvp',
      });
      return;
    }
    if (pathname.endsWith('/matches/history')) {
      await json(route, {
        matches: [],
        requestId: 'cpu-browser-active-history',
      });
      return;
    }
    if (pathname.endsWith('/matches/cpu')) activeLookups += 1;
    await json(route, response(active));
  });

  await page.goto('/matches');
  await expect(page.locator('.site-footer')).toHaveCount(0);
  await expect(page).toHaveURL('/matches');
  await expect(
    page.getByRole('heading', { name: 'CPU Battle', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start CPU battle' }),
  ).toHaveCount(0);

  for (const viewport of [
    { height: 844, width: 390 },
    { height: 1024, width: 768 },
    { height: 800, width: 1440 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    await expect(
      page.getByRole('link', { name: 'Resume CPU battle' }),
    ).toBeVisible();
  }

  await page.getByRole('link', { name: 'Resume CPU battle' }).click();
  await expect(page).toHaveURL(`/matches/${MATCH_ID}`);
  await expect(page.getByRole('heading', { name: 'Your turn' })).toBeVisible();
  expect(activeLookups).toBe(1);
});

test('keeps processing, timeout, and error states focused with long actions', async ({
  page,
}) => {
  const playerTurn = activeMatch(8);
  const playerCreature = playerTurn.state.player.creatures[0]!;
  playerCreature.name =
    'The exceptionally observant scholar of the Great Hall archives';
  playerCreature.moves[0]!.name =
    'Carefully reason through every clue in the campus archive';
  playerCreature.moves[0]!.effects = [
    {
      damageMultiplier: 1.25,
      effectType: 'buff',
      effectValue: 25,
      modifier: {
        durationTurns: 3,
        operation: 'multiply',
        stat: 'damage_multiplier',
      },
    },
  ];
  playerTurn.state.player.powerCards[0]!.name =
    'A very long institutional memory Power card';
  playerTurn.lastAction = actionResult({ type: 'timeout' }, { side: 'cpu' });
  playerTurn.battleLog = [
    {
      events: [
        {
          id: '8:0',
          kind: 'action',
          message: "CPU's turn timed out.",
          sequence: 8,
          side: 'cpu',
        },
        {
          id: '8:1',
          kind: 'turn',
          message: 'Turn 1 ended. Player is next.',
          sequence: 8,
          side: 'player',
        },
      ],
      id: 'turn-1',
      label: 'Turn 1',
      turnNumber: 1,
    },
  ];

  const cpuTurn = activeMatch(9);
  cpuTurn.state.currentSide = 'cpu';
  cpuTurn.state.legalActions = [];
  cpuTurn.lastAction = actionResult({ type: 'timeout' }, { side: 'cpu' });
  cpuTurn.battleLog = structuredClone(playerTurn.battleLog);

  let current = playerTurn;
  let releaseAction: (() => void) | undefined;
  const actionGate = new Promise<void>((resolve) => {
    releaseAction = resolve;
  });

  await routeCurrentPlayer(page);
  await page.route('**/api/v1/matches/**', async (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/actions')) {
      await actionGate;
      await json(route, problem('CPU_MATCH_UNAVAILABLE', 503), 503);
      return;
    }
    await json(route, response(current));
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(`/matches/${MATCH_ID}`);
  await expect(page.locator('.primary-navigation--mobile')).toHaveCount(0);
  await expect(page.locator('.site-footer')).toHaveCount(0);
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(page.locator('.battle-log > summary')).toContainText(
    'The CPU’s turn timed out',
  );
  await expectNoHorizontalOverflow(page);
  await expectControlsContainTheirContent(page);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page.locator('.battle-log').evaluate((element) => {
      const duration = getComputedStyle(element).animationDuration;
      return duration.endsWith('ms')
        ? Number.parseFloat(duration)
        : Number.parseFloat(duration) * 1000;
    }),
  ).toBeLessThanOrEqual(1);

  const battleDetails = page.locator('.battle-details > summary');
  await battleDetails.click();
  await expect(page.getByText('Match version', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Server deadline', { exact: true }),
  ).toBeVisible();
  await page.locator('.battle-page').screenshot({
    path: path.join(screenshotsDirectory, '390-battle-details.png'),
    style: '.skip-link, .primary-navigation { display: none !important; }',
  });
  await page.keyboard.press('Escape');
  await expect(page.getByText('Match version', { exact: true })).toBeHidden();
  await expect(battleDetails).toBeFocused();

  const hpBefore = await page
    .locator('.combatant--player .combatant__meter strong')
    .textContent();
  const longMove = page.getByRole('button', {
    name: /Carefully reason through every clue/,
  });
  await longMove.click();
  await expect(
    page.getByText('PROCESSING YOUR ACTION…', { exact: true }),
  ).toBeVisible();
  await expect(longMove).toBeDisabled();
  await expect(
    page.locator('.combatant--player .combatant__meter strong'),
  ).toHaveText(hpBefore ?? '');

  releaseAction?.();
  await expect(page.getByRole('alert')).toContainText('Action not confirmed');
  await expect(page.getByRole('alert')).toBeFocused();

  current = cpuTurn;
  await page.getByRole('button', { name: 'Reload match state' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'CPU turn resolving' }),
  ).toBeVisible();
  await expect(
    page.getByText("OPPONENT'S TURN", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.battle-action-control').first()).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  await expectPrimaryActionWithinViewport(page);
  await expectVerticallySeparated(
    page.locator('.battle-actions'),
    page.locator('.battle-side-rail'),
  );
  await page.locator('.battle-page').screenshot({
    path: path.join(screenshotsDirectory, '390-cpu-turn.png'),
    style: '.skip-link, .primary-navigation { display: none !important; }',
  });

  for (const viewport of [
    { height: 1024, label: 'tablet-768', width: 768 },
    { height: 800, label: 'desktop-1440', width: 1440 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    await expectControlsContainTheirContent(page);
    if (viewport.width >= 1024) {
      await expectBattleStageFirstDesktopLayout(page);
    }
    if (viewport.width < 1200) {
      await expect(page.locator('.site-header')).toBeHidden();
    } else {
      await expect(page.locator('.site-header')).toBeVisible();
    }
    await page.locator('.battle-page').screenshot({
      path: path.join(screenshotsDirectory, `${viewport.label}-cpu-turn.png`),
      style: '.skip-link, .primary-navigation { display: none !important; }',
    });
  }
});

test('renders recent results and starts from the selected deck dashboard', async ({
  page,
}) => {
  const selectedDeck = buildSavedDeck({
    isSelected: true,
    name: 'Campus Five',
  });
  const results = [
    {
      ...historyItem(),
      completedAt: '2026-08-12T12:00:00.000Z',
      matchId: uuid(1601),
    },
    {
      ...historyItem(),
      completedAt: '2026-08-16T12:00:00.000Z',
      matchId: uuid(1602),
    },
    {
      ...historyItem(),
      completedAt: '2026-08-14T12:00:00.000Z',
      matchId: uuid(1603),
      winner: 'cpu' as const,
    },
    {
      ...historyItem(),
      completedAt: '2026-08-15T12:00:00.000Z',
      matchId: uuid(1604),
    },
  ];
  const initial = buildMatch();
  const activePlayerBattle = activePvpSummary();
  const playerResult = pvpHistorySummary(
    pvpMatch({
      completedAt: '2026-08-17T12:00:00.000Z',
      matchId: uuid(1605),
      status: 'completed',
    }),
  );
  let active: CpuMatch | null = null;
  let createRequests = 0;
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  monitorBrowser(page, consoleErrors, pageErrors, failedRequests);
  await routeCurrentPlayer(page);
  await page.route('**/api/v1/decks', (route) =>
    json(route, { decks: [selectedDeck], requestId: 'dashboard-decks' }),
  );
  await page.route('**/api/v1/matches/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname.endsWith('/matches/pvp/history')) {
      await json(route, {
        matches: [playerResult],
        nextCursor: null,
        requestId: 'dashboard-pvp-history',
      });
      return;
    }
    if (pathname.endsWith('/matches/pvp')) {
      await json(route, {
        matches: [activePlayerBattle],
        nextCursor: null,
        requestId: 'dashboard-active-pvp',
      });
      return;
    }

    if (pathname.endsWith('/matches/history')) {
      await json(route, { matches: results, requestId: 'dashboard-history' });
      return;
    }

    if (pathname.endsWith('/matches/cpu')) {
      if (request.method() === 'GET') {
        if (active) {
          await json(route, response(active));
        } else {
          await json(route, problem('CPU_MATCH_NOT_FOUND', 404), 404);
        }
        return;
      }

      createRequests += 1;
      active = initial;
      await json(route, response(initial), 201);
      return;
    }

    await json(route, response(active ?? initial));
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/matches');
  await expect(
    page.getByRole('heading', { exact: true, name: 'Battles' }),
  ).toBeFocused();
  await expect(
    page.getByRole('heading', { name: 'CPU Battle', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Campus Five', { exact: true })).toHaveCount(1);
  await expect(
    page.getByRole('link', { name: 'Continue player battle' }),
  ).toHaveAttribute('href', `/matches/pvp/${activePlayerBattle.matchId}`);
  await expect(
    page
      .getByRole('list', { name: 'Recent battle results' })
      .getByRole('listitem'),
  ).toHaveCount(5);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ height: 1024, width: 768 });
  await expectNoHorizontalOverflow(page);
  await expect(
    page.getByRole('button', { name: 'Start CPU battle' }),
  ).toBeVisible();

  await page.setViewportSize({ height: 800, width: 1440 });
  await expectNoHorizontalOverflow(page);
  const modeCards = page.locator('.battle-mode-card');
  const cpuBox = await modeCards.nth(0).boundingBox();
  const playerBox = await modeCards.nth(1).boundingBox();
  const resultsBox = await page.locator('.recent-results').boundingBox();
  expect(cpuBox).not.toBeNull();
  expect(playerBox).not.toBeNull();
  expect(resultsBox).not.toBeNull();
  expect(playerBox!.x).toBeGreaterThan(cpuBox!.x);
  expect(playerBox!.y).toBe(cpuBox!.y);
  expect(resultsBox!.y).toBeGreaterThan(cpuBox!.y + cpuBox!.height);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1024 });
    await page.locator('.matches-page').screenshot({
      path: path.join(screenshotsDirectory, `${width}-match-hub.png`),
    });
  }

  await page.getByRole('link', { name: 'View history' }).click();
  await expect(page).toHaveURL('/matches/history');
  await expect(page.locator('.site-footer')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Battle history' }),
  ).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Completed battles' }).getByRole('listitem'),
  ).toHaveCount(results.length + 1);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1024 });
    await expectNoHorizontalOverflow(page);
    await page.locator('.matches-page').screenshot({
      path: path.join(screenshotsDirectory, `${width}-match-history.png`),
    });
  }

  await page.getByRole('link', { name: 'Back to battles' }).click();
  await expect(page).toHaveURL('/matches');
  await page.getByRole('button', { name: 'Start CPU battle' }).click();
  await expect(page).toHaveURL(`/matches/${MATCH_ID}`);
  await expect(
    page.getByRole('heading', { name: 'Choose your opening Creature' }),
  ).toBeVisible();
  expect(createRequests).toBe(1);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(consoleErrors.filter((message) => !message.includes('404'))).toEqual(
    [],
  );
});

test('shows deck recovery without exposing a conflicting start action', async ({
  page,
}) => {
  await routeCurrentPlayer(page);
  await page.route('**/api/v1/decks', (route) =>
    json(route, { decks: [], requestId: 'dashboard-no-deck' }),
  );
  await page.route('**/api/v1/matches/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/matches/pvp/history')) {
      await json(route, {
        matches: [],
        nextCursor: null,
        requestId: 'dashboard-empty-pvp-history',
      });
      return;
    }
    if (pathname.endsWith('/matches/pvp')) {
      await json(route, {
        matches: [],
        nextCursor: null,
        requestId: 'dashboard-empty-active-pvp',
      });
      return;
    }
    if (pathname.endsWith('/matches/history')) {
      await json(route, { matches: [], requestId: 'dashboard-empty-history' });
      return;
    }
    await json(route, problem('CPU_MATCH_NOT_FOUND', 404), 404);
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/matches');
  await expect(
    page.getByRole('heading', { name: 'CPU Battle', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Choose deck' })).toHaveAttribute(
    'href',
    '/decks',
  );
  await expect(
    page.getByRole('button', { name: 'Start CPU battle' }),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('keeps the desktop battlefield stable when bench and details expand', async ({
  page,
}) => {
  await routeCurrentPlayer(page);
  const match = activeMatch(1);
  match.state.player.creatures.forEach((creature, index) => {
    creature.name = ['Quillip', 'Ciphra', 'Prismole'][index]!;
  });
  match.state.cpu.activeCreature!.name = 'Quillip';
  match.battleLog = Array.from({ length: 14 }, (_, index) => ({
    id: `turn-${index + 1}`,
    label: `Turn ${index + 1}`,
    turnNumber: index + 1,
    events: [
      {
        id: `action-${index + 1}`,
        sequence: index + 1,
        side: 'cpu',
        kind: 'action',
        message: "CPU's Quillip used Ink Peck.",
      },
      {
        id: `damage-${index + 1}`,
        sequence: index + 1,
        side: 'player',
        kind: 'effect',
        message: "Player's Quillip took 10 damage.",
      },
      {
        id: `event-${index + 1}`,
        sequence: index + 1,
        side: 'cpu',
        kind: 'turn',
        message: `Turn ${index + 1} ended. Player is next.`,
      },
    ],
  }));
  await page.route('**/api/v1/matches/**', (route) =>
    json(route, response(match)),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/matches/${MATCH_ID}`);
  await expect(
    page.getByRole('heading', { name: 'Your turn', exact: true }),
  ).toBeVisible();
  const measure = () =>
    page.locator('.battle-stage, .battle-actions').evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { y: box.y + window.scrollY, height: box.height };
      }),
    );
  const before = await measure();
  await page.locator('.battle-bench > summary').click();
  await page.locator('.battle-details > summary').click();
  expect(await measure()).toEqual(before);
  const rail = page.locator('.battle-side-rail');
  expect(
    await rail.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await rail.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    page.getByText('Match version', { exact: true }),
  ).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  await page.locator('.battle-page').screenshot({
    path: path.join(screenshotsDirectory, '1440-expanded-sidebar.png'),
  });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const history = page.locator('.battle-log');
    await history.locator('summary').click();
    await history.screenshot({
      path: path.join(screenshotsDirectory, `${width}-history.png`),
    });
    await history.locator('summary').click();
    const pictures = page.locator('.battle-creature-artwork img');
    await expect(pictures).toHaveCount(4);
    await expect
      .poll(() =>
        pictures.evaluateAll((elements) =>
          elements.every(
            (element) => (element as HTMLImageElement).naturalWidth > 0,
          ),
        ),
      )
      .toBe(true);
    await expectNoHorizontalOverflow(page);
    await page.locator('.battle-page').screenshot({
      path: path.join(screenshotsDirectory, `${width}-creature-artwork.png`),
    });
  }
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

async function expectControlsContainTheirContent(page: Page) {
  const controls = await page
    .locator('.battle-action-control, .creature-choice-control')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
      })),
    );
  for (const control of controls) {
    expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth);
    expect(control.scrollHeight).toBeLessThanOrEqual(control.clientHeight);
  }
}

async function expectCreatureChoiceColumns(page: Page, expected: number) {
  const controls = page.locator('.creature-choice-control');
  await expect(controls).toHaveCount(3);
  const leftEdges = await controls.evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().x)),
  );
  expect(new Set(leftEdges).size).toBe(expected);
}

async function expectBattleStageFirstDesktopLayout(page: Page) {
  const stage = await page.locator('.battle-stage').boundingBox();
  const actions = await page.locator('.battle-actions').boundingBox();
  const rail = await page.locator('.battle-side-rail').boundingBox();
  expect(stage).not.toBeNull();
  expect(actions).not.toBeNull();
  expect(rail).not.toBeNull();
  expect(actions!.x).toBeCloseTo(stage!.x, 0);
  expect(actions!.width).toBeLessThan(stage!.width);
  expect(actions!.y).toBeGreaterThanOrEqual(stage!.y + stage!.height);
  expect(rail!.x).toBeGreaterThanOrEqual(actions!.x + actions!.width - 8);
  expect(rail!.y).toBeCloseTo(actions!.y, 0);
  expect(stage!.width).toBeGreaterThan(rail!.width * 2);
  const actionContent = await page
    .locator('.battle-action-content')
    .evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
  expect(actionContent.scrollHeight).toBeLessThanOrEqual(
    actionContent.clientHeight + 1,
  );

  const actionSwitch = page.locator('.battle-action-switch');
  if ((await actionSwitch.count()) > 0) {
    const switchBox = await actionSwitch.boundingBox();
    const tabBoxes = await actionSwitch.getByRole('tab').evaluateAll((tabs) =>
      tabs.map((tab) => {
        const box = tab.getBoundingClientRect();
        return { height: box.height, y: box.y };
      }),
    );
    expect(switchBox).not.toBeNull();
    expect(tabBoxes).toHaveLength(2);
    const [firstTabBox, secondTabBox] = tabBoxes;
    if (!firstTabBox || !secondTabBox) {
      throw new Error('Expected both action tabs to have layout boxes.');
    }
    expect(
      Math.abs(firstTabBox.height - secondTabBox.height),
    ).toBeLessThanOrEqual(1);
    const topInset = firstTabBox.y - switchBox!.y;
    const bottomInset =
      switchBox!.y + switchBox!.height - secondTabBox.y - secondTabBox.height;
    expect(Math.abs(topInset - bottomInset)).toBeLessThanOrEqual(1);

    if ((await page.locator('.battle-action-guidance').count()) === 0) {
      const contentBox = await page
        .locator('.battle-action-browser .battle-action-content')
        .boundingBox();
      const activePanelBox = await page
        .locator('.battle-action-content [role="tabpanel"]:visible')
        .boundingBox();
      expect(contentBox).not.toBeNull();
      expect(activePanelBox).not.toBeNull();
      const contentCentre = contentBox!.y + contentBox!.height / 2;
      const activePanelCentre = activePanelBox!.y + activePanelBox!.height / 2;
      expect(Math.abs(contentCentre - activePanelCentre)).toBeLessThanOrEqual(
        1,
      );
    }
  }

  await expect(page.locator('.battle-log > summary')).toBeVisible();
}

async function expectCompletedSideRailLayout(page: Page) {
  const result = await page.locator('.completed-match').boundingBox();
  const rail = await page.locator('.battle-side-rail').boundingBox();
  expect(result).not.toBeNull();
  expect(rail).not.toBeNull();
  expect(rail!.x).toBeGreaterThanOrEqual(result!.x + result!.width);
  expect(rail!.y).toBeCloseTo(result!.y, 0);
  expect(result!.width).toBeGreaterThan(rail!.width * 2);
}

async function expectPrimaryActionWithinViewport(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const actions = await page.locator('.battle-actions').boundingBox();
  expect(actions).not.toBeNull();
  expect(actions!.y + 120).toBeLessThan(page.viewportSize()!.height);
  await expectNoHorizontalOverflow(page);
}

async function expectActionContentFits(page: Page) {
  const sizes = await page
    .locator('.battle-action-content')
    .evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
    }));
  expect(sizes.scrollHeight).toBeLessThanOrEqual(sizes.clientHeight + 1);
}

async function expectVerticallySeparated(upper: Locator, lower: Locator) {
  const upperBox = await upper.boundingBox();
  const lowerBox = await lower.boundingBox();
  expect(upperBox).not.toBeNull();
  expect(lowerBox).not.toBeNull();
  expect(upperBox!.y + upperBox!.height).toBeLessThanOrEqual(lowerBox!.y);
}

async function json(route: Route, body: object, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

async function routeCurrentPlayer(page: Page) {
  await page.route('**/api/v1/auth/me', (route) =>
    json(route, {
      connectionStrategy: 'auth0',
      id: CURRENT_PLAYER_ID,
      lifecycleStatus: 'active',
      playerName: 'battle_reader',
      playerNameSetupRequired: false,
      requestId: 'cpu-browser-player',
      role: 'player',
    }),
  );
}

test('shows existing artwork when choosing a replacement', async ({ page }) => {
  await routeCurrentPlayer(page);
  const match = activeMatch(1);
  match.state.phase = 'replacement';
  match.state.player.creatures.forEach((creature, index) => {
    creature.name = ['Quillip', 'Ciphra', 'Prismole'][index]!;
    creature.defeated = index === 0;
    if (index === 0) creature.currentHp = 0;
  });
  match.state.legalActions = match.state.player.creatures
    .slice(1)
    .map((creature) => ({
      type: 'select_replacement',
      creatureId: creature.id,
    }));
  await page.route('**/api/v1/matches/**', (route) =>
    json(route, response(match)),
  );
  await page.goto(`/matches/${MATCH_ID}`);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const choices = page.locator('.creature-choice-list');
    await expect(choices.locator('img')).toHaveCount(3);
    await expect
      .poll(() =>
        choices
          .locator('img')
          .evaluateAll((images) =>
            images.every(
              (img) =>
                (img as HTMLImageElement).complete &&
                (img as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    await expect(
      choices.getByRole('button', { name: /Use as replacement Quillip/ }),
    ).toBeDisabled();
    await expectNoHorizontalOverflow(page);
    await choices.screenshot({
      path: path.join(screenshotsDirectory, `${width}-replacement-artwork.png`),
    });
  }
});

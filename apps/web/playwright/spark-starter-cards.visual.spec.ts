import { captureScreenshot } from './visual-capture';
import { expect, test, type Route } from '@playwright/test';

import { buildCard, buildUuid } from '../tests/fixtures/cards';
import { expectSquareArtwork } from './card-artwork-assertions';

const API_BASE_URL = 'http://127.0.0.1:3999/api/v1';

test('renders the approved Spark starter cards and production artwork', async ({
  page,
}, testInfo) => {
  const cards = buildSparkStarterCards();

  await page.route(`${API_BASE_URL}/auth/me`, (route) =>
    json(route, {
      connectionStrategy: 'auth0',
      id: buildUuid(981),
      lifecycleStatus: 'active',
      playerName: 'spark_starter_preview_player',
      playerNameSetupRequired: false,
      requestId: 'spark-starter-preview-player',
      role: 'player',
    }),
  );
  await page.route(`${API_BASE_URL}/cards/collection`, (route) =>
    json(route, { cards, requestId: 'spark-starter-preview-cards' }),
  );

  await page.setViewportSize({ height: 1500, width: 900 });
  await page.goto('/collection');

  const gallery = page.getByRole('list', { name: 'Owned card designs' });
  await expect(gallery.locator(':scope > li')).toHaveCount(3);
  await expectSquareArtwork(gallery);
  await expect(gallery.locator('img')).toHaveCount(3);
  for (const image of await gallery.locator('img').all()) {
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) => element.naturalWidth),
      )
      .toBe(1024);
  }
  await captureScreenshot(test.info(), gallery, {
    path: testInfo.outputPath('spark-starter-gallery.png'),
  });

  await page.getByRole('button', { name: 'View Voltiki details' }).click();
  let dialog = page.getByRole('dialog', { name: 'Voltiki' });
  await expect(dialog.getByText('Heal 25')).toBeVisible();
  await expect(dialog.getByText('Static Snap')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close Voltiki details' }).click();

  await page.getByRole('button', { name: 'View Cinderhop details' }).click();
  dialog = page.getByRole('dialog', { name: 'Cinderhop' });
  await expect(
    dialog.getByText('This creature deals 20% more damage for 2 turns'),
  ).toBeVisible();
  await expect(dialog.getByText('Calculated Claw')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close Cinderhop details' }).click();

  await page.getByRole('button', { name: 'View Lumiswift details' }).click();
  dialog = page.getByRole('dialog', { name: 'Lumiswift' });
  await expect(
    dialog.getByText('Opponent deals 15% less damage for 2 turns'),
  ).toBeVisible();
  await expect(dialog.getByText('Thunderstrike Dive')).toBeVisible();
});

function buildSparkStarterCards() {
  return [
    buildCard(11, {
      affinity: 'spark',
      description:
        'A wall-running lizard that coils its charged tail to recover before striking.',
      hp: 98,
      imageUrl: '/cards/voltiki.webp',
      moves: [
        move(1, 1, 'Wall Dash', 'basic', 'damage', 10, 0),
        move(1, 2, 'Arc Burst', 'basic', 'damage', 16, 1),
        move(1, 3, 'Charge Coil', 'basic', 'heal', 25, 2),
        move(1, 4, 'Static Snap', 'spark', 'damage', 25, 3),
      ],
      name: 'Voltiki',
      power: 11,
      rarity: 'common',
    }),
    buildCard(12, {
      affinity: 'spark',
      description:
        'A cliff-running striker that builds momentum before committing to a decisive attack.',
      hp: 92,
      imageUrl: '/cards/cinderhop.webp',
      moves: [
        move(2, 1, 'Quick Kick', 'basic', 'damage', 18, 1),
        move(2, 2, 'Mighty Maw', 'basic', 'damage', 12, 0),
        move(2, 3, 'Perfect Read', 'basic', 'buff', 20, 2, damageModifier(2)),
        move(2, 4, 'Calculated Claw', 'spark', 'damage', 30, 4),
      ],
      name: 'Cinderhop',
      power: 13,
      rarity: 'common',
    }),
    buildCard(13, {
      affinity: 'spark',
      description:
        'A swift mountain bird that circles out of danger before diving through an opening.',
      hp: 108,
      imageUrl: '/cards/lumiswift.webp',
      moves: [
        move(3, 1, 'Swift Peck', 'basic', 'damage', 14, 1),
        move(3, 2, 'Wing Swipe', 'basic', 'damage', 10, 0),
        move(
          3,
          3,
          'Evasive Circle',
          'basic',
          'debuff',
          15,
          2,
          damageModifier(2),
        ),
        move(3, 4, 'Thunderstrike Dive', 'spark', 'damage', 25, 3),
      ],
      name: 'Lumiswift',
      power: 9,
      rarity: 'common',
    }),
  ];
}

function damageModifier(modifierDurationTurns: number) {
  return {
    modifierDurationTurns,
    modifierOperation: 'multiply' as const,
    modifierStat: 'damage_multiplier' as const,
  };
}

function move(
  cardNumber: number,
  position: number,
  name: string,
  moveType: 'basic' | 'spark',
  effectType: 'buff' | 'damage' | 'debuff' | 'heal',
  effectValue: number,
  powerCost: number,
  modifier: ReturnType<typeof damageModifier> | null = null,
) {
  return {
    effectType,
    effectValue,
    id: buildUuid(400 + cardNumber * 10 + position),
    modifierDurationTurns: modifier?.modifierDurationTurns ?? null,
    modifierOperation: modifier?.modifierOperation ?? null,
    modifierStat: modifier?.modifierStat ?? null,
    moveType,
    name,
    position,
    powerCost,
  };
}

async function json(route: Route, body: object) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status: 200,
  });
}

import { expect, test, type Route } from '@playwright/test';

import { buildCard, buildUuid } from '../tests/fixtures/cards';
import { expectSquareArtwork } from './card-artwork-assertions';

const API_BASE_URL = 'http://127.0.0.1:3999/api/v1';

test('renders the approved Wit starter cards and production artwork', async ({
  page,
}, testInfo) => {
  const cards = buildWitStarterCards();

  await page.route(`${API_BASE_URL}/auth/me`, (route) =>
    json(route, {
      connectionStrategy: 'auth0',
      id: buildUuid(980),
      lifecycleStatus: 'active',
      playerName: 'wit_starter_preview_player',
      playerNameSetupRequired: false,
      requestId: 'wit-starter-preview-player',
      role: 'player',
    }),
  );
  await page.route(`${API_BASE_URL}/cards/collection`, (route) =>
    json(route, { cards, requestId: 'wit-starter-preview-cards' }),
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
  await gallery.screenshot({
    path: testInfo.outputPath('wit-starter-gallery.png'),
  });

  await page.getByRole('button', { name: 'View Ciphra details' }).click();
  let dialog = page.getByRole('dialog', { name: 'Ciphra' });
  await expect(
    dialog.getByText('This creature deals 20% more damage for 2 turns'),
  ).toBeVisible();
  await expect(dialog.getByText('Decoded Strike')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close Ciphra details' }).click();

  await page.getByRole('button', { name: 'View Prismole details' }).click();
  dialog = page.getByRole('dialog', { name: 'Prismole' });
  await expect(
    dialog.getByText('Opponent deals 15% less damage for 2 turns'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Close Prismole details' }).click();

  await page.getByRole('button', { name: 'View Quillip details' }).click();
  dialog = page.getByRole('dialog', { name: 'Quillip' });
  const card = dialog.locator('.trade-card-detail__body');
  await expect(card.getByText('Heal 25')).toBeVisible();
  await expect(card.getByText('Eureka')).toBeVisible();

  await page.addStyleTag({
    content: `
      .trade-card-detail-backdrop {
        align-items: flex-start !important;
        position: absolute !important;
      }
      .trade-card-detail {
        align-self: flex-start !important;
        overflow: visible !important;
      }
      .trade-card-detail__body {
        overflow: visible !important;
      }
    `,
  });
  await card.screenshot({
    path: testInfo.outputPath('quillip-card-example.png'),
  });
});

function buildWitStarterCards() {
  return [
    buildCard(1, {
      affinity: 'wit',
      description:
        'A sharp-eyed campus scholar who turns every observation into an advantage.',
      hp: 98,
      imageUrl: '/cards/quillip.webp',
      moves: [
        move(1, 1, 'Ink Peck', 'basic', 'damage', 10, 0),
        move(1, 2, 'Blind Spot', 'basic', 'damage', 16, 1),
        move(1, 3, 'Quick Study', 'basic', 'heal', 25, 2),
        move(1, 4, 'Eureka', 'wit', 'damage', 25, 3),
      ],
      name: 'Quillip',
      power: 11,
      rarity: 'common',
    }),
    buildCard(2, {
      affinity: 'wit',
      description:
        'A rune-marked prowler that studies every opening before it strikes.',
      hp: 92,
      imageUrl: '/cards/ciphra.webp',
      moves: [
        move(2, 1, 'Pattern Pounce', 'basic', 'damage', 18, 1),
        move(2, 2, 'Quick Read', 'basic', 'damage', 12, 0),
        move(2, 3, 'Flash Feint', 'basic', 'buff', 20, 2, damageModifier(2)),
        move(2, 4, 'Decoded Strike', 'wit', 'damage', 30, 4),
      ],
      name: 'Ciphra',
      power: 13,
      rarity: 'common',
    }),
    buildCard(3, {
      affinity: 'wit',
      description:
        'A crystal-clawed planner that turns the shape of a battlefield to its advantage.',
      hp: 108,
      imageUrl: '/cards/prismole.webp',
      moves: [
        move(3, 1, 'Facet Jab', 'basic', 'damage', 14, 1),
        move(3, 2, 'Tunnel Plan', 'basic', 'damage', 10, 0),
        move(3, 3, 'Refract', 'basic', 'debuff', 15, 2, damageModifier(2)),
        move(3, 4, 'Breakthrough', 'wit', 'damage', 25, 3),
      ],
      name: 'Prismole',
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
  moveType: 'basic' | 'wit',
  effectType: 'buff' | 'damage' | 'debuff' | 'heal',
  effectValue: number,
  powerCost: number,
  modifier: ReturnType<typeof damageModifier> | null = null,
) {
  return {
    effectType,
    effectValue,
    id: buildUuid(300 + cardNumber * 10 + position),
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

import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { buildCard } from '../tests/fixtures/cards';
import { buildPlayerProfile } from '../tests/fixtures/player-profile';
import type { ProfileEdit } from '../src/api/player-profile';

const names = ['Quillip', 'Cinderhop', 'Karrik', 'Sylphane'];
const cards = names.map((name, index) =>
  buildCard(index + 1, {
    name,
    imageAlt: name,
    imageUrl: `/cards/${name.toLowerCase()}.webp`,
    rarity: ['common', 'rare', 'epic', 'legendary'][index],
  }),
);
const featuredCards = cards.map((card) => ({
  affinity: card.affinity,
  cardDefinitionId: card.cardDefinitionId,
  category: card.category,
  description: card.description,
  effects: card.effects,
  hp: card.hp,
  imageUrl: card.imageUrl,
  imageAlt: card.name,
  isActive: card.isActive,
  moves: card.moves,
  name: card.name,
  power: card.power,
  rarity: card.rarity,
}));
const achievements = [
  ['first_quiz', 'First Quiz', true, 12, 1, 'Complete your first event quiz.'],
  [
    'perfect_quiz',
    'Perfect Quiz',
    true,
    2,
    1,
    'Answer all five questions correctly in one event quiz.',
  ],
  [
    'five_quizzes',
    'Campus Explorer',
    true,
    12,
    5,
    'Complete five event quizzes.',
  ],
  [
    'first_cpu_win',
    'First Victory',
    true,
    3,
    1,
    'Win your first match against the computer.',
  ],
  [
    'five_cpu_matches',
    'Battle Tested',
    false,
    3,
    5,
    'Complete five matches against the computer.',
  ],
  [
    'three_day_streak',
    'On a Roll',
    true,
    7,
    3,
    'Stay active for three consecutive Johannesburg calendar days.',
  ],
].map(([code, title, earned, progress, target, description]) => ({
  code: code as string,
  title: title as string,
  earned: earned as boolean,
  progress: progress as number,
  target: target as number,
  description: description as string,
}));

test('player showcase, editor and visitor view work across screen sizes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let profile = {
    ...buildPlayerProfile({
      playerName: 'naledi-star',
      bio: 'Usually chasing a rare card between lectures. Always up for one more battle.',
      degree: 'BSc Computer Science',
      studyYear: 'Year 2',
      isPublic: true,
      activityVisible: true,
      version: 1,
      status: { emoji: '📚', text: 'In exam mode', expiresAt: null },
      achievements,
    }),
    featuredCards,
    featuredOwnedCardIds: cards.map((card) => card.ownedCardId),
    activity: Array.from({ length: 365 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 9, 2) - (364 - index) * 86400000)
        .toISOString()
        .slice(0, 10),
      count:
        index % 9 === 0 || (index > 305 && index % 3 === 0)
          ? (index % 7) + 1
          : 0,
    })).filter((day) => day.count > 0),
  };
  await page.route('http://127.0.0.1:3999/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          connectionStrategy: 'auth0',
          id: '17300000-0000-4000-8000-000000000001',
          lifecycleStatus: 'active',
          playerName: 'naledi-star',
          playerNameSetupRequired: false,
          role: 'player',
          requestId: 'browser-owner',
        },
      });
    if (url.pathname.endsWith('/cards/collection'))
      return route.fulfill({ json: { cards, requestId: 'collection' } });
    if (url.pathname.endsWith('/profiles/players/another-player'))
      return route.fulfill({
        json: {
          ...profile,
          playerName: 'another-player',
          isOwner: false,
          version: null,
          featuredOwnedCardIds: [],
          achievements: achievements.filter((entry) => entry.earned),
          activityVisible: false,
          activity: null,
          requestId: 'visitor',
        },
      });
    if (url.pathname.endsWith('/profiles/me')) {
      if (route.request().method() === 'PUT') {
        const edit = route.request().postDataJSON() as ProfileEdit;
        profile = {
          ...profile,
          bio: edit.bio,
          degree: edit.degree,
          studyYear: edit.studyYear,
          avatarDataUrl: edit.avatarDataUrl,
          isPublic: edit.isPublic,
          activityVisible: edit.activityVisible,
          featuredOwnedCardIds: edit.featuredOwnedCardIds,
          version: (profile.version ?? 0) + 1,
          status: edit.statusText
            ? {
                text: edit.statusText,
                emoji: edit.statusEmoji,
                expiresAt: null,
              }
            : null,
          featuredCards: edit.featuredOwnedCardIds.map(
            (id) =>
              featuredCards[
                cards.findIndex((card) => card.ownedCardId === id)
              ]!,
          ),
        };
      }
      return route.fulfill({ json: { ...profile, requestId: 'profile' } });
    }
    return route.fulfill({
      status: 404,
      json: { detail: 'Fixture route unavailable' },
    });
  });
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto('/profile');
    await expect(
      page.getByRole('heading', { name: 'naledi-star' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Inspect Quillip' }),
    ).toBeVisible();
    await expectNoOverflow(page);
    await expect(page.getByText('Add a little about yourself')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'View player profile' }),
    ).toHaveCount(0);
    expect(
      await page
        .locator('.showcase-cards')
        .evaluate((cards) => cards.getBoundingClientRect().top),
    ).toBeLessThan(
      await page
        .locator('.showcase-stats')
        .evaluate((stats) => stats.getBoundingClientRect().top),
    );
    await page.screenshot({
      fullPage: true,
      path: `/tmp/profile-showcase-${width}.png`,
    });
    const activityDay = page.locator('.activity-day[data-day-index="90"]');
    await activityDay.focus();
    await expect(page.getByRole('tooltip')).toContainText('completed');
    await page.screenshot({
      path: `/tmp/profile-activity-tooltip-${width}.png`,
    });
    const calendar = page.locator('.showcase-activity');
    await calendar.screenshot({ path: `/tmp/profile-activity-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.getByText('View activity as a list', { exact: true }).click();
    await expect(page.locator('.activity-list ul')).toBeVisible();
    if (width === 390 || width === 1440)
      await calendar.screenshot({
        path: `/tmp/profile-activity-list-${width}.png`,
      });
    await page.getByText('View activity as a list', { exact: true }).click();
    const badge = page.getByRole('button', {
      name: 'First Quiz: Earned',
      exact: true,
    });
    await badge.click();
    await expect(
      page.getByRole('dialog', { name: 'First Quiz', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Close First Quiz details' }),
    ).toBeFocused();
    await page.screenshot({ path: `/tmp/profile-achievement-${width}.png` });
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Close First Quiz details' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(badge).toBeFocused();
    await badge.click();
    await page
      .locator('.achievement-backdrop')
      .click({ position: { x: 2, y: 2 } });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(badge).toBeFocused();
    await page
      .getByRole('button', { name: 'Battle Tested: In progress', exact: true })
      .click();
    await expect(
      page.getByRole('progressbar', {
        name: 'Battle Tested: In progress, 3 of 5',
      }),
    ).toBeVisible();
    if (width === 390)
      await page.screenshot({
        path: '/tmp/profile-achievement-progress-mobile.png',
      });
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', { name: 'Edit profile', exact: true })
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Edit profile' }),
    ).toBeVisible();
    await expectNoOverflow(page);
    if (width === 390)
      await page.screenshot({ path: '/tmp/profile-editor-mobile.png' });
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Edit profile', exact: true }),
    ).toBeFocused();
  }
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByLabel('Choose picture').setInputFiles({
    name: 'avatar.webp',
    mimeType: 'image/webp',
    buffer: await readFile(
      new URL('../public/cards/quillip.webp', import.meta.url),
    ),
  });
  await expect(page.getByLabel('Zoom')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save changes' }),
  ).toBeEnabled();
  await page.getByLabel('Zoom').fill('1.5');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(profile.avatarDataUrl).toMatch(/^data:image\/jpeg;base64,/);
  await expect(page.locator('.showcase-avatar img')).toBeVisible();
  await page.getByRole('button', { name: 'Edit showcase' }).click();
  const pickerInspection = page.getByRole('button', {
    name: 'Inspect Quillip, copy 1',
  });
  await pickerInspection.click();
  await expect(page.getByRole('dialog', { name: 'Quillip' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pickerInspection).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Remove Quillip, copy 1' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Move Cinderhop left' }).click();
  await page
    .getByRole('dialog', { name: 'Edit favourite cards' })
    .evaluate((dialog) => {
      const grid = dialog.querySelector('.profile-picker-grid')!;
      dialog.scrollTop +=
        grid.getBoundingClientRect().top -
        dialog.getBoundingClientRect().top -
        16;
    });
  await page.screenshot({ path: '/tmp/profile-card-picker-mobile.png' });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Profile saved.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Inspect Quillip' }).click();
  await expect(page.getByRole('dialog', { name: 'Quillip' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByLabel('Bio', { exact: true }).fill('');
  await page.getByLabel(/Degree/).fill('');
  await page.getByLabel(/Year of study/).fill('');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator('.showcase-identity')
    .screenshot({ path: '/tmp/profile-header-empty.png' });
  await page.goto('/players/another-player');
  await expect(
    page.getByRole('heading', { name: 'another-player' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit profile' })).toHaveCount(
    0,
  );
  await expect(
    page.getByText('This player keeps their activity private.'),
  ).toBeVisible();
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

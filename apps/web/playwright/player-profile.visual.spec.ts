import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { buildCard } from '../tests/fixtures/cards';
import { buildPlayerProfile } from '../tests/fixtures/player-profile';
import type { ProfileEdit } from '../src/api/player-profile';
import { parseCardPresentation } from '../src/api/cards';

// Keep native scrollbars visible so pointer interactions exercise their real hit area.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

const names = ['Quillip', 'Cinderhop', 'Karrik', 'Sylphane'];
const cards = names.map((name, index) =>
  buildCard(index + 1, {
    name,
    imageAlt: name,
    imageUrl: `/cards/${name.toLowerCase()}.webp`,
    rarity: ['common', 'rare', 'epic', 'legendary'][index],
  }),
);
const featuredCards = cards
  .map((card) => ({
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
  }))
  .map(parseCardPresentation);
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

test.describe('favourite card editing', () => {
  test.use({ hasTouch: true });

  test('reorders images with mouse, touch and keyboard while keeping a bounded picker', async ({
    page,
  }) => {
    let profile = buildPlayerProfile({
      featuredCards,
      featuredOwnedCardIds: cards.map((card) => card.ownedCardId),
    });
    const collection = [
      ...cards,
      ...Array.from({ length: 16 }, (_, index) =>
        buildCard(index + 5, { name: `Extra card ${index + 1}` }),
      ),
    ];
    let saved: ProfileEdit | null = null;
    await page.route('http://127.0.0.1:3999/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/auth/me'))
        return route.fulfill({
          json: {
            connectionStrategy: 'auth0',
            id: '17300000-0000-4000-8000-000000000001',
            lifecycleStatus: 'active',
            playerName: profile.playerName,
            playerNameSetupRequired: false,
            role: 'player',
            requestId: 'favourites-owner',
          },
        });
      if (url.pathname.endsWith('/cards/collection')) {
        expect(url.searchParams.get('unique')).toBe('true');
        return route.fulfill({
          json: { cards: collection, requestId: 'unique-collection' },
        });
      }
      if (url.pathname.endsWith('/profiles/me')) {
        if (route.request().method() === 'PUT') {
          saved = route.request().postDataJSON() as ProfileEdit;
          profile = {
            ...profile,
            featuredOwnedCardIds: saved.featuredOwnedCardIds,
            featuredCards: saved.featuredOwnedCardIds.map(
              (id) =>
                featuredCards[
                  cards.findIndex((card) => card.ownedCardId === id)
                ]!,
            ),
            version: 1,
          };
        }
        return route.fulfill({
          json: { ...profile, requestId: 'favourites-profile' },
        });
      }
      return route.fulfill({
        status: 404,
        json: { detail: 'Fixture route unavailable' },
      });
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Edit showcase' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit favourite cards' });
    const row = dialog.getByRole('list', { name: 'Selected favourite cards' });
    const order = () =>
      row
        .locator('[data-owned-card-id]')
        .evaluateAll((tiles) =>
          tiles.map((tile) => tile.getAttribute('data-owned-card-id')),
        );
    const original = cards.map((card) => card.ownedCardId);
    await expect(dialog.locator('.profile-picker-card')).toHaveCount(12);
    await expect(
      dialog.getByRole('button', { name: 'Select Extra card 1', exact: true }),
    ).toBeDisabled();
    const first = await row
      .getByRole('button', { name: 'Inspect favourite Quillip' })
      .boundingBox();
    const last = await row
      .getByRole('button', { name: 'Inspect favourite Sylphane' })
      .boundingBox();
    await page.mouse.move(
      first!.x + first!.width / 2,
      first!.y + first!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      last!.x + last!.width / 2,
      last!.y + last!.height / 2,
      { steps: 12 },
    );
    await expect(row.locator('[data-drop-target="true"]')).toHaveCount(1);
    await page.mouse.up();
    expect(await order()).toEqual([...original.slice(1), original[0]]);
    await expect(
      page.getByRole('dialog', { name: 'Quillip', exact: true }),
    ).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    const session = await page.context().newCDPSession(page);
    const source = await row
      .getByRole('button', { name: 'Reorder Quillip, position 4' })
      .boundingBox();
    const target = await row
      .getByRole('button', { name: 'Reorder Cinderhop, position 1' })
      .boundingBox();
    const touch = async (
      type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
      x: number,
      y: number,
    ) =>
      session.send('Input.dispatchTouchEvent', {
        type,
        touchPoints:
          type === 'touchEnd' || type === 'touchCancel'
            ? []
            : [{ x, y, id: 1 }],
      });
    await touch('touchStart', source!.x + 20, source!.y + 20);
    await touch('touchMove', target!.x + 20, target!.y + 20);
    await touch('touchEnd', 0, 0);
    await expect.poll(order).toEqual(original);
    const cancelSource = await row
      .getByRole('button', { name: 'Reorder Quillip, position 1' })
      .boundingBox();
    const cancelTarget = await row
      .getByRole('button', { name: 'Reorder Cinderhop, position 2' })
      .boundingBox();
    await touch('touchStart', cancelSource!.x + 20, cancelSource!.y + 20);
    await touch('touchMove', cancelTarget!.x + 20, cancelTarget!.y + 20);
    await touch('touchCancel', 0, 0);
    await expect.poll(order).toEqual(original);
    await session.detach();
    await row
      .getByRole('button', { name: 'Reorder Cinderhop, position 2' })
      .focus();
    await page.keyboard.press('ArrowLeft');
    expect(await order()).toEqual([
      original[1],
      original[0],
      ...original.slice(2),
    ]);
    await expect(
      row.getByRole('button', { name: 'Reorder Cinderhop, position 1' }),
    ).toBeFocused();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await dialog.evaluate((element) => {
        element.scrollTop = 0;
      });
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: `/tmp/profile-favourites-${width}.png` });
    }
    await dialog.getByRole('button', { name: 'Show more cards' }).click();
    await expect(dialog.locator('.profile-picker-card')).toHaveCount(20);
    await dialog
      .getByRole('searchbox', { name: 'Search your cards' })
      .fill('Extra card 16');
    await expect(dialog.locator('.profile-picker-card')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toHaveCount(0);
    expect((saved as ProfileEdit | null)?.featuredOwnedCardIds).toEqual([
      original[1],
      original[0],
      ...original.slice(2),
    ]);
  });
});

test.describe('profile picture crop', () => {
  test.use({ hasTouch: true });

  test('supports dragging, keyboard positioning, zoom, reset and removal across sizes', async ({
    page,
  }) => {
    let profile = buildPlayerProfile({ isPublic: true, version: 1 });
    let saved: ProfileEdit | null = null;
    await page.route('http://127.0.0.1:3999/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/me'))
        return route.fulfill({
          json: {
            connectionStrategy: 'auth0',
            id: '17300000-0000-4000-8000-000000000001',
            lifecycleStatus: 'active',
            playerName: profile.playerName,
            playerNameSetupRequired: false,
            role: 'player',
            requestId: 'crop-owner',
          },
        });
      if (path.endsWith('/profiles/me')) {
        if (route.request().method() === 'PUT') {
          saved = route.request().postDataJSON() as ProfileEdit;
          profile = {
            ...profile,
            avatarDataUrl: saved.avatarDataUrl,
            version: (profile.version ?? 0) + 1,
          };
        }
        return route.fulfill({
          json: { ...profile, requestId: 'crop-profile' },
        });
      }
      return route.fulfill({
        status: 404,
        json: { detail: 'Fixture route unavailable' },
      });
    });
    await page.goto('/profile');
    const fixture = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 320;
      const context = canvas.getContext('2d')!;
      const gradient = context.createLinearGradient(0, 0, 640, 320);
      gradient.addColorStop(0, '#e0c46c');
      gradient.addColorStop(1, '#2a6bff');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 640, 320);
      return canvas.toDataURL('image/png').split(',')[1]!;
    });
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 });
      await page
        .getByRole('button', { name: 'Edit profile', exact: true })
        .click();
      await page.getByLabel('Choose picture').setInputFiles({
        name: 'landscape.png',
        mimeType: 'image/png',
        buffer: Buffer.from(fixture, 'base64'),
      });
      const stage = page.getByRole('button', { name: 'Move profile picture' });
      await expect(stage).toBeEnabled();
      await stage.scrollIntoViewIfNeeded();
      await expect(page.getByLabel('Horizontal position')).toHaveCount(0);
      const preview = page.locator('.profile-photo-field img');
      const initial = await preview.getAttribute('src');
      const box = (await stage.boundingBox())!;
      expect(box.width).toBeGreaterThan(240);
      expect(box.height).toBeGreaterThan(180);
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await page.mouse.move(center.x, center.y);
      await page.mouse.down();
      await page.mouse.move(center.x + 35, center.y, { steps: 5 });
      await page.mouse.up();
      await expect(preview).not.toHaveAttribute('src', initial!);
      await page.getByRole('button', { name: 'Reset crop' }).click();
      await expect(preview).toHaveAttribute('src', initial!);
      await page.getByLabel('Zoom', { exact: true }).fill('1.5');
      await expect(preview).not.toHaveAttribute('src', initial!);
      const zoomed = await preview.getAttribute('src');
      await stage.focus();
      await page.keyboard.press('ArrowDown');
      await expect(stage).toBeFocused();
      await expect(preview).not.toHaveAttribute('src', zoomed!);
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('1.6');
      await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
      await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('1.5');
      if (width <= 390) {
        await stage.scrollIntoViewIfNeeded();
        const touchBox = (await stage.boundingBox())!;
        const x = touchBox.x + touchBox.width / 2;
        const y = touchBox.y + touchBox.height / 2;
        const beforeTouch = await preview.getAttribute('src');
        const session = await page.context().newCDPSession(page);
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x, y }],
        });
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x - 30, y: y - 20 }],
        });
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
        await session.detach();
        await expect(preview).not.toHaveAttribute('src', beforeTouch!);
        await expect(stage).not.toHaveClass(/is-dragging/);
      }
      // Clamp an extreme drag so no empty background enters the saved crop.
      await stage.focus();
      for (let index = 0; index < 20; index++)
        await page.keyboard.press('Shift+ArrowRight');
      expect(
        await page
          .locator('.avatar-crop canvas')
          .evaluate((canvas: HTMLCanvasElement) => {
            const pixel = canvas
              .getContext('2d')!
              .getImageData(0, 0, 1, 1).data;
            return pixel[0]! + pixel[1]! + pixel[2]!;
          }),
      ).toBeGreaterThan(100);
      await expectNoOverflow(page);
      await page.getByRole('button', { name: 'Reset crop' }).click();
      await expect(preview).toHaveAttribute('src', initial!);
      await stage.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/profile-crop-${width}.png` });
      const close = (await page
        .getByRole('button', { name: 'Close profile editor' })
        .boundingBox())!;
      expect(close.y).toBeGreaterThanOrEqual(0);
      // Footer stays visible while the taller editor scrolls.
      const save = page.getByRole('button', { name: 'Save changes' });
      const footer = (await save.boundingBox())!;
      expect(footer.y + footer.height).toBeLessThanOrEqual(
        width === 320 ? 568 : 1000,
      );
      const upload = await page.getByLabel('Choose picture').boundingBox();
      const remove = await page
        .getByRole('button', { name: 'Remove picture' })
        .boundingBox();
      if (Math.abs(upload!.y - remove!.y) < 10)
        expect(remove!.x - upload!.x - upload!.width).toBeGreaterThanOrEqual(
          16,
        );
      await save.click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect((saved as ProfileEdit | null)?.avatarDataUrl).toBe(initial);
    }
    await page
      .getByRole('button', { name: 'Edit profile', exact: true })
      .click();
    await page.getByRole('button', { name: 'Remove picture' }).click();
    await expect(page.locator('.avatar-crop')).toHaveCount(0);
    await page.getByLabel('Choose picture').setInputFiles({
      name: 'unreadable.png',
      mimeType: 'image/png',
      buffer: Buffer.from('invalid image'),
    });
    await expect(page.getByRole('alert')).toContainText(
      'This image could not be read',
    );
    await expect(
      page.getByRole('button', { name: 'Save changes' }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Save changes' }).click();
    expect((saved as ProfileEdit | null)?.avatarDataUrl).toBeNull();
  });
});

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
          status:
            edit.statusText || edit.statusEmoji
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
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto('/profile');
    await expect(
      page.getByRole('heading', { name: 'naledi-star' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Inspect Quillip' }),
    ).toBeVisible();
    await expectNoOverflow(page);
    await expect(page.getByText('View activity as a list')).toHaveCount(0);
    expect(
      await page.locator('.activity-scroll').evaluate((scroll) => {
        const bounds = scroll.getBoundingClientRect();
        return [...scroll.querySelectorAll('.activity-days button')].every(
          (day) => {
            const cell = day.getBoundingClientRect();
            return (
              cell.top >= bounds.top + 4 && cell.bottom <= bounds.bottom - 4
            );
          },
        );
      }),
    ).toBe(true);
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
    const editProfile = await page
      .getByRole('button', { name: 'Edit profile', exact: true })
      .boundingBox();
    const editShowcase = await page
      .getByRole('button', { name: 'Edit showcase', exact: true })
      .boundingBox();
    if (width >= 768) {
      expect(Math.abs(editProfile!.x - editShowcase!.x)).toBeLessThan(1);
      expect(Math.abs(editProfile!.width - editShowcase!.width)).toBeLessThan(
        1,
      );
    } else {
      const header = (await page.locator('.showcase-identity').boundingBox())!;
      const details = (await page
        .locator('.showcase-identity__details')
        .boundingBox())!;
      const identity = (await page
        .locator('.showcase-identity__text')
        .boundingBox())!;
      expect(Math.abs(details.x - header.x)).toBeLessThan(1);
      expect(details.y).toBeGreaterThanOrEqual(identity.y + identity.height);
      expect(Math.abs(editProfile!.width - header.width)).toBeLessThan(1);
    }
    expect(Math.abs(editProfile!.height - editShowcase!.height)).toBeLessThan(
      1,
    );
    const cardRow = await page
      .locator('.showcase-card-grid .card-thumbnail')
      .evaluateAll((cards) =>
        cards.map((card) => {
          const { x, y, width, height } = card.getBoundingClientRect();
          return { x, y, width, height };
        }),
      );
    expect(cardRow).toHaveLength(4);
    for (const card of cardRow) {
      expect(Math.abs(card.y - cardRow[0]!.y)).toBeLessThan(1);
      expect(card.width).toBeGreaterThanOrEqual(50);
      expect(card.height).toBeGreaterThan(card.width);
    }
    const inspectCard = page.getByRole('button', { name: 'Inspect Quillip' });
    await inspectCard.hover();
    await expect(inspectCard).toHaveAttribute('data-hovered', '');
    await page.mouse.move(0, 0);
    await inspectCard.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Quillip' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(inspectCard).toBeFocused();
    await page.locator('.showcase-activity').scrollIntoViewIfNeeded();
    await page.getByLabel('Activity period').selectOption('365');
    const lastDay = page.locator('.activity-days button').last();
    const cell = (await lastDay.boundingBox())!;
    expect(cell.width).toBeGreaterThanOrEqual(width < 768 ? 12 : 18);
    if (width < 768) expect(cell.width).toBeLessThanOrEqual(14);
    expect(Math.abs(cell.width - cell.height)).toBeLessThan(1);
    await page.locator('.showcase-activity').screenshot({
      path: `/tmp/profile-activity-year-${width}.png`,
    });
    await lastDay.click();
    await expect(page.getByRole('tooltip')).toContainText('2 October 2026');
    await page.keyboard.press('Home');
    await expect(page.locator('.activity-days button').first()).toBeFocused();
    await page.keyboard.press('End');
    await expect(lastDay).toBeFocused();
    await page.keyboard.press('Escape');
    await page.getByLabel('Activity period').focus();
    await page.getByLabel('Activity period').selectOption('91');
    expect(
      (await page.locator('.activity-days button').last().boundingBox())!.width,
    ).toBe(cell.width);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      fullPage: true,
      path: `/tmp/profile-showcase-${width}.png`,
    });
    const activityDay = page.locator('.activity-day[data-day-index="90"]');
    await activityDay.scrollIntoViewIfNeeded();
    await activityDay.focus();
    await expect(page.getByRole('tooltip')).toContainText('completed');
    await page.screenshot({
      path: `/tmp/profile-activity-tooltip-${width}.png`,
    });
    const calendar = page.locator('.showcase-activity');
    await calendar.screenshot({ path: `/tmp/profile-activity-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
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
    await page.getByRole('button', { name: 'In exam mode' }).click();
    const emojiTrigger = page.getByRole('button', {
      name: 'Choose status emoji',
    });
    await emojiTrigger.click();
    const emojiFilter = page.getByRole('combobox', { name: 'Filter emojis' });
    await expect(emojiFilter).toBeFocused();
    const emojiMenu = page.getByRole('group', { name: 'Select an emoji' });
    const bounds = await emojiMenu.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(16);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 16);
    expect(bounds!.y).toBeGreaterThanOrEqual(16);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
      width === 390 ? 844 - 16 : 1000 - 16,
    );
    await expectNoOverflow(page);
    const options = page.getByRole('listbox', { name: 'Select an emoji' });
    const scrollbar = await options.evaluate((list: HTMLElement) => {
      const box = list.getBoundingClientRect();
      return {
        x: box.right - 6,
        y: box.top + 12,
        width: list.offsetWidth - list.clientWidth,
      };
    });
    expect(scrollbar.width).toBeGreaterThanOrEqual(12);
    await page.mouse.move(scrollbar.x, scrollbar.y);
    await page.mouse.down();
    await expect(emojiMenu).toBeVisible();
    await page.mouse.move(scrollbar.x, scrollbar.y + 60, { steps: 6 });
    await page.mouse.up();
    await expect(emojiMenu).toBeVisible();
    await expect
      .poll(() => options.evaluate((list) => list.scrollTop))
      .toBeGreaterThan(0);
    await expect(options).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Clear emoji' }),
    ).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(emojiFilter).toBeFocused();
    await page.screenshot({ path: `/tmp/profile-emoji-picker-${width}.png` });
    await emojiFilter.fill('books');
    await page.keyboard.press('Enter');
    await expect(emojiTrigger).toBeFocused();
    await expect(
      page.getByRole('dialog', { name: 'Set your status' }),
    ).toBeVisible();
    await emojiTrigger.click();
    await page.keyboard.press('Escape');
    await expect(emojiFilter).toHaveCount(0);
    await expect(emojiTrigger).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByLabel('Choose picture').setInputFiles({
    name: 'avatar.webp',
    mimeType: 'image/webp',
    buffer: await readFile(
      new URL('../public/cards/quillip.webp', import.meta.url),
    ),
  });
  await expect(page.getByLabel('Zoom', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save changes' }),
  ).toBeEnabled();
  await page.getByLabel('Zoom', { exact: true }).fill('1.5');
  const croppedAvatar = await page
    .locator('.profile-photo-field img')
    .getAttribute('src');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page
      .getByRole('dialog', { name: 'Edit profile' })
      .evaluate((dialog) => {
        dialog.scrollTop = 0;
      });
    await page.screenshot({ path: `/tmp/profile-editor-picture-${width}.png` });
  }
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(profile.avatarDataUrl).toMatch(/^data:image\/jpeg;base64,/);
  expect(profile.avatarDataUrl).toBe(croppedAvatar);
  await expect(page.locator('.showcase-avatar img')).toBeVisible();
  await page.getByRole('button', { name: 'Edit showcase' }).click();
  const pickerInspection = page
    .getByRole('dialog', { name: 'Edit favourite cards' })
    .getByRole('button', {
      name: 'Inspect Quillip',
      exact: true,
    });
  await pickerInspection.click();
  await expect(page.getByRole('dialog', { name: 'Quillip' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pickerInspection).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Remove Quillip' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Reorder Cinderhop, position 2' })
    .focus();
  await page.keyboard.press('ArrowLeft');
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
  await page.getByRole('button', { name: 'In exam mode' }).click();
  await page.getByLabel('Status', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const emojiOnlyStatus = page.getByRole('button', { name: 'Edit status: 📚' });
  await expect(emojiOnlyStatus).toBeVisible();
  await page.reload();
  await expect(emojiOnlyStatus).toBeVisible();
  await emojiOnlyStatus.click();
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Clear status now' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const status = page.getByRole('button', { name: 'Set a status' });
    await expect(status).toBeVisible();
    expect(
      await status.evaluate((button) => {
        const center = (element: Element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.top + bounds.height / 2;
        };
        const icon = button.querySelector('svg')!;
        return (
          button.querySelectorAll('svg').length === 1 &&
          button.textContent?.trim() === '' &&
          Math.abs(center(icon) - center(button)) < 1
        );
      }),
    ).toBe(true);
    await page.screenshot({
      fullPage: true,
      path: `/tmp/profile-status-empty-page-${width}.png`,
    });
    await status.screenshot({ path: `/tmp/profile-status-empty-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator('.showcase-identity')
    .screenshot({ path: '/tmp/profile-header-empty.png' });
  profile.status = { emoji: '📚', text: '', expiresAt: null };
  await page.goto('/players/another-player');
  await expect(
    page.getByRole('heading', { name: 'another-player' }),
  ).toBeVisible();
  await expect(page.getByText('📚', { exact: true })).toBeVisible();
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
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left < 0 || bounds.right > width;
      })
      .slice(0, 8)
      .map((element) => element.className);
  });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
    `Overflowing elements: ${JSON.stringify(overflow)}`,
  ).toBe(true);
}

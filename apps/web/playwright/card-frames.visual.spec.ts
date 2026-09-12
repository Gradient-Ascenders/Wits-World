import { expect, test } from '@playwright/test';
import { buildCard, buildUuid } from '../tests/fixtures/cards';
import { activeMatch, MATCH_ID } from '../tests/fixtures/matches';

// Deliberate presentation fixtures: tiers exercise frames, not roster policy.
test('card family across collection, detail, deck selection and battle', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !(
        message.text().includes('404') &&
        message.location().url.includes('/cards/evolutions/')
      )
    )
      errors.push(message.text());
  });
  const cards = ['common', 'rare', 'epic', 'legendary'].map((rarity, index) =>
    buildCard(index + 1, {
      name: ['Quillip', 'Ciphra', 'Prismole', 'Quillip Prestige'][index],
      rarity,
      imageUrl: `/cards/${['quillip', 'ciphra', 'prismole', 'quillip'][index]}.webp`,
    }),
  );
  cards.push(buildCard(5, { name: 'Unknown artwork', imageUrl: null }));
  const match = activeMatch(1);
  match.state.player.creatures[0]!.name = 'Quillip';
  match.state.cpu.activeCreature!.name = 'Ciphra';
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: object;
    if (path.endsWith('/auth/me'))
      body = {
        connectionStrategy: 'auth0',
        id: buildUuid(980),
        lifecycleStatus: 'active',
        playerName: 'frame_reader',
        playerNameSetupRequired: false,
        requestId: 'frames',
        role: 'player',
      };
    else if (path.endsWith('/events'))
      body = { events: [], requestId: 'frames' };
    else if (path.endsWith('/cards/collection'))
      body = { cards, requestId: 'frames' };
    else if (path.endsWith('/decks')) body = { decks: [], requestId: 'frames' };
    else if (path.includes('/matches/'))
      body = { ...match, requestId: 'frames' };
    else if (path.includes('/evolutions/')) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'EVOLUTION_NOT_AVAILABLE',
          detail: 'No evolution available.',
          requestId: 'frames',
          status: 404,
          title: 'Evolution unavailable',
          type: 'about:blank',
        }),
      });
      return;
    } else {
      await route.fallback();
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/collection');
    const gallery = page.getByRole('list', { name: 'Owned card designs' });
    await expect(gallery.locator('button')).toHaveCount(5);
    await gallery.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`collection-${width}.png`),
    });
    if (width === 1440) {
      // A comparison board of the actual rendered cards, at identical widths.
      // No page styles or production data are changed.
      await gallery.evaluate((element) => {
        const board = document.createElement('div');
        board.id = 'frame-comparison';
        board.className = 'collection-page';
        board.inert = true;
        Object.assign(board.style, {
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 280px)',
          gap: '24px',
          padding: '32px',
          width: '1256px',
          background: '#07101e',
          position: 'relative',
        });
        for (const rarity of ['common', 'rare', 'epic', 'legendary']) {
          const card = element.querySelector(`.collectible-card--${rarity}`)!;
          board.append(card.cloneNode(true));
        }
        document.body.append(board);
      });
      await page.locator('#frame-comparison').screenshot({
        animations: 'disabled',
        path: testInfo.outputPath('rarity-comparison.png'),
      });
      await page.locator('#frame-comparison').evaluate((el) => el.remove());
    }
    await gallery.locator('button').first().focus();
    await expect(gallery.locator('button').first()).toBeFocused();
    expect(
      await gallery
        .locator('button')
        .first()
        .evaluate((el) => getComputedStyle(el).outlineStyle),
    ).toBe('solid');
    for (const rarity of ['common', 'rare', 'epic', 'legendary']) {
      await gallery.locator(`.collectible-card--${rarity}`).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath(`detail-${rarity}-${width}.png`),
      });
      await page.keyboard.press('Escape');
    }
    await page.goto('/decks');
    await page.getByRole('button', { name: 'Create a deck' }).click();
    if (width < 1024)
      await page
        .getByRole('group', { name: 'Editor view' })
        .getByRole('button', { name: 'Add cards' })
        .click();
    const picker = page.getByRole('list', {
      name: 'Owned cards available for this deck',
    });
    await expect(picker.locator(':scope > li')).toHaveCount(5);
    await picker
      .getByRole('button', { name: /Add.*Quillip/, exact: false })
      .first()
      .click();
    await picker.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`deck-${width}.png`),
    });
    const selected = picker.locator('.deck-picker-card--selected');
    await expect(selected).toHaveCount(1);
    await expect(
      selected.getByText('Selected 1', { exact: false }),
    ).toBeVisible();
    await expect(selected.getByRole('button', { name: /Add/ })).toBeDisabled();
    await page.goto(`/matches/${MATCH_ID}`);
    await expect(
      page.getByRole('heading', { name: 'Your turn', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`battle-${width}.png`),
    });
    await page
      .getByRole('button', { name: 'View Quillip details', exact: true })
      .first()
      .click();
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`battle-detail-${width}.png`),
    });
    await page.getByRole('button', { name: 'Close Creature details' }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

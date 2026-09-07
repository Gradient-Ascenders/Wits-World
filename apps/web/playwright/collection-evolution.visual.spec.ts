import { expect, test } from '@playwright/test';
import { buildCard, buildUuid } from '../tests/fixtures/cards';

test('evolution stays contextual across layouts, cancellation, conflicts, and recovery', async ({
  page,
}, testInfo) => {
  const sourceCard = buildCard(1, { name: 'Quillip' });
  const initialCards = [1, 2, 3, 4].map((index) => ({
    ...sourceCard,
    ownedCardId: buildUuid(200 + index),
  }));
  const definition = (card: typeof sourceCard, deckPointCost: number) => {
    const { acquiredAt, acquisitionKind, ownedCardId, ...rest } = card;
    void acquiredAt;
    void acquisitionKind;
    void ownedCardId;
    return { ...rest, imageAlt: null, deckPointCost };
  };
  const source = definition(sourceCard, 1);
  const newCard = buildCard(1900, {
    name: 'Quillume',
    rarity: 'epic',
    acquisitionKind: 'evolution',
  });
  const target = definition(newCard, 3);
  let cards = initialCards;
  let eligible = 3;
  let previewFails = false;
  let mutation: 'success' | 'error' | 'stale' = 'error';
  let posts = 0;
  const runtimeErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('/auth/me')) {
      return route.fulfill({
        json: {
          connectionStrategy: 'auth0',
          id: buildUuid(980),
          lifecycleStatus: 'active',
          playerName: 'collection_browser_player',
          playerNameSetupRequired: false,
          requestId: 'fixture-player',
          role: 'player',
        },
      });
    }
    if (url.endsWith('/cards/collection'))
      return route.fulfill({
        json: { cards, requestId: 'fixture-collection' },
      });
    if (url.endsWith('/preview')) {
      if (previewFails) return route.fulfill({ status: 503, json: {} });
      return route.fulfill({
        json: {
          source,
          target,
          copiesRequired: 3,
          ownedCopyCount: cards.length,
          eligibleCopyCount: eligible,
          deckLockedCopyCount: cards.length - eligible,
          canEvolve: eligible >= 3,
          unavailableReason:
            eligible >= 3
              ? null
              : cards.length >= 3
                ? 'saved_deck_lock'
                : 'insufficient_copies',
          copies: cards.map((card, index) => ({
            acquiredAt: card.acquiredAt,
            acquisitionKind: card.acquisitionKind,
            ownedCardId: card.ownedCardId,
            eligible: index < eligible,
            lockReason: index < eligible ? null : 'saved_deck',
          })),
          requestId: 'fixture-preview',
        },
      });
    }
    if (url.endsWith('/cards/evolutions')) {
      posts += 1;
      if (mutation === 'error') return route.fulfill({ status: 503, json: {} });
      if (mutation === 'stale') {
        cards = initialCards.slice(0, 2);
        eligible = 2;
        return route.fulfill({
          status: 409,
          json: {
            code: 'EVOLUTION_COPIES_INSUFFICIENT',
            detail: 'Three eligible copies are required.',
            requestId: 'fixture-stale',
            status: 409,
            title: 'Not enough copies',
            type: 'about:blank',
          },
        });
      }
      const consumedOwnedCardIds = cards
        .slice(0, 3)
        .map((card) => card.ownedCardId);
      cards = [newCard, ...cards.slice(3)];
      return route.fulfill({
        status: 201,
        json: {
          completedAt: '2026-09-07T12:00:00.000Z',
          consumedOwnedCardIds,
          evolutionId: buildUuid(1910),
          newCard,
          replayed: false,
          requestId: 'fixture-result',
          sourceCardDefinitionId: source.cardDefinitionId,
          submissionId: route.request().postDataJSON().submissionId,
          target,
        },
      });
    }
    return route.fulfill({
      json: { options: [], requestId: 'fixture-options' },
    });
  });

  const trigger = page.getByRole('button', {
    name: 'View Quillip details, 4 owned copies',
  });
  const dialog = page.getByRole('dialog');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.goto('/collection');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await dialog.evaluate((el) =>
      Promise.all(el.getAnimations().map((animation) => animation.finished)),
    );
    await expect(
      page.getByRole('button', { name: 'Close card details' }),
    ).toBeFocused();
    await page
      .getByRole('button', { name: 'Review evolution' })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`availability-${width}.png`),
    });
    await page.getByRole('button', { name: 'Review evolution' }).click();
    await expect(
      page.getByRole('heading', { name: 'Evolve Quillip?' }),
    ).toBeFocused();
    const confirm = page.getByRole('button', { name: 'Confirm evolution' });
    await expect(confirm).toBeInViewport();
    const rect = await confirm.boundingBox();
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`confirmation-${width}.png`),
    });
    await confirm.focus();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', {
        name: width < 640 ? 'Lower card sheet' : 'Close card details',
      }),
    ).toBeFocused();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Review evolution' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
  expect(posts).toBe(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await trigger.click();
  await page.getByRole('button', { name: 'Review evolution' }).click();
  await page.getByRole('button', { name: 'Confirm evolution' }).click();
  await expect(page.getByRole('alert')).toContainText('could not be completed');
  await expect(page.getByRole('alert')).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath('confirmation-error-mobile.png'),
  });
  mutation = 'stale';
  await page.getByRole('button', { name: 'Confirm evolution' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'preview is no longer valid',
  );
  await expect(
    page.getByRole('button', { name: 'Review evolution' }),
  ).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('stale-mobile.png') });
  cards = initialCards;
  eligible = 2;
  await page.getByRole('button', { name: 'Refresh availability' }).click();
  await expect(
    page.getByText(/Remove locked copies from saved decks first/),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('locked-mobile.png') });
  await page.keyboard.press('Escape');
  previewFails = true;
  await trigger.click();
  await expect(page.getByRole('alert')).toContainText(
    'availability could not be loaded',
  );
  await page.getByRole('alert').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('preview-error-mobile.png'),
  });
  previewFails = false;
  eligible = 3;
  mutation = 'success';
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('button', { name: 'Review evolution' }).click();
  await page.getByRole('button', { name: 'Confirm evolution' }).click();
  await expect(
    page.getByRole('heading', { name: 'Quillume joined your collection' }),
  ).toBeFocused();
  await expect(page.getByRole('status')).toContainText(
    'Your collection is up to date',
  );
  await expect(page.getByText(/3 Quillip copies were consumed/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('success-mobile.png') });
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'View Quillip details', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'View Quillume details' }),
  ).toBeVisible();
  expect(posts).toBe(3);
  expect(runtimeErrors).toEqual([]);
  expect(
    consoleErrors.filter(
      (message) => !message.includes('503') && !message.includes('409'),
    ),
  ).toEqual([]);
});

import { captureScreenshot } from './visual-capture';
import { selectOption } from './select-option';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { buildCard, buildUuid } from '../tests/fixtures/cards';

async function scrollToEvolutionFeedback(page: Page, dialog: Locator) {
  const scroll = dialog.locator('.card-detail-modal__scroll');
  await scroll.evaluate((element) => {
    element.scrollTop = 0;
  });
  const overflow = await scroll.evaluate(
    (element) => element.scrollHeight - element.clientHeight,
  );
  if (overflow > 0) {
    // Short phones intentionally scroll the result; actions stay anchored.
    await scroll.hover();
    await page.mouse.wheel(0, overflow);
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBeGreaterThanOrEqual(overflow - 1);
  }
}

async function expectEvolutionFeedbackVisible(dialog: Locator) {
  const feedback = dialog.locator('.evolution-result > .state-message');
  await expect(feedback).toBeInViewport({ ratio: 1 });
  // Viewport intersection alone can miss clipping by the sheet's scroll area.
  await expect
    .poll(() =>
      feedback.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const scroll = element
          .closest('.card-detail-modal__scroll')!
          .getBoundingClientRect();
        return bounds.top >= scroll.top && bounds.bottom <= scroll.bottom;
      }),
    )
    .toBe(true);
  await expect(
    dialog.getByRole('button', { name: 'Back to evolutions' }),
  ).toBeInViewport({ ratio: 1 });
}

for (const reducedMotion of [false, true]) {
  test(`evolution across layouts and recovery, reduced motion: ${reducedMotion}`, async ({
    page,
  }, testInfo) => {
    const sourceCard = buildCard(1, {
      name: 'Quillip',
      imageUrl: '/cards/quillip.webp',
    });
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
      imageUrl: '/cards/quillume.webp',
    });
    const target = definition(newCard, 3);
    const existingTarget = { ...newCard, ownedCardId: buildUuid(1901) };
    let cards = [...initialCards, existingTarget];
    let eligible = 3;
    let previewFails = false;
    let collectionRefreshFails = false;
    let mutation: 'success' | 'error' | 'stale' = 'error';
    let posts = 0;
    let holdPreview = false;
    let releasePreview: (() => void) | undefined;
    let releaseSuccess: (() => void) | undefined;
    const submissions: string[] = [];
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
      if (url.endsWith('/cards/collection')) {
        if (collectionRefreshFails)
          return route.fulfill({ status: 503, json: {} });
        return route.fulfill({
          json: { cards, requestId: 'fixture-collection' },
        });
      }
      if (url.endsWith('/preview')) {
        if (!url.includes(source.cardDefinitionId))
          return route.fulfill({
            status: 404,
            json: { code: 'EVOLUTION_NOT_AVAILABLE' },
          });
        const sourceCopies = cards.filter(
          (card) => card.cardDefinitionId === source.cardDefinitionId,
        );
        if (holdPreview)
          await new Promise<void>((resolve) => {
            releasePreview = resolve;
          });
        if (previewFails) return route.fulfill({ status: 503, json: {} });
        return route.fulfill({
          json: {
            source,
            target,
            copiesRequired: 3,
            ownedCopyCount: sourceCopies.length,
            eligibleCopyCount: eligible,
            deckLockedCopyCount: sourceCopies.length - eligible,
            tradeReservedCopyCount: 0,
            canEvolve: eligible >= 3,
            unavailableReason:
              eligible >= 3
                ? null
                : sourceCopies.length >= 3
                  ? 'saved_deck_lock'
                  : 'insufficient_copies',
            copies: sourceCopies.map((card, index) => ({
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
        submissions.push(route.request().postDataJSON().submissionId);
        if (mutation === 'error')
          return route.fulfill({ status: 503, json: {} });
        if (mutation === 'stale') {
          cards = [...initialCards.slice(0, 2), existingTarget];
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
        await new Promise<void>((resolve) => {
          releaseSuccess = resolve;
        });
        const consumedOwnedCardIds = cards
          .slice(0, 3)
          .map((card) => card.ownedCardId);
        cards = [newCard, ...cards.slice(3)];
        eligible = 0;
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
      name: 'Preview Quillip evolution',
    });
    const dialog = page.getByRole('dialog');
    for (const width of reducedMotion ? [390] : [390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
      await page.goto('/collection');
      await page
        .getByRole('button', { name: 'View Quillip details, 4 owned copies' })
        .click();
      await expect(page.getByRole('button', { name: 'Evolve' })).toHaveCount(0);
      await page.keyboard.press('Escape');
      holdPreview = true;
      await page.getByRole('link', { name: 'Evolutions', exact: true }).click();
      if (holdPreview) {
        await expect(
          page
            .getByRole('status')
            .filter({ hasText: 'Checking evolution paths…' }),
        ).toBeVisible();
        const loading = page
          .getByRole('status')
          .filter({ hasText: 'Checking evolution paths…' });
        await expect(loading.locator('.loading-seal')).toHaveCount(1);
        await expect(loading.locator('.quest-marker')).toHaveCount(0);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(
          'Loading evolutions',
        );
        await expect(
          page.getByRole('navigation', { name: 'Collection sections' }),
        ).toBeVisible();
        await expectCollectionLoaderCentred(page);
        await captureScreenshot(test.info(), page, {
          path: testInfo.outputPath(`loading-${width}.png`),
          fullPage: true,
        });
        holdPreview = false;
        releasePreview?.();
      }
      await expect(
        page
          .getByRole('list', { name: 'Evolution candidates' })
          .getByText('Ready to evolve', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('1 used in a deck', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel('Availability', { exact: true }),
      ).toContainText('Ready');
      await expect(page.getByText('No evolution available')).toHaveCount(0);
      await selectOption(
        page.getByLabel('Availability', { exact: true }),
        'all',
      );
      await expect(page.getByText('No evolution available')).toBeVisible();
      const sourceDetailsTrigger = page.getByRole('button', {
        name: 'View Quillip details',
      });
      await expect(sourceDetailsTrigger).toBeVisible();

      if (width === 1440 && !reducedMotion) {
        await sourceDetailsTrigger.hover({ position: { x: 70, y: 50 } });
        await expect(sourceDetailsTrigger).toHaveAttribute('data-hovered', '');
        await expect
          .poll(() =>
            sourceDetailsTrigger.evaluate(
              (element) => getComputedStyle(element).transform,
            ),
          )
          .not.toBe('none');
        await page.mouse.move(0, 0);
        await expect(sourceDetailsTrigger).not.toHaveAttribute(
          'data-hovered',
          '',
        );
      }

      await sourceDetailsTrigger.click();
      const cardDialog = page.getByRole('dialog', { name: 'Quillip' });
      await expect(cardDialog).toHaveAttribute('data-rarity', 'common');
      await expect(cardDialog.getByText('Knowledge Surge')).toBeVisible();
      await cardDialog
        .getByRole('button', { name: 'Close Quillip details' })
        .click();
      await expect(sourceDetailsTrigger).toBeFocused();
      await captureScreenshot(test.info(), page, {
        path: testInfo.outputPath(`evolutions-${width}.png`),
        fullPage: true,
      });
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(dialog).toBeVisible();
      await dialog.evaluate((el) =>
        Promise.all(el.getAnimations().map((animation) => animation.finished)),
      );
      await expect(
        page.getByRole('button', { name: 'Close evolution' }),
      ).toBeFocused();
      const targetDetailsTrigger = dialog.getByRole('button', {
        name: 'View Quillume details',
      });
      await expect(dialog.getByLabel('Creature attributes')).toHaveCount(0);
      if (width >= 768) {
        await targetDetailsTrigger.hover({ position: { x: 35, y: 45 } });
        await expect(targetDetailsTrigger).toHaveAttribute('data-hovered', '');
        await expect(dialog.getByRole('complementary')).toHaveCount(0);
        await targetDetailsTrigger.focus();
        await page.keyboard.press('Enter');
      } else {
        await targetDetailsTrigger.click();
      }
      const targetDetailsDialog = page.getByRole('dialog', {
        name: 'Quillume',
        exact: true,
      });
      await expect(targetDetailsDialog).toBeVisible();
      await expect(
        targetDetailsDialog.getByRole('heading', { name: 'Base stats' }),
      ).toBeVisible();
      await expect(
        targetDetailsDialog.getByText('HP', { exact: true }),
      ).toBeVisible();
      await expect(
        targetDetailsDialog.getByText('Power', { exact: true }),
      ).toBeVisible();
      await expect(
        targetDetailsDialog.getByText('Knowledge Surge'),
      ).toBeVisible();
      await expect(
        targetDetailsDialog.getByRole('button', {
          name: 'Close Quillume details',
        }),
      ).toBeFocused();
      await targetDetailsDialog.evaluate((element) =>
        Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        ),
      );
      await captureScreenshot(test.info(), page, {
        path: testInfo.outputPath(`target-full-details-${width}.png`),
      });
      await page.keyboard.press('Tab');
      await expect(
        targetDetailsDialog.locator('.trade-card-detail__body'),
      ).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(
        targetDetailsDialog.getByRole('button', {
          name: width >= 768 ? 'Close Quillume details' : 'Close card sheet',
        }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(targetDetailsDialog).not.toBeVisible();
      await expect(dialog).toBeVisible();
      await expect(targetDetailsTrigger).toBeFocused();
      await page.getByRole('button', { name: 'Close evolution' }).focus();
      const composition = await dialog
        .getByLabel('Evolution preview')
        .evaluate((element) => {
          const target = element
            .querySelector('.evolution-preview__target')!
            .getBoundingClientRect();
          const sources = element
            .querySelector('.evolution-source-copies')!
            .getBoundingClientRect();
          return {
            centreDelta:
              target.x + target.width / 2 - (sources.x + sources.width / 2),
            sourcesBelowTarget: sources.top > target.bottom,
          };
        });
      expect(Math.abs(composition.centreDelta)).toBeLessThan(2);
      expect(composition.sourcesBelowTarget).toBe(true);
      await captureScreenshot(test.info(), page, {
        path: testInfo.outputPath(`preview-${width}.png`),
      });
      if (width === 1440) {
        await page.setViewportSize({ width, height: 1410 });
        const tallRecipe = await dialog.evaluate((element) => {
          const sources = element
            .querySelector('.evolution-preview__sources')!
            .getBoundingClientRect();
          const scroll = element
            .querySelector('.card-detail-modal__scroll')!
            .getBoundingClientRect();
          const connector = element
            .querySelector('.evolution-convergence')!
            .getBoundingClientRect();
          return {
            spaceBelowSources: scroll.bottom - sources.bottom,
            connectorHeight: connector.height,
          };
        });
        expect(tallRecipe.spaceBelowSources).toBeGreaterThanOrEqual(0);
        expect(tallRecipe.spaceBelowSources).toBeLessThan(96);
        expect(tallRecipe.connectorHeight).toBeGreaterThan(48);
        expect(tallRecipe.connectorHeight).toBeLessThan(192);
        await captureScreenshot(test.info(), page, {
          path: testInfo.outputPath('preview-desktop-tall.png'),
        });
        await page.setViewportSize({ width, height: 960 });
      }
      await page
        .getByRole('button', { name: 'Evolve' })
        .scrollIntoViewIfNeeded();
      await captureScreenshot(test.info(), page, {
        path: testInfo.outputPath(`availability-${width}.png`),
      });
      const previewBounds = await dialog.boundingBox();
      await page.getByRole('button', { name: 'Evolve' }).click();
      await expect(
        page.getByRole('heading', {
          name: 'Are you sure you want to evolve Quillip?',
        }),
      ).toBeFocused();
      const confirm = page.getByRole('button', {
        name: 'Evolve',
        exact: true,
      });
      await expect(confirm).toBeInViewport();
      await expect(dialog.getByText('This cannot be undone.')).toBeInViewport();
      await expect(
        dialog.getByText(
          'This will use 3 copies of Quillip to create 1 Quillume.',
        ),
      ).toBeInViewport({ ratio: 1 });
      const warning = page.getByRole('alertdialog');
      await expect(warning.locator('.card-frame')).toHaveCount(0);
      await expect(
        dialog.locator('.evolution-preview .card-frame'),
      ).toHaveCount(4);
      expect(await dialog.boundingBox()).toEqual(previewBounds);
      const popup = await warning.boundingBox();
      expect(popup!.height).toBeLessThan(500);
      expect(popup!.width).toBeLessThanOrEqual(513);
      const rect = await confirm.boundingBox();
      expect(rect!.height).toBeGreaterThanOrEqual(44);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await captureScreenshot(test.info(), page, {
        path: testInfo.outputPath(`confirmation-${width}.png`),
      });
      await confirm.focus();
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('button', {
          name: 'Cancel',
        }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(warning).not.toBeVisible();
      await expect(page.getByRole('button', { name: 'Evolve' })).toBeFocused();
      await page.getByRole('button', { name: 'Evolve' }).click();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Evolve' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
    }
    expect(posts).toBe(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({
      reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    });
    await trigger.click();
    await page.getByRole('button', { name: 'Evolve' }).click();
    await page.getByRole('button', { name: 'Evolve', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'could not be completed',
    );
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(page.getByTestId('evolution-reveal')).toHaveCount(0);
    await captureScreenshot(test.info(), page, {
      path: testInfo.outputPath('confirmation-error-mobile.png'),
    });
    mutation = 'stale';
    await page.getByRole('button', { name: 'Evolve', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'preview is no longer valid',
    );
    await expect(page.getByRole('button', { name: 'Evolve' })).toBeDisabled();
    await captureScreenshot(test.info(), page, {
      path: testInfo.outputPath('stale-mobile.png'),
    });
    await expect(page.getByTestId('evolution-reveal')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(
      page.getByText('Not enough copies', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('2 / 3', { exact: true })).toBeVisible();
    await captureScreenshot(test.info(), page, {
      path: testInfo.outputPath('insufficient-mobile.png'),
    });
    cards = [...initialCards, existingTarget];
    eligible = 2;
    await page.getByRole('link', { name: 'Cards', exact: true }).click();
    await page.getByRole('link', { name: 'Evolutions', exact: true }).click();
    await selectOption(page.getByLabel('Availability', { exact: true }), 'all');
    await expect(
      page.getByText('Copies locked in decks', { exact: true }),
    ).toBeVisible();
    await trigger.click();
    await expect(
      page.getByText(/Remove them from all saved decks to use them/),
    ).toBeVisible();
    await captureScreenshot(test.info(), page, {
      path: testInfo.outputPath('locked-mobile.png'),
    });
    await page.keyboard.press('Escape');
    previewFails = true;
    await page.getByRole('link', { name: 'Cards', exact: true }).click();
    await page.getByRole('link', { name: 'Evolutions', exact: true }).click();
    await selectOption(page.getByLabel('Availability', { exact: true }), 'all');
    await expect(page.getByText('Availability unknown')).toBeVisible();
    await captureScreenshot(test.info(), page, {
      path: testInfo.outputPath('preview-error-mobile.png'),
    });
    previewFails = false;
    eligible = 3;
    mutation = 'success';
    await page.getByRole('button', { name: 'Retry availability' }).click();
    await trigger.click();
    await page.getByRole('button', { name: 'Evolve' }).click();
    await page.getByRole('button', { name: 'Evolve', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Evolving…' }),
    ).toBeDisabled();
    await expect(page.getByTestId('evolution-reveal')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect.poll(() => Boolean(releaseSuccess)).toBe(true);
    if (!reducedMotion) {
      // Freeze the authored sequence at insertion so captures do not depend
      // on machine speed or the duration of a screenshot.
      await page.evaluate(() => {
        const observer = new MutationObserver(() => {
          const reveal = document.querySelector('.evolution-reveal');
          if (!reveal) return;
          reveal.getAnimations({ subtree: true }).forEach((animation) => {
            animation.pause();
            animation.currentTime = 0;
          });
          observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }
    collectionRefreshFails = true;
    await page.setViewportSize({ width: 320, height: 568 });
    releaseSuccess!();
    await expect(
      page.getByRole('heading', { name: 'Evolution complete' }),
    ).toBeFocused();
    await expect(dialog.getByRole('alert')).toContainText(
      'Card evolved. Could not refresh your collection. Try again.',
    );
    await scrollToEvolutionFeedback(page, dialog);
    await expectEvolutionFeedbackVisible(dialog);
    const refresh = dialog.getByRole('button', { name: 'Refresh collection' });
    await expect(refresh).toBeInViewport({ ratio: 1 });
    await captureScreenshot(test.info(), page, {
      path: testInfo.outputPath('refresh-error-320x568.png'),
    });
    collectionRefreshFails = false;
    await refresh.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('Collection updated');
    expect(posts).toBe(3);
    await expect(page.getByText('3 × Quillip', { exact: true })).toBeVisible();
    await expect(page.locator('.evolution-result__quantity')).toHaveText(
      '2 Quillume copies in collection',
    );
    await expect(page.getByTestId('evolution-reveal')).toHaveAttribute(
      'data-reduced-motion',
      String(reducedMotion),
    );
    const particle = dialog.locator('.evolution-particles__mote').first();
    await expect(dialog.locator('.evolution-particles')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await expect(particle).toHaveCSS(
      'animation-name',
      reducedMotion ? 'none' : 'evolution-particle-drift',
    );
    if (!reducedMotion) {
      await expect(page.getByTestId('evolution-reveal')).toHaveAttribute(
        'data-celebrating',
        'true',
      );
      await expect(
        page.getByRole('button', { name: 'Back to evolutions' }),
      ).toBeEnabled();
      for (const viewport of [
        { width: 320, height: 568 },
        { width: 390, height: 844 },
        { width: 768, height: 960 },
        { width: 1440, height: 960 },
      ]) {
        await page.setViewportSize(viewport);
        await dialog.evaluate(async (element) => {
          // Finish the incumbent sheet's viewport-height transition before
          // inspecting the separately paused card sequence.
          await Promise.all(
            element.getAnimations().map((animation) => animation.finished),
          );
        });
        await scrollToEvolutionFeedback(page, dialog);
        for (const [phase, time] of [
          ['gather', 510],
          ['merging', 1000],
          ['convergence', 1320],
          ['reveal', 2300],
          ['glint', 2700],
          ['settled', 3300],
        ] as const) {
          await page
            .getByTestId('evolution-reveal')
            .evaluate((element, time) => {
              element.getAnimations({ subtree: true }).forEach((animation) => {
                animation.currentTime = time;
              });
            }, time);
          if (phase === 'merging') {
            expect(
              await dialog
                .locator('.evolution-reveal__source')
                .evaluateAll((sources) =>
                  sources.every(
                    (source) => Number(getComputedStyle(source).opacity) > 0.5,
                  ),
                ),
            ).toBe(true);
          }
          await expectEvolutionFeedbackVisible(dialog);
          await captureScreenshot(test.info(), page, {
            path: testInfo.outputPath(
              `ascension-${phase}-${viewport.width}.png`,
            ),
          });
        }
      }
      const lateFrame = dialog.locator(
        '.evolution-reveal__card .evolution-card-inspection__button > .card-frame',
      );
      const beforeCompletion = await lateFrame.boundingBox();
      // Hover tilt must retain its shadow and edges before the decoration ends.
      await lateFrame.hover({ position: { x: 35, y: 45 } });
      await expect(
        dialog.locator('.evolution-reveal .collectible-card__art-perspective'),
      ).toHaveCSS('clip-path', 'none');
      await captureScreenshot(test.info(), page, {
        path: testInfo.outputPath('late-hover-desktop.png'),
      });
      await page.mouse.move(0, 0);
      await expect
        .poll(async () => {
          const bounds = await lateFrame.boundingBox();
          return Math.abs(bounds!.width - beforeCompletion!.width);
        })
        .toBeLessThan(0.1);
      await page.getByTestId('evolution-reveal').evaluate((element) => {
        element.getAnimations({ subtree: true }).forEach((animation) => {
          animation.play();
        });
      });
      await expect(page.getByTestId('evolution-reveal')).toHaveAttribute(
        'data-celebrating',
        'false',
      );
      const afterCompletion = await lateFrame.boundingBox();
      expect(
        Math.abs(afterCompletion!.width - beforeCompletion!.width),
      ).toBeLessThan(0.1);
      expect(
        Math.abs(afterCompletion!.height - beforeCompletion!.height),
      ).toBeLessThan(0.1);
      expect(Math.abs(afterCompletion!.x - beforeCompletion!.x)).toBeLessThan(
        0.1,
      );
      expect(Math.abs(afterCompletion!.y - beforeCompletion!.y)).toBeLessThan(
        0.1,
      );
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await expect(page.getByTestId('evolution-reveal')).toHaveAttribute(
      'data-celebrating',
      'false',
    );
    await expect(page.locator('.evolution-reveal__glint')).toHaveCount(0);
    await captureScreenshot(test.info(), page, {
      path: testInfo.outputPath('success-mobile.png'),
    });
    for (const viewport of reducedMotion
      ? [
          { width: 390, height: 844 },
          { width: 320, height: 568 },
        ]
      : [
          { width: 390, height: 844 },
          { width: 768, height: 960 },
          { width: 1440, height: 960 },
          { width: 749, height: 897 },
          { width: 320, height: 568 },
        ]) {
      await page.setViewportSize(viewport);
      const resultCard = dialog.getByRole('button', {
        name: 'View Quillume details',
      });
      await expect(resultCard).toBeVisible();
      await expect(dialog.getByLabel('Creature attributes')).toHaveCount(0);
      await expect(dialog.getByText(/Added to your collection/)).toHaveCount(0);
      await expect(dialog.getByLabel('Evolution exchange')).toContainText(
        'Used3 × QuillipCreated1 × Quillume',
      );
      if (viewport.width >= 640) {
        await resultCard.hover({ position: { x: 35, y: 45 } });
        await expect(resultCard).toHaveAttribute('data-hovered', '');
        await expect
          .poll(() =>
            resultCard.evaluate(
              (element) => getComputedStyle(element).transform,
            ),
          )
          .not.toBe('none');
      } else if (reducedMotion) {
        await resultCard.hover();
        await expect(resultCard).not.toHaveAttribute('data-hovered', '');
      }
      await resultCard.focus();
      await page.keyboard.press('Enter');
      const resultDetails = page.getByRole('dialog', {
        name: 'Quillume',
        exact: true,
      });
      await expect(resultDetails.getByText('Knowledge Surge')).toBeVisible();
      await expect(
        resultDetails.getByRole('heading', { name: 'Base stats' }),
      ).toBeVisible();
      await expect(particle).toHaveCSS('animation-play-state', 'paused');
      await page.keyboard.press('Tab');
      await expect(
        resultDetails.locator('.trade-card-detail__body'),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(resultDetails).not.toBeVisible();
      await expect(resultCard).toBeFocused();
      if (!reducedMotion)
        await expect(particle).toHaveCSS('animation-play-state', 'running');
      await page.mouse.move(0, 0);
      await page.getByRole('button', { name: 'Close evolution' }).focus();
      await scrollToEvolutionFeedback(page, dialog);
      await expectEvolutionFeedbackVisible(dialog);
      const geometry = await dialog.evaluate((element) => {
        const result = element
          .querySelector('.evolution-result')!
          .getBoundingClientRect();
        const scroll = element
          .querySelector('.card-detail-modal__scroll')!
          .getBoundingClientRect();
        return {
          gapBelowResult: scroll.bottom - result.bottom,
          overflows: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(geometry.overflows).toBe(false);
      if (viewport.width >= 640) {
        expect(geometry.gapBelowResult).toBeLessThan(48);
      }
      await captureScreenshot(test.info(), page, {
        path: testInfo.outputPath(
          `success-${viewport.width}x${viewport.height}.png`,
        ),
      });
    }
    await page.evaluate(
      (motion) => {
        const key = 'wits-world.accessibility-preferences.v1';
        const value = JSON.stringify({ motion });
        localStorage.setItem(key, value);
        window.dispatchEvent(
          new StorageEvent('storage', { key, newValue: value }),
        );
      },
      reducedMotion ? 'full' : 'reduce',
    );
    await expect(page.getByTestId('evolution-reveal')).toHaveAttribute(
      'data-reduced-motion',
      String(!reducedMotion),
    );
    await expect(particle).toHaveCSS(
      'animation-name',
      reducedMotion ? 'evolution-particle-drift' : 'none',
    );
    await expect(page.getByTestId('evolution-reveal')).toHaveAttribute(
      'data-celebrating',
      'false',
    );
    await page.getByRole('button', { name: 'Back to evolutions' }).click();
    await page.getByRole('link', { name: 'Cards', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'View Quillip details', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'View Quillume details, 2 owned copies',
      }),
    ).toBeVisible();
    expect(posts).toBe(3);
    expect(submissions[0]).toBe(submissions[1]);
    expect(runtimeErrors).toEqual([]);
    expect(
      consoleErrors.filter(
        (message) =>
          !message.includes('503') &&
          !message.includes('409') &&
          !message.includes('404'),
      ),
    ).toEqual([]);
  });
}

test('finds evolutions across pages and keeps browsing usable after consuming the last page', async ({
  page,
}, testInfo) => {
  const names = [
    'Axiomar',
    'Basalox',
    'Karrik',
    'Nimbril',
    'Quillip',
    'Sigilisk',
    'Voltiki',
  ];
  const groups = names.map((name, index) =>
    Array.from({ length: 3 }, (_, copy) =>
      buildCard(3000 + index, {
        name,
        rarity: index % 2 === 0 ? 'common' : 'rare',
        imageUrl: `/cards/${name.toLowerCase()}.webp`,
        ownedCardId: buildUuid(3500 + index * 3 + copy),
      }),
    ),
  );
  const terminal = buildCard(4000, {
    name: 'Arcalyron',
    rarity: 'legendary',
    acquisitionKind: 'evolution',
    imageUrl: '/cards/arcalyron.webp',
  });
  let cards = [...groups.flat(), terminal];
  let previewRequests = 0;
  let mutationRequests = 0;
  const definition = (card: typeof terminal) => {
    const { acquiredAt, acquisitionKind, ownedCardId, ...rest } = card;
    void acquiredAt;
    void acquisitionKind;
    void ownedCardId;
    return { ...rest, imageAlt: null, deckPointCost: 3 };
  };
  const targetCard = buildCard(4001, {
    name: 'Voltadrake',
    rarity: 'epic',
    acquisitionKind: 'evolution',
    imageUrl: '/cards/voltadrake.webp',
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          connectionStrategy: 'auth0',
          id: buildUuid(980),
          lifecycleStatus: 'active',
          playerName: 'evolution_browse_player',
          playerNameSetupRequired: false,
          requestId: 'browse-player',
          role: 'player',
        },
      });
    if (url.pathname.endsWith('/cards/collection'))
      return route.fulfill({ json: { cards, requestId: 'browse-collection' } });
    if (url.pathname.endsWith('/preview')) {
      previewRequests += 1;
      const copies = cards.filter((card) =>
        url.pathname.includes(card.cardDefinitionId),
      );
      if (!copies.length || copies[0]!.acquisitionKind === 'evolution')
        return route.fulfill({
          status: 404,
          json: { code: 'EVOLUTION_NOT_AVAILABLE' },
        });
      const targetNames: Record<string, string> = {
        Axiomar: 'Axiomarch',
        Basalox: 'Basalorn',
        Karrik: 'Karradon',
        Nimbril: 'Nimbrael',
        Quillip: 'Quillume',
        Sigilisk: 'Sigilith',
      };
      const target =
        copies[0]!.name === 'Voltiki'
          ? targetCard
          : buildCard(4100, {
              name: targetNames[copies[0]!.name],
              rarity: ['Axiomar', 'Basalox'].includes(copies[0]!.name)
                ? 'legendary'
                : 'epic',
            });
      return route.fulfill({
        json: {
          source: definition(copies[0]!),
          target: definition(target),
          copiesRequired: 3,
          ownedCopyCount: copies.length,
          eligibleCopyCount: copies.length,
          deckLockedCopyCount: 0,
          tradeReservedCopyCount: 0,
          canEvolve: copies.length >= 3,
          unavailableReason: copies.length >= 3 ? null : 'insufficient_copies',
          copies: copies.map((card) => ({
            acquiredAt: card.acquiredAt,
            acquisitionKind: card.acquisitionKind,
            ownedCardId: card.ownedCardId,
            eligible: true,
            lockReason: null,
          })),
          requestId: 'browse-preview',
        },
      });
    }
    if (url.pathname.endsWith('/cards/evolutions')) {
      mutationRequests += 1;
      const { sourceCardDefinitionId, submissionId } = request.postDataJSON();
      const consumed = cards.filter(
        (card) => card.cardDefinitionId === sourceCardDefinitionId,
      );
      cards = [
        ...cards.filter(
          (card) => card.cardDefinitionId !== sourceCardDefinitionId,
        ),
        targetCard,
      ];
      return route.fulfill({
        status: 201,
        json: {
          completedAt: '2026-10-02T12:00:00.000Z',
          consumedOwnedCardIds: consumed.map((card) => card.ownedCardId),
          evolutionId: buildUuid(4200),
          newCard: targetCard,
          replayed: false,
          requestId: 'browse-result',
          sourceCardDefinitionId,
          submissionId,
          target: definition(targetCard),
        },
      });
    }
    return route.fulfill({
      json: { options: [], requestId: 'browse-options' },
    });
  });

  for (const viewport of [
    { width: 320, height: 700 },
    { width: 390, height: 844 },
    { width: 768, height: 960 },
    { width: 1440, height: 960 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/collection/evolutions');
    const list = page.getByRole('list', { name: 'Evolution candidates' });
    await expect(
      page.getByLabel('Availability', { exact: true }),
    ).toContainText('Ready');
    await expect(list.getByRole('listitem')).toHaveCount(6);
    await expect(page.getByText('1–6 of 7 cards')).toBeVisible();
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    expect(overflows).toBe(false);
    await captureScreenshot(test.info(), page, {
      path: testInfo.outputPath(`browse-${viewport.width}.png`),
      fullPage: true,
    });
    const requestsBeforeSearch = previewRequests;
    const pages = page.getByRole('navigation', {
      name: 'Evolution pages',
      exact: true,
    });
    await pages.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText('7–7 of 7 cards')).toBeFocused();
    await expect(
      list.getByRole('button', { name: 'Preview Voltiki evolution' }),
    ).toBeVisible();
    const search = page.getByRole('searchbox', { name: 'Search evolutions' });
    await search.fill(' VOLTADRAKE ');
    await expect(page.getByText('1–1 of 1 cards')).toBeVisible();
    await expect(
      list.getByRole('button', { name: 'Preview Voltiki evolution' }),
    ).toBeVisible();
    await selectOption(page.getByLabel('Rarity', { exact: true }), 'legendary');
    await expect(
      page.getByRole('heading', { name: 'No matching cards' }),
    ).toBeVisible();
    await captureScreenshot(test.info(), page, {
      path: testInfo.outputPath(`empty-search-${viewport.width}.png`),
    });
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(search).toBeFocused();
    await search.fill('Arcalyron');
    await expect(
      list.getByRole('button', { name: 'View Arcalyron details' }),
    ).toBeVisible();
    await selectOption(
      page.getByLabel('Availability', { exact: true }),
      'ready',
    );
    await expect(
      page.getByRole('heading', { name: 'No matching cards' }),
    ).toBeVisible();
    expect(previewRequests).toBe(requestsBeforeSearch);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await selectOption(page.getByLabel('Availability', { exact: true }), 'ready');
  await page
    .getByRole('navigation', { name: 'Evolution pages below cards' })
    .getByRole('button', { name: 'Next page' })
    .click();
  await expect(page.getByText('7–7 of 7 cards')).toBeFocused();
  await expect(
    page.getByRole('searchbox', { name: 'Search evolutions' }),
  ).toBeInViewport();
  await page.getByRole('button', { name: 'Preview Voltiki evolution' }).click();
  await page.getByRole('button', { name: 'Evolve' }).click();
  await page.getByRole('button', { name: 'Evolve' }).click();
  await expect(
    page.getByRole('heading', { name: 'Evolution complete' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back to evolutions' }).click();
  await expect(page.getByText('1–6 of 6 cards')).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Evolution pages', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Availability', { exact: true })).toContainText(
    'Ready',
  );
  expect(mutationRequests).toBe(1);
  await captureScreenshot(test.info(), page, {
    path: testInfo.outputPath('browse-after-evolving.png'),
  });
});

test('centres loading screens across every Collection section', async ({
  page,
}, testInfo) => {
  let releaseLoad!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me')) {
      return route.fulfill({
        json: {
          connectionStrategy: 'auth0',
          id: buildUuid(980),
          lifecycleStatus: 'active',
          playerName: 'collection_loading_player',
          playerNameSetupRequired: false,
          requestId: 'loading-player',
          role: 'player',
        },
      });
    }
    if (/\/(cards\/collection|decks|trades)$/.test(url.pathname)) await gate;
    return route.fulfill({
      json: {
        cards: [buildCard(1)],
        decks: [],
        trades: [],
        nextCursor: null,
        requestId: 'loading-fixture',
      },
    });
  });
  try {
    for (const section of ['cards', 'decks', 'evolutions', 'trades']) {
      await page.goto(
        section === 'cards' ? '/collection' : `/collection/${section}`,
      );
      await expect(page.locator('.page-loading-state')).toHaveCount(1);
      await expect(
        page.locator('.page-loading-state .loading-seal'),
      ).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Collection sections' }),
      ).toBeVisible();
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
        { width: 1440, height: 960 },
      ]) {
        await page.setViewportSize(viewport);
        await expectCollectionLoaderCentred(page);
        await captureScreenshot(test.info(), page, {
          path: testInfo.outputPath(`${section}-loading-${viewport.width}.png`),
        });
      }
    }
  } finally {
    releaseLoad();
  }
});

async function expectCollectionLoaderCentred(page: Page) {
  const geometry = await page.locator('#main-content').evaluate((main) => {
    const loader = main.querySelector('.page-loading-state')!;
    const navigation = main.querySelector('.collection-navigation')!;
    const mainBox = main.getBoundingClientRect();
    const loaderBox = loader.getBoundingClientRect();
    const navBox = navigation.getBoundingClientRect();
    const contentTop =
      navBox.bottom +
      Number.parseFloat(getComputedStyle(navigation).marginBottom);
    const contentBottom =
      mainBox.bottom - Number.parseFloat(getComputedStyle(main).paddingBottom);
    return {
      horizontalDelta:
        loaderBox.x + loaderBox.width / 2 - (mainBox.x + mainBox.width / 2),
      verticalDelta:
        loaderBox.y + loaderBox.height / 2 - (contentTop + contentBottom) / 2,
      overlapsNavigation: loaderBox.top < navBox.bottom,
      overflows:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    };
  });
  expect(Math.abs(geometry.horizontalDelta)).toBeLessThan(2);
  expect(Math.abs(geometry.verticalDelta)).toBeLessThan(2);
  expect(geometry.overlapsNavigation).toBe(false);
  expect(geometry.overflows).toBe(false);
}

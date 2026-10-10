import { captureScreenshot, attachScreenshot } from './visual-capture';
import { selectOption } from './select-option';
import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from '@playwright/test';

import type {
  AuthorCard,
  AuthorCardInput,
  AuthorCampaign,
  AuthorChallenge,
  AuthorEvent,
  AuthorEventInput,
  AuthorQuestion,
  AuthorQuestionInput,
  AuthorReviewQueueItem,
  AuthorTrail,
} from '../src/api/author';

const EVENT_A = '10000000-0000-4000-8000-000000000001';
const EVENT_B = '10000000-0000-4000-8000-000000000002';
const EVENT_C = '10000000-0000-4000-8000-000000000003';
const EVENT_NEW = '10000000-0000-4000-8000-000000000004';
const CHALLENGE_A = '20000000-0000-4000-8000-000000000001';
const QUESTION_A = '40000000-0000-4000-8000-000000000001';
const ORDERING_ATTEMPT = '30000000-0000-4000-8000-000000000001';
const CARD_DRAFT = '50000000-0000-4000-8000-000000000001';
const CARD_CREATURE = '50000000-0000-4000-8000-000000000002';
const CARD_POWER = '50000000-0000-4000-8000-000000000003';
const CARD_TALL_CREATURE = '50000000-0000-4000-8000-000000000098';
const CARD_RETIRED_CREATURE = '50000000-0000-4000-8000-000000000099';
const CAMPAIGN_A = '70000000-0000-4000-8000-000000000001';
const TRAIL_A = '80000000-0000-4000-8000-000000000001';

test('Author sidebar collapses without losing edits and supports keyboard navigation', async ({
  page,
}, testInfo) => {
  await installAuthorApi(page);
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto('/author/events');

  const navigation = page.getByRole('navigation', { name: 'Author sections' });
  const toggle = page.getByRole('button', { name: /Author navigation/ });
  const workspace = page.locator('.author-console__workspace');
  await expect(navigation).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const expandedWidth = (await workspace.boundingBox())!.width;
  await captureScreenshot(test.info(), page, {
    path: testInfo.outputPath('sidebar-expanded.png'),
  });

  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(navigation).toBeHidden();
  await expect(toggle).toHaveAccessibleName('Expand Author navigation');
  expect((await workspace.boundingBox())!.width).toBeGreaterThan(
    expandedWidth + 100,
  );
  await expect(toggle).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await captureScreenshot(test.info(), page, {
    path: testInfo.outputPath('sidebar-collapsed.png'),
  });

  await page.getByRole('link', { name: 'New event' }).click();
  await expect(navigation).toBeHidden();
  await page.getByLabel('Event title').fill('Sidebar preserves this draft');
  await toggle.click();
  await navigation.getByRole('link', { name: 'Events', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(navigation).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(page.getByLabel('Event title')).toHaveValue(
    'Sidebar preserves this draft',
  );

  await toggle.click();
  await navigation.getByRole('link', { name: 'Cards', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Discard unsaved changes?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL('/author/cards');
  await expect(
    navigation.getByRole('link', { name: 'Cards', exact: true }),
  ).toHaveAttribute('aria-current', 'page');

  for (const width of [390, 768]) {
    await page.setViewportSize({ height: 844, width });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(navigation).toBeHidden();
    await toggle.click();
    await expect(navigation).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(test.info(), page, {
      path: testInfo.outputPath(`sidebar-${width}.png`),
    });
    await navigation.getByRole('link', { name: 'Events', exact: true }).click();
    await expect(page).toHaveURL('/author/events');
    await expect(navigation).toBeHidden();
    // Reset below the breakpoint before the next viewport iteration.
    await page.setViewportSize({ height: 900, width: 1440 });
    await expect(navigation).toBeVisible();
  }
});

test('desktop Event workspace keeps discovery, detail, editing and readiness focused', async ({
  page,
}) => {
  const state = await installAuthorApi(page);
  const consoleErrors = monitorConsoleErrors(page);
  await page.setViewportSize({ height: 800, width: 1280 });
  await page.goto('/author/events');

  await expect(
    page.getByRole('heading', { name: 'Author console' }),
  ).toBeAttached();
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(
    page.getByRole('complementary', { name: 'Authored events' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Event workspace detail' }),
  ).toBeHidden();
  await expectNoHorizontalOverflow(page);

  const eventSearch = page.getByRole('searchbox', { name: 'Search' });
  await eventSearch.fill('MSL');
  await expect(page.getByRole('link', { name: /MSL Open Day/u })).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Great Hall Discovery/u }),
  ).toHaveCount(0);
  await eventSearch.fill('');
  await selectOption(page.getByLabel('Lifecycle', { exact: true }), 'draft');
  await expect(
    page.getByRole('link', { name: /Great Hall Discovery/u }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /MSL Open Day/u })).toHaveCount(
    0,
  );
  await selectOption(page.getByLabel('Lifecycle', { exact: true }), 'all');
  await expect(page.getByRole('link', { name: 'New event' })).toHaveCount(1);
  await expect(page.getByLabel('Schedule', { exact: true })).toBeVisible();
  await selectOption(page.getByLabel('Schedule', { exact: true }), 'upcoming');
  await expect(
    page.getByText('No events match', { exact: true }),
  ).toBeVisible();
  await selectOption(page.getByLabel('Schedule', { exact: true }), 'all');

  await eventSearch.fill('Great Hall');
  await openCatalogueRow(
    page.getByRole('row', { name: /Great Hall Discovery/u }),
  );
  await expect(page).toHaveURL(`/author/events/${EVENT_A}`);
  await expect(page.locator('.author-record-view')).toBeFocused();
  await expect(
    page.getByRole('heading', { level: 3, name: 'Great Hall Discovery' }),
  ).toBeVisible();
  await expect(page.getByLabel('Event title')).toHaveCount(0);
  await expect(page.getByText(/75 m radius/)).toBeVisible();

  await page.getByRole('link', { name: 'Edit event' }).click();
  await expect(page).toHaveURL(`/author/events/${EVENT_A}/edit`);
  await expect(page.getByLabel('Event title')).toHaveValue(
    'Great Hall Discovery',
  );
  await expect(
    page.locator('[data-map-provider^="deterministic-"]'),
  ).toBeVisible();
  await page.getByLabel('Event title').fill('Great Hall Discovery revised');

  await page.getByRole('link', { name: 'Events', exact: true }).first().click();
  const dirtyDialog = page.getByRole('dialog', {
    name: 'Discard unsaved changes?',
  });
  await expect(dirtyDialog).toBeVisible();
  await expect(
    dirtyDialog.getByRole('button', { name: 'Keep editing' }),
  ).toBeFocused();
  await dirtyDialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page).toHaveURL(`/author/events/${EVENT_A}/edit`);
  await expect(page.getByLabel('Event title')).toHaveValue(
    'Great Hall Discovery revised',
  );

  await page.evaluate(() => window.history.back());
  await expect(dirtyDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dirtyDialog).toBeHidden();
  await expect(page).toHaveURL(`/author/events/${EVENT_A}/edit`);

  await page.getByRole('button', { name: 'Save event' }).click();
  await expect(page.getByText('Event changes saved.')).toBeFocused();
  await expect(page).toHaveURL(`/author/events/${EVENT_A}`);

  await page.getByRole('link', { name: 'Events', exact: true }).first().click();
  await expect(eventSearch).toHaveValue('Great Hall');
  await page
    .getByRole('link', { name: /Great Hall Discovery revised/ })
    .click();

  const savedEvent = state.events.find((event) => event.eventId === EVENT_A)!;
  replaceById(
    state.events,
    {
      ...savedEvent,
      authoringStatus: 'approved',
      reviewedAt: '2026-08-29T09:00:00.000Z',
      reviewedBy: uuid('9', 2),
      submittedAt: '2026-08-29T08:00:00.000Z',
      submittedBy: uuid('9', 1),
      version: 2,
    },
    (event) => event.eventId,
  );
  await page.reload();

  await expect(page).toHaveURL(`/author/events/${EVENT_A}`);
  await expect(page.getByText('Multiple choice · draft')).toBeVisible();
  await page.getByRole('link', { name: 'Review', exact: true }).click();
  await expect(
    page.getByText('Published Common reward available'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Publish event package' }).click();
  const publicationError = page.getByText(
    'The server still requires one published challenge.',
  );
  await expect(publicationError).toBeVisible();
  await expect(
    page.getByRole('alert').filter({
      hasText: 'Publication requirements are not met',
    }),
  ).toBeFocused();
  const errorBox = await publicationError.boundingBox();
  const publishBox = await page
    .getByRole('button', { name: 'Publish event package' })
    .boundingBox();
  expect(errorBox).not.toBeNull();
  expect(publishBox).not.toBeNull();
  expect(Math.abs((errorBox?.y ?? 0) - (publishBox?.y ?? 0))).toBeLessThan(500);
  expect(consoleErrors).toEqual([
    'Failed to load resource: the server responded with a status of 422 (Unprocessable Entity)',
  ]);
  consoleErrors.length = 0;

  state.rejectEventPublication = false;
  await page.reload();
  await expect(page.getByText('Multiple choice · draft')).toBeVisible();
  await page.getByRole('button', { name: 'Publish event package' }).click();
  await expect(
    page.getByText(
      'Event published and available to the player API according to its active times.',
    ),
  ).toBeFocused();
  await page.getByRole('link', { name: 'Details', exact: true }).click();
  await expect(page).toHaveURL(`/author/events/${EVENT_A}/details`);
  await page.goBack();
  await expect(
    page.getByRole('link', { name: 'Review', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.goForward();
  await expect(
    page.getByRole('link', { name: 'Details', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Review', exact: true }).click();

  const retireButton = page.getByRole('button', { name: 'Retire event' });
  await retireButton.click();
  const retirementDialog = page.getByRole('dialog', {
    name: 'Retire Great Hall Discovery revised?',
  });
  await expect(
    retirementDialog.getByRole('button', { name: 'Keep event' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(retirementDialog).toBeHidden();
  await expect(retireButton).toBeFocused();
  await retireButton.click();
  await retirementDialog.getByRole('button', { name: 'Retire event' }).click();
  await expect(page.getByText('Event retired.')).toBeFocused();
  await expect(page.getByRole('link', { name: 'Edit event' })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test('mobile Event and Question routes use list to detail to editor views', async ({
  page,
}, testInfo) => {
  await installAuthorApi(page);
  const consoleErrors = monitorConsoleErrors(page);
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/author/events');

  const catalogue = page.getByRole('complementary', {
    name: 'Authored events',
  });
  const recordView = page.locator('.author-record-view');
  await expect(catalogue).toBeVisible();
  await expect(recordView).toBeHidden();
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Player' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Author navigation/ }),
  ).toHaveAttribute('aria-expanded', 'false');
  const listHeight = await documentHeight(page);

  await page.getByRole('link', { name: /Great Hall Discovery/u }).click();
  await expect(catalogue).toBeHidden();
  await expect(recordView).toBeVisible();
  await expect(recordView).toBeFocused();
  await expect(
    page.getByRole('link', { name: 'Events' }).first(),
  ).toBeVisible();
  const eventDetailHeight = await documentHeight(page);

  await page.getByRole('link', { name: 'Edit event' }).click();
  await expect(page.getByLabel('Event title')).toBeVisible();
  await expect(
    page.locator('[data-map-provider^="deterministic-"]'),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const existingEventEditorHeight = await documentHeight(page);
  await page.getByRole('link', { name: 'Event', exact: true }).click();
  await expect(page).toHaveURL(`/author/events/${EVENT_A}`);
  await expect(
    page.getByRole('link', { name: /Where is the Great Hall/u }),
  ).toBeVisible();
  await expect(page.getByLabel('Question prompt')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'New question' })).toBeVisible();

  await page.getByRole('link', { name: /Where is the Great Hall/u }).click();
  await expect(page.locator('.question-catalogue')).toBeHidden();
  await expect(page.locator('.question-record-view')).toBeFocused();
  await expect(
    page.getByRole('heading', { level: 5, name: 'Where is the Great Hall?' }),
  ).toBeVisible();
  const correctAnswer = page
    .locator('.question-answer-summary')
    .getByRole('listitem')
    .filter({ has: page.getByText('Correct', { exact: true }) });
  await expect(correctAnswer).toHaveCount(1);
  await expect(correctAnswer).toBeVisible();
  await expect(correctAnswer).toContainText('Answer 2');
  await page.getByRole('link', { name: 'Edit question' }).click();
  await page
    .getByLabel('Question prompt')
    .fill('Where is the Wits Great Hall?');
  await page.getByRole('link', { name: 'Question detail' }).click();
  const questionDirtyDialog = page.getByRole('dialog', {
    name: 'Discard unsaved changes?',
  });
  await expect(questionDirtyDialog).toContainText(
    'unsaved question draft changes',
  );
  await questionDirtyDialog
    .getByRole('button', { name: 'Keep editing' })
    .click();
  await page.getByRole('button', { name: 'Save question' }).click();
  await expect(page.getByText('Question changes saved.')).toBeFocused();
  await expect(
    page.getByRole('heading', {
      level: 5,
      name: 'Where is the Wits Great Hall?',
    }),
  ).toBeVisible();

  await page
    .locator('.question-record-view')
    .getByRole('link', { name: 'Questions' })
    .click();
  await page.getByRole('link', { name: 'New question' }).click();
  await expect(
    page.getByRole('heading', { name: 'New question' }),
  ).toBeVisible();
  await expect(page.locator('.question-catalogue')).toBeHidden();
  await page.getByLabel('Question prompt').fill('Unsaved question draft');
  const questionEditorHeight = await documentHeight(page);
  await expectNoHorizontalOverflow(page);

  await openAuthorNavigation(page);

  await page
    .getByRole('navigation', { name: 'Author sections' })
    .getByRole('link', { name: 'Events' })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    'unsaved question draft changes',
  );
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await page.getByRole('link', { name: 'New event' }).first().click();
  await expect(
    page.getByRole('heading', { level: 3, name: 'New event' }),
  ).toBeVisible();
  await expect(catalogue).toBeHidden();
  const eventEditorHeight = await documentHeight(page);
  expect(listHeight).toBeLessThan(eventEditorHeight);
  expect(eventDetailHeight).toBeLessThan(eventEditorHeight);

  await page.getByLabel('Event title').fill('Library Lawn Trail');
  await page.getByLabel('Description (optional)').fill('A new Author draft.');
  const automaticPlacement = page.getByRole('checkbox', {
    name: /Automatic placement/u,
  });
  await automaticPlacement.check();
  await expect(
    page.getByText(/Assign a campus site at publication/u),
  ).toBeVisible();
  await expect(page.getByText('Event location')).toHaveCount(0);
  await automaticPlacement.uncheck();
  await page.getByLabel('Latitude').fill('-26.1908');
  await page.getByLabel('Longitude').fill('28.0305');
  await page.getByLabel('Radius (metres)').fill('60');
  await enterEventDateTime(page, 'Starts at', '2026-09-01T10:00');
  await enterEventDateTime(page, 'Ends at', '2026-09-01T12:00');
  await page.getByRole('button', { name: 'Create draft event' }).click();
  await expect(page).toHaveURL(`/author/events/${EVENT_NEW}`);
  await expect(page.getByText('Draft event created.')).toBeFocused();
  await expect(
    page.getByRole('heading', { level: 3, name: 'Library Lawn Trail' }),
  ).toBeVisible();

  await testInfo.attach('mobile-author-page-heights.json', {
    body: JSON.stringify(
      {
        eventDetailHeight,
        eventEditorHeight,
        existingEventEditorHeight,
        listHeight,
        questionEditorHeight,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  expect(consoleErrors).toEqual([]);
});

test('ordering authoring and player reordering work at desktop and mobile widths', async ({
  page,
}, testInfo) => {
  const state = await installAuthorApi(page);
  const consoleErrors = monitorConsoleErrors(page);

  await page.setViewportSize({ height: 800, width: 1280 });
  state.challenges = [];
  state.questions = [];
  await page.goto(`/author/events/${EVENT_A}`);
  await selectOption(page.getByLabel('Format', { exact: true }), 'ordering');
  await page.getByRole('button', { name: 'Create challenge' }).click();
  await expect(
    page.getByText('Draft ordering challenge associated with this event.'),
  ).toBeFocused();
  await expect(page.getByText('Ordering · draft')).toBeVisible();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question prompt').fill('Order these campus eras.');
  await page.getByRole('button', { name: 'Create draft question' }).click();
  await expect(page.getByLabel('Correct position 1')).toBeFocused();
  const correctOrder = [
    'Founding',
    'Expansion',
    'Transformation',
    'Present day',
  ];
  for (const [index, value] of correctOrder.entries()) {
    await page.getByLabel(`Correct position ${index + 1}`).fill(value);
  }
  await page
    .getByLabel('Author explanation')
    .fill('The sequence follows the documented campus chronology.');
  await page.getByRole('button', { name: 'Create draft question' }).click();
  await expect(page.getByText('Draft question created.')).toBeFocused();
  await expect(
    page.getByRole('heading', { name: 'Correct order', exact: true }),
  ).toBeVisible();
  const authoredItems = page
    .locator('.question-answer-summary')
    .getByRole('listitem');
  await expect(authoredItems).toHaveText(correctOrder);
  await expectNoHorizontalOverflow(page);
  await attachScreenshot(testInfo, page, 'ordering-author-desktop.png');

  await page.setViewportSize({ height: 844, width: 390 });
  await expect(
    page.getByRole('heading', { name: 'Correct order', exact: true }),
  ).toBeVisible();
  await expect(authoredItems).toHaveText(correctOrder);
  await expectNoHorizontalOverflow(page);
  await page.goto(`/challenge-attempts/${ORDERING_ATTEMPT}`);
  const currentOrder = page.getByRole('list', { name: 'Current order' });
  await expect(currentOrder).toBeVisible();
  const moveDown = currentOrder.getByRole('button', {
    name: 'Move Campus era 3 down from position 1',
  });
  await moveDown.focus();
  await page.keyboard.press('Enter');
  await expect(currentOrder.locator('.challenge-ordering__text')).toHaveText([
    'Campus era 1',
    'Campus era 3',
    'Campus era 4',
    'Campus era 2',
  ]);
  await expect(
    page.getByRole('status').filter({ hasText: 'Current order:' }),
  ).toContainText('Campus era 3 moved to position 2 of 4.');

  const firstHandle = currentOrder
    .getByRole('listitem')
    .first()
    .locator('.challenge-ordering__drag-handle');
  const thirdItem = currentOrder.getByRole('listitem').nth(2);
  const handleBox = await firstHandle.boundingBox();
  const targetBox = await thirdItem.boundingBox();
  expect(handleBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(
    (handleBox?.x ?? 0) + (handleBox?.width ?? 0) / 2,
    (handleBox?.y ?? 0) + (handleBox?.height ?? 0) / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    (targetBox?.x ?? 0) + (targetBox?.width ?? 0) / 2,
    (targetBox?.y ?? 0) + (targetBox?.height ?? 0) / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(currentOrder.locator('.challenge-ordering__text')).toHaveText([
    'Campus era 3',
    'Campus era 1',
    'Campus era 4',
    'Campus era 2',
  ]);
  await expectNoHorizontalOverflow(page);
  await attachScreenshot(testInfo, page, 'ordering-player-mobile.png');

  await page.getByRole('button', { name: 'Submit order' }).click();
  await expect(
    page.getByRole('heading', { name: 'Ordering question 2' }),
  ).toBeFocused();
  expect(state.orderingSubmissions).toEqual([
    {
      attemptQuestionId: orderingQuestionId(1),
      format: 'ordering',
      itemIds: [3, 1, 4, 2].map((item) => orderingItemId(1, item)),
    },
  ]);

  state.orderingCompleted = true;
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Your challenge result' }),
  ).toBeFocused();
  const resultScore = page.locator('.challenge-result__score');
  await expect(resultScore.getByText('3', { exact: true })).toBeVisible();
  await expect(
    resultScore.getByText('out of 5 correct', { exact: true }),
  ).toBeVisible();
  const firstAnswerReview = page.locator('.challenge-review__heading').first();
  await firstAnswerReview.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Ordering explanation 1.')).toBeVisible();
  await expect(page.getByText('Correct order').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await attachScreenshot(testInfo, page, 'ordering-result-mobile.png');

  await page.setViewportSize({ height: 800, width: 1280 });
  await expect(
    page.getByRole('heading', { name: 'Your challenge result' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await attachScreenshot(testInfo, page, 'ordering-result-desktop.png');
  expect(consoleErrors).toEqual([]);
});

test.describe('desktop campaign workspace', () => {
  test.use({ timezoneId: 'America/New_York' });

  test('campaign catalogue, editor, content picker and record tabs stay focused', async ({
    page,
  }, info) => {
    const state = await installAuthorApi(page);
    const errors = monitorConsoleErrors(page);

    const capture = async (name: string, width: number) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await captureScreenshot(test.info(), page, {
        path: `author/campaign-${name}-${width}.png`,
        fullPage: true,
      });
      await expectNoHorizontalOverflow(page);
    };
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/author/campaigns');
      await expect(
        page.getByRole('heading', { name: 'Campaigns' }),
      ).toBeVisible();
      await capture('catalogue', width);
      await page.getByRole('link', { name: 'New campaign' }).click();
      await expect(
        page.getByRole('heading', { name: 'New campaign' }),
      ).toBeVisible();
      await expect(
        page.getByRole('complementary', { name: 'Campaign catalogue' }),
      ).toHaveCount(0);
      await capture('new', width);

      await page.getByRole('button', { name: 'Create draft campaign' }).click();
      await expect(page.getByLabel('Campaign title')).toBeFocused();
      await page.getByLabel('Campaign title').fill(`Open Day ${width}`);
      await enterEventDateTime(page, 'Starts at', '2026-09-10T08:00');
      await enterEventDateTime(page, 'Ends at', '2026-09-10T17:00');
      const add = page.getByRole('button', { name: 'Add content' });
      await add.click();
      const picker = page.getByRole('dialog', { name: 'Add content' });
      await expect(
        page.getByRole('button', { name: 'Close content picker' }),
      ).toBeFocused();
      await expect(
        page.getByRole('checkbox', { name: /MSL Open Day/ }),
      ).toBeVisible();
      await expect(
        page.getByRole('checkbox', { name: /Great Hall Discovery/ }),
      ).toHaveCount(0);
      await selectOption(picker.getByLabel('Lifecycle'), 'all');
      await page
        .getByRole('checkbox', { name: /Great Hall Discovery/ })
        .check();
      // Escape dismisses only the nested menu before dismissing the picker.
      const lifecycle = picker.getByLabel('Lifecycle');
      const menu = page.getByRole('listbox');
      await lifecycle.click();
      await expect(menu).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      // The portaled menu restores focus on the next animation frame.
      await expect(lifecycle).toBeFocused();
      await expect(picker).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(picker).toBeHidden();
      await expect(add).toBeFocused();
      await expect(page.getByText('No content added.')).toBeVisible();
      await add.click();
      await page.getByRole('checkbox', { name: /MSL Open Day/ }).check();
      const trails = page.getByRole('tab', { name: /Trails/ });
      await trails.focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: /Events/ })).toBeFocused();
      await trails.click();
      await page
        .getByRole('checkbox', { name: /Campus orientation trail/ })
        .check();
      await page.getByRole('tab', { name: /Events/ }).click();
      await expect(
        page.getByRole('checkbox', { name: /MSL Open Day/ }),
      ).toBeChecked();
      await capture('picker', width);
      await page.getByRole('button', { name: 'Apply selection' }).focus();
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('button', { name: 'Close content picker' }),
      ).toBeFocused();
      await page.getByRole('button', { name: 'Apply selection' }).click();
      await expect(add).toBeFocused();
      await expect(
        page.getByRole('button', { name: 'Remove event: MSL Open Day' }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Remove trail: Campus orientation trail' })
        .click();
      await expect(
        page.getByRole('button', { name: /Remove trail/ }),
      ).toHaveCount(0);
      await capture('filled', width);
      await page.getByRole('button', { name: 'Create draft campaign' }).click();
      await expect(page.getByText('Campaign draft created.')).toBeFocused();
      const saved = state.campaigns[0]!;
      expect(saved.startsAt).toBe('2026-09-10T06:00:00.000Z');
      expect(saved.endsAt).toBe('2026-09-10T15:00:00.000Z');
      expect(saved.events.map((event) => event.eventId)).toEqual([EVENT_B]);
      await capture('details', width);
      await page.getByRole('link', { name: 'Review', exact: true }).click();
      await expect(page).toHaveURL(
        `/author/campaigns/${saved.campaignId}/review`,
      );
      await expect(
        page.getByRole('button', { name: 'Submit for review' }),
      ).toBeVisible();
      await capture('review', width);
      await page.getByRole('link', { name: 'History', exact: true }).click();
      await expect(
        page.getByText('Approve: in review to approved'),
      ).toBeVisible();
      await capture('history', width);
      await page.getByRole('link', { name: 'Edit campaign' }).click();
      await expect(page.getByLabel('Campaign title')).toHaveValue(
        `Open Day ${width}`,
      );
      await capture('edit', width);
      await page.getByLabel('Campaign title').fill(`Open Day revised ${width}`);
      await page.getByRole('button', { name: 'Save campaign' }).click();
      await expect(page.getByText('Campaign changes saved.')).toBeFocused();
      expect(
        state.campaigns.find((item) => item.campaignId === saved.campaignId)
          ?.version,
      ).toBe(1);
      const current = state.campaigns.find(
        (item) => item.campaignId === saved.campaignId,
      )!;
      current.status = 'approved';
      await page.goto(`/author/campaigns/${saved.campaignId}/edit`);
      await expect(
        page.getByText('This campaign is no longer editable.'),
      ).toBeVisible();
      await expect(page.getByLabel('Campaign title')).toHaveCount(0);
      await capture('unavailable', width);
    }
    expect(errors).toEqual([]);
    await info.attach('campaign-desktop-evidence', {
      body: 'Captured catalogue, new, picker, filled, detail, review, history and edit at 1280, 1440 and 1920px.',
      contentType: 'text/plain',
    });
  });
});

test('Review and campaign workspaces preserve lifecycle, keyboard and responsive states', async ({
  page,
}) => {
  const state = await installAuthorApi(page);
  const consoleErrors = monitorConsoleErrors(page);
  state.questions[0] = {
    ...state.questions[0]!,
    status: 'in_review',
    submittedAt: '2026-08-29T08:00:00.000Z',
    submittedBy: uuid('9', 2),
    version: 2,
  };

  await page.setViewportSize({ height: 800, width: 1280 });
  await page.goto('/author/review');
  await expect(
    page.getByRole('heading', { name: 'Content review' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: 'Review question: Where is the Great Hall?',
    }),
  ).toHaveAttribute(
    'href',
    `/author/events/${EVENT_A}/challenges/${CHALLENGE_A}/questions/${QUESTION_A}`,
  );
  await expect(page.getByText('In review', { exact: true })).toHaveCount(0);
  await page
    .getByRole('link', { name: 'Review question: Where is the Great Hall?' })
    .click();
  await page.getByRole('button', { name: 'Approve question' }).click();
  await expect(page.getByText('Approved.')).toBeFocused();
  const questionDetail = page.getByRole('article', {
    name: 'Where is the Great Hall?',
  });
  await questionDetail.getByText('Review history').click();
  await expect(
    questionDetail.getByText('Approve: in review to approved'),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await openAuthorNavigation(page);
  await page.getByRole('link', { name: 'Campaigns' }).click();
  await expect(page.getByRole('heading', { name: 'Campaigns' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Orientation Week/u }),
  ).toBeVisible();
  await openCatalogueRow(page.getByRole('row', { name: /Orientation Week/u }));
  await expect(
    page.getByRole('heading', { name: 'Orientation Week' }),
  ).toBeVisible();
  await expect(
    page.getByText('1 event · 1 trail', { exact: false }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto('/author/campaigns/new');
  await expect(
    page.getByRole('heading', { name: 'New campaign' }),
  ).toBeVisible();
  await page.getByLabel('Campaign title').fill('Open Day Schedule');
  await enterEventDateTime(page, 'Starts at', '2026-09-10T08:00');
  await enterEventDateTime(page, 'Ends at', '2026-09-10T17:00');
  await page.getByRole('button', { name: 'Add content' }).click();
  await page.getByRole('checkbox', { name: /MSL Open Day/u }).check();
  await page.getByRole('button', { name: 'Apply selection' }).click();
  await page.getByRole('button', { name: 'Create draft campaign' }).click();
  await expect(page.getByText('Campaign draft created.')).toBeFocused();
  await expect(
    page.getByRole('heading', { name: 'Open Day Schedule' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Review', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Submit for review' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(consoleErrors).toEqual([]);
});

for (const viewport of [
  { height: 800, width: 1280 },
  { height: 900, width: 1440 },
  { height: 1261, width: 1694 },
]) {
  test(`desktop event authoring has focused pages at ${viewport.width}px`, async ({
    page,
  }) => {
    const state = await installAuthorApi(page);
    const consoleErrors = monitorConsoleErrors(page);
    await page.setViewportSize(viewport);
    // Long real-content patterns exercise both wrapping and catalogue density.
    state.events[0]!.title = 'Ordering Wits: Science and Discovery';
    state.questions[0]!.prompt =
      'Arrange Wits timeline set 16 (1962–1968) from earliest to latest.';

    const capture = async (name: string) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await captureScreenshot(test.info(), page, {
        path: `author/${name}-${viewport.width}.png`,
        fullPage: true,
      });
    };
    await page.goto('/author/events');
    await expect(
      page.getByRole('table', { name: 'Authored events', exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture('catalogue');
    await page.getByRole('link', { name: /Ordering Wits/ }).click();
    await expect(
      page.getByRole('complementary', { name: 'Authored events' }),
    ).toHaveCount(0);
    const questions = page.getByRole('table', {
      name: 'Questions',
      exact: true,
    });
    await expect(questions).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Question workspace detail' }),
    ).toBeHidden();
    await expect(
      page.getByText('Select a question', { exact: true }),
    ).toHaveCount(0);
    const widths = await questions.evaluate((table) => ({
      table: table.getBoundingClientRect().width,
      workspace: document
        .querySelector('.author-console__workspace')!
        .getBoundingClientRect().width,
    }));
    expect(widths.table / widths.workspace).toBeGreaterThan(0.95);
    await expectNoHorizontalOverflow(page);
    await capture('questions');
    await page.getByRole('link', { name: /Arrange Wits timeline/ }).click();
    await expect(
      page.getByRole('complementary', { name: 'Challenge questions' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: /Arrange Wits timeline/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Next', exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page
      .getByRole('link', { name: 'Edit question', exact: true })
      .click();
    await expect(page.getByLabel('Question prompt')).toBeVisible();
    await capture('question-editor');
    await page.getByLabel('Question prompt').fill('Unsaved question change');
    await page.getByRole('link', { name: 'Next', exact: true }).click();
    const guard = page.getByRole('dialog', {
      name: 'Discard unsaved changes?',
    });
    await expect(guard).toBeVisible();
    await guard.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.getByLabel('Question prompt')).toHaveValue(
      'Unsaved question change',
    );
    await page
      .getByRole('button', { name: 'Save question', exact: true })
      .click();
    await expect(page.getByText('Question changes saved.')).toBeFocused();
    await page.getByRole('link', { name: 'Details', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Event details', exact: true }),
    ).toBeVisible();
    await capture('details');
    await page.getByRole('link', { name: 'Review', exact: true }).click();
    await expect(
      page.getByText('Published Common reward available'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Submit event and questions' }),
    ).toBeEnabled();
    await expectNoHorizontalOverflow(page);
    await capture('review');
    await page.reload();
    await expect(
      page.getByRole('link', { name: 'Review', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'History', exact: true }).click();
    await expect(
      page.getByText('Review history', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Approve: in review to approved'),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(consoleErrors).toEqual([]);
  });
}

test('Question workspace preserves focused mobile and tablet navigation', async ({
  page,
}, testInfo) => {
  await installAuthorApi(page);
  const consoleErrors = monitorConsoleErrors(page);

  for (const viewport of [
    { height: 844, width: 390 },
    { height: 1024, width: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(
      `/author/events/${EVENT_A}/challenges/${CHALLENGE_A}/questions`,
    );

    const catalogue = page.getByRole('complementary', {
      name: 'Challenge questions',
    });
    const detail = page.getByRole('region', {
      name: 'Question workspace detail',
    });
    await expect(catalogue).toBeVisible();
    await expect(detail).toBeHidden();

    await page.getByRole('link', { name: /Where is the Great Hall/u }).click();
    await expect(catalogue).toBeHidden();
    await expect(detail).toBeVisible();
    await expect(
      detail.getByRole('heading', { name: 'Where is the Great Hall?' }),
    ).toBeVisible();
    const metadataColumnCount = await page
      .locator('.question-detail .author-metadata > div')
      .first()
      .evaluate(
        (row) => getComputedStyle(row).gridTemplateColumns.split(' ').length,
      );
    expect(metadataColumnCount).toBe(viewport.width === 390 ? 1 : 2);
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(test.info(), page, {
      path: testInfo.outputPath(`question-detail-${viewport.width}.png`),
      fullPage: true,
    });
  }

  expect(consoleErrors).toEqual([]);
});

test('Event location authoring is map-first and synchronized at responsive widths', async ({
  page,
}) => {
  await installAuthorApi(page);
  const consoleErrors = monitorConsoleErrors(page);

  for (const viewport of [
    { height: 844, width: 390 },
    { height: 1024, width: 768 },
    { height: 800, width: 1280 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/author/events/new');

    const map = page.getByRole('region', {
      name: /Event location map for Wits Braamfontein/u,
    });
    const latitude = page.getByLabel('Latitude');
    const longitude = page.getByLabel('Longitude');
    const radiusInput = page.getByLabel('Radius (metres)');
    await expect(map).toBeVisible();
    await expect(map).toHaveAttribute(
      'data-map-initial-bounds',
      '28.0185,-26.195,28.034,-26.1845',
    );
    await expect(page.getByText('Choose a location')).toBeVisible();
    await expect(latitude).toHaveValue('');
    await expect(longitude).toHaveValue('');
    await expect(map.locator('[data-event-marker-id]')).toHaveCount(0);

    if (viewport.width === 390) {
      await openAuthorNavigation(page);
      await page
        .getByRole('navigation', { name: 'Author sections' })
        .getByRole('link', { name: 'Events' })
        .click();
      await expect(page).toHaveURL('/author/events');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.goto('/author/events/new');
      await expect(map).toBeVisible();
    }

    const mapBox = await map.boundingBox();
    expect(mapBox).not.toBeNull();
    await map.click({
      position: {
        x: Math.round((mapBox?.width ?? 1) * 0.62),
        y: Math.round((mapBox?.height ?? 1) * 0.46),
      },
    });
    await expect(latitude).not.toHaveValue('');
    await expect(longitude).not.toHaveValue('');
    const firstLatitude = await latitude.inputValue();
    const firstLongitude = await longitude.inputValue();
    const marker = map.locator(
      '[data-event-marker-id="author-event-position"]',
    );
    await expect(marker).toBeVisible();
    await expect(marker).toHaveAttribute('data-marker-draggable', 'true');

    await map.click({
      position: {
        x: Math.round((mapBox?.width ?? 1) * 0.38),
        y: Math.round((mapBox?.height ?? 1) * 0.58),
      },
    });
    await expect
      .poll(async () => ({
        latitude: await latitude.inputValue(),
        longitude: await longitude.inputValue(),
      }))
      .not.toEqual({
        latitude: firstLatitude,
        longitude: firstLongitude,
      });

    await page.getByRole('button', { name: '75 m' }).click();
    const visualRadius = map.locator('[data-deterministic-event-radius]');
    await expect(radiusInput).toHaveValue('75');
    await expect(visualRadius).toBeVisible();
    await expect(visualRadius).toHaveAttribute('data-radius-metres', '75');
    const presetRadiusBox = await visualRadius.boundingBox();
    await radiusInput.fill('83');
    await expect(visualRadius).toHaveAttribute('data-radius-metres', '83');
    const exactRadiusBox = await visualRadius.boundingBox();
    expect(exactRadiusBox?.width ?? 0).toBeGreaterThan(
      presetRadiusBox?.width ?? Number.POSITIVE_INFINITY,
    );
    await expect(page.getByText(/83 m event area shown/u)).toBeVisible();

    await latitude.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('-26.191111');
    await longitude.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('28.031111');
    await expect(map).toHaveAttribute(
      'data-map-selected-coordinate',
      '28.031111,-26.191111',
    );
    await expectNoHorizontalOverflow(page);

    await openAuthorNavigation(page);

    await page
      .getByRole('navigation', { name: 'Author sections' })
      .getByRole('link', { name: 'Events' })
      .click();
    const dirtyDialog = page.getByRole('dialog', {
      name: 'Discard unsaved changes?',
    });
    await expect(dirtyDialog).toContainText('unsaved event draft changes');
    await dirtyDialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(latitude).toHaveValue('-26.191111');
    await openAuthorNavigation(page);
    await page
      .getByRole('navigation', { name: 'Author sections' })
      .getByRole('link', { name: 'Events' })
      .click();
    await dirtyDialog.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page).toHaveURL('/author/events');
  }

  expect(consoleErrors).toEqual([]);
});

test('existing Event location focuses its saved point, supports dragging, and has a map-failure fallback', async ({
  page,
}) => {
  const state = await installAuthorApi(page);
  const consoleErrors = monitorConsoleErrors(page);
  await page.setViewportSize({ height: 800, width: 1280 });
  const savedEvent = state.events.find((event) => event.eventId === EVENT_A)!;

  await page.goto(`/author/events/${EVENT_A}/edit`);
  const map = page.getByRole('region', {
    name: /Event location map for Wits Braamfontein/u,
  });
  await expect(map).toHaveAttribute(
    'data-map-camera-center',
    `${savedEvent.longitude},${savedEvent.latitude}`,
  );
  await expect(map).not.toHaveAttribute('data-map-initial-bounds');
  await expect(map).toHaveAttribute(
    'data-map-selected-coordinate',
    `${savedEvent.longitude},${savedEvent.latitude}`,
  );
  await expect(
    map.locator('[data-deterministic-event-radius]'),
  ).toHaveAttribute('data-radius-metres', String(savedEvent.radiusMetres));

  const marker = map.locator('[data-event-marker-id="author-event-position"]');
  await marker.scrollIntoViewIfNeeded();
  const markerBox = await marker.boundingBox();
  const mapBox = await map.boundingBox();
  expect(markerBox).not.toBeNull();
  expect(mapBox).not.toBeNull();
  await page.mouse.move(
    (markerBox?.x ?? 0) + (markerBox?.width ?? 0) / 2,
    (markerBox?.y ?? 0) + (markerBox?.height ?? 0) / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    (mapBox?.x ?? 0) + (mapBox?.width ?? 0) * 0.68,
    (mapBox?.y ?? 0) + (mapBox?.height ?? 0) * 0.54,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(page.getByLabel('Latitude')).not.toHaveValue(
    String(savedEvent.latitude),
  );
  await expect(page.getByLabel('Longitude')).not.toHaveValue(
    String(savedEvent.longitude),
  );
  await expectNoHorizontalOverflow(page);

  await page.getByRole('link', { name: 'Event', exact: true }).click();
  const dirtyDialog = page.getByRole('dialog', {
    name: 'Discard unsaved changes?',
  });
  await dirtyDialog.getByRole('button', { name: 'Discard changes' }).click();
  await page.goto('/author/events/new?map-failure=1');
  await expect(page.getByText('The map could not load.')).toBeVisible();
  await expect(
    page.getByText(
      'Use the advanced latitude and longitude fields below to place the event.',
    ),
  ).toBeVisible();
  await page.getByLabel('Latitude').fill('-26.19205');
  await page.getByLabel('Longitude').fill('28.03038');
  await page.getByLabel('Radius (metres)').fill('60');
  await expect(page.getByLabel('Latitude')).toHaveValue('-26.19205');
  await expect(page.getByLabel('Longitude')).toHaveValue('28.03038');
  await expectNoHorizontalOverflow(page);
  expect(consoleErrors).toEqual([]);
});

for (const width of [1280, 1440, 1556, 1920]) {
  test(`desktop Player review preserves queue context and focused decisions at ${width}px`, async ({
    page,
  }) => {
    const caseId = uuid('a', 1);
    const detail = trustCaseFixture(caseId);
    const api = await installTrustReviewApi(page, detail);
    const consoleErrors = monitorConsoleErrors(page);
    await page.setViewportSize({ height: 950, width });
    const capture = async (kind: string) => {
      if (
        process.env.PLAYER_REVIEW_CAPTURE &&
        process.env.PLAYER_REVIEW_CAPTURE !== kind
      )
        return;
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await captureScreenshot(test.info(), page, {
        fullPage: true,
        path: `author/player-review-${kind}-${width}.png`,
      });
    };
    await page.goto('/author/player-review');
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByText('Select a case to begin review.')).toHaveCount(
      0,
    );
    await expectNoHorizontalOverflow(page);

    await capture('queue');

    await page.getByRole('searchbox', { name: 'Search cases' }).fill('Casey');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Page 2 of 2')).toBeVisible();
    const open = page.getByRole('link', {
      name: `Review ${detail.playerName}, case ${caseId}`,
      exact: true,
    });
    await open.scrollIntoViewIfNeeded();
    const queueScroll = await page.evaluate(() => window.scrollY);
    expect(queueScroll).toBeGreaterThan(0);
    await open.click();
    await expect(page).toHaveURL(`/author/player-review/${caseId}`);
    await expect(
      page.getByRole('heading', { name: detail.playerName }),
    ).toBeFocused();
    await expect(page.getByLabel('Trust case queue')).toHaveCount(0);
    await expect(
      page.getByText('Review priority is not proof of misconduct.'),
    ).toBeVisible();
    const signals = page.getByRole('region', { name: 'Signals' });
    await expect(signals.getByText('Impossible movement')).toBeVisible();
    await expect(signals.getByText('High severity')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture('case');

    const reason = page.getByRole('textbox', { name: /Reason and context/u });
    await reason.fill(
      'Consider the retained evidence before making a decision.',
    );
    await page.getByRole('tab', { name: 'Review', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(
      page.getByRole('tab', { name: /Restrictions/u }),
    ).toBeFocused();
    await expect(
      page.getByRole('region', { name: 'Restriction history' }),
    ).toBeVisible();
    await expect(
      page.getByText('1 active restriction', { exact: true }),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture('restrictions');
    await page.getByRole('tab', { name: /Restrictions/u }).focus();
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'History' })).toBeFocused();
    await expect(
      page.getByRole('region', { name: 'Decision and audit history' }),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture('history');
    await page.getByRole('link', { name: uuid('b', 1).slice(0, 8) }).click();
    await expect(
      page.getByRole('tab', { name: 'Review', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(`#signal-${uuid('b', 1)}`)).toHaveAttribute(
      'open',
      '',
    );
    await expect(reason).toHaveValue(
      'Consider the retained evidence before making a decision.',
    );
    await signals.getByText('Opponent concentration', { exact: true }).click();
    await signals.getByText('View aggregate basis').click();
    await expect(signals.getByText(/87.5%/u)).toBeVisible();
    await expect(signals.getByText(/policy threshold/iu)).toHaveCount(0);
    await page.getByText('Score breakdown').click();
    await expect(page.getByText('Server final').locator('..')).toContainText(
      '79',
    );
    await expectNoHorizontalOverflow(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture('evidence');

    await page.getByLabel('Apply temporary restriction').check();
    await page.getByLabel('Require online verification').check();
    await selectOption(page.getByLabel('Duration', { exact: true }), '72');
    await capture('decision-options');
    await page.getByRole('button', { name: 'Review restriction' }).click();
    const dialog = page.getByRole('dialog', {
      name: `Apply temporary restrictions to ${detail.playerName}?`,
    });
    await expect(
      dialog.getByRole('heading', { name: 'Current state' }),
    ).toBeVisible();
    await expect(
      dialog.getByText('Pause new competitive matches'),
    ).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'Proposed restriction' }),
    ).toBeVisible();
    await expect(dialog.getByText('Require online verification')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Go back' })).toBeFocused();
    expect(api.decisions).toHaveLength(0);
    await capture('confirmation');
    await expect(dialog.getByRole('button', { name: 'Go back' })).toBeFocused();
    const skipLinkBottom = await page
      .locator('.skip-link')
      .evaluate((element) => element.getBoundingClientRect().bottom);
    expect(skipLinkBottom).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Review restriction' }),
    ).toBeFocused();
    await page.getByRole('link', { name: 'Back to case queue' }).click();
    await expect(open).toBeFocused();
    await expect(
      page.getByRole('searchbox', { name: 'Search cases' }),
    ).toHaveValue('Casey');
    await expect(page.getByText('Page 2 of 2')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(queueScroll, 0);
    await page.goBack();
    await expect(
      page.getByRole('heading', { name: detail.playerName }),
    ).toBeFocused();
    await page.goForward();
    await expect(page.getByText('Page 2 of 2')).toBeVisible();
    await expect(open).toBeFocused();

    // Remove the last page while the reviewer is investigating; the returning
    // queue must fetch the last valid page and use heading focus if the row left.
    await open.click();
    await expect(
      page.getByRole('heading', { name: detail.playerName }),
    ).toBeVisible();
    api.queue.totalItems = 20;
    await page.getByLabel('Dismiss case').check();
    await page
      .getByRole('textbox', { name: /Reason and context/u })
      .fill('Evidence does not support further review.');
    await page
      .getByRole('button', { name: 'Record decision', exact: true })
      .click();
    await expect(
      page.getByText('Decision recorded in the audit history.'),
    ).toBeVisible();
    expect(api.decisions).toHaveLength(1);
    await expect(
      page.getByText('Decision controls are unavailable.'),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Back to case queue' }).click();
    await expect(page.getByText('20 matching cases')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Player review', exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Next', exact: true }),
    ).toHaveCount(0);

    await page
      .getByRole('searchbox', { name: 'Search cases' })
      .fill('No matching player');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('No cases match these filters.')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture('empty');
    await page.locator('.trust-review__advanced-filters > summary').click();
    await selectOption(
      page.getByLabel('Signal type', { exact: true }),
      'impossible_movement',
    );
    await expect(page.getByLabel('1 active filter')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture('filters');
    await page.locator('.trust-review__advanced-filters > summary').click();
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(
      page.getByRole('searchbox', { name: 'Search cases' }),
    ).toHaveValue('');
    expect(consoleErrors).toEqual([]);
  });
}

test('desktop Player review opens paged audit references and explains unavailable retained signals', async ({
  page,
}) => {
  const caseId = uuid('a', 1);
  const detail = trustCaseFixture(caseId);
  const api = await installTrustReviewApi(page, detail, {
    pagedEvidence: true,
  });
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto(`/author/player-review/${caseId}`);
  await expect(
    page.getByRole('heading', { name: detail.playerName }),
  ).toBeVisible();
  await expect(
    page.getByText('Opponent concentration', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('link', { name: uuid('b', 2).slice(0, 8) }).click();
  const referenced = page.locator(`#signal-${uuid('b', 2)}`);
  await expect(referenced).toHaveAttribute('open', '');
  await expect(referenced.locator(':scope > summary')).toBeFocused();
  await expect(
    page.getByRole('tab', { name: 'Review', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await captureScreenshot(test.info(), page, {
    fullPage: true,
    path: 'author/player-review-audit-reference-1440.png',
  });
  api.queue.missingReference = true;
  await page.reload();
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('link', { name: uuid('b', 99).slice(0, 8) }).click();
  await expect(
    page.getByText(
      'The referenced signal was not found in the retained evidence.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry reference' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Record decision' }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await captureScreenshot(test.info(), page, {
    fullPage: true,
    path: 'author/player-review-missing-reference-1440.png',
  });
  await page.getByRole('button', { name: 'Retry reference' }).click();
  await expect(
    page.getByText(
      'The referenced signal was not found in the retained evidence.',
    ),
  ).toBeVisible();
  expect(api.decisions).toHaveLength(0);
});

test('Card editor previews unsaved artwork and metadata beside the form on desktop', async ({
  page,
}) => {
  await installAuthorApi(page);
  await page.setViewportSize({ height: 900, width: 1715 });
  await page.goto('/author/cards/new');
  const preview = page.getByRole('complementary', {
    name: 'Live card preview',
  });
  await expect(preview).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Card definitions' }),
  ).toBeHidden();
  await page.getByLabel('Card name').fill('Library Fox');
  await selectOption(page.locator('#card-rarity'), 'legendary');
  await page.getByLabel('Hit points (HP)').fill('120');
  await page.getByLabel('Starting Power').fill('25');
  await page.getByLabel('Artwork URL (optional)').fill('/cards/quillip.webp');
  const image = preview.getByAltText('Library Fox artwork preview');
  await expect(image).toBeVisible();
  await expect(preview.locator('.card-frame--legendary')).toBeVisible();
  await expect(
    preview.getByRole('heading', { name: 'Library Fox' }),
  ).toBeVisible();
  await expect(preview.getByText('120', { exact: true })).toBeVisible();
  await expect(preview.getByText('25', { exact: true })).toBeVisible();

  for (const width of [1715, 1280]) {
    await page.setViewportSize({ height: 900, width });
    const fieldsBox = await page
      .locator('.author-card-editor__fields')
      .boundingBox();
    const previewBox = await preview.boundingBox();
    expect(fieldsBox).not.toBeNull();
    expect(previewBox).not.toBeNull();
    expect(previewBox!.x).toBeGreaterThan(fieldsBox!.x + fieldsBox!.width);
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(test.info(), page, {
      path: `visual/author-card-preview/desktop-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByLabel('Artwork URL (optional)')
    .fill('/cards/missing-preview.webp');
  await expect(
    preview.getByText('Image could not load. Check the URL.'),
  ).toBeVisible();
  await page.getByLabel('Artwork URL (optional)').fill('/cards/quillip.webp');
  await expect(image).toBeVisible();
  await page.getByLabel('Move name').fill('Quiet Step');
  await page.getByRole('button', { name: 'Add move', exact: true }).click();
  await expect(page.locator('#move-1-name')).toBeVisible();
  await expect(page.locator('#move-0-name')).toBeHidden();
  await page.getByRole('button', { name: /^Quiet Step / }).click();
  await page.getByRole('button', { name: 'Create draft card' }).click();
  await expect(page.locator('#move-1-name')).toBeFocused();
  await expect(page.locator('#move-1-name')).toBeVisible();
  await expect(page.locator('#move-0-name')).toBeHidden();
  await selectOption(page.locator('#card-category'), 'power');
  await expect(preview.getByText('Power · Typeless')).toBeVisible();
  await expect(preview.getByLabel('Preview creature attributes')).toHaveCount(
    0,
  );
});

test('Card catalogue and dedicated detail pages preserve filtering, review and lifecycle actions', async ({
  page,
}, testInfo) => {
  const state = await installAuthorApi(page);
  state.cards.push(
    {
      ...materializeCard(
        {
          affinity: 'spark',
          category: 'creature',
          description: Array.from(
            { length: 12 },
            () =>
              'This published definition carries detailed authoring context about its campus history, reward role, visual treatment, and intended player experience.',
          ).join(' '),
          effects: [],
          hp: 190,
          imageUrl: null,
          moves: [1, 2, 3, 4].map((position) =>
            moveInput(
              position,
              `Extended Great Hall archive technique ${position} with a descriptive tactical name`,
            ),
          ),
          name: 'Great Hall Archive Chronicler',
          power: 35,
          rarity: 'legendary',
        },
        CARD_TALL_CREATURE,
      ),
      authoringStatus: 'published',
      isActive: true,
    },
    {
      ...materializeCard(
        {
          affinity: 'spirit',
          category: 'creature',
          description: 'A retired four-move creature definition.',
          effects: [],
          hp: 160,
          imageUrl: null,
          moves: [1, 2, 3, 4].map((position) =>
            moveInput(position, `Legacy move ${position}`),
          ),
          name: 'Retired Four Move Ibex',
          power: 25,
          rarity: 'epic',
        },
        CARD_RETIRED_CREATURE,
      ),
      authoringStatus: 'retired',
      isActive: false,
    },
    ...Array.from({ length: 30 }, (_, index) => ({
      ...materializeCard(
        {
          affinity: 'mystic' as const,
          category: 'power' as const,
          description: 'A retired catalogue definition used to prove density.',
          effects: [
            {
              effectType: 'heal' as const,
              effectValue: 10,
              modifierDurationTurns: null,
              modifierOperation: null,
              modifierStat: null,
              position: 1,
            },
          ],
          hp: null,
          imageUrl: null,
          moves: [],
          name:
            index === 0
              ? 'A Deliberately Long Card Name for the Great Hall Archive Catalogue'
              : `Catalogue specimen ${String(index + 1).padStart(2, '0')}`,
          power: null,
          rarity: 'epic' as const,
        },
        uuid('5', 100 + index),
      ),
      authoringStatus: 'retired' as const,
      isActive: false,
    })),
  );
  const consoleErrors = monitorConsoleErrors(page);
  await page.setViewportSize({ height: 800, width: 1280 });
  await page.goto('/author/cards');

  await expect(
    page.getByRole('heading', { name: 'Card catalogue' }),
  ).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Search' });
  await search.fill('owl');
  await expect(page.getByRole('link', { name: /Campus Owl/u })).toBeVisible();
  await expect(page.getByRole('link', { name: /Four Move Ibex/u })).toHaveCount(
    0,
  );
  await search.fill('');
  await page.locator('.author-filter-menu > summary').click();
  await selectOption(
    page.getByLabel('Lifecycle', { exact: true }),
    'published',
  );
  await selectOption(page.getByLabel('Category', { exact: true }), 'creature');
  await selectOption(page.getByLabel('Affinity', { exact: true }), 'grit');
  await selectOption(page.getByLabel('Rarity', { exact: true }), 'rare');
  await page.locator('.author-filter-menu > summary').click();
  await expect(
    page.getByRole('link', { name: /Four Move Ibex/u }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Campus Owl/u })).toHaveCount(0);

  await openCatalogueRow(page.getByRole('row', { name: /^Four Move Ibex/u }));
  await expect(page).toHaveURL(`/author/cards/${CARD_CREATURE}`);
  await expect(page.locator('.author-record-view')).toBeFocused();
  await expect(
    page.locator('.author-card-detail__layout .collectible-card'),
  ).toBeVisible();
  await expect(page.getByText('Move 1')).toBeVisible();
  await expect(page.getByText('Move 4')).toBeVisible();
  await expect(page.getByLabel('Card name')).toHaveCount(0);
  const desktopPublishedCreatureHeight = await documentHeight(page);

  await page.goto(`/author/cards/${CARD_TALL_CREATURE}`);
  const finalTallMove = page.getByText(
    'Extended Great Hall archive technique 4 with a descriptive tactical name',
  );
  await expect(finalTallMove).toBeAttached();
  expect(await documentHeight(page)).toBeGreaterThan(800);
  await finalTallMove.scrollIntoViewIfNeeded();
  await expect(finalTallMove).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await page.getByRole('link', { name: 'Card catalogue' }).click();
  await page.locator('.author-filter-menu > summary').click();
  await selectOption(page.getByLabel('Category', { exact: true }), 'power');
  await selectOption(page.getByLabel('Affinity', { exact: true }), 'wit');
  await selectOption(page.getByLabel('Rarity', { exact: true }), 'common');
  await page.locator('.author-filter-menu > summary').click();
  await page.getByRole('link', { name: /Archive Insight/u }).click();
  await expect(page).toHaveURL(`/author/cards/${CARD_POWER}`);
  await expect(page.getByText('Restore 30 HP')).toBeVisible();
  await expect(page.locator('.collectible-card')).not.toContainText(
    'Restore 30 HP',
  );
  await expect(page.getByLabel('Effect type')).toHaveCount(0);

  await page.getByRole('link', { name: 'Card catalogue' }).click();
  await selectOption(page.getByLabel('Lifecycle', { exact: true }), 'draft');
  await page.locator('.author-filter-menu > summary').click();
  await selectOption(page.getByLabel('Category', { exact: true }), 'creature');
  await selectOption(page.getByLabel('Affinity', { exact: true }), 'wit');
  await selectOption(page.getByLabel('Rarity', { exact: true }), 'common');
  await page.locator('.author-filter-menu > summary').click();
  await page.getByRole('link', { name: /Campus Owl/u }).click();
  await page.getByRole('link', { name: 'Edit card' }).click();
  await page.getByLabel('Card name').fill('Campus Owl revised');
  await expect(
    page.getByRole('complementary', { name: 'Card definitions' }),
  ).toBeHidden();
  await page.getByRole('link', { name: 'Cards', exact: true }).first().click();
  const dirtyDialog = page.getByRole('dialog', {
    name: 'Discard unsaved changes?',
  });
  await expect(dirtyDialog).toContainText('unsaved card draft changes');
  await dirtyDialog.getByRole('button', { name: 'Discard changes' }).click();
  const cardCatalogue = page.getByRole('complementary', {
    name: 'Card definitions',
  });
  await selectOption(
    cardCatalogue.getByLabel('Lifecycle', { exact: true }),
    'all',
  );
  await cardCatalogue.locator('.author-filter-menu > summary').click();
  await selectOption(
    cardCatalogue.getByLabel('Category', { exact: true }),
    'all',
  );
  await selectOption(
    cardCatalogue.getByLabel('Affinity', { exact: true }),
    'all',
  );
  await selectOption(
    cardCatalogue.getByLabel('Rarity', { exact: true }),
    'all',
  );
  await cardCatalogue.locator('.author-filter-menu > summary').click();
  await page.getByRole('link', { name: /^Four Move Ibex/u }).click();
  await expect(page.getByLabel('Card name')).toHaveCount(0);
  await expect(page.locator('.collectible-card')).toBeVisible();

  await page.getByRole('link', { name: 'Card catalogue' }).click();
  await page.getByRole('link', { name: 'New card' }).first().click();
  await selectOption(
    page.locator('.author-form').getByLabel('Category', { exact: true }),
    'power',
  );
  await expect(page.getByLabel('Move name')).toHaveCount(0);
  await expect(page.getByLabel('Effect type')).toBeVisible();
  await page.getByLabel('Card name').fill('New Insight');
  await page.getByRole('button', { name: 'Create draft card' }).click();
  await expect(page.getByText('Draft card created.')).toBeFocused();
  await expect(page.getByLabel('Card name')).toHaveCount(0);
  const submitCard = page.getByRole('button', { name: 'Submit for review' });
  await submitCard.click();
  const lifecycleNotice = page.getByText(
    'Card submitted for independent review.',
  );
  await expect(lifecycleNotice).toBeFocused();
  const noticeBox = await lifecycleNotice.boundingBox();
  const lifecycleDecisionsBox = await page
    .locator('.author-card-detail__decisions')
    .boundingBox();
  expect(noticeBox).not.toBeNull();
  expect(lifecycleDecisionsBox).not.toBeNull();
  expect((noticeBox?.y ?? 0) - (lifecycleDecisionsBox?.y ?? 0)).toBeLessThan(
    150,
  );

  await page.setViewportSize({ height: 1024, width: 768 });
  await page.goto(`/author/cards/${CARD_CREATURE}`);
  await expect(page.locator('.collectible-card')).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Card definitions' }),
  ).toBeHidden();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(`/author/cards/${CARD_CREATURE}`);
  await expect(page.locator('.collectible-card')).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Card definitions' }),
  ).toBeHidden();
  await expectNoHorizontalOverflow(page);
  const mobilePublishedCreatureHeight = await documentHeight(page);

  await page.goto(`/author/cards/${CARD_DRAFT}/edit`);
  await expect(page.getByLabel('Card name')).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Card definitions' }),
  ).toBeHidden();
  await expectNoHorizontalOverflow(page);
  const creatureEditorHeight = await documentHeight(page);

  await page.setViewportSize({ height: 1000, width: 1600 });
  await page.goto('/author/cards');
  await expect(
    page.getByRole('table', { name: 'Card definitions' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Card workspace detail' }),
  ).toBeHidden();
  await expect(
    page.getByRole('link', { name: /A Deliberately Long Card Name/ }),
  ).toBeVisible();

  await captureScreenshot(test.info(), page, {
    path: 'visual/author-cards-redesign/catalogue-1600.png',
    fullPage: true,
  });
  const deepLinkedCardId = uuid('5', 128);
  await page.getByRole('link', { name: /Catalogue specimen 29/u }).click();
  await expect(page).toHaveURL(`/author/cards/${deepLinkedCardId}`);
  await expect(
    page.getByRole('complementary', { name: 'Card definitions' }),
  ).toBeHidden();
  await expect(
    page.getByRole('heading', { level: 3, name: 'Catalogue specimen 29' }),
  ).toBeVisible();
  await page.goto(`/author/cards/${CARD_CREATURE}`);
  await expect(
    page.getByRole('heading', { level: 3, name: 'Four Move Ibex' }),
  ).toBeVisible();
  await expect(
    page.locator('.author-card-detail__layout .collectible-card'),
  ).toBeVisible();
  await captureScreenshot(test.info(), page, {
    path: 'visual/author-cards-redesign/detail-1600.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Review', exact: true }).click();
  await expect(page).toHaveURL(`/author/cards/${CARD_CREATURE}/review`);
  await expect(page.getByRole('region', { name: 'Card review' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Review', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Card review' })).toBeVisible();
  await expect(page.locator('.author-history')).not.toHaveAttribute('open');
  await page.getByText('Review history', { exact: true }).click();
  await expect(page.locator('.author-history')).toHaveAttribute('open', '');
  await expect(page.getByText('Approve: in review to approved')).toBeVisible();
  await captureScreenshot(test.info(), page, {
    path: 'visual/author-cards-redesign/review-1600.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Details', exact: true }).click();
  await expect(page.getByText('Move 4', { exact: true })).toBeVisible();
  await page.goto(`/author/cards/${CARD_RETIRED_CREATURE}`);
  await expect(page.getByText('Legacy move 4')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retire card' })).toHaveCount(
    0,
  );

  await testInfo.attach('mobile-card-page-heights.json', {
    body: JSON.stringify(
      {
        creatureEditorHeight,
        desktopPublishedCreatureHeight,
        mobilePublishedCreatureHeight,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  expect(consoleErrors).toEqual([]);
});

test('tablet and wide workspaces preserve loading, error, empty and deep-link states', async ({
  page,
}) => {
  const state = await installAuthorApi(page);
  const consoleErrors = monitorConsoleErrors(page);
  await page.setViewportSize({ height: 1024, width: 768 });
  state.eventDelayMs = 3000;
  await page.goto('/author/events');
  await expect(page.getByText('Loading events…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New event' })).toBeDisabled();
  await expect(
    page.getByRole('link', { name: /Great Hall Discovery/u }),
  ).toBeVisible();

  state.failEvents = true;
  await page.reload();
  await expect(page.getByText('Events are unavailable.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New event' })).toBeDisabled();
  state.failEvents = false;
  state.eventDelayMs = 0;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('link', { name: /Great Hall Discovery/u }),
  ).toBeVisible();
  expect(consoleErrors).toEqual([
    'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
  ]);
  consoleErrors.length = 0;

  state.events.splice(0, state.events.length);
  await page.reload();
  await expect(page.getByText('No authored events yet')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'New event' }).first(),
  ).toBeEnabled();

  state.events.push(...authorEvents());
  await page.setViewportSize({ height: 900, width: 1600 });
  await page.goto(`/author/cards/${CARD_CREATURE}`);
  await expect(
    page.getByRole('complementary', { name: 'Card definitions' }),
  ).toBeHidden();
  await expect(
    page.locator('.author-card-detail__layout .collectible-card'),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(`/author/cards/${CARD_CREATURE}`);
  await expect(
    page.getByRole('heading', { level: 3, name: 'Four Move Ibex' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test('placement workspace stages preview, campus map, and secondary details across viewports', async ({
  page,
}, testInfo) => {
  const authorState = await installAuthorApi(page);
  const consoleErrors = monitorConsoleErrors(page);

  await page.route('**/api/v1/author/event-placement', async (route) => {
    await json(route, { ...placementStateFixture(), overrides: [] });
  });

  await page.setViewportSize({ height: 1000, width: 1440 });
  await page.goto('/author/placement');
  await expect(
    page.getByRole('heading', { name: 'Event placement' }),
  ).toBeVisible();
  const desktopMapSurface = (await page
    .locator('.placement-map .campus-map')
    .boundingBox())!;
  const desktopPreview = (await page
    .getByRole('complementary', {
      name: 'Preview and validate placement changes',
    })
    .boundingBox())!;
  expect(Math.abs(desktopMapSurface.y - desktopPreview.y)).toBeLessThanOrEqual(
    1,
  );
  await expect(
    page.getByRole('button', { name: 'Reset map bearing and pitch' }),
  ).toBeHidden();
  await expect(
    page.getByRole('table', { name: 'Current event placements' }),
  ).toBeVisible();
  await expect(page.getByRole('table', { name: 'Coverage zones' })).toHaveCount(
    0,
  );
  await page.getByRole('tab', { name: 'Coverage & sites' }).click();
  await expect(
    page.getByRole('table', { name: 'Coverage zones' }),
  ).toBeVisible();
  const coverageTable = page.getByRole('table', { name: 'Coverage zones' });
  const coverageLayout = await coverageTable.evaluate((table) => {
    const container = table.closest('.placement-table-scroll')!;
    return {
      containerHeight: container.getBoundingClientRect().height,
      containerWidth: container.clientWidth,
      scrollWidth: container.scrollWidth,
      tableHeight: table.getBoundingClientRect().height,
    };
  });
  expect(coverageLayout.scrollWidth).toBeLessThanOrEqual(
    coverageLayout.containerWidth + 1,
  );
  expect(coverageLayout.containerHeight).toBeLessThanOrEqual(
    coverageLayout.tableHeight + 1,
  );
  await captureScreenshot(test.info(), page, {
    path: testInfo.outputPath('placement-coverage-desktop.png'),
    fullPage: true,
  });
  const placementRules = page.locator('.placement-policy-disclosure > summary');
  await expect(
    page.getByText('Minimum separation', { exact: true }),
  ).toBeHidden();
  await placementRules.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Minimum separation', { exact: true }),
  ).toBeVisible();
  await captureScreenshot(test.info(), page, {
    path: testInfo.outputPath('placement-rules-open-desktop.png'),
    fullPage: true,
  });
  const planDetails = page.locator('.placement-technical-details > summary');
  await expect(page.getByText('State version', { exact: true })).toBeHidden();
  await planDetails.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('State version', { exact: true })).toBeVisible();
  await captureScreenshot(test.info(), page, {
    path: testInfo.outputPath('placement-plan-details-open-desktop.png'),
    fullPage: true,
  });
  await page.keyboard.press('Enter');
  await expect(page.getByText('State version', { exact: true })).toBeHidden();
  await placementRules.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Minimum separation', { exact: true }),
  ).toBeHidden();
  await page.getByRole('tab', { name: 'Manual controls' }).click();
  const overridesHeading = (await page
    .getByRole('heading', { name: 'Active overrides' })
    .boundingBox())!;
  const overridesMessage = (await page
    .getByText('No active pauses, pins, or site exclusions.', { exact: true })
    .boundingBox())!;
  expect(
    overridesMessage.y - overridesHeading.y - overridesHeading.height,
  ).toBeLessThanOrEqual(16);
  await captureScreenshot(test.info(), page, {
    path: testInfo.outputPath('placement-manual-empty-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('tab', { name: 'Changes' }).click();
  await captureScreenshot(test.info(), page, {
    path: testInfo.outputPath('placement-current-desktop.png'),
    fullPage: true,
  });
  await expectNoHorizontalOverflow(page);

  const preview = page.getByRole('button', {
    name: 'Create preview',
  });
  authorState.placementPreviewDelayMs = 800;
  await preview.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.placement-preview__loader')).toHaveCount(2);
  await captureScreenshot(test.info(), page, {
    path: testInfo.outputPath('placement-loading.png'),
    fullPage: true,
  });
  await expect(page.getByText('Review exceptions')).toBeVisible();
  await expect(page.getByText('Plan needs review')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Review and apply' }),
  ).toBeFocused();
  const policyDetails = page.getByText(/^\d+ placement issues$/u);
  await expect(policyDetails).toBeVisible();
  await policyDetails.click();
  const blockedSites = page.getByRole('list', {
    name: 'Blocked candidate sites',
  });
  await expect(blockedSites.getByText('William Cullen Library')).toBeVisible();
  await expect(
    blockedSites.getByText('Within 150 m of Great Hall.'),
  ).toBeVisible();
  await policyDetails.click();
  await captureScreenshot(test.info(), page, {
    path: testInfo.outputPath('placement-desktop.png'),
    fullPage: true,
  });
  const placementDetails = page.getByRole('region', {
    name: 'Placement details',
  });
  await placementDetails.scrollIntoViewIfNeeded();
  const scrolledPreview = (await page
    .getByRole('complementary', {
      name: 'Preview and validate placement changes',
    })
    .boundingBox())!;
  const scrolledDetails = (await placementDetails.boundingBox())!;
  expect(scrolledPreview.y + scrolledPreview.height).toBeLessThanOrEqual(
    scrolledDetails.y + 1,
  );

  await page.setViewportSize({ height: 900, width: 768 });
  await page.reload();
  const tabletRail = (await page
    .getByRole('complementary', {
      name: 'Preview and validate placement changes',
    })
    .boundingBox())!;
  const tabletMap = (await page
    .getByRole('region', { name: /Author event-placement map/u })
    .boundingBox())!;
  const tabletDetails = (await page
    .getByRole('region', { name: 'Placement details' })
    .boundingBox())!;
  expect(tabletRail.y).toBeLessThan(tabletMap.y);
  expect(tabletMap.y).toBeLessThan(tabletDetails.y);
  await expectNoHorizontalOverflow(page);
  await captureScreenshot(test.info(), page, {
    path: testInfo.outputPath('placement-tablet.png'),
    fullPage: true,
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Event placement' }),
  ).toBeVisible();
  const controls = (await page
    .getByRole('complementary', {
      name: 'Preview and validate placement changes',
    })
    .boundingBox())!;
  const map = (await page
    .getByRole('region', { name: /Author event-placement map/u })
    .boundingBox())!;
  const details = (await page
    .getByRole('region', { name: 'Placement details' })
    .boundingBox())!;
  expect(controls.y).toBeLessThan(map.y);
  expect(map.y).toBeLessThan(details.y);
  await expect(
    page.getByRole('button', { name: 'Create preview' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create preview' }).click();
  await expect(page.getByText('Plan needs review')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Review and apply' }),
  ).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await captureScreenshot(test.info(), page, {
    path: testInfo.outputPath('placement-mobile.png'),
    fullPage: true,
  });
  expect(consoleErrors).toEqual([]);
});

test('event schedule picker preserves campus time with keyboard and calendar input', async ({
  browser,
}) => {
  const context = await browser.newContext({ timezoneId: 'America/New_York' });
  const page = await context.newPage();
  try {
    await installAuthorApi(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const width of [1280, 1440, 1694]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/author/events/${EVENT_A}/edit`);
      await enterEventDateTime(page, 'Starts at', '2026-09-01T16:26');
      const field = page.getByRole('group', { name: 'Starts at', exact: true });
      const trigger = page.getByRole('button', {
        name: 'Choose starts at date',
      });
      await trigger.click();
      const calendar = page.getByRole('dialog');
      await expect(calendar.getByRole('heading')).toHaveText('September 2026');
      await expect(calendar).toContainText('Johannesburg · UTC+02:00');

      await captureScreenshot(test.info(), page, {
        path: `author/event-date-picker-${width}.png`,
      });
      await page.keyboard.press('Escape');
      await expect(calendar).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await calendar
        .getByRole('button', { name: 'Next month', exact: true })
        .click();
      await expect(calendar.getByRole('heading')).toHaveText('October 2026');
      await calendar
        .getByRole('button', { name: 'Previous month', exact: true })
        .click();
      await calendar
        .getByRole('button', {
          name: /Wednesday.*2 September 2026/u,
          exact: false,
        })
        .first()
        .click();
      await expect(calendar).toBeHidden();
      await expect(
        field.getByRole('spinbutton', { name: /^hour,/u }),
      ).toHaveAttribute('aria-valuenow', '16');
      await expect(
        field.getByRole('spinbutton', { name: /^minute,/u }),
      ).toHaveAttribute('aria-valuenow', '26');
      await enterEventDateTime(page, 'Ends at', '2026-09-03T18:00');
      const save = page.waitForRequest(
        (request) =>
          request.method() === 'PUT' &&
          request.url().endsWith(`/author/events/${EVENT_A}`),
      );
      await page.getByRole('button', { name: 'Save event' }).click();
      expect((await save).postDataJSON()).toMatchObject({
        startsAt: '2026-09-02T14:26:00.000Z',
        endsAt: '2026-09-03T16:00:00.000Z',
      });
      await expect(page.getByText('Event changes saved.')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('author save controls follow Active times in the form', async ({
  page,
}) => {
  await installAuthorApi(page);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/author/events/new');
    const bar = page.locator('.author-save-bar');
    await expect(bar).toContainText('New draft · not saved');
    await expect(bar).toHaveCSS('position', 'static');
    await bar.scrollIntoViewIfNeeded();
    const section = (await page
      .getByRole('group', { name: 'Active times' })
      .boundingBox())!;
    const controls = (await bar.boundingBox())!;
    expect(controls.y - section.y - section.height).toBeGreaterThanOrEqual(0);
    expect(controls.y - section.y - section.height).toBeLessThanOrEqual(32);
    await expect(
      bar.getByRole('button', { name: 'Create draft event' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test('author save state remains visible through edits, saving, failure and recovery', async ({
  page,
}, info) => {
  await installAuthorApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/author/events/${EVENT_A}/edit`);
  const saveBar = page.locator('.author-save-bar');
  await expect(saveBar).toContainText('No unsaved changes');
  await page.getByLabel('Event title').fill('');
  await page.getByRole('button', { name: 'Save event' }).click();
  await expect(page.getByLabel('Event title')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await captureScreenshot(test.info(), page, {
    path: info.outputPath('validation.png'),
    fullPage: true,
  });
  await page.getByLabel('Event title').fill('Updated campus event');
  await expect(saveBar).toContainText('Unsaved changes');
  const endpoint = `**/author/events/${EVENT_A}`;
  let releaseSave: () => void = () => {};
  const pendingSave = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route(endpoint, async (route) => {
    await pendingSave;
    await problem(route, 500, 'INTERNAL_ERROR', 'Please retry this save.');
  });
  await page.getByRole('button', { name: 'Save event' }).click();
  await expect(saveBar).toContainText('Saving changes…');
  await expect(
    saveBar.getByRole('button', { name: 'Saving event draft…' }),
  ).toBeDisabled();
  releaseSave();
  await expect(saveBar).toContainText('Not saved. Review the errors above.');
  await expect(page.getByLabel('Event title')).toHaveValue(
    'Updated campus event',
  );
  await captureScreenshot(test.info(), page, {
    path: info.outputPath('save-failure.png'),
    fullPage: true,
  });
  await page.unroute(endpoint);
  await page.getByRole('button', { name: 'Save event' }).click();
  await expect(page.getByText('Event changes saved.')).toBeFocused();
  await captureScreenshot(test.info(), page, {
    path: info.outputPath('save-success.png'),
    fullPage: true,
  });
  await expectNoHorizontalOverflow(page);
});

interface AuthorApiState {
  campaigns: AuthorCampaign[];
  cards: AuthorCard[];
  challenges: AuthorChallenge[];
  eventDelayMs: number;
  events: AuthorEvent[];
  failEvents: boolean;
  orderingCompleted: boolean;
  orderingSubmissions: unknown[];
  placementPreviewDelayMs: number;
  questions: AuthorQuestion[];
  rejectEventPublication: boolean;
  trails: AuthorTrail[];
}

async function installTrustReviewApi(
  page: Page,
  detail: ReturnType<typeof trustCaseFixture>,
  { pagedEvidence = false }: { pagedEvidence?: boolean } = {},
) {
  const queue = { totalItems: 40, missingReference: false };
  const decisions: unknown[] = [];
  let version: number = detail.version;
  let resolved = false;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') {
      await json(route, {
        connectionStrategy: 'auth0',
        id: uuid('9', 1),
        lifecycleStatus: 'active',
        playerName: 'author-e2e',
        playerNameSetupRequired: false,
        requestId: 'request-current-player',
        role: 'author',
      });
      return;
    }
    if (path === '/author/cards' && method === 'GET') {
      await json(route, { cards: [], requestId: 'request-cards' });
      return;
    }
    if (path === '/events' && method === 'GET') {
      await json(route, { events: [], requestId: 'request-offline-events' });
      return;
    }
    if (path === '/author/trust-cases' && method === 'GET') {
      const url = new URL(request.url());
      const pageNumber = Number(url.searchParams.get('page') ?? 1);
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const items = Array.from({ length: queue.totalItems }, (_, index) => ({
        ...detail,
        caseId: index === 39 ? detail.caseId : uuid('a', index + 2),
        playerName:
          index === 39
            ? detail.playerName
            : `Casey Reviewer ${String(index + 1).padStart(2, '0')}`,
        canReview: index % 5 !== 0,
        signalTypes: ['impossible_movement', 'opponent_concentration'],
      })).filter((item) => item.playerName.toLowerCase().includes(search));
      await json(route, {
        items: items.slice((pageNumber - 1) * 20, pageNumber * 20),
        page: pageNumber,
        pageSize: 20,
        requestId: 'request-trust-cases',
        totalItems: items.length,
        totalPages: Math.ceil(items.length / 20),
      });
      return;
    }
    if (
      path === `/author/trust-cases/${detail.caseId}/decisions` &&
      method === 'POST'
    ) {
      const decision = request.postDataJSON();
      decisions.push(decision);
      resolved = decision.action === 'dismiss';
      version += 1;
      await json(route, {
        case: {
          ...detail,
          version,
          status: resolved ? 'resolved' : detail.status,
          canReview: !resolved && detail.canReview,
        },
        requestId: 'request-trust-decision',
      });
      return;
    }
    if (path === `/author/trust-cases/${detail.caseId}` && method === 'GET') {
      await json(route, {
        case: {
          ...detail,
          version,
          status: resolved ? 'resolved' : detail.status,
          canReview: !resolved && detail.canReview,
        },
        requestId: 'request-trust-case',
      });
      return;
    }
    if (
      path === `/author/trust-cases/${detail.caseId}/evidence` &&
      method === 'GET'
    ) {
      await json(route, {
        items: pagedEvidence
          ? [
              detail.evidence[
                Number(new URL(request.url()).searchParams.get('page') ?? 1) - 1
              ],
            ]
          : detail.evidence,
        page: pagedEvidence
          ? Number(new URL(request.url()).searchParams.get('page') ?? 1)
          : 1,
        pageSize: 20,
        requestId: 'request-trust-evidence',
        totalItems: detail.evidenceTotalItems,
        totalPages: pagedEvidence ? 2 : 1,
      });
      return;
    }
    if (
      path === `/author/trust-cases/${detail.caseId}/restrictions` &&
      method === 'GET'
    ) {
      await json(route, {
        items: detail.restrictionPreview,
        page: 1,
        pageSize: 20,
        requestId: 'request-trust-restrictions',
        totalItems: detail.restrictionTotalItems,
        totalPages: 1,
      });
      return;
    }
    if (
      path === `/author/trust-cases/${detail.caseId}/history` &&
      method === 'GET'
    ) {
      await json(route, {
        items: pagedEvidence
          ? detail.history.map((item) => ({
              ...item,
              evidenceIds: [uuid('b', queue.missingReference ? 99 : 2)],
            }))
          : detail.history,
        page: 1,
        pageSize: 20,
        requestId: 'request-trust-history',
        totalItems: detail.history.length,
        totalPages: 1,
      });
      return;
    }
    await json(
      route,
      {
        code: 'NOT_FOUND',
        detail: 'Not found',
        requestId: 'request-missing',
        status: 404,
        title: 'Not found',
        type: 'about:blank',
      },
      404,
    );
  });
  return { queue, decisions };
}

function trustCaseFixture(caseId: string) {
  return {
    activeRestrictionCount: 1,
    activeRestrictionScopes: ['new_competitive_match_hold'],
    band: 'urgent_review',
    canReview: true,
    caseId,
    categoryTotals: {
      movement: 50,
      opponentPatterns: 20,
      submissionConflicts: 9,
    },
    evidence: [
      {
        basePoints: 25,
        decayState: 'active',
        effectivePoints: 21,
        evidenceId: uuid('b', 1),
        expiresAt: '2026-12-24T09:00:00.000Z',
        observedAt: '2026-09-25T09:00:00.000Z',
        opponentPattern: null,
        policyVersion: 'trust-v1',
        reviewedFalsePositive: false,
        safeSourceType: 'movement_decision',
        severity: 'high',
        signalType: 'impossible_movement',
        state: 'active',
      },
      {
        basePoints: 20,
        decayState: 'active',
        effectivePoints: 20,
        evidenceId: uuid('b', 2),
        expiresAt: '2026-12-24T09:00:00.000Z',
        observedAt: '2026-09-25T08:00:00.000Z',
        opponentPattern: {
          availability: 'available',
          completedMatchCount: 8,
          evaluationWindowEnd: '2026-09-25T08:00:00.000Z',
          evaluationWindowStart: '2026-09-18T08:00:00.000Z',
          kind: 'opponent_concentration',
          opponentConcentrationRatio: 0.875,
          repeatedOpponentMatchCount: 7,
        },
        policyVersion: 'trust-v1',
        reviewedFalsePositive: false,
        safeSourceType: 'opponent_pattern_evaluation',
        severity: 'medium',
        signalType: 'opponent_concentration',
        state: 'active',
      },
    ],
    evidencePreview: [],
    evidenceTotalItems: 2,
    evidenceTruncated: false,
    history: [
      {
        action: 'case_opened',
        actorPlayerId: null,
        actorPlayerName: null,
        actorType: 'system',
        caseVersionAfter: 1,
        caseVersionBefore: 0,
        decisionId: uuid('c', 1),
        decisionType: 'case_opened',
        evidenceIds: [uuid('b', 1)],
        falsePositiveEvidenceIds: [],
        occurredAt: '2026-09-25T09:00:00.000Z',
        policyVersion: 'trust-v1',
        previousStatus: null,
        reasonCode: 'review_band_reached',
        reasonNote: null,
        restrictions: [],
        resultingStatus: 'open',
        versionAfter: 1,
        versionBefore: 0,
      },
    ],
    historyTruncated: false,
    latestRestrictionExpiry: '2026-09-28T09:00:00.000Z',
    openedAt: '2026-09-25T09:00:00.000Z',
    playerId: uuid('d', 1),
    playerName: 'Casey Reviewer',
    policyVersion: 'trust-v1',
    recentHistory: [],
    resolvedAt: null,
    resolutionReason: null,
    restrictionCount: 1,
    restrictionPreview: [
      {
        active: true,
        appealStatus: 'eligible',
        decisionId: uuid('c', 2),
        effectiveExpiresAt: '2026-09-28T09:00:00.000Z',
        originalExpiresAt: '2026-09-28T09:00:00.000Z',
        restrictionId: uuid('f', 1),
        scope: 'new_competitive_match_hold',
        startsAt: '2026-09-25T09:00:00.000Z',
      },
    ],
    restrictionTotalItems: 1,
    restrictionsTruncated: false,
    score: 79,
    scoreExplanation: {
      evaluatedAt: '2026-09-25T09:00:00.000Z',
      finalScore: 79,
      movementPoints: 50,
      opponentPatternPoints: 20,
      reviewBand: 'urgent_review',
      snapshotId: uuid('e', 1),
      sourceSignalCount: 4,
      submissionConflictPoints: 9,
    },
    status: 'open',
    sourceSignalCount: 4,
    updatedAt: '2026-09-25T09:00:00.000Z',
    version: 3,
  } as const;
}

async function installAuthorApi(page: Page): Promise<AuthorApiState> {
  const state: AuthorApiState = {
    campaigns: authorCampaigns(),
    cards: authorCards(),
    challenges: authorChallenges(),
    eventDelayMs: 0,
    events: authorEvents(),
    failEvents: false,
    orderingCompleted: false,
    orderingSubmissions: [],
    placementPreviewDelayMs: 0,
    questions: authorQuestions(),
    rejectEventPublication: true,
    trails: authorTrails(),
  };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');

    if (path === '/events' && method === 'GET') {
      await json(route, { events: [], requestId: 'request-player-events' });
      return;
    }

    if (path === '/auth/me') {
      await json(route, {
        connectionStrategy: 'auth0',
        id: uuid('9', 1),
        lifecycleStatus: 'active',
        playerName: 'author-e2e',
        playerNameSetupRequired: false,
        requestId: 'request-current-player',
        role: 'author',
      });
      return;
    }

    if (path === '/author/event-placement' && method === 'GET') {
      await json(route, placementStateFixture());
      return;
    }
    if (path === '/author/event-placement/history' && method === 'GET') {
      await json(route, {
        plans: [
          {
            assignmentCount: 2,
            createdAt: '2026-09-24T02:00:00.000Z',
            failureCode: null,
            planId: uuid('4', 2),
            policyVersion: 'placement-v1',
            rotationBucket: '2026-09-24',
            status: 'applied',
            trigger: 'scheduled',
          },
        ],
        requestId: 'request-placement-history',
      });
      return;
    }
    if (path === '/author/event-placement/previews' && method === 'POST') {
      if (state.placementPreviewDelayMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, state.placementPreviewDelayMs),
        );
      }
      await json(route, {
        plan: placementPlanFixture(),
        requestId: 'request-placement-preview',
      });
      return;
    }

    if (
      path === `/challenge-attempts/${ORDERING_ATTEMPT}` &&
      method === 'GET'
    ) {
      await json(
        route,
        state.orderingCompleted
          ? completedOrderingAttempt()
          : activeOrderingAttempt(),
      );
      return;
    }
    if (
      path === `/challenge-attempts/${ORDERING_ATTEMPT}/answers` &&
      method === 'POST'
    ) {
      state.orderingSubmissions.push(request.postDataJSON());
      await json(route, activeOrderingAttempt(1));
      return;
    }

    if (path === '/author/review-queue' && method === 'GET') {
      const submittedByName = (id: string) =>
        id === uuid('9', 1) ? 'author-e2e' : 'Review submitter';
      const metadata = (record: {
        submittedAt: string | null;
        submittedBy: string | null;
        version: number;
      }) => ({
        canReview: record.submittedBy !== uuid('9', 1),
        status: 'in_review' as const,
        submittedAt: record.submittedAt!,
        submittedBy: record.submittedBy!,
        submittedByName: submittedByName(record.submittedBy!),
        version: record.version,
      });
      const items: AuthorReviewQueueItem[] = [
        ...state.events
          .filter((event) => event.authoringStatus === 'in_review')
          .map((event) => ({
            ...metadata(event),
            entityType: 'event' as const,
            entityId: event.eventId,
            label: event.title,
            eventId: null,
            challengeId: null,
          })),
        ...state.challenges
          .filter((challenge) => challenge.status === 'in_review')
          .map((challenge) => ({
            ...metadata(challenge),
            entityType: 'challenge' as const,
            entityId: challenge.challengeId,
            label: 'Multiple-choice challenge',
            eventId: challenge.eventId,
            challengeId: null,
          })),
        ...state.questions
          .filter((question) => question.status === 'in_review')
          .map((question) => ({
            ...metadata(question),
            entityType: 'question' as const,
            entityId: question.questionId,
            label: question.prompt,
            eventId:
              state.challenges.find(
                (challenge) => challenge.challengeId === question.challengeId,
              )?.eventId ?? null,
            challengeId: question.challengeId,
          })),
        ...state.campaigns
          .filter((campaign) => campaign.status === 'in_review')
          .map((campaign) => ({
            ...metadata(campaign),
            entityType: 'campaign' as const,
            entityId: campaign.campaignId,
            label: campaign.title,
            eventId: null,
            challengeId: null,
          })),
        ...state.cards
          .filter((card) => card.authoringStatus === 'in_review')
          .map((card) => ({
            ...metadata(card),
            entityType: 'card' as const,
            entityId: card.id,
            label: card.name,
            eventId: null,
            challengeId: null,
          })),
      ];
      const query = new URL(request.url()).searchParams;
      const filtered = items.filter(
        (item) =>
          !query.get('entityType') ||
          item.entityType === query.get('entityType'),
      );
      const queuePage = Number(query.get('page') ?? 1);
      const pageSize = Number(query.get('pageSize') ?? 10);
      await json(route, {
        items: filtered.slice((queuePage - 1) * pageSize, queuePage * pageSize),
        page: queuePage,
        pageSize,
        requestId: 'request-review-queue',
        totalItems: filtered.length,
        totalPages: Math.ceil(filtered.length / pageSize),
      });
      return;
    }

    const historyMatch = path.match(
      /^\/author\/content\/([^/]+)\/([^/]+)\/history$/u,
    );
    if (historyMatch && method === 'GET') {
      await json(route, {
        items: [
          {
            action: 'approve',
            actorPlayerId: uuid('9', 1),
            actorPlayerName: 'author-e2e',
            auditId: uuid('8', 10),
            fromStatus: 'in_review',
            note: null,
            occurredAt: '2026-08-29T09:00:00.000Z',
            resultingVersion: 3,
            toStatus: 'approved',
          },
        ],
        page: 1,
        pageSize: 10,
        requestId: 'request-history',
        totalItems: 1,
        totalPages: 1,
      });
      return;
    }

    if (path === '/author/campaigns' && method === 'GET') {
      await json(route, {
        campaigns: state.campaigns,
        requestId: 'request-campaigns',
      });
      return;
    }
    if (path === '/author/campaigns' && method === 'POST') {
      const input = request.postDataJSON() as {
        description?: string | null;
        endsAt: string;
        eventIds: string[];
        startsAt: string;
        title: string;
        trailIds: string[];
      };
      const campaign = materializeCampaign(
        input,
        uuid('7', state.campaigns.length + 1),
        state,
      );
      state.campaigns.unshift(campaign);
      await json(
        route,
        { campaign, requestId: 'request-campaign-create' },
        201,
      );
      return;
    }
    const campaignUpdate = path.match(/^\/author\/campaigns\/([^/]+)$/u);
    if (campaignUpdate && method === 'PUT') {
      const current = state.campaigns.find(
        (item) => item.campaignId === campaignUpdate[1],
      )!;
      const input = request.postDataJSON();
      expect(input.expectedVersion).toBe(current.version);
      const campaign = {
        ...materializeCampaign(input, current.campaignId, state),
        version: current.version + 1,
      };
      replaceById(state.campaigns, campaign, (item) => item.campaignId);
      await json(route, { campaign, requestId: 'request-campaign-update' });
      return;
    }
    if (path === '/author/trails' && method === 'GET') {
      await json(route, { requestId: 'request-trails', trails: state.trails });
      return;
    }

    if (path === '/author/events' && method === 'GET') {
      if (state.eventDelayMs > 0)
        await new Promise((resolve) => setTimeout(resolve, state.eventDelayMs));
      if (state.failEvents) {
        await problem(route, 503, 'AUTHOR_UNAVAILABLE', 'Try again shortly.');
        return;
      }
      await json(route, { events: state.events, requestId: 'request-events' });
      return;
    }
    if (path === '/author/events' && method === 'POST') {
      const input = request.postDataJSON() as AuthorEventInput;
      const event: AuthorEvent = {
        ...eventFixture(EVENT_NEW, input.title, 'draft'),
        ...input,
        description: input.description ?? null,
      };
      state.events.unshift(event);
      await json(route, { event, requestId: 'request-event-create' }, 201);
      return;
    }

    const eventMatch = path.match(/^\/author\/events\/([^/]+)$/u);
    if (eventMatch && method === 'PUT') {
      const eventId = eventMatch[1]!;
      const input = request.postDataJSON() as AuthorEventInput;
      const current = state.events.find((event) => event.eventId === eventId)!;
      const event = {
        ...current,
        ...input,
        description: input.description ?? null,
      };
      replaceById(state.events, event, (item) => item.eventId);
      await json(route, { event, requestId: 'request-event-update' });
      return;
    }

    const eventLifecycle = path.match(
      /^\/author\/events\/([^/]+)\/(?:package\/)?(submit|approve|return|publish|retire)$/u,
    );
    if (eventLifecycle && method === 'POST') {
      const eventId = eventLifecycle[1]!;
      const action = eventLifecycle[2]!;
      if (action === 'publish' && state.rejectEventPublication) {
        await problem(
          route,
          422,
          'CONTENT_NOT_READY',
          'The server still requires one published challenge.',
        );
        return;
      }
      const current = state.events.find((event) => event.eventId === eventId)!;
      const status = lifecycleStatus(action);
      const event: AuthorEvent = {
        ...current,
        authoringStatus: status,
        isPublished: action === 'publish',
        retiredAt: action === 'retire' ? '2026-08-29T12:00:00.000Z' : null,
        submittedAt:
          action === 'submit'
            ? '2026-08-29T08:00:00.000Z'
            : current.submittedAt,
        submittedBy: action === 'submit' ? uuid('9', 1) : current.submittedBy,
      };
      replaceById(state.events, event, (item) => item.eventId);
      await json(route, { event, requestId: `request-event-${action}` });
      return;
    }

    const challengeList = path.match(
      /^\/author\/events\/([^/]+)\/challenges$/u,
    );
    if (challengeList && method === 'GET') {
      await json(route, {
        challenges: state.challenges.filter(
          (challenge) => challenge.eventId === challengeList[1],
        ),
        requestId: 'request-challenges',
      });
      return;
    }
    if (challengeList && method === 'POST') {
      const input = request.postDataJSON() as {
        format: AuthorChallenge['format'];
      };
      const challenge: AuthorChallenge = {
        ...challengeFixture(
          uuid('2', state.challenges.length + 1),
          challengeList[1]!,
        ),
        format: input.format,
      };
      state.challenges.push(challenge);
      await json(
        route,
        { challenge, requestId: 'request-challenge-create' },
        201,
      );
      return;
    }

    const challengeLifecycle = path.match(
      /^\/author\/challenges\/([^/]+)\/(submit|approve|return|publish|retire)$/u,
    );
    if (challengeLifecycle && method === 'POST') {
      const current = state.challenges.find(
        (challenge) => challenge.challengeId === challengeLifecycle[1],
      )!;
      const challenge: AuthorChallenge = {
        ...current,
        status: lifecycleStatus(challengeLifecycle[2]!),
      };
      replaceById(state.challenges, challenge, (item) => item.challengeId);
      await json(route, {
        challenge,
        requestId: 'request-challenge-lifecycle',
      });
      return;
    }

    const questionList = path.match(
      /^\/author\/challenges\/([^/]+)\/questions$/u,
    );
    if (questionList && method === 'GET') {
      await json(route, {
        questions: state.questions.filter(
          (question) => question.challengeId === questionList[1],
        ),
        requestId: 'request-questions',
      });
      return;
    }
    if (questionList && method === 'POST') {
      const input = request.postDataJSON() as AuthorQuestionInput;
      const question = materializeQuestion(
        input,
        uuid('4', state.questions.length + 1),
        questionList[1]!,
      );
      state.questions.push(question);
      await json(
        route,
        { question, requestId: 'request-question-create' },
        201,
      );
      return;
    }

    const questionUpdate = path.match(/^\/author\/questions\/([^/]+)$/u);
    if (questionUpdate && method === 'PUT') {
      const current = state.questions.find(
        (question) => question.questionId === questionUpdate[1],
      )!;
      const question = materializeQuestion(
        request.postDataJSON() as AuthorQuestionInput,
        current.questionId,
        current.challengeId,
      );
      replaceById(state.questions, question, (item) => item.questionId);
      await json(route, { question, requestId: 'request-question-update' });
      return;
    }

    const questionLifecycle = path.match(
      /^\/author\/questions\/([^/]+)\/(submit|approve|return|publish|retire)$/u,
    );
    if (questionLifecycle && method === 'POST') {
      const current = state.questions.find(
        (question) => question.questionId === questionLifecycle[1],
      )!;
      const question: AuthorQuestion = {
        ...current,
        status: lifecycleStatus(questionLifecycle[2]!),
      };
      replaceById(state.questions, question, (item) => item.questionId);
      await json(route, { question, requestId: 'request-question-lifecycle' });
      return;
    }

    if (path === '/author/cards' && method === 'GET') {
      await json(route, { cards: state.cards, requestId: 'request-cards' });
      return;
    }
    if (path === '/author/cards' && method === 'POST') {
      const card = materializeCard(
        request.postDataJSON() as AuthorCardInput,
        uuid('5', state.cards.length + 1),
      );
      state.cards.unshift(card);
      await json(route, { card, requestId: 'request-card-create' }, 201);
      return;
    }

    const cardUpdate = path.match(/^\/author\/cards\/([^/]+)$/u);
    if (cardUpdate && method === 'PUT') {
      const card = materializeCard(
        request.postDataJSON() as AuthorCardInput,
        cardUpdate[1]!,
      );
      replaceById(state.cards, card, (item) => item.id);
      await json(route, { card, requestId: 'request-card-update' });
      return;
    }

    const cardLifecycle = path.match(
      /^\/author\/cards\/([^/]+)\/(submit|approve|return|publish|retire)$/u,
    );
    if (cardLifecycle && method === 'POST') {
      const current = state.cards.find((card) => card.id === cardLifecycle[1])!;
      const card: AuthorCard = {
        ...current,
        authoringStatus: lifecycleStatus(cardLifecycle[2]!),
        isActive: cardLifecycle[2] === 'publish',
      };
      replaceById(state.cards, card, (item) => item.id);
      await json(route, { card, requestId: 'request-card-lifecycle' });
      return;
    }

    throw new Error(`Unhandled Author fixture request: ${method} ${path}`);
  });

  return state;
}

function lifecycleStatus(action: string): AuthorEvent['authoringStatus'] {
  return {
    approve: 'approved',
    publish: 'published',
    retire: 'retired',
    return: 'draft',
    submit: 'in_review',
  }[action] as AuthorEvent['authoringStatus'];
}

function authorTrails(): AuthorTrail[] {
  return [
    {
      createdAt: '2026-08-01T08:00:00.000Z',
      description: 'An orientation trail.',
      publishedAt: '2026-08-20T10:00:00.000Z',
      retiredAt: null,
      status: 'published',
      steps: [
        {
          eventId: EVENT_B,
          eventStatus: 'published',
          position: 1,
          title: 'MSL Open Day',
        },
      ],
      title: 'Campus orientation trail',
      trailId: TRAIL_A,
      updatedAt: '2026-08-20T10:00:00.000Z',
    },
  ];
}

function authorCampaigns(): AuthorCampaign[] {
  return [
    {
      ...lifecycleMetadata('draft'),
      campaignId: CAMPAIGN_A,
      createdAt: '2026-08-20T10:00:00.000Z',
      description: 'The first-week orientation schedule.',
      endsAt: '2026-09-30T16:00:00.000Z',
      events: [
        campaignEvent(eventFixture(EVENT_B, 'MSL Open Day', 'published')),
      ],
      publishedAt: null,
      retiredAt: null,
      startsAt: '2026-09-01T06:00:00.000Z',
      status: 'draft',
      title: 'Orientation Week',
      trails: [
        {
          status: 'published',
          title: 'Campus orientation trail',
          trailId: TRAIL_A,
        },
      ],
      updatedAt: '2026-08-20T10:00:00.000Z',
    },
  ];
}

function materializeCampaign(
  input: {
    description?: string | null;
    endsAt: string;
    eventIds: string[];
    startsAt: string;
    title: string;
    trailIds: string[];
  },
  campaignId: string,
  state: AuthorApiState,
): AuthorCampaign {
  return {
    ...lifecycleMetadata('draft'),
    campaignId,
    createdAt: '2026-08-29T10:00:00.000Z',
    description: input.description ?? null,
    endsAt: input.endsAt,
    events: input.eventIds.map((eventId) =>
      campaignEvent(state.events.find((event) => event.eventId === eventId)!),
    ),
    publishedAt: null,
    retiredAt: null,
    startsAt: input.startsAt,
    status: 'draft',
    title: input.title,
    trails: input.trailIds.map((trailId) => {
      const trail = state.trails.find(
        (candidate) => candidate.trailId === trailId,
      )!;
      return {
        status: trail.status,
        title: trail.title,
        trailId: trail.trailId,
      };
    }),
    updatedAt: '2026-08-29T10:00:00.000Z',
  };
}

function campaignEvent(event: AuthorEvent) {
  return {
    authoringStatus: event.authoringStatus,
    endsAt: event.endsAt,
    eventId: event.eventId,
    startsAt: event.startsAt,
    title: event.title,
  };
}

function authorEvents(): AuthorEvent[] {
  return [
    eventFixture(EVENT_A, 'Great Hall Discovery', 'draft'),
    eventFixture(EVENT_B, 'MSL Open Day', 'published'),
    eventFixture(EVENT_C, 'Retired Sprint Demo', 'retired'),
  ];
}

function activeOrderingAttempt(answeredCount = 0) {
  return {
    answeredCount,
    attemptId: ORDERING_ATTEMPT,
    deadline: new Date(Date.now() + 120_000).toISOString(),
    eventId: EVENT_A,
    format: 'ordering',
    questions: Array.from({ length: 5 }, (_, index) => {
      const position = index + 1;
      const items = [3, 1, 4, 2].map((item) => ({
        itemId: orderingItemId(position, item),
        text: `Campus era ${item}`,
      }));
      return {
        answeredAt: position <= answeredCount ? new Date().toISOString() : null,
        attemptQuestionId: orderingQuestionId(position),
        items,
        position,
        prompt: `Ordering question ${position}`,
        selectedItemIds:
          position <= answeredCount ? items.map((item) => item.itemId) : null,
      };
    }),
    requestId: 'request-ordering-attempt',
    startedAt: new Date(Date.now() - 30_000).toISOString(),
    status: 'in_progress',
    totalQuestions: 5,
  };
}

function completedOrderingAttempt() {
  return {
    attemptId: ORDERING_ATTEMPT,
    completedAt: new Date().toISOString(),
    completionReason: 'answered',
    eventId: EVENT_A,
    format: 'ordering',
    requestId: 'request-ordering-result',
    review: Array.from({ length: 5 }, (_, index) => {
      const position = index + 1;
      const correctItems = [1, 2, 3, 4].map((item) => ({
        itemId: orderingItemId(position, item),
        text: `Campus era ${item}`,
      }));
      return {
        attemptQuestionId: orderingQuestionId(position),
        correctItems,
        explanation: `Ordering explanation ${position}.`,
        isCorrect: position <= 3,
        position,
        prompt: `Ordering question ${position}`,
        selectedItems:
          position <= 3
            ? correctItems
            : [correctItems[1], correctItems[0], ...correctItems.slice(2)],
      };
    }),
    reward: { cards: [] },
    scoreCorrect: 3,
    status: 'completed',
    totalQuestions: 5,
  };
}

function orderingQuestionId(position: number) {
  return `31000000-0000-4000-${String(position).padStart(4, '0')}-000000000001`;
}

function orderingItemId(position: number, item: number) {
  return `32000000-0000-4000-${String(position).padStart(4, '0')}-${String(item).padStart(12, '0')}`;
}

function lifecycleMetadata(status: AuthorEvent['authoringStatus']) {
  return {
    publicationProvenance:
      status === 'published' || status === 'retired'
        ? ('controlled_seed' as const)
        : null,
    reviewedAt: null,
    reviewedBy: null,
    submittedAt: null,
    submittedBy: null,
    version: 0,
  };
}

function eventFixture(
  eventId: string,
  title: string,
  authoringStatus: AuthorEvent['authoringStatus'],
): AuthorEvent {
  return {
    ...lifecycleMetadata(authoringStatus),
    automaticPlacement: false,
    authoringStatus,
    createdAt: '2026-08-01T08:00:00.000Z',
    description: `${title} author fixture.`,
    endsAt: '2026-09-30T16:00:00.000Z',
    eventId,
    isPublished: authoringStatus === 'published',
    latitude: -26.19205,
    longitude: 28.03038,
    radiusMetres: 75,
    sourceUrls: [],
    retiredAt:
      authoringStatus === 'retired' ? '2026-08-20T10:00:00.000Z' : null,
    startsAt: '2026-08-01T06:00:00.000Z',
    title,
    updatedAt: '2026-08-20T10:00:00.000Z',
  };
}

function authorChallenges(): AuthorChallenge[] {
  return [challengeFixture(CHALLENGE_A, EVENT_A)];
}

function challengeFixture(
  challengeId: string,
  eventId: string,
): AuthorChallenge {
  return {
    ...lifecycleMetadata('draft'),
    challengeId,
    createdAt: '2026-08-01T08:00:00.000Z',
    eventId,
    format: 'multiple_choice',
    status: 'draft',
    updatedAt: '2026-08-20T10:00:00.000Z',
  };
}

function authorQuestions(): AuthorQuestion[] {
  return [
    questionFixture(1, 'Where is the Great Hall?', 'draft'),
    questionFixture(2, 'Which library is on East Campus?', 'published'),
    questionFixture(3, 'What does Wits stand for?', 'published'),
    questionFixture(4, 'Which city is Wits in?', 'published'),
    questionFixture(5, 'What is found at MSL?', 'published'),
    questionFixture(6, 'Which campus entrance is closest?', 'published'),
  ];
}

function questionFixture(
  position: number,
  prompt: string,
  status: AuthorQuestion['status'],
): AuthorQuestion {
  const questionId = uuid('4', position);
  const choices = [1, 2, 3, 4].map((choicePosition) => ({
    choiceId: uuid('6', position * 10 + choicePosition),
    position: choicePosition,
    text: `Answer ${choicePosition}`,
  }));
  return {
    ...lifecycleMetadata(status),
    acceptedChoiceId: choices[1]!.choiceId,
    acceptedChoicePosition: 2,
    challengeId: CHALLENGE_A,
    choices,
    createdAt: '2026-08-01T08:00:00.000Z',
    difficulty: position > 3 ? 2 : 1,
    explanation: 'Author-only fixture explanation.',
    sourceUrls: [],
    format: 'multiple_choice',
    prompt,
    questionId,
    status,
    updatedAt: '2026-08-20T10:00:00.000Z',
  };
}

function materializeQuestion(
  input: AuthorQuestionInput,
  questionId: string,
  challengeId: string,
): AuthorQuestion {
  if (input.format === 'ordering') {
    return {
      ...lifecycleMetadata('draft'),
      challengeId,
      createdAt: '2026-08-29T08:00:00.000Z',
      difficulty: input.difficulty,
      explanation: input.explanation,
      sourceUrls: [],
      format: 'ordering',
      items: input.items.map((text, index) => ({
        itemId: uuid('7', 100 + index),
        position: index + 1,
        text,
      })),
      prompt: input.prompt,
      questionId,
      status: 'draft',
      updatedAt: '2026-08-29T08:00:00.000Z',
    };
  }

  const choices = input.choices.map((text, index) => ({
    choiceId: uuid('6', 100 + index),
    position: index + 1,
    text,
  }));
  return {
    ...lifecycleMetadata('draft'),
    acceptedChoiceId: choices[input.acceptedChoicePosition - 1]!.choiceId,
    acceptedChoicePosition: input.acceptedChoicePosition,
    challengeId,
    choices,
    createdAt: '2026-08-29T08:00:00.000Z',
    difficulty: input.difficulty,
    explanation: input.explanation,
    sourceUrls: [],
    format: 'multiple_choice',
    prompt: input.prompt,
    questionId,
    status: 'draft',
    updatedAt: '2026-08-29T08:00:00.000Z',
  };
}

function authorCards(): AuthorCard[] {
  return [
    materializeCard(
      {
        affinity: 'wit',
        category: 'creature',
        description: 'A draft scholarly companion.',
        effects: [],
        hp: 120,
        imageUrl: null,
        moves: [1, 2, 3, 4].map((position) =>
          moveInput(position, `Draft move ${position}`),
        ),
        name: 'Campus Owl',
        power: 20,
        rarity: 'common',
      },
      CARD_DRAFT,
    ),
    {
      ...materializeCard(
        {
          affinity: 'grit',
          category: 'creature',
          description: 'A complete published four-move creature.',
          effects: [],
          hp: 180,
          imageUrl: null,
          moves: [1, 2, 3, 4].map((position) =>
            moveInput(position, `Move ${position}`),
          ),
          name: 'Four Move Ibex',
          power: 30,
          rarity: 'rare',
        },
        CARD_CREATURE,
      ),
      authoringStatus: 'published',
      isActive: true,
    },
    {
      ...materializeCard(
        {
          affinity: 'wit',
          category: 'power',
          description: 'Recover knowledge and health.',
          effects: [
            {
              effectType: 'heal',
              effectValue: 30,
              modifierDurationTurns: null,
              modifierOperation: null,
              modifierStat: null,
              position: 1,
            },
          ],
          hp: null,
          imageUrl: null,
          moves: [],
          name: 'Archive Insight',
          power: null,
          rarity: 'common',
        },
        CARD_POWER,
      ),
      authoringStatus: 'published',
      isActive: true,
    },
  ];
}

function materializeCard(input: AuthorCardInput, id: string): AuthorCard {
  return {
    ...input,
    ...lifecycleMetadata('draft'),
    authoringStatus: 'draft',
    createdAt: '2026-08-01T08:00:00.000Z',
    description: input.description ?? null,
    effects: input.effects.map((effect, index) => ({
      ...effect,
      effectValue: effect.effectValue ?? null,
      id: uuid('7', index + 1),
      modifierDurationTurns: effect.modifierDurationTurns ?? null,
      modifierOperation: effect.modifierOperation ?? null,
      modifierStat: effect.modifierStat ?? null,
    })),
    id,
    imageUrl: input.imageUrl ?? null,
    isActive: false,
    moves: input.moves.map((move, index) => ({
      ...move,
      effectValue: move.effectValue ?? null,
      id: uuid('8', index + 1),
      modifierDurationTurns: move.modifierDurationTurns ?? null,
      modifierOperation: move.modifierOperation ?? null,
      modifierStat: move.modifierStat ?? null,
    })),
    updatedAt: '2026-08-20T10:00:00.000Z',
  };
}

function moveInput(
  position: number,
  name: string,
): AuthorCardInput['moves'][number] {
  return {
    effectType: 'damage',
    effectValue: 12,
    modifierDurationTurns: null,
    modifierOperation: null,
    modifierStat: null,
    moveType: 'basic',
    name,
    position,
    powerCost: 1,
  };
}

async function json(route: Route, payload: object, status = 200) {
  await route.fulfill({
    contentType: 'application/json',
    json: payload,
    status,
  });
}

async function problem(
  route: Route,
  status: number,
  code: string,
  detail: string,
) {
  await route.fulfill({
    contentType: 'application/problem+json',
    json: {
      code,
      detail,
      requestId: 'request-problem',
      status,
      title: 'Request failed',
      type: 'about:blank',
    },
    status,
  });
}

function replaceById<T>(items: T[], next: T, getId: (item: T) => string) {
  const index = items.findIndex((item) => getId(item) === getId(next));
  if (index === -1) items.push(next);
  else items.splice(index, 1, next);
}

function placementStateFixture() {
  const zoneEast = uuid('1', 101);
  const zoneWest = uuid('1', 102);
  const siteHall = uuid('2', 101);
  const siteLibrary = uuid('2', 102);
  return {
    assignments: [
      {
        eventId: EVENT_A,
        origin: 'automatic',
        siteId: siteHall,
        zoneId: zoneEast,
      },
    ],
    currentPlanId: uuid('4', 1),
    events: [
      { id: EVENT_A, title: 'Great Hall Discovery' },
      { id: EVENT_B, title: 'Library collections' },
    ],
    metrics: {
      activeAssignmentCount: 1,
      activeZoneCount: 2,
      lastAppliedAt: '2026-09-24T02:00:00.000Z',
      lastFailureAt: null,
      lastFailureCode: null,
      servedZoneCount: 1,
      targetAssignmentCount: 6,
      unservedZoneCount: 1,
    },
    nextRotationBoundary: '2026-09-26T02:00:00.000Z',
    overrides: [
      {
        eventId: EVENT_B,
        expiresAt: '2026-09-27T02:00:00.000Z',
        id: uuid('5', 1),
        kind: 'pin',
        siteId: siteLibrary,
      },
    ],
    policy: {
      cooldownBuckets: 2,
      id: 'placement-v1',
      mandatoryPerZone: 1,
      maximumExclusionHours: 720,
      maximumPauseHours: 168,
      maximumPinHours: 168,
      preferredPerZone: 2,
      previewTtlMinutes: 15,
      replacements: 2,
      rotationLocalTime: '04:00:00',
      rotationTimezone: 'Africa/Johannesburg',
      separationMetres: 150,
      target: 6,
    },
    policyVersion: 'placement-v1',
    requestId: 'request-placement-state',
    rotationBucket: '2026-09-25',
    sites: [
      {
        excluded: false,
        id: siteHall,
        latitude: -26.192,
        longitude: 28.0304,
        maximumRadiusMetres: 75,
        name: 'Great Hall',
        status: 'active',
        zoneId: zoneEast,
      },
      {
        excluded: true,
        id: siteLibrary,
        latitude: -26.1907,
        longitude: 28.0293,
        maximumRadiusMetres: 60,
        name: 'William Cullen Library',
        status: 'active',
        zoneId: zoneWest,
      },
    ],
    stateVersion: 4,
    zones: [
      {
        geometry: placementPolygon(28.029, -26.193),
        id: zoneEast,
        key: 'east_campus',
        name: 'East Campus',
        status: 'active',
      },
      {
        geometry: placementPolygon(28.026, -26.193),
        id: zoneWest,
        key: 'west_campus',
        name: 'West Campus',
        status: 'active',
      },
    ],
  };
}

function placementPlanFixture() {
  const zoneEast = uuid('1', 101);
  const zoneWest = uuid('1', 102);
  const siteHall = uuid('2', 101);
  const siteLibrary = uuid('2', 102);
  return {
    entries: [
      {
        eventId: EVENT_A,
        origin: 'automatic',
        siteId: siteLibrary,
        zoneId: zoneWest,
      },
      {
        eventId: EVENT_B,
        origin: 'pin',
        siteId: siteHall,
        zoneId: zoneEast,
      },
    ],
    exceptions: ['preferred_coverage_shortfall', 'target_shortfall'],
    planId: uuid('4', 3),
    policyVersion: 'placement-v1',
    rotationBucket: '2026-09-25',
    stateVersion: 4,
    status: 'degraded',
    validUntil: '2027-09-25T21:15:00.000Z',
    validation: {
      coverage: [
        {
          actual: 1,
          mandatory: 1,
          preferred: 2,
          status: 'preferred_shortfall',
          zoneId: zoneEast,
        },
        {
          actual: 1,
          mandatory: 1,
          preferred: 2,
          status: 'preferred_shortfall',
          zoneId: zoneWest,
        },
      ],
      separation: {
        blockedSites: [
          {
            conflictsWithFixedEvent: false,
            relatedSiteIds: [siteHall],
            siteId: siteLibrary,
            zoneId: zoneWest,
          },
        ],
        minimumMetres: 150,
      },
    },
    zoneCounts: { [zoneEast]: 1, [zoneWest]: 1 },
  };
}

function placementPolygon(longitude: number, latitude: number) {
  return {
    coordinates: [
      [
        [longitude, latitude],
        [longitude + 0.002, latitude],
        [longitude + 0.002, latitude + 0.002],
        [longitude, latitude],
      ],
    ],
    type: 'Polygon',
  };
}

function uuid(prefix: string, position: number) {
  return `${prefix}0000000-0000-4000-8000-${String(position).padStart(12, '0')}`;
}

function monitorConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function documentHeight(page: Page) {
  return page.evaluate(() => document.documentElement.scrollHeight);
}

async function openCatalogueRow(row: Locator) {
  await expect(row.locator('.author-row-link > svg')).toHaveCount(0);
  const bounds = await row.boundingBox();
  if (!bounds) throw new Error('Catalogue row is not visible.');
  await row.click({
    position: { x: bounds.width - 16, y: bounds.height / 2 },
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

async function openAuthorNavigation(page: Page) {
  const toggle = page.getByRole('button', { name: /Author navigation/ });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute('aria-expanded')) === 'false'
  )
    await toggle.click();
}

async function enterEventDateTime(page: Page, label: string, value: string) {
  const [year, month, day, hour, minute] = value.split(/[-T:]/);
  const field = page.getByRole('group', { name: label, exact: true });
  for (const [part, digits] of Object.entries({
    year,
    month,
    day,
    hour,
    minute,
  })) {
    const segment = field.getByRole('spinbutton', {
      name: new RegExp(`^${part},`),
    });
    await segment.click();
    if (!digits) throw new Error('Incomplete date-time test value');
    await segment.pressSequentially(digits);
  }
}

test('shared catalogue fields support search clearing, keyboard selection, and bounded menus', async ({
  page,
}, info) => {
  await installAuthorApi(page);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const section of ['cards', 'events']) {
      await page.goto(`/author/${section}`);
      const lifecycle = page.getByLabel('Lifecycle', { exact: true });
      await expect(lifecycle).toBeVisible();
      await lifecycle.focus();
      await page.keyboard.press('ArrowDown');
      const menu = page.getByRole('listbox');
      await expect(menu).toBeVisible();
      const bounds = await menu.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await expect(
        page.getByRole('option', { name: 'All', exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      await captureScreenshot(test.info(), page, {
        path: info.outputPath(`${section}-filters-${width}.png`),
      });
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(lifecycle).toBeFocused();
      await lifecycle.click();
      await page.getByRole('option', { name: 'Draft', exact: true }).click();
      await expect(lifecycle).toContainText('Draft');
      await expect(
        page.locator(
          `.${section === 'cards' ? 'card' : 'event'}-table tbody tr`,
        ),
      ).toHaveCount(1);
      const search = page.getByRole('searchbox', {
        name: 'Search',
        exact: true,
      });
      await search.fill('no-such-content');
      await expect(
        page.getByText(`No ${section} match`, { exact: true }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Clear search', exact: true })
        .click();
      await expect(search).toBeFocused();
      await expect(search).toHaveValue('');
      await expectNoHorizontalOverflow(page);
    }
  }
});

test('author creation fields keep keyboard menus and validation usable at responsive widths', async ({
  page,
}, info) => {
  await installAuthorApi(page);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/author/cards/new');
    await page.getByLabel('Card name').fill('Library Fox');
    const rarity = page.locator('#card-rarity');
    await rarity.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('listbox')).toBeVisible();
    const menuBox = await page.getByRole('listbox').boundingBox();
    expect(menuBox!.x).toBeGreaterThanOrEqual(0);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(width);
    await captureScreenshot(test.info(), page, {
      path: info.outputPath(`new-card-fields-${width}.png`),
    });
    await page.keyboard.press('Escape');
    await expect(rarity).toBeFocused();
    await page.getByLabel('Move name').fill('Quiet Step');
    await selectOption(page.locator('#move-0-effect-type'), 'buff');
    await page.getByRole('button', { name: 'Create draft card' }).click();
    const modifier = page.locator('#move-0-modifier-stat');
    await expect(modifier).toBeFocused();
    await expect(modifier).toHaveAttribute('aria-invalid', 'true');
    await expect(modifier).toHaveAccessibleDescription(
      'Buff and debuff effects require modifier metadata.',
    );
    await selectOption(modifier, 'power');
    await expect(modifier).toContainText('Power');
    await expectNoHorizontalOverflow(page);
    // Complete the valid draft before leaving so the next route has no unsaved guard.
    await page.getByRole('button', { name: 'Create draft card' }).click();
    await expect(
      page.getByText('Draft card created.', { exact: true }),
    ).toBeVisible();
    await page.goto('/author/events/new');
    const title = page.getByLabel('Event title');
    await expect(title).toBeVisible();
    await title.focus();
    await captureScreenshot(test.info(), page, {
      path: info.outputPath(`new-event-fields-${width}.png`),
    });
    await page.getByRole('button', { name: 'Create draft event' }).click();
    await expect(title).toBeFocused();
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    await expectNoHorizontalOverflow(page);
  }
});

test('desktop content review keeps evidence, decisions and queue return together', async ({
  page,
}) => {
  const state = await installAuthorApi(page);
  const errors = monitorConsoleErrors(page);
  const submission = {
    submittedAt: '2026-09-25T08:00:00.000Z',
    submittedBy: uuid('9', 2),
    version: 2,
  };
  state.events[1] = {
    ...state.events[1]!,
    ...submission,
    authoringStatus: 'in_review',
  };
  const eventChallenge = {
    ...challengeFixture(uuid('2', 2), EVENT_B),
    ...submission,
    status: 'in_review' as const,
  };
  state.challenges.push(eventChallenge);
  state.questions.push(
    ...Array.from({ length: 5 }, (_, index) => ({
      ...questionFixture(
        index + 31,
        `Science question ${index + 1}`,
        'in_review',
      ),
      ...submission,
      challengeId: eventChallenge.challengeId,
    })),
  );
  state.questions[0] = {
    ...state.questions[0]!,
    ...submission,
    status: 'in_review',
  };
  state.questions[1] = {
    ...state.questions[1]!,
    ...submission,
    submittedBy: uuid('9', 1),
    status: 'in_review',
  };
  state.campaigns[0] = {
    ...state.campaigns[0]!,
    ...submission,
    status: 'in_review',
  };
  state.cards[0] = {
    ...state.cards[0]!,
    ...submission,
    authoringStatus: 'in_review',
  };
  state.cards.push(
    ...Array.from({ length: 20 }, (_, index) => ({
      ...state.cards[0]!,
      id: uuid('5', index + 20),
      name: `Campus Owl ${index + 2}`,
    })),
  );

  const capture = async (name: string, width: number) => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(test.info(), page, {
      path: `author/content-review-${name}-${width}.png`,
      fullPage: true,
    });
  };
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/author/review');
    await expect(
      page.getByRole('heading', { name: 'Content review' }),
    ).toBeVisible();
    await expect(
      page.getByText('Your submission', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('In review', { exact: true })).toHaveCount(0);
    await expect(page.locator('.author-console__header')).toHaveCount(0);
    await expect(page.locator('.review-table__open svg')).toHaveCount(0);
    await capture('queue', width);

    await page
      .getByRole('row', { name: /MSL Open Day/ })
      .click({ position: { x: 24, y: 24 } });
    await expect(
      page.getByRole('link', { name: 'Back to queue' }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Event definition' }),
    ).toContainText('MSL Open Day');
    await expect(
      page
        .getByRole('region', { name: 'Event definition' })
        .getByText('Starts · Johannesburg'),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Event definition' })
        .getByText('Ends', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('.review-submission-meta')).toHaveCount(1);
    await expect(
      page.getByRole('region', { name: 'Submitted questions' }),
    ).toContainText('Science question 5');
    await expect(
      page.getByRole('button', { name: 'Approve event package' }),
    ).toBeEnabled();
    await capture('event', width);
    await page.getByRole('link', { name: 'Back to queue' }).click();

    await page
      .getByRole('link', { name: 'Review question: Where is the Great Hall?' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Where is the Great Hall?' }),
    ).toBeVisible();
    await expect(page.getByText('Correct', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Author-only fixture explanation.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Approve question' }),
    ).toBeEnabled();
    await capture('question', width);
    await page
      .getByRole('button', { name: 'Return to draft', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Return this question to draft?',
    });
    await expect(dialog.getByLabel('Reason')).toBeFocused();
    await dialog
      .getByRole('button', { name: 'Return question', exact: true })
      .click();
    await expect(dialog.getByText('Add a reason.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Return to draft', exact: true }),
    ).toBeFocused();
    if (width === 1920) {
      await page.getByRole('button', { name: 'Approve question' }).click();
      await expect(page.getByText('Approved.', { exact: true })).toBeFocused();
      expect(
        state.questions.find((question) => question.questionId === QUESTION_A)
          ?.status,
      ).toBe('approved');
    }
    await page.getByRole('link', { name: 'Back to queue' }).click();

    await page
      .getByRole('row', { name: /Which library is on East Campus\?/ })
      .click({ position: { x: 24, y: 24 } });
    await expect(
      page.getByText('Another author must review this submission.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Approve question' }),
    ).toHaveCount(0);
    await capture('own-question', width);
    await page.getByRole('link', { name: 'Back to queue' }).click();
    // Other review types may appear on the next server page with a mixed queue.
    await selectOption(page.getByLabel('Content type'), 'campaign');
    await page
      .getByRole('link', { name: 'Review campaign: Orientation Week' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Content', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Campus orientation trail')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Approve campaign' }),
    ).toBeEnabled();
    await capture('campaign', width);
    await page.getByRole('link', { name: 'MSL Open Day', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'MSL Open Day', exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(
      page.getByRole('link', { name: 'Back to queue' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Back to queue' }).click();
    await expect(page.getByLabel('Content type')).toContainText('Campaigns');

    await selectOption(page.getByLabel('Content type'), 'card');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Page 2 of 3')).toBeVisible();
    await page.setViewportSize({ width, height: 600 });
    const cardLink = page.getByRole('link', {
      name: 'Review card: Campus Owl 20',
      exact: true,
    });
    await cardLink.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(0);
    await cardLink.click();
    await expect(page).toHaveURL(`/author/cards/${uuid('5', 38)}/review`);
    await expect(page.locator('.author-record-view')).toBeFocused();
    await expect(
      page.getByRole('region', { name: 'Campus Owl 20 authoring preview' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Moves', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Review history', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('.author-history')).not.toHaveAttribute('open');
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.author-record-view')).toBeFocused();
    await expect(page.locator('.skip-link')).not.toBeFocused();
    await expect
      .poll(() =>
        page.locator('.skip-link').evaluate((element) => ({
          focused: element.matches(':focus'),
          aboveViewport: element.getBoundingClientRect().bottom <= 0,
        })),
      )
      .toEqual({
        focused: false,
        aboveViewport: true,
      });
    await capture('card', width);
    await expect(page.locator('.author-record-view')).toBeFocused();
    await page.setViewportSize({ width, height: 600 });
    await page.getByRole('link', { name: 'Back to queue' }).click();
    await expect(page.getByText('Page 2 of 3')).toBeVisible();
    await expect(cardLink).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(scrollBefore, 0);
    await page.goBack();
    await expect(
      page.getByRole('link', { name: 'Back to queue' }),
    ).toBeVisible();
    await page.goForward();
    await expect(cardLink).toBeFocused();
    await page
      .getByRole('link', { name: 'Events', exact: true })
      .first()
      .click();
    await page.getByRole('link', { name: /MSL Open Day/ }).click();
    await expect(page.getByRole('link', { name: 'Back to queue' })).toHaveCount(
      0,
    );
  }
  expect(errors).toEqual([]);
});

test('content review returns to a populated page after approving its last item', async ({
  page,
}) => {
  const state = await installAuthorApi(page);
  const errors = monitorConsoleErrors(page);
  const submission = {
    submittedAt: '2026-09-25T08:00:00.000Z',
    submittedBy: uuid('9', 2),
    version: 2,
    authoringStatus: 'in_review' as const,
  };
  state.cards = Array.from({ length: 11 }, (_, index) => ({
    ...state.cards[0]!,
    ...submission,
    id: uuid('5', index + 20),
    name: `Review Owl ${index + 1}`,
  }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/author/review');
  await selectOption(page.getByLabel('Content type'), 'card');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await page
    .getByRole('link', { name: 'Review card: Review Owl 11', exact: true })
    .click();
  await page.getByRole('button', { name: 'Approve card' }).click();
  await expect(page.getByText('Approved.', { exact: true })).toBeFocused();
  await page.getByRole('link', { name: 'Back to queue' }).click();
  await expect(
    page.getByRole('link', { name: 'Review card: Review Owl 1', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /^Review card:/ })).toHaveCount(
    10,
  );
  await expect(
    page.getByRole('heading', { name: 'Content review' }),
  ).toBeFocused();
  await expect(page.getByLabel('Content type')).toContainText('Cards');
  expect(errors).toEqual([]);
});

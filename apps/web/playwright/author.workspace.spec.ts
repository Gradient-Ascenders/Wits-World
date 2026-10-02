import { mkdir } from 'node:fs/promises';
import { expect, test, type Page, type Route } from '@playwright/test';

import type {
  AuthorCard,
  AuthorCardInput,
  AuthorCampaign,
  AuthorChallenge,
  AuthorEvent,
  AuthorEventInput,
  AuthorQuestion,
  AuthorQuestionInput,
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
  await page.getByLabel('Lifecycle').selectOption('draft');
  await expect(
    page.getByRole('link', { name: /Great Hall Discovery/u }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /MSL Open Day/u })).toHaveCount(
    0,
  );
  await page.getByLabel('Lifecycle').selectOption('all');
  await expect(page.getByRole('link', { name: 'New event' })).toHaveCount(1);
  await expect(
    page.getByRole('combobox', { name: 'Schedule', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Schedule', exact: true })
    .selectOption('upcoming');
  await expect(
    page.getByText('No events match', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Schedule', exact: true })
    .selectOption('all');

  await eventSearch.fill('Great Hall');
  await page.getByRole('link', { name: /Great Hall Discovery/u }).click();
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
    page.getByRole('button', { name: /Navigation/ }),
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
  await expect(
    page.getByText('Accepted answer', { exact: true }),
  ).toBeVisible();
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
  await page.getByLabel('Starts at').fill('2026-09-01T10:00');
  await page.getByLabel('Ends at').fill('2026-09-01T12:00');
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
  await page.getByLabel('Format').selectOption('ordering');
  await page.getByRole('button', { name: 'Create challenge' }).click();
  await expect(
    page.getByText('Draft ordering challenge associated with this event.'),
  ).toBeFocused();
  await expect(page.getByText('Ordering · draft')).toBeVisible();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question prompt').fill('Order these campus eras.');
  await page.getByRole('button', { name: 'Create draft question' }).click();
  await expect(page.getByLabel('Correct position 1')).toBeFocused();
  for (const [index, value] of [
    'Founding',
    'Expansion',
    'Transformation',
    'Present day',
  ].entries()) {
    await page.getByLabel(`Correct position ${index + 1}`).fill(value);
  }
  await page
    .getByLabel('Author explanation')
    .fill('The sequence follows the documented campus chronology.');
  await page.getByRole('button', { name: 'Create draft question' }).click();
  await expect(page.getByText('Draft question created.')).toBeFocused();
  await expect(
    page.getByRole('heading', { name: 'Correct sequence' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await testInfo.attach('ordering-author-desktop.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await expect(
    page.getByRole('heading', { name: 'Correct sequence' }),
  ).toBeVisible();
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
  await testInfo.attach('ordering-player-mobile.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

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
  await testInfo.attach('ordering-result-mobile.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  await page.setViewportSize({ height: 800, width: 1280 });
  await expect(
    page.getByRole('heading', { name: 'Your challenge result' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await testInfo.attach('ordering-result-desktop.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  expect(consoleErrors).toEqual([]);
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
    page.getByRole('heading', { name: 'Review queue' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Review question' }),
  ).toHaveAttribute(
    'href',
    `/author/events/${EVENT_A}/challenges/${CHALLENGE_A}/questions/${QUESTION_A}`,
  );
  await expect(page.getByText('In review', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Review question' }).click();
  await page.getByRole('button', { name: 'Approve question' }).click();
  await expect(page.getByText('Question approved.')).toBeFocused();
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
  await page.getByRole('link', { name: /Orientation Week/u }).click();
  await expect(
    page.getByRole('heading', { name: 'Orientation Week' }),
  ).toBeVisible();
  await expect(page.getByText('1 events · 1 trails')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/author/campaigns/new');
  await expect(
    page.getByRole('heading', { name: 'Create campaign' }),
  ).toBeVisible();
  await page.getByLabel('Title').fill('Open Day Schedule');
  await page.getByLabel('Starts').fill('2026-09-10T08:00');
  await page.getByLabel('Ends').fill('2026-09-10T17:00');
  await page.getByRole('checkbox', { name: /MSL Open Day/u }).check();
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page.getByText('Campaign draft created.')).toBeFocused();
  await expect(
    page.getByRole('heading', { name: 'Open Day Schedule' }),
  ).toBeVisible();
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
    await mkdir('.impeccable/review', { recursive: true });
    const capture = async (name: string) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `.impeccable/review/${name}-${viewport.width}.png`,
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
}) => {
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

test('Player review uses a responsive, privacy-safe master-detail workflow', async ({
  page,
}, testInfo) => {
  const caseId = uuid('a', 1);
  const detail = trustCaseFixture(caseId);
  await installTrustReviewApi(page, detail);
  const consoleErrors = monitorConsoleErrors(page);

  await page.setViewportSize({ height: 950, width: 1440 });
  await page.goto(`/author/player-review/${caseId}`);
  await expect(
    page.getByRole('heading', { name: detail.playerName }),
  ).toBeVisible();
  await expect(page.getByLabel('Trust case queue')).toBeVisible();
  await expect(
    page.getByText('Review priority, not proof of misconduct.'),
  ).toBeVisible();
  const signals = page.getByRole('region', { name: 'Signals' });
  await expect(signals.getByText('Impossible movement')).toBeVisible();
  await expect(signals.getByText('High severity')).toBeVisible();
  await signals.getByText('View aggregate basis').click();
  await expect(signals.getByText(/87.5%/u)).toBeVisible();
  await expect(signals.getByText(/policy threshold/iu)).toHaveCount(0);
  const queueToggle = page.getByRole('button', { name: 'Collapse case queue' });
  await queueToggle.click();
  await expect(
    page.getByRole('button', { name: 'Expand case queue' }),
  ).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Expand case queue' }).click();
  const decisionLink = page
    .getByRole('navigation', { name: 'Case investigation' })
    .getByRole('link', { name: 'Decision' });
  await decisionLink.focus();
  await expect(decisionLink).toBeFocused();
  await expect(
    page.getByRole('textbox', { name: /Reason and context/u }),
  ).toBeVisible();
  await page.getByLabel('Apply temporary restriction').check();
  await page.getByLabel('Require online verification').check();
  await page.getByLabel('Duration').selectOption('72');
  await page
    .getByRole('textbox', { name: /Reason and context/u })
    .fill('Temporarily pause new matches while this case is reviewed.');
  await page.getByRole('button', { name: 'Review restriction' }).click();
  const desktopDialog = page.getByRole('dialog', {
    name: `Apply temporary restrictions to ${detail.playerName}?`,
  });
  await expect(
    desktopDialog.getByRole('heading', { name: 'Current state' }),
  ).toBeVisible();
  await expect(
    desktopDialog.getByText('Pause new competitive matches'),
  ).toBeVisible();
  await expect(
    desktopDialog.getByRole('heading', { name: 'Proposed restriction' }),
  ).toBeVisible();
  await expect(
    desktopDialog.getByText('Require online verification'),
  ).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('player-review-confirmation-desktop.png'),
  });
  await page.keyboard.press('Escape');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('player-review-desktop.png'),
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/author/player-review');
  await expect(page.getByLabel('Trust case queue')).toBeVisible();
  await expect(page.getByText('Select a case to begin review.')).toBeVisible();
  await page.getByRole('link', { name: /Casey Reviewer/u }).click();
  await expect(page).toHaveURL(`/author/player-review/${caseId}`);
  await expect(page.getByLabel('Trust case queue')).toBeHidden();
  await expect(
    page.getByRole('link', { name: 'Back to case queue' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: detail.playerName }),
  ).toBeVisible();
  await page.getByLabel('Apply temporary restriction').check();
  await page.getByLabel('Require online verification').check();
  await page
    .getByRole('textbox', { name: /Reason and context/u })
    .fill('Require a short verification step while this case is reviewed.');
  await page.getByRole('button', { name: 'Review restriction' }).click();
  const mobileDialog = page.getByRole('dialog', {
    name: `Apply temporary restrictions to ${detail.playerName}?`,
  });
  await expect(
    mobileDialog.getByRole('heading', { name: 'Current state' }),
  ).toBeVisible();
  await expect(
    mobileDialog.getByRole('heading', { name: 'Proposed restriction' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('player-review-confirmation-mobile.png'),
  });
  await page.keyboard.press('Escape');

  expect(consoleErrors).toEqual([]);
});

test('Card catalogue uses filtered master detail and concise real-card read-only views', async ({
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
  await page.getByLabel('Lifecycle').selectOption('published');
  await page.getByLabel('Category').selectOption('creature');
  await page.getByLabel('Affinity').selectOption('grit');
  await page.getByLabel('Rarity').selectOption('rare');
  await page.locator('.author-filter-menu > summary').click();
  await expect(
    page.getByRole('link', { name: /Four Move Ibex/u }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Campus Owl/u })).toHaveCount(0);

  await page.getByRole('link', { name: /^Four Move Ibex/u }).click();
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
  await page.getByLabel('Category').selectOption('power');
  await page.getByLabel('Affinity').selectOption('wit');
  await page.getByLabel('Rarity').selectOption('common');
  await page.locator('.author-filter-menu > summary').click();
  await page.getByRole('link', { name: /Archive Insight/u }).click();
  await expect(page).toHaveURL(`/author/cards/${CARD_POWER}`);
  await expect(page.getByText('Restore 30 HP')).toBeVisible();
  await expect(page.locator('.collectible-card')).not.toContainText(
    'Restore 30 HP',
  );
  await expect(page.getByLabel('Effect type')).toHaveCount(0);

  await page.getByRole('link', { name: 'Card catalogue' }).click();
  await page.getByLabel('Lifecycle').selectOption('draft');
  await page.locator('.author-filter-menu > summary').click();
  await page.getByLabel('Category').selectOption('creature');
  await page.getByLabel('Affinity').selectOption('wit');
  await page.getByLabel('Rarity').selectOption('common');
  await page.locator('.author-filter-menu > summary').click();
  await page.getByRole('link', { name: /Campus Owl/u }).click();
  await page.getByRole('link', { name: 'Edit card' }).click();
  await page.getByLabel('Card name').fill('Campus Owl revised');
  const cardCatalogue = page.getByRole('complementary', {
    name: 'Card definitions',
  });
  await cardCatalogue.getByLabel('Lifecycle').selectOption('all');
  await cardCatalogue.locator('.author-filter-menu > summary').click();
  await cardCatalogue.getByLabel('Category').selectOption('all');
  await cardCatalogue.getByLabel('Affinity').selectOption('all');
  await cardCatalogue.getByLabel('Rarity').selectOption('all');
  await cardCatalogue.locator('.author-filter-menu > summary').click();
  await page.getByRole('link', { name: /^Four Move Ibex/u }).click();
  const dirtyDialog = page.getByRole('dialog', {
    name: 'Discard unsaved changes?',
  });
  await expect(dirtyDialog).toContainText('unsaved card draft changes');
  await dirtyDialog.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByLabel('Card name')).toHaveCount(0);
  await expect(page.locator('.collectible-card')).toBeVisible();

  await page.getByRole('link', { name: 'New card' }).first().click();
  await page
    .locator('.author-form')
    .getByLabel('Category', { exact: true })
    .selectOption('power');
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
  const lifecycleHeaderBox = await page
    .locator('.author-card-detail__lifecycle')
    .boundingBox();
  expect(noticeBox).not.toBeNull();
  expect(lifecycleHeaderBox).not.toBeNull();
  expect((noticeBox?.y ?? 0) - (lifecycleHeaderBox?.y ?? 0)).toBeLessThan(150);

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
  expect(mobilePublishedCreatureHeight).toBeLessThan(creatureEditorHeight);

  await page.setViewportSize({ height: 1000, width: 1600 });
  await page.goto(`/author/cards/${CARD_CREATURE}`);
  await expect(page.locator('.collectible-card')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(
    page.getByRole('link', {
      name: /A Deliberately Long Card Name for the Great Hall Archive Catalogue/u,
    }),
  ).toBeVisible();
  const catalogueScroll = await page
    .locator('.author-catalogue__list')
    .evaluate((element) => ({
      clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
    }));
  expect(catalogueScroll.overflowY).toBe('auto');
  expect(catalogueScroll.scrollHeight).toBeGreaterThan(
    catalogueScroll.clientHeight,
  );
  const deepLinkedCardId = uuid('5', 128);
  await page.goto(`/author/cards/${deepLinkedCardId}`);
  const deepLinkedRow = page.getByRole('link', {
    name: /Catalogue specimen 29/u,
  });
  await expect(deepLinkedRow).toHaveAttribute('aria-current', 'true');
  await expect
    .poll(() =>
      page
        .locator('.author-catalogue__list')
        .evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(0);
  const selectedRowPosition = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.author-catalogue__list');
    const row = document.querySelector<HTMLElement>(
      '.author-record-summary[aria-current="true"]',
    );
    if (!list || !row) throw new Error('Selected catalogue row is missing.');
    const listBounds = list.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    return {
      listBottom: listBounds.bottom,
      listTop: listBounds.top,
      rowBottom: rowBounds.bottom,
      rowTop: rowBounds.top,
    };
  });
  expect(selectedRowPosition.rowTop).toBeGreaterThanOrEqual(
    selectedRowPosition.listTop - 1,
  );
  expect(selectedRowPosition.rowBottom).toBeLessThanOrEqual(
    selectedRowPosition.listBottom + 1,
  );
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
  await expect(page.getByText('Loading authored events…')).toBeVisible();
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
  ).toBeVisible();
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
    page.getByRole('table', { name: 'Current and proposed event placements' }),
  ).toBeVisible();
  await expect(page.getByRole('table', { name: 'Coverage zones' })).toHaveCount(
    0,
  );
  await page.getByRole('tab', { name: 'Coverage & sites' }).click();
  await expect(
    page.getByRole('table', { name: 'Coverage zones' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Changes' }).click();
  await expectNoHorizontalOverflow(page);

  const preview = page.getByRole('button', {
    name: 'Create coverage preview',
  });
  authorState.placementPreviewDelayMs = 800;
  await preview.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.placement-preview__loader')).toHaveCount(2);
  await page.screenshot({
    path: testInfo.outputPath('placement-loading.png'),
    fullPage: true,
  });
  await expect(page.getByText('Review exceptions')).toBeVisible();
  await expect(page.getByText('Plan needs review')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Review and apply' }),
  ).toBeFocused();
  const policyDetails = page.getByText(/separation or policy details/u);
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
  await page.screenshot({
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
  await page.screenshot({
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
    page.getByRole('button', { name: 'Create coverage preview' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create coverage preview' }).click();
  await expect(page.getByText('Plan needs review')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Review and apply' }),
  ).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('placement-mobile.png'),
    fullPage: true,
  });
  expect(consoleErrors).toEqual([]);
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
  await page.screenshot({
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
  await expect(saveBar.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  releaseSave();
  await expect(saveBar).toContainText('Not saved. Review the errors above.');
  await expect(page.getByLabel('Event title')).toHaveValue(
    'Updated campus event',
  );
  await page.screenshot({
    path: info.outputPath('save-failure.png'),
    fullPage: true,
  });
  await page.unroute(endpoint);
  await page.getByRole('button', { name: 'Save event' }).click();
  await expect(page.getByText('Event changes saved.')).toBeFocused();
  await page.screenshot({
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
) {
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
    if (path === '/author/trust-cases' && method === 'GET') {
      await json(route, {
        items: [
          {
            ...detail,
            activeRestrictionScopes: ['new_competitive_match_hold'],
            signalTypes: ['impossible_movement', 'opponent_concentration'],
          },
        ],
        page: 1,
        pageSize: 20,
        requestId: 'request-trust-cases',
        totalItems: 1,
        totalPages: 1,
      });
      return;
    }
    if (path === `/author/trust-cases/${detail.caseId}` && method === 'GET') {
      await json(route, { case: detail, requestId: 'request-trust-case' });
      return;
    }
    if (
      path === `/author/trust-cases/${detail.caseId}/evidence` &&
      method === 'GET'
    ) {
      await json(route, {
        items: detail.evidence,
        page: 1,
        pageSize: 20,
        requestId: 'request-trust-evidence',
        totalItems: detail.evidenceTotalItems,
        totalPages: 1,
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
        items: detail.history,
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
      const items = state.questions
        .filter((question) => question.status === 'in_review')
        .map((question) => ({
          canReview: question.submittedBy !== uuid('9', 1),
          challengeId: question.challengeId,
          entityId: question.questionId,
          entityType: 'question' as const,
          eventId:
            state.challenges.find(
              (challenge) => challenge.challengeId === question.challengeId,
            )?.eventId ?? null,
          label: question.prompt,
          status: 'in_review' as const,
          submittedAt: question.submittedAt,
          submittedBy: question.submittedBy,
          submittedByName: 'Review submitter',
          version: question.version,
        }));
      await json(route, {
        items,
        page: 1,
        pageSize: 20,
        requestId: 'request-review-queue',
        totalItems: items.length,
        totalPages: items.length === 0 ? 0 : 1,
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
  const toggle = page.getByRole('button', { name: /Navigation/ });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute('aria-expanded')) === 'false'
  )
    await toggle.click();
}

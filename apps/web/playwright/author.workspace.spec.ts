import { expect, test, type Page, type Route } from '@playwright/test';

import type {
  AuthorCard,
  AuthorCardInput,
  AuthorChallenge,
  AuthorEvent,
  AuthorEventInput,
  AuthorQuestion,
  AuthorQuestionInput,
} from '../src/api/author';

const API_ORIGIN = 'http://127.0.0.1:3999/api/v1';
const EVENT_A = '10000000-0000-4000-8000-000000000001';
const EVENT_B = '10000000-0000-4000-8000-000000000002';
const EVENT_C = '10000000-0000-4000-8000-000000000003';
const EVENT_NEW = '10000000-0000-4000-8000-000000000004';
const CHALLENGE_A = '20000000-0000-4000-8000-000000000001';
const QUESTION_A = '40000000-0000-4000-8000-000000000001';
const CARD_DRAFT = '50000000-0000-4000-8000-000000000001';
const CARD_CREATURE = '50000000-0000-4000-8000-000000000002';
const CARD_POWER = '50000000-0000-4000-8000-000000000003';

test('desktop Event workspace keeps discovery, detail, editing and readiness focused', async ({
  page,
}) => {
  const state = await installAuthorApi(page);
  const consoleErrors = monitorConsoleErrors(page);
  await page.setViewportSize({ height: 800, width: 1280 });
  await page.goto('/author/events');

  await expect(
    page.getByRole('heading', { name: 'Author console' }),
  ).toBeVisible();
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(
    page.getByRole('complementary', { name: 'Authored events' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Select an event' }),
  ).toBeVisible();
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

  await page.getByRole('link', { name: /Great Hall Discovery/u }).click();
  await expect(page).toHaveURL(`/author/events/${EVENT_A}`);
  await expect(page.locator('.author-record-view')).toBeFocused();
  await expect(
    page.getByRole('heading', { level: 3, name: 'Great Hall Discovery' }),
  ).toBeVisible();
  await expect(page.getByLabel('Event title')).toHaveCount(0);
  await expect(page.getByText('Configured · 75 m radius')).toBeVisible();

  await page.getByRole('link', { name: 'Edit event' }).click();
  await expect(page).toHaveURL(`/author/events/${EVENT_A}/edit`);
  await expect(page.getByLabel('Event title')).toHaveValue(
    'Great Hall Discovery',
  );
  await expect(
    page.locator('[data-map-provider^="deterministic-"]'),
  ).toBeVisible();
  await page.getByLabel('Event title').fill('Great Hall Discovery revised');

  await page.getByRole('link', { name: /MSL Open Day/u }).click();
  const dirtyDialog = page.getByRole('alertdialog', {
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

  await page.getByRole('link', { name: 'Challenge' }).click();
  await expect(page).toHaveURL(`/author/events/${EVENT_A}/challenge`);
  await expect(
    page.getByRole('heading', { name: 'Challenge readiness' }),
  ).toBeVisible();
  await expect(page.getByText('2 of 3 requirements ready.')).toBeVisible();
  await expect(page.getByText('Publication blocked')).toBeVisible();

  await page.getByRole('button', { name: 'Publish event' }).click();
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
    .getByRole('button', { name: 'Publish event' })
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
  await expect(
    page.getByRole('heading', { name: 'Challenge readiness' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Overview' }).click();
  await page.goBack();
  await expect(page).toHaveURL(`/author/events/${EVENT_A}/challenge`);
  await page.goForward();
  await expect(page).toHaveURL(`/author/events/${EVENT_A}`);

  const retireButton = page.getByRole('button', { name: 'Retire event' });
  await retireButton.click();
  const retirementDialog = page.getByRole('alertdialog', {
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
  const mobileNavigation = page
    .getByRole('navigation', { name: 'Player' })
    .last();
  await expect(catalogue).toBeVisible();
  await expect(recordView).toBeHidden();
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(mobileNavigation).toBeVisible();
  const navigationBox = await mobileNavigation.boundingBox();
  expect(navigationBox).not.toBeNull();
  expect(
    (navigationBox?.y ?? 0) + (navigationBox?.height ?? 0),
  ).toBeLessThanOrEqual(845);
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
  await page.getByRole('link', { name: 'Event overview' }).click();

  await page
    .getByRole('navigation', { name: 'Great Hall Discovery sections' })
    .getByRole('link', { name: 'Questions' })
    .click();
  await expect(page).toHaveURL(
    `/author/events/${EVENT_A}/challenges/${CHALLENGE_A}/questions`,
  );
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
  const questionDirtyDialog = page.getByRole('alertdialog', {
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

  await page
    .getByRole('navigation', { name: 'Author sections' })
    .getByRole('link', { name: 'Events' })
    .click();
  await expect(page.getByRole('alertdialog')).toContainText(
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

for (const viewport of [
  { height: 800, width: 1280 },
  { height: 900, width: 1600 },
]) {
  test(`wide Question workspace uses available width at ${viewport.width}px`, async ({
    page,
  }) => {
    await installAuthorApi(page);
    const consoleErrors = monitorConsoleErrors(page);
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
    await expect(detail).toBeVisible();
    await expect(
      detail.getByRole('heading', { name: 'Select a question' }),
    ).toBeVisible();

    const listMetrics = await questionWorkspaceMetrics(page);
    expectWideQuestionWorkspace(listMetrics);
    expect(listMetrics.welcomeWidth).not.toBeNull();
    expect(listMetrics.welcomeWidth ?? 0).toBeGreaterThan(320);
    expect(
      listMetrics.welcomeWidth ?? Number.POSITIVE_INFINITY,
    ).toBeLessThanOrEqual(listMetrics.detailWidth);
    expect(
      (listMetrics.welcomeWidth ?? 0) / listMetrics.detailWidth,
    ).toBeGreaterThan(0.4);
    await expectNoHorizontalOverflow(page);

    await page.getByRole('link', { name: /Where is the Great Hall/u }).click();
    await expect(page).toHaveURL(
      `/author/events/${EVENT_A}/challenges/${CHALLENGE_A}/questions/${QUESTION_A}`,
    );
    await expect(catalogue).toBeVisible();
    await expect(detail).toBeVisible();
    await expect(
      detail.getByRole('heading', { name: 'Where is the Great Hall?' }),
    ).toBeVisible();

    const detailMetrics = await questionWorkspaceMetrics(page);
    expectWideQuestionWorkspace(detailMetrics);
    expect(detailMetrics.updatedLineRects).toBe(1);
    expect(detailMetrics.updatedWidth ?? 0).toBeGreaterThan(120);
    expect(
      detailMetrics.updatedHeight ?? Number.POSITIVE_INFINITY,
    ).toBeLessThan(30);
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
      await page
        .getByRole('navigation', { name: 'Author sections' })
        .getByRole('link', { name: 'Events' })
        .click();
      await expect(page).toHaveURL('/author/events');
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
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

    await page
      .getByRole('navigation', { name: 'Author sections' })
      .getByRole('link', { name: 'Events' })
      .click();
    const dirtyDialog = page.getByRole('alertdialog', {
      name: 'Discard unsaved changes?',
    });
    await expect(dirtyDialog).toContainText('unsaved event draft changes');
    await dirtyDialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(latitude).toHaveValue('-26.191111');
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

  await page.getByRole('link', { name: 'Event overview' }).click();
  const dirtyDialog = page.getByRole('alertdialog', {
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

test('Card catalogue uses filtered master detail and concise real-card read-only views', async ({
  page,
}, testInfo) => {
  await installAuthorApi(page);
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
  await page.getByLabel('Lifecycle').selectOption('published');
  await page.getByLabel('Category').selectOption('creature');
  await page.getByLabel('Affinity').selectOption('grit');
  await page.getByLabel('Rarity').selectOption('rare');
  await expect(
    page.getByRole('link', { name: /Four Move Ibex/u }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Campus Owl/u })).toHaveCount(0);

  await page.getByRole('link', { name: /Four Move Ibex/u }).click();
  await expect(page).toHaveURL(`/author/cards/${CARD_CREATURE}`);
  await expect(page.locator('.author-record-view')).toBeFocused();
  await expect(
    page.locator('.author-card-detail__layout .collectible-card'),
  ).toBeVisible();
  await expect(page.getByText('Move 1')).toBeVisible();
  await expect(page.getByText('Move 4')).toBeVisible();
  await expect(page.getByLabel('Card name')).toHaveCount(0);
  const desktopPublishedCreatureHeight = await documentHeight(page);

  await page.getByRole('link', { name: 'Card catalogue' }).click();
  await page.getByLabel('Category').selectOption('power');
  await page.getByLabel('Affinity').selectOption('wit');
  await page.getByLabel('Rarity').selectOption('common');
  await page.getByRole('link', { name: /Archive Insight/u }).click();
  await expect(page).toHaveURL(`/author/cards/${CARD_POWER}`);
  await expect(page.locator('.collectible-card')).toContainText('Heal 30');
  await expect(page.getByLabel('Effect type')).toHaveCount(0);

  await page.getByRole('link', { name: 'Card catalogue' }).click();
  await page.getByLabel('Lifecycle').selectOption('draft');
  await page.getByLabel('Category').selectOption('creature');
  await page.getByLabel('Affinity').selectOption('wit');
  await page.getByLabel('Rarity').selectOption('common');
  await page.getByRole('link', { name: /Campus Owl/u }).click();
  await page.getByRole('link', { name: 'Edit card' }).click();
  await page.getByLabel('Card name').fill('Campus Owl revised');
  const cardCatalogue = page.getByRole('complementary', {
    name: 'Card definitions',
  });
  await cardCatalogue.getByLabel('Lifecycle').selectOption('all');
  await cardCatalogue.getByLabel('Category').selectOption('all');
  await cardCatalogue.getByLabel('Affinity').selectOption('all');
  await cardCatalogue.getByLabel('Rarity').selectOption('all');
  await page.getByRole('link', { name: /Four Move Ibex/u }).click();
  const dirtyDialog = page.getByRole('alertdialog', {
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

interface AuthorApiState {
  cards: AuthorCard[];
  challenges: AuthorChallenge[];
  eventDelayMs: number;
  events: AuthorEvent[];
  failEvents: boolean;
  questions: AuthorQuestion[];
  rejectEventPublication: boolean;
}

async function installAuthorApi(page: Page): Promise<AuthorApiState> {
  const state: AuthorApiState = {
    cards: authorCards(),
    challenges: authorChallenges(),
    eventDelayMs: 0,
    events: authorEvents(),
    failEvents: false,
    questions: authorQuestions(),
    rejectEventPublication: true,
  };

  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');

    if (path === '/auth/me') {
      await json(route, {
        id: uuid('9', 1),
        lifecycleStatus: 'active',
        playerName: 'author-e2e',
        playerNameSetupRequired: false,
        requestId: 'request-current-player',
        role: 'author',
      });
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
      /^\/author\/events\/([^/]+)\/(publish|retire)$/u,
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
      const event: AuthorEvent = {
        ...current,
        authoringStatus: action === 'publish' ? 'published' : 'retired',
        isPublished: action === 'publish',
        retiredAt: action === 'retire' ? '2026-08-29T12:00:00.000Z' : null,
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
      const challenge: AuthorChallenge = {
        ...challengeFixture(
          uuid('2', state.challenges.length + 1),
          challengeList[1]!,
        ),
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
      /^\/author\/challenges\/([^/]+)\/(publish|retire)$/u,
    );
    if (challengeLifecycle && method === 'POST') {
      const current = state.challenges.find(
        (challenge) => challenge.challengeId === challengeLifecycle[1],
      )!;
      const challenge: AuthorChallenge = {
        ...current,
        status: challengeLifecycle[2] === 'publish' ? 'published' : 'retired',
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
      /^\/author\/questions\/([^/]+)\/(publish|retire)$/u,
    );
    if (questionLifecycle && method === 'POST') {
      const current = state.questions.find(
        (question) => question.questionId === questionLifecycle[1],
      )!;
      const question: AuthorQuestion = {
        ...current,
        status: questionLifecycle[2] === 'publish' ? 'published' : 'retired',
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
      /^\/author\/cards\/([^/]+)\/(publish|retire)$/u,
    );
    if (cardLifecycle && method === 'POST') {
      const current = state.cards.find((card) => card.id === cardLifecycle[1])!;
      const card: AuthorCard = {
        ...current,
        authoringStatus:
          cardLifecycle[2] === 'publish' ? 'published' : 'retired',
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

function authorEvents(): AuthorEvent[] {
  return [
    eventFixture(EVENT_A, 'Great Hall Discovery', 'draft'),
    eventFixture(EVENT_B, 'MSL Open Day', 'published'),
    eventFixture(EVENT_C, 'Retired Sprint Demo', 'retired'),
  ];
}

function eventFixture(
  eventId: string,
  title: string,
  authoringStatus: AuthorEvent['authoringStatus'],
): AuthorEvent {
  return {
    authoringStatus,
    createdAt: '2026-08-01T08:00:00.000Z',
    description: `${title} author fixture.`,
    endsAt: '2026-09-30T16:00:00.000Z',
    eventId,
    isPublished: authoringStatus === 'published',
    latitude: -26.19205,
    longitude: 28.03038,
    radiusMetres: 75,
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
    acceptedChoiceId: choices[1]!.choiceId,
    acceptedChoicePosition: 2,
    challengeId: CHALLENGE_A,
    choices,
    createdAt: '2026-08-01T08:00:00.000Z',
    difficulty: position > 3 ? 2 : 1,
    explanation: 'Author-only fixture explanation.',
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
  const choices = input.choices.map((text, index) => ({
    choiceId: uuid('6', 100 + index),
    position: index + 1,
    text,
  }));
  return {
    acceptedChoiceId: choices[input.acceptedChoicePosition - 1]!.choiceId,
    acceptedChoicePosition: input.acceptedChoicePosition,
    challengeId,
    choices,
    createdAt: '2026-08-29T08:00:00.000Z',
    difficulty: input.difficulty,
    explanation: input.explanation,
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

interface QuestionWorkspaceMetrics {
  catalogueWidth: number;
  detailWidth: number;
  mainContentWidth: number;
  managementWidth: number;
  questionWorkspaceWidth: number;
  recordContentWidth: number;
  updatedHeight: number | null;
  updatedLineRects: number | null;
  updatedWidth: number | null;
  welcomeWidth: number | null;
}

async function questionWorkspaceMetrics(
  page: Page,
): Promise<QuestionWorkspaceMetrics> {
  return page.evaluate(() => {
    const element = (selector: string) => {
      const match = document.querySelector<HTMLElement>(selector);
      if (!match) throw new Error(`Missing layout element: ${selector}`);
      return match;
    };
    const width = (selector: string) =>
      element(selector).getBoundingClientRect().width;
    const contentWidth = (selector: string) => {
      const match = element(selector);
      const styles = getComputedStyle(match);
      return (
        match.getBoundingClientRect().width -
        Number.parseFloat(styles.paddingLeft) -
        Number.parseFloat(styles.paddingRight)
      );
    };
    const updated = document.querySelector<HTMLElement>(
      '.question-detail time',
    );
    const updatedRange = updated ? document.createRange() : null;
    if (updated && updatedRange) updatedRange.selectNodeContents(updated);

    return {
      catalogueWidth: width('.question-catalogue'),
      detailWidth: width('.question-record-view'),
      mainContentWidth: contentWidth('.main-content--author'),
      managementWidth: width('.author-management-view--questions'),
      questionWorkspaceWidth: width('.question-workspace'),
      recordContentWidth: contentWidth(
        '.author-management-view--questions > .author-record-view',
      ),
      updatedHeight: updated?.getBoundingClientRect().height ?? null,
      updatedLineRects: updatedRange
        ? [...updatedRange.getClientRects()].filter((rect) => rect.width > 0)
            .length
        : null,
      updatedWidth: updated?.getBoundingClientRect().width ?? null,
      welcomeWidth:
        document
          .querySelector<HTMLElement>('.question-record-view .author-welcome')
          ?.getBoundingClientRect().width ?? null,
    };
  });
}

function expectWideQuestionWorkspace(metrics: QuestionWorkspaceMetrics) {
  expect(metrics.managementWidth).toBeGreaterThanOrEqual(
    metrics.mainContentWidth - 2,
  );
  expect(metrics.questionWorkspaceWidth).toBeGreaterThanOrEqual(
    metrics.recordContentWidth - 2,
  );
  expect(metrics.catalogueWidth).toBeGreaterThanOrEqual(320);
  expect(metrics.catalogueWidth).toBeLessThanOrEqual(384);
  expect(metrics.detailWidth).toBeGreaterThanOrEqual(480);
  expect(metrics.detailWidth).toBeGreaterThan(metrics.catalogueWidth);
  expect(metrics.detailWidth / metrics.questionWorkspaceWidth).toBeGreaterThan(
    0.55,
  );
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

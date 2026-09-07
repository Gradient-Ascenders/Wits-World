import { expect, test, type Page, type Route } from '@playwright/test';

const API_BASE_URL = 'http://127.0.0.1:3999/api/v1';
const trailId = '17700000-0000-4000-8000-000000000001';
const eventIds = [
  '17700000-0000-4000-8000-000000000011',
  '17700000-0000-4000-8000-000000000012',
  '17700000-0000-4000-8000-000000000013',
];
const longTitle =
  'Senate House and the exceptionally long story of student leadership at Wits';

test('keeps trail and nearby discovery usable without the map at mobile and desktop widths', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  const runtimeErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  const routeState = await installRoutes(page);
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/explore');

  const sheetTrigger = page.getByRole('button', { name: /^Events/ });
  await sheetTrigger.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Campus events' }),
  ).toBeFocused();

  await page.getByRole('button', { name: 'Trails' }).click();
  await expect(page.getByRole('heading', { name: 'Trails' })).toBeFocused();
  await expect(
    page.locator('[data-deterministic-markers] [data-event-marker-id]'),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: /View trail.*Campus History Trail/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Campus History Trail' }),
  ).toBeFocused();
  await expect(page.getByText('Completed', { exact: true })).toBeVisible();
  await expect(page.getByText('Current', { exact: true })).toBeVisible();
  await expect(page.getByText('Locked', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Complete the previous stop to unlock.'),
  ).toBeVisible();
  const trailMarkers = page.locator(
    '[data-deterministic-markers] [data-event-marker-id]',
  );
  await expect(trailMarkers).toHaveCount(3);
  await expect(
    page.locator('[data-deterministic-markers] [data-trail-state="completed"]'),
  ).toBeDisabled();
  await expect(
    page.locator('[data-deterministic-markers] [data-trail-state="current"]'),
  ).toBeEnabled();
  await expect(
    page.locator('[data-deterministic-markers] [data-trail-state="locked"]'),
  ).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('trail-detail-mobile.png'),
  });

  const currentEventAction = page.getByRole('button', {
    name: new RegExp(`Open event.*${longTitle}`),
  });
  await currentEventAction.scrollIntoViewIfNeeded();
  await currentEventAction.focus();
  await expect(currentEventAction).toBeFocused();
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('trail-current-mobile.png'),
  });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: longTitle })).toBeFocused();
  await expect(page.getByText('Out of range', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Trail', exact: true }).click();
  await expect(currentEventAction).toBeFocused();
  await page.getByRole('button', { name: 'Trails', exact: true }).click();
  await page.getByRole('button', { name: 'Nearby' }).click();

  await expect(
    page.getByRole('list', { name: 'Nearby unvisited events' }),
  ).toBeVisible();
  await expect(page.getByText('~182 m away · Unvisited')).toBeVisible();
  await expect(
    page.locator('[data-deterministic-markers] [data-event-marker-id]'),
  ).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('nearby-mobile.png'),
  });

  await page.setViewportSize({ height: 800, width: 1280 });
  await page.getByRole('button', { name: 'Trails' }).click();
  await page
    .getByRole('button', { name: /View trail.*Campus History Trail/ })
    .click();
  await expectNoHorizontalOverflow(page);
  const desktopPanel = page.locator('.event-panel--trail-detail');
  const panelBounds = await desktopPanel.boundingBox();
  expect(panelBounds?.width).toBe(384);
  const mapBounds = await page.locator('.campus-map').boundingBox();
  expect(mapBounds!.x).toBeGreaterThanOrEqual(
    panelBounds!.x + panelBounds!.width,
  );
  await desktopPanel
    .getByText('Complete the previous stop to unlock.')
    .scrollIntoViewIfNeeded();
  await expect(
    desktopPanel.getByText('Complete the previous stop to unlock.'),
  ).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('trail-detail-desktop.png'),
  });

  routeState.showRetiredStop();
  await page.getByRole('button', { name: 'Trails', exact: true }).click();
  await page
    .getByRole('button', { name: /View trail.*Campus History Trail/ })
    .click();
  await expect(page.getByText('Retired', { exact: true })).toBeVisible();
  const retiredMarker = page.locator(
    '[data-deterministic-markers] [data-trail-state="retired"]',
  );
  await expect(retiredMarker).toBeDisabled();
  await expect(retiredMarker).toHaveAttribute(
    'aria-label',
    'Origins Centre, retired trail stop',
  );
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: testInfo.outputPath('trail-retired-desktop.png'),
  });

  expect(consoleErrors).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

async function installRoutes(page: Page) {
  let retiredStopVisible = false;
  await page.route(`${API_BASE_URL}/auth/me`, (route) =>
    json(route, {
      connectionStrategy: 'auth0',
      id: '17700000-0000-4000-8000-000000000099',
      lifecycleStatus: 'active',
      playerName: 'trail_browser_player',
      playerNameSetupRequired: false,
      requestId: 'trail-browser-player',
      role: 'player',
    }),
  );
  await page.route(`${API_BASE_URL}/events`, (route) =>
    json(route, {
      events: eventIds.map((eventId, index) => ({
        availability: 'active',
        description:
          index === 1
            ? 'A deliberately long description that remains readable and wraps without pushing actions beyond a narrow mobile viewport.'
            : `Campus trail stop ${index + 1}.`,
        endsAt: '2026-10-01T00:00:00.000Z',
        eventId,
        latitude: -26.19205 + index / 10_000,
        longitude: 28.03038 + index / 10_000,
        radiusMetres: 75,
        startsAt: '2026-09-01T00:00:00.000Z',
        title:
          index === 1
            ? longTitle
            : ['Great Hall', '', 'Origins Centre', 'Final Stop'][index],
      })),
      requestId: 'trail-browser-events',
    }),
  );
  await page.route(`${API_BASE_URL}/trails`, (route) =>
    json(route, {
      requestId: 'trail-browser-list',
      trails: [trailSummary()],
    }),
  );
  await page.route(`${API_BASE_URL}/trails/${trailId}`, (route) =>
    json(
      route,
      trailDetailFixture(page.viewportSize()?.width ?? 390, retiredStopVisible),
    ),
  );
  await page.route(`${API_BASE_URL}/events/nearby-unvisited`, (route) =>
    json(route, {
      events: [
        {
          description: 'The next active trail stop.',
          distanceMetres: 182.4,
          endsAt: '2026-10-01T00:00:00.000Z',
          eventId: eventIds[1],
          latitude: -26.19195,
          longitude: 28.03048,
          radiusMetres: 75,
          startsAt: '2026-09-01T00:00:00.000Z',
          title: longTitle,
          trailContexts: [
            {
              position: 2,
              title: 'Campus History Trail',
              totalSteps: 3,
              trailId,
            },
          ],
        },
      ],
      requestId: 'trail-browser-nearby',
    }),
  );
  await page.route(
    `${API_BASE_URL}/events/${eventIds[1]}/eligibility`,
    (route) =>
      json(route, {
        eventId: eventIds[1],
        reachable: false,
        requestId: 'trail-browser-eligibility',
        status: 'unreachable',
      }),
  );

  return {
    showRetiredStop() {
      retiredStopVisible = true;
    },
  };
}

function trailDetailFixture(viewportWidth: number, retiredStopVisible = false) {
  const trail = trailSummary();
  const steps = [
    trailStep(0, 'completed'),
    trailStep(1, 'current'),
    trailStep(2, 'locked'),
  ];

  if (retiredStopVisible) {
    steps[2] = trailStep(2, 'unavailable', 'event_retired');
  }

  if (viewportWidth >= 1024) {
    trail.description =
      'A three-stop campus trail for testing ordered discovery and progress.';
    steps[1] = {
      ...steps[1]!,
      description: 'The next stop in this ordered campus journey.',
      title: 'Library Lawns',
    };
  }

  return {
    requestId: 'trail-browser-detail',
    trail: { ...trail, steps },
  };
}

function trailSummary() {
  return {
    availability: 'active',
    completedStepCount: 1,
    currentStepPosition: 2,
    description:
      'Follow an ordered story from the Great Hall through the exceptionally long history of campus landmarks and student life.',
    endsAt: null,
    progressStatus: 'in_progress',
    publicationStatus: 'published',
    startsAt: null,
    title: 'Campus History Trail',
    totalSteps: 3,
    trailId,
  };
}

function trailStep(
  index: number,
  state: 'completed' | 'current' | 'locked' | 'unavailable',
  unavailableReason: null | 'event_retired' = null,
) {
  return {
    completedAt: state === 'completed' ? '2026-09-04T10:00:00.000Z' : null,
    description: `Campus trail stop ${index + 1}.`,
    endsAt: '2026-10-01T00:00:00.000Z',
    eventId: eventIds[index],
    latitude: -26.19205 + index / 10_000,
    longitude: 28.03038 + index / 10_000,
    position: index + 1,
    radiusMetres: 75,
    startsAt: '2026-09-01T00:00:00.000Z',
    state,
    title:
      index === 1
        ? longTitle
        : ['Great Hall', '', 'Origins Centre', 'Final Stop'][index],
    unavailableReason,
  };
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function json(route: Route, body: object, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

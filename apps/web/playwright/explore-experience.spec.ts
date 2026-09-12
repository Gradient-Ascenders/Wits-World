import { expect, test, type Page } from '@playwright/test';

const eventIds = [
  '17700000-0000-4000-8000-000000000010',
  '17700000-0000-4000-8000-000000000011',
  '17700000-0000-4000-8000-000000000012',
];
const longTitle = 'Senate House and the story of student leadership at Wits';

async function installEvents(
  page: Page,
  mode: 'ready' | 'empty' | 'error' = 'ready',
  eligibility = 'reachable',
) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: object = { requestId: 'explore-browser' };
    if (path.endsWith('/auth/me')) {
      body = {
        connectionStrategy: 'auth0',
        id: '17700000-0000-4000-8000-000000000099',
        lifecycleStatus: 'active',
        playerName: 'explore_player',
        playerNameSetupRequired: false,
        requestId: 'explore-browser',
        role: 'player',
      };
    } else if (path.endsWith('/events')) {
      if (mode === 'error') {
        await route.fulfill({ status: 503, json: { message: 'Unavailable' } });
        return;
      }
      body = {
        requestId: 'explore-browser',
        events:
          mode === 'empty'
            ? []
            : ['Great Hall', longTitle, 'Origins Centre'].map(
                (title, index) => ({
                  eventId: eventIds[index],
                  title,
                  availability: index === 2 ? 'ended' : 'active',
                  description:
                    'Discover the campus stories behind this landmark. This full description remains available without truncation.',
                  latitude: -26.19205 + index / 10000,
                  longitude: 28.03038 + index / 10000,
                  radiusMetres: 75,
                  startsAt: '2026-09-01T00:00:00.000Z',
                  endsAt: '2026-10-01T00:00:00.000Z',
                }),
              ),
      };
    } else if (path.endsWith('/eligibility')) {
      body = {
        eventId: path.split('/').at(-2),
        reachable: eligibility === 'retry' ? null : eligibility === 'reachable',
        status: eligibility,
        ...(eligibility === 'retry' ? { reason: 'location_accuracy' } : {}),
        requestId: 'explore-browser',
      };
    } else if (path.endsWith('/events/nearby-unvisited')) {
      body = { events: [], requestId: 'explore-browser' };
    }
    await route.fulfill({ json: body });
  });
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test('map and event loading preserve discovery space', async ({
  page,
}, info) => {
  await installEvents(page);
  let release: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/events', async (route) => {
    await pending;
    await route.fulfill({ json: { events: [], requestId: 'explore-browser' } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explore?map-loading', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Loading the campus map…')).toBeVisible();
  await expect(page.getByText('Loading published events…')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Events —/ })).toBeInViewport({
    ratio: 1,
  });
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('mobile-loading.png'),
  });
  release();
});

test('mobile sheet stays above navigation, supports selection, disclosure, gestures and keyboard return', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installEvents(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explore');
  const trigger = page.getByRole('button', { name: /^Events —/ });
  await expect(trigger).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByRole('complementary', { name: 'Offline play' }),
  ).toHaveCount(0);
  const triggerBounds = await trigger.boundingBox();
  const navigationBounds = await page
    .locator('.primary-navigation--mobile')
    .boundingBox();
  expect(triggerBounds!.y + triggerBounds!.height).toBeLessThanOrEqual(
    navigationBounds!.y + 1,
  );
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('mobile-collapsed.png'),
  });
  await page.getByRole('button', { name: /Select Great Hall/ }).click();
  await expect(page.getByRole('heading', { name: 'Great Hall' })).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Start challenge for Great Hall' }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByRole('button', { name: 'Start challenge for Great Hall' }),
  ).toHaveCSS('background-color', 'rgb(23, 74, 153)');
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('mobile-selected.png'),
  });
  await page.getByRole('button', { name: 'Next event', exact: true }).click();
  await expect(page.getByRole('heading', { name: longTitle })).toBeFocused();
  await page.getByRole('button', { name: 'Expand event sheet fully' }).click();
  await expect(page.locator('.event-panel')).toHaveAttribute(
    'data-sheet-snap',
    'expanded',
  );
  await page.getByText('About this event', { exact: true }).click();
  await expect(page.getByText('75 m radius')).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('mobile-expanded-long-title.png'),
  });
  const handle = page.getByRole('button', { name: 'Lower event sheet' });
  const bounds = await handle.boundingBox();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + 200, {
    steps: 15,
  });
  await page.mouse.up();
  await expect(page.locator('.event-panel')).not.toHaveAttribute(
    'data-sheet-snap',
    'expanded',
  );
  if (await trigger.isVisible()) await trigger.click();
  await page.getByRole('button', { name: 'All events', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Search campus events' })
    .fill('no matching event');
  await expect(page.getByText('No events match these filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page
    .getByRole('combobox', { name: 'Filter events by status' })
    .selectOption('ended');
  await page
    .getByRole('button', { name: /View on map.*Origins Centre/ })
    .click();
  await expect(page.getByText('This event has ended.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Start challenge/ }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: /Selected.*Origins Centre/ }),
  ).toBeFocused();
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('tablet bounds the sheet and desktop reserves map space for discovery', async ({
  page,
}, info) => {
  await installEvents(page);
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/explore');
  await page.getByRole('button', { name: /^Events —/ }).click();
  expect(
    (await page.locator('.event-panel').boundingBox())!.width,
  ).toBeLessThan(460);
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('tablet-list.png'),
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Campus events' }),
  ).toBeVisible();
  const panel = await page.locator('.event-panel').boundingBox();
  const map = await page.locator('.campus-map').boundingBox();
  expect(map!.x).toBeGreaterThanOrEqual(panel!.x + panel!.width);
  expect(map!.width).toBeGreaterThan(1000);
  await page.getByRole('button', { name: /View on map.*Great Hall/ }).click();
  await page.getByText('About this event', { exact: true }).click();
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('desktop-selected.png'),
  });
  await noOverflow(page);
});

test('map failure retains event discovery and a retry action', async ({
  page,
}, info) => {
  await installEvents(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explore?map-failure');
  await expect(page.getByText('The map could not load.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry map' }).click();
  await expect(page.getByText('The map could not load.')).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('mobile-map-failure.png'),
  });
  await page.getByRole('button', { name: /^Events —/ }).click();
  await page.getByRole('button', { name: /View on map.*Great Hall/ }).click();
  await expect(page.getByRole('heading', { name: 'Great Hall' })).toBeVisible();
});

for (const mode of ['empty', 'error'] as const) {
  test(`${mode} events have an explicit mobile discovery state`, async ({
    page,
  }, info) => {
    await installEvents(page, mode);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/explore');
    await page.getByRole('button', { name: /^Events —/ }).click();
    await expect(
      page.getByText(
        mode === 'empty'
          ? 'No published events are available.'
          : 'Events are unavailable right now.',
      ),
    ).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`mobile-events-${mode}.png`),
    });
  });
}

test('uncertain reported location and empty nearby results explain the next step', async ({
  page,
}, info) => {
  await installEvents(page, 'ready', 'retry');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explore');
  await page.getByRole('button', { name: /Select Great Hall/ }).click();
  await expect(page.getByText('Location accuracy is too low.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Start challenge/ }),
  ).toHaveCount(0);
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('mobile-location-uncertain.png'),
  });
  await page.getByRole('button', { name: 'All events', exact: true }).click();
  await page.getByRole('button', { name: 'Nearby', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Refresh nearby' }),
  ).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('mobile-nearby-empty.png'),
  });
});

for (const state of ['prompt', 'denied', 'unavailable', 'locating'] as const) {
  test(`location ${state} keeps mobile discovery usable`, async ({
    page,
  }, info) => {
    await installEvents(page);
    await page.addInitScript((state) => {
      Object.defineProperty(navigator, 'permissions', {
        value: {
          query: async () => ({
            state: state === 'prompt' || state === 'denied' ? state : 'granted',
          }),
        },
      });
      Object.defineProperty(navigator, 'geolocation', {
        value: {
          getCurrentPosition: () => undefined,
          clearWatch: () => undefined,
          watchPosition: (
            _success: unknown,
            error: (value: { code: number }) => void,
          ) => {
            if (state === 'unavailable')
              queueMicrotask(() => error({ code: 2 }));
            return 1;
          },
        },
      });
    }, state);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/explore');
    const label =
      state === 'prompt'
        ? 'Enable live location'
        : state === 'denied'
          ? 'Location access disabled'
          : state === 'unavailable'
            ? 'Retry live location'
            : 'Finding reported location';
    await expect(
      page.getByRole('button', { name: label, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`mobile-location-${state}.png`),
    });
    await page.getByRole('button', { name: /^Events —/ }).click();
    await expect(
      page.getByRole('list', { name: 'Campus events' }),
    ).toBeVisible();
    await noOverflow(page);
  });
}

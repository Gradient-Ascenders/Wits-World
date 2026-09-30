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

test('one discovery navigation stays readable with narrow screens and larger text', async ({
  page,
}, info) => {
  await installEvents(page);
  for (const [width, scale] of [
    [320, '100'],
    [390, '150'],
    [1440, '150'],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((scale) => {
      localStorage.setItem(
        'wits-world.accessibility-preferences.v1',
        JSON.stringify({ scale }),
      );
    }, scale);
    await page.goto('/explore');
    await expect(page.locator('.exploration-view')).toBeVisible();
    const trigger = page.getByRole('button', { name: /^Events —/ });
    if (await trigger.isVisible()) await trigger.click();
    const navigation = page.getByRole('navigation', { name: 'Explore view' });
    await expect(navigation.getByRole('button')).toHaveText([
      'Events',
      'Nearby',
      'Trails',
      'Territories',
    ]);
    const crowded = await navigation
      .getByRole('button')
      .evaluateAll((buttons) =>
        buttons
          .filter((button) => button.scrollWidth > button.clientWidth)
          .map((button) => button.textContent),
      );
    expect(crowded).toEqual([]);
    await noOverflow(page);
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`explore-tabs-${width}-${scale}.png`),
    });
    await navigation
      .getByRole('button', { name: 'Nearby', exact: true })
      .click();
    await expect(
      navigation.getByRole('button', { name: 'Nearby', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await navigation
      .getByRole('button', { name: 'Events', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Campus events' }),
    ).toBeFocused();
  }
});

test('keeps the read aloud icon clear of map controls and the collapsible header', async ({
  page,
}, info) => {
  await installEvents(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('wits-world.accessibility-preferences.v1')) {
      localStorage.setItem(
        'wits-world.accessibility-preferences.v1',
        JSON.stringify({ speech: true, scale: '150' }),
      );
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explore');
  await expect(page.locator('.exploration-view')).toBeVisible();

  const header = page.locator('.site-header--explore');
  const reader = page.getByRole('button', { name: 'Read page' });
  const detail = page.getByRole('button', { name: 'Detailed 3D map' });
  await expect(reader).toBeVisible();
  await expect(reader.locator('svg')).toHaveCount(1);
  await expect(detail).toBeVisible();
  await expect(header.locator('.map-detail-toggle')).toHaveCount(0);
  await expect(
    page.locator('.exploration-view .map-detail-toggle'),
  ).toHaveCount(1);
  const expandedHeader = await header.boundingBox();
  const expandedDetail = await detail.boundingBox();
  expect(expandedHeader && expandedDetail).toBeTruthy();
  expect(expandedDetail!.y).toBeGreaterThanOrEqual(
    expandedHeader!.y + expandedHeader!.height,
  );
  await detail.click();
  await expect(detail).toHaveAttribute('aria-pressed', 'true');
  await detail.click();
  await expect(detail).toHaveAttribute('aria-pressed', 'false');
  await expect(header.locator('.read-page-control')).toHaveCount(0);
  const mobileReader = await reader.boundingBox();
  const mobileLocation = await page.locator('.location-control').boundingBox();
  expect(mobileReader && mobileLocation).toBeTruthy();
  expect(mobileReader!.y + mobileReader!.height).toBeLessThanOrEqual(
    mobileLocation!.y,
  );
  await noOverflow(page);
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('explore-header-controls-expanded.png'),
  });

  await page
    .getByRole('button', { name: 'Hide header for more map space' })
    .click();
  await expect(page.locator('.explore-header-drawer')).toHaveAttribute(
    'data-collapsed',
    'true',
  );
  await expect(header).toHaveAttribute('aria-hidden', 'true');
  await expect(header).toHaveAttribute('inert', '');
  await expect(reader).toBeVisible();
  await expect(detail).toBeVisible();
  const cornerGap = await detail.evaluate((button) =>
    Number.parseFloat(getComputedStyle(button).right),
  );
  await expect
    .poll(async () => (await detail.boundingBox())?.y ?? Infinity)
    .toBeLessThanOrEqual(cornerGap + 1);
  await detail.click();
  await expect(detail).toHaveAttribute('aria-pressed', 'true');
  await detail.click();
  await expect(detail).toHaveAttribute('aria-pressed', 'false');
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('explore-header-controls-collapsed.png'),
  });

  await page
    .getByRole('button', { name: 'Show header and account menu' })
    .click();
  await expect(reader).toBeVisible();
  await expect(detail).toBeVisible();
  await expect
    .poll(async () => (await detail.boundingBox())?.y ?? 0)
    .toBeGreaterThanOrEqual(expandedHeader!.y + expandedHeader!.height);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(reader).toBeVisible();
  await expect(detail).toHaveCount(0);
  const desktopReader = await reader.boundingBox();
  const desktopLocation = await page.locator('.location-control').boundingBox();
  expect(desktopReader && desktopLocation).toBeTruthy();
  expect(desktopReader!.y + desktopReader!.height).toBeLessThanOrEqual(
    desktopLocation!.y,
  );
  await noOverflow(page);
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('explore-header-controls-desktop.png'),
  });

  await page.evaluate(() => {
    localStorage.setItem(
      'wits-world.accessibility-preferences.v1',
      JSON.stringify({ speech: true, scale: '100' }),
    );
  });
  await page.reload();
  await expect(page.locator('.exploration-view')).toBeVisible();
  await expect(reader).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('explore-header-controls-desktop-default-size.png'),
  });
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.locator('.exploration-view')).toBeVisible();
  await expect(reader).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('explore-header-controls-tablet-default-size.png'),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.exploration-view')).toBeVisible();
  await expect(detail).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('explore-header-controls-mobile-default-size.png'),
  });
  await page.setViewportSize({ width: 500, height: 844 });
  await expect(detail).toBeVisible();
  const screenshotHeader = await header.boundingBox();
  const screenshotDetail = await detail.boundingBox();
  expect(screenshotHeader && screenshotDetail).toBeTruthy();
  expect(screenshotDetail!.y).toBeGreaterThanOrEqual(
    screenshotHeader!.y + screenshotHeader!.height,
  );
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('explore-header-controls-500-expanded.png'),
  });
  await page
    .getByRole('button', { name: 'Hide header for more map space' })
    .click();
  await expect(detail).toBeVisible();
  await expect
    .poll(async () => (await detail.boundingBox())?.y ?? Infinity)
    .toBeLessThanOrEqual(cornerGap + 1);
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('explore-header-controls-500-collapsed.png'),
  });

  const showHeader = page.getByRole('button', {
    name: 'Show header and account menu',
  });
  const handle = await showHeader.boundingBox();
  expect(handle).toBeTruthy();
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    handle!.y + handle!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    handle!.y + handle!.height / 2 + 30,
    { steps: 5 },
  );
  await expect
    .poll(async () => (await detail.boundingBox())?.y ?? 0)
    .toBeGreaterThan(cornerGap + 20);
  await expect(detail).toHaveCSS('transition-duration', '0s');
  await page.mouse.up();
});

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
  await expect(page.getByText('Loading events…')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Events —/ })).toBeInViewport({
    ratio: 1,
  });
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('mobile-loading.png'),
  });
  release();
  await page.getByRole('button', { name: /^Events —/ }).click();
  await expect(page.getByText('No events available.')).toBeVisible();

  let releaseTrails: () => void = () => undefined;
  const pendingTrails = new Promise<void>((resolve) => {
    releaseTrails = resolve;
  });
  await page.route('**/api/v1/trails', async (route) => {
    await pendingTrails;
    await route.fulfill({ json: { trails: [], requestId: 'explore-browser' } });
  });
  await page.getByRole('button', { name: 'Trails', exact: true }).click();
  const trailLoading = page
    .getByRole('status')
    .filter({ hasText: 'Loading trails…' });
  await expect(trailLoading).toHaveClass(/exploration-loading-panel/);
  await expect(trailLoading).toHaveAttribute('aria-busy', 'true');
  await expect(trailLoading.locator('.quest-marker')).toHaveCSS(
    'width',
    '36px',
  );
  await expect(trailLoading).toHaveCSS('border-top-width', '1px');
  const pin = trailLoading.locator('.quest-marker svg');
  await expect(pin).toHaveCSS('animation-name', 'quest-marker-glow');
  await expect(pin.locator('.quest-marker__base')).toHaveCSS(
    'stroke-dasharray',
    'none',
  );
  await pin.evaluate((element) => {
    const animation = element.getAnimations()[0]!;
    animation.pause();
    animation.currentTime = 900;
  });
  await page.screenshot({
    animations: 'allow',
    path: info.outputPath('mobile-loader-glow-peak.png'),
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(pin).toHaveCSS('animation-name', 'none');
  await page.evaluate(() => {
    document.documentElement.dataset.motion = 'full';
  });
  await expect(pin).toHaveCSS('animation-name', 'quest-marker-glow');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    document.documentElement.dataset.motion = 'reduce';
  });
  await expect(pin).toHaveCSS('animation-name', 'none');
  await page.evaluate(() => {
    document.documentElement.dataset.motion = 'system';
  });
  await expect(pin).toHaveCSS('animation-name', 'quest-marker-glow');
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('mobile-trails-loading.png'),
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(trailLoading).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('desktop-trails-loading.png'),
  });
  releaseTrails();
  await expect(page.getByText('No trails available.')).toBeVisible();
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
        mode === 'empty' ? 'No events available.' : 'Events could not load.',
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
            : 'Finding your location';
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

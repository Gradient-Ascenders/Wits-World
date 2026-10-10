import { captureScreenshot } from './visual-capture';
import { selectOption } from './select-option';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const eventIds = [
  '17700000-0000-4000-8000-000000000010',
  '17700000-0000-4000-8000-000000000011',
  '17700000-0000-4000-8000-000000000012',
];
const longTitle = 'Senate House and the story of student leadership at Wits';

async function installEvents(
  page: Page | BrowserContext,
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

// Use the full browser only for native Ctrl/Cmd-click tab creation.
const nativeTabTest = test.extend({ channel: 'chromium' });

for (const entry of [
  'Explore campus from Great Hall',
  'Find more challenges',
]) {
  for (const activation of ['mouse', 'touch', 'Enter'] as const) {
    test(`homepage ${entry} preserves the runtime with ${activation} navigation`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        baseURL: 'http://127.0.0.1:5182',
        viewport: { width: 412, height: 915 },
        hasTouch: true,
        isMobile: true,
      });
      try {
        const page = await context.newPage();
        await installEvents(page);
        await page.goto('/');
        const link = page.getByRole('link', { name: entry, exact: true });
        await expect(link).toHaveAttribute('href', '/explore', {
          timeout: 30_000,
        });
        await link.scrollIntoViewIfNeeded();
        await link.focus();
        await expect(link).toBeFocused();
        const before = await page.evaluate(() => {
          Object.assign(window, { homepageRuntime: {} });
          return performance.timeOrigin;
        });
        let documents = 0;
        let events = 0;
        let identities = 0;
        page.on('request', (request) => {
          if (
            request.isNavigationRequest() &&
            request.frame() === page.mainFrame()
          )
            documents++;
          const path = new URL(request.url()).pathname;
          if (request.method() === 'GET' && path.endsWith('/events')) events++;
          if (path.endsWith('/auth/me')) identities++;
        });
        if (activation === 'Enter') await page.keyboard.press('Enter');
        else if (activation === 'touch') await link.tap();
        else await link.click();
        await expect(page).toHaveURL(/\/explore$/);
        await expect(page.locator('#campus-map-title')).toBeVisible();
        await expect(page.getByRole('main')).toBeFocused();
        await expect(page.locator('.campus-map__canvas')).toHaveCount(1);
        await expect(page.locator('.event-marker')).toHaveCount(3);
        expect(await page.evaluate(() => performance.timeOrigin)).toBe(before);
        expect(await page.evaluate(() => 'homepageRuntime' in window)).toBe(
          true,
        );
        expect(documents).toBe(0);
        expect(events).toBe(1);
        expect(identities).toBe(0);
        await page.goBack();
        await expect(link).toBeVisible();
        await page.goForward();
        await expect(page.locator('#campus-map-title')).toBeVisible();
        expect(await page.evaluate(() => performance.timeOrigin)).toBe(before);
        expect(documents).toBe(0);
      } finally {
        await context.close();
      }
    });
  }

  nativeTabTest(
    `homepage ${entry} retains modified-click new-tab semantics`,
    async ({ page, context }) => {
      await installEvents(context);
      await page.goto('/');
      const link = page.getByRole('link', { name: entry, exact: true });
      await expect(link).toHaveAttribute('href', '/explore', {
        timeout: 30_000,
      });
      await link.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => performance.timeOrigin);
      const [popup] = await Promise.all([
        context.waitForEvent('page'),
        link.click({ modifiers: ['ControlOrMeta'] }),
      ]);
      try {
        await popup.bringToFront();
        await expect(popup).toHaveURL(/\/explore$/);
        await expect(popup.locator('#campus-map-title')).toBeVisible();
        await expect(popup.locator('.campus-map__canvas')).toHaveCount(1);
        await expect(popup.locator('.event-marker')).toHaveCount(3);
        await expect(page).toHaveURL(/\/$/);
        expect(await page.evaluate(() => performance.timeOrigin)).toBe(before);
      } finally {
        await popup.close();
      }
    },
  );
}

test('direct Explore and AppShell Explore navigation retain discovery', async ({
  page,
}) => {
  await installEvents(page);
  await page.goto('/explore');
  await expect(page.locator('#campus-map-title')).toBeVisible();
  await expect(page.locator('.event-marker')).toHaveCount(3);
  const before = await page.evaluate(() => performance.timeOrigin);
  await page
    .getByRole('link', { name: 'Wits World home', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('link', { name: 'Explore campus from Great Hall' }),
  ).toBeVisible();
  await page
    .locator('.primary-navigation:visible')
    .getByRole('link', { name: 'Explore', exact: true })
    .click();
  await expect(page.locator('#campus-map-title')).toBeVisible();
  await expect(page.locator('.event-marker')).toHaveCount(3);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(before);
});

test('event schedule times stay in Johannesburg on a device in another timezone', async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    timezoneId: 'America/Los_Angeles',
    locale: 'en-ZA',
    viewport: { width: 1440, height: 900 },
  });
  try {
    const page = await context.newPage();
    await installEvents(page);
    await page.goto('/explore');
    await expect(
      page.getByRole('heading', { name: 'Campus events' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /View on map.*Great Hall/ }).click();
    await page.getByText('About this event', { exact: true }).click();
    const time = page.locator('.selected-event__facts dd').last();
    await expect(time).toHaveText(/1 Oct.*02:00/);
    await captureScreenshot(test.info(), page, {
      animations: 'disabled',
      path: info.outputPath('johannesburg-desktop.png'),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const trigger = page.getByRole('button', { name: /^Events —/ });
    if (await trigger.isVisible()) await trigger.click();
    await expect(time).toBeVisible();
    await expect(time).toHaveText(/1 Oct.*02:00/);
    await captureScreenshot(test.info(), page, {
      animations: 'disabled',
      path: info.outputPath('johannesburg-mobile.png'),
    });
  } finally {
    await context.close();
  }
});

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
    await captureScreenshot(test.info(), page, {
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
  await captureScreenshot(test.info(), page, {
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
  await captureScreenshot(test.info(), page, {
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
  await captureScreenshot(test.info(), page, {
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
  await captureScreenshot(test.info(), page, {
    animations: 'disabled',
    path: info.outputPath('explore-header-controls-desktop-default-size.png'),
  });
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.locator('.exploration-view')).toBeVisible();
  await expect(reader).toBeVisible();
  await noOverflow(page);
  await captureScreenshot(test.info(), page, {
    animations: 'disabled',
    path: info.outputPath('explore-header-controls-tablet-default-size.png'),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.exploration-view')).toBeVisible();
  await expect(detail).toBeVisible();
  await noOverflow(page);
  await captureScreenshot(test.info(), page, {
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
  await captureScreenshot(test.info(), page, {
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
  await captureScreenshot(test.info(), page, {
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
  const mapLoading = page
    .locator('.map-state.exploration-loading-panel')
    .filter({ hasText: 'Loading map…' });
  await expect(page.locator('.campus-map__canvas')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await expect(mapLoading.locator('[role="status"]')).toHaveClass(/sr-only/);
  await expect(
    page.getByRole('heading', { name: 'Opening Explore…' }),
  ).toBeVisible();
  await expect(page.locator('.page-loading-state')).toHaveCount(1);
  await captureScreenshot(test.info(), page, {
    animations: 'disabled',
    path: info.outputPath('mobile-loading.png'),
  });
  release();
  await expect(page.locator('.page-loading-state')).toHaveCount(0);
  const eventsTrigger = page.getByRole('button', { name: /^Events —/ });
  await expect(eventsTrigger).toBeInViewport({ ratio: 1 });
  await eventsTrigger.click();
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
    .locator('.exploration-loading-panel')
    .filter({ hasText: 'Loading trails…' });
  await expect(
    trailLoading.locator('.region-loading-state__placeholder'),
  ).toBeVisible();
  await expect(trailLoading.locator('[role="status"]')).toHaveClass(/sr-only/);
  await captureScreenshot(test.info(), page, {
    animations: 'disabled',
    path: info.outputPath('mobile-trails-loading.png'),
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(trailLoading).toBeVisible();
  await captureScreenshot(test.info(), page, {
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
  await captureScreenshot(test.info(), page, {
    animations: 'disabled',
    path: info.outputPath('mobile-collapsed.png'),
  });
  await page.getByRole('button', { name: /Select Great Hall/ }).click();
  await expect(page.getByRole('heading', { name: 'Great Hall' })).toBeFocused();
  const mobileCollapse = page.getByRole('button', {
    name: 'Collapse event details',
  });
  await expect(mobileCollapse.locator('.event-panel__rail-icon')).toBeHidden();
  await expect(
    mobileCollapse.locator('.event-panel__collapse-chevron'),
  ).toHaveCSS('width', '20px');
  await expect(
    mobileCollapse.locator('.event-panel__collapse-chevron'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start challenge for Great Hall' }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByRole('button', { name: 'Start challenge for Great Hall' }),
  ).toHaveCSS('background-color', 'rgb(23, 74, 153)');
  await captureScreenshot(test.info(), page, {
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
  await captureScreenshot(test.info(), page, {
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
  await selectOption(
    page.getByLabel('Filter events by status', { exact: true }),
    'ended',
  );
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
  await captureScreenshot(test.info(), page, {
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
  const mapControls = page.locator('.mapboxgl-ctrl-group button');
  expect(await mapControls.count()).toBeGreaterThan(0);
  for (const control of await mapControls.all()) {
    await control.hover();
    await expect(control).toHaveCSS('background-color', 'rgb(17, 36, 64)');
  }
  await captureScreenshot(test.info(), page, {
    animations: 'disabled',
    path: info.outputPath('desktop-map-control-hover.png'),
  });
  await page.getByRole('button', { name: /View on map.*Great Hall/ }).click();
  await page.getByText('About this event', { exact: true }).click();
  const desktopCollapse = page.getByRole('button', {
    name: 'Collapse event details',
  });
  await expect(
    desktopCollapse.locator('.event-panel__rail-icon'),
  ).toBeVisible();
  await expect(
    desktopCollapse.locator('.event-panel__collapse-chevron'),
  ).toBeHidden();
  await expect(desktopCollapse).toHaveAttribute('aria-expanded', 'true');
  await captureScreenshot(test.info(), page, {
    animations: 'disabled',
    path: info.outputPath('desktop-selected.png'),
  });
  await page.getByRole('button', { name: 'Collapse event details' }).click();
  const rail = page.locator('.event-panel--peek');
  await expect(rail).toBeVisible();
  const railBounds = await rail.boundingBox();
  expect(railBounds!.width).toBeCloseTo(72, 0);
  expect(railBounds!.height).toBeGreaterThan(700);
  const layersBounds = await page
    .getByRole('button', { name: 'Map layers', exact: true })
    .boundingBox();
  expect(layersBounds!.x + layersBounds!.width / 2).toBeCloseTo(
    railBounds!.x + railBounds!.width / 2,
    0,
  );
  const mapBounds = await page.locator('.campus-map').boundingBox();
  expect(mapBounds!.x).toBeGreaterThanOrEqual(
    railBounds!.x + railBounds!.width,
  );
  const reopen = page.getByRole('button', {
    name: 'Events — Great Hall selected, open details',
  });
  await expect(reopen).toHaveAttribute(
    'aria-controls',
    'explore-event-sheet-content',
  );
  await expect(reopen.locator('.event-panel__rail-icon')).toBeVisible();
  await expect(reopen.locator('.event-panel__peek-copy')).toBeHidden();
  const shortcuts = page.getByRole('navigation', { name: 'Explore shortcuts' });
  await expect(shortcuts.getByRole('button')).toHaveCount(4);
  const railIcons = [
    reopen.locator('.event-panel__rail-icon'),
    ...(await shortcuts.locator('svg').all()),
    page
      .getByRole('button', { name: 'Map layers', exact: true })
      .locator('svg'),
  ];
  for (const icon of railIcons) {
    await expect(icon).toHaveCSS('width', '28px');
    await expect(icon).toHaveCSS('height', '28px');
  }
  await expect(
    shortcuts.getByRole('button', { name: 'Open Events' }),
  ).toHaveAttribute('aria-current', 'page');
  await reopen.focus();
  await captureScreenshot(test.info(), page, {
    animations: 'disabled',
    path: info.outputPath('desktop-collapsed-rail.png'),
  });
  await reopen.press('Enter');
  await expect(page.getByRole('heading', { name: 'Great Hall' })).toBeFocused();
  await noOverflow(page);
});

test('desktop rail shortcuts open each section with keyboard focus and active feedback', async ({
  page,
}, info) => {
  await installEvents(page);
  await page.route('**/api/v1/trails', (route) =>
    route.fulfill({ json: { trails: [], requestId: 'rail-trails' } }),
  );
  await page.route('**/api/v1/territory/zones', (route) =>
    route.fulfill({ json: { zones: [], requestId: 'rail-territories' } }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/explore');
  await page
    .getByRole('button', { name: 'Collapse events', exact: true })
    .click();
  const shortcuts = page.getByRole('navigation', { name: 'Explore shortcuts' });
  for (const [label, heading, collapse] of [
    ['Nearby', 'Nearby events', 'Collapse nearby discovery'],
    ['Trails', 'Trails', 'Collapse trails'],
    ['Territories', 'Campus territories', 'Collapse territories'],
    ['Events', 'Campus events', 'Collapse events'],
  ] as const) {
    const shortcut = shortcuts.getByRole('button', { name: `Open ${label}` });
    await expect(shortcut).toHaveAttribute('title', label);
    const bounds = await shortcut.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await shortcut.focus();
    await shortcut.press('Enter');
    await expect(
      page.getByRole('heading', { name: heading, exact: true }),
    ).toBeFocused();
    await page.getByRole('button', { name: collapse, exact: true }).click();
    await expect(shortcut).toHaveAttribute('aria-current', 'page');
    await expect(shortcut).toHaveCSS('color', 'rgb(224, 196, 108)');
  }
  await captureScreenshot(test.info(), page, {
    animations: 'disabled',
    path: info.outputPath('desktop-rail-shortcuts.png'),
  });
  await noOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(shortcuts).toBeHidden();
});

test('desktop layers change visibility without clearing selection or resetting the map', async ({
  page,
}, info) => {
  await installEvents(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/explore');
  await page.getByRole('button', { name: /Select Great Hall/ }).click();
  await page.getByRole('button', { name: 'Collapse event details' }).click();
  const map = page.locator('.campus-map__canvas');
  const provider = await map.getAttribute('data-map-provider');
  const camera = await map.getAttribute('data-map-camera-center');
  const markers = page.locator('[data-deterministic-markers] button');
  const radius = page.locator('[data-deterministic-event-radius]');
  const layers = page.getByRole('button', { name: 'Map layers', exact: true });
  await layers.click();
  const layersPanelBounds = await page
    .locator('.map-layers-control__panel')
    .boundingBox();
  const collapsedRailBounds = await page
    .locator('.event-panel--peek')
    .boundingBox();
  expect(layersPanelBounds!.x).toBeGreaterThan(
    collapsedRailBounds!.x + collapsedRailBounds!.width,
  );
  await expect(
    page.getByRole('checkbox', { name: 'Event markers' }),
  ).toBeFocused();
  await page.getByRole('checkbox', { name: 'Event markers' }).uncheck();
  await expect(markers.first()).toBeHidden();
  await expect(radius).toBeVisible();
  await page
    .getByRole('checkbox', { name: 'Selected challenge radius' })
    .uncheck();
  await expect(radius).toBeHidden();
  await page
    .getByRole('checkbox', { name: '3D buildings and trees' })
    .uncheck();
  await page.getByRole('checkbox', { name: 'Map labels' }).uncheck();
  await expect(map).toHaveAttribute('data-map-details-visible', 'false');
  await expect(map).toHaveAttribute('data-map-labels-visible', 'false');
  await expect(map).toHaveAttribute('data-map-provider', provider!);
  await expect(map).toHaveAttribute('data-map-camera-center', camera!);
  await captureScreenshot(test.info(), page, {
    animations: 'disabled',
    path: info.outputPath('desktop-map-layers.png'),
  });
  await page.keyboard.press('Escape');
  await expect(layers).toBeFocused();
  await expect(page.locator('.event-panel--peek')).toBeVisible();
  await layers.click();
  await expect(
    page.getByRole('checkbox', { name: 'Event markers' }),
  ).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Event markers' }).check();
  await expect(markers.first()).toBeVisible();
  await expect(markers.first()).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('checkbox', { name: 'Selected challenge radius' })
    .check();
  await expect(radius).toBeVisible();
  await page
    .locator('.campus-map__canvas')
    .click({ position: { x: 100, y: 100 } });
  await expect(layers).toHaveAttribute('aria-expanded', 'false');
  await noOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(layers).toHaveCount(0);
  await expect(map).toHaveAttribute('data-map-labels-visible', 'true');
  await expect(markers.first()).toBeVisible();
  await captureScreenshot(test.info(), page, {
    animations: 'disabled',
    path: info.outputPath('mobile-without-layers.png'),
  });
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
  await captureScreenshot(test.info(), page, {
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
    await captureScreenshot(test.info(), page, {
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
  await captureScreenshot(test.info(), page, {
    animations: 'disabled',
    path: info.outputPath('mobile-location-uncertain.png'),
  });
  await page.getByRole('button', { name: 'All events', exact: true }).click();
  await page.getByRole('button', { name: 'Nearby', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Refresh nearby' }),
  ).toBeVisible();
  await captureScreenshot(test.info(), page, {
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
    await captureScreenshot(test.info(), page, {
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

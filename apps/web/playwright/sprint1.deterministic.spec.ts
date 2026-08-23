import { expect, test, type Page } from '@playwright/test';

const EVENT_TITLE = 'Sprint 1 Demo - Wits Great Hall';
const EVENT_ID = '00000000-0000-4000-8000-000000000018';
const API_BASE_URL = 'http://127.0.0.1:3001/api/v1';

test('uses the real API to decide in-range and out-of-range reachability', async ({
  context,
  page,
}) => {
  const unexpectedExternalRequests = monitorForbiddenProviders(page);
  const eligibilityRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith(`/events/${EVENT_ID}/eligibility`)) {
      eligibilityRequests.push(request.postData() ?? '');
    }
  });
  await page.addInitScript(() => {
    const browserWindow = window as typeof window & {
      __locationWatcherCounts?: { cleared: number; started: number };
    };
    const geolocation = navigator.geolocation;
    const originalWatch = geolocation.watchPosition.bind(geolocation);
    const originalClear = geolocation.clearWatch.bind(geolocation);
    browserWindow.__locationWatcherCounts = { cleared: 0, started: 0 };
    geolocation.watchPosition = (...arguments_) => {
      browserWindow.__locationWatcherCounts!.started += 1;
      return originalWatch(...arguments_);
    };
    geolocation.clearWatch = (watchId) => {
      browserWindow.__locationWatcherCounts!.cleared += 1;
      originalClear(watchId);
    };
  });
  await context.grantPermissions(['geolocation'], {
    origin: 'http://127.0.0.1:5174',
  });
  await context.setGeolocation({ latitude: -26.19205, longitude: 28.03038 });
  await page.clock.setFixedTime(new Date('2026-08-18T10:00:00.000Z'));
  await page.setViewportSize({ height: 844, width: 390 });

  const eventsResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.url() === `${API_BASE_URL}/events`,
  );

  await page.goto('/explore');

  await expect(
    page.getByRole('heading', { name: 'Explore the campus map' }),
  ).toBeAttached();
  await expect(
    page.locator('[data-map-provider^="deterministic-"]'),
  ).toBeVisible();
  expect((await eventsResponse).status()).toBe(200);
  await expect(
    page.locator('[data-map-reported-location="true"]'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Following reported location' }),
  ).toBeVisible();

  const mobileLayout = await inspectExploreLayout(page);
  expect(mobileLayout.viewport).toEqual({ height: 844, width: 390 });
  expect(mobileLayout.headerHeight).toBeGreaterThanOrEqual(64);
  expect(mobileLayout.headerHeight).toBeLessThanOrEqual(73);
  expect(mobileLayout.documentHeight).toBe(844);
  expect(mobileLayout.documentWidth).toBe(390);
  expect(mobileLayout.footerCount).toBe(0);
  expect(mobileLayout.panelBottom).toBeLessThanOrEqual(mobileLayout.navTop);

  await page
    .locator('[data-map-provider^="deterministic-"]')
    .dispatchEvent('pointerdown');
  await expect(
    page.getByRole('button', { name: 'Recenter on reported location' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Recenter on reported location' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Following reported location' }),
  ).toBeVisible();

  await page.getByRole('button', { name: /^Events/u }).click();
  await expect(page.getByText(EVENT_TITLE)).toBeVisible();

  const event = page.getByRole('listitem').filter({ hasText: EVENT_TITLE });
  const inRangeResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url() === `${API_BASE_URL}/events/${EVENT_ID}/eligibility`,
  );

  await event.getByRole('button', { name: /View on map/u }).click();

  const inRange = await inRangeResponse;
  expect(inRange.status()).toBe(200);
  await expect(inRange.json()).resolves.toMatchObject({
    eventId: EVENT_ID,
    reachable: true,
    status: 'reachable',
  });
  await expect(page.getByText('In range')).toBeVisible();
  await expect(page.getByText('Event interaction area')).toBeVisible();
  await expect(
    page.locator('[data-deterministic-event-radius="true"]'),
  ).toBeVisible();
  await expect(page.getByLabel('Mapbox logo')).toBeVisible();
  await expect(page.locator('.mapboxgl-ctrl-attrib')).toBeVisible();

  let releaseChallengeStart: () => void = () => undefined;
  const challengeStartHeld = new Promise<void>((resolve) => {
    releaseChallengeStart = resolve;
  });
  const challengeStartUrl = `${API_BASE_URL}/events/${EVENT_ID}/challenge-attempts`;
  await page.route(challengeStartUrl, async (route) => {
    await challengeStartHeld;
    await route.abort('failed');
  });
  await page
    .getByRole('button', { name: `Start challenge for ${EVENT_TITLE}` })
    .click();

  const startingTitle = page.getByText('Starting challenge…', { exact: true });
  const startingDetail = page.getByText(
    'Wits World is checking your latest reported location again.',
    { exact: true },
  );
  await expect(startingTitle).toBeVisible();
  await expect(startingDetail).toBeVisible();
  const [startingTitleBox, startingDetailBox] = await Promise.all([
    startingTitle.boundingBox(),
    startingDetail.boundingBox(),
  ]);
  expect(startingTitleBox).not.toBeNull();
  expect(startingDetailBox).not.toBeNull();
  expect(startingTitleBox!.y + startingTitleBox!.height).toBeLessThanOrEqual(
    startingDetailBox!.y,
  );

  releaseChallengeStart();
  await expect(page.getByText('The challenge could not start.')).toBeVisible();
  await page.unroute(challengeStartUrl);

  await context.setGeolocation({ latitude: -26.204, longitude: 28.045 });
  const outOfRangeResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url() === `${API_BASE_URL}/events/${EVENT_ID}/eligibility`,
  );

  await page.clock.runFor(15_000);

  const outOfRange = await outOfRangeResponse;
  expect(outOfRange.status()).toBe(200);
  await expect(outOfRange.json()).resolves.toMatchObject({
    eventId: EVENT_ID,
    reachable: false,
    status: 'unreachable',
  });
  await expect(page.getByText('Out of range')).toBeVisible();
  expect(eligibilityRequests).toHaveLength(2);

  await page.setViewportSize({ height: 800, width: 1280 });
  const desktopLayout = await inspectExploreLayout(page);
  expect(desktopLayout.viewport).toEqual({ height: 800, width: 1280 });
  expect(desktopLayout.headerHeight).toBeGreaterThanOrEqual(72);
  expect(desktopLayout.headerHeight).toBeLessThanOrEqual(88);
  expect(desktopLayout.documentHeight).toBe(800);
  expect(desktopLayout.documentWidth).toBe(1280);
  expect(desktopLayout.panelWidth).toBeGreaterThanOrEqual(340);
  expect(desktopLayout.panelWidth).toBeLessThanOrEqual(360);

  await page.getByRole('link', { name: 'Collection' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your collection' }),
  ).toBeVisible();
  expect(await readWatcherCounts(page)).toEqual({ cleared: 1, started: 1 });
  await page.getByRole('link', { name: 'Explore' }).click();
  await expect(
    page.locator('[data-map-provider^="deterministic-"]'),
  ).toBeVisible();
  expect(await readWatcherCounts(page)).toEqual({ cleared: 1, started: 2 });
  expect(unexpectedExternalRequests).toEqual([]);
});

test('keeps event discovery usable when browser geolocation permission is denied', async ({
  context,
  page,
}) => {
  const unexpectedExternalRequests = monitorForbiddenProviders(page);
  const browserSession = await context.newCDPSession(page);

  await browserSession.send('Browser.setPermission', {
    origin: 'http://127.0.0.1:5174',
    permission: { name: 'geolocation' },
    setting: 'denied',
  });

  await page.goto('/explore');

  await expect(
    page.getByRole('button', { name: 'Location access disabled' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: /^Events/u }).click();
  const event = page.getByRole('listitem').filter({ hasText: EVENT_TITLE });
  await expect(event).toBeVisible();
  await event.getByRole('button', { name: /View on map/u }).click();
  await expect(page.getByText('Live location is disabled.')).toBeVisible();
  expect(unexpectedExternalRequests).toEqual([]);
});

function monitorForbiddenProviders(page: Page): string[] {
  const requests: string[] = [];

  page.on('request', (request) => {
    const url = new URL(request.url());
    const isForbidden =
      url.hostname === 'api.mapbox.com' ||
      url.hostname.endsWith('.mapbox.com') ||
      url.hostname.endsWith('.auth0.com');

    if (isForbidden) {
      requests.push(`${request.method()} ${url.hostname}${url.pathname}`);
    }
  });

  return requests;
}

async function inspectExploreLayout(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.site-header');
    const panel = document.querySelector<HTMLElement>('.event-panel');
    const navigation = document.querySelector<HTMLElement>(
      '.primary-navigation',
    );
    const panelBox = panel?.getBoundingClientRect();
    const navigationBox = navigation?.getBoundingClientRect();
    return {
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      footerCount: document.querySelectorAll('.site-footer').length,
      headerHeight: header?.getBoundingClientRect().height ?? 0,
      navTop: navigationBox?.top ?? window.innerHeight,
      panelBottom: panelBox?.bottom ?? 0,
      panelWidth: panelBox?.width ?? 0,
      viewport: { height: window.innerHeight, width: window.innerWidth },
    };
  });
}

async function readWatcherCounts(page: Page) {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __locationWatcherCounts?: { cleared: number; started: number };
        }
      ).__locationWatcherCounts,
  );
}

import { expect, test, type Page } from '@playwright/test';

const EVENT_TITLE = 'Sprint 1 Demo - Wits Great Hall';
const EVENT_ID = '00000000-0000-4000-8000-000000000018';
const API_BASE_URL = 'http://127.0.0.1:3001/api/v1';

test('uses the real API to decide in-range and out-of-range reachability', async ({
  context,
  page,
}) => {
  const unexpectedExternalRequests = monitorForbiddenProviders(page);
  await context.grantPermissions(['geolocation'], {
    origin: 'http://127.0.0.1:5174',
  });
  await context.setGeolocation({ latitude: -26.19205, longitude: 28.03038 });

  const eventsResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.url() === `${API_BASE_URL}/events`,
  );

  await page.goto('/explore');

  await expect(
    page.getByRole('heading', { name: 'Nearby events' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: EVENT_TITLE })).toBeVisible();
  await expect(
    page.locator('[data-map-provider^="deterministic-"]'),
  ).toBeVisible();
  expect((await eventsResponse).status()).toBe(200);

  const event = page.getByRole('listitem').filter({ hasText: EVENT_TITLE });
  const inRangeResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url() === `${API_BASE_URL}/events/${EVENT_ID}/eligibility`,
  );

  await event
    .getByRole('button', { name: `Check reachability for ${EVENT_TITLE}` })
    .click();

  const inRange = await inRangeResponse;
  expect(inRange.status()).toBe(200);
  await expect(inRange.json()).resolves.toMatchObject({
    eventId: EVENT_ID,
    reachable: true,
    status: 'reachable',
  });
  await expect(
    event.getByText('This event is reachable from your reported location.'),
  ).toBeVisible();

  await context.setGeolocation({ latitude: -26.204, longitude: 28.045 });
  const outOfRangeResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url() === `${API_BASE_URL}/events/${EVENT_ID}/eligibility`,
  );

  await event
    .getByRole('button', { name: `Check again for ${EVENT_TITLE}` })
    .click();

  const outOfRange = await outOfRangeResponse;
  expect(outOfRange.status()).toBe(200);
  await expect(outOfRange.json()).resolves.toMatchObject({
    eventId: EVENT_ID,
    reachable: false,
    status: 'unreachable',
  });
  await expect(
    event.getByText('This event is not reachable from your reported location.'),
  ).toBeVisible();
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

  const event = page.getByRole('listitem').filter({ hasText: EVENT_TITLE });
  await expect(event).toBeVisible();
  await event
    .getByRole('button', { name: `Check reachability for ${EVENT_TITLE}` })
    .click();

  await expect(
    event.getByText('Location permission was denied.'),
  ).toBeVisible();
  await expect(
    event.getByText(
      'You can still browse events without sharing your location.',
      {
        exact: false,
      },
    ),
  ).toBeVisible();
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

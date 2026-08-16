import { expect, test } from '@playwright/test';

const eventsEndpoint = 'http://localhost:3000/api/v1/events';
const mapboxTelemetryEndpoint = 'https://events.mapbox.com/events/v2';

test('loads the protected app with data from the real API', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const failedRequests: { reason: string; url: string }[] = [];

  page.on('console', (message) => {
    const location = message.location();

    if (
      message.type() === 'error' &&
      !location.url.startsWith(mapboxTelemetryEndpoint)
    ) {
      consoleErrors.push(message.text());
    }
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());

    if (url.href.startsWith(mapboxTelemetryEndpoint)) {
      return;
    }

    failedRequests.push({
      reason: request.failure()?.errorText ?? 'unknown',
      url: `${url.origin}${url.pathname}`,
    });
  });

  const eventsResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.url() === eventsEndpoint,
  );

  await page.goto('/explore');

  await expect(page.getByText('Signed in as')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Explore the campus map' }),
  ).toBeVisible();

  const response = await eventsResponse;
  const authorizationHeader = await response
    .request()
    .headerValue('authorization');

  expect(response.status()).toBe(200);
  expect(response.fromServiceWorker()).toBe(false);
  expect(authorizationHeader).not.toBeNull();
  expect(authorizationHeader!).toMatch(/^Bearer \S+$/);
  expect(page.context().serviceWorkers()).toHaveLength(0);

  const payload: unknown = await response.json();
  expect(payload).toEqual(
    expect.objectContaining({
      events: expect.any(Array),
      requestId: expect.any(String),
    }),
  );

  await expect(
    page.getByRole('heading', { name: 'Nearby events' }),
  ).toBeVisible();
  await expect(page.getByText('Events are unavailable right now.')).toHaveCount(
    0,
  );
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

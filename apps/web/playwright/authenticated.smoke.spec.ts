import { expect, test, type Page } from '@playwright/test';

const eventsEndpoint = 'http://localhost:3000/api/v1/events';
const mapboxTelemetryEndpoint = 'https://events.mapbox.com/events/v2';

test('loads the protected app with data from the real API', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const failedRequests: { reason: string; url: string }[] = [];
  const mapboxResponseErrors: { path: string; status: number }[] = [];

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
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.hostname === 'api.mapbox.com' && response.status() >= 400) {
      mapboxResponseErrors.push({
        path: url.pathname,
        status: response.status(),
      });
    }
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
  expect(
    authorizationHeader !== null && /^Bearer \S+$/.test(authorizationHeader),
  ).toBe(true);
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
  await expect(page.getByText('Loading the campus map…')).toHaveCount(0, {
    timeout: 30_000,
  });
  expect(mapboxResponseErrors).toEqual([]);
  await expect(page.getByText('The map could not load.')).toHaveCount(0);
  await expect(page.getByText('Events are unavailable right now.')).toHaveCount(
    0,
  );
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('keeps the same player with E2E local-storage restoration and logout', async ({
  page,
}) => {
  const protectedRoutes = ['/explore', '/collection', '/decks', '/matches'];
  let expectedPlayerId: string | undefined;

  for (const route of protectedRoutes) {
    const directVisitPlayerId = await openAndReadCurrentPlayer(page, () =>
      page.goto(route),
    );
    expectedPlayerId ??= directVisitPlayerId;
    expect(directVisitPlayerId).toBe(expectedPlayerId);
    await expect(page.getByText('Signed in as')).toBeVisible();

    const refreshedPlayerId = await openAndReadCurrentPlayer(page, () =>
      page.reload(),
    );
    expect(refreshedPlayerId).toBe(expectedPlayerId);
    await expect(page.getByText('Signed in as')).toBeVisible();
  }

  await Promise.all([
    page.waitForURL('http://localhost:5173/'),
    page.getByRole('button', { name: 'Sign out' }).click(),
  ]);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

  await page.goto('/explore');
  await expect(
    page.getByRole('button', { name: 'Sign in to explore' }),
  ).toBeVisible();
  await expect(page.getByText('Signed in as')).toHaveCount(0);
});

async function openAndReadCurrentPlayer(
  page: Page,
  navigate: () => Promise<unknown>,
): Promise<string> {
  const currentPlayerResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      response.request().method() === 'GET' &&
      url.pathname === '/api/v1/auth/me'
    );
  });

  await navigate();
  const response = await currentPlayerResponse;
  expect(response.status()).toBe(200);

  const payload: unknown = await response.json();

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('id' in payload) ||
    typeof payload.id !== 'string' ||
    !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(payload.id)
  ) {
    throw new Error('The authenticated current-player response was invalid.');
  }

  return payload.id;
}

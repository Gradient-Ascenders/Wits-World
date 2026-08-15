import { expect, test } from '@playwright/test';

const eventsEndpoint = 'http://localhost:3000/api/v1/events';

test('loads the protected app with data from the real API', async ({
  page,
}) => {
  let consoleErrorCount = 0;
  const failedRequests: { reason: string; url: string }[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrorCount += 1;
    }
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());

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

  await page.getByRole('button', { name: 'Sign in to explore' }).click();
  await expect(
    page.getByRole('heading', { name: 'Authorize App' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Accept', exact: true }).click();

  await expect(page.getByText('Signed in as')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Explore the campus map' }),
  ).toBeVisible();

  const response = await eventsResponse;
  const authorizationHeader = response.request().headers()['authorization'];

  expect(response.status()).toBe(200);
  expect(response.fromServiceWorker()).toBe(false);
  expect(Boolean(authorizationHeader?.match(/^Bearer \S+$/))).toBe(true);
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
  expect(consoleErrorCount).toBe(0);
  expect(failedRequests).toEqual([]);
});

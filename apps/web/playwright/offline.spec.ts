import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { CachedPack } from '../src/offline/store';

for (const format of ['multiple_choice', 'ordering'] as const) {
  test(`${format}: production shell reopens offline, persists answers and retries sync`, async ({
    page,
    context,
  }) => {
    const playerId = randomUUID(),
      eventId = randomUUID();
    const cached: CachedPack = {
      packToken: 'fixture-only-not-a-real-signature',
      pack: {
        version: 1,
        packId: randomUUID(),
        playerId,
        issuedAt: new Date().toISOString(),
        validFrom: new Date(Date.now() - 1000).toISOString(),
        validUntil: new Date(Date.now() + 3600000).toISOString(),
        event: {
          eventId,
          version: 1,
          title: 'Offline campus challenge',
          description: 'Saved nearby event',
          latitude: -26,
          longitude: 28,
          radiusMetres: 75,
        },
        challengeId: randomUUID(),
        challengeVersion: 1,
        format,
        timeLimitSeconds: 90,
        questions: Array.from({ length: 5 }, (_, index) => ({
          id: randomUUID(),
          version: 1,
          prompt: `Offline question ${index + 1}`,
          difficulty: 1,
          options: Array.from({ length: 4 }, (_, option) => ({
            id: randomUUID(),
            text: `Option ${option + 1}`,
          })),
        })),
      },
    };
    let connected = true,
      accept = false,
      submitted = 0;
    await context.route('http://127.0.0.1:3999/api/v1/**', async (route) => {
      if (!connected) return route.abort('internetdisconnected');
      const pathname = new URL(route.request().url()).pathname;
      let body: unknown;
      if (pathname.endsWith('/auth/me'))
        body = {
          id: playerId,
          connectionStrategy: 'auth0',
          lifecycleStatus: 'active',
          playerName: 'offline-player',
          playerNameSetupRequired: false,
          role: 'player',
          requestId: 'fixture',
        };
      else if (pathname.endsWith('/events'))
        body = {
          events: [
            {
              ...cached.pack.event,
              availability: 'active',
              startsAt: cached.pack.validFrom,
              endsAt: cached.pack.validUntil,
            },
          ],
          requestId: 'fixture',
        };
      else if (pathname.endsWith('/offline-challenge-packs'))
        body = { packs: [cached], requestId: 'fixture' };
      else if (pathname.endsWith('/offline-challenge-attempts')) {
        submitted++;
        expect(route.request().postDataJSON().answers).toHaveLength(5);
        if (!accept)
          return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } });
        body = {
          attempt: { attemptId: randomUUID(), status: 'completed' },
          requestId: 'fixture',
        };
      } else return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
      return route.fulfill({ json: body });
    });
    await page.goto('/offline');
    await expect(
      page.getByRole('button', { name: 'Open saved challenge' }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      )
      .toBe(true);
    connected = false;
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Saved campus events' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Open saved challenge' }).click();
    for (let index = 1; index <= 5; index++) {
      await expect(
        page.getByRole('heading', {
          name: `Offline question ${index}`,
          exact: true,
        }),
      ).toBeVisible();
      if (format === 'multiple_choice')
        await page.getByRole('radio').first().check();
      await page
        .getByRole('button', {
          name: format === 'ordering' ? 'Submit order' : 'Submit answer',
          exact: true,
        })
        .click();
      if (index === 1) {
        // Reload after the UI acknowledges the IndexedDB commit, not while
        // the click handler is still writing the answer.
        await expect(
          page.getByRole('heading', {
            name: 'Offline question 2',
            exact: true,
          }),
        ).toBeVisible();
        await page.reload();
      }
    }
    await expect(
      page.getByText('Saved on this device. Waiting for server validation.'),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText('Saved on this device. Waiting for server validation.'),
    ).toBeVisible();
    connected = true;
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect.poll(() => submitted).toBeGreaterThan(0);
    await expect(
      page.getByText('Saved on this device. Waiting for server validation.'),
    ).toBeVisible();
    accept = true;
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Attempt confirmed' }),
    ).toBeVisible();
    const cachedURLs = await page.evaluate(async () => {
      const requests = await Promise.all(
        (await caches.keys()).map(async (key) =>
          (await caches.open(key)).keys(),
        ),
      );
      return requests.flat().map((request) => request.url);
    });
    expect(cachedURLs.length).toBeGreaterThan(0);
    expect(
      cachedURLs.every(
        (url) =>
          url.startsWith('http://127.0.0.1:4180/') && !url.includes('/api/'),
      ),
    ).toBe(true);
  });
}

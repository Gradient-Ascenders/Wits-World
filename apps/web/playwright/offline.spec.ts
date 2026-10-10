import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { CachedPack } from '../src/offline/store';
import { captureScreenshot } from './visual-capture';

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
        locationPolicy: 'arrival-v1',
        issuedAt: new Date().toISOString(),
        validFrom: new Date(Date.now() - 1000).toISOString(),
        validUntil: new Date(Date.now() + 3600000).toISOString(),
        event: {
          eventId,
          version: 1,
          title: 'Offline campus challenge',
          description: 'Saved nearby event',
          latitude: -26.19205,
          longitude: 28.03038,
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
      eventsReachable = true,
      accept = false,
      submitted = 0;
    await context.route('http://127.0.0.1:3999/api/v1/**', async (route) => {
      if (!connected) return route.abort('internetdisconnected');
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith('/events') && !eventsReachable)
        return route.abort('internetdisconnected');
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
    await page.goto('/');
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      )
      .toBe(true);
    expect(
      await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .some((entry) => entry.name.includes('/OfflinePages-')),
      ),
    ).toBe(false);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const requests = await Promise.all(
            (await caches.keys()).map(async (key) =>
              (await caches.open(key)).keys(),
            ),
          );
          const urls = requests.flat().map((request) => request.url);
          return (
            urls.some(
              (url) => url.includes('/OfflinePages-') && url.endsWith('.js'),
            ) &&
            urls.some(
              (url) => url.includes('/challenge-') && url.endsWith('.css'),
            )
          );
        }),
      )
      .toBe(true);
    await page.goto('/offline');
    await expect(
      page.getByText('Ready for offline play.', { exact: false }),
    ).toBeVisible();
    if (format === 'multiple_choice') {
      await page.setViewportSize({ width: 1440, height: 900 });
      await captureScreenshot(test.info(), page, {
        path: 'offline-desktop.png',
        fullPage: true,
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await captureScreenshot(test.info(), page, {
        path: 'offline-mobile.png',
        fullPage: true,
        animations: 'disabled',
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    // A network interface can remain connected while the API is unreachable.
    eventsReachable = false;
    await page.goto('/explore');
    await expect(
      page.getByRole('heading', { name: 'Explore the campus map' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'View Offline campus challenge on map',
      }),
    ).toBeVisible();
    await expect(
      page.getByText('We can’t reach Wits World.', { exact: false }),
    ).toBeVisible();
    connected = false;
    await context.setOffline(true);
    await page.goto('/explore');
    await expect(
      page.getByRole('heading', { name: 'Explore the campus map' }),
    ).toBeVisible();
    await expect(
      page.getByText('Playing offline as offline-player'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Sign in', exact: true }),
    ).toHaveCount(0);
    // Attribution must have an opaque theme backdrop over geographic labels.
    await expect(page.locator('.offline-campus-map__attribution')).toHaveCSS(
      'background-color',
      /^rgb\(/,
    );
    if (format === 'multiple_choice') {
      for (const [width, height, name] of [
        [1440, 900, 'desktop'],
        [390, 844, 'mobile'],
      ] as const) {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await captureScreenshot(test.info(), page, {
          path: `offline-account-${name}.png`,
          fullPage: true,
          animations: 'disabled',
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }
    }
    await page
      .getByRole('button', { name: 'View Offline campus challenge on map' })
      .click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    for (let index = 1; index <= 5; index++) {
      await expect(
        page.getByRole('heading', {
          name: `Offline question ${index}`,
          exact: true,
        }),
      ).toBeVisible();
      if (format === 'multiple_choice')
        await page.getByRole('radio').first().check();
      if (format === 'multiple_choice' && index === 5) {
        await page.evaluate(() => {
          Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
            configurable: true,
            value: () => {},
          });
        });
      }
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
      page.getByRole('button', { name: 'Retry location' }),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        'Saved on this device. Pending server validation; no reward confirmed.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText('Playing offline as offline-player'),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Saved on this device. Pending server validation; no reward confirmed.',
        { exact: true },
      ),
    ).toBeVisible();
    connected = true;
    eventsReachable = true;
    await context.setOffline(false);
    await expect.poll(() => submitted).toBeGreaterThan(0);
    await expect(
      page.getByText(/Sync failed. Server confirmation is unknown./).first(),
    ).toBeVisible();
    accept = true;
    await expect(
      page.getByRole('heading', { name: 'Attempt confirmed' }),
    ).toBeVisible({ timeout: 25_000 });
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

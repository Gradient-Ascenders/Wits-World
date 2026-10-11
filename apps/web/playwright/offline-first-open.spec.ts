import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { captureScreenshot } from './visual-capture';
import type { CachedPack } from '../src/offline/store';

for (const format of ['multiple_choice', 'ordering'] as const) {
  for (const scenario of ['fresh', 'updated', 'legacy'] as const) {
    const updated = scenario === 'updated';
    const legacy = scenario === 'legacy';
    test(`${format}: first open${updated ? ' after an update and unavailable authentication' : legacy ? ' with legacy location recovery' : ''} completes${legacy ? ' with answers retained' : ' without a reload'} and submits once`, async ({
      page,
      context,
      request,
    }) => {
      await request.post('/__offline_test__/release', {
        data: { version: updated ? 'before' : 'after' },
      });
      const playerId = randomUUID();
      const eventId = randomUUID();
      const resultId = randomUUID();
      const cached: CachedPack = {
        packToken: 'first-open-fixture-not-a-real-signature',
        pack: {
          version: 1,
          packId: randomUUID(),
          playerId,
          locationPolicy: legacy ? undefined : 'arrival-v1',
          issuedAt: new Date(Date.now() - 1000).toISOString(),
          validFrom: new Date(Date.now() - 1000).toISOString(),
          validUntil: new Date(Date.now() + 3600_000).toISOString(),
          event: {
            eventId,
            version: 1,
            title: 'First-open event',
            description: 'Downloaded campus challenge',
            latitude: -26.19205,
            longitude: 28.03038,
            radiusMetres: 60,
          },
          challengeId: randomUUID(),
          challengeVersion: 1,
          format,
          timeLimitSeconds: 150,
          questions: Array.from({ length: 5 }, (_, index) => ({
            id: randomUUID(),
            version: 1,
            difficulty: 1,
            prompt: `First-open question ${index + 1}`,
            options: Array.from({ length: 4 }, (_, option) => ({
              id: randomUUID(),
              text: `Choice ${option + 1}`,
            })),
          })),
        },
      };
      let connected = true;
      let submissions = 0;
      let submittedId = '';
      const capture = async (state: string) => {
        if (!legacy) return;
        for (const [width, height, name] of [
          [1440, 900, 'desktop'],
          [390, 844, 'mobile'],
        ] as const) {
          await page.setViewportSize({ width, height });
          await captureScreenshot(test.info(), page, {
            path: `${format}-${state}-${name}.png`,
            fullPage: true,
            animations: 'disabled',
          });
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
        }
      };
      await context.addInitScript(() => {
        const original = navigator.geolocation.getCurrentPosition.bind(
          navigator.geolocation,
        );
        Object.assign(window, { __offlineOriginalLocation: original });
        if (sessionStorage.getItem('offline-fixture-denied') === 'true') {
          navigator.geolocation.getCurrentPosition = (_success, error) =>
            error?.({
              code: 1,
              message: 'Fixture permission denied',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            });
        }
      });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await context.route('http://127.0.0.1:3999/api/v1/**', async (route) => {
        if (!connected) return route.abort('internetdisconnected');
        const pathname = new URL(route.request().url()).pathname;
        if (pathname.endsWith('/auth/me'))
          return route.fulfill({
            json: {
              id: playerId,
              connectionStrategy: 'auth0',
              lifecycleStatus: 'active',
              playerName: 'first-open-player',
              playerNameSetupRequired: false,
              role: 'player',
              requestId: 'fixture',
            },
          });
        if (pathname.endsWith('/events'))
          return route.fulfill({
            json: {
              events: [
                {
                  ...cached.pack.event,
                  availability: 'active',
                  startsAt: cached.pack.validFrom,
                  endsAt: cached.pack.validUntil,
                },
              ],
              requestId: 'fixture',
            },
          });
        if (pathname.endsWith('/offline-challenge-packs'))
          return route.fulfill({
            json: { packs: [cached], requestId: 'fixture' },
          });
        if (pathname.endsWith('/offline-challenge-attempts')) {
          submissions++;
          const input = route.request().postDataJSON();
          submittedId = input.clientAttemptId;
          expect(input.answers).toHaveLength(5);
          if (legacy) expect(input.finishLocation.accuracyMetres).toBe(10);
          else expect(input.finishLocation).toBeUndefined();
          expect(input.startLocation.latitude).toBe(cached.pack.event.latitude);
          expect(input.startLocation.longitude).toBe(
            cached.pack.event.longitude,
          );
          expect(input.startLocation.accuracyMetres).toBe(10);
          expect(
            input.answers.map(
              (answer: { optionIds: string[] }) => answer.optionIds.length,
            ),
          ).toEqual(Array(5).fill(format === 'ordering' ? 4 : 1));
          return route.fulfill({
            status: 201,
            json: {
              attempt: { attemptId: resultId, status: 'completed' },
              requestId: 'fixture',
            },
          });
        }
        return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
      });
      await page.goto('/');
      await expect
        .poll(() =>
          page.evaluate(async () => {
            if (!navigator.serviceWorker.controller) return false;
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const request = indexedDB.open('wits-world-offline');
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            try {
              return await new Promise<boolean>((resolve, reject) => {
                const request = db
                  .transaction('packs')
                  .objectStore('packs')
                  .count();
                request.onsuccess = () => resolve(request.result === 1);
                request.onerror = () => reject(request.error);
              });
            } finally {
              db.close();
            }
          }),
        )
        .toBe(true);
      expect(
        await page.evaluate(() =>
          performance
            .getEntriesByType('resource')
            .some((entry) => /\/(OfflinePages|ExplorePage)-/.test(entry.name)),
        ),
      ).toBe(false);
      if (updated) {
        // Install a real second build with different module URLs before either
        // exploration or the saved-player route has been visited.
        await request.post('/__offline_test__/release', {
          data: { version: 'after' },
        });
        await page.evaluate(async () =>
          (await navigator.serviceWorker.getRegistration())!.update(),
        );
        await expect
          .poll(() =>
            page
              .evaluate(async () => {
                const registration =
                  await navigator.serviceWorker.getRegistration();
                return (
                  (await caches.keys()).filter((key) =>
                    key.startsWith('wits-world-shell-'),
                  ).length === 2 &&
                  !registration?.waiting &&
                  !registration?.installing
                );
              })
              .catch(() => false),
          )
          .toBe(true);
        await page.evaluate(() =>
          localStorage.setItem('wits-world.e2e.auth-unavailable', 'true'),
        );
      }
      connected = false;
      // Also cover interfaces that stay online while authentication/API fail.
      if (!updated) await context.setOffline(true);
      const navigations: string[] = [];
      page.on('request', (request) => {
        if (
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame()
        )
          navigations.push(request.url());
      });
      await page.goto(`/explore?event=${eventId}`);
      await expect(
        page.getByRole('button', { name: 'Play', exact: true }),
      ).toBeEnabled();
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(
        page.getByRole('heading', {
          name: 'First-open question 1',
          exact: true,
        }),
      ).toBeVisible();
      const attemptPath = new URL(page.url()).pathname;
      expect(attemptPath).toMatch(/^\/offline-attempts\//);
      await capture('question');
      if (legacy)
        await page.evaluate(() => {
          sessionStorage.setItem('offline-fixture-denied', 'true');
          navigator.geolocation.getCurrentPosition = (_success, error) =>
            error?.({
              code: 1,
              message: 'Fixture permission denied',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            });
        });
      else
        await page.evaluate(() => {
          Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
            configurable: true,
            value: () => {
              throw new Error(
                'Finishing GPS must not be requested by arrival-policy packs',
              );
            },
          });
        });
      for (let index = 1; index <= 5; index++) {
        await expect(
          page.getByRole('heading', {
            name: `First-open question ${index}`,
            exact: true,
          }),
        ).toBeVisible();
        if (format === 'multiple_choice')
          await page.getByRole('radio').first().check();
        else if (index === 1)
          await page
            .getByRole('button', { name: 'Move Choice 1 down from position 1' })
            .click();
        await page
          .getByRole('button', {
            name: format === 'ordering' ? 'Submit order' : 'Submit answer',
            exact: true,
          })
          .click();
      }
      if (legacy) {
        await expect(
          page.getByRole('heading', { name: 'Answers locked', exact: true }),
        ).toBeVisible();
        await expect(page.getByText(/Location access is denied/)).toBeVisible();
        await capture('recovery');
        await page.reload();
        await expect(
          page.getByRole('heading', { name: 'Answers locked', exact: true }),
        ).toBeVisible();
        await expect(page.getByText(/5 of 5 answers saved/)).toBeVisible();
        await expect(page.getByText(/Location access is denied/)).toBeVisible();
        await page.evaluate(() => {
          sessionStorage.removeItem('offline-fixture-denied');
          navigator.geolocation.getCurrentPosition = (
            window as unknown as {
              __offlineOriginalLocation: Geolocation['getCurrentPosition'];
            }
          ).__offlineOriginalLocation;
        });
        // Refresh the browser's simulated acquisition, rather than changing
        // the timestamp of a cached position that predates this attempt.
        await context.setGeolocation({
          latitude: cached.pack.event.latitude,
          longitude: cached.pack.event.longitude,
          accuracy: 10,
        });
        await page
          .getByRole('button', { name: 'Retry location', exact: true })
          .click();
      }
      await expect(
        page.getByRole('heading', {
          name: 'Awaiting reconnection',
          exact: true,
        }),
      ).toBeVisible();
      expect(navigations).toHaveLength(legacy ? 2 : 1);
      expect(submissions).toBe(0);
      connected = true;
      await page.evaluate(() =>
        localStorage.removeItem('wits-world.e2e.auth-unavailable'),
      );
      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(
        page.getByRole('heading', { name: 'Attempt confirmed', exact: true }),
      ).toBeVisible();
      expect(submittedId).toBe(attemptPath.split('/').at(-1));
      expect(submissions).toBe(1);
      expect(new URL(page.url()).pathname).toBe(attemptPath);
      await page.evaluate(() => {
        window.dispatchEvent(new Event('online'));
        window.dispatchEvent(new Event('focus'));
      });
      await expect(
        page.getByRole('link', { name: 'View confirmed result', exact: true }),
      ).toHaveAttribute('href', `/challenge-attempts/${resultId}`);
      expect(submissions).toBe(1);
      expect(errors).toEqual([]);
    });
  }
}

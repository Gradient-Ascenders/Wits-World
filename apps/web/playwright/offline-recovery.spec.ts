import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type {
  CachedPack,
  LocalAttempt,
  OfflineReceipt,
} from '../src/offline/store';
import { captureScreenshot } from './visual-capture';

async function prepare(page: Page) {
  const playerId = randomUUID();
  const cached: CachedPack = {
    packToken: 'synthetic-browser-fixture',
    pack: {
      version: 1,
      packId: randomUUID(),
      playerId,
      locationPolicy: 'arrival-v1',
      issuedAt: new Date().toISOString(),
      validFrom: new Date(Date.now() - 60_000).toISOString(),
      validUntil: new Date(Date.now() + 3_600_000).toISOString(),
      challengeId: randomUUID(),
      challengeVersion: 1,
      format: 'multiple_choice',
      timeLimitSeconds: 150,
      event: {
        eventId: randomUUID(),
        version: 1,
        title: 'Great Hall Quest',
        description: 'Discover the history of Great Hall.',
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
      },
      questions: Array.from({ length: 5 }, (_, i) => ({
        id: randomUUID(),
        version: 1,
        prompt: `Campus question ${i + 1}`,
        difficulty: 1,
        options: Array.from({ length: 4 }, (_, n) => ({
          id: randomUUID(),
          text: `Answer ${n + 1}`,
        })),
      })),
    },
  };
  await page
    .context()
    .route('http://127.0.0.1:3999/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const body = path.endsWith('/auth/me')
        ? {
            id: playerId,
            connectionStrategy: 'auth0',
            lifecycleStatus: 'active',
            playerName: 'campus-player',
            playerNameSetupRequired: false,
            role: 'player',
            requestId: 'fixture',
          }
        : path.endsWith('/events')
          ? {
              events: [
                {
                  ...cached.pack.event,
                  availability: 'active',
                  startsAt: cached.pack.validFrom,
                  endsAt: cached.pack.validUntil,
                },
              ],
              requestId: 'fixture',
            }
          : path.endsWith('/offline-challenge-packs')
            ? { packs: [cached], requestId: 'fixture' }
            : undefined;
      await route.fulfill(
        body ? { json: body } : { status: 404, json: { code: 'NOT_FOUND' } },
      );
    });
  await page.goto('/offline');
  await expect(
    page.getByRole('button', { name: 'Play: Great Hall Quest' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  return cached;
}

async function seed(
  page: Page,
  data: {
    packs: CachedPack[];
    attempts: LocalAttempt[];
    receipts: OfflineReceipt[];
  },
) {
  await page.evaluate(async (value) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wits-world-offline');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['packs', 'attempts', 'receipts'], 'readwrite');
      for (const name of ['packs', 'attempts', 'receipts'] as const) {
        tx.objectStore(name).clear();
        for (const item of value[name]) tx.objectStore(name).put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    window.dispatchEvent(new Event('storage'));
  }, data);
}

async function capture(page: Page, name: string) {
  await captureScreenshot(test.info(), page, {
    path: `${name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

async function denyLocation(page: Page) {
  await page.evaluate(() => {
    Object.assign(window, {
      savedOriginalLocation: navigator.geolocation.getCurrentPosition.bind(
        navigator.geolocation,
      ),
    });
    navigator.geolocation.getCurrentPosition = (_success, failure) =>
      failure?.({
        code: 1,
        message: 'Fixture denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
  });
}

async function restoreLocation(page: Page) {
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (
      window as unknown as {
        savedOriginalLocation: Geolocation['getCurrentPosition'];
      }
    ).savedOriginalLocation;
  });
}

for (const [width, height, device] of [
  [1440, 900, 'desktop'],
  [390, 844, 'mobile'],
] as const) {
  test(`${device}: saved play keeps launch, location recovery, expiry and history reachable`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height });
    const cached = await prepare(page);
    await expect(
      page.getByRole('button', { name: 'Play: Great Hall Quest' }),
    ).toBeInViewport();
    await expect(
      page.locator('.offline-preparation details'),
    ).not.toHaveAttribute('open');
    await capture(page, `saved-ready-${device}`);
    await context.setOffline(true);
    await denyLocation(page);
    await page.getByRole('button', { name: 'Play: Great Hall Quest' }).click();
    await expect(page.getByText(/Location access is denied/)).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: 'Play: Great Hall Quest' }),
    ).toBeEnabled();
    await capture(page, `saved-location-error-${device}`);
    await restoreLocation(page);
    await page.getByRole('button', { name: 'Play: Great Hall Quest' }).click();
    await expect(
      page.getByRole('heading', { name: 'Campus question 1' }),
    ).toBeVisible();
    await page.getByRole('radio').first().check();
    await page
      .getByRole('button', { name: 'Submit answer', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Campus question 2' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Saved events and attempts' }).click();
    await expect(
      page.getByRole('link', { name: 'Continue: Great Hall Quest' }),
    ).toBeInViewport();
    await capture(page, `saved-continue-${device}`);
    await page
      .getByRole('link', { name: 'Continue: Great Hall Quest' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Campus question 2' }),
    ).toBeVisible();
    const expired = structuredClone(cached);
    expired.pack.packId = randomUUID();
    expired.pack.event.eventId = randomUUID();
    expired.pack.event.title = 'Library Quest';
    expired.pack.validUntil = new Date(Date.now() - 1_000).toISOString();
    const upcoming = structuredClone(cached);
    upcoming.pack.packId = randomUUID();
    upcoming.pack.event.eventId = randomUUID();
    upcoming.pack.event.title = 'Origins Centre Quest';
    upcoming.pack.validFrom = new Date(Date.now() + 3_600_000).toISOString();
    upcoming.pack.validUntil = new Date(Date.now() + 7_200_000).toISOString();
    const additional = ['Science Stadium Quest', 'Chamber of Mines Quest'].map(
      (title) => {
        const saved = structuredClone(cached);
        saved.pack.packId = randomUUID();
        saved.pack.event.eventId = randomUUID();
        saved.pack.event.title = title;
        return saved;
      },
    );
    await seed(page, {
      packs: [cached, expired, upcoming, ...additional],
      attempts: [],
      receipts: [
        {
          clientAttemptId: randomUUID(),
          playerId: cached.pack.playerId,
          title: 'Past Hall Quest',
          outcome: 'accepted',
          attemptId: randomUUID(),
          receivedAt: Date.now(),
        },
        {
          clientAttemptId: randomUUID(),
          playerId: cached.pack.playerId,
          title: 'Missed Library Quest',
          outcome: 'OFFLINE_SYNC_EXPIRED',
          receivedAt: Date.now(),
        },
      ],
    });
    await page.goto('/offline');
    await expect(
      page.getByRole('link', { name: 'View saved: Missed Library Quest' }),
    ).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Play: Great Hall Quest' }),
    ).toBeInViewport();
    const playBounds = await page
      .getByRole('button', { name: 'Play: Great Hall Quest' })
      .boundingBox();
    expect(playBounds!.y + playBounds!.height).toBeLessThan(
      device === 'mobile' ? 750 : 820,
    );
    await expect(
      page.getByRole('link', { name: 'View saved: Library Quest' }),
    ).toBeHidden();
    await page.getByText('Expired downloads').click();
    await expect(
      page.getByRole('link', { name: 'View saved: Library Quest' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Play: Library Quest' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'View saved: Origins Centre Quest' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'View confirmed result' }),
    ).toBeHidden();
    await capture(page, `saved-expired-rejected-${device}`);
    await page
      .getByRole('searchbox', { name: 'Search saved events' })
      .fill('unmatched');
    await expect(
      page.getByText('No saved events match your search.'),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Clear search saved events' })
      .click();
    await page.getByText('Past results').click();
    await expect(
      page.getByRole('link', { name: 'View confirmed result' }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'View saved: Missed Library Quest' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Attempt rejected' }),
    ).toBeVisible();
    await capture(page, `saved-rejected-${device}`);
    await context.route('**/api/v1/offline-challenge-packs', (route) =>
      route.fulfill({ json: { packs: [], requestId: 'empty-fixture' } }),
    );
    await context.setOffline(true);
    await page.goto('/offline');
    await expect(
      page.getByRole('heading', { name: 'Saved play', exact: true }),
    ).toBeVisible();
    await seed(page, { packs: [], attempts: [], receipts: [] });
    await expect(
      page.getByRole('heading', { name: 'No saved events yet' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Explore events' }),
    ).toBeVisible();
    await capture(page, `saved-empty-${device}`);
  });

  test(`${device}: an expired legacy timer keeps answers and one visible location retry`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height });
    const cached = await prepare(page);
    await context.setOffline(true);
    delete cached.pack.locationPolicy;
    const attempt: LocalAttempt = {
      clientAttemptId: randomUUID(),
      playerId: cached.pack.playerId,
      cached,
      startedAt: new Date(Date.now() - 160_000).toISOString(),
      status: 'active',
      startLocation: {
        latitude: -26.19205,
        longitude: 28.03038,
        accuracyMetres: 10,
        acquiredAt: new Date(Date.now() - 160_000).toISOString(),
      },
      answers: cached.pack.questions.slice(0, 3).map((q, i) => ({
        questionId: q.id,
        optionIds: [q.options[0]!.id],
        answeredAt: new Date(Date.now() - 150_000 + i * 1_000).toISOString(),
      })),
    };
    await seed(page, { packs: [cached], attempts: [attempt], receipts: [] });
    await denyLocation(page);
    await page
      .getByRole('link', { name: 'View saved: Great Hall Quest' })
      .click();
    await expect(page.getByText(/Location access is denied/)).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: 'Retry location' }),
    ).toBeVisible();
    await capture(page, `legacy-location-recovery-${device}`);
    await restoreLocation(page);
    await page.getByRole('button', { name: 'Retry location' }).click();
    await expect(
      page.getByRole('heading', { name: 'Awaiting reconnection' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign in/ })).toHaveCount(0);
    await expect(
      page.getByRole('list', { name: 'Attempt status' }),
    ).toBeVisible();
    await capture(page, `legacy-pending-${device}`);
  });
}

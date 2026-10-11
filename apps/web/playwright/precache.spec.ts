import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { buildPlayerProfile } from '../tests/fixtures/player-profile';
import type { CachedPack } from '../src/offline/store';

const playerId = '17700000-0000-4000-8000-000000000099';
async function reads(
  context: BrowserContext,
  pack?: CachedPack,
  role = 'player',
) {
  await context.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    if (path.endsWith('/auth/me'))
      body = {
        id: playerId,
        role,
        playerName: 'naledi-star',
        playerNameSetupRequired: false,
        lifecycleStatus: 'active',
        connectionStrategy: 'auth0',
        requestId: 'fixture',
      };
    else if (path.endsWith('/events'))
      body = {
        events: pack
          ? [
              {
                ...pack.pack.event,
                availability: 'active',
                startsAt: pack.pack.validFrom,
                endsAt: pack.pack.validUntil,
              },
            ]
          : [],
        requestId: 'fixture',
      };
    else if (path.endsWith('/offline-challenge-packs'))
      body = { packs: pack ? [pack] : [], requestId: 'fixture' };
    else if (path.endsWith('/profiles/me'))
      body = { ...buildPlayerProfile(), requestId: 'fixture' };
    else if (path.endsWith('/author/cards'))
      body = { cards: [], requestId: 'fixture' };
    else if (path.endsWith('/author/events'))
      body = { events: [], requestId: 'fixture' };
    else if (path.endsWith('/offline-challenge-attempts'))
      return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } });
    else return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
    await route.fulfill({ json: body });
  });
}

async function installed(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
}
async function paths(page: Page) {
  return page.evaluate(async () => {
    const entries = await Promise.all(
      (await caches.keys())
        .filter((key) => key.startsWith('wits-world-shell-'))
        .map(async (key) =>
          (await (await caches.open(key)).keys()).map(
            (request) => new URL(request.url).pathname,
          ),
        ),
    );
    return entries.flat();
  });
}
async function navigate(page: Page, pathname: string) {
  await page.evaluate(
    (path) => window.history.pushState({}, '', path),
    pathname,
  );
}
test.beforeEach(async ({ request }) => {
  await request.post('/__audit__/version', { data: { version: 'after' } });
  await request.post('/__audit__/failure', { data: { prefix: '' } });
  await request.post('/__audit__/reset', { data: {} });
});

test('essential shell installs; unrelated modules wait for demand and remain available offline after loading', async ({
  page,
  context,
  request,
}) => {
  await reads(context, undefined, 'author');
  await page.goto('/');
  await expect(page.locator('.hero')).toBeVisible();
  await installed(page);
  const initial = await paths(page);
  expect(
    initial.some(
      (path) => path.includes('OfflinePages-') && path.endsWith('.js'),
    ),
  ).toBe(true);
  expect(
    initial.filter((path) =>
      /(?:Workspace|ProfilePage|StatusEmojiPicker|mapbox-gl|worker)-.*\.js$/.test(
        path,
      ),
    ),
  ).toEqual([]);
  const log = await (await request.get('/__audit__/network')).json();
  expect(
    log.requests.some((entry: { pathname: string }) =>
      entry.pathname.includes('EventWorkspace-'),
    ),
  ).toBe(false);
  await navigate(page, '/author/events');
  await expect(
    page.getByRole('heading', { name: 'Events', exact: true }),
  ).toBeVisible();
  await navigate(page, '/profile');
  await expect(
    page.getByRole('heading', { name: 'naledi-star', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Set.*status|Edit.*status/ }).click();
  await expect(
    page.getByRole('button', { name: 'Choose status emoji' }),
  ).toBeEnabled();
  const loadedFeatures = (urls: string[]) =>
    urls.filter((path) =>
      /(?:EventWorkspace|ProfilePage|StatusEmojiPicker)-.*\.js$/.test(path),
    );
  await expect
    .poll(async () => loadedFeatures(await paths(page)).length)
    .toBe(3);
  const cached = loadedFeatures(await paths(page));
  expect(cached).toHaveLength(3);
  await context.setOffline(true);
  expect(
    await page.evaluate(
      async (urls) =>
        Promise.all(urls.map(async (url) => (await fetch(url)).status)),
      cached,
    ),
  ).toEqual([200, 200, 200]);
  await page.goto('/offline');
  await expect(
    page.getByRole('heading', { name: 'Downloads & saved attempts' }),
  ).toBeVisible();
  await page.goto('/');
  await expect(page.locator('.hero')).toBeVisible();
});

for (const format of ['multiple_choice', 'ordering'] as const) {
  test(`${format}: saved challenge code is available before its first visit and answers survive offline reload`, async ({
    page,
    context,
  }) => {
    const pack: CachedPack = {
      packToken: 'local-fixture-only',
      pack: {
        version: 1,
        packId: randomUUID(),
        playerId,
        issuedAt: new Date().toISOString(),
        validFrom: new Date(Date.now() - 1000).toISOString(),
        validUntil: new Date(Date.now() + 3600000).toISOString(),
        event: {
          eventId: randomUUID(),
          version: 1,
          title: 'Precache offline event',
          description: 'Local fixture',
          latitude: -26,
          longitude: 28,
          radiusMetres: 75,
        },
        challengeId: randomUUID(),
        challengeVersion: 1,
        format,
        timeLimitSeconds: 150,
        questions: Array.from({ length: 5 }, (_, index) => ({
          id: randomUUID(),
          version: 1,
          prompt: `Saved question ${index + 1}`,
          difficulty: 1,
          options: Array.from({ length: 4 }, (_, option) => ({
            id: randomUUID(),
            text: `Choice ${option + 1}`,
          })),
        })),
      },
    };
    await reads(context, pack);
    let connected = true;
    let accept = false;
    let submissions = 0;
    await context.route('**/api/v1/**', async (route) => {
      if (!connected) return route.abort('internetdisconnected');
      if (
        !new URL(route.request().url()).pathname.endsWith(
          '/offline-challenge-attempts',
        )
      )
        return route.fallback();
      submissions++;
      expect(route.request().postDataJSON().answers).toHaveLength(5);
      return route.fulfill(
        accept
          ? {
              json: {
                attempt: { attemptId: randomUUID(), status: 'completed' },
                requestId: 'fixture',
              },
            }
          : { status: 503, json: { code: 'UNAVAILABLE' } },
      );
    });
    await page.goto('/');
    await installed(page);
    connected = false;
    await context.setOffline(true);
    // First entry comes directly from the downloaded event link.
    await page.goto(`/explore?event=${pack.pack.event.eventId}`);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    for (let index = 1; index <= 5; index++) {
      await expect(
        page.getByRole('heading', {
          name: `Saved question ${index}`,
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
        await expect(
          page.getByRole('heading', { name: 'Saved question 2', exact: true }),
        ).toBeVisible();
        await page.reload();
      }
    }
    await expect(
      page.getByText(
        'Saved on this device. Pending server validation; no reward confirmed.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText(
        'Saved on this device. Pending server validation; no reward confirmed.',
        { exact: true },
      ),
    ).toBeVisible();
    const state = await page.evaluate(
      async () =>
        new Promise<{ answers: number; status: string }>((resolve, reject) => {
          const open = indexedDB.open('wits-world-offline');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const request = db
              .transaction('attempts')
              .objectStore('attempts')
              .getAll();
            request.onsuccess = () => {
              const attempt = request.result[0];
              db.close();
              resolve({
                answers: attempt.answers.length,
                status: attempt.status,
              });
            };
          };
        }),
    );
    expect(state).toEqual({ answers: 5, status: 'pending' });
    connected = true;
    await context.setOffline(false);
    // Saved answers survive automatic session restoration after reconnect.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => submissions).toBeGreaterThan(0);
    await expect(
      page.getByRole('button', { name: 'Retry sync', exact: true }),
    ).toBeEnabled();
    const failedSubmissions = submissions;
    accept = true;
    await page.getByRole('button', { name: 'Retry sync', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Attempt confirmed' }),
    ).toBeVisible();
    expect(submissions).toBeGreaterThan(failedSubmissions);
    expect((await paths(page)).every((path) => !path.includes('/api/'))).toBe(
      true,
    );
  });
}

test('failed first installation leaves online navigation usable and retries successfully', async ({
  page,
  context,
  request,
}) => {
  await request.post('/__audit__/failure', {
    data: { prefix: '/assets/OfflinePages-' },
  });
  await reads(context);
  await page.addInitScript(() => {
    const states: string[] = [];
    Object.assign(window, { __installStates: states });
    const register = navigator.serviceWorker.register.bind(
      navigator.serviceWorker,
    );
    navigator.serviceWorker.register = async (...args) => {
      const reg = await register(...args);
      reg.addEventListener('updatefound', () =>
        reg.installing?.addEventListener('statechange', () =>
          states.push(reg.installing?.state ?? 'redundant'),
        ),
      );
      return reg;
    };
  });
  await page.goto('/');
  await expect(page.locator('.hero')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __installStates: string[] }
        ).__installStates.includes('redundant'),
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
  ).toBe(false);
  await request.post('/__audit__/failure', { data: { prefix: '' } });
  await page.evaluate(() =>
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }),
  );
  await installed(page);
});

test('upgrade failure preserves the active shell; activation retains one previous build and preserves IndexedDB', async ({
  page,
  context,
  request,
}) => {
  await request.post('/__audit__/version', { data: { version: 'before' } });
  await reads(context);
  await page.goto('/');
  await installed(page);
  const oldKeys = await page.evaluate(() => caches.keys());
  await navigate(page, '/offline');
  await expect(
    page.getByRole('heading', { name: 'Downloads & saved attempts' }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await caches.open('unrelated-fixture-cache');
  });
  await request.post('/__audit__/version', { data: { version: 'after' } });
  await request.post('/__audit__/failure', { data: { prefix: '/index.html' } });
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.update();
  });
  await expect
    .poll(async () => {
      const log = await (await request.get('/__audit__/network')).json();
      return log.requests.some(
        (entry: { pathname: string; status: number }) =>
          entry.pathname === '/index.html' && entry.status === 503,
      );
    })
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return Boolean(reg?.active) && !reg?.installing && !reg?.waiting;
      }),
    )
    .toBe(true);
  expect(
    (await page.evaluate(() => caches.keys())).some((key) =>
      oldKeys.includes(key),
    ),
  ).toBe(true);
  await request.post('/__audit__/failure', { data: { prefix: '' } });
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.update();
  });
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
      ),
    )
    .toBe(true);
  await page.evaluate(async () => {
    (await navigator.serviceWorker.getRegistration())?.waiting?.postMessage(
      'ACTIVATE_UPDATE',
    );
  });
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await caches.keys()).filter((key) =>
            key.startsWith('wits-world-shell-'),
          ).length,
      ),
    )
    .toBe(2);
  const keys = await page.evaluate(() => caches.keys());
  expect(keys.some((key) => oldKeys.includes(key))).toBe(true);
  expect(keys).toContain('unrelated-fixture-cache');
  expect(
    (await page.evaluate(() => indexedDB.databases())).some(
      (db) => db.name === 'wits-world-offline',
    ),
  ).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Downloads & saved attempts' }),
  ).toBeVisible();
});

test('comparable installation and warm-navigation measurements', async ({
  browser,
  request,
}, info) => {
  test.skip(!process.env.PRECACHE_MEASURE, 'Opt-in fixture measurements');
  test.setTimeout(600_000);
  const samples = [];
  // Pair builds within each viewport/run to reduce machine/load drift. These
  // are local fixture observations, not a statistical performance guarantee.
  for (const mobile of [true, false])
    for (let run = 1; run <= 3; run++)
      for (const version of run % 2
        ? ['before', 'after']
        : ['after', 'before']) {
        await request.post('/__audit__/version', { data: { version } });
        await request.post('/__audit__/reset', { data: {} });
        const context = await browser.newContext({
          viewport: mobile
            ? { width: 390, height: 844 }
            : { width: 1440, height: 1000 },
          deviceScaleFactor: mobile ? 3 : 2,
          serviceWorkers: 'allow',
        });
        await reads(context);
        const page = await context.newPage();
        if (mobile) {
          const session = await context.newCDPSession(page);
          await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        }
        const started = performance.now();
        await page.goto('http://127.0.0.1:5193/', { waitUntil: 'commit' });
        await expect(page.locator('.hero')).toBeVisible();
        const homeReadyMs = performance.now() - started;
        await installed(page);
        const installReadyMs = performance.now() - started;
        await page.waitForLoadState('networkidle');
        const initial = await (await request.get('/__audit__/network')).json();
        await request.post('/__audit__/reset', { data: {} });
        const warmStarted = performance.now();
        await navigate(page, '/offline');
        await expect(
          page.getByRole('heading', { name: 'Downloads & saved attempts' }),
        ).toBeVisible();
        const warmReadyMs = performance.now() - warmStarted;
        await navigate(page, '/');
        await expect(page.locator('.hero')).toBeVisible();
        await page.waitForLoadState('networkidle');
        const warm = await (await request.get('/__audit__/network')).json();
        samples.push({
          version,
          mobile,
          run,
          homeReadyMs,
          installReadyMs,
          warmReadyMs,
          initial: initial.requests,
          warm: warm.requests,
          cacheEntries: (await paths(page)).length,
        });
        await context.close();
      }
  await writeFile(
    info.outputPath('measurements.json'),
    JSON.stringify(samples, null, 2),
  );
});

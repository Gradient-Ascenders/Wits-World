import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { buildPlayerProfile } from '../tests/fixtures/player-profile';
import { buildStandings } from '../tests/fixtures/progression';
import {
  activePvpListResponse,
  pvpHistoryResponse,
} from '../tests/fixtures/pvp';

async function installReads(context: BrowserContext, role = 'player') {
  const calls: string[] = [];
  await context.route('**/api/v1/**', async (route) => {
    expect(route.request().method()).toBe('GET');
    const pathname = new URL(route.request().url()).pathname.replace(
      '/api/v1',
      '',
    );
    calls.push(pathname);
    const requestId = 'lazy-route-browser-fixture';
    let body: unknown;
    if (pathname === '/auth/me')
      body = {
        requestId,
        connectionStrategy: 'auth0',
        id: '17700000-0000-4000-8000-000000000099',
        lifecycleStatus: 'active',
        playerName: 'naledi-star',
        playerNameSetupRequired: false,
        role,
      };
    else if (pathname === '/events') body = { events: [], requestId };
    else if (pathname === '/matches/cpu/entry')
      body = { activeMatch: null, selectedDeck: null, requestId };
    else if (pathname === '/matches/history') body = { matches: [], requestId };
    else if (pathname === '/matches/pvp')
      body = await activePvpListResponse([]).json();
    else if (pathname === '/matches/pvp/history')
      body = await pvpHistoryResponse([]).json();
    else if (pathname.startsWith('/profiles/'))
      body = {
        ...buildPlayerProfile(
          pathname === '/profiles/me'
            ? {}
            : {
                isOwner: false,
                isPublic: true,
                version: null,
                activity: null,
                achievements: buildPlayerProfile().achievements.filter(
                  (badge) => badge.earned,
                ),
                playerName: 'campus-explorer',
              },
        ),
        requestId,
      };
    else if (pathname === '/progression/standings')
      body = { ...buildStandings(), requestId };
    else if (pathname === '/author/cards') body = { cards: [], requestId };
    else if (pathname === '/author/events') body = { events: [], requestId };
    else if (pathname.startsWith('/author/analytics/'))
      body = {
        items: [],
        page: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
        minimumSampleSize: 10,
        requestId,
      };
    else {
      await route.fulfill({
        status: 404,
        json: { code: 'NOT_FOUND', requestId },
      });
      return;
    }
    // Constant fixture wait in both builds; no real API or account is contacted.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({ json: body });
  });
  return calls;
}

function scripts(page: Page) {
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => /\/assets\/.*\.js$/.test(name)),
  );
}

async function navigate(page: Page, pathname: string) {
  await page.evaluate(
    (path) => window.history.pushState({}, '', path),
    pathname,
  );
}

test('ordinary player routes exclude Author and unneeded Profile modules', async ({
  page,
  context,
}) => {
  await installReads(context);
  await page.goto('/');
  await expect(page.locator('.hero')).toBeVisible();
  await navigate(page, '/matches');
  await expect(
    page.getByRole('link', { name: 'Choose deck', exact: true }),
  ).toBeVisible();
  await navigate(page, '/leaderboard');
  await expect(
    page.getByRole('heading', { name: 'Campus standings' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'naledi-star', exact: true }),
  ).toBeVisible();
  expect(
    (await scripts(page)).filter((url) =>
      /Workspace-|AuthorConsolePage-|ProfilePage-|StatusEmojiPicker-/.test(url),
    ),
  ).toEqual([]);
});

test('Profile deep links defer emojis until status editing and retain focus', async ({
  page,
  context,
}) => {
  await installReads(context);
  await page.goto('/players/campus-explorer');
  await expect(
    page.getByRole('heading', { name: 'campus-explorer', exact: true }),
  ).toBeVisible();
  expect(
    (await scripts(page)).some((url) => url.includes('StatusEmojiPicker-')),
  ).toBe(false);
  await navigate(page, '/profile');
  await expect(
    page.getByRole('heading', { name: 'naledi-star', exact: true }),
  ).toBeVisible();
  const trigger = page.getByRole('button', {
    name: /Set.*status|Edit.*status/,
  });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Set your status' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Choose status emoji' }),
  ).toBeEnabled();
  expect(
    (await scripts(page)).some((url) => url.includes('StatusEmojiPicker-')),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('delayed emojis leave the dialog and text fields usable without shifting the trigger', async ({
  page,
  context,
}) => {
  await installReads(context);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/assets/StatusEmojiPicker-*.js', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/profile');
  await page.getByRole('button', { name: /Set.*status|Edit.*status/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Set your status' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Close profile editor' }),
  ).toBeFocused();
  const emoji = dialog.getByRole('button', { name: 'Choose status emoji' });
  await expect(emoji).toBeDisabled();
  const before = await emoji.boundingBox();
  await dialog
    .getByRole('textbox', { name: 'Status', exact: true })
    .fill('In exam mode');
  release();
  await expect(emoji).toBeEnabled();
  expect(await emoji.boundingBox()).toEqual(before);
  await expect(
    dialog.getByRole('textbox', { name: 'Status', exact: true }),
  ).toHaveValue('In exam mode');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('Author deep links load only their workspace and reuse cached code across navigation', async ({
  page,
  context,
}) => {
  const calls = await installReads(context, 'author');
  const workspaceRequests: string[] = [];
  page.on('request', (request) => {
    if (/Workspace-.*\.js$/.test(request.url()))
      workspaceRequests.push(request.url());
  });
  await page.goto('/author/analytics/questions');
  await expect(
    page.getByRole('heading', { name: 'Question performance', exact: true }),
  ).toBeVisible();
  expect(
    workspaceRequests.filter((url) => !url.includes('AnalyticsWorkspace-')),
  ).toEqual([]);
  await page.getByRole('link', { name: 'Events', exact: true }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Events', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('main')).toBeFocused();
  const firstAnalytics = workspaceRequests.filter((url) =>
    url.includes('AnalyticsWorkspace-'),
  ).length;
  await navigate(page, '/author/analytics/questions');
  await expect(
    page.getByRole('heading', { name: 'Question performance', exact: true }),
  ).toBeVisible();
  expect(
    workspaceRequests.filter((url) => url.includes('AnalyticsWorkspace-')),
  ).toHaveLength(firstAnalytics);
  expect(calls).not.toContain('/profiles/me');
});

test('Author permissions and signed-out Profile access remain guarded', async ({
  page,
  context,
}) => {
  const calls = await installReads(context);
  await page.goto('/author/events');
  await expect(
    page.getByRole('heading', { name: 'Author permission is required' }),
  ).toBeVisible();
  expect(calls.filter((path) => path.startsWith('/author/'))).toEqual([]);
  await navigate(page, '/profile');
  await expect(
    page.getByRole('heading', { name: 'naledi-star', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'naledi-star, account menu' }).click();
  await page.getByRole('button', { name: /Sign out/ }).click();
  await expect(
    page.getByRole('button', { name: /Sign in/ }).first(),
  ).toBeVisible();
  expect(calls.filter((path) => path === '/profiles/me')).toHaveLength(1);
});

test('failed workspace imports use page-file recovery and reload', async ({
  page,
  context,
}) => {
  await installReads(context, 'author');
  await page.route('**/assets/AnalyticsWorkspace-*.js', (route) =>
    route.abort('failed'),
  );
  await page.goto('/author/analytics');
  await expect(
    page.getByRole('heading', { name: 'This page needs to reload' }),
  ).toBeVisible();
  await page.unroute('**/assets/AnalyticsWorkspace-*.js');
  await page.getByRole('button', { name: 'Reload this page' }).click();
  await expect(
    page.getByRole('heading', { name: 'No attention signals', exact: true }),
  ).toBeVisible();
});

test('a delayed workspace preserves the sidebar and cannot mount after navigating away', async ({
  page,
  context,
}) => {
  const calls = await installReads(context, 'author');
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/assets/AnalyticsWorkspace-*.js', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/author/analytics');
  await expect(
    page.getByRole('status').filter({ hasText: 'Opening author workspace' }),
  ).toBeAttached();
  const events = page
    .getByRole('link', { name: 'Events', exact: true })
    .first();
  await events.click();
  await expect(
    page.getByRole('heading', { name: 'Events', exact: true }),
  ).toBeVisible();
  release();
  await page.waitForLoadState('networkidle');
  expect(calls.filter((path) => path.startsWith('/author/analytics/'))).toEqual(
    [],
  );
  await expect(page.getByRole('main')).toBeFocused();
});

test('failed emoji imports use page recovery and do not leave a dialog behind', async ({
  page,
  context,
}) => {
  await installReads(context);
  await page.route('**/assets/StatusEmojiPicker-*.js', (route) =>
    route.abort('failed'),
  );
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Set a status', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'This page needs to reload' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.unroute('**/assets/StatusEmojiPicker-*.js');
  await page.getByRole('button', { name: 'Reload this page' }).click();
  await expect(
    page.getByRole('heading', { name: 'naledi-star', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Set a status', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Choose status emoji' }),
  ).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Set a status', exact: true }),
  ).toBeFocused();
});

test('already-loaded emoji code remains usable offline without a second download', async ({
  page,
  context,
}) => {
  await installReads(context);
  let requests = 0;
  page.on('request', (request) => {
    if (/StatusEmojiPicker-.*\.js$/.test(request.url())) requests += 1;
  });
  await page.goto('/profile');
  const trigger = page.getByRole('button', {
    name: /Set.*status|Edit.*status/,
  });
  await trigger.click();
  await expect(
    page.getByRole('button', { name: 'Choose status emoji' }),
  ).toBeEnabled();
  await page.keyboard.press('Escape');
  await context.setOffline(true);
  await trigger.click();
  await page.getByRole('button', { name: 'Choose status emoji' }).click();
  await expect(
    page.getByRole('combobox', { name: 'Filter emojis' }),
  ).toBeFocused();
  expect(requests).toBe(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test.describe('offline shell and deferred module caching', () => {
  test.use({ serviceWorkers: 'allow' });

  test('deferred Author, Profile and emoji chunks are cached on demand for offline reuse', async ({
    page,
    context,
  }) => {
    await installReads(context);
    await page.goto('/');
    await expect(page.locator('.hero')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      )
      .toBe(true);
    const initialPaths = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      const names = (await caches.keys()).filter((name) =>
        name.startsWith('wits-world-shell-'),
      );
      const entries = await Promise.all(
        names.map(async (name) =>
          (await (await caches.open(name)).keys()).map(
            (request) => new URL(request.url).pathname,
          ),
        ),
      );
      return entries
        .flat()
        .filter((path) =>
          /(?:Workspace|ProfilePage|StatusEmojiPicker)-.*\.js$/.test(path),
        );
    });
    expect(initialPaths).toEqual([]);
    const paths = await page.evaluate(async () => {
      const source = await (await fetch('/sw.js')).text();
      const start = source.indexOf('[{');
      const manifest = JSON.parse(
        source.slice(start, source.indexOf(']', start) + 1),
      ) as Array<{ url: string }>;
      const urls = manifest
        .map((entry) => `/${entry.url}`)
        .filter((url) =>
          /(?:Workspace|ProfilePage|StatusEmojiPicker)-.*\.js$/.test(url),
        );
      const statuses = await Promise.all(
        urls.map(async (url) => (await fetch(url)).status),
      );
      if (!statuses.every((status) => status === 200))
        throw new Error('Deferred fixture module unavailable');
      return urls;
    });
    for (const feature of [
      'EventWorkspace',
      'CardWorkspace',
      'CampaignWorkspace',
      'AnalyticsWorkspace',
      'TrustReviewWorkspace',
      'EventPlacementWorkspace',
      'ReviewWorkspace',
      'ProfilePage',
      'StatusEmojiPicker',
    ]) {
      expect(paths.some((path) => path.includes(`${feature}-`))).toBe(true);
    }
    await expect
      .poll(() =>
        page.evaluate(async (urls) => {
          const names = (await caches.keys()).filter((name) =>
            name.startsWith('wits-world-shell-'),
          );
          const cached = await Promise.all(
            names.map(async (name) =>
              (await (await caches.open(name)).keys()).map(
                (entry) => new URL(entry.url).pathname,
              ),
            ),
          );
          return urls.every((url) => cached.flat().includes(url));
        }, paths),
      )
      .toBe(true);
    await context.setOffline(true);
    const statuses = await page.evaluate(
      async (urls) =>
        Promise.all(urls.map(async (url) => (await fetch(url)).status)),
      paths,
    );
    expect(statuses.every((status) => status === 200)).toBe(true);
    await page.reload();
    await expect(page.locator('.hero')).toBeVisible();
  });
});

test('production navigation measurements', async ({ browser }, info) => {
  test.skip(
    !process.env.LAZY_MEASURE,
    'Opt-in comparable production-build measurements.',
  );
  test.setTimeout(600_000);
  const results: unknown[] = [];
  for (const mobile of [true, false]) {
    for (let run = 1; run <= 3; run += 1) {
      for (const role of ['player', 'author']) {
        const context = await browser.newContext({
          viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 1000 },
          deviceScaleFactor: mobile ? 3 : 2,
          serviceWorkers: 'block',
        });
        await installReads(context, role);
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', {
          rate: mobile ? 4 : 1,
        });
        if (mobile) {
          await cdp.send('Network.enable');
          await cdp.send('Network.emulateNetworkConditions', {
            offline: false,
            latency: 150,
            downloadThroughput: 200_000,
            uploadThroughput: 100_000,
          });
        }
        await page.addInitScript(() => {
          const metrics = { cls: 0, shifts: 0 };
          Object.assign(window, { lazyMetrics: metrics });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const shift = entry as PerformanceEntry & {
                value: number;
                hadRecentInput: boolean;
              };
              metrics.shifts += shift.value;
              if (!shift.hadRecentInput) metrics.cls += shift.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
        });
        const stages =
          role === 'player'
            ? [
                ['home', '/', '.hero'],
                ['Battles first', '/matches', 'Choose deck'],
                ['Profile first', '/profile', 'naledi-star'],
                ['home repeat', '/', '.hero'],
                ['Battles repeat', '/matches', 'Choose deck'],
                ['Profile repeat', '/profile', 'naledi-star'],
              ]
            : [
                ['home', '/', '.hero'],
                ['Author first', '/author/events', 'Events'],
                [
                  'Analytics first',
                  '/author/analytics',
                  'No attention signals',
                ],
                ['Author repeat', '/author/events', 'Events'],
                [
                  'Analytics repeat',
                  '/author/analytics',
                  'No attention signals',
                ],
              ];
        for (const [stage, pathname, ready] of stages) {
          const started = performance.now();
          if (stage === 'home')
            await page.goto(`http://127.0.0.1:5186${pathname}`, {
              waitUntil: 'commit',
            });
          else await navigate(page, pathname!);
          if (ready!.startsWith('.'))
            await expect(page.locator(ready!)).toBeVisible();
          else
            await expect(
              page.getByRole(ready === 'Choose deck' ? 'link' : 'heading', {
                name: ready,
                exact: true,
              }),
            ).toBeVisible();
          if (pathname === '/author/events')
            await expect(
              page.getByText('No authored events yet', { exact: true }),
            ).toBeVisible();
          const readyMs = performance.now() - started;
          await page.waitForLoadState('networkidle');
          const resources = await page.evaluate(() => ({
            js: performance
              .getEntriesByType('resource')
              .filter((entry) => /\/assets\/.*\.js$/.test(entry.name))
              .map((entry) => {
                const resource = entry as PerformanceResourceTiming;
                return {
                  url: resource.name.split('/').at(-1),
                  transferred: resource.transferSize,
                  encoded: resource.encodedBodySize,
                  decoded: resource.decodedBodySize,
                };
              }),
            ...(
              window as unknown as Window & {
                lazyMetrics: { cls: number; shifts: number };
              }
            ).lazyMetrics,
          }));
          results.push({ mobile, run, role, stage, readyMs, ...resources });
        }
        await context.close();
      }
    }
  }
  const file =
    process.env.LAZY_MEASUREMENT_FILE ??
    info.outputPath('navigation-measurements.json');
  await writeFile(file, `${JSON.stringify(results, null, 2)}\n`);
});

import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { CachedPack } from '../src/offline/store';
import { captureScreenshot } from './visual-capture';

async function campusFixture(page: Page) {
  const playerId = randomUUID();
  const cached: CachedPack = {
    packToken: 'fixture-only-not-a-signature',
    pack: {
      version: 1,
      packId: randomUUID(),
      playerId,
      locationPolicy: 'arrival-v1',
      issuedAt: new Date().toISOString(),
      validFrom: new Date(Date.now() - 1000).toISOString(),
      validUntil: new Date(Date.now() + 3600000).toISOString(),
      event: {
        eventId: randomUUID(),
        version: 1,
        title: 'Great Hall visit',
        description: 'A downloaded campus challenge.',
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
      },
      challengeId: randomUUID(),
      challengeVersion: 1,
      format: 'multiple_choice',
      timeLimitSeconds: 90,
      questions: Array.from({ length: 5 }, (_, index) => ({
        id: randomUUID(),
        version: 1,
        prompt: `Question ${index + 1}`,
        difficulty: 1,
        options: Array.from({ length: 4 }, (_, option) => ({
          id: randomUUID(),
          text: `Option ${option + 1}`,
        })),
      })),
    },
  };
  const network = { available: true };
  await page
    .context()
    .route('http://127.0.0.1:3999/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (
        !network.available &&
        (path.endsWith('/trails') ||
          path.includes('/territory/') ||
          path.endsWith('/nearby-unvisited'))
      ) {
        return route.abort('internetdisconnected');
      }
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
            : path.endsWith('/trails')
              ? { trails: [], requestId: 'fixture' }
              : path.endsWith('/territory/zones')
                ? { zones: [] }
                : path.endsWith('/nearby-unvisited')
                  ? { events: [], requestId: 'fixture' }
                  : undefined;
      return body
        ? route.fulfill({ json: body })
        : route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
    });
  return network;
}

async function waitForSavedShell(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const urls = (
          await Promise.all(
            (await caches.keys()).map(async (key) =>
              (await caches.open(key)).keys(),
            ),
          )
        )
          .flat()
          .map((request) => request.url);
        return urls.filter((url) => /great-hall-hero.*\.webp$/.test(url))
          .length;
      }),
    )
    .toBe(3);
}

async function unobstructed(page: Page, selector: string) {
  const control = page.locator(selector);
  await expect(control).toBeInViewport();
  await expect
    .poll(() =>
      control.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          ),
        );
      }),
    )
    .toBe(true);
}

for (const [width, height, viewport] of [
  [1440, 900, 'desktop'],
  [390, 844, 'mobile'],
] as const) {
  test(`${viewport}: homepage artwork survives a saved signed-out session and cold offline image reads`, async ({
    page,
    context,
    browser,
  }) => {
    await page.setViewportSize({ width, height });
    await campusFixture(page);
    await page.goto('/');
    await waitForSavedShell(page);
    const hero = page.locator('.hero__media img');
    await expect
      .poll(() =>
        hero.evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    const source = await hero.getAttribute('src');
    await captureScreenshot(test.info(), page, {
      path: `home-signed-in-${viewport}.png`,
      animations: 'disabled',
    });
    await page.goto('/offline');
    await expect(page.getByText(/^Ready for offline play/)).toBeVisible();
    // Model an expired SDK session while preserving the account-bound downloads.
    await context.addInitScript(() =>
      localStorage.setItem('wits-world.e2e.signed-out', 'true'),
    );
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: 'Sign in', exact: true }),
    ).toBeVisible();
    await expect(hero).toHaveAttribute('src', source!);
    await expect(
      page.locator('.offline-status, .offline-preparation'),
    ).toHaveCount(0);
    await captureScreenshot(test.info(), page, {
      path: `home-signed-out-saved-${viewport}.png`,
      animations: 'disabled',
    });
    // Clear the HTTP image cache so only the prepared service worker can supply it.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.clearBrowserCache');
    await context.setOffline(true);
    await page.goto('/');
    await expect
      .poll(() =>
        hero.evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(
      page.locator('.offline-status, .offline-preparation'),
    ).toHaveCount(0);
    await captureScreenshot(test.info(), page, {
      path: `home-signed-out-offline-${viewport}.png`,
      animations: 'disabled',
    });

    const fresh = await browser.newContext({ viewport: { width, height } });
    try {
      await fresh.addInitScript(() =>
        localStorage.setItem('wits-world.e2e.signed-out', 'true'),
      );
      const visitor = await fresh.newPage();
      await visitor.goto(new URL('/', page.url()).href);
      await expect(
        visitor.getByRole('button', { name: 'Sign in', exact: true }),
      ).toBeVisible();
      await expect(visitor.locator('.hero__media img')).toHaveAttribute(
        'src',
        source!,
      );
      await expect
        .poll(() =>
          visitor
            .locator('.hero__media img')
            .evaluate((img) => (img as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
      await expect(
        visitor.locator('.offline-status, .offline-preparation'),
      ).toHaveCount(0);
      await captureScreenshot(test.info(), visitor, {
        path: `home-fresh-visitor-${viewport}.png`,
        animations: 'disabled',
      });
    } finally {
      await fresh.close();
    }
  });

  test(`${viewport}: Events, selection and search survive offline exploration and reconnection`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await campusFixture(page);
    await page.goto('/offline');
    await expect(page.getByText(/^Ready for offline play/)).toBeVisible();
    await page.goto('/explore');
    const panel = page.locator('#explore-event-sheet');
    if ((await panel.getAttribute('data-sheet-view')) === 'peek') {
      await page.getByRole('button', { name: /^Events —/ }).click();
    }
    await page
      .getByRole('searchbox', { name: 'Search campus events' })
      .fill('Great Hall');
    await page
      .getByRole('list', { name: 'Campus events' })
      .getByRole('button', { name: /Great Hall visit/ })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Great Hall visit', exact: true }),
    ).toBeVisible();
    await context.setOffline(true);
    await expect(page.locator('.offline-campus-map')).toBeVisible();
    for (const label of ['Nearby', 'Trails', 'Territories']) {
      await expect(
        page.getByRole('button', { name: new RegExp(`^(Open )?${label}$`) }),
      ).toHaveCount(0);
    }
    await expect(
      page.getByRole('heading', { name: 'Great Hall visit', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.offline-status')).toHaveCount(0);
    for (const selector of [
      '.location-control',
      '.offline-campus-map__zoom button:first-child',
      '.explore-connection-status a',
      '.offline-campus-map__attribution a:first-child',
    ]) {
      await unobstructed(page, selector);
    }
    const attribution = page.locator('.offline-campus-map__attribution');
    const box = await attribution.boundingBox();
    expect(box!.width).toBeLessThan(240);
    expect(box!.height).toBeLessThan(40);
    await expect(
      attribution.getByRole('link', { name: 'ODbL' }),
    ).toHaveAttribute('href', 'https://opendatacommons.org/licenses/odbl/1-0/');
    await captureScreenshot(test.info(), page, {
      path: `explore-offline-selected-${viewport}.png`,
      animations: 'disabled',
    });
    await attribution.locator('summary').click();
    await expect(
      attribution.getByText(/Paths are not verified walking directions/),
    ).toBeVisible();
    await attribution.locator('summary').click();
    const map = page.getByRole('group', { name: /Downloaded campus map/ });
    await page.getByRole('button', { name: 'Zoom in campus map' }).click();
    const bounds = await map.getAttribute('viewBox');
    await page.getByRole('button', { name: 'All events', exact: true }).click();
    await expect(
      page.getByRole('searchbox', { name: 'Search campus events' }),
    ).toHaveValue('Great Hall');
    await page
      .getByRole('button', { name: 'Collapse events', exact: true })
      .click();
    await captureScreenshot(test.info(), page, {
      path: `explore-offline-peek-${viewport}.png`,
      animations: 'disabled',
    });
    if (viewport === 'desktop') {
      await expect(
        page
          .getByRole('navigation', { name: 'Explore shortcuts' })
          .getByRole('button'),
      ).toHaveCount(1);
    }
    await context.setOffline(false);
    await expect(page.locator('.offline-campus-map')).toHaveCount(0);
    await context.setOffline(true);
    await expect(map).toBeVisible();
    const resumedBounds = (await map.getAttribute('viewBox'))!
      .split(' ')
      .map(Number);
    bounds!
      .split(' ')
      .map(Number)
      .forEach((coordinate, index) => {
        expect(resumedBounds[index]).toBeCloseTo(coordinate, 5);
      });
    await context.setOffline(false);
    await expect(page.locator('.offline-campus-map')).toHaveCount(0);
    if (viewport === 'desktop') {
      await expect(
        page.getByRole('button', { name: 'Open Trails', exact: true }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Open Events', exact: true })
        .click();
    } else {
      await page.locator('.event-panel__peek').click();
      await page
        .getByRole('button', { name: 'All events', exact: true })
        .click();
    }
    await expect(
      page.getByRole('searchbox', { name: 'Search campus events' }),
    ).toHaveValue('Great Hall');
    for (const label of ['Nearby', 'Trails', 'Territories']) {
      await expect(
        page.getByRole('button', { name: label, exact: true }),
      ).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test('API failures in Nearby, Trails and Territories return safely to saved Events', async ({
  page,
}) => {
  const network = await campusFixture(page);
  await page.goto('/offline');
  await expect(page.getByText(/^Ready for offline play/)).toBeVisible();
  for (const section of ['Nearby', 'Trails', 'Territories']) {
    network.available = true;
    await page.goto('/explore');
    await expect(
      page.getByRole('button', { name: section, exact: true }),
    ).toBeVisible();
    network.available = false;
    await page.getByRole('button', { name: section, exact: true }).click();
    await expect(page.locator('.offline-campus-map')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Campus events', exact: true }),
    ).toBeVisible();
    for (const label of ['Nearby', 'Trails', 'Territories']) {
      await expect(
        page.getByRole('button', { name: new RegExp(`^(Open )?${label}$`) }),
      ).toHaveCount(0);
    }
  }
});

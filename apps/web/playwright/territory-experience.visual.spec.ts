import { expect, test, type Page } from '@playwright/test';

const ZONE_IDS = [
  'ebca0505-5e5d-60b4-5c06-e8f2acba42bf',
  '86083389-be58-667c-d680-e77de2b1f730',
  'aad9ded4-ba42-aa7b-f10c-40ad67fd624e',
] as const;
const SEASON_ID = '37700000-0000-4000-8000-000000000001';

// Campus times must stay in Johannesburg even on a device abroad.
test.use({ timezoneId: 'America/Los_Angeles' });

test('territory map and list stay equivalent at desktop and mobile widths', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  const runtimeErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await installRoutes(page);

  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto('/explore');
  await page.getByRole('button', { name: 'Territories' }).click();
  await expect(
    page.getByRole('heading', { name: 'Campus territories' }),
  ).toBeFocused();
  await expect(
    page.getByRole('list', { name: 'Campus territories' }),
  ).toBeVisible();
  await expect(
    page.locator('[data-deterministic-territories] [data-territory-region-id]'),
  ).toHaveCount(3);
  const eastZone = page.getByRole('button', {
    name: /Open East Campus, active, Owned by blue_witsie/,
  });
  await eastZone.hover();
  const [territoryRowBox, territoryScrollBox] = await Promise.all([
    eastZone.boundingBox(),
    page.locator('.event-panel__scroll').boundingBox(),
  ]);
  expect(territoryRowBox?.x).toBe(territoryScrollBox?.x);
  expect(territoryRowBox?.width).toBe(territoryScrollBox?.width);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('territory-list-desktop.png'),
  });

  const rules = page.getByText(/Eligible wins add influence after the match/);
  await expect(rules).toBeHidden();
  await page.getByText('How territories work').focus();
  await page.keyboard.press('Enter');
  await expect(rules).toBeVisible();

  await eastZone.focus();
  await page.keyboard.press('Enter');
  const territoryLoading = page.getByRole('status').filter({
    hasText: 'Loading territory activity',
  });
  await expect(territoryLoading).toBeVisible();
  await expect(territoryLoading.locator('.quest-marker')).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('territory-loading-desktop.png'),
  });
  await expect(
    page.getByRole('heading', { name: 'East Campus' }),
  ).toBeFocused();
  await expect(page.locator('.site-header--explore')).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByText('9 influence from 4 contributors')).toBeVisible();
  await expect(page.getByText('22:00 SAST')).toBeVisible();
  await expect(page.getByText('22:00 SAST')).toHaveAttribute(
    'title',
    'Johannesburg time (SAST, UTC+2)',
  );
  await expect(page.getByText('2 / 5')).toBeVisible();
  await expect(page.getByText('blue_witsie took ownership')).toBeVisible();
  await expect(page.locator('.territory-detail')).not.toContainText(
    ZONE_IDS[0],
  );
  await expect(
    page.getByRole('button', { name: /Contest|Join Ranked/i }),
  ).toHaveCount(0);
  await page.locator('.event-panel__back').hover();
  await expect(page.locator('.event-panel__back')).toHaveCSS(
    'border-radius',
    '10px',
  );
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('territory-detail-desktop.png'),
  });

  await page.getByRole('button', { name: 'Map layers', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Territory boundaries' }).uncheck();
  await expect(page.locator('[data-deterministic-territories]')).toBeHidden();
  await expect(
    page.getByRole('heading', { name: 'East Campus' }),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: 'Territory boundaries' }).check();
  await expect(page.locator('[data-deterministic-territories]')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.setViewportSize({ height: 844, width: 390 });
  await page.reload();
  const sheetTrigger = page.getByRole('button', { name: /^Events —/ });
  await expect(sheetTrigger).toBeInViewport({ ratio: 1 });
  await sheetTrigger.click();
  await page.getByRole('button', { name: 'Territories' }).click();
  await expect(
    page.getByRole('heading', { name: 'Campus territories' }),
  ).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('territory-list-mobile.png'),
  });

  await page.getByRole('button', { name: 'Collapse territories' }).click();
  await page.locator(`[data-territory-region-id="${ZONE_IDS[0]}"]`).click();
  await expect(
    page.getByRole('button', { name: 'Lower territory sheet' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Collapse territory details' })
    .click();
  await page
    .getByRole('button', {
      name: 'Territories — East Campus selected, open details',
    })
    .click();
  await expect(
    page.getByRole('button', { name: 'Lower territory sheet' }),
  ).toBeVisible();

  await expect(
    page.getByRole('heading', { name: 'East Campus' }),
  ).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Lower territory sheet' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'This hour' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('territory-detail-mobile.png'),
  });

  await page
    .getByRole('heading', { name: 'History', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(page.getByText('blue_witsie took ownership')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('territory-history-mobile.png'),
  });

  await installRoutes(page, true);
  await page.reload();
  await page.getByRole('button', { name: /^Events —/ }).click();
  await page.getByRole('button', { name: 'Territories', exact: true }).click();
  await page.getByRole('button', { name: /Open Arts and Community/ }).click();
  await expect(page.getByText('No influence yet.')).toBeVisible();
  await expect(page.getByText('22:00 SAST')).toBeVisible();
  await expect(page.locator('.territory-activity')).toHaveCount(0);
  await expect(page.getByText('0 / 5')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('territory-empty-mobile.png'),
  });
  await page.setViewportSize({ height: 900, width: 1440 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('territory-empty-desktop.png'),
  });

  expect(consoleErrors).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

async function installRoutes(page: Page, emptyContest = false): Promise<void> {
  const zones = [
    zoneFixture(
      ZONE_IDS[0],
      emptyContest ? 'Arts and Community' : 'East Campus',
      'active',
      emptyContest ? null : { playerName: 'blue_witsie' },
      0,
    ),
    zoneFixture(ZONE_IDS[1], 'West Campus', 'active', null, 0.003),
    zoneFixture(ZONE_IDS[2], 'Education Campus', 'suspended', null, 0.006),
  ];

  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) {
      await route.fulfill({
        json: {
          connectionStrategy: 'auth0',
          id: '17700000-0000-4000-8000-000000000099',
          lifecycleStatus: 'active',
          playerName: 'territory_player',
          playerNameSetupRequired: false,
          requestId: 'territory-browser',
          role: 'player',
        },
      });
      return;
    }
    if (path.endsWith('/offline-challenge-packs')) {
      await route.fulfill({ json: { packs: [] } });
      return;
    }
    if (path.endsWith('/events')) {
      await route.fulfill({
        json: { events: [], requestId: 'territory-browser' },
      });
      return;
    }
    if (path.endsWith('/territory/zones')) {
      await route.fulfill({ json: { zones } });
      return;
    }
    if (path.endsWith(`/territory/zones/${ZONE_IDS[0]}`)) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        json: {
          ...zones[0],
          lastSettledAt: '2026-09-26T14:00:05.000Z',
          lifecycleVersion: 3,
        },
      });
      return;
    }
    if (path.endsWith(`/territory/zones/${ZONE_IDS[0]}/standings`)) {
      await route.fulfill({
        json: {
          activity: emptyContest
            ? { contributors: 0, influence: 0 }
            : { contributors: 4, influence: 9 },
          seasonId: SEASON_ID,
          top: emptyContest
            ? []
            : [
                { influence: 4, rank: 1 },
                { influence: 3, rank: 2 },
                { influence: 2, rank: 3 },
              ],
          viewer: {
            dailyCap: 5,
            influence: emptyContest ? 0 : 2,
            remainingDailyInfluence: emptyContest ? 5 : 3,
            todayInfluence: emptyContest ? 0 : 2,
          },
          zoneId: ZONE_IDS[0],
        },
      });
      return;
    }
    if (path.endsWith(`/territory/zones/${ZONE_IDS[0]}/history`)) {
      await route.fulfill({
        json: {
          entries: emptyContest
            ? [
                {
                  effectiveAt: '2026-09-20T06:00:00.000Z',
                  owner: null,
                  seasonId: SEASON_ID,
                  transitionKind: 'activated',
                },
              ]
            : [
                {
                  effectiveAt: '2026-09-26T14:00:05.000Z',
                  owner: { playerName: 'blue_witsie' },
                  seasonId: SEASON_ID,
                  transitionKind: 'settlement',
                },
                {
                  effectiveAt: '2026-09-20T06:00:00.000Z',
                  owner: null,
                  seasonId: SEASON_ID,
                  transitionKind: 'activated',
                },
              ],
          zoneId: ZONE_IDS[0],
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { message: 'Not found' } });
  });
}

function zoneFixture(
  zoneId: string,
  name: string,
  status: 'active' | 'suspended',
  owner: { playerName: string } | null,
  longitudeOffset: number,
) {
  const west = 28.027 + longitudeOffset;
  const east = west + 0.0025;
  return {
    geometry: {
      coordinates: [
        [
          [west, -26.194],
          [east, -26.194],
          [east, -26.1915],
          [west, -26.194],
        ],
      ],
      type: 'Polygon',
    },
    name,
    owner,
    seasonId: SEASON_ID,
    status,
    windowEnd: '2026-09-26T20:00:00.000Z',
    windowStart: '2026-09-26T19:00:00.000Z',
    zoneId,
  };
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

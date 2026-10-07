import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect, test, type Page } from '@playwright/test';
import { selectOption } from './select-option';

const eventId = '10000000-0000-4000-8000-000000000001';
const challengeId = '20000000-0000-4000-8000-000000000001';
const questionId = '30000000-0000-4000-8000-000000000001';
const titles = [
  'Great Hall Discovery',
  'Library lawns',
  'MSL Open Day',
  'Science and Discovery: an extended campus event title',
  'East campus',
  'West campus',
];
function id(prefix: string, index: number) {
  return `${prefix}0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}
function pageResult(items: object[], extra: Record<string, unknown> = {}) {
  return {
    items,
    page: 1,
    pageSize: 25,
    totalItems: items.length,
    totalPages: items.length ? 1 : 0,
    minimumSampleSize: 10,
    requestId: 'analytics-browser-fixture',
    ...extra,
  };
}

async function installAnalyticsApi(page: Page) {
  const calls: string[] = [];
  let failOverview = false;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    calls.push(route.request().url());
    let body: object = { requestId: 'analytics-browser-fixture' };
    if (path === '/auth/me')
      body = {
        ...body,
        id: id('9', 0),
        role: 'author',
        lifecycleStatus: 'active',
        playerName: 'author-e2e',
        playerNameSetupRequired: false,
        connectionStrategy: 'auth0',
      };
    else if (path === '/author/cards') body = { ...body, cards: [] };
    else if (path === '/author/events') body = { ...body, events: [] };
    else if (path === '/author/analytics/attention') {
      if (failOverview) {
        await route.fulfill({
          status: 503,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Unavailable',
            detail: 'Unavailable',
            status: 503,
            code: 'INTERNAL_ERROR',
            requestId: 'analytics-browser-fixture',
          }),
        });
        return;
      }
      body = pageResult(
        titles.map((eventTitle, index) => ({
          eventId: id('1', index),
          eventTitle,
          ignoredLocationCount: index % 3,
          easyQuestionCount: index + 1,
          hardQuestionCount: 6 - index,
          questionId: id('3', index),
          challengeId,
        })),
      );
    } else if (path === '/author/analytics/event-locations')
      body = pageResult(
        titles.map((locationName, index) => ({
          eventId: id('1', index),
          eventTitle: locationName,
          locationName,
          locationId: id('4', index),
          locationKind: 'authored',
          viewCount: index === 5 ? null : 120 - index * 10,
          eligibleCount: index === 4 ? 0 : 60 - index * 10,
          startCount: index === 4 ? 0 : 50 - index * 10,
          completionCount: index >= 4 ? 0 : 40 - index * 10,
          suppressed: index === 5,
        })),
      );
    else if (path === '/author/analytics/questions')
      body = pageResult(
        titles.map((eventTitle, index) => ({
          eventId: id('1', index),
          eventTitle,
          challengeId,
          questionId: id('3', index),
          prompt:
            index === 3
              ? 'Which campus landmark connects the historic origins of the university with its present-day science and discovery programme?'
              : `Which landmark belongs to ${eventTitle}?`,
          format: 'multiple_choice',
          difficulty: 2,
          status: 'published',
          answerCount: index === 5 ? null : index === 4 ? 0 : 100,
          correctCount:
            index === 5 ? null : index === 4 ? 0 : [30, 95, 60, 50][index],
          incorrectCount:
            index === 5 ? null : index === 4 ? 0 : [70, 5, 40, 50][index],
          timeoutCount: index === 5 ? null : 0,
          correctRate:
            index === 5 ? null : index === 4 ? 0 : [0.3, 0.95, 0.6, 0.5][index],
          incorrectRate:
            index === 5 ? null : index === 4 ? 0 : [0.7, 0.05, 0.4, 0.5][index],
          classification:
            index === 0
              ? 'problematic'
              : index === 1
                ? 'easy'
                : index === 5
                  ? 'suppressed'
                  : 'normal',
          suppressed: index === 5,
        })),
        { easyCorrectRate: 0.9, problematicIncorrectRate: 0.7 },
      );
    else if (path === '/author/analytics/card-issuance')
      body = pageResult(
        titles.map((name, index) => ({
          cardDefinitionId: id('5', index),
          cardName: `${name} reward`,
          rarity: index % 2 ? 'rare' : 'common',
          rewardEligible: index !== 3,
          issuanceCount: index === 5 ? null : 100 - index * 10,
          issuancesPer100Completions: index === 5 ? null : 50 - index * 5,
          suppressed: index === 5,
        })),
        {
          rarities: ['common', 'rare', 'epic', 'legendary'].map(
            (rarity, index) => ({
              rarity,
              issuanceCount:
                index === 1 ? null : index === 2 ? 0 : 240 - index * 60,
              issuancesPer100Completions:
                index === 1 ? null : index === 2 ? 0 : 120 - index * 30,
              suppressed: index === 1,
            }),
          ),
        },
      );
    else if (path === '/events') body = { ...body, events: [] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return {
    calls,
    failOverview: (value: boolean) => {
      failOverview = value;
    },
  };
}

for (const width of [1280, 1440, 1694]) {
  test(`desktop analytics stays focused and readable at ${width}px`, async ({
    page,
  }) => {
    const state = await installAnalyticsApi(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/author/analytics');
    await expect(
      page.getByRole('region', { name: 'Event attention results' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Overview', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      state.calls.filter((url) => url.includes('/author/analytics/')).length,
    ).toBe(1);
    await mkdir('.impeccable/review/analytics', { recursive: true });
    for (const [label, report] of [
      ['Overview', 'Event attention results'],
      ['Locations', 'Location analytics results'],
      ['Questions', 'Question analytics results'],
      ['Rewards', 'Card issuance results'],
    ] as const) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByRole('region', { name: report })).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Analytics', exact: true }),
      ).toBeVisible();
      const geometry = await page.evaluate(() => ({
        width: window.innerWidth,
        scroll: document.documentElement.scrollWidth,
        plots: [
          ...document.querySelectorAll(
            '.analytics-report:not([hidden]) .analytics-plot svg',
          ),
        ]
          .filter((el) => el.getBoundingClientRect().width)
          .map((el) => ({
            width: el.getBoundingClientRect().width,
            viewBox: el.getAttribute('viewBox'),
          })),
      }));
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `.impeccable/review/analytics/${label.toLowerCase()}-${width}.png`,
        fullPage: true,
      });
    }
    await selectOption(
      page
        .getByRole('region', { name: 'Rewards report' })
        .getByLabel('Chart metric'),
      'count',
    );
    await expect(
      page.getByRole('heading', { name: 'Cards issued by rarity' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Locations', exact: true }).click();
    await selectOption(
      page
        .getByRole('region', { name: 'Locations report' })
        .getByLabel('Chart metric'),
      'completionCount',
    );
    await expect(
      page.getByRole('heading', { name: 'Completions by location' }),
    ).toBeVisible();
    const row = page
      .getByRole('region', { name: 'Locations report' })
      .locator('.analytics-plot__row')
      .filter({ has: page.locator('text', { hasText: 'Great Hall' }) })
      .first();
    await row.focus();
    await expect(row).toBeFocused();
    await expect(page.locator('.analytics-plot__detail:visible')).toContainText(
      'Great Hall Discovery',
    );
    expect(errors).toEqual([]);
  });
}

test('direct report routes retain a shared period and recover overview independently', async ({
  page,
}) => {
  const state = await installAnalyticsApi(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/author/analytics/questions');
  await expect(
    page.getByRole('region', { name: 'Question analytics results' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Questions', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await selectOption(page.getByLabel('Reporting period'), 'custom');
  await page.getByLabel('Start date', { exact: true }).fill('2026-09-01');
  await page.getByLabel('End date', { exact: true }).fill('2026-09-30');
  await page.getByRole('button', { name: 'Apply period', exact: true }).click();
  await page.getByRole('link', { name: 'Locations', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Location analytics results' }),
  ).toBeVisible();
  expect(
    state.calls
      .filter((url) => url.includes('/analytics/event-locations'))
      .at(-1),
  ).toContain('fromDate=2026-09-01&toDate=2026-10-01');
  await page.goBack();
  await expect(
    page.getByRole('link', { name: 'Questions', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  state.failOverview(true);
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('link', { name: 'Rewards', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Card issuance results' }),
  ).toBeVisible();
  state.failOverview(false);
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('region', { name: 'Event attention results' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Review question' }).first().click();
  await expect(page).toHaveURL(
    `/author/events/${eventId}/challenges/${challengeId}/questions/${questionId}`,
  );
});

test('desktop reports keep controls reachable at native 200% browser zoom', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'analytics-zoom-'));
  await mkdir(path.join(profile, 'Default'));
  // Chromium stores browser zoom as an exponent of its 1.2 zoom step.
  await writeFile(
    path.join(profile, 'Default', 'Preferences'),
    JSON.stringify({
      partition: { default_zoom_level: { x: Math.log(2) / Math.log(1.2) } },
    }),
  );
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium',
    viewport: null,
    deviceScaleFactor: undefined,
    baseURL: 'http://127.0.0.1:5179',
    args: ['--window-size=1280,1000'],
  });
  try {
    const page = await context.newPage();
    await installAnalyticsApi(page);
    await page.goto('/author/analytics');
    const zoom = await page.evaluate(() => ({
      width: window.innerWidth,
      pixelRatio: window.devicePixelRatio,
    }));
    expect(zoom.pixelRatio).toBe(2);
    expect(zoom.width).toBeLessThanOrEqual(640);
    for (const report of ['Overview', 'Locations', 'Questions', 'Rewards']) {
      const tab = page.getByRole('link', { name: report, exact: true });
      await page.keyboard.press('Tab');
      await tab.focus();
      const focusBounds = await tab.evaluate((element) => ({
        bottom: element.getBoundingClientRect().bottom,
        top: element.getBoundingClientRect().top,
        navigationTop: document
          .querySelector('.primary-navigation--mobile')!
          .getBoundingClientRect().top,
      }));
      expect(focusBounds.top).toBeGreaterThanOrEqual(0);
      expect(focusBounds.bottom).toBeLessThanOrEqual(focusBounds.navigationTop);
      await page.keyboard.press('Enter');
      await expect(
        page
          .locator(
            '.analytics-report:not([hidden]) .analytics-table-wrap:visible table',
          )
          .first(),
      ).toBeVisible();
      if (report === 'Questions') {
        await page
          .locator('.analytics-report:not([hidden]) summary')
          .filter({ hasText: 'More filters' })
          .click();
        for (const label of ['Challenge', 'Format', 'Difficulty']) {
          const field = page
            .getByRole('region', { name: 'Questions report' })
            .getByLabel(label, { exact: true });
          const size = await field.evaluate(
            (element) => element.getBoundingClientRect().width,
          );
          expect(size).toBeGreaterThanOrEqual(200);
        }
        await page
          .getByRole('button', { name: 'Apply filters', exact: true })
          .click();
      }
      if (
        await page
          .getByRole('button', { name: 'Edit dates', exact: true })
          .count()
      ) {
        await page
          .getByRole('button', { name: 'Edit dates', exact: true })
          .click();
      } else {
        await selectOption(page.getByLabel('Reporting period'), 'custom');
      }
      await page.getByLabel('Start date', { exact: true }).fill('2026-09-01');
      await page.getByLabel('End date', { exact: true }).fill('2026-09-30');
      await page.keyboard.press('Tab');
      await tab.focus();
      const expandedFocus = await tab.evaluate((element) => ({
        top: element.getBoundingClientRect().top,
        bottom: element.getBoundingClientRect().bottom,
        navigationTop: document
          .querySelector('.primary-navigation--mobile')!
          .getBoundingClientRect().top,
      }));
      expect(expandedFocus.top).toBeGreaterThanOrEqual(0);
      expect(expandedFocus.bottom).toBeLessThanOrEqual(
        expandedFocus.navigationTop,
      );
      if (report === 'Questions') {
        const focusSession = await context.newCDPSession(page);
        const focusedCapture = await focusSession.send(
          'Page.captureScreenshot',
          { format: 'png' },
        );
        await writeFile(
          '.impeccable/review/analytics/report-tabs-zoom200-focus.png',
          Buffer.from(focusedCapture.data, 'base64'),
        );
        await focusSession.detach();
      }
      const width = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(width.document).toBeLessThanOrEqual(width.viewport + 1);
      await page.evaluate(() => window.scrollTo(0, 0));
      // Playwright's full-page clip uses CSS pixels and crops native zoom;
      // capture the complete device-pixel content through Chromium instead.
      const session = await context.newCDPSession(page);
      const metrics = await session.send('Page.getLayoutMetrics');
      const capture = await session.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width: metrics.contentSize.width,
          height: metrics.contentSize.height,
          scale: 1,
        },
      });
      await writeFile(
        `.impeccable/review/analytics/${report.toLowerCase()}-zoom200.png`,
        Buffer.from(capture.data, 'base64'),
      );
      await writeFile(
        `.impeccable/review/analytics/${report.toLowerCase()}-zoom-metrics.json`,
        JSON.stringify(
          { zoom, width, metrics, focusBounds, expandedFocus },
          null,
          2,
        ),
      );
      await session.detach();
      await page
        .getByRole('button', { name: 'Apply period', exact: true })
        .click();
    }
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('charts enlarge their text and geometry for comfortable reading', async ({
  page,
}) => {
  await installAnalyticsApi(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/author/analytics/questions');
  const chart = page.locator('.analytics-plot__chart').first();
  const svg = chart.locator('svg');
  await expect(svg).toBeVisible();
  const before = await svg.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    fontSize: Number.parseFloat(
      getComputedStyle(el.querySelector('text')!).fontSize,
    ),
  }));
  // Apply the persisted settings through the same cross-tab preference path.
  await page.evaluate(() => {
    const key = 'wits-world.accessibility-preferences.v1';
    const newValue = JSON.stringify({ scale: '150', reading: 'comfortable' });
    localStorage.setItem(key, newValue);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
  });
  await expect(page.locator('html')).toHaveAttribute('data-ui-scale', '150');
  await expect
    .poll(() =>
      svg.evaluate((el) =>
        Number.parseFloat(getComputedStyle(el.querySelector('text')!).fontSize),
      ),
    )
    .toBe(18);
  await expect
    .poll(() => svg.evaluate((el) => el.getBoundingClientRect().height))
    .toBeGreaterThan(before.height * 1.5);
  for (const width of [320, 640, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await svg.evaluate((el) => ({
      rendered: el.getBoundingClientRect().width,
      declared: (el as SVGSVGElement).viewBox.baseVal.width,
      labelSizes: Array.from(el.querySelectorAll('text')).map((text) =>
        Number.parseFloat(getComputedStyle(text).fontSize),
      ),
    }));
    expect(bounds.rendered).toBeCloseTo(bounds.declared, 0);
    expect(Math.min(...bounds.labelSizes)).toBeGreaterThanOrEqual(18);
    const rows = await svg
      .locator('.analytics-plot__row')
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect()),
      );
    for (let index = 1; index < rows.length; index++) {
      expect(rows[index]!.top).toBeGreaterThanOrEqual(rows[index - 1]!.bottom);
    }
    await chart.scrollIntoViewIfNeeded();
    await chart.focus();
    await expect(chart).toBeFocused();
    await page.keyboard.press('End');
    await page.screenshot({
      path: test.info().outputPath(`${width}-150-chart.png`),
    });
  }
  expect(before.fontSize).toBe(12);
});

test('Author reports retain previous-query content through a delayed failed update and retry', async ({
  page,
}) => {
  const state = await installAnalyticsApi(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/author/analytics');
  const results = page.getByRole('region', { name: 'Event attention results' });
  await expect(results).toBeVisible();
  let release: () => void = () => {};
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/author/analytics/attention?**', async (route) => {
    await paused;
    await route.fallback();
  });
  state.failOverview(true);
  await selectOption(page.getByLabel('Reporting period'), '7');
  await expect(
    page.getByRole('status').filter({ hasText: 'Showing the previous result' }),
  ).toBeVisible();
  await expect(results).toBeVisible();
  await expect(
    results.getByRole('link', { name: 'Great Hall Discovery' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Events', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('author-retained-query.png'),
    fullPage: true,
  });
  release();
  await expect(
    page.getByRole('button', { name: 'Retry update' }),
  ).toBeVisible();
  await expect(results).toBeVisible();
  state.failOverview(false);
  await page.getByRole('button', { name: 'Retry update' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Showing the previous result' }),
  ).toHaveCount(0);
  await expect(results).toBeVisible();
  // A workspace revisit uses the console-owned snapshot, then confirms it again.
  await page.getByRole('link', { name: 'Events', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Events', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Analytics', exact: true }).click();
  await expect(results).toBeVisible();
});

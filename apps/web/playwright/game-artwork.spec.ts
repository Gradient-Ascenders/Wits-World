import { expect, test, type BrowserContext } from '@playwright/test';
import { buildPlayerProfile } from '../tests/fixtures/player-profile';

const achievements = (
  [
    ['first_quiz', 'First Quiz'],
    ['perfect_quiz', 'Perfect Quiz'],
    ['five_quizzes', 'Campus Explorer'],
    ['first_cpu_win', 'First Victory'],
    ['five_cpu_matches', 'Battle Tested'],
    ['three_day_streak', 'On a Roll'],
  ] as const
).map(([code, title]) => ({
  code,
  title,
  description: 'Complete the supplied achievement requirement.',
  earned: true,
  progress: 5,
  target: 5,
}));

async function installReadFixtures(context: BrowserContext) {
  await context.route('http://127.0.0.1:3999/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    expect(route.request().method()).toBe('GET');
    if (pathname.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          connectionStrategy: 'auth0',
          id: '17700000-0000-4000-8000-000000000099',
          lifecycleStatus: 'active',
          playerName: 'naledi-star',
          playerNameSetupRequired: false,
          role: 'player',
          requestId: 'artwork-browser',
        },
      });
    if (pathname.endsWith('/profiles/me'))
      return route.fulfill({
        json: {
          ...buildPlayerProfile({ achievements }),
          requestId: 'artwork-browser',
        },
      });
    if (pathname.endsWith('/events'))
      return route.fulfill({
        json: {
          events: [],
          requestId: 'artwork-browser',
        },
      });
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
  });
}

test('campus and every atlas cell remain sharp, bounded and accessible across density and text sizes', async ({
  browser,
}, info) => {
  for (const [width, dpr, scale] of [
    [320, 1, '100'],
    [390, 3, '100'],
    [768, 2, '100'],
    [1440, 2, '100'],
    [390, 3, '150'],
    [1440, 2, '150'],
  ] as const) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: dpr,
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
    });
    try {
      await installReadFixtures(context);
      await context.addInitScript(
        (scale) =>
          localStorage.setItem(
            'wits-world.accessibility-preferences.v1',
            JSON.stringify({ scale }),
          ),
        scale,
      );
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:4180/');
      await expect(page.locator('html')).toHaveAttribute(
        'data-ui-scale',
        scale,
      );
      const campus = page.getByRole('img', {
        name: /Illustrated bird's-eye view/,
      });
      await campus.scrollIntoViewIfNeeded();
      const campusDelivery = await campus.evaluate(
        async (image: HTMLImageElement) => {
          await image.decode();
          const box = image.getBoundingClientRect();
          const width = Number(
            /-(\d+)-[^/]+\.webp$/.exec(image.currentSrc)?.[1],
          );
          return {
            width,
            display: box.width,
            ratio: box.width / box.height,
            dpr: devicePixelRatio,
          };
        },
      );
      expect(campusDelivery.ratio).toBeCloseTo(4 / 3, 3);
      expect(campusDelivery.width).toBeGreaterThanOrEqual(
        Math.min(1448, campusDelivery.display * dpr),
      );
      await expect(
        page.getByRole('link', { name: 'Explore campus from Great Hall' }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`campus-${width}-${dpr}-${scale}.png`),
        animations: 'disabled',
      });
      await page.goto('http://127.0.0.1:4180/profile');
      const badges = page.locator('.showcase-badges');
      await badges.scrollIntoViewIfNeeded();
      await expect(badges.getByRole('button')).toHaveCount(6);
      const cells = await badges
        .locator('.showcase-badge-art img')
        .evaluateAll(async (images) => {
          return Promise.all(
            images.map(async (element) => {
              const image = element as HTMLImageElement;
              await image.decode();
              const box = image.getBoundingClientRect();
              const cell = image.parentElement!.getBoundingClientRect();
              return {
                source: Number(
                  /-(\d+)-[^/]+\.webp$/.exec(image.currentSrc)?.[1],
                ),
                display: box.width,
                left: Math.round((box.left - cell.left) / cell.width),
                top: Math.round((box.top - cell.top) / cell.height),
                width: box.width / cell.width,
                height: box.height / cell.height,
              };
            }),
          );
        });
      expect(cells.map((cell) => [cell.left, cell.top])).toEqual([
        [0, 0],
        [-1, 0],
        [-2, 0],
        [0, -1],
        [-1, -1],
        [-2, -1],
      ]);
      for (const cell of cells) {
        expect(cell.width).toBeCloseTo(3, 3);
        expect(cell.height).toBeCloseTo(2, 3);
        expect(cell.source).toBeGreaterThanOrEqual(
          Math.min(1536, cell.display * dpr),
        );
      }
      await page.screenshot({
        path: info.outputPath(`badges-${width}-${dpr}-${scale}.png`),
        animations: 'disabled',
      });
      const trigger = page.getByRole('button', {
        name: 'First Quiz: Earned',
        exact: true,
      });
      await trigger.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', {
        name: 'First Quiz',
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole('button', { name: 'Close First Quiz details' }),
      ).toBeFocused();
      const enlarged = await dialog
        .locator('.showcase-badge-art img')
        .evaluate(async (image: HTMLImageElement) => {
          await image.decode();
          return {
            source: Number(/-(\d+)-[^/]+\.webp$/.exec(image.currentSrc)?.[1]),
            display: image.getBoundingClientRect().width,
          };
        });
      expect(enlarged.source).toBeGreaterThanOrEqual(
        Math.min(1536, enlarged.display * dpr),
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`dialog-${width}-${dpr}-${scale}.png`),
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    } finally {
      await context.close();
    }
  }
});

for (const outcome of ['success', 'close-before-load'] as const) {
  test(`decoded dialog preview stays visible during a delayed mobile image request: ${outcome}`, async ({
    browser,
  }, info) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requests = 0;
    try {
      await installReadFixtures(context);
      await context.route('**/achievements-1536-*.webp', async (route) => {
        requests++;
        await gate;
        await route.continue();
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.goto('http://127.0.0.1:4180/profile');
      const trigger = page.getByRole('button', {
        name: 'First Quiz: Earned',
        exact: true,
      });
      await trigger.scrollIntoViewIfNeeded();
      await trigger
        .locator('img')
        .evaluate(async (image: HTMLImageElement) => image.decode());
      expect(requests).toBe(0);
      await trigger.focus();
      const started = await page.evaluate(() => performance.now());
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', {
        name: 'First Quiz',
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole('button', { name: 'Close First Quiz details' }),
      ).toBeFocused();
      const focused = await page.evaluate(() => performance.now());
      const preview = dialog.locator('canvas');
      await expect(preview).toBeVisible();
      const canvas = (await preview.elementHandle())!;
      expect(
        await preview.evaluate((canvas: HTMLCanvasElement) =>
          canvas
            .getContext('2d')!
            .getImageData(0, 0, 512, 512)
            .data.some((value, index) => index % 4 === 3 && value > 0),
        ),
      ).toBe(true);
      await expect(dialog.locator('img')).toBeHidden();
      await expect.poll(() => requests).toBe(1);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const previewPainted = await page.evaluate(() => performance.now());
      await info.attach('dialog-preview-timings', {
        body: JSON.stringify({
          cpuSlowdown: 4,
          focus_ms: focused - started,
          preview_two_frames_ms: previewPainted - started,
          highResolutionRequestStillBlocked: true,
        }),
        contentType: 'application/json',
      });
      await page.screenshot({
        path: info.outputPath('dialog-delayed-preview.png'),
        animations: 'disabled',
      });
      if (outcome === 'success') {
        release();
        await expect(dialog.locator('img')).toBeVisible();
        await expect(preview).toHaveCount(0);
        expect(
          await dialog
            .locator('img')
            .evaluate(
              (image: HTMLImageElement) =>
                image.complete &&
                image.currentSrc.includes('achievements-1536-'),
            ),
        ).toBe(true);
        expect(requests).toBe(1);
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      expect(
        await canvas.evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          return (
            !canvas.isConnected && canvas.width === 0 && canvas.height === 0
          );
        }),
      ).toBe(true);
      if (outcome === 'close-before-load') {
        const delivered = page.waitForResponse((response) =>
          response.url().includes('achievements-1536-'),
        );
        release();
        await delivered;
        await expect(dialog).toBeHidden();
        await expect(page.locator('.showcase-badge-art canvas')).toHaveCount(0);
      }
      await canvas.dispose();
    } finally {
      release();
      await context.close();
    }
  });
}

test('dialog uses a stable medal placeholder if list artwork is unavailable and loading fails', async ({
  page,
  context,
}) => {
  await installReadFixtures(context);
  await context.route('**/achievements-*.webp', (route) =>
    route.abort('failed'),
  );
  await page.goto('/profile');
  const trigger = page.getByRole('button', {
    name: 'First Quiz: Earned',
    exact: true,
  });
  await trigger.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      trigger
        .locator('img')
        .evaluate(
          (image: HTMLImageElement) =>
            image.complete && image.naturalWidth === 0,
        ),
    )
    .toBe(true);
  const failed = page.waitForEvent('requestfailed', {
    predicate: (request) => request.url().includes('achievements-768-'),
  });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'First Quiz', exact: true });
  await failed;
  await expect(dialog.locator('.showcase-badge-placeholder')).toBeVisible();
  await expect(dialog.locator('img')).toBeHidden();
  await expect(dialog.locator('canvas')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('a loaded profile keeps badge dialog artwork when its larger variant is unavailable offline', async ({
  page,
  context,
}, info) => {
  await installReadFixtures(context);
  await page.goto('/profile');
  const trigger = page.getByRole('button', {
    name: 'First Quiz: Earned',
    exact: true,
  });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.locator('img').evaluate(async (image: HTMLImageElement) => {
    await image.decode();
  });
  await context.setOffline(true);
  const failed = page.waitForEvent('requestfailed', {
    predicate: (request) => request.url().includes('achievements-'),
  });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'First Quiz', exact: true });
  await expect(dialog).toBeVisible();
  await failed;
  await expect(dialog.locator('img')).toBeHidden();
  const canvas = (await dialog.locator('canvas').elementHandle())!;
  await expect
    .poll(() =>
      dialog.locator('canvas').evaluate((canvas: HTMLCanvasElement) =>
        canvas
          .getContext('2d')!
          .getImageData(0, 0, 512, 512)
          .data.some((value, index) => index % 4 === 3 && value > 0),
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath('badge-dialog-offline.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(
    await canvas.evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      return !canvas.isConnected && canvas.width === 0 && canvas.height === 0;
    }),
  ).toBe(true);
  await canvas.dispose();
});

test('all campus responsive variants retain the original precached offline availability', async ({
  page,
  context,
}) => {
  await installReadFixtures(context);
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  const cached = await page.evaluate(async () => {
    const requests = await Promise.all(
      (await caches.keys())
        .filter((key) => key.startsWith('wits-world-shell-'))
        .map(async (key) => (await caches.open(key)).keys()),
    );
    return requests
      .flat()
      .map((request) => new URL(request.url).pathname)
      .filter((url) => url.includes('/campus-transparent-'));
  });
  expect(cached).toHaveLength(4);
  for (const width of [480, 768, 1152, 1448])
    expect(
      cached.some((url) => url.includes(`-${width}-`) && url.endsWith('.webp')),
    ).toBe(true);
  expect(cached.some((url) => url.endsWith('.png'))).toBe(false);
  await context.setOffline(true);
  await page.reload();
  const image = page.getByRole('img', { name: /Illustrated bird's-eye view/ });
  await image.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      image.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(async (urls) => {
      return Promise.all(
        urls.map(async (url) => {
          const response = await fetch(url);
          return response.ok && (await response.arrayBuffer()).byteLength > 0;
        }),
      );
    }, cached),
  ).toEqual([true, true, true, true]);
});

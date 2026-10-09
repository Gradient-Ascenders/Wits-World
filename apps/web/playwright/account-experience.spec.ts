import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { buildCard, buildStarterOptions } from '../tests/fixtures/cards';
import { activeMatch, MATCH_ID } from '../tests/fixtures/matches';

const apiBaseUrl = 'http://127.0.0.1:3999/api/v1';
const playerId = '6fe7dc26-cdea-4275-a2df-861724137cbc';
const deletionId = '00000000-0000-4000-8000-000000000600';

for (const width of [390, 1280]) {
  test(`requests a password reset without a sign-in detour at ${width}px`, async ({
    page,
  }, testInfo) => {
    const errors = monitorRuntimeErrors(page);
    await mockAccountApi(page, 'auth0', 'completed');
    await page.setViewportSize({ height: 844, width });
    let requestedBody: unknown;
    let releaseRequest = () => {};
    const pendingRequest = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await page.route(
      'https://account-e2e.invalid/dbconnections/change_password',
      async (route) => {
        expect(route.request().method()).toBe('POST');
        expect(route.request().headers()).not.toHaveProperty('authorization');
        requestedBody = route.request().postDataJSON();
        await pendingRequest;
        await route.fulfill({
          body: 'Request accepted.',
          contentType: 'text/plain',
          status: 200,
        });
      },
    );

    await page.goto('/account');
    const resetLink = page.getByRole('link', {
      name: 'Reset password',
      exact: true,
    });
    await resetLink.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/account/reset-password');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Reset password' }),
    ).toBeVisible();
    await expect(page).toHaveTitle('Reset password · Wits World');
    const email = page.getByRole('textbox', { name: 'Account email' });
    await email.fill('player@example.test');
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`${width}-reset-form.png`),
    });

    await email.focus();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Send reset link' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Sending...' }),
    ).toBeDisabled();
    await expect(email).toBeDisabled();
    releaseRequest();
    await expect(
      page.getByRole('heading', { name: 'Check your inbox' }),
    ).toBeFocused();
    expect(requestedBody).toEqual({
      client_id: 'account-e2e-client',
      connection: 'Username-Password-Authentication',
      email: 'player@example.test',
    });
    await expect(
      page.getByText(
        'If an account uses this email, you will receive a password-reset link.',
      ),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`${width}-reset-confirmation.png`),
    });
    await page.getByRole('link', { name: 'Back to account settings' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Account settings' }),
    ).toBeVisible();
    await expect(page).toHaveTitle('Account settings · Wits World');
    expect(errors).toEqual([]);
  });
}

test('keeps Google password recovery with Google on a direct reset-page visit', async ({
  page,
}) => {
  await mockAccountApi(page, 'google-oauth2', 'completed');
  await page.goto('/account/reset-password');
  await expect(page.getByText(/Google manages your password/)).toBeVisible();
  await expect(page).toHaveTitle('Reset password · Wits World');
  await expect(
    page.getByRole('link', { name: 'Open Google recovery' }),
  ).toHaveAttribute(
    'href',
    'https://support.google.com/accounts/answer/7682439',
  );
  await expect(
    page.getByRole('textbox', { name: 'Account email' }),
  ).toHaveCount(0);
});

test('keeps the database-account deletion journey focused and accessible on mobile', async ({
  page,
}, testInfo) => {
  const errors = monitorRuntimeErrors(page);
  await mockAccountApi(page, 'auth0', 'retry_pending', 'author');
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/account');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Account settings' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Account details' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Security' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Reset password' }),
  ).toBeVisible();
  const mobileNavigation = page.locator('.primary-navigation--mobile');
  await expect(
    mobileNavigation.getByRole('link', { name: 'Account' }),
  ).toHaveCount(0);
  await expect(
    mobileNavigation.getByRole('link', { name: 'Author' }),
  ).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await captureAccountScreenshot(page, testInfo, '390-account.png');

  const deletionTrigger = page.getByRole('button', {
    name: 'Delete account',
  });
  await deletionTrigger.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Delete account?' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Cancel deletion' }),
  ).toBeFocused();
  await captureAccountScreenshot(page, testInfo, '390-reauth-dialog.png');
  await page.keyboard.press('Escape');
  await expect(deletionTrigger).toBeFocused();

  await page.goto('/account?action=confirm-deletion');
  await expect(
    page.getByRole('heading', { name: 'Permanently delete account?' }),
  ).toBeVisible();
  const acknowledgement = page.getByRole('checkbox', {
    name: /I understand this cannot be undone/iu,
  });
  await acknowledgement.focus();
  await page.keyboard.press('Space');
  await expect(acknowledgement).toBeChecked();
  await page
    .getByRole('button', { name: 'Permanently delete account' })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Account locked. Deletion pending.',
    }),
  ).toBeFocused();
  await expect(
    page.getByText(`Deletion reference: ${deletionId}`),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  expect(errors).toEqual([]);
});

test('uses desktop space without exposing federated credentials', async ({
  page,
}, testInfo) => {
  const errors = monitorRuntimeErrors(page);
  await mockAccountApi(page, 'google-oauth2', 'completed', 'author');
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto('/account');

  const desktopNavigation = page.locator('.primary-navigation--desktop');
  await expect(
    desktopNavigation.getByRole('link', { name: 'Account' }),
  ).toHaveCount(0);
  await expect(
    desktopNavigation.getByRole('link', { name: 'Author' }),
  ).toBeVisible();
  const accountTrigger = page.getByRole('button', {
    name: 'browser-player, account menu',
  });
  await expect(accountTrigger).toHaveAttribute('aria-current', 'page');
  await accountTrigger.click();
  await expect(
    page.getByRole('link', {
      name: 'Account settings, Security and account',
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  await expect(page.getByText('Google', { exact: true })).toBeVisible();
  await expect(page.getByText(/Google manages your password/iu)).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Open Google recovery/iu }),
  ).toHaveAttribute('target', '_blank');
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.keyboard.press('Escape');
  await expect(accountTrigger).toBeFocused();
  await captureAccountScreenshot(page, testInfo, '1440-account.png');
  const motion = page.getByRole('button', { name: /Motion/ });
  await motion.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('option', { name: 'Use device setting' }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({
    path: testInfo.outputPath('1440-account-dropdown.png'),
  });
  await page.keyboard.press('Escape');
  await expect(motion).toBeFocused();
  await page.setViewportSize({ height: 900, width: 768 });
  await expectNoHorizontalOverflow(page);
  await captureAccountScreenshot(page, testInfo, '768-account.png');
  await page.setViewportSize({ height: 900, width: 1440 });

  await page.getByRole('button', { name: 'Delete account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Delete account?' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Cancel deletion' }),
  ).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Sign in again' }),
  ).toBeVisible();
  await captureAccountScreenshot(page, testInfo, '1440-reauth-dialog.png');

  expect(errors).toEqual([]);
});

test('keeps accessibility choices usable and contained across device widths', async ({
  page,
}, testInfo) => {
  const errors = monitorRuntimeErrors(page);
  await mockAccountApi(page, 'auth0', 'completed', 'player');
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/account');
  const motion = page.getByRole('button', { name: /Motion/ });
  await motion.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('option', { name: 'Use device setting' }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({
    path: testInfo.outputPath('390-account-dropdown.png'),
  });
  await page.keyboard.press('Escape');
  await expect(motion).toBeFocused();
  await chooseAccountSetting(page, 'Motion', 'Reduce motion');
  await chooseAccountSetting(page, 'Interface size', '150%');
  await chooseAccountSetting(page, 'Contrast', 'High contrast');
  await chooseAccountSetting(page, 'Reading layout', 'Comfortable');
  await chooseAccountSetting(page, 'Font', 'Plain sans-serif');
  await chooseAccountSetting(page, 'Read aloud', 'On');
  await expect(page.getByRole('button', { name: 'Read page' })).toBeVisible();

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ height: 900, width });
    await expectNoHorizontalOverflow(page);
    if (width === 390) {
      const mobileLabels = page.locator(
        '.primary-navigation--mobile .primary-navigation__label',
      );
      for (const label of await mobileLabels.all()) {
        const dimensions = await label.evaluate((element) => ({
          fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));
        expect(dimensions.fontSize).toBe(18);
        expect(dimensions.scrollWidth).toBeLessThanOrEqual(
          dimensions.clientWidth,
        );
      }
    }
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`${width}-accessibility.png`),
    });
  }

  await page.reload();
  await expect(page.getByRole('button', { name: /Interface size/ })).toHaveText(
    '150%',
  );
  await expect(page.getByRole('button', { name: /Contrast/ })).toHaveText(
    'High contrast',
  );
  await expect(page.getByRole('button', { name: 'Read page' })).toBeVisible();
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Read page' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const header = await page.locator('.site-header').boundingBox();
  const reader = await page.locator('.read-page-control').boundingBox();
  expect(header && reader && reader.y >= header.y + header.height).toBe(true);
  expect(reader!.x + reader!.width).toBeGreaterThan(390 - 80);
  await expect(
    page.getByRole('button', { name: 'Read page' }).locator('svg'),
  ).toHaveCount(1);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('390-home-accessibility.png'),
  });
  await page.goto('/account');
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(page.getByRole('button', { name: 'Read page' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Interface size/ })).toHaveText(
    '100%',
  );
  expect(errors).toEqual([]);
});

test('keeps developer disclosure and one-time keys usable with long names and large UI', async ({
  page,
}, testInfo) => {
  const errors = monitorRuntimeErrors(page);
  await mockAccountApi(page, 'auth0', 'completed');
  const longName = 'Campus integration '.repeat(4).trim();
  const key = {
    id: '00000000-0000-4000-8000-000000000701',
    name: longName,
    keyPrefix: 'ww_api_0123456789abcdef_…',
    createdAt: '2026-10-04T10:00:00.000Z',
    lastUsedAt: null,
    revokedAt: null,
    status: 'active',
  };
  const secret = `ww_api_0123456789abcdef_${'a'.repeat(43)}`;
  let generated = false;
  await page.route(`${apiBaseUrl}/developer/keys`, (route) => {
    if (route.request().method() === 'POST') {
      generated = true;
      return route.fulfill({
        status: 201,
        json: { apiKey: secret, key, requestId: 'browser-created-key' },
      });
    }
    return route.fulfill({
      json: {
        activeKeyLimit: 3,
        keys: generated ? [key] : [],
        requestId: 'browser-key-list',
      },
    });
  });
  await page.route(`${apiBaseUrl}/auth/me`, (route) =>
    route.fulfill({
      json: {
        connectionStrategy: 'auth0',
        id: playerId,
        lifecycleStatus: 'active',
        playerName: 'campus-player-with-a-long-name',
        playerNameSetupRequired: false,
        requestId: 'browser-long-player',
        role: 'player',
      },
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/account');
  const disclosure = page.getByRole('button', {
    name: 'Developer API access',
    exact: true,
  });
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('textbox', { name: 'Key name' })).toBeHidden();
  await disclosure.focus();
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('textbox', { name: 'Key name' }).fill(longName);
  await page.getByRole('button', { name: 'Generate API key' }).click();
  await expect(
    page.getByRole('heading', { name: 'Save this API key now' }),
  ).toBeFocused();
  await expect(disclosure).toHaveAttribute('aria-disabled', 'true');
  await disclosure.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('textbox', { name: 'Generated API key' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'I have saved it' }).click();
  await expect(page.getByRole('textbox', { name: 'Key name' })).toBeFocused();
  await expect(page.getByText(longName, { exact: true })).toBeVisible();

  await chooseAccountSetting(page, 'Interface size', '150%');
  await chooseAccountSetting(page, 'Contrast', 'High contrast');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(page);
    await captureAccountScreenshot(
      page,
      testInfo,
      `${width}-developer-expanded.png`,
    );
  }
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await disclosure.click();
  await expect(page.getByText(longName, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('keeps collection and battle content readable with large high-contrast UI', async ({
  page,
}, testInfo) => {
  const errors = monitorRuntimeErrors(page);
  await mockAccountApi(page, 'auth0', 'completed', 'player');
  await page.addInitScript(() => {
    localStorage.setItem(
      'wits-world.accessibility-preferences.v1',
      JSON.stringify({
        speech: true,
        motion: 'reduce',
        contrast: 'high',
        scale: '150',
        reading: 'comfortable',
        font: 'plain',
      }),
    );
  });
  await page.route(`${apiBaseUrl}/cards/collection`, (route) =>
    route.fulfill({
      json: {
        cards: [buildCard(1, { rarity: 'legendary' })],
        requestId: 'accessibility-collection',
      },
    }),
  );
  await page.route(`${apiBaseUrl}/cards/starter-options`, (route) =>
    route.fulfill({
      json: {
        options: buildStarterOptions(),
        requestId: 'accessibility-starters',
      },
    }),
  );
  const match = activeMatch(1);
  await page.route(`${apiBaseUrl}/matches/**`, (route) =>
    route.fulfill({
      json: {
        ...match,
        requestId: 'accessibility-match',
      },
    }),
  );

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/collection');
    await expect(
      page
        .getByRole('list', { name: 'Owned card designs' })
        .locator(':scope > li'),
    ).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`${width}-collection-accessibility.png`),
    });
    await page.goto(`/matches/${MATCH_ID}`);
    await expect(page.locator('.battle-page')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const combatantBounds = await page
      .locator('.combatant')
      .evaluateAll((combatants) =>
        combatants.map((combatant) => {
          const bounds = combatant.getBoundingClientRect();
          return {
            bottom: bounds.bottom,
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
          };
        }),
      );
    expect(combatantBounds).toHaveLength(2);
    const [firstCombatant, secondCombatant] = combatantBounds;
    const overlapWidth = Math.max(
      0,
      Math.min(firstCombatant!.right, secondCombatant!.right) -
        Math.max(firstCombatant!.left, secondCombatant!.left),
    );
    const overlapHeight = Math.max(
      0,
      Math.min(firstCombatant!.bottom, secondCombatant!.bottom) -
        Math.max(firstCombatant!.top, secondCombatant!.top),
    );
    expect(overlapWidth * overlapHeight).toBe(0);
    for (const value of await page.locator('.combatant__power strong').all()) {
      const fits = await value.evaluate((node) => {
        const parent = node.closest('.combatant__hud')!.getBoundingClientRect();
        const text = node.getBoundingClientRect();
        return (
          text.top >= parent.top - 1 &&
          text.right <= parent.right + 1 &&
          text.bottom <= parent.bottom + 1 &&
          text.left >= parent.left - 1
        );
      });
      expect(fits).toBe(true);
    }
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`${width}-battle-accessibility.png`),
    });
  }
  expect(errors).toEqual([]);
});

async function chooseAccountSetting(page: Page, label: string, option: string) {
  await page.getByRole('button', { name: new RegExp(label) }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function mockAccountApi(
  page: Page,
  connectionStrategy: 'auth0' | 'google-oauth2',
  deletionStatus: 'completed' | 'retry_pending',
  role: 'author' | 'player' = 'player',
) {
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith('/auth/me')) {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          connectionStrategy,
          id: playerId,
          lifecycleStatus: 'active',
          playerName: 'browser-player',
          playerNameSetupRequired: false,
          requestId: 'browser-account-profile',
          role,
        },
        status: 200,
      });
      return;
    }

    if (url.pathname.endsWith('/events')) {
      await route.fulfill({
        json: { events: [], requestId: 'browser-offline-discovery' },
      });
      return;
    }

    if (
      route.request().method() === 'GET' &&
      url.pathname.endsWith('/developer/keys')
    ) {
      await route.fulfill({
        json: {
          activeKeyLimit: 3,
          keys: [],
          requestId: 'browser-developer-api-keys',
        },
      });
      return;
    }

    if (url.pathname.endsWith('/auth/account-deletion')) {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          deletionId,
          requestId: 'browser-account-deletion',
          status: deletionStatus,
        },
        status: deletionStatus === 'completed' ? 200 : 202,
      });
      return;
    }

    await route.fulfill({ status: 404 });
  });
}

function monitorRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function captureAccountScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const showsDialog = await page.getByRole('alertdialog').isVisible();
  await page.screenshot({
    fullPage: !showsDialog,
    path: testInfo.outputPath(name),
  });
  if (!showsDialog) {
    await page.screenshot({
      fullPage: false,
      path: testInfo.outputPath(name.replace('.png', '-viewport.png')),
    });
  }
}

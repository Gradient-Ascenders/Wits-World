import { expect, test, type Page, type TestInfo } from '@playwright/test';

const apiBaseUrl = 'http://127.0.0.1:3999/api/v1';
const playerId = '6fe7dc26-cdea-4275-a2df-861724137cbc';
const deletionId = '00000000-0000-4000-8000-000000000600';

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
  await expect(page.getByText('Wits World player')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Security' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Reset password' }),
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
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
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
      name: 'Your account is locked while cleanup retries',
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
  await page.setViewportSize({ height: 800, width: 1280 });
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
  await expect(page.getByText(/password is managed by Google/iu)).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Open Google recovery/iu }),
  ).toHaveAttribute('target', '_blank');
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.keyboard.press('Escape');
  await expect(accountTrigger).toBeFocused();
  await page.getByRole('button', { name: 'Delete account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Delete account?' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await captureAccountScreenshot(page, testInfo, '1280-reauth-dialog.png');

  expect(errors).toEqual([]);
});

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
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(name),
  });
}

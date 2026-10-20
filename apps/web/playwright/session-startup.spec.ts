import { expect, test } from '@playwright/test';

test('preconnects session origins while keeping protected content behind the account check', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  let releaseIdentity!: () => void;
  const identityWait = new Promise<void>((resolve) => {
    releaseIdentity = resolve;
  });
  await page.route('http://127.0.0.1:3999/api/v1/auth/me', async (route) => {
    await identityWait;
    await route.fulfill({
      json: {
        connectionStrategy: 'auth0',
        id: '00000000-0000-4000-8000-000000000001',
        lifecycleStatus: 'active',
        playerName: 'session-tester',
        playerNameSetupRequired: false,
        requestId: 'session-startup',
        role: 'player',
      },
    });
  });
  await page.goto('/account/reset-password');
  await expect(page.getByText('Restoring session…')).toBeVisible();
  await expect(
    page.locator(
      'head link[rel="preconnect"][href="https://progression-e2e.invalid"]',
    ),
  ).toHaveCount(1);
  await expect(
    page.locator('head link[rel="preconnect"][href="http://127.0.0.1:3999"]'),
  ).toHaveAttribute('crossorigin', 'anonymous');
  await expect(
    page.getByRole('button', { name: /, account menu$/ }),
  ).toHaveCount(0);
  releaseIdentity();
  await expect(
    page.getByRole('button', { name: /, account menu$/ }),
  ).toBeVisible();
  await expect(page.getByText('Restoring session…')).toHaveCount(0);
  expect(errors).toEqual([]);
});

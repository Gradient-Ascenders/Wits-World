import { expect, test, type Page } from '@playwright/test';

const apiBaseUrl = 'http://127.0.0.1:3001/api/v1';
const playerId = '6fe7dc26-cdea-4275-a2df-861724137cbc';

test('chooses, restores, edits, and signs out with no email identity', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  let displayName: string | null = null;

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await mockCurrentPlayer(
    page,
    () => displayName,
    (value) => {
      displayName = value.trim();
    },
  );

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page).toHaveTitle('Wits World');
  await expect(page.getByRole('button', { name: 'Signed in' })).toBeVisible();
  await expect(page.getByText(/@/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Signed in' }).click();
  const input = page.getByRole('textbox', { name: 'Display name' });
  await expect(input).toBeFocused();
  await input.fill('  Naledi 星  ');
  await page.getByRole('button', { name: 'Save player name' }).click();
  await expect(page.getByText('Display name saved.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Signed in as Naledi 星' }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Signed in as Naledi 星' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Signed in as Naledi 星' }).click();
  await page.getByRole('textbox', { name: 'Display name' }).fill('Campus Sage');
  await page.getByRole('button', { name: 'Save player name' }).click();
  await expect(
    page.getByRole('button', { name: 'Signed in as Campus Sage' }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('button', { name: 'Signed in as Campus Sage' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Player name' })).toHaveCount(
    0,
  );

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText(/@/)).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

async function mockCurrentPlayer(
  page: Page,
  readDisplayName: () => string | null,
  saveDisplayName: (value: string) => void,
) {
  await page.route(`${apiBaseUrl}/auth/me**`, async (route) => {
    const request = route.request();

    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as { displayName: string };
      saveDisplayName(body.displayName);
    }

    await route.fulfill({
      contentType: 'application/json',
      status: 200,
      body: JSON.stringify({
        displayName: readDisplayName(),
        id: playerId,
        lifecycleStatus: 'active',
        requestId: 'account-display-name-playwright',
        role: 'player',
      }),
    });
  });
}

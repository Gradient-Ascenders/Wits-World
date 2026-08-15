import { expect, test as setup } from '@playwright/test';

import { authenticationStatePath } from '../playwright.config';

function requiredCredential(name: 'E2E_USER_EMAIL' | 'E2E_USER_PASSWORD') {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required in apps/web/.env.e2e.local.`);
  }

  return value;
}

setup('authenticate through Auth0 Universal Login', async ({ page }) => {
  const email = requiredCredential('E2E_USER_EMAIL');
  const password = requiredCredential('E2E_USER_PASSWORD');

  await page.goto('/explore');
  await page.getByRole('button', { name: 'Sign in to explore' }).click();

  await expect(page).toHaveTitle(/Log in \| Wits World Web - Development/);
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.waitForURL('http://localhost:5173/explore');
  await expect(
    page.getByRole('heading', { name: 'Explore the campus map' }),
  ).toBeVisible();
  await expect(page.getByText('Signed in as')).toBeVisible();

  await page.context().storageState({ path: authenticationStatePath });
});

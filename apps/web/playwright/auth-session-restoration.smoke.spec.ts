import { expect, test, type Page } from '@playwright/test';

test('keeps the same player with E2E local-storage restoration and logout', async ({
  page,
}) => {
  const protectedRoutes = ['/explore', '/collection', '/decks', '/matches'];
  let expectedPlayerId: string | undefined;
  let expectedPlayerName: string | undefined;

  for (const route of protectedRoutes) {
    const directVisitPlayer = await openAndReadCurrentPlayer(page, () =>
      page.goto(route),
    );
    expectedPlayerId ??= directVisitPlayer.id;
    expectedPlayerName ??= directVisitPlayer.playerName;
    expect(directVisitPlayer).toEqual({
      id: expectedPlayerId,
      playerName: expectedPlayerName,
    });
    await expect(
      page.getByRole('button', { name: /, account menu$/u }),
    ).toBeVisible();

    const refreshedPlayer = await openAndReadCurrentPlayer(page, () =>
      page.reload(),
    );
    expect(refreshedPlayer).toEqual({
      id: expectedPlayerId,
      playerName: expectedPlayerName,
    });
    await expect(
      page.getByRole('button', { name: /, account menu$/u }),
    ).toBeVisible();
  }

  await page.getByRole('button', { name: /, account menu$/u }).click();
  await Promise.all([
    page.waitForURL('http://localhost:5173/'),
    page.getByRole('button', { name: 'Sign out' }).click(),
  ]);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

  await page.goto('/explore');
  await expect(
    page.getByRole('button', { name: 'Sign in to explore' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /, account menu$/u }),
  ).toHaveCount(0);
});

async function openAndReadCurrentPlayer(
  page: Page,
  navigate: () => Promise<unknown>,
): Promise<{ id: string; playerName: string }> {
  const currentPlayerResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      response.request().method() === 'GET' &&
      url.pathname === '/api/v1/auth/me'
    );
  });

  await navigate();
  const response = await currentPlayerResponse;
  expect(response.status()).toBe(200);

  const payload: unknown = await response.json();

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('id' in payload) ||
    typeof payload.id !== 'string' ||
    !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(payload.id) ||
    !('playerName' in payload) ||
    typeof payload.playerName !== 'string' ||
    payload.playerName.length === 0
  ) {
    throw new Error('The authenticated current-player response was invalid.');
  }

  return { id: payload.id, playerName: payload.playerName };
}

import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { HomeChallengeCta } from '../src/components/home/HomeChallengeCta';

function renderCta(overrides: Partial<Auth0ContextInterface> = {}) {
  const loginWithRedirect = vi.fn().mockResolvedValue(undefined);

  render(
    <Auth0Context.Provider
      value={
        {
          ...initialContext,
          isLoading: false,
          loginWithRedirect,
          ...overrides,
        } as unknown as Auth0ContextInterface
      }
    >
      <HomeChallengeCta />
    </Auth0Context.Provider>,
  );

  return loginWithRedirect;
}

describe('Home challenge call to action', () => {
  it('starts Auth0 signup and returns new players to Explore', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = renderCta();

    await user.click(
      screen.getByRole('button', { name: 'Sign up to play more' }),
    );

    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/explore' },
      authorizationParams: { screen_hint: 'signup' },
    });
  });

  it('sends an authenticated player directly to more challenges', () => {
    renderCta({ isAuthenticated: true });

    expect(
      screen.getByRole('link', { name: 'Find more challenges' }),
    ).toHaveAttribute('href', '/explore');
  });
});

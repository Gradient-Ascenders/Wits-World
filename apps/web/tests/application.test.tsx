import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';

import { AppRoutes } from '../src/App';

const apiBaseUrl = 'https://api.example.test/api/v1';
const mapboxAccessToken = 'pk.test-token';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function renderRoute(
  path: string,
  authOverrides: Partial<Auth0ContextInterface> = {},
) {
  window.history.replaceState({}, '', path);
  const loginWithRedirect = vi.fn().mockResolvedValue(undefined);

  const view = render(
    <Auth0Context.Provider
      value={
        {
          ...initialContext,
          isLoading: false,
          loginWithRedirect,
          ...authOverrides,
        } as unknown as Auth0ContextInterface
      }
    >
      <Router>
        <AppRoutes
          apiBaseUrl={apiBaseUrl}
          mapboxAccessToken={mapboxAccessToken}
        />
      </Router>
    </Auth0Context.Provider>,
  );

  return { loginWithRedirect, view };
}

describe('Wits World public application shell', () => {
  it('renders the signed-out Home route with a minimal public header', async () => {
    renderRoute('/');

    expect(
      await screen.findByRole(
        'heading',
        {
          level: 1,
          name: 'Wits World',
        },
        { timeout: 5_000 },
      ),
    ).toBeVisible();
    expect(screen.getByRole('banner')).toBeVisible();
    expect(
      screen.queryByRole('navigation', { name: 'Public' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Player' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('contentinfo')).toBeVisible();
    const brandLink = screen.getByLabelText('Wits World home');
    const brandSeal = brandLink.querySelector('img');

    expect(brandLink).toBeVisible();
    expect(brandSeal).toHaveAttribute('aria-hidden', 'true');
    expect(brandSeal).toHaveAttribute(
      'src',
      expect.stringContaining('wits-world-campus-seal-transparent.svg'),
    );
    expect(brandLink).toContainElement(brandSeal);
    expect(brandLink).toHaveTextContent('Wits World');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'About' }),
    ).not.toBeInTheDocument();
    for (const route of ['Explore', 'Collection', 'Decks', 'Battles']) {
      expect(
        screen.queryByRole('link', { name: route }),
      ).not.toBeInTheDocument();
    }
  });

  it('keeps signed-out keyboard order focused on brand and sign-in actions', async () => {
    const user = userEvent.setup();
    renderRoute('/');

    await screen.findByRole('heading', {
      level: 1,
      name: 'Wits World',
    });

    await user.tab();
    expect(
      screen.getByRole('link', { name: 'Skip to main content' }),
    ).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('link', { name: 'Wits World home' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Sign in to play' }),
    ).toHaveFocus();
  });

  it('prioritizes the decorative Great Hall hero artwork', async () => {
    renderRoute('/');

    await screen.findByRole('heading', {
      level: 1,
      name: 'Wits World',
    });
    const heroImage =
      document.querySelector<HTMLImageElement>('.hero__media img');

    expect(heroImage).toHaveAttribute('alt', '');
    expect(heroImage).toHaveAttribute('loading', 'eager');
    expect(heroImage).toHaveAttribute('fetchpriority', 'high');
    expect(heroImage).toHaveAttribute('width', '1672');
    expect(heroImage).toHaveAttribute('height', '941');
    expect(heroImage?.src).toContain('great-hall-hero.webp');
  });

  it('keeps gameplay explanation and the primary CTA below the hero', async () => {
    renderRoute('/');

    const hero = await screen.findByRole('region', { name: 'Wits World' });
    const gameIntroduction = screen.getByRole('region', {
      name: 'Explore campus. Take on the quest.',
    });

    expect(
      within(hero).queryByRole('heading', {
        name: 'Explore campus. Take on the quest.',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(hero).queryByRole('button', { name: 'Sign in to play' }),
    ).not.toBeInTheDocument();
    expect(
      within(gameIntroduction).getByRole('heading', {
        level: 2,
        name: 'Explore campus. Take on the quest.',
      }),
    ).toBeVisible();
    expect(
      within(gameIntroduction).getByText(/Find events around Wits/),
    ).toBeVisible();
    expect(
      within(gameIntroduction).getByRole('button', {
        name: 'Sign in to play',
      }),
    ).toBeVisible();
  });

  it('renders the connected game journey and compact project context', async () => {
    renderRoute('/');
    const main = screen.getByRole('main');

    await screen.findByRole('heading', {
      level: 2,
      name: 'How it works',
    });
    for (const step of ['Explore', 'Complete', 'Collect', 'Battle']) {
      expect(
        within(main).getByRole('heading', { level: 3, name: step }),
      ).toBeVisible();
    }
    expect(
      within(main).getByRole('heading', {
        level: 2,
        name: 'Earn cards. Build a deck. Battle.',
      }),
    ).toBeVisible();
    expect(
      within(main).getByRole('heading', {
        level: 2,
        name: 'Built at Wits',
      }),
    ).toBeVisible();
    expect(
      within(main).getByText(/COMS3011A Software Design Project/),
    ).toBeVisible();
    expect(within(main).queryByText('Ready to begin?')).not.toBeInTheDocument();
    expect(
      within(main).queryByText(
        /Campus exploration, turned into play|One quest from discovery to battle/i,
      ),
    ).not.toBeInTheDocument();
  });

  it('starts Auth0 sign-in from the single signed-out Home CTA', async () => {
    const user = userEvent.setup();
    const { loginWithRedirect } = renderRoute('/');

    const gameIntroductionSignIn = await screen.findByRole('button', {
      name: 'Sign in to play',
    });
    await user.click(gameIntroductionSignIn);

    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/explore' },
    });
  });

  it('redirects /about to the Home project context', async () => {
    renderRoute('/about');

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Built at Wits',
      }),
    ).toBeVisible();
    expect(window.location.pathname).toBe('/');
    expect(window.location.hash).toBe('#project-context');
    expect(
      screen.queryByRole('heading', {
        name: 'Campus exploration, turned into play.',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'About' }),
    ).not.toBeInTheDocument();
  });

  it('renders a useful fallback for an unknown route', async () => {
    renderRoute('/route-that-does-not-exist');

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'This route does not exist',
      }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});

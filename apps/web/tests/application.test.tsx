import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';

import { AppRoutes } from '../src/App';

const apiBaseUrl = 'https://api.example.test/api/v1';
const mapboxAccessToken = 'pk.test-token';

function renderRoute(path: string) {
  window.history.replaceState({}, '', path);

  return render(
    <Auth0Context.Provider
      value={
        {
          ...initialContext,
          isLoading: false,
          loginWithRedirect: vi.fn().mockResolvedValue(undefined),
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
}

describe('Wits World application shell', () => {
  it('renders the home route with accessible landmarks and project context', async () => {
    renderRoute('/');

    expect(
      await screen.findByRole(
        'heading',
        {
          level: 1,
          name: 'Explore Wits. Begin the quest.',
        },
        { timeout: 5_000 },
      ),
    ).toBeVisible();
    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeVisible();
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
    expect(brandLink).toHaveTextContent('Explore · Discover · Achieve');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByText(/first playable slice presents campus events/i),
    ).toBeVisible();
  });

  it('supports keyboard navigation to the skip link and primary routes', async () => {
    const user = userEvent.setup();
    renderRoute('/');

    await screen.findByRole(
      'heading',
      {
        level: 1,
        name: 'Explore Wits. Begin the quest.',
      },
      { timeout: 5_000 },
    );

    await user.tab();
    expect(
      screen.getByRole('link', { name: 'Skip to main content' }),
    ).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole('link', {
        name: 'Wits World home',
      }),
    ).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('link', { name: 'Explore' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('link', { name: 'Collection' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('link', { name: 'Decks' })).toHaveFocus();

    await user.tab();
    const battlesLink = screen.getByRole('link', { name: 'Battles' });
    expect(battlesLink).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('heading', {
        name: 'Sign in to play a CPU battle',
      }),
    ).toBeVisible();
    expect(battlesLink).toHaveAttribute('aria-current', 'page');
  });

  it('links to live exploration while presenting later gameplay as previews', async () => {
    renderRoute('/');

    expect(
      await screen.findByRole(
        'link',
        { name: 'Explore the campus' },
        { timeout: 5_000 },
      ),
    ).toHaveAttribute('href', '/explore');
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'A campus journey with purpose',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Explore' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Discover' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Collect' }),
    ).toBeVisible();
    expect(screen.getByText('Static interface preview')).toBeVisible();
    expect(screen.getByText('Awaiting location')).toBeVisible();
    expect(screen.getByText('Shown after a location check')).toBeVisible();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Build a collection with a sense of place',
      }),
    ).toBeVisible();
    expect(
      within(screen.getByRole('main')).queryByRole('button'),
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

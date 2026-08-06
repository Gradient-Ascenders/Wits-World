import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Router } from 'wouter';

import { AppRoutes } from '../src/App';

function renderRoute(path: string) {
  window.history.replaceState({}, '', path);

  return render(
    <Router>
      <AppRoutes />
    </Router>,
  );
}

describe('Wits Quest application shell', () => {
  it('renders the home route with accessible landmarks and project context', async () => {
    renderRoute('/');

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Explore with Wits Quest',
      }),
    ).toBeVisible();
    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('contentinfo')).toBeVisible();
    expect(
      screen.getByLabelText('Wits Quest, a Wits World project'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('supports keyboard navigation to the skip link and primary routes', async () => {
    const user = userEvent.setup();
    renderRoute('/');

    await screen.findByRole('heading', {
      level: 1,
      name: 'Explore with Wits Quest',
    });

    await user.tab();
    expect(
      screen.getByRole('link', { name: 'Skip to main content' }),
    ).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveFocus();

    await user.tab();
    const aboutLink = screen.getByRole('link', { name: 'About' });
    expect(aboutLink).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'About Wits Quest',
      }),
    ).toBeVisible();
    expect(aboutLink).toHaveAttribute('aria-current', 'page');
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

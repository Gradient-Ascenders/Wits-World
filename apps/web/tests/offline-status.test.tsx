import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { OfflineProvider, OfflineStatus } from '../src/offline/OfflineProvider';

vi.mock('../src/auth/CurrentPlayerProvider', () => ({
  useCurrentPlayer: () => ({
    state: { status: 'signed-out' },
    reload: vi.fn(),
  }),
}));
vi.mock('../src/auth/useApiAccessToken', () => ({
  useApiAccessToken: () => vi.fn(),
}));
vi.mock('../src/offline/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/offline/store')>()),
  boundOfflinePlayer: () => 'saved-player',
}));

afterEach(() => vi.restoreAllMocks());

function renderStatus(path: string, online: boolean) {
  window.history.replaceState({}, '', path);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
  render(
    <Router>
      <OfflineProvider apiBaseUrl="https://api.example.test/api/v1">
        <OfflineStatus />
      </OfflineProvider>
    </Router>,
  );
}

describe('connectivity feedback', () => {
  it.each(['/', '/explore', '/collection', '/decks', '/profile'])(
    'does not show a routine online notice on %s',
    (path) => {
      renderStatus(path, true);
      expect(
        screen.queryByRole('complementary', { name: 'Offline play' }),
      ).not.toBeInTheDocument();
    },
  );
  it('retains saved-event access on the home page when offline', () => {
    renderStatus('/', false);
    expect(
      screen.getByRole('link', { name: /You are offline/ }),
    ).toHaveAttribute('href', '/offline');
  });
  it('retains saved-event access on product routes when offline', () => {
    renderStatus('/explore', false);
    expect(
      screen.getByRole('link', { name: /You are offline/ }),
    ).toHaveAttribute('href', '/offline');
  });
});

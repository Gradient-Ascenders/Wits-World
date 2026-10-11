import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import {
  OfflineProvider,
  ExploreConnectionStatus,
  useOffline,
} from '../src/offline/OfflineProvider';

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

function ConnectionFailureControl() {
  const { reportConnectionFailure } = useOffline();
  return (
    <button onClick={reportConnectionFailure}>Report connection failure</button>
  );
}

function renderStatus(path: string, online: boolean) {
  window.history.replaceState({}, '', path);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
  render(
    <Router>
      <OfflineProvider apiBaseUrl="https://api.example.test/api/v1">
        {path === '/explore' && <ExploreConnectionStatus />}
        <ConnectionFailureControl />
      </OfflineProvider>
    </Router>,
  );
}

describe('connectivity feedback', () => {
  it('retains saved-event access on product routes when offline', () => {
    renderStatus('/explore', false);
    expect(
      screen.getByRole('link', { name: 'Downloads & saved attempts' }),
    ).toHaveAttribute('href', '/offline');
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(
      screen
        .getAllByRole('status')
        .some((status) => status.textContent?.includes('Offline')),
    ).toBe(true);
  });
  it('does not report a failed connection on a healthy online map', () => {
    renderStatus('/explore', true);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Connection unavailable')).toBeNull();
  });
  it('shows a failed API connection in the map even while the browser reports online', () => {
    renderStatus('/explore', true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Report connection failure' }),
    );
    expect(screen.getByText('Connection unavailable')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Downloads & saved attempts' }),
    ).toHaveAttribute('href', '/offline');
    expect(screen.queryByRole('complementary')).toBeNull();
  });
  it('clears the contextual offline feedback after reconnection without remounting', async () => {
    renderStatus('/explore', false);
    expect(
      screen.getByRole('link', { name: 'Downloads & saved attempts' }),
    ).toBeVisible();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(screen.queryByRole('link')).toBeNull();
  });
});

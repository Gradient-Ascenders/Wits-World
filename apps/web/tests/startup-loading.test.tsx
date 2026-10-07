import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { LONG_WAIT_MS } from '../src/components/loading-policy';

const session = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  playerStatus: 'loading',
}));

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: () => session,
}));
vi.mock('../src/auth/CurrentPlayerProvider', () => ({
  useCurrentPlayer: () => ({ state: { status: session.playerStatus } }),
}));

let startup: typeof import('../src/components/auth/startup-state');

beforeEach(async () => {
  vi.resetModules();
  session.isLoading = false;
  session.playerStatus = 'loading';
  window.history.replaceState({}, '', '/explore?code=callback&state=callback');
  startup = await import('../src/components/auth/startup-state');
});

afterEach(() => vi.useRealTimers());

function startupTree() {
  const { StartupGate, StartupSettler } = startup;
  return (
    <Router>
      <StartupGate>
        <StartupSettler />
        <div data-sign-in-map>Campus map is still loading</div>
      </StartupGate>
    </Router>
  );
}

describe('sign-in startup loading', () => {
  it('gives a stalled callback recovery and route-away options', async () => {
    vi.useFakeTimers();
    render(startupTree());

    await act(() => vi.advanceTimersByTimeAsync(LONG_WAIT_MS));
    expect(screen.getByText(/Sign-in is taking longer/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(document.querySelector('.startup-gate__app')).toHaveAttribute(
      'inert',
    );
  });

  it('reveals the ready destination immediately without waiting for the seal or map', () => {
    vi.useFakeTimers();
    session.playerStatus = 'ready';
    render(startupTree());

    expect(document.querySelector('.startup-screen')).toBeNull();
    expect(document.querySelector('.startup-gate__app')).not.toHaveAttribute(
      'inert',
    );
    expect(screen.getByText('Campus map is still loading')).toBeVisible();
  });

  it('allows returning home during an indefinitely pending sign-in', async () => {
    vi.useFakeTimers();
    session.isLoading = true;
    render(startupTree());

    await act(() => vi.advanceTimersByTimeAsync(LONG_WAIT_MS));
    fireEvent.click(screen.getByRole('link', { name: 'Return home' }));

    expect(window.location.pathname).toBe('/');
    expect(document.querySelector('.startup-screen')).toBeNull();
    expect(document.querySelector('.startup-gate__app')).not.toHaveAttribute(
      'inert',
    );
  });
});

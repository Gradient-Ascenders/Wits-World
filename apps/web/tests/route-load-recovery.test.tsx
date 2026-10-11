import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { RouteLoadRecovery } from '../src/components/RouteLoadRecovery';

function FailedPage({ message }: { message: string }): never {
  throw new TypeError(message);
}

beforeEach(() =>
  vi.spyOn(console, 'error').mockImplementation(() => undefined),
);
afterEach(() => vi.restoreAllMocks());

describe('page-file recovery', () => {
  it.each([
    'Failed to fetch dynamically imported module: http://localhost/page.js',
    'Importing a module script failed.',
    'error loading dynamically imported module: http://localhost/page.js',
    'Loading chunk 42 failed.',
    'ChunkLoadError',
  ])('recognizes a page load failure: %s', (message) => {
    render(
      <ErrorBoundary withinShell resetKey="/explore">
        <FailedPage message={message} />
      </ErrorBoundary>,
    );
    expect(
      screen.getByRole('heading', { name: 'This page needs to reload' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Saved play' })).toHaveAttribute(
      'href',
      '/offline',
    );
    expect(
      screen.queryByText('This page could not be opened'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
  });

  it('keeps saved play available offline and enables reload after reconnection', () => {
    const connected = vi
      .spyOn(navigator, 'onLine', 'get')
      .mockReturnValue(false);
    const reload = vi.fn();
    render(<RouteLoadRecovery pathname="/explore" onReload={reload} />);
    expect(screen.getByRole('link', { name: 'Saved play' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Reload this page' }),
    ).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('You are offline');
    connected.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event('online')));
    expect(
      screen.getByRole('button', { name: 'Reload this page' }),
    ).toBeEnabled();
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload this page' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('clears a rejected page load on navigation to the eager saved route', () => {
    const view = render(
      <ErrorBoundary withinShell resetKey="/explore">
        <FailedPage message="Failed to fetch dynamically imported module" />
      </ErrorBoundary>,
    );
    view.rerender(
      <ErrorBoundary withinShell resetKey="/offline">
        <h1>Saved play</h1>
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Saved play' })).toBeVisible();
    expect(
      screen.queryByText('This page needs to reload'),
    ).not.toBeInTheDocument();
  });

  it('does not turn ordinary fetch or rendering failures into page-file recovery', () => {
    render(
      <ErrorBoundary withinShell resetKey="/explore">
        <FailedPage message="Failed to fetch" />
      </ErrorBoundary>,
    );
    expect(
      screen.getByRole('heading', { name: 'This page could not be opened' }),
    ).toBeVisible();
  });

  it('retries saved rendering instead of linking to the same failed route', () => {
    let broken = true;
    function SavedPage() {
      if (broken) throw new Error('render failure');
      return <h1>Saved play</h1>;
    }
    render(
      <ErrorBoundary withinShell resetKey="/offline">
        <SavedPage />
      </ErrorBoundary>,
    );
    expect(
      screen.queryByRole('link', { name: 'Open saved events' }),
    ).not.toBeInTheDocument();
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry saved play' }));
    expect(screen.getByRole('heading', { name: 'Saved play' })).toBeVisible();
  });
});

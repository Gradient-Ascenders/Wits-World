import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActionLoadingFeedback,
  PageLoadingState,
} from '../src/components/LoadingState';
import { RoutePreparation } from '../src/App';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { TradeConfirmationDialog } from '../src/components/trades/TradeConfirmationDialog';
import { createRef } from 'react';
import {
  LOADING_DELAY_MS,
  LONG_WAIT_MS,
} from '../src/components/loading-policy';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('shared loading policy', () => {
  it('does not animate fast preparation or impose a minimum wait', () => {
    const view = render(
      <PageLoadingState
        title="Loading trades"
        description="Checking your offers."
      />,
    );
    expect(view.container.querySelector('.loading-seal')).toHaveStyle({
      visibility: 'hidden',
    });
    act(() => vi.advanceTimersByTime(LOADING_DELAY_MS - 1));
    view.rerender(<h1>Your trades</h1>);
    act(() => vi.advanceTimersByTime(LONG_WAIT_MS));
    expect(screen.getByRole('heading', { name: 'Your trades' })).toBeVisible();
    expect(screen.queryByText(/longer than expected/)).not.toBeInTheDocument();
  });

  it('offers slow read retry and escape without moving keyboard focus', () => {
    const retry = vi.fn();
    const view = render(
      <>
        <button>Keep focus</button>
        <PageLoadingState
          title="Loading trades"
          description="Checking your offers."
          onRetry={retry}
        />
      </>,
    );
    const focus = screen.getByRole('button', { name: 'Keep focus' });
    focus.focus();
    act(() => vi.advanceTimersByTime(LOADING_DELAY_MS));
    expect(view.container.querySelector('.loading-seal')).toHaveStyle({
      visibility: 'visible',
    });
    act(() => vi.advanceTimersByTime(LONG_WAIT_MS - LOADING_DELAY_MS));
    expect(
      screen.getByRole('link', { name: 'Open saved events' }),
    ).toHaveAttribute('href', '/offline');
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByText(/Leaving does not cancel/)).toHaveAttribute(
      'role',
      'status',
    );
    expect(focus).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('resets a slow status on a new navigation and keeps module preparation compact', () => {
    const view = render(<RoutePreparation pathname="/matches" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(LOADING_DELAY_MS));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Opening battle page…',
    );
    expect(view.container.querySelector('.page-loading-state')).toBeNull();
    act(() => vi.advanceTimersByTime(LONG_WAIT_MS));
    view.rerender(<RoutePreparation pathname="/collection/trades/new" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(LOADING_DELAY_MS));
    expect(screen.getByRole('status')).toHaveTextContent('Opening card trade…');
    expect(screen.queryByText(/longer than expected/)).not.toBeInTheDocument();
  });

  it('does not replay a mutation when confirmation is slow and resets for the next action', () => {
    const view = render(
      <ActionLoadingFeedback active label="Sending your trade offer" />,
    );
    act(() => vi.advanceTimersByTime(LONG_WAIT_MS));
    expect(screen.getByRole('status')).toHaveTextContent(
      'The result is not confirmed',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute(
      'href',
      '/',
    );
    view.rerender(
      <ActionLoadingFeedback active={false} label="Sending your trade offer" />,
    );
    view.rerender(
      <ActionLoadingFeedback active label="Sending your trade offer" />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'awaiting confirmation',
    );
    expect(screen.getByRole('status')).not.toHaveTextContent(
      'longer than expected',
    );
  });

  it('makes a slow mutation dialog escapable by keyboard without resubmitting', () => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    render(
      <TradeConfirmationDialog
        busy
        confirmLabel="Send offer"
        description="Review these cards."
        onCancel={cancel}
        onConfirm={confirm}
        returnFocusRef={createRef<HTMLButtonElement>()}
        title="Send this offer?"
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    act(() => vi.advanceTimersByTime(LONG_WAIT_MS));
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Send offer…' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Leaving does not cancel',
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('keeps module failures inside the shell with recovery', () => {
    const logged = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    function FailedModule(): never {
      throw new Error('fixture module load failed');
    }
    render(
      <>
        <nav>Safe navigation</nav>
        <ErrorBoundary withinShell>
          <FailedModule />
        </ErrorBoundary>
      </>,
    );
    expect(screen.getByRole('navigation')).toHaveTextContent('Safe navigation');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This page could not be opened',
    );
    expect(screen.getByRole('link', { name: 'Return home' })).toBeVisible();
    expect(
      screen.queryByText('fixture module load failed'),
    ).not.toBeInTheDocument();
    logged.mockRestore();
  });

  it('preserves healthy workspace state across navigation and resets terminal errors', () => {
    const logged = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    function Workspace({ fail = false }: { fail?: boolean }) {
      if (fail) throw new Error('fixture failure');
      return <input aria-label="Unsaved draft" defaultValue="Original" />;
    }
    const view = render(
      <ErrorBoundary withinShell resetKey="/author/cards/1/edit">
        <Workspace />
      </ErrorBoundary>,
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'User draft' },
    });
    view.rerender(
      <ErrorBoundary withinShell resetKey="/author/cards/1">
        <Workspace />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('textbox')).toHaveValue('User draft');
    view.rerender(
      <ErrorBoundary withinShell resetKey="/author/cards/1">
        <Workspace fail />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeVisible();
    view.rerender(
      <ErrorBoundary withinShell resetKey="/author/events">
        <Workspace />
      </ErrorBoundary>,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeVisible();
    logged.mockRestore();
  });
});

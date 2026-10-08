import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Link, Route } from 'wouter';

import {
  GuardedRouter,
  useUnsavedAuthorChanges,
} from '../src/components/author/AuthorNavigationGuard';

afterEach(() => {
  window.history.replaceState({}, '', '/draft');
});

describe('author navigation loss prevention', () => {
  it('rolls a canceled browser back to the draft and keeps editing', async () => {
    const user = userEvent.setup();
    setHistory('/previous', '/draft');
    render(
      <GuardedRouter>
        <NavigationHarness />
      </GuardedRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Start editing' }));
    const dirtyUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyUnload);
    expect(dirtyUnload.defaultPrevented).toBe(true);
    await goBack();

    expect(window.location.pathname).toBe('/draft');
    expect(screen.getByRole('heading', { name: 'Draft editor' })).toBeVisible();
    const dialog = screen.getByRole('dialog', {
      name: 'Discard unsaved changes?',
    });
    expect(dialog).toHaveTextContent(
      'Your unsaved event draft changes will be lost.',
    );
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();

    fireEvent(window, new Event('pushState'));
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));

    expect(window.location.pathname).toBe('/draft');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Draft editor' })).toBeVisible();
  });

  it('accepts a confirmed browser back and displays the prior route', async () => {
    const user = userEvent.setup();
    setHistory('/previous', '/draft');
    render(
      <GuardedRouter>
        <NavigationHarness />
      </GuardedRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Start editing' }));
    await goBack();
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/previous');
      expect(
        screen.getByRole('heading', { name: 'Previous page' }),
      ).toBeVisible();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('registers a new dirty draft, stops warning when clean, and clears on unmount', async () => {
    const user = userEvent.setup();
    const view = render(
      <GuardedRouter>
        <NavigationHarness />
      </GuardedRouter>,
    );
    const dirtyUnload = new Event('beforeunload', { cancelable: true });

    await user.click(screen.getByRole('button', { name: 'Start editing' }));
    window.dispatchEvent(dirtyUnload);
    expect(dirtyUnload.defaultPrevented).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Mark draft clean' }));
    const cleanUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Start editing' }));
    view.unmount();
    const afterUnmountUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterUnmountUnload);
    expect(afterUnmountUnload.defaultPrevented).toBe(false);
  });

  it('does not let a clean draft mask another active dirty draft', async () => {
    const user = userEvent.setup();
    render(
      <GuardedRouter>
        <NavigationHarness withSecondDraft />
      </GuardedRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Start editing' }));
    await user.click(
      screen.getByRole('button', { name: 'Start second draft' }),
    );
    await user.click(screen.getByRole('button', { name: 'Mark draft clean' }));
    await user.click(screen.getByRole('link', { name: 'Leave editor' }));

    const dialog = screen.getByRole('dialog', {
      name: 'Discard unsaved changes?',
    });
    expect(dialog).toHaveTextContent(
      'Your unsaved question draft changes will be lost.',
    );
    expect(window.location.pathname).toBe('/draft');
  });

  it('uses the router and guard server snapshots for an SSR route', () => {
    const markup = renderToString(
      <GuardedRouter ssrPath="/draft">
        <NavigationHarness />
      </GuardedRouter>,
    );

    expect(markup).toContain('Draft editor');
  });
});

function NavigationHarness({
  withSecondDraft = false,
}: {
  withSecondDraft?: boolean;
}) {
  const [dirty, setDirty] = useState(false);
  const [secondDirty, setSecondDirty] = useState(false);
  useUnsavedAuthorChanges(dirty, 'event draft');
  useUnsavedAuthorChanges(withSecondDraft && secondDirty, 'question draft');

  return (
    <>
      <Route path="/draft">
        <main>
          <h1>Draft editor</h1>
          <button onClick={() => setDirty(true)}>Start editing</button>
          <button onClick={() => setDirty(false)}>Mark draft clean</button>
          {withSecondDraft ? (
            <button onClick={() => setSecondDirty(true)}>
              Start second draft
            </button>
          ) : null}
          <Link href="/destination">Leave editor</Link>
        </main>
      </Route>
      <Route path="/previous">
        <h1>Previous page</h1>
      </Route>
      <Route path="/destination">
        <h1>Destination</h1>
      </Route>
    </>
  );
}

function setHistory(previousPath: string, currentPath: string) {
  window.history.replaceState({}, '', previousPath);
  window.history.pushState({}, '', currentPath);
}

async function goBack() {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => window.setTimeout(resolve, 20));
  });
}

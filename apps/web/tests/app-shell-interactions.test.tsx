import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLayoutEffect, useRef } from 'react';
import { Link, Router, useLocation } from 'wouter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCurrentPlayer } from '../src/auth/CurrentPlayerProvider';
import { AppShell } from '../src/components/AppShell';

vi.mock('../src/auth/CurrentPlayerProvider', () => ({
  useCurrentPlayer: vi.fn(),
}));

const player = {
  connectionStrategy: 'auth0',
  id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
  lifecycleStatus: 'active',
  playerName: 'test-player',
  playerNameSetupRequired: false,
  role: 'player',
} as const;

const captureMethods = [
  'setPointerCapture',
  'hasPointerCapture',
  'releasePointerCapture',
] as const;
const captureDescriptors = captureMethods.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
);
const capturedPointers = new WeakMap<HTMLElement, Set<number>>();
const resizeObservers: TestResizeObserver[] = [];

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;

  constructor(type: string, options: PointerEventInit = {}) {
    super(type, options);
    this.pointerId = options.pointerId ?? 1;
    this.pointerType = options.pointerType ?? 'touch';
    this.isPrimary = options.isPrimary ?? true;
  }
}

class TestResizeObserver {
  callback: ResizeObserverCallback;
  observed: Element[] = [];
  disconnected = false;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObservers.push(this);
  }

  observe(target: Element) {
    this.observed.push(target);
  }

  unobserve(target: Element) {
    this.observed = this.observed.filter((element) => element !== target);
  }

  disconnect() {
    this.disconnected = true;
    this.observed = [];
  }

  measure() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function installPointerCapture() {
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value(this: HTMLElement, pointerId: number) {
      const pointers = capturedPointers.get(this) ?? new Set<number>();
      pointers.add(pointerId);
      capturedPointers.set(this, pointers);
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value(this: HTMLElement, pointerId: number) {
      return capturedPointers.get(this)?.has(pointerId) ?? false;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value(this: HTMLElement, pointerId: number) {
      capturedPointers.get(this)?.delete(pointerId);
    },
  });
}

function setMobile(matches: boolean) {
  let current = matches;
  const listeners: Array<(event: MediaQueryListEvent) => void> = [];
  const media = {
    get matches() {
      return current;
    },
    media: '(max-width: 47.999rem)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(
      (event: string, listener: EventListenerOrEventListenerObject) => {
        if (event === 'change' && typeof listener === 'function') {
          listeners.push(listener as (event: MediaQueryListEvent) => void);
        }
      },
    ),
    removeEventListener: vi.fn(
      (event: string, listener: EventListenerOrEventListenerObject) => {
        if (event === 'change' && typeof listener === 'function') {
          const index = listeners.indexOf(
            listener as (event: MediaQueryListEvent) => void,
          );
          if (index >= 0) listeners.splice(index, 1);
        }
      },
    ),
    dispatchEvent: vi.fn(),
    setMatches(value: boolean) {
      current = value;
      listeners.forEach((listener) => {
        listener({ matches: current } as MediaQueryListEvent);
      });
    },
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) =>
      query === '(max-width: 47.999rem)' ? media : { ...media, matches: false },
    ),
  );
  return media;
}

function setRect(element: Element, height: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    bottom: height,
    height,
    left: 0,
    right: 400,
    top: 0,
    width: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

function RouteContent({ focusCollection }: { focusCollection?: boolean }) {
  const [pathname] = useLocation();
  const collectionHeading = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    if (pathname === '/collection' && focusCollection) {
      collectionHeading.current?.focus();
    }
  }, [focusCollection, pathname]);

  return pathname === '/explore' ? (
    <>
      <section aria-label="Explore map">
        <div data-testid="explore-sheet" data-sheet-snap="peek" />
        <button
          onClick={(event) => {
            event.currentTarget.previousElementSibling?.setAttribute(
              'data-sheet-snap',
              'expanded',
            );
          }}
          type="button"
        >
          Expand results sheet
        </button>
        <button
          aria-label="Map canvas"
          className="mapboxgl-canvas"
          type="button"
        >
          Map
        </button>
      </section>
      <Link href="/collection">Open collection from content</Link>
    </>
  ) : (
    <h1 ref={collectionHeading} tabIndex={-1}>
      Collection route
    </h1>
  );
}

function renderShell(
  path = '/explore',
  options: { authenticated?: boolean; focusCollection?: boolean } = {},
) {
  window.history.replaceState({}, '', path);
  vi.mocked(useCurrentPlayer).mockReturnValue({
    reload: vi.fn(),
    setupPlayerName: vi.fn(),
    state: { player, status: 'ready' },
  });
  return render(
    <Auth0Context.Provider
      value={
        {
          ...initialContext,
          isAuthenticated: options.authenticated ?? false,
          isLoading: false,
        } as Auth0ContextInterface
      }
    >
      <Router>
        <AppShell>
          <RouteContent focusCollection={options.focusCollection} />
        </AppShell>
      </Router>
    </Auth0Context.Provider>,
  );
}

beforeEach(() => {
  installPointerCapture();
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  resizeObservers.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [index, name] of captureMethods.entries()) {
    const descriptor = captureDescriptors[index];
    if (descriptor)
      Object.defineProperty(HTMLElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, name);
  }
});

describe('AppShell mobile explore interactions', () => {
  it('captures an upward header drag, commits collapse, and suppresses the follow-up pointer click', () => {
    setMobile(true);
    renderShell();
    const header = screen.getByRole('banner');
    const toggle = screen.getByRole('button', {
      name: 'Hide header for more map space',
    });
    setRect(header, 100);

    fireEvent.pointerDown(toggle, {
      button: 0,
      clientY: 75,
      isPrimary: true,
      pointerId: 12,
    });
    expect(toggle.hasPointerCapture(12)).toBe(true);
    fireEvent.pointerMove(toggle, { clientY: 10, pointerId: 12 });
    expect(toggle.parentElement?.style.transform).toBe('translateY(-65px)');

    fireEvent.pointerUp(toggle, { clientY: 10, pointerId: 12 });
    expect(toggle.hasPointerCapture(12)).toBe(false);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle.parentElement).toHaveAttribute('data-collapsed', 'true');

    fireEvent.click(toggle, { detail: 1 });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('cancels a drag without committing and still permits an explicit keyboard toggle', async () => {
    setMobile(true);
    const user = userEvent.setup();
    renderShell();
    const toggle = screen.getByRole('button', {
      name: 'Hide header for more map space',
    });
    setRect(screen.getByRole('banner'), 100);

    fireEvent.pointerDown(toggle, {
      button: 0,
      clientY: 80,
      isPrimary: true,
      pointerId: 3,
    });
    fireEvent.pointerMove(toggle, { clientY: 20, pointerId: 3 });
    fireEvent.pointerCancel(toggle, { pointerId: 3 });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle.parentElement).toHaveAttribute('data-dragging', 'false');
    expect(toggle.parentElement?.style.transform).toBe('');

    fireEvent.click(toggle, { detail: 1 });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('settles a lost capture after movement without letting its synthetic click undo the drag result', () => {
    setMobile(true);
    renderShell();
    const toggle = screen.getByRole('button', {
      name: 'Hide header for more map space',
    });
    setRect(screen.getByRole('banner'), 100);

    fireEvent.pointerDown(toggle, {
      button: 0,
      clientY: 20,
      isPrimary: true,
      pointerId: 4,
    });
    fireEvent.pointerMove(toggle, { clientY: 45, pointerId: 4 });
    fireEvent.lostPointerCapture(toggle, { pointerId: 4 });
    expect(toggle.parentElement).toHaveAttribute('data-dragging', 'false');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle, { detail: 1 });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle, { detail: 0 });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('collapses for an expanded mobile exploration sheet and restores the header when the breakpoint changes', async () => {
    const mobile = setMobile(true);
    renderShell();
    const toggle = screen.getByRole('button', {
      name: 'Hide header for more map space',
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Expand results sheet' }),
    );
    await waitFor(() =>
      expect(toggle).toHaveAttribute('aria-expanded', 'false'),
    );

    act(() => mobile.setMatches(false));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle.parentElement).toHaveAttribute('data-collapsed', 'false');
  });

  it('tracks header height changes and removes observer styles and breakpoint listeners on cleanup', () => {
    const mobile = setMobile(true);
    const view = renderShell();
    const main = screen.getByRole('main');
    const header = screen.getByRole('banner');
    setRect(header, 72);

    const observer = resizeObservers.find((candidate) =>
      candidate.observed.includes(header),
    );
    expect(observer).toBeDefined();
    act(() => observer?.measure());
    expect(main.style.getPropertyValue('--explore-header-height')).toBe('72px');

    setRect(header, 96);
    act(() => observer?.measure());
    expect(main.style.getPropertyValue('--explore-header-height')).toBe('96px');

    view.unmount();
    expect(observer?.disconnected).toBe(true);
    expect(main.style.getPropertyValue('--explore-header-height')).toBe('');
    expect(mobile.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  it('collapses after a mobile map pointer interaction but not for a desktop map interaction', () => {
    const mobile = setMobile(true);
    const view = renderShell();
    const toggle = screen.getByRole('button', {
      name: 'Hide header for more map space',
    });

    fireEvent.pointerUp(screen.getByRole('button', { name: 'Map canvas' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    view.unmount();
    mobile.setMatches(false);
    renderShell();
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Map canvas' }));
    expect(
      screen.getByRole('button', { name: 'Hide header for more map space' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('AppShell route focus management', () => {
  it('moves focus to main after navigation initiated from the application header', async () => {
    const user = userEvent.setup();
    renderShell('/explore', { authenticated: true });
    const collectionLink = screen.getAllByRole('link', {
      name: 'Collection',
    })[0]!;
    await user.click(collectionLink);

    expect(
      await screen.findByRole('heading', { name: 'Collection route' }),
    ).toBeVisible();
    expect(screen.getByRole('main')).toHaveFocus();
    expect(document.title).toBe('Collection · Wits World');
  });

  it('preserves focus deliberately moved into the newly rendered route content', async () => {
    const user = userEvent.setup();
    renderShell('/explore', {
      authenticated: true,
      focusCollection: true,
    });
    await user.click(
      screen.getByRole('link', { name: 'Open collection from content' }),
    );

    const heading = await screen.findByRole('heading', {
      name: 'Collection route',
    });
    expect(heading).toHaveFocus();
    expect(screen.getByRole('main')).not.toHaveFocus();
  });
});

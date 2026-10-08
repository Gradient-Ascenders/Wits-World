import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDeckSaveBar } from '../src/pages/useDeckSaveBar';

const frameCallbacks = new Map<number, FrameRequestCallback>();
const cancelledFrames: number[] = [];
let nextFrame = 1;
let media: MediaQueryList & {
  change: (matches: boolean) => void;
  listeners: Set<EventListenerOrEventListenerObject>;
};
let mobile = true;
let currentTime = 0;

function SaveBarHarness({ keepExpanded = false }: { keepExpanded?: boolean }) {
  const bar = useRef<HTMLDivElement>(null);
  const { collapsed, expand } = useDeckSaveBar(bar, keepExpanded);

  return (
    <div ref={bar} data-testid="save-bar" data-collapsed={collapsed}>
      <div aria-hidden={collapsed} inert={collapsed}>
        <button type="button">Save deck</button>
      </div>
      <button
        type="button"
        aria-label="Expand deck save panel"
        aria-expanded={!collapsed}
        onClick={expand}
      >
        Details
      </button>
    </div>
  );
}

function exposedCollapsedState() {
  return screen.getByTestId('save-bar').getAttribute('data-collapsed');
}

function scrollTo(y: number, time: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
  currentTime = time;
  fireEvent.scroll(window);
  flushFrame();
}

function flushFrame() {
  const entry = frameCallbacks.entries().next().value as
    [number, FrameRequestCallback] | undefined;
  if (!entry) throw new Error('Expected a queued animation frame');
  frameCallbacks.delete(entry[0]);
  act(() => entry[1](0));
}

function installMediaQuery() {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const query = {
    media: '(max-width: 63.999rem)',
    get matches() {
      return mobile;
    },
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'change') listeners.add(listener);
      },
    ),
    removeEventListener: vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'change') listeners.delete(listener);
      },
    ),
    dispatchEvent: vi.fn(() => true),
    change(matches: boolean) {
      mobile = matches;
      const event = new Event('change');
      for (const listener of listeners) {
        if (typeof listener === 'function') {
          listener.call(query as unknown as MediaQueryList, event);
        } else {
          listener.handleEvent(event);
        }
      }
    },
    listeners,
  };
  media = query as unknown as typeof media;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  );
}

beforeEach(() => {
  frameCallbacks.clear();
  cancelledFrames.length = 0;
  nextFrame = 1;
  mobile = true;
  currentTime = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 400 });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: 2400,
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frameCallbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    cancelledFrames.push(id);
    frameCallbacks.delete(id);
  });
  installMediaQuery();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('deck save bar scroll behavior', () => {
  it('uses directional hysteresis to collapse on a sustained downward gesture and expand upward', () => {
    render(<SaveBarHarness />);

    scrollTo(445, 40);
    expect(exposedCollapsedState()).toBe('false');
    scrollTo(448, 60);
    expect(exposedCollapsedState()).toBe('true');

    scrollTo(424, 100);
    expect(exposedCollapsedState()).toBe('false');
    expect(
      screen.getByRole('button', { name: 'Expand deck save panel' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('ignores small jitter, resets accumulated travel after a pause, and restarts on reversal', () => {
    render(<SaveBarHarness />);

    scrollTo(401, 20);
    scrollTo(402, 40);
    scrollTo(403, 60);
    expect(exposedCollapsedState()).toBe('false');

    scrollTo(427, 80);
    scrollTo(451, 281);
    expect(exposedCollapsedState()).toBe('false');
    scrollTo(475, 300);
    expect(exposedCollapsedState()).toBe('true');

    scrollTo(445, 320);
    scrollTo(460, 340);
    expect(exposedCollapsedState()).toBe('false');
    scrollTo(493, 350);
    expect(exposedCollapsedState()).toBe('true');
    scrollTo(413, 360);
    expect(exposedCollapsedState()).toBe('false');
  });

  it('stays expanded at the top and collapses at or beyond the bottom overscroll boundary', () => {
    render(<SaveBarHarness />);
    scrollTo(448, 20);
    expect(exposedCollapsedState()).toBe('true');

    scrollTo(10, 40);
    expect(exposedCollapsedState()).toBe('false');
    scrollTo(1585, 60);
    expect(exposedCollapsedState()).toBe('true');
    scrollTo(1650, 80);
    expect(exposedCollapsedState()).toBe('true');
  });

  it('preserves the expanded controls while one has focus or a decision is pending', () => {
    const { rerender } = render(<SaveBarHarness />);
    screen.getByRole('button', { name: 'Save deck' }).focus();
    scrollTo(448, 20);
    expect(exposedCollapsedState()).toBe('false');

    screen.getByRole('button', { name: 'Save deck' }).blur();
    rerender(<SaveBarHarness keepExpanded />);
    scrollTo(496, 40);
    expect(exposedCollapsedState()).toBe('false');
    expect(screen.getByRole('button', { name: 'Save deck' })).toBeVisible();
  });

  it('restores the expanded state across desktop mode, breakpoint changes, and resize', () => {
    const { unmount } = render(<SaveBarHarness />);
    scrollTo(448, 20);
    expect(exposedCollapsedState()).toBe('true');

    act(() => media.change(false));
    expect(exposedCollapsedState()).toBe('false');
    scrollTo(600, 40);
    expect(exposedCollapsedState()).toBe('false');

    act(() => media.change(true));
    scrollTo(648, 60);
    expect(exposedCollapsedState()).toBe('true');
    fireEvent.resize(window);
    expect(exposedCollapsedState()).toBe('false');
    unmount();
  });

  it('expands through the exposed action when activated from the keyboard', async () => {
    const user = userEvent.setup();
    render(<SaveBarHarness />);
    scrollTo(448, 20);
    const disclosure = screen.getByRole('button', {
      name: 'Expand deck save panel',
    });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');

    disclosure.focus();
    await user.keyboard('{Enter}');
    expect(exposedCollapsedState()).toBe('false');
    expect(screen.getByRole('button', { name: 'Save deck' })).toBeVisible();
  });

  it('cancels a pending frame and removes scroll, resize, and media-query listeners on unmount', () => {
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<SaveBarHarness />);
    fireEvent.scroll(window);
    const pendingFrame = Number(frameCallbacks.keys().next().value);
    expect(pendingFrame).toBeGreaterThan(0);

    unmount();
    expect(cancelledFrames).toContain(pendingFrame);
    expect(media.listeners.size).toBe(0);
    expect(removeWindowListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
    );
    expect(removeWindowListener).toHaveBeenCalledWith(
      'resize',
      expect.any(Function),
    );

    fireEvent.scroll(window);
    fireEvent.resize(window);
    expect(frameCallbacks.size).toBe(0);
  });
});

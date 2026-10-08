import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetAccessibilityPreferences,
  updateAccessibilityPreferences,
} from '../src/accessibility/preferences';
import { CardSheetHandle } from '../src/components/cards/CardSheetHandle';
import { useCardSheet } from '../src/components/cards/useCardSheet';
import { useCreatureSheet } from '../src/components/matches/useCreatureSheet';

const captureMethods = [
  'setPointerCapture',
  'hasPointerCapture',
  'releasePointerCapture',
] as const;
const captureDescriptors = captureMethods.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
);
const capturedPointers = new WeakMap<HTMLElement, Set<number>>();
const dialogCloseDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'close',
);

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;

  constructor(type: string, options: PointerEventInit = {}) {
    super(type, options);
    this.pointerId = options.pointerId ?? 1;
    this.pointerType = options.pointerType ?? 'mouse';
    this.isPrimary = options.isPrimary ?? true;
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
  const media = {
    get matches() {
      return current;
    },
    media: '(max-width: 47.99rem)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    setMatches(value: boolean) {
      current = value;
    },
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) =>
      query === '(max-width: 47.99rem)' ? media : { ...media, matches: false },
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

function CardGestureHarness({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { dismiss } = useCardSheet(panelRef, bodyRef, onClose);
  return (
    <section aria-label="Card details" ref={panelRef}>
      <header data-card-sheet-header>
        <button aria-label="Header action" type="button">
          Action
        </button>
        <span>Card title</span>
      </header>
      <div ref={bodyRef}>
        <a href="#details">Card detail link</a>
        <p>Scrollable card details</p>
      </div>
      <button onClick={dismiss} type="button">
        Dismiss card
      </button>
    </section>
  );
}

function CreatureDialogHarness({ open }: { open: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useCreatureSheet(dialogRef, open);
  return (
    <dialog aria-label="Creature details" open ref={dialogRef}>
      <header>
        <h2>Creature name</h2>
      </header>
      <div className="battle-creature-dialog__body">
        <button aria-label="Close Creature details" type="button">
          Close
        </button>
        <p>Creature information</p>
      </div>
    </dialog>
  );
}

beforeEach(() => {
  installPointerCapture();
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  vi.stubGlobal('innerHeight', 800);
  updateAccessibilityPreferences({ motion: 'reduce' });
});

afterEach(() => {
  resetAccessibilityPreferences();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [index, name] of captureMethods.entries()) {
    const descriptor = captureDescriptors[index];
    if (descriptor)
      Object.defineProperty(HTMLElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, name);
  }
  if (dialogCloseDescriptor)
    Object.defineProperty(
      HTMLDialogElement.prototype,
      'close',
      dialogCloseDescriptor,
    );
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

describe('card sheet interactions', () => {
  it('exposes an accessible keyboard handle that toggles its snap and honors disabled', async () => {
    setMobile(true);
    const panelRef = createRef<HTMLElement>();
    const onClose = vi.fn();
    const view = render(
      <section ref={panelRef}>
        <CardSheetHandle disabled onClose={onClose} panelRef={panelRef} />
      </section>,
    );
    const disabled = screen.getByRole('button', { name: 'Lower card sheet' });
    expect(disabled).toBeDisabled();
    fireEvent.click(disabled);
    expect(disabled).toHaveAccessibleName('Lower card sheet');
    expect(onClose).not.toHaveBeenCalled();

    view.rerender(
      <section ref={panelRef}>
        <CardSheetHandle onClose={onClose} panelRef={panelRef} />
      </section>,
    );
    const handle = screen.getByRole('button', { name: 'Lower card sheet' });
    const user = userEvent.setup();
    handle.focus();
    await user.keyboard('{Enter}');
    expect(handle).toHaveAccessibleName('Expand card sheet');
    expect(panelRef.current).toHaveAttribute('data-card-snap', 'medium');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(handle);
    expect(handle).toHaveAccessibleName('Lower card sheet');
    expect(panelRef.current).toHaveAttribute('data-card-snap', 'expanded');
  });

  it('commits a captured pointer drag, suppresses its synthetic click, and closes at peek', () => {
    setMobile(true);
    const panelRef = createRef<HTMLElement>();
    const onClose = vi.fn();
    const { container } = render(
      <section ref={panelRef}>
        <CardSheetHandle onClose={onClose} panelRef={panelRef} />
      </section>,
    );
    const panel = container.querySelector('section')!;
    Object.defineProperty(panel, 'offsetHeight', {
      configurable: true,
      value: 600,
    });
    const handle = screen.getByRole('button', { name: 'Lower card sheet' });

    fireEvent.pointerDown(handle, {
      button: 0,
      clientY: 100,
      isPrimary: true,
      pointerId: 7,
    });
    expect(handle.hasPointerCapture(7)).toBe(true);
    fireEvent.pointerMove(handle, { clientY: 150, pointerId: 7 });
    expect(panel).toHaveAttribute('data-dragging', 'true');
    expect(panel.style.getPropertyValue('--card-sheet-drag-height')).toBe(
      '550px',
    );
    fireEvent.pointerUp(handle, { clientY: 150, pointerId: 7 });
    expect(handle.hasPointerCapture(7)).toBe(false);
    expect(handle).toHaveAccessibleName('Expand card sheet');
    expect(panel).toHaveAttribute('data-card-snap', 'medium');
    expect(panel).toHaveAttribute('data-dragging', 'false');
    fireEvent.click(handle);
    expect(handle).toHaveAccessibleName('Expand card sheet');

    fireEvent.pointerDown(handle, {
      button: 0,
      clientY: 100,
      isPrimary: true,
      pointerId: 8,
    });
    fireEvent.pointerMove(handle, { clientY: 620, pointerId: 8 });
    fireEvent.pointerUp(handle, { clientY: 620, pointerId: 8 });
    expect(onClose).toHaveBeenCalledOnce();
    expect(panel.style.getPropertyValue('--card-sheet-drag-height')).toBe('');
  });

  it('settles a cancelled drag without changing snap and keeps non-primary or disabled gestures inert', () => {
    setMobile(true);
    const panelRef = createRef<HTMLElement>();
    const onClose = vi.fn();
    const { container } = render(
      <section ref={panelRef}>
        <CardSheetHandle disabled onClose={onClose} panelRef={panelRef} />
      </section>,
    );
    const panel = container.querySelector('section')!;
    const handle = screen.getByRole('button', { name: 'Lower card sheet' });
    fireEvent.pointerDown(handle, {
      button: 0,
      clientY: 100,
      isPrimary: true,
      pointerId: 3,
    });
    fireEvent.pointerMove(handle, { clientY: 300, pointerId: 3 });
    fireEvent.pointerCancel(handle, { pointerId: 3 });
    expect(panel).toHaveAttribute('data-card-snap', 'expanded');
    expect(panel).toHaveAttribute('data-dragging', 'false');
    expect(panel.style.getPropertyValue('--card-sheet-drag-height')).toBe('');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('card presentation sheet gestures', () => {
  it('limits pointer dismissal to mobile header drags and closes through the exposed action', () => {
    const media = setMobile(false);
    const onClose = vi.fn();
    const view = render(<CardGestureHarness onClose={onClose} />);
    const panel = screen.getByRole('region', { name: 'Card details' });
    const header = panel.querySelector('[data-card-sheet-header]')!;
    setRect(panel, 500);
    fireEvent.pointerDown(header, {
      button: 0,
      clientY: 20,
      isPrimary: true,
      pointerId: 1,
    });
    fireEvent.pointerMove(header, { clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(header, { clientY: 300, pointerId: 1 });
    expect(onClose).not.toHaveBeenCalled();

    media.setMatches(true);
    fireEvent(window, new Event('resize'));
    fireEvent.pointerDown(header, {
      button: 0,
      clientY: 20,
      isPrimary: true,
      pointerId: 2,
    });
    fireEvent.pointerMove(header, {
      clientY: 250,
      pointerId: 2,
      cancelable: true,
    });
    expect(panel).toHaveAttribute('data-dragging', 'true');
    expect(panel.style.getPropertyValue('--card-sheet-offset')).toBe('230px');
    const bubbledClick = vi.fn();
    panel.addEventListener('click', bubbledClick);
    fireEvent.pointerUp(header, { clientY: 250, pointerId: 2 });
    expect(onClose).toHaveBeenCalledOnce();
    expect(panel.hasPointerCapture(2)).toBe(false);
    fireEvent.click(header, { detail: 1 });
    expect(bubbledClick).not.toHaveBeenCalled();
    panel.removeEventListener('click', bubbledClick);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss card' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('preserves native control clicks and scrolling gestures, cancels short drags, and removes listeners', () => {
    setMobile(true);
    const onClose = vi.fn();
    const view = render(<CardGestureHarness onClose={onClose} />);
    const panel = screen.getByRole('region', { name: 'Card details' });
    const header = panel.querySelector('[data-card-sheet-header]')!;
    const body = panel.querySelector('div')!;
    setRect(panel, 500);
    body.scrollTop = 30;

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Header action' }),
      {
        button: 0,
        clientY: 20,
        isPrimary: true,
        pointerId: 3,
      },
    );
    fireEvent.pointerMove(header, { clientY: 250, pointerId: 3 });
    expect(panel).not.toHaveAttribute('data-dragging');

    body.scrollTop = 0;
    fireEvent.pointerDown(
      screen.getByRole('link', { name: 'Card detail link' }),
      {
        button: 0,
        clientY: 20,
        isPrimary: true,
        pointerId: 4,
      },
    );
    fireEvent.pointerMove(
      screen.getByRole('link', { name: 'Card detail link' }),
      {
        clientY: 250,
        pointerId: 4,
      },
    );
    expect(panel).not.toHaveAttribute('data-dragging');

    fireEvent.pointerDown(header, {
      button: 0,
      clientY: 20,
      isPrimary: true,
      pointerId: 5,
    });
    fireEvent.pointerMove(header, { clientY: 25, pointerId: 5 });
    fireEvent.pointerUp(header, { clientY: 25, pointerId: 5 });
    expect(onClose).not.toHaveBeenCalled();

    view.unmount();
    const detachedPanel = panel;
    fireEvent.pointerDown(header, {
      button: 0,
      clientY: 20,
      isPrimary: true,
      pointerId: 6,
    });
    fireEvent.pointerMove(header, { clientY: 280, pointerId: 6 });
    expect(detachedPanel.style.getPropertyValue('--card-sheet-offset')).toBe(
      '',
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('creature sheet gestures', () => {
  it('sizes only the open mobile dialog and resets to desktop sizing on resize', () => {
    const media = setMobile(true);
    const closed = renderHook(() => {
      const ref = useRef<HTMLDialogElement>(null);
      useCreatureSheet(ref, false);
      return ref;
    });
    const closedDialog = document.createElement('dialog');
    closed.result.current.current = closedDialog;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(closedDialog.style.height).toBe('');

    const view = render(<CreatureDialogHarness open />);
    const dialog = screen.getByRole('dialog', { name: 'Creature details' });
    const header = dialog.querySelector('header')!;
    const body = dialog.querySelector('.battle-creature-dialog__body')!;
    setRect(header, 60);
    Object.defineProperty(body, 'scrollHeight', {
      configurable: true,
      value: 220,
    });
    act(() => window.dispatchEvent(new Event('resize')));
    expect(dialog.style.height).toBe('320px');
    media.setMatches(false);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(dialog.style.height).toBe('');
    expect(dialog.style.transform).toBe('');
    view.unmount();
    closed.unmount();
  });

  it('dismisses by close control, outside click, Escape, and a downward pointer drag', () => {
    setMobile(true);
    const view = render(<CreatureDialogHarness open />);
    const dialog = screen.getByRole('dialog', {
      name: 'Creature details',
    }) as HTMLDialogElement;
    const header = dialog.querySelector('header')!;
    const body = dialog.querySelector('.battle-creature-dialog__body')!;
    setRect(dialog, 500);
    setRect(header, 60);
    Object.defineProperty(body, 'scrollHeight', {
      configurable: true,
      value: 220,
    });
    const close = vi
      .spyOn(dialog, 'close')
      .mockImplementation(() => dialog.removeAttribute('open'));

    fireEvent.click(
      screen.getByRole('button', { name: 'Close Creature details' }),
    );
    expect(close).toHaveBeenCalledOnce();
    expect(dialog).not.toHaveAttribute('open');
    view.unmount();

    const outside = render(<CreatureDialogHarness open />);
    const outsideDialog = screen.getByRole('dialog', {
      name: 'Creature details',
    }) as HTMLDialogElement;
    setRect(outsideDialog, 500);
    const outsideClose = vi
      .spyOn(outsideDialog, 'close')
      .mockImplementation(() => outsideDialog.removeAttribute('open'));
    fireEvent.click(outsideDialog, { clientX: 600, clientY: 700 });
    expect(outsideClose).toHaveBeenCalledOnce();
    expect(outsideDialog).not.toHaveAttribute('open');
    outside.unmount();

    const escapeView = render(<CreatureDialogHarness open />);
    const escapeDialog = screen.getByRole('dialog', {
      name: 'Creature details',
    }) as HTMLDialogElement;
    const escapeClose = vi
      .spyOn(escapeDialog, 'close')
      .mockImplementation(() => escapeDialog.removeAttribute('open'));
    fireEvent(escapeDialog, new Event('cancel', { cancelable: true }));
    expect(escapeClose).toHaveBeenCalledOnce();
    expect(escapeDialog).not.toHaveAttribute('open');
    escapeView.unmount();

    const dragView = render(<CreatureDialogHarness open />);
    const dragDialog = screen.getByRole('dialog', {
      name: 'Creature details',
    }) as HTMLDialogElement;
    const dragHeader = dragDialog.querySelector('header')!;
    setRect(dragDialog, 500);
    setRect(dragHeader, 60);
    const dragClose = vi
      .spyOn(dragDialog, 'close')
      .mockImplementation(() => dragDialog.removeAttribute('open'));
    fireEvent.pointerDown(dragHeader, {
      button: 0,
      clientY: 20,
      isPrimary: true,
      pointerId: 9,
    });
    fireEvent.pointerMove(dragHeader, { clientY: 180, pointerId: 9 });
    expect(dragDialog).toHaveAttribute('data-dragging', 'true');
    expect(dragDialog.style.transform).toBe('translateY(160px)');
    fireEvent.pointerUp(dragHeader, { clientY: 180, pointerId: 9 });
    expect(dragClose).toHaveBeenCalledOnce();
    expect(dragDialog).not.toHaveAttribute('open');
    dragView.unmount();
  });

  it('keeps desktop gestures inert and settles a cancelled mobile drag without dismissing', () => {
    const media = setMobile(false);
    const view = render(<CreatureDialogHarness open />);
    const dialog = screen.getByRole('dialog', {
      name: 'Creature details',
    }) as HTMLDialogElement;
    const header = dialog.querySelector('header')!;
    setRect(dialog, 500);
    const close = vi
      .spyOn(dialog, 'close')
      .mockImplementation(() => dialog.removeAttribute('open'));
    fireEvent.pointerDown(header, {
      button: 0,
      clientY: 20,
      isPrimary: true,
      pointerId: 10,
    });
    fireEvent.pointerMove(header, { clientY: 220, pointerId: 10 });
    fireEvent.pointerUp(header, { clientY: 220, pointerId: 10 });
    expect(close).not.toHaveBeenCalled();
    expect(dialog.style.height).toBe('');

    media.setMatches(true);
    fireEvent(window, new Event('resize'));
    fireEvent.pointerDown(header, {
      button: 0,
      clientY: 20,
      isPrimary: true,
      pointerId: 11,
    });
    fireEvent.pointerMove(header, { clientY: 80, pointerId: 11 });
    expect(dialog).toHaveAttribute('data-dragging', 'true');
    fireEvent.pointerCancel(header, { pointerId: 11 });
    expect(dialog).not.toHaveAttribute('data-dragging');
    expect(close).not.toHaveBeenCalled();

    view.unmount();
    fireEvent.pointerDown(header, {
      button: 0,
      clientY: 20,
      isPrimary: true,
      pointerId: 12,
    });
    fireEvent.pointerMove(header, { clientY: 250, pointerId: 12 });
    expect(close).not.toHaveBeenCalled();
  });
});

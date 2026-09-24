import { createRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defaultAccessibilityPreferences,
  initializeAccessibilityPreferences,
  prefersReducedMotion,
  resetAccessibilityPreferences,
  updateAccessibilityPreferences,
  accessibilityPreferencesSaved,
} from '../src/accessibility/preferences';
import { AccessibilitySettings } from '../src/accessibility/AccessibilitySettings';
import {
  ReadPageControl,
  readablePageText,
} from '../src/accessibility/ReadPageControl';

afterEach(() => {
  vi.restoreAllMocks();
  resetAccessibilityPreferences();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('accessibility preferences', () => {
  it('updates the document, saves choices, and resets them', () => {
    initializeAccessibilityPreferences();
    const view = render(<AccessibilitySettings />);
    fireEvent.change(screen.getByLabelText('Interface size'), {
      target: { value: '150' },
    });
    fireEvent.change(screen.getByLabelText('Contrast'), {
      target: { value: 'high' },
    });
    expect(document.documentElement.dataset.uiScale).toBe('150');
    expect(document.documentElement.dataset.contrast).toBe('high');
    expect(
      JSON.parse(
        window.localStorage.getItem(
          'wits-world.accessibility-preferences.v1',
        ) ?? '{}',
      ),
    ).toMatchObject({ scale: '150', contrast: 'high' });
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(document.documentElement.dataset.uiScale).toBe('100');
    expect(document.documentElement.dataset.contrast).toBe('standard');
    expect(
      window.localStorage.getItem('wits-world.accessibility-preferences.v1'),
    ).toBeNull();
    view.unmount();
  });

  it('uses the device motion setting until explicitly overridden', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    expect(prefersReducedMotion()).toBe(true);
    updateAccessibilityPreferences({ motion: 'full' });
    expect(prefersReducedMotion()).toBe(false);
    updateAccessibilityPreferences({ motion: 'reduce' });
    expect(prefersReducedMotion()).toBe(true);
  });

  it('accepts valid choices from another tab and rejects invalid values', () => {
    initializeAccessibilityPreferences();
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'wits-world.accessibility-preferences.v1',
        newValue: JSON.stringify({
          ...defaultAccessibilityPreferences,
          scale: '150',
          contrast: 'broken',
        }),
      }),
    );
    expect(document.documentElement.dataset.uiScale).toBe('150');
    expect(document.documentElement.dataset.contrast).toBe('standard');
  });

  it('keeps the choice usable in memory when storage cannot save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    updateAccessibilityPreferences({ reading: 'comfortable' });
    expect(document.documentElement.dataset.reading).toBe('comfortable');
    expect(accessibilityPreferencesSaved()).toBe(false);
  });
});

describe('read aloud', () => {
  it('reads visible navigation and main text without hidden or input content', () => {
    document.body.innerHTML =
      '<div style="display:none"><nav aria-label="Player"><a>Hidden nav</a></nav></div><nav aria-label="Player"><a>Explore</a></nav><main><h1>Challenge</h1><p>Question text</p><p hidden>Hidden answer</p><input value="private" /><details><summary>Closed review</summary><p>Secret review</p></details></main>';
    const result = readablePageText(document.querySelector('main')!);
    expect(result).toContain('Navigation. Explore. Challenge Question text');
    expect(result).toContain('Closed review');
    expect(result).not.toContain('Hidden answer');
    expect(result).not.toContain('Hidden nav');
    expect(result).not.toContain('Secret review');
    expect(result).not.toContain('private');
    document.body.innerHTML = '';
  });

  it('starts only on request and supports pause, resume, stop, and route cancellation', () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    const pause = vi.fn();
    const resume = vi.fn();
    class Utterance {
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    vi.stubGlobal('speechSynthesis', { speak, cancel, pause, resume });
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    updateAccessibilityPreferences({ speech: true });
    const main = document.createElement('main');
    main.innerHTML = '<h1>Welcome</h1><p>Read this page.</p>';
    document.body.append(main);
    const ref = createRef<HTMLElement>();
    ref.current = main;
    const view = render(<ReadPageControl main={ref} pathname="/" />);
    expect(speak).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Read page' }).querySelector('svg'),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Read page' }));
    expect(speak).toHaveBeenCalledTimes(1);
    expect((speak.mock.calls[0]?.[0] as Utterance).text).toContain(
      'Welcome Read this page',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pause reading' }));
    expect(pause).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Resume reading' }));
    expect(resume).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Stop reading' }));
    expect(cancel).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Read page' }));
    view.rerender(
      <ReadPageControl key="/explore" main={ref} pathname="/explore" />,
    );
    expect(cancel).toHaveBeenCalledTimes(4);
    view.unmount();
    main.remove();
  });

  it('stops when the content being read changes', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(public text: string) {}
      },
    );
    updateAccessibilityPreferences({ speech: true });
    const main = document.createElement('main');
    main.innerHTML = '<h1>Question one</h1>';
    document.body.append(main);
    const ref = createRef<HTMLElement>();
    ref.current = main;
    const view = render(<ReadPageControl main={ref} pathname="/challenge" />);
    fireEvent.click(screen.getByRole('button', { name: 'Read page' }));
    main.querySelector('h1')!.textContent = 'Question two';
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Read page' })).toBeVisible(),
    );
    expect(cancel).toHaveBeenCalledTimes(2);
    view.unmount();
    main.remove();
  });

  it('stops when visibility state changes the readable text', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(public text: string) {}
      },
    );
    updateAccessibilityPreferences({ speech: true });
    const main = document.createElement('main');
    main.innerHTML = '<h1>Question</h1><p hidden>Revealed answer</p>';
    document.body.append(main);
    const ref = createRef<HTMLElement>();
    ref.current = main;
    const view = render(<ReadPageControl main={ref} pathname="/challenge" />);
    fireEvent.click(screen.getByRole('button', { name: 'Read page' }));

    main.querySelector('p')!.hidden = false;

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Read page' })).toBeVisible(),
    );
    expect(cancel).toHaveBeenCalledTimes(2);
    view.unmount();
    main.remove();
  });

  it('stops when Player navigation changes outside main', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(public text: string) {}
      },
    );
    updateAccessibilityPreferences({ speech: true });
    const navigation = document.createElement('nav');
    navigation.setAttribute('aria-label', 'Player');
    navigation.textContent = 'Explore';
    const main = document.createElement('main');
    main.innerHTML = '<h1>Challenge</h1>';
    document.body.append(navigation, main);
    const ref = createRef<HTMLElement>();
    ref.current = main;
    const view = render(<ReadPageControl main={ref} pathname="/challenge" />);
    fireEvent.click(screen.getByRole('button', { name: 'Read page' }));

    navigation.textContent = 'Collection';

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Read page' })).toBeVisible(),
    );
    expect(cancel).toHaveBeenCalledTimes(2);
    view.unmount();
    navigation.remove();
    main.remove();
  });
});

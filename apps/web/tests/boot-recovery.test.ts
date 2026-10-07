import { readFileSync } from 'node:fs';
import { screen } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BOOT_LONG_WAIT_MS, bootApplication } from '../src/boot-recovery';

const indexHtml = readFileSync('index.html', 'utf8');

beforeEach(() => {
  vi.useFakeTimers();
  const initialDocument = new DOMParser().parseFromString(
    indexHtml,
    'text/html',
  );
  document.body.innerHTML = initialDocument.body.innerHTML;
});

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('document boot recovery', () => {
  it('ships useful native recovery links independently of application JavaScript', () => {
    expect(screen.getByRole('heading', { name: 'Wits World' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Opening Wits World…');
    expect(
      screen.getByRole('link', { name: 'Reload this page' }),
    ).toHaveAttribute('href', '');
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      screen.getByRole('link', { name: 'Open saved events' }),
    ).toHaveAttribute('href', '/offline');
    const initialDocument = new DOMParser().parseFromString(
      indexHtml,
      'text/html',
    );
    expect(
      initialDocument.querySelector('link[href="/src/boot.css"]'),
    ).not.toBeNull();
  });

  it('recovers a rejected main module read without exposing internal errors', async () => {
    const root = document.getElementById('root');
    await bootApplication(root, () =>
      Promise.reject(new Error('private module details')),
    );

    expect(document.getElementById('app-boot')).toHaveAttribute(
      'data-state',
      'error',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Wits World could not be opened.',
    );
    expect(document.body).not.toHaveTextContent('private module details');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps static fallback and recovery available when module loading never settles', async () => {
    const root = document.getElementById('root');
    const fallback = document.getElementById('app-boot');
    void bootApplication(root, () => new Promise<never>(() => undefined));

    await vi.advanceTimersByTimeAsync(BOOT_LONG_WAIT_MS);

    expect(document.getElementById('app-boot')).toBe(fallback);
    expect(fallback).toHaveAttribute('data-state', 'slow');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Opening Wits World is taking longer than expected.',
    );
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('clears its timer after mounting and leaves application content untouched', async () => {
    const root = document.getElementById('root');
    let finishLoading!: () => void;
    const loading = bootApplication(
      root,
      () =>
        new Promise<void>((resolve) => {
          finishLoading = resolve;
        }),
    );
    root!.innerHTML = '<main><h1>Your campus</h1></main>';
    await vi.advanceTimersByTimeAsync(BOOT_LONG_WAIT_MS);
    expect(screen.getByRole('heading', { name: 'Your campus' })).toBeVisible();

    finishLoading();
    await loading;
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.queryByText(/longer than expected/)).toBeNull();
  });
});

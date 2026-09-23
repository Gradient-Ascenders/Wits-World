import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { LoadingState } from '../src/components/LoadingState';

function BrokenComponent(): never {
  throw new Error('Expected test error');
}

describe('application status states', () => {
  it('announces local loading with the subtle marker', () => {
    render(<LoadingState />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading this Wits World page…',
    );
    expect(screen.getByRole('status').querySelector('.quest-marker')).toBeTruthy();
    expect(screen.getByRole('status').querySelector('.loading-seal')).toBeNull();
  });

  it('uses the seal for a page transition', () => {
    render(<LoadingState prominent />);

    expect(screen.getByRole('status').querySelector('.loading-seal svg')).toBeTruthy();
  });

  it('shows a usable fallback after an unexpected render error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <App>
        <BrokenComponent />
      </App>,
    );

    expect(screen.getByRole('alert')).toBeVisible();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'This page could not be displayed',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Reload Wits World' }),
    ).toBeEnabled();
  });
});

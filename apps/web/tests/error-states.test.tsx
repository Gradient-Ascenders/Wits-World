import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { LoadingState } from '../src/components/LoadingState';

function BrokenComponent(): never {
  throw new Error('Expected test error');
}

describe('application status states', () => {
  it('announces route loading without relying on animation', () => {
    render(<LoadingState />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading this Wits Quest page…',
    );
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
      screen.getByRole('heading', { level: 1, name: 'Something went wrong' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Reload Wits Quest' }),
    ).toBeEnabled();
  });
});

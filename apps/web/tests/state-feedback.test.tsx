import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthorApiError } from '../src/api/author';
import { authorErrorDetail } from '../src/components/author/author-error-copy';
import { OfflineExplorePage } from '../src/offline/OfflinePages';

vi.mock('../src/offline/OfflineProvider', () => ({
  useOffline: () => ({
    revision: 0,
    online: false,
    refresh: vi.fn(),
    sync: vi.fn(),
  }),
}));
vi.mock('../src/offline/store', () => ({
  readOfflineState: () =>
    Promise.reject(new DOMException('Internal storage diagnostic')),
  boundOfflinePlayer: () => undefined,
}));

describe('recoverable feedback boundaries', () => {
  it('ends loading when device storage fails instead of promising content indefinitely', async () => {
    render(<OfflineExplorePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Device storage is unavailable. Connect to play online.',
    );
    expect(screen.queryByText('Loading saved events…')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Internal storage diagnostic'),
    ).not.toBeInTheDocument();
  });

  it('hides infrastructure details while preserving actionable domain validation', () => {
    const failure = new AuthorApiError(
      'unavailable',
      'SQL connection at private-host',
    );
    expect(authorErrorDetail(failure)).not.toContain('private-host');
    expect(authorErrorDetail(failure)).toContain(
      'No content change was confirmed.',
    );
    const validation = new AuthorApiError(
      'validation',
      'The end time must be after the start time.',
    );
    expect(authorErrorDetail(validation)).toBe(
      'The end time must be after the start time.',
    );
  });
});

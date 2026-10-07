import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ProtectedRoute } from '../src/components/auth/ProtectedRoute';

const session = vi.hoisted(() => ({
  state: {
    status: 'ready',
    player: { id: 'player-a', role: 'player', playerNameSetupRequired: false },
  },
}));
vi.mock('@auth0/auth0-react', () => ({
  useAuth0: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock('../src/auth/CurrentPlayerProvider', () => ({
  useCurrentPlayer: () => ({ state: session.state, reload: vi.fn() }),
}));

it('preserves mounted drafts for same-identity refreshes and destroys them on player or role change', () => {
  const tree = () => (
    <ProtectedRoute>
      <input aria-label="Private draft" defaultValue="" />
    </ProtectedRoute>
  );
  const view = render(tree());
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Private work' },
  });
  view.rerender(tree());
  expect(screen.getByRole('textbox')).toHaveValue('Private work');
  session.state.player.id = 'player-b';
  view.rerender(tree());
  expect(screen.getByRole('textbox')).toHaveValue('');
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Second private work' },
  });
  session.state.player.role = 'author';
  view.rerender(tree());
  expect(screen.getByRole('textbox')).toHaveValue('');
});

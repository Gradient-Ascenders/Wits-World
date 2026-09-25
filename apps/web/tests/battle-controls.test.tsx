import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { BattleActionPanel } from '../src/components/matches/BattlePresentation';
import { activeMatch } from './fixtures/matches';

it('requires both the authoritative actor and legal action, and locks during submission', async () => {
  const match = activeMatch();
  const onAction = vi.fn();
  const props = {
    activeCreatureId: match.state.player.activeCreatureId,
    busy: false,
    creatures: match.state.player.creatures,
    currentActor: false,
    idPrefix: 'test',
    legalActions: match.state.legalActions,
    onAction,
    opponentLabel: 'Opponent',
    phase: 'active' as const,
    powerCards: match.state.player.powerCards,
  };
  const { rerender } = render(<BattleActionPanel {...props} />);
  const move = screen.getByRole('button', { name: /Knowledge Strike 1/ });
  expect(move).toBeDisabled();
  await userEvent.click(move);
  expect(onAction).not.toHaveBeenCalled();
  rerender(<BattleActionPanel {...props} currentActor />);
  expect(move).toBeEnabled();
  rerender(<BattleActionPanel {...props} currentActor busy />);
  expect(move).toBeDisabled();
  rerender(<BattleActionPanel {...props} currentActor inputBlocked />);
  expect(move).toBeDisabled();
  rerender(<BattleActionPanel {...props} currentActor legalActions={[]} />);
  expect(move).toHaveAttribute('aria-disabled', 'true');
  const reasonId = move.getAttribute('aria-describedby');
  expect(reasonId).toBeTruthy();
  expect(document.getElementById(reasonId!)).toHaveTextContent(
    'Unavailable this turn.',
  );
  await userEvent.click(move);
  expect(onAction).not.toHaveBeenCalled();
});

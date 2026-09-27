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

it('offers living bench swaps only when the server lists them as legal', async () => {
  const match = activeMatch();
  const onAction = vi.fn();
  const [first, second, third] = match.state.player.creatures;
  third!.defeated = true;
  third!.currentHp = 0;
  const props = {
    activeCreatureId: first!.id,
    busy: false,
    creatures: match.state.player.creatures,
    currentActor: true,
    idPrefix: 'swap-test',
    legalActions: [{ type: 'swap_creature' as const, creatureId: second!.id }],
    onAction,
    opponentLabel: 'CPU',
    phase: 'active' as const,
    powerCards: match.state.player.powerCards,
  };
  const { rerender } = render(<BattleActionPanel {...props} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: /Swap/ }));
  expect(screen.getByRole('tabpanel', { name: /Swap/ })).toHaveTextContent(
    'Swapping ends your turn.',
  );
  expect(screen.queryByText('Wit Creature 3')).toBeNull();
  await user.click(screen.getByRole('button', { name: /Wit Creature 2/ }));
  expect(onAction).toHaveBeenCalledExactlyOnceWith({
    type: 'swap_creature',
    creatureId: second!.id,
  });

  rerender(<BattleActionPanel {...props} legalActions={[]} />);
  expect(
    screen.getByRole('button', { name: /Wit Creature 2/ }),
  ).toHaveAttribute('aria-disabled', 'true');
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  BattleActionPanel,
  BattleBench,
  BattleCombatant,
} from '../src/components/matches/BattlePresentation';
import { activeMatch } from './fixtures/matches';

describe('shared battle presentation', () => {
  it('uses approved revealed artwork and falls back when it cannot load', () => {
    const creature = {
      ...activeMatch(1).state.player.creatures[0]!,
      name: 'Quillip',
    };
    const { container, rerender } = render(
      <BattleCombatant
        creature={creature}
        emptyText="Hidden"
        heading="CPU"
        isActing={false}
        visualSide="cpu"
      />,
    );
    const picture = container.querySelector('img')!;
    expect(picture).toHaveAttribute('src', '/cards/quillip.webp');
    fireEvent.error(picture);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.combatant__sigil')).toHaveTextContent('Q');
    rerender(
      <BattleCombatant
        creature={null}
        emptyText="Hidden"
        heading="CPU"
        isActing={false}
        visualSide="cpu"
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    rerender(
      <BattleCombatant
        creature={{ ...creature, name: 'Unknown Creature' }}
        emptyText="Hidden"
        heading="CPU"
        isActing={false}
        visualSide="cpu"
      />,
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('discloses only the owned bench with stable Creature labels and no gameplay controls', async () => {
    const user = userEvent.setup();
    const match = activeMatch(1);
    match.state.player.creatures[2]!.defeated = true;
    match.state.player.creatures[2]!.currentHp = 0;
    render(
      <BattleBench
        creatures={match.state.player.creatures}
        activeCreatureId={match.state.player.activeCreatureId}
      />,
    );
    expect(
      screen.getByRole('list', { name: 'Your bench Creatures', hidden: true }),
    ).not.toBeVisible();
    await user.click(screen.getByText('Your bench'));
    const bench = screen.getByRole('list', { name: 'Your bench Creatures' });
    expect(within(bench).getAllByRole('listitem')).toHaveLength(2);
    expect(within(bench).getByText('Wit Creature 2')).toBeVisible();
    expect(within(bench).getByText('Wit Creature 3')).toBeVisible();
    expect(within(bench).getByText('Defeated')).toBeVisible();
    expect(within(bench).queryByRole('button')).toBeNull();
    expect(within(bench).queryByText('Wit Creature 1')).toBeNull();
  });

  it('uses legal actions even when displayed costs would suggest a different rule', async () => {
    const user = userEvent.setup();
    const match = activeMatch(1);
    const active = match.state.player.creatures[0]!;
    const move = active.moves[0]!;
    move.powerCost = 99;
    const onAction = vi.fn();
    render(
      <BattleActionPanel
        activeCreatureId={active.id}
        busy={false}
        creatures={match.state.player.creatures}
        currentActor
        idPrefix="test"
        legalActions={[{ type: 'use_move', moveId: move.id }]}
        onAction={onAction}
        opponentLabel="CPU"
        phase="active"
        powerCards={[]}
      />,
    );
    await user.click(
      screen.getByRole('button', { name: /Knowledge Strike 1/ }),
    );
    expect(onAction).toHaveBeenCalledExactlyOnceWith({
      type: 'use_move',
      moveId: move.id,
    });
  });

  it('keeps forced replacement choices separate from normal move controls', async () => {
    const user = userEvent.setup();
    const match = activeMatch(1);
    const choices = match.state.player.creatures;
    choices[0]!.defeated = true;
    choices[0]!.currentHp = 0;
    const onAction = vi.fn();
    render(
      <BattleActionPanel
        activeCreatureId={null}
        busy={false}
        creatures={choices}
        currentActor
        idPrefix="test"
        legalActions={[
          { type: 'select_replacement', creatureId: choices[1]!.id },
        ]}
        onAction={onAction}
        opponentLabel="CPU"
        phase="replacement"
        powerCards={match.state.player.powerCards}
      />,
    );
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByText('This Creature is defeated.')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: /Use as replacement Wit Creature 2/ }),
    );
    expect(onAction).toHaveBeenCalledExactlyOnceWith({
      type: 'select_replacement',
      creatureId: choices[1]!.id,
    });
    expect(
      screen.getByRole('button', { name: /Use as replacement Wit Creature 3/ }),
    ).toBeDisabled();
  });
});

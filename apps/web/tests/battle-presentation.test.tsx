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
    const frame = picture.closest('.card-frame--common');
    expect(frame?.querySelector('.card-frame__engraving')).toBeInTheDocument();
    expect(frame?.querySelector('.card-frame__rail')).toBeInTheDocument();
    expect(frame?.querySelector('.card-frame__rarity')).toHaveTextContent(
      'Common',
    );
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

  it('keeps legacy creature rarity unknown in the shared battle UI', () => {
    const creature = {
      ...activeMatch(1).state.player.creatures[0]!,
      rarity: undefined,
    };
    const { container } = render(
      <BattleCombatant
        creature={creature}
        emptyText="Hidden"
        heading="Player"
        isActing
        visualSide="player"
      />,
    );

    expect(container.querySelector('.card-frame--neutral')).toBeInTheDocument();
    expect(container.querySelector('.card-frame__rarity')).toBeNull();
    expect(container).not.toHaveTextContent('Common');
  });

  it('exposes acting, dimmed, and entrance states without hiding combatant vitals', () => {
    const creature = activeMatch(1).state.player.creatures[0]!;
    const { container } = render(
      <BattleCombatant
        creature={creature}
        emptyText="Hidden"
        heading="Player"
        isActing
        isDimmed
        isEntering
        isResolving
        visualSide="player"
      />,
    );

    const combatant = container.querySelector('.combatant');
    expect(combatant).toHaveClass(
      'combatant--acting',
      'combatant--dimmed',
      'combatant--entering',
    );
    expect(screen.getByText('Player · Acting')).toBeVisible();
    expect(screen.getByLabelText(/HP/)).toBeVisible();
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
    await user.click(screen.getByText('Bench'));
    const bench = screen.getByRole('list', { name: 'Your bench Creatures' });
    expect(within(bench).getAllByRole('listitem')).toHaveLength(2);
    expect(within(bench).getByText('Wit Creature 2')).toBeVisible();
    expect(within(bench).getByText('Wit Creature 3')).toBeVisible();
    expect(within(bench).getByText('Defeated')).toBeVisible();
    expect(
      within(bench).getAllByRole('button', { name: /View .* details/ }),
    ).toHaveLength(2);
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

  it('shows only server-projected move effectiveness', () => {
    const match = activeMatch(1);
    const active = match.state.player.creatures[0]!;
    active.moves[0]!.effectiveness = 'effective';
    const props = {
      activeCreatureId: active.id,
      busy: false,
      creatures: match.state.player.creatures,
      currentActor: true,
      idPrefix: 'effectiveness',
      legalActions: match.state.legalActions,
      onAction: vi.fn(),
      opponentLabel: 'CPU',
      phase: 'active' as const,
      powerCards: [],
    };
    const { rerender } = render(<BattleActionPanel {...props} />);

    const action = screen.getByRole('button', {
      name: /Knowledge Strike 1/,
    });
    const effectiveBadge = screen.getByText('Effective');
    expect(effectiveBadge).toBeVisible();
    expect(effectiveBadge).toHaveAttribute(
      'title',
      'Strong matchup: this move deals increased damage.',
    );
    expect(action).toHaveAccessibleDescription(
      'Strong matchup: this move deals increased damage.',
    );

    active.moves[0]!.effectiveness = 'resisted';
    rerender(
      <BattleActionPanel
        {...props}
        creatures={structuredClone(match.state.player.creatures)}
      />,
    );
    expect(screen.getByText('Resisted')).toHaveAttribute(
      'title',
      'Weak matchup: this move deals reduced damage.',
    );
    expect(action).toHaveAccessibleDescription(
      'Weak matchup: this move deals reduced damage.',
    );

    active.moves[0]!.effectiveness = 'neutral';
    rerender(
      <BattleActionPanel
        {...props}
        creatures={structuredClone(match.state.player.creatures)}
      />,
    );
    expect(screen.getByText('Neutral')).toHaveAttribute(
      'title',
      'Even matchup: this move deals its normal damage.',
    );
    expect(action).toHaveAccessibleDescription(
      'Even matchup: this move deals its normal damage.',
    );

    active.moves[0]!.effectiveness = undefined;
    rerender(
      <BattleActionPanel
        {...props}
        creatures={structuredClone(match.state.player.creatures)}
      />,
    );
    expect(screen.queryByText('Effective')).toBeNull();
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
    ).toHaveAttribute('aria-disabled', 'true');
  });
});

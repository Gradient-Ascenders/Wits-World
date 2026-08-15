import { describe, expect, it } from 'vitest';

import {
  applyBattleAction,
  basicTurnTimerConfig,
  chooseCpuAction,
  createBattleState,
  getLegalActions,
  getTypeMultiplier,
  IllegalBattleActionError,
  InvalidBattleSetupError,
  type BattleAction,
  type BattleCreatureCard,
  type BattleDeck,
  type BattleEffect,
  type BattleMove,
  type BattlePowerCard,
  type BattleState,
} from '../src/index.js';

const randomZero = () => 0;

function makeDamageMove(
  id: string,
  effectValue = 10,
  moveType: BattleMove['moveType'] = 'basic',
  powerCost = 1,
): BattleMove {
  return {
    id,
    name: id,
    moveType,
    powerCost,
    effects: [
      {
        id: `${id}-damage`,
        effectType: 'damage',
        effectValue,
      },
    ],
  };
}

function makeCreature(
  id: string,
  affinity: BattleCreatureCard['affinity'] = 'wit',
  maxHp = 100,
  maxPower = 10,
  moves: readonly BattleMove[] = [makeDamageMove(`${id}-move`)],
): BattleCreatureCard {
  return {
    id,
    affinity,
    maxHp,
    maxPower,
    moves,
  };
}

function makePowerCard(
  id: string,
  effects: readonly BattleEffect[],
  affinity: BattlePowerCard['affinity'] = 'wit',
): BattlePowerCard {
  return {
    id,
    affinity,
    effects,
  };
}

function makeDeck(
  prefix: string,
  options: {
    creatureHp?: number;
    creaturePower?: number;
    creatureAffinity?: BattleCreatureCard['affinity'];
    moves?: readonly BattleMove[];
    powerCards?: readonly BattlePowerCard[];
  } = {},
): BattleDeck {
  return {
    creatureCards: [1, 2, 3].map((position) =>
      makeCreature(
        `${prefix}-creature-${position}`,
        options.creatureAffinity,
        options.creatureHp,
        options.creaturePower,
        options.moves,
      ),
    ),
    powerCards: options.powerCards ?? [
      makePowerCard(`${prefix}-power-1`, [
        {
          id: `${prefix}-power-1-heal`,
          effectType: 'heal',
          effectValue: 5,
        },
      ]),
      makePowerCard(`${prefix}-power-2`, [
        {
          id: `${prefix}-power-2-heal`,
          effectType: 'heal',
          effectValue: 5,
        },
      ]),
    ],
  };
}

function startBattle(
  playerDeck = makeDeck('player'),
  cpuDeck = makeDeck('cpu', { creatureAffinity: 'grit' }),
  randomInt = randomZero,
): BattleState {
  const initial = createBattleState(playerDeck, cpuDeck);
  const playerSelection = applyBattleAction(
    initial,
    'player',
    {
      type: 'select_initial_creature',
      creatureId: playerDeck.creatureCards[0]!.id,
    },
    randomInt,
  );
  const revealed = applyBattleAction(
    playerSelection.state,
    'cpu',
    {
      type: 'select_initial_creature',
      creatureId: cpuDeck.creatureCards[0]!.id,
    },
    randomInt,
  );

  return revealed.state;
}

function action(
  state: BattleState,
  side: 'player' | 'cpu',
  selectedAction: BattleAction,
): BattleState {
  return applyBattleAction(state, side, selectedAction, randomZero).state;
}

function activeCreature(state: BattleState, side: 'player' | 'cpu') {
  const participant = state.participants[side];
  return participant.creatures.find(
    (creature) => creature.card.id === participant.activeCreatureId,
  )!;
}

describe('Basic battle rules', () => {
  it('exposes the approved configurable turn durations', () => {
    expect(basicTurnTimerConfig).toEqual({
      pvpTurnSeconds: 60,
      cpuTurnSeconds: 90,
    });
  });

  it('uses the approved affinity cycle and leaves Basic moves neutral', () => {
    expect(getTypeMultiplier('basic', 'grit')).toBe(1);
    expect(getTypeMultiplier('wit', 'grit')).toBe(1.5);
    expect(getTypeMultiplier('grit', 'wit')).toBe(0.75);
    expect(getTypeMultiplier('wit', 'spark')).toBe(1);
    expect(getTypeMultiplier('wit', 'wit')).toBe(1);
  });

  it('reveals both initial Creatures before selecting the first side by coin flip', () => {
    const playerDeck = makeDeck('player');
    const cpuDeck = makeDeck('cpu');
    const initial = createBattleState(playerDeck, cpuDeck);

    expect(getLegalActions(initial, 'player')).toHaveLength(3);
    expect(getLegalActions(initial, 'cpu')).toHaveLength(3);

    const playerSelected = applyBattleAction(
      initial,
      'player',
      {
        type: 'select_initial_creature',
        creatureId: playerDeck.creatureCards[0]!.id,
      },
      randomZero,
    ).state;

    expect(playerSelected.phase).toBe('initial_selection');
    expect(playerSelected.currentSide).toBeNull();

    const cpuSelected = applyBattleAction(
      playerSelected,
      'cpu',
      {
        type: 'select_initial_creature',
        creatureId: cpuDeck.creatureCards[0]!.id,
      },
      () => 1,
    ).state;

    expect(cpuSelected.phase).toBe('active');
    expect(cpuSelected.firstSide).toBe('cpu');
    expect(cpuSelected.currentSide).toBe('cpu');
    expect(cpuSelected.participants.player.activeCreatureId).toBe(
      playerDeck.creatureCards[0]!.id,
    );
    expect(cpuSelected.participants.cpu.activeCreatureId).toBe(
      cpuDeck.creatureCards[0]!.id,
    );
  });

  it('resolves a legal move with Power cost and type-modified Damage', () => {
    const typedMove = makeDamageMove('typed-move', 10, 'wit');
    const state = startBattle(
      makeDeck('player', { moves: [typedMove] }),
      makeDeck('cpu', { creatureAffinity: 'grit' }),
    );
    const playerCreature = activeCreature(state, 'player');
    const before = structuredClone(state);

    const transition = applyBattleAction(
      state,
      'player',
      { type: 'use_move', moveId: playerCreature.card.moves[0]!.id },
      randomZero,
    );

    expect(transition.state).not.toBe(state);
    expect(state).toEqual(before);
    expect(activeCreature(transition.state, 'cpu').currentHp).toBe(85);
    expect(activeCreature(transition.state, 'player').remainingPower).toBe(9);
    expect(transition.result.effects[0]).toMatchObject({
      effectType: 'damage',
      amount: 15,
    });
    expect(transition.state.currentSide).toBe('cpu');
  });

  it('rejects actions from the wrong side and leaves the state unchanged', () => {
    const state = startBattle();
    const before = structuredClone(state);

    expect(() =>
      applyBattleAction(
        state,
        'cpu',
        { type: 'use_move', moveId: 'not-the-cpu-move' },
        randomZero,
      ),
    ).toThrow(IllegalBattleActionError);
    expect(state).toEqual(before);
  });

  it('rejects a move when the Creature cannot pay its Power cost', () => {
    const expensiveMove = makeDamageMove('expensive', 10, 'basic', 1);
    const state = startBattle(
      makeDeck('player', {
        creaturePower: 0,
        moves: [expensiveMove],
      }),
    );
    const before = structuredClone(state);

    expect(() =>
      applyBattleAction(
        state,
        'player',
        { type: 'use_move', moveId: expensiveMove.id },
        randomZero,
      ),
    ).toThrow(IllegalBattleActionError);
    expect(state).toEqual(before);
    expect(getLegalActions(state, 'player')).toHaveLength(2);
  });

  it('applies multiple Power-card effects, discards the card, and rejects reuse', () => {
    const powerCard = makePowerCard('multi-effect', [
      {
        id: 'multi-effect-heal',
        effectType: 'heal',
        effectValue: 5,
      },
      {
        id: 'multi-effect-buff',
        effectType: 'buff',
        effectValue: 20,
        modifier: {
          stat: 'damage_multiplier',
          operation: 'multiply',
          durationTurns: 1,
        },
      },
    ]);
    const afterReveal = startBattle(
      makeDeck('player', {
        powerCards: [
          powerCard,
          makePowerCard('other', [
            { id: 'other-heal', effectType: 'heal', effectValue: 1 },
          ]),
        ],
      }),
      makeDeck('cpu'),
      () => 1,
    );
    const state = action(afterReveal, 'cpu', {
      type: 'use_move',
      moveId: activeCreature(afterReveal, 'cpu').card.moves[0]!.id,
    });

    const transition = applyBattleAction(
      state,
      'player',
      { type: 'use_power_card', powerCardId: powerCard.id },
      randomZero,
    );

    expect(transition.state.participants.player.usedPowerCardIds).toEqual([
      powerCard.id,
    ]);
    expect(activeCreature(transition.state, 'player').currentHp).toBe(95);
    expect(
      activeCreature(transition.state, 'player').modifiers[0],
    ).toMatchObject({
      stat: 'damage_multiplier',
      value: 1.2,
      remainingTurns: 1,
    });
    expect(() =>
      applyBattleAction(
        transition.state,
        'cpu',
        { type: 'use_power_card', powerCardId: powerCard.id },
        randomZero,
      ),
    ).toThrow(IllegalBattleActionError);
  });

  it('rejects Power-card actions before an active Creature is revealed', () => {
    const playerDeck = makeDeck('player');
    const state = createBattleState(playerDeck, makeDeck('cpu'));

    expect(() =>
      applyBattleAction(
        state,
        'player',
        {
          type: 'use_power_card',
          powerCardId: playerDeck.powerCards[0]!.id,
        },
        randomZero,
      ),
    ).toThrow(IllegalBattleActionError);
  });

  it('supports HP and Power Buff/Debuff changes with bounds', () => {
    const powerCard = makePowerCard('stat-effects', [
      {
        id: 'stat-effects-heal',
        effectType: 'heal',
        effectValue: 50,
      },
      {
        id: 'stat-effects-power',
        effectType: 'buff',
        effectValue: 5,
        modifier: { stat: 'power', operation: 'add' },
      },
    ]);
    const afterReveal = startBattle(
      makeDeck('player', {
        powerCards: [
          powerCard,
          makePowerCard('other', [
            { id: 'other-heal', effectType: 'heal', effectValue: 1 },
          ]),
        ],
      }),
      makeDeck('cpu'),
      () => 1,
    );
    const state = action(afterReveal, 'cpu', {
      type: 'use_move',
      moveId: activeCreature(afterReveal, 'cpu').card.moves[0]!.id,
    });

    const transition = applyBattleAction(
      state,
      'player',
      { type: 'use_power_card', powerCardId: powerCard.id },
      randomZero,
    );

    expect(activeCreature(transition.state, 'player').currentHp).toBe(100);
    expect(activeCreature(transition.state, 'player').remainingPower).toBe(10);
  });

  it('keeps a temporary damage modifier for the affected Creature turn and then expires it', () => {
    const powerCard = makePowerCard('temporary-buff', [
      {
        id: 'temporary-buff-effect',
        effectType: 'buff',
        effectValue: 50,
        modifier: {
          stat: 'damage_multiplier',
          operation: 'multiply',
          durationTurns: 1,
        },
      },
    ]);
    const state = startBattle(
      makeDeck('player', {
        powerCards: [
          powerCard,
          makePowerCard('other', [
            { id: 'other-heal', effectType: 'heal', effectValue: 1 },
          ]),
        ],
      }),
    );

    const afterBuff = action(state, 'player', {
      type: 'use_power_card',
      powerCardId: powerCard.id,
    });
    const afterCpu = action(afterBuff, 'cpu', {
      type: 'use_move',
      moveId: activeCreature(afterBuff, 'cpu').card.moves[0]!.id,
    });
    const afterAttack = applyBattleAction(
      afterCpu,
      'player',
      {
        type: 'use_move',
        moveId: activeCreature(afterCpu, 'player').card.moves[0]!.id,
      },
      randomZero,
    );

    expect(afterAttack.result.effects[0]).toMatchObject({ amount: 15 });
    expect(activeCreature(afterAttack.state, 'player').modifiers).toEqual([]);
  });

  it('ends a timed-out turn without changing battle stats', () => {
    const state = startBattle();
    const before = structuredClone(state);
    const transition = applyBattleAction(
      state,
      'player',
      { type: 'timeout' },
      randomZero,
    );

    expect(transition.result.turnEnded).toBe(true);
    expect(transition.result.effects).toEqual([]);
    expect(transition.state.currentSide).toBe('cpu');
    expect(activeCreature(transition.state, 'player').currentHp).toBe(
      activeCreature(before, 'player').currentHp,
    );
  });

  it('requires replacement after defeat and does not consume the replacement turn', () => {
    const weakCpuDeck = makeDeck('cpu', {
      creatureHp: 5,
      creatureAffinity: 'grit',
    });
    const state = startBattle(makeDeck('player'), weakCpuDeck);
    const playerMove = activeCreature(state, 'player').card.moves[0]!;
    const defeated = applyBattleAction(
      state,
      'player',
      { type: 'use_move', moveId: playerMove.id },
      randomZero,
    ).state;

    expect(defeated.phase).toBe('replacement');
    expect(defeated.replacementSide).toBe('cpu');
    expect(defeated.currentSide).toBe('cpu');
    expect(getLegalActions(defeated, 'cpu')).toEqual([
      {
        type: 'select_replacement',
        creatureId: weakCpuDeck.creatureCards[1]!.id,
      },
      {
        type: 'select_replacement',
        creatureId: weakCpuDeck.creatureCards[2]!.id,
      },
    ]);

    const replaced = action(defeated, 'cpu', {
      type: 'select_replacement',
      creatureId: weakCpuDeck.creatureCards[1]!.id,
    });

    expect(replaced.phase).toBe('active');
    expect(replaced.currentSide).toBe('cpu');
    expect(getLegalActions(replaced, 'cpu')[0]).toEqual({
      type: 'use_move',
      moveId: weakCpuDeck.creatureCards[1]!.moves[0]!.id,
    });
  });

  it('rejects voluntary switching and makes a completed match immutable', () => {
    const oneHitDeck = makeDeck('cpu', {
      creatureHp: 5,
      creatureAffinity: 'grit',
    });
    let state = startBattle(makeDeck('player'), oneHitDeck);

    expect(() =>
      applyBattleAction(
        state,
        'player',
        {
          type: 'select_replacement',
          creatureId: 'player-creature-2',
        },
        randomZero,
      ),
    ).toThrow(IllegalBattleActionError);

    for (let index = 0; index < 3; index += 1) {
      state = action(state, 'player', {
        type: 'use_move',
        moveId: activeCreature(state, 'player').card.moves[0]!.id,
      });

      if (state.phase === 'replacement') {
        state = action(state, 'cpu', {
          type: 'select_replacement',
          creatureId: oneHitDeck.creatureCards[index + 1]!.id,
        });
        state = action(state, 'cpu', { type: 'timeout' });
      }
    }

    expect(state.phase).toBe('completed');
    expect(state.winner).toBe('player');
    const completed = structuredClone(state);

    expect(() =>
      applyBattleAction(state, 'player', { type: 'timeout' }, randomZero),
    ).toThrow(IllegalBattleActionError);
    expect(state).toEqual(completed);
  });

  it('selects only legal CPU actions using injected randomness', () => {
    const initial = createBattleState(makeDeck('player'), makeDeck('cpu'));

    expect(chooseCpuAction(initial, () => 2)).toMatchObject({
      type: 'select_initial_creature',
      creatureId: 'cpu-creature-3',
    });
    expect(getLegalActions(initial, 'cpu')).toHaveLength(3);

    const active = startBattle();
    const cpuTurn = action(active, 'player', { type: 'timeout' });
    const cpuAction = chooseCpuAction(cpuTurn, () => 0);

    expect(getLegalActions(cpuTurn, 'cpu')).toContainEqual(cpuAction);
  });

  it('returns a timeout CPU action when no normal action is available', () => {
    const move = makeDamageMove('unaffordable', 10, 'basic', 1);
    const state = startBattle(
      makeDeck('player', { creaturePower: 0, moves: [move] }),
      makeDeck('cpu', { creaturePower: 0, moves: [move] }),
    );

    expect(getLegalActions(state, 'player')).toHaveLength(2);
    const afterPlayerTimeout = action(state, 'player', { type: 'timeout' });
    const afterCpuPowerCard = action(afterPlayerTimeout, 'cpu', {
      type: 'use_power_card',
      powerCardId: 'cpu-power-1',
    });
    const afterSecondPlayerTimeout = action(afterCpuPowerCard, 'player', {
      type: 'timeout',
    });
    const afterSecondCpuPowerCard = action(afterSecondPlayerTimeout, 'cpu', {
      type: 'use_power_card',
      powerCardId: 'cpu-power-2',
    });
    const cpuTurnWithoutActions = action(afterSecondCpuPowerCard, 'player', {
      type: 'timeout',
    });

    expect(chooseCpuAction(cpuTurnWithoutActions, randomZero)).toEqual({
      type: 'timeout',
    });
  });

  it('rejects invalid decks and non-executable Buff/Debuff data', () => {
    const invalidDeck = makeDeck('invalid', {
      moves: [
        {
          ...makeDamageMove('invalid-move'),
          effects: [
            {
              id: 'invalid-buff',
              effectType: 'buff',
              effectValue: 10,
            },
          ],
        },
      ],
    });

    expect(() => createBattleState(invalidDeck, makeDeck('cpu'))).toThrow(
      InvalidBattleSetupError,
    );
    expect(() =>
      createBattleState(
        {
          ...makeDeck('invalid-count'),
          creatureCards: makeDeck('invalid-count').creatureCards.slice(0, 2),
        },
        makeDeck('cpu'),
      ),
    ).toThrow(InvalidBattleSetupError);
  });
});

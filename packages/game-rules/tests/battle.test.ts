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
  const battleReadyMoves = [
    ...moves,
    ...Array.from({ length: Math.max(0, 4 - moves.length) }, (_, index) =>
      makeDamageMove(
        `${id}-fixture-move-${index + 1}`,
        1,
        'basic',
        maxPower + 1,
      ),
    ),
  ];

  return {
    id,
    affinity,
    maxHp,
    maxPower,
    moves: battleReadyMoves,
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

  it('uses all approved directional matchups and leaves Basic neutral', () => {
    const affinities = ['wit', 'grit', 'spark', 'spirit', 'mystic'] as const;
    const expected = [
      [1, 1.5, 0.75, 1, 1],
      [0.75, 1, 1.5, 0.75, 1.5],
      [1.5, 0.75, 1, 1.5, 0.75],
      [1, 1.5, 0.75, 1, 1.5],
      [1, 0.75, 1.5, 1.5, 1],
    ];
    affinities.forEach((attacker, row) => {
      expect(getTypeMultiplier('basic', attacker)).toBe(1);
      affinities.forEach((defender, column) => {
        expect(getTypeMultiplier(attacker, defender)).toBe(
          expected[row]![column],
        );
      });
    });
  });

  it.each(['use_move', 'use_power_card'] as const)(
    'pins affinity rules across serialized states for %s',
    (type) => {
      const playerDeck = makeDeck('player', {
        moves: [makeDamageMove('spark-strike', 20, 'spark')],
        powerCards: [
          makePowerCard(
            'spark-power',
            [{ id: 'hit', effectType: 'damage', effectValue: 20 }],
            'spark',
          ),
          makePowerCard('spare-power', [
            { id: 'spare', effectType: 'damage', effectValue: 1 },
          ]),
        ],
      });
      const initial = startBattle(
        playerDeck,
        makeDeck('cpu', { creatureAffinity: 'wit' }),
      );
      expect(initial.affinityRulesVersion).toBe(2);
      const selected: BattleAction =
        type === 'use_move'
          ? { type, moveId: 'spark-strike' }
          : { type, powerCardId: 'spark-power' };
      const restored = JSON.parse(JSON.stringify(initial)) as BattleState;
      const current = action(restored, 'player', selected);
      expect(activeCreature(current, 'cpu').currentHp).toBe(70);
      expect(current.affinityRulesVersion).toBe(2);
      const legacy = JSON.parse(JSON.stringify(initial)) as {
        affinityRulesVersion?: 1 | 2;
      } & BattleState;
      delete legacy.affinityRulesVersion;
      const previous = action(legacy, 'player', selected);
      expect(activeCreature(previous, 'cpu').currentHp).toBe(80);
      expect(previous.affinityRulesVersion).toBeUndefined();
    },
  );

  it('retains the legacy directional cycle when requested', () => {
    expect(getTypeMultiplier('spark', 'wit', 1)).toBe(1);
    expect(getTypeMultiplier('mystic', 'spirit', 1)).toBe(0.75);
    expect(getTypeMultiplier('mystic', 'wit', 1)).toBe(1.5);
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
    expect(afterAttack.result.expiredEffects).toEqual([
      {
        damageMultiplier: 1.5,
        effectId: 'temporary-buff-effect',
        targetCreatureId: activeCreature(afterCpu, 'player').card.id,
        targetSide: 'player',
      },
    ]);
    expect(activeCreature(afterAttack.state, 'player').modifiers).toEqual([]);
  });

  it('decrements a finite modifier after the affected Creature subsequent turn', () => {
    const powerCard = makePowerCard('three-turn-buff', [
      {
        id: 'three-turn-buff-effect',
        effectType: 'buff',
        effectValue: 15,
        modifier: {
          stat: 'damage_multiplier',
          operation: 'multiply',
          durationTurns: 3,
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

    const applied = action(state, 'player', {
      type: 'use_power_card',
      powerCardId: powerCard.id,
    });
    expect(activeCreature(applied, 'player').modifiers[0]?.remainingTurns).toBe(
      3,
    );
    const afterCpu = action(applied, 'cpu', { type: 'timeout' });
    expect(
      activeCreature(afterCpu, 'player').modifiers[0]?.remainingTurns,
    ).toBe(3);
    const afterAffectedTurn = action(afterCpu, 'player', { type: 'timeout' });
    expect(
      activeCreature(afterAffectedTurn, 'player').modifiers[0]?.remainingTurns,
    ).toBe(2);
  });

  it('clamps a 150% damage debuff to zero through the affected Creature turn', () => {
    const powerCard = makePowerCard('overkill-debuff', [
      {
        id: 'overkill-debuff-effect',
        effectType: 'debuff',
        effectValue: 150,
        modifier: {
          stat: 'damage_multiplier',
          operation: 'multiply',
          durationTurns: 2,
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

    const applied = applyBattleAction(
      state,
      'player',
      { type: 'use_power_card', powerCardId: powerCard.id },
      randomZero,
    );

    expect(activeCreature(applied.state, 'cpu').modifiers[0]).toMatchObject({
      stat: 'damage_multiplier',
      operation: 'multiply',
      value: 0,
      remainingTurns: 2,
    });

    const attack = applyBattleAction(
      applied.state,
      'cpu',
      {
        type: 'use_move',
        moveId: activeCreature(applied.state, 'cpu').card.moves[0]!.id,
      },
      randomZero,
    );

    expect(attack.result.effects[0]).toMatchObject({
      effectType: 'damage',
      amount: 0,
    });
    expect(
      activeCreature(attack.state, 'cpu').modifiers[0]?.remainingTurns,
    ).toBe(1);

    const afterPlayerTurn = action(attack.state, 'player', { type: 'timeout' });
    const expired = applyBattleAction(
      afterPlayerTurn,
      'cpu',
      { type: 'timeout' },
      randomZero,
    );

    expect(applied.result.effects).toEqual([
      expect.objectContaining({
        damageMultiplier: 0,
        effectId: 'overkill-debuff-effect',
      }),
    ]);
    expect(expired.result.expiredEffects).toEqual([
      {
        damageMultiplier: 0,
        effectId: 'overkill-debuff-effect',
        targetCreatureId: activeCreature(afterPlayerTurn, 'cpu').card.id,
        targetSide: 'cpu',
      },
    ]);
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
    expect(transition.result.expiredEffects).toEqual([]);
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

  it('executes self-damage before restoring Power and enforces the HP threshold', () => {
    const overcharge: BattleMove = {
      id: 'overcharge',
      name: 'Overcharge',
      moveType: 'spark',
      powerCost: 0,
      effects: [
        {
          id: 'overcharge-cost',
          effectCode: 'self_damage',
          effectType: 'debuff',
          effectValue: 25,
          minimumHpExclusive: 25,
          target: 'self',
        },
        {
          id: 'overcharge-power',
          effectCode: 'restore_power_to_max',
          effectType: 'buff',
          effectValue: null,
          target: 'self',
        },
      ],
    };
    const setup = makeDamageMove('spend-power', 1, 'basic', 5);
    let state = startBattle(
      makeDeck('player', { moves: [setup, overcharge] }),
      makeDeck('cpu'),
    );
    state = action(state, 'player', { type: 'use_move', moveId: setup.id });
    state = action(state, 'cpu', { type: 'timeout' });

    const transition = applyBattleAction(
      state,
      'player',
      { type: 'use_move', moveId: overcharge.id },
      randomZero,
    );
    expect(activeCreature(transition.state, 'player')).toMatchObject({
      currentHp: 75,
      remainingPower: 10,
    });
    expect(
      transition.result.effects.map(({ effectCode, amount }) => ({
        effectCode,
        amount,
      })),
    ).toEqual([
      { effectCode: 'self_damage', amount: 25 },
      { effectCode: 'restore_power_to_max', amount: 5 },
    ]);

    const lowHpState: BattleState = {
      ...state,
      participants: {
        ...state.participants,
        player: {
          ...state.participants.player,
          creatures: state.participants.player.creatures.map((creature) =>
            creature.card.id === state.participants.player.activeCreatureId
              ? { ...creature, currentHp: 25 }
              : creature,
          ),
        },
      },
    };
    expect(getLegalActions(lowHpState, 'player')).not.toContainEqual({
      type: 'use_move',
      moveId: overcharge.id,
    });
  });

  it('ticks Poison only at the end of the affected Creature turns', () => {
    const poisonMove: BattleMove = {
      id: 'hexstep',
      name: 'Hexstep',
      moveType: 'basic',
      powerCost: 3,
      effects: [
        {
          id: 'hexstep-hit',
          effectCode: 'damage',
          effectType: 'damage',
          effectValue: 5,
          target: 'opponent',
        },
        {
          id: 'hexstep-poison',
          effectCode: 'poison',
          effectType: 'debuff',
          effectValue: 8,
          durationTurns: 3,
          target: 'opponent',
        },
      ],
    };
    let state = startBattle(
      makeDeck('player', { moves: [poisonMove] }),
      makeDeck('cpu'),
    );
    state = action(state, 'player', {
      type: 'use_move',
      moveId: poisonMove.id,
    });
    expect(activeCreature(state, 'cpu').currentHp).toBe(95);

    for (let tick = 0; tick < 3; tick += 1) {
      state = action(state, 'cpu', { type: 'timeout' });
      if (tick < 2) state = action(state, 'player', { type: 'timeout' });
    }

    expect(activeCreature(state, 'cpu').currentHp).toBe(71);
    expect(activeCreature(state, 'cpu').modifiers).toEqual([]);
  });

  it('lets a stunned player use a Power card and grants immunity after recovery', () => {
    const stunMove: BattleMove = {
      id: 'soul-chime',
      name: 'Soul Chime',
      moveType: 'spirit',
      powerCost: 4,
      effects: [
        {
          id: 'soul-chime-hit',
          effectCode: 'damage',
          effectType: 'damage',
          effectValue: 10,
        },
        {
          id: 'soul-chime-stun',
          effectCode: 'stun',
          effectType: 'debuff',
          effectValue: 1,
          durationTurns: 1,
          immunityAfterRecovery: true,
          target: 'opponent',
        },
      ],
    };
    let state = startBattle(
      makeDeck('player', { moves: [stunMove] }),
      makeDeck('cpu'),
    );
    state = action(state, 'player', {
      type: 'use_move',
      moveId: stunMove.id,
    });
    expect(
      getLegalActions(state, 'cpu').some(({ type }) => type === 'use_move'),
    ).toBe(false);
    expect(
      getLegalActions(state, 'cpu').some(
        ({ type }) => type === 'use_power_card',
      ),
    ).toBe(true);

    state = action(state, 'cpu', {
      type: 'use_power_card',
      powerCardId: 'cpu-power-1',
    });
    expect(activeCreature(state, 'cpu').stunImmune).toBe(true);
    state = action(state, 'player', {
      type: 'use_move',
      moveId: stunMove.id,
    });
    expect(activeCreature(state, 'cpu').modifiers).toEqual([]);
    expect(
      getLegalActions(state, 'cpu').some(({ type }) => type === 'use_move'),
    ).toBe(true);
  });

  it('uses injected server randomness and consumes a one-shot dodge', () => {
    const dodgeMove: BattleMove = {
      id: 'foresight-dodge',
      name: 'Foresight Dodge',
      moveType: 'wit',
      powerCost: 3,
      effects: [
        {
          id: 'foresight-hit',
          effectCode: 'damage',
          effectType: 'damage',
          effectValue: 25,
        },
        {
          id: 'foresight-status',
          effectCode: 'dodge',
          effectType: 'buff',
          effectValue: 50,
          charges: 1,
          target: 'self',
        },
      ],
    };
    let state = startBattle(
      makeDeck('player', { moves: [dodgeMove] }),
      makeDeck('cpu'),
    );
    state = action(state, 'player', {
      type: 'use_move',
      moveId: dodgeMove.id,
    });
    const transition = applyBattleAction(
      state,
      'cpu',
      {
        type: 'use_move',
        moveId: activeCreature(state, 'cpu').card.moves[0]!.id,
      },
      () => 49,
    );
    expect(activeCreature(transition.state, 'player').currentHp).toBe(100);
    expect(activeCreature(transition.state, 'player').modifiers).toEqual([]);
    expect(transition.result.effects[0]).toMatchObject({
      effectCode: 'dodge',
      amount: 1,
    });
  });

  it('applies reflection and lifesteal to actual damage with finite charges', () => {
    const lifestealSetup: BattleMove = {
      id: 'lifesteal-setup',
      name: 'Lifesteal setup',
      moveType: 'spirit',
      powerCost: 0,
      effects: [
        {
          id: 'setup-hit',
          effectCode: 'damage',
          effectType: 'damage',
          effectValue: 10,
        },
        {
          id: 'lifesteal-status',
          effectCode: 'lifesteal',
          effectType: 'buff',
          effectValue: 30,
          charges: 2,
          target: 'self',
        },
      ],
    };
    const reflectedAttack = makeDamageMove('follow-up', 20, 'basic', 0);
    const reflectSetup: BattleMove = {
      id: 'reflect-setup',
      name: 'Reflect setup',
      moveType: 'grit',
      powerCost: 0,
      effects: [
        {
          id: 'reflect-status',
          effectCode: 'reflect',
          effectType: 'buff',
          effectValue: 35,
          charges: 2,
          cannotDefeat: true,
          target: 'self',
        },
      ],
    };
    let state = startBattle(
      makeDeck('player', { moves: [lifestealSetup, reflectedAttack] }),
      makeDeck('cpu', {
        moves: [makeDamageMove('cpu-hit', 1, 'basic', 0), reflectSetup],
      }),
    );
    state = action(state, 'player', { type: 'timeout' });
    state = action(state, 'cpu', {
      type: 'use_move',
      moveId: activeCreature(state, 'cpu').card.moves[1]!.id,
    });
    state = action(state, 'player', {
      type: 'use_move',
      moveId: lifestealSetup.id,
    });
    expect(activeCreature(state, 'player').currentHp).toBe(97);
    state = action(state, 'cpu', { type: 'use_move', moveId: reflectSetup.id });

    const transition = applyBattleAction(
      state,
      'player',
      { type: 'use_move', moveId: reflectedAttack.id },
      randomZero,
    );
    expect(activeCreature(transition.state, 'player').currentHp).toBe(96);
    expect(transition.result.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ effectCode: 'reflect', amount: 7 }),
        expect.objectContaining({ effectCode: 'lifesteal', amount: 6 }),
      ]),
    );
    expect(
      activeCreature(transition.state, 'player').modifiers.find(
        ({ stat }) => stat === 'lifesteal',
      )?.remainingCharges,
    ).toBe(1);
  });

  it('swaps active HP percentages using each Creature maximum HP', () => {
    const fateReversal = makePowerCard(
      'fate-reversal',
      [
        {
          id: 'fate-reversal-effect',
          effectCode: 'swap_hp_percentages',
          effectType: 'buff',
          effectValue: null,
          target: 'both',
        },
      ],
      null,
    );
    const base = startBattle(
      makeDeck('player', {
        powerCards: [
          fateReversal,
          makePowerCard('spare', [
            { id: 'spare-heal', effectType: 'heal', effectValue: 1 },
          ]),
        ],
      }),
      makeDeck('cpu', { creatureHp: 200 }),
    );
    const state: BattleState = {
      ...base,
      participants: {
        player: {
          ...base.participants.player,
          creatures: base.participants.player.creatures.map(
            (creature, index) =>
              index === 0 ? { ...creature, currentHp: 25 } : creature,
          ),
        },
        cpu: {
          ...base.participants.cpu,
          creatures: base.participants.cpu.creatures.map((creature, index) =>
            index === 0 ? { ...creature, currentHp: 150 } : creature,
          ),
        },
      },
    };
    const next = action(state, 'player', {
      type: 'use_power_card',
      powerCardId: fateReversal.id,
    });
    expect(activeCreature(next, 'player').currentHp).toBe(75);
    expect(activeCreature(next, 'cpu').currentHp).toBe(50);
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
        makeDeck('null-effect', {
          moves: [makeDamageMove('missing-value', null as never)],
        }),
        makeDeck('cpu'),
      ),
    ).toThrow('must define an effect value before battle use');
    const completeDeck = makeDeck('incomplete-moves');
    const incompleteMoves = {
      ...completeDeck,
      creatureCards: completeDeck.creatureCards.map((creature, index) =>
        index === 0
          ? { ...creature, moves: creature.moves.slice(0, 3) }
          : creature,
      ),
    };
    expect(() => createBattleState(incompleteMoves, makeDeck('cpu'))).toThrow(
      'must define exactly four moves before battle use',
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

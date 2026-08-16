import type {
  CpuMatch,
  CpuMatchHistoryItem,
  CpuMatchIntent,
  CpuMatchState,
  MatchActionResult,
  MatchCreature,
} from '../../src/api/matches';

export const MATCH_ID = uuid(1000);
export const DECK_ID = uuid(1001);

export function buildCreature(
  index: number,
  overrides: Partial<MatchCreature> = {},
) {
  return {
    affinity: 'wit' as const,
    currentHp: 100,
    defeated: false,
    id: uuid(1100 + index),
    maxHp: 100,
    maxPower: 10,
    moves: [
      {
        id: uuid(1200 + index),
        moveType: 'wit' as const,
        name: `Knowledge Strike ${index}`,
        powerCost: 2,
      },
    ],
    remainingPower: 10,
    ...overrides,
  };
}

export function buildMatch(
  overrides: Partial<Omit<CpuMatch, 'state'>> & {
    state?: Partial<CpuMatchState>;
  } = {},
): CpuMatch {
  const creatures = [1, 2, 3].map((index) => buildCreature(index));
  const phase = overrides.state?.phase ?? 'initial_selection';
  const completed = overrides.status === 'completed' || phase === 'completed';
  const state: CpuMatchState = {
    cpu: {
      activeCreature: null,
      defeatedCreatures: [],
      remainingCreatureCount: 3,
      remainingPowerCardCount: 2,
      usedPowerCardIds: [],
    },
    currentSide: null,
    firstSide: null,
    legalActions: creatures.map((creature) => ({
      creatureId: creature.id,
      type: 'select_initial_creature' as const,
    })),
    phase,
    player: {
      activeCreatureId: null,
      creatures,
      powerCards: [1, 2].map((index) => ({
        affinity: 'wit' as const,
        available: true,
        id: uuid(1300 + index),
      })),
      usedPowerCardIds: [],
    },
    replacementSide: null,
    selections: { cpu: null, player: null },
    turnDeadline: null,
    turnNumber: 0,
    ...overrides.state,
  };

  return {
    completedAt: completed ? '2026-08-16T12:05:00.000Z' : null,
    lastAction: null,
    matchId: MATCH_ID,
    startedAt: '2026-08-16T12:00:00.000Z',
    status: completed ? 'completed' : 'active',
    version: 0,
    winner: completed ? 'player' : null,
    ...overrides,
    state,
  };
}

export function activeMatch(version = 1): CpuMatch {
  const base = buildMatch();
  const playerCreature = base.state.player.creatures[0]!;
  const cpuCreature = buildCreature(20, { affinity: 'grit' });
  const legalActions: CpuMatchIntent[] = [
    { moveId: playerCreature.moves[0]!.id, type: 'use_move' },
    {
      powerCardId: base.state.player.powerCards[0]!.id,
      type: 'use_power_card',
    },
  ];
  return buildMatch({
    state: {
      cpu: {
        activeCreature: cpuCreature,
        defeatedCreatures: [],
        remainingCreatureCount: 3,
        remainingPowerCardCount: 2,
        usedPowerCardIds: [],
      },
      currentSide: 'player',
      firstSide: 'player',
      legalActions,
      phase: 'active',
      player: {
        ...base.state.player,
        activeCreatureId: playerCreature.id,
      },
      selections: { cpu: cpuCreature.id, player: playerCreature.id },
      turnDeadline: '2026-08-16T12:01:30.000Z',
      turnNumber: 1,
    },
    version,
  });
}

export function actionResult(
  action: MatchActionResult['action'],
  overrides: Partial<MatchActionResult> = {},
): MatchActionResult {
  return {
    action,
    defeatedCreatureId: null,
    effects: [],
    side: 'player',
    turnEnded: true,
    winner: null,
    ...overrides,
  };
}

export function completedMatch(version = 6): CpuMatch {
  const active = activeMatch(version);
  return buildMatch({
    completedAt: '2026-08-16T12:05:00.000Z',
    lastAction: actionResult(
      {
        moveId: active.state.player.creatures[0]!.moves[0]!.id,
        type: 'use_move',
      },
      {
        defeatedCreatureId: active.state.cpu.activeCreature!.id,
        winner: 'player',
      },
    ),
    state: {
      ...active.state,
      cpu: {
        ...active.state.cpu,
        activeCreature: null,
        defeatedCreatures: [
          active.state.cpu.activeCreature!,
          buildCreature(21, { currentHp: 0, defeated: true }),
          buildCreature(22, { currentHp: 0, defeated: true }),
        ],
        remainingCreatureCount: 0,
      },
      currentSide: null,
      legalActions: [],
      phase: 'completed',
      replacementSide: null,
      turnNumber: 8,
    },
    status: 'completed',
    version,
    winner: 'player',
  });
}

export function matchResponse(match: CpuMatch, status = 200) {
  return new Response(
    JSON.stringify({ ...match, requestId: `match-request-${match.version}` }),
    { headers: { 'Content-Type': 'application/json' }, status },
  );
}

export function noActiveResponse() {
  return problemResponse('CPU_MATCH_NOT_FOUND', 404);
}

export function problemResponse(code: string, status: number) {
  return new Response(
    JSON.stringify({
      code,
      detail: 'Safe match problem detail.',
      requestId: `problem-${code}`,
      status,
      title: 'Match request failed',
      type: 'about:blank',
    }),
    { headers: { 'Content-Type': 'application/problem+json' }, status },
  );
}

export function historyItem(match = completedMatch()): CpuMatchHistoryItem {
  const lastAction = match.lastAction!;
  return {
    completedAt: match.completedAt!,
    matchId: match.matchId,
    rounds: [
      {
        actions: [
          {
            action: lastAction.action,
            createdAt: match.completedAt!,
            result: lastAction,
            sequence: 1,
            side: 'player',
            submissionId: uuid(1400),
          },
        ],
        createdAt: match.completedAt!,
        result: [lastAction],
        roundNumber: 1,
      },
    ],
    startedAt: match.startedAt,
    status: 'completed',
    winner: match.winner!,
  };
}

export function historyResponse(matches: CpuMatchHistoryItem[]) {
  return new Response(
    JSON.stringify({ matches, requestId: 'history-request' }),
    { headers: { 'Content-Type': 'application/json' }, status: 200 },
  );
}

export function uuid(value: number) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

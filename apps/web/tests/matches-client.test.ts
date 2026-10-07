import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createCpuMatch,
  forfeitCpuMatch,
  getActiveCpuMatch,
  getCpuMatch,
  listCpuMatchHistory,
  MatchApiError,
  recoverOrCreateCpuMatch,
  submitCpuMatchAction,
} from '../src/api/matches';
import {
  actionResult,
  activeMatch,
  completedMatch,
  DECK_ID,
  historyItem,
  historyResponse,
  MATCH_ID,
  matchResponse,
  noActiveResponse,
  problemResponse,
  uuid,
} from './fixtures/matches';

const apiBaseUrl = 'https://api.example.test/api/v1';
const getAccessToken = vi.fn().mockResolvedValue('access-token');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  getAccessToken.mockClear();
});

function options() {
  return {
    apiBaseUrl,
    getAccessToken,
    signal: new AbortController().signal,
  };
}

describe('CPU match API client', () => {
  it.each(['read', 'create'])(
    'does not send a %s after cancellation during token retrieval',
    async (operation) => {
      const controller = new AbortController();
      let resolveToken!: (value: string) => void;
      const token = new Promise<string>((resolve) => {
        resolveToken = resolve;
      });
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const request = {
        apiBaseUrl,
        getAccessToken: () => token,
        signal: controller.signal,
      };
      const pending =
        operation === 'read'
          ? getActiveCpuMatch(request)
          : createCpuMatch({ ...request, deckId: DECK_ID });
      const rejected = expect(pending).rejects.toMatchObject({
        name: 'AbortError',
      });
      controller.abort();
      resolveToken('late-token');
      await rejected;
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('recovers the active match with authentication and treats the owned 404 as no active match', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(activeMatch()))
      .mockResolvedValueOnce(noActiveResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(getActiveCpuMatch(options())).resolves.toMatchObject({
      matchId: MATCH_ID,
      status: 'active',
    });
    await expect(getActiveCpuMatch(options())).resolves.toBeNull();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${apiBaseUrl}/matches/cpu`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept:
            'application/vnd.wits-world.cpu.v2+json, application/json;q=0.9',
          Authorization: 'Bearer access-token',
        }),
        method: 'GET',
      }),
    );
  });

  it('preserves the authoritative battle-log order across detail refreshes', async () => {
    const match = activeMatch(3);
    match.battleLog = [
      {
        events: [
          {
            id: '1:0',
            kind: 'action',
            message: 'Player selected Grit Creature 3.',
            sequence: 1,
            side: 'player',
          },
          {
            id: '2:0',
            kind: 'action',
            message: 'CPU revealed Mystic Creature 1.',
            sequence: 2,
            side: 'cpu',
          },
        ],
        id: 'opening',
        label: 'Opening',
        turnNumber: 0,
      },
      {
        events: [
          {
            id: '3:0',
            kind: 'action',
            message: 'Player used Grit Power 2.',
            sequence: 3,
            side: 'player',
          },
          {
            id: '3:1',
            kind: 'effect',
            message: "CPU's Mystic Creature 1 took 14 damage.",
            sequence: 3,
            side: 'cpu',
          },
        ],
        id: 'turn-1',
        label: 'Turn 1',
        turnNumber: 1,
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(matchResponse(match))
        .mockResolvedValueOnce(matchResponse(match)),
    );

    const first = await getCpuMatch({ ...options(), matchId: MATCH_ID });
    const refreshed = await getCpuMatch({ ...options(), matchId: MATCH_ID });

    expect(first.battleLog.flatMap(({ events }) => events)).toEqual(
      refreshed.battleLog.flatMap(({ events }) => events),
    );
    expect(first.battleLog[1]?.events.map(({ sequence }) => sequence)).toEqual([
      3, 3,
    ]);
  });

  it('rejects duplicate or non-chronological battle-log events', async () => {
    const duplicate = activeMatch(3);
    duplicate.battleLog = [
      {
        events: [
          {
            id: '1:0',
            kind: 'action',
            message: 'Player acted.',
            sequence: 1,
            side: 'player',
          },
          {
            id: '1:0',
            kind: 'effect',
            message: 'An effect resolved.',
            sequence: 1,
            side: 'cpu',
          },
        ],
        id: 'turn-1',
        label: 'Turn 1',
        turnNumber: 1,
      },
    ];
    const reversed = structuredClone(duplicate);
    reversed.battleLog[0]!.events = [
      { ...duplicate.battleLog[0]!.events[0]!, id: '2:0', sequence: 2 },
      { ...duplicate.battleLog[0]!.events[1]!, id: '1:0', sequence: 1 },
    ];
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(matchResponse(duplicate))
        .mockResolvedValueOnce(matchResponse(reversed)),
    );

    await expect(
      getCpuMatch({ ...options(), matchId: MATCH_ID }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
    await expect(
      getCpuMatch({ ...options(), matchId: MATCH_ID }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it('creates only after active reconciliation and submits the exact versioned intent', async () => {
    const created = activeMatch(0);
    const transitioned = activeMatch(1);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(noActiveResponse())
      .mockResolvedValueOnce(matchResponse(created, 201))
      .mockResolvedValueOnce(matchResponse(transitioned));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      recoverOrCreateCpuMatch({ ...options(), deckId: DECK_ID }),
    ).resolves.toEqual(created);

    const action = transitioned.state.legalActions[0]!;
    await submitCpuMatchAction({
      ...options(),
      action,
      expectedVersion: 0,
      matchId: MATCH_ID,
      submissionId: uuid(1500),
    });

    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({
      deckId: DECK_ID,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1]!.body))).toEqual({
      action,
      expectedVersion: 0,
      submissionId: uuid(1500),
    });
  });

  it('forfeits a match with the latest server version', async () => {
    const forfeited = completedMatch(5);
    forfeited.winner = 'cpu';
    const fetchMock = vi.fn().mockResolvedValue(matchResponse(forfeited));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      forfeitCpuMatch({
        ...options(),
        expectedVersion: 4,
        matchId: MATCH_ID,
      }),
    ).resolves.toEqual(forfeited);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/matches/${MATCH_ID}/forfeit`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 4 }),
      }),
    );
  });

  it('accepts canonical PostgreSQL UUID text used by seeded match cards', async () => {
    const match = activeMatch(2);
    const seededMoveId = '00000000-0000-f000-0000-000000001600';
    match.state.player.creatures[0]!.moves[0]!.id = seededMoveId;
    match.state.legalActions = match.state.legalActions.map((action) =>
      action.type === 'use_move' ? { ...action, moveId: seededMoveId } : action,
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(matchResponse(match)));

    await expect(getActiveCpuMatch(options())).resolves.toMatchObject({
      state: {
        legalActions: expect.arrayContaining([
          { moveId: seededMoveId, type: 'use_move' },
        ]),
        player: {
          creatures: expect.arrayContaining([
            expect.objectContaining({
              moves: expect.arrayContaining([
                expect.objectContaining({ id: seededMoveId }),
              ]),
            }),
          ]),
        },
      },
    });
  });

  it('accepts the server-projected effectiveness label without deriving it locally', async () => {
    const match = activeMatch(2);
    match.state.player.creatures[0]!.moves[0]!.effectiveness = 'effective';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(matchResponse(match)));

    const projectedMatch = await getActiveCpuMatch(options());

    expect(projectedMatch).not.toBeNull();
    expect(
      projectedMatch!.state.player.creatures[0]!.moves[0]!.effectiveness,
    ).toBe('effective');
  });

  it('accepts legacy match views while rejecting malformed new effect data', async () => {
    const legacy = structuredClone(activeMatch(2)) as unknown as Record<
      string,
      unknown
    >;
    const legacyState = legacy.state as {
      cpu: { activeCreature: Record<string, unknown> };
      player: {
        creatures: Record<string, unknown>[];
        powerCards: Record<string, unknown>[];
      };
    };
    for (const creature of [
      ...legacyState.player.creatures,
      legacyState.cpu.activeCreature,
    ]) {
      delete creature.activeModifiers;
      delete creature.name;
      delete creature.rarity;
      for (const move of creature.moves as Record<string, unknown>[]) {
        delete move.effects;
      }
    }
    for (const card of legacyState.player.powerCards) {
      delete card.effects;
      delete card.name;
    }

    const malformed = activeMatch(3);
    malformed.state.player.creatures[0]!.moves[0]!.effects[0]!.effectValue = -1;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(matchResponse(legacy as never))
        .mockResolvedValueOnce(matchResponse(malformed)),
    );

    const parsedLegacyMatch = await getActiveCpuMatch(options());
    expect(parsedLegacyMatch).toMatchObject({
      state: {
        player: {
          creatures: expect.arrayContaining([
            expect.objectContaining({
              activeModifiers: [],
              name: 'Wit Creature',
            }),
          ]),
          powerCards: expect.arrayContaining([
            expect.objectContaining({ effects: [], name: 'Wit Power card' }),
          ]),
        },
      },
    });
    expect(parsedLegacyMatch!.state.player.creatures[0]).not.toHaveProperty(
      'rarity',
    );
    expect(parsedLegacyMatch!.state.cpu.activeCreature).not.toHaveProperty(
      'rarity',
    );
    await expect(getActiveCpuMatch(options())).rejects.toMatchObject({
      failure: 'unavailable',
    });
  });

  it('accepts the public projection of a rules-clamped 150% damage debuff through expiry', async () => {
    const match = activeMatch(3);
    match.state.player.creatures[0]!.moves[0]!.effects = [
      {
        damageMultiplier: 0,
        effectType: 'debuff',
        effectValue: 150,
        modifier: {
          durationTurns: 2,
          operation: 'multiply',
          stat: 'damage_multiplier',
        },
      },
    ];
    match.state.cpu.activeCreature!.activeModifiers = [
      {
        stat: 'damage_multiplier',
        operation: 'multiply',
        percentage: -100,
        remainingTurns: 2,
      },
    ];
    match.lastAction = actionResult(
      { type: 'timeout' },
      {
        expiredEffects: [
          {
            damageMultiplier: 0,
            effectId: uuid(1400),
            targetCreatureId: match.state.cpu.activeCreature!.id,
            targetSide: 'cpu',
          },
        ],
      },
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(matchResponse(match)));

    await expect(getActiveCpuMatch(options())).resolves.toMatchObject({
      lastAction: {
        expiredEffects: [
          expect.objectContaining({
            damageMultiplier: 0,
            targetSide: 'cpu',
          }),
        ],
      },
      state: {
        cpu: {
          activeCreature: {
            activeModifiers: [
              {
                stat: 'damage_multiplier',
                operation: 'multiply',
                percentage: -100,
                remainingTurns: 2,
              },
            ],
          },
        },
        player: {
          creatures: expect.arrayContaining([
            expect.objectContaining({
              moves: [
                expect.objectContaining({
                  effects: [
                    expect.objectContaining({
                      damageMultiplier: 0,
                      effectValue: 150,
                    }),
                  ],
                }),
              ],
            }),
          ]),
        },
      },
    });
  });

  it('rejects completed successes from active recovery and match creation', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(matchResponse(completedMatch()))
        .mockResolvedValueOnce(matchResponse(completedMatch(), 201)),
    );

    await expect(getActiveCpuMatch(options())).rejects.toMatchObject({
      failure: 'unavailable',
    });
    await expect(
      createCpuMatch({ ...options(), deckId: DECK_ID }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it('rejects detail and action successes for a different match ID', async () => {
    const requested = activeMatch(2);
    const different = { ...requested, matchId: uuid(1999) };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(matchResponse(different))
        .mockResolvedValueOnce(matchResponse(different)),
    );

    await expect(
      getCpuMatch({ ...options(), matchId: MATCH_ID }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
    await expect(
      submitCpuMatchAction({
        ...options(),
        action: requested.state.legalActions[0]!,
        expectedVersion: requested.version,
        matchId: MATCH_ID,
        submissionId: uuid(1502),
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it('uses bounded delayed lookups to recover an ambiguous create without replaying the POST', async () => {
    vi.useFakeTimers();
    const recovered = activeMatch(0);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(noActiveResponse())
      .mockRejectedValueOnce(new TypeError('connection lost'))
      .mockResolvedValueOnce(noActiveResponse())
      .mockResolvedValueOnce(noActiveResponse())
      .mockResolvedValueOnce(matchResponse(recovered));
    vi.stubGlobal('fetch', fetchMock);

    const request = recoverOrCreateCpuMatch({
      ...options(),
      deckId: DECK_ID,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(request).resolves.toEqual(recovered);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('reconciles CPU_MATCH_ALREADY_ACTIVE through the active lookup', async () => {
    const recovered = activeMatch(2);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(noActiveResponse())
      .mockResolvedValueOnce(problemResponse('CPU_MATCH_ALREADY_ACTIVE', 409))
      .mockResolvedValueOnce(matchResponse(recovered));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      recoverOrCreateCpuMatch({ ...options(), deckId: DECK_ID }),
    ).resolves.toEqual(recovered);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('validates direct detail and completed history without accepting malformed success data', async () => {
    const item = historyItem();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(activeMatch()))
      .mockResolvedValueOnce(historyResponse([item]))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ requestId: 'missing-match' }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getCpuMatch({ ...options(), matchId: MATCH_ID }),
    ).resolves.toMatchObject({
      matchId: MATCH_ID,
    });
    await expect(listCpuMatchHistory(options())).resolves.toEqual([item]);
    await expect(
      getCpuMatch({ ...options(), matchId: MATCH_ID }),
    ).rejects.toMatchObject({
      failure: 'unavailable',
    });
  });

  it('rejects active, identity-bearing, incomplete, and malformed nested history successes', async () => {
    const item = historyItem();
    const round = item.rounds[0]!;
    const action = round.actions[0]!;
    const missingCompletedAt: Record<string, unknown> = { ...item };
    delete missingCompletedAt.completedAt;
    const malformedItems: unknown[] = [
      { ...item, status: 'active' },
      { ...item, winner: null },
      { ...item, playerId: uuid(1600) },
      missingCompletedAt,
      { ...item, rounds: [{ ...round, roundNumber: 0 }] },
      {
        ...item,
        rounds: [
          {
            ...round,
            actions: [
              {
                ...action,
                result: { ...action.result, winner: 'browser' },
              },
            ],
          },
        ],
      },
    ];
    const fetchMock = vi.fn();

    for (const [index, malformed] of malformedItems.entries()) {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            matches: [malformed],
            requestId: `malformed-history-${index}`,
          }),
          { status: 200 },
        ),
      );
    }
    vi.stubGlobal('fetch', fetchMock);

    for (let index = 0; index < malformedItems.length; index += 1) {
      await expect(listCpuMatchHistory(options())).rejects.toMatchObject({
        failure: 'unavailable',
      });
    }
  });

  it('maps authorization and stale-action problems without exposing response internals', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(problemResponse('SESSION_EXPIRED', 401))
      .mockResolvedValueOnce(problemResponse('CPU_MATCH_STALE_ACTION', 409));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getCpuMatch({ ...options(), matchId: MATCH_ID }),
    ).rejects.toMatchObject({
      failure: 'authorization',
    });
    await expect(
      submitCpuMatchAction({
        ...options(),
        action: activeMatch().state.legalActions[0]!,
        expectedVersion: 0,
        matchId: MATCH_ID,
        submissionId: uuid(1501),
      }),
    ).rejects.toMatchObject({ failure: 'stale-action' });
  });

  it('maps token acquisition failure to reauthentication', async () => {
    await expect(
      getActiveCpuMatch({
        ...options(),
        getAccessToken: vi.fn().mockRejectedValue(new Error('token detail')),
      }),
    ).rejects.toBeInstanceOf(MatchApiError);
  });
});

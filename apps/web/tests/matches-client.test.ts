import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createCpuMatch,
  getActiveCpuMatch,
  getCpuMatch,
  listCpuMatchHistory,
  MatchApiError,
  recoverOrCreateCpuMatch,
  submitCpuMatchAction,
} from '../src/api/matches';
import {
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
          Authorization: 'Bearer access-token',
        }),
        method: 'GET',
      }),
    );
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

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  acceptPvpInvitation,
  createPvpInvitation,
  findPvpPlayer,
  getPvpMatch,
  listPvpInvitations,
  resignPvpMatch,
  submitPvpAction,
} from '../src/api/pvp';
import {
  invitationListResponse,
  invitationResponse,
  INVITATION_ID,
  playerLookupResponse,
  pvpInvitation,
  pvpMatch,
  PVP_MATCH_ID,
  pvpMatchResponse,
  pvpProblemResponse,
} from './fixtures/pvp';
import { uuid } from './fixtures/matches';

const apiBaseUrl = 'https://api.example.test/api/v1';
const getAccessToken = vi.fn().mockResolvedValue('access-token');

afterEach(() => {
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

describe('asynchronous PvP API client', () => {
  it('performs exact Player Name lookup and rejects private identity leakage', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(playerLookupResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            email: 'private@example.test',
            playerName: 'wits_wanderer',
            requestId: 'leaked',
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      findPvpPlayer({ ...options(), playerName: 'wits_wanderer' }),
    ).resolves.toBe('wits_wanderer');
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${apiBaseUrl}/matches/pvp/players?playerName=wits_wanderer`,
    );
    await expect(
      findPvpPlayer({ ...options(), playerName: 'wits_wanderer' }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it.each([
    'pending',
    'accepted',
    'declined',
    'expired',
    'invalidated',
  ] as const)(
    'parses viewer-relative %s invitations without deck or account data',
    async (status) => {
      const terminal = status !== 'pending';
      const invitation = pvpInvitation({
        matchId: status === 'accepted' ? PVP_MATCH_ID : null,
        respondedAt: terminal ? '2026-09-05T09:00:00.000Z' : null,
        status,
      });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(invitationListResponse([invitation])),
      );

      await expect(
        listPvpInvitations({ ...options(), direction: 'incoming', limit: 50 }),
      ).resolves.toEqual({ items: [invitation], nextCursor: null });
    },
  );

  it('submits invitation and acceptance intent with only identifiers and versions', async () => {
    const invitation = pvpInvitation({ direction: 'outgoing' });
    const accepted = pvpInvitation({
      matchId: PVP_MATCH_ID,
      respondedAt: '2026-09-05T09:00:00.000Z',
      status: 'accepted',
      version: 1,
    });
    const match = pvpMatch();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(invitationResponse(invitation, 201))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            invitation: accepted,
            match: { ...match, requestId: 'accepted-match' },
            requestId: 'accepted-envelope',
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const submissionId = uuid(2200);
    const deckId = uuid(2201);
    const initialCreatureId = uuid(2202);

    await createPvpInvitation({
      ...options(),
      deckId,
      initialCreatureId,
      opponentPlayerName: 'wits_wanderer',
      submissionId,
    });
    await acceptPvpInvitation({
      ...options(),
      deckId,
      expectedVersion: 0,
      initialCreatureId,
      invitationId: INVITATION_ID,
      submissionId,
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
      deckId,
      initialCreatureId,
      opponentPlayerName: 'wits_wanderer',
      submissionId,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({
      deckId,
      expectedVersion: 0,
      initialCreatureId,
      submissionId,
    });
  });

  it('accepts only viewer-safe match projection and exact API-returned legal actions', async () => {
    const match = pvpMatch();
    const leaked = structuredClone(match) as AsyncPvpMatchWithLeak;
    leaked.state.opponent.email = 'private@example.test';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pvpMatchResponse(match))
      .mockResolvedValueOnce(pvpMatchResponse(leaked as never))
      .mockResolvedValueOnce(
        pvpMatchResponse({
          ...match,
          state: {
            ...match.state,
            opponent: {
              ...match.state.opponent,
              playerName: 'different_player',
            },
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const parsed = await getPvpMatch({ ...options(), matchId: PVP_MATCH_ID });
    expect(parsed.legalActions).toEqual(match.legalActions);
    expect(parsed.state.opponent).not.toHaveProperty('email');
    await expect(
      getPvpMatch({ ...options(), matchId: PVP_MATCH_ID }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
    await expect(
      getPvpMatch({ ...options(), matchId: PVP_MATCH_ID }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it('submits one versioned legal action and maps stale/completed errors', async () => {
    const match = pvpMatch();
    const action = match.legalActions[0]!;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        pvpMatchResponse({
          ...match,
          currentActor: 'opponent',
          legalActions: [],
          version: 4,
        }),
      )
      .mockResolvedValueOnce(
        pvpProblemResponse('PVP_MATCH_VERSION_CONFLICT', 409),
      )
      .mockResolvedValueOnce(pvpProblemResponse('PVP_MATCH_COMPLETED', 409));
    vi.stubGlobal('fetch', fetchMock);

    await submitPvpAction({
      ...options(),
      action,
      expectedVersion: 3,
      matchId: PVP_MATCH_ID,
      submissionId: uuid(2300),
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
      action,
      expectedVersion: 3,
      submissionId: uuid(2300),
    });
    await expect(
      submitPvpAction({
        ...options(),
        action,
        expectedVersion: 3,
        matchId: PVP_MATCH_ID,
        submissionId: uuid(2301),
      }),
    ).rejects.toMatchObject({ failure: 'stale' });
    await expect(
      submitPvpAction({
        ...options(),
        action,
        expectedVersion: 3,
        matchId: PVP_MATCH_ID,
        submissionId: uuid(2302),
      }),
    ).rejects.toMatchObject({ failure: 'completed' });
  });

  it('submits only versioned resignation intent and parses its terminal result', async () => {
    const resigned = pvpMatch({
      canResign: false,
      completedAt: '2026-09-05T10:00:00.000Z',
      completionReason: 'voluntary_resignation',
      currentActor: null,
      legalActions: [],
      outcome: 'loss',
      status: 'completed',
      turnDeadline: null,
      version: 4,
    });
    const fetchMock = vi.fn().mockResolvedValue(pvpMatchResponse(resigned));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      resignPvpMatch({
        ...options(),
        expectedVersion: 3,
        matchId: PVP_MATCH_ID,
        submissionId: uuid(2350),
      }),
    ).resolves.toMatchObject({
      canResign: false,
      completionReason: 'voluntary_resignation',
      outcome: 'loss',
    });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${apiBaseUrl}/matches/pvp/${PVP_MATCH_ID}/resign`,
    );
    expect(fetchMock.mock.calls[0]![1]!.headers).toMatchObject({
      Accept: 'application/vnd.wits-world.pvp.v2+json, application/json;q=0.9',
    });
    expect(fetchMock.mock.calls[0]![1]!.headers).not.toHaveProperty(
      'X-Wits-PvP-Contract-Version',
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
      expectedVersion: 3,
      submissionId: uuid(2350),
    });
  });

  it('treats an absent resignation capability as unavailable during rollout', async () => {
    const legacy = { ...pvpMatch(), requestId: 'legacy-match' } as Record<
      string,
      unknown
    >;
    delete legacy.canResign;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(legacy))),
    );

    await expect(
      getPvpMatch({ ...options(), matchId: PVP_MATCH_ID }),
    ).resolves.toMatchObject({ canResign: false });
  });

  it('marks interrupted mutation responses ambiguous for same-submission recovery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    await expect(
      createPvpInvitation({
        ...options(),
        deckId: uuid(2400),
        initialCreatureId: uuid(2401),
        opponentPlayerName: 'wits_wanderer',
        submissionId: uuid(2402),
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        failure: 'unavailable',
        options: { ambiguous: true },
      }),
    );
  });
});

type AsyncPvpMatchWithLeak = ReturnType<typeof pvpMatch> & {
  state: ReturnType<typeof pvpMatch>['state'] & {
    opponent: ReturnType<typeof pvpMatch>['state']['opponent'] & {
      email?: string;
    };
  };
};

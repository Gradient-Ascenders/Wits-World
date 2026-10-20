import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildLiveWebSocketUrl,
  createLiveConnectionTicket,
  getCurrentRankedSeason,
  getLiveProjection,
  getRankedProfile,
  getRankedSettlement,
  joinRankedQueue,
  listRankedStandings,
  LiveApiError,
  parseLiveServerMessage,
} from '../src/api/live';
import {
  LIVE_MATCH_ID,
  participantProjection,
  projectionResponse,
  queueState,
  rankedProfile,
  rankedSettlement,
  rankedSeason,
  rankedStandings,
  TERRITORY_ZONE_ID,
  readyMessage,
  spectatorProjection,
  ticketResponse,
} from './fixtures/live';

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

describe('live battle API client', () => {
  it('accepts catalogue move UUIDs in HTTP and socket actions and history', async () => {
    // Obsidian Horn's deterministic PostgreSQL UUID from migration 0041.
    const moveId = 'ae6526b9-b164-210b-c746-c4af1b45747a';
    const action = { type: 'use_move', moveId };
    const match = participantProjection({ legalActions: [action] });
    match.self.creatures[0]!.moves[0]!.id = moveId;
    match.history[0]!.action = action;
    match.lastAction.action = action;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(projectionResponse(match)),
    );

    const response = await getLiveProjection({
      ...options(),
      matchId: LIVE_MATCH_ID,
    });
    expect(response.match).toMatchObject({
      legalActions: [action],
      history: [expect.objectContaining({ action })],
      lastAction: expect.objectContaining({ action }),
    });
    expect(
      parseLiveServerMessage(JSON.stringify(readyMessage(match))),
    ).toMatchObject({ match: response.match });
  });

  it('preserves real card presentation and committed effects while discarding extra effect fields', async () => {
    const match = participantProjection();
    match.self.creatures[0]!.name = 'Quillip';
    match.self.creatures[0]!.rarity = 'rare';
    const effect = {
      effectType: 'damage',
      targetSide: 'playerOne',
      targetCreatureId: match.self.creatures[0]!.id,
      amount: 12,
    };
    const projection = participantProjection({
      ...match,
      history: [
        {
          ...match.history[0],
          effects: [{ ...effect, privateDetail: 'must not be retained' }],
        },
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(projectionResponse(projection)),
    );
    const response = await getLiveProjection({
      ...options(),
      matchId: LIVE_MATCH_ID,
    });
    expect(response.match).toMatchObject({
      self: {
        creatures: [
          expect.objectContaining({ name: 'Quillip', rarity: 'rare' }),
          expect.anything(),
          expect.anything(),
        ],
      },
      history: [expect.objectContaining({ effects: [effect] })],
    });
    expect(JSON.stringify(response.match)).not.toContain('privateDetail');
  });

  it('parses the participant projection and authenticates snapshot and ticket requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(projectionResponse(participantProjection()))
      .mockResolvedValueOnce(ticketResponse('participant'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await getLiveProjection({
      ...options(),
      matchId: LIVE_MATCH_ID,
    });
    expect(response.match).toMatchObject({
      role: 'participant',
      selfSide: 'playerOne',
      version: 4,
      history: [
        expect.objectContaining({
          actionType: 'use_move',
          side: 'playerTwo',
        }),
      ],
    });

    await expect(
      createLiveConnectionTicket({
        ...options(),
        matchId: LIVE_MATCH_ID,
        role: 'participant',
      }),
    ).resolves.toMatchObject({ role: 'participant', protocolVersion: 1 });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${apiBaseUrl}/matches/live/${LIVE_MATCH_ID}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept:
            'application/vnd.wits-world.live.v2+json, application/json;q=0.9',
          Authorization: 'Bearer access-token',
        }),
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({
      role: 'participant',
    });
    const socketUrl = new URL(
      buildLiveWebSocketUrl(
        'wss://api.example.test/api/v1/realtime/live',
        'one-use-ticket',
      ),
    );
    expect(socketUrl.searchParams.get('ticket')).toBe('one-use-ticket');
    expect(socketUrl.searchParams.get('battleSwaps')).toBe('1');
  });

  it('keeps spectator parsing on a closed public shape and rejects leaked private fields', async () => {
    const safe = spectatorProjection();
    const leaked = {
      ...safe,
      playerOne: {
        ...(safe.playerOne as Record<string, unknown>),
        powerCards: [{ id: 'private-card' }],
      },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(projectionResponse(safe))
        .mockResolvedValueOnce(projectionResponse(leaked)),
    );

    await expect(
      getLiveProjection({ ...options(), matchId: LIVE_MATCH_ID }),
    ).resolves.toMatchObject({
      match: {
        role: 'spectator',
        presence: { spectatorCount: 2 },
      },
    });
    await expect(
      getLiveProjection({ ...options(), matchId: LIVE_MATCH_ID }),
    ).rejects.toBeInstanceOf(LiveApiError);
  });

  it('parses role-matched ready messages and rejects a role mismatch', () => {
    const participant = participantProjection();
    expect(
      parseLiveServerMessage(JSON.stringify(readyMessage(participant))),
    ).toMatchObject({ type: 'connection.ready', role: 'participant' });
    expect(() =>
      parseLiveServerMessage(
        JSON.stringify({
          ...readyMessage(participant),
          role: 'spectator',
        }),
      ),
    ).toThrow(LiveApiError);
  });

  it('rejects malformed, unsupported, and open-shape websocket messages', () => {
    const participant = participantProjection();
    const ready = readyMessage(participant);
    expect(() => parseLiveServerMessage('{not json')).toThrow(LiveApiError);
    expect(() =>
      parseLiveServerMessage(JSON.stringify({ ...ready, protocolVersion: 2 })),
    ).toThrow(LiveApiError);
    expect(() =>
      parseLiveServerMessage(
        JSON.stringify({ ...ready, unrecognized: 'must not be ignored' }),
      ),
    ).toThrow(LiveApiError);
  });

  it('rejects a ticket that is validly shaped but bound to another role', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ticket: 'opaque-ticket-value-with-enough-random-characters',
            role: 'spectator',
            protocolVersion: 1,
            expiresAt: '2026-09-25T12:01:00.000Z',
            webSocketUrl: 'wss://api.example.test/api/v1/realtime/live',
            requestId: 'request-ticket-1',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      createLiveConnectionTicket({
        ...options(),
        matchId: LIVE_MATCH_ID,
        role: 'participant',
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it('rejects invalid standings page sizes locally and preserves aborts from fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      listRankedStandings({ ...options(), limit: 0 }),
    ).rejects.toMatchObject({ failure: 'validation' });
    await expect(
      listRankedStandings({ ...options(), limit: 101 }),
    ).rejects.toMatchObject({ failure: 'validation' });
    expect(fetchMock).not.toHaveBeenCalled();

    const controller = new AbortController();
    controller.abort();
    const abort = new DOMException('The request was aborted.', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
    await expect(
      getLiveProjection({
        ...options(),
        signal: controller.signal,
        matchId: LIVE_MATCH_ID,
      }),
    ).rejects.toBe(abort);
  });

  it('submits only the selected deck identifier to the ranked queue', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          queueState({
            status: 'searching',
            queueEntryId: '61000000-0000-4000-8000-000000000001',
            joinedAt: '2026-09-25T12:00:00.000Z',
            leaseExpiresAt: '2026-09-25T12:00:30.000Z',
            searchRange: 100,
          }),
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await joinRankedQueue({
      ...options(),
      deckId: '61000000-0000-4000-8000-000000000002',
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
      deckId: '61000000-0000-4000-8000-000000000002',
    });
  });

  it('adds a territory claim only when the player explicitly provides one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(queueState({ status: 'searching' })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const territoryClaim = {
      accuracyMetres: 18,
      acquiredAt: '2026-09-25T12:00:00.000Z',
      latitude: -26.1919,
      longitude: 28.0301,
      zoneId: TERRITORY_ZONE_ID,
    };

    await joinRankedQueue({
      ...options(),
      deckId: '61000000-0000-4000-8000-000000000002',
      territoryClaim,
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
      deckId: '61000000-0000-4000-8000-000000000002',
      territoryClaim,
    });
  });

  it('preserves the server restriction reason for ranked queue guidance', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'RANKED_RESTRICTED',
            detail: 'Ranked matchmaking is temporarily unavailable.',
          }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    );

    await expect(
      joinRankedQueue({
        ...options(),
        deckId: '61000000-0000-4000-8000-000000000002',
      }),
    ).rejects.toMatchObject({ failure: 'restricted' });
  });

  it('uses the authenticated current-season projection to gate ranked entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ season: rankedSeason() }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ season: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
    );

    await expect(getCurrentRankedSeason(options())).resolves.toMatchObject({
      name: 'Braamfontein Test Season',
      status: 'active',
    });
    await expect(getCurrentRankedSeason(options())).resolves.toBeNull();
  });

  it('parses authoritative profile, standings, and participant settlement projections', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(rankedProfile()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(rankedStandings()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(rankedSettlement()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
    );

    await expect(getRankedProfile(options())).resolves.toMatchObject({
      rating: 1_248,
      provisional: false,
    });
    const standings = await listRankedStandings(options());
    expect(standings.entries[0]).toMatchObject({
      playerName: 'CampusFox',
      rank: 1,
    });
    expect(standings.nextCursor).toBeNull();
    await expect(
      getRankedSettlement({ ...options(), matchId: LIVE_MATCH_ID }),
    ).resolves.toMatchObject({
      appliedDelta: 24,
      status: 'settled',
      territory: { influencePoints: 30, outcome: 'accepted' },
    });
  });
});

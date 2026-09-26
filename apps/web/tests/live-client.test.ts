import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createLiveConnectionTicket,
  getCurrentRankedSeason,
  getLiveProjection,
  joinRankedQueue,
  LiveApiError,
  parseLiveServerMessage,
} from '../src/api/live';
import {
  LIVE_MATCH_ID,
  participantProjection,
  projectionResponse,
  queueState,
  rankedSeason,
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
          Authorization: 'Bearer access-token',
        }),
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({
      role: 'participant',
    });
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
});

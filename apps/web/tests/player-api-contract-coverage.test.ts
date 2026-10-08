import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getCpuMatch,
  getActiveCpuMatch,
  MatchApiError,
} from '../src/api/matches';
import {
  createLiveConnectionTicket,
  getLiveProjection,
  listRankedStandings,
  LiveApiError,
} from '../src/api/live';
import { getPvpMatch, listPvpInvitations, PvpApiError } from '../src/api/pvp';
import { getTrade, TradeApiError } from '../src/api/trades';
import {
  PlayerProfileError,
  requestPlayerProfile,
} from '../src/api/player-profile';
import { listOwnedCards, listStarterOptions } from '../src/api/cards';
import { listSavedDecks, DeckApiError } from '../src/api/decks';
import {
  activeMatch,
  MATCH_ID,
  matchResponse,
  noActiveResponse,
} from './fixtures/matches';
import {
  LIVE_MATCH_ID,
  participantProjection,
  projectionResponse,
  ticketResponse,
} from './fixtures/live';
import {
  invitationListResponse,
  pvpInvitation,
  pvpMatch,
  PVP_MATCH_ID,
  pvpMatchResponse,
} from './fixtures/pvp';
import {
  buildCard,
  buildStarterOptions,
  buildUuid,
  jsonResponse,
} from './fixtures/cards';
import { buildSavedDeck, deckListResponse } from './fixtures/decks';
import { buildPlayerProfile } from './fixtures/player-profile';

const apiBaseUrl = 'https://api.example.test/api/v1';
const getAccessToken = vi.fn().mockResolvedValue('access-token');
const request = (signal = new AbortController().signal) => ({
  apiBaseUrl,
  getAccessToken,
  signal,
});

afterEach(() => {
  vi.unstubAllGlobals();
  getAccessToken.mockReset().mockResolvedValue('access-token');
});

describe('player API public contract boundaries', () => {
  it('binds CPU match responses to the requested URL id and only treats a typed 404 as no active match', async () => {
    const otherId = '00000000-0000-4000-8000-000000009999';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        matchResponse({ ...activeMatch(), matchId: otherId }),
      )
      .mockResolvedValueOnce(noActiveResponse())
      .mockResolvedValueOnce(
        jsonResponse({ code: 'UNEXPECTED', requestId: 'r' }, 404),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getCpuMatch({ ...request(), matchId: MATCH_ID }),
    ).rejects.toMatchObject({
      failure: 'unavailable',
    });
    await expect(getActiveCpuMatch(request())).resolves.toBeNull();
    await expect(getActiveCpuMatch(request())).rejects.toMatchObject({
      failure: 'unavailable',
      options: { code: 'UNEXPECTED', requestId: 'r' },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${apiBaseUrl}/matches/${MATCH_ID}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('classifies match transport and problem responses without disguising aborts', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(
        jsonResponse(
          { code: 'CPU_MATCH_STALE_ACTION', requestId: 'stale' },
          409,
        ),
      )
      .mockResolvedValueOnce(new Response('{bad', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getActiveCpuMatch(request())).rejects.toMatchObject({
      failure: 'unavailable',
    });
    await expect(getActiveCpuMatch(request())).rejects.toMatchObject({
      failure: 'stale-action',
      options: { requestId: 'stale' },
    });
    await expect(getActiveCpuMatch(request())).rejects.toBeInstanceOf(
      MatchApiError,
    );

    const controller = new AbortController();
    controller.abort();
    const noFetch = vi.fn();
    vi.stubGlobal('fetch', noFetch);
    await expect(
      getActiveCpuMatch(request(controller.signal)),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(noFetch).not.toHaveBeenCalled();
  });

  it('rejects inconsistent live projections and tickets while retaining URL identity', async () => {
    const projection = participantProjection();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        projectionResponse({ ...projection, phase: 'unknown' as never }),
      )
      .mockResolvedValueOnce(ticketResponse('spectator'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      getLiveProjection({ ...request(), matchId: LIVE_MATCH_ID }),
    ).rejects.toBeInstanceOf(LiveApiError);
    await expect(
      createLiveConnectionTicket({
        ...request(),
        matchId: LIVE_MATCH_ID,
        role: 'participant',
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${apiBaseUrl}/matches/live/${LIVE_MATCH_ID}`,
      expect.any(Object),
    );
  });

  it('validates ranked client input before fetching and rejects malformed server pages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ entries: [], nextCursor: null, season: null }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      listRankedStandings({ ...request(), limit: 0 }),
    ).rejects.toMatchObject({ failure: 'validation' });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(listRankedStandings(request())).rejects.toBeInstanceOf(
      LiveApiError,
    );
  });

  it('rejects PvP URL-id mismatches, malformed invitation relations, and maps known failures', async () => {
    const invitation = pvpInvitation({
      status: 'accepted',
      matchId: PVP_MATCH_ID,
      respondedAt: '2026-09-05T08:30:00.000Z',
    });
    const broken = { ...invitation, matchId: null };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        pvpMatchResponse({
          ...pvpMatch(),
          matchId: '00000000-0000-4000-8000-000000009999',
        }),
      )
      .mockResolvedValueOnce(invitationListResponse([broken]))
      .mockResolvedValueOnce(
        jsonResponse({ code: 'PVP_ACTION_ILLEGAL', requestId: 'illegal' }, 409),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      getPvpMatch({ ...request(), matchId: PVP_MATCH_ID }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
    await expect(listPvpInvitations(request())).rejects.toBeInstanceOf(
      PvpApiError,
    );
    await expect(
      getPvpMatch({ ...request(), matchId: PVP_MATCH_ID }),
    ).rejects.toMatchObject({
      failure: 'illegal-action',
      options: { requestId: 'illegal' },
    });
  });

  it('rejects malformed trade details and distinguishes server-classified and transport failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ trade: { tradeId: buildUuid(1) }, requestId: 'bad' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ code: 'TRADE_COPY_CONFLICT', requestId: 'copy' }, 409),
      )
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      getTrade({ ...request(), tradeId: buildUuid(1) }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
    await expect(
      getTrade({ ...request(), tradeId: buildUuid(1) }),
    ).rejects.toMatchObject({
      failure: 'copy-conflict',
      options: { requestId: 'copy' },
    });
    await expect(
      getTrade({ ...request(), tradeId: buildUuid(1) }),
    ).rejects.toBeInstanceOf(TradeApiError);
  });

  it('classifies profile authorization, missing profiles, and malformed successful projections', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        jsonResponse({
          ...buildPlayerProfile(),
          featuredOwnedCardIds: ['not-a-uuid'],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestPlayerProfile(request())).rejects.toMatchObject({
      failure: 'account_unavailable',
    });
    await expect(
      requestPlayerProfile({ ...request(), playerName: 'Some_Player' }),
    ).rejects.toMatchObject({ failure: 'not_found' });
    await expect(requestPlayerProfile(request())).rejects.toBeInstanceOf(
      PlayerProfileError,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${apiBaseUrl}/profiles/players/Some_Player`,
      expect.any(Object),
    );
  });

  it('rejects malformed card and deck projections at the authenticated client boundary', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          cards: [{ ...buildCard(1), extraPrivateField: 'leak' }],
          requestId: 'cards',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          options: [
            buildStarterOptions()[0],
            buildStarterOptions()[0],
            buildStarterOptions()[0],
          ],
          requestId: 'starters',
        }),
      )
      .mockResolvedValueOnce(
        deckListResponse([
          buildSavedDeck({ isSelected: true }),
          buildSavedDeck({ deckId: buildUuid(999), isSelected: true }),
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(listOwnedCards(request())).rejects.toMatchObject({
      failure: 'unavailable',
    });
    await expect(listStarterOptions(request())).rejects.toMatchObject({
      failure: 'unavailable',
    });
    await expect(listSavedDecks(request())).rejects.toBeInstanceOf(
      DeckApiError,
    );
  });

  it('does not fetch for already-expired requests on clients with a preflight abort boundary', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      getCpuMatch({ ...request(controller.signal), matchId: MATCH_ID }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await expect(
      listSavedDecks(request(controller.signal)),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

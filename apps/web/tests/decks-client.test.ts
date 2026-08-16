import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSavedDeck,
  DeckApiError,
  deleteSavedDeck,
  listSavedDecks,
  selectSavedDeck,
  updateSavedDeck,
} from '../src/api/decks';
import {
  buildSavedDeck,
  deckErrorResponse,
  deckListResponse,
  deckResponse,
} from './fixtures/decks';

const apiBaseUrl = 'https://api.example.test/api/v1';
const getAccessToken = vi.fn().mockResolvedValue('access-token');

afterEach(() => {
  vi.unstubAllGlobals();
  getAccessToken.mockClear();
});

function requestOptions() {
  return {
    apiBaseUrl,
    getAccessToken,
    signal: new AbortController().signal,
  };
}

describe('saved deck API client', () => {
  it('validates and returns the one active saved deck', async () => {
    const active = buildSavedDeck({ isSelected: true });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(deckListResponse([active])),
    );

    await expect(listSavedDecks(requestOptions())).resolves.toEqual([active]);
    expect(fetch).toHaveBeenCalledWith(
      `${apiBaseUrl}/decks`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        method: 'GET',
      }),
    );
  });

  it('rejects malformed decks and multiple active selections', async () => {
    const duplicateActive = [
      buildSavedDeck({ isSelected: true }),
      buildSavedDeck({
        deckId: '00000000-0000-4000-8000-000000000901',
        isSelected: true,
      }),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(deckListResponse(duplicateActive)),
    );

    await expect(listSavedDecks(requestOptions())).rejects.toMatchObject({
      failure: 'unavailable',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            decks: [{ ...buildSavedDeck(), privatePlayerId: 'secret' }],
            requestId: 'request',
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(listSavedDecks(requestOptions())).rejects.toBeInstanceOf(
      DeckApiError,
    );
  });

  it('creates and updates with only the deck name and exact owned-copy IDs', async () => {
    const deck = buildSavedDeck();
    const input = {
      name: deck.name,
      ownedCardIds: deck.cards.map((card) => card.ownedCardId),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(deckResponse(deck, 201))
      .mockResolvedValueOnce(deckResponse({ ...deck, name: 'Renamed' }));
    vi.stubGlobal('fetch', fetchMock);

    await createSavedDeck({ ...requestOptions(), deck: input });
    await updateSavedDeck({
      ...requestOptions(),
      deck: { ...input, name: 'Renamed' },
      deckId: deck.deckId,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${apiBaseUrl}/decks`,
      expect.objectContaining({ body: JSON.stringify(input), method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${apiBaseUrl}/decks/${deck.deckId}`,
      expect.objectContaining({
        body: JSON.stringify({ ...input, name: 'Renamed' }),
        method: 'PUT',
      }),
    );
  });

  it('selects and deletes through the authoritative deck operations', async () => {
    const deck = buildSavedDeck({ isSelected: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(deckResponse(deck))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await selectSavedDeck({ ...requestOptions(), deckId: deck.deckId });
    await deleteSavedDeck({ ...requestOptions(), deckId: deck.deckId });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${apiBaseUrl}/decks/${deck.deckId}/selection`,
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${apiBaseUrl}/decks/${deck.deckId}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it.each([
    buildSavedDeck({ isSelected: false }),
    buildSavedDeck({
      deckId: '00000000-0000-4000-8000-000000000901',
      isSelected: true,
    }),
  ])(
    'rejects a selection response that does not select the requested deck',
    async (responseDeck) => {
      const requested = buildSavedDeck();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(deckResponse(responseDeck)),
      );

      await expect(
        selectSavedDeck({ ...requestOptions(), deckId: requested.deckId }),
      ).rejects.toMatchObject({ failure: 'unavailable' });
    },
  );

  it('rejects a delete response that does not match the empty 204 contract', async () => {
    const deck = buildSavedDeck();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    );

    await expect(
      deleteSavedDeck({ ...requestOptions(), deckId: deck.deckId }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it.each([
    [401, 'SESSION_EXPIRED', 'authorization'],
    [400, 'INVALID_DECK_NAME', 'name'],
    [400, 'INVALID_DECK_CARDS', 'cards-unavailable'],
    [400, 'DECK_SIZE_INVALID', 'size'],
    [400, 'DECK_COPY_DUPLICATED', 'copy-duplicated'],
    [400, 'DECK_COMPOSITION_INVALID', 'composition'],
    [400, 'DECK_POINT_CAP_EXCEEDED', 'point-cap'],
    [404, 'DECK_NOT_FOUND', 'not-found'],
    [409, 'UNSUPPORTED_CONFLICT', 'unavailable'],
  ] as const)('maps %s %s to %s', async (status, code, failure) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(deckErrorResponse(status, code)),
    );

    await expect(listSavedDecks(requestOptions())).rejects.toMatchObject({
      failure,
      options: { requestId: 'deck-error-request' },
    });
  });
});

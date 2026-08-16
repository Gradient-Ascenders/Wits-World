import type { SavedDeck } from '../../src/api/decks';
import { buildStarterCards, buildUuid } from './cards';

export function buildSavedDeck(overrides: Partial<SavedDeck> = {}): SavedDeck {
  const cards = buildStarterCards('wit');

  return {
    cards: cards.map((card, index) => ({
      affinity: 'wit',
      cardDefinitionId: card.cardDefinitionId,
      category: index < 3 ? 'creature' : 'power',
      name: card.name,
      ownedCardId: card.ownedCardId,
      position: index + 1,
      rarity: 'common',
    })),
    createdAt: '2026-08-16T08:00:00.000Z',
    deckId: buildUuid(900),
    isSelected: false,
    name: 'Campus Five',
    totalPoints: 5,
    updatedAt: '2026-08-16T08:00:00.000Z',
    ...overrides,
  };
}

export function deckResponse(deck: SavedDeck, status = 200) {
  return new Response(JSON.stringify({ ...deck, requestId: 'deck-request' }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

export function deckListResponse(decks: SavedDeck[]) {
  return new Response(
    JSON.stringify({ decks, requestId: 'deck-list-request' }),
    { headers: { 'Content-Type': 'application/json' }, status: 200 },
  );
}

export function deckErrorResponse(status: number, code: string) {
  return new Response(
    JSON.stringify({
      code,
      detail: 'Safe deck error detail.',
      requestId: 'deck-error-request',
      status,
      title: 'Deck request failed',
      type: 'about:blank',
    }),
    { headers: { 'Content-Type': 'application/json' }, status },
  );
}

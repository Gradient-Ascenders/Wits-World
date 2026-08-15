import type pg from 'pg';

import {
  BASIC_DECK_SIZE,
  DeckRuleViolationError,
  validateBasicDeck,
} from './deck-rules.js';
import type { CardAffinity, CardCategory, CardRarity } from './card-types.js';

export interface SavedDeckCard {
  position: number;
  ownedCardId: string;
  cardDefinitionId: string;
  name: string;
  category: CardCategory;
  affinity: CardAffinity;
  rarity: CardRarity;
}

export interface SavedDeck {
  deckId: string;
  name: string;
  isSelected: boolean;
  totalPoints: number;
  createdAt: string;
  updatedAt: string;
  cards: SavedDeckCard[];
}

export interface CreateDeckInput {
  playerId: string;
  name: string;
  ownedCardIds: readonly string[];
}

export interface UpdateDeckInput extends CreateDeckInput {
  deckId: string;
}

export interface DeckService {
  listDecks(playerId: string): Promise<SavedDeck[]>;

  createDeck(input: CreateDeckInput): Promise<SavedDeck>;

  updateDeck(input: UpdateDeckInput): Promise<SavedDeck>;

  deleteDeck(playerId: string, deckId: string): Promise<void>;

  selectDeck(playerId: string, deckId: string): Promise<SavedDeck>;
}

export interface DeckTransactionClient {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{
    rows: T[];
    rowCount?: number | null;
  }>;

  release(): void;
}

export interface DeckDatabase {
  connect(): Promise<DeckTransactionClient>;
}

export class DeckNotFoundError extends Error {
  constructor() {
    super('Saved deck was not found.');
    this.name = 'DeckNotFoundError';
  }
}

export class DeckOwnedCardNotFoundError extends Error {
  constructor() {
    super('One or more selected card copies are unavailable.');
    this.name = 'DeckOwnedCardNotFoundError';
  }
}

export class InvalidDeckNameError extends Error {
  constructor() {
    super('Deck name must not be blank.');
    this.name = 'InvalidDeckNameError';
  }
}

interface OwnedDeckCardRow extends pg.QueryResultRow {
  affinity: CardAffinity;
  card_definition_id: string;
  category: CardCategory;
  name: string;
  owned_card_id: string;
  rarity: CardRarity;
}

interface DeckIdentityRow extends pg.QueryResultRow {
  deck_id: string;
}

interface DeckReadRow extends pg.QueryResultRow {
  deck_id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
  is_selected: boolean;

  position: number | null;
  owned_card_id: string | null;
  card_definition_id: string | null;
  card_name: string | null;
  category: CardCategory | null;
  affinity: CardAffinity | null;
  rarity: CardRarity | null;
}

export function createDeckService(database: DeckDatabase): DeckService {
  return {
    async listDecks(playerId) {
      const client = await database.connect();

      try {
        const rows = await loadDeckRows(client, playerId, null);

        return mapSavedDecks(rows);
      } finally {
        client.release();
      }
    },

    async createDeck(input) {
      const name = normalizeDeckName(input.name);

      return withTransaction(database, async (client) => {
        const cards = await resolveOwnedDeckCards(
          client,
          input.playerId,
          input.ownedCardIds,
        );

        validateBasicDeck(cards);

        const inserted = await client.query<DeckIdentityRow>(
          `
              insert into public.player_decks (
                player_id,
                name
              )
              values ($1::uuid, $2)
              returning id::text as deck_id
            `,
          [input.playerId, name],
        );

        const deckId = inserted.rows[0]?.deck_id;

        if (!deckId) {
          throw new Error('Saved deck creation returned no persisted deck.');
        }

        await replaceDeckCards(client, input.playerId, deckId, cards);

        return loadRequiredDeck(client, input.playerId, deckId);
      });
    },

    async updateDeck(input) {
      const name = normalizeDeckName(input.name);

      return withTransaction(database, async (client) => {
        await lockOwnedDeck(client, input.playerId, input.deckId);

        const cards = await resolveOwnedDeckCards(
          client,
          input.playerId,
          input.ownedCardIds,
        );

        validateBasicDeck(cards);

        const updated = await client.query<DeckIdentityRow>(
          `
              update public.player_decks
                 set name = $3,
                     updated_at = now()
               where id = $1::uuid
                 and player_id = $2::uuid
               returning id::text as deck_id
            `,
          [input.deckId, input.playerId, name],
        );

        if (!updated.rows[0]) {
          throw new DeckNotFoundError();
        }

        await replaceDeckCards(client, input.playerId, input.deckId, cards);

        return loadRequiredDeck(client, input.playerId, input.deckId);
      });
    },

    async deleteDeck(playerId, deckId) {
      await withTransaction(database, async (client) => {
        const deleted = await client.query<DeckIdentityRow>(
          `
              delete from public.player_decks
               where id = $1::uuid
                 and player_id = $2::uuid
               returning id::text as deck_id
            `,
          [deckId, playerId],
        );

        if (!deleted.rows[0]) {
          throw new DeckNotFoundError();
        }
      });
    },

    async selectDeck(playerId, deckId) {
      return withTransaction(database, async (client) => {
        await lockOwnedDeck(client, playerId, deckId);

        // Re-read and revalidate authoritative card metadata at
        // selection time so an invalid persisted deck can never
        // become the active match source.
        const deck = await loadRequiredDeck(client, playerId, deckId);

        validateBasicDeck(deck.cards);

        await client.query(
          `
            insert into public.player_deck_selections (
              player_id,
              deck_id
            )
            values ($1::uuid, $2::uuid)
            on conflict (player_id)
            do update set
              deck_id = excluded.deck_id,
              selected_at = now()
          `,
          [playerId, deckId],
        );

        return {
          ...deck,
          isSelected: true,
        };
      });
    },
  };
}

async function withTransaction<T>(
  database: DeckDatabase,
  operation: (client: DeckTransactionClient) => Promise<T>,
): Promise<T> {
  const client = await database.connect();

  try {
    await client.query('begin');

    const result = await operation(client);

    await client.query('commit');

    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // Preserve the original transaction failure.
    }

    throw error;
  } finally {
    client.release();
  }
}

function normalizeDeckName(name: string): string {
  const normalized = name.trim();

  if (normalized.length === 0) {
    throw new InvalidDeckNameError();
  }

  return normalized;
}

async function lockOwnedDeck(
  client: DeckTransactionClient,
  playerId: string,
  deckId: string,
): Promise<void> {
  const result = await client.query<DeckIdentityRow>(
    `
      select id::text as deck_id
      from public.player_decks
      where id = $1::uuid
        and player_id = $2::uuid
      for update
    `,
    [deckId, playerId],
  );

  if (!result.rows[0]) {
    throw new DeckNotFoundError();
  }
}

async function resolveOwnedDeckCards(
  client: DeckTransactionClient,
  playerId: string,
  ownedCardIds: readonly string[],
): Promise<SavedDeckCard[]> {
  if (ownedCardIds.length !== BASIC_DECK_SIZE) {
    throw new DeckRuleViolationError(
      'DECK_SIZE_INVALID',
      'A Basic deck must contain exactly five cards.',
    );
  }

  if (new Set(ownedCardIds).size !== ownedCardIds.length) {
    throw new DeckRuleViolationError(
      'DECK_COPY_DUPLICATED',
      'The same owned card copy cannot appear twice in one deck.',
    );
  }

  const result = await client.query<OwnedDeckCardRow>(
    `
        select
          owned.id::text as owned_card_id,
          definition.id::text as card_definition_id,
          definition.name,
          definition.category,
          definition.affinity,
          definition.rarity
        from public.player_cards owned
        join public.card_definitions definition
          on definition.id = owned.card_definition_id
        where owned.player_id = $1::uuid
          and owned.id = any($2::uuid[])
      `,
    [playerId, [...ownedCardIds]],
  );

  if (result.rows.length !== ownedCardIds.length) {
    throw new DeckOwnedCardNotFoundError();
  }

  const cardsByOwnedId = new Map(
    result.rows.map((row) => [row.owned_card_id, row]),
  );

  return ownedCardIds.map((ownedCardId, index) => {
    const row = cardsByOwnedId.get(ownedCardId);

    if (!row) {
      throw new DeckOwnedCardNotFoundError();
    }

    return {
      position: index + 1,
      ownedCardId: row.owned_card_id,
      cardDefinitionId: row.card_definition_id,
      name: row.name,
      category: row.category,
      affinity: row.affinity,
      rarity: row.rarity,
    };
  });
}

async function replaceDeckCards(
  client: DeckTransactionClient,
  playerId: string,
  deckId: string,
  cards: readonly SavedDeckCard[],
): Promise<void> {
  await client.query(
    `
      delete from public.player_deck_cards
      where deck_id = $1::uuid
        and player_id = $2::uuid
    `,
    [deckId, playerId],
  );

  for (const card of cards) {
    await client.query(
      `
        insert into public.player_deck_cards (
          deck_id,
          player_id,
          owned_card_id,
          position
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4
        )
      `,
      [deckId, playerId, card.ownedCardId, card.position],
    );
  }
}

async function loadRequiredDeck(
  client: DeckTransactionClient,
  playerId: string,
  deckId: string,
): Promise<SavedDeck> {
  const rows = await loadDeckRows(client, playerId, deckId);

  const decks = mapSavedDecks(rows);
  const deck = decks[0];

  if (!deck) {
    throw new DeckNotFoundError();
  }

  return deck;
}

async function loadDeckRows(
  client: DeckTransactionClient,
  playerId: string,
  deckId: string | null,
): Promise<DeckReadRow[]> {
  const result = await client.query<DeckReadRow>(
    `
      select
        deck.id::text as deck_id,
        deck.name,
        deck.created_at,
        deck.updated_at,
        (selection.deck_id is not null) as is_selected,
        membership.position,
        owned.id::text as owned_card_id,
        definition.id::text as card_definition_id,
        definition.name as card_name,
        definition.category,
        definition.affinity,
        definition.rarity
      from public.player_decks deck
      left join public.player_deck_selections selection
        on selection.player_id = deck.player_id
       and selection.deck_id = deck.id
      left join public.player_deck_cards membership
        on membership.deck_id = deck.id
       and membership.player_id = deck.player_id
      left join public.player_cards owned
        on owned.id = membership.owned_card_id
       and owned.player_id = membership.player_id
      left join public.card_definitions definition
        on definition.id = owned.card_definition_id
      where deck.player_id = $1::uuid
        and (
          $2::uuid is null
          or deck.id = $2::uuid
        )
      order by
        deck.updated_at desc,
        deck.id,
        membership.position
    `,
    [playerId, deckId],
  );

  return result.rows;
}

function mapSavedDecks(rows: readonly DeckReadRow[]): SavedDeck[] {
  const grouped = new Map<string, Omit<SavedDeck, 'totalPoints'>>();

  for (const row of rows) {
    let deck = grouped.get(row.deck_id);

    if (!deck) {
      deck = {
        deckId: row.deck_id,
        name: row.name,
        isSelected: row.is_selected,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        cards: [],
      };

      grouped.set(row.deck_id, deck);
    }

    if (row.owned_card_id === null) {
      continue;
    }

    if (
      row.position === null ||
      row.card_definition_id === null ||
      row.card_name === null ||
      row.category === null ||
      row.affinity === null ||
      row.rarity === null
    ) {
      throw new Error(
        'Persisted saved deck contains incomplete card metadata.',
      );
    }

    deck.cards.push({
      position: row.position,
      ownedCardId: row.owned_card_id,
      cardDefinitionId: row.card_definition_id,
      name: row.card_name,
      category: row.category,
      affinity: row.affinity,
      rarity: row.rarity,
    });
  }

  return [...grouped.values()].map((deck): SavedDeck => {
    const summary = validateBasicDeck(deck.cards);

    return {
      ...deck,
      totalPoints: summary.totalPoints,
    };
  });
}

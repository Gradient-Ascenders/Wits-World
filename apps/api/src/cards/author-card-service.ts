import type pg from 'pg';

import {
  InvalidCardDefinitionError,
  validateCardDefinition,
  type CardDefinitionInput,
  type CardEffectInput,
  type CardMoveInput,
} from './card-validation.js';
import type {
  CardAffinity,
  CardCategory,
  CardDefinition,
  CardEffect,
  CardMove,
  CardRarity,
} from './card-types.js';

export type AuthorCardStatus = 'draft' | 'published' | 'retired';

export interface AuthorCardDefinition extends CardDefinition {
  authoringStatus: AuthorCardStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAuthorCardInput extends CardDefinitionInput {
  actorPlayerId: string;
}

export interface UpdateAuthorCardInput extends CardDefinitionInput {
  actorPlayerId: string;
  cardId: string;
}

export interface AuthorCardService {
  listCards(): Promise<AuthorCardDefinition[]>;

  createCard(input: CreateAuthorCardInput): Promise<AuthorCardDefinition>;

  updateCard(input: UpdateAuthorCardInput): Promise<AuthorCardDefinition>;

  publishCard(
    actorPlayerId: string,
    cardId: string,
  ): Promise<AuthorCardDefinition>;

  retireCard(
    actorPlayerId: string,
    cardId: string,
  ): Promise<AuthorCardDefinition>;
}

export interface AuthorCardDatabase {
  connect(): Promise<AuthorCardTransactionClient>;
}

export interface AuthorCardTransactionClient {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{
    rows: T[];
    rowCount?: number | null;
  }>;

  release(): void;
}

interface CardRow extends pg.QueryResultRow {
  card_id: string;
  name: string;
  category: CardCategory;
  affinity: CardAffinity;
  rarity: CardRarity;
  hp: number | null;
  power: number | null;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  authoring_status: AuthorCardStatus;
  created_at: Date;
  updated_at: Date;
  moves: CardMove[];
  effects: CardEffect[];
}

interface CardLockRow extends pg.QueryResultRow {
  authoring_status: AuthorCardStatus;
}

interface CardInsertRow extends pg.QueryResultRow {
  card_id: string;
}

interface NormalizedCardInput extends CardDefinitionInput {
  description: string | null;
  imageUrl: string | null;
  moves: CardMoveInput[];
  effects: CardEffectInput[];
}

export class AuthorCardNotFoundError extends Error {
  constructor() {
    super('The requested card definition was not found.');
    this.name = 'AuthorCardNotFoundError';
  }
}

export class AuthorCardStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorCardStateConflictError';
  }
}

export class AuthorCardNameConflictError extends Error {
  constructor() {
    super('Another card definition already uses that name.');
    this.name = 'AuthorCardNameConflictError';
  }
}

export class AuthorCardNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorCardNotReadyError';
  }
}

export function createAuthorCardService(
  database: AuthorCardDatabase,
): AuthorCardService {
  return {
    async listCards() {
      const client = await database.connect();

      try {
        const result = await client.query<CardRow>(cardSelectSql());

        return result.rows.map(mapCard);
      } finally {
        client.release();
      }
    },

    async createCard(input) {
      const normalized = normalizeAndValidateCard(input);

      return withTransaction(database, async (client) => {
        const result = await client.query<CardInsertRow>(
          `
            insert into public.card_definitions (
              name,
              category,
              affinity,
              rarity,
              hp,
              power,
              description,
              image_url,
              is_active,
              authoring_status
            )
            values (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              false,
              'draft'
            )
            returning id::text as card_id
          `,
          [
            normalized.name,
            normalized.category,
            normalized.affinity,
            normalized.rarity,
            normalized.hp,
            normalized.power,
            normalized.description,
            normalized.imageUrl,
          ],
        );

        const cardId = result.rows[0]?.card_id;

        if (!cardId) {
          throw new Error(
            'Card creation did not return the created card identifier.',
          );
        }

        await insertCardChildren(client, cardId, normalized);

        await insertAudit(client, input.actorPlayerId, cardId, 'create');

        return requireLoadedCard(client, cardId);
      });
    },

    async updateCard(input) {
      const normalized = normalizeAndValidateCard(input);

      return withTransaction(database, async (client) => {
        const locked = await lockCard(client, input.cardId);

        if (locked.authoring_status !== 'draft') {
          throw new AuthorCardStateConflictError(
            'Published or retired cards cannot be edited; create a replacement card instead.',
          );
        }

        /*
         * Delete draft children before changing category. The existing database
         * category guard correctly rejects changing Creature <-> Power while
         * contradictory child records remain.
         */
        await client.query(
          `
            delete from public.card_moves
            where card_definition_id = $1::uuid
          `,
          [input.cardId],
        );

        await client.query(
          `
            delete from public.card_effects
            where card_definition_id = $1::uuid
          `,
          [input.cardId],
        );

        const updateResult = await client.query(
          `
            update public.card_definitions
            set
              name = $2,
              category = $3,
              affinity = $4,
              rarity = $5,
              hp = $6,
              power = $7,
              description = $8,
              image_url = $9,
              updated_at = now()
            where id = $1::uuid
          `,
          [
            input.cardId,
            normalized.name,
            normalized.category,
            normalized.affinity,
            normalized.rarity,
            normalized.hp,
            normalized.power,
            normalized.description,
            normalized.imageUrl,
          ],
        );

        if (updateResult.rowCount === 0) {
          throw new AuthorCardNotFoundError();
        }

        await insertCardChildren(client, input.cardId, normalized);

        await insertAudit(client, input.actorPlayerId, input.cardId, 'edit');

        return requireLoadedCard(client, input.cardId);
      });
    },

    async publishCard(actorPlayerId, cardId) {
      return withTransaction(database, async (client) => {
        const locked = await lockCard(client, cardId);

        if (locked.authoring_status !== 'draft') {
          throw new AuthorCardStateConflictError(
            'Only a draft card can be published.',
          );
        }

        const card = await requireLoadedCard(client, cardId);

        assertCardReadyForPublication(card);

        await client.query(
          `
            update public.card_definitions
            set
              authoring_status = 'published',
              is_active = true,
              updated_at = now()
            where id = $1::uuid
          `,
          [cardId],
        );

        await insertAudit(client, actorPlayerId, cardId, 'publish');

        return requireLoadedCard(client, cardId);
      });
    },

    async retireCard(actorPlayerId, cardId) {
      return withTransaction(database, async (client) => {
        const locked = await lockCard(client, cardId);

        if (locked.authoring_status === 'retired') {
          throw new AuthorCardStateConflictError(
            'The card is already retired.',
          );
        }

        await client.query(
          `
            update public.card_definitions
            set
              authoring_status = 'retired',
              is_active = false,
              updated_at = now()
            where id = $1::uuid
          `,
          [cardId],
        );

        await insertAudit(client, actorPlayerId, cardId, 'retire');

        return requireLoadedCard(client, cardId);
      });
    },
  };
}

function normalizeAndValidateCard(
  input: CardDefinitionInput,
): NormalizedCardInput {
  const normalized: NormalizedCardInput = {
    name: input.name.trim(),
    category: input.category,
    affinity: input.affinity,
    rarity: input.rarity,
    hp: input.hp,
    power: input.power,
    description: normalizeOptionalText(input.description, 'Card description'),
    imageUrl: normalizeOptionalText(input.imageUrl, 'Card image URL'),
    moves: (input.moves ?? []).map((move) => ({
      ...move,
      name: move.name.trim(),
    })),
    effects: [...(input.effects ?? [])],
  };

  validateCardDefinition(normalized);

  return normalized;
}

function normalizeOptionalText(
  value: string | null | undefined,
  label: string,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new InvalidCardDefinitionError(
      `${label} must not be blank when provided.`,
    );
  }

  return normalized;
}

async function lockCard(
  client: AuthorCardTransactionClient,
  cardId: string,
): Promise<CardLockRow> {
  const result = await client.query<CardLockRow>(
    `
      select authoring_status
      from public.card_definitions
      where id = $1::uuid
      for update
    `,
    [cardId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new AuthorCardNotFoundError();
  }

  return row;
}

async function insertCardChildren(
  client: AuthorCardTransactionClient,
  cardId: string,
  card: NormalizedCardInput,
): Promise<void> {
  for (const move of card.moves) {
    await client.query(
      `
        insert into public.card_moves (
          card_definition_id,
          position,
          name,
          move_type,
          effect_type,
          effect_value,
          modifier_stat,
          modifier_operation,
          modifier_duration_turns,
          power_cost
        )
        values (
          $1::uuid,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10
        )
      `,
      [
        cardId,
        move.position,
        move.name,
        move.moveType,
        move.effectType,
        move.effectValue ?? null,
        move.modifierStat ?? null,
        move.modifierOperation ?? null,
        move.modifierDurationTurns ?? null,
        move.powerCost,
      ],
    );
  }

  for (const effect of card.effects) {
    await client.query(
      `
        insert into public.card_effects (
          card_definition_id,
          position,
          effect_type,
          effect_value,
          modifier_stat,
          modifier_operation,
          modifier_duration_turns
        )
        values (
          $1::uuid,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
      `,
      [
        cardId,
        effect.position,
        effect.effectType,
        effect.effectValue ?? null,
        effect.modifierStat ?? null,
        effect.modifierOperation ?? null,
        effect.modifierDurationTurns ?? null,
      ],
    );
  }
}

async function requireLoadedCard(
  client: AuthorCardTransactionClient,
  cardId: string,
): Promise<AuthorCardDefinition> {
  const result = await client.query<CardRow>(
    `
      ${cardSelectSql()}
      where definition.id = $1::uuid
    `,
    [cardId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new AuthorCardNotFoundError();
  }

  return mapCard(row);
}

function cardSelectSql(): string {
  return `
    select
      definition.id::text as card_id,
      definition.name,
      definition.category,
      definition.affinity,
      definition.rarity,
      definition.hp,
      definition.power,
      definition.description,
      definition.image_url,
      definition.is_active,
      definition.authoring_status,
      definition.created_at,
      definition.updated_at,
      coalesce((
        select json_agg(
          json_build_object(
            'id', move.id::text,
            'position', move.position,
            'name', move.name,
            'moveType', move.move_type,
            'effectType', move.effect_type,
            'effectValue', move.effect_value,
            'modifierStat', move.modifier_stat,
            'modifierOperation', move.modifier_operation,
            'modifierDurationTurns', move.modifier_duration_turns,
            'powerCost', move.power_cost
          )
          order by move.position
        )
        from public.card_moves move
        where move.card_definition_id = definition.id
      ), '[]'::json) as moves,
      coalesce((
        select json_agg(
          json_build_object(
            'id', effect.id::text,
            'position', effect.position,
            'effectType', effect.effect_type,
            'effectValue', effect.effect_value,
            'modifierStat', effect.modifier_stat,
            'modifierOperation', effect.modifier_operation,
            'modifierDurationTurns', effect.modifier_duration_turns
          )
          order by effect.position
        )
        from public.card_effects effect
        where effect.card_definition_id = definition.id
      ), '[]'::json) as effects
    from public.card_definitions definition
  `;
}

function mapCard(row: CardRow): AuthorCardDefinition {
  return {
    id: row.card_id,
    name: row.name,
    category: row.category,
    affinity: row.affinity,
    rarity: row.rarity,
    hp: row.hp,
    power: row.power,
    description: row.description,
    imageUrl: row.image_url,
    isActive: row.is_active,
    moves: row.moves ?? [],
    effects: row.effects ?? [],
    authoringStatus: row.authoring_status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function assertCardReadyForPublication(card: AuthorCardDefinition): void {
  if (card.category === 'creature' && card.moves.length !== 4) {
    throw new AuthorCardNotReadyError(
      'Creature cards require exactly four moves before publication.',
    );
  }

  try {
    validateCardDefinition({
      name: card.name,
      category: card.category,
      affinity: card.affinity,
      rarity: card.rarity,
      hp: card.hp,
      power: card.power,
      description: card.description,
      imageUrl: card.imageUrl,
      moves: card.moves.map((move) => ({
        position: move.position,
        name: move.name,
        moveType: move.moveType,
        effectType: move.effectType,
        effectValue: move.effectValue,
        modifierStat: move.modifierStat,
        modifierOperation: move.modifierOperation,
        modifierDurationTurns: move.modifierDurationTurns,
        powerCost: move.powerCost,
      })),
      effects: card.effects.map((effect) => ({
        position: effect.position,
        effectType: effect.effectType,
        effectValue: effect.effectValue,
        modifierStat: effect.modifierStat,
        modifierOperation: effect.modifierOperation,
        modifierDurationTurns: effect.modifierDurationTurns,
      })),
    });
  } catch (error) {
    if (error instanceof InvalidCardDefinitionError) {
      throw new AuthorCardNotReadyError(error.message);
    }

    throw error;
  }
}

async function insertAudit(
  client: AuthorCardTransactionClient,
  actorPlayerId: string,
  cardId: string,
  action: 'create' | 'edit' | 'publish' | 'retire',
): Promise<void> {
  await client.query(
    `
      insert into public.author_content_audit (
        actor_player_id,
        entity_type,
        entity_id,
        action
      )
      values (
        $1::uuid,
        'card',
        $2::uuid,
        $3
      )
    `,
    [actorPlayerId, cardId, action],
  );
}

async function withTransaction<T>(
  database: AuthorCardDatabase,
  operation: (client: AuthorCardTransactionClient) => Promise<T>,
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
      // Preserve the original operation failure.
    }

    if (isCardNameUniqueViolation(error)) {
      throw new AuthorCardNameConflictError();
    }

    throw error;
  } finally {
    client.release();
  }
}

function isCardNameUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'card_definitions_normalized_name_unique_idx'
  );
}

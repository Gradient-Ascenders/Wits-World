import type pg from 'pg';

import {
  type AuthorContentLifecycle,
  type AuthorContentStatus,
  assertDraftVersion,
  insertAuthorContentAudit,
  transitionAuthorContent,
} from '../authoring/content-workflow.js';

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

export type AuthorCardStatus = AuthorContentStatus;

export interface AuthorCardDefinition extends CardDefinition {
  authoringStatus: AuthorCardStatus;
  createdAt: string;
  updatedAt: string;
  version: number;
  submittedBy: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  publicationProvenance: AuthorContentLifecycle['publicationProvenance'];
}

export interface CreateAuthorCardInput extends CardDefinitionInput {
  actorPlayerId: string;
}

export interface UpdateAuthorCardInput extends CardDefinitionInput {
  actorPlayerId: string;
  cardId: string;
  expectedVersion: number;
}

export interface AuthorCardTransitionInput {
  actorPlayerId: string;
  cardId: string;
  expectedVersion: number;
  note?: string;
}

export interface AuthorCardService {
  listCards(): Promise<AuthorCardDefinition[]>;

  createCard(input: CreateAuthorCardInput): Promise<AuthorCardDefinition>;

  updateCard(input: UpdateAuthorCardInput): Promise<AuthorCardDefinition>;

  submitCard(input: AuthorCardTransitionInput): Promise<AuthorCardDefinition>;
  approveCard(input: AuthorCardTransitionInput): Promise<AuthorCardDefinition>;
  returnCard(input: AuthorCardTransitionInput): Promise<AuthorCardDefinition>;
  publishCard(input: AuthorCardTransitionInput): Promise<AuthorCardDefinition>;
  retireCard(input: AuthorCardTransitionInput): Promise<AuthorCardDefinition>;
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
  version: number;
  submitted_by_player_id: string | null;
  submitted_at: Date | null;
  reviewed_by_player_id: string | null;
  reviewed_at: Date | null;
  publication_provenance: AuthorContentLifecycle['publicationProvenance'];
  moves: CardMove[];
  effects: CardEffect[];
}

interface CardLockRow extends pg.QueryResultRow {
  authoring_status: AuthorCardStatus;
  version: number;
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

export class AuthorCardNameConflictError extends Error {
  constructor() {
    super('Another card definition already uses that name.');
    this.name = 'AuthorCardNameConflictError';
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

        await insertAuthorContentAudit(client, {
          actorPlayerId: input.actorPlayerId,
          entityType: 'card',
          entityId: cardId,
          action: 'create',
          fromStatus: null,
          toStatus: 'draft',
          resultingVersion: 0,
        });

        return requireLoadedCard(client, cardId);
      });
    },

    async updateCard(input) {
      const normalized = normalizeAndValidateCard(input);

      return withTransaction(database, async (client) => {
        const locked = await lockCard(client, input.cardId);

        assertDraftVersion(
          { status: locked.authoring_status, version: locked.version },
          input.expectedVersion,
        );

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
              version = version + 1,
              updated_at = now()
            where id = $1::uuid and version = $10
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
            input.expectedVersion,
          ],
        );

        if (updateResult.rowCount === 0) {
          throw new AuthorCardNotFoundError();
        }

        await insertCardChildren(client, input.cardId, normalized);

        await insertAuthorContentAudit(client, {
          actorPlayerId: input.actorPlayerId,
          entityType: 'card',
          entityId: input.cardId,
          action: 'edit',
          fromStatus: 'draft',
          toStatus: 'draft',
          resultingVersion: input.expectedVersion + 1,
        });

        return requireLoadedCard(client, input.cardId);
      });
    },

    submitCard: (input) => transitionCard(database, input, 'submit'),
    approveCard: (input) => transitionCard(database, input, 'approve'),
    returnCard: (input) => transitionCard(database, input, 'return'),
    publishCard: (input) => transitionCard(database, input, 'publish'),
    retireCard: (input) => transitionCard(database, input, 'retire'),
  };
}

async function transitionCard(
  database: AuthorCardDatabase,
  input: AuthorCardTransitionInput,
  action: 'submit' | 'approve' | 'return' | 'publish' | 'retire',
): Promise<AuthorCardDefinition> {
  return withTransaction(database, async (client) => {
    await transitionAuthorContent(client, {
      entityType: 'card',
      entityId: input.cardId,
      actorPlayerId: input.actorPlayerId,
      expectedVersion: input.expectedVersion,
      note: input.note,
      action,
    });
    return requireLoadedCard(client, input.cardId);
  });
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
      select authoring_status, version
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
      definition.version,
      definition.submitted_by_player_id::text,
      definition.submitted_at,
      definition.reviewed_by_player_id::text,
      definition.reviewed_at,
      definition.publication_provenance,
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
    version: row.version,
    submittedBy: row.submitted_by_player_id,
    submittedAt: row.submitted_at?.toISOString() ?? null,
    reviewedBy: row.reviewed_by_player_id,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    publicationProvenance: row.publication_provenance,
  };
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

import type pg from 'pg';

import type { TrustService } from '../trust/trust-service.js';

import { getDeckRarityPoints } from './deck-rules.js';
import type {
  CardAffinity,
  CardCategory,
  CardDefinition,
  CardEffect,
  CardMove,
  CardRarity,
  OwnedCard,
} from './card-types.js';

export interface EvolutionCardDefinition extends Omit<CardDefinition, 'id'> {
  cardDefinitionId: string;
  deckPointCost: number;
}

export interface EvolutionOwnedCopy {
  ownedCardId: string;
  acquiredAt: string;
  acquisitionKind: OwnedCard['acquisitionKind'];
  eligible: boolean;
  lockReason: 'saved_deck' | null;
}

export type EvolutionUnavailableReason =
  'insufficient_copies' | 'saved_deck_lock' | null;

export interface CardEvolutionPreview {
  source: EvolutionCardDefinition;
  target: EvolutionCardDefinition;
  copiesRequired: 3;
  ownedCopyCount: number;
  eligibleCopyCount: number;
  deckLockedCopyCount: number;
  copies: EvolutionOwnedCopy[];
  canEvolve: boolean;
  unavailableReason: EvolutionUnavailableReason;
}

export interface EvolveCardsInput {
  playerId: string;
  submissionId: string;
  sourceCardDefinitionId: string;
}

export interface CardEvolutionResult {
  evolutionId: string;
  submissionId: string;
  sourceCardDefinitionId: string;
  target: EvolutionCardDefinition;
  consumedOwnedCardIds: [string, string, string];
  newCard: OwnedCard;
  completedAt: string;
  replayed: boolean;
}

export interface CardEvolutionService {
  previewEvolution(
    playerId: string,
    sourceCardDefinitionId: string,
  ): Promise<CardEvolutionPreview>;
  evolveCards(input: EvolveCardsInput): Promise<CardEvolutionResult>;
}

export interface CardEvolutionTransactionClient {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
  release(): void;
}

export interface CardEvolutionDatabase {
  connect(): Promise<CardEvolutionTransactionClient>;
}

export class EvolutionNotAvailableError extends Error {
  constructor() {
    super('The selected card definition cannot be evolved.');
    this.name = 'EvolutionNotAvailableError';
  }
}

export class InsufficientEvolutionCopiesError extends Error {
  constructor() {
    super('Three owned copies are required for this evolution.');
    this.name = 'InsufficientEvolutionCopiesError';
  }
}

export class EvolutionCopiesDeckLockedError extends Error {
  constructor() {
    super('One or more required copies are used by a saved deck.');
    this.name = 'EvolutionCopiesDeckLockedError';
  }
}

export class EvolutionReplayConflictError extends Error {
  constructor() {
    super('The submission identifier was already used for another evolution.');
    this.name = 'EvolutionReplayConflictError';
  }
}

export class EvolutionPlayerUnavailableError extends Error {
  constructor() {
    super('The player account is not available for card evolution.');
    this.name = 'EvolutionPlayerUnavailableError';
  }
}

interface EvolutionRelationshipRow extends pg.QueryResultRow {
  copies_required: number;
  source_definition_id: string;
  target_definition_id: string;
}

interface DefinitionRow extends pg.QueryResultRow {
  affinity: CardAffinity | null;
  card_definition_id: string;
  category: CardCategory;
  description: string | null;
  effects: CardEffect[];
  hp: number | null;
  image_alt: string | null;
  image_url: string | null;
  is_active: boolean;
  moves: CardMove[];
  name: string;
  power: number | null;
  rarity: CardRarity;
}

interface OwnedCopyRow extends pg.QueryResultRow {
  acquired_at: Date;
  acquisition_kind: OwnedCard['acquisitionKind'];
  deck_locked: boolean;
  owned_card_id: string;
}

interface EvolutionTransactionRow extends pg.QueryResultRow {
  completed_at: Date;
  evolution_id: string;
  granted_acquired_at: Date;
  granted_owned_card_id: string;
  source_definition_id: string;
  submission_id: string;
  target_definition_id: string;
}

export function createCardEvolutionService(
  database: CardEvolutionDatabase,
  {
    trustService,
  }: {
    trustService?: Pick<TrustService, 'recordSubmissionConflict'>;
  } = {},
): CardEvolutionService {
  return {
    async previewEvolution(playerId, sourceCardDefinitionId) {
      const client = await database.connect();

      try {
        const relationship = await loadRelationship(
          client,
          sourceCardDefinitionId,
        );
        const [source, target, copies] = await Promise.all([
          loadDefinition(client, relationship.source_definition_id),
          loadDefinition(client, relationship.target_definition_id),
          loadOwnedCopies(client, playerId, relationship.source_definition_id),
        ]);
        const eligibleCopyCount = copies.filter((copy) => copy.eligible).length;
        const deckLockedCopyCount = copies.length - eligibleCopyCount;
        const canEvolve = eligibleCopyCount >= 3;

        return {
          source,
          target,
          copiesRequired: 3,
          ownedCopyCount: copies.length,
          eligibleCopyCount,
          deckLockedCopyCount,
          copies,
          canEvolve,
          unavailableReason: canEvolve
            ? null
            : copies.length >= 3 && deckLockedCopyCount > 0
              ? 'saved_deck_lock'
              : 'insufficient_copies',
        };
      } finally {
        client.release();
      }
    },

    async evolveCards(input) {
      try {
        return await withTransaction(database, async (client) => {
          await lockActivePlayer(client, input.playerId);

          const existing = await loadTransactionBySubmission(
            client,
            input.playerId,
            input.submissionId,
          );

          if (existing) {
            if (
              existing.source_definition_id !== input.sourceCardDefinitionId
            ) {
              throw new EvolutionReplayConflictError();
            }

            return loadEvolutionResult(client, existing, true);
          }

          const relationship = await loadRelationship(
            client,
            input.sourceCardDefinitionId,
          );
          const copies = await loadAndLockOwnedCopies(
            client,
            input.playerId,
            relationship.source_definition_id,
          );
          const eligibleCopies = copies.filter((copy) => !copy.deck_locked);

          if (eligibleCopies.length < 3) {
            if (copies.length >= 3 && copies.some((copy) => copy.deck_locked)) {
              throw new EvolutionCopiesDeckLockedError();
            }

            throw new InsufficientEvolutionCopiesError();
          }

          const selected = eligibleCopies.slice(0, 3);
          const inserted = await client.query<EvolutionTransactionRow>(
            `
            insert into public.card_evolution_transactions (
              player_id,
              submission_id,
              source_definition_id,
              target_definition_id
            )
            values ($1::uuid, $2::uuid, $3::uuid, $4::uuid)
            returning
              id::text as evolution_id,
              submission_id::text,
              source_definition_id::text,
              target_definition_id::text,
              granted_owned_card_id::text,
              granted_acquired_at,
              completed_at
          `,
            [
              input.playerId,
              input.submissionId,
              relationship.source_definition_id,
              relationship.target_definition_id,
            ],
          );
          const transaction = inserted.rows[0];

          if (!transaction) {
            throw new Error(
              'Card evolution returned no persisted transaction.',
            );
          }

          const consumedIds = selected.map((copy) => copy.owned_card_id);
          const consumption = await client.query(
            `
            insert into public.card_evolution_consumptions (
              evolution_id,
              player_id,
              source_definition_id,
              owned_card_id,
              acquired_at,
              acquisition_kind
            )
            select
              $1::uuid,
              owned.player_id,
              owned.card_definition_id,
              owned.id,
              owned.acquired_at,
              owned.acquisition_kind
            from public.player_cards owned
            where owned.player_id = $2::uuid
              and owned.card_definition_id = $3::uuid
              and owned.id = any($4::uuid[])
          `,
            [
              transaction.evolution_id,
              input.playerId,
              relationship.source_definition_id,
              consumedIds,
            ],
          );

          if (consumption.rowCount !== 3) {
            throw new Error(
              'Card evolution did not snapshot exactly three copies.',
            );
          }

          const deleted = await client.query(
            `
            delete from public.player_cards
            where player_id = $1::uuid
              and card_definition_id = $2::uuid
              and id = any($3::uuid[])
          `,
            [input.playerId, relationship.source_definition_id, consumedIds],
          );

          if (deleted.rowCount !== 3) {
            throw new Error(
              'Card evolution did not consume exactly three copies.',
            );
          }

          await client.query(
            `
            insert into public.player_cards (
              id,
              player_id,
              card_definition_id,
              source_evolution_id,
              acquisition_kind,
              acquired_at
            )
            select
              evolution.granted_owned_card_id,
              evolution.player_id,
              evolution.target_definition_id,
              evolution.id,
              'evolution',
              evolution.granted_acquired_at
            from public.card_evolution_transactions evolution
            where evolution.id = $1::uuid
              and evolution.player_id = $2::uuid
          `,
            [transaction.evolution_id, input.playerId],
          );

          return loadEvolutionResult(client, transaction, false);
        });
      } catch (error) {
        if (error instanceof EvolutionReplayConflictError) {
          try {
            await trustService?.recordSubmissionConflict({
              playerId: input.playerId,
              operation: 'card_evolution',
              resourceIdentifier: input.sourceCardDefinitionId,
              submissionId: input.submissionId,
            });
          } catch {
            // Preserve the evolution idempotency conflict. A retry can attempt
            // trust ingestion again without changing collection state.
          }
        }
        throw error;
      }
    },
  };
}

async function withTransaction<T>(
  database: CardEvolutionDatabase,
  operation: (client: CardEvolutionTransactionClient) => Promise<T>,
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

    if (isDatabaseError(error, '23503', 'player_deck_cards_owned_copy_fk')) {
      throw new EvolutionCopiesDeckLockedError();
    }

    throw error;
  } finally {
    client.release();
  }
}

async function lockActivePlayer(
  client: CardEvolutionTransactionClient,
  playerId: string,
): Promise<void> {
  const result = await client.query(
    `
      select id
      from public.players
      where id = $1::uuid
        and lifecycle_status = 'active'
      for update
    `,
    [playerId],
  );

  if (!result.rows[0]) {
    throw new EvolutionPlayerUnavailableError();
  }
}

async function loadRelationship(
  client: CardEvolutionTransactionClient,
  sourceCardDefinitionId: string,
): Promise<EvolutionRelationshipRow> {
  const result = await client.query<EvolutionRelationshipRow>(
    `
      select
        source.id::text as source_definition_id,
        target.id::text as target_definition_id,
        target.evolution_copies_required as copies_required
      from public.card_definitions source
      join public.card_definitions target
        on target.evolves_from_definition_id = source.id
      where source.id = $1::uuid
        and source.is_active
        and source.authoring_status = 'published'
        and source.catalogue_class = 'ordinary'
        and target.is_active
        and target.authoring_status = 'published'
        and target.catalogue_class = 'ordinary'
        and target.evolution_copies_required = 3
    `,
    [sourceCardDefinitionId],
  );
  const relationship = result.rows[0];

  if (!relationship) {
    throw new EvolutionNotAvailableError();
  }

  return relationship;
}

async function loadOwnedCopies(
  client: CardEvolutionTransactionClient,
  playerId: string,
  sourceCardDefinitionId: string,
): Promise<EvolutionOwnedCopy[]> {
  const result = await queryOwnedCopies(
    client,
    playerId,
    sourceCardDefinitionId,
    false,
  );

  return result.map(mapOwnedCopy);
}

async function loadAndLockOwnedCopies(
  client: CardEvolutionTransactionClient,
  playerId: string,
  sourceCardDefinitionId: string,
): Promise<OwnedCopyRow[]> {
  return queryOwnedCopies(client, playerId, sourceCardDefinitionId, true);
}

async function queryOwnedCopies(
  client: CardEvolutionTransactionClient,
  playerId: string,
  sourceCardDefinitionId: string,
  lock: boolean,
): Promise<OwnedCopyRow[]> {
  const result = await client.query<OwnedCopyRow>(
    `
      select
        owned.id::text as owned_card_id,
        owned.acquired_at,
        owned.acquisition_kind,
        exists (
          select 1
          from public.player_deck_cards membership
          where membership.player_id = owned.player_id
            and membership.owned_card_id = owned.id
        ) as deck_locked
      from public.player_cards owned
      where owned.player_id = $1::uuid
        and owned.card_definition_id = $2::uuid
      order by owned.acquired_at desc, owned.id desc
      ${lock ? 'for update of owned' : ''}
    `,
    [playerId, sourceCardDefinitionId],
  );

  return result.rows;
}

function mapOwnedCopy(row: OwnedCopyRow): EvolutionOwnedCopy {
  return {
    ownedCardId: row.owned_card_id,
    acquiredAt: row.acquired_at.toISOString(),
    acquisitionKind: row.acquisition_kind,
    eligible: !row.deck_locked,
    lockReason: row.deck_locked ? 'saved_deck' : null,
  };
}

async function loadTransactionBySubmission(
  client: CardEvolutionTransactionClient,
  playerId: string,
  submissionId: string,
): Promise<EvolutionTransactionRow | null> {
  const result = await client.query<EvolutionTransactionRow>(
    `
      select
        id::text as evolution_id,
        submission_id::text,
        source_definition_id::text,
        target_definition_id::text,
        granted_owned_card_id::text,
        granted_acquired_at,
        completed_at
      from public.card_evolution_transactions
      where player_id = $1::uuid
        and submission_id = $2::uuid
    `,
    [playerId, submissionId],
  );

  return result.rows[0] ?? null;
}

async function loadEvolutionResult(
  client: CardEvolutionTransactionClient,
  transaction: EvolutionTransactionRow,
  replayed: boolean,
): Promise<CardEvolutionResult> {
  const consumed = await client.query<{ owned_card_id: string }>(
    `
      select owned_card_id::text
      from public.card_evolution_consumptions
      where evolution_id = $1::uuid
      order by acquired_at desc, owned_card_id desc
    `,
    [transaction.evolution_id],
  );
  const consumedOwnedCardIds = consumed.rows.map((row) => row.owned_card_id);

  if (consumedOwnedCardIds.length !== 3) {
    throw new Error('Persisted card evolution does not contain three copies.');
  }

  const target = await loadDefinition(client, transaction.target_definition_id);

  return {
    evolutionId: transaction.evolution_id,
    submissionId: transaction.submission_id,
    sourceCardDefinitionId: transaction.source_definition_id,
    target,
    consumedOwnedCardIds: consumedOwnedCardIds as [string, string, string],
    newCard: mapEvolutionGrant(target, transaction),
    completedAt: transaction.completed_at.toISOString(),
    replayed,
  };
}

async function loadDefinition(
  client: CardEvolutionTransactionClient,
  cardDefinitionId: string,
): Promise<EvolutionCardDefinition> {
  const result = await client.query<DefinitionRow>(
    `
      ${definitionSelectSql()}
      where definition.id = $1::uuid
    `,
    [cardDefinitionId],
  );
  const row = result.rows[0];

  if (!row) {
    throw new EvolutionNotAvailableError();
  }

  return mapDefinition(row);
}

function definitionSelectSql(): string {
  return `
    select
      definition.id::text as card_definition_id,
      definition.name,
      definition.category,
      definition.affinity,
      definition.rarity,
      definition.hp,
      definition.power,
      definition.description,
      definition.image_alt,
      definition.image_url,
      definition.is_active,
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
            'powerCost', move.power_cost,
            'rulesText', move.rules_text
          ) order by move.position
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
            'modifierDurationTurns', effect.modifier_duration_turns,
            'rulesText', effect.rules_text
          ) order by effect.position
        )
        from public.card_effects effect
        where effect.card_definition_id = definition.id
      ), '[]'::json) as effects
    from public.card_definitions definition
  `;
}

function mapDefinition(row: DefinitionRow): EvolutionCardDefinition {
  return {
    ...mapCardDefinition(row),
    deckPointCost: getDeckRarityPoints(row.rarity),
  };
}

function mapCardDefinition(
  row: DefinitionRow,
): Omit<CardDefinition, 'id'> & { cardDefinitionId: string } {
  return {
    cardDefinitionId: row.card_definition_id,
    name: row.name,
    category: row.category,
    affinity: row.affinity,
    rarity: row.rarity,
    hp: row.hp,
    power: row.power,
    description: row.description,
    imageAlt: row.image_alt,
    imageUrl: row.image_url,
    isActive: row.is_active,
    moves: row.moves ?? [],
    effects: row.effects ?? [],
  };
}

function mapEvolutionGrant(
  definition: EvolutionCardDefinition,
  transaction: EvolutionTransactionRow,
): OwnedCard {
  return {
    cardDefinitionId: definition.cardDefinitionId,
    name: definition.name,
    category: definition.category,
    affinity: definition.affinity,
    rarity: definition.rarity,
    hp: definition.hp,
    power: definition.power,
    description: definition.description,
    imageAlt: definition.imageAlt,
    imageUrl: definition.imageUrl,
    isActive: definition.isActive,
    moves: definition.moves,
    effects: definition.effects,
    ownedCardId: transaction.granted_owned_card_id,
    acquisitionKind: 'evolution',
    acquiredAt: transaction.granted_acquired_at.toISOString(),
  };
}

function isDatabaseError(
  error: unknown,
  code: string,
  constraint: string,
): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code &&
    'constraint' in error &&
    error.constraint === constraint
  );
}

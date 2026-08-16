import type pg from 'pg';

import type {
  CardAffinity,
  CardCategory,
  CardEffect,
  CardMove,
  CardRarity,
  StarterGrant,
  OwnedCard,
} from './card-types.js';

export interface StarterGrantDatabase {
  connect(): Promise<StarterGrantTransactionClient>;
}

export interface StarterGrantTransactionClient {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
  release(): void;
}

export interface SelectStarterInput {
  playerId: string;
  affinity: CardAffinity;
}

export interface StarterGrantService {
  selectStarter(input: SelectStarterInput): Promise<StarterGrantSelection>;
}

export interface StarterGrantSelection {
  grant: StarterGrant;
  created: boolean;
}

export class StarterAlreadyClaimedError extends Error {
  readonly existingAffinity: CardAffinity;

  constructor(existingAffinity: CardAffinity) {
    super('A starter affinity has already been selected for this player.');
    this.name = 'StarterAlreadyClaimedError';
    this.existingAffinity = existingAffinity;
  }
}

export class StarterCatalogueUnavailableError extends Error {
  constructor() {
    super(
      'The selected starter affinity does not have enough active Common cards.',
    );
    this.name = 'StarterCatalogueUnavailableError';
  }
}

interface StarterGrantRow extends pg.QueryResultRow {
  affinity: CardAffinity;
  granted_at: Date;
  starter_grant_id: string;
}

interface StarterCardRow extends pg.QueryResultRow {
  acquired_at: Date;
  affinity: CardAffinity;
  card_definition_id: string;
  category: CardCategory;
  description: string | null;
  effects: CardEffect[];
  hp: number | null;
  image_url: string | null;
  is_active: boolean;
  moves: CardMove[];
  name: string;
  owned_card_id: string;
  power: number | null;
  rarity: CardRarity;
}

interface StarterCandidateRow extends pg.QueryResultRow {
  card_definition_id: string;
}

export function createStarterGrantService(
  database: StarterGrantDatabase,
): StarterGrantService {
  return {
    async selectStarter(input) {
      const client = await database.connect();

      try {
        await client.query('begin');

        const existing = await loadStarterGrant(client, input.playerId, true);

        if (existing) {
          if (existing.affinity !== input.affinity) {
            throw new StarterAlreadyClaimedError(existing.affinity);
          }

          const result = await loadStarterGrantResult(
            client,
            input.playerId,
            existing,
          );
          assertCompleteStarterGrant(result, input.affinity);
          await client.query('commit');
          return { grant: result, created: false };
        }

        const creatureCandidates = await loadCandidates(
          client,
          input.affinity,
          'creature',
          3,
        );
        const powerCandidates = await loadCandidates(
          client,
          input.affinity,
          'power',
          2,
        );

        if (creatureCandidates.length !== 3 || powerCandidates.length !== 2) {
          throw new StarterCatalogueUnavailableError();
        }

        const grantInsert = await client.query<StarterGrantRow>(
          `
            insert into public.player_starter_grants (player_id, affinity)
            values ($1::uuid, $2)
            on conflict (player_id) do nothing
            returning
              id::text as starter_grant_id,
              affinity,
              granted_at
          `,
          [input.playerId, input.affinity],
        );

        const grant = grantInsert.rows[0];

        if (!grant) {
          const concurrentGrant = await loadStarterGrant(
            client,
            input.playerId,
            true,
          );

          if (!concurrentGrant) {
            throw new Error(
              'Starter grant creation returned no persisted row.',
            );
          }

          if (concurrentGrant.affinity !== input.affinity) {
            throw new StarterAlreadyClaimedError(concurrentGrant.affinity);
          }

          const result = await loadStarterGrantResult(
            client,
            input.playerId,
            concurrentGrant,
          );
          assertCompleteStarterGrant(result, input.affinity);
          await client.query('commit');
          return { grant: result, created: false };
        }

        const cardDefinitionIds = [
          ...creatureCandidates,
          ...powerCandidates,
        ].map((candidate) => candidate.card_definition_id);

        const ownershipInsert = await client.query<StarterCandidateRow>(
          `
            insert into public.player_cards (
              player_id,
              card_definition_id,
              source_starter_grant_id,
              acquisition_kind
            )
            select $1::uuid, definition.id, $2::uuid, 'starter'
              from public.card_definitions definition
             where definition.id = any($3::uuid[])
            returning card_definition_id::text as card_definition_id
          `,
          [input.playerId, grant.starter_grant_id, cardDefinitionIds],
        );

        assertInsertedStarterDefinitions(
          ownershipInsert.rows,
          cardDefinitionIds,
        );

        const result = await loadStarterGrantResult(
          client,
          input.playerId,
          grant,
        );

        assertCompleteStarterGrant(result, input.affinity);

        await client.query('commit');
        return { grant: result, created: true };
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
    },
  };
}

async function loadStarterGrant(
  client: StarterGrantTransactionClient,
  playerId: string,
  lock: boolean,
): Promise<StarterGrantRow | null> {
  const result = await client.query<StarterGrantRow>(
    `
      select
        id::text as starter_grant_id,
        affinity,
        granted_at
      from public.player_starter_grants
      where player_id = $1::uuid
      ${lock ? 'for update' : ''}
    `,
    [playerId],
  );

  return result.rows[0] ?? null;
}

async function loadCandidates(
  client: StarterGrantTransactionClient,
  affinity: CardAffinity,
  category: CardCategory,
  limit: number,
): Promise<StarterCandidateRow[]> {
  const result = await client.query<StarterCandidateRow>(
    `
      select id::text as card_definition_id
      from public.card_definitions
      where is_active = true
        and affinity = $1
        and category = $2
        and rarity = 'common'
      order by id
      limit $3
      for share
    `,
    [affinity, category, limit],
  );

  return result.rows;
}

async function loadStarterGrantResult(
  client: StarterGrantTransactionClient,
  playerId: string,
  grant: StarterGrantRow,
): Promise<StarterGrant> {
  const result = await client.query<StarterCardRow>(
    `
      select
        owned.id::text as owned_card_id,
        owned.acquired_at,
        definition.id::text as card_definition_id,
        definition.name,
        definition.category,
        definition.affinity,
        definition.rarity,
        definition.hp,
        definition.power,
        definition.description,
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
              'powerCost', move.power_cost
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
              'modifierDurationTurns', effect.modifier_duration_turns
            ) order by effect.position
          )
          from public.card_effects effect
          where effect.card_definition_id = definition.id
        ), '[]'::json) as effects
      from public.player_cards owned
      join public.card_definitions definition
        on definition.id = owned.card_definition_id
      where owned.player_id = $1::uuid
        and owned.source_starter_grant_id = $2::uuid
        and owned.acquisition_kind = 'starter'
      order by definition.category, definition.id
    `,
    [playerId, grant.starter_grant_id],
  );

  return {
    starterGrantId: grant.starter_grant_id,
    affinity: grant.affinity,
    grantedAt: grant.granted_at.toISOString(),
    cards: result.rows.map(mapOwnedCard),
  };
}

function mapOwnedCard(row: StarterCardRow): OwnedCard {
  return {
    ownedCardId: row.owned_card_id,
    cardDefinitionId: row.card_definition_id,
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
    acquisitionKind: 'starter',
    acquiredAt: row.acquired_at.toISOString(),
  };
}

function assertInsertedStarterDefinitions(
  inserted: StarterCandidateRow[],
  expectedDefinitionIds: string[],
): void {
  const insertedIds = new Set(
    inserted.map((card) => card.card_definition_id.toLowerCase()),
  );

  if (
    inserted.length !== 5 ||
    insertedIds.size !== 5 ||
    expectedDefinitionIds.some(
      (definitionId) => !insertedIds.has(definitionId.toLowerCase()),
    )
  ) {
    throw new Error('Starter grant did not persist all selected definitions.');
  }
}

function assertCompleteStarterGrant(
  grant: StarterGrant,
  expectedAffinity: CardAffinity,
): void {
  const creatureCount = grant.cards.filter(
    (card) => card.category === 'creature',
  ).length;
  const powerCount = grant.cards.filter(
    (card) => card.category === 'power',
  ).length;
  const definitionIds = new Set(
    grant.cards.map((card) => card.cardDefinitionId.toLowerCase()),
  );
  const ownedCardIds = new Set(
    grant.cards.map((card) => card.ownedCardId.toLowerCase()),
  );

  if (
    grant.affinity !== expectedAffinity ||
    grant.cards.length !== 5 ||
    creatureCount !== 3 ||
    powerCount !== 2 ||
    grant.cards.some(
      (card) => card.affinity !== expectedAffinity || card.rarity !== 'common',
    ) ||
    definitionIds.size !== 5 ||
    ownedCardIds.size !== 5
  ) {
    throw new Error(
      'Starter grant did not persist the approved five-card composition.',
    );
  }
}

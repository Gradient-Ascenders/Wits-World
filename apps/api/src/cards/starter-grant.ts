import type pg from 'pg';

import type {
  CardAffinity,
  CardCategory,
  CardEffect,
  CardMove,
  CardRarity,
  StarterCreaturePreview,
  StarterOption,
  StarterPowerCardPreview,
  StarterAffinity,
  StarterGrant,
  OwnedCard,
} from './card-types.js';
import { starterAffinities } from './card-types.js';
import { validateCardDefinitionForPublication } from './card-validation.js';
import { starterPackageDefinitions } from './starter-packages.js';

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
  listStarterOptions(): Promise<StarterOption[]>;
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
    super('The approved starter package is not currently available.');
    this.name = 'StarterCatalogueUnavailableError';
  }
}

export class StarterAffinityNotAllowedError extends Error {
  constructor() {
    super('Only Spark, Grit, and Wit are available as starter affinities.');
    this.name = 'StarterAffinityNotAllowedError';
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

interface StarterDefinitionRow extends pg.QueryResultRow {
  affinity: CardAffinity;
  authoring_status: string;
  card_definition_id: string;
  category: CardCategory;
  effects: CardEffect[];
  hp: number | null;
  is_active: boolean;
  moves: CardMove[];
  name: string;
  power: number | null;
  rarity: CardRarity;
}

interface StarterDefinitionRequirement {
  affinity: StarterAffinity;
  category: CardCategory;
  definitionId: string;
}

const starterProfiles: Record<
  StarterAffinity,
  Pick<StarterOption, 'description' | 'highlights' | 'title'>
> = {
  spark: {
    title: 'Pressure',
    description: 'Deal more damage now and force the pace.',
    highlights: ['High burst', 'Lower HP', 'Pressure-focused'],
  },
  grit: {
    title: 'Durability',
    description: 'Take more hits and stretch each point of Power.',
    highlights: [
      'Highest durability',
      'Efficient moves',
      'Healing / mitigation',
    ],
  },
  wit: {
    title: 'Flexibility',
    description: 'Use broader move coverage and disrupt the opponent.',
    highlights: ['Balanced stats', 'Broader coverage', 'Resource control'],
  },
};

export function createStarterGrantService(
  database: StarterGrantDatabase,
): StarterGrantService {
  return {
    async listStarterOptions() {
      const client = await database.connect();

      try {
        const packages = await loadStarterPackages(
          client,
          starterAffinities,
          false,
        );

        return starterAffinities.map((affinity) =>
          buildStarterOption(affinity, packages.get(affinity)),
        );
      } finally {
        client.release();
      }
    },

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

        if (!isStarterAffinity(input.affinity)) {
          throw new StarterAffinityNotAllowedError();
        }

        const packageCards = await loadStarterPackage(
          client,
          input.affinity,
          true,
        );

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
          ...packageCards.creatures,
          ...packageCards.powerCards,
        ].map((candidate) => candidate.card_definition_id);

        const ownershipInsert = await client.query<StarterDefinitionRow>(
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

function isStarterAffinity(
  affinity: CardAffinity,
): affinity is StarterAffinity {
  return starterAffinities.some(
    (starterAffinity) => starterAffinity === affinity,
  );
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

async function loadConfiguredDefinitions(
  client: StarterGrantTransactionClient,
  requirements: readonly StarterDefinitionRequirement[],
  lock: boolean,
): Promise<StarterDefinitionRow[]> {
  const definitionIds = requirements.map(
    (requirement) => requirement.definitionId,
  );
  const result = await client.query<StarterDefinitionRow>(
    `
      select
        definition.id::text as card_definition_id,
        definition.name,
        definition.category,
        definition.affinity,
        definition.rarity,
        definition.hp,
        definition.power,
        definition.is_active,
        definition.authoring_status,
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
      from public.card_definitions definition
      where definition.id = any($1::uuid[])
      order by array_position($1::uuid[], definition.id)
      ${lock ? 'for share of definition' : ''}
    `,
    [definitionIds],
  );

  return result.rows;
}

interface StarterPackageRows {
  creatures: StarterDefinitionRow[];
  powerCards: StarterDefinitionRow[];
}

async function loadStarterPackage(
  client: StarterGrantTransactionClient,
  affinity: StarterAffinity,
  lock: boolean,
): Promise<StarterPackageRows> {
  const packages = await loadStarterPackages(client, [affinity], lock);
  const packageCards = packages.get(affinity);

  if (!packageCards) {
    throw new StarterCatalogueUnavailableError();
  }

  return packageCards;
}

async function loadStarterPackages(
  client: StarterGrantTransactionClient,
  affinities: readonly StarterAffinity[],
  lock: boolean,
): Promise<Map<StarterAffinity, StarterPackageRows>> {
  const requirements = affinities.flatMap(buildStarterRequirements);
  const rows = await loadConfiguredDefinitions(client, requirements, lock);

  if (rows.length !== requirements.length) {
    throw new StarterCatalogueUnavailableError();
  }

  const rowsById = new Map(
    rows.map((row) => [row.card_definition_id.toLowerCase(), row]),
  );
  const packages = new Map<StarterAffinity, StarterPackageRows>();

  for (const affinity of affinities) {
    const affinityRequirements = buildStarterRequirements(affinity);
    const packageRows = affinityRequirements.map((requirement) => {
      const row = rowsById.get(requirement.definitionId.toLowerCase());

      if (!row) {
        throw new StarterCatalogueUnavailableError();
      }

      assertStarterDefinitionReady(row, requirement);
      return row;
    });

    packages.set(affinity, {
      creatures: packageRows.slice(0, 3),
      powerCards: packageRows.slice(3),
    });
  }

  return packages;
}

function buildStarterRequirements(
  affinity: StarterAffinity,
): StarterDefinitionRequirement[] {
  const packageDefinition = starterPackageDefinitions[affinity];

  return [
    ...packageDefinition.creatureDefinitionIds.map((definitionId) => ({
      affinity,
      category: 'creature' as const,
      definitionId,
    })),
    ...packageDefinition.powerCardDefinitionIds.map((definitionId) => ({
      affinity,
      category: 'power' as const,
      definitionId,
    })),
  ];
}

function assertStarterDefinitionReady(
  row: StarterDefinitionRow,
  requirement: StarterDefinitionRequirement,
): void {
  try {
    if (
      row.card_definition_id.toLowerCase() !==
        requirement.definitionId.toLowerCase() ||
      row.affinity !== requirement.affinity ||
      row.category !== requirement.category ||
      row.rarity !== 'common' ||
      !row.is_active ||
      row.authoring_status !== 'published'
    ) {
      throw new Error('Configured starter definition identity is invalid.');
    }

    validateCardDefinitionForPublication({
      affinity: row.affinity,
      category: row.category,
      effects: row.effects ?? [],
      hp: row.hp,
      moves: row.moves ?? [],
      name: row.name,
      power: row.power,
      rarity: row.rarity,
    });
  } catch {
    throw new StarterCatalogueUnavailableError();
  }
}

function buildStarterOption(
  affinity: StarterAffinity,
  packageCards: StarterPackageRows | undefined,
): StarterOption {
  if (!packageCards) {
    throw new StarterCatalogueUnavailableError();
  }

  const creatures = packageCards.creatures.map(mapStarterCreature);
  const powerCards = packageCards.powerCards.map(mapStarterPowerCard);

  if (
    creatures.some((creature) => creature.moves.length !== 4) ||
    powerCards.some((powerCard) => powerCard.effects.length === 0)
  ) {
    throw new StarterCatalogueUnavailableError();
  }

  return {
    affinity,
    ...starterProfiles[affinity],
    composition: {
      creatureCount: 3,
      powerCardCount: 2,
    },
    creatures,
    powerCards,
  };
}

function mapStarterCreature(row: StarterDefinitionRow): StarterCreaturePreview {
  if (row.hp === null || row.power === null) {
    throw new StarterCatalogueUnavailableError();
  }

  return {
    name: row.name,
    hp: row.hp,
    power: row.power,
    moves: (row.moves ?? []).map(mapStarterMove),
  };
}

function mapStarterPowerCard(
  row: StarterDefinitionRow,
): StarterPowerCardPreview {
  return {
    name: row.name,
    effects: (row.effects ?? []).map(mapStarterEffect),
  };
}

function mapStarterMove(move: CardMove) {
  return {
    position: move.position,
    name: move.name,
    moveType: move.moveType,
    effectType: move.effectType,
    effectValue: move.effectValue,
    modifierStat: move.modifierStat,
    modifierOperation: move.modifierOperation,
    modifierDurationTurns: move.modifierDurationTurns,
    powerCost: move.powerCost,
  };
}

function mapStarterEffect(effect: CardEffect) {
  return {
    position: effect.position,
    effectType: effect.effectType,
    effectValue: effect.effectValue,
    modifierStat: effect.modifierStat,
    modifierOperation: effect.modifierOperation,
    modifierDurationTurns: effect.modifierDurationTurns,
  };
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
  inserted: Pick<StarterDefinitionRow, 'card_definition_id'>[],
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

import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCardCollectionService } from '../src/cards/card-collection.js';
import {
  buildDatabaseConfig,
  loadApiEnvironment,
  type DatabaseConfig,
} from '../src/config/database.js';
import {
  createDatabasePool,
  withDatabaseClient,
} from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrations.js';
import { runSeeds } from '../src/database/seeds.js';
import { createCardTradeService } from '../src/trading/card-trade-service.js';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

interface DefinitionFixtureRow extends pg.QueryResultRow {
  id: string;
  category: 'creature' | 'power';
}

interface SelectionFixture {
  creatureDefinitionId: string;
  creatureIds: readonly string[];
  playerId: string;
  powerIds: readonly string[];
}

describe.skipIf(!runIntegrationTests)(
  'card trade selection PostgreSQL integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: pg.Pool;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_trade_selection_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const url = new URL(administrationConfig.connectionString);
      url.pathname = `/${temporaryDatabaseName}`;
      temporaryConfig = {
        ...administrationConfig,
        connectionString: url.toString(),
      };

      await runMigrations(temporaryConfig);
      await runSeeds(temporaryConfig);
      pool = createDatabasePool(temporaryConfig);
    }, 180_000);

    afterAll(async () => {
      if (pool) await pool.end();
      if (!administrationConfig || !temporaryDatabaseName) return;
      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${temporaryDatabaseName} with (force)`,
        );
      });
    }, 30_000);

    it('loads the trading catalogue from active published definitions', async () => {
      const draftDefinitionId = randomUUID();
      await pool.query(
        `insert into public.card_definitions (
           id, name, category, affinity, rarity, description
         ) values (
           $1::uuid, 'Trade Catalogue Draft', 'power', null, 'common',
           'A draft definition that must stay out of the player catalogue.'
         )`,
        [draftDefinitionId],
      );

      const expected = await pool.query<{ id: string }>(
        `select id::text
           from public.card_definitions
          where is_active
            and authoring_status = 'published'
          order by category, name, id`,
      );
      const catalogue =
        await createCardCollectionService(pool).listTradingCatalogue();

      expect(
        catalogue.map((definition) => definition.cardDefinitionId),
      ).toEqual(expected.rows.map((definition) => definition.id));
      expect(catalogue).not.toHaveLength(0);
      expect(
        catalogue.some(
          (definition) => definition.cardDefinitionId === draftDefinitionId,
        ),
      ).toBe(false);
      expect(
        catalogue.some(
          (definition) =>
            definition.category === 'creature' && definition.moves.length > 0,
        ),
      ).toBe(true);
    });

    it('evaluates real ownership, saved-deck locks, and collection minimums', async () => {
      const fixture = await insertSelectionFixture(pool);
      const service = createCardTradeService(pool);

      const validPreview = await service.previewSelection({
        playerId: fixture.playerId,
        offeredOwnedCardIds: [fixture.creatureIds[0]!],
        requestedDefinitions: [
          {
            cardDefinitionId: fixture.creatureDefinitionId,
            quantity: 1,
          },
        ],
      });

      expect(validPreview.valid).toBe(true);
      expect(validPreview.issues).toEqual([]);
      expect(copyAvailability(validPreview, fixture.creatureIds[0]!)).toBe(
        'selected_here',
      );
      expect(copyAvailability(validPreview, fixture.creatureIds[1]!)).toBe(
        'saved_deck',
      );
      expect(copyAvailability(validPreview, fixture.creatureIds[2]!)).toBe(
        'available',
      );
      expect(copyAvailability(validPreview, fixture.powerIds[0]!)).toBe(
        'collection_minimum',
      );

      const lockedPreview = await service.previewSelection({
        playerId: fixture.playerId,
        offeredOwnedCardIds: [fixture.creatureIds[1]!],
        requestedDefinitions: [
          {
            cardDefinitionId: fixture.creatureDefinitionId,
            quantity: 1,
          },
        ],
      });
      expect(lockedPreview.valid).toBe(false);
      expect(lockedPreview.issues).toContain('unavailable_copy');

      const minimumPreview = await service.previewSelection({
        playerId: fixture.playerId,
        offeredOwnedCardIds: [fixture.powerIds[0]!],
        requestedDefinitions: [
          {
            cardDefinitionId: fixture.creatureDefinitionId,
            quantity: 1,
          },
        ],
      });
      expect(minimumPreview.valid).toBe(false);
      expect(minimumPreview.issues).toContain('collection_minimum');
    });
  },
);

async function insertSelectionFixture(
  database: Pick<pg.Pool, 'query'>,
): Promise<SelectionFixture> {
  const playerId = randomUUID();
  const grantId = randomUUID();
  await database.query(
    `insert into public.players (
       id, auth_issuer, auth_subject, player_name, role
     ) values (
       $1::uuid, 'https://issuer.example/', $2, 'trade-preview-player', 'player'
     )`,
    [playerId, `auth0|trade-preview-${playerId}`],
  );
  await database.query(
    `insert into public.player_starter_grants (
       id, player_id, affinity
     ) values ($1::uuid, $2::uuid, 'wit')`,
    [grantId, playerId],
  );

  const definitions = await database.query<DefinitionFixtureRow>(
    `select id::text, category
       from public.card_definitions
      where is_active
        and authoring_status = 'published'
        and catalogue_class = 'ordinary'
      order by category, name, id`,
  );
  const selectedDefinitions = [
    ...definitions.rows
      .filter((definition) => definition.category === 'creature')
      .slice(0, 4),
    ...definitions.rows
      .filter((definition) => definition.category === 'power')
      .slice(0, 2),
  ];
  if (selectedDefinitions.length !== 6) {
    throw new Error('Trade selection fixture definitions unavailable.');
  }

  const creatureIds: string[] = [];
  const powerIds: string[] = [];
  for (const [index, definition] of selectedDefinitions.entries()) {
    const ownedCardId = randomUUID();
    await database.query(
      `insert into public.player_cards (
         id, player_id, card_definition_id, source_starter_grant_id,
         acquisition_kind, acquired_at
       ) values (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'starter',
         clock_timestamp() - ($5::integer * interval '1 minute')
       )`,
      [ownedCardId, playerId, definition.id, grantId, index],
    );
    (definition.category === 'creature' ? creatureIds : powerIds).push(
      ownedCardId,
    );
  }

  const deckId = randomUUID();
  await database.query(
    `insert into public.player_decks (id, player_id, name)
     values ($1::uuid, $2::uuid, 'Selection lock fixture')`,
    [deckId, playerId],
  );
  await database.query(
    `insert into public.player_deck_cards (
       deck_id, player_id, owned_card_id, position
     ) values ($1::uuid, $2::uuid, $3::uuid, 1)`,
    [deckId, playerId, creatureIds[1]],
  );

  return {
    creatureDefinitionId: selectedDefinitions[0]!.id,
    creatureIds,
    playerId,
    powerIds,
  };
}

function copyAvailability(
  preview: Awaited<
    ReturnType<ReturnType<typeof createCardTradeService>['previewSelection']>
  >,
  ownedCardId: string,
) {
  return preview.ownedCopies.find((copy) => copy.ownedCardId === ownedCardId)
    ?.availability;
}

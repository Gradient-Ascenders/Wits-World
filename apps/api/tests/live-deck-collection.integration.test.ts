import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCardCollectionService } from '../src/cards/card-collection.js';
import { createDeckService } from '../src/cards/deck-service.js';
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

const PLAYER = 'c1000000-0000-4000-8000-000000000001';
const OTHER = 'c1000000-0000-4000-8000-000000000002';
const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runDatabaseTests)(
  'Live deck-scoped collection persistence',
  () => {
    let administration: DatabaseConfig;
    let databaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;
    let deckId: string;
    let ownedIds: string[];

    beforeAll(async () => {
      loadApiEnvironment();
      administration = buildDatabaseConfig({ target: 'test' });
      databaseName = `wits_live_deck_read_${Date.now()}_${process.pid}`;
      await withDatabaseClient(administration, async (client) => {
        await client.query(`create database ${databaseName}`);
      });
      const url = new URL(administration.connectionString);
      url.pathname = `/${databaseName}`;
      const config = { ...administration, connectionString: url.toString() };
      await runMigrations(config);
      pool = createDatabasePool(config);
      await pool.query(
        `
      insert into public.players (id, auth_issuer, auth_subject, role, lifecycle_status)
      values ($1, 'https://fixture.invalid/', 'auth0|live-deck-one', 'player', 'active'),
             ($2, 'https://fixture.invalid/', 'auth0|live-deck-two', 'player', 'active')
    `,
        [PLAYER, OTHER],
      );
      await pool.query(
        `
      insert into public.player_starter_grants (id, player_id, affinity)
      values ('c2000000-0000-4000-8000-000000000001', $1, 'wit'),
             ('c2000000-0000-4000-8000-000000000002', $2, 'wit')
    `,
        [PLAYER, OTHER],
      );
      await pool.query(`
      insert into public.card_definitions (id, name, category, affinity, rarity, hp, power, description)
      select ('c3000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
             'Live read fixture ' || n,
             case when n in (4, 5) then 'power' else 'creature' end,
             case when n in (4, 5) then null else 'wit' end,
             'common',
             case when n in (4, 5) then null else 100 end,
             case when n in (4, 5) then null else 12 end,
             'Player-safe synthetic collection fixture'
      from generate_series(1, 250) n
    `);
      await pool.query(
        `
      insert into public.player_cards (id, player_id, card_definition_id, source_starter_grant_id, acquisition_kind)
      select ('c4000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
             $1, ('c3000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
             'c2000000-0000-4000-8000-000000000001', 'starter'
      from generate_series(1, 250) n
    `,
        [PLAYER],
      );
      await pool.query(`
      insert into public.card_moves (id, card_definition_id, position, name, move_type, effect_type, effect_value, power_cost)
      select ('c7000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
             ('c3000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
             1, 'Fixture move', 'basic', 'damage', 20, 0
      from generate_series(1, 250) n where n not in (4, 5)
    `);
      // Use a separate owner for the privacy check; owned-copy identifiers never
      // authorize access to the other player's deck or catalogue metadata.
      await pool.query(
        `
      insert into public.player_cards (id, player_id, card_definition_id, source_starter_grant_id, acquisition_kind)
      select ('c5000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
             $1, ('c3000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
             'c2000000-0000-4000-8000-000000000002', 'starter'
      from generate_series(1, 5) n
    `,
        [OTHER],
      );
      ownedIds = Array.from(
        { length: 5 },
        (_, index) =>
          `c4000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      );
      const deck = await createDeckService(pool).createDeck({
        playerId: PLAYER,
        name: 'Live read deck',
        ownedCardIds: ownedIds,
      });
      deckId = deck.deckId;
    }, 120_000);

    afterAll(async () => {
      if (pool) await pool.end();
      if (administration && databaseName) {
        await withDatabaseClient(administration, async (client) => {
          await client.query(
            `drop database if exists ${databaseName} with (force)`,
          );
        });
      }
    }, 30_000);

    it('projects only the five owned deck copies, matching their full collection metadata', async () => {
      const service = createCardCollectionService(pool);
      const all = await service.listOwnedCards(PLAYER);
      const scoped = await service.listOwnedCards(PLAYER, false, deckId);
      expect(all).toHaveLength(250);
      expect(scoped).toHaveLength(5);
      expect(scoped).toEqual(
        all.filter((card) => ownedIds.includes(card.ownedCardId)),
      );
      expect(await service.listOwnedCards(PLAYER, true, deckId)).toEqual(
        scoped,
      );
    });

    it('does not distinguish absent decks from decks belonging to another player', async () => {
      const service = createCardCollectionService(pool);
      expect(await service.listOwnedCards(OTHER, false, deckId)).toEqual([]);
      expect(
        await service.listOwnedCards(
          PLAYER,
          false,
          'c6000000-0000-4000-8000-000000000001',
        ),
      ).toEqual([]);
    });

    it('reads fresh membership after a deck edit and returns no copies after deletion', async () => {
      const decks = createDeckService(pool);
      const cards = createCardCollectionService(pool);
      const temporary = await decks.createDeck({
        playerId: PLAYER,
        name: 'Fresh deck',
        ownedCardIds: ownedIds,
      });
      const replacement = 'c4000000-0000-4000-8000-000000000006';
      try {
        await decks.updateDeck({
          playerId: PLAYER,
          deckId: temporary.deckId,
          name: 'Edited deck',
          ownedCardIds: [replacement, ...ownedIds.slice(1)],
        });
        const read = await cards.listOwnedCards(
          PLAYER,
          false,
          temporary.deckId,
        );
        expect(read.map((card) => card.ownedCardId)).toContain(replacement);
        expect(read.map((card) => card.ownedCardId)).not.toContain(ownedIds[0]);
        await decks.deleteDeck(PLAYER, temporary.deckId);
        expect(
          await cards.listOwnedCards(PLAYER, false, temporary.deckId),
        ).toEqual([]);
      } finally {
        await pool.query(
          'delete from public.player_decks where id = $1 and player_id = $2',
          [temporary.deckId, PLAYER],
        );
      }
    });

    it('reads a coherent committed membership while another client edits the deck', async () => {
      const decks = createDeckService(pool);
      const cards = createCardCollectionService(pool);
      const temporary = await decks.createDeck({
        playerId: PLAYER,
        name: 'Concurrent read deck',
        ownedCardIds: ownedIds,
      });
      const replacement = 'c4000000-0000-4000-8000-000000000006';
      const writer = await pool.connect();
      let transactionOpen = false;
      try {
        await writer.query('begin');
        transactionOpen = true;
        await writer.query(
          'delete from public.player_deck_cards where deck_id = $1 and position = 1',
          [temporary.deckId],
        );
        const during = await cards.listOwnedCards(
          PLAYER,
          false,
          temporary.deckId,
        );
        expect(during).toHaveLength(5);
        expect(during.map((card) => card.ownedCardId)).toContain(ownedIds[0]);
        await writer.query(
          'insert into public.player_deck_cards (deck_id, player_id, owned_card_id, position) values ($1, $2, $3, 1)',
          [temporary.deckId, PLAYER, replacement],
        );
        await writer.query('commit');
        transactionOpen = false;
        const after = await cards.listOwnedCards(
          PLAYER,
          false,
          temporary.deckId,
        );
        expect(after).toHaveLength(5);
        expect(after.map((card) => card.ownedCardId)).toContain(replacement);
        expect(after.map((card) => card.ownedCardId)).not.toContain(
          ownedIds[0],
        );
      } finally {
        if (transactionOpen) await writer.query('rollback');
        writer.release();
        await decks.deleteDeck(PLAYER, temporary.deckId);
      }
    }, 30_000);

    it('measures equivalent warm unscoped and deck-scoped reads without changing acquisition boundaries', async () => {
      const samples: {
        scope: string;
        statements: number;
        checkoutMs: number;
        holdMs: number;
        totalMs: number;
        bytes: number;
        rows: number;
      }[] = [];
      for (let run = 0; run < 4; run++) {
        for (const scoped of [false, true]) {
          let statements = 0;
          let checkoutMs = 0;
          let holdMs = 0;
          const service = createCardCollectionService({
            async query(statement, values) {
              statements++;
              const acquisitionStarted = performance.now();
              const client = await pool.connect();
              checkoutMs += performance.now() - acquisitionStarted;
              const heldAt = performance.now();
              try {
                return await client.query(statement, values);
              } finally {
                holdMs += performance.now() - heldAt;
                client.release();
              }
            },
          });
          const started = performance.now();
          const read = await service.listOwnedCards(
            PLAYER,
            false,
            scoped ? deckId : undefined,
          );
          expect(statements).toBe(1);
          expect(read).toHaveLength(scoped ? 5 : 250);
          if (run > 0)
            samples.push({
              scope: scoped ? 'deck' : 'collection',
              statements,
              checkoutMs,
              holdMs,
              totalMs: performance.now() - started,
              bytes: Buffer.byteLength(
                JSON.stringify({ cards: read, requestId: 'fixture-cards' }),
              ),
              rows: read.length,
            });
        }
      }
      console.info(
        'Live deck read disposable PostgreSQL samples',
        JSON.stringify(samples),
      );
      if (process.env.LIVE_DECK_MEASUREMENT_FILE) {
        await writeFile(
          process.env.LIVE_DECK_MEASUREMENT_FILE,
          JSON.stringify(samples, null, 2),
        );
      }
    }, 30_000);
  },
);

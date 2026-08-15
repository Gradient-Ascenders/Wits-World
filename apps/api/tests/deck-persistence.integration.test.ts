import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

const PLAYER_ID = '81000000-0000-4000-8000-000000000001';
const OTHER_PLAYER_ID = '81000000-0000-4000-8000-000000000002';

const PLAYER_GRANT_ID = '82000000-0000-4000-8000-000000000001';
const OTHER_GRANT_ID = '82000000-0000-4000-8000-000000000002';

const FIRST_DECK_ID = '83000000-0000-4000-8000-000000000001';
const SECOND_DECK_ID = '83000000-0000-4000-8000-000000000002';
const OTHER_DECK_ID = '83000000-0000-4000-8000-000000000003';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'saved deck persistence integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;

    beforeAll(async () => {
      loadApiEnvironment();

      administrationConfig = buildDatabaseConfig({
        target: 'test',
      });

      temporaryDatabaseName = `wits_quest_decks_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;

      temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };

      await runMigrations(temporaryConfig);

      pool = createDatabasePool(temporaryConfig);

      await seedPlayerCollection({
        playerId: PLAYER_ID,
        grantId: PLAYER_GRANT_ID,
        subject: 'deck-player',
        cardNumberStart: 1,
        cardCount: 5,
      });

      await seedPlayerCollection({
        playerId: OTHER_PLAYER_ID,
        grantId: OTHER_GRANT_ID,
        subject: 'deck-other-player',
        cardNumberStart: 6,
        cardCount: 1,
      });

      await pool.query(
        `
          insert into public.player_decks (
            id,
            player_id,
            name
          )
          values
            ($1, $2, 'First deck'),
            ($3, $2, 'Second deck'),
            ($4, $5, 'Other player deck')
        `,
        [
          FIRST_DECK_ID,
          PLAYER_ID,
          SECOND_DECK_ID,
          OTHER_DECK_ID,
          OTHER_PLAYER_ID,
        ],
      );
    }, 45_000);

    afterAll(async () => {
      if (pool) {
        await pool.end();
      }

      if (!administrationConfig || !temporaryDatabaseName) {
        return;
      }

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${temporaryDatabaseName} with (force)`,
        );
      });
    }, 30_000);

    it('persists ordered owned copies in a saved deck', async () => {
      const ownedCards = await playerOwnedCardIds(PLAYER_ID);

      expect(ownedCards).toHaveLength(5);

      for (const [index, ownedCardId] of ownedCards.entries()) {
        await pool.query(
          `
            insert into public.player_deck_cards (
              deck_id,
              player_id,
              owned_card_id,
              position
            )
            values ($1, $2, $3, $4)
          `,
          [FIRST_DECK_ID, PLAYER_ID, ownedCardId, index + 1],
        );
      }

      const persisted = await pool.query<{
        owned_card_id: string;
        position: number;
      }>(
        `
          select
            owned_card_id::text,
            position
          from public.player_deck_cards
          where deck_id = $1::uuid
            and player_id = $2::uuid
          order by position
        `,
        [FIRST_DECK_ID, PLAYER_ID],
      );

      expect(persisted.rows.map((row) => row.position)).toEqual([
        1, 2, 3, 4, 5,
      ]);

      expect(persisted.rows.map((row) => row.owned_card_id)).toEqual(
        ownedCards,
      );
    });

    it('allows the same owned copy to be reused across saved decks', async () => {
      const ownedCards = await playerOwnedCardIds(PLAYER_ID);

      for (const [index, ownedCardId] of ownedCards.entries()) {
        await pool.query(
          `
            insert into public.player_deck_cards (
              deck_id,
              player_id,
              owned_card_id,
              position
            )
            values ($1, $2, $3, $4)
          `,
          [SECOND_DECK_ID, PLAYER_ID, ownedCardId, index + 1],
        );
      }

      const reused = await pool.query<{
        membership_count: number;
      }>(
        `
          select count(*)::int as membership_count
          from public.player_deck_cards
          where player_id = $1::uuid
            and owned_card_id = $2::uuid
        `,
        [PLAYER_ID, ownedCards[0]],
      );

      expect(reused.rows[0]?.membership_count).toBe(2);
    });

    it('rejects the same owned copy twice in one deck', async () => {
      const ownedCards = await playerOwnedCardIds(PLAYER_ID);
      const ownedCardId = ownedCards[0];

      if (!ownedCardId) {
        throw new Error('Expected an owned card.');
      }

      await expect(
        pool.query(
          `
            insert into public.player_deck_cards (
              deck_id,
              player_id,
              owned_card_id,
              position
            )
            values ($1, $2, $3, 5)
          `,
          [FIRST_DECK_ID, PLAYER_ID, ownedCardId],
        ),
      ).rejects.toThrow();
    });

    it('rejects another player owned card from a deck', async () => {
      const otherOwnedCards = await playerOwnedCardIds(OTHER_PLAYER_ID);

      const otherOwnedCardId = otherOwnedCards[0];

      if (!otherOwnedCardId) {
        throw new Error('Expected the other player to own a card.');
      }

      await pool.query(
        `
          delete from public.player_deck_cards
          where deck_id = $1::uuid
            and position = 5
        `,
        [FIRST_DECK_ID],
      );

      await expect(
        pool.query(
          `
            insert into public.player_deck_cards (
              deck_id,
              player_id,
              owned_card_id,
              position
            )
            values ($1, $2, $3, 5)
          `,
          [FIRST_DECK_ID, PLAYER_ID, otherOwnedCardId],
        ),
      ).rejects.toThrow();

      const count = await pool.query<{
        card_count: number;
      }>(
        `
          select count(*)::int as card_count
          from public.player_deck_cards
          where deck_id = $1::uuid
        `,
        [FIRST_DECK_ID],
      );

      expect(count.rows[0]?.card_count).toBe(4);

      const playerCards = await playerOwnedCardIds(PLAYER_ID);
      const fifthCard = playerCards[4];

      if (!fifthCard) {
        throw new Error('Expected a fifth owned card.');
      }

      await pool.query(
        `
          insert into public.player_deck_cards (
            deck_id,
            player_id,
            owned_card_id,
            position
          )
          values ($1, $2, $3, 5)
        `,
        [FIRST_DECK_ID, PLAYER_ID, fifthCard],
      );
    });

    it.each([0, 6])(
      'rejects deck position %s outside the Basic five-card range',
      async (position) => {
        const temporaryDeckId =
          position === 0
            ? '83000000-0000-4000-8000-000000000010'
            : '83000000-0000-4000-8000-000000000011';

        await pool.query(
          `
            insert into public.player_decks (
              id,
              player_id,
              name
            )
            values ($1, $2, $3)
          `,
          [temporaryDeckId, PLAYER_ID, `Position ${position}`],
        );

        const ownedCards = await playerOwnedCardIds(PLAYER_ID);

        await expect(
          pool.query(
            `
              insert into public.player_deck_cards (
                deck_id,
                player_id,
                owned_card_id,
                position
              )
              values ($1, $2, $3, $4)
            `,
            [temporaryDeckId, PLAYER_ID, ownedCards[0], position],
          ),
        ).rejects.toThrow();
      },
    );

    it('allows only one selected deck per player', async () => {
      await pool.query(
        `
          insert into public.player_deck_selections (
            player_id,
            deck_id
          )
          values ($1, $2)
        `,
        [PLAYER_ID, FIRST_DECK_ID],
      );

      await expect(
        pool.query(
          `
            insert into public.player_deck_selections (
              player_id,
              deck_id
            )
            values ($1, $2)
          `,
          [PLAYER_ID, SECOND_DECK_ID],
        ),
      ).rejects.toThrow();

      await pool.query(
        `
          update public.player_deck_selections
          set
            deck_id = $2,
            selected_at = now()
          where player_id = $1
        `,
        [PLAYER_ID, SECOND_DECK_ID],
      );

      const selection = await pool.query<{
        deck_id: string;
      }>(
        `
          select deck_id::text
          from public.player_deck_selections
          where player_id = $1::uuid
        `,
        [PLAYER_ID],
      );

      expect(selection.rows).toEqual([
        {
          deck_id: SECOND_DECK_ID,
        },
      ]);
    });

    it('rejects selecting another player deck', async () => {
      await expect(
        pool.query(
          `
            insert into public.player_deck_selections (
              player_id,
              deck_id
            )
            values ($1, $2)
          `,
          [OTHER_PLAYER_ID, FIRST_DECK_ID],
        ),
      ).rejects.toThrow();
    });

    it('deleting a saved deck removes memberships and selection but preserves owned cards', async () => {
      const before = await playerOwnedCardIds(PLAYER_ID);

      await pool.query(
        `
          delete from public.player_decks
          where id = $1::uuid
            and player_id = $2::uuid
        `,
        [SECOND_DECK_ID, PLAYER_ID],
      );

      const deckCards = await pool.query<{
        count: number;
      }>(
        `
          select count(*)::int as count
          from public.player_deck_cards
          where deck_id = $1::uuid
        `,
        [SECOND_DECK_ID],
      );

      const selection = await pool.query<{
        count: number;
      }>(
        `
          select count(*)::int as count
          from public.player_deck_selections
          where player_id = $1::uuid
        `,
        [PLAYER_ID],
      );

      expect(deckCards.rows[0]?.count).toBe(0);
      expect(selection.rows[0]?.count).toBe(0);

      expect(await playerOwnedCardIds(PLAYER_ID)).toEqual(before);
    });

    async function playerOwnedCardIds(playerId: string): Promise<string[]> {
      const result = await pool.query<{
        owned_card_id: string;
      }>(
        `
          select id::text as owned_card_id
          from public.player_cards
          where player_id = $1::uuid
          order by acquired_at, id
        `,
        [playerId],
      );

      return result.rows.map((row) => row.owned_card_id);
    }

    async function seedPlayerCollection({
      playerId,
      grantId,
      subject,
      cardNumberStart,
      cardCount,
    }: {
      playerId: string;
      grantId: string;
      subject: string;
      cardNumberStart: number;
      cardCount: number;
    }): Promise<void> {
      await pool.query(
        `
          insert into public.players (
            id,
            auth_issuer,
            auth_subject,
            role,
            lifecycle_status
          )
          values (
            $1,
            'https://auth.example.test/',
            $2,
            'player',
            'active'
          )
        `,
        [playerId, `auth0|${subject}`],
      );

      await pool.query(
        `
          insert into public.player_starter_grants (
            id,
            player_id,
            affinity
          )
          values ($1, $2, 'spark')
        `,
        [grantId, playerId],
      );

      for (let offset = 0; offset < cardCount; offset += 1) {
        const number = cardNumberStart + offset;

        const definitionId = `84000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

        const ownedCardId = `85000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

        const category = number % 5 <= 2 ? 'creature' : 'power';

        await pool.query(
          `
            insert into public.card_definitions (
              id,
              name,
              category,
              affinity,
              rarity,
              hp,
              power,
              description
            )
            values (
              $1,
              $2,
              $3,
              'spark',
              'common',
              $4,
              $5,
              $6
            )
          `,
          [
            definitionId,
            `Deck test card ${number}`,
            category,
            category === 'creature' ? 100 : null,
            category === 'creature' ? 10 : null,
            `Deck persistence fixture ${number}`,
          ],
        );

        await pool.query(
          `
            insert into public.player_cards (
              id,
              player_id,
              card_definition_id,
              source_starter_grant_id,
              acquisition_kind
            )
            values ($1, $2, $3, $4, 'starter')
          `,
          [ownedCardId, playerId, definitionId, grantId],
        );
      }
    }
  },
);

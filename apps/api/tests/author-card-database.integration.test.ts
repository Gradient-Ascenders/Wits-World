import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthorCardNotReadyError,
  AuthorCardStateConflictError,
  createAuthorCardService,
} from '../src/cards/author-card-service.js';
import { InvalidCardDefinitionError } from '../src/cards/card-validation.js';
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

const AUTHOR_ONE_ID = 'a1000000-0000-4000-8000-000000000001';
const AUTHOR_TWO_ID = 'a1000000-0000-4000-8000-000000000002';
const PLAYER_ID = 'a1000000-0000-4000-8000-000000000003';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'author card database integration',
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

      temporaryDatabaseName = `wits_quest_author_cards_${Date.now()}_${process.pid}`;

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

      await pool.query(
        `
          insert into public.players (
            id,
            auth_issuer,
            auth_subject,
            role
          )
          values
            (
              $1::uuid,
              'https://auth.example.test/',
              'author-card-one',
              'author'
            ),
            (
              $2::uuid,
              'https://auth.example.test/',
              'author-card-two',
              'author'
            ),
            (
              $3::uuid,
              'https://auth.example.test/',
              'author-card-player',
              'player'
            )
        `,
        [AUTHOR_ONE_ID, AUTHOR_TWO_ID, PLAYER_ID],
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

    it('creates an inactive Creature draft and records the acting Author', async () => {
      const service = createAuthorCardService(pool);

      const created = await service.createCard({
        actorPlayerId: AUTHOR_ONE_ID,
        name: '  Campus Owl  ',
        category: 'creature',
        affinity: 'wit',
        rarity: 'common',
        hp: 120,
        power: 20,
        description: '  A scholarly East Campus creature.  ',
        imageUrl: '  https://example.test/cards/campus-owl.png  ',
        moves: [
          {
            position: 1,
            name: '  Quick Peck  ',
            moveType: 'basic',
            effectType: 'damage',
            effectValue: 12,
            powerCost: 1,
          },
        ],
        effects: [],
      });

      expect(created).toMatchObject({
        name: 'Campus Owl',
        category: 'creature',
        affinity: 'wit',
        rarity: 'common',
        hp: 120,
        power: 20,
        description: 'A scholarly East Campus creature.',
        imageUrl: 'https://example.test/cards/campus-owl.png',
        authoringStatus: 'draft',
        isActive: false,
      });

      expect(created.moves).toHaveLength(1);
      expect(created.moves[0]).toMatchObject({
        position: 1,
        name: 'Quick Peck',
        moveType: 'basic',
        effectType: 'damage',
        effectValue: 12,
        powerCost: 1,
      });

      expect(created.effects).toEqual([]);

      const audit = await pool.query<{
        actor_player_id: string;
        entity_type: string;
        action: string;
      }>(
        `
            select
              actor_player_id::text,
              entity_type,
              action
            from public.author_content_audit
            where entity_type = 'card'
              and entity_id = $1::uuid
              and action = 'create'
          `,
        [created.id],
      );

      expect(audit.rows).toEqual([
        {
          actor_player_id: AUTHOR_ONE_ID,
          entity_type: 'card',
          action: 'create',
        },
      ]);

      const listed = await service.listCards();

      expect(listed.some((card) => card.id === created.id)).toBe(true);
    }, 45_000);

    it('rejects blank optional metadata before persistence', async () => {
      const service = createAuthorCardService(pool);

      const invalidCards = [
        {
          name: 'Blank Description Card',
          description: '   ',
          imageUrl: null,
        },
        {
          name: 'Blank Image URL Card',
          description: null,
          imageUrl: '   ',
        },
      ];

      for (const invalid of invalidCards) {
        await expect(
          service.createCard({
            actorPlayerId: AUTHOR_ONE_ID,
            name: invalid.name,
            category: 'creature',
            affinity: 'wit',
            rarity: 'common',
            hp: 100,
            power: 10,
            description: invalid.description,
            imageUrl: invalid.imageUrl,
            moves: [
              {
                position: 1,
                name: 'Valid Move',
                moveType: 'basic',
                effectType: 'damage',
                effectValue: 10,
                powerCost: 1,
              },
            ],
            effects: [],
          }),
        ).rejects.toBeInstanceOf(InvalidCardDefinitionError);
      }

      const persisted = await pool.query<{
        card_count: number;
      }>(
        `
          select count(*)::int as card_count
          from public.card_definitions
          where name in (
            'Blank Description Card',
            'Blank Image URL Card'
          )
        `,
      );

      expect(persisted.rows[0]?.card_count).toBe(0);
    });

    it('allows another Author to replace a Creature draft with a Power definition', async () => {
      const service = createAuthorCardService(pool);

      const created = await service.createCard({
        actorPlayerId: AUTHOR_ONE_ID,
        name: 'Mutable Author Card',
        category: 'creature',
        affinity: 'spark',
        rarity: 'rare',
        hp: 100,
        power: 15,
        description: 'Originally a Creature.',
        imageUrl: null,
        moves: [
          {
            position: 1,
            name: 'Spark Strike',
            moveType: 'spark',
            effectType: 'damage',
            effectValue: 15,
            powerCost: 2,
          },
        ],
        effects: [],
      });

      const updated = await service.updateCard({
        actorPlayerId: AUTHOR_TWO_ID,
        cardId: created.id,
        name: 'Mutable Author Power',
        category: 'power',
        affinity: 'spirit',
        rarity: 'epic',
        hp: null,
        power: null,
        description: 'Now a Power card.',
        imageUrl: 'https://example.test/cards/power.png',
        moves: [],
        effects: [
          {
            position: 1,
            effectType: 'heal',
            effectValue: 20,
          },
        ],
      });

      expect(updated).toMatchObject({
        id: created.id,
        name: 'Mutable Author Power',
        category: 'power',
        affinity: 'spirit',
        rarity: 'epic',
        hp: null,
        power: null,
        authoringStatus: 'draft',
        isActive: false,
      });

      expect(updated.moves).toEqual([]);
      expect(updated.effects).toHaveLength(1);
      expect(updated.effects[0]).toMatchObject({
        position: 1,
        effectType: 'heal',
        effectValue: 20,
      });

      const children = await pool.query<{
        effect_count: number;
        move_count: number;
      }>(
        `
            select
              (
                select count(*)::int
                from public.card_moves
                where card_definition_id = $1::uuid
              ) as move_count,
              (
                select count(*)::int
                from public.card_effects
                where card_definition_id = $1::uuid
              ) as effect_count
          `,
        [created.id],
      );

      expect(children.rows[0]).toEqual({
        move_count: 0,
        effect_count: 1,
      });

      const audit = await pool.query<{
        actor_player_id: string;
      }>(
        `
            select actor_player_id::text
            from public.author_content_audit
            where entity_type = 'card'
              and entity_id = $1::uuid
              and action = 'edit'
          `,
        [created.id],
      );

      expect(audit.rows).toEqual([
        {
          actor_player_id: AUTHOR_TWO_ID,
        },
      ]);
    }, 45_000);

    it('rejects an invalid card definition without persisting content', async () => {
      const service = createAuthorCardService(pool);
      const name = 'Invalid Empty-Move Creature';

      await expect(
        service.createCard({
          actorPlayerId: AUTHOR_ONE_ID,
          name,
          category: 'creature',
          affinity: 'grit',
          rarity: 'common',
          hp: 100,
          power: 10,
          description: null,
          imageUrl: null,
          moves: [],
          effects: [],
        }),
      ).rejects.toBeInstanceOf(InvalidCardDefinitionError);

      const persisted = await pool.query<{
        card_count: number;
      }>(
        `
            select count(*)::int as card_count
            from public.card_definitions
            where name = $1
          `,
        [name],
      );

      expect(persisted.rows[0]?.card_count).toBe(0);
    }, 45_000);

    it('rolls back card creation when the audit actor is a Player', async () => {
      const service = createAuthorCardService(pool);
      const name = 'Player Audit Rollback Card';

      await expect(
        service.createCard({
          actorPlayerId: PLAYER_ID,
          name,
          category: 'power',
          affinity: 'mystic',
          rarity: 'common',
          hp: null,
          power: null,
          description: 'This transaction must roll back.',
          imageUrl: null,
          moves: [],
          effects: [
            {
              position: 1,
              effectType: 'heal',
              effectValue: 10,
            },
          ],
        }),
      ).rejects.toThrow();

      const persisted = await pool.query<{
        card_count: number;
      }>(
        `
            select count(*)::int as card_count
            from public.card_definitions
            where name = $1
          `,
        [name],
      );

      expect(persisted.rows[0]?.card_count).toBe(0);
    }, 45_000);

    it('refuses to publish an incomplete draft persisted outside the Author service', async () => {
      const service = createAuthorCardService(pool);

      const inserted = await pool.query<{
        card_id: string;
      }>(
        `
            insert into public.card_definitions (
              name,
              category,
              affinity,
              rarity,
              hp,
              power,
              description
            )
            values (
              'Incomplete Legacy Draft',
              'creature',
              'wit',
              'common',
              100,
              10,
              'No moves have been configured.'
            )
            returning id::text as card_id
          `,
      );

      const cardId = inserted.rows[0]?.card_id;

      if (!cardId) {
        throw new Error('Expected incomplete draft card.');
      }

      await expect(
        service.publishCard(AUTHOR_ONE_ID, cardId),
      ).rejects.toBeInstanceOf(AuthorCardNotReadyError);

      const persisted = await pool.query<{
        authoring_status: string;
        is_active: boolean;
      }>(
        `
            select
              authoring_status,
              is_active
            from public.card_definitions
            where id = $1::uuid
          `,
        [cardId],
      );

      expect(persisted.rows).toEqual([
        {
          authoring_status: 'draft',
          is_active: false,
        },
      ]);
    }, 45_000);

    it('publishes a complete card into the active catalogue and freezes its content', async () => {
      const service = createAuthorCardService(pool);

      const created = await service.createCard({
        actorPlayerId: AUTHOR_ONE_ID,
        name: 'Published Author Creature',
        category: 'creature',
        affinity: 'grit',
        rarity: 'common',
        hp: 140,
        power: 25,
        description: 'Ready for the player catalogue.',
        imageUrl: null,
        moves: [
          {
            position: 1,
            name: 'Grit Slam',
            moveType: 'grit',
            effectType: 'damage',
            effectValue: 18,
            powerCost: 2,
          },
        ],
        effects: [],
      });

      const published = await service.publishCard(AUTHOR_TWO_ID, created.id);

      expect(published).toMatchObject({
        id: created.id,
        authoringStatus: 'published',
        isActive: true,
      });

      const catalogue = await pool.query<{
        available_count: number;
      }>(
        `
            select count(*)::int as available_count
            from public.card_definitions
            where id = $1::uuid
              and authoring_status = 'published'
              and is_active = true
              and rarity = 'common'
          `,
        [created.id],
      );

      expect(catalogue.rows[0]?.available_count).toBe(1);

      await expect(
        service.updateCard({
          actorPlayerId: AUTHOR_ONE_ID,
          cardId: created.id,
          name: 'Illegal Service Edit',
          category: 'creature',
          affinity: 'grit',
          rarity: 'common',
          hp: 150,
          power: 30,
          description: 'Must not change.',
          imageUrl: null,
          moves: [
            {
              position: 1,
              name: 'Changed Move',
              moveType: 'grit',
              effectType: 'damage',
              effectValue: 20,
              powerCost: 2,
            },
          ],
          effects: [],
        }),
      ).rejects.toBeInstanceOf(AuthorCardStateConflictError);

      await expect(
        pool.query(
          `
              update public.card_definitions
              set name = 'Illegal Direct Edit',
                  updated_at = now()
              where id = $1::uuid
            `,
          [created.id],
        ),
      ).rejects.toThrow();

      await expect(
        pool.query(
          `
              delete from public.card_moves
              where card_definition_id = $1::uuid
            `,
          [created.id],
        ),
      ).rejects.toThrow();

      const audit = await pool.query<{
        actor_player_id: string;
      }>(
        `
            select actor_player_id::text
            from public.author_content_audit
            where entity_type = 'card'
              and entity_id = $1::uuid
              and action = 'publish'
          `,
        [created.id],
      );

      expect(audit.rows).toEqual([
        {
          actor_player_id: AUTHOR_TWO_ID,
        },
      ]);
    }, 45_000);

    it('retires a published card without allowing republication', async () => {
      const service = createAuthorCardService(pool);

      const created = await service.createCard({
        actorPlayerId: AUTHOR_ONE_ID,
        name: 'Retirable Author Power',
        category: 'power',
        affinity: 'spark',
        rarity: 'rare',
        hp: null,
        power: null,
        description: 'A Power card used to test retirement.',
        imageUrl: null,
        moves: [],
        effects: [
          {
            position: 1,
            effectType: 'buff',
            effectValue: 2,
            modifierStat: 'damage_multiplier',
            modifierOperation: 'multiply',
            modifierDurationTurns: 2,
          },
        ],
      });

      await service.publishCard(AUTHOR_ONE_ID, created.id);

      const retired = await service.retireCard(AUTHOR_TWO_ID, created.id);

      expect(retired).toMatchObject({
        id: created.id,
        authoringStatus: 'retired',
        isActive: false,
      });

      await expect(
        service.publishCard(AUTHOR_ONE_ID, created.id),
      ).rejects.toBeInstanceOf(AuthorCardStateConflictError);

      await expect(
        pool.query(
          `
              update public.card_definitions
              set authoring_status = 'published',
                  is_active = true,
                  updated_at = now()
              where id = $1::uuid
            `,
          [created.id],
        ),
      ).rejects.toThrow();

      const persisted = await pool.query<{
        authoring_status: string;
        is_active: boolean;
      }>(
        `
            select
              authoring_status,
              is_active
            from public.card_definitions
            where id = $1::uuid
          `,
        [created.id],
      );

      expect(persisted.rows).toEqual([
        {
          authoring_status: 'retired',
          is_active: false,
        },
      ]);

      const retireAudit = await pool.query<{
        actor_player_id: string;
      }>(
        `
            select actor_player_id::text
            from public.author_content_audit
            where entity_type = 'card'
              and entity_id = $1::uuid
              and action = 'retire'
          `,
        [created.id],
      );

      expect(retireAudit.rows).toEqual([
        {
          actor_player_id: AUTHOR_TWO_ID,
        },
      ]);
    }, 45_000);
  },
);

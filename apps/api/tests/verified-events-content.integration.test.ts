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
import { runVerifiedEventSeeds } from '../src/database/seeds.js';
import { selectChallengeQuestions } from '../src/challenges/challenge-selection.js';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'verified event content integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_verified_content_${Date.now()}_${process.pid}`;

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
      await runVerifiedEventSeeds(temporaryConfig);
      await runVerifiedEventSeeds(temporaryConfig);
      pool = createDatabasePool(temporaryConfig);
    }, 120_000);

    afterAll(async () => {
      if (pool) await pool.end();
      if (!administrationConfig || !temporaryDatabaseName) return;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${temporaryDatabaseName} with (force)`,
        );
      });
    }, 30_000);

    it('seeds exactly ten events, five challenges per format, and one hundred questions', async () => {
      const result = await pool.query<{
        event_count: string;
        mcq_count: string;
        ordering_count: string;
        question_count: string;
      }>(`
      select
        count(distinct event.id)::text as event_count,
        count(distinct challenge.id) filter (where challenge.format = 'multiple_choice')::text as mcq_count,
        count(distinct challenge.id) filter (where challenge.format = 'ordering')::text as ordering_count,
        count(distinct question.id)::text as question_count
      from public.events event
      join public.event_challenges challenge on challenge.event_id = event.id
      join public.challenge_questions question on question.challenge_id = challenge.id
      where event.id::text = md5('wits-world-verified-event:' ||
        case event.title
          when 'Wits Foundations Quest' then 'foundations'
          when 'Wits Campus Heritage Quest' then 'heritage'
          when 'Wits Discovery Quest' then 'discovery'
          when 'Wits Arts and Culture Quest' then 'arts'
          when 'Wits Civic and Alumni Quest' then 'civic'
          when 'Ordering Wits: Early Years' then 'early-order'
          when 'Ordering Wits: Science and Discovery' then 'science-order'
          when 'Ordering Wits: Campus Culture' then 'culture-order'
          when 'Ordering Wits: Public Life' then 'public-order'
          when 'Ordering Wits: Modern Century' then 'modern-order'
        end)::uuid::text
    `);

      expect(result.rows[0]).toEqual({
        event_count: '10',
        mcq_count: '5',
        ordering_count: '5',
        question_count: '100',
      });
    });

    it('has ten distinct sourced questions per event with complete four-item answers', async () => {
      const result = await pool.query<{
        event_title: string;
        question_count: string;
        distinct_prompt_count: string;
        invalid_question_count: string;
        invalid_item_count: string;
      }>(`
      select
        event.title as event_title,
        count(distinct question.id)::text as question_count,
        count(distinct question.prompt)::text as distinct_prompt_count,
        count(distinct question.id) filter (
          where question.explanation is null
             or btrim(question.explanation) = ''
             or cardinality(question.source_urls) = 0
             or question.difficulty not between 1 and 3
        )::text as invalid_question_count,
        count(distinct question.id) filter (
          where case challenge.format
            when 'multiple_choice' then choice_counts.item_count
            else ordering_counts.item_count
          end <> 4
        )::text as invalid_item_count
      from public.events event
      join public.event_challenges challenge on challenge.event_id = event.id
      join public.challenge_questions question on question.challenge_id = challenge.id
      left join lateral (
        select count(*) as item_count
        from public.challenge_choices choice
        where choice.question_id = question.id
      ) choice_counts on true
      left join lateral (
        select count(*) as item_count
        from public.challenge_ordering_items item
        where item.question_id = question.id
      ) ordering_counts on true
      where event.title like 'Wits % Quest'
         or event.title like 'Ordering Wits:%'
      group by event.id, event.title
      order by event.title
    `);

      expect(result.rows).toHaveLength(10);
      for (const row of result.rows) {
        expect(row).toMatchObject({
          question_count: '10',
          distinct_prompt_count: '10',
          invalid_question_count: '0',
          invalid_item_count: '0',
        });
      }
    });

    it('keeps all one hundred questions and all ordering item sets globally distinct', async () => {
      const result = await pool.query<{
        distinct_ordering_sets: string;
        distinct_prompts: string;
        distinct_semantic_content: string;
        ordering_questions: string;
        total_questions: string;
      }>(`
      with question_content as (
        select
          question.id,
          question.prompt,
          challenge.format,
          case challenge.format
            when 'multiple_choice' then
              'multiple_choice|' || lower(btrim(question.prompt)) || '|' || choices.signature
            else 'ordering|' || ordering_items.signature
          end as semantic_signature,
          ordering_items.signature as ordering_set_signature
        from public.challenge_questions question
        join public.event_challenges challenge on challenge.id = question.challenge_id
        left join lateral (
          select string_agg(lower(btrim(choice.choice_text)), '|' order by lower(btrim(choice.choice_text))) as signature
          from public.challenge_choices choice
          where choice.question_id = question.id
        ) choices on true
        left join lateral (
          select string_agg(lower(btrim(item.item_text)), '|' order by lower(btrim(item.item_text))) as signature
          from public.challenge_ordering_items item
          where item.question_id = question.id
        ) ordering_items on true
        where challenge.id in (
          select md5('wits-world-verified-challenge:' || event_key)::uuid
          from unnest(array[
            'foundations', 'heritage', 'discovery', 'arts', 'civic',
            'early-order', 'science-order', 'culture-order',
            'public-order', 'modern-order'
          ]) event_key
        )
      )
      select
        count(*)::text as total_questions,
        count(distinct lower(btrim(prompt)))::text as distinct_prompts,
        count(distinct semantic_signature)::text as distinct_semantic_content,
        count(*) filter (where format = 'ordering')::text as ordering_questions,
        count(distinct ordering_set_signature) filter (where format = 'ordering')::text as distinct_ordering_sets
      from question_content
    `);

      expect(result.rows[0]).toEqual({
        distinct_ordering_sets: '50',
        distinct_prompts: '100',
        distinct_semantic_content: '100',
        ordering_questions: '50',
        total_questions: '100',
      });
    });

    it('uses only explicitly dated ordering facts and removes ambiguous chronology', async () => {
      const questions = await pool.query<{
        explanation: string;
        item_texts: string[];
      }>(`
      select
        question.explanation,
        array_agg(item.item_text order by answer.correct_position) as item_texts
      from public.challenge_questions question
      join public.event_challenges challenge on challenge.id = question.challenge_id
      join public.challenge_ordering_items item on item.question_id = question.id
      join private.challenge_ordering_answer_keys answer
        on answer.question_id = question.id
       and answer.item_id = item.id
      where challenge.format = 'ordering'
        and challenge.id in (
          select md5('wits-world-verified-challenge:' || event_key)::uuid
          from unnest(array[
            'early-order', 'science-order', 'culture-order',
            'public-order', 'modern-order'
          ]) event_key
        )
      group by question.id
      order by question.id
    `);

      expect(questions.rows).toHaveLength(50);
      const allItems = questions.rows.flatMap((row) => row.item_texts);
      expect(allItems).not.toContain(
        'The Champion Tree is planted in the 1930s',
      );
      expect(allItems).not.toContain(
        'Wits moves from Plein Square to Milner Park',
      );
      expect(allItems).toContain('Wits celebrates its 90th anniversary');
      expect(allItems).toContain(
        'Wits launches the Centre of Excellence in Mathematical and Statistical Sciences',
      );

      for (const question of questions.rows) {
        const years = question.explanation.match(/\b(?:18|19|20)\d{2}\b/gu);
        expect(years).toHaveLength(4);
        const numericYears = years?.map(Number) ?? [];
        expect(numericYears).toEqual([...numericYears].sort((a, b) => a - b));
        expect(new Set(numericYears).size).toBe(4);
      }
    });

    it('stores complete private keys without exposing them in public question rows', async () => {
      const result = await pool.query<{
        mcq_keys: string;
        ordering_keys: string;
        public_answer_columns: string;
      }>(`
      select
        (select count(*)::text
           from private.challenge_answer_keys answer
           join public.challenge_questions question on question.id = answer.question_id
           join public.event_challenges challenge on challenge.id = question.challenge_id
           join public.events event on event.id = challenge.event_id
          where challenge.format = 'multiple_choice'
            and event.title like 'Wits % Quest') as mcq_keys,
        (select count(*)::text
           from private.challenge_ordering_answer_keys answer
           join public.challenge_questions question on question.id = answer.question_id
          where question.challenge_id in (
            select id from public.event_challenges where format = 'ordering'
          ) and question.challenge_id in (
            select md5('wits-world-verified-challenge:' || event_key)::uuid
            from unnest(array[
              'early-order', 'science-order', 'culture-order',
              'public-order', 'modern-order'
            ]) event_key
          )) as ordering_keys,
        (select count(*)::text
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'challenge_questions'
            and column_name in ('accepted_choice_id', 'correct_position')) as public_answer_columns
    `);

      expect(result.rows[0]).toEqual({
        mcq_keys: '50',
        ordering_keys: '200',
        public_answer_columns: '0',
      });
    });

    it('demonstrates active, upcoming, passed, and unavailable states at ten distinct sourced locations', async () => {
      const result = await pool.query<{ state: string; count: string }>(`
      select state, count(*)::text
      from (
        select case
          when not is_published then 'unavailable'
          when ends_at <= '2026-09-10T00:00:00+02:00'::timestamptz then 'passed'
          when starts_at > '2026-09-10T00:00:00+02:00'::timestamptz then 'upcoming'
          else 'active'
        end as state
        from public.events
        where title like 'Wits % Quest'
           or title like 'Ordering Wits:%'
      ) states
      group by state
      order by state
    `);
      expect(result.rows).toEqual([
        { state: 'active', count: '4' },
        { state: 'passed', count: '2' },
        { state: 'unavailable', count: '2' },
        { state: 'upcoming', count: '2' },
      ]);

      const invalidLocations = await pool.query<{ count: string }>(`
      select count(*)::text as count
      from public.events
      where (title like 'Wits % Quest' or title like 'Ordering Wits:%')
        and (
          st_isempty(location::geometry)
          or radius_metres <= 0
          or cardinality(source_urls) < 2
        )
      `);
      expect(invalidLocations.rows[0]?.count).toBe('0');

      const distinctLocations = await pool.query<{
        distinct_location_count: string;
        event_count: string;
      }>(`
      select
        count(*)::text as event_count,
        count(distinct st_asewkb(location::geometry))::text as distinct_location_count
      from public.events
      where title like 'Wits % Quest'
         or title like 'Ordering Wits:%'
    `);
      expect(distinctLocations.rows[0]).toEqual({
        distinct_location_count: '10',
        event_count: '10',
      });
    });

    it('uses separate Nobel and Wits evidence for every Sydney Brenner question', async () => {
      const result = await pool.query<{ count: string }>(`
      select count(distinct question.id)::text as count
      from public.challenge_questions question
      left join public.challenge_ordering_items item on item.question_id = question.id
      where (
        question.id = md5('wits-world-verified-question:civic:8')::uuid
        or item.item_text = 'Sydney Brenner receives the Nobel Prize in Physiology or Medicine'
      )
        and question.source_urls @> array[
          'https://www.nobelprize.org/prizes/medicine/2002/brenner/facts/',
          'https://www.wits.ac.za/news/latest-news/general-news/2024/2024-04/science-meets-history-at-adler-museum-of-medicine.html'
        ]::text[]
    `);

      expect(Number(result.rows[0]?.count)).toBeGreaterThan(1);
    });

    it('exercises all time limits and selects five distinct questions per challenge', async () => {
      const challenges = await pool.query<{
        challenge_id: string;
        difficulty: number;
        question_ids: string[];
      }>(`
      select
        challenge.id::text as challenge_id,
        min(question.difficulty)::integer as difficulty,
        array_agg(question.id::text order by question.id) as question_ids
      from public.event_challenges challenge
      join public.events event on event.id = challenge.event_id
      join public.challenge_questions question on question.challenge_id = challenge.id
      where event.title like 'Wits % Quest'
         or event.title like 'Ordering Wits:%'
      group by challenge.id
    `);

      expect(new Set(challenges.rows.map((row) => row.difficulty))).toEqual(
        new Set([1, 2, 3]),
      );
      for (const challenge of challenges.rows) {
        const selected = selectChallengeQuestions(
          challenge.question_ids,
          () => 0,
        );
        expect(selected).toHaveLength(5);
        expect(new Set(selected).size).toBe(5);
      }
    });

    it('rejects a conflicting deterministic row without touching unrelated content', async () => {
      const unrelatedEventId = '16500000-0000-4000-8000-000000000001';
      const canonicalSources = [
        'https://www.wits.ac.za/health/adlermuseum/contact-us/',
        'https://www.wits.ac.za/maps/parktown-campus/',
      ];

      await pool.query(
        `insert into public.events (
           id, title, description, location, radius_metres, starts_at, ends_at
         ) values (
           $1::uuid, 'Independent review fixture',
           'Unrelated content that the verified seed must not alter.',
           st_setsrid(st_makepoint(28.04, -26.19), 4326)::geography,
           25, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'
         )`,
        [unrelatedEventId],
      );
      await pool.query(
        `update public.events
            set source_urls = array['https://example.invalid/stale-source']::text[],
                version = version + 1,
                updated_at = now()
          where id = md5('wits-world-verified-event:public-order')::uuid`,
      );

      try {
        await expect(runVerifiedEventSeeds(temporaryConfig)).rejects.toThrow(
          /Verified event seed canonical conflict/,
        );

        const result = await pool.query<{
          source_urls: string[];
          unrelated_description: string;
        }>(
          `select
             (select source_urls
                from public.events
               where id = md5('wits-world-verified-event:public-order')::uuid) as source_urls,
             (select description
                from public.events
               where id = $1::uuid) as unrelated_description`,
          [unrelatedEventId],
        );

        expect(result.rows[0]).toEqual({
          source_urls: ['https://example.invalid/stale-source'],
          unrelated_description:
            'Unrelated content that the verified seed must not alter.',
        });
      } finally {
        await pool.query(`alter table public.events
          disable trigger events_curated_authoring_guard`);
        await pool.query(
          `update public.events
              set source_urls = $1::text[],
                  version = 0,
                  updated_at = now()
            where id = md5('wits-world-verified-event:public-order')::uuid`,
          [canonicalSources],
        );
        await pool.query(`alter table public.events
          enable trigger events_curated_authoring_guard`);
      }

      await runVerifiedEventSeeds(temporaryConfig);
    }, 60_000);

    it('never adopts pre-existing deterministic draft challenges or questions', async () => {
      const collisionDatabaseName = `wits_quest_verified_collision_${Date.now()}_${process.pid}`;
      const collisionUrl = new URL(administrationConfig.connectionString);
      collisionUrl.pathname = `/${collisionDatabaseName}`;
      const collisionConfig: DatabaseConfig = {
        ...administrationConfig,
        connectionString: collisionUrl.toString(),
      };
      let collisionPool: ReturnType<typeof createDatabasePool> | undefined;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${collisionDatabaseName}`);
      });

      try {
        await runMigrations(collisionConfig);
        collisionPool = createDatabasePool(collisionConfig);

        await collisionPool.query(`
          insert into public.events (
            id, title, description, location, radius_metres, starts_at, ends_at,
            is_published, authoring_status, publication_provenance, source_urls
          ) values (
            md5('wits-world-verified-event:foundations')::uuid,
            'Wits Foundations Quest',
            'Trace the University from its mining-school origins to its first landmark discoveries.',
            st_setsrid(st_makepoint(28.030411, -26.192142), 4326)::geography,
            60, '2026-09-01T00:00:00+02:00', '2099-12-31T23:59:59+02:00',
            true, 'published', 'controlled_seed', array[
              'https://www.wits.ac.za/media/wits-university/about-wits/documents/2025-Braamfontein-Campus-map.pdf',
              'https://artefacts.co.za/main/Buildings/bldgframes_mob.php?bldgid=15658'
            ]::text[]
          );
          insert into public.events (
            id, title, description, location, radius_metres, starts_at, ends_at
          ) values (
            '16500000-0000-4000-8000-000000000002',
            'Independent collision fixture',
            'Unrelated authored content must survive both rejected seed runs.',
            st_setsrid(st_makepoint(28.05, -26.18), 4326)::geography,
            25, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'
          );
          insert into public.event_challenges (
            id, event_id, format, status
          ) values (
            md5('wits-world-verified-challenge:foundations')::uuid,
            md5('wits-world-verified-event:foundations')::uuid,
            'multiple_choice', 'draft'
          )
        `);

        const draftChallengeBefore = await collisionPool.query(`
          select event_id::text, format, status, version,
                 publication_provenance, created_at, updated_at
          from public.event_challenges
          where id = md5('wits-world-verified-challenge:foundations')::uuid
        `);

        await expect(runVerifiedEventSeeds(collisionConfig)).rejects.toThrow(
          /pre-existing deterministic challenge does not match the complete final canonical state/,
        );

        const draftChallengeAfter = await collisionPool.query(`
          select event_id::text, format, status, version,
                 publication_provenance, created_at, updated_at
          from public.event_challenges
          where id = md5('wits-world-verified-challenge:foundations')::uuid
        `);
        const challengeChildren = await collisionPool.query<{ count: string }>(`
          select count(*)::text as count
          from public.challenge_questions
          where challenge_id = md5('wits-world-verified-challenge:foundations')::uuid
        `);
        expect(draftChallengeAfter.rows).toEqual(draftChallengeBefore.rows);
        expect(challengeChildren.rows[0]?.count).toBe('0');

        await collisionPool.query(`
          delete from public.event_challenges
          where id = md5('wits-world-verified-challenge:foundations')::uuid
        `);
        await collisionPool.query(`
          alter table public.event_challenges
            disable trigger event_challenges_publication_integrity
        `);
        await collisionPool.query(`
          insert into public.event_challenges (
            id, event_id, format, status, version, publication_provenance
          ) values (
            md5('wits-world-verified-challenge:foundations')::uuid,
            md5('wits-world-verified-event:foundations')::uuid,
            'multiple_choice', 'published', 1, 'controlled_seed'
          )
        `);
        await collisionPool.query(`
          alter table public.event_challenges
            enable trigger event_challenges_publication_integrity
        `);
        await collisionPool.query(`
          alter table public.challenge_questions
            disable trigger challenge_questions_publication_integrity
        `);
        await collisionPool.query(`
          insert into public.challenge_questions (
            id, challenge_id, prompt, difficulty, explanation, status,
            publication_provenance, source_urls
          ) values (
            md5('wits-world-verified-question:foundations:1')::uuid,
            md5('wits-world-verified-challenge:foundations')::uuid,
            'In which city did the institution that became Wits begin in 1896?',
            1, 'Wits began as a school in Kimberley in 1896.', 'draft', null,
            array['https://wits100.wits.ac.za/']::text[]
          )
        `);
        await collisionPool.query(`
          alter table public.challenge_questions
            enable trigger challenge_questions_publication_integrity
        `);

        const draftQuestionBefore = await collisionPool.query(`
          select challenge_id::text, prompt, difficulty, explanation, status,
                 version, publication_provenance, source_urls,
                 created_at, updated_at
          from public.challenge_questions
          where id = md5('wits-world-verified-question:foundations:1')::uuid
        `);

        await expect(runVerifiedEventSeeds(collisionConfig)).rejects.toThrow(
          /pre-existing deterministic question does not match the complete final canonical state/,
        );

        const draftQuestionAfter = await collisionPool.query(`
          select challenge_id::text, prompt, difficulty, explanation, status,
                 version, publication_provenance, source_urls,
                 created_at, updated_at
          from public.challenge_questions
          where id = md5('wits-world-verified-question:foundations:1')::uuid
        `);
        const nestedContent = await collisionPool.query<{
          answer_keys: string;
          choices: string;
        }>(`
          select
            (select count(*)::text from public.challenge_choices
              where question_id = md5('wits-world-verified-question:foundations:1')::uuid) as choices,
            (select count(*)::text from private.challenge_answer_keys
              where question_id = md5('wits-world-verified-question:foundations:1')::uuid) as answer_keys
        `);
        const unrelated = await collisionPool.query<{ description: string }>(`
          select description
          from public.events
          where id = '16500000-0000-4000-8000-000000000002'
        `);

        expect(draftQuestionAfter.rows).toEqual(draftQuestionBefore.rows);
        expect(nestedContent.rows[0]).toEqual({
          answer_keys: '0',
          choices: '0',
        });
        expect(unrelated.rows[0]?.description).toBe(
          'Unrelated authored content must survive both rejected seed runs.',
        );

        await collisionPool.query(`
          alter table public.challenge_questions
            disable trigger challenge_questions_publication_integrity
        `);
        await collisionPool.query(`
          delete from public.challenge_questions
          where id = md5('wits-world-verified-question:foundations:1')::uuid
        `);
        await collisionPool.query(`
          alter table public.challenge_questions
            enable trigger challenge_questions_publication_integrity
        `);
        await collisionPool.query(`
          alter table public.event_challenges
            disable trigger event_challenges_lifecycle_immutability
        `);
        await collisionPool.query(`
          alter table public.event_challenges
            disable trigger event_challenges_publication_integrity
        `);
        await collisionPool.query(`
          delete from public.event_challenges
          where id = md5('wits-world-verified-challenge:foundations')::uuid
        `);
        await collisionPool.query(`
          alter table public.event_challenges
            enable trigger event_challenges_publication_integrity
        `);
        await collisionPool.query(`
          alter table public.event_challenges
            enable trigger event_challenges_lifecycle_immutability
        `);

        await runVerifiedEventSeeds(collisionConfig);
        await runVerifiedEventSeeds(collisionConfig);

        const installed = await collisionPool.query<{ count: string }>(`
          select count(*)::text as count
          from public.challenge_questions
          where challenge_id = md5('wits-world-verified-challenge:foundations')::uuid
            and status = 'published'
            and publication_provenance = 'controlled_seed'
        `);
        expect(installed.rows[0]?.count).toBe('10');
      } finally {
        if (collisionPool) await collisionPool.end();
        await withDatabaseClient(administrationConfig, async (client) => {
          await client.query(
            `drop database if exists ${collisionDatabaseName} with (force)`,
          );
        });
      }
    }, 180_000);

    it('uses the runtime reward-candidate predicate and rejects ineligible cards', async () => {
      const result = await pool.query<{ rarity: string; count: string }>(`
      select rarity, count(*)::text
      from public.card_definitions
      where is_active = true
        and authoring_status = 'published'
        and reward_eligible = true
      group by rarity
      order by rarity
    `);
      expect(result.rows.map((row) => row.rarity)).toEqual([
        'common',
        'epic',
        'legendary',
        'rare',
      ]);
      expect(result.rows.every((row) => Number(row.count) > 0)).toBe(true);

      const commonCandidates = await pool.query<{ id: string }>(`
      select id::text as id
      from public.card_definitions
      where is_active = true
        and authoring_status = 'published'
        and reward_eligible = true
        and rarity = 'common'
      order by id
    `);
      expect(commonCandidates.rows.length).toBeGreaterThan(0);

      const candidateIds = commonCandidates.rows.map((row) => row.id);
      await pool.query(`alter table public.card_definitions
        disable trigger card_definitions_curated_authoring_guard`);
      await pool.query(`alter table public.card_definitions
        disable trigger card_definitions_content_immutability`);
      await pool.query(
        `update public.card_definitions
            set reward_eligible = false
          where id = any($1::uuid[])`,
        [candidateIds],
      );
      await pool.query(`alter table public.card_definitions
        enable trigger card_definitions_content_immutability`);
      await pool.query(`alter table public.card_definitions
        enable trigger card_definitions_curated_authoring_guard`);

      try {
        const ineligibleCommon = await pool.query<{ count: string }>(`
        select count(*)::text as count
        from public.card_definitions
        where is_active = true
          and authoring_status = 'published'
          and reward_eligible = false
          and rarity = 'common'
      `);
        expect(Number(ineligibleCommon.rows[0]?.count)).toBeGreaterThan(0);

        await expect(runVerifiedEventSeeds(temporaryConfig)).rejects.toThrow(
          /active, published, reward-eligible Common card/,
        );
      } finally {
        await pool.query(`alter table public.card_definitions
          disable trigger card_definitions_curated_authoring_guard`);
        await pool.query(`alter table public.card_definitions
          disable trigger card_definitions_content_immutability`);
        await pool.query(
          `update public.card_definitions
              set reward_eligible = true
            where id = any($1::uuid[])`,
          [candidateIds],
        );
        await pool.query(`alter table public.card_definitions
          enable trigger card_definitions_content_immutability`);
        await pool.query(`alter table public.card_definitions
          enable trigger card_definitions_curated_authoring_guard`);
      }

      await runVerifiedEventSeeds(temporaryConfig);
    }, 60_000);
  },
);

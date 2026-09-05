import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createQuestionPerformanceService } from '../src/challenges/question-performance-service.js';
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

const EVENT_MCQ = '10000000-0000-4000-8000-000000000001';
const EVENT_ORDERING = '10000000-0000-4000-8000-000000000002';
const CHALLENGE_MCQ = '20000000-0000-4000-8000-000000000001';
const CHALLENGE_ORDERING = '20000000-0000-4000-8000-000000000002';
const QUESTION_MCQ = '30000000-0000-4000-8000-000000000001';
const QUESTION_ORDERING = '30000000-0000-4000-8000-000000000002';
const EVENT_PARTIAL_TIMEOUT = '10000000-0000-4000-8000-000000000003';
const CHALLENGE_PARTIAL_TIMEOUT = '20000000-0000-4000-8000-000000000003';
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'question performance database integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let databaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      databaseName = `wits_question_performance_${Date.now()}_${process.pid}`;
      await withDatabaseClient(administrationConfig, (client) =>
        client.query(`create database ${databaseName}`),
      );
      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${databaseName}`;
      const temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };
      await runMigrations(temporaryConfig);
      pool = createDatabasePool(temporaryConfig);
      await seedRepresentativeOutcomes();
    }, 180_000);

    afterAll(async () => {
      if (pool) await pool.end();
      if (administrationConfig && databaseName) {
        await withDatabaseClient(administrationConfig, (client) =>
          client.query(`drop database if exists ${databaseName} with (force)`),
        );
      }
    }, 30_000);

    it('aggregates MCQ, ordering, incorrect submissions, and unanswered timeouts', async () => {
      const service = createQuestionPerformanceService(pool);
      const mcqResult = await service.list({
        eventId: EVENT_MCQ,
        page: 1,
        pageSize: 25,
      });
      const orderingResult = await service.list({
        eventId: EVENT_ORDERING,
        page: 1,
        pageSize: 25,
      });

      expect(mcqResult.items).toHaveLength(1);
      expect(mcqResult.items[0]).toMatchObject({
        answerCount: 100,
        correctCount: 30,
        incorrectCount: 70,
        timeoutCount: 10,
        correctRate: 0.3,
        incorrectRate: 0.7,
        isProblematic: true,
      });
      expect(orderingResult.items).toHaveLength(1);
      expect(orderingResult.items[0]).toMatchObject({
        answerCount: 100,
        correctCount: 40,
        incorrectCount: 60,
        timeoutCount: 10,
        correctRate: 0.4,
        incorrectRate: 0.6,
        isProblematic: false,
      });
    });

    it('counts only the active unanswered question when an attempt times out part-way through', async () => {
      const result = await createQuestionPerformanceService(pool).list({
        challengeId: CHALLENGE_PARTIAL_TIMEOUT,
        page: 1,
        pageSize: 25,
      });

      expect(result.items.map((item) => item.prompt).sort()).toEqual([
        'Partial question 1',
        'Partial question 2',
        'Partial question 3',
        'Partial question 4',
      ]);
      expect(
        result.items.find((item) => item.prompt === 'Partial question 4'),
      ).toMatchObject({
        answerCount: 1,
        correctCount: 0,
        incorrectCount: 1,
        timeoutCount: 1,
      });
      expect(
        result.items.some((item) => item.prompt === 'Partial question 5'),
      ).toBe(false);
    });

    it('composes event, challenge, format, difficulty, and date filters', async () => {
      const result = await createQuestionPerformanceService(pool).list({
        eventId: EVENT_ORDERING,
        challengeId: CHALLENGE_ORDERING,
        format: 'ordering',
        difficulty: 3,
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-03T00:00:00.000Z',
        page: 1,
        pageSize: 1,
      });
      expect(result.items.map((item) => item.questionId)).toEqual([
        QUESTION_ORDERING,
      ]);
      expect(result).toMatchObject({ totalItems: 1, totalPages: 1 });

      const outsideRange = await createQuestionPerformanceService(pool).list({
        from: '2026-09-03T00:00:00.000Z',
        page: 1,
        pageSize: 25,
      });
      expect(outsideRange.items).toEqual([]);
    });

    it('keeps selective and default query shapes efficient in representative plans', async () => {
      const captured: { statement?: string; values?: unknown[] } = {};
      const service = createQuestionPerformanceService({
        async connect() {
          const client = await pool.connect();
          return {
            async query<T extends import('pg').QueryResultRow>(
              statement: string,
              values?: unknown[],
            ) {
              captured.statement = statement;
              captured.values = values;
              return client.query<T>(statement, values);
            },
            release: () => client.release(),
          };
        },
      });

      await service.list({ eventId: EVENT_MCQ, page: 1, pageSize: 25 });
      const eventPlan = await explainCaptured(captured);
      expectIndexedPlan(eventPlan);

      await service.list({
        challengeId: CHALLENGE_ORDERING,
        page: 1,
        pageSize: 25,
      });
      const challengePlan = await explainCaptured(captured);
      expectIndexedPlan(challengePlan);

      await service.list({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-03T00:00:00.000Z',
        page: 1,
        pageSize: 25,
      });
      const datePlan = await explainCaptured(captured);
      expectIndexedPlan(datePlan);

      await service.list({ page: 1, pageSize: 25 });
      const unfilteredPlan = await explainCaptured(captured);
      expectMeasuredPlan(unfilteredPlan);
    });

    async function explainCaptured(captured: {
      statement?: string;
      values?: unknown[];
    }) {
      if (!captured.statement || !captured.values)
        throw new Error('Expected captured aggregate query.');
      const plan = await pool.query<{ 'QUERY PLAN': string }>(
        `explain (analyze, buffers, format text) ${captured.statement}`,
        captured.values,
      );
      return plan.rows.map((row) => row['QUERY PLAN']).join('\n');
    }

    function expectIndexedPlan(plan: string) {
      expectMeasuredPlan(plan);
      expect(plan).toMatch(
        /(?:Index(?: Only)? Scan using \S+ on challenge_attempts|Bitmap Heap Scan on challenge_attempts)/,
      );
    }

    function expectMeasuredPlan(plan: string) {
      expect(plan).toMatch(/Execution Time: \d/);
      expect(plan).toMatch(/Buffers:/);
      const executionTime = Number(/Execution Time: ([\d.]+)/.exec(plan)?.[1]);
      expect(executionTime).toBeLessThan(5_000);
    }

    async function seedRepresentativeOutcomes() {
      await pool.query(`
      insert into public.events (id, title, location, radius_metres, starts_at, ends_at)
      values
        ('${EVENT_MCQ}', 'MCQ analytics', st_setsrid(st_makepoint(28.03, -26.19), 4326)::geography, 50, '2026-09-01T00:00:00Z', '2026-09-30T00:00:00Z'),
        ('${EVENT_ORDERING}', 'Ordering analytics', st_setsrid(st_makepoint(28.04, -26.20), 4326)::geography, 50, '2026-09-01T00:00:00Z', '2026-09-30T00:00:00Z'),
        ('${EVENT_PARTIAL_TIMEOUT}', 'Partial timeout analytics', st_setsrid(st_makepoint(28.05, -26.21), 4326)::geography, 50, '2026-09-01T00:00:00Z', '2026-09-30T00:00:00Z');
      insert into public.event_challenges (id, event_id, format)
      values ('${CHALLENGE_MCQ}', '${EVENT_MCQ}', 'multiple_choice'),
             ('${CHALLENGE_ORDERING}', '${EVENT_ORDERING}', 'ordering'),
             ('${CHALLENGE_PARTIAL_TIMEOUT}', '${EVENT_PARTIAL_TIMEOUT}', 'multiple_choice');
      insert into public.challenge_questions (id, challenge_id, prompt, difficulty, explanation)
      values ('${QUESTION_MCQ}', '${CHALLENGE_MCQ}', 'MCQ performance question', 2, 'MCQ explanation'),
             ('${QUESTION_ORDERING}', '${CHALLENGE_ORDERING}', 'Ordering performance question', 3, 'Ordering explanation');
      insert into public.challenge_choices (id, question_id, authoring_position, choice_text)
      values ('40000000-0000-4000-8000-000000000001', '${QUESTION_MCQ}', 1, 'Correct'),
             ('40000000-0000-4000-8000-000000000002', '${QUESTION_MCQ}', 2, 'Wrong');
      insert into private.challenge_answer_keys (question_id, accepted_choice_id)
      values ('${QUESTION_MCQ}', '40000000-0000-4000-8000-000000000001');
      insert into public.challenge_ordering_items (id, question_id, item_text)
      select ('50000000-0000-4000-8000-' || lpad(position::text, 12, '0'))::uuid,
             '${QUESTION_ORDERING}', 'Item ' || position
      from generate_series(1, 4) position;
      insert into private.challenge_ordering_answer_keys (question_id, item_id, correct_position)
      select '${QUESTION_ORDERING}', id, row_number() over (order by id)
      from public.challenge_ordering_items where question_id = '${QUESTION_ORDERING}';

      insert into public.challenge_questions (id, challenge_id, prompt, difficulty, explanation)
      select ('60000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
             '${CHALLENGE_PARTIAL_TIMEOUT}', 'Partial question ' || number, 2,
             'Partial explanation ' || number
      from generate_series(1, 5) number;
      insert into public.challenge_choices (id, question_id, authoring_position, choice_text)
      select ('61000000-0000-4000-8000-' || lpad((question_number * 10 + position)::text, 12, '0'))::uuid,
             ('60000000-0000-4000-8000-' || lpad(question_number::text, 12, '0'))::uuid,
             position, case when position = 1 then 'Correct' else 'Wrong' end
      from generate_series(1, 5) question_number cross join generate_series(1, 2) position;
      insert into private.challenge_answer_keys (question_id, accepted_choice_id)
      select ('60000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid,
             ('61000000-0000-4000-8000-' || lpad((number * 10 + 1)::text, 12, '0'))::uuid
      from generate_series(1, 5) number;

      create temporary table background_content as
      select number, gen_random_uuid() event_id, gen_random_uuid() challenge_id,
             gen_random_uuid() question_id
      from generate_series(1, 40) number;
      insert into public.events (id, title, location, radius_metres, starts_at, ends_at)
      select event_id, 'Background event ' || number,
             st_setsrid(st_makepoint(28.06, -26.22), 4326)::geography,
             50, '2026-08-01T00:00:00Z', '2026-08-31T00:00:00Z'
      from background_content;
      insert into public.event_challenges (id, event_id, format)
      select challenge_id, event_id, 'multiple_choice' from background_content;
      insert into public.challenge_questions (id, challenge_id, prompt, difficulty, explanation)
      select question_id, challenge_id, 'Background question ' || number, 1,
             'Background explanation ' || number
      from background_content;

      insert into public.players (id, auth_issuer, auth_subject, role)
      select gen_random_uuid(), 'https://analytics.test/', 'performance-' || number, 'player'
      from generate_series(1, 4000) number;
      create temporary table performance_players as
      select id player_id, row_number() over (order by auth_subject) rn
      from public.players where auth_subject like 'performance-%';

      alter table public.challenge_attempts disable trigger user;
      alter table public.attempt_questions disable trigger user;
      alter table public.attempt_question_choices disable trigger user;
      alter table public.attempt_answers disable trigger user;
      alter table public.attempt_question_ordering_items disable trigger user;
      alter table public.attempt_ordering_answers disable trigger user;
      alter table public.attempt_ordering_answer_items disable trigger user;

      create temporary table background_attempts as
      select gen_random_uuid() id, player.player_id, content.event_id,
             content.challenge_id, content.question_id
      from performance_players player
      join background_content content on content.number = ((player.rn - 1) % 40) + 1;
      insert into public.challenge_attempts
        (id, player_id, event_id, challenge_id, status, started_at, deadline,
         time_limit_seconds, average_difficulty, completed_at, completion_reason, score_correct)
      select id, player_id, event_id, challenge_id, 'completed',
             '2026-08-15T00:00:00Z', '2026-08-15T00:01:30Z', 90, 1,
             '2026-08-15T00:01:30Z', 'timeout', 0
      from background_attempts;
      insert into public.attempt_questions
        (id, attempt_id, source_question_id, position, prompt_snapshot, difficulty_snapshot)
      select gen_random_uuid(), attempt.id, attempt.question_id, 1,
             'Background question', 1
      from background_attempts attempt;

      create temporary table partial_attempt as
      select gen_random_uuid() id, player_id
      from performance_players where rn = 1;
      insert into public.challenge_attempts
        (id, player_id, event_id, challenge_id, status, started_at, deadline,
         time_limit_seconds, average_difficulty, completed_at, completion_reason, score_correct)
      select id, player_id, '${EVENT_PARTIAL_TIMEOUT}', '${CHALLENGE_PARTIAL_TIMEOUT}',
             'completed', '2026-09-02T00:00:00Z', '2026-09-02T00:02:00Z',
             120, 2, '2026-09-02T00:02:00Z', 'timeout', 3
      from partial_attempt;
      create temporary table partial_questions as
      select gen_random_uuid() id, attempt.id attempt_id, source.id source_question_id,
             row_number() over (order by source.id)::smallint position, source.prompt
      from partial_attempt attempt
      cross join public.challenge_questions source
      where source.challenge_id = '${CHALLENGE_PARTIAL_TIMEOUT}';
      insert into public.attempt_questions
        (id, attempt_id, source_question_id, position, prompt_snapshot, difficulty_snapshot)
      select id, attempt_id, source_question_id, position, prompt, 2
      from partial_questions;
      insert into public.attempt_question_choices
        (id, attempt_question_id, source_question_id, source_choice_id, display_position, choice_text_snapshot)
      select gen_random_uuid(), question.id, question.source_question_id, choice.id,
             choice.authoring_position, choice.choice_text
      from partial_questions question
      join public.challenge_choices choice on choice.question_id = question.source_question_id;
      insert into public.attempt_answers (attempt_question_id, selected_choice_id, answered_at)
      select question.id, choice.id, '2026-09-02T00:01:00Z'
      from partial_questions question
      join public.attempt_question_choices choice on choice.attempt_question_id = question.id
       and choice.source_choice_id = (
         select accepted_choice_id from private.challenge_answer_keys
         where question_id = question.source_question_id
       )
      where question.position <= 3;

      create temporary table mcq_attempts as
      select gen_random_uuid() id, player_id, rn from performance_players where rn <= 100;
      insert into public.challenge_attempts
        (id, player_id, event_id, challenge_id, status, started_at, deadline,
         time_limit_seconds, average_difficulty, completed_at, completion_reason, score_correct)
      select id, player_id, '${EVENT_MCQ}', '${CHALLENGE_MCQ}', 'completed',
             '2026-09-02T00:00:00Z', '2026-09-02T00:02:00Z', 120, 2,
             '2026-09-02T00:02:00Z', case when rn > 90 then 'timeout' else 'answered' end,
             case when rn <= 30 then 1 else 0 end
      from mcq_attempts;
      create temporary table mcq_questions as
      select gen_random_uuid() id, attempt.id attempt_id, rn from mcq_attempts attempt;
      insert into public.attempt_questions
        (id, attempt_id, source_question_id, position, prompt_snapshot, difficulty_snapshot)
      select id, attempt_id, '${QUESTION_MCQ}', 1, 'MCQ performance question', 2 from mcq_questions;
      insert into public.attempt_question_choices
        (id, attempt_question_id, source_question_id, source_choice_id, display_position, choice_text_snapshot)
      select gen_random_uuid(), question.id, '${QUESTION_MCQ}', choice.id,
             choice.authoring_position, choice.choice_text
      from mcq_questions question cross join public.challenge_choices choice
      where choice.question_id = '${QUESTION_MCQ}';
      insert into public.attempt_answers (attempt_question_id, selected_choice_id, answered_at)
      select question.id, choice.id, '2026-09-02T00:01:00Z'
      from mcq_questions question
      join public.attempt_question_choices choice on choice.attempt_question_id = question.id
       and choice.source_choice_id = case when question.rn <= 30
         then '40000000-0000-4000-8000-000000000001'::uuid
         else '40000000-0000-4000-8000-000000000002'::uuid end
      where question.rn <= 90;

      create temporary table ordering_attempts as
      select gen_random_uuid() id, player_id, rn from performance_players where rn <= 100;
      insert into public.challenge_attempts
        (id, player_id, event_id, challenge_id, status, started_at, deadline,
         time_limit_seconds, average_difficulty, completed_at, completion_reason, score_correct)
      select id, player_id, '${EVENT_ORDERING}', '${CHALLENGE_ORDERING}', 'completed',
             '2026-09-02T00:00:00Z', '2026-09-02T00:02:30Z', 150, 3,
             '2026-09-02T00:02:30Z', case when rn > 90 then 'timeout' else 'answered' end,
             case when rn <= 40 then 1 else 0 end
      from ordering_attempts;
      create temporary table ordering_questions as
      select gen_random_uuid() id, attempt.id attempt_id, rn from ordering_attempts attempt;
      insert into public.attempt_questions
        (id, attempt_id, source_question_id, position, prompt_snapshot, difficulty_snapshot, explanation_snapshot)
      select id, attempt_id, '${QUESTION_ORDERING}', 1, 'Ordering performance question', 3, 'Ordering explanation'
      from ordering_questions;
      insert into public.attempt_question_ordering_items
        (id, attempt_question_id, source_question_id, source_item_id, display_position, item_text_snapshot)
      select gen_random_uuid(), question.id, '${QUESTION_ORDERING}', item.id,
             row_number() over (partition by question.id order by item.id), item.item_text
      from ordering_questions question cross join public.challenge_ordering_items item
      where item.question_id = '${QUESTION_ORDERING}';
      insert into public.attempt_ordering_answers (attempt_question_id, answered_at)
      select id, '2026-09-02T00:01:00Z' from ordering_questions where rn <= 90;
      insert into public.attempt_ordering_answer_items
        (attempt_question_id, selected_item_id, submitted_position)
      select question.id, snapshot.id,
             case when question.rn <= 40 then answer_key.correct_position
                  else 5 - answer_key.correct_position end
      from ordering_questions question
      join public.attempt_question_ordering_items snapshot on snapshot.attempt_question_id = question.id
      join private.challenge_ordering_answer_keys answer_key
        on answer_key.question_id = '${QUESTION_ORDERING}' and answer_key.item_id = snapshot.source_item_id
      where question.rn <= 90;

      alter table public.challenge_attempts enable trigger user;
      alter table public.attempt_questions enable trigger user;
      alter table public.attempt_question_choices enable trigger user;
      alter table public.attempt_answers enable trigger user;
      alter table public.attempt_question_ordering_items enable trigger user;
      alter table public.attempt_ordering_answers enable trigger user;
      alter table public.attempt_ordering_answer_items enable trigger user;
      analyze public.challenge_attempts;
      analyze public.attempt_questions;
    `);
    }
  },
);

import { randomUUID } from 'node:crypto';
import type pg from 'pg';

import { createEventDiscoveryService } from '../events/event-discovery.js';
import {
  evaluateLocationTiming,
  evaluateReachabilityWithAccuracy,
} from '../events/location-claim.js';
import { evaluateJourney } from '../events/journey-evaluation.js';
import { calculateChallengeTiming } from './challenge-timing.js';
import {
  selectChallengeQuestions,
  shuffleChallengeItems,
} from './challenge-selection.js';
import { createChallengeAttemptReader } from './challenge-attempt-reader.js';
import { calculateChallengeAttemptScore } from './challenge-attempt-marking.js';
import type { ChallengeAttemptCompletionFinalizer } from './challenge-answer-submission.js';
import {
  createOfflinePackCodec,
  OfflineRejection,
  OFFLINE_PACK_LIFETIME_MS,
  validateOfflineTiming,
  type OfflinePack,
  type OfflineSubmission,
  type OfflineLocation,
} from './offline-policy.js';

interface Options {
  signingKey: string;
  previousSigningKey?: string;
  finalizer: ChallengeAttemptCompletionFinalizer;
  maxSpeed: number;
  retentionMs: number;
  clock?: () => Date;
}

export type OfflineChallengeService = ReturnType<
  typeof createOfflineChallengeService
>;

export function createOfflineChallengeService(
  database: Pick<pg.Pool, 'connect'>,
  options: Options,
) {
  const codec = createOfflinePackCodec(
    options.signingKey,
    options.previousSigningKey,
  );
  const clock = options.clock ?? (() => new Date());
  return {
    async packs(playerId: string, eventIds: string[]) {
      const client = await database.connect();
      try {
        await client.query('begin isolation level repeatable read read only');
        const now = clock();
        const events = await createEventDiscoveryService(client, {
          clock: () => now,
        }).list();
        const result: Array<{ pack: OfflinePack; packToken: string }> = [];
        for (const event of events.filter(
          (item) =>
            eventIds.includes(item.eventId) &&
            item.availability !== 'ended' &&
            Date.parse(item.startsAt) <
              now.getTime() + OFFLINE_PACK_LIFETIME_MS,
        )) {
          const source = await client.query<{
            id: string;
            version: number;
            event_version: number;
            format: OfflinePack['format'];
          }>(
            `
            select challenge.id, challenge.version, event.version as event_version, challenge.format
            from public.event_challenges challenge join public.events event on event.id = challenge.event_id
            where event.id = $1 and challenge.status = 'published'
              and not exists (select 1 from public.challenge_attempts where player_id = $2 and event_id = $1)
          `,
            [event.eventId, playerId],
          );
          const challenge = source.rows[0];
          if (!challenge) continue;
          const questions = await client.query<{
            id: string;
            version: number;
            prompt: string;
            difficulty: 1 | 2 | 3;
          }>(
            `
            select id, version, prompt, difficulty from public.challenge_questions
            where challenge_id = $1 and status = 'published' order by id
          `,
            [challenge.id],
          );
          if (questions.rows.length < 5) continue;
          const selected: OfflinePack['questions'] = [];
          for (const question of selectChallengeQuestions(questions.rows)) {
            const items = await client.query<{ id: string; text: string }>(
              challenge.format === 'ordering'
                ? 'select id, item_text as text from public.challenge_ordering_items where question_id = $1 order by id'
                : 'select id, choice_text as text from public.challenge_choices where question_id = $1 order by id',
              [question.id],
            );
            if (items.rows.length !== 4)
              throw new Error(
                'Published offline question has invalid options.',
              );
            selected.push({
              ...question,
              options: shuffleChallengeItems(items.rows),
            });
          }
          const pack: OfflinePack = {
            version: 1,
            packId: randomUUID(),
            playerId,
            issuedAt: now.toISOString(),
            validFrom: new Date(
              Math.max(now.getTime(), Date.parse(event.startsAt)),
            ).toISOString(),
            validUntil: new Date(
              Math.min(
                Date.parse(event.endsAt),
                now.getTime() + OFFLINE_PACK_LIFETIME_MS,
              ),
            ).toISOString(),
            event: {
              eventId: event.eventId,
              version: challenge.event_version,
              title: event.title,
              description: event.description,
              latitude: event.latitude,
              longitude: event.longitude,
              radiusMetres: event.radiusMetres,
            },
            challengeId: challenge.id,
            challengeVersion: challenge.version,
            format: challenge.format,
            timeLimitSeconds: calculateChallengeTiming(
              selected.map((question) => question.difficulty),
            ).timeLimitSeconds,
            questions: selected,
          };
          const packToken = codec.encode(pack);
          if (packToken.length <= 128_000) result.push({ pack, packToken });
        }
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
    async submit(playerId: string, input: OfflineSubmission) {
      const pack = codec.decode(input.packToken, playerId);
      const client = await database.connect();
      try {
        await client.query('begin');
        const active = await client.query(
          `select id from public.players where id = $1 and lifecycle_status = 'active' for update`,
          [playerId],
        );
        if (!active.rows.length)
          throw new OfflineRejection('ACCOUNT_UNAVAILABLE', 403);
        const existing = await client.query<{
          id: string;
          offline_client_attempt_id: string;
          offline_pack_id: string;
        }>(
          `
          select id, offline_client_attempt_id, offline_pack_id from public.challenge_attempts
          where player_id = $1 and (event_id = $2 or offline_client_attempt_id = $3)
        `,
          [playerId, pack.event.eventId, input.clientAttemptId],
        );
        if (existing.rows.length) {
          const row = existing.rows[0]!;
          if (
            row.offline_client_attempt_id !== input.clientAttemptId ||
            row.offline_pack_id !== pack.packId
          ) {
            throw new OfflineRejection('OFFLINE_ATTEMPT_CONFLICT', 409);
          }
          const attempt = await createChallengeAttemptReader(
            client,
          ).findByPlayerAndAttempt(playerId, row.id);
          await client.query('commit');
          return { created: false, attempt };
        }
        const receivedAt = clock();
        const timing = validateOfflineTiming(pack, input, receivedAt);
        await validateSources(client, pack, input.startedAt);
        await validateMovement(client, pack, input, receivedAt, options);
        const attemptId = randomUUID();
        const difficulty = calculateChallengeTiming(
          pack.questions.map((question) => question.difficulty),
        );
        await client.query(
          `insert into public.challenge_attempts
          (id, player_id, event_id, challenge_id, started_at, deadline, time_limit_seconds, average_difficulty,
           attempt_origin, offline_client_attempt_id, offline_pack_id, offline_pack_issued_at, synced_at)
          values ($1,$2,$3,$4,$5,$6,$7,$8,'offline',$9,$10,$11,$12)`,
          [
            attemptId,
            playerId,
            pack.event.eventId,
            pack.challengeId,
            input.startedAt,
            timing.deadline,
            difficulty.timeLimitSeconds,
            difficulty.averageDifficulty,
            input.clientAttemptId,
            pack.packId,
            pack.issuedAt,
            receivedAt,
          ],
        );
        for (const [index, question] of pack.questions.entries()) {
          const questionId = randomUUID();
          await client.query(
            `insert into public.attempt_questions
            (id, attempt_id, source_question_id, position, prompt_snapshot, difficulty_snapshot, explanation_snapshot)
            select $1,$2,id,$3,prompt,difficulty,case when $4 = 'ordering' then explanation else null end
            from public.challenge_questions where id = $5`,
            [questionId, attemptId, index + 1, pack.format, question.id],
          );
          const ids = new Map<string, string>();
          for (const [position, item] of question.options.entries()) {
            const id = randomUUID();
            ids.set(item.id, id);
            if (pack.format === 'ordering') {
              await client.query(
                `insert into public.attempt_question_ordering_items
                (id,attempt_question_id,source_question_id,source_item_id,display_position,item_text_snapshot)
                select $1,$2,question_id,id,$3,item_text from public.challenge_ordering_items where id=$4 and question_id=$5`,
                [id, questionId, position + 1, item.id, question.id],
              );
            } else {
              await client.query(
                `insert into public.attempt_question_choices
                (id,attempt_question_id,source_question_id,source_choice_id,display_position,choice_text_snapshot)
                select $1,$2,question_id,id,$3,choice_text from public.challenge_choices where id=$4 and question_id=$5`,
                [id, questionId, position + 1, item.id, question.id],
              );
            }
          }
          const answer = timing.timelyAnswers.find(
            (item) => item.questionId === question.id,
          );
          if (!answer) continue;
          if (pack.format === 'ordering') {
            await client.query(
              'insert into public.attempt_ordering_answers (attempt_question_id,answered_at) values ($1,$2)',
              [questionId, answer.answeredAt],
            );
            for (const [position, id] of answer.optionIds.entries()) {
              await client.query(
                `insert into public.attempt_ordering_answer_items
                (attempt_question_id,selected_item_id,submitted_position) values ($1,$2,$3)`,
                [questionId, ids.get(id), position + 1],
              );
            }
          } else {
            await client.query(
              'insert into public.attempt_answers (attempt_question_id,selected_choice_id,answered_at) values ($1,$2,$3)',
              [questionId, ids.get(answer.optionIds[0]!), answer.answeredAt],
            );
          }
        }
        const score = await calculateChallengeAttemptScore(client, attemptId);
        await options.finalizer.finalizeAttempt(client, {
          playerId,
          attemptId,
          completionReason: timing.completionReason,
          completedAt: timing.completedAt,
          scoreCorrect: score.scoreCorrect,
        });
        const attempt = await createChallengeAttemptReader(
          client,
        ).findByPlayerAndAttempt(playerId, attemptId);
        await client.query('commit');
        return { created: true, attempt };
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

async function validateSources(
  client: pg.PoolClient,
  pack: OfflinePack,
  startedAt: string,
) {
  const source = await client.query(
    `select event.id from public.events event
    join public.event_challenges challenge on challenge.event_id = event.id
    where event.id = $1 and challenge.id = $2
      and public.offline_content_was_available('event',event.id,event.authoring_status,event.version,$3,$5)
      and public.offline_content_was_available('challenge',challenge.id,challenge.status,challenge.version,$4,$5)
      and event.starts_at <= $5 and event.ends_at > $5
      and (not exists (select 1 from public.campaign_events membership join public.campaigns campaign on campaign.id=membership.campaign_id
          where membership.event_id=event.id and campaign.published_at <= $5)
        or exists (select 1 from public.campaign_events membership join public.campaigns campaign on campaign.id=membership.campaign_id
          where membership.event_id=event.id and campaign.published_at <= $5 and (campaign.retired_at is null or campaign.retired_at > $5)
          and campaign.starts_at <= $5 and campaign.ends_at > $5))`,
    [
      pack.event.eventId,
      pack.challengeId,
      pack.event.version,
      pack.challengeVersion,
      startedAt,
    ],
  );
  if (!source.rows.length)
    throw new OfflineRejection('OFFLINE_CONTENT_UNAVAILABLE');
  for (const question of pack.questions) {
    const result = await client.query(
      `select id from public.challenge_questions where id=$1 and challenge_id=$2
      and public.offline_content_was_available('question',id,status,version,$3,$4)`,
      [question.id, pack.challengeId, question.version, startedAt],
    );
    if (!result.rows.length)
      throw new OfflineRejection('OFFLINE_CONTENT_UNAVAILABLE');
  }
}

async function distance(
  client: pg.PoolClient,
  a: OfflineLocation,
  b: Pick<OfflineLocation, 'latitude' | 'longitude'>,
) {
  const result = await client.query<{ distance: number }>(
    `select st_distance(
    st_setsrid(st_makepoint($1,$2),4326)::geography,st_setsrid(st_makepoint($3,$4),4326)::geography) as distance`,
    [a.longitude, a.latitude, b.longitude, b.latitude],
  );
  return result.rows[0]!.distance;
}

async function validateMovement(
  client: pg.PoolClient,
  pack: OfflinePack,
  input: OfflineSubmission,
  receivedAt: Date,
  options: Options,
) {
  const start = input.startLocation;
  const finish = input.finishLocation;
  if (
    evaluateLocationTiming(start.acquiredAt, new Date(input.startedAt))
      .outcome !== 'valid' ||
    evaluateLocationTiming(finish.acquiredAt, new Date(input.finishedAt))
      .outcome !== 'valid' ||
    Date.parse(finish.acquiredAt) < Date.parse(start.acquiredAt)
  )
    throw new OfflineRejection('OFFLINE_LOCATION_UNVERIFIABLE');
  const reachable = evaluateReachabilityWithAccuracy(
    await distance(client, start, pack.event),
    pack.event.radiusMetres,
    start.accuracyMetres,
  );
  if (reachable.status !== 'reachable')
    throw new OfflineRejection(
      reachable.status === 'unreachable'
        ? 'OFFLINE_UNREACHABLE'
        : 'OFFLINE_LOCATION_UNVERIFIABLE',
    );
  // An extremely imprecise finish sample cannot corroborate movement.
  if (finish.accuracyMetres > pack.event.radiusMetres)
    throw new OfflineRejection('OFFLINE_LOCATION_UNVERIFIABLE');
  const within = evaluateJourney({
    distanceMetres: await distance(client, start, finish),
    previousAccuracyMetres: start.accuracyMetres,
    currentAccuracyMetres: finish.accuracyMetres,
    previousReceivedAt: new Date(start.acquiredAt),
    currentReceivedAt: new Date(finish.acquiredAt),
    maxPlausibleSpeedMetresPerSecond: options.maxSpeed,
  });
  if (within.outcome === 'too_fast')
    throw new OfflineRejection('OFFLINE_JOURNEY_TOO_FAST');
  const prior = await client.query<{
    id: string;
    latitude: number;
    longitude: number;
    accuracy_metres: number;
    acquired_at: Date;
    received_at: Date;
    evidence_origin: string;
  }>(
    `select * from public.movement_evidence
    where player_id=$1 and expires_at > $2
      and exists (select 1 from public.movement_eligibility_decisions decision
        where decision.movement_evidence_id = movement_evidence.id
          and decision.reachability_status = 'reachable'
          and decision.journey_outcome in ('baseline','same_event','plausible'))
      and (case when evidence_origin='offline' then acquired_at else received_at end) <= $3
    order by (case when evidence_origin='offline' then acquired_at else received_at end) desc limit 1`,
    [pack.playerId, receivedAt, start.acquiredAt],
  );
  const anchor = prior.rows[0];
  // Reconnecting may already have produced a newer online observation. Check
  // both neighbours rather than rejecting every late sample.
  const following = await client.query<(typeof prior.rows)[number]>(
    `
    select * from public.movement_evidence where player_id=$1 and expires_at > $2
      and exists (select 1 from public.movement_eligibility_decisions decision
        where decision.movement_evidence_id = movement_evidence.id
          and decision.reachability_status = 'reachable'
          and decision.journey_outcome in ('baseline','same_event','plausible'))
      and (case when evidence_origin='offline' then acquired_at else received_at end) > $3
    order by (case when evidence_origin='offline' then acquired_at else received_at end) asc limit 1`,
    [pack.playerId, receivedAt, start.acquiredAt],
  );
  const next = following.rows[0];
  if (next) {
    const decision = evaluateJourney({
      distanceMetres: await distance(client, start, next),
      previousAccuracyMetres: start.accuracyMetres,
      currentAccuracyMetres: next.accuracy_metres,
      previousReceivedAt: new Date(start.acquiredAt),
      currentReceivedAt:
        next.evidence_origin === 'offline'
          ? next.acquired_at
          : next.received_at,
      maxPlausibleSpeedMetresPerSecond: options.maxSpeed,
    });
    if (decision.outcome === 'too_fast')
      throw new OfflineRejection('OFFLINE_JOURNEY_TOO_FAST');
  }
  let journey: ReturnType<typeof evaluateJourney> | undefined;
  if (anchor) {
    const anchorTime =
      anchor.evidence_origin === 'offline'
        ? anchor.acquired_at
        : anchor.received_at;
    if (anchorTime.getTime() > Date.parse(start.acquiredAt))
      throw new OfflineRejection('OFFLINE_MOVEMENT_CONFLICT');
    journey = evaluateJourney({
      distanceMetres: await distance(client, start, anchor),
      previousAccuracyMetres: anchor.accuracy_metres,
      currentAccuracyMetres: start.accuracyMetres,
      previousReceivedAt: anchorTime,
      currentReceivedAt: new Date(start.acquiredAt),
      maxPlausibleSpeedMetresPerSecond: options.maxSpeed,
    });
    if (journey.outcome === 'too_fast')
      throw new OfflineRejection('OFFLINE_JOURNEY_TOO_FAST');
  }
  const evidenceId = randomUUID();
  await client.query(
    `insert into public.movement_evidence
    (id,player_id,event_id,latitude,longitude,accuracy_metres,acquired_at,received_at,expires_at,created_at,evidence_origin,offline_pack_id)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$8,'offline',$10)`,
    [
      evidenceId,
      pack.playerId,
      pack.event.eventId,
      start.latitude,
      start.longitude,
      start.accuracyMetres,
      start.acquiredAt,
      receivedAt,
      new Date(receivedAt.getTime() + options.retentionMs),
      pack.packId,
    ],
  );
  await client.query(
    `insert into public.movement_eligibility_decisions
    (id,movement_evidence_id,prior_movement_evidence_id,reachability_status,journey_outcome,distance_metres,
     uncertainty_adjusted_distance_metres,elapsed_milliseconds,required_speed_metres_per_second,max_plausible_speed_metres_per_second,created_at,time_basis)
    values ($1,$2,$3,'reachable',$4,$5,$6,$7,$8,$9,$10,'validated_offline_claim')`,
    [
      randomUUID(),
      evidenceId,
      anchor?.id ?? null,
      journey?.outcome ?? 'baseline',
      journey?.distanceMetres ?? null,
      journey?.uncertaintyAdjustedDistanceMetres ?? null,
      journey?.elapsedMilliseconds ?? null,
      journey?.requiredSpeedMetresPerSecond ?? null,
      options.maxSpeed,
      receivedAt,
    ],
  );
}

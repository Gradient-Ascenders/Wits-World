import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';

import type { TrustRestrictionService } from '../trust/trust-restrictions.js';
import type { TrustService } from '../trust/trust-service.js';

import { createEventDiscoveryService } from '../events/event-discovery.js';
import {
  evaluateReachabilityWithAccuracy,
  maximumEventLocationAccuracy,
} from '../events/location-claim.js';
import { evaluateJourney } from '../events/journey-evaluation.js';
import { calculateChallengeTiming } from './challenge-timing.js';
import {
  CHALLENGE_REWARD_POLICY_VERSION,
  type RewardCardRarity,
} from './challenge-reward-policy.js';
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
  validateOfflineLocationTiming,
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
  trustRestrictions?: Pick<TrustRestrictionService, 'assertAllowed'>;
  trustService?: Pick<TrustService, 'recordSubmissionConflict'>;
}

interface OfflinePackSource extends pg.QueryResultRow {
  id: string;
  event_id: string;
  version: number;
  event_version: number;
  format: OfflinePack['format'];
  placement_assignment_id: string | null;
  next_boundary: Date | null;
}

interface OfflinePackQuestion extends pg.QueryResultRow {
  id: string;
  challenge_id: string;
  version: number;
  prompt: string;
  difficulty: 1 | 2 | 3;
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
        if (options.trustRestrictions) {
          await options.trustRestrictions.assertAllowed(
            playerId,
            'online_verification_required',
            client,
          );
          await options.trustRestrictions.assertAllowed(
            playerId,
            'location_reward_challenge_hold',
            client,
          );
        }
        const now = clock();
        const events = await createEventDiscoveryService(client, {
          clock: () => now,
        }).list();
        const result: Array<{ pack: OfflinePack; packToken: string }> = [];
        const eligible = events.filter(
          (event) =>
            eventIds.includes(event.eventId) &&
            event.availability !== 'ended' &&
            Date.parse(event.startsAt) <
              now.getTime() + OFFLINE_PACK_LIFETIME_MS,
        );
        if (!eligible.length) {
          await client.query('commit');
          return result;
        }
        // A fixed number of round trips, all on the same read-only snapshot.
        // Never issue per-event or per-question reads against the remote database.
        const sources = await client.query<OfflinePackSource>(
          `select challenge.id, challenge.version, event.id::text as event_id,
                  event.version as event_version, challenge.format,
                  placement.placement_assignment_id::text, placement.next_boundary
             from public.event_challenges challenge join public.events event on event.id = challenge.event_id
             left join lateral (
               select location.placement_assignment_id,
                      ((((($3::timestamptz at time zone policy.rotation_timezone) -
                          (policy.rotation_local_time - time '00:00'))::date + 1)::timestamp +
                          (policy.rotation_local_time - time '00:00'))
                          at time zone policy.rotation_timezone) as next_boundary
                 from public.event_placement_state state
                 join public.event_placement_policy_versions policy
                   on policy.id = state.current_policy_version_id
                 cross join lateral public.resolve_event_placement_location(event.id, $3) location
                where state.singleton = true
             ) placement on true
            where event.id = any($1::uuid[]) and challenge.status = 'published'
              and not exists (select 1 from public.challenge_attempts where player_id = $2 and event_id = event.id)
            order by event.id, challenge.id`,
          [eligible.map((event) => event.eventId), playerId, now],
        );
        if (!sources.rows.length) {
          await client.query('commit');
          return result;
        }
        const published = await client.query<OfflinePackQuestion>(
          `select id, challenge_id, version, prompt, difficulty
             from public.challenge_questions
            where challenge_id = any($1::uuid[]) and status = 'published'
            order by id`,
          [sources.rows.map((source) => source.id)],
        );
        const candidates = eligible.flatMap((event) => {
          const challenge = sources.rows.find(
            (source) => source.event_id === event.eventId,
          );
          if (!challenge) return [];
          const questions = published.rows.filter(
            (question) => question.challenge_id === challenge.id,
          );
          if (questions.length < 5) return [];
          return [
            {
              event,
              challenge,
              questions: selectChallengeQuestions(questions),
            },
          ];
        });
        if (!candidates.length) {
          await client.query('commit');
          return result;
        }
        const questionIds = (format: OfflinePack['format']) =>
          candidates
            .filter((candidate) => candidate.challenge.format === format)
            .flatMap((candidate) =>
              candidate.questions.map((question) => question.id),
            );
        const items = await client.query<{
          question_id: string;
          id: string;
          text: string;
        }>(
          `select question_id::text, id, choice_text as text from public.challenge_choices
            where question_id = any($1::uuid[])
           union all
           select question_id::text, id, item_text as text from public.challenge_ordering_items
            where question_id = any($2::uuid[])
           order by question_id, id`,
          [questionIds('multiple_choice'), questionIds('ordering')],
        );
        const itemsByQuestion = new Map<
          string,
          Array<{ id: string; text: string }>
        >();
        for (const item of items.rows) {
          const group = itemsByQuestion.get(item.question_id) ?? [];
          group.push({ id: item.id, text: item.text });
          itemsByQuestion.set(item.question_id, group);
        }
        const catalogue = await client.query<{
          id: string;
          rarity: RewardCardRarity;
        }>(
          `select id::text as id, rarity from public.card_definitions
           where is_active = true and authoring_status = 'published' and reward_eligible = true
           order by id`,
        );
        for (const { event, challenge, questions } of candidates) {
          const assignmentId = challenge.placement_assignment_id;
          const selected: OfflinePack['questions'] = questions.map(
            (question) => {
              const options = itemsByQuestion.get(question.id) ?? [];
              if (options.length !== 4)
                throw new Error(
                  'Published offline question has invalid options.',
                );
              return {
                id: question.id,
                version: question.version,
                prompt: question.prompt,
                difficulty: question.difficulty,
                options: shuffleChallengeItems(options),
              };
            },
          );
          const validFromMs = Math.max(
            now.getTime(),
            Date.parse(event.startsAt),
          );
          const validUntilMs = Math.min(
            Date.parse(event.endsAt),
            now.getTime() + OFFLINE_PACK_LIFETIME_MS,
            ...(assignmentId ? [challenge.next_boundary!.getTime()] : []),
          );
          if (validUntilMs <= validFromMs) continue;
          const pack: OfflinePack = {
            version: 1,
            packId: randomUUID(),
            playerId,
            locationPolicy: 'arrival-v1',
            issuedAt: now.toISOString(),
            rewardContext: {
              policyVersion: CHALLENGE_REWARD_POLICY_VERSION,
              cards: catalogue.rows.map((card) => ({
                cardDefinitionId: card.id,
                rarity: card.rarity,
              })),
            },
            validFrom: new Date(validFromMs).toISOString(),
            validUntil: new Date(validUntilMs).toISOString(),
            ...(assignmentId ? { placementAssignmentId: assignmentId } : {}),
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
      const submissionDigest = digestOfflineSubmission(pack, input);
      const client = await database.connect();
      let idempotencyPayloadConflict = false;
      let released = false;
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
          offline_submission_digest: Buffer | null;
        }>(
          `
          select id, offline_client_attempt_id, offline_pack_id, offline_submission_digest
          from public.challenge_attempts
          where player_id = $1 and (event_id = $2 or offline_client_attempt_id = $3)
          order by (offline_client_attempt_id = $3) desc, id
        `,
          [playerId, pack.event.eventId, input.clientAttemptId],
        );
        if (existing.rows.length) {
          const row = existing.rows[0]!;
          const sameClientAttempt =
            row.offline_client_attempt_id === input.clientAttemptId;
          const samePack = row.offline_pack_id === pack.packId;
          const samePayload =
            row.offline_submission_digest === null ||
            row.offline_submission_digest.equals(submissionDigest);

          if (!sameClientAttempt || !samePack || !samePayload) {
            idempotencyPayloadConflict =
              sameClientAttempt && (!samePack || !samePayload);
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
           attempt_origin, offline_client_attempt_id, offline_pack_id, offline_pack_issued_at, synced_at,
           offline_submission_digest, placement_assignment_id)
          values ($1,$2,$3,$4,$5,$6,$7,$8,'offline',$9,$10,$11,$12,$13::bytea,$14)`,
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
            submissionDigest,
            pack.placementAssignmentId ?? null,
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
          ...(pack.rewardContext
            ? { offlineRewardContext: pack.rewardContext }
            : {}),
          scoreCorrect: score.scoreCorrect,
        });
        const attempt = await createChallengeAttemptReader(
          client,
        ).findByPlayerAndAttempt(playerId, attemptId);
        await client.query('commit');
        return { created: true, attempt };
      } catch (error) {
        await client.query('rollback');
        client.release();
        released = true;

        if (idempotencyPayloadConflict) {
          try {
            await options.trustService?.recordSubmissionConflict({
              playerId,
              operation: 'offline_challenge_sync',
              resourceIdentifier: pack.event.eventId,
              submissionId: input.clientAttemptId,
            });
          } catch {
            // Preserve the authoritative offline conflict response. A retry can
            // attempt trust ingestion again without changing attempt state.
          }
        }
        throw error;
      } finally {
        if (!released) client.release();
      }
    },
  };
}

function digestOfflineSubmission(
  pack: OfflinePack,
  input: OfflineSubmission,
): Buffer {
  const canonicalAnswers = [...input.answers]
    .map((answer) => ({
      questionId: answer.questionId,
      answeredAt: new Date(answer.answeredAt).toISOString(),
      optionIds: [...answer.optionIds],
    }))
    .sort((left, right) => left.questionId.localeCompare(right.questionId));

  return createHash('sha256')
    .update(
      stableJson({
        packId: pack.packId,
        startedAt: new Date(input.startedAt).toISOString(),
        finishedAt: new Date(input.finishedAt).toISOString(),
        answers: canonicalAnswers,
      }),
    )
    .digest();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function validateSources(
  client: pg.PoolClient,
  pack: OfflinePack,
  startedAt: string,
) {
  if (pack.placementAssignmentId) {
    const assignment = await client.query(
      `select assignment.id from public.event_placement_assignments assignment
        cross join lateral public.resolve_event_placement_location(
          assignment.event_id,$3::timestamptz) location
        where assignment.id=$1::uuid and assignment.event_id=$2::uuid
          and assignment.starts_at <= $3::timestamptz
          and (assignment.ends_at is null or assignment.ends_at > $3::timestamptz)
          and location.is_available=true
          and location.placement_assignment_id=assignment.id`,
      [pack.placementAssignmentId, pack.event.eventId, startedAt],
    );
    if (!assignment.rows[0]) {
      throw new OfflineRejection('OFFLINE_CONTENT_UNAVAILABLE');
    }
  } else {
    const managed = await client.query(
      `select 1 from public.event_placement_portability
        where event_id=$1::uuid and effective_at <= $2::timestamptz limit 1`,
      [pack.event.eventId, startedAt],
    );
    if (managed.rows[0]) {
      throw new OfflineRejection('OFFLINE_CONTENT_UNAVAILABLE');
    }
  }
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
  const arrivalPolicy = pack.locationPolicy === 'arrival-v1';
  validateOfflineLocationTiming(pack, input);
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
  if (
    !arrivalPolicy &&
    finish &&
    finish.accuracyMetres >
      maximumEventLocationAccuracy(pack.event.radiusMetres)
  )
    throw new OfflineRejection('OFFLINE_LOCATION_UNVERIFIABLE');
  const within =
    !arrivalPolicy && finish
      ? evaluateJourney({
          distanceMetres: await distance(client, start, finish),
          previousAccuracyMetres: start.accuracyMetres,
          currentAccuracyMetres: finish.accuracyMetres,
          previousReceivedAt: new Date(start.acquiredAt),
          currentReceivedAt: new Date(finish.acquiredAt),
          maxPlausibleSpeedMetresPerSecond: options.maxSpeed,
        })
      : null;
  if (within?.outcome === 'too_fast')
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

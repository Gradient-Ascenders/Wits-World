import { randomInt } from 'node:crypto';

import type pg from 'pg';

import type {
  ChallengeAnswerSubmissionQueryable,
  ChallengeAttemptCompletionFinalizer,
  ChallengeAttemptFinalizationInput,
} from './challenge-answer-submission.js';
import {
  calculateChallengeRewardPlan,
  type RewardCardRarity,
  type RewardRandomInt,
} from './challenge-reward-policy.js';

interface ChallengeAttemptRow extends pg.QueryResultRow {
  attempt_id: string;
  average_difficulty: string;
  event_id: string;
  status: 'in_progress' | 'completed';
}

interface CompletionRow extends pg.QueryResultRow {
  completion_id: string;
}

interface CardDefinitionRow extends pg.QueryResultRow {
  card_definition_id: string;
  rarity: RewardCardRarity;
}

export interface ChallengeAttemptCompletionFinalizerOptions {
  randomInt?: RewardRandomInt;
  rewardPolicyVersion?: string;
}

const DEFAULT_REWARD_POLICY_VERSION = 'basic-v1';

export function createChallengeAttemptCompletionFinalizer(
  options: ChallengeAttemptCompletionFinalizerOptions = {},
): ChallengeAttemptCompletionFinalizer {
  const randomInteger = options.randomInt ?? randomInt;
  const rewardPolicyVersion =
    options.rewardPolicyVersion ?? DEFAULT_REWARD_POLICY_VERSION;

  return {
    async finalizeAttempt(database, input) {
      const attempt = await loadAttempt(database, input);

      if (!attempt) {
        throw new Error(
          'Challenge attempt finalization requires an owned persisted attempt.',
        );
      }

      if (attempt.status === 'completed') {
        await assertExistingCompletion(database, input);
        return;
      }

      const cardDefinitions = await loadActiveCardDefinitions(database);
      const rewardPlan = calculateChallengeRewardPlan(
        input.scoreCorrect,
        Number(attempt.average_difficulty),
        [...new Set(cardDefinitions.map((card) => card.rarity))],
        randomInteger,
      );

      const selectedCardDefinitionIds = rewardPlan.cardRarities.map(
        (rarity) =>
          chooseCardDefinition(
            cardDefinitions.filter((card) => card.rarity === rarity),
            randomInteger,
          ).card_definition_id,
      );

      const completion = await insertCompletion(database, input, attempt, {
        coinsAwarded: rewardPlan.coinsAwarded,
        rewardPolicyVersion,
      });

      if (!completion) {
        await assertExistingCompletion(database, input);
        return;
      }

      if (rewardPlan.coinsAwarded > 0) {
        await database.query(
          `
            insert into public.player_wallets (player_id, coin_balance)
            values ($1::uuid, $2)
            on conflict (player_id)
            do update set
              coin_balance = public.player_wallets.coin_balance + excluded.coin_balance,
              updated_at = now()
          `,
          [input.playerId, rewardPlan.coinsAwarded],
        );

        await database.query(
          `
            insert into public.coin_ledger_entries (
              player_id, amount, reason, completion_id
            ) values ($1::uuid, $2, 'event_reward', $3::uuid)
          `,
          [input.playerId, rewardPlan.coinsAwarded, completion.completion_id],
        );
      }

      for (const cardDefinitionId of selectedCardDefinitionIds) {
        await database.query(
          `
            insert into public.player_cards (
              player_id, card_definition_id, source_completion_id,
              acquisition_kind
            ) values ($1::uuid, $2::uuid, $3::uuid, 'event_reward')
          `,
          [input.playerId, cardDefinitionId, completion.completion_id],
        );
      }

      const attemptUpdate = await database.query<{ attempt_id: string }>(
        `
          update public.challenge_attempts
             set status = 'completed',
                 completed_at = $3,
                 completion_reason = $4,
                 score_correct = $5,
                 updated_at = now()
           where id = $1::uuid
             and player_id = $2::uuid
             and status = 'in_progress'
         returning id::text as attempt_id
        `,
        [
          input.attemptId,
          input.playerId,
          input.completedAt,
          input.completionReason,
          input.scoreCorrect,
        ],
      );

      if (attemptUpdate.rows.length !== 1) {
        throw new Error(
          'Challenge attempt finalization did not complete the attempt.',
        );
      }
    },
  };
}

async function loadAttempt(
  database: ChallengeAnswerSubmissionQueryable,
  input: ChallengeAttemptFinalizationInput,
): Promise<ChallengeAttemptRow | null> {
  const result = await database.query<ChallengeAttemptRow>(
    `
      select
        id::text as attempt_id,
        event_id::text as event_id,
        status,
        average_difficulty::text as average_difficulty
      from public.challenge_attempts
      where id = $1::uuid
        and player_id = $2::uuid
    `,
    [input.attemptId, input.playerId],
  );

  return result.rows[0] ?? null;
}

async function assertExistingCompletion(
  database: ChallengeAnswerSubmissionQueryable,
  input: ChallengeAttemptFinalizationInput,
): Promise<void> {
  const result = await database.query<CompletionRow>(
    `
      select id::text as completion_id
      from public.event_completions
      where attempt_id = $1::uuid
        and player_id = $2::uuid
    `,
    [input.attemptId, input.playerId],
  );

  if (!result.rows[0]) {
    throw new Error(
      'Completed challenge attempt is missing its persisted completion.',
    );
  }
}

async function loadActiveCardDefinitions(
  database: ChallengeAnswerSubmissionQueryable,
): Promise<CardDefinitionRow[]> {
  const result = await database.query<CardDefinitionRow>(
    `
      select id::text as card_definition_id, rarity
      from public.card_definitions
      where is_active = true
      order by id
    `,
    [],
  );

  return result.rows;
}

async function insertCompletion(
  database: ChallengeAnswerSubmissionQueryable,
  input: ChallengeAttemptFinalizationInput,
  attempt: ChallengeAttemptRow,
  reward: { coinsAwarded: number; rewardPolicyVersion: string },
): Promise<CompletionRow | null> {
  const result = await database.query<CompletionRow>(
    `
      insert into public.event_completions (
        attempt_id,
        player_id,
        event_id,
        score_correct,
        average_difficulty,
        coins_awarded,
        reward_policy_version,
        completed_at
      ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8)
      on conflict (attempt_id) do nothing
      returning id::text as completion_id
    `,
    [
      input.attemptId,
      input.playerId,
      attempt.event_id,
      input.scoreCorrect,
      Number(attempt.average_difficulty),
      reward.coinsAwarded,
      reward.rewardPolicyVersion,
      input.completedAt,
    ],
  );

  return result.rows[0] ?? null;
}

function chooseCardDefinition(
  candidates: CardDefinitionRow[],
  randomInteger: RewardRandomInt,
): CardDefinitionRow {
  const selected = candidates[randomInteger(candidates.length)];

  if (!selected) {
    throw new Error('Reward card selection returned an invalid result.');
  }

  return selected;
}

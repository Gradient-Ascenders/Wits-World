import { randomInt as secureRandomInt } from 'node:crypto';
import type pg from 'pg';

import {
  TERRITORY_POLICY_VERSION,
  type TerritoryQueryable,
} from './territory-grants.js';

export type TerritoryOwnerBonusOutcome =
  'awarded' | 'not_eligible' | 'score_too_low' | 'already_claimed';

export interface TerritoryOwnerBonusService {
  snapshotAttempt(
    client: TerritoryQueryable,
    input: {
      attemptId: string;
      playerId: string;
      eventId: string;
      startedAt: Date;
    },
  ): Promise<void>;
  finalizeAttempt(
    client: TerritoryQueryable,
    input: {
      attemptId: string;
      playerId: string;
      completionId: string;
      scoreCorrect: number;
      completedAt: Date;
    },
  ): Promise<void>;
}

type RandomInt = (maxExclusive: number) => number;

interface SnapshotRow extends pg.QueryResultRow {
  territory_policy_version: string;
  zone_id: string | null;
  eligibility_outcome: 'eligible' | 'not_eligible' | 'already_claimed';
  bonus_date: string;
}

interface PolicyRow extends pg.QueryResultRow {
  owner_bonus_minimum_correct_answers: number;
}

interface CardRow extends pg.QueryResultRow {
  card_definition_id: string;
}

export function createTerritoryOwnerBonusService(
  randomInt: RandomInt = secureRandomInt,
): TerritoryOwnerBonusService {
  return {
    async snapshotAttempt(client, input) {
      // Follow the shared player -> zone lock order used by ranked settlement
      // and account deletion. This keeps the challenge-start snapshot atomic
      // with concurrent ownership and lifecycle transitions.
      await client.query(
        `select id
           from public.players
          where id = $1::uuid
          for share`,
        [input.playerId],
      );
      await client.query(
        `select id
           from public.territory_zones
          where policy_version = $1
            and status = 'active'
          order by id
          for share`,
        [TERRITORY_POLICY_VERSION],
      );

      const result = await client.query<{
        zone_id: string | null;
        owner_player_id: string | null;
        bonus_date: string;
        already_claimed: boolean;
      }>(
        `with policy as (
           select policy_version, daily_cap_timezone
             from private.territory_policy_versions
            where policy_version = $3
         ), placement as (
           select effective_location
             from public.resolve_event_placement_location(
               $2::uuid,
               $4::timestamptz
             )
            where is_available = true
         ), matching_zone as (
           select zone.id::text as zone_id
             from public.territory_zones zone
             cross join placement
            where zone.policy_version = $3
              and zone.status = 'active'
              and st_contains(zone.area, placement.effective_location::geometry)
            order by zone.id
            limit 2
         ), resolved_zone as (
           select case when count(*) = 1 then min(zone_id) else null end as zone_id
             from matching_zone
         ), current_owner as (
           select version.owner_player_id::text as owner_player_id
             from resolved_zone resolved
             join private.territory_current_ownership current_state
               on current_state.zone_id = resolved.zone_id::uuid
             join private.territory_ownership_versions version
               on version.id = current_state.ownership_version_id
         )
         select resolved.zone_id,
                owner.owner_player_id,
                timezone(policy.daily_cap_timezone, $4::timestamptz)::date::text
                  as bonus_date,
                exists (
                  select 1
                    from private.territory_owner_bonus_decisions decision
                   where decision.player_id = $1::uuid
                     and decision.bonus_date = timezone(
                       policy.daily_cap_timezone,
                       $4::timestamptz
                     )::date
                     and decision.outcome = 'awarded'
                ) as already_claimed
           from policy
           cross join resolved_zone resolved
           left join current_owner owner on true`,
        [
          input.playerId,
          input.eventId,
          TERRITORY_POLICY_VERSION,
          input.startedAt,
        ],
      );
      const row = result.rows[0];
      if (!row) return;

      const eligibilityOutcome = row.already_claimed
        ? 'already_claimed'
        : row.zone_id !== null && row.owner_player_id === input.playerId
          ? 'eligible'
          : 'not_eligible';

      await client.query(
        `insert into private.territory_owner_bonus_snapshots (
           attempt_id, player_id, territory_policy_version, zone_id,
           eligibility_outcome, bonus_date, started_at
         ) values (
           $1::uuid, $2::uuid, $3, $4::uuid,
           $5, $6::date, $7::timestamptz
         )
         on conflict (attempt_id) do nothing`,
        [
          input.attemptId,
          input.playerId,
          TERRITORY_POLICY_VERSION,
          eligibilityOutcome === 'eligible' ? row.zone_id : null,
          eligibilityOutcome,
          row.bonus_date,
          input.startedAt,
        ],
      );
    },

    async finalizeAttempt(client, input) {
      const existing = await client.query<{ id: string }>(
        `select id::text
           from private.territory_owner_bonus_decisions
          where attempt_id = $1::uuid`,
        [input.attemptId],
      );
      if (existing.rows[0]) return;

      const snapshot = await client.query<SnapshotRow>(
        `select territory_policy_version, zone_id::text,
                eligibility_outcome, bonus_date::text
           from private.territory_owner_bonus_snapshots
          where attempt_id = $1::uuid
            and player_id = $2::uuid
          for update`,
        [input.attemptId, input.playerId],
      );
      const row = snapshot.rows[0];
      if (!row) return;

      if (row.eligibility_outcome === 'not_eligible') {
        await insertNonAwardDecision(client, input, row, 'not_eligible');
        return;
      }
      if (row.eligibility_outcome === 'already_claimed') {
        await insertNonAwardDecision(client, input, row, 'already_claimed');
        return;
      }

      const policy = await client.query<PolicyRow>(
        `select owner_bonus_minimum_correct_answers
           from private.territory_policy_versions
          where policy_version = $1`,
        [row.territory_policy_version],
      );
      const minimum = policy.rows[0]?.owner_bonus_minimum_correct_answers;
      if (minimum === undefined) {
        throw new Error('Territory owner bonus policy is unavailable.');
      }
      if (input.scoreCorrect < minimum) {
        await insertNonAwardDecision(client, input, row, 'score_too_low');
        return;
      }

      const cards = await client.query<CardRow>(
        `select id::text as card_definition_id
           from public.card_definitions
          where is_active = true
            and authoring_status = 'published'
            and reward_eligible = true
            and rarity = 'common'
            and evolves_from_definition_id is null
          order by id`,
      );
      if (cards.rows.length === 0) {
        throw new Error('Territory owner bonus has no eligible Common card.');
      }
      const chosen = cards.rows[randomInt(cards.rows.length)];
      if (!chosen)
        throw new Error('Territory owner bonus card selection failed.');

      const awarded = await client.query<{ id: string }>(
        `insert into private.territory_owner_bonus_decisions (
           attempt_id, player_id, territory_policy_version, bonus_date,
           outcome, card_definition_id, decided_at
         ) values (
           $1::uuid, $2::uuid, $3, $4::date,
           'awarded', $5::uuid, $6::timestamptz
         )
         on conflict (player_id, bonus_date)
           where outcome = 'awarded'
         do nothing
         returning id::text`,
        [
          input.attemptId,
          input.playerId,
          row.territory_policy_version,
          row.bonus_date,
          chosen.card_definition_id,
          input.completedAt,
        ],
      );
      const decision = awarded.rows[0];
      if (!decision) {
        await insertNonAwardDecision(client, input, row, 'already_claimed');
        return;
      }

      await client.query(
        `insert into public.player_cards (
           player_id, card_definition_id, source_completion_id,
           source_territory_bonus_id, acquisition_kind, acquired_at
         ) values (
           $1::uuid, $2::uuid, $3::uuid,
           $4::uuid, 'event_reward', $5::timestamptz
         )`,
        [
          input.playerId,
          chosen.card_definition_id,
          input.completionId,
          decision.id,
          input.completedAt,
        ],
      );
    },
  };
}

async function insertNonAwardDecision(
  client: TerritoryQueryable,
  input: {
    attemptId: string;
    playerId: string;
    completedAt: Date;
  },
  snapshot: SnapshotRow,
  outcome: Exclude<TerritoryOwnerBonusOutcome, 'awarded'>,
): Promise<void> {
  await client.query(
    `insert into private.territory_owner_bonus_decisions (
       attempt_id, player_id, territory_policy_version, bonus_date,
       outcome, decided_at
     ) values (
       $1::uuid, $2::uuid, $3, $4::date,
       $5, $6::timestamptz
     )
     on conflict (attempt_id) do nothing`,
    [
      input.attemptId,
      input.playerId,
      snapshot.territory_policy_version,
      snapshot.bonus_date,
      outcome,
      input.completedAt,
    ],
  );
}

import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';

import {
  planPlacement,
  sitePairKey,
  validatePlacementEntries,
  type PlacementEntry,
  type PlacementInput,
  type PlacementResult,
} from './placement-planner.js';

type Client = pg.PoolClient;

export class PlacementConflictError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'PlacementConflictError';
  }
}

export interface PlacementPreview {
  planId: string;
  policyVersion: string;
  rotationBucket: string;
  stateVersion: number;
  validUntil: string;
  status: PlacementResult['status'];
  entries: PlacementEntry[];
  zoneCounts: Record<string, number>;
  exceptions: string[];
}

interface StateRow extends pg.QueryResultRow {
  policy_version_id: string;
  current_plan_id: string | null;
  version: string;
  automatic_target: number;
  preferred_assignments_per_zone: number;
  mandatory_assignments_per_zone: number;
  minimum_separation_metres: number;
  replacements_per_rotation: number;
  site_cooldown_buckets: number;
  preview_ttl_minutes: number;
  rotation_bucket: string;
  next_boundary: Date;
  observed_at: Date;
}

interface Snapshot {
  state: StateRow;
  input: PlacementInput;
  digest: string;
  validUntil: Date;
}

interface StoredPlan extends pg.QueryResultRow {
  id: string;
  policy_version_id: string;
  rotation_bucket: string;
  status: string;
  input_digest: string;
  expected_state_version: string;
  valid_until: Date;
  requested_by_player_id: string | null;
  trigger_kind: 'manual' | 'scheduled' | 'rollback' | 'reconcile';
}

export function createPlacementService(database: Pick<pg.Pool, 'connect'>) {
  async function transaction<T>(
    work: (client: Client) => Promise<T>,
  ): Promise<T> {
    const client = await database.connect();
    try {
      await client.query('begin');
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async function createPreview(
    client: Client,
    snapshot: Snapshot,
    trigger: 'manual' | 'scheduled' | 'rollback' | 'reconcile',
    actorId: string | null,
    rollbackSourceId: string | null = null,
    proposed?: PlacementResult,
  ): Promise<PlacementPreview> {
    const result = proposed ?? planPlacement(snapshot.input);
    const id = randomUUID();
    await client.query(
      `insert into public.event_placement_plans
       (id, policy_version_id, rotation_bucket, status, trigger_kind,
        input_digest, expected_state_version, target_assignment_count,
        actual_assignment_count, zone_assignment_counts, exceptions,
        predecessor_plan_id, rollback_source_plan_id, requested_by_player_id,
        valid_until)
       values ($1,$2,$3,'preview',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id,
        snapshot.state.policy_version_id,
        snapshot.state.rotation_bucket,
        trigger,
        snapshot.digest,
        snapshot.state.version,
        snapshot.input.policy.target,
        result.entries.length,
        JSON.stringify(result.zoneCounts),
        JSON.stringify(result.exceptions),
        snapshot.state.current_plan_id,
        rollbackSourceId,
        actorId,
        snapshot.validUntil,
      ],
    );
    for (const [position, entry] of result.entries.entries()) {
      await client.query(
        `insert into public.event_placement_plan_entries
         (plan_id,event_id,site_id,zone_id,position,origin,is_preserved)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          id,
          entry.eventId,
          entry.siteId,
          entry.zoneId,
          position + 1,
          entry.origin,
          entry.preserved,
        ],
      );
    }
    return {
      planId: id,
      policyVersion: snapshot.state.policy_version_id,
      rotationBucket: snapshot.state.rotation_bucket,
      stateVersion: Number(snapshot.state.version),
      validUntil: snapshot.validUntil.toISOString(),
      status: result.status,
      entries: result.entries,
      zoneCounts: result.zoneCounts,
      exceptions: result.exceptions,
    };
  }

  async function applyStored(
    client: Client,
    planId: string,
    expectedVersion: number,
    actorId: string | null,
    reason: string,
  ): Promise<PlacementPreview> {
    const state = await loadState(client, true);
    if (Number(state.version) !== expectedVersion) {
      throw new PlacementConflictError('STALE_PLACEMENT_STATE');
    }
    const planResult = await client.query<StoredPlan>(
      `select id::text,policy_version_id,rotation_bucket::text,status,
              input_digest,expected_state_version,valid_until,
              requested_by_player_id::text,trigger_kind
         from public.event_placement_plans where id=$1::uuid for update`,
      [planId],
    );
    const plan = planResult.rows[0];
    if (!plan || plan.status !== 'preview') {
      throw new PlacementConflictError('PLACEMENT_PREVIEW_UNAVAILABLE');
    }
    if (
      plan.requested_by_player_id !== actorId ||
      plan.policy_version_id !== state.policy_version_id ||
      plan.rotation_bucket !== state.rotation_bucket ||
      Number(plan.expected_state_version) !== expectedVersion ||
      plan.valid_until <= state.observed_at
    ) {
      throw new PlacementConflictError('STALE_PLACEMENT_PREVIEW');
    }
    const snapshot = await loadSnapshot(client, state);
    if (snapshot.digest !== plan.input_digest) {
      throw new PlacementConflictError('STALE_PLACEMENT_PREVIEW');
    }
    const stored = await client.query<{
      event_id: string;
      site_id: string;
      zone_id: string;
      origin: PlacementEntry['origin'];
    }>(
      `select event_id::text,site_id::text,zone_id::text,origin
         from public.event_placement_plan_entries
        where plan_id=$1::uuid order by position`,
      [planId],
    );
    const result =
      plan.trigger_kind === 'rollback'
        ? validatePlacementEntries(
            snapshot.input,
            stored.rows.map((row) => ({
              eventId: row.event_id,
              siteId: row.site_id,
              zoneId: row.zone_id,
              origin: row.origin,
              preserved: false,
            })),
          )
        : planPlacement(snapshot.input);
    const exact =
      result.entries.length === stored.rows.length &&
      result.entries.every((entry, index) => {
        const row = stored.rows[index];
        return (
          row?.event_id === entry.eventId &&
          row.site_id === entry.siteId &&
          row.zone_id === entry.zoneId &&
          row.origin === entry.origin
        );
      });
    if (!exact) throw new PlacementConflictError('STALE_PLACEMENT_PREVIEW');
    if (result.status === 'unserved') {
      throw new PlacementConflictError('PLACEMENT_ZONE_UNSERVED');
    }
    const committed = expectedVersion + 1;
    await client.query(
      `update public.event_placement_plans
          set status=$2, committed_state_version=$3, applied_at=now()
        where id=$1::uuid`,
      [planId, result.status === 'valid' ? 'applied' : 'degraded', committed],
    );
    const current = await client.query<{
      id: string;
      event_id: string;
      site_id: string;
      origin: string;
      policy_version_id: string;
    }>(
      `select id::text,event_id::text,site_id::text,origin,policy_version_id
         from public.event_placement_assignments
        where ends_at is null for update`,
    );
    const retained = new Set<string>();
    for (const assignment of current.rows) {
      if (
        assignment.policy_version_id === state.policy_version_id &&
        result.entries.some(
          (entry) =>
            entry.eventId === assignment.event_id &&
            entry.siteId === assignment.site_id &&
            entry.origin === assignment.origin,
        )
      ) {
        retained.add(`${assignment.event_id}:${assignment.site_id}`);
      } else {
        await client.query(
          `update public.event_placement_assignments
              set ends_at=$2,end_reason=$3 where id=$1::uuid`,
          [assignment.id, state.observed_at, 'superseded_by_plan'],
        );
      }
    }
    for (const entry of result.entries) {
      if (retained.has(`${entry.eventId}:${entry.siteId}`)) continue;
      await client.query(
        `insert into public.event_placement_assignments
         (plan_id,policy_version_id,event_id,site_id,zone_id,origin,starts_at)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          planId,
          state.policy_version_id,
          entry.eventId,
          entry.siteId,
          entry.zoneId,
          entry.origin,
          state.observed_at,
        ],
      );
    }
    await client.query(
      `update public.event_placement_state
          set current_plan_id=$1::uuid,version=$2,updated_at=$3 where singleton=true`,
      [planId, committed, state.observed_at],
    );
    await recordAudit(
      client,
      state,
      committed,
      actorId,
      'apply_plan',
      reason,
      planId,
    );
    return {
      planId,
      policyVersion: state.policy_version_id,
      rotationBucket: state.rotation_bucket,
      stateVersion: committed,
      validUntil: plan.valid_until.toISOString(),
      status: result.status,
      entries: result.entries,
      zoneCounts: result.zoneCounts,
      exceptions: result.exceptions,
    };
  }

  return {
    async nextBoundaryDelayMs() {
      return transaction(async (client) => {
        const state = await loadState(client);
        return Math.max(
          1_000,
          state.next_boundary.getTime() - state.observed_at.getTime(),
        );
      });
    },
    preview(actorId: string) {
      return transaction(async (client) => {
        const snapshot = await loadSnapshot(client);
        return createPreview(client, snapshot, 'manual', actorId);
      });
    },
    apply(
      actorId: string,
      planId: string,
      expectedVersion: number,
      reason: string,
    ) {
      return transaction((client) =>
        applyStored(client, planId, expectedVersion, actorId, reason),
      );
    },
    override(input: {
      actorId: string;
      kind: 'pin' | 'site_exclusion' | 'automation_pause';
      eventId?: string;
      siteId?: string;
      durationHours: number;
      expectedVersion: number;
      reason: string;
      idempotencyKey: string;
    }) {
      return transaction(async (client) => {
        const state = await loadState(client, true);
        const requestHash = createHash('sha256')
          .update(
            JSON.stringify({
              kind: input.kind,
              eventId: input.eventId ?? null,
              siteId: input.siteId ?? null,
              durationHours: input.durationHours,
              expectedVersion: input.expectedVersion,
              reason: input.reason,
            }),
          )
          .digest('hex');
        const previous = await client.query<{
          id: string;
          request_hash: string;
        }>(
          `select id::text,request_hash from public.event_placement_overrides
            where actor_player_id=$1::uuid and idempotency_key=$2::uuid`,
          [input.actorId, input.idempotencyKey],
        );
        if (previous.rows[0]) {
          if (previous.rows[0].request_hash !== requestHash) {
            throw new PlacementConflictError('PLACEMENT_IDEMPOTENCY_CONFLICT');
          }
          return { overrideId: previous.rows[0].id, replayed: true };
        }
        assertVersion(state, input.expectedVersion);
        if (!Number.isInteger(input.durationHours) || input.durationHours < 1) {
          throw new PlacementConflictError('INVALID_OVERRIDE_DURATION');
        }
        const limits = await client.query<{
          maximum_pin_hours: number;
          maximum_pause_hours: number;
          maximum_exclusion_hours: number;
        }>(
          `select maximum_pin_hours,maximum_pause_hours,maximum_exclusion_hours
             from public.event_placement_policy_versions where id=$1`,
          [state.policy_version_id],
        );
        const policy = limits.rows[0]!;
        const maximum =
          input.kind === 'pin'
            ? policy.maximum_pin_hours
            : input.kind === 'site_exclusion'
              ? policy.maximum_exclusion_hours
              : policy.maximum_pause_hours;
        if (input.durationHours > maximum || !input.reason.trim()) {
          throw new PlacementConflictError('INVALID_PLACEMENT_OVERRIDE');
        }
        const overrideId = randomUUID();
        await client.query(
          `insert into public.event_placement_overrides
           (id,policy_version_id,kind,event_id,site_id,actor_player_id,
            reason,idempotency_key,request_hash,starts_at,expires_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                   $10::timestamptz + $11::integer * interval '1 hour')`,
          [
            overrideId,
            state.policy_version_id,
            input.kind,
            input.eventId ?? null,
            input.siteId ?? null,
            input.actorId,
            input.reason.trim(),
            input.idempotencyKey,
            requestHash,
            state.observed_at,
            input.durationHours,
          ],
        );
        if (input.kind !== 'automation_pause') {
          const snapshot = await loadSnapshot(client, state);
          const preview = await createPreview(
            client,
            snapshot,
            'manual',
            input.actorId,
          );
          if (preview.status === 'unserved') {
            if (input.kind === 'pin') {
              throw new PlacementConflictError('PLACEMENT_ZONE_UNSERVED');
            }
            await client.query(
              `update public.event_placement_plans
                  set status='failed',failure_code='unserved_zone'
                where id=$1::uuid`,
              [preview.planId],
            );
            await endAssignmentsForSite(
              client,
              input.siteId!,
              state.observed_at,
              'excluded_site',
            );
            await advanceState(client, state);
            await recordAudit(
              client,
              state,
              input.expectedVersion + 1,
              input.actorId,
              'exclude_site',
              input.reason,
              null,
              overrideId,
            );
            return { overrideId, replayed: false };
          }
          const applied = await applyStored(
            client,
            preview.planId,
            input.expectedVersion,
            input.actorId,
            input.reason,
          );
          await recordAudit(
            client,
            state,
            applied.stateVersion,
            input.actorId,
            input.kind === 'pin' ? 'pin' : 'exclude_site',
            input.reason,
            preview.planId,
            overrideId,
          );
        } else {
          await advanceState(client, state);
          await recordAudit(
            client,
            state,
            input.expectedVersion + 1,
            input.actorId,
            'pause',
            input.reason,
            null,
            overrideId,
          );
        }
        return { overrideId, replayed: false };
      });
    },
    endOverride(
      actorId: string,
      overrideId: string,
      expectedVersion: number,
      reason: string,
    ) {
      return transaction(async (client) => {
        const state = await loadState(client, true);
        assertVersion(state, expectedVersion);
        const existing = await client.query<{
          kind: string;
          site_id: string | null;
          event_id: string | null;
        }>(
          `select kind,site_id::text,event_id::text
             from public.event_placement_overrides
            where id=$1::uuid and ended_at is null for update`,
          [overrideId],
        );
        const item = existing.rows[0];
        if (!item)
          throw new PlacementConflictError('PLACEMENT_OVERRIDE_UNAVAILABLE');
        await client.query(
          `update public.event_placement_overrides
              set ended_at=$2,end_reason=$3 where id=$1::uuid`,
          [overrideId, state.observed_at, reason.trim()],
        );
        if (item.kind === 'pin' && item.event_id) {
          await client.query(
            `update public.event_placement_assignments
                set ends_at=$2,end_reason='pin_ended'
              where event_id=$1::uuid and ends_at is null and origin='pin'`,
            [item.event_id, state.observed_at],
          );
        }
        await advanceState(client, state);
        await recordAudit(
          client,
          state,
          expectedVersion + 1,
          actorId,
          'end_override',
          reason,
          null,
          overrideId,
        );
        return { stateVersion: expectedVersion + 1 };
      });
    },
    changeSite(
      actorId: string,
      siteId: string,
      status: 'active' | 'suspended' | 'retired',
      expectedVersion: number,
      reason: string,
    ) {
      return transaction(async (client) => {
        const state = await loadState(client, true);
        assertVersion(state, expectedVersion);
        if (status !== 'active') {
          await endAssignmentsForSite(
            client,
            siteId,
            state.observed_at,
            status === 'suspended' ? 'site_suspended' : 'site_retired',
          );
        }
        const lifecycle =
          status === 'active'
            ? 'activated_at=$3,suspended_at=null'
            : status === 'suspended'
              ? 'suspended_at=$3'
              : 'retired_at=$3';
        const changed = await client.query(
          `update public.event_placement_sites
              set status=$2,version=version+1,${lifecycle},updated_at=$3
            where id=$1::uuid and policy_version_id=$4
              and (status=$5 or ($2='retired' and status='suspended'))
            returning id`,
          [
            siteId,
            status,
            state.observed_at,
            state.policy_version_id,
            status === 'active' ? 'suspended' : 'active',
          ],
        );
        if (!changed.rows[0])
          throw new PlacementConflictError('PLACEMENT_SITE_UNAVAILABLE');
        await advanceState(client, state);
        await recordAudit(
          client,
          state,
          expectedVersion + 1,
          actorId,
          status === 'active'
            ? 'reactivate_site'
            : status === 'suspended'
              ? 'suspend_site'
              : 'retire_site',
          reason,
          null,
        );
        return { stateVersion: expectedVersion + 1 };
      });
    },
    changeZone(
      actorId: string,
      zoneId: string,
      status: 'active' | 'suspended' | 'retired',
      expectedVersion: number,
      reason: string,
    ) {
      return transaction(async (client) => {
        const state = await loadState(client, true);
        assertVersion(state, expectedVersion);
        if (status !== 'active') {
          await client.query(
            `update public.event_placement_assignments
                set ends_at=$2,end_reason=$3
              where zone_id=$1::uuid and ends_at is null`,
            [
              zoneId,
              state.observed_at,
              status === 'suspended' ? 'zone_suspended' : 'zone_retired',
            ],
          );
        }
        const lifecycle =
          status === 'active'
            ? 'activated_at=$3,suspended_at=null'
            : status === 'suspended'
              ? 'suspended_at=$3'
              : 'retired_at=$3';
        const changed = await client.query(
          `update public.event_placement_zones
              set status=$2,version=version+1,${lifecycle},updated_at=$3
            where id=$1::uuid and policy_version_id=$4
              and (status=$5 or ($2='retired' and status='suspended'))
            returning id`,
          [
            zoneId,
            status,
            state.observed_at,
            state.policy_version_id,
            status === 'active' ? 'suspended' : 'active',
          ],
        );
        if (!changed.rows[0])
          throw new PlacementConflictError('PLACEMENT_ZONE_UNAVAILABLE');
        await advanceState(client, state);
        await recordAudit(
          client,
          state,
          expectedVersion + 1,
          actorId,
          status === 'active'
            ? 'reactivate_zone'
            : status === 'suspended'
              ? 'suspend_zone'
              : 'retire_zone',
          reason,
          null,
        );
        return { stateVersion: expectedVersion + 1 };
      });
    },
    approvePortability(
      actorId: string,
      eventId: string,
      expectedVersion: number,
      reason: string,
    ) {
      return transaction(async (client) => {
        const state = await loadState(client, true);
        assertVersion(state, expectedVersion);
        const eligible = await client.query(
          `select event.id from public.events event
            where event.id=$1::uuid and event.authoring_status='published'
              and event.is_published=true
              and exists(select 1 from public.event_challenges challenge
                where challenge.event_id=event.id and challenge.status='published'
                  and (select count(*) from public.challenge_questions question
                       where question.challenge_id=challenge.id
                         and question.status='published') >= 5)
              and not exists(select 1 from public.trail_events membership
                join public.trails trail on trail.id=membership.trail_id
                where membership.event_id=event.id and trail.status='published')`,
          [eventId],
        );
        if (!eligible.rows[0])
          throw new PlacementConflictError('EVENT_NOT_PORTABLE_READY');
        const existingApproval = await client.query(
          `select id from public.event_placement_portability
            where event_id=$1::uuid and policy_version_id=$2
              and ended_at is null`,
          [eventId, state.policy_version_id],
        );
        if (existingApproval.rows[0]) {
          throw new PlacementConflictError('PORTABILITY_ALREADY_ACTIVE');
        }
        await client.query(
          `insert into public.event_placement_portability
           (event_id,policy_version_id,approved_by_player_id,
            review_provenance,effective_at)
           values ($1,$2,$3,'reviewed',$4)`,
          [eventId, state.policy_version_id, actorId, state.observed_at],
        );
        await advanceState(client, state);
        await recordAudit(
          client,
          state,
          expectedVersion + 1,
          actorId,
          'approve_portability',
          reason,
          null,
        );
        return { stateVersion: expectedVersion + 1 };
      });
    },
    endPortability(
      actorId: string,
      eventId: string,
      expectedVersion: number,
      reason: string,
    ) {
      return transaction(async (client) => {
        const state = await loadState(client, true);
        assertVersion(state, expectedVersion);
        const changed = await client.query(
          `update public.event_placement_portability
              set ended_at=$3,end_reason=$4
            where event_id=$1::uuid and policy_version_id=$2
              and ended_at is null returning id`,
          [eventId, state.policy_version_id, state.observed_at, reason.trim()],
        );
        if (!changed.rows[0])
          throw new PlacementConflictError('PORTABILITY_NOT_ACTIVE');
        await client.query(
          `update public.event_placement_assignments
              set ends_at=$2,end_reason='portability_ended'
            where event_id=$1::uuid and ends_at is null`,
          [eventId, state.observed_at],
        );
        await advanceState(client, state);
        await recordAudit(
          client,
          state,
          expectedVersion + 1,
          actorId,
          'end_portability',
          reason,
          null,
        );
        return { stateVersion: expectedVersion + 1 };
      });
    },
    rollback(
      actorId: string,
      sourcePlanId: string,
      expectedVersion: number,
      reason: string,
    ) {
      return transaction(async (client) => {
        const state = await loadState(client, true);
        assertVersion(state, expectedVersion);
        const source = await client.query<{ id: string }>(
          `select id::text from public.event_placement_plans
            where id=$1::uuid and status in ('applied','degraded')`,
          [sourcePlanId],
        );
        if (!source.rows[0])
          throw new PlacementConflictError('ROLLBACK_PLAN_UNAVAILABLE');
        const rows = await client.query<{
          event_id: string;
          site_id: string;
          zone_id: string;
        }>(
          `select event_id::text,site_id::text,zone_id::text
             from public.event_placement_plan_entries
            where plan_id=$1::uuid order by position`,
          [sourcePlanId],
        );
        const snapshot = await loadSnapshot(client, state);
        const entries: PlacementEntry[] = rows.rows.map((row) => ({
          eventId: row.event_id,
          siteId: row.site_id,
          zoneId: row.zone_id,
          origin: 'rollback',
          preserved: false,
        }));
        const result = validatePlacementEntries(snapshot.input, entries);
        if (result.status === 'unserved') {
          throw new PlacementConflictError('ROLLBACK_PLAN_INVALID');
        }
        const preview = await createPreview(
          client,
          snapshot,
          'rollback',
          actorId,
          sourcePlanId,
          result,
        );
        const applied = await applyStored(
          client,
          preview.planId,
          expectedVersion,
          actorId,
          reason,
        );
        await recordAudit(
          client,
          state,
          applied.stateVersion,
          actorId,
          'rollback',
          reason,
          preview.planId,
        );
        return applied;
      });
    },
    async runScheduled() {
      return transaction(async (client) => {
        let state = await loadState(client, true);
        const invalid = await client.query<{ id: string }>(
          `select assignment.id::text
             from public.event_placement_assignments assignment
             cross join lateral public.resolve_event_placement_location(
               assignment.event_id,$1) location
             cross join lateral public.resolve_event_availability(
               assignment.event_id,$1) availability
            where assignment.ends_at is null
              and (location.placement_assignment_id is distinct from assignment.id
                   or availability.availability <> 'active'
                   or not exists(select 1 from public.event_challenges challenge
                     where challenge.event_id=assignment.event_id
                       and challenge.status='published')
                   or exists(select 1 from public.trail_events membership
                     join public.trails trail on trail.id=membership.trail_id
                     where membership.event_id=assignment.event_id
                       and trail.status='published')
                   or (assignment.origin='pin' and not exists(
                     select 1 from public.event_placement_overrides pin
                     where pin.kind='pin' and pin.event_id=assignment.event_id
                       and pin.site_id=assignment.site_id and pin.ended_at is null
                       and pin.starts_at <= $1 and pin.expires_at > $1)))
            order by assignment.id`,
          [state.observed_at],
        );
        if (invalid.rows.length) {
          await client.query(
            `update public.event_placement_assignments
                set ends_at=$2,end_reason='assignment_invalidated'
              where id=any($1::uuid[]) and ends_at is null`,
            [invalid.rows.map((row) => row.id), state.observed_at],
          );
          await advanceState(client, state);
          await recordAudit(
            client,
            state,
            Number(state.version) + 1,
            null,
            'record_failure',
            'assignment_invalidated',
            null,
          );
          state = await loadState(client, true);
        }
        const existing = await client.query<{
          id: string;
          committed_state_version: string;
        }>(
          `select id::text,committed_state_version::text
             from public.event_placement_plans
            where policy_version_id=$1 and rotation_bucket=$2::date
              and trigger_kind='scheduled' and status in ('applied','degraded')
            limit 1`,
          [state.policy_version_id, state.rotation_bucket],
        );
        const currentPlan = state.current_plan_id
          ? await client.query<{
              committed_state_version: string;
              rotation_bucket: string;
            }>(
              `select committed_state_version::text,rotation_bucket::text
               from public.event_placement_plans where id=$1::uuid`,
              [state.current_plan_id],
            )
          : null;
        const needsReconcile =
          invalid.rows.length > 0 ||
          (currentPlan?.rows[0] &&
            Number(currentPlan.rows[0].committed_state_version) <
              Number(state.version));
        if (
          !needsReconcile &&
          (existing.rows[0] ||
            currentPlan?.rows[0]?.rotation_bucket === state.rotation_bucket)
        ) {
          return { outcome: 'already_applied' as const };
        }
        const paused = await client.query<{ paused: boolean }>(
          `select exists(select 1 from public.event_placement_overrides
            where kind='automation_pause' and ended_at is null
              and starts_at <= $1 and expires_at > $1) as paused`,
          [state.observed_at],
        );
        if (paused.rows[0]?.paused) return { outcome: 'paused' as const };
        const snapshot = await loadSnapshot(client, state);
        const previousFailure = await client.query<{ id: string }>(
          `select id::text from public.event_placement_plans
            where policy_version_id=$1 and rotation_bucket=$2::date
              and status='failed' and input_digest=$3
              and expected_state_version=$4
            limit 1`,
          [
            state.policy_version_id,
            state.rotation_bucket,
            snapshot.digest,
            state.version,
          ],
        );
        if (previousFailure.rows[0]) return { outcome: 'unserved' as const };
        const preview = await createPreview(
          client,
          snapshot,
          existing.rows[0] ? 'reconcile' : 'scheduled',
          null,
        );
        if (preview.status === 'unserved') {
          await client.query(
            `update public.event_placement_plans
                set status='failed',failure_code='unserved_zone'
              where id=$1::uuid`,
            [preview.planId],
          );
          await recordAudit(
            client,
            state,
            Number(state.version),
            null,
            'record_failure',
            'unserved_zone',
            preview.planId,
          );
          return { outcome: 'unserved' as const };
        }
        await applyStored(
          client,
          preview.planId,
          Number(state.version),
          null,
          'scheduled_rotation',
        );
        return { outcome: 'applied' as const, planId: preview.planId };
      });
    },
    async state() {
      return transaction(async (client) => {
        const snapshot = await loadSnapshot(client);
        const zones = await client.query<{
          id: string;
          zone_key: string;
          name: string;
          status: string;
          geometry: object;
        }>(
          `select id::text,zone_key,name,status,st_asgeojson(area)::json geometry
             from public.event_placement_zones
            where policy_version_id=$1 order by zone_key,id`,
          [snapshot.state.policy_version_id],
        );
        const sites = await client.query<{
          id: string;
          zone_id: string;
          name: string;
          status: string;
          latitude: number;
          longitude: number;
          maximum_interaction_radius_metres: number;
        }>(
          `select id::text,zone_id::text,name,status,
                  st_y(location::geometry) latitude,
                  st_x(location::geometry) longitude,
                  maximum_interaction_radius_metres
             from public.event_placement_sites
            where policy_version_id=$1 order by zone_id,site_key,id`,
          [snapshot.state.policy_version_id],
        );
        const overrides = await client.query<{
          id: string;
          kind: string;
          event_id: string | null;
          site_id: string | null;
          expires_at: Date;
        }>(
          `select id::text,kind,event_id::text,site_id::text,expires_at
             from public.event_placement_overrides
            where policy_version_id=$1 and ended_at is null
              and expires_at > $2 order by kind,id`,
          [snapshot.state.policy_version_id, snapshot.state.observed_at],
        );
        const assignments = await client.query<{
          event_id: string;
          site_id: string;
          zone_id: string;
          origin: string;
        }>(
          `select event_id::text,site_id::text,zone_id::text,origin
             from public.event_placement_assignments where ends_at is null
             order by zone_id,event_id`,
        );
        const operations = await client.query<{
          last_applied_at: Date | null;
          last_failure_at: Date | null;
          last_failure_code: string | null;
        }>(
          `select applied.last_applied_at,
                  failed.created_at as last_failure_at,
                  failed.failure_code as last_failure_code
             from (select max(applied_at) as last_applied_at
                     from public.event_placement_plans
                    where policy_version_id=$1
                      and status in ('applied','degraded')) applied
             left join lateral (
               select created_at,failure_code
                 from public.event_placement_plans
                where policy_version_id=$1 and status='failed'
                order by created_at desc,id desc limit 1
             ) failed on true`,
          [snapshot.state.policy_version_id],
        );
        const activeZones = zones.rows.filter(
          (zone) => zone.status === 'active',
        );
        const servedZoneCount = activeZones.filter((zone) =>
          assignments.rows.some((assignment) => assignment.zone_id === zone.id),
        ).length;
        const lastOperation = operations.rows[0];
        return {
          policyVersion: snapshot.state.policy_version_id,
          rotationBucket: snapshot.state.rotation_bucket,
          stateVersion: Number(snapshot.state.version),
          currentPlanId: snapshot.state.current_plan_id,
          targetCount: snapshot.input.policy.target,
          policy: snapshot.input.policy,
          nextRotationBoundary: snapshot.state.next_boundary.toISOString(),
          metrics: {
            targetAssignmentCount: snapshot.input.policy.target,
            activeAssignmentCount: assignments.rows.length,
            activeZoneCount: activeZones.length,
            servedZoneCount,
            unservedZoneCount: activeZones.length - servedZoneCount,
            lastAppliedAt:
              lastOperation?.last_applied_at?.toISOString() ?? null,
            lastFailureAt:
              lastOperation?.last_failure_at?.toISOString() ?? null,
            lastFailureCode: lastOperation?.last_failure_code ?? null,
          },
          zones: zones.rows.map((row) => ({
            id: row.id,
            key: row.zone_key,
            name: row.name,
            status: row.status,
            geometry: row.geometry,
          })),
          sites: sites.rows.map((row) => ({
            id: row.id,
            zoneId: row.zone_id,
            name: row.name,
            status: row.status,
            latitude: row.latitude,
            longitude: row.longitude,
            maximumRadiusMetres: row.maximum_interaction_radius_metres,
            excluded: snapshot.input.excludedSiteIds.includes(row.id),
          })),
          overrides: overrides.rows.map((row) => ({
            id: row.id,
            kind: row.kind,
            eventId: row.event_id,
            siteId: row.site_id,
            expiresAt: row.expires_at.toISOString(),
          })),
          assignments: assignments.rows.map((row) => ({
            eventId: row.event_id,
            siteId: row.site_id,
            zoneId: row.zone_id,
            origin: row.origin,
          })),
        };
      });
    },
    async history() {
      return transaction(async (client) => {
        const plans = await client.query<{
          id: string;
          policy_version_id: string;
          rotation_bucket: string;
          status: string;
          trigger_kind: string;
          failure_code: string | null;
          actual_assignment_count: number;
          created_at: Date;
        }>(
          `select id::text,policy_version_id,rotation_bucket::text,
                  status,trigger_kind,failure_code,actual_assignment_count,created_at
             from public.event_placement_plans
            order by created_at desc,id desc limit 100`,
        );
        return plans.rows.map((row) => ({
          planId: row.id,
          policyVersion: row.policy_version_id,
          rotationBucket: row.rotation_bucket,
          status: row.status,
          trigger: row.trigger_kind,
          failureCode: row.failure_code,
          assignmentCount: row.actual_assignment_count,
          createdAt: row.created_at.toISOString(),
        }));
      });
    },
  };
}

export type PlacementService = ReturnType<typeof createPlacementService>;

async function loadState(client: Client, lock = false): Promise<StateRow> {
  const result = await client.query<StateRow>(
    `select state.current_policy_version_id as policy_version_id,
            state.current_plan_id::text,state.version::text,
            policy.automatic_target,policy.preferred_assignments_per_zone,
            policy.mandatory_assignments_per_zone,
            policy.minimum_separation_metres,policy.replacements_per_rotation,
            policy.site_cooldown_buckets,policy.preview_ttl_minutes,
            ((now() at time zone policy.rotation_timezone) -
              (policy.rotation_local_time - time '00:00'))::date::text as rotation_bucket,
            (((((now() at time zone policy.rotation_timezone) -
              (policy.rotation_local_time - time '00:00'))::date + 1)::timestamp +
              (policy.rotation_local_time - time '00:00'))
              at time zone policy.rotation_timezone) as next_boundary,
            now() as observed_at
       from public.event_placement_state state
       join public.event_placement_policy_versions policy
         on policy.id=state.current_policy_version_id
      where state.singleton=true ${lock ? 'for update of state' : ''}`,
  );
  const row = result.rows[0];
  if (!row) throw new Error('Placement policy state has not been seeded.');
  return row;
}

async function loadSnapshot(
  client: Client,
  suppliedState?: StateRow,
): Promise<Snapshot> {
  const state = suppliedState ?? (await loadState(client));
  const now = state.observed_at;
  const [
    zones,
    sites,
    events,
    current,
    pins,
    excluded,
    siteDistances,
    fixedDistances,
    siteHistory,
    eventHistory,
    cooldown,
  ] = await sequentialQueries([
    () =>
      client.query<{ id: string; zone_key: string }>(
        `select id::text,zone_key from public.event_placement_zones
        where policy_version_id=$1 and status='active' order by id`,
        [state.policy_version_id],
      ),
    () =>
      client.query<{
        id: string;
        zone_id: string;
        maximum_interaction_radius_metres: number;
      }>(
        `select id::text,zone_id::text,maximum_interaction_radius_metres
         from public.event_placement_sites
        where policy_version_id=$1 and status='active' order by id`,
        [state.policy_version_id],
      ),
    () =>
      client.query<{
        id: string;
        radius_metres: number;
        effective_ends_at: Date;
      }>(
        `select event.id::text,event.radius_metres,availability.effective_ends_at
         from public.events event
         cross join lateral public.resolve_event_availability(event.id,$2) availability
        where event.authoring_status='published' and event.is_published=true
          and availability.availability='active'
          and exists(select 1 from public.event_placement_portability portability
            where portability.event_id=event.id and portability.policy_version_id=$1
              and portability.effective_at <= $2
              and (portability.ended_at is null or portability.ended_at > $2))
          and exists(select 1 from public.event_challenges challenge
            where challenge.event_id=event.id and challenge.status='published'
              and (select count(*) from public.challenge_questions question
                   where question.challenge_id=challenge.id and question.status='published') >= 5)
          and not exists(select 1 from public.trail_events membership
            join public.trails trail on trail.id=membership.trail_id
            where membership.event_id=event.id and trail.status='published')
        order by event.id`,
        [state.policy_version_id, now],
      ),
    () =>
      client.query<{
        event_id: string;
        site_id: string;
        zone_id: string;
        origin: PlacementEntry['origin'];
        starts_at: Date;
      }>(
        `select event_id::text,site_id::text,zone_id::text,origin,starts_at
         from public.event_placement_assignments
        where ends_at is null and policy_version_id=$1
         order by event_id`,
        [state.policy_version_id],
      ),
    () =>
      client.query<{ event_id: string; site_id: string; expires_at: Date }>(
        `select event_id::text,site_id::text,expires_at
         from public.event_placement_overrides
        where kind='pin' and ended_at is null and starts_at <= $1
          and expires_at > $1 order by event_id,site_id`,
        [now],
      ),
    () =>
      client.query<{ site_id: string; expires_at: Date }>(
        `select site_id::text,expires_at from public.event_placement_overrides
        where kind='site_exclusion' and ended_at is null
          and starts_at <= $1 and expires_at > $1 order by site_id`,
        [now],
      ),
    () =>
      client.query<{ left_id: string; right_id: string; metres: number }>(
        `select left_site.id::text left_id,right_site.id::text right_id,
              st_distance(left_site.location,right_site.location) metres
         from public.event_placement_sites left_site
         join public.event_placement_sites right_site on left_site.id < right_site.id
        where left_site.policy_version_id=$1 and right_site.policy_version_id=$1
          and left_site.status='active' and right_site.status='active'`,
        [state.policy_version_id],
      ),
    () =>
      client.query<{ site_id: string; metres: number; radius_metres: number }>(
        `select site.id::text site_id,st_distance(site.location,event.location) metres,
              event.radius_metres
         from public.event_placement_sites site
         cross join public.events event
         cross join lateral public.resolve_event_availability(event.id,$2) availability
        where site.policy_version_id=$1 and site.status='active'
          and event.is_published=true and availability.availability='active'
          and not exists(select 1 from public.event_placement_portability portability
            where portability.event_id=event.id and portability.effective_at <= $2)
        order by site.id,event.id`,
        [state.policy_version_id, now],
      ),
    () =>
      client.query<{ site_id: string; last_ended: Date | null; count: string }>(
        `select site_id::text,max(ends_at) last_ended,count(*)::text
         from public.event_placement_assignments group by site_id`,
      ),
    () =>
      client.query<{
        event_id: string;
        last_ended: Date | null;
        count: string;
      }>(
        `select event_id::text,max(ends_at) last_ended,count(*)::text
         from public.event_placement_assignments group by event_id`,
      ),
    () =>
      client.query<{ site_id: string }>(
        `select distinct entry.site_id::text
         from public.event_placement_plan_entries entry
         join public.event_placement_plans plan on plan.id=entry.plan_id
        where plan.policy_version_id=$1 and plan.status in ('applied','degraded')
          and plan.rotation_bucket < $2::date
          and plan.rotation_bucket >= $2::date - $3::integer`,
        [
          state.policy_version_id,
          state.rotation_bucket,
          state.site_cooldown_buckets,
        ],
      ),
  ]);
  const siteHistoryMap = new Map(
    siteHistory.rows.map((row) => [row.site_id, row]),
  );
  const eventHistoryMap = new Map(
    eventHistory.rows.map((row) => [row.event_id, row]),
  );
  const cooling = new Set(cooldown.rows.map((row) => row.site_id));
  const distances: Record<string, number> = {};
  for (const row of siteDistances.rows)
    distances[sitePairKey(row.left_id, row.right_id)] = row.metres;
  const fixed: PlacementInput['fixedDistances'] = {};
  for (const row of fixedDistances.rows)
    (fixed[row.site_id] ??= []).push({
      distanceMetres: row.metres,
      radiusMetres: row.radius_metres,
    });
  const input: PlacementInput = {
    policy: {
      id: state.policy_version_id,
      target: state.automatic_target,
      preferredPerZone: state.preferred_assignments_per_zone,
      mandatoryPerZone: state.mandatory_assignments_per_zone,
      separationMetres: state.minimum_separation_metres,
      replacements: state.replacements_per_rotation,
      cooldownBuckets: state.site_cooldown_buckets,
    },
    zones: zones.rows.map((row) => ({ id: row.id, key: row.zone_key })),
    sites: sites.rows.map((row) => ({
      id: row.id,
      zoneId: row.zone_id,
      maximumRadiusMetres: row.maximum_interaction_radius_metres,
      lastEndedAt:
        siteHistoryMap.get(row.id)?.last_ended?.toISOString() ?? null,
      lifetimeCount: Number(siteHistoryMap.get(row.id)?.count ?? 0),
      coolingDown: cooling.has(row.id),
    })),
    events: events.rows.map((row) => ({
      id: row.id,
      radiusMetres: row.radius_metres,
      lastEndedAt:
        eventHistoryMap.get(row.id)?.last_ended?.toISOString() ?? null,
      lifetimeCount: Number(eventHistoryMap.get(row.id)?.count ?? 0),
    })),
    current: current.rows.map((row) => ({
      eventId: row.event_id,
      siteId: row.site_id,
      zoneId: row.zone_id,
      origin: row.origin,
      preserved: true,
      startedAt: row.starts_at.toISOString(),
    })),
    pins: pins.rows.map((row) => ({
      eventId: row.event_id,
      siteId: row.site_id,
    })),
    excludedSiteIds: excluded.rows.map((row) => row.site_id),
    siteDistances: distances,
    fixedDistances: fixed,
  };
  const transitions = [
    state.next_boundary,
    ...events.rows.map((row) => row.effective_ends_at),
    ...pins.rows.map((row) => row.expires_at),
    ...excluded.rows.map((row) => row.expires_at),
  ];
  const validUntil = new Date(
    Math.min(
      now.getTime() + state.preview_ttl_minutes * 60_000,
      ...transitions.map((date) => date.getTime()),
    ),
  );
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        input,
        bucket: state.rotation_bucket,
        version: state.version,
        ends: events.rows.map((row) => [
          row.id,
          row.effective_ends_at.toISOString(),
        ]),
        pinExpiry: pins.rows.map((row) => row.expires_at.toISOString()),
        exclusionExpiry: excluded.rows.map((row) =>
          row.expires_at.toISOString(),
        ),
      }),
    )
    .digest('hex');
  return { state, input, digest, validUntil };
}

async function sequentialQueries<
  const T extends readonly (() => Promise<unknown>)[],
>(queries: T): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results: unknown[] = [];
  for (const query of queries) results.push(await query());
  return results as { [K in keyof T]: Awaited<ReturnType<T[K]>> };
}

async function recordAudit(
  client: Client,
  state: StateRow,
  resultingVersion: number,
  actorId: string | null,
  operation: string,
  reason: string,
  planId: string | null,
  overrideId: string | null = null,
): Promise<void> {
  await client.query(
    `insert into public.event_placement_audit
     (policy_version_id,plan_id,override_id,actor_player_id,operation,
      previous_state_version,resulting_state_version,reason,
      previous_state,resulting_state)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      state.policy_version_id,
      planId,
      overrideId,
      actorId,
      operation,
      state.version,
      resultingVersion,
      reason,
      JSON.stringify({ currentPlanId: state.current_plan_id }),
      JSON.stringify({ currentPlanId: planId ?? state.current_plan_id }),
    ],
  );
}

function assertVersion(state: StateRow, expected: number): void {
  if (Number(state.version) !== expected) {
    throw new PlacementConflictError('STALE_PLACEMENT_STATE');
  }
}

async function advanceState(client: Client, state: StateRow): Promise<void> {
  await client.query(
    `update public.event_placement_state
        set version=version+1,updated_at=$1 where singleton=true`,
    [state.observed_at],
  );
}

async function endAssignmentsForSite(
  client: Client,
  siteId: string,
  endedAt: Date,
  reason: string,
): Promise<void> {
  await client.query(
    `update public.event_placement_assignments
        set ends_at=$2,end_reason=$3
      where site_id=$1::uuid and ends_at is null`,
    [siteId, endedAt, reason],
  );
}

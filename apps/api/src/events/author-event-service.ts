import type pg from 'pg';

import {
  type AuthorContentLifecycle,
  type AuthorContentStatus,
  AuthorContentStateConflictError,
  assertDraftVersion,
  insertAuthorContentAudit,
  StaleAuthorContentVersionError,
  transitionAuthorContent,
  validateExpectedVersion,
} from '../authoring/content-workflow.js';

export type AuthorEventStatus = AuthorContentStatus;

export interface AuthorEvent {
  automaticPlacement: boolean;
  eventId: string;
  title: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMetres: number;
  sourceUrls: string[];
  startsAt: string;
  endsAt: string;
  isPublished: boolean;
  authoringStatus: AuthorEventStatus;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  submittedBy: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  publicationProvenance: AuthorContentLifecycle['publicationProvenance'];
}

export interface AuthorEventInput {
  actorPlayerId: string;
  automaticPlacement: boolean;
  title: string;
  description?: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMetres: number;
  startsAt: string;
  endsAt: string;
}

export interface UpdateAuthorEventInput extends AuthorEventInput {
  eventId: string;
  expectedVersion: number;
}

export interface AuthorEventTransitionInput {
  actorPlayerId: string;
  eventId: string;
  expectedVersion: number;
  note?: string;
}

export type AuthorEventPackageAction =
  'submit' | 'approve' | 'return' | 'publish';

export interface AuthorEventService {
  listEvents(): Promise<AuthorEvent[]>;
  createEvent(input: AuthorEventInput): Promise<AuthorEvent>;
  updateEvent(input: UpdateAuthorEventInput): Promise<AuthorEvent>;

  submitEvent(input: AuthorEventTransitionInput): Promise<AuthorEvent>;
  approveEvent(input: AuthorEventTransitionInput): Promise<AuthorEvent>;
  returnEvent(input: AuthorEventTransitionInput): Promise<AuthorEvent>;
  publishEvent(input: AuthorEventTransitionInput): Promise<AuthorEvent>;
  retireEvent(input: AuthorEventTransitionInput): Promise<AuthorEvent>;
  transitionReviewPackage(
    input: AuthorEventTransitionInput & { action: AuthorEventPackageAction },
  ): Promise<AuthorEvent>;
}

export interface AuthorEventDatabase {
  connect(): Promise<AuthorEventTransactionClient>;
}

export interface AuthorEventTransactionClient {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{
    rows: T[];
    rowCount?: number | null;
  }>;

  release(): void;
}

interface AuthorEventRow extends pg.QueryResultRow {
  automatic_placement: boolean;
  event_id: string;
  title: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_metres: number;
  source_urls: string[];
  starts_at: Date;
  ends_at: Date;
  is_published: boolean;
  created_at: Date;
  updated_at: Date;
  retired_at: Date | null;
  authoring_status: AuthorEventStatus;
  version: number;
  submitted_by_player_id: string | null;
  submitted_at: Date | null;
  reviewed_by_player_id: string | null;
  reviewed_at: Date | null;
  publication_provenance: AuthorContentLifecycle['publicationProvenance'];
}

export class AuthorEventNotFoundError extends Error {
  constructor() {
    super('The requested event was not found.');
    this.name = 'AuthorEventNotFoundError';
  }
}

export class InvalidAuthorEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAuthorEventError';
  }
}

export class AuthorEventStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorEventStateConflictError';
  }
}

export class AuthorEventNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorEventNotReadyError';
  }
}

interface AuthorEventLockRow extends pg.QueryResultRow {
  automatic_placement: boolean;
  status: AuthorEventStatus;
  version: number;
}

export function createAuthorEventService(
  database: AuthorEventDatabase,
): AuthorEventService {
  return {
    async listEvents() {
      const client = await database.connect();

      try {
        const result = await client.query<AuthorEventRow>(
          `
            select
              event.id::text as event_id,
              event.title,
              event.description,
              st_y(event.location::geometry) as latitude,
              st_x(event.location::geometry) as longitude,
              event.radius_metres,
              event.source_urls,
              event.starts_at,
              event.ends_at,
              event.is_published,
              exists (
                select 1
                from public.event_placement_portability portability
                join public.event_placement_state state on state.singleton = true
                where portability.event_id = event.id
                  and portability.policy_version_id = state.current_policy_version_id
                  and portability.ended_at is null
              ) as automatic_placement,
              event.authoring_status,
              event.retired_at,
              event.version,
              event.submitted_by_player_id::text,
              event.submitted_at,
              event.reviewed_by_player_id::text,
              event.reviewed_at,
              event.publication_provenance,
              event.created_at,
              event.updated_at
            from public.events event
            order by event.created_at desc, event.id
          `,
        );

        return result.rows.map((row) => mapAuthorEvent(row));
      } finally {
        client.release();
      }
    },

    async createEvent(input) {
      const validated = validateAuthorEventInput(input);

      return withTransaction(database, async (client) => {
        const result = await client.query<AuthorEventRow>(
          `
            insert into public.events (
              title,
              description,
              location,
              radius_metres,
              starts_at,
              ends_at
            )
            values (
              $1,
              $2,
              case
                when $3::double precision is null
                  or $4::double precision is null then null
                else st_setsrid(st_makepoint($3, $4), 4326)::geography
              end,
              $5,
              $6::timestamptz,
              $7::timestamptz
            )
            returning
              id::text as event_id,
              title,
              description,
              st_y(location::geometry) as latitude,
              st_x(location::geometry) as longitude,
              radius_metres,
              source_urls,
              starts_at,
              ends_at,
              is_published,
              false as automatic_placement,
              authoring_status,
              retired_at,
              version,
              submitted_by_player_id::text,
              submitted_at,
              reviewed_by_player_id::text,
              reviewed_at,
              publication_provenance,
              created_at,
              updated_at
          `,
          [
            validated.title,
            validated.description,
            validated.longitude,
            validated.latitude,
            validated.radiusMetres,
            validated.startsAt,
            validated.endsAt,
          ],
        );

        const row = result.rows[0];

        if (!row) {
          throw new Error('Event creation did not return the created event.');
        }

        await insertAuthorContentAudit(client, {
          actorPlayerId: validated.actorPlayerId,
          entityType: 'event',
          entityId: row.event_id,
          action: 'create',
          fromStatus: null,
          toStatus: 'draft',
          resultingVersion: 0,
        });

        if (validated.automaticPlacement) {
          await syncAutomaticPlacement(client, {
            actorPlayerId: validated.actorPlayerId,
            enabled: true,
            eventId: row.event_id,
          });
        }

        return mapAuthorEvent(row, validated.automaticPlacement);
      });
    },

    async updateEvent(input) {
      const validated = validateAuthorEventInput(input);

      return withTransaction(database, async (client) => {
        const locked = await lockEvent(client, validated.eventId);

        assertDraftVersion(locked, validated.expectedVersion);

        const result = await client.query<AuthorEventRow>(
          `
            update public.events
            set
              title = $2,
              description = $3,
              location = case
                when $4::double precision is null
                  or $5::double precision is null then null
                else st_setsrid(st_makepoint($4, $5), 4326)::geography
              end,
              radius_metres = $6,
              starts_at = $7::timestamptz,
              ends_at = $8::timestamptz,
              version = version + 1,
              updated_at = now()
            where id = $1::uuid and version = $9
            returning
              id::text as event_id,
              title,
              description,
              st_y(location::geometry) as latitude,
              st_x(location::geometry) as longitude,
              radius_metres,
              source_urls,
              starts_at,
              ends_at,
              is_published,
              false as automatic_placement,
              authoring_status,
              retired_at,
              version,
              submitted_by_player_id::text,
              submitted_at,
              reviewed_by_player_id::text,
              reviewed_at,
              publication_provenance,
              created_at,
              updated_at
          `,
          [
            validated.eventId,
            validated.title,
            validated.description,
            validated.longitude,
            validated.latitude,
            validated.radiusMetres,
            validated.startsAt,
            validated.endsAt,
            validated.expectedVersion,
          ],
        );

        const row = result.rows[0];

        if (!row) {
          throw new AuthorEventNotFoundError();
        }

        await insertAuthorContentAudit(client, {
          actorPlayerId: validated.actorPlayerId,
          entityType: 'event',
          entityId: row.event_id,
          action: 'edit',
          fromStatus: 'draft',
          toStatus: 'draft',
          resultingVersion: row.version,
        });

        if (locked.automatic_placement !== validated.automaticPlacement) {
          await syncAutomaticPlacement(client, {
            actorPlayerId: validated.actorPlayerId,
            enabled: validated.automaticPlacement,
            eventId: row.event_id,
          });
        }

        return mapAuthorEvent(row, validated.automaticPlacement);
      });
    },

    submitEvent: (input) => transitionEvent(database, input, 'submit'),
    approveEvent: (input) => transitionEvent(database, input, 'approve'),
    returnEvent: (input) => transitionEvent(database, input, 'return'),
    publishEvent: (input) => transitionEvent(database, input, 'publish'),
    retireEvent: (input) => transitionEvent(database, input, 'retire'),
    transitionReviewPackage: (input) =>
      transitionReviewPackage(database, input),
  };
}

interface PackageContentRow extends pg.QueryResultRow {
  id: string;
  status: AuthorContentStatus;
  version: number;
}

async function transitionReviewPackage(
  database: AuthorEventDatabase,
  input: AuthorEventTransitionInput & { action: AuthorEventPackageAction },
): Promise<AuthorEvent> {
  return withTransaction(database, async (client) => {
    validateExpectedVersion(input.expectedVersion);
    const event = await lockEvent(client, input.eventId);
    if (event.version !== input.expectedVersion)
      throw new StaleAuthorContentVersionError();
    const allowed: Record<AuthorEventPackageAction, AuthorContentStatus[]> = {
      submit: ['draft'],
      approve: ['in_review'],
      return: ['in_review', 'approved'],
      publish: ['approved'],
    };
    if (!allowed[input.action].includes(event.status)) {
      throw new AuthorContentStateConflictError(
        `Cannot ${input.action} event content while it is ${event.status}.`,
      );
    }

    const challenges = await client.query<PackageContentRow>(
      `select id::text, status, version from public.event_challenges
       where event_id = $1::uuid and status <> 'retired'
       order by id for update`,
      [input.eventId],
    );
    if (challenges.rows.length !== 1)
      throw new AuthorEventNotReadyError(
        'An event review package requires exactly one active challenge.',
      );
    const challenge = challenges.rows[0]!;
    const questions = await client.query<PackageContentRow>(
      `select id::text, status, version from public.challenge_questions
       where challenge_id = $1::uuid and status <> 'retired'
       order by id for update`,
      [challenge.id],
    );
    if (questions.rows.length < 5 && input.action !== 'return')
      throw new AuthorEventNotReadyError(
        'An event review package requires at least five questions.',
      );

    for (const question of questions.rows) {
      if (!shouldTransitionPackageChild(question.status, input.action))
        continue;
      await transitionAuthorContent(client, {
        entityType: 'question',
        entityId: question.id,
        actorPlayerId: input.actorPlayerId,
        expectedVersion: question.version,
        action: input.action,
        note: input.note,
      });
    }
    if (shouldTransitionPackageChild(challenge.status, input.action)) {
      await transitionAuthorContent(client, {
        entityType: 'challenge',
        entityId: challenge.id,
        actorPlayerId: input.actorPlayerId,
        expectedVersion: challenge.version,
        action: input.action,
        note: input.note,
        reviewPackage: input.action === 'approve',
      });
    }
    await transitionAuthorContent(client, {
      entityType: 'event',
      entityId: input.eventId,
      actorPlayerId: input.actorPlayerId,
      expectedVersion: input.expectedVersion,
      action: input.action,
      note: input.note,
      reviewPackage: input.action === 'approve',
    });
    return loadEvent(client, input.eventId);
  });
}

function shouldTransitionPackageChild(
  status: AuthorContentStatus,
  action: AuthorEventPackageAction,
): boolean {
  if (action === 'submit') {
    if (status === 'draft') return true;
    if (status === 'approved' || status === 'published') return false;
  } else if (action === 'approve') {
    if (status === 'in_review') return true;
    if (status === 'approved' || status === 'published') return false;
  } else if (action === 'return') {
    if (status === 'in_review' || status === 'approved') return true;
    if (status === 'draft' || status === 'published') return false;
  } else {
    if (status === 'approved') return true;
    if (status === 'published') return false;
  }
  throw new AuthorContentStateConflictError(
    `Cannot ${action} an event package with ${status} child content.`,
  );
}

async function transitionEvent(
  database: AuthorEventDatabase,
  input: AuthorEventTransitionInput,
  action: 'submit' | 'approve' | 'return' | 'publish' | 'retire',
): Promise<AuthorEvent> {
  return withTransaction(database, async (client) => {
    await transitionAuthorContent(client, {
      entityType: 'event',
      entityId: input.eventId,
      actorPlayerId: input.actorPlayerId,
      expectedVersion: input.expectedVersion,
      action,
      note: input.note,
    });

    if (action === 'publish' || action === 'retire') {
      await advanceAutomaticPlacementEligibility(
        client,
        input.eventId,
        input.actorPlayerId,
        action,
      );
    }
    return loadEvent(client, input.eventId);
  });
}

async function loadEvent(
  client: AuthorEventTransactionClient,
  eventId: string,
): Promise<AuthorEvent> {
  const result = await client.query<AuthorEventRow>(
    `select
       id::text as event_id, title, description,
       st_y(location::geometry) as latitude,
       st_x(location::geometry) as longitude,
       radius_metres, source_urls, starts_at, ends_at, is_published, authoring_status,
       exists (
         select 1
         from public.event_placement_portability portability
         join public.event_placement_state state on state.singleton = true
         where portability.event_id = events.id
           and portability.policy_version_id = state.current_policy_version_id
           and portability.ended_at is null
       ) as automatic_placement,
       retired_at, version, submitted_by_player_id::text, submitted_at,
       reviewed_by_player_id::text, reviewed_at, publication_provenance,
       created_at, updated_at
     from public.events where id = $1::uuid`,
    [eventId],
  );
  const row = result.rows[0];
  if (!row) throw new AuthorEventNotFoundError();
  return mapAuthorEvent(row);
}

async function lockEvent(
  client: AuthorEventTransactionClient,
  eventId: string,
): Promise<AuthorEventLockRow> {
  const result = await client.query<AuthorEventLockRow>(
    `
      select
        authoring_status as status,
        version,
        exists (
          select 1
          from public.event_placement_portability portability
          join public.event_placement_state state on state.singleton = true
          where portability.event_id = events.id
            and portability.policy_version_id = state.current_policy_version_id
            and portability.ended_at is null
        ) as automatic_placement
      from public.events
      where id = $1::uuid
      for update
    `,
    [eventId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new AuthorEventNotFoundError();
  }

  return row;
}

function validateAuthorEventInput<T extends AuthorEventInput>(
  input: T,
): T & {
  title: string;
  description: string | null;
} {
  const title = input.title.trim();

  if (typeof input.automaticPlacement !== 'boolean') {
    throw new InvalidAuthorEventError(
      'Automatic placement must be enabled or disabled.',
    );
  }

  if (title.length === 0) {
    throw new InvalidAuthorEventError('Event title must not be blank.');
  }

  let description: string | null = null;

  if (input.description !== undefined && input.description !== null) {
    description = input.description.trim();

    if (description.length === 0) {
      throw new InvalidAuthorEventError(
        'Event description must not be blank when provided.',
      );
    }
  }

  const hasLatitude = input.latitude !== null;
  const hasLongitude = input.longitude !== null;

  if (hasLatitude !== hasLongitude) {
    throw new InvalidAuthorEventError(
      'Latitude and longitude must both be provided or both be unset.',
    );
  }

  if (!input.automaticPlacement && !hasLatitude) {
    throw new InvalidAuthorEventError(
      'A fixed event must have a latitude and longitude.',
    );
  }

  if (
    input.latitude !== null &&
    (!Number.isFinite(input.latitude) ||
      input.latitude < -90 ||
      input.latitude > 90)
  ) {
    throw new InvalidAuthorEventError(
      'Latitude must be between -90 and 90 degrees.',
    );
  }

  if (
    input.longitude !== null &&
    (!Number.isFinite(input.longitude) ||
      input.longitude < -180 ||
      input.longitude > 180)
  ) {
    throw new InvalidAuthorEventError(
      'Longitude must be between -180 and 180 degrees.',
    );
  }

  if (!Number.isInteger(input.radiusMetres) || input.radiusMetres <= 0) {
    throw new InvalidAuthorEventError(
      'Event radius must be a positive integer.',
    );
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);

  if (Number.isNaN(startsAt.getTime())) {
    throw new InvalidAuthorEventError('Event start time is invalid.');
  }

  if (Number.isNaN(endsAt.getTime())) {
    throw new InvalidAuthorEventError('Event end time is invalid.');
  }

  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new InvalidAuthorEventError(
      'Event end time must be after its start time.',
    );
  }

  return {
    ...input,
    title,
    description,
  };
}

function mapAuthorEvent(
  row: AuthorEventRow,
  automaticPlacement = row.automatic_placement,
): AuthorEvent {
  return {
    automaticPlacement,
    eventId: row.event_id,
    title: row.title,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusMetres: row.radius_metres,
    sourceUrls: row.source_urls ?? [],
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    isPublished: row.is_published,
    authoringStatus: row.authoring_status,
    retiredAt: row.retired_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
    submittedBy: row.submitted_by_player_id,
    submittedAt: row.submitted_at?.toISOString() ?? null,
    reviewedBy: row.reviewed_by_player_id,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    publicationProvenance: row.publication_provenance,
  };
}

interface PlacementStateRow extends pg.QueryResultRow {
  current_plan_id: string | null;
  observed_at: Date;
  policy_version_id: string;
  version: string;
}

async function lockPlacementState(
  client: AuthorEventTransactionClient,
): Promise<PlacementStateRow | null> {
  const result = await client.query<PlacementStateRow>(
    `select current_policy_version_id as policy_version_id,
            current_plan_id::text, version::text, now() as observed_at
       from public.event_placement_state
      where singleton = true
      for update`,
  );
  return result.rows[0] ?? null;
}

async function syncAutomaticPlacement(
  client: AuthorEventTransactionClient,
  input: { actorPlayerId: string; enabled: boolean; eventId: string },
): Promise<void> {
  const state = await lockPlacementState(client);
  if (!state) throw new Error('Placement policy state has not been seeded.');

  if (input.enabled) {
    await client.query(
      `insert into public.event_placement_portability
       (event_id, policy_version_id, approved_by_player_id,
        review_provenance, effective_at)
       values ($1::uuid, $2, $3::uuid, 'reviewed', $4)`,
      [
        input.eventId,
        state.policy_version_id,
        input.actorPlayerId,
        state.observed_at,
      ],
    );
  } else {
    await client.query(
      `update public.event_placement_portability
          set ended_at = $3, end_reason = 'automatic_placement_disabled'
        where event_id = $1::uuid and policy_version_id = $2
          and ended_at is null`,
      [input.eventId, state.policy_version_id, state.observed_at],
    );
    await client.query(
      `update public.event_placement_assignments
          set ends_at = $2, end_reason = 'portability_ended'
        where event_id = $1::uuid and ends_at is null`,
      [input.eventId, state.observed_at],
    );
  }

  await advancePlacementState(client, state, input.actorPlayerId, {
    operation: input.enabled
      ? 'enable_automatic_placement'
      : 'disable_automatic_placement',
    reason: input.enabled
      ? 'Enabled from the event editor.'
      : 'Disabled from the event editor.',
  });
}

async function advanceAutomaticPlacementEligibility(
  client: AuthorEventTransactionClient,
  eventId: string,
  actorPlayerId: string,
  action: 'publish' | 'retire',
): Promise<void> {
  const state = await lockPlacementState(client);
  const enabled = state
    ? await client.query(
        `select id
           from public.event_placement_portability
          where event_id = $1::uuid and policy_version_id = $2
            and ended_at is null`,
        [eventId, state.policy_version_id],
      )
    : { rows: [] };

  let retiredAssignmentCount = 0;
  let endedPortabilityCount = 0;
  if (action === 'retire') {
    const retiredAssignments = await client.query(
      `update public.event_placement_assignments
          set ends_at = now(), end_reason = 'event_retired'
        where event_id = $1::uuid and ends_at is null`,
      [eventId],
    );
    retiredAssignmentCount = retiredAssignments.rowCount ?? 0;

    const endedPortability = await client.query(
      `update public.event_placement_portability
          set ended_at = now(), end_reason = 'event_retired'
        where event_id = $1::uuid and ended_at is null`,
      [eventId],
    );
    endedPortabilityCount = endedPortability.rowCount ?? 0;
  }

  if (
    !state ||
    (!enabled.rows[0] &&
      retiredAssignmentCount === 0 &&
      endedPortabilityCount === 0)
  )
    return;

  await advancePlacementState(client, state, actorPlayerId, {
    operation: 'automatic_placement_eligibility',
    reason:
      action === 'retire'
        ? 'The event was retired and removed from automatic placement.'
        : 'The event publication state changed.',
  });
}

async function advancePlacementState(
  client: AuthorEventTransactionClient,
  state: PlacementStateRow,
  actorPlayerId: string,
  audit: { operation: string; reason: string },
): Promise<void> {
  const resultingVersion = Number(state.version) + 1;
  await client.query(
    `update public.event_placement_state
        set version = version + 1, updated_at = $1
      where singleton = true`,
    [state.observed_at],
  );
  await client.query(
    `insert into public.event_placement_audit
     (policy_version_id, actor_player_id, operation,
      previous_state_version, resulting_state_version, reason,
      previous_state, resulting_state)
     values ($1, $2::uuid, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
    [
      state.policy_version_id,
      actorPlayerId,
      audit.operation,
      Number(state.version),
      resultingVersion,
      audit.reason,
      JSON.stringify({ currentPlanId: state.current_plan_id }),
      JSON.stringify({ currentPlanId: state.current_plan_id }),
    ],
  );
}

async function withTransaction<T>(
  database: AuthorEventDatabase,
  operation: (client: AuthorEventTransactionClient) => Promise<T>,
): Promise<T> {
  const client = await database.connect();

  try {
    await client.query('begin');

    const result = await operation(client);

    await client.query('commit');

    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // Preserve the original operation failure.
    }

    throw error;
  } finally {
    client.release();
  }
}

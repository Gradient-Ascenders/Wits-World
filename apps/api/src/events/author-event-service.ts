import type pg from 'pg';

import {
  type AuthorContentLifecycle,
  type AuthorContentStatus,
  assertDraftVersion,
  insertAuthorContentAudit,
  transitionAuthorContent,
} from '../authoring/content-workflow.js';

export type AuthorEventStatus = AuthorContentStatus;

export interface AuthorEvent {
  eventId: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
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
  title: string;
  description?: string | null;
  latitude: number;
  longitude: number;
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

export interface AuthorEventService {
  listEvents(): Promise<AuthorEvent[]>;
  createEvent(input: AuthorEventInput): Promise<AuthorEvent>;
  updateEvent(input: UpdateAuthorEventInput): Promise<AuthorEvent>;

  submitEvent(input: AuthorEventTransitionInput): Promise<AuthorEvent>;
  approveEvent(input: AuthorEventTransitionInput): Promise<AuthorEvent>;
  returnEvent(input: AuthorEventTransitionInput): Promise<AuthorEvent>;
  publishEvent(input: AuthorEventTransitionInput): Promise<AuthorEvent>;
  retireEvent(input: AuthorEventTransitionInput): Promise<AuthorEvent>;
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
  event_id: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
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

        return result.rows.map(mapAuthorEvent);
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
              st_setsrid(
                st_makepoint(
                  $3::double precision,
                  $4::double precision
                ),
                4326
              )::geography,
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

        return mapAuthorEvent(row);
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
              location = st_setsrid(
                st_makepoint(
                  $4::double precision,
                  $5::double precision
                ),
                4326
              )::geography,
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

        return mapAuthorEvent(row);
      });
    },

    submitEvent: (input) => transitionEvent(database, input, 'submit'),
    approveEvent: (input) => transitionEvent(database, input, 'approve'),
    returnEvent: (input) => transitionEvent(database, input, 'return'),
    publishEvent: (input) => transitionEvent(database, input, 'publish'),
    retireEvent: (input) => transitionEvent(database, input, 'retire'),
  };
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
        version
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

  if (
    !Number.isFinite(input.latitude) ||
    input.latitude < -90 ||
    input.latitude > 90
  ) {
    throw new InvalidAuthorEventError(
      'Latitude must be between -90 and 90 degrees.',
    );
  }

  if (
    !Number.isFinite(input.longitude) ||
    input.longitude < -180 ||
    input.longitude > 180
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

function mapAuthorEvent(row: AuthorEventRow): AuthorEvent {
  return {
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

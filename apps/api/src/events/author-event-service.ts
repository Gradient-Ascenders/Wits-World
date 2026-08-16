import type pg from 'pg';

export type AuthorEventStatus = 'draft' | 'published' | 'retired';

export interface AuthorEvent {
  eventId: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  radiusMetres: number;
  startsAt: string;
  endsAt: string;
  isPublished: boolean;
  authoringStatus: AuthorEventStatus;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
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
}

export interface AuthorEventService {
  listEvents(): Promise<AuthorEvent[]>;
  createEvent(input: AuthorEventInput): Promise<AuthorEvent>;
  updateEvent(input: UpdateAuthorEventInput): Promise<AuthorEvent>;

  publishEvent(actorPlayerId: string, eventId: string): Promise<AuthorEvent>;

  retireEvent(actorPlayerId: string, eventId: string): Promise<AuthorEvent>;
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
  starts_at: Date;
  ends_at: Date;
  is_published: boolean;
  created_at: Date;
  updated_at: Date;
  retired_at: Date | null;
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
  is_published: boolean;
  retired_at: Date | null;
}

interface EventPublicationReadinessRow extends pg.QueryResultRow {
  published_challenge_count: number;
  active_common_count: number;
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
              event.starts_at,
              event.ends_at,
              event.is_published,
              event.retired_at,
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
              starts_at,
              ends_at,
              is_published,
              retired_at,
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

        await insertAudit(
          client,
          validated.actorPlayerId,
          row.event_id,
          'create',
        );

        return mapAuthorEvent(row);
      });
    },

    async updateEvent(input) {
      const validated = validateAuthorEventInput(input);

      return withTransaction(database, async (client) => {
        const locked = await lockEvent(client, validated.eventId);

        if (locked.retired_at !== null) {
          throw new AuthorEventStateConflictError(
            'Retired events cannot be edited.',
          );
        }

        if (locked.is_published) {
          throw new AuthorEventStateConflictError(
            'Published events cannot be edited; retire the event and create a replacement instead.',
          );
        }

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
              updated_at = now()
            where id = $1::uuid
            returning
              id::text as event_id,
              title,
              description,
              st_y(location::geometry) as latitude,
              st_x(location::geometry) as longitude,
              radius_metres,
              starts_at,
              ends_at,
              is_published,
              retired_at,
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
          ],
        );

        const row = result.rows[0];

        if (!row) {
          throw new AuthorEventNotFoundError();
        }

        await insertAudit(
          client,
          validated.actorPlayerId,
          row.event_id,
          'edit',
        );

        return mapAuthorEvent(row);
      });
    },

    async publishEvent(actorPlayerId, eventId) {
      return withTransaction(database, async (client) => {
        const locked = await lockEvent(client, eventId);

        if (locked.retired_at !== null) {
          throw new AuthorEventStateConflictError(
            'Retired events cannot be republished.',
          );
        }

        if (locked.is_published) {
          throw new AuthorEventStateConflictError(
            'The event is already published.',
          );
        }

        const readiness = await client.query<EventPublicationReadinessRow>(
          `
              select
                (
                  select count(*)::int
                  from public.event_challenges challenge
                  where challenge.event_id = $1::uuid
                    and challenge.status = 'published'
                ) as published_challenge_count,
                (
                  select count(*)::int
                  from public.card_definitions card
                  where card.rarity = 'common'
                    and card.is_active = true
                ) as active_common_count
            `,
          [eventId],
        );

        const state = readiness.rows[0];

        if (!state || state.published_challenge_count !== 1) {
          throw new AuthorEventNotReadyError(
            'An event requires one published challenge before publication.',
          );
        }

        if (state.active_common_count < 1) {
          throw new AuthorEventNotReadyError(
            'At least one active Common reward card is required before event publication.',
          );
        }

        const result = await client.query<AuthorEventRow>(
          `
            update public.events
            set
              is_published = true,
              updated_at = now()
            where id = $1::uuid
            returning
              id::text as event_id,
              title,
              description,
              st_y(location::geometry) as latitude,
              st_x(location::geometry) as longitude,
              radius_metres,
              starts_at,
              ends_at,
              is_published,
              retired_at,
              created_at,
              updated_at
          `,
          [eventId],
        );

        const row = result.rows[0];

        if (!row) {
          throw new AuthorEventNotFoundError();
        }

        await insertAudit(client, actorPlayerId, eventId, 'publish');

        return mapAuthorEvent(row);
      });
    },

    async retireEvent(actorPlayerId, eventId) {
      return withTransaction(database, async (client) => {
        const locked = await lockEvent(client, eventId);

        if (locked.retired_at !== null) {
          throw new AuthorEventStateConflictError(
            'The event is already retired.',
          );
        }

        const result = await client.query<AuthorEventRow>(
          `
            update public.events
            set
              is_published = false,
              retired_at = now(),
              updated_at = now()
            where id = $1::uuid
            returning
              id::text as event_id,
              title,
              description,
              st_y(location::geometry) as latitude,
              st_x(location::geometry) as longitude,
              radius_metres,
              starts_at,
              ends_at,
              is_published,
              retired_at,
              created_at,
              updated_at
          `,
          [eventId],
        );

        const row = result.rows[0];

        if (!row) {
          throw new AuthorEventNotFoundError();
        }

        await insertAudit(client, actorPlayerId, eventId, 'retire');

        return mapAuthorEvent(row);
      });
    },
  };
}

async function lockEvent(
  client: AuthorEventTransactionClient,
  eventId: string,
): Promise<AuthorEventLockRow> {
  const result = await client.query<AuthorEventLockRow>(
    `
      select
        is_published,
        retired_at
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

async function insertAudit(
  client: AuthorEventTransactionClient,
  actorPlayerId: string,
  eventId: string,
  action: 'create' | 'edit' | 'publish' | 'retire',
): Promise<void> {
  await client.query(
    `
      insert into public.author_content_audit (
        actor_player_id,
        entity_type,
        entity_id,
        action
      )
      values (
        $1::uuid,
        'event',
        $2::uuid,
        $3
      )
    `,
    [actorPlayerId, eventId, action],
  );
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
  const authoringStatus: AuthorEventStatus =
    row.retired_at !== null
      ? 'retired'
      : row.is_published
        ? 'published'
        : 'draft';

  return {
    eventId: row.event_id,
    title: row.title,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusMetres: row.radius_metres,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    isPublished: row.is_published,
    authoringStatus,
    retiredAt: row.retired_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
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

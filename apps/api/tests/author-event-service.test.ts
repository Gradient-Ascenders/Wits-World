import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  AuthorEventNotFoundError,
  createAuthorEventService,
  InvalidAuthorEventError,
  type AuthorEventDatabase,
  type AuthorEventTransactionClient,
} from '../src/events/author-event-service.js';

const AUTHOR_ID = 'b1000000-0000-4000-8000-000000000001';
const EVENT_ID = 'b2000000-0000-4000-8000-000000000001';

describe('author event service', () => {
  it('creates an unpublished event and audits the acting Author atomically', async () => {
    const fixture = createFixture();

    fixture.query.mockImplementation(successfulImplementation());

    const service = createAuthorEventService(fixture.database);

    const event = await service.createEvent({
      actorPlayerId: AUTHOR_ID,
      title: '  Great Hall Challenge  ',
      description: '  Explore East Campus.  ',
      latitude: -26.19205,
      longitude: 28.03038,
      radiusMetres: 75,
      startsAt: '2026-09-01T08:00:00.000Z',
      endsAt: '2026-09-01T12:00:00.000Z',
    });

    expect(event).toMatchObject({
      eventId: EVENT_ID,
      title: 'Great Hall Challenge',
      description: 'Explore East Campus.',
      latitude: -26.19205,
      longitude: 28.03038,
      radiusMetres: 75,
      isPublished: false,
    });

    expect(executedCommands(fixture.query)).toEqual(['begin', 'commit']);

    expect(executedSql(fixture.query)).toContain(
      'insert into public.author_content_audit',
    );

    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.author_content_audit'),
      [AUTHOR_ID, EVENT_ID, 'create'],
    );
  });

  it('updates an event and audits the edit in the same transaction', async () => {
    const fixture = createFixture();

    fixture.query.mockImplementation(successfulImplementation());

    const service = createAuthorEventService(fixture.database);

    const event = await service.updateEvent({
      actorPlayerId: AUTHOR_ID,
      eventId: EVENT_ID,
      title: 'Updated event',
      description: null,
      latitude: -26.19,
      longitude: 28.03,
      radiusMetres: 100,
      startsAt: '2026-09-02T08:00:00.000Z',
      endsAt: '2026-09-02T10:00:00.000Z',
    });

    expect(event.eventId).toBe(EVENT_ID);

    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.author_content_audit'),
      [AUTHOR_ID, EVENT_ID, 'edit'],
    );

    expect(executedCommands(fixture.query)).toEqual(['begin', 'commit']);
  });

  it('rolls back the content change when audit persistence fails', async () => {
    const fixture = createFixture();

    fixture.query.mockImplementation(async (statement: string) => {
      const sql = statement.toLowerCase().trim();

      if (sql === 'begin' || sql === 'rollback') {
        return { rows: [] };
      }

      if (sql.includes('insert into public.events')) {
        return {
          rows: [authorEventRow()],
        };
      }

      if (sql.includes('insert into public.author_content_audit')) {
        throw new Error('audit unavailable');
      }

      return { rows: [] };
    });

    const service = createAuthorEventService(fixture.database);

    await expect(service.createEvent(validInput())).rejects.toThrow(
      'audit unavailable',
    );

    expect(executedCommands(fixture.query)).toEqual(['begin', 'rollback']);
  });

  it('returns not found when editing an unavailable event', async () => {
    const fixture = createFixture();

    fixture.query.mockImplementation(async (statement: string) => {
      const sql = statement.toLowerCase().trim();

      if (sql === 'begin' || sql === 'rollback') {
        return { rows: [] };
      }

      if (sql.includes('update public.events')) {
        return { rows: [] };
      }

      return { rows: [] };
    });

    const service = createAuthorEventService(fixture.database);

    await expect(
      service.updateEvent({
        ...validInput(),
        eventId: EVENT_ID,
      }),
    ).rejects.toBeInstanceOf(AuthorEventNotFoundError);

    expect(executedSql(fixture.query)).not.toContain(
      'insert into public.author_content_audit',
    );

    expect(executedCommands(fixture.query)).toEqual(['begin', 'rollback']);
  });

  it.each([
    {
      change: { title: '   ' },
      message: 'Event title must not be blank.',
    },
    {
      change: { latitude: 91 },
      message: 'Latitude must be between -90 and 90 degrees.',
    },
    {
      change: { longitude: 181 },
      message: 'Longitude must be between -180 and 180 degrees.',
    },
    {
      change: { radiusMetres: 0 },
      message: 'Event radius must be a positive integer.',
    },
    {
      change: {
        startsAt: '2026-09-01T12:00:00.000Z',
        endsAt: '2026-09-01T08:00:00.000Z',
      },
      message: 'Event end time must be after its start time.',
    },
  ])('rejects invalid event input: $message', async ({ change, message }) => {
    const fixture = createFixture();

    const service = createAuthorEventService(fixture.database);

    await expect(
      service.createEvent({
        ...validInput(),
        ...change,
      }),
    ).rejects.toMatchObject({
      message,
    } satisfies Partial<InvalidAuthorEventError>);

    expect(fixture.database.connect).not.toHaveBeenCalled();
  });

  it('lists both draft and published events without a player-facing publication filter', async () => {
    const fixture = createFixture();

    fixture.query.mockResolvedValue({
      rows: [
        authorEventRow(),
        {
          ...authorEventRow(),
          event_id: 'b2000000-0000-4000-8000-000000000002',
          is_published: true,
        },
      ],
    });

    const service = createAuthorEventService(fixture.database);

    const events = await service.listEvents();

    expect(events).toHaveLength(2);

    expect(executedSql(fixture.query)).not.toContain(
      'where event.is_published = true',
    );
  });
});

function validInput() {
  return {
    actorPlayerId: AUTHOR_ID,
    title: 'Great Hall Challenge',
    description: 'Explore East Campus.',
    latitude: -26.19205,
    longitude: 28.03038,
    radiusMetres: 75,
    startsAt: '2026-09-01T08:00:00.000Z',
    endsAt: '2026-09-01T12:00:00.000Z',
  };
}

function createFixture() {
  const query = vi.fn();

  const client: AuthorEventTransactionClient = {
    async query<T extends pg.QueryResultRow>(
      statement: string,
      values?: unknown[],
    ) {
      const result = await query(statement, values ?? []);

      return result as {
        rows: T[];
        rowCount?: number | null;
      };
    },

    release: vi.fn(),
  };

  const database: AuthorEventDatabase = {
    connect: vi.fn().mockResolvedValue(client),
  };

  return {
    database,
    client,
    query,
  };
}

function successfulImplementation() {
  return async (statement: string) => {
    const sql = statement.toLowerCase().trim();

    if (sql === 'begin' || sql === 'commit' || sql === 'rollback') {
      return { rows: [] };
    }

    if (
      sql.includes('insert into public.events') ||
      sql.includes('update public.events')
    ) {
      return {
        rows: [authorEventRow()],
      };
    }

    if (sql.includes('insert into public.author_content_audit')) {
      return { rows: [] };
    }

    if (sql.includes('from public.events event')) {
      return {
        rows: [authorEventRow()],
      };
    }

    return { rows: [] };
  };
}

function authorEventRow() {
  return {
    event_id: EVENT_ID,
    title: 'Great Hall Challenge',
    description: 'Explore East Campus.',
    latitude: -26.19205,
    longitude: 28.03038,
    radius_metres: 75,
    starts_at: new Date('2026-09-01T08:00:00.000Z'),
    ends_at: new Date('2026-09-01T12:00:00.000Z'),
    is_published: false,
    created_at: new Date('2026-08-15T20:00:00.000Z'),
    updated_at: new Date('2026-08-15T20:00:00.000Z'),
  };
}

function executedSql(query: ReturnType<typeof vi.fn>): string {
  return query.mock.calls
    .map(([statement]) => String(statement).toLowerCase())
    .join('\n');
}

function executedCommands(query: ReturnType<typeof vi.fn>): string[] {
  return query.mock.calls
    .map(([statement]) => String(statement).trim().toLowerCase())
    .filter((statement) => ['begin', 'commit', 'rollback'].includes(statement));
}

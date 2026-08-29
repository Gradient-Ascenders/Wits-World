import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  createMovementEvidenceService,
  InvalidMovementEvidenceError,
  MAX_MOVEMENT_EVIDENCE_RETENTION_MS,
  MovementEvidencePersistenceError,
  NonMonotonicMovementEvidenceError,
} from '../src/events/movement-evidence.js';

const PLAYER_ID = '00000000-0000-4000-8000-000000000101';
const EVENT_ID = '00000000-0000-4000-8000-000000000018';
const OTHER_EVENT_ID = '00000000-0000-4000-8000-000000000019';
const RECEIVED_AT = new Date('2026-08-29T10:00:00.000Z');
const ACQUIRED_AT = new Date('2026-08-29T09:59:30.000Z');

describe('movement evidence persistence', () => {
  it('serializes the player and stores only the active-operation sample', async () => {
    const query = vi.fn(async (statement: string, values?: unknown[]) => {
      void values;
      if (statement.includes('select player.id::text')) {
        return { rows: [{ player_id: PLAYER_ID }] };
      }

      if (statement.includes('select event_id::text')) {
        return { rows: [] };
      }

      return { rows: [] };
    });
    const service = createMovementEvidenceService(createDatabase(query), {
      createId: () => '00000000-0000-4000-8000-000000000201',
      retentionMs: 3_600_000,
    });

    await service.record(validInput());

    expect(query).toHaveBeenNthCalledWith(1, 'begin');
    expect(query.mock.calls[1]?.[0]).toContain(
      "player.lifecycle_status = 'active'",
    );
    expect(query.mock.calls[1]?.[0]).toContain(
      'public.resolve_event_availability',
    );
    expect(query.mock.calls[1]?.[0]).toContain(
      "effective.availability = 'active'",
    );
    expect(query.mock.calls[1]?.[1]).toEqual([
      PLAYER_ID,
      EVENT_ID,
      RECEIVED_AT,
    ]);
    expect(query.mock.calls[2]?.[0]).toContain(
      'select max(existing.acquired_at)',
    );
    expect(query.mock.calls[3]?.[1]).toEqual([
      '00000000-0000-4000-8000-000000000201',
      PLAYER_ID,
      EVENT_ID,
      -26.19205,
      28.03038,
      10,
      ACQUIRED_AT,
      RECEIVED_AT,
      new Date('2026-08-29T11:00:00.000Z'),
    ]);
    expect(query).toHaveBeenLastCalledWith('commit');
  });

  it('accepts an identical same-event sample as an idempotent retry', async () => {
    const query = vi.fn(async (statement: string, values?: unknown[]) => {
      void values;
      if (statement.includes('select player.id::text')) {
        return { rows: [{ player_id: PLAYER_ID }] };
      }

      if (statement.includes('select event_id::text')) {
        return { rows: [latestRow()] };
      }

      return { rows: [] };
    });
    const service = createMovementEvidenceService(createDatabase(query));

    await expect(service.record(validInput())).resolves.toBeUndefined();

    expect(query).toHaveBeenLastCalledWith('commit');
    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).includes('insert into public.movement_evidence'),
      ),
    ).toBe(false);
  });

  it('associates an identical latest physical sample with another event', async () => {
    const query = latestSampleQuery();
    const service = createMovementEvidenceService(createDatabase(query), {
      createId: () => '00000000-0000-4000-8000-000000000202',
    });

    await service.record({ ...validInput(), eventId: OTHER_EVENT_ID });

    const insert = query.mock.calls.find(([statement]) =>
      String(statement).includes('insert into public.movement_evidence'),
    );
    expect(insert?.[1]).toEqual([
      '00000000-0000-4000-8000-000000000202',
      PLAYER_ID,
      OTHER_EVENT_ID,
      -26.19205,
      28.03038,
      10,
      ACQUIRED_AT,
      RECEIVED_AT,
      new Date('2026-08-30T10:00:00.000Z'),
    ]);
    expect(query).toHaveBeenLastCalledWith('commit');
  });

  it.each([
    ['latitude', -26.2],
    ['longitude', 28.04],
    ['accuracyMetres', 11],
  ] as const)(
    'rejects equal acquisition time with inconsistent %s',
    async (field, value) => {
      const query = latestSampleQuery();
      const service = createMovementEvidenceService(createDatabase(query));

      await expect(
        service.record({ ...validInput(), [field]: value }),
      ).rejects.toBeInstanceOf(NonMonotonicMovementEvidenceError);
      expect(query).toHaveBeenLastCalledWith('rollback');
    },
  );

  it('rejects an older physical sample', async () => {
    const query = latestSampleQuery();
    const service = createMovementEvidenceService(createDatabase(query));

    await expect(
      service.record({
        ...validInput(),
        acquiredAt: new Date('2026-08-29T09:59:29.000Z'),
      }),
    ).rejects.toBeInstanceOf(NonMonotonicMovementEvidenceError);
    expect(query).toHaveBeenLastCalledWith('rollback');
  });

  it('accepts a newer physical sample', async () => {
    const query = latestSampleQuery();
    const service = createMovementEvidenceService(createDatabase(query));

    await expect(
      service.record({
        ...validInput(),
        acquiredAt: new Date('2026-08-29T09:59:31.000Z'),
      }),
    ).resolves.toBeUndefined();
    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).includes('insert into public.movement_evidence'),
      ),
    ).toBe(true);
  });

  it.each([
    ['latitude', Number.NaN],
    ['latitude', 90.1],
    ['longitude', Number.POSITIVE_INFINITY],
    ['longitude', -180.1],
    ['accuracyMetres', -1],
  ] as const)(
    'rejects invalid %s before using the database',
    async (field, value) => {
      const connect = vi.fn();
      const service = createMovementEvidenceService({ connect } as never);

      await expect(
        service.record({ ...validInput(), [field]: value }),
      ).rejects.toBeInstanceOf(InvalidMovementEvidenceError);
      expect(connect).not.toHaveBeenCalled();
    },
  );

  it('deletes only evidence expired at the supplied cutoff', async () => {
    const query = vi.fn().mockResolvedValue({
      rowCount: 2,
      rows: [{ id: 'one' }, { id: 'two' }],
    });
    const service = createMovementEvidenceService(createDatabase(query));
    const cutoff = new Date('2026-08-30T10:00:00.000Z');

    await expect(service.purgeExpired(cutoff)).resolves.toBe(2);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('where expires_at <= $1'),
      [cutoff],
    );
  });

  it('rejects retention outside the technically safe Date range', () => {
    expect(() =>
      createMovementEvidenceService({ connect: vi.fn() } as never, {
        retentionMs: MAX_MOVEMENT_EVIDENCE_RETENTION_MS + 1,
      }),
    ).toThrow(InvalidMovementEvidenceError);
  });

  it('rejects an expiry that cannot be represented after server receipt', async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('select player.id::text')) {
        return { rows: [{ player_id: PLAYER_ID }] };
      }

      if (statement.includes('select event_id::text')) {
        return { rows: [] };
      }

      return { rows: [] };
    });
    const service = createMovementEvidenceService(createDatabase(query), {
      retentionMs: 1_000,
    });
    const receivedAt = new Date(8_640_000_000_000_000 - 500);

    await expect(
      service.record({
        ...validInput(),
        acquiredAt: receivedAt,
        receivedAt,
      }),
    ).rejects.toThrow(
      'Movement evidence expiry must be a finite representable date after server receipt.',
    );
    expect(query).toHaveBeenLastCalledWith('rollback');
  });

  it('replaces database failures with a coordinate-free persistence error', async () => {
    const query = vi.fn(async (statement: string, values?: unknown[]) => {
      void values;
      if (statement.includes('select player.id::text')) {
        return { rows: [{ player_id: PLAYER_ID }] };
      }

      if (statement.includes('select event_id::text')) {
        return { rows: [] };
      }

      if (statement.includes('insert into public.movement_evidence')) {
        throw new Error('failing row contains -26.19205 and 28.03038');
      }

      return { rows: [] };
    });
    const service = createMovementEvidenceService(createDatabase(query));

    let failure: Error | undefined;

    try {
      await service.record(validInput());
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }

    expect(failure).toBeInstanceOf(MovementEvidencePersistenceError);
    if (!failure) {
      throw new Error('Expected movement evidence persistence to fail.');
    }
    expect(failure.message).toBe('Movement evidence could not be stored.');
    expect(failure.message).not.toContain('-26.19205');
    expect(query).toHaveBeenLastCalledWith('rollback');
  });
});

function validInput() {
  return {
    playerId: PLAYER_ID,
    eventId: EVENT_ID,
    latitude: -26.19205,
    longitude: 28.03038,
    accuracyMetres: 10,
    acquiredAt: ACQUIRED_AT,
    receivedAt: RECEIVED_AT,
  };
}

function latestRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    event_id: EVENT_ID,
    latitude: -26.19205,
    longitude: 28.03038,
    accuracy_metres: 10,
    acquired_at: ACQUIRED_AT,
    ...overrides,
  };
}

function latestSampleQuery() {
  return vi.fn(async (statement: string, values?: unknown[]) => {
    void values;
    if (statement.includes('select player.id::text')) {
      return { rows: [{ player_id: PLAYER_ID }] };
    }

    if (statement.includes('select event_id::text')) {
      return { rows: [latestRow()] };
    }

    return { rows: [] };
  });
}

function createDatabase(query: ReturnType<typeof vi.fn>) {
  const client = {
    query,
    release: vi.fn(),
  } as unknown as pg.PoolClient;

  return {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pick<pg.Pool, 'connect'>;
}

import { randomUUID } from 'node:crypto';

import type pg from 'pg';

const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;
const MIN_RETENTION_MS = 1_000;

// ECMAScript Date values are limited to +/-8.64e15 ms. This technical cap
// leaves ample headroom for adding a server receipt timestamp without turning
// an otherwise accepted configuration into an invalid expiry date.
export const MAX_MOVEMENT_EVIDENCE_RETENTION_MS = 8_000_000_000_000_000;

export interface MovementEvidenceInput {
  playerId: string;
  eventId: string;
  latitude: number;
  longitude: number;
  accuracyMetres: number;
  acquiredAt: Date;
  receivedAt: Date;
}

export interface MovementEvidenceService {
  record(input: MovementEvidenceInput): Promise<void>;
  purgeExpired(expiredAt?: Date): Promise<number>;
}

interface CreateMovementEvidenceServiceOptions {
  clock?: () => Date;
  createId?: () => string;
  retentionMs?: number;
}

interface LatestEvidenceRow extends pg.QueryResultRow {
  accuracy_metres: number;
  acquired_at: Date;
  event_id: string;
  latitude: number;
  longitude: number;
}

export class InvalidMovementEvidenceError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMovementEvidenceError';
  }
}

export class InvalidMovementEvidenceContextError extends Error {
  constructor() {
    super('The authenticated player or event context is unavailable.');
    this.name = 'InvalidMovementEvidenceContextError';
  }
}

export class NonMonotonicMovementEvidenceError extends Error {
  constructor() {
    super(
      'Location acquisition time must not be older than the latest movement sample, and equal timestamps must describe the same physical sample.',
    );
    this.name = 'NonMonotonicMovementEvidenceError';
  }
}

export class MovementEvidencePersistenceError extends Error {
  constructor() {
    super('Movement evidence could not be stored.');
    this.name = 'MovementEvidencePersistenceError';
  }
}

export function createMovementEvidenceService(
  database: Pick<pg.Pool, 'connect'>,
  {
    clock = () => new Date(),
    createId = randomUUID,
    retentionMs = DEFAULT_RETENTION_MS,
  }: CreateMovementEvidenceServiceOptions = {},
): MovementEvidenceService {
  validateRetention(retentionMs);

  return {
    async record(input) {
      validateInput(input);

      const client = await database.connect();

      try {
        await client.query('begin');

        const context = await client.query<{ player_id: string }>(
          `
            select player.id::text as player_id
              from public.players player
             where player.id = $1::uuid
               and player.lifecycle_status = 'active'
               and exists (
                 select 1
                   from public.events event
                   cross join lateral public.resolve_event_availability(
                     event.id,
                     $3::timestamptz
                   ) effective
                  where event.id = $2::uuid
                    and effective.availability = 'active'
               )
             for update
          `,
          [input.playerId, input.eventId, input.receivedAt],
        );

        if (!context.rows[0]) {
          throw new InvalidMovementEvidenceContextError();
        }

        const latest = await client.query<LatestEvidenceRow>(
          `
            select event_id::text,
                   latitude,
                   longitude,
                   accuracy_metres,
                   acquired_at
              from public.movement_evidence
             where player_id = $1::uuid
               and acquired_at = (
                 select max(existing.acquired_at)
                   from public.movement_evidence existing
                  where existing.player_id = $1::uuid
               )
             order by event_id
          `,
          [input.playerId],
        );

        const latestAcquiredAt = latest.rows[0]?.acquired_at.getTime();

        if (latestAcquiredAt !== undefined) {
          const incomingAcquiredAt = input.acquiredAt.getTime();

          if (incomingAcquiredAt < latestAcquiredAt) {
            throw new NonMonotonicMovementEvidenceError();
          }

          if (incomingAcquiredAt === latestAcquiredAt) {
            const physicalSampleMatches = latest.rows.every(
              (row) =>
                row.latitude === input.latitude &&
                row.longitude === input.longitude &&
                row.accuracy_metres === input.accuracyMetres,
            );

            if (!physicalSampleMatches) {
              throw new NonMonotonicMovementEvidenceError();
            }

            if (latest.rows.some((row) => row.event_id === input.eventId)) {
              await client.query('commit');
              return;
            }
          }
        }

        const expiresAt = calculateExpiry(input.receivedAt, retentionMs);

        await client.query(
          `
            insert into public.movement_evidence (
              id,
              player_id,
              event_id,
              latitude,
              longitude,
              accuracy_metres,
              acquired_at,
              received_at,
              expires_at,
              created_at
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8)
          `,
          [
            createId(),
            input.playerId,
            input.eventId,
            input.latitude,
            input.longitude,
            input.accuracyMetres,
            input.acquiredAt,
            input.receivedAt,
            expiresAt,
          ],
        );

        await client.query('commit');
      } catch (error) {
        await client.query('rollback');

        if (
          error instanceof InvalidMovementEvidenceError ||
          error instanceof InvalidMovementEvidenceContextError ||
          error instanceof NonMonotonicMovementEvidenceError
        ) {
          throw error;
        }

        throw new MovementEvidencePersistenceError();
      } finally {
        client.release();
      }
    },

    async purgeExpired(expiredAt = clock()) {
      if (!isValidDate(expiredAt)) {
        throw new InvalidMovementEvidenceError(
          'Cleanup time must be a valid date-time.',
        );
      }

      const client = await database.connect();

      try {
        const result = await client.query<{ id: string }>(
          `
            delete from public.movement_evidence
             where expires_at <= $1
             returning id
          `,
          [expiredAt],
        );

        return result.rowCount ?? result.rows.length;
      } finally {
        client.release();
      }
    },
  };
}

function validateInput(input: MovementEvidenceInput): void {
  if (
    !Number.isFinite(input.latitude) ||
    input.latitude < -90 ||
    input.latitude > 90
  ) {
    throw new InvalidMovementEvidenceError(
      'Latitude must be a finite number between -90 and 90 degrees.',
    );
  }

  if (
    !Number.isFinite(input.longitude) ||
    input.longitude < -180 ||
    input.longitude > 180
  ) {
    throw new InvalidMovementEvidenceError(
      'Longitude must be a finite number between -180 and 180 degrees.',
    );
  }

  if (!Number.isFinite(input.accuracyMetres) || input.accuracyMetres < 0) {
    throw new InvalidMovementEvidenceError(
      'Reported accuracy must be a finite non-negative number.',
    );
  }

  if (!isValidDate(input.acquiredAt) || !isValidDate(input.receivedAt)) {
    throw new InvalidMovementEvidenceError(
      'Movement evidence timestamps must be valid date-times.',
    );
  }

  if (input.acquiredAt.getTime() > input.receivedAt.getTime()) {
    throw new InvalidMovementEvidenceError(
      'Acquisition time cannot be later than server receipt time.',
    );
  }
}

function validateRetention(retentionMs: number): void {
  if (
    !Number.isSafeInteger(retentionMs) ||
    retentionMs < MIN_RETENTION_MS ||
    retentionMs > MAX_MOVEMENT_EVIDENCE_RETENTION_MS
  ) {
    throw new InvalidMovementEvidenceError(
      `Movement evidence retention must be a safe integer between ${MIN_RETENTION_MS} and ${MAX_MOVEMENT_EVIDENCE_RETENTION_MS} milliseconds.`,
    );
  }
}

function calculateExpiry(receivedAt: Date, retentionMs: number): Date {
  const receivedAtMilliseconds = receivedAt.getTime();
  const expiresAt = new Date(receivedAtMilliseconds + retentionMs);

  if (
    !isValidDate(expiresAt) ||
    expiresAt.getTime() <= receivedAtMilliseconds
  ) {
    throw new InvalidMovementEvidenceError(
      'Movement evidence expiry must be a finite representable date after server receipt.',
    );
  }

  return expiresAt;
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

export const PROVISIONAL_MOVEMENT_EVIDENCE_RETENTION_MS = DEFAULT_RETENTION_MS;
export const MIN_MOVEMENT_EVIDENCE_RETENTION_MS = MIN_RETENTION_MS;

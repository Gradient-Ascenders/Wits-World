import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createOfflineChallengeService } from '../src/challenges/offline-challenges.js';
import type { OfflineSubmission } from '../src/challenges/offline-policy.js';

const mocks = vi.hoisted(() => ({
  listEvents: vi.fn(),
  readAttempt: vi.fn(),
  scoreAttempt: vi.fn(),
}));

vi.mock('../src/events/event-discovery.js', () => ({
  createEventDiscoveryService: () => ({ list: mocks.listEvents }),
}));

vi.mock('../src/challenges/challenge-attempt-reader.js', () => ({
  createChallengeAttemptReader: () => ({
    findByPlayerAndAttempt: mocks.readAttempt,
  }),
}));

vi.mock('../src/challenges/challenge-attempt-marking.js', () => ({
  calculateChallengeAttemptScore: mocks.scoreAttempt,
}));

const now = new Date('2026-09-28T10:00:00.000Z');
const playerId = randomUUID();
const eventId = randomUUID();
const challengeId = randomUUID();

interface QueryResult {
  rows: unknown[];
}

function databaseWith(
  resolveQuery: (sql: string, values?: unknown[]) => QueryResult,
) {
  const query = vi.fn((sql: string, values?: unknown[]) =>
    Promise.resolve(resolveQuery(sql, values)),
  );
  const release = vi.fn();
  return {
    database: {
      connect: vi.fn().mockResolvedValue({ query, release }),
    },
    query,
    release,
  };
}

function submission(
  packToken: string,
  pack: { questions: Array<{ id: string; options: Array<{ id: string }> }> },
): OfflineSubmission {
  return {
    clientAttemptId: randomUUID(),
    packToken,
    startedAt: '2026-09-28T10:01:00.000Z',
    finishedAt: '2026-09-28T10:02:00.000Z',
    startLocation: {
      latitude: -26.1929,
      longitude: 28.0305,
      accuracyMetres: 5,
      acquiredAt: '2026-09-28T10:01:00.000Z',
    },
    finishLocation: {
      latitude: -26.1929,
      longitude: 28.0305,
      accuracyMetres: 5,
      acquiredAt: '2026-09-28T10:02:00.000Z',
    },
    answers: pack.questions.map((question, index) => ({
      questionId: question.id,
      answeredAt: new Date(
        now.getTime() + 70_000 + index * 5_000,
      ).toISOString(),
      optionIds: [question.options[0]!.id],
    })),
  };
}

function options() {
  return {
    signingKey: 's'.repeat(32),
    finalizer: { finalizeAttempt: vi.fn().mockResolvedValue(undefined) },
    maxSpeed: 12,
    retentionMs: 86_400_000,
    clock: () => now,
    trustRestrictions: { assertAllowed: vi.fn().mockResolvedValue(undefined) },
    trustService: {
      recordSubmissionConflict: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('offline challenge service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listEvents.mockResolvedValue([
      {
        eventId,
        title: 'Library steps',
        description: 'Campus history challenge',
        latitude: -26.1929,
        longitude: 28.0305,
        radiusMetres: 75,
        startsAt: '2026-09-28T09:00:00.000Z',
        endsAt: '2026-09-28T12:00:00.000Z',
        availability: 'available',
      },
    ]);
    mocks.readAttempt.mockResolvedValue({ attemptId: 'attempt-result' });
    mocks.scoreAttempt.mockResolvedValue({ scoreCorrect: 5 });
  });

  it('issues a signed pack and persists a valid delayed submission atomically', async () => {
    const questionIds = Array.from({ length: 5 }, () => randomUUID());
    const fixture = databaseWith((sql) => {
      if (sql.includes('event_placement_state')) {
        return {
          rows: [
            {
              placement_assignment_id: null,
              next_boundary: new Date('2026-09-29T00:00:00.000Z'),
            },
          ],
        };
      }
      if (sql.includes('from public.event_challenges challenge join')) {
        return {
          rows: [
            {
              id: challengeId,
              version: 3,
              event_version: 4,
              format: 'multiple_choice',
            },
          ],
        };
      }
      if (
        sql.includes(
          'from public.challenge_questions\n            where challenge_id',
        )
      ) {
        return {
          rows: questionIds.map((id, index) => ({
            id,
            version: 1,
            prompt: `Question ${index + 1}`,
            difficulty: 1,
          })),
        };
      }
      if (sql.includes('from public.challenge_choices')) {
        return {
          rows: Array.from({ length: 4 }, (_, index) => ({
            id: randomUUID(),
            text: `Choice ${index + 1}`,
          })),
        };
      }
      if (sql.includes('from public.players'))
        return { rows: [{ id: playerId }] };
      if (
        sql.includes(
          'from public.challenge_attempts\n          where player_id',
        )
      )
        return { rows: [] };
      if (sql.includes('from public.event_placement_portability'))
        return { rows: [] };
      if (sql.includes('select event.id from public.events'))
        return { rows: [{ id: eventId }] };
      if (sql.includes('select id from public.challenge_questions where id='))
        return { rows: [{ id: 'question' }] };
      if (sql.includes('st_distance')) return { rows: [{ distance: 0 }] };
      if (sql.includes('select * from public.movement_evidence'))
        return { rows: [] };
      return { rows: [] };
    });
    const serviceOptions = options();
    serviceOptions.clock = vi
      .fn()
      .mockReturnValueOnce(now)
      .mockReturnValue(new Date('2026-09-28T10:03:00.000Z'));
    const service = createOfflineChallengeService(
      fixture.database,
      serviceOptions,
    );

    const packs = await service.packs(playerId, [eventId]);

    expect(packs).toHaveLength(1);
    expect(packs[0]!.pack.questions).toHaveLength(5);
    expect(packs[0]!.packToken).not.toContain(challengeId);
    expect(
      serviceOptions.trustRestrictions.assertAllowed,
    ).toHaveBeenCalledTimes(2);

    const input = submission(packs[0]!.packToken, packs[0]!.pack);
    const result = await service.submit(playerId, input);

    expect(result).toEqual({
      created: true,
      attempt: { attemptId: 'attempt-result' },
    });
    expect(serviceOptions.finalizer.finalizeAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        playerId,
        completionReason: 'answered',
        scoreCorrect: 5,
      }),
    );
    expect(
      fixture.query.mock.calls.filter(([sql]) =>
        String(sql).includes('insert into public.attempt_answers'),
      ),
    ).toHaveLength(5);
    expect(fixture.query).toHaveBeenCalledWith('commit');
    expect(fixture.release).toHaveBeenCalledTimes(2);
  });

  it('returns an existing attempt for an identical retry', async () => {
    const packFixture = databaseWith((sql) => {
      if (sql.includes('event_placement_state')) {
        return {
          rows: [
            {
              placement_assignment_id: null,
              next_boundary: new Date('2026-09-29T00:00:00.000Z'),
            },
          ],
        };
      }
      if (sql.includes('from public.event_challenges challenge join')) {
        return {
          rows: [
            {
              id: challengeId,
              version: 1,
              event_version: 1,
              format: 'multiple_choice',
            },
          ],
        };
      }
      if (
        sql.includes(
          'from public.challenge_questions\n            where challenge_id',
        )
      ) {
        return {
          rows: Array.from({ length: 5 }, (_, index) => ({
            id: randomUUID(),
            version: 1,
            prompt: `Question ${index + 1}`,
            difficulty: 1,
          })),
        };
      }
      if (sql.includes('from public.challenge_choices')) {
        return {
          rows: Array.from({ length: 4 }, (_, index) => ({
            id: randomUUID(),
            text: `Choice ${index + 1}`,
          })),
        };
      }
      return { rows: [] };
    });
    const serviceOptions = options();
    serviceOptions.clock = vi
      .fn()
      .mockReturnValueOnce(now)
      .mockReturnValue(new Date('2026-09-28T10:03:00.000Z'));
    const packService = createOfflineChallengeService(
      packFixture.database,
      serviceOptions,
    );
    const issued = (await packService.packs(playerId, [eventId]))[0]!;
    const input = submission(issued.packToken, issued.pack);

    const retryFixture = databaseWith((sql) => {
      if (sql.includes('from public.players'))
        return { rows: [{ id: playerId }] };
      if (
        sql.includes(
          'from public.challenge_attempts\n          where player_id',
        )
      ) {
        return {
          rows: [
            {
              id: 'existing-attempt',
              offline_client_attempt_id: input.clientAttemptId,
              offline_pack_id: issued.pack.packId,
              offline_submission_digest: null,
            },
          ],
        };
      }
      return { rows: [] };
    });
    const retryService = createOfflineChallengeService(
      retryFixture.database,
      serviceOptions,
    );

    await expect(retryService.submit(playerId, input)).resolves.toEqual({
      created: false,
      attempt: { attemptId: 'attempt-result' },
    });
    expect(mocks.scoreAttempt).not.toHaveBeenCalled();
    expect(retryFixture.query).toHaveBeenCalledWith('commit');
  });
});

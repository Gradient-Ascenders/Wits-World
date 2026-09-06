import { describe, expect, it } from 'vitest';
import {
  createOfflinePackCodec,
  OFFLINE_SYNC_GRACE_MS,
  validateOfflineTiming,
  type OfflinePack,
  type OfflineSubmission,
} from '../src/challenges/offline-policy.js';

export const pack: OfflinePack = {
  version: 1,
  packId: 'pack',
  playerId: 'player',
  issuedAt: '2026-09-06T10:00:00Z',
  validFrom: '2026-09-06T10:00:00Z',
  validUntil: '2026-09-06T11:00:00Z',
  event: {
    eventId: 'event',
    version: 1,
    title: 'Event',
    description: null,
    latitude: 0,
    longitude: 0,
    radiusMetres: 75,
  },
  challengeId: 'challenge',
  challengeVersion: 1,
  format: 'multiple_choice',
  timeLimitSeconds: 90,
  questions: Array.from({ length: 5 }, (_, index) => ({
    id: `q${index}`,
    version: 1,
    prompt: 'Question',
    difficulty: 1,
    options: Array.from({ length: 4 }, (_, option) => ({
      id: `q${index}o${option}`,
      text: 'Option',
    })),
  })),
};
function submission(): OfflineSubmission {
  return {
    clientAttemptId: 'attempt',
    packToken: 'token',
    startedAt: '2026-09-06T10:01:00Z',
    finishedAt: '2026-09-06T10:02:00Z',
    startLocation: {
      latitude: 0,
      longitude: 0,
      accuracyMetres: 10,
      acquiredAt: '2026-09-06T10:01:00Z',
    },
    finishLocation: {
      latitude: 0,
      longitude: 0,
      accuracyMetres: 10,
      acquiredAt: '2026-09-06T10:02:00Z',
    },
    answers: pack.questions.map((question, index) => ({
      questionId: question.id,
      answeredAt: new Date(
        Date.parse('2026-09-06T10:01:10Z') + index * 10000,
      ).toISOString(),
      optionIds: [question.options[0]!.id],
    })),
  };
}
describe('offline contract integrity', () => {
  it('binds signed packs to one player and rejects tampering and unknown keys', () => {
    const codec = createOfflinePackCodec('a'.repeat(32));
    const token = codec.encode(pack);
    expect(codec.decode(token, pack.playerId)).toEqual(pack);
    expect(() => codec.decode(token, 'another')).toThrow();
    expect(() => codec.decode(`${token}x`, pack.playerId)).toThrow();
    expect(() =>
      createOfflinePackCodec('b'.repeat(32)).decode(token, pack.playerId),
    ).toThrow();
    expect(
      createOfflinePackCodec('b'.repeat(32), 'a'.repeat(32)).decode(
        token,
        pack.playerId,
      ),
    ).toEqual(pack);
  });
  it('accepts delayed sync after event closure but enforces the exact 12-hour completion boundary', () => {
    const input = submission();
    const completed = Date.parse(input.answers[4]!.answeredAt);
    expect(
      validateOfflineTiming(
        pack,
        input,
        new Date(completed + OFFLINE_SYNC_GRACE_MS),
      ).completionReason,
    ).toBe('answered');
    expect(() =>
      validateOfflineTiming(
        pack,
        input,
        new Date(completed + OFFLINE_SYNC_GRACE_MS + 1),
      ),
    ).toThrow();
  });
  it('scores only answers strictly before the deadline and finalizes partial attempts at timeout', () => {
    const input = submission();
    input.answers = input.answers.slice(0, 2);
    input.finishedAt = '2026-09-06T10:02:30Z';
    input.answers[1]!.answeredAt = input.finishedAt;
    const result = validateOfflineTiming(
      pack,
      input,
      new Date('2026-09-06T12:00:00Z'),
    );
    expect(result.completionReason).toBe('timeout');
    expect(result.timelyAnswers).toHaveLength(1);
  });
  it('rejects starts before issue, reordered questions, duplicate choices, future answers and early partial completion', () => {
    for (const mutate of [
      (input: OfflineSubmission) => {
        input.startedAt = '2026-09-06T09:59:59Z';
      },
      (input: OfflineSubmission) => {
        input.answers.reverse();
      },
      (input: OfflineSubmission) => {
        input.answers[0]!.optionIds.push('invalid');
      },
      (input: OfflineSubmission) => {
        input.answers[4]!.answeredAt = '2026-09-06T12:01:00Z';
      },
      (input: OfflineSubmission) => {
        input.answers.pop();
      },
    ]) {
      const input = submission();
      mutate(input);
      expect(() =>
        validateOfflineTiming(pack, input, new Date('2026-09-06T12:00:00Z')),
      ).toThrow();
    }
  });
  it('validates ordering as a permutation of all four signed items', () => {
    const ordering = { ...pack, format: 'ordering' as const };
    const input = submission();
    input.answers = input.answers.map((answer, index) => ({
      ...answer,
      optionIds: pack.questions[index]!.options.map(
        (option) => option.id,
      ).reverse(),
    }));
    expect(
      validateOfflineTiming(ordering, input, new Date('2026-09-06T12:00:00Z'))
        .timelyAnswers,
    ).toHaveLength(5);
    input.answers[0]!.optionIds[1] = input.answers[0]!.optionIds[0]!;
    expect(() =>
      validateOfflineTiming(ordering, input, new Date('2026-09-06T12:00:00Z')),
    ).toThrow();
  });
});

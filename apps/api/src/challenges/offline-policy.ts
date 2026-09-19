import { createHmac, timingSafeEqual } from 'node:crypto';

import type { ChallengeDifficulty } from './challenge-timing.js';

export const OFFLINE_PACK_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const OFFLINE_SYNC_GRACE_MS = 12 * 60 * 60 * 1000;

export interface OfflinePack {
  version: 1;
  packId: string;
  playerId: string;
  issuedAt: string;
  validFrom: string;
  validUntil: string;
  placementAssignmentId?: string;
  event: {
    eventId: string;
    version: number;
    title: string;
    description: string | null;
    latitude: number;
    longitude: number;
    radiusMetres: number;
  };
  challengeId: string;
  challengeVersion: number;
  format: 'multiple_choice' | 'ordering';
  timeLimitSeconds: 90 | 120 | 150;
  questions: Array<{
    id: string;
    version: number;
    prompt: string;
    difficulty: ChallengeDifficulty;
    options: Array<{ id: string; text: string }>;
  }>;
}

export interface OfflineLocation {
  latitude: number;
  longitude: number;
  accuracyMetres: number;
  acquiredAt: string;
}

export interface OfflineSubmission {
  clientAttemptId: string;
  packToken: string;
  startedAt: string;
  finishedAt: string;
  answers: Array<{
    questionId: string;
    answeredAt: string;
    optionIds: string[];
  }>;
  startLocation: OfflineLocation;
  finishLocation: OfflineLocation;
}

export class OfflineRejection extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode = 422,
  ) {
    super('The offline attempt could not be accepted.');
    this.name = 'OfflineRejection';
  }
}

export function createOfflinePackCodec(key: string, previousKey?: string) {
  for (const candidate of [key, previousKey].filter(
    (value) => value !== undefined,
  )) {
    if (Buffer.byteLength(candidate, 'utf8') < 32) {
      throw new Error(
        'Offline pack signing keys must contain at least 32 UTF-8 bytes.',
      );
    }
  }
  const sign = (secret: string, body: string) =>
    createHmac('sha256', secret)
      .update(`wits-world/offline/v1\n${body}`)
      .digest();
  return {
    encode(pack: OfflinePack): string {
      const body = Buffer.from(JSON.stringify(pack)).toString('base64url');
      return `${body}.${sign(key, body).toString('base64url')}`;
    },
    decode(token: string, playerId: string): OfflinePack {
      if (token.length > 128_000)
        throw new OfflineRejection('OFFLINE_INVALID_PACK');
      const [body, signature, extra] = token.split('.');
      if (!body || !signature || extra !== undefined)
        throw new OfflineRejection('OFFLINE_INVALID_PACK');
      const supplied = Buffer.from(signature, 'base64url');
      if (
        ![key, previousKey].some((secret) => {
          if (!secret) return false;
          const expected = sign(secret, body);
          return (
            expected.length === supplied.length &&
            timingSafeEqual(expected, supplied)
          );
        })
      )
        throw new OfflineRejection('OFFLINE_INVALID_PACK');
      let pack: OfflinePack;
      try {
        pack = JSON.parse(
          Buffer.from(body, 'base64url').toString('utf8'),
        ) as OfflinePack;
      } catch {
        throw new OfflineRejection('OFFLINE_INVALID_PACK');
      }
      if (
        pack.version !== 1 ||
        pack.playerId !== playerId ||
        pack.questions.length !== 5
      ) {
        throw new OfflineRejection('OFFLINE_INVALID_PACK');
      }
      return pack;
    },
  };
}

export function validateOfflineTiming(
  pack: OfflinePack,
  input: OfflineSubmission,
  receivedAt: Date,
) {
  const start = Date.parse(input.startedAt);
  const finish = Date.parse(input.finishedAt);
  const deadline = start + pack.timeLimitSeconds * 1000;
  const receipt = receivedAt.getTime();
  if (
    ![start, finish, receipt].every(Number.isFinite) ||
    start < Date.parse(pack.issuedAt) ||
    start < Date.parse(pack.validFrom) ||
    start >= Date.parse(pack.validUntil) ||
    finish < start ||
    finish > receipt
  ) {
    throw new OfflineRejection('OFFLINE_INVALID_TIME');
  }
  const seen = new Set<string>();
  let lastAnswer = start;
  for (const [index, answer] of input.answers.entries()) {
    const question = pack.questions[index];
    const time = Date.parse(answer.answeredAt);
    if (
      !question ||
      question.id !== answer.questionId ||
      seen.has(answer.questionId) ||
      !Number.isFinite(time) ||
      time < lastAnswer ||
      time > finish ||
      answer.optionIds.length !== (pack.format === 'ordering' ? 4 : 1) ||
      new Set(answer.optionIds).size !== answer.optionIds.length ||
      answer.optionIds.some(
        (id) => !question.options.some((option) => option.id === id),
      )
    ) {
      throw new OfflineRejection('OFFLINE_INVALID_ANSWER');
    }
    lastAnswer = time;
    seen.add(answer.questionId);
  }
  const timelyAnswers = input.answers.filter(
    (answer) => Date.parse(answer.answeredAt) < deadline,
  );
  const answered = timelyAnswers.length === 5;
  const completedAt = answered ? lastAnswer : deadline;
  if (
    (!answered && finish < deadline) ||
    finish < completedAt ||
    receipt < completedAt
  ) {
    throw new OfflineRejection('OFFLINE_INVALID_TIME');
  }
  if (
    receipt > completedAt + OFFLINE_SYNC_GRACE_MS ||
    receipt >
      Date.parse(pack.validUntil) +
        pack.timeLimitSeconds * 1000 +
        OFFLINE_SYNC_GRACE_MS
  ) {
    throw new OfflineRejection('OFFLINE_SYNC_EXPIRED');
  }
  return {
    deadline: new Date(deadline),
    completedAt: new Date(completedAt),
    completionReason: answered ? ('answered' as const) : ('timeout' as const),
    timelyAnswers,
  };
}

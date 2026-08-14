import { describe, expect, it } from 'vitest';

import { classifyChallengeAnswerTiming } from '../src/challenges/challenge-answer-timing.js';

describe('challenge answer timing', () => {
  const deadline = new Date('2026-09-01T10:02:00.000Z');

  it('accepts a server receipt strictly before the deadline', () => {
    expect(
      classifyChallengeAnswerTiming(
        new Date('2026-09-01T10:01:59.999Z'),
        deadline,
      ),
    ).toBe('on_time');
  });

  it('treats a receipt exactly at the deadline as expired', () => {
    expect(
      classifyChallengeAnswerTiming(
        new Date('2026-09-01T10:02:00.000Z'),
        deadline,
      ),
    ).toBe('expired');
  });

  it('treats a receipt after the deadline as expired', () => {
    expect(
      classifyChallengeAnswerTiming(
        new Date('2026-09-01T10:02:00.001Z'),
        deadline,
      ),
    ).toBe('expired');
  });

  it('rejects invalid timestamps', () => {
    expect(() =>
      classifyChallengeAnswerTiming(new Date('invalid'), deadline),
    ).toThrow('Challenge answer timing requires valid timestamps.');
  });
});

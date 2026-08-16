import { describe, expect, it } from 'vitest';

import {
  describeChallengeTime,
  formatChallengeTime,
  remainingChallengeSeconds,
} from '../src/challenge-deadline';

describe('challenge deadline display', () => {
  it('derives remaining time from the absolute server deadline', () => {
    expect(
      remainingChallengeSeconds(
        '2026-09-01T10:02:00.000Z',
        Date.parse('2026-09-01T10:00:00.100Z'),
      ),
    ).toBe(120);
  });

  it('does not extend a challenge after delayed browser updates', () => {
    expect(
      remainingChallengeSeconds(
        '2026-09-01T10:02:00.000Z',
        Date.parse('2026-09-01T10:02:05.000Z'),
      ),
    ).toBe(0);
  });

  it('formats visual and assistive timer text', () => {
    expect(formatChallengeTime(65)).toBe('1:05');
    expect(describeChallengeTime(65)).toBe('1 minute 5 seconds remaining');
  });
});

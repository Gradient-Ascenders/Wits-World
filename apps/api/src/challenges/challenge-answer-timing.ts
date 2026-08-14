export type ChallengeAnswerTiming = 'on_time' | 'expired';

export function classifyChallengeAnswerTiming(
  receivedAt: Date,
  deadline: Date,
): ChallengeAnswerTiming {
  if (Number.isNaN(receivedAt.getTime()) || Number.isNaN(deadline.getTime())) {
    throw new Error('Challenge answer timing requires valid timestamps.');
  }

  return receivedAt.getTime() < deadline.getTime() ? 'on_time' : 'expired';
}

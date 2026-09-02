export type RewardCardRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface ChallengeRewardPlan {
  cardRarities: RewardCardRarity[];
}

export type RewardRandomInt = (maxExclusive: number) => number;

export class RewardCatalogUnavailableError extends Error {
  constructor(
    message = 'The configured reward card catalogue is unavailable.',
  ) {
    super(message);
    this.name = 'RewardCatalogUnavailableError';
  }
}

const perfectScoreRarityWeights: Array<{
  rarity: RewardCardRarity;
  weight: number;
}> = [
  { rarity: 'common', weight: 45 },
  { rarity: 'rare', weight: 40 },
  { rarity: 'epic', weight: 14 },
  { rarity: 'legendary', weight: 1 },
];

export function calculateChallengeRewardPlan(
  scoreCorrect: number,
  availableRarities: readonly RewardCardRarity[],
  randomInt: RewardRandomInt,
): ChallengeRewardPlan {
  if (!Number.isInteger(scoreCorrect) || scoreCorrect < 0 || scoreCorrect > 5) {
    throw new Error('Challenge score must be an integer from 0 through 5.');
  }

  if (scoreCorrect === 0) {
    return { cardRarities: [] };
  }

  if (scoreCorrect <= 2) {
    return { cardRarities: [] };
  }

  const available = new Set(availableRarities);

  if (scoreCorrect === 3) {
    if (!available.has('common')) {
      throw new RewardCatalogUnavailableError(
        'A Common card is required for a three-answer reward.',
      );
    }

    return { cardRarities: ['common'] };
  }

  const cardCount = scoreCorrect === 5 && randomInt(5) === 0 ? 2 : 1;
  const cardRarities = Array.from({ length: cardCount }, () =>
    chooseRarity(
      scoreCorrect === 4
        ? [
            { rarity: 'common', weight: 75 },
            { rarity: 'rare', weight: 25 },
          ]
        : perfectScoreRarityWeights,
      available,
      randomInt,
    ),
  );

  return { cardRarities };
}

function chooseRarity(
  weightedRarities: Array<{
    rarity: RewardCardRarity;
    weight: number;
  }>,
  available: Set<RewardCardRarity>,
  randomInt: RewardRandomInt,
): RewardCardRarity {
  const candidates = weightedRarities.filter(({ rarity }) =>
    available.has(rarity),
  );

  if (candidates.length === 0) {
    throw new RewardCatalogUnavailableError();
  }

  const totalWeight = candidates.reduce(
    (total, candidate) => total + candidate.weight,
    0,
  );
  const roll = randomInt(totalWeight);
  let cumulativeWeight = 0;

  for (const candidate of candidates) {
    cumulativeWeight += candidate.weight;

    if (roll < cumulativeWeight) {
      return candidate.rarity;
    }
  }

  throw new Error('Reward rarity selection returned an invalid result.');
}

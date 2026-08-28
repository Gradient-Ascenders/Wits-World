export function buildStarterCards(affinity = 'wit') {
  return [1, 2, 3, 4, 5].map((index) =>
    buildCard(index, {
      affinity,
      category: index <= 3 ? 'creature' : 'power',
      hp: index <= 3 ? 90 + index : null,
      moves: index <= 3 ? buildMoves(index) : [],
      power: index <= 3 ? 10 + index : null,
    }),
  );
}

export function buildStarterOptions() {
  return (['spark', 'grit', 'wit'] as const).map((affinity) => {
    const profile = {
      spark: {
        title: 'Pressure',
        description: 'Deal more damage now and force the pace.',
        highlights: ['High burst', 'Lower HP', 'Pressure-focused'],
      },
      grit: {
        title: 'Durability',
        description: 'Take more hits and stretch each point of Power.',
        highlights: [
          'Highest durability',
          'Efficient moves',
          'Healing / mitigation',
        ],
      },
      wit: {
        title: 'Flexibility',
        description: 'Use broader move coverage and disrupt the opponent.',
        highlights: ['Balanced stats', 'Broader coverage', 'Resource control'],
      },
    }[affinity];

    return {
      affinity,
      composition: { creatureCount: 3, powerCardCount: 2 },
      creatures: [1, 2, 3].map((index) => ({
        hp: 90 + index,
        moves: [1, 2, 3, 4].map((position) => ({
          effectType: position === 4 ? 'debuff' : 'damage',
          effectValue: position === 4 ? 10 : 10 + position,
          modifierDurationTurns: position === 4 ? 2 : null,
          modifierOperation: position === 4 ? 'multiply' : null,
          modifierStat: position === 4 ? 'damage_multiplier' : null,
          moveType: position === 1 ? 'basic' : affinity,
          name: `${affinity} move ${position}`,
          position,
          powerCost: position - 1,
        })),
        name: `${affinity} Creature ${index}`,
        power: 10 + index,
      })),
      description: profile.description,
      highlights: profile.highlights,
      powerCards: [1, 2].map((index) => ({
        effects: [
          {
            effectType: 'damage',
            effectValue: 10 + index,
            modifierDurationTurns: null,
            modifierOperation: null,
            modifierStat: null,
            position: 1,
          },
        ],
        name: `${affinity} Power ${index}`,
      })),
      title: profile.title,
    };
  });
}

export function buildCard(
  index: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    acquiredAt: '2026-08-15T08:00:00.000Z',
    acquisitionKind: 'starter',
    affinity: 'wit',
    cardDefinitionId: buildUuid(100 + index),
    category: 'creature',
    description:
      'A thoughtful campus guardian with a deliberately descriptive story.',
    effects: [],
    hp: 100,
    imageUrl: null,
    isActive: true,
    moves: buildMoves(index),
    name: `Campus Guardian ${index}`,
    ownedCardId: buildUuid(200 + index),
    power: 12,
    rarity: 'common',
    ...overrides,
  };
}

function buildMoves(index: number) {
  return [
    {
      effectType: 'damage',
      effectValue: 20,
      id: buildUuid(300 + index),
      modifierDurationTurns: null,
      modifierOperation: null,
      modifierStat: null,
      moveType: 'wit',
      name: 'Knowledge Surge',
      position: 1,
      powerCost: 3,
    },
  ];
}

export function buildUuid(value: number) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

export function jsonResponse(payload: object, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

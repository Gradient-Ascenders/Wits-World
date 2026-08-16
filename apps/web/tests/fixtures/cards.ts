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

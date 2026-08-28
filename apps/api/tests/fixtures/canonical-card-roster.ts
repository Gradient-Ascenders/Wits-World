type ModifierStat = 'damage_multiplier' | 'power' | null;

export type ExpectedMove = readonly [
  name: string,
  moveType: string,
  effectType: string,
  effectValue: number,
  modifierStat: ModifierStat,
  modifierOperation: 'add' | 'multiply' | null,
  modifierDurationTurns: number | null,
  powerCost: number,
];

export type ExpectedEffect = readonly [
  effectType: string,
  effectValue: number,
  modifierStat: ModifierStat,
  modifierOperation: 'add' | 'multiply' | null,
  modifierDurationTurns: number | null,
];

export interface ExpectedCreature {
  affinity: string;
  hp: number;
  id: string;
  moves: readonly ExpectedMove[];
  name: string;
  power: number;
  rarity: string;
}

export interface ExpectedPowerCard {
  affinity: string;
  effects: readonly ExpectedEffect[];
  id: string;
  name: string;
  rarity: string;
}

const direct = null;
const multiply = 'multiply' as const;
const add = 'add' as const;
const damageMultiplier = 'damage_multiplier' as const;
const power = 'power' as const;

export const canonicalCreatures: readonly ExpectedCreature[] = [
  {
    id: 'eca9b943-9e05-834e-c85c-1175001d897c',
    name: 'Spark Creature 1',
    affinity: 'spark',
    rarity: 'common',
    hp: 96,
    power: 10,
    moves: [
      ['Steady Jab', 'basic', 'damage', 9, direct, direct, direct, 0],
      ['Flash Arc', 'spark', 'damage', 19, direct, direct, direct, 2],
      ['Overcharge', 'spark', 'damage', 32, direct, direct, direct, 4],
      ['Feinting Insight', 'mystic', 'damage', 15, direct, direct, direct, 2],
    ],
  },
  {
    id: 'ec9fb511-5dd2-8164-5f56-d9e13820c713',
    name: 'Spark Creature 2',
    affinity: 'spark',
    rarity: 'common',
    hp: 88,
    power: 12,
    moves: [
      ['Quick Jab', 'basic', 'damage', 8, direct, direct, direct, 0],
      ['Voltage Spike', 'spark', 'damage', 21, direct, direct, direct, 2],
      ['Redline', 'spark', 'damage', 34, direct, direct, direct, 4],
      ['Calculated Feint', 'mystic', 'damage', 16, direct, direct, direct, 2],
    ],
  },
  {
    id: '62d5bb93-78ad-5c44-412c-c7eca5f03250',
    name: 'Spark Creature 3',
    affinity: 'spark',
    rarity: 'common',
    hp: 103,
    power: 9,
    moves: [
      ['Pressing Blow', 'basic', 'damage', 10, direct, direct, direct, 0],
      ['Live Wire', 'spark', 'damage', 18, direct, direct, direct, 2],
      ['Read the Opening', 'mystic', 'damage', 15, direct, direct, direct, 2],
      [
        'Static Screen',
        'spark',
        'debuff',
        10,
        damageMultiplier,
        multiply,
        2,
        1,
      ],
    ],
  },
  {
    id: '740b5400-8362-b728-3b76-9d232077732d',
    name: 'Spark Rare Creature',
    affinity: 'spark',
    rarity: 'rare',
    hp: 98,
    power: 12,
    moves: [
      ['Measured Jab', 'basic', 'damage', 10, direct, direct, direct, 0],
      ['Flash Sequence', 'spark', 'damage', 22, direct, direct, direct, 2],
      ['Clever Vector', 'wit', 'damage', 16, direct, direct, direct, 2],
      ['Momentum Read', 'spark', 'buff', 15, damageMultiplier, multiply, 2, 1],
    ],
  },
  {
    id: '65f102ad-ff11-876c-a4f7-e2e74167bc4c',
    name: 'Spark Epic Creature',
    affinity: 'spark',
    rarity: 'epic',
    hp: 102,
    power: 13,
    moves: [
      ['Opening Tap', 'basic', 'damage', 10, direct, direct, direct, 0],
      ['Storm Thesis', 'spark', 'damage', 28, direct, direct, direct, 3],
      ['Countercurrent', 'wit', 'damage', 18, direct, direct, direct, 2],
      ['Prismatic Detour', 'mystic', 'damage', 18, direct, direct, direct, 2],
    ],
  },
  {
    id: '948a71e6-f04b-fcec-75ef-e401066ec8b8',
    name: 'Spark Legendary Creature',
    affinity: 'spark',
    rarity: 'legendary',
    hp: 106,
    power: 14,
    moves: [
      ['First Spark', 'basic', 'damage', 10, direct, direct, direct, 0],
      ['Crown Voltage', 'spark', 'damage', 31, direct, direct, direct, 3],
      ['Perfect Feint', 'wit', 'damage', 18, direct, direct, direct, 2],
      [
        'Unending Charge',
        'spark',
        'buff',
        15,
        damageMultiplier,
        multiply,
        null,
        2,
      ],
    ],
  },
  {
    id: '27cbcedf-1886-aa81-04b4-089b4c10cd87',
    name: 'Grit Creature 1',
    affinity: 'grit',
    rarity: 'common',
    hp: 104,
    power: 9,
    moves: [
      ['Firm Strike', 'basic', 'damage', 10, direct, direct, direct, 0],
      ['Stone Rhythm', 'grit', 'damage', 15, direct, direct, direct, 1],
      ['Hidden Angle', 'spirit', 'damage', 15, direct, direct, direct, 2],
      ['Dig In', 'grit', 'debuff', 10, damageMultiplier, multiply, 2, 1],
    ],
  },
  {
    id: 'c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac',
    name: 'Grit Creature 2',
    affinity: 'grit',
    rarity: 'common',
    hp: 101,
    power: 11,
    moves: [
      ['Workmanlike Blow', 'basic', 'damage', 9, direct, direct, direct, 0],
      ['Efficient Force', 'grit', 'damage', 21, direct, direct, direct, 2],
      ['Relentless Drive', 'grit', 'damage', 28, direct, direct, direct, 3],
      ['Patient Read', 'spirit', 'damage', 16, direct, direct, direct, 2],
    ],
  },
  {
    id: 'fc2c46fb-d960-b1bb-ea9a-93110b79e22d',
    name: 'Grit Creature 3',
    affinity: 'grit',
    rarity: 'common',
    hp: 98,
    power: 10,
    moves: [
      ['Guarded Tap', 'basic', 'damage', 9, direct, direct, direct, 0],
      ['Stalwart Swing', 'grit', 'damage', 19, direct, direct, direct, 2],
      ['Quiet Counter', 'spirit', 'damage', 15, direct, direct, direct, 2],
      ['Patch Up', 'grit', 'heal', 12, direct, direct, direct, 2],
    ],
  },
  {
    id: '84790040-6ea8-6155-c4b7-dec3a22ac3ab',
    name: 'Wit Creature 1',
    affinity: 'wit',
    rarity: 'common',
    hp: 98,
    power: 11,
    moves: [
      ['Quick Retort', 'basic', 'damage', 9, direct, direct, direct, 0],
      ['Logic Lash', 'wit', 'damage', 18, direct, direct, direct, 2],
      ['Lateral Step', 'spirit', 'damage', 14, direct, direct, direct, 2],
      ['Power Leak', 'wit', 'debuff', 2, power, add, null, 2],
    ],
  },
  {
    id: '47f04de3-98d9-79ad-2759-7409c499c5ec',
    name: 'Wit Creature 2',
    affinity: 'wit',
    rarity: 'common',
    hp: 94,
    power: 12,
    moves: [
      ['Testing Tap', 'basic', 'damage', 8, direct, direct, direct, 0],
      ['Sharp Thesis', 'wit', 'damage', 20, direct, direct, direct, 2],
      ['Borrowed Resolve', 'spirit', 'damage', 15, direct, direct, direct, 2],
      [
        'Spark of Improvisation',
        'spark',
        'damage',
        15,
        direct,
        direct,
        direct,
        2,
      ],
    ],
  },
  {
    id: 'cdd5284b-0aaf-5c50-f820-787a7f6b1506',
    name: 'Wit Creature 3',
    affinity: 'wit',
    rarity: 'common',
    hp: 103,
    power: 10,
    moves: [
      ['Fast Read', 'basic', 'damage', 8, direct, direct, direct, 0],
      ['Checkmate Line', 'wit', 'damage', 25, direct, direct, direct, 3],
      ['Reframe', 'spirit', 'damage', 15, direct, direct, direct, 2],
      ['Misdirect', 'wit', 'debuff', 15, damageMultiplier, multiply, 2, 2],
    ],
  },
  {
    id: 'a230fdda-cec0-c127-b4a2-e4dd20660e3a',
    name: 'Spirit Creature 1',
    affinity: 'spirit',
    rarity: 'common',
    hp: 102,
    power: 10,
    moves: [
      ['Grounding Tap', 'basic', 'damage', 9, direct, direct, direct, 0],
      ['Heartbeat Wave', 'spirit', 'damage', 18, direct, direct, direct, 2],
      ['Steady Hand', 'wit', 'damage', 15, direct, direct, direct, 2],
      ['Mend', 'spirit', 'heal', 14, direct, direct, direct, 2],
    ],
  },
  {
    id: '6e6b2c9f-27b2-2145-3b8a-219a0df622d7',
    name: 'Spirit Creature 2',
    affinity: 'spirit',
    rarity: 'common',
    hp: 94,
    power: 12,
    moves: [
      ['Gentle Tap', 'basic', 'damage', 8, direct, direct, direct, 0],
      ['Rallying Pulse', 'spirit', 'damage', 20, direct, direct, direct, 2],
      ['Rooted Reply', 'wit', 'damage', 16, direct, direct, direct, 2],
      ['Deep Breath', 'spirit', 'heal', 18, direct, direct, direct, 3],
    ],
  },
  {
    id: '6f962f85-eaee-fd27-b2d7-c00c8af95098',
    name: 'Spirit Creature 3',
    affinity: 'spirit',
    rarity: 'common',
    hp: 110,
    power: 9,
    moves: [
      ['Centering Blow', 'basic', 'damage', 10, direct, direct, direct, 0],
      ['Enduring Chorus', 'spirit', 'damage', 20, direct, direct, direct, 2],
      ['Insightful Reply', 'wit', 'damage', 15, direct, direct, direct, 2],
      [
        'Calming Field',
        'spirit',
        'debuff',
        10,
        damageMultiplier,
        multiply,
        3,
        2,
      ],
    ],
  },
  {
    id: '0cba869b-d777-11f8-6b8c-c47d4d626558',
    name: 'Mystic Creature 1',
    affinity: 'mystic',
    rarity: 'common',
    hp: 98,
    power: 11,
    moves: [
      ['Plain Sigil', 'basic', 'damage', 9, direct, direct, direct, 0],
      ['Arcane Thread', 'mystic', 'damage', 18, direct, direct, direct, 2],
      ['Stone Rune', 'grit', 'damage', 15, direct, direct, direct, 2],
      ['Focus Lens', 'mystic', 'buff', 10, damageMultiplier, multiply, 3, 1],
    ],
  },
  {
    id: '5340e0ee-d31c-93f5-0d59-39d0cd977f15',
    name: 'Mystic Creature 2',
    affinity: 'mystic',
    rarity: 'common',
    hp: 90,
    power: 13,
    moves: [
      ['Simple Mark', 'basic', 'damage', 8, direct, direct, direct, 0],
      ['Convergence', 'mystic', 'damage', 28, direct, direct, direct, 3],
      ['Iron Glyph', 'grit', 'damage', 17, direct, direct, direct, 2],
      ['Attune', 'mystic', 'buff', 15, damageMultiplier, multiply, 2, 2],
    ],
  },
  {
    id: 'a30d8e2e-42bf-574a-aa6f-1ebdf33c86b6',
    name: 'Mystic Creature 3',
    affinity: 'mystic',
    rarity: 'common',
    hp: 106,
    power: 10,
    moves: [
      ['Whispering Rune', 'basic', 'damage', 8, direct, direct, direct, 0],
      ['Deep Pattern', 'mystic', 'damage', 21, direct, direct, direct, 2],
      ['Grounded Equation', 'grit', 'damage', 15, direct, direct, direct, 2],
      [
        'Long Vision',
        'mystic',
        'buff',
        10,
        damageMultiplier,
        multiply,
        null,
        2,
      ],
    ],
  },
];

export const canonicalPowerCards: readonly ExpectedPowerCard[] = [
  {
    id: '0d28241f-a4f2-2cf3-52bc-dee1633b3316',
    name: 'Spark Power 1',
    affinity: 'spark',
    rarity: 'common',
    effects: [['damage', 20, direct, direct, direct]],
  },
  {
    id: 'b7485793-8432-2db9-5f99-974164efa788',
    name: 'Spark Power 2',
    affinity: 'spark',
    rarity: 'common',
    effects: [
      ['damage', 12, direct, direct, direct],
      ['buff', 10, damageMultiplier, multiply, 2],
    ],
  },
  {
    id: '49e45cbb-f419-bf5c-2868-757646cb8dc9',
    name: 'Grit Power 1',
    affinity: 'grit',
    rarity: 'common',
    effects: [
      ['heal', 8, direct, direct, direct],
      ['debuff', 10, damageMultiplier, multiply, 2],
    ],
  },
  {
    id: '17150f89-427c-6bd8-5551-fbaf59b99808',
    name: 'Grit Power 2',
    affinity: 'grit',
    rarity: 'common',
    effects: [
      ['damage', 14, direct, direct, direct],
      ['heal', 6, direct, direct, direct],
    ],
  },
  {
    id: 'a2405856-34a7-f0a8-d1f6-ed0f161ecdab',
    name: 'Wit Power 1',
    affinity: 'wit',
    rarity: 'common',
    effects: [
      ['debuff', 3, power, add, null],
      ['damage', 10, direct, direct, direct],
    ],
  },
  {
    id: 'b862854d-9bc1-2e2e-31f2-c3b31fefcaed',
    name: 'Wit Power 2',
    affinity: 'wit',
    rarity: 'common',
    effects: [
      ['heal', 10, direct, direct, direct],
      ['buff', 10, damageMultiplier, multiply, 2],
    ],
  },
  {
    id: 'c1db21b9-944e-f9d6-fa2c-7d14702f41d4',
    name: 'Spirit Power 1',
    affinity: 'spirit',
    rarity: 'common',
    effects: [['heal', 20, direct, direct, direct]],
  },
  {
    id: '1f991679-3269-163f-4e74-b75a738a2bee',
    name: 'Spirit Power 2',
    affinity: 'spirit',
    rarity: 'common',
    effects: [
      ['heal', 10, direct, direct, direct],
      ['buff', 3, power, add, null],
    ],
  },
  {
    id: '76f057c6-efab-38d9-9bcf-298d5c794f1a',
    name: 'Mystic Power 1',
    affinity: 'mystic',
    rarity: 'common',
    effects: [
      ['buff', 10, damageMultiplier, multiply, 2],
      ['damage', 12, direct, direct, direct],
    ],
  },
  {
    id: '4e7b34e3-4f31-33c1-5da5-000570b3d4f3',
    name: 'Mystic Power 2',
    affinity: 'mystic',
    rarity: 'common',
    effects: [
      ['heal', 10, direct, direct, direct],
      ['buff', 10, damageMultiplier, multiply, null],
    ],
  },
  {
    id: '25621c1c-0722-303d-928b-4ed6e015dbd0',
    name: 'Spark Rare Power',
    affinity: 'spark',
    rarity: 'rare',
    effects: [
      ['damage', 16, direct, direct, direct],
      ['debuff', 2, power, add, null],
    ],
  },
  {
    id: '7f72be51-3370-8dbf-e96c-963ef4b5f29b',
    name: 'Spark Epic Power',
    affinity: 'spark',
    rarity: 'epic',
    effects: [
      ['buff', 15, damageMultiplier, multiply, 3],
      ['damage', 16, direct, direct, direct],
    ],
  },
  {
    id: '5f476b3a-7fc9-e5eb-b552-716dd5cbf5dc',
    name: 'Spark Legendary Power',
    affinity: 'spark',
    rarity: 'legendary',
    effects: [
      ['buff', 15, damageMultiplier, multiply, 2],
      ['damage', 18, direct, direct, direct],
      ['debuff', 10, damageMultiplier, multiply, 2],
    ],
  },
];

export const canonicalCardIds = [
  ...canonicalCreatures.map((card) => card.id),
  ...canonicalPowerCards.map((card) => card.id),
].sort();

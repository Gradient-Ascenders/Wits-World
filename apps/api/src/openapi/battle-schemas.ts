export const apiErrorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title', 'status', 'code', 'detail', 'requestId'],
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    code: { type: 'string' },
    detail: { type: 'string' },
    requestId: { type: 'string' },
  },
} as const;

export const publicEffectSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['damageMultiplier', 'effectType', 'effectValue', 'modifier'],
  properties: {
    damageMultiplier: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    effectType: { enum: ['buff', 'damage', 'debuff', 'heal'] },
    effectValue: {
      anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
    },
    modifier: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['stat', 'operation'],
          properties: {
            stat: { enum: ['hp', 'power', 'damage_multiplier'] },
            operation: { enum: ['add', 'multiply'] },
            durationTurns: {
              anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
            },
          },
        },
        { type: 'null' },
      ],
    },
  },
} as const;

export const publicPowerCardSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'affinity', 'effects', 'available'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    affinity: {
      anyOf: [
        { enum: ['wit', 'grit', 'spark', 'spirit', 'mystic'] },
        { type: 'null' },
      ],
    },
    effects: { type: 'array', items: publicEffectSchema },
    available: { type: 'boolean' },
  },
} as const;

export const publicCreatureSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'name',
    'affinity',
    'maxHp',
    'maxPower',
    'currentHp',
    'remainingPower',
    'defeated',
    'moves',
    'activeModifiers',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    affinity: { enum: ['wit', 'grit', 'spark', 'spirit', 'mystic'] },
    maxHp: { type: 'integer', minimum: 1 },
    maxPower: { type: 'integer', minimum: 0 },
    currentHp: { type: 'integer', minimum: 0 },
    remainingPower: { type: 'integer', minimum: 0 },
    defeated: { type: 'boolean' },
    moves: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'moveType', 'powerCost', 'effects'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          moveType: {
            enum: ['basic', 'wit', 'grit', 'spark', 'spirit', 'mystic'],
          },
          powerCost: { type: 'integer', minimum: 0 },
          effects: { type: 'array', items: publicEffectSchema },
        },
      },
    },
    activeModifiers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'stat',
          'operation',
          'value',
          'percentage',
          'remainingTurns',
          'remainingCharges',
        ],
        properties: {
          stat: {
            enum: [
              'hp',
              'power',
              'damage_multiplier',
              'incoming_damage_multiplier',
              'poison',
              'stun',
              'dodge',
              'reflect',
              'lifesteal',
            ],
          },
          operation: { enum: ['add', 'multiply'] },
          value: { type: 'number', minimum: 0 },
          percentage: {
            anyOf: [{ type: 'integer' }, { type: 'null' }],
          },
          remainingTurns: {
            anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
          },
          remainingCharges: {
            anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
          },
        },
      },
    },
  },
} as const;

export const pvpActionSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'creatureId'],
      properties: {
        type: { const: 'select_replacement' },
        creatureId: { type: 'string', format: 'uuid' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'moveId'],
      properties: {
        type: { const: 'use_move' },
        moveId: { type: 'string', format: 'uuid' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'powerCardId'],
      properties: {
        type: { const: 'use_power_card' },
        powerCardId: { type: 'string', format: 'uuid' },
      },
    },
  ],
} as const;

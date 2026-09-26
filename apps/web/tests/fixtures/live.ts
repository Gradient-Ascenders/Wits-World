import { buildCreature, uuid } from './matches';

export const LIVE_MATCH_ID = uuid(6000);
export const LIVE_MOVE_ID = buildCreature(1).moves[0]!.id;
export const LIVE_SERVER_TIME = '2026-09-25T12:00:00.000Z';
export const TERRITORY_ZONE_ID = uuid(6400);

export function participantProjection(overrides: Record<string, unknown> = {}) {
  const selfCreature = buildCreature(1);
  const opponentCreature = buildCreature(2, { affinity: 'grit' });
  return {
    matchId: LIVE_MATCH_ID,
    mode: 'live',
    role: 'participant',
    status: 'active',
    version: 4,
    phase: 'active',
    turnNumber: 2,
    currentActor: 'self',
    turnDeadline: '2026-09-25T12:01:00.000Z',
    consecutiveTimeouts: { self: 0, opponent: 1 },
    selfSide: 'playerOne',
    self: {
      playerName: 'CampusFox',
      creatures: [selfCreature, buildCreature(3), buildCreature(4)],
      powerCards: [],
      usedPowerCardIds: [],
      activeCreatureId: selfCreature.id,
    },
    opponent: {
      playerName: 'BraamBear',
      activeCreature: opponentCreature,
      defeatedCreatures: [],
      remainingCreatureCount: 3,
      playedPowerCards: [],
      remainingPowerCardCount: 2,
    },
    legalActions: [{ type: 'use_move', moveId: selfCreature.moves[0]!.id }],
    history: [
      {
        type: 'participant_action',
        side: 'playerTwo',
        action: { type: 'use_move', moveId: opponentCreature.moves[0]!.id },
        defeatedCreatureId: null,
        winner: null,
        turnEnded: true,
        effects: [],
      },
    ],
    lastAction: {
      type: 'participant_action',
      side: 'playerTwo',
      action: { type: 'use_move', moveId: opponentCreature.moves[0]!.id },
      defeatedCreatureId: null,
      winner: null,
      turnEnded: true,
      effects: [],
    },
    outcome: null,
    completionReason: null,
    startedAt: '2026-09-25T11:59:00.000Z',
    updatedAt: LIVE_SERVER_TIME,
    completedAt: null,
    ...overrides,
  };
}

export function spectatorProjection(overrides: Record<string, unknown> = {}) {
  return {
    matchId: LIVE_MATCH_ID,
    mode: 'live',
    role: 'spectator',
    status: 'active',
    version: 4,
    phase: 'active',
    turnNumber: 2,
    currentActor: 'playerOne',
    turnDeadline: '2026-09-25T12:01:00.000Z',
    consecutiveTimeouts: { playerOne: 0, playerTwo: 1 },
    playerOne: publicOpponent('CampusFox', buildCreature(1)),
    playerTwo: publicOpponent(
      'BraamBear',
      buildCreature(2, { affinity: 'grit' }),
    ),
    history: [],
    presence: {
      playerOneConnected: true,
      playerTwoConnected: true,
      spectatorCount: 2,
    },
    completionReason: null,
    winner: null,
    startedAt: '2026-09-25T11:59:00.000Z',
    updatedAt: LIVE_SERVER_TIME,
    completedAt: null,
    ...overrides,
  };
}

export function projectionResponse(
  projection: Record<string, unknown>,
  status = 200,
) {
  return jsonResponse(
    {
      ...projection,
      requestId: 'request-live-1',
      serverTime: LIVE_SERVER_TIME,
    },
    status,
  );
}

export function ticketResponse(role: 'participant' | 'spectator') {
  return jsonResponse(
    {
      ticket: 'opaque-ticket-value-with-enough-random-characters',
      role,
      protocolVersion: 1,
      expiresAt: '2026-09-25T12:01:00.000Z',
      webSocketUrl: 'wss://api.example.test/api/v1/realtime/live',
      requestId: 'request-ticket-1',
    },
    201,
  );
}

export function queueState(overrides: Record<string, unknown> = {}) {
  return {
    status: 'idle',
    queueEntryId: null,
    seasonId: uuid(6100),
    joinedAt: null,
    leaseExpiresAt: null,
    searchRange: null,
    proposalId: null,
    acceptanceDeadline: null,
    accepted: false,
    matchId: null,
    ...overrides,
  };
}

export function rankedSeason(overrides: Record<string, unknown> = {}) {
  return {
    seasonId: uuid(6100),
    name: 'Braamfontein Test Season',
    status: 'active',
    policyVersion: 'ranked-v1',
    activatedAt: '2026-09-25T11:00:00.000Z',
    activeEndsAt: '2026-10-23T11:00:00.000Z',
    closedAt: null,
    ...overrides,
  };
}

export function rankedProfile(overrides: Record<string, unknown> = {}) {
  return {
    season: rankedSeason(),
    rating: 1_248,
    wins: 7,
    losses: 3,
    settledMatchCount: 10,
    placementMatchesRemaining: 0,
    provisional: false,
    ...overrides,
  };
}

export function rankedStandings(overrides: Record<string, unknown> = {}) {
  return {
    season: rankedSeason(),
    entries: [
      {
        playerName: 'CampusFox',
        rank: 1,
        rating: 1_248,
        wins: 7,
        losses: 3,
        settledMatchCount: 10,
      },
      {
        playerName: 'BraamBear',
        rank: 2,
        rating: 1_221,
        wins: 6,
        losses: 4,
        settledMatchCount: 10,
      },
    ],
    nextCursor: null,
    ...overrides,
  };
}

export function rankedSettlement(overrides: Record<string, unknown> = {}) {
  return {
    matchId: LIVE_MATCH_ID,
    seasonId: uuid(6100),
    status: 'settled',
    completionReason: 'abandonment_forfeit',
    outcome: 'win',
    ratingBefore: 1_224,
    ratingAfter: 1_248,
    appliedDelta: 24,
    settledAt: '2026-09-25T12:01:01.000Z',
    territory: {
      zoneId: TERRITORY_ZONE_ID,
      zoneName: 'Library Lawns',
      outcome: 'accepted',
      influencePoints: 30,
      exclusionReason: null,
    },
    ...overrides,
  };
}

export function territoryZones() {
  return [
    {
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [28.0295, -26.1925],
            [28.0305, -26.1925],
            [28.0305, -26.1915],
            [28.0295, -26.1915],
            [28.0295, -26.1925],
          ],
        ],
      },
      name: 'Library Lawns',
      owner: { playerName: 'CampusFox' },
      seasonId: uuid(6100),
      status: 'active',
      windowEnd: '2026-09-25T13:00:00.000Z',
      windowStart: '2026-09-25T12:00:00.000Z',
      zoneId: TERRITORY_ZONE_ID,
    },
  ];
}

export function readyMessage(projection: Record<string, unknown>) {
  return {
    protocolVersion: 1,
    type: 'connection.ready',
    connectionId: uuid(6200),
    role: projection.role,
    serverTime: LIVE_SERVER_TIME,
    version: projection.version,
    match: projection,
  };
}

export function transitionMessage(
  projection: Record<string, unknown>,
  previousVersion: number,
) {
  return {
    protocolVersion: 1,
    type: 'match.transition',
    eventId: uuid(6300 + Number(projection.version ?? 0)),
    previousVersion,
    version: projection.version,
    serverTime: '2026-09-25T12:00:05.000Z',
    match: projection,
  };
}

function publicOpponent(playerName: string, activeCreature: unknown) {
  return {
    playerName,
    activeCreature,
    defeatedCreatures: [],
    remainingCreatureCount: 3,
    playedPowerCards: [],
    remainingPowerCardCount: 2,
  };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

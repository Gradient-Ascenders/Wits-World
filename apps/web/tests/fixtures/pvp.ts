import type {
  AsyncPvpMatch,
  PvpHistorySummary,
  PvpInvitation,
  PvpMatchSummary,
} from '../../src/api/pvp';
import { activeMatch, uuid } from './matches';

export const PVP_MATCH_ID = uuid(2100);
export const INVITATION_ID = uuid(2101);

export function pvpInvitation(
  overrides: Partial<PvpInvitation> = {},
): PvpInvitation {
  const direction = overrides.direction ?? 'incoming';
  const status = overrides.status ?? 'pending';
  return {
    canCancel:
      overrides.canCancel ?? (direction === 'outgoing' && status === 'pending'),
    createdAt: '2026-09-05T08:00:00.000Z',
    direction,
    expiresAt: '2026-09-06T08:00:00.000Z',
    invitationId: INVITATION_ID,
    matchId: null,
    opponent: { playerName: 'wits_wanderer' },
    respondedAt: null,
    status,
    version: 0,
    ...overrides,
  };
}

export function pvpMatch(
  overrides: Partial<Omit<AsyncPvpMatch, 'state'>> & {
    state?: Partial<AsyncPvpMatch['state']>;
  } = {},
): AsyncPvpMatch {
  const cpu = activeMatch(3);
  const status = overrides.status ?? 'active';
  const completed = status === 'completed';
  const baseState: AsyncPvpMatch['state'] = {
    opponent: {
      activeCreature: cpu.state.cpu.activeCreature,
      defeatedCreatures: [],
      playedPowerCards: [],
      playerName: 'wits_wanderer',
      remainingCreatureCount: 2,
      remainingPowerCardCount: 2,
    },
    phase: completed ? 'completed' : 'active',
    self: {
      activeCreatureId: cpu.state.player.activeCreatureId,
      creatures: cpu.state.player.creatures,
      playerName: 'campus_scholar',
      powerCards: cpu.state.player.powerCards,
      usedPowerCardIds: [],
    },
    turnNumber: 3,
    ...overrides.state,
  };
  return {
    canResign: !completed,
    completedAt: completed ? '2026-09-05T09:30:00.000Z' : null,
    completionReason: completed ? 'defeat' : null,
    currentActor: completed ? null : 'self',
    lastAction: null,
    legalActions: completed
      ? []
      : [
          {
            moveId: cpu.state.player.creatures[0]!.moves[0]!.id,
            type: 'use_move',
          },
          {
            powerCardId: cpu.state.player.powerCards[0]!.id,
            type: 'use_power_card',
          },
        ],
    matchId: PVP_MATCH_ID,
    mode: 'asynchronous',
    opponent: { playerName: 'wits_wanderer' },
    outcome: completed ? 'win' : null,
    startedAt: '2026-09-05T08:30:00.000Z',
    status,
    turnDeadline: completed ? null : '2026-09-06T08:30:00.000Z',
    updatedAt: '2026-09-05T08:30:00.000Z',
    version: 3,
    ...overrides,
    state: baseState,
  };
}

export function activePvpSummary(match = pvpMatch()): PvpMatchSummary {
  return {
    currentActor: match.currentActor as 'opponent' | 'self',
    matchId: match.matchId,
    mode: 'asynchronous',
    opponent: match.opponent,
    status: 'active',
    turnDeadline: match.turnDeadline!,
    updatedAt: match.updatedAt,
    version: match.version,
  };
}

export function pvpHistorySummary(
  match = pvpMatch({ status: 'completed' }),
): PvpHistorySummary {
  return {
    completedAt: match.completedAt!,
    completionReason: match.completionReason!,
    matchId: match.matchId,
    mode: 'asynchronous',
    opponent: match.opponent,
    outcome: match.outcome!,
    startedAt: match.startedAt,
    status: 'completed',
  };
}

export function pvpMatchResponse(match: AsyncPvpMatch, status = 200) {
  return jsonResponse(
    { ...match, requestId: `pvp-match-${match.version}` },
    status,
  );
}

export function invitationResponse(invitation: PvpInvitation, status = 200) {
  return jsonResponse(
    { invitation, requestId: `pvp-invitation-${invitation.version}` },
    status,
  );
}

export function invitationListResponse(
  invitations: PvpInvitation[],
  nextCursor: string | null = null,
) {
  return jsonResponse({
    invitations,
    nextCursor,
    requestId: 'pvp-invitations',
  });
}

export function activePvpListResponse(
  matches: PvpMatchSummary[],
  nextCursor: string | null = null,
) {
  return jsonResponse({ matches, nextCursor, requestId: 'pvp-active' });
}

export function pvpHistoryResponse(
  matches: PvpHistorySummary[],
  nextCursor: string | null = null,
) {
  return jsonResponse({ matches, nextCursor, requestId: 'pvp-history' });
}

export function playerLookupResponse(playerName = 'wits_wanderer') {
  return jsonResponse({ playerName, requestId: 'pvp-player' });
}

export function pvpProblemResponse(code: string, status: number) {
  return jsonResponse(
    {
      code,
      detail: 'Safe PvP problem detail.',
      requestId: `problem-${code}`,
      status,
      title: 'PvP request failed',
      type: 'about:blank',
    },
    status,
  );
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

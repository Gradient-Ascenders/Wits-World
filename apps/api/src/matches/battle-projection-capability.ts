import type { FastifyRequest } from 'fastify';

import type {
  AsyncPvpMatchView,
  PvpActionHistoryEntryView,
} from './asynchronous-pvp-service.js';
import type { CpuMatchHistory, CpuMatchResponse } from './cpu-match-service.js';
import type { LivePvpProjection } from './live-pvp-service.js';

export const CPU_SWAP_MEDIA_TYPE = 'application/vnd.wits-world.cpu.v2+json';
export const PVP_SWAP_MEDIA_TYPE = 'application/vnd.wits-world.pvp.v5+json';
export const LIVE_SWAP_MEDIA_TYPE = 'application/vnd.wits-world.live.v2+json';

export function acceptsBattleSwaps(
  request: FastifyRequest,
  mediaType: string,
): boolean {
  return (
    request.headers.accept
      ?.split(',')
      .some(
        (range) => range.trim().split(';', 1)[0]?.toLowerCase() === mediaType,
      ) ?? false
  );
}

export function cpuMatchForClient(
  match: CpuMatchResponse,
  acceptsSwaps: boolean,
): CpuMatchResponse {
  if (acceptsSwaps) return match;
  return {
    ...match,
    state: {
      ...match.state,
      legalActions: match.state.legalActions.filter(
        (action) => action.type !== 'swap_creature',
      ),
    },
    lastAction: isSwapResult(match.lastAction) ? null : match.lastAction,
    battleLog: match.battleLog.map((group) => ({
      ...group,
      events: group.events.map(({ id, sequence, side, kind, message }) => ({
        id,
        sequence,
        side,
        kind,
        message,
      })),
    })),
  };
}

export function cpuHistoryForClient(
  matches: readonly CpuMatchHistory[],
  acceptsSwaps: boolean,
): readonly CpuMatchHistory[] {
  if (acceptsSwaps) return matches;
  return matches.map((match) => ({
    ...match,
    rounds: match.rounds.map((round) => ({
      ...round,
      actions: round.actions.filter(
        (entry) => entry.action.type !== 'swap_creature',
      ),
      result: round.result.filter((result) => !isSwapResult(result)),
    })),
  }));
}

export function asyncPvpMatchForClient(
  match: AsyncPvpMatchView,
  acceptsSwaps: boolean,
): AsyncPvpMatchView {
  if (acceptsSwaps) return match;
  return {
    ...match,
    legalActions: match.legalActions.filter(
      (action) => action.type !== 'swap_creature',
    ),
    history: match.history.filter(
      (entry: PvpActionHistoryEntryView) => !isSwapResult(entry.result),
    ),
    lastAction: isSwapResult(match.lastAction) ? null : match.lastAction,
  };
}

export function livePvpMatchForClient(
  match: LivePvpProjection,
  acceptsSwaps: boolean,
): LivePvpProjection {
  if (acceptsSwaps) return match;
  const history = match.history.map(redactLiveSwapAction);
  if (match.role === 'spectator') return { ...match, history };
  return {
    ...match,
    legalActions: match.legalActions.filter(
      (action) => action.type !== 'swap_creature',
    ),
    history,
    lastAction: redactLiveSwapAction(match.lastAction),
  };
}

function redactLiveSwapAction(value: unknown): unknown {
  if (!isSwapResult(value)) return value;
  return { ...(value as Record<string, unknown>), action: null };
}

function isSwapResult(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const action = (value as { action?: unknown }).action;
  return (
    typeof action === 'object' &&
    action !== null &&
    (action as { type?: unknown }).type === 'swap_creature'
  );
}

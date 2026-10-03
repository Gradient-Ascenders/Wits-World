import { createAppDateTimeFormatter } from '../../date-time';
import { Link } from 'wouter';
import type { MouseEvent } from 'react';

import type { CpuMatchHistoryItem } from '../../api/matches';
import type { PvpHistorySummary } from '../../api/pvp';

export type BattleHistoryItem =
  | { kind: 'cpu'; match: CpuMatchHistoryItem }
  | { kind: 'player'; match: PvpHistorySummary };

export function mergeBattleHistory(
  cpuMatches: CpuMatchHistoryItem[],
  playerMatches: PvpHistorySummary[],
) {
  return [
    ...cpuMatches.map((match): BattleHistoryItem => ({ kind: 'cpu', match })),
    ...playerMatches.map((match): BattleHistoryItem => ({
      kind: 'player',
      match,
    })),
  ].sort(
    (left, right) =>
      new Date(right.match.completedAt).getTime() -
      new Date(left.match.completedAt).getTime(),
  );
}

export function BattleHistoryList({
  battles,
  label,
  headingLevel = 2,
  onViewBattle,
}: {
  battles: BattleHistoryItem[];
  label: string;
  headingLevel?: 2 | 3;
  onViewBattle?: (
    matchId: string,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void;
}) {
  return (
    <div className="battle-history">
      <div aria-hidden="true" className="battle-history__columns">
        <span>Opponent</span>
        <span>Result</span>
        <span>Completed</span>
      </div>
      <ol aria-label={label} className="battle-history__list">
        {battles.map((battle) => (
          <li key={`${battle.kind}-${battle.match.matchId}`}>
            <BattleResultSummary
              battle={battle}
              headingLevel={headingLevel}
              onViewBattle={onViewBattle}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function BattleResultSummary({
  battle,
  headingLevel,
  onViewBattle,
}: {
  battle: BattleHistoryItem;
  headingLevel: 2 | 3;
  onViewBattle?: (
    matchId: string,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void;
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const { match } = battle;
  const playerWon =
    battle.kind === 'cpu'
      ? battle.match.winner === 'player'
      : battle.match.outcome === 'win';
  const opponent =
    battle.kind === 'cpu' ? 'CPU' : battle.match.opponent.playerName;
  const detail =
    battle.kind === 'cpu'
      ? `${battle.match.rounds.length} ${battle.match.rounds.length === 1 ? 'round' : 'rounds'}`
      : completionReasonLabel(
          battle.match.completionReason,
          battle.match.outcome,
        );
  const href =
    battle.kind === 'cpu'
      ? `/matches/${match.matchId}`
      : `/matches/pvp/${match.matchId}`;
  const headingId = `battle-history-${battle.kind}-${match.matchId}`;

  return (
    <article aria-labelledby={headingId}>
      <Link
        aria-label="View battle"
        aria-describedby={`${headingId} ${headingId}-result ${headingId}-completed`}
        className="battle-history__row"
        href={href}
        onClick={(event) => onViewBattle?.(match.matchId, event)}
      >
        <div className="battle-history__opponent">
          <Heading id={headingId}>{opponent}</Heading>
          {detail ? <p>{detail}</p> : null}
        </div>
        <strong
          id={`${headingId}-result`}
          className={`battle-history__result battle-history__result--${playerWon ? 'won' : 'lost'}`}
        >
          {playerWon ? 'Won' : 'Lost'}
        </strong>
        <time
          id={`${headingId}-completed`}
          className="battle-history__completed"
          dateTime={match.completedAt}
        >
          <span className="sr-only">Completed </span>
          {formatMatchDate(match.completedAt)}
        </time>
        <span className="battle-history__action">View battle</span>
      </Link>
    </article>
  );
}

function completionReasonLabel(
  reason: PvpHistorySummary['completionReason'],
  outcome: 'loss' | 'win',
) {
  if (reason === 'defeat') return null;
  if (reason === 'account_deletion_forfeit')
    return outcome === 'win'
      ? 'Opponent became unavailable'
      : 'Account became unavailable';
  if (reason === 'voluntary_resignation')
    return outcome === 'win' ? 'Opponent forfeited' : 'You forfeited';
  return outcome === 'win'
    ? 'Opponent turn deadline expired'
    : 'Your turn deadline expired';
}

export function formatMatchDate(value: string) {
  return createAppDateTimeFormatter(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

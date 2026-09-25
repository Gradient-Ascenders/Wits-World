import { Link } from 'wouter';

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

export function BattleResultSummary({
  battle,
  compact = false,
  headingLevel = 2,
}: {
  battle: BattleHistoryItem;
  compact?: boolean;
  headingLevel?: 2 | 3;
}) {
  if (battle.kind === 'cpu') {
    return (
      <CpuResultSummary
        compact={compact}
        headingLevel={headingLevel}
        match={battle.match}
      />
    );
  }

  return (
    <PlayerResultSummary
      compact={compact}
      headingLevel={headingLevel}
      match={battle.match}
    />
  );
}

export function MatchResultSummary({
  compact = false,
  headingLevel = 2,
  match,
}: {
  compact?: boolean;
  headingLevel?: 2 | 3;
  match: CpuMatchHistoryItem;
}) {
  return (
    <CpuResultSummary
      compact={compact}
      headingLevel={headingLevel}
      match={match}
    />
  );
}

function CpuResultSummary({
  compact,
  headingLevel,
  match,
}: {
  compact: boolean;
  headingLevel: 2 | 3;
  match: CpuMatchHistoryItem;
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const playerWon = match.winner === 'player';

  return (
    <article
      className={`match-result-summary match-result-summary--${playerWon ? 'victory' : 'defeat'}${compact ? ' match-result-summary--compact' : ''}`}
    >
      <div className="match-result-summary__heading">
        <div>
          <p className="match-result-summary__type">CPU battle</p>
          <Heading>{playerWon ? 'Victory' : 'CPU victory'}</Heading>
        </div>
        <span>{playerWon ? 'Won' : 'Lost'}</span>
      </div>
      <dl>
        <div>
          <dt>Completed</dt>
          <dd>
            <time dateTime={match.completedAt}>
              {formatMatchDate(match.completedAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt>Recorded rounds</dt>
          <dd>{match.rounds.length}</dd>
        </div>
      </dl>
      <Link className="button button--quiet" href={`/matches/${match.matchId}`}>
        {compact ? 'View battle' : 'View saved match'}
      </Link>
    </article>
  );
}

function PlayerResultSummary({
  compact,
  headingLevel,
  match,
}: {
  compact: boolean;
  headingLevel: 2 | 3;
  match: PvpHistorySummary;
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const playerWon = match.outcome === 'win';

  return (
    <article
      className={`match-result-summary match-result-summary--${playerWon ? 'victory' : 'defeat'}${compact ? ' match-result-summary--compact' : ''}`}
    >
      <div className="match-result-summary__heading">
        <div>
          <p className="match-result-summary__type">Player battle</p>
          <Heading>Against {match.opponent.playerName}</Heading>
        </div>
        <span>{playerWon ? 'Won' : 'Lost'}</span>
      </div>
      <dl>
        <div>
          <dt>Completed</dt>
          <dd>
            <time dateTime={match.completedAt}>
              {formatMatchDate(match.completedAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt>Result</dt>
          <dd>{playerResultLabel(match)}</dd>
        </div>
      </dl>
      <Link
        className="button button--quiet"
        href={`/matches/pvp/${match.matchId}`}
      >
        View battle
      </Link>
    </article>
  );
}

function playerResultLabel(match: PvpHistorySummary) {
  if (match.completionReason === 'account_deletion_forfeit') {
    return 'Opponent account no longer available';
  }
  if (match.completionReason === 'voluntary_resignation') {
    return match.outcome === 'win' ? 'Opponent conceded' : 'Battle conceded';
  }
  if (match.completionReason === 'turn_forfeit') {
    return match.outcome === 'win'
      ? 'Opponent missed the turn deadline'
      : 'Turn deadline missed';
  }
  return match.outcome === 'win' ? 'Opponent defeated' : 'Opponent won';
}

export function formatMatchDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

import { createAppDateTimeFormatter } from '../../date-time';
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

export function BattleResultColumns() {
  return (
    <div aria-hidden="true" className="battle-result-columns">
      <span>Opponent</span>
      <span>Result</span>
      <span>Completed</span>
      <span>Rounds</span>
      <span>Action</span>
    </div>
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
      <div className="match-result-summary__opponent">
        <span className="match-result-summary__label">Opponent</span>
        <Heading>CPU</Heading>
      </div>
      <div className="match-result-summary__field match-result-summary__result">
        <span className="match-result-summary__label">Result</span>
        <strong>{playerWon ? 'Won' : 'Lost'}</strong>
      </div>
      <div className="match-result-summary__field match-result-summary__completed">
        <span className="match-result-summary__label">Completed</span>
        <time dateTime={match.completedAt}>
          {formatMatchDate(match.completedAt)}
        </time>
      </div>
      <div className="match-result-summary__field match-result-summary__rounds">
        <span className="match-result-summary__label">Rounds</span>
        <strong>{match.rounds.length}</strong>
      </div>
      <Link className="button button--quiet" href={`/matches/${match.matchId}`}>
        View battle
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
      <div className="match-result-summary__opponent">
        <span className="match-result-summary__label">Opponent</span>
        <Heading>{match.opponent.playerName}</Heading>
      </div>
      <div className="match-result-summary__field match-result-summary__result">
        <span className="match-result-summary__label">Result</span>
        <strong>{playerWon ? 'Won' : 'Lost'}</strong>
      </div>
      <div className="match-result-summary__field match-result-summary__completed">
        <span className="match-result-summary__label">Completed</span>
        <time dateTime={match.completedAt}>
          {formatMatchDate(match.completedAt)}
        </time>
      </div>
      <div className="match-result-summary__field match-result-summary__rounds">
        <span className="match-result-summary__label">Rounds</span>
        <strong aria-label="Not available">—</strong>
      </div>
      <Link
        className="button button--quiet"
        href={`/matches/pvp/${match.matchId}`}
      >
        View battle
      </Link>
    </article>
  );
}

export function formatMatchDate(value: string) {
  return createAppDateTimeFormatter(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

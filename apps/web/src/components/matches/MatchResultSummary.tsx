import { Link } from 'wouter';

import type { CpuMatchHistoryItem } from '../../api/matches';

export function MatchResultSummary({
  compact = false,
  headingLevel = 2,
  match,
}: {
  compact?: boolean;
  headingLevel?: 2 | 3;
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
          {!compact ? <p className="eyebrow">CPU opponent</p> : null}
          <Heading>{playerWon ? 'Victory' : 'CPU victory'}</Heading>
        </div>
        <span>{playerWon ? 'Won' : 'Lost'}</span>
      </div>
      <dl>
        {!compact ? (
          <div>
            <dt>Result</dt>
            <dd>{playerWon ? 'Player won' : 'CPU won'}</dd>
          </div>
        ) : null}
        <div>
          <dt>Completed</dt>
          <dd>
            <time dateTime={match.completedAt}>
              {formatMatchDate(match.completedAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt>Submitted rounds</dt>
          <dd>{match.rounds.length}</dd>
        </div>
      </dl>
      <Link className="button button--quiet" href={`/matches/${match.matchId}`}>
        {compact ? 'View battle' : 'View saved match'}
      </Link>
    </article>
  );
}

export function formatMatchDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

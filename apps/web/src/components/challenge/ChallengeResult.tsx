import type { CompletedChallengeAttempt } from '../../api/challenges';
import type { Ref } from 'react';
import { Link } from 'wouter';

interface ChallengeResultProps {
  attempt: CompletedChallengeAttempt;
  headingRef?: Ref<HTMLHeadingElement>;
}

export function ChallengeResult({ attempt, headingRef }: ChallengeResultProps) {
  const { cards, coinsAwarded } = attempt.reward;

  return (
    <section
      aria-labelledby="challenge-result-title"
      className="challenge-result"
    >
      <p className="eyebrow">
        {attempt.completionReason === 'timeout'
          ? 'Time ended'
          : 'Challenge complete'}
      </p>
      <h1 id="challenge-result-title" ref={headingRef} tabIndex={-1}>
        Your challenge result
      </h1>
      <p className="challenge-result__score">
        <strong>{attempt.scoreCorrect}</strong> out of {attempt.totalQuestions}{' '}
        correct
      </p>
      <p>
        {attempt.completionReason === 'timeout'
          ? 'Time ran out, so unanswered questions were recorded as incomplete.'
          : 'All five answers were saved by Wits World.'}
      </p>

      <section
        aria-labelledby="challenge-reward-title"
        className="challenge-result__rewards"
      >
        <p className="eyebrow">Saved reward</p>
        <h2 id="challenge-reward-title">Your rewards are recorded</h2>
        <p>
          {coinsAwarded === 0
            ? 'No coins were awarded for this result.'
            : `${coinsAwarded} ${coinsAwarded === 1 ? 'coin was' : 'coins were'} added to your account.`}
        </p>

        {cards.length === 0 ? (
          <p>No new cards were awarded for this result.</p>
        ) : (
          <ul aria-label="Earned cards" className="challenge-result__cards">
            {cards.map((card) => (
              <li
                className={`challenge-card challenge-card--${card.rarity}`}
                key={card.ownedCardId}
              >
                <p className="eyebrow">{card.rarity}</p>
                <h3>{card.name}</h3>
                <p>
                  {card.category} · {card.affinity}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link className="button button--link" href="/explore">
        Return to explore
      </Link>
    </section>
  );
}

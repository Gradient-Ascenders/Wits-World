import type { CompletedChallengeAttempt } from '../../api/challenges';
import type { Ref } from 'react';
import { Link } from 'wouter';

interface ChallengeResultProps {
  attempt: CompletedChallengeAttempt;
  headingRef?: Ref<HTMLHeadingElement>;
}

export function ChallengeResult({ attempt, headingRef }: ChallengeResultProps) {
  const { cards } = attempt.reward;

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
                  {card.category} · {card.affinity ?? 'typeless'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="challenge-review-title"
        className="challenge-result__review"
      >
        <p className="eyebrow">Completed challenge</p>
        <h2 id="challenge-review-title">Review your answers</h2>
        <ol aria-label="Answer review" className="challenge-review">
          {attempt.format === 'ordering'
            ? attempt.review.map((question) => {
                const answerState =
                  question.selectedItems === null
                    ? 'Not answered'
                    : question.isCorrect
                      ? 'Correct'
                      : 'Incorrect';

                return (
                  <li
                    className={`challenge-review__item challenge-review__item--${
                      question.selectedItems === null
                        ? 'unanswered'
                        : question.isCorrect
                          ? 'correct'
                          : 'incorrect'
                    }`}
                    key={question.attemptQuestionId}
                  >
                    <div className="challenge-review__heading">
                      <h3>Question {question.position}</h3>
                      <p className="challenge-review__status">{answerState}</p>
                    </div>
                    <p className="challenge-review__prompt">
                      {question.prompt}
                    </p>
                    <dl className="challenge-review__answers">
                      <div>
                        <dt>Your order</dt>
                        <dd>
                          {question.selectedItems === null ? (
                            'Not answered'
                          ) : (
                            <ReviewOrder items={question.selectedItems} />
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Correct order</dt>
                        <dd>
                          <ReviewOrder items={question.correctItems} />
                        </dd>
                      </div>
                    </dl>
                    <div className="challenge-review__explanation">
                      <h4>Explanation</h4>
                      <p>{question.explanation}</p>
                    </div>
                  </li>
                );
              })
            : attempt.review.map((question) => {
                const answerState =
                  question.selectedChoice === null
                    ? 'Not answered'
                    : question.isCorrect
                      ? 'Correct'
                      : 'Incorrect';

                return (
                  <li
                    className={`challenge-review__item challenge-review__item--${
                      question.selectedChoice === null
                        ? 'unanswered'
                        : question.isCorrect
                          ? 'correct'
                          : 'incorrect'
                    }`}
                    key={question.attemptQuestionId}
                  >
                    <div className="challenge-review__heading">
                      <h3>Question {question.position}</h3>
                      <p className="challenge-review__status">{answerState}</p>
                    </div>
                    <p className="challenge-review__prompt">
                      {question.prompt}
                    </p>
                    <dl className="challenge-review__answers">
                      <div>
                        <dt>Your answer</dt>
                        <dd>
                          {question.selectedChoice?.text ?? 'Not answered'}
                        </dd>
                      </div>
                      <div>
                        <dt>Correct answer</dt>
                        <dd>{question.correctChoice.text}</dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
        </ol>
      </section>

      <Link className="button button--link" href="/explore">
        Return to explore
      </Link>
    </section>
  );
}

function ReviewOrder({
  items,
}: {
  items: readonly { itemId: string; text: string }[];
}) {
  return (
    <ol className="challenge-review__order">
      {items.map((item) => (
        <li key={item.itemId}>{item.text}</li>
      ))}
    </ol>
  );
}

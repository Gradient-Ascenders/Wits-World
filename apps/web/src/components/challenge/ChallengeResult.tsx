import type { CompletedChallengeAttempt } from '../../api/challenges';
import type { Ref } from 'react';
import { ChallengeRewards } from './ChallengeRewards';
import { Link } from 'wouter';

interface ChallengeResultProps {
  attempt: CompletedChallengeAttempt;
  apiBaseUrl: string;
  headingRef?: Ref<HTMLHeadingElement>;
}

export function ChallengeResult({
  attempt,
  headingRef,
  apiBaseUrl,
}: ChallengeResultProps) {
  const { cards } = attempt.reward;

  return (
    <section
      aria-labelledby="challenge-result-title"
      className="challenge-result"
    >
      <header className="challenge-result__hero">
        <div>
          <p className="eyebrow">
            {attempt.completionReason === 'timeout'
              ? 'Time ended'
              : 'Challenge complete'}
          </p>
          <h1 id="challenge-result-title" ref={headingRef} tabIndex={-1}>
            Your challenge result
          </h1>
          <p className="challenge-result__summary">
            {attempt.completionReason === 'timeout'
              ? 'Time ran out. Your saved answers count towards this result.'
              : 'Your answers are saved. See what you earned below.'}
          </p>
        </div>
        <p className="challenge-result__score">
          <strong>{attempt.scoreCorrect}</strong>
          <span>out of {attempt.totalQuestions} correct</span>
        </p>
      </header>
      <ChallengeRewards
        key={attempt.attemptId}
        cards={cards}
        apiBaseUrl={apiBaseUrl}
        attemptId={attempt.attemptId}
      />
      <nav
        className="challenge-result__actions"
        aria-label="Continue after challenge"
      >
        {cards.length > 0 && (
          <Link className="button" href="/collection">
            View collection
          </Link>
        )}
        <Link
          className={`button ${cards.length > 0 ? 'button--quiet' : ''}`}
          href="/explore"
        >
          Return to explore
        </Link>
      </nav>

      <section
        aria-labelledby="challenge-review-title"
        className="challenge-result__review"
      >
        <p className="eyebrow">Answer breakdown</p>
        <h2 id="challenge-review-title">Review your answers</h2>
        <p className="challenge-result__review-hint">
          Open a question to see your answer and the correct response.
        </p>
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
                    <details>
                      <summary className="challenge-review__heading">
                        <h3>Question {question.position}</h3>
                        <p className="challenge-review__status">
                          {answerState}
                        </p>
                      </summary>
                      <div className="challenge-review__body">
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
                      </div>
                    </details>
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
                    <details>
                      <summary className="challenge-review__heading">
                        <h3>Question {question.position}</h3>
                        <p className="challenge-review__status">
                          {answerState}
                        </p>
                      </summary>
                      <div className="challenge-review__body">
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
                      </div>
                    </details>
                  </li>
                );
              })}
        </ol>
      </section>
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

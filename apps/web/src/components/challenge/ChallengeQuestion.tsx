import type { ChallengeQuestion as ChallengeQuestionData } from '../../api/challenges';
import type { Ref } from 'react';

interface ChallengeQuestionProps {
  headingRef?: Ref<HTMLHeadingElement>;
  isSubmitting: boolean;
  onSelectChoice: (choiceId: string) => void;
  onSubmit: () => void;
  question: ChallengeQuestionData;
  selectedChoiceId: string | null;
  totalQuestions: number;
}

export function ChallengeQuestion({
  headingRef,
  isSubmitting,
  onSelectChoice,
  onSubmit,
  question,
  selectedChoiceId,
  totalQuestions,
}: ChallengeQuestionProps) {
  const questionId = `challenge-question-${question.attemptQuestionId}`;
  const instructionId = `${questionId}-instruction`;

  return (
    <section aria-labelledby={questionId} className="challenge-question">
      <p className="eyebrow">
        Question {question.position} of {totalQuestions}
      </p>
      <h2 id={questionId} ref={headingRef} tabIndex={-1}>
        {question.prompt}
      </h2>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <fieldset
          aria-labelledby={`${questionId} ${instructionId}`}
          disabled={isSubmitting}
        >
          <legend id={instructionId}>Choose one answer</legend>
          <div className="challenge-question__choices">
            {question.choices.map((choice) => (
              <label className="challenge-choice" key={choice.choiceId}>
                <input
                  checked={selectedChoiceId === choice.choiceId}
                  name={`question-${question.attemptQuestionId}`}
                  onChange={() => onSelectChoice(choice.choiceId)}
                  type="radio"
                  value={choice.choiceId}
                />
                <span>{choice.text}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          className="button challenge-question__submit"
          disabled={selectedChoiceId === null || isSubmitting}
          type="submit"
        >
          {isSubmitting ? 'Saving answer…' : 'Submit answer'}
        </button>
      </form>
    </section>
  );
}

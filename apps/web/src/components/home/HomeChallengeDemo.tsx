import {
  ArrowCounterClockwiseIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

interface DemoQuestion {
  choices: readonly { id: string; label: string }[];
  correctChoiceId: string;
  explanation: string;
  id: string;
  prompt: string;
}

const questions: readonly DemoQuestion[] = [
  {
    id: 'great-hall-campus',
    prompt: 'On which Wits campus is the Great Hall located?',
    explanation:
      "The Great Hall is on the University's Braamfontein East Campus.",
    correctChoiceId: 'east-campus',
    choices: [
      { id: 'west-campus', label: 'West Campus' },
      { id: 'east-campus', label: 'East Campus' },
      { id: 'parktown-campus', label: 'Parktown Campus' },
      { id: 'education-campus', label: 'Education Campus' },
    ],
  },
  {
    id: 'university-name',
    prompt: 'What does the name Wits stand for?',
    explanation:
      'Wits is the common short name for the University of the Witwatersrand.',
    correctChoiceId: 'witwatersrand',
    choices: [
      { id: 'witwatersrand', label: 'University of the Witwatersrand' },
      { id: 'western-tech', label: 'Western Institute of Technology' },
      { id: 'witbank-tech', label: 'Witbank Technical School' },
      { id: 'world-science', label: 'World Institute of Science' },
    ],
  },
  {
    id: 'great-hall-ceremonies',
    prompt: 'Which Wits building is used for major ceremonies and graduations?',
    explanation:
      'The Great Hall hosts major University ceremonies, including graduations.',
    correctChoiceId: 'great-hall',
    choices: [
      { id: 'great-hall', label: 'The Great Hall' },
      { id: 'planetarium', label: 'The Planetarium' },
      { id: 'origins-centre', label: 'The Origins Centre' },
      { id: 'art-museum', label: 'The Wits Art Museum' },
    ],
  },
  {
    id: 'east-campus-library',
    prompt: 'Which library is located on Wits East Campus?',
    explanation: 'Wartenweiler Library is located on Wits East Campus.',
    correctChoiceId: 'wartenweiler',
    choices: [
      { id: 'commerce', label: 'Commerce Library' },
      { id: 'wartenweiler', label: 'Wartenweiler Library' },
      { id: 'law', label: 'Law Library' },
      { id: 'architecture', label: 'Architecture Library' },
    ],
  },
  {
    id: 'wits-city',
    prompt: 'Which city is home to the University of the Witwatersrand?',
    explanation:
      'The University of the Witwatersrand is located in Johannesburg.',
    correctChoiceId: 'johannesburg',
    choices: [
      { id: 'pretoria', label: 'Pretoria' },
      { id: 'johannesburg', label: 'Johannesburg' },
      { id: 'cape-town', label: 'Cape Town' },
      { id: 'bloemfontein', label: 'Bloemfontein' },
    ],
  },
];

export function HomeChallengeDemo() {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [submittedChoiceId, setSubmittedChoiceId] = useState<string | null>(
    null,
  );
  const [correctAnswerCount, setCorrectAnswerCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const feedbackRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const hasInteracted = useRef(false);

  const question = questions[currentQuestionIndex]!;
  const isCorrect = submittedChoiceId === question.correctChoiceId;
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const answeredQuestionCount = isComplete
    ? questions.length
    : currentQuestionIndex + (submittedChoiceId === null ? 0 : 1);

  useEffect(() => {
    if (!hasInteracted.current) return;

    if (isComplete) {
      resultRef.current?.focus();
    } else if (submittedChoiceId !== null) {
      feedbackRef.current?.focus();
    } else {
      questionRef.current?.focus();
    }
  }, [currentQuestionIndex, isComplete, submittedChoiceId]);

  const submitAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedChoiceId === null) return;

    hasInteracted.current = true;
    if (selectedChoiceId === question.correctChoiceId) {
      setCorrectAnswerCount((count) => count + 1);
    }
    setSubmittedChoiceId(selectedChoiceId);
  };

  const continueQuiz = () => {
    if (isLastQuestion) {
      setIsComplete(true);
      return;
    }

    setCurrentQuestionIndex((index) => index + 1);
    setSelectedChoiceId(null);
    setSubmittedChoiceId(null);
  };

  const restartQuiz = () => {
    hasInteracted.current = true;
    setCurrentQuestionIndex(0);
    setSelectedChoiceId(null);
    setSubmittedChoiceId(null);
    setCorrectAnswerCount(0);
    setIsComplete(false);
  };

  return (
    <section
      aria-label="Untimed challenge demo"
      className={`home-challenge-demo${
        submittedChoiceId === null ? '' : ' has-result'
      }`}
    >
      <div
        aria-label="Demo quiz progress"
        aria-valuemax={questions.length}
        aria-valuemin={0}
        aria-valuenow={answeredQuestionCount}
        aria-valuetext={`${answeredQuestionCount} of ${questions.length} questions answered`}
        className="home-challenge-demo__progress"
        role="progressbar"
      >
        {questions.map((item, index) => (
          <span
            aria-hidden="true"
            className={`${index < answeredQuestionCount ? 'is-complete' : ''}${
              !isComplete && index === currentQuestionIndex ? ' is-current' : ''
            }`.trim()}
            key={item.id}
          />
        ))}
      </div>

      {isComplete ? (
        <div className="home-challenge-demo__result">
          <CheckCircleIcon aria-hidden="true" size={46} weight="fill" />
          <h4 ref={resultRef} tabIndex={-1}>
            Quiz complete
          </h4>
          <p>
            You answered <strong>{correctAnswerCount} of 5</strong> questions
            correctly.
          </p>
          <button
            className="button button--quiet home-challenge-demo__retry"
            onClick={restartQuiz}
            type="button"
          >
            <ArrowCounterClockwiseIcon
              aria-hidden="true"
              size={18}
              weight="bold"
            />
            Try all five again
          </button>
        </div>
      ) : submittedChoiceId === null ? (
        <form onSubmit={submitAnswer}>
          <p className="home-challenge-demo__question-meta">
            Question {currentQuestionIndex + 1} of {questions.length}
            <span aria-hidden="true">·</span>
            Untimed demo
          </p>
          <fieldset>
            <legend className="sr-only">
              Choose one answer for question {currentQuestionIndex + 1}
            </legend>
            <h4 ref={questionRef} tabIndex={-1}>
              {question.prompt}
            </h4>
            <div className="home-challenge-demo__choices">
              {question.choices.map((choice) => (
                <label key={choice.id}>
                  <input
                    checked={selectedChoiceId === choice.id}
                    name={`home-challenge-demo-${question.id}`}
                    onChange={() => setSelectedChoiceId(choice.id)}
                    type="radio"
                    value={choice.id}
                  />
                  <span>{choice.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            className="button home-challenge-demo__submit"
            disabled={selectedChoiceId === null}
            type="submit"
          >
            Check answer
          </button>
        </form>
      ) : (
        <div
          aria-live="polite"
          className={`home-challenge-demo__feedback home-challenge-demo__feedback--${
            isCorrect ? 'correct' : 'incorrect'
          }`}
          role="status"
        >
          <span aria-hidden="true" className="home-challenge-demo__result-icon">
            {isCorrect ? (
              <CheckCircleIcon size={42} weight="fill" />
            ) : (
              <XCircleIcon size={42} weight="fill" />
            )}
          </span>
          <div>
            <p className="home-challenge-demo__feedback-meta">
              Question {currentQuestionIndex + 1} of {questions.length}
            </p>
            <h4 ref={feedbackRef} tabIndex={-1}>
              {isCorrect ? 'That’s right.' : 'Not quite.'}
            </h4>
            <p>
              <strong>Explanation:</strong> {question.explanation}
            </p>
          </div>
          <button
            className="button home-challenge-demo__continue"
            onClick={continueQuiz}
            type="button"
          >
            {isLastQuestion ? 'See results' : 'Next question'}
            <ArrowRightIcon aria-hidden="true" size={18} weight="bold" />
          </button>
        </div>
      )}
    </section>
  );
}

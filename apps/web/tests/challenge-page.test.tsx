import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Router } from 'wouter';

import ChallengePage from '../src/pages/ChallengePage';

const apiBaseUrl = 'https://api.example.test/api/v1';
const attemptId = '31000000-0000-4000-8000-000000000001';
const eventId = '00000000-0000-4000-8000-000000000018';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderChallenge(authContext = authValue()) {
  window.history.replaceState({}, '', `/challenge-attempts/${attemptId}`);

  return render(
    <Auth0Context.Provider value={authContext}>
      <Router>
        <Route path="/challenge-attempts/:attemptId">
          <ChallengePage apiBaseUrl={apiBaseUrl} />
        </Route>
      </Router>
    </Auth0Context.Provider>,
  );
}

describe('timed player challenge', () => {
  it('loads one unanswered question and submits answer intent with a neutral saved state', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(activeAttempt()))
      .mockResolvedValueOnce(jsonResponse(activeAttempt(1)));
    vi.stubGlobal('fetch', fetchMock);

    renderChallenge();

    expect(
      await screen.findByRole('heading', { name: 'Question 1' }),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Question 1' })).toHaveFocus(),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Challenge ready. Question 1 of 5.',
    );
    expect(
      screen.getByRole('group', {
        name: 'Question 1 Choose one answer',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('progressbar', { name: 'Challenge progress' }),
    ).toHaveValue(0);

    await user.click(screen.getByRole('radio', { name: 'Choice 1.2' }));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(fetchMock).toHaveBeenLastCalledWith(
      `${apiBaseUrl}/challenge-attempts/${attemptId}/answers`,
      expect.objectContaining({
        body: JSON.stringify({
          attemptQuestionId: questionId(1),
          choiceId: choiceId(1, 2),
        }),
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Question 2' }),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Question 2' })).toHaveFocus(),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Answer saved. Question 2 of 5.',
    );
    expect(
      screen.queryByText(/correct answer|incorrect answer|explanation/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Review your answers' }),
    ).not.toBeInTheDocument();
  });

  it('resumes the first server-unanswered question after refresh', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(activeAttempt(2))),
    );

    renderChallenge();

    expect(
      await screen.findByRole('heading', { name: 'Question 3' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Question 3' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Challenge ready. Question 3 of 5.',
    );
    expect(screen.getByText('2 of 5 answers saved')).toBeVisible();
  });

  it('announces and disables the question while an answer is saving', async () => {
    const user = userEvent.setup();
    const answer = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(activeAttempt()))
        .mockImplementationOnce(() => answer.promise),
    );

    renderChallenge();
    await user.click(await screen.findByRole('radio', { name: 'Choice 1.2' }));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(screen.getByRole('status')).toHaveTextContent('Saving your answer…');
    expect(
      screen.getByRole('button', { name: 'Saving answer…' }),
    ).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Choice 1.1' })).toBeDisabled();

    await act(async () => {
      answer.resolve(jsonResponse(activeAttempt(1)));
      await Promise.resolve();
    });

    expect(
      await screen.findByRole('heading', { name: 'Question 2' }),
    ).toBeVisible();
  });

  it('supports native radio keyboard operation and logical form focus', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(activeAttempt())),
    );

    renderChallenge();
    await screen.findByRole('heading', { name: 'Question 1' });

    await user.tab();
    expect(screen.getByRole('radio', { name: 'Choice 1.1' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Choice 1.2' })).toBeChecked();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Submit answer' })).toHaveFocus();
  });

  it('reorders through accessible controls and announces the current order', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(activeOrderingAttempt())),
    );

    renderChallenge();
    const order = await screen.findByRole('list', { name: 'Current order' });
    const moveDown = within(order).getByRole('button', {
      name: 'Move Item 1.3 down from position 1',
    });
    moveDown.focus();
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(orderText(order)).toEqual([
        'Item 1.1',
        'Item 1.3',
        'Item 1.4',
        'Item 1.2',
      ]),
    );
    expect(
      screen
        .getAllByRole('status')
        .some((status) =>
          status.textContent?.includes(
            'Item 1.3 moved to position 2 of 4. Current order:',
          ),
        ),
    ).toBe(true);
    expect(
      within(order).getByRole('button', {
        name: 'Move Item 1.3 down from position 2',
      }),
    ).toHaveFocus();
  });

  it('supports pointer reordering and prevents a double ordering submission', async () => {
    const user = userEvent.setup();
    const answer = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(activeOrderingAttempt()))
      .mockImplementationOnce(() => answer.promise);
    vi.stubGlobal('fetch', fetchMock);

    renderChallenge();
    const order = await screen.findByRole('list', { name: 'Current order' });
    const items = within(order).getAllByRole('listitem');
    const handle = items[0]!.querySelector<HTMLElement>(
      '.challenge-ordering__drag-handle',
    );
    expect(handle).not.toBeNull();

    fireEvent.pointerDown(handle!, { pointerId: 7 });
    fireEvent.pointerEnter(items[1]!, { pointerId: 7 });
    fireEvent.pointerUp(order, { pointerId: 7 });

    expect(orderText(order)).toEqual([
      'Item 1.1',
      'Item 1.3',
      'Item 1.4',
      'Item 1.2',
    ]);

    const submit = screen.getByRole('button', { name: 'Submit order' });
    await user.click(submit);
    await user.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          attemptQuestionId: questionId(1),
          format: 'ordering',
          itemIds: [1, 3, 4, 2].map((item) => itemId(1, item)),
        }),
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Saving order…' }),
    ).toBeDisabled();

    await act(async () => {
      answer.resolve(jsonResponse(activeOrderingAttempt(1)));
      await Promise.resolve();
    });
    expect(
      await screen.findByRole('heading', { name: 'Ordering question 2' }),
    ).toHaveFocus();
  });

  it('preserves the current order across a retryable submission error', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(activeOrderingAttempt()))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(activeOrderingAttempt(1)));
    vi.stubGlobal('fetch', fetchMock);

    renderChallenge();
    const order = await screen.findByRole('list', { name: 'Current order' });
    await user.click(
      within(order).getByRole('button', {
        name: 'Move Item 1.3 down from position 1',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Submit order' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Check your connection and try again.',
    );
    expect(orderText(order)).toEqual([
      'Item 1.1',
      'Item 1.3',
      'Item 1.4',
      'Item 1.2',
    ]);

    await user.click(screen.getByRole('button', { name: 'Retry answer' }));
    expect(
      await screen.findByRole('heading', { name: 'Ordering question 2' }),
    ).toHaveFocus();
    expect(
      fetchMock.mock.calls.slice(1).map((call) => String(call[1]?.body)),
    ).toEqual([
      JSON.stringify({
        attemptQuestionId: questionId(1),
        format: 'ordering',
        itemIds: [1, 3, 4, 2].map((item) => itemId(1, item)),
      }),
      JSON.stringify({
        attemptQuestionId: questionId(1),
        format: 'ordering',
        itemIds: [1, 3, 4, 2].map((item) => itemId(1, item)),
      }),
    ]);
  });

  it('renders the persisted final score, rewards, and authoritative answer review', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(completedAttempt())),
    );

    renderChallenge();

    const resultHeading = await screen.findByRole('heading', {
      name: 'Your challenge result',
    });

    expect(resultHeading).toBeVisible();
    await waitFor(() => expect(resultHeading).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your challenge result is ready.',
    );
    expect(screen.getByText('3', { selector: 'strong' })).toBeVisible();
    expect(screen.getByText(/out of 5 correct/)).toBeVisible();
    expect(screen.queryByText(/coins?/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Earned cards' }),
    ).toHaveTextContent('Campus Spark');
    expect(
      screen.getByRole('heading', { name: 'Review your answers' }),
    ).toBeVisible();

    const review = screen.getByRole('list', { name: 'Answer review' });
    const questions = within(review).getAllByRole('listitem');

    expect(questions).toHaveLength(5);
    expect(within(questions[0]!).getByText('Correct')).toBeVisible();
    expect(within(questions[0]!).getAllByText('Choice 1.2')).toHaveLength(2);
    expect(within(questions[3]!).getByText('Incorrect')).toBeVisible();
    expect(within(questions[3]!).getByText('Choice 4.1')).toBeVisible();
    expect(within(questions[3]!).getByText('Choice 4.2')).toBeVisible();
  });

  it('renders authoritative ordering feedback, correct sequence, and explanation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(completedOrderingAttempt())),
    );

    renderChallenge();

    await screen.findByRole('heading', { name: 'Your challenge result' });
    const review = screen.getByRole('list', { name: 'Answer review' });
    const firstQuestion = review.children[0] as HTMLElement;
    expect(within(firstQuestion).getByText('Correct')).toBeVisible();
    expect(within(firstQuestion).getByText('Your order')).toBeVisible();
    expect(within(firstQuestion).getByText('Correct order')).toBeVisible();
    expect(
      within(firstQuestion).getByText('Ordering explanation 1.'),
    ).toBeVisible();
    expect(within(firstQuestion).getAllByText('Item 1.1')).toHaveLength(2);
  });

  it('renders an unanswered ordering timeout from the completed API result', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse(completedOrderingAttempt('timeout'))),
    );

    renderChallenge();

    expect(await screen.findByText(/Time ran out/)).toBeVisible();
    const review = screen.getByRole('list', { name: 'Answer review' });
    const directQuestions = Array.from(review.children);
    const unanswered = directQuestions[3] as HTMLElement;
    expect(within(unanswered).getAllByText('Not answered')).toHaveLength(2);
    expect(within(unanswered).getByText('Item 4.1')).toBeVisible();
    expect(
      within(unanswered).getByText('Ordering explanation 4.'),
    ).toBeVisible();
  });

  it('renders a persisted result with no new cards without inventing a reward', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(completedAttempt('answered', { cards: [] })),
        ),
    );

    renderChallenge();

    expect(
      await screen.findByText('No new cards were awarded for this result.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('list', { name: 'Earned cards' }),
    ).not.toBeInTheDocument();
  });

  it('uses GET to reconcile timeout and presents the server timeout result', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T10:02:00.000Z'));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(activeAttempt(0, '2026-09-01T10:02:00.000Z')),
      )
      .mockResolvedValueOnce(jsonResponse(completedAttempt('timeout')));
    vi.stubGlobal('fetch', fetchMock);

    renderChallenge();

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(
      screen.getByRole('heading', { name: 'Your challenge result' }),
    ).toBeVisible();
    expect(screen.getByText(/Time ran out/)).toBeVisible();
    const review = screen.getByRole('list', { name: 'Answer review' });
    const unansweredQuestion = within(review).getAllByRole('listitem')[3]!;

    expect(
      within(unansweredQuestion).getAllByText('Not answered'),
    ).toHaveLength(2);
    expect(within(unansweredQuestion).getByText('Choice 4.2')).toBeVisible();
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${apiBaseUrl}/challenge-attempts/${attemptId}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('waits for an explicit retry when timeout reconciliation is still in progress', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T10:02:00.000Z'));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(activeAttempt(0, '2026-09-01T10:02:00.000Z')),
      )
      .mockResolvedValueOnce(
        jsonResponse(activeAttempt(0, '2026-09-01T10:02:00.000Z')),
      )
      .mockResolvedValueOnce(jsonResponse(completedAttempt('timeout')));
    vi.stubGlobal('fetch', fetchMock);

    renderChallenge();

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(
      screen.getByRole('heading', { name: 'Checking your result' }),
    ).toHaveFocus();
    expect(screen.getByText(/server is still confirming/i)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Check result again' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByRole('heading', { name: 'Your challenge result' }),
    ).toBeVisible();
  });

  it('does not let a late active answer response replace a timeout result', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T10:01:59.500Z'));
    const answer = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(activeAttempt(0, '2026-09-01T10:02:00.000Z')),
      )
      .mockImplementationOnce(() => answer.promise)
      .mockResolvedValueOnce(jsonResponse(completedAttempt('timeout')));
    vi.stubGlobal('fetch', fetchMock);
    renderChallenge();
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Choice 1.2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(
      screen.getByRole('heading', { name: 'Your challenge result' }),
    ).toBeVisible();

    await act(async () => {
      answer.resolve(
        jsonResponse(activeAttempt(1, '2026-09-01T10:02:00.000Z')),
      );
      await Promise.resolve();
    });

    expect(
      screen.getByRole('heading', { name: 'Your challenge result' }),
    ).toBeVisible();
  });

  it('does not let a late timeout response replace an answer completion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T10:01:59.500Z'));
    const answer = deferred<Response>();
    const timeout = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(activeAttempt(0, '2026-09-01T10:02:00.000Z')),
        )
        .mockImplementationOnce(() => answer.promise)
        .mockImplementationOnce(() => timeout.promise),
    );
    renderChallenge();
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Choice 1.2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    await act(async () => {
      answer.resolve(jsonResponse(completedAttempt('answered')));
      await Promise.resolve();
    });

    expect(
      screen.getByRole('heading', { name: 'Your challenge result' }),
    ).toBeVisible();

    await act(async () => {
      timeout.resolve(jsonResponse(completedAttempt('timeout')));
      await Promise.resolve();
    });

    expect(
      screen.getByText('All five answers were saved by Wits World.'),
    ).toBeVisible();
    expect(screen.queryByText(/Time ran out/)).not.toBeInTheDocument();
  });

  it('ignores an older active timeout snapshot after newer answer progress', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T10:01:59.500Z'));
    const answer = deferred<Response>();
    const timeout = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(activeAttempt(0, '2026-09-01T10:02:00.000Z')),
        )
        .mockImplementationOnce(() => answer.promise)
        .mockImplementationOnce(() => timeout.promise),
    );
    renderChallenge();
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Choice 1.2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      answer.resolve(
        jsonResponse(activeAttempt(1, '2026-09-01T10:02:00.000Z')),
      );
      await Promise.resolve();
    });

    await act(async () => {
      timeout.resolve(
        jsonResponse(activeAttempt(0, '2026-09-01T10:02:00.000Z')),
      );
      await Promise.resolve();
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Time has ended. Checking your saved result…',
    );
    expect(
      screen.queryByText(/server is still confirming/i),
    ).not.toBeInTheDocument();
  });

  it('accepts newer answer progress from an older request generation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T10:01:59.500Z'));
    const answer = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(activeAttempt(0, '2026-09-01T10:02:00.000Z')),
        )
        .mockImplementationOnce(() => answer.promise)
        .mockResolvedValueOnce(
          jsonResponse(activeAttempt(0, '2026-09-01T10:02:00.000Z')),
        ),
    );
    renderChallenge();
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Choice 1.2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'The server is still confirming your saved result.',
    );

    await act(async () => {
      answer.resolve(
        jsonResponse(activeAttempt(1, '2026-09-01T10:02:00.000Z')),
      );
      await Promise.resolve();
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Time has ended. Checking your saved result…',
    );
  });

  it.each([
    ['401 response', problemResponse('UNAUTHENTICATED', 401)],
    ['missing attempt response', problemResponse('ATTEMPT_NOT_FOUND', 404)],
  ])(
    'keeps newer active answer progress when a later timeout GET receives a terminal %s',
    async (_name, timeoutErrorResponse) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-01T10:01:59.500Z'));
      const answer = deferred<Response>();
      const timeout = deferred<Response>();
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(
            jsonResponse(activeAttempt(0, '2026-09-01T10:02:00.000Z')),
          )
          .mockImplementationOnce(() => answer.promise)
          .mockImplementationOnce(() => timeout.promise),
      );
      renderChallenge();
      await act(async () => {
        await Promise.resolve();
      });
      fireEvent.click(screen.getByRole('radio', { name: 'Choice 1.2' }));
      fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      await act(async () => {
        answer.resolve(
          jsonResponse(activeAttempt(1, '2026-09-01T10:02:00.000Z')),
        );
        await Promise.resolve();
      });
      expect(screen.getByRole('status')).toHaveTextContent(
        'Time has ended. Checking your saved result…',
      );

      await act(async () => {
        timeout.resolve(timeoutErrorResponse);
        await Promise.resolve();
      });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        'Time has ended. Checking your saved result…',
      );
    },
  );

  it.each([
    ['401 response', problemResponse('UNAUTHENTICATED', 401)],
    ['missing attempt response', problemResponse('ATTEMPT_NOT_FOUND', 404)],
  ])(
    'keeps a newer timeout result when a late answer receives a terminal %s',
    async (_name, lateAnswerResponse) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-01T10:01:59.500Z'));
      const answer = deferred<Response>();
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(
            jsonResponse(activeAttempt(0, '2026-09-01T10:02:00.000Z')),
          )
          .mockImplementationOnce(() => answer.promise)
          .mockResolvedValueOnce(jsonResponse(completedAttempt('timeout'))),
      );
      renderChallenge();
      await act(async () => {
        await Promise.resolve();
      });
      fireEvent.click(screen.getByRole('radio', { name: 'Choice 1.2' }));
      fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(
        screen.getByRole('heading', { name: 'Your challenge result' }),
      ).toBeVisible();

      await act(async () => {
        answer.resolve(lateAnswerResponse);
        await Promise.resolve();
      });

      expect(
        screen.getByRole('heading', { name: 'Your challenge result' }),
      ).toBeVisible();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('reloads authoritative progress after an answer lock conflict', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(activeAttempt()))
      .mockResolvedValueOnce(problemResponse('ANSWER_LOCKED', 409))
      .mockResolvedValueOnce(jsonResponse(activeAttempt(1)));
    vi.stubGlobal('fetch', fetchMock);

    renderChallenge();
    await user.click(await screen.findByRole('radio', { name: 'Choice 1.2' }));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(
      await screen.findByRole('heading', { name: 'Question 2' }),
    ).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Challenge ready. Question 2 of 5.',
    );
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked();
    }
    expect(
      screen.getByRole('button', { name: 'Submit answer' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('loads the persisted result after an already-completed conflict', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(activeAttempt()))
        .mockResolvedValueOnce(problemResponse('ATTEMPT_COMPLETED', 409))
        .mockResolvedValueOnce(jsonResponse(completedAttempt())),
    );

    renderChallenge();
    await user.click(await screen.findByRole('radio', { name: 'Choice 1.2' }));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    await screen.findByRole('heading', { name: 'Your challenge result' });
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Your challenge result' }),
      ).toHaveFocus(),
    );
  });

  it('clears an attempt that is missing after submission', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(activeAttempt()))
        .mockResolvedValueOnce(problemResponse('ATTEMPT_NOT_FOUND', 404)),
    );

    renderChallenge();
    await user.click(await screen.findByRole('radio', { name: 'Choice 1.2' }));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This challenge is not available',
    );
    expect(
      screen.queryByRole('heading', { name: 'Question 1' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Return to explore' }),
    ).toBeVisible();
  });

  it('shows authentication failure as a terminal challenge state', async () => {
    renderChallenge({
      ...authValue(),
      getAccessTokenSilently: vi.fn().mockRejectedValue(new Error('expired')),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load your challenge',
    );
    expect(
      screen.getByRole('link', { name: 'Return to explore' }),
    ).toBeVisible();
  });

  it('retries an answer safely after its response is lost', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(activeAttempt()))
      .mockRejectedValueOnce(new TypeError('network interrupted'))
      .mockResolvedValueOnce(jsonResponse(activeAttempt(1)));
    vi.stubGlobal('fetch', fetchMock);

    renderChallenge();
    await user.click(await screen.findByRole('radio', { name: 'Choice 1.2' }));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Check your connection',
    );

    await user.click(screen.getByRole('button', { name: 'Retry answer' }));
    expect(
      await screen.findByRole('heading', { name: 'Question 2' }),
    ).toBeVisible();
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          attemptQuestionId: questionId(1),
          choiceId: choiceId(1, 2),
        }),
      }),
    );
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          attemptQuestionId: questionId(1),
          choiceId: choiceId(1, 2),
        }),
      }),
    );
  });

  it('reconciles the deadline when the document becomes visible', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T10:00:00.000Z'));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(activeAttempt(0, '2026-09-01T10:02:00.000Z')),
      )
      .mockResolvedValueOnce(jsonResponse(completedAttempt('timeout')));
    vi.stubGlobal('fetch', fetchMock);

    renderChallenge();
    await act(async () => {
      await Promise.resolve();
    });
    vi.setSystemTime(new Date('2026-09-01T10:02:01.000Z'));
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      `${apiBaseUrl}/challenge-attempts/${attemptId}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('shows a safe retryable API failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    renderChallenge();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load your challenge',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('requires a hard refresh when the challenge contract is stale', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          problemResponse('CHALLENGE_CLIENT_UPGRADE_REQUIRED', 409),
        ),
    );

    renderChallenge();

    expect(
      await screen.findByRole('heading', {
        name: 'Refresh Wits World to continue',
      }),
    ).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This version cannot safely continue the challenge.',
    );
    expect(
      screen.getByRole('button', { name: 'Refresh Wits World' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument();
  });
});

function authValue(): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
  } as Auth0ContextInterface;
}

function activeAttempt(
  answeredCount = 0,
  deadline = '2099-09-01T10:02:00.000Z',
) {
  return {
    answeredCount,
    attemptId,
    deadline,
    eventId,
    format: 'multiple_choice',
    questions: Array.from({ length: 5 }, (_, index) => {
      const position = index + 1;
      const selectedChoiceId =
        position <= answeredCount ? choiceId(position, 1) : null;

      return {
        answeredAt:
          selectedChoiceId === null ? null : '2099-09-01T10:00:20.000Z',
        attemptQuestionId: questionId(position),
        choices: Array.from({ length: 4 }, (_, choiceIndex) => ({
          choiceId: choiceId(position, choiceIndex + 1),
          text: `Choice ${position}.${choiceIndex + 1}`,
        })),
        position,
        prompt: `Question ${position}`,
        selectedChoiceId,
      };
    }),
    requestId: 'request-active',
    startedAt: '2099-09-01T10:00:00.000Z',
    status: 'in_progress',
    totalQuestions: 5,
  };
}

function completedAttempt(
  completionReason: 'answered' | 'timeout' = 'answered',
  reward = {
    cards: [
      {
        affinity: 'spark',
        cardDefinitionId: '50000000-0000-4000-8000-000000000009',
        category: 'creature',
        name: 'Campus Spark',
        ownedCardId: '51000000-0000-4000-8000-000000000001',
        rarity: 'common',
      },
    ],
  },
) {
  return {
    attemptId,
    completedAt: '2026-09-01T10:01:25.000Z',
    completionReason,
    eventId,
    format: 'multiple_choice',
    requestId: 'request-completed',
    review: completedReview(completionReason),
    reward,
    scoreCorrect: 3,
    status: 'completed',
    totalQuestions: 5,
  };
}

function completedReview(completionReason: 'answered' | 'timeout') {
  return Array.from({ length: 5 }, (_, index) => {
    const position = index + 1;
    const isUnanswered = completionReason === 'timeout' && position > 3;
    const isCorrect = !isUnanswered && position <= 3;
    const selectedChoiceNumber = isCorrect ? 2 : 1;

    return {
      attemptQuestionId: questionId(position),
      position,
      prompt: `Question ${position}`,
      selectedChoice: isUnanswered
        ? null
        : {
            choiceId: choiceId(position, selectedChoiceNumber),
            text: `Choice ${position}.${selectedChoiceNumber}`,
          },
      correctChoice: {
        choiceId: choiceId(position, 2),
        text: `Choice ${position}.2`,
      },
      isCorrect,
    };
  });
}

function activeOrderingAttempt(
  answeredCount = 0,
  deadline = '2099-09-01T10:02:00.000Z',
) {
  return {
    answeredCount,
    attemptId,
    deadline,
    eventId,
    format: 'ordering',
    questions: Array.from({ length: 5 }, (_, index) => {
      const position = index + 1;
      const items = [3, 1, 4, 2].map((item) => ({
        itemId: itemId(position, item),
        text: `Item ${position}.${item}`,
      }));
      const selectedItemIds =
        position <= answeredCount ? items.map((item) => item.itemId) : null;

      return {
        answeredAt:
          selectedItemIds === null ? null : '2099-09-01T10:00:20.000Z',
        attemptQuestionId: questionId(position),
        items,
        position,
        prompt: `Ordering question ${position}`,
        selectedItemIds,
      };
    }),
    requestId: 'request-active-ordering',
    startedAt: '2099-09-01T10:00:00.000Z',
    status: 'in_progress',
    totalQuestions: 5,
  };
}

function completedOrderingAttempt(
  completionReason: 'answered' | 'timeout' = 'answered',
) {
  return {
    attemptId,
    completedAt: '2026-09-01T10:01:25.000Z',
    completionReason,
    eventId,
    format: 'ordering',
    requestId: 'request-completed-ordering',
    review: Array.from({ length: 5 }, (_, index) => {
      const position = index + 1;
      const unanswered = completionReason === 'timeout' && position > 3;
      const correct = !unanswered && position <= 3;
      const correctItems = [1, 2, 3, 4].map((item) => ({
        itemId: itemId(position, item),
        text: `Item ${position}.${item}`,
      }));

      return {
        attemptQuestionId: questionId(position),
        correctItems,
        explanation: `Ordering explanation ${position}.`,
        isCorrect: correct,
        position,
        prompt: `Ordering question ${position}`,
        selectedItems: unanswered
          ? null
          : correct
            ? correctItems
            : [correctItems[1]!, correctItems[0]!, ...correctItems.slice(2)],
      };
    }),
    reward: { cards: [] },
    scoreCorrect: 3,
    status: 'completed',
    totalQuestions: 5,
  };
}

function jsonResponse(payload: object): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

function problemResponse(code: string, status: number): Response {
  return new Response(
    JSON.stringify({
      code,
      detail: 'Safe test problem.',
      requestId: 'request-problem',
      status,
      title: 'Challenge problem',
      type: 'https://wits.world/problems/challenge',
    }),
    { headers: { 'Content-Type': 'application/json' }, status },
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

function questionId(position: number): string {
  return `32000000-0000-4000-8000-${String(position).padStart(12, '0')}`;
}

function choiceId(position: number, choice: number): string {
  return `33000000-0000-4000-${String(position).padStart(4, '0')}-${String(choice).padStart(12, '0')}`;
}

function itemId(position: number, item: number): string {
  return `34000000-0000-4000-${String(position).padStart(4, '0')}-${String(item).padStart(12, '0')}`;
}

function orderText(order: HTMLElement): string[] {
  return Array.from(order.children).map((item) => {
    const text = item.querySelector('.challenge-ordering__text')?.textContent;
    if (!text) throw new Error('Expected an ordering item label.');
    return text;
  });
}

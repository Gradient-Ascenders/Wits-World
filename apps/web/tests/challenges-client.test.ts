import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ChallengeApiError,
  getChallengeAttempt,
  startChallengeAttempt,
  submitChallengeAnswer,
} from '../src/api/challenges';
import { READ_TIMEOUT_MS } from '../src/components/loading-policy';

const apiBaseUrl = 'https://api.example.test/api/v1';
const attemptId = '31000000-0000-4000-8000-000000000001';
const eventId = '00000000-0000-4000-8000-000000000018';
const challengeContractVersion = '2';
const claim = {
  accuracyMetres: 12,
  acquiredAt: '2026-08-08T10:30:00.000Z',
  latitude: -26.19205,
  longitude: 28.03038,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('challenge attempt client', () => {
  it.each(['multiple_choice', 'ordering'] as const)(
    'accepts typeless Power rewards in a completed %s result',
    async (format) => {
      const card = {
        ownedCardId: '51000000-0000-4000-8000-000000000001',
        cardDefinitionId: '50000000-0000-4000-8000-000000000009',
        name: 'Power reward',
        category: 'power',
        affinity: null,
        rarity: 'common',
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse({
            ...(format === 'ordering'
              ? completedOrderingAttempt()
              : completedAttempt()),
            reward: { cards: [card] },
          }),
        ),
      );
      await expect(
        getChallengeAttempt({
          apiBaseUrl,
          attemptId,
          getAccessToken: async () => 'fixture-token',
          signal: new AbortController().signal,
        }),
      ).resolves.toMatchObject({
        status: 'completed',
        reward: { cards: [card] },
      });
    },
  );

  it('continues to reject a Creature reward without an affinity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...completedAttempt(),
          reward: {
            cards: [
              {
                ownedCardId: '51000000-0000-4000-8000-000000000001',
                cardDefinitionId: '50000000-0000-4000-8000-000000000009',
                name: 'Invalid Creature',
                category: 'creature',
                affinity: null,
                rarity: 'common',
              },
            ],
          },
        }),
      ),
    );
    await expectCompletedAttemptToBeRejected();
  });

  it.each(['token', 'fetch', 'body', 'error-body'] as const)(
    'bounds a stalled %s and returns a retryable failure',
    async (phase) => {
      vi.useFakeTimers();
      const never = () => new Promise<never>(() => {});
      const fetchMock = vi.fn<() => Promise<Response>>(never);
      if (phase === 'body' || phase === 'error-body') {
        const response = new Response(null, {
          status: phase === 'body' ? 200 : 500,
        });
        vi.spyOn(response, 'json').mockImplementation(never);
        fetchMock.mockResolvedValue(response);
      }
      vi.stubGlobal('fetch', fetchMock);
      const request = getChallengeAttempt({
        apiBaseUrl,
        attemptId,
        getAccessToken: phase === 'token' ? never : async () => 'fixture-token',
        signal: new AbortController().signal,
      });
      const failure = expect(request).rejects.toMatchObject({
        failure: 'unavailable',
      });
      await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
      await failure;
      if (phase === 'token') expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('does not send an answer when token acquisition finishes after the request timed out', async () => {
    vi.useFakeTimers();
    let finishToken!: (token: string) => void;
    const token = new Promise<string>((resolve) => {
      finishToken = resolve;
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const request = submitChallengeAnswer({
      apiBaseUrl,
      attemptId,
      attemptQuestionId: questionId(1),
      choiceId: choiceId(1, 1),
      getAccessToken: () => token,
      signal: new AbortController().signal,
    });
    const failure = expect(request).rejects.toMatchObject({
      failure: 'unavailable',
    });
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
    await failure;
    finishToken('late-fixture-token');
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates cancellation even when fetch does not settle', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const request = getChallengeAttempt({
      apiBaseUrl,
      attemptId,
      getAccessToken: async () => 'fixture-token',
      signal: controller.signal,
    });
    const failure = expect(request).rejects.toMatchObject({
      name: 'AbortError',
    });
    await Promise.resolve();
    controller.abort();
    await failure;
    expect(fetchMock.mock.calls[0]![1].signal.aborted).toBe(true);
  });

  it('starts a challenge with only a location claim and parses player-safe questions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(activeAttempt()));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const attempt = await startChallengeAttempt({
      apiBaseUrl,
      claim,
      eventId,
      getAccessToken: vi.fn().mockResolvedValue('private-access-token'),
      signal: controller.signal,
    });

    expect(attempt.status).toBe('in_progress');
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/events/${eventId}/challenge-attempts`,
      {
        body: JSON.stringify(claim),
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer private-access-token',
          'Content-Type': 'application/json',
          'X-Wits-Challenge-Contract-Version': challengeContractVersion,
        },
        method: 'POST',
        signal: expect.any(AbortSignal),
      },
    );
  });

  it('resumes a completed challenge with its awarded territory owner bonus', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...completedAttempt(),
          ownerBonus: awardedOwnerBonus(),
        }),
      ),
    );

    const attempt = await startChallengeAttempt({
      apiBaseUrl,
      claim,
      eventId,
      getAccessToken: vi.fn().mockResolvedValue('private-access-token'),
      signal: new AbortController().signal,
    });

    expect(attempt).toMatchObject({
      ownerBonus: {
        card: {
          affinity: null,
          name: 'Territory bonus card',
          rarity: 'common',
        },
        outcome: 'awarded',
      },
      status: 'completed',
    });
  });

  it('gets the owned attempt without a location claim for refresh and timeout reconciliation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(completedAttempt()));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const attempt = await getChallengeAttempt({
      apiBaseUrl,
      attemptId,
      getAccessToken: vi.fn().mockResolvedValue('access-token'),
      signal: controller.signal,
    });

    expect(attempt).toMatchObject({ status: 'completed', scoreCorrect: 3 });

    if (attempt.status !== 'completed') {
      throw new Error('Expected a completed attempt.');
    }

    expect(attempt.review[0]).toMatchObject({
      position: 1,
      selectedChoice: { text: 'Choice 1.2' },
      correctChoice: { text: 'Choice 1.2' },
      isCorrect: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/challenge-attempts/${attemptId}`,
      {
        body: undefined,
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer access-token',
          'X-Wits-Challenge-Contract-Version': challengeContractVersion,
        },
        method: 'GET',
        signal: expect.any(AbortSignal),
      },
    );
  });

  it('submits answer intent only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(activeAttempt(1)));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await submitChallengeAnswer({
      apiBaseUrl,
      attemptId,
      attemptQuestionId: questionId(1),
      choiceId: choiceId(1, 1),
      getAccessToken: vi.fn().mockResolvedValue('access-token'),
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/challenge-attempts/${attemptId}/answers`,
      expect.objectContaining({
        body: JSON.stringify({
          attemptQuestionId: questionId(1),
          choiceId: choiceId(1, 1),
        }),
        headers: expect.objectContaining({
          'X-Wits-Challenge-Contract-Version': challengeContractVersion,
        }),
        method: 'POST',
      }),
    );
  });

  it('submits an ordering answer as four attempt-item IDs in player order', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(activeOrderingAttempt(1)));
    vi.stubGlobal('fetch', fetchMock);
    const itemIds = [3, 1, 4, 2].map((item) => itemId(1, item));

    await submitChallengeAnswer({
      apiBaseUrl,
      attemptId,
      attemptQuestionId: questionId(1),
      format: 'ordering',
      getAccessToken: vi.fn().mockResolvedValue('access-token'),
      itemIds,
      signal: new AbortController().signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/challenge-attempts/${attemptId}/answers`,
      expect.objectContaining({
        body: JSON.stringify({
          attemptQuestionId: questionId(1),
          format: 'ordering',
          itemIds,
        }),
        method: 'POST',
      }),
    );
  });

  it('parses a player-safe ordering attempt without answer feedback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(activeOrderingAttempt())),
    );

    const attempt = await getChallengeAttempt({
      apiBaseUrl,
      attemptId,
      getAccessToken: vi.fn().mockResolvedValue('access-token'),
      signal: new AbortController().signal,
    });

    expect(attempt).toMatchObject({
      format: 'ordering',
      status: 'in_progress',
    });
    if (attempt.status !== 'in_progress' || attempt.format !== 'ordering') {
      throw new Error('Expected an active ordering attempt.');
    }
    expect(attempt.questions[0]).toMatchObject({
      items: [
        { itemId: itemId(1, 3), text: 'Item 1.3' },
        { itemId: itemId(1, 1), text: 'Item 1.1' },
        { itemId: itemId(1, 4), text: 'Item 1.4' },
        { itemId: itemId(1, 2), text: 'Item 1.2' },
      ],
      selectedItemIds: null,
    });
  });

  it('maps a stale challenge contract response to an explicit refresh failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            code: 'CHALLENGE_CLIENT_UPGRADE_REQUIRED',
            detail: 'Refresh before continuing.',
            requestId: 'request-upgrade',
            status: 409,
            title: 'Challenge client update required',
            type: 'https://wits.world/problems/challenge-client-upgrade-required',
          },
          409,
        ),
      ),
    );

    await expect(
      getChallengeAttempt({
        apiBaseUrl,
        attemptId,
        getAccessToken: vi.fn().mockResolvedValue('access-token'),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      failure: 'client-upgrade-required',
      requestId: 'request-upgrade',
    });
  });

  it.each([
    { acceptedChoiceId: choiceId(1, 2) },
    { acceptedChoicePosition: 2 },
    { answerCorrect: true },
    { scoreCorrect: 1 },
    { reward: { cards: [], coinsAwarded: 10 } },
    { ownerBonus: awardedOwnerBonus() },
    { review: completedReview() },
  ])('rejects an active fixture that leaks answer feedback', async (leak) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ ...activeAttempt(), ...leak })),
    );

    await expect(
      getChallengeAttempt({
        apiBaseUrl,
        attemptId,
        getAccessToken: vi.fn().mockResolvedValue('access-token'),
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(ChallengeApiError);
  });

  it('accepts authoritative review only after completion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(completedAttempt())),
    );

    const result = await getChallengeAttempt({
      apiBaseUrl,
      attemptId,
      getAccessToken: vi.fn().mockResolvedValue('access-token'),
      signal: new AbortController().signal,
    });

    expect(result.status).toBe('completed');

    if (result.status !== 'completed') {
      throw new Error('Expected a completed attempt.');
    }

    expect(result.review[0]).toMatchObject({
      selectedChoice: { choiceId: choiceId(1, 2) },
      correctChoice: { choiceId: choiceId(1, 2) },
      isCorrect: true,
    });
  });

  it('accepts the API ordering result, correct sequence, and explanation only after completion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...completedOrderingAttempt(),
          ownerBonus: { card: null, outcome: 'already_claimed' },
        }),
      ),
    );

    const result = await getChallengeAttempt({
      apiBaseUrl,
      attemptId,
      getAccessToken: vi.fn().mockResolvedValue('access-token'),
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      format: 'ordering',
      ownerBonus: { card: null, outcome: 'already_claimed' },
      scoreCorrect: 3,
      status: 'completed',
    });
    if (result.status !== 'completed' || result.format !== 'ordering') {
      throw new Error('Expected a completed ordering attempt.');
    }
    expect(result.review[0]).toMatchObject({
      correctItems: [
        { itemId: itemId(1, 1) },
        { itemId: itemId(1, 2) },
        { itemId: itemId(1, 3) },
        { itemId: itemId(1, 4) },
      ],
      explanation: 'Ordering explanation 1.',
      isCorrect: true,
    });
  });

  it.each([
    [
      'a duplicate active item',
      () => {
        const attempt = activeOrderingAttempt();
        attempt.questions[0]!.items[3] = attempt.questions[0]!.items[0]!;
        return attempt;
      },
    ],
    [
      'active answer feedback',
      () => ({
        ...activeOrderingAttempt(),
        explanation: 'Leaked explanation.',
      }),
    ],
    [
      'an unexpected active question field',
      () => {
        const attempt = activeOrderingAttempt();
        return {
          ...attempt,
          questions: attempt.questions.map((question, index) =>
            index === 0
              ? {
                  ...question,
                  correctItemIds: [1, 2, 3, 4].map((item) => itemId(1, item)),
                }
              : question,
          ),
        };
      },
    ],
    [
      'a blank completed explanation',
      () => {
        const attempt = completedOrderingAttempt();
        attempt.review[0]!.explanation = ' ';
        return attempt;
      },
    ],
    [
      'an inconsistent ordering score',
      () => ({
        ...completedOrderingAttempt(),
        scoreCorrect: 4,
      }),
    ],
  ])(
    'rejects malformed ordering data containing %s',
    async (_name, fixture) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse(fixture())),
      );

      await expect(
        getChallengeAttempt({
          apiBaseUrl,
          attemptId,
          getAccessToken: vi.fn().mockResolvedValue('access-token'),
          signal: new AbortController().signal,
        }),
      ).rejects.toBeInstanceOf(ChallengeApiError);
    },
  );

  it('rejects an unanswered review item marked correct', async () => {
    const completed = completedAttempt();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...completed,
          completionReason: 'timeout',
          review: completed.review.map((question, index) =>
            index === 0
              ? { ...question, selectedChoice: null, isCorrect: true }
              : question,
          ),
        }),
      ),
    );

    await expectCompletedAttemptToBeRejected();
  });

  it('rejects matching selected and correct choices marked incorrect', async () => {
    const completed = completedAttempt();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...completed,
          review: completed.review.map((question, index) =>
            index === 0 ? { ...question, isCorrect: false } : question,
          ),
          scoreCorrect: 2,
        }),
      ),
    );

    await expectCompletedAttemptToBeRejected();
  });

  it('rejects different selected and correct choices marked correct', async () => {
    const completed = completedAttempt();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...completed,
          review: completed.review.map((question, index) =>
            index === 3 ? { ...question, isCorrect: true } : question,
          ),
          scoreCorrect: 4,
        }),
      ),
    );

    await expectCompletedAttemptToBeRejected();
  });

  it('rejects an answered completion with an unanswered review item', async () => {
    const completed = completedAttempt();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...completed,
          review: completed.review.map((question, index) =>
            index === 3 ? { ...question, selectedChoice: null } : question,
          ),
        }),
      ),
    );

    await expectCompletedAttemptToBeRejected();
  });

  it('accepts a timeout completion with unanswered review items', async () => {
    const completed = completedAttempt();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...completed,
          completionReason: 'timeout',
          review: completed.review.map((question, index) =>
            index >= 3 ? { ...question, selectedChoice: null } : question,
          ),
        }),
      ),
    );

    const result = await getChallengeAttempt({
      apiBaseUrl,
      attemptId,
      getAccessToken: vi.fn().mockResolvedValue('access-token'),
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      completionReason: 'timeout',
      review: [
        {},
        {},
        {},
        { isCorrect: false, selectedChoice: null },
        { isCorrect: false, selectedChoice: null },
      ],
    });
  });

  it('rejects uncontracted answer-key data in a completed review', async () => {
    const completed = completedAttempt();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...completed,
          review: completed.review.map((question, index) =>
            index === 0
              ? { ...question, acceptedChoiceId: choiceId(1, 2) }
              : question,
          ),
        }),
      ),
    );

    await expect(
      getChallengeAttempt({
        apiBaseUrl,
        attemptId,
        getAccessToken: vi.fn().mockResolvedValue('access-token'),
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(ChallengeApiError);
  });

  it('rejects a malformed territory owner bonus', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...completedAttempt(),
          ownerBonus: {
            ...awardedOwnerBonus(),
            outcome: 'double_awarded',
          },
        }),
      ),
    );

    await expectCompletedAttemptToBeRejected();
  });

  it('maps an owned-or-missing attempt response to a safe failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            code: 'ATTEMPT_NOT_FOUND',
            detail: 'Attempt not found.',
            requestId: 'request-not-found',
            status: 404,
            title: 'Attempt not found',
            type: 'https://wits.world/problems/not-found',
          },
          404,
        ),
      ),
    );

    await expect(
      getChallengeAttempt({
        apiBaseUrl,
        attemptId,
        getAccessToken: vi.fn().mockResolvedValue('access-token'),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'attempt-not-found' });
  });
});

function activeAttempt(answeredCount = 0) {
  return {
    attemptId,
    deadline: '2099-09-01T10:02:00.000Z',
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
    answeredCount,
  };
}

function completedAttempt() {
  return {
    attemptId,
    completedAt: '2099-09-01T10:01:25.000Z',
    completionReason: 'answered',
    eventId,
    format: 'multiple_choice',
    requestId: 'request-completed',
    review: completedReview(),
    reward: {
      cards: [],
    },
    scoreCorrect: 3,
    status: 'completed',
    totalQuestions: 5,
  };
}

function completedReview() {
  return Array.from({ length: 5 }, (_, index) => {
    const position = index + 1;
    const isCorrect = position <= 3;
    const selectedChoiceNumber = isCorrect ? 2 : 1;

    return {
      attemptQuestionId: questionId(position),
      position,
      prompt: `Question ${position}`,
      selectedChoice: {
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

function awardedOwnerBonus() {
  return {
    card: {
      affinity: null,
      cardDefinitionId: '35000000-0000-4000-8000-000000000001',
      category: 'power',
      name: 'Territory bonus card',
      ownedCardId: '36000000-0000-4000-8000-000000000001',
      rarity: 'common',
    },
    outcome: 'awarded',
  };
}

function activeOrderingAttempt(answeredCount = 0) {
  return {
    answeredCount,
    attemptId,
    deadline: '2099-09-01T10:02:00.000Z',
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
    completedAt: '2099-09-01T10:01:25.000Z',
    completionReason,
    eventId,
    format: 'ordering',
    requestId: 'request-completed-ordering',
    review: Array.from({ length: 5 }, (_, index) => {
      const position = index + 1;
      const isUnanswered = completionReason === 'timeout' && position > 3;
      const isCorrect = !isUnanswered && position <= 3;
      const correctItems = [1, 2, 3, 4].map((item) => ({
        itemId: itemId(position, item),
        text: `Item ${position}.${item}`,
      }));

      return {
        attemptQuestionId: questionId(position),
        correctItems,
        explanation: `Ordering explanation ${position}.`,
        isCorrect,
        position,
        prompt: `Ordering question ${position}`,
        selectedItems: isUnanswered
          ? null
          : isCorrect
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

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

async function expectCompletedAttemptToBeRejected() {
  await expect(
    getChallengeAttempt({
      apiBaseUrl,
      attemptId,
      getAccessToken: vi.fn().mockResolvedValue('access-token'),
      signal: new AbortController().signal,
    }),
  ).rejects.toBeInstanceOf(ChallengeApiError);
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

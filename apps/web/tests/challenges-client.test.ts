import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ChallengeApiError,
  getChallengeAttempt,
  startChallengeAttempt,
  submitChallengeAnswer,
} from '../src/api/challenges';

const apiBaseUrl = 'https://api.example.test/api/v1';
const attemptId = '31000000-0000-4000-8000-000000000001';
const eventId = '00000000-0000-4000-8000-000000000018';
const claim = {
  accuracyMetres: 12,
  acquiredAt: '2026-08-08T10:30:00.000Z',
  latitude: -26.19205,
  longitude: 28.03038,
};

afterEach(() => vi.unstubAllGlobals());

describe('challenge attempt client', () => {
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
        },
        method: 'POST',
        signal: controller.signal,
      },
    );
  });

  it('gets the owned attempt without a location claim for refresh and timeout reconciliation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(completedAttempt()));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(
      getChallengeAttempt({
        apiBaseUrl,
        attemptId,
        getAccessToken: vi.fn().mockResolvedValue('access-token'),
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({ status: 'completed', scoreCorrect: 3 });

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/challenge-attempts/${attemptId}`,
      {
        body: undefined,
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer access-token',
        },
        method: 'GET',
        signal: controller.signal,
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
        method: 'POST',
      }),
    );
  });

  it('rejects an active fixture that leaks answer feedback', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ ...activeAttempt(), answerCorrect: true }),
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
    reward: {
      cards: [],
      coinsAwarded: 37,
    },
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

function questionId(position: number): string {
  return `32000000-0000-4000-8000-${String(position).padStart(12, '0')}`;
}

function choiceId(position: number, choice: number): string {
  return `33000000-0000-4000-${String(position).padStart(4, '0')}-${String(choice).padStart(12, '0')}`;
}

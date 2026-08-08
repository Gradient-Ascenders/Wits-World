import { afterEach, describe, expect, it, vi } from 'vitest';

import { evaluateEventEligibility, listPlayerEvents } from '../src/api/events';

const apiBaseUrl = 'https://api.example.test/api/v1';
const event = {
  availability: 'active',
  description: 'A player-safe event description.',
  endsAt: '2026-08-26T00:00:00.000+02:00',
  eventId: '00000000-0000-4000-8000-000000000018',
  latitude: -26.19205,
  longitude: 28.03038,
  radiusMetres: 75,
  startsAt: '2026-08-01T00:00:00.000+02:00',
  title: 'Sprint 1 Demo - Wits Great Hall',
} as const;
const claim = {
  accuracyMetres: 12,
  acquiredAt: '2026-08-08T10:30:00.000Z',
  latitude: -26.19205,
  longitude: 28.03038,
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('player event client', () => {
  it('loads the player-safe event contract with an access token', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('private-access-token');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ events: [event], requestId: 'request-test-1' }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(
      listPlayerEvents({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
      }),
    ).resolves.toEqual([event]);

    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(`${apiBaseUrl}/events`, {
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer private-access-token',
      },
      signal: controller.signal,
    });
    expect(document.body).not.toHaveTextContent('private-access-token');
  });

  it('classifies token and unauthorized responses without exposing details', async () => {
    const controller = new AbortController();

    await expect(
      listPlayerEvents({
        apiBaseUrl,
        getAccessToken: vi.fn().mockRejectedValue(new Error('provider detail')),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      failure: 'authorization',
      message: 'Published events could not be loaded.',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );

    await expect(
      listPlayerEvents({
        apiBaseUrl,
        getAccessToken: vi.fn().mockResolvedValue('expired-token'),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      failure: 'authorization',
    });
  });

  it('rejects malformed event data as an unavailable response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            events: [{ ...event, latitude: 'not-a-coordinate' }],
            requestId: 'request-test-2',
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      ),
    );

    await expect(
      listPlayerEvents({
        apiBaseUrl,
        getAccessToken: vi.fn().mockResolvedValue('access-token'),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });
});

describe('event eligibility client', () => {
  it('submits the complete location claim with an access token', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('private-access-token');
    const fetchMock = vi.fn().mockResolvedValue(
      eligibilityResponse({
        eventId: event.eventId,
        reachable: true,
        requestId: 'request-eligibility-1',
        status: 'reachable',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(
      evaluateEventEligibility({
        apiBaseUrl,
        claim,
        eventId: event.eventId,
        getAccessToken,
        signal: controller.signal,
      }),
    ).resolves.toEqual({ status: 'reachable' });

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/events/${event.eventId}/eligibility`,
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
    expect(document.body).not.toHaveTextContent('private-access-token');
  });

  it.each([
    [{ reachable: false, status: 'unreachable' }, { status: 'unreachable' }],
    [
      {
        reachable: null,
        reason: 'location_accuracy',
        status: 'retry',
      },
      { reason: 'location_accuracy', status: 'retry' },
    ],
    [
      { reachable: false, reason: 'ended', status: 'unavailable' },
      { reason: 'ended', status: 'unavailable' },
    ],
  ] as const)('parses the %s response variant', async (response, expected) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        eligibilityResponse({
          ...response,
          eventId: event.eventId,
          requestId: 'request-eligibility-variant',
        }),
      ),
    );

    await expect(
      evaluateEventEligibility({
        apiBaseUrl,
        claim,
        eventId: event.eventId,
        getAccessToken: vi.fn().mockResolvedValue('access-token'),
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(expected);
  });

  it('classifies token failures without exposing provider details', async () => {
    await expect(
      evaluateEventEligibility({
        apiBaseUrl,
        claim,
        eventId: event.eventId,
        getAccessToken: vi.fn().mockRejectedValue(new Error('provider detail')),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      failure: 'authorization',
      message: 'Event eligibility could not be checked.',
    });
  });

  it.each([
    ['a non-success response', new Response(null, { status: 503 })],
    [
      'a mismatched event identifier',
      eligibilityResponse({
        eventId: '00000000-0000-4000-8000-000000000099',
        reachable: true,
        requestId: 'request-mismatch',
        status: 'reachable',
      }),
    ],
    [
      'an inconsistent eligibility decision',
      eligibilityResponse({
        eventId: event.eventId,
        reachable: false,
        requestId: 'request-invalid',
        status: 'reachable',
      }),
    ],
  ])('rejects %s as unavailable', async (_description, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(
      evaluateEventEligibility({
        apiBaseUrl,
        claim,
        eventId: event.eventId,
        getAccessToken: vi.fn().mockResolvedValue('access-token'),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });
});

function eligibilityResponse(payload: object): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AuthorApiError,
  getAuthorContentHistory,
  getAuthorPlacementHistory,
  getAuthorPlacementState,
  listAuthorCards,
  listAuthorCampaigns,
  listAuthorChallenges,
  listAuthorEventAttention,
  listAuthorEvents,
  listAuthorQuestions,
  listAuthorTrails,
  listAuthorTrustCases,
  listAuthorTrustCaseEvidence,
  listAuthorTrustCaseHistory,
  listAuthorTrustCaseRestrictions,
  publishAuthorCard,
  publishAuthorChallenge,
  publishAuthorQuestion,
  previewAuthorPlacement,
  retireAuthorCard,
  retireAuthorChallenge,
  retireAuthorEvent,
  retireAuthorQuestion,
  transitionAuthorEventReviewPackage,
  updateAuthorCampaign,
} from '../src/api/author';

const apiBaseUrl = 'https://api.example.test/api/v1';
const accessToken = 'author-access-token';
const getAccessToken = vi.fn().mockResolvedValue(accessToken);
const eventId = '10000000-0000-4000-8000-000000000001';
const challengeId = '20000000-0000-4000-8000-000000000001';
const questionId = '40000000-0000-4000-8000-000000000001';
const cardId = '50000000-0000-4000-8000-000000000001';
const campaignId = '70000000-0000-4000-8000-000000000001';
const baseOptions = () => ({
  apiBaseUrl,
  getAccessToken,
  signal: new AbortController().signal,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('author lifecycle API boundaries', () => {
  it.each([
    {
      name: 'negative assignment metrics',
      invalid: () => ({
        metrics: {
          ...placementStateFixture().metrics,
          activeAssignmentCount: -1,
        },
      }),
    },
    {
      name: 'an unusable placement policy',
      invalid: () => ({
        policy: { ...placementStateFixture().policy, target: 0 },
      }),
    },
    {
      name: 'a zone without geometry',
      invalid: () => ({
        zones: [
          {
            id: cardId,
            key: 'east',
            name: 'East campus',
            status: 'active',
            geometry: null,
          },
        ],
      }),
    },
    {
      name: 'a site outside coordinate bounds',
      invalid: () => ({
        sites: [
          {
            id: cardId,
            zoneId: campaignId,
            name: 'Campus site',
            status: 'active',
            latitude: 91,
            longitude: 28,
            maximumRadiusMetres: 75,
            excluded: false,
          },
        ],
      }),
    },
    {
      name: 'an assignment with an unknown origin',
      invalid: () => ({
        assignments: [
          { eventId, siteId: cardId, zoneId: campaignId, origin: 'browser' },
        ],
      }),
    },
    {
      name: 'an unnamed event',
      invalid: () => ({ events: [{ id: eventId, title: ' ' }] }),
    },
    {
      name: 'an override with an unknown operation',
      invalid: () => ({
        overrides: [
          {
            id: cardId,
            kind: 'overwrite_everything',
            eventId,
            siteId: null,
            expiresAt: '2026-11-30T20:00:00.000Z',
          },
        ],
      }),
    },
  ])('fails closed on $name in placement state', async ({ invalid }) => {
    const state = {
      ...placementStateFixture(),
      ...invalid(),
      requestId: 'placement-invalid',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(state)));
    await expect(getAuthorPlacementState(baseOptions())).rejects.toMatchObject({
      failure: 'unavailable',
    });
  });

  it.each([
    {
      name: 'negative zone coverage counts',
      invalid: () => ({ zoneCounts: { [cardId]: -1 } }),
    },
    {
      name: 'non-text exception messages',
      invalid: () => ({ exceptions: [{ detail: 'unserved' }] }),
    },
    {
      name: 'missing validation results',
      invalid: () => ({ validation: null }),
    },
    {
      name: 'corrupt zone coverage',
      invalid: () => ({
        validation: {
          ...placementPlanFixture().validation,
          coverage: [
            {
              zoneId: cardId,
              actual: -1,
              mandatory: 1,
              preferred: 2,
              status: 'unserved',
            },
          ],
        },
      }),
    },
    {
      name: 'corrupt blocked-site references',
      invalid: () => ({
        validation: {
          coverage: [],
          separation: {
            minimumMetres: 30,
            blockedSites: [
              {
                siteId: cardId,
                zoneId: campaignId,
                relatedSiteIds: ['not-a-uuid'],
                conflictsWithFixedEvent: false,
              },
            ],
          },
        },
      }),
    },
  ])(
    'does not offer a preview with $name for application',
    async ({ invalid }) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse({
            plan: { ...placementPlanFixture(), ...invalid() },
            requestId: 'preview-invalid',
          }),
        ),
      );
      await expect(previewAuthorPlacement(baseOptions())).rejects.toMatchObject(
        { failure: 'unavailable' },
      );
    },
  );

  const listContracts = [
    {
      name: 'events',
      key: 'events',
      read: () => listAuthorEvents(baseOptions()),
    },
    {
      name: 'challenges',
      key: 'challenges',
      read: () => listAuthorChallenges({ ...baseOptions(), eventId }),
    },
    {
      name: 'questions',
      key: 'questions',
      read: () => listAuthorQuestions({ ...baseOptions(), challengeId }),
    },
    { name: 'cards', key: 'cards', read: () => listAuthorCards(baseOptions()) },
    {
      name: 'campaigns',
      key: 'campaigns',
      read: () => listAuthorCampaigns(baseOptions()),
    },
    {
      name: 'trails',
      key: 'trails',
      read: () => listAuthorTrails(baseOptions()),
    },
    {
      name: 'placement history',
      key: 'plans',
      read: () => getAuthorPlacementHistory(baseOptions()),
    },
  ];

  it.each(listContracts)(
    'rejects a non-list $name response instead of silently treating it as empty',
    async ({ key, read }) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ [key]: {}, requestId: 'invalid-list' }),
          ),
      );
      await expect(read()).rejects.toMatchObject({ failure: 'unavailable' });
    },
  );

  it.each(listContracts)(
    'rejects corrupt $name records instead of showing partial content',
    async ({ key, read }) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ [key]: [null], requestId: 'invalid-record' }),
          ),
      );
      await expect(read()).rejects.toMatchObject({ failure: 'unavailable' });
    },
  );

  it.each([
    {
      name: 'content history',
      read: () =>
        getAuthorContentHistory({
          ...baseOptions(),
          entityType: 'event' as const,
          entityId: eventId,
        }),
    },
    { name: 'trust queue', read: () => listAuthorTrustCases(baseOptions()) },
    {
      name: 'trust evidence',
      read: () =>
        listAuthorTrustCaseEvidence({ ...baseOptions(), caseId: cardId }),
    },
    {
      name: 'trust restrictions',
      read: () =>
        listAuthorTrustCaseRestrictions({ ...baseOptions(), caseId: cardId }),
    },
    {
      name: 'trust history',
      read: () =>
        listAuthorTrustCaseHistory({ ...baseOptions(), caseId: cardId }),
    },
  ])(
    'does not accept invalid $name page metadata or rows',
    async ({ read }) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            items: [],
            page: 0,
            pageSize: 20,
            totalItems: 0,
            totalPages: 0,
            requestId: 'invalid-page',
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            items: [null],
            page: 1,
            pageSize: 20,
            totalItems: 1,
            totalPages: 1,
            requestId: 'invalid-row',
          }),
        );
      vi.stubGlobal('fetch', fetchMock);
      await expect(read()).rejects.toMatchObject({ failure: 'unavailable' });
      await expect(read()).rejects.toMatchObject({ failure: 'unavailable' });
    },
  );

  it('rejects an invalid placement representation and missing support reference', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(null))
        .mockResolvedValueOnce(jsonResponse({ events: [] })),
    );
    await expect(getAuthorPlacementState(baseOptions())).rejects.toMatchObject({
      failure: 'unavailable',
    });
    await expect(listAuthorEvents(baseOptions())).rejects.toMatchObject({
      failure: 'unavailable',
    });
  });

  it('keeps access denial distinct from missing resources and filters unusable validation details', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            {
              code: 'ROLE_REQUIRED',
              detail: 'Author access required.',
              requestId: 'denied',
            },
            403,
          ),
        )
        .mockResolvedValueOnce(
          jsonResponse(
            {
              code: 'EVENT_NOT_FOUND',
              detail: 'Event no longer available.',
              requestId: 'missing',
            },
            404,
          ),
        )
        .mockResolvedValueOnce(
          jsonResponse(
            {
              code: 'VALIDATION_ERROR',
              validation: [
                null,
                { field: '/body/title', message: 'Required' },
                { field: 2, message: 'Invalid' },
              ],
              requestId: 'invalid',
            },
            400,
          ),
        ),
    );
    await expect(listAuthorEvents(baseOptions())).rejects.toMatchObject({
      failure: 'forbidden',
      requestId: 'denied',
    });
    await expect(listAuthorEvents(baseOptions())).rejects.toMatchObject({
      failure: 'not-found',
      requestId: 'missing',
    });
    await expect(listAuthorEvents(baseOptions())).rejects.toMatchObject({
      failure: 'validation',
      validation: [{ field: '/body/title', message: 'Required' }],
    });
  });

  it('rejects malformed event-attention envelopes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ attention: [], requestId: 'invalid-analytics' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(listAuthorEventAttention(baseOptions())).rejects.toMatchObject(
      { failure: 'unavailable' },
    );
  });

  it.each([
    {
      action: 'retire',
      expectedVersion: 4,
      invoke: (signal: AbortSignal) =>
        retireAuthorEvent({
          apiBaseUrl,
          eventId,
          expectedVersion: 4,
          getAccessToken,
          signal,
        }),
      path: `/author/events/${eventId}/retire`,
      response: {
        event: eventFixture({ authoringStatus: 'retired', version: 5 }),
        requestId: 'retire-event',
      },
    },
  ])('retires an event with an optimistic version', async (contract) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(contract.response));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;

    await expect(contract.invoke(signal)).resolves.toEqual(
      contract.response.event,
    );
    expect(fetchMock).toHaveBeenCalledWith(`${apiBaseUrl}${contract.path}`, {
      body: JSON.stringify({ expectedVersion: contract.expectedVersion }),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal,
    });
  });

  it.each([
    {
      name: 'challenge',
      id: challengeId,
      expectedVersion: 2,
      published: challengeFixture({ status: 'published', version: 3 }),
      retired: challengeFixture({ status: 'retired', version: 3 }),
      publish: publishAuthorChallenge,
      retire: retireAuthorChallenge,
      path: (id: string, action: string) =>
        `/author/challenges/${id}/${action}`,
    },
    {
      name: 'question',
      id: questionId,
      expectedVersion: 6,
      published: questionFixture({ status: 'published', version: 7 }),
      retired: questionFixture({ status: 'retired', version: 7 }),
      publish: publishAuthorQuestion,
      retire: retireAuthorQuestion,
      path: (id: string, action: string) => `/author/questions/${id}/${action}`,
    },
    {
      name: 'card',
      id: cardId,
      expectedVersion: 1,
      published: cardFixture({ authoringStatus: 'published', version: 2 }),
      retired: cardFixture({ authoringStatus: 'retired', version: 2 }),
      publish: publishAuthorCard,
      retire: retireAuthorCard,
      path: (id: string, action: string) => `/author/cards/${id}/${action}`,
    },
  ])(
    'publishes and retires a $name using the lifecycle response envelope',
    async (contract) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            [contract.name]: contract.published,
            requestId: `publish-${contract.name}`,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            [contract.name]: contract.retired,
            requestId: `retire-${contract.name}`,
          }),
        );
      vi.stubGlobal('fetch', fetchMock);
      const signal = new AbortController().signal;

      await expect(
        contract.publish({
          apiBaseUrl,
          [contract.name === 'challenge'
            ? 'challengeId'
            : contract.name === 'question'
              ? 'questionId'
              : 'cardId']: contract.id,
          expectedVersion: contract.expectedVersion,
          getAccessToken,
          signal,
        } as never),
      ).resolves.toEqual(contract.published);
      await expect(
        contract.retire({
          apiBaseUrl,
          [contract.name === 'challenge'
            ? 'challengeId'
            : contract.name === 'question'
              ? 'questionId'
              : 'cardId']: contract.id,
          expectedVersion: contract.expectedVersion,
          getAccessToken,
          signal,
        } as never),
      ).resolves.toEqual(contract.retired);

      expect(fetchMock.mock.calls).toEqual(
        (['publish', 'retire'] as const).map((action) => [
          `${apiBaseUrl}${contract.path(contract.id, action)}`,
          {
            body: JSON.stringify({ expectedVersion: contract.expectedVersion }),
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            method: 'POST',
            signal,
          },
        ]),
      );
    },
  );

  it('returns a package to its author with the review reason and parses the event envelope', async () => {
    const returnedEvent = eventFixture({
      authoringStatus: 'draft',
      version: 8,
      reviewedAt: '2026-08-17T09:00:00.000Z',
      reviewedBy: '90000000-0000-4000-8000-000000000001',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ event: returnedEvent, requestId: 'package-return' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;

    await expect(
      transitionAuthorEventReviewPackage({
        action: 'return',
        apiBaseUrl,
        eventId,
        expectedVersion: 7,
        getAccessToken,
        reason: 'Add a source for the opening date.',
        signal,
      }),
    ).resolves.toEqual(returnedEvent);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/author/events/${eventId}/package/return`,
      expect.objectContaining({
        body: JSON.stringify({
          expectedVersion: 7,
          reason: 'Add a source for the opening date.',
        }),
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        }),
        method: 'POST',
        signal,
      }),
    );
  });

  it('updates campaign membership without sending server-owned state', async () => {
    const input = {
      description: 'Updated orientation schedule.',
      endsAt: '2026-09-05T16:00:00.000Z',
      eventIds: [eventId],
      startsAt: '2026-09-01T06:00:00.000Z',
      title: 'Welcome Week 2026',
      trailIds: [],
    };
    const campaign = campaignFixture({
      description: input.description,
      title: input.title,
      version: 4,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ campaign, requestId: 'campaign-update' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;

    await expect(
      updateAuthorCampaign({
        apiBaseUrl,
        campaignId,
        expectedVersion: 3,
        getAccessToken,
        input,
        signal,
      }),
    ).resolves.toEqual(campaign);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/author/campaigns/${campaignId}`,
      expect.objectContaining({
        body: JSON.stringify({ ...input, expectedVersion: 3 }),
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }),
        method: 'PUT',
        signal,
      }),
    );
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toContain(
      'authoringStatus',
    );
  });

  it('rejects malformed lifecycle representations instead of accepting an envelope alone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          challenge: { ...challengeFixture(), status: 'queued' },
          requestId: 'bad-challenge',
        }),
      ),
    );

    await expect(
      publishAuthorChallenge({
        apiBaseUrl,
        challengeId,
        expectedVersion: 0,
        getAccessToken,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it('preserves server field validation details on an unsupported lifecycle transition', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            code: 'VALIDATION_ERROR',
            detail: 'The question cannot be published.',
            requestId: 'question-not-ready',
            validation: [
              { field: '/body/acceptedChoiceId', message: 'is required' },
            ],
          },
          422,
        ),
      ),
    );

    await expect(
      publishAuthorQuestion({
        apiBaseUrl,
        expectedVersion: 3,
        getAccessToken,
        questionId,
        signal: new AbortController().signal,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AuthorApiError>>({
        code: 'VALIDATION_ERROR',
        failure: 'not-ready',
        requestId: 'question-not-ready',
        validation: [
          { field: '/body/acceptedChoiceId', message: 'is required' },
        ],
      }),
    );
  });

  it('does not translate an aborted fetch into an availability error', async () => {
    const controller = new AbortController();
    const abortError = new DOMException(
      'The operation was aborted.',
      'AbortError',
    );
    const fetchMock = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(abortError);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      retireAuthorCard({
        apiBaseUrl,
        cardId,
        expectedVersion: 1,
        getAccessToken,
        signal: controller.signal,
      }),
    ).rejects.toBe(abortError);
  });
});

function placementStateFixture() {
  return {
    policyVersion: 'placement-v1',
    rotationBucket: '2026-10-08',
    stateVersion: 4,
    currentPlanId: null,
    nextRotationBoundary: '2026-10-09T02:00:00.000Z',
    metrics: {
      targetAssignmentCount: 6,
      activeAssignmentCount: 0,
      activeZoneCount: 2,
      servedZoneCount: 0,
      unservedZoneCount: 2,
      lastAppliedAt: null,
      lastFailureAt: null,
      lastFailureCode: null,
    },
    policy: {
      id: 'placement-v1',
      target: 6,
      preferredPerZone: 2,
      mandatoryPerZone: 1,
      separationMetres: 30,
      replacements: 2,
      cooldownBuckets: 2,
      previewTtlMinutes: 15,
      rotationTimezone: 'Africa/Johannesburg',
      rotationLocalTime: '04:00',
      maximumPinHours: 168,
      maximumPauseHours: 168,
      maximumExclusionHours: 720,
    },
    zones: [],
    sites: [],
    assignments: [],
    events: [],
    overrides: [],
  };
}

function placementPlanFixture() {
  return {
    planId: cardId,
    policyVersion: 'placement-v1',
    rotationBucket: '2026-10-08',
    stateVersion: 4,
    validUntil: '2026-10-08T10:00:00.000Z',
    status: 'preview',
    entries: [],
    zoneCounts: {},
    exceptions: [],
    validation: {
      coverage: [],
      separation: { minimumMetres: 30, blockedSites: [] },
    },
  };
}

function eventFixture(overrides: Record<string, unknown> = {}) {
  return {
    automaticPlacement: false,
    authoringStatus: 'draft',
    createdAt: '2026-08-16T08:00:00.000Z',
    description: 'East Campus history.',
    endsAt: '2026-09-01T12:00:00.000Z',
    eventId,
    isPublished: false,
    latitude: -26.19205,
    longitude: 28.03038,
    radiusMetres: 75,
    retiredAt: null,
    sourceUrls: ['https://example.test/great-hall-history'],
    startsAt: '2026-09-01T08:00:00.000Z',
    title: 'Great Hall history',
    updatedAt: '2026-08-16T08:00:00.000Z',
    version: 0,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    publicationProvenance: null,
    ...overrides,
  };
}

function challengeFixture(overrides: Record<string, unknown> = {}) {
  return {
    challengeId,
    createdAt: '2026-08-16T08:00:00.000Z',
    eventId,
    format: 'multiple_choice',
    status: 'draft',
    updatedAt: '2026-08-16T08:00:00.000Z',
    version: 0,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    publicationProvenance: null,
    ...overrides,
  };
}

function questionFixture(overrides: Record<string, unknown> = {}) {
  return {
    acceptedChoiceId: '30000000-0000-4000-8000-000000000002',
    acceptedChoicePosition: 2,
    challengeId,
    choices: [1, 2, 3, 4].map((position) => ({
      choiceId: `30000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
      position,
      text: `Choice ${position}`,
    })),
    createdAt: '2026-08-16T08:00:00.000Z',
    difficulty: 2,
    explanation: 'Author-only explanation.',
    format: 'multiple_choice',
    prompt: 'Where is the Great Hall?',
    questionId,
    sourceUrls: [],
    status: 'draft',
    updatedAt: '2026-08-16T08:00:00.000Z',
    version: 0,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    publicationProvenance: null,
    ...overrides,
  };
}

function cardFixture(overrides: Record<string, unknown> = {}) {
  return {
    affinity: 'wit',
    authoringStatus: 'draft',
    category: 'creature',
    createdAt: '2026-08-16T08:00:00.000Z',
    description: 'A scholarly creature.',
    effects: [],
    hp: 120,
    id: cardId,
    imageUrl: null,
    isActive: false,
    moves: [
      {
        effectType: 'damage',
        effectValue: 12,
        id: '60000000-0000-4000-8000-000000000001',
        modifierDurationTurns: null,
        modifierOperation: null,
        modifierStat: null,
        moveType: 'basic',
        name: 'Quick Peck',
        position: 1,
        powerCost: 1,
      },
    ],
    name: 'Campus Owl',
    power: 20,
    rarity: 'common',
    updatedAt: '2026-08-16T08:00:00.000Z',
    version: 0,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    publicationProvenance: null,
    ...overrides,
  };
}

function campaignFixture(overrides: Record<string, unknown> = {}) {
  return {
    campaignId,
    createdAt: '2026-08-16T08:00:00.000Z',
    description: 'Orientation schedule.',
    endsAt: '2026-09-05T16:00:00.000Z',
    events: [
      {
        authoringStatus: 'published',
        endsAt: '2026-09-03T16:00:00.000Z',
        eventId,
        startsAt: '2026-09-01T08:00:00.000Z',
        title: 'Great Hall history',
      },
    ],
    publicationProvenance: null,
    publishedAt: null,
    retiredAt: null,
    reviewedAt: null,
    reviewedBy: null,
    startsAt: '2026-09-01T06:00:00.000Z',
    status: 'draft',
    submittedAt: null,
    submittedBy: null,
    title: 'Welcome Week',
    trails: [],
    updatedAt: '2026-08-16T08:00:00.000Z',
    version: 0,
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

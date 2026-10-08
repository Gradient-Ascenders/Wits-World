import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TrustCaseDetail, TrustCaseQueueItem } from '../src/api/author';
import { TrustReviewWorkspace } from '../src/components/author/TrustReviewWorkspace';

const apiBaseUrl = 'https://api.example.test/api/v1';
const caseId = '10000000-0000-4000-8000-000000000001';
const evidenceId = '30000000-0000-4000-8000-000000000001';
const decisionId = '40000000-0000-4000-8000-000000000001';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TrustReviewWorkspace recovery coverage', () => {
  it('recovers an unauthorized detail read through the visible retry action', async () => {
    let detailRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith(`/author/trust-cases/${caseId}`)) {
          detailRequests += 1;
          return detailRequests === 1
            ? problemResponse(
                403,
                'AUTHOR_REQUIRED',
                'Author access is required.',
              )
            : jsonResponse({ case: caseFixture(), requestId: 'case-ok' });
        }
        return jsonResponse(pagePayload([]));
      }),
    );
    renderWorkspace(caseId);

    expect(
      await screen.findByText('Reviewer permission was refused.'),
    ).toBeVisible();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Retry case' }));
    expect(
      await screen.findByRole('heading', { name: 'Casey Reviewer' }),
    ).toBeVisible();
    expect(detailRequests).toBe(2);
  });

  it('filters the queue, navigates pages, and clamps after the last page disappears', async () => {
    const user = userEvent.setup();
    let pages = 2;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const page = Number(url.searchParams.get('page'));
      const filtered = url.searchParams.get('search') === 'casey';
      return jsonResponse(
        pagePayload(filtered ? [] : [queueFixture()], {
          page: filtered ? 1 : Math.min(page, pages),
          totalItems: filtered ? 0 : pages === 1 ? 1 : 21,
          totalPages: filtered ? 0 : pages,
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWorkspace();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Page 2 of 2');
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await screen.findByText('Page 1 of 2');

    pages = 1;
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      fetchMock.mock.calls.some(
        ([input]) => new URL(String(input)).searchParams.get('page') === '2',
      ),
    ).toBe(true);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([input]) => new URL(String(input)).searchParams.get('page') === '1',
        ).length,
      ).toBeGreaterThanOrEqual(3),
    );
    await user.type(screen.getByLabelText('Search cases'), 'casey');
    await user.click(screen.getByText('Filters'));
    await user.type(
      screen.getByLabelText('Updated from (Johannesburg)'),
      '2026-09-01',
    );
    await user.type(
      screen.getByLabelText('Updated to (Johannesburg)'),
      '2026-09-02',
    );
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('No cases match these filters.');
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    await screen.findByRole('table');
    await waitFor(() =>
      expect(
        new URL(String(fetchMock.mock.calls.at(-1)![0])).searchParams.get(
          'page',
        ),
      ).toBe('1'),
    );
    expect(screen.getByLabelText('Search cases')).toHaveFocus();
  });

  it('restores focus to the originating queue row after returning from a case', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return url.pathname.endsWith(`/author/trust-cases/${caseId}`)
          ? jsonResponse({ case: caseFixture(), requestId: 'case-ok' })
          : jsonResponse(pagePayload([queueFixture()]));
      }),
    );
    const view = renderWorkspace();
    await screen.findByRole('table');
    const caseLink = screen.getByRole('link', {
      name: `Review Casey Reviewer, case ${caseId}`,
    });
    await user.click(caseLink);
    view.rerender(
      <TrustReviewWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={vi.fn().mockResolvedValue('access-token')}
        route={{ caseId, mode: 'detail', section: 'playerReview' }}
      />,
    );
    await screen.findByRole('heading', { name: 'Casey Reviewer' });
    await user.click(screen.getByRole('link', { name: 'Back to case queue' }));
    view.rerender(
      <TrustReviewWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={vi.fn().mockResolvedValue('access-token')}
        route={{ mode: 'list', section: 'playerReview' }}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('link', {
          name: `Review Casey Reviewer, case ${caseId}`,
        }),
      ).toHaveFocus(),
    );
  });

  it('clears a pending audit reference when dismissal changes the case version', async () => {
    const user = userEvent.setup();
    let releaseEvidence!: (response: Response) => void;
    let firstEvidencePage = true;
    const initialDetail = caseFixture({
      evidencePreview: [],
      evidenceTotalItems: 2,
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith(`/author/trust-cases/${caseId}/history`))
          return jsonResponse(pagePayload([historyFixture([evidenceId])]));
        if (url.pathname.endsWith(`/author/trust-cases/${caseId}/evidence`)) {
          if (firstEvidencePage) {
            firstEvidencePage = false;
            return jsonResponse(
              pagePayload([], { totalItems: 2, totalPages: 2 }),
            );
          }
          return new Promise<Response>((resolve) => {
            releaseEvidence = resolve;
          });
        }
        if (
          url.pathname.endsWith(`/author/trust-cases/${caseId}/decisions`) &&
          init?.method === 'POST'
        )
          return jsonResponse({
            case: caseFixture({ version: 4, status: 'resolved' }),
            requestId: 'decision-ok',
          });
        if (url.pathname.endsWith(`/author/trust-cases/${caseId}`))
          return jsonResponse({ case: initialDetail, requestId: 'case-ok' });
        return jsonResponse(pagePayload([]));
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWorkspace(caseId);
    await screen.findByRole('heading', { name: 'Casey Reviewer' });
    await user.click(screen.getByRole('tab', { name: 'History' }));
    await user.click(
      screen.getByRole('link', { name: evidenceId.slice(0, 8) }),
    );
    await waitFor(() => expect(releaseEvidence).toBeTypeOf('function'));

    await user.click(screen.getByLabelText('Dismiss case'));
    await user.type(
      screen.getByRole('textbox', { name: /Reason and context/ }),
      'The retained evidence does not justify further review.',
    );
    await user.click(screen.getByRole('button', { name: 'Record decision' }));
    expect(
      await screen.findByText('Decision recorded in the audit history.'),
    ).toBeVisible();
    expect(
      await screen.findByText(
        'This case changed. Select the history reference again.',
      ),
    ).toBeVisible();
    const decisionCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'POST',
    );
    expect(JSON.parse(String(decisionCall?.[1]?.body))).toMatchObject({
      action: 'dismiss',
      expectedVersion: 3,
    });
    await act(async () =>
      releaseEvidence(
        jsonResponse(
          pagePayload([], { page: 2, totalItems: 2, totalPages: 2 }),
        ),
      ),
    );
    expect(
      screen.getByText(
        'This case changed. Select the history reference again.',
      ),
    ).toBeVisible();
  });

  it('reloads after a stale-version conflict and records a fresh user decision', async () => {
    const user = userEvent.setup();
    let detailReads = 0;
    let decisionWrites = 0;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (
          url.pathname.endsWith(`/author/trust-cases/${caseId}/decisions`) &&
          init?.method === 'POST'
        ) {
          decisionWrites += 1;
          return decisionWrites === 1
            ? problemResponse(
                409,
                'STALE_TRUST_CASE_VERSION',
                'The case changed.',
              )
            : jsonResponse({
                case: caseFixture({ version: 5, status: 'resolved' }),
                requestId: 'decision-ok',
              });
        }
        if (url.pathname.endsWith(`/author/trust-cases/${caseId}`)) {
          detailReads += 1;
          return jsonResponse({
            case: caseFixture({ version: detailReads === 1 ? 3 : 4 }),
            requestId: 'case-ok',
          });
        }
        return jsonResponse(pagePayload([]));
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWorkspace(caseId);
    await screen.findByRole('heading', { name: 'Casey Reviewer' });
    await user.type(
      screen.getByRole('textbox', { name: /Reason and context/ }),
      'Use current evidence before resolving this case.',
    );
    await user.click(screen.getByRole('button', { name: 'Record decision' }));
    expect(
      await screen.findByText(
        'This case changed before your decision was saved.',
      ),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Load latest case' }));
    await waitFor(() => expect(detailReads).toBe(2));
    await user.click(screen.getByText('Case details'));
    expect(screen.getByText('4', { selector: 'dd' })).toBeVisible();

    await user.click(screen.getByLabelText('Dismiss case'));
    await user.type(
      screen.getByRole('textbox', { name: /Reason and context/ }),
      'The latest review supports dismissal.',
    );
    await user.click(screen.getByRole('button', { name: 'Record decision' }));
    expect(
      await screen.findByText('Decision recorded in the audit history.'),
    ).toBeVisible();
    const writes = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === 'POST',
    );
    expect(writes).toHaveLength(2);
    expect(JSON.parse(String(writes[1]?.[1]?.body))).toMatchObject({
      action: 'dismiss',
      expectedVersion: 4,
    });
  });

  it('requires a selected scope before a confirmed restriction is submitted', async () => {
    const user = userEvent.setup();
    const fetchMock = installCaseApi();
    renderWorkspace(caseId);
    await screen.findByRole('heading', { name: 'Casey Reviewer' });
    await user.click(screen.getByLabelText('Apply temporary restriction'));
    await user.type(
      screen.getByRole('textbox', { name: /Reason and context/ }),
      'A bounded restriction is proportionate to the evidence.',
    );
    await user.click(
      screen.getByRole('button', { name: 'Review restriction' }),
    );
    expect(screen.getByText('Select at least one restriction.')).toBeVisible();
    expect(decisionRequests(fetchMock)).toHaveLength(0);

    await user.click(screen.getByLabelText('Pause new competitive matches'));
    await user.click(
      screen.getByRole('button', { name: 'Review restriction' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Apply temporary restrictions to Casey Reviewer?',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Apply 24-hour restriction' }),
    );
    expect(
      await screen.findByText('Decision recorded in the audit history.'),
    ).toBeVisible();
    expect(
      JSON.parse(String(decisionRequests(fetchMock)[0]?.[1]?.body)),
    ).toMatchObject({
      action: 'restrict',
      expectedVersion: 3,
      restrictionScopes: ['new_competitive_match_hold'],
    });
  });
});

function renderWorkspace(selectedCaseId?: string) {
  return render(
    <TrustReviewWorkspace
      apiBaseUrl={apiBaseUrl}
      getAccessToken={vi.fn().mockResolvedValue('access-token')}
      route={
        selectedCaseId
          ? { caseId: selectedCaseId, mode: 'detail', section: 'playerReview' }
          : { mode: 'list', section: 'playerReview' }
      }
    />,
  );
}

function installCaseApi() {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (
        url.pathname.endsWith(`/author/trust-cases/${caseId}/decisions`) &&
        init?.method === 'POST'
      )
        return jsonResponse({
          case: caseFixture({ version: 4, status: 'under_review' }),
          requestId: 'decision-ok',
        });
      if (url.pathname.endsWith(`/author/trust-cases/${caseId}`))
        return jsonResponse({ case: caseFixture(), requestId: 'case-ok' });
      return jsonResponse(pagePayload([]));
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function decisionRequests(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(
    ([input, init]) =>
      String(input).endsWith(`/author/trust-cases/${caseId}/decisions`) &&
      init?.method === 'POST',
  );
}

function queueFixture(): TrustCaseQueueItem {
  return {
    activeRestrictionCount: 0,
    activeRestrictionScopes: [],
    band: 'urgent_review',
    canReview: true,
    caseId,
    latestRestrictionExpiry: null,
    openedAt: '2026-09-25T09:00:00.000Z',
    playerId: '20000000-0000-4000-8000-000000000001',
    playerName: 'Casey Reviewer',
    policyVersion: 'trust-v1',
    restrictionCount: 0,
    score: 67,
    signalTypes: ['impossible_movement'],
    status: 'open',
    updatedAt: '2026-09-25T09:00:00.000Z',
    version: 3,
  };
}

function caseFixture(
  overrides: Partial<TrustCaseDetail> = {},
): TrustCaseDetail {
  const evidence = {
    basePoints: 25,
    decayState: 'active' as const,
    effectivePoints: 21,
    evidenceId,
    expiresAt: '2026-09-27T09:00:00.000Z',
    observedAt: '2026-09-25T09:00:00.000Z',
    opponentPattern: null,
    policyVersion: 'trust-v1',
    reviewedFalsePositive: false,
    safeSourceType: 'movement check',
    severity: 'high' as const,
    signalType: 'impossible_movement' as const,
    state: 'active' as const,
  };
  const history = historyFixture([evidenceId]);
  return {
    activeRestrictionCount: 0,
    activeRestrictionScopes: [],
    band: 'urgent_review',
    canReview: true,
    caseId,
    categoryTotals: {
      movement: 41,
      opponentPatterns: 9,
      submissionConflicts: 7,
    },
    evidence: [evidence],
    evidencePreview: [evidence],
    evidenceTotalItems: 1,
    evidenceTruncated: false,
    history: [history],
    historyTruncated: false,
    latestRestrictionExpiry: null,
    openedAt: '2026-09-25T09:00:00.000Z',
    playerId: '20000000-0000-4000-8000-000000000001',
    playerName: 'Casey Reviewer',
    policyVersion: 'trust-v1',
    recentHistory: [history],
    resolvedAt: null,
    resolutionReason: null,
    restrictionCount: 0,
    restrictionPreview: [],
    restrictionsTruncated: false,
    restrictionTotalItems: 0,
    score: 67,
    scoreExplanation: {
      evaluatedAt: '2026-09-25T09:00:00.000Z',
      finalScore: 67,
      movementPoints: 41,
      opponentPatternPoints: 9,
      reviewBand: 'urgent_review',
      snapshotId: '50000000-0000-4000-8000-000000000001',
      sourceSignalCount: 4,
      submissionConflictPoints: 7,
    },
    status: 'open',
    sourceSignalCount: 4,
    updatedAt: '2026-09-25T09:00:00.000Z',
    version: 3,
    ...overrides,
  };
}

function historyFixture(evidenceIds: string[]) {
  return {
    action: 'case_opened' as const,
    actorPlayerId: null,
    actorPlayerName: null,
    actorType: 'system' as const,
    caseVersionAfter: 1,
    caseVersionBefore: 0,
    decisionId,
    decisionType: 'initial_review_opened' as const,
    evidenceIds,
    falsePositiveEvidenceIds: [],
    occurredAt: '2026-09-25T09:00:00.000Z',
    policyVersion: 'trust-v1',
    previousStatus: null,
    reasonCode: 'threshold_reached',
    reasonNote: null,
    restrictions: [],
    resultingStatus: 'open' as const,
    versionAfter: 1,
    versionBefore: 0,
  };
}

function pagePayload<T>(
  items: T[],
  options: { page?: number; totalItems?: number; totalPages?: number } = {},
) {
  const totalItems = options.totalItems ?? items.length;
  return {
    items,
    page: options.page ?? 1,
    pageSize: 20,
    requestId: 'request-page',
    totalItems,
    totalPages:
      options.totalPages ?? (totalItems ? Math.ceil(totalItems / 20) : 0),
  };
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

function problemResponse(status: number, code: string, detail: string) {
  return new Response(
    JSON.stringify({
      code,
      detail,
      requestId: 'request-error',
      status,
      title: 'Request failed',
      type: 'about:blank',
    }),
    {
      headers: { 'Content-Type': 'application/problem+json' },
      status,
    },
  );
}

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  TrustCaseDetail,
  TrustCaseEvidenceItem,
  TrustCaseQueueItem,
  TrustRestrictionItem,
} from '../src/api/author';
import { TrustReviewWorkspace } from '../src/components/author/TrustReviewWorkspace';

const apiBaseUrl = 'https://api.example.test/api/v1';
const caseId = '10000000-0000-4000-8000-000000000001';
const playerId = '20000000-0000-4000-8000-000000000001';
const evidenceId = '30000000-0000-4000-8000-000000000001';
const decisionId = '40000000-0000-4000-8000-000000000001';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TrustReviewWorkspace', () => {
  it('searches and filters the authoritative queue, then presents an empty result', async () => {
    const user = userEvent.setup();
    const requests: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        requests.push(url);
        return jsonResponse(
          queuePayload(
            requests.length === 1 ? [queueFixture(caseFixture())] : [],
          ),
        );
      }),
    );
    renderWorkspace();

    expect(await screen.findByText('Casey Reviewer')).toBeVisible();
    await user.type(screen.getByLabelText('Search cases'), 'casey');
    await user.selectOptions(screen.getByLabelText('Case status'), 'resolved');
    await user.selectOptions(
      screen.getByLabelText('Review priority'),
      'urgent_review',
    );
    await user.click(screen.getByText('More filters'));
    await user.selectOptions(
      screen.getByLabelText('Signal type'),
      'opponent_concentration',
    );
    await user.selectOptions(
      screen.getByLabelText('Restriction state'),
      'active',
    );
    await user.type(
      screen.getByLabelText('Opened from (Johannesburg)'),
      '2026-09-01',
    );
    await user.type(
      screen.getByLabelText('Opened to (Johannesburg)'),
      '2026-09-02',
    );
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('No cases match this view.')).toBeVisible();
    const latest = requests.at(-1)!;
    expect(latest.searchParams.get('search')).toBe('casey');
    expect(latest.searchParams.get('status')).toBe('resolved');
    expect(latest.searchParams.get('band')).toBe('urgent_review');
    expect(latest.searchParams.get('signalType')).toBe(
      'opponent_concentration',
    );
    expect(latest.searchParams.get('restrictionState')).toBe('active');
    expect(latest.searchParams.get('createdFrom')).toBe(
      '2026-08-31T22:00:00.000Z',
    );
    expect(latest.searchParams.get('createdTo')).toBe(
      '2026-09-02T21:59:59.999Z',
    );
  });

  it('shows server-provided score categories, severity text, signals, and audit history', async () => {
    installCaseApi();
    renderWorkspace(caseId);

    const caseHeading = await screen.findByRole('heading', {
      name: 'Casey Reviewer',
    });
    expect(caseHeading).toBeVisible();
    expect(caseHeading).toHaveFocus();
    expect(screen.getAllByText('Urgent Review')).toHaveLength(2);
    expect(screen.getByText('High severity')).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Signals' })).getByText(
        'Impossible movement',
      ),
    ).toBeVisible();
    expect(screen.getByText('Movement').nextElementSibling).toHaveTextContent(
      '41',
    );
    expect(
      screen.getByText('Submission conflicts').nextElementSibling,
    ).toHaveTextContent('7');
    expect(
      screen.getByText('Opponent patterns').nextElementSibling,
    ).toHaveTextContent('9');
    expect(
      screen.getByText('Server final').nextElementSibling,
    ).toHaveTextContent('67');
    expect(
      screen.getByText('Review priority, not proof of misconduct.'),
    ).toBeVisible();
    expect(screen.getByText('Initial Review Opened')).toBeVisible();
    expect(screen.queryByText(/latitude|longitude/i)).not.toBeInTheDocument();
  });

  it('presents privacy-safe opponent aggregates, restrictions, and audit context', async () => {
    const user = userEvent.setup();
    const opponentEvidence: TrustCaseEvidenceItem = {
      ...caseFixture().evidencePreview[0]!,
      evidenceId: '30000000-0000-4000-8000-000000000002',
      opponentPattern: {
        availability: 'available' as const,
        completedMatchCount: 8,
        evaluationWindowEnd: '2026-09-25T09:00:00.000Z',
        evaluationWindowStart: '2026-09-18T09:00:00.000Z',
        kind: 'opponent_concentration' as const,
        minimumCompletedMatchCount: 6,
        minimumOpponentConcentrationRatio: 0.8,
        opponentConcentrationRatio: 0.875,
        repeatedOpponentMatchCount: 7,
      } as unknown as TrustCaseEvidenceItem['opponentPattern'],
      signalType: 'opponent_concentration' as const,
    };
    const forfeitEvidence: TrustCaseEvidenceItem = {
      ...caseFixture().evidencePreview[0]!,
      evidenceId: '30000000-0000-4000-8000-000000000004',
      opponentPattern: {
        availability: 'available' as const,
        evaluationWindowEnd: '2026-09-25T09:00:00.000Z',
        evaluationWindowStart: '2026-09-18T09:00:00.000Z',
        kind: 'one_sided_outcome_pattern' as const,
        qualifyingForfeitCount: 5,
      },
      signalType: 'one_sided_outcome_pattern' as const,
    };
    const restriction: TrustRestrictionItem = {
      active: true,
      appealStatus: 'submitted' as const,
      decisionId,
      effectiveExpiresAt: '2026-09-28T09:00:00.000Z',
      originalExpiresAt: '2026-09-28T09:00:00.000Z',
      restrictionId: '60000000-0000-4000-8000-000000000001',
      scope: 'card_trade_hold' as const,
      startsAt: '2026-09-25T09:00:00.000Z',
    };
    const base = caseFixture();
    const detail = caseFixture({
      activeRestrictionCount: 1,
      activeRestrictionScopes: ['card_trade_hold'],
      evidence: [opponentEvidence, forfeitEvidence],
      evidencePreview: [opponentEvidence, forfeitEvidence],
      evidenceTotalItems: 2,
      recentHistory: [
        {
          ...base.recentHistory[0]!,
          action: 'restrict',
          actorPlayerId: playerId,
          actorPlayerName: 'Morgan Author',
          actorType: 'author',
          decisionType: 'restrict',
          reasonNote: 'Bounded restriction after aggregate review.',
          restrictions: [
            { ...restriction, expiresAt: restriction.originalExpiresAt },
          ],
        },
      ],
      restrictionCount: 1,
      restrictionPreview: [restriction],
      restrictionTotalItems: 1,
    });
    installCaseApi({ detail });
    renderWorkspace(caseId);

    const signals = await screen.findByRole('region', { name: 'Signals' });
    expect(within(signals).getByText('Opponent concentration')).toBeVisible();
    const aggregateToggles = screen.getAllByText('View aggregate basis');
    await user.click(aggregateToggles[0]!);
    await user.click(aggregateToggles[1]!);
    expect(
      screen.getByText('Completed matches').nextElementSibling,
    ).toHaveTextContent('8');
    expect(
      screen.getByText('Repeated-opponent matches').nextElementSibling,
    ).toHaveTextContent('7');
    expect(screen.getByText(/87.5%/)).toBeVisible();
    expect(
      screen.getByText('Qualifying forfeits').nextElementSibling,
    ).toHaveTextContent('5');
    expect(screen.queryByText(/policy threshold/i)).not.toBeInTheDocument();
    expect(screen.getByText('Pause card trading')).toBeVisible();
    expect(screen.getByText('Submitted')).toBeVisible();
    expect(
      screen.getByText(/Bounded restriction after aggregate review/),
    ).toBeVisible();
    expect(
      screen.queryByLabelText('Pause card trading'),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText(
        /Opponent identities and private match records are not exposed/i,
      ),
    ).toHaveLength(2);
  });

  it('loads additional signal pages without duplicating the preview', async () => {
    const user = userEvent.setup();
    const first = caseFixture().evidencePreview[0]!;
    const second: TrustCaseEvidenceItem = {
      ...first,
      evidenceId: '30000000-0000-4000-8000-000000000002',
      signalType: 'one_sided_outcome_pattern' as const,
    };
    installCaseApi({
      detail: caseFixture({ evidenceTotalItems: 2, evidenceTruncated: true }),
      evidencePages: [[first], [second]],
    });
    renderWorkspace(caseId);

    const signals = await screen.findByRole('region', { name: 'Signals' });
    expect(within(signals).getByText('Impossible movement')).toBeVisible();
    await user.click(
      await screen.findByRole('button', { name: 'Load more signals' }),
    );
    expect(await screen.findByText('One-sided outcome pattern')).toBeVisible();
    expect(within(signals).getAllByText('Impossible movement')).toHaveLength(1);
    expect(screen.getByText('1 more records loaded.')).toBeInTheDocument();
  });

  it('keeps the case usable when one investigation collection fails', async () => {
    installCaseApi({ failHistory: true });
    renderWorkspace(caseId);

    expect(
      within(await screen.findByRole('region', { name: 'Signals' })).getByText(
        'Impossible movement',
      ),
    ).toBeVisible();
    expect(
      await screen.findByText(
        'The complete audit records could not be loaded.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Retry audit records' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('heading', { name: 'Record decision' }),
    ).toBeVisible();
  });

  it('explains legacy aggregate gaps and obeys the server review block', async () => {
    const legacyEvidence: TrustCaseEvidenceItem = {
      ...caseFixture().evidencePreview[0]!,
      evidenceId: '30000000-0000-4000-8000-000000000003',
      opponentPattern: {
        availability: 'unavailable',
        reason: 'legacy_summary_not_retained',
        remediation: 'await_fresh_detector_evaluation',
      },
      signalType: 'opponent_concentration',
    };
    installCaseApi({
      detail: caseFixture({
        canReview: false,
        evidence: [legacyEvidence],
        evidencePreview: [legacyEvidence],
      }),
    });
    renderWorkspace(caseId);

    expect(
      await screen.findByText('Reviewer-safe aggregate unavailable'),
    ).toBeVisible();
    expect(
      screen.getByText('Decision controls are unavailable.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Record decision' }),
    ).not.toBeInTheDocument();
  });

  it('downloads the bounded safe export and discloses truncation', async () => {
    const user = userEvent.setup();
    const createObjectUrl = vi.fn(() => 'blob:trust-case');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    );
    installCaseApi({ exportTruncated: true });
    renderWorkspace(caseId);

    await screen.findByRole('heading', { name: 'Casey Reviewer' });
    await user.click(screen.getByRole('button', { name: 'Export safe JSON' }));

    expect(
      await screen.findByText(/exceeded the 100-record export limit/i),
    ).toBeVisible();
    expect(createObjectUrl).toHaveBeenCalledOnce();
  });

  it('records a non-destructive decision without a confirmation dialog', async () => {
    const user = userEvent.setup();
    const fetchMock = installCaseApi();
    renderWorkspace(caseId);

    await screen.findByRole('heading', { name: 'Casey Reviewer' });
    await user.type(
      screen.getByRole('textbox', { name: /Reason and context/ }),
      'Signals remain ambiguous; continue proportionate monitoring.',
    );
    await user.click(screen.getByRole('button', { name: 'Record decision' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      await screen.findByText('Decision recorded in the audit history.'),
    ).toBeVisible();
    expect(decisionBody(fetchMock)).toEqual({
      action: 'continue_monitoring',
      expectedVersion: 3,
      reasonNote:
        'Signals remain ambiguous; continue proportionate monitoring.',
    });
  });

  it('requires keyboard-accessible confirmation before applying restrictions', async () => {
    const user = userEvent.setup();
    const fetchMock = installCaseApi({
      detail: caseFixture({
        activeRestrictionCount: 1,
        activeRestrictionScopes: ['location_reward_challenge_hold'],
        latestRestrictionExpiry: '2026-09-28T09:00:00.000Z',
      }),
    });
    renderWorkspace(caseId);

    await screen.findByRole('heading', { name: 'Casey Reviewer' });
    await user.click(screen.getByLabelText('Apply temporary restriction'));
    await user.click(screen.getByLabelText('Pause new competitive matches'));
    await user.selectOptions(screen.getByLabelText('Duration'), '72');
    await user.type(
      screen.getByRole('textbox', { name: /Reason and context/ }),
      'Repeated evidence warrants a bounded competitive pause.',
    );
    const reviewButton = screen.getByRole('button', {
      name: 'Review restriction',
    });
    await user.click(reviewButton);

    const dialog = screen.getByRole('dialog', {
      name: 'Apply temporary restrictions to Casey Reviewer?',
    });
    expect(decisionRequests(fetchMock)).toHaveLength(0);
    expect(
      within(dialog).getByText('Pause new competitive matches'),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('heading', { name: 'Current state' }),
    ).toBeVisible();
    expect(
      within(dialog).getByText('Case status').nextElementSibling,
    ).toHaveTextContent('Open');
    expect(
      within(dialog).getByText('Active restriction records').nextElementSibling,
    ).toHaveTextContent('1');
    expect(
      within(dialog).getByText('Pause location reward challenges'),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('heading', { name: 'Proposed restriction' }),
    ).toBeVisible();
    expect(
      within(dialog).getByText('Duration').nextElementSibling,
    ).toHaveTextContent('72 hours');
    expect(
      within(dialog).getByRole('button', { name: 'Go back' }),
    ).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(reviewButton).toHaveFocus();

    await user.click(reviewButton);
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Apply 72-hour restriction',
      }),
    );

    await screen.findByText('Decision recorded in the audit history.');
    expect(decisionBody(fetchMock)).toEqual({
      action: 'restrict',
      durationHours: 72,
      expectedVersion: 3,
      reasonNote: 'Repeated evidence warrants a bounded competitive pause.',
      restrictionScopes: ['new_competitive_match_hold'],
    });
  });

  it('focuses the reason field and avoids API writes when validation fails', async () => {
    const user = userEvent.setup();
    const fetchMock = installCaseApi();
    renderWorkspace(caseId);

    await screen.findByRole('heading', { name: 'Casey Reviewer' });
    await user.click(screen.getByRole('button', { name: 'Record decision' }));

    expect(
      screen.getByText('Explain the evidence and context for this decision.'),
    ).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: /Reason and context/ }),
    ).toHaveFocus();
    expect(decisionRequests(fetchMock)).toHaveLength(0);
  });

  it('surfaces a stale decision conflict and reloads the latest case on request', async () => {
    const user = userEvent.setup();
    let detailLoads = 0;
    const fetchMock = installCaseApi({
      onDetail: () => {
        detailLoads += 1;
        return jsonResponse(
          caseEnvelope(caseFixture({ version: detailLoads + 2 })),
        );
      },
      onDecision: () =>
        problemResponse(
          409,
          'STALE_TRUST_CASE_VERSION',
          'This trust case changed after it was opened. Review the latest case before deciding.',
        ),
    });
    renderWorkspace(caseId);

    await screen.findByRole('heading', { name: 'Casey Reviewer' });
    await user.type(
      screen.getByRole('textbox', { name: /Reason and context/ }),
      'Use the latest review state.',
    );
    await user.click(screen.getByRole('button', { name: 'Record decision' }));

    expect(
      await screen.findByText(
        'This case changed before your decision was saved.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: /Reason and context/ }),
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Load latest case' }));
    await waitFor(() => expect(detailLoads).toBe(2));
    expect(screen.getByText('4', { selector: 'dd' })).toBeVisible();
    expect(decisionRequests(fetchMock)).toHaveLength(1);
  });

  it('renders useful loading, empty, forbidden, and API-error states', async () => {
    const never = new Promise<Response>(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => never),
    );
    const loading = renderWorkspace();
    expect(screen.getByText('Loading case queue…')).toBeVisible();
    loading.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(queuePayload([]))),
    );
    const empty = renderWorkspace();
    expect(await screen.findByText('No cases match this view.')).toBeVisible();
    empty.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        problemResponse(403, 'AUTHOR_REQUIRED', 'Author access is required.'),
      ),
    );
    const forbidden = renderWorkspace();
    expect(
      await screen.findByText('Reviewer permission was refused.'),
    ).toBeVisible();
    forbidden.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        problemResponse(500, 'INTERNAL_ERROR', 'Try again later.'),
      ),
    );
    renderWorkspace();
    expect(
      await screen.findByText('The case queue is unavailable.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry queue' })).toBeEnabled();
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

function installCaseApi({
  detail = caseFixture(),
  evidencePages,
  exportTruncated = false,
  failHistory = false,
  onDecision,
  onDetail,
}: {
  detail?: TrustCaseDetail;
  evidencePages?: TrustCaseDetail['evidencePreview'][];
  exportTruncated?: boolean;
  failHistory?: boolean;
  onDecision?: () => Response;
  onDetail?: () => Response;
} = {}) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (
        url.pathname.endsWith('/author/trust-cases') &&
        init?.method === 'GET'
      )
        return jsonResponse(queuePayload([queueFixture(detail)]));
      if (
        url.pathname.endsWith(`/author/trust-cases/${caseId}`) &&
        init?.method === 'GET'
      )
        return onDetail?.() ?? jsonResponse(caseEnvelope(detail));
      if (
        url.pathname.endsWith(`/author/trust-cases/${caseId}/evidence`) &&
        init?.method === 'GET'
      ) {
        const requestedPage = Number(url.searchParams.get('page') ?? 1);
        const items =
          evidencePages?.[requestedPage - 1] ?? detail.evidencePreview;
        return jsonResponse(
          pagePayload(items, {
            page: requestedPage,
            totalItems: evidencePages
              ? evidencePages.reduce((total, page) => total + page.length, 0)
              : detail.evidenceTotalItems,
            totalPages: evidencePages?.length,
          }),
        );
      }
      if (
        url.pathname.endsWith(`/author/trust-cases/${caseId}/restrictions`) &&
        init?.method === 'GET'
      ) {
        return jsonResponse(
          pagePayload(detail.restrictionPreview, {
            totalItems: detail.restrictionTotalItems,
          }),
        );
      }
      if (
        url.pathname.endsWith(`/author/trust-cases/${caseId}/history`) &&
        init?.method === 'GET'
      ) {
        if (failHistory)
          return problemResponse(500, 'INTERNAL_ERROR', 'Try again later.');
        return jsonResponse(pagePayload(detail.recentHistory));
      }
      if (
        url.pathname.endsWith(`/author/trust-cases/${caseId}/export`) &&
        init?.method === 'GET'
      ) {
        return jsonResponse({
          export: {
            case: detail,
            evidence: pagePayload(detail.evidencePreview, {
              includeRequestId: false,
              pageSize: 100,
              totalItems: exportTruncated ? 101 : detail.evidenceTotalItems,
              totalPages: exportTruncated ? 2 : 1,
            }),
            formatVersion: 'trust-case-review-v1',
            generatedAt: '2026-09-27T10:00:00.000Z',
            history: pagePayload(detail.recentHistory, {
              includeRequestId: false,
              pageSize: 100,
            }),
            restrictions: pagePayload(detail.restrictionPreview, {
              includeRequestId: false,
              pageSize: 100,
            }),
          },
          requestId: 'request-export',
        });
      }
      if (
        url.pathname.endsWith(`/author/trust-cases/${caseId}/decisions`) &&
        init?.method === 'POST'
      )
        return (
          onDecision?.() ??
          jsonResponse(
            caseEnvelope(caseFixture({ version: 4, status: 'under_review' })),
          )
        );
      throw new Error(`Unexpected request: ${url.pathname}`);
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

function decisionBody(fetchMock: ReturnType<typeof vi.fn>) {
  const request = decisionRequests(fetchMock)[0];
  if (!request) throw new Error('Expected a trust decision request.');
  return JSON.parse(String(request[1]?.body)) as unknown;
}

function queuePayload(items: TrustCaseQueueItem[]) {
  return {
    items,
    page: 1,
    pageSize: 20,
    requestId: 'request-queue',
    totalItems: items.length,
    totalPages: items.length ? 1 : 0,
  };
}

function queueFixture(detail: TrustCaseDetail): TrustCaseQueueItem {
  return {
    activeRestrictionCount: detail.activeRestrictionCount,
    activeRestrictionScopes:
      detail.activeRestrictionCount > 0 ? ['new_competitive_match_hold'] : [],
    band: detail.band,
    canReview: detail.canReview,
    caseId: detail.caseId,
    latestRestrictionExpiry: detail.latestRestrictionExpiry,
    openedAt: detail.openedAt,
    playerId: detail.playerId,
    playerName: detail.playerName,
    policyVersion: detail.policyVersion,
    restrictionCount: detail.restrictionCount,
    score: detail.score,
    signalTypes: detail.evidencePreview.map((item) => item.signalType),
    status: detail.status,
    updatedAt: detail.updatedAt,
    version: detail.version,
  };
}

function caseEnvelope(detail: TrustCaseDetail) {
  return { case: detail, requestId: 'request-case' };
}

function caseFixture(
  overrides: Partial<TrustCaseDetail> = {},
): TrustCaseDetail {
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
    evidence: [
      {
        basePoints: 25,
        decayState: 'active',
        effectivePoints: 21,
        evidenceId,
        expiresAt: '2026-09-27T09:00:00.000Z',
        observedAt: '2026-09-25T09:00:00.000Z',
        opponentPattern: null,
        policyVersion: 'trust-v1',
        reviewedFalsePositive: false,
        safeSourceType: 'movement check',
        severity: 'high',
        signalType: 'impossible_movement',
        state: 'active',
      },
    ],
    evidencePreview: [
      {
        basePoints: 25,
        decayState: 'active',
        effectivePoints: 21,
        evidenceId,
        expiresAt: '2026-09-27T09:00:00.000Z',
        observedAt: '2026-09-25T09:00:00.000Z',
        opponentPattern: null,
        policyVersion: 'trust-v1',
        reviewedFalsePositive: false,
        safeSourceType: 'movement check',
        severity: 'high',
        signalType: 'impossible_movement',
        state: 'active',
      },
    ],
    evidenceTotalItems: 1,
    evidenceTruncated: false,
    history: [
      {
        action: 'case_opened',
        actorPlayerId: null,
        actorPlayerName: null,
        actorType: 'system',
        caseVersionAfter: 1,
        caseVersionBefore: 0,
        decisionId,
        decisionType: 'initial_review_opened',
        evidenceIds: [evidenceId],
        falsePositiveEvidenceIds: [],
        occurredAt: '2026-09-25T09:00:00.000Z',
        policyVersion: 'trust-v1',
        previousStatus: null,
        reasonCode: 'threshold_reached',
        reasonNote: null,
        restrictions: [],
        resultingStatus: 'open',
        versionAfter: 1,
        versionBefore: 0,
      },
    ],
    historyTruncated: false,
    latestRestrictionExpiry: null,
    openedAt: '2026-09-25T09:00:00.000Z',
    playerId,
    playerName: 'Casey Reviewer',
    policyVersion: 'trust-v1',
    recentHistory: [
      {
        action: 'case_opened',
        actorPlayerId: null,
        actorPlayerName: null,
        actorType: 'system',
        caseVersionAfter: 1,
        caseVersionBefore: 0,
        decisionId,
        decisionType: 'initial_review_opened',
        evidenceIds: [evidenceId],
        falsePositiveEvidenceIds: [],
        occurredAt: '2026-09-25T09:00:00.000Z',
        policyVersion: 'trust-v1',
        previousStatus: null,
        reasonCode: 'threshold_reached',
        reasonNote: null,
        restrictions: [],
        resultingStatus: 'open',
        versionAfter: 1,
        versionBefore: 0,
      },
    ],
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

function pagePayload<T>(
  items: T[],
  options: {
    includeRequestId?: boolean;
    page?: number;
    pageSize?: number;
    totalItems?: number;
    totalPages?: number;
  } = {},
) {
  const totalItems = options.totalItems ?? items.length;
  return {
    items,
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 20,
    ...(options.includeRequestId === false
      ? {}
      : { requestId: 'request-page' }),
    totalItems,
    totalPages:
      options.totalPages ??
      (totalItems ? Math.ceil(totalItems / (options.pageSize ?? 20)) : 0),
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
    { headers: { 'Content-Type': 'application/problem+json' }, status },
  );
}

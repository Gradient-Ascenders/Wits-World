import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TrustCaseDetail } from '../src/api/author';
import { TrustReviewWorkspace } from '../src/components/author/TrustReviewWorkspace';

const apiBaseUrl = 'https://api.example.test/api/v1';
const caseId = '10000000-0000-4000-8000-000000000001';
const playerId = '20000000-0000-4000-8000-000000000001';
const evidenceId = '30000000-0000-4000-8000-000000000001';
const decisionId = '40000000-0000-4000-8000-000000000001';

afterEach(() => vi.unstubAllGlobals());

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
          queuePayload(requests.length === 1 ? [caseFixture()] : []),
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
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('No cases match this view.')).toBeVisible();
    const latest = requests.at(-1)!;
    expect(latest.searchParams.get('search')).toBe('casey');
    expect(latest.searchParams.get('status')).toBe('resolved');
    expect(latest.searchParams.get('band')).toBe('urgent_review');
  });

  it('shows server-provided score categories, severity text, signals, and audit history', async () => {
    installCaseApi();
    renderWorkspace(caseId);

    expect(
      await screen.findByRole('heading', { name: 'Casey Reviewer' }),
    ).toBeVisible();
    expect(screen.getAllByText('Urgent Review')).toHaveLength(2);
    expect(screen.getByText('High')).toBeVisible();
    expect(screen.getByText('Impossible movement')).toBeVisible();
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
    const fetchMock = installCaseApi();
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
      name: 'Apply temporary player restriction?',
    });
    expect(decisionRequests(fetchMock)).toHaveLength(0);
    expect(
      within(dialog).getByText('Pause new competitive matches'),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: 'Go back' }),
    ).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(reviewButton).toHaveFocus();

    await user.click(reviewButton);
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Apply restriction',
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
    await user.click(
      screen.getByRole('button', { name: 'Review latest case' }),
    );
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
  onDecision,
  onDetail,
}: {
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
        return jsonResponse(queuePayload([caseFixture()]));
      if (
        url.pathname.endsWith(`/author/trust-cases/${caseId}`) &&
        init?.method === 'GET'
      )
        return onDetail?.() ?? jsonResponse(caseEnvelope(caseFixture()));
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

function queuePayload(items: TrustCaseDetail[]) {
  return {
    items,
    page: 1,
    pageSize: 20,
    requestId: 'request-queue',
    totalItems: items.length,
    totalPages: items.length ? 1 : 0,
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
    band: 'urgent_review',
    canReview: true,
    caseId,
    evidence: [
      {
        basePoints: 25,
        effectivePoints: 21,
        evidenceId,
        expiresAt: '2026-09-27T09:00:00.000Z',
        observedAt: '2026-09-25T09:00:00.000Z',
        policyVersion: 'trust-v1',
        safeSourceType: 'movement check',
        severity: 'high',
        signalType: 'impossible_movement',
        state: 'active',
      },
    ],
    history: [
      {
        actorPlayerId: null,
        actorPlayerName: null,
        actorType: 'system',
        caseVersionAfter: 1,
        caseVersionBefore: 0,
        decisionId,
        decisionType: 'initial_review_opened',
        evidenceIds: [evidenceId],
        occurredAt: '2026-09-25T09:00:00.000Z',
        policyVersion: 'trust-v1',
        previousStatus: null,
        reasonCode: 'threshold_reached',
        reasonNote: null,
        restrictions: [],
        resultingStatus: 'open',
      },
    ],
    latestRestrictionExpiry: null,
    openedAt: '2026-09-25T09:00:00.000Z',
    playerId,
    playerName: 'Casey Reviewer',
    policyVersion: 'trust-v1',
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
    updatedAt: '2026-09-25T09:00:00.000Z',
    version: 3,
    ...overrides,
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

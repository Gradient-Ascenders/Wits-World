import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthorCampaign } from '../src/api/author';
import { AuthorHistoryPanel } from '../src/components/author/AuthorHistoryPanel';
import { CampaignWorkspace } from '../src/components/author/CampaignWorkspace';
import { ReviewWorkspace } from '../src/components/author/ReviewWorkspace';
import { authorPaths } from '../src/components/author/author-routing';

const apiBaseUrl = 'https://api.example.test/api/v1';
const getAccessToken = vi.fn().mockResolvedValue('author-access-token');
const eventId = '10000000-0000-4000-8000-000000000001';
const challengeId = '20000000-0000-4000-8000-000000000001';
const questionId = '40000000-0000-4000-8000-000000000001';
const campaignId = '70000000-0000-4000-8000-000000000001';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Author curation workspaces', () => {
  it('distinguishes an expired review session and recovers to an empty queue', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        problemResponse(401, 'UNAUTHORIZED', 'Sign in again to continue.'),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [],
          page: 1,
          pageSize: 20,
          requestId: 'request-empty',
          totalItems: 0,
          totalPages: 0,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ReviewWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
      />,
    );

    expect(
      await screen.findByText('Your session needs attention.'),
    ).toBeVisible();
    expect(screen.getByText('Sign in again to continue.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry queue' }));
    expect(
      await screen.findByText('No submissions are waiting.'),
    ).toBeVisible();
    expect(screen.getByText('The review queue is clear.')).toBeVisible();
  });

  it('loads review history only when the keyboard-accessible disclosure opens', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            action: 'return',
            actorPlayerId: '90000000-0000-4000-8000-000000000003',
            actorPlayerName: 'Review Author',
            auditId: '80000000-0000-4000-8000-000000000001',
            fromStatus: 'in_review',
            note: 'Clarify the clue.',
            occurredAt: '2026-08-29T09:00:00.000Z',
            resultingVersion: 3,
            toStatus: 'draft',
          },
        ],
        page: 1,
        pageSize: 10,
        requestId: 'request-history',
        totalItems: 1,
        totalPages: 1,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthorHistoryPanel
        apiBaseUrl={apiBaseUrl}
        entityId={questionId}
        entityType="question"
        getAccessToken={getAccessToken}
      />,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByText('Review history'));
    expect(await screen.findByText('Return: in review to draft')).toBeVisible();
    expect(screen.getByText('Clarify the clue.')).toBeVisible();
  });

  it('links a queued question to its nested review workflow without summary actions', async () => {
    const queueItem = {
      canReview: true,
      challengeId,
      entityId: questionId,
      entityType: 'question',
      eventId,
      label: 'Where is the Great Hall?',
      status: 'in_review',
      submittedAt: '2026-08-29T08:00:00.000Z',
      submittedBy: '90000000-0000-4000-8000-000000000002',
      submittedByName: 'Other Author',
      version: 2,
    } as const;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname.replace('/api/v1', '');
      if (path === '/author/review-queue')
        return jsonResponse({
          items: [queueItem],
          page: 1,
          pageSize: 20,
          requestId: 'request-queue',
          totalItems: 1,
          totalPages: 1,
        });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ReviewWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
      />,
    );

    const editLink = await screen.findByRole('link', {
      name: 'Review question',
    });
    expect(editLink).toHaveAttribute(
      'href',
      authorPaths.question(eventId, challengeId, questionId),
    );
    expect(
      screen.queryByRole('button', { name: 'Approve question' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Return with reason' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the independent-review message for a self-authored queue item', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              canReview: false,
              challengeId,
              entityId: questionId,
              entityType: 'question',
              eventId,
              label: 'Where is the Great Hall?',
              status: 'in_review',
              submittedAt: '2026-08-29T08:00:00.000Z',
              submittedBy: '90000000-0000-4000-8000-000000000001',
              submittedByName: 'Current Author',
              version: 2,
            },
          ],
          page: 1,
          pageSize: 20,
          requestId: 'request-self-queue',
          totalItems: 1,
          totalPages: 1,
        }),
      ),
    );

    render(
      <ReviewWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
      />,
    );

    expect(
      await screen.findByText(
        'This submission is awaiting review by another Author. Self-approval is not available.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open question' })).toHaveAttribute(
      'href',
      authorPaths.question(eventId, challengeId, questionId),
    );
  });

  it('creates a scheduled campaign with selected event membership', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const created = campaignFixture();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname.replace('/api/v1', '');
        if (path === '/author/campaigns' && init?.method === 'GET')
          return jsonResponse({
            campaigns: [],
            requestId: 'request-campaigns',
          });
        if (path === '/author/events')
          return jsonResponse({
            events: [eventFixture()],
            requestId: 'request-events',
          });
        if (path === '/author/trails')
          return jsonResponse({ requestId: 'request-trails', trails: [] });
        if (path === '/author/campaigns' && init?.method === 'POST') {
          expect(JSON.parse(String(init.body))).toMatchObject({
            eventIds: [eventId],
            title: 'Welcome Week',
            trailIds: [],
            startsAt: '2026-09-01T06:00:00.000Z',
            endsAt: '2026-09-05T16:00:00.000Z',
          });
          return jsonResponse(
            { campaign: created, requestId: 'request-create' },
            201,
          );
        }
        throw new Error(`Unexpected request: ${path}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CampaignWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
        navigate={navigate}
        route={{ mode: 'new', section: 'campaigns' }}
      />,
    );

    await user.type(await screen.findByLabelText('Title'), 'Welcome Week');
    fireEvent.change(screen.getByLabelText('Starts'), {
      target: { value: '2026-09-01T08:00' },
    });
    fireEvent.change(screen.getByLabelText('Ends'), {
      target: { value: '2026-09-05T18:00' },
    });
    await user.click(
      screen.getByRole('checkbox', { name: /Great Hall history/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Create campaign' }));

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(authorPaths.campaign(campaignId)),
    );
  });

  it('searches and pages campaign members without losing selections', async () => {
    const user = userEvent.setup();
    const events = Array.from({ length: 12 }, (_, index) => ({
      ...eventFixture(),
      eventId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      title: `Event ${String(index + 1).padStart(2, '0')}`,
    }));
    const trails = Array.from({ length: 12 }, (_, index) => ({
      createdAt: '2026-08-16T08:00:00.000Z',
      description: null,
      publishedAt: null,
      retiredAt: null,
      status: 'draft',
      steps: [],
      title: `Trail ${String(index + 1).padStart(2, '0')}`,
      trailId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      updatedAt: '2026-08-16T08:00:00.000Z',
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname.replace('/api/v1', '');
        if (path === '/author/campaigns' && init?.method === 'GET')
          return jsonResponse({ campaigns: [], requestId: 'campaigns' });
        if (path === '/author/events')
          return jsonResponse({ events, requestId: 'events' });
        if (path === '/author/trails')
          return jsonResponse({ trails, requestId: 'trails' });
        if (path === '/author/campaigns' && init?.method === 'POST') {
          expect(JSON.parse(String(init.body))).toMatchObject({
            eventIds: [events[0]!.eventId, events[10]!.eventId],
            trailIds: [trails[10]!.trailId],
          });
          return jsonResponse(
            { campaign: campaignFixture(), requestId: 'created' },
            201,
          );
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );

    const navigate = vi.fn();
    render(
      <CampaignWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
        navigate={navigate}
        route={{ mode: 'new', section: 'campaigns' }}
      />,
    );

    const eventFieldset = await screen.findByRole('group', { name: 'Events' });
    const trailFieldset = screen.getByRole('group', { name: 'Trails' });
    await user.click(
      within(eventFieldset).getByRole('checkbox', { name: /Event 01/ }),
    );
    expect(
      within(eventFieldset).queryByText('Event 11'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next events page' }));
    await user.click(
      within(eventFieldset).getByRole('checkbox', { name: /Event 11/ }),
    );
    await user.type(
      screen.getByRole('searchbox', { name: 'Search events' }),
      'event 01',
    );
    expect(
      within(eventFieldset).getByRole('checkbox', { name: /Event 01/ }),
    ).toBeChecked();
    expect(
      within(eventFieldset).queryByText('Event 11'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next trails page' }));
    await user.click(
      within(trailFieldset).getByRole('checkbox', { name: /Trail 11/ }),
    );
    await user.type(
      screen.getByRole('searchbox', { name: 'Search trails' }),
      'missing',
    );
    expect(
      within(trailFieldset).getByText('No matching trails.'),
    ).toBeVisible();

    await user.type(screen.getByLabelText('Title'), 'Welcome Week');
    fireEvent.change(screen.getByLabelText('Starts'), {
      target: { value: '2026-09-01T08:00' },
    });
    fireEvent.change(screen.getByLabelText('Ends'), {
      target: { value: '2026-09-05T18:00' },
    });
    await user.click(screen.getByRole('button', { name: 'Create campaign' }));
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(authorPaths.campaign(campaignId)),
    );
  });

  it('preserves a campaign edit when the server reports a stale version', async () => {
    const user = userEvent.setup();
    const campaign = campaignFixture();
    const serverCampaign = campaignFixture({
      title: 'Welcome Week from server',
      version: 1,
    });
    let campaignLoads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname.replace('/api/v1', '');
        if (path === '/author/campaigns' && init?.method === 'GET') {
          campaignLoads += 1;
          return jsonResponse({
            campaigns: [campaignLoads === 1 ? campaign : serverCampaign],
            requestId: 'request-campaigns',
          });
        }
        if (path === '/author/events')
          return jsonResponse({
            events: [eventFixture()],
            requestId: 'request-events',
          });
        if (path === '/author/trails')
          return jsonResponse({ requestId: 'request-trails', trails: [] });
        if (
          path === `/author/campaigns/${campaignId}` &&
          init?.method === 'PUT'
        )
          return problemResponse(
            409,
            'STALE_CONTENT_VERSION',
            'Campaign changed on the server.',
          );
        throw new Error(`Unexpected request: ${path}`);
      }),
    );

    render(
      <CampaignWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
        navigate={vi.fn()}
        route={{ campaignId, mode: 'edit', section: 'campaigns' }}
      />,
    );

    const title = await screen.findByLabelText('Title');
    expect(screen.getByLabelText('Starts')).toHaveValue('2026-09-01T08:00');
    expect(screen.getByLabelText('Ends')).toHaveValue('2026-09-05T18:00');
    await user.clear(title);
    await user.type(title, 'Welcome Week revised');
    await user.click(screen.getByRole('button', { name: 'Save campaign' }));

    expect(
      await screen.findByText('Your form has been preserved.'),
    ).toBeVisible();
    expect(title).toHaveValue('Welcome Week revised');
    expect(
      screen.getByRole('button', { name: 'Save campaign' }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole('button', { name: 'Reload server version' }),
    );
    let dialog = screen.getByRole('dialog', {
      name: 'Reload the server campaign?',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Keep local draft' }),
    );
    expect(title).toHaveValue('Welcome Week revised');

    await user.click(
      screen.getByRole('button', { name: 'Reload server version' }),
    );
    dialog = screen.getByRole('dialog', {
      name: 'Reload the server campaign?',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Reload server version' }),
    );
    expect(await screen.findByLabelText('Title')).toHaveValue(
      'Welcome Week from server',
    );
    expect(campaignLoads).toBe(2);
  });

  it('refreshes authoritative campaign state after a lifecycle state conflict', async () => {
    const user = userEvent.setup();
    const draft = campaignFixture();
    const serverCampaign = campaignFixture({
      status: 'in_review',
      submittedAt: '2026-08-30T10:00:00.000Z',
      submittedBy: '90000000-0000-4000-8000-000000000002',
      version: 1,
    });
    let campaignLoads = 0;
    const refresh = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname.replace('/api/v1', '');
        if (path === '/author/campaigns' && init?.method === 'GET') {
          campaignLoads += 1;
          if (campaignLoads === 2) return refresh.promise;
          return jsonResponse({
            campaigns: [draft],
            requestId: `request-campaigns-${campaignLoads}`,
          });
        }
        if (path === '/author/events')
          return jsonResponse({
            events: [eventFixture()],
            requestId: 'events',
          });
        if (path === '/author/trails')
          return jsonResponse({ requestId: 'trails', trails: [] });
        if (path === `/author/campaigns/${campaignId}/submit`)
          return problemResponse(
            409,
            'CONTENT_STATE_CONFLICT',
            'Campaign is already in review.',
          );
        throw new Error(`Unexpected request: ${path}`);
      }),
    );

    render(
      <CampaignWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
        navigate={vi.fn()}
        route={{ campaignId, mode: 'detail', section: 'campaigns' }}
      />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Submit for review' }),
    );
    expect(
      await screen.findByText('Loading campaigns and available members…'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Submit for review' }),
    ).not.toBeInTheDocument();
    refresh.resolve(
      jsonResponse({
        campaigns: [serverCampaign],
        requestId: 'request-campaigns-2',
      }),
    );
    expect(
      await screen.findByText(
        'The campaign changed on the server. Its authoritative state was reloaded.',
      ),
    ).toBeVisible();
    expect(campaignLoads).toBe(2);
    expect(
      screen.queryByRole('button', { name: 'Submit for review' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('In Review').length).toBeGreaterThan(0);
  });

  it('uses the lifecycle state returned by the server for success feedback', async () => {
    const user = userEvent.setup();
    const campaign = campaignFixture();
    const serverCampaign = campaignFixture({ status: 'approved', version: 2 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname.replace('/api/v1', '');
        if (path === '/author/campaigns' && init?.method === 'GET')
          return jsonResponse({
            campaigns: [campaign],
            requestId: 'campaigns',
          });
        if (path === '/author/events')
          return jsonResponse({
            events: [eventFixture()],
            requestId: 'events',
          });
        if (path === '/author/trails')
          return jsonResponse({ requestId: 'trails', trails: [] });
        if (path === `/author/campaigns/${campaignId}/submit`)
          return jsonResponse({
            campaign: serverCampaign,
            requestId: 'server-lifecycle',
          });
        throw new Error(`Unexpected request: ${path}`);
      }),
    );

    render(
      <CampaignWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
        navigate={vi.fn()}
        route={{ campaignId, mode: 'detail', section: 'campaigns' }}
      />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Submit for review' }),
    );
    expect(await screen.findByText('Campaign approved.')).toBeVisible();
    expect(
      screen.queryByText('Campaign submitted for independent review.'),
    ).not.toBeInTheDocument();
  });

  it.each(['in_review', 'approved', 'published', 'retired'] as const)(
    'does not expose the campaign form from a deep-linked %s edit route',
    async (status) => {
      const campaign = campaignFixture({ status, version: 2 });
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = new URL(String(input)).pathname.replace('/api/v1', '');
          if (path === '/author/campaigns' && init?.method === 'GET')
            return jsonResponse({
              campaigns: [campaign],
              requestId: 'campaigns',
            });
          if (path === '/author/events')
            return jsonResponse({
              events: [eventFixture()],
              requestId: 'events',
            });
          if (path === '/author/trails')
            return jsonResponse({ requestId: 'trails', trails: [] });
          throw new Error(`Unexpected request: ${path}`);
        }),
      );

      render(
        <CampaignWorkspace
          apiBaseUrl={apiBaseUrl}
          getAccessToken={getAccessToken}
          navigate={vi.fn()}
          route={{ campaignId, mode: 'edit', section: 'campaigns' }}
        />,
      );

      expect(
        await screen.findByText('This campaign is no longer editable.'),
      ).toBeVisible();
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Save campaign' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Return to campaign detail' }),
      ).toHaveAttribute('href', authorPaths.campaign(campaignId));
      expect(screen.getAllByText(titleCase(status)).length).toBeGreaterThan(0);
    },
  );

  it('requires confirmation before retiring a published campaign', async () => {
    const user = userEvent.setup();
    const published = campaignFixture({
      publicationProvenance: 'reviewed',
      publishedAt: '2026-08-20T10:00:00.000Z',
      status: 'published',
      version: 4,
    });
    const retired = {
      ...published,
      retiredAt: '2026-08-30T10:00:00.000Z',
      status: 'retired' as const,
      version: 5,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname.replace('/api/v1', '');
        if (path === '/author/campaigns' && init?.method === 'GET')
          return jsonResponse({
            campaigns: [published],
            requestId: 'request-campaigns',
          });
        if (path === '/author/events')
          return jsonResponse({
            events: [eventFixture()],
            requestId: 'request-events',
          });
        if (path === '/author/trails')
          return jsonResponse({ requestId: 'request-trails', trails: [] });
        if (path === `/author/campaigns/${campaignId}/retire`) {
          expect(init?.body).toBe(JSON.stringify({ expectedVersion: 4 }));
          return jsonResponse({
            campaign: retired,
            requestId: 'request-retire',
          });
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );

    render(
      <CampaignWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
        navigate={vi.fn()}
        route={{ campaignId, mode: 'detail', section: 'campaigns' }}
      />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Retire campaign' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Retire Welcome Week?',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Retire campaign' }),
    );
    expect(await screen.findByText(/Campaign retired/u)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Retire campaign' }),
    ).not.toBeInTheDocument();
  });
});

function eventFixture() {
  return {
    automaticPlacement: false,
    authoringStatus: 'published',
    createdAt: '2026-08-16T08:00:00.000Z',
    description: 'East Campus history.',
    endsAt: '2026-09-03T16:00:00.000Z',
    eventId,
    isPublished: true,
    latitude: -26.19205,
    longitude: 28.03038,
    publicationProvenance: 'reviewed',
    radiusMetres: 75,
    retiredAt: null,
    reviewedAt: '2026-08-17T08:00:00.000Z',
    reviewedBy: '90000000-0000-4000-8000-000000000003',
    startsAt: '2026-09-01T08:00:00.000Z',
    submittedAt: '2026-08-16T09:00:00.000Z',
    submittedBy: '90000000-0000-4000-8000-000000000002',
    title: 'Great Hall history',
    updatedAt: '2026-08-17T08:00:00.000Z',
    version: 3,
  } as const;
}

function campaignFixture(
  overrides: Partial<AuthorCampaign> = {},
): AuthorCampaign {
  return {
    campaignId,
    createdAt: '2026-08-16T08:00:00.000Z',
    description: 'Orientation schedule.',
    endsAt: '2026-09-05T16:00:00.000Z',
    events: [eventFixture()],
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

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function problemResponse(status: number, code: string, detail: string) {
  return jsonResponse(
    {
      code,
      detail,
      requestId: 'request-error',
      status,
      title: 'Conflict',
      type: 'about:blank',
    },
    status,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function titleCase(value: string) {
  return value
    .replace('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AuthorCampaign,
  AuthorCard,
  AuthorEvent,
} from '../src/api/author';
import { CampaignWorkspace } from '../src/components/author/CampaignWorkspace';
import { CardWorkspace } from '../src/components/author/CardWorkspace';
import { EventWorkspace } from '../src/components/author/EventWorkspace';
import { AuthorMutationCoordinator } from '../src/components/author/author-mutation-coordinator';
import { selectOption } from './fixtures/select-option';

const apiBaseUrl = 'https://api.example.test/api/v1';
const eventId = '10000000-0000-4000-8000-000000000001';
const campaignId = '70000000-0000-4000-8000-000000000001';
const token = vi.fn().mockResolvedValue('author-access-token');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('author workflow uncovered regressions', () => {
  it('recovers from a missing campaign dependency and keeps the editor available', async () => {
    const user = userEvent.setup();
    let eventReads = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname.replace('/api/v1', '');
      if (path === '/author/campaigns')
        return response({ campaigns: [], requestId: 'campaigns' });
      if (path === '/author/events') {
        eventReads += 1;
        return eventReads === 1
          ? problem(503, 'CONTENT_UNAVAILABLE', 'Events unavailable')
          : response({ events: [eventFixture()], requestId: 'events' });
      }
      if (path === '/author/trails')
        return response({ trails: [], requestId: 'trails' });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CampaignWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={token}
        navigate={vi.fn()}
        route={{ mode: 'new', section: 'campaigns' }}
      />,
    );

    expect(await screen.findByText('Campaigns are unavailable.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reload campaigns' }));
    expect(await screen.findByLabelText('Campaign title')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Add content' }));
    await selectOption(user, screen.getByLabelText('Lifecycle'), 'all');
    expect(
      await screen.findByRole('checkbox', { name: /Great Hall history/ }),
    ).toBeVisible();
    expect(token).toHaveBeenCalled();
  });

  it('does not replace the event catalogue with an empty state after an unavailable read', async () => {
    const user = userEvent.setup();
    let reads = 0;
    const fetchMock = vi.fn(async () => {
      reads += 1;
      return reads === 1
        ? problem(503, 'CONTENT_UNAVAILABLE', 'Events unavailable')
        : response({ events: [eventFixture()], requestId: 'events' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const props = {
      apiBaseUrl,
      cards: [],
      cardsState: 'ready' as const,
      getAccessToken: token,
      mapboxAccessToken: 'pk.test-token',
      mutationCoordinator: new AuthorMutationCoordinator(),
      navigate: vi.fn(),
      onOpenCards: vi.fn(),
      onReloadCards: vi.fn(),
      route: { mode: 'list' as const, section: 'events' as const },
    };

    render(<EventWorkspace {...props} />);
    expect(await screen.findByText('Events are unavailable.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Great Hall history')).toBeVisible();
    expect(screen.queryByText(/no events/i)).not.toBeInTheDocument();
  });

  it('keeps card catalogue retry separate from an authoritative empty catalogue', async () => {
    const user = userEvent.setup();
    const onReload = vi.fn().mockResolvedValue(undefined);
    const coordinator = new AuthorMutationCoordinator();
    const props = {
      apiBaseUrl,
      cards: [] as AuthorCard[],
      errorMessage: 'The card catalogue is unavailable.',
      getAccessToken: token,
      mutationCoordinator: coordinator,
      navigate: vi.fn(),
      onCardsChange: vi.fn(),
      onReload,
      route: { mode: 'list' as const, section: 'cards' as const },
    };
    const view = render(<CardWorkspace {...props} state="error" />);

    expect(screen.getByText('Cards are unavailable.')).toBeVisible();
    expect(
      screen.queryByText('No card definitions yet'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onReload).toHaveBeenCalledOnce();

    view.rerender(<CardWorkspace {...props} state="ready" confirmed />);
    expect(screen.getByText('No card definitions yet')).toBeVisible();
    expect(screen.getByRole('link', { name: 'New card' })).toBeVisible();
  });

  it('preserves campaign edits and retries with the authoritative version after a conflict', async () => {
    const user = userEvent.setup();
    let campaignReads = 0;
    let writes = 0;
    const saved: AuthorCampaign = campaignFixture({ version: 5 });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname.replace('/api/v1', '');
        if (path === '/author/campaigns' && init?.method === 'GET') {
          campaignReads += 1;
          return response({
            campaigns: [
              campaignFixture({ version: campaignReads > 1 ? 5 : 4 }),
            ],
            requestId: 'campaigns',
          });
        }
        if (path === '/author/events')
          return response({ events: [eventFixture()], requestId: 'events' });
        if (path === '/author/trails')
          return response({ trails: [], requestId: 'trails' });
        if (
          path === `/author/campaigns/${campaignId}` &&
          init?.method === 'PUT'
        ) {
          writes += 1;
          const body = JSON.parse(String(init.body));
          if (writes === 1) {
            expect(body.expectedVersion).toBe(4);
            return problem(409, 'STALE_CONTENT_VERSION', 'Campaign changed');
          }
          expect(body.expectedVersion).toBe(5);
          expect(body.title).toBe('Locally retained title');
          return response({
            campaign: { ...saved, ...body },
            requestId: 'saved',
          });
        }
        throw new Error(`Unexpected request: ${path}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const navigate = vi.fn();

    render(
      <CampaignWorkspace
        apiBaseUrl={apiBaseUrl}
        getAccessToken={token}
        navigate={navigate}
        route={{ campaignId, mode: 'edit', section: 'campaigns' }}
      />,
    );

    const title = await screen.findByLabelText('Campaign title');
    await user.clear(title);
    await user.type(title, 'Locally retained title');
    await user.click(screen.getByRole('button', { name: 'Save campaign' }));
    expect(
      await screen.findByText('Your form has been preserved.'),
    ).toBeVisible();
    expect(title).toHaveValue('Locally retained title');
    await user.click(
      screen.getByRole('button', { name: 'Reload server version' }),
    );
    const reloadDialog = screen.getByRole('dialog');
    await user.click(
      within(reloadDialog).getByRole('button', {
        name: 'Reload server version',
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Campaign title')).toHaveValue(
        'Welcome Week',
      ),
    );
    const reloadedTitle = screen.getByLabelText('Campaign title');
    await user.clear(reloadedTitle);
    await user.type(reloadedTitle, 'Locally retained title');
    await user.click(screen.getByRole('button', { name: 'Save campaign' }));
    await waitFor(() => expect(writes).toBe(2));
    expect(token).toHaveBeenCalled();
  });
});

function eventFixture(): AuthorEvent {
  return {
    automaticPlacement: false,
    authoringStatus: 'draft',
    createdAt: '2026-08-16T08:00:00.000Z',
    description: 'East Campus history.',
    endsAt: '2026-09-03T16:00:00.000Z',
    eventId,
    isPublished: false,
    latitude: -26.19205,
    longitude: 28.03038,
    publicationProvenance: null,
    radiusMetres: 75,
    retiredAt: null,
    reviewedAt: null,
    reviewedBy: null,
    sourceUrls: [],
    startsAt: '2026-09-01T08:00:00.000Z',
    submittedAt: null,
    submittedBy: null,
    title: 'Great Hall history',
    updatedAt: '2026-08-16T08:00:00.000Z',
    version: 3,
  };
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

function response(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function problem(status: number, code: string, detail: string): Response {
  return response(
    {
      code,
      detail,
      requestId: 'coverage-request',
      status,
      title: 'Unavailable',
      type: 'about:blank',
    },
    status,
  );
}

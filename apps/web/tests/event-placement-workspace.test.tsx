import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthorPlacementState } from '../src/api/author';
import { EventPlacementWorkspace } from '../src/components/author/EventPlacementWorkspace';
import type {
  MapController,
  MapFactory,
} from '../src/components/exploration/map-provider';

const apiBaseUrl = 'https://api.example.test/api/v1';
const zoneEast = '10000000-0000-4000-8000-000000000001';
const zoneWest = '10000000-0000-4000-8000-000000000002';
const siteHall = '20000000-0000-4000-8000-000000000001';
const siteLibrary = '20000000-0000-4000-8000-000000000002';
const eventHistory = '30000000-0000-4000-8000-000000000001';
const eventLibrary = '30000000-0000-4000-8000-000000000002';
const planId = '40000000-0000-4000-8000-000000000001';
const oldPlanId = '40000000-0000-4000-8000-000000000002';
const overrideId = '50000000-0000-4000-8000-000000000001';

afterEach(() => vi.unstubAllGlobals());

describe('author event-placement workspace', () => {
  it('stages the ledger, tabs, map focus, and preview as one review flow', async () => {
    const user = userEvent.setup();
    const controller = mapController();
    installPlacementApi();
    renderWorkspace(vi.fn(async () => controller));

    expect(
      await screen.findByRole('heading', { name: 'Event placement' }),
    ).toBeVisible();
    expect(
      screen.getByRole('table', {
        name: 'Current and proposed event placements',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('table', { name: 'Coverage zones' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Coverage & sites' }));
    expect(screen.getByRole('table', { name: 'Coverage zones' })).toBeVisible();
    expect(
      screen.getByRole('table', { name: 'Reviewed candidate sites' }),
    ).toBeVisible();
    await user.click(screen.getAllByRole('button', { name: 'Locate' })[1]!);
    await waitFor(() => expect(controller.focusPoint).toHaveBeenCalled());
    await waitFor(() =>
      expect(controller.setAreas).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: zoneEast, state: 'shortfall' }),
        ]),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Create preview' }));
    expect(await screen.findByText('Review exceptions')).toBeVisible();
    expect(
      screen.getByText('Every active zone meets minimum coverage.'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Review and apply' }),
    ).toHaveFocus();
    expect(
      within(
        screen.getByRole('table', {
          name: 'Current and proposed event placements',
        }),
      ).getByText('Move'),
    ).toBeVisible();
    await waitFor(() =>
      expect(controller.setPoints).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: siteLibrary,
            placementStates: expect.arrayContaining(['proposed', 'excluded']),
          }),
        ]),
      ),
    );
  });

  it('requires a contextual confirmation reason for every placement mutation', async () => {
    const user = userEvent.setup();
    const fetchMock = installPlacementApi();
    renderWorkspace();
    await screen.findByText('Placement needs attention');

    await user.click(screen.getByRole('button', { name: 'Create preview' }));
    await screen.findByText('Review exceptions');
    await user.click(screen.getByRole('button', { name: 'Review and apply' }));
    expect(postedPaths(fetchMock)).not.toContain(
      '/author/event-placement/apply',
    );
    let dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByLabelText('Reason for this change'),
      'Reviewed operational change',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Apply placement plan' }),
    );
    await screen.findByText(/Placement plan applied/u);

    await user.click(screen.getByRole('tab', { name: 'Manual controls' }));
    await user.click(screen.getByRole('button', { name: 'Review override' }));
    dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Pause automatic placement?');
    await confirmDialog(
      user,
      dialog,
      'Temporary operations window',
      'Pause automation',
    );

    await user.selectOptions(screen.getByLabelText('Override type'), 'pin');
    await user.click(screen.getByRole('button', { name: 'Review override' }));
    dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Create this placement pin?');
    await confirmDialog(user, dialog, 'Pin review', 'Pin event');

    await user.selectOptions(screen.getByLabelText('Override type'), 'exclude');
    await user.click(screen.getByRole('button', { name: 'Review override' }));
    dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Exclude this site?');
    await confirmDialog(user, dialog, 'Site works', 'Exclude site');

    await user.click(screen.getByRole('button', { name: 'End override' }));
    dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('End this placement override?');
    await confirmDialog(user, dialog, 'End reviewed pin', 'End override');

    await user.click(screen.getByRole('tab', { name: 'Recent history' }));
    await user.click(screen.getByRole('button', { name: /Roll back/u }));
    dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Roll back to this placement?');
    await confirmDialog(
      user,
      dialog,
      'Restore prior plan',
      'Create and apply rollback',
    );

    await waitFor(() => {
      const paths = postedPaths(fetchMock);
      expect(paths).toEqual(
        expect.arrayContaining([
          '/author/event-placement/apply',
          '/author/event-placement/overrides',
          `/author/event-placement/overrides/${overrideId}/end`,
          '/author/event-placement/rollback',
        ]),
      );
    });
    expect(
      requestBodies(fetchMock, '/author/event-placement/overrides').map(
        (body) => body.kind,
      ),
    ).toEqual(['automation_pause', 'pin', 'site_exclusion']);
  }, 15_000);

  it('discards a stale preview and refreshes authoritative state after a conflict', async () => {
    const user = userEvent.setup();
    let stateVersion = 4;
    const fetchMock = installPlacementApi({
      applyResponse: () => {
        stateVersion = 5;
        return problemResponse(
          409,
          'STALE_PLACEMENT_STATE',
          'Placement state changed.',
        );
      },
      state: () => placementState(stateVersion),
    });
    renderWorkspace();
    await screen.findByText('Placement needs attention');
    await user.click(screen.getByRole('button', { name: 'Create preview' }));
    await screen.findByText('Review exceptions');
    await user.click(screen.getByRole('button', { name: 'Review and apply' }));
    await confirmDialog(
      user,
      screen.getByRole('dialog'),
      'Reviewed apply',
      'Apply placement plan',
    );

    expect(
      await screen.findByText(/Placement changed while you were reviewing it/u),
    ).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Coverage & sites' }));
    await user.click(screen.getByText('Technical details'));
    const technicalDetails = screen
      .getByText('Technical details')
      .closest('details')!;
    expect(within(technicalDetails).getByText('5')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Review and apply' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create preview' }),
    ).toBeVisible();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith('/author/event-placement'),
      ),
    ).toHaveLength(2);
  });

  it('does not claim authoritative success when the post-mutation refresh fails', async () => {
    const user = userEvent.setup();
    let stateAttempts = 0;
    installPlacementApi({
      state: () => {
        stateAttempts += 1;
        return stateAttempts === 1
          ? placementState()
          : problemResponse(
              503,
              'PLACEMENT_UNAVAILABLE',
              'Authoritative placement state could not be refreshed.',
            );
      },
    });
    renderWorkspace();
    await screen.findByText('Placement needs attention');
    await user.click(screen.getByRole('tab', { name: 'Manual controls' }));
    await user.click(screen.getByRole('button', { name: 'Review override' }));
    await confirmDialog(
      user,
      screen.getByRole('dialog'),
      'Operations pause',
      'Pause automation',
    );

    expect(await screen.findByText(/could not be refreshed/u)).toBeVisible();
    expect(
      screen.queryByText(/Automation paused.*authoritative/u),
    ).not.toBeInTheDocument();
  });

  it('keeps loading, retry, empty, keyboard, and map-failure paths usable', async () => {
    const user = userEvent.setup();
    let stateAttempts = 0;
    installPlacementApi({
      state: () => {
        stateAttempts += 1;
        if (stateAttempts === 1) {
          return problemResponse(
            503,
            'PLACEMENT_UNAVAILABLE',
            'Try again later.',
          );
        }
        return placementState(0, true);
      },
    });
    renderWorkspace(
      vi.fn(async () => {
        throw new Error('Expected map failure');
      }),
    );

    expect(screen.getByText('Loading event placement…')).toBeVisible();
    expect(
      await screen.findByText('Placement workspace unavailable'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByText(
        'No current or proposed portable-event assignments are available.',
      ),
    ).toBeVisible();
    expect(await screen.findByText('The map could not load.')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Recent history' }));
    expect(
      screen.getByText('No placement plans have been recorded yet.'),
    ).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Coverage & sites' }));
    expect(screen.getByRole('table', { name: 'Coverage zones' })).toBeVisible();

    const preview = screen.getByRole('button', { name: 'Create preview' });
    preview.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Review exceptions')).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Review and apply' }),
      ).toHaveFocus(),
    );
  });

  it('keeps history failures local and validates override duration before review', async () => {
    const user = userEvent.setup();
    installPlacementApi({
      history: () =>
        problemResponse(503, 'PLACEMENT_UNAVAILABLE', 'History is offline.'),
    });
    renderWorkspace();

    expect(await screen.findByText('Placement needs attention')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Create preview' }),
    ).toBeEnabled();
    await user.click(screen.getByRole('tab', { name: 'Recent history' }));
    expect(await screen.findByText('Recent history unavailable')).toBeVisible();
    expect(
      screen.getByText(/The service could not complete this request/u),
    ).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Manual controls' }));
    await user.clear(screen.getByLabelText('Duration in hours'));
    await user.type(screen.getByLabelText('Duration in hours'), '169');
    await user.click(screen.getByRole('button', { name: 'Review override' }));
    expect(
      screen.getByText('This override can last no more than 168 hours.'),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

async function confirmDialog(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  reason: string,
  confirmLabel: string,
) {
  await user.type(
    within(dialog).getByLabelText('Reason for this change'),
    reason,
  );
  await user.click(within(dialog).getByRole('button', { name: confirmLabel }));
}

function renderWorkspace(
  mapFactory: MapFactory = vi.fn(async () => mapController()),
) {
  return render(
    <EventPlacementWorkspace
      apiBaseUrl={apiBaseUrl}
      getAccessToken={vi.fn().mockResolvedValue('access-token')}
      mapboxAccessToken="pk.test"
      mapFactory={mapFactory}
    />,
  );
}

function mapController(): MapController {
  return {
    focusPoint: vi.fn(() => true),
    onError: vi.fn(),
    onLoad(listener) {
      listener();
    },
    remove: vi.fn(),
    setAreas: vi.fn(),
    setPointSelectionListener: vi.fn(),
    setPoints: vi.fn(),
    setReportedLocation: vi.fn(),
    setSelectedPoint: vi.fn(),
  };
}

function placementState(version = 4, empty = false): AuthorPlacementState {
  return {
    assignments: empty
      ? []
      : [
          {
            eventId: eventHistory,
            origin: 'automatic',
            siteId: siteHall,
            zoneId: zoneEast,
          },
        ],
    currentPlanId: empty ? null : planId,
    events: empty
      ? []
      : [
          { id: eventHistory, title: 'Campus history' },
          { id: eventLibrary, title: 'Library collection' },
        ],
    metrics: {
      activeAssignmentCount: empty ? 0 : 1,
      activeZoneCount: empty ? 0 : 2,
      lastAppliedAt: empty ? null : '2026-09-24T02:00:00.000Z',
      lastFailureAt: null,
      lastFailureCode: null,
      servedZoneCount: empty ? 0 : 1,
      targetAssignmentCount: 6,
      unservedZoneCount: empty ? 0 : 1,
    },
    nextRotationBoundary: '2026-09-26T02:00:00.000Z',
    overrides: empty
      ? []
      : [
          {
            eventId: eventLibrary,
            expiresAt: '2026-09-27T02:00:00.000Z',
            id: overrideId,
            kind: 'pin',
            siteId: siteLibrary,
          },
        ],
    policy: {
      cooldownBuckets: 2,
      id: 'placement-v1',
      mandatoryPerZone: 1,
      maximumExclusionHours: 720,
      maximumPauseHours: 168,
      maximumPinHours: 168,
      preferredPerZone: 2,
      previewTtlMinutes: 15,
      replacements: 2,
      rotationLocalTime: '04:00:00',
      rotationTimezone: 'Africa/Johannesburg',
      separationMetres: 150,
      target: 6,
    },
    policyVersion: 'placement-v1',
    rotationBucket: '2026-09-25',
    sites: empty
      ? []
      : [
          {
            excluded: false,
            id: siteHall,
            latitude: -26.1905,
            longitude: 28.0302,
            maximumRadiusMetres: 75,
            name: 'Great Hall',
            status: 'active',
            zoneId: zoneEast,
          },
          {
            excluded: true,
            id: siteLibrary,
            latitude: -26.192,
            longitude: 28.028,
            maximumRadiusMetres: 60,
            name: 'Wartenweiler Library',
            status: 'active',
            zoneId: zoneWest,
          },
        ],
    stateVersion: version,
    zones: empty
      ? []
      : [
          {
            geometry: polygon(28.029, -26.191),
            id: zoneEast,
            key: 'east',
            name: 'East Campus',
            status: 'active',
          },
          {
            geometry: polygon(28.026, -26.193),
            id: zoneWest,
            key: 'west',
            name: 'West Campus',
            status: 'active',
          },
        ],
  };
}

function polygon(longitude: number, latitude: number) {
  return {
    coordinates: [
      [
        [longitude, latitude],
        [longitude + 0.001, latitude],
        [longitude + 0.001, latitude + 0.001],
        [longitude, latitude],
      ],
    ],
    type: 'Polygon' as const,
  };
}

function previewPlan(stateVersion = 4) {
  return {
    entries: [
      {
        eventId: eventHistory,
        origin: 'automatic',
        siteId: siteLibrary,
        zoneId: zoneWest,
      },
    ],
    exceptions: ['preferred_coverage_shortfall'],
    planId,
    policyVersion: 'placement-v1',
    rotationBucket: '2026-09-25',
    stateVersion,
    status: 'degraded',
    validUntil: '2027-09-25T19:15:00.000Z',
    validation: {
      coverage: [
        {
          actual: 1,
          mandatory: 1,
          preferred: 2,
          status: 'preferred_shortfall',
          zoneId: zoneEast,
        },
        {
          actual: 1,
          mandatory: 1,
          preferred: 2,
          status: 'preferred_shortfall',
          zoneId: zoneWest,
        },
      ],
      separation: {
        blockedSites: [
          {
            conflictsWithFixedEvent: false,
            relatedSiteIds: [siteLibrary],
            siteId: siteHall,
            zoneId: zoneEast,
          },
        ],
        minimumMetres: 150,
      },
    },
    zoneCounts: { [zoneEast]: 0, [zoneWest]: 1 },
  };
}

function installPlacementApi(
  options: {
    applyResponse?: () => Response;
    history?: () => Response;
    state?: () => AuthorPlacementState | Response;
  } = {},
) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const path = url.pathname.replace('/api/v1', '');
      const method = init?.method ?? 'GET';
      if (method === 'GET' && path === '/author/event-placement') {
        const state = options.state?.() ?? placementState();
        return state instanceof Response
          ? state
          : jsonResponse({ ...state, requestId: 'request-state' });
      }
      if (method === 'GET' && path === '/author/event-placement/history') {
        const historyResponse = options.history?.();
        if (historyResponse) return historyResponse;
        return jsonResponse({
          plans:
            options.state === undefined
              ? [
                  {
                    assignmentCount: 1,
                    createdAt: '2026-09-23T02:00:00.000Z',
                    failureCode: null,
                    planId: oldPlanId,
                    policyVersion: 'placement-v1',
                    rotationBucket: '2026-09-23',
                    status: 'applied',
                    trigger: 'scheduled',
                  },
                ]
              : [],
          requestId: 'request-history',
        });
      }
      if (method === 'POST' && path === '/author/event-placement/previews') {
        return jsonResponse({
          plan: previewPlan(),
          requestId: 'request-preview',
        });
      }
      if (method === 'POST' && path === '/author/event-placement/apply') {
        return (
          options.applyResponse?.() ??
          jsonResponse({ plan: previewPlan(5), requestId: 'request-apply' })
        );
      }
      if (method === 'POST' && path === '/author/event-placement/overrides') {
        return jsonResponse({
          overrideId,
          replayed: false,
          requestId: 'request-override',
        });
      }
      if (method === 'POST' && path.endsWith(`/overrides/${overrideId}/end`)) {
        return jsonResponse({ stateVersion: 5, requestId: 'request-end' });
      }
      if (method === 'POST' && path === '/author/event-placement/rollback') {
        return jsonResponse({
          plan: previewPlan(5),
          requestId: 'request-rollback',
        });
      }
      throw new Error(`Unexpected ${method} request: ${path}`);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function postedPaths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([input]) => new URL(String(input)).pathname.replace('/api/v1', ''));
}

function requestBodies(
  fetchMock: ReturnType<typeof vi.fn>,
  expectedPath: string,
) {
  return fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        init?.method === 'POST' &&
        new URL(String(input)).pathname.replace('/api/v1', '') === expectedPath,
    )
    .map(
      ([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>,
    );
}

function problemResponse(
  status: number,
  code: string,
  detail: string,
): Response {
  return jsonResponse(
    {
      code,
      detail,
      requestId: 'request-problem',
      status,
      title: 'Request failed',
      type: 'about:blank',
    },
    status,
  );
}

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

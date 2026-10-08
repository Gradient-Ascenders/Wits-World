import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AuthorPlacementPlan,
  AuthorPlacementState,
} from '../src/api/author';
import { EventPlacementWorkspace } from '../src/components/author/EventPlacementWorkspace';
import type { MapController } from '../src/components/exploration/map-provider';

const apiBaseUrl = 'https://api.example.test/api/v1';
const eventId = '30000000-0000-4000-8000-000000000001';
const otherEventId = '30000000-0000-4000-8000-000000000002';
const zoneId = '10000000-0000-4000-8000-000000000001';
const otherZoneId = '10000000-0000-4000-8000-000000000002';
const siteId = '20000000-0000-4000-8000-000000000001';
const otherSiteId = '20000000-0000-4000-8000-000000000002';
const planId = '40000000-0000-4000-8000-000000000001';

afterEach(() => vi.unstubAllGlobals());

describe('event placement recovery coverage', () => {
  it('clears an outdated preview after refreshing authoritative state', async () => {
    const user = userEvent.setup();
    let stateVersion = 4;
    installPlacementApi({ state: () => placementState(stateVersion) });
    renderWorkspace();
    await screen.findByText('Placement needs attention');

    await user.click(screen.getByRole('button', { name: 'Create preview' }));
    expect(await screen.findByText('Review exceptions')).toBeVisible();
    stateVersion = 5;

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(
      await screen.findByText(
        'Placement refreshed. The outdated preview was cleared.',
      ),
    ).toBeVisible();
    expect(screen.queryByText('Review exceptions')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create preview' }),
    ).toBeVisible();
  });

  it('keeps the last usable review visible when a replacement preview fails', async () => {
    const user = userEvent.setup();
    let previewAttempts = 0;
    installPlacementApi({
      preview: () => {
        previewAttempts += 1;
        return previewAttempts === 1
          ? jsonResponse({ plan: previewPlan(4), requestId: 'preview-one' })
          : problemResponse(
              503,
              'PLACEMENT_UNAVAILABLE',
              'The new preview could not be generated.',
            );
      },
    });
    renderWorkspace();
    await screen.findByText('Placement needs attention');

    await user.click(screen.getByRole('button', { name: 'Create preview' }));
    expect(await screen.findByText('Review exceptions')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'New preview' }));

    expect(await screen.findByText('Preview unavailable')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Placement is unavailable. Check your connection and try again.',
    );
    expect(screen.getByText('Review exceptions')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Review and apply' }),
    ).toBeVisible();
  });

  it('supports detail-tab arrow and boundary keyboard navigation', async () => {
    const user = userEvent.setup();
    installPlacementApi();
    renderWorkspace();
    await screen.findByText('Placement needs attention');
    const tabs = screen.getByRole('tablist', {
      name: 'Placement detail views',
    });
    const changes = within(tabs).getByRole('tab', { name: 'Changes' });

    changes.focus();
    await user.keyboard('{ArrowRight}');
    const coverage = within(tabs).getByRole('tab', {
      name: 'Coverage & sites',
    });
    expect(coverage).toHaveFocus();
    expect(coverage).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{End}');
    const history = within(tabs).getByRole('tab', { name: 'Recent history' });
    expect(history).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(
      within(tabs).getByRole('tab', { name: 'Manual controls' }),
    ).toHaveFocus();
    await user.keyboard('{Home}');
    expect(changes).toHaveFocus();
    fireEvent.keyDown(changes, { key: 'a' });
    expect(changes).toHaveFocus();
  });

  it('rejects a fractional override duration before opening confirmation', async () => {
    const user = userEvent.setup();
    installPlacementApi();
    renderWorkspace();
    await screen.findByText('Placement needs attention');
    await user.click(screen.getByRole('tab', { name: 'Manual controls' }));
    const duration = screen.getByLabelText('Duration (hours)');
    await user.clear(duration);
    await user.type(duration, '0.5');
    await user.click(screen.getByRole('button', { name: 'Review override' }));

    expect(screen.getByText('Enter at least 1 whole hour.')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

function renderWorkspace() {
  return render(
    <EventPlacementWorkspace
      apiBaseUrl={apiBaseUrl}
      getAccessToken={vi.fn().mockResolvedValue('access-token')}
      mapboxAccessToken="pk.test"
      mapFactory={vi.fn(async () => mapController())}
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

function placementState(version = 4): AuthorPlacementState {
  return {
    assignments: [{ eventId, origin: 'automatic', siteId, zoneId }],
    currentPlanId: planId,
    events: [
      { id: eventId, title: 'Campus history' },
      { id: otherEventId, title: 'Library collection' },
    ],
    metrics: {
      activeAssignmentCount: 1,
      activeZoneCount: 2,
      lastAppliedAt: '2026-09-24T02:00:00.000Z',
      lastFailureAt: null,
      lastFailureCode: null,
      servedZoneCount: 1,
      targetAssignmentCount: 6,
      unservedZoneCount: 1,
    },
    nextRotationBoundary: '2026-09-26T02:00:00.000Z',
    overrides: [],
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
    sites: [
      {
        excluded: false,
        id: siteId,
        latitude: -26.1905,
        longitude: 28.0302,
        maximumRadiusMetres: 75,
        name: 'Great Hall',
        status: 'active',
        zoneId,
      },
      {
        excluded: false,
        id: otherSiteId,
        latitude: -26.192,
        longitude: 28.028,
        maximumRadiusMetres: 60,
        name: 'Wartenweiler Library',
        status: 'active',
        zoneId: otherZoneId,
      },
    ],
    stateVersion: version,
    zones: [
      {
        geometry: polygon(28.029, -26.191),
        id: zoneId,
        key: 'east',
        name: 'East Campus',
        status: 'active',
      },
      {
        geometry: polygon(28.026, -26.193),
        id: otherZoneId,
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

function previewPlan(stateVersion = 4): AuthorPlacementPlan {
  return {
    entries: [
      {
        eventId,
        origin: 'automatic',
        siteId: otherSiteId,
        zoneId: otherZoneId,
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
          zoneId,
        },
        {
          actual: 1,
          mandatory: 1,
          preferred: 2,
          status: 'preferred_shortfall',
          zoneId: otherZoneId,
        },
      ],
      separation: {
        blockedSites: [],
        minimumMetres: 150,
      },
    },
    zoneCounts: { [zoneId]: 0, [otherZoneId]: 1 },
  };
}

function installPlacementApi(
  options: {
    preview?: () => Response;
    state?: () => AuthorPlacementState;
  } = {},
) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const path = url.pathname.replace('/api/v1', '');
      if (path === '/author/event-placement/history') {
        return jsonResponse({ plans: [], requestId: 'history' });
      }
      if (path === '/author/event-placement/previews') {
        return (
          options.preview?.() ??
          jsonResponse({ plan: previewPlan(), requestId: 'preview' })
        );
      }
      if (
        path === '/author/event-placement' &&
        (init?.method ?? 'GET') === 'GET'
      ) {
        return jsonResponse({
          ...(options.state?.() ?? placementState()),
          requestId: 'state',
        });
      }
      throw new Error(`Unexpected ${init?.method ?? 'GET'} request: ${path}`);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
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

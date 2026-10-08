import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Router } from 'wouter';

import TradeDetailPage from '../src/pages/TradeDetailPage';
import { buildUuid, jsonResponse } from './fixtures/cards';

const apiBaseUrl = 'https://api.example.test/api/v1';
const tradeId = buildUuid(701);
const definitionId = buildUuid(702);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('trade detail action boundaries', () => {
  it('acknowledges an imbalance with the displayed version and updates consent', async () => {
    const calls: Array<{ path: string; body?: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/cards/trading-catalogue'))
          return jsonResponse({ definitions: [], requestId: 'catalogue' });
        if (
          url.pathname.endsWith(`/trades/${tradeId}/imbalance-acknowledgement`)
        ) {
          const body = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
          calls.push({ path: url.pathname, body });
          return jsonResponse({
            requestId: 'acknowledged',
            trade: buildTrade({
              imbalanceWarningRequired: true,
              self: party({ imbalanceAcknowledged: true }),
            }),
          });
        }
        if (url.pathname.endsWith(`/trades/${tradeId}`))
          return jsonResponse({
            trade: buildTrade({ imbalanceWarningRequired: true }),
            requestId: 'detail',
          });
        throw new Error(`Unexpected request: ${url.pathname}`);
      }),
    );

    renderDetail(`/collection/trades/${tradeId}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Confirm warning' }));

    expect(await screen.findByText('Warning reviewed.')).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      path: `/api/v1/trades/${tradeId}/imbalance-acknowledgement`,
      body: { expectedVersion: 1, submissionId: expect.any(String) },
    });
  });

  it('resumes acceptance only for the version returned from the identity check', async () => {
    const calls: Array<{ path: string; body?: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/cards/trading-catalogue'))
          return jsonResponse({ definitions: [], requestId: 'catalogue' });
        if (url.pathname.endsWith(`/trades/${tradeId}/accept`)) {
          calls.push({
            path: url.pathname,
            body: JSON.parse(String(init?.body)),
          });
          return jsonResponse({
            requestId: 'accepted',
            trade: buildTrade({ self: party({ accepted: true }) }),
          });
        }
        if (url.pathname.endsWith(`/trades/${tradeId}`))
          return jsonResponse({ trade: buildTrade(), requestId: 'detail' });
        throw new Error(`Unexpected request: ${url.pathname}`);
      }),
    );

    renderDetail(
      `/collection/trades/${tradeId}?action=confirm-accept&version=1`,
    );
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', {
      name: 'Accept this offer?',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Accept offer' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Accepted' }),
    ).toBeDisabled();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      path: `/api/v1/trades/${tradeId}/accept`,
      body: {
        expectedVersion: 1,
        reauthenticationToken: 'id-token',
        submissionId: expect.any(String),
      },
    });
  });

  it('rejects an identity return for an outdated version without submitting acceptance', async () => {
    const acceptCalls: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/cards/trading-catalogue'))
          return jsonResponse({ definitions: [], requestId: 'catalogue' });
        if (url.pathname.endsWith(`/trades/${tradeId}/accept`))
          acceptCalls.push(url);
        if (url.pathname.endsWith(`/trades/${tradeId}`))
          return jsonResponse({
            trade: buildTrade({ version: 2 }),
            requestId: 'detail',
          });
        throw new Error(`Unexpected request: ${url.pathname}`);
      }),
    );

    renderDetail(
      `/collection/trades/${tradeId}?action=confirm-accept&version=1`,
    );

    expect(
      await screen.findByRole('heading', { name: 'The offer changed' }),
    ).toBeVisible();
    expect(
      screen.getByText(/Review the current version before accepting/u),
    ).toBeVisible();
    expect(screen.getByLabelText('Trade version 2')).toBeVisible();
    expect(acceptCalls).toHaveLength(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reloads the offer after the accept endpoint reports a stale version', async () => {
    let detailReads = 0;
    let acceptCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/cards/trading-catalogue'))
          return jsonResponse({ definitions: [], requestId: 'catalogue' });
        if (url.pathname.endsWith(`/trades/${tradeId}/accept`)) {
          acceptCalls += 1;
          return jsonResponse(
            {
              code: 'TRADE_VERSION_STALE',
              detail: 'The offer changed before acceptance.',
              requestId: 'stale-acceptance',
            },
            409,
          );
        }
        if (url.pathname.endsWith(`/trades/${tradeId}`)) {
          detailReads += 1;
          return jsonResponse({
            trade: buildTrade({ version: detailReads }),
            requestId: `detail-${detailReads}`,
          });
        }
        throw new Error(`Unexpected request: ${url.pathname}`);
      }),
    );

    renderDetail(
      `/collection/trades/${tradeId}?action=confirm-accept&version=1`,
    );
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', {
      name: 'Accept this offer?',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Accept offer' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'The offer changed' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Trade version 2')).toBeVisible();
    expect(
      screen.getByText(
        'The offer changed while you verified your identity. Review the current version before accepting.',
      ),
    ).toBeVisible();
    expect(detailReads).toBe(2);
    expect(acceptCalls).toBe(1);
    expect(
      screen.queryByRole('dialog', { name: 'Accept this offer?' }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['sender', 'Cancel offer', 'cancel', 'cancelled'],
    ['recipient', 'Decline offer', 'decline', 'declined'],
  ] as const)(
    '%s can %s and sees the server terminal state',
    async (role, action, endpoint, status) => {
      const mutationPaths: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(String(input));
          if (url.pathname.endsWith('/cards/trading-catalogue'))
            return jsonResponse({ definitions: [], requestId: 'catalogue' });
          if (url.pathname.endsWith(`/trades/${tradeId}/${endpoint}`)) {
            mutationPaths.push(url.pathname);
            return jsonResponse({
              requestId: 'terminal',
              trade: buildTrade({
                status,
                terminalAt: '2026-10-07T12:00:00.000Z',
              }),
            });
          }
          if (url.pathname.endsWith(`/trades/${tradeId}`))
            return jsonResponse({
              trade: buildTrade({ role }),
              requestId: 'detail',
            });
          throw new Error(
            `Unexpected ${init?.method ?? 'GET'} ${url.pathname}`,
          );
        }),
      );

      renderDetail(`/collection/trades/${tradeId}`);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: action }));
      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toHaveTextContent(
        `${endpoint === 'cancel' ? 'Cancel' : 'Decline'} this offer`,
      );
      await user.click(within(dialog).getByRole('button', { name: action }));

      expect(
        await screen.findByText(
          status === 'cancelled' ? 'Cancelled' : 'Declined',
          { selector: '.trade-status' },
        ),
      ).toBeVisible();
      expect(mutationPaths).toEqual([`/api/v1/trades/${tradeId}/${endpoint}`]);
    },
  );

  it('shows an authorization failure, re-enables the action, and allows retry', async () => {
    let cancelAttempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/cards/trading-catalogue'))
          return jsonResponse({ definitions: [], requestId: 'catalogue' });
        if (url.pathname.endsWith(`/trades/${tradeId}/cancel`)) {
          cancelAttempts += 1;
          if (cancelAttempts === 1)
            return jsonResponse(
              { code: 'TRADE_ACTION_NOT_ALLOWED', requestId: 'denied' },
              403,
            );
          return jsonResponse({
            requestId: 'cancelled',
            trade: buildTrade({
              status: 'cancelled',
              terminalAt: '2026-10-07T12:00:00.000Z',
            }),
          });
        }
        if (url.pathname.endsWith(`/trades/${tradeId}`))
          return jsonResponse({ trade: buildTrade(), requestId: 'detail' });
        throw new Error(`Unexpected request: ${url.pathname}`);
      }),
    );

    renderDetail(`/collection/trades/${tradeId}`);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Cancel offer' }),
    );
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Cancel offer',
      }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'The trade action did not finish',
      }),
    ).toBeVisible();
    expect(screen.getByText('Support reference: denied')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel offer' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Cancel offer' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Cancel offer',
      }),
    );

    expect(
      await screen.findByText('Cancelled', { selector: '.trade-status' }),
    ).toBeVisible();
    expect(cancelAttempts).toBe(2);
  });

  it('retries a failed detail read and refreshes a completed trade when its receipt is absent', async () => {
    let details = 0;
    let collectionReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/cards/trading-catalogue'))
          return jsonResponse({ definitions: [], requestId: 'catalogue' });
        if (url.pathname.endsWith(`/trades/${tradeId}`)) {
          details += 1;
          if (details === 1)
            return jsonResponse({ code: 'TEMPORARY_FAILURE' }, 503);
          return jsonResponse({
            requestId: 'completed',
            trade: buildTrade({
              settlement: null,
              status: 'completed',
              terminalAt: '2026-10-07T12:00:00.000Z',
            }),
          });
        }
        if (url.pathname.endsWith('/cards/collection')) {
          collectionReads += 1;
          if (collectionReads === 1)
            return jsonResponse({ code: 'TEMPORARY_FAILURE' }, 503);
          return jsonResponse({ cards: [], requestId: 'collection' });
        }
        throw new Error(`Unexpected request: ${url.pathname}`);
      }),
    );

    renderDetail(`/collection/trades/${tradeId}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(/could not be refreshed/u)).toBeVisible();
    expect(details).toBe(2);
    await user.click(
      screen.getByRole('button', { name: 'Refresh collection' }),
    );
    expect(
      await screen.findByText('Your collection is up to date.'),
    ).toBeVisible();
    expect(collectionReads).toBe(2);
    expect(
      screen.getByText('Completed', { selector: '.trade-status' }),
    ).toBeVisible();
  });
});

function renderDetail(path: string) {
  window.history.replaceState({}, '', path);
  const auth = {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    getIdTokenClaims: vi.fn().mockResolvedValue({ __raw: 'id-token' }),
    isAuthenticated: true,
    isLoading: false,
    loginWithRedirect: vi.fn().mockResolvedValue(undefined),
  } as Auth0ContextInterface;
  return render(
    <Auth0Context.Provider value={auth}>
      <Router>
        <Route path="/collection/trades/:tradeId">
          <TradeDetailPage apiBaseUrl={apiBaseUrl} />
        </Route>
      </Router>
    </Auth0Context.Provider>,
  );
}

function definition() {
  return {
    affinity: 'wit',
    cardDefinitionId: definitionId,
    category: 'creature',
    imageAlt: null,
    imageUrl: null,
    name: 'Boundary Test Card',
    rarity: 'common',
  };
}

function party(overrides: Record<string, unknown> = {}) {
  return {
    accepted: false,
    imbalanceAcknowledged: false,
    offeredCopies: [{ ...definition(), ownedCardId: buildUuid(703) }],
    rarityPoints: 1,
    requestedDefinitions: [{ ...definition(), quantity: 1 }],
    ...overrides,
  };
}

function buildTrade(overrides: Record<string, unknown> = {}) {
  return {
    complete: true,
    counterparty: party(),
    counterpartyPlayerName: 'other_player',
    createdAt: '2026-10-07T10:00:00.000Z',
    expiresAt: '2026-10-09T10:00:00.000Z',
    imbalanceWarningRequired: false,
    role: 'sender',
    self: party(),
    settlement: null,
    status: 'open',
    terminalAt: null,
    tradeId,
    version: 1,
    ...overrides,
  };
}

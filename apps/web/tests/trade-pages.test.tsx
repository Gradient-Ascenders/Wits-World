import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Router, Switch } from 'wouter';

import { GuardedRouter } from '../src/components/author/AuthorNavigationGuard';
import TradeDetailPage from '../src/pages/TradeDetailPage';
import TradeEditorPage from '../src/pages/TradeEditorPage';
import TradeInboxPage from '../src/pages/TradeInboxPage';
import { buildUuid, jsonResponse } from './fixtures/cards';

const apiBaseUrl = 'https://api.example.test/api/v1';
const tradeId = buildUuid(1);
const definitionId = buildUuid(10);
const ownedCardId = buildUuid(20);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('card trade pages', () => {
  it('groups open offers and closed history in the collection journey', async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const openRequest = String(input).includes('status=open');
      return Promise.resolve(
        jsonResponse({
          hasMore: false,
          items: openRequest
            ? [buildSummary()]
            : [
                buildSummary({
                  direction: 'sent',
                  status: 'completed',
                  terminalAt: '2026-09-26T10:00:00.000Z',
                  tradeId: buildUuid(2),
                }),
              ],
          page: 1,
          pageSize: 50,
          requestId: 'trade-list-request',
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRoute(
      '/collection/trades',
      <TradeInboxPage apiBaseUrl={apiBaseUrl} />,
    );

    expect(
      await screen.findByRole('heading', { name: 'Card trades' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Incoming' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Incoming trade from other_player/ }),
    ).toHaveAttribute('href', `/collection/trades/${tradeId}`);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('status=open'),
      ),
    ).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'History 1' }));
    expect(screen.getByRole('heading', { name: 'Completed' })).toBeVisible();
    expect(
      screen.getByText('Completed', { selector: '.trade-status' }),
    ).toBeVisible();
  });

  it('guards a dirty mobile-first draft and publishes only a current server preview', async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/cards/trading-catalogue')) {
          return jsonResponse({
            definitions: [buildCatalogueDefinition()],
            requestId: 'catalogue-request',
          });
        }
        if (url.endsWith('/trades/selection-preview')) {
          const body = JSON.parse(String(init?.body)) as {
            offeredOwnedCardIds: string[];
            requestedDefinitions: {
              cardDefinitionId: string;
              quantity: number;
            }[];
          };
          return jsonResponse(buildPreviewResponse(body));
        }
        if (url.endsWith('/trades') && init?.method === 'POST') {
          return jsonResponse(
            { requestId: 'create-request', trade: buildTrade() },
            201,
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState({}, '', '/collection/trades/new');
    render(
      <Auth0Context.Provider value={authValue()}>
        <GuardedRouter>
          <Switch>
            <Route path="/collection/trades/new">
              <TradeEditorPage apiBaseUrl={apiBaseUrl} />
            </Route>
            <Route path="/collection/trades/:tradeId">
              <p>Trade detail route</p>
            </Route>
            <Route path="/collection/trades">
              <p>Trade inbox route</p>
            </Route>
          </Switch>
        </GuardedRouter>
      </Auth0Context.Provider>,
    );
    const user = userEvent.setup();

    const playerName = await screen.findByRole('textbox', {
      name: 'Player Name',
    });
    await user.type(playerName, 'other_player');
    await user.click(screen.getByRole('link', { name: 'Trades' }));
    const discardDialog = screen.getByRole('dialog');
    expect(discardDialog).toHaveTextContent('Discard unsaved changes?');
    await user.click(
      within(discardDialog).getByRole('button', { name: 'Keep editing' }),
    );

    await user.click(screen.getByRole('button', { name: 'Build trade' }));
    expect(
      screen.getByRole('heading', { name: 'Build your offer' }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Choose any active card type. other_player’s collection stays private.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(
        'Rarity points are server-calculated guidance, not card prices.',
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Resolve these before publishing:'),
    ).not.toBeInTheDocument();
    const collection = screen.getByRole('list', {
      name: 'Card types in your collection',
    });
    expect(within(collection).getAllByRole('listitem')).toHaveLength(1);
    expect(within(collection).getByText('6 owned · 6 tradable')).toBeVisible();
    const cardDetailsTrigger = within(collection).getByRole('button', {
      name: 'View Courier Ibis details',
    });
    await user.click(cardDetailsTrigger);
    const cardDetails = screen.getByRole('dialog', {
      name: 'Courier Ibis',
    });
    expect(cardDetails).toHaveAttribute('data-rarity', 'rare');
    expect(cardDetails).toHaveClass('trade-card-detail--rare');
    expect(
      within(cardDetails).getByText('Rare Creature · Wit affinity'),
    ).toBeVisible();
    expect(within(cardDetails).getByText('Express Delivery')).toBeVisible();
    expect(within(cardDetails).getByText('Deal 20 base damage.')).toBeVisible();
    await user.click(
      within(cardDetails).getByRole('button', {
        name: 'Close Courier Ibis details',
      }),
    );
    expect(cardDetailsTrigger).toHaveFocus();
    await user.click(
      within(collection).getByRole('button', {
        name: 'Offer one more Courier Ibis',
      }),
    );
    await user.click(screen.getByRole('button', { name: /Active cards/ }));
    await user.click(
      screen.getByRole('button', { name: 'Request one more Courier Ibis' }),
    );

    expect(screen.getByRole('heading', { name: 'You receive' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'You give' })).toBeVisible();
    expect(
      document.querySelectorAll(
        '.trade-builder-selection-strip .trade-card-thumbnail',
      ),
    ).toHaveLength(2);
    expect(
      document.querySelectorAll(
        '.trade-builder-selection-strip .trade-card-thumbnail--full',
      ),
    ).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: 'Show card details' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText('Ready')).toBeVisible();
    const review = screen.getByRole('button', { name: 'Review offer' });
    await waitFor(() => expect(review).toBeEnabled());
    await user.click(review);

    const confirmation = screen.getByRole('dialog', {
      name: 'Send this trade offer?',
    });
    expect(confirmation).toHaveTextContent(
      'Send 1 card to other_player and request 1 card?',
    );
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith('/trades') && init?.method === 'POST',
      ),
    ).toBe(false);
    await user.click(
      within(confirmation).getByRole('button', { name: 'Send offer' }),
    );

    await waitFor(() =>
      expect(window.location.pathname).toBe(`/collection/trades/${tradeId}`),
    );
    expect(screen.getByText('Trade detail route')).toBeVisible();
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/trades') && init?.method === 'POST',
    );
    expect(createCall).toBeDefined();
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      offeredOwnedCardIds: [ownedCardId],
      recipientPlayerName: 'other_player',
      requestedDefinitions: [{ cardDefinitionId: definitionId, quantity: 1 }],
    });
  });

  it('groups duplicate cards while selecting distinct authoritative copies', async () => {
    const previewInputs: Array<{
      offeredOwnedCardIds: string[];
      requestedDefinitions: {
        cardDefinitionId: string;
        quantity: number;
      }[];
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/cards/trading-catalogue')) {
          return jsonResponse({
            definitions: [buildCatalogueDefinition()],
            requestId: 'catalogue-request',
          });
        }
        if (url.endsWith('/trades/selection-preview')) {
          const body = JSON.parse(
            String(init?.body),
          ) as (typeof previewInputs)[number];
          previewInputs.push(body);
          return jsonResponse(buildPreviewResponse(body));
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderRoute(
      '/collection/trades/new',
      <TradeEditorPage apiBaseUrl={apiBaseUrl} />,
    );
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole('textbox', { name: 'Player Name' }),
      'other_player',
    );
    await user.click(screen.getByRole('button', { name: 'Build trade' }));

    const collection = screen.getByRole('list', {
      name: 'Card types in your collection',
    });
    expect(within(collection).getAllByRole('listitem')).toHaveLength(1);
    const add = within(collection).getByRole('button', {
      name: 'Offer one more Courier Ibis',
    });
    await user.click(add);
    await waitFor(() =>
      expect(within(collection).getByText(/1 selected/)).toBeVisible(),
    );
    await user.click(add);

    await waitFor(() =>
      expect(previewInputs.at(-1)?.offeredOwnedCardIds).toEqual([
        buildUuid(20),
        buildUuid(21),
      ]),
    );
    expect(within(collection).getByText(/2 selected/)).toBeVisible();
  });

  it('aborts an in-flight preview when the local selection changes', async () => {
    let previewCount = 0;
    let stalePreviewSignal: AbortSignal | null = null;
    let resolveStalePreview!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/cards/trading-catalogue')) {
          return jsonResponse({
            definitions: [buildCatalogueDefinition()],
            requestId: 'catalogue-request',
          });
        }
        if (url.endsWith('/trades/selection-preview')) {
          previewCount += 1;
          const body = JSON.parse(String(init?.body)) as {
            offeredOwnedCardIds: string[];
            requestedDefinitions: {
              cardDefinitionId: string;
              quantity: number;
            }[];
          };
          if (previewCount === 2) {
            stalePreviewSignal = init?.signal ?? null;
            return await new Promise<Response>((resolve) => {
              resolveStalePreview = resolve;
            });
          }
          return jsonResponse(buildPreviewResponse(body));
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderRoute(
      '/collection/trades/new',
      <TradeEditorPage apiBaseUrl={apiBaseUrl} />,
    );
    const user = userEvent.setup();

    await user.type(
      await screen.findByRole('textbox', { name: 'Player Name' }),
      'other_player',
    );
    await user.click(screen.getByRole('button', { name: 'Build trade' }));
    const collection = within(
      screen.getByRole('list', {
        name: 'Card types in your collection',
      }),
    );
    await user.click(
      collection.getByRole('button', {
        name: 'Offer one more Courier Ibis',
      }),
    );
    await waitFor(() => expect(stalePreviewSignal).not.toBeNull());

    await user.click(
      collection.getByRole('button', {
        name: 'Offer one fewer Courier Ibis',
      }),
    );
    await waitFor(() =>
      expect((stalePreviewSignal as AbortSignal | null)?.aborted).toBe(true),
    );

    resolveStalePreview(
      jsonResponse(
        buildPreviewResponse({
          offeredOwnedCardIds: [ownedCardId],
          requestedDefinitions: [],
        }),
      ),
    );
  });

  it("shows both players' retained sides before publishing a revision", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/cards/trading-catalogue')) {
          return jsonResponse({
            definitions: [buildCatalogueDefinition()],
            requestId: 'catalogue-request',
          });
        }
        if (url.endsWith(`/trades/${tradeId}`) && init?.method === 'GET') {
          return jsonResponse({
            requestId: 'trade-detail-request',
            trade: buildTrade(),
          });
        }
        if (url.endsWith('/trades/selection-preview')) {
          const body = JSON.parse(String(init?.body)) as {
            offeredOwnedCardIds: string[];
            requestedDefinitions: {
              cardDefinitionId: string;
              quantity: number;
            }[];
          };
          return jsonResponse(buildPreviewResponse(body));
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderRoute(
      `/collection/trades/${tradeId}/edit`,
      <Route path="/collection/trades/:tradeId/edit">
        <TradeEditorPage apiBaseUrl={apiBaseUrl} />
      </Route>,
    );
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Choose requested cards' }),
    );
    await user.click(screen.getByRole('button', { name: 'Review offer' }));

    expect(
      screen.getByRole('heading', { name: 'other_player gives' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'other_player requested' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Review version change' }),
    ).toBeEnabled();
  });

  it('reloads a stale offer and keeps the conflict warning visible', async () => {
    let getCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith(`/trades/${tradeId}`) && init?.method === 'GET') {
          getCount += 1;
          return jsonResponse({
            requestId: `detail-request-${getCount}`,
            trade: buildTrade({ version: getCount }),
          });
        }
        if (url.endsWith(`/trades/${tradeId}/cancel`)) {
          return jsonResponse(
            {
              code: 'TRADE_VERSION_STALE',
              detail: 'The requested trade version is stale.',
              requestId: 'stale-request',
            },
            409,
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderRoute(
      `/collection/trades/${tradeId}`,
      <Route path="/collection/trades/:tradeId">
        <TradeDetailPage apiBaseUrl={apiBaseUrl} />
      </Route>,
    );
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Cancel offer' }),
    );
    const dialog = screen.getByRole('alertdialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Cancel offer' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'The offer changed' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Trade version 2')).toBeVisible();
    expect(screen.getByText('Support reference: stale-request')).toBeVisible();
  });

  it('refreshes the authoritative collection when completed trade detail loads', async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith(`/trades/${tradeId}`) && init?.method === 'GET') {
          return jsonResponse({
            requestId: 'completed-detail-request',
            trade: buildTrade({
              settlement: { completedAt: '2026-09-26T10:00:00.000Z' },
              status: 'completed',
              terminalAt: '2026-09-26T10:00:00.000Z',
            }),
          });
        }
        if (url.endsWith('/cards/collection')) {
          return jsonResponse({ cards: [], requestId: 'collection-request' });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    renderRoute(
      `/collection/trades/${tradeId}`,
      <Route path="/collection/trades/:tradeId">
        <TradeDetailPage apiBaseUrl={apiBaseUrl} />
      </Route>,
    );

    expect(
      await screen.findByText('Your authoritative collection is up to date.'),
    ).toBeVisible();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith('/cards/collection'),
      ),
    ).toHaveLength(1);
  });
});

function authValue(): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    getIdTokenClaims: vi.fn().mockResolvedValue({ __raw: 'id-token' }),
    isAuthenticated: true,
    isLoading: false,
    loginWithRedirect: vi.fn().mockResolvedValue(undefined),
  } as Auth0ContextInterface;
}

function renderRoute(path: string, element: ReactNode) {
  window.history.replaceState({}, '', path);
  return render(
    <Auth0Context.Provider value={authValue()}>
      <Router>{element}</Router>
    </Auth0Context.Provider>,
  );
}

function buildDefinition() {
  return {
    affinity: 'wit' as const,
    cardDefinitionId: definitionId,
    category: 'creature' as const,
    imageAlt: 'A courier ibis carrying a sealed offer.',
    imageUrl: '/cards/courier.webp',
    name: 'Courier Ibis',
    rarity: 'rare' as const,
  };
}

function buildCatalogueDefinition() {
  return {
    ...buildDefinition(),
    description: 'Delivers sealed offers across campus.',
    effects: [],
    hp: 90,
    isActive: true,
    moves: [
      {
        effectType: 'damage' as const,
        effectValue: 20,
        id: buildUuid(81),
        modifierDurationTurns: null,
        modifierOperation: null,
        modifierStat: null,
        moveType: 'wit' as const,
        name: 'Express Delivery',
        position: 1,
        powerCost: 2,
        rulesText: 'Deal 20 base damage.',
      },
    ],
    power: 8,
  };
}

function buildOfferedCopy(id = ownedCardId) {
  return { ...buildDefinition(), ownedCardId: id };
}

function buildParty() {
  return {
    accepted: false,
    imbalanceAcknowledged: false,
    offeredCopies: [buildOfferedCopy()],
    rarityPoints: 2,
    requestedDefinitions: [{ ...buildDefinition(), quantity: 1 }],
  };
}

function buildTrade(overrides: Record<string, unknown> = {}) {
  return {
    complete: true,
    counterparty: buildParty(),
    counterpartyPlayerName: 'other_player',
    createdAt: '2026-09-26T08:00:00.000Z',
    expiresAt: '2026-09-27T08:00:00.000Z',
    imbalanceWarningRequired: false,
    role: 'sender' as const,
    self: buildParty(),
    settlement: null,
    status: 'open' as const,
    terminalAt: null,
    tradeId,
    version: 1,
    ...overrides,
  };
}

function buildSummary(overrides: Record<string, unknown> = {}) {
  return {
    counterpartyPlayerName: 'other_player',
    createdAt: '2026-09-26T08:00:00.000Z',
    direction: 'received' as const,
    expiresAt: '2026-09-27T08:00:00.000Z',
    status: 'open' as const,
    terminalAt: null,
    tradeId,
    version: 1,
    ...overrides,
  };
}

function buildPreviewResponse(input: {
  offeredOwnedCardIds: string[];
  requestedDefinitions: { cardDefinitionId: string; quantity: number }[];
}) {
  const offerReady = input.offeredOwnedCardIds.length > 0;
  const requestReady = input.requestedDefinitions.length > 0;
  return {
    imbalanceWarningRequired: false,
    issues: [
      ...(offerReady ? [] : ['offer_required']),
      ...(requestReady ? [] : ['request_required']),
    ],
    limits: {
      maximumCopiesPerSide: 5,
      minimumCreatureCopies: 3,
      minimumPowerCopies: 2,
    },
    offeredRarityPoints: input.offeredOwnedCardIds.length * 2,
    ownedCopies: Array.from({ length: 6 }, (_, index) => {
      const copy = buildOfferedCopy(buildUuid(20 + index));
      return {
        ...copy,
        availability: input.offeredOwnedCardIds.includes(copy.ownedCardId)
          ? 'selected_here'
          : 'available',
      };
    }),
    requestedDefinitions: input.requestedDefinitions.map((request) => ({
      ...buildDefinition(),
      quantity: request.quantity,
    })),
    requestedRarityPoints: input.requestedDefinitions.reduce(
      (total, request) => total + request.quantity * 2,
      0,
    ),
    requestId: 'preview-request',
    valid: offerReady && requestReady,
  };
}

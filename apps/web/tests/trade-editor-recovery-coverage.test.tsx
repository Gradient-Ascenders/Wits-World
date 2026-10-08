import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';

import TradeEditorPage from '../src/pages/TradeEditorPage';
import { buildUuid, jsonResponse } from './fixtures/cards';

const apiBaseUrl = 'https://api.example.test/api/v1';
const courierId = buildUuid(10);
const sentinelId = buildUuid(11);
const atlasId = buildUuid(12);
const courierCopyId = buildUuid(20);
const atlasCopyId = buildUuid(21);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('trade editor recovery coverage', () => {
  it('shows the editor fallback when the initial catalogue request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );

    renderEditor();

    expect(
      await screen.findByRole('heading', { name: 'Trade editor unavailable' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Back to trades' }),
    ).toHaveAttribute('href', '/collection/trades');
  });

  it('rechecks a changed recipient and filters both public catalogue and owned copies', async () => {
    let recipientChecks = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/trades/recipient?')) {
          recipientChecks += 1;
          if (recipientChecks === 2)
            return jsonResponse({ code: 'TRADE_PLAYER_UNAVAILABLE' }, 404);
          const playerName = new URL(url).searchParams.get('playerName');
          return jsonResponse({ playerName, requestId: 'recipient-check' });
        }
        if (url.endsWith('/cards/trading-catalogue'))
          return jsonResponse({
            definitions: buildCatalogue(),
            requestId: 'catalogue',
          });
        if (url.endsWith('/trades/selection-preview'))
          return previewFromBody(init?.body);
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderEditor();
    const user = userEvent.setup();
    const playerInput = await screen.findByRole('textbox', {
      name: 'Player Name',
    });
    await user.type(playerInput, 'first_player');
    await user.click(screen.getByRole('button', { name: 'Choose cards' }));
    expect(
      await screen.findByRole('heading', { name: 'Trade with first_player' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Change player' }));
    const changedPlayerInput = await screen.findByRole('textbox', {
      name: 'Player Name',
    });
    await user.clear(changedPlayerInput);
    await user.type(changedPlayerInput, 'missing_player');
    await user.click(screen.getByRole('button', { name: 'Choose cards' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That player is unavailable.',
    );
    expect(changedPlayerInput).toHaveAttribute('aria-invalid', 'true');

    await user.clear(changedPlayerInput);
    await user.type(changedPlayerInput, 'second_player');
    await user.click(screen.getByRole('button', { name: 'Choose cards' }));
    expect(
      await screen.findByRole('heading', { name: 'Trade with second_player' }),
    ).toBeVisible();
    expect(screen.getByText(/not second_player’s collection/)).toBeVisible();

    const ownedCopies = screen.getByRole('list', {
      name: 'Card types in your collection',
    });
    expect(
      Array.from(
        ownedCopies.querySelectorAll(':scope > li.trade-copy-group'),
      ).map((item) => item.querySelector('strong')?.textContent),
    ).toEqual(['Atlas', 'Courier Ibis']);
    await user.click(within(ownedCopies).getByText('1 unavailable'));
    expect(
      within(ownedCopies).getByText('1 × Used by a saved deck'),
    ).toBeVisible();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search your cards' }),
      'no match',
    );
    expect(
      await screen.findByText('No cards match your search.'),
    ).toBeVisible();
    await user.clear(
      screen.getByRole('searchbox', { name: 'Search your cards' }),
    );

    await user.click(screen.getByRole('button', { name: 'You give' }));
    expect(screen.getByRole('button', { name: 'You give' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'You request' }));
    expect(screen.getByRole('button', { name: 'You request' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.type(
      screen.getByRole('searchbox', { name: 'Search cards to request' }),
      'sentinel',
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole('list', {
            name: 'Active card definitions you can request',
          })
          .querySelectorAll('li'),
      ).toHaveLength(1),
    );
    const catalogue = screen.getByRole('list', {
      name: 'Active card definitions you can request',
    });
    expect(within(catalogue).getByText('Sentinel')).toBeVisible();
    expect(screen.getByText('1 card found')).toBeVisible();
    await user.click(
      within(catalogue).getByRole('button', {
        name: 'Request one more Sentinel',
      }),
    );
    await user.click(
      within(catalogue).getByRole('button', {
        name: 'Request one fewer Sentinel',
      }),
    );
    expect(
      within(catalogue).getByRole('button', {
        name: 'Request one more Sentinel',
      }),
    ).toBeVisible();
  });

  it('keeps review blocked after a failed preview, retries it, and reports a failed submission without navigating', async () => {
    let previewCalls = 0;
    let createCalls = 0;
    const requestBodies: Array<{
      offeredOwnedCardIds: string[];
      requestedDefinitions: { cardDefinitionId: string; quantity: number }[];
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/trades/recipient?'))
          return jsonResponse({
            playerName: 'other_player',
            requestId: 'recipient',
          });
        if (url.endsWith('/cards/trading-catalogue'))
          return jsonResponse({
            definitions: buildCatalogue(),
            requestId: 'catalogue',
          });
        if (url.endsWith('/trades/selection-preview')) {
          previewCalls += 1;
          const body = readPreviewBody(init?.body);
          requestBodies.push(body);
          if (previewCalls === 3) return new Response(null, { status: 503 });
          return jsonResponse(buildPreview(body));
        }
        if (url.endsWith('/trades') && init?.method === 'POST') {
          createCalls += 1;
          return jsonResponse(
            {
              code: 'TRADE_PLAYER_UNAVAILABLE',
              detail: 'Recipient is no longer eligible.',
              requestId: 'create-failure',
            },
            409,
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderEditor();
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole('textbox', { name: 'Player Name' }),
      'other_player',
    );
    await user.click(screen.getByRole('button', { name: 'Choose cards' }));

    const ownedCopies = within(
      await screen.findByRole('list', {
        name: 'Card types in your collection',
      }),
    );
    await user.click(
      ownedCopies.getByRole('button', { name: 'Offer one more Courier Ibis' }),
    );
    await screen.findByText('Add cards to both sides');
    const catalogue = within(
      screen.getByRole('list', {
        name: 'Active card definitions you can request',
      }),
    );
    await user.click(
      catalogue.getByRole('button', { name: 'Request one more Sentinel' }),
    );
    const review = screen.getByRole('button', { name: 'Review offer' });
    await waitFor(() => expect(previewCalls).toBe(3));
    expect(
      await screen.findByRole('button', { name: 'Check again' }),
    ).toBeVisible();
    expect(review).toBeDisabled();
    expect(requestBodies[2]).toEqual({
      offeredOwnedCardIds: [courierCopyId],
      requestedDefinitions: [{ cardDefinitionId: sentinelId, quantity: 1 }],
    });

    await user.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(review).toBeEnabled());
    await user.click(review);
    const confirmation = screen.getByRole('dialog', {
      name: 'Send this trade offer?',
    });
    await user.click(
      within(confirmation).getByRole('button', { name: 'Keep reviewing' }),
    );
    expect(
      screen.queryByRole('dialog', { name: 'Send this trade offer?' }),
    ).not.toBeInTheDocument();
    expect(createCalls).toBe(0);

    await user.click(review);
    const reopenedConfirmation = screen.getByRole('dialog', {
      name: 'Send this trade offer?',
    });
    await user.click(
      within(reopenedConfirmation).getByRole('button', { name: 'Send offer' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Recipient is no longer eligible.',
    );
    expect(screen.getByText('Support reference: create-failure')).toBeVisible();
    expect(window.location.pathname).toBe('/collection/trades/new');
    expect(createCalls).toBe(1);
    expect(screen.getByRole('button', { name: 'Review offer' })).toBeEnabled();
  });
});

function renderEditor() {
  window.history.replaceState({}, '', '/collection/trades/new');
  return render(
    <Auth0Context.Provider value={authValue()}>
      <Router>
        <TradeEditorPage apiBaseUrl={apiBaseUrl} />
      </Router>
    </Auth0Context.Provider>,
  );
}

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

function buildDefinition(id: string, name: string) {
  return {
    affinity: 'wit' as const,
    cardDefinitionId: id,
    category: 'creature' as const,
    description: `${name} card description.`,
    effects: [],
    hp: 90,
    imageAlt: `${name} artwork.`,
    imageUrl: null,
    isActive: true,
    moves: [],
    name,
    power: 8,
    rarity: 'rare' as const,
  };
}

function buildCatalogue() {
  return [
    buildDefinition(courierId, 'Courier Ibis'),
    buildDefinition(sentinelId, 'Sentinel'),
    buildDefinition(atlasId, 'Atlas'),
  ];
}

function readPreviewBody(body: BodyInit | null | undefined) {
  return JSON.parse(String(body)) as {
    offeredOwnedCardIds: string[];
    requestedDefinitions: { cardDefinitionId: string; quantity: number }[];
  };
}

function previewFromBody(body: BodyInit | null | undefined) {
  return jsonResponse(buildPreview(readPreviewBody(body)));
}

function buildPreview(input: ReturnType<typeof readPreviewBody>) {
  const definitions = buildCatalogue();
  const selected = input.offeredOwnedCardIds.includes(courierCopyId);
  return {
    imbalanceWarningRequired: false,
    issues: [
      ...(input.offeredOwnedCardIds.length ? [] : ['offer_required']),
      ...(input.requestedDefinitions.length ? [] : ['request_required']),
    ],
    limits: {
      maximumCopiesPerSide: 5,
      minimumCreatureCopies: 3,
      minimumPowerCopies: 2,
    },
    offeredRarityPoints: input.offeredOwnedCardIds.length * 2,
    ownedCopies: [
      {
        ...tradeCard(definitions[0]!),
        ownedCardId: courierCopyId,
        availability: selected ? 'selected_here' : 'available',
      },
      {
        ...tradeCard(definitions[2]!),
        ownedCardId: atlasCopyId,
        availability: 'saved_deck',
      },
    ],
    requestedDefinitions: input.requestedDefinitions.map((request) => ({
      ...tradeCard(
        definitions.find(
          (definition) =>
            definition.cardDefinitionId === request.cardDefinitionId,
        )!,
      ),
      quantity: request.quantity,
    })),
    requestedRarityPoints: input.requestedDefinitions.reduce(
      (sum, request) => sum + request.quantity * 2,
      0,
    ),
    requestId: 'preview',
    valid:
      input.offeredOwnedCardIds.length > 0 &&
      input.requestedDefinitions.length > 0,
  };
}

function tradeCard(definition: ReturnType<typeof buildDefinition>) {
  return {
    affinity: definition.affinity,
    cardDefinitionId: definition.cardDefinitionId,
    category: definition.category,
    imageAlt: definition.imageAlt,
    imageUrl: definition.imageUrl,
    name: definition.name,
    rarity: definition.rarity,
  };
}

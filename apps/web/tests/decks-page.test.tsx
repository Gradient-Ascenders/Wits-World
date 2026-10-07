import { selectOption } from './fixtures/select-option';
import { AppToaster } from '../src/components/AppToaster';
import { toast } from 'sonner';
import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OwnedCard } from '../src/api/cards';
import type { SavedDeck } from '../src/api/decks';
import { MatchApiError, MatchModuleLoadError } from '../src/api/match-errors';
import DecksPage, { SelectedDeckHandoff } from '../src/pages/DecksPage';
import { buildCard, buildStarterCards, jsonResponse } from './fixtures/cards';
import {
  buildSavedDeck,
  deckErrorResponse,
  deckListResponse,
  deckResponse,
} from './fixtures/decks';

const apiBaseUrl = 'https://api.example.test/api/v1';

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((media: string) => ({
      media,
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  toast.dismiss();
  vi.unstubAllGlobals();
});

function createAuthValue(
  overrides: Partial<Auth0ContextInterface> = {},
): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
    loginWithRedirect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Auth0ContextInterface;
}

function renderDecks(
  authValue = createAuthValue(),
  onStartMatch?: (deckId: string, signal: AbortSignal) => Promise<void> | void,
) {
  return render(
    <Auth0Context.Provider value={authValue}>
      <AppToaster />
      <DecksPage apiBaseUrl={apiBaseUrl} onStartMatch={onStartMatch} />
    </Auth0Context.Provider>,
  );
}

function collectionResponse(cards: object[]) {
  return jsonResponse({ cards, requestId: 'collection-request' });
}

function stubInitialState(decks: SavedDeck[], cards: object[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/decks')) {
        return Promise.resolve(deckListResponse(decks));
      }

      if (url.endsWith('/cards/collection')) {
        return Promise.resolve(collectionResponse(cards));
      }

      throw new Error(`Unexpected request: ${url}`);
    }),
  );
}

describe('saved deck management page', () => {
  it('opens shared card rules from the roster, picker, and draft without changing the lineup', async () => {
    const user = userEvent.setup();
    const cards = buildStarterCards('wit');
    stubInitialState([buildSavedDeck()], cards);
    renderDecks();
    const roster = await screen.findByRole('list', {
      name: 'Campus Five cards',
    });
    const rosterCard = within(roster).getByRole('button', {
      name: `View ${cards[0]!.name} details`,
    });
    await user.click(rosterCard);
    const creatureDetails = screen.getByRole('dialog', {
      name: cards[0]!.name,
    });
    expect(
      within(creatureDetails).getByRole('heading', { name: 'Moves' }),
    ).toBeVisible();
    expect(
      within(creatureDetails).getByText(cards[0]!.moves[0]!.name),
    ).toBeVisible();
    await user.keyboard('{Escape}');
    expect(rosterCard).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Edit deck' }));
    const picker = screen.getByRole('list', {
      name: 'Owned cards available for this deck',
    });
    const powerCard = within(picker).getByRole('button', {
      name: `View ${cards[3]!.name} details`,
    });
    await user.click(powerCard);
    expect(
      within(screen.getByRole('dialog', { name: cards[3]!.name })).getByRole(
        'heading',
        { name: 'Effects' },
      ),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: `Close ${cards[3]!.name} details` }),
    );
    expect(powerCard).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Deck name' })).toHaveValue(
      'Campus Five',
    );

    const draft = screen.getByRole('region', { name: 'Your lineup' });
    await user.click(
      within(draft).getByRole('button', {
        name: `View ${cards[1]!.name} details`,
      }),
    );
    expect(screen.getByRole('dialog', { name: cards[1]!.name })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(
      within(draft).getAllByRole('button', { name: /^Remove /u }),
    ).toHaveLength(5);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves exact selected copies across gallery pages and resets the page when filtering', async () => {
    const user = userEvent.setup();
    const cards = [
      ...buildStarterCards('wit'),
      ...Array.from({ length: 9 }, (_, index) =>
        buildCard(index + 6, { name: `Archive card ${index + 6}` }),
      ),
    ];
    stubInitialState([], cards);
    renderDecks();
    await user.click(
      await screen.findByRole('button', { name: 'Create a deck' }),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Deck name' }),
      'Across the library',
    );
    const picker = screen.getByRole('list', {
      name: 'Owned cards available for this deck',
    });
    expect(within(picker).getAllByRole('article')).toHaveLength(6);
    await user.click(
      screen.getByRole('button', { name: `Add a copy of ${cards[0]!.name}` }),
    );
    const pages = screen.getByRole('navigation', {
      name: 'Card gallery pages',
    });
    await user.click(
      within(pages).getByRole('button', { name: 'Next card page' }),
    );
    expect(within(picker).getAllByRole('article')).toHaveLength(6);
    await user.click(
      within(pages).getByRole('button', { name: 'Next card page' }),
    );
    expect(within(picker).getAllByRole('article')).toHaveLength(2);
    await user.click(
      screen.getByRole('button', { name: `Add a copy of ${cards[12]!.name}` }),
    );
    await user.type(
      screen.getByRole('searchbox', { name: 'Search cards' }),
      cards[0]!.name,
    );
    expect(within(picker).getAllByRole('article')).toHaveLength(1);
    expect(within(picker).getByText('Owned 1 · 1 point')).toBeVisible();
    await user.clear(screen.getByRole('searchbox', { name: 'Search cards' }));
    expect(within(picker).getAllByRole('article')).toHaveLength(6);
    expect(
      within(pages).getByRole('button', { name: 'Previous card page' }),
    ).toBeDisabled();
    const draft = screen.getByRole('region', { name: 'Your lineup' });
    expect(within(draft).getByText(cards[0]!.name)).toBeVisible();
    expect(within(draft).getByText(cards[12]!.name)).toBeVisible();
    expect(
      within(draft).getAllByRole('button', { name: /^Remove /u }),
    ).toHaveLength(2);
    expect(screen.getByRole('textbox', { name: 'Deck name' })).toHaveValue(
      'Across the library',
    );
  });

  it('uses exact owned copies for saved artwork and keeps an unavailable copy honest', async () => {
    const cards = buildStarterCards('wit');
    const deck = buildSavedDeck();
    stubInitialState(
      [deck],
      [
        {
          ...cards[0]!,
          ownedCardId: '00000000-0000-4000-8000-000000000999',
          imageUrl: '/cards/ciphra.webp',
        },
        { ...cards[1]!, imageUrl: '/cards/quillume.webp' },
        ...cards.slice(2),
      ],
    );
    renderDecks();
    const roster = await screen.findByRole('list', {
      name: `${deck.name} cards`,
    });
    expect(
      within(roster).getByRole('img', {
        name: `${cards[0]!.name} artwork unavailable`,
      }),
    ).toBeVisible();
    expect(
      within(roster).getByAltText(`${cards[1]!.name} card artwork`),
    ).toHaveAttribute('src', '/cards/quillume.webp');
    expect(roster.querySelector('img[src="/cards/ciphra.webp"]')).toBeNull();
  });

  it('preserves selected copies through filters and confirms discarding edits', async () => {
    const user = userEvent.setup();
    const cards = buildStarterCards('wit');
    stubInitialState([buildSavedDeck()], cards);
    renderDecks();
    await user.click(await screen.findByRole('button', { name: 'Edit deck' }));
    expect(screen.getByText('No changes')).toBeVisible();
    await user.click(
      screen.getByRole('button', {
        name: `Remove a copy of ${cards[0]!.name}`,
      }),
    );
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    await user.type(
      screen.getByRole('searchbox', { name: 'Search cards' }),
      'no such card',
    );
    expect(
      screen.getByRole('heading', { name: 'No matching cards' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await selectOption(user, screen.getByLabelText('Type'), 'power');
    expect(
      within(
        screen.getByRole('list', {
          name: 'Owned cards available for this deck',
        }),
      ).getAllByRole('article'),
    ).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByRole('heading', { name: 'Campus Five' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Edit deck' }));
    expect(screen.getByText('No changes')).toBeVisible();
  });

  it('announces loading before showing empty saved-deck and collection states', async () => {
    const requests: Array<(response: Response) => void> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            requests.push(resolve);
          }),
      ),
    );

    const user = userEvent.setup();
    renderDecks();

    expect(
      screen.getByRole('navigation', { name: 'Collection sections' }),
    ).toContainElement(screen.getByRole('link', { name: 'Decks' }));
    expect(screen.getByRole('link', { name: 'Decks' })).toHaveAttribute(
      'href',
      '/collection/decks',
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading decks');

    await waitFor(() => expect(requests).toHaveLength(2));
    requests[0]!(deckListResponse([]));
    requests[1]!(collectionResponse([]));

    expect(
      await screen.findByRole('heading', { name: 'No saved decks yet' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create a deck' }));
    expect(
      screen.getByRole('heading', { name: 'Your collection is empty' }),
    ).toBeVisible();
    expect(
      screen.getByText('Choose Add cards to build your deck.'),
    ).toBeVisible();
  });

  it('creates, renames, edits, selects, hands off, and deletes a deck', async () => {
    const user = userEvent.setup();
    const cards = buildStarterCards('wit') as OwnedCard[];
    let decks: SavedDeck[] = [];
    const onStartMatch = vi.fn();
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.endsWith('/cards/collection')) {
          return collectionResponse(cards);
        }

        if (url.endsWith('/decks') && method === 'GET') {
          return deckListResponse(decks);
        }

        if (url.endsWith('/decks') && method === 'POST') {
          const body = JSON.parse(String(init?.body)) as {
            name: string;
            ownedCardIds: string[];
          };
          const created = buildSavedDeck({
            cards: body.ownedCardIds.map((ownedCardId, index) => {
              const card = cards.find(
                (item) => item.ownedCardId === ownedCardId,
              )!;
              return {
                affinity: card.affinity,
                cardDefinitionId: card.cardDefinitionId,
                category: card.category,
                name: card.name,
                ownedCardId,
                position: index + 1,
                rarity: card.rarity,
              };
            }),
            name: body.name,
          });
          decks = [created];
          return deckResponse(created, 201);
        }

        const deck = decks[0];
        if (!deck) {
          throw new Error(`Unexpected deck mutation: ${url}`);
        }

        if (url.endsWith(`/${deck.deckId}/selection`) && method === 'PUT') {
          const selected = { ...deck, isSelected: true };
          decks = [selected];
          return deckResponse(selected);
        }

        if (url.endsWith(`/${deck.deckId}`) && method === 'PUT') {
          const body = JSON.parse(String(init?.body)) as {
            name: string;
            ownedCardIds: string[];
          };
          const updated = { ...deck, name: body.name };
          decks = [updated];
          return deckResponse(updated);
        }

        if (url.endsWith(`/${deck.deckId}`) && method === 'DELETE') {
          decks = [];
          return new Response(null, { status: 204 });
        }

        throw new Error(`Unexpected request: ${method} ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    renderDecks(undefined, onStartMatch);
    await user.click(
      await screen.findByRole('button', { name: 'Create a deck' }),
    );

    const editorHeading = screen.getByRole('heading', { name: 'Build a deck' });
    expect(editorHeading).toHaveFocus();
    await user.type(
      screen.getByRole('textbox', { name: 'Deck name' }),
      'Campus Five',
    );

    for (const card of cards) {
      await user.click(
        screen.getByRole('button', { name: `Add a copy of ${card.name}` }),
      );
    }

    expect(screen.getByText('Complete lineup')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create deck' }));

    expect(
      await screen.findByRole('heading', { name: 'Campus Five' }),
    ).toBeVisible();
    expect(screen.getByText('Campus Five was created.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Edit deck' }));
    const nameField = screen.getByRole('textbox', { name: 'Deck name' });
    await user.clear(nameField);
    await user.type(nameField, 'Library Lineup');
    await user.click(screen.getByRole('button', { name: 'Save deck' }));
    expect(
      await screen.findByRole('heading', { name: 'Library Lineup' }),
    ).toBeVisible();

    const selectButton = screen.getByRole('button', { name: 'Make active' });
    selectButton.focus();
    await user.keyboard('{Enter}');
    expect(
      await screen.findByText('Library Lineup is now your active deck.'),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Library Lineup' }),
    ).toHaveFocus();
    expect(
      within(screen.getByRole('article', { name: 'Library Lineup' })).getByText(
        'Active',
        { exact: true },
      ),
    ).toBeVisible();

    const startButton = screen.getByRole('button', { name: 'Start CPU match' });
    startButton.focus();
    await user.keyboard('{Enter}');
    expect(onStartMatch).toHaveBeenCalledWith(
      decks[0]!.deckId,
      expect.any(AbortSignal),
    );

    const deleteControl = screen.getByRole('button', { name: 'Delete' });
    deleteControl.focus();
    await user.keyboard('{Enter}');
    let confirmation = screen.getByRole('group', {
      name: 'Delete Library Lineup',
    });
    expect(
      within(confirmation).getByRole('button', { name: 'Delete deck' }),
    ).toHaveFocus();
    await user.tab();
    expect(
      within(confirmation).getByRole('button', { name: 'Keep deck' }),
    ).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus(),
    );

    await user.keyboard('{Enter}');
    confirmation = screen.getByRole('group', {
      name: 'Delete Library Lineup',
    });
    await user.click(
      within(confirmation).getByRole('button', { name: 'Delete deck' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'No saved decks yet' }),
    ).toBeVisible();
    expect(screen.getByText(/owned cards were not removed/i)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Start CPU match' }),
    ).not.toBeInTheDocument();
  });

  it('shows one selected deck detail and switches it from compact summaries', async () => {
    const user = userEvent.setup();
    const firstDeck = buildSavedDeck({ name: 'First Campus Five' });
    const activeDeck = buildSavedDeck({
      cards: firstDeck.cards.map((card) => ({
        ...card,
        name: `Active ${card.name}`,
      })),
      deckId: '00000000-0000-4000-8000-000000000901',
      isSelected: true,
      name: 'The Exceptionally Long-Named Senate House Strategy Deck',
    });
    const thirdDeck = buildSavedDeck({
      cards: firstDeck.cards.map((card) => ({
        ...card,
        affinity: 'spark',
        name: `Spark ${card.name}`,
      })),
      deckId: '00000000-0000-4000-8000-000000000902',
      name: 'Spark Five',
    });
    stubInitialState(
      [firstDeck, activeDeck, thirdDeck],
      buildStarterCards('wit'),
    );

    renderDecks();

    expect(
      await screen.findByRole('article', {
        name: 'The Exceptionally Long-Named Senate House Strategy Deck',
      }),
    ).toBeVisible();
    expect(screen.getAllByRole('list', { name: / cards$/u })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Edit deck' })).toHaveLength(
      1,
    );
    expect(screen.getAllByText(/Wit ×5/u)).toHaveLength(3);

    const sparkSummary = screen.getByRole('button', {
      name: 'View details for Spark Five',
    });
    sparkSummary.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('heading', { name: 'Spark Five' })).toHaveFocus();
    expect(screen.getByRole('article', { name: 'Spark Five' })).toBeVisible();
    expect(screen.getAllByText(/Spark ×5/u)).toHaveLength(2);
    expect(
      screen.queryByRole('list', {
        name: 'The Exceptionally Long-Named Senate House Strategy Deck cards',
      }),
    ).not.toBeInTheDocument();
  });

  it('never exposes more duplicate copies than the collection owns', async () => {
    const user = userEvent.setup();
    const first = buildCard(1);
    const duplicate = buildCard(2, {
      cardDefinitionId: first.cardDefinitionId,
      name: first.name,
    });
    const cards = [
      first,
      duplicate,
      buildCard(3),
      buildCard(4, { category: 'power', hp: null, moves: [], power: null }),
      buildCard(5, { category: 'power', hp: null, moves: [], power: null }),
    ];
    stubInitialState([], cards);

    renderDecks();
    await user.click(
      await screen.findByRole('button', { name: 'Create a deck' }),
    );
    const addDuplicate = screen.getByRole('button', {
      name: `Add a copy of ${first.name}`,
    });
    const duplicatePickerCard = screen.getByRole('article', {
      name: first.name,
    });

    await user.click(addDuplicate);
    expect(
      within(duplicatePickerCard).getByRole('status', {
        name: `1 copy of ${first.name} selected`,
      }),
    ).toBeVisible();
    expect(
      within(duplicatePickerCard).getByText('1 copy available'),
    ).toBeVisible();
    await user.click(addDuplicate);
    expect(
      within(duplicatePickerCard).getByRole('status', {
        name: `2 copies of ${first.name} selected`,
      }),
    ).toBeVisible();
    expect(
      within(duplicatePickerCard).queryByText('All copies selected'),
    ).not.toBeInTheDocument();
    expect(addDuplicate).toBeDisabled();

    await user.click(
      screen.getByRole('button', {
        name: `Remove a copy of ${first.name}`,
      }),
    );
    expect(
      within(duplicatePickerCard).getByRole('status', {
        name: `1 copy of ${first.name} selected`,
      }),
    ).toBeVisible();
    expect(addDuplicate).toBeEnabled();
    expect(
      screen.getAllByRole('listitem', { hidden: false }).length,
    ).toBeGreaterThan(0);
  });

  it('blocks a second deck action while a mutation is unresolved', async () => {
    const user = userEvent.setup();
    const firstDeck = buildSavedDeck();
    const secondDeck = buildSavedDeck({
      deckId: '00000000-0000-4000-8000-000000000901',
      name: 'Second deck',
    });
    let resolveSelection!: (response: Response) => void;
    const selectionResponse = new Promise<Response>((resolve) => {
      resolveSelection = resolve;
    });
    const fetchMock = vi.fn(
      (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.endsWith('/cards/collection')) {
          return Promise.resolve(collectionResponse(buildStarterCards('wit')));
        }

        if (url.endsWith('/decks') && method === 'GET') {
          return Promise.resolve(deckListResponse([firstDeck, secondDeck]));
        }

        if (
          url.endsWith(`/${firstDeck.deckId}/selection`) &&
          method === 'PUT'
        ) {
          return selectionResponse;
        }

        throw new Error(`Unexpected request: ${method} ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    renderDecks();
    const selectButton = await screen.findByRole('button', {
      name: 'Make active',
    });
    await user.click(selectButton);

    expect(
      await screen.findByRole('button', { name: 'Selecting…' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Create a deck' }),
    ).toBeDisabled();
    const summaryButtons = screen.getAllByRole('button', {
      name: /View details for/u,
    });
    for (const button of summaryButtons) {
      expect(button).toBeDisabled();
    }
    for (const button of screen.getAllByRole('button', {
      name: 'Edit deck',
    })) {
      expect(button).toBeDisabled();
    }
    for (const button of screen.getAllByRole('button', { name: 'Delete' })) {
      expect(button).toBeDisabled();
    }

    await user.click(summaryButtons[1]!);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    resolveSelection(deckResponse({ ...firstDeck, isSelected: true }));
    expect(
      await screen.findByText(`${firstDeck.name} is now your active deck.`),
    ).toBeVisible();
  });

  it('keeps focus on the add control when the final card completes preflight', async () => {
    const user = userEvent.setup();
    const cards = buildStarterCards('wit');
    stubInitialState([], cards);

    renderDecks();
    await user.click(
      await screen.findByRole('button', { name: 'Create a deck' }),
    );

    for (const card of cards.slice(0, 4)) {
      await user.click(
        screen.getByRole('button', { name: `Add a copy of ${card.name}` }),
      );
    }

    const finalAdd = screen.getByRole('button', {
      name: `Add a copy of ${cards[4]!.name}`,
    });
    finalAdd.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByText('Complete lineup')).toBeVisible();
    expect(finalAdd).toHaveFocus();
    expect(
      screen.getByRole('heading', { name: 'Deck status' }),
    ).not.toHaveFocus();
  });

  it('explains an invalid point-cap draft and prevents client submission', async () => {
    const user = userEvent.setup();
    const cards = buildStarterCards('wit').map((card, index) => ({
      ...card,
      rarity: index < 3 ? 'legendary' : 'common',
    }));
    stubInitialState([], cards);

    renderDecks();
    await user.click(
      await screen.findByRole('button', { name: 'Create a deck' }),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Deck name' }),
      'Too costly',
    );

    for (const card of cards) {
      await user.click(
        screen.getByRole('button', { name: `Add a copy of ${card.name}` }),
      );
    }

    expect(screen.getByText('14 / 10')).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Deck status' })).getByText(
        'Reduce rarity points to 10 or fewer.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create deck' })).toBeDisabled();
  });

  it('focuses useful server validation feedback without accepting the draft', async () => {
    const user = userEvent.setup();
    const cards = buildStarterCards('wit');
    const fetchMock = vi.fn(
      (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/cards/collection')) {
          return Promise.resolve(collectionResponse(cards));
        }
        if (url.endsWith('/decks') && (init?.method ?? 'GET') === 'GET') {
          return Promise.resolve(deckListResponse([]));
        }
        if (url.endsWith('/decks') && init?.method === 'POST') {
          return Promise.resolve(
            deckErrorResponse(400, 'DECK_COMPOSITION_INVALID'),
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    renderDecks();
    await user.click(
      await screen.findByRole('button', { name: 'Create a deck' }),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Deck name' }),
      'Server check',
    );
    for (const card of cards) {
      await user.click(
        screen.getByRole('button', { name: `Add a copy of ${card.name}` }),
      );
    }
    await user.click(screen.getByRole('button', { name: 'Create deck' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveFocus();
    expect(alert).toHaveTextContent(
      'The server requires exactly three Creature cards and two Power cards.',
    );
    expect(screen.getByRole('heading', { name: 'Build a deck' })).toBeVisible();
  });

  it('offers reauthentication after a mutation session expires', async () => {
    const user = userEvent.setup();
    const cards = buildStarterCards('wit');
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.endsWith('/cards/collection')) {
          return Promise.resolve(collectionResponse(cards));
        }

        if (url.endsWith('/decks') && method === 'GET') {
          return Promise.resolve(deckListResponse([]));
        }

        if (url.endsWith('/decks') && method === 'POST') {
          return Promise.resolve(deckErrorResponse(401, 'SESSION_EXPIRED'));
        }

        throw new Error(`Unexpected request: ${method} ${url}`);
      }),
    );

    renderDecks(createAuthValue({ loginWithRedirect }));
    await user.click(
      await screen.findByRole('button', { name: 'Create a deck' }),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Deck name' }),
      'Expired change',
    );
    for (const card of cards) {
      await user.click(
        screen.getByRole('button', { name: `Add a copy of ${card.name}` }),
      );
    }
    await user.click(screen.getByRole('button', { name: 'Create deck' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveFocus();
    await user.click(
      within(alert).getByRole('button', { name: 'Sign in again' }),
    );
    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/collection/decks' },
    });
  });

  it('refreshes authoritative state after a stale deck action', async () => {
    const user = userEvent.setup();
    const deck = buildSavedDeck();
    const cards = buildStarterCards('wit');
    let listCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.endsWith('/cards/collection')) {
          return Promise.resolve(collectionResponse(cards));
        }
        if (url.endsWith('/decks') && method === 'GET') {
          listCount += 1;
          return Promise.resolve(
            deckListResponse(listCount === 1 ? [deck] : []),
          );
        }
        if (url.endsWith('/selection')) {
          return Promise.resolve(deckErrorResponse(404, 'DECK_NOT_FOUND'));
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderDecks();
    await user.click(
      await screen.findByRole('button', { name: 'Make active' }),
    );

    expect(
      await screen.findByText(/changed or was deleted elsewhere/i),
    ).toBeVisible();
    expect(
      await screen.findByRole('heading', { name: 'No saved decks yet' }),
    ).toBeVisible();
    expect(listCount).toBe(2);
  });

  it('offers recovery from API failure and reauthentication', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(deckErrorResponse(503, 'SERVICE_UNAVAILABLE'))
      .mockResolvedValueOnce(collectionResponse([]))
      .mockResolvedValueOnce(deckListResponse([]))
      .mockResolvedValueOnce(collectionResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    renderDecks();
    expect(
      await screen.findByRole('heading', {
        name: 'Saved decks could not load',
      }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try loading again' }));
    expect(
      await screen.findByRole('heading', { name: 'No saved decks yet' }),
    ).toBeVisible();

    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(deckErrorResponse(401, 'SESSION_EXPIRED')),
    );
    renderDecks(createAuthValue({ loginWithRedirect }));
    await user.click(
      await screen.findByRole('button', { name: 'Sign in again' }),
    );
    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/collection/decks' },
    });
  });

  it('exposes the selected deck id to the future match boundary by keyboard', async () => {
    const user = userEvent.setup();
    const deck = buildSavedDeck({ isSelected: true });
    const onStartMatch = vi.fn();

    render(<SelectedDeckHandoff deck={deck} onStartMatch={onStartMatch} />);
    const button = screen.getByRole('button', { name: 'Start CPU match' });
    button.focus();
    await user.keyboard('{Enter}');

    expect(onStartMatch).toHaveBeenCalledWith(deck.deckId);
  });

  it('keeps match start pending and offers reload when the module cannot load', async () => {
    const user = userEvent.setup();
    const deck = buildSavedDeck({ isSelected: true });
    stubInitialState([deck], buildStarterCards('wit'));
    let rejectStart: (reason: unknown) => void = () => {};
    const onStartMatch = vi.fn().mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectStart = reject;
        }),
    );

    renderDecks(undefined, onStartMatch);
    const start = await screen.findByRole('button', {
      name: 'Start CPU match',
    });
    await user.click(start);
    expect(
      screen.getByRole('button', { name: 'Starting CPU match…' }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: 'Starting CPU match…' }),
    );
    expect(onStartMatch).toHaveBeenCalledTimes(1);

    rejectStart(new MatchModuleLoadError());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('CPU match not opened.');
    expect(alert).toHaveTextContent(
      'The match code could not load. Check your connection, then reload this page to try again.',
    );
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Reconcile and try again' }),
    ).not.toBeInTheDocument();
    expect(onStartMatch).toHaveBeenCalledTimes(1);
  });

  it('keeps the reconciliation retry for match API failures', async () => {
    const user = userEvent.setup();
    const deck = buildSavedDeck({ isSelected: true });
    stubInitialState([deck], buildStarterCards('wit'));
    const onStartMatch = vi
      .fn()
      .mockRejectedValueOnce(new MatchApiError('unavailable'))
      .mockResolvedValueOnce(undefined);

    renderDecks(undefined, onStartMatch);
    await user.click(
      await screen.findByRole('button', { name: 'Start CPU match' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Wits World will reconcile an active match before creating anything.',
    );
    expect(screen.queryByRole('button', { name: 'Reload page' })).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Reconcile and try again' }),
    );
    expect(onStartMatch).toHaveBeenCalledTimes(2);
  });
});

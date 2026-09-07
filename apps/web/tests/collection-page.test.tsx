import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CollectionPage from '../src/pages/CollectionPage';
import {
  buildCard,
  buildStarterCards,
  buildStarterOptions,
  buildUuid,
  jsonResponse,
} from './fixtures/cards';

const apiBaseUrl = 'https://api.example.test/api/v1';

afterEach(() => {
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

function renderCollection(authValue = createAuthValue()) {
  return render(
    <Auth0Context.Provider value={authValue}>
      <CollectionPage apiBaseUrl={apiBaseUrl} />
    </Auth0Context.Provider>,
  );
}

function collectionResponse(cards: object[]) {
  return jsonResponse({ cards, requestId: 'collection-request' });
}

function starterResponse(affinity = 'wit') {
  return jsonResponse(
    {
      affinity,
      cards: buildStarterCards(affinity),
      grantedAt: '2026-08-15T08:00:00.000Z',
      requestId: 'starter-request',
      starterGrantId: buildUuid(700),
    },
    201,
  );
}

function starterOptionsResponse() {
  return jsonResponse({
    options: buildStarterOptions(),
    requestId: 'starter-options-request',
  });
}

function evolutionDefinition(
  card: ReturnType<typeof buildCard>,
  overrides: Record<string, unknown> = {},
) {
  const { acquiredAt, acquisitionKind, ownedCardId, ...definition } = card;
  void acquiredAt;
  void acquisitionKind;
  void ownedCardId;

  return {
    ...definition,
    deckPointCost: card.rarity === 'common' ? 1 : 3,
    imageAlt: null,
    ...overrides,
  };
}

function evolutionPreview(
  cards: ReturnType<typeof buildCard>[],
  eligibleCopyCount = cards.length,
) {
  const source = evolutionDefinition(cards[0]!);
  const targetCard = buildCard(1900, {
    affinity: source.affinity,
    cardDefinitionId: buildUuid(1900),
    imageAlt: 'Quillume evolved card artwork',
    name: 'Quillume',
    rarity: 'epic',
  });
  const copies = cards.map((card, index) => ({
    acquiredAt: card.acquiredAt,
    acquisitionKind: card.acquisitionKind,
    eligible: index < eligibleCopyCount,
    lockReason: index < eligibleCopyCount ? null : 'saved_deck',
    ownedCardId: card.ownedCardId,
  }));
  const deckLockedCopyCount = cards.length - eligibleCopyCount;

  return {
    canEvolve: eligibleCopyCount >= 3,
    copies,
    copiesRequired: 3,
    deckLockedCopyCount,
    eligibleCopyCount,
    ownedCopyCount: cards.length,
    requestId: 'evolution-preview-request',
    source,
    target: evolutionDefinition(targetCard, { deckPointCost: 3 }),
    unavailableReason:
      eligibleCopyCount >= 3
        ? null
        : cards.length >= 3 && deckLockedCopyCount > 0
          ? 'saved_deck_lock'
          : 'insufficient_copies',
  };
}

function evolutionResult(
  preview: ReturnType<typeof evolutionPreview>,
  submissionId: string,
) {
  return {
    completedAt: '2026-09-07T12:00:00.000Z',
    consumedOwnedCardIds: preview.copies
      .filter((copy) => copy.eligible)
      .slice(0, 3)
      .map((copy) => copy.ownedCardId),
    evolutionId: buildUuid(1910),
    newCard: buildCard(1911, {
      acquisitionKind: 'evolution',
      cardDefinitionId: preview.target.cardDefinitionId,
      imageAlt: preview.target.imageAlt,
      name: preview.target.name,
      ownedCardId: buildUuid(1911),
      rarity: preview.target.rarity,
    }),
    replayed: false,
    requestId: 'evolution-result-request',
    sourceCardDefinitionId: preview.source.cardDefinitionId,
    submissionId,
    target: preview.target,
  };
}

function duplicateCards(count: number) {
  const cardDefinitionId = buildUuid(1800);
  return Array.from({ length: count }, (_, index) =>
    buildCard(1800 + index, {
      acquiredAt: `2026-09-0${index + 1}T08:00:00.000Z`,
      acquisitionKind: index === 0 ? 'starter' : 'event_reward',
      cardDefinitionId,
      name: 'Quillip',
      ownedCardId: buildUuid(1810 + index),
    }),
  );
}

describe('card collection page', () => {
  it('loads and renders the server-provided starter comparison without redundant empty messaging', async () => {
    const user = userEvent.setup();
    let resolveOptions!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(collectionResponse([]))
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              resolveOptions = resolve;
            }),
        ),
    );

    renderCollection();

    expect(screen.getByRole('status')).toHaveTextContent('Loading your cards');
    expect(
      await screen.findByRole('heading', {
        name: 'Choose your starter affinity',
      }),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading your choices',
    );
    await waitFor(() => expect(resolveOptions).toBeTypeOf('function'));
    resolveOptions(starterOptionsResponse());

    expect(await screen.findByText('Pressure')).toBeVisible();
    expect(screen.getByText('Durability')).toBeVisible();
    expect(screen.getByText('Flexibility')).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Your collection is empty' }),
    ).not.toBeInTheDocument();
    const sparkChoice = screen.getByRole('radio', { name: /Spark/i });
    expect(sparkChoice).toBeChecked();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(
      screen.queryByRole('radio', { name: /Spirit/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: /Mystic/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Spirit, Mystic, and other cards/i)).toBeVisible();

    const sparkOption = sparkChoice.closest('article');
    expect(sparkOption).not.toBeNull();
    await user.click(within(sparkOption!).getByText('View exact package'));
    expect(within(sparkOption!).getByText('spark Creature 1')).toBeVisible();
    const moveList = within(sparkOption!).getByRole('list', {
      name: 'spark Creature 1 moves',
    });
    expect(moveList.children).toHaveLength(4);
    expect(within(moveList).getByText(/11 base damage/u)).toBeVisible();
    expect(
      within(moveList).getByText(/Opponent damage −10% · 2 turns/u),
    ).toBeVisible();
    expect(
      within(sparkOption!).queryByText(/multiply/u),
    ).not.toBeInTheDocument();
  });

  it('requires final confirmation, submits only the affinity, and focuses the server result', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(collectionResponse([]))
      .mockResolvedValueOnce(starterOptionsResponse())
      .mockResolvedValueOnce(starterResponse('grit'));
    vi.stubGlobal('fetch', fetchMock);

    renderCollection();
    await user.click(await screen.findByRole('radio', { name: /Grit/i }));
    await user.click(
      screen.getByRole('button', { name: 'Review Grit choice' }),
    );

    const confirmation = screen.getByRole('heading', {
      name: 'Confirm Grit — Durability',
    });
    expect(confirmation).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await user.click(
      screen.getByRole('button', { name: 'Confirm Grit starter' }),
    );

    const resultHeading = await screen.findByRole('heading', {
      level: 1,
      name: 'Your Grit starter set',
    });
    expect(resultHeading).toHaveFocus();
    expect(
      screen.getByRole('list', { name: 'Granted starter cards' }).children,
    ).toHaveLength(5);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${apiBaseUrl}/cards/starter`,
      expect.objectContaining({ body: JSON.stringify({ affinity: 'grit' }) }),
    );
    expect(
      screen.getByText('5 cards recorded · 3 Creatures · 2 Power cards'),
    ).toBeVisible();
  });

  it('retries the starter-options request without reloading the collection', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(collectionResponse([]))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(starterOptionsResponse());
    vi.stubGlobal('fetch', fetchMock);

    renderCollection();

    expect(
      await screen.findByRole('heading', {
        name: 'Your choices could not load',
      }),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Try loading choices again' }),
    );

    expect(await screen.findByText('Pressure')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith('/cards/collection'),
      ),
    ).toHaveLength(1);
  });

  it('keeps event rewards browseable while starter options fail and retry', async () => {
    const user = userEvent.setup();
    const rewardCard = buildCard(1, {
      acquisitionKind: 'event_reward',
      name: 'Challenge Reward Guardian',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(collectionResponse([rewardCard]))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(starterOptionsResponse());
    vi.stubGlobal('fetch', fetchMock);

    renderCollection();

    expect(
      await screen.findByRole('button', {
        name: `View ${rewardCard.name} details`,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Cards you own' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Choose your starter affinity',
      }),
    ).toBeVisible();
    expect(
      await screen.findByRole('heading', {
        name: 'Your choices could not load',
      }),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Try loading choices again' }),
    );

    expect(await screen.findByText('Pressure')).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: `View ${rewardCard.name} details`,
      }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps a starter request single while submission is in flight', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(collectionResponse([]))
      .mockResolvedValueOnce(starterOptionsResponse())
      .mockImplementationOnce(() => new Promise<Response>(() => undefined));
    vi.stubGlobal('fetch', fetchMock);

    renderCollection();
    await user.click(
      await screen.findByRole('button', { name: 'Review Spark choice' }),
    );
    const submit = screen.getByRole('button', {
      name: 'Confirm Spark starter',
    });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(
      screen.getByRole('button', { name: 'Claiming your starter…' }),
    ).toBeDisabled();
  });

  it('honours an already-claimed response and reloads the authoritative collection', async () => {
    const user = userEvent.setup();
    const starterCard = buildCard(1);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(collectionResponse([]))
      .mockResolvedValueOnce(starterOptionsResponse())
      .mockResolvedValueOnce(
        jsonResponse(
          {
            code: 'STARTER_ALREADY_CLAIMED',
            detail: 'A player can select only one starter affinity.',
            requestId: 'already-request',
            status: 409,
            title: 'Starter affinity already selected',
            type: 'about:blank',
          },
          409,
        ),
      )
      .mockResolvedValueOnce(collectionResponse([starterCard]));
    vi.stubGlobal('fetch', fetchMock);

    renderCollection();
    await user.click(
      await screen.findByRole('button', { name: 'Review Spark choice' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirm Spark starter' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your starter was already chosen.',
    );
    await user.click(
      screen.getByRole('button', { name: 'Load my collection' }),
    );

    expect(
      await screen.findByRole('button', {
        name: `View ${starterCard.name} details`,
      }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Card gallery' })).toHaveFocus();
    expect(
      screen.queryByRole('heading', { name: 'Choose your starter affinity' }),
    ).not.toBeInTheDocument();
  });

  it('groups duplicate definitions while retaining every owned copy in details', async () => {
    const user = userEvent.setup();
    const definitionId = buildUuid(901);
    const first = buildCard(1, {
      cardDefinitionId: definitionId,
      name: 'Origins Centre Sentinel',
      ownedCardId: buildUuid(902),
    });
    const second = buildCard(2, {
      acquisitionKind: 'event_reward',
      cardDefinitionId: definitionId,
      name: 'Origins Centre Sentinel',
      ownedCardId: buildUuid(903),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(collectionResponse([first, second])),
    );

    renderCollection();

    const list = await screen.findByRole('list', {
      name: 'Owned card designs',
    });
    expect(list.children).toHaveLength(1);
    const trigger = within(list).getByRole('button', {
      name: `View ${first.name} details, 2 owned copies`,
    });
    expect(within(trigger).getByText('×2')).toBeVisible();
    expect(within(trigger).queryByRole('heading')).not.toBeInTheDocument();

    await user.click(trigger);
    const dialog = screen.getByRole('dialog', {
      name: `${first.name} card details`,
    });
    expect(within(dialog).getByText('×2 owned')).toBeVisible();
    await user.click(within(dialog).getByText('Copy history'));
    const copies = within(dialog).getByRole('list', {
      name: `${first.name} owned copies`,
    });
    expect(copies.children).toHaveLength(2);
    expect(within(copies).getByText('Starter card')).toBeVisible();
    expect(within(copies).getByText('Event reward')).toBeVisible();
  });

  it('shows authoritative owned, available, and deck-locked quantities', async () => {
    const user = userEvent.setup();
    const cards = duplicateCards(4);
    const preview = evolutionPreview(cards, 2);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(collectionResponse(cards))
        .mockResolvedValueOnce(jsonResponse(preview)),
    );

    renderCollection();
    const trigger = await screen.findByRole('button', {
      name: 'View Quillip details, 4 owned copies',
    });
    expect(within(trigger).getByText('×4')).toBeVisible();
    await user.click(trigger);

    const availability = await screen.findByRole('heading', {
      name: 'Evolve into Quillume',
    });
    const section = availability.closest('section');
    expect(section).not.toBeNull();
    expect(within(section!).getByText('Owned')).toBeVisible();
    expect(
      within(section!).getByText('Available').parentElement,
    ).toHaveTextContent('2');
    expect(within(section!).getByText('In decks')).toBeVisible();
    expect(
      within(section!).getByText('In decks').parentElement,
    ).toHaveTextContent('2');
    expect(section).toHaveTextContent('You need 1 more available copy');
    expect(
      within(section!).getByRole('button', { name: 'Review evolution' }),
    ).toBeDisabled();
    expect(section).toHaveTextContent(
      'Remove locked copies from saved decks first',
    );
  });

  it('previews the fixed result before confirmation and supports cancellation', async () => {
    const user = userEvent.setup();
    const cards = duplicateCards(4);
    const preview = evolutionPreview(cards, 3);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(collectionResponse(cards))
      .mockResolvedValueOnce(jsonResponse(preview));
    vi.stubGlobal('fetch', fetchMock);

    renderCollection();
    await user.click(
      await screen.findByRole('button', {
        name: 'View Quillip details, 4 owned copies',
      }),
    );
    const review = await screen.findByRole('button', {
      name: 'Review evolution',
    });
    await user.click(review);

    const heading = screen.getByRole('heading', { name: 'Evolve Quillip?' });
    expect(heading).toHaveFocus();
    expect(screen.getByText('3 available copies')).toBeVisible();
    expect(screen.getByText('1 copy')).toBeVisible();
    expect(screen.getByRole('article', { name: 'Quillume' })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('heading', { name: 'Evolve Quillip?' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Review evolution' }),
      ).toHaveFocus(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('confirms once, presents the evolved card, and refetches the collection', async () => {
    const user = userEvent.setup();
    const cards = duplicateCards(3);
    const preview = evolutionPreview(cards, 3);
    const result = evolutionResult(preview, buildUuid(1920));
    const starterAnchor = buildCard(1950, { name: 'Starter Anchor' });
    const authoritativeCards = [result.newCard, starterAnchor];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(collectionResponse([...cards, starterAnchor]))
      .mockResolvedValueOnce(jsonResponse(preview))
      .mockImplementationOnce(async (_url, options: RequestInit) => {
        const body = JSON.parse(String(options.body)) as {
          submissionId: string;
        };
        return jsonResponse(evolutionResult(preview, body.submissionId), 201);
      })
      .mockResolvedValueOnce(collectionResponse(authoritativeCards));
    vi.stubGlobal('fetch', fetchMock);

    renderCollection();
    await user.click(
      await screen.findByRole('button', {
        name: 'View Quillip details, 3 owned copies',
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Review evolution' }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm evolution' }));

    const resultHeading = await screen.findByRole('heading', {
      name: 'Quillume joined your collection',
    });
    expect(resultHeading).toHaveFocus();
    expect(screen.getByRole('article', { name: 'Quillume' })).toHaveTextContent(
      'Evolved card',
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your collection is up to date.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const mutationCall = fetchMock.mock.calls[2]!;
    expect(mutationCall[0]).toBe(`${apiBaseUrl}/cards/evolutions`);
    expect(JSON.parse(String((mutationCall[1] as RequestInit).body))).toEqual({
      sourceCardDefinitionId: preview.source.cardDefinitionId,
      submissionId: expect.any(String),
    });

    await user.click(
      screen.getByRole('button', { name: 'Close card details' }),
    );
    expect(
      screen.getByRole('button', { name: 'View Quillume details' }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Card gallery' }),
      ).toHaveFocus(),
    );
  });

  it('recovers a stale-copy conflict with refreshed eligibility and collection state', async () => {
    const user = userEvent.setup();
    const cards = duplicateCards(3);
    const initialPreview = evolutionPreview(cards, 3);
    const currentCards = cards.slice(0, 2);
    const refreshedPreview = evolutionPreview(currentCards, 2);
    const staleError = jsonResponse(
      {
        code: 'EVOLUTION_COPIES_INSUFFICIENT',
        detail: 'Three eligible copies are required for this evolution.',
        requestId: 'stale-evolution-request',
        status: 409,
        title: 'Not enough copies',
        type: 'about:blank',
      },
      409,
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(collectionResponse(cards))
      .mockResolvedValueOnce(jsonResponse(initialPreview))
      .mockResolvedValueOnce(staleError)
      .mockResolvedValueOnce(jsonResponse(refreshedPreview))
      .mockResolvedValueOnce(collectionResponse(currentCards));
    vi.stubGlobal('fetch', fetchMock);

    renderCollection();
    await user.click(
      await screen.findByRole('button', {
        name: 'View Quillip details, 3 owned copies',
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Review evolution' }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm evolution' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('collection changed before confirmation');
    expect(alert).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Review evolution' }),
    ).toBeDisabled();
    expect(screen.getByText(/You currently have 2/u)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('keeps an API failure recoverable without implying evolution succeeded', async () => {
    const user = userEvent.setup();
    const cards = duplicateCards(3);
    const preview = evolutionPreview(cards, 3);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(collectionResponse(cards))
      .mockResolvedValueOnce(jsonResponse(preview))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    renderCollection();
    await user.click(
      await screen.findByRole('button', {
        name: 'View Quillip details, 3 owned copies',
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Review evolution' }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm evolution' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('could not be completed');
    expect(alert).toHaveFocus();
    expect(
      screen.queryByRole('heading', { name: /joined your collection/u }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirm evolution' }),
    ).toBeEnabled();
  });

  it('keeps the sheet open during submission and announces refresh only after it finishes', async () => {
    const user = userEvent.setup();
    const cards = duplicateCards(3);
    const preview = evolutionPreview(cards);
    let finishEvolution!: (response: Response) => void;
    let finishRefresh!: (response: Response) => void;
    let submittedId = '';
    const anchor = buildCard(1950);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(collectionResponse([...cards, anchor]))
        .mockResolvedValueOnce(jsonResponse(preview))
        .mockImplementationOnce((_url, options: RequestInit) => {
          submittedId = JSON.parse(String(options.body)).submissionId;
          return new Promise<Response>((resolve) => {
            finishEvolution = resolve;
          });
        })
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              finishRefresh = resolve;
            }),
        ),
    );
    renderCollection();
    await user.click(
      await screen.findByRole('button', {
        name: 'View Quillip details, 3 owned copies',
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Review evolution' }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm evolution' }));
    expect(
      screen.getByRole('button', { name: 'Lower card sheet' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Close card details' }),
    ).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const result = evolutionResult(preview, submittedId);
    finishEvolution(jsonResponse(result, 201));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Refreshing your collection',
    );
    expect(
      screen.queryByText('Your collection is up to date.'),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/3 Quillip copies were consumed/u)).toBeVisible();
    finishRefresh(collectionResponse([result.newCard, anchor]));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Your collection is up to date.',
      ),
    );
  });

  it('retries a failed collection refresh without submitting another evolution', async () => {
    const user = userEvent.setup();
    const cards = duplicateCards(3);
    const preview = evolutionPreview(cards);
    const result = evolutionResult(preview, buildUuid(1920));
    const anchor = buildCard(1950);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(collectionResponse([...cards, anchor]))
      .mockResolvedValueOnce(jsonResponse(preview))
      .mockImplementationOnce((_url, options: RequestInit) =>
        jsonResponse(
          evolutionResult(
            preview,
            JSON.parse(String(options.body)).submissionId,
          ),
          201,
        ),
      )
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(collectionResponse([result.newCard, anchor]));
    vi.stubGlobal('fetch', fetchMock);
    renderCollection();
    await user.click(
      await screen.findByRole('button', {
        name: 'View Quillip details, 3 owned copies',
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Review evolution' }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm evolution' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Evolution is complete, but your collection could not be refreshed',
    );
    await user.click(
      screen.getByRole('button', { name: 'Refresh collection' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your collection is up to date.',
    );
    expect(
      fetchMock.mock.calls.filter(
        ([, options]) => (options as RequestInit)?.method === 'POST',
      ),
    ).toHaveLength(1);
  });

  it('recovers preview failure into an explanatory insufficient-copy state', async () => {
    const user = userEvent.setup();
    const cards = duplicateCards(2);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(collectionResponse(cards))
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(jsonResponse(evolutionPreview(cards))),
    );
    renderCollection();
    await user.click(
      await screen.findByRole('button', {
        name: 'View Quillip details, 2 owned copies',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Evolution availability could not be loaded',
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('button', { name: 'Review evolution' }),
    ).toBeDisabled();
    expect(screen.getByText(/Collect 1 more to evolve/u)).toBeVisible();
  });

  it('opens complete creature details and restores focus after Escape', async () => {
    const user = userEvent.setup();
    const card = buildCard(1, {
      description:
        'A very long campus story that remains readable instead of being encoded in its illustration.',
      name: 'The Exceptionally Long-Named Guardian of the Great Hall',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(collectionResponse([card])),
    );

    renderCollection();

    const trigger = await screen.findByRole('button', {
      name: `View ${card.name} details`,
    });
    expect(screen.queryByText('Knowledge Surge')).not.toBeInTheDocument();
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', {
      name: `${card.name} card details`,
    });
    const article = within(dialog).getByRole('article', { name: card.name });
    expect(within(article).getByText('Creature · Wit')).toBeVisible();
    expect(within(article).getByText('Common')).toBeVisible();
    expect(within(article).getByText('HP')).toBeVisible();
    expect(within(article).getByText('100')).toBeVisible();
    expect(
      within(article).getByRole('heading', { name: 'Moves' }),
    ).toBeVisible();
    expect(within(article).getByText('Knowledge Surge')).toBeVisible();
    expect(within(article).getByText('Damage 20')).toBeVisible();
    expect(within(article).getByText('3 Power')).toBeVisible();
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Close card details' }),
      ).toHaveFocus(),
    );

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('renders Power-card effects without irrelevant Creature placeholders', async () => {
    const user = userEvent.setup();
    const card = buildCard(4, {
      affinity: 'spirit',
      category: 'power',
      effects: [
        {
          effectType: 'heal',
          effectValue: 12,
          id: buildUuid(950),
          modifierDurationTurns: null,
          modifierOperation: null,
          modifierStat: null,
          position: 1,
        },
      ],
      hp: null,
      moves: [],
      name: 'Restorative Spirit',
      power: null,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(collectionResponse([card])),
    );

    renderCollection();

    await user.click(
      await screen.findByRole('button', {
        name: `View ${card.name} details`,
      }),
    );
    const article = within(screen.getByRole('dialog')).getByRole('article', {
      name: card.name,
    });
    expect(within(article).getByText('Power · Spirit')).toBeVisible();
    expect(
      within(article).getByRole('heading', { name: 'Effects' }),
    ).toBeVisible();
    expect(within(article).getByText('Heal 12')).toBeVisible();
    expect(within(article).queryByText('HP')).not.toBeInTheDocument();
    expect(within(article).queryByText('Power cost')).not.toBeInTheDocument();
  });

  it('filters and sorts the gallery using existing card fields', async () => {
    const user = userEvent.setup();
    const cards = [
      buildCard(1, { affinity: 'grit', name: 'Braamfontein Bulwark' }),
      buildCard(2, {
        category: 'power',
        effects: [],
        hp: null,
        name: 'Arcane Library Pass',
        power: null,
        rarity: 'legendary',
      }),
      buildCard(3, { name: 'Origins Sentinel', rarity: 'rare' }),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(collectionResponse(cards)),
    );

    renderCollection();
    const gallery = await screen.findByRole('list', {
      name: 'Owned card designs',
    });
    expect(
      within(gallery).getAllByRole('button', { name: /View .* details/u }),
    ).toHaveLength(3);

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'grit');
    expect(within(gallery).getByText('Braamfontein Bulwark')).toBeVisible();
    expect(
      within(gallery).queryByText('Origins Sentinel'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Category' }),
      'power',
    );
    expect(within(gallery).getByText('Arcane Library Pass')).toBeVisible();
    expect(
      within(gallery).queryByText('Braamfontein Bulwark'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Sort' }),
      'rarity',
    );
    expect(
      Array.from(
        gallery.querySelectorAll('.card-thumbnail__title'),
        (title) => title.textContent,
      ),
    ).toEqual([
      'Arcane Library Pass',
      'Origins Sentinel',
      'Braamfontein Bulwark',
    ]);
  });

  it('replaces failed artwork with the accessible fallback', async () => {
    const card = buildCard(1, { imageUrl: 'https://example.test/missing.png' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(collectionResponse([card])),
    );

    renderCollection();
    const artwork = await screen.findByRole('img', {
      name: `${card.name} card artwork`,
    });
    fireEvent.error(artwork);

    expect(
      screen.getByRole('img', { name: `${card.name} artwork unavailable` }),
    ).toBeVisible();
  });

  it('offers re-authentication when the collection session expires', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            code: 'UNAUTHORIZED',
            detail: 'Authentication required.',
            requestId: 'auth-request',
            status: 401,
            title: 'Unauthorized',
            type: 'about:blank',
          },
          401,
        ),
      ),
    );

    renderCollection(createAuthValue({ loginWithRedirect }));

    expect(
      await screen.findByRole('heading', { name: 'Your session has expired' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/collection' },
    });
  });

  it('recovers from a general collection failure with a fresh request', async () => {
    const user = userEvent.setup();
    const card = buildCard(1);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(collectionResponse([card]));
    vi.stubGlobal('fetch', fetchMock);

    renderCollection();

    expect(
      await screen.findByRole('heading', { name: 'Your cards could not load' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try loading again' }));

    expect(
      await screen.findByRole('button', {
        name: `View ${card.name} details`,
      }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

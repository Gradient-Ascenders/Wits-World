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
    const copies = within(dialog).getByRole('list', {
      name: `${first.name} owned copies`,
    });
    expect(copies.children).toHaveLength(2);
    expect(within(copies).getByText('Starter card')).toBeVisible();
    expect(within(copies).getByText('Event reward')).toBeVisible();
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
    expect(within(article).getByText('3')).toBeVisible();
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

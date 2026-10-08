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
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileCardPicker } from '../src/components/profile/ProfileCardPicker';
import { ProfileEditor } from '../src/components/profile/ProfileEditor';
import { StatusEmojiPicker } from '../src/components/profile/StatusEmojiPicker';
import { buildCard, jsonResponse } from './fixtures/cards';
import { buildPlayerProfile } from './fixtures/player-profile';

const apiBaseUrl = 'https://api.example.test/api/v1';

afterEach(() => {
  vi.unstubAllGlobals();
});

function authValue(): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
  };
}

function withAuth(children: ReactNode) {
  return (
    <Auth0Context.Provider value={authValue()}>
      {children}
    </Auth0Context.Provider>
  );
}

function ownedCards(count: number) {
  return Array.from({ length: count }, (_, index) =>
    buildCard(index + 1, {
      name: `Campus Card ${String(index + 1).padStart(2, '0')}`,
    }),
  );
}

function collectionFetch(cards: unknown[]) {
  return vi.fn((input: RequestInfo | URL) => {
    expect(String(input)).toBe(`${apiBaseUrl}/cards/collection?unique=true`);
    return Promise.resolve(jsonResponse({ cards, requestId: 'collection' }));
  });
}

function pointerHarness(tiles: HTMLElement[]) {
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly isPrimary: boolean;
    constructor(type: string, options: PointerEventInit = {}) {
      super(type, options);
      this.pointerId = options.pointerId ?? 1;
      this.isPrimary = options.isPrimary ?? true;
    }
  }
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'setPointerCapture',
  );
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  const bounds = tiles.map((tile, index) =>
    vi
      .spyOn(tile, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(index * 200, 0, 100, 100)),
  );
  return () => {
    bounds.forEach((spy) => spy.mockRestore());
    if (descriptor)
      Object.defineProperty(
        HTMLElement.prototype,
        'setPointerCapture',
        descriptor,
      );
    else Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
  };
}

describe('profile card picker', () => {
  it('commits a favourite-card drag only on release and suppresses the drag-generated inspection click', async () => {
    const cards = ownedCards(2);
    const changed = vi.fn();
    vi.stubGlobal('fetch', collectionFetch(cards));
    function Picker() {
      const [selected, setSelected] = useState(
        cards.map((card) => card.ownedCardId),
      );
      return (
        <ProfileCardPicker
          apiBaseUrl={apiBaseUrl}
          selected={selected}
          featured={buildPlayerProfile()}
          disabled={false}
          onChange={(ids) => {
            changed(ids);
            setSelected(ids);
          }}
        />
      );
    }
    render(withAuth(<Picker />));
    const handle = await screen.findByRole('button', {
      name: 'Reorder Campus Card 01, position 1',
    });
    const tiles = within(
      screen.getByRole('list', { name: 'Selected favourite cards' }),
    ).getAllByRole('listitem');
    const restore = pointerHarness(tiles);
    try {
      fireEvent.pointerDown(handle, {
        pointerId: 21,
        clientX: 50,
        clientY: 50,
        button: 0,
      });
      fireEvent.pointerMove(tiles[0]!, {
        pointerId: 21,
        clientX: 53,
        clientY: 50,
      });
      expect(changed).not.toHaveBeenCalled();
      expect(tiles[0]).toHaveAttribute('data-dragging', 'false');
      fireEvent.pointerMove(tiles[0]!, {
        pointerId: 21,
        clientX: 250,
        clientY: 50,
      });
      expect(tiles[0]).toHaveAttribute('data-dragging', 'true');
      expect(tiles[1]).toHaveAttribute('data-drop-target', 'true');
      expect(changed).not.toHaveBeenCalled();
      fireEvent.pointerUp(tiles[0]!, { pointerId: 21 });

      expect(changed).toHaveBeenCalledOnce();
      expect(changed).toHaveBeenCalledWith([
        cards[1]!.ownedCardId,
        cards[0]!.ownedCardId,
      ]);
      expect(
        screen.getByRole('button', {
          name: 'Reorder Campus Card 01, position 2',
        }),
      ).toBeVisible();
      expect(screen.getByRole('status')).toHaveTextContent(
        'Campus Card 01 moved to position 2.',
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Inspect favourite Campus Card 01',
        }),
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Inspect favourite Campus Card 01',
        }),
      );
      expect(
        await screen.findByRole('dialog', { name: 'Campus Card 01' }),
      ).toBeVisible();
    } finally {
      restore();
    }
  });

  it.each(['pointer cancellation', 'Escape', 'lost capture'])(
    'does not reorder favourites after %s during a drag',
    async (cancellation) => {
      const cards = ownedCards(2);
      const changed = vi.fn();
      vi.stubGlobal('fetch', collectionFetch(cards));
      render(
        withAuth(
          <ProfileCardPicker
            apiBaseUrl={apiBaseUrl}
            selected={cards.map((card) => card.ownedCardId)}
            featured={buildPlayerProfile()}
            disabled={false}
            onChange={changed}
          />,
        ),
      );
      const handle = await screen.findByRole('button', {
        name: 'Reorder Campus Card 01, position 1',
      });
      const tiles = within(
        screen.getByRole('list', { name: 'Selected favourite cards' }),
      ).getAllByRole('listitem');
      const restore = pointerHarness(tiles);
      try {
        fireEvent.pointerDown(handle, {
          pointerId: 22,
          clientX: 50,
          clientY: 50,
          button: 0,
        });
        fireEvent.pointerMove(tiles[0]!, {
          pointerId: 22,
          clientX: 250,
          clientY: 50,
        });
        if (cancellation === 'pointer cancellation')
          fireEvent.pointerCancel(tiles[0]!, { pointerId: 22 });
        else if (cancellation === 'Escape')
          fireEvent.keyDown(handle, { key: 'Escape' });
        else fireEvent.lostPointerCapture(tiles[0]!, { pointerId: 22 });
        fireEvent.pointerUp(tiles[0]!, { pointerId: 22 });
        expect(changed).not.toHaveBeenCalled();
        expect(tiles[0]).toHaveAttribute('data-dragging', 'false');
        expect(tiles[1]).toHaveAttribute('data-drop-target', 'false');
      } finally {
        restore();
      }
    },
  );

  it('loads a collection, searches and pages results, then enforces the four-card limit', async () => {
    const user = userEvent.setup();
    const cards = ownedCards(15);
    vi.stubGlobal('fetch', collectionFetch(cards));
    function Picker() {
      const [selected, setSelected] = useState(
        cards.slice(0, 4).map((card) => card.ownedCardId),
      );
      return (
        <ProfileCardPicker
          apiBaseUrl={apiBaseUrl}
          selected={selected}
          featured={buildPlayerProfile()}
          disabled={false}
          onChange={setSelected}
        />
      );
    }

    render(withAuth(<Picker />));

    expect(screen.getByText('4 of 4 selected')).toBeVisible();
    const search = await screen.findByRole('searchbox', {
      name: 'Search your cards',
    });
    expect(
      screen.getByRole('button', { name: 'Show more cards' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Select Campus Card 13' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show more cards' }));
    const fifthPageCard = screen.getByRole('button', {
      name: 'Select Campus Card 13',
    });
    expect(fifthPageCard).toBeDisabled();

    await user.clear(search);
    await user.type(search, 'Card 13');
    expect(
      screen.getByRole('button', { name: 'Select Campus Card 13' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Select Campus Card 12' }),
    ).not.toBeInTheDocument();

    await user.clear(search);
    await user.click(screen.getByRole('button', { name: 'Show more cards' }));
    await user.click(
      screen.getByRole('button', { name: 'Remove favourite Campus Card 01' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Select Campus Card 13' }),
    );
    expect(screen.getByText('4 of 4 selected')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Remove Campus Card 13' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps loading visible, reports a failed collection request, and retries', async () => {
    const user = userEvent.setup();
    const cards = ownedCards(2);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(
        jsonResponse({ cards, requestId: 'collection-retry' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(
      withAuth(
        <ProfileCardPicker
          apiBaseUrl={apiBaseUrl}
          selected={[]}
          featured={buildPlayerProfile()}
          disabled={false}
          onChange={() => {}}
        />,
      ),
    );

    expect(screen.getByText('Loading cards…')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your collection could not be loaded. Try again.',
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('button', { name: 'Select Campus Card 01' }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('supports keyboard reordering and returns focus from card inspection', async () => {
    const user = userEvent.setup();
    const cards = ownedCards(3);
    vi.stubGlobal('fetch', collectionFetch(cards));
    const onChange = vi.fn();
    render(
      withAuth(
        <ProfileCardPicker
          apiBaseUrl={apiBaseUrl}
          selected={cards.slice(0, 2).map((card) => card.ownedCardId)}
          featured={buildPlayerProfile()}
          disabled={false}
          onChange={onChange}
        />,
      ),
    );

    const reorder = await screen.findByRole('button', {
      name: 'Reorder Campus Card 01, position 1',
    });
    reorder.focus();
    await user.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith([
      cards[1]!.ownedCardId,
      cards[0]!.ownedCardId,
    ]);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Campus Card 01 moved to position 2.',
    );

    const inspect = screen.getByRole('button', {
      name: 'Inspect favourite Campus Card 01',
    });
    await user.click(inspect);
    const dialog = await screen.findByRole('dialog', {
      name: 'Campus Card 01',
    });
    expect(dialog).toBeVisible();
    expect(
      within(dialog).getByRole('button', {
        name: 'Close Campus Card 01 details',
      }),
    ).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
});

describe('status emoji picker', () => {
  it('filters by a user-facing emoji term, selects with the keyboard, and restores trigger focus', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StatusEmojiPicker value="" disabled={false} onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Choose status emoji' });

    await user.click(trigger);
    const search = screen.getByRole('combobox', { name: 'Filter emojis' });
    expect(search).toHaveFocus();
    await user.type(search, 'books');
    expect(screen.getByRole('option', { name: 'books' })).toBeVisible();
    expect(
      screen.queryByRole('option', { name: 'pizza' }),
    ).not.toBeInTheDocument();
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('📚');
    expect(
      screen.queryByRole('group', { name: 'Select an emoji' }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('clears a chosen emoji and supports Escape, outside dismissal, and disabled state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const enabledView = render(
      <>
        <StatusEmojiPicker value="📚" disabled={false} onChange={onChange} />
        <button type="button">Outside</button>
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'Choose status emoji' });

    await user.click(trigger);
    expect(screen.getByRole('option', { name: 'books' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Clear emoji' }));
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('group', { name: 'Select an emoji' }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(
      screen.queryByRole('group', { name: 'Select an emoji' }),
    ).not.toBeInTheDocument();
    enabledView.unmount();

    const disabledChange = vi.fn();
    const disabledView = render(
      <StatusEmojiPicker value="" disabled onChange={disabledChange} />,
    );
    const disabledTrigger = screen.getByRole('button', {
      name: 'Choose status emoji',
    });
    expect(disabledTrigger).toBeDisabled();
    await user.click(disabledTrigger);
    expect(
      screen.queryByRole('group', { name: 'Select an emoji' }),
    ).not.toBeInTheDocument();
    expect(disabledChange).not.toHaveBeenCalled();
    disabledView.unmount();
  });

  it('announces when a search has no matching emoji', async () => {
    const user = userEvent.setup();
    render(<StatusEmojiPicker value="" disabled={false} onChange={() => {}} />);
    await user.click(
      screen.getByRole('button', { name: 'Choose status emoji' }),
    );
    await user.type(
      screen.getByRole('combobox', { name: 'Filter emojis' }),
      'not-a-real-emoji',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'No emojis found. Try another search.',
    );
  });
});

describe('profile editor picker actions', () => {
  it('applies status emoji changes on save and discards them on cancel', async () => {
    const user = userEvent.setup();
    const profile = buildPlayerProfile();
    const saved = vi.fn();
    const closed = vi.fn();
    let editPayload: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          expect(String(input)).toBe(`${apiBaseUrl}/profiles/me`);
          expect(init.headers).toMatchObject({
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: 'Bearer access-token',
          });
          if (typeof init.body !== 'string')
            throw new Error('Expected a JSON profile edit body');
          editPayload = JSON.parse(init.body);
          const next = {
            ...profile,
            status: {
              emoji: '📚',
              text: '',
              expiresAt: null,
            },
            requestId: 'saved-profile',
          };
          return Promise.resolve(jsonResponse(next));
        }
        return Promise.reject(
          new Error(`Unexpected request: ${String(input)}`),
        );
      }),
    );

    const view = render(
      withAuth(
        <ProfileEditor
          apiBaseUrl={apiBaseUrl}
          profile={profile}
          section="status"
          onClose={closed}
          onSaved={saved}
          onReload={() => {}}
        />,
      ),
    );
    const dialog = screen.getByRole('dialog', { name: 'Set your status' });
    expect(
      within(dialog).getByRole('button', { name: 'Close profile editor' }),
    ).toHaveFocus();
    await user.click(
      within(dialog).getByRole('button', { name: 'Choose status emoji' }),
    );
    await user.type(
      screen.getByRole('combobox', { name: 'Filter emojis' }),
      'books',
    );
    await user.keyboard('{Enter}');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );

    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(editPayload).toEqual({
      expectedVersion: 0,
      bio: '',
      degree: '',
      studyYear: '',
      avatarDataUrl: null,
      statusEmoji: '📚',
      statusText: '',
      statusExpiry: 'never',
      isPublic: false,
      activityVisible: false,
      featuredOwnedCardIds: [],
    });
    view.unmount();

    const cancelView = render(
      withAuth(
        <ProfileEditor
          apiBaseUrl={apiBaseUrl}
          profile={profile}
          section="status"
          onClose={closed}
          onSaved={saved}
          onReload={() => {}}
        />,
      ),
    );
    await user.click(
      screen.getByRole('button', { name: 'Choose status emoji' }),
    );
    await user.type(
      screen.getByRole('combobox', { name: 'Filter emojis' }),
      'books',
    );
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(closed).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenCalledTimes(1);
    cancelView.unmount();
  });
});

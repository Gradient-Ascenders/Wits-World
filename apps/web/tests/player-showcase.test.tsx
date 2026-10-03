import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from '../src/pages/ProfilePage';
import { buildPlayerProfile } from './fixtures/player-profile';
import { buildCard } from './fixtures/cards';
import { jsonResponse } from './fixtures/progression';
import type { PlayerProfile, ProfileEdit } from '../src/api/player-profile';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mount(profile = buildPlayerProfile(), playerName?: string) {
  const calls: ProfileEdit[] = [];
  const cards = [buildCard(1), buildCard(2), buildCard(3)];
  const fetchMock = vi
    .fn()
    .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/cards/collection'))
        return Promise.resolve(
          jsonResponse({ cards, requestId: 'collection' }),
        );
      if (init?.method === 'PUT') {
        const edit = JSON.parse(init.body as string) as ProfileEdit;
        calls.push(edit);
        profile = {
          ...profile,
          bio: edit.bio,
          degree: edit.degree,
          studyYear: edit.studyYear,
          avatarDataUrl: edit.avatarDataUrl,
          isPublic: edit.isPublic,
          activityVisible: edit.activityVisible,
          featuredOwnedCardIds: edit.featuredOwnedCardIds,
          version: (profile.version ?? 0) + 1,
          status:
            edit.statusText || edit.statusEmoji
              ? {
                  text: edit.statusText,
                  emoji: edit.statusEmoji,
                  expiresAt: null,
                }
              : null,
          featuredCards: edit.featuredOwnedCardIds.map((id) => {
            const card = cards.find((entry) => entry.ownedCardId === id)!;
            return {
              affinity: card.affinity,
              cardDefinitionId: card.cardDefinitionId,
              category: card.category,
              description: card.description,
              effects: card.effects,
              hp: card.hp,
              imageUrl: card.imageUrl,
              imageAlt: null,
              isActive: card.isActive,
              moves: card.moves,
              name: card.name,
              power: card.power,
              rarity: card.rarity,
            };
          }) as PlayerProfile['featuredCards'],
        };
      }
      return Promise.resolve(
        jsonResponse({ ...profile, requestId: 'profile' }),
      );
    });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <Auth0Context.Provider
      value={
        {
          ...initialContext,
          isAuthenticated: true,
          isLoading: false,
          getAccessTokenSilently: vi.fn().mockResolvedValue('token'),
        } as Auth0ContextInterface
      }
    >
      <ProfilePage
        apiBaseUrl="https://api.test/api/v1"
        playerName={playerName}
      />
    </Auth0Context.Provider>,
  );
  return { calls, fetchMock, cards };
}

describe('player showcase', () => {
  it('opens achievement details with protected focus and returns to the badge on dismissal', async () => {
    const user = userEvent.setup();
    mount(buildPlayerProfile({ isPublic: true }));
    await screen.findByRole('heading', { name: 'naledi-star' });
    expect(
      screen.queryByText('Add a little about yourself'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /View player profile/ }),
    ).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'First Quiz: Earned' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'First Quiz' });
    const close = within(dialog).getByRole('button', {
      name: 'Close First Quiz details',
    });
    expect(close).toHaveFocus();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('naledi-star')).toBeVisible();
    expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.click(document.querySelector('.achievement-backdrop')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('saves personal details and sharing choices, then restores editor focus', async () => {
    const user = userEvent.setup();
    const { calls } = mount();
    const trigger = await screen.findByRole('button', { name: 'Edit profile' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Edit profile' });
    await user.type(
      within(dialog).getByLabelText('Bio'),
      'Collecting campus legends.',
    );
    await user.type(
      within(dialog).getByLabelText(/Degree/),
      'BSc Computer Science',
    );
    await user.type(within(dialog).getByLabelText(/Year of study/), 'Year 2');
    await user.click(within(dialog).getByLabelText(/Make my profile visible/));
    await user.click(within(dialog).getByLabelText(/Share my daily activity/));
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(calls[0]).toMatchObject({
      expectedVersion: 0,
      bio: 'Collecting campus legends.',
      degree: 'BSc Computer Science',
      studyYear: 'Year 2',
      isPublic: true,
      activityVisible: true,
    });
    expect(screen.getByText('BSc Computer Science · Year 2')).toBeVisible();
    expect(trigger).toHaveFocus();
    expect(screen.getByText('Profile saved.')).toHaveAttribute(
      'role',
      'status',
    );
  });

  it('saves status expiry intent and cancels later edits without a write', async () => {
    const user = userEvent.setup();
    const { calls } = mount();
    await user.click(
      await screen.findByRole('button', { name: 'Set a status' }),
    );
    expect(screen.getByLabelText('Clear status')).toHaveValue('never');
    await user.click(
      screen.getByRole('button', { name: 'Choose status emoji' }),
    );
    await user.type(
      screen.getByRole('combobox', { name: 'Filter emojis' }),
      'books',
    );
    await user.click(screen.getByRole('option', { name: 'books' }));
    await user.type(screen.getByLabelText('Status'), 'In exam mode');
    await user.selectOptions(screen.getByLabelText('Clear status'), 'today');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('button', { name: /In exam mode/ });
    expect(calls[0]).toMatchObject({
      statusEmoji: '📚',
      statusText: 'In exam mode',
      statusExpiry: 'today',
    });
    await user.click(screen.getByRole('button', { name: /In exam mode/ }));
    await user.clear(screen.getByLabelText('Status'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(calls).toHaveLength(1);
    expect(screen.getByRole('button', { name: /In exam mode/ })).toHaveFocus();
  });

  it('saves an emoji-only status, reopens it and clears it', async () => {
    const user = userEvent.setup();
    const { calls } = mount();
    const empty = await screen.findByRole('button', { name: 'Set a status' });
    expect(empty).toHaveTextContent('');
    expect(empty.querySelectorAll('svg')).toHaveLength(1);
    await user.click(empty);
    await user.click(
      screen.getByRole('button', { name: 'Choose status emoji' }),
    );
    await user.type(
      screen.getByRole('combobox', { name: 'Filter emojis' }),
      'books',
    );
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    const status = await screen.findByRole('button', {
      name: 'Edit status: 📚',
    });
    expect(status).toHaveTextContent('📚');
    expect(status.querySelector('svg')).toBeNull();
    expect(calls[0]).toMatchObject({ statusEmoji: '📚', statusText: '' });
    await user.click(status);
    expect(screen.getByLabelText('Status')).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Choose status emoji' }),
    ).toHaveTextContent('📚');
    await user.click(screen.getByRole('button', { name: 'Clear status now' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('button', { name: 'Set a status' });
    expect(calls[1]).toMatchObject({ statusEmoji: '', statusText: '' });
  });

  it('shows an emoji-only status to visitors', async () => {
    mount(
      buildPlayerProfile({
        isOwner: false,
        version: null,
        isPublic: true,
        status: { emoji: '📚', text: '', expiresAt: null },
        activity: null,
        achievements: [],
      }),
      'another-player',
    );
    await screen.findByRole('heading', { name: 'naledi-star' });
    expect(screen.getByText('📚')).toBeVisible();
    expect(screen.getByText('📚')).not.toHaveAttribute('aria-hidden', 'true');
  });

  it('filters emojis, handles empty searches and clears only the draft emoji', async () => {
    const user = userEvent.setup();
    const { calls } = mount(
      buildPlayerProfile({
        status: { emoji: '📚', text: 'Cooking', expiresAt: null },
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Cooking' }));
    const trigger = screen.getByRole('button', { name: 'Choose status emoji' });
    await user.click(trigger);
    const filter = screen.getByRole('combobox', { name: 'Filter emojis' });
    expect(filter).toHaveFocus();
    expect(screen.getByRole('option', { name: 'books' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.type(filter, 'no-such-emoji');
    expect(
      within(screen.getByRole('group', { name: 'Select an emoji' })).getByRole(
        'status',
      ),
    ).toHaveTextContent('No emojis found');
    await user.keyboard('{Enter}');
    expect(calls).toHaveLength(0);
    await user.clear(filter);
    await user.type(filter, 'fried egg');
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('option', { name: 'fried_egg' }));
    expect(trigger).toHaveTextContent('🍳');
    expect(trigger).toHaveFocus();
    expect(screen.getByLabelText('Status')).toHaveValue('Cooking');
    expect(calls).toHaveLength(0);
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Clear emoji' }));
    expect(trigger).not.toHaveTextContent('🍳');
    expect(trigger).toHaveFocus();
    expect(screen.getByLabelText('Status')).toHaveValue('Cooking');
    expect(screen.getByLabelText('Clear status')).toHaveValue('keep');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(calls[0]).toMatchObject({
      statusEmoji: '',
      statusText: 'Cooking',
      statusExpiry: 'keep',
    });
  });

  it('selects emojis by keyboard and dismisses the picker before the status editor', async () => {
    const user = userEvent.setup();
    const { calls } = mount();
    await user.click(
      await screen.findByRole('button', { name: 'Set a status' }),
    );
    const trigger = screen.getByRole('button', { name: 'Choose status emoji' });
    await user.click(trigger);
    const filter = screen.getByRole('combobox', { name: 'Filter emojis' });
    await user.type(filter, 'smile');
    await user.keyboard('{ArrowDown}');
    const active = document.getElementById(
      filter.getAttribute('aria-activedescendant')!,
    );
    const glyph = active?.querySelector('.status-emoji-glyph')?.textContent;
    await user.keyboard('{Enter}');
    expect(trigger).toHaveTextContent(glyph!);
    expect(trigger).toHaveFocus();
    expect(calls).toHaveLength(0);
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('combobox', { name: 'Filter emojis' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Set your status' }),
    ).toBeVisible();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.click(screen.getByLabelText('Status'));
    expect(
      screen.queryByRole('combobox', { name: 'Filter emojis' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('keeps the emoji picker open when native scrolling blurs the search without a focus target', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole('button', { name: 'Set a status' }),
    );
    const trigger = screen.getByRole('button', { name: 'Choose status emoji' });
    await user.click(trigger);
    const filter = screen.getByRole('combobox', { name: 'Filter emojis' });
    fireEvent.blur(filter, { relatedTarget: null });
    expect(
      screen.getByRole('group', { name: 'Select an emoji' }),
    ).toBeVisible();
    const options = screen.getByRole('listbox', { name: 'Select an emoji' });
    await user.click(options);
    expect(options).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Clear emoji' })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Status')).toHaveFocus();
    expect(
      screen.queryByRole('group', { name: 'Select an emoji' }),
    ).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(screen.getByRole('heading', { name: 'Set your status' }));
    expect(
      screen.queryByRole('group', { name: 'Select an emoji' }),
    ).not.toBeInTheDocument();
  });

  it('selects exact owned copies and changes their order using buttons', async () => {
    const user = userEvent.setup();
    const { calls, cards } = mount();
    await user.click(
      await screen.findByRole('button', { name: 'Edit showcase' }),
    );
    const inspect = await screen.findByRole('button', {
      name: 'Inspect Campus Guardian 1, copy 1',
    });
    await user.click(inspect);
    expect(
      screen.getByRole('dialog', { name: 'Campus Guardian 1' }),
    ).toBeVisible();
    await user.keyboard('{Escape}');
    expect(inspect).toHaveFocus();
    expect(
      screen.getByRole('list', { name: 'Selected favourite cards' }).children,
    ).toHaveLength(0);
    await user.click(
      await screen.findByRole('button', {
        name: 'Select Campus Guardian 1, copy 1',
      }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Select Campus Guardian 2, copy 1' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Move Campus Guardian 2 left' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('button', { name: 'Inspect Campus Guardian 2' });
    expect(calls[0]?.featuredOwnedCardIds).toEqual([
      cards[1]!.ownedCardId,
      cards[0]!.ownedCardId,
    ]);
    await user.click(
      screen.getByRole('button', { name: 'Inspect Campus Guardian 2' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Campus Guardian 2' }),
    ).toBeVisible();
    await user.keyboard('{Escape}');
    expect(
      screen.getByRole('button', { name: 'Inspect Campus Guardian 2' }),
    ).toHaveFocus();
  });

  it('keeps owner controls, locked achievements and private activity out of visitor views', async () => {
    mount(
      buildPlayerProfile({
        isOwner: false,
        version: null,
        isPublic: true,
        activityVisible: false,
        activity: null,
        featuredOwnedCardIds: [],
        achievements: [],
      }),
      'another-player',
    );
    await screen.findByRole('heading', { name: 'naledi-star' });
    expect(
      screen.queryByRole('button', { name: 'Edit profile' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Choose a card' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('This player keeps their activity private.'),
    ).toBeVisible();
    expect(screen.getByText('No achievements earned yet.')).toBeVisible();
  });

  it('hides expired status and exposes activity date/count by keyboard', async () => {
    const user = userEvent.setup();
    mount(
      buildPlayerProfile({
        status: {
          emoji: '📚',
          text: 'Old status',
          expiresAt: '2020-01-01T00:00:00Z',
        },
        activity: [{ date: '2026-10-02', count: 3 }],
      }),
    );
    await screen.findByRole('heading', { name: 'naledi-star' });
    expect(screen.queryByText('Old status')).not.toBeInTheDocument();
    const today = screen.getByRole('button', {
      name: '2 October 2026: 3 completed activities',
    });
    today.focus();
    await user.keyboard('{ArrowLeft}');
    expect(
      screen.getByRole('button', {
        name: '25 September 2026: 0 completed activities',
      }),
    ).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      '0 completed activities',
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent('25 September 2026');
    expect(document.querySelector('.activity-detail')).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('keeps draft data visible after a save conflict and offers a reload', async () => {
    const user = userEvent.setup();
    const { fetchMock } = mount();
    await user.click(
      await screen.findByRole('button', { name: 'Edit profile' }),
    );
    await user.type(screen.getByLabelText('Bio'), 'Unsaved draft');
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse(
          { detail: 'Your profile changed in another window.' },
          409,
        ),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your profile changed in another window.',
    );
    expect(screen.getByLabelText('Bio')).toHaveValue('Unsaved draft');
    expect(
      screen.getByRole('button', { name: 'Reload profile' }),
    ).toBeVisible();
  });
});

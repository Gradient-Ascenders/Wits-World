import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen, within, waitFor } from '@testing-library/react';
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
          status: edit.statusText
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
    await user.type(screen.getByLabelText('Emoji'), '📚');
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
    expect(
      screen.getByText('25 September 2026 · 0 completed activities'),
    ).toBeVisible();
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

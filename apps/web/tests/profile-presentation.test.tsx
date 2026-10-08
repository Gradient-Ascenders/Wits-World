import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCardPresentation } from '../src/api/cards';
import type { PlayerProfile } from '../src/api/player-profile';
import { PlayerShowcase } from '../src/components/profile/PlayerShowcase';
import { ProfileActivity } from '../src/components/profile/ProfileActivity';
import { buildCard, jsonResponse } from './fixtures/cards';
import { buildPlayerProfile } from './fixtures/player-profile';

const apiBaseUrl = 'https://api.example.test/api/v1';

afterEach(() => {
  vi.unstubAllGlobals();
});

function featuredCard() {
  const { acquiredAt, acquisitionKind, ownedCardId, ...presentation } =
    buildCard(8, {
      description:
        'A patient guardian that rewards careful planning across the campus.',
      name: 'Library Sentinel',
      rarity: 'rare',
    });
  void acquiredAt;
  void acquisitionKind;
  void ownedCardId;
  return parseCardPresentation({ ...presentation, imageAlt: null });
}

function mountShowcase(profile: PlayerProfile, playerName?: string) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      jsonResponse({ ...profile, requestId: 'profile-presentation-test' }),
    );
  vi.stubGlobal('fetch', fetchMock);
  render(
    <Auth0Context.Provider
      value={
        {
          ...initialContext,
          getAccessTokenSilently: vi.fn().mockResolvedValue('test-token'),
          isAuthenticated: true,
          isLoading: false,
        } as Auth0ContextInterface
      }
    >
      <PlayerShowcase apiBaseUrl={apiBaseUrl} playerName={playerName} />
    </Auth0Context.Provider>,
  );
  return fetchMock;
}

describe('profile presentation', () => {
  it('filters activity to the selected rolling period and reports only visible counts', async () => {
    const user = userEvent.setup();
    render(
      <ProfileActivity
        profile={buildPlayerProfile({
          activityThrough: '2026-10-02',
          activity: [
            { date: '2026-06-30', count: 4 },
            { date: '2026-07-04', count: 2 },
            { date: '2026-09-30', count: 1 },
            { date: '2026-10-02', count: 3 },
          ],
        })}
      />,
    );

    expect(screen.getByText('10')).toBeVisible();
    expect(
      screen.getByText('completed activities in the last year'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: '30 June 2026: 4 completed activities',
      }),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Activity period'), '91');

    expect(screen.getByText('6')).toBeVisible();
    expect(
      screen.getByText('completed activities in the last 3 months'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: '30 June 2026: 4 completed activities',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: '4 July 2026: 2 completed activities',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: '2 October 2026: 3 completed activities',
      }),
    ).toBeInTheDocument();
  });

  it('distinguishes owner-only activity from activity hidden from a visitor', () => {
    const { rerender } = render(
      <ProfileActivity
        profile={buildPlayerProfile({
          activity: [{ date: '2026-10-02', count: 2 }],
          activityThrough: '2026-10-02',
          activityVisible: false,
        })}
      />,
    );

    expect(screen.getByText('Only you can see this activity.')).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: '2 October 2026: 2 completed activities',
      }),
    ).toBeInTheDocument();

    rerender(
      <ProfileActivity
        profile={buildPlayerProfile({
          activity: null,
          activityThrough: '2026-10-02',
          isOwner: false,
          version: null,
        })}
      />,
    );

    expect(
      screen.getByText('This player keeps their activity private.'),
    ).toBeVisible();
    expect(screen.queryByLabelText('Activity period')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: '2 October 2026: 2 completed activities',
      }),
    ).not.toBeInTheDocument();
  });

  it('shows visitor-safe identity, status and card details without owner controls', async () => {
    const user = userEvent.setup();
    const card = featuredCard();
    mountShowcase(
      buildPlayerProfile({
        activity: null,
        achievements: [],
        bio: 'Mapping quiet study spots and collecting campus folklore.',
        degree: 'BSc Computer Science',
        featuredCards: [card],
        featuredOwnedCardIds: [],
        isOwner: false,
        isPublic: true,
        playerName: 'naledi-star',
        status: {
          emoji: '📚',
          text: 'Preparing for finals',
          expiresAt: '2099-11-15T18:00:00.000Z',
        },
        studyYear: 'Year 2',
        version: null,
      }),
      'naledi-star',
    );

    expect(
      await screen.findByRole('heading', { name: 'naledi-star' }),
    ).toBeVisible();
    expect(screen.getByText('BSc Computer Science · Year 2')).toBeVisible();
    expect(
      screen.getByText(
        'Mapping quiet study spots and collecting campus folklore.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Preparing for finals')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Edit profile' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit showcase' }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Inspect Library Sentinel' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Library Sentinel' });
    expect(within(dialog).getByText(/A patient guardian/)).toBeVisible();
    expect(
      within(dialog).getByText('Rare Creature · Wit affinity'),
    ).toBeVisible();
    expect(within(dialog).getByText('100')).toBeVisible();
    expect(within(dialog).getByText('12')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(
      screen.getByRole('button', { name: 'Inspect Library Sentinel' }),
    ).toHaveFocus();
  });

  it('routes owner status and identity controls to their matching editors', async () => {
    const user = userEvent.setup();
    mountShowcase(
      buildPlayerProfile({
        activity: [],
        bio: 'A short profile for an active campus player.',
        isPublic: false,
      }),
    );

    expect(
      await screen.findByRole('heading', { name: 'naledi-star' }),
    ).toBeVisible();
    expect(screen.getByText('Visible only to you')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Set a status' }));
    expect(
      screen.getByRole('dialog', { name: 'Set your status' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    const editor = screen.getByRole('dialog', { name: 'Edit profile' });
    expect(within(editor).getByLabelText('Bio')).toHaveValue(
      'A short profile for an active campus player.',
    );
    expect(
      within(editor).getByLabelText(/Make my profile visible/),
    ).not.toBeChecked();
    expect(
      within(editor).getByLabelText(/Share my daily activity/),
    ).not.toBeChecked();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listOwnedCards, type OwnedCard } from '../src/api/cards';
import { ChallengeRewards } from '../src/components/challenge/ChallengeRewards';

vi.mock('../src/api/cards', () => ({ listOwnedCards: vi.fn() }));
vi.mock('../src/auth/useApiAccessToken', () => ({
  useApiAccessToken: () => token,
}));
const token = async () => 'fixture';
const reward = {
  ownedCardId: 'awarded',
  cardDefinitionId: 'definition',
  name: 'Campus Spark',
  rarity: 'rare',
  category: 'creature',
  affinity: 'spark',
} as const;
const owned: OwnedCard = {
  ...reward,
  acquiredAt: '2026-09-14T12:00:00Z',
  acquisitionKind: 'event_reward',
  imageUrl: '/cards/cinderhop.webp',
  imageAlt: 'Campus Spark artwork',
  description: null,
  effects: [],
  moves: [],
  hp: 20,
  power: 3,
  isActive: true,
};
beforeEach(() => vi.resetAllMocks());

describe('challenge reward cards', () => {
  it('uses artwork for the exact awarded copy and does not display other collection cards', async () => {
    vi.mocked(listOwnedCards).mockResolvedValue([
      owned,
      { ...owned, ownedCardId: 'other', name: 'Unrelated card' },
    ]);
    render(<ChallengeRewards cards={[reward]} apiBaseUrl="/api/v1" />);
    expect(await screen.findByAltText('Campus Spark artwork')).toHaveAttribute(
      'src',
      '/cards/cinderhop.webp',
    );
    expect(screen.queryByText('Unrelated card')).not.toBeInTheDocument();
    expect(screen.getByText('Rare')).toBeVisible();
  });
  it('keeps the saved reward visible after an artwork request fails and allows retry', async () => {
    vi.mocked(listOwnedCards)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([owned]);
    render(<ChallengeRewards cards={[reward]} apiBaseUrl="/api/v1" />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry artwork' }),
    );
    expect(screen.getByRole('heading', { name: 'Campus Spark' })).toBeVisible();
    expect(await screen.findByAltText('Campus Spark artwork')).toBeVisible();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Retry artwork' }),
      ).not.toBeInTheDocument(),
    );
  });
  it('does not substitute artwork from another copy or invent missing rewards', async () => {
    vi.mocked(listOwnedCards).mockResolvedValue([
      { ...owned, ownedCardId: 'other' },
    ]);
    const { rerender } = render(
      <ChallengeRewards cards={[reward]} apiBaseUrl="/api/v1" />,
    );
    await waitFor(() => expect(listOwnedCards).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByAltText('Campus Spark artwork'),
    ).not.toBeInTheDocument();
    rerender(<ChallengeRewards cards={[]} apiBaseUrl="/api/v1" />);
    expect(
      screen.getByText('No new cards were awarded for this result.'),
    ).toBeVisible();
    expect(listOwnedCards).toHaveBeenCalledTimes(1);
  });
});

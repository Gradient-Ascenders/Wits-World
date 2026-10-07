import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as cardsApi from '../src/api/cards';
import type { CardEvolutionPreview, OwnedCard } from '../src/api/cards';
import { CollectionEvolutions } from '../src/components/cards/CollectionEvolutions';
import { buildCard } from './fixtures/cards';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function preview(card: OwnedCard, canEvolve = true): CardEvolutionPreview {
  return {
    canEvolve,
    copies: [],
    copiesRequired: 3,
    deckLockedCopyCount: 0,
    eligibleCopyCount: canEvolve ? 3 : 1,
    ownedCopyCount: canEvolve ? 3 : 1,
    requestId: 'confirmed-preview',
    source: { ...card, deckPointCost: 1 },
    target: {
      ...card,
      cardDefinitionId: 'target',
      deckPointCost: 3,
      name: `Evolved ${card.name}`,
    },
    tradeReservedCopyCount: 0,
    unavailableReason: canEvolve ? null : 'insufficient_copies',
  };
}

function props(cards: OwnedCard[]) {
  return {
    apiBaseUrl: 'https://api.example.test/api/v1',
    cards,
    getAccessToken: vi.fn().mockResolvedValue('token'),
    onApplyResult: vi.fn(),
    onRefreshCollection: vi.fn().mockResolvedValue(undefined),
  };
}

describe('progressive evolution readiness', () => {
  it('reveals a confirmed card without waiting for another preview and keeps controls mounted', async () => {
    const cards = [buildCard(1), buildCard(2)] as OwnedCard[];
    const first = deferred<CardEvolutionPreview>();
    const second = deferred<CardEvolutionPreview>();
    vi.spyOn(cardsApi, 'previewCardEvolution')
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(<CollectionEvolutions {...props(cards)} />);
    expect(screen.getByRole('heading', { name: 'Evolutions' })).toBeVisible();
    expect(
      screen.queryByText('No evolutions are available for your current cards.'),
    ).not.toBeInTheDocument();

    await act(async () => first.resolve(preview(cards[0]!)));
    expect(
      screen.getByRole('button', {
        name: `Preview ${cards[0]!.name} evolution`,
      }),
    ).toBeEnabled();
    const search = screen.getByRole('searchbox', { name: 'Search evolutions' });
    search.focus();
    expect(
      screen.queryByRole('button', {
        name: `Preview ${cards[1]!.name} evolution`,
      }),
    ).not.toBeInTheDocument();

    await act(async () => second.resolve(preview(cards[1]!)));
    expect(screen.getByRole('searchbox', { name: 'Search evolutions' })).toBe(
      search,
    );
    expect(search).toHaveFocus();
    expect(
      screen.getByRole('button', {
        name: `Preview ${cards[1]!.name} evolution`,
      }),
    ).toBeEnabled();
  });

  it('does not claim that no cards are ready while an independent preview is still pending', async () => {
    const cards = [buildCard(1), buildCard(2)] as OwnedCard[];
    const pending = deferred<CardEvolutionPreview>();
    vi.spyOn(cardsApi, 'previewCardEvolution')
      .mockResolvedValueOnce(preview(cards[0]!, false))
      .mockReturnValueOnce(pending.promise);
    render(<CollectionEvolutions {...props(cards)} />);
    await screen.findByRole('searchbox', { name: 'Search evolutions' });
    expect(
      screen.queryByRole('heading', { name: 'No cards ready to evolve' }),
    ).not.toBeInTheDocument();
    await act(async () => pending.resolve(preview(cards[1]!, false)));
    expect(
      screen.getByRole('heading', { name: 'No cards ready to evolve' }),
    ).toBeVisible();
  });

  it('ignores an abandoned response after collection identity changes', async () => {
    const oldCard = buildCard(1) as OwnedCard;
    const newCard = buildCard(2) as OwnedCard;
    const oldRequest = deferred<CardEvolutionPreview>();
    const newRequest = deferred<CardEvolutionPreview>();
    const request = vi
      .spyOn(cardsApi, 'previewCardEvolution')
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    const baseProps = props([oldCard]);
    const { rerender } = render(<CollectionEvolutions {...baseProps} />);
    rerender(<CollectionEvolutions {...baseProps} cards={[newCard]} />);
    expect(request.mock.calls[0]![0].signal?.aborted).toBe(true);
    await act(async () => newRequest.resolve(preview(newCard)));
    await act(async () => oldRequest.resolve(preview(oldCard)));
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: `Preview ${newCard.name} evolution`,
        }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByRole('button', {
        name: `Preview ${oldCard.name} evolution`,
      }),
    ).not.toBeInTheDocument();
  });

  it('retries a stalled read and rejects a late result from the abandoned scan', async () => {
    vi.useFakeTimers();
    const card = buildCard(1) as OwnedCard;
    const oldRequest = deferred<CardEvolutionPreview>();
    const newRequest = deferred<CardEvolutionPreview>();
    const request = vi
      .spyOn(cardsApi, 'previewCardEvolution')
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    render(<CollectionEvolutions {...props([card])} />);
    await act(async () => vi.advanceTimersByTime(8_000));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(request.mock.calls[0]![0].signal?.aborted).toBe(true);
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument();
    await act(async () => newRequest.resolve(preview(card)));
    await act(async () => oldRequest.resolve(preview(card, false)));
    expect(
      screen.getByRole('button', { name: `Preview ${card.name} evolution` }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('heading', { name: 'No cards ready to evolve' }),
    ).not.toBeInTheDocument();
  });
});

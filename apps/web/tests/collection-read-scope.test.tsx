import { render } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  CollectionReadProvider,
  useCollectionReads,
} from '../src/components/cards/CollectionReadProvider';

describe('collection cache identity scopes', () => {
  it('keeps the active cache usable after Strict Mode effect cleanup', () => {
    let reads: NonNullable<ReturnType<typeof useCollectionReads>>;
    function Probe() {
      reads = useCollectionReads()!;
      return null;
    }
    render(
      <StrictMode>
        <CollectionReadProvider scope="player-a:player">
          <Probe />
        </CollectionReadProvider>
      </StrictMode>,
    );
    const cards: [] = [];
    reads!.rememberCards('api', cards);
    expect(reads!.readCards('api')).toBe(cards);
  });
  it('clears private data on session changes without remounting children or accepting stale writes', () => {
    const mounted = vi.fn();
    let reads: NonNullable<ReturnType<typeof useCollectionReads>>;
    function Probe() {
      reads = useCollectionReads()!;
      useEffect(() => {
        mounted();
      }, []);
      return null;
    }
    const view = render(
      <CollectionReadProvider scope="player-a:player">
        <Probe />
      </CollectionReadProvider>,
    );
    const stale = reads!;
    const cards: [] = [];
    reads!.rememberCards('api', cards);
    expect(reads!.readCards('api')).toBe(cards);
    view.rerender(
      <CollectionReadProvider scope="loading">
        <Probe />
      </CollectionReadProvider>,
    );
    expect(mounted).toHaveBeenCalledOnce();
    expect(reads!.readCards('api')).toBeUndefined();
    expect(stale.readCards('api')).toBeUndefined();
    stale.rememberCards('api', cards);
    expect(stale.readCards('api')).toBeUndefined();
    view.rerender(
      <CollectionReadProvider scope="player-b:author">
        <Probe />
      </CollectionReadProvider>,
    );
    expect(mounted).toHaveBeenCalledOnce();
    expect(reads!.readCards('api')).toBeUndefined();
    const nextCards: [] = [];
    reads!.rememberCards('api', nextCards);
    expect(reads!.readCards('api')).toBe(nextCards);
    view.unmount();
    expect(reads!.readCards('api')).toBeUndefined();
  });
});

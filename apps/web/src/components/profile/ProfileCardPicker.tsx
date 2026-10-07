import { LoadingState } from '../LoadingState';
import { CheckIcon, DotsSixIcon, XIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import {
  listOwnedCards,
  type CardPresentation,
  type OwnedCard,
} from '../../api/cards';
import type { PlayerProfile } from '../../api/player-profile';
import { useApiAccessToken } from '../../auth/useApiAccessToken';
import { CardThumbnail } from '../cards/CollectibleCard';
import { CardPresentationDialog } from '../cards/CardPresentationDialog';

const pageSize = 12;

export function ProfileCardPicker({
  apiBaseUrl,
  selected,
  featured,
  disabled,
  onChange,
}: {
  apiBaseUrl: string;
  selected: string[];
  featured: PlayerProfile;
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const getAccessToken = useApiAccessToken();
  const [collection, setCollection] = useState<OwnedCard[] | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(pageSize);
  const [notice, setNotice] = useState('');
  const [inspected, setInspected] = useState<CardPresentation | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const row = useRef<HTMLOListElement>(null);
  const drag = useRef<{
    id: string;
    pointerId: number;
    x: number;
    y: number;
    target: string;
  } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void listOwnedCards({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
      unique: true,
    })
      .then((cards) => {
        if (!controller.signal.aborted) setCollection(cards);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Your collection could not be loaded. Try again.');
      });
    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken, revision]);

  function selectedCard(id: string) {
    return (
      collection?.find((card) => card.ownedCardId === id) ??
      featured.featuredCards[featured.featuredOwnedCardIds.indexOf(id)]
    );
  }
  function reorder(id: string, target: string) {
    const from = selected.indexOf(id);
    const to = selected.indexOf(target);
    if (disabled || from < 0 || to < 0 || from === to) return;
    const ids = selected.slice();
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    onChange(ids);
    setNotice(
      `${selectedCard(id)?.name ?? 'Card'} moved to position ${to + 1}.`,
    );
  }
  function endDrag(commit: boolean) {
    if (commit && suppressClick.current && drag.current)
      reorder(drag.current.id, drag.current.target);
    drag.current = null;
    setDragging(null);
    setDropTarget(null);
  }
  const matches =
    collection?.filter((card) =>
      card.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    ) ?? [];

  return (
    <div className="profile-card-picker">
      <div className="profile-picker-heading">
        <p>Choose up to four favourites.</p>
        <span>{selected.length} of 4 selected</span>
      </div>
      <ol
        className="profile-selected-cards"
        aria-label="Selected favourite cards"
        ref={row}
      >
        {selected.map((id, index) => {
          const card = selectedCard(id);
          const name = card?.name ?? 'Unavailable card';
          return (
            <li
              key={id}
              data-owned-card-id={id}
              data-dragging={dragging === id}
              data-drop-target={dropTarget === id && dragging !== id}
              onDragStart={(event) => event.preventDefault()}
              onPointerDown={(event) => {
                if (
                  disabled ||
                  !event.isPrimary ||
                  event.button !== 0 ||
                  !(event.target as Element).closest(
                    '.card-thumbnail, .profile-reorder-handle',
                  )
                )
                  return;
                suppressClick.current = false;
                drag.current = {
                  id,
                  pointerId: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  target: id,
                };
              }}
              onPointerMove={(event) => {
                const active = drag.current;
                if (
                  !active ||
                  active.id !== id ||
                  active.pointerId !== event.pointerId ||
                  disabled
                )
                  return;
                if (
                  !suppressClick.current &&
                  Math.hypot(
                    event.clientX - active.x,
                    event.clientY - active.y,
                  ) < 6
                )
                  return;
                suppressClick.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging(id);
                const tiles = Array.from(
                  row.current?.querySelectorAll<HTMLElement>(
                    'li[data-owned-card-id]',
                  ) ?? [],
                );
                const nearest = tiles.reduce<{
                  id: string;
                  distance: number;
                } | null>((best, tile) => {
                  const bounds = tile.getBoundingClientRect();
                  const distance = Math.hypot(
                    event.clientX - (bounds.left + bounds.width / 2),
                    event.clientY - (bounds.top + bounds.height / 2),
                  );
                  return !best || distance < best.distance
                    ? { id: tile.dataset.ownedCardId!, distance }
                    : best;
                }, null);
                active.target = nearest?.id ?? id;
                setDropTarget(active.target);
              }}
              onPointerUp={(event) => {
                if (drag.current?.pointerId === event.pointerId) endDrag(true);
              }}
              onPointerCancel={(event) => {
                if (drag.current?.pointerId === event.pointerId) endDrag(false);
              }}
              onLostPointerCapture={(event) => {
                // Touch begins with capture on the button. Its release bubbles
                // here when the tile takes over; only end if the tile lost capture.
                if (
                  event.target === event.currentTarget &&
                  drag.current?.pointerId === event.pointerId
                )
                  endDrag(false);
              }}
              onClickCapture={(event) => {
                if (suppressClick.current) {
                  event.preventDefault();
                  event.stopPropagation();
                  suppressClick.current = false;
                }
              }}
            >
              {card ? (
                <CardThumbnail
                  card={card}
                  accessibleLabel={`Inspect favourite ${name}`}
                  onClick={() => setInspected(card)}
                />
              ) : (
                <div className="profile-selected-unavailable">
                  Card no longer available
                </div>
              )}
              <div className="profile-selected-actions">
                <button
                  className="profile-reorder-handle"
                  type="button"
                  aria-label={`Reorder ${name}, position ${index + 1}`}
                  aria-describedby="profile-reorder-hint"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && drag.current) {
                      event.preventDefault();
                      event.stopPropagation();
                      endDrag(false);
                    }
                    const delta =
                      event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                        ? -1
                        : event.key === 'ArrowRight' ||
                            event.key === 'ArrowDown'
                          ? 1
                          : 0;
                    if (!delta) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const target = selected[index + delta];
                    if (target) reorder(id, target);
                  }}
                >
                  <DotsSixIcon size={20} aria-hidden="true" />
                  <span className="profile-selected-number">{index + 1}</span>
                </button>
                <button
                  className="profile-selected-remove"
                  type="button"
                  aria-label={`Remove favourite ${name}`}
                  onClick={() => {
                    onChange(selected.filter((entry) => entry !== id));
                    setNotice(`${name} removed from favourites.`);
                  }}
                >
                  <XIcon size={18} aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
        {Array.from({ length: 4 - selected.length }, (_, index) => (
          <li
            className="profile-selected-empty"
            key={`empty-${index}`}
            aria-hidden="true"
          >
            <span>{selected.length + index + 1}</span>
          </li>
        ))}
      </ol>
      <p id="profile-reorder-hint" className="profile-reorder-hint">
        Drag cards to reorder. Use arrow keys on the grip with a keyboard.
      </p>
      <p role="status" className="sr-only">
        {notice}
      </p>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            className="button button--quiet"
            type="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : !collection ? (
        <LoadingState
          label="Loading cards…"
          onRetry={() => setRevision((value) => value + 1)}
          resetKey={revision}
        />
      ) : !collection.length ? (
        <p>
          No cards yet. Complete a challenge or choose your starter cards in
          your collection.
        </p>
      ) : (
        <>
          <label>
            Search your cards
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(pageSize);
              }}
            />
          </label>
          <div className="profile-picker-grid">
            {matches.slice(0, limit).map((card) => {
              const pickedIds = selected.filter(
                (id) =>
                  selectedCard(id)?.cardDefinitionId === card.cardDefinitionId,
              );
              const picked = pickedIds.length > 0;
              return (
                <div
                  key={card.cardDefinitionId}
                  className={`profile-picker-card${picked ? ' profile-picker-card--selected' : ''}`}
                >
                  <CardThumbnail
                    card={card}
                    accessibleLabel={`Inspect ${card.name}`}
                    loading="lazy"
                    onClick={() => setInspected(card)}
                  />
                  <button
                    className="button button--quiet profile-picker-membership"
                    type="button"
                    aria-label={`${picked ? 'Remove' : 'Select'} ${card.name}`}
                    aria-pressed={picked}
                    disabled={!picked && selected.length >= 4}
                    onClick={() => {
                      if (picked)
                        onChange(
                          selected.filter((id) => !pickedIds.includes(id)),
                        );
                      else if (selected.length < 4)
                        onChange([...selected, card.ownedCardId]);
                      setNotice(
                        picked
                          ? `${card.name} removed from favourites.`
                          : `${card.name} added to favourites.`,
                      );
                    }}
                  >
                    <CheckIcon size={16} aria-hidden="true" />
                    {picked ? 'Selected' : 'Select'}
                  </button>
                </div>
              );
            })}
          </div>
          {!matches.length ? <p>No cards match this search.</p> : null}
          {matches.length > limit ? (
            <button
              className="button button--quiet profile-picker-more"
              type="button"
              onClick={() => setLimit((value) => value + pageSize)}
            >
              Show more cards
            </button>
          ) : null}
        </>
      )}
      {inspected ? (
        <CardPresentationDialog
          card={inspected}
          onClose={() => setInspected(null)}
        />
      ) : null}
    </div>
  );
}

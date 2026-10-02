import { useId, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CaretLeftIcon, CaretRightIcon, XIcon } from '@phosphor-icons/react';
import type { AuthoringStatus } from '../../api/author';
import { SearchField } from '../fields/SearchField';
import { SelectField } from '../fields/SelectField';
import { useModalFocus } from '../useModalFocus';

export interface CampaignMember {
  id: string;
  title: string;
  kind: 'event' | 'trail';
  status: AuthoringStatus | 'unavailable';
}

export function CampaignStatus({
  status,
}: {
  status: CampaignMember['status'];
}) {
  return (
    <span className={`status-badge status-badge--author-${status}`}>
      {status === 'in_review'
        ? 'In review'
        : status[0]!.toUpperCase() + status.slice(1)}
    </span>
  );
}

export function CampaignContentPicker({
  items,
  eventIds,
  trailIds,
  onApply,
  onCancel,
  returnFocusRef,
}: {
  items: CampaignMember[];
  eventIds: string[];
  trailIds: string[];
  onApply: (selection: { eventIds: string[]; trailIds: string[] }) => void;
  onCancel: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const titleId = useId();
  const panelId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [kind, setKind] = useState<'event' | 'trail'>('event');
  const [filters, setFilters] = useState({
    event: { query: '', lifecycle: 'published', page: 1 },
    trail: { query: '', lifecycle: 'published', page: 1 },
  });
  const [selection, setSelection] = useState({ eventIds, trailIds });
  const keepFocusInside = useModalFocus({
    busy: false,
    dialogRef,
    initialFocusRef: closeRef,
    returnFocusRef,
  });
  const filter = filters[kind];
  const filtered = items.filter(
    (item) =>
      item.kind === kind &&
      (filter.lifecycle === 'all' || item.status === filter.lifecycle) &&
      item.title
        .toLocaleLowerCase()
        .includes(filter.query.trim().toLocaleLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const page = Math.min(filter.page, pageCount);
  const visible = filtered.slice((page - 1) * 10, page * 10);
  const count = selection.eventIds.length + selection.trailIds.length;
  const selectionKey = kind === 'event' ? 'eventIds' : 'trailIds';

  function updateFilter(next: Partial<typeof filter>) {
    setFilters((current) => ({
      ...current,
      [kind]: { ...current[kind], ...next },
    }));
  }

  return createPortal(
    <div className="campaign-picker-backdrop">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="campaign-picker"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.defaultPrevented) {
            event.preventDefault();
            onCancel();
          } else keepFocusInside(event);
        }}
      >
        <header className="campaign-picker__heading">
          <h2 id={titleId}>Add content</h2>
          <button
            className="button button--quiet"
            type="button"
            aria-label="Close content picker"
            ref={closeRef}
            onClick={onCancel}
          >
            <XIcon size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="campaign-tabs" role="tablist" aria-label="Content type">
          {(['event', 'trail'] as const).map((tab) => (
            <button
              key={tab}
              id={`${panelId}-${tab}`}
              role="tab"
              aria-selected={kind === tab}
              aria-controls={`${panelId}-panel`}
              tabIndex={kind === tab ? 0 : -1}
              type="button"
              onClick={() => setKind(tab)}
              onKeyDown={(event) => {
                if (
                  ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
                ) {
                  event.preventDefault();
                  const next =
                    event.key === 'Home'
                      ? 'event'
                      : event.key === 'End'
                        ? 'trail'
                        : tab === 'event'
                          ? 'trail'
                          : 'event';
                  setKind(next);
                  document.getElementById(`${panelId}-${next}`)?.focus();
                }
              }}
            >
              {tab === 'event' ? 'Events' : 'Trails'}
              <span>
                {tab === 'event'
                  ? selection.eventIds.length
                  : selection.trailIds.length}
              </span>
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${panelId}-panel`}
          aria-labelledby={`${panelId}-${kind}`}
          className="campaign-picker__panel"
        >
          <div className="campaign-picker__filters">
            <SearchField
              label="Search content"
              placeholder={kind === 'event' ? 'Search events' : 'Search trails'}
              value={filter.query}
              onChange={(query) => updateFilter({ query, page: 1 })}
            />
            <SelectField
              label="Lifecycle"
              value={filter.lifecycle}
              onChange={(lifecycle) => updateFilter({ lifecycle, page: 1 })}
              options={[
                { value: 'published', label: 'Published' },
                { value: 'all', label: 'All' },
                { value: 'draft', label: 'Draft' },
                ...(kind === 'event'
                  ? [
                      { value: 'in_review', label: 'In review' },
                      { value: 'approved', label: 'Approved' },
                    ]
                  : []),
                { value: 'retired', label: 'Retired' },
              ]}
            />
          </div>
          <div className="campaign-picker__results">
            {visible.length === 0 ? (
              <div className="campaign-content-empty">
                <strong>
                  No matching {kind === 'event' ? 'events' : 'trails'}.
                </strong>
                <p>Try another search or lifecycle filter.</p>
              </div>
            ) : (
              <ul className="campaign-picker__list">
                {visible.map((item) => (
                  <li key={item.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selection[selectionKey].includes(item.id)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelection((current) => ({
                            ...current,
                            [selectionKey]: checked
                              ? [...current[selectionKey], item.id]
                              : current[selectionKey].filter(
                                  (id) => id !== item.id,
                                ),
                          }));
                        }}
                      />
                      <span className="campaign-picker__identity">
                        <strong>{item.title}</strong>
                        {item.status !== 'published' ? (
                          <small>
                            {item.status === 'retired'
                              ? 'Retired content cannot be approved or published.'
                              : 'Must be published before campaign approval.'}
                          </small>
                        ) : null}
                      </span>
                      <CampaignStatus status={item.status} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {pageCount > 1 ? (
            <nav className="author-pagination" aria-label="Content pages">
              <button
                className="button button--quiet"
                aria-label="Previous content page"
                type="button"
                disabled={page <= 1}
                onClick={() => updateFilter({ page: page - 1 })}
              >
                <CaretLeftIcon size={18} aria-hidden="true" />
              </button>
              <span>
                Page {page} of {pageCount}
              </span>
              <button
                className="button button--quiet"
                aria-label="Next content page"
                type="button"
                disabled={page >= pageCount}
                onClick={() => updateFilter({ page: page + 1 })}
              >
                <CaretRightIcon size={18} aria-hidden="true" />
              </button>
            </nav>
          ) : null}
        </div>
        <footer className="campaign-picker__footer">
          <p role="status">{count} selected</p>
          <div className="author-actions">
            <button
              className="button button--quiet"
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="button"
              type="button"
              onClick={() => onApply(selection)}
            >
              Apply selection
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

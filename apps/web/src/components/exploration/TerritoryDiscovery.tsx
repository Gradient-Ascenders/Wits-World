import {
  ArrowClockwise,
  ArrowLeft,
  CaretDown,
  FlagBanner,
  HourglassMedium,
  MapTrifold,
  UsersThree,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { ExplorationLoadingPanel } from './ExplorationLoadingPanel';
import { StateIcon } from '../StatusMessage';
import type {
  TerritoryHistoryEntry,
  TerritoryTransitionKind,
  TerritoryZoneSummary,
} from '../../api/territory';
import type {
  TerritoryDetailSection,
  TerritoryDetailState,
  TerritoryListState,
} from './useTerritoryDiscovery';

interface TerritoryDiscoveryProps {
  detail: TerritoryDetailState;
  list: TerritoryListState;
  modeNavigation: ReactNode;
  onCollapse: () => void;
  onRefreshDetail: () => void;
  onRefreshZones: () => void;
  onSelect: (zoneId: string) => void;
  onShowList: () => void;
  selectedZoneId: string | null;
}

const HISTORY_PREVIEW_COUNT = 6;

export function TerritoryDiscovery({
  detail,
  list,
  modeNavigation,
  onCollapse,
  onRefreshDetail,
  onRefreshZones,
  onSelect,
  onShowList,
  selectedZoneId,
}: TerritoryDiscoveryProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const selectedZone =
    list.zones.find((zone) => zone.zoneId === selectedZoneId) ?? null;

  useEffect(() => {
    setShowAllHistory(false);
    if (selectedZoneId !== null && returnFocusRef.current !== null) {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [selectedZoneId]);

  const showList = (): void => {
    onShowList();
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  };

  if (selectedZone !== null) {
    return (
      <>
        <div className="event-panel__toolbar">
          <button
            className="event-panel__back"
            onClick={showList}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={20} /> All territories
          </button>
          <button
            aria-label="Collapse territory details"
            className="event-panel__close"
            onClick={onCollapse}
            type="button"
          >
            <CaretDown aria-hidden="true" size={20} />
          </button>
        </div>
        {modeNavigation}
        <div className="event-panel__scroll">
          <TerritoryDetail
            detail={detail}
            headingRef={headingRef}
            onRefresh={onRefreshDetail}
            showAllHistory={showAllHistory}
            toggleHistory={() => setShowAllHistory((current) => !current)}
            zone={selectedZone}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="event-panel__header">
        <div>
          <h2 ref={headingRef} tabIndex={-1}>
            Campus territories
          </h2>
          {list.status === 'ready' ? (
            <span className="event-panel__summary">
              {list.zones.length} {list.zones.length === 1 ? 'zone' : 'zones'}
            </span>
          ) : null}
        </div>
        <button
          aria-label="Collapse territories"
          className="event-panel__close"
          onClick={onCollapse}
          type="button"
        >
          <CaretDown aria-hidden="true" size={20} />
        </button>
      </div>
      {modeNavigation}
      <div className="event-panel__scroll">
        {list.stale && list.message ? (
          <TerritoryStaleNotice
            lastUpdatedAt={list.lastUpdatedAt}
            message={list.message}
            onRetry={onRefreshZones}
          />
        ) : null}

        {list.status === 'loading' ? (
          <ExplorationLoadingPanel label="Loading campus territories…" />
        ) : list.status === 'error' ? (
          <div
            className="territory-state state-message state-message--error"
            role="alert"
          >
            <StateIcon tone="error" />
            <strong>Territories could not load.</strong>
            <p>{list.message}</p>
            <button
              className="button button--quiet"
              onClick={onRefreshZones}
              type="button"
            >
              <ArrowClockwise aria-hidden="true" size={20} /> Retry
            </button>
          </div>
        ) : list.status === 'empty' ? (
          <div className="territory-state state-message state-message--empty">
            <StateIcon tone="empty" />
            <strong>No territories are available.</strong>
            <p>Check back later.</p>
          </div>
        ) : list.status === 'ready' ? (
          <>
            <ul aria-label="Campus territories" className="territory-list">
              {list.zones.map((zone) => (
                <li key={zone.zoneId}>
                  <button
                    aria-label={`Open ${zone.name}, ${zoneStatusLabel(zone)}`}
                    className="territory-summary"
                    data-territory-id={zone.zoneId}
                    onClick={(event) => {
                      returnFocusRef.current = event.currentTarget;
                      onSelect(zone.zoneId);
                    }}
                    type="button"
                  >
                    <span className="territory-summary__marker">
                      <MapTrifold aria-hidden="true" size={22} />
                    </span>
                    <span className="territory-summary__copy">
                      <strong>{zone.name}</strong>
                      <span>{ownerLabel(zone)}</span>
                    </span>
                    <span
                      className={`territory-status territory-status--${zone.status}`}
                    >
                      {zone.status === 'active' ? 'Active' : 'Suspended'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <details className="territory-explainer">
              <summary>How territories work</summary>
              <p>
                Choose a territory when joining Ranked. Your location is checked
                before you join. Eligible wins add influence after the match.
              </p>
            </details>
          </>
        ) : null}
      </div>
    </>
  );
}

function TerritoryDetail({
  detail,
  headingRef,
  onRefresh,
  showAllHistory,
  toggleHistory,
  zone,
}: {
  detail: TerritoryDetailState;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onRefresh: () => void;
  showAllHistory: boolean;
  toggleHistory: () => void;
  zone: TerritoryZoneSummary;
}) {
  const failed = new Set(detail.failedSections);
  const displayedZone = detail.detail ?? zone;
  const historyEntries = detail.history?.entries ?? [];
  const shownHistory = showAllHistory
    ? historyEntries
    : historyEntries.slice(0, HISTORY_PREVIEW_COUNT);

  return (
    <article className="territory-detail">
      <header className="territory-detail__header">
        <div className="territory-detail__title-row">
          <h2 ref={headingRef} tabIndex={-1}>
            {displayedZone.name}
          </h2>
          <span
            className={`territory-status territory-status--${displayedZone.status}`}
          >
            {displayedZone.status === 'active' ? 'Active' : 'Suspended'}
          </span>
        </div>
        <div className="territory-owner">
          <FlagBanner aria-hidden="true" size={24} />
          <div>
            <span>Current owner</span>
            <strong>{displayedZone.owner?.playerName ?? 'Unclaimed'}</strong>
          </div>
        </div>
        <p className="territory-window">
          <HourglassMedium aria-hidden="true" size={18} />
          {displayedZone.status === 'suspended'
            ? 'Influence is paused for this territory.'
            : displayedZone.seasonId === null
              ? 'No ranked season is active. Ownership is unavailable.'
              : displayedZone.windowEnd
                ? `Ownership updates at ${formatJohannesburgTime(displayedZone.windowEnd)}.`
                : 'The next ownership update is unavailable.'}
        </p>
      </header>

      {detail.stale ? (
        <TerritoryStaleNotice
          lastUpdatedAt={detail.lastUpdatedAt}
          message="Some territory details may be out of date."
          onRetry={onRefresh}
        />
      ) : null}

      {detail.status === 'loading' ? (
        <ExplorationLoadingPanel
          className="exploration-loading-panel--inline"
          label="Loading territory activity…"
        />
      ) : detail.status === 'error' ? (
        <div
          className="territory-state state-message state-message--error"
          role="alert"
        >
          <StateIcon tone="error" />
          <strong>Territory activity could not load.</strong>
          <p>Retry to load standings and history.</p>
          <button
            className="button button--quiet"
            onClick={onRefresh}
            type="button"
          >
            <ArrowClockwise aria-hidden="true" size={20} /> Retry details
          </button>
        </div>
      ) : detail.status === 'ready' ? (
        <>
          {failed.has('detail') ? (
            <SectionUnavailable section="detail" onRetry={onRefresh} />
          ) : null}
          <section
            aria-labelledby="territory-contest-heading"
            className="territory-section"
          >
            <div className="territory-section__heading">
              <div>
                <h3 id="territory-contest-heading">Current contest</h3>
                <p>Influence this hour. Players are anonymous.</p>
              </div>
              <UsersThree aria-hidden="true" size={22} />
            </div>
            {failed.has('standings') || detail.standings === null ? (
              <SectionUnavailable section="standings" onRetry={onRefresh} />
            ) : detail.standings.seasonId === null ? (
              <p className="territory-section__empty">
                No ranked season is active.
              </p>
            ) : detail.standings.top.length === 0 ? (
              <p className="territory-section__empty">
                No eligible influence has been recorded this hour.
              </p>
            ) : (
              <ol className="territory-standings">
                {detail.standings.top.map((standing) => (
                  <li key={standing.rank}>
                    <span>Rank {standing.rank}</span>
                    <strong>{standing.influence} influence</strong>
                    <progress
                      aria-label={`Rank ${standing.rank}: ${standing.influence} influence`}
                      max={detail.standings!.top[0]?.influence ?? 1}
                      value={standing.influence}
                    />
                  </li>
                ))}
              </ol>
            )}
            {detail.standings !== null ? (
              <p className="territory-activity">
                {detail.standings.activity.influence} accepted influence from{' '}
                {detail.standings.activity.contributors}{' '}
                {detail.standings.activity.contributors === 1
                  ? 'contributor'
                  : 'contributors'}
              </p>
            ) : null}
          </section>

          {detail.standings !== null ? (
            <section
              aria-labelledby="territory-your-influence"
              className="territory-section territory-section--viewer"
            >
              <h3 id="territory-your-influence">Your influence</h3>
              <dl className="territory-viewer-stats">
                <div>
                  <dt>This hour</dt>
                  <dd>{detail.standings.viewer.influence}</dd>
                </div>
                <div>
                  <dt>Today</dt>
                  <dd>
                    {detail.standings.viewer.todayInfluence} /{' '}
                    {detail.standings.viewer.dailyCap}
                  </dd>
                </div>
                <div>
                  <dt>Remaining today</dt>
                  <dd>{detail.standings.viewer.remainingDailyInfluence}</dd>
                </div>
              </dl>
            </section>
          ) : null}

          <section
            aria-labelledby="territory-history-heading"
            className="territory-section"
          >
            <div className="territory-section__heading">
              <div>
                <h3 id="territory-history-heading">Ownership history</h3>
              </div>
            </div>
            {failed.has('history') || detail.history === null ? (
              <SectionUnavailable section="history" onRetry={onRefresh} />
            ) : historyEntries.length === 0 ? (
              <p className="territory-section__empty">
                No ownership changes yet.
              </p>
            ) : (
              <>
                <ol className="territory-history">
                  {shownHistory.map((entry, index) => (
                    <li key={`${entry.effectiveAt}-${index}`}>
                      <span
                        className="territory-history__marker"
                        aria-hidden="true"
                      />
                      <div>
                        <strong>{historyLabel(entry)}</strong>
                        <time dateTime={entry.effectiveAt}>
                          {formatHistoryTime(entry.effectiveAt)}
                        </time>
                      </div>
                    </li>
                  ))}
                </ol>
                {historyEntries.length > HISTORY_PREVIEW_COUNT ? (
                  <button
                    className="territory-history__toggle"
                    onClick={toggleHistory}
                    type="button"
                  >
                    {showAllHistory
                      ? 'Show recent history'
                      : `Show ${historyEntries.length - HISTORY_PREVIEW_COUNT} older changes`}
                  </button>
                ) : null}
              </>
            )}
          </section>

          <div className="territory-detail__footer">
            <p>
              The map is approximate. Ranked checks your location before you
              join.
            </p>
            <button
              className="button button--quiet"
              disabled={detail.refreshing}
              onClick={onRefresh}
              type="button"
            >
              <ArrowClockwise aria-hidden="true" size={20} />
              {detail.refreshing ? 'Refreshing…' : 'Refresh territory'}
            </button>
          </div>
        </>
      ) : null}
    </article>
  );
}

function TerritoryStaleNotice({
  lastUpdatedAt,
  message,
  onRetry,
}: {
  lastUpdatedAt: number | null;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="territory-stale" role="status">
      <div>
        <strong>{message}</strong>
        {lastUpdatedAt !== null ? (
          <p>Last updated {formatUpdatedTime(lastUpdatedAt)}.</p>
        ) : null}
      </div>
      <button onClick={onRetry} type="button">
        Refresh
      </button>
    </div>
  );
}

function SectionUnavailable({
  onRetry,
  section,
}: {
  onRetry: () => void;
  section: TerritoryDetailSection;
}) {
  const message = {
    detail: 'Territory details could not be refreshed.',
    history: 'Ownership history could not be refreshed.',
    standings: 'Current standings could not be refreshed.',
  }[section];
  return (
    <div className="territory-section__unavailable">
      <p>{message}</p>
      <button onClick={onRetry} type="button">
        Retry
      </button>
    </div>
  );
}

function ownerLabel(zone: TerritoryZoneSummary): string {
  if (zone.status === 'suspended') return 'Ownership paused';
  return zone.owner ? `Owned by ${zone.owner.playerName}` : 'Unclaimed';
}

function zoneStatusLabel(zone: TerritoryZoneSummary): string {
  return `${zone.status}, ${ownerLabel(zone)}`;
}

function historyLabel(entry: TerritoryHistoryEntry): string {
  const labels: Record<TerritoryTransitionKind, string> = {
    account_deletion: 'Ownership ended after account deletion',
    activated: 'Territory activated',
    reactivated: 'Territory reactivated',
    retired: 'Territory retired',
    season_reset: 'Ownership reset for a new season',
    settlement: entry.owner
      ? `${entry.owner.playerName} took ownership`
      : 'Territory became unclaimed',
    suspended: 'Territory suspended',
  };
  return labels[entry.transitionKind];
}

function formatJohannesburgTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Johannesburg',
    timeZoneName: 'short',
  }).format(new Date(value));
}

function formatHistoryTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatUpdatedTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

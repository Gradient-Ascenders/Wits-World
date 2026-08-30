import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link } from 'wouter';

import {
  AuthorApiError,
  createAuthorCampaign,
  isAuthorContentConflict,
  listAuthorCampaigns,
  listAuthorEvents,
  listAuthorTrails,
  transitionAuthorContent,
  updateAuthorCampaign,
  type AuthorCampaign,
  type AuthorCampaignInput,
  type AuthorEvent,
  type AuthorTrail,
  type AuthorTransitionAction,
} from '../../api/author';
import type { ApiAccessTokenProvider } from '../../auth/useApiAccessToken';
import { AuthorConfirmationDialog } from './AuthorConfirmationDialog';
import { AuthorFeedback } from './AuthorFeedback';
import { AuthorHistoryPanel } from './AuthorHistoryPanel';
import { AuthorLifecycleControls } from './AuthorLifecycleControls';
import { useUnsavedAuthorChanges } from './AuthorNavigationGuard';
import { authorPaths, type AuthorWorkspaceRoute } from './author-routing';

interface CampaignWorkspaceProps {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  route: Extract<AuthorWorkspaceRoute, { section: 'campaigns' }>;
}

type LoadState = 'error' | 'loading' | 'ready';

export function CampaignWorkspace({
  apiBaseUrl,
  getAccessToken,
  navigate,
  route,
}: CampaignWorkspaceProps) {
  const [campaigns, setCampaigns] = useState<AuthorCampaign[]>([]);
  const [events, setEvents] = useState<AuthorEvent[]>([]);
  const [trails, setTrails] = useState<AuthorTrail[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [apiError, setApiError] = useState<AuthorApiError | null>(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const requestRef = useRef<AbortController | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState('loading');
    setApiError(null);
    try {
      const [nextCampaigns, nextEvents, nextTrails] = await Promise.all([
        listAuthorCampaigns({
          apiBaseUrl,
          getAccessToken,
          signal: controller.signal,
        }),
        listAuthorEvents({
          apiBaseUrl,
          getAccessToken,
          signal: controller.signal,
        }),
        listAuthorTrails({
          apiBaseUrl,
          getAccessToken,
          signal: controller.signal,
        }),
      ]);
      if (!controller.signal.aborted) {
        setCampaigns(nextCampaigns);
        setEvents(nextEvents);
        setTrails(nextTrails);
        setState('ready');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setApiError(toAuthorError(error));
        setState('error');
      }
    }
  }, [apiBaseUrl, getAccessToken]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);
  useEffect(() => {
    if (apiError || message) feedbackRef.current?.focus();
  }, [apiError, message]);

  const filteredCampaigns = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return campaigns
      .filter(
        (campaign) =>
          statusFilter === 'all' || campaign.status === statusFilter,
      )
      .filter(
        (campaign) =>
          !query ||
          campaign.title.toLocaleLowerCase().includes(query) ||
          campaign.description?.toLocaleLowerCase().includes(query),
      )
      .sort(
        (left, right) =>
          Date.parse(left.startsAt) - Date.parse(right.startsAt) ||
          left.title.localeCompare(right.title),
      );
  }, [campaigns, search, statusFilter]);

  const selected =
    'campaignId' in route
      ? (campaigns.find(
          (campaign) => campaign.campaignId === route.campaignId,
        ) ?? null)
      : null;

  function applyCampaign(campaign: AuthorCampaign, notice: string) {
    setCampaigns((current) => {
      const exists = current.some(
        (candidate) => candidate.campaignId === campaign.campaignId,
      );
      return exists
        ? current.map((candidate) =>
            candidate.campaignId === campaign.campaignId ? campaign : candidate,
          )
        : [campaign, ...current];
    });
    setApiError(null);
    setMessage(notice);
  }

  if (state === 'loading') {
    return (
      <p className="author-state" role="status">
        Loading campaigns and available members…
      </p>
    );
  }

  if (state === 'error') {
    return (
      <section className="author-state author-state--error" role="alert">
        <strong>
          {loadErrorTitle(apiError, 'Campaigns are unavailable.')}
        </strong>
        <p>{apiError?.detail}</p>
        <button
          className="button button--quiet"
          onClick={() => void load()}
          type="button"
        >
          Reload campaigns
        </button>
      </section>
    );
  }

  return (
    <div
      className={`author-management-view author-management-view--${
        route.mode === 'list' ? 'list' : 'record'
      }`}
    >
      <aside
        aria-label="Campaign catalogue"
        className="author-catalogue author-catalogue--campaigns"
      >
        <div className="author-catalogue__header">
          <div>
            <p className="eyebrow">Scheduling</p>
            <h2>Campaigns</h2>
          </div>
          <Link className="button" href={authorPaths.newCampaign}>
            New campaign
          </Link>
        </div>
        <div className="author-toolbar author-toolbar--compact">
          <label className="author-search" htmlFor="campaign-search">
            <span>Search campaigns</span>
            <input
              id="campaign-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title or description"
              type="search"
              value={search}
            />
          </label>
          <label className="author-filter" htmlFor="campaign-status-filter">
            <span>Status</span>
            <select
              id="campaign-status-filter"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="all">All statuses</option>
              {['draft', 'in_review', 'approved', 'published', 'retired'].map(
                (status) => (
                  <option key={status} value={status}>
                    {titleCase(status)}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        {filteredCampaigns.length === 0 ? (
          <div className="author-state author-state--empty">
            <strong>
              {campaigns.length === 0
                ? 'No campaigns have been created.'
                : 'No campaigns match these filters.'}
            </strong>
          </div>
        ) : (
          <ol className="author-record-list">
            {filteredCampaigns.map((campaign) => (
              <li key={campaign.campaignId}>
                <Link
                  aria-current={
                    selected?.campaignId === campaign.campaignId
                      ? 'page'
                      : undefined
                  }
                  className="author-record-link"
                  href={authorPaths.campaign(campaign.campaignId)}
                >
                  <span>
                    <strong>{campaign.title}</strong>
                    <small>{campaignScheduleLabel(campaign)}</small>
                  </span>
                  <span
                    className={`status-badge status-badge--author-${campaign.status}`}
                  >
                    {titleCase(campaign.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </aside>

      <div className="author-record-view">
        <AuthorFeedback
          error={apiError}
          message={message}
          refObject={feedbackRef}
        />
        {route.mode === 'new' ? (
          <CampaignForm
            apiBaseUrl={apiBaseUrl}
            events={events}
            getAccessToken={getAccessToken}
            navigate={navigate}
            onSaved={(campaign) => {
              applyCampaign(campaign, 'Campaign draft created.');
              navigate(authorPaths.campaign(campaign.campaignId));
            }}
            trails={trails}
          />
        ) : selected && route.mode === 'edit' ? (
          selected.status === 'draft' ? (
            <CampaignForm
              apiBaseUrl={apiBaseUrl}
              campaign={selected}
              events={events}
              getAccessToken={getAccessToken}
              navigate={navigate}
              onReloadServer={load}
              onSaved={(campaign) => {
                applyCampaign(campaign, 'Campaign changes saved.');
                navigate(authorPaths.campaign(campaign.campaignId));
              }}
              trails={trails}
            />
          ) : (
            <CampaignEditUnavailable campaign={selected} />
          )
        ) : selected ? (
          <CampaignDetail
            apiBaseUrl={apiBaseUrl}
            campaign={selected}
            getAccessToken={getAccessToken}
            onChanged={applyCampaign}
            onConflict={async () => {
              await load();
              setMessage(
                'The campaign changed on the server. Its authoritative state was reloaded.',
              );
            }}
          />
        ) : 'campaignId' in route ? (
          <section className="author-state author-state--error" role="alert">
            <strong>This campaign is not in the loaded catalogue.</strong>
            <Link className="button button--quiet" href={authorPaths.campaigns}>
              Back to campaigns
            </Link>
          </section>
        ) : (
          <section className="author-welcome">
            <p className="eyebrow">Campaign catalogue</p>
            <h3>
              {campaigns.length > 0
                ? 'Select a campaign'
                : 'Create the first campaign'}
            </h3>
            <p>
              Group published events and trails inside one authoritative
              schedule.
            </p>
            <Link className="button" href={authorPaths.newCampaign}>
              New campaign
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}

function CampaignDetail({
  apiBaseUrl,
  campaign,
  getAccessToken,
  onChanged,
  onConflict,
}: {
  apiBaseUrl: string;
  campaign: AuthorCampaign;
  getAccessToken: ApiAccessTokenProvider;
  onChanged: (campaign: AuthorCampaign, notice: string) => void;
  onConflict: () => Promise<void>;
}) {
  const [apiError, setApiError] = useState<AuthorApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const operationRef = useRef<AbortController | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => operationRef.current?.abort(), []);
  useEffect(() => setApiError(null), [campaign.campaignId, campaign.status]);

  async function lifecycle(action: AuthorTransitionAction, reason?: string) {
    const controller = new AbortController();
    operationRef.current = controller;
    setBusy(true);
    setApiError(null);
    try {
      const next = await transitionAuthorContent({
        action,
        apiBaseUrl,
        entityId: campaign.campaignId,
        entityType: 'campaign',
        expectedVersion: campaign.version,
        getAccessToken,
        reason,
        signal: controller.signal,
      });
      if (operationRef.current === controller)
        onChanged(next, campaignLifecycleNotice(next));
    } catch (error) {
      if (operationRef.current === controller) {
        const nextError = toAuthorError(error);
        setApiError(nextError);
        if (isAuthorContentConflict(nextError)) await onConflict();
        else window.setTimeout(() => feedbackRef.current?.focus());
      }
    } finally {
      if (operationRef.current === controller) {
        operationRef.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <article aria-labelledby="campaign-detail-title" className="author-detail">
      <Link className="author-back-link" href={authorPaths.campaigns}>
        <span aria-hidden="true">←</span> Campaigns
      </Link>
      <header className="author-detail__heading">
        <div>
          <p className="eyebrow">Campaign schedule</p>
          <h3 id="campaign-detail-title">{campaign.title}</h3>
          <p>{campaign.description ?? 'No campaign description provided.'}</p>
        </div>
        <span
          className={`status-badge status-badge--author-${campaign.status}`}
        >
          {titleCase(campaign.status)}
        </span>
      </header>

      <AuthorFeedback error={apiError} refObject={feedbackRef} />
      <div className="author-overview-grid">
        <section className="author-summary-block">
          <p className="eyebrow">Schedule</p>
          <h4>{campaignScheduleLabel(campaign)}</h4>
          <dl className="author-metadata">
            <div>
              <dt>Starts</dt>
              <dd>
                <time dateTime={campaign.startsAt}>
                  {formatDateTime(campaign.startsAt)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Ends</dt>
              <dd>
                <time dateTime={campaign.endsAt}>
                  {formatDateTime(campaign.endsAt)}
                </time>
              </dd>
            </div>
          </dl>
        </section>
        <section className="author-summary-block">
          <p className="eyebrow">Membership</p>
          <h4>
            {campaign.events.length} events · {campaign.trails.length} trails
          </h4>
          {campaign.events.length === 0 && campaign.trails.length === 0 ? (
            <p>No events or trails are assigned yet.</p>
          ) : (
            <ul className="author-membership-summary">
              {campaign.events.map((event) => (
                <li key={event.eventId}>
                  <Link href={authorPaths.event(event.eventId)}>
                    {event.title}
                  </Link>
                  <span>{titleCase(event.authoringStatus)} event</span>
                </li>
              ))}
              {campaign.trails.map((trail) => (
                <li key={trail.trailId}>
                  <span>{trail.title}</span>
                  <span>{titleCase(trail.status)} trail</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <AuthorLifecycleControls
        busy={busy}
        editControl={
          <Link
            className="button"
            href={authorPaths.editCampaign(campaign.campaignId)}
          >
            Edit campaign
          </Link>
        }
        noun="campaign"
        onAction={(action, reason) => void lifecycle(action, reason)}
        retirementDescription={
          <p>
            Its members will leave new campaign discovery. Existing player
            history remains intact and this campaign cannot be republished.
          </p>
        }
        retirementTitle={`Retire ${campaign.title}?`}
        status={campaign.status}
        submittedBy={campaign.submittedBy}
      />
      <AuthorHistoryPanel
        apiBaseUrl={apiBaseUrl}
        entityId={campaign.campaignId}
        entityType="campaign"
        getAccessToken={getAccessToken}
        revision={campaign.version}
      />
    </article>
  );
}

function CampaignEditUnavailable({ campaign }: { campaign: AuthorCampaign }) {
  return (
    <article
      aria-labelledby="campaign-edit-unavailable"
      className="author-detail"
    >
      <Link
        className="author-back-link"
        href={authorPaths.campaign(campaign.campaignId)}
      >
        <span aria-hidden="true">←</span> Campaign detail
      </Link>
      <header className="author-detail__heading">
        <div>
          <p className="eyebrow">Campaign state</p>
          <h3 id="campaign-edit-unavailable">{campaign.title}</h3>
        </div>
        <span
          className={`status-badge status-badge--author-${campaign.status}`}
        >
          {titleCase(campaign.status)}
        </span>
      </header>
      <section className="author-state" role="status">
        <strong>This campaign is no longer editable.</strong>
        <p>
          Only a campaign in the Draft state can be edited. Review the current
          authoritative state before choosing another lifecycle action.
        </p>
        <Link
          className="button button--quiet"
          href={authorPaths.campaign(campaign.campaignId)}
        >
          Return to campaign detail
        </Link>
      </section>
    </article>
  );
}

interface CampaignDraft {
  description: string;
  endsAt: string;
  eventIds: string[];
  startsAt: string;
  title: string;
  trailIds: string[];
}

function CampaignForm({
  apiBaseUrl,
  campaign,
  events,
  getAccessToken,
  navigate,
  onReloadServer,
  onSaved,
  trails,
}: {
  apiBaseUrl: string;
  campaign?: AuthorCampaign;
  events: AuthorEvent[];
  getAccessToken: ApiAccessTokenProvider;
  navigate: CampaignWorkspaceProps['navigate'];
  onReloadServer?: () => Promise<void>;
  onSaved: (campaign: AuthorCampaign) => void;
  trails: AuthorTrail[];
}) {
  const initial = useMemo(() => campaignDraft(campaign), [campaign]);
  const [draft, setDraft] = useState<CampaignDraft>(initial);
  const [apiError, setApiError] = useState<AuthorApiError | null>(null);
  const [validation, setValidation] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [reloadDialogOpen, setReloadDialogOpen] = useState(false);
  const operationRef = useRef<AbortController | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const reloadButtonRef = useRef<HTMLButtonElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const clearDirty = useUnsavedAuthorChanges(dirty, 'campaign');
  const staleEdit = Boolean(
    campaign && onReloadServer && isAuthorContentConflict(apiError),
  );

  useEffect(() => () => operationRef.current?.abort(), []);
  useEffect(() => {
    setDraft(initial);
    setApiError(null);
    setValidation({});
  }, [initial]);

  function setMember(
    kind: 'eventIds' | 'trailIds',
    id: string,
    checked: boolean,
  ) {
    setDraft((current) => ({
      ...current,
      [kind]: checked
        ? [...current[kind], id]
        : current[kind].filter((candidate) => candidate !== id),
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextValidation = validateCampaignDraft(draft);
    setValidation(nextValidation);
    if (Object.keys(nextValidation).length > 0) {
      const firstField = Object.keys(nextValidation)[0]!;
      document.getElementById(`campaign-${fieldId(firstField)}`)?.focus();
      return;
    }

    const controller = new AbortController();
    operationRef.current = controller;
    setBusy(true);
    setApiError(null);
    try {
      const input = campaignInput(draft);
      const saved = campaign
        ? await updateAuthorCampaign({
            apiBaseUrl,
            campaignId: campaign.campaignId,
            expectedVersion: campaign.version,
            getAccessToken,
            input,
            signal: controller.signal,
          })
        : await createAuthorCampaign({
            apiBaseUrl,
            getAccessToken,
            input,
            signal: controller.signal,
          });
      if (operationRef.current === controller) {
        clearDirty();
        onSaved(saved);
      }
    } catch (error) {
      if (operationRef.current === controller) {
        setApiError(toAuthorError(error));
        window.setTimeout(() => feedbackRef.current?.focus());
      }
    } finally {
      if (operationRef.current === controller) {
        operationRef.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <form
      className="author-form"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <Link
        className="author-back-link"
        href={
          campaign
            ? authorPaths.campaign(campaign.campaignId)
            : authorPaths.campaigns
        }
      >
        <span aria-hidden="true">←</span>{' '}
        {campaign ? 'Campaign detail' : 'Campaigns'}
      </Link>
      <header className="author-detail__heading">
        <div>
          <p className="eyebrow">{campaign ? 'Edit draft' : 'New draft'}</p>
          <h3>{campaign ? campaign.title : 'Create campaign'}</h3>
        </div>
        <span className="status-badge status-badge--author-draft">Draft</span>
      </header>
      <AuthorFeedback error={apiError} refObject={feedbackRef} />
      {staleEdit ? (
        <div className="author-notice" role="status">
          <strong>Your form has been preserved.</strong>
          <p>
            The campaign changed on the server. Reload its authoritative version
            before trying another save.
          </p>
          <button
            className="button button--quiet"
            onClick={() => setReloadDialogOpen(true)}
            ref={reloadButtonRef}
            type="button"
          >
            Reload server version
          </button>
        </div>
      ) : null}

      <div className="author-form-grid">
        <label className="form-field" htmlFor="campaign-title">
          <span>Title</span>
          <input
            aria-describedby={
              validation.title ? 'campaign-title-error' : undefined
            }
            aria-invalid={validation.title ? 'true' : undefined}
            id="campaign-title"
            maxLength={120}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
            value={draft.title}
          />
          {validation.title ? (
            <span className="field-error" id="campaign-title-error">
              {validation.title}
            </span>
          ) : null}
        </label>
        <label
          className="form-field author-form-grid__wide"
          htmlFor="campaign-description"
        >
          <span>Description</span>
          <textarea
            id="campaign-description"
            maxLength={2000}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
            value={draft.description}
          />
        </label>
        <label className="form-field" htmlFor="campaign-starts-at">
          <span>Starts</span>
          <input
            aria-describedby={
              validation.startsAt ? 'campaign-starts-at-error' : undefined
            }
            aria-invalid={validation.startsAt ? 'true' : undefined}
            id="campaign-starts-at"
            onChange={(event) =>
              setDraft({ ...draft, startsAt: event.target.value })
            }
            type="datetime-local"
            value={draft.startsAt}
          />
          {validation.startsAt ? (
            <span className="field-error" id="campaign-starts-at-error">
              {validation.startsAt}
            </span>
          ) : null}
        </label>
        <label className="form-field" htmlFor="campaign-ends-at">
          <span>Ends</span>
          <input
            aria-describedby={
              validation.endsAt ? 'campaign-ends-at-error' : undefined
            }
            aria-invalid={validation.endsAt ? 'true' : undefined}
            id="campaign-ends-at"
            onChange={(event) =>
              setDraft({ ...draft, endsAt: event.target.value })
            }
            type="datetime-local"
            value={draft.endsAt}
          />
          {validation.endsAt ? (
            <span className="field-error" id="campaign-ends-at-error">
              {validation.endsAt}
            </span>
          ) : null}
        </label>
      </div>

      <div className="author-membership-grid">
        <MembershipFieldset
          empty="No events are available. Create and publish an event first."
          items={events.map((event) => ({
            id: event.eventId,
            label: event.title,
            status: titleCase(event.authoringStatus),
          }))}
          legend="Events"
          onChange={(id, checked) => setMember('eventIds', id, checked)}
          selected={draft.eventIds}
        />
        <MembershipFieldset
          empty="No trails are available."
          items={trails.map((trail) => ({
            id: trail.trailId,
            label: trail.title,
            status: titleCase(trail.status),
          }))}
          legend="Trails"
          onChange={(id, checked) => setMember('trailIds', id, checked)}
          selected={draft.trailIds}
        />
      </div>
      <p className="field-help">
        Drafts may be saved without members. Approval and publication require at
        least one published member, and the server checks schedule conflicts.
      </p>

      <div className="author-actions author-actions--detail">
        <button className="button" disabled={busy || staleEdit} type="submit">
          {busy ? 'Saving…' : campaign ? 'Save campaign' : 'Create campaign'}
        </button>
        <button
          className="button button--quiet"
          disabled={busy}
          onClick={() =>
            navigate(
              campaign
                ? authorPaths.campaign(campaign.campaignId)
                : authorPaths.campaigns,
            )
          }
          type="button"
        >
          Cancel
        </button>
      </div>
      {reloadDialogOpen && onReloadServer ? (
        <AuthorConfirmationDialog
          cancelLabel="Keep local draft"
          confirmLabel="Reload server version"
          description={
            <p>
              This discards the preserved local campaign changes and replaces
              them with the current server version.
            </p>
          }
          onCancel={() => setReloadDialogOpen(false)}
          onConfirm={() => {
            setReloadDialogOpen(false);
            clearDirty();
            void onReloadServer();
          }}
          returnFocusRef={reloadButtonRef}
          title="Reload the server campaign?"
        />
      ) : null}
    </form>
  );
}

function MembershipFieldset({
  empty,
  items,
  legend,
  onChange,
  selected,
}: {
  empty: string;
  items: Array<{ id: string; label: string; status: string }>;
  legend: string;
  onChange: (id: string, checked: boolean) => void;
  selected: string[];
}) {
  return (
    <fieldset className="author-membership">
      <legend>{legend}</legend>
      {items.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <label>
                <input
                  checked={selected.includes(item.id)}
                  onChange={(event) => onChange(item.id, event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.status}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

function campaignDraft(campaign?: AuthorCampaign): CampaignDraft {
  return {
    description: campaign?.description ?? '',
    endsAt: campaign ? toLocalDateTime(campaign.endsAt) : '',
    eventIds: campaign?.events.map((event) => event.eventId) ?? [],
    startsAt: campaign ? toLocalDateTime(campaign.startsAt) : '',
    title: campaign?.title ?? '',
    trailIds: campaign?.trails.map((trail) => trail.trailId) ?? [],
  };
}

function validateCampaignDraft(draft: CampaignDraft) {
  const errors: Record<string, string> = {};
  if (!draft.title.trim()) errors.title = 'Enter a campaign title.';
  if (!draft.startsAt) errors.startsAt = 'Choose a start date and time.';
  if (!draft.endsAt) errors.endsAt = 'Choose an end date and time.';
  if (
    draft.startsAt &&
    draft.endsAt &&
    Date.parse(draft.endsAt) <= Date.parse(draft.startsAt)
  )
    errors.endsAt = 'End must be after start.';
  return errors;
}

function fieldId(field: string) {
  return field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function campaignInput(draft: CampaignDraft): AuthorCampaignInput {
  return {
    description: draft.description.trim() || null,
    endsAt: new Date(draft.endsAt).toISOString(),
    eventIds: draft.eventIds,
    startsAt: new Date(draft.startsAt).toISOString(),
    title: draft.title.trim(),
    trailIds: draft.trailIds,
  };
}

function campaignLifecycleNotice(campaign: AuthorCampaign) {
  return {
    approved: 'Campaign approved.',
    draft: 'Campaign returned to draft.',
    in_review: 'Campaign submitted for independent review.',
    published: 'Campaign published and its schedule is now authoritative.',
    retired: 'Campaign retired. Existing player history remains intact.',
  }[campaign.status];
}

function campaignScheduleLabel(campaign: AuthorCampaign) {
  return `${formatDate(campaign.startsAt)} – ${formatDate(campaign.endsAt)}`;
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function titleCase(value: string) {
  return value
    .replace('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toAuthorError(error: unknown) {
  return error instanceof AuthorApiError
    ? error
    : new AuthorApiError(
        'unavailable',
        'The API request could not be completed.',
      );
}

function loadErrorTitle(error: AuthorApiError | null, fallback: string) {
  if (error?.failure === 'authorization')
    return 'Your session needs attention.';
  if (error?.failure === 'forbidden') return 'Author permission was refused.';
  return fallback;
}

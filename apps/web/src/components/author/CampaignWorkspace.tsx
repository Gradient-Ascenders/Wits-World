import {
  AuthorRecordBackLink,
  ReviewSubmissionMeta,
} from './AuthorReviewNavigation';
import { SelectField } from '../fields/SelectField';
import { SearchField } from '../fields/SearchField';
import {
  createAppDateTimeFormatter,
  parseAppDateTimeLocal,
  toAppDateTimeLocal,
} from '../../date-time';
import { authorErrorDetail } from './author-error-copy';
import { StateIcon } from '../StatusMessage';
import { AuthorLoadingState } from './AuthorLoadingState';
import { ArrowLeftIcon, CaretRightIcon, XIcon } from '@phosphor-icons/react';
import { AuthorSaveBar } from './AuthorSaveBar';
import { AuthorDateTimePicker } from './AuthorDateTimePicker';
import {
  CampaignContentPicker,
  CampaignStatus,
  type CampaignMember,
} from './CampaignContentPicker';
import './author-campaigns.css';
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
  const catalogueRef = useRef<HTMLElement>(null);
  const recordRef = useRef<HTMLDivElement>(null);
  const routeKey = `${route.mode}:${'campaignId' in route ? route.campaignId : ''}:${'tab' in route ? route.tab : ''}`;
  const previousRouteRef = useRef(routeKey);

  useEffect(() => {
    if (state !== 'ready' || previousRouteRef.current === routeKey) return;
    previousRouteRef.current = routeKey;
    (route.mode === 'list' ? catalogueRef.current : recordRef.current)?.focus();
    window.scrollTo({ top: 0 });
  }, [state, route.mode, routeKey]);

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
      <AuthorLoadingState label="Loading campaigns and available members…" />
    );
  }

  if (state === 'error') {
    return (
      <section
        className="author-state author-state--error state-message state-message--error"
        role="alert"
      >
        <StateIcon tone="error" />
        <strong>
          {loadErrorTitle(apiError, 'Campaigns are unavailable.')}
        </strong>
        <p>{apiError ? authorErrorDetail(apiError) : null}</p>
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
    <section
      className="author-workspace author-workspace--campaigns"
      aria-label="Campaign workspace"
    >
      {route.mode === 'list' ? (
        <>
          <header className="author-workspace__heading">
            <h2>Campaigns</h2>
            <Link className="button" href={authorPaths.newCampaign}>
              New campaign
            </Link>
          </header>
          <aside
            aria-label="Campaign catalogue"
            className="author-catalogue"
            ref={catalogueRef}
            tabIndex={-1}
          >
            <div className="campaign-catalogue-filters">
              <SearchField
                label="Search"
                id="campaign-search"
                placeholder="Title or description"
                value={search}
                onChange={setSearch}
              />
              <SelectField
                label="Lifecycle"
                id="campaign-status-filter"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'all', label: 'All' },
                  ...[
                    'draft',
                    'in_review',
                    'approved',
                    'published',
                    'retired',
                  ].map((status) => ({
                    value: status,
                    label: titleCase(status),
                  })),
                ]}
              />
            </div>
            <p className="author-catalogue__results" aria-live="polite">
              {filteredCampaigns.length}{' '}
              {filteredCampaigns.length === 1 ? 'campaign' : 'campaigns'}
            </p>
            {filteredCampaigns.length === 0 ? (
              <div className="author-state author-state--empty state-message state-message--empty">
                <StateIcon tone="empty" />
                <strong>
                  {campaigns.length === 0
                    ? 'No campaigns yet'
                    : 'No campaigns match'}
                </strong>
                <p>
                  {campaigns.length === 0
                    ? 'Create a draft to start scheduling content.'
                    : 'Adjust the search or lifecycle filter.'}
                </p>
              </div>
            ) : (
              <div className="campaign-table-wrap">
                <table className="campaign-table">
                  <thead>
                    <tr>
                      <th scope="col">Campaign</th>
                      <th scope="col">Schedule · Johannesburg</th>
                      <th scope="col">Lifecycle</th>
                      <th scope="col">Content</th>
                      <th scope="col">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCampaigns.map((campaign) => (
                      <tr
                        className="author-linked-row"
                        key={campaign.campaignId}
                      >
                        <th scope="row">
                          <Link
                            className="author-row-link"
                            href={authorPaths.campaign(campaign.campaignId)}
                          >
                            {campaign.title}
                          </Link>
                        </th>
                        <td>{campaignScheduleLabel(campaign)}</td>
                        <td>
                          <CampaignStatus status={campaign.status} />
                        </td>
                        <td>
                          {memberCounts(
                            campaign.events.length,
                            campaign.trails.length,
                          )}
                        </td>
                        <td>
                          <time dateTime={campaign.updatedAt}>
                            {formatDateTime(campaign.updatedAt)}
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </aside>
        </>
      ) : (
        <div className="author-record-view" ref={recordRef} tabIndex={-1}>
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
              key="new-campaign"
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
                key={`campaign-form:${selected.campaignId}:${selected.version}`}
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
              tab={'tab' in route ? route.tab : undefined}
              key={selected.campaignId}
              onChanged={applyCampaign}
              onConflict={async () => {
                await load();
                setMessage(
                  'The campaign changed on the server. Its authoritative state was reloaded.',
                );
              }}
            />
          ) : 'campaignId' in route ? (
            <section
              className="author-state author-state--error state-message state-message--error"
              role="alert"
            >
              <StateIcon tone="error" />
              <strong>This campaign is not in the loaded catalogue.</strong>
              <Link
                className="button button--quiet"
                href={authorPaths.campaigns}
              >
                Back to campaigns
              </Link>
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}

function CampaignDetail({
  apiBaseUrl,
  campaign,
  getAccessToken,
  onChanged,
  onConflict,
  tab = 'details',
}: {
  apiBaseUrl: string;
  campaign: AuthorCampaign;
  getAccessToken: ApiAccessTokenProvider;
  onChanged: (campaign: AuthorCampaign, notice: string) => void;
  onConflict: () => Promise<void>;
  tab?: 'details' | 'review' | 'history';
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
      <AuthorRecordBackLink href={authorPaths.campaigns}>
        Campaigns
      </AuthorRecordBackLink>
      <header className="author-detail__heading">
        <h3 id="campaign-detail-title">{campaign.title}</h3>
        <CampaignStatus status={campaign.status} />
      </header>
      <ReviewSubmissionMeta
        entityId={campaign.campaignId}
        submittedAt={campaign.submittedAt}
        submittedBy={campaign.submittedBy}
      />
      <div className="campaign-detail-summary">
        <p>
          {campaignScheduleLabel(campaign)} · Johannesburg ·{' '}
          {memberCounts(campaign.events.length, campaign.trails.length)}
        </p>
        {campaign.status === 'draft' ? (
          <Link
            className="button button--quiet"
            href={authorPaths.editCampaign(campaign.campaignId)}
          >
            Edit campaign
          </Link>
        ) : null}
      </div>
      <nav className="campaign-tabs" aria-label="Campaign workspace">
        <Link
          href={authorPaths.campaign(campaign.campaignId)}
          aria-current={tab === 'details' ? 'page' : undefined}
        >
          Details
        </Link>
        <Link
          href={authorPaths.campaignReview(campaign.campaignId)}
          aria-current={tab === 'review' ? 'page' : undefined}
        >
          Review
        </Link>
        <Link
          href={authorPaths.campaignHistory(campaign.campaignId)}
          aria-current={tab === 'history' ? 'page' : undefined}
        >
          History
        </Link>
      </nav>
      <AuthorFeedback
        compact={tab === 'review'}
        error={apiError}
        refObject={feedbackRef}
      />
      {tab === 'details' || tab === 'review' ? (
        <div className="campaign-definition">
          {campaign.description ? <p>{campaign.description}</p> : null}
          <dl className="campaign-metadata">
            <div>
              <dt>Starts at</dt>
              <dd>
                <time dateTime={campaign.startsAt}>
                  {formatDateTime(campaign.startsAt)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Ends at</dt>
              <dd>
                <time dateTime={campaign.endsAt}>
                  {formatDateTime(campaign.endsAt)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd>Johannesburg · UTC+02:00</dd>
            </div>
          </dl>
          <h4>Content</h4>
          <CampaignMembers
            items={[
              ...campaign.events.map((event) => ({
                id: event.eventId,
                title: event.title,
                status: event.authoringStatus,
                kind: 'event' as const,
              })),
              ...campaign.trails.map((trail) => ({
                id: trail.trailId,
                title: trail.title,
                status: trail.status,
                kind: 'trail' as const,
              })),
            ]}
          />
        </div>
      ) : null}
      {tab === 'review' ? (
        <section className="campaign-review" aria-label="Campaign review">
          {campaign.status === 'retired' ? (
            <p>This campaign is retired.</p>
          ) : null}
          <AuthorLifecycleControls
            busy={busy}
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
        </section>
      ) : null}
      {tab === 'history' ? (
        <section className="campaign-history" aria-label="Campaign history">
          <AuthorHistoryPanel
            defaultOpen
            apiBaseUrl={apiBaseUrl}
            entityId={campaign.campaignId}
            entityType="campaign"
            getAccessToken={getAccessToken}
            revision={campaign.version}
          />
        </section>
      ) : null}
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
        <ArrowLeftIcon size={16} aria-hidden="true" /> Campaign detail
      </Link>
      <header className="author-detail__heading">
        <div>
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const addContentRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const memberItems: CampaignMember[] = [
    ...events.map((event) => ({
      id: event.eventId,
      title: event.title,
      status: event.authoringStatus,
      kind: 'event' as const,
    })),
    ...trails.map((trail) => ({
      id: trail.trailId,
      title: trail.title,
      status: trail.status,
      kind: 'trail' as const,
    })),
  ];
  const selectedMembers: CampaignMember[] = [
    ...draft.eventIds.map(
      (id) =>
        memberItems.find((item) => item.kind === 'event' && item.id === id) ?? {
          id,
          title:
            campaign?.events.find((item) => item.eventId === id)?.title ?? id,
          status: 'unavailable' as const,
          kind: 'event' as const,
        },
    ),
    ...draft.trailIds.map(
      (id) =>
        memberItems.find((item) => item.kind === 'trail' && item.id === id) ?? {
          id,
          title:
            campaign?.trails.find((item) => item.trailId === id)?.title ?? id,
          status: 'unavailable' as const,
          kind: 'trail' as const,
        },
    ),
  ];
  const operationRef = useRef<AbortController | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const reloadButtonRef = useRef<HTMLButtonElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const clearDirty = useUnsavedAuthorChanges(dirty, 'campaign');
  const staleEdit = Boolean(
    campaign && onReloadServer && isAuthorContentConflict(apiError),
  );

  useEffect(() => () => operationRef.current?.abort(), []);
  function setField<Key extends keyof CampaignDraft>(
    key: Key,
    value: CampaignDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setValidation((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }
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
    if (busy || staleEdit) return;
    const nextValidation = validateCampaignDraft(draft);
    setValidation(nextValidation);
    if (Object.keys(nextValidation).length > 0) {
      const firstField = Object.keys(nextValidation)[0]!;
      const field = document.getElementById(`campaign-${fieldId(firstField)}`);
      (
        field?.querySelector<HTMLElement>('[role="spinbutton"]') ?? field
      )?.focus();
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
        <ArrowLeftIcon size={16} aria-hidden="true" />{' '}
        {campaign ? 'Campaign detail' : 'Campaigns'}
      </Link>
      <header className="author-detail__heading">
        <div>
          <h3>{campaign ? campaign.title : 'New campaign'}</h3>
        </div>
        {campaign ? <CampaignStatus status={campaign.status} /> : null}
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

      <div className="campaign-form-fields">
        <label className="form-field" htmlFor="campaign-title">
          <span>Campaign title</span>
          <input
            aria-describedby={
              validation.title ? 'campaign-title-error' : undefined
            }
            aria-invalid={validation.title ? 'true' : undefined}
            disabled={busy}
            id="campaign-title"
            maxLength={120}
            required
            onChange={(event) => setField('title', event.target.value)}
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
          <span>Description (optional)</span>
          <textarea
            rows={3}
            disabled={busy}
            id="campaign-description"
            maxLength={2000}
            onChange={(event) => setField('description', event.target.value)}
            value={draft.description}
          />
        </label>
      </div>
      <fieldset className="campaign-form-section">
        <legend>Schedule · Johannesburg</legend>
        <div className="author-form__grid">
          <AuthorDateTimePicker
            id="campaign-starts-at"
            label="Starts at"
            value={draft.startsAt}
            error={validation.startsAt}
            disabled={busy}
            onChange={(startsAt) => setField('startsAt', startsAt)}
          />
          <AuthorDateTimePicker
            id="campaign-ends-at"
            label="Ends at"
            value={draft.endsAt}
            error={validation.endsAt}
            disabled={busy}
            onChange={(endsAt) => setField('endsAt', endsAt)}
          />
        </div>
      </fieldset>
      <section
        className="campaign-form-section"
        aria-labelledby="campaign-content-title"
        ref={contentRef}
        tabIndex={-1}
      >
        <div className="campaign-content-heading">
          <h4 id="campaign-content-title">
            Content
            {selectedMembers.length ? (
              <span>
                {memberCounts(draft.eventIds.length, draft.trailIds.length)}
              </span>
            ) : null}
          </h4>
          <button
            className="button button--quiet"
            type="button"
            ref={addContentRef}
            disabled={busy}
            onClick={() => setPickerOpen(true)}
          >
            Add content
          </button>
        </div>
        <CampaignMembers
          items={selectedMembers}
          busy={busy}
          onRemove={(item) => {
            setMember(
              item.kind === 'event' ? 'eventIds' : 'trailIds',
              item.id,
              false,
            );
            contentRef.current?.focus();
          }}
        />
      </section>
      {pickerOpen ? (
        <CampaignContentPicker
          items={memberItems}
          eventIds={draft.eventIds}
          trailIds={draft.trailIds}
          returnFocusRef={addContentRef}
          onCancel={() => setPickerOpen(false)}
          onApply={(selection) => {
            setDraft((current) => ({ ...current, ...selection }));
            setPickerOpen(false);
          }}
        />
      ) : null}
      <AuthorSaveBar
        busy={busy}
        dirty={dirty}
        failed={Boolean(apiError) || Object.values(validation).some(Boolean)}
        isNew={!campaign}
      >
        <button className="button" disabled={busy || staleEdit} type="submit">
          {busy
            ? 'Saving campaign draft…'
            : campaign
              ? 'Save campaign'
              : 'Create draft campaign'}
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
      </AuthorSaveBar>
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

function CampaignMembers({
  items,
  busy,
  onRemove,
}: {
  items: CampaignMember[];
  busy?: boolean;
  onRemove?: (item: CampaignMember) => void;
}) {
  if (items.length === 0)
    return (
      <div className="campaign-content-empty">
        <strong>No content added.</strong>
        <p>You can save a draft before adding events or trails.</p>
      </div>
    );
  return (
    <div className="campaign-table-wrap">
      <table className="campaign-table campaign-table--members">
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Type</th>
            <th scope="col">Lifecycle</th>
            {onRemove ? (
              <th scope="col">
                <span className="sr-only">Remove</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.kind}:${item.id}`}>
              <th scope="row">
                {item.kind === 'event' && !onRemove ? (
                  <Link href={authorPaths.event(item.id)}>
                    {item.title}
                    <CaretRightIcon size={16} aria-hidden="true" />
                  </Link>
                ) : (
                  item.title
                )}
                {item.status !== 'published' ? (
                  <small className="campaign-member-warning">
                    {item.status === 'unavailable'
                      ? 'Unavailable in the loaded catalogue. Remove or reload before review.'
                      : item.status === 'retired'
                        ? 'Retired content cannot be approved or published.'
                        : 'Must be published before campaign approval.'}
                  </small>
                ) : null}
              </th>
              <td>{item.kind === 'event' ? 'Event' : 'Trail'}</td>
              <td>
                <CampaignStatus status={item.status} />
              </td>
              {onRemove ? (
                <td className="campaign-member-remove">
                  <button
                    className="button button--quiet"
                    type="button"
                    aria-label={`Remove ${item.kind}: ${item.title}`}
                    disabled={busy}
                    onClick={() => onRemove(item)}
                  >
                    <XIcon size={18} aria-hidden="true" />
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function memberCounts(events: number, trails: number) {
  return `${events} ${events === 1 ? 'event' : 'events'} · ${trails} ${trails === 1 ? 'trail' : 'trails'}`;
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
  const start = parseAppDateTimeLocal(draft.startsAt);
  const end = parseAppDateTimeLocal(draft.endsAt);
  if (!Number.isFinite(start.getTime()))
    errors.startsAt = 'Choose a valid start date and time.';
  if (!Number.isFinite(end.getTime()))
    errors.endsAt = 'Choose a valid end date and time.';
  if (!errors.startsAt && !errors.endsAt && end.getTime() <= start.getTime())
    errors.endsAt = 'End must be after start.';
  return errors;
}

function fieldId(field: string) {
  return field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function campaignInput(draft: CampaignDraft): AuthorCampaignInput {
  return {
    description: draft.description.trim() || null,
    endsAt: parseAppDateTimeLocal(draft.endsAt).toISOString(),
    eventIds: draft.eventIds,
    startsAt: parseAppDateTimeLocal(draft.startsAt).toISOString(),
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
  return toAppDateTimeLocal(value);
}

function formatDate(value: string) {
  return createAppDateTimeFormatter(undefined, { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

function formatDateTime(value: string) {
  return createAppDateTimeFormatter(undefined, {
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

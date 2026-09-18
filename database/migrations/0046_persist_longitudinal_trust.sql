create table private.trust_policy_versions (
  policy_version text primary key,
  created_at timestamptz not null default clock_timestamp(),

  constraint trust_policy_versions_name_check
    check (
      policy_version = lower(policy_version)
      and policy_version ~ '^[a-z][a-z0-9-]{0,63}$'
    )
);

revoke all on table private.trust_policy_versions from public;

insert into private.trust_policy_versions (policy_version)
values ('trust-v1');

create function private.prevent_trust_policy_version_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Trust policy versions are immutable'
    using errcode = '55006';
end;
$$;

create trigger trust_policy_versions_immutability
before update or delete on private.trust_policy_versions
for each row execute function private.prevent_trust_policy_version_mutation();

create function private.trust_player_is_deleting(player_id_to_check uuid)
returns boolean
language sql
stable
as $$
  select coalesce((
    select lifecycle_status in ('deletion_pending', 'deleted')
      from public.players
     where id = player_id_to_check
  ), false);
$$;

create function private.assert_active_trust_player(player_id_to_check uuid)
returns void
language plpgsql
as $$
declare
  player_lifecycle text;
begin
  select lifecycle_status
    into player_lifecycle
    from public.players
   where id = player_id_to_check
   for share;

  if player_lifecycle is distinct from 'active' then
    raise exception 'Trust persistence requires an active player'
      using errcode = '23514';
  end if;
end;
$$;

create table private.trust_signals (
  id uuid primary key,
  player_id uuid not null
    references public.players (id) on delete restrict,
  policy_version text not null
    references private.trust_policy_versions (policy_version) on delete restrict,
  signal_type text not null,
  severity text not null,
  base_points smallint not null,
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  source_type text not null,
  source_identifier text not null,
  deduplication_digest bytea not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint trust_signals_type_check
    check (signal_type in (
      'impossible_movement',
      'idempotency_payload_conflict',
      'submission_conflict_pattern',
      'opponent_concentration',
      'one_sided_outcome_pattern'
    )),
  constraint trust_signals_severity_check
    check (
      severity = lower(severity)
      and severity ~ '^[a-z][a-z0-9_]{0,31}$'
      and (
        signal_type <> 'impossible_movement'
        or severity in ('moderate', 'strong')
      )
    ),
  constraint trust_signals_points_check
    check (
      (signal_type = 'impossible_movement'
        and ((severity = 'moderate' and base_points = 15)
          or (severity = 'strong' and base_points = 25)))
      or (signal_type = 'idempotency_payload_conflict' and base_points = 10)
      or (signal_type = 'submission_conflict_pattern' and base_points = 10)
      or (signal_type = 'opponent_concentration' and base_points = 20)
      or (signal_type = 'one_sided_outcome_pattern' and base_points = 10)
    ),
  constraint trust_signals_timestamps_check
    check (
      isfinite(observed_at)
      and isfinite(expires_at)
      and isfinite(created_at)
      and expires_at = observed_at + interval '90 days'
      and created_at >= observed_at
    ),
  constraint trust_signals_source_type_check
    check (
      source_type = lower(source_type)
      and source_type ~ '^[a-z][a-z0-9_]{0,63}$'
    ),
  constraint trust_signals_source_identifier_check
    check (
      source_identifier = btrim(source_identifier)
      and char_length(source_identifier) between 1 and 256
      and source_identifier !~ '[[:cntrl:]]'
    ),
  constraint trust_signals_deduplication_digest_check
    check (octet_length(deduplication_digest) = 32),
  constraint trust_signals_source_unique
    unique (player_id, policy_version, signal_type, deduplication_digest)
);

revoke all on table private.trust_signals from public;

create index trust_signals_player_active_idx
  on private.trust_signals (player_id, policy_version, expires_at, observed_at desc);

create index trust_signals_expiry_idx
  on private.trust_signals (expires_at);

create function private.prepare_trust_signal_insert()
returns trigger
language plpgsql
as $$
begin
  perform private.assert_active_trust_player(new.player_id);
  new.expires_at := new.observed_at + interval '90 days';
  return new;
end;
$$;

create trigger trust_signals_prepare_insert
before insert on private.trust_signals
for each row execute function private.prepare_trust_signal_insert();

create function private.prevent_trust_signal_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and (
       private.trust_player_is_deleting(old.player_id)
       or old.expires_at <= clock_timestamp()
     ) then
    return old;
  end if;

  raise exception 'Trust signals are immutable before retention or account deletion'
    using errcode = '55006';
end;
$$;

create trigger trust_signals_immutability
before update or delete on private.trust_signals
for each row execute function private.prevent_trust_signal_mutation();

create table private.trust_score_snapshots (
  id uuid primary key,
  player_id uuid not null
    references public.players (id) on delete restrict,
  policy_version text not null
    references private.trust_policy_versions (policy_version) on delete restrict,
  evaluated_at timestamptz not null,
  movement_points smallint not null,
  submission_conflict_points smallint not null,
  opponent_pattern_points smallint not null,
  final_score smallint not null,
  review_band text not null,
  source_signal_count integer not null,
  calculation_digest bytea not null,
  purge_after timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint trust_score_snapshots_category_points_check
    check (
      movement_points between 0 and 50
      and submission_conflict_points between 0 and 30
      and opponent_pattern_points between 0 and 30
    ),
  constraint trust_score_snapshots_final_score_check
    check (
      final_score between 0 and 100
      and final_score = least(
        100,
        movement_points + submission_conflict_points + opponent_pattern_points
      )
    ),
  constraint trust_score_snapshots_band_check
    check (
      (final_score between 0 and 24 and review_band = 'normal')
      or (final_score between 25 and 49 and review_band = 'observe')
      or (final_score between 50 and 74 and review_band = 'review_required')
      or (final_score between 75 and 100 and review_band = 'urgent_review')
    ),
  constraint trust_score_snapshots_source_count_check
    check (source_signal_count >= 0),
  constraint trust_score_snapshots_digest_check
    check (octet_length(calculation_digest) = 32),
  constraint trust_score_snapshots_timestamps_check
    check (
      isfinite(evaluated_at)
      and isfinite(purge_after)
      and isfinite(created_at)
      and purge_after = evaluated_at + interval '12 months'
      and created_at >= evaluated_at
    )
);

revoke all on table private.trust_score_snapshots from public;

create index trust_score_snapshots_player_evaluated_idx
  on private.trust_score_snapshots (player_id, evaluated_at desc);

create index trust_score_snapshots_purge_idx
  on private.trust_score_snapshots (purge_after);

create function private.prepare_trust_score_snapshot_insert()
returns trigger
language plpgsql
as $$
begin
  perform private.assert_active_trust_player(new.player_id);
  new.purge_after := new.evaluated_at + interval '12 months';
  return new;
end;
$$;

create trigger trust_score_snapshots_prepare_insert
before insert on private.trust_score_snapshots
for each row execute function private.prepare_trust_score_snapshot_insert();

create function private.prevent_trust_score_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and old.purge_after <= clock_timestamp() then
    return old;
  end if;

  raise exception 'Trust score snapshots are immutable before retention expiry'
    using errcode = '55006';
end;
$$;

create trigger trust_score_snapshots_immutability
before update or delete on private.trust_score_snapshots
for each row execute function private.prevent_trust_score_snapshot_mutation();

create table private.trust_cases (
  id uuid primary key,
  player_id uuid not null
    references public.players (id) on delete restrict,
  policy_version text not null
    references private.trust_policy_versions (policy_version) on delete restrict,
  status text not null,
  version integer not null default 1,
  current_score smallint not null,
  current_band text not null,
  latest_score_snapshot_id uuid not null,
  opened_at timestamptz not null,
  updated_at timestamptz not null,
  resolved_at timestamptz,
  resolution_reason text,
  governance_finalized_at timestamptz,
  purge_after timestamptz,

  constraint trust_cases_status_check
    check (status in ('open', 'under_review', 'resolved')),
  constraint trust_cases_version_check
    check (version >= 1),
  constraint trust_cases_score_check
    check (current_score between 0 and 100),
  constraint trust_cases_band_check
    check (
      (current_score between 0 and 24 and current_band = 'normal')
      or (current_score between 25 and 49 and current_band = 'observe')
      or (current_score between 50 and 74 and current_band = 'review_required')
      or (current_score between 75 and 100 and current_band = 'urgent_review')
    ),
  constraint trust_cases_resolution_check
    check (
      (
        status = 'resolved'
        and resolved_at is not null
        and resolution_reason is not null
        and resolution_reason = lower(resolution_reason)
        and resolution_reason ~ '^[a-z][a-z0-9_]{0,63}$'
      )
      or (
        status <> 'resolved'
        and resolved_at is null
        and resolution_reason is null
        and governance_finalized_at is null
        and purge_after is null
      )
    ),
  constraint trust_cases_governance_retention_check
    check (
      (governance_finalized_at is null and purge_after is null)
      or (
        status = 'resolved'
        and governance_finalized_at >= resolved_at
        and purge_after = governance_finalized_at + interval '12 months'
      )
    ),
  constraint trust_cases_timestamps_check
    check (
      isfinite(opened_at)
      and isfinite(updated_at)
      and updated_at >= opened_at
      and (resolved_at is null or isfinite(resolved_at))
      and (governance_finalized_at is null or isfinite(governance_finalized_at))
      and (purge_after is null or isfinite(purge_after))
    )
);

revoke all on table private.trust_cases from public;

create unique index trust_cases_one_nonterminal_per_player_idx
  on private.trust_cases (player_id)
  where status in ('open', 'under_review');

create index trust_cases_review_queue_idx
  on private.trust_cases (status, current_band, updated_at, id);

create index trust_cases_player_history_idx
  on private.trust_cases (player_id, opened_at desc, id);

create index trust_cases_purge_idx
  on private.trust_cases (purge_after)
  where purge_after is not null;

create function private.prepare_trust_case_mutation()
returns trigger
language plpgsql
as $$
declare
  snapshot_record private.trust_score_snapshots%rowtype;
  validate_snapshot boolean;
begin
  validate_snapshot := tg_op = 'INSERT';
  if tg_op = 'INSERT' then
    perform private.assert_active_trust_player(new.player_id);

    if new.status <> 'open' then
      raise exception 'New trust cases must start open'
        using errcode = '23514';
    end if;

    if new.version <> 1 then
      raise exception 'New trust cases must start at version 1'
        using errcode = '23514';
    end if;

    if new.current_score < 25 then
      raise exception 'New trust cases require a score in observe or a higher review band'
        using errcode = '23514';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.player_id is distinct from old.player_id
       or new.policy_version is distinct from old.policy_version
       or new.opened_at is distinct from old.opened_at then
      raise exception 'Trust case identity fields are immutable'
        using errcode = '55006';
    end if;

    if new.version <> old.version + 1 then
      raise exception 'Trust case versions must advance exactly once per mutation'
        using errcode = '40001';
    end if;

    validate_snapshot :=
      new.status is distinct from old.status
      or new.current_score is distinct from old.current_score
      or new.current_band is distinct from old.current_band
      or new.latest_score_snapshot_id is distinct from old.latest_score_snapshot_id;

    if old.status = 'resolved' then
      if old.governance_finalized_at is not null
         or new.status is distinct from old.status
         or new.current_score is distinct from old.current_score
         or new.current_band is distinct from old.current_band
         or new.latest_score_snapshot_id is distinct from old.latest_score_snapshot_id
         or new.resolved_at is distinct from old.resolved_at
         or new.resolution_reason is distinct from old.resolution_reason
         or new.governance_finalized_at is null then
        raise exception 'Resolved trust cases are terminal except for one governance-finalization mutation'
          using errcode = '55006';
      end if;
    end if;

    if new.updated_at < old.updated_at then
      raise exception 'Trust case updated_at must be monotonic'
        using errcode = '23514';
    end if;

    if old.status = 'under_review' and new.status = 'open' then
      raise exception 'Trust cases cannot move from under_review back to open'
        using errcode = '23514';
    end if;

    if old.status <> 'resolved'
       and new.status = 'resolved'
       and new.resolved_at is distinct from new.updated_at then
      raise exception 'Trust case resolution time must equal its audited transition time'
        using errcode = '23514';
    end if;
  end if;

  if new.governance_finalized_at is not null
     and new.governance_finalized_at is distinct from new.updated_at then
    raise exception 'Trust governance finalization time must equal its audited transition time'
      using errcode = '23514';
  end if;

  if validate_snapshot then
    select * into snapshot_record
      from private.trust_score_snapshots
     where id = new.latest_score_snapshot_id;

    if not found
       or snapshot_record.player_id is distinct from new.player_id
       or snapshot_record.policy_version is distinct from new.policy_version
       or snapshot_record.final_score is distinct from new.current_score
       or snapshot_record.review_band is distinct from new.current_band then
      raise exception 'Trust case latest score snapshot must match its player, policy, score, and band'
        using errcode = '23514';
    end if;
  end if;

  if new.governance_finalized_at is not null then
    new.purge_after := new.governance_finalized_at + interval '12 months';
  else
    new.purge_after := null;
  end if;

  return new;
end;
$$;

create trigger trust_cases_prepare_mutation
before insert or update on private.trust_cases
for each row execute function private.prepare_trust_case_mutation();

create function private.prevent_trust_case_delete()
returns trigger
language plpgsql
as $$
declare
  cleanup_mode text;
begin
  cleanup_mode := current_setting('wits.trust_cleanup_mode', true);

  if cleanup_mode = 'account_deletion'
     and private.trust_player_is_deleting(old.player_id)
     and (
       old.status in ('open', 'under_review')
       or (old.status = 'resolved' and old.governance_finalized_at is null)
     ) then
    return old;
  end if;

  if cleanup_mode = 'retention'
     and old.status = 'resolved'
     and old.purge_after is not null
     and old.purge_after <= clock_timestamp() then
    return old;
  end if;

  raise exception 'Trust cases may be deleted only by account-deletion or retention cleanup'
    using errcode = '55006';
end;
$$;

create trigger trust_cases_delete_guard
before delete on private.trust_cases
for each row execute function private.prevent_trust_case_delete();

create table private.trust_case_evidence (
  id uuid primary key,
  case_id uuid not null
    references private.trust_cases (id) on delete cascade,
  original_signal_id uuid not null,
  signal_type text not null,
  severity text not null,
  base_points smallint not null,
  observed_at timestamptz not null,
  policy_version text not null
    references private.trust_policy_versions (policy_version) on delete restrict,
  safe_source_type text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint trust_case_evidence_type_check
    check (signal_type in (
      'impossible_movement',
      'idempotency_payload_conflict',
      'submission_conflict_pattern',
      'opponent_concentration',
      'one_sided_outcome_pattern'
    )),
  constraint trust_case_evidence_severity_check
    check (
      severity = lower(severity)
      and severity ~ '^[a-z][a-z0-9_]{0,31}$'
    ),
  constraint trust_case_evidence_points_check
    check (base_points > 0 and base_points <= 25),
  constraint trust_case_evidence_source_type_check
    check (
      safe_source_type = lower(safe_source_type)
      and safe_source_type ~ '^[a-z][a-z0-9_]{0,63}$'
    ),
  constraint trust_case_evidence_unique_signal
    unique (case_id, original_signal_id)
);

revoke all on table private.trust_case_evidence from public;

create index trust_case_evidence_case_idx
  on private.trust_case_evidence (case_id, observed_at, id);

create function private.validate_trust_case_evidence()
returns trigger
language plpgsql
as $$
declare
  case_record private.trust_cases%rowtype;
  signal_record private.trust_signals%rowtype;
begin
  select * into case_record
    from private.trust_cases
   where id = new.case_id;

  if case_record.id is null
     or case_record.policy_version is distinct from new.policy_version then
    raise exception 'Trust case evidence must match its case policy version'
      using errcode = '23514';
  end if;

  select * into signal_record
    from private.trust_signals
   where id = new.original_signal_id;

  if not found then
    raise exception 'Trust case evidence requires its source signal to exist when the safe summary is captured'
      using errcode = '23503';
  end if;

  if signal_record.player_id is distinct from case_record.player_id
     or signal_record.policy_version is distinct from new.policy_version
     or signal_record.signal_type is distinct from new.signal_type
     or signal_record.severity is distinct from new.severity
     or signal_record.base_points is distinct from new.base_points
     or signal_record.observed_at is distinct from new.observed_at
     or signal_record.source_type is distinct from new.safe_source_type then
    raise exception 'Trust case evidence must be a safe summary of its source signal'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trust_case_evidence_insert_guard
before insert on private.trust_case_evidence
for each row execute function private.validate_trust_case_evidence();

create table private.trust_case_decisions (
  id uuid primary key,
  case_id uuid not null
    references private.trust_cases (id) on delete cascade,
  actor_type text not null,
  actor_player_id uuid
    references public.players (id) on delete restrict,
  policy_version text not null
    references private.trust_policy_versions (policy_version) on delete restrict,
  case_version_before integer not null,
  case_version_after integer not null,
  decision_type text not null,
  previous_status text,
  resulting_status text not null,
  reason_code text not null,
  reason_note text,
  resulting_score_snapshot_id uuid,
  created_at timestamptz not null default clock_timestamp(),

  constraint trust_case_decisions_actor_check
    check (
      (actor_type = 'system' and actor_player_id is null)
      or (actor_type = 'author' and actor_player_id is not null)
    ),
  constraint trust_case_decisions_version_check
    check (
      case_version_before >= 0
      and case_version_after = case_version_before + 1
    ),
  constraint trust_case_decisions_status_check
    check (
      (case_version_before = 0 and previous_status is null)
      or (
        case_version_before > 0
        and previous_status in ('open', 'under_review', 'resolved')
      )
    ),
  constraint trust_case_decisions_result_status_check
    check (resulting_status in ('open', 'under_review', 'resolved')),
  constraint trust_case_decisions_type_check
    check (
      decision_type = lower(decision_type)
      and decision_type ~ '^[a-z][a-z0-9_]{0,63}$'
    ),
  constraint trust_case_decisions_reason_code_check
    check (
      reason_code = lower(reason_code)
      and reason_code ~ '^[a-z][a-z0-9_]{0,63}$'
    ),
  constraint trust_case_decisions_reason_note_check
    check (
      reason_note is null
      or (
        reason_note = btrim(reason_note)
        and char_length(reason_note) between 1 and 1000
        and reason_note !~ '[[:cntrl:]]'
      )
    ),
  constraint trust_case_decisions_case_version_unique
    unique (case_id, case_version_after)
);

revoke all on table private.trust_case_decisions from public;

create index trust_case_decisions_case_history_idx
  on private.trust_case_decisions (case_id, created_at, id);

create index trust_case_decisions_actor_idx
  on private.trust_case_decisions (actor_player_id, created_at desc)
  where actor_player_id is not null;

create function private.validate_trust_case_decision()
returns trigger
language plpgsql
as $$
declare
  case_record private.trust_cases%rowtype;
  previous_decision_status text;
  actor_role text;
  actor_lifecycle text;
begin
  select *
    into case_record
    from private.trust_cases
   where id = new.case_id;

  if not found then
    raise exception 'Trust case decision requires an existing case'
      using errcode = '23503';
  end if;

  if new.policy_version is distinct from case_record.policy_version then
    raise exception 'Trust case decision policy version must match its case'
      using errcode = '23514';
  end if;

  if new.case_version_before = 0 then
    if new.previous_status is not null
       or new.actor_type <> 'system'
       or new.decision_type <> 'case_opened'
       or new.resulting_status <> 'open' then
      raise exception 'Initial trust case decisions must be the system case_opened transition'
        using errcode = '23514';
    end if;
  else
    select resulting_status
      into previous_decision_status
      from private.trust_case_decisions
     where case_id = new.case_id
       and case_version_after = new.case_version_before;

    if not found
       or new.previous_status is distinct from previous_decision_status then
      raise exception 'Trust case decision previous status must match the prior audited case version'
        using errcode = '23514';
    end if;
  end if;

  if new.case_version_after is distinct from case_record.version
     or new.resulting_status is distinct from case_record.status
     or new.resulting_score_snapshot_id is distinct from case_record.latest_score_snapshot_id
     or new.created_at is distinct from case_record.updated_at then
    raise exception 'Trust case decision must describe the current committed case version, snapshot, and transition time'
      using errcode = '23514';
  end if;

  if new.actor_type = 'author' then
    select role, lifecycle_status
      into actor_role, actor_lifecycle
      from public.players
     where id = new.actor_player_id;

    if actor_role is distinct from 'author'
       or actor_lifecycle is distinct from 'active' then
      raise exception 'Trust reviewer decisions require an active Author'
        using errcode = '23514';
    end if;

    if new.actor_player_id = case_record.player_id then
      raise exception 'An Author cannot review their own trust case'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger trust_case_decisions_insert_guard
before insert on private.trust_case_decisions
for each row execute function private.validate_trust_case_decision();

create table private.trust_decision_evidence (
  decision_id uuid not null
    references private.trust_case_decisions (id) on delete cascade,
  case_evidence_id uuid not null
    references private.trust_case_evidence (id) on delete cascade,

  primary key (decision_id, case_evidence_id)
);

revoke all on table private.trust_decision_evidence from public;

create index trust_decision_evidence_case_evidence_idx
  on private.trust_decision_evidence (case_evidence_id, decision_id);

create table private.trust_signal_adjustments (
  id uuid primary key,
  case_id uuid not null
    references private.trust_cases (id) on delete cascade,
  original_signal_id uuid not null,
  decision_id uuid
    references private.trust_case_decisions (id) on delete cascade,
  appeal_id uuid,
  policy_version text not null
    references private.trust_policy_versions (policy_version) on delete restrict,
  adjustment_type text not null,
  effective_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint trust_signal_adjustments_type_check
    check (adjustment_type = 'reviewed_false_positive'),
  constraint trust_signal_adjustments_provenance_check
    check ((decision_id is not null) <> (appeal_id is not null)),
  constraint trust_signal_adjustments_unique
    unique (original_signal_id, adjustment_type)
);

revoke all on table private.trust_signal_adjustments from public;

create index trust_signal_adjustments_case_idx
  on private.trust_signal_adjustments (case_id, effective_at, id);

create index trust_signal_adjustments_decision_idx
  on private.trust_signal_adjustments (decision_id)
  where decision_id is not null;

create index trust_signal_adjustments_appeal_idx
  on private.trust_signal_adjustments (appeal_id)
  where appeal_id is not null;

create table private.trust_restrictions (
  id uuid primary key,
  case_id uuid not null
    references private.trust_cases (id) on delete cascade,
  player_id uuid not null
    references public.players (id) on delete restrict,
  decision_id uuid not null
    references private.trust_case_decisions (id) on delete cascade,
  policy_version text not null
    references private.trust_policy_versions (policy_version) on delete restrict,
  scope text not null,
  starts_at timestamptz not null,
  original_expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint trust_restrictions_scope_check
    check (scope in (
      'online_verification_required',
      'location_reward_challenge_hold',
      'new_competitive_match_hold'
    )),
  constraint trust_restrictions_duration_check
    check (
      original_expires_at > starts_at
      and original_expires_at <= starts_at + interval '7 days'
    ),
  constraint trust_restrictions_decision_scope_unique
    unique (decision_id, scope)
);

revoke all on table private.trust_restrictions from public;

create index trust_restrictions_player_scope_idx
  on private.trust_restrictions (
    player_id,
    scope,
    starts_at,
    original_expires_at
  );

create index trust_restrictions_case_idx
  on private.trust_restrictions (case_id, original_expires_at, id);

create function private.validate_trust_restriction()
returns trigger
language plpgsql
as $$
declare
  case_record private.trust_cases%rowtype;
  decision_record private.trust_case_decisions%rowtype;
begin
  perform private.assert_active_trust_player(new.player_id);

  select * into case_record
    from private.trust_cases
   where id = new.case_id;
  select * into decision_record
    from private.trust_case_decisions
   where id = new.decision_id;

  if not found then
    raise exception 'Trust restriction requires an existing reviewer decision'
      using errcode = '23503';
  end if;

  if case_record.id is null
     or decision_record.case_id is distinct from case_record.id
     or case_record.player_id is distinct from new.player_id
     or case_record.policy_version is distinct from new.policy_version
     or decision_record.policy_version is distinct from new.policy_version
     or case_record.status <> 'under_review'
     or decision_record.resulting_status <> 'under_review'
     or decision_record.actor_type <> 'author' then
    raise exception 'Trust restriction does not match its case and Author decision'
      using errcode = '23514';
  end if;

  if new.starts_at is distinct from decision_record.created_at then
    raise exception 'Trust restriction must begin at its committed reviewer decision time'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trust_restrictions_insert_guard
before insert on private.trust_restrictions
for each row execute function private.validate_trust_restriction();

create table private.trust_appeals (
  id uuid primary key,
  case_id uuid not null
    references private.trust_cases (id) on delete cascade,
  challenged_decision_id uuid not null
    references private.trust_case_decisions (id) on delete cascade,
  player_id uuid not null
    references public.players (id) on delete restrict,
  policy_version text not null
    references private.trust_policy_versions (policy_version) on delete restrict,
  submitted_at timestamptz not null,
  appeal_text text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint trust_appeals_text_check
    check (
      appeal_text = btrim(appeal_text)
      and char_length(appeal_text) between 1 and 1000
      and appeal_text !~ '[[:cntrl:]]'
    ),
  constraint trust_appeals_one_per_decision
    unique (challenged_decision_id)
);

revoke all on table private.trust_appeals from public;

create index trust_appeals_player_submitted_idx
  on private.trust_appeals (player_id, submitted_at desc, id);

create index trust_appeals_case_idx
  on private.trust_appeals (case_id, submitted_at, id);

create function private.validate_trust_appeal()
returns trigger
language plpgsql
as $$
declare
  case_record private.trust_cases%rowtype;
  decision_record private.trust_case_decisions%rowtype;
  latest_expiry timestamptz;
begin
  perform private.assert_active_trust_player(new.player_id);

  select * into case_record
    from private.trust_cases
   where id = new.case_id;
  select * into decision_record
    from private.trust_case_decisions
   where id = new.challenged_decision_id;

  select max(original_expires_at)
    into latest_expiry
    from private.trust_restrictions
   where decision_id = new.challenged_decision_id;

  if case_record.id is null
     or decision_record.id is null
     or latest_expiry is null
     or decision_record.case_id is distinct from case_record.id
     or case_record.player_id is distinct from new.player_id
     or case_record.policy_version is distinct from new.policy_version
     or decision_record.policy_version is distinct from new.policy_version then
    raise exception 'Trust appeal must challenge a restriction decision for the same player and policy'
      using errcode = '23514';
  end if;

  if new.submitted_at < decision_record.created_at
     or new.submitted_at > latest_expiry + interval '30 days' then
    raise exception 'Trust appeal is outside the restriction appeal window'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trust_appeals_insert_guard
before insert on private.trust_appeals
for each row execute function private.validate_trust_appeal();

create table private.trust_appeal_resolutions (
  appeal_id uuid primary key
    references private.trust_appeals (id) on delete cascade,
  reviewer_player_id uuid not null
    references public.players (id) on delete restrict,
  policy_version text not null
    references private.trust_policy_versions (policy_version) on delete restrict,
  outcome text not null,
  effective_expires_at timestamptz,
  resolved_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint trust_appeal_resolutions_outcome_check
    check (outcome in ('upheld', 'shortened', 'overturned')),
  constraint trust_appeal_resolutions_effective_expiry_check
    check (
      (outcome = 'upheld' and effective_expires_at is null)
      or (outcome in ('shortened', 'overturned') and effective_expires_at is not null)
    )
);

revoke all on table private.trust_appeal_resolutions from public;

create function private.validate_trust_appeal_resolution()
returns trigger
language plpgsql
as $$
declare
  appeal_record private.trust_appeals%rowtype;
  challenged_decision private.trust_case_decisions%rowtype;
  reviewer_role text;
  reviewer_lifecycle text;
  latest_expiry timestamptz;
begin
  select * into appeal_record
    from private.trust_appeals
   where id = new.appeal_id;

  if appeal_record.id is not null then
    perform private.assert_active_trust_player(appeal_record.player_id);
  end if;

  select * into challenged_decision
    from private.trust_case_decisions
   where id = appeal_record.challenged_decision_id;
  select role, lifecycle_status
    into reviewer_role, reviewer_lifecycle
    from public.players
   where id = new.reviewer_player_id;
  select max(original_expires_at)
    into latest_expiry
    from private.trust_restrictions
   where decision_id = appeal_record.challenged_decision_id;

  if appeal_record.id is null
     or challenged_decision.id is null
     or reviewer_role is distinct from 'author'
     or reviewer_lifecycle is distinct from 'active' then
    raise exception 'Trust appeal resolutions require an active Author and valid appeal'
      using errcode = '23514';
  end if;

  if new.reviewer_player_id = appeal_record.player_id
     or new.reviewer_player_id = challenged_decision.actor_player_id then
    raise exception 'Trust appeal resolution requires a different Author who is not the target player'
      using errcode = '42501';
  end if;

  if new.policy_version is distinct from appeal_record.policy_version
     or new.resolved_at < appeal_record.submitted_at then
    raise exception 'Trust appeal resolution does not match its policy or chronology'
      using errcode = '23514';
  end if;

  if new.outcome = 'shortened'
     and not (
       new.effective_expires_at > new.resolved_at
       and new.effective_expires_at < latest_expiry
     ) then
    raise exception 'Shortened trust restrictions require a future expiry earlier than the original expiry'
      using errcode = '23514';
  end if;

  if new.outcome = 'overturned'
     and new.effective_expires_at is distinct from new.resolved_at then
    raise exception 'Overturned trust restrictions end at the appeal resolution time'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trust_appeal_resolutions_insert_guard
before insert on private.trust_appeal_resolutions
for each row execute function private.validate_trust_appeal_resolution();

alter table private.trust_signal_adjustments
  add constraint trust_signal_adjustments_appeal_fk
  foreign key (appeal_id)
  references private.trust_appeal_resolutions (appeal_id)
  on delete cascade;

create function private.trust_case_history_delete_allowed(case_id_to_check uuid)
returns boolean
language plpgsql
volatile
as $$
declare
  case_record private.trust_cases%rowtype;
  cleanup_mode text;
begin
  cleanup_mode := current_setting('wits.trust_cleanup_mode', true);

  if cleanup_mode in ('retention', 'account_deletion')
     and pg_trigger_depth() > 1 then
    return true;
  end if;

  select * into case_record
    from private.trust_cases
   where id = case_id_to_check;

  if not found then
    return false;
  end if;

  if cleanup_mode = 'account_deletion' then
    return private.trust_player_is_deleting(case_record.player_id)
      and (
        case_record.status in ('open', 'under_review')
        or (
          case_record.status = 'resolved'
          and case_record.governance_finalized_at is null
        )
      );
  end if;

  if cleanup_mode = 'retention' then
    return case_record.status = 'resolved'
      and case_record.purge_after is not null
      and case_record.purge_after <= clock_timestamp();
  end if;

  return false;
end;
$$;

create function private.prevent_trust_case_history_mutation()
returns trigger
language plpgsql
as $$
declare
  case_id_to_check uuid;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Trust governance history is append-only'
      using errcode = '55006';
  end if;

  case_id_to_check := (to_jsonb(old) ->> 'case_id')::uuid;

  if private.trust_case_history_delete_allowed(case_id_to_check) then
    return old;
  end if;

  raise exception 'Trust governance history may be deleted only with its eligible case'
    using errcode = '55006';
end;
$$;

create trigger trust_case_evidence_immutability
before update or delete on private.trust_case_evidence
for each row execute function private.prevent_trust_case_history_mutation();

create trigger trust_case_decisions_immutability
before update or delete on private.trust_case_decisions
for each row execute function private.prevent_trust_case_history_mutation();

create trigger trust_signal_adjustments_immutability
before update or delete on private.trust_signal_adjustments
for each row execute function private.prevent_trust_case_history_mutation();

create trigger trust_restrictions_immutability
before update or delete on private.trust_restrictions
for each row execute function private.prevent_trust_case_history_mutation();

create trigger trust_appeals_immutability
before update or delete on private.trust_appeals
for each row execute function private.prevent_trust_case_history_mutation();

create function private.prevent_trust_decision_evidence_mutation()
returns trigger
language plpgsql
as $$
declare
  decision_case_id uuid;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Trust decision evidence links are append-only'
      using errcode = '55006';
  end if;

  if current_setting('wits.trust_cleanup_mode', true) in ('retention', 'account_deletion')
     and pg_trigger_depth() > 1 then
    return old;
  end if;

  select case_id into decision_case_id
    from private.trust_case_decisions
   where id = old.decision_id;

  if decision_case_id is not null
     and private.trust_case_history_delete_allowed(decision_case_id) then
    return old;
  end if;

  raise exception 'Trust decision evidence may be deleted only with its eligible case'
    using errcode = '55006';
end;
$$;

create trigger trust_decision_evidence_immutability
before update or delete on private.trust_decision_evidence
for each row execute function private.prevent_trust_decision_evidence_mutation();

create function private.prevent_trust_appeal_resolution_mutation()
returns trigger
language plpgsql
as $$
declare
  appeal_case_id uuid;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Trust appeal resolutions are append-only'
      using errcode = '55006';
  end if;

  if current_setting('wits.trust_cleanup_mode', true) in ('retention', 'account_deletion')
     and pg_trigger_depth() > 1 then
    return old;
  end if;

  select case_id into appeal_case_id
    from private.trust_appeals
   where id = old.appeal_id;

  if appeal_case_id is not null
     and private.trust_case_history_delete_allowed(appeal_case_id) then
    return old;
  end if;

  raise exception 'Trust appeal resolutions may be deleted only with their eligible case'
    using errcode = '55006';
end;
$$;

create trigger trust_appeal_resolutions_immutability
before update or delete on private.trust_appeal_resolutions
for each row execute function private.prevent_trust_appeal_resolution_mutation();

create function private.validate_trust_decision_evidence_link()
returns trigger
language plpgsql
as $$
declare
  decision_case_id uuid;
  evidence_case_id uuid;
begin
  select case_id into decision_case_id
    from private.trust_case_decisions
   where id = new.decision_id;
  select case_id into evidence_case_id
    from private.trust_case_evidence
   where id = new.case_evidence_id;

  if decision_case_id is null
     or evidence_case_id is null
     or decision_case_id is distinct from evidence_case_id then
    raise exception 'Trust decision evidence must belong to the same case'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trust_decision_evidence_insert_guard
before insert on private.trust_decision_evidence
for each row execute function private.validate_trust_decision_evidence_link();

create function private.validate_trust_signal_adjustment()
returns trigger
language plpgsql
as $$
declare
  provenance_case_id uuid;
  provenance_policy text;
  provenance_actor_type text;
  provenance_time timestamptz;
  evidence_count integer;
begin
  if new.decision_id is not null then
    select case_id, policy_version, actor_type, created_at
      into provenance_case_id, provenance_policy, provenance_actor_type, provenance_time
      from private.trust_case_decisions
     where id = new.decision_id;

    if provenance_actor_type is distinct from 'author' then
      raise exception 'Reviewed false-positive adjustment decisions require an Author'
        using errcode = '23514';
    end if;
  else
    select appeal.case_id, appeal.policy_version, 'author', resolution.resolved_at
      into provenance_case_id, provenance_policy, provenance_actor_type, provenance_time
      from private.trust_appeals appeal
      join private.trust_appeal_resolutions resolution
        on resolution.appeal_id = appeal.id
     where appeal.id = new.appeal_id;
  end if;

  if provenance_case_id is distinct from new.case_id
     or provenance_policy is distinct from new.policy_version then
    raise exception 'Trust signal adjustment must match its review or appeal case and policy'
      using errcode = '23514';
  end if;

  select count(*)
    into evidence_count
    from private.trust_case_evidence
   where case_id = new.case_id
     and original_signal_id = new.original_signal_id;

  if evidence_count <> 1 then
    raise exception 'Trust signal adjustment requires retained case evidence for its original signal'
      using errcode = '23514';
  end if;

  if new.effective_at is distinct from provenance_time then
    raise exception 'Reviewed false-positive adjustments become effective at the human review decision time'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trust_signal_adjustments_insert_guard
before insert on private.trust_signal_adjustments
for each row execute function private.validate_trust_signal_adjustment();

create function private.validate_trust_case(case_id_to_validate uuid)
returns void
language plpgsql
as $$
declare
  case_record private.trust_cases%rowtype;
  snapshot_record private.trust_score_snapshots%rowtype;
  decision_count integer;
begin
  select * into case_record
    from private.trust_cases
   where id = case_id_to_validate;

  if not found then
    return;
  end if;

  select * into snapshot_record
    from private.trust_score_snapshots
   where id = case_record.latest_score_snapshot_id;

  if found
     and (
       snapshot_record.player_id is distinct from case_record.player_id
       or snapshot_record.policy_version is distinct from case_record.policy_version
       or snapshot_record.final_score is distinct from case_record.current_score
       or snapshot_record.review_band is distinct from case_record.current_band
     ) then
    raise exception 'Retained trust case snapshot metadata does not match its case projection'
      using errcode = '23514';
  end if;

  if case_record.status = 'resolved'
     and exists (
       select 1
         from private.trust_restrictions restriction
         left join private.trust_appeals appeal
           on appeal.challenged_decision_id = restriction.decision_id
         left join private.trust_appeal_resolutions resolution
           on resolution.appeal_id = appeal.id
        where restriction.case_id = case_record.id
          and case
            when resolution.outcome in ('shortened', 'overturned')
              then least(
                restriction.original_expires_at,
                resolution.effective_expires_at
              )
            else restriction.original_expires_at
          end > case_record.resolved_at
     ) then
    raise exception 'A trust case cannot resolve while one of its restriction scopes remains active'
      using errcode = '23514';
  end if;

  if case_record.governance_finalized_at is not null
     and exists (
       select 1
         from (
           select restriction.decision_id, max(restriction.original_expires_at) as original_expires_at
             from private.trust_restrictions restriction
            where restriction.case_id = case_record.id
            group by restriction.decision_id
         ) restriction_decision
         left join private.trust_appeals appeal
           on appeal.challenged_decision_id = restriction_decision.decision_id
         left join private.trust_appeal_resolutions resolution
           on resolution.appeal_id = appeal.id
        where (
          appeal.id is null
          and restriction_decision.original_expires_at + interval '30 days'
            > case_record.governance_finalized_at
        ) or (
          appeal.id is not null
          and (
            resolution.appeal_id is null
            or resolution.resolved_at > case_record.governance_finalized_at
          )
        )
     ) then
    raise exception 'Trust governance cannot finalize before all restriction appeal lifecycles finish'
      using errcode = '23514';
  end if;

  select count(*)
    into decision_count
    from private.trust_case_decisions decision
   where decision.case_id = case_record.id
     and decision.case_version_after = case_record.version
     and decision.resulting_status = case_record.status
     and decision.policy_version = case_record.policy_version;

  if decision_count <> 1 then
    raise exception 'Trust case version % requires exactly one matching append-only decision',
      case_record.version
      using errcode = '23514';
  end if;
end;
$$;

create function private.validate_trust_case_after_mutation()
returns trigger
language plpgsql
as $$
begin
  perform private.validate_trust_case(
    coalesce(
      to_jsonb(new) ->> 'case_id',
      to_jsonb(new) ->> 'id'
    )::uuid
  );
  return null;
end;
$$;

create constraint trigger trust_cases_integrity
after insert or update on private.trust_cases
deferrable initially deferred
for each row execute function private.validate_trust_case_after_mutation();

create constraint trigger trust_case_decisions_integrity
after insert on private.trust_case_decisions
deferrable initially deferred
for each row execute function private.validate_trust_case_after_mutation();

create function private.purge_expired_trust_data(as_of timestamptz default clock_timestamp())
returns table (
  signal_rows_deleted integer,
  snapshot_rows_deleted integer,
  case_rows_deleted integer
)
language plpgsql
as $$
begin
  if not isfinite(as_of) then
    raise exception 'Trust retention cleanup requires a finite database time'
      using errcode = '22007';
  end if;

  if as_of > clock_timestamp() then
    raise exception 'Trust retention cleanup cannot purge future data'
      using errcode = '22023';
  end if;

  perform set_config('wits.trust_cleanup_mode', 'retention', true);

  delete from private.trust_signals
   where expires_at <= as_of;
  get diagnostics signal_rows_deleted = row_count;

  delete from private.trust_cases
   where status = 'resolved'
     and purge_after is not null
     and purge_after <= as_of;
  get diagnostics case_rows_deleted = row_count;

  delete from private.trust_score_snapshots
   where purge_after <= as_of;
  get diagnostics snapshot_rows_deleted = row_count;

  perform set_config('wits.trust_cleanup_mode', '', true);
  return next;
end;
$$;

revoke all on function private.purge_expired_trust_data(timestamptz) from public;

create function private.cleanup_trust_for_account_deletion()
returns trigger
language plpgsql
as $$
begin
  if old.lifecycle_status = 'active'
     and new.lifecycle_status = 'deletion_pending' then
    perform set_config('wits.trust_cleanup_mode', 'account_deletion', true);

    delete from private.trust_signals
     where player_id = new.id;

    delete from private.trust_cases
     where player_id = new.id
       and (
         status in ('open', 'under_review')
         or (status = 'resolved' and governance_finalized_at is null)
       );

    delete from private.trust_restrictions restriction
     where restriction.player_id = new.id
       and coalesce(
         (
           select case resolution.outcome
             when 'upheld' then restriction.original_expires_at
             else least(
               restriction.original_expires_at,
               resolution.effective_expires_at
             )
           end
             from private.trust_appeals appeal
             join private.trust_appeal_resolutions resolution
               on resolution.appeal_id = appeal.id
            where appeal.challenged_decision_id = restriction.decision_id
         ),
         restriction.original_expires_at
       ) > clock_timestamp();

    delete from private.trust_appeals appeal
     where appeal.player_id = new.id
       and not exists (
         select 1
           from private.trust_appeal_resolutions resolution
          where resolution.appeal_id = appeal.id
       );

    perform set_config('wits.trust_cleanup_mode', '', true);
  end if;

  return new;
end;
$$;

create trigger players_trust_account_deletion_cleanup
after update of lifecycle_status on public.players
for each row execute function private.cleanup_trust_for_account_deletion();

comment on table private.trust_signals is
  'Immutable privacy-limited derived trust signals. Source identifiers are opaque references and never duplicate precise evidence payloads.';

comment on table private.trust_score_snapshots is
  'Immutable policy-versioned risk score snapshots retained for 12 months from calculation; scoring is implemented by issue #258.';

comment on table private.trust_cases is
  'Versioned current trust-review case projection. Exactly one non-terminal case may exist per player.';

comment on table private.trust_case_evidence is
  'Immutable non-sensitive case evidence summaries that may outlive the originating 90-day trust signal.';

comment on table private.trust_case_decisions is
  'Append-only system and Author trust-review decisions with case-version provenance.';

comment on table private.trust_restrictions is
  'Immutable reviewer restriction scopes with original duration capped at seven days. Enforcement is implemented by issue #258.';

comment on table private.trust_appeals is
  'Immutable player appeals for restriction decisions; one appeal is permitted per challenged decision.';

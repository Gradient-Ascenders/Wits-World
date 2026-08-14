create table public.account_deletion_requests (
  id uuid primary key,
  requested_at timestamptz not null,
  completed_at timestamptz,
  status text not null,
  failure_reason text,

  constraint account_deletion_requests_status_check
    check (
      status in ('pending', 'retry_pending', 'completed')
    ),

  constraint account_deletion_requests_failure_reason_check
    check (
      failure_reason is null
      or failure_reason in (
        'auth0_deletion_failed',
        'local_cleanup_failed'
      )
    ),

  constraint account_deletion_requests_state_check
    check (
      (
        status = 'pending'
        and completed_at is null
        and failure_reason is null
      )
      or
      (
        status = 'retry_pending'
        and completed_at is null
        and failure_reason is not null
        and length(trim(failure_reason)) > 0
      )
      or
      (
        status = 'completed'
        and completed_at is not null
        and failure_reason is null
      )
    )
);

alter table public.players
  add column deletion_request_id uuid;

alter table public.players
  add constraint players_deletion_request_fk
  foreign key (deletion_request_id)
  references public.account_deletion_requests (id);

alter table public.players
  add constraint players_deletion_request_unique
  unique (deletion_request_id);

alter table public.players
  add constraint players_deletion_request_state_check
  check (
    (
      lifecycle_status = 'active'
      and deletion_request_id is null
    )
    or
    (
      lifecycle_status = 'deletion_pending'
      and deletion_request_id is not null
    )
    or
    (
      lifecycle_status = 'deleted'
      and deletion_request_id is null
    )
  );

create index account_deletion_requests_completed_at_idx
  on public.account_deletion_requests (completed_at)
  where status = 'completed';
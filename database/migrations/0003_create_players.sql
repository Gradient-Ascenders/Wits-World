create table public.players (
  id uuid primary key,
  auth_issuer text,
  auth_subject text,
  role text,
  lifecycle_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint players_role_check
    check (
      role is null
      or role in ('player', 'author')
    ),

  constraint players_lifecycle_status_check
    check (
      lifecycle_status in ('active', 'deletion_pending', 'deleted')
    ),

  constraint players_external_identity_state_check
    check (
      (
        lifecycle_status = 'deleted'
        and auth_issuer is null
        and auth_subject is null
        and role is null
      )
      or
      (
        lifecycle_status <> 'deleted'
        and auth_issuer is not null
        and auth_subject is not null
        and role is not null
      )
    ),

  constraint players_auth_identity_unique
    unique (auth_issuer, auth_subject)
);
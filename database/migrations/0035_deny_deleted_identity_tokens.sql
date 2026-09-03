create table private.deleted_identity_token_denials (
  deletion_request_id uuid primary key
    references public.account_deletion_requests (id) on delete cascade,
  identity_salt bytea not null,
  identity_digest bytea not null,
  tokens_issued_before timestamptz not null,
  expires_at timestamptz not null,

  constraint deleted_identity_token_denials_salt_length_check
    check (octet_length(identity_salt) = 32),
  constraint deleted_identity_token_denials_digest_length_check
    check (octet_length(identity_digest) = 32),
  constraint deleted_identity_token_denials_expiry_check
    check (expires_at > tokens_issued_before)
);

create index deleted_identity_token_denials_expires_at_idx
  on private.deleted_identity_token_denials (expires_at);

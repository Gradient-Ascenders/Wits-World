create table private.developer_api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_player_id uuid not null
    references public.players (id) on delete restrict,
  name text not null,
  public_id text not null,
  secret_hash bytea not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,

  constraint developer_api_keys_name_check
    check (
      name = btrim(name)
      and name <> ''
      and char_length(name) <= 80
    ),
  constraint developer_api_keys_public_id_check
    check (public_id ~ '^[a-f0-9]{16}$'),
  constraint developer_api_keys_public_id_unique unique (public_id),
  constraint developer_api_keys_secret_hash_length_check
    check (octet_length(secret_hash) = 32),
  constraint developer_api_keys_last_used_check
    check (last_used_at is null or last_used_at >= created_at),
  constraint developer_api_keys_revoked_check
    check (revoked_at is null or revoked_at >= created_at)
);

create index developer_api_keys_owner_created_idx
  on private.developer_api_keys (owner_player_id, created_at desc, id desc);

create index developer_api_keys_active_owner_idx
  on private.developer_api_keys (owner_player_id)
  where revoked_at is null;

revoke all on table private.developer_api_keys from public;

alter function private.delete_player_owned_data(uuid, uuid)
  rename to delete_player_owned_data_before_developer_api;

create function private.delete_player_owned_data(
  player_id_to_delete uuid,
  deletion_request_id_to_complete uuid
)
returns void
language plpgsql
as $$
begin
  delete from private.developer_api_keys
   where owner_player_id = player_id_to_delete;

  perform private.delete_player_owned_data_before_developer_api(
    player_id_to_delete,
    deletion_request_id_to_complete
  );
end;
$$;

revoke all on function private.delete_player_owned_data_before_developer_api(uuid, uuid)
  from public;
revoke all on function private.delete_player_owned_data(uuid, uuid)
  from public;

comment on table private.developer_api_keys is
  'Hashed developer API credentials. Raw API-key secrets are never persisted.';

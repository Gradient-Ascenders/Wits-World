-- Shared history needs an actor key, but a deleted actor must not remain an
-- authenticatable Wits World account. The anchor contains no profile or role.
create table private.player_history_actors (
  id uuid primary key
);

insert into private.player_history_actors (id)
select id from public.players;

create function private.ensure_player_history_actor()
returns trigger language plpgsql as $$
begin
  insert into private.player_history_actors (id) values (new.id)
    on conflict (id) do nothing;
  return new;
end;
$$;

-- Rewrite retained actor references before the player row is removed. The
-- original UUID is only a temporary FK anchor for active accounts. This
-- function runs inside the same deletion transaction as the owned-data purge.
create function private.rekey_deleted_player_history_actor(player_id_to_delete uuid)
returns uuid language plpgsql as $$
declare
  historical_actor_id uuid;
  dependency record;
  assignment_sql text;
  predicate_sql text;
begin
  perform 1 from public.players
   where id = player_id_to_delete
     and lifecycle_status in ('deletion_pending', 'deleted')
   for update;
  if not found then
    raise exception 'Historical actor rewrite requires a deleting player'
      using errcode = '23514';
  end if;

  historical_actor_id := gen_random_uuid();
  while historical_actor_id = player_id_to_delete
     or exists (select 1 from private.player_history_actors where id = historical_actor_id)
     or exists (select 1 from public.players where id = historical_actor_id)
  loop
    historical_actor_id := gen_random_uuid();
  end loop;
  insert into private.player_history_actors (id) values (historical_actor_id);
  perform set_config('wits.actor_rekey_original', player_id_to_delete::text, true);
  perform set_config('wits.actor_rekey_surrogate', historical_actor_id::text, true);

  for dependency in
    select constraint_record.conrelid::regclass as relation_name,
           array_agg(distinct attribute.attname order by attribute.attname) as columns
      from pg_constraint constraint_record
      join pg_attribute attribute
        on attribute.attrelid = constraint_record.conrelid
       and attribute.attnum = constraint_record.conkey[1]
     where constraint_record.contype = 'f'
       and constraint_record.confrelid = 'private.player_history_actors'::regclass
     group by constraint_record.conrelid
     order by constraint_record.conrelid::regclass::text
  loop
    select string_agg(format('%I = case when %I = $1 then $2 else %I end',
                             column_name, column_name, column_name), ', '),
           string_agg(format('%I = $1', column_name), ' or ')
      into assignment_sql, predicate_sql
      from unnest(dependency.columns) as column_name;

    execute format('update %s set %s where %s',
                   dependency.relation_name, assignment_sql, predicate_sql)
      using player_id_to_delete, historical_actor_id;
  end loop;

  delete from private.player_history_actors where id = player_id_to_delete;
  perform set_config('wits.actor_rekey_original', '', true);
  perform set_config('wits.actor_rekey_surrogate', '', true);
  return historical_actor_id;
end;
$$;
revoke all on function private.rekey_deleted_player_history_actor(uuid) from public;

-- Only the single old-to-new actor-key rewrite may bypass an ordinary
-- immutable-history UPDATE guard. Every non-actor column must be unchanged.
create function private.actor_rekey_context_active()
returns boolean language plpgsql stable as $$
declare
  old_id text := current_setting('wits.actor_rekey_original', true);
  new_id text := current_setting('wits.actor_rekey_surrogate', true);
begin
  return old_id is not null and old_id <> ''
     and new_id is not null and new_id <> '' and old_id <> new_id
     and exists (
       select 1 from public.players
        where id = old_id::uuid and lifecycle_status in ('deletion_pending', 'deleted')
     )
     and exists (
       select 1 from private.player_history_actors where id = new_id::uuid
     );
end;
$$;
revoke all on function private.actor_rekey_context_active() from public;

create function private.is_deleted_actor_rekey_update(
  relation_id oid,
  before_row jsonb,
  after_row jsonb
) returns boolean language plpgsql stable as $$
declare
  old_id text := current_setting('wits.actor_rekey_original', true);
  new_id text := current_setting('wits.actor_rekey_surrogate', true);
  expected_row jsonb := before_row;
  actor_column record;
  generated_columns text[];
begin
  if not private.actor_rekey_context_active() then
    return false;
  end if;

  select array_agg(attname) into generated_columns
    from pg_attribute
   where attrelid = relation_id and attgenerated <> '';
  before_row := before_row - coalesce(generated_columns, array[]::text[]);
  after_row := after_row - coalesce(generated_columns, array[]::text[]);
  expected_row := before_row;

  for actor_column in
    select distinct attribute.attname
      from pg_constraint constraint_record
      join pg_attribute attribute
        on attribute.attrelid = constraint_record.conrelid
       and attribute.attnum = constraint_record.conkey[1]
     where constraint_record.contype = 'f'
       and constraint_record.conrelid = relation_id
       and constraint_record.confrelid = 'private.player_history_actors'::regclass
  loop
    if before_row ->> actor_column.attname = old_id then
      expected_row := jsonb_set(expected_row, array[actor_column.attname],
                                to_jsonb(new_id));
    end if;
  end loop;
  return expected_row <> before_row and after_row = expected_row;
end;
$$;
revoke all on function private.is_deleted_actor_rekey_update(oid, jsonb, jsonb)
  from public;

create function private.validate_deleted_actor_rekey_update()
returns trigger language plpgsql as $$
begin
  if not private.is_deleted_actor_rekey_update(
    tg_relid, to_jsonb(old), to_jsonb(new)
  ) then
    raise exception 'Historical actor rewrite may change only the actor key'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_deleted_actor_rekey_update() from public;

create trigger players_ensure_history_actor
after insert on public.players
for each row execute function private.ensure_player_history_actor();

-- Only shared history, moderation records, and author content are detached.
-- Player-owned state keeps its FK to a real player; the completion transaction
-- must purge that state before the profile row can be removed.
do $$
declare
  dependency record;
begin
  for dependency in
    select constraint_record.conname,
           constraint_record.conrelid::regclass as relation_name,
           attribute.attname as column_name,
           constraint_record.condeferrable,
           constraint_record.condeferred,
           cardinality(constraint_record.conkey) as column_count
      from pg_constraint constraint_record
      join pg_attribute attribute
        on attribute.attrelid = constraint_record.conrelid
       and attribute.attnum = constraint_record.conkey[1]
     where constraint_record.contype = 'f'
       and constraint_record.confrelid = 'public.players'::regclass
       and constraint_record.conrelid <> all (array_remove(array[
         to_regclass('public.challenge_attempts'),
         to_regclass('public.event_completions'),
         to_regclass('public.player_wallets'),
         to_regclass('public.coin_ledger_entries'),
         to_regclass('public.player_cards'),
         to_regclass('public.player_starter_grants'),
         to_regclass('public.player_decks'),
         to_regclass('public.player_deck_selections'),
         to_regclass('public.cpu_matches'),
         to_regclass('public.movement_evidence'),
         to_regclass('public.player_point_awards'),
         to_regclass('public.player_activity_days'),
         to_regclass('public.player_monthly_progression'),
         to_regclass('public.player_progression_state'),
         to_regclass('public.player_achievement_unlocks'),
         to_regclass('public.card_evolution_transactions'),
         to_regclass('public.ranked_player_season_ratings'),
         to_regclass('public.ranked_season_standing_archives'),
         to_regclass('private.ranked_standings_snapshots'),
         to_regclass('private.ranked_standings_snapshot_rows'),
         to_regclass('private.developer_api_keys'),
         to_regclass('private.live_pvp_connection_tickets'),
         to_regclass('private.live_pvp_connection_access'),
         to_regclass('private.territory_owner_bonus_snapshots'),
         to_regclass('private.territory_owner_bonus_decisions'),
         to_regclass('private.trust_signals')
       ], null))
  loop
    if dependency.column_count <> 1 then
      raise exception 'Account deletion actor migration requires single-column player references: %.%',
        dependency.relation_name, dependency.conname;
    end if;

    execute format('alter table %s drop constraint %I',
      dependency.relation_name, dependency.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references private.player_history_actors (id) on delete restrict %s',
      dependency.relation_name,
      dependency.conname,
      dependency.column_name,
      case when dependency.condeferrable then
        case when dependency.condeferred then 'deferrable initially deferred'
             else 'deferrable initially immediate' end
      else 'not deferrable' end
    );
  end loop;
end;
$$;

-- Participant keys also appear in composite references from immutable match,
-- rating, and completion history. Give those child columns their own actor
-- anchor and defer the composite check until the whole rekey transaction ends.
do $$
declare
  dependency record;
begin
  for dependency in
    select constraint_record.conrelid::regclass as relation_name,
           constraint_record.conrelid as relation_id,
           constraint_record.conname,
           child_attribute.attname as child_column,
           child_attribute.attnum as child_attnum
      from pg_constraint constraint_record
      cross join lateral unnest(constraint_record.conkey,
                                constraint_record.confkey)
        as key_columns(child_attnum, parent_attnum)
      join pg_attribute child_attribute
        on child_attribute.attrelid = constraint_record.conrelid
       and child_attribute.attnum = key_columns.child_attnum
      join pg_attribute parent_attribute
        on parent_attribute.attrelid = constraint_record.confrelid
       and parent_attribute.attnum = key_columns.parent_attnum
     where constraint_record.contype = 'f'
       and constraint_record.confrelid in (
         to_regclass('public.async_pvp_match_participants'),
         to_regclass('public.live_pvp_match_participants')
       )
       and parent_attribute.attname = 'player_id'
       and constraint_record.conrelid <> 'public.player_point_awards'::regclass
  loop
    execute format('alter table %s alter constraint %I deferrable initially deferred',
                   dependency.relation_name, dependency.conname);
    if not exists (
      select 1 from pg_constraint actor_fk
       where actor_fk.contype = 'f'
         and actor_fk.conrelid = dependency.relation_id
         and actor_fk.confrelid = 'private.player_history_actors'::regclass
         and actor_fk.conkey = array[dependency.child_attnum]::smallint[]
    ) then
      execute format(
        'alter table %s add constraint %I foreign key (%I) references private.player_history_actors (id) on delete restrict',
        dependency.relation_name,
        'account_deletion_actor_' || dependency.child_column || '_fk',
        dependency.child_column
      );
    end if;
  end loop;
end;
$$;

-- A queue row is historical matchmaking evidence once a proposal resolves.
-- Its season and actor remain valid without retaining the player's rating.
alter table private.ranked_queue_entries
  drop constraint ranked_queue_entries_rating_fk;
alter table private.ranked_queue_entries
  add constraint ranked_queue_entries_season_fk foreign key (season_id)
    references public.ranked_seasons (id) on delete restrict;
alter table private.ranked_queue_entries
  add constraint ranked_queue_entries_actor_fk foreign key (player_id)
    references private.player_history_actors (id) on delete restrict;

-- A player's carried rating can reference their preceding season. Let the
-- single purge transaction remove the complete chain before FK validation.
alter table public.ranked_player_season_ratings
  drop constraint ranked_player_season_ratings_source_fk;
alter table public.ranked_player_season_ratings
  add constraint ranked_player_season_ratings_source_fk
    foreign key (carried_from_season_id, player_id)
    references public.ranked_player_season_ratings (season_id, player_id)
    on delete no action deferrable initially deferred;

-- Keep formal review and appeal evidence intact for the confirmed bounded
-- deletion-specific interval. Closed cases retain their existing policy.
create table private.trust_case_deletion_retention (
  case_id uuid primary key references private.trust_cases (id) on delete cascade,
  purge_after timestamptz not null check (isfinite(purge_after))
);
revoke all on private.trust_case_deletion_retention from public;
create index trust_case_deletion_retention_purge_idx
  on private.trust_case_deletion_retention (purge_after);

create or replace function private.prevent_trust_case_delete()
returns trigger language plpgsql as $$
declare
  cleanup_mode text;
begin
  cleanup_mode := current_setting('wits.trust_cleanup_mode', true);
  if cleanup_mode = 'account_deletion'
     and private.trust_player_is_deleting(old.player_id)
     and (old.status in ('open', 'under_review')
          or (old.status = 'resolved' and old.governance_finalized_at is null)) then
    return old;
  end if;
  if cleanup_mode = 'retention'
     and ((old.status = 'resolved' and old.purge_after is not null
           and old.purge_after <= clock_timestamp())
          or exists (
            select 1 from private.trust_case_deletion_retention retention
             where retention.case_id = old.id
               and retention.purge_after <= clock_timestamp()
          )) then
    return old;
  end if;
  raise exception 'Trust cases may be deleted only by account-deletion or retention cleanup'
    using errcode = '55006';
end;
$$;

create or replace function private.cleanup_trust_for_account_deletion()
returns trigger language plpgsql as $$
begin
  if old.lifecycle_status = 'active'
     and new.lifecycle_status = 'deletion_pending' then
    perform set_config('wits.trust_cleanup_mode', 'account_deletion', true);
    delete from private.trust_signals where player_id = new.id;
    perform set_config('wits.trust_cleanup_mode', '', true);
  end if;
  return new;
end;
$$;

create function private.schedule_deleted_trust_case_retention(
  player_id_to_delete uuid,
  completed_at timestamptz
) returns void language plpgsql as $$
begin
  if not isfinite(completed_at) then
    raise exception 'Account deletion completion requires a finite time'
      using errcode = '22007';
  end if;
  perform 1 from public.players
   where id = player_id_to_delete and lifecycle_status = 'deletion_pending'
   for update;
  if not found then
    raise exception 'Trust retention scheduling requires a pending deletion'
      using errcode = '23514';
  end if;

  insert into private.trust_case_deletion_retention (case_id, purge_after)
  select id, completed_at + interval '90 days'
    from private.trust_cases
   where player_id = player_id_to_delete and governance_finalized_at is null
  on conflict (case_id) do nothing;
end;
$$;
revoke all on function private.schedule_deleted_trust_case_retention(uuid, timestamptz)
  from public;

create or replace function private.purge_expired_trust_data(
  as_of timestamptz default clock_timestamp()
) returns table (
  signal_rows_deleted integer,
  snapshot_rows_deleted integer,
  case_rows_deleted integer
) language plpgsql as $$
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
  delete from private.trust_signals where expires_at <= as_of;
  get diagnostics signal_rows_deleted = row_count;

  delete from private.trust_cases trust_case
   where (trust_case.status = 'resolved'
          and trust_case.purge_after is not null
          and trust_case.purge_after <= as_of)
      or exists (
        select 1 from private.trust_case_deletion_retention retention
         where retention.case_id = trust_case.id
           and retention.purge_after <= as_of
      );
  get diagnostics case_rows_deleted = row_count;

  delete from private.trust_score_snapshots snapshot
   where snapshot.purge_after <= as_of
     and not exists (
       select 1 from private.trust_cases trust_case
        where trust_case.latest_score_snapshot_id = snapshot.id
     );
  get diagnostics snapshot_rows_deleted = row_count;
  perform set_config('wits.trust_cleanup_mode', '', true);
  return next;
end;
$$;
revoke all on function private.purge_expired_trust_data(timestamptz) from public;

comment on table private.player_history_actors is
  'Profile-free keys for shared history and author/moderation audit. A row is not an account and has no authentication or progression.';
revoke all on private.player_history_actors from public;

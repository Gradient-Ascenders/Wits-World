-- Persist the server-authoritative card-trading aggregate defined by issue #273.
-- This migration is additive: existing ownership, deck, match, evolution, and trust
-- records keep their current identities and historical meaning.

insert into private.trust_policy_versions (policy_version)
values ('trust-v2');

alter table private.trust_restrictions
  drop constraint trust_restrictions_scope_check;

alter table private.trust_restrictions
  add constraint trust_restrictions_scope_check
    check (scope in (
      'online_verification_required',
      'location_reward_challenge_hold',
      'new_competitive_match_hold',
      'card_trade_hold'
    )),
  add constraint trust_restrictions_trade_scope_policy_check
    check (scope <> 'card_trade_hold' or policy_version = 'trust-v2');

create table private.card_trade_policy_versions (
  policy_version text primary key,
  minimum_account_age_seconds integer not null,
  maximum_open_offers smallint not null,
  maximum_copies_per_side smallint not null,
  maximum_completed_trades_24h smallint not null,
  offer_lifetime_seconds integer not null,
  imbalance_warning_threshold smallint not null,
  minimum_creature_copies smallint not null,
  minimum_power_copies smallint not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint card_trade_policy_versions_name_check
    check (
      policy_version = lower(policy_version)
      and policy_version ~ '^[a-z][a-z0-9-]{0,63}$'
    ),
  constraint card_trade_policy_versions_limits_check
    check (
      minimum_account_age_seconds >= 0
      and maximum_open_offers between 1 and 100
      and maximum_copies_per_side between 1 and 20
      and maximum_completed_trades_24h between 1 and 100
      and offer_lifetime_seconds > 0
      and imbalance_warning_threshold >= 0
      and minimum_creature_copies >= 0
      and minimum_power_copies >= 0
    )
);

revoke all on table private.card_trade_policy_versions from public;

insert into private.card_trade_policy_versions (
  policy_version,
  minimum_account_age_seconds,
  maximum_open_offers,
  maximum_copies_per_side,
  maximum_completed_trades_24h,
  offer_lifetime_seconds,
  imbalance_warning_threshold,
  minimum_creature_copies,
  minimum_power_copies
)
values (
  'card-trade-v1',
  86400,
  5,
  5,
  5,
  86400,
  2,
  3,
  2
);

create function private.prevent_card_trade_policy_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Card trade policy versions are immutable'
    using errcode = '55006';
end;
$$;

create trigger card_trade_policy_versions_immutability
before update or delete on private.card_trade_policy_versions
for each row execute function private.prevent_card_trade_policy_mutation();

create table private.card_trades (
  id uuid primary key,
  sender_player_id uuid not null
    references public.players (id) on delete restrict,
  recipient_player_id uuid not null
    references public.players (id) on delete restrict,
  policy_version text not null
    references private.card_trade_policy_versions (policy_version) on delete restrict,
  current_version integer not null default 1,
  status text not null default 'open',
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  terminal_at timestamptz,
  terminal_reason text,

  constraint card_trades_distinct_players_check
    check (sender_player_id <> recipient_player_id),
  constraint card_trades_current_version_check
    check (current_version >= 1),
  constraint card_trades_status_check
    check (status in (
      'open',
      'completed',
      'declined',
      'cancelled',
      'expired',
      'invalidated'
    )),
  constraint card_trades_terminal_reason_check
    check (
      terminal_reason is null
      or (
        terminal_reason = lower(terminal_reason)
        and terminal_reason ~ '^[a-z][a-z0-9_]{0,63}$'
      )
    ),
  constraint card_trades_lifecycle_check
    check (
      (status = 'open' and terminal_at is null and terminal_reason is null)
      or
      (status <> 'open' and terminal_at is not null)
    ),
  constraint card_trades_timestamps_check
    check (
      isfinite(created_at)
      and isfinite(expires_at)
      and expires_at > created_at
      and (terminal_at is null or (isfinite(terminal_at) and terminal_at >= created_at))
    ),
  constraint card_trades_sender_identity_unique
    unique (id, sender_player_id),
  constraint card_trades_recipient_identity_unique
    unique (id, recipient_player_id)
);

revoke all on table private.card_trades from public;

create index card_trades_sender_status_idx
  on private.card_trades (sender_player_id, status, created_at desc, id);

create index card_trades_recipient_status_idx
  on private.card_trades (recipient_player_id, status, created_at desc, id);

create index card_trades_expiry_idx
  on private.card_trades (expires_at, id)
  where status = 'open';

create table private.card_trade_versions (
  trade_id uuid not null
    references private.card_trades (id) on delete cascade,
  version integer not null,
  created_by_player_id uuid not null
    references public.players (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),

  primary key (trade_id, version),
  constraint card_trade_versions_version_check
    check (version >= 1),
  constraint card_trade_versions_timestamps_check
    check (isfinite(created_at))
);

revoke all on table private.card_trade_versions from public;

create table private.card_trade_version_items (
  trade_id uuid not null,
  version integer not null,
  offering_player_id uuid not null
    references public.players (id) on delete restrict,
  position smallint not null,
  owned_card_id uuid not null,
  card_definition_id uuid not null
    references public.card_definitions (id) on delete restrict,
  rarity text not null,
  acquired_at timestamptz not null,
  acquisition_kind text not null,

  primary key (trade_id, version, offering_player_id, position),
  constraint card_trade_version_items_version_fk
    foreign key (trade_id, version)
    references private.card_trade_versions (trade_id, version)
    on delete cascade,
  constraint card_trade_version_items_position_check
    check (position between 1 and 5),
  constraint card_trade_version_items_rarity_check
    check (rarity in ('common', 'rare', 'epic', 'legendary')),
  constraint card_trade_version_items_acquisition_kind_check
    check (acquisition_kind in ('event_reward', 'starter', 'evolution', 'trade')),
  constraint card_trade_version_items_copy_unique
    unique (trade_id, version, owned_card_id)
);

revoke all on table private.card_trade_version_items from public;

create index card_trade_version_items_copy_idx
  on private.card_trade_version_items (owned_card_id);

create table private.card_trade_version_requests (
  trade_id uuid not null,
  version integer not null,
  requesting_player_id uuid not null
    references public.players (id) on delete restrict,
  card_definition_id uuid not null
    references public.card_definitions (id) on delete restrict,
  quantity smallint not null,

  primary key (trade_id, version, requesting_player_id, card_definition_id),
  constraint card_trade_version_requests_version_fk
    foreign key (trade_id, version)
    references private.card_trade_versions (trade_id, version)
    on delete cascade,
  constraint card_trade_version_requests_quantity_check
    check (quantity between 1 and 5)
);

revoke all on table private.card_trade_version_requests from public;

create table private.card_trade_acceptances (
  trade_id uuid not null,
  version integer not null,
  player_id uuid not null
    references public.players (id) on delete restrict,
  accepted_at timestamptz not null default clock_timestamp(),

  primary key (trade_id, version, player_id),
  constraint card_trade_acceptances_version_fk
    foreign key (trade_id, version)
    references private.card_trade_versions (trade_id, version)
    on delete cascade,
  constraint card_trade_acceptances_time_check
    check (isfinite(accepted_at))
);

revoke all on table private.card_trade_acceptances from public;

create table private.card_trade_imbalance_acknowledgements (
  trade_id uuid not null,
  version integer not null,
  player_id uuid not null
    references public.players (id) on delete restrict,
  acknowledged_at timestamptz not null default clock_timestamp(),

  primary key (trade_id, version, player_id),
  constraint card_trade_imbalance_acknowledgements_version_fk
    foreign key (trade_id, version)
    references private.card_trade_versions (trade_id, version)
    on delete cascade,
  constraint card_trade_imbalance_acknowledgements_time_check
    check (isfinite(acknowledged_at))
);

revoke all on table private.card_trade_imbalance_acknowledgements from public;

create table private.card_trade_reservations (
  owned_card_id uuid primary key,
  trade_id uuid not null,
  version integer not null,
  player_id uuid not null,
  reserved_at timestamptz not null default clock_timestamp(),

  constraint card_trade_reservations_version_fk
    foreign key (trade_id, version)
    references private.card_trade_versions (trade_id, version)
    on delete cascade,
  constraint card_trade_reservations_owned_copy_fk
    foreign key (owned_card_id, player_id)
    references public.player_cards (id, player_id)
    on delete restrict,
  constraint card_trade_reservations_time_check
    check (isfinite(reserved_at))
);

revoke all on table private.card_trade_reservations from public;

create index card_trade_reservations_trade_idx
  on private.card_trade_reservations (trade_id, version, player_id, owned_card_id);

create table private.card_trade_settlement_receipts (
  id uuid primary key,
  trade_id uuid not null unique
    references private.card_trades (id) on delete restrict,
  version integer not null,
  sender_player_id uuid not null
    references public.players (id) on delete restrict,
  recipient_player_id uuid not null
    references public.players (id) on delete restrict,
  policy_version text not null
    references private.card_trade_policy_versions (policy_version) on delete restrict,
  minimum_account_age_seconds integer not null,
  maximum_open_offers smallint not null,
  maximum_copies_per_side smallint not null,
  maximum_completed_trades_24h smallint not null,
  offer_lifetime_seconds integer not null,
  imbalance_warning_threshold smallint not null,
  minimum_creature_copies smallint not null,
  minimum_power_copies smallint not null,
  completed_at timestamptz not null,

  constraint card_trade_settlement_receipts_version_fk
    foreign key (trade_id, version)
    references private.card_trade_versions (trade_id, version)
    on delete restrict,
  constraint card_trade_settlement_receipts_distinct_players_check
    check (sender_player_id <> recipient_player_id),
  constraint card_trade_settlement_receipts_limits_check
    check (
      minimum_account_age_seconds >= 0
      and maximum_open_offers > 0
      and maximum_copies_per_side > 0
      and maximum_completed_trades_24h > 0
      and offer_lifetime_seconds > 0
      and imbalance_warning_threshold >= 0
      and minimum_creature_copies >= 0
      and minimum_power_copies >= 0
    ),
  constraint card_trade_settlement_receipts_time_check
    check (isfinite(completed_at))
);

revoke all on table private.card_trade_settlement_receipts from public;

create index card_trade_settlement_receipts_sender_completed_idx
  on private.card_trade_settlement_receipts (sender_player_id, completed_at desc, id);

create index card_trade_settlement_receipts_recipient_completed_idx
  on private.card_trade_settlement_receipts (recipient_player_id, completed_at desc, id);

create table private.card_trade_movements (
  id uuid primary key,
  receipt_id uuid not null
    references private.card_trade_settlement_receipts (id) on delete restrict,
  source_player_id uuid not null
    references public.players (id) on delete restrict,
  recipient_player_id uuid not null
    references public.players (id) on delete restrict,
  source_owned_card_id uuid not null,
  new_owned_card_id uuid not null unique,
  card_definition_id uuid not null
    references public.card_definitions (id) on delete restrict,
  source_acquired_at timestamptz not null,
  source_acquisition_kind text not null,
  source_completion_id uuid,
  source_starter_grant_id uuid,
  source_evolution_id uuid,
  source_territory_bonus_id uuid,
  source_trade_movement_id uuid,
  transferred_at timestamptz not null,

  constraint card_trade_movements_distinct_players_check
    check (source_player_id <> recipient_player_id),
  constraint card_trade_movements_source_copy_unique
    unique (receipt_id, source_owned_card_id),
  constraint card_trade_movements_acquisition_kind_check
    check (source_acquisition_kind in ('event_reward', 'starter', 'evolution', 'trade')),
  constraint card_trade_movements_source_provenance_check
    check (
      (source_acquisition_kind = 'event_reward'
        and source_completion_id is not null
        and source_starter_grant_id is null
        and source_evolution_id is null
        and source_trade_movement_id is null)
      or
      (source_acquisition_kind = 'starter'
        and source_completion_id is null
        and source_starter_grant_id is not null
        and source_evolution_id is null
        and source_territory_bonus_id is null
        and source_trade_movement_id is null)
      or
      (source_acquisition_kind = 'evolution'
        and source_completion_id is null
        and source_starter_grant_id is null
        and source_evolution_id is not null
        and source_territory_bonus_id is null
        and source_trade_movement_id is null)
      or
      (source_acquisition_kind = 'trade'
        and source_completion_id is null
        and source_starter_grant_id is null
        and source_evolution_id is null
        and source_territory_bonus_id is null
        and source_trade_movement_id is not null)
    ),
  constraint card_trade_movements_timestamps_check
    check (
      isfinite(source_acquired_at)
      and isfinite(transferred_at)
      and transferred_at >= source_acquired_at
    )
);

revoke all on table private.card_trade_movements from public;

create index card_trade_movements_receipt_idx
  on private.card_trade_movements (receipt_id, source_owned_card_id);

create index card_trade_movements_definition_idx
  on private.card_trade_movements (card_definition_id);

alter table public.player_cards
  add column source_trade_movement_id uuid;

alter table private.card_trade_movements
  add constraint card_trade_movements_identity_recipient_unique
    unique (id, recipient_player_id);

alter table public.player_cards
  add constraint player_cards_source_trade_movement_fk
    foreign key (source_trade_movement_id, player_id)
    references private.card_trade_movements (id, recipient_player_id)
    on delete restrict;

alter table public.player_cards
  drop constraint player_cards_acquisition_kind_check,
  drop constraint player_cards_source_check;

alter table public.player_cards
  add constraint player_cards_acquisition_kind_check
    check (acquisition_kind in ('event_reward', 'starter', 'evolution', 'trade')),
  add constraint player_cards_source_check
    check (
      (acquisition_kind = 'event_reward'
        and source_completion_id is not null
        and source_starter_grant_id is null
        and source_evolution_id is null
        and source_trade_movement_id is null)
      or
      (acquisition_kind = 'starter'
        and source_completion_id is null
        and source_starter_grant_id is not null
        and source_evolution_id is null
        and source_territory_bonus_id is null
        and source_trade_movement_id is null)
      or
      (acquisition_kind = 'evolution'
        and source_completion_id is null
        and source_starter_grant_id is null
        and source_evolution_id is not null
        and source_territory_bonus_id is null
        and source_trade_movement_id is null)
      or
      (acquisition_kind = 'trade'
        and source_completion_id is null
        and source_starter_grant_id is null
        and source_evolution_id is null
        and source_territory_bonus_id is null
        and source_trade_movement_id is not null)
    );

create unique index player_cards_trade_movement_unique_idx
  on public.player_cards (source_trade_movement_id)
  where acquisition_kind = 'trade';

alter table public.card_evolution_consumptions
  drop constraint card_evolution_consumptions_acquisition_kind_check;

alter table public.card_evolution_consumptions
  add constraint card_evolution_consumptions_acquisition_kind_check
    check (acquisition_kind in ('event_reward', 'starter', 'evolution', 'trade'));

create function private.validate_card_trade_version()
returns trigger
language plpgsql
as $$
declare
  trade_record private.card_trades%rowtype;
begin
  select * into trade_record
    from private.card_trades
   where id = new.trade_id;

  if not found
     or trade_record.status <> 'open'
     or trade_record.current_version <> new.version
     or new.created_by_player_id not in (
       trade_record.sender_player_id,
       trade_record.recipient_player_id
     ) then
    raise exception 'Card trade version must match the current open trade and one of its participants'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger card_trade_versions_insert_guard
before insert on private.card_trade_versions
for each row execute function private.validate_card_trade_version();

create function private.validate_card_trade_version_party()
returns trigger
language plpgsql
as $$
declare
  trade_record private.card_trades%rowtype;
  party_player_id uuid;
begin
  party_player_id := case tg_table_name
    when 'card_trade_version_items' then
      (to_jsonb(new) ->> 'offering_player_id')::uuid
    when 'card_trade_version_requests' then
      (to_jsonb(new) ->> 'requesting_player_id')::uuid
    when 'card_trade_acceptances' then
      (to_jsonb(new) ->> 'player_id')::uuid
    when 'card_trade_imbalance_acknowledgements' then
      (to_jsonb(new) ->> 'player_id')::uuid
    else null
  end;

  select * into trade_record
    from private.card_trades
   where id = new.trade_id;

  if not found
     or trade_record.status <> 'open'
     or trade_record.current_version <> new.version
     or party_player_id not in (
       trade_record.sender_player_id,
       trade_record.recipient_player_id
     ) then
    raise exception 'Card trade version record must belong to a participant on the current open version'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger card_trade_version_items_insert_guard
before insert on private.card_trade_version_items
for each row execute function private.validate_card_trade_version_party();

create trigger card_trade_version_requests_insert_guard
before insert on private.card_trade_version_requests
for each row execute function private.validate_card_trade_version_party();

create trigger card_trade_acceptances_insert_guard
before insert on private.card_trade_acceptances
for each row execute function private.validate_card_trade_version_party();

create trigger card_trade_imbalance_acknowledgements_insert_guard
before insert on private.card_trade_imbalance_acknowledgements
for each row execute function private.validate_card_trade_version_party();

create function private.validate_card_trade_reservation()
returns trigger
language plpgsql
as $$
declare
  trade_record private.card_trades%rowtype;
begin
  select * into trade_record
    from private.card_trades
   where id = new.trade_id;

  if not found
     or trade_record.status <> 'open'
     or trade_record.current_version <> new.version
     or new.player_id not in (
       trade_record.sender_player_id,
       trade_record.recipient_player_id
     ) then
    raise exception 'Card reservation must belong to the current open trade'
      using errcode = '23514';
  end if;

  perform 1
    from private.card_trade_version_items item
   where item.trade_id = new.trade_id
     and item.version = new.version
     and item.offering_player_id = new.player_id
     and item.owned_card_id = new.owned_card_id;

  if not found then
    raise exception 'Card reservation must match an exact copy offered on the current version'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger card_trade_reservations_insert_guard
before insert on private.card_trade_reservations
for each row execute function private.validate_card_trade_reservation();

create function private.prevent_card_trade_history_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('wits.card_trade_cleanup_mode', true) = 'retention' then
    return old;
  end if;

  raise exception 'Card trade version and approval history is immutable'
    using errcode = '55006';
end;
$$;

create trigger card_trade_versions_immutability
before update or delete on private.card_trade_versions
for each row execute function private.prevent_card_trade_history_mutation();

create trigger card_trade_version_items_immutability
before update or delete on private.card_trade_version_items
for each row execute function private.prevent_card_trade_history_mutation();

create trigger card_trade_version_requests_immutability
before update or delete on private.card_trade_version_requests
for each row execute function private.prevent_card_trade_history_mutation();

create trigger card_trade_acceptances_immutability
before update or delete on private.card_trade_acceptances
for each row execute function private.prevent_card_trade_history_mutation();

create trigger card_trade_imbalance_acknowledgements_immutability
before update or delete on private.card_trade_imbalance_acknowledgements
for each row execute function private.prevent_card_trade_history_mutation();

create function private.validate_card_trade_current_version_integrity()
returns trigger
language plpgsql
as $$
begin
  perform 1
    from private.card_trade_versions version_record
   where version_record.trade_id = new.id
     and version_record.version = new.current_version;

  if not found then
    raise exception 'Card trade current_version must identify an immutable persisted version'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger card_trades_current_version_integrity
after insert or update of current_version on private.card_trades
deferrable initially deferred
for each row execute function private.validate_card_trade_current_version_integrity();

create function private.protect_card_trade_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'completed'
       and old.terminal_at is not null
       and old.terminal_at <= clock_timestamp() - interval '30 days'
       and current_setting('wits.card_trade_cleanup_mode', true) = 'retention' then
      return old;
    end if;

    raise exception 'Card trade records may be deleted only by eligible retention cleanup'
      using errcode = '55006';
  end if;

  if old.status <> 'open' then
    raise exception 'Terminal card trades are immutable'
      using errcode = '55006';
  end if;

  if new.id is distinct from old.id
     or new.sender_player_id is distinct from old.sender_player_id
     or new.recipient_player_id is distinct from old.recipient_player_id
     or new.policy_version is distinct from old.policy_version
     or new.created_at is distinct from old.created_at
     or new.expires_at is distinct from old.expires_at then
    raise exception 'Card trade identity and deadline are immutable'
      using errcode = '55006';
  end if;

  if new.current_version not in (old.current_version, old.current_version + 1) then
    raise exception 'Card trade versions must advance by at most one'
      using errcode = '40001';
  end if;

  if new.current_version = old.current_version + 1 and new.status <> 'open' then
    raise exception 'A card trade cannot advance version while becoming terminal'
      using errcode = '23514';
  end if;

  if new.status = 'open' then
    if new.terminal_at is not null or new.terminal_reason is not null then
      raise exception 'Open card trades cannot have terminal metadata'
        using errcode = '23514';
    end if;
  elsif new.current_version <> old.current_version then
    raise exception 'Terminal card trades must retain their final offer version'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger card_trades_lifecycle_guard
before update or delete on private.card_trades
for each row execute function private.protect_card_trade_lifecycle();

create function private.release_terminal_card_trade_reservations()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'open' and new.status <> 'open' then
    delete from private.card_trade_reservations
     where trade_id = new.id;
  end if;
  return new;
end;
$$;

create trigger card_trades_release_terminal_reservations
after update of status on private.card_trades
for each row execute function private.release_terminal_card_trade_reservations();

create function private.validate_card_trade_settlement_receipt()
returns trigger
language plpgsql
as $$
declare
  trade_record private.card_trades%rowtype;
  policy_record private.card_trade_policy_versions%rowtype;
begin
  select * into trade_record
    from private.card_trades
   where id = new.trade_id;

  select * into policy_record
    from private.card_trade_policy_versions
   where policy_version = new.policy_version;

  if trade_record.id is null
     or trade_record.status <> 'open'
     or trade_record.current_version <> new.version
     or trade_record.sender_player_id is distinct from new.sender_player_id
     or trade_record.recipient_player_id is distinct from new.recipient_player_id
     or trade_record.policy_version is distinct from new.policy_version
     or policy_record.policy_version is null
     or policy_record.minimum_account_age_seconds is distinct from new.minimum_account_age_seconds
     or policy_record.maximum_open_offers is distinct from new.maximum_open_offers
     or policy_record.maximum_copies_per_side is distinct from new.maximum_copies_per_side
     or policy_record.maximum_completed_trades_24h is distinct from new.maximum_completed_trades_24h
     or policy_record.offer_lifetime_seconds is distinct from new.offer_lifetime_seconds
     or policy_record.imbalance_warning_threshold is distinct from new.imbalance_warning_threshold
     or policy_record.minimum_creature_copies is distinct from new.minimum_creature_copies
     or policy_record.minimum_power_copies is distinct from new.minimum_power_copies then
    raise exception 'Card trade settlement receipt must match the current open trade and immutable policy'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger card_trade_settlement_receipts_insert_guard
before insert on private.card_trade_settlement_receipts
for each row execute function private.validate_card_trade_settlement_receipt();

create function private.validate_card_trade_movement()
returns trigger
language plpgsql
as $$
declare
  receipt_record private.card_trade_settlement_receipts%rowtype;
  source_record public.player_cards%rowtype;
  item_player_id uuid;
begin
  select * into receipt_record
    from private.card_trade_settlement_receipts
   where id = new.receipt_id;

  if not found
     or new.source_player_id not in (
       receipt_record.sender_player_id,
       receipt_record.recipient_player_id
     )
     or new.recipient_player_id = new.source_player_id
     or new.recipient_player_id not in (
       receipt_record.sender_player_id,
       receipt_record.recipient_player_id
     ) then
    raise exception 'Card trade movement participants do not match the settlement receipt'
      using errcode = '23514';
  end if;

  select item.offering_player_id
    into item_player_id
    from private.card_trade_version_items item
   where item.trade_id = receipt_record.trade_id
     and item.version = receipt_record.version
     and item.owned_card_id = new.source_owned_card_id
     and item.card_definition_id = new.card_definition_id;

  if item_player_id is distinct from new.source_player_id then
    raise exception 'Card trade movement must consume an exact copy from the settled offer version'
      using errcode = '23514';
  end if;

  select * into source_record
    from public.player_cards
   where id = new.source_owned_card_id
     and player_id = new.source_player_id;

  if not found
     or source_record.card_definition_id is distinct from new.card_definition_id
     or source_record.acquired_at is distinct from new.source_acquired_at
     or source_record.acquisition_kind is distinct from new.source_acquisition_kind
     or source_record.source_completion_id is distinct from new.source_completion_id
     or source_record.source_starter_grant_id is distinct from new.source_starter_grant_id
     or source_record.source_evolution_id is distinct from new.source_evolution_id
     or source_record.source_territory_bonus_id is distinct from new.source_territory_bonus_id
     or source_record.source_trade_movement_id is distinct from new.source_trade_movement_id then
    raise exception 'Card trade movement provenance does not match the authoritative source copy'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger card_trade_movements_insert_guard
before insert on private.card_trade_movements
for each row execute function private.validate_card_trade_movement();

create function private.prevent_card_trade_settlement_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Completed card trade settlement history is immutable'
    using errcode = '55006';
end;
$$;

create trigger card_trade_settlement_receipts_immutability
before update or delete on private.card_trade_settlement_receipts
for each row execute function private.prevent_card_trade_settlement_history_mutation();

create trigger card_trade_movements_immutability
before update or delete on private.card_trade_movements
for each row execute function private.prevent_card_trade_settlement_history_mutation();

create function private.validate_card_trade_movement_integrity()
returns trigger
language plpgsql
as $$
declare
  movement_record private.card_trade_movements%rowtype;
  matching_grants integer;
begin
  select * into movement_record
    from private.card_trade_movements
   where id = new.id;

  if movement_record.id is null then
    return null;
  end if;

  select count(*)::integer
    into matching_grants
    from public.player_cards owned
   where owned.id = movement_record.new_owned_card_id
     and owned.player_id = movement_record.recipient_player_id
     and owned.card_definition_id = movement_record.card_definition_id
     and owned.source_trade_movement_id = movement_record.id
     and owned.acquisition_kind = 'trade'
     and owned.acquired_at = movement_record.transferred_at;

  if matching_grants <> 1 then
    raise exception 'Card trade movement % must grant exactly one recipient-owned copy', movement_record.id
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger card_trade_movement_grant_integrity
after insert on private.card_trade_movements
deferrable initially deferred
for each row execute function private.validate_card_trade_movement_integrity();

create function private.validate_completed_card_trade_integrity()
returns trigger
language plpgsql
as $$
declare
  receipt_record private.card_trade_settlement_receipts%rowtype;
  offered_count integer;
  movement_count integer;
  unmatched_count integer;
  reservation_count integer;
begin
  if new.status <> 'completed' then
    return null;
  end if;

  select * into receipt_record
    from private.card_trade_settlement_receipts
   where trade_id = new.id;

  if receipt_record.id is null
     or receipt_record.version <> new.current_version
     or receipt_record.sender_player_id is distinct from new.sender_player_id
     or receipt_record.recipient_player_id is distinct from new.recipient_player_id then
    raise exception 'Completed card trade must have one matching settlement receipt'
      using errcode = '23514';
  end if;

  select count(*)::integer
    into offered_count
    from private.card_trade_version_items item
   where item.trade_id = new.id
     and item.version = new.current_version;

  select count(*)::integer
    into movement_count
    from private.card_trade_movements movement
   where movement.receipt_id = receipt_record.id;

  select count(*)::integer
    into unmatched_count
    from private.card_trade_version_items item
   where item.trade_id = new.id
     and item.version = new.current_version
     and not exists (
       select 1
         from private.card_trade_movements movement
        where movement.receipt_id = receipt_record.id
          and movement.source_owned_card_id = item.owned_card_id
          and movement.source_player_id = item.offering_player_id
          and movement.card_definition_id = item.card_definition_id
     );

  select count(*)::integer
    into reservation_count
    from private.card_trade_reservations reservation
   where reservation.trade_id = new.id;

  if offered_count < 2
     or movement_count <> offered_count
     or unmatched_count <> 0
     or reservation_count <> 0 then
    raise exception 'Completed card trade must transfer every final-version copy exactly once and release reservations'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger card_trades_completion_integrity
after insert or update of status on private.card_trades
deferrable initially deferred
for each row execute function private.validate_completed_card_trade_integrity();

create function private.invalidate_card_trades_for_player(
  player_id_to_invalidate uuid,
  reason text,
  invalidated_at timestamptz default clock_timestamp()
)
returns integer
language plpgsql
as $$
declare
  affected integer;
begin
  update private.card_trades
     set status = 'invalidated',
         terminal_at = invalidated_at,
         terminal_reason = reason
   where status = 'open'
     and (
       sender_player_id = player_id_to_invalidate
       or recipient_player_id = player_id_to_invalidate
     );

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function private.invalidate_card_trades_for_player(uuid, text, timestamptz) from public;

create function private.card_trade_account_deletion_guard()
returns trigger
language plpgsql
as $$
begin
  if old.lifecycle_status = 'active'
     and new.lifecycle_status = 'deletion_pending' then
    perform private.invalidate_card_trades_for_player(
      new.id,
      'account_deletion',
      clock_timestamp()
    );
  end if;
  return new;
end;
$$;

create trigger players_card_trade_account_deletion_guard
before update of lifecycle_status on public.players
for each row execute function private.card_trade_account_deletion_guard();

create function private.card_trade_hold_guard()
returns trigger
language plpgsql
as $$
begin
  if new.scope = 'card_trade_hold'
     and new.starts_at <= clock_timestamp() then
    -- Trade mutations lock both participant rows before the trade row. Taking
    -- the same player lock here gives restriction activation the same ordering:
    -- either settlement commits first, or the hold invalidates the open trade
    -- and the waiting trade action observes it.
    perform 1
      from public.players
     where id = new.player_id
     for update;

    perform private.invalidate_card_trades_for_player(
      new.player_id,
      'card_trade_hold',
      clock_timestamp()
    );
  end if;
  return new;
end;
$$;

create trigger trust_restrictions_card_trade_hold_guard
after insert on private.trust_restrictions
for each row execute function private.card_trade_hold_guard();

create function private.expire_card_trades(as_of timestamptz default clock_timestamp())
returns integer
language plpgsql
as $$
declare
  affected integer;
begin
  if as_of > clock_timestamp() + interval '1 minute' then
    raise exception 'Card trade expiry cannot run against a future time'
      using errcode = '22023';
  end if;

  update private.card_trades
     set status = 'expired',
         terminal_at = as_of,
         terminal_reason = 'deadline_elapsed'
   where status = 'open'
     and expires_at <= as_of;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function private.expire_card_trades(timestamptz) from public;

create function private.purge_terminal_card_trades(as_of timestamptz default clock_timestamp())
returns integer
language plpgsql
as $$
declare
  affected integer;
begin
  if as_of > clock_timestamp() + interval '1 minute' then
    raise exception 'Card trade retention cleanup cannot purge future data'
      using errcode = '22023';
  end if;

  perform set_config('wits.card_trade_cleanup_mode', 'retention', true);

  delete from private.card_trades
   where status in ('declined', 'cancelled', 'expired', 'invalidated')
     and terminal_at <= as_of - interval '30 days';

  get diagnostics affected = row_count;
  perform set_config('wits.card_trade_cleanup_mode', '', true);
  return affected;
end;
$$;

revoke all on function private.purge_terminal_card_trades(timestamptz) from public;

comment on table private.card_trades is
  'Server-authoritative bilateral trade aggregate. The original deadline never extends; terminal rows are immutable until non-completed retention cleanup.';

comment on table private.card_trade_versions is
  'Immutable negotiated offer versions. A version change makes previous approvals unusable without deleting their audit history.';

comment on table private.card_trade_reservations is
  'Current exact-copy reservations. owned_card_id is globally unique so conflicting active trades cannot reserve the same copy.';

comment on table private.card_trade_settlement_receipts is
  'Immutable exactly-once settlement receipt with a snapshot of the effective card-trade policy limits.';

comment on table private.card_trade_movements is
  'Immutable provenance snapshots mapping each consumed source copy to the new recipient-owned copy created by settlement.';

comment on column public.player_cards.source_trade_movement_id is
  'The immutable settlement movement that granted this owned copy through a card trade.';

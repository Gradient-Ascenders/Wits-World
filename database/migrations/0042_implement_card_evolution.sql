alter table public.card_definitions
  add constraint card_definitions_evolution_identity_unique
    unique (id, evolves_from_definition_id);

create unique index card_definitions_evolution_source_unique_idx
  on public.card_definitions (evolves_from_definition_id)
  where evolves_from_definition_id is not null;

create table public.card_evolution_transactions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null
    references public.players (id) on delete restrict,
  submission_id uuid not null,
  source_definition_id uuid not null
    references public.card_definitions (id) on delete restrict,
  target_definition_id uuid not null,
  copies_consumed smallint not null default 3,
  completed_at timestamptz not null default now(),

  constraint card_evolution_transactions_identity_unique
    unique (id, player_id),
  constraint card_evolution_transactions_source_identity_unique
    unique (id, player_id, source_definition_id),
  constraint card_evolution_transactions_submission_unique
    unique (player_id, submission_id),
  constraint card_evolution_transactions_copy_count_check
    check (copies_consumed = 3),
  constraint card_evolution_transactions_relationship_fk
    foreign key (target_definition_id, source_definition_id)
    references public.card_definitions (id, evolves_from_definition_id)
    on delete restrict
);

create index card_evolution_transactions_player_completed_idx
  on public.card_evolution_transactions (player_id, completed_at desc, id);

create table public.card_evolution_consumptions (
  evolution_id uuid not null,
  player_id uuid not null,
  source_definition_id uuid not null,
  owned_card_id uuid not null,
  acquired_at timestamptz not null,
  acquisition_kind text not null,

  constraint card_evolution_consumptions_primary_key
    primary key (evolution_id, owned_card_id),
  constraint card_evolution_consumptions_owned_copy_unique
    unique (owned_card_id),
  constraint card_evolution_consumptions_transaction_fk
    foreign key (evolution_id, player_id, source_definition_id)
    references public.card_evolution_transactions (
      id,
      player_id,
      source_definition_id
    )
    on delete restrict,
  constraint card_evolution_consumptions_acquisition_kind_check
    check (acquisition_kind in ('event_reward', 'starter', 'evolution'))
);

alter table public.player_cards
  add column source_evolution_id uuid;

alter table public.player_cards
  add constraint player_cards_source_evolution_fk
    foreign key (source_evolution_id, player_id)
    references public.card_evolution_transactions (id, player_id)
    on delete restrict;

alter table public.player_cards
  drop constraint player_cards_acquisition_kind_check,
  drop constraint player_cards_source_check;

alter table public.player_cards
  add constraint player_cards_acquisition_kind_check
    check (acquisition_kind in ('event_reward', 'starter', 'evolution')),
  add constraint player_cards_source_check
    check (
      (acquisition_kind = 'event_reward'
        and source_completion_id is not null
        and source_starter_grant_id is null
        and source_evolution_id is null)
      or
      (acquisition_kind = 'starter'
        and source_completion_id is null
        and source_starter_grant_id is not null
        and source_evolution_id is null)
      or
      (acquisition_kind = 'evolution'
        and source_completion_id is null
        and source_starter_grant_id is null
        and source_evolution_id is not null)
    );

create unique index player_cards_evolution_grant_unique_idx
  on public.player_cards (source_evolution_id)
  where acquisition_kind = 'evolution';

create function public.validate_card_evolution_consumption_source()
returns trigger
language plpgsql
as $$
begin
  perform 1
    from public.player_cards owned
   where owned.id = new.owned_card_id
     and owned.player_id = new.player_id
     and owned.card_definition_id = new.source_definition_id
     and owned.acquired_at = new.acquired_at
     and owned.acquisition_kind = new.acquisition_kind;

  if not found then
    raise exception
      'Card evolution consumption must snapshot a currently owned source copy'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger card_evolution_consumption_source_integrity
before insert on public.card_evolution_consumptions
for each row execute function public.validate_card_evolution_consumption_source();

create function public.validate_card_evolution_integrity()
returns trigger
language plpgsql
as $$
declare
  evolution_id_to_validate uuid;
  persisted_count integer;
  persisted_grant_count integer;
begin
  if tg_table_name = 'card_evolution_transactions' then
    evolution_id_to_validate := new.id;
  else
    evolution_id_to_validate := coalesce(new.evolution_id, old.evolution_id);
  end if;

  select count(*)::integer
    into persisted_count
    from public.card_evolution_consumptions
   where evolution_id = evolution_id_to_validate;

  if persisted_count <> 3 then
    raise exception
      'Card evolution % must consume exactly three owned copies',
      evolution_id_to_validate
      using errcode = '23514';
  end if;

  select count(*)::integer
    into persisted_grant_count
    from public.player_cards owned
    join public.card_evolution_transactions evolution
      on evolution.id = owned.source_evolution_id
     and evolution.player_id = owned.player_id
     and evolution.target_definition_id = owned.card_definition_id
   where evolution.id = evolution_id_to_validate;

  if persisted_grant_count <> 1 then
    raise exception
      'Card evolution % must grant exactly one authored target copy',
      evolution_id_to_validate
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger card_evolution_transaction_consumption_integrity
after insert on public.card_evolution_transactions
deferrable initially deferred
for each row execute function public.validate_card_evolution_integrity();

create constraint trigger card_evolution_consumption_integrity
after insert or update or delete on public.card_evolution_consumptions
deferrable initially deferred
for each row execute function public.validate_card_evolution_integrity();

create function public.prevent_card_evolution_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Card evolution history is immutable'
    using errcode = '55006';
end;
$$;

create trigger card_evolution_transactions_immutability
before update or delete on public.card_evolution_transactions
for each row execute function public.prevent_card_evolution_history_mutation();

create trigger card_evolution_consumptions_immutability
before update or delete on public.card_evolution_consumptions
for each row execute function public.prevent_card_evolution_history_mutation();

comment on table public.card_evolution_transactions is
  'Immutable, idempotent server-authoritative card evolution outcomes.';

comment on table public.card_evolution_consumptions is
  'Immutable snapshots of the three owned copies consumed by an evolution.';

comment on column public.player_cards.source_evolution_id is
  'The immutable evolution transaction that granted this owned card copy.';

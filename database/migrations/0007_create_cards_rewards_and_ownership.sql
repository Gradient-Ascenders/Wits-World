create table public.card_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  affinity text not null,
  rarity text not null,
  description text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint card_definitions_name_not_blank
    check (btrim(name) <> ''),
  constraint card_definitions_category_check
    check (category in ('creature', 'power')),
  constraint card_definitions_affinity_check
    check (affinity in ('wit', 'grit', 'spark', 'spirit', 'mystic')),
  constraint card_definitions_rarity_check
    check (rarity in ('common', 'rare', 'epic', 'legendary')),
  constraint card_definitions_description_not_blank
    check (description is null or btrim(description) <> ''),
  constraint card_definitions_image_url_not_blank
    check (image_url is null or btrim(image_url) <> ''),
  constraint card_definitions_timestamps_valid
    check (updated_at >= created_at)
);

create index card_definitions_catalogue_idx
  on public.card_definitions (is_active, category, affinity, rarity);

create table public.event_completions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null,
  player_id uuid not null
    references public.players (id) on delete restrict,
  event_id uuid not null
    references public.events (id) on delete restrict,
  score_correct smallint not null,
  average_difficulty numeric(3, 2) not null,
  coins_awarded integer not null default 0,
  reward_policy_version text not null,
  completed_at timestamptz not null default now(),

  constraint event_completions_attempt_fk
    foreign key (attempt_id, player_id, event_id)
    references public.challenge_attempts (id, player_id, event_id)
    on delete restrict,
  constraint event_completions_player_identity_unique
    unique (id, player_id),
  constraint event_completions_attempt_unique
    unique (attempt_id),
  constraint event_completions_player_event_unique
    unique (player_id, event_id),
  constraint event_completions_score_check
    check (score_correct between 0 and 5),
  constraint event_completions_difficulty_check
    check (average_difficulty between 1 and 3),
  constraint event_completions_coins_check
    check (coins_awarded >= 0),
  constraint event_completions_policy_version_not_blank
    check (btrim(reward_policy_version) <> '')
);

create index event_completions_player_completed_idx
  on public.event_completions (player_id, completed_at desc);

create table public.player_wallets (
  player_id uuid primary key
    references public.players (id) on delete restrict,
  coin_balance integer not null default 0,
  updated_at timestamptz not null default now(),

  constraint player_wallets_balance_nonnegative
    check (coin_balance >= 0)
);

create table public.coin_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null
    references public.players (id) on delete restrict,
  amount integer not null,
  reason text not null,
  completion_id uuid,
  created_at timestamptz not null default now(),

  constraint coin_ledger_entries_completion_fk
    foreign key (completion_id, player_id)
    references public.event_completions (id, player_id)
    on delete restrict,
  constraint coin_ledger_entries_amount_nonzero
    check (amount <> 0),
  constraint coin_ledger_entries_reason_check
    check (reason in ('event_reward', 'starter_grant', 'manual_adjustment')),
  constraint coin_ledger_entries_completion_reason_check
    check (
      (reason = 'event_reward' and completion_id is not null)
      or
      (reason <> 'event_reward' and completion_id is null)
    )
);

create unique index coin_ledger_entries_completion_unique_idx
  on public.coin_ledger_entries (completion_id)
  where completion_id is not null;

create index coin_ledger_entries_player_created_idx
  on public.coin_ledger_entries (player_id, created_at desc);

create table public.player_cards (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null
    references public.players (id) on delete restrict,
  card_definition_id uuid not null
    references public.card_definitions (id) on delete restrict,
  source_completion_id uuid,
  acquisition_kind text not null,
  acquired_at timestamptz not null default now(),

  constraint player_cards_source_completion_fk
    foreign key (source_completion_id, player_id)
    references public.event_completions (id, player_id)
    on delete restrict,
  constraint player_cards_acquisition_kind_check
    check (acquisition_kind in ('event_reward', 'starter')),
  constraint player_cards_source_check
    check (
      (acquisition_kind = 'event_reward' and source_completion_id is not null)
      or
      (acquisition_kind = 'starter' and source_completion_id is null)
    )
);

create index player_cards_player_acquired_idx
  on public.player_cards (player_id, acquired_at desc);

create index player_cards_definition_idx
  on public.player_cards (card_definition_id);

create function public.validate_event_completion()
returns trigger
language plpgsql
as $$
declare
  attempt_status text;
  attempt_score smallint;
  attempt_average_difficulty numeric(3, 2);
begin
  select status, score_correct, average_difficulty
    into attempt_status, attempt_score, attempt_average_difficulty
    from public.challenge_attempts
   where id = new.attempt_id;

  if attempt_status is distinct from 'completed'
     or attempt_score is distinct from new.score_correct
     or attempt_average_difficulty is distinct from new.average_difficulty then
    raise exception
      'Completion % does not match the completed attempt',
      new.id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create function public.validate_completed_attempt()
returns trigger
language plpgsql
as $$
declare
  completion_count integer;
begin
  if new.status <> 'completed' then
    return new;
  end if;

  select count(*)
    into completion_count
    from public.event_completions
   where attempt_id = new.id;

  if completion_count <> 1 then
    raise exception
      'Completed attempt % must have exactly one completion record',
      new.id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create constraint trigger event_completion_integrity
after insert or update on public.event_completions
deferrable initially deferred
for each row execute function public.validate_event_completion();

create constraint trigger completed_attempt_integrity
after update of status, completed_at, completion_reason, score_correct
on public.challenge_attempts
deferrable initially deferred
for each row execute function public.validate_completed_attempt();

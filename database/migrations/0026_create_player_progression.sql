create table public.progression_point_rules (
  rule_code text not null,
  version integer not null,
  source_kind text not null,
  outcome_key text not null,
  points integer not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),

  constraint progression_point_rules_primary_key
    primary key (rule_code, version),
  constraint progression_point_rules_code_check
    check (rule_code ~ '^[a-z][a-z0-9_]*$'),
  constraint progression_point_rules_version_check
    check (version > 0),
  constraint progression_point_rules_source_kind_check
    check (source_kind in ('challenge_completion', 'cpu_match')),
  constraint progression_point_rules_outcome_key_check
    check (outcome_key ~ '^[a-z][a-z0-9_]*$'),
  constraint progression_point_rules_points_check
    check (points >= 0)
);

create unique index progression_point_rules_active_outcome_idx
  on public.progression_point_rules (source_kind, outcome_key)
  where is_active = true;

insert into public.progression_point_rules (
  rule_code,
  version,
  source_kind,
  outcome_key,
  points,
  is_active
) values
  ('challenge_score_0', 1, 'challenge_completion', 'score_0', 0, true),
  ('challenge_score_1', 1, 'challenge_completion', 'score_1', 10, true),
  ('challenge_score_2', 1, 'challenge_completion', 'score_2', 20, true),
  ('challenge_score_3', 1, 'challenge_completion', 'score_3', 30, true),
  ('challenge_score_4', 1, 'challenge_completion', 'score_4', 40, true),
  ('challenge_score_5', 1, 'challenge_completion', 'score_5', 50, true),
  ('cpu_match_win', 1, 'cpu_match', 'win', 25, true),
  ('cpu_match_loss', 1, 'cpu_match', 'loss', 0, true);

create function public.prevent_progression_point_rule_rewrite()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     or new.rule_code is distinct from old.rule_code
     or new.version is distinct from old.version
     or new.source_kind is distinct from old.source_kind
     or new.outcome_key is distinct from old.outcome_key
     or new.points is distinct from old.points
     or new.created_at is distinct from old.created_at then
    raise exception
      'Progression point rule %.% is versioned and cannot be rewritten',
      old.rule_code,
      old.version
      using errcode = '55006';
  end if;

  return new;
end;
$$;

create trigger progression_point_rules_version_guard
before update or delete on public.progression_point_rules
for each row
execute function public.prevent_progression_point_rule_rewrite();

alter table public.cpu_matches
  add constraint cpu_matches_player_identity_unique
  unique (id, player_id);

create table public.player_point_awards (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null
    references public.players (id) on delete restrict,
  rule_code text not null,
  rule_version integer not null,
  event_completion_id uuid,
  cpu_match_id uuid,
  points_awarded integer not null,
  occurred_at timestamptz not null,
  activity_day date not null,
  activity_month date not null,
  created_at timestamptz not null default now(),

  constraint player_point_awards_player_identity_unique
    unique (id, player_id),
  constraint player_point_awards_rule_fk
    foreign key (rule_code, rule_version)
    references public.progression_point_rules (rule_code, version)
    on delete restrict,
  constraint player_point_awards_event_completion_fk
    foreign key (event_completion_id, player_id)
    references public.event_completions (id, player_id)
    on delete restrict,
  constraint player_point_awards_cpu_match_fk
    foreign key (cpu_match_id, player_id)
    references public.cpu_matches (id, player_id)
    on delete restrict,
  constraint player_point_awards_one_source_check
    check (num_nonnulls(event_completion_id, cpu_match_id) = 1),
  constraint player_point_awards_points_check
    check (points_awarded >= 0),
  constraint player_point_awards_activity_day_check
    check (
      activity_day = (occurred_at at time zone 'Africa/Johannesburg')::date
    ),
  constraint player_point_awards_activity_month_check
    check (
      activity_month = date_trunc('month', activity_day)::date
    )
);

create unique index player_point_awards_event_completion_unique_idx
  on public.player_point_awards (event_completion_id)
  where event_completion_id is not null;

create unique index player_point_awards_cpu_match_unique_idx
  on public.player_point_awards (cpu_match_id)
  where cpu_match_id is not null;

create index player_point_awards_player_occurred_idx
  on public.player_point_awards (player_id, occurred_at, id);

create index player_point_awards_month_player_idx
  on public.player_point_awards (activity_month, player_id);

create function public.validate_player_point_award()
returns trigger
language plpgsql
as $$
declare
  expected_player_id uuid;
  expected_source_kind text;
  expected_outcome_key text;
  expected_points integer;
  expected_occurred_at timestamptz;
  source_status text;
begin
  if new.event_completion_id is not null then
    select
      completion.player_id,
      'challenge_completion',
      'score_' || completion.score_correct::text,
      completion.completed_at
      into
        expected_player_id,
        expected_source_kind,
        expected_outcome_key,
        expected_occurred_at
      from public.event_completions completion
     where completion.id = new.event_completion_id;
  else
    select
      match.player_id,
      'cpu_match',
      case match.winner when 'player' then 'win' else 'loss' end,
      match.completed_at,
      match.status
      into
        expected_player_id,
        expected_source_kind,
        expected_outcome_key,
        expected_occurred_at,
        source_status
      from public.cpu_matches match
     where match.id = new.cpu_match_id;

    if source_status is distinct from 'completed'
       or expected_occurred_at is null then
      raise exception
        'CPU match % is not a completed progression source',
        new.cpu_match_id
        using errcode = '23514';
    end if;
  end if;

  if expected_player_id is null then
    raise exception
      'Progression award source does not exist'
      using errcode = '23503';
  end if;

  select rule.points
    into expected_points
    from public.progression_point_rules rule
   where rule.rule_code = new.rule_code
     and rule.version = new.rule_version
     and rule.source_kind = expected_source_kind
     and rule.outcome_key = expected_outcome_key;

  if expected_points is null
     or new.player_id is distinct from expected_player_id
     or new.points_awarded is distinct from expected_points
     or new.occurred_at is distinct from expected_occurred_at then
    raise exception
      'Progression award does not match its authoritative source and rule'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger player_point_awards_authority_guard
before insert on public.player_point_awards
for each row
execute function public.validate_player_point_award();

create function public.prevent_player_point_award_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Player point award % is immutable',
    old.id
    using errcode = '55006';
end;
$$;

create trigger player_point_awards_immutability
before update or delete on public.player_point_awards
for each row
execute function public.prevent_player_point_award_mutation();

create table public.player_activity_days (
  player_id uuid not null
    references public.players (id) on delete restrict,
  activity_day date not null,
  completed_activity_count integer not null,
  first_award_id uuid not null,
  last_award_id uuid not null,
  first_activity_at timestamptz not null,
  last_activity_at timestamptz not null,

  constraint player_activity_days_primary_key
    primary key (player_id, activity_day),
  constraint player_activity_days_first_award_fk
    foreign key (first_award_id, player_id)
    references public.player_point_awards (id, player_id)
    on delete restrict,
  constraint player_activity_days_last_award_fk
    foreign key (last_award_id, player_id)
    references public.player_point_awards (id, player_id)
    on delete restrict,
  constraint player_activity_days_count_check
    check (completed_activity_count > 0),
  constraint player_activity_days_timestamps_check
    check (last_activity_at >= first_activity_at)
);

create index player_activity_days_player_recent_idx
  on public.player_activity_days (player_id, activity_day desc);

create table public.player_progression_state (
  player_id uuid primary key
    references public.players (id) on delete restrict,
  total_points integer not null default 0,
  streak_at_last_activity integer not null default 0,
  longest_streak integer not null default 0,
  last_activity_day date,
  updated_at timestamptz not null default now(),

  constraint player_progression_state_points_check
    check (total_points >= 0),
  constraint player_progression_state_streak_check
    check (
      streak_at_last_activity >= 0
      and longest_streak >= streak_at_last_activity
    ),
  constraint player_progression_state_activity_check
    check (
      (last_activity_day is null and streak_at_last_activity = 0)
      or
      (last_activity_day is not null and streak_at_last_activity > 0)
    )
);

create index player_progression_state_standings_idx
  on public.player_progression_state (total_points desc, player_id);

create table public.player_monthly_progression (
  player_id uuid not null
    references public.players (id) on delete restrict,
  month_start date not null,
  total_points integer not null default 0,
  completed_activity_count integer not null default 0,
  updated_at timestamptz not null default now(),

  constraint player_monthly_progression_primary_key
    primary key (player_id, month_start),
  constraint player_monthly_progression_month_check
    check (month_start = date_trunc('month', month_start)::date),
  constraint player_monthly_progression_points_check
    check (total_points >= 0),
  constraint player_monthly_progression_activity_check
    check (completed_activity_count > 0)
);

create index player_monthly_progression_standings_idx
  on public.player_monthly_progression (
    month_start,
    total_points desc,
    player_id
  );

create table public.achievement_definitions (
  code text primary key,
  title text not null,
  description text not null,
  metric text not null,
  threshold integer not null,
  display_order smallint not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint achievement_definitions_code_check
    check (code ~ '^[a-z][a-z0-9_]*$'),
  constraint achievement_definitions_title_check
    check (btrim(title) <> ''),
  constraint achievement_definitions_description_check
    check (btrim(description) <> ''),
  constraint achievement_definitions_metric_check
    check (
      metric in (
        'challenge_completions',
        'perfect_challenges',
        'cpu_wins',
        'cpu_matches',
        'longest_streak'
      )
    ),
  constraint achievement_definitions_threshold_check
    check (threshold > 0),
  constraint achievement_definitions_display_order_check
    check (display_order > 0),
  constraint achievement_definitions_display_order_unique
    unique (display_order),
  constraint achievement_definitions_timestamps_check
    check (updated_at >= created_at)
);

insert into public.achievement_definitions (
  code,
  title,
  description,
  metric,
  threshold,
  display_order
) values
  (
    'first_quiz',
    'First Quiz',
    'Complete your first event quiz.',
    'challenge_completions',
    1,
    1
  ),
  (
    'perfect_quiz',
    'Perfect Quiz',
    'Answer all five questions correctly in one event quiz.',
    'perfect_challenges',
    1,
    2
  ),
  (
    'five_quizzes',
    'Campus Explorer',
    'Complete five event quizzes.',
    'challenge_completions',
    5,
    3
  ),
  (
    'first_cpu_win',
    'First Victory',
    'Win your first match against the computer.',
    'cpu_wins',
    1,
    4
  ),
  (
    'five_cpu_matches',
    'Battle Tested',
    'Complete five matches against the computer.',
    'cpu_matches',
    5,
    5
  ),
  (
    'three_day_streak',
    'On a Roll',
    'Stay active for three consecutive Johannesburg calendar days.',
    'longest_streak',
    3,
    6
  );

create table public.player_achievement_unlocks (
  player_id uuid not null
    references public.players (id) on delete restrict,
  achievement_code text not null
    references public.achievement_definitions (code) on delete restrict,
  source_award_id uuid not null,
  unlocked_at timestamptz not null,

  constraint player_achievement_unlocks_primary_key
    primary key (player_id, achievement_code),
  constraint player_achievement_unlocks_source_award_fk
    foreign key (source_award_id, player_id)
    references public.player_point_awards (id, player_id)
    on delete restrict
);

create index player_achievement_unlocks_player_recent_idx
  on public.player_achievement_unlocks (player_id, unlocked_at, achievement_code);

create function public.prevent_player_achievement_unlock_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Player achievement unlock %.% is immutable',
    old.player_id,
    old.achievement_code
    using errcode = '55006';
end;
$$;

create trigger player_achievement_unlocks_immutability
before update or delete on public.player_achievement_unlocks
for each row
execute function public.prevent_player_achievement_unlock_mutation();

create function private.record_progression_award(
  player_id_to_award uuid,
  rule_code_to_apply text,
  event_completion_id_to_record uuid,
  cpu_match_id_to_record uuid,
  occurred_at_to_record timestamptz
)
returns table (
  award_id uuid,
  points_awarded integer,
  rule_code text,
  rule_version integer,
  was_created boolean
)
language plpgsql
as $$
declare
  active_rule record;
  activity_day_to_record date;
  activity_month_to_record date;
  existing_award record;
  inserted_award_id uuid;
  longest_streak_value integer;
  streak_at_last_activity_value integer;
  last_activity_day_value date;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(player_id_to_award::text, 171)
  );

  select
    award.id,
    award.points_awarded,
    award.rule_code,
    award.rule_version
    into existing_award
    from public.player_point_awards award
   where (
       event_completion_id_to_record is not null
       and award.event_completion_id = event_completion_id_to_record
     )
      or (
       cpu_match_id_to_record is not null
       and award.cpu_match_id = cpu_match_id_to_record
     );

  if found then
    return query
      select
        existing_award.id,
        existing_award.points_awarded,
        existing_award.rule_code,
        existing_award.rule_version,
        false;
    return;
  end if;

  select rule.*
    into active_rule
    from public.progression_point_rules rule
   where rule.rule_code = rule_code_to_apply
     and rule.is_active = true;

  if not found then
    raise exception
      'No active progression rule exists for %',
      rule_code_to_apply
      using errcode = '23514';
  end if;

  activity_day_to_record :=
    (occurred_at_to_record at time zone 'Africa/Johannesburg')::date;
  activity_month_to_record :=
    date_trunc('month', activity_day_to_record)::date;

  insert into public.player_point_awards (
    player_id,
    rule_code,
    rule_version,
    event_completion_id,
    cpu_match_id,
    points_awarded,
    occurred_at,
    activity_day,
    activity_month
  ) values (
    player_id_to_award,
    active_rule.rule_code,
    active_rule.version,
    event_completion_id_to_record,
    cpu_match_id_to_record,
    active_rule.points,
    occurred_at_to_record,
    activity_day_to_record,
    activity_month_to_record
  )
  returning id into inserted_award_id;

  insert into public.player_activity_days (
    player_id,
    activity_day,
    completed_activity_count,
    first_award_id,
    last_award_id,
    first_activity_at,
    last_activity_at
  ) values (
    player_id_to_award,
    activity_day_to_record,
    1,
    inserted_award_id,
    inserted_award_id,
    occurred_at_to_record,
    occurred_at_to_record
  )
  on conflict (player_id, activity_day)
  do update set
    completed_activity_count =
      public.player_activity_days.completed_activity_count + 1,
    first_award_id = case
      when excluded.first_activity_at < public.player_activity_days.first_activity_at
        then excluded.first_award_id
      else public.player_activity_days.first_award_id
    end,
    last_award_id = case
      when excluded.last_activity_at >= public.player_activity_days.last_activity_at
        then excluded.last_award_id
      else public.player_activity_days.last_award_id
    end,
    first_activity_at = least(
      public.player_activity_days.first_activity_at,
      excluded.first_activity_at
    ),
    last_activity_at = greatest(
      public.player_activity_days.last_activity_at,
      excluded.last_activity_at
    );

  insert into public.player_monthly_progression (
    player_id,
    month_start,
    total_points,
    completed_activity_count
  ) values (
    player_id_to_award,
    activity_month_to_record,
    active_rule.points,
    1
  )
  on conflict (player_id, month_start)
  do update set
    total_points =
      public.player_monthly_progression.total_points + excluded.total_points,
    completed_activity_count =
      public.player_monthly_progression.completed_activity_count + 1,
    updated_at = now();

  with ordered_days as (
    select
      activity.activity_day,
      activity.activity_day
        - row_number() over (order by activity.activity_day)::integer
        as streak_group
    from public.player_activity_days activity
    where activity.player_id = player_id_to_award
  ),
  streaks as (
    select
      count(*)::integer as streak_length,
      max(ordered.activity_day) as streak_end
    from ordered_days ordered
    group by ordered.streak_group
  ),
  latest_day as (
    select max(activity.activity_day) as activity_day
    from public.player_activity_days activity
    where activity.player_id = player_id_to_award
  )
  select
    coalesce(max(streak.streak_length), 0),
    coalesce(
      max(streak.streak_length)
        filter (where streak.streak_end = latest.activity_day),
      0
    ),
    latest.activity_day
    into
      longest_streak_value,
      streak_at_last_activity_value,
      last_activity_day_value
  from streaks streak
  cross join latest_day latest
  group by latest.activity_day;

  insert into public.player_progression_state (
    player_id,
    total_points,
    streak_at_last_activity,
    longest_streak,
    last_activity_day
  ) values (
    player_id_to_award,
    active_rule.points,
    streak_at_last_activity_value,
    longest_streak_value,
    last_activity_day_value
  )
  on conflict (player_id)
  do update set
    total_points =
      public.player_progression_state.total_points + excluded.total_points,
    streak_at_last_activity = excluded.streak_at_last_activity,
    longest_streak = excluded.longest_streak,
    last_activity_day = excluded.last_activity_day,
    updated_at = now();

  with player_metrics as (
    select
      count(*) filter (
        where award.event_completion_id is not null
      )::integer as challenge_completions,
      count(*) filter (
        where completion.score_correct = 5
      )::integer as perfect_challenges,
      count(*) filter (
        where award.cpu_match_id is not null
      )::integer as cpu_matches,
      count(*) filter (
        where match.winner = 'player'
      )::integer as cpu_wins,
      longest_streak_value as longest_streak
    from public.player_point_awards award
    left join public.event_completions completion
      on completion.id = award.event_completion_id
    left join public.cpu_matches match
      on match.id = award.cpu_match_id
    where award.player_id = player_id_to_award
  )
  insert into public.player_achievement_unlocks (
    player_id,
    achievement_code,
    source_award_id,
    unlocked_at
  )
  select
    player_id_to_award,
    achievement.code,
    inserted_award_id,
    occurred_at_to_record
  from public.achievement_definitions achievement
  cross join player_metrics metrics
  where achievement.is_active = true
    and achievement.threshold <= case achievement.metric
      when 'challenge_completions' then metrics.challenge_completions
      when 'perfect_challenges' then metrics.perfect_challenges
      when 'cpu_wins' then metrics.cpu_wins
      when 'cpu_matches' then metrics.cpu_matches
      when 'longest_streak' then metrics.longest_streak
    end
  on conflict (player_id, achievement_code) do nothing;

  return query
    select
      inserted_award_id,
      active_rule.points,
      active_rule.rule_code,
      active_rule.version,
      true;
end;
$$;

create function private.record_challenge_completion_progression(
  completion_id_to_record uuid
)
returns table (
  award_id uuid,
  player_id uuid,
  points_awarded integer,
  rule_code text,
  rule_version integer,
  was_created boolean
)
language plpgsql
as $$
declare
  completion record;
  persisted_award record;
begin
  select
    source.id,
    source.player_id,
    source.score_correct,
    source.completed_at
    into completion
    from public.event_completions source
   where source.id = completion_id_to_record;

  if not found then
    raise exception
      'Event completion % does not exist',
      completion_id_to_record
      using errcode = '23503';
  end if;

  select *
    into persisted_award
    from private.record_progression_award(
      completion.player_id,
      'challenge_score_' || completion.score_correct::text,
      completion.id,
      null,
      completion.completed_at
    );

  return query
    select
      persisted_award.award_id,
      completion.player_id,
      persisted_award.points_awarded,
      persisted_award.rule_code,
      persisted_award.rule_version,
      persisted_award.was_created;
end;
$$;

create function private.record_cpu_match_progression(
  match_id_to_record uuid
)
returns table (
  award_id uuid,
  player_id uuid,
  points_awarded integer,
  rule_code text,
  rule_version integer,
  was_created boolean
)
language plpgsql
as $$
declare
  completed_match record;
  persisted_award record;
begin
  select
    source.id,
    source.player_id,
    source.status,
    source.winner,
    source.completed_at
    into completed_match
    from public.cpu_matches source
   where source.id = match_id_to_record;

  if not found then
    raise exception
      'CPU match % does not exist',
      match_id_to_record
      using errcode = '23503';
  end if;

  if completed_match.status <> 'completed'
     or completed_match.completed_at is null
     or completed_match.winner is null then
    raise exception
      'CPU match % is not completed',
      match_id_to_record
      using errcode = '23514';
  end if;

  select *
    into persisted_award
    from private.record_progression_award(
      completed_match.player_id,
      case completed_match.winner
        when 'player' then 'cpu_match_win'
        else 'cpu_match_loss'
      end,
      null,
      completed_match.id,
      completed_match.completed_at
    );

  return query
    select
      persisted_award.award_id,
      completed_match.player_id,
      persisted_award.points_awarded,
      persisted_award.rule_code,
      persisted_award.rule_version,
      persisted_award.was_created;
end;
$$;

create view public.player_progression_all_time_standings as
select
  ranked.player_id,
  ranked.player_name,
  ranked.total_points,
  ranked.current_streak,
  ranked.longest_streak,
  rank() over (order by ranked.total_points desc) as standing_rank
from (
  select
    player.id as player_id,
    player.player_name,
    coalesce(state.total_points, 0) as total_points,
    case
      when state.last_activity_day >=
        (current_timestamp at time zone 'Africa/Johannesburg')::date - 1
        then state.streak_at_last_activity
      else 0
    end as current_streak,
    coalesce(state.longest_streak, 0) as longest_streak
  from public.players player
  left join public.player_progression_state state
    on state.player_id = player.id
  where player.lifecycle_status = 'active'
) ranked;

create function public.player_progression_monthly_standings(
  requested_month date
)
returns table (
  player_id uuid,
  player_name text,
  total_points integer,
  current_streak integer,
  longest_streak integer,
  standing_rank bigint
)
language sql
stable
as $$
  select
    ranked.player_id,
    ranked.player_name,
    ranked.total_points,
    ranked.current_streak,
    ranked.longest_streak,
    rank() over (order by ranked.total_points desc) as standing_rank
  from (
    select
      player.id as player_id,
      player.player_name,
      coalesce(monthly.total_points, 0) as total_points,
      case
        when state.last_activity_day >=
          (current_timestamp at time zone 'Africa/Johannesburg')::date - 1
          then state.streak_at_last_activity
        else 0
      end as current_streak,
      coalesce(state.longest_streak, 0) as longest_streak
    from public.players player
    left join public.player_monthly_progression monthly
      on monthly.player_id = player.id
     and monthly.month_start = date_trunc('month', requested_month)::date
    left join public.player_progression_state state
      on state.player_id = player.id
    where player.lifecycle_status = 'active'
  ) ranked;
$$;

do $$
declare
  source record;
begin
  for source in
    select
      'challenge_completion'::text as source_kind,
      completion.id as source_id,
      completion.completed_at
    from public.event_completions completion
    union all
    select
      'cpu_match'::text,
      match.id,
      match.completed_at
    from public.cpu_matches match
    where match.status = 'completed'
    order by completed_at, source_kind, source_id
  loop
    if source.source_kind = 'challenge_completion' then
      perform private.record_challenge_completion_progression(source.source_id);
    else
      perform private.record_cpu_match_progression(source.source_id);
    end if;
  end loop;
end;
$$;

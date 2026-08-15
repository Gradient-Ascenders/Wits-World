drop index if exists public.player_cards_event_reward_completion_unique_idx;

create index player_cards_event_reward_completion_idx
  on public.player_cards (source_completion_id)
  where acquisition_kind = 'event_reward'
    and source_completion_id is not null;

-- Match the existing CPU writer without changing legacy keys or battle rules.
-- The migration validates retained rows and fails rather than rewriting history.
alter table public.cpu_matches
  add constraint cpu_matches_state_object_check
    check (jsonb_typeof(state) = 'object');

alter table public.cpu_match_cards
  add constraint cpu_match_cards_snapshot_object_check
    check (jsonb_typeof(snapshot) = 'object');

alter table public.cpu_match_rounds
  add constraint cpu_match_rounds_state_before_object_check
    check (jsonb_typeof(state_before) = 'object'),
  add constraint cpu_match_rounds_state_after_object_check
    check (jsonb_typeof(state_after) = 'object'),
  add constraint cpu_match_rounds_result_array_check
    check (jsonb_typeof(result) = 'array');

alter table public.cpu_match_actions
  add constraint cpu_match_actions_action_object_check
    check (jsonb_typeof(action) = 'object'),
  add constraint cpu_match_actions_result_object_check
    check (jsonb_typeof(result) = 'object'),
  add constraint cpu_match_actions_response_object_check
    check (response is null or jsonb_typeof(response) = 'object'),
  add constraint cpu_match_actions_submitted_intent_object_check
    check (submitted_intent is null or jsonb_typeof(submitted_intent) = 'object');

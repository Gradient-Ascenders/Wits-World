-- UNIQUE constraints already maintain equivalent B-tree indexes on these keys.
-- Keep the constraint-backed indexes: they enforce integrity and serve lookups.
set local lock_timeout = '5s';

drop index public.card_moves_definition_position_idx;
drop index public.card_effects_definition_position_idx;
drop index public.cpu_match_cards_match_idx;
drop index public.cpu_match_rounds_match_idx;
drop index public.cpu_match_actions_match_idx;
drop index public.async_pvp_match_actions_history_idx;

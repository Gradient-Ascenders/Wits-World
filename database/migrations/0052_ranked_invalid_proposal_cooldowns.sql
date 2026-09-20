-- Final proposal validation may reject a previously accepted player. Preserve
-- the required cooldown on the terminal queue entry without changing the
-- immutable acceptance response or adding a browser-controlled state.
alter table private.ranked_queue_entries
  add column cooldown_until timestamptz;

alter table private.ranked_queue_entries
  add constraint ranked_queue_entries_invalid_cooldown_check
  check (
    cooldown_until is null
    or (
      status in ('invalid_deck', 'restricted')
      and cooldown_until = terminal_at + interval '30 seconds'
    )
  );

create index ranked_queue_entries_cooldown_idx
  on private.ranked_queue_entries (player_id, cooldown_until desc)
  where cooldown_until is not null;

comment on column private.ranked_queue_entries.cooldown_until is
  'Thirty-second cooldown for a player invalidated during final proposal validation.';

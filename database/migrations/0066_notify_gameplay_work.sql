-- Additive hints only. Persisted gameplay rows and existing locks remain authoritative.
-- Legacy Redis producers/readers continue unchanged during the staged cutover.
create function private.notify_gameplay_work() returns trigger
language plpgsql set search_path = pg_catalog as $$
declare worker text := 'ranked';
begin
  case TG_TABLE_NAME
    when 'live_pvp_matches' then
      worker := 'live';
      if TG_OP = 'UPDATE' and row(NEW.status, NEW.turn_deadline) is not distinct from
                                 row(OLD.status, OLD.turn_deadline) then return null; end if;
      if TG_OP = 'INSERT' and NEW.status <> 'active' then return null; end if;
      if TG_OP = 'DELETE' and OLD.status <> 'active' then return null; end if;
      if TG_OP = 'UPDATE' and NEW.status <> 'active' and OLD.status <> 'active' then return null; end if;
    when 'ranked_queue_entries' then
      if TG_OP = 'UPDATE' and row(NEW.status, NEW.lease_expires_at) is not distinct from
                                 row(OLD.status, OLD.lease_expires_at) then return null; end if;
      if TG_OP = 'INSERT' and NEW.status not in ('searching', 'proposed') then return null; end if;
      if TG_OP = 'DELETE' and OLD.status not in ('searching', 'proposed') then return null; end if;
      if TG_OP = 'UPDATE' and NEW.status not in ('searching', 'proposed') and
                             OLD.status not in ('searching', 'proposed') then return null; end if;
    when 'ranked_matchmaking_proposals' then
      if TG_OP = 'UPDATE' and row(NEW.status, NEW.acceptance_deadline) is not distinct from
                                 row(OLD.status, OLD.acceptance_deadline) then return null; end if;
      if TG_OP = 'INSERT' and NEW.status <> 'awaiting_acceptance' then return null; end if;
      if TG_OP = 'DELETE' and OLD.status <> 'awaiting_acceptance' then return null; end if;
      if TG_OP = 'UPDATE' and NEW.status <> 'awaiting_acceptance' and OLD.status <> 'awaiting_acceptance' then return null; end if;
    when 'ranked_seasons' then
      if TG_OP = 'UPDATE' and row(NEW.status, NEW.policy_version, NEW.intended_start_at, NEW.active_ends_at)
        is not distinct from row(OLD.status, OLD.policy_version, OLD.intended_start_at, OLD.active_ends_at) then return null; end if;
    when 'territory_zones' then
      if TG_OP = 'UPDATE' and NEW.status is not distinct from OLD.status then return null; end if;
      if TG_OP = 'INSERT' and NEW.status <> 'active' then return null; end if;
      if TG_OP = 'DELETE' and OLD.status <> 'active' then return null; end if;
    when 'territory_policy_versions' then
      if TG_OP = 'UPDATE' and row(NEW.settlement_cadence, NEW.daily_cap_timezone) is not distinct from
                                 row(OLD.settlement_cadence, OLD.daily_cap_timezone) then return null; end if;
    else return null;
  end case;
  perform pg_catalog.pg_notify('witsworld_gameplay_work', worker);
  return null;
end;
$$;

create trigger gameplay_work_wakeup after insert or update or delete on private.ranked_queue_entries
  for each row execute function private.notify_gameplay_work();
create trigger gameplay_work_wakeup after insert or update or delete on private.ranked_matchmaking_proposals
  for each row execute function private.notify_gameplay_work();
create trigger gameplay_work_wakeup after insert or update or delete on public.ranked_seasons
  for each row execute function private.notify_gameplay_work();
create trigger gameplay_work_wakeup after insert or update or delete on public.live_pvp_matches
  for each row execute function private.notify_gameplay_work();
create trigger gameplay_work_wakeup after insert or update or delete on public.territory_zones
  for each row execute function private.notify_gameplay_work();
create trigger gameplay_work_wakeup after insert or update or delete on private.territory_policy_versions
  for each row execute function private.notify_gameplay_work();

create table public.movement_evidence (
  id uuid primary key,
  player_id uuid not null
    references public.players (id) on delete restrict,
  event_id uuid not null
    references public.events (id) on delete restrict,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_metres double precision not null,
  acquired_at timestamptz not null,
  received_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null,

  constraint movement_evidence_latitude_check
    check (latitude between -90 and 90),
  constraint movement_evidence_longitude_check
    check (longitude between -180 and 180),
  constraint movement_evidence_accuracy_check
    check (
      accuracy_metres >= 0
      and accuracy_metres < 'Infinity'::double precision
    ),
  constraint movement_evidence_timing_check
    check (acquired_at <= received_at),
  constraint movement_evidence_finite_timestamps_check
    check (
      isfinite(acquired_at)
      and isfinite(received_at)
      and isfinite(expires_at)
      and isfinite(created_at)
    ),
  constraint movement_evidence_expiry_check
    check (expires_at > received_at),
  constraint movement_evidence_creation_check
    check (created_at = received_at),
  constraint movement_evidence_context_sample_unique
    unique (player_id, event_id, acquired_at)
);

create index movement_evidence_player_acquired_idx
  on public.movement_evidence (player_id, acquired_at desc);

create index movement_evidence_expiry_idx
  on public.movement_evidence (expires_at);

create function public.prevent_movement_evidence_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Movement evidence records are immutable'
    using errcode = '55006';
end;
$$;

create trigger movement_evidence_immutability
before update on public.movement_evidence
for each row
execute function public.prevent_movement_evidence_update();

create function private.delete_movement_evidence_for_account_deletion()
returns trigger
language plpgsql
as $$
begin
  if new.lifecycle_status in ('deletion_pending', 'deleted')
     and old.lifecycle_status is distinct from new.lifecycle_status then
    delete from public.movement_evidence
     where player_id = new.id;
  end if;

  return new;
end;
$$;

create trigger players_delete_movement_evidence
before update of lifecycle_status on public.players
for each row
execute function private.delete_movement_evidence_for_account_deletion();

alter table public.event_completions
  add constraint event_completions_retired_coin_award_check
  check (coins_awarded = 0) not valid;

create function private.prevent_legacy_player_wallet_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform 1
    from public.players
    where id = old.player_id
      and lifecycle_status = 'deletion_pending';

    if found then
      return old;
    end if;
  end if;

  raise exception
    'Player wallets are retired and can only be deleted during account cleanup'
    using errcode = '55006';
end;
$$;

create trigger player_wallets_retired_write_guard
before insert or update or delete on public.player_wallets
for each row execute function private.prevent_legacy_player_wallet_write();

create function private.prevent_legacy_coin_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'The legacy coin ledger is retired and immutable'
    using errcode = '55006';
end;
$$;

create trigger coin_ledger_entries_retired_mutation_guard
before insert or update or delete on public.coin_ledger_entries
for each row execute function private.prevent_legacy_coin_ledger_mutation();

comment on column public.event_completions.coins_awarded is
  'Legacy compatibility value. New completions must store zero; historical non-zero outcomes remain immutable.';

comment on table public.player_wallets is
  'Retired legacy wallet state. Existing rows are retained without writes and remain deletable by account cleanup.';

comment on table public.coin_ledger_entries is
  'Retired immutable coin history retained only for historical integrity.';

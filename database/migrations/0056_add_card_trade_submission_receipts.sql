-- Add durable idempotency receipts for authenticated card-trade commands.
-- The HTTP API supplies one submission UUID per player intent. Receipts keep a
-- canonical payload digest so retries converge without repeating a transition.

create table private.card_trade_submission_receipts (
  actor_player_id uuid not null
    references public.players (id) on delete restrict,
  operation text not null,
  submission_id uuid not null,
  payload_hash text not null,
  trade_id uuid not null
    references private.card_trades (id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),

  primary key (actor_player_id, operation, submission_id),
  constraint card_trade_submission_receipts_operation_check
    check (operation in (
      'trade_create',
      'trade_revise',
      'trade_acknowledge_imbalance',
      'trade_accept',
      'trade_decline',
      'trade_cancel'
    )),
  constraint card_trade_submission_receipts_payload_hash_check
    check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint card_trade_submission_receipts_time_check
    check (isfinite(created_at))
);

revoke all on table private.card_trade_submission_receipts from public;

create index card_trade_submission_receipts_trade_idx
  on private.card_trade_submission_receipts (trade_id, created_at);

create function private.prevent_card_trade_submission_receipt_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('wits.card_trade_cleanup_mode', true) = 'retention' then
    return old;
  end if;

  raise exception 'Card trade submission receipts are immutable'
    using errcode = '55006';
end;
$$;

create trigger card_trade_submission_receipts_immutability
before update or delete on private.card_trade_submission_receipts
for each row execute function private.prevent_card_trade_submission_receipt_mutation();

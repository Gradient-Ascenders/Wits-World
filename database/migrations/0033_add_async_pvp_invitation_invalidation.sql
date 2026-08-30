-- Extend the invitation lifecycle after movement eligibility migration 0032.
alter table public.async_pvp_invitations
  drop constraint async_pvp_invitations_status_check,
  drop constraint async_pvp_invitations_lifecycle_check;

alter table public.async_pvp_invitations
  add constraint async_pvp_invitations_status_check
    check (
      status in (
        'pending',
        'accepted',
        'declined',
        'expired',
        'invalidated'
      )
    ),
  add constraint async_pvp_invitations_lifecycle_check
    check (
      (
        status = 'pending'
        and responded_at is null
        and match_id is null
      )
      or
      (
        status = 'accepted'
        and responded_at is not null
        and responded_at < expires_at
        and match_id is not null
      )
      or
      (
        status = 'declined'
        and responded_at is not null
        and responded_at < expires_at
        and match_id is null
      )
      or
      (
        status = 'expired'
        and responded_at is not null
        and responded_at >= expires_at
        and match_id is null
      )
      or
      (
        status = 'invalidated'
        and responded_at is not null
        and responded_at < expires_at
        and match_id is null
      )
    );

comment on constraint async_pvp_invitations_status_check
  on public.async_pvp_invitations is
  'invalidated records a pending invitation ended early because a participant began account deletion; expired remains reserved for time-based expiry.';

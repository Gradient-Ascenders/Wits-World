---
title: 'Player accounts and names'
---

# Player accounts and names

The `public.players` table is Wits World's local player record. Authentication
continues to resolve this record through the exact trusted Auth0
`(auth_issuer, auth_subject)` pair. The local player UUID remains the stable key
for game data, while `role` and `lifecycle_status` remain server-authoritative
for application authorization.

## Player Name model

For database accounts, `player_name` mirrors the Auth0 `username` exposed by the
validated access-token claim `https://witsworld.co.za/player_name`. Google does
not supply that claim, so a newly provisioned Google player starts with `NULL`
and chooses a Player Name once through Wits World. It is useful account metadata,
but it is not an authentication, ownership, authorization, or foreign-key
identity.

The column remains nullable for legitimate Google onboarding and legacy
transition. Database tokens require and synchronize the trusted claim through
the existing `(auth_issuer, auth_subject)` upsert. Google tokens are resolved by
that same identity pair and never copy email or provider profile fields.

Names use the configured Auth0-compatible policy: 3–20 characters, lowercase,
and only letters, numbers, and Auth0-supported username punctuation. Because the
database connection's **Allow usernames in email format** and **Allow usernames
in phone number format** settings are off, those identifier-shaped values are
also rejected. This includes email syntax with a single-label domain, such as
`player@example`. The API trims and lowercases Google proposals; database
usernames must already use Auth0's canonical form. A partial unique index over
`lower(player_name)` makes the shared
cross-provider namespace database-authoritative while allowing onboarding NULLs.
The database check independently enforces the canonical syntax.

`GET /api/v1/auth/me` returns `playerName` and the derived
`playerNameSetupRequired` flag. `PUT /api/v1/auth/me/player-name` exists only to
assign an initial name to the authenticated supported social player while the
stored name is null. Database users and already-named users cannot call it.
Player Name is immutable in Basic Tier; future rename support requires an
approved Auth0/Wits synchronization design.

If a Google-chosen name already belongs to either provider, setup returns
`409 PLAYER_NAME_CONFLICT`. If a later database username collides with a name
already reserved by Google, database-account resolution returns the same safe
conflict. Neither case changes either `(iss, sub)` binding or local UUID.

Under the `BASIC-12` account-deletion workflow, successful deletion clears
`player_name` together with the Auth0 mapping and role. This releases the local
unique name only after the external Auth0 account has been deleted successfully.
The transactional persistence and retention backend and issue `#161`'s
player-facing account experience are implemented. See
[Account deletion persistence and retention](./account-deletion-retention.md)
for the exact deleted and retained records.

## Migration history

Migration `0019_add_player_display_name.sql` was recorded by the shared
development database before the final Auth0-backed decision, so its checksum is
immutable. Migration `0020_replace_display_name_with_player_name.sql` removes
the temporary field semantics by renaming the column, clearing untrusted
player-entered values, installing defensive checks, and adding case-insensitive
uniqueness. Migration `0021_enforce_player_name_policy.sql` retains nullable
Google onboarding while enforcing the shared canonical 3–20-character and
allowed-character policy. It is immutable after application. Migration
`0022_tighten_player_name_policy.sql` replaces only that check constraint to
reject email-shaped (including single-label domains) and phone-shaped names.
Migration `0024_complete_account_deletion_retention.sql` added card reward
history and the original guarded player-data cleanup. Migrations `0062` and
`0063` detach shared actor history and extend cleanup to remove progression,
rankings, completed player-only gameplay, and the physical player row.

Apply the complete migration set before deploying the API version that performs
account deletion.

The preceding document was generated and edited with the assistance of:
Codex-CLI[GPT-5], Codex[GPT-5], and Codex-CLI[gpt-5.6-sol medium].

Page title clarified with assistance from Codex-CLI[GPT-6].

This account-deletion update was edited with assistance from Codex[GPT-6].

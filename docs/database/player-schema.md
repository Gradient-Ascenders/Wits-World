---
title: 'Player accounts and names'
---

# Player accounts and names

`public.players` connects a validated Auth0 identity to a local game account.
Game data uses the local player UUID. Player Names provide display identity;
the API reads roles and account lifecycle from PostgreSQL.

## Account fields

| Column                        | Responsibility                                                             |
| ----------------------------- | -------------------------------------------------------------------------- |
| `id`                          | Stable local UUID used for ownership and account relationships.            |
| `auth_issuer`, `auth_subject` | Exact trusted Auth0 identity pair, unique across accounts.                 |
| `player_name`                 | Nullable during supported social-account onboarding; unique when assigned. |
| `role`                        | Local `player` or `author` permission.                                     |
| `lifecycle_status`            | Account access state, normally `active` or `deletion_pending`.             |
| `deletion_request_id`         | Pending deletion request, where applicable.                                |
| `created_at`, `updated_at`    | Account timestamps.                                                        |

New accounts receive the `player` role. Resolving an existing identity preserves
its local UUID and role; browser input and token role claims cannot grant Author
access. See the [Author guide](../design/author-guide.md) for permissions and
[Integrations](../architecture/external-integrations.md#auth0) for authentication.

The schema still recognises the historical `deleted` lifecycle value. Completed
deletion now removes the player row, rather than keeping an account tombstone.

## Player Name assignment

Auth0 database accounts supply their canonical username through the validated
`https://witsworld.co.za/player_name` claim. Account resolution synchronises
that claim with `player_name`.

Supported Google accounts start with no Player Name and choose one through
`PUT /api/v1/auth/me/player-name`. The API trims and lowercases the proposal,
then assigns it only while the stored name is null. Database accounts and
already-named accounts cannot use this operation.

Names use the shared account policy: **3–20 characters**, lowercase letters,
numbers, and the supported username punctuation. Email-shaped and phone-shaped
values are rejected. Database claims must already have canonical form.

A database check enforces the syntax, and a partial unique index on
`lower(player_name)` reserves one namespace across providers while allowing
onboarding nulls. A collision returns `409 PLAYER_NAME_CONFLICT` without
changing either account's identity binding or ownership.

`GET /api/v1/auth/me` exposes `playerName` and the derived
`playerNameSetupRequired` flag. There is no player rename operation. API
operations that require completed onboarding reject accounts without a name.

## Profile storage

Editable showcase data lives separately from identity:

| Relation               | Responsibility                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `player_profiles`      | Versioned bio, study details, avatar, temporary status, and visibility preferences. |
| `player_profile_cards` | Up to 4 ordered favourite owned-card references per player.                         |

Profiles default to private, with activity sharing disabled. Favourites refer
to owned copies rather than catalogue definitions. Transferring or consuming
a showcased copy removes its reference; showcasing does not reserve the card.

The [Profile guide](../design/profile-showcase.md) owns the display and visibility
rules. Profile preferences do not change authentication, ownership, or standings
eligibility.

## Deletion boundary

Pending deletion disables normal account and developer-key access. Completion
removes identity, Player Name, profile, and personal game data. The local name
reservation is released with the completed purge, after the Auth0 deletion
boundary succeeds.

Retained shared history uses a fresh profile-free actor reference. A later
registration receives a new UUID and starting state.
[Account deletion and retained data](account-deletion-retention.md) defines the
transaction and retention rules.

**AI declaration:** Prepared and updated with assistance from Codex-CLI[GPT-5],
Codex[GPT-5], Codex-CLI[gpt-5.6-sol medium], Codex-CLI[GPT-6], and Codex[GPT-6].

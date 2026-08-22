# Player identity and display names

The `public.players` table is Wits World's local player record. Authentication
continues to resolve this record from the trusted Auth0 `(auth_issuer,
auth_subject)` pair. The local player UUID remains the stable key used by game
data, and `role` plus `lifecycle_status` remain server-authoritative for
authorization.

## Display-name model

`display_name` is nullable, non-unique presentation metadata owned by Wits
World. It is not an authentication identifier, authorization identifier, or
social handle. Existing and newly provisioned players start with `NULL` until
the owning player explicitly chooses a name; provisioning does not copy Auth0
profile names or email addresses.

The API trims surrounding whitespace and validates the name before storage. A
stored name must:

- contain 2–32 Unicode code points;
- contain no control characters;
- contain no surrounding ordinary spaces; and
- retain the player's chosen casing and content after trimming.

The database check constraint independently enforces the compatible stored
length, ordinary-space trimming, and control-character rules. There is no
unique index or case-normalized uniqueness rule, so two players may choose the
same display name.

`GET /api/v1/auth/me` returns `displayName` as a string or `null`. An active
authenticated player can update only their own value with `PUT
/api/v1/auth/me/display-name`; the route takes no player identifier. The update
changes only `display_name` and `updated_at`, and returns the authoritative
local player state.

Completed account deletion clears `display_name` alongside the Auth0 mapping
and role so the retained player tombstone contains no player-facing name.

## Migration

Migration `0019_add_player_display_name.sql` adds the nullable column and check
constraint without backfilling existing records. Deploy it before deploying an
API version that selects `display_name` during player resolution.

The preceding document was generated and edited with the assistance of:
Codex[GPT-5].

# CPU match persistence

## Scope

Issue #75 adds the server and database boundary for Basic CPU matches. The
browser submits an intended action identifier; the API loads the match state,
validates the action with `@wits-world/game-rules`, performs CPU actions with
server-side randomness, and commits the resulting state and audit records in
one transaction.

The player can have one active CPU match. Completed matches remain private to
the authenticated player and are never recalculated from a later deck or card
catalogue change.

## Stored data

Migration `0012_create_cpu_matches.sql` adds:

- `cpu_matches` for the current authoritative state, status, version,
  timestamps, winner, and an optional source deck reference;
- `cpu_match_cards` for immutable player and CPU card snapshots;
- `cpu_match_rounds` for before/after state and the results of one submitted
  transition; and
- `cpu_match_actions` for each player and server CPU action, including ordering,
  submission id, action input, and result.

The current state and round snapshots are JSONB because they are the complete
state accepted by the pure rules package. The relational match, player, side,
sequence, and status columns remain queryable and constrained by PostgreSQL.
The source deck reference is nullable on deletion so removing a saved deck
does not remove or invalidate a match snapshot.

## Transaction and concurrency boundary

Every player action runs in a transaction:

1. Lock the owning `cpu_matches` row with `FOR UPDATE`.
2. Return the previously stored response when the submission id was already
   completed.
3. Reject a completed match or stale expected version.
4. Apply the player action through the shared rules package.
5. Apply all required CPU actions using the server random source.
6. Insert the round and ordered action audit rows.
7. Update the match state, version, timer, and terminal result.
8. Commit the complete transition.

Any failure rolls back the match state and all audit rows. The unique
`(match_id, submission_id)` constraint and the match row lock prevent one
client submission from being applied twice.

The API uses a 90-second server timer for a player's active CPU turn. A late
active-turn request becomes the rules engine's trusted `timeout` action. CPU
turns are resolved synchronously by the API and are never delegated to the
browser.

## HTTP contract

Protected routes are exposed under `/api/v1`:

- `POST /matches/cpu` creates a match from the player's selected deck;
- `GET /matches/:matchId` returns the owner's safe current state;
- `POST /matches/:matchId/actions` accepts a submission id, expected version,
  and one intended action; and
- `GET /matches/history` returns the authenticated player's completed records.

Current responses expose the player's cards and legal actions. CPU cards that
have not been revealed remain hidden; only the active and defeated CPU
Creatures and aggregate remaining counts are returned. The browser cannot send
card stats, effects, random outcomes, winners, or completion state.

## Verification

The API route tests cover authentication, identity derivation, rejection of
client-authoritative result fields, legal action payloads, timeout rejection,
and history isolation. Service tests cover a player action followed by a
server CPU action in one transaction and stale-version rollback. PostgreSQL
integration suites apply and re-run migration `0012` with the existing clean
database migration coverage.

This document was generated and edited with assistance from
ChatGPT-Web[GPT-5.6 Sol].

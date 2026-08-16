# CPU match persistence

## Scope

Issue #75 adds the server and database boundary for Basic CPU matches. The
browser submits an intended action identifier; the API loads the match state,
validates the action with `@wits-world/game-rules`, performs CPU actions with
server-side randomness, and commits the resulting state and audit records in
one transaction.

The player can have one active CPU match. Completed matches remain private to
the authenticated player and are never recalculated from a later deck or card
catalogue change. The API also provides an authenticated lookup for the one
unfinished match so the browser never has to retain a match identifier as an
authority record.

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

Active-match recovery is read-only. It selects the authenticated player's
`status = 'active'` match and its latest action in one PostgreSQL statement, so
the response represents one coherent committed database snapshot. Concurrent
recovery reads do not lock or mutate the match. When an action commits during a
recovery read, the read observes either the committed state before that action
or the committed state after it. When completion is already visible to the
read, the row no longer qualifies as active and the API returns the no-active
result. The partial unique index on `cpu_matches.player_id` where
`status = 'active'` remains the final one-active-match guarantee; the service
fails internally instead of choosing a row if that invariant is ever violated.

## HTTP contract

Protected routes are exposed under `/api/v1`:

- `POST /matches/cpu` creates a match from the player's selected deck;
- `GET /matches/cpu` returns the authenticated player's one active CPU match;
- `GET /matches/:matchId` returns the owner's safe current state;
- `POST /matches/:matchId/actions` accepts a submission id, expected version,
  and one intended action; and
- `GET /matches/history` returns the authenticated player's completed records.

`GET /matches/cpu` accepts no player or match identifier. Authentication and
the active-player pre-handler supply the only ownership identity. A successful
lookup returns `200` with the same `CpuMatchResponse` representation used by
creation, direct state reads, and action responses. If no committed unfinished
match is visible for the authenticated player, including when their previous
match is completed, it returns the established problem response:

```json
{
  "type": "https://wits.world/problems/cpu_match_not_found",
  "title": "CPU match not found",
  "status": 404,
  "code": "CPU_MATCH_NOT_FOUND",
  "detail": "The requested CPU match was not found.",
  "requestId": "<server request ID>"
}
```

Completed matches remain available through `/matches/history` and their known
`/matches/:matchId` detail route; they are never returned by the active lookup.
The lookup reveals nothing about another player's active or completed matches.

## Browser recovery contract

Issue #76 may use the following lifecycle contract:

### Normal battle entry

On battle entry, refresh, browser restart, or later re-entry, call
`GET /api/v1/matches/cpu` before offering to create a match:

- `200` means an authoritative active match is visible. Use the returned
  `matchId`, `version`, `state`, and `legalActions` to resume it.
- `404 CPU_MATCH_NOT_FOUND` means no committed active match is visible to that
  lookup. The UI may offer `POST /api/v1/matches/cpu` using the selected deck.

After completion, use `/matches/history` for the private completed list.

### Ambiguous creation failure

When a network failure leaves the browser unable to know whether
`POST /api/v1/matches/cpu` committed:

1. Reconcile with `GET /api/v1/matches/cpu`.
2. A `200` response recovers the committed match.
3. An immediate `404 CPU_MATCH_NOT_FOUND` does not prove the original creation
   will never commit. Its transaction may still be in flight and invisible to
   the recovery read.
4. Use a small bounded reconciliation and retry strategy before concluding
   that no active match became visible. Issue #76 may choose a sensible bounded
   retry or backoff without treating browser state as authoritative.
5. If a subsequent create attempt returns `409 CPU_MATCH_ALREADY_ACTIVE`, keep
   that conflict meaning unchanged and reconcile again through the GET lookup.
6. Never automatically replay gameplay actions as part of creation recovery.

The browser may cache a route for convenience, but it does not own match state
or use local storage, guessed identifiers, client simulation, or direct data
access as a recovery authority.

Current responses expose the player's cards and legal actions. CPU cards that
have not been revealed remain hidden; only the active and defeated CPU
Creatures and aggregate remaining counts are returned. The browser cannot send
card stats, effects, random outcomes, winners, or completion state.

## Verification

The API route tests cover authentication, identity derivation, active recovery,
the no-active response, OpenAPI, rejection of client-authoritative result
fields, legal action payloads, timeout rejection, and history isolation.
Service tests cover a coherent read-only recovery snapshot, invariant failure,
a player action followed by a server CPU action in one transaction, and
stale-version rollback. PostgreSQL integration tests cover lost-create-response
recovery after commit, pre-commit transaction invisibility, authoritative
post-action state, ownership isolation, concurrent reads, active uniqueness,
completed exclusion, snapshots, actions, and rounds. Migration `0012` remains
unchanged and continues to receive the existing clean database migration
coverage.

This document was generated and edited with assistance from
ChatGPT-Web[GPT-5.6 Sol] and Codex[GPT-5].

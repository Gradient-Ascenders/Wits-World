---
title: 'Contested-campus territory API contract'
---

# Contested-campus territory API contract

Issue `#270` implements the server-authoritative runtime for the reviewed
[`territory-v1` policy](../requirements/contested-campus-zone-policy.md). The
browser may express an intended zone and submit an untrusted location claim, but
it never submits influence, an owner, settlement totals, a winner, a local day,
or an owner-bonus card choice.

## Ranked queue territory intent

`POST /api/v1/ranked/queue` keeps the existing ranked contract and accepts an
optional `territoryClaim` alongside `deckId`:

```json
{
  "deckId": "<owned-deck-uuid>",
  "territoryClaim": {
    "zoneId": "<reviewed-zone-uuid>",
    "latitude": -26.19,
    "longitude": 28.03,
    "accuracyMetres": 8,
    "acquiredAt": "2026-09-22T10:00:00.000Z"
  }
}
```

Identity comes from the bearer token. PostgreSQL/PostGIS applies the persisted
claim-age and grant-lifetime policy, checks strict containment of the complete
reported-accuracy envelope, and rejects ambiguous overlap. The precise
latitude, longitude, and accuracy are used only for the decision and are not
stored. The resulting private grant is bound to that player and queue entry and
expires after five minutes even if queue heartbeats continue.

Ordinary ranked queue requests omit `territoryClaim` and remain valid. Their
matches receive a deliberate null territory snapshot and cannot create
influence. A territory grant is revalidated immediately before match creation
and consumed exactly once. If a grant becomes unavailable during a proposal,
that contender is removed without a decline cooldown and a still-eligible
accepting opponent returns to searching with the original queue-join time.

Location failures use safe outcomes: malformed coordinates/timestamps are a
`400 TERRITORY_LOCATION_INVALID`; stale/future or boundary-ambiguous claims use
`409 TERRITORY_LOCATION_REFRESH_REQUIRED`; a valid claim outside the requested
active zone uses `409 TERRITORY_NOT_ELIGIBLE`; overlapping active-zone
configuration uses `503 TERRITORY_CONFIGURATION_UNAVAILABLE`.

## Zone reads

All territory read routes require bearer authentication and an active local
player:

| Method | Route                                       | Player-safe result                                                                                                                                      |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/territory/zones`                   | Reviewed active/suspended geometry, display name, current owner name, current ranked season/window.                                                     |
| `GET`  | `/api/v1/territory/zones/:zoneId`           | Zone detail plus lifecycle version and last settlement time.                                                                                            |
| `GET`  | `/api/v1/territory/zones/:zoneId/standings` | Anonymous top-three current-window influence counts, aggregate activity, and only the authenticated viewer's own current/daily count and remaining cap. |
| `GET`  | `/api/v1/territory/zones/:zoneId/history`   | Recent ownership-changing lifecycle/settlement history with current owner Player Names and `Deleted player` labels for removed accounts.                |

The response contract never exposes contributor UUIDs, grant identifiers,
source match identifiers, opponents, decks, location evidence, trust signals,
or excluded-decision reasons. Repeated same-owner hourly settlements remain in
the immutable database ledger but are omitted from the ownership-period history
response so they are not presented as transfers.

Issue `#271` presents these reads as a `Territories` view inside `/explore`.
The map polygons and the keyboard-accessible list are equivalent ways to select
a zone; the list remains the complete interaction path if Mapbox is unavailable.
The browser loads the catalogue only after the player opens the view, loads a
selected zone's detail, standings, and history independently, and keeps the
last good response visibly marked as stale when a refresh fails. It does not
infer eligibility, influence, ownership, settlement, or a winner from map
position or locally elapsed time.

The territory view is browse-first. It explains how a future Ranked entry
surface can submit the existing optional `territoryClaim`, but it does not add a
second queue action or imply that viewing/selecting a polygon creates a grant.

## Per-match contribution feedback

`GET /api/v1/ranked/matches/:matchId/settlement` now includes a required,
nullable `territory` member. Ordinary ranked matches return `null`. A match with
the authenticated participant's immutable territory snapshot returns the zone
ID/name and one of these player-safe outcomes:

| Outcome    | Meaning                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending`  | The ranked match has not committed its authoritative settlement.                                                                                                                                        |
| `lost`     | The participant lost, so the attempted territory received no influence.                                                                                                                                 |
| `accepted` | The participant won and the reported `influencePoints` were committed.                                                                                                                                  |
| `excluded` | The participant won but no influence was committed; `exclusionReason` is one of `daily_cap_reached`, `placement_matches_remaining`, `player_unavailable`, `result_not_eligible`, or `zone_unavailable`. |

The response is scoped through the authenticated match participant. It does not
expose the opponent's claim, contribution decision, location evidence, internal
policy reason, or private identifiers. The browser must render this result when
the Ranked match-result surface is available; it must not reconstruct the
outcome from score, rating, standings, or zone state.

## Influence and settlement authority

There is no influence-write HTTP endpoint. When a live ranked match commits its
authoritative terminal result, the same database transaction creates exactly one
territory decision for the winner. The runtime uses the immutable match-time
zone snapshot, prior ranked-settlement count, completion reason, current zone
lifecycle, active-player state, and Johannesburg daily cap. Accepted decisions
always contribute the policy-defined one point; excluded decisions contribute
zero.

The maintenance worker settles fixed Johannesburg hourly windows from immutable
accepted contributions. Ownership requires at least three points; highest count
leads; an incumbent wins a leader tie; otherwise the earliest accepted
contribution and then stable internal UUID break the tie. Stale state retries
from the current owner/version instead of overwriting it. Contribution creation
and settlement share the player-before-zone lock order and the zone row is the
boundary that assigns a racing contribution to exactly one half-open window.

When a ranked season is closing, ranked closure waits until all source matches
settle. Territory then catches up complete windows, commits the final partial
window to one frozen authoritative close time, seals the territory season, and
appends an unowned `season_reset` for every active zone before ranked closure can
finish.

## Owner bonus

Challenge start resolves the event's authoritative effective location and
snapshots whether the authenticated player owns the one active territory zone
containing it. The bonus date is derived from the persisted challenge-start
instant in `Africa/Johannesburg`; later ownership, zone, placement, or midnight
changes do not rewrite that snapshot.

On normal challenge completion, a snapshotted eligible attempt with at least
three correct answers may receive one additional active, published,
reward-eligible, non-evolved Common card. The database enforces at most one
awarded bonus per player and challenge-start local date. The completed-attempt
response exposes only `awarded`, `not_eligible`, `score_too_low`, or
`already_claimed`, plus the awarded card when applicable. The normal challenge
reward remains independent and commits in the same transaction.

## Operations and privacy

The existing ranked worker performs territory maintenance about once per minute;
no new environment variable is introduced. Safe aggregate logs cover expired
contenders/grants and settled windows without logging precise location or
private competitive evidence. Expired private grants are deleted within the
persisted 24-hour cleanup deadline.

The implementation is backed by additive migration
`0054_implement_contested_territory_runtime.sql`; published migration `0053`
remains unchanged.

The preceding document was generated and edited with the assistance of:
ChatGPT-Web[GPT-5.6 Sol] and Codex[GPT-5].

This account-deletion update was edited with assistance from Codex[GPT-6].

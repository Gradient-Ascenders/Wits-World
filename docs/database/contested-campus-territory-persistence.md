---
title: 'Contested-campus territory persistence'
---

# Contested-campus territory persistence

## Scope

Migration `0053_persist_contested_territory.sql` implements issue `#268`, the
persistence foundation for the Advanced-tier
[`territory-v1` policy](../requirements/contested-campus-zone-policy.md). It
stores reviewed zone definitions, ranked-result contribution evidence,
settlement receipts, immutable ownership state history, and a rebuildable
current-owner projection. It does not calculate influence eligibility or a
settlement winner and does not add location grants, ranked match-to-zone
snapshots, HTTP routes, workers, owner rewards, or map UI. Those runtime
boundaries remain issue `#270`.

The existing ranked subsystem remains the only rating and battle authority. A
territory contribution decision must reference one committed
`private.ranked_rating_settlements` row and its authoritative winner; CPU,
asynchronous, casual live, incomplete, or otherwise non-ranked results cannot
be used as a territory source through this schema.

## Stored relations

| Relation                                    | Responsibility                                                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `private.territory_policy_versions`         | Immutable `territory-v1` constants and reviewed policy identity.                                                              |
| `public.territory_zones`                    | Independently versioned WGS 84 `MultiPolygon` zone definitions, provenance, and lifecycle.                                    |
| `private.territory_contribution_decisions`  | Exactly one accepted or excluded territory decision per authoritative ranked source match.                                    |
| `private.territory_influence_contributions` | The append-only one-point ledger for accepted decisions only.                                                                 |
| `private.territory_settlement_receipts`     | One committed receipt for a zone, ranked season, and fixed hourly window, including before/after owner and state versions.    |
| `private.territory_settlement_totals`       | Immutable per-player accepted counts, first-contribution tie-break input, and eligibility snapshot for one receipt.           |
| `private.territory_ownership_versions`      | Append-only owner state after activation, settlement, lifecycle changes, account deletion, and later season reset operations. |
| `private.territory_current_ownership`       | Rebuildable one-row-per-zone projection pointing at the latest ownership version.                                             |

Relations in the `private` schema have privileges revoked from PostgreSQL
`PUBLIC`. `public.territory_zones` is a database-schema placement, not a browser
permission: future API reads still require server-side authentication,
validation, and response shaping.

## Policy and reviewed geometry bootstrap

`territory-v1` persists the issue `#267` constants rather than taking them from
browser configuration: two-minute claim age, five-minute grant lifetime,
24-hour expired-grant cleanup deadline, one point per eligible win, five prior
ranked settlements, five accepted contributions per player/zone/Johannesburg
date, hourly settlement, three-point ownership threshold, and the reviewed
owner-bonus settings. The policy row cannot be updated or deleted.

The initial zone definitions are `east_campus`, `west_campus`, and
`arts_and_community`. Their geometry, display name, source URLs, review evidence,
and source placement identity are copied from the reviewed `placement-v1`
catalogue into `public.territory_zones`. The copied geometry is an immutable
snapshot. A later placement status or geometry version cannot silently change a
territory boundary or owner.

Migrations run before repeatable seeds on a clean database. For that reason the
migration installs `private.bootstrap_territory_v1_zones()` and invokes it once:

- an existing seeded database is bootstrapped during migration `0053`;
- a clean database initially has no placement rows, so the call is a no-op; and
- `database/seeds/0004_territory_catalogue.sql` invokes the same function after
  `0003_event_placement_catalogue.sql` creates the reviewed source catalogue.

Rerunning the seed verifies the copied definition/provenance but never updates an
existing territory lifecycle. A suspended or retired territory zone therefore
stays suspended or retired.

Every zone geometry must be a non-empty valid `MultiPolygon` in SRID 4326. A
GiST index supports future PostGIS containment work. A serialized definition
guard rejects positive-area intersections between simultaneously active zones;
shared boundaries are permitted because boundary points are resolved later as
ambiguous by the eligibility service. Only one active or suspended definition
of a logical zone may exist at a time. Replacing a reviewed boundary requires a
new definition version and retirement of the previous current definition.

## Zone lifecycle and ownership state

The database permits the reviewed policy lifecycle:

```text
pending_review -> active
pending_review -> retired
active         -> suspended
active         -> retired
suspended      -> active
suspended      -> retired
```

Retirement is terminal and definitions cannot be deleted. Activating a zone
creates its first unowned ownership state. Suspending or retiring a zone appends
another unowned state in the same transaction, preserving all prior ownership
versions. Reactivation appends a fresh unowned state rather than restoring the
previous owner.

`private.territory_ownership_versions` is authoritative history. State versions
increase exactly once for each appended state and carry the previous owner so a
consumer can distinguish a real transfer from an hourly settlement that retains
the incumbent. `private.territory_current_ownership` stores only a pointer to
the latest version. `private.rebuild_territory_current_ownership()` deletes and
recreates that projection from maximum authoritative state versions. A deferred
integrity guard rejects a projection pointer that does not reference that zone's
latest history row, so the projection is not a second source of truth.

## Contribution decisions and append-only influence

A contribution decision is keyed by `source_match_id`. Its composite foreign key
binds the source to the existing ranked settlement's match, season, and ranked
policy, and a trigger verifies that `winner_player_id` is the settlement's
winner. This makes retries converge on one row and prevents another match type
from being presented as ranked territory evidence.

An accepted decision must name one active territory zone and active local
player and records one point. An excluded decision records zero points with a
safe machine-readable exclusion reason and cannot later be changed into an
accepted result. A deferred integrity check requires every accepted decision to
have exactly one influence row and every excluded decision to have none in the
same transaction.

`private.territory_influence_contributions` is append-only. Before insert it
locks and rechecks the contributing player, then locks the target territory
zone, samples `clock_timestamp()`, and derives
the calendar date in `Africa/Johannesburg`. This gives the later settlement
runtime the required boundary rule: a contribution waiting behind settlement
receives its authoritative time only after settlement releases the zone lock and
therefore falls into the next half-open window. The schema indexes both
`(zone, season, time, player)` settlement scans and `(zone, player, local date)`
daily-cap checks. The database rejects a contribution once the persisted daily
cap has already been reached; issue `#270` must also acquire the zone lock before
its accepted-decision calculation so concurrent API instances see the latest
committed count before deciding acceptance.

Contribution decisions and accepted influence cannot be updated or deleted.

## Settlement receipts, totals, and concurrency

One `private.territory_settlement_receipts` row identifies a zone, ranked
season, policy, Johannesburg-aligned half-open one-hour window, input digest,
owner before and after, expected state version, resulting state version, and
authoritative settlement time. The unique window key makes a retry discover the
existing receipt instead of committing a second settlement. A receipt insert
locks the zone row and rejects an inactive zone, a future/non-hourly window, an
inactive/closed season, an unavailable new owner, or a stale expected owner or
state version.

After a receipt is inserted, the database appends the corresponding ownership
version and refreshes the current projection inside the same transaction. A
same-owner receipt advances state without implying a transfer: the history row
has the same previous and resulting owner. A stale writer cannot skip a state
version.

`private.territory_settlement_totals` snapshots the accepted count and earliest
accepted contribution for each contributing player plus the service's
account-eligibility decision. Deferred validation compares those immutable count
and earliest-time facts with the accepted contribution ledger for the receipt's
window. The schema deliberately does **not** choose the winning player; applying
the threshold, incumbent tie rule, challenger tie break, account eligibility,
chronological catch-up, and season-final settlement remains the issue `#270`
server service.

The required runtime lock boundary is one territory-zone row, with player locks
ordered before that zone boundary. Future ranked completion must finish its
ranked match/rating locks, lock the contributing player, lock the relevant
territory zone, decide the contribution, then insert the accepted contribution
so its time is sampled after that zone lock. Settlement locks any before/after
owners in stable UUID order before locking the same zone. Account deletion
already locks the player by updating its lifecycle before it clears owned zones.
This common player-then-zone order prevents ownership or influence from being
committed for a player whose deletion won the race, while preventing a
contribution from being silently omitted from both adjacent windows.

## Retirement, deletion, and privacy

Suspension and retirement append unowned state but never delete geometry,
contribution decisions, accepted influence, settlement receipts/totals, or
ownership versions. Retired zones remain historical records and cannot be
reactivated.

When a player's lifecycle changes from `active` to `deletion_pending`, migration
`0053` immediately appends an `account_deletion` ownership version for every
currently owned zone and makes each projection unowned. Historical player
references remain against the existing local UUID tombstone. The standard
account-deletion flow later clears Auth0 identity, Player Name, and role, so
history can render `Deleted player` without rewriting counts, receipt order, or
ownership dates.

Territory persistence stores no latitude, longitude, accuracy envelope, path,
email, Auth0 issuer/subject, bearer token, trust score, deck, opponent detail, or
raw match payload. The source ranked match ID, zone, and local player UUID remain
private evidence. Future player-facing APIs must expose only the privacy-limited
fields approved by the territory policy.

## Verification

`apps/api/tests/territory-persistence.integration.test.ts` uses disposable test
databases to cover both clean migration-plus-seed and upgrade paths. It checks
the immutable policy, copied geometry/provenance, GiST and current-definition
indexes, active-zone overlap rejection, independence from placement lifecycle,
seed idempotency without reactivation, exactly-once contribution persistence
under concurrent retries, append-only guards, versioned settlement history,
stale-state rejection, current-projection rebuild, account-deletion owner
removal, and retirement history. The ranked contribution fixture creates a real
ranked live-match settlement rather than fabricating a second battle authority.

Run migration tests before the focused database suite. Local database tests are
verification against the disposable `TEST_DATABASE_URL`; they are not evidence
that a production migration or worker has run. Full database validation remains
a CI/release gate under the documented
[database release procedure](database-release-procedure.md).

## AI declaration

This page and the issue `#268` implementation were generated and reviewed with
assistance from ChatGPT-Web[GPT-5.6 Sol].

---
title: 'Contested-campus zones and settlement'
---

# Contested-campus zones and settlement

## Status and purpose

This document is the issue `#267` policy contract for Advanced-tier contested
campus zones. It defines how active players become eligible to contest a zone,
how authoritative ranked wins create influence, how concurrent influence is
settled, and what owning a zone provides.

Issue `#268` is implemented by migration
`0053_persist_contested_territory.sql`, which persists the immutable
`territory-v1` policy snapshot, independently reviewed zone geometry,
contribution/settlement ledgers, and ownership history. Issue `#270` adds the
runtime contract through additive migration
`0054_implement_contested_territory_runtime.sql` and API services: short-lived
location grants, ranked match-to-zone snapshots, transactional influence,
deterministic hourly and season-final settlement, player-safe read APIs, and the
owner card bonus. Issue `#271` remains responsible for the contested-campus map
presentation. Territory reuses completed ranked results from the
[ranked competition policy](ranked-competition-policy.md); it does not create a
second matchmaking, rating, or battle authority. The corresponding database
contract is documented in
[Contested-campus territory persistence](../database/contested-campus-territory-persistence.md).

## Authority and terminology

The API and PostgreSQL/PostGIS are authoritative for zone geometry and
lifecycle, location-claim evaluation, grant expiry, match-to-zone snapshots,
contribution eligibility and limits, settlement windows and ordering, current
ownership, season history, and owner bonuses. The browser submits only a fresh
location claim and player intent. It cannot submit authoritative zone
membership, influence, owner, winner, settlement, reward eligibility, or card
selection.

The initial immutable policy version is `territory-v1`. Every zone version,
grant, match snapshot, contribution decision, settlement, ownership period, and
bonus decision records that policy version. A later policy affects only future
grants and source matches unless its migration contract explicitly says
otherwise. It never recalculates committed influence or historical ownership.

Terms used by this policy are:

- **territory zone**: one reviewed, versioned PostGIS campus area that players
  may contest;
- **zone grant**: a private, five-minute server decision that one authenticated
  player is sufficiently inside one active zone;
- **source match**: a ranked live match that snapshots each supplied valid zone
  grant when the match is created;
- **contribution decision**: the exactly-once accepted or excluded influence
  outcome derived from a source match's authoritative winner;
- **settlement window**: one fixed hourly Johannesburg interval whose accepted
  contributions are settled together;
- **owner**: one active local player selected by a committed settlement; and
- **ownership period**: the immutable interval during which that player held
  the zone.

Territory ownership is a fictional in-game result. It conveys no ownership,
access, priority, authority, or other claim over University property or any
real-world place.

## `territory-v1` configuration

| Setting                           | Initial value                         |
| --------------------------------- | ------------------------------------- |
| Territory zones                   | 3 reviewed campus areas               |
| Maximum location-claim age        | 2 minutes                             |
| Zone-grant lifetime               | 5 minutes                             |
| Grant cleanup deadline            | 24 hours after expiry                 |
| Influence per eligible ranked win | 1 point                               |
| Required prior ranked settlements | 5                                     |
| Daily influence cap               | 5 per player and zone                 |
| Daily-cap timezone                | `Africa/Johannesburg`                 |
| Settlement cadence                | Hourly                                |
| Minimum ownership influence       | 3 points in one window                |
| Owner bonus score                 | At least 3 correct answers            |
| Owner bonus limit                 | 1 card per player and local date      |
| Owner bonus pool                  | Active non-evolved Common definitions |

These values are persisted as one immutable policy snapshot rather than read
from browser configuration. A later reviewed policy version may change them for
future grants, source matches, settlements, or attempts without rewriting
historical results.

## Initial zones and geometry

`territory-v1` begins with three zones:

| Zone key             | Display name       | Geometry source                       |
| -------------------- | ------------------ | ------------------------------------- |
| `east_campus`        | East Campus        | Reviewed `placement-v1` coverage area |
| `west_campus`        | West Campus        | Reviewed `placement-v1` coverage area |
| `arts_and_community` | Arts and Community | Reviewed `placement-v1` coverage area |

Issue `#268` must copy each reviewed geometry and its source provenance into a
separate territory-zone version. It must not make ownership depend directly on
the mutable lifecycle of an event-placement row. The copied geometry is an
immutable snapshot; later placement changes do not silently move a territory
boundary. Replacing a reviewed boundary requires a new territory-zone version
and retirement of the old version.

Each geometry must be a non-empty, valid `MultiPolygon` in SRID 4326. Active
territory zones cannot overlap. Gaps between zones are allowed and produce no
grant. A point on a boundary, or a reported accuracy envelope that reaches or
crosses a boundary, is ambiguous rather than inside.

The lifecycle is:

```text
pending_review -> active
pending_review -> retired
active         -> suspended
active         -> retired
suspended      -> active
suspended      -> retired
```

Only `active` zones issue grants, accept influence, settle ownership, or provide
an owner bonus. Suspending or retiring a zone closes its current ownership
period at the same authoritative timestamp and makes the zone unavailable. A
reactivated zone begins unowned with a fresh settlement window. Retirement is
permanent. Lifecycle changes preserve definitions, contribution decisions,
settlements, and ownership history.

## Location eligibility grants

A player who intends to contest a zone through the ranked queue submits:

- the intended active zone identifier;
- latitude and longitude;
- reported accuracy in metres; and
- the device acquisition timestamp.

Identity comes from the validated bearer token. Coordinates must be finite and
within valid geographic ranges, accuracy must be finite and non-negative, and
the claim may be no more than two minutes old. A future acquisition timestamp
returns the same neutral refresh path rather than eligibility. The
two-minute freshness value reuses the current provisional online location rule;
a future policy may change it without rewriting earlier grants.

PostGIS must establish all of these conditions:

1. the claimed point is inside the requested active zone;
2. the whole reported-accuracy envelope fits strictly inside that zone; and
3. no other active territory zone contains any part of that envelope.

An envelope crossing a boundary returns a neutral location-refresh response.
A valid point outside every active zone is simply not eligible. Overlapping
active-zone results are a server configuration failure, not a choice delegated
to the browser.

A successful decision creates a zone grant that expires five minutes after the
server decision time. The expiry never extends through queue heartbeat, status
reads, proposal creation, or client activity. A grant is bound to one player,
zone, policy version, and queue entry. It cannot be transferred or replayed into
another queue entry.

The territory subsystem does not persist the submitted latitude, longitude,
accuracy, or a path. Ordinary logs redact all location-claim fields. The private
grant stores only the player, zone, policy and decision versions, server issue
and expiry times, device acquisition time, use state, and safe outcome. This is
still coarse location data: it is never public and is automatically deleted no
later than 24 hours after expiry. A source match retains the zone and policy
snapshot needed for gameplay history, not the precise claim.

Account deletion immediately removes unused grants. Used grant identifiers may
remain only where needed to preserve referential integrity until their cleanup;
they must not preserve provider identity or precise location, and retained
shared gameplay history follows the project's profile-free actor policy.

## Match creation and grant expiry

Ordinary ranked play remains available without a territory grant and produces
no influence for a winner without a snapshotted zone. A player explicitly
joining as a zone contender binds their current grant to the queue entry. Each
participant may therefore have no zone or one zone, and two grants may refer to
different zones. The existing ranked queue still matches players by rating
rather than zone, so contest play does not reveal or narrow an opponent's
physical area.

Immediately before creating the live match, the API revalidates each supplied
grant belongs to the participant and queue entry, remains unused and unexpired,
and still targets an active zone under the snapshotted policy. It consumes each
valid grant and stores the corresponding participant zone and policy version
atomically with the ranked match and deck snapshots. A participant who joined
without a grant receives a `null` territory-zone snapshot.

If one grant expires or becomes unavailable during a proposal, that player is
removed and receives no decline cooldown. A still-eligible accepting player
returns to searching with the original queue-join timestamp and a fresh queue
lease. The removed player must submit another fresh location claim before
joining again. No match or influence exists before both players accept and the
ranked live match commits.

The match snapshot remains the location authority for its lifetime. The browser
does not submit another zone, location, or influence choice when acting or when
the match completes.

## Influence eligibility and limits

A completed ranked match produces one exactly-once territory decision for its
authoritative winner. A winner without a snapshotted zone receives a zero-point
`no_zone_grant` decision. An accepted decision contributes exactly `1`
influence to the winner's snapshotted zone when all of these are true:

- the match was created and completed as ranked in one ranked season;
- the winner had at least five previously settled ranked matches when this
  source match was created;
- the result is one of `defeat`, `abandonment_forfeit`,
  `voluntary_resignation`, or `account_deletion_forfeit`;
- the snapshotted territory zone is still active when the source match
  completes; and
- the winner has fewer than five accepted contributions for that zone in the
  current Johannesburg calendar day.

The fifth placement match does not contribute even though its settlement makes
the player established. The first eligible source is the next ranked match.
Losses, provisional wins, casual live matches, asynchronous PvP, CPU matches,
queue events, proposals, cancellations, and incomplete matches contribute
nothing.

The daily cap is per player and zone. A player physically eligible in two zones
may contribute up to five times in each on the same local day. The cap counts
accepted influence, not excluded decisions. There is no browser-supplied date;
the API derives `Africa/Johannesburg` calendar dates from database time.

A qualifying ranked completion records one immutable decision with either one
accepted point or zero points and a safe exclusion reason such as
`winner_provisional`, `zone_inactive`, or `daily_cap_reached`. The unique source
match and winner context prevents duplicate retries from creating another
decision. An excluded decision cannot later become accepted if the zone,
account, or cap changes.

The terminal match result, ranked rating settlement, territory decision, and
accepted influence row commit in the same database transaction. Failure rolls
the transaction back; retries converge on the persisted terminal result and
decision. Implementations must use one documented lock order across match,
rating, player, zone, cap, and contribution records.

An accepted contribution's authoritative timestamp is sampled only after the
transaction holds the zone's settlement lock. This ordering assigns every
concurrent contribution to exactly one settlement window. A trust restriction
created after the match began does not retroactively remove its influence, just
as it does not cancel or unrate the match. Existing trust policy still prevents
restricted players from entering future ranked play and evaluates completed
opponent patterns separately.

## Hourly settlement

Each ranked season has fixed hourly settlement windows in
`Africa/Johannesburg`:

```text
[HH:00:00, next HH:00:00)
```

A contribution exactly on the closing boundary belongs to the next window.
Workers may run after a boundary, but the persisted window times never shift
with worker delay, process restart, or deployment. Missed windows settle in
chronological order before a later window for the same zone.

For each active zone, settlement calculates accepted influence by player and
applies these rules:

1. Players with fewer than three points in the window cannot take ownership.
2. The qualified player or players with the highest count are the leaders.
3. If the current owner is among tied leaders, that owner retains the zone.
4. Otherwise, a tie uses the earliest accepted contribution in that window
   among the tied players, then stable internal player UUID.
5. If there is one leader, that player owns the zone.
6. If nobody qualifies, the current owner remains; an unowned zone remains
   unowned.

Only an active, non-deletion-pending account may become or remain owner at
settlement. Contributions from a player whose deletion began remain immutable
history but are excluded from ownership selection. The public display never
uses an internal UUID.

Every settlement records the zone and ranked season, policy version, half-open
window, immutable per-player totals, owner before and after, tie-break inputs,
input digest, expected and resulting state versions, and authoritative
settlement time. A retry with the same window returns the existing receipt. A
stale state version performs no partial update and retries from current state.

The current-owner projection is derived from committed ownership periods and
settlements. When ownership changes, the previous period closes and one new
period begins in the same transaction. Retaining the same owner does not create
a false transfer. Identical zone state and contribution ledgers must always
produce the same receipt and owner.

Contribution creation and settlement serialize on the same zone boundary. A
completion already holding the zone lock receives its timestamp and commits
before settlement reads the closing window. A completion waiting behind
settlement receives a timestamp after the lock and enters the next window. No
row can be silently omitted from both windows.

## Season closure and reset

Territory uses the ranked season attached to each source match. When the ranked
season enters `closing`, no new source match can begin, but already-created
matches may finish and create decisions for that season.

Complete hourly windows continue to settle while matches drain. After the last
ranked match settles, the territory close operation commits one final partial
window from the previous settled boundary through the authoritative territory
close time. It then:

1. closes every active ownership period;
2. archives final owners, settlement receipts, and contribution totals;
3. seals the season's territory state; and
4. leaves every active zone unowned for the next ranked season.

The ranked season cannot complete its close operation until territory
finalization succeeds. Both operations are idempotent and must use an explicit
cross-service finalization order. The next season starts with empty influence
windows; rating soft resets do not transfer territory influence or ownership.
Closed territory archives are immutable.

If no next ranked season is active, zones remain visible but unavailable and
unowned. Suspending or retiring a zone during season closing still excludes it
from further contribution and closes its ownership period without deleting the
season archive.

## Owner card bonus

The owner bonus is separate from influence and ranked rating. It does not make
the owner stronger in a ranked battle.

When an authenticated player starts an event challenge, the API resolves the
event's effective location: the current automatic-placement assignment when one
exists, otherwise the event's authored point. The attempt snapshots owner-bonus
eligibility only when:

- the effective point is inside one active territory zone;
- that zone currently belongs to the player;
- the event and challenge otherwise pass their normal eligibility checks; and
- the player has not already received an owner bonus on the attempt's bonus date.

The bonus date is derived once from the database-recorded challenge-start time
in `Africa/Johannesburg` and stored with the attempt snapshot. The browser
cannot provide or change it. A challenge started before midnight and completed
after midnight still uses its start date for the initial eligibility check,
the unique player/date decision, retries, and the final reward. Starting an
attempt does not reserve the bonus; concurrent eligible attempts on the same
date are resolved by the unique completion decision.

Later ownership, zone-lifecycle, or event-placement changes do not revoke an
attempt's snapshotted eligibility. They also cannot grant eligibility to an
attempt that began without it.

When that attempt completes with at least three correct answers, the normal
challenge finalization transaction awards one additional card if the daily
bonus remains unused. The server selects uniformly from active, non-evolved
Common definitions in the standard reward pool. Creature and Power definitions
participate without separate category or affinity weighting. Ordinary duplicate
ownership is allowed.

The bonus is limited to one card per player per challenge-start Johannesburg
date across all owned zones and events. A unique player/date decision prevents concurrent
challenge completions from awarding two bonuses. Completion, the ordinary
score-based reward, the owner-bonus decision, and the owned card commit
atomically; a retry returns the persisted card rather than rerolling.

If the player already used the daily bonus or scores below three, the ordinary
challenge completion and reward still proceed unchanged. The completed response
must distinguish an awarded owner bonus from `not_eligible`, `score_too_low`,
and `already_claimed` without exposing another owner or internal settlement
data. The existing catalogue requirement for an active Common reward definition
also protects this bonus.

Account deletion removes the bonus card with the player's other owned cards.
The anonymous bonus decision may remain with retained challenge history under
the existing deletion policy.

## Player-facing visibility and privacy

An authenticated zone discovery or detail response may expose:

- zone identifier, accessible name, geometry, and lifecycle status;
- ranked season and current settlement-window boundaries;
- current owner's safe Player Name;
- the three leading accepted influence counts for the current window, labelled
  by rank without player names or stable identifiers;
- aggregate current-window activity;
- the latest settlement outcome; and
- recent ownership periods and archived season results.

Top contributors order by accepted count descending, earliest accepted
contribution ascending, then internal player UUID. Neither names nor UUIDs are
returned for current-window contributors, even if the viewer is among them.
An authenticated private field may return only the viewer's own count, daily
accepted count, and remaining cap. Aggregate counts must not be accompanied by
match or grant details that could re-identify a contributor.

Current-window standings disclose activity in a zone but not another player's
identity or precise location. The named current owner reflects a committed
earlier settlement and can imply historical coarse zone participation; it does
not establish their current location. Responses never expose another player's
current location, grant, queue state, match,
opponent, deck, Auth0 identity, email, trust score, restriction, exclusion
reason, or contribution source ID. Exact location claims never appear in public
or owner history. A zone map must have an equivalent keyboard-accessible list,
and ownership or contest state cannot rely on colour alone.

Current owners resolve Player Name through the active local account; current
contributors remain anonymous. Account deletion immediately ends current
ownership and removes the player from viewer-private live state. Retained history displays
`Deleted player` through a profile-free actor key without changing historical
counts, settlement order, or ownership dates.

## Deterministic examples

### Accuracy envelope

A fresh claim whose point is in East Campus but whose accuracy circle crosses
the East/West boundary receives a neutral refresh result and no grant. The
browser cannot force East Campus by naming it in the request.

### Daily cap

An established player wins six qualifying ranked matches for West Campus on
one Johannesburg date. The first five decisions each record one point. The
sixth records zero with `daily_cap_reached`; it cannot become accepted after the
date changes.

### Incumbent tie

The owner and one challenger each record three points in a window. Both qualify,
but the owner retains the zone. If the zone were unowned, the player with the
earlier accepted contribution would win, with UUID used only for an exact
timestamp tie.

### Settlement boundary race

Settlement obtains the zone lock at `11:00:00`. A match-completion transaction
waiting for that lock samples its contribution time after settlement releases
the lock, so its point belongs to `[11:00, 12:00)` and is not lost from the
closed `[10:00, 11:00)` window.

### Retirement during a match

A match snapshots an active Arts and Community grant, but the zone retires
before the match ends. Rating settles normally. The territory decision records
zero influence with `zone_inactive`, and retirement history remains intact.

### Daily owner bonus

One player owns East and West Campus. Their first eligible three-correct event
completion awards one random Common bonus card. Another qualifying completion
for the same challenge-start Johannesburg date returns `already_claimed`, even
when it occurs in the other owned zone. An attempt started at 23:59 and
completed after midnight uses the 23:59 start date for both eligibility and the
unique reward decision; a retry after midnight cannot consume the next date's
bonus.

## Downstream implementation and verification

Persistence and services implementing this policy must verify at minimum:

- valid, non-overlapping, independently versioned PostGIS zone geometries;
- lifecycle transitions, reactivation as unowned, and immutable retirement;
- authenticated fresh claims, complete accuracy-envelope containment, ambiguous
  boundaries, five-minute expiry, one-time grant use, and location redaction;
- queue and proposal handling for expired, consumed, wrong-player, inactive-zone,
  and policy-version-mismatched grants;
- ordinary ranked play without a grant and no influence from missing grants,
  losses, provisional wins, non-ranked matches, incomplete matches, inactive
  zones, or a sixth daily win;
- exactly-once decisions and atomic rollback with terminal ranked settlement;
- calendar-day boundaries and concurrent cap enforcement across API instances;
- every hourly boundary, minimum threshold, incumbent tie, challenger tie,
  account deletion, no-activity window, and deterministic replay;
- concurrent contribution/settlement ordering and chronological worker catch-up;
- closing-season in-flight matches, final partial settlement, immutable archive,
  and unowned next-season reset;
- effective authored and automatically placed event locations for owner bonuses;
- three-correct, already-claimed, concurrent completion, retry, random-Common,
  duplicate-card, account-deletion, and cross-midnight bonus behavior; and
- anonymous top-three counts without contributor identity fields or grant
  details, viewer-private cap state, anonymised history, accessible
  alternatives, and absence of precise location, opponent, and trust leakage.

The later OpenAPI contract must accept only player intent and untrusted location
claims. The database guide must document spatial indexes, immutable ledgers,
uniqueness constraints, transaction boundaries, lock ordering, cleanup, and
rebuild procedures. Operational evidence must prove hourly and season-final
workers against concurrent contributions without attaching precise locations.

## Deferred rules

`territory-v1` deliberately does not define teams or factions, multi-party zone
battles, manual player-selected influence values, influence purchases, trading
effects, permanent progression points, rating modifiers, battle-stat bonuses,
more than three zone geometries, real-world access rights, or unbounded location
tracking. Those require separate stakeholder decisions and a new policy version.

The preceding document was generated and edited with the assistance of:
Codex[GPT-5.6 Sol], ChatGPT-Web[GPT-5.6 Sol].

This account-deletion update was edited with assistance from Codex[GPT-6].

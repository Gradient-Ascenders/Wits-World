---
title: 'Ranked ratings, matchmaking and seasons'
---

# Ranked ratings, matchmaking and seasons

## Status and purpose

This document is the issue `#264` policy contract for Advanced-tier ranked live
player-versus-player competition. It defines the first rating, matchmaking, and
season rules before database or API implementation begins. It does not claim
that ranked queues, ratings, standings, or season automation are implemented or
deployed.

Issue `#263` may persist the policy, seasons, queue state, proposals, ratings,
settlements, and archives described here. Issue `#266` may then implement the
server-owned queue and settlement services, and issue `#269` may present those
capabilities to players. Ranked matches must use the existing
[live PvP authority contract](../architecture/live-pvp-api-contract.md); this
policy does not create a second battle engine.

## Authority and terminology

The API and PostgreSQL are authoritative for eligibility, queue membership,
wait duration, search range, candidate selection, acceptance deadlines, season
state, match classification, terminal results, rating calculations, standings,
and resets. A browser submits only player intent and an owned deck selection.
It cannot submit an authoritative rating, range, opponent, season, match result,
rating delta, rank, or settlement status.

The initial immutable policy version is `ranked-v1`. A ranked match snapshots
its policy version, season, both pre-match ratings, both provisional-match
counts, and both rating factors when the match is created. A later policy
version changes only future matches and seasons; it never recalculates a
committed settlement or archived standing.

Terms used by this policy are:

- **seasonal rating**: the integer competitive rating used only for ranked live
  PvP during one season;
- **provisional player**: a player with fewer than five settled ranked matches
  in the current season;
- **queue entry**: one player's server-owned request to find a ranked opponent;
- **proposal**: a temporary pairing that both players must accept before a live
  match exists;
- **ranked live match**: a live PvP match created by an accepted ranked proposal
  and bound to one active or closing season;
- **settlement**: the exactly-once transaction that records the terminal ranked
  result and both rating changes; and
- **season archive**: the immutable final ratings and standings captured after
  every ranked match in a closing season has settled.

The permanent points described in
[Points, achievements and rankings](player-progression-rules.md) are a separate
progression measure. Ranked rating is seasonal, non-spendable, and never added
to or derived from progression points.

## Ranked eligibility

A player may join the ranked queue only when all of these conditions are true
at the authoritative server check:

- the local application account is active and authenticated;
- one ranked season is `active`;
- the selected deck exists, belongs to the player, and satisfies the current
  server-side deck rules;
- the player has no other active ranked queue entry or proposal;
- the player is not already participating in an active live match; and
- no active `new_competitive_match_hold` applies under the
  [longitudinal trust policy](longitudinal-trust-policy.md).

The same eligibility, deck ownership, deck validity, account, restriction, and
season checks run again immediately before match creation. The match snapshots
both decks only after that final validation. A player may edit a selected deck
while searching, but doing so risks removal when the deck no longer validates.
An invalid player's proposal is cancelled; the still-valid player returns to
search using the original queue-join time and a fresh lease.

CPU matches and asynchronous PvP are never rated by `ranked-v1`. A live match
created outside the ranked queue is also unranked. A match cannot be converted
to ranked after creation, even if both participants agree or its result would
otherwise be eligible.

## Queue lifecycle and leases

A player has at most one queue entry across all API instances. Duplicate join
requests for the same player and selected deck return the existing authoritative
entry instead of creating another row. A request naming a different deck while
already queued is rejected until the player cancels or the existing entry ends.

The queue lifecycle is:

```text
searching -> proposed -> matched
searching -> cancelled
searching -> expired
searching -> restricted
searching -> invalid_deck
proposed  -> searching for a still-eligible accepting player
proposed  -> cooldown for a declining, timing-out, or invalid player
```

Each searching entry has a 30-second server-owned lease. The client should send
an authenticated heartbeat at least every 10 seconds while it still intends to
search. A status read does not renew the lease. Expiry removes the entry and
cannot be reversed by a late heartbeat; the player must join again with a new
queue time.

Cancelling a searching entry is immediate and applies no cooldown. A manual
cancel while a proposal is awaiting acceptance is a decline and applies the
proposal cooldown. Once both players accept and the live match is committed,
queue cancellation is no longer available; leaving becomes a rated live-match
resignation or timeout under the live PvP rules.

The API never returns a public queue list, candidate ratings, or another
player's queue state. Before both players accept, the proposal exposes only an
opaque proposal identifier, the acceptance deadline, and the caller's own
state. Opponent identity and deck information remain hidden until the match is
created.

## Search range and deterministic pairing

Search begins at a rating difference of plus or minus 100 and widens by 50
points after every complete 15 seconds of authoritative wait time, to a maximum
of plus or minus 400:

```text
range(wait_seconds) = min(400, 100 + 50 * floor(wait_seconds / 15))
```

The wait begins at the immutable original queue-join timestamp. Requeueing the
accepting player after another player fails a proposal preserves that timestamp.
Disconnecting does not pause wait time, but an expired lease ends it. A pair is
eligible only when the absolute rating difference fits inside **both** players'
current ranges. This prevents a newly joined player from being pulled
immediately into an older player's much wider search.

At each claim, the service uses row locking or an equivalent concurrency-safe
database operation and applies this deterministic order:

1. Select the oldest eligible searching entry as the anchor.
2. Exclude the same player, expired entries, ineligible accounts, invalid
   decks, restricted players, and players already claimed elsewhere.
3. Keep only candidates whose rating difference fits both search ranges.
4. Prefer the smallest absolute rating difference.
5. Break an equal difference by the candidate's oldest queue-join timestamp.
6. Break any remaining tie by stable opaque player UUID.

The system cannot pair a player with themselves. Concurrent workers cannot
claim one entry for two proposals, and creating a proposal atomically removes
both entries from ordinary searching. `ranked-v1` does not hard-block repeat
opponents; only completed matches feed the proportionate repeated-opponent
signals in the trust policy.

### Search examples

| Authoritative wait | Search range |
| ------------------ | -----------: |
| 0 to 14.999 s      |          100 |
| 15 to 29.999 s     |          150 |
| 30 to 44.999 s     |          200 |
| 45 to 59.999 s     |          250 |
| 60 to 74.999 s     |          300 |
| 75 to 89.999 s     |          350 |
| 90 s and later     |          400 |

At exactly 15 seconds, a player's range is 150. If that player can search 150
points but a newly joined candidate can search only 100, a 120-point gap is not
yet eligible because the pair must satisfy both ranges.

## Proposal acceptance

A proposal gives both players 20 seconds from one server-owned creation time to
accept. Acceptance is idempotent for the same player and proposal. It does not
extend the deadline. At the deadline, a missing acceptance is a timeout.

When both players accept in time, the API locks and revalidates the proposal,
players, decks, restrictions, season, and absence of another active match. It
then creates one ranked live match, snapshots both decks and rating inputs,
consumes the proposal, and commits those changes atomically. A retry returns the
same persisted match rather than creating another one.

When only one player accepts:

- the accepting player returns to searching with the original queue-join time
  and a fresh 30-second lease;
- the declining or timing-out player leaves the queue and receives a 30-second
  cooldown before joining again; and
- no match or rating change is created.

When neither player accepts, both receive the 30-second cooldown. A manual
decline has the same outcome as an acceptance timeout. A system cancellation,
including a season entering `closing`, applies no cooldown. If searching is
still available after a system cancellation, eligible players may be returned
with their original join times; season closure instead removes them because no
new ranked match may start.

## Rating model

Every player starts a first ranked season at `1000`. Ratings are whole numbers,
have a lower bound of `100`, and have no upper bound in `ranked-v1`. The first
five settled ranked matches in each season are provisional. The fifth match
still uses the provisional factor; the player becomes established only after
that settlement commits. The resulting value is the player's placement rating.
There is no retrospective placement recalculation.

The Elo-style calculation is:

```text
expected = 1 / (1 + 10 ^ ((opponent_rating - own_rating) / 400))
score = 1 for a win, 0 for a loss
K = 40 when the player has fewer than 5 prior settled matches
K = 24 otherwise
unbounded_delta = round(K * (score - expected))
new_rating = max(100, old_rating + unbounded_delta)
applied_delta = new_rating - old_rating
```

`round` means nearest integer with an exact half rounded away from zero. The
calculation uses deterministic decimal or equivalent tested numeric semantics,
not browser floating-point output. Each player's K factor is selected
independently, so a provisional player may gain or lose a different number of
points from an established opponent. The persisted ledger records the applied
delta after enforcing the 100-point floor.

At equal ratings, an established winner gains 12 and the loser loses 12. At
equal ratings, a provisional winner gains 20 and the provisional loser loses 20. A player's fifth result uses K=40; their sixth uses K=24.

## Rated outcomes and atomic settlement

Only a terminal match created as a ranked live match may alter rating. These
authoritative completion reasons settle as a win and loss:

| Completion reason          | Winner                     | Loser                                       |
| -------------------------- | -------------------------- | ------------------------------------------- |
| `defeat`                   | Surviving participant      | Defeated participant                        |
| `abandonment_forfeit`      | Non-abandoning participant | Participant reaching the live timeout limit |
| `voluntary_resignation`    | Non-resigning participant  | Resigning participant                       |
| `account_deletion_forfeit` | Remaining participant      | Deleting participant                        |

A pre-match cancellation, queue expiry, failed acceptance, system
cancellation, invalid deck, or trust restriction never changes rating. Current
live battle rules have no draw result. If an unsupported draw or ambiguous
terminal result appears, settlement fails closed and the match requires repair;
the service must not invent a winner or apply a hidden 0.5 score. Supporting
draws later requires a new reviewed policy version.

The terminal match result, both rating ledger entries, both updated seasonal
ratings, both match counts, and the settlement receipt commit in the same
database transaction. A finalization failure throws and rolls back the terminal
transition. Retrying the same terminal action or worker task converges on the
persisted settlement and cannot apply rating twice. Ratings are locked in a
stable player-ID order so opposite concurrent operations cannot deadlock by
choosing participant order differently.

A ranked match keeps its original season while that season is closing. A trust
hold created after the match begins does not cancel or unrate it. Account
deletion may complete it through the existing deletion-forfeit path; retained
rating history follows the existing anonymous account-deletion boundary.

## Seasons and soft reset

An operator creates each season with an accessible name and intended start.
`ranked-v1` seasons run for 28 full days using authoritative timestamps. Their
lifecycle is:

```text
scheduled -> active -> closing -> closed
```

Only one season may be `active` or `closing`. A scheduled season activates at
its intended start only when no previous season is still active or closing. If
the previous season is still draining, activation waits; the new season's
28-day active period begins at its actual activation time rather than being
shortened.

At the 28-day boundary, the season enters `closing` atomically and no new queue
entry, proposal, or ranked match may be created for it. Searching entries and
unaccepted proposals are cancelled without rating changes or cooldowns. Ranked
matches that already exist continue under their normal server deadlines until
they reach a terminal result and settle.

After the final ranked match settles, the close operation:

1. snapshots every established player's immutable final rank, rating, wins,
   losses, and match count against their stable local player reference without
   copying Player Name into the competitive result;
2. seals the season archive and settlement totals;
3. marks the season `closed`; and
4. activates the next due scheduled season, if one exists.

Close and reset operations are idempotent and protected against concurrent
workers. A closed season, archive row, settlement, or reset receipt is
immutable. Re-running a worker returns the existing result.

Every retained player carries a soft-reset rating into the next season:

```text
next_rating = max(100, 1000 + round((previous_rating - 1000) * 0.5))
```

The reset uses the same half-away-from-zero rule as settlement. A rating of
1240 resets to 1120; a rating of 760 resets to 880. The reset applies even when
the player was provisional or inactive in the closing season, preventing a
player from avoiding seasonal convergence by not queueing. A player with no
prior seasonal rating starts at 1000. Match count and provisional status reset,
so every player must complete five placements in each new season.

## Current standings and archives

The authenticated player can always read their own current rating, provisional
status, settled match count, and progress toward five placements. A provisional
rating is private to that player and is excluded from public current standings
until the fifth settlement commits.

Public standings contain only active, non-deletion-pending established players
and safe display fields: Player Name, rating, rank, wins, losses, and settled
match count. Email, Auth0 subject, queue state, deck, opponent proposal,
restriction details, and internal ledger identifiers are excluded.

Rows order by rating descending, the timestamp at which that rating was first
reached ascending, and stable internal player UUID ascending. Equal ratings use
competition ranking (`1, 2, 2, 4`); the internal UUID is only a pagination
tie-breaker and is never returned. Bounded pagination uses a server-issued
cursor or an equally stable snapshot mechanism so concurrent settlements do not
duplicate or omit rows within one traversal.

Closed-season archives preserve immutable competitive facts: rank, rating,
wins, losses, match count, and season result. Player Name is presentation data,
not part of that immutable result. Archive responses resolve the current safe
display value through the linked local player record. Once deletion begins, the
existing anonymised tombstone therefore renders `Deleted player`; the API must
not return a former name or any retained name snapshot. This presentation
change does not recompute, reorder, or rewrite the archived competitive facts.
Normal Player Name changes likewise affect only presentation. Deleted-player
history remains subject to the project's approved anonymous tombstone and
retention rules.

## Trust, privacy, and safe failures

The `new_competitive_match_hold` restriction is enforced when joining the
queue, accepting a proposal, and creating a match. It uses a neutral response
and must not disclose a trust score, signal, reviewer note, or suspected
opponent. A restriction does not remove an existing rating or archive, and it
does not cancel or forfeit a match created before the restriction committed.

Only completed PvP results are eligible for the trust policy's repeated-opponent
signals. Queue encounters, proposals, declines, and cancellations are not
matches and do not contribute. Matchmaking itself does not use precise
location, movement evidence, challenge answers, email, or Auth0 identity.

Stale heartbeats, accepts, cancels, and settlement requests return the current
safe authoritative state. Missing or unavailable proposal and match identifiers
use neutral errors where necessary to avoid exposing another player's activity.
Logs exclude bearer tokens, precise identity-provider data, deck contents,
trust evidence, and private candidate lists.

## Downstream implementation and verification

Persistence and services implementing this policy must verify at minimum:

- one active or closing season and one active queue/proposal per player;
- first-season rating, soft reset, and five-match provisional transitions;
- deterministic expected score, independent K factors, rounding, and rating
  floor behavior;
- exactly-once settlement under retries and concurrent terminal requests;
- rollback when either rating update or terminal match persistence fails;
- no rating change for CPU, asynchronous, casual live, cancelled, declined, or
  unstarted matches;
- queue lease expiry, idempotent join, explicit cancel, and duplicate/self-pair
  prevention;
- every widening boundary, the plus-or-minus-400 cap, and the requirement that
  both players' bands admit the pair;
- deterministic candidate ordering and concurrency-safe proposal claims;
- both-accept creation, one-accept requeue, both-fail cooldown, late accepts,
  and season-close cancellation;
- deck, account, active-match, and trust revalidation before match creation;
- closing-season drain, immutable archive, idempotent reset, and delayed next
  season activation;
- private provisional state, public established standings, tie ranks, stable
  pagination, and player isolation;
- account deletion preserving archived rank, rating, result, and aggregate
  counts while every archive response replaces the former Player Name with
  `Deleted player`; and
- safe error and logging behavior without opponent, trust, or identity leakage.

The OpenAPI contract, database guide, service documentation, player journey,
and operational runbook must link to `ranked-v1` when those capabilities are
implemented. Deployment evidence must cover at least two authenticated players
passing from queue through acceptance, live completion, atomic settlement, and
the resulting standings update.

## Deferred rules

`ranked-v1` deliberately does not define divisions, leagues, placement
shortcuts, rating decay, tournament brackets, party queues, regional pools,
paid competitive advantages, opponent blocking, rematch buttons, CPU rating,
asynchronous rating, or draw scoring. Those require separate stakeholder
decisions and a new policy version rather than silent implementation defaults.

The preceding document was generated and edited with the assistance of:
Codex[GPT-5.6 Sol].

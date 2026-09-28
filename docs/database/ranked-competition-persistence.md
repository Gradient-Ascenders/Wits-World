---
title: 'Ranked competition storage'
---

# Ranked competition storage

## Scope

Migration `0047_persist_ranked_competition.sql` adds the issue `#263` database
foundation for the approved [ranked-v1 policy](../requirements/ranked-competition-policy.md).
Issue `#266` adds the queue routes, rating calculations, matchmaking worker,
season-close automation, and private ten-minute standings snapshots in
`0050_create_ranked_standings_snapshots.sql`. Migration `0051` permits an
accepted player to withdraw while a proposal still awaits the other player.
Migration `0052` records the 30-second cooldown when final validation rejects
an invalid proposed player. Migration `0053_persist_contested_territory.sql`
adds a separate persistence boundary that may derive exactly one territory
contribution decision from an authoritative ranked settlement without changing
its Elo result. Territory eligibility, match-to-zone snapshots, settlement
calculation, workers, and player UI remain separate runtime work. The existing
[live PvP match](live-pvp-persistence.md) remains the only battle authority.

## Relationships and authority

| Relation                                           | Responsibility                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `private.ranked_policy_versions`                   | Immutable `ranked-v1` constants and policy identity.                                                                            |
| `public.ranked_seasons`                            | Scheduled, active, closing, and closed lifecycle; one active or closing at a time.                                              |
| `public.ranked_player_season_ratings`              | One current rating, wins, losses, match count, and initial/soft-reset seed per user and season.                                 |
| `private.ranked_queue_entries`                     | Selected owned deck while active, immutable original join time, 30-second searching lease, status, and retained player history. |
| `private.ranked_matchmaking_proposals`             | A 20-second acceptance window shared by exactly two players.                                                                    |
| `private.ranked_matchmaking_proposal_participants` | Each player's queue claim, acceptance decision, and any 30-second decline cooldown.                                             |
| `private.ranked_matchmaking_receipts`              | One accepted proposal bound to one live match, season, and policy version.                                                      |
| `private.ranked_match_rating_inputs`               | Both immutable pre-match rating, provisional count, and K-factor snapshots.                                                     |
| `private.ranked_rating_settlements`                | One terminal match result and settlement receipt per ranked live match.                                                         |
| `private.ranked_rating_ledger_entries`             | Immutable per-player pre/post rating, match count, expected score, and applied delta.                                           |
| `public.ranked_season_standing_archives`           | Immutable established-player rank and result facts, without a Player Name snapshot.                                             |
| `private.ranked_season_close_receipts`             | Exactly one season-close result and reconciled archive/settlement counts.                                                       |

`public` is a PostgreSQL schema, not permission to expose ratings or archives
via a public API. The player-facing API must derive player identity from the
validated token, return only that player's provisional rating/queue state, and
exclude provisional, deleted, or deletion-pending users from public current
standings. Closed archives resolve the **current** safe Player Name via the
linked `players` row; account deletion removes that player's personal archive
and rating rows. Shared results display `Deleted player`. No queue, deck,
proposal, email, Auth0 identity, or precise location belongs in the archive.

Queue history survives saved-deck deletion and account deletion without
retaining a restrictive reference to a removed deck. An active searching or
proposed queue requires an owned deck and blocks its deletion. Once the queue
is terminal, deleting that deck clears only `selected_deck_id` through the
composite foreign key, even for an active player. Queue identity, timestamps,
status, proposal linkage, and the player reference remain immutable. Account
deletion first cancels active queue/proposal state, then removes owned decks;
the retained rows refer to a profile-free actor key.

## Concurrency and transactions

The partial unique indexes enforce one active/closing season and one searching
or proposed queue entry per player across API instances. The searching index
orders claims by `(season_id, original_joined_at, id)`; leases have a separate
expiry index. The issue `#266` service locks candidate entries in a consistent
order with `FOR UPDATE SKIP LOCKED`, rechecks each player's account, deck,
restriction, season, lease, and active-match state, then moves **both** entries
to `proposed` and creates one proposal with its two
participant rows in the same transaction. A losing concurrent claim must
return the authoritative current state, never mint another proposal. Response,
requeue, and matched receipt updates likewise commit together. A mere queue
status read must not renew its lease.

Match creation consumes both accepted entries, creates the normal live match
and snapshots, and inserts the matchmaking receipt and two rating input rows
atomically. Deferred checks require two accepted proposal participants and two
match participants with rating inputs equal to their current seasonal state.
Once created, a ranked match retains its original season and `ranked-v1`
snapshot even after the season enters `closing`; an ordinary live match with
no receipt is never ranked.

Terminal live-match completion and rating settlement must share **one**
database transaction. Lock the match and both player ratings in stable ID
order; use the live result, snapshotted opponents/ratings/counts and the
approved Elo formula to write both ledger entries, increment both current
ratings, and create one match-keyed settlement receipt. The deferred check
rejects a nonterminal or mismatched winner/reason, a missing ledger side, an
invalid expected score or delta, and current ratings not backed by that
ledger. A unique settlement key prevents replay from applying ratings twice;
the runtime must return the persisted receipt for identical retries. Any
failure rolls back the live terminal transition as well as both rating
updates. A deferred guard rejects any ranked live-match completion without a
settlement in the same transaction; issue `#266` integrates settlement
inside the existing live completion coordinator. CPU, async, and casual live
matches cannot be linked to a ranked settlement without an accepted proposal
and match receipt.

For season closure, cancel remaining queue/proposal state, drain ranked
matches, snapshot established users' competition ranks, insert one close
receipt and change the season to `closed` in one transaction. Deferred checks
reject missing settlements, active queue/proposals, incomplete archives,
incorrect competition ranks, or mismatched totals. An active season is exactly
28 days from actual activation; waiting scheduled seasons do not silently
shorten their active period. When populating the next season, carry the
previous closed season's rating with the reviewed soft-reset rule or seed 1000
for a new player; match counts and provisional status start over. Closed
season rows, archived results, ledger entries, snapshots, and receipts cannot
be mutated or deleted.

## Indexes and privacy

The schema indexes searching claims, queue lease expiry, proposal deadlines,
player queue and ledger history, established current standings, archived
standings, player season history, and closed-season browsing. Indexed public
standings still require a server-enforced bound and stable pagination. No raw
location, trust evidence, accepted trivia answer, bearer token, or opponent
candidate list is stored by this migration. Queue and proposal internals
remain in `private` with public grants revoked. Retained results use stable
profile-free actor keys after account deletion.

Before account-deletion cleanup removes owned decks, it cancels any searching
queue and any awaiting proposal involving the player in the same transaction.
Both proposed queue entries become terminal and pending proposal responses
become system-cancelled; already accepted responses remain historical facts.
The other player's deck is untouched. A failed cleanup rolls back the queue,
proposal, deck, and identity changes together.

## Deployment and verification

Apply migrations `0047`, `0050`, `0051`, and `0052` through the guarded
[database release procedure](database-release-procedure.md). They are additive,
do not backfill historical casual live matches or automatically create a
season. The API adds ranked routes and a configurable worker interval. After
application, correct defects with a **new** migration rather than editing a
recorded checksum. An operator must still schedule a season before ranked play
becomes available; see [ranked operations](../deployment/ranked-operations.md).

`apps/api/tests/ranked-persistence.integration.test.ts` creates a disposable
test database, upgrades from the preceding migration set, verifies migration
reruns, tests queue and proposal concurrency, runs account deletion against
ranked queue history, completes real live-match rows with paired rating
settlements, and checks closed archive immutability and soft reset. These are
test-database checks, not evidence of a production
migration, player acceptance, or a deployed ranked match.

The territory persistence integration suite creates genuine ranked settlement
fixtures before testing source-result uniqueness so territory history cannot be
seeded from a second or fabricated battle authority. See
[Contested-campus territory persistence](contested-campus-territory-persistence.md).

## AI declaration

This page and the issue `#263` implementation were drafted and reviewed with
assistance from Codex[GPT-5.6 Sol], Codex[GPT-5] (issue `#266` update), and
ChatGPT-Web[GPT-5.6 Sol] (issue `#268` persistence update).

This account-deletion update was edited with assistance from Codex[GPT-6].

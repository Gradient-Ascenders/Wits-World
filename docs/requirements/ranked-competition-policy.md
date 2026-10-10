---
title: 'Ranked competition'
description: Ranked eligibility, matchmaking, placement matches, seasonal ratings, standings, and resets.
---

# Ranked competition

**Live Ranked** at `/matches/live` matches players by seasonal rating. Only
battles created through the ranked queue affect that rating. CPU, asynchronous,
and casual live battles are unranked; an existing match cannot be converted to
ranked later.

For the play controls, see [Player battles](player-asynchronous-pvp-journey.md#live-ranked-battles).
Combat and decision deadlines are covered by [Battle rules](battle-rules.md).
This page describes the current `ranked-v1` competition rules.

## Ranked eligibility

Joining requires an authenticated, active account, an active season, and a legal
saved deck you own. You can have only 1 active ranked search or proposal and
cannot join while already playing a live match. An effective competitive-play
hold also blocks new ranked entry.

The server rechecks eligibility and the selected deck before starting the
match. Editing a deck while searching can make it invalid; cancel the search
before choosing a different deck. A restriction applied after a match starts
does not cancel that match or remove its rating effect.

## Matchmaking and acceptance

Search begins with opponents within **100 rating points** and expands by
**50 points every 15 seconds**, up to **400 points**. The gap must fit both
players' current search ranges. For example, a 120-point gap is not eligible
while either player still has a 100-point range.

The oldest eligible search is considered first. The server prefers the closest
rating, then the longest-waiting opponent. Matchmaking does not use your precise
location or require both players to contest the same territory.

| Queue event                                       | Result                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Opponent found                                    | Both players have **20 seconds** to accept the proposal.                                   |
| Both accept                                       | Eligibility is rechecked, both decks are snapshotted, and the live match starts.           |
| You accept but the opponent declines or times out | You return to searching with your original wait time.                                      |
| You decline or miss acceptance                    | You leave the queue with a **30-second cooldown**.                                         |
| You cancel while searching                        | Search ends without a cooldown. Cancelling a pending proposal instead counts as declining. |
| Search expires or the season closes               | No match starts and no rating changes. Season closure adds no cooldown.                    |

Keep the lobby connected while searching. The browser renews a **30-second
search lease**; an expired search must be started again. Opponent identity and
deck information stay hidden during proposal acceptance.

## Rating and placements

Your first-season rating starts at **1000** and cannot fall below **100**.
The first **5 completed ranked matches each season** are placements: your
rating changes during them, but remains private until all 5 are completed.
The resulting rating appears in public season standings.

Rating uses an Elo-style calculation. A win against a stronger opponent earns
more than a win against a weaker opponent; a loss against a weaker opponent
costs more. Adjustments use a factor of **40 during placements** and **24
afterwards**. The match completing your placements still uses 40.

At equal starting ratings, before applying the minimum-rating limit:

| Your status at match start | Win | Loss |
| -------------------------- | --: | ---: |
| In placements              | +20 |  −20 |
| Placements complete        | +12 |  −12 |

Each player's factor is independent, so their changes need not be equal and
opposite. The server rounds adjustments to whole numbers, with exact halves
rounded away from 0.

For a starting rating `R` and opponent rating `O`, the calculation is:

```text
expected = 1 / (1 + 10 ^ ((O - R) / 400))
score = 1 for a win, 0 for a loss
change = round(K × (score - expected))
new_rating = max(100, R + change)
```

### Rated outcomes

Defeating the opponent, voluntary forfeit, reaching the live timeout limit,
and account-deletion forfeit all produce a rated win and loss. There are no
draws in the current battle rules.

Cancelled or expired searches, failed acceptance, invalid decks, and system
cancellations before a match starts do not change rating. Watching a match does
not change the spectator's rating.

## Standings and archives

Open **Standings** in Live Ranked to view Player Name, rank, rating, wins,
losses, and completed-match count. Only active players who have completed their
placements appear. The lobby shows your own provisional rating and remaining
placements before you qualify.

Higher ratings rank first. Equal ratings share a rank, such as `1, 2, 2, 4`;
tied rows are ordered by when that rating was reached. Profile visibility does
not control inclusion in ranked standings.

Closed seasons archive final standings for players who completed placements.
Archived competitive facts are not recalculated by a later rule change.
Account deletion removes personal ranked data; required shared results follow
the [retention rules](../database/account-deletion-retention.md) and use
**Deleted player** where a historical participant must be displayed.

Competition is a single seasonal leaderboard. Named leagues, divisions,
tournaments, and rating decay are not currently part of these rules.

## Seasons and soft reset

Each season has a name and a scheduled start, with **28 days of active play**
from its actual activation time.

| State     | What happens                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------- |
| Scheduled | Waiting for its start and for the previous season to finish.                                    |
| Active    | Players can search, accept proposals, and start ranked matches.                                 |
| Closing   | New searches and proposals stop; existing matches finish and settle in their original season.   |
| Closed    | Final standings and territory results are archived. The next due scheduled season can activate. |

Only 1 season can be active or closing. If the previous season is still closing,
the next season waits and still receives its full 28-day active period. A new
season does not start automatically without a scheduled successor.

Ratings move **halfway back toward 1000** for the next season:

```text
next_rating = max(100, 1000 + round((previous_rating - 1000) × 0.5))
```

| Previous rating | Next-season rating |
| --------------: | -----------------: |
|            1240 |               1120 |
|            1000 |               1000 |
|             760 |                880 |

The reset also applies to provisional or inactive players with a retained
previous-season rating. Players with no previous rating start at 1000. Match
counts, wins, and losses reset, and everyone completes 5 placements again.
Permanent progression points and achievements do not reset with the season.

## Territory participation and progression

Territory participation is optional and does not change matchmaking or rating
calculations. [Territory rules](contested-campus-zone-policy.md) explain how to
join, which wins contribute, and how ownership, bonuses, and territory resets work.

Ranked results do not award permanent progression points. Those points have
separate [progression rules](player-progression-rules.md) and an all-time/monthly
leaderboard at `/leaderboard`.

## How it works

The server owns pairing, deadlines, rating changes, standings, and season state.
Each ranked match saves its season, policy version, and both players' starting
rating and placement status. Completion, both rating updates, and any territory
contribution decision commit together; retries cannot settle them twice.

Requests, responses, and recovery are documented in the
[ranked API](../architecture/ranked-matchmaking-api-contract.md).
[Ranked storage](../database/ranked-competition-persistence.md) explains saved
competitive records and settlement.

---

This page was prepared and edited with assistance from Codex[GPT-5.6 Sol],
Codex[GPT-5], and Codex[GPT-6].

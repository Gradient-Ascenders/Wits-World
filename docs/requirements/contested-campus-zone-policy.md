---
title: 'Territory rules'
description: Contest campus zones through ranked wins, earn influence, and receive owner card bonuses.
---

# Territory rules

Campus territories connect ranked battles with exploration. Eligible wins add
influence to a zone; hourly results decide its owner. Owners can earn an extra
card from challenges in their zone. Ownership is an in-game status and grants
no rights over campus property.

## Browse territories

Open **Explore → Territories** to browse **East Campus**, **West Campus**, and
**Arts and Community**. Select a zone on the map or in the list to see:

- its status, current owner, and settlement time;
- the current hour's activity and anonymous leading influence counts;
- your influence this hour, today's accepted influence, and remaining daily allowance;
- ownership history and archived season results.

The map and list show the same zones. Map boundaries are approximate; the server
checks location eligibility when you join a contest.

## Contest a zone

1. Open **Live Ranked** at `/matches/live` and review your deck.
2. Enable **Contest territory** and choose **Find territory battle**.
3. Allow the browser to obtain your location. It detects the zone, and the server
   checks whether you are sufficiently inside it.
4. Accept a proposed battle and play normally. Your zone is saved when the match
   starts; you do not need to submit another location during the battle.

Leave **Contest territory** off to play ordinary ranked battles without a
location claim. Opponents are matched by rating and may contest different zones
or none. Territory participation does not change the rating calculation or
battle rules. See [Player battles](player-asynchronous-pvp-journey.md#live-ranked-battles)
for battle controls and [Ranked competition](ranked-competition-policy.md) for
queue, placement, and rating rules.

## Location eligibility grants

The location reading must be no more than **2 minutes old**. Your reported
position and its entire accuracy area must fit strictly inside an active zone.
A reading touching or crossing a boundary is insufficient, even when the map
marker appears inside. Refresh your location or move farther inside the zone.

An accepted reading creates a private eligibility grant lasting **5 minutes**.
It belongs to your current queue entry, cannot be reused, and must still be
valid when the match starts. Keeping the lobby open does not extend it.

If the grant expires or the zone becomes unavailable before the match starts,
your entry is removed without a decline cooldown. Obtain a fresh reading and
join again. A still-eligible opponent who accepted returns to searching with
their original waiting time.

Only active zones accept contests. Suspending or retiring a zone ends its
current ownership; reactivation starts it unowned. Retirement is permanent.

## Influence eligibility and limits

Each eligible ranked win adds **1 influence** to your saved zone when:

- you had already completed **5 ranked matches in that season before this match started**;
- your account and saved zone are still active at completion;
- you have not reached **5 accepted influence per zone that day**.

Your 5th placement match cannot contribute; a match started after those
placements can. Wins by defeating an opponent or by an opponent's forfeit count
when the other conditions hold.

Losses, unfinished matches, wins without a saved zone, CPU battles, async PvP,
and casual live battles add no influence. A ranked win can still change your
rating when it adds no influence.

The daily cap uses the match's recorded contribution date in
**Johannesburg time**, and applies separately to each zone. Only accepted
influence uses the allowance. An excluded result stays excluded after midnight
or after a zone reopens.

## Hourly settlement

Ownership is decided from accepted influence in each Johannesburg clock hour,
such as **10:00–11:00**. Influence recorded exactly at 11:00 belongs to the next
hour. Totals from earlier hours do not count toward taking ownership this hour.

At settlement:

1. A player needs at least **3 influence in that hour** to qualify.
2. The qualified player with the highest total takes ownership.
3. If the current owner ties for the highest total, they keep the zone.
4. Otherwise, tied leaders are ordered by their earliest accepted contribution
   in the hour, then a stable internal identifier if the timestamps also tie.
5. If nobody qualifies, the current owner remains, or the zone stays unowned.

Only active accounts can own a zone. Deleting an account ends its ownership.
For example, an owner and challenger with 3 influence each tie, so the owner
keeps the zone. A challenger with 4 takes it from an owner with 3.

The displayed owner comes from the latest saved settlement. Delayed processing
does not shift the hourly boundaries; missed hours are settled in order.

## Season closure and reset

Territories follow [ranked seasons](ranked-competition-policy.md#seasons-and-soft-reset).
Already-started battles can finish while a season closes, and eligible wins
still contribute to that season. After the last match settles, a final partial
window is settled and the season's territory results are archived.

The next season begins with **unowned zones and fresh influence totals**.
Ownership and influence do not carry over with the rating reset. Without an
active ranked season, zones remain visible but unavailable to contest.

## Owner card bonus

Start a challenge whose event is inside an active zone you currently own, then
finish with **at least 3 correct answers** to receive **1 extra Common card**.
The event's current effective location is used, including automatic placement.
Normal [challenge eligibility and rewards](player-challenge-journey.md) still apply.

The bonus has these rules:

- **1 card per player per Johannesburg challenge-start date**, across all owned
  zones and events.
- Eligibility is saved when the challenge starts. Later ownership, zone-status,
  or event-location changes cannot grant or revoke that saved eligibility.
- Starting a challenge does not reserve the bonus. Of eligible completions
  sharing a start date, only the first qualifying completion can receive it.
- The extra card is selected uniformly from active, reward-eligible, non-evolved
  Common definitions. Creature and Power cards can both appear, including duplicates.

A challenge started at 23:59 and completed after midnight uses its start date's
allowance. Scoring below the threshold or having already received that date's
bonus leaves the normal reward unchanged. Reopening or retrying a result returns
the saved award instead of drawing another card.

## Privacy and saved results

Current-hour leaders are anonymous: the view shows the top **3 influence
counts**, while your own allowance is private to you. A named owner reflects
past participation, not their current location.

The territory system does not store the submitted coordinates, accuracy, or a
movement path. Private grants contain coarse zone and timing data and are
cleaned up within **24 hours after expiry**. Other players cannot see your
grant, precise location, queue entry, or contribution source match. Retained
ownership history shows **Deleted player** after account deletion.

The server saves ranked results and influence decisions together, and saves
challenge rewards and owner bonuses together. Retries cannot add duplicate
influence or cards. Rules and zone boundaries are versioned; changes do not
rewrite completed results or historical ownership.

See the [territory API](../architecture/contested-campus-territory-api-contract.md)
for requests, response fields, and privacy boundaries, and
[territory storage](../database/contested-campus-territory-persistence.md) for
saved grants, contributions, and ownership records.

---

This page was prepared and edited with assistance from Codex[GPT-5.6 Sol],
ChatGPT-Web[GPT-5.6 Sol], and Codex[GPT-6].

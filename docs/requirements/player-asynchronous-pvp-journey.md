---
title: 'Player battles'
description: Async and live PvP, ranked seasons, progression points, and territory influence.
---

# Player battles

Play against another player asynchronously or in a live ranked match. Both use
[Battle rules](battle-rules.md), including the same deck requirements, moves,
and type matchups.

## Choose a mode

| Mode                 | Where                              | Opponent                           | Timing                                                                  | What the result affects                                 |
| -------------------- | ---------------------------------- | ---------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| **Asynchronous PvP** | **Player Battles**, `/matches/pvp` | Challenge an exact Player Name     | 24 hours per turn or replacement; players can return at different times | Permanent progression points                            |
| **Live ranked PvP**  | **Live Ranked**, `/matches/live`   | The ranked queue finds an opponent | Both players play together; 60 seconds per decision                     | Seasonal rating and, when eligible, territory influence |

Async battles are unranked. Only live matches created through the ranked queue
change seasonal rating; a live match created outside that queue is unranked.

## Asynchronous battles

### Send a challenge

1. Open **Player Battles** from `/matches`, then choose **Challenge a player**.
2. Enter the opponent's exact **Player name** and choose **Find player**.
3. Select a saved **Deck** and a **Starting creature** from that deck. You can
   choose any legal saved deck; it does not have to be your active deck.
4. Choose **Send challenge**. The invitation appears under **Invitations → Sent**.
5. Once the opponent accepts, open the battle from the accepted invitation or
   the **Active** tab. Choose **Take your turn** when you need to act, or
   **View battle** while waiting.

Create or edit decks at `/collection/decks`. Only 1 pending invitation can
exist between the same pair of players, regardless of who sent it.

### Respond to an invitation

Open **Invitations → Received**. Choose **Accept**, select your deck and starting
Creature, then choose **Accept challenge** to enter the match. The opening
Creature is chosen during invitation setup; there is no separate opening
selection after acceptance. You can also choose **Decline**.

To withdraw a pending invitation you sent, choose **Cancel challenge**, then
**Confirm cancellation**. **Keep challenge** closes the dialog without
cancelling. Cancellation is unavailable once the invitation has been accepted.

Invitations expire **24 hours after being sent**. Declining, cancelling, or
letting an invitation expire creates no battle result or loss. An invitation
marked **Unavailable** can no longer be used.

### Play and return later

The battlefield shows **Your turn**, **Opponent's turn**, or a required Creature
replacement. On your turn, use **Moves**, **Power**, or **Swap** to choose an
available action. Review the confirmed outcome in the battle log. Shared turn
order, damage, and effects are explained in [Battle rules](battle-rules.md).

Each normal turn or required replacement has a **24-hour deadline**. Missing
it loses the match. The displayed **Turn deadline** shows when you must act;
leaving or refreshing does not pause it.

Accepted actions are saved automatically. Return through **Player Battles** and
open the match under **Active**. The page refreshes while you are waiting on the
opponent and the page is visible.

To concede, choose **Forfeit**, then **Confirm forfeit**. You can forfeit on
either player's turn. This permanently records your loss and the opponent's
win; **Keep playing** closes the dialog without ending the match.

### Results and history

Completed matches show **Victory** or **Defeat**, the opponent, completion time,
and last moves. Expand **Turn history** to review recorded actions or **Cards**
to inspect your Creatures and revealed opponent cards. The result explains
forfeits and missed deadlines; an unavailable opponent is described without
revealing their account details.

Open **History** in Player Battles to revisit results. The shared battle archive
at `/matches/history` also includes CPU results. Use **Load more** where offered
to view older records.

## Live ranked battles

1. Open **Live Ranked** at `/matches/live` and review your deck. **Change deck**
   opens `/collection/decks`.
2. Choose **Find battle**. Matchmaking looks for a nearby rating and widens its
   search as you wait.
3. When a match is proposed, choose **Accept** within **20 seconds**. Both players
   must accept before the battle starts. Declining or missing acceptance adds a
   **30-second cooldown**, without changing your rating.
4. Select your opening Creature, then take turns using the shared battle
   controls. Each opening selection, turn, or replacement has a **60-second
   deadline**. Missing a normal turn skips it; missed selections are resolved
   automatically. **3 consecutive missed decisions** lose the match.

You can **Cancel search** before a match starts. After it starts, forfeiting or
reaching the timeout limit records a rated loss. Reconnecting does not pause
deadlines. The lobby's **Watch** tab also lets you open a live battle using its
link or ID; watching does not affect your rating or influence.

## Ratings, standings, and seasons

Competition uses a single seasonal leaderboard. Named leagues or divisions
are not currently implemented.

- **Starting rating:** 1000 in your first season. Elo-style rating changes depend
  on the result and the opponent's rating: beating a stronger opponent is worth
  more than beating a weaker one. Rating cannot fall below 100.
- **Placements:** complete **5 ranked matches each season** to appear in public
  standings. These first matches use larger rating adjustments; your
  provisional rating is visible to you while placements are incomplete.
- **Standings:** open **Standings** in Live Ranked to compare rating, rank, wins,
  and losses. This leaderboard is separate from permanent-point rankings.
- **Season length:** **28 days** from activation. When the season closes, new
  searches stop while existing matches finish. Final standings are archived
  before the next scheduled season begins.
- **New season:** ratings move halfway back toward 1000. For example, 1240 becomes 1120. Match counts reset and everyone completes 5 placements again.

Forfeits in an already-started ranked match affect rating. Cancelled searches
and unaccepted proposals do not. Detailed calculations and rollover rules are
in [ranked competition](ranked-competition-policy.md).

## How battles connect to territories

Territories connect **Explore**, **ranked battles**, and **challenge rewards**.
Browse campus zones and their owners in **Explore → Territories**. Ownership is
held by individual players and is decided separately from leaderboard rank.

To contest a zone, enable **Contest territory** in Live Ranked and choose
**Find territory battle**. The browser requests your location and the server
checks that you are inside an active zone. Its location grant lasts **5 minutes**
and must still be valid when the match starts. Ordinary ranked play works
without territory participation or a location grant.

An eligible win adds **1 influence** to your snapshotted zone. You must have
completed 5 ranked matches **before this match starts**, so your fifth placement
win does not contribute. Influence is capped at **5 per player per zone per
Johannesburg calendar day**. Async, CPU, casual live, and provisional wins add
no territory influence. The queue still pairs by rating, so your opponent can
be contesting a different zone or none at all.

Ownership is settled **hourly**. A player needs at least **3 influence in that
hour**, then the highest qualifying total takes the zone. A current owner keeps
it when tied for the lead; other ties favour the earliest contribution. If
nobody qualifies, ownership stays as it is. At season closure, final territory
results are archived and zones start the next season unowned with fresh
influence windows.

Owning a zone can also earn **1 extra Common card** from a challenge in that
zone. You must own it when the attempt starts and score at least **3 correct
answers**. The bonus is limited to **1 card per player per Johannesburg
challenge-start date**, across all owned zones. It adds to ordinary challenge
rewards and can expand your collection for future decks.

See [territory rules](contested-campus-zone-policy.md) for eligibility,
settlement, and owner bonuses, or [Explore](player-location-journey.md) for the
map journey.

## Progression points and saved state

An async victory awards **25 permanent progression points**; the loser receives 0. Completed async battles count as activity for both players. These points
feed the [all-time and monthly rankings](player-progression-rules.md) and
[profile](../design/profile-showcase.md). Ranked live results change seasonal
rating and may add territory influence; they do not award these permanent
points. Rating, progression points, and influence are separate measures.

The server validates and snapshots cards: the sender's deck when an async
invitation is sent, the recipient's on acceptance, and both live decks when the
match starts. Later deck edits or catalogue changes do not rewrite those cards.
The server controls legal actions, deadlines, effects, and results.

Async invitations and battles are private to their participants. Player lookup
reveals the Player Name, and unrevealed opponent cards stay hidden. Live
spectators receive a limited battle view rather than either player's private
cards.

If an async action's result is uncertain, the page checks the saved battle before
offering a retry. Review any changed state before choosing again.

Technical details are in the
[asynchronous PvP API contract](../architecture/asynchronous-pvp-api-contract.md)
and [live PvP API contract](../architecture/live-pvp-api-contract.md).

---

This page was prepared and edited with assistance from Codex-CLI[GPT-5],
Codex[GPT-5], Codex-CLI[GPT-6], and Codex[GPT-6].

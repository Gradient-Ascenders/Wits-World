---
title: 'Player battles'
description: Choose async or live PvP, manage invitations, play a battle, and enter territory contests.
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
2. Choose **Find battle** and keep the lobby open while it searches.
3. When an opponent is found, choose **Accept** before the displayed deadline.
   Both players must accept before the battle starts.
4. Select your opening Creature, then use the shared battle controls to take
   turns. See [Battle rules](battle-rules.md#decision-deadlines) for live deadlines
   and missed decisions.

**Cancel search** ends a search while you are waiting. Once the battle starts,
use **Forfeit** to concede. Reconnecting does not pause the battle deadline.

The lobby shows your season rating and placement progress. Open **Standings**
to compare players, or **Watch** to open a live battle using its link or ID.
[Ranked competition](ranked-competition-policy.md) explains matchmaking,
acceptance cooldowns, rating changes, placements, and season resets.

## Contest a territory

For optional campus-zone contests, follow the
[territory journey](contested-campus-zone-policy.md#contest-a-zone). That guide
covers location checks, influence, ownership, and owner card bonuses.

## How it works

For point awards, streaks, and achievements, see
[progression](player-progression-rules.md). The mode comparison above identifies
which competitive measure each battle affects.

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

---
title: 'CPU battles'
description: Start a CPU battle, choose actions, resume play, and review saved results.
---

# CPU battles

## Player journey

1. Open **Battles** at `/matches`. Choose **Start CPU battle** to use your active
   saved deck, or **Choose deck** if none is selected. Manage decks at
   `/collection/decks`; the active deck also offers **Start CPU match**.
2. Select your opening Creature. The CPU selects its own, and the server chooses
   who goes first.
3. On your turn, use **Moves**, **Power**, or **Swap** to choose an available
   action. Review its cost, effects, and your Creature's current HP and Power.
4. Wait while the action and CPU response resolve. The battlefield updates and
   the battle log records the outcome before controls become available again.
5. If your Creature is defeated, select an available replacement when prompted.
6. Defeat all CPU Creatures to win. At completion, review the saved result and
   choose **Play another battle** to return to Battles.

| Tab       | Action                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------- |
| **Moves** | Choose a move your active Creature can currently use.                                          |
| **Power** | Play an available Power card from the match deck. Used cards remain discarded for this battle. |
| **Swap**  | Switch to a living bench Creature. Swapping uses your turn.                                    |

Unavailable actions are disabled with an explanation. Creature details and the
battle log provide the information needed to compare available choices. The CPU
view reveals its active and defeated Creatures; unrevealed cards remain hidden,
with remaining counts shown instead.

## Leave or resume

**Save and exit** returns to Battles. Accepted actions are already stored, so
there is no separate save operation. Choose **Resume CPU battle** to reopen the
active match. Refreshing or leaving does not reset its turn deadline.

To end the battle early, choose **Forfeit**, then **Confirm forfeit**. This records
a permanent loss for you and a CPU victory. **Keep playing** closes the dialog
without forfeiting. You can have only **1 active CPU battle**; finish or forfeit
it before starting another.

## Results and history

A completed battle shows the winner, final turn, and completion time. Its
confirmed battle log remains available on the match page at `/matches/:matchId`.
CPU battle records are private to you.

**Recent battles** on the Battles page combines CPU and player results. Choose
**View history** to open `/matches/history`, where results are ordered by
completion time. Select a result to review the saved battle.

## How it works

The API owns legal actions, damage, CPU choices, turn order, and results. Each
battle uses saved card snapshots, so later deck or catalogue changes do not alter
it. Visual resolution presents confirmed server events.

Normal player turns have a **90-second deadline**. An action received at or after
it resolves as a timeout instead of the chosen action. Opening selection and
mandatory replacement do not use that deadline.

Actions include the displayed match version. If the battle changed while you
were choosing, the page reloads its current state without automatically repeating
the action. Review the updated choices before continuing.

See [battle rules](battle-rules.md) for type matchups, turn order, and effects,
and the
[CPU match contract](../database/cpu-match-persistence-design.md) for persistence
and API details.

---

This page was prepared and edited with assistance from Codex-CLI[gpt-5.6-sol],
Codex-CLI[GPT-5], Codex[GPT-5], Codex-CLI[GPT-6], and Codex[GPT-6].

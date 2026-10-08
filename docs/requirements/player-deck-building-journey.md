---
title: 'Collections and decks'
description: Browse owned cards, build a saved deck, and choose it for battle.
---

# Collections and decks

## Player journey

1. Open **Cards** at `/collection`. Search or filter your collection and open a
   card to inspect it. If you have not claimed a starter, choose an affinity,
   review its cards, and confirm the choice.
2. Open **Decks** at `/collection/decks`, choose **New deck**, and enter a name.
3. Use **Add cards** to choose copies from your collection. Cards with the same
   definition are grouped; the picker shows how many you own and have used.
   Opening card details does not add it to the draft.
4. Review the lineup: five cards, comprising three Creatures and two Powers,
   within ten rarity points. Remove or replace copies to resolve any warnings.
   Searching, filtering, or changing pages keeps your chosen copies.
5. Choose **Create deck** to save the new deck.
6. Choose **Make active** when ready to use it. Opening or creating a deck does
   not change the active selection. The chosen deck displays **Active**.

From the active deck, **Start CPU match** opens a new battle or resumes an
existing active CPU match. See the [CPU battle journey](player-cpu-battle-journey.md)
for play controls.

## Manage saved decks

| Action        | What happens                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| **Edit deck** | Change the name or lineup, then choose **Save deck**.                                                |
| **Cancel**    | Leave the editor. If the draft changed, choose **Discard changes** or **Keep editing**.              |
| **Delete**    | Confirm deletion. Your collection cards remain; deleting the active deck leaves no active selection. |

## How it works

A deck references individual owned copies. Repeating a card in one deck requires
separate copies; the same copy can belong to several saved decks. Saving checks
ownership, composition, and rarity cost on the server. Copies reserved for a
trade cannot be added to a saved deck.

Only one saved deck is active at a time. Battle creation snapshots its cards, so
later deck edits do not change an existing match.

See [deck rules](basic-game-rules.md#saved-decks) for rarity costs and
[saved-deck persistence and API design](../database/saved-deck-persistence-design.md)
for implementation details.

---

This page was prepared and edited with assistance from Codex[GPT-5],
Codex-CLI[GPT-6], and Codex[GPT-6].

---
title: 'Evolving cards'
description: Combine duplicate cards, understand protected copies, and review evolution recipes.
---

# Evolving cards

Evolution consumes **three available copies of the same card** to create
**one copy of its defined evolved card**. The exchange cannot be undone.

## Player journey

1. Open **Evolutions** at `/collection/evolutions`. The list starts with **Ready**
   recipes. Search either card name or filter by source rarity; choose **All cards**
   to inspect recipes that are not ready.
2. Open a recipe to compare the source and evolved card, available copies,
   protected copies, and the target's rarity-point cost.
3. Choose **Evolve**. Review which card will be created and how many source
   copies will remain, then choose **Evolve** again to confirm, or **Cancel**.
4. After success, inspect the created card and choose **Back to evolutions**.
   The collection updates automatically. If its refresh fails, choose
   **Refresh collection**; the evolution is already saved.

## Conversion rule

- You need three eligible copies, not just three owned copies.
- A copy used in **any saved deck** is protected, even if that deck is inactive.
  Remove it from every saved deck before using it for evolution.
- A copy reserved by an open trade is also protected. End the offer to release
  the reservation, then check availability again.
- The server chooses the three newest eligible copies, using the owned-copy
  identifier to break acquisition-time ties. Players do not choose individual
  copies to consume.
- Both source and target must be active, published ordinary catalogue cards
  with an available recipe. The target is a separate card definition with its
  own fixed rarity; collecting duplicates does not change a card's rarity.

The evolved card can be used in a saved deck once owned. Its rarity cost still
counts toward the [deck point cap](basic-game-rules.md#saved-decks).

## Fixed relationships

The seeded catalogue contains these recipes:

| Source   | Evolved card | Target rarity |
| -------- | ------------ | ------------- |
| Quillip  | Quillume     | Epic          |
| Voltiki  | Voltadrake   | Epic          |
| Karrik   | Karradon     | Epic          |
| Nimbril  | Nimbrael     | Epic          |
| Sigilisk | Sigilith     | Epic          |
| Axiomar  | Axiomarch    | Legendary     |
| Arcalyx  | Arcalyron    | Legendary     |
| Basalox  | Basalorn     | Legendary     |

These evolved cards are excluded from starter, random-reward, and fixed CPU
pools. The seeded Power cards have no evolution recipes. Live availability is
shown by the collection's server-provided preview.

## How it works

A preview checks eligibility without reserving copies. Confirmation rechecks
ownership and locks, then consumes three copies and grants one card in a single
transaction. Retrying the same submission returns its saved result without
consuming or granting cards again. The success reveal starts after the server
confirms the exchange.

See [collections and decks](player-deck-building-journey.md) and the
[trading policy](card-trading-policy.md) for related copy protections.

---

This page was prepared and edited with assistance from Codex-CLI[GPT-5.6 Sol],
Codex[GPT-5], Codex-CLI[GPT-6], Codex[GPT-5.6 Sol],
ChatGPT-Web[GPT-5.6 Sol], and Codex[GPT-6].

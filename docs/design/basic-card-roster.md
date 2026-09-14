---
title: 'Complete card catalogue'
description: Approved 30-card catalogue, eligibility, evolution relationships, moves, effects, and artwork contract.
---

# Complete card catalogue

**Status:** Implemented release specification

**Applies from:** Migration `0041_complete_card_catalogue.sql`

**Approved:** 6 September 2026

This document is the human-readable source of truth for the 30 active,
published, ordinary card definitions. Migration `0041` is authoritative for
stable IDs and executable effect data. The
[Basic game rules](../requirements/basic-game-rules.md) define battle
resolution.

:::warning[Historical state is immutable]

The migration preserves existing owned-card row IDs and deck membership while
mapping superseded starter Power cards to the shared typeless pair. Existing
match snapshots and completed history are not rewritten.

:::

## Catalogue shape

| Dimension                        | Count |
| -------------------------------- | ----: |
| Ordinary playable cards          |    30 |
| Creatures                        |    24 |
| Typeless Power cards             |     6 |
| Common                           |    14 |
| Rare                             |     6 |
| Epic                             |     6 |
| Legendary                        |     4 |
| Explicit evolution relationships |     8 |

The seven superseded affinity-specific Power definitions remain classified as
retired `special` records for historical references. They are not part of the
30-card ordinary catalogue and cannot enter new starters, rewards, decks, or
matches.

## Affinities

Power cards are typeless. A Creature move is either Basic or matches that
Creature's affinity. Basic and explicitly neutral damage use a `1x` multiplier.

| Attacker | Advantage     | Disadvantage | Neutral outside same affinity |
| -------- | ------------- | ------------ | ----------------------------- |
| Wit      | Grit          | Spark        | Spirit, Mystic                |
| Grit     | Spark, Mystic | Wit, Spirit  | None                          |
| Spark    | Wit, Spirit   | Grit, Mystic | None                          |
| Spirit   | Grit, Mystic  | Spark        | Wit                           |
| Mystic   | Spark, Spirit | Grit         | Wit                           |

Advantages use `1.5x` and disadvantages use `0.75x`. Spirit and Mystic
intentionally have mutual advantage. New matches persist affinity rules version
`2`; old snapshots without a version retain version `1` behavior.

## Eligibility

- Starter affinities are Wit, Spark, and Grit.
- Each starter selection grants that affinity's three Common Creatures plus
  the shared Common Power cards **Field Kit** and **Reserve Focus**.
- Starter selection is one-time and grants no duplicate definitions.
- The reward pool contains every non-evolved Creature and all six Power cards.
  Evolved definitions are obtained only through their evolution relationship.
- The reward pool contains at least one card in every rarity: Epic uses
  **Grand Strategy** and Legendary uses **Fate Reversal**.
- The fixed legal Basic CPU deck is **Quillip**, **Voltiki**, **Karrik**,
  **Field Kit**, and **Reserve Focus**.
- All ordinary definitions may be used in a deck after the player owns a copy,
  subject to the normal ownership, composition, and point-cap rules.

## Creature catalogue

Move notation is `Name [type, Power cost]: ordered effects`. Every Creature has
exactly four executable moves.

### Wit

| Stable ID and card                                   | Rarity; HP / Power  | Ordered moves                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `84790040-6ea8-6155-c4b7-dec3a22ac3ab` **Quillip**   | Common; 98 / 11     | **Ink Peck** [Basic, 0]: 10 damage; **Blind Spot** [Basic, 1]: 16 damage; **Quick Study** [Basic, 2]: heal 25 HP; **Eureka** [Wit, 3]: 25 damage                                                                                                                                |
| `47f04de3-98d9-79ad-2759-7409c499c5ec` **Ciphra**    | Common; 92 / 13     | **Quick Read** [Basic, 0]: 12 damage; **Pattern Pounce** [Basic, 1]: 18 damage; **Flash Feint** [Basic, 2]: +20% damage for the next 2 turns; **Decoded Strike** [Wit, 4]: 30 damage                                                                                            |
| `cdd5284b-0aaf-5c50-f820-787a7f6b1506` **Prismole**  | Common; 108 / 9     | **Tunnel Plan** [Basic, 0]: 10 damage; **Facet Jab** [Basic, 1]: 14 damage; **Refract** [Basic, 2]: opponent deals 15% less damage for its next 2 turns; **Breakthrough** [Wit, 3]: 25 damage                                                                                   |
| `1d6416ca-2038-d640-283e-30adc2013d73` **Axiomar**   | Rare; 115 / 14      | **Probe Strike** [Basic, 0]: 13 damage; **False Opening** [Wit, 1]: 18 damage; **Predictive Guard** [Basic, 3]: next incoming Creature attack deals 45% less damage; **Checkmate Rush** [Wit, 3]: 32 damage                                                                     |
| `33546c11-4a85-7d2b-ad67-df2684ae1039` **Quillume**  | Epic; 120 / 15      | **Quill Barrage** [Basic, 0]: 14 damage; **Calculated Dive** [Basic, 1]: 24 damage; **Deep Study** [Wit, 4]: heal 45 HP; **Masterstroke** [Wit, 5]: 35 damage, then next incoming Creature attack deals 15% less damage                                                         |
| `6045725a-8271-f50d-19d7-a62f02bf080b` **Axiomarch** | Legendary; 140 / 18 | **Diagnostic Strike** [Basic, 0]: 20 damage; **Calculated Feint** [Wit, 1]: 30 damage; **Foresight Dodge** [Wit, 3]: 25 damage, then 50% server-resolved chance to dodge the next incoming Creature move; **Perfect Sequence** [Wit, 6]: 60 damage, then drain 3 opposing Power |

### Spark

| Stable ID and card                                    | Rarity; HP / Power  | Ordered moves                                                                                                                                                                                                                                 |
| ----------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eca9b943-9e05-834e-c85c-1175001d897c` **Voltiki**    | Common; 98 / 11     | **Wall Dash** [Basic, 0]: 10 damage; **Arc Burst** [Basic, 1]: 16 damage; **Charge Coil** [Basic, 0]: restore 3 Power; **Static Snap** [Spark, 3]: 25 damage                                                                                  |
| `ec9fb511-5dd2-8164-5f56-d9e13820c713` **Cinderhop**  | Common; 92 / 13     | **Mighty Maw** [Basic, 0]: 12 damage; **Quick Kick** [Basic, 1]: 18 damage; **Perfect Read** [Basic, 2]: +20% damage for the next 2 turns; **Calculated Claw** [Spark, 4]: 30 damage                                                          |
| `62d5bb93-78ad-5c44-412c-c7eca5f03250` **Lumiswift**  | Common; 108 / 9     | **Wing Swipe** [Basic, 0]: 10 damage; **Swift Peck** [Basic, 1]: 14 damage; **Evasive Circle** [Basic, 2]: next incoming Creature attack deals 50% less damage; **Thunderstrike Dive** [Spark, 3]: 25 damage                                  |
| `740b5400-8362-b728-3b76-9d232077732d` **Arcalyx**    | Rare; 80 / 18       | **Predator Pounce** [Basic, 0]: 15 damage; **Livewire Step** [Spark, 2]: 30 damage; **Charge Stalk** [Basic, 2]: next 2 damaging Creature moves deal 50% more damage; **Stormline Break** [Spark, 5]: 50 damage                               |
| `65f102ad-ff11-876c-a4f7-e2e74167bc4c` **Voltadrake** | Epic; 115 / 16      | **Thunder Claw** [Basic, 0]: 14 damage; **Aerial Rush** [Basic, 1]: 24 damage; **Overcharge** [Spark, 0]: lose 25 HP, then restore Power to maximum; **Tempest Arc** [Spark, 5]: 38 damage                                                    |
| `948a71e6-f04b-fcec-75ef-e401066ec8b8` **Arcalyron**  | Legendary; 100 / 25 | **Ion Claw** [Basic, 0]: 22 damage; **Thunderstep** [Spark, 3]: 40 damage; **Storm Charge** [Spark, 5]: 30 damage, next damaging move +50%, and next incoming attack -50%; **Static Demolition** [Spark, 10]: lose 20 HP, then deal 80 damage |

### Grit

| Stable ID and card                                   | Rarity; HP / Power  | Ordered moves                                                                                                                                                                                                              |
| ---------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `27cbcedf-1886-aa81-04b4-089b4c10cd87` **Karrik**    | Common; 98 / 11     | **Stone Scrape** [Basic, 0]: 10 damage; **Tail Hammer** [Basic, 1]: 16 damage; **Dig In** [Basic, 2]: heal 15 HP, then next incoming Creature attack deals 20% less damage; **Faultline Rush** [Grit, 3]: 25 damage        |
| `c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac` **Rootusk**   | Common; 92 / 13     | **Mud Charge** [Basic, 0]: 12 damage; **Thick Hide** [Basic, 1]: 18 damage; **Ground Hook** [Basic, 2]: +20% damage for the next 2 turns; **Relentless Rush** [Grit, 4]: 30 damage                                         |
| `fc2c46fb-d960-b1bb-ea9a-93110b79e22d` **Ferrupine** | Common; 108 / 9     | **Rattle Rush** [Basic, 0]: 10 damage; **Iron Quill** [Basic, 1]: 14 damage; **Quill Guard** [Basic, 2]: reflect 35% of actual HP damage from the next 2 incoming Creature attacks; **Barbed Return** [Grit, 3]: 25 damage |
| `841b45f5-bb3c-41d4-342b-d1b8d33eefde` **Basalox**   | Rare; 120 / 13      | **Basalt Horn** [Basic, 0]: 14 damage; **Rooted Ram** [Grit, 2]: 25 damage; **Seismic Stamp** [Basic, 3]: 30 damage; **Faultbreaker Charge** [Grit, 5]: 42 damage                                                          |
| `8197b5ff-c2a1-5ce9-9c86-b124cdc39021` **Karradon**  | Epic; 130 / 12      | **Granite Claw** [Basic, 0]: 12 damage; **Siege Tail** [Basic, 2]: 32 damage; **Immovable** [Grit, 4]: next incoming Creature attack deals 60% less damage; **Tectonic Rush** [Grit, 5]: 40 damage                         |
| `3c1356a9-d601-144e-77f3-1acfdd6aaaf9` **Basalorn**  | Legendary; 160 / 16 | **Obsidian Horn** [Basic, 0]: 20 damage; **Continental Stamp** [Grit, 2]: 35 damage; **Mountain Stance** [Grit, 5]: next 2 incoming Creature attacks deal 60% less damage; **Cataclysm Charge** [Grit, 6]: 60 damage       |

### Spirit

| Stable ID and card                                  | Rarity; HP / Power | Ordered moves                                                                                                                                                                                                                            |
| --------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a230fdda-cec0-c127-b4a2-e4dd20660e3a` **Nimbril**  | Common; 102 / 11   | **Gentle Nudge** [Basic, 0]: 11 damage; **Mist Veil** [Basic, 1]: 16 damage; **Echo Horn** [Basic, 1]: 10 damage, then next damaging Creature move deals 50% more damage; **Resonant Charge** [Spirit, 3]: 30 damage                     |
| `6e6b2c9f-27b2-2145-3b8a-219a0df622d7` **Sylphane** | Rare; 120 / 15     | **Feather Cut** [Basic, 0]: 12 damage; **Driftstep** [Basic, 1]: 18 damage; **Soul Chime** [Spirit, 4]: 10 damage, then stun until the end of the opponent's next turn; **Veilstorm** [Spirit, 3]: 30 damage                             |
| `6f962f85-eaee-fd27-b2d7-c00c8af95098` **Nimbrael** | Epic; 125 / 15     | **Spectral Charge** [Basic, 0]: 15 damage; **Silent Step** [Basic, 1]: 24 damage; **Echoing Crown** [Spirit, 3]: 15 damage, then 30% lifesteal for the next 2 damaging moves; **Undying Spirit** [Spirit, 5]: 35 damage, then heal 10 HP |

### Mystic

| Stable ID and card                                  | Rarity; HP / Power | Ordered moves                                                                                                                                                                                                                                                                      |
| --------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0cba869b-d777-11f8-6b8c-c47d4d626558` **Sigilisk** | Common; 102 / 11   | **Glyph Flick** [Basic, 0]: 11 damage; **Scale Swipe** [Basic, 1]: 16 damage; **Hexstep** [Basic, 3]: 5 damage, then Poison for 8 neutral damage at the end of the opponent's next 3 turns; **Arcane Pulse** [Mystic, 3]: 30 damage                                                |
| `5340e0ee-d31c-93f5-0d59-39d0cd977f15` **Orreryx**  | Rare; 120 / 15     | **Astral Horn** [Basic, 0]: 12 damage; **Orbital Ram** [Basic, 1]: 18 damage; **Astral Alignment** [Mystic, 2]: 8 damage, then +15% damage for this Creature's next 3 turns; **Starfall** [Mystic, 3]: 30 damage                                                                   |
| `a30d8e2e-42bf-574a-aa6f-1ebdf33c86b6` **Sigilith** | Epic; 120 / 16     | **Runic Lash** [Basic, 0]: 13 damage; **Prism Strike** [Basic, 1]: 20 damage; **Toxic Bite** [Mystic, 4]: 10 damage, then Deadly Poison for 12 neutral damage at the end of the opponent's next 3 turns; **Grand Convergence** [Mystic, 5]: 35 damage, then drain 2 opposing Power |

## Power-card catalogue

Power cards have no affinity. Their effects execute from first to last and the
card is discarded after use.

| Stable ID and card                                        | Rarity    | Ordered effects                                                                                                                                                                   |
| --------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0d28241f-a4f2-2cf3-52bc-dee1633b3316` **Field Kit**      | Common    | Heal the active Creature by 30 HP.                                                                                                                                                |
| `b7485793-8432-2db9-5f99-974164efa788` **Reserve Focus**  | Common    | Restore 5 Power to the active Creature.                                                                                                                                           |
| `49e45cbb-f419-bf5c-2868-757646cb8dc9` **Heavy Impact**   | Common    | Deal 30 neutral damage to the opposing Creature; affinity does not modify it.                                                                                                     |
| `25621c1c-0722-303d-928b-4ed6e015dbd0` **Counterplan**    | Rare      | Drain 2 opposing Power; then the opposing Creature deals 15% less damage during its next 2 turns.                                                                                 |
| `7f72be51-3370-8dbf-e96c-963ef4b5f29b` **Grand Strategy** | Epic      | Heal 20 HP; restore 3 Power; then deal 20% more damage during the active Creature's next 2 turns.                                                                                 |
| `5f476b3a-7fc9-e5eb-b552-716dd5cbf5dc` **Fate Reversal**  | Legendary | Swap both active Creatures' current HP percentages, recalculate against their own maximum HP, round down, and keep each at 1 HP or more. Both players require an active Creature. |

## Effect semantics

- Authored effects execute in stored position order. If an earlier effect ends
  the match, later effects do not execute.
- Damage modifiers do not stack with another instance of the same authored
  modifier; replaying one refreshes its remaining duration or charges.
- Poison is neutral, can defeat a Creature, does not stack, refreshes to three
  turns when reapplied, and remains after its source is defeated.
- Stun prevents a Creature move but still permits a Power card. It does not
  stack, and a Creature becomes immune to another stun after recovery.
- Dodge uses server-provided randomness and is consumed by the next
  opponent-directed damage effect from an incoming Creature move whether it
  succeeds or fails. Ordered self-effects and costs still resolve.
- Reflect uses actual HP damage received, rounds down, does not reduce incoming
  damage, and cannot reduce the attacker below 1 HP.
- Lifesteal uses actual HP damage dealt, rounds down, and does not apply to the
  setup move that creates it.
- **Overcharge** and **Static Demolition** apply unmodified self-damage before
  their later effect and are illegal at 25 HP or less and 20 HP or less,
  respectively.

## Evolution relationships

Evolution consumes three owned copies of the source and grants one owned copy
of the fixed evolved definition. The transactional player action remains a
separate feature; issue #164 supplies the immutable catalogue relationships.

| Source   | Evolved definition | Rarity change     |
| -------- | ------------------ | ----------------- |
| Quillip  | Quillume           | Common to Epic    |
| Voltiki  | Voltadrake         | Common to Epic    |
| Karrik   | Karradon           | Common to Epic    |
| Nimbril  | Nimbrael           | Common to Epic    |
| Sigilisk | Sigilith           | Common to Epic    |
| Axiomar  | Axiomarch          | Rare to Legendary |
| Arcalyx  | Arcalyron          | Rare to Legendary |
| Basalox  | Basalorn           | Rare to Legendary |

## Artwork

Each of the 30 definitions has one original square PNG in
`artwork/cards/originals`, one optimized WebP in `apps/web/public/cards`, and
one manifest entry in `artwork/cards/manifest.json`. The manifest records the
stable card ID, both paths, descriptive alt text, and attribution. The web UI
uses the catalogue alt text and retains its existing image fallback.

## AI declaration

This catalogue specification and its original artwork were created with
assistance from Codex-CLI[GPT-5.6 Sol] and ChatGPT-Web[GPT-5.6 Sol], then
reviewed and curated by the Wits World team.

Page title clarified with assistance from Codex-CLI[GPT-6].

---
title: 'Author cards'
description: Create Creature and Power-card definitions, configure their mechanics, and prepare them for publication.
---

# Author cards

The **Cards** workspace manages card definitions: the shared content used by owned copies and battle snapshots. Creating a definition does not grant a card to a player.

## Create a card

1. Open `/author/cards` and choose **New card**. Search and filter the catalogue when editing an existing draft.
2. Enter a unique **Card name**, choose **Category**, and set **Rarity**.
3. Complete the Creature attributes and moves, or the Power-card effects described below.
4. Optionally add a display description and artwork URL. Artwork can use an absolute HTTP(S) URL or an existing `/cards/` path; the form does not upload files.
5. Inspect the **Unsaved preview**, then choose **Create draft card** or **Save card**.

Names remain unique across draft, published, and retired definitions, ignoring case and surrounding whitespace. Saving a draft does not activate it in the reward catalogue.

| Field          | Creature                                                     | Power card                              |
| -------------- | ------------------------------------------------------------ | --------------------------------------- |
| Affinity       | Wit, Grit, Spark, Spirit, or Mystic                          | Typeless                                |
| Rarity         | Common, Rare, Epic, or Legendary                             | Common, Rare, Epic, or Legendary        |
| HP             | Positive integer                                             | Not used                                |
| Starting Power | Non-negative integer                                         | Not used                                |
| Mechanics      | Up to 4 moves in a draft; exactly 4 for approval/publication | At least 1 effect, including in a draft |

## Define moves and effects

For each Creature move, enter its name, move type, Power cost, effect type, and effect value. Move types are Basic, Wit, Grit, Spark, Spirit, and Mystic. Power cost must be a non-negative integer.

Power cards use **Add effect** rather than Creature moves. Both editors support these effects:

| Effect         | Additional fields                                                                   |
| -------------- | ----------------------------------------------------------------------------------- |
| Damage or Heal | Effect value; no modifier fields                                                    |
| Buff or Debuff | Modifier stat and effect value; the editor sets the operation for the selected stat |

Modifier stats are HP, Power, and damage multiplier. Only damage-multiplier effects can specify a duration in turns. A supplied duration must be positive.

Effect values may be left incomplete while drafting, but every move or effect needs a non-negative integer value before approval and publication. Use [Battle rules](../requirements/battle-rules.md) to check how the mechanics resolve, including type matchups and turn order.

## Review and retire

Card detail offers **Details** and **Review**. Review includes the audit history. Finish the draft, submit it, and follow [Review and publish](../architecture/diagrams/content-review.md) for independent approval and publication.

Publication activates the definition. Actual reward selection also depends on its rarity and configured reward eligibility. The card editor does not configure starter packages or evolution relationships.

Published content cannot be edited. Prepare a new definition for changed mechanics. Retiring a card removes it from future reward selection while preserving owned copies and saved battle snapshots; it cannot be republished.

Retirement is blocked for a configured starter definition without a configured replacement. It is also blocked if it would remove the last active, published Common reward card while published events still depend on that reward pool.

For exact request schemas, use the [API reference](../api-reference.md). [Card storage](../database/challenge-reward-persistence-design.md) describes the underlying definitions, moves, and ownership records.

**AI declaration**

This guide was written and checked against the card editor, validation, and publication service with assistance from Codex[GPT-6].

---
title: Card evolution rules
description: Confirmed duplicate-consumption rule and unresolved decisions for a future Wits Quest card-evolution feature.
---

# Card evolution rules

**Status:** Partially confirmed; implementation remains deferred

**Confirmed:** 5 September 2026

Card evolution is not part of the Basic tier or issue #164. The following
product decision is recorded now so ownership and catalogue work can remain
compatible with a future evolution feature.

## Confirmed conversion rule

- One evolution requires **three total owned copies of the same card
  definition**. This means the player needs the original copy and two
  additional duplicates, not three duplicates in addition to an original.
- All three source copies are consumed.
- The player receives one owned copy of the specifically authored evolved card
  definition.
- The three source copies must belong to the authenticated player, must still be
  available, and must not appear in any saved deck. The player removes them
  from every deck before evolving.
- The server performs validation, consumption, and the evolved-card grant in
  one database transaction. A failure rolls back the complete operation.
- Concurrent or repeated requests must not consume more copies or grant more
  evolved cards than the completed evolution allows.

Example: three owned copies of Spark Creature 1 are consumed to grant one owned
copy of its approved evolved definition.

## Rarity

Rarity belongs to the card definition and never changes because a player owns
more duplicates:

- every copy of an original definition has that definition's fixed rarity;
- every copy of an evolved definition has the evolved definition's separately
  authored fixed rarity; and
- the evolution operation does not calculate, roll, or automatically increase
  rarity.

Evolution state must therefore not be stored as a mutation to the original
catalogue definition. An evolved form is a separate definition connected by an
explicit evolution recipe.

## Still unresolved

The following decisions must be confirmed before implementation:

- which cards have evolved forms;
- evolved names, artwork, descriptions, affinities, rarities, moves, effects,
  HP, and Power;
- whether Power cards can evolve or evolution is Creature-only;
- whether an evolved card can evolve again;
- whether evolution is reversible;
- whether evolution has an additional progression or currency requirement;
- how consumed ownership records and acquisition provenance are retained for
  audit and account deletion;
- whether source copies obtained as starters are eligible; and
- the exact API, confirmation UI, animation, error handling, and accessibility
  requirements.

Do not invent evolved definitions or enable evolution merely because the
catalogue stores duplicate owned copies. A later issue must define recipes,
persistence, server authority, transactional and concurrency tests, deck
validation, collection presentation, and documentation before release.

## AI declaration

This document was written with assistance from Codex[GPT-5].

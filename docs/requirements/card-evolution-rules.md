---
title: Card evolution rules
description: Confirmed duplicate-consumption rule and the fixed evolution relationships in the complete card catalogue.
---

# Card evolution rules

**Status:** Catalogue relationships implemented; player evolution action deferred

**Confirmed:** 6 September 2026

Issue #164 adds the evolved definitions and their source relationships. It does
not add the collection action that performs an evolution.

## Conversion rule

- One evolution requires three total owned copies of the same source card
  definition.
- All three source copies are consumed.
- One owned copy of the source's specifically authored evolved definition is
  granted.
- Rarity is fixed on each card definition. Owning duplicates never mutates a
  card's rarity.
- Source copies must belong to the authenticated player and must not be
  referenced by a saved deck.
- Validation, consumption, and the evolved-card grant must happen in one
  database transaction.
- Concurrent or repeated requests must not consume extra copies or grant extra
  evolved cards.

## Fixed relationships

| Source   | Evolved definition | Fixed rarity |
| -------- | ------------------ | ------------ |
| Quillip  | Quillume           | Epic         |
| Voltiki  | Voltadrake         | Epic         |
| Karrik   | Karradon           | Epic         |
| Nimbril  | Nimbrael           | Epic         |
| Sigilisk | Sigilith           | Epic         |
| Axiomar  | Axiomarch          | Legendary    |
| Arcalyx  | Arcalyron          | Legendary    |
| Basalox  | Basalorn           | Legendary    |

The evolved definitions are separate active ordinary catalogue records. They
are valid deck cards after ownership is granted, but they are excluded from
starter, random reward, and fixed CPU pools. Power cards do not have evolution
relationships in this catalogue.

## Deferred implementation

A later issue must implement the authenticated API command, transaction,
idempotency, ownership provenance, collection confirmation UI, accessibility,
and concurrency tests. Evolution cannot be inferred merely from holding three
copies; it must be an explicit confirmed player action.

## AI declaration

This document was updated with assistance from Codex-CLI[GPT-5.6 Sol].

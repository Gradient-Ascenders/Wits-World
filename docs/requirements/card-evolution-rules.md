---
title: Card evolution rules
description: Confirmed duplicate-consumption rule and the fixed evolution relationships in the complete card catalogue.
---

# Card evolution rules

**Status:** Backend evolution transaction and API implemented; collection UI deferred

**Confirmed:** 6 September 2026

Issue #164 added the evolved definitions and their source relationships. Issue
#174 adds the authenticated server-side evolution action. The player-facing
confirmation experience remains separate work under issue #175.

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
- The API, not the browser, selects the three consumed copies. It chooses the
  newest eligible copies by acquisition time and then owned-copy identifier.

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

## Implemented backend contract

`GET /api/v1/cards/evolutions/{sourceCardDefinitionId}/preview` returns the
fixed source and target definitions, deck point costs, owned-copy counts, and
saved-deck locks. It does not reserve cards.

`POST /api/v1/cards/evolutions` accepts only a client-generated UUID
`submissionId` and the source definition UUID. The authenticated player is
derived from the bearer token; client-selected owned-copy or target identifiers
are rejected. A new transaction returns `201`, while a retry of the same
submission and source returns the original result with `200`. Reusing the
submission for a different source fails with `EVOLUTION_REPLAY_CONFLICT`.

The transaction locks the active player and eligible ownership rows, records an
immutable receipt and three consumption snapshots, deletes exactly those three
copies, and grants one `acquisitionKind: evolution` copy. The receipt retains
the granted copy's identifier and acquisition timestamp, so retrying the
original submission returns the original result even if a later evolution has
consumed that copy. Copies referenced by a saved deck are never selected.
Evolution is not inferred merely from holding three copies; the mutation
remains an explicit player action.

The collection confirmation UI, keyboard/focus behavior, and responsive player
workflow are intentionally deferred to issue #175. Coin selling remains outside
this contract and is tracked by issue #193.

## AI declaration

This document was updated with assistance from Codex-CLI[GPT-5.6 Sol] and
Codex[GPT-5].

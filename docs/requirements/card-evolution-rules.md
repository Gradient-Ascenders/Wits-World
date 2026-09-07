---
title: Card evolution rules
description: Confirmed duplicate-consumption rule and the fixed evolution relationships in the complete card catalogue.
---

# Card evolution rules

**Status:** Backend transaction, API, and player collection UI implemented

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

## Player collection experience

The collection groups separately owned copies by definition and keeps the normal
gallery visually quiet. Opening an evolvable card loads a fresh server preview
and distinguishes total owned copies, copies currently eligible for evolution,
and copies protected by saved decks. Cards without an authored evolution do not
show an unavailable action.

Eligibility is summarized by quantity; acquisition records remain available under
Copy history. The existing collection sheet and desktop detail layout are retained.
Confirmation controls stay below the scrolling preview, with safe-area spacing.
The recipe stacks vertically on mobile and tablet and compares horizontally on
desktop. Card frames are unchanged.

The confirmation view presents the server-authored source and target, the fixed
three-copy recipe, the number of copies remaining, any saved-deck protection,
and the target through the normal card presentation. The browser submits only
the source definition and a client-generated idempotency UUID. It never selects
the consumed copies or derives the evolved definition.

After a successful mutation, the UI immediately applies the authoritative
consumed identifiers and granted card from the result, then refetches the whole
collection. Insufficient-copy and saved-deck conflicts refresh both the preview
and collection before another action is offered. Confirmation is single-flight,
Escape and close are disabled while it is in flight, and focus moves to the
confirmation, recoverable error, or success heading as appropriate.
The sheet handle also stays disabled during submission. A confirmed evolution is
distinguished from the subsequent collection refresh; a failed refresh offers a
local retry without repeating the evolution. Stale previews explicitly state that
no evolution completed and offer refreshed availability for another review.

Coin selling remains outside this contract. Issue #193 retired the active coin
and wallet model and explicitly deferred selling for currency; the collection
therefore exposes no speculative selling action or client-calculated value.

## AI declaration

This document was updated with assistance from Codex-CLI[GPT-5.6 Sol] and
Codex[GPT-5], and Codex-CLI[GPT-6].

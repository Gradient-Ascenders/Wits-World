---
title: 'Card evolution rules'
description: Confirmed duplicate-consumption rule and the fixed evolution relationships in the complete card catalogue.
---

# Card evolution rules

**Status:** Backend transaction, API, and player collection UI implemented

**Confirmed:** 6 September 2026

Issue #164 added the evolved definitions and their source relationships. Issue
#174 adds the authenticated server-side evolution action. The player-facing
confirmation experience is implemented separately under issue #175.

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
fixed source and target definitions, deck point costs, owned-copy counts,
saved-deck locks, and active-trade reservations. It does not reserve cards.

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

The collection switches between Cards and Evolutions within `/collection`.
Normal card details retain their copy history and no longer include evolution.
The Evolutions section checks the existing preview endpoint for each distinct
owned definition, with at most four requests in flight. It lists available
relationships with server-returned eligibility, total ownership, and deck locks,
placing ready evolutions first. The web client validates both lock counts and
shows trade-reserved copies distinctly. Failed checks remain visible with a retry.
Definitions without an available relationship are omitted unless an owned copy
was acquired through evolution. Those entries say that no further evolution is
currently available; the contract does not explicitly identify final stages.

Selecting a candidate opens a focused preview with three compact source cards
and a prominent evolved result. The mobile surface fills the screen and scrolls;
desktop uses a wider comparison. Both reuse the normal card frame and dialog
focus management. Confirmation controls stay below the scrolling preview, with
safe-area spacing. The primary action is labelled "Evolve card" and explicitly
confirms the consumption of all three source copies.

The confirmation view presents the server-authored source and target, the fixed
three-copy recipe, the number of copies remaining, any saved-deck protection,
and the target through the normal card presentation. The browser submits only
the source definition and a client-generated idempotency UUID. It never selects
the consumed copies or derives the evolved definition.

After a successful mutation, the UI immediately applies the authoritative
consumed identifiers and granted card from the result, then refetches the whole
collection. Only after server success does Motion converge the three source
cards and reveal the result, over approximately 1.45 seconds. Reduced motion
uses a 180 ms fade. The result reports the resulting owned quantity, including
when that evolved definition was already owned, and offers Back to evolutions.
Insufficient-copy and saved-deck conflicts refresh both the preview
and collection before another action is offered. Confirmation is single-flight,
Escape and close are disabled while it is in flight, and focus moves to the
confirmation, recoverable error, or success heading as appropriate.
Normal card details retain their sheet handle; the focused mobile evolution
surface uses its explicit close control. A confirmed evolution is
distinguished from the subsequent collection refresh; a failed refresh offers a
local retry without repeating the evolution. Stale previews explicitly state that
no evolution completed and offer refreshed availability for another review.

Coin selling remains outside this contract. Issue #193 retired the active coin
and wallet model and explicitly deferred selling for currency; the collection
therefore exposes no speculative selling action or client-calculated value.

The [card-trading policy](card-trading-policy.md) reserves exact owned copies
in open offers. Issue `#275` now makes evolution treat a current trade
reservation as a server-owned lock alongside a saved-deck lock. Preview results
mark affected copies with `lockReason: trade_reservation`, report the reserved
copy count, and return `unavailableReason: trade_reservation` when those locks
prevent the recipe. Execution locks candidate ownership rows and rechecks trade
reservations before consuming any copies, so a concurrent trade cannot race an
evolution. The public trading API and UI remain follow-up work.

## AI declaration

This document was updated with assistance from Codex-CLI[GPT-5.6 Sol],
Codex[GPT-5], Codex-CLI[GPT-6], Codex[GPT-5.6 Sol], and
ChatGPT-Web[GPT-5.6 Sol].

Sprint 2 status reconciliation assisted by Codex-CLI[GPT-6].

Page title clarified with assistance from Codex-CLI[GPT-6].

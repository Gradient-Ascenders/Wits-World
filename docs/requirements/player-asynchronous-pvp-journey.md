---
title: Player asynchronous PvP journey
---

# Player asynchronous PvP journey

## Purpose and authority

Issue #181 adds asynchronous player-versus-player play alongside the existing
CPU journey. The protected `/matches` routes continue to provide CPU play;
`/matches/pvp` provides invitations, active asynchronous matches, and PvP
history. The [asynchronous PvP API contract](../architecture/asynchronous-pvp-api-contract.md)
remains the source of truth for privacy, identity, deck snapshots, legal
actions, deadlines, idempotency, outcomes, and hidden information.

The browser never calculates a legal action, deadline result, forfeit, winner,
or battle effect. It renders the viewer-relative API projection and submits
only the exact identifiers and version returned by the server.

## Routes and player flow

- `/matches` remains the CPU battle dashboard and links to asynchronous PvP as
  an additional mode.
- `/matches/pvp` loads incoming and sent invitations, active matches, completed
  history, and saved decks. Its bounded first pages refresh only while the page
  is visible; API-issued cursors expose explicit load-more controls without
  automatically draining every retained page.
- `/matches/pvp/:matchId` loads one participant-authorised, viewer-relative
  match and polls while the opponent is expected to act.

Player lookup is an exact Player Name request. The client accepts only the
closed `{ playerName, requestId }` response and rejects unexpected fields. It
does not request, store, render, announce, or log email, provider identity,
internal player identifiers, location, decks, activity, or private history.

Challenge creation and acceptance use one saved deck and one owned Creature
from that deck. Saved-deck display is a selection aid, not a legality decision:
the PvP API reloads and validates the deck and opening Creature when the intent
is submitted. A rejected or changed deck returns safe recovery guidance.

## Invitations

Incoming and sent groups render `pending`, `accepted`, `declined`, `expired`,
and `invalidated` states. The player can accept or decline only a pending
incoming invitation. Accept requires a deck and opening Creature and navigates
to the server-created match. Accepted invitations link to that persisted
match. `invalidated` is presented as **Unavailable**, because it represents an
account-lifecycle change rather than a user cancellation.

The current API does not support invitation cancellation. The UI therefore
does not invent a Cancel action or state transition.

## Match interaction and recovery

The match heading communicates **Your turn**, **Opponent's turn**, replacement,
or completion in text. The exact server deadline is always shown alongside a
display-only countdown. Reaching zero triggers a server refresh; it does not
locally declare a loss. Every later API response resynchronises the countdown.

Move, Power-card, and replacement controls are driven exclusively by
`legalActions`. Non-returned choices stay disabled. A synchronous single-flight
lock prevents repeated clicks from issuing duplicate requests. Every mutation
contains `submissionId` and `expectedVersion`. Stale, illegal, and completed
responses trigger a direct authoritative read. If a mutation response is
ambiguous and the version did not advance, the UI offers an explicit retry
using the same submission ID.

Polling runs only while an active match is waiting on the opponent and the page
is visible. It backs off after failures, preserves the last confirmed state,
offers manual retry, stops on completion, and stops when the route unmounts.

The opponent projection shows only the active and defeated Creatures, legally
played Power cards, and aggregate remaining counts supplied by the API. There
is no placeholder array or accessibility text for unrevealed cards.

Completed views distinguish battle defeat, missed-deadline forfeit, and
account-deletion forfeit using viewer-relative win/loss language. Voluntary
forfeit is not offered because S3-02 has no resignation intent or completion
reason; adding it requires an approved API contract and API-owned implementation.

## Accessibility and responsive behaviour

The hub and battle are mobile-first. Native form controls, buttons, links,
headings, lists, fieldsets, progress elements, status regions, and alerts expose
the journey without colour alone. Phase changes focus the battle heading;
polling and mutation status use polite announcements; errors receive focus;
and disabled actions retain a textual reason. The shared CPU/PvP action and
combatant presentation preserves keyboard tabs, touch targets, HP text, Power
text, and active-effect descriptions across both modes.

Representative browser review should cover approximately 390px and 1280px,
including no horizontal overflow, keyboard access to action tabs and legal
controls, visible focus, the closed opponent-reserve disclosure, and no console
or runtime errors.

## Automated coverage

`apps/web/tests/pvp-client.test.ts` validates privacy-safe closed contracts,
invitation states, versioned intent bodies, legal actions, hidden-information
rejection, error mapping, and ambiguous-response recovery metadata.
`apps/web/tests/pvp-pages.test.tsx` covers the hub state matrix, Player Name
challenge flow, accept/decline/expiry handling, duplicate-click protection,
cursor navigation, own/opponent turns, move and Power controls, polling,
deadline refresh, stale reconciliation, terminal outcomes, hidden opponent
presentation, and retry. Existing CPU match client/page tests remain the
regression boundary for the shared presentation extraction.

This document was generated and reviewed with assistance from
Codex-CLI[GPT-5].

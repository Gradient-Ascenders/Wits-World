# Player Challenge Journey

## Status and authority

This journey implements issues #68 and #163 for the Wits Quest Basic tier.

`BASIC-03` is authoritative: marking is server-authoritative. During an active
timed attempt, no correctness or answer key is revealed. After authoritative
completion, the player receives a five-question review containing their locked
answer (or `null` when timeout left it unanswered), the correct answer, and
server-derived correctness. An ordering review additionally contains the
authoritative explanation. Multiple-choice explanations remain outside the
Player contract.

The browser renders player-safe API state. It does not decide eligibility,
deadline validity, answer correctness, score, completion, coin amounts, card
selection, or reward ownership.

The browser renders the same completed review returned by the API; it does not
compare answers or calculate correctness itself.

## Journey

1. An authenticated player opens `/explore`.
2. The player explicitly checks an active event against a fresh reported
   location. Only an API `reachable` result exposes **Start challenge**.
3. Selecting **Start challenge** requests a new reported location and calls
   `POST /api/v1/events/{eventId}/challenge-attempts`. The API repeats its
   authoritative eligibility checks before creating or resuming an attempt.
4. The browser opens `/challenge-attempts/{attemptId}` and loads the attempt
   through `GET /api/v1/challenge-attempts/{attemptId}`. This route requires no
   location claim and returns the same safe `404 ATTEMPT_NOT_FOUND` for missing
   and wrong-owner attempts.
5. The player sees one unanswered question at a time. Multiple choice uses four
   native radio controls and submits `attemptQuestionId` and `choiceId`.
   Ordering starts from the API-shuffled four-item sequence and submits
   `attemptQuestionId`, `format: "ordering"`, and the four `itemIds` in the
   player's current order. Pointer reordering and the visible Move Up / Move
   Down buttons update the same ordered intent.
6. The API locks the answer. An in-progress response produces a neutral
   “Answer saved” confirmation and advances to the first server-unanswered
   question. It does not reveal whether that answer was correct.
7. A fifth accepted answer, or expiry, returns the persisted completed result:
   final score, coins, zero to two awarded cards, and the five-question answer
   review.
8. Reopening or refreshing the route always reloads authoritative attempt state.
   A completed result is rendered as already saved to the player account; the
   browser does not claim that a repeat response created a new reward.

`reward.cards` lists the concrete card awards persisted for that completion; a
repeat result returns those same cards. An empty list means no card award was
persisted for that result. The current API does not expose a separate
"already owned" flag, so the browser must not infer one.

## Deadline and timeout

The visible timer is recalculated from the absolute API `deadline` timestamp.
It is not a browser-owned challenge duration. It refreshes after tab visibility
or focus changes, and the countdown itself is not announced every second.

At zero, the browser disables new answer submission and calls the authenticated
attempt GET. The API finalizes an expired in-progress attempt through the
idempotent timeout finalizer before returning its persisted result. A final
answer racing with expiry is resolved only by the API's receipt-time decision.

If a browser clock reaches zero before the API considers the attempt expired,
the player sees a clear server-confirmation state and can check the result
again. The browser does not tight-poll, resume answering, or decide expiry from
its own clock.

## Accessibility

- The challenge uses a labelled progress element, headings, native controls,
  and a native submit button. Multiple choice uses a radio group. Ordering uses
  a labelled ordered list plus keyboard-operable Move Up / Move Down buttons.
- Each ordering movement announces the moved item's new position and the full
  current order. The list itself exposes the current numbered sequence without
  requiring pointer input.
- Answer controls meet the shared 44px touch-target minimum and retain the
  global visible focus treatment.
- Focus moves to the next question after an answer is saved and to the result
  after completion.
- Polite status announcements cover loading, answer saving, saved progress,
  time warnings, timeout reconciliation, and results. The countdown is not a
  per-second live region.
- Colour supports status but never carries correctness or essential state alone.

## Local evidence

The Great Hall development seed includes an active published event, a published
five-question challenge, and active reward cards. Manual evidence still requires
an authenticated local player and a reported location the API accepts. Capture
representative 390px mobile and 1280px desktop evidence under ignored
`.pr-screenshots/`; add another width only for a concrete breakpoint or
minimum-width question. Do not capture access tokens, precise location values,
answer keys, or other players' data.

This document was planned and edited with assistance from Codex[GPT-5].

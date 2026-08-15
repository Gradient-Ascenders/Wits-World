# Player Challenge Journey

## Status and authority

This journey implements issue #68 for the Wits Quest Basic tier.

`BASIC-03` is authoritative: Basic returns only the final score (`0`–`5`) and
the persisted reward outcome. It does **not** reveal per-question correctness,
accepted choices, correct answers, or explanations. This supersedes the older,
conflicting feedback wording in issue #68 and earlier design/planning material.

The browser renders player-safe API state. It does not decide eligibility,
deadline validity, answer correctness, score, completion, coin amounts, card
selection, or reward ownership.

The frontend is prepared for Tyron's confirmed attempt-read route below. That
backend route must be deployed before refresh, resume, and timeout
reconciliation can work in a running environment.

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
5. The player sees one unanswered question at a time, chooses one of four
   native radio controls, and submits only `attemptQuestionId` and `choiceId`.
6. The API locks the answer. An in-progress response produces a neutral
   “Answer saved” confirmation and advances to the first server-unanswered
   question. It does not reveal whether that answer was correct.
7. A fifth accepted answer, or expiry, returns the persisted completed result:
   final score, coins, and zero to two awarded cards.
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

- The challenge uses a labelled progress element, headings, a native radio
  group, and a native submit button.
- Answer controls meet the shared 44px touch-target minimum and retain the
  global visible focus treatment.
- Focus moves to the next question after an answer is saved and to the result
  after completion.
- Polite status announcements cover loading, answer saving, saved progress,
  time warnings, timeout reconciliation, and results. The countdown is not a
  per-second live region.
- Colour supports status but never carries correctness or essential state alone.

## Local evidence

The current event seed does not include a published five-question challenge.
Manual evidence therefore requires an authenticated local player, an active
published event, a published challenge with five valid questions, active reward
cards, and a reported location the API accepts. Capture 360px, 390px, 768px,
and desktop evidence under ignored `.pr-screenshots/`. Do not capture access
tokens, precise location values, answer keys, or other players' data.

This document was planned and edited with assistance from Codex[GPT-5].

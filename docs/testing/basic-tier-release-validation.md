---
title: Basic-tier release validation
---

# Basic-tier release validation

## Scope and evidence rule

This is the canonical Issue #80 evidence record. The issue text available in
the repository calls for a “21-step” release flow but does not enumerate those
steps, and the private Gitea issue/comments were not accessible during this
validation. The table below is therefore a release-validation decomposition of
confirmed repository behavior, not 21 newly invented product requirements.

Automated/local checks, deployed smoke checks, manual evidence, external
configuration, and unresolved acceptance gates are reported separately.

## The 21-step journey

| Step | Playwright step and asserted outcome                                                                                                 |
| ---: | ------------------------------------------------------------------------------------------------------------------------------------ |
|   01 | Resolve an authenticated local player with the Author role from the verified token.                                                  |
|   02 | Discover the known published demo event from the real database.                                                                      |
|   03 | Render the same event in the semantic mobile list without map authority.                                                             |
|   04 | Obtain eligibility from the API/PostGIS calculation.                                                                                 |
|   05 | Start the event challenge and create one active attempt.                                                                             |
|   06 | Withhold accepted answers, correctness, score, and rewards while active.                                                             |
|   07 | Submit all five selected answers through the player UI.                                                                              |
|   08 | Mark answers and compute the score on the server.                                                                                    |
|   09 | Return the completed five-question review only after completion.                                                                     |
|   10 | Retry start and return the same completed attempt/reward without a second award.                                                     |
|   11 | Show the awarded owned copy in the server-backed collection.                                                                         |
|   12 | Claim the starter grant once through the API.                                                                                        |
|   13 | Build a five-card deck within the ten-point rarity cap.                                                                              |
|   14 | Persist the deck using owned-copy IDs and server validation.                                                                         |
|   15 | Select the saved deck as active.                                                                                                     |
|   16 | Create a CPU match from the active server-owned deck.                                                                                |
|   17 | Submit only legal player actions until the server completes the match.                                                               |
|   18 | Reload the persisted completed result.                                                                                               |
|   19 | Show the completed match in history.                                                                                                 |
|   20 | Create and publish an event, five questions, challenge, and event binding through protected Author APIs, then discover it in the UI. |
|   21 | Check tablet/desktop overflow, keyboard Author navigation, external-call isolation, and unexpected browser errors.                   |

## Authority and security evidence

| Decision                                     | Authoritative source                                     | Executable evidence                            |
| -------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| Identity and role                            | Verified issuer/subject, then local `players` row        | auth/authorization tests; steps 01 and 20      |
| Event availability and radius                | Published event row and PostGIS distance                 | event DB tests; steps 02–04                    |
| Correctness, score, review                   | immutable question/answer snapshot and challenge service | challenge service/DB tests; steps 05–09        |
| Reward and owned-card ID                     | transactional finalizer, ledger, and `player_cards`      | concurrency/reward DB tests; steps 10–11       |
| Card ownership and deck legality             | collection/deck services and DB ownership constraints    | deck service/DB tests; steps 12–15             |
| CPU legality, randomness, winner, completion | game-rules package plus locked match transaction         | game-rules/match service/DB tests; steps 16–19 |
| Author role and lifecycle                    | server role lookup, lifecycle services, audit tables     | author integration/DB tests; step 20           |

Bearer signature/issuer/audience/expiry validation, exact-origin CORS, parameter
validation, parameterised SQL, object ownership, hidden active answers, server
request IDs, idempotency keys, row locking, atomic rewards, preliminary
account-deletion components, and safe errors have focused repository tests. The application now adds a
per-process fixed-window limit keyed by verified local player identity. It does
not aggregate across instances or cover invalid-token traffic before identity
resolution; deployment-edge rate protection remains an external evidence gap.
Location is requested only by a user action and is not sent to Mapbox.

The generated OpenAPI contract documents `429 RATE_LIMITED` on bearer-protected
routes after verified local-player resolution. The safe error body is accompanied
by `Retry-After`, `RateLimit-Limit`, and `RateLimit-Remaining`. This does not
claim rate limiting for invalid tokens or other traffic rejected before a local
player identity exists.

## Representative failure-journey evidence

These focused tests provide the required failure boundaries without duplicating
them in the 21-step success journey.

| Failure boundary                          | Expected repository behavior                                   | Automated evidence                                                                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing or invalid authentication         | Deny the request with a safe `401` before protected work runs. | `apps/api/tests/authentication.integration.test.ts` — `returns 401 when the bearer token is missing`; `returns 401 for a token with an invalid signature` |
| Stale location                            | Return a retry result without evaluating PostGIS eligibility.  | `apps/api/tests/events.integration.test.ts` — `returns retry for a stale location claim without evaluating PostGIS eligibility`                           |
| Outside event radius                      | Return authoritative unreachable/ineligible evidence.          | `apps/api/tests/events.integration.test.ts` — `returns unreachable when the accuracy envelope is clearly outside the radius`                              |
| Expired challenge                         | Finalize as timed out and do not persist the late answer.      | `apps/api/tests/challenge-answer-submission.test.ts` — `finalizes an expired attempt as timeout without inserting the late answer`                        |
| Duplicate or concurrent reward completion | Converge on one completion and one reward.                     | `apps/api/tests/challenge-persistence.integration.test.ts` — `converges concurrent finalization on one completion and reward`                             |
| Invalid or unowned deck content           | Reject cross-player owned copies without persisting the deck.  | `apps/api/tests/deck-persistence.integration.test.ts` — `rejects cross-player card copies without persisting a deck`                                      |
| Illegal or stale battle action            | Serialize competing submissions and reject the stale request.  | `apps/api/tests/cpu-match-database.integration.test.ts` — `serializes concurrent different submissions and rejects the stale request`                     |
| Player calling an Author route            | Deny the ordinary Player with `403`.                           | `apps/api/tests/author-cards.integration.test.ts` — `rejects an ordinary Player`                                                                          |

## Basic checklist status

| Item        | Repository status                                                                                                                                               | Remaining release gate                                                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BASIC-01–08 | Implemented: eligibility, five-question attempts, hidden active answers, scoring, atomic/retry-safe rewards, collection, starter cards, decks, and CPU history. | Execute full validation and manual UX checks.                                                                                                                                              |
| BASIC-09–11 | Implemented rules for timers/randomness, two roles, and Author lifecycle/audit.                                                                                 | Complete normal release validation.                                                                                                                                                        |
| BASIC-12    | Confirmed deletion and retention requirement; account deletion is not implemented.                                                                              | Build the proper profile/account page and account-deletion capability in Sprint 2, then validate complete cleanup and operator retention evidence.                                         |
| BASIC-13    | Mapbox Standard implemented with attribution and text fallback; confirmed as an allowed team-selected integration.                                              | Retain licensing/terms, cost/usage owner, token/CSP/privacy, deployed behaviour, attribution, and campus-data evidence. No separate named client/lecturer approval is claimed or required. |
| BASIC-14–16 | Responsive/accessibility foundations and explicit exclusions are documented and tested where automatable.                                                       | Manual keyboard, screen-reader, contrast, touch, and representative-device evidence is required.                                                                                           |
| BASIC-17    | Application deliberately ignores `email_verified` for ordinary authorization.                                                                                   | Operator must confirm production Auth0 verification email disabled and recovery email retained.                                                                                            |
| BASIC-18    | Normalized global card-definition uniqueness enforced by migrations `0017`/`0018` and tests.                                                                    | None identified in repository scope.                                                                                                                                                       |
| BASIC-19    | Draft 0–4, API fifth-move rejection, exactly-four publication, and stored positions 1–4 are enforced.                                                           | Eighteen audited published two-move definitions need approved content remediation; strict database publication enforcement and gameplay/balance sign-off remain blocked.                   |

## BASIC-19 deployment preflight

Before applying migration `0019_limit_creature_move_positions.sql` to a shared
or production database, an authorised database operator must run this read-only
query against the intended target:

```sql
select card_definition_id, position, name
from public.card_moves
where position > 4
order by card_definition_id, position;
```

The query must return zero offending rows before `0019` is applied. Any returned
row requires Cards/Game and database-owner review and explicit remediation; it
must not be silently deleted, truncated, or renumbered. Migration `0019` also
fails transactionally when such rows exist, and the database integration test
records that safety behavior. No production result is claimed here because this
task did not query an external database.

This preflight is separate from the known 18 published Creature definitions
with only two approved moves. A zero-row position preflight neither supplies
their missing content nor clears that release blocker.

## Required commands and evidence

Release validation must record exact results for targeted type checks/tests,
the 21-step command, full lint/type-check/test/build, documentation build, and
final Git inspection. Results belong in the Issue #80 handoff; this document
does not pre-claim results that may change after it is written.

## Manual and external checks

- Test 360/390 px phones, 768 px tablet, and desktop with touch and keyboard.
- Run a screen reader through sign-in, Explore, challenge, collection, decks,
  battle, and Author flows; verify focus order, labels, announcements, contrast,
  reduced motion, zoom, and map-independent completion.
- Smoke the deployed canonical web/API/docs origins with real Auth0 and Mapbox;
  inspect exact CORS, CSP, cookies/storage, error logging, and no secret leakage.
- Confirm Auth0 email policy, refresh rotation, callbacks/logout/origins, custom
  domain/DNS/certificate, and issuer mapping with operator evidence.
- Confirm Mapbox licence/terms, token restrictions, CSP/privacy, usage alerts
  and owner, attribution, Wits campus accuracy, and text fallback.
- Confirm Azure/Neon backups, recovery, monitoring, deployment-edge throttling,
  migrations, seed policy, and disposable-versus-production database isolation.
- Obtain Cards/Game approval for the missing Creature moves and battle balance.
- Obtain CI evidence for the new Basic E2E and database migration-safety command;
  a local pass is not CI proof.

## AI declaration

This validation record and its deterministic journey were generated, edited,
and reviewed with the assistance of Codex[GPT-5] and
ChatGPT-Web[GPT-5.6 Sol]. The declaration is not evidence of a pass; only
recorded command output or named human/operator evidence is treated as one.

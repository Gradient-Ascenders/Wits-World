---
title: 'Release acceptance checklist'
description: The integrated Basic journey, release checks, and evidence needed to assess a release.
---

# Release acceptance checklist

Use this procedure to assess a named release of the Basic game. Record the
commit, environment, date, command or task, observed result, evidence, and
remaining limitations. The [test catalogue](automated-verification.md) describes
suite setup; [CI workflows](continuous-integration.md) describes automated gates.

Local tests, CI results, production smoke checks, participant evaluation, and
operator checks are separate evidence. This checklist does not certify a
release. Dated outcomes remain in the [Sprint 1 evidence](../planning/scrum/sprint-1/evidence.md),
[Sprint 2 results](../planning/scrum/sprint-2/evidence.md), and
[Sprint 3 results](../planning/scrum/sprint-3/evidence.md).

## The 21-step journey

These are the named steps in the deterministic Basic browser scenario, originally
used for issue #80. They decompose executable checks of repository behaviour;
they are not 21 separately stakeholder-approved product requirements. The
scenario uses local authentication substitutes and does not prove production
registration, Auth0, or Mapbox operation.

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
request IDs, idempotency keys, row locking, atomic rewards, transactional
account-deletion persistence, and safe errors have focused repository tests. The
current application uses a shared sliding-window limit keyed by verified local
player identity. It does not cover invalid-token traffic before identity
resolution; deployment-edge rate protection remains an external evidence gap.
Explore uses consented browser location readings; the API owns eligibility. Player location is not sent to Mapbox.

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

## Automated release checks

With dependencies installed and an isolated PostgreSQL/PostGIS test target
configured, record the root checks and selected integration results:

```bash
npm run format:check
npm run lint
npm run type-check
npm test
npm run build
npm run test:database --workspace @wits-world/api
npm run test:e2e:basic
git diff --check
```

The [test catalogue](automated-verification.md#database-integration) explains
database permissions and selection. Root workspace tests alone do not run
opt-in database or browser suites. Record failed, skipped, or inconclusive
checks and their cause; distinguish an assertion failure from unavailable
infrastructure. Record the actual CI run and deployed identifiers separately.

## Deployed and manual acceptance

| Area                                    | Evidence required                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Integrated player journey               | Register/sign in through real Auth0; discover an event; obtain eligibility; complete a challenge; inspect reward and collection; save/select a legal deck; complete a CPU battle; reload history; sign out. Verify Web-to-API calls against the named release.                                                     |
| Failure and recovery                    | Denied or inaccurate location, map unavailable, challenge/API failure, invalid deck/action, and session expiry remain understandable and recoverable.                                                                                                                                                              |
| Accessibility and responsiveness        | Check 360/390 px mobile, 768 px tablet, and desktop; touch and keyboard; visible focus, forms, announcements, contrast, reduced motion, enlarged text/zoom, overlays, and map-independent completion. Record the screen reader and real device used.                                                               |
| Content and gameplay                    | Confirm published events, questions, complete card definitions, rewards, and battle behaviour against the intended production content. Retain factual review and gameplay/balance review outcomes.                                                                                                                 |
| External services and account lifecycle | Verify Auth0 origins, issuer, email/recovery policy, session rotation, recovery and deletion; Mapbox restrictions, attribution, usage ownership, and fallback. Use the [integration reference](../architecture/external-integrations.md).                                                                          |
| Database and operations                 | Confirm production migration/content state, isolated test targets, backups/recovery, worker/cleanup operation, retention, monitoring, and deployment-edge protection using the [database release procedure](../database/database-release-procedure.md) and [Azure guide](../deployment/azure-deployment-setup.md). |
| Feedback and sign-off                   | Evaluate genuine player/stakeholder findings, fix and retest accepted severe findings, document remaining conditions, and record reviewer acceptance for the stated release scope.                                                                                                                                 |

Public `200` responses establish reachability, not successful authentication or
a matching application/database release. Automated component/browser assertions
support accessibility review but do not establish full manual conformance.
The [testing strategy](testing-strategy.md#manual-and-field-validation) defines consent,
observation, stakeholder review, disposition, and retest procedures.

## AI declaration

This validation record and its deterministic journey were generated, edited,
and reviewed with the assistance of Codex[GPT-5], ChatGPT-Web[GPT-5.6 Sol], and
Codex-CLI[gpt-5.6-sol medium]. The declaration is not evidence of a pass; only
recorded command output or named human/operator evidence is treated as one.

Sprint 2 status reconciliation assisted by Codex-CLI[GPT-6].

Page title clarified with assistance from Codex-CLI[GPT-6].

Current acceptance procedure consolidated with assistance from Codex[GPT-6]. Historical run results remain attached to their original revisions and dates.

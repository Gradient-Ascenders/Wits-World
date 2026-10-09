---
title: Sprint 3 evidence
description: Dated delivery, verification, and remaining acceptance evidence.
sidebar_position: 1
toc_max_heading_level: 2
---

# Sprint 3 evidence

These are dated repository records, not a current release audit. Read the
[Sprint report](report.md) for the sprint narrative and [user feedback](feedback.md)
for the collected findings and retest limits. Implementation, automated results,
and deployed acceptance remain separate.

## Features

**Snapshot:** 28 September 2026, main `c0fd42b`.

This matrix maps _Wits Quest_, section 1.1.3, printed pages 2-3, to the current
implementation. The seven Advanced feature groups are assessed independently
from the Milestone 3 marking rubric in the
[Sprint 3 overview](#milestone-3-evidence-map).

**Implemented** means source, routes/UI, and the referenced persistence exist
at this revision. **Acceptance pending** identifies demonstrations or operational
checks not established by this documentation audit. The
[validation snapshot](#verification) records actual
execution evidence separately.

### Advanced requirements

| Brief requirement                                                                | Implementation and reference                                                                                                                                                                                                                                                                                                         | Merge-history evidence                                                                                                                                                                                                                                                                         | Acceptance still to record                                                                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Two players in one live authoritative match                                      | Implemented live gateway, shared engine, persisted versions, and player interface; [realtime contract](../../../architecture/live-pvp-api-contract.md), [storage](../../../database/live-pvp-persistence.md)                                                                                                                         | [#281](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/281), [#283](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/283), [#285](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/285), [#318](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/318) | Two deployed clients, rejected stale/duplicate actions, correct result and history                           |
| Timed turns and return after dropout                                             | Implemented persisted deadlines, reconnect generations and resume flow; [deadline/reconnect contract](../../../architecture/live-pvp-api-contract.md#deadlines-and-reconnect)                                                                                                                                                        | #285 / #318                                                                                                                                                                                                                                                                                    | Deliberate network loss, refresh, completed/expired match handling; investigate UT-S3-02                     |
| Spectators watch a match in progress                                             | Implemented spectator tickets and safe realtime projections; [live contract](../../../architecture/live-pvp-api-contract.md)                                                                                                                                                                                                         | #285 / #318                                                                                                                                                                                                                                                                                    | Spectator sees committed public state, cannot mutate or access participant-private data                      |
| Longitudinal trust from movement, conflicting submissions and repeated opponents | Implemented bounded evidence, versioned scoring, cases and proportionate restrictions; [trust policy](../../../requirements/longitudinal-trust-policy.md), [storage](../../../database/trust-persistence.md)                                                                                                                         | [#282](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/282), [#288](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/288), [#293](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/293)                                                                         | Synthetic fixtures showing evidence decay, band thresholds, legitimate retries, and proportionate scope      |
| Suspect players surfaced for human judgment                                      | Implemented review/audit API and console with versioned decisions; [trust reference](../../../database/trust-persistence.md)                                                                                                                                                                                                         | [#320](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/320), [#326](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/326)                                                                                                                                                 | Authorized independent review, appeal/evidence flow, stale-decision rejection and privacy checks             |
| Automatic walkable event distribution, separation, limits, rotation and coverage | Implemented reviewed candidate sites, PostGIS checks, bounded assignment plans, rotation and Author preview/apply; [policy](../../../requirements/automatic-event-placement-policy.md), [service](../../../architecture/automatic-event-placement-service.md), [storage](../../../database/automatic-event-placement-persistence.md) | [#286](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/286), [#287](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/287), [#294](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/294), [#317](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/317) | Candidate-site campus review, coverage/separation diagnostics, bucket transition, stale apply and rollback   |
| Rating, similar-standing matchmaking and seasonal resets                         | Implemented ranked persistence, queue/proposal services, standings and seasonal UI; [policy](../../../requirements/ranked-competition-policy.md), [API](../../../architecture/ranked-matchmaking-api-contract.md), [storage](../../../database/ranked-competition-persistence.md)                                                    | [#289](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/289), [#291](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/291), [#295](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/295), [#321](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/321) | Controlled two-player pairing, exactly-once rating settlement, closing/opening season and user comprehension |
| Concurrent contested zones and authoritative settlement                          | Implemented reviewed zone versions, location grants, influence ledger, ownership settlement and map/list interface; [policy](../../../requirements/contested-campus-zone-policy.md), [API](../../../architecture/contested-campus-territory-api-contract.md), [storage](../../../database/contested-campus-territory-persistence.md) | [#290](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/290), [#298](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/298), [#299](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/299), [#319](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/319) | Concurrent contributions, boundary/accuracy exclusions, hourly settlement, ownership and bonus outcomes      |
| Bilateral offers, all-or-nothing exchange and anti-drain limits                  | Implemented versioned offers, reserved copies, two-party acceptance, atomic exchange and confirmation UI; [policy](../../../requirements/card-trading-policy.md), [API](../../../architecture/card-trading-api-contract.md), [storage](../../../database/card-trading-persistence.md)                                                | [#292](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/292), [#300](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/300), [#301](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/301), [#324](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/324) | Two test accounts, stale acceptance, cancel/expiry, blocked copies, anti-drain rejection and rollback        |
| Console shows popular/ignored locations, question difficulty and issuance        | Implemented date-bounded Author analytics and aggregate/suppressed projections; [API](../../../architecture/advanced-analytics-api-contract.md), [storage](../../../database/advanced-analytics.md)                                                                                                                                  | [#302](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/302), [#303](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/303)                                                                                                                                                 | Controlled known totals, low-sample suppression, empty/error states and actionable Author interpretation     |

The live, trust, placement, ranked, territory, trade, and analytics rows cover
all seven Advanced groups in the supplied brief. They do not assert that every
deployed edge case is bug-free or that participant validation is complete.

### Cross-project and inherited requirements

| Area                                                            | Sprint 3 reference and changes                                                                                                                                                                                                                 | Regression or acceptance focus                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Explore, ordering challenges, trails and offline reconciliation | [Intermediate baseline](../sprint-2/evidence.md#features), [offline contract](../../../architecture/offline-challenge-play.md), [trail rules](../../../requirements/ordered-trails-rules.md)                                                   | Real location claims, server marking/reward, next trail step and reconnect reconciliation        |
| Collection, evolution, decks and CPU matches                    | [Card rules](../../../requirements/card-evolution-rules.md), [deck journey](../../../requirements/player-deck-building-journey.md), [CPU journey](../../../requirements/player-cpu-battle-journey.md); fixes #313, swaps #323, navigation #325 | Protected copies, valid selected deck, authoritative swap turn cost, CPU result/history          |
| Author curation and campaigns                                   | [Author contract](../../../architecture/author-curation-api-contract.md), [campaign contract](../../../architecture/campaign-scheduling-api-contract.md); package simplification #315                                                          | Complete question/event package, independent review and publication; dedicated Author test       |
| Account lifecycle                                               | [Retention/purge](../../../database/account-deletion-retention.md), [external validation](../../../testing/player-account-lifecycle-validation.md); #329                                                                                       | Physical purge and bounded shared audit, provider retry, old-token denial and fresh registration |
| Accessibility and mobile interaction                            | [Accessibility](../../../design/design-system.md); #306 and #328                                                                                                                                                                               | Keyboard/focus, reduced motion, touch layout and screen-reader observations                      |
| Performance                                                     | [Existing measurements](../../../testing/api-battle-responsiveness.md); #284 and #327                                                                                                                                                          | Actual authenticated paths, warm/cold requests, API stages and realtime delivery                 |
| Externally consumable API                                       | [Developer API](../../../architecture/developer-api.md), [key storage](../../../database/developer-api-keys.md); #304                                                                                                                          | Valid/revoked keys, public-only projections, pagination, rate limits and safe errors             |
| Delivery, database and dependency documentation                 | [CI](../../../testing/continuous-integration.md), [operations](../../../deployment/azure-deployment-setup.md), [database](../../../database/overview.md), [third parties](../../../architecture/technology-stack.md#application-stack)         | Required checks, named deployment/schema version, recovery and published docs                    |

### Follow-up proposals, not missing brief requirements

- **Randomized territory locations:** Current territory geometry is reviewed
  and fixed/versioned. Automatic event rotation is implemented but is a
  different feature. The proposed randomized-territory extension is in the
  [25 September review plan](../../stakeholder-interactions/2026-09-25-territories-and-rate-limits-review.md).
- **Upstash-backed quotas:** The developer API currently applies process-local
  per-key limits. Shared Upstash enforcement is proposed, not a current
  dependency or a completed external integration.
- **Feedback fixes:** `UT-S3-01` through `UT-S3-06` are recommended findings in
  the [results report](feedback.md), not
  automatically accepted, implemented or retested work.

## Verification

- **Feedback snapshot:** `main` at `c0fd42b`, 28 September 2026.
- **Focused PR #329 evidence:** revision `babc534`, later merged.

This page records results that were supplied or observed at those revisions. It
is not a fresh release audit. A procedure in the
[testing strategy](../../../testing/testing-strategy.md) is not a result.

### Status summary

| Area                    | Recorded evidence                                             | Limit                                                                            |
| ----------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| User feedback           | 15 CSV submissions                                            | Unique participants, devices, tested build, and observed tasks were not recorded |
| PR #329 database review | 3 selected tests passed; 6 skipped                            | Account deletion and retention scenarios only                                    |
| PR #329 API review      | 28 tests passed across five files                             | Account deletion, retry, and trust-restriction scope only                        |
| PR #329 type check      | Passed                                                        | API change only, not the full release                                            |
| Documentation checks    | Tests, lint, type check, build, and `git diff --check` passed | Documentation site only                                                          |
| Current coverage        | No verified artifact in this record                           | Configured thresholds are not results                                            |
| Current deployment      | Not verified in this record                                   | Requires a named deployment and smoke results                                    |

### User feedback

The [feedback report](feedback.md) contains 15 rows. Three
rows have identical answers. The export does not prove unique participants,
consent, session dates, devices, browsers, or the tested release.

Only two responses cover reconnect and one covers Author review. Treat these as
small-sample signals, not population failure rates. The report links findings to
repository context, but it does not prove that a later change fixed the issue.
A fix needs a linked change and a participant retest.

### Focused PR #329 review

The selected database run used:

```text
tests/account-deletion-persistence.integration.test.ts
--maxWorkers 1 --testTimeout 30000
-t 'physically deletes the account|purges expired trust snapshots|preserves a bounded formal trust case'
```

This is narrow evidence for PR #329. It does not validate live PvP, ranked play,
territories, trading, placement, trust review, analytics, the developer API, or
the full player journey.

### Coverage requirement

The Milestone 3 Advanced band requires measured coverage above 60% across all
codebases. The repository configures thresholds, but this record has no current
coverage report for the full system. Do not infer rubric attainment from a
threshold, test count, type check, or documentation build.

### Remaining checks

- Retest the six proposed feedback findings with recorded tasks and outcomes.
- Run the core and Advanced journeys on one named build with the correct roles.
- Capture coverage reports for every codebase.
- Verify current CI, deployment, protected API calls, realtime delivery, and
  production smoke checks.

Each new result should record the revision, environment, command or procedure,
outcome, skipped checks, and unresolved defects.

## Milestone 3 evidence map

The source is section 3.3 of the team-supplied _COMS3011A Project Brief_,
printed pages 10–11. The
[rubric excerpt](/files/assessment/milestone-3-rubric.pdf) preserves those
pages. Its Advanced automated-testing band requires coverage above 60% across
all codebases. A configured threshold is not a measured result.

| Criterion              | Weight | Main evidence                                                                                                                                                                | Still needed                                                     |
| ---------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| User feedback          |    10% | [testing strategy](../../../testing/testing-strategy.md#manual-and-field-validation) and [15-response report](feedback.md)                                                   | More recovery and Author tasks, with recorded retests            |
| Automated testing      |    10% | [Test strategy](../../../testing/testing-strategy.md), [automation guide](../../../testing/automated-verification.md), and [dated status](#verification)                     | Current coverage reports for every codebase                      |
| Feature implementation |    20% | [Feature matrix](#features) and linked pull requests                                                                                                                         | One integrated demonstration and a reviewed defect list          |
| API implementation     |    20% | [API reference](../../../api-reference.md), [live PvP contract](../../../architecture/live-pvp-api-contract.md), and [developer API](../../../architecture/developer-api.md) | Deployed authentication, error, retry, and realtime checks       |
| Performance            |     5% | [Battle response evidence](../../../testing/api-battle-responsiveness.md)                                                                                                    | Mobile and desktop timings, including warm and cold cases        |
| Improvement            |     5% | [Feedback traceability](feedback.md#traceability-summary) and [stakeholder records](../../stakeholder-interactions/index.md#sprint-3-review-plans)                           | Links from each accepted finding to its change and retest        |
| Documentation          |    15% | Product, API, database, test, deployment, and process guides on this site                                                                                                    | Publish the reviewed revision and keep status statements current |
| Project methodology    |    15% | [Team workflow](../../project-and-git-methodology.md), and [Sprint report](report.md)                                                                                        | Reconcile tracker state, reviews, and release evidence           |

This table helps markers find evidence. It does not predict a grade.

The original rubric source was `project_briefs.pdf`, SHA-256
`358dcf4b21c565e61fe89c9f96fe3ef6cf6252ad022db68b1a08405188679c71`.

## AI declaration

This matrix was generated and edited with assistance from Codex-CLI[gpt-6-sol] using the
supplied Wits Quest brief, current contracts/source, and repository merge
history. Implementation references and acceptance gaps are recorded separately.

This page was drafted and reviewed with assistance from
Codex-CLI[gpt-6-luna] and Codex-CLI[gpt-6-sol]. It was simplified with
assistance from Codex[GPT-5].

This guide was generated and edited with assistance from
Codex-CLI[gpt-6-sol] and Codex-CLI[gpt-6-luna]. It was simplified with
assistance from Codex[GPT-5].

Sprint report links updated with assistance from Codex[GPT-6].

Public evidence consolidated with assistance from Codex[GPT-6]. Historical
results, source revisions, original attributions, and acceptance limits are
preserved; no checks were rerun for this consolidation.

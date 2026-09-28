---
title: 'Sprint 3 user-testing plan'
---

# Sprint 3 user-testing plan

:::info[Feedback collected; task-based follow-up remains open]

The [Sprint 3 user feedback report](./sprint-3-user-feedback-results.md)
summarises 15 CSV submissions dated 28 September 2026 against repository
`main` snapshot `c0fd42b`. Three submissions have identical answer sets; the
CSV does not identify verified participants or the tested build. The report
proposes six findings, while only two submissions exercised reconnect and only
one exercised Author review. These are follow-up signals, not completed
acceptance testing.

This plan describes future sessions. It does not claim recruitment, sessions,
deployment, or retests have happened.

:::

## Evidence status

| Evidence class         | Status                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing questionnaire | 15 submitted rows dated 28 September 2026; three answer sets are identical; raw CSV remains in the team's private feedback folder                                      |
| Sanitised findings     | Six proposed findings and their denominators are in the [feedback report](./sprint-3-user-feedback-results.md)                                                         |
| Known limits           | Tested revision/deployment, participant identity, consent, role, device, facilitator observation, assistance, and reproduced defects are not established by the export |
| Planned follow-up      | Voluntary task sessions against a named build, focused retests, and separately identified role-specific tasks; no attendance or outcomes are assumed                   |

## Purpose

Observe whether players can complete retained core journeys and understand
Sprint 3's advanced features: live PvP, ranked seasons, contested territory,
trading, automatic placement, trust review, and analytics/developer API
workflows. Sessions assess comprehension, discoverability, recovery, and
interface feedback. They do not replace rules, security, privacy, load,
database, API-contract, accessibility, or release validation.

## Participants and provenance

Invite volunteers matching the intended Player and Author roles. Recruit
separately for Player journeys and privileged Author/reviewer workflows; do
not give ordinary players Author access or another person's account. Seek
varied familiarity with PvP/card games, mobile web use, and input methods where
practical. Convenience sessions are not representative sampling.

Use anonymous session codes. Keep any voluntary source/participant provenance
and the mapping needed to distinguish repeat submissions in the consent-
controlled private source folder, not the repository. Do not infer unique people
from 15 rows or merge survey answers with session observations without a
documented, consented basis. Report the denominator for each task and question:
eligible, attempted, completed, assisted, not tested, and excluded, as
applicable. The recovery feedback denominator is two reports that experienced
a disconnect; the Author package/review denominator is one tested response.
Do not generalise those small, self-reported groups to all respondents.

## Consent, privacy, and environment

Before each session, explain the purpose, voluntary participation, approximate
tasks, notes to be taken, retention, and the right to skip or stop. Written
answers are optional. Obtain separate explicit consent for recording, quotes,
or screenshots; do not make any of these a condition of participation. A
participant may instead answer verbally or provide no written feedback.

Record a named test/deployment and commit or deployment identifier before
testing. Use controlled accounts, seeded non-sensitive content, and a safe
environment. Never capture credentials, tokens, private account data, precise
location histories, or unredacted trust-case evidence. Keep raw notes and
consent-controlled materials outside the public repository; publish only
sanitised summaries. For territory/location tasks use a safe, permitted test
scenario and coarse outcomes, not unnecessary precise coordinates. Mark
unavailable, unsafe, or unconfigured tasks not run rather than simulating a
pass.

## Session process

1. Assign an anonymous code; note consent scope, role, named build, environment,
   device class, browser/OS family, viewport when available, and input method.
2. Explain that the product is being evaluated. Read the task prompt without
   naming controls or teaching the expected route.
3. Observe the participant's first action, path, outcome, hesitation, recovery,
   and assistance. Think-aloud is optional; do not lead or coach before noting
   independent behaviour.
4. Run the applicable core and role-specific tasks. Mark each task complete,
   complete with assistance, not complete, not run, or blocked, and record why.
5. Ask optional written or spoken feedback after tasks. Separate participant
   wording from facilitator interpretation.
6. Sanitise notes promptly. Consolidate findings only after retaining which
   anonymous sessions and task denominators support them.

## Player tasks

Use outcome-focused prompts. Skip unavailable capabilities honestly.

### Retained core journey

1. Sign in, find where to begin, and explain what Explore offers.
2. Find and inspect an event using map and text information; explain its
   availability and reported-location result when safe and available.
3. Start and complete a challenge, including ordering where available; explain
   timing, locked answers, completion, and review.
4. Locate the reward and collection state; create or update a valid deck and
   select it for play.
5. Start and complete a CPU battle, then locate its result/history.
6. Find profile/account controls and explain the available recovery or account
   actions without exposing personal information.

### Sprint 3 multiplayer and progression

1. Find and start a live PvP match. Identify the active player, legal action,
   timer/deadline, action result, and confirmed match state.
2. During a safe test match, refresh or deliberately disconnect, then use the
   provided return path. Explain the resumed actor, state, and remaining time;
   do not retry an uncertain action unless the UI establishes it was not
   committed. Test expiry/completion messaging where the fixture permits.
3. Find Ranked, distinguish it from asynchronous PvP and campus standings,
   identify the current season/rating/standing, and explain what a result or
   season boundary changes.
4. Inspect a contested territory, identify ownership/influence and the source
   of a contribution, and explain what the displayed result does and does not
   prove. Use only an approved test location/scenario.
5. Review a proposed trade: predict both players' give/receive changes before
   confirmation, then compare them with the server-confirmed outcome. Use test
   cards and preserve reservation/confirmation safeguards.
6. Complete the available automatic-placement journey. Explain the placement
   outcome and where it appears; do not imply the system has been validated if
   the relevant deployment or fixture is unavailable.

## Author and reviewer tasks

Run these only with a separately authorised test account and a participant
briefed on that role. Cover the available lifecycle: locate a draft, edit or
create a package, submit it for review, inspect a trust-review queue/case when
authorised, record a reasoned decision or return-for-changes action in the
test environment, and find the resulting history/status. Ask what evidence is
visible and what is withheld. Do not use real private trust evidence or
encourage self-review. Where the session is limited to package creation or
review feedback, report only that narrower task; one response in the existing
CSV is not broad Author validation.

## Analytics and developer API tasks

Use authorised test roles and synthetic/non-sensitive data. Ask a participant
to find a relevant analytics view, choose a date/filter/page, interpret the
aggregate and its limitations, and recover from empty/error/loading states.
For developer API work, use the documented sandbox/test credentials and
approved endpoints: locate API documentation, identify authentication and
permission requirements, make or inspect a permitted read request, interpret
the response/error, and locate rate-limit or pagination information where
available. Never ask a participant to disclose a secret. Analytics and API
tasks evaluate usability and safe interpretation, not privacy guarantees,
authorization correctness, query plans, or service performance; those require
their corresponding automated/security evidence.

## Observations and follow-up questions

For every task, record the outcome category, first action/path, backtracking,
misunderstandings, assistance, visible pending/confirmed/rejected/error state,
and recovery. Note relevant focus, keyboard, touch, zoom, text, contrast, motion,
or screen-reader friction that was actually observed. Capture timings only as
supporting context with build, device, browser, network, and start/end
definitions; do not treat task duration or a participant's speed impression as
an API benchmark.

Ask consistently, with spoken answers accepted and writing optional:

1. What did you think the task or feature would do?
2. What was clear, and where were you uncertain or stuck?
3. What changed after your action, and how could you tell it was confirmed?
4. What would you change first?
5. Was anything difficult to see, read, reach, or operate?

For focused retests, add a finding-specific comprehension prompt. Examples:
predict the trade inventory delta; distinguish rating, standings, and territory
influence; identify whether a live action committed; and describe the current
Author review state. Do not reconstruct quotations from memory.

## Performance benchmark guidance

Questionnaire opinions are not latency measurements. If slow paths recur,
reproduce them with an agreed benchmark protocol and a named release: define
warm/cold state, route/action, payload, concurrency, sample count, timing
boundaries, environment, and percentile/summary metrics before collecting
results. Capture browser experience and API/server timings separately, use
sanitised test data, and compare like-for-like runs. Do not publish a target,
sample count, result, or deployment as achieved unless it was actually measured
and recorded. Existing benchmark evidence remains tied to its own revision and
method; it is not evidence for a different release.

## Finding triage and traceability

Classify impact (critical, high, medium, low) from observed task effect, safety,
privacy, accessibility, recurrence, affected journey, workaround, and
implementation risk. One severe barrier can outrank a frequent preference.
Feedback never overrides server authority, confirmed rules, privacy, or
security requirements.

For each sanitised finding, retain stable ID, source anonymous session code(s),
task denominator, observed behaviour, expected behaviour, evidence class,
severity, decision, and rationale. Link accepted changes to an issue and PR;
record deferred/rejected recommendations and why. Retest the same task against
a named build and record improved/unchanged/regressed, assistance, and outcome.
Do not mark a finding resolved from issue closure, code presence, or an
unmatched questionnaire response alone.

## AI declaration

This plan was drafted with assistance from Codex-CLI[gpt-6-luna] and reviewed
and edited with Codex-CLI[gpt-6-sol]. It specifies procedures and contains no invented
participants, sessions, observations, or results.

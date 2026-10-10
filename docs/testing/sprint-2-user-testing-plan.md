---
title: 'Sprint 2 user-testing plan'
---

# Sprint 2 user-testing plan

:::info[Formal feedback collected; follow-up validation open]

This page defines the Sprint 2 formal user-testing process. Ten structured
questionnaire responses were collected on 13 September 2026. The sanitised
[Sprint 2 user-feedback results](./sprint-2-user-feedback-results.md) record the
aggregate evidence, five prioritised findings, resulting issues, implementation
evidence, and outstanding retest boundary.

The current release-validation work is tracked by
[#167 (`S2-09`)](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/167),
which remains open for participant retests and the wider accessibility, field,
stakeholder, deployment, and release evidence. The collected questionnaire is
not a claim of representative acceptance or completed follow-up validation.

:::

## Evidence status

| Evidence class              | Current status                                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contemporaneous evidence    | Ten questionnaire responses collected on 13 September 2026; raw consent-controlled export remains outside the repository                                                     |
| Sanitised repository record | [Aggregate results and finding traceability](./sprint-2-user-feedback-results.md), issues #240-#244, and PR #245                                                             |
| Evidence boundary           | The export does not establish participant demographics, device/browser context, facilitator observations, a representative sample, or completed retests                      |
| Future planned evidence     | Focused retests, remaining issue integration, accessibility and device observations, stakeholder review, deployment checks, and a final #167 outcome against a named release |

## Purpose

The sessions should evaluate whether a person can understand and complete the
core Wits Quest loop, whether the interface communicates server-authoritative
state clearly, and where usability or accessibility friction should change the
product. They do not replace correctness, security, database, performance, or
formal accessibility testing.

## Target participants

Prefer volunteers who resemble likely users, especially Wits students or other
campus users where practical. Seek varied familiarity with card games, campus
navigation, mobile Web applications, and assistive or alternative input. Plan
for the issue #167 minimum of five anonymised player sessions, but do not claim
representativeness from convenience participants or report an actual
participant count until recruitment and sessions occur.

Author-only tasks require a separate safe Author test account and may be tested
with team/client participants who understand that role. Ordinary player
participants should not be given production authorisation or another person's
account.

## Environment and devices

- Use a named test or deployed release and record its commit or deployment
  identifier.
- Prefer each participant's familiar phone where safe, supplemented by a known
  approximately 390 px mobile viewport and a normal desktop browser when
  responsive comparison matters.
- Record device class, operating system/browser family, input method, viewport
  where known, and relevant network or campus context without collecting device
  identifiers.
- Use controlled test accounts and non-sensitive content. Never record
  passwords, tokens, browser auth state, connection strings, or private account
  data.
- Exercise reported-location eligibility on campus only when practical, safe,
  and permitted. Record a coarse scenario and result, not unnecessary precise
  coordinates or a location history.
- If a capability is unavailable or unsafe in the chosen environment, mark the
  task not run and explain why rather than simulating a pass.

## Participant privacy and consent

Before a session, explain its purpose, approximate activities, voluntary
nature, what will be observed, whether notes/screenshots/recording are proposed,
and that the participant may stop or skip a task. Obtain explicit consent for
any recording separately.

Use a non-identifying session code. Do not collect names, student numbers,
emails, demographic detail, disability information, exact coordinates, or
credentials unless there is a necessary approved reason. Report accessibility
needs only at the level volunteered and needed to interpret the interaction.
Store raw notes and any consent-controlled media outside the public repository;
publish only sanitised findings.

## Session process

1. Record the release, environment, device context, facilitator, and anonymous
   session code.
2. Explain that Wits Quest, not the participant, is being evaluated. Avoid
   teaching the interface before the task.
3. Ask the participant to work naturally and optionally think aloud. The
   facilitator observes without leading, then records any assistance given.
4. Run applicable core tasks in a consistent order, allowing safety or
   environment constraints to omit a task honestly. Ask neutral prompts such
   as “What do you expect to happen?” and record any coaching after a block.
5. Ask the short feedback questions after the journey.
6. Review notes immediately, remove sensitive data, separate observation from
   interpretation, and create candidate findings.
7. Consolidate repeated findings only after preserving which sessions observed
   them; frequency does not replace impact.

## Core player tasks

Use outcome-focused prompts rather than naming the exact control to press:

1. Register or create a safe test account, sign in, and identify where to begin playing.
2. Explain what the Explore experience appears to offer.
3. Find and inspect an event using the available map and text information.
4. Use the reported-location/eligibility interaction where practical and
   explain the result shown.
5. Start and complete a challenge, including understanding time, locked answers,
   completion, and review.
6. Inspect the reward result and find the relevant collection state.
7. Create or update a valid deck and select it for play.
8. Start and complete a CPU battle, then find the stored result or history.
9. Use player profile/account, password-reset, and account-deletion entry points
   where safe and within the agreed session scope; include logout.

Record unavailable or unsafe tasks as not run with a reason. A facilitator
+completing a blocked task is not independent participant completion.

## Observations to record

For each task, record:

- completed, completed with assistance, not completed, not run, or blocked by a
  product/environment defect;
- the participant's first action and navigation path;
- hesitation, backtracking, repeated actions, misunderstandings, and requests
  for help;
- assistance given and the point at which it became necessary;
- error, loading, permission, timeout, empty, completed, and recovery states
  encountered;
- whether authoritative eligibility, score, reward, deck, and battle status was
  understood;
- whether map-independent information was found and usable;
- observable keyboard, focus, touch, zoom, text, contrast, motion, or
  screen-reader friction relevant to the participant; and
- concise participant wording only when captured accurately and consented. Do
  not reconstruct quotations from memory.

Task duration may be recorded as supporting context, but it is not a score and
must not be compared across materially different environments without noting
the difference.

## Usability and accessibility questions

The facilitator should evaluate:

- Can the participant tell what to do next without coaching?
- Is the difference between discovery, eligibility, challenge availability, and
  completion understandable?
- Are map and text representations consistent, and can the task continue when
  the map is unavailable?
- Are loading, failure, permission, retry, empty, disabled, and completed states
  clear and recoverable?
- Are controls labelled, reachable, and usable with the participant's input
  method?
- Does focus move predictably and remain visible where keyboard interaction is
  used?
- Are touch targets, text, wrapping, zoom, contrast, and motion comfortable in
  the observed context?
- Does game terminology explain enough without overwhelming the journey?
- Does the interface avoid implying that a reported location proves presence?

## Short participant feedback

Ask the same concise questions where possible:

1. What did you think Wits Quest wanted you to do?
2. Which part felt easiest, and why?
3. Where did you feel uncertain, stuck, or surprised?
4. Did any status, rule, or game term feel unclear?
5. Was anything difficult to see, reach, read, or operate?
6. What is the single most important change you would make?
7. Would you use this on campus, and what would affect that decision?

These answers are feedback, not formal acceptance or statistically
representative survey results.

## Finding severity and priority

Classify the observed impact before scheduling work:

| Severity | Meaning                                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical | Prevents a core journey for affected users, risks security/privacy/data integrity, or creates a severe accessibility barrier with no practical workaround |
| High     | Causes task failure or requires facilitator help on an important journey, with only a difficult workaround                                                |
| Medium   | Creates repeated confusion, delay, or error but the task can be completed independently                                                                   |
| Low      | Minor clarity, consistency, or polish issue with limited task impact                                                                                      |

Priority also considers recurrence across sessions, affected journey, safety,
accessibility, implementation risk, dependencies, and milestone timing. One
critical observation can outrank a frequently mentioned preference. Preferences
that conflict with protected authority, privacy, confirmed rules, or scope are
evaluated and documented rather than implemented automatically.

## Traceability into work

Give each sanitised finding a stable identifier such as `UT-S2-01`. Record its
source session code(s), observed behaviour, expected behaviour, evidence class,
severity, team evaluation, and decision.

- A change accepted for implementation becomes or links to a Gitea issue with
  acceptance criteria and the finding identifier.
- A rejected or deferred suggestion records the product, security,
  accessibility, technical, dependency, or scope reason without blaming the
  participant.
- The pull request and relevant test/documentation refer back to the issue and
  finding.
- Follow-up testing records whether the same task improved, remained, or
  regressed. It does not overwrite the original observation.

Use dispositions `Accepted`, `Postponed`, `Rejected with reason`, or
`Unresolved`; accepted means scheduled for action, not fixed. Preserve original
severity and observations. Retest the smallest reliable automated regression
and the relevant original participant/device/field task against a named fix
release. Record `Resolved`, `Improved but open`, `Not resolved`, `Regressed`, or
`Not run`, with evidence and limitations. Accepted Critical/High findings need
a real fix and retest before a release-blocking conclusion can be cleared.
Reference UT-S2-01–UT-S2-05 when following up the existing questionnaire rather
than counting the same observation again.

Publish a sanitised results summary only after sessions occur. Separate what
participants did, what they said, the team's interpretation, the decision, and
the resulting change.

## Safe failure-state probes

Where feasible, observe denied permission, inaccurate/stale/timed-out location,
unavailable map, upcoming/expired/completed event, challenge/API failure, poor
connectivity, invalid deck/action, and sign-in/session recovery. Record the
expected recovery and actual observation. Do not alter production services,
weaken security, expose account data, or direct participants into unsafe areas.
An infeasible probe is not run, with its reason recorded.

## Accessibility and device review

Check the core journey on mobile, tablet, and desktop with the relevant touch,
keyboard, and named screen-reader combinations. Cover navigation, labels and
landmarks, visible/logical focus, Escape and focus restoration in overlays,
status announcements, non-colour meaning, measured contrast, reduced motion,
200% zoom/enlarged text, touch targets, mobile keyboard/scrolling, and usable
map-independent completion. For each completed check, record release, date,
route/state, device/browser/input/assistive technology, expected and observed
behaviour, result (`Pass`, `Fail`, `Limited`, `Not run`), and finding/evidence.

Automated semantic/component and browser assertions are supporting evidence.
They do not replace full manual review. The existing named automated outcomes
are in [Sprint 2 results](sprint-2-validation-status.md#accessibility-checks--24-september).

## Stakeholder release review

Prepare the review from earlier [stakeholder records](../planning/stakeholder-interactions/index.md)
and accepted user findings. Record the target release, review date, represented
roles, facilitator, environment, and limitations. Demonstrate account/recovery,
Explore and eligibility, challenge formats and feedback, reward/collection,
legal decks, CPU battle/history, failure recovery, accessibility, and the
deployed Web/API/database/documentation boundary. Address known field,
operational, content, and gameplay gaps explicitly. Poor-GPS alternative proof
remains unimplemented; this review does not approve QR proof by implication.

Record `Confirmed`, `Change requested`, or `Unresolved` only after an explicit
stakeholder response. Separate feedback, decision, requested change, open
question, owner/follow-up, and real finding/issue references. State acceptance
scope and conditions, severe findings requiring fix/retest, and whether the
notes were reviewed by the stakeholder. Silence and a prepared agenda are not
approval. Keep attendance/consent details private where needed.

## Publishing session evidence

Publish one sanitised record per genuinely completed session with an anonymous
ID, date/time zone, release, broad environment/device/browser/input context,
task outcomes, assistance, limitations, finding IDs, and safe evidence links.
Keep consent and raw notes outside the repository. A useful summary counts
independent completion, difficulty, failure, and tasks not attempted with
reasons; it does not infer successful sessions from aggregate survey answers.

Screenshots must show the relevant task/state without faces, credentials,
tokens, private account data, or unnecessary precise coordinates. Temporary
captures remain in ignored `.pr-screenshots/`; publish only reviewed evidence.
Blank session, finding, accessibility, and review forms remain repository tools.

## AI declaration

This planned Sprint 2 user-testing process was generated, edited, and reviewed
with the assistance of Codex[GPT-5]. It contains no fabricated participants,
sessions, observations, quotations, or results.

Page title clarified with assistance from Codex-CLI[GPT-6].

Unique session, stakeholder-review, accessibility, and retest procedures consolidated with assistance from Codex[GPT-6]. Original forms were generated with Codex[GPT-5] and cross-referenced with Codex-CLI[GPT-6]; no sessions or results were created by this edit.

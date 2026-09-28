---
title: 'Sprint 3 user feedback and follow-up'
---

# Sprint 3 user feedback and follow-up

## Evidence status

This report records the sanitised results of the supplied Sprint 3 Google Forms
export, `Wits World - Sprint 3 User Feedback.csv`. It contains **15 submitted
responses**, all timestamped **28 September 2026**. Submission date is the
collection date; the export does not separately identify when each testing
session occurred or its timezone.

The export contains timestamps and questionnaire answers, with no name, email,
or participant-identifier columns. The raw CSV remains outside the public
repository in the team's user-testing feedback folder. This report publishes
aggregate counts and paraphrased themes rather than individual timestamps or
complete response records.

Three submissions contain identical answers across every questionnaire field.
All 15 submitted rows are retained in the counts below, but they are not treated
as 15 independently verified participants. Without participant identifiers or
facilitator records, the export alone cannot establish whether matching rows
are repeat submissions or different people giving the same answers.

## Collection method and limitations

- The questionnaire contains 24 numbered questions, six navigation-grid areas,
  and an optional bug-description follow-up. It covers player navigation,
  ordering challenges, trails, evolution, battles, rankings, territories,
  trading, and Author review.
- Fixed-choice counts were derived directly from the CSV using a structured
  CSV parser. Written answers were grouped by product concern and paraphrased.
- `Not tested` and equivalent choices remain visible. Where a finding concerns
  people who encountered a feature, its denominator excludes those choices.
- Recruitment, consent records, device/browser, account role, tested deployment
  or commit, assistance given, and observed task outcomes are not captured in
  this export. Questionnaire answers are self-reports, not reproduced defects
  or measured API timings.
- Existing implementation links below were checked against repository main at
  `c0fd42b` on 28 September 2026. The tested version is unknown, so those links
  provide technical context, not proof of a post-feedback fix or retest.
- Sprint 2 and Sprint 3 have different questionnaires and no linked participant
  identities. Their results are not a controlled before-and-after comparison.

## Response summary

### Discoverability

| Area        | Easy or very easy | Neither easy nor difficult | Difficult or very difficult | Not tested |
| ----------- | ----------------- | -------------------------- | --------------------------- | ---------- |
| Explore     | 10                | 1                          | 4                           | 0          |
| Collection  | 7                 | 6                          | 2                           | 0          |
| Decks       | 9                 | 2                          | 4                           | 0          |
| Battles     | 9                 | 3                          | 2                           | 1          |
| Leaderboard | 5                 | 5                          | 5                           | 0          |
| Profile     | 11                | 2                          | 2                           | 0          |

The Leaderboard has the weakest reported discoverability: only five of 15
responses rated it easy, with five neutral and five difficult. Deck discovery
also warrants follow-up despite nine positive responses.

### Responsiveness and overall experience

| Measure                 | Response counts                                                           |
| ----------------------- | ------------------------------------------------------------------------- |
| Overall responsiveness  | Fast: 8; very fast: 1; neutral: 2; slow: 3; very slow: 1                  |
| Battle action delay     | Acceptable: 11; very acceptable: 2; unacceptable: 1; very unacceptable: 1 |
| Reported bugs           | No: 10; unsure: 4; yes: 1                                                 |
| Would use again         | Probably: 8; definitely: 5; unsure: 1; definitely not: 1                  |
| Match recovery          | Not tested/no disconnect: 13; could not resume: 1; resumed with help: 1   |
| Author package creation | Not tested: 14; easy: 1                                                   |
| Author review feedback  | Not tested/not encountered: 14; clear: 1                                  |

Thirteen responses rated battle delay acceptable or very acceptable, and 13
indicated they would probably or definitely use Wits World again. These are
positive signals within the submitted sample, not evidence that every journey
is fast, bug-free, or well understood.

### Feature understanding

| Feature                                    | Yes | Partially | No  | Not tested/not encountered |
| ------------------------------------------ | --- | --------- | --- | -------------------------- |
| Event availability states                  | 5   | 8         | 1   | 1                          |
| Ordering questions                         | 6   | 8         | 1   | 0                          |
| Next event in a trail                      | 6   | 7         | 2   | 0                          |
| Evolution availability                     | 7   | 7         | 1   | 0                          |
| Evolution copies consumed and result       | 6   | 7         | 1   | 1                          |
| Swap consumes a turn                       | 7   | 6         | 1   | 1                          |
| Asynchronous PvP versus Live Ranked        | 6   | 8         | 1   | 0                          |
| Live turn timer                            | 7   | 6         | 2   | 0                          |
| Progression points/standings versus rating | 5   | 9         | 1   | 0                          |
| Seasons and rating resets                  | 7   | 6         | 2   | 0                          |
| Zone ownership and influence               | 6   | 7         | 2   | 0                          |
| Cards given and received in a trade        | 6   | 7         | 1   | 1                          |

Battle turn ownership was clear `Always` in five responses and `Most of the
time` in eight; one selected `Sometimes` and one `Rarely`. Action effects were
understood `Always` in four responses, `Most of the time` in seven, `Sometimes`
in three, and `Rarely` in one.

## Prioritised findings

### UT-S3-01: Action results can appear unchanged or unconfirmed

**Evidence:** One response selected `Yes` to encountering a bug and described
opening a battle, selecting an action, and sometimes seeing no visible change.
Four selected `Unsure`: their written descriptions concern unclear state changes
or actions that appeared to do nothing, including one explicitly
non-reproducible report. Several improvement suggestions request more visible
status, error, and action-result feedback.

**Evaluation:** Recommended High-priority investigation. Distinguish a request
that failed, an action rejected as illegal, a committed action whose projection
was not displayed, and a valid result that was simply hard to notice. This does
not establish an accepted illegal action, missing database write, or duplicate
submission.

**Integration context:** Merged
[PR #318](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/318)
unifies battle presentation across modes, and merged
[PR #328](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/328)
consolidates responsive and Player Battle polish. These are existing
implementations to inspect, not verified resolutions of this feedback.

**Recommended response:** Reproduce the action path against a named deployment.
Make pending, confirmed, rejected, and uncertain/recovering outcomes distinct
and keep the latest confirmed result visible. Preserve submission locking,
idempotency, and server authority; do not encourage resubmission simply because
a response is slow.

**Remaining evidence:** Battle mode, device/browser, exact action, request and
response outcome, and a participant retest are not supplied. Create a focused
bug issue once the reproduction is recorded.

### UT-S3-02: Match recovery needs a targeted test

**Evidence:** Thirteen responses did not leave or lose connection. Of the two
that did, one reported being unable to resume and one resumed with help. No
response reports unaided successful recovery. The written bug descriptions do
not identify the failed recovery's route, battle mode, or steps.

**Evaluation:** Recommended High-priority investigation because loss of access
to an active match affects a core journey. The denominator is **two recovery
responses**, not all 15; this is a small signal requiring reproduction, not a
population failure rate.

**Integration context:** The
[live PvP contract](../architecture/live-pvp-api-contract.md) defines persisted
state, reconnect generations, deadlines, and safe recovery. Existing gateway
work is linked in
[PR #285](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/285),
with the player experience in PR #318.

**Recommended response:** Test refresh, deliberate disconnect, temporary
network loss, expired authentication, and resume entry points separately for
CPU, asynchronous PvP, and Live Ranked. A recovered view must show the current
server-confirmed actor, state, and deadline without replaying an action or
resetting the timer. Expired or completed matches need an explicit outcome
instead of an unexplained resume failure.

**Remaining evidence:** Record a reproducible issue and repeat the affected task
without facilitator assistance before marking recovery handled.

### UT-S3-03: Modes, ratings, standings, and territory influence are hard to distinguish

**Evidence:** Only five of 15 responses fully distinguish progression
points/campus standings from competitive rating; nine selected `Partially` and
one `No`. Six fully distinguish asynchronous PvP from Live Ranked. Seven
understand seasons/resets, and six understand zone ownership and influence.
Six written session descriptions explicitly mention difficulty interpreting
progression systems, rankings, or the ratings/standings distinction.

**Evaluation:** Recommended Medium priority. Players need to know which activity
changes which measure, without conflating points, competitive rating, seasonal
position, or territory influence.

**Integration context:** Merged
[PR #325](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/325)
provides a dedicated Leaderboard and moves campus standings out of Profile.
The report does not establish whether respondents used that version.

**Recommended response:** Review labels and short contextual descriptions at
the relevant entry points. Keep progression standings distinct from ranked
rating and season resets, and explain how eligible ranked results contribute
to zone ownership. Compare battle modes where players choose one rather than
relying on distant documentation.

**Remaining evidence:** Ask respondents to explain each measure and choose the
appropriate battle mode after the change. No new finding-specific issue, PR, or
retest has been recorded by this report.

### UT-S3-04: Navigation and next-step guidance need to be more discoverable

**Evidence:** Five responses rated Leaderboard discovery difficult, four
rated Decks difficult, and four rated Explore difficult. Only six of 15 fully
understood the next trail event; seven selected `Partially` and two `No`.
Ordering questions were fully understandable to six of 15. Among the 14
responses that encountered event states, five found them clear, eight partially
clear, and one unclear. Written suggestions request consistent entry points,
clearer objectives, and a more visible next trail step.

**Evaluation:** Recommended Medium priority. Treat this as a connected journey
problem rather than adding explanatory paragraphs to every screen.

**Integration context:** PR #325 changes Collection/Decks and Leaderboard
navigation. Existing
[ordered trail rules](../requirements/ordered-trails-rules.md) and the
[ordering challenge contract](../architecture/challenge-attempt-api-contract.md)
provide the authoritative behavior against which guidance must be checked.

**Recommended response:** Audit the current entry points and show the next
relevant action where the player is working. Make the next trail event and its
availability easy to identify; retain text labels for availability states.
Clarify ordering interaction and submission state without changing marking or
eligibility rules.

**Remaining evidence:** Repeat discovery, event-state recognition, one ordering
question, and the next trail step against a named build. Record task completion
and assistance, not only satisfaction ratings.

### UT-S3-05: Evolution and trade confirmations need clearer consequences

**Evidence:** Seven of 15 fully understood evolution availability; seven
selected `Partially` and one `No`. Of the 14 responses that encountered evolution
confirmation, six understood copies consumed and the result, seven partially
understood, and one did not. Trade give/receive clarity has the same 6/7/1
distribution among 14 applicable responses. Written suggestions request more
prominent evolution requirements and a clearer trade summary.

**Evaluation:** Recommended Medium priority. Consuming copies or exchanging
ownership requires understandable confirmation even if the backend operation is
correct. No response establishes an incorrect exchange or lost card.

**Integration context:** Merged
[PR #313](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/313)
repairs evolution availability with trade reservations. Merged
[PR #324](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/324)
provides the trading experience. Neither constitutes a retest of these
understanding concerns.

**Recommended response:** Surface exact evolution requirements and unavailable
reasons before confirmation, then identify the copies consumed and evolved
definition received. Make both sides of a trade and the committed result
scannable; retain protected-copy, reservation, and version checks.

**Remaining evidence:** Ask a player to predict the inventory change before
confirming, then check it against the server-confirmed outcome. Link any
resulting UI change and follow-up session to this finding.

### UT-S3-06: Battle timing and effect cues are not consistently understood

**Evidence:** Thirteen of 15 understood turn ownership always or most of the
time, but only 11 understood action effects at those levels. Eight did not
fully understand the Live timer. Of 14 responses that encountered swapping,
seven fully understood its turn cost, six partially understood, and one did
not. One written suggestion specifically asks for a more prominent timer near
expiry.

**Evaluation:** Recommended Medium priority. Improve the less consistent cues
without treating the generally positive delay ratings as a reason to remove
pending states, legal-action guards, or authoritative confirmation.

**Integration context:** The
[CPU battle journey](../requirements/player-cpu-battle-journey.md), live PvP
contract, and PRs #318/#328 define existing presentation and turn behavior.

**Recommended response:** Audit active effects, remaining uses/durations, damage,
healing, Power changes, and turn ownership on mobile as well as desktop.
Make impending Live expiry prominent and distinguish a voluntary turn-consuming
swap from mandatory replacement. Keep text cues alongside color and animation.

**Remaining evidence:** Retest interpretation of a buff/debuff, a swap, and a
near-expiry Live turn. No completed participant follow-up is supplied.

## Coverage gaps and positive signals

- **Author review:** Only one response tested package creation and review
  feedback, rating them easy and clear. Fourteen did not test either. Arrange
  a separate Author session covering draft questions, packaged submission,
  requested changes, and publication before claiming broad Author validation.
- **Recovery:** Test deliberately; normal uninterrupted sessions cannot validate
  reconnect or resume behavior.
- **Performance:** The 13 positive battle-delay answers and nine positive
  overall-speed answers support preserving current optimizations. Four still
  rated overall speed slow/very slow and two rejected battle delay. Diagnose
  those paths with browser/API timing rather than inferring latency from the
  questionnaire. See [existing performance evidence](api-battle-responsiveness.md).
- **Engagement:** Thirteen submissions indicate likely repeat use. Keep this
  as a sample-level attitude measure, not a retention or adoption forecast.

## Traceability summary

| Finding  | Primary concern                                         | Recommended priority | Existing implementation context |
| -------- | ------------------------------------------------------- | -------------------- | ------------------------------- |
| UT-S3-01 | Unchanged or unconfirmed action result                  | High investigation   | PRs #318, #328                  |
| UT-S3-02 | Resume/reconnect failure or assistance                  | High investigation   | PRs #285, #318                  |
| UT-S3-03 | Modes, rankings, resets, and territory meaning          | Medium               | PR #325 and current rules       |
| UT-S3-04 | Navigation, event states, ordering, and trail guidance  | Medium               | PR #325 and current journeys    |
| UT-S3-05 | Evolution/trade requirements and inventory consequences | Medium               | PRs #313, #324                  |
| UT-S3-06 | Timer, effects, and swap turn-cost cues                 | Medium               | PRs #318, #328                  |

These priorities are recommendations for team triage, not recorded stakeholder
acceptance. This documentation change creates no Gitea issues, marks no finding
resolved, and does not claim the existing PRs were caused by this questionnaire.

## Follow-up evidence required

1. Triage the two High-priority investigations first. Capture reproducible
   steps, battle mode, deployment/build, device/browser, and sanitized request
   outcomes; create focused bug issues when the failure is established.
2. Agree which Medium-priority usability recommendations to implement, defer,
   or reject, with a reason. Link each accepted action to its Gitea issue and PR.
3. Retest the affected tasks with anonymous session codes and a named build.
   Record completion, assistance, observed outcome, and whether the finding
   improved, remained, or regressed.
4. Include dedicated reconnect and Author-review tasks to close the current
   coverage gaps. Record participant/source provenance privately to distinguish
   repeat submissions without publishing identities.
5. Update this report with implementation and retest evidence. Keep raw CSVs,
   individual timestamps, credentials, and precise location information out of
   the public documentation.

## AI declaration

This sanitised report was generated and edited with assistance from Codex.
Counts were derived from the team-supplied CSV using Python's CSV parser;
written themes were paraphrased and implementation context checked against
repository main. No additional responses, issue closures, or retest outcomes
were added.

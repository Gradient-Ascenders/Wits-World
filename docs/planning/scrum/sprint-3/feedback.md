---
title: Sprint 3 user feedback
description: Survey charts, focused written feedback, implementation proof, and remaining retests.
sidebar_position: 2
toc_max_heading_level: 2
---

# Sprint 3 user feedback

## Evidence status

This report records the sanitised results of the supplied Sprint 3 Google Forms
export, `Wits World - Sprint 3 User Feedback.csv`. It contains **15 submitted
responses**, all timestamped **28 September 2026**. Submission date is the
collection date; the export does not separately identify when each testing
session occurred or its timezone.

The export contains timestamps and questionnaire answers, with no name, email,
or participant-identifier columns. The raw CSV remains outside the public
repository in the team's user-testing feedback folder. This report publishes aggregate counts, anonymous comment excerpts, and the
supplied screenshots, not individual timestamps or complete response records.
The screenshots show the same 15-response counts as the CSV; their capture date
and tested build are unknown.

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
- The original implementation context was checked at `c0fd42b` on 28 September 2026. The current implementation review below is dated separately. Neither
  identifies the participants' tested build or proves a post-feedback retest.
- Focused crops keep the original screenshot pixels and verbatim comments.
  Full screenshots and all complete visible comments are retained in one
  [Full survey evidence](#full-survey-evidence) section. A selected comment
  illustrates a concern; it does not establish its frequency.
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

Each finding connects **feedback → implemented change → code and test evidence**.
The six original priorities remain recommendations for team triage; this update
creates no issues and records no participant retests.

**Implementation review: 10 October 2026.** Source and test links are pinned to
[main revision `01a364f`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6).
Those linked files match the locally tested revision `d0d716b`.
Changes dated after Sprint 3 are identified separately. They show how the current
product addresses a concern, not what respondents used or which changes were
caused by their feedback.

### Make action results unmistakable

**Feedback:** One submission reported a bug and four were unsure. The visible
comments describe actions that seemed to leave the interface unchanged; one
explicitly says the behaviour could not be reproduced consistently. The concern
is confirmation, not an established lost write or illegal action.

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/focused-action-results.svg" aria-label="Open full-size focused evidence: Make action results unmistakable">
    <img
      src="/img/feedback/sprint-3/focused-action-results.svg"
      alt="Opening the battle screen and selecting an action sometimes left the interface unchanged, so I could not tell whether the action had registered."
      width="720"
      height="60"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>Opening the battle screen and selecting an action sometimes left the interface unchanged, so I could not tell whether the action had registered.</p>
    <a href="/img/feedback/sprint-3/written-bug-descriptions.png">Full source screenshot</a>
  </figcaption>
</figure>

**Changed:** Live battle views distinguish sending, acknowledged, reconnecting,
recovered, and completed states. Input stays locked while an action is pending
or the connection is uncertain. The last confirmed battlefield remains visible;
battle activity groups an action with its costs and effects rather than leaving
the player to infer the result from changed numbers alone.

**Proof:** [Merged PR #318 — 26 September](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/f5f739a2e01c65100a332b129dcb0c74d503f813)
introduced shared battle presentation; [PR #328 — 28 September](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/c425868ba6cee93ab242376e41239ad647a89174)
consolidated Player Battle polish.
[Current Live battle feedback](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/pages/LiveMatchPage.tsx#L258)
shows the distinct states.
The [pending/stale-action regression](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/live-pages.test.tsx#L1272)
checks immediate locking, duplicate prevention, and recovery from server state;
the [battle activity regression](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/battle-log-presentation.test.ts#L19)
checks grouped costs/effects without losing events. Both passed locally.

**Still needed:** Reproduce the reported unchanged action on a named deployment
and record whether it was rejected, committed but not displayed, or simply hard
to notice. The original report is not proven resolved by these tests.

### Make match recovery clear and reliable

**Feedback:** Thirteen submissions did not attempt recovery. Of the two that
did, one resumed with help and one could not resume; none reported unaided
success. The denominator is **two recovery responses**, not a 15-person failure
rate. No written comment supplies the failed route or battle mode, so the chart
is shown instead of attaching an unrelated quote.

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/focused-recovery.svg" aria-label="Open full-size focused evidence: Make match recovery clear and reliable">
    <img
      src="/img/feedback/sprint-3/focused-recovery.svg"
      alt="Match recovery: 13 not tested/no disconnect; one resumed with help; one could not resume. No unaided success was reported."
      width="724"
      height="310"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>Match recovery: 13 not tested/no disconnect; one resumed with help; one could not resume. No unaided success was reported.</p>
    <a href="/img/feedback/sprint-3/timer-recovery-progression.png">Full source screenshot</a>
  </figcaption>
</figure>

**Changed:** The Live session reconnects and reconciles pending actions against
the latest server projection. The view shows reconnecting/recovered states and
explains that the turn deadline continues during connection loss. Revoked or
unavailable sessions are not presented as successfully recovered.

**Proof:** [Live session implementation](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/pages/useLiveBattleSession.ts)
and [reconnect/pending-action tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/live-session-boundaries.test.tsx#L89)
cover version gaps, terminal revocation, and explicit recovery. The
[Live transport-loss regression](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/live-pages.test.tsx#L1339)
checks reconnection, dropout guidance, and the terminal server result. These
passed with mocked transport and API responses; they are not a deployed
disconnect test.

**Still needed:** Repeat refresh, network loss, and resume without assistance in
CPU, asynchronous PvP, and Live Ranked. Record the current actor/state/deadline
and completed or expired outcomes without replaying actions or resetting time.

### Explain ratings, standings, and battle modes

**Feedback:** Only five of 15 submissions fully distinguished progression
points/campus standings from competitive rating; nine selected `Partially`
and one `No`. Six fully distinguished asynchronous PvP from Live Ranked.
Written comments ask for explanations near the relevant screens.

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/focused-ratings-standings.svg" aria-label="Open full-size focused evidence: Explain ratings, standings, and battle modes">
    <img
      src="/img/feedback/sprint-3/focused-ratings-standings.svg"
      alt="Clarify the difference between ratings and standings near the relevant screens."
      width="704"
      height="38"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>Clarify the difference between ratings and standings near the relevant screens.</p>
    <a href="/img/feedback/sprint-3/written-priorities-repeat-use.png">Full source screenshot</a>
  </figcaption>
</figure>

**Changed:** Campus standings now have a dedicated Leaderboard, separate from
the Live Ranked season rating and season standings. Ranked projections refresh
at season boundaries rather than mixing old and new seasons. Territory guidance
explains that eligible ranked wins add influence after a match.

**Proof:** [Merged PR #325 — 27 September](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/401fc0d03fbae1e880224632a89581312ee5f360)
introduced the dedicated [Leaderboard](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/pages/LeaderboardPage.tsx).
The [Leaderboard separation regression](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/profile-page.test.tsx#L86)
and [season-rollover regression](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/live-pages.test.tsx#L1092)
passed. [Current territory guidance](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/components/exploration/TerritoryDiscovery.tsx#L190)
is part of [later PR #336 — 30 September](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/04fcfa4d8dac26b781ded1b3cefc22834aa40f4d);
it is not backdated into Sprint 3.

**Still needed:** Separate screens and correct rollover do not prove players
understand the measures. A concise comparison of progression, rating, seasons,
influence, and battle modes still needs a comprehension retest.

### Make navigation and the next step easier to find

**Feedback:** Discovery was difficult for five Leaderboard submissions and four
each for Decks and Explore. Only six of 15 fully understood the next trail event,
and six fully understood ordering questions. Visible comments request consistent
entry points and clearer objectives without more explanatory clutter.

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/focused-navigation.svg" aria-label="Open full-size focused evidence: Make navigation and the next step easier to find">
    <img
      src="/img/feedback/sprint-3/focused-navigation.svg"
      alt="The navigation was extremely confusing and it was often unclear whether an action had worked or what I was expected to do next."
      width="704"
      height="60"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>The navigation was extremely confusing and it was often unclear whether an action had worked or what I was expected to do next.</p>
    <a href="/img/feedback/sprint-3/written-session-feedback-continuation.png">Full source screenshot</a>
  </figcaption>
</figure>

**Changed:** Decks are reached through Collection and campus standings through
Leaderboard. Trail views distinguish completed, current, and locked stops and
open the current event. Ordering questions support accessible reorder controls,
announce the current order, and preserve it after a retryable submission error.

**Proof:** [Current trail presentation](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/components/exploration/TrailDiscovery.tsx)
includes the navigation refinements in
[later PR #336 — 30 September](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/04fcfa4d8dac26b781ded1b3cefc22834aa40f4d).
The [current-stop regression](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/trail-discovery.test.tsx#L105)
checks which stop can open;
[ordering interaction tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/challenge-page.test.tsx#L179)
check keyboard/pointer ordering and safe submission/retry. These passed locally.

**Still needed:** A complete first-time guide is not established by these
changes. Retest discovery, event-state recognition, an ordering question, and
the next trail step; record completion and assistance.

### Explain what evolution and trading will change

**Feedback:** Seven of 15 submissions fully understood evolution availability;
six understood copies consumed and the result, and six understood trade
consequences. The written requests are specific: show requirements earlier and
summarise both sides before confirmation.

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/focused-evolution-trades.svg" aria-label="Open full-size focused evidence: Explain what evolution and trading will change">
    <img
      src="/img/feedback/sprint-3/focused-evolution-trades.svg"
      alt="Add a clearer summary of what each player gives and receives before confirming a trade. Show the evolution requirements more prominently before a card is selected."
      width="704"
      height="84"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>Add a clearer summary of what each player gives and receives before confirming a trade.</p>
    <p>Show the evolution requirements more prominently before a card is selected.</p>
    <a href="/img/feedback/sprint-3/written-priorities-repeat-use.png">Full source screenshot</a>
  </figcaption>
</figure>

**Changed:** Evolution previews identify required/available copies and protected
or reserved copies. Final confirmation states how many copies are consumed,
which card is created, how many remain, and that the operation cannot be undone.
Trade detail compares both parties' cards and confirms the displayed offer
version; stale acceptance refreshes the offer rather than silently accepting
changed terms.

**Proof:** [Later PR #341 — 2 October](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/e740e0bdb356202598ebe420e0bd60d0f6d7ef5c)
refined evolution/trading after Sprint 3.
[Evolution confirmation](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/components/cards/CardEvolutionFlow.tsx#L282)
and [trade comparison/confirmation](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/pages/TradeDetailPage.tsx#L469)
show the implemented copy and version boundaries.
The [evolution preview/confirmation tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/collection-page.test.tsx#L716)
and [stale trade-acceptance test](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/trade-detail-boundaries.test.tsx#L160)
passed. This proves current interface behaviour under fixtures, not participant
understanding.

**Still needed:** Ask players to predict the inventory change before confirming,
then compare their prediction with the server-confirmed result. Check that
requirements are noticeable before choosing a card, not merely available later.

### Make the Live timer and battle effects easier to read

**Feedback:** Eight of 15 submissions did not fully understand the Live timer.
Action effects were understood always/most of the time in 11 submissions;
seven of the 14 that encountered swapping fully understood its turn cost.
One visible improvement request asks for a more prominent timer near expiry.

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/focused-live-timer.svg" aria-label="Open full-size focused evidence: Make the Live timer and battle effects easier to read">
    <img
      src="/img/feedback/sprint-3/focused-live-timer.svg"
      alt="Make the Live turn timer more prominent, especially when it is close to running out."
      width="704"
      height="32"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>Make the Live turn timer more prominent, especially when it is close to running out.</p>
    <a href="/img/feedback/sprint-3/written-priorities-repeat-use.png">Full source screenshot</a>
  </figcaption>
</figure>

**Changed:** The Live status dock displays the countdown and server deadline,
uses a warning state at ten seconds or less, and switches to deadline-reached
feedback at expiry. Shared battle presentation shows active effects and
server-projected move effectiveness; normal swaps stay separate from mandatory
replacement choices.

**Proof:** [Countdown and warning implementation](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/pages/LiveMatchPage.tsx#L215)
and [shared battle presentation](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/components/matches/BattlePresentation.tsx)
provide code evidence.
The [shared move/replacement regressions](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/battle-presentation.test.tsx#L131)
and [legal-swap regression](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/battle-controls.test.tsx#L44)
passed. The ten-second warning was code-inspected; this run does not include a
separate assertion that a player notices or understands it.

**Still needed:** Retest a near-expiry turn, a buff/debuff, and a voluntary
turn-consuming swap. Legal controls and effect labels alone do not establish
understanding of turn cost.

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
  questionnaire. See [existing performance evidence](../../../testing/api-battle-responsiveness.md).
- **Engagement:** Thirteen submissions indicate likely repeat use. Keep this
  as a sample-level attitude measure, not a retention or adoption forecast.

## Traceability summary

| Concern                   | Recommended priority | Implemented evidence                                                              | Still needed                                          |
| ------------------------- | -------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Action results            | High investigation   | Pending/acknowledged feedback, retained confirmed state, grouped activity; tested | Reproduce the unchanged result on a named deployment  |
| Match recovery            | High investigation   | Reconciliation and reconnect states; mocked recovery tests                        | Unaided recovery in each battle mode                  |
| Ratings and modes         | Medium               | Separate Leaderboard/season views, season rollover, influence guidance            | Explain each measure and choose the right mode        |
| Navigation and next steps | Medium               | Current trail stop and accessible ordering; tested                                | Discovery/ordering/trail task completion without help |
| Evolution and trading     | Medium               | Copy/result preview, final confirmation, versioned trade review; tested           | Predict and verify the inventory change               |
| Timer and effects         | Medium               | Countdown warning source, projected effects and legal-swap tests                  | Notice near expiry and explain effects/swap cost      |

Implementation evidence does not mark a recommendation accepted or resolved,
and the existing PRs are not attributed to this questionnaire.

## Local implementation verification

**10 October 2026; local revision `d0d716b`: 199 tests passed across 13 files.**
The selected source and test files match the pinned main revision above.

```text
cd apps/web
npx vitest run tests/live-pages.test.tsx tests/live-session-boundaries.test.tsx \
  tests/battle-log-presentation.test.ts tests/battle-presentation.test.tsx \
  tests/battle-controls.test.tsx tests/matches-pages.test.tsx \
  tests/trail-discovery.test.tsx tests/challenge-page.test.tsx \
  tests/territory-experience.test.tsx tests/collection-page.test.tsx \
  tests/trade-pages.test.tsx tests/trade-detail-boundaries.test.tsx \
  tests/profile-page.test.tsx
```

These are Node/jsdom checks with mocked API, realtime, map, and identity
dependencies. They establish the selected interface/state regressions, not
production timing, database integration, or user acceptance.
No browser, live database, hosted CI, deployed journey, or participant checks
were run for this update. The full application suite was not completed.

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
5. Add deployed and participant retest evidence to the current code/test links.
   Keep raw CSVs,
   individual timestamps, credentials, and precise location information out of
   the public documentation.

## Full survey evidence

<details>
  <summary>View all original charts, written responses, and transcripts</summary>

The eleven supplied screenshots are preserved unchanged, including capture
artefacts. The question 1 grid is horizontally clipped and question 9 is
vertically clipped; missing chart details are not redrawn. Question 22 appears
in two images and is counted once.

Written transcripts include **all 23 complete visible comments**, including
positive feedback. They are excerpts, not all answers: question 21 reports 15
responses but the two supplied views show twelve complete comments; question
22a reports five but shows three; question 23 reports 15 but shows eight.
The continuation screenshot has no visible question header or count. Question
totals must not be added together as unique participants, and the comments do
not establish that a change was implemented or retested.

<h3>Navigation, responsiveness, and event states</h3>

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/navigation-responsiveness-events.png" aria-label="Open full-size screenshot: Navigation, responsiveness, and event states">
    <img
      src="/img/feedback/sprint-3/navigation-responsiveness-events.png"
      alt="Navigation, responsiveness, and event states"
      width="797"
      height="1098"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>Questions 1–3. Only Explore, Collection, Decks, and Battles are visible in the navigation grid; Leaderboard and Profile counts below come from the earlier CSV.</p>
  </figcaption>
</figure>

<h3>Ordering questions, trails, and evolution availability</h3>

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/ordering-trails-evolution.png" aria-label="Open full-size screenshot: Ordering questions, trails, and evolution availability">
    <img
      src="/img/feedback/sprint-3/ordering-trails-evolution.png"
      alt="Ordering questions, trails, and evolution availability"
      width="780"
      height="1085"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>Questions 4–6.</p>
  </figcaption>
</figure>

<h3>Evolution consequences and battle understanding</h3>

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/evolution-battle-understanding.png" aria-label="Open full-size screenshot: Evolution consequences and battle understanding">
    <img
      src="/img/feedback/sprint-3/evolution-battle-understanding.png"
      alt="Evolution consequences and battle understanding"
      width="798"
      height="1083"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>Questions 7–9. The bottom of the question 9 chart is clipped and capture artefacts cross question 7; the original screenshot is unchanged.</p>
  </figcaption>
</figure>

<h3>Battle delay, swapping, and multiplayer modes</h3>

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/battle-delay-swap-modes.png" aria-label="Open full-size screenshot: Battle delay, swapping, and multiplayer modes">
    <img
      src="/img/feedback/sprint-3/battle-delay-swap-modes.png"
      alt="Battle delay, swapping, and multiplayer modes"
      width="779"
      height="1009"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>Questions 10–12.</p>
  </figcaption>
</figure>

<h3>Live timer, match recovery, and progression measures</h3>

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/timer-recovery-progression.png" aria-label="Open full-size screenshot: Live timer, match recovery, and progression measures">
    <img
      src="/img/feedback/sprint-3/timer-recovery-progression.png"
      alt="Live timer, match recovery, and progression measures"
      width="781"
      height="1082"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>Questions 13–15. A capture artefact crosses the timer chart; the original screenshot is unchanged.</p>
  </figcaption>
</figure>

<h3>Seasons, campus zones, and trade consequences</h3>

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/seasons-zones-trades.png" aria-label="Open full-size screenshot: Seasons, campus zones, and trade consequences">
    <img
      src="/img/feedback/sprint-3/seasons-zones-trades.png"
      alt="Seasons, campus zones, and trade consequences"
      width="790"
      height="1037"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>Questions 16–18. A capture artefact crosses the zone chart; the original screenshot is unchanged.</p>
  </figcaption>
</figure>

<h3>Author package creation and review feedback</h3>

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/author-experience.png" aria-label="Open full-size screenshot: Author package creation and review feedback">
    <img
      src="/img/feedback/sprint-3/author-experience.png"
      alt="Author package creation and review feedback"
      width="797"
      height="768"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>Questions 19–20. Fourteen of 15 responses did not test either task.</p>
  </figcaption>
</figure>

<h3>Session feedback and reported bugs</h3>

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/written-session-feedback-bugs.png" aria-label="Open full-size screenshot: Session feedback and reported bugs">
    <img
      src="/img/feedback/sprint-3/written-session-feedback-bugs.png"
      alt="Session feedback and reported bugs"
      width="792"
      height="913"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>Questions 21–22. Fifteen responses reported for question 21; six complete comments visible.</p>
    <p>21. What was the most confusing or frustrating part of this session?</p>
    <ol>
      <li>The difference between progression points, campus standings, and competitive rating was not always obvious, and some next-step guidance felt easy to miss.</li>
      <li>The main friction was finding the right area on the first attempt; once there, most battle interactions were straightforward.</li>
      <li>The core flow was enjoyable once I got oriented, though a few labels and next steps could be clearer for first-time users.</li>
      <li>The main challenge was learning where different systems lived at first; after exploring them, the flow became much easier to follow.</li>
      <li>The app was straightforward for the main tasks. I was initially unsure about the difference between ratings and standings, but everything else was easy to navigate.</li>
      <li>The core loop was engaging and the visuals made most actions easy to follow. I would have liked a little more guidance around trades and their outcomes.</li>
    </ol>
  </figcaption>
</figure>

<h3>Additional session feedback</h3>

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/written-session-feedback-continuation.png" aria-label="Open full-size screenshot: Additional session feedback">
    <img
      src="/img/feedback/sprint-3/written-session-feedback-continuation.png"
      alt="Additional session feedback"
      width="799"
      height="421"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>Supplied continuation of the session feedback. Six complete comments visible; the question header and response count are not shown.</p>
    <ol>
      <li>The app felt polished and the main actions were easy to complete. The turn timer could use a slightly clearer visual cue during Live play.</li>
      <li>The core experience was enjoyable and easy to follow. The trail sequence took a moment to understand, but it became clear after checking the event details.</li>
      <li>I found the experience easy to use and the battle flow was intuitive. The rankings information took a moment to interpret, but the rest of the app felt consistent.</li>
      <li>Most of the session was clear and responsive; the only minor confusion was distinguishing the different competitive modes at first.</li>
      <li>The navigation was extremely confusing and it was often unclear whether an action had worked or what I was expected to do next.</li>
      <li>Some labels felt inconsistent, and I had to explore a few screens before understanding how the different progression systems connect.</li>
    </ol>
  </figcaption>
</figure>

<h3>Reported bugs and their descriptions</h3>

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/written-bug-descriptions.png" aria-label="Open full-size screenshot: Reported bugs and their descriptions">
    <img
      src="/img/feedback/sprint-3/written-bug-descriptions.png"
      alt="Reported bugs and their descriptions"
      width="786"
      height="644"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>Questions 22 and 22a. The bug chart repeats question 22; count it once. Five responses reported for 22a; three complete comments visible.</p>
    <p>22a. If you encountered a bug, briefly describe the steps and what happened.</p>
    <ol>
      <li>I was unsure whether some unclear state changes were intended behavior or a bug, especially when feedback after an action was limited.</li>
      <li>Opening the battle screen and selecting an action sometimes left the interface unchanged, so I could not tell whether the action had registered.</li>
      <li>A few actions appeared to do nothing on the first attempt, but I could not reproduce the behavior consistently.</li>
    </ol>
  </figcaption>
</figure>

<h3>Requested improvements and repeat use</h3>

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-3/written-priorities-repeat-use.png" aria-label="Open full-size screenshot: Requested improvements and repeat use">
    <img
      src="/img/feedback/sprint-3/written-priorities-repeat-use.png"
      alt="Requested improvements and repeat use"
      width="808"
      height="870"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>Questions 23–24. Fifteen responses reported for question 23; eight complete comments visible.</p>
    <p>23. What single improvement should we prioritise next?</p>
    <ol>
      <li>Make the current objective and the result of each action more prominent, with clearer status labels and immediate feedback.</li>
      <li>Make entry points to key areas more consistent and add clearer first-time guidance for navigation.</li>
      <li>Improve onboarding and make the next recommended action more visible without adding too much extra text.</li>
      <li>Keep the navigation labels and action feedback consistent, especially when moving between collection, battles, and rankings.</li>
      <li>Clarify the difference between ratings and standings near the relevant screens.</li>
      <li>Add a clearer summary of what each player gives and receives before confirming a trade.</li>
      <li>Show the evolution requirements more prominently before a card is selected.</li>
      <li>Make the Live turn timer more prominent, especially when it is close to running out.</li>
    </ol>
  </figcaption>
</figure>

</details>

## AI declaration

This sanitised report was generated and edited with assistance from Codex-CLI[gpt-6-sol].
Counts were derived from the team-supplied CSV using Python's CSV parser;
written themes were paraphrased and implementation context checked against
repository main. No additional responses, issue closures, or retest outcomes
were added.

Public feedback relocated into the sprint folder with assistance from
Codex[GPT-6]; findings, response counts, and retest limits are unchanged.

Focused feedback evidence and current implementation links updated with
assistance from Codex[GPT-6]. SVG viewports embed unchanged original PNG bytes;
all supplied screenshots and complete visible comments remain available. The
199 focused checks above are automated implementation evidence, not participant
retests or proof that the original reported problems were reproduced.

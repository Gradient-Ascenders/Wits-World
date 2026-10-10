---
title: Sprint 3 user feedback
description: Survey charts, focused written feedback, implementation proof, and remaining retests.
sidebar_position: 2
toc_max_heading_level: 2
---

# Sprint 3 user feedback

## Evidence status

The original export contains **15 submissions dated 28 September 2026**.
Three submissions contain identical answers; unique participants are unverified.
The screenshots agree with those counts; their capture date and tested build are unknown.
These are self-reports, not observed defects or controlled Sprint 2–3 comparisons.

## Response summary

Battle delay was acceptable/very acceptable in 13/15 submissions; separately,
13/15 would probably/definitely use again. Overall speed was fast/very fast in 9/15.
Only 5/15 fully distinguished standings from rating. Detailed counts and
unchanged originals are in [Full survey evidence](#full-survey-evidence).

## Prioritised findings

**Implementation review: 10 October 2026.** Links use [main `01a364f`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6);
the linked files match tested revision `d0d716b`. Later changes are dated
separately, not backdated into Sprint 3 or attributed to this survey.

### Make action results unmistakable

**Feedback:** One submission reported a bug and four were unsure; comments describe action results that seemed unchanged. One report was not reproducible.

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

**Changed:** Live views distinguish sending, acknowledged, reconnecting, recovered, and completed states. Pending actions lock input; confirmed state and grouped activity remain visible.

**Proof:** [PR #318 — 26 September](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/f5f739a2e01c65100a332b129dcb0c74d503f813) ·
[PR #328 — 28 September](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/c425868ba6cee93ab242376e41239ad647a89174) ·
[feedback source](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/pages/LiveMatchPage.tsx#L258) ·
[action tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/live-pages.test.tsx#L1272) ·
[activity tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/battle-log-presentation.test.ts#L19).

**Still needed:** Reproduce the unchanged result and distinguish rejection, display failure, and missed feedback.

### Make match recovery clear and reliable

**Feedback:** Only two recovery responses: one resumed with help and one could not resume. Thirteen did not try; no unaided success was reported.

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

**Changed:** Live reconnect reconciles pending actions with server state, keeps the deadline running, and distinguishes recovery from terminal failure.

**Proof:** [session source](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/pages/useLiveBattleSession.ts) ·
[reconnect/version-gap tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/live-session-boundaries.test.tsx#L89) ·
[transport-loss tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/live-pages.test.tsx#L1339).

**Still needed:** Test unaided refresh/disconnect/resume in CPU, asynchronous PvP, and Live Ranked.

### Explain ratings, standings, and battle modes

**Feedback:** Only 5/15 fully distinguished points/standings from competitive rating; 6/15 distinguished asynchronous PvP from Live Ranked.

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

**Changed:** Campus standings have a dedicated Leaderboard. Ranked views separate season rating/standings and refresh at rollover; territory guidance explains eligible wins and influence.

**Proof:** [PR #325 — 27 September](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/401fc0d03fbae1e880224632a89581312ee5f360) ·
[Leaderboard](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/pages/LeaderboardPage.tsx) ·
[separation tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/profile-page.test.tsx#L86) ·
[rollover tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/live-pages.test.tsx#L1092) ·
[influence guidance](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/components/exploration/TerritoryDiscovery.tsx#L190) ·
[later PR #336 — 30 September](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/04fcfa4d8dac26b781ded1b3cefc22834aa40f4d).

**Still needed:** Retest the meaning of points, rating, resets, influence, and mode choice.

### Make navigation and the next step easier to find

**Feedback:** Leaderboard discovery was difficult for 5/15; Decks and Explore for 4/15 each. Only 6/15 fully understood trails and ordering questions.

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

**Changed:** Decks sit in Collection. Trails identify completed/current/locked stops; ordering controls announce and retain the answer order after errors.

**Proof:** [trail source](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/components/exploration/TrailDiscovery.tsx) ·
[later PR #336 — 30 September](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/04fcfa4d8dac26b781ded1b3cefc22834aa40f4d) ·
[current-stop tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/trail-discovery.test.tsx#L105) ·
[ordering/retry tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/challenge-page.test.tsx#L179).

**Still needed:** Retest discovery, event states, ordering, and the next trail step; first-time guidance remains incomplete.

### Explain what evolution and trading will change

**Feedback:** 7/15 fully understood evolution availability; 6/15 understood its inventory consequences, and 6/15 understood trade consequences.

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

**Changed:** Evolution shows required/available/protected copies, the created card, copies consumed/remaining, and irreversible confirmation. Trades compare both sides and confirm the displayed version; stale offers refresh.

**Proof:** [Later PR #341 — 2 October](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/e740e0bdb356202598ebe420e0bd60d0f6d7ef5c) ·
[evolution source](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/components/cards/CardEvolutionFlow.tsx#L282) ·
[trade source](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/pages/TradeDetailPage.tsx#L469) ·
[preview/confirmation tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/collection-page.test.tsx#L716) ·
[stale-acceptance test](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/trade-detail-boundaries.test.tsx#L160).

**Still needed:** Check players notice requirements before selection and predict the inventory change.

### Make the Live timer and battle effects easier to read

**Feedback:** 8/15 did not fully understand the Live timer; 7/14 who encountered swapping fully understood its turn cost.

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

**Changed:** The countdown warns at ten seconds and announces expiry. Shared presentation shows active effects/effectiveness and separates normal swaps from mandatory replacements.

**Proof:** [countdown source](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/pages/LiveMatchPage.tsx#L215) ·
[presentation source](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/components/matches/BattlePresentation.tsx) ·
[move/replacement tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/battle-presentation.test.tsx#L131) ·
[legal-swap test](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/battle-controls.test.tsx#L44).
The ten-second warning is code-inspected, not separately tested here.

**Still needed:** Retest a near-expiry turn, buff/debuff, and voluntary turn-consuming swap.

## Coverage gaps and positive signals

Only one response tested Author package creation/review, rating both easy/clear.
Fourteen did not test either. Recovery was tried in only two responses.
Four rated overall speed slow/very slow and two rejected battle delay:
[performance evidence](../sprint-2/evidence.md#battle-responsiveness) remains
separate from questionnaire ratings.

## Traceability summary

Action-result and recovery findings are **High-priority investigations**;
the four understanding/navigation findings are **Medium-priority recommendations**.
This update creates no issues and records no participant retests. Current
implementation does not establish that the original reported problem was fixed.

## Local implementation verification

**10 October 2026 · `d0d716b` · 199 tests passed across 13 files.**
Node/jsdom checks used mocked API, realtime, map, and identity dependencies.
[Run details](#verification-details) are retained below; these application checks
were not rerun for this copy edit.

No browser, live database, hosted CI, deployed journey, or participant checks
were run for this update. The full application suite was not completed.

## Follow-up evidence required

Reproduce action-result/recovery failures first, then triage the usability
recommendations. Retest affected tasks without assistance on a named build,
including deliberate disconnects and a dedicated Author session.
Record anonymous session codes, device/browser, completion, assistance, and
outcomes; link accepted work and retests without publishing raw records or identities.

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

### Collection method and limitations

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

<h3>Detailed counts</h3>

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

### Verification details

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

<h3>Original export provenance</h3>

The source is `Wits World - Sprint 3 User Feedback.csv`. All rows are timestamped
28 September 2026; session dates and timezone are not separately recorded.
No names, emails, or participant identifiers are present. The raw CSV stays
outside the public repository. Matching rows cannot distinguish repeat
submissions from different people giving the same answers.

</details>

## AI declaration

Prepared from the supplied CSV using Python's CSV parser with
Codex-CLI[gpt-6-sol]; later edits assisted by Codex[GPT-6]. This distillation consolidates repeated explanations and
attributions. Originals, counts, provenance, code/test links, recorded results,
and retest limits remain. Crops embed unchanged PNG bytes.
No new responses, application results, or participant outcomes were added.

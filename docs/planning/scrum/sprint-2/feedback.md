---
title: Sprint 2 user feedback
description: Survey charts and written comments, implemented changes, and remaining participant retests.
sidebar_position: 2
toc_max_heading_level: 2
---

# Sprint 2 user feedback

## Evidence status

The supplied Google Forms charts now show **12 responses per question**. The
team confirmed they are from the original Sprint 2 questionnaire. The earlier
CSV snapshot contained ten responses; its dated findings and decisions are
preserved below, with chart-derived counts updated where the same question is
visible. The raw export remains outside the public repository.

The charts do not show when the additional responses were collected, their
tested build, or written comments. They are an updated survey snapshot, not
evidence of two participant retests or a measured improvement after a fix.

Separately supplied [written feedback screenshots](#written-feedback-screenshots)
now support the battle, deck, event, quiz, and first-time guidance findings.
Six show their question text and response totals; the two earlier battle
excerpts do not. No names, contact details, response identifiers, dates, or
tested builds are visible.

This report covers the five material findings accepted into Gitea issues
[#240](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/240) through
[#244](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/244). It does
not turn self-reported answers into observed facts, claim that the sample is
representative, or claim that a closed issue has been retested.

## Collection method and limitations

- Participants completed the same structured Google Forms questionnaire after
  using the Wits World player experience.
- Fixed-choice answers were counted directly. Repeated written concerns were
  grouped only where they described the same product area in the original
  ten-response CSV. Updated fixed-choice counts come from the supplied charts;
  written findings are not extrapolated to the two additional responses.
- The written screenshot excerpts support the feedback themes separately. Visible
  comments are not counted as additional or uniquely identified participants.
- Participant recruitment, demographic profile, device, browser, tested commit,
  and facilitator observations were not captured in the supplied export.
- The responses are therefore suitable for identifying usability themes, but
  not for browser-specific diagnosis, performance benchmarking, or statistical
  claims about the wider student population.
- Follow-up testing must use the same affected tasks and record whether each
  accepted finding improved, remained, or regressed.

## Google Forms chart snapshot

Each chart shows twelve responses from the same questionnaire. The collection
date/range and tested build are not shown. Numeric charts use ratings 1–5;
their endpoint labels are not visible, so the counts are transcribed without
assuming a named rating scale.

| Area                | Main signal in the updated charts                                                | Related finding                                                                  |
| ------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Events and rewards  | 7/12 found all event states clear; 4/12 found the event list useful.             | [Events, quizzes and rewards](#make-events-quizzes-and-rewards-easier-to-follow) |
| Deck building       | Only 2/10 responses from deck builders found requirements clear.                 | [Deck rules](#show-deck-rules-and-explain-invalid-decks)                         |
| Battle clarity      | Only 2/12 found turn ownership clear; none found effects fully clear.            | [Battle explanations](#explain-turns-moves-and-effects)                          |
| Overall experience  | 7/12 rated satisfaction 3 and 5/12 rated it 4.                                   | Follow-up usability sessions                                                     |
| Future use and bugs | 8/12 would probably or definitely use again; 1 reported a bug and 3 were unsure. | Investigate before claiming a defect or fix                                      |

All nine original charts and their text captions are kept in the
[Full survey evidence](#full-survey-evidence) section.

## Written feedback screenshots

Each finding below includes one focused comment crop. These illustrate the
reported problems; they are not additional responses or evidence of improvement.
The [Full survey evidence](#full-survey-evidence) section retains every original
screenshot and complete visible transcript, including positive and "no problem" responses.

## Prioritised findings

The headings below use the requests in the written feedback. Each connects
**feedback → implemented change → code and test evidence**. Existing issues
#240–#244 retain the original decisions from the ten-response CSV; the supplied
screenshots add supporting context, not new decisions or before-and-after results.

**Implementation review: 9 October 2026.** Source and test links are pinned to
[main revision `01a364f`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6).
Those linked files match the locally tested revision `d0d716b`.
Later changes are dated separately: they show how the current product addresses
the findings, not what had shipped during Sprint 2 or what caused each later change.

### Prevent actions during the CPU's turn

**Feedback:** A participant reported acting during the CPU's turn. Accepted as
High priority in
[#240](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/240).
It is a reported possible defect, not an independently observed illegal move.

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-2/focused-turn-ownership.svg" aria-label="Open full-size focused comment: Prevent actions during the CPU's turn">
    <img
      src="/img/feedback/sprint-2/focused-turn-ownership.svg"
      alt="I was able to make a move in the CPU battle even though it was not my turn"
      width="720"
      height="115"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>I was able to make a move in the CPU battle even though it was not my turn</p>
    <a href="/img/feedback/sprint-2/written-bug-reports.png">Full source screenshot</a>
  </figcaption>
</figure>

**Changed:** Actions require the server's current actor and legal-action list;
controls lock during submission or uncertain recovery. The server rejects an
out-of-turn action without saving a transition. This protects match integrity
whether the original report described an illegal action or misleading UI state.

**Proof:** [Merged PR #245 — 13 September](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/efc399d2081d1cbe4d7ae4decab7811c989f0ffd).
The [server regression](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/api/tests/cpu-match-service.test.ts#L34)
asserts rejection, rollback, and no persisted transition. The
[control regression](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/battle-controls.test.tsx#L7)
checks actor, legal-action, pending, and recovery locks. Both passed in the local
verification below.

### Make battles faster

**Feedback:** Repeated requests asked for faster CPU battles and shorter waits.
The original count remains 5/10; the later screenshots reinforce the theme
without recalculating that frequency. Accepted as High priority in
[#241](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/241).

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-2/focused-battle-speed.svg" aria-label="Open full-size focused comment: Make battles faster">
    <img
      src="/img/feedback/sprint-2/focused-battle-speed.svg"
      alt="It is very slow when you vs the CPU, moves take forever to complete"
      width="683"
      height="40"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>It is very slow when you vs the CPU, moves take forever to complete</p>
    <a href="/img/feedback/sprint-2/written-battle-feedback-1.png">Full source screenshot</a>
  </figcaption>
</figure>

**Changed:** [PR #245](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/efc399d2081d1cbe4d7ae4decab7811c989f0ffd)
removed repeated identity writes and batched history loading. Later,
[PR #338 — 1 October](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/09570fe60790992477470984a834d7a75725af07)
shortened CPU presentation delays; the
[delay function](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/pages/CpuMatchPage.tsx#L968)
records the implemented intervals.

**Proof:** The [history regression](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/api/tests/history-performance.test.ts#L8)
passed with exactly three queries for three matches of twenty rounds each. The
[identity regression](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/api/tests/player-identity.test.ts#L23)
passed without starting a transaction for unchanged identity reads.

The [original investigation](../../../testing/api-battle-responsiveness.md)
recorded local identity medians of 738 ms → 185 ms and history queries of
83 → 3. Those measurements were not rerun here. Query-count tests and shorter
animation intervals prove specific changes, not deployed click-to-result speed.

### Explain turns, moves, and effects

**Feedback:** Players requested clearer turns, short action summaries, nearby
move costs/effects, and explanations of why a move worked or failed. Accepted
as High priority in
[#242](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/242).

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-2/focused-battle-explanations.svg" aria-label="Open full-size focused comment: Explain turns, moves, and effects">
    <img
      src="/img/feedback/sprint-2/focused-battle-explanations.svg"
      alt="A small summary of active effects and recent moves would make the battle easier to follow without changing the core gameplay."
      width="704"
      height="60"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>A small summary of active effects and recent moves would make the battle easier to follow without changing the core gameplay.</p>
    <a href="/img/feedback/sprint-2/written-battle-feedback-2.png">Full source screenshot</a>
  </figcaption>
</figure>

**Changed:** PR #245 added explicit turn and request-state messages. Later,
[PR #318 — 26 September](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/f5f739a2e01c65100a332b129dcb0c74d503f813)
introduced the shared battle presentation: move costs, server-projected affinity
effectiveness, active modifier magnitudes/durations, and grouped action outcomes.

**Proof:** [Effect descriptions](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/battle/effect-presentation.ts#L75)
are implemented, not just requested. Passing
[effect tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/effect-presentation.test.ts#L69)
check finite/permanent durations and actual damage outcomes;
[presentation tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/battle-presentation.test.tsx#L161)
check that effectiveness comes from the server, not a client guess; and
[log tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/battle-log-presentation.test.ts#L19)
check that costs and effects stay grouped with the correct action and turn.

### Show deck rules and explain invalid decks

**Feedback:** Players asked for a live requirements checklist and exact reasons
when saving fails, plus clearer ownership and an explanation of when to use
decks. The validation finding was accepted as Medium priority in
[#243](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/243).

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-2/focused-deck-rules.svg" aria-label="Open full-size focused comment: Show deck rules and explain invalid decks">
    <img
      src="/img/feedback/sprint-2/focused-deck-rules.svg"
      alt="A small checklist showing the deck requirements while building would make it easier to see what is still missing."
      width="704"
      height="128"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>A small checklist showing the deck requirements while building would make it easier to see what is still missing.</p>
    <a href="/img/feedback/sprint-2/written-cards-decks.png">Full source screenshot</a>
  </figcaption>
</figure>

**Changed:** The current editor shows live Creature/Power counts, rarity points,
and missing-rule messages. Invalid drafts cannot be saved; separately owned
copies are tracked, the selected deck is identified, and server rejections
explain what to correct without discarding the draft. Later
[PR #341 — 2 October](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/e740e0bdb356202598ebe420e0bd60d0f6d7ef5c)
refined this editor and its tests.

**Proof:** The [live checklist and server-error messages](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/pages/DecksPage.tsx#L1852)
are present in source. Passing [deck tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/decks-page.test.tsx#L711)
check a visible `14 / 10` point-cap failure, a disabled save action, and focused
server feedback requiring three Creature and two Power cards. The same suite
checks owned-copy limits and selecting a saved deck. This replaces the earlier
"no linked change" assessment with verified current implementation, not a claim
that every behaviour was first introduced by PR #341.

### Make events, quizzes, and rewards easier to follow

**Feedback:** Requests covered clearer event states and discovery, instructions
and reward context before and after quizzes, and first-time guidance across
events, cards, decks, and battles. The original finding was accepted as Medium
priority in
[#244](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/244).

<figure className="workflow-evidence">
  <a href="/img/feedback/sprint-2/focused-quiz-guidance.svg" aria-label="Open full-size focused comment: Make events, quizzes, and rewards easier to follow">
    <img
      src="/img/feedback/sprint-2/focused-quiz-guidance.svg"
      alt="The quiz needs clearer instructions before starting, especially around the timer and what happens after finishing. The reward message should also be more noticeable."
      width="704"
      height="65"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>
    <p>The quiz needs clearer instructions before starting, especially around the timer and what happens after finishing. The reward message should also be more noticeable.</p>
    <a href="/img/feedback/sprint-2/written-quiz-rewards.png">Full source screenshot</a>
  </figcaption>
</figure>

**Changed:** Later [PR #336 — 30 September](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/04fcfa4d8dac26b781ded1b3cefc22834aa40f4d)
refined Explore navigation and status copy. The current journey has an Events
control and map-independent list, textual in-range/out-of-range/not-open/ended
states, a quiz countdown and saved-answer progress, and named earned cards with
an "Added to collection" message and "View collection" link.

**Proof:** Passing [Explore tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/exploration.test.tsx#L517)
exercise the Events control and list without relying on the map. Passing
[challenge tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/challenge-page.test.tsx#L326)
check persisted scores, earned-card names, and answer review;
[reward tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/tests/challenge-rewards.test.tsx#L35)
check the exact awarded copy and honest recovery when artwork fails. The
[result source](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/apps/web/src/components/challenge/ChallengeResult.tsx#L60)
contains the collection link. These establish implemented guidance, not that a
first-time player notices it or understands the timing before starting.

**Remaining gap:** These links do not establish a complete first-time guide,
pre-quiz example, reward preview, or explanation of how to use each reward.
The current countdown and saved-card summary only cover part of those requests.

## Traceability summary

| Finding                    | Implementation evidence                                                                                         | Still needed                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Turn ownership · #240      | Actor checks and action locks; regressions passed                                                               | Reproduce the original task on a deployment                                   |
| Battle speed · #241        | Batched reads and shorter presentation delays; query-count regression passed                                    | Deployed click-to-result timing and pacing retest                             |
| Battle explanations · #242 | Turn messages, effect explanations and server-projected effectiveness; regressions passed                       | Participant understanding of turns, effects and outcomes                      |
| Deck validation · #243     | Live deck checklist, owned-copy limits and validation feedback; regressions passed                              | Invalid-deck retest, ownership visibility and when to use decks               |
| Events and guidance · #244 | Event discovery/states and saved-reward feedback; regressions passed; first-use guidance only partially covered | First-time guide, pre-start timing/example/reward context and discoverability |

Issue closure alone is not proof of a fix. The links above establish concrete
implementation; the checks below establish local automated behaviour. Neither
establishes participant acceptance or closes the release checks in
[#167](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/167).

## Other requests needing review

The new comments also mention inaccurate 3D event locations, more quiz types or
subjects, better card visuals and battle animations, and general application
speed. These are retained in the screenshots, not silently treated as completed
by the five fixes above. No new issue decision is inferred from them.

The map-location report needs reproduction against real event coordinates;
mocked-map tests do not establish location accuracy. Quiz variety, visual polish,
first-use effect explanations, and non-battle performance need their own
implementation or acceptance evidence before being described as addressed.

## Local implementation verification

**Run date:** 9 October 2026. **Application revision:** `d0d716b`.
**Result:** 165 tests passed across 12 files.

- **Web: 117 tests, 9 files.** Vitest/Testing Library in jsdom, using mocked API
  responses and map providers. Files: `battle-controls`, `battle-presentation`,
  `battle-log-presentation`, `effect-presentation`, `decks-page`, `deck-save-bar`,
  `exploration`, `challenge-page`, and `challenge-rewards` in `apps/web/tests`.
- **API: 48 tests, 3 files.** Vitest with mocked database clients. Files:
  `cpu-match-service.test.ts`, `history-performance.test.ts`, and
  `player-identity.test.ts` in `apps/api/tests`. The history fixture simulates
  query delays; it is not a real database latency benchmark.

Reproduce with `npx vitest run` followed by the listed test paths from each
application directory. Build the `@wits-world/game-rules` and
`@wits-world/account-policy` workspaces first.

No browser, live database, hosted CI, deployed journey, or participant checks were
run for this update. The [14 September evidence](evidence.md#verification)
remains a separate historical snapshot.

## Follow-up evidence required

1. Run focused participant retests for all five findings against a named
   deployment and commit. Include first-time event discovery and an explanation
   of the quiz timing before entry; create follow-up work for any unmet criteria.
2. Measure signed-in CPU click-to-result timing on mobile and desktop separately
   from database-query and animation timings.
3. Record the date, anonymous session codes, applicable device/browser context,
   affected task outcome, assistance given, and whether each finding improved,
   remained, or regressed.
4. Link resulting fixes and retest evidence from issue #167 without publishing
   raw responses or participant-identifying information.

## Full survey evidence

<details>
  <summary>View all original charts, written responses, and transcripts</summary>

Eight supplied screenshots are preserved unchanged, with every complete visible
comment transcribed below. This includes positive and "no problem" responses,
not only criticisms. The six question screenshots show different response
totals because these are individual written questions, not a new participant count.
Their cropped lists do not always show every reported response.

The two earlier battle excerpts show seven and five complete comments, but no
question heading or response total. Across all screenshots, dates, tested
builds, and response identifiers remain unknown. Comments across questions
must not be added together as unique participants or used to recalculate the
original CSV frequencies.

The originals have not been cropped, redrawn, or replaced. Chart counts,
question-level response totals, visible comments, and participant retests remain
separate. These are reports of the problems, not proof of fixes.

<h3>Exploration and events — 12 responses</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/exploration-events.png" aria-label="Open full-size Google Forms charts: Exploration and events">
      <img
        src="/img/feedback/sprint-2/exploration-events.png"
        alt="Google Forms aggregate charts for exploration and events, with twelve responses per question"
        width="777"
        height="1075"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>Map understanding (ratings 1–5): 0, 0, 3, 3, 6. Event states: 7 all clear, 5 some clear. Event list: 4 useful, 6 partially useful, 2 did not notice it. Collection date not shown.</figcaption>
  </figure>

<h3>Quiz and rewards — 12 responses</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/quiz-rewards.png" aria-label="Open full-size Google Forms charts: Quiz and rewards">
      <img
        src="/img/feedback/sprint-2/quiz-rewards.png"
        alt="Google Forms aggregate charts for quiz and rewards, with twelve responses per question"
        width="778"
        height="1069"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>Quiz instructions (ratings 1–5): 0, 1, 2, 3, 6. Timer: 9 clear and reasonable, 1 too short, 1 unclear, 1 did not complete a quiz. Reward: 7 clear, 4 partially clear, 1 did not receive one. Collection date not shown.</figcaption>
  </figure>

<h3>Cards and decks — 12 responses</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/cards-decks.png" aria-label="Open full-size Google Forms charts: Cards and decks">
      <img
        src="/img/feedback/sprint-2/cards-decks.png"
        alt="Google Forms aggregate charts for cards and decks, with twelve responses per question"
        width="777"
        height="1055"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>Owned cards: 8 clear, 4 partially clear. Deck requirements: 2 clear, 7 partially clear, 1 unclear, 2 did not build a deck. Invalid-deck explanation: 2 clear, 3 partially clear, 1 unclear, 6 did not encounter an invalid deck. Collection date not shown.</figcaption>
  </figure>

<h3>CPU battle turns and actions — 12 responses</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/cpu-battle.png" aria-label="Open full-size Google Forms charts: CPU battle turns and actions">
      <img
        src="/img/feedback/sprint-2/cpu-battle.png"
        alt="Google Forms aggregate charts for cpu battle turns and actions, with twelve responses per question"
        width="776"
        height="1074"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>Turn ownership: 2 clear, 7 partially clear, 3 unclear. Actions and move costs (ratings 1–5): 0, 4, 3, 4, 1. Move results: 2 understood, 5 understood most of the time, 3 rarely understood, 2 did not understand. Collection date not shown.</figcaption>
  </figure>

<h3>Battle effects and results — 12 responses</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/battle-effects-results.png" aria-label="Open full-size Google Forms charts: Battle effects and results">
      <img
        src="/img/feedback/sprint-2/battle-effects-results.png"
        alt="Google Forms aggregate charts for battle effects and results, with twelve responses per question"
        width="779"
        height="684"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>Effects and affinity: 0 clear, 9 partially clear, 3 unclear. Match result: 6 clear, 2 partially clear, 4 did not finish a battle. Collection date not shown.</figcaption>
  </figure>

<h3>Navigation, readability, and screen size — 12 responses</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/navigation-readability-screen-size.png" aria-label="Open full-size Google Forms charts: Navigation, readability, and screen size">
      <img
        src="/img/feedback/sprint-2/navigation-readability-screen-size.png"
        alt="Google Forms aggregate charts for navigation, readability, and screen size, with twelve responses per question"
        width="780"
        height="1116"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>Ratings 1–5. Navigation: 0, 0, 4, 6, 2. Readability: 0, 1, 2, 4, 5. Screen-size experience: 0, 0, 3, 6, 3. Collection date not shown.</figcaption>
  </figure>

<h3>Visual consistency and overall satisfaction — 12 responses</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/consistency-satisfaction.png" aria-label="Open full-size Google Forms charts: Visual consistency and overall satisfaction">
      <img
        src="/img/feedback/sprint-2/consistency-satisfaction.png"
        alt="Google Forms aggregate charts for visual consistency and overall satisfaction, with twelve responses per question"
        width="775"
        height="736"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>Ratings 1–5. Visual consistency: 0, 0, 6, 5, 1. Overall satisfaction: 0, 0, 7, 5, 0. Collection date not shown.</figcaption>
  </figure>

<h3>Reported bugs — 12 responses</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/reported-bugs.png" aria-label="Open full-size Google Forms charts: Reported bugs">
      <img
        src="/img/feedback/sprint-2/reported-bugs.png"
        alt="Google Forms aggregate charts for reported bugs, with twelve responses per question"
        width="772"
        height="321"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>Bug self-reports: 1 yes, 8 no, 3 unsure. This chart does not establish reproduction, severity, or the absence of defects. Collection date not shown.</figcaption>
  </figure>

<h3>Willingness to use Wits World again — 12 responses</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/would-use-again.png" aria-label="Open full-size Google Forms charts: Willingness to use Wits World again">
      <img
        src="/img/feedback/sprint-2/would-use-again.png"
        alt="Google Forms aggregate charts for willingness to use wits world again, with twelve responses per question"
        width="798"
        height="330"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>Would use again: 2 definitely, 6 probably, 3 unsure, 1 probably not, 0 definitely not. Collection date not shown.</figcaption>
  </figure>

<h3>Written battle feedback — excerpt 1</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/written-battle-feedback-1.png" aria-label="Open full-size written battle feedback: excerpt 1">
      <img
        src="/img/feedback/sprint-2/written-battle-feedback-1.png"
        alt="Seven written comments about battle speed, turn clarity, move costs, effect explanations, and animations"
        width="693"
        height="377"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>
      Seven complete comments, transcribed verbatim. Question text and dates are not shown.
      <ol>
        <li>Make the battle faster.</li>
        <li>Optimize the slowness and make it clearer when it is your turn to play.</li>
        <li>A short battle log or clearer effect messages would make it easier to understand why health and status values changed after each move.</li>
        <li>Showing move costs and active effects closer to the action buttons would make battles easier to follow without looking around the screen.</li>
        <li>It is very slow when you vs the CPU, moves take forever to complete</li>
        <li>The battle flow was clearer than I expected. The only thing I would add is a quick note explaining special card effects when they first appear.</li>
        <li>Faster battles, better indication on what is actually happening, and better animations</li>
      </ol>
    </figcaption>
  </figure>

<h3>Written battle feedback — excerpt 2</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/written-battle-feedback-2.png" aria-label="Open full-size written battle feedback: excerpt 2">
      <img
        src="/img/feedback/sprint-2/written-battle-feedback-2.png"
        alt="Five written comments requesting active-effect summaries, faster battles, visual animations, and clearer action feedback"
        width="816"
        height="288"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>
      Five complete comments, transcribed verbatim. The partial entry at the top is not transcribed; question text and dates are not shown.
      <ol>
        <li>A small summary of active effects and recent moves would make the battle easier to follow without changing the core gameplay.</li>
        <li>Way too slow.</li>
        <li>Make the battle animation a bit more visual to illustrate moves being made.</li>
        <li>The battle screen needs clearer feedback after each action. Effects, buffs, debuffs, and why a move worked or failed should be explained more directly.</li>
        <li>Fix slowness</li>
      </ol>
    </figcaption>
  </figure>

<h3>Exploration and events — 9 responses, 7 visible comments</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/written-exploration-events.png" aria-label="Open full-size written feedback: Exploration and events">
      <img
        src="/img/feedback/sprint-2/written-exploration-events.png"
        alt="Google Forms written feedback about exploration and events, showing 7 complete comments and 9 question responses"
        width="749"
        height="507"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>
      <p>Question: What, if anything, was confusing about the exploration map or events? 9 responses reported; 7 complete comments visible. Dates and tested build are not shown.</p>
      <ol>
        <li>Nothing</li>
        <li>The map was mostly easy to follow, but the difference between upcoming and too-far events could be explained a bit more clearly.</li>
        <li>The map itself was clear. The event list was helpful, but I would make the sorting or filtering options more obvious.</li>
        <li>When selecting the event, it does specify the amount of questions or the type of questions the event gives.</li>
        <li>The map was fairly clear, but I did not notice the event list at first. Making that option more visible would help.</li>
        <li>3D Map can show the event locations inaccurately</li>
        <li>The map was understandable after looking around for a bit. The event states were mostly clear, but a short legend or label explanation would help.</li>
      </ol>
    </figcaption>
  </figure>

<h3>Quiz and reward improvements — 8 responses, 7 visible comments</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/written-quiz-rewards.png" aria-label="Open full-size written feedback: Quiz and reward improvements">
      <img
        src="/img/feedback/sprint-2/written-quiz-rewards.png"
        alt="Google Forms written feedback about quiz and reward improvements, showing 7 complete comments and 8 question responses"
        width="836"
        height="548"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>
      <p>Question: What would improve the quiz or reward experience? 8 responses reported; 7 complete comments visible. Dates and tested build are not shown.</p>
      <ol>
        <li>Nothing</li>
        <li>It would help to show a short reward summary after each quiz, including what was earned and how it can be used.</li>
        <li>The quiz worked well overall. A preview of possible reward types before starting would make it clearer what users are working toward.</li>
        <li>I would add a short example before the quiz starts. I was not fully sure how the quiz flow and rewards were supposed to connect.</li>
        <li>More types of quizzes or on different subjects</li>
        <li>The quiz was generally understandable, but it would help to explain the reward before and after the quiz so the outcome feels clearer.</li>
        <li>The quiz needs clearer instructions before starting, especially around the timer and what happens after finishing. The reward message should also be more noticeable.</li>
      </ol>
    </figcaption>
  </figure>

<h3>Card collection and deck building — 8 responses, 7 visible comments</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/written-cards-decks.png" aria-label="Open full-size written feedback: Card collection and deck building">
      <img
        src="/img/feedback/sprint-2/written-cards-decks.png"
        alt="Google Forms written feedback about card collection and deck building, showing 7 complete comments and 8 question responses"
        width="798"
        height="534"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>
      <p>Question: What would improve the card collection or deck-building experience? 8 responses reported; 7 complete comments visible. Dates and tested build are not shown.</p>
      <ol>
        <li>A small checklist showing the deck requirements while building would make it easier to see what is still missing.</li>
        <li>The collection would be easier to scan if owned cards stood out more clearly from locked or unavailable cards.</li>
        <li>Make it visually better</li>
        <li>The collection view was easier to understand than the deck-building flow. I would make the deck option more inviting or explain when users should use it.</li>
        <li>Better visuals</li>
        <li>The card and deck sections were understandable overall, but a checklist of deck requirements would make the process easier to follow.</li>
        <li>Card ownership and deck rules should be more visible. When a deck cannot be saved, the app should list the exact missing requirement instead of leaving the user to guess.</li>
      </ol>
    </figcaption>
  </figure>

<h3>Unexpected behaviour and first-time guidance — 11 responses, 8 visible comments</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/written-unexpected-behaviour.png" aria-label="Open full-size written feedback: Unexpected behaviour and first-time guidance">
      <img
        src="/img/feedback/sprint-2/written-unexpected-behaviour.png"
        alt="Google Forms written feedback about unexpected behaviour and first-time guidance, showing 8 complete comments and 11 question responses"
        width="791"
        height="514"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>
      <p>Question: Did anything behave differently from what you expected? 11 responses reported; 8 complete comments visible. Dates and tested build are not shown.</p>
      <ol>
        <li>No</li>
        <li>Nothing major. Some of the status labels and battle effect changes took a moment to understand at first.</li>
        <li>No major surprises. I expected a bit more guidance the first time opening the card and battle sections.</li>
        <li>I expected the quiz and deck sections to have more guidance before starting. The app worked, but some text and prompts were easy to miss.</li>
        <li>Battles</li>
        <li>Nothing behaved very differently from expected, but some sections needed more context before they felt intuitive.</li>
        <li>No</li>
        <li>I expected more guidance when moving between events, cards, decks, and battles. Some screens assumed I already understood the system.</li>
      </ol>
    </figcaption>
  </figure>

<h3>Reported bugs — 7 responses, 7 visible comments</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/written-bug-reports.png" aria-label="Open full-size written feedback: Reported bugs">
      <img
        src="/img/feedback/sprint-2/written-bug-reports.png"
        alt="Google Forms written feedback about reported bugs, showing 7 complete comments and 7 question responses"
        width="783"
        height="473"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>
      <p>Question: If you encountered a bug, describe what you did and what happened. 7 responses reported; 7 complete comments visible. Dates and tested build are not shown.</p>
      <ol>
        <li>I was able to make a move in the CPU battle even though it was not my turn</li>
        <li>No bug encountered during testing.</li>
        <li>I did not run into a clear bug, but a few transitions or explanations felt like they could be smoother for a first-time user.</li>
        <li>No bug encountered.</li>
        <li>Battle took very long to finish. Couldn't understand how some moves were made</li>
        <li>No clear bug encountered during testing.</li>
        <li>I am not sure if it was a bug, but some feedback messages were easy to miss and made it unclear whether an action had worked.</li>
      </ol>
    </figcaption>
  </figure>

<h3>Most important improvement — 12 responses, 8 visible comments</h3>

  <figure className="workflow-evidence">
    <a href="/img/feedback/sprint-2/written-top-improvement.png" aria-label="Open full-size written feedback: Most important improvement">
      <img
        src="/img/feedback/sprint-2/written-top-improvement.png"
        alt="Google Forms written feedback about most important improvement, showing 8 complete comments and 12 question responses"
        width="779"
        height="529"
        loading="lazy"
        decoding="async"
      />
    </a>
    <figcaption>
      <p>Question: If we could improve only one thing, what should it be? 12 responses reported; 8 complete comments visible. Dates and tested build are not shown.</p>
      <ol>
        <li>App speed</li>
        <li>CPU Battle</li>
        <li>Improve the feedback messages for event statuses, rewards, and battle effects so users can understand changes more quickly.</li>
        <li>Add a simple first-time guide or tooltips for the main sections so users know what to do next.</li>
        <li>Have the site and battles run faster</li>
        <li>Make the instructions and important labels easier to notice, especially for quizzes and deck-building.</li>
        <li>Battles</li>
        <li>Add clearer explanations for first-time users, especially around event states, deck requirements, and battle effects.</li>
      </ol>
    </figcaption>
  </figure>

</details>

## AI declaration

This sanitised report was generated, edited, and reviewed with the assistance
of Codex[gpt-5.6-sol]. Aggregate counts were derived from the supplied response
export; no participants, responses, fixes, or retest outcomes were fabricated.

Page title clarified with assistance from Codex-CLI[GPT-6].

Public feedback relocated into the sprint folder with assistance from
Codex[GPT-6]; findings, response counts, and retest limits are unchanged.

Google Forms screenshots and twelve-response summaries added with assistance
from Codex[GPT-6]. Original image bytes and historical issue/PR decisions are
preserved. The earlier ten-response CSV remains the source for written comments;
no new collection date, tested build, fix, or retest is inferred.

Implementation traceability clarified with assistance from Codex[GPT-6].
Merged changes, source, and focused local test results were checked on
9 October 2026; later implementation is not backdated into Sprint 2, and no
participant retest or deployed performance result is claimed.

Written battle-response screenshots and verbatim transcripts added with
assistance from Codex[GPT-6]. Both original image files and every complete
visible comment are preserved, without inventing question text, participant
identities, collection dates, or retest outcomes.

Finding headings and summaries rewritten around the supplied written feedback
with assistance from Codex[GPT-6]. Six additional screenshots are preserved
with their visible question totals and complete-comment transcripts; issue
decisions, historical counts, and implementation/retest boundaries remain separate.

Focused survey comment crops and the consolidated evidence section prepared
with assistance from Codex[GPT-6]. Each SVG is a rectangular viewport over
embedded, unchanged source PNG bytes. All originals and complete visible
transcripts remain available; selected comments do not establish response
frequencies, participant counts, or post-fix improvement.

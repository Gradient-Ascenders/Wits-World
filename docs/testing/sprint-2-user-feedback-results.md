---
title: 'Sprint 2 feedback and resulting changes'
---

# Sprint 2 feedback and resulting changes

## Evidence status

This report records the sanitised results of the formal Sprint 2 user-feedback questionnaire. Ten responses were collected.
The supplied CSV contains timestamps and questionnaire answers, but no name or
email columns. The raw response export remains outside the public repository.

This report covers the five material findings accepted into Gitea issues
[#240](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/240) through
[#244](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/244). It does
not turn self-reported answers into observed facts, claim that the sample is
representative, or claim that a closed issue has been retested.

## Collection method and limitations

- Participants completed the same structured Google Forms questionnaire after
  using the Wits World player experience.
- Fixed-choice answers were counted directly. Repeated written concerns were
  grouped only where they described the same product area.
- Participant recruitment, demographic profile, device, browser, tested commit,
  and facilitator observations were not captured in the supplied export.
- The responses are therefore suitable for identifying usability themes, but
  not for browser-specific diagnosis, performance benchmarking, or statistical
  claims about the wider student population.
- Follow-up testing must use the same affected tasks and record whether each
  accepted finding improved, remained, or regressed.

## Prioritised findings

### UT-S2-01: Possible out-of-turn CPU action

**Evidence:** One participant reported being able to make a move while the CPU
appeared to have the turn. Only two of ten participants said turn ownership was
fully clear; five selected `Partially` and three selected `No`. The report could
therefore indicate either an authority defect or misleading interface state.

**Evaluation:** Accepted as a High-priority investigation because an actual
server-authority failure would affect match integrity. The issue required the
team to distinguish an accepted illegal action from a legal rejection presented
poorly by the browser.

**Integration:** Issue
[#240](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/240) was
created and closed. Merged PR
[#245](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/245) added an
explicit CPU-service regression for illegal actors, retained version and
transaction checks, and made controls depend on the server-returned actor,
legal actions, and request state.

**Remaining evidence:** A deployed follow-up session reproducing the original
task has not been recorded. Closure proves issue disposition, not participant
retest acceptance.

### UT-S2-02: CPU battle latency and pacing

**Evidence:** Five of ten participants explicitly described CPU battles or move
resolution as slow. This was the most frequent written complaint and was also
selected as the single most important improvement by several participants.

**Evaluation:** Accepted as High priority because repeated waiting affected the
central battle journey even where the match remained functional.

**Integration:** Issue
[#241](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/241) was
created and closed. PR
[#245](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/245) removed
repeated active-identity writes, reduced CPU-history loading from an N+1 query
path to three queries, added safe request timing, and retained pending-state and
duplicate-submission protection. The linked investigation records measured
local improvements, including identity resolution from a 738 ms median to
185 ms and a controlled three-match history query from 83 queries to 3.

**Remaining evidence:** The measurements are local database-path evidence, not
a signed-in deployed click-to-result benchmark. A deployed mobile and desktop
retest remains required.

### UT-S2-03: Battle turns, effects, and outcomes were unclear

**Evidence:** Only two participants said turn ownership was clear. Only two
said they fully understood what happened after each move; four selected `Most
of the time`, two `Rarely`, and two `No`. No participant said buffs, debuffs,
effects, and affinity were fully clear: seven selected `Partially` and three
selected `No`.

**Evaluation:** Accepted as High priority because unclear authoritative state
can cause incorrect actions and make correct server behaviour appear broken.

**Integration:** Issue
[#242](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/242) was
created and closed. PR
[#245](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/245) added
explicit player-turn, opponent-turn, processing, and synchronisation text;
disabled actions during waiting, submission, and uncertain recovery; and added
focused Web and Playwright coverage. The PR directly evidences turn and request
state improvements. It does not by itself evidence participant understanding of
every buff, debuff, duration, and affinity presentation requirement.

**Remaining evidence:** Retest the turn indicator, recent-action explanation,
effect durations, move costs, affinity result, and rejected-action feedback with
participants. Record any remaining effect-clarity work separately.

### UT-S2-04: Deck requirements and validation failures were unclear

**Evidence:** Eight participants attempted deck building. Of those, one said
the requirements were clear, six selected `Partially`, and one selected `No`.
Six participants encountered an invalid deck; only two said its rejection was
clearly explained, while three selected `Partially` and one selected `No`.
Written responses requested a visible requirements checklist and exact missing
rules.

**Evaluation:** Accepted as Medium priority because players could reach the
feature but often had to infer how to produce a valid deck.

**Integration:** Issue
[#243](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/243) was
created and closed with requirements for live card counts, rarity points,
owned-copy limits, selection state, and mapped API errors.

**Remaining evidence:** No issue comment, linked post-feedback pull request, or
recorded retest currently demonstrates those acceptance criteria. Audit the
current deck UI against the issue and reopen or create follow-up work for any
missing behaviour before treating this finding as integrated.

### UT-S2-05: First-time event, quiz, and reward guidance was weak

**Evidence:** Six participants found all event states clear and four found only
some clear. Three described the event list as useful, five as partially useful,
and two did not notice it. Of the nine participants who received a reward, five
found it clear and four only partially clear. Written responses repeatedly
requested clearer labels, quiz context, reward summaries, and first-time
guidance.

**Evaluation:** Accepted as Medium priority because the core journey worked but
important state and next-action information was not consistently discoverable.

**Integration:** Issue
[#244](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/244) was
created and closed with acceptance criteria for textual event states, a more
discoverable event list, quiz timing context, reward identification, and a clear
route to the collection.

**Remaining evidence:** No issue comment, linked post-feedback pull request, or
recorded retest currently proves implementation of those criteria. Audit the
current journey and reopen or create focused follow-up work where necessary.

## Traceability summary

| Finding  | Primary concern                         | Decision | Gitea issue | Implementation evidence |
| -------- | --------------------------------------- | -------- | ----------- | ----------------------- |
| UT-S2-01 | Possible out-of-turn CPU action         | Accepted | #240        | PR #245                 |
| UT-S2-02 | CPU battle latency and pacing           | Accepted | #241        | PR #245                 |
| UT-S2-03 | Battle turns, effects, and outcomes     | Accepted | #242        | PR #245, partial scope  |
| UT-S2-04 | Deck requirements and validation errors | Accepted | #243        | No linked change        |
| UT-S2-05 | Event, quiz, and reward guidance        | Accepted | #244        | No linked change        |

Issue closure is not treated as implementation or retest evidence on its own.
The complete Basic release, stakeholder, participant, accessibility, field, and
deployment validation remains tracked by
[#167](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/167).

## Follow-up evidence required

1. Audit issues #243 and #244 against the current deployed interface and restore
   open work where acceptance criteria are not met.
2. Run focused participant retests for all five findings against a named
   deployment or commit.
3. Record the date, anonymous session codes, applicable device/browser context,
   affected task outcome, assistance given, and whether each finding improved,
   remained, or regressed.
4. Link resulting fixes and retest evidence from issue #167 without publishing
   raw responses or participant-identifying information.

## AI declaration

This sanitised report was generated, edited, and reviewed with the assistance
of Codex[gpt-5.6-sol]. Aggregate counts were derived from the supplied response
export; no participants, responses, fixes, or retest outcomes were fabricated.

Page title clarified with assistance from Codex-CLI[GPT-6].

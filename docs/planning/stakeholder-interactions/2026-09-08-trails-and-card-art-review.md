---
title: 'Meeting 3 — Calvin Rea'
---

# Meeting 3 — Calvin Rea

**8 September 2026 · Trails & card artwork**

[All stakeholder meetings](index.md)

:::note[Retrospective stakeholder record]

This record was created on 14 September 2026 from a team-provided summary and
repository evidence. It is not a transcript and does not attribute direct
quotations or unrecorded approval to any participant. The linked implementations
predate this meeting, so they are evidence evaluated during the review rather
than changes claimed to have been caused by it.

:::

## Interaction record

| Field             | Record                                                                    |
| ----------------- | ------------------------------------------------------------------------- |
| Date              | 8 September 2026                                                          |
| Stakeholder       | Calvin Rea                                                                |
| Team participants | Uzair Mahomed, Kevin Ebrahim, Tyron Van Tonder, and Caleb Perumalsamy     |
| Format            | Stakeholder review; meeting location or communication medium not recorded |
| Scope             | Intermediate ordered trails and production card-art format                |

## Feedback and evaluation

### Implement ordered campus trails

**Feedback:** Trails needed to be included so events could form ordered campus
journeys instead of remaining only independent activities.

**Evaluation:** Accepted. The requirement matched the Intermediate brief and
was split into an authoritative persistence/API slice and an accessible player
discovery slice.

**Response:**

- Issue
  [#176](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/176) and
  merged PR
  [#197](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/197) added
  ordered membership, publication and retirement, Author operations, player
  progress derived from authoritative event completions, and bounded
  nearby-unvisited guidance.
- Issue
  [#177](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/177) and
  merged PR
  [#223](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/223) added
  the responsive player trail list, detail and progress states, next-step
  navigation, map-independent nearby discovery, and focused browser coverage.

**Decision:** Accepted and handled. The server derives sequence progress and
nearby guidance; the browser does not choose completed steps or authoritative
eligibility.

### Use SVG for all card artwork

**Feedback:** SVG artwork was considered for the collectible-card creatures and
Power cards.

**Evaluation:** Considered and not selected for the 30 individual illustrations.
Detailed generated artwork is better retained as raster source material, while
responsive delivery needs smaller browser-optimised files. SVG remains suitable
for shared scalable decorative elements but not as a wrapper for embedded raster
illustrations.

**Response:** Issue
[#164](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/164) and
merged PR
[#230](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/230) delivered
30 original square PNG files, 30 optimised WebP exports, accessible alt text,
fallbacks, attribution, and a validated manifest. Small shared celestial frame
details remain native SVG assets where vector scaling provides a real benefit.

**Decision:** The all-SVG proposal was rejected in favour of PNG originals,
WebP delivery assets, and limited SVG use for reusable decoration.

## Outcome and follow-up

| Item                          | Outcome                                       | Evidence                          |
| ----------------------------- | --------------------------------------------- | --------------------------------- |
| Ordered trail persistence/API | Implemented and reviewed                      | #176 / PR #197                    |
| Trail discovery interface     | Implemented and reviewed                      | #177 / PR #223                    |
| Thirty production card images | Implemented with PNG and WebP                 | #164 / PR #230                    |
| All-card SVG proposal         | Rejected with a documented format alternative | Card artwork contract and PR #230 |

The repository proves implementation and review, but this retrospective record
does not independently prove that Calvin formally accepted every delivered
detail. A later demonstration should record any requested adjustment or explicit
acceptance against the deployed trail and collection experiences.

## AI declaration

This retrospective record was generated, edited, and reviewed with the
assistance of Codex[gpt-5.6-sol]. Dates, participants, and review topics were
supplied by the team; issue, pull-request, asset-format, and verification claims
were checked against the repository.

Meeting naming and navigation updated with assistance from Codex-CLI[GPT-6].

Page title clarified with assistance from Codex-CLI[GPT-6].

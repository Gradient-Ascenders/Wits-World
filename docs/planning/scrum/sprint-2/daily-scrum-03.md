---
title: Daily Scrum 03 - integrated experiences
sidebar_position: 5
---

# Daily Scrum 03 - integrated experiences

| Field            | Record                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Checkpoint date  | 5 September 2026                                                                                      |
| Reporting window | 31 August-5 September 2026                                                                            |
| Participants     | Kevin Ebrahim, Tyron Van Tonder, Uzair Mahomed, Caleb Perumalsamy                                     |
| Sprint focus     | Expose the new account, challenge, progression, trail, PvP, and Author capabilities through usable UI |
| Evidence         | Merged PRs #209, #211, #214, #218, and #221-#226; 4 September stakeholder review                      |

## Progress since the previous checkpoint

| Workstream       | Evidence-backed update                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product/Web      | Kevin delivered the account lifecycle experience, ordering challenge authoring/player flow, profile and progression navigation, trail discovery, asynchronous PvP experience, and related responsive state handling. |
| API/security     | Tyron completed voluntary PvP resignation and outgoing invitation cancellation, while supporting the integrated account, progression, trail, and curation contracts consumed by the Web client.                      |
| Data             | Uzair reviewed database architecture and removed six redundant indexes without changing domain behaviour.                                                                                                            |
| Quality/delivery | Caleb surfaced question performance analytics and continued coordination of content, test automation, poor-GPS, and release-evidence work.                                                                           |

## Integrated outcomes

1. Players could recover passwords and request protected account deletion.
2. Authors and players could use the ordering challenge format end to end.
3. Profiles exposed progression, achievements, streaks, and standings from
   server-owned data.
4. Players could discover ordered trails and nearby unvisited events.
5. Asynchronous PvP supported invitations, legal turn submission, deadlines,
   cancellation, resignation, and match presentation.
6. Authors could manage curation, campaign, and analytics capabilities through
   protected role-checked operations.

## Stakeholder integration

The [4 September database usage review](../../stakeholder-interactions/2026-09-04-database-usage-review.md)
raised Neon compute consumption, possible JSON restructuring, and database
pipeline options. The team retained the relational model, separated production
and test databases, allowed idle compute to suspend, and removed redundant
indexes. The alternatives that were not selected remained documented rather
than being presented as implemented.

## Coordination points

- UI states had to display server-returned deadlines, actors, progression,
  eligibility, and validation failures rather than infer them locally.
- Author curation and campaign screens had to preserve role checks and avoid
  exposing accepted challenge answers through player endpoints.
- The richer navigation increased the need for consistent loading, empty,
  error, permission, and success feedback.

## Remaining concerns

- The 30-card catalogue, evolution flows, and production event/question set
  were still active content dependencies.
- Database, package, and browser automation had not yet become a complete PR,
  nightly, and release verification path.
- Final participant testing and deployed release validation remained open.

## Plan before the next checkpoint

- Finish the card catalogue, Power-card migration compatibility, and atomic
  evolution behaviour.
- Standardise application feedback states across player and Author workflows.
- Complete automated verification and verified event/question content.
- Run formal user testing, convert findings into Gitea issues, and verify the
  resulting changes.

## AI declaration

This Daily Scrum summary was generated with assistance from
Codex-CLI[gpt-5.6-sol medium] using repository, Gitea, and stakeholder evidence.

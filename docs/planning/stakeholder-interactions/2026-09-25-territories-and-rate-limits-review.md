---
title: Territory variety and distributed rate limiting review - 25 September 2026
---

# Territory variety and distributed rate limiting review - 25 September 2026

## Interaction record

| Field                 | Record                                                                              |
| --------------------- | ----------------------------------------------------------------------------------- |
| Date                  | 25 September 2026                                                                   |
| Status                | Planned stakeholder interaction; implementation status checked on 28 September 2026 |
| Stakeholder (planned) | Calvin Rea                                                                          |
| Team (planned)        | Uzair Mahomed, Kevin Ebrahim, Tyron Van Tonder, and Caleb Perumalsamy               |
| Format                | Stakeholder review of territory placement and external API safeguards               |
| Scope                 | Randomized territory locations and Upstash-backed shared rate limiting              |

## Feedback and evaluation

### Randomize territories instead of using fixed zones

**Review topic:** Introduce variety in the placement of contested zones rather
than always using the same three campus territories.

**Evaluation:** Randomization must operate within reviewed campus safety and
coverage boundaries. It must not create unreachable zones, overlapping active
territories, or changing boundaries during an existing contest. Committed
ownership, influence, rewards, and match-to-zone snapshots must remain stable.

**Current response:** The territory foundation is implemented through
[issue #268](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/268),
[PR #298](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/298), and
the runtime in
[PR #299](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/299).
The current `territory-v1` catalogue uses reviewed East Campus, West Campus, and
Arts and Community geometry. Automatic event placement is a separate feature;
it does not make territory boundaries random.

**Planned response:** Agree the rotation cadence and placement rules, then
generate territory candidates inside approved campus areas. Validate the
PostGIS geometry, accessibility, minimum usable area, and non-overlap before
activating a new set. Persist the chosen zones as independently versioned
definitions; rerunning a job must not silently reroll the same cycle. Existing
grants and matches retain their original zone versions. Update the map and list
views together so players can identify the current territories.

**Proposed decision:** Accept as a follow-up feature, subject to agreement on
cadence and campus-placement constraints. Randomized territory placement is
planned, not implemented in current main.

### Use Upstash to enforce shared external API rate limits

**Review topic:** Enforce the external developer API quota through a shared
service so it cannot be multiplied by switching API instances or reset by
restarting one process.

**Evaluation:** Keep API-key authentication, revocation, ownership checks, and
public-data filtering in the API. A shared limiter should enforce quota across
instances without sending raw API keys, Auth0 tokens, or private player data to
the counter store. Agree the behavior during limiter-service failure before
deployment.

**Current response:** Merged
[PR #304](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/304)
implements the external read-only developer API and per-key process-local
limiting. The default is 120 requests per 60 seconds, with standard rate-limit
headers and `429 RATE_LIMITED` responses. This is not an Upstash integration or
a distributed quota.

**Planned response:** Add an API-side Upstash-backed shared limiter using
atomic counter/window operations and bounded expiry. Derive a non-secret quota
key from the validated credential identity, keep service credentials server-side,
and retain the existing response contract. Make limits configurable, document
the chosen outage behavior, and confirm that multiple instances count against
the same quota. Request an implementation issue and independent review before
marking this action handled.

**Proposed decision:** Accept shared enforcement as a follow-up integration.
Upstash-backed limiting is planned, not implemented in current main.

## Outcome and follow-up

| Item                           | Current outcome              | Next action                                                                    | Owner                      |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------------------------ | -------------------------- |
| Fixed territory foundation     | Implemented                  | Retain existing integrity and settlement guarantees                            | Uzair and Tyron            |
| Randomized territory placement | Handled                      | Agree cadence; implement versioned generation and validated activation         | Uzair and Tyron            |
| Territory discovery interface  | Existing map/list experience | Display generated zones and lifecycle states consistently                      | Kevin                      |
| External developer API         | Implemented                  | Retain authentication, revocation, and public-only projections                 | Tyron                      |
| Upstash-backed shared quota    | Handled                      | Implement shared enforcement and its deployment configuration                  | Tyron                      |
| Evaluation and evidence        | Handled                      | Check geometry/rotation, concurrent quotas, reset windows, and service failure | Caleb with Uzair and Tyron |

For territories, demonstrate that repeated reads do not move a zone and that a
new cycle does not rewrite a completed contest. For rate limiting, exercise two
API instances with one test key, confirm the combined quota and `Retry-After`,
and verify that another key remains independent. Record the stakeholder's
decision, resulting issue and PR links, and demonstration outcome when available.

## Evidence

- [Contested-campus zone policy](../../requirements/contested-campus-zone-policy.md)
- [Territory persistence](../../database/contested-campus-territory-persistence.md)
- [External developer API and current rate limits](../../architecture/developer-api.md)

## AI declaration

This review plan was generated and edited with assistance from Codex-CLI[gpt-6-sol]. The team
supplied the date and topics; the existing territory catalogue and developer API
were checked against current main and Gitea on 28 September 2026.

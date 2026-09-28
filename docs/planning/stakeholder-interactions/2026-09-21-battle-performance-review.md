---
title: CPU battle and realtime performance review - 21 September 2026
---

# CPU battle and realtime performance review - 21 September 2026

## Interaction record

| Field                 | Record                                                                              |
| --------------------- | ----------------------------------------------------------------------------------- |
| Date                  | 21 September 2026                                                                   |
| Status                | Planned stakeholder interaction; implementation status checked on 28 September 2026 |
| Stakeholder (planned) | Calvin Rea                                                                          |
| Team (planned)        | Uzair Mahomed, Kevin Ebrahim, Tyron Van Tonder, and Caleb Perumalsamy               |
| Format                | Stakeholder review and battle demonstration                                         |
| Scope                 | CPU action responsiveness, database round trips, and live battle updates            |

## Feedback and evaluation

### Optimize CPU battles

**Review topic:** Reduce the delay between choosing a battle action and seeing
the confirmed result. Include match preparation and history loading in the
review, rather than assessing only the public home page.

**Evaluation:** Prioritize unnecessary network and database work while retaining
server-authoritative actions, version checks, locking, idempotency receipts,
legal-action validation, and persistent match recovery. A faster animation alone
does not establish a faster API response.

**Response:** Earlier work in merged
[PR #245](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/245)
reduced unchanged identity resolution to an indexed read and batched CPU history
queries. The existing CPU action flow returns the authoritative result from one
POST without requiring a second GET after a successful action.

Merged
[PR #327](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/327)
adds a single-scan card aggregate query and replaces ten sequential CPU card
snapshot inserts with one batched statement. Its disposable-database benchmark
reported snapshot insertion improving from approximately 1.74-1.75 seconds to
174-182 milliseconds. This measures match preparation, not deployed
click-to-result latency.

**Implementation decision:** Handled at the repository level through the merged
performance work. Demonstrate the deployed CPU action path and record whether
its response time meets the stakeholder's expectations.

### Implement WebSockets for faster live updates

**Review topic:** Deliver an opponent's committed action promptly without
waiting for repeated HTTP polling during a live battle.

**Evaluation:** Use WebSockets as a delivery mechanism, not as a replacement for
database authority. Reconnects, duplicate submissions, stale connections,
timeouts, and spectator access must continue to resolve against persisted state.
CPU battles do not need a second-player notification channel simply to return
their synchronous action result.

**Response:**
[Issue #253](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/253)
and merged
[PR #285](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/285)
provide the live-PvP WebSocket gateway, short-lived one-use connection tickets,
persisted reconnect generations, server-owned deadlines, spectator-safe
projections, and PostgreSQL post-commit notification fan-out. The client battle
experience is integrated in merged
[PR #318](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/318).

**Implementation decision:** Handled for live PvP. CPU battles retain their
authoritative HTTP action flow; no CPU WebSocket migration is claimed.

## Outcome and follow-up

| Item                               | Implementation outcome       | Review action                                                              | Owner           |
| ---------------------------------- | ---------------------------- | -------------------------------------------------------------------------- | --------------- |
| CPU preparation and query overhead | Handled                      | Compare warm and first-after-idle match preparation and action responses   | Tyron           |
| Live opponent update delivery      | Handled                      | Demonstrate two clients receiving committed updates without manual refresh | Tyron and Kevin |
| Recovery and pending controls      | Existing safeguards retained | Disconnect and reconnect; confirm no duplicate action or extended deadline | Kevin and Caleb |
| Stakeholder assessment             | Handled                      | Record specific feedback, acceptance, and any further issue links          | Uzair           |

Use browser Network timings and the API's `Server-Timing` header to separate
network waiting, identity work, and route work. Record the environment, sample
size, and warm/cold distinction. Do not generalize homepage Lighthouse results
or isolated database benchmarks into a claim about authenticated battle latency.

## Evidence

- [API speed and battle response results](../../testing/api-battle-responsiveness.md)
- [Live PvP contract](../../architecture/live-pvp-api-contract.md)
- [Live PvP persistence](../../database/live-pvp-persistence.md)

## AI declaration

This review plan was generated and edited with assistance from Codex-CLI[gpt-6-sol]. The team
supplied the date and topics; implementation references were checked against
current main and Gitea on 28 September 2026.

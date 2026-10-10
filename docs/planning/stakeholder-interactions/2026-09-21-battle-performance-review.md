---
title: 'Battle performance'
---

# Battle performance

**Planned review:** 21 September 2026 with Calvin Rea.
**Planned team:** Uzair Mahomed, Kevin Ebrahim, Tyron Van Tonder and Caleb Perumalsamy.

[All stakeholder reviews](index.md)

This is a review plan, not a completed meeting record. The implementation
snapshot was checked on **28 September 2026**; a deployed demonstration and
stakeholder assessment were not recorded.

## Review topics and decisions

- **Reduce battle delay:** Remove unnecessary network/database work while
  retaining legal-action checks, versioning, locks, idempotency and recovery.
  Review preparation, action results and history separately; shorter animations
  do not prove faster API responses.
- **Deliver live updates promptly:** Use WebSockets for committed opponent
  actions in live PvP. Persisted state remains authoritative through reconnects
  and deadlines. CPU battles keep their synchronous HTTP action flow.

## Implementation evidence

- [PR #245](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/245)
  reduced unchanged-identity work and batched CPU history. Successful CPU actions
  return authoritative state from one POST without a follow-up GET.
- [PR #327](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/327)
  replaced ten sequential snapshot inserts with one batch and added a single-scan
  card aggregate. Its disposable-database benchmark reported **1.74–1.75 s →
  174–182 ms** for snapshot insertion, not deployed action latency.
- [#253](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/253) /
  [PR #285](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/285)
  delivered live-PvP tickets, reconnect generations, deadlines, spectator-safe
  projections and post-commit notifications.
  [PR #318](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/318)
  integrated the client.

See [battle measurements](../scrum/sprint-2/evidence.md#battle-responsiveness),
the [live PvP contract](../../architecture/live-pvp-api-contract.md) and
[persistence](../../database/live-pvp-persistence.md).

## Follow-up

Tyron compares warm/cold preparation and action timings; Tyron and Kevin
demonstrate two-client updates. Kevin and Caleb check reconnects without duplicate
actions or extended deadlines. Uzair records stakeholder feedback and acceptance.
Separate browser/network timing from server stages; local benchmarks are not
deployed click-to-result proof.

## AI declaration

Prepared and edited with assistance from Codex-CLI[gpt-6-sol] and Codex[GPT-6].
The team supplied the date/topics; implementation references retain the
28 September snapshot. No review or measurements were rerun for this rewrite.

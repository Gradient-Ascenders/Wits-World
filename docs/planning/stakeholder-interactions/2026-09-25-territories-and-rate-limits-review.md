---
title: 'Territories and rate limits'
---

# Territories and rate limits

**Planned review:** 25 September 2026 with Calvin Rea.
**Planned team:** Uzair Mahomed, Kevin Ebrahim, Tyron Van Tonder and Caleb Perumalsamy.

[All stakeholder reviews](index.md)

This is a review plan, not a completed meeting record. At the **28 September 2026**
implementation snapshot, fixed territories and the developer API existed;
randomised territory placement and Upstash-backed quotas remained planned.

## Review topics and decisions

- **Vary territory placement:** Proposed follow-up, subject to agreed rotation
  and campus-safety rules. Validate usable, accessible, non-overlapping geometry;
  version each chosen set without rerolling retries or moving active contests.
  Existing matches, influence and rewards retain their zone snapshots.
- **Share external API quotas:** Proposed Upstash integration, subject to
  independent review and an agreed outage policy. Keep authentication, revocation
  and public-data filtering in the API; do not send raw keys, tokens or private
  player data to the counter store.

## Implementation evidence

[#268](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/268),
[PR #298](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/298) and
[PR #299](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/299)
delivered the territory foundation and runtime. The recorded `territory-v1`
catalogue used fixed East Campus, West Campus, and Arts and Community geometry.
Automatic event placement was separate; it did not randomise territory boundaries.

[PR #304](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/304)
delivered the read-only developer API with process-local per-key limiting:
**120 requests per 60 seconds**, rate-limit headers and `429 RATE_LIMITED`.
That snapshot did not provide distributed quota enforcement or Upstash integration.

See [zone policy](../../requirements/contested-campus-zone-policy.md),
[territory persistence](../../database/contested-campus-territory-persistence.md)
and the [developer API](../../architecture/developer-api.md).

## Follow-up

Uzair and Tyron agree placement/rotation rules and versioned activation; Kevin
updates map/list discovery. Tyron implements shared quotas with atomic windows,
bounded expiry, server-only credentials and the existing response contract.

Caleb, Uzair and Tyron verify stable geometry across reads/cycles, combined quotas
across two instances, window reset, `Retry-After`, independent keys and service
failure. Record resulting issues/PRs and stakeholder outcomes before claiming
the extensions implemented or accepted.

## AI declaration

Prepared and edited with assistance from Codex-CLI[gpt-6-sol] and Codex[GPT-6].
The team supplied the date/topics; implementation status retains the
28 September snapshot, not a new audit of current main.

---
title: 'Database and hosting'
---

# Database and hosting

**Meeting:** 4 September 2026, Google Meet with Calvin Rea.
**Team:** Uzair Mahomed, Kevin Ebrahim, Tyron Van Tonder and Caleb Perumalsamy.

[All stakeholder reviews](index.md)

This retrospective record was prepared on 14 September from a team summary and
repository evidence. It is not a transcript or a record of formal acceptance.

## Feedback and decisions

- **Reduce idle compute:** Neon had consumed more than 100 compute-unit hours
  too quickly. The team accepted the availability concern and reduced background
  database activity without weakening persistence or request-time deadlines.
- **Keep relational storage:** Broad conversion to JSON was not selected.
  Foreign keys, uniqueness, transactions and indexed relationships remain
  important. JSONB stays at suitable historical battle-snapshot boundaries.
- **Separate environments:** A pipeline sharing production and testing within
  one Neon project was not adopted. Tyron separated the hosted projects; routine
  PR tests use ephemeral PostGIS. Production migrations remain guarded,
  operator-authorised work rather than an application-deployment side effect.

## Implementation evidence

[PR #212](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/212)
records idle-compute controls. The retained solution used a 30-minute production
maintenance cadence, rejected intervals below 15 minutes, and allowed the pool
to idle. Neon was configured with a 0.25 CU minimum and five-minute scale-to-zero
delay. Request-time expiry checks remained authoritative.

The [Neon/PostGIS setup](../../database/neon-postgis-setup.md#required-databases),
[CI guide](../../testing/continuous-integration.md),
[test catalogue](../../testing/automated-verification.md) and
[database release procedure](../../database/database-release-procedure.md)
document environment isolation and release safeguards. These changes do not
establish a measured reduction in hosted usage.

## Meeting photo

![The team's Google Meet call with Calvin Rea](./meeting%20picture.png)

Kevin identified this repository photo as belonging to the meeting. It records
the call, not acceptance of every decision.

## Follow-up

Record a dated Neon usage comparison and confirm production/test separation and
obsolete-branch cleanup at release review. Omit account identifiers, connection
details and private database values from evidence.

## AI declaration

Prepared and edited with assistance from Codex[gpt-5.6-sol], Codex-CLI[GPT-6]
and Codex[GPT-6]. Meeting details and project separation were supplied by the
team; implementation references retain their original review context.

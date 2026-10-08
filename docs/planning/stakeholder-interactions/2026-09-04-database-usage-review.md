---
title: 'Meeting 2 — Calvin Rea'
---

# Meeting 2 — Calvin Rea

**4 September 2026 · Database & hosting**

[All stakeholder meetings](index.md)

:::note[Retrospective stakeholder record]

This record was created on 14 September 2026 from a team-provided summary and
repository evidence. It is not a transcript and does not attribute direct
quotations or unrecorded approval to any participant. Operational Neon changes
are described without account identifiers, credentials, connection strings, or
private database values.

:::

## Interaction record

| Field             | Record                                                                     |
| ----------------- | -------------------------------------------------------------------------- |
| Date              | 4 September 2026                                                           |
| Stakeholder       | Calvin Rea                                                                 |
| Team participants | Uzair Mahomed, Kevin Ebrahim, Tyron Van Tonder, and Caleb Perumalsamy      |
| Format            | Online stakeholder review via Google Meet (shown in the meeting photo)     |
| Scope             | Neon compute usage, database storage design, and database delivery/testing |

## Meeting photo

![Screenshot of the team’s Google Meet call with Calvin Rea](./meeting%20picture.png)

_Meeting 2. Kevin confirmed that this existing repository photo belongs to this
meeting. The image records the call; the feedback and decisions are documented below._

## Feedback and evaluation

### Neon compute consumption

**Feedback:** The team and stakeholder reviewed that the Neon project had
consumed more than 100 compute-unit hours too quickly. Continuing the same idle
query pattern risked exhausting the hosted free-tier allowance before later
development and release work.

**Evaluation:** Accepted as an operational and availability concern. The team
kept PostgreSQL/PostGIS as the authoritative database and focused on removing
unnecessary background activity rather than weakening persistence or protected
game rules.

**Response:** The retained solution spaces database-backed account-deletion,
movement-evidence, and asynchronous-PvP maintenance on a 30-minute production
cadence, rejects unsafe intervals below 15 minutes, and allows the connection
pool and Neon compute to become idle. Neon remains configured with a `0.25 CU`
minimum and a five-minute scale-to-zero delay. Routine pull-request database
verification uses an ephemeral PostGIS service rather than repeatedly using the
hosted Neon project.

**Evidence:** Merged
[#212](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/212), the
[Neon/PostGIS setup](../../database/neon-postgis-setup.md),
and the [continuous integration guide](../../testing/continuous-integration.md).

**Decision:** Accepted and handled. Request-time deadline and expiry checks
remain authoritative; the longer maintenance cadence does not extend a game
deadline or make expired evidence valid.

### Converting relational database structures to JSON

**Feedback:** Converting parts of the relational schema into JSON was considered
as a possible way to reduce Neon storage.

**Evaluation:** Considered and not selected. JSON does not inherently remove
PostgreSQL storage overhead, and moving authoritative relationships into large
documents would weaken foreign keys, uniqueness constraints, transactional
updates, indexed queries, and migration clarity. The existing design already
uses JSONB selectively for immutable battle snapshots and action results where
document-shaped historical data is appropriate.

**Response:** The team retained the normalised relational model for players,
events, attempts, rewards, ownership, decks, and match relationships. Capacity
and workload were addressed through environment isolation, idle-compute
controls, targeted index cleanup, and appropriate use of JSONB only at existing
snapshot boundaries.

**Decision:** Rejected with technical motivation. No broad relational-to-JSON
migration was implemented.

### Database pipeline and environment isolation

**Feedback:** A separate database pipeline was considered while the production
and testing targets were branches within one Neon project.

**Evaluation:** Considered and not selected in that form. Sharing one hosted
project joined production and test compute allowances and increased the risk of
test activity affecting the operational boundary.

**Response:** Tyron Van Tonder separated production and testing into two Neon
database projects. Pull requests use isolated ephemeral PostGIS, while hosted
test execution is reserved for controlled nightly or release verification.
Production migration remains a separately authorised, guarded operation instead
of an automatic application-deployment side effect.

**Evidence:** The
[database environment rules](../../database/neon-postgis-setup.md#required-databases),
[automated verification matrix](../../testing/automated-verification.md), and
[database release procedure](../../database/database-release-procedure.md).

**Decision:** The original shared-project/pipeline approach was not implemented.
Separate hosted projects plus isolated CI and guarded production release were
adopted instead.

## Outcome and follow-up

| Item                                | Outcome                                   | Remaining evidence                                             |
| ----------------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| Excessive idle compute consumption  | Handled through cadence and idle controls | Record a dated Neon usage comparison at release review         |
| Broad relational-to-JSON conversion | Rejected with technical motivation        | None unless measured storage evidence changes the trade-off    |
| Shared production/test Neon project | Replaced with separate projects           | Confirm target separation during release without exposing URLs |
| Automatic production DB pipeline    | Not adopted                               | Continue guarded operator-run production migrations            |

The next release review should record the current Neon usage trend and confirm
that no obsolete branch compute remains active. Dashboard screenshots must omit
project identifiers, connection details, and account information.

## AI declaration

This retrospective record was generated, edited, and reviewed with the
assistance of Codex[gpt-5.6-sol]. Dates, participants, discussion topics, and
the operational project separation were supplied by the team; repository links
were checked against the current implementation.

Meeting naming and navigation updated with assistance from Codex-CLI[GPT-6].

Page title clarified with assistance from Codex-CLI[GPT-6].

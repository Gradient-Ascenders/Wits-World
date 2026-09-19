---
title: Automatic event placement persistence
---

# Automatic event placement persistence

Migration `0045_create_event_placement_persistence.sql` supplies the durable
PostgreSQL/PostGIS boundary for the automatic-placement policy. Migration
`0049_enable_event_placement_services.sql` extends it for the placement
service, Author operations, and player location resolution. The service flow
is documented in [Automatic event placement service](../architecture/automatic-event-placement-service.md).

## Stored model

| Relation                          | Responsibility                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `event_placement_policy_versions` | Immutable snapshots of reviewed placement limits and rotation settings             |
| `event_placement_zones`           | Reviewed PostGIS multipolygons and zone lifecycle                                  |
| `event_placement_sites`           | Reviewed PostGIS points, source evidence, maximum event radius, and site lifecycle |
| `event_placement_portability`     | Effective-period history for explicit event opt-in under one policy version        |
| `event_placement_state`           | Singleton current policy, applied plan, and optimistic-concurrency version         |
| `event_placement_plans`           | Preview, applied, degraded, expired, and failed planning decisions                 |
| `event_placement_plan_entries`    | Exact event, site, and zone choices in one plan                                    |
| `event_placement_assignments`     | Effective event-to-site history and end reasons                                    |
| `event_placement_overrides`       | Bounded pins, site exclusions, and automation pauses                               |
| `event_placement_audit`           | Immutable Author or scheduler operation evidence                                   |

Policy rows, reviewed geometry, plan entries, terminal plans, and audit records
cannot be rewritten. An assignment or portability approval may only move from
current to ended once. Retiring a site or zone retains every policy, plan,
assignment, and audit reference.

## Spatial authority

Candidate locations use `geography(Point, 4326)`, while coverage areas use
`geometry(MultiPolygon, 4326)`. GiST indexes support distance, separation, and
coverage queries. Deferred validators require an active site to:

- have completed review evidence;
- reference an active zone from the same policy;
- fall within its declared zone; and
- fall within exactly one active zone for that policy.

The initial `placement-v1` zone geometries are conservative unions of
60-metre catchments around the eleven reviewed site points. They are an
operational coverage model, not walking routes, cadastral boundaries,
accessibility guarantees, opening-hours evidence, or safety claims.

Only active sites and zones may receive an assignment. Suspending or retiring
either cannot commit while an assignment there remains current. The service
must close affected assignments in the same transaction, preserving the
policy requirement without allowing a hidden trigger to invent an actor,
reason, or end time.

## Policy and catalogue seed

Repeatable seed `0003_event_placement_catalogue.sql` records:

- immutable policy `placement-v1`;
- three active zones and eleven active reviewed sites from issue `#259`;
- source URLs and `controlled_policy` review provenance;
- a 60-metre supported maximum interaction radius per site; and
- placement state version zero with no current plan.

The seed does not create portable-event approvals or assignments. Existing
published Wits content remains fixed because the approved policy says that
landmark-specific content cannot silently become portable. A separately
reviewed event replacement must be opted in under the active policy.

## Plans, assignments, and concurrency

Plans retain their policy version, Johannesburg rotation bucket, deterministic
input digest, expected and committed state versions, counts, exceptions,
failure code, predecessor, and rollback source. Only one applied or degraded
plan can commit for one policy and rotation bucket.

Migration `0049` keeps scheduled plans unique per policy and bucket while
allowing audited manual and reconciliation plans in that bucket. State-version
increments may retain the current committed plan after an override or lifecycle
change; selecting a different current plan requires its committed version to
match the new state version.

Plan entries use relational foreign keys rather than an unvalidated JSON list.
Current assignment uniqueness prevents one event from appearing at two sites
or one site from hosting two events. Assignments also verify policy consistency,
active reviewed lifecycle, current portability approval, publication state,
and the site's maximum radius. Effective periods use `[starts_at, ends_at)`
semantics; their decision fields remain immutable after insertion.

Pins, exclusions, and pauses store a canonical request hash and an
Author-scoped idempotency key. Their maximum durations come from the referenced
policy version: seven days for pins and pauses, and thirty days for site
exclusions. The API must still use the singleton state version and row locking
when applying a plan or override. Migration `0049` also adds the optional
`challenge_attempts.placement_assignment_id` reference and a database
resolver for effective event locations. A managed event without a valid
assignment is unavailable rather than falling back to its authored point.

## Privacy and release

Placement persistence contains curated operational data only. It stores no
player coordinates, movement evidence, attendance history, challenge answers,
or completion-density input. Player-facing APIs must not expose review notes,
source evidence, policy internals, or placement history.

The focused integration suite creates disposable databases and verifies clean
and upgrade migration paths, exact seed content, spatial membership and
indexes, lifecycle failures, assignment history, uniqueness, override bounds,
and policy immutability:

```bash
npm run test:database --workspace @wits-world/api
```

Apply migrations through `0049`, then run the normal seed release step to
install `placement-v1`, before deploying the placement-enabled API. The seed
does not approve any portable events or create assignments. These migrations
do not rewrite authored coordinates or historical attempts.

The preceding document was generated and edited with the assistance of:
Codex[GPT-5.6 Sol] and Codex[GPT-5].

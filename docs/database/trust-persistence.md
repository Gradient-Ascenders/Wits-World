---
title: 'Longitudinal trust persistence'
---

# Longitudinal trust persistence

## Purpose

Migration `0045_persist_longitudinal_trust.sql` implements the persistence layer
for the `trust-v1` policy defined by issue `#254`. It stores only derived,
privacy-limited trust data and human governance history. Issue `#257` does not
calculate risk scores, create signals from gameplay, enforce restrictions, or
expose review/appeal APIs; those remain service-layer work for issue `#258` and
later UI issues.

All trust relations live in the `private` PostgreSQL schema. The browser does
not read or write them directly.

## Stored relations

| Relation                           | Purpose                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `private.trust_policy_versions`    | Immutable policy identifiers; `trust-v1` is seeded by the migration.                                                               |
| `private.trust_signals`            | Immutable derived signals with an opaque source reference and deduplication digest.                                                |
| `private.trust_score_snapshots`    | Immutable policy-versioned category totals, final score, review band, and calculation digest.                                      |
| `private.trust_cases`              | The versioned current case projection; at most one non-terminal case exists per player.                                            |
| `private.trust_case_evidence`      | Immutable non-sensitive evidence summaries that can outlive source-signal retention.                                               |
| `private.trust_case_decisions`     | Append-only system and Author decisions tied to case-version transitions.                                                          |
| `private.trust_decision_evidence`  | Append-only links between decisions and safe evidence summaries.                                                                   |
| `private.trust_signal_adjustments` | Append-only reviewed-false-positive adjustments sourced from an Author decision or appeal resolution without rewriting the signal. |
| `private.trust_restrictions`       | Immutable original restriction scopes and durations.                                                                               |
| `private.trust_appeals`            | One immutable appeal submission per challenged restriction decision.                                                               |
| `private.trust_appeal_resolutions` | One append-only different-Author resolution per appeal.                                                                            |

## Privacy boundary

Trust persistence never stores precise coordinates, exact journey distance or
speed, reported accuracy, submitted answers, access tokens, Auth0 claims,
hidden cards, complete match state, or arbitrary evidence/payload JSON.

`trust_signals.source_identifier` is an opaque identifier for the authoritative
operation that produced the signal. `deduplication_digest` is a 32-byte digest
of the canonical deduplication key. The database enforces uniqueness on player,
policy version, signal type, and digest so replay or concurrent ingestion cannot
inflate the score.

There is intentionally no restrictive foreign key from a signal to short-lived
movement evidence. Precise movement rows may expire on their existing bounded
retention schedule while the derived non-precise signal remains for its own
90-day lifetime.

## Policy constraints

The migration closes the `trust-v1` signal types and base points documented by
`#254`. Impossible movement is limited to `moderate`/15 points or `strong`/25
points. The remaining signal types keep a normalised severity label because
`#254` does not define a closed severity vocabulary for them; issue `#258` must
use a policy-confirmed value when those producers are enabled.

Score snapshots enforce category caps, a final `0..100` range, exact review-band
boundaries, a non-negative source count, and a 32-byte calculation digest. The
database validates consistency but does not calculate the score.

New cases start `open` at version `1`. Every later case mutation advances the
version exactly once, and every persisted case version requires exactly one
matching append-only decision in the same transaction. Resolved case status and
review semantics are terminal; one later audited mutation may set
`governance_finalized_at` after the appeal lifecycle finishes without changing
the score, snapshot, resolution, or status. A partial unique index prevents two
non-terminal cases for one player, including concurrent inserts.

Author decisions require an active local `author` and the reviewer cannot be
the target player. Reviewer identity is stored only as the existing local
player UUID, so later account deletion leaves the normal anonymised player
tombstone instead of copying Auth0 identity into the trust schema.

## Restrictions and appeals

Restriction rows store the original human decision. One decision may carry any
combination of the three `trust-v1` scopes, but duplicate scopes are rejected
and original duration is bounded to seven days. Appeal resolution does not
rewrite those rows.

One appeal may challenge a restriction decision while the restriction is active
or during the 30 days after its original expiry. The resolving Author must be
active, must not be the target player, and must differ from the Author who made
the challenged decision. `upheld`, `shortened`, and `overturned` outcomes are
append-only.

Appeal status is derived from the presence/timing of the appeal and resolution
records rather than stored as a repeatedly mutable status field. An appeal
resolution may also be the immutable provenance for a reviewed-false-positive
signal adjustment; its effective time must equal the appeal-resolution time.

## Retention

Migration `0045` provides `private.purge_expired_trust_data(as_of)` as an
idempotent cleanup primitive. It does not schedule cleanup itself.

- derived signals expire 90 days after `observed_at`;
- score snapshots expire 12 months after `evaluated_at`;
- closed case governance is retained until 12 months after
  `governance_finalized_at`;
- open cases remain until resolution or account deletion.

A case may be resolved before its appeal lifecycle is fully finished. For that
reason `governance_finalized_at`, not `resolved_at`, is the retention anchor for
the case/evidence/decision/restriction/appeal graph.

## Account deletion

When an active player enters `deletion_pending`, an `AFTER` lifecycle trigger in
the same transaction removes active trust signals and non-terminal cases. A
resolved case whose appeal/governance lifecycle has not yet been finalized is
also removed so account deletion cannot leave an unbounded retained case.
Still-active restrictions and unresolved appeals on any retained finalized
case are removed. Finalized closed governance and score snapshots may remain
against the anonymous local player tombstone for their remaining documented
retention.

The existing account-deletion completion later clears Auth0 identity, Player
Name, and role from the player row. A later registration gets a new local UUID,
so it cannot inherit the deleted account's score, case, restriction, or appeal.

## Concurrency and audit

Database uniqueness and deferred integrity checks are the authority for
persistence races. In particular:

- the same source/pattern digest can create at most one signal per player,
  policy, and signal type;
- at most one non-terminal case may exist per player;
- a case version cannot commit without its matching decision;
- stale service-layer updates can use `WHERE version = expectedVersion` under a
  row lock and cannot silently overwrite another reviewer;
- trust history tables reject normal updates/deletes and are removed only by
  account-deletion cleanup or documented retention cleanup.

No persistent reviewer-lock lease is added by `#257`. Issue `#258` should use
PostgreSQL row locking plus `expectedVersion`; `under_review` remains the durable
case lifecycle state.

## AI declaration

This persistence design and implementation guide was generated, edited, and
reviewed with the assistance of ChatGPT-Web[GPT-5.6 Sol].

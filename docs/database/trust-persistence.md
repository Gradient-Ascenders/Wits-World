---
title: 'Trust and review storage'
---

# Trust and review storage

Trust persistence stores derived activity signals, score snapshots, and human
review history in the `private` schema. The API owns all reads and writes.
Scores prioritise cases; only a reviewed decision can create a restriction.

The [Moderation and trust guide](../requirements/longitudinal-trust-policy.md)
defines scoring and reviewer behaviour. This page covers integrity, privacy,
and retention.

## Stored model

| Relation                                    | Responsibility                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `trust_policy_versions`                     | Immutable policy identifiers used by signals and calculations.          |
| `trust_signals`                             | Derived signals, opaque source references, and deduplication digests.   |
| `trust_score_snapshots`                     | Policy-versioned totals, review band, and calculation digest.           |
| `trust_cases`                               | Versioned current review state; at most 1 non-terminal case per player. |
| `trust_case_evidence`                       | Immutable safe summaries of evidence considered for review.             |
| `trust_case_decisions`                      | Append-only system and Author decisions for each case transition.       |
| `trust_decision_evidence`                   | Evidence associated with each decision.                                 |
| `trust_signal_adjustments`                  | Reviewed false-positive adjustments without rewriting signals.          |
| `trust_restrictions`                        | Original restriction scopes, start times, and expiry times.             |
| `trust_appeals`, `trust_appeal_resolutions` | Appeal submissions and independent resolution history.                  |

## Ingestion and evaluation

Signals come from authoritative operations, including committed movement
decisions, conflicting submission identifiers, and completed PvP history.
A unique player/policy/type/digest key prevents replay or concurrent ingestion
from inflating the score.

The service calculates the score; database checks enforce valid category totals,
review bands, and a final **0–100** range. New snapshots are appended when the
saved calculation changes. Maintenance retries recent match-history evaluation,
recalculates decaying signals, and purges expired data.

Opponent-pattern evaluation reads both aggregate rules from one completed-history
SQL statement at the match's completion-time cutoff. This gives both rules the
same snapshot. History committed later can enter a subsequent evaluation.

Existing human-resolved cases remain terminal. The same historical evidence
cannot immediately reopen them; a newly observed signal can create another case.

## Case concurrency and audit

Cases begin `open` at version 1. Each committed mutation advances the version
by 1 and has exactly 1 matching append-only decision in the same transaction.
Database uniqueness prevents concurrent creation of multiple active cases.

Runtime evaluation uses per-player transaction locks. Reviewer mutations also
lock the active target and case, then compare the required `expectedVersion`.
A stale version returns a conflict without saving a decision.

The decision, evidence links, any false-positive adjustments, and any restrictions
commit together. A failure rolls the entire operation back. Ordinary writes
cannot rewrite historical signals, evidence, decisions, or restrictions.

Only active Authors can decide cases, and they cannot review their own accounts.
The API derives the actor from authentication. Retained actor references do not
copy provider identity into the trust schema.

## Evidence privacy

Trust records contain no precise coordinates, journey distance or speed,
reported accuracy, submitted answers, access tokens, Auth0 claims, hidden cards,
or complete match state.

Opponent-pattern evidence stores the signal-time window and aggregate counts.
It contains no opponent identities or raw match history. The reviewer projection
validates that saved summary and omits detector thresholds. Recomputing a rolling
window later would not reproduce the original evidence.

Legacy opponent-pattern evidence without a saved summary remains unavailable.
While unexplained evidence still contributes to the score, reviewer decisions
are blocked; the service does not invent historical context.

Derived movement signals do not depend on a restrictive foreign key to precise
movement rows. [Movement evidence](movement-evidence.md) can expire under its
shorter retention policy.

## Restrictions and appeals

A restriction retains its original human decision and duration, bounded to
**7 days**. The service derives its effective scope and expiry, including any
appeal resolution, without rewriting the original record.

The current reviewer API can create `online_verification_required`,
`location_reward_challenge_hold`, and `new_competitive_match_hold`.
The stored `card_trade_hold` scope remains readable, but this API cannot create it.

Appeal storage supports 1 appeal per challenged restriction decision, submitted
while the restriction is active or within **30 days** of its original expiry.
Resolution requires another active Author, distinct from the target and original
reviewer. Outcomes are append-only: `upheld`, `shortened`, or `overturned`.

Player appeal submission and Author appeal-resolution routes and screens are
not implemented. The database model does not imply an available user workflow.

## Retention and deletion

| Records                                                                          | Retention boundary                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Derived signals                                                                  | 90 days after observation.                                         |
| Score snapshots                                                                  | 12 months after evaluation, subject to retained-case requirements. |
| Finalised case governance and its evidence, decisions, restrictions, and appeals | 12 months after `governance_finalized_at`.                         |
| Unfinished cases after account deletion                                          | 90 days after deletion completion.                                 |

Open cases otherwise remain until resolution. Case governance may finish after
resolution because the appeal lifecycle must also close; `resolved_at` alone
does not start the finalised-case retention period. Cleanup runs at startup and
on the configured maintenance interval.

Account deletion removes active signals and rekeys retained cases to a fresh
profile-free actor. Free-text reasons and appeal text are redacted. The latest
retained-case snapshot remains available until the applicable case boundary.

Deleted-player cases are read-only, and retained restrictions have no active
capability effect. A new registration inherits none of the old trust state.
[Account retention](account-deletion-retention.md) defines the full purge.

Author reads and bounded exports use the same safe projections and object-level
access checks. Player responses expose neither stored scores nor case evidence.
The [API reference](../architecture/api-overview.md) owns endpoint details.

**AI declaration:** Prepared and updated with assistance from
ChatGPT-Web[GPT-5.6 Sol], Codex[GPT-5], and Codex[GPT-6].

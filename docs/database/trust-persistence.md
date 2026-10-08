---
title: 'Longitudinal trust persistence'
---

# Longitudinal trust persistence

## Purpose

Migration `0046_persist_longitudinal_trust.sql` implements the persistence layer
for the `trust-v1` policy defined by issue `#254`. It stores only derived,
privacy-limited trust data and human governance history. Issue `#258` now uses
that schema for deterministic score calculation, authoritative signal ingestion,
decay/recovery maintenance, and enforcement of already-reviewed restrictions.
Issue `#260` exposes the Author-only case queue, detail, evidence, restriction,
decision, audit, and bounded export API over the same versioned persistence.
Migration `0061_persist_trust_review_evidence_summaries.sql` adds only immutable
reviewer-safe aggregate context for opponent-pattern signals; it does not alter
trust-v1 scoring. Player appeal submission and resolution APIs remain later work.

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

For opponent-pattern signals only, `review_summary` and its immutable
`trust_case_evidence.safe_review_summary` copy retain the exact signal-time
evaluation window, aggregate completed/repeated-opponent or qualifying-forfeit
counts, concentration ratio, and trust-v1 threshold. They contain no opponent
identifier, match identifier, deck, battle state, or raw result history. This
small additive persistence is necessary because recomputing a rolling window
later would not reproduce the evidence on which the signal was created.
The Author reviewer projection validates these stored summaries against the
policy version and then strips detector thresholds, exposing only the window,
aggregate counts, and observed concentration ratio.

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
player UUID, so later account deletion can retain a profile-free actor key
without copying Auth0 identity into the trust schema.

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

## Completed-match history evaluation

Opponent concentration and one-sided outcomes use one completed-history SQL
statement for each eligible match. It returns both the 30-day participant/pair
totals and the 7-day qualifying-forfeit counts, using strict lower and inclusive
upper bounds at that match's completion time. Async and Live identities remain
separate, and each rule retains its completion-reason eligibility and thresholds.

Both aggregates therefore observe one coherent PostgreSQL statement snapshot.
A completion or historical backfill committed after that snapshot is eligible
for a subsequent evaluation; it cannot enter only the second rule halfway
through the current evaluation. Score calculation still uses current database
time, independently of the history cutoff. Per-match transactions, player
advisory locks, case row locks, immutable signals/evidence and conflict handling
are unchanged. The maintenance batch still acquires separate clients for its
selection, each candidate and each match, and processes them sequentially.

This removes one client SQL round trip when both history rules are reached; it
does not establish a production latency improvement. Verification includes old
query parity, cutoff/mode fixtures, concurrent history visibility, replay and
statement counts in `trust-history.integration.test.ts` and
`trust-history.test.ts`.

## Retention

Migration `0046` provides `private.purge_expired_trust_data(as_of)` as an
idempotent cleanup primitive. The issue #258 API maintenance scheduler invokes
it once at startup and on the configured `TRUST_EVALUATION_INTERVAL_MS` cadence
using authoritative database time. Overlapping runs are suppressed per API
process; concurrent instances remain safe because the purge is retry-safe.

- derived signals expire 90 days after `observed_at`;
- score snapshots expire 12 months after `evaluated_at`;
- closed case governance is retained until 12 months after
  `governance_finalized_at`;
- open cases remain until resolution; after account deletion, unfinished cases
  retained for audit expire 90 days after deletion completion.

A case may be resolved before its appeal lifecycle is fully finished. For that
reason `governance_finalized_at`, not `resolved_at`, is the retention anchor for
the case/evidence/decision/restriction/appeal graph.

## Account deletion

When an active player enters `deletion_pending`, an `AFTER` lifecycle trigger in
the same transaction removes active trust signals but preserves open and
under-review cases. At completion, an unfinished case receives a 90-day
deletion-specific retention cutoff. Evidence, decisions, appeals, and
restrictions remain as audit history against a fresh opaque actor key. Retained
restrictions have no active capability effect without an active player account.
Free-form appeal text and reviewer reason notes are redacted at completion;
structured review metadata remains until the case expires.

Account-deletion completion removes the player row. A later registration gets a new local UUID,
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

No persistent reviewer-lock lease is added by `#257`. Runtime scoring uses a
per-player PostgreSQL advisory transaction lock, while reviewer mutations remain
row/version controlled; `under_review` is the durable case lifecycle state and
is deliberately excluded from automated decay resolution.

## Issue #258 runtime and schema hardening

Migration `0048_implement_trust_scoring_and_enforcement.sql` is forward-only and
does not rewrite migration `0046`. It makes
`trust_case_decisions.resulting_score_snapshot_id` explicitly `NOT NULL` to
match the existing decision trigger, adds an audit-oriented
`trust_appeal_resolutions(reviewer_player_id, resolved_at, appeal_id)` index,
adds the signal-adjustment lookup index used by score evaluation, documents
the four trust relations that previously lacked table comments, and adds a
nullable SHA-256 privacy-limited canonical digest to newly synced offline attempts
so an identical replay can be distinguished from conflicting reuse of the same
client attempt identifier. The digest includes the random pack identifier, timing,
and answer identifiers but deliberately excludes precise location values; trust
storage still retains no submitted answers or location payloads. Historical attempts remain null for compatibility.

The API derives `impossible_movement` only from a committed authoritative
`too_fast` movement decision. Conflicting reuse of an idempotency/message
identifier at supported mutation boundaries records one deduplicated
`idempotency_payload_conflict`; three distinct conflicts in the rolling window
may derive the bounded pattern signal. Completed asynchronous and live PvP completion paths attempt reciprocal
opponent-pattern derivation after commit; a rotating
maintenance sweep retries recent completed PvP history and recalculates active
players as signals decay.

Score snapshots are appended only when the persisted projection/digest changes.
The current case projection is updated in the same transaction with one matching
append-only system decision. Existing human-resolved cases remain terminal; the
same historical evidence cannot immediately recreate them, while a signal
recorded after resolution may create a new case.

Restrictions are not score outputs. `private.trust_restrictions` remains
human-authored governance, and runtime checks read only the effective scope and
expiry after any appeal resolution. No player response exposes the stored score
or evidence behind that decision.

## Issue #260 reviewer API

Issue `#260` reuses the private relations and integrity triggers above through a
protected Author-only service, with migration
`0061_persist_trust_review_evidence_summaries.sql` preserving only the safe
aggregate basis required for opponent-pattern human review:

- `GET /api/v1/author/trust-cases` defaults to active cases and provides a
  bounded, deterministic queue with lifecycle (including `status=all`), safe
  Player Name substring and exact case/player UUID search,
  review-band, active-restriction, signal-type, and date filters;
- `GET /api/v1/author/trust-cases/:caseId` returns the current versioned case,
  category totals, ten-item evidence/restriction previews with total counts,
  and the most recent audit transitions;
- `GET /api/v1/author/trust-cases/:caseId/evidence` and `/restrictions` provide
  the complete safe collections through deterministic bounded pagination;
- `GET /api/v1/author/trust-cases/:caseId/history` provides the complete
  append-only decision history with bounded pagination; and
- `POST /api/v1/author/trust-cases/:caseId/decisions` records a reasoned
  `continue_monitoring`, `dismiss`, `mark_false_positive`, or `restrict`
  decision;
- `GET /api/v1/author/trust-cases/:caseId/export` returns a server-defined JSON
  export bounded to 100 records per evidence/restriction/history collection.

Queue and detail expose canonical `score`, `band`, `restrictionCount`,
`activeRestrictionCount`, `latestRestrictionExpiry`, and `canReview` fields.
Detail also carries the current persisted `scoreExplanation` and bounded
`evidence` and `history` aliases used by the Author console; preview counts and
the pageable child routes remain authoritative when either alias is truncated.
New opponent-pattern signals must carry a validated safe summary. A legacy
opponent-pattern row without one is returned with `availability=unavailable`
and blocks decisions only while it contributes effective points and has no
false-positive adjustment. A later explained evaluation supersedes the gap only
while it also contributes and remains unadjusted. The immutable legacy row is
not rewritten and no historical aggregates are fabricated.

The authenticated local Author UUID is always the actor; no reviewer identity
is accepted from the request body. An Author's own case is excluded from the
queue and returns the same not-found response as any inaccessible case. A
reviewer mutation takes the existing per-player advisory transaction lock,
locks and validates the target player row before the case row, and compares the
required `expectedVersion`. This matches account-lifecycle lock ordering. A
stale decision returns an explicit conflict and cannot append a decision or
restriction.

Reviewer transitions follow `open -> under_review -> resolved`. Continuing
monitoring, marking selected evidence false-positive, or restricting may start
review; dismissal requires an `under_review` case. The direct
`open -> resolved` decay path remains system
owned. The decision transaction advances the case projection, appends the
Author decision, links at most 100 distinct safe evidence summaries, records
false-positive adjustments only for the selected `mark_false_positive`
evidence, and creates supported restrictions together. A
failure rolls all of those writes back. Audit history distinguishes the full
evidence set from the false-positive subset and returns each restriction's
original committed start and expiry.

The writable scopes are `online_verification_required`,
`location_reward_challenge_hold`, and `new_competitive_match_hold`; durations
remain whole hours from 1 through 168 and the database seven-day constraint
remains authoritative. The decision request names that value `durationHours`.
Read projections retain the schema-level
`card_trade_hold`, but this API cannot author it.

The API projections intentionally omit provider identifiers, raw source
identifiers and digests, precise coordinates, exact speed/distance/accuracy,
submitted answers, private match state, and arbitrary source payloads. Export
uses the same object-level authorization and privacy projections rather than
reading arbitrary client-selected private-table columns.

## AI declaration

This persistence design and implementation guide was generated, edited, and
reviewed with the assistance of ChatGPT-Web[GPT-5.6 Sol] and Codex[GPT-5].

This account-deletion update was edited with assistance from Codex[GPT-6].

The completed-history evaluation section was edited with assistance from
Codex[GPT-6].

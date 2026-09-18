---
title: 'Longitudinal trust and proportionate enforcement'
---

# Longitudinal trust and proportionate enforcement

## Status and purpose

This document is the issue `#254` policy contract for Advanced-tier trust
scoring and proportionate enforcement. Issue `#257` implements persistence for
derived signals, score snapshots, cases, restrictions, appeals, and decisions
through migration `0046_persist_longitudinal_trust.sql`. Issue `#258` remains
responsible for scoring and server-side enforcement, and later issues will
expose the reviewer and player experiences. Persistence alone does not mean
that scoring, enforcement, review APIs, or player notices are deployed.

The policy builds an explainable picture from weak indicators over time. A
signal means that authoritative application data matched a review condition; it
does not prove cheating or intent. The score prioritises human review and never
changes gameplay by itself. No single signal, score, or automated process may
suspend an account or permanently ban a player.

## Authority and terminology

The API and PostgreSQL derive every signal from authoritative operations. The
browser cannot submit a signal, score, severity, case, restriction, reviewer
decision, or enforcement result.

This policy uses a **risk score** from `0` through `100`, where a higher value
means that the account should receive earlier human review. It is not a
probability, guilt percentage, public reputation, or player ranking. The score
and detector thresholds are not exposed to players or other players.

The initial immutable policy version is `trust-v1`. Every signal, score
snapshot, case transition, reviewer decision, restriction, and appeal records
the policy version that produced it. A later policy version does not rewrite
historical evidence or decisions.

## Derived signal contract

Each immutable derived signal contains only:

- a random signal identifier;
- the server-resolved local player identifier;
- one closed signal type and severity;
- base points under the recorded policy version;
- server-observed time and expiry time;
- an opaque source type, source identifier, and deduplication key; and
- creation metadata needed for audit and concurrency control.

The source identifier proves which authoritative operation produced the signal
without copying its sensitive payload. Trust records never contain precise
coordinates, exact journey distance or speed, reported accuracy, submitted
answers, bearer tokens, access-token claims, hidden cards, or complete match
state.

### Impossible-movement signals

Only an authoritative movement-eligibility decision with outcome `too_fast`
may create an impossible-movement signal. Baseline, same-event, plausible,
unreachable, accuracy-retry, malformed, stale, and unauthenticated requests do
not create one.

The existing journey calculation remains authoritative and accounts for both
reported accuracy radii and server receipt time. At the moment the `too_fast`
decision commits, the signal service compares its already-derived required
speed with the configured maximum-speed snapshot:

| Condition                                     | Severity   | Base points |
| --------------------------------------------- | ---------- | ----------- |
| More than `1x` and at most `2x` the threshold | `moderate` | 15          |
| More than `2x` the threshold                  | `strong`   | 25          |

The signal retains the severity band but not either speed value, coordinates,
distance, accuracy, prior event, current event, or path. It is deduplicated by
the immutable movement-decision source identifier. Online and accepted offline
eligibility paths use the same rule.

Precise movement evidence and its journey decision retain their existing
short-lived expiry and account-deletion cascade. Deleting those rows does not
erase the separate non-precise signal before its own expiry.

### Submission-conflict signals

Normal distributed-system retries must not look like cheating. These events
produce no signal:

- an identical idempotency identifier and canonical payload replay;
- a retry after a response was lost;
- an ordinary duplicate read;
- a stale expected version;
- a completed-resource response;
- a rate-limit response; or
- a malformed request rejected before an authoritative operation can resolve
  the player and submission context.

Reusing one submission or message identifier for a different canonical payload
at an authoritative mutation boundary creates one
`idempotency_payload_conflict` signal worth 10 points. The signal is
deduplicated by actor, operation, resource, and conflicting submission
identifier, so repeated delivery of the same conflict cannot inflate the
score.

Three or more distinct payload-conflict signals within a rolling 24-hour period
create one additional `submission_conflict_pattern` signal worth 10 points.
Only one pattern signal may exist for the player and UTC 24-hour evaluation
bucket under one policy version. Conflicts already counted in one pattern do
not create another pattern signal in the same bucket.

Repeated wrong answers, low quiz scores, legal rapid play, choosing the same
move, losing matches, or ordinary user mistakes are not submission-conflict
signals.

### Repeated-opponent and collusion-review signals

Repeated opponents are a weak social indicator and never prove collusion.
Only completed player-versus-player matches are considered; CPU matches,
cancelled invitations, declined invitations, expired invitations, and
unstarted matches are excluded.

A reciprocal `opponent_concentration` signal worth 20 points is created for
both players only when, in the same rolling 30-day evaluation window:

- each player has at least six completed PvP matches; and
- matches between the pair represent at least 80% of each player's completed
  PvP matches.

A further `one_sided_outcome_pattern` signal worth 10 points is created for
both players when at least four matches in a rolling seven-day window end with
the same player winning through voluntary resignation, turn-timeout forfeit, or
live abandonment forfeit. Account-deletion forfeits and ordinary defeats are
excluded from this pattern.

Each signal is deduplicated by signal type, both canonical player identifiers,
policy version, and UTC calendar week. The weekly key permits a continuing
pattern to remain reviewable while the category cap prevents weekly evaluation
from producing an unbounded score. Reviewers must consider legitimate friends,
classmates, demonstrations, and a small current PvP population before taking
action.

## Versioned score calculation

Signals decay linearly to zero over 90 days. `trust-v1` defines:

```text
decay seconds = 90 * 24 * 60 * 60 = 7,776,000
age seconds = max(0, database evaluation time - observed time)
remaining seconds = max(0, decay seconds - age seconds)
effective signal points = floor(base points * remaining seconds / decay seconds)
```

The calculation uses authoritative PostgreSQL time. Its inputs are the player,
evaluation timestamp, active immutable signals, reviewed signal adjustments,
and policy version. Given those same inputs, every implementation must produce
the same result.

After decay, sum each category and apply these caps:

| Category               | Maximum contribution |
| ---------------------- | -------------------- |
| Impossible movement    | 50                   |
| Submission conflicts   | 30                   |
| Opponent concentration | 30                   |

The final score is the sum of capped category totals, clamped from `0` through
`100`. A reviewed false-positive adjustment contributes zero from its effective
time onward but does not delete or rewrite the original signal.

Each score snapshot records the evaluation time, policy version, category
totals, final score, review band, and source-signal set or stable calculation
digest. It does not duplicate sensitive source payloads.

## Review bands and case lifecycle

| Score    | Band              | System response                              |
| -------- | ----------------- | -------------------------------------------- |
| `0–24`   | `normal`          | Retain active signals; open no case          |
| `25–49`  | `observe`         | Open or update a low-priority review case    |
| `50–74`  | `review_required` | Prioritise the case for human review         |
| `75–100` | `urgent_review`   | Place the case at the urgent review priority |

Crossing a band creates or updates a case and append-only audit entry. It does
not automatically restrict challenges, rewards, matches, account access, or
any other feature, even at a score of `100`.

A case has one of these states:

```text
open -> under_review -> resolved
open -> resolved as decayed
```

Only one non-terminal case may exist for a player. New evidence updates its
latest score and priority without deleting prior snapshots. A case that remains
below 25 for seven continuous days may resolve as `decayed` through an
append-only system decision only when it has no active restriction, reviewer
lock, or unfinished case-review work. Later evidence may create a new case.

Appeals are a lifecycle of the challenged restriction decision, not case
states. A restriction decision moves from appeal `eligible` to `submitted` and
then `resolved`, or becomes `ineligible` when its 30-day post-expiry window
ends without a submission. A case may therefore resolve while an unused appeal
window remains or while a submitted appeal is awaiting resolution. A late
appeal does not reopen the historical case, create another non-terminal case,
or rewrite its score snapshots.

An appeal resolution appends to the challenged decision. Any resulting
false-positive adjustments take effect at the appeal-resolution time and cause
a new current score calculation under the normal policy. If the player has a
newer non-terminal case, that case receives the new snapshot; the resolved
historical case remains terminal. A case with an active restriction remains
`under_review` until the restriction expires or is overturned and its remaining
case-review work is resolved.

## Author review boundary

The existing `author` application role is the trust-review role for this
delivery. No new Administrator role is introduced. Ordinary players cannot
access another player's signals, score, case, notes, restrictions, or appeal.

An Author case view may contain:

- the current Player Name and local opaque player identifier;
- current score, band, policy version, and category totals;
- signal type, severity, points, observed time, decay state, and safe source
  category;
- prior case transitions, reviewer decisions, restrictions, and appeals; and
- safe aggregate PvP counts needed to assess an opponent pattern.

It must not contain Auth0 issuer/subject, email, precise location, exact speed,
distance, accuracy, submitted answers, access tokens, hidden cards, another
player's private history, or raw application logs.

Every reviewer mutation includes an expected case version and runs under an
authoritative lock. A decision records the local Author, timestamp, policy
version, previous and resulting case states, bounded reason, affected signals,
restriction scopes and duration, and resulting score snapshot. Decisions are
append-only. Concurrent stale decisions fail rather than overwrite one
another.

An Author cannot review, restrict, dismiss, adjust a signal for, or resolve an
appeal concerning their own player account. A server-side object-authorisation
check enforces this independently from the UI.

## Proportionate human decisions

Reviewers may:

- dismiss a case with no restriction;
- mark one or more signals as reviewed false positives without deleting them;
- continue monitoring with no player-visible restriction;
- require online verification for new location-based challenge activity;
- prevent the player from starting new reward-bearing location challenges; or
- prevent the player from creating, accepting, queueing for, or joining new
  competitive PvP matches.

One decision may combine the three restriction scopes. Every restriction:

- begins at the committed reviewer-decision time;
- lasts no longer than seven days;
- expires automatically against authoritative database time;
- requires a new reasoned decision to renew;
- is checked at the affected server-side operation rather than only hidden in
  the UI; and
- returns a neutral, non-accusatory player response.

`online_verification_required` prevents issuing new offline challenge packs and
requires the normal fresh online location-eligibility path for a newly started
location challenge. `location_reward_challenge_hold` prevents starting a new
reward-bearing location challenge. `new_competitive_match_hold` prevents new
PvP invitations, invitation acceptance, live queue entry, and live match join.

Restrictions never:

- block sign-in, account deletion, map/event browsing, collection, deck
  management, CPU play, case notice, or appeal access;
- cancel an attempt or match that authoritatively started before the
  restriction committed;
- forfeit an active match;
- remove cards, points, achievements, ratings, or already committed rewards;
- rewrite completed attempts or matches; or
- suspend or permanently ban an account.

An offline pack or match already authoritatively created before the restriction
commits may complete under its original contract. This avoids retroactive
punishment and keeps concurrency outcomes deterministic.

## Player notice and appeal

A restricted player receives a safe notice containing:

- the affected capability;
- restriction start and expiry times;
- a neutral reason category such as `activity_review`;
- appeal availability and status; and
- a request identifier.

The notice does not expose the risk score, thresholds, weights, detector
details, another player's identity, source identifiers, reviewer notes, or raw
evidence.

Each restriction decision permits one appeal while the restriction is active
or within 30 days after it expires. Appeal text is bounded to 1,000 characters
and instructs the player not to include passwords, tokens, or precise location.
Submitting an appeal does not automatically pause the restriction.

The Author who made the challenged decision cannot resolve its appeal. A
different Author resolves it as:

- `upheld`, leaving the original expiry unchanged;
- `shortened`, committing an earlier expiry; or
- `overturned`, ending active scopes immediately and recording any reviewed
  false-positive adjustments.

Appeal resolution never deletes the original decision or evidence summary.

## Privacy, retention, and account deletion

Trust storage uses the minimum information required for scoring, review,
deduplication, and audit:

| Record                                                                 | Retention                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------- |
| Precise movement evidence and journey decisions                        | Existing provisional 24-hour boundary and cleanup |
| Derived trust signals                                                  | 90 days from observed time                        |
| Score snapshots                                                        | 12 months from calculation                        |
| Closed cases, evidence summaries, decisions, restrictions, and appeals | 12 months after final resolution                  |
| Open cases and active restrictions                                     | Until resolved or account deletion                |

When a signal expires, a case already opened from it retains only the immutable
non-sensitive evidence summary required to explain a decision. It does not
extend the source system's raw-data retention.

When account deletion enters `deletion_pending`, active signals, open cases,
active restrictions, and unresolved appeals are deleted in the same local
cleanup transaction. Closed governance records may remain anonymously for the
remainder of their 12-month retention, with Player Name and identity links
removed. The existing Author tombstone preserves reviewer accountability
without retaining Auth0 identity or email. A deleted player cannot be denied
future re-registration because of an old trust score or restriction.

Trust logs contain only safe case or signal identifiers, policy version, review
band, restriction scope, expiry, transition result, and aggregate counts. They
exclude score inputs, precise movement, player names where unnecessary,
opponent identities, appeal text, and reviewer notes.

## Deterministic examples

### Harmless retry

An action is replayed with the same submission identifier and canonical payload
after its first response is lost. The service returns the stored result. No
signal or score change occurs.

### Payload conflicts

A player reuses three different submission identifiers with conflicting
payloads in one 24-hour bucket. The three source conflicts contribute 30 base
points, capped at the submission category maximum of 30. One additional
10-point pattern signal is recorded but cannot increase that capped category.
The score reaches `observe`; no gameplay restriction occurs automatically.

### Movement decay

A strong impossible-movement signal starts at 25 points and opens an `observe`
case. After 45 complete days its effective value is 12 points under the fixed
floor calculation. With no other evidence, the score returns to `normal`. The
case may resolve as `decayed` after remaining below 25 for seven days.

### Combined review priority

Two current strong impossible-movement signals contribute the movement cap of 50. A current reciprocal opponent-concentration signal contributes 20. The
score is 70 and the case is `review_required`. An Author must still review the
derived evidence before any restriction is applied.

### Score of 100

Capped movement, submission, and opponent contributions total more than 100.
The final score is 100 and the case becomes `urgent_review`. Sign-in and
gameplay remain unchanged until an Author commits a permitted decision.

## Implementation and verification requirements

Issues `#257` and `#258` must turn this policy into focused database and service
tests covering:

- unique source and pattern deduplication under concurrent ingestion;
- identical retries versus conflicting payloads;
- movement severity derivation without retaining precise values;
- exact 90-day fixed-point decay and category caps;
- all review-band boundaries;
- reciprocal opponent thresholds and excluded match outcomes;
- deterministic score snapshots by policy version and evaluation time;
- no automatic restrictions at every score;
- stale reviewer decisions and self-review rejection;
- seven-day restriction bounds, expiry, renewal, and server-side enforcement;
- pre-existing attempts and matches surviving a later restriction;
- one appeal per decision and different-Author resolution;
- a post-expiry appeal submitted after its related case has resolved, without
  reopening that case or creating a second non-terminal case;
- raw movement expiry without loss of non-sensitive case explanation; and
- account deletion, anonymisation, and retention expiry.

For issue `#254`, formatting and the documentation build are the meaningful
automated checks. It does not add implementation-mirroring production tests.

## AI declaration

This policy was planned, generated, edited, and reviewed with the assistance of
Codex[GPT-5.6 Sol] and ChatGPT-Web[GPT-5.6 Sol].

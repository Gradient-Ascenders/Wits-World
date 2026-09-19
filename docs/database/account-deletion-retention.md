---
title: 'Account deletion and retained data'
---

# Account deletion and retained data

Issue `#160` completes the database and API lifecycle behind permanent account
deletion. Issue `#161` adds the player-facing profile, provider-owned password
recovery, recent-authentication, confirmation, and retry/completion experience.
This document remains authoritative for the deletion and retention boundary;
the [player account lifecycle validation](../testing/player-account-lifecycle-validation.md)
records the browser boundary and remaining external checks.

## Authority and external boundary

The API accepts deletion only after the existing coordinator validates the
authenticated identity, recent Auth0 reauthentication, and exact permanent
confirmation. It then:

1. creates or resumes a random `account_deletion_requests` record and moves the
   player to `deletion_pending`;
2. deletes the Auth0 user through the server-only Management API client;
3. runs all local deletion, anonymisation, and retained-history updates in one
   PostgreSQL transaction; and
4. records a short-lived, one-way denial marker for access tokens issued before
   completion; and
5. marks the minimal audit record `completed` only when that transaction commits.

Auth0 and PostgreSQL cannot share one transaction. A provider or database
failure therefore leaves the player locked and records only
`auth0_deletion_failed` or `local_cleanup_failed` for automatic retry. An Auth0
`404` is treated as idempotent success because the intended external state has
already been reached.

## Deleted and retained records

| Data                                                                                                                    | Deletion result                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth0 issuer/subject, Player Name, and role                                                                             | Cleared from the local player tombstone                                                                                                                                                 |
| Owned cards and starter selection                                                                                       | Deleted                                                                                                                                                                                 |
| Saved decks, deck membership, and active selection                                                                      | Deleted                                                                                                                                                                                 |
| Retired legacy wallet                                                                                                   | Deleted                                                                                                                                                                                 |
| Individual MCQ/ordering answers and format-specific snapshots                                                           | Deleted                                                                                                                                                                                 |
| In-progress challenge attempts                                                                                          | Deleted                                                                                                                                                                                 |
| Active CPU matches, rounds, actions, and card snapshots                                                                 | Deleted                                                                                                                                                                                 |
| Pending asynchronous PvP invitations                                                                                    | Expired when overdue; otherwise terminally invalidated as deletion begins                                                                                                               |
| Active asynchronous PvP matches                                                                                         | Retained as completed; deleting player loses by `account_deletion_forfeit` unless an elapsed deadline already makes the current actor lose by `turn_forfeit`                            |
| Active live PvP matches                                                                                                 | Must be finalized before `deletion_pending`; the live runtime must resolve an elapsed one-minute deadline first, otherwise the deleting participant loses by `account_deletion_forfeit` |
| Precise movement evidence and journey-decision audit                                                                    | Deleted transactionally when the account enters `deletion_pending`; never retained                                                                                                      |
| Active trust signals, non-terminal cases, unfinished resolved trust governance, active restrictions, unresolved appeals | Deleted transactionally when the account enters `deletion_pending`; finalized closed governance and score snapshots may remain anonymously for their documented retention               |
| Closed trust cases and reviewer-decision audit                                                                          | Retained anonymously for at most 12 months after final resolution, without Player Name, provider identity, precise location, or raw source payload                                      |
| Completed challenge attempt summary                                                                                     | Retained against the anonymised player UUID                                                                                                                                             |
| Event completion, score, legacy coin outcome, and coin ledger                                                           | Retained against the anonymised player UUID                                                                                                                                             |
| Awarded-card outcome                                                                                                    | Retained in `event_completion_card_rewards`; owned `player_cards` rows are still deleted                                                                                                |
| Card-evolution outcome and consumed-copy snapshots                                                                      | Retained against the anonymised player UUID; the evolved owned `player_cards` grant is deleted                                                                                          |
| Completed CPU matches, rounds, actions, and card snapshots                                                              | Retained against the anonymised player UUID                                                                                                                                             |
| Completed asynchronous PvP matches and private snapshots                                                                | Retained against anonymous tombstones; opponent displays `Deleted player`                                                                                                               |
| Completed live PvP matches, snapshots, and transition history                                                           | Retained against anonymous tombstones; transient ticket digests and connection-access rows for the deleting player are removed as deletion begins                                       |
| Point awards, activity days, streak totals, and achievements                                                            | Retained privately against the anonymised player UUID; excluded from live standings                                                                                                     |
| Published events, questions, challenges, and cards                                                                      | Retained unchanged as system-owned content definitions                                                                                                                                  |
| Author activity audit                                                                                                   | Retained against the anonymised player tombstone                                                                                                                                        |
| Deleted-identity access denial                                                                                          | Salted digest retained privately for at most 30 days; no raw identity or token is stored                                                                                                |

Content definitions do not store a mutable Author owner, so no ownership row
needs reassignment. Their immutable `author_content_audit` actor reference keeps
pointing at the now anonymous tombstone. A presentation that exposes an absent
author name must render `Deleted author`; it must not reconstruct identity.

Migration `0024_complete_account_deletion_retention.sql` introduces
`event_completion_card_rewards`. The table separates a historical reward
outcome from current ownership, allowing `player_cards` to be deleted without
erasing aggregate completion evidence. The migration backfills existing event
reward ownership before the API begins writing the retained record alongside
each new card award.

Migration `0031_create_movement_evidence.sql` adds a player-lifecycle trigger
that removes short-lived precise movement evidence as soon as deletion becomes
pending. Migration `0032_add_movement_eligibility_decisions.sql` attaches the
immutable journey audit to its current evidence with `ON DELETE CASCADE`, so
the same operation also removes derived distance, elapsed-time, and speed data.
No path, coordinate, or journey decision remains attached to the anonymous
tombstone.

The Advanced longitudinal-trust policy does not extend precise movement
retention. Its non-precise signals expire after 90 days. Account deletion
removes active signals, open cases, unfinished resolved governance,
restrictions, and unresolved appeals. Finalized closed case and
reviewer-decision records may remain against an anonymous governance tombstone
for no more than 12 months after final resolution; they
retain only policy version, derived evidence summaries, decision scope,
timestamps, and reviewer accountability. A completed deletion clears every
active trust outcome so a later clean re-registration cannot inherit a score,
case, or restriction. See the
[longitudinal trust policy](../requirements/longitudinal-trust-policy.md).

Migration `0033_add_async_pvp_invitation_invalidation.sql` adds the distinct
terminal `invalidated` invitation state. Deletion-request creation locks and
finalizes affected invitations and active PvP matches before changing the
player to `deletion_pending`, in the same PostgreSQL transaction. A failure in
forfeit progression or invitation finalization rolls back the deletion request.
An already-elapsed decision deadline takes precedence over account deletion, so
the current actor remains the forfeiter even when the opponent begins deletion.

Migration `0046_persist_longitudinal_trust.sql` adds the trust-governance
privacy boundary. Entering `deletion_pending` removes active signals,
non-terminal cases, and resolved cases whose governance/appeal lifecycle was
not finalized in the same player-lifecycle transaction. It also removes active
restrictions and unresolved appeals that would otherwise continue to affect the
account, and preserves only finalized anonymous closed governance/score history
until its retention boundary. A future registration receives a new local UUID
and therefore cannot inherit the deleted account's trust state.

Migration `0044_create_live_pvp_persistence.sql` adds the corresponding durable
boundary for live PvP. A player-lifecycle guard refuses the transition to
`deletion_pending` while that player still belongs to an active live match. As
part of the same lifecycle update it deletes that player's transient live
connection-access rows and ticket digests; completed match state, immutable deck
snapshots, spectator-safe actions, private transitions, idempotency receipts,
and terminal completion sources remain attached to the anonymised tombstone.
The migration intentionally does not implement the live gateway's deletion
finalizer. The issue `#253` runtime must use the existing
`finalizeDependentGameplay` hook, lock each affected live match, sample
PostgreSQL time after that lock, resolve an already-elapsed decision first, and
otherwise persist `account_deletion_forfeit` before the lifecycle update can
succeed.

Migration `0034_retire_coin_rewards.sql` prevents new wallet and coin-ledger
activity but deliberately permits deletion of a retained wallet through this
cleanup transaction. Historical ledger rows and non-zero completion outcomes
remain immutable against the anonymised tombstone; they are not recalculated as
progression points.

Migration `0042_implement_card_evolution.sql` retains immutable evolution
receipts and the three consumed-copy snapshots as gameplay audit attached to the
anonymous player tombstone. The cleanup routine still deletes all live owned
cards, including the evolved grant. The retained rows contain random ownership
identifiers and card-definition provenance, not Auth0 identity, Player Name, or
location data, and therefore do not prevent local account cleanup.

The planned [card-trading policy](../requirements/card-trading-policy.md)
requires account deletion to invalidate open offers and release their exact-copy
reservations before deleting owned cards. Minimal completed trade receipts will
remain against anonymised tombstones for copy provenance, while former Player
Names and authentication proof are not retained. Trading and this deletion
integration are not yet implemented; #275 and #272 must add them before trading
is enabled.

## Transaction and concurrency rules

`AccountDeletionLifecycle.complete()` locks the deletion request and linked
player before invoking `private.delete_player_owned_data(...)`. The function
validates that the same player is still `deletion_pending`, removes dependent
rows in foreign-key order, and leaves completed summaries untouched. Identity
anonymisation, the temporary token-denial marker, and audit completion occur in
that same transaction. Any failure rolls every local change back. The identity
resolver checks the marker in the same SQL statement that would otherwise
provision a player, so it cannot recreate the account between the denial
decision and insertion.

Two workers processing one request serialize on the deletion-request lock. The
first successful worker commits the tombstone and completed audit; later calls
return that persisted completion without repeating cleanup. A retry after a
local rollback executes the same transaction again.

Submitted answers and finalized snapshots remain immutable during ordinary
application work. Migration `0024` permits `DELETE` only while their owning
player is deletion-pending; it does not permit edits or deletion for an active
player. Completed attempt summaries remain immutable. The migration also fixes
the prior active-attempt guard to compare PostgreSQL's uppercase `TG_OP`, so
in-progress attempts can actually be removed while completed attempts remain
protected. Migration `0025` extends the same deletion-scoped behavior and
foreign-key-ordered cleanup to ordering answer items, ordering answers, and
ordering item snapshots while preserving format-aware snapshot validation.

## Audit expiry and re-registration

The completed deletion audit remains unchanged: it contains only its random ID,
request/completion timestamps, status, and safe failure reason. Records at
least twelve months old are purged. It contains no Auth0 subject, Player Name,
email, location, or player foreign key.

Migration `0035_deny_deleted_identity_tokens.sql` adds a separate private
security marker. Completion stores a SHA-256 digest of the issuer/subject pair
with a fresh random 32-byte salt, the completion cutoff, and a 30-day expiry.
It never stores the raw issuer, subject, access token, token signature, Player
Name, or email. The 30-day bound covers
[Auth0's maximum configurable JWT access-token lifetime](https://auth0.com/docs/secure/tokens/access-tokens/update-access-token-lifetime);
expired markers are ignored immediately and are eligible for purge by the
deletion retry sweep.

An access token issued at or before the completion cutoff is rejected with
`ACCOUNT_UNAVAILABLE`, even if its JWT expiry has not yet elapsed. A token
issued after completion is not denied by the old marker. This preserves clean
re-registration with a genuinely new Auth0 session while preventing an old
self-contained JWT from silently provisioning a replacement local player.

Clearing the unique Auth0 `(issuer, subject)` pair and Player Name allows the
same person to register later as a new local player. The new UUID has no link to
the deleted player's cards, balance, decks, attempts, matches, or retained
progression. Progression remains attached only to the old anonymous tombstone.

## Verification

`apps/api/tests/account-deletion-persistence.integration.test.ts` covers a
clean migration, current-schema reward backfill, ordinary snapshot
immutability, complete cleanup and anonymous retention, transaction rollback,
retry, concurrent completion, tombstones, fresh re-registration, denial of the
same unexpired access token without reprovisioning, and cleanup of an
in-progress ordering attempt. Existing Auth0 Management API tests cover an
already-absent provider account, while player database tests cover the minimal
audit shape and twelve-month purge.

The preceding document was generated and edited with the assistance of:
Codex-CLI[gpt-5.6-sol medium], Codex-CLI[GPT-5], Codex[GPT-5], and
ChatGPT-Web[GPT-5.6 Sol] and Codex[GPT-5.6 Sol].

Page title clarified with assistance from Codex-CLI[GPT-6].

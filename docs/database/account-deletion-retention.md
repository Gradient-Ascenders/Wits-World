# Account deletion persistence and retention

Issue `#160` completes the database and API lifecycle behind permanent account
deletion. The player-facing profile, password-reset, and deletion experience is
tracked separately by `#161`; this document does not claim that UI is complete.

## Authority and external boundary

The API accepts deletion only after the existing coordinator validates the
authenticated identity, recent Auth0 reauthentication, and exact permanent
confirmation. It then:

1. creates or resumes a random `account_deletion_requests` record and moves the
   player to `deletion_pending`;
2. deletes the Auth0 user through the server-only Management API client;
3. runs all local deletion, anonymisation, and retained-history updates in one
   PostgreSQL transaction; and
4. marks the minimal audit record `completed` only when that transaction commits.

Auth0 and PostgreSQL cannot share one transaction. A provider or database
failure therefore leaves the player locked and records only
`auth0_deletion_failed` or `local_cleanup_failed` for automatic retry. An Auth0
`404` is treated as idempotent success because the intended external state has
already been reached.

## Deleted and retained records

| Data                                                          | Deletion result                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Auth0 issuer/subject, Player Name, and role                   | Cleared from the local player tombstone                                                  |
| Owned cards and starter selection                             | Deleted                                                                                  |
| Saved decks, deck membership, and active selection            | Deleted                                                                                  |
| Wallet balance                                                | Deleted                                                                                  |
| Individual MCQ/ordering answers and format-specific snapshots | Deleted                                                                                  |
| In-progress challenge attempts                                | Deleted                                                                                  |
| Active CPU matches, rounds, actions, and card snapshots       | Deleted                                                                                  |
| Precise movement evidence                                     | Deleted transactionally when the account enters `deletion_pending`; never retained       |
| Completed challenge attempt summary                           | Retained against the anonymised player UUID                                              |
| Event completion, score, coin outcome, and coin ledger        | Retained against the anonymised player UUID                                              |
| Awarded-card outcome                                          | Retained in `event_completion_card_rewards`; owned `player_cards` rows are still deleted |
| Completed CPU matches, rounds, actions, and card snapshots    | Retained against the anonymised player UUID                                              |
| Point awards, activity days, streak totals, and achievements  | Retained privately against the anonymised player UUID; excluded from live standings      |
| Published events, questions, challenges, and cards            | Retained unchanged as system-owned content definitions                                   |
| Author activity audit                                         | Retained against the anonymised player tombstone                                         |

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
pending. It creates no derived movement record and therefore leaves no path or
coordinate attached to the anonymous tombstone.

## Transaction and concurrency rules

`AccountDeletionLifecycle.complete()` locks the deletion request and linked
player before invoking `private.delete_player_owned_data(...)`. The function
validates that the same player is still `deletion_pending`, removes dependent
rows in foreign-key order, and leaves completed summaries untouched. Identity
anonymisation and audit completion occur in that same transaction. Any failure
rolls every local change back.

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

The completed deletion audit contains only its random ID, request/completion
timestamps, status, and safe failure reason. Records at least twelve months old
are purged. It contains no Auth0 subject, Player Name, email, location, or
player foreign key.

Clearing the unique Auth0 `(issuer, subject)` pair and Player Name allows the
same person to register later as a new local player. The new UUID has no link to
the deleted player's cards, balance, decks, attempts, matches, or retained
progression. Progression remains attached only to the old anonymous tombstone.

## Verification

`apps/api/tests/account-deletion-persistence.integration.test.ts` covers a
clean migration, current-schema reward backfill, ordinary snapshot
immutability, complete cleanup and anonymous retention, transaction rollback,
retry, concurrent completion, tombstones, fresh re-registration, and cleanup of
an in-progress ordering attempt. Existing Auth0 Management API tests cover an
already-absent provider account, while player database tests cover the minimal
audit shape and twelve-month purge.

The preceding document was generated and edited with the assistance of:
Codex-CLI[gpt-5.6-sol medium] and Codex[GPT-5].

---
title: 'Account deletion and retained data'
---

# Account deletion and retained data

Voluntary deletion removes the Auth0 user and physically removes the local
`public.players` account. A later Auth0 registration creates a new player UUID
with normal starting state; no old card, point, achievement, rating, or rank is
restored. Permanent banning is a separate, unimplemented product lifecycle.
The forward migration also purges and removes previously completed local
`deleted` tombstones left by the former retention model.

## Request and external boundary

`POST /api/v1/auth/account-deletion` requires an active interactive player,
exact confirmation, and a recent Auth0 ID token for the same identity. The API
first commits a `pending` deletion request and `deletion_pending` account state.
This immediately denies normal API and developer-key activity and finalizes
dependent gameplay. The API then deletes the Auth0 user via the Management API;
`404` means the desired provider state was already reached. Finally, one local
transaction purges account-owned data, removes the player row, creates a
short-lived old-token denial marker, and marks the request completed.

Auth0 and PostgreSQL do not share a transaction. A provider failure or ambiguous
response leaves a locked account for automatic retry. A local failure after
provider deletion rolls back the entire local purge. The worker retries the
provider call (`404` is success) and the local transaction. Concurrent completion
calls serialize on the deletion request and identity locks. A completed request
is returned without repeating cleanup. The scheduler processes pending requests
and removes completed request receipts after twelve months and denial markers
after their thirty-day expiry.

## Purged records

The deletion transaction removes:

- the player account, Auth0 issuer/subject, Player Name, and role;
- owned cards, starter grants, decks and selections, retired wallet, and
  developer API keys;
- challenge attempts, answers and snapshots, event completions and their card
  reward outcomes, and retired coin ledger rows;
- active and completed CPU match state, rounds, actions, and deck snapshots;
- point awards, daily and monthly progression, streaks, total points, and
  achievement unlocks;
- player card-evolution transactions and consumed-copy snapshots;
- precise movement evidence and derived movement decisions at request time;
- seasonal player rating rows, personal season-archive rows, and current
  standings pagination cache entries;
- territory grants and unfinished owner-bonus state; completed personal
  owner-bonus decisions and snapshots are removed during completion;
- trust signals and score snapshots without a retained formal case.

The cleanup function and its deletion-only trigger guards require a matching
`deletion_pending` player and request. Ordinary immutability and foreign-key
protection remain in force outside that transaction. `private.player_history_actors`
is a private UUID-only reference table. At completion, retained shared
references are rewritten from the old player UUID to a fresh random historical
actor UUID and the old actor row is removed in the same transaction. The table
keeps no mapping between them, Auth0 identity, profile, role, status, or
progression. New registrations receive a new player UUID and cannot inherit
those rows. Historical records can still be pseudonymous through their own
content or external copies; access controls and retention remain privacy-policy
decisions.

## Shared and moderation history

Deletion does not cascade through shared content or other players' outcomes.
Pending PvP invitations become terminal and active PvP matches reach an
authoritative outcome before the account is locked. Completed asynchronous and
live match outcomes, ranked settlement and ledger evidence, consumed territory
contributions and ownership versions, and completed trade provenance remain
against a profile-free historical actor where needed to keep counterparties'
records coherent. Active ranked queues and open trade offers become terminal;
current territory ownership is closed. Personal rating and standings rows are
removed. Cached asynchronous PvP retry responses linked to the deleted player
replace a copied Player Name or player UUID with `Deleted player` while keeping
the receipt for idempotency. Player-facing history resolves the absent account
as `Deleted player`.

Published events, challenges, questions, cards, trails, campaigns, placement
definitions, and their audit records remain. Author/reviewer references point
to a profile-free historical actor after account removal, rather than deleting
shared content.

A formal open trust case keeps its review state and audit trail when deletion
starts. Safe evidence summaries, reviewer decisions, restriction and appeal
history, and associated score snapshots remain under bounded retention rules;
an unfinished case expires 90 days after deletion completion, as confirmed for
this redesign. Formally closed cases keep their existing 12-month rule after
final resolution. Raw
movement evidence and active trust signals are removed; ordinary progression is
not retained because of an investigation. An already-finalized case retains its
existing bounded audit history. These retained records no longer point to a
`players` account row. Retained restrictions are historical audit records and
cannot enforce capabilities or appear active without an active player account.
Permanent ban/Auth0 block behavior is future
work, not part of this deletion lifecycle.

Reviewers can still read a retained case under `Deleted player` after account
removal. The case is read-only because reviewer actions require an active
target player. Its latest score snapshot remains available until the case's
retention boundary so the case detail does not disappear prematurely. Free-form
appeal text and reviewer reason notes are redacted at completion because they
could contain copied names, Auth0 subjects, or account UUIDs; structured case,
decision, and appeal metadata remain until the applicable cutoff.

The deletion request receipt stores a random request ID, times, status, and
safe failure category, without a player FK. The private old-token marker stores
only a salted issuer/subject digest, issue-time cutoff, and expiry; it prevents
pre-deletion JWTs from creating another account while they may remain valid.

This describes application database behavior. Backup, provider-log, exported
case, and device-local retention require separate operational policy and
verification; the implementation alone is not a POPIA compliance finding.

This page was revised with assistance from Codex[GPT-6].

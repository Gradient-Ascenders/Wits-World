---
title: Account deletion and fresh registration review - 23 September 2026
---

# Account deletion and fresh registration review - 23 September 2026

## Interaction record

| Field                 | Record                                                                              |
| --------------------- | ----------------------------------------------------------------------------------- |
| Date                  | 23 September 2026                                                                   |
| Status                | Planned stakeholder interaction; implementation status checked on 28 September 2026 |
| Stakeholder (planned) | Calvin Rea                                                                          |
| Team (planned)        | Uzair Mahomed, Kevin Ebrahim, Tyron Van Tonder, and Caleb Perumalsamy               |
| Format                | Stakeholder review and account-lifecycle demonstration                              |
| Scope                 | Permanent account-data purge, provider deletion, retries, and fresh registration    |

## Feedback and evaluation

### Purge account data and allow a new account

**Review topic:** Deleting an account should remove the player's account and
owned progress, rather than leave a disabled profile that prevents a genuinely
new account. A later registration should begin with new-player progress and
must not restore the deleted account's cards, decks, ratings, or rewards.

**Evaluation:** Treat provider deletion and local data cleanup as one recoverable
lifecycle. Require recent reauthentication and explicit confirmation; block
gameplay once deletion begins; preserve safe retries when Auth0 or local cleanup
fails. Avoid blanket cascading deletion of records that belong to another
player or independently published author content.

**Response:** Merged
[PR #329](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/329)
physically removes the player row and purges player-owned progression, cards,
decks, rewards, ratings, CPU history, and relevant standings data inside the
controlled completion transaction. The existing coordinator handles Auth0
deletion and retryable partial failures.

Shared history that needs an actor reference uses a fresh profile-free UUID,
without retaining a mapping to the old player identity. Necessary formal trust
records retain bounded expiry rules, with non-operational historical
restrictions. The minimal deletion receipt and bounded old-token denial support
safe completion and prevent an old access token from recreating the account.

A later legitimate registration creates a new local identity with default
progress. This is distinct from restoring the removed account.

**Implementation decision:** Handled at the repository level in PR #329, merged
on 28 September 2026. This completion date is separate from the review date
listed above. Production deployment and the stakeholder demonstration remain
follow-up actions.

## Integration and evidence

| Evidence stage         | Record                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Review topic           | Account-data purge and the ability to register afresh                                                                         |
| Technical response     | Controlled permanent purge plus safe provider/local retries                                                                   |
| Implementation         | PR #329; migrations 0062 and 0063                                                                                             |
| Focused verification   | Independent re-review passed three database integration tests and 28 deletion/retry/restriction API tests                     |
| Retention correction   | Expired trust snapshots remain purgeable for active players and deleted historical actors; unexpired snapshots remain guarded |
| Stakeholder assessment | Planned demonstration and recorded follow-up                                                                                  |

The database checks cover physical account removal, expired snapshots for an
active player, and retained case/snapshot cleanup after deletion. They use a
disposable test database, not production player data. They do not replace a
real Auth0 deletion and fresh-registration demonstration.

## Outcome and follow-up

| Item                               | Implementation outcome              | Review action                                               | Owner           |
| ---------------------------------- | ----------------------------------- | ----------------------------------------------------------- | --------------- |
| Owned account and progression data | Handled                             | Confirm deletion completion and absence of old progress     | Tyron and Uzair |
| Partial failure and retry          | Existing lifecycle retained         | Demonstrate a recoverable failure without premature success | Tyron           |
| Fresh account                      | New local identity supported        | Register again and confirm a clean player state             | Kevin and Caleb |
| Opponent/shared history            | Retained without the former profile | Check the other player's history still displays correctly   | Uzair and Caleb |
| Stakeholder assessment             | Handled                             | Record the outcome and any requested adjustment             | Uzair           |

Use a dedicated test account for the demonstration. Keep passwords, tokens,
connection strings, and personal account details out of screenshots and notes.
The scope is active application data; backup, export, and external-log retention
requires its own operational policy.

## Evidence

- [Account deletion implementation](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/329)
- [Player schema](../../database/player-schema.md)
- [Trust and authority boundaries](../../architecture/trust-boundaries.md)

## AI declaration

This review plan was generated and edited with assistance from Codex-CLI[gpt-6-sol]. The team
supplied the date and topic; implementation references and the focused re-review
results were checked on 28 September 2026.

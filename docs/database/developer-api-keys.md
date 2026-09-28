---
title: 'Developer API key storage'
---

# Developer API key storage

## Purpose

Migration `0058_create_developer_api_access.sql` adds the private persistence
needed for Wits World's external read-only developer API. The design keeps the
reusable credential secret out of persistent storage while supporting named
keys, immediate revocation, per-key rate limiting, and account-deletion cleanup.

## Relation

`private.developer_api_keys` stores:

| Column            | Purpose                                                                     |
| ----------------- | --------------------------------------------------------------------------- |
| `id`              | Random internal credential UUID used for ownership and rate-limit identity. |
| `owner_player_id` | Local Wits World account that created the key.                              |
| `name`            | Trimmed human-readable application name, limited to 80 characters.          |
| `public_id`       | Random 16-hex-character non-secret lookup identifier.                       |
| `secret_hash`     | 32-byte SHA-256 verifier of the random secret component.                    |
| `created_at`      | Creation timestamp.                                                         |
| `last_used_at`    | Coarsened operational usage timestamp, updated at most once per minute.     |
| `revoked_at`      | Immediate revocation timestamp, or `NULL` while active.                     |

The table is in the `private` schema and grants no table privileges to
`PUBLIC`. A unique constraint protects `public_id`; check constraints protect
name, verifier length, public-ID format, and timestamp order.

## Credential construction

The server creates a credential in the form:

```text
ww_api_<16 lowercase hex characters>_<43 base64url characters>
```

The public identifier comes from 8 random bytes and the secret comes from 32
random bytes. The client receives the assembled credential once. Only
`public_id` and `SHA-256(secret)` are persisted.

SHA-256 is used here as a verifier for a cryptographically random 256-bit
machine secret, not as password storage for a human-chosen low-entropy value.
Authentication locates the candidate row by the public identifier and compares
the derived verifier using a timing-safe comparison.

## Active-key limit and concurrency

Each account may have at most five active developer keys. Creation executes in
a transaction and locks the owning `players` row before counting active
credentials and inserting another. Concurrent create requests for one owner
therefore serialize around the limit rather than both observing the same stale
count.

Revoked rows do not count toward the active limit and remain visible as safe
metadata in Account settings.

## Account lifecycle

Authentication joins the key to its owning player and accepts it only while the
player lifecycle is `active`. Moving to `deletion_pending` therefore disables
all of that account's keys immediately without waiting for asynchronous account
cleanup.

Migration `0058` also extends the existing additive
`private.delete_player_owned_data(uuid, uuid)` wrapper chain. During local
account-deletion completion it deletes all developer-key rows before invoking
the previous cleanup implementation. No reusable credential or verifier is
retained after the player row is removed.

## Privacy and logging

`last_used_at` is operational metadata only. This design does not add request
history, endpoint history, IP-address storage, browser fingerprinting, or
per-developer analytics. The API logger redacts the `X-API-Key` header, and
credentials are not accepted from query parameters or URLs.

The external data routes then project intentionally public fields rather than
returning raw database records. The credential itself grants no access to the
owner's private player resources.

## Verification

Focused automated coverage checks:

- generation and one-time-secret semantics;
- verifier-only persistence;
- malformed/incorrect/revoked credential rejection;
- the five-active-key limit under concurrent creation;
- table privacy and verifier length;
- immediate denial after account deletion starts; and
- removal during account-deletion completion.

See the [External developer API](../architecture/developer-api.md) for the HTTP
contract and public resource boundary.

## AI declaration

This document was generated and edited with the assistance of:
ChatGPT-Web[GPT-5.6 Sol].

This account-deletion update was edited with assistance from Codex[GPT-6].

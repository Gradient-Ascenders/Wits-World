---
title: 'Developer API key storage'
---

# Developer API key storage

Developer keys authenticate the external read-only API. PostgreSQL stores a
secret verifier and safe key metadata; the full reusable credential is returned
only when created.

The [Developer API guide](../architecture/developer-api.md) owns key-management
routes, public resources, rate limits, and response formats.

## Stored fields

`private.developer_api_keys` has no table privileges for `PUBLIC`.

| Column            | Contract                                                       |
| ----------------- | -------------------------------------------------------------- |
| `id`              | Random internal credential UUID.                               |
| `owner_player_id` | Owning local player; deletion is restricted until key cleanup. |
| `name`            | Nonblank trimmed application name, at most 80 characters.      |
| `public_id`       | Unique 16-character lowercase hexadecimal lookup identifier.   |
| `secret_hash`     | 32-byte SHA-256 verifier of the random secret component.       |
| `created_at`      | Creation timestamp.                                            |
| `last_used_at`    | Nullable usage timestamp, updated at most once per minute.     |
| `revoked_at`      | Null while active; set when revoked.                           |

Database checks enforce identifier format, verifier length, and timestamp order.

## Credential verification

The server generates an 8-byte public identifier and a 32-byte random secret.
It assembles the credential in this format:

```text
ww_api_<16 lowercase hex characters>_<43 base64url characters>
```

Only the public identifier and `SHA-256(secret)` are saved. SHA-256 verifies a
random 256-bit machine secret here; it is not a human-password storage scheme.

Authentication parses the credential, finds its public identifier, and compares
the derived hash with a timing-safe comparison. It accepts only an unrevoked
key belonging to an active account.

## Creation and revocation

Each account can have **5 active keys**. Creation locks the owning player row
before counting and inserting, so concurrent requests cannot exceed the limit.
A deleting or unavailable owner cannot create a key.

Revocation sets `revoked_at` idempotently. Subsequent authentication rejects
the key. Revoked rows stop counting toward the limit and remain available as
safe Account metadata; listing never returns a secret or verifier.

## Account lifecycle and privacy

Entering `deletion_pending` disables all of the account's keys immediately.
Deletion completion removes every key row, including revoked credentials and
their verifiers.

`last_used_at` is coarse operational metadata. Key storage adds no per-request
history, endpoint history, IP address, or device fingerprint. The API logger
redacts `X-API-Key`; credentials are accepted in that header rather than URLs.

A key grants access to server-defined public read projections. It does not
grant access to its owner's private player resources or allow gameplay writes.

**AI declaration:** Prepared and updated with assistance from
ChatGPT-Web[GPT-5.6 Sol] and Codex[GPT-6].

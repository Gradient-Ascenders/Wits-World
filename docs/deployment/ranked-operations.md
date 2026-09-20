---
title: 'Ranked competition operations'
---

# Ranked competition operations

Ranked matchmaking becomes available only after an operator schedules a
`ranked-v1` season. Deployment does not insert a season, because the accessible
name and intended start are product decisions. Use a reviewed change with the
production database release procedure; the following SQL shows the required
fields, not a command to run against an unknown database:

```sql
insert into public.ranked_seasons (policy_version, name, intended_start_at)
values ('ranked-v1', 'Reviewed season name', '2026-10-01T00:00:00Z');
```

The name and UTC start above are examples and must be replaced with approved
values. Schedule the next season before the active season ends. A due season
waits while the current one is active or draining. Its 28 days begin at actual
activation. Only one season may be active or closing.

## Release and configuration

The production database release must apply migration `0047` and the issue
`#266` snapshot migration `0050`, proposal withdrawal migration `0051`, and
invalid-proposal cooldown migration `0052`
before starting the new API. Existing
deployment ordering already runs database release before API deployment. A
database backup or point-in-time recovery plan should cover the release; do
not reverse a ranked migration after ranked matches have settled.

`RANKED_SWEEP_INTERVAL_MS` defaults to 1000 and accepts 250–30000. It controls
lease expiry, proposal expiry, pairing, and season transitions. Every API
instance runs the worker safely, although a one-second cadence keeps the Neon
compute active and adds database traffic. The existing server-only
`ASYNC_PVP_CURSOR_SIGNING_KEY` also signs viewer-bound ranked standings cursors.
Keep that value stable across API instances and rotations during a traversal.
It must never be a `VITE_*` value.

On startup and each sweep, the worker checks the season, expires stale search
leases and proposals, claims eligible pairs, and periodically deletes expired
ten-minute standings snapshots. The live PvP deadline worker remains
responsible for active match completion; ranked settlement runs inside each
live terminal transaction. A closing season waits for every ranked receipt to
have a settlement before it seals the archive and activates the next due
season. Do not manually mark a live match complete or alter rating rows.

## Operational checks

After deployment, confirm the API OpenAPI document includes the `Ranked` tag
and the current-season route reports the scheduled season only after worker
activation. Test a two-player queue and match in a disposable environment
before enabling player UI. Check that one match yields one settlement receipt
and two ledger entries, and that repeated reads return the same values. Watch
ranked sweep failures, active/closing season age, stale queue/proposal counts,
and unmatched ranked receipts. Investigate an unsettled terminal match before
attempting a season close. The full database test suite runs in Gitea CI; a
local focused test must use `TEST_DATABASE_URL` only.

## AI declaration

This document was created and reviewed with assistance from Codex (GPT-5).

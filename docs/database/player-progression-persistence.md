---
title: Player progression persistence
---

# Player progression persistence

Migration `0026_create_player_progression.sql` adds the authoritative data
foundation for points, achievements, Johannesburg activity days, streaks, and
all-time/monthly standings. The browser cannot insert point values, unlocks,
activity days, totals, or ranks.

Points are permanent and non-spendable. This migration and its persistence
adapter neither read nor write coin wallets or coin-ledger entries. Applied
migrations that introduced the legacy coin schema remain immutable; issue
`#193` owns its forward-only retirement and the removal of active coin response
fields.

## Relations

| Relation                     | Responsibility                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `progression_point_rules`    | Versioned challenge-score and CPU-result values; only activation may change on an existing version     |
| `player_point_awards`        | Immutable ledger decision for exactly one authoritative event completion or completed CPU match        |
| `player_activity_days`       | One Johannesburg calendar row per player/day, with first/last award evidence and completion count      |
| `player_progression_state`   | Indexed all-time total and streak ending at the latest persisted activity day                          |
| `player_monthly_progression` | Indexed calendar-month total and completion count                                                      |
| `achievement_definitions`    | Data-driven metric, threshold, accessible display name, and description                                |
| `player_achievement_unlocks` | Immutable unique player/achievement unlock linked to the award that first satisfied the persisted rule |

Composite foreign keys ensure an award source belongs to the same player. Each
event-completion and CPU-match source has a unique partial index, so even
different workers cannot create two awards. Insert validation checks the source
status, player, result/score, completion timestamp, point rule, and awarded
value before accepting a ledger row. Ledger and unlock update/delete triggers
then keep the audit history immutable.

## Transaction interface

`createProgressionPersistence()` exposes two internal operations:

- `recordChallengeCompletion(client, completionId)`
- `recordCpuMatch(client, matchId)`

The caller supplies its existing transaction client. Each operation invokes a
private PostgreSQL function that loads the authoritative source, takes a
transaction-scoped per-player advisory lock, and returns either the newly
inserted award or the existing result on replay. A new award updates activity,
monthly and all-time totals, recomputes streak islands, and inserts newly met
achievements with conflict-safe uniqueness.

An unknown or unfinished source raises an error. When issue `#172` wires this
adapter into challenge and match completion, that failure must propagate so the
owning completion transaction rolls back. This issue deliberately does not add
placeholder, asynchronous, browser-authoritative, or HTTP behavior.

## Time and standings

`activity_day` is the authoritative completion timestamp converted with
`Africa/Johannesburg`; `activity_month` is the first date of that local calendar
month. Persisting the individual days means late or out-of-order processing can
recompute streaks correctly.

`player_progression_all_time_standings` and
`player_progression_monthly_standings(month)` apply competition ranking. Their
queries include every active player through a left join, so an account with no
progression row receives zero points. Indexes lead on all-time points or the
month and monthly points. Consumers must order tied rows by Player Name and
then internal UUID for deterministic pagination.

The persisted `streak_at_last_activity` is the run ending at the latest
activity date. Read models turn it into an effective current streak of zero
after a complete Johannesburg day is missed; no scheduled midnight update is
required.

## Backfill and rule changes

The migration processes retained event completions and completed CPU matches
in timestamp/source/ID order through the same private functions used for new
awards. This reconstructs historical totals, months, activity, streaks, and
achievement unlocks for active and anonymised deleted players.

Point-rule changes are prospective. Add a new inactive version, deactivate the
old version and activate the new version in one transaction. Existing awards
retain their original version and value. Applied migration history and ledger
rows must never be edited to rebalance points.

## Privacy and retention

Progression stores no email, Auth0 subject, or location. Account deletion keeps
the immutable award, activity, totals, and unlock history against the anonymous
player UUID because their challenge and completed-match sources are already
retained. Live all-time and monthly standings filter to active accounts, so a
deleted tombstone is not publicly ranked.

## Verification

`apps/api/tests/progression-persistence.integration.test.ts` creates a
disposable database at the pre-`0026` schema, inserts retained history, applies
the migration, and verifies backfill, zero-point records, Johannesburg
boundaries, out-of-order streaks, duplicate and concurrent writes, unique
unlocks, prospective versions, competition ties, zero-point standings, source
validation, immutability, and deleted-player filtering. The explicit database
runner registers this file so `npm run test:database --workspace
@wits-world/api` executes the suite.

The preceding document was generated and edited with the assistance of:
Codex-CLI[gpt-5.6-sol medium].

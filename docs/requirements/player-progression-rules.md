---
title: Player progression rules
---

# Player progression rules

Issue `#171` defines the first Intermediate-tier progression rules. Progression
points are separate from coins: coins remain the spendable reward currency,
while points measure completed play for profiles and standings. The API and
database remain authoritative for every award.

## Point awards

Challenge points use the final five-question score stored by the server:

| Correct answers | Points |
| --------------- | -----: |
| 0               |      0 |
| 1               |     10 |
| 2               |     20 |
| 3               |     30 |
| 4               |     40 |
| 5               |     50 |

A completed CPU victory awards `25` points. A CPU loss awards `0` points. A
zero-point result is still recorded as a processed progression source so it can
count as activity and so retries remain auditable and idempotent.

Rules are versioned configuration. A new active version affects future awards;
it never recalculates an existing ledger entry. Each entry retains the exact
rule code, version, value, and authoritative completion or match that produced
it. Achievements are badges and do not award additional points.

## Daily activity and streaks

Any completed event quiz or CPU match counts as activity, regardless of score
or winner. Dates use the `Africa/Johannesburg` calendar derived from the
server-persisted completion timestamp.

- Multiple completions on one local day count as one streak day.
- Consecutive local dates increase the streak by one.
- A gap of at least one complete local calendar day resets the next activity to
  a streak of one.
- The displayed current streak remains available during the day immediately
  after the last activity, when it can still be continued. It displays as zero
  after a complete day is missed.
- The longest historical streak remains available even when the current streak
  expires.

Persisted activity days allow an out-of-order authoritative completion to
reconstruct the correct streak instead of relying on processing order.

## Initial achievements

| Code               | Display name    | Unlock condition                      |
| ------------------ | --------------- | ------------------------------------- |
| `first_quiz`       | First Quiz      | Complete one event quiz               |
| `perfect_quiz`     | Perfect Quiz    | Complete one quiz with five correct   |
| `five_quizzes`     | Campus Explorer | Complete five event quizzes           |
| `first_cpu_win`    | First Victory   | Win one CPU match                     |
| `five_cpu_matches` | Battle Tested   | Complete five CPU matches             |
| `three_day_streak` | On a Roll       | Reach three consecutive activity days |

Definitions are data-driven. An unlock is unique per player and achievement;
concurrent completions cannot create duplicate badges.

## Standings

The first standings support all-time points and Johannesburg calendar months.
Every active account participates, including a player with no activity or zero
points in the selected month.

Equal totals use competition ranking: `1, 2, 2, 4`. Tied rows retain the same
rank and are displayed deterministically by Player Name and then internal
player UUID. The UUID is an internal ordering key and is not an approved public
profile field.

The approved player-facing progression fields are Player Name, points, rank,
current streak, longest streak, and earned achievement names. Email, Auth0
identity, precise location, internal source IDs, and private gameplay records
are excluded.

Deleted-player progression remains linked to the anonymous local tombstone for
integrity and aggregate analysis, but deleted and deletion-pending accounts do
not occupy live standings positions.

## Delivery boundary

Migration `0025_create_player_progression.sql` and the internal progression
persistence adapter establish these rules and backfill retained completed
history. Issue `#172` separately owns authenticated profile/standings HTTP
operations and wiring challenge and CPU completion transactions to the
progression adapter.

The preceding document was generated and edited with the assistance of:
Codex-CLI[gpt-5.6-sol medium].

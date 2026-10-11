---
title: 'Points and achievement storage'
---

# Points and achievement storage

Progression stores authoritative point awards, activity days, streaks,
achievements, and campus standings. The server saves these records with the
completed gameplay result. The [progression rules](../requirements/player-progression-rules.md)
define award values and player-visible behaviour.

## Stored model

| Relation                     | Responsibility                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `progression_point_rules`    | Versioned award values; existing versions retain their definition.                 |
| `player_point_awards`        | Immutable award decisions linked to authoritative gameplay sources.                |
| `player_activity_days`       | One row per player and Johannesburg day, with completion count and award evidence. |
| `player_progression_state`   | All-time total, streak at the latest activity day, and best streak.                |
| `player_monthly_progression` | Calendar-month total and completion count.                                         |
| `achievement_definitions`    | Achievement metric, threshold, name, and description.                              |
| `player_achievement_unlocks` | One immutable unlock per player and achievement, linked to its triggering award.   |

Points cannot be spent. Progression does not use the retired coin wallet or
ledger.

## Award transaction

`createProgressionPersistence()` accepts the owning gameplay transaction
client and an authoritative source ID:

| Operation                         | Source                                            |
| --------------------------------- | ------------------------------------------------- |
| `recordChallengeCompletion`       | Finalised event completion.                       |
| `recordCpuMatch`                  | Completed CPU match.                              |
| `recordAsynchronousPvpCompletion` | Completed async match; records both participants. |

The database loads and validates the source's player, terminal result,
completion time, applicable rule version, and award value. Per-player
transaction locks serialise updates to totals and activity. Composite foreign
keys prevent an award from referring to another player's source.

A new award updates daily activity, monthly and all-time totals, streaks, and
newly met achievements in the same transaction. If progression fails, the
gameplay finalisation rolls back.

Unique source indexes prevent duplicate awards across workers and retries.
Reprocessing a completed source returns its existing award. A saved HTTP
idempotency response replays the original committed outcome.

### Async and live battles

An async match has one award decision per `(match, participant)`. Both
participant decisions commit together; player locks are taken in canonical UUID
order. Zero-point outcomes still count as activity.

Async awards do not increment CPU or challenge achievement metrics. Live PvP
has no progression award or activity-day source. Seasonal rating and territory
influence use separate storage; see [ranked storage](ranked-competition-persistence.md).

## Activity dates and streaks

The authoritative completion timestamp is converted to **Africa/Johannesburg**.
`activity_day` stores that calendar date; `activity_month` stores the month's
first date.

Persisted daily rows allow late or out-of-order results to recompute consecutive
activity runs. Several completions on one date increase its completion count
without adding another streak day.

`streak_at_last_activity` describes the run ending at the latest saved activity
day. Read models derive the effective current streak: it becomes 0 after a
complete Johannesburg day is missed. No midnight rewrite is required.

## Standings reads

`player_progression_all_time_standings` and
`player_progression_monthly_standings(month)` use competition ranking:
equal point totals share a rank. Every active account participates, including
accounts with no progression row and a total of 0.

The authenticated read service returns each standings page, total active-player
count, and the caller's own standing from one parameterised statement snapshot.
Ties are ordered by Player Name, then UUID for deterministic pagination.
Player responses omit internal UUIDs and accounts that are no longer active.

The external developer leaderboard uses a smaller public projection.
[Developer API](../architecture/developer-api.md) defines its fields.

## Rule versions and retention

Rule changes apply to future awards. A new version replaces the active rule
transactionally; saved awards retain their original version and value.
Ordinary updates and deletes cannot rewrite award or unlock history.

Progression stores no Auth0 identity, email, or precise location. Account
deletion removes awards, activity, totals, and achievements along with personal
gameplay sources. Shared PvP history can remain under a profile-free actor, but
it does not preserve the deleted account's progression or standing.

See [account retention](account-deletion-retention.md) for the cleanup boundary.

**AI declaration:** Prepared and updated with assistance from
Codex-CLI[gpt-5.6-sol medium], Codex[GPT-5], Codex-CLI[GPT-6], and Codex[GPT-6].

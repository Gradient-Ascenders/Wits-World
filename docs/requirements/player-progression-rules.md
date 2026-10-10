---
title: 'Points, achievements and rankings'
description: Earn progression points, unlock achievements, maintain a streak, and compare campus standings.
---

# Points, achievements and rankings

Progression points record your completed challenges and battles. They accumulate
without a seasonal reset and cannot be spent. Card rewards are separate; see
[challenge rewards](basic-game-rules.md#card-rewards).

## View your progress

Open **Profile** at `/profile` to see **Points**, **All-time rank**, **Current
streak**, and **Best streak** beneath the activity calendar. Select an achievement
to read its requirement and, if unearned, your progress toward it.

Open **Leaderboard** at `/leaderboard` to compare campus standings. Choose
**All time** or **This month**, then use **Previous** and **Next** to browse.
Your own standing remains visible even when you are outside the current page.

## Point awards

| Activity                    | Points                                      |
| --------------------------- | ------------------------------------------- |
| Completed challenge         | 10 per correct answer: 0–50 for 5 questions |
| CPU victory                 | 25                                          |
| CPU loss, including forfeit | 0                                           |

Both multiple-choice and ordering challenges use the saved final score. For
example, 3 correct answers award 30 points. Unfinished challenges and battles
do not award points.

### Asynchronous PvP progression

A completed async battle awards **25 points to the winner** and **0 to the
loser**. This applies to battle defeat, missed-deadline forfeit, voluntary
forfeit, and account-unavailability forfeit.

Both participants' results count as activity. Async battles do not advance
CPU-match or CPU-win achievements and have no dedicated achievement, but can
contribute toward **On a Roll** through activity streaks.

## Daily activity and streaks

A completed challenge, CPU battle, or async battle counts as activity even when
it awards 0 points. Dates use **Johannesburg time** and the recorded completion
time, rather than when you started playing.

- Complete an activity on consecutive calendar days to extend your streak.
- Several completions on the same day count as 1 streak day; the profile
  calendar still shows their completion count.
- Your current streak remains visible on the day after your last activity,
  giving you that day to continue it. After a complete day is missed, it shows 0.
- Your next completion after a gap starts a new streak at 1. Your best streak
  and already-earned achievements remain.

For example, an activity on Monday keeps the streak available on Tuesday.
Complete another activity on Tuesday to extend it. If Tuesday is missed,
the current streak is 0 on Wednesday.

## Achievements

| Achievement     | Requirement                                     |
| --------------- | ----------------------------------------------- |
| First Quiz      | Complete 1 event challenge                      |
| Perfect Quiz    | Answer all 5 questions correctly in 1 challenge |
| Campus Explorer | Complete 5 event challenges                     |
| First Victory   | Win 1 CPU battle                                |
| Battle Tested   | Complete 5 CPU battles, including losses        |
| On a Roll       | Be active on 3 consecutive Johannesburg days    |

Achievements unlock automatically when their requirements are met. Each badge
is earned once per account and awards no extra points.

## Campus standings

**All time** ranks accumulated progression points. **This month** ranks points
earned during the current Johannesburg calendar month; it does not erase your
all-time total. The period filter does not reset streaks or achievements.

Every active account participates, including players with 0 points. Equal
totals share a rank: `1, 2, 2, 4`. Keeping your profile private does not remove
you from standings, which are available to signed-in active players.

### Other competitive measures

| Measure                                                | Earned through                               | Where to view it             |
| ------------------------------------------------------ | -------------------------------------------- | ---------------------------- |
| Progression points                                     | Challenges, CPU wins, and async wins         | Profile and Leaderboard      |
| [Seasonal rating](ranked-competition-policy.md)        | Ranked live battle results                   | **Standings** in Live Ranked |
| [Territory influence](contested-campus-zone-policy.md) | Eligible ranked wins while contesting a zone | **Territories** in Explore   |

Live PvP does not award progression points or add progression activity days.
Seasonal rating and territory influence are not converted into progression
points. Each measure's rules are linked in the table above.

## How it works

The server saves points, activity, and achievement unlocks with the completed
result. Reopening a result or retrying a request cannot award them again.
Award rules are versioned; changing a rule affects future awards and does not
recalculate saved ones.

Account deletion removes personal progression and standings. Registering again
starts a new account without the previous points or achievements. See
[account retention](../database/account-deletion-retention.md) for the full
cleanup rules and [progression storage](../database/player-progression-persistence.md)
for implementation details.

---

This page was prepared and edited with assistance from
Codex-CLI[gpt-5.6-sol medium], Codex[GPT-5], Codex-CLI[GPT-6], and Codex[GPT-6].

---
title: 'Trail rules'
description: Follow campus events in order, understand saved progress, and find the next available stop.
---

# Trail rules

Trails arrange existing campus events into an Author-defined order. They help
you find the next unfinished stop. Each stop uses the normal event challenge;
finishing a trail does not award extra cards or progression points.

## Follow a trail

1. Open **Explore → Trails** and choose **View trail**.
2. Check your completed count and the numbered stops. The map pins use the same
   stop numbers as the list.
3. Choose **Open event** on the current stop. Follow the
   [event access journey](player-location-journey.md#player-journey) to check your
   range and start its challenge.
4. Complete the [challenge](player-challenge-journey.md), then return to Trails
   to see the next stop.

You can browse trails without location permission. Opening a current stop does
not grant challenge access; the normal server location and availability checks
still apply.

## Progress rule

Progress counts completed stops **from the start of the trail up to the first
missing completion**. It uses your saved event results, including results
completed outside the trail or through another trail.

Any finalised challenge counts, including a timeout or a score of 0. Starting
an attempt or saving answers without finalising it does not complete the stop.
Scores, points, and cards follow the existing
[challenge rules](basic-game-rules.md) and
[progression rules](player-progression-rules.md).

| Stop state  | Meaning                                                |
| ----------- | ------------------------------------------------------ |
| Completed   | Part of your completed sequence from the start.        |
| Current     | The next unfinished stop is available to open.         |
| Locked      | An earlier stop still needs a completion.              |
| Unavailable | The next stop or the trail is not currently available. |

For example, if you completed stop 2 before stop 1, stop 2 stays locked in the
trail view. Completing stop 1 then counts both stops and advances you to stop 3.
You do not repeat stop 2.

Locking controls trail guidance. It does not block an otherwise available event
from being played through the normal Events view. Completing an event shared by
several trails can therefore advance each trail once its earlier stops are done.

## Availability and retirement

The next unfinished stop must be published, active, and available. If it is
upcoming, ended, or retired, the trail shows why it cannot be opened. Later stops
remain locked; the trail does not skip the blocked stop.

A trail assigned directly to a published campaign follows that campaign's
window. Upcoming and ended trails remain visible, but cannot offer a current
stop. Including a trail in a campaign does not automatically schedule its member
events; their availability is checked separately.

Retiring a trail, or retiring its campaign when no other published campaign
window applies, removes it from new discovery. It remains visible to players
with a saved completion for at least 1 of its events. Completed progress is
preserved, and unfinished stops become unavailable. A fully completed trail
still shows as completed after retirement.

## Nearby unvisited events

**Explore → Nearby** uses your reported location to find active events you have
not completed. By default, it returns up to **20 events within 1,000 metres**,
ordered by distance.

An event appears when it is either:

- your current stop in at least 1 active, published trail; or
- not part of any active, published trail.

Later locked stops are excluded unless the same event is current in another
active trail. One result can show several trail contexts. Upcoming, ended, and
retired trails do not impose this filter on otherwise available events.

Choose **View event** to open a result or **Refresh nearby** to update the search.
The search needs a fresh location reading with sufficient accuracy. Appearing
in Nearby does not mean you are in challenge range; access is checked when you
open the event and start the challenge.

## How it works

Authors can publish trails with **2–50 unique events**, all published and not
retired at publication. An event may be reused in different trails. Draft order
can change; published order is fixed. Published trails can be retired, and a
trail attached to a published campaign requires that campaign to be retired
first.

The API derives your progress from saved event completions. The browser displays
the returned order and states; it cannot mark stops complete or unlock them.
Reopening a trail recalculates progress from those same records.

Nearby location readings are used for the search and are not stored as trail
history. For persistence and endpoint details, see
[Trail storage and API](../database/ordered-trails-persistence.md).

---

This page was prepared and edited with assistance from
Codex-CLI[gpt-5.6-sol medium], Codex-CLI[GPT-5], Codex-CLI[GPT-6], and Codex[GPT-6].

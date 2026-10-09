---
title: 'Saved events and offline play'
description: Prepare events on your device, play saved challenges, and sync results after reconnecting.
---

# Saved events and offline play

You can answer prepared multiple-choice and ordering challenges without a
connection. Results, points, and cards are confirmed only after the server
accepts the saved attempt. Battles and trading still need a connection.

## Prepare before going offline

1. Open the app while connected, sign in, and complete Player Name setup.
2. Allow browser location access. The app automatically prepares up to ten
   nearby events; availability determines which events can be saved.
3. Open `/offline` to check **Saved campus events** and their **Available until**
   times before disconnecting. The offline notice also links to saved events.

Events are saved in this browser on this device. Preparation needs a working
server connection and location access. If no events are saved, check your
connection and permissions; you can still use online challenges while connected.
**Retry device storage** retries reading local data when the page offers it.

Saved events expire at their displayed time, which can be earlier than 24 hours
after preparation because an event ends or its automatic placement rotates.
An event listed for a future window cannot be started before that window begins.

## Play a saved challenge

Move within the event's interaction radius and choose **Open saved challenge**.
Location access is still required to check your starting position. Answer using
the normal [challenge controls](player-challenge-journey.md).

Submitted answers are saved locally. Reopen an in-progress attempt under
**Attempts on this device** to continue it; leaving or reloading does not reset
its timer. At completion the app also needs a location reading. If it shows
**Answers locked. Completing location evidence…**, choose **Retry location**
and allow the reading to finish.

## Reconnect and confirm the result

Reconnect **within 12 hours of completing the challenge**, using the same account
and browser. The app attempts to sync when reopened, reconnected, or brought to
the foreground. You can also choose **Sync saved attempts**, **Sync now**, or
**Retry sync** where offered.

| Status                        | What to do                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| Pending server validation     | Keep the saved attempt and reconnect; rewards are still unconfirmed.               |
| Connection or sign-in failure | Restore access and retry sync using the same saved attempt.                        |
| Accepted                      | Choose **View confirmed result** to inspect the score, answer review, and rewards. |
| Rejected or sync window ended | Read the saved receipt. That attempt has no newly confirmed reward.                |

The server checks timing, location, content availability, and answers. A retry
cannot award rewards twice. A detected network connection alone does not confirm
that the server is reachable or that sync succeeded.

## Protect unsynced work

Keep this browser's site data until your result is confirmed. Clearing storage
or browser eviction can lose pending attempts. Signing out, switching accounts,
and deleting an account warn before discarding local attempts; cancel the action
if you want to sync first. Saved work cannot be transferred to another account.

After an accepted or final rejected submission, the app removes the local attempt
and its precise location readings, keeping a receipt temporarily. For technical
expiry, validation, storage, and retry rules, see [Offline play API](../architecture/offline-challenge-play.md).

---

This guide was written and checked against offline preparation, saved challenge
controls, and synchronisation with assistance from Codex[GPT-6].

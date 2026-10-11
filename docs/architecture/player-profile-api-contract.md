---
title: Profiles API
description: Read published player profiles and update your own profile with privacy and version checks.
---

# Profiles API

The Profiles API lets an authenticated, active player edit their own profile
and read profiles that other players have published. Profiles start private;
publishing a profile and sharing its activity are separate choices.

See the [player profile guide](../design/profile-showcase.md) for the player
experience, and the [API reference](../api-reference.md) for bearer
authentication and the shared error format. Successful profile responses use
`Cache-Control: private, no-store`.

## Routes

| Method | Route                                  | Result                                                          |
| ------ | -------------------------------------- | --------------------------------------------------------------- |
| GET    | `/api/v1/profiles/me`                  | Your profile, including editing settings and progress.          |
| GET    | `/api/v1/profiles/players/:playerName` | A published profile, or your owner view when the name is yours. |
| PUT    | `/api/v1/profiles/me`                  | Save a complete edit and return the updated owner view.         |

A missing, private, or unavailable profile returns `404 PROFILE_NOT_FOUND`.
The response does not reveal whether the target account exists or is being
deleted.

## Owner and visitor views

GET and PUT responses return the profile fields directly, with a `requestId`.
`isOwner` identifies the view returned to the caller.

| Fields                                                           | Meaning and visibility                                                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `playerName`, `points`, `rank`, `currentStreak`, `longestStreak` | Current player identity and progression.                                                                   |
| `achievements`                                                   | Owners receive earned achievements and progress towards others; visitors receive earned achievements only. |
| `bio`, `degree`, `studyYear`, `avatarDataUrl`, `status`          | Profile content. Academic details are self-reported text.                                                  |
| `isPublic`, `activityVisible`                                    | Publication and activity-sharing settings, both false by default.                                          |
| `featuredCards`                                                  | Ordered card presentations, including artwork and game details.                                            |
| `featuredOwnedCardIds`, `version`                                | Owners receive selected copy IDs and an editing version. Visitors receive `[]` and `null`.                 |
| `activity`, `activityThrough`                                    | Daily activity and the last date covered by the response.                                                  |

Owners always receive their activity. Visitors receive `activity: null` unless
activity sharing is enabled. Shared activity contains `{ date, count }` entries
for days with activity, within the 365 days ending at `activityThrough`. Dates
follow Africa/Johannesburg; a calendar can fill missing dates with zero counts.

`status` is either `null` or `{ emoji, text, expiresAt }`; `expiresAt` is a
timestamp or `null`. Expired statuses are hidden. Profile responses exclude
email, authentication-provider details, locations, precise activity timestamps,
and the player's wider collection.

## Saving an edit

PUT replaces the editable settings. Send every field below, even when clearing
text or leaving a setting unchanged. Extra fields are rejected.

| Field                         | Accepted value                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `expectedVersion`             | The integer `version` from your latest owner view; a new profile starts at 0.                   |
| `bio`                         | Text up to 280 characters.                                                                      |
| `degree`                      | Text up to 100 characters.                                                                      |
| `studyYear`                   | Text up to 32 characters.                                                                       |
| `avatarDataUrl`               | A base64 JPEG, PNG, or WebP data URL up to 200,000 characters, or `null` to remove the picture. |
| `statusEmoji`                 | Text up to 16 characters.                                                                       |
| `statusText`                  | Text up to 80 characters.                                                                       |
| `statusExpiry`                | `keep`, `today`, `week`, or `never`.                                                            |
| `isPublic`, `activityVisible` | Boolean settings.                                                                               |
| `featuredOwnedCardIds`        | Up to 4 distinct owned-copy UUIDs, in display order. An empty array clears the showcase.        |

Text is trimmed on save. The API re-encodes accepted pictures as a 256 × 256
JPEG without image metadata. An invalid image returns `400 INVALID_PROFILE_AVATAR`.

For status expiry, `keep` preserves the existing expiry, `today` means the next
Johannesburg midnight, `week` means 7 days from the save, and `never` means no
expiry. Clearing both status fields removes the visible status.

Showcase selections refer to exact owned copies. They do not reserve cards;
trading or consuming a selected copy removes it from the showcase. Use
`GET /api/v1/cards/collection?unique=true` to list one currently owned copy per
definition, while preserving the saved copy IDs for unchanged selections.

## Version conflicts

Each successful save increments `version`. A stale edit returns
`409 PROFILE_VERSION_CONFLICT`; a selected copy that is no longer owned returns
`409 PROFILE_CARD_UNAVAILABLE`. Neither failure applies part of the edit.

Keep the draft, fetch your current profile, and resolve the changed settings or
card selection before submitting again. If a save's response is lost, read the
profile to establish its current state before retrying with a version.

## AI declaration

Rewritten with assistance from Codex[GPT-6], using the profile routes, response
handling, and privacy rules.

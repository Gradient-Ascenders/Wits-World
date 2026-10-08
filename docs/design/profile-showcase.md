---
title: 'Player profile'
description: Personalise your profile, choose favourite cards, and control what other players can see.
---

# Player profile

Your profile brings together your player identity, favourite cards, activity,
and achievements. Open `/profile` to view your own profile, or
`/players/:playerName` to view another player's published profile.

## Player journey

1. Inspect a favourite card or select an achievement to open its details.
   Achievement dialogs explain the requirement and show your progress if unearned.
2. Choose **Edit profile** to change your picture, bio, degree, or year of study.
   Academic details are optional and self-reported. Use **Choose picture** to
   upload and crop an image, or **Remove picture** to clear it.
3. Select the status control beside your name to add an emoji, text, or both.
   Choose when to clear it: the end of today, in one week, or never. **Clear status
   now** clears the draft; choose **Save changes** to persist it.
4. Choose **Edit showcase** or an empty **Choose a card** slot to select up to four
   owned favourites. Search your cards, inspect them, and drag selected cards to
   reorder them. Keyboard users can reorder with arrow keys on the grips.
5. Choose **Save changes** in each editor to apply the change, or **Cancel** to
   leave without saving.

## Visibility and sharing

Profiles and activity sharing are private by default. In **Edit profile**, choose:

| Setting                                      | Effect                                                  |
| -------------------------------------------- | ------------------------------------------------------- |
| **Make my profile visible to other players** | Lets signed-in active players view your profile.        |
| **Share my daily activity**                  | Adds daily completion counts to your published profile. |

Visitors see your identity details, selected card presentations, earned
achievements, and progression totals. They do not see your full collection,
owned-copy identifiers, email, location, or exact activity timestamps. Unearned
achievement progress is visible only to you. Keeping activity private does not
hide the profile's points, rank, or streak totals.

A private, missing, or deleted profile appears unavailable to visitors. You can
always view your own activity without sharing it.

## Activity and progress

The calendar counts completed challenges and matches by Johannesburg date.
Choose **Last 3 months** or **Last year**, then hover, tap, or focus a day to read
its count. Arrow keys move between dates; horizontal scrolling reveals older
weeks. Points, all-time rank, current streak, and best streak appear below it.

Status text is self-written and does not indicate online presence. **At the end
of today** expires at the next Johannesburg midnight; **In one week** expires
seven days after saving.

## How it works

The server checks profile versions and ownership when saving. Favourites refer
to owned copies but do not reserve them: trading or consuming a selected copy
removes it from the showcase. Profile edits do not change card rules or earned
progression. Uploaded pictures are resized and re-encoded by the API without
image metadata.

See the [profile API contract](../architecture/player-profile-api-contract.md)
for persistence and privacy details, and
[progression rules](../requirements/player-progression-rules.md) for points,
streaks, and achievements.

---

This page was prepared and edited with assistance from Codex[GPT-6].

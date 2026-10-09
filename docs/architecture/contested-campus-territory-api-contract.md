---
title: Territories API
description: Read campus zones, attach a ranked territory claim, and retrieve influence feedback.
---

# Territories API

The territory API lets active players read campus zones and add an optional
zone claim when joining ranked matchmaking. It returns ownership, anonymous
influence standings, and each player's own contribution result.

See [Territory rules](../requirements/contested-campus-zone-policy.md) for the
player journey, location policy, influence limits, hourly ownership decisions,
and owner card bonuses. The [ranked API](ranked-matchmaking-api-contract.md)
owns queue and rating behaviour.

## Zone reads

All routes require bearer authentication and an active player account, use the
general [request quota](rate-limiting.md), and return `200` on success. Errors
use the shared [API format](../api-reference.md#responses-and-retries).

| Route                                           | Response                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `GET /api/v1/territory/zones`                   | `{ zones }` containing active and suspended zones.                |
| `GET /api/v1/territory/zones/:zoneId`           | A zone object plus `lifecycleVersion` and `lastSettledAt`.        |
| `GET /api/v1/territory/zones/:zoneId/standings` | Current influence totals and your remaining daily allowance.      |
| `GET /api/v1/territory/zones/:zoneId/history`   | `{ zoneId, entries }` with up to 50 recent ownership transitions. |

Zone objects contain `zoneId`, `name`, `status`, GeoJSON `geometry`, `owner`,
`seasonId`, `windowStart`, and `windowEnd`. Status is `active` or `suspended`.
`owner` is `{ playerName }` or null; season and window fields can be null when
no competitive season is current. Missing or unavailable zones return
`404 TERRITORY_ZONE_NOT_FOUND`.

Standings return `zoneId`, `seasonId`, and:

| Field      | Contents                                                                       |
| ---------- | ------------------------------------------------------------------------------ |
| `top`      | Up to 3 anonymous `{ rank, influence }` entries for the current window.        |
| `activity` | Aggregate `influence` and `contributors` counts.                               |
| `viewer`   | Your `influence`, `todayInfluence`, `dailyCap`, and `remainingDailyInfluence`. |

History entries include `seasonId`, `owner`, `transitionKind`, and `effectiveAt`.
Repeated settlements that keep the same owner are omitted from ownership-period
history. Deleted owners display as `Deleted player`. A map or locally elapsed
window does not establish a new owner; use the returned ownership state.

## Join with a zone claim

Use the existing `POST /api/v1/ranked/queue` route with `deckId` and optional
`territoryClaim`:

```json
{
  "deckId": "11111111-1111-4111-8111-111111111111",
  "territoryClaim": {
    "zoneId": "22222222-2222-4222-8222-222222222222",
    "latitude": -26.19,
    "longitude": 28.03,
    "accuracyMetres": 8,
    "acquiredAt": "2026-10-09T10:00:00.000Z"
  }
}
```

All claim fields are required when claiming a zone. Coordinates must be valid,
accuracy non-negative, and the acquisition time fresh. The server checks that
the reported point and its full accuracy envelope lie strictly inside the
requested active zone, without ambiguous overlap with another active zone.
This is stricter than the ordinary event-radius check.

An accepted claim binds eligibility to the caller's queue entry for 5 minutes.
Heartbeats do not extend that eligibility. It is checked again at match creation,
then saved with the match. If eligibility expires or the zone becomes unavailable
before matching, the entry is removed without a decline cooldown; obtain a fresh
reading before joining again.

Omit `territoryClaim` for ordinary ranked play. Selecting or viewing a zone does
not create eligibility, and a match without a saved claim cannot add influence.
The server evaluates precise coordinates for the claim without retaining those
coordinate values.

## Claim failures

| Response                                  | Caller action                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `400 TERRITORY_LOCATION_INVALID`          | Correct malformed coordinates or timestamps.                                 |
| `409 TERRITORY_LOCATION_REFRESH_REQUIRED` | Obtain a fresh or more precise reading, or move farther inside the zone.     |
| `409 TERRITORY_NOT_ELIGIBLE`              | Check that the chosen zone is active and the reported location is inside it. |
| `503 TERRITORY_CONFIGURATION_UNAVAILABLE` | Show temporary unavailability; do not infer eligibility from the map.        |

Use the ranked contract to recover queue state after an uncertain join. Repeating
an existing queue selection does not extend the claim's lifetime.

## Match contribution feedback

`GET /api/v1/ranked/matches/:matchId/settlement` includes `territory`. It is null
when the caller's match has no saved zone claim. Otherwise it contains `zoneId`,
`zoneName`, `outcome`, `influencePoints`, and `exclusionReason`.

| Outcome    | Meaning                                                    |
| ---------- | ---------------------------------------------------------- |
| `pending`  | The match has not settled.                                 |
| `lost`     | You lost, so the saved zone received no influence.         |
| `accepted` | Your eligible win committed the returned influence points. |
| `excluded` | You won, but the contribution was ineligible.              |

For an excluded win, `exclusionReason` is `daily_cap_reached`,
`placement_matches_remaining`, `player_unavailable`, `result_not_eligible`, or
`zone_unavailable`. The result describes only the authenticated participant;
it does not disclose the opponent's claim or contribution decision.

Influence is created from authoritative ranked settlement. There is no endpoint
for writing influence or choosing an owner. Render the returned contribution
rather than inferring it from a win, rating change, or standings refresh.
Ownership is settled separately under the linked territory rules.

## Challenge bonus and privacy

A completed challenge can include `ownerBonus: { outcome, card }`.
Its outcome is `awarded`, `not_eligible`, `score_too_low`, or `already_claimed`;
`card` is null unless awarded. It is separate from `reward.cards`, and retries
cannot claim another bonus. See the
[challenge response](challenge-attempt-api-contract.md#completed-response) and
[owner bonus rules](../requirements/contested-campus-zone-policy.md#owner-card-bonus).

Zone reads and standings omit contributor identities, source match IDs, decks,
location evidence, and private account or trust details. The current owner's
Player Name is public; other contributors remain anonymous except for the
caller's own totals.

## AI declaration

Rewritten with assistance from Codex[GPT-6], using territory routes, claim
validation, and ranked settlement projections. Earlier versions also used
ChatGPT-Web[GPT-5.6 Sol] and Codex[GPT-5].

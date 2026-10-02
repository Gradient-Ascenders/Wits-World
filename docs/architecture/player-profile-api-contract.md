# Player profile showcase API

All routes require an interactive authenticated active player. Read and write
responses use `Cache-Control: private, no-store`. Player Name, progression rules,
achievement definitions and card ownership retain their existing authority.

| Method | Route                                  | Result                                                                                                    |
| ------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/profiles/me`                  | Owner snapshot including settings version, selected copy IDs, all achievement progress and daily activity |
| GET    | `/api/v1/profiles/players/:playerName` | Published player snapshot; owner projection if the viewer owns this profile                               |
| PUT    | `/api/v1/profiles/me`                  | Validate and save the authenticated player's complete edit, then return its owner snapshot                |

The snapshot contains `playerName`, `points`, `rank`, `currentStreak`,
`longestStreak`, `achievements`, `bio`, `degree`, `studyYear`, `avatarDataUrl`,
`status`, `isPublic`, `activityVisible`, `featuredCards`, `featuredOwnedCardIds`,
`activity`, `activityThrough`, `isOwner`, `version` and `requestId`.

Publication defaults to false. Missing, private, nameless, pending-deletion and
deleted targets all return `404 PROFILE_NOT_FOUND`, without exposing target
account state. Visitors receive a null version and no copy IDs. Featured cards
contain only card presentation (definition, artwork, rarity, stats and rules).
Only earned achievements appear to visitors. Activity is null unless shared,
otherwise it contains `{ date, count }` entries from authoritative
`player_activity_days`, bounded to the 365 days ending at `activityThrough`.
Zero days are supplied only as calendar presentation in the browser. All date
boundaries follow Africa/Johannesburg. No provider identity, email, locations,
precise activity timestamps, hidden cards or inventory are projected.

The edit requires `expectedVersion`, `bio`, `degree`, `studyYear`,
`avatarDataUrl`, `statusEmoji`, `statusText`, `statusExpiry`, `isPublic`,
`activityVisible` and `featuredOwnedCardIds`. Character limits are 280 for bio,
100 for degree, 32 for study year, 16 for emoji and 80 for status. Academic details
are optional self-reported text. The client crops a JPEG/PNG/WebP input locally;
the API accepts at most 200,000 characters of encoded image input, decodes with a
pixel limit and emits a metadata-free 256×256 JPEG. Null removes the picture.

`statusExpiry` is `keep`, `today`, `week` or `never`. Today ends at the next
Johannesburg midnight; week is seven days from the server's transaction time.
Blank status text clears the visible status. Both projections suppress expired
status. The browser honors the returned expiry while the page remains open.

A new profile has version zero; each save increments it. The write locks the
active player, checks the version and locks selected copies in deterministic
order before replacing settings and ordered showcase membership. Up to four
distinct owned-copy UUIDs are allowed. Stale saves return
`409 PROFILE_VERSION_CONFLICT`; unavailable copies return
`409 PROFILE_CARD_UNAVAILABLE`. Both failures roll back the full write. The
browser retains the draft and offers a reload rather than claiming success.

Migration 0064 removes showcase membership after a copy changes owner and uses
ON DELETE CASCADE when a copy is consumed or removed. Reads additionally join
current ownership. Publication never blocks trading or evolution. Account
deletion purges personal metadata in the lifecycle transaction; pending accounts
are immediately excluded from reads.

Focused verification covers SQL migration on an isolated database, publication
privacy, foreign selections, concurrent writes, status expiry, transfers,
deletion, image decoding, client validation and responsive browser flows.

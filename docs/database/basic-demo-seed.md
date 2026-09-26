---
title: 'Load demo events and challenges'
---

# Load demo events and challenges

The Basic demo seed is deliberately separate from the reusable card catalogue.
It creates the non-production event, challenge, event-state, and ordered-trail
fixtures needed to demonstrate the Basic player journey.
It also includes a placement-ready pool for the Author event-placement
workspace.

## Commands

Apply migrations and the reusable catalogue only:

```bash
npm run db:migrate:test --workspace @wits-world/api
npm run db:seed:test --workspace @wits-world/api
```

Apply the complete Basic demo fixture to a disposable test database:

```bash
npm run db:seed:test --workspace @wits-world/api -- --basic-demo
```

For an existing local development database, apply migrations first and then
explicitly opt into the same fixture:

```bash
npm run db:migrate --workspace @wits-world/api
npm run db:seed --workspace @wits-world/api -- --basic-demo
```

For a guarded release rehearsal, use the explicit demo flag:

```bash
npm run db:release --workspace @wits-world/api -- \
  --target test \
  --confirm-database <test-database-name> \
  --seed-basic-demo
```

The normal seed command does not publish event or challenge fixtures. The
legacy `--seed-demo-event` release flag remains accepted as an alias for
`--seed-basic-demo` while existing operator documentation is migrated.

## Seeded fixtures

| Fixture                               | Purpose                                                             |
| ------------------------------------- | ------------------------------------------------------------------- |
| Sprint 1 Demo - Wits Great Hall       | Published active event with the five-question challenge             |
| Basic Demo - Wits Library             | Second published active event for discovery and reachability checks |
| Basic Demo - Upcoming Campus Event    | Published upcoming state                                            |
| Basic Demo - Expired Campus Event     | Published expired state                                             |
| Basic Demo - Unpublished Campus Event | Unavailable/unpublished state                                       |
| Campus Highlights Trail               | Three playable, ordered stops for trail progress and nearby testing |
| Placement Demo events (6)             | Portable events for automatic placement preview and apply testing   |

The six `Placement Demo` events run from 1 September 2026 through 31 December 2099. Each is published, has a deterministic five-question challenge, remains
outside published trails, uses a 50-metre interaction radius, and has a
controlled-policy portability approval for `placement-v1`. Together they give
the placement planner enough eligible content to propose the policy target of
six assignments. Creating a preview remains non-destructive; the assignments
only become player-visible after an Author reviews and applies the plan.

The active Great Hall coordinate is used for the reachable location claim. A
clearly distant claim against that event demonstrates the too-far outcome. An
already-completed state is player-specific and is created in an isolated test
player rather than being inserted into the shared demo seed.

The Great Hall challenge contains five distinct published multiple-choice
questions. Each question has four choices, one private answer key, and a
nonblank post-completion explanation. The current questions use versioned IDs.
When upgrading a database that contains the original immutable published
fixtures, the seed inserts the replacements first and retires the original
question rows without deleting historical references. The server chooses and
snapshots the five questions; the seed does not expose answer keys through
player-facing data.

The Campus Highlights Trail is a long-lived local fixture with stable ID
`00000000-0000-4000-8000-000000000177`. It contains these published stops:

| Position | Event                      | Longitude | Latitude  |
| -------- | -------------------------- | --------- | --------- |
| 1        | Trail Demo - Great Hall    | 28.03038  | -26.19205 |
| 2        | Trail Demo - Library Lawns | 28.03120  | -26.19140 |
| 3        | Trail Demo - Senate House  | 28.03076  | -26.19083 |

For a new player, the first stop is current and the remaining stops are locked.
Each stop has a deterministic five-question challenge; the first choice is the
fixture answer. Completing the current event advances progress through the real
event-completion records and trail API. To exercise nearby discovery away from
campus, use browser developer tools to override the reported location with one
of the coordinates above. The API still performs its normal freshness,
accuracy, distance, and eligibility checks.

The fixture runs from 1 September 2026 through 31 December 2099 so it remains
available for local UI testing. It is deliberately labelled `Trail Demo` and
must not be treated as reviewed production content.

The base catalogue contains three Common Creature cards and two Common Power
cards for each of Wit, Grit, Spark, Spirit, and Mystic. It also contains cards
in every supported rarity so starter, deck, reward, and CPU catalogue checks
have deterministic inputs. The seeded Common cards have valid moves/effects
and form a five-card Basic deck with three Creatures and two Power cards.

## Trivia sources

The seeded questions are demonstration content and should be reviewed again
before production publication. Their source pages are official Wits domains:

- [Wits graduations](https://www.wits.ac.za/graduations/) supports the Great
  Hall/East Campus and graduation-ceremony questions.
- [The Great Hall](https://www.wits.ac.za/witstheatre/venues-and-bookings/the-great-hall/)
  supports the venue description.
- [Wits contact information](https://www.wits.ac.za/about-wits/contact-us/)
  supports the University of the Witwatersrand name and Johannesburg location.
- [Wits Kudu Card information](https://www.wits.ac.za/about-wits/visitor-information/access-to-campus/application--renewal-of-kudu-cards/)
  explicitly places Wartenweiler Library on East Campus.
- [Wits library contact information](https://www.wits.ac.za/library/contact-us/)
  supports the Wartenweiler Library contact entry.
- [Wits library services](https://www.wits.ac.za/library/)
  provides the public library context.

No third-party card artwork is included. Card image references remain empty in
the demo catalogue; the text description and gameplay data are the authoritative
display content.

## Verification

The database integration suite verifies that a clean database can be migrated,
seeded, and seeded again without duplicate fixture rows. It checks the event
states, five-question challenge structure, placement-ready portable pool, card
catalogue readiness, starter grant, Basic deck validation, reward catalogue,
and CPU match fixture path.

Do not run the Basic demo seed against production without an explicit release
decision. Never include database URLs, credentials, access tokens, or player
identity data in evidence.

The preceding document was planned, generated, and edited with the assistance
of Codex[GPT-5.6 Sol] and Codex-CLI[GPT-5]. The trail fixture was added for issue
`#177`.

Page title clarified with assistance from Codex-CLI[GPT-6].

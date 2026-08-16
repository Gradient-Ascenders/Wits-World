# Basic Demo Seed

The Basic demo seed is deliberately separate from the reusable card catalogue.
It creates the non-production event, challenge, and event-state fixtures needed
to demonstrate the Basic player journey.

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

The active Great Hall coordinate is used for the reachable location claim. A
clearly distant claim against that event demonstrates the too-far outcome. An
already-completed state is player-specific and is created in an isolated test
player rather than being inserted into the shared demo seed.

The Great Hall challenge contains five distinct published multiple-choice
questions. Each question has four choices and one private answer key. The
server chooses and snapshots the five questions; the seed does not expose
answer keys through player-facing data.

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
- [Wits library contact information](https://www.wits.ac.za/library/contact-us/)
  supports the Wartenweiler Library entry.
- [Wits library services](https://www.wits.ac.za/library/)
  provides the public library context.

No third-party card artwork is included. Card image references remain empty in
the demo catalogue; the text description and gameplay data are the authoritative
display content.

## Verification

The database integration suite verifies that a clean database can be migrated,
seeded, and seeded again without duplicate fixture rows. It checks the event
states, five-question challenge structure, card catalogue readiness, starter
grant, Basic deck validation, reward catalogue, and CPU match fixture path.

Do not run the Basic demo seed against production without an explicit release
decision. Never include database URLs, credentials, access tokens, or player
identity data in evidence.

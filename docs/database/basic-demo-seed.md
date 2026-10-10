---
title: 'Load demo data'
---

# Load demo data

For a current game walkthrough, load the sourced campus pack. The older Basic
demo pack remains available for fixture-based testing. Both are explicit
options; normal seeding only loads reference data.

Configure your database using [Neon and PostGIS](neon-postgis-setup.md) and run
the commands below from the repository root.

## Load the campus pack

```bash
npm run prepare:api
npm run db:migrate --workspace @wits-world/api
npm run db:seed --workspace @wits-world/api -- --verified-events
```

For a separate test database:

```bash
npm run db:migrate:test --workspace @wits-world/api
npm run db:seed:test --workspace @wits-world/api -- --verified-events
```

The current pack contains:

| Content       | Included                                                               |
| ------------- | ---------------------------------------------------------------------- |
| Campus events | 11 published events with sourced locations.                            |
| Challenges    | 6 multiple-choice and 5 ordering challenges, with 10 questions each.   |
| Trails        | East Campus Essentials, West Campus Discovery, and Arts and Community. |
| Campaign      | Campus Discovery: Spring 2026, covering the events and trails.         |

The events and campaign run from **1 September through 30 November 2026**,
ending at midnight on 1 December in South African time. The refresh creates
new versioned content rather than changing the dates of older published events.

There are 110 question rows representing 100 distinct question definitions:
MSL and Origins Centre reuse a discovery pool. Each attempt still selects
5 questions according to the normal challenge rules.

See [Campus events, questions and sources](verified-event-content.md) for the
full roster and review evidence.

## Use the Basic test fixtures

To load the separate, non-production fixture pack:

```bash
npm run db:seed --workspace @wits-world/api -- --basic-demo
```

Use `db:seed:test` instead for the test target. Apply migrations first.
The pack includes:

- the Campus Highlights trail with 3 challenge stops;
- 6 portable Placement Demo events with 5 multiple-choice questions each; and
- earlier Great Hall, Library, and event-availability fixtures.

The trail stops and placement events have September 2026–December 2099 windows.
The earlier published Basic events have July or August 2026 windows and are
expired, including the event named “Upcoming Campus Event”. Seeding does not
advance those dates or reactivate retired fixtures.

## What seeding changes

Both content flags also run the normal reference-data seeds. These supply
placement and territory catalogues and verify the card catalogue, which
migrations populate with **24 Creatures and 6 typeless Power cards**.

The packs do not create accounts, grant Author roles, or generate player
attempts, completions, or rewards. Sign in normally; location and progression
rules still apply.

Seeds live in `database/seeds/`, with separate `verified-events/` and
`basic-demo/` directories. Repeat runs use stable identifiers without creating
duplicates. Seeding is not a reset: it preserves player history, and the sourced
pack rejects conflicting existing definitions.

The `--verified-events` and `--basic-demo` flags cannot be combined in one
command. These commands target development or test data; production content
changes use the [database release procedure](database-release-procedure.md).

**AI declaration:** Prepared and updated with assistance from Codex[GPT-5.6 Sol],
Codex-CLI[GPT-5], Codex-CLI[GPT-6], and Codex[GPT-6].

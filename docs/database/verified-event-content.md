---
title: 'Campus events, questions and sources'
---

# Campus events, questions and sources

Issue `#165` supplies the sourced reference catalogue for Wits Quest. The current
forward-only v3 refresh publishes eleven campus events with one hundred ten
question rows: six multiple-choice challenges and five ordering challenges,
with ten questions and four choices/items per challenge. MSL and Origins Centre
reuse a discovery pool, so these represent one hundred distinct question
definitions rather than one hundred ten independent definitions.

The pack is separate from the Basic demonstration fixtures. It does not create
players, attempts, completions or matches. It publishes three ordered trails and
one scheduled campaign; rewards continue to
use the canonical published card catalogue and the server-owned score/rarity
policy.

## Applying the pack

Apply migrations first, then explicitly select the verified content pack:

```bash
npm run db:migrate --workspace @wits-world/api
npm run db:seed --workspace @wits-world/api -- --verified-events
```

For the isolated test target:

```bash
npm run db:migrate:test --workspace @wits-world/api
npm run db:seed:test --workspace @wits-world/api -- --verified-events
```

An authorised release uses the guarded database command and a separate content
decision:

```bash
npm run db:release --workspace @wits-world/api -- \
  --target production \
  --confirm-database <exact-database-name> \
  --seed-verified-events
```

`--seed-verified-events` cannot be combined with `--seed-basic-demo`. Normal
catalogue seeding does not install this event pack.

The pack is repeatable. Stable IDs are derived from versioned content keys, and
both content files run in one seed transaction. Transaction-local tables
capture challenge and question IDs returned by each `INSERT`. Only those rows
created by the current seed invocation can receive choices/items, private answer
relationships, controlled-seed provenance, version increments, or publication
updates.

A deterministic challenge or question that existed before the transaction is
never adopted by those setup or publication mutations. Before any nested setup,
the seed requires such a row to already match the complete final canonical state,
including its parent, content, lifecycle status and version, provenance, source
metadata, choices/items, and private answer/order relationships. A missing or
different canonical value raises an explicit conflict and rolls back the seed
transaction without changing the pre-existing row or unrelated authored content.
The final readiness comparison repeats the whole-pack canonical check before
commit. Re-running an unchanged canonical installation remains idempotent and
does not duplicate rows or relationships.

The final readiness assertion additionally requires all eleven current events,
eleven format-correct published challenges, one hundred ten structurally complete
published questions, three trails with eleven ordered stops, a canonical campaign,
sourced locations, private answer keys, and at least one
Common card satisfying the runtime reward-candidate predicate. The predicate is
the same one used by the challenge-completion finalizer: `is_active = true`,
`authoring_status = 'published'`, and `reward_eligible = true`. The pack does not
create or alter card definitions or add a separate event-to-card relationship.

## Structure and availability

All v3 events and their campaign run from 1 September 2026 until
`2026-12-01T00:00:00+02:00` (exclusive), keeping them available throughout
30 November in South African time. The campaign gives the trails an explicit
expiry too: standalone trails otherwise have no end date. These are game-content
windows, not evidence of historical participation or guarantees about building
opening hours.

Earlier v1 and v2 events/trails remain archived rather than being republished or
having their immutable dates changed. The v1 questions stay as a canonical source
catalogue for repeatable cloning; a published source question attached to an
unavailable parent event is not a player-available question. All new timeline
questions retain their original sources and add the checked
[official timeline mirror](https://giving.wits.ac.za/centenary-campaign/) where
their source catalogue previously pointed only to the centenary site.

| Event                       | Format   | Difficulty / selected time limit | State  | Location evidence                |
| --------------------------- | -------- | -------------------------------- | ------ | -------------------------------- |
| Great Hall Beginnings       | MCQ      | 1 / 90 s                         | Active | Great Hall                       |
| Cullen Library Heritage     | MCQ      | 1 / 90 s                         | Active | William Cullen Library           |
| Origins Centre Discoveries  | MCQ      | 2 / 120 s                        | Active | Origins Centre                   |
| School of Arts Culture      | MCQ      | 2 / 120 s                        | Active | Wits School of Arts              |
| Matrix Campus Life          | MCQ      | 3 / 150 s                        | Active | The Matrix                       |
| Digital Dome Early Years    | Ordering | 1 / 90 s                         | Active | Wits Anglo American Digital Dome |
| Science Stadium Milestones  | Ordering | 1 / 90 s                         | Active | Wits Science Stadium             |
| Art Museum Timeline         | Ordering | 2 / 120 s                        | Active | Wits Art Museum                  |
| Wits Club Public Life       | Ordering | 2 / 120 s                        | Active | Wits Club                        |
| Amphitheatre Modern Century | Ordering | 3 / 150 s                        | Active | Amphitheatre                     |
| MSL Science Challenge       | MCQ      | 2 / 120 s                        | Active | Mathematical Sciences Laboratory |

East Campus Essentials has four stops; West Campus Discovery has four, including
MSL; Arts and Community has three. Together they cover all eleven events once.
The campaign is `Campus Discovery: Spring 2026`. The targeted demo cleanup is an
operator-only maintenance file, not part of routine content seeding. It retires
protected fixture definitions and deletes unused drafts without deleting player
accounts, attempts, completions or rewards. See the
[production quality report](./data-quality-and-structure.md).

Every question in a challenge has the same difficulty. Therefore any random
five-question selection for that challenge deterministically exercises the
listed time-limit category while still selecting five distinct questions.

The fifty ordering questions use fifty globally unique four-milestone sets.
Their semantic uniqueness is based on normalized item membership, not display
prompt text. Forty-two sets use distinct consecutive ranges of the curated
timeline and eight use distinct spaced ranges; all retain strict chronological
answer order.

## Factual source evidence

Migration `0043_add_content_source_evidence.sql` adds constrained HTTPS
`source_urls` arrays to events and questions. Protected Author responses expose
those arrays and the Author detail screens render review links. Player event and
challenge responses do not select or serialize source metadata. Accepted MCQ
choices remain in `private.challenge_answer_keys`; ordering positions remain in
`private.challenge_ordering_answer_keys`.

The primary question source is the official
[Wits centenary timeline](https://wits100.wits.ac.za/). It supplies the dated
milestones used by the MCQs and all four positions of every ordering question.
Two subject areas use narrower primary sources:

- the [Wits Art Museum contact page](https://www.wits.ac.za/wam/contact-us/)
  supports the museum street-corner question; and
- the [Nobel Prize Sydney Brenner facts page](https://www.nobelprize.org/prizes/medicine/2002/brenner/facts/)
  supports the 2002 prize and category, while the
  [Wits Sydney Brenner exhibition article](https://www.wits.ac.za/news/latest-news/general-news/2024/2024-04/science-meets-history-at-adler-museum-of-medicine.html)
  independently establishes his Wits degrees and alumnus connection.

The ordering catalogue excludes the Champion Tree decade-only claim and the
multi-year Plein Square-to-Milner Park move. They are replaced by Wits'
documented 90th anniversary in 2012 and the explicitly dated 1 April 2014
launch of the Centre of Excellence in Mathematical and Statistical Sciences.
Ordering explanations retain the four exact evidence years used for each
answer sequence.

The original v1 source catalogue used ten distinct points and recorded at least
two review sources per event. Those archived locations were:

- Great Hall: official Braamfontein campus map plus its building record;
- William Cullen Library: official Wits Library listing plus its building
  record;
- Origins Centre: official visitor page plus its OpenStreetMap-derived point;
- Wits Art Museum: official contact page plus its building record;
- Facilities and Services Building: official Wits Procurement GPS directions
  plus the official West Campus map;
- Wits Anglo American Digital Dome: official visitor directions plus its
  building record;
- Oppenheimer Life Sciences entrance: official Wits handbook map with GPS
  coordinates plus the official Braamfontein map;
- Wits Theatre: its official physical-address/GPS page plus the official
  Braamfontein map;
- Adler Museum of Medicine: its official address/GPS page plus the official
  Parktown map; and
- Wits Business School: a Wits-hosted programme brochure containing its GPS
  coordinates plus the official Parktown map.

The current v3 locations are the eleven entries in the availability table above,
with their review URLs stored in the pack. The source arrays are review evidence,
not a claim that links will remain unchanged forever. For final acceptance,
another team member must
open every cited page, confirm the wording and full ordering evidence, verify
the eleven current map points/radii on site or against an approved geospatial
reference, and review player-facing presentation. Automated checks establish
shape, integrity, privacy boundaries, repeatability, and catalogue compatibility;
they do not complete this factual or presentation review.

## Verification

`verified-events-content.integration.test.ts` provisions an isolated database,
applies every migration, runs the pack twice, and verifies the required counts,
formats, four-item definitions, one hundred global semantic signatures, fifty
unique ordering sets, exact-year ordering explanations, explanations, HTTPS
source metadata, eleven distinct locations, availability states, private answer
keys, difficulty coverage, five-question non-repeating selection, and the
runtime-compatible reward catalogue. It also corrupts deterministic source
metadata and proves the rerun fails explicitly without changing unrelated
content; pre-creates plausible deterministic draft challenge/question collisions
before installation and proves they receive no publication, child, or private-key
mutations; and proves active/published but non-reward-eligible Common cards cannot
satisfy verified-event readiness.

It additionally verifies coverage by three ordered trails, campaign expiry at
the November/December boundary, and safe installation alongside retired v2
content with existing nested choice IDs. The targeted fixture-cleanup integration
suite verifies repeatable retirement/deletion without disabling history guards.
Executed local and Neon results are recorded in the
[production quality report](./data-quality-and-structure.md).

The preceding document and content pack were researched, generated, and edited
with the assistance of Codex[GPT-5].

Page title clarified with assistance from Codex-CLI[GPT-6].

The v3 refresh and cleanup documentation were edited with assistance from
Codex[GPT-5]; content/cleanup safety was reviewed with Codex-CLI[gpt-6-luna].

# Verified Wits Event Content

Issue `#165` supplies a production-shaped, independently reviewable Wits Quest
content pack. It contains exactly ten campus events and one hundred questions:
five multiple-choice challenges and five ordering challenges, with ten questions
and four choices/items per challenge.

The pack is separate from the Basic demonstration fixtures. It does not create
cards, campaigns, players, attempts, completions, or trails. Rewards continue to
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

The pack is repeatable. Stable IDs are derived from fixed content keys, and the
entire content file runs in one seed transaction. Transaction-local tables
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

The final readiness assertion additionally requires all ten events, all ten
format-correct published challenges, all one hundred structurally complete
published questions, sourced locations, private answer keys, and at least one
Common card satisfying the runtime reward-candidate predicate. The predicate is
the same one used by the challenge-completion finalizer: `is_active = true`,
`authoring_status = 'published'`, and `reward_eligible = true`. The pack does not
create or alter card definitions or add a separate event-to-card relationship.

## Structure and availability

The configured availability mix is evaluated against the issue implementation
review date, 10 September 2026. Active rows run until the end of 2099, upcoming
rows begin in 2100, passed rows ended in 2025, and unavailable rows retain valid
schedules but remain unpublished drafts. Campaign scheduling is deliberately
not added.

| Event                                | Format   | Difficulty / selected time limit | State       | Location evidence                  |
| ------------------------------------ | -------- | -------------------------------- | ----------- | ---------------------------------- |
| Wits Foundations Quest               | MCQ      | 1 / 90 s                         | Active      | Great Hall                         |
| Wits Campus Heritage Quest           | MCQ      | 1 / 90 s                         | Active      | William Cullen Library             |
| Wits Discovery Quest                 | MCQ      | 2 / 120 s                        | Active      | Origins Centre                     |
| Wits Arts and Culture Quest          | MCQ      | 2 / 120 s                        | Upcoming    | Wits Art Museum                    |
| Wits Civic and Alumni Quest          | MCQ      | 3 / 150 s                        | Upcoming    | Facilities and Services Building   |
| Ordering Wits: Early Years           | Ordering | 1 / 90 s                         | Passed      | Wits Anglo American Digital Dome   |
| Ordering Wits: Science and Discovery | Ordering | 1 / 90 s                         | Passed      | Oppenheimer Life Sciences entrance |
| Ordering Wits: Campus Culture        | Ordering | 2 / 120 s                        | Active      | Wits Theatre                       |
| Ordering Wits: Public Life           | Ordering | 2 / 120 s                        | Unavailable | Adler Museum of Medicine           |
| Ordering Wits: Modern Century        | Ordering | 3 / 150 s                        | Unavailable | Wits Business School               |

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

Each event uses a distinct point and records at least two review sources:

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

The source arrays are review evidence, not a claim that links will remain
unchanged forever. Before an approved production run, another team member must
open every cited page, confirm the wording and full ordering evidence, verify
the ten configured map points/radii on site or against an approved geospatial
reference, and review player-facing presentation. Automated checks establish
shape, integrity, privacy boundaries, repeatability, and catalogue compatibility;
they do not complete this factual or presentation review.

## Verification

`verified-events-content.integration.test.ts` provisions an isolated database,
applies every migration, runs the pack twice, and verifies the required counts,
formats, four-item definitions, one hundred global semantic signatures, fifty
unique ordering sets, exact-year ordering explanations, explanations, HTTPS
source metadata, ten distinct locations, availability states, private answer
keys, difficulty coverage, five-question non-repeating selection, and the
runtime-compatible reward catalogue. It also corrupts deterministic source
metadata and proves the rerun fails explicitly without changing unrelated
content; pre-creates plausible deterministic draft challenge/question collisions
before installation and proves they receive no publication, child, or private-key
mutations; and proves active/published but non-reward-eligible Common cards cannot
satisfy verified-event readiness.

The preceding document and content pack were researched, generated, and edited
with the assistance of Codex[GPT-5].

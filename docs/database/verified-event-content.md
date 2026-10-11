---
title: 'Campus questions and sources'
---

# Campus questions and sources

The reference campus catalogue defines **11 events**, each with a published
challenge and a pool of **10 questions**. It contains **6 multiple-choice**
and **5 ordering** challenges.

There are **110 question rows representing 100 distinct definitions**.
Origins Centre and MSL reuse the same discovery pool in separate event
contexts. A started challenge snapshots 5 selected questions; multiple-choice
questions and ordering questions each use 4 choices or items.

## Catalogue

| Event                       | Format          | Difficulty / time limit | Location                         |
| --------------------------- | --------------- | ----------------------- | -------------------------------- |
| Great Hall Beginnings       | Multiple choice | 1 / 90 seconds          | Great Hall                       |
| Cullen Library Heritage     | Multiple choice | 1 / 90 seconds          | William Cullen Library           |
| Origins Centre Discoveries  | Multiple choice | 2 / 120 seconds         | Origins Centre                   |
| School of Arts Culture      | Multiple choice | 2 / 120 seconds         | Wits School of Arts              |
| Matrix Campus Life          | Multiple choice | 3 / 150 seconds         | The Matrix                       |
| Digital Dome Early Years    | Ordering        | 1 / 90 seconds          | Wits Anglo American Digital Dome |
| Science Stadium Milestones  | Ordering        | 1 / 90 seconds          | Wits Science Stadium             |
| Art Museum Timeline         | Ordering        | 2 / 120 seconds         | Wits Art Museum                  |
| Wits Club Public Life       | Ordering        | 3 / 150 seconds         | Wits Club                        |
| Amphitheatre Modern Century | Ordering        | 3 / 150 seconds         | Amphitheatre                     |
| MSL Science Challenge       | Multiple choice | 2 / 120 seconds         | Mathematical Sciences Laboratory |

Questions within each challenge share a difficulty, so random selection keeps
that challenge's time limit consistent. The ordering pools contain **50 distinct
4-item milestone sets**, with chronological answer order.

The catalogue uses the normal reward policy and published card definitions.
It does not define separate card rewards for individual events.

## Trails and schedule

The campaign **Campus Discovery: Spring 2026** groups these events and
3 ordered trails:

| Trail                  | Stops |
| ---------------------- | ----- |
| East Campus Essentials | 4     |
| West Campus Discovery  | 4     |
| Arts and Community     | 3     |

Together, the trails include all 11 events. The configured event and campaign
window begins on **1 September 2026** and ends at
**00:00 on 1 December 2026, Johannesburg time**, excluding that end instant.

These are content schedules. Actual discovery also depends on publication and
availability. A content window does not describe a building's opening hours.
Earlier catalogue versions remain historical records; their dates and
completed attempts are not rewritten.

## Source metadata

Events and questions store their supporting links in `source_urls`. Author
detail views expose these links for review. Player-facing responses omit source
metadata, and active attempts do not expose answer keys.

The question catalogue draws primarily on the
[Wits centenary timeline](https://wits100.wits.ac.za/), with the
[Wits centenary campaign page](https://giving.wits.ac.za/centenary-campaign/)
retained as an additional timeline reference. Specific subject sources include
[Wits Art Museum contact information](https://www.wits.ac.za/wam/contact-us/),
[the Nobel Prize Sydney Brenner facts page](https://www.nobelprize.org/prizes/medicine/2002/brenner/facts/),
and [Wits' Sydney Brenner exhibition article](https://www.wits.ac.za/news/latest-news/general-news/2024/2024-04/science-meets-history-at-adler-museum-of-medicine.html).

Location metadata uses Wits campus maps, official visitor or contact pages,
and mapped building references. These sources support content and point review;
they do not establish a completed physical site visit.

Correct-choice references and ordering positions remain in private marking tables. The API
reveals review information after completion, using the attempt's saved question
snapshots. See [challenge storage](challenge-reward-persistence-design.md) and
[Author questions](../architecture/author-curation-api-contract.md).

**AI declaration:** Prepared and updated with assistance from Codex[GPT-5],
Codex-CLI[GPT-6], Codex-CLI[gpt-6-luna], and Codex[GPT-6].

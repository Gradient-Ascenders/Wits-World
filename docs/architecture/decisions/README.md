# Architecture Decision Records

## Purpose

Architecture Decision Records document significant technical choices made during
the Wits World project.

Each record explains:

- the context that required a decision;
- the selected approach;
- the reasons for the choice;
- its consequences;
- alternatives considered; and
- any related follow-up work.

Decision records should describe why a choice was made rather than only listing
the selected technology.

## Current records

| Record                                        | Decision                                                 |
| --------------------------------------------- | -------------------------------------------------------- |
| [ADR-001](./ADR-001-monorepo.md)              | Use a monorepo with independently buildable applications |
| [ADR-002](./ADR-002-separate-web-api.md)      | Keep the web application and API separate                |
| [ADR-003](./ADR-003-postgresql-postgis.md)    | Use PostgreSQL and PostGIS for authoritative event data  |
| [ADR-004](./ADR-004-map-provider-boundary.md) | Keep map integration presentation-only                   |

## Planned records

Additional decision records should be created when the following choices are
resolved:

- authentication provider;
- web and API hosting;
- managed PostgreSQL/PostGIS hosting;
- documentation hosting;
- map tile and style provider;
- database access and migration implementation;
- role and permission representation;
- location-data retention;
- card and battle rules; and
- production observability.

## File naming

Use the following format:

`ADR-NNN-short-decision-name.md`

Numbers are assigned sequentially and must not be reused.

## Record structure

Each record should contain:

1. title;
2. status;
3. date;
4. owners and reviewers;
5. context;
6. decision;
7. reasons;
8. consequences;
9. alternatives considered;
10. related work; and
11. AI-use declaration.

## Status values

Use one of the following:

- `Proposed`
- `Accepted`
- `Superseded`
- `Deprecated`

A superseded decision must link to the record that replaces it.

Decision records should not be rewritten to hide historical choices. Minor
clarifications may be added, but a material change should normally create a new
record.

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking].

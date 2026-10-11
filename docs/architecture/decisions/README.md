---
title: 'Architecture decisions explained'
---

# Architecture decisions explained

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

| Record                                             | Decision                                                      |
| -------------------------------------------------- | ------------------------------------------------------------- |
| [ADR-001](./ADR-001-monorepo.md)                   | Use a monorepo with independently buildable applications      |
| [ADR-002](./ADR-002-separate-web-api.md)           | Keep the web application and API separate                     |
| [ADR-003](./ADR-003-postgresql-postgis.md)         | Use PostgreSQL and PostGIS for authoritative event data       |
| [ADR-004](./ADR-004-map-provider-boundary.md)      | Keep map integration presentation-only                        |
| [ADR-005](./ADR-005-auth0-authentication.md)       | Use Auth0 for authentication                                  |
| [ADR-006](./ADR-006-poor-gps-presence-fallback.md) | Propose a physical QR fallback for poor GPS, pending approval |

Cross-cutting Basic product decisions and unresolved implementation gates are
tracked in the
[Basic-tier decision register](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/docs/requirements/basic-tier-decision-register.md).

## Potential future records

The current Azure Web/API hosting, Neon database hosting, and Cloudflare Pages
documentation hosting are established in deployment documentation and workflow
configuration, but do not have dedicated accepted ADRs. Create a new ADR if the
team needs to formalise or materially change those choices. Other potential
records include:

- current Web/API hosting and deployment architecture;
- managed Neon PostgreSQL/PostGIS hosting;
- Cloudflare Pages documentation hosting;
- Mapbox operational governance if its licensing, cost, privacy, token, usage,
  or campus-data boundary changes materially;
- location-data retention;
- production observability; and
- backup, recovery, and operational resilience.

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

The preceding document was planned and generated with the assistance of
ChatGPT-Web[GPT-5.6 Thinking], and reviewed and edited for Sprint 1 release
validation with assistance from ChatGPT-Web[GPT-5.6 Sol] and Codex[GPT-5].

The potential-record list was reconciled with the confirmed Basic role decision
with assistance from Codex[GPT-5].

Page title clarified with assistance from Codex-CLI[GPT-6].

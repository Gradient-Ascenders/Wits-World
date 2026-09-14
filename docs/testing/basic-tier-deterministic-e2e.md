---
title: 'Basic game end-to-end tests'
---

# Basic game end-to-end tests

`npm run test:e2e:basic` is the repeatable release journey for the Basic tier.
It requires `TEST_DATABASE_URL` to identify a disposable PostgreSQL/PostGIS test
database. The runner migrates that database, applies the deterministic Basic
fixture, creates a unique player/Author identity for the run, starts the real
Fastify API and Vite application, and executes one Playwright scenario.

The scenario contains exactly 21 named `test.step` blocks. They cover identity
and role resolution, discovery and map-independent presentation, authoritative
eligibility, challenge start and five answers, hidden active answers, marking,
completion review, retry-safe rewards, collection, starter cards, a legal saved
and active deck, a server-created CPU battle through completion and history,
protected Author publication through real APIs, and responsive/keyboard/error
checks.

These steps decompose executable evidence for the existing Basic requirements.
They are not 21 separately stakeholder-approved product requirements, and each
step name is intentionally limited to the assertions made in that block.

Determinism is controlled through a fixed clock, seeded content, stable reward
and CPU selection, and a unique run identity. Browser requests cross the real
HTTP and database boundaries. The local bearer token verifier and Mapbox module
are controlled substitutes: the scenario makes no Auth0 or Mapbox network call
and does not prove production tenant, DNS, provider, or deployment behavior.

The scenario source is `apps/web/playwright/basic.deterministic.spec.ts`; its
API harness is `apps/api/e2e/basic-server.ts`. A passing result is executable
Basic integration evidence, not manual accessibility, external-service
acceptance, gameplay-balance approval, or production smoke evidence.

The preceding document was generated, edited, and reviewed with the assistance
of Codex[GPT-5] and ChatGPT-Web[GPT-5.6 Sol].

Page title clarified with assistance from Codex-CLI[GPT-6].

---
title: Sprint 3 Planning
sidebar_position: 1
---

# Sprint 3 Planning

**Date:** 28 September 2026 snapshot; work window 16–28 September.

> Repository evidence; ceremony occurrence, attendance, and agreement were not recorded.

[Read the complete sprint report](report.md).

## Meeting photo

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-3/daily-scrum-01.png" aria-label="Open full-size photo: Sprint 3 supplied team-call photo 1">
    <img
      src="/img/scrum/sprint-3/daily-scrum-01.png"
      alt="Sprint 3 supplied team-call photo 1"
      width="1672"
      height="941"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Supplied Sprint 3 photo 1, displayed with planning.</figcaption>
</figure>

Photo placement follows the supplied order for presentation; its meeting date
and association with this record are unconfirmed. See the
[photo provenance and layout](../index.md#sprint-3-photo-provenance).

## Sprint Goal

Extend Wits World's multiplayer and competitive foundation: live PvP, trust
review, placement, ranked seasons, territories, card trading, analytics, and
developer API. Improve usability, accessibility, performance, and responsive
work while separating implementation from release evidence. Randomized
territories and Upstash shared limits remain proposed, not delivered.

## Agenda

Organise the Advanced increment around contracts, persistence, services, and client integration. Review dependencies, open release evidence, and feedback follow-up. This agenda summarises the planning topics visible in the repository; it is not a recorded meeting agenda.

## Discussion Summary

### Planning basis

- `main` at `c0fd42b` is the comparison point; merges show integration, not
  production acceptance.
- Policy/contract work includes #281, #282, #286, #289, #290, and #292;
  persistence and runtime/API slices include #283, #285, and #287-#301.
- Player and operator-facing integrations include #317-#329. Individual PRs
  and current tracker records remain the authority for exact scope and status.
- Stakeholder interactions dated 21, 23, and 25 September are documented as
  **planned** in [their records](../../stakeholder-interactions/index.md); this
  Scrum snapshot does not claim they occurred.

### Progress by stream

- **Player experience:** merged work covers battle UI (#318), territory UI
  (#319), ranked UI (#321), trade UI (#324), decks/leaderboard (#325), and
  responsive polish (#328).
- **Backend/security:** reviewed merges cover live PvP (#285), trust services
  (#293), placement (#294), ranked (#295), trade APIs (#301), analytics APIs
  (#302), developer API (#304), and trust review APIs/runtime (#320, #326).
- **Data/integration:** merge subjects include live persistence (#283), placement
  persistence (#287), trust persistence (#288), ranked persistence (#291),
  territory (#298-#299), and trade persistence (#300).
- **Quality/content/delivery:** the window also includes accessibility (#306),
  author workflow (#315, #317), evolution correction (#313), performance
  (#327), responsive polish (#328), and account purge (#329).

### Coordination and dependencies

Policies and contracts provide shared boundaries for persistence, service, and
UI work. Follow each PR for actual dependencies. Keep transactions, authority,
reconnect/deadline behaviour, public-data filtering, accessibility, and
migration compatibility visible across layers.

### Impediments and open evidence

- No named deployment, stakeholder acceptance, or manual release validation
  is established by merge history.
- Feedback needs investigation and retest; related merges are not proof of fix.
- Randomized territories and Upstash shared quotas are not implemented.
- Backlog assignments and ceremony dates/attendance are not inferred.

## Key Decisions

- Keep protected state and transactions server-authoritative.
- Keep implementation evidence separate from release acceptance.
- Keep territory randomization and Upstash shared quotas proposed until verified.

These are documented scope boundaries, not a claim of meeting decisions.

## Task Allocation {/* #coordination-streams */}

- **Product and player experience** — **Coordination owner:** Kevin, frontend; **Scope visible in the repository:** Battle, ranked, territory, trading, deck/leaderboard, and responsive interfaces
- **API and security** — **Coordination owner:** Tyron, backend; **Scope visible in the repository:** Live gateway, trust, placement, ranked, trade, analytics, and developer API services
- **Data and cross-stack integration** — **Coordination owner:** Uzair, database + cross-stack; **Scope visible in the repository:** Persistence, policy integration, territory/trade state, account purge and cross-layer coordination
- **Quality, content, and delivery support** — **Coordination owner:** Caleb; **Scope visible in the repository:** Review evidence, test/quality follow-up, accessibility and delivery coordination

Role context does not assert issue assignment, individual contribution, or
ceremony attendance.

## Action Items {/* #next-actions */}

- Reconcile deliverables with issue/PR acceptance criteria and live status.
- Record release checks against a named revision and environment.
- Link feedback investigation, accepted work, implementation, and retest.
- Keep territory randomization and distributed limits proposed until verified.

## Record Details and Sources

- **Snapshot:** 28 September 2026
- **Scope window:** Merged work from 16-28 September against `main` at `c0fd42b`
- **Participants:** Not recorded; roles below are coordination context only
- **Sources:** Merge history, repository docs, planned stakeholder records, feedback report

## AI declaration

This planning snapshot was drafted with assistance from Codex-CLI[gpt-6-luna]
and reviewed and edited with Codex-CLI[gpt-6-sol], using local repository
history and documentation. It does not represent a meeting record.

Layout and section structure revised with assistance from Codex[GPT-6], using `vitaqsprint.pdf` as the presentation reference.

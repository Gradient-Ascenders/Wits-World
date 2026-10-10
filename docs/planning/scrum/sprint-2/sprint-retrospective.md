---
title: Sprint 2 Retrospective
sidebar_position: 8
---

# Sprint 2 Retrospective

**Date:** 15 September 2026.

[Read the complete sprint report](report.md).

## What Went Well

- The team delivered independently reviewable vertical slices across all four
  workstreams instead of concentrating the sprint in one large branch.
- Server authority remained intact while the product expanded into movement
  checks, progression, evolution, trails, asynchronous PvP, curation,
  campaigns, and analytics.
- Contract-first work for ordering challenges and asynchronous PvP reduced the
  risk of incompatible Web, API, and database assumptions.
- Review findings were acted on repeatedly before merge, including migration
  upgrade compatibility, transactional evolution, sanitised match history, and
  CI reliability.
- Three stakeholder interactions were evaluated and linked to implemented or
  rejected alternatives.
- Formal user feedback produced five Gitea issues and immediate work on the
  highest-impact battle authority, latency, and clarity findings.
- Automated verification expanded from normal PR checks to database/package,
  nightly, release, and E2E workflows with improved failure diagnostics.
- The team completed substantial production content: a 30-card catalogue with
  artwork and ten events with one hundred verified questions.

## What Did Not Go Well {/* #what-could-improve */}

- The sprint scope was very broad. Feature throughput outpaced final deployed,
  participant, accessibility, and field validation, leaving #167 and #186 open
  near the milestone boundary.
- Formal user testing happened late, leaving little time for participant
  retests and for complete integration of #243 and #244.
- Several planned issues (#179-#186) lacked Sprint 2 milestone metadata, making
  the live milestone an incomplete view of the planned sprint.
- Some dependency links initially represented preferred order rather than true
  blockers, increasing avoidable waiting between team members.
- Neon compute, database test duration, deployment failures, and migration
  conflicts consumed integration time that earlier operational checks could
  have exposed.
- UI clarity work followed implementation. Turn ownership, effect outcomes,
  deck requirements, and first-time journey guidance should be acceptance
  criteria when the feature is first sliced.
- Ceremony evidence still had to be assembled from repositories and trackers;
  recording concise checkpoints as work happens would be cheaper and stronger.

## Lessons Learned

- Plan validation and participant retests alongside implementation.
- Use dependencies for actual blockers and keep milestone/board metadata complete.
- Rehearse migration upgrades and operational checks before the release window.
- Include turn, effect, deck, error, and recovery clarity in feature acceptance criteria.

## Action Items for Sprint 3 {/* #sprint-3-improvement-actions */}

- **Close validation before adding another broad feature wave** — **Owner:** Product/quality lead with all owners; **Acceptance evidence:** #167 and #186 contain a named revision, environment, exact checks, manual results, known limitations, and closure review
- **Run usability checks during feature development** — **Owner:** Product/Web lead; **Acceptance evidence:** At least one mid-sprint task session, sanitised finding, decision, issue/PR link, and follow-up result
- **Keep issue metadata complete** — **Owner:** Issue creator and sprint coordinator; **Acceptance evidence:** Every sprint issue has milestone, project column, owner, reviewer, estimate, priority labels, and only true native dependencies
- **Record Scrum checkpoints contemporaneously** — **Owner:** Sprint coordinator; **Acceptance evidence:** Dated planning, coordination, Review, and Retrospective notes linked during the sprint
- **Add release-like performance smoke evidence** — **Owner:** API and quality leads; **Acceptance evidence:** Named environment measurements for identity, battle action, and history paths with authority regressions still passing
- **Rehearse existing-database migrations before merge** — **Owner:** Data lead and reviewer; **Acceptance evidence:** Clean and upgrade-path migration checks for schema/content changes that affect existing rows
- **Make clarity part of feature acceptance** — **Owner:** Product/Web and API owners; **Acceptance evidence:** Turn, effect, validation, empty, error, and recovery states covered in the issue and reviewed with the integrated API response

## Follow-up

### Measures to inspect next

- Whether #167 and #186 close before new milestone scope expands.
- Whether every accepted user finding has both implementation and retest
  evidence.
- Whether Sprint 3 issues have complete milestone/board metadata.
- Whether CI/deployment/database failures are detected before the final release
  window.
- Whether the next Review and Retrospective are committed at the time they
  occur.

### Retrospective conclusion

Sprint 2 demonstrated strong engineering delivery and meaningful feedback
integration. The main process correction is to move validation and evidence
earlier, narrow simultaneous work, and make the live tracker accurately reflect
the whole planned sprint.

## Record Details and Sources {/* #record-status */}

- **Retrospective date:** 15 September 2026
- **Participants:** Kevin Ebrahim, Tyron Van Tonder, Uzair Mahomed, Caleb Perumalsamy
- **Inputs:** Sprint goal, issue/PR history, CI/deployment work, three stakeholder records, ten user responses, and open validation gates
- **Overall result:** Strong implementation throughput with release, retest, and tracker-hygiene work still open

This Retrospective turns the Sprint 2 delivery evidence into concrete process
improvements and records team-level themes and actions.

## AI declaration

This Sprint 2 Retrospective record was generated with assistance from
Codex-CLI[gpt-5.6-sol medium] using repository, Gitea, stakeholder, and user-testing evidence.

Navigation titles and documentation integration updated with assistance from
Codex-CLI[GPT-6].

Layout and section structure revised with assistance from Codex[GPT-6], using `vitaqsprint.pdf` as the presentation reference.

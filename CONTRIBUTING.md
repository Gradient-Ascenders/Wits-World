# Contributing to Wits World

This guide defines the shared development workflow for the Wits World monorepo,
the project repository for the Wits Quest game/topic.

Use **Wits World** when referring to the project, repository, or development
workspace. Use **Wits Quest** when referring to the game/topic itself.
Issue-specific acceptance criteria and repository `AGENTS.md` instructions take
precedence where they are more specific.

## Prepare the repository

Use Node.js 24.14.1 and npm 11.18.0. With nvm installed, a clean setup is:

```bash
git clone https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World.git
cd Wits-World
nvm install
nvm use
npm ci
```

Use `npm ci` for reproducible installs. Change dependencies with npm so that
`package.json` and `package-lock.json` remain synchronized. Do not replace the
package manager or lockfile without an approved project decision.

## Work from an issue

1. Read the complete Gitea issue, comments, dependencies, and acceptance criteria.
2. Create a short-lived branch from the current `main` branch.
3. Comment on the issue with the branch, planned outcomes, and verification.
4. Keep changes inside the issue boundary and coordinate cross-role decisions.
5. Open a small pull request that links the issue and records verification evidence.

Use descriptive branch names such as `feat/campus-map` or
`fix/geolocation-denied-state`. Do not work directly on `main` or merge your own
pull request.

The public [Work Tracking & Issue Management](docs/planning/work-tracking-and-issue-management.md)
guide explains the shared feature/bug lifecycle, tracker fields, labels,
milestones, project board, CI/review boundary, and known historical evidence
gaps.

## Follow the shared standards

- Write TypeScript with the strict options inherited from `tsconfig.base.json`.
- Run ESLint and Prettier through the root npm scripts.
- Keep application code in its matching `apps/*` workspace.
- Put genuinely shared code in a focused `packages/*` workspace only when an issue
  requires it; avoid speculative abstractions.
- Load local configuration from ignored `.env` files. Commit safe placeholders in
  `.env.example` files and never commit credentials or tokens.
- Add proportionate automated tests for meaningful behavior changes.

Run the full local verification set before committing:

```bash
npm run format:check
npm run lint
npm run type-check
npm test
npm run build
```

Application checks can also run independently, for example:

```bash
npm test --workspace @wits-world/web
npm run build --workspace @wits-world/api
```

## Create coherent commits

Review both the unstaged and staged changes, stage files selectively, and verify
that no secrets or unrelated changes are included. Commit subjects must use one
of the approved prefixes:

```text
[feat] add event eligibility display
[fix] handle denied geolocation permission
[test] cover stale location response state
[docs] document Sprint 1 player journey
[perf] reduce Battles landing requests
[ci] enforce API-first Battles releases
[refactor] isolate event status presentation
[chore] configure front-end quality checks
```

Every commit containing AI-generated code must include an accurate extended
attribution message naming every tool and model that materially contributed:

```text
[chore] configure shared development standards

Assisted-by: Codex-CLI[gpt-5.6-sol medium]
```

Do not copy the example attribution when a different tool or model performed the
work. Submission-facing documents created, planned, reviewed, or edited with AI
must also include an accurate declaration in the document.

## Maintain documentation

Documentation is part of the change when behaviour, API contracts, schema,
setup, deployment, tests or confirmed product decisions change. Before editing,
read the affected canonical document and the
[documentation-site maintenance guide](docs/development/documentation-site.md).

1. Update the existing reference first. Create a new page only for a distinct
   reader need; do not create a page for every component, migration or PR.
2. Search related summaries, requirements and runbooks for claims made stale by
   the change. Reconcile those current claims with the implementation and
   approved decisions; keep historical records dated rather than rewriting them.
3. Place public pages under `docs/` and add each new Markdown/MDX document once
   to the reader-focused navigation in `apps/docs/sidebars.ts`. Update references
   when removing or renaming a page and preserve established public URLs.
4. Record evidence with its date, revision, environment, result and source.
   Separate planned work, implemented behaviour, executed checks and acceptance.
   Issue closure, a template, or a successful deployment is not a participant retest.
5. Add accurate AI attribution, run the guide's proportionate checks, and report
   what remains unverified. Do not weaken the navigation coverage test to hide
   missing pages.
6. State whether the update is local, committed, pushed, merged or deployed.
   The public site updates through the docs workflow after relevant changes
   reach `main`; a local build does not publish anything. Commit, push and merge
   only within the user's authorisation.

## Prepare the pull request

Complete the repository pull-request template. Link the issue, explain the
problem and approach, list commands actually run, distinguish outstanding manual
checks, and record accessibility, documentation, API, schema, and AI impacts.
Do not mark the issue done until the change is merged and required verification
is complete.

The preceding document was generated and edited with the assistance of:
Codex-CLI[gpt-5.6-sol medium] and Codex[GPT-5].

Documentation workflow added with assistance from Codex-CLI[GPT-6].

Commit-prefix guidance updated with assistance from Codex[GPT-6].

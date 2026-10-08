---
title: 'CI workflows'
description: Pull-request validation, main-branch checks, coverage reports, and deployment boundaries.
---

# CI workflows

Wits World uses Gitea Actions to validate changes and publish the applications
and documentation. Pull-request checks and production deployment use separate
workflows.

## Workflows and triggers

| Workflow                                          | Trigger                                                           | Purpose                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Pull Request Validation** (`pr-validation.yml`) | Pull requests targeting `main`, or a manual run                   | Validate the candidate without deploying it                        |
| **Continuous Integration** (`ci.yml`)             | Pushes to `main`, or a manual run                                 | Validate the revision and deploy affected applications from `main` |
| **Deploy Documentation** (`docs-deploy.yml`)      | Documentation-related pushes to `main`, or a manual run on `main` | Build and publish the documentation to Cloudflare Pages            |

The workflow definitions live in `.gitea/workflows/`. Node is selected from the
repository's `.nvmrc`, and dependencies are installed from the npm lockfile.

## Pull-request validation

Five validation jobs run independently:

| Category            | Checks                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Static analysis     | Formatting, linting, and TypeScript checks                                                 |
| Tests and coverage  | Web, full API unit/PostGIS coverage, documentation, account-policy, and game-rules tests   |
| Database validation | Migrations and integration tests with PostGIS, plus PostgreSQL/Redis gameplay coordination |
| Browser validation  | The Basic integrated journey and Explore, Author, and Account experience regressions       |
| Builds              | Production Web, API, and documentation builds                                              |

The final validation job succeeds only when all five categories succeed. Failed,
cancelled, or skipped dependencies cannot produce a successful aggregate result.
Full API coverage, database validation, and Basic browser jobs each have
a separate disposable PostGIS service.

Suite behaviour and local commands are covered in
[Test suites](automated-verification.md); test-layer choices are
covered in [Testing strategy](testing-strategy.md).

## Automatic selection boundaries

The PR browser gate runs the Basic suite and the combined Explore, Author, and
Account experience suites. Dedicated battle, trading, profile, collection,
starter, offline, typography, frame, loading, and feedback configurations are
selected separately; their presence in the repository does not make them PR gates.
Focused trail cases are included through Explore.

The standalone database runner has an explicit selection list. Full API coverage
also enables the opt-in database tests, including profile and developer-API
persistence tests omitted from that runner's list. Gameplay coordination with
Redis is added separately by the PR database job. The
[suite catalogue](automated-verification.md) records these selection boundaries.

The root-level deployment-guard test command is part of `npm test`. The workflows
call workspace coverage commands directly, so they do not automatically run that
root-only command. Web static-server tests are included by the Web test and
coverage scripts. Real Auth0 smoke checks remain separate from the PR workflow.

## Main-branch validation and deployment

The main workflow runs static analysis, tests with coverage, and builds before
application deployment. Its API coverage includes real PostgreSQL/PostGIS
integration tests using an isolated service. The separate database/Redis gate
and browser suites remain PR checks and are not repeated on main.

Application change detection determines whether fresh Web or API deployment
artifacts are needed. Artifacts are tied to the checked-out commit and verified
before deployment. Deployment jobs check that the revision is still current
`main` before changing production; superseded runs skip those changes.

Affected applications deploy to Azure and run health checks afterward. A green
validation result and a successful deployment are separate outcomes. Application
setup is described in [Azure deployment](../deployment/azure-deployment-setup.md).

## Coverage and verification reports

The test job collects coverage for each application and shared package and
enforces its configured thresholds. PR and main API jobs use
`npm run validate:api:coverage:full`; local profile choices are described in
[Coverage profiles](testing-strategy.md#coverage-profiles). Reports are uploaded as `coverage-reports`.
After successful main validation, the combined line-coverage badge is published
separately. Pull requests provide reports without updating the live badge.

The Basic browser job also uploads a sanitised verification summary, including
failure diagnostics when available. Associate each result with the tested commit;
an older successful run does not validate a newer revision.

## Documentation publishing

The documentation workflow responds to changes in the documentation sources,
site workspace, shared package metadata, Node version, or its own workflow file.
Unrelated application-only changes do not trigger it.

It builds the Docusaurus site and deploys it to Cloudflare Pages from `main`.
The authoring and publishing process is covered in
[Update and publish documentation](../development/documentation-site.md).

AI declaration: Rewritten with assistance from Codex[GPT-6].

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

The root-level `npm run test:deployment` checks deployment guards and workflow
ordering. Both PR and main coverage jobs run it explicitly before workspace
coverage. Web static-server tests are included by the Web test and
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

Affected applications deploy to Azure and run health checks afterward. Web
publication requires successful same-commit API publication and contract checks;
Web-only changes also build and publish the API. A green
validation result and a successful deployment are separate outcomes. Application
setup is described in [Azure deployment](../deployment/azure-deployment-setup.md).

### API-first Battles contract gate

`deploy-web` depends on successful completion of `deploy-api`. The API job exports
`published_sha` only after its actual Azure ZIP publication succeeds, and exports
`api_origin` only after successful production health verification. A successful
job that skipped publication has no publication output and cannot authorize a
required web release.

Before publishing the web ZIP, `scripts/verify-battles-summary-contract.mjs`
requires same-commit API publication and a frontend API base using the published
App Service origin with `/api/v1`. It verifies public OpenAPI schemas for both
compact Battles response profiles, then anonymously requests
`/api/v1/matches/cpu/entry?view=summary` and
`/api/v1/matches/history?view=summary&limit=5`. Both must return
`401 UNAUTHORIZED`: query validation precedes authentication, so the old API
rejects these parameters with 400. Requests omit credentials, follow no redirects,
and perform no gameplay or identity database reads. The guard uses at most three
attempts, ten seconds per request and five seconds between attempts. Failures
block publication without logging response bodies or upstream error details.
The current-main check still runs after the contract gate, immediately before
Azure web mutation.

A healthy `/health` response does not establish that `/documentation/json` works.
If the contract request fails, check that public endpoint as well as the two
anonymous summary requests before retrying deployment. Schema-less routes such
as `GET /api/v1/profiles/me` must not crash the OpenAPI rate-limit transform. The
API regression tests cover a schema-less route and run the release guard with
the real profile routes registered, without calling profile or gameplay services.

API artifact creation and deployment both include all existing web release
inputs. Normal web-only pushes thus build and publish the same-commit API ZIP
before automatic web publication, even when the API source is unchanged. These
releases incur the normal API recycle and retain all existing database release
protections, including production host/database confirmation, tracked migrations,
no seed flags and current-main checks. API-only pushes still skip unnecessary web
artifacts and publication. Unexpected API skips still block required web
publication. The existing manual main workflow dispatch retains its normal
both-artifact release behavior. Web filters and other release steps are unchanged.
Custom frontend API aliases fail closed; this gate does not establish that an
alias points to the published App Service. Publication outputs and public
contracts do not prove the running process SHA or account-specific database
correctness; retain authenticated post-deployment functional verification.

Both main and PR coverage jobs run `npm run test:deployment`, including gate and
workflow-order regressions. A focused API integration also checks the guard
against actual OpenAPI responses and anonymous route handling without accessing
gameplay state.

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

AI declaration: Rewritten with assistance from Codex[GPT-6]. Release-gate
updates also used Codex[GPT-5] and Codex[gpt-6-luna].

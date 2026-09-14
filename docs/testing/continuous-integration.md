# Continuous Integration

Wits World uses Gitea Actions for pull-request validation, main-branch
validation and deployment, and documentation deployment.

CI is one gate in the documented
[issue-to-merge workflow](../planning/work-tracking-and-issue-management.md).
The current `main` protection requires one approval but does not enforce
required status checks mechanically, so reviewers must confirm the relevant
workflow passed rather than treating an available merge action as evidence.

## Workflows and triggers

The workflows are separated by event so pull requests have no dependency on
the deployment runner:

| Workflow                                       | Trigger                                 | Responsibility                                                                                                                                                                                             |
| ---------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/.gitea/workflows/pr-validation.yml`          | Pull requests targeting `main`          | Runs repository/application/shared-package validation plus migration and database integration against an isolated PostGIS service; plus Basic Playwright E2E in a separate isolated PostGIS job; no Azure. |
| `/.gitea/workflows/automated-verification.yml` | Manual dispatch only                    | Runs shared packages, serialized remote test-database verification, and Basic E2E as an exact-SHA release gate.                                                                                            |
| `/.gitea/workflows/ci.yml`                     | Pushes to `main`                        | Runs validation, publishes coverage, creates production artifacts when required, and deploys affected applications.                                                                                        |
| `/.gitea/workflows/docs-deploy.yml`            | Documentation-relevant pushes to `main` | Builds and deploys the documentation site to Cloudflare Pages.                                                                                                                                             |

The resulting flow is:

```text
Pull request
    ↓
C220 PR validation
    ├── static analysis, applications, packages, builds
    ├── four-worker ephemeral PostGIS verification
    └── Basic Playwright E2E with its own ephemeral PostGIS service
    ↓
done — no Azure jobs

Push to main
    ↓
C220 validation/build
    ├── Web production artifact when required
    └── API production artifact when required
              ↓
         validation gate
              ↓
        Azure runner
        ├── verify artifact
        ├── managed identity authentication
        ├── deploy
        └── health check
```

Keeping Azure jobs out of the pull-request workflow lets a PR finish as soon as
its C220 validation gate succeeds. A busy Azure runner cannot add a deployment
scheduling tail to pull-request feedback.

## Runners

### C220 validation and packaging runner

Validation, documentation deployment, and production Web/API artifact creation
use the repository-scoped `wits-world-c220-01` runner through this Docker label:

```text
wits-world-ci:docker://docker.gitea.com/runner-images:ubuntu-latest
```

The host has 44 physical CPU cores, 88 logical CPUs, and runner capacity 15.
Each job receives an isolated Docker container, but concurrent jobs share the
host's CPU, memory bandwidth, storage, Docker overlay filesystem, and package
download data.

### Azure deployment runner

Production deployment uses the two-core `witsworld-azure-runner` through its
host-only `azure-deploy` label. It provides Azure CLI, managed-identity access,
and production networking. It downloads and verifies deployable artifacts; it
does not install the monorepo dependencies, compile either application, or
construct production packages.

## Parallel validation

PR validation has five independent C220 jobs: bundled static analysis,
application coverage plus explicit shared-package tests, isolated database
verification, Basic Playwright E2E, and builds. The final PR gate needs all five. Main validation
keeps bundled static analysis, application/package tests, and builds separate
before its validation and deployment jobs.

Each job checks out the repository and performs a clean, lockfile-controlled
installation:

```bash
npm ci --prefer-offline --no-audit --fund=false
```

The jobs run the existing formatting, linting, type-checking, coverage, tests,
and validation-build commands. Main deployment cannot begin unless every main
validation category succeeds.

The duplicated clean installations increase aggregate Gitea job-minutes, but
independent jobs execute concurrently on the C220. Aggregate job-minutes
measure total runner work and must not be interpreted as sequential workflow
wall-clock latency. Each PR database job owns a separate PostGIS service and
uses four database-test workers, so it neither queues on nor contends for the
manual release remote-database advisory lock. See
[automated verification](./automated-verification.md) for the matrix and cost
boundary.

## npm cache status

`actions/setup-node` npm caching is deliberately disabled in CI and Docs
deployment. On this Gitea installation, cache restore and post-job save calls
consistently timed out through the Actions cache endpoint. Cache-enabled jobs
typically spent about 2 minutes 15 seconds in setup and another 2 minutes 17
seconds in the post-job path, even when the actual validation command took only
seconds.

Removing the cache inputs reduced normal PR/main validation from roughly 6
minutes 50 seconds to approximately 2 minutes 20 seconds. The workflows retain
`npm ci --prefer-offline`, but do not cache `node_modules` or ask `setup-node` to
restore/save npm's content cache. Keep caching disabled unless the Gitea cache
infrastructure is repaired and a controlled restore/save test proves it
reliable.

## Coverage artifacts and badge

The Web and API test steps collect V8 coverage during the test run. Reports and
the combined coverage badge are uploaded as `coverage-reports`. On a successful
push to `main`, the validation gate downloads that artifact and publishes the
SVG to the non-triggering `coverage-badge` branch. Pull requests upload coverage
for inspection but do not publish the live badge.

## Production artifacts

For an affected application, the existing C220 `build` job reuses its full
dependency installation and packages the production output after all normal
validation builds. It first verifies that the checked-out commit equals
`${{ gitea.sha }}`.

The Web build receives its production `VITE_*` values only on the relevant
configuration-validation and build steps. Its artifact is:

```text
web-deploy-${{ gitea.sha }}
├── witsworld-web-deploy.zip
├── commit-sha.txt
└── witsworld-web-deploy.zip.sha256
```

The ZIP contains the contents of `apps/web/dist`, with `index.html` and
`assets/` at its root.

The API validation build has already compiled `apps/api/dist`. After the other
build work is complete, the job uses an isolated npm 11.18.0 CLI to materialize
the API-only production dependency tree. It archives that tree as the single
`node_modules.tar.gz` ZIP entry, removes the unpacked tree, and packages the
compiled API, startup script, root and API package metadata, migrations, and
seeds:

```text
api-deploy-${{ gitea.sha }}
├── witsworld-api-deploy.zip
├── commit-sha.txt
└── witsworld-api-deploy.zip.sha256
```

The job-local npm CLI is important: a Stage 2 test briefly installed npm
globally into setup-node's shared toolcache and caused the parallel coverage
job to lose its npm executable. Isolating the packaging CLI prevents one C220
container from mutating tooling used by another.

The Azure jobs independently verify the exact checked-out main SHA and repeat
the application change check. They also resolve the remote `main` ref before
change detection, after artifact verification, and immediately before each
database or Azure mutation. If the run commit is no longer current, the
deployment marker is cleared and the stale run finishes without changing
production. A failure to resolve `main` fails closed. This explicit guard is
required because Gitea 1.24 ignores workflow `concurrency` declarations and an
older run can otherwise be restarted after a newer run has deployed.

When deployment is required, the jobs download the SHA-named artifact, verify
`commit-sha.txt`, verify the ZIP SHA-256 and integrity, reject any unpacked
`node_modules` ZIP entry, and inspect the inner archive for the known runtime
packages before authenticating. The database release extracts the inner archive
into its temporary release directory. Azure deploys the same verified ZIP and
performs the existing production health checks. It runs no Web/API `npm ci`,
TypeScript build, Vite build, or production package build.

Web change detection covers its application and shared build inputs, including
`/.gitea/workflows/ci.yml` and the current-main deployment guard. API detection
also includes the workflow and guard, in addition to `apps/api`, `database`, and
its shared runtime/build inputs. A deployment-control change can alter API
packaging, artifact contents, or deployment logic, so it must conservatively
require fresh artifacts and deployments. If comparison data is unavailable,
both paths require artifact production and deployment.

## Configuration and credential boundaries

Configuration is stored according to when and where it is consumed:

| Location                   | Purpose                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Gitea Variables            | Public frontend build-time `VITE_*` configuration embedded into the browser bundle on C220.          |
| Gitea Secrets              | Sensitive values required directly by CI steps, such as documentation-deployment credentials.        |
| Azure App Service settings | API runtime configuration and secrets, including database and Auth0 server/management configuration. |
| Azure managed identity     | Azure deployment credentials, available only to the host-executed Azure deployment jobs.             |

`VITE_*` values are browser-visible and must not contain secrets. Conversely,
API runtime variables must exist in the App Service environment; packaging an
application does not transfer runtime settings. The API startup failure caused
by missing `AUTH0_SPA_CLIENT_ID`, `AUTH0_MANAGEMENT_CLIENT_ID`, and
`AUTH0_MANAGEMENT_CLIENT_SECRET` established this operational requirement.

## Documentation deployment

`docs-deploy.yml` runs on `wits-world-ci`, with setup-node caching disabled. Its
push-to-`main` trigger is path-filtered to:

```text
apps/docs/**
docs/**
package.json
package-lock.json
.nvmrc
.gitea/workflows/docs-deploy.yml
```

Unrelated API- or Web-only pushes do not start documentation deployment.
Cloudflare credentials remain scoped to the deployment step.

## Measured results

Normal observed timings after the migration are:

| Path                               | Before              | Final observed result |
| ---------------------------------- | ------------------- | --------------------- |
| PR/main C220 validation wall-clock | about 6m50s         | about 2m20s           |
| Azure Web deployment job           | about 3m20s–3m32s   | about 46–59s          |
| Azure API deployment job           | about 3m45s Stage 1 | about 56s             |
| Normal merge to healthy Web/API    | longer rebuild path | about 3–3.5 minutes   |

The Web and API Stage 1 comparisons established byte-for-byte equivalence by
comparing extracted file lists and per-file SHA-256 hashes. Stage 2 then made
the C220 artifacts authoritative.

## Artifact compatibility and throughput boundaries

The workflows intentionally retain fully qualified
`actions/upload-artifact@v3` and `actions/download-artifact@v3`. Upload,
download, and cross-runner deployment were verified against Gitea 1.24.7. Do
not switch to v4 without a separate compatibility test.

The Azure host has Node.js 18.19.1 on the `act_runner` service PATH so
JavaScript actions can execute. That host runtime is action infrastructure, not
an application build environment.

Gitea 1.24.7 does not reliably honour workflow `concurrency`, so superseded
runs cannot be assumed to cancel automatically. Runner capacity and workflow
parallelism must also be tuned together; changing the job design requires
new measurements before changing capacity 15.

## AI declaration

This document was reviewed and edited with assistance from:

```text
Codex-CLI[GPT-6], Codex-CLI[GPT-5], Codex[GPT-5], and ChatGPT-Web[GPT-5.6 Sol]
```

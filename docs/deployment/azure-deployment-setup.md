# Azure Deployment Setup

> **Project:** Wits World  
> **Game/topic:** Wits Quest  
> **Course:** COMS3011A Software Design Project  
> **Scope of this document:** Azure infrastructure, deployment, security, and CI/CD work completed after the initial Gitea CI pipeline was established.

## 1. Purpose

This document records the Azure infrastructure, security configuration, deployment validation, and Gitea continuous-deployment setup used for Wits World.

The deployment architecture keeps the frontend and backend independently deployable:

- the Fastify API is hosted as its own Azure App Service;
- the React/Vite frontend is hosted as a separate Azure App Service;
- both App Services share one Linux Basic B1 App Service Plan;
- production deployment is performed by a repository-scoped Gitea Actions runner VM;
- Neon PostgreSQL/PostGIS remains the production database;
- Auth0 remains the authentication provider.

No Azure passwords, publish profiles, or long-lived service-principal secrets are stored in the repository or Gitea. Production deployment uses the Azure VM runner's system-assigned managed identity.

---

## 2. Current Deployment Architecture

```text
Azure for Students
│
├── vitaq-rg
│   └── Existing VitaQ resources
│       └── Not part of Wits World and must not be modified
│
└── witsworld-rg
    │
    ├── ASP-witsworld
    │   ├── Linux
    │   ├── Basic B1
    │   ├── South Africa North
    │   └── 1 instance
    │
    ├── witsworld-api
    │   ├── Azure App Service
    │   ├── Node 24 LTS
    │   └── Production Fastify API
    │
    ├── witsworld-web
    │   ├── Azure App Service
    │   ├── Node 24 LTS
    │   └── Production React/Vite SPA served by PM2
    │
    └── witsworld-runner-vm
        ├── Ubuntu 24.04 LTS
        ├── Gitea act_runner
        ├── Docker
        ├── Azure CLI
        └── System-assigned managed identity
```

External services:

```text
Neon PostgreSQL/PostGIS
Auth0
Private Wits SDP Gitea instance
```

The Docusaurus documentation application is deployed separately to Cloudflare
Pages by `.gitea/workflows/docs-deploy.yml`; it does not consume the B1 App
Service Plan.

---

## 3. Azure Resource Group

A dedicated resource group was created for Wits World:

```text
Name:         witsworld-rg
Subscription: Azure for Students
Region:       South Africa North
```

Tags used:

```text
Project       = WitsWorld
Course        = COMS3011A
Environment   = Production
```

Keeping the project inside its own resource group separates it from unrelated Azure resources, particularly the existing VitaQ deployment.

---

## 4. Shared App Service Plan

The application hosting plan is:

```text
Name:             ASP-witsworld
Operating system: Linux
Region:           South Africa North
Pricing tier:     Basic B1
Instances:        1
Zone redundancy:  Disabled
```

Additional tag:

```text
Purpose = AppHosting
```

The plan is intentionally shared between two independently deployable App Services:

```text
ASP-witsworld
├── witsworld-api
└── witsworld-web
```

The applications remain logically and operationally separate even though they share the same underlying App Service Plan compute.

---

## 5. Wits World API App Service

The API application is:

```text
App Service name: witsworld-api
Publish model:    Code
Runtime:          Node 24 LTS
Operating system: Linux
Region:           South Africa North
Plan:             ASP-witsworld
Public access:    Enabled
```

Current default hostname:

```text
witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net
```

Azure's built-in continuous deployment is disabled because deployment is handled by Gitea Actions.

Azure database creation was not enabled because the production database is hosted externally on Neon PostgreSQL/PostGIS.

Application Insights was not enabled during this setup phase.

### 5.1 Runtime configuration

The committed production startup command is:

```bash
/home/site/wwwroot/apps/api/startup.sh
```

The script recreates `/node_modules`, extracts the CI-prepared
`/home/site/wwwroot/node_modules.tar.gz` into it, links
`/home/site/wwwroot/node_modules` to `/node_modules` for Node ESM package
resolution, and uses `exec` to start the compiled Fastify server. The deployment
workflow does not change the configured startup command. Before the first
deployment of this artifact, replace the emergency inline command with the
transition-safe inline command in section 19.1. That command creates the
`/home/site/wwwroot/node_modules` symlink needed after a clean ZipDeploy removes
the former unpacked dependency tree.

The pre-built artifact strategy requires these App Service settings:

```text
BUILD_FLAGS:                    Off
SCM_DO_BUILD_DURING_DEPLOYMENT: unset (do not enable)
SCM basic authentication:      Disabled
```

`BUILD_FLAGS=Off` prevents App Service from re-optimising the production
dependency archive already prepared by CI. Deployment authentication continues
to use Azure managed identity / Entra authentication. CI does not currently
read or validate `BUILD_FLAGS`; confirming that it remains exactly `Off` is an
operational prerequisite for every deployment using this artifact strategy.

Important App Service configuration:

```text
Always On:                    Enabled
HTTPS Only:                   Enabled
HTTP version:                 HTTP/2
Minimum inbound TLS:          TLS 1.3
SCM minimum inbound TLS:      TLS 1.3
FTP state:                    Disabled
FTP basic authentication:     Disabled
SCM basic authentication:     Disabled
Remote debugging:             Disabled
Client certificate mode:      Ignore
Session affinity:             Disabled
```

A final read-only review confirmed the API is running and attached to `ASP-witsworld`.

---

## 6. Wits World Web App Service

The frontend application is:

```text
App Service name: witsworld-web
Publish model:    Code
Runtime:          Node 24 LTS
Operating system: Linux
Region:           South Africa North
Plan:             ASP-witsworld
Public access:    Enabled
```

Current default hostname:

```text
witsworld-web-fqabhufqgvapapgq.southafricanorth-01.azurewebsites.net
```

The canonical production web origin is `https://witsworld.co.za`. The built web
application redirects only `www.witsworld.co.za` to the canonical origin before
the SPA loads, preserving the path, query string, and fragment. It does not
redirect this Azure default hostname, localhost, E2E hosts, or other hostnames.

The frontend is a prebuilt React/Vite single-page application.

### 6.1 Runtime configuration

The production startup command is:

```bash
pm2 serve /home/site/wwwroot --no-daemon --spa
```

This serves the prebuilt Vite output from `/home/site/wwwroot`.

The `--spa` flag provides client-side route fallback to `index.html`, allowing routes such as `/about` and `/explore` to survive direct navigation and browser refreshes.

Important App Service configuration:

```text
Always On:                    Enabled
HTTPS Only:                   Enabled
HTTP version:                 HTTP/2
Minimum inbound TLS:          TLS 1.3
SCM minimum inbound TLS:      TLS 1.3
FTP state:                    Disabled
FTP basic authentication:     Disabled
SCM basic authentication:     Disabled
SSH:                          Disabled
Remote debugging:             Disabled
Client certificate mode:      Ignore
Session affinity:             Disabled
```

A final read-only review confirmed the web application is running and attached to `ASP-witsworld`.

---

## 7. API Production Environment Variables

The API App Service has the following application settings configured:

```text
AUTH0_AUDIENCE
AUTH0_DOMAIN
AUTH0_TENANT_DOMAIN
AUTH0_MANAGEMENT_CLIENT_ID
AUTH0_MANAGEMENT_CLIENT_SECRET
AUTH0_SPA_CLIENT_ID
CORS_ALLOWED_ORIGIN
DATABASE_URL
HOST
LOG_LEVEL
NODE_ENV
WEBSITE_HEALTHCHECK_MAXPINGFAILURES
WEBSITE_HTTPLOGGING_RETENTION_DAYS
```

The intended non-secret values include:

```text
HOST      = 0.0.0.0
LOG_LEVEL = info
NODE_ENV  = production
```

`DATABASE_URL` and `AUTH0_MANAGEMENT_CLIENT_SECRET` are secrets and must never
be committed.

`AUTH0_DOMAIN`, `AUTH0_TENANT_DOMAIN`, `AUTH0_AUDIENCE`, and
`AUTH0_SPA_CLIENT_ID` are environment-specific authentication configuration.
Production `AUTH0_DOMAIN` is the custom hostname, while
`AUTH0_TENANT_DOMAIN` remains the underlying `*.auth0.com` tenant used to form
the Management API audience. The Auth0 Management client ID and secret are
server-only machine-to-machine credentials reserved by the preliminary backend
foundation for the planned account-deletion capability. Their presence does
not mean that account deletion is implemented. These values are API runtime
settings and belong in Azure App Service rather than in the deployment ZIP.

Issue `#168` adds two non-secret API runtime controls that production operators
must set and review before enabling movement-evidence persistence:

```text
MOVEMENT_EVIDENCE_RETENTION_MS
MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS
MAX_PLAUSIBLE_JOURNEY_SPEED_METRES_PER_SECOND
```

The current defaults are a provisional 24-hour retention and a 30-minute
idempotent cleanup interval. Their final production values require team review;
see [privacy-limited movement evidence](../database/movement-evidence.md).
Configuration rejects unsafe integers at startup. The cleanup interval cannot
be shorter than `900000` ms or exceed Node's `2147483647` ms timer limit, and
retention has a separate JavaScript `Date` representation guard rather than an
invented business-policy maximum. Retention changes apply only to new rows;
existing evidence keeps its stored `expires_at`. The maximum-speed setting is
required, has no default, and must be a finite number greater than zero.
Configure the reviewed environment value before deploying the matching API or
startup will fail closed.

Asynchronous PvP additionally requires the server-only
`ASYNC_PVP_CURSOR_SIGNING_KEY` (at least 32 random UTF-8 bytes) and accepts the
optional `ASYNC_PVP_DEADLINE_SWEEP_INTERVAL_MS` (default `1800000`, minimum
`900000`). Store the signing key as an App Service secret; it is never a `VITE_*`
value. The API performs one deadline sweep immediately after startup and then
on the configured interval. Database row locks and idempotent terminal writes
preserve correctness across recycle catch-up and future scale-out.

### 7.1 Runtime configuration incident

An API deployment completed successfully but repeatedly returned HTTP 503
because the new process exited during startup with
`AUTH0_SPA_CLIENT_ID is required to start the API.` The related Management API
settings had been introduced by the same application work and also required a
production audit. Production was corrected by configuring these App Service
settings without exposing their values:

```text
AUTH0_SPA_CLIENT_ID
AUTH0_MANAGEMENT_CLIENT_ID
AUTH0_MANAGEMENT_CLIENT_SECRET
```

The operational rule is that every newly required API environment variable
must be added to and verified in Azure App Service before deploying code that
requires it. Artifact migration improves package production and transfer; it
cannot repair missing runtime configuration.

### 7.2 Production CORS origin

The API must allow only the exact canonical production frontend origin:

```text
CORS_ALLOWED_ORIGIN =
https://witsworld.co.za
```

A wildcard origin is not used.

### 7.3 PORT

A custom `PORT` setting is not configured manually.

During startup Azure App Service supplies the runtime port. Successful startup logs showed Azure supplying:

```text
PORT=8080
```

The API then listened successfully on the Azure-assigned port.

---

## 8. Frontend Production Build Variables

The React/Vite frontend uses build-time variables rather than Azure runtime environment variables.

The following Gitea repository **Variables** are configured:

```text
VITE_API_BASE_URL
VITE_AUTH0_DOMAIN
VITE_AUTH0_CLIENT_ID
VITE_AUTH0_AUDIENCE
VITE_MAPBOX_ACCESS_TOKEN
```

These values are supplied during the Vite build performed by Gitea Actions.

They are intentionally stored as Gitea Variables rather than Azure App Service runtime settings because Vite embeds `VITE_*` configuration into the generated browser bundle at build time.

`VITE_*` values are browser-visible configuration and must not contain secrets.
The Mapbox value is intentionally a public `pk.` token; restrict it to the
approved localhost and deployed web origins and keep only the required public
read scopes. See [Mapbox operations](./mapbox-operations.md).

Configuration ownership is intentionally separated:

| Location                   | Responsibility                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Gitea Variables            | Public frontend build-time `VITE_*` configuration consumed by the C220 production Web build.      |
| Gitea Secrets              | Sensitive values consumed by CI itself, such as documentation-deployment credentials.             |
| Azure App Service settings | API runtime configuration and secrets, including Auth0 Management credentials and `DATABASE_URL`. |
| Azure managed identity     | Azure deployment authentication available only on the host-executed `azure-deploy` runner.        |

---

## 9. Auth0 Production URL Configuration

The Auth0 Single Page Application used by the frontend is:

```text
Wits World
```

Production currently shares this SPA/application with local development, so its
allowlists contain both localhost and production origins. This is a known
temporary deviation from ADR-005's intended separation of development and
production Auth0 resources, not an accepted architecture exception. Remediation
must create and cut over to separate resources without assuming that separate
tenants are required.

The Auth0 dashboard currently records:

| Setting                | Current values                                     |
| ---------------------- | -------------------------------------------------- |
| Allowed Callback URLs  | `http://localhost:5173`, `https://witsworld.co.za` |
| Allowed Logout URLs    | `http://localhost:5173`, `https://witsworld.co.za` |
| Allowed Web Origins    | `http://localhost:5173`, `https://witsworld.co.za` |
| Allowed Origins (CORS) | Empty                                              |

`https://www.witsworld.co.za` is not a second application origin. It redirects
to the canonical origin before the SPA initializes and must not be added to the
Auth0 URL allowlists.

The existing localhost development entries remain configured.

The custom-domain cutover is live. The production issuer is:

```text
https://auth.witsworld.co.za/
```

Public OIDC discovery and the deployed Web configuration were verified on
22 August 2026. The signed-in hard-refresh, storage, console, and correlated API
log checks remain the manual per-release evidence described below.

The application login and logout UI is implemented. A production login/logout
check still requires a human operator with a safe test account and must be
recorded for the release being validated.

### 9.1 Auth0 email-delivery policy

Email verification is not part of the Wits World account lifecycle. This is an
Auth0 tenant configuration requirement, not application logic: do not add
`email_verified` to API or browser authorisation, and do not add Wits World
password collection, storage, or reset handling.

For the Wits World database connection, disable the connection-level automatic
email-verification-on-sign-up control. Auth0 currently labels this **Verify
email on sign up** where the Email attribute is configured (Authentication >
Database > connection > Attributes > Configure Email). This setting must be
off because it can independently send a verification message even when email
templates are disabled. See Auth0's [database-attribute guidance](https://auth0.com/docs/authenticate/database-connections/activate-and-configure-attributes-for-flexible-identifiers)
and its [current support guidance for this setting](https://support.auth0.com/center/s/article/auth0-sending-email-verification-emails-when-disabled).

Also disable the Auth0 verification-email mechanism under Branding > Email
Templates: disable **Verification link email** and, if it is enabled for the
tenant, **Verification code email**. Auth0 documents these as separate email
templates that can be enabled or disabled; both must be off where available so
the tenant has no automatic verification-mail path for Wits World sign-ups.
Do not disable **Change password link email** or **Change password code email**:
password reset/recovery must remain enabled and unchanged. See Auth0's [Email
Templates documentation](https://auth0.com/docs/customize/email/email-templates).

The repository does not manage Auth0 tenant configuration as code. An
authorised tenant administrator must make this change manually and record the
result with the release evidence.

After the tenant change, use a fresh non-production/test account through the
normal Wits World sign-up flow:

1. Confirm sign-up succeeds and no automatic verification email is sent.
2. Confirm the user can sign in immediately, then confirm `/auth/me` and a
   representative protected feature work.
3. Confirm Auth0's password reset/recovery capability still sends its email and
   completes normally. This provider check does not claim that the Wits World
   password-reset requirement or profile/account UI is implemented.
4. Confirm no Wits World screen says verification is required.

---

## 10. Health Checks

### 10.1 API

Azure App Service Health Check is enabled for the API:

```text
Path:                     /health
Load-balancing threshold: 10 minutes
```

The health endpoint is intentionally unauthenticated so Azure can verify that the API process is alive and accepting requests.

Manual production validation confirmed:

```text
GET /health   -> HTTP 200
GET /api/v1/  -> HTTP 200
```

### 10.2 Web

Azure App Service Health Check is enabled for the frontend:

```text
Path:                     /
Load-balancing threshold: 10 minutes
```

The frontend is hosted on a single App Service instance. Azure can still track its health and recycle/replace a persistently unhealthy instance.

Manual production validation confirmed:

```text
GET /       -> HTTP 200
GET /about  -> HTTP 200
GET /explore -> HTTP 200
```

Direct browser refreshes on client-side routes also continued to load the correct route rather than returning to the homepage or producing a 404.

---

## 11. Logging

Both App Services use filesystem application logging.

Configuration:

```text
Application logging: File System
Quota:               35 MB
Retention:           3 days
```

Useful Azure CLI diagnostics for either application include:

```bash
az webapp log startup show   --name <app-name>   --resource-group witsworld-rg
```

and:

```bash
az webapp log tail   --name <app-name>   --resource-group witsworld-rg
```

### 11.1 API startup diagnostics

The startup log was particularly useful during the first API deployment because the deployment command timed out while waiting for the site even though the application subsequently started successfully.

Successful startup evidence included:

```text
Server listening at http://127.0.0.1:8080
Server listening at http://169.254.x.x:8080
Wits World API started
Site startup probe succeeded
```

### 11.2 Frontend startup diagnostics

The frontend is a static SPA served by PM2. Filesystem logging and startup logs are retained mainly to diagnose App Service or PM2 startup failures.

The FTP/FTPS URLs displayed on the App Service logs page do not indicate that FTP publishing is enabled; FTP and basic publishing authentication remain disabled.

---

## 12. Gitea Actions Runner VM

A dedicated Azure VM is used as the repository-scoped Gitea Actions runner.

```text
Name:      witsworld-runner-vm
OS:        Ubuntu 24.04 LTS
Region:    South Africa North
VM size:   Standard_B2ats_v2
CPU:       2 vCPU
Memory:    1 GiB
OS disk:   30 GiB Standard SSD
```

A 2 GiB swap file was configured to reduce the risk of CI jobs exhausting available RAM.

### 12.1 Installed tooling

The runner host contains:

```text
Git
Docker Engine
Docker Compose
Azure CLI
zip/unzip
curl
Node.js
Gitea act_runner
```

Node.js is installed directly on the host so JavaScript-based Gitea actions can
run on the `azure-deploy` label. It is action infrastructure only: the Azure
runner does not use host Node or npm to build the Web or API applications.

Verified versions during setup included:

```text
Git:        2.43.0
Docker:     29.7.2
Azure CLI:  2.89.0
zip:        3.0
curl:       8.5.0
Node.js:    18.19.1
```

### 12.2 act_runner

The Gitea runner is registered as:

```text
witsworld-azure-runner
```

The runner service is managed by systemd:

```bash
systemctl status act_runner
```

Runner configuration:

```text
/etc/act_runner/config.yaml
```

Runner state:

```text
Repository-scoped
Online
Idle when no job is running
```

---

## 13. Runner Labels

The Azure runner retains its existing Docker labels for compatibility:

```yaml
ubuntu-latest:docker://docker.gitea.com/runner-images:ubuntu-latest
ubuntu-22.04:docker://docker.gitea.com/runner-images:ubuntu-22.04
ubuntu-20.04:docker://docker.gitea.com/runner-images:ubuntu-20.04
```

A dedicated host-execution label is configured for production deployment:

```yaml
azure-deploy:host
```

This gives the Azure runner two execution modes:

```text
ubuntu-*      -> Docker container
azure-deploy  -> VM host
```

Normal validation no longer targets the shared `ubuntu-latest` label. The
repository-scoped `wits-world-c220-01` runner advertises only this dedicated
Docker label:

```yaml
wits-world-ci:docker://docker.gitea.com/runner-images:ubuntu-latest
```

The dedicated label makes CI runner selection deterministic. Privileged
production deployment jobs continue to execute on the Azure VM host and can use
its managed identity.

---

## 14. Azure Managed Identity and RBAC

The runner VM has a system-assigned managed identity enabled.

The VM authenticates to Azure using:

```bash
az login --identity
```

No Azure username, password, client secret, or publish profile is required.

The identity has the following app-scoped deployment permissions:

```text
Website Contributor -> witsworld-api
Website Contributor -> witsworld-web
```

The assignments are deliberately scoped to the two App Services rather than the whole subscription, resource group, or App Service Plan.

This least-privilege design was also confirmed indirectly during the final review: the runner identity could read/manage the two assigned App Services but was denied broader reads of the App Service Plan and VM resource itself.

Those authorization failures were expected and are evidence that the identity was not granted unnecessary broader access.

---

## 15. Preventing CI Containers from Using the Managed Identity

A self-hosted Azure CI runner with a managed identity introduces a security risk: arbitrary code running inside a build container may attempt to contact Azure Instance Metadata Service (IMDS) and obtain the VM identity token.

Azure IMDS is available at:

```text
169.254.169.254
```

Before hardening, a Docker container was able to run:

```bash
az login --identity
```

and access the production API App Service.

To prevent normal CI containers from obtaining production deployment credentials, Docker traffic to Azure IMDS is blocked using the `DOCKER-USER` iptables chain:

```bash
sudo iptables -I DOCKER-USER 1   -d 169.254.169.254/32   -j REJECT
```

After the rule was applied:

```text
Docker container -> az login --identity -> blocked
VM host          -> az login --identity -> succeeds
```

This is the intended result.

### 15.1 Persistent IMDS protection

The firewall protection is made persistent using:

```text
/etc/systemd/system/block-docker-imds.service
```

Service definition:

```ini
[Unit]
Description=Block Docker containers from Azure IMDS
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/bin/sh -c '/usr/sbin/iptables -C DOCKER-USER -d 169.254.169.254/32 -j REJECT || /usr/sbin/iptables -I DOCKER-USER 1 -d 169.254.169.254/32 -j REJECT'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

The service was verified as:

```text
enabled
active
```

This means the Docker-to-IMDS block is restored after VM reboot.

---

## 16. First Manual API Deployment

Before automating API deployment, the process was validated manually from the runner VM.

### 16.1 Build

The API was compiled inside Node 24:

```bash
docker run --rm   -v "$PWD:/workspace"   -w /workspace   node:24-bookworm-slim   sh -lc '
    npm ci
    npm run build --workspace @wits-world/api
  '
```

Successful validation:

```text
apps/api/dist/server.js
```

### 16.2 Production dependencies

Production dependencies were installed with the project's required npm version:

```bash
docker run --rm   -v "$PWD:/workspace"   -w /workspace   node:24-bookworm-slim   sh -lc '
    npm install -g npm@11.18.0 >/dev/null
    npm ci --omit=dev --workspace @wits-world/api --include-workspace-root=false
  '
```

### 16.3 Deployment artifact

The API deployment ZIP contains:

```text
package.json
package-lock.json
node_modules.tar.gz
apps/
└── api/
    ├── package.json
    ├── startup.sh
    └── dist/
database/
```

`node_modules.tar.gz` contains the contents of the production dependency tree
at its root. The outer ZIP must not contain a `node_modules/` tree; keeping the
dependencies in one compressed entry avoids making Kudu expand thousands of
dependency files in `LocalZipHandler`.

The first validated deployment ZIP was approximately:

```text
6.5 MB
```

### 16.4 Deployment command

The API was deployed using:

```bash
az webapp deploy   --resource-group witsworld-rg   --name witsworld-api   --src-path ~/witsworld-api-deploy.zip   --type zip   --clean true   --restart true
```

The first deployment command stopped waiting before the site became healthy.

Startup diagnostics later showed that the API had started successfully and the Azure startup probe passed.

The deployment was therefore validated using the public health endpoints rather than relying only on the original CLI wait result.

---

## 17. First Manual Frontend Deployment

The frontend was also validated manually before automating deployment.

### 17.1 Production build

The Vite frontend was built using the production values for:

```text
VITE_API_BASE_URL
VITE_AUTH0_DOMAIN
VITE_AUTH0_CLIENT_ID
VITE_AUTH0_AUDIENCE
VITE_MAPBOX_ACCESS_TOKEN
```

Successful build output:

```text
apps/web/dist/index.html
apps/web/dist/assets/
```

### 17.2 Windows ZIP issue

The first deployment ZIP was created with Windows PowerShell `Compress-Archive`.

Although the ZIP passed integrity testing, its entries used Windows-style path separators:

```text
assets\AboutPage-....js
assets\index-....js
```

Azure Linux/Kudu rejected the package during deployment with HTTP 400.

The deployment logs showed the failure occurred during the deployment command rather than during Azure authentication.

### 17.3 Linux ZIP fix

The already-built `dist` directory was copied to the Linux runner VM and the ZIP was recreated there:

```bash
cd ~/witsworld-web-dist
zip -qr ~/witsworld-web-deploy-linux.zip .
```

The corrected package used Linux-compatible paths:

```text
assets/AboutPage-....js
assets/index-....js
index.html
```

The corrected ZIP deployed successfully.

This result informed the automated deployment design: frontend deployment ZIPs are always created on Linux by the Gitea deployment job.

### 17.4 Manual validation

The live frontend was manually tested in a browser.

Validated behaviour included:

```text
Homepage loads
About page loads
Explore route loads
Direct route refresh works
SPA route state is preserved on refresh
No relevant browser DevTools errors were observed
```

The application login interface now exists. Its production Auth0 flow must be
revalidated manually for the release commit; this historical setup section does
not claim that current validation has occurred.

---

## 18. Continuous Integration

The repository runs five independent container-isolated validation jobs on the
dedicated C220 runner:

```text
format ─────┐
lint ───────┤
type-check ─┼── Repository and application validation
test ───────┤
build ──────┘
```

Each job checks out the repository and performs a clean `npm ci`. The C220 has
44 physical cores, 88 logical CPUs, and runner capacity 15, so formatting,
linting, type checking, tests, and builds can execute concurrently while
capacity remains for other work. These parallel jobs increase aggregate runner
work, but aggregate job-minutes are not sequential workflow wall-clock time.

`setup-node` npm caching is intentionally disabled. The Gitea Actions cache
endpoint repeatedly timed out during both restore and post-job save, increasing
normal validation from approximately 2 minutes 20 seconds to roughly 6 minutes
50 seconds. Keep the cache disabled unless the server-side cache path is
repaired and retested.

The final validation job depends on all five jobs. Coverage badge publication
and API deployment occur only after that combined gate passes. The host-only
`azure-deploy` label remains exclusive to post-validation production
deployment.

The workflows are separated by event:

```text
pr-validation.yml -> pull requests targeting main; C220 validation only
ci.yml            -> pushes to main; C220 validation/artifacts and deployment
```

Pull-request workflows contain no Azure jobs, so PR completion does not depend
on Azure runner availability. Documentation deployment also uses the C220; its
setup-node cache is disabled and its main trigger is path-filtered so unrelated
API/Web changes do not deploy Docs.

---

## 19. Continuous Deployment Design

The deployment workflow contains two production deployment jobs:

```text
Deploy API to Azure
Deploy Web to Azure
```

Both jobs compare the pushed commit with the push event's `before` commit. The
workflow uses that commit only when it is a valid, available Git commit. If the
event omits it, supplies the all-zero SHA, or the commit cannot be fetched, the
workflow deploys conservatively. It does not substitute the pushed commit's
first parent because that parent may cover only the final commit in a
multi-commit push.

Documentation-only changes therefore complete validation without installing
deployment dependencies, authenticating to Azure, restarting either App
Service, or running unnecessary production health polling.

### 19.1 API deployment

For API-relevant pushes, the C220 `build` job reuses its existing dependency
installation and compiled `apps/api/dist`. After all validation builds finish,
it uses a job-local npm 11.18.0 CLI to materialize the API-only production
dependency tree, replaces workspace-package symlinks with built package
contents, archives the tree as `node_modules.tar.gz`, and removes the unpacked
tree before creating the outer Azure ZIP. It packages the compiled API,
committed startup script, package metadata, database migrations, and seeds.

The artifact is bound to the exact pushed commit:

```text
api-deploy-${{ gitea.sha }}
├── witsworld-api-deploy.zip
├── commit-sha.txt
└── witsworld-api-deploy.zip.sha256
```

API deployment is required when the comparison includes changes under
`apps/api` or `database`, changes to `.gitea/workflows/ci.yml`, or changes to
`.nvmrc`, `package.json`, `package-lock.json`, or `tsconfig.base.json`. A CI
workflow change can alter API packaging, artifact contents, or deployment
logic, so it conservatively requires a fresh API artifact and deployment.

After the combined validation gate succeeds, Azure checks out the exact main
SHA and repeats the same change detection. When required it downloads
`api-deploy-${{ gitea.sha }}`, verifies the recorded commit, ZIP checksum and
integrity, rejects an unpacked `node_modules` tree, checks the startup script and
API entry point, and verifies the required runtime packages inside
`node_modules.tar.gz`. Only then does it authenticate with managed identity,
read the existing `DATABASE_URL` App Service setting without logging it, extract
the dependency archive for the guarded database release, run that release
against the separately confirmed production host and database name, deploy the
ZIP, and verify `/health`.

The workflow deliberately does not update the App Service startup command. The
current emergency command extracts the dependency archive but does not create
`/home/site/wwwroot/node_modules`. A clean deployment of the new artifact can
therefore remove the dependency path that Node ESM resolution needs before the
committed script is active.

Use the following three-stage rollout on the managed-identity Azure deployment
runner. Before merging, confirm the required `BUILD_FLAGS=Off` setting, replace
the emergency command with a transition-safe inline command, restart, and verify
health:

```bash
set -eu

az login --identity --output none
az account set --subscription "Azure for Students"

API_HOST="$(az webapp show --resource-group witsworld-rg --name witsworld-api --query defaultHostName --output tsv)"

BUILD_FLAGS="$(az webapp config appsettings list \
  --resource-group witsworld-rg \
  --name witsworld-api \
  --query "[?name=='BUILD_FLAGS'].value | [0]" \
  --output tsv)"
test "$BUILD_FLAGS" = "Off"

az webapp config set \
  --resource-group witsworld-rg \
  --name witsworld-api \
  --startup-file 'set -eu; rm -rf /node_modules; mkdir -p /node_modules; tar -xzf /home/site/wwwroot/node_modules.tar.gz -C /node_modules; rm -rf /home/site/wwwroot/node_modules; ln -s /node_modules /home/site/wwwroot/node_modules; exec node /home/site/wwwroot/apps/api/dist/server.js' \
  --output none

az webapp restart \
  --resource-group witsworld-rg \
  --name witsworld-api \
  --output none

curl --fail --retry 60 --retry-delay 5 --retry-all-errors \
  --silent --show-error \
  "https://${API_HOST}/health"
```

Only after that health check succeeds, merge the hotfix and allow its API
deployment workflow to complete. Do not change the inline command during the
deployment. When the workflow reports success, verify the newly deployed
artifact again:

```bash
API_HOST="$(az webapp show --resource-group witsworld-rg --name witsworld-api --query defaultHostName --output tsv)"
curl --fail --retry 60 --retry-delay 5 --retry-all-errors \
  --silent --show-error \
  "https://${API_HOST}/health"
```

Only after the post-deployment health check succeeds, switch to the committed
startup script, restart, and perform the final health check:

```bash
set -eu

API_HOST="$(az webapp show --resource-group witsworld-rg --name witsworld-api --query defaultHostName --output tsv)"

az webapp config set \
  --resource-group witsworld-rg \
  --name witsworld-api \
  --startup-file /home/site/wwwroot/apps/api/startup.sh \
  --output none

az webapp restart \
  --resource-group witsworld-rg \
  --name witsworld-api \
  --output none

curl --fail --retry 60 --retry-delay 5 --retry-all-errors \
  --silent --show-error \
  "https://${API_HOST}/health"

az webapp config show \
  --resource-group witsworld-rg \
  --name witsworld-api \
  --query appCommandLine \
  --output tsv
```

The final command must print
`/home/site/wwwroot/apps/api/startup.sh`. These commands do not alter
`BUILD_FLAGS`, enable App Service build automation, or change SCM Basic Auth.

Before the database release, the workflow configures account-deletion retry,
movement-evidence cleanup, and asynchronous-PvP deadline processing to the same
`1800000` ms production interval. Coalescing these database-backed sweeps into
one approximate wake window allows the Neon compute and the API connection pool
to become idle between runs. The API rejects intervals shorter than `900000` ms
to prevent a one-minute polling regression. Request-time checks remain
authoritative, so this maintenance cadence does not extend persisted deadlines
or make expired evidence valid.

The Azure runner performs no API dependency installation, TypeScript build,
production dependency materialization, or ZIP construction. Stage 1 proved the
C220 and former Azure packages had identical path types, symlink targets, and
per-file SHA-256 hashes. Stage 2 made the C220 artifact authoritative. The
authoritative Azure job measured approximately 56 seconds, down from about 3
minutes 45 seconds in the Stage 1 control path.

During migration, a global npm pin in the C220 packaging step briefly removed
the shared setup-node npm executable used by a parallel test job. npm 11.18.0
is now installed in a job-local temporary directory and invoked directly, so
packaging cannot mutate another job's toolchain.

### 19.2 Web deployment

For Web-relevant pushes, the C220 `build` job reuses its installed dependencies,
validates the public production `VITE_*` configuration, runs the production Web
build, and packages the contents of `apps/web/dist`:

```text
web-deploy-${{ gitea.sha }}
├── witsworld-web-deploy.zip
├── commit-sha.txt
└── witsworld-web-deploy.zip.sha256
```

Web deployment is required when the comparison includes changes under
`apps/web`, changes to `.gitea/workflows/ci.yml`, or changes to `.nvmrc`,
`package.json`, `package-lock.json`, or `tsconfig.base.json`. Including the
workflow file makes a deployment-pipeline repair trigger a fresh frontend
release instead of leaving a previously skipped build stale.

The frontend package is created from the **contents** of `apps/web/dist`, so Azure receives:

```text
/home/site/wwwroot/index.html
/home/site/wwwroot/assets/...
```

rather than a nested `dist` directory.

After validation, Azure downloads the SHA-named artifact, verifies its commit
metadata, checksum, ZIP integrity, `index.html`, and assets, authenticates with
managed identity, deploys, and verifies `/` and `/about`. Azure performs no Web
`npm ci`, TypeScript build, Vite build, ZIP construction, or Docker build.

Stage 1 proved every generated C220 file was byte-for-byte identical to the
former Azure-built output. Stage 2 made that artifact authoritative. Measured
Azure Web deployment fell from approximately 3 minutes 20–32 seconds to roughly
46–59 seconds.

Both applications use the verified Gitea 1.24.7-compatible
`upload-artifact@v3` and `download-artifact@v3` actions. Do not switch to v4
without a separate compatibility test on this installation.

### 19.3 Pull request versus main behaviour

```text
Pull request -> pr-validation.yml -> C220 validation gate -> done
Push/merge to main -> ci.yml -> C220 validation and affected artifacts
Affected application -> validation gate -> Azure verify/deploy/health check
Unaffected application -> artifact production and deployment work skipped
```

---

## 20. Deployment Job Security

Production deployment jobs use:

```yaml
runs-on: azure-deploy
```

This executes directly on the runner VM host.

These jobs must therefore be treated as privileged infrastructure code.

Changes to:

```text
.gitea/workflows/
```

should always be reviewed carefully before merging.

Current protections include:

```text
No Azure passwords or publish profiles stored in Gitea
Managed identity scoped only to witsworld-api and witsworld-web
Normal CI container access to Azure IMDS blocked
Deployment allowed only for pushes to main
Deployment waits for all required validation jobs and the combined gate
Missing comparison data triggers deployment rather than an unsafe skip
Main branch protected through PR workflow
Web/API artifact names and metadata bound to the exact main commit SHA
Remote main revalidated before change detection and every production mutation
Stale restarted runs skip database and Azure changes instead of rolling production back
Deployment ZIP checksums, integrity, and required files verified before authentication
Public frontend build values stored as Gitea Variables and scoped to C220 build steps
API runtime configuration and secrets stored in Azure App Service settings
Azure deployment credentials confined to the runner's managed identity
Temporary deployment workspaces removed after jobs complete
```

Vite embeds `VITE_*` values in the browser bundle, so they are public build-time
configuration rather than deployment credentials. Gitea Secrets are reserved
for sensitive values consumed by CI itself. API runtime values—including Auth0
Management credentials—remain App Service settings, and Azure authentication
remains confined to the host-only deployment runner.

---

## 21. Automated Production Health Verification

### 21.1 API

After API deployment, the workflow repeatedly checks:

```text
https://<production-api-host>/health
```

The API deployment is considered successful only after it returns:

```text
HTTP 200
```

If the API does not become healthy within the retry period, the job fails and retrieves Azure startup diagnostics.

### 21.2 Web

After web deployment, the workflow repeatedly checks:

```text
https://<production-web-host>/
https://<production-web-host>/about
```

The web deployment is considered successful only after both routes return:

```text
HTTP 200
```

This ensures that successful ZIP upload alone is not considered a successful production release.

---

## 22. Expected Gitea Actions Behaviour

### Pull request into `main`

Expected jobs:

```text
Check repository formatting             PASS
Lint applications                       PASS
Type-check applications                 PASS
Test applications with coverage         PASS
Build applications                      PASS
Repository and application validation   PASS
```

The five validation categories can run concurrently and still expose a clear
failure boundary. The combined validation job passes only when all categories
pass.

The pull-request workflow contains no Azure jobs. Production cannot be modified
by a PR run, and PR completion cannot wait behind Azure runner work.

### Merge/push to `main`

Expected jobs:

```text
Check repository formatting             PASS
Lint applications                       PASS
Type-check applications                 PASS
Test applications with coverage         PASS
Build applications                      PASS
Repository and application validation   PASS
Deploy API to Azure                     PASS
Deploy Web to Azure                     PASS
```

Each deployment job passes after either completing its application deployment
or safely skipping all build, authentication, deployment, and health-check
work when the push comparison proves that application is unaffected.

Expected deployment paths after validation (the jobs are independent and may
be queued by runner capacity):

```text
Parallel validation categories
├── Format, lint, type-check, and test
└── Build
    ├── Existing validation builds
    ├── Web production artifact when required
    └── API production artifact when required
            │
            ▼
Combined validation gate and coverage badge publication
├── Azure API job
│   ├── Check exact SHA and API changes
│   ├── Download and verify SHA-bound API artifact
│   ├── Managed-identity authentication and ZIP deployment
│   ├── Verify API health
│   └── Clean workspace
└── Azure Web job
    ├── Check exact SHA and Web changes
    ├── Download and verify SHA-bound Web artifact
    ├── Managed-identity authentication and ZIP deployment
    ├── Verify / and /about
    └── Clean workspace
```

Both authoritative artifact paths have been validated in production. Under
normal conditions the applications reach healthy production roughly 3–3.5
minutes after merge. The measured Azure Web job fell from about 3 minutes
20–32 seconds to 46–59 seconds; the API Stage 1 control job took about 3 minutes
45 seconds and its authoritative path took about 56 seconds.

---

## 23. Production Smoke Tests

### API

```bash
curl -i "https://<production-api-host>/health"
```

Expected:

```text
HTTP 200
```

Also:

```bash
curl -i "https://<production-api-host>/api/v1/"
```

Expected:

```text
HTTP 200
```

### Web

```bash
curl -I "https://<production-web-host>/"
curl -I "https://<production-web-host>/about"
curl -I "https://<production-web-host>/explore"
```

Expected:

```text
HTTP 200
```

The exact production hostnames can be retrieved from Azure rather than duplicated into scripts:

```bash
az webapp show   --resource-group witsworld-rg   --name <app-name>   --query defaultHostName   --output tsv
```

---

## 24. Troubleshooting

### API starts locally but App Service remains unhealthy

Check:

```bash
az webapp log startup show   --name witsworld-api   --resource-group witsworld-rg
```

Look for:

```text
Server listening
Wits World API started
Site startup probe succeeded
```

### API deployment command times out

A timeout does not necessarily mean the uploaded application is broken.

Check startup logs and then directly test:

```text
GET /health
```

The first manual API deployment demonstrated this case: `az webapp deploy` stopped waiting, but the application later completed startup successfully.

### API ZipDeploy stalls in `LocalZipHandler`

If Kudu stops progressing while extracting the outer deployment ZIP, inspect
the archive before retrying:

```bash
unzip -Z1 witsworld-api-deploy.zip
```

The expected dependency entry is the single `node_modules.tar.gz` file. An
outer `node_modules/` tree is invalid because it makes Kudu extract thousands of
small dependency files before the application can restart. CI rejects that
layout and separately verifies the contents of the dependency tarball. Keep
`BUILD_FLAGS=Off`; do not work around this failure by enabling App Service build
automation or SCM Basic Auth.

### Frontend ZIP deployment fails with HTTP 400

Inspect the archive:

```bash
unzip -l <deployment.zip>
```

Linux App Service deployment packages must use normal ZIP paths such as:

```text
assets/file.js
```

The first PowerShell-created frontend archive used entries such as:

```text
assets\file.js
```

Recreating the deployment ZIP on Linux resolved the problem.

The automated Web deployment now creates the ZIP on the Linux-based C220
runner, preventing recurrence while keeping the Azure runner deployment-only.

### Missing API environment variables

List names only:

```bash
az webapp config appsettings list   --resource-group witsworld-rg   --name witsworld-api   --query "[].name"   --output tsv | sort
```

Do not print production secret values into CI logs or documentation.

### Missing frontend build variables

Check Gitea repository:

```text
Settings -> Actions -> Variables
```

Required variables:

```text
VITE_API_BASE_URL
VITE_AUTH0_DOMAIN
VITE_AUTH0_CLIENT_ID
VITE_AUTH0_AUDIENCE
VITE_MAPBOX_ACCESS_TOKEN
```

### Docker unexpectedly authenticates to Azure

This is a security failure.

Check:

```bash
sudo iptables -S DOCKER-USER
```

Expected rule:

```text
-d 169.254.169.254/32 -j REJECT
```

Also verify:

```bash
systemctl is-enabled block-docker-imds.service
systemctl is-active block-docker-imds.service
```

Expected:

```text
enabled
active
```

### Runner cannot inspect unrelated Azure resources

This is expected.

The managed identity is intentionally scoped only to the two App Services and therefore should not have general read access to the entire resource group, VM, or App Service Plan.

Do not broaden the runner's permissions merely to make infrastructure audit commands succeed.

---

## 25. Remaining Azure-Related Work

The actionable API and frontend Azure hosting setup is complete.

Remaining work is limited to release-specific validation and operational review:

- Verify the relevant Web and API deployment jobs after each release merge when
  their change detection paths trigger them.
- Re-test the live frontend and API after the release deployment.
- Validate the full Auth0 login/logout production flow with a safe test account.
- Rehearse and approve the documented production database release procedure before the first database-dependent release.
- Verify the Cloudflare Pages documentation deployment after documentation
  changes merge to `main`.
- Review Azure Cost Management periodically for the App Service Plan, runner VM, disk, and networking usage.

The following are not required for the current student-project deployment:

```text
Application Insights
Deployment slots
Higher App Service tier
Azure-hosted database
Azure platform authentication
Key Vault
Additional redundancy/scaling
```

These can be revisited only if project requirements change.

---

## 26. Operational Checklist

Before considering a production release healthy:

### CI and deployment

- [ ] All five parallel validation jobs and the combined gate are green.
- [ ] Production deployment ran only from `main`.
- [ ] Runner authenticated with `az login --identity`.
- [ ] Exact expected commit was deployed.
- [ ] API deployment completed.
- [ ] Web deployment completed.
- [ ] Temporary deployment workspaces were cleaned.

### API

- [ ] `/health` returned HTTP 200.
- [ ] `/api/v1/` returned HTTP 200 when smoke-tested.
- [ ] `CORS_ALLOWED_ORIGIN` matches the exact production web origin.
- [ ] `MAX_PLAUSIBLE_JOURNEY_SPEED_METRES_PER_SECOND` is set to the reviewed
      environment value before the issue `#169` API starts.
- [ ] No secrets appeared in workflow logs.

### Database

- [ ] The database release target and exact database name were confirmed before any write.
- [ ] The guarded database release procedure completed for the exact release commit.
- [ ] PostGIS and migration verification passed.
- [ ] Migration `0032_add_movement_eligibility_decisions.sql` was applied before
      deploying the issue `#169` API.
- [ ] Demonstration seeding was either separately approved and verified or deliberately skipped.
- [ ] No database connection URL or credential appeared in evidence or logs.
- [ ] The authenticated deployed event-discovery path returned the intended seeded event when seeding was approved.

### Web

- [ ] `/` returned HTTP 200.
- [ ] `/about` returned HTTP 200.
- [ ] `/explore` returned HTTP 200 when smoke-tested.
- [ ] Direct SPA route refresh works.
- [ ] Browser DevTools shows no relevant production errors.

### Runner security

- [ ] Normal Docker jobs remain unable to reach Azure IMDS.
- [ ] `block-docker-imds.service` remains enabled and active.
- [ ] Managed identity remains scoped only to `witsworld-api` and `witsworld-web`.

---

## 27. Summary

At the end of this setup phase, Wits World has:

```text
Dedicated Azure resource group                        DONE
Shared Linux B1 App Service Plan                      DONE

Separate production API App Service                  DONE
Production API environment configuration             DONE
Strict production API CORS configuration             DONE
API HTTPS/TLS/runtime hardening                      DONE
API health check                                     DONE
API application logging                              DONE
Manual production API deployment                     DONE
Production /health validation                        DONE
Production /api/v1/ validation                       DONE
Gitea API continuous-deployment workflow             DONE
API main-branch deployment validation                DONE

Separate production Web App Service                  DONE
Frontend PM2 SPA serving configuration               DONE
Frontend HTTPS/TLS/runtime hardening                 DONE
Frontend Auth0 production URL configuration          DONE
Development/production Auth0 resource separation     OUTSTANDING REMEDIATION
Frontend health check                                DONE
Frontend application logging                         DONE
Manual production frontend deployment                DONE
Frontend SPA route validation                        DONE
Frontend browser smoke testing                       DONE
Gitea frontend continuous-deployment workflow        DONE
Independent API + Web deployment paths               VALIDATED IN PRODUCTION

Repository-scoped Gitea runner VM                    DONE
Docker-based CI execution                            DONE
Azure CLI on deployment runner                       DONE
System-assigned managed identity                     DONE
App-scoped Website Contributor roles                 DONE
Docker access to Azure IMDS blocked                  DONE
Persistent IMDS firewall protection                  DONE
Dedicated host-only deployment runner label          DONE

Full Auth0 login/logout application-flow test        MANUAL PER RELEASE
Documentation static deployment                      DONE — CLOUDFLARE PAGES
Canonical web domain and public Auth0 discovery      VERIFIED 2026-08-22
Application Insights                                 OPTIONAL
Deployment slots / additional scaling                OPTIONAL
```

The current architecture provides independently deployable frontend and API applications on one shared Azure App Service Plan, automated production deployment through Gitea Actions, health verification after deployment, and a least-privilege managed-identity deployment model without storing Azure credentials in the repository or CI system.

---

## AI Assistance Declaration

This document was drafted and updated with assistance from:

```text
ChatGPT-Web[GPT-5.6 Sol]
Codex-CLI[GPT-5]
Codex[GPT-5]
```

Review the document against the current repository and Azure configuration before committing it. Keep the declaration if required by the project's AI attribution policy.

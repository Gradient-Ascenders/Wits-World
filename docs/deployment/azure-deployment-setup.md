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

The documentation application is expected to use static hosting later rather than consume the B1 App Service Plan.

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

The production startup command is:

```bash
node /home/site/wwwroot/apps/api/dist/server.js
```

This directly starts the compiled Fastify server from the deployed artifact.

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

`DATABASE_URL` is a secret and must never be committed.

`AUTH0_DOMAIN` and `AUTH0_AUDIENCE` are environment-specific authentication configuration and should be managed through deployment/environment configuration rather than duplicated unnecessarily in source.

### 7.1 Production CORS origin

The API allows the exact production frontend origin:

```text
CORS_ALLOWED_ORIGIN =
https://witsworld-web-fqabhufqgvapapgq.southafricanorth-01.azurewebsites.net
```

A wildcard origin is not used.

### 7.2 PORT

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
```

These values are supplied during the Vite build performed by Gitea Actions.

They are intentionally stored as Gitea Variables rather than Azure App Service runtime settings because Vite embeds `VITE_*` configuration into the generated browser bundle at build time.

`VITE_*` values are browser-visible configuration and must not contain secrets.

---

## 9. Auth0 Production URL Configuration

The Auth0 Single Page Application used by the frontend is:

```text
Wits World Web – Development
```

The production frontend origin was added alongside the existing localhost development URL to:

```text
Allowed Callback URLs
Allowed Logout URLs
Allowed Web Origins
```

Production origin:

```text
https://witsworld-web-fqabhufqgvapapgq.southafricanorth-01.azurewebsites.net
```

The existing localhost development entries remain configured.

Full login/logout production validation is deferred until the application login UI is implemented by the team.

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
Gitea act_runner
```

Node.js and npm are not installed directly on the host. Build jobs use versioned Node Docker images.

Verified versions during setup included:

```text
Git:        2.43.0
Docker:     29.7.2
Azure CLI:  2.89.0
zip:        3.0
curl:       8.5.0
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

Normal CI jobs execute inside Docker containers:

```yaml
ubuntu-latest:docker://docker.gitea.com/runner-images:ubuntu-latest
ubuntu-22.04:docker://docker.gitea.com/runner-images:ubuntu-22.04
ubuntu-20.04:docker://docker.gitea.com/runner-images:ubuntu-20.04
```

A dedicated host-execution label is configured for production deployment:

```yaml
azure-deploy:host
```

This gives the runner two execution modes:

```text
ubuntu-*      -> Docker container
azure-deploy  -> VM host
```

Normal validation jobs remain containerised, while privileged production deployment jobs execute on the VM host and can use its Azure managed identity.

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
    npm ci --omit=dev --workspace @wits-world/api
  '
```

### 16.3 Deployment artifact

The API deployment ZIP contains:

```text
package.json
package-lock.json
node_modules/
apps/
└── api/
    ├── package.json
    └── dist/
database/
```

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

Authentication UI/login-flow validation is deferred until the application login interface is implemented.

---

## 18. Continuous Integration

The repository has four independent CI jobs:

```text
Repository formatting
Web application
API application
Documentation application
```

These run using Docker-backed `ubuntu-latest` jobs on the self-hosted Gitea runner.

The workflow runs for:

```yaml
pull_request:
  branches:
    - main

push:
  branches:
    - main
```

This allows pull requests to be validated without deployment and allows merges/pushes to `main` to trigger production deployment after validation succeeds.

---

## 19. Continuous Deployment Design

The deployment workflow contains two production deployment jobs:

```text
Deploy API to Azure
Deploy Web to Azure
```

### 19.1 API deployment

The API deployment depends on all four CI jobs.

Conceptually:

```text
Push to main
      │
      ├── Repository formatting
      ├── Web application
      ├── API application
      └── Documentation application
              │
              │ all successful
              ▼
        Deploy API to Azure
              │
              ├── Fetch exact main commit
              ├── Build production API
              ├── Package runtime files
              ├── az login --identity
              ├── Deploy ZIP
              └── Verify /health
```

The deployment condition is:

```yaml
if: ${{ gitea.event_name == 'push' && gitea.ref == 'refs/heads/main' }}
```

### 19.2 Web deployment

The web deployment runs after the API deployment succeeds:

```text
Deploy API to Azure
        │
        │ success
        ▼
Deploy Web to Azure
        │
        ├── Fetch exact main commit
        ├── Validate Vite build variables
        ├── Build frontend in Node Docker container
        ├── Create ZIP on Linux
        ├── az login --identity
        ├── Deploy ZIP
        ├── Verify /
        └── Verify /about
```

The frontend package is created from the **contents** of `apps/web/dist`, so Azure receives:

```text
/home/site/wwwroot/index.html
/home/site/wwwroot/assets/...
```

rather than a nested `dist` directory.

### 19.3 Pull request versus main behaviour

```text
Pull request -> CI runs -> production deployment skipped
Push/merge to main -> CI runs -> API deployment -> web deployment
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
Deployment waits for required CI jobs
Main branch protected through PR workflow
Frontend build values stored as Gitea Variables
Temporary deployment workspaces removed after jobs complete
```

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
Repository formatting       PASS
Web application             PASS
API application             PASS
Documentation application   PASS
Deploy API to Azure         SKIPPED
Deploy Web to Azure         SKIPPED
```

Production must not be modified by a pull-request workflow.

### Merge/push to `main`

Expected jobs:

```text
Repository formatting       PASS
Web application             PASS
API application             PASS
Documentation application   PASS
Deploy API to Azure         PASS
Deploy Web to Azure         PASS
```

Expected deployment order:

```text
Check out exact main commit
Build production API package
Authenticate to Azure
Deploy API to Azure
Verify production API health
Clean API deployment workspace
        ↓
Check out exact main commit
Validate production web configuration
Build production web package
Authenticate to Azure
Deploy web application to Azure
Verify production website
Clean web deployment workspace
```

The API main-branch deployment path has already been validated successfully.

The new combined API + Web post-merge deployment path remains to be proven after the Azure continuation branch is merged.

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

The automated web deployment now creates the ZIP on the runner VM, preventing recurrence.

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

Remaining work is limited to items that are either final validation steps or intentionally deferred:

- Merge the Azure continuation branch and verify that both API and Web production deployment jobs pass from `main`.
- Re-test the live frontend after the first automated web deployment.
- Validate the full Auth0 login/logout production flow once the application login UI is implemented.
- Rehearse and approve the documented production database release procedure before the first database-dependent release.
- Deploy the documentation site using static hosting once the real Docusaurus site is ready.
- Review Azure Cost Management periodically for the App Service Plan, runner VM, disk, and networking usage.
- Consider a custom domain later if required.

The following are not required for the current student-project deployment:

```text
Custom domain
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

- [ ] All four CI jobs are green.
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
- [ ] No secrets appeared in workflow logs.

### Database

- [ ] The database release target and exact database name were confirmed before any write.
- [ ] The guarded database release procedure completed for the exact release commit.
- [ ] PostGIS and migration verification passed.
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
Frontend health check                                DONE
Frontend application logging                         DONE
Manual production frontend deployment                DONE
Frontend SPA route validation                        DONE
Frontend browser smoke testing                       DONE
Gitea frontend continuous-deployment workflow        IMPLEMENTED
Combined API + Web main-branch deployment proof      PENDING FINAL MERGE TEST

Repository-scoped Gitea runner VM                    DONE
Docker-based CI execution                            DONE
Azure CLI on deployment runner                       DONE
System-assigned managed identity                     DONE
App-scoped Website Contributor roles                 DONE
Docker access to Azure IMDS blocked                  DONE
Persistent IMDS firewall protection                  DONE
Dedicated host-only deployment runner label          DONE

Full Auth0 login/logout application-flow test        DEFERRED UNTIL LOGIN UI EXISTS
Documentation static deployment                      DEFERRED UNTIL DOCUSAURUS SITE IS READY
Custom domain                                        OPTIONAL
Application Insights                                 OPTIONAL
Deployment slots / additional scaling                OPTIONAL
```

The current architecture provides independently deployable frontend and API applications on one shared Azure App Service Plan, automated production deployment through Gitea Actions, health verification after deployment, and a least-privilege managed-identity deployment model without storing Azure credentials in the repository or CI system.

---

## AI Assistance Declaration

This document was drafted and updated with assistance from:

```text
ChatGPT-Web[GPT-5.6 Sol]
```

Review the document against the current repository and Azure configuration before committing it. Keep the declaration if required by the project's AI attribution policy.

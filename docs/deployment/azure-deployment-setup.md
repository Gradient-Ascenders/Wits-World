# Azure Deployment Setup

> **Project:** Wits World  
> **Game/topic:** Wits Quest  
> **Course:** COMS3011A Software Design Project  
> **Scope of this document:** Azure setup work completed after the initial Gitea CI pipeline was established.

## 1. Purpose

This document records the Azure infrastructure, security configuration, manual deployment validation, and Gitea continuous-deployment setup used for Wits World.

The deployment architecture keeps the frontend and backend independently deployable. The API is hosted as its own Azure App Service application, while the frontend will be hosted separately. Both application services are intended to share the same Azure App Service Plan to control cost while preserving separation between the web and API deployments.

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

Planned but not yet completed in this setup phase:

```text
ASP-witsworld
└── Wits World frontend App Service
```

The documentation application is expected to use static hosting rather than consume the B1 application plan.

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
Name:            ASP-witsworld
Operating system: Linux
Region:          South Africa North
Pricing tier:    Basic B1
Instances:       1
Zone redundancy: Disabled
```

Additional tag:

```text
Purpose = AppHosting
```

The plan is intentionally shared between independently deployable App Services.

This means the eventual architecture can contain:

```text
ASP-witsworld
├── witsworld-api
└── witsworld-web
```

The applications remain logically and operationally separate even though they share the same underlying App Service Plan resources.

---

## 5. Wits World API App Service

The API application was created as:

```text
App Service name: witsworld-api
Publish model:    Code
Runtime:          Node 24 LTS
Operating system: Linux
Region:           South Africa North
Plan:             ASP-witsworld
Public access:    Enabled
```

Azure's built-in continuous deployment was deliberately left disabled because deployment is handled by Gitea Actions.

Azure database creation was not enabled because the production database is hosted externally on Neon PostgreSQL/PostGIS.

Application Insights was not enabled during the initial setup.

### 5.1 Runtime configuration

The production startup command is:

```bash
node /home/site/wwwroot/apps/api/dist/server.js
```

This directly starts the compiled Fastify server from the deployed artifact.

Important App Service configuration includes:

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

---

## 6. Production Environment Variables

The following application settings are configured in Azure:

```text
AUTH0_AUDIENCE
AUTH0_DOMAIN
DATABASE_URL
HOST
LOG_LEVEL
NODE_ENV
WEBSITE_HEALTHCHECK_MAXPINGFAILURES
WEBSITE_HTTPLOGGING_RETENTION_DAYS
```

The intended non-secret values are:

```text
HOST      = 0.0.0.0
LOG_LEVEL = info
NODE_ENV  = production
```

The following values are secret or environment-specific and must never be committed:

```text
DATABASE_URL
AUTH0_DOMAIN
AUTH0_AUDIENCE
```

`DATABASE_URL` points to the production Neon PostgreSQL/PostGIS database and requires TLS.

`AUTH0_DOMAIN` is configured using the Auth0 tenant hostname only.

`AUTH0_AUDIENCE` is the exact Identifier configured for the Wits World API in Auth0.

### PORT

A custom `PORT` variable is **not** configured manually.

During startup Azure App Service supplies the runtime port. The successful deployment logs showed Azure setting:

```text
PORT=8080
```

The API then listened successfully on the Azure-assigned port.

---

## 7. Health Check

Azure App Service Health Check is enabled with:

```text
Path:                      /health
Load-balancing threshold:  10 minutes
```

The health endpoint is intentionally unauthenticated so Azure can verify that the API process is alive and accepting requests.

Production validation confirmed:

```text
GET /health   -> HTTP 200
GET /api/v1/  -> HTTP 200
```

---

## 8. Logging

App Service application logging is configured as:

```text
Application logging: File System
Quota:               35 MB
Retention:           3 days
```

Useful Azure CLI diagnostics include:

```bash
az webapp log startup show \
  --name witsworld-api \
  --resource-group witsworld-rg
```

and:

```bash
az webapp log tail \
  --name witsworld-api \
  --resource-group witsworld-rg
```

The startup log was particularly useful during the first deployment because the deployment command timed out while waiting for the site to become healthy, even though the application subsequently started successfully.

Successful startup evidence included:

```text
Server listening at http://127.0.0.1:8080
Server listening at http://169.254.x.x:8080
Wits World API started
Site startup probe succeeded
```

---

## 9. Gitea Actions Runner VM

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

A 2 GiB swap file was also configured to reduce the risk of CI jobs exhausting the VM's available RAM.

### 9.1 Installed tooling

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

Node.js and npm are **not** installed directly on the host. Build jobs use versioned Node Docker images instead.

Verified versions during setup included:

```text
Git:        2.43.0
Docker:     29.7.2
Azure CLI:  2.89.0
zip:        3.0
curl:       8.5.0
```

### 9.2 act_runner

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

## 10. Runner Labels

Normal CI jobs execute inside Docker containers:

```yaml
ubuntu-latest:docker://docker.gitea.com/runner-images:ubuntu-latest
ubuntu-22.04:docker://docker.gitea.com/runner-images:ubuntu-22.04
ubuntu-20.04:docker://docker.gitea.com/runner-images:ubuntu-20.04
```

A dedicated host-execution label was added for production deployment:

```yaml
azure-deploy:host
```

This gives the runner two different execution modes:

```text
ubuntu-*      -> Docker container
azure-deploy  -> VM host
```

Normal validation jobs therefore remain containerised, while the production deployment job can execute on the VM host and use its Azure managed identity.

---

## 11. Azure Managed Identity

The runner VM has a **system-assigned managed identity** enabled.

The VM authenticates to Azure using:

```bash
az login --identity
```

No Azure username, password, client secret, or publish profile is required.

The identity was granted:

```text
Role:  Website Contributor
Scope: witsworld-api only
```

The permission is deliberately scoped to the API App Service rather than the full subscription or resource group.

Validation:

```bash
az webapp show \
  --resource-group witsworld-rg \
  --name witsworld-api
```

returned the API successfully when executed directly on the VM.

---

## 12. Preventing CI Containers from Using the Managed Identity

A security problem exists when a self-hosted CI runner has an Azure managed identity: arbitrary code running inside a build container may attempt to contact Azure Instance Metadata Service (IMDS) and obtain the VM identity token.

Azure IMDS is available at:

```text
169.254.169.254
```

Before hardening, a Docker container was able to run:

```bash
az login --identity
```

and access `witsworld-api`.

To prevent normal CI containers from obtaining production deployment credentials, Docker traffic to Azure IMDS is blocked using the `DOCKER-USER` iptables chain:

```bash
sudo iptables -I DOCKER-USER 1 \
  -d 169.254.169.254/32 \
  -j REJECT
```

After the rule was applied:

```text
Docker container -> az login --identity -> blocked
VM host          -> az login --identity -> succeeds
```

This is the intended result.

### 12.1 Persistent IMDS protection

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

## 13. First Manual API Deployment

Before automating deployment, the process was validated manually from the runner VM.

### 13.1 Build

The repository source was copied to the runner VM and the API was compiled inside Node 24:

```bash
docker run --rm \
  -v "$PWD:/workspace" \
  -w /workspace \
  node:24-bookworm-slim \
  sh -lc '
    npm ci
    npm run build --workspace @wits-world/api
  '
```

Successful validation:

```text
apps/api/dist/server.js
```

### 13.2 Production dependencies

Production dependencies were installed with the project's required npm version:

```bash
docker run --rm \
  -v "$PWD:/workspace" \
  -w /workspace \
  node:24-bookworm-slim \
  sh -lc '
    npm install -g npm@11.18.0 >/dev/null
    npm ci --omit=dev --workspace @wits-world/api
  '
```

### 13.3 Deployment artifact

The deployment ZIP contains the runtime files required by the production API:

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

### 13.4 Deployment command

The API was deployed using:

```bash
az webapp deploy \
  --resource-group witsworld-rg \
  --name witsworld-api \
  --src-path ~/witsworld-api-deploy.zip \
  --type zip \
  --clean true \
  --restart true
```

The deployment command initially reported that the site failed to start within its waiting period.

Startup diagnostics later showed that the API did start successfully and that the Azure startup probe passed.

The deployment was therefore validated using the public health endpoints rather than relying only on the first CLI wait result.

---

## 14. Continuous Integration

The repository already had four independent CI jobs before Azure deployment automation was introduced:

```text
Repository formatting
Web application
API application
Documentation application
```

These run using Docker-backed `ubuntu-latest` jobs on the self-hosted Gitea runner.

The Azure work extends the same workflow so CI runs for:

```yaml
pull_request:
  branches:
    - main

push:
  branches:
    - main
```

---

## 15. Continuous Deployment Design

The production API deployment job is:

```text
Deploy API to Azure
```

It depends on all four CI jobs:

```text
Repository formatting
Web application
API application
Documentation application
```

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

Therefore:

```text
Pull request -> CI runs -> deployment skipped
Push/merge to main -> CI runs -> deployment permitted after all CI passes
```

---

## 16. Deployment Job Security

The deployment job uses:

```yaml
runs-on: azure-deploy
```

This runs directly on the host.

The deployment job must therefore be treated as privileged infrastructure code.

Changes to:

```text
.gitea/workflows/
```

should always be reviewed carefully before merging.

Important protections currently used:

```text
No Azure secrets stored in Gitea
Managed identity scoped to witsworld-api
Normal CI container access to IMDS blocked
Deployment allowed only for pushes to main
Deployment waits for all CI jobs
Main branch protected through PR workflow
```

---

## 17. Automated Production Health Verification

After deployment, the workflow repeatedly checks:

```text
https://<production-api-host>/health
```

The production deployment is considered successful only after the API returns:

```text
HTTP 200
```

If the API does not become healthy within the retry period, the job fails and retrieves Azure startup diagnostics.

This ensures a successful ZIP upload alone is not considered a successful production release.

---

## 18. Expected Gitea Actions Behaviour

### Pull request into `main`

Expected jobs:

```text
Repository formatting       PASS
Web application             PASS
API application             PASS
Documentation application   PASS
Deploy API to Azure         SKIPPED
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
```

Inside the deployment job, the expected sequence is:

```text
Check out exact main commit
Build production API package
Authenticate to Azure
Deploy API to Azure
Verify production health
Clean deployment workspace
```

---

## 19. Production Smoke Tests

After a successful deployment, validate:

```bash
curl -i "https://<production-api-host>/health"
```

Expected:

```text
HTTP 200
```

Also validate:

```bash
curl -i "https://<production-api-host>/api/v1/"
```

Expected:

```text
HTTP 200
```

The exact production hostname should be obtained from Azure rather than hard-coded into documentation:

```bash
az webapp show \
  --resource-group witsworld-rg \
  --name witsworld-api \
  --query defaultHostName \
  --output tsv
```

---

## 20. Troubleshooting

### API starts locally but App Service remains unhealthy

Check:

```bash
az webapp log startup show \
  --name witsworld-api \
  --resource-group witsworld-rg
```

Look for:

```text
Server listening
Wits World API started
Site startup probe succeeded
```

### Deployment command times out

A timeout does not necessarily mean the uploaded application is broken.

Check startup logs and then directly test:

```text
GET /health
```

The first manual deployment demonstrated this case: `az webapp deploy` stopped waiting, but the application later completed startup successfully.

### Missing environment variables

List names only:

```bash
az webapp config appsettings list \
  --resource-group witsworld-rg \
  --name witsworld-api \
  --query "[].name" \
  --output tsv | sort
```

Do not print production secret values into CI logs or documentation.

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

Both should report the expected persistent state.

---

## 21. Remaining Azure Work

The following items remain after the API deployment setup:

- Create the separate Wits World frontend App Service under `ASP-witsworld`.
- Decide and configure the production frontend serving strategy for the Vite build.
- Configure the frontend production environment to use the Azure API hostname.
- Add strict production CORS configuration to the API for the frontend origin.
- Grant the runner managed identity deployment permission to the frontend App Service only when frontend CD is added.
- Add frontend deployment to the Gitea workflow.
- Deploy the Docusaurus documentation site using static hosting.
- Validate Auth0 production callback/logout/origin URLs once the production frontend hostname exists.
- Confirm Neon production database migrations and operational process.
- Review Azure Cost Management after sufficient billing data has accumulated.
- Consider adding a custom domain later if required.

---

## 22. Operational Checklist

Before considering an API production release healthy:

- [ ] All four CI jobs are green.
- [ ] Deployment ran only from `main`.
- [ ] Runner authenticated with `az login --identity`.
- [ ] Exact expected commit was deployed.
- [ ] Azure ZIP deployment completed.
- [ ] `/health` returned HTTP 200.
- [ ] `/api/v1/` returned HTTP 200 when manually smoke-tested.
- [ ] No secrets appeared in workflow logs.
- [ ] Normal Docker jobs remain unable to reach Azure IMDS.
- [ ] `block-docker-imds.service` remains enabled and active.

---

## 23. Summary

At the end of this setup phase, Wits World has:

```text
Dedicated Azure resource group                        DONE
Shared Linux B1 App Service Plan                      DONE
Separate production API App Service                  DONE
Production API environment configuration             DONE
HTTPS/TLS/runtime hardening                          DONE
Azure health check                                   DONE
Application logging                                  DONE
Repository-scoped Gitea runner VM                    DONE
Docker-based CI execution                            DONE
Azure CLI on deployment runner                       DONE
System-assigned managed identity                     DONE
App-scoped Website Contributor role                  DONE
Docker access to Azure IMDS blocked                  DONE
Dedicated host-only deployment runner label          DONE
Manual production API deployment                     DONE
Production /health validation                        DONE
Production /api/v1/ validation                       DONE
Gitea API continuous-deployment workflow             IMPLEMENTED
PR/main deployment-gating validation                 PENDING FINAL MERGE TEST
Frontend Azure App Service                           PENDING
Frontend continuous deployment                       PENDING
Documentation static deployment                      PENDING
```

This gives the project a working production API deployment path while keeping ordinary CI jobs isolated from Azure deployment credentials.

---

## AI Assistance Declaration

This document was drafted with assistance from:

```text
ChatGPT-Web[GPT-5.6 Sol]
```

Review the document against the current repository and Azure configuration before committing it. Keep the declaration if required by the project's AI attribution policy.

# ADR-001: Use a Monorepo with Independently Buildable Applications

## Status

Accepted

## Date

2026-08-06

## Owners and reviewers

**Owner:** Member 2 — API and Security Lead  
**Reviewer:** Member 3 — Data and Infrastructure Lead

## Context

Wits World contains a browser application, hand-written API, public
documentation application, database resources, tests, and potentially reusable
packages.

The team needs:

- one version-controlled project workspace;
- consistent development tooling;
- shared quality commands;
- coordinated changes across applications;
- clear application ownership; and
- independent builds and deployments.

Maintaining unrelated repositories would increase setup and coordination work
for a four-member team.

Combining all runtime responsibilities into one application would conflict with
the requirement for a non-monolithic front end and back end.

## Decision

Use a single Git repository managed as an npm workspace monorepo.

The principal applications are:

- `apps/web`;
- `apps/api`; and
- `apps/docs`.

Supporting packages may include:

- `packages/contracts`;
- `packages/game-rules`; and
- `packages/config`.

Database, infrastructure, end-to-end tests, and repository-level documentation
remain organised in dedicated top-level directories.

Each application must retain its own:

- package configuration;
- build command;
- test command;
- environment configuration;
- deployment process; and
- responsibility boundary.

## Reasons

This structure:

- gives the team one clone and one contribution workflow;
- allows coordinated pull requests across application boundaries;
- supports shared formatting and testing standards;
- makes integration changes easier to review;
- reduces duplicated dependency configuration;
- supports shared contracts and pure game rules; and
- still permits independent application builds and deployments.

## Consequences

### Benefits

- Team setup is simpler.
- Repository-wide checks can be run from the root.
- Cross-application changes can be reviewed together.
- Shared packages can avoid unsafe duplication.
- Documentation and evidence remain close to the implementation.

### Costs and risks

- Root commands must not hide application-specific failures.
- Workspace dependencies can become unnecessarily coupled.
- A change to one package may trigger checks for multiple applications.
- Team members must avoid placing unrelated responsibilities into shared
  packages.
- Deployment workflows must explicitly build the intended application.

## Alternatives considered

### Separate repository for each application

This would strengthen repository separation but increase setup, issue linking,
version coordination, and pull-request overhead for the team.

### Single combined web and API framework

This would simplify some deployment work but weaken the required front-end and
back-end separation and risk creating a monolithic application.

### One package without workspaces

This would be simple initially but would not clearly separate application
dependencies, commands, or deployment units.

## Related work

- S1-02 — Scaffold the monorepo and shared development standards
- S1-04 — Document the initial architecture and delivery plan
- S1-05 — Publish the initial documentation website
- S1-06 — Scaffold the mobile-first React application
- S1-07 — Scaffold the Fastify API with health and OpenAPI support

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking].
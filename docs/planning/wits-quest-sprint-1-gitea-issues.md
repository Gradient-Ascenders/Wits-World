# Wits Quest — Sprint 1 Gitea Issues

:::note[Historical issue plan]

This page preserves the Sprint 1 issue plan as it was prepared. It is not the
current backlog or current issue state.

:::

This file contains copy-ready Markdown descriptions for all Sprint 1 issues.

For each issue:

1. Create or open the issue in Gitea.
2. Copy the contents inside the `markdown` code block.
3. Paste it into the issue description.
4. Set the title, labels, milestone, assignee, project, dependencies, and due date using the metadata shown above the block.

---

# S1-01 — Resolve Sprint 1 requirements with the client

**Gitea title:** `Resolve Sprint 1 requirements with the client`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 1 — Product and Player Experience Lead`  
**Reviewer:** `Member 2 — API and Security Lead`  
**Labels:** `High Priority`, `meeting`, `documentation`  
**Estimate:** `1 day`  
**Depends on:** `None`  
**Blocks:** `S1-04, S1-10`

```markdown
## Purpose

Prevent unresolved product decisions from being silently embedded into the implementation.

## Description

Prepare for and conduct a client discussion covering:

- the Sprint 1 demonstration;
- target users;
- campus boundaries;
- the initial event location;
- event radius;
- acceptable location accuracy;
- authentication provider choice;
- evidence expected for the Sprint 1 milestone.

Record every answer as one of the following:

- **Confirmed** — agreed by the client or team;
- **Unresolved** — requires further clarification;
- **Deferred** — intentionally postponed to a later sprint.

## Included

- [ ] Prepare the client question list
- [ ] Prepare a meeting agenda
- [ ] Conduct or schedule the client discussion
- [ ] Record meeting notes and decisions
- [ ] Update the requirements register
- [ ] Create an explicit unresolved-decisions list
- [ ] Record any resulting follow-up issues

## Not included

- Final battle rules
- Complete card attributes or rarity design
- Intermediate-tier feature planning
- Advanced-tier feature planning
- Implementation of the discussed features

## Acceptance criteria

- [ ] The client discussion is recorded with the date and attendees
- [ ] Every discussed question is marked as confirmed, unresolved, or deferred
- [ ] The intended Sprint 1 demonstration is acknowledged by the team
- [ ] Requirements changes are added to the requirements register
- [ ] Unresolved numeric thresholds are not recorded as confirmed requirements
- [ ] Decisions affecting implementation are linked to the relevant Gitea issues
- [ ] Unanswered questions are assigned an owner or follow-up action

## Testing and evidence

- [ ] Meeting minutes or written client responses are attached or linked
- [ ] The updated requirements register is linked
- [ ] Resulting requirement changes are linked from this issue
- [ ] Another team member reviews the recorded decisions for accuracy

## Documentation

- [ ] Update the requirements register
- [ ] Update the stakeholder interaction log
- [ ] Record significant technical decisions in the relevant decision document
- [ ] Include an AI-use declaration where required

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] Relevant evidence is attached or linked
- [ ] Another team member has reviewed the recorded decisions
- [ ] Follow-up work has been created as separate Gitea issues
- [ ] This issue is linked from any resulting pull request or documentation change
- [ ] AI assistance is attributed where applicable
```

---

# S1-02 — Scaffold the monorepo and shared development standards

**Gitea title:** `Scaffold the monorepo and shared development standards`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 4 — Cards, Game Systems and Quality Lead`  
**Reviewer:** `Member 3 — Data and Infrastructure Lead`  
**Labels:** `High Priority`, `feature`, `documentation`, `testing`  
**Estimate:** `1.5 days`  
**Depends on:** `None`  
**Blocks:** `S1-05, S1-06, S1-07, S1-08, S1-09`

```markdown
## Purpose

Give every team member a consistent repository structure and development workflow.

## Description

Create the monorepo foundation for the independently deployable web, API, and documentation applications.

Add shared development standards for TypeScript, formatting, linting, testing, environment configuration, pull requests, and AI attribution.

## Included

- `apps/web`
- `apps/api`
- `apps/docs`
- Shared packages or configuration where useful
- Root install, build, lint, type-check, and test commands
- Pull-request template
- Git ignore rules
- Environment example files
- AI-attribution section in the repository README

## Not included

- Complete application features
- Production deployment
- Card or battle implementation
- Final visual design

## Acceptance criteria

- [ ] A clean clone can install dependencies using the documented command
- [ ] Root commands exist for building, linting, type-checking, and testing
- [ ] The web, API, and documentation applications have separate directories
- [ ] The web and API applications can be built independently
- [ ] Local secret files are ignored by Git
- [ ] Example environment files contain no real credentials
- [ ] The README contains the required AI-use or non-use declarations

## Testing and evidence

- [ ] The setup commands are tested from a clean clone or clean workspace
- [ ] Successful command output is attached to the issue or pull request
- [ ] Another member follows the setup instructions successfully

## Documentation

- [ ] Add the root README
- [ ] Add contribution instructions
- [ ] Document the required runtime and package-manager versions
- [ ] Document the repository structure
- [ ] Document AI-attribution expectations

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] Relevant automated checks pass
- [ ] CI passes when CI is available
- [ ] Another team member reviews the pull request
- [ ] The issue is linked from the pull request
- [ ] Follow-up work is recorded
- [ ] AI assistance is attributed where applicable
```

---

# S1-03 — Establish the project and Git methodology

**Gitea title:** `Establish the project and Git methodology`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 4 — Cards, Game Systems and Quality Lead`  
**Reviewer:** `Member 1 — Product and Player Experience Lead`  
**Labels:** `High Priority`, `documentation`  
**Estimate:** `1 day`  
**Depends on:** `None`  
**Blocks:** `S1-18`

```markdown
## Purpose

Establish a project-management and Git workflow that the team can actively follow and demonstrate with evidence.

## Description

Configure the Gitea project board and document the team's Scrum-lite cadence, issue lifecycle, branch strategy, pull-request process, review expectations, meeting evidence, and Definition of Done.

The process must be practical enough for the team to use continuously rather than existing only as documentation.

## Included

- Gitea columns:
  - Backlog
  - In Progress
  - Review & Test
  - Done
- Sprint 1 milestone
- Existing project labels
- Weekly planning and review process
- Short-lived branch workflow
- Pull-request and review process
- Definition of Ready
- Definition of Done
- Meeting-minute template
- Decision-record template
- AI-attribution workflow

## Not included

- Additional project-management platforms
- Excessive Scrum ceremonies
- Automatic issue creation
- Individual performance monitoring

## Acceptance criteria

- [ ] All Sprint 1 issues appear on the Gitea board
- [ ] Every issue has an assignee, reviewer, labels, milestone, estimate, and acceptance criteria
- [ ] The Git methodology is documented and motivated
- [ ] The project methodology is documented and motivated
- [ ] The Definition of Done includes review, testing, CI, documentation, evidence, and AI attribution
- [ ] A meeting-minute template exists
- [ ] A decision-record template exists
- [ ] The team agrees to the documented process

## Testing and evidence

- [ ] A screenshot of the populated board is attached
- [ ] At least one issue is moved through the documented workflow
- [ ] Another team member confirms that the workflow is understandable and usable

## Documentation

- [ ] Add a project methodology page
- [ ] Add a Git workflow page
- [ ] Add meeting-minute and decision-record templates
- [ ] Add the Definition of Ready and Definition of Done

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] Documentation is reviewed
- [ ] Board evidence is attached
- [ ] Resulting follow-up work is recorded
- [ ] AI assistance is attributed where applicable
```

---

# S1-04 — Document the initial architecture and delivery plan

**Gitea title:** `Document the initial architecture and delivery plan`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 2 — API and Security Lead`  
**Reviewer:** `Member 3 — Data and Infrastructure Lead`  
**Labels:** `High Priority`, `documentation`, `research`  
**Estimate:** `1 day`  
**Depends on:** `S1-01`  
**Blocks:** `S1-05, S1-08, S1-09, S1-10`

```markdown
## Purpose

Create a shared technical direction and delivery plan before the team embeds major architectural assumptions into the codebase.

## Description

Document the initial Wits Quest architecture, including the separately deployable front end, API, database, authentication provider, map service, documentation site, and CI/CD flow.

Clearly distinguish confirmed decisions, recommendations, unresolved questions, and deferred work.

## Included

- System context diagram
- Application or container diagram
- Deployment diagram
- High-level data flow
- Trust boundaries
- Technology-stack list and motivation
- Three-sprint roadmap
- Initial risk register
- Architecture decision records for major choices

## Not included

- Detailed class diagrams for every component
- Final database schema
- Complete API specification
- Final card or battle design
- Production capacity planning

## Acceptance criteria

- [ ] The front end and API are shown as separate applications
- [ ] The browser-reported location is identified as untrusted input
- [ ] PostgreSQL/PostGIS is shown as the authoritative event-distance store
- [ ] The API is shown as authoritative for eligibility and protected game rules
- [ ] The map provider is shown as a presentation integration rather than an authority
- [ ] Provisional and confirmed decisions are clearly distinguished
- [ ] Major technology choices are motivated
- [ ] The roadmap covers Sprint 1, Sprint 2, Sprint 3, and final submission at a high level
- [ ] Major technical and delivery risks are recorded

## Testing and evidence

- [ ] Members 2 and 3 review the architecture
- [ ] At least one other team member reviews the diagrams for clarity
- [ ] Identified architecture risks become linked issues or decision records

## Documentation

- [ ] Add the architecture overview
- [ ] Add technology-stack motivation
- [ ] Add the delivery roadmap
- [ ] Add the initial risk register
- [ ] Add architecture decision records where needed

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] Documentation review is complete
- [ ] Resulting decisions and risks are recorded
- [ ] Follow-up issues are linked
- [ ] AI assistance is attributed where applicable
```

---

# S1-05 — Publish the initial documentation website

**Gitea title:** `Publish the initial documentation website`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 4 — Cards, Game Systems and Quality Lead`  
**Reviewer:** `Member 1 — Product and Player Experience Lead`  
**Labels:** `High Priority`, `documentation`, `feature`  
**Estimate:** `1.5 days`  
**Depends on:** `S1-02, S1-04`  
**Blocks:** `S1-18`

```markdown
## Purpose

Provide the publicly available, version-controlled documentation website required for the project.

## Description

Configure Docusaurus or the agreed equivalent, publish it using static hosting, and add useful Sprint 1 documentation.

The site must be accessible without requiring a user account.

## Included

- Public documentation deployment
- Project overview
- Getting-started guide
- Architecture overview
- Methodology documentation
- Requirements and roadmap
- AI-use declaration
- Documentation contribution guide
- Basic navigation and search where supported

## Not included

- Complete final user manual
- Complete API reference
- Marketing website
- Final visual branding

## Acceptance criteria

- [ ] The documentation website is publicly accessible without an account
- [ ] The site is generated from version-controlled Markdown or MDX content
- [ ] Deployment is triggered automatically or through a documented repeatable process
- [ ] The getting-started instructions are non-trivial and usable
- [ ] Navigation exposes setup, architecture, methodology, requirements, and roadmap pages
- [ ] The site works on mobile and desktop widths
- [ ] Internal links are checked automatically where practical

## Testing and evidence

- [ ] The public URL is attached
- [ ] Deployment logs or workflow evidence are attached
- [ ] Another member follows the getting-started guide
- [ ] Mobile and desktop screenshots are attached

## Documentation

- [ ] Create the initial documentation pages
- [ ] Document how to run the site locally
- [ ] Document how to update and deploy the site
- [ ] Include the relevant AI-use declaration

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] The documentation build passes
- [ ] CI passes
- [ ] Another team member reviews the site
- [ ] The issue is linked from the pull request
- [ ] AI assistance is attributed where applicable
```

---

# S1-06 — Scaffold the mobile-first React application

**Gitea title:** `Scaffold the mobile-first React application`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 1 — Product and Player Experience Lead`  
**Reviewer:** `Member 4 — Cards, Game Systems and Quality Lead`  
**Labels:** `High Priority`, `frontend`, `feature`, `testing`  
**Estimate:** `1 day`  
**Depends on:** `S1-02`  
**Blocks:** `S1-11, S1-16`

```markdown
## Purpose

Create a reliable and accessible front-end foundation for the Sprint 1 player journey.

## Description

Set up the React and Vite application with TypeScript, routing, a mobile-first application shell, configuration validation, loading states, error handling, and an initial component-test setup.

## Included

- React and Vite setup
- TypeScript configuration
- Basic routing
- Mobile-first application shell
- Main navigation region
- Error boundary
- Loading state
- Environment-variable validation
- Initial component test
- Basic accessibility structure

## Not included

- Final visual identity
- Map implementation
- Authentication-provider integration
- Event or location API integration
- Author interface

## Acceptance criteria

- [ ] The application starts using the documented command
- [ ] The application builds successfully
- [ ] The application renders correctly at a narrow mobile viewport
- [ ] The application also remains usable at a desktop viewport
- [ ] Missing required configuration produces a clear development error
- [ ] An unexpected component error produces a usable fallback
- [ ] Keyboard focus is visible
- [ ] The page contains appropriate landmark and heading structure
- [ ] At least one component test passes

## Testing and evidence

- [ ] A component test covers the application shell
- [ ] Mobile and desktop screenshots are attached
- [ ] Keyboard navigation is checked manually
- [ ] Build and test output are attached or visible in CI

## Documentation

- [ ] Add the web-application setup guide
- [ ] Document web environment variables
- [ ] Document the initial front-end structure

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] Tests pass
- [ ] CI passes
- [ ] Another team member reviews the pull request
- [ ] Accessibility considerations are recorded
- [ ] AI assistance is attributed where applicable
```

---

# S1-07 — Scaffold the Fastify API with health and OpenAPI support

**Gitea title:** `Scaffold the Fastify API with health and OpenAPI support`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 2 — API and Security Lead`  
**Reviewer:** `Member 4 — Cards, Game Systems and Quality Lead`  
**Labels:** `High Priority`, `backend`, `feature`, `testing`, `documentation`  
**Estimate:** `1 day`  
**Depends on:** `S1-02`  
**Blocks:** `S1-12, S1-15`

```markdown
## Purpose

Create the hand-written API foundation required for the Wits Quest back end.

## Description

Configure a Fastify and TypeScript application with runtime configuration validation, structured error handling, request identifiers, a health endpoint, a versioned route prefix, OpenAPI generation, and an API integration-test harness.

## Included

- Fastify application
- TypeScript configuration
- `/health` endpoint
- `/api/v1` route prefix
- Runtime environment validation
- Consistent safe error responses
- Request or correlation IDs
- OpenAPI configuration
- API integration-test setup

## Not included

- Authentication implementation
- Database queries
- Event business rules
- Challenge, card, or battle endpoints
- Production monitoring

## Acceptance criteria

- [ ] `GET /health` returns a successful response
- [ ] The API starts using the documented command
- [ ] The API builds successfully
- [ ] Invalid required configuration prevents unsafe startup
- [ ] Error responses include an HTTP status, application code, safe detail, and request ID
- [ ] OpenAPI output includes the health endpoint
- [ ] Internal stack traces are not exposed in production-style responses
- [ ] The health endpoint has an automated integration test

## Testing and evidence

- [ ] An API integration test covers the health endpoint
- [ ] A test covers invalid configuration
- [ ] Example health and error responses are attached
- [ ] OpenAPI output or a screenshot is attached

## Documentation

- [ ] Add the API setup guide
- [ ] Document the API versioning approach
- [ ] Document the error-response model
- [ ] Document API environment variables

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] Tests pass
- [ ] CI passes
- [ ] Another team member reviews the pull request
- [ ] The issue is linked from the pull request
- [ ] AI assistance is attributed where applicable
```

---

# S1-08 — Configure PostgreSQL and PostGIS development environments

**Gitea title:** `Configure PostgreSQL and PostGIS development environments`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 3 — Data and Infrastructure Lead`  
**Reviewer:** `Member 2 — API and Security Lead`  
**Labels:** `High Priority`, `database`, `documentation`, `testing`  
**Estimate:** `1.5 days`  
**Depends on:** `S1-02, S1-04`  
**Blocks:** `S1-13`

```markdown
## Purpose

Remove the geospatial database setup blocker before event and eligibility implementation begins.

## Description

Provide a repeatable local PostgreSQL and PostGIS development environment, database connection configuration, migration commands, a separate test database, and a database-readiness check.

## Included

- Local PostgreSQL/PostGIS setup
- PostGIS extension
- Development database
- Test database
- Migration tooling
- API database configuration
- Readiness or connection check
- Example environment configuration
- Basic troubleshooting guidance

## Not included

- Final production database hosting
- Production backups
- Complete semester database schema
- Event imports from external data sources

## Acceptance criteria

- [ ] A documented command starts PostgreSQL with PostGIS enabled
- [ ] The API can connect using environment-based configuration
- [ ] Migration tooling can connect successfully
- [ ] Development and test environments use separate databases
- [ ] Local secrets are loaded from ignored environment files
- [ ] Example configuration contains no real credentials
- [ ] A readiness check detects unavailable database connections
- [ ] A query confirms that the PostGIS extension is available

## Testing and evidence

- [ ] PostGIS version-query evidence is attached
- [ ] Database setup is tested by another member
- [ ] A database connection or readiness test is included
- [ ] Setup is tested from a clean local environment where practical

## Documentation

- [ ] Add the database setup guide
- [ ] Document database environment variables
- [ ] Document migration commands
- [ ] Add troubleshooting notes

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] Database checks pass
- [ ] Documentation is reviewed
- [ ] No credentials are committed
- [ ] The issue is linked from the pull request
- [ ] AI assistance is attributed where applicable
```

---

# S1-09 — Establish CI and initial application deployments

**Gitea title:** `Establish CI and initial application deployments`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 3 — Data and Infrastructure Lead`  
**Reviewer:** `Member 4 — Cards, Game Systems and Quality Lead`  
**Labels:** `High Priority`, `testing`, `documentation`, `feature`  
**Estimate:** `2 days`  
**Depends on:** `S1-02, S1-04, S1-06, S1-07`  
**Blocks:** `S1-18`

```markdown
## Purpose

Ensure contributions are checked automatically and that the web application and API can be demonstrated externally.

## Description

Configure continuous integration for pull requests and establish the initial deployments for the front-end and API applications.

CI must independently check the web, API, and documentation applications where applicable.

## Included

- Dependency installation
- Formatting or lint checks
- Type checking
- Automated tests
- Web build
- API build
- Documentation build
- Pull-request CI
- Initial web deployment
- Initial API deployment
- Deployment environment configuration
- Basic deployment smoke checks

## Not included

- Advanced production monitoring
- Load testing
- Full disaster recovery
- Production-grade autoscaling
- Final backup strategy

## Acceptance criteria

- [ ] CI runs on every pull request
- [ ] CI fails when an automated test fails
- [ ] CI checks the web and API applications independently
- [ ] The documentation application is built or checked
- [ ] The deployed web application is externally accessible
- [ ] The deployed API is externally accessible
- [ ] Deployment secrets are stored outside the repository
- [ ] Deployment configuration is documented
- [ ] A simple post-deployment smoke check is available

## Testing and evidence

- [ ] A deliberately failing test is shown to fail CI before being reverted
- [ ] Successful CI evidence is attached
- [ ] Web and API deployment URLs are attached
- [ ] Smoke-test evidence is attached
- [ ] Another member verifies both deployments

## Documentation

- [ ] Document the CI jobs
- [ ] Document the deployment process
- [ ] Document required deployment environment variables
- [ ] Document known free-tier or hosting limitations

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] CI passes
- [ ] Both deployments are reachable
- [ ] Another team member reviews the pull request
- [ ] Deployment risks and limitations are recorded
- [ ] AI assistance is attributed where applicable
```

---

# S1-10 — Select and configure the authentication provider

**Gitea title:** `Select and configure the authentication provider`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 2 — API and Security Lead`  
**Reviewer:** `Member 1 — Product and Player Experience Lead`  
**Labels:** `High Priority`, `research`, `backend`, `documentation`  
**Estimate:** `1 day`  
**Depends on:** `S1-01, S1-04`  
**Blocks:** `S1-11, S1-12`

```markdown
## Purpose

Choose an established authentication solution without creating a custom password or identity system.

## Description

Compare suitable authentication providers or established libraries against the project requirements, free-tier constraints, React integration, Fastify token validation, local development, and account lifecycle support.

Record the selected option in an architecture decision record and configure a development application or tenant.

## Included

- Provider comparison
- Registration capability
- Sign-in capability
- Password-reset capability
- Account-deletion capability
- React integration
- Fastify token validation
- Free-tier or cost constraints
- Development configuration
- Token issuer and audience settings
- Initial role or claim strategy
- Architecture decision record

## Not included

- Custom password storage
- Custom password-reset implementation
- Full account-deletion workflow
- Wits SSO unless approved and available
- Complete role-management interface

## Acceptance criteria

- [ ] The selected solution supports registration, sign-in, password reset, and account deletion capabilities
- [ ] The choice is motivated in an architecture decision record
- [ ] Required web and API configuration is documented
- [ ] A development tenant or application exists
- [ ] No private client secret is exposed to browser code
- [ ] Token issuer and audience expectations are recorded
- [ ] Unresolved Wits SSO questions remain explicitly unresolved
- [ ] Provider limitations and risks are recorded

## Testing and evidence

- [ ] Development-configuration evidence is attached
- [ ] The reviewer checks the proposed browser and API security boundaries
- [ ] Sensitive values are redacted from screenshots and documentation

## Documentation

- [ ] Add the authentication architecture decision
- [ ] Document local authentication setup
- [ ] Document required environment variables
- [ ] Record account-lifecycle limitations or follow-up work

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] The decision is reviewed
- [ ] No secrets are committed
- [ ] Follow-up authentication issues are linked
- [ ] AI assistance is attributed where applicable
```

---

# S1-11 — Integrate player sign-in and protected front-end routes

**Gitea title:** `Integrate player sign-in and protected front-end routes`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 1 — Product and Player Experience Lead`  
**Reviewer:** `Member 2 — API and Security Lead`  
**Labels:** `High Priority`, `frontend`, `feature`, `testing`  
**Estimate:** `1.5 days`  
**Depends on:** `S1-06, S1-10`  
**Blocks:** `S1-16, S1-18`

```markdown
## Purpose

Ensure the Sprint 1 player journey is available only to an authenticated player.

## Description

Integrate the selected authentication client into the React application.

Provide sign-in and sign-out flows, protect the player route, handle authentication loading and failure states, and expose a safe method for obtaining an API access token.

## Included

- Sign-in action
- Sign-out action
- Protected player or map route
- Authentication loading state
- Authentication failure state
- Minimal authenticated-player display
- Safe API-token retrieval
- Redirect back to the intended route where appropriate

## Not included

- Custom registration forms
- Full password-reset interface
- Account-deletion interface
- Profile editing
- Role-management interface
- Author console

## Acceptance criteria

- [ ] An unauthenticated user cannot access the protected player route
- [ ] An unauthenticated user is directed to sign in
- [ ] Successful sign-in returns the player to the intended application route
- [ ] Sign-out removes access to the protected route
- [ ] Authentication loading is displayed without exposing protected content
- [ ] Authentication errors display a recoverable message
- [ ] Access tokens are not written to application logs
- [ ] Private provider configuration is not included in the browser bundle

## Testing and evidence

- [ ] UI tests cover authenticated and unauthenticated routing
- [ ] A test covers the authentication loading state
- [ ] A test covers an authentication error
- [ ] Sign-in and sign-out demonstration evidence is attached

## Documentation

- [ ] Document the player authentication flow
- [ ] Document required public web configuration
- [ ] Record known provider or browser limitations

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] Tests pass
- [ ] CI passes
- [ ] The security reviewer approves the integration
- [ ] The issue is linked from the pull request
- [ ] AI assistance is attributed where applicable
```

---

# S1-12 — Validate authentication tokens on protected API routes

**Gitea title:** `Validate authentication tokens on protected API routes`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 2 — API and Security Lead`  
**Reviewer:** `Member 3 — Data and Infrastructure Lead`  
**Labels:** `High Priority`, `backend`, `feature`, `testing`  
**Estimate:** `1.5 days`  
**Depends on:** `S1-07, S1-10`  
**Blocks:** `S1-15, S1-18`

```markdown
## Purpose

Make the API authoritative for player identity instead of trusting identity values supplied by the browser.

## Description

Implement bearer-token validation using the authentication provider's supported verification mechanism.

Validate the issuer, audience, signature, and expiry. Attach the validated provider identity to protected requests and return consistent authentication errors.

## Included

- Bearer-token extraction
- Signature validation
- Issuer validation
- Audience validation
- Expiry validation
- Authenticated request context
- Protected route fixture or test endpoint
- Safe `401` handling
- Safe `403` handling where needed
- OpenAPI security scheme

## Not included

- Local password validation
- Author-role management
- Account-deletion workflow
- Fine-grained object authorisation
- Session-cookie authentication unless separately approved

## Acceptance criteria

- [ ] A protected request without a token returns `401`
- [ ] A malformed token returns `401`
- [ ] An invalid-signature token returns `401`
- [ ] An expired token returns `401`
- [ ] A token with the wrong issuer or audience returns `401`
- [ ] A valid token makes authenticated identity available to the route
- [ ] Identity is derived from the validated token rather than request-body data
- [ ] Authentication failures do not expose token contents
- [ ] OpenAPI identifies protected routes correctly

## Testing and evidence

- [ ] API tests cover missing, malformed, expired, invalid, and valid tokens
- [ ] Test output is attached or visible in CI
- [ ] Logs are reviewed to confirm that tokens are not exposed

## Documentation

- [ ] Document API authentication requirements
- [ ] Add the security scheme to OpenAPI
- [ ] Document safe authentication error responses
- [ ] Record follow-up role and authorisation work

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] Tests pass
- [ ] CI passes
- [ ] Another team member reviews the pull request
- [ ] No sensitive token information is logged
- [ ] AI assistance is attributed where applicable
```

---

# S1-13 — Create the initial event migration and seed data

**Gitea title:** `Create the initial event migration and seed data`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 3 — Data and Infrastructure Lead`  
**Reviewer:** `Member 2 — API and Security Lead`  
**Labels:** `High Priority`, `database`, `feature`, `testing`  
**Estimate:** `1 day`  
**Depends on:** `S1-08`  
**Blocks:** `S1-14`

```markdown
## Purpose

Provide one authoritative database-backed event for the Sprint 1 location demonstration.

## Description

Create the minimum event schema needed for discovery and eligibility.

Store the event identity, title, geospatial point, radius, availability period, and publication state. Add a repeatable seed for one clearly identified demonstration event.

## Included

- Event identifier
- Event title
- Event description or summary where useful
- PostGIS point
- Event radius
- Start timestamp
- End timestamp
- Publication state
- Created and updated timestamps
- Appropriate constraints
- Appropriate geospatial index
- Repeatable development seed

## Not included

- Challenge schema
- Card reward schema
- Complete author audit history
- Trails or campaigns
- Automatic event placement
- Full publication workflow

## Acceptance criteria

- [ ] A migration creates the event table
- [ ] Event location is stored using a PostGIS geospatial type
- [ ] Radius and required timestamps are constrained appropriately
- [ ] Publication state is stored explicitly
- [ ] A suitable geospatial index is created
- [ ] The seed command creates exactly one identifiable demonstration event
- [ ] Running the seed repeatedly does not create uncontrolled duplicates
- [ ] Invalid required event values are rejected
- [ ] The migration can be applied to an empty test database

## Testing and evidence

- [ ] A migration-up test passes against an empty test database
- [ ] The seeded event is queried successfully
- [ ] Query output is attached
- [ ] The reviewer checks constraints and indexing

## Documentation

- [ ] Add initial event-schema documentation
- [ ] Document migration commands
- [ ] Document seeding commands
- [ ] Mark the demonstration event as non-production content

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] Migration tests pass
- [ ] CI passes
- [ ] Another team member reviews the pull request
- [ ] Schema documentation is updated
- [ ] AI assistance is attributed where applicable
```

---

# S1-14 — Implement the PostGIS event eligibility service

**Gitea title:** `Implement the PostGIS event eligibility service`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 3 — Data and Infrastructure Lead`  
**Reviewer:** `Member 2 — API and Security Lead`  
**Labels:** `High Priority`, `database`, `backend`, `testing`  
**Estimate:** `1.5 days`  
**Depends on:** `S1-13`  
**Blocks:** `S1-15`

```markdown
## Purpose

Perform the authoritative event-distance and basic eligibility calculation on the server using the stored PostGIS event location.

## Description

Implement a parameterised database service that loads an event, calculates the distance between the submitted location claim and the stored event point, and returns the information required to decide whether the event is reachable.

The service must also account for event publication and availability.

## Included

- Event lookup
- Coordinate validation
- Parameterised PostGIS distance query
- Distance in metres
- Event-radius comparison
- Event start and end checks
- Publication-state check
- Inside and outside outcomes
- Clear not-found and unavailable outcomes

## Not included

- Long-term movement analysis
- Statistical trust scoring
- Device spoofing detection
- Continuous player tracking
- Permanent storage of every location claim
- Challenge-session creation

## Acceptance criteria

- [ ] The calculation uses the event location stored in PostGIS
- [ ] Latitude and longitude are validated before querying
- [ ] Query values are parameterised
- [ ] A point clearly inside the radius produces an eligible result
- [ ] A point clearly outside the radius produces an ineligible result
- [ ] An unpublished event cannot be eligible
- [ ] An event outside its availability period cannot be eligible
- [ ] A missing event produces a clear not-found result
- [ ] Distance is returned in a documented unit
- [ ] Unconfirmed thresholds are labelled as recommendations or unresolved decisions

## Testing and evidence

- [ ] Database or service tests cover inside, outside, inactive, unpublished, and missing events
- [ ] A test covers invalid coordinates
- [ ] Calculated-distance evidence is attached
- [ ] The reviewer checks query parameterisation and trust boundaries

## Documentation

- [ ] Document the eligibility calculation
- [ ] Document the distance unit
- [ ] Record provisional radius, freshness, and accuracy assumptions
- [ ] Record known limitations of browser geolocation

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] Tests pass
- [ ] CI passes
- [ ] Another team member reviews the pull request
- [ ] No unresolved threshold is presented as confirmed
- [ ] AI assistance is attributed where applicable
```

---

# S1-15 — Expose event discovery and eligibility API endpoints

**Gitea title:** `Expose event discovery and eligibility API endpoints`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 2 — API and Security Lead`  
**Reviewer:** `Member 3 — Data and Infrastructure Lead`  
**Labels:** `High Priority`, `backend`, `feature`, `testing`, `documentation`  
**Estimate:** `1.5 days`  
**Depends on:** `S1-07, S1-12, S1-14`  
**Blocks:** `S1-16, S1-17`

```markdown
## Purpose

Connect authenticated clients to the authoritative event-discovery and eligibility logic.

## Description

Add protected API endpoints for retrieving the Sprint 1 event data and submitting a location claim.

Validate the event identifier, coordinates, reported accuracy, and acquisition timestamp. Return a safe eligibility response based on server-side logic.

## Included

- Protected event-discovery endpoint
- Protected event-eligibility endpoint
- Runtime request validation
- Event identifier validation
- Latitude and longitude validation
- Accuracy validation
- Acquisition-timestamp validation
- Safe error responses
- Request or correlation ID
- OpenAPI request and response schemas

## Not included

- Challenge-session creation
- Answer submission
- Reward issuing
- Background location tracking
- Continuous polling
- Advanced anti-cheat logic

## Acceptance criteria

- [ ] Unauthenticated requests return `401`
- [ ] The event response contains only information safe for players
- [ ] Accepted answers and private author data are not exposed
- [ ] The eligibility request accepts an event ID, latitude, longitude, accuracy, and acquisition timestamp
- [ ] Invalid coordinates return a validation error
- [ ] Invalid or implausible timestamps return a validation error or safe retry outcome
- [ ] The API obtains distance and radius results from the server-side service
- [ ] The client cannot submit `eligible: true` or another authoritative result
- [ ] The response clearly states whether the event is reachable
- [ ] Errors use the shared safe error model
- [ ] Both endpoints are documented in OpenAPI

## Testing and evidence

- [ ] API integration tests cover eligible and ineligible claims
- [ ] Tests cover invalid coordinates and timestamps
- [ ] Tests cover inactive and unpublished events
- [ ] Tests cover unauthenticated requests
- [ ] OpenAPI output and passing-test evidence are attached

## Documentation

- [ ] Add both endpoints to OpenAPI
- [ ] Document location-data privacy considerations
- [ ] Document request and response examples using non-sensitive sample data
- [ ] Document known limitations and follow-up work

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] API and database tests pass
- [ ] CI passes
- [ ] Another team member reviews the pull request
- [ ] The issue is linked from the pull request
- [ ] AI assistance is attributed where applicable
```

---

# S1-16 — Render the campus map and seeded event

**Gitea title:** `Render the campus map and seeded event`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 1 — Product and Player Experience Lead`  
**Reviewer:** `Member 3 — Data and Infrastructure Lead`  
**Labels:** `High Priority`, `frontend`, `feature`, `testing`  
**Estimate:** `1.5 days`  
**Depends on:** `S1-06, S1-11, S1-15`  
**Blocks:** `S1-17`

```markdown
## Purpose

Deliver the first visible map-based portion of the Wits Quest player experience.

## Description

Integrate MapLibre or the agreed map library, centre the initial view on the confirmed campus area, fetch the published demonstration event from the API, and display its marker and basic details.

Provide a text-based event-list fallback so the map is not the only way to discover the event.

## Included

- Campus-centred map
- Event API request
- Demonstration event marker
- Event title and basic availability information
- Loading state
- Empty state
- API error state
- Map-loading error state
- Text-based event list
- Map attribution and licensing display
- Mobile-first layout

## Not included

- Author marker placement
- Marker clustering
- Trails
- Offline maps
- Automatic event placement
- Complete visual polish

## Acceptance criteria

- [ ] The map renders at a narrow mobile viewport
- [ ] The map remains usable at a desktop viewport
- [ ] The demonstration event is loaded from the API
- [ ] The event is represented by a marker
- [ ] The event is also represented in a text-based list
- [ ] A map failure does not hide the event-list fallback
- [ ] API loading and failure states are visible and understandable
- [ ] Event status is not communicated using colour alone
- [ ] Required map licensing and attribution are displayed
- [ ] Keyboard users can access the event information outside the map

## Testing and evidence

- [ ] Component tests cover successful event loading
- [ ] A component test covers API failure
- [ ] A component test covers the text fallback
- [ ] Mobile and desktop screenshots are attached
- [ ] Keyboard-navigation evidence is attached

## Documentation

- [ ] Document the map provider and licensing
- [ ] Document required map configuration
- [ ] Document the event-list fallback
- [ ] Record known map and tile-service limitations

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] Tests pass
- [ ] CI passes
- [ ] Accessibility is reviewed
- [ ] Another team member reviews the pull request
- [ ] AI assistance is attributed where applicable
```

---

# S1-17 — Submit browser geolocation and display eligibility

**Gitea title:** `Submit browser geolocation and display eligibility`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 1 — Product and Player Experience Lead`  
**Reviewer:** `Member 2 — API and Security Lead`  
**Labels:** `High Priority`, `frontend`, `feature`, `testing`  
**Estimate:** `1.5 days`  
**Depends on:** `S1-15, S1-16`  
**Blocks:** `S1-18`

```markdown
## Purpose

Complete the player-facing portion of the Sprint 1 location-eligibility vertical slice.

## Description

Request browser geolocation after a clear user action, submit the resulting location claim to the protected API endpoint, and display reachable, unreachable, denied, timeout, inaccurate, and API-error states.

The browser must not calculate or decide final eligibility.

## Included

- User-triggered location request
- Latitude and longitude handling
- Reported accuracy handling
- Acquisition timestamp
- Eligibility API request
- Reachable state
- Unreachable state
- Permission-denied state
- Timeout state
- Inaccurate or ambiguous state
- API error state
- Retry action
- Accessible status messaging

## Not included

- Background tracking
- Continuous location polling
- Advanced spoofing detection
- Cheating accusations
- Challenge opening
- Reward issuing

## Acceptance criteria

- [ ] Location is requested only after a clear user action
- [ ] Latitude, longitude, accuracy, and acquisition time are submitted to the API
- [ ] The final eligibility result comes from the API
- [ ] The client does not calculate authoritative distance or eligibility
- [ ] Permission denial displays a useful explanation
- [ ] A timeout provides a retry action
- [ ] An inaccurate or ambiguous result provides a safe explanation and retry action
- [ ] Reachable and unreachable results are communicated using text
- [ ] Colour is not the only status indicator
- [ ] API errors do not expose sensitive details
- [ ] The interface remains usable without continuous tracking

## Testing and evidence

- [ ] UI tests mock successful geolocation
- [ ] UI tests cover permission denial
- [ ] UI tests cover timeout
- [ ] UI tests cover eligible and ineligible API results
- [ ] UI tests cover an API error
- [ ] Manual mobile-browser evidence is attached

## Documentation

- [ ] Document the player location journey
- [ ] Add location privacy and permission notes
- [ ] Document the difference between a location claim and proof of presence
- [ ] Record known browser and device limitations

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] Tests pass
- [ ] CI passes
- [ ] The security reviewer confirms that the client is not authoritative
- [ ] Another team member reviews the pull request
- [ ] AI assistance is attributed where applicable
```

---

# S1-18 — Validate and release the Sprint 1 vertical slice

**Gitea title:** `Validate and release the Sprint 1 vertical slice`  
**Project:** `Wits Quest — Development Board`  
**Milestone:** `Sprint 1`  
**Assignee:** `Member 4 — Cards, Game Systems and Quality Lead`  
**Reviewer:** `Member 1 — Product and Player Experience Lead`  
**Labels:** `High Priority`, `testing`, `documentation`  
**Estimate:** `2 days`  
**Depends on:** `S1-03, S1-05, S1-09, S1-11, S1-12, S1-17`  
**Blocks:** `None`

```markdown
## Purpose

Demonstrate that the Sprint 1 deliverables operate as one deployed journey rather than as disconnected components.

## Description

Create and execute an end-to-end validation plan covering authentication, map loading, event display, geolocation, API submission, PostGIS distance calculation, and eligibility presentation.

Perform accessibility, responsive, deployment, and documentation checks. Assemble the evidence needed for the Sprint 1 review.

## Included

- End-to-end happy-path test
- Unauthenticated-access test
- Permission-denied test
- Ineligible-location test
- API-failure test
- Accessibility smoke check
- Responsive check
- Deployment smoke test
- Documentation review
- Demonstration script
- Sprint evidence index
- Known-limitations list
- Release checklist

## Not included

- Full penetration testing
- Load testing
- Challenge and reward testing
- Complete user-research study
- Production-readiness certification

## Acceptance criteria

- [ ] The deployed web application communicates with the deployed API
- [ ] An authenticated player can complete the target Sprint 1 journey
- [ ] An unauthenticated protected API request returns `401`
- [ ] The seeded event is loaded from PostgreSQL/PostGIS
- [ ] Eligible and ineligible location claims produce different visible outcomes
- [ ] Permission denial produces a usable state
- [ ] The map has a usable text-based fallback
- [ ] CI passes on the release commit
- [ ] The documentation site is publicly available
- [ ] No known severe defect remains open
- [ ] All four members have meaningful version-control contributions
- [ ] Sprint evidence is organised and linked
- [ ] AI usage is attributed according to course policy

## Testing and evidence

- [ ] An automated end-to-end test passes
- [ ] API, database, UI, and documentation checks pass
- [ ] Deployment smoke-test results are attached
- [ ] Screenshots or a recording show the complete journey
- [ ] Accessibility-test results are attached
- [ ] Mobile and desktop evidence is attached
- [ ] The Sprint evidence index links to issues, pull requests, meetings, tests, and deployments

## Documentation

- [ ] Publish the test procedure
- [ ] Publish the demonstration script
- [ ] Publish known limitations
- [ ] Update architecture documentation to match the implementation
- [ ] Update setup and deployment instructions
- [ ] Record AI usage for generated, edited, or reviewed material

## Completion requirements

- [ ] All acceptance criteria are satisfied
- [ ] Relevant automated tests pass
- [ ] CI passes
- [ ] Another team member reviews the release
- [ ] Issues and pull requests are linked
- [ ] Documentation is deployed
- [ ] Follow-up defects are recorded
- [ ] The Sprint 1 demonstration can be repeated from the documentation
```

---

# Later backlog — not Sprint 1 issues

The following committed features should remain in the later backlog until the Sprint 1 vertical slice is stable:

- Password reset
- Account deletion
- Complete event authoring and publication console
- Multiple challenge formats
- Server-side answer marking
- Answer explanations
- One-time card reward transactions
- Card categories, rarity, and attributes
- Player card collection
- Deck creation and validation
- Deterministic CPU battle engine
- Stored match rounds and results
- Complete authorisation and role management
- Expanded accessibility and field testing
- Player profiles, points, and achievements
- Trails
- Draft-review-publish content workflow
- Offline attempts
- Player-versus-player matches
- Live battles and spectators
- Trust scoring
- Trading
- Territory control
- Advanced analytics

The preceding document was reviewed with the assistance of: Codex-CLI[GPT-5].

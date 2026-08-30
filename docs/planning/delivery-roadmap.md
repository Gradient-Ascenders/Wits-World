# Wits World Delivery Roadmap

:::note[Planning snapshot]

This roadmap preserves the intended delivery sequence and milestone framing at
the time it was written. For current delivered Basic scope, use the
[Basic release overview](../basic-release-reference.md); confirmed product
decisions are maintained in the
[Basic-tier decision register](../requirements/basic-tier-decision-register.md).

:::

## Purpose

This roadmap describes how the Wits World team intends to deliver the Wits Quest
Basic product across the three development sprints and final submission period.

The roadmap prioritises complete vertical player journeys rather than isolated
front-end, API, or database components.

## Delivery dates

| Milestone        | End date          | Primary objective                                                                                 |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| Sprint 1         | 25 August 2026    | Establish the project foundation and demonstrate the first deployed location-based vertical slice |
| Sprint 2         | 15 September 2026 | Implement the central challenge, reward, collection, and battle features                          |
| Sprint 3         | 29 September 2026 | Complete, integrate, review, and improve the product                                              |
| Final submission | 11 October 2026   | Deliver a stable, tested, documented, and deployed product                                        |

The official dates may be adjusted during the semester. The team must update
this roadmap if the course timeline changes.

## Repository delivery review — 25 August 2026

This review distinguishes repository delivery from the original schedule and
from manual, external, or stakeholder acceptance:

| Roadmap area                           | Current repository status                           | Evidence and remaining boundary                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sprint 1 foundation and location slice | Delivered in repository and deployed                | Issues #11–#21 and #43–#50 are closed; the Web, API, and docs deployments and public auth/CORS boundary are documented. Location thresholds remain provisional and release-specific signed-in/operator evidence remains manual.                                                                                                                                                                                                                     |
| Sprint 2 core gameplay                 | Implemented in repository ahead of the roadmap date | Issues #64–#80 are closed; migrations, API/UI implementation, tests, and the deterministic 21-step journey cover challenge, atomic score-based rewards, collection, decks, CPU matches/history, and Author content. Issue #160 implements account-deletion persistence; the mandatory profile/account page, password reset, and deletion UI remain issue #161 work. Issue closure is not proof that unchecked manual/external gates were performed. |
| Sprint 3 work                          | Partly delivered early; milestone not yet assessed  | The Author console exists. Creature move-content remediation, Mapbox operational evidence, manual release evidence, and any work not completed during Sprint 2 remain.                                                                                                                                                                                                                                                                              |
| Final submission                       | Pending                                             | The final-submission checklist below remains a plan, not a completed-state claim.                                                                                                                                                                                                                                                                                                                                                                   |

The older Sprint 2 and final target journeys below preserve the planning intent
that a correct answer awarded one event card. That reward model is superseded by
the confirmed five-question, permanent-points and zero-to-two-card policies in
the [Basic game rules](../requirements/basic-game-rules.md#rewards).

The original roadmap placed password reset and account deletion in Sprint 3.
The current team plan supersedes that timing: account-deletion persistence is
implemented by issue #160, while the proper player profile/account page,
password reset, and deletion UI remain Sprint 2 issue #161 work.

## Delivery principles

The team will:

- prioritise the complete Basic product before stretch features;
- implement small vertical slices that cross the web, API, and database;
- keep the browser outside protected authority boundaries;
- include tests and documentation as part of implementation;
- maintain deployable web, API, and documentation applications;
- review stakeholder feedback throughout development;
- record significant decisions and scope changes;
- keep issues, pull requests, tests, and evidence linked; and
- attribute AI assistance according to the course policy.

## Sprint 1: Project foundation and location vertical slice

### Objective

Establish the repository, architecture, development workflow, documentation,
deployment foundation, and the first integrated player journey.

### Target journey

An authenticated player:

1. opens the deployed web application;
2. signs in;
3. views a published demonstration event;
4. requests browser geolocation;
5. submits a location claim to the protected API;
6. has the claim evaluated against the event stored in PostgreSQL/PostGIS; and
7. sees whether the event is reachable.

### Planned work

#### Project and collaboration

- establish the monorepo and shared development standards;
- document the Git and project methodology;
- configure the Gitea project board;
- establish issue, branch, pull-request, and review conventions;
- define the Definition of Ready and Definition of Done;
- record stakeholder decisions and unresolved requirements.

#### Architecture and documentation

- document the initial system architecture;
- record trust boundaries and data flow;
- motivate the technology stack;
- create initial architecture decision records;
- publish the first version of the documentation website;
- record the initial delivery roadmap and risk register.

#### Web application

- scaffold the React, Vite, and TypeScript application;
- provide a responsive and accessible application shell;
- integrate sign-in and sign-out;
- protect the player route;
- render the campus map and seeded event;
- provide a text-based event fallback;
- request browser geolocation after a player action;
- display reachable, unreachable, denied, timeout, and failure states.

#### API and security

- scaffold the Fastify and TypeScript API;
- add `/health` and `/api/v1`;
- add runtime configuration validation;
- add safe structured errors and request identifiers;
- generate OpenAPI documentation;
- select and configure an established authentication provider;
- validate bearer access tokens;
- derive player identity from validated tokens;
- expose protected event-discovery and eligibility endpoints.

#### Database and geospatial services

- configure PostgreSQL and PostGIS for development and testing;
- establish migrations and seed commands;
- create the initial event schema;
- seed one demonstration event;
- implement parameterised event-distance calculations;
- enforce publication and availability checks.

#### Testing and deployment

- establish pull-request CI;
- run formatting, linting, type checking, tests, and builds;
- deploy the web application and API;
- deploy the documentation website;
- perform deployment smoke tests;
- execute the Sprint 1 end-to-end demonstration;
- organise milestone evidence.

### Sprint 1 completion outcome

Sprint 1 is complete when the deployed location journey can be repeated from
the documentation and no known severe defect prevents the demonstration.

## Sprint 2: Complete the central Basic game loop

### Objective

Extend the Sprint 1 location slice into the central Wits Quest collection and
CPU battle loop.

### Target journey

An authenticated and eligible player:

1. opens an event challenge;
2. submits an answer;
3. receives server-generated feedback;
4. earns the event's card once after a correct answer;
5. views the card in their collection;
6. creates or selects a valid deck;
7. completes a deterministic CPU battle; and
8. views the stored match result.

### Planned work

#### Challenges

- define and document the first supported challenge formats;
- create challenge and accepted-answer schemas;
- create short-lived challenge sessions;
- prevent accepted answers from being exposed before submission;
- mark answers on the server;
- return correct-answer feedback or explanations;
- test correct, incorrect, invalid, and expired submissions.

#### Rewards and cards

- create card category, rarity, and attribute data;
- connect events to reward cards;
- enforce one successful reward per player per event;
- make reward submission idempotent;
- use transactions and constraints to prevent duplicate rewards;
- create the player collection API and interface.

#### Decks

- define deck size and duplicate rules;
- validate card ownership;
- create deck creation or selection endpoints;
- reject invalid or unauthorised decks;
- provide accessible collection and deck interfaces.

#### CPU battles

- document deterministic battle and tie rules;
- implement pure battle rules in a shared or server-side game-rules package;
- keep battle state and legal actions server-authoritative;
- store match rounds and final results;
- provide a usable turn-based battle interface.

#### Authoring foundation

- begin the event, challenge, card, and reward authoring interfaces;
- enforce authorisation for protected content operations;
- record publication-related actions where required.

#### Quality

- expand API, database, UI, and end-to-end tests;
- perform formal user feedback collection;
- review and integrate stakeholder feedback;
- document the database schema and deployed environment;
- document third-party libraries and testing procedures.

### Sprint 2 completion outcome

Sprint 2 is complete when the central location, challenge, reward, collection,
deck, and CPU battle journey operates as an integrated product, even if some
non-severe defects or limited content remain.

## Sprint 3: Completion, review, and product improvement

### Objective

Bring the complete Basic product to a near-final state and evaluate it
qualitatively.

### Planned work

#### Complete Basic functionality

- complete the authoring and publication console;
- complete registration, password-reset, and account-deletion journeys;
- complete application roles and authorisation;
- resolve remaining Basic feature gaps;
- improve challenge and card content;
- verify stored match history;
- confirm account-deletion and data-retention behaviour.

#### Quality improvement

- resolve severe and high-priority defects;
- expand end-to-end coverage;
- perform accessibility testing;
- test responsive layouts across representative devices;
- conduct physical-device and campus field testing;
- test concurrent reward submissions;
- test authentication and object-level authorisation;
- review performance and inefficient queries;
- review API and database deployment reliability.

#### Stakeholder and user review

- demonstrate the integrated product to the client;
- collect structured stakeholder feedback;
- conduct user testing with representative users;
- evaluate which feedback can be completed before submission;
- document accepted, rejected, and deferred feedback.

#### Documentation and evidence

- update architecture documentation to match implementation;
- complete API and database documentation;
- update setup, testing, deployment, and troubleshooting guides;
- organise project-methodology evidence;
- ensure all third-party code is documented and motivated;
- verify all AI declarations and assisted commits.

### Stretch-feature gate

Stretch work may begin only when:

- all Basic vertical journeys are implemented;
- no known severe defect blocks a core journey;
- CI is passing;
- deployed environments are stable;
- core documentation is current; and
- the team agrees that Basic completion is not threatened.

The preferred stretch package is:

- player profiles and points;
- ordered trails;
- draft-review-publish content workflow.

Other intermediate or advanced features remain outside the normal delivery plan
unless the team explicitly changes scope.

### Sprint 3 completion outcome

Sprint 3 is complete when most features are implemented and working, the product
has undergone stakeholder and user review, and remaining submission work is
principally stabilisation, evidence, documentation, and polish.

## Final submission period

### Objective

Deliver a stable, demonstrable, and well-documented Wits Quest product.

### Planned work

- freeze non-essential feature development;
- resolve remaining release-blocking defects;
- run the full automated test suite;
- execute accessibility and responsive checks;
- perform deployment and database smoke tests;
- verify all production environment variables and secrets;
- confirm the deployed web application communicates with the deployed API;
- confirm the deployed API communicates with PostgreSQL/PostGIS;
- verify account and authentication journeys;
- verify the complete player journey;
- verify the authoring journey;
- confirm documentation is publicly accessible;
- update known limitations;
- prepare the final demonstration and presentation;
- organise links to issues, pull requests, tests, meetings, deployments, and
  stakeholder evidence.

## Complete Basic product target

The final Basic product should support the following journey:

1. a player registers or signs in;
2. the player views published events on a mobile-friendly campus map and event
   list;
3. the player travels to an event;
4. the browser submits a location claim;
5. the server determines whether the player may attempt the event;
6. the player completes a challenge;
7. the server marks the answer;
8. a correct answer awards the event's card once;
9. the player views their collection;
10. the player creates or selects a valid deck;
11. the player completes a server-controlled CPU battle;
12. the completed match is stored and viewable.

Authors must also be able to manage the event, challenge, answer, card,
attribute, reward, location, availability, and publication data needed to
support that journey.

## Roadmap review

The roadmap should be reviewed:

- during sprint planning;
- after stakeholder meetings;
- when a major risk becomes active;
- when an architectural decision changes;
- when milestone dates change; and
- before accepting stretch work.

Changes must be reflected in the relevant Gitea issues and project
documentation.

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking].

The planning-status notice was added with assistance from Codex-CLI[GPT-5]. The
dated repository-delivery review was added with assistance from Codex[GPT-5]
and Codex-CLI[gpt-5.6-sol medium].

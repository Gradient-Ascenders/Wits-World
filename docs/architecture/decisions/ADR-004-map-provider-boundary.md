# ADR-004: Keep Map Integration Presentation-Only

## Status

Accepted

## Date

2026-08-06

## Owners and reviewers

- **Owner:** Member 2 — API and Security Lead
- **Reviewer:** Member 3 — Data and Infrastructure Lead

## Context

The Wits Quest player experience requires a campus map displaying nearby events.
While `/explore` is active, the browser may observe and transiently render the
player's reported location. If permission is already granted, observation may
start on mount; a prompt or unknown permission state still requires the player
to activate **Enable live location**. The reported location is kept ephemeral,
rendered as a local DOM overlay, and never sent to the map provider. The API,
not the rendered point, remains authoritative for protected eligibility.

The browser must integrate with a map library and a licensed tile or style
provider.

However, a visual map is not a trusted source for:

- event coordinates;
- event publication state;
- event availability;
- event radius;
- location-claim validity; or
- final eligibility.

The system must also remain usable when map tiles fail to load.

## Decision

Use the browser map integration only for presentation and navigation.

The current implementation uses Mapbox GL JS v3 with
`mapbox://styles/mapbox/standard`, Mapbox Standard's 3D configuration, and the
existing provider-neutral adapter boundary. The team confirms this as an
allowed team-selected integration within the project's broad implementation
discretion. No separate explicit client/lecturer approval of Mapbox by name is
required or claimed. Production token/CSP/privacy review, licensing/terms,
usage and cost ownership, and confirmation of any licensed Wits campus dataset
remain operational or data-evidence requirements. See the [Mapbox Standard
migration boundary](../mapbox-standard-migration.md).

The current provider comparison and Wits-campus trial requirements are recorded
in the [map-provider evaluation](../map-provider-evaluation.md). That evaluation
does not change this ADR's presentation-only trust boundary.

Authoritative event data comes from the Wits Quest API.

Authoritative distance and eligibility decisions come from the API and
PostgreSQL/PostGIS.

The web application must provide a text-based event list so the map is not the
only way to discover or understand events.

The selected event's API-supplied radius may be rendered as a geodesic polygon
labelled **Event interaction area**. This is explanatory map geometry, not proof
of physical presence and not a client-side eligibility calculation. Basic Tier
does not render a reported GPS-accuracy circle.

## Reasons

This boundary:

- prevents visual marker placement from becoming a security decision;
- allows the team to change tile providers without changing protected rules;
- keeps the browser and map provider outside the trusted game authority;
- supports accessible event discovery;
- provides a fallback during tile or map failures;
- keeps the PostGIS-backed eligibility calculation authoritative; and
- limits the external integration to the functionality it is suited to provide.

## Consequences

### Benefits

- Map outages do not remove all event information.
- Provider replacement has limited effect on the API and database.
- Protected logic remains testable without loading live map tiles.
- Event status can be communicated through accessible text.
- The project can meet attribution and licensing requirements explicitly.
- The map library does not require access to database credentials or private
  API secrets.

### Costs and risks

- The application must maintain both map and list representations.
- Event information must remain consistent between the two interfaces.
- Tile and style licensing must be reviewed before deployment.
- Public map configuration may be visible in the browser.
- Browser map testing may require provider mocks or controlled fixtures.
- A poorly selected tile provider may impose rate, coverage, or attribution
  restrictions.

## Alternatives considered

### Use the map provider as the event database

This would couple game content to an external presentation service and weaken
control over publication, security, and game rules.

### Calculate eligibility from marker positions in the browser

This would allow browser manipulation to influence a protected decision.

### Provide only a map

This would make events inaccessible when the map fails and would create
accessibility problems for keyboard and assistive-technology users.

### Build a custom map renderer

This would require substantial effort without improving the authoritative
eligibility model.

## Related work

- Document the initial architecture and delivery plan
- Expose event discovery and eligibility API endpoints
- Render the campus map and seeded event
- Submit browser geolocation and display eligibility
- Migrate `/explore` from OpenFreeMap/MapLibre to Mapbox Standard 3D (#92)
- [Evaluate the production map provider](../map-provider-evaluation.md)

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking] and updated with:
Codex-CLI[GPT-5]. The current Mapbox decision-status clarification was generated,
edited, and reviewed with the assistance of Codex[GPT-5].

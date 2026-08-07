# ADR-003: Use PostgreSQL and PostGIS for Authoritative Event Data

## Status

Accepted

## Date

2026-08-06

## Owners and reviewers

- **Owner:** Member 2 — API and Security Lead
- **Reviewer:** Member 3 — Data and Infrastructure Lead

## Context

Wits Quest events are attached to physical campus locations.

The system must determine whether a submitted player location claim is within an
event's configured radius and availability period.

The browser and map display cannot be trusted to calculate the final eligibility
result.

The database must also support later relational data such as:

- users;
- attempts;
- rewards;
- cards;
- decks;
- matches;
- content publication; and
- audit history.

## Decision

Use PostgreSQL as the primary relational database and PostGIS for geospatial
event storage and calculations.

Store authoritative event locations using an appropriate PostGIS geographic or
geometric point type.

Store the event radius, publication state, availability period, and supporting
metadata in the database.

Use parameterised PostGIS queries to calculate the distance between:

- the submitted browser location claim; and
- the stored event location.

The API uses the resulting server-side calculation when deciding whether an
event is reachable.

Database constraints, indexes, and transactions reinforce important application
rules.

## Reasons

PostgreSQL provides:

- relational integrity;
- transactions;
- constraints;
- mature indexing;
- reliable migration support;
- strong TypeScript ecosystem support; and
- suitable support for later card, deck, match, and authoring data.

PostGIS provides:

- geospatial point storage;
- distance calculations;
- spatial indexing;
- explicit distance units when queries are designed correctly; and
- server-side authority over event proximity.

Using PostGIS avoids relying on map pixels, marker placement, or browser
distance calculations for protected eligibility decisions.

## Consequences

### Benefits

- Event coordinates have one authoritative source.
- Eligibility calculations are performed in a trusted environment.
- Spatial indexes can support efficient event queries.
- Relational constraints protect linked game data.
- Transactions can later protect one-time rewards and completed matches.
- Database behaviour can be tested against a dedicated test database.

### Costs and risks

- Local development requires PostgreSQL with the PostGIS extension.
- The selected production host must support PostGIS.
- Coordinate reference systems and distance units must be documented.
- Geospatial queries require careful parameterisation.
- Incorrect use of geometry and geography types can produce incorrect distance
  results.
- Database migrations and seeds require automated testing.
- Free-tier database providers may impose storage, connection, or inactivity
  limits.

## Alternatives considered

### Plain latitude and longitude numeric columns

These values are easy to store but would require custom distance calculations
and provide weaker access to geospatial indexing and database functions.

### Browser-calculated distance

This would reduce server work but would allow the client to influence a
protected eligibility decision.

### Document database

A document database could store event coordinates but would provide less direct
support for the relational and transactional requirements expected later in the
project.

### Map-provider distance service

An external map service could calculate distances, but it would introduce an
unnecessary dependency for simple event-radius checks and allow a presentation
integration to influence protected game logic.

## Related work

- Document the initial architecture and delivery plan
- Configure PostgreSQL and PostGIS development environments
- Create the initial event migration and seed data
- Implement the PostGIS event eligibility service
- Expose event discovery and eligibility API endpoints

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking].

# System Context Diagram

This diagram shows Wits Quest, its users, and its principal external systems.

```mermaid
flowchart LR
    Player["Player"]
    Author["Author or Administrator"]

    Web["Wits Quest Web Application<br/>React, Vite and TypeScript"]
    API["Wits Quest Hand-Written API<br/>Fastify and TypeScript"]
    DB[("PostgreSQL and PostGIS")]
    Auth["External Authentication Provider"]
    Map["External Map Tile and Style Provider"]
    Docs["Public Documentation Website"]

    Location["Browser-Reported Location<br/>Untrusted Claim"]

    Player -->|"Explores campus and plays"| Web
    Author -->|"Manages game content"| Web

    Web -->|"HTTPS and JSON"| API

    Web -->|"Authentication flow"| Auth
    API -->|"Validates access tokens"| Auth

    API -->|"Parameterised SQL"| DB
    DB -->|"Events and geospatial results"| API

    Web -->|"Requests tiles and styles"| Map
    Location -.->|"Latitude, longitude, accuracy and timestamp"| Web

    Player -->|"Reads player guidance"| Docs
    Author -->|"Reads technical guidance"| Docs

    API -->|"Authoritative eligibility and protected rules"| Web
```

## Interpretation

- The web application and API are separate applications.
- Browser-reported location is untrusted input.
- The API is authoritative for authenticated operations and eligibility.
- PostgreSQL/PostGIS is authoritative for stored event locations and distance
  calculations.
- The authentication provider authenticates users.
- The API validates tokens before trusting identity.
- The map provider is used for presentation only.
- The public documentation site is separate from the runtime game applications.

## Open decisions

The following external providers have not yet been selected:

- authentication provider;
- map tile and style provider;
- web host;
- API host;
- database host; and
- documentation host.

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking].

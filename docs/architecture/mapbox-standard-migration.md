# Mapbox Standard 3D migration boundary

## Status

Implementation tracked by Gitea issue [#92](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/92), linked to decision issue [#62](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/62).

The renderer migration is implemented on the issue branch, but formal client or
lecturer acceptance of the external Mapbox service, the licensed Wits campus
dataset, and production billing remains pending. The supplied 3D campus image
is visual art direction only. It is not a source of geometry, names, heights,
or copyrighted map assets.

## Renderer decision and boundary

The web application pins `mapbox-gl` `3.28.1` and lazy-loads its ESM entry when
`/explore` mounts. The configured style is:

```text
mapbox://styles/mapbox/standard
```

The initial Wits Quest camera is centred on the approved Sprint 1 event area at
`[28.03038, -26.19205]`, zoom `16.5`, pitch `52`, and bearing `20`. It uses
Mapbox Standard's `dusk` preset with 3D objects, buildings, landmarks, trees,
and pedestrian roads enabled. `dusk` is the implementation default selected to
match the supplied art direction; a live `night` comparison remains a manual
acceptance check. The bearing/pitch reset control is keyboard accessible, there
is no automatic rotation, and Mapbox GL JS receives
`respectPrefersReducedMotion: true`. Event markers remain DOM markers sourced
from the protected API and are updated without reconstructing the map.

Custom layers use Mapbox Standard `bottom`, `middle`, and `top` slots. Their
colour layers set type-specific emissive-strength properties so Standard's
dynamic lighting does not make paths, labels, boundaries, or project-owned
buildings disappear at dusk. If an approved project-owned building dataset
must replace overlapping Standard buildings, the optional `clip` layer uses the
supported `basemap` scope and `model`/`symbol` layer types. That replacement
path is not enabled until the dataset is licensed and reviewed.

The map remains presentation-only. The API and PostgreSQL/PostGIS remain
authoritative for event publication, availability, distance, eligibility, and
location claims. No geocoding, directions, search, or geofencing API is added.

## Project-owned Wits campus layer contract

The adapter accepts a future public GeoJSON `FeatureCollection` plus separate
provenance metadata. It is deliberately empty in the current application;
there is no fabricated Wits geometry.

| Feature kind                       | Geometry and required information                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `boundary`                         | Campus boundary geometry                                                                                     |
| `building`                         | Polygon, stable `buildingId`, approved `approvedName` where applicable, and measured `heightM` for extrusion |
| `pedestrian-path`                  | Pedestrian route geometry                                                                                    |
| `accessible-path`                  | Wheelchair-accessible route geometry supported by verification evidence                                      |
| `entrance` / `accessible-entrance` | Entrance point and approved identity; accessible status must be verified                                     |
| `service` / `landmark`             | Approved public campus service or landmark point and name                                                    |

Dataset metadata must record `source`, `licence`, and `lastVerified`. A
`verifiedLevels` value may be retained as provenance, but the renderer does not
derive a height from it. A `heightM` value is required for the
`fill-extrusion` layer. Deriving metres from floor count requires a separately
documented and accepted approximation before it can be implemented.

Dynamic event state and eligibility are not baked into the campus dataset or
tileset. They continue to come from the protected Wits Quest API.

Before enabling this layer, the team still needs:

- a licensed Wits campus dataset or written permission to create one;
- evidence for boundaries, building footprints, names, IDs, heights, paths,
  entrances, accessible routes, services, and landmarks;
- a source/licence and verification record for each release; and
- API/Security Lead and relevant client/lecturer review of public exposure,
  attribution, and the replacement/clipping choice.

## Privacy and configuration

`VITE_MAPBOX_ACCESS_TOKEN` is intentionally browser-visible configuration. The
application accepts only a public `pk.` token. The deployment token must be
restricted to the approved localhost and deployed web origins and must not
have uploads, style-write, account, or other secret scopes. The browser sends
Mapbox only the public viewport rendering requests and any explicitly enabled
public campus data. It never sends the player's reported coordinates to
Mapbox; those coordinates go only to the protected Wits Quest eligibility API.

The map disables Mapbox performance metrics collection in the constructor. No
Mapbox geolocation control is installed, so there is no provider-side location
request. `/explore` uses one browser geolocation watcher while the page is
active: previously granted permission starts it automatically, while prompt or
unknown permission requires the player's **Enable live location** action. The
watcher pauses while the document is hidden and is cleared on unmount.

The latest reported location is shown as a transient, browser-only DOM overlay.
It is positioned with the map's local screen projection, never as a Mapbox
marker or GeoJSON source, and is removed with the map controller. It is not
persisted in storage, URLs, or location history. Basic Tier does not show a GPS
accuracy circle. See [Mapbox
operations](../deployment/mapbox-operations.md) for token, CSP, pricing,
monitoring, and deployment notes.

The selected event interaction area is a 64-segment geodesic GeoJSON polygon
generated from the API's event coordinate and metre radius. It is visual-only;
the browser does not calculate player-to-event distance. Live location updates
move the local player marker immediately, but eligibility refreshes are
location-driven, coalesced, and limited to at most one request per 15 seconds
after meaningful movement. The API and PostGIS decide every result. Challenge
start reuses a sufficiently fresh watched claim or requests a newer one-shot
claim before submitting through the existing API for a server-authoritative
recheck. A location-retry response requires a newer acquisition rather than
resubmitting the same rejected claim.

The Mapbox logo and Mapbox/OpenStreetMap attribution remain enabled. The
attribution control uses Mapbox's compact mode on constrained layouts and both
branding controls are positioned above Explore's sheet and mobile navigation.

## Official implementation references

- [Mapbox GL JS bundler guidance](https://docs.mapbox.com/mapbox-gl-js/guides/bundler/)
- [Mapbox Standard configuration](https://docs.mapbox.com/map-styles/reference/standard/)
- [Mapbox Standard slots and custom layers](https://docs.mapbox.com/mapbox-gl-js/guides/styles/work-with-layers/)
- [Mapbox Standard building clipping](https://docs.mapbox.com/mapbox-gl-js/example/clip-layer-building/)
- [Mapbox attribution requirements](https://docs.mapbox.com/help/glossary/attribution/)
- [Mapbox access-token security](https://docs.mapbox.com/accounts/guides/tokens/)
- [Mapbox privacy policy](https://www.mapbox.com/legal/privacy)

This document was planned and edited with assistance from:

```text
Codex-CLI[GPT-5]
```

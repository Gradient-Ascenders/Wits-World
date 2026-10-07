---
title: 'Mapbox 3D map integration'
---

# Mapbox 3D map integration

## Status

Implementation tracked by Gitea issue [#92](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/92), linked to decision issue [#62](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/62).

The renderer migration is implemented in the current application and issue #92
is closed. The team confirms that Mapbox is an allowed team-selected integration
within the broad implementation-technology discretion given to the project; a
separate explicit client or lecturer approval of Mapbox by name is not a
blocking decision and is not claimed. Licensing and terms review, cost
ownership, production token/CSP/privacy checks, usage monitoring, and any
licensed Wits campus dataset remain operational or data-evidence requirements.
The supplied 3D campus image is visual art direction only. It is not a source
of geometry, names, heights, or copyrighted map assets.

## Renderer decision and boundary

The web application pins `mapbox-gl` `3.28.1` and lazy-loads its ESM entry when
`/explore` mounts. Desktop Explore, Author maps, and explicit mobile 3D use:

```text
mapbox://styles/mapbox/standard
```

Default mobile Explore (the existing `max-width: 47.999rem` breakpoint, with
**Detailed 3D map** off) instead uses `mapbox://styles/mapbox/streets-v12` at
pitch `0`. The existing responsive and local 3D-toggle state select the style;
network speed and user-agent detection do not. Changing mode or crossing the
breakpoint recreates the map through the existing abort/cleanup lifecycle,
then reapplies discovery points, selection, radius, territories, and reported
location. There is still one map instance. The map-ready callback, retry, and
15-second fallback keep their existing semantics.

On initial mobile 2D navigation, the map container stays mounted while event
discovery loads. Once discovery succeeds, is empty, or fails, it gets a paint
opportunity before map imports/construction start. Later discovery refreshes
do not recreate the map. If discovery remains pending, the existing 15-second
map fallback still appears and starts the map attempt independently; a later
map load can recover normally. Pending animation frames are cancelled with
the existing abort/cleanup lifecycle. Desktop, explicit mobile 3D, and Author
map startup are unchanged.

Streets v12 retains vector roads, flat building footprints, places, land use,
water, and POIs. It avoids Standard's imported basemap/configuration path.
Mapbox classifies it as a [Classic style](https://docs.mapbox.com/map-styles/guides/classic-styles/):
it remains available but is no longer actively maintained, including feature,
cartographic, and bug-fix updates. This is a maintenance tradeoff, not a claim
of guaranteed performance or long-term provider support. Future compatibility
and campus-readability checks remain necessary; no custom Studio style or
Mapbox account changes are part of this choice.

The current Explore camera is centred on the approved Sprint 1 event area at
`[28.03038, -26.19205]`, zoom `16.5`, pitch `0`, and bearing `0`. It uses
Mapbox Standard with 3D objects, buildings, landmarks, trees, and pedestrian
roads enabled on desktop and explicit mobile 3D; enabling 3D retains the existing
initial flat camera. For Standard, lighting follows the device's current clock interpreted in
`Africa/Johannesburg`: dawn from 05:00–07:00, day from 07:00–17:00, dusk from
17:00–19:00, and night otherwise. These are fixed time periods, not seasonal
sunrise or sunset calculations. Lighting checks every minute and on return to
the tab, survives style reloads, and updates without resetting the camera.
Live provider imagery across these presets remains a manual acceptance check.
The bearing/pitch reset control is keyboard accessible, there
is no automatic rotation, and Mapbox GL JS receives
`respectPrefersReducedMotion: true`. Event markers remain DOM markers sourced
from the protected API and are updated without reconstructing the map.

Desktop Explore includes a Layers disclosure for event markers, the selected
challenge radius, territory boundaries, 3D buildings and trees, and map labels.
These choices change presentation only: lists, selections, eligibility, and
camera state are retained. Mobile and tablet do not expose this control and
use the default layer visibility, independently of desktop choices.

Web timestamp displays and Author event/campaign scheduling inputs also use
Johannesburg time. Scheduling inputs are converted to UTC instants for the
existing API. Trust-review date filters use Johannesburg day boundaries;
Author analytics reporting keeps its explicit UTC calendar-date contract.

Custom layers on Standard use its `bottom`, `middle`, and `top` slots. Their
colour layers set type-specific emissive-strength properties so Standard's
dynamic lighting does not make paths, labels, boundaries, or project-owned
buildings disappear at dusk. If an approved project-owned building dataset
must replace overlapping Standard buildings, the optional `clip` layer uses the
supported `basemap` scope and `model`/`symbol` layer types. That replacement
path is not enabled until the dataset is licensed and reviewed.

On Streets, application layers omit slots and use ordinary layer ordering:
campus context goes before the first basemap line, geometry before the first
basemap symbol, and application labels/points above the basemap. Event DOM
markers are unchanged. Standard-only constructor config, runtime config,
building clipping, and lighting timers/listeners are not installed for
Streets. Label visibility uses the basemap's symbol layers and restores each
layer's original visibility; flat building context is retained. Project-owned
building/label visibility still follows the existing overlay controls. The
optional future campus dataset is not enabled by this change.

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
- API/Security Lead review of public exposure, attribution, and the
  replacement/clipping choice, plus any review required by the dataset licence
  or campus-data owner.

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

The latest reported location is shown with an application-owned, transient DOM
element anchored by Mapbox's local `Marker` runtime. Using the provider's marker
anchor keeps the dot attached to its longitude and latitude while the map pans,
zooms, pitches, or rotates; it does not install Mapbox's geolocation control or
publish the coordinate as a GeoJSON source. The element is removed with the map
controller and the claim is not persisted in storage, URLs, or location
history. The interface reports the browser's approximate accuracy in text.
Basic Tier does not show a GPS accuracy circle. See [Mapbox
operations](../deployment/mapbox-operations.md) for token, CSP, pricing,
monitoring, and deployment notes.

The selected event interaction area is a 64-segment geodesic GeoJSON polygon
generated from the API's event coordinate and metre radius. It is visual-only;
the browser does not calculate player-to-event distance. The location watcher
requests uncached, high-accuracy readings. For display only, a rolling
ten-second sample window avoids replacing a recent accurate fix with a briefly
degraded reading. Follow mode ignores movement within the readings' reported
uncertainty and uses short camera transitions, reducing jitter without changing
the coordinates supplied by the browser. Eligibility refreshes continue to use
the current raw claim, are location-driven and coalesced, and are limited to at
most one request per 15 seconds after meaningful movement. The API and PostGIS
decide every result. Challenge start reuses a sufficiently fresh watched claim
or requests a newer one-shot claim before submitting through the existing API
for a server-authoritative recheck. A location-retry response requires a newer
acquisition rather than resubmitting the same rejected claim.

The Mapbox logo and Mapbox/OpenStreetMap attribution remain enabled. The
attribution control uses Mapbox's compact mode on constrained layouts and both
branding controls are positioned above Explore's sheet and mobile navigation.

## Official implementation references

- [Mapbox GL JS bundler guidance](https://docs.mapbox.com/mapbox-gl-js/guides/bundler/)
- [Mapbox Standard configuration](https://docs.mapbox.com/map-styles/reference/standard/)
- [Mapbox Streets v12](https://docs.mapbox.com/map-styles/reference/streets/)
- [Classic styles maintenance status](https://docs.mapbox.com/map-styles/guides/classic-styles/)
- [Mapbox Standard slots and custom layers](https://docs.mapbox.com/mapbox-gl-js/guides/styles/work-with-layers/)
- [Mapbox Standard building clipping](https://docs.mapbox.com/mapbox-gl-js/example/clip-layer-building/)
- [Mapbox attribution requirements](https://docs.mapbox.com/help/glossary/attribution/)
- [Mapbox access-token security](https://docs.mapbox.com/accounts/guides/tokens/)
- [Mapbox privacy policy](https://www.mapbox.com/legal/privacy)

This document was planned and edited with assistance from:

```text
Codex-CLI[GPT-5]
Codex[GPT-5]
```

Page title clarified with assistance from Codex-CLI[GPT-6].

Layers and campus-time lighting guidance updated with assistance from Codex[GPT-5].

Mobile 2D style and capability guidance updated with assistance from Codex[GPT-6].

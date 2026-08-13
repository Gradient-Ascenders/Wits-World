# Map-provider Evaluation for Wits Quest

## Status

Evaluation input for issue #62, prepared on 2026-08-13. No provider change is
approved by this document. OpenFreeMap remains implemented until the Product Lead
records a selection and the required client, lecturer, or brief evidence.

Prices and plan limits below were checked against official provider pages on
2026-08-13 and may change. A production decision must recheck pricing, terms,
attribution, and usage estimates.

## What “detailed” requires

A different global basemap does not guarantee complete Wits-campus geometry.
Professional campus detail requires two separately evaluated layers:

1. a hosted basemap for surrounding streets, terrain or imagery, labels, and map
   delivery; and
2. a licensed Wits-specific layer maintained by the project for approved building
   footprints and names, entrances, pedestrian paths, accessible routes, campus
   services, landmarks, and event presentation.

The campus layer can begin as GeoJSON because the area and feature count are
small. If its size or rendering cost grows, it can be published as vector tiles.
The project must record the source, licence, update owner, and last verification
date for every campus dataset. A provider preview is not evidence that a route,
entrance, or accessibility feature is accurate.

## Hosted options

| Option                          | Current fit                                                                                     | Custom-campus capability                                                                          | Indicative official pricing checked 2026-08-13                                                                                                                                                    | Main trade-off                                                                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OpenFreeMap with MapLibre       | Already implemented; no renderer migration                                                      | Add a project-hosted GeoJSON or vector-tile layer in MapLibre                                     | Free hosted service; its terms provide no accuracy or availability warranty and allow discontinuation                                                                                             | Lowest cost, but no paid availability commitment or integrated campus-data editor                                                                                                    |
| MapTiler Cloud with MapLibre    | Best fit with the existing open renderer                                                        | Upload or edit GeoJSON and other vector formats, host tilesets, and compose them in custom styles | Free plan is for testing, personal, or non-commercial use and includes 5,000 sessions/month; Flex is USD 30/month with 25,000 sessions, 500,000 API requests, 20 custom styles, and 10 GB storage | Paid hosting and design tools do not themselves fix missing source data; an API key and usage controls are required                                                                  |
| Mapbox Studio with Mapbox GL JS | Strongest candidate when advanced cartographic tooling is worth a renderer/provider migration   | Upload custom data, build tilesets, and publish branded styles through Studio                     | Mapbox GL JS includes 50,000 web map loads/month; the next tier is USD 5 per 1,000 loads                                                                                                          | Mature styling and data workflow, but more migration effort and tighter provider coupling                                                                                            |
| Google Maps Platform            | Candidate only if Google imagery, POIs, Street View, or its ecosystem is a specific requirement | Upload GeoJSON, KML, or CSV datasets and style point, line, and polygon features on vector maps   | Dynamic Maps includes 10,000 loads/month; the next tier is USD 7 per 1,000 loads. Billing and an API key are required                                                                             | Full renderer/ecosystem migration, less continuity with the current MapLibre styling work, and potentially higher cost                                                               |
| Stadia Maps with MapLibre       | Low-friction paid basemap alternative                                                           | Keep the campus overlay in the application or a separately hosted tileset                         | Starter is USD 20/month for 1,000,000 credits; Standard is USD 80/month and adds satellite imagery. Standard vector tiles cost one credit each                                                    | Predictable MapLibre delivery, but its standard vector source ends at zoom 14 and overzooms beyond that, and it offers less integrated campus-data authoring than MapTiler or Mapbox |

## Recommendation

Use **MapTiler Cloud with the existing MapLibre renderer** as the leading
production candidate, paired with a project-owned Wits campus layer. This keeps
the current application structure, offers a visual style editor and small-dataset
workflow suited to a campus, and provides a straightforward paid path if the free
plan is not licensed or sufficient for deployment.

Treat **Mapbox Studio** as the premium comparison candidate. It is worth choosing
over MapTiler only if a Wits-area prototype demonstrates materially better visual
results, data coverage, or required capabilities that justify replacing the
renderer and accepting greater provider coupling.

Google Maps should be selected only for an explicit Google-specific requirement,
such as imagery, Street View, or POI coverage that wins the campus trial. Stadia
Maps is a reasonable hosted-basemap fallback, but it does not remove the need to
curate the Wits layer.

## Required campus trial before selection

Create the same non-production Wits sample in OpenFreeMap, MapTiler, and Mapbox;
include Google only if its imagery or POI features are under serious consideration.
Use identical approved sample data and compare:

- building, entrance, path, accessibility, landmark, and label completeness at
  approximately zoom levels 16-20;
- readability and interaction at 360 px, 390 px, 768 px, and desktop widths;
- day/dark styling, label collisions, event-marker prominence, and optional 3D or
  satellite presentation;
- keyboard behavior, reduced motion, attribution, map-failure fallback, and text
  list parity;
- South African latency on representative mobile connections;
- key restriction, privacy, usage alerts/caps, overage behavior, service terms,
  and the projected monthly cost; and
- the time required to correct a missing building, entrance, or route in the
  project-owned campus layer.

The trial must use sanitised evidence and must not send reported player
coordinates, access tokens, or private event data to a map provider. Eligibility
and event authority remain in the API and PostgreSQL/PostGIS as required by
[ADR-004](decisions/ADR-004-map-provider-boundary.md).

## Official sources

- [OpenFreeMap quick start](https://openfreemap.org/quick_start/),
  [terms](https://openfreemap.org/tos/), and
  [privacy](https://openfreemap.org/privacy/)
- [MapTiler Cloud pricing](https://www.maptiler.com/cloud/pricing/),
  [custom data sources](https://docs.maptiler.com/guides/map-design/data-sources/),
  and [MapLibre-based SDK](https://docs.maptiler.com/sdk-js/)
- [Mapbox pricing](https://www.mapbox.com/pricing),
  [Studio](https://docs.mapbox.com/console-tools/studio/), and
  [custom data](https://docs.mapbox.com/mapbox-gl-js/guides/add-your-data/)
- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
  and [data-driven styling for uploaded datasets](https://developers.google.com/maps/documentation/javascript/dds-datasets/overview)
- [Stadia Maps pricing](https://stadiamaps.com/pricing/) and
  [MapLibre integration](https://docs.stadiamaps.com/vector/)

This document was researched, planned, generated, and edited with the assistance
of Codex-CLI[GPT-5].

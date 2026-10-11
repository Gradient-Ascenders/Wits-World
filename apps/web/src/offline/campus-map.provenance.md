# Offline campus map

The bundled `campus-map.json` is a bounded OpenStreetMap extract of building ways and pedestrian/path/steps/service ways around Wits East and West Campus. It is geographic data, not an illustration or a verified accessibility/routing dataset.

Source: https://www.openstreetmap.org/ and the public Overpass API (`https://overpass.private.coffee/api/interpreter`). The upstream timestamp is included in the JSON and displayed in the map attribution. Some names, paths and geometry may be incomplete or outdated.

License: Open Database License 1.0 (https://opendatacommons.org/licenses/odbl/1-0/). Copyright OpenStreetMap contributors. The extract is distributed in source form as JSON with numeric longitude/latitude coordinates, feature IDs, names and kinds; display retains attribution and license link. No Mapbox tiles or other commercial map resources are redistributed.

Regenerate with `node apps/web/scripts/generate-offline-campus-map.mjs https://overpass.private.coffee/api/interpreter`. This build-time command makes one bounded request; the runtime performs none. The generator rejects missing geometry and data above two MiB. Measured committed data: 533,987 bytes including its final newline, before compression; this is separate from application-shell and player-specific challenge storage.

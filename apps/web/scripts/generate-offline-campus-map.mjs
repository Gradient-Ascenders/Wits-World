// Build-time only. The app never contacts Overpass or downloads commercial tiles.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const bounds = [-26.198, 28.018, -26.185, 28.037];
const query = `[out:json][timeout:35];(way["building"](${bounds});way["highway"~"footway|path|pedestrian|steps|service"](${bounds}););out geom;`;
const endpoint = process.argv[2] ?? 'https://overpass-api.de/api/interpreter';
const url = new URL(endpoint);
url.searchParams.set('data', query);
const response = await fetch(url, {
  headers: { 'User-Agent': 'WitsWorld-campus-map-build/1.0' },
  signal: AbortSignal.timeout(55_000),
});
if (!response.ok) throw new Error(`Map download failed: ${response.status}`);
const data = await response.json();
const features = data.elements
  .filter((item) => item.geometry?.length > 1)
  .map((item) => ({
    id: item.id,
    kind: item.tags.building ? 'building' : 'path',
    name: item.tags.name ?? null,
    coordinates: item.geometry.map((point) => [
      Number(point.lon.toFixed(6)),
      Number(point.lat.toFixed(6)),
    ]),
  }));
if (
  !features.some((item) => item.kind === 'building') ||
  !features.some((item) => item.kind === 'path')
)
  throw new Error('Campus geometry is incomplete.');
const output =
  JSON.stringify({
    bounds,
    source: 'OpenStreetMap contributors',
    licence: 'ODbL-1.0',
    updatedAt: data.osm3s.timestamp_osm_base,
    features,
  }) + '\n';
if (Buffer.byteLength(output) > 2 * 1024 * 1024)
  throw new Error('Campus map exceeds the two-MiB data budget.');
await writeFile(
  fileURLToPath(new URL('../src/offline/campus-map.json', import.meta.url)),
  output,
);
console.log(
  `Campus map: ${features.length} features, ${Buffer.byteLength(output)} bytes; source ${data.osm3s.timestamp_osm_base}.`,
);
